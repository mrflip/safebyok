# lean_buttonup (2026-11-15)

Rounding off what the new core (`packages/safebyok`) has started, so the Coach can design the minder's API on what
was learned and built. Three threads, each its own worktree and PR, cut from origin/main.

## Threads

* **T1 `vaultdb_battery`**, background, a thread-worker on Opus. The vaultDB's verbs done well for the bank, gate and
  box Things, a battery any store can run, and `PostgresVaultDB` passing it beside the memory store.
* **T2 `minder_buttonup`**, interactive with the Coach. C1-C4 of the review, the friend, the cache options shut, the
  external watch with `receive`, the bank minder routing gates and boxes on, the box listing. Waits on the Coach's
  hand edit to `thing-minder.ts` and on the doc-block branch (`20261115-docblocks_lean`, unpushed) landing first.
* **T3 `bank_box_errors`**, marked, later. The error handling of Bank's box verbs: paranoid and spaghettified
  (`disabledAnswerOf` five times, the `otherThanBox` check that cannot fire, `answer.val as BankThing`). The classifier
  tidy follows T1, once the battery makes it safe.

## T1: settled

* **Verbs.** `tryGetThing`, `tryWriteThing` (put and del), `tryListThings`, `tryBirthBank`, `watch`, for the bank,
  gate and box Things, on the memory store and Postgres.
* **Depth.** No trees. The bank has no labels under it. The main gate, at `gate`, is the only gate for now: it cannot
  be deleted, and it will control adding and removing other gates. A box is the root box, at `box`, or one label
  under it, `box/<label>`: no `box/a/b`, and nothing that brings a parent to life.
* **`world`.** Every answer, refusals included, and every notice carries `world: BankRecord | null`: the bank's Thing
  with its main gate's Thing as `maingate` and its root box's sparse record as `rootBox`. It moves from `bank.ts`
  into `shapes-thing.ts`. It is read in the same atomic step, and is the actual (VOCABULARY.md): as stored after the
  step. For the bank's own asks it is the bank as the step left it; for `tryBirthBank`, the bank written or found.
  It is null where no bank is stored, where the bank's roots fail their checks, or after an irrecoverable error or
  a storage issue.
* **A notice handler that throws** tells `onBadNews` and goes no further. `AdapterVaultDB.watch` calls `onNotice`
  outside its `try`, and `MemoryVaultDB#tell` calls `hear` bare inside a microtask. Starting a watch with bad
  arguments throws, as now.
* **Words.** The store's `Listener`, `#listeners`, `#tell` and `hear` become `Watcher`, `#watchers`, `#notify` and
  `receive` (design-minder.md, *Vocabulary*), and so does `doWatch`'s callback.
* **The battery.** Store-agnostic, in `packages/safebyok/tests`, consumed by `safebyok-postgres` the way big's
  `bank-db-battery-*.ts` is. What only the memory store can show (copies via `structuredClone`, `_cheat_things`)
  stays in its own test file.
* **Postgres.** `PostgresVaultDB` in `safebyok-postgres`, beside `PostgresBankDB`, which stays on big. A table and a
  write function per kind, as design-vaultdb.md's *Postgres* section lays out. `tryBirthBank` is one function call
  that writes all three roots in one statement, inside the transaction the call already runs in: no BEGIN, no row
  lock. A watch by `pg_notify` from the write functions.

## Why Postgres redoes the work

The memory store lets the TypeScript classifier decide every act, and only then writes. Postgres makes every check
again in SQL, in the write itself. That is not duplication to remove, for two reasons:

1. **It is the boundary that counts.** Behind GraphQL, Postgres or Convex, the adapter's TypeScript runs on the
   device, in the page, beside every iframe and extension. A script there can call the store directly and skip the
   classifier. Only what runs in the store holds against it (gate_policies/plan.md, *Why*). The memory store lives in
   the page too, so it has no boundary to defend: its classifier is the whole story.
2. **Only the write sees the row it writes over.** The checks sit in the UPDATE's WHERE, not in a SELECT before it.
   When the UPDATE waits on another writer of the row, Postgres checks the WHERE again against the row that writer
   left. A classify-then-write in TypeScript would race. The memory store's step is synchronous, so nothing comes
   between its read and its write.

So Postgres decides, and returns its verdicts with the row: whether it stored the record, the row as it now stands,
and each named check on that row. The adapter's classifier then names the act from those (design-vaultdb.md, *The
gate's write function*), overriding `classify*` where the store reached the verdict itself.

## T1: not in it

* The minder (T2), Bank's box verbs (T3), the classifier tidy (after T1).
* **Pushing a changed `world` into the watch feed.** The vaultDB would notify of a bank or main gate that changed on
  any answer, and a host such as GraphQL would turn that off and push itself. Open: does the adapter remember the
  last world it saw per bank and notify on a change (recommended), or notify on every answer and let the cache dedup?
* Trees, gates beyond the main gate, bringing a parent to life.

## Open

* The world push, above.
* `gallant.md` *#record-then-opts*: a friend is the narrow set of an owner's attributes and callbacks it hands a
  collaborator, a pick of the owner's interface where the names coincide, so that the owner ducks for it.
* `notes/guarantees.md`: cite where the new core keeps a guarantee in substance, never edit it, report drift; rebuild
  it after T2. CLAUDE.md's line about it changes to say so.
* "pins" gives way to "ties": the fields that must agree between a thing and what it is bound to.
* The design never depends on a remote subscription that arrives over a protocol of its own: a guarantee to record
  once the guarantees question is settled.
