import { buildRuleFromTabUrl } from './lib/rules.js';

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

const todayCleanedValue = document.getElementById('todayCleanedValue');
const totalCleanedValue = document.getElementById('totalCleanedValue');
const lastCleanedText = document.getElementById('lastCleanedText');
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
let currentState = null;
let editingRuleId = null;
let activeTabUrl = '';

const TAB_MAP = {
  rules: { btn: tabRulesBtn, panel: rulesTabPanel },
  stats: { btn: tabStatsBtn, panel: statsTabPanel },
  settings: { btn: tabSettingsBtn, panel: settingsTabPanel }
};

function showError(message) {
  errorText.textContent = message;
  errorBanner.classList.remove('hidden');
}

function hideError() {
  errorText.textContent = '';
  errorBanner.classList.add('hidden');
}

function showInfo(message) {
  infoText.textContent = message;
  infoBanner.classList.remove('hidden');
}

function hideInfo() {
  infoText.textContent = '';
  infoBanner.classList.add('hidden');
}

function switchTab(tabName) {
  const target = TAB_MAP[tabName] ? tabName : 'rules';
  for (const [name, item] of Object.entries(TAB_MAP)) {
    const selected = name === target;
    item.btn.classList.toggle('active', selected);
    item.btn.setAttribute('aria-selected', String(selected));
    item.panel.classList.toggle('hidden', !selected);
  }
}

async function sendMessage(payload) {
  const response = await chrome.runtime.sendMessage(payload);
  if (!response) {
    throw new Error('后台服务无响应');
  }
  if (!response.ok && typeof response.error === 'string' && response.error.startsWith('未知操作：')) {
    return {
      ...response,
      error: `${response.error}（请先在 chrome://extensions/ 点击“刷新”按钮重新加载扩展后台服务）`
    };
  }
  return response;
}

function formatDateTime(isoString) {
  if (!isoString) {
    return '暂无';
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return '暂无';
  }
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function createStatCell(label, valueText) {
  const cell = document.createElement('div');
  cell.className = 'rule-stat-cell';

  const labelEl = document.createElement('span');
  labelEl.textContent = label;

  const valueEl = document.createElement('strong');
  valueEl.textContent = valueText;
  valueEl.title = valueText;

  cell.append(labelEl, valueEl);
  return cell;
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
    currentTabInput.placeholder = '当前页面不支持快捷添加';
    currentTabInput.disabled = true;
    addCurrentTabBtn.disabled = true;
    currentTabHint.textContent = result.reason;
    return;
  }

  currentTabInput.disabled = false;
  addCurrentTabBtn.disabled = false;
  currentTabInput.value = result.pattern;
  currentTabHint.textContent = `已识别当前主机 ${result.host}，可直接添加或按需修改路径后添加。`;
}

function renderSettings(state) {
  cleanHistoryOnAddToggle.checked = state.cleanHistoryOnAdd !== false;
  showQuickAddToggle.checked = state.showQuickAdd !== false;
  quickAddModeSelect.value = state.quickAddMode || 'host';
  quickAddModeSelect.disabled = state.showQuickAdd === false;
  const hasRules = state.rules.length > 0;
  settingsRuleCountBadge.textContent = `${state.rules.length} 条`;
  enableAllRulesBtn.disabled = !hasRules;
  pauseAllRulesBtn.disabled = !hasRules;
  clearAllRulesBtn.disabled = !hasRules;
  exportRulesBtn.disabled = !hasRules;
  if (!hasRules) {
    clearRulesConfirmGroup.classList.add('hidden');
  }
}

function renderStats(state) {
  globalEnabledToggle.checked = state.enabled;
  globalStatusText.textContent = state.enabled
    ? '已开启：自动过滤匹配的历史记录'
    : '已暂停：当前不会自动清理任何历史记录';

  todayCleanedValue.textContent = String(state.stats.todayCleaned);
  totalCleanedValue.textContent = String(state.stats.totalCleaned);
  lastCleanedText.textContent = `最近清理：${formatDateTime(state.stats.lastCleanedAt)}`;

  const countText = `${state.rules.length} 条`;
  ruleCountBadge.textContent = countText;
  statsRuleCountBadge.textContent = countText;

  ruleStatsList.replaceChildren();
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

    const metrics = document.createElement('div');
    metrics.className = 'rule-stat-metrics';
    metrics.append(
      createStatCell('今日清理', `${todayCleaned} 次`),
      createStatCell('累计清理', `${cleanedCount} 次`),
      createStatCell('最近清理', formatDateTime(lastCleanedAt))
    );

    li.append(header, metrics);
    ruleStatsList.appendChild(li);
  }


  const sortedRules = [...state.rules].sort(
    (a, b) => b.cleanedCount - a.cleanedCount || b.todayCleaned - a.todayCleaned
  );

  for (const rule of sortedRules) {
    appendStatCard({
      label: rule.pattern,
      active: rule.enabled,
      statusText: rule.enabled ? '运行中' : '已暂停',
      todayCleaned: rule.todayCleaned,
      cleanedCount: rule.cleanedCount,
      lastCleanedAt: rule.lastCleanedAt
    });
  }
}

function renderRules(state) {
  rulesList.replaceChildren();
  emptyRulesText.classList.toggle('hidden', state.rules.length > 0);

  for (const rule of state.rules) {
    const li = document.createElement('li');
    li.className = rule.enabled ? 'rule-item' : 'rule-item paused';

    if (editingRuleId === rule.id) {
      const editRow = document.createElement('div');
      editRow.className = 'input-row';

      const editInput = document.createElement('input');
      editInput.type = 'text';
      editInput.className = 'input';
      editInput.value = rule.pattern;
      editInput.setAttribute('aria-label', '编辑规则');

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'btn-primary';
      saveBtn.textContent = '保存';
      saveBtn.addEventListener('click', async () => {
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
      });

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn-secondary';
      cancelBtn.textContent = '取消';
      cancelBtn.addEventListener('click', () => {
        editingRuleId = null;
        renderState(currentState);
      });

      editRow.append(editInput, saveBtn, cancelBtn);
      li.appendChild(editRow);
      rulesList.appendChild(li);
      continue;
    }

    const mainRow = document.createElement('div');
    mainRow.className = 'rule-main';

    const left = document.createElement('div');
    left.className = 'rule-left';

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = rule.enabled;
    toggle.setAttribute('aria-label', `启用或暂停规则 ${rule.pattern}`);
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

    const patternSpan = document.createElement('span');
    patternSpan.className = 'rule-pattern';
    patternSpan.textContent = rule.pattern;
    patternSpan.title = rule.pattern;

    left.append(toggle, patternSpan);
    mainRow.appendChild(left);

    const metaRow = document.createElement('div');
    metaRow.className = 'rule-meta';

    const countSpan = document.createElement('span');
    countSpan.textContent = `今日 ${rule.todayCleaned} / 累计 ${rule.cleanedCount} 次`;

    const actions = document.createElement('div');
    actions.className = 'rule-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn-link';
    editBtn.textContent = '编辑';
    editBtn.addEventListener('click', () => {
      editingRuleId = rule.id;
      renderState(currentState);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-link-danger';
    deleteBtn.textContent = '删除';
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
    metaRow.append(countSpan, actions);
    li.append(mainRow, metaRow);
    rulesList.appendChild(li);
  }
}

function renderState(state) {
  currentState = state;
  renderStats(state);
  renderRules(state);
  renderSettings(state);
  renderCurrentTabQuickAdd(state);
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
    showInfo(`已添加规则，并立即清理了 ${res.cleanedExistingCount} 条匹配的历史记录。`);
  } else {
    hideInfo();
  }
  if (res.lastError) {
    showError(res.lastError);
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
    showInfo('已启用全部过滤规则。');
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
    showInfo('已暂停全部过滤规则。');
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
    showInfo('已清空全部过滤规则。');
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
  showInfo(`已导出 ${currentState.rules.length} 条规则。`);
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

    const parts = [`已导入 ${res.addedCount} 条规则`];
    if (res.skippedDuplicate > 0) {
      parts.push(`跳过重复 ${res.skippedDuplicate} 条`);
    }
    if (res.skippedInvalid > 0) {
      parts.push(`忽略无效 ${res.skippedInvalid} 条`);
    }
    if (res.cleanedExistingCount > 0) {
      parts.push(`立即清理匹配历史 ${res.cleanedExistingCount} 条`);
    }
    showInfo(`${parts.join('，')}。`);
    if (res.lastError) {
      showError(res.lastError);
    }
    renderState(res.state);
  } catch (err) {
    showError(err instanceof SyntaxError ? '导入失败：JSON 文件格式无效' : err.message);
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
  switchTab('rules');
  try {
    const [stateRes] = await Promise.all([sendMessage({ type: 'getState' }), fetchActiveTabUrl()]);
    if (!stateRes.ok) {
      showError(stateRes.error || '加载状态失败');
      return;
    }
    renderState(stateRes.state);
    if (stateRes.lastError) {
      showError(stateRes.lastError);
    }
  } catch (err) {
    showError(err.message || '初始化失败');
  }
}

void init();
