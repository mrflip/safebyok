# Thread 6: world_names (2026-11-26)

Branch `claude/bank-table-refactor-fr1ycq`, local only (no PR, by the handoff), on thread 5's
`8e54829`. Proved: `pnpm justify` green (exit 0): safebyok 2420 passed + 1 skipped (pre-existing), postgres 177, indexeddb 130, convex 232, graphql 297, react 339, fastkey 43, dojo 111, envman 24, knockknock 26; every `*-big` package green.

* **Built**: no name says "world" for the bank or its roots any more, in `packages/safebyok`,
  the four adapters, `safebyok-react`, `safebyok-fastkey`'s tests, the three new-core demos
  (dojo, envman, knockknock) and `notes/vault-adapter-contract.md`. `safebyok-react` and the demos
  are on the new core again: `device.world` is `device.bank`, `Labelpath.MainGate` is gone.
* **Names** (the handoff's, then mine):
  - `tryGetWorld`/`doGetWorld`/`tryGetWorldOnce` → `tryGetBank`/`doGetBank`/`tryGetBankOnce`;
    `GetWorldAsk`, op `'getworld'`, `AskChecks.getWorldAsk` → `GetBankAsk`, `'getbank'`,
    `AskChecks.getBankAsk`; `WorldSnapshot`, `PendingWorld`, `SignedOutWorld` → `BankSnapshot`,
    `PendingBank`, `SignedOutBank`; `WorldOpts`, `isWorld` → `BankOpts`, `isBank`;
    `WorldGateFriend`, `WorldLeaseGate` → `BankGateFriend`, `BankLeaseGate`; GraphQL
    `safebyokGetWorld`/`SafebyokGetWorld`/`VaultOperations.getWorld` → `...GetBank`/`getBank`;
    Postgres's `world` function → `bank_roots`, and its `world` column and plpgsql variable →
    `roots`.
  - Mine: `WorldRoots` → `ActualRoots` (each root as storage actually has it, the shell for none;
    `BankRoots` stays the live pair; the manifest field it is built from is `actual`);
    `worldRootsOf` (manifest-acts) → `actualRootsOf`; `WorldManifest`/`CheckedWorldManifest` →
    `GetBankManifest`/`CheckedGetBankManifest` (the other manifests are named for their verb;
    `BankManifest` would sit one letter from `BankObserved`, which it extends);
    `GetWorldAnswer` → `GetBankAnswer`; `demandWorldConsistency`, `checkWorldObservations`,
    `worldAnswerOf` → `demandGetBankConsistency`, `checkGetBankObservations`, `getBankAnswerOf`
    (their siblings are verb-named: `demandBirthConsistency`, `birthAnswerOf`); the VaultMinder's
    private `worldRootsOf` → `gotBankRecordsOf` (beside `gotRecordsOf`, `bornRecordsOf`);
    `CarWorld` → `CarBank` and the `world` option of `ThingMakeOpts`, `ThingCarOpts`,
    `VaultMinderOpts` and `ThingCarChecks` → `bank`; `WorldChecks` → `HostedVaultChecks` (it holds
    only `hostedVault`; see Decisions); `WorldMembernames` → `BankMembernames`; phrase
    `WorldExpected` → `BankExpected` (its text says "a device's bank"); phrase/thrower
    `WorldNotHeard`/`worldNotHeard` → `RootBoxNotHeard`/`rootBoxNotHeard` (what is not heard is a
    live root box); Convex `getWorld` query and validator `worldManifest` → `getBank`,
    `getBankManifest`; GraphQL `WireChecks.worldAnswer` → `getBankAnswer`; Postgres `GetWorldSql`
    → `GetBankSql`; react's hook `useWorld` → `useBank`, `gateShownOfWorld` → `gateShownOfBank`;
    the battery's `vaultdb-battery-getworld.ts` → `vaultdb-battery-getbank.ts`,
    `describeVaultDBGetWorld` → `describeVaultDBGetBank`; test helpers `getWorldAskOf`,
    `PlainWorld`, `RefusingWorld` → `getBankAskOf`, `PlainCarBank`, `RefusingCarBank`. Private
    fields `#world` → `#bank`; in `Vault` the field is `#bank` and its getter that demands live
    roots is `#liveBank`.
* **Left as "world"**: a test's fixture world, which is a bundle of fixtures and never the bank:
  `models-world.ts`, `vaultdb-world.ts`, `devicedb-world.ts`, `tsq-world.ts`, `idb-world.ts`,
  react's `provider-world.ts` and `ProviderWorld`, `WorldScope`, `WorldBankStamp`,
  `WorldGateStamp`, `WorldGate`, `WorldLeaseScope`, `WorldShelfCkey`, `TSQWorld`,
  `VaultDBBatteryWorld`, `leaseWorld`, `sealedWorld`, `renderWorld`, the dojo's
  `tests/components/practice/world.ts`. Everything under a `*-big` package, `demos/safebyok-demo-react`
  and `e2e/` (both build on big). READMEs (`safebyok-convex/README.md`'s `getWorld` sample,
  `safebyok-graphql/README.md`'s `safebyokGetWorld`, two demo READMEs' `useWorld`) and other
  notes: thread 7's.
* **Decisions made**:
  - `WorldChecks` and `BankChecks` do not belong together: `BankChecks` checks what is stored
    (the bank's stamp, its birth ask); `WorldChecks` checked a runtime object handed to
    `Bank.hostVault`. Named for that one check.
  - React's born-yet sites ask `bank.areRootsLive`, as thread 1's device does: `demandBank`
    (`signedIn.bank === null`), `demandVault`, and the dojo's `putBoxElsewhere`. `dismissUnlock`
    calls straight through (`signedIn()?.bank.dismissUnlock()`).
  - `gateShownOfBank` read the old `World.gate`, which was `Gate | null`; `Bank.gate` throws while
    there is no gate Thing. It is called only in the fetch stages (unborn, locked, unlocked), when
    the gate Thing is there (holding the shell while unborn), so its fallback to a shell at
    `Labelpath.MainGate` was dead and went; the WeakMap is keyed by the gate's record alone.
  - In `bank.test.ts`, `const { bank: world } = device` aliases are gone; they were the same
    object as `bank`, so `[world.isSoftlocked, bank.isSoftlocked, ...]` lost its repeat.
* **Review fixes**: `writeAsk` no longer refines `isGateAtBanklabel` (a gate record's check
  refuses a gate off its banklabel, and `recordOfOtherScope` refuses a record of another
  labelpath or banklabel than the ask's). `SeenChecks.item` keeps it: its `val` is checked only by
  `seenCited`, never as a gate record, and a watch's notice meets it alone
  (`SeenChecks.itemEvent.safeParse(data)` in `one-watch-vault-db.ts`). `rootLabelpathsOf` checks its
  banklabel (`ThingChecks.banklabel`, which refuses `box`); `Labelpath.gateOf` still trusts its
  caller (For the Coach). `Bank.#isRootLabelpath` passes `{ banklabel }`.
* **Discoveries**: the query keys assume nothing of a root's labelpath: a gate's item key carries
  its banklabel where `'gate'` was, and cannot meet the root box's since the banklabel `box` is
  refused. Four react tests named the old labelpaths `'gate'`/`'bank'` and were brought to the
  banklabel.
* **For the Coach**: `Labelpath.gateOf` is exported (on the `Labelpath` companion) and validates
  nothing. `primitives.ts` sits below `shapes-thing.ts`, where the banklabel check and its `box`
  refusal live; checking there needs an import cycle or a second copy of the refusal. Every
  exported caller I found goes through a checked scope or through `rootLabelpathsOf`.
