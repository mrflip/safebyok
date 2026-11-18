# Thread 1: namespaces (2026-11-18)

Branch `20261118-namespaces`, PR #740, stacked on #728. Proved: see the PR's Tests line (`pnpm justify` at the tip).

* **Built**: a mechanical rename of what `packages/safebyok` exports, with callers in `safebyok-react` and `safebyok-postgres`. No behaviour changes. One commit per item of the plan.
  1. *Checker bundles.* `ThingChecks` (shapes-thing) holds the kind-generic checks plus `byKind`, `ofLabelpath`, `ThingFormats`, `thingkindVals`. `BankChecks`, `GateChecks`, `BoxChecks` hold each kind's `record`, `cited`, `stored`, `policies`, `labelpath` (gate: `wayins`, `storedWayins`; box: `sealable`, `live`, `liveOrShell`). `AskChecks` (now with `loggableAsk`), `StampChecks` (with `LeaseFormat`), `MinderChecks` (with `DefaultQueryCacheOpts`, `MaxTimerMillis`), `GateishChecks` (with `gatingkindVals`), `BankishChecks`. `adapterVaultDBOpts` is now in `adapter-vault-db.ts`'s foot `Checks`; `AdapterVaultDBOpts` is exported from there.
  2. *Companions.* `Lifeseq` and `Labelpath` (primitives.ts, beside their types) and `Shell` (shapes-thing.ts), as in the plan. `safebyok/storage` exports `Lifeseq` and `Labelpath` as values; `core.ts` and `index.ts` still export them as types only.
  3. *Classifier.* `import * as Classifier from './thing-classifier'` wherever used; `safebyok/storage` has `export * as Classifier`.
  4. *Throwers.* `refusals/throwers.ts` re-exports, by `export const { ... } = BigThrowers`, the 32 of big's throwers the new core calls. Every new-core file imports `* as Throwers from '../refusals/throwers'` and none imports big's.
  Also: VOCABULARY.md (`lifenum`, `shell`, `Void Sentinel`, `cited` rows), and the changeset `.changeset/20261118-namespaces.md` (empty: the new `safebyok` is private).
* **Decisions made**:
  - The bundles' private builders are named for what they build (`GenericChecks`, `PerKindChecks` in shapes-thing; `PlainChecks`, `LeaseChecks` in stamps; `RawChecks` in asks, minder and gateish), then spread into the frozen public bundle. The plan's "private `Checks` at a model file's foot" is untouched.
  - `ThingChecks.byKind` is `{ bank: BankChecks, gate: GateChecks, box: BoxChecks }`, so its entries carry each bundle's extras as well as today's four fields.
  - `thingkindVals` stays exported on its own from shapes-thing and `safebyok/storage`, as a host-facing constant like `gatingkindVals`. `ThingFormats` is no longer exported from `safebyok/storage` (the bundle carries it; shapes-thing still exports it).
  - `BoxChecks.labelpath` replaces the inline "labelpath of kind box" refinement in `boxStamp` (same check, same phrase).
  - `sealed` stays in `ThingChecks` (a part of any record), `wayins` and `storedWayins` in `GateChecks`.
* **Deviations**:
  - `Shell.VoidLifeseq` needs the shell's lifeseq in `Lifeseq.ofLifenum(-1)`, and primitives.ts may not import values from shapes-thing, so primitives.ts defines and exports `VoidLifeseq`, and `Shell.VoidLifeseq` is that value. The call-site name is the plan's; the standalone `VoidLifeseq` export exists in primitives.ts only (not in any entry point).
  - **No `AskChecks.world`.** Nothing in shapes-asks checks a world: `worldOf` in thing-classifier builds it from two stored checks. A check composed from `BankChecks.record` and `GateChecks.record` would have to be a new rule: both are strict (and refined), so neither `.extend` nor an intersection accepts the extra `maingate` field.
  - `safebyok-postgres` still imports big's `Throwers` for `storageIssue` (the plan's "none imports big's Throwers" is read as the new core's files; `safebyok/storage` exports no thrower).
  - `notes/gallant.md` still shows `shellOf` in a Goofus/Gallant pair; left whole (it stays whole for review).
* **Discoveries**:
  - For the later thread (per-kind bundles drawing in stamp and ask checks): shapes-stamps and shapes-asks import shapes-thing, and shapes-asks itself reads `ThingChecks.byKind[...].policies` and the `BankChecks/GateChecks/BoxChecks` `record` and `cited`, and shapes-minder imports shapes-asks. A module above shapes-thing, shapes-stamps and shapes-asks can re-bundle by spreading each kind's bundle; shapes-asks cannot import it back, so the checks it uses itself stay in shapes-thing's bundles. shapes-stamps already uses `GateChecks.wayins` and `BoxChecks.labelpath`, which suggests the stamps (`boxStamp`) belong to the per-kind bundle. `throwers.ts` and `shapes-asks.ts` already import each other (the throwers call `loggableAskOf`); the namespace import changes nothing, since both are used at call time.
  - A multi-line import in the codemod'd files was reflowed by my script where it was touched; no eslint rule sorts specifiers, so the order there is types first, then values in default sort order.
* **For the Coach**: nothing blocking.
