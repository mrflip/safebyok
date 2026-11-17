# react_backwards: the internals

What has to exist under `app-side.md`'s hooks, parts and kit, layer by layer, and what each layer
owes the one above. Status: a proposal for discussion, 2026-11-16, rewritten the same day around
one Device per process. The core's interface serves this layer: where a facility asks the core
for something, the ask is the point, not the spelling.

## The layers

```text
safebyok-react      hooks (one useSyncExternalStore each) · parts · kit
      │               subscribe / getSnapshot · acts on live objects
Device              one per process (per tab): host functions · deviceDB · QueryClient · the open
      │             gating · the user · each bank's stage, then its bank object
bank object         one per (user, banklabel), arriving whole after its start: its vaultDB · minders ·
      │             observers · drafts · the lease · where a whisper may be
safebyok/cached     ThingMinder (TanStack)                 stored Things: records, listings
safebyok/core       Bank (one life) · Gate · Gating · Lease · sealers
safebyok/storage    VaultDB                                 one per bank, the host's choice
```

Two kinds of state, each with its own tool:

* **Stored Things** (records, listings) come through the ThingMinder, which keeps them in the
  Device's TanStack cache. That is server state, the job TanStack was built for.
* **This tab's state** (who is signed in, each bank's stage, locked or unlocked, the lease's end,
  the open gating) is never stored, so no cache can know it. The Device and each bank object say
  when it changes, and build their snapshots.

`safebyok-react` stays thin: a hook is a `useSyncExternalStore` on the Device or a bank object,
and a part is a ref callback into a draft. Everything that has to be right for security (whisper
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

A hook reads the Device's snapshot until its bank object arrives, then the bank object's. A
button whose act needs the bank object is disabled until then.

### A user this browser has never seen

The case a design must get right first: `userid` is known, the browser has nothing for the user
(never seen, or vacated, which is the same), and either no bank is stored anywhere (a new user) or
one is (a returning user on a new browser, with no lease here).

| Facility | While the bank is starting | New user (no bank) | Returning user (bank stored) |
|---|---|---|---|
| `useBank` | Device: `starting`, no bank object | `unborn`, a bank object | `ready`, locked, a bank object |
| `useBox`, `useBoxList` | Device: `pending` | `absent`, empty: real answers | `pending`, then the records |
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
`build_bank`; the QueryClient; and the box minders, started only once the bank is known born. While
it is unborn, the bank object answers `absent` and empty itself.

## Facilities

Each one names what in `app-side.md` needs it, the layer it lives in, and a size (S, M, L).

### F1. The Device, once per process (core, M)

`Device.make({ keyDeriver, strengthChecker, logger, onBadNews, autolockMinutes, banks, queryClient? })`.
`banks` maps each banklabel to its options, its `vaultDB` first. The Device has the host functions,
the deviceDB handle, the QueryClient, the open gating, the signed-in `userid`, and for each of the
user's banks either its stage or its bank object. Its snapshot:

```ts
interface DeviceSnapshot { userid: string | null, banks: Readonly<Record<string, { stage: BankStage, lastSeen: BankStamp | null }>>, openGating: Gating | null, probeErr: VaultError | null }
type BankStage = 'signed_out' | 'starting' | 'unborn' | 'ready' | 'failed'
```

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
that is still good, and, if the bank is born, starts its minders. Only then does the object exist.
It stands for (user, banklabel), adopting each life's core `Bank`: a bank born, or born again after
a deletion elsewhere, is adopted, and the stage moves between `unborn` and `ready`. It ends at a
user switch or a vacate, for good.

It carries the bank's acts (`withWhisper`, `withWhispers`, `putBox`, `putBoxOnce`, `delBox`,
`lock`, `ensureUnlocked`, the gate verbs), its observers (F5, F6), its drafts (F10), and its own
`subscribe` / `getSnapshot`:

```ts
interface BankSnapshot { stage: 'unborn' | 'ready' | 'failed', isLocked: boolean, leaseEndsAt: number | null, lastErr: VaultError | null }
```

A start that fails leaves the Device's stage `failed`, with the error. `ensureBank` may be called
again; whether to retry is the host's decision, outside the core.

### F4. The core says when state changes (core, S)

The bank object must hear when its core `Bank` locks or unlocks (a lease attached, evicted, or
past autolock), when a gating opens or concludes, and when a life ends. **Ask:** one
`subscribe(listener)` with no payload on the core's `Bank`, and a readable `leaseEndsAt` (epoch
milliseconds, not secret) for "locks in 4 minutes".

### F5. One observer per scope, with stable answers (cached, M)

`useBox(labelpath)` needs a snapshot that keeps its identity until something changes, and to hear
when its record goes stale with time, which no cache event marks. **Ask:** the ThingMinder grows
`observe(ask)`, returning `{ subscribe, getSnapshot }`, built on TanStack's `QueryObserver`, the
feature built for exactly this. Its result keeps its identity until something changes, it runs the
stale timer, and with `refetchOnMount` it fetches a stale or vacant record when the first listener
arrives. Its answer carries the cached record beside `isTimely`, so a box keeps showing its sidecar
while it refreshes; `tryAt` keeps its present contract. `refetchOnWindowFocus` is fixed off, like
`retry`: the watch keeps records fresh.

### F6. A listing by listpath, structurally shared (cached, M)

`useBoxList(listpath)` needs the labelpaths under a listpath, in tree order, as an array that keeps
its identity until an entry comes or goes. **Ask:** the listing becomes a cache entry of its own
(its key: the listpath's, plus a final `'list'`), whose value is the array of labelpaths, kept
stable by `replaceEqualDeep`. A notice of a box born or tombstoned under it updates it. Each row is
then its own `useBox`, so a memoized row redraws only for its own box.

### F7. One QueryClient per Device, and query-core as a peer dependency (cached, S)

The Device makes a private `QueryClient` unless handed one. The keys already carry the user and the
bank, so one client serves every bank; a bank's `goodbye` removes its entries. A host that hands
over its own gets devtools, and the caveats too: `queryClient.clear()` at logout empties our
entries, `invalidateQueries()` with no filter reaches them, and a persister writes them to storage.
Our entries are ciphertext only, so this is tolerable, and the docs say so. `@tanstack/query-core`
moves to `peerDependencies`, so that a host's client and ours come from one copy: otherwise
`instanceof TSQ.CancelledError` fails and `notifyManager.batch` batches nothing.

### F8. Snapshots, sliced and frozen (instance layer, M)

`DeviceSnapshot` (F1), `BankSnapshot` (F3), and:

```ts
interface BoxSnapshot     { stage: 'pending' | 'absent' | 'present', labelpath: string, sidecar: Sidecar | null, revtok: string | null, written_at: number | null, isRefreshing: boolean, lastErr: VaultError | null }
interface BoxListSnapshot { stage: 'pending' | 'present', boxes: readonly BoxListEntry[], isRefreshing: boolean, lastErr: VaultError | null }
interface DraftSnapshot   { isReady: boolean, isEditing: boolean, isPutting: boolean, isDirty: boolean, isBehind: boolean, lastErr: VaultError | null }
```

Frozen, the same object until something changes, nothing a host has no use for (STYLE.md,
*Stateful objects and snapshots*). A tombstoned box is `absent` to the host. Every hook has a
`getServerSnapshot`, answering `signed_out` or `pending`, for server rendering.

### F9. withWhisper, with one shared unlock (instance layer and core, M)

```text
bank.withWhisper(labelpath, fn)
  ensureUnlocked()          may open an unlock_bank gating; GatingDialogs answers it
  minder.get(ask)           the record, cached if timely
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
Nothing reaches a hook's return value, a TanStack cache, a snapshot, a packet or a log. This
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
promise per (user, banklabel) until it settles. `useSuspenseBox` needs the same promise for the same
scope and revision on every render, for React 19's `use()`: the observer (F5) has
`QueryObserver.fetchOptimistic`, and a small per-scope cache of thenables in the bank object does
the rest.

## How a hook is built

```ts
/** The snapshot of the box at `labelpath`, kept fresh. */
export function useBox(labelpath: string, opts: { banklabel?: string } = {}): BoxSnapshot {
  const [bankSnap, bank] = useBank(opts.banklabel)
  const observed = useMemo(() => bank?.observeBox(labelpath) ?? pendingBoxOf(labelpath, bankSnap.stage), [bank, labelpath, bankSnap.stage])
  return useSyncExternalStore(observed.subscribe, observed.getSnapshot, observed.getServerSnapshot)
}
```

Until the bank object arrives, `pendingBoxOf` gives a fixed observable answering `pending` (or
`absent` for an unborn bank). `observeBox` returns the same `{ subscribe, getSnapshot }` for the
same labelpath while anyone subscribes. Every other hook has this shape.

## The order to build in

1. **F1, F2, F3, F4:** the Device, `probe`, the bank object, and `useBank`, `GatingDialogs` and
   `LockButton` on them. The gating dialogs move over almost as they are.
2. **F5, F7, F8, F9:** `useBox` and `withWhisper`. The API-key use case then works end to end, with
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
