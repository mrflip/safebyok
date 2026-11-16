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
* **Depth.** No trees. The main gate, at `gate`, is the only gate for now: it cannot be deleted, and it will control
  adding and removing other gates. Build nothing for further gates, and **add no throw, guard or check to forbid
  them**: a throw marks an error, never a call predicted to be useless. The one change is the Coach's: lower
  `MaxLabelsUnder.box` from `Infinity` to 1, so a box is the root box, at `box`, or `box/<label>`, and add nothing on
  top of it. Nothing brings a parent to life.
* **`world`.** Every answer, refusals included, and every notice carries `world: WorldRecord | null`, where
  `WorldRecord` is `{ ...bank, maingate }`: the bank's row, spread flat, with the main gate's row as `maingate`. `BankRecord` means the bank's row
  alone. The root box is not part of the world; it rides only in `tryBirthBank`'s `val` (`BankRoots`). The name
  `maingate` stays for now: whether it means the root gate or the gate that authorized the caller is undecided. The
  world is read in the same atomic step, and is the actual (VOCABULARY.md): as stored after the step. For the bank's
  own asks it is the bank as the step left it; for `tryBirthBank`, the bank written or found. It is null where no
  bank is stored, where the bank's roots fail their checks, or after an irrecoverable error or a storage issue.
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

1. **It is one of the two boundaries that count**, the other, and larger, being `bank.unlock`. Behind GraphQL,
   Postgres or Convex, the adapter's TypeScript runs on the
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
* Trees, gates beyond the main gate, bringing a parent to life.

## Open

## Settled, 2026-11-15

* **The world push (T1): `track` / `tracked`.** Every answer carries its world (`WorldRecord | null`), as today. An
  ask may carry `track: { bank: { revseq, lifepath }, <main gate>: { revseq, lifepath } }`, exactly two fixed keys,
  hard-coded in the stores' queries: not a general mechanism, and nothing fetches other records. The answer carries
  `tracked`, each entry `'same'` where revseq and lifepath match, otherwise the full row (the bank's row alone); no
  null. Every response method ends in one `notifyTrackedRecords`, which returns unless `doNotifyTracked` is enabled,
  and otherwise notifies each entry that is not `'same'`. Bank revisions stay honest: a gate write does not revise
  the bank, and there is no compound gate write. The main gate's key is its labelpath, `gate`, in one constant. An ask
  with no `track` gets no `tracked`. `doNotifyTracked` is on by default. A missing or damaged tracked row is unspecified
  behavior (notes/wontfix.md): no code handles it, pinned by a type-level test and a pointer comment.
* **A friend** is the narrow set of an owner's attributes and callbacks that it hands a collaborator, a pick of the
  owner's interface where the names coincide (`gallant.md` *#record-then-opts*). Visibility does not define it, and
  is not changed for it; "Internal." in a doc block marks what is not for hosts.
* **Guarantees.** `notes/guarantees.md` is now `notes/guarantees-big.md`, and is never edited. The new core cites it
  where it keeps a guarantee in substance, and writes any drift into `notes/guarantees-drift.md` (CLAUDE.md). The
  drift file records the new guarantee that the design never depends on a remote subscription protocol.
* **"ties"** replaces "pins": the fields that must agree between a thing and what it is bound to. Renamed in T2.
* **`DeliverableThing` stays**: the type of the delivery chain, not of the cache.
* **For T2**, from the Coach's review of `thing-minder.ts`: `VoidSentinel` cites well only for a root, so a box under
  the root needs its own shell ("give this all the fields it should have"). The kind check in `#doDeliverRecord`
  moves to the bank minder's `receive`, which routes gates and boxes on. The friend is `Pick<Bank, 'scope'>` for now,
  and `onBadNews` is removed until something calls it.
