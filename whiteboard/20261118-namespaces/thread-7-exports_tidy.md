# Thread 7: exports_tidy (2026-11-19)

Branch `20261119-exports_tidy`, PR [#754](https://github.com/mrflip/safebyok/pull/754), on main. Proved: `pnpm justify` green at 9c913f777 (safebyok 1073, safebyok-big 2941, safebyok-react 287, postgres 331, convex 329, indexeddb 213, fastkey 43, graphql 445, demo 99, e2e 576, scripts 328, with forgotten-exports 27 and front-door 14 among them; forgotten-exports clean in safebyok's typecheck, front-door clean after its build; attw and publint clean).

The ten items are the Coach's 2026-11-19 answers to thread 4's open questions.

* **Built**:
  - **Exports.** `safebyok/core` re-exports big's `HostErrorSanitizer` (a value) and `RefusalRows` (a type, through one new line in safebyok-big `src/internals.ts`; `BadAct` stays off). `Modelkind` is ours, in `shapes-thing.ts`: `Thingkind | 'device' | 'gating' | 'wayin' | 'lease' | 'proving'`. Nine `modelkind` getters now say `satisfies Modelkind`. `src/index.ts` takes from big only `correctablekindVals` now.
  - **isVoidSentinel** (`base-thing.ts`): one helper, `isVoidCited`, checks that revseq, revtok *and* lifeseq are all the void ones. `isVoidSentinelOfKind` and `isGone` (`! isVoidCited`) both use it. The doc blocks are updated, and there are two new cases: another revtok, another lifeseq.
  - **Tombstone `am`** (`base-box.ts`): `exactOptional(lit('x'))`. Tests: 'x' is accepted, and 'a' is refused as `bad_record`.
  - **Gating askUser** (`gating.ts`): `custom<AskUser>(Consts.isGuarded, BigPhrases.GuardedExpected).nullable()`. GatingOpts' doc is updated, and there is a new OptsCases row (refused as `bad_record`).
  - **Device.make and browserOpts()** (`device.ts`, `browser.ts`): the options take `deviceDB: custom<unknown>().optional()` and ignore it, with a `//` reason. `DeviceOpts.deviceDB?: unknown`. The test uses the **real** `browserOpts()` over fake-indexeddb (a new dev dependency).
  - **`scripts/forgotten-exports.ts`** plus its test. It runs as part of safebyok's `typecheck` (`tsc --noEmit && node ../../scripts/forgotten-exports.ts .`), so justify and CI fail on a forgotten name. It found `Watcher` (memory-vault-db.ts) and `WriteCmpAsk` (thing-classifier.ts, inside `Classifier`); both are now exported. The draft `forgotten.cjs.draft` was untracked and is deleted.
  - **`scripts/front-door.ts`** plus its test. It runs at the end of safebyok's `build` (`tsdown && node ../../scripts/front-door.ts . ./core ./storage`). It loads dist by `import` and by `require`, and fails on any name of core or storage that the front door lacks, or has as a different value. I proved it by hand by renaming `exports.Lifeseq` in `dist/index.cjs`: exit 1, two lines.
  - **TODO.md**: make `Bank.unlockByProving` and `Proving.buildLease` non-public. notes/security.md was amended by a sonnet subagent (below).
  - **Changeset**: one, empty (the core is private); it lists what a host of the new core finds changed.

* **Decisions made**:
  - **Front-door check: a script with a test, run as a package build step.** Not a step in the package alone, and not a root justify step. Its logic is generic, so fixtures can test it. As a build step it runs wherever the package is built: justify's `pnpm build`, and CI's test job, which builds first. It also checks identity ("different"), a step beyond the directive: an entry that bundles its own copy of a class would break `instanceof` across entries.
  - **forgotten-exports' rules.**
    - It reports only names with a type meaning. A value reached through `typeof` is followed but never reported.
    - It walks only the package's own declarations: never node_modules, and never safebyok-big. Walking into big drowned the report in big's world, including a BankScope clash.
    - **A name the front door exports counts as remembered by every entry**, since a host has the front door whichever entry it imports. Without that rule, `./testing` flagged about 120 names.
  - **Wiring**: forgotten-exports runs in the package's `typecheck`, and front-door in its `build`. That way `pnpm --filter safebyok typecheck` and `build` catch them too, not only justify.
  - **`deviceDB` is typed `unknown`**, so `DeviceOpts` names nothing of IndexedDB.

* **Deviations** (each is a contract change; the Coach's rulings cover all but the ones marked):
  - **`safebyok/browser`'s `BrowserOpts` is our own type now**, where it re-exported big's. Big's `strengthChecker` is typed against big's `StrengthChecker` (scope `user_id`), which the new core's `DeviceOpts` refuses (scope `userid`). `zxcvbnStrengthChecker` takes either scope at runtime. So `browserOpts` is re-exported under `as unknown as (opts?) => BrowserOpts`. **This is a safety hatch.** The other fix, broadening big's type, is a change to big beyond item 6, so I left it.
  - **A half-shell is no Thing citation** (the Coach, 2026-11-19: "A tombstone at -1 must have also the void revtok. No -1 should be a valid tombstone, and every void must have that revtok and revseq"). `ThingChecks.scopedCited` refuses one, as the per-kind citations already did: the shell's revseq without its revtok and lifeseq, or either of those without it. So no guard accepts a half-shell, and thing-car refuses one as a record. Before, `isTombstone` and (after this thread's first cut) `isGone` answered true of one.
  - **isVoidSentinel checks the lifeseq too** (not directed: the Coach named revtok).
  - Gating.make refused nothing of a function before; it now refuses one that `guardRequestCleartext` did not make. A tombstone's `am: 'a'` was ignored before and is refused now. Both are as directed.
  - **Per-entry completeness is relaxed** (not directed). Thread 4 had core and storage each export every type they name. Under forgotten-exports' front-door rule, an entry may leave a name to the front door. I recommend keeping the rule: the check enforces what a host can reach.

* **Discoveries**:
  - The security subagent amended the 2026-11-14 lean_gate entry in place, as the file's header asks, rather than adding a new one. It also corrected fact (a): the Proving types are exported only from `safebyok/core`, and so from `safebyok`. `storage`, `browser` and `testing` export no Proving.
  - Tests in node that call `browserOpts()` need `fake-indexeddb/auto`.
  - Neither script can be told to ignore a name. The Coach ruled "over-export", so neither needs to.

* **For the Coach**: the Open questions in the PR body: the BrowserOpts hatch (ok); the lifeseq check; the front-door rule versus per-entry completeness (ok); the identity check; `Watcher` exported under so generic a name.
