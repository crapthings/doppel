# Identity Remove (Cascade)

## Goal
Allow deleting an identity and cascade remove all tabs under that identity.

## Rules
- Deleting an identity removes its associated tabs and destroys related views.
- If all identities are removed, auto-create a fallback `Default` identity.
- If no tabs remain, auto-create a default tab under the first identity.
- Active tab/selected identity fallback to valid remaining items.

## UX
- Identity list includes a `删除` action.
- Prompt confirmation before delete.

## IPC
- `identity:remove(identityId)` -> returns full app state snapshot.
