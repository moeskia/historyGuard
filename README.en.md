<div align="center">
  <img src="icons/icon128.png" alt="HistoryGuard Logo" width="84" height="84" />
  <h1>HistoryGuard</h1>
  <p>A local-only <strong>Chrome Manifest V3</strong> extension that automatically filters and cleans matching browsing history</p>
  <p>
    <strong>English</strong> ·
    <a href="README.md">简体中文</a> ·
    <a href="PRIVACY.md">Privacy Policy</a> ·
    <a href="CHANGELOG.md">Changelog</a> ·
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

**HistoryGuard** is built with vanilla JavaScript, HTML, and CSS—with zero runtime dependencies, zero network requests, and zero telemetry. Whenever you visit a URL matching an active rule, HistoryGuard automatically removes it from Chrome browsing history.

---

## Features

- **Real-time Auto-Cleaning**: Listens to `chrome.history.onVisited` and removes matching entries when the master toggle and rule are enabled.
- **Scan Existing History on Add (Optional)**: Optionally scans and deletes existing matching history entries immediately upon adding or importing rules.
- **3-State Toolbar Icon**:
  - 🔵 **Blue**: Active, current tab does not match any enabled rule
  - 🟢 **Green**: Current tab URL matches an enabled rule
  - ⚪ **Gray**: Master auto-clean toggle is paused
- **Quick Add & Inline Editing**: Detects the current tab host with 3 quick-add rule templates (`host`, `subdomain`, `scheme`), plus checkbox toggling and inline editing (`Enter` to save / `Esc` to cancel).
- **2-Page Visual Stats**: Toggle between an SVG donut chart overview and detailed metrics, with per-rule daily/total counts and automatic midnight rollover.
- **8 Built-in Languages**: Supports `English`, `简体中文`, `繁體中文`, `日本語`, `한국어`, `Español`, `Français`, and `Deutsch`, with automatic browser language detection and instant switching.
- **Import / Export & Bulk Actions**: Enable all, pause all, clear rules, export JSON, and import JSON with automatic deduplication and validation.

---

## Installation & Packaging

### Load Unpacked (Development)

1. Clone this repository:
   ```bash
   git clone https://github.com/moeskia/historyGuard.git
   ```
2. Open `chrome://extensions/` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the project root (or `dist/unpacked/` after running `npm run pack`).

### Build Chrome Web Store Package

Requires Node.js `>= 20`:

```bash
npm run pack
```

This validates `manifest.json`, permissions, and required assets, excludes test/dev files, and outputs both `dist/unpacked/` and `dist/historyguard-v<version>.zip` ready for Chrome Web Store upload.

---

## Rule Syntax

| Pattern | Matches |
| --- | --- |
| `*://example.com/*` | All paths on `example.com` over HTTP and HTTPS |
| `*://*.example.com/*` | `example.com` apex domain and all subdomains (e.g. `sub.example.com`) |
| `https://example.com/private/*` | Only HTTPS URLs under `/private/` |
| `*://localhost:3000/*` | Local services with explicit ports |
| `*://*/secret/*` | `/secret/` path on any hostname |

- **Schemes**: `http://`, `https://`, and `*://` (both HTTP & HTTPS).
- **Wildcards**: `*` is the only wildcard character; all other regex metacharacters are matched literally.
- **Normalization**: Automatically normalizes scheme/host casing, strips redundant `www.` in quick-add apex domain mode, and prevents duplicate rules.

---

## Permissions & Privacy

| Permission | Purpose |
| --- | --- |
| `history` | Scans history when enabled (`search`), listens for new visits (`onVisited`), and removes matching entries (`deleteUrl`) |
| `storage` | Persists rules, preferences, and aggregate counts locally in `chrome.storage.local` |
| `tabs` | Updates the toolbar icon status (blue/green/gray) on tab changes and pre-fills Quick Add when opening the popup |

No `<all_urls>`, no content scripts, no external servers, and no URL logging of cleaned pages. See [PRIVACY.md](PRIVACY.md) for details.

---

## Project Structure

```text
historyGuard/
├── manifest.json         # Manifest V3 configuration
├── background.js         # Background Service Worker
├── popup.html / popup.js # Popup UI and interactions
├── styles.css            # Popup styles
├── lib/                  # Core modules (rule matching, state, i18n locales)
├── icons/                # Blue / green / gray toolbar icons
├── _locales/             # Chrome Web Store localized metadata
├── scripts/              # Release packaging script
└── tests/                # Automated test suite
```

---

## Development & Tests

Requires Node.js `>= 20`, zero external dependencies:

```bash
# Run unit and integration tests
npm test

# Build and validate Chrome Web Store zip archive
npm run pack
```

---

## License

Licensed under the [MIT License](LICENSE).
