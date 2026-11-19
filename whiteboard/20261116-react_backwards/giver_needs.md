# giver_needs: what the giver needs from safebyok (2026-11-19)

The React giver is being built backwards from `dream-hooks.ts.md` (the final goal: every hook and call the dreamiest
React plugin would offer). This plan lists what the giver needs from `safebyok` to pass it. Part 1, the minder, comes
first and goes to another session. Part 2 is the rest, in the order the giver will reach for it.

Read by sections: `internals.md` (F5 the car and the bridge, F6 listings, F9 withWhisper, F10 drafts, F12 the orchestrating
puts), the class doc block of `ThingMinder` with its `## Invariants`, VOCABULARY.md (*car*, *fullest*, *newest*,
*minded*, *givable*), and the minder rows in TODO.md, added by [#751](https://github.com/mrflip/safebyok/pull/751).

This file has some modifications that supersede internals.md

**Only as needed:** startup and shutdown (who makes the Device, the bank object and the minder, and when: sign-in, birth,
start, `hello`, `goodbye`, vacate, waking from a lapse); deleting a box, and dropping a gone subtree (M5); a box nested
more than one level below the root box; and
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
* A birth adds to the parent's listing (M2). No delete verb, and no test of a delete through the minder: deletes are
  out of scope (the Coach, 2026-11-19).
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

What the goal needs beyond the minder, as of #753 and #756 to #760. Part 1 is built there, `mask` is exported, and #760
opens the unlock gating on a bank. The split (the Coach, 2026-11-19): whatever needs to know the newest of anything is
the minder or something on top of it. The Bank holds keys only: it seals, unseals, keeps the lease and runs gatings.

### V. A Vault class, born with a minder

Goal: everything a host calls on a bank's boxes.

* `Vault` stands for one bank's boxes in this tab: it is born with its minder (and the Bank as the minder's friend), and
  carries the host-facing verbs below. Who makes it, and when, is startup work.
* The minder keeps its own vaultDB (`MinderOpts.vaultDB`, as today) and asks the Bank only to make asks. Its calls to
  the vaultDB are thin, doing no favors: the minder does only what TanStack needs of it.
* The Bank's `tryGetBox`, `tryListBoxes`, `tryPutBox` and `tryDelBox` leave: they are a second, uncached path to the
  same rows, and a write through them leaves the minded car behind until the watch notice. Say so in the changeset.
* VOCABULARY's *vault* row is safebyok-big's (a vault per `vaultlabel`, under a bank); it gains the new core's sense.

### W. Writes: `putBoxOnce` and `putBox`

Goal: `usePutBoxAction`, `Acme.putBox({ labelpath, whisper }, bump)`.

* **The Bank's seal answers a write ask**: `sealBox` returns the ask that writes the sealed record, citing the donor
  it sealed from; a tombstone's seal returns the delete ask. The lease's seal keeps its return.
* **`vault.putBoxOnce(labelpath, patch, secrets)`** takes the car's newest (`at`, or `get` when nothing is cached; a
  sparse record serves) and calls the form below.
* **`vault.putBoxOnce(citable, patch, secrets)`** seals `patch` and `secrets` over `citable` into an ask, and sends it
  through `minder.tryWrite` (#758), answering what the vaultDB answered. One attempt. Secrets are required: a seal
  keeps none of the donor's, so even a sidecar-only patch carries the whisper.
* **`vault.putBox(...)`** (orchestration, F12): unseals the newest for the revisor, reseals, and on `stale_write` calls
  the revisor with the car's new newest (the refusal's `dbhas` has landed by then) and writes again, until it lands or
  the revisor gives up. Never inside the primitive.

### U. Unlock and lock

Goal: `useUnlockAction`, `Acme.lock()`, `withWhisper` unlocking first.

* **One shared unlock** (F9, open matter 1, settled: it joins): `launchUnlockBankPrompt` on a bank whose unlock gating
  is open joins it (its `whenConcluded`), where `attachGating` refuses `already_asking` today. Two `withWhisper` calls
  on a locked bank then share one unlock.
* **An unlock from a form**: the form action hands the passphrase from `FormData` to the gating's `attempt`, so a
  passphrase never sits in React state. Today the giver could only reach the gating through `device.openGating`, set
  because `attachGating` happens to run before `launch`'s first await: have the launch hand back the gating, or offer
  one call that unlocks with cleartexts in hand.
* **`lock()`** exists on `Bank`; the snapshot tells of it (S).

### S. Snapshots, by a class of their own

Goal: `Sb.useDevice()`, `Acme.useBank()` with and without a selector.

* A class apart from Vault (one per Device), offered through methods the Vault provides. `getSnapshot()` answers the
  Device's (userid, its banks, the open gating) and `getSnapshot(bankScope)` a bank's (`stage`, `isLocked`,
  `leaseEndsAt`, `lastErr`): frozen, memoized, the same object until something in it changes. `subscribe` tells of a
  change, as `useSyncExternalStore` wants.
* It builds a new snapshot on each event from:
  1. the Bank: lock, unlock and sweep (vacate). The Bank tells no one today: it needs a `listen`.
  2. the Device: a gating attached or detached.
  3. the open gating: an attempt under way, and a refusal for the dialog to show.
  4. the minder: the bank's car and the main gate's only. A box car changes nothing here, so a landing box wakes no
     `useBank`.
* `leaseEndsAt` comes from the lease (`proved_at` plus the device's `leaseMillis`), which the Bank exposes. No timer:
  autolock is not yet. `stage` may wait for startup; the slice's shape does not.

### Wh. The whisper

Goal: `Acme.withWhisper(labelpath, ({ apiKey }) => …)`, `<WhisperText>`.

* **`vault.withWhisper(labelpath, fn)`**: unlock first (U), get the box whole through the minder, unseal it
  (`Bank.unsealBox`), and hand the whisper to `fn` alone. The whisper is never returned, cached or put in a snapshot
  (F11 lists where a whisper may be). Core, not giver: a host without React wants it too.
* **`WhisperText`** writes a revealed whisper into the DOM through a ref, never into state: it uses `withWhisper`, and
  needs nothing more from the core.

### D. Drafts

Goal: `useDraft(labelpath)` with `isDirty`, `isBehind`, `base`, `sidecar`, `setSidecar`, `whisperField`, `put`,
`discard`, `rebase`.

* A draft records the car's newest as its base when it opens. `isBehind` is the car's newest being newer than the base.
  `put` is `vault.putBoxOnce(base, ...)`, refused `stale_write` when behind; `rebase` moves the base to the newest;
  `discard` drops the draft's edits.
* Whisper fields live in the DOM inputs (`WhisperInput`), read at `put`; the draft's state has only the sidecar edits
  and flags. Core instance-layer code (F10), tested without React.

### Nesting: one level only

The goal's `useBoxes({ under: 'acme_api/' })` and `useDraft('acme_api/prd/database_url')` reach two and three levels
down; multiply-nested boxes are out. The minder's `#shellAt` puts every box below the root in the root box's life,
right one level down. The giver tests listings of the root box and drafts one level down; `under` lists direct
children. `useBoxesAt` is the giver's `useQueries` over cars.

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

1. Part 1 (M1 to M7), by the other session: #753 and #756 to #759.
2. V and W together, then U and S together (a put needs an unlocked bank, and the snapshot tells of locking), then Wh.
3. D.

## Open for the Coach

* M2: the small list answer's shape, before any adapter changes.
* U: the launch hands back the gating, or one call unlocks with cleartexts in hand.
