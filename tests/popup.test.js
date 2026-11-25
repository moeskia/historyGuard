import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBackgroundController } from '../background.js';
import { createInitialState } from '../lib/state.js';

const html = await readFile(new URL('../popup.html', import.meta.url), 'utf8');
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));
let moduleId = 0;

class MockElement {
  constructor(tagName, document) {
    this.tagName = tagName;
    this.document = document;
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.className = '';
    this.dataset = {};
    this.style = {};
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.replaceCount = 0;
    this.clickCount = 0;
    this.text = '';
    this.classList = {
      contains: (name) => this.className.split(/\s+/).includes(name),
      toggle: (name, force) => {
        const names = new Set(this.className.split(/\s+/).filter(Boolean));
        const enabled = force === undefined ? !names.has(name) : force;
        if (enabled) names.add(name);
        else names.delete(name);
        this.className = [...names].join(' ');
        return enabled;
      },
      add: (name) => this.classList.toggle(name, true),
      remove: (name) => this.classList.toggle(name, false)
    };
  }
  set textContent(value) {
    this.text = String(value);
    for (const child of this.children) child.parentNode = null;
    this.children = [];
  }
  get textContent() {
    return this.text + this.children.map((child) => child.textContent).join('');
  }
  append(...nodes) {
    for (const node of nodes) {
      if (node.tagName === '#fragment') {
        this.append(...node.children.slice());
      } else {
        node.remove();
        node.parentNode = this;
        this.children.push(node);
      }
    }
  }
  appendChild(node) {
    this.append(node);
    return node;
  }
  replaceChildren(...nodes) {
    this.replaceCount += 1;
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.text = '';
    this.append(...nodes);
  }
  remove() {
    if (this.parentNode) {
      const siblings = this.parentNode.children;
      siblings.splice(siblings.indexOf(this), 1);
      this.parentNode = null;
    }
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  getAttribute(name) {
    return this.attributes.get(name);
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  async dispatch(type, detail = {}) {
    const event = { preventDefault() {}, ...detail };
    await Promise.all((this.listeners.get(type) || []).map((listener) => listener(event)));
  }
  click() {
    this.clickCount += 1;
    return this.dispatch('click');
  }
  focus() {
    this.document.activeElement = this;
  }
}

function createState() {
  const state = createInitialState(new Date('2026-11-25T15:00:00'));
  state.rules = ['example', 'other'].map((host, i) => ({
    id: `r${i + 1}`,
    pattern: `*://*.${host}.test/*`,
    enabled: i === 0,
    cleanedCount: 3 - i,
    todayCleaned: 2 - i,
    lastCleanedAt: new Date('2026-11-25T14:00:00').toISOString(),
    createdAt: 1
  }));
  state.stats.totalCleaned = 5;
  state.stats.todayCleaned = 3;
  state.stats.lastCleanedAt = state.rules[0].lastCleanedAt;
  return state;
}

async function mountPopup(
  t,
  state = createState(),
  activeTabUrl = 'https://example.test/private/1',
  uiLanguage = 'zh-CN'
) {
  const elements = new Map();
  const parsedElements = [];
  const created = [];
  const dots = [];
  const document = {
    documentElement: { lang: 'en' },
    title: 'HistoryGuard',
    getElementById: (id) => elements.get(id) || null,
    createElement(tag) {
      const element = new MockElement(tag, document);
      created.push(element);
      return element;
    },
    createElementNS: (_namespace, tag) => document.createElement(tag),
    createDocumentFragment: () => new MockElement('#fragment', document),
    querySelectorAll(selector) {
      if (selector === '[data-stats-page]') {
        return dots;
      }
      const attrMatch = /^\[([a-z0-9-]+)\]$/i.exec(selector);
      if (attrMatch) {
        const attrName = attrMatch[1];
        return parsedElements.filter((el) => el.attributes.has(attrName));
      }
      return [];
    }
  };
  document.body = document.createElement('body');
  for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
    const attrsText = match[2];
    const id = /\bid="([^"]+)"/.exec(attrsText)?.[1];
    const hasI18n = /\bdata-i18n(?:-placeholder|-aria-label|-title)?="([^"]+)"/.test(attrsText);
    const statsPage = /\bdata-stats-page="([^"]+)"/.exec(attrsText)?.[1];
    if (!id && !hasI18n && statsPage === undefined) {
      continue;
    }
    const element = document.createElement(match[1]);
    element.className = /\bclass="([^"]*)"/.exec(attrsText)?.[1] || '';
    for (const attrMatch of attrsText.matchAll(/\b(data-[a-z0-9-]+)="([^"]*)"/gi)) {
      element.setAttribute(attrMatch[1], attrMatch[2]);
    }
    if (id) {
      element.id = id;
      elements.set(id, element);
    }
    if (statsPage !== undefined) {
      element.dataset.statsPage = statsPage;
      dots.push(element);
    }
    parsedElements.push(element);
  }
  let storedState = structuredClone(state);
  const messages = [];
  const chromeApi = {
    i18n: {
      getUILanguage: () => uiLanguage
    },
    storage: { local: {
      async get(key) { return { [key]: structuredClone(storedState) }; },
      async set(data) { storedState = structuredClone(data.historyFilterState); }
    } },
    history: {
      async search() { return []; },
      async deleteUrl() {}
    },
    tabs: { async query() { return [{ id: 1, url: activeTabUrl }]; } },
    runtime: {
      async sendMessage(message) {
        messages.push(structuredClone(message));
        return structuredClone(await controller.handleMessage(message));
      }
    }
  };
  const controller = createBackgroundController({
    chromeApi,
    now: () => new Date('2026-11-25T15:00:00')
  });
  const originals = {
    document: globalThis.document,
    chrome: globalThis.chrome,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    setTimeout: globalThis.setTimeout
  };
  const OriginalFormatter = Intl.DateTimeFormat;
  let formatterCount = 0;
  const timers = [];
  const frames = new Set();
  let markReady;
  const ready = new Promise((resolve) => { markReady = resolve; });
  t.after(() => {
    timers.forEach(clearTimeout);
    frames.forEach(clearImmediate);
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
    Intl.DateTimeFormat = OriginalFormatter;
  });
  globalThis.document = document;
  globalThis.chrome = chromeApi;
  globalThis.requestAnimationFrame = (callback) => {
    const frame = setImmediate(() => {
      frames.delete(frame);
      callback();
      if (document.body.classList.contains('ready')) markReady();
    });
    frames.add(frame);
    return frame;
  };
  globalThis.setTimeout = (callback, delay) => {
    const timer = originals.setTimeout(callback, delay);
    timers.push(timer);
    return timer;
  };
  Intl.DateTimeFormat = new Proxy(OriginalFormatter, {
    construct(target, args) {
      formatterCount += 1;
      return new target(...args);
    }
  });
  const url = new URL('../popup.js', import.meta.url);
  url.search = `test=${moduleId++}`;
  await import(url.href);
  await ready;
  assert.equal(document.body.classList.contains('ready'), true);
  const get = (id) => elements.get(id);
  const fire = async (element, type = 'click', detail = {}) => {
    await (typeof element === 'string' ? get(element) : element).dispatch(type, detail);
    await nextTurn();
  };
  return { document, get, fire, dots, created, messages, controller, formatterCount: () => formatterCount };
}

function findElement(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}

const button = (root, text) => findElement(root, (element) => element.tagName === 'button' && element.textContent === text);
const editInput = (root) => findElement(root, (element) => element.className === 'rule-edit-input');

test('初次仅渲染规则，隐藏页按需更新，重复切换不重建且复用日期格式化器', async (t) => {
  const ui = await mountPopup(t);
  assert.equal(ui.get('globalEnabledToggle').checked, true);
  assert.equal(ui.get('rulesList').children.length, 2);
  assert.equal(ui.get('rulesList').replaceCount, 1);
  assert.equal(ui.get('ruleStatsList').replaceCount, 0);
  assert.equal(ui.get('statsDonutSvg').replaceCount, 0);
  for (const id of ['ruleCountBadge', 'statsRuleCountBadge', 'settingsRuleCountBadge']) {
    assert.equal(ui.get(id).textContent, '2 条');
  }
  await ui.fire('tabStatsBtn');
  assert.equal(ui.get('ruleStatsList').replaceCount, 1);
  assert.equal(ui.get('ruleStatsList').children.length, 2);
  assert.equal(ui.get('totalCleanedValue').textContent, '5');
  assert.equal(ui.get('activeRulesValue').textContent, '1 / 2 条');
  assert.equal(ui.get('statsDonutSvg').replaceCount, 1);
  assert.equal(ui.get('statsChartLegend').replaceCount, 1);
  await ui.fire('statsNextPageBtn');
  assert.equal(ui.get('statsChartView').classList.contains('hidden'), true);
  assert.equal(ui.dots[1].getAttribute('aria-current'), 'true');
  await ui.fire('tabRulesBtn');
  await ui.fire('tabStatsBtn');
  assert.equal(ui.get('ruleStatsList').replaceCount, 1);
  assert.equal(ui.get('rulesList').replaceCount, 1);
  await ui.fire('tabRulesBtn');
  await ui.controller.handleVisited({ url: 'https://example.test/new' });
  ui.get('globalEnabledToggle').checked = false;
  await ui.fire('globalEnabledToggle', 'change');
  assert.match(ui.get('globalStatusText').textContent, /已暂停/);
  assert.equal(ui.get('ruleStatsList').replaceCount, 1);
  await ui.fire('tabStatsBtn');
  assert.equal(ui.get('ruleStatsList').replaceCount, 2);
  assert.equal(ui.get('totalCleanedValue').textContent, '6');
  assert.equal(ui.get('todayCleanedValue').textContent, '4');
  assert.equal(ui.formatterCount(), 1);
});

test('编辑和取消只刷新规则，切换保留草稿，Enter 保存及 Esc 取消保持焦点行为', async (t) => {
  const ui = await mountPopup(t);
  await ui.fire('tabStatsBtn');
  await ui.fire('tabRulesBtn');
  const list = ui.get('rulesList');
  await ui.fire(button(list, '编辑'));
  let input = editInput(list);
  assert.equal(ui.document.activeElement, input);
  assert.equal(ui.get('ruleStatsList').replaceCount, 1);
  input.value = '*://changed.test/private/*';
  await ui.fire('tabStatsBtn');
  await ui.fire('tabRulesBtn');
  assert.equal(editInput(list), input);
  assert.equal(input.value, '*://changed.test/private/*');
  await ui.fire(input, 'keydown', { key: 'Escape' });
  assert.equal(editInput(list), null);
  assert.equal(ui.get('ruleStatsList').replaceCount, 1);
  await ui.fire(button(list, '编辑'));
  input = editInput(list);
  input.value = '*://changed.test/private/*';
  let prevented = false;
  await ui.fire(input, 'keydown', { key: 'Enter', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(editInput(list), null);
  assert.equal(ui.messages.filter((message) => message.type === 'updateRule').length, 1);
  assert.equal(ui.get('ruleStatsList').replaceCount, 1);
  await ui.fire('tabStatsBtn');
  assert.equal(ui.get('ruleStatsList').replaceCount, 2);
  assert.match(ui.get('ruleStatsList').textContent, /changed\.test/);
  assert.equal(ui.formatterCount(), 1);
});

test('设置和快捷添加使用最新状态，清空规则保留全局累计及空列表显示', async (t) => {
  const ui = await mountPopup(t);
  await ui.fire('tabSettingsBtn');
  assert.equal(ui.get('cleanHistoryOnAddToggle').checked, true);
  ui.get('showQuickAddToggle').checked = false;
  await ui.fire('showQuickAddToggle', 'change');
  assert.equal(ui.get('rulesList').replaceCount, 1);
  await ui.fire('tabRulesBtn');
  assert.equal(ui.get('quickAddCard').classList.contains('hidden'), true);
  await ui.fire('tabSettingsBtn');
  ui.get('showQuickAddToggle').checked = true;
  await ui.fire('showQuickAddToggle', 'change');
  ui.get('quickAddModeSelect').value = 'scheme';
  await ui.fire('quickAddModeSelect', 'change');
  await ui.fire('tabRulesBtn');
  assert.equal(ui.get('quickAddCard').classList.contains('hidden'), false);
  assert.equal(ui.get('currentTabInput').value, 'https://*.example.test/*');
  await ui.fire('tabSettingsBtn');
  await ui.fire('clearAllRulesBtn');
  await ui.fire('cancelClearRulesBtn');
  assert.equal(ui.get('clearRulesConfirmGroup').classList.contains('hidden'), true);
  await ui.fire('clearAllRulesBtn');
  await ui.fire('confirmClearRulesBtn');
  assert.equal(ui.get('settingsRuleCountBadge').textContent, '0 条');
  assert.equal(ui.get('exportRulesBtn').disabled, true);
  await ui.fire('tabRulesBtn');
  assert.equal(ui.get('rulesList').children.length, 0);
  assert.equal(ui.get('emptyRulesText').classList.contains('hidden'), false);
  await ui.fire('tabStatsBtn');
  assert.equal(ui.get('totalCleanedValue').textContent, '5');
  assert.equal(ui.get('ruleStatsList').children.length, 0);
  assert.match(ui.get('statsChartLegend').textContent, /已删除规则累计/);
});

test('快捷新增、导入去重、导出及批量启停仍可用，隐藏列表在切换后更新', async (t) => {
  const state = createInitialState(new Date('2026-11-25T15:00:00'));
  const ui = await mountPopup(t, state);
  await ui.fire('addCurrentTabBtn');
  ui.get('newRuleInput').value = '*://extra.test/private/*';
  await ui.fire('addRuleForm', 'submit');
  assert.equal(ui.get('rulesList').children.length, 2);
  assert.equal(ui.get('newRuleInput').value, '');
  await ui.fire('tabSettingsBtn');
  await ui.fire('importRulesBtn');
  assert.equal(ui.get('importRulesFileInput').clickCount, 1);
  ui.get('importRulesFileInput').files = [{ async text() {
    return JSON.stringify({ rules: ['*://imported.test/*', '*://example.test/*', 'invalid-rule'] });
  } }];
  await ui.fire('importRulesFileInput', 'change');
  assert.equal(ui.get('settingsRuleCountBadge').textContent, '3 条');
  assert.equal(ui.get('rulesList').children.length, 2);
  assert.match(ui.get('infoText').textContent, /已导入 1 条规则.*跳过重复 1 条.*忽略无效 1 条/);
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const blobs = [];
  const revoked = [];
  t.after(() => { URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; });
  URL.createObjectURL = (blob) => { blobs.push(blob); return 'blob:export-test'; };
  URL.revokeObjectURL = (url) => revoked.push(url);
  await ui.fire('exportRulesBtn');
  const exported = JSON.parse(await blobs[0].text());
  assert.equal(exported.version, 1);
  assert.equal(exported.rules.length, 3);
  assert.deepEqual(revoked, ['blob:export-test']);
  assert.equal(ui.created.find((element) => element.tagName === 'a').clickCount, 1);
  await ui.fire('pauseAllRulesBtn');
  await ui.fire('tabRulesBtn');
  assert.equal(ui.get('rulesList').children.length, 3);
  assert.ok(ui.get('rulesList').children.every((element) => element.classList.contains('paused')));
  await ui.fire('tabSettingsBtn');
  await ui.fire('enableAllRulesBtn');
  await ui.fire('tabRulesBtn');
  assert.ok(ui.get('rulesList').children.every((element) => !element.classList.contains('paused')));
  await ui.fire(button(ui.get('rulesList'), '删除'));
  assert.equal(ui.get('rulesList').children.length, 2);
});

test('不支持的页面禁用快捷添加，校验失败不重建列表，JSON 错误正常提示', async (t) => {
  const ui = await mountPopup(t, createState(), 'chrome://extensions/');
  assert.equal(ui.get('currentTabInput').disabled, true);
  assert.equal(ui.get('addCurrentTabBtn').disabled, true);
  ui.get('newRuleInput').value = '*://example.test/*';
  await ui.fire('addRuleForm', 'submit');
  assert.match(ui.get('errorText').textContent, /已存在相同的规则/);
  assert.equal(ui.get('rulesList').replaceCount, 1);
  assert.equal(ui.get('ruleStatsList').replaceCount, 0);
  await ui.fire('dismissErrorBtn');
  assert.equal(ui.get('errorBanner').classList.contains('hidden'), true);
  await ui.fire('tabSettingsBtn');
  ui.get('importRulesFileInput').files = [{ async text() { return '{invalid json'; } }];
  await ui.fire('importRulesFileInput', 'change');
  assert.match(ui.get('errorText').textContent, /JSON 文件格式无效/);
});

test('支持在设置中切换语言并实时本地化界面、错误提示与日期格式，auto 跟随浏览器语言', async (t) => {
  const ui = await mountPopup(t, createState(), 'chrome://extensions/', 'ja-JP');
  assert.equal(ui.document.documentElement.lang, 'ja');
  assert.equal(ui.get('tabRulesBtn').textContent, 'ルール管理');
  assert.equal(ui.get('ruleCountBadge').textContent, '2 件');

  await ui.fire('tabSettingsBtn');
  assert.equal(ui.get('languageSelect').value, 'auto');
  ui.get('languageSelect').value = 'en';
  await ui.fire('languageSelect', 'change');

  assert.equal(ui.document.documentElement.lang, 'en');
  assert.equal(ui.get('tabRulesBtn').textContent, 'Rules');
  assert.equal(ui.get('tabStatsBtn').textContent, 'Stats');
  assert.equal(ui.get('tabSettingsBtn').textContent, 'Settings');
  assert.equal(ui.get('settingsRuleCountBadge').textContent, '2 rules');
  assert.match(ui.get('globalStatusText').textContent, /Active: automatically filtering/);

  await ui.fire('tabRulesBtn');
  assert.equal(ui.get('currentTabInput').placeholder, 'Quick add is not supported on this page');
  assert.match(ui.get('currentTabHint').textContent, /chrome:\/\/ pages are not supported/);

  ui.get('newRuleInput').value = '*://example.test/*';
  await ui.fire('addRuleForm', 'submit');
  assert.match(ui.get('errorText').textContent, /An identical rule already exists/);

  await ui.fire('tabStatsBtn');
  assert.equal(ui.get('activeRulesValue').textContent, '1 / 2 rules');
  assert.equal(ui.formatterCount(), 1);
});
