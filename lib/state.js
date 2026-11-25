import { parseRulePattern } from './rules.js';

export const STORAGE_KEY = 'historyFilterState';

/**
 * 返回本地时区的 YYYY-MM-DD 日期键，用于今日统计跨日重置。
 */
export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const QUICK_ADD_MODES = new Set(['host', 'subdomain', 'scheme']);

export function createInitialState(now = new Date()) {
  return {
    enabled: true,
    cleanHistoryOnAdd: true,
    showQuickAdd: true,
    quickAddMode: 'host',
    rules: [],
    stats: {
      totalCleaned: 0,
      todayCleaned: 0,
      todayDate: getLocalDateKey(now),
      lastCleanedAt: null
    }
  };
}

export function rolloverTodayStats(state, now = new Date()) {
  const todayKey = getLocalDateKey(now);
  if (state.stats.todayDate === todayKey) {
    return state;
  }
  return {
    ...state,
    rules: state.rules.map((rule) => ({
      ...rule,
      todayCleaned: 0
    })),
    stats: {
      ...state.stats,
      todayCleaned: 0,
      todayDate: todayKey
    }
  };
}

export function normalizeState(rawState, now = new Date()) {
  const base = createInitialState(now);
  if (!rawState || typeof rawState !== 'object') {
    return base;
  }

  const rawStats = rawState.stats && typeof rawState.stats === 'object' ? rawState.stats : {};
  const todayKey = getLocalDateKey(now);
  const isSameDay = rawStats.todayDate === todayKey;
  const ruleMap = new Map();
  if (Array.isArray(rawState.rules)) {
    for (const item of rawState.rules) {
      if (!item || typeof item.id !== 'string' || typeof item.pattern !== 'string') {
        continue;
      }
      const parsed = parseRulePattern(item.pattern);
      const normalizedPattern = parsed.ok ? parsed.rule.normalized : item.pattern;
      const cleanedCount =
        Number.isFinite(item.cleanedCount) && item.cleanedCount >= 0 ? item.cleanedCount : 0;
      const todayCleaned =
        isSameDay && Number.isFinite(item.todayCleaned) && item.todayCleaned >= 0
          ? item.todayCleaned
          : 0;
      const lastCleanedAt = typeof item.lastCleanedAt === 'string' ? item.lastCleanedAt : null;

      const existing = ruleMap.get(normalizedPattern);
      if (existing) {
        existing.enabled = existing.enabled || item.enabled !== false;
        existing.cleanedCount += cleanedCount;
        existing.todayCleaned += todayCleaned;
        if (lastCleanedAt && (!existing.lastCleanedAt || lastCleanedAt > existing.lastCleanedAt)) {
          existing.lastCleanedAt = lastCleanedAt;
        }
        continue;
      }

      ruleMap.set(normalizedPattern, {
        id: item.id,
        pattern: normalizedPattern,
        enabled: item.enabled !== false,
        cleanedCount,
        todayCleaned,
        lastCleanedAt,
        createdAt: Number.isFinite(item.createdAt) ? item.createdAt : now.getTime()
      });
    }
  }
  const rules = Array.from(ruleMap.values());
  return {
    enabled: rawState.enabled !== false,
    cleanHistoryOnAdd: rawState.cleanHistoryOnAdd !== false,
    showQuickAdd: rawState.showQuickAdd !== false,
    quickAddMode: QUICK_ADD_MODES.has(rawState.quickAddMode) ? rawState.quickAddMode : 'host',
    rules,
    stats: {
      totalCleaned: Number.isFinite(rawStats.totalCleaned) && rawStats.totalCleaned >= 0 ? rawStats.totalCleaned : 0,
      todayCleaned:
        isSameDay && Number.isFinite(rawStats.todayCleaned) && rawStats.todayCleaned >= 0
          ? rawStats.todayCleaned
          : 0,
      todayDate: todayKey,
      lastCleanedAt: typeof rawStats.lastCleanedAt === 'string' ? rawStats.lastCleanedAt : null
    }
  };
}

function generateRuleId(now) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `rule_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createRuleObject(normalizedPattern, enabled = true, now = new Date()) {
  return {
    id: generateRuleId(now),
    pattern: normalizedPattern,
    enabled: Boolean(enabled),
    cleanedCount: 0,
    todayCleaned: 0,
    lastCleanedAt: null,
    createdAt: now.getTime()
  };
}

export function addRule(state, rawPattern, now = new Date()) {
  const parsed = parseRulePattern(rawPattern);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  const normalized = parsed.rule.normalized;
  if (state.rules.some((rule) => rule.pattern === normalized)) {
    return { ok: false, error: '已存在相同的规则' };
  }

  const newRule = createRuleObject(normalized, true, now);
  return {
    ok: true,
    rule: newRule,
    state: {
      ...state,
      rules: [...state.rules, newRule]
    }
  };
}

export function importRules(state, rawItems, now = new Date()) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, error: '导入文件中未找到有效的规则列表' };
  }

  const existingPatterns = new Set(state.rules.map((rule) => rule.pattern));
  const addedRules = [];
  let skippedDuplicate = 0;
  let skippedInvalid = 0;

  for (const item of rawItems) {
    const rawPattern = typeof item === 'string' ? item : item?.pattern;
    const enabled = typeof item === 'object' && item !== null ? item.enabled !== false : true;
    const parsed = parseRulePattern(rawPattern);
    if (!parsed.ok) {
      skippedInvalid += 1;
      continue;
    }
    const normalized = parsed.rule.normalized;
    if (existingPatterns.has(normalized)) {
      skippedDuplicate += 1;
      continue;
    }
    existingPatterns.add(normalized);
    addedRules.push(createRuleObject(normalized, enabled, now));
  }

  if (addedRules.length === 0 && skippedDuplicate === 0) {
    return { ok: false, error: '导入文件中没有合法的规则' };
  }

  return {
    ok: true,
    addedRules,
    addedCount: addedRules.length,
    skippedDuplicate,
    skippedInvalid,
    state: {
      ...state,
      rules: [...state.rules, ...addedRules]
    }
  };
}

export function updateRule(state, id, rawPattern) {
  const idx = state.rules.findIndex((rule) => rule.id === id);
  if (idx === -1) {
    return { ok: false, error: '未找到要编辑的规则' };
  }

  const parsed = parseRulePattern(rawPattern);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  const normalized = parsed.rule.normalized;
  if (state.rules.some((rule) => rule.id !== id && rule.pattern === normalized)) {
    return { ok: false, error: '已存在相同的规则' };
  }

  const updatedRule = {
    ...state.rules[idx],
    pattern: normalized
  };
  const nextRules = state.rules.slice();
  nextRules[idx] = updatedRule;

  return {
    ok: true,
    rule: updatedRule,
    state: {
      ...state,
      rules: nextRules
    }
  };
}

export function toggleRule(state, id, enabled) {
  const idx = state.rules.findIndex((rule) => rule.id === id);
  if (idx === -1) {
    return { ok: false, error: '未找到规则' };
  }

  const current = state.rules[idx];
  const nextEnabled = typeof enabled === 'boolean' ? enabled : !current.enabled;
  const nextRules = state.rules.slice();
  nextRules[idx] = { ...current, enabled: nextEnabled };

  return {
    ok: true,
    state: {
      ...state,
      rules: nextRules
    }
  };
}

export function deleteRule(state, id) {
  const exists = state.rules.some((rule) => rule.id === id);
  if (!exists) {
    return { ok: false, error: '未找到要删除的规则' };
  }

  return {
    ok: true,
    state: {
      ...state,
      rules: state.rules.filter((rule) => rule.id !== id)
    }
  };
}

export function setGlobalEnabled(state, enabled) {
  return {
    ...state,
    enabled: Boolean(enabled)
  };
}
export function setCleanHistoryOnAdd(state, enabled) {
  return {
    ...state,
    cleanHistoryOnAdd: Boolean(enabled)
  };
}

export function updateSettings(state, settings = {}) {
  const next = { ...state };
  if (typeof settings.cleanHistoryOnAdd === 'boolean') {
    next.cleanHistoryOnAdd = settings.cleanHistoryOnAdd;
  }
  if (typeof settings.showQuickAdd === 'boolean') {
    next.showQuickAdd = settings.showQuickAdd;
  }
  if (QUICK_ADD_MODES.has(settings.quickAddMode)) {
    next.quickAddMode = settings.quickAddMode;
  }
  return next;
}

export function setAllRulesEnabled(state, enabled) {
  const flag = Boolean(enabled);
  return {
    ...state,
    rules: state.rules.map((rule) => ({
      ...rule,
      enabled: flag
    }))
  };
}

export function clearAllRules(state) {
  return {
    ...state,
    rules: []
  };
}

export function recordCleanupSuccess(state, ruleId, now = new Date()) {
  const rolled = rolloverTodayStats(state, now);
  const timestamp = now.toISOString();
  const nextRules = rolled.rules.map((rule) =>
    rule.id === ruleId
      ? {
          ...rule,
          cleanedCount: rule.cleanedCount + 1,
          todayCleaned: rule.todayCleaned + 1,
          lastCleanedAt: timestamp
        }
      : rule
  );

  return {
    ...rolled,
    rules: nextRules,
    stats: {
      ...rolled.stats,
      totalCleaned: rolled.stats.totalCleaned + 1,
      todayCleaned: rolled.stats.todayCleaned + 1,
      lastCleanedAt: timestamp
    }
  };
}

export function resetStats(state, now = new Date()) {
  return {
    ...state,
    rules: state.rules.map((rule) => ({
      ...rule,
      cleanedCount: 0,
      todayCleaned: 0,
      lastCleanedAt: null
    })),
    stats: {
      totalCleaned: 0,
      todayCleaned: 0,
      todayDate: getLocalDateKey(now),
      lastCleanedAt: null
    }
  };
}
