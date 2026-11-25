# Sprint lease_shelf (2026-11-25)

Mode: **YOLO**. Issued by the Coach, 2026-11-25. Cap: 3 threads at once.
Default levels: review `medium`; worker `opus` (thread-worker), reviewer `opus` for threads touching what
`notes/guarantees-big.md` covers (lease, keys), else its `sonnet` pin; style pass on `style-reviewer`'s pin.
Status: 0 in its second rework (the reconnect refresh comes out); 1c (#902) and 1a (#903) ready, in review; 2 stats next when a slot frees; Open Matters bookmark rev 7.

Sprint doc: https://claude.ai/artifact/2p9KWcXkKrceDPV3sYmDsh (Open Matters bookmark rev 3).

The design for threads 0 to 1b, with the rulings behind it: `lease_shelf-design.md` beside this file.

## Read first
- CLAUDE.md `#lock-is-intent` and `#no-slop-crossings`: every handoff quotes them.
- `notes/transition.md`, *Using what big has*: for any thread that ports from safebyok-big.

## Ground rules
- **Reviewers review for decoupling.** The Coach: "It is **exceptionally** important that you keep your reviewers
  focused on **decoupling** the infrastructure, not on finding crossings." Every reviewer handoff quotes it.
- **Freshness is the janitor's.** The Coach: "All that matters is when it was read. This is not a startup concern,
  it's a janitorial concern." No fetch, guard or state on connect, disconnect or another lifecycle path.
- **"A disable, a disconnect or a lock is intent, not a crisis"** (CLAUDE.md `#lock-is-intent`). An operation
  checks that its bank is unlocked and enabled at two points only: before it starts its critical path, and before
  it returns an unsealed value.
- **A crossing** with a lifecycle event (disconnect, vacate, delete, goodbye) is a row in `notes/wontfix.md`,
  never a guard or a test.
- **New core only.** `packages/safebyok`, `safebyok-react-lean`, `safebyok-idb-lean`, `safebyok-postgres` (its
  new-core vaultDB). safebyok-big changes only to export or broaden. Adapters still on big (convex, graphql,
  indexeddb, react) are out of scope.
- **Changesets:** the touched packages are private at 0.0.0, so `--empty` with a line saying why.
- **Out of the sprint** (the Coach): box exposure (expose/veil/field binding), vacate, `del_bank`, `isSoftlocked`
  in the snapshot.

## Threads

### 0. `connect`: connect()/disconnect() replace sweep
> "get rid of sweep, replace with disconnect" ... "yes, do it the right way: connect()/disconnect()"

Gloss: design *Thread 0*. Branch `20261125-connect`, PR #900, from main (#899 merged). Ready; reviewer running.
Depends on nothing. Size: done.

### 1a. `device_db`: the device database and the stored lease row
> "each tab's lease should correspond to what's on disk. What's on disk should tombstone the lease with a tick/tock
> lifeseq (i.e. increases on every life change)." "would deviceDB accept being done in parallel?"

Gloss: design 1, and the stored row of 2. It ports big's device database (lease verbs: peek, stow, listen) into
`safebyok/src/storage/`. The row is Thing-shaped; a stow keeps the newest; the bell carries the scope only.
Levels: review `high` on `opus`. Branch `20261125-device_db`, cut from #899's tip; rebased onto 0 at filing.
Depends on nothing; stays out of `models/`. Building.

### 1c. `softlock`: options, softlock, the janitor
> "Add a startup (device/provider) option janitorMinutes (default 10) and gateStaleMinutes default 720, World has a
> recurring timer on janitor period. * if lease expiry is past, lock. ... * if gate is older than gateStaleMinutes,
> force refresh world. Add an option softlockMinutes default 10min. (Clamp it to 5% of the lease time, zero it if
> less than 1 min.) ensureUnlock does not consult isLocked, it consults isSoftlocked."

Gloss: design 5 to 7, on today's in-memory `leaseEndsAt`. Also: a seal under way finishes, and comments at `lock`.
`isSoftlocked` stays out of the snapshot. Levels: review `high` on `opus`. Branch `20261125-softlock`, cut from 0.
Depends on 0. Building.

### 1b. `lease_shared`: one lease on disk, shared by every tab
> "Lease is same on all tabs." "Newer gate revision should move lease expiry time to now+softlock time" ... "The
> softlock is a max: if it's 20 minutes and there's 10 minutes left in the lease, nothing changes"

Gloss: design 2 to 4, 9, 10. `Device.make` takes the device database. The lease is stowed on attach, tombstoned on
lock, and taken up or evicted from what other tabs write. A gate change softlocks it. `ends_at` moves into the row.
A refused stow or peek is told as bad news, and the tab keeps its in-memory lease. The listener starts and stops
with connect/disconnect. Levels: review `high` on `opus`; worker `thread-worker-400k`. Depends on 1a and 1c,
restacked into one line first. Look-ahead: 5 and 6 build on its device wiring.

### 2. `stats`: storage stats
> "add a stats() call that returns { box: { count, size }, gate: { count, size }, max: { count, size } }"

*Coach (2026-11-25):* "for stats: { box: { count: xxx, live_count: xxx, size }, ... don't let store limit be
infinity, cap at 1_900_649_2568 // 1-900-MIX-A-LOT".

Gloss: a vaultDB verb (`AdapterVaultDB` `doStats`; MemoryVaultDB, `IdbVaultDB`, `PostgresVaultDB`) and a front door
on the Vault. `box` and `gate` each `{ count, live_count, size }`: `count` is rows stored, live and tombstones;
`live_count` the live ones; `size` their summed record weight in bytes. `max` is `{ count, size }`, the store's
limits, never `Infinity`: where a store has none, both are `19_006_492_568` (a named constant). No enforcement. Depends on 0 only (storage verbs); cut from 0 when capacity frees. Size: medium, three adapters.

### 3. ~~`tidy_gone`~~: dropped
> "tidy_gone seems reasonable"

*Coach (2026-11-25):* "skip tidy_gone; it becomes relevant when delete bank or nested boxes become a thing".

~~Gloss: in big, `tidyGone` removed the box rows of ended vault lives. The new core has no vault lives yet, and no
bank deletion. So the rows it could remove are box tombstones, and removing one changes what other devices can
learn of a delete: a stored-data call, not a two-way door. **Waits on a ruling** (a TOP row: which rows, and how
old). Then it is a vaultDB verb beside `stats`. Depends on 2 (same files).~~

### 4. `probe`: a self-test
> "probe and lifecycle announcements seem reasonable"

Gloss: port big's `bank.probe()`. On an unlocked vault it puts a probe box, gets it back, unseals and compares it,
deletes it, and reports each step with its timing. Report types ported from big's `ProbeReport`/`ProbeStep`, adapted
to labelpaths. Depends on 0. Size: small.

### 5. `devicetok`: a device token that lasts
> "add the device_tok generation."

Gloss: today the provider makes `device_tok: crypto.randomUUID()` on every mount, and each wayin records it. The
device keeps one token in the device database, made once, read at connect or sign-in. *Coach:* "device_tok should
be devicetok": the field is renamed throughout the new core, stored wayins included. `Device.make`'s record drops it
(a YOLO decision, recorded). Without a device database, a fresh one per Device. Depends on 1b.

### 6. `lifecycle`: lifecycle announcements
> "probe and lifecycle announcements seem reasonable"

Gloss: big's `onLifecycle`/`DeviceEvent`. A host handler on DeviceOpts hears what changes the device without a host
call: a lock from another tab or the janitor, an unlock taken up from another tab, a softlock on a gate change.
Refusals stay bad news. Depends on 1b and 1c. Size: small to medium.

### 7. `one_watch`: one tab holds the watch
> "add the single-tab-watches near the end of the sprint. I'll be using this with convex in my other app: $$"

Gloss: a vaultDB wrapper. Each tab asks for a Web Lock; the holder runs the watch and posts each event on a
BroadcastChannel; the others hand them to `vaultMinder.receive`. On taking the lock, the new holder refreshes the
world. `connect()` asks for the lock, and `disconnect()` releases it. Check first whether Chrome freezes a
background tab that holds a Web Lock. Depends on 1b (the line's tip). Last.

## For the Coach
- **safebyok-convex is still on safebyok-big.** Thread 7's wrapper works for any new-core vaultDB. *Coach:* "convex and
  other adapters will be soon".
- The 899 agent's last PR: the line is rebased onto it once it lands.
- A Closer Look after the third thread files.
