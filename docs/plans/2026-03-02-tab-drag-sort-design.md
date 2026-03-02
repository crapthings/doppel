# Tab Drag Sort (Persistent)

## Goal
Enable horizontal drag-and-drop tab sorting with @dnd-kit.

## Requirements
- Dragging tabs left/right reorders visual list.
- Reorder persists in state and remains after restart.
- Reordering does not change active tab.

## Architecture
- Frontend tab bar uses `@dnd-kit/react` and `@dnd-kit/react/sortable`.
- On drag end, compute ordered tab IDs and call IPC `tab:reorder`.
- Main process reorders `state.tabs` based on the provided id order.

## IPC Contract
- `tab:reorder(payload)`
  - `payload.orderedTabIds: string[]`
- Returns full state snapshot after reorder.

## Data Rules
- Unknown ids in payload are ignored.
- Missing ids from payload are appended in existing order.
- `activeTabId` remains unchanged.

## UX
- Entire tab surface is draggable.
- Keep existing click-to-activate and close behaviors.
- Add subtle drag visual state.

## Validation
- Build passes.
- Reordered tabs stay after app restart.
- Active tab remains same after reorder.
