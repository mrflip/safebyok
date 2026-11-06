# Sprint vaultdb_cleanup: the plan

* Date: 2026-11-06. Issued by: the Coach (flip). Mode: **YOLO**.
* Default levels: review `medium`; worker and reviewer on their agents' own model and effort
  (opus, inherited); style pass on `style-reviewer`'s pin (sonnet).
* Threads at once: 3.
* Sprint branch: `20261106-vaultdb_cleanup`, worktree `/workspace/byok-vaultdb_cleanup`.
* **Status:** thread 1 filed (#555); thread 2 building.

## The Coach's request, verbatim

> safebyok/storage/vaultdb-new has some pretty weird constructs that I do not believe are
> justified: #call trades 2 lines for seven at the cost of obscuring what is returned or thrown;
> preparedOf wipes out any hope of debugging an error. replacing call and adapted for a
> method-wide try/catch. You'd see similar lines repeated in each method, yes -- but this file
> should be optimized for reading, not writing. I'd see the lines of the method, plain, without
> bouncing around, without indirection.
>
> It then proceeds to inline things well handled by a typesafe function: delVault should
> dispatch to #answerDelVaultGone, #answerDelVaultVoid, or #answerDelVaultRecord.
>
> checkedVaultLife has this: `if (stored?.vault_tok !== vault_tok)` to (?) detect that the line
> is blank?
>
> movegate takes a closure instead of one natural function for the lines above (getting the
> response) and several for the lines below (dispatching to an answer)
>
> This:
>
>     const stored = vaultRowOf(ante)
>     if (stored?.am === 'a') {
>
> is a branch (on null) to dispatch, and a parseSafe into a different error type that can just
> be done ahead of time by defining the checker you want.
>
>     const stored = vaultRowOf(ante)
>     if (stored?.am === 'a') {
>
> is making a variable called storred out of the pre-existing state, and then branching on its
> nullity last, forcing the ? paranoia
>
> putTermsOf just trades one option set used everywhere in the codebase for a different set of
> lower clarity: provide adapters helper functions mayReplaceLive(opts) if that indirection is
> truly superior to `(ifPresent === 'repl')`
>
> ---
>
> rewrite the vault-db-new file, and the in-memory adapter, to be in plain, readable typescript.
> Review it against the notes/gallant files.
> Prioritize the clarity of each method as it stands alone.
> split code into functions where it's a narrative tailwind (#answerDelVaultGone,
> #answerDelVaultVoid, #answerDelVaultRecord become type assertive and self-documenting), not
> because it economizes file size.
>
> If it would be convenient to have multiple versions of checkers that are equivalent but give
> different error messages, there are helpers for that.
>
> once those are clean and reviewed, port the other adapters. Do not adopt their doc strings,
> which are rich in slop. you do not need to preserve a version that serves safebyok-old; this
> is one of the last steps before decommissioning everything in packages/safebyok-old. You may
> add whatever seems called for to the exports of any package. You do not need to maintain
> backwards compatability in any way, this package has not been publicly released. No databases
> will require migration, no format numbers need incrementing. You, above all, do not need to
> throw the same messages, or refusal kinds, or error metadata that the current code did.

## Read first

* `notes/gallant.md`, these sections, by heading (`rg -n '^#' notes/gallant.md`): *One way in*,
  *Sugar holds no logic*, *A wrapper needs a job*, *Use what you parsed*, *The impossible is one
  line*, *Never hold a value you made up*, *A private helper gets a phrase*, *The best name is
  its own doc*. Every thread; the Coach asked for review against them.
* `notes/gallant-docblocks.md`: whole, before writing any doc block (it is short).
* STYLE.md *Validation* (from its line 375): the `Checkers` / `Checker` / `objCheck` makers,
  `refusingAs(kind)`, and `parse(val, { where, advice })`.
* `packages/safebyok/src/storage/vault-db-new.ts` as thread 1 leaves it: the exemplar every port
  follows.

## Ground rules

* **Plain over clever.** Each public verb reads top to bottom on its own: parse its inputs, call
  the store inside one method-wide `try`/`catch`, dispatch on what came back to a named,
  type-asserting private answer (`#answerDelVaultGone`, `#answerDelVaultVoid`,
  `#answerDelVaultRecord`). Repeated lines across verbs are fine; a frame, thunk or closure that
  hides what a verb returns or throws is not. No `#call`, `adapted`, `preparedOf`, `putTermsOf`,
  or a closure handed to a shared driver (`#moveGate`'s `wayinOf`).
* **The decision tree in front, the construction behind** (the Coach, mid-sprint, verbatim):
  "helpers that bring clarity are highly encouraged -- weighed against any indirection they
  carry. For example: I don't need or want to see the details of how a stale_write error is
  prepared; call refuseStaleWrite with everything it needs, all good. I *do* want to understand
  the branch paths. inline or in an error handler, put the decision tree in front, delegating to
  action plans:
  `if (this.isImproperlyWirbled(row) ) { throw improperlyWirbled(...) }`
  `if (this.isZerkMismatched(row) && ifZerked = 'fail') { throw zerkMismatched(...) }`"
  A verb's branches are a flat run of `if (predicate) { throw refusal(...) }` /
  `return this.#answerX(...)` lines up front; a helper may hide how a refusal or answer is built,
  never a branch the caller should see.
* **Adapters triage their store's errors** (the Coach, 2026-11-06): "Adapters are encouraged to
  catch and triage errors into VaultError subclasses, or to synthesize them based on what their
  query returns." A port turns what its store throws, or what its query answers, into the
  refusal that says what happened (`storageUnavailable`, `vaultFull`, a stale write...); the
  base's method-wide catch is only the backstop. Thread 2's battery covers it where a store can
  be made to fail.
* **Exports are free** (the Coach): anything, large or small, may be exported from `safebyok` or
  any package where it helps.
* **Classify once, then branch on a non-null type.** A stored row is parsed by a checker that
  says what it is (void, gone, live, or damaged) before any branch, so no branch tests
  `stored?.am`. Build the checker variants you need with `refusingAs(kind)` or a `Checkers` call
  rather than a `safeParse` followed by a throw of another kind.
* **The store's terms are the package's options.** An adapter receives the `PutOpts`
  (`prior`, `ifAbsent`, `ifPresent`) the caller gave, not a re-encoded `PutTerms`. Plain
  `(ifPresent === 'repl')` in an adapter is fine; a helper is added only if it truly reads
  better at every call site.
* **No compatibility.** Nothing serves `safebyok-old`; no stored format is bumped; refusal
  kinds, messages and `meta` may change freely. A changed refusal kind is still a changeset line.
* **Doc blocks**: one line of purpose, written fresh. Never copy an old adapter's doc blocks or
  comments; `SLOPDOC:` markers go, replaced by a first line or nothing.
* **Never change `packages/safebyok-old/`.** Ports drop their dependency on it.
* **The old code is no authority** (the Coach, mid-sprint). Neither `describeVaultDB` nor an old
  adapter's behaviour says how the new VaultDB works; what `src/models` needs, and readability,
  do. The old battery and adapters are references for coverage and for each store's mechanics.
* **An `-old` copy is allowed, not expected** (the Coach's offer, 2026-11-06): where warranted,
  an adapter's old code may move to a private `packages/safebyok-<x>-old` and the new be written
  in `packages/safebyok-<x>`. *Coach (2026-11-06):* "it may be easier and better to make a
  safebyok-idb-old package": thread 3 does, for the demo. The other ports take no `-old` copy
  (only e2e consumes them, and e2e moves to the new contract).

## Threads

### 1. vaultdb_plain

> rewrite the vault-db-new file, and the in-memory adapter, to be in plain, readable typescript.
> Review it against the notes/gallant files. Prioritize the clarity of each method as it stands
> alone. split code into functions where it's a narrative tailwind (#answerDelVaultGone,
> #answerDelVaultVoid, #answerDelVaultRecord become type assertive and self-documenting), not
> because it economizes file size. If it would be convenient to have multiple versions of
> checkers that are equivalent but give different error messages, there are helpers for that.
> *(and every item of the critique above)*

*Gloss.* Touches `packages/safebyok/src/storage/vault-db-new.ts`, `memory-vault-db.ts`, likely
`src/shapes/shapes-storage.ts` (row-classifying checkers), `src/refusals/throwers.ts`, and
`tests/storage/vault-db-new*.test.ts`, `tests/test-helpers/storage-world.ts`. Callers in
`src/models/` (listings) keep compiling. Each critique item is a checklist line in the thread
file, ticked with where it landed. `PutTerms` goes; `do*` signatures take `PutOpts`/`DelOpts`.
The `try*` twins and `answerOf` may stay if plain; the Coach did not name them, so judge by the
same rule. **Levels:** review `high` (the exemplar for four ports; the reviewer checks it
against the gallant sections above). **Depends on:** nothing; cut from `origin/main`.
**Look-ahead:** the `do*` contract it settles is what threads 3-6 implement, so keep it the
smallest a SQL, IndexedDB or Convex store can meet atomically; thread 2 turns its tests into a
battery, so keep tests calling only the public verbs and `_cheat_*` backdoors through one
helper. **Size:** M. No size line moves (the core is not measured).

*Review:* `high`, fixed: the decision tree flattened to plain `if` lines up front in getVault,
getBox, putVault, putBox and liveVaultOf (the Coach's directive); del-answer doc blocks made
phrases; `PutOptsGiven` documented; the changeset names the gate race's new refusals;
`#tombstoneBoxesOf` → `#tombstoneBoxes`; one style fix. Left: `#answerDel*Record` return
`never` (kept: the Coach named it); `refusalOf` mutates; gateIssue's inline sentence, VOCABULARY.md:144
and models-world's scripted `meta` (→ thread 2); compound first lines (→ an Open Matters row for
a documentarian run); no gate-race test (→ thread 2's battery). Filing hit a conflict with main
(#548, #549); a fresh worker resolves it. *Coach rulings (2026-11-06)* on its open matters: the wide catch stays, with
adapters triaging; damaged_row for a later fmt, tidyGone ("for hosts to call"), the put acts,
and the gate put's `ifAbsent: 'fail'` all kept.

### 2. vaultdb_battery

> once those are clean and reviewed, port the other adapters.  *(the battery and exports every
> port needs; the orchestrator's split)*

*Gloss.* The old adapters each run `describeVaultDB` from `safebyok-old/testing`. The new
design gets a battery of its own: exported over the new `VaultDB` in the core's `./testing`
entry, built from thread 1's tests and run over `MemoryVaultDB` in the core. *Orchestrator,
from the Coach mid-sprint:* `describeVaultDB` is **no authority** on how the new VaultDB works;
it serves the old code base. The battery tests what `src/models` needs and what thread 1's
contract says, and consults the old battery only as a reference for coverage (which situations
are worth a case). Export from `safebyok`
(index, or a new `./storage` entry: the worker's call, recorded) what an adapter needs: `VaultDB`
and the `do*` types, the storage shapes and checkers an adapter validates with, and the refusal
throwers an adapter raises (`vaultFull`, `storageUnavailable`: *Orchestrator:* thread 1 renamed it). Damage rows the battery plants go
through a hook the adapter supplies. *Orchestrator, from thread 1's review:* ride along here: a battery case where `delVault` lands
between a gate verb's `doGetVault` and its `doPutVault` (expects `vault_gone`); gateIssue's
`registered_at` sentence into phrases.ts; VOCABULARY.md:144 (`newer_format` for a newer fmt, now
`damaged_row`) and `tests/test-helpers/models-world.ts`'s scripted `meta` (answers carry none).
**Depends on:** 1. **Look-ahead:** threads 3, 4 and 6 run
in parallel off this tip; anything they would each add to the core's exports belongs here.
**Size:** M.

*Review:* `medium`, fixed: every one of thread 1's 69 cases is in the battery; the cascade watch
case now looks again after a while (async stores); VOCABULARY's **fmt** entry; one style fix.
Left minor: same-named fixtures and checkers (*Orchestrator:* namespace imports, no rename);
flags beside hooks; two ways to fail a store; chained titles; compound doc blocks; casts listed on
the PR. *Orchestrator, YOLO, a rework before filing:* the failure case requires
`storage_unavailable`; `onTestFinished(unwatch)`, unwatch safe twice; `objCheck` on the battery's
opts; `vaultQuery`/`boxQuery` fixtures hoisted to `storage-world.ts`.

### 3. port_indexeddb

> port the other adapters. Do not adopt their doc strings, which are rich in slop.

*Gloss.* *Orchestrator, revised on the Coach's word (2026-11-06):* first, `git mv` today's
`packages/safebyok-indexeddb` to a private, never-published `packages/safebyok-idb-old`
(renamed in its package.json, still on `safebyok-old`), and point the demo
(`demos/safebyok-demo-react/src/lib/stores.ts`, `persist-storage.ts`) at it: the demo keeps its
IndexedDB store and inspector panel with an import change. Its own commit, so the move reads as
a move. Then write `packages/safebyok-indexeddb` fresh on the new `VaultDB`, its tests on thread
2's battery, its package.json off `safebyok-old`; the old copy is a reference for IndexedDB
mechanics only, and none of its doc blocks come across. `ChangeBell` from `safebyok-old/idb` is
not available to the new package: the watch uses what the core exports or plain
`BroadcastChannel`. Size line `idbVaultDB` measures the new package, its `ignore` moving from
`safebyok-old` to `safebyok`; it will likely move. `safebyok-idb-old` gets no size line and no
changeset of its own (private). **Depends on:** 2. **Size:** M.

### 4. port_postgres

> port the other adapters. Do not adopt their doc strings, which are rich in slop.

*Gloss.* `packages/safebyok-postgres/src/*` (535-line `postgres-vault-db.ts`, `columns.ts`,
`vault-tables.ts`) onto the new `VaultDB`; tests onto the battery over PGlite;
`e2e/tests/postgres/*` onto the new contract. The table layout may change freely (no
migrations). **Depends on:** 2. **Look-ahead:** thread 5's graphql tests run over postgres.
**Size:** L; a worker that compacts twice splits e2e off.

### 5. port_graphql

> port the other adapters. Do not adopt their doc strings, which are rich in slop.

*Gloss.* `packages/safebyok-graphql/src/*`: the client `graphql-vault-db.ts`, the server
`vault-resolvers.ts` and `vault-schema.ts`, `fields.ts`; the schema may change freely. **Depends
on:** 4 (its devDependency on `safebyok-postgres`). **Size:** L.

### 6. port_convex

> port the other adapters. Do not adopt their doc strings, which are rich in slop.

*Gloss.* `packages/safebyok-convex/src/*`: the client `convex-vault-db.ts`, the component
(`component/vaults.ts`, `validators.ts`, `tallies.ts`, `schema.ts`), `server.ts`, `refusals.ts`,
`testing.ts`; `e2e/tests/convex/*`. The component's functions are where the store's atomic
steps live, so they implement the `do*` contract server-side. `_generated/` is regenerated, not
hand-edited. **Depends on:** 2. **Size:** L; split component from client if the worker
compacts twice.

## For the Coach

* ~~**The demo loses its IndexedDB vault store** when thread 3 lands.~~ *Coach (2026-11-06):*
  "lgtm" to moving it onto the old core's `localVaultDB` over localStorage; then, in chat: "it may
  be easier and better to make a safebyok-idb-old package". Thread 3 does that instead.
* *Coach (2026-11-06)* on thread 2's split: "love it, yes".
