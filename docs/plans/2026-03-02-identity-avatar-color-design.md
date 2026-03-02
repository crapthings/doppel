# Identity Avatar + Color Design

## Goal
Add identity profile customization in the edit form:
- optional avatar upload (auto-resized)
- identity color selection
- render identity signal in each tab item

## Scope
- Edit identity modal supports name, color, and avatar.
- Tabs show full background color from identity.
- Tabs show avatar at left if present; hide when absent.
- Active tab uses non-border selection feedback.

## Data Model
Identity object fields:
- `id: string`
- `name: string`
- `partition: string`
- `color: string` (`#RRGGBB`)
- `avatarDataUrl: string` (optional image data URL)

Backward compatibility:
- missing color -> `#3b82f6`
- missing avatarDataUrl -> empty string

## API / IPC
- Add `identity:update-profile` handler with payload:
  - `identityId`
  - `name`
  - `color`
  - `avatarDataUrl`
- Keep `identity:update-name` compatible by routing to same updater.

## UI Behavior
- Color input uses native color picker.
- Avatar upload accepts image files.
- Avatar image is center-cropped and resized to 40x40 before saving.
- Max upload size: 5MB.
- Remove avatar action clears avatar field.

## Tab Rendering
- Background color = identity color.
- Text color auto-calculated for contrast.
- Active state = stronger shadow/opacity/weight (no border accent).

## Error Handling
- Non-image file: reject with error.
- Oversized file: reject with error.
- Invalid color/data URL on main process: sanitize to defaults.

## Validation
- Build success (`pnpm build`).
- Modal save persists after restart.
- No-avatar identities still render correctly.
