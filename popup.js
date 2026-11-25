import { buildRuleFromTabUrl } from './lib/rules.js';
import {
  resolveLocale,
  t,
  translateError,
  translateLastError,
  translateUnsupportedReason
} from './lib/i18n.js';

const globalEnabledToggle = document.getElementById('globalEnabledToggle');
const globalStatusText = document.getElementById('globalStatusText');
const errorBanner = document.getElementById('errorBanner');
const errorText = document.getElementById('errorText');
const dismissErrorBtn = document.getElementById('dismissErrorBtn');
const infoBanner = document.getElementById('infoBanner');
const infoText = document.getElementById('infoText');
const dismissInfoBtn = document.getElementById('dismissInfoBtn');

const tabRulesBtn = document.getElementById('tabRulesBtn');
const tabStatsBtn = document.getElementById('tabStatsBtn');
const tabSettingsBtn = document.getElementById('tabSettingsBtn');
const rulesTabPanel = document.getElementById('rulesTabPanel');
const statsTabPanel = document.getElementById('statsTabPanel');
const settingsTabPanel = document.getElementById('settingsTabPanel');

const statsChartView = document.getElementById('statsChartView');
const statsDetailView = document.getElementById('statsDetailView');
const statsDonutSvg = document.getElementById('statsDonutSvg');
const chartTotalValue = document.getElementById('chartTotalValue');
const chartTodayValue = document.getElementById('chartTodayValue');
const statsChartLegend = document.getElementById('statsChartLegend');
const todayCleanedValue = document.getElementById('todayCleanedValue');
const totalCleanedValue = document.getElementById('totalCleanedValue');
const activeRulesValue = document.getElementById('activeRulesValue');
const topRuleValue = document.getElementById('topRuleValue');
const lastCleanedText = document.getElementById('lastCleanedText');
const statsPrevPageBtn = document.getElementById('statsPrevPageBtn');
const statsNextPageBtn = document.getElementById('statsNextPageBtn');
const statsPageDots = Array.from(document.querySelectorAll('[data-stats-page]'));
const resetStatsBtn = document.getElementById('resetStatsBtn');
const resetConfirmGroup = document.getElementById('resetConfirmGroup');
const confirmResetBtn = document.getElementById('confirmResetBtn');
const cancelResetBtn = document.getElementById('cancelResetBtn');
const statsRuleCountBadge = document.getElementById('statsRuleCountBadge');
const ruleStatsList = document.getElementById('ruleStatsList');
const emptyRuleStatsText = document.getElementById('emptyRuleStatsText');

const quickAddCard = document.getElementById('quickAddCard');
const currentTabInput = document.getElementById('currentTabInput');
const addCurrentTabBtn = document.getElementById('addCurrentTabBtn');
const currentTabHint = document.getElementById('currentTabHint');

const addRuleForm = document.getElementById('addRuleForm');
const newRuleInput = document.getElementById('newRuleInput');
const ruleCountBadge = document.getElementById('ruleCountBadge');
const rulesList = document.getElementById('rulesList');
const emptyRulesText = document.getElementById('emptyRulesText');

const languageSelect = document.getElementById('languageSelect');
const cleanHistoryOnAddToggle = document.getElementById('cleanHistoryOnAddToggle');
const showQuickAddToggle = document.getElementById('showQuickAddToggle');
const quickAddModeSelect = document.getElementById('quickAddModeSelect');
const settingsRuleCountBadge = document.getElementById('settingsRuleCountBadge');
const enableAllRulesBtn = document.getElementById('enableAllRulesBtn');
const pauseAllRulesBtn = document.getElementById('pauseAllRulesBtn');
const clearAllRulesBtn = document.getElementById('clearAllRulesBtn');
const clearRulesConfirmGroup = document.getElementById('clearRulesConfirmGroup');
const confirmClearRulesBtn = document.getElementById('confirmClearRulesBtn');
const cancelClearRulesBtn = document.getElementById('cancelClearRulesBtn');
const importRulesBtn = document.getElementById('importRulesBtn');
const exportRulesBtn = document.getElementById('exportRulesBtn');
const importRulesFileInput = document.getElementById('importRulesFileInput');
const appVersionBadge = document.getElementById('appVersionBadge');

let currentState = null;
let activeLocale = resolveLocale('auto');
let dateTimeFormatter = null;
let dateTimeFormatterLocale = null;
let editingRuleId = null;
let activeTabUrl = '';
let statsOverviewPage = 0;
let errorTimer = null;
let infoTimer = null;
const TAB_MAP = {
  rules: { btn: tabRulesBtn, panel: rulesTabPanel },
  stats: { btn: tabStatsBtn, panel: statsTabPanel },
  settings: { btn: tabSettingsBtn, panel: settingsTabPanel }
};
let activeTabName = 'rules';
const dirtyPanels = new Set();

function getDateTimeFormatter(locale) {
  if (dateTimeFormatter && dateTimeFormatterLocale === locale) {
    return dateTimeFormatter;
  }
  dateTimeFormatterLocale = locale;
  dateTimeFormatter = new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  return dateTimeFormatter;
}

function applyTranslations(locale) {
  if (document.documentElement) {
    document.documentElement.lang = locale;
  }
  document.title = t(locale, 'appTitle');

  for (const el of document.querySelectorAll('[data-i18n]')) {
    const key = el.dataset?.i18n || el.getAttribute?.('data-i18n');
    if (key) {
      el.textContent = t(locale, key);
    }
  }
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) {
    const key = el.dataset?.i18nPlaceholder || el.getAttribute?.('data-i18n-placeholder');
    if (key) {
      el.placeholder = t(locale, key);
    }
  }
  for (const el of document.querySelectorAll('[data-i18n-aria-label]')) {
    const key = el.dataset?.i18nAriaLabel || el.getAttribute?.('data-i18n-aria-label');
    if (key) {
      el.setAttribute('aria-label', t(locale, key));
    }
  }
  for (const el of document.querySelectorAll('[data-i18n-title]')) {
    const key = el.dataset?.i18nTitle || el.getAttribute?.('data-i18n-title');
    if (key) {
      el.setAttribute('title', t(locale, key));
    }
  }
}

function showError(message) {
  hideInfo();
  clearTimeout(errorTimer);
  errorText.textContent = message;
  errorBanner.classList.remove('hidden');
  errorTimer = setTimeout(hideError, 4500);
}

function hideError() {
  clearTimeout(errorTimer);
  errorTimer = null;
  errorText.textContent = '';
  errorBanner.classList.add('hidden');
}

function showInfo(message) {
  hideError();
  clearTimeout(infoTimer);
  infoText.textContent = message;
  infoBanner.classList.remove('hidden');
  infoTimer = setTimeout(hideInfo, 3000);
}

function hideInfo() {
  clearTimeout(infoTimer);
  infoTimer = null;
  infoText.textContent = '';
  infoBanner.classList.add('hidden');
}

function switchTab(tabName) {
  const target = TAB_MAP[tabName] ? tabName : 'rules';
  activeTabName = target;
  for (const [name, item] of Object.entries(TAB_MAP)) {
    const selected = name === target;
    item.btn.classList.toggle('active', selected);
    item.btn.setAttribute('aria-selected', String(selected));
    item.panel.classList.toggle('hidden', !selected);
  }
  renderActivePanel();
}

function getResponseError(response) {
  const base = translateError(activeLocale, response);
  if (
    response?.errorCode === 'errUnknownAction' ||
    (typeof response?.error === 'string' && response.error.startsWith('未知操作：'))
  ) {
    return t(activeLocale, 'errUnknownActionHint', { error: base });
  }
  return base;
}

async function sendMessage(payload) {
  const response = await chrome.runtime.sendMessage(payload);
  if (!response) {
    throw new Error(t(activeLocale, 'errNoBackgroundResponse'));
  }
  if (!response.ok) {
    return {
      ...response,
      error: getResponseError(response)
    };
  }
  return response;
}

function formatDateTime(isoString) {
  if (!isoString) {
    return t(activeLocale, 'noneValue');
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return t(activeLocale, 'noneValue');
  }
  return getDateTimeFormatter(activeLocale).format(date);
}

function renderCurrentTabQuickAdd(state) {
  const showQuickAdd = state.showQuickAdd !== false;
  quickAddCard.classList.toggle('hidden', !showQuickAdd);
  if (!showQuickAdd) {
    return;
  }

  const mode = state.quickAddMode || 'host';
  const result = buildRuleFromTabUrl(activeTabUrl, mode);
  if (!result.supported) {
    currentTabInput.value = '';
    currentTabInput.placeholder = t(activeLocale, 'currentTabPlaceholderUnsupported');
    currentTabInput.disabled = true;
    addCurrentTabBtn.disabled = true;
    currentTabHint.textContent = translateUnsupportedReason(activeLocale, result);
    return;
  }

  currentTabInput.disabled = false;
  addCurrentTabBtn.disabled = false;
  currentTabInput.value = result.pattern;
  currentTabHint.textContent = t(activeLocale, 'currentTabSupportedHint', { host: result.host });
}

function renderSettings(state) {
  languageSelect.value = state.language || 'auto';
  cleanHistoryOnAddToggle.checked = state.cleanHistoryOnAdd !== false;
  showQuickAddToggle.checked = state.showQuickAdd !== false;
  quickAddModeSelect.value = state.quickAddMode || 'host';
  quickAddModeSelect.disabled = state.showQuickAdd === false;
  const hasRules = state.rules.length > 0;
  enableAllRulesBtn.disabled = !hasRules;
  pauseAllRulesBtn.disabled = !hasRules;
  clearAllRulesBtn.disabled = !hasRules;
  exportRulesBtn.disabled = !hasRules;
  if (!hasRules) {
    clearRulesConfirmGroup.classList.add('hidden');
  }
  if (appVersionBadge) {
    const version =
      typeof chrome !== 'undefined' && typeof chrome.runtime?.getManifest === 'function'
        ? chrome.runtime.getManifest()?.version
        : null;
    appVersionBadge.textContent = `v${version || '1.1.0'}`;
  }
}

const CHART_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#9ca3af'];

function setStatsOverviewPage(page) {
  statsOverviewPage = page === 1 ? 1 : 0;
  statsChartView.classList.toggle('hidden', statsOverviewPage !== 0);
  statsDetailView.classList.toggle('hidden', statsOverviewPage !== 1);
  statsPrevPageBtn.disabled = statsOverviewPage === 0;
  statsNextPageBtn.disabled = statsOverviewPage === 1;
  for (const dot of statsPageDots) {
    const active = Number(dot.dataset.statsPage) === statsOverviewPage;
    dot.classList.toggle('active', active);
    dot.setAttribute('aria-current', String(active));
  }
}

function renderOverviewChart(state, sortedRules) {
  const svgNs = 'http://www.w3.org/2000/svg';
  const svgFragment = document.createDocumentFragment();
  const legendFragment = document.createDocumentFragment();

  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const track = document.createElementNS(svgNs, 'circle');
  track.setAttribute('cx', '44');
  track.setAttribute('cy', '44');
  track.setAttribute('r', String(radius));
  track.setAttribute('fill', 'none');
  track.setAttribute('stroke', '#e5e7eb');
  track.setAttribute('stroke-width', '10');
  svgFragment.appendChild(track);

  const activeHits = sortedRules.filter((rule) => rule.cleanedCount > 0);
  const rulesSum = activeHits.reduce((sum, rule) => sum + rule.cleanedCount, 0);
  const total = Math.max(state.stats.totalCleaned, rulesSum);

  if (total <= 0) {
    const emptyLi = document.createElement('li');
    emptyLi.className = 'chart-empty';
    emptyLi.textContent = t(activeLocale, 'chartEmpty');
    legendFragment.appendChild(emptyLi);
    statsDonutSvg.replaceChildren(svgFragment);
    statsChartLegend.replaceChildren(legendFragment);
    return;
  }

  const segments = [];
  const topRules = activeHits.slice(0, 4);
  for (let i = 0; i < topRules.length; i += 1) {
    segments.push({
      label: topRules[i].pattern,
      count: topRules[i].cleanedCount,
      color: CHART_COLORS[i]
    });
  }

  const topSum = topRules.reduce((sum, rule) => sum + rule.cleanedCount, 0);
  const remaining = total - topSum;
  if (remaining > 0) {
    segments.push({
      label:
        activeHits.length > 4
          ? t(activeLocale, 'chartOtherRules')
          : t(activeLocale, 'chartDeletedRules'),
      count: remaining,
      color: CHART_COLORS[4]
    });
  }

  let offset = 0;
  for (const seg of segments) {
    const ratio = seg.count / total;
    const segLen = ratio * circumference;
    const circle = document.createElementNS(svgNs, 'circle');
    circle.setAttribute('cx', '44');
    circle.setAttribute('cy', '44');
    circle.setAttribute('r', String(radius));
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', seg.color);
    circle.setAttribute('stroke-width', '10');
    circle.setAttribute('stroke-dasharray', `${segLen} ${circumference}`);
    circle.setAttribute('stroke-dashoffset', String(-offset));
    svgFragment.appendChild(circle);
    offset += segLen;

    const li = document.createElement('li');
    li.className = 'chart-legend-item';

    const left = document.createElement('span');
    left.className = 'chart-legend-left';

    const dot = document.createElement('span');
    dot.className = 'chart-dot';
    dot.style.backgroundColor = seg.color;

    const labelSpan = document.createElement('span');
    labelSpan.className = 'chart-legend-label';
    labelSpan.textContent = seg.label;
    labelSpan.title = seg.label;

    left.append(dot, labelSpan);

    const valSpan = document.createElement('span');
    valSpan.className = 'chart-legend-val';
    const pct = Math.round(ratio * 100);
    valSpan.textContent = `${seg.count} (${pct}%)`;

    li.append(left, valSpan);
    legendFragment.appendChild(li);
  }
  statsDonutSvg.replaceChildren(svgFragment);
  statsChartLegend.replaceChildren(legendFragment);
}

function renderStats(state) {
  todayCleanedValue.textContent = String(state.stats.todayCleaned);
  totalCleanedValue.textContent = String(state.stats.totalCleaned);
  chartTotalValue.textContent = String(state.stats.totalCleaned);
  chartTodayValue.textContent = String(state.stats.todayCleaned);
  const enabledRulesCount = state.rules.filter((rule) => rule.enabled).length;
  activeRulesValue.textContent = t(activeLocale, 'activeRulesValue', {
    enabled: enabledRulesCount,
    total: state.rules.length,
    count: state.rules.length
  });
  lastCleanedText.textContent = t(activeLocale, 'lastCleanedText', {
    time: formatDateTime(state.stats.lastCleanedAt)
  });

  const fragment = document.createDocumentFragment();
  emptyRuleStatsText.classList.toggle('hidden', state.rules.length > 0);

  function appendStatCard({ label, active, statusText, todayCleaned, cleanedCount, lastCleanedAt }) {
    const li = document.createElement('li');
    li.className = active ? 'rule-stat-item' : 'rule-stat-item paused';

    const header = document.createElement('div');
    header.className = 'rule-stat-header';

    const patternSpan = document.createElement('span');
    patternSpan.className = 'rule-pattern';
    patternSpan.textContent = label;
    patternSpan.title = label;

    const statusBadge = document.createElement('span');
    statusBadge.className = active ? 'rule-stat-status' : 'rule-stat-status paused';
    statusBadge.textContent = statusText;

    header.append(patternSpan, statusBadge);

    const metaRow = document.createElement('div');
    metaRow.className = 'rule-meta';

    const countSpan = document.createElement('span');
    countSpan.textContent = t(activeLocale, 'ruleStatsCount', {
      today: todayCleaned,
      total: cleanedCount
    });

    const timeSpan = document.createElement('span');
    timeSpan.className = 'rule-stat-time';
    timeSpan.textContent = t(activeLocale, 'lastCleanedText', {
      time: formatDateTime(lastCleanedAt)
    });

    metaRow.append(countSpan, timeSpan);

    li.append(header, metaRow);
    fragment.appendChild(li);
  }

  const sortedRules = [...state.rules].sort(
    (a, b) => b.cleanedCount - a.cleanedCount || b.todayCleaned - a.todayCleaned
  );
  const topRule = sortedRules.find((rule) => rule.cleanedCount > 0);
  const noneText = t(activeLocale, 'noneValue');
  topRuleValue.textContent = topRule ? `${topRule.pattern} (${topRule.cleanedCount})` : noneText;
  topRuleValue.title = topRule
    ? t(activeLocale, 'topRuleTitle', { pattern: topRule.pattern, count: topRule.cleanedCount })
    : noneText;
  renderOverviewChart(state, sortedRules);

  for (const rule of sortedRules) {
    appendStatCard({
      label: rule.pattern,
      active: rule.enabled,
      statusText: rule.enabled
        ? t(activeLocale, 'ruleStatusActive')
        : t(activeLocale, 'ruleStatusPaused'),
      todayCleaned: rule.todayCleaned,
      cleanedCount: rule.cleanedCount,
      lastCleanedAt: rule.lastCleanedAt
    });
  }
  ruleStatsList.replaceChildren(fragment);
}

function renderRules(state) {
  const fragment = document.createDocumentFragment();
  emptyRulesText.classList.toggle('hidden', state.rules.length > 0);

  for (const rule of state.rules) {
    const li = document.createElement('li');
    li.className = rule.enabled ? 'rule-item' : 'rule-item paused';

    const mainRow = document.createElement('div');
    mainRow.className = 'rule-main';

    const left = document.createElement('div');
    left.className = 'rule-left';

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = rule.enabled;
    toggle.setAttribute('aria-label', t(activeLocale, 'toggleRuleAria', { pattern: rule.pattern }));
    toggle.addEventListener('change', async () => {
      const res = await sendMessage({
        type: 'toggleRule',
        id: rule.id,
        enabled: toggle.checked
      });
      if (!res.ok) {
        showError(res.error);
        return;
      }
      hideError();
      renderState(res.state);
    });

    if (editingRuleId === rule.id) {
      const editInput = document.createElement('input');
      editInput.type = 'text';
      editInput.className = 'rule-edit-input';
      editInput.value = rule.pattern;
      editInput.setAttribute('aria-label', t(activeLocale, 'editRuleAria'));

      const commitEdit = async () => {
        const res = await sendMessage({
          type: 'updateRule',
          id: rule.id,
          pattern: editInput.value
        });
        if (!res.ok) {
          showError(res.error);
          return;
        }
        hideError();
        editingRuleId = null;
        renderState(res.state);
      };

      const cancelEdit = () => {
        editingRuleId = null;
        renderRules(currentState);
      };

      editInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          void commitEdit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancelEdit();
        }
      });

      left.append(toggle, editInput);

      const actions = document.createElement('div');
      actions.className = 'rule-actions rule-actions-editing';

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'btn-link';
      saveBtn.textContent = t(activeLocale, 'saveBtn');
      saveBtn.addEventListener('click', () => {
        void commitEdit();
      });

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn-link-muted';
      cancelBtn.textContent = t(activeLocale, 'cancelBtn');
      cancelBtn.addEventListener('click', cancelEdit);

      actions.append(saveBtn, cancelBtn);
      mainRow.append(left, actions);
      li.appendChild(mainRow);
      fragment.appendChild(li);
      requestAnimationFrame(() => editInput.focus({ preventScroll: true }));
      continue;
    }

    const patternSpan = document.createElement('span');
    patternSpan.className = 'rule-pattern';
    patternSpan.textContent = rule.pattern;
    patternSpan.title = rule.pattern;

    left.append(toggle, patternSpan);

    const actions = document.createElement('div');
    actions.className = 'rule-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn-link';
    editBtn.textContent = t(activeLocale, 'editBtn');
    editBtn.addEventListener('click', () => {
      editingRuleId = rule.id;
      renderRules(currentState);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-link-danger';
    deleteBtn.textContent = t(activeLocale, 'deleteBtn');
    deleteBtn.addEventListener('click', async () => {
      const res = await sendMessage({ type: 'deleteRule', id: rule.id });
      if (!res.ok) {
        showError(res.error);
        return;
      }
      hideError();
      renderState(res.state);
    });

    actions.append(editBtn, deleteBtn);
    mainRow.append(left, actions);
    li.appendChild(mainRow);
    fragment.appendChild(li);
  }
  rulesList.replaceChildren(fragment);
}

function renderActivePanel() {
  if (!currentState || !dirtyPanels.has(activeTabName)) {
    return;
  }
  if (activeTabName === 'rules') {
    renderRules(currentState);
    renderCurrentTabQuickAdd(currentState);
  } else if (activeTabName === 'stats') {
    renderStats(currentState);
  } else {
    renderSettings(currentState);
  }
  dirtyPanels.delete(activeTabName);
}

function renderState(state) {
  currentState = state;
  const nextLocale = resolveLocale(state.language);
  if (nextLocale !== activeLocale) {
    activeLocale = nextLocale;
    applyTranslations(activeLocale);
  }
  for (const name of Object.keys(TAB_MAP)) {
    dirtyPanels.add(name);
  }
  globalEnabledToggle.checked = state.enabled;
  globalStatusText.textContent = state.enabled
    ? t(activeLocale, 'statusEnabled')
    : t(activeLocale, 'statusDisabled');
  const countText = t(activeLocale, 'ruleCountBadge', { count: state.rules.length });
  ruleCountBadge.textContent = countText;
  statsRuleCountBadge.textContent = countText;
  settingsRuleCountBadge.textContent = countText;
  renderActivePanel();
}

async function fetchActiveTabUrl() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTabUrl = tabs?.[0]?.url || '';
  } catch {
    activeTabUrl = '';
  }
}

async function saveSettings(settings) {
  try {
    const res = await sendMessage({
      type: 'updateSettings',
      settings
    });
    if (!res.ok) {
      showError(res.error);
      return;
    }
    hideError();
    renderState(res.state);
  } catch (err) {
    showError(err.message);
  }
}

async function handleAddRule(pattern) {
  const res = await sendMessage({
    type: 'addRule',
    pattern
  });
  if (!res.ok) {
    showError(res.error);
    return false;
  }
  hideError();
  if (res.cleanedExistingCount > 0) {
    showInfo(t(activeLocale, 'infoRuleAddedCleaned', { count: res.cleanedExistingCount }));
  } else {
    hideInfo();
  }
  const lastErrMsg = translateLastError(activeLocale, res);
  if (lastErrMsg) {
    showError(lastErrMsg);
  }
  renderState(res.state);
  return true;
}

tabRulesBtn.addEventListener('click', () => switchTab('rules'));
tabStatsBtn.addEventListener('click', () => switchTab('stats'));
tabSettingsBtn.addEventListener('click', () => switchTab('settings'));

globalEnabledToggle.addEventListener('change', async () => {
  try {
    const res = await sendMessage({
      type: 'setGlobalEnabled',
      enabled: globalEnabledToggle.checked
    });
    if (!res.ok) {
      showError(res.error);
      return;
    }
    hideError();
    renderState(res.state);
  } catch (err) {
    showError(err.message);
  }
});

languageSelect.addEventListener('change', () => {
  void saveSettings({ language: languageSelect.value });
});

cleanHistoryOnAddToggle.addEventListener('change', () => {
  void saveSettings({ cleanHistoryOnAdd: cleanHistoryOnAddToggle.checked });
});

showQuickAddToggle.addEventListener('change', () => {
  void saveSettings({ showQuickAdd: showQuickAddToggle.checked });
});

quickAddModeSelect.addEventListener('change', () => {
  void saveSettings({ quickAddMode: quickAddModeSelect.value });
});

enableAllRulesBtn.addEventListener('click', async () => {
  try {
    const res = await sendMessage({ type: 'setAllRulesEnabled', enabled: true });
    if (!res.ok) {
      showError(res.error);
      return;
    }
    hideError();
    showInfo(t(activeLocale, 'infoAllRulesEnabled'));
    renderState(res.state);
  } catch (err) {
    showError(err.message);
  }
});

pauseAllRulesBtn.addEventListener('click', async () => {
  try {
    const res = await sendMessage({ type: 'setAllRulesEnabled', enabled: false });
    if (!res.ok) {
      showError(res.error);
      return;
    }
    hideError();
    showInfo(t(activeLocale, 'infoAllRulesPaused'));
    renderState(res.state);
  } catch (err) {
    showError(err.message);
  }
});

clearAllRulesBtn.addEventListener('click', () => {
  clearRulesConfirmGroup.classList.remove('hidden');
});

cancelClearRulesBtn.addEventListener('click', () => {
  clearRulesConfirmGroup.classList.add('hidden');
});

confirmClearRulesBtn.addEventListener('click', async () => {
  try {
    const res = await sendMessage({ type: 'clearAllRules' });
    clearRulesConfirmGroup.classList.add('hidden');
    if (!res.ok) {
      showError(res.error);
      return;
    }
    hideError();
    showInfo(t(activeLocale, 'infoAllRulesCleared'));
    renderState(res.state);
  } catch (err) {
    showError(err.message);
  }
});

exportRulesBtn.addEventListener('click', () => {
  if (!currentState || currentState.rules.length === 0) {
    return;
  }
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    rules: currentState.rules.map((rule) => ({
      pattern: rule.pattern,
      enabled: rule.enabled
    }))
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `historyguard-rules-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  hideError();
  showInfo(t(activeLocale, 'infoExportedRules', { count: currentState.rules.length }));
});

importRulesBtn.addEventListener('click', () => {
  importRulesFileInput.click();
});

importRulesFileInput.addEventListener('change', async () => {
  const file = importRulesFileInput.files?.[0];
  importRulesFileInput.value = '';
  if (!file) {
    return;
  }

  try {
    const rawText = await file.text();
    const parsedJson = JSON.parse(rawText);
    const items = Array.isArray(parsedJson) ? parsedJson : parsedJson?.rules;
    const res = await sendMessage({ type: 'importRules', items });
    if (!res.ok) {
      showError(res.error);
      return;
    }
    hideError();

    const parts = [t(activeLocale, 'infoImportedAdded', { count: res.addedCount })];
    if (res.skippedDuplicate > 0) {
      parts.push(t(activeLocale, 'infoImportedSkippedDup', { count: res.skippedDuplicate }));
    }
    if (res.skippedInvalid > 0) {
      parts.push(t(activeLocale, 'infoImportedSkippedInvalid', { count: res.skippedInvalid }));
    }
    if (res.cleanedExistingCount > 0) {
      parts.push(t(activeLocale, 'infoImportedCleaned', { count: res.cleanedExistingCount }));
    }
    const separator = t(activeLocale, 'sentenceListSeparator');
    showInfo(t(activeLocale, 'infoImportedSentence', { parts: parts.join(separator) }));
    const lastErrMsg = translateLastError(activeLocale, res);
    if (lastErrMsg) {
      showError(lastErrMsg);
    }
    renderState(res.state);
  } catch (err) {
    showError(err instanceof SyntaxError ? t(activeLocale, 'errImportInvalidJson') : err.message);
  }
});

addCurrentTabBtn.addEventListener('click', async () => {
  try {
    await handleAddRule(currentTabInput.value);
  } catch (err) {
    showError(err.message);
  }
});

addRuleForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const ok = await handleAddRule(newRuleInput.value);
    if (ok) {
      newRuleInput.value = '';
    }
  } catch (err) {
    showError(err.message);
  }
});

statsPrevPageBtn.addEventListener('click', () => setStatsOverviewPage(0));
statsNextPageBtn.addEventListener('click', () => setStatsOverviewPage(1));
for (const dot of statsPageDots) {
  dot.addEventListener('click', () => {
    setStatsOverviewPage(Number(dot.dataset.statsPage));
  });
}

resetStatsBtn.addEventListener('click', () => {
  resetStatsBtn.classList.add('hidden');
  resetConfirmGroup.classList.remove('hidden');
});

cancelResetBtn.addEventListener('click', () => {
  resetConfirmGroup.classList.add('hidden');
  resetStatsBtn.classList.remove('hidden');
});

confirmResetBtn.addEventListener('click', async () => {
  try {
    const res = await sendMessage({ type: 'resetStats' });
    resetConfirmGroup.classList.add('hidden');
    resetStatsBtn.classList.remove('hidden');
    if (!res.ok) {
      showError(res.error);
      return;
    }
    hideError();
    renderState(res.state);
  } catch (err) {
    showError(err.message);
  }
});

dismissErrorBtn.addEventListener('click', async () => {
  hideError();
  try {
    await sendMessage({ type: 'clearError' });
  } catch {
    // 忽略关闭错误提示时的通信异常
  }
});

dismissInfoBtn.addEventListener('click', () => {
  hideInfo();
});

async function init() {
  applyTranslations(activeLocale);
  switchTab('rules');
  setStatsOverviewPage(0);
  try {
    const [stateRes] = await Promise.all([sendMessage({ type: 'getState' }), fetchActiveTabUrl()]);
    if (!stateRes.ok) {
      showError(stateRes.error || t(activeLocale, 'errLoadStateFailed'));
      return;
    }
    renderState(stateRes.state);
    const lastErrMsg = translateLastError(activeLocale, stateRes);
    if (lastErrMsg) {
      showError(lastErrMsg);
    }
  } catch (err) {
    showError(err.message || t(activeLocale, 'errInitFailed'));
  } finally {
    requestAnimationFrame(() => {
      document.body.classList.add('ready');
    });
  }
}

void init();
