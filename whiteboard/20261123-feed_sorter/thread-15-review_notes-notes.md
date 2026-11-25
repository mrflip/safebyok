# Thread 15: the Coach's eight notes and four answers, acted on (2026-11-24)

For the Coach, and for whoever reviews #881: each note quoted, the answer, and what was done; then his answers A to D
as built; then the same issues looked for elsewhere (Part 3). Every note's comment is gone from the code.

## The eight notes (a18f6c8dc)

1. **`tryListThings`: "this work is being repeated in every call. It's also picking out individual fields and then
   spreading them back in: just pick with a checker" / "don't have things like actual.kids.read_tc and actual.read_tc be
   wandering around, have a hardened type."** -- Done, with 7 and 8. One check, `ActualChecks` (shapes-answers), picks
   what every report carries (`beside`: `world`, `tracked`, `read_tc`) and what a listing carries (`listed`:
   `parentage`, `deltas`, `damaged_rows`). `besideOf` in AdapterVaultDB is the one place a report is read; `answerOf`,
   `tryBirthBank` and `tryListThings` call it. A report's `kids` no longer carry `read_tc`: the answer's `val` is
   `{ ...actual.kids, read_tc }`, one value in one place.
2. **`watch`: "this is classifying and answer-ifying the event for every listener"** -- True only of a vaultDB with
   several watchers, and there is one per bank: the SortedVaultDB. Doing it once would take a fan-out in AdapterVaultDB:
   one `doWatch` per bank, a set of watchers, and its cleanup on the last unwatch -- the registry taken out two PRs ago.
   Not worth it; not built.
3. **"is sanitizeForeignError appropriate over the ternary?"** -- No. `sanitizeForeignError` returns a plain `Error`,
   not a refusal, and `unexpectedError` already applies it to what it wraps. The ternary is right, so it is named:
   `Throwers.refusalOfThrown` (a VaultError as thrown, anything else `unexpected_error`), also used by
   `refusedAnswerOf`. The host's `onNotice` is wrapped once with `bulletproofHandlerOf(onNotice, { ifError: 'tell',
   transformer: refusalOfThrown, onBadNews })`; `BulletproofTellOpts` became generic in the error it makes, so
   `onBadNews` may take a VaultError.
4. **The two try/catch statements opened onto several lines** -- The first (classifying the row) is kept as he opened
   it. The second went into the bulletproof wrapper of note 3, which is how a host callback is called.
5. **"where are the checkers for these? it would be better if they were close"** -- An answer has no checker by design:
   AdapterVaultDB builds each from parts it has checked, and a reader checks each record where a Thing takes it. A
   comment above the answers says so. What is read through a check, the report, now has its check beside its types,
   and every answer type moved from `storage/vault-db.ts` to `shapes/shapes-answers.ts`. `vault-db.ts` is the
   interface alone.
6. **The banner "Pre-image of an answer, carrying the actual stored value"** -- Now `// == [Pre-image of an answer]:
   ActualChecks, ActualBeside, Actual, GotActual, WroteActual, ListThingsActual, BirthBankActual, Received`, and below
   it: "What a concrete adapter reports, carrying the actual values stored: `AdapterVaultDB` makes the answer from it."
7. **"why would you want read_tc to be missing?"** -- No reason. It was missing because no adapter made one for a get,
   a write or a birth (AdapterVaultDB made it on arrival), and a listing carried it inside `kids`. Every adapter now
   makes it with its world fetch (`readTcNow()` before the step's statement or transaction), and the report carries it
   at the top. AdapterVaultDB refuses `storage_issue` for a report without one, or one that is no UUID version 7.
8. **"it is much better to have robust types without optional fields -- why are they sometimes missing?"** -- `tracked`
   was absent for an ask that tracks nothing. It is now required, null for none. Before and after:

   | | before | after |
   | --- | --- | --- |
   | every report | `world`, `tracked?`, `read_tc?` | `ActualBeside`: `world: WorldRecord \| null`, `tracked: Tracked \| null`, `read_tc: ReadTc` |
   | listing | `kids: Kids` (its own `read_tc`) | `kids: Omit<Kids, 'read_tc'>` |
   | fetched (classifier) | `WorldFetched` {bank, maingate}; `ThingsFetched.read_tc?` | `WorldFetched` and `BankRootsFetched` add `tracked` and `read_tc`; `ThingsFetched` has none |

   Memory, IndexedDB and Postgres each supply all three. What an answer carries is unchanged: `tracked` still only for
   an ask that tracks.

## His answers, built

- **A. Body getters.** `BaseBox` (`sidecar`, `whisper_sealed`), `Gate` (`wayins`, `auth`, `sigs`, `meta`) and `Bank`
  (`lifetok`) read their body by getters off `pickle()`; a field the record lacks reads as undefined. The delete logic
  is gone. A getter alone did **not** solve the undefined issue: `'sidecar' in shellBox` is true for a getter on the
  prototype, so `exactOptional` checks refused a shell Box (sealable, `donorPropsOf`, `nextRevisionOf`, cited). Loosened,
  for a Thing handed in: `boxSealable.sidecar` (`exactOptional` to `optional`), and the bank, gate and box citations'
  body fields (`exactPartialOf` to `partialOf`; box `lifeseq` optional), with `Sealable` and `CitedOf` typed `?: X |
  undefined`. The record checks are unchanged: a box record with an undefined or missing `sidecar` is still refused
  (two cases added). `adopt`: `Thing.adopt` as before (deep-freeze, `tattoo` of the Thing fields, citable);
  `Gate.adopt` checks `wayins` where present, then `super.adopt`; `Bank` and `BaseBox` have none. A spread of a Thing
  still shows its Thing fields alone. *A throwing body getter typed always present* would break every zod check that
  parses a Thing (zod reads each key: sealable, cited, record and `isWhole`'s safeParse would throw instead of
  refusing), es-toolkit picks and `isEqual` that read body keys, devtools inspection, and the duck typing of a shell or
  tombstone; callers would pass `pickle()` or test `am` first. Not built.
- **B. `agerankWas`.** `UnseenAgerank` is gone. `nextAgerankOf` starts `if (agerankWas === undefined) return
  lifeAgerankOf(...)`; `eventsOf` reads `isNewLife` and `agekindWas` at its top. Events still carry `agerankWas:
  undefined`. The generator, rerun: output identical to `table.ts.txt` (190 rows, 254079 chains); `FeedCases` match.
- **C.** The `VaultDB` doc block: "The records an answer or a notice carries become the caller's to keep, deeply frozen:
  a vaultDB never changes one after handing it over." The same line is in `notes/answer-contract.md`.
- **D.** VOCABULARY.md's `agerank` row says "leaves the agerank greater".

## Part 3: the same issues elsewhere

Fixed:

- `helpers/passphrase-strength.ts` (note 3): `try { answered = { ...await host(typed, told) } } catch (err) { throw
  HostErrorSanitizer.refusalFor(...) }` is a `bulletproofAsyncHandlerOf` made once per guard; the spread stays inside.
- `safebyok-postgres` write verdicts (note 8): `lifetok_ok?`, `policies_ok?` became required; every kind's statement
  selects all three (`true AS policies_ok` and the like), as the comment said already. Not stored columns.
- `ReadTc` (note 5) now sits beside `ReadTcPattern` and `SeenChecks.readTc` in shapes-vault-event; `Received` beside
  the reports in shapes-answers.

Left, with what I would do:

- `models/thing.ts` `tellSubscribers`: `try { listener() } catch (err) { onThrow(err) }` (note 3). Wrap each
  subscriber at `subscribe` with `bulletproofHandlerOf`; needs each subclass's onBadNews at subscribe time.
- `models/world.ts` `align`: `try { listener() } catch (err) { this.#device.tellBadNews([err]) }` (note 3; thread 14).
  The same wrap.
- `models/device.ts`, `models/world.ts:433`, `storage/sorted-vault-db.ts:341,345`: `Errors.isVaultError(err) ? err :
  Throwers.unexpectedError(err)` (note 3; thread 14's files). Use `Throwers.refusalOfThrown`; wrap `listener.hear` with
  `bulletproofHandlerOf` at `listen`.
- `storage/sorted-vault-db.ts:292`: `{ sourcelabel: rung.sourcelabel, read_tc: rung.read_tc, banktok: rung.banktok ??
  this.#newestBanktok }` (note 1; thread 14). Make the rung carry its `Stamp`.
- `shapes/shapes-vault-event.ts`: `read_tc` "Undefined only where a vaultDB's watch does not say" (note 7). Every
  vaultDB in the tree says; make it required. A host-visible event, so held.
- `GoodAnswer` / `BadAnswer` `tracked?: Tracked` (note 8). Make it `Tracked | null` as the report is. A host-visible
  answer, so held.
- `storage/thing-classifier.ts`: `WorldFetched`, `AboveFetched`, `BankRootsFetched`, `ThingsFetched`,
  `TrackedFetched` (note 5). Move them to shapes beside the reports.
- `safebyok-postgres/src/postgres-bank-db.ts` `listenOrNull`: `try { return await listen(channel, onNotify) } catch
  (err) { onFailed(refusalOf(err)); return null }` around the host's `listen` (note 3). It could be
  `bulletproofAsyncHandlerOf(listen, { ifError: 'tell', transformer: refusalOf, onBadNews: onFailed })`, answering
  undefined for null; but the module is shared with safebyok-big's `PostgresBankDB`, so left. `unlistenOnceListening`
  ignores a failure on purpose, which no bulletproof mode does: leave.
- `safebyok-postgres` `type Told = { labelpath: string, thing?: unknown, world?: unknown }`: genuinely optional (a
  notice carries the Thing and world only where they fit). Leave.
