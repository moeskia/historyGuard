import { findFirstMatchingRule } from './lib/rules.js';
import {
  STORAGE_KEY,
  addRule,
  clearAllRules,
  deleteRule,
  importRules,
  normalizeState,
  recordCleanupSuccess,
  resetStats,
  rolloverTodayStats,
  setAllRulesEnabled,
  setCleanHistoryOnAdd,
  setGlobalEnabled,
  toggleRule,
  updateRule,
  updateSettings
} from './lib/state.js';
const ICON_PATHS = {
  default: {
    16: 'icons/icon16.png',
    32: 'icons/icon32.png',
    48: 'icons/icon48.png'
  },
  matched: {
    16: 'icons/icon16-green.png',
    32: 'icons/icon32-green.png',
    48: 'icons/icon48-green.png'
  },
  disabled: {
    16: 'icons/icon16-gray.png',
    32: 'icons/icon32-gray.png',
    48: 'icons/icon48-gray.png'
  }
};
export function createBackgroundController({ chromeApi, now = () => new Date() }) {
  let cachedState = null;
  let lastError = null;
  let queue = Promise.resolve();
  function enqueue(task) {
    const next = queue.then(task, task);
    queue = next.catch(() => {});
    return next;
  }

  async function loadState() {
    const currentNow = now();
    if (!cachedState) {
      const stored = await chromeApi.storage.local.get(STORAGE_KEY);
      cachedState = normalizeState(stored?.[STORAGE_KEY], currentNow);
      return cachedState;
    }

    const rolled = rolloverTodayStats(cachedState, currentNow);
    if (rolled !== cachedState) {
      cachedState = rolled;
      await saveState(cachedState);
    }
    return cachedState;
  }

  async function saveState(nextState) {
    await chromeApi.storage.local.set({ [STORAGE_KEY]: nextState });
    cachedState = nextState;
  }

  function resolveIconPathForUrl(state, url) {
    if (!state.enabled) {
      return ICON_PATHS.disabled;
    }
    if (typeof url === 'string' && findFirstMatchingRule(state.rules, url)) {
      return ICON_PATHS.matched;
    }
    return ICON_PATHS.default;
  }

  function callChromeApi(target, method, ...args) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let ret;
      try {
        ret = target[method](...args, (result) => {
          if (settled) {
            return;
          }
          settled = true;
          const err = chromeApi.runtime?.lastError;
          if (err) {
            reject(new Error(err.message || String(err)));
            return;
          }
          resolve(result);
        });
      } catch (err) {
        if (!settled) {
          settled = true;
          reject(err);
        }
        return;
      }

      if (ret && typeof ret.then === 'function') {
        ret.then(
          (result) => {
            if (settled) {
              return;
            }
            settled = true;
            void chromeApi.runtime?.lastError;
            resolve(result);
          },
          (err) => {
            if (settled) {
              return;
            }
            settled = true;
            void chromeApi.runtime?.lastError;
            reject(err);
          }
        );
      }
    });
  }

  async function setTabIcon(state, tab) {
    if (typeof chromeApi.action?.setIcon !== 'function' || typeof tab?.id !== 'number' || tab.id < 0) {
      return;
    }
    const path = resolveIconPathForUrl(state, tab.url);
    try {
      await callChromeApi(chromeApi.action, 'setIcon', { tabId: tab.id, path });
    } catch {
      // 标签页已关闭等瞬态异常忽略
    }
  }

  async function refreshAllTabIcons(state) {
    if (typeof chromeApi.action?.setIcon !== 'function') {
      return;
    }
    const defaultPath = state.enabled ? ICON_PATHS.default : ICON_PATHS.disabled;
    try {
      await callChromeApi(chromeApi.action, 'setIcon', { path: defaultPath });
    } catch {
      // 忽略异常
    }
    if (typeof chromeApi.tabs?.query !== 'function') {
      return;
    }
    try {
      const tabs = await callChromeApi(chromeApi.tabs, 'query', {});
      await Promise.all((tabs || []).map((tab) => setTabIcon(state, tab)));
    } catch {
      // 忽略异常
    }
  }

  async function refreshTabIcon(tab) {
    if (!tab || typeof tab.id !== 'number' || tab.id < 0) {
      return;
    }
    const state = await enqueue(() => loadState());
    await setTabIcon(state, tab);
  }

  async function refreshTabIconById(tabId) {
    if (typeof tabId !== 'number' || tabId < 0 || typeof chromeApi.tabs?.get !== 'function') {
      return;
    }
    try {
      const tab = await callChromeApi(chromeApi.tabs, 'get', tabId);
      await refreshTabIcon(tab);
    } catch {
      // 标签页不存在或已关闭
    }
  }
  async function cleanExistingHistoryForRules(initialState, rulesToMatch) {
    if (!initialState.enabled || typeof chromeApi.history?.search !== 'function') {
      return { state: initialState, cleanedExistingCount: 0 };
    }

    let items;
    try {
      items = await chromeApi.history.search({ text: '', startTime: 0, maxResults: 0 });
    } catch (err) {
      lastError = err?.message ? `扫描历史记录失败：${err.message}` : '扫描历史记录失败';
      return { state: initialState, cleanedExistingCount: 0 };
    }

    const matchedByUrl = new Map();
    for (const item of items || []) {
      if (item && typeof item.url === 'string' && !matchedByUrl.has(item.url)) {
        const matchedRule = findFirstMatchingRule(rulesToMatch, item.url);
        if (matchedRule) {
          matchedByUrl.set(item.url, matchedRule);
        }
      }
    }

    let nextState = initialState;
    let cleanedExistingCount = 0;
    for (const [url, matchedRule] of matchedByUrl.entries()) {
      try {
        await chromeApi.history.deleteUrl({ url });
        nextState = recordCleanupSuccess(nextState, matchedRule.id, now());
        cleanedExistingCount += 1;
        lastError = null;
      } catch (err) {
        lastError = err?.message ? `删除历史记录失败：${err.message}` : '删除历史记录失败';
      }
    }

    return { state: nextState, cleanedExistingCount };
  }
  async function handleVisited(historyItem) {
    if (!historyItem || typeof historyItem.url !== 'string') {
      return { matched: false, skipped: 'invalid' };
    }

    return enqueue(async () => {
      const state = await loadState();
      if (!state.enabled) {
        return { matched: false, skipped: 'disabled' };
      }

      const matchedRule = findFirstMatchingRule(state.rules, historyItem.url);
      if (!matchedRule) {
        return { matched: false };
      }

      try {
        await chromeApi.history.deleteUrl({ url: historyItem.url });
      } catch (err) {
        lastError = err?.message ? `删除历史记录失败：${err.message}` : '删除历史记录失败';
        return { matched: true, deleted: false, error: lastError };
      }

      const nextState = recordCleanupSuccess(state, matchedRule.id, now());
      await saveState(nextState);
      lastError = null;
      return { matched: true, deleted: true, ruleId: matchedRule.id };
    });
  }

  async function handleMessage(message) {
    if (!message || typeof message.type !== 'string') {
      return { ok: false, error: '无效的消息格式' };
    }

    return enqueue(async () => {
      const state = await loadState();

      switch (message.type) {
        case 'getState': {
          return { ok: true, state, lastError };
        }
        case 'setGlobalEnabled': {
          const nextState = setGlobalEnabled(state, message.enabled);
          await saveState(nextState);
          await refreshAllTabIcons(nextState);
          return { ok: true, state: nextState, lastError };
        }
        case 'setCleanHistoryOnAdd': {
          const nextState = setCleanHistoryOnAdd(state, message.enabled);
          await saveState(nextState);
          return { ok: true, state: nextState, lastError };
        }
        case 'updateSettings': {
          const nextState = updateSettings(state, message.settings);
          await saveState(nextState);
          return { ok: true, state: nextState, lastError };
        }
        case 'setAllRulesEnabled': {
          const nextState = setAllRulesEnabled(state, message.enabled);
          await saveState(nextState);
          await refreshAllTabIcons(nextState);
          return { ok: true, state: nextState, lastError };
        }
        case 'clearAllRules': {
          const nextState = clearAllRules(state);
          await saveState(nextState);
          await refreshAllTabIcons(nextState);
          return { ok: true, state: nextState, lastError };
        }
        case 'importRules': {
          const res = importRules(state, message.items, now());
          if (!res.ok) {
            return res;
          }
          const enabledAdded = res.addedRules.filter((rule) => rule.enabled);
          const cleaned =
            res.state.cleanHistoryOnAdd && enabledAdded.length > 0
              ? await cleanExistingHistoryForRules(res.state, enabledAdded)
              : { state: res.state, cleanedExistingCount: 0 };
          await saveState(cleaned.state);
          await refreshAllTabIcons(cleaned.state);
          return {
            ok: true,
            state: cleaned.state,
            addedCount: res.addedCount,
            skippedDuplicate: res.skippedDuplicate,
            skippedInvalid: res.skippedInvalid,
            cleanedExistingCount: cleaned.cleanedExistingCount,
            lastError
          };
        }
        case 'addRule': {
          const res = addRule(state, message.pattern, now());
          if (!res.ok) {
            return res;
          }
          const shouldCleanExisting =
            typeof message.cleanExisting === 'boolean'
              ? message.cleanExisting
              : res.state.cleanHistoryOnAdd;
          const cleaned = shouldCleanExisting
            ? await cleanExistingHistoryForRules(res.state, [res.rule])
            : { state: res.state, cleanedExistingCount: 0 };
          await saveState(cleaned.state);
          await refreshAllTabIcons(cleaned.state);
          const updatedRule = cleaned.state.rules.find((r) => r.id === res.rule.id) || res.rule;
          return {
            ok: true,
            state: cleaned.state,
            rule: updatedRule,
            cleanedExistingCount: cleaned.cleanedExistingCount,
            lastError
          };
        }
        case 'updateRule': {
          const res = updateRule(state, message.id, message.pattern);
          if (!res.ok) {
            return res;
          }
          await saveState(res.state);
          await refreshAllTabIcons(res.state);
          return { ok: true, state: res.state, rule: res.rule, lastError };
        }
        case 'toggleRule': {
          const res = toggleRule(state, message.id, message.enabled);
          if (!res.ok) {
            return res;
          }
          await saveState(res.state);
          await refreshAllTabIcons(res.state);
          return { ok: true, state: res.state, lastError };
        }
        case 'deleteRule': {
          const res = deleteRule(state, message.id);
          if (!res.ok) {
            return res;
          }
          await saveState(res.state);
          await refreshAllTabIcons(res.state);
          return { ok: true, state: res.state, lastError };
        }
        case 'resetStats': {
          const nextState = resetStats(state, now());
          await saveState(nextState);
          lastError = null;
          return { ok: true, state: nextState, lastError };
        }
        case 'clearError': {
          lastError = null;
          return { ok: true, state, lastError };
        }
        default:
          return { ok: false, error: `未知操作：${message.type}` };
      }
    });
  }

  function syncAllIcons() {
    return enqueue(async () => {
      const state = await loadState();
      await refreshAllTabIcons(state);
    });
  }

  function register() {
    chromeApi.history.onVisited.addListener((historyItem) => {
      void handleVisited(historyItem);
    });

    chromeApi.tabs?.onActivated?.addListener((activeInfo) => {
      if (activeInfo && typeof activeInfo.tabId === 'number') {
        void refreshTabIconById(activeInfo.tabId);
      }
    });

    chromeApi.tabs?.onUpdated?.addListener((_tabId, changeInfo, tab) => {
      if (changeInfo?.url || changeInfo?.status === 'loading' || changeInfo?.status === 'complete') {
        void refreshTabIcon(tab);
      }
    });

    chromeApi.runtime?.onStartup?.addListener(() => {
      void syncAllIcons();
    });

    chromeApi.runtime?.onInstalled?.addListener(() => {
      void syncAllIcons();
    });

    chromeApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      handleMessage(message)
        .then((res) => sendResponse(res))
        .catch((err) => {
          sendResponse({
            ok: false,
            error: err?.message || '后台处理失败'
          });
        });
      return true;
    });

    void syncAllIcons();
  }

  return {
    register,
    handleVisited,
    handleMessage,
    refreshTabIcon,
    refreshTabIconById,
    syncAllIcons
  };
}

if (typeof chrome !== 'undefined' && chrome.history && chrome.storage && chrome.runtime) {
  const controller = createBackgroundController({ chromeApi: chrome });
  controller.register();
}
