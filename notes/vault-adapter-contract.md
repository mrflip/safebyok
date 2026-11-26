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
| `doBirthBank`   | write the three puts' records where the birth predicate allows, then read   | `BirthManifest` |
| `doGetWorld`    | read the bank's three roots                                                 | `WorldManifest` |
| `doStats`       | measure the bank's boxes and gates                                          | `StatsManifest` |
| `doWatch`       | optional: report each Thing that changes                                    | `Received`s     |

A datastore that runs TypeScript in its step makes its tags with `ManifestTags`, over the raw rows it read. One that
cannot (Postgres) makes the same comparisons in its own language, and they must agree with `ManifestTags`' line for line.

The datastore needs a unique key per scope, so a scope never holds two rows, and an atomic unit that spans each step's
reads and its write. A step that throws answers `storage_unavailable` (a `VaultError` it throws passes through as it is):
override `answerForThrown` to tell one of the datastore's errors from another.

## Every manifest: `BankObserved`

Each read in the step, after any write.

- **`banktok`**: the bank row's lifetok, the void lifetok (`SX.VoidLifeTok`) where there is no bank row
  (`ManifestTags.banktokOf`). A manifest without the key refuses `storage_issue` (`Phrases.BanktokMissing`). A banktok
  that is no lifetok, as a damaged bank row's is, reads as the void lifetok, and the step's answer stands: the banktok is
  news, never the verdict. Keep the key even then: `banktokOf` of a bank row with no lifetok is `undefined`, so a
  datastore whose transport drops `undefined` (JSON does) hands back null there.
- **`tracked`**: for each of the bank (`bank`), the main gate (`gate`) and the root box (`box`), by its key in the ask's
  `track`, `'same'` where its row stands at the revseq and lifepath the ask tracks, else the raw row, null for none
  (`ManifestTags.trackedOf`). A null row where the track is at the void revision reads as `'same'` too.
- **`read_tc`**: when the step read: `readTcNow()` in the step, or the datastore's own UUID version 7.

## Rows

A row is what the datastore stores at a scope, raw, as our code wrote it: every field of the Thing record, `userid`,
`banklabel` and `labelpath` among them. Null means no row. Hand back the row as stored, never a repair of it.

## Per verb

**Get** (`GetManifest`):

- `actual`: the row at the ask's scope, null for none.
- `ancestor`: where `actual` is null, the nearest row above the scope (the longest stored labelpath that is a prefix
  of the scope's, ending at a `/`), live or a tombstone, null for none. It gives the shell its lifepath. Where `actual`
  is a row, null, as it is read nowhere else.
- `tags`: `{ presence }` of `actual` (`ManifestTags.getTagsOf`).

**Write** (`WriteManifest`):

- `tags`: the write's tags, made of the **ante row** (the row at the scope before the write, null for none) against the
  ask, with `written` (`ManifestTags.writeTagsOf`).
- `actual`: the row written where the datastore wrote, else the ante row.
- `ancestor`: as the get's, of `actual`.

**Listing** (`ListManifest`):

- `actual`: the parent, the row at the ask's scope, null for none.
- `tags`: `{ presence }` of the parent.
- `children`: each row one label under the ask's labelpath, of every life, as `{ labelpath, raw }`: the labelpath it is
  stored at, and the row. The vaultDB reads them only under a live parent, so a datastore may read them whatever the
  parent (Postgres and memory do), or hand back `[]` where it is not live. A child that fails its kind's checks is
  answered among `damaged_rows`, not refused; one of an earlier life is dropped by the vaultDB.

**Birth** (`BirthManifest`):

- `tags`: each root's `{ presence, revtok_cmp }`, made of it before any write against its put, and `written`
  (`ManifestTags.birthTagsOf`). The puts are `doBirthBank`'s second argument, the bank's, the main gate's and the root
  box's, in that order.
- `actual`: the three roots after any write, as `{ bank, gate, root }`, each null for none.

**World** (`WorldManifest`): `actual`, the bank's three roots, as the birth's.

**Stats** (`StatsManifest`): `stats`, the bank's `VaultStats`: the count, the live count and the size in bytes of its
boxes and of its gates, the bank's own row not counted, and `max`, the store's limits, each capped by `storeLimitsOf`,
which gives the cap for one the store lacks. `vaultStatsOf(rows, limits)` measures it from the raw rows.

## The tags

Each tag spells the field it compares, and is made of the ante row (a get's and a listing's, of the row read).

| Tag           | Values                                     | Meaning                                                                                                                                                                         |
|---------------|--------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `presence`    | `void`, `gone`, `live`                     | no row; a row whose `am` is not `'a'`; a row whose `am` is `'a'`                                                                                                               |
| `revtok_cmp`  | `birth`, `=next`, `eq`, `neq`              | no row and the ask cites the void revtok; the row has the revtok the ask would write (the write already landed); the row has the cited revtok; anything else                    |
| `revseq_cmp`  | `birth`, `eq`, `stale`, `ahead`            | the ask cites the void revseq; cites the row's revseq; cites a lower one; anything else, a row with no number for a revseq or no row among them                                  |
| `lifepath_eq` | boolean                                    | the row's lifepath is the cited one, or there is no row                                                                                                                         |
| `born_at_cmp` | `same`, `changed`, `moot`                  | a live record over a live row: whether the row's `born_at` is the record's; `moot` for any other write                                                                          |
| `lifetok_cmp` | `same`, `changed`, `moot`                  | a write of the bank over a live bank: whether the row's `lifetok` is the record's; `moot` for any other write                                                                   |
| `policies`    | `{ [policy]: { ok: true } \| { ok: false, message } }` | one verdict per storage policy the ask's `options.policies` names, and no other: each met where the row is no live gate (`notes/storage-policies.md`)                |
| `written`     | boolean                                    | the datastore's own predicate wrote                                                                                                                                             |

A birth's root tags are `presence` and `revtok_cmp` alone: its puts cite the shell, so the rest do not vary.

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
  - for the bank over a live bank, its `lifetok` is the record's;
  - for a gate over a live gate, each storage policy the ask names is met (`ManifestTags.policiesOf`).

Written, the row the datastore hands back carries the record's `revtok`, `revseq`, `lifepath` and `am`.

## The birth predicate

The datastore writes all three puts' records where none of the bank, the main gate and the root box is stored (Postgres's
`birth_roots`), and writes none of them otherwise.

## The watch

`doWatch(scope, receive, onBadNews, onEnded)` calls `receive` with each Thing that changes in the scope's bank, one at a
time, as a `Received`:

- `record`: the changed Thing, raw. It is read by no address, so it carries its own `labelpath`, in the watched bank.
- `banktok`: the lifetok of the Thing's bank as the datastore last read it; one that is no lifetok reads as the void
  lifetok.
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
| a row that fails its kind's checks, a record our code would not write                 | `damaged_row`; a listing child goes to `damaged_rows` |
| tags that are not those of the row handed back (unwritten, for a write or a birth)    | `storage_issue`                            |
| `written` where the act is no write, or the reverse                                   | `storage_issue`                            |
| a written row without the record's revtok, revseq, lifepath or liveness               | `storage_issue`                            |
| policy verdicts for other policies than the ask names; `revtok_cmp` `birth` where the ask cites no shell | `storage_issue`         |
| a row, child, root or tracked row at another address than it was read at; a listing child not one label under the parent, or of another modelkind than the listing's | `storage_issue` |
| a birth over a live bank whose main gate or root box is missing                      | `storage_issue`                            |

An answer that does not copy its manifest refuses `unexpected_error`: only our own code can make one.
