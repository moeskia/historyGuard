<div align="center">
  <img src="icons/icon128.png" alt="HistoryGuard Logo" width="84" height="84" />
  <h1>HistoryGuard</h1>
  <p>基于 <strong>Chrome Manifest V3</strong> 的纯本地浏览器历史记录自动过滤扩展</p>
  <p>
    <a href="README.en.md">English</a> ·
    <strong>简体中文</strong> ·
    <a href="PRIVACY.md">隐私政策</a> ·
    <a href="CHANGELOG.md">更新日志</a> ·
    <a href="LICENSE">MIT License</a>
  </p>
  <p>
    <img src="https://img.shields.io/badge/Manifest-V3-2563eb" alt="Manifest V3" />
    <img src="https://img.shields.io/badge/Chrome-%3E%3D109-10b981" alt="Chrome >= 109" />
    <img src="https://img.shields.io/badge/Dependencies-Zero-6366f1" alt="Zero Dependencies" />
    <img src="https://img.shields.io/badge/Languages-8-f59e0b" alt="8 Languages" />
    <img src="https://img.shields.io/badge/License-MIT-64748b" alt="MIT License" />
  </p>
</div>

---

**HistoryGuard** 使用原生 JavaScript、HTML 与 CSS 构建，零第三方运行时依赖、不发起任何网络请求、不上传任何浏览数据。启用规则后，扩展会在访问命中网址时自动从 Chrome 历史记录中移除对应记录。

---

## 核心特性

- **实时自动清理**：监听 `chrome.history.onVisited`，在总开关与对应规则启用时自动删除匹配的历史记录。
- **新增即扫（可选）**：添加或导入规则时可立即扫描并清理已存在的匹配历史记录，也可在设置中关闭以仅过滤后续新访问。
- **三色状态图标**：
  - 🔵 **蓝色**：扩展正常运行，当前标签页未命中过滤规则
  - 🟢 **绿色**：当前标签页网址已命中启用中的过滤规则
  - ⚪ **灰色**：全局自动清理总开关已关闭
- **快捷添加与原地编辑**：一键识别当前标签页生成规则，支持 3 种默认格式（当前主机 / 含子域名 / 仅当前协议）；规则列表支持复选框启停与原地行内编辑（`Enter` 保存 / `Esc` 取消）。
- **双页可视化统计**：支持环形占比图与详细指标双页切换，按规则独立统计今日清理、累计清理与最近清理时间，跨日自动重置今日计数。
- **8 种界面语言**：内置 `简体中文`、`繁體中文`、`English`、`日本語`、`한국어`、`Español`、`Français`、`Deutsch`，支持自动跟随浏览器语言或手动实时切换。
- **导入导出与批量管理**：支持一键全部启用、全部暂停、清空规则，以及 JSON 格式规则导出与去重导入。

---

## 安装与打包

### 本地加载（开发者模式）

1. 克隆或下载本仓库源码：
   ```bash
   git clone https://github.com/moeskia/historyGuard.git
   ```
2. 打开 Chrome 浏览器并访问 `chrome://extensions/`。
3. 开启右上角 **开发者模式**。
4. 点击 **加载已解压的扩展程序**，选择项目根目录（或执行 `npm run pack` 后选择 `dist/unpacked/`）。

### 生成 Chrome 应用商店上传包

项目内置零依赖打包脚本（需要 Node.js `>= 20`）：

```bash
npm run pack
```

执行后会校验 `manifest.json`、权限声明与所需资源完整性，剔除测试与开发文件，在 `dist/` 下生成 `dist/unpacked/` 与可直接上传至 Chrome Web Store 的 `dist/historyguard-v<version>.zip`。

---

## 规则语法与示例

### 常见示例

| 规则表达式 | 匹配说明 |
| --- | --- |
| `*://example.com/*` | 匹配 HTTP 与 HTTPS 下 `example.com` 的所有路径 |
| `*://*.example.com/*` | 匹配 `example.com` 主域名及其全部子域名（如 `sub.example.com`） |
| `https://example.com/private/*` | 仅匹配 HTTPS 协议下的 `/private/` 路径前缀 |
| `*://localhost:3000/*` | 匹配带显式端口号的本地服务 |
| `*://*/secret/*` | 匹配任意域名下的 `/secret/` 路径 |

### 匹配与规范化规则

- **协议**：仅支持 `http://`、`https://` 和 `*://`（同时匹配 HTTP 与 HTTPS）。
- **域名**：支持精确域名、`*.example.com` 与 `*`；其中 `*.example.com` 同时匹配主域名与子域名，不会误匹配相似域名（如 `badexample.com`）。
- **路径与查询参数**：仅 `*` 作为通配符，其余正则特殊字符按字面量匹配（不支持任意正则表达式）。
- **自动规范化**：新增与编辑时自动统一协议/域名大小写，在快捷主域名模式中去掉冗余 `www.` 前缀，并自动阻止重复规则。
- **快捷添加限制**：`chrome://`、扩展页等非 HTTP(S) 页面会自动禁用快捷添加并提示原因。

---

## 统计口径与本地隐私

- **计数依据**：仅在 `chrome.history.deleteUrl` 成功返回后计入清理次数（包含新增/导入规则时的立即清理与后续访问的自动清理）；删除失败不计入次数并弹出提示。
- **归属规则**：多条规则同时命中同一访问时，仅执行一次删除，统计归属列表中**第一条启用且匹配**的规则。
- **统计隔离**：删除单条规则会移除该规则明细，但保留全局累计统计；重置统计不会删除已配置规则；跨日后“今日清理”自动归零。
- **零数据上传**：规则、设置与计数仅保存在本地 `chrome.storage.local`，不记录被清理的 URL、网页标题或访问日志。完整说明见 [PRIVACY.md](PRIVACY.md)。

---

## 权限说明

| 权限 | 用途 |
| --- | --- |
| `history` | 扫描历史记录、监听 `chrome.history.onVisited` 并在命中规则时调用 `chrome.history.deleteUrl` |
| `storage` | 在 `chrome.storage.local` 中本地持久化保存规则、设置与统计计数 |
| `tabs` | 监听标签页切换与更新以动态更新扩展栏图标状态（蓝 / 绿 / 灰），并在打开弹窗时读取当前标签页用于快捷添加 |

> 不申请 `<all_urls>` 或网页内容脚本注入权限。

---

## 项目结构

```text
historyGuard/
├── manifest.json         # Manifest V3 扩展配置
├── background.js         # 后台 Service Worker
├── popup.html / popup.js # 弹窗页面与交互逻辑
├── styles.css            # 弹窗样式
├── lib/                  # 核心模块（规则匹配、状态管理、多语言词典）
├── icons/                # 蓝 / 绿 / 灰三套尺寸图标
├── _locales/             # Chrome 商店多语言扩展名称与描述
├── scripts/              # 商店发布打包脚本
└── tests/                # 自动化测试套件
```

---

## 开发与测试

需要 Node.js `>= 20`，零第三方依赖：

```bash
# 运行自动化测试
npm test

# 构建并校验 Chrome 应用商店上传 zip 包
npm run pack
```

---

## 反馈与贡献

欢迎通过 [GitHub Issues](https://github.com/moeskia/historyGuard/issues) 提交问题反馈或功能建议。本项目基于 [MIT License](LICENSE) 开源。
