# Thread 9b: gating_followups (2026-10-23)

Branch `20261023-gating_followups`, PR #TBD, stacked on #261. Justify: green, every package.

**Status:** building. The six rulings are in; the orchestrator's review directives (S1, U1, U4,
U2, U5, M2, docs) follow.

* **Built**:
  * **Joins** (`vault.ts` `#ensureUnlocked`, `UnlockingKinds`): `ensureUnlocked` joins only
    `unlock_vault` and `initialize_gate`, hearing their refusal; a joined success is checked again
    against the call's own `renewMinutes`, and when it falls short the call goes round and raises
    its own. Any other kind (`change_passphrase`, `put_passkey`, `del_passkey`, `del_vault`) is
    waited out, whatever it settles with, and the question asked again. A call raises at most one
    gating of its own. `putWayin` / `delWayin` / `del` unchanged: join their own kind, wait out others.
  * **`putWayin('passkey')` on a novel vault** refuses `absent_vault` (`passkeyBeforePassphrase`),
    asking nothing, before or while any gating stands.
  * **Correctable kinds** (`gating.ts` `CorrectableKindVals`): `absent_wayin`, `damaged_wayin`,
    `passkey_unavailable` added. The attempt refuses, the gating stays open; nothing retries.
  * **Gone at birth** (`bank.ts` `#settleBirth`, `vault.ts` `[goneBy]`): a symbol getter the bank
    reads after the birth; a Vault object already gone is filed `refused` and never handed out.
  * **Other stores for a held scope** (`bank.ts` `checkSameStores`): `HeldEntry` keeps its
    `vaultDB` / `deviceDB`; a draft resolving to others refuses `bad_option`, during a birth or
    after. `reopenVault` lets go first, so it may move a scope to new stores.
  * **First gate's grant** (`gating.ts` `#grantAfterChange`, `unkeptUnlockError`): raised by
    `ensureUnlocked`, the device store's refusal goes through as its own kind, saying the
    passphrase was set; `putWayin` keeps the warning.
  * **Small items**: a `requestCleartext` throw after a deletion's write is sent marks the gating
    landed (`#decline(refusal)`), so `del()` resolves as the deletion went; `#strengthUnder`'s
    purpose line shortened.

* **Decisions taken** (the Coach's order: safe, simplest, ergonomic, plan):
  * **(a) ensureUnlocked joining a change kind.** Safe: a decline of "add a passkey" is not the
    user's answer to "unlock for getWhisper". Simplest safe: wait it out and recheck (no new state).
    The waiting call raises its own unlock only if still locked: after a successful change it is
    unlocked by the change's grant and asks nothing.
  * **(b) renewMinutes on a joined gating.** Join, then recheck `#leaseStandsPast(renewMillis)`;
    falling short, go round. Only a pantry take-up for a shorter `renewMinutes`, or a first gate
    whose grant was only warned of, falls short, so the user is asked at most once per call.
  * **(c) putWayin('passkey') on novel.** Refuse `absent_vault` (simplest; never resolves without
    a passkey). The ergonomic alternative -- an `initialize_gate` that requires the passkey -- needs
    a new field on the gating so the dialog knows; left for the Coach.
  * **Correctable kinds, one list.** Global, not per gating kind: simplest. In `del_passkey` or
    `change_passphrase` the user cannot correct `absent_wayin` / `damaged_wayin`; the dialog shows
    it in place and Cancel refuses the call `vault_locked`.

* **Deviations**:
  * `vault-wayins.test.ts` "putWayin with a passkey's answer on a novel vault sets the first
    passphrase and the passkey beside it" rewritten: it now refuses `absent_vault`, and the passkey
    goes beside the first passphrase through `ensureUnlocked`. `gating.test.ts`'s initialize_gate
    passkey test raises through `ensureUnlocked`. Two `vault-lease.test.ts` tests that asserted
    `damaged_wayin` / `absent_wayin` settle now assert they stay open; "sets the first passphrase
    though the device store has no room" now refuses `storage_*`. None deleted.

* **Discoveries**:
  * A watch-driven gone during birth cannot be raced in-process (the refresh takes more microtasks
    than the bank's settle), so the test spies on `Vault[bear]` and lets the newborn go.

* **For the Coach** (also the PR's open questions):
  * **A lock during a waited-out gating**: `ensureUnlocked` waiting out a `put_passkey` when a
    `lock()` lands is not refused; it raises its own unlock once that settles (as it already did
    behind a deletion). Rec: keep; a lock refuses the calls joined to the dialog, not those queued.
  * **putWayin('passkey') on novel**: refused, not an `initialize_gate` requiring the passkey. Rec:
    keep until the dialogs (thread 10) want it.
  * **Joined first gate under ensureUnlocked**: `putWayin('passphrase')` joining an
    `initialize_gate` that `ensureUnlocked` raised hears its `storage_*` refusal though the
    passphrase was set (the message says so). Rec: keep.
