import zhCN from './locales/zh-CN.js';
import zhTW from './locales/zh-TW.js';
import en from './locales/en.js';
import ja from './locales/ja.js';
import ko from './locales/ko.js';
import es from './locales/es.js';
import fr from './locales/fr.js';
import de from './locales/de.js';

export const DEFAULT_LOCALE = 'en';

export const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', nativeName: '简体中文' },
  { code: 'zh-TW', nativeName: '繁體中文' },
  { code: 'en', nativeName: 'English' },
  { code: 'ja', nativeName: '日本語' },
  { code: 'ko', nativeName: '한국어' },
  { code: 'es', nativeName: 'Español' },
  { code: 'fr', nativeName: 'Français' },
  { code: 'de', nativeName: 'Deutsch' }
];

const SUPPORTED_LOCALE_SET = new Set(SUPPORTED_LANGUAGES.map((item) => item.code));

export const MESSAGES = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  en,
  ja,
  ko,
  es,
  fr,
  de
};

export function normalizeLanguageSetting(language) {
  if (language === 'auto' || SUPPORTED_LOCALE_SET.has(language)) {
    return language;
  }
  return 'auto';
}

export function matchSupportedLocale(tag) {
  if (typeof tag !== 'string') {
    return null;
  }
  const normalized = tag.trim().replace(/_/g, '-').toLowerCase();
  if (!normalized) {
    return null;
  }

  if (
    normalized === 'zh-tw' ||
    normalized === 'zh-hk' ||
    normalized === 'zh-mo' ||
    normalized.startsWith('zh-hant')
  ) {
    return 'zh-TW';
  }
  if (normalized === 'zh' || normalized.startsWith('zh-')) {
    return 'zh-CN';
  }

  const base = normalized.split('-')[0];
  if (SUPPORTED_LOCALE_SET.has(base)) {
    return base;
  }
  return null;
}

export function getSystemLocaleCandidates() {
  const candidates = [];
  try {
    const uiLang = globalThis.chrome?.i18n?.getUILanguage?.();
    if (typeof uiLang === 'string' && uiLang) {
      candidates.push(uiLang);
    }
  } catch {
    // 忽略读取扩展 UI 语言时的异常
  }

  const nav = globalThis.navigator;
  if (nav) {
    if (Array.isArray(nav.languages)) {
      candidates.push(...nav.languages);
    }
    if (typeof nav.language === 'string' && nav.language) {
      candidates.push(nav.language);
    }
  }
  return candidates;
}

export function resolveLocale(languageSetting = 'auto', candidates = getSystemLocaleCandidates()) {
  if (SUPPORTED_LOCALE_SET.has(languageSetting)) {
    return languageSetting;
  }
  if (Array.isArray(candidates)) {
    for (const candidate of candidates) {
      const matched = matchSupportedLocale(candidate);
      if (matched) {
        return matched;
      }
    }
  }
  return DEFAULT_LOCALE;
}

export function t(locale, key, params = null) {
  const activeLocale = SUPPORTED_LOCALE_SET.has(locale) ? locale : DEFAULT_LOCALE;
  const dict = MESSAGES[activeLocale] || MESSAGES[DEFAULT_LOCALE];
  let template = dict[key];

  if (
    params &&
    typeof params.count === 'number' &&
    params.count === 1 &&
    typeof dict[`${key}_one`] === 'string'
  ) {
    template = dict[`${key}_one`];
  }

  if (typeof template !== 'string') {
    template = MESSAGES[DEFAULT_LOCALE][key] || MESSAGES['zh-CN'][key] || key;
  }

  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  );
}

export function translateError(locale, result, fallbackKey = 'errBackgroundFailed') {
  if (result && typeof result.errorCode === 'string') {
    return t(locale, result.errorCode, result.errorParams);
  }
  if (result && typeof result.error === 'string' && result.error) {
    return result.error;
  }
  return t(locale, fallbackKey);
}

export function translateLastError(locale, response) {
  if (response && typeof response.lastErrorCode === 'string') {
    return t(locale, response.lastErrorCode, response.lastErrorParams);
  }
  return response?.lastError || '';
}

export function translateUnsupportedReason(locale, result) {
  if (result && typeof result.reasonCode === 'string') {
    return t(locale, result.reasonCode, result.reasonParams);
  }
  return result?.reason || '';
}
