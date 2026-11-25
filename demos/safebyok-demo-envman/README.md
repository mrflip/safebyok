# safebyok-demo-envman

Envman, a doppler-lite on the new core (`safebyok`) and its React layer (`safebyok-react`). Never published.

You sign in with any username (there is no password), create a vault with a passphrase, and add secrets: each has a
title, a description, a rotation period and the day it was last rotated, stored readable beside it, and a value, stored
encrypted. A secret older than its rotation period shows red. A value shows masked until you click into it; Save or
Undo the edit. The gear opens a secret's settings: rename it, change its period, or back-date it.

```sh
pnpm demo:envman          # from the repo root: builds what the demo needs, then starts Vite
```

## What it shows

* `src/lib/sok.ts`: the giver and its bank, made once at module scope.
* `src/components/EnvmanPage.tsx`: the page switched on `Envman.useWorld().stage`, one component for locked and
  unlocked so a row waiting on the unlock dialog stays mounted, and the kit's `CreateVaultForm`, `UnlockForm` and
  `UnlockDialog`, each finding its bank through the provider.
* `src/components/EnvList.tsx`: `Envman.useBoxList()`, a row each.
* `src/components/EnvRow.tsx`: each row's `Envman.useBox`, nothing for a deleted box, and `Envman.useDraft` for the
  value's Save and Undo on a plain input of its `whisperField('val')`; Save stamps `last_rotated_at` when the value
  changed. Beside the input, the parts' `WhisperMask` writes the value's mask into the page: its last four characters
  while unlocked, the stored mask while locked. On a lock, `Envman.useStageChange` discards the row's open draft: the
  library leaves it alone, and this demo chooses to.
* `src/components/EnvSettingsDialog.tsx`: the gear's dialog, the kit's `ModalDialog`, setting the draft's sidecar.
* `src/components/AddEnvForm.tsx`: `Envman.putBoxAction` under `useActionState`, a new box under a minted label per
  submit, its sidecar mask from `mask` (`tail: 0`).
* `src/lib/env-sidecar.ts`: the stored sidecar, `title`, `description`, `rotation_period_ms`, `last_rotated_at` and `mask`.

## Demo scaffolding

* **The vault lives in localStorage** (`src/lib/local-vault-db.ts`, Knock-Knock's, under its own prefix): the new core
  has only a memory vaultDB, so the demo saves it after each write. A real host stores its vault on its backend.
* **Signing in is fake** (`src/lib/session.ts`). Signing out reloads the page: the giver serves one user for the
  page's life.
* **A reload lands locked**: nothing keeps the lease across a reload yet.
* **A row turns red as of when it was shown**: one left open past its due day turns red at the next reload.
