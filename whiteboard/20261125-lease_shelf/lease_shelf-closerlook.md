# lease_shelf: the Closer Look (exported 2026-11-25)

# Closer Look: threads 0, 1c and 1a

A cold read of the filed line at e135f59d4 (#900, #902, #903) by an opus reader that saw no thread files, PRs or commit messages. Threads 2, 4 and 1d were still building and are out of scope. Reply beside an item as highlighted text; nothing is scheduled until triage.

Flavours: *guidance gap* (the rules don't cover it), *guidance wrong* (the rule or draft leads somewhere bad), *solution off* (the code missed the draft), *redesign?* (a small reshaping makes it go away), *can't tell*.

## 1. Eyebrows, ranked

### E1. A disconnect also locks, so under 1b one tab's unmount would lock every tab

- **Where:** world.ts:316, disconnect(): `this.#isConnected = false` then `this.lock()`. The provider calls it from its effect cleanup; a test asserts unmounting leaves the stage 'locked'; VOCABULARY says "A disconnect also locks the bank".
- **Origin:** the draft says "The World first evicts and drops its lease"; the code goes a step further and calls the public lock().
- **Cost:** today every Fast Refresh, `<Activity>` hide, route change or device-prop change locks the user, who retypes a passphrase. That contradicts the draft's reason for the pair. Under 1b a lock tombstones the shared lease and ends it in every tab, so one tab unmounting its provider would lock them all.
- **Flavour:** guidance wrong, or redesign?
- **What would settle it:** whether disconnect drops only this tab's copy (evict locally, no lock(), no tombstone, so a reconnect takes the stored lease up again) or ends the device's lease.

### E2. An expired lease still unseals until the next janitor tick

- **Where:** world.ts:366, #tidy locks once `now >= leaseEndsAt`; vault.ts:208, withUnlockedWhisper checks only isLocked.
- **Probe:** clock moved 3 days past a 24-hour lease's end with no timer fired (a sleeping laptop): `isLocked=false isSoftlocked=true stage=unlocked unsealed=sk-1`. After one tick, locked.
- **Origin:** drawn by ruling 7 ("best effort, not a deadline").
- **Cost:** a lease past its end decrypts for up to janitorMillis (10 minutes), and after a wake until the first timer fires.
- **Flavour:** redesign? Treat `now >= leaseEndsAt` as locked at the two #lock-is-intent checkpoints: autolock becomes exact where it matters, and the janitor only flips the stage.
- **What would settle it:** whether best effort is a cost accepted for simplicity, or a by-product of having one timer. The lazy check is one comparison in an existing guard.

### E3. Gate staleness compares storage's clock with the tab's

- **Where:** world.ts:377, `now - readAtOf(car.read_tc) > gateStaleMillis`; read\_tc is minted by the vaultDB adapter, which may use its own clock (Postgres mints it in its own process).
- **Probe:** storage clock 0h off: 0 refreshes in 2 hours; 13h behind: a refresh every tick, indefinitely; 13h ahead: never stale for about 25 hours. world.test.ts already needs setClockPastEveryReadTc().
- **Origin:** the ruling said "when this tab last read the gate (its read\_tc)", but read\_tc is when storage read it, on storage's clock, updated only when the record is news.
- **Cost:** wasted re-reads on a device whose clock is off by more than gateStaleMinutes, and silent staleness the other way. Nothing stored is corrupted.
- **Flavour:** guidance gap.
- **What would settle it:** whether "last read" means storage's read\_tc or the tab's own clock when it received the gate.

### E4. The janitor lives inside World and reads the minder's bookkeeping

- **Where:** world.ts, section The janitor: five private methods plus #janitor and #isConnected; #isGateStale reaches into vaultMinder.carAt(...).read\_tc.
- **Origin:** drawn ("The World runs a recurring timer"), against the standing rule that the janitor is understood, tested and replaced on its own.
- **Cost:** World grows from 566 to 649 lines and from 41 to 56 branching lines; it now holds the lease, the unlock wait, the connect flag, the timer, the snapshot, the Things, vault hosting and shelf seeding. The janitor is tested only through a whole born bank with fake timers.
- **Flavour:** guidance gap; the draft and the standing rule pull apart.
- **What would settle it:** whether the janitor is its own object, made with the world's lock, a leaseEndsAt reader, a gate-read time and a re-read function.

### E5. World reaches the device's VaultTSQ only through hosted vaults

- **Where:** Device makes #vaultTSQ, then Vault.make(world, vaultTSQ), which calls world.hostVault(vault); World.connect and disconnect loop over #vaults, and Vault.connect/disconnect only forward to the VaultTSQ.
- --  these at least feel world related not device related.
- **Origin:** carried from sweep's HostedVault pattern, now doubled to two verbs.
- **Cost:** a connect crosses device, world, vault and vault-tsq, four files, to reach an object the Device already holds; any vault's disconnect disconnects them all.
- **Flavour:** redesign? If World holds the VaultTSQ as it holds the VaultMinder (or the Device connects both), HostedVault, #vaults, hostVault, Bank.hostVault and Vault.connect/disconnect all go.
- **What would settle it:** whether anything but the Device ever makes a Vault on a world.

### E6. The softlock waits silently for hosts that switch on the stage

- **Where:** world.ts:311, ensureUnlocked waits once softlocked while the stage stays 'unlocked' and only isUnlockWanted turns true. The kit documents `case 'locked': return <UnlockForm/>` (unlock-form.tsx:27, passkey-forms.tsx:134); only UnlockDialog renders on isUnlockWanted, and its doc says "the bank stays locked".
- **Origin:** drawn (design 5); the kit docs were not touched.
- **Cost:** a host following the documented switch shows no form, and the call waits up to softlock plus janitor time (20 minutes) until the janitor locks.
- **Flavour:** guidance gap.
- **What would settle it:** whether the kit's examples mount UnlockDialog too, or a softlocked wait shows in the stage.

### E7. The lease row carries Thing fields it does not use

- **Where:** shapes-stamps.ts:65, rowCited (lifeseq, lifepath, revseq, revtok, written\_at); isRowRoot (lifepath === lifeseq) and a phrase for it; device-db.ts:85 orders with BaseThing.cmp.
- **Origin:** new; the draft asked for a ticking lifeseq and a revseq only.
- **Cost:** two refinements on two schemas, a phrase and a helper, a lifepath that can only equal lifeseq, and a revtok nothing reads. isRowRoot clashes with the bank's roots.
- **Flavour:** solution off, or can't tell. Note: thread 1d, started after this read, makes the stored lease fully Thing-shaped on the Coach's word, which answers this item the other way.
- **What would settle it:** what 1b reads from the record.

### E8. Newer-wins is decided in the store, the draft puts it in the tab, and the wontfix reasoning misses a fan-out

- **Where:** device-db.ts:32-40, stowLease passes isReplaced into the atomic step, then runs it again to learn whether it wrote.
- **Origin:** new.
- **Cost:** under 1b the ordering rule would exist twice (store and tab); the predicate runs twice per stow. The wontfix row calls two tabs stowing at once a rare overlap, but every tab softlocks on the same gate change, so N tabs write rev+1 together. The outcome is benign: they converge.
- **Flavour:** can't tell (which layer orders), plus a guidance gap in the wontfix row.
- **What would settle it:** which layer orders records, and the wontfix row's reason corrected.

### E9. MaxTimerMillis exists twice, with different values

- world.ts:546, a private `(2 ** 31) - 1`, shadows the exported shapes-vault-tsq.ts:22 MaxTimerMillis (24.5 days). Solution off; import the existing one.

### E10. The disabled refusal names a verb that no longer exists

- device.ts:275 throws big's deviceDisabled: "This device was let go, by a sweep or a vacate". Solution off; a phrase and thrower of the new core's own.

### E11. "Device database" names two things

- vault-minder.ts:293 says "a device database rang", meaning IdbVaultDB's bell; VOCABULARY's ring/bell row now adds the deviceDB's own bell, and its storage row says a device database is what the deviceDB is. Guidance gap (VOCABULARY): name the IdbVaultDB's bell separately.

### E12. Two tests pin a line the draft contradicts, and one title says more than its body

- vault-tsq.test.ts "leaves no item or listing fresh while disconnected..." asserts agekind is still 'here' after the minder disconnects; the draft said it would not be (the staleTime ruling is pending). world.test.ts "stops on disconnect, and starts again on connect" asserts at least 1 tick after reconnect, not one. Can't tell, pending that ruling.

## 2. Undergrowth

**Control primitives, each new in the sprint**

- World.#isConnected gates signin and hostVault (drawn); World.#janitor, setInterval with ??= (drawn; the MaxTimerMillis clamp is new, E9).
- VaultMinder.#unwatchWrapped now nullable, plus a public isWatching read only by VaultTSQ.#isMinded (new).
- VaultTSQ.#unlisten nullable, plus #isMinded = listening and the minder watching: two booleans, four states, of which the World drives two.
- So "connected" is held in four places (#isConnected, #janitor, #unwatchWrapped, #unlisten), each idempotent its own way.
- \#tidy and #refreshRoots: a try/catch around two ifs, then an async try/catch around an answer.ok check, three layers for "never throws": the deepest branching the sprint added.
- MemoryDeviceDB rings on a microtask; IdbDeviceDB opens a BroadcastChannel per ring, copying idb-lean's #ring almost line for line, so the pattern exists twice.
- None: abort controllers, retries, counters, generations, tokens, stored promises.

**New mechanisms**

- DeviceDB, MemoryDeviceDB, IdbDeviceDB (drawn); the doStowLease(row, isReplaced) hook (new, E8); disable() and 'disabled' (ruled; nothing in src calls disable(), 28 tests do); the janitor inside World (E4).
- storage/device-db.ts imports models/base-thing: the first model import under storage/.

**Non-standard JavaScript:** little. No functional wrappers or method names passed for later calling; softlockMillisOf is a two-line helper with one caller.

## 3. New names outside the draft

About 55. Options and timers: DefaultSoftlockMillis, DefaultJanitorMillis, DefaultGateStaleMillis, janitorMillis, gateStaleMillis, softlockMillisOf, MaxTimerMillis (a duplicate). World: #isConnected, #startJanitor, #stopJanitor, #refreshRoots, #connectSignedIn, #tidy, #isGateStale. Watching: isWatching, #isMinded (says little), isHostedVault. Lease row (renamed by 1d): LeaseRow, LiveLeaseRow, LeaseTombstone, rowCited, leaseKeys, isRowRoot, LeaseLifepathOwn. DeviceDB: LeaseListener, DeviceDBChecks, listenArgs, doPeekLease, doStowLease, doRing, doListen, isReplaced, storedRowOf, refusalOf, #rows, #hearers (borrows the minder's 'hear' where VOCABULARY gives a device database ring, bell, listen), \_cheat\_rows. IndexedDB: LeaseDBVersion, leaseShelfOf, leaseDatabasenameOf, leaseBellnameOf, scopepathOf, LeaseScopepath. Stage: 'disabled'.
