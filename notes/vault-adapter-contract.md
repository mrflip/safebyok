# The vault adapter contract

What a datastore does for the new core's `AdapterVaultDB` (`packages/safebyok/src/storage/adapter-vault-db.ts`): the one
document a datastore author reads. `notes/answer-contract.md`'s *Adapter contract* is safebyok-big's, and says nothing of
this one. The types it names are in `src/shapes/shapes-manifest.ts`, each field with a doc block; the tags are made by
`src/storage/manifest-tags.ts`, exported as `ManifestTags` from `safebyok/storage`. `MemoryDatastore`
(`src/storage/memory-datastore.ts`) is the reference in TypeScript, and Postgres's `VaultFunctionsSql` the model in SQL.

## The three roles

1. **The datastore observes.** In one atomic step it does the verb, and records every observation of that transaction
   and snapshot onto a **manifest**: the tags it compared, whether it wrote, and each row exactly as it stands at the
   step's last read. The manifest says what the datastore based its actions on. A datastore reads no check and no act
   table, and judges no row: it hands back what it read, raw.
2. **The vaultDB answers from the observations alone.** `AdapterVaultDB` checks each row of the manifest once, finds the
   act from the ask's flags and the tags (the act tables in `notes/answer-contract.md`), and makes the answer of the
   manifest. Nothing reaches back into the datastore.
3. **The base class checks three ways.** `src/storage/three-way.ts` checks the ask, the manifest and the answer against
   each other.

The two sides overlap on purpose. The datastore decides whether to write by its own predicate (Postgres's `WHERE`), the
vaultDB finds the act from the tags, and the three-way check requires the two to agree. The work done twice is what the
check costs.

## What you write

A concrete adapter extends `AdapterVaultDB` and writes one `do*` call per verb. Each is one atomic step (one statement,
one transaction, or one synchronous function over memory), and hands back a new manifest each time: the vaultDB writes
onto the manifest it is handed.

| Call            | The step                                                                    | Hands back      |
|-----------------|-----------------------------------------------------------------------------|-----------------|
| `doGetThing`    | read the row at the ask's scope                                             | `GetManifest`   |
| `doWriteThing`  | write `ask.record` where the write predicate allows, then read              | `WriteManifest` |
| `doListThings`  | read the row at the ask's scope, and each row one label under it            | `ListManifest`  |
| `doBirthBank`   | write the two puts' records where the birth predicate allows, then read     | `BirthManifest` |
| `doGetBank`     | read the bank's two roots                                                   | `GetBankManifest` |
| `doStats`       | measure the bank's boxes and gates                                          | `StatsManifest` |
| `doWatch`       | optional: report each Thing that changes                                    | `Received`s     |

A datastore that runs TypeScript in its step makes its tags with `ManifestTags`, over the raw rows it read. One that
cannot (Postgres) makes the same comparisons in its own language, and they must agree with `ManifestTags`' line for line.

The datastore keeps a table per kind of Thing, one of gates and one of boxes, as Postgres (`safebyok_gate_things`,
`safebyok_box_things`), Convex (`gate_things`, `box_things`) and `MemoryDatastore` do. Each step picks a row's table by the
kind its ask names, never by reading the labelpath: `ask.modelkind` for a get, a write or a listing, each put's `modelkind`
for a birth, and for the roots, the gate's table for `gate` and the boxes' for `root`. (IndexedDB's datastore keeps its two
tables as two key ranges of its one object store, each key a Thing's scope, kind first: `[modelkind, userid, banklabel, labelpath]`.)
A scope (`ThingScope`) is the kind, the bank and the labelpath, and names one Thing. Within its table, the datastore needs
a unique key per scope, so a scope never holds two rows; and it needs an atomic unit that spans each step's reads and its
write, across both tables. A step that throws answers `storage_unavailable` (a `VaultError` it throws passes through as it is):
override `answerForThrown` to tell one of the datastore's errors from another.

## Every manifest: `BankObserved`

Each read in the step, after any write.

- **`banktok`**: the gate row's banktok, a tombstone's included, the void banktok (`VoidBanktok`) where there is
  no gate row, and null where the row has no banktok (`ManifestTags.banktokOf`). Never a box's: a box stores the
  banktok of its gate when it was sealed, which may be an older life's. A manifest without the key refuses `storage_issue` (`Phrases.BanktokMissing`). A banktok
  that is no UUID (a gate row's banktok missing or malformed) reads as the void banktok; a gate row that fails its other
  checks yet has a banktok gives that banktok. Either way the step's answer stands: the banktok is news, never the verdict.
- **`tracked`**: for each of the gate (`gate`) and the root box (`root`), by its key in the ask's
  `track`, `'same'` where its row stands at the revseq and lifepath the ask tracks, else the raw row, null for none
  (`ManifestTags.trackedOf`). A null row where the track is at the void revision reads as `'same'` too.
- **`read_tc`**: when the step read: `readTcNow()` in the step, or the datastore's own UUID version 7.

## Rows

A row is what the datastore has at a scope, raw, as our code wrote it: every field of the Thing record, `userid`,
`banklabel`, `modelkind` and `labelpath` among them. A table may hold its kind fixed (Postgres's `CHECK`, Convex's literal). Null means no row. Hand back the row as stored, never a repair of it.

A bank has no row of its own. Its gate is stored at the labelpath that is its banklabel (for banklabel `bob`, at
`bob`) and carries the bank's `banktok`; its root box is at `box`. Every row has a `banktok`: a box's is its gate's
when it was sealed, and no datastore compares the two. A labelpath is a label alone (a gate), `box`, or
`box/<label>`. A bank may be labelled `box`: its gate and its root box are then both at `box`, each in its own kind's table. A lease is a device's, at `lease/<banklabel>`.

## Per verb

**Get** (`GetManifest`):

- `actual`: the row at the ask's scope, null for none.
- `ancestor`: where `actual` is null, the nearest row above the scope (the longest stored labelpath that is a prefix
  of the scope's, ending at a `/`), live or a tombstone, null for none. It is in the ask's table: a Thing's ancestors are
  of its kind (a box's are boxes, and a gate has none). It gives the shell its lifepath. Where `actual` is a row, null,
  as it is read nowhere else.
- `tags`: `{ presence }` of `actual` (`ManifestTags.getTagsOf`).

**Write** (`WriteManifest`):

- `tags`: the write's tags, made of the **ante row** (the row at the scope before the write, null for none) against the
  ask, with `written` (`ManifestTags.writeTagsOf`).
- `actual`: the row written where the datastore wrote, else the ante row.
- `ancestor`: as the get's, of `actual`.

**Listing** (`ListManifest`):

- `actual`: the parent, the row at the ask's scope, null for none.
- `tags`: `{ presence }` of the parent.
- `children`: each row one label under the ask's labelpath in the ask's table, of every life, as `{ labelpath, raw }`:
  the labelpath it is stored at, and the row. The vaultDB reads them only under a live parent, so a datastore may read them whatever the
  parent (Postgres and memory do), or hand back `[]` where it is not live. A child that fails its kind's checks is
  answered among `incompatible_rows`, not refused; one of an earlier life is dropped by the vaultDB.

**Birth** (`BirthManifest`):

- `tags`: each root's tags as a write's are but for `written`, made of it before any write against its put, and
  `written` (`ManifestTags.birthTagsOf`). The puts are `doBirthBank`'s second argument, the gate's and the root box's, in
  that order.
- `actual`: the two roots after any write, as `{ gate, root }`, each null for none.

**Get of the bank** (`GetBankManifest`): `actual`, the bank's two roots, as the birth's.

**Stats** (`StatsManifest`): `stats`, the bank's `VaultStats`: the count, the live count and the size in bytes of its
boxes and of its gates, and `max`, the datastore's limits, each capped by `storeLimitsOf`,
which gives the cap for one the datastore lacks. `vaultStatsOf({ gate, box }, limits)` measures it from the raw rows
of each table, kind by kind.

## The tags

Each tag spells the field it compares, and is made of the ante row (a get's and a listing's, of the row read).

| Tag           | Values                                     | Meaning                                                                                                                                                                         |
|---------------|--------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `presence`    | `void`, `gone`, `live`                     | no row; a row whose `am` is not `'a'`; a row whose `am` is `'a'`                                                                                                               |
| `revtok_cmp`  | `birth`, `=next`, `eq`, `neq`              | no row and the ask cites the void revtok; the row has the revtok the ask would write (the write already landed); the row has the cited revtok; anything else                    |
| `revseq_cmp`  | `birth`, `eq`, `stale`, `ahead`            | the ask cites the void revseq; cites the row's revseq; cites a lower one; anything else, a row with no number for a revseq or no row among them                                  |
| `lifepath_eq` | boolean                                    | the row's lifepath is the cited one, or there is no row                                                                                                                         |
| `born_at_cmp` | `same`, `changed`, `moot`                  | a live record over a live row: whether the row's `born_at` is the record's; `moot` for any other write                                                                          |
| `banktok_cmp` | `same`, `changed`, `moot`                  | a write of a gate over a live gate: whether the row's `banktok` is the record's; `moot` for any other write                                                                     |
| `policies`    | `{ [policy]: { ok: true } \| { ok: false, refusaltag } }` | one verdict per storage policy the ask's `options.policies` names, and no other: each met where the row is no live gate (`notes/storage-policies.md`); a `refusaltag` is a key of `PolicyPhrases`, such as `'PasskeyStored'`, naming the refusal whose message the vaultDB makes |
| `written`     | boolean                                    | the datastore's own predicate wrote                                                                                                                                             |

A birth's root tags are a write's but for `written`: each put cites its root as the device found it, the shell or a
tombstone, and is judged as any put is.

## The write predicate

The datastore writes `ask.record` whole at the ask's scope, and only where this holds of the ante row. It is a copy of
Postgres's write functions in `VaultFunctionsSql`, and `MemoryDatastore`'s `isWritable` copies it in TypeScript. Port it
clause by clause, and drop none. The tags see only some of the clauses, and not `fmt` or `lifeseq`, so the loss of one
of those goes uncaught; where the datastore writes and the act tables find no write, or the reverse, the ask refuses
`storage_issue`. Postgres's `WHERE` has more clauses than these; the rest compare the record with the cited row
(its revtok new, no tombstone over a tombstone, the lifepath kept, a rebirth born when written), which
`checkedWriteAsk` has settled before the step runs.

- **Over no row**: the ask cites the void revtok, and its `ifAbsent` is `'add'` (`INSERT … ON CONFLICT DO NOTHING`).
- **Over a row**, all of:
  - the row's `revtok`, `am` and `lifepath` are the cited ones, and its `revseq` is the record's less one;
  - its `fmt` is the record's;
  - its `lifeseq` is the cited lifepath's last;
  - the ask's flag allows it: `ifPresent` `'repl'` over a live row, `ifAbsent` `'add'` over a tombstone;
  - where the row's `am` is the record's, its `born_at` is the record's;
  - for a gate over a live gate, its `banktok` is the record's;
  - for a gate over a live gate, each storage policy the ask names is met (`ManifestTags.policiesOf`).

Written, the row the datastore hands back carries the record's `revtok`, `revseq`, `lifepath` and `am`, and its tags are those
the predicate let through, which the ask alone makes (`ManifestTags.writtenTagsOf`; Postgres's `written_tags_of`).

## The birth predicate

The datastore writes both puts' records where the write predicate holds of each put over its ante root, and
otherwise neither (Postgres's `birth_roots`; `MemoryDatastore`'s `isBirthWritable`). A put over no row writes its
root's first revision; one over a tombstone, its next life, a gate's with whatever banktok it carries.

## The watch

`doWatch(scope, receive, onBadNews, onEnded)` calls `receive` with each Thing that changes in the scope's bank, one at a
time, as a `Received`:

- `record`: the changed Thing, raw. It is read by no address, so it carries its own `labelpath`, in the watched bank.
- `modelkind`: the kind of the table the Thing was written in, which the record must state too.
- `banktok`: the banktok of the Thing's bank, its gate's row's, as the datastore last read it, never the Thing's own;
  one that is no UUID reads as the void banktok.
- `read_tc`: optional, the datastore's UUID version 7 of when it read the Thing; without one, the notice is read when it
  arrives.

`onBadNews` takes any trouble, whether or not it ends the watch; where the watch ends before its stop is called, call
`onEnded` once, then `onBadNews` with why. Return a function that stops it. A datastore with no watch leaves `doWatch`
unwritten. The order and timing of notifications against reads, writes and other notifications is unspecified.

## What the vaultDB refuses

| What the datastore handed back                                                        | Refusal                                    |
|---------------------------------------------------------------------------------------|--------------------------------------------|
| a manifest whose tags, children, roots, `tracked` or `read_tc` are malformed          | `storage_issue`                            |
| a row, child or root that is no object                                                | `storage_issue`                            |
| no `banktok` key                                                                      | `storage_issue`                            |
| a row that fails its kind's checks, a record our code would not write                 | `incompatible_row`; a listing child goes to `incompatible_rows` |
| tags that are not those of the row handed back (unwritten, for a write or a birth)    | `storage_issue`                            |
| `written` where the act is no write, or the reverse                                   | `storage_issue`                            |
| a written row without the record's revtok, revseq, lifepath or liveness               | `storage_issue`                            |
| written tags that are not those of a write the ask lets through (`ManifestTags.writtenTagsOf`): a birth where the ask cites no shell, a verdict for another policy than it names, among them | `storage_issue` |
| a row, child, root or tracked row at another address than it was read at; a listing child not one label under the parent, or of another modelkind than the listing's | `storage_issue` |
| a birth over a live gate whose root box is missing                                   | `storage_issue`                            |

An answer that does not copy its manifest refuses `unexpected_error`: only our own code can make one.
