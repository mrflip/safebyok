# Thread 4: the SortedVaultDB sorts, and is the one place an answer is parcelled (2026-11-24)

Branch `20261124-sorted_feed`, draft PR #870, stacked on #869. **Red on purpose**: safebyok 1840 passed,
7 Minder tests fail (below; the same seven, the same assertions, after all four reworks), awaiting the Coach's ruling.
safebyok-idb-lean 113, safebyok-postgres 354, safebyok-react-lean 320 pass; typecheck and lint clean in each.

**Fourth rework, 2026-11-24** (Changes H, I and J): details in [thread-4-shell-ancestor.md](thread-4-shell-ancestor.md).
* **The backing store reports the nearest stored ancestor** (`Classifier.AboveFetched.ancestor`), each adapter in its one
  step (Postgres by `starts_with`, longest first); `Shell.under(scope, ancestor)` builds the shell at any depth.
* **Every answer that says nothing is stored carries the shell**, refused writes included; a `dbhas` is null only where
  the verb threw. `WroteActual` added. `notes/answer-contract.md` gains the new core's paragraph.

**Third rework, 2026-11-24** (Changes E, F and G): details in [thread-4-banktok-union.md](thread-4-banktok-union.md).
* **Every ask carries `bank_lifetok`**, the sender's (a Bank's builders, a birth); a notice of an answer takes the ask's,
  else the world's; no lifetok is read from a val.
* **`VaultItemEvent` is `VaultEventOf<'item'> & ItemSeen`**, a union of `full`, `soon`, `gone`, `void` by val type.
* **The SortedVaultDB is made after the restores**, right before the two hellos.

**Second rework, 2026-11-24** (Changes C and D): details in [thread-4-void-signin.md](thread-4-void-signin.md).
* **A vaultDB says where a void is**: a `gotvoid` answer's (and a `void` refusal's) `dbhas` is the void sentinel under
  its parent's lifepath as the step read it, built in `classifyGetThing` from the bank's roots each adapter's step
  already reads. The SortedVaultDB notifies that sentinel; `FeedSorter.lifepathAt` is gone.
* **The SortedVaultDB is made at sign-in**: `SortedVaultDB.make(scope, { vaultDB })` watches from then until its
  `sweep()`, which `Device.sweep` calls; `hello(vaultDB)` hands a minder its vaultDB. The bullets below are brought up to date.

**Rework, 2026-11-24** (the Coach's rulings on the notice and the agerank): details, and what the Coach asked to find
out, in [thread-4-converge.md](thread-4-converge.md), for the Coach and whoever picks this thread up.
* **The notice converges with the answer**: `recordkind` is `liveness` (`Liveness`, `livenessVals`: `soon`, `full`,
  `gone`, `void`); `record` is `val`, holding what was seen whatever its liveness, the void sentinel for `void`; every
  `VaultEvent` carries `bank_lifetok: Lifetok | undefined`. No `ok` (there was none). `eventkind`, `MinderEvent` and the
  answer types are unchanged. `bell` takes a void's sentinel at the lifepath it carries; `Minder` ignores a void notice.
* **An agerank's last field is a time**: `lifepath|high|item|time`, `time` the first eight hex digits of the `read_tc`
  the newest revision was last seen at (`AgerankTimeDigits`). `eventify(seen, read_tc)`, the read_tc required and put on
  each event. The feed table: 21 rows added (190), a record's optional fourth element its chunk; no row's `streamed`
  changed. A wontfix row: a `read_tc` from a clock running ahead.

* **Built**:
  * **Every answer carries `read_tc`** (`vault-db.ts`): `GoodAnswer` and `BadAnswer` each have `read_tc: ReadTc`, so
    every get, write, list and birth answer does, good, refused or thrown. `ListThingsAnswer` no longer adds its own
    (it is always present now); `Kids.read_tc` is unchanged. `Actual` and `BirthBankActual` take an optional
    `read_tc` a concrete adapter may report; `AdapterVaultDB` answers it, checked (`Classifier.readTcOfStep`, which
    refuses anything but a UUID v7 as `storage_issue`), or mints one when the report reaches it. `answerForThrown` and
    `refusedAnswerOf` mint one. A list's stays as it was (the adapter reports it in `ThingsFetched`). No concrete
    adapter changed. A minder's cached `GotAnswer` omits `read_tc` (`Omit<GoodAnswer, 'read_tc'>`): it reads no datastore.
  * **`AdapterVaultDB` no longer parcels** (its notify and queue methods and `ThingWatcher` are gone). Its watch notifies only what
    `doWatch` delivers, each as an `item` event with `read_tc` minted when its record is classified and
    `sourcelabel: undefined`. Each concrete adapter's raw watch now notifies: `MemoryVaultDB` each Thing a good write
    stores and a birth's three roots, on a later microtask; `PostgresVaultDB` what its LISTEN channel reports (its
    writes, any process's), nothing without `listen`; `IdbVaultDB` what its bell rings (a good write's Thing, a birth's
    roots), from every tab on the database including its own.
  * **`VaultEvent`** gains `sourcelabel` and `read_tc`; the `SortedVaultDB` stamps them.
  * **`SortedVaultDB`** (`sorted-vault-db.ts`): one bank, given to `make` (another bank's watch is refused), one
    `FeedSorter`. It watches the wrapped vaultDB from `make` until `sweep()`. Each verb returns the wrapped answer unchanged, after notifying,
    synchronously and in order, the events of each record the answer carries: the world's bank and main gate, each
    tracked root not `'same'`, a list's parentage and deltas, then its own (a get's live record, tombstone, void or
    sentinel, or dbhas; a write's val or dbhas; a birth's three roots or dbhas). Each notice is `{ ...event, sourcelabel:
    'vault_db', read_tc: answer.read_tc }`, frozen, the same object to every watcher. An answer of another bank is sorted
    by no one. A feed notice is sorted at its own `read_tc`. A record the sorter
    refuses goes to every watcher's `onBadNews`; a handler that throws goes to its own `onBadNews`.
  * **`bell(event: VaultEvent): void`** (the Coach's name and signature): an `item` notice's record is sorted as an
    answer's is, and its events carry the incoming `sourcelabel` and `read_tc`; a `life` or `aged` notice notifies nothing; incoming
    ageranks are never read. Refused (`bad_record`) for anything but a notice of this bank with a known eventkind, a
    label for its `sourcelabel` and a UUID v7 for its `read_tc`, an item's record of the notice's own Thing with a deep
    lifepath and right parity.
  * **Tests**: the raw battery (`vaultdb-battery-watch.ts`) gains "notifies of nothing an answer carries"; the
    parcelling cases moved to `sorted-vault-db.test.ts`, which runs the battery with `watches: false` and adds 30-odd
    cases.
    `adapter-vault-db.test.ts`: answer `read_tc` cases, one "notifies of nothing an answer carries". Helpers:
    `TH.ReadTcPattern`, `TH.AnyReadTc`, `TH.maskedReadTcsOf(events)` (a raw notice's minted read_tc read as
    `AnyReadTc`, since chai's `deep.equal` takes no matcher); `TH.itemEventOf` carries `sourcelabel: undefined,
    read_tc: AnyReadTc`. Minder worlds wrap their vaultDB in one shared `SortedVaultDB` (`sortedOf(vaultDB)` in
    `vault-minder/world.ts`, a WeakMap, so two minders over one vaultDB share one, as a device's do).
* **Decisions made**:
  * **`sourcelabel`**, a label (STYLE.md *Tags*: freely chosen identifier); the wrapped vaultDB's is `'vault_db'`
    (`SortedVaultDB.VaultDBSourcelabel`). VOCABULARY.md has no word for a source.
  * **Roots in the order world, then tracked**: bank, main gate (world), bank, main gate, root box (tracked). One step
    reads both, so the repeat is dropped; strictly per Thing would read worse for nothing.
  * **No copies**: a notice's record is the answer's (or the feed's, or the ringer's) own object, as the sorter keeps
    it. The old raw watch cloned per watcher; cloning here broke the Minder's identity tests and bought nothing, since
    the minder lands the answer's own object anyway.
* **Deviations**: the host's vaultDB is now watched once per device, not once per minder: three model tests
  (`device.test.ts`, `vault.test.ts`) and four React ones (`react-giver.test.tsx`) that counted host watches per minder
  count one. `record-hooks.test.tsx` "shows a list refused as its error" now stubs a whole refused answer.
* **Discoveries**:
  * The memory feed's microtask runs before the answer resumes, so through a `SortedVaultDB` over a `MemoryVaultDB`
    a write's record is first learned from the feed (feed `read_tc`), and the answer's copy is a repeat.
  * Dropping repeats means a record seen once is never notified again: a minder that loses a soon record (gc,
    goodbye then hello) gets it back only from a newer revision, since a later listing's deltas are repeats. The
    sorter also sorts while no one watches, so a record learned then is a repeat later.
* **For the Coach**: the 7 failing Minder tests, by cause, are in the PR body and the report.
