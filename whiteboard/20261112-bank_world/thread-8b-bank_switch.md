# Thread 8b: bank_switch (2026-11-12)

Branch `20261112-bank_switch`, PR #667, base main. **Rework leg 3 landed plan steps 9 and 10, as far as named
below.** Red by design (ground rule 20) until 8c. safebyok: `src` and `tests` typecheck and lint clean; vitest red in
four files, 29 cases (*Still red*), plus the named 8c skips. safebyok-react: 48 tsc errors, all the gate verbs' or the
old vaultDB's (*Still red*). `src` since the base: +1333 / -985; leg 3 alone: +36 / -11.

* **Built**, earlier legs: `vault_locked` is `bank_locked` (one thrower `needUnlocked`); `Device...` announcement
  types; `Listing` asks `bankDB` and hands `answer.parent` to `world.receiveParent`; `Storable` tattoos only the
  scope (`vault_tok` moved down, pulled forward from thread 10).
* **Built**, leg 2 (commits 97e81d750, b4c4836f7, bfa81d650, 09b9529ff): `Gate` and `Bank` as Storables in stub
  listings, the Vault's lease moved to the Bank, `Device.ensureBank`, gatings of a bank. Detail in
  `thread-8b-bank_switch-leg2.md` beside this file.
* **Built**, leg 3 (commits b45d0af6f, dc2578d20, 9fc6cf36c):
  - Ground rule 11: `Vault.lock`, `ensureUnlocked`, `unlock` (and try forms), `isLocked`, `isUnlocked` are one-line
    calls of the bank's. The Bank aligns its vaults through `vault.alignLock()` (the listeners and box listing only),
    as `Listing.lock` calls each thing's `lock`, which would call the bank again. `VaultWorld` names the four.
  - `bank.maingate` demands the bank enabled first. `boxDna`/`boxPatch` parse BX box rows (they refused them: a bug).
    `BankDB`, `AdapterBankDB` exported. Changeset covers both packages; VOCABULARY's vault record has no gate.
  - Fixtures over `MemoryBankDB`: `models-world` (`TestableBankDB`); `bank-world` (`ensureBuilt` builds the bank once
    on another device, so `bankOn` answers a locked bank); `vault-world` (a real `Device`, a dialog per device,
    `bankTyping`/`unlockTyping`, `anotherSession()` a new device on the same deviceDB, `anotherDevice(deviceDB?)`,
    `listingOptsOf`, `makeBornVaultAndFriend` returns the proving and gate too); `proving-world.listedGateOf(record)`.
  - Suites rewritten to the bank: gate, proving, box suites, vault, vault-life, vault-lease, vault-unlock,
    vault-listing, vault-boxes, halpimonfire, gating (build_bank/unlock_bank), bank, bank-probe; device and proof
    in part.
* **Skipped, naming 8c** (ground rule waived for these): `vault-gate.test.ts` whole, `@ts-nocheck` and one listed
  `eslint-disable`, every describe `.skip`; it also holds, under `// == [From <suite>]` banners, what moved there:
  halpimonfire's gate change, vault-life's and vault-lease's gate changes, vault-unlock's cached lease across a gate
  change, vault-listing's gate verbs and buildVault/launchBirth cases, three proof stories (gate prompts, vault
  delete). In `gating.test.ts`, three `it.skip` with a `// 8c:` line: another kind's cleartexts, a bank deleted
  during the dialog, a newer bank life during a build.
* **Dropped, subject gone** (not 8c): vault.test's gate-in-record, sparse-vault and VaultListing world checks;
  vault-unlock's two sparse-vault unlocks; vault-listing's lease forget on a vault tombstone (a vault's tombstone no
  longer touches the bank's lease; one test now says so); gating's birth of a second vault through a gating.
* **Still red**, for the next leg or 8c:
  - safebyok vitest: device.test 16, bank-ending 6 (autolock and lifecycle, not its delete or tombstone cases),
    proof 5, readme-recipes 2. Most meet `device.ensureBank()` over a world with no bank (it now opens a build_bank
    gating the vi.fn dialog dismisses: `bank-world`'s `ensureBuilt` first would serve), `onLifecycle` hearing
    `helloed` beside `lease_revoke_failed`, and snapshots that name `unlock_vault`. Not looked into case by case.
  - safebyok-react tsc 48: the replace/add/revoke modals and their tests and `shapes.ts` (8c's gatingkinds),
    `test-helpers.ts` (the vault's prompts, 8c), `bank-provider`/`hooks` tests spying `tryListVaults` and passing a
    `vaultDB`, and the devmode vault-db inspector, which still takes a VaultDB. React tests not run.

* **Decisions taken**:
  - Steps 3 and 4 landed as one commit: `consts.ts` names both new modelkinds.
  - A stub's `nothingStoredError`/`damagedStoredError` reuse existing throwers (Coach): the gate `mainGateMissing`
    (param widened to `BankSparse`), the bank `actRefused('vault', 'bank_void')`. `rowOfOtherVaultTok` became
    `rowOfOtherWorld(received, tokname)`, used by the gate, vault and box listings.
  - Stub `doTryPut`/`tombstoneOver`/`doTryDel` throw one new thrower, `writtenByOwnVerbs` (`bad_option`): no
    existing one says "use the bank's verbs". Reachable through `Storable.del` on a bank or gate.
  - Stubs' `watchRows` start nothing; the vault listing watches the bank scope and keeps vault rows only.
  - `Bank.ensureTimely` resolves at once, as before: the bank row arrives as every gate and vault answer's parent.
    The unlock refreshes `maingate` (one `ensureBank`), which also refreshes the bank row.
  - `lease_revoke_failed` carries `bank` (was `vault`); the default vacates that Bank, as it vacated the vault.
  - The bank snapshot gains `isLocked` only, not `maingate` (8c, with the gate prompts' dialogs).
  - `Device.device_tok` is `string | null`; the Bank checks it through the existing `bankArgs` at construction.
* **Deviations**:
  - Rebased onto `origin/main` before leg 1 (tag `20261112-bank_switch-prerebase`).
  - Steps 6 to 8 done in this leg though the handoff named 3 to 5: the vault listing's switch, the Vault losing its
    lease and the gating are one step (cut: *Atomic*), and `src` would not compile at a narrower seam.
* **Discoveries**:
  - The vault listing's watch delivers a tombstone or rebirth from another session before a box answer's parent can:
    vault-listing's two parent cases now refuse 'disabled' first, so they pin no kind (rule 17).
  - A gate row changed on another device is heard only on the next `ensureBank`: no listing delivers gate
    notices. 8c (gate verbs) should decide.
  - A newer bank life delivered as a parent remakes the Bank in its listing while the Device keeps the old one in
    `#bank`, and a vault listing mid-delivery meets its bank vacated. 8c (tombstones).
  - The old vaultDB stack (`storage/vault-db.ts`, adapters, classifier) is still in `src`, unreferenced by models.
* **For the Coach**:
  - `writtenByOwnVerbs`, the one new thrower (kind `bad_option`).
  - `lease_revoke_failed` names the bank, and the default vacates the bank: a contract change.
  - `vault.lock()` locks the bank again (ground rule 11), as do `ensureUnlocked` and `unlock`.
  - A vault's delete or rebirth no longer forgets the bank's lease or locks anything: tests now say so.
  - Carried: `ensureVault`'s `bank_locked` judged by the listing; vault listing lists empty on a val-null
    `ensureBank` until 8c; vault snapshot keeps `isLocked`.
