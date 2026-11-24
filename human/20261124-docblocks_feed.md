# 2026-11-24: Doc blocks of the feed PRs (#867, #868) -- plain English, and a vaultDB notifies

A documentarian pass over the files [#867](https://github.com/mrflip/safebyok/pull/867) and
[#868](https://github.com/mrflip/safebyok/pull/868) change, applying two of the Coach's rulings: plain English, and
the vaultDB's verbs (watch, notify, notice) kept apart from the minder's (listen, tell, hear). Doc blocks, `//`
comments that broke ruling 2, and test titles and comments only. No name, signature or behaviour changed.

## Suggested PR titles

| PR | Now | Suggested |
| --- | --- | --- |
| #867 | storage: FeedSorter and VaultEvent, the events a feed of vault records tells | storage: add FeedSorter, which returns the events for each new record of a bank's Things, and the VaultEvent types (not used yet) |
| #868 | storage: a watch tells each Thing as a VaultItemEvent, and each device asks through one SortedVaultDB | storage: a vaultDB notifies each watcher with a VaultEvent in place of a ThingNotice, and a device's two minders share one pass-through SortedVaultDB |

## Changes, member by member

**`shapes/shapes-vault-event.ts`** (every block)
- File: `VaultEvent`, the notice a vaultDB's watcher gets, and `Agerank`, which orders the records seen of a Thing.
- `recordkindVals`: "Kinds of record", list kept; `gone` now says "a tombstone, whole or sparse" (from both `recordkindOf`s).
- `lifekindVals`, `vaultEventkindVals`: now one-value-a-line lists. `agekindVals`: headline "Whether the newest revision
  seen of a Thing has been seen whole", values `it has` / `no whole record of its life` / `only an older whole record`.
- `Recordkind`, `Lifekind`, `Agekind`, `VaultEventkind`: point at their `Vals` list instead of repeating it.
- `Agerank`: "The newest life and revisions seen of a Thing, as a string: of two for one Thing, the greater is the
  newer", then its format.
- `SeenThing`, `VaultEvent`, `VaultEventOf` and its fields, `VaultItemEvent` (and `record`), `VaultLifeEvent`,
  `VaultAgedEvent` (and `agekindWas`): no "a feed tells"; plain headlines.

**`storage/feed-sorter.ts`** (every block)
- File, class, constructor, `eventify`, `agerankAt`, and the private helpers. The class now states exactly which
  records give events (see *Disagreements*). `eventify` says the order of its events (`item`, then any `life`, then any
  `aged`) and keeps the `Shell.of` advice. The refusal of another bank's record moved from `eventify` to the class.
- `raisedOf`, `agekindOf`, `revseqOf`, `agerankOf`, `UnseenLife`, `AgerankParts`, `SeenChecks`: short phrases;
  `agekindOf`'s branch tour dropped.

**`storage/sorted-vault-db.ts`** (every block)
- Class: "A vaultDB that passes each verb and each watch straight through to the vaultDB it wraps."
- Each verb: `{@link VaultDB.foo}, passed to the wrapped vaultDB`, in place of a restatement of what the verb does.
- `SortedVaultDBOpts`: "Options for `SortedVaultDB.make`". `make`: "Wrap `opts.vaultDB`, asking and watching nothing yet."

**`storage/adapter-vault-db.ts`** (blocks about a watch, a watcher or a notice, and those the PRs added)
- `Received`, `ThingWatcher`, `itemEventOf`, `recordkindOf`, the class, `watch`, `notifyTrackedRecords`,
  `notifyDbhas`, `notifyListed`, `#queueNotices`, `#queueListedNotices`, `doWatch`: "watch" for a watcher became
  "watcher", "tells" became "notifies", an event a watcher gets became a "notice".
- `//` comments: "a listener is notified" became "a watcher is notified" (in `tryWriteThing`); "An event handler that
  throws" became "A notice handler that throws"; "the watch notifies" became "the watchers are notified" (twice).

**`storage/vault-db.ts`** (blocks about a watch or a notice)
- `GetThingAnswer`: "Watchers are notified of the tombstone before the answer."
- `ListedBeside`: now a list of its three fields (with `damaged_rows`, which it did not describe), and "Watchers are
  notified of the parentage and the deltas before the answer."
- `VaultDB.watch`: "told" became "notified", "event" became "notice", "watch" became "watcher"; the two bullets about
  repeats merged into one.

**`storage.ts`**: the `//` comment over the `FeedSorter` export no longer says the events are "told".

**`minder.ts`, `device.ts`, `shapes-thing.ts`**: no block the PRs added or changed needed a change.

**Tests** (titles and comments only): `adapter-vault-db.test.ts`, `vaultdb-battery-watch.ts`, `feed-sorter.test.ts`,
`idb-vault-db.test.ts`, `vaultdb-world.ts`, `minding/vault-minder/world.ts`: "hears" became "notifies of", "tells
onBadNews" became "sends ... to onBadNews", a FeedSorter "tells" became "returns", and a watch's event became a notice.

## Doc-block lines, per file (whole file, before -> after)

| File | Before | After |
| --- | --- | --- |
| `shapes/shapes-vault-event.ts` | 33 | 40 |
| `storage/feed-sorter.ts` | 22 | 22 |
| `storage/sorted-vault-db.ts` | 12 | 12 |
| `storage/adapter-vault-db.ts` | 52 | 52 |
| `storage/vault-db.ts` | 67 | 69 |

`shapes-vault-event.ts` grew because two option lists went from one gapped sentence to one value a line;
`vault-db.ts` because `ListedBeside` became a list.

## Facts dropped or moved

- `FeedSorter.eventify`: "The sorter remembers the agerank `seen` leaves, so the same record given again tells nothing."
  Now "remember the agerank it raises. A record that is not news returns none", with the class saying what is news.
- `FeedSorter.eventify`: "Refuses a record of another bank" moved to the class block.
- `agekindOf`: its branch tour ("here where its highest revision is its item's, bare where it has no item, cold otherwise");
  the `Agekind` values say it.
- `adapter-vault-db.ts` `recordkindOf`: its branch tour; the fact that a sparse tombstone is `gone` moved to `recordkindVals`.
- `VaultItemEvent.record`: "The caller's own record object, not a copy" is now said only of a `FeedSorter`'s event. From
  a watch, each watcher gets a `structuredClone` of its own, so "not a copy" did not hold there.
- `VaultEventOf`: its list of the fields every event carries; each field speaks for itself or has its own block.
- `VaultEventOf.agerank`: "undefined from a feed that keeps none" became "undefined where no ageranks are kept, as in a
  vaultDB's watch".
- `doWatch`: "and its bank's world as the datastore last read it" is now a link to `Received`, which says it.
- `VaultDB.watch`: "nothing looks for or avoids the repeat" folded into "A watcher may be notified of a Thing twice in
  one verb ...".
- `SortedVaultDB`'s verbs: each verb's restatement ("The Thing at `ask`'s scope", "Write `ask.record` over the Thing
  `ask.cited`", ...) dropped for the `{@link}` to the `VaultDB` member.

## Disagreements between the old prose and the code

- **`FeedSorter` class**: the old block said "an older revision" gives nothing. In the code, a whole record older than
  the newest revision seen still gives events when it is newer than the newest whole record seen (an item at 2, a soon
  at 4, then a whole 3: the agerank goes from `|4|2` to `|4|3`). The new block says: "A record gives events only when it
  is news: from a later life, newer than any revision seen, or a whole record newer than any whole one seen."
- **VOCABULARY.md *sparse*** says "A tombstone is never sparse"; `FeedSorter`'s and `AdapterVaultDB`'s `recordkindOf`
  both class a sparse tombstone as `gone`, and a feed-sorter test counts one as whole. Not edited (VOCABULARY.md is out
  of scope).

## Proposed renames

- **`SortedVaultDB`**: its first line is "passes each verb and each watch straight through"; the name promises sorting
  it does not yet do. Keep it if the sorting is to come soon; otherwise the name and the line disagree.
- **`eventify`**: no rename. "Return the events for `seen`" fits it.
- **`const told`** in `FeedSorter.eventify` (the fields every event shares): `shared` or `eventFields`.
- **Test helpers named with a minder's verb for a watch**: `heardOver` (adapter-vault-db.test.ts) to
  `noticedRecordsOver`, `heardOf` (vaultdb-battery-watch.ts) to `noticesOf`, the locals `heard` to `notices`;
  feed-sorter.test.ts's `Told` / `toldOf` / `told` to `Shorthand` / `shorthandOf` / `shorthands`; and
  minding/vault-minder/world.ts's `watchEventOf` / `sparseWatchEventOf` to `noticeOf` / `sparseNoticeOf`.

## Open questions

1. **Bad news's verb.** I wrote that a watch "sends" a Thing that fails its checks "to `onBadNews`". VOCABULARY.md's
   *bad news* says "A vaultDB tells a watch's handler", which ruling 2 forbids. Which verb: does a vaultDB *notify*
   `onBadNews` too?
2. **VOCABULARY.md's watch entry** says a watcher "receives it as a `VaultEvent`"; the ruling's word is "notice". Should
   the entry say a watcher gets a **notice**? I did not edit VOCABULARY.md.
3. **An event or a notice?** I call a `VaultEvent` a notice only when a watcher gets one; a `FeedSorter` returns
   events. The file header of `shapes-vault-event.ts` says "`VaultEvent`, the notice a vaultDB's watcher gets".
4. **Left as they are**: the assertion messages in `feed-sorter.test.ts` ('a record taken is told first, as given',
   'each event tells the agerank before and after its record'), which are code and not titles, and the pasted table's
   blurbs ('repeats and olders tell nothing', 'a write heard of between', 'heard by a soon', 'heard twice'). Should the
   messages follow ruling 2 too?
