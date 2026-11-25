import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackgroundController } from '../background.js';

function createMockChrome({ initialStorage = {}, initialHistory = [], shouldFailDelete = false } = {}) {
  const storageData = { ...initialStorage };
  const historyItems = initialHistory.map((url) => ({ url }));
  const deletedUrls = [];
  let failDelete = shouldFailDelete;

  const chromeApi = {
    storage: {
      local: {
        async get(key) {
          return { [key]: storageData[key] };
        },
        async set(obj) {
          Object.assign(storageData, obj);
        }
      }
    },
    history: {
      onVisited: {
        addListener() {}
      },
      async search() {
        return [...historyItems];
      },
      async deleteUrl({ url }) {
        if (failDelete) {
          throw new Error('模拟删除失败');
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
        deletedUrls.push(url);
        for (let i = historyItems.length - 1; i >= 0; i -= 1) {
          if (historyItems[i].url === url) {
            historyItems.splice(i, 1);
          }
        }
      }
    },
    runtime: {
      onMessage: {
        addListener() {}
      }
    }
  };

  return {
    chromeApi,
    storageData,
    historyItems,
    deletedUrls,
    setFailDelete(value) {
      failDelete = value;
    }
  };
}

test('命中、不命中、总开关与规则开关', async () => {
  const mock = createMockChrome();
  let currentTime = new Date('2026-11-25T10:00:00');
  const controller = createBackgroundController({
    chromeApi: mock.chromeApi,
    now: () => currentTime
  });

  const addRes = await controller.handleMessage({
    type: 'addRule',
    pattern: '*://example.com/private/*'
  });
  assert.equal(addRes.ok, true);
  const ruleId = addRes.rule.id;

  // 不命中
  const miss = await controller.handleVisited({ url: 'https://example.com/public' });
  assert.equal(miss.matched, false);
  assert.equal(mock.deletedUrls.length, 0);

  // 命中
  const hit = await controller.handleVisited({ url: 'https://example.com/private/a' });
  assert.equal(hit.matched, true);
  assert.equal(hit.deleted, true);
  assert.equal(hit.ruleId, ruleId);
  assert.deepEqual(mock.deletedUrls, ['https://example.com/private/a']);

  // 规则单独暂停
  await controller.handleMessage({ type: 'toggleRule', id: ruleId, enabled: false });
  const pausedRuleHit = await controller.handleVisited({ url: 'https://example.com/private/b' });
  assert.equal(pausedRuleHit.matched, false);
  assert.equal(mock.deletedUrls.length, 1);

  // 恢复规则但关闭总开关
  await controller.handleMessage({ type: 'toggleRule', id: ruleId, enabled: true });
  await controller.handleMessage({ type: 'setGlobalEnabled', enabled: false });
  const globalDisabled = await controller.handleVisited({ url: 'https://example.com/private/c' });
  assert.equal(globalDisabled.skipped, 'disabled');
  assert.equal(mock.deletedUrls.length, 1);
});

test('重叠规则只删除一次且归属第一条启用规则', async () => {
  const mock = createMockChrome();
  const controller = createBackgroundController({
    chromeApi: mock.chromeApi,
    now: () => new Date('2026-11-25T11:00:00')
  });

  const r1 = await controller.handleMessage({ type: 'addRule', pattern: '*://*.example.com/*' });
  const r2 = await controller.handleMessage({ type: 'addRule', pattern: 'https://example.com/*' });

  const hit = await controller.handleVisited({ url: 'https://example.com/test' });
  assert.equal(hit.deleted, true);
  assert.equal(hit.ruleId, r1.rule.id);
  assert.equal(mock.deletedUrls.length, 1);

  const stateRes = await controller.handleMessage({ type: 'getState' });
  assert.equal(stateRes.state.stats.totalCleaned, 1);
  assert.equal(stateRes.state.rules.find((r) => r.id === r1.rule.id).cleanedCount, 1);
  assert.equal(stateRes.state.rules.find((r) => r.id === r2.rule.id).cleanedCount, 0);
});

test('删除失败不计入成功统计并记录错误', async () => {
  const mock = createMockChrome({ shouldFailDelete: true });
  const controller = createBackgroundController({
    chromeApi: mock.chromeApi,
    now: () => new Date('2026-11-25T12:00:00')
  });

  await controller.handleMessage({ type: 'addRule', pattern: '*://example.com/*' });
  const failRes = await controller.handleVisited({ url: 'https://example.com/fail' });
  assert.equal(failRes.matched, true);
  assert.equal(failRes.deleted, false);
  assert.match(failRes.error, /删除历史记录失败/);

  const stateRes = await controller.handleMessage({ type: 'getState' });
  assert.equal(stateRes.state.stats.totalCleaned, 0);
  assert.equal(stateRes.state.stats.todayCleaned, 0);
  assert.match(stateRes.lastError, /删除历史记录失败/);
});

test('并发访问事件串行处理不丢失计数', async () => {
  const mock = createMockChrome();
  const controller = createBackgroundController({
    chromeApi: mock.chromeApi,
    now: () => new Date('2026-11-25T13:00:00')
  });

  await controller.handleMessage({ type: 'addRule', pattern: '*://example.com/*' });

  await Promise.all([
    controller.handleVisited({ url: 'https://example.com/1' }),
    controller.handleVisited({ url: 'https://example.com/2' }),
    controller.handleVisited({ url: 'https://example.com/3' }),
    controller.handleVisited({ url: 'https://example.com/4' })
  ]);

  const stateRes = await controller.handleMessage({ type: 'getState' });
  assert.equal(stateRes.state.stats.totalCleaned, 4);
  assert.equal(stateRes.state.stats.todayCleaned, 4);
  assert.equal(stateRes.state.rules[0].cleanedCount, 4);
  assert.equal(mock.deletedUrls.length, 4);
});

test('持久化恢复、跨日切换、删除规则与统计重置', async () => {
  const mock = createMockChrome();
  let currentTime = new Date('2026-11-25T23:50:00');

  const controller1 = createBackgroundController({
    chromeApi: mock.chromeApi,
    now: () => currentTime
  });

  const added = await controller1.handleMessage({ type: 'addRule', pattern: '*://example.com/*' });
  await controller1.handleVisited({ url: 'https://example.com/night' });

  // 模拟 Service Worker 冷启动恢复，并跨入次日
  currentTime = new Date('2026-11-26T00:10:00');
  const controller2 = createBackgroundController({
    chromeApi: mock.chromeApi,
    now: () => currentTime
  });

  const day2State = await controller2.handleMessage({ type: 'getState' });
  assert.equal(day2State.state.stats.totalCleaned, 1);
  assert.equal(day2State.state.stats.todayCleaned, 0);
  assert.equal(day2State.state.rules.length, 1);
  assert.equal(day2State.state.rules[0].cleanedCount, 1);
  assert.equal(day2State.state.rules[0].todayCleaned, 0);
  assert.ok(day2State.state.rules[0].lastCleanedAt);

  await controller2.handleVisited({ url: 'https://example.com/morning' });

  // 删除规则保留全局累计
  await controller2.handleMessage({ type: 'deleteRule', id: added.rule.id });
  const afterDelete = await controller2.handleMessage({ type: 'getState' });
  assert.equal(afterDelete.state.rules.length, 0);
  assert.equal(afterDelete.state.stats.totalCleaned, 2);
  assert.equal(afterDelete.state.stats.todayCleaned, 1);

  // 添加新规则后重置统计，保留规则本身与清零规则明细
  await controller2.handleMessage({ type: 'addRule', pattern: '*://keep.com/*' });
  await controller2.handleVisited({ url: 'https://keep.com/item' });
  const resetRes = await controller2.handleMessage({ type: 'resetStats' });
  assert.equal(resetRes.state.rules.length, 1);
  assert.equal(resetRes.state.rules[0].cleanedCount, 0);
  assert.equal(resetRes.state.rules[0].todayCleaned, 0);
  assert.equal(resetRes.state.rules[0].lastCleanedAt, null);
  assert.equal(resetRes.state.stats.totalCleaned, 0);
  assert.equal(resetRes.state.stats.todayCleaned, 0);
  assert.equal(resetRes.state.stats.lastCleanedAt, null);
});

test('添加规则后立即扫描并删除匹配的历史记录并记录规则统计', async () => {
  const mock = createMockChrome({
    initialHistory: [
      'https://example.com/private/1',
      'https://example.com/private/2',
      'https://example.com/private/1',
      'https://example.com/public/3'
    ]
  });
  const controller = createBackgroundController({
    chromeApi: mock.chromeApi,
    now: () => new Date('2026-11-25T15:00:00')
  });

  const addRes = await controller.handleMessage({
    type: 'addRule',
    pattern: '*://example.com/private/*'
  });
  assert.equal(addRes.ok, true);
  assert.equal(addRes.cleanedExistingCount, 2);
  assert.deepEqual(mock.deletedUrls, [
    'https://example.com/private/1',
    'https://example.com/private/2'
  ]);
  assert.deepEqual(
    mock.historyItems.map((item) => item.url),
    ['https://example.com/public/3']
  );
  assert.equal(addRes.rule.cleanedCount, 2);
  assert.equal(addRes.rule.todayCleaned, 2);
  assert.equal(addRes.rule.lastCleanedAt, '2026-11-25T07:00:00.000Z');
  assert.equal(addRes.state.stats.totalCleaned, 2);
  assert.equal(addRes.state.stats.todayCleaned, 2);
});

test('总开关关闭时添加规则不立即删除现有历史记录', async () => {
  const mock = createMockChrome({
    initialHistory: ['https://example.com/private/1']
  });
  const controller = createBackgroundController({
    chromeApi: mock.chromeApi,
    now: () => new Date('2026-11-25T15:05:00')
  });

  await controller.handleMessage({ type: 'setGlobalEnabled', enabled: false });
  const addRes = await controller.handleMessage({
    type: 'addRule',
    pattern: '*://example.com/private/*'
  });
  assert.equal(addRes.ok, true);
  assert.equal(addRes.cleanedExistingCount, 0);
  assert.equal(mock.deletedUrls.length, 0);
  assert.equal(mock.historyItems.length, 1);
});

test('关闭立即清理选项后添加规则不删除现有历史记录', async () => {
  const mock = createMockChrome({
    initialHistory: ['https://example.com/private/1']
  });
  const controller = createBackgroundController({
    chromeApi: mock.chromeApi,
    now: () => new Date('2026-11-25T15:10:00')
  });

  const optRes = await controller.handleMessage({
    type: 'setCleanHistoryOnAdd',
    enabled: false
  });
  assert.equal(optRes.ok, true);
  assert.equal(optRes.state.cleanHistoryOnAdd, false);

  const addRes = await controller.handleMessage({
    type: 'addRule',
    pattern: '*://example.com/private/*'
  });
  assert.equal(addRes.ok, true);
  assert.equal(addRes.cleanedExistingCount, 0);
  assert.equal(mock.deletedUrls.length, 0);
  assert.equal(mock.historyItems.length, 1);

  // 后续新访问依然会被正常过滤删除
  const visitRes = await controller.handleVisited({ url: 'https://example.com/private/2' });
  assert.equal(visitRes.deleted, true);
  assert.deepEqual(mock.deletedUrls, ['https://example.com/private/2']);
});

test('设置项更新与过滤规则批量管理（全部启用、全部暂停、清空）', async () => {
  const mock = createMockChrome();
  const controller = createBackgroundController({
    chromeApi: mock.chromeApi,
    now: () => new Date('2026-11-25T16:30:00')
  });

  const settingsRes = await controller.handleMessage({
    type: 'updateSettings',
    settings: {
      cleanHistoryOnAdd: false,
      showQuickAdd: false,
      quickAddMode: 'subdomain'
    }
  });
  assert.equal(settingsRes.ok, true);
  assert.equal(settingsRes.state.cleanHistoryOnAdd, false);
  assert.equal(settingsRes.state.showQuickAdd, false);
  assert.equal(settingsRes.state.quickAddMode, 'subdomain');

  await controller.handleMessage({ type: 'addRule', pattern: '*://a.com/*' });
  await controller.handleMessage({ type: 'addRule', pattern: '*://b.com/*' });

  const pauseRes = await controller.handleMessage({ type: 'setAllRulesEnabled', enabled: false });
  assert.equal(pauseRes.ok, true);
  assert.equal(pauseRes.state.rules.every((r) => !r.enabled), true);

  const enableRes = await controller.handleMessage({ type: 'setAllRulesEnabled', enabled: true });
  assert.equal(enableRes.ok, true);
  assert.equal(enableRes.state.rules.every((r) => r.enabled), true);

  const clearRes = await controller.handleMessage({ type: 'clearAllRules' });
  assert.equal(clearRes.ok, true);
  assert.equal(clearRes.state.rules.length, 0);
});

test('导入规则支持去重、过滤无效项并按设置立即清理匹配历史', async () => {
  const mock = createMockChrome({
    initialHistory: ['https://a.com/1', 'https://b.com/2', 'https://c.com/3']
  });
  const controller = createBackgroundController({
    chromeApi: mock.chromeApi,
    now: () => new Date('2026-11-25T17:00:00')
  });

  await controller.handleMessage({ type: 'addRule', pattern: '*://a.com/*' });

  const importRes = await controller.handleMessage({
    type: 'importRules',
    items: [
      { pattern: 'https://A.com/*', enabled: true },
      { pattern: '*://a.com/*', enabled: true },
      { pattern: '*://b.com/*', enabled: true },
      { pattern: '*://c.com/*', enabled: false },
      { pattern: 'invalid-rule' }
    ]
  });
  assert.equal(importRes.ok, true);
  assert.equal(importRes.addedCount, 3);
  assert.equal(importRes.skippedDuplicate, 1);
  assert.equal(importRes.skippedInvalid, 1);
  // https://a.com/1 在 addRule 时已被清理，导入时仅启用规则 *://b.com/* 会立即清理 https://b.com/2
  assert.equal(importRes.cleanedExistingCount, 1);
  assert.deepEqual(mock.deletedUrls, ['https://a.com/1', 'https://b.com/2']);
  assert.equal(importRes.state.rules.find((r) => r.pattern === '*://*.c.com/*').enabled, false);
});
test('www.example.com 与 *.example.com 规范化及全链路去重', async () => {
  const mock = createMockChrome({
    initialStorage: {
      historyFilterState: {
        enabled: true,
        rules: [
          {
            id: 'old1',
            pattern: '*://www.example.com/*',
            enabled: false,
            cleanedCount: 2,
            todayCleaned: 1,
            lastCleanedAt: '2026-11-25T08:00:00.000Z'
          },
          {
            id: 'old2',
            pattern: '*://*.example.com/*',
            enabled: true,
            cleanedCount: 3,
            todayCleaned: 2,
            lastCleanedAt: '2026-11-25T09:00:00.000Z'
          }
        ],
        stats: {
          totalCleaned: 5,
          todayCleaned: 3,
          todayDate: '2026-11-25',
          lastCleanedAt: '2026-11-25T09:00:00.000Z'
        }
      }
    }
  });
  const controller = createBackgroundController({
    chromeApi: mock.chromeApi,
    now: () => new Date('2026-11-25T17:10:00')
  });

  // 加载旧存储时自动合并为一条 *://*.example.com/* 并累计计数
  const stateRes = await controller.handleMessage({ type: 'getState' });
  assert.equal(stateRes.state.rules.length, 1);
  assert.equal(stateRes.state.rules[0].pattern, '*://*.example.com/*');
  assert.equal(stateRes.state.rules[0].cleanedCount, 5);
  assert.equal(stateRes.state.rules[0].todayCleaned, 3);
  assert.equal(stateRes.state.rules[0].enabled, true);

  // 新增 *://www.example.com/* 或 *://example.com/* 时识别为重复规则并阻止
  const dupWwwAdd = await controller.handleMessage({
    type: 'addRule',
    pattern: '*://www.example.com/*'
  });
  assert.equal(dupWwwAdd.ok, false);
  assert.match(dupWwwAdd.error, /已存在相同的规则/);

  const dupApexAdd = await controller.handleMessage({
    type: 'addRule',
    pattern: '*://example.com/*'
  });
  assert.equal(dupApexAdd.ok, false);
  assert.match(dupApexAdd.error, /已存在相同的规则/);

  // 导入 *://other.com/*、*://www.other.com/* 与 *://*.other.com/* 时自动去重为一条
  const importRes = await controller.handleMessage({
    type: 'importRules',
    items: ['*://other.com/*', '*://www.other.com/*', '*://*.other.com/*']
  });
  assert.equal(importRes.ok, true);
  assert.equal(importRes.addedCount, 1);
  assert.equal(importRes.skippedDuplicate, 2);
  assert.equal(importRes.state.rules.some((r) => r.pattern === '*://*.other.com/*'), true);
  // 支持添加与编辑保存域名通配符规则 *://*gard.*/*
  const addWildcardRes = await controller.handleMessage({
    type: 'addRule',
    pattern: '*://*gard.com/*'
  });
  assert.equal(addWildcardRes.ok, true);
  const updateWildcardRes = await controller.handleMessage({
    type: 'updateRule',
    id: addWildcardRes.rule.id,
    pattern: '*://*gard.*/*'
  });
  assert.equal(updateWildcardRes.ok, true);
  assert.equal(updateWildcardRes.rule.pattern, '*://*gard.*/*');
});

test('匹配网页时图标变绿、总开关关闭时图标变灰', async () => {
  const iconByTab = new Map();
  let defaultIconPath = null;
  const mockTabs = [
    { id: 1, url: 'https://gmgard.moe/topic/1' },
    { id: 2, url: 'https://news.ycombinator.com/' }
  ];
  const mock = createMockChrome();
  mock.chromeApi.action = {
    async setIcon({ tabId, path }) {
      if (typeof tabId === 'number') {
        iconByTab.set(tabId, path[16]);
      } else {
        defaultIconPath = path[16];
      }
    }
  };
  mock.chromeApi.tabs = {
    async query() {
      return [...mockTabs];
    },
    async get(tabId) {
      return mockTabs.find((t) => t.id === tabId);
    }
  };

  const controller = createBackgroundController({
    chromeApi: mock.chromeApi,
    now: () => new Date('2026-11-25T17:35:00')
  });

  // 初始无规则且开关开启：默认蓝色图标
  await controller.syncAllIcons();
  assert.equal(defaultIconPath, 'icons/icon16.png');
  assert.equal(iconByTab.get(1), 'icons/icon16.png');
  assert.equal(iconByTab.get(2), 'icons/icon16.png');

  // 添加匹配规则后，匹配的标签页图标变为绿色，未匹配的保持默认蓝色
  await controller.handleMessage({ type: 'addRule', pattern: '*://*.*gard.*/*' });
  assert.equal(iconByTab.get(1), 'icons/icon16-green.png');
  assert.equal(iconByTab.get(2), 'icons/icon16.png');

  // 标签页 2 跳转到匹配网页时，图标变为绿色
  mockTabs[1].url = 'https://www.gmgard.moe/';
  await controller.refreshTabIconById(2);
  assert.equal(iconByTab.get(2), 'icons/icon16-green.png');

  // 关闭总开关后，全局及所有标签页图标变为灰色
  await controller.handleMessage({ type: 'setGlobalEnabled', enabled: false });
  assert.equal(defaultIconPath, 'icons/icon16-gray.png');
  assert.equal(iconByTab.get(1), 'icons/icon16-gray.png');
  assert.equal(iconByTab.get(2), 'icons/icon16-gray.png');

  // 重新开启总开关后，匹配的标签页恢复为绿色
  await controller.handleMessage({ type: 'setGlobalEnabled', enabled: true });
  assert.equal(defaultIconPath, 'icons/icon16.png');
  assert.equal(iconByTab.get(1), 'icons/icon16-green.png');
});

test('标签页不存在时通过回调消费 runtime.lastError 而不抛出未处理异常', async () => {
  const mock = createMockChrome();
  let lastErrorReadCount = 0;
  let activeLastError = null;

  Object.defineProperty(mock.chromeApi.runtime, 'lastError', {
    get() {
      if (activeLastError) {
        lastErrorReadCount += 1;
      }
      return activeLastError;
    }
  });

  mock.chromeApi.action = {
    setIcon(details, callback) {
      if (typeof details.tabId === 'number') {
        activeLastError = { message: `No tab with id: ${details.tabId}.` };
        callback?.();
        activeLastError = null;
        return;
      }
      callback?.();
    }
  };

  mock.chromeApi.tabs = {
    query(_queryInfo, callback) {
      callback?.([{ id: 536131605, url: 'https://example.com/' }]);
    },
    get(tabId, callback) {
      activeLastError = { message: `No tab with id: ${tabId}.` };
      callback?.(undefined);
      activeLastError = null;
    }
  };

  const controller = createBackgroundController({
    chromeApi: mock.chromeApi,
    now: () => new Date('2026-11-25T19:10:00')
  });

  await controller.syncAllIcons();
  await controller.refreshTabIconById(536131605);
  await controller.refreshTabIcon({ id: -1, url: 'https://example.com/' });

  assert.equal(lastErrorReadCount, 2);
});
