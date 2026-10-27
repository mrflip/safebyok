# Thread 5: Scopepath replaces Ckeys (2026-10-26)

Branch `20261026-scopepath`, PR [#276](https://github.com/mrflip/safebyok/pull/276), stacked on
[#275](https://github.com/mrflip/safebyok/pull/275). Justify: green (core 3158 passed, 37 skipped; every package, demo and e2e green; size within
budgets, `browserOpts` moved 37 -> 38 kB by the rule).

* **Built**:
  - `packages/safebyok/src/scopepath.ts`, after `good/scopepath.ts`, star-imported as `Scopepath`
    and exported from `index.ts` as a namespace: makers `bank`, `vault`, `lease`, `device`, `box`
    (each parses its scope with the `bad_scope` scope validators); inverses `bankScope`,
    `vaultScope`, `boxscope` (each parses its scopepath); kind tests `isLease`, `isDevice`, `isBox`
    (each a `safeParse` of its scopepath validator: false, never a throw);
    `withinVaultScopepathPrefix` (the text, for an IndexedDB key range) and
    `withinVaultScopepathPred` (a prefix test, assessed once); `Delimiter`; types
    `BankScopepath` ... `BoxScopepath` (each `Z.input` of its validator: lint refuses
    `type X = string`) and `ScopepathPred`. `index.ts` also exports the types `BankScope` and
    `Boxscope`.
  - `CX.leaseScopepath` and `CX.deviceScopepath` beside the other three in the `bad_scope` call,
    with `Phrases.LeaseScopepathShape` and `DeviceScopepathShape`.
  - `src/ckeys.ts` is gone. Callers moved: bank.ts (its entries map keyed by
    `Scopepath.VaultScopepath`, each `ckey` now `vaultScopepath`), device-db.ts, idb.ts,
    local-vault-db.ts; `safebyok-indexeddb`'s `src/ckeys.ts` is `src/box-range.ts` (its test with
    it), and `idb-vault-db.ts` and `shelf.ts`'s examples follow. vault-opts.ts needed nothing: its
    `ckey`s are option names, map keys.
  - Tests: `tests/scopepath.test.ts` in place of `ckeys.test.ts`, pinning each kind's stored
    string, every doc-block example, the refusals, and near twins and every sound split of one
    string. Each adapter test and test double files rows through `Scopepath`.
  - Docs: the core README's adapter section, VAULTDB.md, `safebyok-indexeddb`'s README.
  - Size: `browserOpts` budget 37 -> 38 kB (`size:budget --write`, the only line the rule moved;
    measure 34.0 kB).

* **The Coach's TODO entry ("Read-back refusals after the restyle's Scopepath swap") is settled
  here**; TODO.md is the Coach's to edit.
  - *Skipping a malformed row key*: a listing (`localVaultDB`, `idbVaultDB`) filters rows by
    `withinVaultScopepathPred`, then by `Scopepath.isBox` (the `safeParse`), then reads the
    boxlabel with `Scopepath.boxscope`. A row under the vault's prefix that `isBox` rejects is
    passed over, as `Ckeys.boxlabelOf`'s null let it, never failing the read; it still counts in
    `getCapacity` and goes with `delVault` (both work on the prefix). `vault-db.ts`'s
    `isNameable` is unchanged. Tests in both adapters.
  - *Each read-back site*: all already refused their own kind (thread 3's `checked` re-throws
    `bad_record` as the site's kind, and every record validator is a `bad_record` call, a nested
    name check included); each now has a test row with a name failing its check: vault props
    read back (`getVault`) `damaged_vault`, cause `bad_record`; a box read back (`getBox`)
    `damaged_box`; a stale write's `box_stored` a DamagedBox; `vault_props_stored`
    `damaged_vault`; an adapter's answer to a box write or a vault-props update
    `corrupt_record`; a lease (`Lease.make`) `corrupt_record`; a device record
    (`deviceRecordFor`) none. Capacity carries no names (`Capacity.safeParse`, else
    `corrupt_record`).

* **Decisions taken**:
  - `Scopepath.Delimiter` (the preplan's name), re-exported from `consts.ts`'s
    `ScopepathDelimiter`, which stays for `phrases.ts` and `core-checks.ts`: one definition,
    and no `Scopepath.ScopepathDelimiter` stutter. `good/scopepath.ts` re-exported it unrenamed.
  - Kind tests are full parses, not today's prefix tests: `idbDeviceDB`'s sweep now also deletes
    a lease or device record under a malformed scopepath, which no read could reach (test added).
  - `isBox` added beside `isLease`/`isDevice`, so a listing site (and a host's adapter, which
    cannot reach `CX`) skips a malformed row through the public module.
  - `withinVaultScopepathPred` stays a prefix test, as in `good/`: a full parse there would leave
    a malformed row behind at `delVault` and out of `getCapacity`.
  - `raisedDeviceRecord` still compares `Scopepath.device` of both records, so a caller's record
    with a bad name still refuses `bad_scope` there (no check removed).
  - Test doubles (`MapVaultDB`, test-helpers.test.ts's backend) hand up the text after the
    vault's prefix unchecked, as a column-keeping backend would, so `vault-db.ts`'s
    `isNameable` stays tested; rows under names no maker files are planted with
    `withinVaultScopepathPrefix(scope) + text` (`unsoundBoxScopepath`, `u1PlantedScopepath`).

* **Deviations**: none from the plan. Tests whose fixtures used names the checks refuse (a
  `u1","main` lookalike, near twins with quotes and brackets, box-range labels of any character)
  now use sound names, or plant the row under the prefix by hand.

* **Discoveries**:
  - Makers now refuse `bad_scope` for any name failing its check, not only one holding `^`:
    `memoryDeviceDB` and `idbDeviceDB` refuse such a scope alike (changeset says so).
  - `StringStore.ckeys()`, `IdbRow.ckey` (both inspectors) and the sweep's IndexedDB keys keep
    `ckey`: they are any key a store holds, not checked scopepaths. Thread 6 may rename the public
    `IdbRow.ckey` if it wants the word gone from the surface.
  - For thread 13: `bank.ts`'s entries are already a `Map<Scopepath.VaultScopepath, ...>`.
  - VOCABULARY.md's `ckey` row was left for #272 (thread 1), which this branch does not hold.

* **For the Coach** (also the PR's open questions):
  - `Scopepath.Delimiter` (preplan) over `good/`'s `ScopepathDelimiter` re-export. Rec: keep.
  - New exports past `good/`: `isBox`, `withinVaultScopepathPrefix`, types `BankScope`,
    `Boxscope`. Rec: keep.
  - The lease's read-back kind stays `corrupt_record`, not a `damaged_*`. Rec: leave.
  - `IdbRow.ckey` and `StringStore.ckeys()` keep the word (any key). Rec: leave, or thread 6.
  - `notes/security.md`: the 2026-10-16 `Ckeys` entry is amended; the 2026-10-15 entry still
    names `Ckeys.isLease` (the header forbids editing another entry).
