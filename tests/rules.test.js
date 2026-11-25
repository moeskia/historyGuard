import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRuleFromTabUrl,
  findFirstMatchingRule,
  matchRule,
  parseRulePattern
} from '../lib/rules.js';
import { addRule, createInitialState, updateRule } from '../lib/state.js';

test('精确域名与协议匹配', () => {
  assert.equal(matchRule('https://sub.example.com/*', 'https://sub.example.com/path'), true);
  assert.equal(matchRule('https://sub.example.com/*', 'http://sub.example.com/path'), false);
  assert.equal(matchRule('*://sub.example.com/*', 'http://sub.example.com/a'), true);
  assert.equal(matchRule('*://sub.example.com/*', 'https://sub.example.com/b'), true);
  assert.equal(matchRule('*://sub.example.com/*', 'https://a.sub.example.com/b'), false);
  assert.equal(matchRule('*://sub.example.com/*', 'ftp://sub.example.com/b'), false);
});

test('子域名与域名通配符匹配', () => {
  const pattern = '*://*.example.com/*';
  assert.equal(matchRule(pattern, 'https://example.com/'), true);
  assert.equal(matchRule(pattern, 'http://sub.example.com/page'), true);
  assert.equal(matchRule(pattern, 'https://a.b.example.com/page'), true);
  assert.equal(matchRule(pattern, 'https://badexample.com/'), false);
  assert.equal(matchRule(pattern, 'https://example.com.cn/'), false);

  assert.equal(matchRule('*://*gard.com/*', 'https://gard.com/a'), true);
  assert.equal(matchRule('*://*gard.*/*', 'https://gard.com/a'), true);
  assert.equal(matchRule('*://*gard.*/*', 'https://www.gard.com/a'), true);
  assert.equal(matchRule('*://*gard.*/*', 'https://a.b.mygard.org/a'), true);
  assert.equal(matchRule('*://*gard.*/*', 'https://example.com/a'), false);
  assert.equal(matchRule('*://*.*gard.*/*', 'https://gmgard.moe/a'), true);
  assert.equal(matchRule('*://*.*gard.*/*', 'https://www.gmgard.moe/a'), true);
  assert.equal(matchRule('*://*.*gard.*/*', 'https://sub.mygard.org/a'), true);
  assert.equal(matchRule('*://foo*.example.com/*', 'https://foobar.example.com/x'), true);
  assert.equal(matchRule('*://foo*.example.com/*', 'https://bar.example.com/x'), false);
});

test('任意域名 * 与端口匹配', () => {
  assert.equal(matchRule('*://*/secret/*', 'https://any.site.org/secret/123'), true);
  assert.equal(matchRule('*://*/secret/*', 'http://localhost:3000/secret/123'), true);
  assert.equal(matchRule('*://*/secret/*', 'http://localhost:3000/secret/123'), true);
  assert.equal(matchRule('*://localhost:3000/*', 'http://localhost:3000/app'), true);
  assert.equal(matchRule('*://localhost:3000/*', 'http://localhost:4000/app'), false);
});

test('路径通配符、查询参数与正则特殊字符字面量转义', () => {
  assert.equal(matchRule('*://example.com/private/*', 'https://example.com/private/doc?id=1'), true);
  assert.equal(matchRule('*://example.com/private/*', 'https://example.com/public/doc'), false);

  // 查询参数参与匹配，? 和 + 按字面量处理而非正则量词
  assert.equal(matchRule('https://example.com/search?q=a+b', 'https://example.com/search?q=a+b'), true);
  assert.equal(matchRule('https://example.com/search?q=a+b', 'https://example.com/search?q=aab'), false);
  assert.equal(matchRule('https://example.com/v1.0/(test)', 'https://example.com/v1.0/(test)'), true);
  assert.equal(matchRule('https://example.com/v1.0/(test)', 'https://example.com/v1x0/(test)'), false);
});

test('无效规则校验与规范化', () => {
  const invalidCases = [
    '',
    '   ',
    'example.com/*',
    'ftp://example.com/*',
    '*://',
    '*://*.*/*',
    '*://(a|b).com/*',
    '*://example.com:99999/*',
    '*://*:8080/*',
    '*://example.com/a b'
  ];

  for (const raw of invalidCases) {
    assert.equal(parseRulePattern(raw).ok, false, `应当拒绝无效规则: ${raw}`);
  }

  const normalized = parseRulePattern('  HTTPS://EXAMPLE.COM  ');
  assert.equal(normalized.ok, true);
  assert.equal(normalized.rule.normalized, 'https://*.example.com/*');
});

test('新增与编辑时阻止重复规则', () => {
  let state = createInitialState(new Date('2026-11-25T10:00:00'));
  const first = addRule(state, 'https://EXAMPLE.com/a/*');
  assert.equal(first.ok, true);
  state = first.state;

  const dup = addRule(state, 'https://example.com/a/*');
  assert.equal(dup.ok, false);

  const second = addRule(state, 'https://other.com/*');
  assert.equal(second.ok, true);
  state = second.state;

  const dupOnEdit = updateRule(state, second.rule.id, 'https://example.com/a/*');
  assert.equal(dupOnEdit.ok, false);

  const sameOnEdit = updateRule(state, first.rule.id, 'HTTPS://example.com/a/*');
  assert.equal(sameOnEdit.ok, true);
});

test('findFirstMatchingRule 仅返回第一条启用且匹配的规则', () => {
  const rules = [
    { id: 'r1', pattern: '*://example.com/*', enabled: false },
    { id: 'r2', pattern: '*://*.example.com/*', enabled: true },
    { id: 'r3', pattern: 'https://example.com/private/*', enabled: true }
  ];
  const matched = findFirstMatchingRule(rules, 'https://example.com/private/page');
  assert.equal(matched?.id, 'r2');
});

test('从当前网页生成规则', () => {
  assert.deepEqual(buildRuleFromTabUrl('https://sub.example.com/a/b?x=1'), {
    supported: true,
    pattern: '*://sub.example.com/*',
    host: 'sub.example.com'
  });

  assert.deepEqual(buildRuleFromTabUrl('http://localhost:5173/dashboard'), {
    supported: true,
    pattern: '*://localhost:5173/*',
    host: 'localhost:5173'
  });

  assert.equal(buildRuleFromTabUrl('chrome://extensions/').supported, false);
  assert.equal(buildRuleFromTabUrl('chrome-extension://abcdef/popup.html').supported, false);
  assert.equal(buildRuleFromTabUrl('about:blank').supported, false);
  assert.equal(buildRuleFromTabUrl('').supported, false);

  assert.equal(buildRuleFromTabUrl('https://example.com/a', 'subdomain').pattern, '*://*.example.com/*');
  assert.equal(buildRuleFromTabUrl('http://localhost:3000/a', 'subdomain').pattern, '*://localhost:3000/*');
  assert.equal(buildRuleFromTabUrl('https://example.com/a', 'scheme').pattern, 'https://*.example.com/*');
  assert.equal(buildRuleFromTabUrl('https://example.com/a').pattern, '*://*.example.com/*');

  // www.example.com 与 example.com 自动识别为 *.example.com
  assert.equal(buildRuleFromTabUrl('https://www.example.com/a').pattern, '*://*.example.com/*');
  assert.equal(buildRuleFromTabUrl('https://www.example.com:8080/a').pattern, '*://*.example.com:8080/*');
  assert.equal(buildRuleFromTabUrl('https://www.example.com/a', 'subdomain').pattern, '*://*.example.com/*');
  assert.equal(buildRuleFromTabUrl('https://www.example.com/a', 'scheme').pattern, 'https://*.example.com/*');
  assert.equal(parseRulePattern('*://example.com/*').rule.normalized, '*://*.example.com/*');
  assert.equal(parseRulePattern('*://www.example.com/*').rule.normalized, '*://*.example.com/*');
  assert.equal(parseRulePattern('*://*.www.example.com/*').rule.normalized, '*://*.example.com/*');
  assert.equal(parseRulePattern('*://www.com/*').rule.normalized, '*://*.www.com/*');
});

test('查找只解析一次 URL，并缓存有效及无效规则而不修改规则对象', (t) => {
  const OriginalURL = globalThis.URL;
  const OriginalRegExp = globalThis.RegExp;
  const originalTrim = String.prototype.trim;
  let urlParses = 0;
  let regexCompilations = 0;
  let invalidParses = 0;
  t.after(() => {
    globalThis.URL = OriginalURL;
    globalThis.RegExp = OriginalRegExp;
    String.prototype.trim = originalTrim;
  });
  globalThis.URL = class extends OriginalURL {
    constructor(...args) {
      super(...args);
      urlParses += 1;
    }
  };
  globalThis.RegExp = class extends OriginalRegExp {
    constructor(...args) {
      super(...args);
      regexCompilations += 1;
    }
  };
  String.prototype.trim = function () {
    if (String(this) === 'invalid-rule') {
      invalidParses += 1;
    }
    return originalTrim.call(this);
  };
  const rules = [
    { id: 'invalid', pattern: 'invalid-rule', enabled: true },
    { id: 'miss', pattern: '*://other.test/*', enabled: true },
    { id: 'hit', pattern: '*://example.test/*', enabled: true }
  ];
  rules.forEach(Object.freeze);
  const snapshot = JSON.stringify(rules);
  assert.equal(findFirstMatchingRule(rules, 'https://example.test/a'), rules[2]);
  assert.equal(findFirstMatchingRule(rules, 'https://example.test/b'), rules[2]);
  assert.equal(urlParses, 2);
  assert.equal(regexCompilations, 2);
  assert.equal(invalidParses, 1);
  assert.equal(JSON.stringify(rules), snapshot);
});

test('缓存不会影响原地编辑、启停和规则顺序', () => {
  const first = { id: 'first', pattern: '*://example.test/*', enabled: false };
  const second = { id: 'second', pattern: 'https://example.test/*', enabled: true };
  const rules = [first, second];
  const url = 'https://example.test/private/a';
  assert.equal(findFirstMatchingRule(rules, url), second);
  first.enabled = true;
  assert.equal(findFirstMatchingRule(rules, url), first);
  first.pattern = '*://other.test/*';
  assert.equal(findFirstMatchingRule(rules, url), second);
  assert.equal(findFirstMatchingRule(rules, 'https://other.test/'), first);
  first.pattern = 'invalid-rule';
  assert.equal(findFirstMatchingRule(rules, url), second);
  first.pattern = '*://example.test/*';
  assert.equal(findFirstMatchingRule(rules, url), first);
  rules.reverse();
  assert.equal(findFirstMatchingRule(rules, url), second);
  second.enabled = false;
  assert.equal(findFirstMatchingRule(rules, url), first);
});

test('无效 URL 和非 HTTP(S) URL 不匹配，规则对象调用方式保持兼容', () => {
  const pattern = '*://localhost:3000/search?q=a+b*';
  const rules = [{ id: 'r1', pattern, enabled: true }];
  for (const url of ['not-a-url', '', 'chrome://extensions/', 'ftp://localhost:3000/search?q=a+b']) {
    assert.equal(findFirstMatchingRule(rules, url), null);
    assert.equal(matchRule(pattern, url), false);
  }
  const url = 'http://localhost:3000/search?q=a+b&x=1';
  assert.equal(findFirstMatchingRule(rules, url), rules[0]);
  assert.equal(matchRule(rules[0], url), true);
  assert.equal(matchRule({ normalized: pattern }, url), true);
  assert.equal(matchRule(parseRulePattern(pattern).rule, url), true);
  assert.equal(matchRule('*://[::1]:3000/*', 'http://[::1]:3000/a'), true);
});
