# Bookmarks Home Page

## Goal
Replace the default example-domain tab with an internal React bookmarks page.

## Requirements
- Default new tab opens bookmarks home (`doppel://bookmarks`).
- Bookmarks are global (shared across all identities).
- User can add/edit/remove bookmarks.
- User can drag-and-drop bookmarks to reorder.
- Clicking a bookmark opens URL in a new tab.

## Architecture
- Main process stores `state.bookmarks` in `state.json`.
- Add bookmark IPC handlers: create/update/remove/reorder.
- Renderer detects `activeTab.url === doppel://bookmarks` and renders `BookmarksPage` instead of webview.
- Internal bookmarks tab does not create a `WebContentsView`.
