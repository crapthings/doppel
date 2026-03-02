# Electron Basic Bootstrap Design (React + Vite)

Date: 2026-03-02

## Goal
Add a basic Electron wrapper for the existing React + Vite app with:
- One-command local development
- Packaging outputs for macOS and Windows
- Minimal secure process boundaries

## Scope
- Add Electron main process and preload files
- Keep existing Vite renderer structure
- Add scripts for development and packaging
- Add electron-builder configuration for macOS (`dmg`) and Windows (`nsis`)

## Architecture
- `electron/main.cjs`: owns app lifecycle, creates BrowserWindow, loads dev server URL in development and built HTML in production.
- `electron/preload.cjs`: exposes a minimal safe API (`ping`) via `contextBridge`.
- `src/`: renderer React app, unchanged architecture.

## Runtime Flow
### Development
1. Run one command to start Vite and Electron.
2. Main process waits for Vite server readiness.
3. BrowserWindow loads `http://127.0.0.1:5173`.

### Production
1. Build renderer with Vite.
2. Electron loads local `dist/index.html`.
3. Package app with electron-builder.

## Security Baseline
- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- Node APIs are not directly available in renderer.
- Controlled preload bridge only.

## Error Handling
- Global logging for `uncaughtException` and `unhandledRejection` in main process.
- `did-fail-load` handler for window load failures.
- Dev startup wait timeout to prevent indefinite blank window scenario.

## Packaging
- Tool: `electron-builder`
- Targets:
  - macOS: `dmg`
  - Windows: `nsis`
- Output directory: `release/`
- Included files: `dist/**`, `electron/**`, and required metadata.

## Acceptance Criteria
- `pnpm dev:electron` starts Vite + Electron with one command.
- Renderer can call `window.api.ping()` and receive a response.
- `pnpm build:electron` succeeds and generates macOS and Windows installers in `release/`.
- App runs without enabling renderer-side Node integration.

## Notes
- Repository is currently not a git repository in this workspace, so committing this document is not possible here.
- `writing-plans` skill is not present in available skills list for this session; implementation proceeds directly as fallback.
