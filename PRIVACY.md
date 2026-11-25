# HistoryGuard Privacy Policy / 隐私政策

**Last updated / 更新日期:** 2026-11-25

---

## English

**HistoryGuard** is a local-only Chrome extension designed to automatically filter and remove matching entries from your browser history based on rules you configure.

### 1. Data Collection & Transmission
- **Zero data collection:** HistoryGuard does **not** collect, transmit, sell, or share any personal data, browsing history, URLs, or usage analytics.
- **No external servers:** The extension makes zero network requests and contains no third-party tracking, analytics, or advertising SDKs.

### 2. Local Storage
- Your filter rules, preferences (such as language and quick-add mode), and aggregate cleanup counters (total cleaned, today's count, and last cleaned timestamp) are stored strictly locally on your device via `chrome.storage.local`.
- HistoryGuard does **not** store or log the URLs or page titles of deleted history entries.

### 3. Permissions Usage
- **`history`**: Used solely to monitor newly visited history entries (`chrome.history.onVisited`), scan existing history when enabled on rule addition/import (`chrome.history.search`), and remove entries matching your rules (`chrome.history.deleteUrl`).
- **`storage`**: Used solely to persist your rules, preferences, and aggregate cleanup counts locally in `chrome.storage.local`.
- **`tabs`**: Used solely to read the active or updated tab URL in order to update the toolbar icon status (blue / green / gray) and pre-fill the Quick Add input when you open the popup.

### 4. Data Deletion
You can clear rules, reset statistics, or uninstall the extension at any time via Chrome. Uninstalling HistoryGuard removes all locally stored extension data.

### 5. Contact & Source Code
If you have questions about this privacy policy, please visit the project repository:
https://github.com/moeskia/historyGuard

---

## 简体中文

**HistoryGuard** 是一款纯本地运行的 Chrome 浏览器扩展，用于根据您配置的通配符规则自动过滤并删除匹配的浏览器历史记录。

### 1. 数据收集与传输
- **零数据收集**：HistoryGuard **不会**收集、传输、出售或共享任何个人数据、浏览历史、访问网址或使用统计。
- **不联网**：扩展不发起任何外部网络请求，不包含任何第三方统计、追踪或广告 SDK。

### 2. 本地存储
- 您配置的过滤规则、偏好设置（如界面语言、快捷添加格式）以及聚合清理计数（累计清理次数、今日清理次数、最近清理时间）仅通过 `chrome.storage.local` 保存在您的本地设备中。
- HistoryGuard **不会**记录或保存被删除历史记录的具体 URL 或网页标题。

### 3. 权限用途说明
- **`history`**：仅用于在总开关与规则启用时监听新访问历史（`chrome.history.onVisited`）、在新增或导入规则且开启对应选项时扫描已有历史（`chrome.history.search`），并删除命中规则的历史记录（`chrome.history.deleteUrl`）。
- **`storage`**：仅用于在本地 `chrome.storage.local` 中保存您的规则、设置与统计计数。
- **`tabs`**：仅用于在切换或更新标签页时判断当前网址是否命中规则以更新扩展图标状态（蓝 / 绿 / 灰），并在打开弹窗时识别当前标签页地址用于快捷添加。

### 4. 数据清除
您可以随时在扩展内重置统计、清空规则，或在 Chrome 中卸载本扩展；卸载后所有本地存储数据将被一并移除。

### 5. 联系方式与源代码
如有任何隐私相关问题，请访问项目开源仓库反馈：
https://github.com/moeskia/historyGuard
