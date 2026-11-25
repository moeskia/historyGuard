const SUPPORTED_SCHEMES = new Set(['http', 'https', '*']);
const HOSTNAME_REGEX = /^(?:\[[0-9a-f:]+\]|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)$/;

/**
 * 转义正则表达式特殊字符，仅保留 * 作为通配符。
 */
function wildcardToRegExpSource(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return escaped.replace(/\*/g, '.*');
}

function wildcardToRegExp(pattern) {
  return new RegExp(`^${wildcardToRegExpSource(pattern)}$`);
}
function splitHostAndPort(hostPart) {
  if (!hostPart) {
    return null;
  }

  // 处理 IPv6 字面量，例如 [::1] 或 [::1]:8080
  if (hostPart.startsWith('[')) {
    const closeIdx = hostPart.indexOf(']');
    if (closeIdx === -1) {
      return null;
    }
    const hostname = hostPart.slice(0, closeIdx + 1).toLowerCase();
    const rest = hostPart.slice(closeIdx + 1);
    if (!rest) {
      return { hostname, port: '' };
    }
    if (!rest.startsWith(':')) {
      return null;
    }
    const port = rest.slice(1);
    return isValidPort(port) ? { hostname, port } : null;
  }

  const colonIdx = hostPart.indexOf(':');
  if (colonIdx === -1) {
    return { hostname: hostPart.toLowerCase(), port: '' };
  }
  // 多个冒号且未用方括号包裹，视为非法主机格式
  if (hostPart.indexOf(':', colonIdx + 1) !== -1) {
    return null;
  }

  const hostname = hostPart.slice(0, colonIdx).toLowerCase();
  const port = hostPart.slice(colonIdx + 1);
  return isValidPort(port) ? { hostname, port } : null;
}

function isValidPort(port) {
  if (!/^\d{1,5}$/.test(port)) {
    return false;
  }
  const num = Number(port);
  return num >= 1 && num <= 65535;
}

const WILDCARD_LABEL_REGEX = /^[a-z0-9*](?:[a-z0-9*-]{0,61}[a-z0-9*])?$/;

function isValidHostname(hostname) {
  if (!hostname || hostname.length > 253) {
    return false;
  }
  return HOSTNAME_REGEX.test(hostname);
}
function isValidWildcardHostname(hostname) {
  if (!hostname || hostname.length > 253) {
    return false;
  }
  if (hostname.startsWith('.') || hostname.endsWith('.') || hostname.includes('..')) {
    return false;
  }
  if (!/[a-z0-9]/.test(hostname)) {
    return false;
  }
  const labels = hostname.split('.');
  return labels.every((label) => WILDCARD_LABEL_REGEX.test(label));
}
/**
 * 将 www.example.com 与两段主域名（如 example.com）规范化为 *.example.com。
 */
function normalizeRuleHostname(hostname) {
  if (hostname.startsWith('www.') && hostname.slice(4).includes('.')) {
    return `*.${hostname.slice(4)}`;
  }
  if (hostname.startsWith('*.www.') && hostname.slice(6).includes('.')) {
    return `*.${hostname.slice(6)}`;
  }
  if (
    !hostname.includes('*') &&
    !/^\d+\.\d+\.\d+\.\d+$/.test(hostname) &&
    hostname.split('.').length === 2
  ) {
    return `*.${hostname}`;
  }
  return hostname;
}
/**
 * 解析并规范化通配符规则。
 * 返回 { ok: true, rule } 或 { ok: false, error }。
 */
export function parseRulePattern(rawPattern) {
  if (typeof rawPattern !== 'string') {
    return { ok: false, error: '规则必须是文本' };
  }

  const trimmed = rawPattern.trim();
  if (!trimmed) {
    return { ok: false, error: '请输入规则' };
  }

  if (/\s/.test(trimmed)) {
    return { ok: false, error: '规则中不能包含空白字符' };
  }

  const schemeMatch = /^([a-z*]+):\/\/(.*)$/i.exec(trimmed);
  if (!schemeMatch) {
    return { ok: false, error: '规则必须以 http://、https:// 或 *:// 开头' };
  }

  const scheme = schemeMatch[1].toLowerCase();
  if (!SUPPORTED_SCHEMES.has(scheme)) {
    return { ok: false, error: '协议仅支持 http://、https:// 或 *://' };
  }

  const remainder = schemeMatch[2];
  if (!remainder) {
    return { ok: false, error: '缺少域名部分' };
  }

  const slashIdx = remainder.indexOf('/');
  const rawHostPort = slashIdx === -1 ? remainder : remainder.slice(0, slashIdx);
  const rawPath = slashIdx === -1 ? '/*' : remainder.slice(slashIdx);

  if (!rawHostPort) {
    return { ok: false, error: '缺少域名部分' };
  }

  const parsedHost = splitHostAndPort(rawHostPort);
  if (!parsedHost) {
    return { ok: false, error: '域名或端口格式无效' };
  }
  let hostname = normalizeRuleHostname(parsedHost.hostname).replace(/\*+/g, '*');
  const { port } = parsedHost;

  let hostMode;
  let baseDomain = '';
  let hostRegex = null;
  if (hostname === '*') {
    if (port) {
      return { ok: false, error: '任意域名 * 不支持附加端口' };
    }
    hostMode = 'any';
  } else if (hostname.startsWith('*.') && !hostname.slice(2).includes('*')) {
    baseDomain = hostname.slice(2);
    if (!isValidHostname(baseDomain)) {
      return { ok: false, error: '通配符域名格式无效，示例：*.example.com' };
    }
    hostMode = 'subdomain';
  } else if (hostname.includes('*')) {
    if (!isValidWildcardHostname(hostname)) {
      return { ok: false, error: '通配符域名格式无效，示例：*gard.com 或 *.example.com' };
    }
    hostMode = 'wildcard';
    baseDomain = hostname;
    hostRegex = hostname.startsWith('*.')
      ? new RegExp(`^(?:.*\\.)?${wildcardToRegExpSource(hostname.slice(2))}$`)
      : wildcardToRegExp(hostname);
  } else {
    if (!isValidHostname(hostname)) {
      return { ok: false, error: '域名格式无效' };
    }
    hostMode = 'exact';
    baseDomain = hostname;
  }
  const normalizedHostPort = port ? `${hostname}:${port}` : hostname;
  const normalized = `${scheme}://${normalizedHostPort}${rawPath}`;
  return {
    ok: true,
    rule: {
      normalized,
      scheme,
      hostMode,
      baseDomain,
      port,
      hostRegex,
      pathPattern: rawPath,
      pathRegex: wildcardToRegExp(rawPath)
    }
  };
}

/**
 * 判断 URL 是否匹配已解析（或原始）规则。
 */
export function matchRule(ruleOrPattern, targetUrl) {
  let parsed = ruleOrPattern;
  if (typeof ruleOrPattern === 'string') {
    const res = parseRulePattern(ruleOrPattern);
    if (!res.ok) {
      return false;
    }
    parsed = res.rule;
  } else if (!parsed.pathRegex) {
    const res = parseRulePattern(parsed.pattern || parsed.normalized);
    if (!res.ok) {
      return false;
    }
    parsed = res.rule;
  }

  let url;
  try {
    url = new URL(targetUrl);
  } catch {
    return false;
  }

  const urlScheme = url.protocol.slice(0, -1).toLowerCase();
  if (urlScheme !== 'http' && urlScheme !== 'https') {
    return false;
  }
  if (parsed.scheme !== '*' && parsed.scheme !== urlScheme) {
    return false;
  }

  const urlHostname = url.hostname.toLowerCase();
  const urlPort = url.port;

  if (parsed.hostMode !== 'any') {
    if (parsed.port !== urlPort) {
      return false;
    }
    if (parsed.hostMode === 'exact') {
      if (urlHostname !== parsed.baseDomain) {
        return false;
      }
    } else if (parsed.hostMode === 'subdomain') {
      if (urlHostname !== parsed.baseDomain && !urlHostname.endsWith(`.${parsed.baseDomain}`)) {
        return false;
      }
    } else if (parsed.hostMode === 'wildcard') {
      if (!parsed.hostRegex.test(urlHostname)) {
        return false;
      }
    }
  }

  const pathAndQuery = `${url.pathname}${url.search}`;
  return parsed.pathRegex.test(pathAndQuery);
}

/**
 * 查找第一条启用且匹配的规则。
 */
export function findFirstMatchingRule(rules, targetUrl) {
  for (const rule of rules) {
    if (!rule.enabled) {
      continue;
    }
    if (matchRule(rule.pattern, targetUrl)) {
      return rule;
    }
  }
  return null;
}

/**
 * 根据当前标签页 URL 生成默认的通配符规则。
 */
export function buildRuleFromTabUrl(tabUrl, mode = 'host') {
  if (!tabUrl || typeof tabUrl !== 'string') {
    return { supported: false, reason: '当前标签页没有可识别的网址' };
  }

  let url;
  try {
    url = new URL(tabUrl);
  } catch {
    return { supported: false, reason: '当前标签页网址格式无效' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      supported: false,
      reason: `不支持 ${url.protocol}// 页面，仅支持 http:// 和 https:// 网页`
    };
  }

  if (!url.host) {
    return { supported: false, reason: '当前标签页缺少主机名' };
  }

  const host = url.host.toLowerCase();
  const hostname = url.hostname.toLowerCase();
  const portSuffix = url.port ? `:${url.port}` : '';
  const normalizedHost = `${normalizeRuleHostname(hostname)}${portSuffix}`;
  let pattern;
  if (mode === 'scheme') {
    pattern = `${url.protocol}//${normalizedHost}/*`;
  } else if (
    mode === 'subdomain' &&
    !normalizedHost.startsWith('*.') &&
    hostname.includes('.') &&
    !/^\d+\.\d+\.\d+\.\d+$/.test(hostname)
  ) {
    pattern = `*://*.${normalizedHost}/*`;
  } else {
    pattern = `*://${normalizedHost}/*`;
  }

  return {
    supported: true,
    pattern,
    host
  };
}
