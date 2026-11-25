# Changelog

All notable changes to **HistoryGuard** will be documented in this file.

## [1.1.0] - 2026-11-25

### Added
- **Multi-language UI**: Added 8 built-in languages (`简体中文`, `繁體中文`, `English`, `日本語`, `한국어`, `Español`, `Français`, `Deutsch`) with automatic browser language detection and instant switching in Settings.
- **Overview donut chart & inline editing**: Added a 2-page Stats overview (SVG donut chart + detailed metrics) and inline rule editing (`Enter` to save / `Esc` to cancel).
- **Privacy policy & release packaging**: Added bilingual [PRIVACY.md](PRIVACY.md), footer links with version info in Settings, and a clean Chrome Web Store package builder (`npm run pack`).

### Changed
- **Faster rule matching & cleanup**: Improved matching and batch history cleanup efficiency, reduced redundant toolbar icon updates, and streamlined popup rendering.
- **Minimal permissions**: Removed redundant `activeTab` permission while keeping `history`, `storage`, and `tabs`.

## [1.0.0]

### Added
- Initial Chrome Manifest V3 release with real-time history filtering, optional scan-on-add cleanup, 3-state toolbar icons (blue / green / gray), quick add from the active tab, JSON import/export, bulk rule actions, and per-rule/global cleanup statistics.
