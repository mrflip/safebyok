# gripeoween_vault: consistency, the consensus so far

The Coach and the orchestrator, in chat, 2026-10-28, from the question "what does `putBox` do, and
why did a deleted box come back" (thread 2's review). Kept by the orchestrator; threads look here
for the direction and never write it. Terms of this document, not of VOCABULARY.md: **vault+core**
is the vault record, its gate, and any light context that fits in 2 kB serialized; **boxlist** is
the listing of boxes; **vault+boxlist** both; **box** a box, its sidecar and its ciphered whisper.

## 1. What the library is for

To serve a record, the library must combine

1. what only the **user** bears (the passphrase);
2. what only the **central data store** holds (the vault, the boxes);
3. what arrives from **other tabs and devices**.

It does so under greatly differing timelines of update:

* **User credentials** are re-requested about _once a week_ (configurable by app) and rotate at
  the user's whim.
* **Vault lock** must stop reads _immediately_, yet never leave the host a state that is
  inconsistent or ambiguous.
* **Changes made in another tab** should settle in the others in _less than a second_, and can
  settle in tens of milliseconds: the bell (`BroadcastChannel`) crosses tabs in a few
  milliseconds, and the receiving tab is then one read away, or no read away where the ring
  carries the vault+core. 50 ms is the right target; it is bounded by that read, not by the bell.
* **Changes made on another device** should settle within seconds, limited only by the push's
  network delay and the store's.

The broad timescale requires that secure local caches negotiate concurrent updates and stored
values from:

1. the user;
2. in-flight operations (waiting to be sent to the store; sent and waiting for an answer);
3. updates carried by the answers of operations;
4. updates from local tabs, via shared local workers or data stores;
5. updates from other devices, via push from the central store;
6. information cached locally.

## 2. Consensus

* **(a) The model is the session guarantees** (Terry et al., Bayou, 1994): *read your writes*,
  *monotonic reads*, *writes follow reads*, *monotonic writes*; section 7 says each in plain words.
  - For each device's view of the store, the store is **linearizable per vault**: every write to
    one vault lands in the server's transaction, so there is one order of writes per vault, and a
    read sees a prefix of it. Plainly: for one vault, the server's history is a single line, and
    every device's picture is some point on that line, never a blend of two.
  - Across devices that is **causal consistency, the server the serializer**: if device A saw
    device B's write before making its own, every device sees B's write before A's. Plainly: a
    device never shows an effect before its cause, and the server decides the order when two
    devices write without seeing each other.
* **(b) Boxes are independent and versioned by a count. A delete leaves a tombstone carrying its
  boxlabel but no residue of its former contents.** Section 4 has the mechanics.
* **No listing-wide order**: no counter bumped by every box operation. A future need to order
  several boxes against each other (a blob across boxes) is a simpler problem than that, and not
  contemplated now.
* **(c) The flow is too complicated.** Order is reconstructed today from five mechanisms
  (`vault_epoch`, `gate_epoch`, random `revision_tok`, the local `#leasesHeld` count, the local
  `#refreshedAt` clock) with a `#demandAfterWait` after every await. The direction is one merge
  rule per cached thing (section 4), applied at each resumption, and the lanes (section 3) kept
  apart.
* **(d) The vault+core is light and travels on every answer**; the boxlist is not assumed cheap,
  and nothing may lock us into "the full listing is cheap to send with every refresh". No paging
  of the listing in the near term (a roadmap rule, not a library rule).
* **(e) The lock is one lane**: every lock goes through one method that coordinates consequences;
  it is checked after every async step and before anything is handed to the host.
* **(f) Bounds**: a passphrase salt at most 512 bytes, a passkey `credential_id` at most 1023, as
  defaults a host may raise with the guarantees loosening (recorded in the plan, thread 4).
* **(g) Names**: the horizons on one scheme, `{min,max}{Millis,Minutes}<What>` (plan, thread 4).

## 3. The lanes

Each lane is one piece of cached state (or one activity) with its own sources and its own rule
for taking an update. The rules are section 4's. Lanes interact only where this says; the lease,
the gate, the gating and the device record interact with the rest through `lock()` alone and are
left out.

**Lane 1, the cached vault+core.** Updated on:

1. a completed refresh: initiated on a timer; or lazily, when an operation names a maximum
   staleness since the last refresh; or at once, by naming zero;
2. the answer of any operation on the vault or on a box in it (every `VaultDB` answer carries
   the vault+core: a contract change, section 5);
3. a pushed update, via the subscription to the `VaultDB`;
4. a bank's vault list (*future work*).

Rule: section 4's single-thing rule on `vault_tok` and `vault_revseq`. It is light enough to carry
always; a PR that returns it only when changed is not ours to write. A box operation proceeds on
the cached vault+core as it stands within the timeliness bound (`maxMillisSinceRefresh`), which by
default is the polling interval and never itself refreshes mid-operation; a caller may ask a
tighter bound per operation.

**Timeliness is a staleness bound on the start of an operation and nothing more**: even at 0
there is a round trip, the seal, and the dispatch between the refresh and the write landing.
Correctness never rests on it. The server's compare-and-swap on `box_revtok` and on the vault's
expectation is what refuses a write made on a stale view.

**Lane 2, locked.** Updates synchronously, through the one lock method. Sources: `lock()`, the
expiry timer, a refusal policy that says lock (`identity_revoked`, `vault_behind`), a vault+core
arriving with a `gate_epoch` the lease does not fit (via `lock()`). Checked after every async step
of an operation, so at its start (the first step is the timeliness check) and before any data is
handed to the host. A lock never undoes or blocks a write already sent: the write lands or is
refused by the server; the lock governs only what this device hands out.

**Lane 3, the boxlist.** Held as a map by boxlabel of entries `{ box_revtok, box_revseq, alive |
tombstone, sparse fields }`. Updated on:

1. a refresh (a whole listing, tombstones included);
2. the answer of this device's own `putBox` or `delBox` (one entry: the box, or the tombstone, as
   the server stored it);
3. a push that carries entries.

Rule: section 4's per-entry rule. It settles the moment of the local update: an entry is applied
as its answer arrives, and only then. Never optimistically (a refused write would have to be
rolled back), never when sent, never deferred to the return to the host (the sparse entry is not
secret, and the lock does not forbid holding it). Read-your-writes for boxes falls out: the own
write's entry carries the seq the server verified, and no older listing can lower it. This
corrects the working assumption that only a refresh updates the listing: with independent,
counted entries, an operation's own answer is a sound source, and the one that gives
read-your-writes.

**Lane 4, refreshing: lazy and purposeful, which must stop being one thing.** A *lazy* refresh is
the timeliness check at an operation's start: it may join a refresh already running, since any
read within the bound serves it. A *purposeful* refresh is `refresh()`, or a push ring on a
backend whose push carries nothing: it must promise a read *issued after the call*, so it never
joins a run begun earlier (today's `oneAtATime` lets it; its doc block says so). Both apply their
answer through lanes 1 and 3. **What has to go: any coupling of an operation's completion to a
refresh.** A box operation waiting on a timely, unlocked state before it starts does not couple
the lanes, the operation has not begun. An operation's return triggering a refresh does, and is
worse than dangerous: it feeds a loop (refresh, snapshot, host, operation, refresh), it is
redundant on a push backend, and it was the shape of thread 2's reverted rework.

**Lane 5, push.** A source, not a store: a push carrying the vault+core feeds lane 1 directly; one
carrying entries feeds lane 3; a bare ring is a purposeful refresh (lane 4). A failed watch rings
once so the vault meets the trouble. Push order is not relied on: the merge rules order.

**Lane 6, operations in flight.** Several may run at once; nothing serializes them on the device.
Each is: timeliness check (lane 4, lazy), lock check (lane 2), read or seal, send, answer applied
(lanes 1 and 3), lock check, hand back. JavaScript makes each stretch between awaits atomic; the
merge rules make the order of arrival irrelevant. Two writes to one box are arbitrated by the
server; the loser refuses `stale_write` and carries what won (section 6).

## 4. Versioned reads and updates, with tombstones

**Every stored thing carries a tok and a seq.** The tok is random and only ever compared; the seq
is a count and ordered. `vault_revtok` / `vault_revseq` for the vault+core (today `vault_tok` /
`vault_epoch`); `box_revtok` / `box_revseq` for a box (today `revision_tok`, plus a count). A box's
seq continues through its tombstone, as the vault's does through its tombstone: a box made anew
under a boxlabel that was deleted carries the tombstone's seq plus one.

**Every write is a compare-and-swap** (CAS, named here once): the writer names the tok and seq it
is writing over (none, for a new thing), and the server lands the write only while that is what is
stored, in the same atomic step. Otherwise the server writes nothing and answers what is stored
now. Nothing a client sets orders anything: the server verifies every tok and seq. The seq a
writer proposes is the base's plus one; the tok it proposes is fresh. "Store-assigned" means
client-proposed, store-verified.

**`box_revseq` is stamped**, as every visible field of a box is (`BoxStamp` = `BoxSparse` +
`vault_tok`): a stored field left out of the stamp would be shown but not bound (STYLE.md,
*Validation*). That is why the seq must be known at the seal: under CAS it is, the base's plus one.
Consequence: the base is fixed at the seal, not at the send; the window between them is the
crypto, tens of milliseconds.

**The single-thing rule** (the vault+core, and any one box held whole): take an arriving copy when
its tok is the one held and its seq is not below the one held; drop a lower seq; a different tok,
or none where one was held, means the thing was deleted or made anew (for the vault, the Vault
object is gone or remade).

**The per-entry rule** (the boxlist): take an arriving entry, alive or tombstone, when its
`box_revseq` is not below the one held for that boxlabel; a boxlabel never seen is taken as it
comes. **Absence from a listing removes nothing: only a tombstone does.** So a listing read before
a put cannot erase the box the put landed, and a listing read before a delete cannot revive what
the delete's tombstone removed. Whatever order answers arrive in, from whichever tab, device or
in-flight call, each entry only moves forward.

**Tombstones** carry the boxlabel, the tok and seq of the deletion, and nothing of the former
contents. Lifetime: permanent is the simple answer and the default; compaction is a custodian's
policy (ours as a package, or boilerplate for an agent to write), never the core's concern.

## 5. What this asks of the storage contract (for thread 2b, and after)

* Every `VaultDB` answer carries the vault+core: `getBox`, `putBox`, `delBox`, `getCapacity` beside
  `getVault`, `ensureVault`, `putVaultRecord`; the push callback too where the backend can.
* Boxes carry `box_revseq`, verified by the store, continued through a tombstone; `delBox` writes
  the tombstone and answers it; a listing includes tombstones.
* Line 2.1 of VAULTDB.md (a resolved write is seen by every later read) is what the session
  guarantees rest on. A proxy (GraphQL over a replica) that breaks it makes a landed write look
  undone; the vault cannot tell for the boxlist and locks for the vault+core (`behind`). Say so
  beside 2.1, addressed to proxy authors; the battery's 2.1 test is the check.

## 6. The box write, split (the orchestrator's position, 2026-10-28, for the Coach)

* **One `putBox` becomes several verbs, each one scenario, no branches on what was left out.**
  Today one method handles, by branching: whether the listing shows the box or not; whether a
  read finds it or not; and for each of sidecar and whisper, given, left out, or known from the
  read, three or so combinations each, multiplied; and writes over a damaged box as new in one of
  those paths and refuses in the other (the Coach: "it's even worse than you describe"). The shape
  wanted instead: a `doPutBox` that handles the write and nothing else; called by a
  `sealAndPutBox` that captures its metadata from a timely best guess of the most recent sparse
  box; and a timely-refresh primitive on the box itself, so "the freshest sparse box I may hold"
  is one mechanism, not a branch per caller. Split, with names for the Coach to settle:
  `putBox(props, whisper)`, whole, both given, create or replace over the listed base, no read,
  allowed over a box listed damaged (a whole write vouches for everything it writes);
  `putSidecar(boxlabel, sidecar)`, reads the box, opens it (which proves the whisper and the old
  sidecar unaltered), reseals with the whisper kept, refuses `damaged_box` or `absent_box`;
  `putWhisper(boxlabel, whisper)`, reads, opens to prove the sidecar, reseals with the sidecar
  kept, the same refusals. The steps under them are each one private: base from the listing;
  fetch and open; seal; send; apply the answer to lanes 1 and 3; the lock check and the hand-back.
* **At most one of several concurrent writes to one box lands.** Each reads the same base from
  the listing (or from its own read), seals over it, and the server's CAS lets one through; the
  rest refuse `stale_write` carrying the box that won (or its tombstone). That is so today and is
  correct optimistic concurrency; concurrent writes to different boxes all land. The core adds no
  queue and no retry. Outside the core, two helpers are reasonable: a per-boxlabel serializer (a
  widely used one, `p-limit` or `p-queue` with concurrency 1 per key, in the React package or a
  `safebyok-helpers`), and a retry policy that re-reads and re-applies a `putSidecar` or
  `putWhisper` over the winner, which is a merge policy and therefore the host's.

## 7. The session guarantees, in plain words

Each is a promise about what one device sees, in the order it sees it. The server's single line
of writes per vault (section 2a) is what makes them cheap to keep; section 4's rules are how. Each
names the test that pins it.

* **Read your writes.** Once this device's write resolves, every later read on this device shows
  it: a box put is in the listing and reads back; a box deleted is gone and does not come back.
  *Test:* put then delete, with a refresh in flight across both; the snapshot ends with no box.
* **Monotonic reads.** This device never shows an older state after a newer one: no answer
  arriving late, from a read issued early, moves the picture backwards, for the vault+core or for
  any one box. *Test:* two refreshes issued in order, answered out of order; the picture is the
  later's.
* **Writes follow reads.** A write this device makes after seeing a state lands after that state
  in the server's order, or is refused: it never lands "underneath" what it was based on. CAS on
  the base's tok and seq is the whole mechanism. *Test:* a write over a base another device has
  replaced refuses `stale_write`, carrying the replacement.
* **Monotonic writes.** This device's own writes land in the order it made them, or the later one
  is refused: a second put over the first's answer never lands before the first. Each write
  names the previous as its base, so CAS gives this too. *Test:* two sequential awaited puts; the
  stored box is the second's and carries the second's seq.

What is **not** promised: that this device shows another device's write at any particular moment
(the boxlist may lag; the vault+core lags at most one push or refresh); that two devices writing
without seeing each other agree on who was first before the server says; that a backend which
breaks VAULTDB.md 2.1 lets the vault keep any of the four for the boxlist.

## 8. Open, not blocking

* Whether `gate_epoch` folds into `vault_revseq` or stays beside it. It is bound into the lease and
  wayin stamps, so it is a cryptographic fact first; the orchestrator's call is that it stays.
* The push payload for Postgres: the scope today; the vault+core fits NOTIFY under the bounds in
  2(f); whether to send it, or read on the ring, is thread 2b's.
* A `served_at` from the server on each answer: cheap, good for display and debugging, kept out
  of the ordering path.

## 9. The Storeable base class (the Coach, 2026-10-28: the next sprint, `storeable_base`)

A client-side base class for a thing cached from storage, broken out of `vault.ts`, implementing:

* a revision token and seq (section 4), and the single-thing and per-entry rules;
* a lazy `oneAtATime` refresh, and a purposeful one that promises a read issued after the call
  (lane 4);
* a timed refresh trigger;
* a subscription (lane 5);
* a sparse listing (lane 3);
* a snapshot, exposed as `useSyncExternalStore` wants it;
* `#doGet`, `#doPut`, `#doDel` facades over the `VaultDB`, establishing the guarantees of
  section 7 and nothing else;
* a defined flow of steps within `.put`, `.get`, `.del` and `.ensure` that subclasses hook into
  (a default no-op `doSealForWrite()` step, say): timeliness, lock check, base, seal, send, apply,
  lock check, hand back (lane 6).

Built **independently of box and vault**, against its own contract and tests, and matched to them
only once that contract is tight. Breaking it out of the vault is its own win; stating its
guarantees in isolation is what lets an agent tell an unforeseen inconsistency from a foreseen
non-guarantee. The sprint `gripeoween_vault` is cancelled in its favour (its progress file says
what was filed); too many of the gripeoween todo rows point here.

## 10. Illustrations of what the library does not guarantee, and what to do about it

**TODO.** Not filled in yet; agents, do not fill it in on the way to something else. For now, what
section 7 says is not promised: that this device shows another device's write at any particular
moment (the boxlist may lag; the vault+core lags at most one push or refresh); that two devices
writing without seeing each other agree on who was first before the server says; that a backend
which breaks VAULTDB.md 2.1 lets the vault keep any of the four guarantees for the boxlist.
