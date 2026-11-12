# Thread 8b: bank_switch (2026-11-12)

Branch `20261112-bank_switch`, PR #667, base main. **Rework leg 4 made safebyok green** (plan steps 9 and 10 done).
Red by design (ground rule 20) until 8c, in safebyok-react only. safebyok: typecheck and lint clean; vitest 3142
passed, 70 skipped (the named 8c skips), 0 failed. safebyok-react: 48 tsc errors, vitest 94 failed / 167 passed
(*Still red*). `src` since the base: +1333 / -985; leg 4 changed tests only.

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
* **Built**, leg 4 (commit 4a88706e7, tests only): device, bank-ending, proof, readme-recipes over the bank.
  `bank-world` exposes `ensureBuilt`; a case meaning a built bank calls it first, and one over empty storage now
  builds through the world's dialog (`build_bank`). `tellByAutolock` and autolock's cases refuse `tryPeek` (autolock
  peeks its own row; it no longer lists). `lease_revoke_failed` cases name `bank`. The open gating is `unlock_bank`
  with no vaultlabel, and a sweep or vacate of the vault waiting on it keeps it open (moved to the "keeps" cases);
  the birth's-gating sweep case is now a build's. bank-ending's "old rows of an unlisted vault and another vault
  life" became "an old lease row of another bank life". The proof's paints: see *Discoveries*.
* **Skipped, naming 8c** (ground rule waived for these): `vault-gate.test.ts` whole, `@ts-nocheck` and one listed
  `eslint-disable`, every describe `.skip`; it also holds, under `// == [From <suite>]` banners, what moved there:
  halpimonfire's gate change, vault-life's and vault-lease's gate changes, vault-unlock's cached lease across a gate
  change, vault-listing's gate verbs and buildVault/launchBirth cases, three proof stories (gate prompts, vault
  delete). In `gating.test.ts`, three `it.skip` with a `// 8c:` line: another kind's cleartexts, a bank deleted
  during the dialog, a newer bank life during a build.
* **Dropped, subject gone** (not 8c): device.test's vault-row salt that will not decode (the row has no gate; a
  gate-row version would test a row damaged inside the datastore, ground rule 24); vault.test's gate-in-record, sparse-vault and VaultListing world checks;
  vault-unlock's two sparse-vault unlocks; vault-listing's lease forget on a vault tombstone (a vault's tombstone no
  longer touches the bank's lease; one test now says so); gating's birth of a second vault through a gating.
* **Still red**, for 8c and later:
  - safebyok-react tsc 48: the replace/add/revoke modals and their tests and `shapes.ts` (8c's gatingkinds),
    `test-helpers.ts` (the vault's prompts, 8c), `bank-provider`/`hooks` tests spying `tryListVaults` and passing a
    `vaultDB`, and the devmode vault-db inspector, which still takes a VaultDB. Its vitest: 12 files, 94 cases.

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
  - The proof's renders, read diff by diff in leg 4 (beyond the rename): (1) every lock and unlock tells the device
    twice, the bank aligning before its vaults, so one tell shows a vault row `unlocked` under a locked bank (on a
    lock) or `locked` under an unlocked one (on an unlock). Both tells land inside the one synchronous call, so React
    batches them; a host painting on each tell sees the glitch. Not fixed in src: no order removes it, only one
    tell per lock would. (2) A vault's delete no longer locks its object, so the deleted vault's own snapshot stays
    as it was (`main unlocked`) and its boxes paint once, not twice: the decision already listed below. (3) The bank's
    build paints `made (asking build_bank)`, `made`, `ready`; a vault built in an unlocked bank asks nobody.
* **For the Coach**:
  - `writtenByOwnVerbs`, the one new thrower (kind `bad_option`).
  - `lease_revoke_failed` names the bank, and the default vacates the bank: a contract change.
  - `vault.lock()` locks the bank again (ground rule 11), as do `ensureUnlocked` and `unlock`.
  - A vault's delete or rebirth no longer forgets the bank's lease or locks anything: tests now say so.
  - Carried: `ensureVault`'s `bank_locked` judged by the listing; vault listing lists empty on a val-null
    `ensureBank` until 8c; vault snapshot keeps `isLocked`.
