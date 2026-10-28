# gripeoween_vault: consistency, the consensus so far

The Coach and the orchestrator, in chat, 2026-10-28, from the question "what does `putBox` do, and
why did a deleted box come back" (thread 2's review). Kept by the orchestrator; threads look here
for the direction and never write it. Terms of this document, not of VOCABULARY.md: **vault+core**
is the vault record, its gate, and any light context that fits in 2 kB serialized; **boxlist** is
the listing of boxes; **vault+boxlist** both; **box** a box, its sidecar and its ciphered whisper.

## 1. What the library is for, in one paragraph

To serve a record, the library must combine what only the user bears (the passphrase), what only
the central DB holds (the vault, the boxes), and what arrives from other tabs and devices, under
two constraints: the user is re-asked for credentials about once a day to once a week, and a lock
must stop reads at once yet never leave the host a state that is inconsistent or ambiguous. The
program therefore reconciles concurrent assertions of truth from the device store, the central DB,
the cached copy of it, this device's own reads and writes, other tabs, other devices and the user.

## 2. Consensus

* **(a) The model is the session guarantees** (Terry et al., Bayou, 1994): *read your writes*,
  *monotonic reads*, *writes follow reads*, *monotonic writes*, for each device's view of a store
  that is linearizable per vault (the server's transaction is the one place writes meet). Across
  devices that is causal consistency, the server the serializer. These four are what the tests pin.
* **(b) Boxes are independent, each versioned by a count, and a delete leaves a tombstone.** Every
  stored thing carries a tok (compared) and a seq (ordered), store-assigned: `vault_revtok` /
  `vault_revseq` for the vault+core (today `vault_tok` / `vault_epoch`), `box_revtok` / `box_revseq`
  for a box (today `revision_tok`, plus a count). A box's seq continues through its tombstone, as
  the vault's does through its tombstone. **No listing-wide order**: no counter bumped by every box
  operation. A future need to order boxes against each other (a blob across boxes) is a simpler
  problem than that, and not contemplated now.
* **(c) The flow is too complicated.** Order is reconstructed today from five mechanisms
  (`vault_epoch`, `gate_epoch`, random `revision_tok`, the local `#leasesHeld` count, the local
  `#refreshedAt` clock) with a `#demandAfterWait` after every await. The direction is one merge rule
  per cached thing, applied at each resumption, and the lanes below kept apart.
* **(d) The vault+core is light and travels on every answer**; the boxlist is not assumed cheap, and
  nothing may lock us into "the full listing is cheap to send with every refresh". No paging of the
  listing in the near term (a roadmap rule, not a library rule).
* **(e) The lock is one lane**: every lock goes through one method that coordinates consequences;
  it is checked after every async step and before anything is handed to the host.
* **(f) Bounds**: a passphrase salt at most 512 bytes, a passkey `credential_id` at most 1023, as
  defaults a host may raise with the guarantees loosening (recorded in the plan, thread 4).
* **(g) Names**: the horizons on one scheme, `{min,max}{Millis,Minutes}<What>` (plan, thread 4).

## 3. The lanes

Each lane is one piece of cached state (or one activity) with its own sources and its own rule
for taking an update. Lanes interact only where this says; the lease, the gate, the gating and
the device record interact with the rest through `lock()` alone and are left out.

**Lane 1, the cached vault+core.** Sources: a completed refresh (lazy or purposeful); the answer
of any operation on the vault or on a box in it (every `VaultDB` answer carries the vault+core: a
contract change); a push; in future a bank's vault list. Rule: take it when its `vault_tok` is the
one held and its `vault_revseq` is not below the one held; a different `vault_tok` or none makes
the Vault object remade or gone; a lower seq is dropped. It is light enough to carry always; a PR
that returns it only when changed is not ours to write. A box operation proceeds on the cached
vault+core as it stands within the timeliness bound (`maxMillisSinceRefresh`), which by default
is the polling interval and never itself refreshes mid-operation; a caller may ask a tighter
bound per operation. **Timeliness is a staleness bound on the start of an operation and nothing
more**: even at 0 there is a round trip, the seal, and the dispatch between the refresh and the
write landing. Correctness never rests on it. The server's compare-and-write on `box_revtok` and
on the vault's expectation is what refuses a write made on a stale view.

**Lane 2, locked.** Updates synchronously, through the one lock method. Sources: `lock()`, the
expiry timer, a refusal policy that says lock (`identity_revoked`, `vault_behind`), a vault+core
arriving with a `gate_epoch` the lease does not fit (via `lock()`). Checked after every async step
of an operation, so at its start (the first step is the timeliness check) and before any data is
handed to the host. A lock never undoes or blocks a write already sent: the write lands or is
refused by the server; the lock governs only what this device hands out.

**Lane 3, the boxlist.** Held as a map by boxlabel of entries `{ box_revtok, box_revseq, alive |
tombstone, sparse fields }`. Sources: a refresh (a whole listing, tombstones included); the answer
of this device's own `putBox` or `delBox` (one entry, the box or the tombstone as the server stored
it); a push that carries entries. Rule, per entry: take an entry whose `box_revseq` is not below the
one held; **absence from a listing removes nothing, only a tombstone does**. So the moment of the
local update is settled by the rule, not by choice: an entry is applied as its answer arrives, and
only then. Never optimistically (a refused write would have to be rolled back), never when sent,
never deferred to the return to the host (the sparse entry is not secret, and the lock does not
forbid holding it). Read-your-writes for boxes falls out: the own write's entry carries the seq
the server assigned, and no older listing can lower it. This corrects the working assumption that
only a refresh updates the listing: with independent, counted entries, an operation's own answer
is a sound source, and the one that gives read-your-writes.

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
server's compare-and-write; the loser refuses `stale_write` and carries what won.

## 4. What this asks of the storage contract (for thread 2b, and after)

* Every `VaultDB` answer carries the vault+core: `getBox`, `putBox`, `delBox`, `getCapacity` beside
  `getVault`, `ensureVault`, `putVaultRecord`; the push callback too where the backend can.
* Boxes carry `box_revseq`, store-assigned, continued through a tombstone; `delBox` writes the
  tombstone and answers it; a listing includes tombstones. Tombstone lifetime: permanent is the
  simple answer and the default; compaction is a custodian's policy, ours as a package or as
  boilerplate for an agent, never the core's concern.
* Line 2.1 of VAULTDB.md (a resolved write is seen by every later read) is what the session
  guarantees rest on. A proxy (GraphQL over a replica) that breaks it makes a landed write look
  undone; the vault cannot tell for the boxlist and locks for the vault+core (`behind`). Say so
  beside 2.1, addressed to proxy authors; the battery's 2.1 test is the check.
* Nothing the client sets orders anything: every tok and seq is the store's.

## 5. Open, not blocking

* Whether `gate_epoch` folds into `vault_revseq` or stays beside it. It is bound into the lease and
  wayin stamps, so it is a cryptographic fact first; the orchestrator's call is that it stays.
* The push payload for Postgres: the scope today; the vault+core fits NOTIFY under the bounds in
  (f); whether to send it, or read on the ring, is thread 2b's.
* A `served_at` from the server on each answer: cheap, good for display and debugging, kept out
  of the ordering path.
