# Thread 5: graphql_fold (2026-11-26)

Branch `claude/bank-table-refactor-fr1ycq`, local only (no PR, by the handoff), on thread 1's
`b29fb38`. Commit `6597bc2`. Proved, after thread 2's `92954c2`: `pnpm --filter safebyok-graphql`
lint, typecheck and build (attw, publint) green; test 7 files, 297 passed.

* **Built**: `safebyok-graphql` carries a bank's two roots.
  - `vault-schema.ts`: `SafebyokBirthBankAsk` is `gate` and `root` (no `bank`); `SafebyokRoots`
    is `gate` and `root`; `SafebyokModelkind` is `gate box`, since it is generated from
    `thingkindVals`. Docs say "two roots".
  - `vault-operations.ts`: `getWorld` and `birthBank` select `val { gate root }`.
  - `shapes/shapes-wire.ts`: the wire's `shell` check is a gate's or a box's shell.
  - `graphql-vault-db.ts`: `NoRoots`, `rootRowsOf` and `namedRootsOf` have two keys;
    `namedRootsOf(ask, dbhas)` places the named root with `DB.rootLabelpathsOf(ask)`, since the
    gate's labelpath is the banklabel.
  - Tests: the birth, world and tracked misfits are two-root; the watch's expected labelpath is
    `TH.GateScope.labelpath`; the postgres cheat's `ThingTables` drops the bank table.
* **Decisions made**:
  - The stale birth refusal test names the root box, not the gate: a live gate other than the
    birth's now passes the birth (`ifPresent: 'get'`), so a "stale" naming a live gate cannot
    happen. The gate can still refuse (retcon; or over a tombstone), and the battery covers that.
  - The resolvers and the client stay a transparent pipe: no type, branch or check added.
* **Discoveries**:
  - `tsc` was not green over this package at `b29fb38` when I ran it: 11 errors here
    (`DB.RootLabelpaths`, `bank` in `RootRows`, `DB.BankChecks.shell`, `TH.bankThingOf`,
    `TH.BankScope`), plus safebyok-postgres's. tsc reads the core's source (the
    `@safebyok/source` condition in `tsconfig.base.json`), so no loose type hid them.
  - vitest does not use that condition: tests import the core's and safebyok-postgres's `dist/`.
    So tests can fail (or pass) against a stale build while tsc reads source, and in a checkout
    shared with other workers, their `pretest` rebuilds make suites flap with "Cannot find
    package 'safebyok/storage'" mid-build.
  - `battery-postgres` waited on thread 2 (safebyok-postgres, `92954c2`) and a fresh build of its dist.
* **For the Coach**: a host on the old schema must redeploy its server with this version's
  `VaultSchemaSdl` and `vaultResolvers` together with the client: an old client's birth (with
  `bank`) or `val { bank gate root }` selection fails GraphQL validation against the new schema,
  and an old server answers a new client's selections as a GraphQL error (`unexpected_error`).
  Rows stored by an old server do not read (pre-1.0, fail safe), per thread 1.
