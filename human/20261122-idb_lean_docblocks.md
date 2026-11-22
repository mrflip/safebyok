# 2026-11-22: idb_lean doc blocks -- one guarantee added to overwriteThing, no renames

A doc-block pass over what PR #829 changes under `packages/safebyok-idb-lean/`, on the style findings the
orchestrator relayed. Doc blocks only: no behaviour, name or running comment changed. Commits `68274b384` (src)
and `fae78eee2` (tests).

## Changes, member by member

`src/idb-minder-bridge.ts`

- Module header: "IdbMinderBridge: copies the whole records a ThingMinder caches into an IdbVaultDB."
- `IdbMinderBridgeOpts`: "Options for {@link IdbMinderBridge.make}." The list of its three fields is gone from
  the headline; each field has its own block.
- `idbVaultDB` field: "The IdbVaultDB the records are copied into."
- `onBadNews` field: "Called with the refusal of each copy that fails. Default: a no-op."
- `IdbMinderBridge`: first line "Copies a ThingMinder's cache into an IdbVaultDB.", then: newer-only storing,
  "Nothing else is written, and nothing is ever deleted.", and the hello order on lines of their own.
- `hello`: "Start copying the minder's cache to IndexedDB. A second call does nothing."
- `#copyLanded`, `landedRecordOf`: "the record `event` says was cached", in place of "landed in an item".
  VOCABULARY.md keeps **land** for an operation and all its consequences done, so the word is out of these blocks.
- `make`, `goodbye`, `Checks`, the `minder` field: unchanged.

`src/idb-vault-db.ts`

- `IdbVaultDBOpts`: "Options for {@link IdbVaultDB}:" (was "an IdbVaultDB"); the list stays.
- `idbVaultDBOpts`: new phrase, "The check of {@link IdbVaultDBOpts}."
- `Rung`, `isHeardBy`, `rootsFetchedIn`, `worldFetchedIn`, `worldAfterIn`: phrases. The fetched helpers say what
  they fetch and where; the null cases and the `tracked` comparison are left to the return types
  (`BankRootsFetched`, `WorldFetched`, `Tracked`), whose own blocks say them.
- `IdbVaultDB`: "Its watches receive the writes made in every tab" (was "Its watch hears").
- `overwriteThing`: first line kept in meaning, "Store `record` at its scope, if it is newer than the Thing stored
  there." Added below it: "Concurrent calls, in any order, leave the newest record stored. It notifies no watch."
  Both come from the code and the maintainer comment above the block; the first is the guarantee the bridge relies on.
- `#ring`: "Tell every watch on this database, in every tab, of the Things in `rungs`."

`src/vault-shelf.ts`: `bellnameOf`, `descendantsRangeOf`, `childrenIn` reworded plainly ("rung on", "one label
under" gone). `src/index.ts`: "the new core's vaultDB" became "a vaultDB" (transition wording, not for a host).
`src/phrases.ts`: unchanged; its blocks follow the core's `phrases.ts` convention.

`tests/`

- `test-helpers.ts`: a short first line ("star-import them as `TH`") and one line on what it gathers.
- `_cheat_idbThingsOf`: "Unchecked access to the Things `idbVaultDB` stores, on a connection of its own: plant,
  remove or read one raw."
- `minder-world.ts` header: "The world of an IdbMinderBridge under test." (`bridgedWorldOf` says the rest.)
- `fakeBankOf`, `BridgedWorld`: plain sentences in place of noun-phrase lists ("what they stand on" is gone).
- `bridgedWorldOf`: a first line that fits, then its two options as a list with defaults, in place of the
  narration of its steps.
- The test files' own blocks and `eslint.config.mjs` (a copy of the core's) are unchanged.

## `@example`

None added to `overwriteThing` or `IdbMinderBridge.make`. `overwriteThing` is a one-argument call whose first line
says it all; `make`'s use is in the package README (make, then the bridge's `hello`, then the minder's), and the
tests are the examples (`notes/more_style.md`, `#example-earns-its-lines`).

## Facts dropped

- `IdbMinderBridgeOpts`: "and where its trouble goes" (the field's block says it).
- `onBadNews`: "and anything else that went wrong". The code catches only failures of a copy (the record's checks
  and the IndexedDB write), so the block now says that; see the open questions.
- `hello`: "until `goodbye`" and "where it is newer than what is there" (said by `goodbye` and the class block).
- `overwriteThing`: "a live record or tombstone" (the signature says it) and "An older or equal one is ignored"
  ("if it is newer" covers both).
- `Rung`: "the Thing's bank, and what the watch receives" (its two fields, `scope` and `received`).
- `rootsFetchedIn`, `worldFetchedIn`: "each null for none", "how they compare with what `ask` tracks" (the return
  types say both). `worldFetchedIn`'s "and its root box" in the tracked comparison is dropped with it.
- `test-helpers.ts`: the inventory of each world (a fresh database, a twin, the cheat; a minder bridged to one);
  each helper's block has it.
- `minder-world.ts` header: "a ThingMinder over a MemoryVaultDB with a born bank, bridged to an IdbVaultDB on a fresh
  database" (on `bridgedWorldOf`).
- `fakeBankOf`: "its scope and root box" (the returned fields).
- `bridgedWorldOf`: the box sits "under its root box" (implied by `boxThingOf()`), and that the bridge is said hello
  to before the minder (the class block states that order for every caller).

## Proposed renames

- `#copyLanded` to `#copyCached`, and `landedRecordOf` to `cachedRecordOf`: VOCABULARY.md reserves **land** for an
  operation and all its consequences done (a storage write is "written"), and the new blocks say "cached".

`overwriteThing` and `dbName` keep their names by the Coach's ruling.

## Open questions

- `onBadNews`'s old prose ("and anything else that went wrong") promised more than the code delivers: only a copy's
  failure reaches it. Written as the code does; tell me if the bridge should report something else there.
