---
---

Nothing ships: nothing under src/models/ is exported from src/index.ts. An 'unlock_vault' gating takes a passkey's answer through `attemptPasskey`, and shows the vault's passkey header (`passkeyHeader`, as `gate.passkeyHeader` holds it) for the host's `askPasskey`. Across the models a passkey's answer is left unspent only by a refusal the user can correct, and its PRF bytes are zeroed by tag, so bytes made in another realm are zeroed too. `isBytes` in checks/validator.ts is exported to the models; the package's exports do not change.
