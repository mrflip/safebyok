# Thread 6: store_trynames (2026-10-28)

Branch `20261028-store_trynames`, PR #321, stacked on #311 (merged into main at 41f44f69). Justify: green
(core 3444 tests pass, 37 skipped; graphql 344 pass; every package lints, typechecks, builds and
fits its size budget).

* **Built**: every public verb of `VaultDB` (`getVault`, `ensureVault`, `getVaultRecords`,
  `ensureVaultRecords`, `putVaultRecord`, `getBox`, `putBox`, `getCapacity`, `delBox`, `delVault`,
  `delDamagedVault`) and of `DeviceDB` (`getLease`, `putLease`, `delLease`, `getDeviceRecord`,
  `raiseDeviceRecord`, `delDeviceRecord`, `delAll`) is a try pair: the throwing form holds the body
  whole (each body moved out of its `outcomeOf(async () => {...})` and dedented, nothing else
  changed inside), and `tryVerbFoo` is `outcomeOf(() => this.verbFoo(...))` for the VaultDB and
  `deviceOutcomeOf(verb, () => this.verbFoo(...))` for the DeviceDB, so the mapping each wrapper
  made is applied once, in the `try` form. Doc blocks sit on the throwing form; the `try` form is
  one line. `DeviceVerb` is `Exclude<keyof DeviceDB, \`try${string}\`>`, the throwing names, so
  `DeviceTroubleSaid` keeps one row per verb. `HeededVaultDB` is `Pick<VaultDB, HeededVerb |
  'subscribe'>` (the `Thrown<>` mapping is gone); `heed` calls the `try` forms. Callers follow:
  `vault.ts`, `bank.ts`, `del-damaged-vault.ts`, `lease.ts` (`KeptLease.read` calls
  `tryGetLease`), `vault-opts.ts`'s duck-type shapes (the `try` forms the vault calls),
  `ProvingTools.putLease` → `tryPutLease`, `safebyok-graphql`'s `ServedVaultDB` and resolvers,
  the demo's outage adapter (now calls `inner`'s throwing verbs, and overrides the throwing
  `delDamagedVault`), the postgres README's route recipe, every package's tests, `describeVaultDB`'s
  `VaultDBVerbs`, the core README, `VAULTDB.md`, `STYLE.md` (*Naming*), `notes/old_vocabulary.md`
  and `notes/security.md` (by a `sonnet` subagent, per the file's header). New tests: the core's
  `vault-db.test.ts`, *the abstract VaultDB, its try pairs*, and `device-db.test.ts` for the device
  pairs. Changesets: `safebyok` minor naming every rename; one patch for graphql, postgres,
  indexeddb, convex and react.
* **Decisions taken**:
  - `VaultDBVerbs` (what `describeVaultDB` and `perUser` take) names the `try` forms, not both:
    the suite tests Outcomes, and the throwing forms are the base class's derivation, tested once in
    `vault-db.test.ts`. A hand-built `VaultDBVerbs` (the test-helpers' `servingOnly`, `perUser`)
    so supplies one form, not two.
  - The core calls the `try` forms everywhere it called a store (`heed`, the device store in
    `vault.ts` and `bank.ts`, `del-damaged-vault.ts` with `valOf`), so behaviour and every test's
    spy (`vi.spyOn(vaultDB, 'tryGetVault')`) are unchanged. `heed` keeps `heeding` over the `try`
    form rather than calling the throwing verb: calling it would re-implement `outcomeOf`'s
    `unexpected_error` mapping in `heed`.
  - The `outcomeOf(() => this.#vaultDB.delBox(...))` rewraps in `vault.ts` stay: each feeds a
    `#demandAfterWait(outcome, ...)` that must run before the outcome is judged, so they are not a
    plain rewrap. Reported, as the handoff asked.
  - `getVault`/`getVaultRecords` and `ensureVault`/`ensureVaultRecords` keep the private
    `readVault`/`ensuredVault` as their shared body (two public verbs, one body), so thread 3's
    diff of the insides stays small.
  - **DeviceDB's throwing forms throw VaultErrors, as VaultDB's do** (the Coach's ruling of
    2026-10-28: "I'm happier with the throwing body doing a try catch to fix its refusals -- that's
    most of its job, it belongs there; then having the try version wrap as usual"). First built
    with the mapping in the `try` form (`deviceOutcomeOf`), as the handoff read; reworked before
    review: each throwing verb computes its scopepath before the `try` and wraps exactly its one
    `do*` call in `storeAnswer(verb, hook)`, which passes a VaultError and makes anything else the
    condition `deviceTrouble` makes (`storage_blocked`/`storage_unavailable`, as before);
    `#readableOf`'s `doDelUnreadable` call is wrapped the same, under the reading verb. The `try`
    forms are the plain one-hop `outcomeOf(() => this.X(...))`, so a base-class bug is
    `unexpected_error` from a `try` form and thrown raw from the throwing one, as VaultDB's.
    `deviceOutcomeOf` is gone. `deviceTrouble`'s signature, body and `cause` are untouched (thread
    2's). Lines changed in `device-db.ts` for the rework: the class doc's throw paragraph (l.23-27),
    each verb body and `try` form (l.47-139), `#readableOf`'s signature and its `doDelUnreadable`
    call (l.141-150), the *Device trouble* banner and `storeAnswer` in place of `deviceOutcomeOf`
    (l.284-293), and the `isVaultError` import (l.5).
* **Deviations**: `ProvingTools.putLease` renamed to `tryPutLease` (proving.ts, vault.ts): a
  verb-shaped Outcome-resolving tool met in passing, per the plan's *Not in this sprint*. The
  patch changeset covers indexeddb, convex and react though only their tests changed, as the
  handoff asked, where PROCESS.md would give a test-only change an empty one.
* **Discoveries**:
  - `vault-opts.ts`'s `vaultDBShape`/`deviceDBShape` duck-type the stores by verb name; they now
    name the `try` forms. A host's hand-rolled fake of either store must carry them.
  - Many tests intercept verbs by name (`vi.spyOn`, `TH.beforeNextCall`, `TH.holdNextCall`,
    `TH.holdAnswer*`, `VaultDBVerbsUsed`, `DeviceDBVerbs`, `RevokedCallCases`); all now name the
    `try` forms except `DeviceDBVerbs` and `spyOnDeviceHook`, which name the throwing form and the
    `do*` hook (a spy on a throwing form still counts the `try` form's calls, as `tryX` calls
    `this.X`).
  - For thread 3 (`db_hooks`): the VaultDB bodies are untouched but for the dedent; `readVault`,
    `ensuredVault` and `deletedVault` are still the private helpers.
  - For thread 1 (`trythrow`): `KeptLease.read`'s one changed line is `deviceDB.tryGetLease(scope)`
    and its `Pick<DeviceDB, 'tryGetLease'>`; their rename to `tryRead` meets it there.
* **For the Coach**:
  - ~~DeviceDB throwing forms are unmapped~~: settled by the Coach's standing ruling of 2026-10-28
    and reworked before review (*Decisions taken*): both forms give VaultErrors.
  - **The `vault.ts` rewraps** (`outcomeOf(() => this.#vaultDB.X(...))` at `#tryDelBox`,
    `#delVault`, `#putGate`, `#readBox`, `#writeOver`'s caller): kept, each feeding a demand. If
    the Coach wants `heed` to hand Outcomes instead, so the rewraps go, that is a contract-shaped
    change for a thread of its own.
