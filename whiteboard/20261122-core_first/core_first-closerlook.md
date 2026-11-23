_The sprint doc's Closer Look tab as of 2026-11-22, the Coach's replies included._

# Closer Look

One opus reader, cold: it read the code and the three draft files (core\_first-design, vaultdb\_answers-handoff, where-data-lives-draft) and nothing else. **A** = `80cd1a148` (the minders as one `Minder` with two subclasses, the device before its user, persistence, the IndexedDB persister); **B** = `7008af184` (the same base plus the list answer). Base: main `e7ae8b445`. **Not seen:** thread 5 (a get's answer, tombstones), still in review then. Rulings you'd made were given as not-discoveries. Flavours: guidance gap, guidance wrong, solution off, redesign?. Type replies beside an item, highlighted; I read the tab when you say you've replied.

## 1. Eyebrows, ranked

### 1.1 The Gate keeps its own record beside the world, so a cached gate never gives way to the fetched one (A)

- **Where:** `models/gate.ts:253` `#adopt`, called only from `#putGate` (this device's own gate writes). `models/device.ts:249-252`: `#bringUp` attaches a Bank and Gate made from the cached world, then after `fetchWorld()` returns early on `if (this.#bank !== null)`. `models/bank.ts:47, 68-81`: `rootBox` and `track` read `worldAt()`, but `lifetok` and the Thing fields read the Bank's own record. The giver's `useGate` (`react-giver.tsx:403`) reads the world.
- **What it means:** on a returning user's reload the Gate is built from the restored gate; the fetched gate lands in the BankMinder and `useGate` shows it, but the Gate object keeps the cached wayins for the life of the page. A passphrase replaced or a passkey revoked on another device keeps unlocking here until reload, while `useGate` shows the new headers; a gate change made here cites the old revision and refuses `stale_write`. The ruling accepted "until the fetched gate lands"; the code goes further. Before this sprint the gate was always fetched fresh at startup; now a stale gate at startup is the common case for every returning user.
- **Origin:** the Gate's own record is carried from the old code; making it bite at every startup is new.
- **Cost:** the wrapped bankKey and wayins live in three readable places (the world, the Gate object, the giver's headers); every unlock, gate write or gate display is reasoned about against two of them.
- **Flavour:** guidance gap, or redesign. "No more than one place people read from" was applied to `track` and `rootBox` but not the Gate's wayins. A small redesign likely dissolves it: the Gate reads its wayins and revision from `world.gate`, as `Bank.track` already does. A security reviewer will care about the revocation case.
- **Settle it:** a test that brings a device up from the cache, lands a newer gate with passkey0 revoked through `fetchWorld`, then tries a passkey unlock; then a ruling on whether the Gate follows the world now or with the instance-sync thread.

### 1.2 `restoredSharingOf` exists because per-bank query defaults are set after the restore; probably redundant, untested (A)

- **Where:** `minder.ts:763-777` (`RestoreOpts`, `restoredSharingOf`); `minder.ts:152-171` (`#setQueryDefaults`, "set at hello, not at make").
- **What it means:** a probe confirmed a restored entry keeps the options hydrate built it with until its first fetch. But `sendToTSQ` already drops an older or equal record before `setQueryData`, and the listing code computes its own value; a probe shows TanStack's default would take an older record, yet the minder never hands it one. No test exercises `restoredSharingOf`. (The reader also saw a seam with B, a listing becoming a `Kids` object; *Orchestrator:* the restack now dispatches on `isKids`, so that trap is closed.)
- **Origin:** new.
- **Cost:** a third structural-sharing function, and a second options set for every entry between restore and first fetch.
- **Flavour:** redesign?. The minder sets per-bank defaults at `hello` because the `queryFn` closes over the minder. TanStack's own pattern is client defaults set at creation with a default `queryFn` that dispatches by key; the landers map already gives a per-client registry by bank hash. Then `makeClient` could set everything before any restore, and both this concept and "set at hello" would go.
- **Settle it:** remove `restoredSharingOf` from `RestoreOpts` and run the suite, or add a test of a tie or older record landing on a restored entry before its first fetch

If it's supposed to be given at start do that?.

### 1.3 Two owners refetch an observed listing (B)

- **Where:** `minder.ts:438`: `#settleLanded` invalidates with `cancelRefetch: false` and the default `refetchType`, so TanStack refetches an active listing itself. `react-giver.tsx:698-711`: `refetchMarked` also refetches on every listing invalidate; its comment ("the minder ... refetches nothing") is now false for first landings. The public `invalidate()` (`minder.ts:292`) still uses `refetchType: 'none'`.
- **What it means:** a probe shows both collapse into one list, so it's harmless today, but there are two policies for who refetches, and a stale comment.
- **Origin:** new in B; rule A is drawn, and the handoff says a mounted hook should re-list.
- **Cost:** two paths per first landing, two kinds of invalidation with different refetch semantics.
- **Flavour:** solution off, small.
- **Settle it:** name one owner, the minder's `refetchType` or the giver's listener.

Minder

### 1.4 `useGate` keeps a module-level WeakMap memo for snapshot identity (A)

- **Where:** `react-giver.tsx:715` (`GateShownOfCkey`, keyed by gate record or by Device), `gateShownOfWorld`, used from `useGate`.
- **What it means:** the memo gives `useSyncExternalStore` the same object until the world's gate changes. The world's gate record is already stable by identity: `useSyncExternalStore(subscribe, () => worldAt()?.gate)` plus a `useMemo`, or `use-sync-external-store/with-selector`, gives the same with no module state.
- **Origin:** new. **Cost:** a cache with two kinds of key, held for the device's life. **Flavour:** solution off.
- **Settle it:** swap in a `useMemo` over the gate record and run the giver's tests.

### 1.5 A save that fails is silent by default (A)

- **Where:** `safebyok-idb-lean/src/idb-persister.ts:48` (`onBadNews = noop`); `device.ts:201-207` sends only restore failures to the device's `onBadNews`; the README example passes none.
- **What it means:** restore failures reach the device, save failures reach the persister's own handler, a no-op unless wired. Separately, TanStack's `persistQueryClientRestore` calls `console.error`/`console.warn` in non-production builds (the tests mock the console). The error comes from the host's storage, so probably nothing secret, but it's a logging side door nobody chose.
- **Origin:** new. **Cost:** one more bad-news path. **Flavour:** guidance gap.
- **Settle it:** a ruling on whether the device hands its `tellBadNews` to the persisters it's given.

### 1.6 A test title says more than the test checks (B)

- **Where:** `vault-minder-cache.test.ts:277`, "marks nothing stale for a list's own children, which land while it is under way". It checks only the end state: a list's own deltas do mark the listing stale mid-list, and the landing clears it (the listen test asserts `['invalidate','success']`). Also `vault-minder-listing-orders.test.ts:46` accepts "current or marked stale", so alone it can't tell rule A from marking on every landing (other tests cover that).
- **Origin:** new. **Cost:** low. **Flavour:** solution off (wording).
- **Settle it:** retitle to "leaves the listing current once the list lands", or assert the events.

### 1.7 The boxes snapshot keeps every user's boxes ever signed in on the device (A)

- **Where:** `minder.ts:772` (`SaveOpts` saves every entry with data), `device.ts:204`.
- **What it means:** the vault client restores and re-saves earlier users' sealed boxes forever. Your sync note said "the VaultMinder all boxes for the active user". Within "the most liberal policy", but past the note's wording: mentioned so it's a choice, not an accident.
- **Origin:** new. **Flavour:** can't tell; probably covered by ruling. **Settle it:** one line from you.

## 2. Undergrowth (searched, not read through)

### Control primitives

- **Promises in fields,** `device.ts:74-76`: `#started` (new, `hello`) and `#broughtUp` (carried, `signIn`) make a start idempotent, as the draft asks. Drawn; cheap.
- **A flag gating a path,** `device.ts:252`: `if (this.#bank !== null) { return }` after `fetchWorld` exists only for the cached-world path. New. It's the line that keeps the cached Gate (1.1).
- **Carried in `minder.ts`:** `#isReady`, `#unwatch`, `#landers`/`LandersOfClient`, and `hello`'s refusal while another minder of the bank minds in the same client.
- **Throttle,** `idb-persister.ts:51`: es-toolkit's, as TanStack's stock persisters do. Drawn.
- **WeakMap memo,** `react-giver.tsx:715`: new; 1.4.
- **B:** `#isFirstStored`, `cancelRefetch: false`, `landedKidsOf` keeping a later-read listing: all drawn by rule A and the handoff.
- **Not found:** no queue, counter, generation, unique token, join, lock, timer beyond the throttle, abort controller or retry.

What is the weakmap memo? *hairs raise*

What is landers and landers of client?

### New mechanisms

- New files: `minding/minder-keys.ts` (`bankKeyHeadOf` moved, plus `useridsCachedIn`), `storage/persister.ts` (`DevicePersisters`, `MemoryPersister`, `isPersister`), `safebyok-idb-lean/src/persist-shelf.ts`. All small.
- `Minder.persist` with `PersistBuster`, `RestoreOpts`, `SaveOpts`, `restoredSharingOf`: persistence drawn, the restore options are 1.2.
- `BankMinder.subscribe`: a filter over `listen`, for `useSyncExternalStore`. Drawn by "sync, instantly everywhere".
- `Device.signIn`, `useridsSeen`: drawn. B's `kidsOf`, `readTcNow`, `readTcOf`: drawn. Two persisters: drawn.

### Non-standard JavaScript

- Little here. Carried: `void (async () => {...})()` in `tellBadNewsTo`; `Object.freeze(this)` on classes whose private fields change. New and minor: the giver's `mounted?.userid == null` (loose equality); statics called through subclass names (`BankMinder.makeClient`/`VaultMinder.makeClient`, `.persist`), each the same function.

Fix the == how did that pass lint? Investigate

### Checks hunting guessed-at misuse

- `#demandItemScope` / `#demandListingScope` / `notMinded` on every read and on `tryWrite` (`minder.ts:596-607`): refuse a BankMinder asked for a box, or a VaultMinder for the bank. For `tryWrite` it stops a write that would cache nothing; on the reads, a cull candidate (thread 8).
- `VaultMinder.make` checks `bankMinder instanceof BankMinder`; only the device calls it.
- Not misuse checks: `isPersister` (a host object checked by its interface); `isKids` (guards against TanStack passing a host `select` result through structural sharing).

## 3. New names outside the draft

About 75 new names in src, about 15 drafted, so **about 60 outside the draft**:

- **What a minder minds (A):** `mindsItemAt`, `mindsListingAt` (the subclass hooks, with `rootBox`); `#demandItemScope`, `#demandListingScope`, `notMinded`/`NotMinded`; `RootLabelpaths`, `isRootLanding`, BankMinder `#scopeAt`, `subscribe`; `#landWorld` (lands an answer's world on every verb); `worldNotHeard`/`WorldNotHeard`; `isNoneStored`; `MinderOptsChecks`/`minderOpts`, `VaultMinderOpts`, `bankMinderMakeArgs`, `vaultMinderMakeArgs`, `BankMinderExpected`; `useridsCachedIn` (userids from key position 1).
- **Persistence (A):** `Minder.persist`, `PersistBuster` (= `ThingFormat`), `RestoreOpts`, `SaveOpts`, `restoredSharingOf`; `DevicePersisters` (`roots`, `boxes`); `isPersister`, `PersisterMembernames`, `PersisterExpected`; `MemoryPersister`; `IdbPersister`, `IdbPersisterOpts`, `recordlabel`, `throttleMs`, `#persistThrottled`, `#save`, `persistShelfOf`, `PersistDBVersion`.
- **The device before its user (A):** `signIn`, `useridsSeen`, `nobodySignedIn`; `#bankClient`, `#bankMinder`, `#userid`, `#started`, `#restore`, `#attachWorld`; `DefaultBanklabel`, `DeviceJSON`, `SignedOutBank` (moved into the core).
- **React giver (A):** `signedInDevice`, `setSignedIn`; `GateOpts`, `GateResult` (`useGate` answers `{ data }`); `GateShownOfCkey`, `gateShownOfWorld`, `shownNow`.
- **List answer (B):** `Kids`, `KidEntry`, `ReadTc`, `ReadTcPattern`, `readTcNow`, `readTcOf`, `kidsOf`, `entryOf`, `isKids`, `landedKidsOf`; `#isFirstStored` (rule A's name).
