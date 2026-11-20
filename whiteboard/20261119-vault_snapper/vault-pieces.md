# vault_snapper: the Vault, snapshots, and what the giver needs next

The next sprint builds what the React giver needs from `safebyok` beyond the minder: a `Vault` that carries every verb
a host calls on a bank's boxes, writes, unlocking and locking, snapshots of the tab's state on the Device and the Bank,
`withWhisper`, and drafts. The target is `dream-interface-2.md`, beside this file. Each thread below names the lines
of it that it makes possible.

Status: a proposal, 2026-11-19. Items marked **Open** wait on the Coach; *Open for the Coach*, at the end, gathers
them with a recommendation each.

## Before starting

Read, by section: VOCABULARY.md's *car*, *newest*, *fullest*, *listing*, *minder*, *minded* and *givable*; the class doc
block of `ThingMinder` (`packages/safebyok/src/minding/thing-minder.ts`) and its `## Invariants`; the giver in
`packages/safebyok-react/src/giver/`.

Where things stand:

* **The minder is built** (#753, #756 to #759, #765, #766, all merged): keys whose subtree is one prefix, `listen`'s
  tagged events, listings, `tryWrite` landing its record before it answers, `invalidate` of listings, the root box's
  listing seeded at `hello`, and the watch's notices one Thing each.
* **The minder's run never goes back**, a new invariant in its class doc block, with the test "a ThingMinder tells
  each car and listing going forward, in any order". It sits uncommitted in the base checkout (2026-11-19) and goes
  with the sprint's first thread.
* **The Bank holds keys only** (the Coach, 2026-11-19): it seals, unseals, keeps the lease and runs gatings.
  Whatever needs to know the newest record of anything is the minder, or something built on it.
* **The Device stands for one bank scope** today (`Device.make({ userid, banklabel, device_tok }, opts)`), not
  the once-per-tab Device of the dream. Who makes the Device, the Bank, the minder and the Vault, and when (sign-in,
  birth, `hello`, `goodbye`, vacate), is startup work, outside this sprint. Each thread's tests make them by hand.

Out of scope: startup and shutdown; a box nested more than one level below the root box; deleting the root box, and
the subtree it would drop (M5, under *Later*); the pouch; the per-user packet; autolock; locking across tabs; the
sealed check on the gate; and stable promises for Suspense.

---

## Threads

### V. The Vault

*For:* every `Acme.` verb in the dream that is not a hook.

* `Vault` stands for one bank's boxes in this tab. It is born with its minder, whose friend is the Bank, and
  carries the host-facing verbs of the threads below. It holds no hooks, snapshots or other reactive machinery: it
  serves a shell script and the React giver alike.
* The minder keeps its own vaultDB (`MinderOpts.vaultDB`, as today), and takes only asks the Bank has formed. Its
  calls to the vaultDB do only what TanStack needs of them.
* The Bank's `tryGetBox`, `tryListBoxes`, `tryPutBox` and `tryDelBox` go. They are a second, uncached path to the
  same rows, and a write through them leaves the minder's car behind until the watch's notice arrives. The
  changeset says so.
* VOCABULARY.md's *vault* row describes safebyok-big (a vault per `vaultlabel`, under a bank). It gains the new
  core's sense beside it.

**Settled (V1)** (the Coach, 2026-11-19): how a Vault is made is the builder's call, whatever works for the tests;
who makes it, and when, is for startup to settle later.

**Settled (V2)** (the Coach, 2026-11-19): every write goes through the minder. Today the Bank's `put` (of the bank's
own record) and its private `#putGate` (of the main gate, inside each gate verb) call `vaultDB.tryWriteThing`
themselves, so the minder hears of what they wrote only when the watch's notice arrives. They call `minder.tryWrite`
instead, which lands the record before it answers. The Bank reaches its minder however V1 makes it work.

*Done when:* the four `try*Box` verbs are gone, their tests move to the Vault's verbs, and every box a test reads or
writes goes through the minder.

### W. Writes: `putBoxOnce`, `putBox` and `delBox`

*For:* `Acme.putBoxAction(...)`, `Acme.putBox('counter', revisor)`, `Acme.putBoxOnce(car.newest, ...)`, `Acme.delBox`.

* **The Bank's seal answers a write ask.** `sealBox` returns the ask that writes the sealed record, citing the
  record it sealed over; sealing a tombstone returns the delete ask. The lease's `seal` keeps its return.
* **`vault.putBoxOnce(cited, patch, secrets)`** seals `patch` and `secrets` over `cited` into an ask, sends it
  through `minder.tryWrite`, and answers what the vaultDB answered. One attempt. `secrets` is required: a seal keeps
  nothing of the cited record's whisper, so even a change to the sidecar alone carries the whisper.
* **`vault.putBoxOnce(labelpath, patch, secrets)`** cites the car's newest (`minder.at`, or `minder.get` when
  nothing is cached; a sparse record serves), then does the above.
* **`vault.putBox(labelpath, revisor)`** orchestrates: it unseals the newest whole record for the revisor, seals
  what the revisor returns, and on `stale_write` calls the revisor again with the car's new newest (the refusal's
  `dbhas` has landed through the watch by then) and writes again, until the write lands or the revisor gives up.
  The loop is here, never inside `putBoxOnce`.
* **`vault.delBox(labelpath)`** writes the box's tombstone, citing the car's newest. A deleted box's car is
  `gone`, and its tombstone stays listed.

**Later (W1)** (the Coach, 2026-11-19): the orchestrating put waits for its own discussion: how a host runs it,
through a `useMutation` the host writes or one the Vault offers, and with what retry (dream-interface-2.md, question
8, rides with it). This sprint builds `putBoxOnce` and `delBox`; `putBox` waits.

**Open (W2):** a rename while locked. Because the seal keeps none of the whisper, a change to the sidecar alone
needs the bank unlocked and the whisper unsealed. Accept for now?

*Done when:* a `putBoxOnce` resolves with the new record already in the car, and in its parent's listing on a
birth; one citing an older revision refuses `stale_write`, leaving the car's newest at the stored record; a
`putBox` whose first attempt is refused calls its revisor with the stored record and lands the second; a `delBox`
leaves the car `gone`.

### U. Unlocking and locking

*For:* `Acme.unlockAction`, `device.lock()`, and `withWhisper` unlocking first.

Settled with the Coach, 2026-11-19:

* **The lifecycle verbs live on the Device** (`lock`, and later `vacate`, `sweep` and the rest): its lifetime is
  the customer's, so a closure that captured it reaches the current bank, where one that captured a Bank would reach a
  tombstone after a rebirth. `device.lock()` locks every bank, and becomes `device.lock(banklabels: 'all' |
  Banklabel[] = 'all')` later.
* **The gating verbs live on the Bank** (`ensureUnlocked`, `replacePassphrase`, `addPasskey`, `revokePasskey`):
  each acts on one bank's gate, so on the Device it would need the bank as an argument, and be sugar for finding that
  bank plus a check of the argument against it. A giver's per-bank handle finds the current Bank at call time; a
  Bank's tombstone refuses its verbs.
* **One bank per user:** `banklabel` is an internal constant, `'main'`, kept in the stored scope and the keys.
* **One gating at a time, and everyone joins it.** No gating needs another open beside it: each kind collects every
  cleartext it needs in its one dialog. Every bank gating ends with the bank unlocked, so a caller waiting for an
  unlock joins whatever gating is open. Only the user's dismiss ends it early, rejecting every waiter `dismissed`.
* **`gatingseq` names the join.** The Device counts it, and bumps it when a gating opens and again when it ends
  (dismissed, succeeded, or out of attempts), so a form showing one request can never answer another. It is a
  sequence, not a token: it is no secret (any code on the page reads the snapshot), and its order tells a stale form
  (lower) from a bug (higher). `<UnlockDialog key={gatingseq}>` remounts the form for each request.
* **A form answers with the passphrase itself, never through a callback,** at an entrypoint past the join:
  `device.unlock(gatingScope, { passphrase })`, where `gatingScope` is `Pick<BankSnapshot, 'userid' | 'banklabel' |
  'gatingseq'>`, the snapshot the form was shown. So the Bank's snapshot carries `gatingseq`, the Device's count. The
  scope carries no `gatingkind`: `gatingseq` already names exactly one gating, and the Device checks the cleartexts
  against that gating's own kind. The Device need not look anything up, and a form shown to another user refuses.
* **The general answering verb, for every kind, is `device.prompt(gatingScope, cleartexts)`** (the Coach, 2026-11-19:
  not `answer`, which names a type everywhere). This sprint builds the simple case alone: a passphrase unlock.

The Coach's note, kept: *those should not be public entrypoints: ReactGiver should offer an unl*

A passphrase unlock, as a call tree. Each line: the call, what it holds, what it sends on. No line keeps a cleartext
past its own call.

```text
vault.withWhisper(labelpath, fn)                      holds labelpath, fn
  bank.ensureUnlocked()                               unlocked: resolves at once
    a gating is open                                  joins: awaits gating.whenConcluded
    none is open: device.#openGating('unlock_bank')
      gatingseq += 1                                  Device holds gatingseq and the live gating, privately
      Gating.make({ gatingkind, gatingseq, scope })   holds kind, seq, attempts left, isAttempting, lastRefusal; never a cleartext
      device.#align()                                 snapshot.gating = { gatingkind, gatingseq, isAttempting, lastRefusal } -> subscribers
      await gating.whenConcluded

<form action>                                         FormData holds the passphrase; React state never does
  device.unlock({ userid, banklabel, gatingseq }, { passphrase })
    scope or gatingseq differs from the Device's      refuses; the passphrase goes nowhere
    no gating is open, the bank locked                (proposed) attempts with no gating, through the same unlockBank below;
                                                      a gating some caller opens meanwhile concludes once the bank unlocks
    gating.attempt({ passphrase })                    isAttempting -> device.#align()
      unlockBank(bank, cleartexts, friend)            passphrase -> key deriver -> wrapping key; unwraps the bankKey from the wayin
        proving.buildLease(bank, maingate)            the lease holds the bankKey; the passphrase is dropped
        bank.#attachLease(lease)                      bank.#align(): stage 'unlocked', leaseEndsAt -> subscribers
      a correctable refusal                           gating: lastRefusal, one attempt fewer -> device.#align(); the form shows it
      success                                         gating concludes with the bank; device.#closeGating: gatingseq += 1 -> device.#align()
  waiters resume                                      whenConcluded resolves; withWhisper unseals and calls fn

device.dismiss(gatingScope)                           gating concludes refused; gatingseq += 1; every waiter rejects `dismissed`
device.lock()                                         bank.lock(): drops the lease -> bank.#align(): stage 'locked' -> subscribers
```

**Open (U2):** the front-facing interface for gatings, to be settled from the design side and back from what the
calls need, once the simple case (a passphrase unlock) works end to end. Still open: a dispatch tag for menus drawn
from data (`launch(kind)`, waiting on the simple case), and whether the host's `requestCleartext` callback (the
Device's `askUser`) and the public `launch…Prompt` verbs stay. ~~Recommended: retire the callback.~~ *The Coach
(2026-11-20): "Put it back how it was I forgot about the table thing":* the callback and the `launch…Prompt` verbs
stay as they stand; nothing is retired. The dispatch tag waits on the simple case.

*Done when:* two `withWhisper` calls on a locked bank open one gating and both resume after one `device.unlock`; a
`device.unlock` citing an old `gatingseq` or another userid refuses without attempting; `device.dismiss` rejects
every waiter `dismissed`; `device.lock()` publishes `locked`.

### S. Snapshots, on the Device and the Bank

*For:* `Acme.useBank()` with and without a selector, `SOK.useGating()`.

There is no Snapper (the Coach, 2026-11-19). Records reach React through the host's React Query; what remains is the
state stored nowhere, which lives on the Device and the Bank, and the giver re-exposes their two methods.

* **The Device and the Bank each offer `getSnapshot()` and `subscribe(listener)`**, as `useSyncExternalStore` wants.
  `getSnapshot` takes no argument and returns the snapshot held, never building one, so it is the same object until
  something in it changes.
* **`#makeSnapshot` is pure**: it builds a candidate from the current state, with no side effects. **`#align`** calls
  it, compares the candidate with the snapshot held (es-toolkit's `isEqual`: its fields are primitives and frozen
  parts), and only where they differ stores it and tells each subscriber, each guarded so that a throw goes to
  `tellBadNews`. Each verb that changes covered state calls `#align` last, once its change is complete.
* **Only the Bank carries a stage and flags:** `stage`, `isLocked`, `isEnded`, `endCause`, `leaseEndsAt` (an expiry,
  the lease's `proved_at` plus the Device's `leaseMillis`, never a duration) and `lastErr`. The snapshot is its own
  tombstone, through `stage` and `isEnded`. No timer: autolock is not yet built.
* **The Device forwards the current bank's snapshot**, so a host subscribes once across every life, and adds only the
  open gating: `{ gatingkind, gatingseq, isAttempting, lastRefusal }`, or null. Before a Bank exists, startup supplies
  the stage; that is outside this sprint.
* **Nothing from the minder.** Whether a bank is born is known at startup, and a deleted bank is an ending, which
  arrives as the Bank's tombstone. So a box landing wakes no `useBank`.

**Settled (S1)** (the Coach, 2026-11-19): `stage` is `'signed_out' | 'starting' | 'unborn' | 'locked' | 'unlocked' |
'swept' | 'failed'`, with `isLocked` true at every stage but `unlocked`. A bank ends four ways: swept (everything
unloaded, its lease kept in the deviceDB), vacated (as if the user had never signed in), signed out, and deleted. Each
leaves a new tombstone object in place of every reference the library holds. A tombstone's stage says where the user
now stands, so a host's `switch` needs no case for an ending: signed out or vacated is `signed_out`, deleted is
`unborn`. Only a sweep, after which nothing follows until the customer acts, has a stage of its own. Beside the stage,
`isEnded` (true on every tombstone) and `endCause` (`'sweep' | 'vacate' | 'signout' | 'delete'`, for the message).

**Settled (S2)** (the Coach, 2026-11-19): the Bank's snapshot carries `isWatching` and `heardAt`, once the vaultDB
can tell them. No field has "state" in its name.

*Done when:* a test sees one new snapshot each for an unlock, a lock and a sweep, the same object between them,
and none for a box landing.

### Wh. The whisper

*For:* `Acme.withWhisper('openai', ({ apiKey }) => …)`, `<WhisperText>`.

* **`vault.withWhisper(labelpath, fn)`** unlocks first (U), gets the box's whole record through the minder,
  unseals it (`Bank.unsealBox`), and hands the whisper to `fn` alone. The whisper is never returned, cached or put
  in a snapshot (internals.md F11 lists where a whisper may be). Core, not giver: a host without React wants it too.
* **`WhisperText`** writes a revealed whisper into the DOM through a ref, never into state. It uses `withWhisper`,
  and needs nothing more from the core.

**Open (Wh1):** what `withWhisper` does where no box is stored, or it was deleted. Recommended: refuse `absent_box`
(a kind safebyok-big already has: "no box under that label"), for both. A host's page usually knows before calling,
since its record hook's `data` is null, and shows "Add your key" instead; at call time, absence is the exception, and
a refusal a host can test for serves it. Calling `fn` with null would make every `fn` handle a case most never meet.

*Done when:* `fn` receives the whisper of the newest whole record, after an unlock if the bank was locked; nothing
the minder caches or a snapshot reports holds it afterwards.

### D. Drafts

A draft is one box opened for editing, as a form edits an existing record. It remembers the revision it was opened
from (its `base`), holds the sidecar's edits, leaves the whisper's fields in the DOM inputs, says whether anything
changed (`isDirty`) and whether another device has written since (`isBehind`), and puts citing its base, so a change
made elsewhere meanwhile refuses rather than being overwritten.

*For:* `Acme.useDraft(labelpath)`, with `isDirty`, `isBehind`, `base`, `sidecar`, `setSidecar`, `whisperField`,
`put`, `discard` and `rebase`.

* A draft takes the car's newest as its `base` when it opens. `isBehind` is the car's newest being newer than the
  base. `put` is `vault.putBoxOnce(base, ...)`, refused `stale_write` when behind; `rebase` moves the base to the
  newest; `discard` drops the draft's edits.
* The whisper's fields live in the DOM inputs, read at `put`. The draft's own state holds only the sidecar's edits
  and its flags. Core code, tested without React.

**Open (D1):** the core cannot know the DOM. I recommend the draft take a `whisperOf()` callback at `put`, which the
React part supplies by reading its registered inputs, so the core stays DOM-free and its tests pass a function.

*Done when:* a draft's `isBehind` turns true when a newer revision lands; its `put` refuses `stale_write` while
behind, and lands after `rebase`.

### F. The feed: TanStack's event in our own

*For:* rule 3 of dream-interface-2.md, freshness told in TanStack's words, and a bridge that copies state without
translating it.

* **Settled (the Coach, 2026-11-19):** each `MinderEvent` is TanStack's cache event spread into our own: its `type`,
  its action's type, the query's `queryKey`, and its `state` as it stands (`data`, `dataUpdatedAt`, `error`,
  `isInvalidated`, `status`), a frozen shallow copy, in place of `car` and `labelpaths`. The live `Query` object is
  never handed out. An invalidation is a listing event whose `state.isInvalidated` is true.
* **Decorated** (the Coach, 2026-11-19): every event carries the scope's fields (`userid`, `banklabel`, `labelpath`,
  `modelkind`); a thing event also carries its car's `agerank` and its newest's `revtok`, `revseq`, `am`, `lifeseq`
  and `lifepath`. A field that is there and goes unused is removed later; one that is missing teaches nothing when
  code is written badly without it.
* **Settled (the Coach, 2026-11-19):** TanStack's state type enters the core's exported contract. `listen` takes the
  version of the feed its listener was written against, which is `ThingFormat` (`fmt` in every Thing, `100_501`
  today), and refuses any other. A change to the event's shape bumps `ThingFormat`, as a change to a record's does.
* **Settled (the Coach, 2026-11-19):** that constant becomes a string, `'v010501'`, everywhere it serves: `fmt` in
  every Thing, safebyok-postgres's version, and `listen`'s version.
* **Settled (the Coach, 2026-11-19):** the key's head is `'sok'` in the minder and in the host alike, so the host's
  key for a car or a listing is the minder's key. The minder's tests that spell a key change with it.
* The invalidation event's `card` and `tag` were the Coach's opinion, offered as uninformed, not a ruling (the Coach,
  2026-11-19). Folding it into the listing's state reverses nothing ruled.

## Fixes riding along

Each goes with the thread already working in its file.

* **The host's entries pause offline.** The giver's queries take TanStack's default `networkMode: 'online'`, though
  they ask the minder, which answers from its cache offline. They take `'always'`.
* **`GiverBank.getBoxCar`'s doc block is wrong.** It says the car is "asked of the vaultDB, never only the cache",
  but it calls `minder.get`, which answers from a timely car without asking.
* **A car's records are not frozen.** `carOf` freezes the car's own object; the records in it arrive from the vaultDB
  unfrozen, and `bestCarOf`'s `replaceEqualDeep` makes new ones unfrozen. A listener, or a host's `select`, that
  writes into `car.fullest.sidecar` changes the minded cache. The records are deep-frozen as they land (a library
  helper, not our own).
* **The host's entry can go back** (reproduced, 2026-11-19). The host's own fetch resolves with the car `minder.get`
  read, and that car takes several microtask hops before TanStack stores it. A notice, delivered by `queueMicrotask`,
  can land in that window; the bridge copies its newer car into the host's entry, and the fetch then stores the
  older car over it, since the host's default structural sharing is plain `replaceEqualDeep`. Under `staleTime:
  Infinity` it stays until the next event. The giver's default `structuralSharing` keeps whichever car has the
  greater `agerank` (below), `prior` on a tie; a host who overrides it owns the race. Every car in the host's entry is
  a whole snapshot the minder held, and the minder's run never goes back, so the later car holds everything the earlier
  one does: nothing needs merging. The minder's own merge, `bestCarOf`, stays a merge: a prior bare car (newest rev 5)
  meeting a delivered full rev 3 makes a behind car that neither input is.
* **Each car carries its `agerank`** (settled, the Coach, 2026-11-19), made once in `carOf`: a string that compares
  as the car's age, higher being newer. It joins with `'~'` the newest's lifepath, the newest's revseq, the car's
  liveness, and the revseq of `fullest ?? newest` (none for a bare car), each revseq padded as lifeseq is (base-32 to
  ten, the shell's −1 as `'-000000001'`). Every field is of fixed width, so a comparison is settled before it reaches a
  separator, and no tag added later can sort wrongly by being a prefix of another. So the liveness `behind` is renamed
  `bhnd`, and the five, all four letters, sort as wanted: `void > gone > full > bhnd > bare`. The fullest's revseq
  settles two `bhnd` cars with the same newest, which records arriving out of order can make. The cost: a field on the
  exported `ThingCar`, in `CarChecks`, and in each test that builds a car by hand; the rename reaches `carLivenessVals`,
  VOCABULARY.md's *car* row, the giver, and every test and doc block that names `behind`.
* **A get resuming after `goodbye` and `hello` joins the new listing.** `#doGet` calls `#joinParentListing`
  without checking that the minder is still minding the same session, so an answer that resumes after `goodbye`
  and a fresh `hello` adds its labelpath to the new root listing. Found by reading, not reproduced: investigate,
  reproduce it in a test (`goodbye` cancels a get under way, so first confirm the get can resume at all), and fix.

---

## Also in the giver, needing nothing new from the core

`useBox` and its factory (`initialData` from the minder's car, `staleTime` as a function of liveness, the greater
`agerank` as `structuralSharing`, `networkMode: 'always'`, `select` picking `fullest`, every one of them a default a host
may override), the suspense variants, `select`, `keys`, `GatingDialogs` and
`LockButton` moved from `safebyok-react` today, and a mounted box observing its parent's listing, so that a lapse
checks it again.

## Later

### M5. Dropping a gone parent's subtree

When a Thing is tombstoned, or a newer life of it is heard of (a lapse may hide the tombstone between), the minder
removes every query under its subtree prefix, and its own listing; its own car takes the tombstone or the newer life.
TanStack tells listeners of each removal at once.

* A get of a child under way is cancelled by the removal. `#doGet` reads every cancellation as `goodbye` and
  refuses `disabled`. A get cancelled this way should refuse with a kind of its own (the Coach rules which), or
  ask again. TanStack is presumed to handle the cancellation: build no cancellation or abort mechanism of our own,
  and no new concurrency machinery.
* The removal comes before the parent's tombstone lands, since the tombstone's car is outside the prefix either way.

*Done when:* a test shows a parent's tombstone removing its children's cars and listings and telling a listener of
each, and a get under way refusing with the new kind.

## Order

1. F.
2. V and W together, then U and S together (a write needs an unlocked bank, and the snapshot `tell`s locking), then
   Wh.
3. D.

## Open for the Coach

| # | Matter | Recommendation |
|---|---|---|
| W1 | The orchestrating put, and how a host runs it (a `useMutation`, the host's or the Vault's) | Later, its own discussion |
| W2 | A rename while locked needs an unlock and the whisper | Accept for now |
| U2 | The front-facing interface for gatings, after the simple case | Ruled: keep the `requestCleartext` callback and the `launch…Prompt` verbs; a dispatch tag waits on the simple case |
| Wh1 | `withWhisper` on a box not stored, or deleted | Refuse `absent_box` |
| D1 | How a draft reads the whisper's fields | A `whisperOf()` callback the React part supplies |
