# Thread 8d: bank_gate_tests (2026-11-12)

Branch `20261112-bank_gate_tests`, PR #PR, stacked on #677 (10). Thread 11 (`bank_level_tests`)
folded in. Justify: every package green (safebyok 3397, react 255, fastkey 43, indexeddb 376,
postgres 433, convex 508, graphql 408, e2e 549, root 285, demo-react 98). No `src/` change; no
safety hatches added. Tests: 21 files, +437 / -383.

* **Built**
  * **Renamed** (`git mv`): `tests/models/vault-unlock.test.ts` -> `bank-unlock.test.ts`,
    `vault-lease.test.ts` -> `bank-lease.test.ts`, `vault-gate.test.ts` -> `bank-gate.test.ts`.
    bank-unlock was rewritten over the bank, its describes named for `bank.ensureUnlocked`,
    `bank.unlock` and `bank.lock()`; the seal and unseal cases moved under their own describe.
  * **Re-pointed**: every core test that reached the lock, the unlock or the prompts through a
    Vault scaffold (`vault.lock()`, `unlock`, `ensureUnlocked`, the three prompts and their try
    forms, `isLocked`/`isUnlocked`, `VaultSnapshot.isLocked`) now calls the bank or
    `bank.maingate`. Found by marking the scaffolds `@deprecated` in a scratch copy of `src/` and
    running `@typescript-eslint/no-deprecated` over `tests/` (reverted; no src diff).
    Helpers: `unlockTyping`/`unlockVerbTyping` in `vault-world.ts` take a Bank (the old
    `bankUnlockTyping` folded in); `gating.test`'s `lockedVault` is `lockedBank`; doc examples in
    `timing.ts` and `builders.ts` call the bank.
  * **One case per scaffold**: `vault.test.ts`, describe "a vault's scaffold calls of its bank's
    lock and gate": `vault.%s calls its %s's %s once, and answers the vault` (11 rows, spying
    `Bank.prototype`/`Gate.prototype`) and `%s reads its bank's lock` (3 rows). Thread 12 deletes
    the describe with the scaffolds.
  * **The four subjects** (thread 8 item 8), each pinned at the bank's level:
    * *Building a bank*: device.test "device.ensureBank" > "builds a bank over empty storage
      through a build_bank gating, and readies it" (already there).
    * *Deleting a bank*: bank-gate "bank.delPrompt()" > "deletes the bank, its gate, its vaults
      and their boxes once the passphrase proves, leaving the device no bank", and "leaves the
      next ensureBank to build a bank over the tombstone" (already there).
    * *One lock over two vaults*: bank-ending "locks every listed vault and forgets its lease, the
      bank unchanged" (now also asserts both vaults refuse a seal 'bank_locked'), and **new**
      "unlocks every listed vault at one unlock, each opening what it sealed before the lock".
    * *A bank's tombstone delivered*: bank-gate "reaches another device through the watch: its
      lease forgotten and its device left with no bank", and "refuses a bank deleted since the
      last fetch, its tombstone listed and the device left with no bank" (already there).
    * *`ensureVault` on a locked bank*: bank.test "puts a vault in a bank unlocked by asking, then
      returns the same vault without asking again" (listed vault), **new** "refuses 'bank_locked'
      a vault not yet stored in a locked bank, asking nobody and storing nothing", and retitled
      "returns a stored vault in a fresh bank still locked, which unlocks with the device's cached
      lease without asking".
  * **New titles otherwise**: bank-unlock "tryEnsureUnlocked returns a refusal as an Outcome";
    "tells its listeners once at a lock and once at an unlock, its snapshot following" (rewritten
    from "notifies listeners when the lock changes").
  * **Removed**: bank-gate "is reached through the Vault's replacePassphrasePrompt" (the scaffold
    table covers it); device.test's two-row `it.each` of locks lost its vault row and is one case,
    "keeps the gating through a lock of the bank".
  * **VOCABULARY.md**: the *wayin* and *wayin, as stored* rows name the gate row's `wayins`
    (`main`, `passkey0`, `wayinlabel`; `GateRecord`, `Wayins`); the *gating* row and the "unlock,
    as a noun" entry name the bank's gatingkinds (`build_bank`, `unlock_bank`, ..., `del_bank`).
    `alignLock`, `BankFriend` and `world` (the bank's) appear nowhere in it: nothing to remove.

* **Decisions taken**
  * `readme-recipes.test.ts` still calls the scaffolds: it mirrors README lines ~93 and ~208, and
    the handoff said "no other doc". It moves with the README (thread 12 or 17).
  * `vault-world.ts` keeps its name: it builds vault worlds; only its unlock helpers changed.
  * proof.test's vault component now prints `main present`/`deleted`, where it printed the lock;
    the device component prints the bank's lock. The vault component still repaints at a lock
    until thread 12 drops `VaultSnapshot.isLocked`.
  * Where no bank is in scope (a world's `vault` only), `vault.bank.lock()` stays: it is the bank's
    verb, reached through the vault's field, not a scaffold.

* **Discoveries**
  * Bank and Gate instances are not extensible: `vi.spyOn(bank, 'lock')` throws; spy on the
    prototype and check `mock.contexts[0]`.
  * `bank.ensureVault` on a locked bank returns a listed vault without asking, and refuses a new
    scope 'bank_locked' without launching a gating. Pinned; no defect found.

* **For the Coach**
  * VOCABULARY still says *locked* of a Vault (`vault.isLocked`), and its *gating* row says
    `ensureUnlocked()` launches "on a locked vault". Those go with the scaffolds in thread 12.
  * safebyok-react's tests were not re-pointed: thread 12's.
