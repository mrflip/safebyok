# react_backwards: the internals

What has to exist under `app-side.md`'s hooks, parts and kit, layer by layer, and what each layer
owes the one above. Status: a proposal for discussion, 2026-11-16, rewritten the same day around
one Device per process, and on 2026-11-17 around two layers of query cache: a private client per
bank, which the minders keep, and the host's own React Query, which the giver's hooks read. The
first version of the giver and the bridge is in `packages/safebyok-react/src/giver/`. The core's interface serves this layer: where a facility asks the core
for something, the ask is the point, not the spelling.

## The layers

```text
safebyok-react      the giver: hooks · parts · kit · the bridge
      │               tab state: useSyncExternalStore on the Device
      │               records: the host's React Query, fed by the bridge from the minders
Device              one per process (per tab): host functions · deviceDB · the open gating ·
      │             the user · each bank's snapshot, then its bank object
bank object         one per life of (user, banklabel), arriving whole after its start: its vaultDB ·
      │             its own QueryClient · minders · drafts · the lease · where a whisper may be
safebyok/cached     ThingMinder (query-core)               stored Things, as cars
safebyok/core       Bank (one life) · Gate · Gating · Lease · sealers
safebyok/storage    VaultDB                                 one per bank, the host's choice
```

Two kinds of state, each with its own tool:

* **Stored Things** (records, listings) come through the ThingMinder, which keeps them as cars in
  its bank's private TanStack cache. That is server state, the job TanStack was built for. The
  host's React Query shows them, in entries of its own that the bridge keeps current (F5).
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
tab-state hook never changes what it subscribes to. A record hook's fetch waits on `ensureBank`, and
shows any entry already in hand meanwhile. A button whose act needs the bank object is disabled
until it arrives.

### A user this browser has never seen

The case a design must get right first: `userid` is known, the browser has nothing for the user
(never seen, or vacated, which is the same), and either no bank is stored anywhere (a new user) or
one is (a returning user on a new browser, with no lease here).

| Facility | While the bank is starting | New user (no bank) | Returning user (bank stored) |
|---|---|---|---|
| `useBank` | Device: `starting`, no bank object | `unborn`, a bank object | `ready`, locked, a bank object |
| `useBoxRecord`, `useBoxList` | `isPending`, the fetch waiting on the bank object | `data: null`, empty: real answers (open matter 7) | `isPending`, then the records |
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
born. While it is unborn, the bank object answers the void car, and an empty listing, itself.

## From userid to first dialog

**No dialog at sign-in, ever.** safebyok is enabling technology, there for the moment an API call is
made. The first dialog appears when a call needs a whisper (unlock), or when the first save needs a
bank (create). Everything a round trip can learn arrives long before a person could finish a dialog
(`notes/reference-timings.md`, *User Experience Timings*): a round trip is 50 to 300 ms, typing a
passphrase 5,000 to 30,000. So a dialog never waits on the network to appear, and none appears
because data is loading. After an unlock, the call that asked for it goes on by itself.

Two changes from safebyok-big:

* **Starting a bank never births it.** Big's `Device.ensureBank` launches `build_bank` when no bank
  is stored (`Bank.launchBirth`), and its provider calls it at mount, so a new user is asked to
  invent a passphrase before doing anything. Here birth waits for the first save, where making the
  passphrase is a step of saving ("Protect your keys with a passphrase"). A read with no box stored
  never births: it answers "Add your OpenAI key first".
* **The unlock dialog shows from the cache, and the gate is fetched beside it.** Big's
  `Bank.ensureUnlocked` waits on `maingate.ensureTimely` before the cached lease and before the
  dialog: 200 ms online, a failure offline. Here the dialog shows at once from the kept wayin
  headers, and by the time the user submits, the fresh gate is almost always in hand. With it, the
  unlock is against the fresh gate, so a passphrase replaced elsewhere is honoured; without it,
  offline, against the kept wayin, the risk `offline_signins` declares. A kept lease still attaches
  only against the fetched gate (F13, rule 1).

When a userid arrives, with `keepOnDevice: 'offline_signins'`:

| State | First dialog | What waits for a round trip | What shows meanwhile |
|---|---|---|---|
| This bank kept, its lease good | None | Attaching the lease, once the gate fetch confirms it | The app, locked for about 200 ms; a call made then waits that long |
| This bank kept, no lease | Unlock, when a call needs a whisper, at once from the kept headers: the passkey button or the passphrase field already known | The fresh gate, fetched while the user types; submit uses it if it has arrived, else the kept wayin | The app, locked; the lock indicator says so from the first frame |
| Nothing on the machine for this user | None until the round trip says which: unlock on demand if stored, create at the first save if not | Whether any bank is stored: no entry means unknown, never unborn | The app; the lock indicator neutral, never "Create" or "Unlock" until known; a click in that window shows a pending button, then the right dialog |
| Another bank kept for this user, not this one | As for nothing on the machine | As for nothing on the machine | As for nothing on the machine. The other bank says only that the user has been here (the account list `userids` keeps) |

With or without a kept listing of five sparse boxes (a sparse record has its labelpath, revision
and `written_at`, and no sidecar):

| | Listing kept | No listing kept |
|---|---|---|
| First frame | Five rows with their labels and "updated 3 days ago"; the masks are placeholders | The app's shell; the box area a placeholder |
| "Is there an OpenAI key?" | Answered at once: Ask is ready | Unknown for one round trip; Ask stays clickable, and a click waits on the record |
| After one round trip | The listing confirmed; the whole records of the rows on screen arrive in parallel, and the masks fill in | The listing arrives and the rows appear; the masks after a second round trip, or with the first if the list returns whole records |
| The unlock dialog, if a call needs it | From the kept wayins either way | From the kept wayins either way |

**`offline_signins` is hollow without the boxes' whole records.** An unlock offline yields the
bankKey, but with no box ciphertext on the device there is nothing to unseal. So `offline_signins`
keeps the cars whole, ciphertext and sidecars, which the server holds anyway; its listing is not
sparse, and the first frame has the masks too. A sparse listing suits `userids` (open matter 12).

At sign-in, in parallel and in about one round trip, none of it a dialog: the gate fetch, the bank
row's watch, the listing, the whole records of the boxes the page's hooks show, and the deviceDB's
read of the lease. None of it needs a passphrase.

## Facilities

Each one names what in `app-side.md` needs it, the layer it lives in, and a size (S, M, L).

### F1. The Device, once per process (core, M)

`Device.make({ keyDeriver, strengthChecker, logger, onBadNews, banks, keepOnDevice, autolock })`.
`banks` maps each banklabel to its options, its `vaultDB` first. The Device's options are the
defaults for its banks, and `Bank.make` may override them; once made, neither the Device's copy nor
a bank's own changes, so a bank on another vaultDB is a bank made anew (open matter 3). The Device
has the host functions, the deviceDB handle, the open gating, the signed-in `userid`, each of the
user's banks' snapshots, and each bank object while it runs. It has no QueryClient: each bank
object has its own (F7). Its snapshot carries each bank's whole snapshot, a handful of small fields,
no records (open matter 6):

```ts
interface DeviceSnapshot { userid: string | null, banks: Readonly<Record<string, BankSnapshot>>, openGating: Gating | null, probeErr: VaultError | null }
interface BankSnapshot   { stage: BankStage, isLocked: boolean, leaseEndsAt: number | null, lastErr: VaultError | null, lastSeen: BankStamp | null }
type BankStage = 'signed_out' | 'starting' | 'unborn' | 'ready' | 'failed'
```

Its parts come from two places. What is stored (born, unborn or gone, and the stamp) the Device
learns by observing the bank's record through a minder. What is this tab's alone (`isLocked` and
`leaseEndsAt`, since a lease is never in the bank's record; `starting`, `failed` and `lastErr`, from
the start) the bank object tells it (F4). A bank the Device has not heard of reads as a fixed
`PendingBank`, with `isLocked: true` spelled out: `isLocked` is true in the safe state, so a slice
left out would read as unlocked.

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
then does the object exist. **It ends with its life** (open matter 2): a bank deleted elsewhere, or
born where it was unborn, ends this bank object, and the next `ensureBank` makes the one for the new
life. It ends too at a user switch or a vacate. Ending, its minders say goodbye and its QueryClient
is cleared and let go, everything it cached with it; the bridge resets the host's entries of the
bank, so a hook still showing one fetches again from the next bank object (F5). The bank's slice of
the Device's snapshot outlives it, so `useBankSnapshot` never unmounts anything.

It carries the bank's acts (`withWhisper`, `withWhispers`, `putBox`, `putBoxOnce`, `delBox`,
`lock`, `ensureUnlocked`, the gate verbs), its minders (F5, F6) and its drafts (F10). Its state
reaches React as its slice of the Device's snapshot (F1).

A start that fails leaves the Device's stage `failed`, with the error. `ensureBank` may be called
again; whether to retry is the host's decision, outside the core.

### F4. The core says when state changes (core, S)

The bank object must hear when its core `Bank` locks or unlocks (a lease attached, evicted, or
past autolock), when a gating opens or concludes, and when a life ends. **Ask:** one
`subscribe(listener)` with no payload on the core's `Bank`, and a readable `leaseEndsAt` (epoch
milliseconds, not secret) for "locks in 4 minutes".

### F5. Records reach React: the car, and the bridge (cached and react, L)

**Two layers.** The minder keeps the ground truth in its bank's private client: each Thing's car,
merged in a fixed order, kept current by the watch. The host's React Query holds entries of its
own, which the giver's hooks read and the bridge keeps current. Every option a host gives
(`structuralSharing`, `retry`, `select`, `staleTime`) applies in full, to the host's entries alone.
One shared client could not do this: TanStack sets an observer's options on the entry it observes
(`queryObserver.ts:216`, `this.#currentQuery.setOptions(this.options)`), so a host's `useQuery` on
the minder's key would replace the minder's sharing function, its `retry` and its `networkMode` for
every reader.

**The car** is the minder's cache value (VOCABULARY.md, *car*; built in the minder's own thread,
`whiteboard/20261115-lean_buttonup/complete.md`):

```ts
type ThingCar<RecordT extends ThingRecord> = Readonly<
  | { liveness: 'full',   newest: RecordT,            fullest: RecordT }
  | { liveness: 'behind', newest: Sparse<RecordT>,    fullest: RecordT }
  | { liveness: 'bare',   newest: Sparse<RecordT>,    fullest: undefined }
  | { liveness: 'gone',   newest: Tombstone<RecordT>, fullest: null }
  | { liveness: 'void',   newest: VoidSentinel,       fullest: null }
>
// isDBNewer: liveness is 'behind' or 'bare'
```

A host shows the fullest and writes against the newest. A put that replaces whisper and sidecar
both cites `newest`, needing no whole record; a merge goes through the revisor (F12).

**`useBoxRecord`'s `data` is the car's `fullest`**, picked by a default `select`: undefined while
pending, null for gone or none stored, else the record to show, its whisper sealed. A `behind`
car's older record shows while the newer one is fetched. `select` is TanStack's own way to reshape
`data`, so React Query's tracking of which fields a component reads still holds; a result copied
with an added field would read every field, and re-render on every `isFetching` flip. A host that
wants the whole car, `newest` with it, uses `boxCarQueryOptions` with a `useQuery` of its own. The
puts read `newest` from the minder, never from a hook's answer.

**The bridge** (`react-bridge.ts`, mounted by the giver's `useBridge`, inside the host's
`QueryClientProvider`) listens to each bank object's feed of the cars its minders cache, and writes
into the host's client, only into entries a hook has made:

* `full`, `gone`, `void`: the host's entry takes the car.
* `behind`: the entry takes the car, and is invalidated, so an active hook fetches the newer whole
  record and an idle one does not.
* `bare`: the entry is invalidated, never given a car whose `data` is undefined once loaded.
* At a bank object's end: the host's entries under `['safebyok', userid, banklabel]` are reset, not
  removed, so a mounted hook stays attached and fetches again from the next bank object. The host's
  client is not ours to clear: only our prefix is touched. Unmounting the bridge only stops copying.

The hook's `queryFn` asks the bank object, never the vaultDB: `ensureBank`, then `getBoxCar`, which
asks the vaultDB afresh. TanStack calls it only when the host's entry is stale by the host's own
`staleTime` (`Infinity` by default, since the bridge keeps the entry current). A host's `retry`
reaches `getBoxCar`, never a primitive. The minder's feed suits the bridge as it stands: it carries
each car after the merge, as the cache holds it, with its labelpath; a landing that changes nothing
keeps its identity under structural sharing, and re-renders nothing.

**What this asks of the bank object** (`GiverBank` and `GiverDevice` in `react-giver.ts`):
`getBoxCar(labelpath)`, answering the void car on an unborn bank; `listenBoxCars(listener)`;
`ensureBank({ userid, banklabel })`, refusing once that user is no longer signed in; and
`onBankStart(starter)`, calling the function `starter` returns at that bank object's end.

**One race**, a row for `notes/wontfix.md` when the bridge lands, not a fix (open matter 8): a newer
car landing between the moment the host's fetch resolves and the moment TanStack stores its result
would leave the older car in the host's entry. TanStack stores the result in the same chain of
microtasks, which a watch notice, a task of its own, cannot interrupt.

**A customer's own view** (sidecar and whisper merged, say) is the customer's to make: a `useQuery`
of its own, under `[...boxKey, 'view', viewlabel]`, whose `queryFn` runs its async view of the car.
Offering it as a `useBoxRecord` option waits until after 1.0 (open matter 10).

### F6. A listing by listpath, structurally shared (cached, M)

`useBoxList(listpath)` needs the labelpaths under a listpath, in tree order, as an array that keeps
its identity until an entry comes or goes. **Ask:** the listing becomes a cache entry of its own
(its key: the listpath's, plus a final `'list'`), whose value is the array of labelpaths, kept
stable by `replaceEqualDeep`. A notice of a box born or tombstoned under it updates it, and the
bridge carries it to the host's entry as it does a box (F5). Each row is then its own
`useBoxRecord`, so a memoized row redraws only for its own box. A row known only from a sparse
listing has no sidecar until its whole record arrives.

### F7. A QueryClient per bank, and React Query the host's (cached and react, S)

Each bank object makes a private `QueryClient` and clears it at its end: dropping the bank drops
everything it cached, and `goodbye` no longer sets empty defaults over its own (TanStack cannot
remove a key's defaults). No host sees the minder's client, so `@tanstack/query-core` stays a plain
dependency of the core: its version never has to match the host's React Query, and no error crosses
from one copy to another (the minder turns its `CancelledError` into a refusal of its own).

`safebyok-react` builds on `@tanstack/react-query`, a peer dependency (open matter 9), through the
host's own `QueryClientProvider`: its Suspense, error-boundary and render-time handling is the hard
part of a record hook, and it is done. Until the giver is exported, the peer is optional. Devtools,
`dehydrate`, a persister and `invalidateQueries()` all reach the host's entries, which hold sealed
records: no cleartext, unless the host's own view puts it there.

### F8. Snapshots, sliced and frozen (instance layer, M)

`DeviceSnapshot` and `BankSnapshot` (F1), and:

```ts
interface DraftSnapshot   { isReady: boolean, isEditing: boolean, isPutting: boolean, isDirty: boolean, isBehind: boolean, lastErr: VaultError | null }
```

Frozen, the same object until something changes, nothing a host has no use for (STYLE.md,
*Stateful objects and snapshots*). Every tab-state hook has a `getServerSnapshot`, answering
`signed_out`, for server rendering. A record hook's answer is React Query's result (F5), not a
snapshot of ours. A car and its records are frozen plain objects, never instances:
`replaceEqualDeep` shares only plain objects and arrays (`utils.ts:398`), and `dehydrate` and
Server Component props want them plain too.

### F9. withWhisper, with one shared unlock (instance layer and core, M)

```text
bank.withWhisper(labelpath, fn)
  ensureUnlocked()          may open an unlock_bank gating; GatingDialogs answers it
  minder.get(ask)           the car, cached if timely; its fullest record
  bank.unsealBox(record)    the whisper, under the lease
  fn(whisper)               the bank object lets go of the whisper once fn settles
```

**Ask of the core:** a second `ensureUnlocked` while an `unlock_bank` gating is open waits on that
gating (`whenConcluded`), instead of refusing. In React, several components fire calls at once (two
queries on mount, a mutation and a refetch), and refusing each but the first is a refusal only the
timing caused: it is arbitration among dialogs, and the second call joins the first (open matter
1, settled). A gating of another kind open at that moment still refuses. `withWhispers(listpath, fn)` is the same over a
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
and sidecar cites the car's `newest`, which needs no whole record, and the revisor gets the stored
whole record.

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

**What is kept is the host's choice, on two axes** (open matter 4). `keepOnDevice` says what this
browser keeps for a user, in the customer's words for what it buys; knowing it, the Device also
knows what to fetch ahead, as the wayins and the whole records at each start under
`offline_signins`. The docs say what each gives away:

| `keepOnDevice`      | What it keeps                                                                                   | What it gives away                                                                                            | What it buys                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `'none'`            | nothing                                                                                         | nothing                                                                                                       | nothing: each load fetches before its first screen                                                            |
| `'userids'`         | each user's stamp (so far the gate's), each wayin but its wrapped bankKey, and a sparse listing | who has used this browser, to whoever uses it next; nothing the server lacks                                  | the first screen and the passkey button at once, the parallel starts above, a list of past users to pick from |
| `'offline_signins'` | as `userids`, and the wayins whole and the boxes' whole records                                 | the bankKey wrapped under the passphrase: this device becomes a second place to steal it for offline guessing | unlocking offline, with something to unseal once unlocked                                                     |

`autolock: { hours, on }` says how long an unlock lasts, and so whether and how long the lease is
kept. None of its values is to be written yet (the Coach, 2026-11-19); they do not form a ladder.
See *Later, not yet: autolock* below. Where the lease is kept, its leaseKey is stored in
IndexedDB as a non-extractable `CryptoKey`, which script on the page can use while it runs but never
carry off as bytes; localStorage cannot hold one.

**Tabs.** IndexedDB is one database per origin, shared by every tab: a committed write is seen by
the next transaction in any tab, but no tab is told of it. Locking or unlocking across tabs is not
yet (open matter 5): each tab locks and unlocks alone, and a lease one tab keeps is there for the
next start in any tab, as today. When it comes, a `BroadcastChannel` carries the notices; no worker
is needed, and a SharedWorker is missing on Chrome for Android.

**Later, the rest:** so that a returning user's first render shows its boxes' sidecars at once.
After each change, the bank object dehydrates its entries with TanStack's
`dehydrate`, and writes them, with `device_tok`, the bank's stamp, the main gate's wayin headers
and a lease hint ("a cached lease exists, good until T"), to localStorage under the user and the
banklabel. `hello()` and `ensureBank` read it back with `hydrate`, synchronously. Under
`offline_signins` the records are whole, ciphertext included, and go to IndexedDB, which suits them
better than localStorage's 5 MB of text; the stamp stays in localStorage for the synchronous first
read.

* **Never in it:** a lease, a key, a whisper. Unlocking stays async whatever it says, as the
  bankKey's unwrap is an async WebCrypto call; the lease hint is what lets the UI say "Unlocking…"
  instead of flashing an Unlock button.
* **It is a cache.** Hydrated entries count as stale, and the start and the watch correct them.
* **Constraints.** localStorage is synchronous, text only, about 5 MB per origin, shared by tabs,
  readable by any script on the origin, deleted by Safari after seven days without interaction, and
  absent on the server; its access can throw (a sandboxed iframe, blocked site data). Every read
  goes in a `try`, a large listing is capped, and `vacate()` removes the user's packets.

**Later, not yet: autolock** (the Coach, 2026-11-19). Yes to `since_last_proof` and `never`; none is
written yet, and the values are not a ladder.

* `since_last_proof`: a long time, in minutes, hours or days.
* Strong evidence that the user would be prompted for their passphrase again, like a restart, but
  never a plain reload. Whether such evidence exists is unknown; consider it in a world where the
  lease is cached, and locking reaches across tabs.
* `signout`: the passphrase is asked for again on the next sign-in, too.
* `never`: never, except on these events:
  - `lock()` is called: always.
  - `vacate`, which means "remove everything of this user, as if they had never been here": so,
    by implication, always.

### F14. Stable promises for Suspense (instance layer, M, after 1.0)

`useSuspenseBank` suspends on `device.ensureBank(banklabel)`, which must hand out the same
promise per (user, banklabel) until it settles. `useSuspenseBoxRecord` is React Query's
`useSuspenseQuery` over the same options as `useBoxRecord`, which keeps its own promises stable. On
the server, a suspending hook throws, so the nearest Suspense boundary streams its fallback and the
client takes over.

### F15. Confirming a bankKey: a sealed check on the gate (core, M; proposal)

A lease is bound to the bank's stamp and records the gate revision it was granted under
(`gatelabelpath`, `gate_lifeseq`, `gate_revtok`), all in the ctx its bankKey is wrapped under. Nothing
in the new core yet compares that revision with the gate fetched; big compares `gate_tok` and the
revision for equality and forgets a row that differs. Neither proves anything about the wayins: a
wayin is checked only by unwrapping it, and nothing says the bankKey a lease or a wayin yields is
this bank's.

**Proposal:** each gate row carries one part sealed under the bankKey, through the lease's `seal`
with a sealer of its own, its ctx binding the bank's stamp and the gate's stamp, wayin headers
included. A gate verb writes it with the gate, holding the bankKey already. Then:

* **A kept lease is confirmed against the fetched gate** by unsealing that part: its bankKey is the
  bank's, and the gate revision was written by someone holding the bankKey, not made up by storage.
* **An unlock is confirmed** the same way: a wayin served by storage that wraps some other bankKey
  fails here, before anything is sealed under the wrong key. Without the check, a substituted wayin
  would leave existing boxes unsealable but quietly seal new ones under storage's key.
* **The root box** could carry such a part instead, sealed at birth and bound to the bank's stamp
  alone. That confirms the bankKey, but not the gate's revision.

It composes constructions already in `src/` (the lease's `seal`, a sealer); it is still a new use,
for a Coach's yes and an entry in `notes/security.md` (open matter 11).

## How a hook is built

The giver and the bridge are built: `packages/safebyok-react/src/giver/react-giver.ts` and
`react-bridge.ts`, tested against a fake Device (`tests/giver/`). The giver is bound to a Device,
not read from context, so several standalone Devices need no nested providers, and a test binds a
fake Device:

```ts
export const Giver = makeReactGiver(device)        // once, beside the Device
export const Acme  = Giver.forBank('acme')         // PascalCase, so the hooks lint checks Acme.useX()

Giver.useBridge()                                  // once, near the root, inside the QueryClientProvider

const { isLocked } = Acme.useBankSnapshot()                     // this tab's state, synchronous
const ends         = Acme.useBankSnapshot((b) => b.leaseEndsAt) // re-renders only when it changes
const { data: box, isPending } = Acme.useBoxRecord('box/openai')  // the fullest record, sealed
const { data: car } = useQuery(Acme.boxCarQueryOptions('box/openai'))  // the whole car, newest with it
```

`useBankSnapshot` is a `useSyncExternalStore` on the Device, picking its bank's slice.
`useBoxRecord` is React Query's `useQuery`: its key is `['safebyok', userid, banklabel, labelpath]`,
its fetch is skipped while nobody is signed in and otherwise waits on `ensureBank`, its `staleTime`
is `Infinity`, and its `select` picks the fullest record. Every other record hook has this shape.

## The order to build in

1. **F1, F2, F3, F4:** the Device, `probe`, the bank object, and `useBank`, `GatingDialogs` and
   `LockButton` on them. The gating dialogs move over almost as they are.
2. **F5, F7, F8, F9:** the car (in the minder's thread), the bank's QueryClient, the bridge,
   `useBoxRecord` and `withWhisper`. The API-key use case then works end to end, with `ApiKeyField`
   on `putBoxOnce`. The giver and the bridge are built against a fake Device.
3. **F12:** `putBox` with `retry` and a revisor; `ApiKeyField` moves onto it.
4. **F10, F11:** drafts, `WhisperInput`, `WhisperText`.
5. **F6:** `useBoxList`, `BoxTree`, `WhisperForm`: the doppler-lite. Waits on nesting.
6. **F13, F14:** the rest of the packet, and the Suspense variants. The packet's first part, the
   bank's cached stamp, can come with step 1.

Steps 1 to 4 need one gate verb and no nesting, so they can start on today's new core. The
adapters and the demo move off `safebyok-big` as their pieces land.

## Open matters

The Coach's answers stand as given, in the Ruling column.

| # | Matter | My recommendation | Ruling |
|---|---|---|---|
| 1 | F9: may a second `ensureUnlocked` wait on the open unlock gating instead of refusing? | Yes, for `unlock_bank` alone | *this just has to do with arbitrating among dialog boxes? Shouldn't it join?* Settled: it joins |
| 2 | F3: does one bank object stand for (user, banklabel) through the bank's lives, or end with a life? | Through its lives | *firm end with the life if I get to choose.* Settled: it ends with its life (F3) |
| 3 | F1: are a bank's options given only at `Device.make`, or may `ensureBank` take a banklabel it has not seen, with its options? | Both | *a bank's options should be overrideable at Bank.make. Once made, the device' copy of the options don't change; once made, a bank's own options don't change. If you want ot make a per-bank vaultDB, you have to make a new one.* Settled (F1) |
| 4 | F13: is `keepOnDevice` one level or a set? And its default? | A set | *if there are two axes, two options. keepOnDevice: 'userids', 'offline_signins', 'none'; autolock: { hours, on: 'since_last_proof' \| 'close' \| 'never' \| 'signout' }.* Settled (F13). Defaults open. autolock's values: *Later, not yet* under F13 (the Coach, 2026-11-19) |
| 5 | F13: does locking or unlocking one tab reach every tab? | Both, by `BroadcastChannel` | *that would be very nice, but I don't want to hear about the race conditions so not yet.* Deferred |
| 6 | F1: does each bank's snapshot live inside the Device's, as one store? | Yes: `useBankSnapshot` is one `useSyncExternalStore`, before the bank object arrives and after; with two stores it would switch its `subscribe` mid-life. The giver is built this way | *a clean line between react needs and core needs: core's Device, or a react equivalent?* The core's: its README promises state the way `useSyncExternalStore` wants it, so React only calls the hook. Parked with the lifecycle work |
| 7 | F5: what does a record hook answer on an unborn bank? | `data: null` at once, not pending until a birth: the bank object's `getBoxCar` answers the void car | *sounds good; are there costs?* Leaning yes; the costs are in chat (2026-11-19) |
| 8 | F5: the race between the host's fetch and a newer car | A row in `notes/wontfix.md` when the bridge lands | *wontfix.* Settled. Proposed to reopen (2026-11-19): the host's entries merge cars as the minder does, so the order no longer matters; no row was written |
| 9 | F7: `@tanstack/react-query` as a peer dependency of `safebyok-react` | Yes | *yes!* Settled; installed, optional until the giver is exported |
| 10 | F5: a customer's own view under `[...boxKey, 'view', viewlabel]` | Offer it as a `useBoxRecord` option after 1.0 | *defer please.* Settled: after 1.0 |
| 11 | F15: a sealed check on the gate, confirming a kept lease and each unlock | Yes, on the gate row, written by each gate verb | *I vote yes for authenticating, but a TODO for the moment.* Settled: in TODO.md |
| 12 | From userid to first dialog: does `offline_signins` keep the boxes' whole records? | Yes: an offline unlock has nothing to unseal without them | *yes.* Settled |
| 13 | F13: key the `userids` entries on a salted hash of the userid (the Coach's proposal) | Yes: HMAC-SHA-256 under one random salt per browser, made at the first `hello()`, by `@noble/hashes` so that the first read stays synchronous; no userid in the kept value either, since the stamp carries one. It hides who has used this browser from a look through storage, not from a test of a guessed userid, as the salt is on the device. It gives up the list of past users to pick from | *a TODO; it's going to be hard enough figuring out timing coordination.* TODO |
| 14 | F6: a small pouch of unauthenticated display data in each box's sparse record, so every listing carries it (the Coach's proposal) | Yes, told apart from the sidecar by purpose: what a row shows against what a detail view shows. No size check of its own: the box's own size check counts it, and its storage is the host's to pay for; the docs say it rides in every listing. The kit's keys are checked where present (`title`, `mask`, `placeholder`, `hint`, `min`, `max`) and every other key passes through as given (the Coach): a loose shape, the one exception to the strict validators, so `CX.pouch.parse(pouch)` returns both. A host that dislikes our check of a recognized key keeps its own bag under a key of its own (`{ fu: { … } }`). A recognized key of the wrong type refuses a put `bad_option`; read back, it fails the record's check, and the row reads as damaged. A misspelt recognized key is stored and ignored. The mask moves into it, so a listing of 1,002 shows every mask without 1.1 MB of whole records. The sidecar's trust class: unencrypted, unauthenticated, editable while locked; the kit renders it as text only, and `min` and `max` advise, never enforce. An entry in `notes/security.md` and VOCABULARY.md | *also TODO: among other things it changes completely what "sparse" means (now null, but a sparse record would have data).* TODO |
| 15 | Kit: recipes for the standard kinds of secret (API key with its account id, login, OAuth client, connection string, SSH or PGP key pair, certificate, TOTP, webhook secret, secure note) | Yes: a recipe says, for each field, whether it lives in the whisper, the sidecar or the pouch, its input (line, password, text area, file) and its placeholder and hint, and may `summarize(whisper)` into pouch fields at save: a mask, a fingerprint, an expiry. `WhisperForm` takes a recipe; `ApiKeyField` is the `api_key` recipe; a host writes its own the same way. `mask` is useless on key material, whose first line is a PEM header: its row shows a fingerprint, or a certificate's subject and expiry. The light recipes ship in the kit; certificate and PGP parsing (`@peculiar/x509`, `openpgp.js`) in optional packages or a host's `summarize`. `summarize` is a fifth place a whisper may be (F11), inside a draft's put alone | *also TODO.* TODO |

a vaultDB answer contains in general these items:
* ...scope: identifies the subject of the operation
* val: on a success, the value requested
* err: on a failure, the error.
* dbhas: the actual stored value of the subj, on an error: for example on stale_write it's the actual value you'd want to patch in a retry
* tracked: the records for the root box, bank, and gate, each according to if it changed since the ask was sent.
the proposed design:

The Minder manages a tanstack query-core per best practices: it consumes a notification feed from the vaultDB, which sends one item per notify

It serves operations (get put del) through the standard queryOptions machinery.
we want the operation method to be simple, focused on the request itself, to have one error path, and no timing to analyze. it calls vaultdb, awaits the result, and then everything else is sync; by the time it returns, its consequences are filed in the cache.

To that end, we propose the tracked records that come with the raw DB response be sent to minder by notify: this means everything the minder gets is a single record and single error path.

Consider a get request for a box where everything goes great, and the gate has changed, in a way that won't cause a lock or similar concerns. (i.e. don't consider it more, or less, important than the record being fetched.)
Give pros and cons:
* should VDB notify all subscribers about the gate before it returns with the get answer?
* should VDB notify about the box that it's also going to send on to the TSQ query handler?

Similar scenario but now it's a write failing stale_write. The dbhas contains the record at the exact address that the operation specifies. It's currently unstated, but reasonable, that if there is a dbhas field it will have identical shape and identifier scope to the main subject
* should  dbhas go into the notify? When?
* should the method itself push dbhas into the cache? It will also have to throw the error.