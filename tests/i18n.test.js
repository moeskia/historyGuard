import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DEFAULT_LOCALE,
  MESSAGES,
  SUPPORTED_LANGUAGES,
  matchSupportedLocale,
  normalizeLanguageSetting,
  resolveLocale,
  t,
  translateError,
  translateLastError,
  translateUnsupportedReason
} from '../lib/i18n.js';
import { buildRuleFromTabUrl, parseRulePattern } from '../lib/rules.js';
import { addRule, createInitialState, deleteRule, importRules, normalizeState, toggleRule, updateRule, updateSettings } from '../lib/state.js';
import { createBackgroundController } from '../background.js';

test('所有 8 种常用语言的词典键完整且非空', () => {
  const baseKeys = Object.keys(MESSAGES['zh-CN']).sort();
  assert.equal(SUPPORTED_LANGUAGES.length, 8);

  for (const { code } of SUPPORTED_LANGUAGES) {
    const dict = MESSAGES[code];
    assert.ok(dict, `缺少词典: ${code}`);
    for (const key of baseKeys) {
      assert.equal(typeof dict[key], 'string', `${code} 缺少翻译键: ${key}`);
      assert.ok(dict[key].length > 0, `${code}.${key} 不能为空`);
    }
  }
});

test('Chrome _locales messages.json 文件完整且包含必要字段', async () => {
  const dirMap = {
    'zh-CN': 'zh_CN',
    'zh-TW': 'zh_TW',
    en: 'en',
    ja: 'ja',
    ko: 'ko',
    es: 'es',
    fr: 'fr',
    de: 'de'
  };

  for (const { code } of SUPPORTED_LANGUAGES) {
    const dir = dirMap[code];
    const raw = await readFile(new URL(`../_locales/${dir}/messages.json`, import.meta.url), 'utf8');
    const json = JSON.parse(raw);
    assert.equal(json.extName?.message, 'HistoryGuard');
    assert.ok(typeof json.extDescription?.message === 'string' && json.extDescription.message.length > 0);
  }
});

test('语言匹配、系统语言解析与未知语言回退', () => {
  assert.equal(matchSupportedLocale('zh-CN'), 'zh-CN');
  assert.equal(matchSupportedLocale('zh_SG'), 'zh-CN');
  assert.equal(matchSupportedLocale('zh'), 'zh-CN');
  assert.equal(matchSupportedLocale('zh-TW'), 'zh-TW');
  assert.equal(matchSupportedLocale('zh-HK'), 'zh-TW');
  assert.equal(matchSupportedLocale('zh-Hant-MO'), 'zh-TW');
  assert.equal(matchSupportedLocale('en-US'), 'en');
  assert.equal(matchSupportedLocale('ja-JP'), 'ja');
  assert.equal(matchSupportedLocale('ko-KR'), 'ko');
  assert.equal(matchSupportedLocale('es-419'), 'es');
  assert.equal(matchSupportedLocale('fr-CA'), 'fr');
  assert.equal(matchSupportedLocale('de-AT'), 'de');
  assert.equal(matchSupportedLocale('pt-BR'), null);

  assert.equal(resolveLocale('auto', ['pt-BR', 'ja-JP']), 'ja');
  assert.equal(resolveLocale('auto', ['pt-BR', 'it-IT']), DEFAULT_LOCALE);
  assert.equal(resolveLocale('fr', ['zh-CN']), 'fr');
  assert.equal(normalizeLanguageSetting('unknown'), 'auto');
  assert.equal(normalizeLanguageSetting('ko'), 'ko');
});

test('state 持久化 language 设置并校验合法值', () => {
  const initial = createInitialState(new Date('2026-11-25T10:00:00'));
  assert.equal(initial.language, 'auto');

  const updated = updateSettings(initial, { language: 'de' });
  assert.equal(updated.language, 'de');

  const invalid = updateSettings(updated, { language: 'xx-invalid' });
  assert.equal(invalid.language, 'auto');

  const restored = normalizeState({ language: 'zh-TW', rules: [] });
  assert.equal(restored.language, 'zh-TW');

  const restoredInvalid = normalizeState({ language: 'bad', rules: [] });
  assert.equal(restoredInvalid.language, 'auto');
});

test('单复数与参数插值、错误码全链路本地化', async () => {
  assert.equal(t('en', 'ruleCountBadge', { count: 1 }), '1 rule');
  assert.equal(t('en', 'ruleCountBadge', { count: 2 }), '2 rules');
  assert.equal(t('en', 'ruleCountBadge', { count: 0 }), '0 rules');

  const invalidRule = parseRulePattern('ftp://example.com/*');
  assert.equal(invalidRule.ok, false);
  assert.equal(invalidRule.errorCode, 'errRuleUnsupportedScheme');
  assert.match(translateError('en', invalidRule), /Only http:\/\/, https:\/\/, and \*:\/\/ schemes/);
  assert.match(translateError('de', invalidRule), /Nur http:\/\/, https:\/\/ oder \*:\/\//);

  const unsupportedTab = buildRuleFromTabUrl('chrome://settings/');
  assert.equal(unsupportedTab.supported, false);
  assert.equal(unsupportedTab.reasonCode, 'reasonTabUnsupportedProtocol');
  assert.match(translateUnsupportedReason('fr', unsupportedTab), /chrome:\/\/ ne sont pas prises en charge/);

  const state = createInitialState();
  const dupState = addRule(state, '*://example.com/*').state;
  assert.equal(addRule(dupState, '*://example.com/*').errorCode, 'errDuplicateRule');
  assert.equal(importRules(state, []).errorCode, 'errImportEmptyList');
  assert.equal(updateRule(state, 'missing', '*://a.com/*').errorCode, 'errEditRuleNotFound');
  assert.equal(toggleRule(state, 'missing').errorCode, 'errRuleNotFound');
  assert.equal(deleteRule(state, 'missing').errorCode, 'errDeleteRuleNotFound');

  const controller = createBackgroundController({
    chromeApi: {
      storage: { local: { async get() { return {}; }, async set() {} } },
      history: {
        onVisited: { addListener() {} },
        async search() { return []; },
        async deleteUrl() { throw new Error('disk full'); }
      },
      runtime: { onMessage: { addListener() {} } }
    }
  });
  await controller.handleMessage({ type: 'addRule', pattern: '*://example.com/*', cleanExisting: false });
  const visited = await controller.handleVisited({ url: 'https://example.com/a' });
  assert.equal(visited.errorCode, 'errDeleteHistoryFailedDetail');
  assert.equal(translateError('en', visited), 'Failed to delete history entry: disk full');

  const stateRes = await controller.handleMessage({ type: 'getState' });
  assert.equal(translateLastError('es', stateRes), 'Error al eliminar el historial: disk full');

  const unknownRes = await controller.handleMessage({ type: 'nonExistentAction' });
  assert.equal(unknownRes.errorCode, 'errUnknownAction');
  assert.equal(translateError('ko', unknownRes), '알 수 없는 작업: nonExistentAction');
});
