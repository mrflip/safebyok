# giver_needs: what the giver needs from safebyok (2026-11-19)

The React giver is being built backwards from `dream-hooks.ts.md` (the final goal: every hook and call the dreamiest
React plugin would offer). This plan lists what the giver needs from `safebyok` to pass it. Part 1, the minder, comes
first and goes to another session. Part 2 is the rest, in the order the giver will reach for it.

Read by sections: `internals.md` (F5 the car and the bridge, F6 listings, F9 withWhisper, F10 drafts, F12 the orchestrating
puts), the class doc block of `ThingMinder` with its `## Invariants`, VOCABULARY.md (*car*, *fullest*, *newest*,
*minded*, *givable*), and the minder rows in TODO.md, added by [#751](https://github.com/mrflip/safebyok/pull/751).

This file has some modifications that supersede internals.md

**Only as needed:** startup and shutdown (who makes the Device, the bank object and the minder, and when: sign-in, birth,
start, `hello`, `goodbye`, vacate, waking from a lapse); a box nested more than one level below the root box; and
everything marked not yet: the pouch, kit recipes, the per-user packet (`lastSeen`, `keepOnDevice`), the salted userid,
autolock, locking across tabs, a customer's own view, the sealed check on the gate, and stable promises for Suspense
(F14).

---

## Part 1: the minder

Each thread is stacked on the one before. Each keeps every invariant in the class doc block; the order tests in
`packages/safebyok-react/tests/giver/minder-giver.test.tsx` show how to state one across every order of arrival.

### M1. A query key whose subtree is one prefix

Interleave the labelpath's segments with `'/'`, and end the key with `'!'` for the Thing's own car or `'#'` for its
listing:

```
['safebyok', userid, banklabel, 'box', '!']                          the root box's car
['safebyok', userid, banklabel, 'box', '#', 'kids']                  its children's listing
['safebyok', userid, banklabel, 'box', '/', 'openai', '!']           a box's car
['safebyok', userid, banklabel, 'box', '/', 'openai', '/']           the prefix of everything under that box
```

No label can be `'!'`, `'/'` or `'#'`: a label is lowercase. The root box's `gcTime: Infinity` default still matches
its car alone. `#scopeOfQueryKey` reads the new grammar.

*Done when:* the minder's tests pass unchanged, and a test shows a subtree prefix matching every key under a Thing and
neither of the Thing's own.

### M2. Listings: the labelpaths of a Thing's children

A listing is a query at the parent's `#` key, whose value is the labelpaths of the children the minder has heard of,
tombstones included, in labelpath order. Structural sharing keeps its identity until its membership changes.

* **Fed from every source.** A list sets it. A get, a write's answer and a watch notice each add the Thing's labelpath
  to its parent's listing, where the minder has one. Membership only grows within the parent's life, so any order of
  arrival gives the same listing.
* **Never a sparse record.** A row reads its child's car (its newest); a second copy in the listing could disagree.
* **Read synchronously**, as `at` reads a car: the listing the minder has, or undefined for none.
* **`list` keeps its contract**: it answers the labelpaths, and lands each record in its car as today.
* **The vaultDB's list answer can be made small** (the Coach): the parent's scope and life once, then for each child
  its label, revseq, revtok, lifeseq and `written_at`. Propose the shape to the Coach before building it; it changes
  the vaultDB contract and every adapter.

*Done when:* order tests show a listing's membership the same for every order of a list, a get, a write and a notice;
a box born on another device joins its parent's listing by the watch alone.

### M3. Writes: the answer lands before the write resolves

The minder writes, as well as reads. It takes a whole write ask, already
sealed by the bank, sends it to the vaultDB's `tryWriteThing`, lands every record the answer carries in the cache
through the merge, and only then answers.

* Every record an answer carries lands: the stored record, a refusal's `dbhas` (a `stale_write` reports the newer
  record, so the car's newest is what the next write must cite), and the bank and main gate in its `world`.
* A delete is a write of the tombstone. A birth adds to the parent's listing (M2).
* Nothing of the record enters the cache before the answer: no optimistic update.
* Listeners hear the new car synchronously, inside the merge, before the write's promise resolves (TanStack calls cache
  listeners at once, even inside `notifyManager.batch`). So the giver's entry shows the new record by the time a
  host's `await` returns.

*Done when:* a test shows a listener told of the new car before the write resolves; a `stale_write` leaves the car's
newest at the record the vaultDB reported; the watch's later notice of the same write changes nothing.

### M4. Invalidate listings, and tell of it

`invalidate(labelpath?, { list: 'all' })` marks the listings under a labelpath (or every listing) stale, fetches nothing, and `listen`
tells of each. TanStack fires one `updated` event with action `invalidate` per query, synchronously, and only the
first time a query is invalidated; `isUsefulTSQEvent` passes it on. The second arg may only take the value `{ list: 'all' }`

The giver's side, for context: the bridge invalidates the givable listing, React Query refetches it where it is
observed, the list paints a changed box `behind`, and the bridge has that box fetched again where it is shown. The
minder invalidates listings only, never cars

*Done when:* a test shows `invalidate` asking the vaultDB nothing, telling a listener of each listing, and a later
`list` replacing what was invalid.

### M6. What `listen` tells, as a tagged union

`listen` hands a ThingCar's answer today, with no message for a cache invalidation. With listings and invalidation it tells of three
events: a ThingCar, a ListingCar, a InvalidationCar.
Make the event a tagged union:
{ carkind: 'thing'         modelkind labelpath    newest fullest }
{ carkind: 'invalidation'  modelkind labelpath    card:'list' labels:'all' }
{ carkind: 'listing'       modelkind labelpaths[] }

*Tags*, so that the giver's `listenBoxCars` and a listing's bridge read it without guessing from missing fields.

*Done when:* the giver's `giverBankOfMinder` reads the tag, and its tests pass.

### M7. A box's labelpath, typed

Export `BoxLabelpath` (`'box' | \`box/${string}\``) and its guard from the core, so the giver stops declaring its own
(`packages/safebyok-react/src/giver/minder-bank.ts`). Its key and its car type (`CarAt`) agree with it.

(this may not be needed with recent changes to add modelkind)

---

## Part 2: the rest of safebyok (not yet)

What the goal needs beyond the minder. Each item names what exists today.

### W. Writes from a host: `putBox`, its revisor, `delBox`

Goal: `usePutBoxAction`, `Giver.putBox({ labelpath, whisper }, bump)`, deletes from the kit.

* **`putBoxOnce`** (the primitive): seal the next revision against the car's newest (`Bank.sealBox` exists), write it
  through the minder (M3), and answer the stored record or refuse `stale_write`. One attempt.
* **`putBox(draft, revisor)`** (orchestration, F12): on `stale_write`, call the revisor with the car's new newest and
  write again, until it lands or the revisor gives up. It lives in the instance layer, never in the primitive.
* **`delBox`**: `Bank.tombstoneBox` exists; write it through the minder.
* **`mask`**: the goal's `sidecarOf: (whisper) => ({ mask: mask(whisper.apiKey) })` needs `mask` and the mask schedule
  (#727, in `safebyok-big`) exported from `safebyok`.

### U. Unlock and lock

Goal: `useUnlockAction`, `Giver.lock()`, `withWhisper` unlocking first.

* **One shared unlock** (F9, open matter 1, settled: it joins): a second call that needs an unlock while an
  `unlock_bank` gating is open joins it, instead of refusing as every second gating does today.
* **An unlock from a form**: the giver hands a passphrase from `FormData` to the open gating's attempt (`Gating.attempt`
  exists), so a passphrase never sits in React state.
* **`lock()`** exists on `Bank`; it tells of the change through the snapshot (S).

### S. This tab's state, as `useSyncExternalStore` wants it

Goal: `useDevice()`, `useBank()` with and without a selector.

* A `Snapshotter` instance offers `subscribe` and `getSnapshot`: frozen, keeping its identity until something changes.
  Its snapshot has the open gating (`Gating`'s `toJSON` exists) and each bank's slice: `stage`, `isLocked`, `leaseEndsAt`,
  `lastErr`.
* It is main code with no React in it, exported from `/hooks`; the giver only calls the hook. Whether each bank's slice lives in the Device's
  one store (open matter 6) is decided with the startup work, which is out of scope here; the slice's shape is not.

### Wh. The whisper

Goal: `Acme.withWhisper(labelpath, ({ apiKey }) => …)`, `<WhisperText>`.

* **`withWhisper(labelpath, fn)`**: unlock first (U), get the box's newest whole through the minder, unseal it
  (`Bank.unsealBox` exists), and hand the whisper to `fn` alone. The whisper is never returned, cached or put in a
  snapshot (F11 lists where a whisper may be).
* **`WhisperText`** writes a revealed whisper into the DOM through a ref, never into state: it uses `withWhisper`, and
  needs nothing more from the core.

### D. Drafts

Goal: `useDraft(labelpath)` with `isDirty`, `isBehind`, `base`, `sidecar`, `setSidecar`, `whisperField`, `put`,
`discard`, `rebase`.

* A draft records the car's newest as its base when it opens. `isBehind` is the car's newest being newer than the base.
  `put` writes against the base (refusing `stale_write` when behind) through `putBoxOnce`; `rebase` moves the base to
  the newest; `discard` drops the draft's edits.
* Whisper fields live in the DOM inputs (`WhisperInput`), read at `put`; the draft's state has only the sidecar edits
  and flags. It is instance-layer code (F10), tested without React.

### L. Listings, one level below a box

Goal: `useBoxes({ parent: 'acme_api' })`, `useSuspenseBoxes`, `useBoxesAt([...])`.

* Under the root box, M2 serves it. `parent: 'acme_api'` lists the children of a box below the root: the minder's
  `#shellAt` puts every box in the root box's life today, so a box below another needs its shell in its parent's life,
  and a get, list and write of it. One level only.
* `useBoxesAt` is the giver's `useQueries` over cars, and needs nothing more.

### G. For context: what the giver does itself

Needing nothing new from the core: `useBox` with its placeholder from the listing's row, `usePeekBox` (`peekBoxCar`,
#751), `ensureBox` and `prefetchBox` (a route loader's fetch, caught up by the bridge, #751), `select`, `boxQuery` and
`keys` for bare React Query, the suspense variants over `useSuspenseQuery`, `GatingDialogs` and `LockButton` moved
from `safebyok-react` today, and a mounted box observing its parent's listing so a lapse re-checks it (M4).


### M5. (Not this sprint) Drop a gone parent's subtree

When a Thing is tombstoned, or a newer life of it is heard of (a lapse can hide the tombstone between), the minder
removes every query under its subtree prefix (M1), and its own listing; its own car takes the tombstone or the newer
life. TanStack tells listeners of each removal at once.

* A get of a child under way is cancelled by the removal. `#doGet` reads every cancellation as `goodbye` and refuses
  `disabled`: tell the two apart, so that a get cancelled by a forget refuses with a kind of its own (the Coach rules
  which), or asks again. This is presumed to be handled by tanstack: do not implement any kind of cancellation
  or abort mechanism. No new concurrency machinery is contemplated
* Order matters here: the forget comes before the parent's tombstone lands, since the tombstone's car is outside the
  prefix either way (M1).

*Done when:* a test shows a parent's tombstone removing its children's cars and listings and telling a listener of
each; a get under way refuses with the new kind.


---

## Order

1. M1 to M7, in order, by the other session.
2. W, then U and S together (a put needs an unlocked bank, and the snapshot tells of locking), then Wh.
3. D, then L.

## Open for the Coach

* M2: the small list answer's shape, before any adapter changes.
* M5: the refusal kind for a get cancelled by a subtree drop, or whether it asks again.
* L: whether one level of nesting is in scope now, or waits with nesting as a whole.
