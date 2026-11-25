# Thread 4 rework: the notice converges with the answer, and an agerank's time (2026-11-24)

For the Coach, and for whoever picks up thread 4: what the two rulings of 2026-11-24 changed, and what they showed.
Commits `e10a23939` (Change A) and `312143922` (Change B) on `20261124-sorted_feed`.

## Change A: the notice converges with the answer

`VaultEvent` (`packages/safebyok/src/shapes/shapes-vault-event.ts`) now reads:

```ts
export type VaultEventOf<EventkindT extends VaultEventkind> = Readonly<{
  eventkind:  EventkindT
  userid:     Userid
  banklabel:  Banklabel
  labelpath:  Labelpath
  modelkind:  Thingkind
  agerank:    Agerank | undefined
  agerankWas: Agerank | undefined
  bank_lifetok: Lifetok | undefined
  sourcelabel: string | undefined
  read_tc:    ReadTc | undefined
}>
export type VaultItemEvent = VaultEventOf<'item'> & Readonly<{
  liveness:   Liveness
  val:        SeenThing   // ThingRecord | Sparse<ThingRecord> | VoidSentinel
}>
```

`VaultLifeEvent` and `VaultAgedEvent` are unchanged but for the shared `bank_lifetok`.

* **Liveness.** `livenessVals = ['soon', 'full', 'gone', 'void']`, `Liveness`, exported from `safebyok/storage`
  (`Liveness` from `safebyok/core` too), in place of `recordkindVals` and `Recordkind`. What existed: VOCABULARY's
  **am** and **cited** rows use the word, and `thing-classifier.ts` has a private `Presence = 'void' | 'gone' | 'live'`
  documented "a scope's stored Thing, by liveness". Not reused: it is private, it describes a stored row (always
  whole), and it lumps `soon` and `full` as `live`. Left as it is; aligning it would rename `live` in the act tables.
* **`val` always holds what was seen.** `FeedSorter` puts the void sentinel it is given in `val`; a `SortedVaultDB`'s
  void for a `gotvoid` answer is the sentinel it builds under the parent's newest life (`voidsAt`); `bell` checks a
  void's `val` as the void sentinel (`union([ThingChecks.sparse, custom(Thing.isVoidSentinel)])`, deep lifepath, right
  parity, new phrase `RecordOrVoidExpected`) and sorts it at the lifepath it carries; `AdapterVaultDB`'s raw notice and
  `Minder`'s handler read `val`; `Minder` ignores a void notice (it never got one before), with a comment saying so.
* **No `ok`**: no notice ever had one; nothing to remove.

### Where a tombstone or a void in `val` was awkward

* **Types do not narrow.** `liveness` does not discriminate `val`'s type, so a consumer that narrows on
  `liveness !== 'void'` still holds a `SeenThing`. `Minder`'s `sendToTSQ(event.val)` typechecks only because a
  `VoidSentinel` is structurally a `DeliverableThing`: the compiler would let a void into the cache. With `null`, the
  type said "no record". Making `VaultItemEvent` a union on `liveness` would fix it, at the cost of a wider type.
* **`bell`'s check grew a union** (a Thing's fields, or the void sentinel) and a phrase. In return it lost a branch and
  the parent lookup: a void rung is sorted at its own lifepath. **Behaviour change**: a void rung under a parent the
  sorter has not seen now notifies (`item` void, `life` died) where it was dropped; the ringer places the void.
* **Answer and notice now differ for a get's void and tombstone**: a `gotvoid` answer's `val` is `null`, its notice's
  `val` the sentinel; a `gotgone` answer's `val` is `null` with the tombstone in `dbhas`, its notice's `val` the
  tombstone. If they are to converge, that is where they part.
* **Reading the bank's lifetok from `val`** has to step around sparse banks and voids (`lifetokOf`, a safeParse of
  `BankChecks.storedLifetok`); a separate field would not have spared that.
* Nowhere else: the sorter got simpler (no null mapping), the tombstone was already in `record`.

### Where each notice gets its `bank_lifetok`

* `FeedSorter`: always undefined.
* `AdapterVaultDB`'s raw watch: the record's own lifetok where the record is the bank, else `Received.world`'s;
  undefined where the world is null (no bank yet, or bank or main gate missing or damaged) and the record is not the bank.
* `SortedVaultDB`, an answer's notices: the lifetok of the first bank record among the records the answer carries (its
  world's bank, then `tracked.bank`, then its own record: a get's or write's `val` or `dbhas`, a birth's bank), else that
  of the newest bank record the sorter has taken (`#bankLifetok`), else undefined (no bank seen yet).
* A wrapped feed notice: the notice's own, else its record's where that is the bank, else the newest taken.
* `bell`: the rung notice's own (checked as a UUID where present), else its `val`'s, else the newest taken.
* A sparse bank record carries no lifetok and is passed over. Answer types do not carry `bank_lifetok` (question open).

## Change B: a chunked time is the agerank's last field

The agerank is `[lifepath, high_revseq, item_revseq, time].join('|')`; `time` is `read_tc.slice(0, AgerankTimeDigits)`,
`AgerankTimeDigits = 8` (a module constant in `feed-sorter.ts`, documented: units of 65.536 seconds). The prepare rule:

```ts
function timeRaisedOf(was: Omit<AgerankParts, 'lifepath'>, revseq: number, time: string): string {
  if (revseq > was.highRevseq) { return time }
  if (revseq < was.highRevseq) { return was.time }
  return (time > was.time) ? time : was.time
}
```

`was` is the life before where the lifepath is the same, else `UnseenLife` (`-1, -1, ''`, so its time is the
record's own). `high` and `item` as before; the record is taken where the joined string is greater. `agekindOf` reads
`high` and `item` only. `eventify(seen, read_tc)` refuses a `read_tc` that is no UUID v7 (`bad_record`) and puts it on
every event it returns (the `SortedVaultDB` stamps the same one anyway).

* **Order independence held with times**: gen.py checks every chain of up to three records drawn from the alphabet in
  chunks 0, 1 and 2 (254,079 chains, each permutation), plus two new checks: a record that raises only the time returns
  `item` alone or `item, aged`; the end time is the latest chunk among the records at the end's life and highest revision.
* **The table**: 21 rows added, 190 in all: six "On <start>, each record of the alphabet that a chunk later makes news"
  (a soon at the highest on bare, cold and here; a full record on here; a tombstone on dead; a void on void) and 15
  chains across chunks. With every record at chunk 0, every old row is unchanged but for `|00000000` on its agerank
  (checked by diff). An item shorthand carries the chunk as a fifth element where it is not 0.
* **The harness** spells chunk n as the read_tc `<n in 8 hex digits>-0000-7000-8000-000000000000`.
* **The minder test world's `noticeOf` and `sparseNoticeOf`** now stamp `readTcNow()`: `TH.AnyReadTc` is no UUID, and
  the sorter refuses it. Under fake timers that is the fake clock's time.
* **The staleness test** "lands a whole record at the item's revision...": still fails as written (its two sightings
  are 5 seconds apart, one chunk). Advanced by 70,000 ms instead of 5,000, with `refreshedAt: 71000`, it passes, success
  told: tried in place and reverted, not committed.
* **Wontfix**: "A `read_tc` from a clock running ahead pins a Thing's agerank time in the future" (`notes/wontfix.md`).

## Approaches set aside

* `bank_lifetok` computed per `#notifyEventsOf` call: a get's void is sorted in a second call after its roots, which
  would have lost the world's lifetok there; the stamp is made once per dispatch from all its records instead.
* Checking a minted `read_tc` in the `SortedVaultDB` and minting a fresh one when bad: hides a broken source. A bad
  `read_tc` on a wrapped notice goes to `onBadNews`, as any record the sorter refuses.

## Would add or change in VOCABULARY.md (not edited)

* **liveness**: whether a record seen is live, whole (`full`) or sparse (`soon`), a tombstone (`gone`), or nothing
  stored (`void`).
* **agerank**: how far a Thing has been seen, as a string that orders: its newest life and revisions, and when the
  newest revision was last seen.
