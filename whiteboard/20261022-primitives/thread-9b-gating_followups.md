# Thread 9b: gating_followups (2026-10-23)

Branch `20261023-gating_followups`, PR [#262](https://github.com/mrflip/safebyok/pull/262), stacked
on #261. Justify: green, every package (core 3120 passed, 37 skipped).

**Status:** ready. The six rulings, then the orchestrator's review directives (S1, U1, U4, U2,
U5, M2, docs), all built.

* **Built, the rulings**:
  * **Joins** (`vault.ts` `#ensureUnlocked`, `UnlockingKinds`): `ensureUnlocked` joins only
    `unlock_vault` and `initialize_gate`, hearing their refusal; a joined success is checked again
    against the call's own `renewMinutes`, and when it falls short the call goes round and raises
    its own. Any other kind is waited out, whatever it settles with, and the question asked again.
    A call raises at most one gating of its own. `putWayin` / `delWayin` / `del` unchanged.
  * **`putWayin('passkey')` on a novel vault** refuses `absent_vault`, asking nothing.
  * **Correctable kinds**: `absent_wayin`, `damaged_wayin`, `passkey_unavailable` added to
    `CorrectableKindVals`. The attempt refuses, the gating stays open; nothing retries.
  * **Gone at birth** (`bank.ts` `#settleBirth`, `vault.ts` `[goneBy]`): a symbol getter the bank
    reads after the birth; a Vault object already gone is filed `refused`, never handed out.
  * **Other stores for a held scope** (`bank.ts` `checkSameStores`): a draft resolving to another
    `vaultDB` / `deviceDB` refuses `bad_option`, during a birth or after. `reopenVault` lets go
    first, so it may move a scope.
  * **First gate's grant** (`gating.ts` `#grantAfterChange`, `unkeptUnlockError`): raised by
    `ensureUnlocked`, the device store's refusal goes through as its own kind, saying the
    passphrase was set; `putWayin` keeps the warning.
  * **Small items**: a `requestCleartext` throw after a deletion's write is sent marks the gating
    landed (`#decline(refusal)`), so `del()` resolves as the deletion went; `#strengthUnder`'s
    purpose line shortened.
* **Built, the review directives**:
  * **S1**: the `requestCleartext` guard refuses `unexpected_error` with no `cause`; the logger
    hears `{ call: 'requestCleartext', refusalkind }` only (`parseRequestCleartext` takes the logger).
  * **U1**: `ProvingInside.putLease` resolves an Outcome; `grantLease` demands, then `valOf`. A
    failed derivation in `seal` demands (`demandAfterFailedSeal`: the vault on the seal's stamp,
    the gating not landed) before it throws. Tested for the passphrase deriver; the passkey's HKDF
    path is the same code shape, untested (WebCrypto would have to be made to throw).
  * **U4**: `#attempt` resolves what the gating settled with.
  * **U2**: `#takeOwnWrite` drops (memory only) a lease that no longer fits the new gate.
  * **U5**: `del()` says hello within `staleMinutes` before judging the picture novel.
  * **M2**: `seal`'s `{ gating }` is required; tests pass `StandingGating`.
  * **Docs**: `lockLanded` names what waiters hear; `GatingInside.delVault` the picture's epoch.

* **Decisions taken** (the Coach's order: safe, simplest, ergonomic, plan):
  * **(a) ensureUnlocked joining a change kind.** Safe: declining "add a passkey" is not the
    user's answer to "unlock for getWhisper". Simplest safe: wait it out and recheck. A successful
    change unlocks by its own grant, so the waiter asks nothing.
  * **(b) renewMinutes on a joined gating.** Join, then recheck `#leaseStandsPast(renewMillis)`;
    short, go round. Only a pantry take-up for a shorter `renewMinutes`, or a first gate whose
    grant was only warned of, falls short, so the user is asked at most once per call.
  * **(c) putWayin('passkey') on novel.** Refuse `absent_vault`: simplest, and never resolves
    without a passkey. The ergonomic alternative (an `initialize_gate` requiring the passkey) needs
    a new field on the gating so the dialog knows.
  * **Correctable kinds, one list**, not per gating kind. In `del_passkey` / `change_passphrase`
    the user cannot correct `absent_wayin` / `damaged_wayin`: shown in place, Cancel refuses
    `vault_locked`. `passkey_unavailable` is raised by React's passkey helpers, never inside an
    attempt today; listed so a dialog treats it alike.
  * **S1's log** names the refusalkind of a thrown VaultError, else null: never a message or name.
  * **U4** returns what the gating settled with (a lock: `vault_locked`), as directed, not
    `gating_landed`.

* **Deviations** (tests rewritten, none deleted; per-file `it(` before -> after): bank 54 -> 56,
  gating 30 -> 39, vault-del 27 -> 28, vault-lease 119 -> 121, others unchanged.
  * `vault-wayins` "putWayin with a passkey's answer on a novel vault sets the first passphrase
    and the passkey beside it": now refuses `absent_vault`, and sets both through `ensureUnlocked`.
  * `vault-lease`: `damaged_wayin` / `absent_wayin` "settling the gating" now stay open; "sets the
    first passphrase though the device store has no room" refuses `storage_*`; the two
    `requestCleartext` throw tests assert no `cause`.
  * `vault-del` "del() from a novel picture ... refuses absent_vault" holds within `staleMinutes`
    only; a new test covers the stale picture (U5).

* **Discoveries**:
  * A watch-driven gone during birth cannot be raced in-process (the refresh takes more microtasks
    than the bank's settle), so the test spies on `Vault[bear]` and lets the newborn go.
  * U2 hides behind the watch in a ringing store: its test needs a deaf vaultDB.
  * New refusal kinds: none. Contract lines now untrue (for thread 11): `putWayin` on a novel vault
    "whatever the slot"; `ensureUnlocked` "joins any gating ending in a lease"; the correctable
    list; `requestCleartext`'s throw "its cause".

* **For the Coach** (also the PR's open questions):
  * **A lock during a waited-out gating**: `ensureUnlocked` waiting out a `put_passkey` when a
    `lock()` lands is not refused; it raises its own unlock once that settles (as it already did
    behind a deletion). Rec: keep.
  * **putWayin('passkey') on novel** refuses rather than raising an `initialize_gate` that
    requires the passkey. Rec: keep until the dialogs want it.
  * **Joined first gate**: `putWayin('passphrase')` joining an `initialize_gate` that
    `ensureUnlocked` raised hears its `storage_*` refusal though the passphrase was set (the
    message says so). Rec: keep.
  * **U4's refusal**: an attempt overtaken by a lock resolves `vault_locked` (what the gating
    settled with), where other late attempts say `gating_landed`. Rec: keep, as directed.
