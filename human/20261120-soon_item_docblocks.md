# 2026-11-20: #790's doc blocks brought to STYLE.md -- event order moved to the event types, one name jars

Two `docs:` commits on `20261120-soon_item` (#790), over `50bac3475`. Doc blocks and comments only; lint and
typecheck green in safebyok and safebyok-react.

## Doc-block lines, before and after

| File | Before | After |
| --- | --- | --- |
| `packages/safebyok/src/minding/thing-minder.ts` | 172 | 157 |
| `packages/safebyok/src/shapes/shapes-minder.ts` | 89 | 94 |
| `packages/safebyok-react/src/giver/react-bridge.ts` | 10 | 8 |
| `packages/safebyok-react/src/giver/react-giver.ts` | 39 | 39 |
| `packages/safebyok/tests/minding/thing-minder/world.ts` | 33 | 37 |

shapes-minder grows because the event order moved there from `listen` and the class doc. world.ts grows because
`toldOf` became a three-row list under a short first line.

## Member by member

- **`ThingMinder` class doc** (57 to 49 lines). The first line says what it is: this device's cache of one bank's
  Things. The narrative names the item, the soon and the listings, and where records come from. Every invariant is
  kept, in plain sentences. The listener bullet keeps the guarantee (events in the order the cache changes, never
  going back, a removal restarting the run) and points to `ThingEvent`, `SoonEvent` and `ListingEvent` for the order
  of events. The sparse-record bullet points to `SoonEvent` for what each read answers. The three bullets on what
  is cached by an operation and through the watch are now one.
- **`listen`** (15 to 7 lines). What it calls, the version to pass, that it tells every query added, changed or
  removed but no observer's event, where each kind's events are described, nothing on ageing, and listener throws.
- **`ThingEvent`** now lists its `action.type` values: `success` (even when only the time changes), `error` (item
  unchanged), `invalidate` (once, just after the soon's `success`, none after a refused get). It keeps the
  `success`-then-`invalidate` order for a record that lands while the item stays behind. All of this came from
  `listen` and the class doc.
- **`SoonEvent`** adds `tryAt` untimely to what a listener on its `success` finds, from the class doc.
- **`ListingEvent`** adds when it tells `success` and `invalidate`, moved word for word from `listen`. This moves one
  mention of `hello`, unchanged.
- **`MinderGetOpts`** points to `TsqStaleTime` rather than repeating its second line.
- **`tryList`**: same facts, shorter lines.
- **`#fetchRecord`**: names `stale_read`.
- **`#sendToTSQ`**: one plain doc line and its exception. Its comment is reworded, with the same reasons.
- **`#landedByGet`**: says what it does for a get's record, without naming what it calls.
- **`#markBehinds`**: two short lines. Its comment is one line shorter.
- **`isTimelyQuery`**: one clause per condition.
- **`bridgeDevice`** (8 to 6 lines). It keeps entries in step, copies records, marks an entry stale on a newer
  revision or a refused get (without refetching), catches up at the start, and resets when a bank object ends.
- **react-giver module doc**: the Coach's two principles, as what a host gets. The giver turns the minder's events
  into what a host and its user most likely want to see. It puts records and metadata in the host's cache and
  supplies default options a host may override, then leaves the cache to React Query and the host's options.
- **world.ts**: `listenerOf` is one short line. `toldOf` is a short line and a list. `ToldSort` says "whether its
  record is live, gone or the shell" in place of "its record's sort".

Kept verbatim, as asked: every `hello` and `goodbye` mention, "The emitted event pragmatically mimics the incoming
TSQ event.", and the comment above `MinderEventFormat`.

## Facts dropped

- Class doc: the parenthesis on what the watch carries ("of each write, each changed tracked Thing and each
  refusal's `dbhas`"). The `dbhas` and tracked records are still in the operation-caching bullet. "each write" is gone.
- Class doc: "each through one merge" (mechanism: the structural sharing `newerThingOf`).
- Class doc: "the item stays as fresh as it was". "Dropped" implies it.
- `ThingEvent`: "(a del answers one)" after "tombstone".
- `tryList`: "a refusal included" (the `try` verb says so), "A list never drops a labelpath from that listing" (the
  class invariant says so), and "by its labelpath" for what `tellBadNews` is told.
- `#fetchRecord`: "Refuses a record of another Thing than `ask`'s" (a guard against a vaultDB bug, refusing
  `unexpected_error`).
- `#sendToTSQ`: "A record of another bank refuses" (the same guard).
- `bridgeDevice`: "While the minder's item is behind, the entry's staleTime is 0, so a host fetch that resolves after
  an invalidation, with no hook watching, leaves it stale all the same." That is `recordQueryDefaults`'s doing, and
  its comment says it. Also dropped: "the entry is then untimely as the item is, and stays so when the item falls
  behind later, which tells no second invalidation". `deliverEvent`'s comment covers it.

## Proposed renames (reported, not made)

- `#markBehinds`: its doc says it removes a soon the item caught up with, or else invalidates the item. "mark
  behind" covers only the second. A name for both, `#settleSoon` say, would match.

## Open questions

- None on facts: no doc and code disagreements found in the blocks touched.
- `tryList` stays at six lines of prose. Each line is a fact a caller acts on (listing, soon, tombstone, damaged rows,
  refusal before `hello`). Trimming further means dropping one of them.
