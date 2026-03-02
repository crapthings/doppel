# Identity Browser Profile (Compliant Isolation)

## Goal
Provide per-identity browser profile settings for isolation and testing consistency.

## Scope
- Persist browser profile on each identity.
- Apply same profile for that identity's tab and popup windows.
- Editable in identity edit modal.
- Support one-click profile refresh (preset rotation).

## Fields
- userAgent
- language
- timezone
- platform
- screenWidth
- screenHeight
- deviceScaleFactor

## Runtime Application
- Apply UA via `webContents.setUserAgent`.
- Apply Accept-Language via session request headers.
- Inject language/timezone/platform/screen/devicePixelRatio through content preload script.

## Safety
- This is isolation/configuration support only.
- No bypass guarantees for anti-fraud systems.
