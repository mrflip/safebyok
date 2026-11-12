# Thread 8c: bank_prompts (2026-11-12)

Branch `20261112-bank_prompts`, PR #673, stacked on #667 (8b). Justify: every package green
(safebyok 3397, react 255, fastkey 43, indexeddb 376, postgres 433, convex 508, graphql 408,
e2e 549, root 285). **Red: `demos/safebyok-demo-react`** (lint 7, typecheck 4, tests 67 of 98),
left for thread 12, which threads.md gives "the `bankDB` prop and `IdbBankDB` in the demo".

* **Built**
  * `Gate`: `replacePassphrasePrompt`, `addPasskeyPrompt`, `revokePasskeyPrompt` (each with a `try`
    form), launching on the bank. `GateListing` issues the gate verbs over `bankDB`
    (`replacePassphrase`, `addPasskey`, `revokePasskey` and their `try` forms, `#gateMoveOf`).
  * `gating.ts`: acts `replacePassphrase`, `addPasskey`, `revokePasskey`, `delBank`; helpers
    `timelyGate` and `timelyAnte`. The ante is taken *before* the proving, so a gate row that lands
    during the proving refuses `stale_write`. Each act re-grants the lease citing the gate row it
    wrote (`UnlockByProving` takes an optional `cited`), not a newer one that arrived meanwhile.
  * `Bank`: `prompt(gatingkind)` (public; `unlock()` uses it), `delPrompt`/`tryDelPrompt`;
    `BankListing.delBank` stores the tombstone; the snapshot gains `maingate`.
  * Gatingkinds `replace_passphrase`, `add_passkey`, `revoke_passkey`, `del_bank`, with cleartexts
    checkers (`bankDelCleartexts` new).
  * `Vault`: the three prompt one-liners (rule 11 scaffold), calling `world.maingate`.
  * Gate notices through the watch: `Listing.deliverNotice` (was `#onNotice`); the vault listing's
    `watchRows` fans each notice to the bank listing, the gate listing, then itself.
  * `#listingOfEnsured` keeps `answer.parent` for gotgone.
  * `device.bank` is null once the bank is disabled (vacated for a newer life) or absent
    (deleted); `#bringUp` takes the listed bank where it is live, else fetches.
  * React: `Doing.del_bank`; the three gate modals name `gating.banklabel` in the username; the
    gating modal's map is partial, so `del_bank` meets `NoDialog` (dismissed). The device-DB
    inspector's columns are a lease's (`user_id, banklabel, bank_tok, proved_at`).
  * Tests: `vault-gate.test.ts` rewritten over the bank (58 cases, no `@ts-nocheck`, no disables);
    gating.test's three `8c` skips back; proof.test gains three stories (replace, passkey add and
    revoke, a second device's changes ending in `delPrompt`); `bank-gate-listings.test.ts` (new,
    entrypoints). React tests: provider tests over a bank built first (`builtWorld`), the gating
    helpers raise on a `Device` (`TH.building` = `device.tryEnsureBank()`), `ShowsVault`'s Open
    unlocks the bank then ensures the vault. Fastkey's shared-vault cases build with the deriver
    under test (they had silently built with `testDeriver` via `ensureBuilt`).
* **src lines**: this thread +284 −48 (safebyok and safebyok-react `src/`); the line from main,
  +1581 −997. The line does not end simpler in count; the per-vault gating code it replaced is
  gone, but the bank adds a listing layer (bank, gate) beside the vault's.
* **Decisions taken**
  * A newer bank life: the Device lets go (getter goes null); the next `ensureBank` takes the bank
    listed without refetching. A deleted vault's snapshot keeps reading the bank's lock.
  * A refused build's parent is still not delivered: it needs a try/catch to keep the build's own
    refusal first, so not one line.
  * The newer-life-during-build case refuses as `rowOfOtherWorld` (storage_issue); rule 17, so the
    test pins no kind.
  * Entrypoint tests pin the thrower by message (`writtenByOwnVerbs().message`), not the kind.
* **Dropped from vault-gate** (subject gone): "a vault record stored without its gate"; "a passkey
  wayin stored damaged" (2, rule 24); vault.del's "reports a refused forget" (a vault delete no
  longer forgets the lease); listing.del's "refuses a record of another vault life" (duplicate of
  vault-listing.test's); all 7 "building a vault by its gate" (`buildVault`, `launchBirth` gone).
  React: six `DevVaultDBInspector` cases over a bank's rows (no bank writes a VaultDB; thread 16
  retires it), keeping its signed-out case.
* **Deviations**: the demo left red (above). React's `CreateVaultButton`, `ShowsVault` and the
  provider's dialog tests were moved minimally: "builds the vault from a click" became "builds the
  bank from its dialog, then the vault from a click"; the other dialog cases open the unlock dialog.
* **Discoveries**
  * The generic `Listing.put` checks `expected` with a vaulted row's shape (`vault_tok` required),
    so the bank and gate listings' `doTryPut` stubs are reached only with a fabricated `vault_tok`.
  * `GateListing`'s verbs do not check the wayin they lay; the bankDB's ask checker refuses one.
  * React calls `ensureBank` once per device: after a delete or a newer life the host sees no bank
    until it remakes the device (thread 12).
  * An empty bankDB makes `ensureBank` open `build_bank` at sign-in: every React or demo test that
    expects a ready bank over a fresh world must build one first.
* **Set aside**: re-reading `gate.pickle()` after the proving (a row landing mid-proving would pass
  unseen); the lease citing `bank.maingate` after the write (cites a newer row); building the demo
  onto the bank now (its UX waits on thread 12's React design).
* **For the Coach**: two device tells per lock and unlock (carried, unchanged); a gate row landing
  between a gate verb's write and its lease grant (a race: an open-matters line, no fix).
