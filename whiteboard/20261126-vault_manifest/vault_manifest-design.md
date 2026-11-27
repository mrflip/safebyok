# vault_manifest: design

2026-11-26 · from a design talk between the Coach and the orchestrator. Every thread reads this
whole. Where it and `packages/safebyok`'s code disagree on what a verb answers, the code is the
contract (the Coach, 2026-11-26): this design changes how an answer is made, never what a
working vaultDB answers, except where a section below says so.

## The problem

`AdapterVaultDB` and its adapters (memory worst) dip in and out of methods redoing work. Each
`do*` gathers raw rows; `thing-classifier.ts` checks them and reports an act; then the adapter and
the base class each check and rebuild parts of that report again. A replace in memory checks the
stored row's cited slice three times (`storedCitedOf` in the act, in `demandBornAtKept`, in
`demandLifetokKept`), compares and checks the roots before the write and again after it
(`#besideAfter`), and `answerOf` re-parses what the classifier made (`besideOf`), null-checks a
value the types exclude, and casts. Every helper takes `(ask, raw)` and re-derives from raw rows:
nothing checks a row once and passes the typed result along.

## The three roles

1. **The datastore observes.** In one atomic step it does the verb, and records every
   *observation* of that transaction and snapshot onto a **Manifest**: the tags it compared, whether
   it wrote, and each row exactly as it stands at the step's last read. The manifest says what the
   datastore based its actions on. A datastore reads no check and no act table.
2. **The vaultDB answers from the observations alone.** `AdapterVaultDB` checks each row of the
   manifest once, scribes the act onto the manifest from the ask's flags and the tags, and strips
   the manifest to the answer. Pure functions over `(ask, manifest)`; nothing reaches back into
   the datastore.
3. **The base class checks three ways.** `demandThreeWayConsistency(ask, manifest, answer)`
   cross-checks the ask, the manifest and the answer (*Three-way consistency*, below).

The datastore's side and the base class's side overlap on purpose: the datastore decides whether
to write by its own predicate (Postgres's `WHERE`), the base class decides the act from the tags,
and the three-way check requires the two to agree. **The work done twice is what the check costs;
never optimize it away.** That sentence goes in `AdapterVaultDB`'s class doc block (as a `//`
reason above it) so agents stop "fixing" it.

## Words

| Word | Means | Replaces |
|---|---|---|
| **actual** | the row as the datastore holds it at the step's last read: after a write, the row written; else the row the step read | "stored" in `storedThingOf`, "the Thing stored", the classifier's `record` |
| **ante** | the row a write was judged against, as it stood when the step began | "stored" in `stored.revtok` comparisons, `UPDATE … AS stored`, `stored_wayins`, "the live Thing it replaces" |
| **proposed** | the record a write ask offers to write | prose and locals only: `WriteAsk.record` keeps its name for now (the Coach, 2026-11-26: "has merit; not yet") |
| **stored** | kept for the form a record takes at rest: "stored fields are underbar_case", `BankChecks.stored` and kin | — |
| **manifest** | the datastore's observations of one step, written onto by the base class until it reads as the answer | the Actual report (`GotActual`, `WroteActual`, …) |
| **incompatible** | a row that fails its kind's checks: a record our code would not write (another format, or a test's plant), never "damaged" by the datastore | "damaged"; the refusal kind's rename is thread 7 |

`prior` is STYLE.md's for what a cache held when a get began; not the datastore's row.
**`store` is not a noun** (VOCABULARY.md, *storage, datastore*), and keep/kept/hold are words to
avoid (VOCABULARY.md, *Verbs*): the memory datastore is `MemoryDatastore`, and a tag that says two
values agree says `'same'`, as `tracked` already does.

`StoredCited` and the `storedCited`, `storedLifetok` and `storedWayins` picks exist only so the
classifier can read a slice of a raw row unchecked. With tags from the datastore and each row
checked whole once, they go.

## Which record an answer carries

Always the **actual** row: `val` on a good answer, `dbhas` on a refused one, for every verb, read
or write. The bankDB is the ground truth and the device a cache, so what the device keeps is what
the datastore holds, in the form it holds it (Postgres's `thing_record` drops null columns, for
one). A successful write answers the row written as the datastore reports it (`RETURNING`, or the
memory datastore's clone), never `ask.record`. The three-way check then requires that row to carry
`ask.record`'s revision pins (below).

## The Manifest

Its structure resembles the Answer: `banktok`, `tracked`, `read_tc` and, once scribed, `act`
keep the Answer's names; `actual` becomes `val` or `dbhas`. Only `tags` (and a get or write's
`ancestor`, a listing's `children`) are dropped on the way out. Tag names spell the field they
compare (the Coach: "have all spell their fieldname").

```ts
/** A storage policy's verdict on one write: met, or why not. */
export type PolicyVerdict = Readonly<{ ok: true } | { ok: false, message: string }>

/** The comparisons the act tables read, as the datastore made them of the ante row against what the ask cites. */
export type WriteTags = Readonly<{
  presence:    'void' | 'gone' | 'live'            // the ante row
  revtok_cmp:  'birth' | '=next' | 'eq' | 'neq'    // the classifier's RevtokCmp
  revseq_cmp:  'birth' | 'eq' | 'stale' | 'ahead'  // the classifier's RevseqCmp
  lifepath_eq: boolean                             // ante lifepath === cited lifepath (true over void)
  born_at_cmp: 'same' | 'changed' | 'moot'         // moot unless a live Thing over a live Thing
  lifetok_cmp: 'same' | 'changed' | 'moot'         // the bank's alone; moot unless over a live bank
  policies:    Readonly<Partial<Record<EX.StoragePolicy, PolicyVerdict>>>  // one verdict per policy the ask names, no other
  written:     boolean                             // the datastore's own predicate wrote the proposed record
}>

/** What a datastore hands back from a write's one atomic step, every row as it stands at the step's last read. */
export type WriteManifest = {
  tags:     WriteTags
  actual:   unknown   // the row at the ask's scope, null for none
  ancestor: unknown   // the nearest row above that scope, null for none: the shell's lifepath where actual is null
  banktok:  unknown   // the bank row's lifetok, the void lifetok for none
  tracked:  unknown   // per root, 'same' or the raw row
  read_tc:  unknown
}
```

- **`lifepath_eq`, not `lifeseq_eq`.** The classifier's `isLifeMismatch` compares the lifepath
  (every lifeseq above and the Thing's own) and `am`. The `am` half folds out of `presence` against
  `ask.cited.am`, so the tag that spells its field is `lifepath_eq`. Only one table row reads it
  (`revtok eq` and a life mismatch → `clash`), so a boolean says all it needs. (YOLO; Open Matters row.)
- **`banktok`, not the bank row.** The manifest carries the bank's lifetok as observed, which
  resembles the Answer and drops a row from the wire. A bank row that fails its checks today gives
  the void lifetok; under the manifest it gives whatever lifetok it carries. `notes/wontfix.md`
  already leaves a damaged bank's banktok unspecified. (YOLO; Open Matters row.)
- **Policies** use the existing `EX.StoragePolicy` for the Coach's `PolicyTag`; the Postgres
  function returns a jsonb object of verdicts, its messages filled from the same phrases
  `storage/policies.ts` uses (the SQL is a TypeScript template string).
- **The reads** follow the same pattern with fewer tags: a get's tags are `presence` alone; a
  listing adds `children` (`{ labelpath, raw }[]`); a birth's tags are each root's `presence` and
  `revtok_cmp` and `written`; world and stats carry no tags. Thread 1 fixes the get and write
  shapes, thread 2 the rest, both in `src/shapes/` (a new `shapes-manifest.ts` is likely).

### The accumulator

The base class writes onto the manifest (the Coach: "the method to determine an act scribes it on
the manifest directly"), each step narrowing its type with a TypeScript assertion function, so no
caller does spread surgery or keeps a `let`:

```ts
async tryWriteThing(ask: WriteAsk): Promise<WriteThingAnswer> {
  try {
    const writeAsk = checkedWriteAsk(ask)                  // the ask, checked at the entry
    const manifest = await this.doWriteThing(writeAsk)     // the datastore's observations
    checkWriteObservations(writeAsk, manifest)             // asserts: each row read once, incompatible -> damaged_row
    scribeWriteAct(writeAsk, manifest)                     // asserts: the act, from the flags and the tags, row by row of the tables
    const answer = writeAnswerOf(writeAsk, manifest)
    demandThreeWayConsistency(writeAsk, manifest, answer)
    return frozenAnswerOf(answer)
  } catch (err) { return this.answerForThrown(err, 'writeThing', ask) }
}
```

- Past `checkedWriteAsk` nothing re-validates the ask or null-checks what the types exclude.
  Helpers take `ask` or `(ask, manifest)`, or a `Pick` where that reads better
  (`notes/gallant.md` `#pass-it-whole`).
- **Born_at, lifetok and policies are tags, not throws.** `scribeWriteAct` writes `policied` onto
  the manifest from them, as the code does today through `PoliciedMeta`. The answer function picks
  the error from the failed tag: `bad_record` for born_at (`bornAtNotStored`) and lifetok
  (`lifetokNotStored`), `gate_issue` for a policy, with that policy's message. The `demand*`
  throwers in the classifier go.
- One plain function per verb, each a straight line (CLAUDE.md, *Values*); `#no-bouncing`.

## Three-way consistency

`demandThreeWayConsistency(ask, manifest, answer)` holds the cross-checks that pass the Coach's
test: **with the call commented out, the pre-, post- and intermediate checks left are
conservatively prudent; with it, "overkill, but justifiably for a nascent code base".** It refuses
`storage_issue`. It is not every safety check, nor every repeated one.

In it:

- **The datastore's decision is the act's.** `tags.written` exactly when the act is a write act.
- **Unwritten: the tags are the actual row's.** The tag functions run again over the checked actual
  row (ante and actual are the same row then) and must equal the datastore's tags.
- **Written: the actual row is the proposed one.** Its revtok, revseq, lifepath and `am` equal
  `ask.record`'s: big's reqval rule, which nothing in the new core enforces today.
- **The manifest agrees with itself.** `presence: 'void'` exactly when `actual` is null; `'live'`
  exactly when its `am` is `'a'`; `revtok_cmp: 'birth'` only when the cited row is the shell.
- **Policies answered exactly**: one verdict per policy the ask names, and no other.
- **The answer copies the manifest.** `val`/`dbhas` is the manifest's actual row (or the shell
  where it is null), and `banktok`, `tracked` and `read_tc` are the manifest's.
- **Every row is at the address asked** (the Coach, 2026-11-26: "the most redundant given that
  the record is read with a primary key. I'd still keep it for comfort, but in ThreeWay"). The
  actual row, the roots and the bank are fetched by primary key, so a row at another address is
  the datastore disagreeing with the ask. The ancestor (a prefix query) and a listing's children (a
  range query) join it: the same disagreement, fetched otherwise. The kind check that reads a row
  once (`checkWriteObservations`) then parses without the address (`.parse`, not
  `parseConsistent`), and three-way compares the address (`Validator.isConsistent`).

Not in it, because these are not redundant:

- The ask's entry checks (`checkedWriteAsk`, `checkWriteInvariants`, the kind checks).
- Reading each row once against its kind's check (incompatible → `damaged_row`).
- A watch's bank filter: a Postgres channel is per user, so another bank's notice arriving is a
  correct system (`thingNotificationOf` drops it), not a datastore defect.

## MemoryDatastore and MemoryVaultDB

Memory is confusing because one class plays the datastore and its adapter. Split it:

- **`MemoryDatastore`** is the datastore: a `Map` of rows, and one function per verb shaped like
  the SQL functions and the Convex functions (`getThing(ask)`, `writeThing(ask)`, `listThings`,
  `birthRoots`, `getWorld`, `stats`), each returning a manifest. It works out tags over the ante
  row with the shared tag functions, decides whether to write by its own predicate (a TypeScript
  copy of the SQL `WHERE`, each doc block naming the clause it copies), and hands back clones. It
  imports no check and no act table. **It is infallible as far as our code is concerned**: it
  never throws, and it holds only what our code wrote or a test planted through `_cheat_things`. A
  row there that fails validation is not damaged by the datastore; it is incompatible, a record
  our code would not write.
- **`MemoryVaultDB extends AdapterVaultDB`** is the adapter: each `do*` is one line,
  `return this.#datastore.writeThing(ask)`, as Postgres's `do*` hands the ask to one statement.

The tag functions are shared: the datastore runs them over the ante row, the three-way check over
the checked actual row. They read raw fields and must not throw on a planted primitive (property
access on a string or number is safe; guard null).

## Per datastore

- **Postgres** is the model: one call hands back a manifest whole. A Thing is kept in columns,
  one per field (`whisper_sealed`, `sidecar`, `wayins`, and the gate's always-empty `auth`, `sigs`
  and `meta` are jsonb). Written, the `WHERE` pinned ante to `cited`, so the tags are constants and
  `actual` is the `RETURNING` row; unwritten, the read-back `SELECT` works out every tag from that
  row, so tags and actual describe the same row. `mayWrite` and `writtenActOf` go, and so does the
  TS re-run of the act tables after a refusal. Every check stays in the SQL: Postgres has no lock
  and no transaction block by ruling, so the CAS must sit in the one `UPDATE`'s `WHERE`, and behind
  GraphQL only the SQL holds against a direct caller (`VaultFunctionsSql`'s header). The ancestor
  subquery runs only where it is used.
- **Convex** keeps each Thing as one `v.any()` blob today. Restructure it to one table per kind,
  a typed field per column as Postgres has, blobs where Postgres has jsonb (the Coach: "Convex
  should be restructured"). Its mutation is TypeScript in one transaction, so it works out tags as
  the memory datastore does. A stored-format change, pre-1.0: no migration; the changeset says a
  host's existing Convex vaults read as absent.
- **IndexedDB** keeps records whole; its transaction body is its datastore, as memory's.

## Not changing

- `WriteAsk.record` keeps its name.
- **Banktok** is aspirational: later it will hard-scope every record. No comparison is added now.
  The `AskChecks` doc block's "a vaultDB checks it, and nothing more" overstates the code (which
  treats a banktok as news only): fix that sentence to say the vaultDB checks its form.
- What a working vaultDB answers. Two places a broken one now answers differently: a written row
  that does not carry the proposed revision pins refuses `storage_issue`, and a manifest whose
  tags disagree with its row refuses `storage_issue`.

## Doc drift found on the way

- `BadAct`'s doc block says `'policied'` is "for a replacement that a storage policy or a changed
  born_at refuses": a changed lifetok refuses `policied` too.
- `notes/answer-contract.md`'s *Adapter contract* is big's ("makes no outcome decision itself",
  "hands the rows it fetched, unaltered"). The new core needs its own: a new section, or a new
  note, for the three roles above. Thread 2 writes it.
