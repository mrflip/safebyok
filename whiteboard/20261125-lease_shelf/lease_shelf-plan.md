# Sprint lease_shelf (2026-11-25)

Mode: **YOLO**. Issued by the Coach, 2026-11-25. Cap: 3 threads at once.
Default levels: review `medium`; worker `opus` (thread-worker), reviewer `opus` for threads touching what
`notes/guarantees-big.md` covers (lease, keys), else its `sonnet` pin; style pass on `style-reviewer`'s pin.
Status: done (2026-11-25). Merged: #904, #900, #902, #903, #907, #908, #909, #912, #915, #910, #906, #905, #911, #924, then the last line #927, #926, #925, #928, #901. The closing PR: #929 (14 watch_ended, with these notes). Done note: human/20261125-sprint_lease_shelf_done.md.

Sprint doc: https://claude.ai/artifact/2p9KWcXkKrceDPV3sYmDsh (Open Matters bookmark rev 3).

The design for threads 0 to 1b, with the rulings behind it: `lease_shelf-design.md` beside this file.

## Read first
- CLAUDE.md `#lock-is-intent` and `#no-slop-crossings`: every handoff quotes them.
- `notes/transition.md`, *Using what big has*: for any thread that ports from safebyok-big.

## Ground rules
- **Reviewers review for decoupling.** The Coach: "It is **exceptionally** important that you keep your reviewers
  focused on **decoupling** the infrastructure, not on finding crossings." Every reviewer handoff quotes it.
- **Readability and simplicity first** (the Coach): shallow branching; short call chains across few files; plain
  names, never `held`, `kept`, `entry`, `row`, `checked`; no over-DRY indirection; important methods and clauses on
  their own lines, named for their purpose. Reviewers check exactly this (`.claude/agents/thread-reviewer.md`, *What
  to look for*); every worker handoff quotes it.
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

Gloss: design *Thread 0*. Branch `20261125-connect`, PR #900, from main (#899 merged). Filed, out of draft.
Depends on nothing. Size: done.
*Review:* first review flagged that a reconnect left the roots unrefreshed; a YOLO fix added a fetch on connect, and
the Coach overruled it ("concurrency machinery and does not belong"), so a second rework removed it and added
`disable()`. The second review fixed a stale changeset clause, two doc blocks and four test titles. Left: `disable()`
throws big's refusal phrased "a sweep or a vacate"; device verbs after disable; VOCABULARY's "A vacate disables".

### 1a. `device_db`: the device database and the stored lease row
> "each tab's lease should correspond to what's on disk. What's on disk should tombstone the lease with a tick/tock
> lifeseq (i.e. increases on every life change)." "would deviceDB accept being done in parallel?"

Gloss: design 1, and the stored row of 2. It ports big's device database (lease verbs: peek, stow, listen) into
`safebyok/src/storage/`. The row is Thing-shaped; a stow keeps the newest; the bell carries the scope only.
Levels: review `high` on `opus`. Branch `20261125-device_db`, PR #903, cut from #899's tip; files onto 1c.
Depends on nothing; stays out of `models/`. Reviewed.
*Review:* `high` on opus, fixed: banner and local names, shapes moved to `shapes/shapes-device-db.ts`, `listen` maps a
throw to `storage_unavailable` as its siblings do, vocabulary words, and a missing G4 drift (rows peeked by bank
scope alone). Left: a documentarian pass on `device-db.ts` and `StampChecks` after 1b; `scopepathOf` and
`LeaseScopepath` to export from `safebyok/browser` in 1b.

### 1c. `softlock`: options, softlock, the janitor
> "Add a startup (device/provider) option janitorMinutes (default 10) and gateStaleMinutes default 720, World has a
> recurring timer on janitor period. * if lease expiry is past, lock. ... * if gate is older than gateStaleMinutes,
> force refresh world. Add an option softlockMinutes default 10min. (Clamp it to 5% of the lease time, zero it if
> less than 1 min.) ensureUnlock does not consult isLocked, it consults isSoftlocked."

Gloss: design 5 to 7, on today's in-memory `leaseEndsAt`. Also: a seal under way finishes, and comments at `lock`.
`isSoftlocked` stays out of the snapshot. Levels: review `high` on `opus`. Branch `20261125-softlock`, cut from 0.
Depends on 0. Reviewed; filing.
*Review:* `high` on opus, fixed. It moved the janitor's start and stop into their own section, corrected
`dismissUnlock`'s doc, and made two style fixes and four title cuts. Seal and unseal held against the guarantees.
Left (doc rows): autolock runs only while connected; the World decodes the minder's `read_tc`; the janitor is
private to its timer.

### 1d. `lease_thing`: the stored lease is a Thing-shaped LeaseRecord
> "What would it cost us to make it Thing-shaped enough for Record<Lease> and Tombstone<Lease | LeaseRecord> to work?
> It's being stored, after all." "Either way Lease, LeaseRecord and LeaseTombstone are apposite; peekLease and
> stowLease, etc"

Gloss: the stored `LeaseRecord` carries every Thing sparse field, as a union on `am` (live: stamp, keys, `ends_at`,
`gate_revseq`; tombstone: Thing fields only); `LeaseTombstone` is `TombstoneOf<LeaseRecord>`; "row" leaves every
lease name; `Lease` is the model over `LiveOf<LeaseRecord>`; `Proving.buildLease` takes the stored lease it follows.
The wrap stays bound to the stamp alone. `'lease'` stays out of `Thingkind`. Levels: worker `thread-worker-400k` on
opus; review `high` on opus. Depends on 1a. PR #907. Reviewed; filing.
*Review:* `high` on opus, fixed: test tables realigned, `stowLease`'s local `lease` → `leaseRecord`, a `Scaffolding:` comment on the gate's `renewal() ?? Lease.shellOf(this)` fallback (1b removes it), two doc blocks. G3, G4, G8, G9 hold; ctx bytes unchanged. Left (minor): `leaseLabelpathOf`/`scopepathOf` exported unchecked (a row); `isOfItsGate`'s type literal; `storedLeaseOf`/`leaseOf` return records; `makeNextRecord` accepts a later `ends_at`; VOCABULARY's *lease* entry says "lives only in memory" (1b).

### 1b. `lease_shared`: one lease on disk, shared by every tab
> "Lease is same on all tabs." "Newer gate revision should move lease expiry time to now+softlock time" ... "The
> softlock is a max: if it's 20 minutes and there's 10 minutes left in the lease, nothing changes"

Gloss: design 2 to 4, 9, 10. `Device.make` takes the device database. The lease is stowed on attach, tombstoned on
lock, and taken up or evicted from what other tabs write. A gate change softlocks it. `ends_at` moves into the row.
A refused stow or peek is told as bad news, and the tab keeps its in-memory lease. The listener starts and stops
with connect/disconnect. Levels: review `high` on `opus`; worker `thread-worker-400k`. Depends on 1d (on 1a, on 1c). Cut from 8. PR #909, ready; in review. *Coach:* a disconnect "should not [lock], it's just for unmount. Vacate delete and lock cause lock" (disable() drops this tab's copy too); "File it by gate" (keyed by the lease's own scope, `lease/<gate label>`); lifepath `0000000000/<lifeseq>`. Look-ahead: 5 and 6 build on its device wiring.

### 2. `stats`: storage stats
> "add a stats() call that returns { box: { count, size }, gate: { count, size }, max: { count, size } }"

*Coach (2026-11-25):* "for stats: { box: { count: xxx, live_count: xxx, size }, ... don't let store limit be
infinity, cap at 1_900_649_2568 // 1-900-MIX-A-LOT".

Gloss: a vaultDB verb (`AdapterVaultDB` `doStats`; MemoryVaultDB, `IdbVaultDB`, `PostgresVaultDB`) and a front door
on the Vault. `box` and `gate` each `{ count, live_count, size }`: `count` is rows stored, live and tombstones;
`live_count` the live ones; `size` their summed record weight in bytes. `max` is `{ count, size }`, the store's
limits, never `Infinity`: where a store has none, both are `19_006_492_568` (a named constant). No enforcement.
*Coach (2026-11-25), on a store limit of 0:* "continuing to operate with a limit of 0 is surprising behavior. In the notes/sizings file, take the size of a single medium box, plus the world record, add 50% again and round up to the nearest 1000 bytes. A quota less than 2 or that size should refuse at start." *Orchestrator (YOLO calls):* the floor is 5,000 bytes (medium box 1,087 + gate 1,029 + root box 566 from `notes/reference-sizes.md`, which sizes no bank record; ×1.5, rounded up); a quota below twice that, 10,000, refuses `storage_blocked` when IdbVaultDB first opens its database. A rework after the review. *Coach, correcting that reading:* "less than 2 or that size -- meaning, you must allow two boxes and 5000 bytes or we can't help you." Amended on #905: the floor is two boxes and 5,000 bytes, in the store-limit shape and at IdbVaultDB's open.
*Review:* `medium` on opus, fixed: isVaultMinder's member list (outside the diff, kept), the `stats()` example, `FiledRaw` moved to shapes, a doc block, a chai form. Left (minor): idb-lean `Filed` duplicates `FiledRaw` (Cleanup); `quotaNow` readability (taste); mechanism-walking doc blocks with their `doGetWorld` siblings (documentarian). Depends on 0 only (storage verbs); cut from 0 when capacity frees. Size: medium, three adapters.

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
to labelpaths. Depends on 0. Size: small. Branch `20261125-probe`, PR #906, cut from 1c. Reviewed; in rework.
*Review:* `medium` on opus, flagged: the get step trusted the minder's newest record, not storage's answer, so storage that dropped the write still passed (carried from big). YOLO rework: check storage's answer; `ProbeAsked` → `ProbeArgs`. Fixed: a doc block (a refused probe leaves its box), `timedStepOf` → `timeStep`, two titles. Left (minor): put timing includes `#donorAt`'s get; generic step message and one thrower for every kind (recorded, with the Coach).

### 5. `devicetok`: a device token that lasts
> "add the device_tok generation."

Gloss: today the provider makes `device_tok: crypto.randomUUID()` on every mount, and each wayin records it. The
device keeps one token in the device database, made once, read at connect or sign-in. *Coach:* "device_tok should
be devicetok": the field is renamed throughout the new core, stored wayins included. `Device.make`'s record drops it
(a YOLO decision, recorded). Without a device database, a fresh one per Device. Cut from 1b (`thread-worker-400k`); building. *Coach (2026-11-25):* "the host may want to set it, if given one use it": an optional `devicetok` on DeviceOpts wins over the stored or made one. Depends on 1b.

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

### 8. `janitor`: the janitor's rulings, and freshness on reconnect
> "ok you can also have the janitor check watches" · (autolock only while connected) Rec taken: "start the janitor at
> sign-in, and have it re-read the gate only while connected." · "yes. Add comment there confirming that autolock is a
> best-effort quota not a hard boundary" · "car and thing can provide a readAt getter" · on items invalidated on
> reconnect: "doesn't it have every sparse record in its delta? We will later have something trigger the listing, which
> invalidates only the boxes that need listing. ... Remember how slowly everything changes vs. time from mount to unmount"

Gloss: the janitor starts at sign-in and runs until the device is disabled; while not connected it only locks past the
lease's end; while connected it also re-reads a stale gate and retries a watch that is not running (a refusal is bad
news). A `//` comment at the autolock says it is a best-effort time, not a hard boundary. A `readAt` getter on the car
and the Thing, used by the janitor and root-shelf, so the World no longer decodes `read_tc`. `VaultTSQ.connect`
invalidates listings and roots, not items (the listing's sparse records already mark a moved item cold through
VaultMinder). World.connect's doc block says a call after a failed watch retries it. The janitor stays in World, in
its own section (the Closer Look's E4 is open). Levels: review `medium` on opus. Branch `20261125-janitor`, cut from
1a's tip. Depends on 1c; beside 1d; 1b builds on both at the restack. Size: medium. PR #908, ready; in review. No car `readAt` (the Thing's `read_at` serves).

### 9. `pg_read_tc`: Postgres mints read_tc
> "Postgres does not take it from the database -- would you fix that? Pg should be able to make the uuid v7 directly"

Gloss: PostgresVaultDB takes `read_tc` from Postgres 18's built-in `uuidv7()`, in the statement that reads the rows,
not from the client's `readTcNow()`; its watch too. README: Postgres 18 or later. Memory and IndexedDB keep minting
locally. Levels: worker opus medium; review `medium`. Branch `20261125-pg_read_tc`, cut from 2 (#905). Building.

### 10. `car_read_at`: one read time, on the car

The Coach: "would you make it read_at for consistency, and yes let's put the bookkeeping together. All the boxes ticked"

`ThingCar` gains `read_at`, decoded from its `read_tc` (0 with no record), and every time sum on a read_tc reads it: World's `#isGateStale`, VaultTSQ's `initialDataUpdatedAt` and the dating of heard items; `setDataOptionsOf` goes. Behind it: "what matters is when the ground truth was consulted. You don't have control over the device clock. read_tc is set by the backing store and carried thru after." Small; core only. Review `medium`, sonnet. Depends on 9.

### 11. `lease_names`: the lease names itself; one devicetok per user

The Coach's rulings, from the last sweep: "everything lease-y should be at lease/label (where label happens to match the gate), referencing it own label"; on the devicetok, "We'd prefer it to be per user+browser, there is already a banktok"; and on a lease citing a newer gate revision, "it can't overwrite, though, yes? -- is there a test for that?"

A lease carries and reads its own `lease/<label>` instead of deriving it from the gate's at each use; the devicetok is keyed by the user alone; a test shows a lease citing a newer gate revision leaves the stored gate unchanged. Depends on 10. opus worker; review `medium`.

### 12. `set_stage`: the world inscribes and announces each stage crossing

The Coach: "let's have it log each of the stage crossings with a #setStage method that inscribes and announces"; and on a host's own passphrase change announcing `softlocked` in its own tab, "if it works out in the end add to wontfix".

A private `#setStage` on World records and announces a crossing; a default lifecycle handler logs; a wontfix row. Depends on 10. sonnet worker; review `low`.

### 13. `watch_recovery`: a lost watch lock is asked for again

The Coach: "yes do your fix for the lock loss"; and on the lock's name, "it should be named for safebyok, userid and bank's labelpath".

When the watch-holding tab's watch fails to start, OneWatchVaultDB tells its minder, so `isWatching` goes false in every tab and the janitor's retry asks for the lock again; tested in the failing case. The Web Lock and BroadcastChannel are named for safebyok, the userid and the bank's labelpath. Split from 11 by the sizing rule. Depends on 10. opus worker; review `medium`.

### 14. `watch_ended`: the device announces a watch that ends of itself

The Coach, on `VaultDB.watch` gaining `onEnded` (#926): "great idea. Also lifecycle announce".

When the world's watch ends before its stop, the device announces `watch_ended` through `onLifecycle`, and the default handler logs it. `VaultMinder.connect` takes an optional `onEnded`; the World passes it the announcement, so the minder knows nothing of the device. Cut from 12 after the line was out of draft; filed onto main once the line merged. opus worker; review `medium`.

*Review:* fixed: four small fixes (alignment; a sentence on the existing wontfix crossing row; doc blocks trimmed to what a caller can rely on; a one-clause test title). Left: `Phrases.WatchEnded` says the watch starts again at the janitor's next tick, untrue only after a disconnect.

## For the Coach
- **safebyok-convex is still on safebyok-big.** Thread 7's wrapper works for any new-core vaultDB. *Coach:* "convex and
  other adapters will be soon".
- The 899 agent's last PR: the line is rebased onto it once it lands.
- A Closer Look after the third thread files.
