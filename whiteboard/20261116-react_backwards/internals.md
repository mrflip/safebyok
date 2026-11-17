# react_backwards: the internals

What has to exist under `app-side.md`'s hooks, parts and kit, layer by layer, and what each layer
owes the one above. Status: a proposal for discussion, 2026-11-16, rewritten the same day around
one Device per process, and on 2026-11-17 around two layers of query cache: a private client per
bank, which the minders keep, and the host's own React Query, which the hooks read. The core's interface serves this layer: where a facility asks the core
for something, the ask is the point, not the spelling.

## The layers

```text
safebyok-react      the giver: hooks · parts · kit · the bridge
      │               tab state: useSyncExternalStore on the Device
      │               records: the host's React Query, fed by the bridge from the minders
Device              one per process (per tab): host functions · deviceDB · the open gating ·
      │             the user · each bank's snapshot, then its bank object
bank object         one per (user, banklabel), arriving whole after its start: its vaultDB · its own
      │             QueryClient · minders · drafts · the lease · where a whisper may be
safebyok/cached     ThingMinder (query-core)               stored Things, as minded records
safebyok/core       Bank (one life) · Gate · Gating · Lease · sealers
safebyok/storage    VaultDB                                 one per bank, the host's choice
```

Two kinds of state, each with its own tool:

* **Stored Things** (records, listings) come through the ThingMinder, which keeps them in its
  bank's private TanStack cache. That is server state, the job TanStack was built for. The host's
  React Query shows them, in entries of its own that the bridge keeps current (F5).
* **This tab's state** (who is signed in, each bank's stage, locked or unlocked, the lease's end,
  the open gating) is never stored, so no cache can know it. The Device and each bank object say
  when it changes, and build their snapshots.

`safebyok-react` stays thin: a tab-state hook is a `useSyncExternalStore` on the Device, a record
hook is React Query's `useQuery` over options the giver builds, and a part is a ref callback into a
draft. Everything that has to be right for security (whisper
lifetimes, CAS, gating) is in the core or the bank object, where it can be tested without React.

## What answers synchronously, and what may wait

React's render is synchronous and may come at any moment, including before anyone signs in. So
one thing must answer synchronously from module scope on, and that is the Device. A bank object
is made by an async start and arrives whole; until then, the Device's snapshot gives its stage.

| Must work synchronously, from module scope | May wait on an async call |
|---|---|
| `Device.make`, with no browser API touched: safe during a server render | a bank object: `device.ensureBank(banklabel)` |
| The Device's `subscribe` / `getSnapshot` / `getServerSnapshot`. They never fail | everything on a bank object: its acts, its observers, its drafts |
| `device.hello()`, `device.vacate()`, a user switch. They never fail | the probe's libraries loading |
| `probe()` on each host function: it starts loading, and reports a failure rather than throwing | the packet's hydration, where there is no packet |

Each bank's snapshot is a slice of the Device's, before its bank object arrives and after, so a
tab-state hook never changes what it subscribes to. A record hook holds its fetch until the bank
object arrives, and shows any entry already in hand. A button whose act needs the bank object is
disabled until then.

### A user this browser has never seen

The case a design must get right first: `userid` is known, the browser has nothing for the user
(never seen, or vacated, which is the same), and either no bank is stored anywhere (a new user) or
one is (a returning user on a new browser, with no lease here).

| Facility | While the bank is starting | New user (no bank) | Returning user (bank stored) |
|---|---|---|---|
| `useBank` | Device: `starting`, no bank object | `unborn`, a bank object | `ready`, locked, a bank object |
| `useBox`, `useBoxList` | `isPending`, nothing fetched | `data: null`, empty: real answers (open matter 7) | `isPending`, then the records |
| `useWhisperDraft` | `isReady: false` | ready | ready |
| `GatingDialogs` | no gating | `build_bank` once a put needs a bank | `unlock_bank` once an act needs the bankKey |
| `bank.putBox`, `draft.put` | (disabled) | `build_bank`, birth, put | `unlock_bank`, put |
| `draft.begin` | (disabled) | starts empty, no gating | box absent: empty. Box present: `unlock_bank`, unseal |
| `bank.withWhisper`, `WhisperText` | (disabled) | rejects: box absent. Never a `build_bank` just to read | `unlock_bank`, get, unseal |
| `bank.delBox` | (disabled) | does nothing: already absent | `unlock_bank`, then the tombstone |
| `bank.ensureUnlocked` | (disabled) | refuses "no bank", or births (app-side.md, open matter 7) | `unlock_bank` |
| Gate verbs | (disabled) | refuse: no bank | each verb's gating |
| `bank.lock()` | (no bank object) | does nothing | does nothing |
| `device.vacate()`, a user switch | ends the start; it writes nothing more | ends the bank | ends the bank |

What has to be working underneath for it: the Device; the deviceDB, read at the start (finding
nothing) and written at the first birth or unlock (`device_tok`, then the lease); the vaultDB's get
of the bank, its watch of the bank's row from the start on, **even while unborn**, or a bank born
in another tab goes unseen, and its puts; the key deriver, and the strength checker for
`build_bank`; the bank's QueryClient; and the box minders, started only once the bank is known
born. While it is unborn, the bank object answers none stored, and empty, itself.

## Facilities

Each one names what in `app-side.md` needs it, the layer it lives in, and a size (S, M, L).

### F1. The Device, once per process (core, M)

`Device.make({ keyDeriver, strengthChecker, logger, onBadNews, autolockMinutes, banks, keepOnDevice })`.
`banks` maps each banklabel to its options, its `vaultDB` first. The Device has the host functions,
the deviceDB handle, the open gating, the signed-in `userid`, each of the user's banks' snapshots,
and each bank object once it arrives. It has no QueryClient: each bank object has its own (F7). Its
snapshot carries each bank's whole snapshot (open matter 6):

```ts
interface DeviceSnapshot { userid: string | null, banks: Readonly<Record<string, BankSnapshot>>, openGating: Gating | null, probeErr: VaultError | null }
interface BankSnapshot   { stage: BankStage, isLocked: boolean, leaseEndsAt: number | null, lastErr: VaultError | null, lastSeen: BankStamp | null }
type BankStage = 'signed_out' | 'starting' | 'unborn' | 'ready' | 'failed'
```

A bank the Device has not heard of reads as a fixed `PendingBank`, with `isLocked: true` spelled
out: `isLocked` is true in the safe state, so a slice left out would read as unlocked.

* **Construction touches no browser API**, so module scope is safe during a server render.
  `checkSecureContext()` already passes on the server (it refuses only where `isSecureContext` is
  `false`); IndexedDB and `window` wait for `hello()`.
* **`hello()`** warms what it can before anyone signs in: it calls each host function's `probe`,
  opens the deviceDB, and hydrates any cached packets (F13) into memory. Nothing a user owns reaches
  a snapshot, and no lease attaches, until that user's `userid` arrives. Called twice, it does
  nothing more.
* **`switchUser(userid)`**, which the provider calls from a layout effect, ends the previous
  user's bank objects synchronously, before anything async (the "slam shut" rule), then starts each
  of the new user's banks. On null it ends them without forgetting anything. **`vacate()`** ends
  them and forgets what this browser cached for the user: deviceDB rows and packets.
* **One gating open at a time** across the Device's banks: one dialog at a time.
* **`subscribe(listener)`**, with no payload, called after any change; the Device builds its
  snapshot itself.

### F2. `probe` on the host functions (core, S)

A key deriver or strength checker backed by a library (Argon2 WASM, zxcvbn) is made
synchronously but usable only once that library has loaded. Each may have an optional `probe()`,
which loads the library and does a dummy operation: a strength check of a dummy passphrase, or a
derive at minimal cost, never at real cost. `device.hello()` calls each one present. A failure (a
CSP blocking WASM, a failed chunk fetch) goes to `onBadNews` and to `probeErr`, so the dialog can
say so before the user types. The passphrase field never waits on it: the meter shows
"checking…" until the checker is ready, and submit waits on the deriver as a pending action.

### F3. The bank object, arriving whole (instance layer, L)

`device.ensureBank(banklabel)` resolves the bank object for the signed-in user, starting it once:
it reads the deviceDB (`device_tok`, any cached lease), gets the bank's record from the bank's
vaultDB (or learns that none is stored), starts the watch of the bank's row, attaches a cached lease
that is still good, makes its own QueryClient, and, if the bank is born, starts its minders. Only
then does the object exist.
It stands for (user, banklabel), adopting each life's core `Bank`: a bank born, or born again after
a deletion elsewhere, is adopted, and the stage moves between `unborn` and `ready`. It ends at a
user switch or a vacate, for good: its minders say goodbye, and its QueryClient is cleared and let
go, everything it cached with it.

It carries the bank's acts (`withWhisper`, `withWhispers`, `putBox`, `putBoxOnce`, `delBox`,
`lock`, `ensureUnlocked`, the gate verbs), its minders (F5, F6) and its drafts (F10). Its state
reaches React as its slice of the Device's snapshot (F1), which the Device rebuilds when the bank
object tells it something changed.

A start that fails leaves the Device's stage `failed`, with the error. `ensureBank` may be called
again; whether to retry is the host's decision, outside the core.

### F4. The core says when state changes (core, S)

The bank object must hear when its core `Bank` locks or unlocks (a lease attached, evicted, or
past autolock), when a gating opens or concludes, and when a life ends. **Ask:** one
`subscribe(listener)` with no payload on the core's `Bank`, and a readable `leaseEndsAt` (epoch
milliseconds, not secret) for "locks in 4 minutes".

### F5. Records reach React: the minded record, and the bridge (cached and react, L)

**Two layers.** The minder keeps the ground truth in its bank's private client: each record as it
was last heard of, merged in a fixed order, kept current by the watch. The host's React Query
holds entries of its own, which the giver's hooks read and the bridge keeps current. Every option
a host gives (`structuralSharing`, `retry`, `select`, `staleTime`) applies in full, to the host's
entries alone. One shared client cannot do this: TanStack sets an observer's options on the entry
it observes (`queryObserver.ts:216`, `this.#currentQuery.setOptions(this.options)`), so a host's
`useQuery` on the minder's key would replace the minder's sharing function, its `retry` and its
`networkMode` for every reader.

**The minded record**, the minder's cache value, holds both the newest revision heard of and the
newest whole record of that revision's life. It is being built in a neighbouring session; this is
the shape this layer reads:

```ts
/** Cache value for a ThingRecord: the newest revision heard of (which might be sparse), and the newest whole record seen.
 * `null` when gone/void, `undefined` for "known to exist but nothing useable cached"
 */
type ThingCar<RecordT extends ThingRecord> = Readonly<
  | { liveness: 'full',   newest: RecordT,            whole: RecordT   } // the same record in both
  | { liveness: 'behind', newest: Sparse<RecordT>,    whole: RecordT   } // whole is older
  | { liveness: 'bare',   newest: Sparse<RecordT>,    whole: undefined } // never fetched whole
  | { liveness: 'gone',   newest: Tombstone<RecordT>, whole: null      } // a tombstone, sparse or whole
  | { liveness: 'void',   newest: VoidSentinel,       whole: null      } // none stored
>
// dbNewer: liveness is 'behind' or 'bare'
```

`newest` is the later of what is held and what arrives; `whole` is the later whole record of
`newest`'s life, so a box born again elsewhere is `bare`, never `behind`, and never shows its last
life's sidecar. Records arriving in any order come to the same value. `undefined` for never
fetched and `null` for no body follow the minder's present convention for `val`. A put needs no
`whole`: one that replaces whisper and sidecar both cites `newest`.

**The hooks' `data` is `whole`**, by a default `select: (minded) => minded.whole`: `undefined`
while pending, `null` for gone or none stored, else the record to show, its whisper sealed. A
`behind` record shows while the newer one is fetched. `select` is TanStack's own way to reshape
`data`, so React Query's tracking of which fields a component reads still holds; a result copied
with an added field would read every field, and re-render on every `isFetching` flip. A host's own
`select` receives the whole `Minded`, `newest` with it. `newest` is not on the result: the puts
(F12) read it from the minder.

**The bridge** runs while the provider is mounted, one listener per bank object, writing into the
host's client (`useQueryClient()`), only into entries a hook has made:

* `full`, `behind`, `gone`, `void`: the host's entry takes the `Minded`. On `behind`, the entry is
  also invalidated, so an active hook fetches the newer whole, and an idle one does not.
* `bare`, or nothing cached: the entry is invalidated, never given a value whose `data` is
  undefined after it has loaded.
* At the bank object's end: the host's entries under `['safebyok-react', userid, banklabel]` are
  removed. The host's client is not ours to clear, so only our prefix goes.

The hook's `queryFn` asks the minder, never the vaultDB: `await minder.get(ask, { staleTime: 0 })`,
then `minder.at(ask)`, the `Minded`. TanStack calls it only when the host's entry is stale by the
host's own `staleTime` (`Infinity` by default, since the bridge keeps the entry current), so the
minder reads afresh. A host's `retry` reaches `minder.get`, never a primitive.

**What this asks of the minder:** `at` and `listen` answer the `Minded`. Its sharing function, run
by its private client alone, merges by the rule above. The minder's keys may drop `userid` and
`banklabel`, which its client already stands for.

**One race**, a row for `notes/wontfix.md`, not a fix: a newer notice landing between the moment
the host's fetch resolves and the moment TanStack stores its result would leave the older
`Minded` in the host's entry. `minder.at` answers what the minder holds when it is called, and
TanStack stores the result in the same chain of microtasks, which a watch notice, a task of its
own, cannot interrupt; so the window is closed in practice.

**A customer's own view** (sidecar and whisper merged, say) is the customer's choice to make. It is
a query of its own, under the box's key, `[...boxKey, 'view', viewlabel]`, whose `queryFn` runs the
host's async `viewOf(minded, bank)`. The bridge invalidates everything under the box's key, so the
view refetches, and TanStack's refetch cancels the one it replaces: the latest wins without a
guard of ours. A view that unseals throws while the bank is locked, and the host decides how that
looks (open matter 10).

### F6. A listing by listpath, structurally shared (cached, M)

`useBoxList(listpath)` needs the labelpaths under a listpath, in tree order, as an array that keeps
its identity until an entry comes or goes. **Ask:** the listing becomes a cache entry of its own
(its key: the listpath's, plus a final `'list'`), whose value is the array of labelpaths, kept
stable by `replaceEqualDeep`. A notice of a box born or tombstoned under it updates it. The bridge
carries it to the host's entry as it does a box (F5). Each row is then its own `useBox`, so a
memoized row redraws only for its own box. What a row shows before its box is fetched whole is
open: a sparse record has no sidecar.

### F7. A QueryClient per bank, and React Query the host's (cached and react, S)

Each bank object makes a private `QueryClient` and clears it at its end: dropping the bank drops
everything it cached, and `goodbye` no longer sets empty defaults over its own (TanStack cannot
remove a key's defaults). No host sees the minder's client, so `@tanstack/query-core` stays a plain
dependency of the core: its version never has to match the host's React Query, and no error crosses
from one copy to another (the minder turns its `CancelledError` into a refusal of its own).

`safebyok-react` builds on `@tanstack/react-query`, a peer dependency, through the host's own
`QueryClientProvider`: its Suspense, error-boundary and render-time handling is the hard part of a
record hook, and it is done (PROCESS.md, *Dependencies*; open matter 9). Devtools, `dehydrate`, a
persister and `invalidateQueries()` all reach the host's entries, which hold sealed records: no
cleartext, unless the host's own view puts it there.

### F8. Snapshots, sliced and frozen (instance layer, M)

`DeviceSnapshot` and `BankSnapshot` (F1), and:

```ts
interface DraftSnapshot   { isReady: boolean, isEditing: boolean, isPutting: boolean, isDirty: boolean, isBehind: boolean, lastErr: VaultError | null }
```

Frozen, the same object until something changes, nothing a host has no use for (STYLE.md,
*Stateful objects and snapshots*). Every tab-state hook has a `getServerSnapshot`, answering
`signed_out`, for server rendering. A record hook's answer is React Query's result (F5), not a
snapshot of ours; a `Minded` and its records are frozen plain objects, never instances, since
`replaceEqualDeep` shares only plain objects and arrays (`utils.ts:398`), and `dehydrate` and
Server Component props want them plain too.

### F9. withWhisper, with one shared unlock (instance layer and core, M)

```text
bank.withWhisper(labelpath, fn)
  ensureUnlocked()          may open an unlock_bank gating; GatingDialogs answers it
  minder.get(ask)           the whole record, cached if timely
  bank.unsealBox(record)    the whisper, under the lease
  fn(whisper)               the bank object lets go of the whisper once fn settles
```

**Ask of the core:** a second `ensureUnlocked` while an `unlock_bank` gating is open waits on that
gating (`whenConcluded`), instead of refusing. In React, several components fire calls at once (two
queries on mount, a mutation and a refetch), and refusing each but the first is a refusal only the
timing caused. A gating of another kind open at that moment still refuses. This changes a present
guarantee, narrowly, and wants a Coach's yes. `withWhispers(listpath, fn)` is the same over a
listing: one unlock, then every box unsealed.

### F10. Drafts (instance layer, L)

What `useWhisperDraft` and `WhisperInput` stand on. A draft is the bank object's, one per
labelpath, shared by every hook that asks for it, and counted by the hooks subscribed to it. Until
the bank object arrives, the hook answers `isReady: false` and has nothing to act on.

* **`begin()`** ensures the bank is unlocked, gets and unseals the box (or starts empty for a new
  one), keeps the record it began from as `base`, and fills each registered input.
* **Inputs register by ref callback.** `WhisperInput` passes a stable ref callback, and React 19's
  ref cleanup unregisters it. The draft writes field values into the inputs and reads them back at
  `put()`. `isDirty` comes from the inputs' `input` events, counted in the draft, never from React
  state. This is today's `BoxFields.bind`, kept.
* **`isBehind`** turns true when the minder delivers a record newer than `base`.
* **`put()`** seals the inputs' values and calls `putBoxOnce`, citing `base`, so a newer record
  refuses and the draft shows `isBehind`. `put({ citing: 'latest' })` cites the newer record
  instead: "Keep mine". `rebase()` makes the newer record the base and refills the inputs.
* **The acts never reject.** Each resolves an `Outcome` and sets `lastErr`. A promise rejected in
  an `onClick` is an unhandled rejection in every React app, and the snapshot is where the UI looks
  anyway.
* **Lifetime.** A draft ends at `put`, at `discard`, at `lock()`, at the bank object's end, and
  when its last hook unmounts. StrictMode unmounts and remounts every component once in
  development, so the last of these waits one microtask for a remount. Ending clears the inputs and
  drops the values.

### F11. Where a whisper may be (instance layer, M)

The bank object has cleartext in exactly four places: an open draft, a mounted `WhisperText`, a
`withWhisper` callback while it runs, and a revisor while it runs (F12). `lock()`, a user switch
and `vacate()` end every draft and blank every `WhisperText` synchronously, before anything async.
Nothing reaches a hook's return value, a TanStack cache, a snapshot, a packet or a log, unless a
host's own view (F5) puts it there, which is the host's choice to make. This
replaces today's exposure (`expose`, `unexpose`, `BoxExposure`) with a smaller rule that a reviewer
can check by reading four call sites. `notes/security.md` gets an entry once it is built.

### F12. The orchestrating puts (instance layer, M)

`putBoxOnce` is the single try: it seals and puts, citing the record it expects, and refuses on a
conflict. `putBox(proposed, revisor?, { retry })` and `putBoxRecord` orchestrate it. On a conflict,
`putBox` gets the box again, unseals it, and calls `revisor(stored, proposed)` for the next box to
propose, then tries once more, up to `retry` times: a merge (`merge` is a revisor as it stands), or
an "atomic" increment. The default revisor keeps `proposed`. `stored` is a fresh unsealed copy at
each attempt, so a revisor that writes into it (as `merge` does) harms nothing. For an absent box it
is the empty shell, `{ whisper: {}, sidecar: {}, revtok: null }`, never null. The retry lives here,
outside the primitive's path. `putBoxRecord` is the same over a record the caller has sealed.
The puts read what they cite from the minder, never from a hook's answer: a put replacing whisper
and sidecar cites the `Minded`'s `newest`, which needs no whole record, and the revisor gets the
stored whole.

### F13. The packet: per-user cache, read synchronously (instance layer, M)

**First, and most of the gain: the bank's stamp**, cached per user, `userid → { banktok,
lifepath, revtok, revseq }`. It is public metadata, which the server has, and `hello()` reads it
synchronously. With it, before any network call:

* **Which screen to show.** The Device's snapshot carries it while the bank is `starting`, as
  `lastSeen: BankStamp | null`, and a host shows the unlock screen at once where it is non-null.
* **What starts in parallel**, needing no wayin: the watch of the bank's row, the box listing,
  and the deviceDB's read of the cached lease, none waiting on the bank's get.
* **What it rejects early**: a cached lease from another life of the bank is forgotten at once.

Two rules (proposed):

1. **The stamp never attaches a lease.** A passphrase replaced elsewhere, say because this device
   was stolen, must make it prove again; attaching on the cached stamp would leave it unlocked
   until the fetch arrives. The stamp may only reject a lease early. Attaching waits for the
   fetched gate.
2. **No entry means unknown, never unborn.** A browser that has never seen the user fetches before
   it shows Create.

**What is kept is the host's choice**, through `Device.make({ keepOnDevice })`, named in the
customer's words for what the browser keeps, not the pieces. Knowing what it may keep, the Device
also knows what to fetch ahead: under `offline_signins`, the wayins at each start. The docs say what
each gives away:

| `keepOnDevice` | What it keeps | What it gives away | What it buys |
|---|---|---|---|
| `nothing` | nothing | nothing | nothing: each load fetches before its first screen |
| `past_userids` | each user's stamp (so far the gate's), and each wayin but its wrapped bankKey | who has used this browser, to whoever uses it next; nothing the server lacks | the first screen and the passkey button at once, the parallel starts above, a list of past users to pick from |
| `offline_signins` | the wayins whole | the bankKey wrapped under the passphrase: this device becomes a second place to steal it for offline guessing | unlocking offline |
| `unlocked` | the lease | the bank, to whoever uses this browser before autolock | skipping the passphrase until autolock |

Whether these are one level or a set, and the default, are open (open matter 4). Where the lease is cached, its leaseKey is stored in
IndexedDB as a non-extractable `CryptoKey`, which script on the page can use while it runs but never
carry off as bytes; localStorage cannot hold one.

**Tabs.** IndexedDB is one database per origin, shared by every tab: a committed write is seen by
the next transaction in any tab, but no tab is told of it. After each write that another tab should
act on (a lease cached or forgotten, a vacate), the writer posts a notice on a `BroadcastChannel`,
and the other tabs read again. No worker is needed: a SharedWorker is missing on Chrome for
Android, and Web Locks would elect one tab only if one tab should ever hold the watch for all.

**Later, the rest:** so that a returning user's first render shows its boxes' sidecars at once.
After each change, the bank object dehydrates its entries with TanStack's
`dehydrate`, and writes them, with `device_tok`, the bank's stamp, the main gate's wayin headers
and a lease hint ("a cached lease exists, good until T"), to localStorage under the user and the
banklabel. `hello()` and `ensureBank` read it back with `hydrate`, synchronously.

* **Never in it:** a lease, a key, a whisper. Unlocking stays async whatever it says, as the
  bankKey's unwrap is an async WebCrypto call; the lease hint is what lets the UI say "Unlocking…"
  instead of flashing an Unlock button.
* **It is a cache.** Hydrated entries count as stale, and the start and the watch correct them.
* **Constraints.** localStorage is synchronous, text only, about 5 MB per origin, shared by tabs,
  readable by any script on the origin, deleted by Safari after seven days without interaction, and
  absent on the server; its access can throw (a sandboxed iframe, blocked site data). Every read
  goes in a `try`, a large listing is capped, and `vacate()` removes the user's packets.

### F14. Stable promises for Suspense (instance layer, M, after 1.0)

`useSuspenseBank` suspends on `device.ensureBank(banklabel)`, which must hand out the same
promise per (user, banklabel) until it settles. `useSuspenseBox` suspends on that first, then is
React Query's `useSuspenseQuery` over the same options as `useBox`, which keeps its own promises
stable. On the server, a suspending hook throws, so the nearest Suspense boundary streams its
fallback and the client takes over.

## How a hook is built

The giver is bound to a Device, not read from context: bank labels typecheck against
`Device.make`'s `banks`, several standalone Devices need no nested providers, and a test binds a
fake Device. A host names its bank givers in PascalCase (`Acme`), since eslint-plugin-react-hooks
checks `Acme.useBox()` as a hook only on a PascalCase object.

```ts
'use client'
import { skipToken, useQuery, useQueryClient, type QueryClient, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query'
import { useEffect, useSyncExternalStore } from 'react'

/** TanStack's own options for a box hook, less the key and the fetch, which are the giver's. */
export type BoxHookOpts<SelT> = Omit<UseQueryOptions<Minded<BoxThing>, VaultError, SelT>, 'queryKey' | 'queryFn' | 'enabled'>

/** What a bank's hooks report before the Device has heard of the bank. */
const PendingBank: BankSnapshot = Object.freeze({ stage: 'signed_out', isLocked: true, leaseEndsAt: null, lastErr: null, lastSeen: null })

/** Hooks bound to `device`: bank labels typecheck against those it was made with. Make it once, at module scope. */
export function reactGiver<BanklabelT extends string>(device: Device<BanklabelT>) {
  return Object.freeze({ bank: (banklabel: BanklabelT) => bankGiverOf(device, banklabel) })
}

function stageOf(snap: BankSnapshot): BankStage { return snap.stage }
function wholeOf(minded: Minded<BoxThing>): BoxThing | null | undefined { return minded.whole }

function bankGiverOf<BanklabelT extends string>(device: Device<BanklabelT>, banklabel: BanklabelT) {
  function snapshotOf(): BankSnapshot       { return device.getSnapshot().banks[banklabel] ?? PendingBank }
  function serverSnapshotOf(): BankSnapshot { return device.getServerSnapshot().banks[banklabel] ?? PendingBank }

  /** This tab's state of the bank: its stage, whether it is locked, when its lease ends. Synchronous, and never suspends.
   * With `select`, re-renders only when the selected value changes; it must return a field of the snapshot or a primitive, never a new object.
   */
  function useBank(): BankSnapshot
  function useBank<SelT>(select: (snap: BankSnapshot) => SelT): SelT
  function useBank<SelT>(select?: (snap: BankSnapshot) => SelT): BankSnapshot | SelT {
    const pick = select ?? ((snap: BankSnapshot) => snap)
    return useSyncExternalStore(device.subscribe, () => pick(snapshotOf()), () => pick(serverSnapshotOf()))
  }

  /** The box at `labelpath`, through React Query: `data` is the record to show, its whisper sealed; null for none stored; undefined while pending.
   * A `select` of the host's receives the whole `Minded`, the newest revision heard of with it.
   */
  function useBox<SelT = BoxThing | null | undefined>(labelpath: string, opts: BoxHookOpts<SelT> = {}): UseQueryResult<SelT, VaultError> {
    const userid = useSyncExternalStore(device.subscribe, () => device.getSnapshot().userid, () => null)
    // Read so that the hook re-renders when the bank arrives or starts a new life: that render hands
    // TanStack the new queryFn.
    const stage  = useBank(stageOf)
    const bank   = (stage === 'ready') ? device.bankAt(banklabel) : null
    const ask    = { labelpath }
    return useQuery({
      staleTime: Infinity,
      select:    wholeOf as (minded: Minded<BoxThing>) => SelT,
      ...opts,
      queryKey:  ['safebyok-react', userid, banklabel, labelpath],
      queryFn:   bank ? async () => { await bank.boxes.get(ask, { staleTime: 0 }); return bank.boxes.at(ask) } : skipToken,
    })
  }

  return Object.freeze({ useBank, useBox })
}

/** Keep the host's entries current with each bank's minders, while mounted. The provider calls it. */
export function useBridge(device: Device): void {
  const client = useQueryClient()
  useEffect(() => device.onBankObject((bank) => bridgeBank(client, bank)), [client, device])
}

function bridgeBank(client: QueryClient, bank: BankObject): () => void {
  const prefix = ['safebyok-react', bank.userid, bank.banklabel]
  const unlisten = bank.boxes.listen((answer) => {
    const queryKey = [...prefix, answer.ask.labelpath]
    if (! client.getQueryCache().find({ queryKey, exact: true })) { return }
    const minded = bank.boxes.at(answer.ask)
    if ((minded === undefined) || (minded.mindedkind === 'bare')) {
      void client.invalidateQueries({ queryKey })
      return
    }
    client.setQueryData(queryKey, minded)
    // A newer whole, and any view of the host's, refetch only where a hook watches them.
    if (minded.mindedkind === 'behind') { void client.invalidateQueries({ queryKey, exact: true }) }
    void client.invalidateQueries({ queryKey: [...queryKey, 'view'] })
  })
  return () => { unlisten(); client.removeQueries({ queryKey: prefix }) }
}
```

Before the bank object arrives, `skipToken` holds the fetch, and any entry already in hand shows;
when it arrives, the same observer takes the new `queryFn`. A host uses it as:

```ts
export const Sb   = reactGiver(device)
export const Acme = Sb.bank('acme')

const { isLocked } = Acme.useBank()
const ends         = Acme.useBank((b) => b.leaseEndsAt)
const { data: box, isFetching } = Acme.useBox('openai')
const { data: mask } = Acme.useBox('openai', { select: (minded) => minded.whole?.sidecar.mask })
```

## The order to build in

1. **F1, F2, F3, F4:** the Device, `probe`, the bank object, and `useBank`, `GatingDialogs` and
   `LockButton` on them. The gating dialogs move over almost as they are.
2. **F5, F7, F8, F9:** the minded record (in the neighbouring session), the bank's QueryClient,
   the bridge, `useBox` and `withWhisper`. The API-key use case then works end to end, with
   `ApiKeyField` on `putBoxOnce`.
3. **F12:** `putBox` with `retry` and a revisor; `ApiKeyField` moves onto it.
4. **F10, F11:** drafts, `WhisperInput`, `WhisperText`.
5. **F6:** `useBoxList`, `BoxTree`, `WhisperForm`: the doppler-lite. Waits on nesting.
6. **F13, F14:** the rest of the packet, and the Suspense variants. The packet's first part, the
   bank's cached stamp, can come with step 1.

Steps 1 to 4 need one gate verb and no nesting, so they can start on today's new core. The
adapters and the demo move off `safebyok-big` as their pieces land.

## Open matters

| # | Matter | My recommendation |
|---|---|---|
| 1 | F9: may a second `ensureUnlocked` wait on the open unlock gating instead of refusing? | Yes, for `unlock_bank` alone |
| 2 | F3: does one bank object stand for (user, banklabel) through the bank's lives, adopting each, or end with a life? | Through its lives, so a bank deleted and born again elsewhere does not unmount the host's UI |
| 3 | F1: are a bank's options given only at `Device.make`, or may `ensureBank` take a banklabel it has not seen, with its options? | Both: `banks` at make, for `hello()` to warm, and `ensureBank(banklabel, opts)` for a bank found later |
| 4 | F13: is `keepOnDevice` one level, each keeping what the ones before it keep, or a set? And its default? | A set: `offline_signins` and `unlocked` each imply `past_userids`, but not each other. Their risks differ in kind (a passphrase open to offline guessing for good, against the bank open until autolock), and each without the other is a product people ship: today's leases without cached wayins, and a manager that unlocks offline but locks on close. Default `['past_userids', 'unlocked']`, today's behaviour |
| 5 | F13: does locking or unlocking one tab reach every tab? | Both, by `BroadcastChannel`: unlock once and every tab unlocks (each attaching only against the fetched gate); lock once and every tab locks. **Settled**: *I'd like it to* |
| 6 | F1: does each bank's snapshot live inside the Device's, as one store? | Yes: `useBank` is then one `useSyncExternalStore`, before the bank object arrives and after. With two stores it would switch its `subscribe` mid-life |
| 7 | F5: what does `useBox` answer on an unborn bank? | `data: null`, none stored, at once, not pending until a birth: the bank object knows no box can exist |
| 8 | F5: the race between the host's fetch and a newer notice | A row in `notes/wontfix.md`, not a fix, when the bridge is built. **Settled**: *wontfix* |
| 9 | F7: `@tanstack/react-query` as a peer dependency of `safebyok-react` | Yes: its Suspense and error-boundary handling is the hard part of a record hook (PROCESS.md, *Dependencies*). **Settled**: *yes!* |
| 10 | F5: a customer's own view, under `[...boxKey, 'view', viewlabel]` | Offer it as an option of `useBox` (`view: { viewlabel, viewOf }`) after 1.0; until then a host writes the `useQuery` itself over `Acme.boxQuery(labelpath)`. **Settled**: deferred past 1.0 |
