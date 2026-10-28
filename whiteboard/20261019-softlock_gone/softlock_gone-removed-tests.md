# softlock_gone: the race and edge-case tests it removed

Written 2026-10-19 for [#190](https://github.com/mrflip/safebyok/pull/190), at the Coach's request: *capture the removed tests for races or other unusual conditions, so we can refer back to them after the big refactor and make sure no lessons learned are lost.*

**How to use this.** When the store reform is done and the policy session takes up TODO.md's *Lock timing vs. work in flight* entry, walk each theme below: decide what the vault promises for that case, and write the test first, these as the checklist. Each theme names the TODO scenario(s) it bears on. The tests are verbatim as they stood at `1997112d` (the tip of #189, which merges with #190); the helpers they call (`makeRacingWorld`, `makeTimedWorld`, `holdNextDerive`, `holdNextLease`, `holdNextBoxRead`, `generationOf`, `seedVault`, `uncheckingDeviceDB`, `signedOut`, ...) are in that commit's `packages/safebyok/tests/vault/world.ts` and the test file named beside each test: `git show 1997112d:<path>`. They will not run against today's code as written: most assert the very behaviour that went.

Left out on purpose: the rotation-schema tests (they tested a stored field, not a race) and tests that were only retitled. Tests kept in place, though they bear on these scenarios, include *a read in flight when a lock lands* and *a vault that moves elsewhere while an unlock is under way* in `tests/vault/vault-races.test.ts`.


## A. A lock that lands while an unlock or a change is under way, same handle

TODO scenario(s): 1.

The shut counter (`shutsSoFar`) made a `lock()` or `retire()` win over an unlock or a change to the wayins that was mid-derivation, mid-look or mid-lease-write: the unlock threw `vault_locked`, and a lease record that landed after the lock's erase was erased again. Today the unlock or change finishes and the vault ends unlocked; only `retire()` (the vault props no longer standing) and `close()` still leave nothing taken up. Edge cases worth a policy test: a first unlock that *creates* the vault while a lock lands (the vault stays created either way); the lock landing during the look at storage, before the vault exists; the lease write racing the erase; a passkey prompt (`addPasskey`) during which the user locks.

### during the passphrase check: the lock wins, the unlock throws 'vault_locked', and no lease is granted

`packages/safebyok/tests/vault/vault-races.test.ts:11`, in a lock that lands while an unlock is under way

```ts
it("during the passphrase check: the lock wins, the unlock throws 'vault_locked', and no lease is granted", async () => {
  const world = makeRacingWorld()
  const vault = await world.openUnlocked('pw one')
  await vault.lock()
  const gate = world.holdNextDerive()
  const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
  await gate.reached
  await vault.lock()
  gate.release()
  const err = await unlocking
  expect(err.message).to.not.include('pw one')
  expect(vault.getSnapshot().state).to.eq('locked')
  expect(vault.getSnapshot().askPassphraseAt).to.be.null
  await TH.expectRefusal(vault.readBox('anything'), 'vault_locked')
  expect(await world.readLease()).to.be.null
  // Well within the seven days a lease would last: the reopen is locked all the same.
  world.advance(HourMillis)
  expect(await world.stateOnOpen()).to.eq('locked')
})
```

### an unlock begun after the lock is untouched by it

`packages/safebyok/tests/vault/vault-races.test.ts:31`, in a lock that lands while an unlock is under way

```ts
it("an unlock begun after the lock is untouched by it", async () => {
  const world = makeRacingWorld()
  const vault = await world.openUnlocked('pw one')
  const gate = world.holdNextDerive()
  const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
  await gate.reached
  await vault.lock()
  gate.release()
  await unlocking
  await vault.unlock('pw one')
  expect(vault.getSnapshot().state).to.eq('unlocked')
  expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + SevenDaysMillis)
  expect(await world.readLease()).to.not.be.null
})
```

### on a vault already unlocked: the lock still wins, and leaves it locked

`packages/safebyok/tests/vault/vault-races.test.ts:46`, in a lock that lands while an unlock is under way

```ts
it("on a vault already unlocked: the lock still wins, and leaves it locked", async () => {
  const world = makeRacingWorld()
  const vault = await world.openUnlocked('pw one')
  world.advance(HourMillis)
  const gate = world.holdNextDerive()
  const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
  await gate.reached
  await vault.lock()
  gate.release()
  await unlocking
  expect(vault.getSnapshot().state).to.eq('locked')
  expect(await world.readLease()).to.be.null
})
```

### during the device record's write: the record that lands after the lock's erase is erased again

`packages/safebyok/tests/vault/vault-races.test.ts:60`, in a lock that lands while an unlock is under way

```ts
it("during the device record's write: the record that lands after the lock's erase is erased again", async () => {
  const world = makeRacingWorld()
  const vault = await world.openUnlocked('pw one')
  await vault.lock()
  const gate = world.holdNextLease()
  const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
  await gate.reached
  await vault.lock()
  gate.release()
  await unlocking
  expect(vault.getSnapshot().state).to.eq('locked')
  expect(await world.readLease()).to.be.null
  expect(await world.stateOnOpen()).to.eq('locked')
})
```

### during the look at storage: the lock wins before a first unlock makes the vault

`packages/safebyok/tests/vault/vault-races.test.ts:75`, in a lock that lands while an unlock is under way

```ts
it("during the look at storage: the lock wins before a first unlock makes the vault", async () => {
  const world = makeRacingWorld()
  const vault = await world.open()
  const gate = world.holdNextLook()
  const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
  await gate.reached
  await vault.lock()
  gate.release()
  await unlocking
  expect(vault.getSnapshot().state).to.eq('absent')
  expect(world.dbStore.ckeys()).to.have.lengthOf(0)
})
```

### during a first unlock's passphrase check: the vault is made, under that passphrase, and stays locked

`packages/safebyok/tests/vault/vault-races.test.ts:88`, in a lock that lands while an unlock is under way

```ts
it("during a first unlock's passphrase check: the vault is made, under that passphrase, and stays locked", async () => {
  const world = makeRacingWorld()
  const vault = await world.open()
  const gate = world.holdNextDerive()
  const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
  await gate.reached
  await vault.lock()
  gate.release()
  await unlocking
  expect(vault.getSnapshot().state).to.eq('locked')
  expect(await world.readLease()).to.be.null
  await vault.unlock('pw one')
  expect(vault.getSnapshot().state).to.eq('unlocked')
})
```

### a retire() that lands mid-unlock wins the same way, and the vault is gone

`packages/safebyok/tests/vault/vault-races.test.ts:103`, in a lock that lands while an unlock is under way

```ts
it("a retire() that lands mid-unlock wins the same way, and the vault is gone", async () => {
  const world = makeRacingWorld()
  const vault = await world.openUnlocked('pw one')
  await vault.storeBox('anthropic', 'sk-fake')
  await vault.lock()
  const gate = world.holdNextDerive()
  const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
  await gate.reached
  await vault.retire()
  gate.release()
  await unlocking
  expect(vault.getSnapshot().state).to.eq('absent')
  expect(world.dbStore.ckeys()).to.have.lengthOf(0)
  expect(await world.readLease()).to.be.null
})
```

### during changePassphrase(): the passphrase still changes, and the vault stays locked

`packages/safebyok/tests/vault/vault-races.test.ts:119`, in a lock that lands while an unlock is under way

```ts
it("during changePassphrase(): the passphrase still changes, and the vault stays locked", async () => {
  const world = makeRacingWorld()
  const vault = await world.openUnlocked('old passphrase')
  await vault.storeBox('anthropic', 'sk-fake')
  const gate = world.holdNextDerive()
  const changing = vault.changePassphrase('old passphrase', 'new passphrase')
  await gate.reached
  await vault.lock()
  gate.release()
  await changing
  expect(vault.getSnapshot().state).to.eq('locked')
  expect(await world.readLease()).to.be.null

  const fresh = await world.open({ deviceDB: memoryDeviceDB() })
  await TH.expectRefusal(fresh.unlock('old passphrase'), 'wrong_passphrase')
  await fresh.unlock('new passphrase')
  expect(await fresh.readBox('anthropic')).to.eq('sk-fake')
})
```

### during addPasskey()'s prompt: the passkey still lands, and the vault stays locked

`packages/safebyok/tests/vault/vault-races.test.ts:138`, in a lock that lands while an unlock is under way

```ts
it("during addPasskey()'s prompt: the passkey still lands, and the vault stays locked", async () => {
  const world = makeRacingWorld()
  const vault = await world.openUnlocked('pw')
  await vault.storeBox('anthropic', 'sk-fake')
  const makePasskey = async () => {
    await vault.lock()
    return await TH.passkeyOf('laptop')
  }
  expect(await vault.addPasskey('pw', makePasskey, { wayinlabel: 'laptop' })).to.be.a('string')
  expect(vault.getSnapshot().state).to.eq('locked')
  expect(await world.readLease()).to.be.null

  const fresh = await world.open({ deviceDB: memoryDeviceDB() })
  await fresh.unlock(await TH.passkeyOf('laptop'))
  expect(await fresh.readBox('anthropic')).to.eq('sk-fake')
})
```

### during changePassphrase()'s device record write: the record is erased again

`packages/safebyok/tests/vault/vault-races.test.ts:155`, in a lock that lands while an unlock is under way

```ts
it("during changePassphrase()'s device record write: the record is erased again", async () => {
  const world = makeRacingWorld()
  const vault = await world.openUnlocked('old passphrase')
  const gate = world.holdNextLease()
  const changing = vault.changePassphrase('old passphrase', 'new passphrase')
  await gate.reached
  await vault.lock()
  gate.release()
  await changing
  expect(vault.getSnapshot().state).to.eq('locked')
  expect(await world.readLease()).to.be.null
  await vault.unlock('new passphrase')
  expect(vault.getSnapshot().state).to.eq('unlocked')
})
```

## B. A lock in another tab on the same device (the lock generation)

TODO scenario(s): 2, 7.

The device mark's `lock_generation`, read when an unlock began and compared in the same IndexedDB transaction as the lease write (`DeviceDB.writeLease(lease, expected)`), made a lock in one tab defeat an unlock under way in another: the record was refused as `stale_write`. `retire()` kept the generation in a blank mark so an unlock elsewhere could not find it back where it began; a mark written from an older read never lowered it. The conformance cases held every host DeviceDB to that compare-and-write. Today a lease written after another tab's lock stands (harmless across users, as a lease is scoped by user id). If the policy wants cross-tab "lock means now", this is the mechanism and these are its tests.

### makes an unlock under way here fail its record write: the unlock throws 'vault_locked', and no lease is granted

`packages/safebyok/tests/vault/vault-races.test.ts:425`, in a lock in another handle on this device

```ts
it("makes an unlock under way here fail its record write: the unlock throws 'vault_locked', and no lease is granted", async () => {
  const world = makeRacingWorld()
  const otherTab = await world.openUnlocked('pw one')
  const thisTab = await world.open()
  await thisTab.lock()
  await otherTab.unlock('pw one')
  const gate = world.holdNextDerive()
  const unlocking = TH.expectRefusal(thisTab.unlock('pw one'), 'vault_locked')
  await gate.reached
  await otherTab.lock()
  gate.release()
  await unlocking
  expect(thisTab.getSnapshot().state).to.eq('locked')
  expect(await world.readLease()).to.be.null
  expect(await world.stateOnOpen()).to.eq('locked')
})
```

### refuses the record of an unlock whose write was already on its way

`packages/safebyok/tests/vault/vault-races.test.ts:442`, in a lock in another handle on this device

```ts
it("refuses the record of an unlock whose write was already on its way", async () => {
  const world = makeRacingWorld()
  const otherTab = await world.openUnlocked('pw one')
  const thisTab = await world.open()
  const gate = world.holdNextLease()
  const unlocking = TH.expectRefusal(thisTab.unlock('pw one'), 'vault_locked')
  await gate.reached
  await otherTab.lock()
  gate.release()
  await unlocking
  expect(await world.readLease()).to.be.null
})
```

### makes an unlock under way here, before this device ever locked, lose to a retire() there: the retire keeps the lock generation

`packages/safebyok/tests/vault/vault-races.test.ts:455`, in a lock in another handle on this device

```ts
it("makes an unlock under way here, before this device ever locked, lose to a retire() there: the retire keeps the lock generation", async () => {
  const world = makeRacingWorld()
  const otherTab = await world.openUnlocked('pw one')
  await world.deviceDB.eraseLease(TH.scopeOf('u1'))  // so this tab opens locked, with no lock made yet
  const thisTab = await world.open({ vaultDB: world.deafVaultDB() })
  expect(await generationOf(world)).to.eq(0)
  const gate = world.holdNextDerive()
  const unlocking = TH.expectRefusal(thisTab.unlock('pw one'), 'vault_locked')
  await gate.reached
  await otherTab.retire()
  gate.release()
  await unlocking
  expect(thisTab.getSnapshot().state).to.eq('locked')
  expect(await world.readLease()).to.be.null
})
```

### makes the first unlock of a vault, under way here, lose to a lock there, though no tab had seen the vault to lock

`packages/safebyok/tests/vault/vault-races.test.ts:471`, in a lock in another handle on this device

```ts
it("makes the first unlock of a vault, under way here, lose to a lock there, though no tab had seen the vault to lock", async () => {
  const world = makeRacingWorld()
  const thisTab = await world.open()
  const otherTab = await world.open()
  const gate = world.holdNextDerive()
  const unlocking = TH.expectRefusal(thisTab.unlock('pw one'), 'vault_locked')
  await gate.reached
  await otherTab.lock()
  gate.release()
  await unlocking
  expect(thisTab.getSnapshot().state).to.eq('locked')
  expect(await world.readLease()).to.be.null
  await thisTab.unlock('pw one')  // the vault stands, made under that passphrase
  expect(thisTab.getSnapshot().state).to.eq('unlocked')
})
```

### rises with lock() and lockSoon(), and not with close(), an unlock or a change to the ways in

`packages/safebyok/tests/vault/vault-races.test.ts:499`, in the device mark's lock generation

```ts
it("rises with lock() and lockSoon(), and not with close(), an unlock or a change to the ways in", async () => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw one')
  expect(await generationOf(world)).to.eq(0)
  await vault.changePassphrase('pw one', 'pw two')
  expect(await generationOf(world)).to.eq(0)
  await vault.lock()
  expect(await generationOf(world)).to.eq(1)
  await vault.unlock('pw two')
  await vault.lockSoon(0)
  expect(await generationOf(world)).to.eq(2)
  await vault.unlock('pw two')
  vault.close()
  expect(await generationOf(world)).to.eq(2)
})
```

### rises when storage says the user is gone and the vault locks

`packages/safebyok/tests/vault/vault-races.test.ts:515`, in the device mark's lock generation

```ts
it("rises when storage says the user is gone and the vault locks", async () => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw one')
  vi.spyOn(world.vaultDB, 'readBox').mockRejectedValueOnce(new VaultError('identity_revoked', 'Signed out.'))
  await TH.expectRefusal(vault.readBox('anthropic'), 'identity_revoked')
  expect(await generationOf(world)).to.eq(1)
  vi.restoreAllMocks()
})
```

### is kept when the vault is made anew under the scope, its mark started afresh

`packages/safebyok/tests/vault/vault-races.test.ts:524`, in the device mark's lock generation

```ts
it("is kept when the vault is made anew under the scope, its mark started afresh", async () => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw one')
  await vault.lock()
  const there = await world.open({ deviceDB: memoryDeviceDB() })
  await there.retire()
  await there.unlock('pw new')
  await vault.unlock('pw new')
  const mark = await world.deviceDB.readMark(TH.scopeOf('u1'))
  expect(mark?.seen?.vault_id).to.eq(storedVaultPropsOf(world)['vault_id'])
  expect(mark?.lock_generation).to.eq(1)
})
```

### leaves a lease and the device mark as they stood, its lock generation unraised

`packages/safebyok/tests/vault/vault-races.test.ts:575`, in close

```ts
it("leaves a lease and the device mark as they stood, its lock generation unraised", async () => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw')
  const markBefore = await world.deviceDB.readMark(TH.scopeOf('u1'))
  vault.close()
  expect(await world.readLease()).to.not.be.null
  expect(await world.deviceDB.readMark(TH.scopeOf('u1'))).to.deep.equal(markBefore)
})
```

### survives lock(), and retire() forgets the vault it has seen, keeping the lock generation it raised

`packages/safebyok/tests/vault/vault-storage.test.ts:679`, in the device mark

```ts
it("survives lock(), and retire() forgets the vault it has seen, keeping the lock generation it raised", async () => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw')
  await vault.lock()
  expect(await seenIn(world)).to.not.be.null
  await vault.retire()
  expect(await markIn(world)).to.deep.equal(TH.markOf('u1', { seen: null, lock_generation: 2 }))
})
```

### is said unreadable through the logger as the call that read it: a lock's, not a refresh's

`packages/safebyok/tests/vault/vault-storage.test.ts:718`, in the device mark

```ts
it("is said unreadable through the logger as the call that read it: a lock's, not a refresh's", async () => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw')
  vi.spyOn(world.deviceDB, 'readMark').mockResolvedValueOnce({ ...TH.markOf('u1'), lock_generation: -1 })
  await vault.lock()
  expect(world.logged.map((heard) => [heard.level, heard.story])).to.deep.equal([['warn', { call: 'lock' }]])
  expect(await markIn(world)).to.deep.include({ lock_generation: 1, seen: null })
})
```

### writes a lease only while the mark stands at the lock generation expected, refusing as 'stale_write' otherwise

`packages/safebyok/tests/test-helpers/device-db-conformance.ts:77`, in ${adapterTitle}, as a DeviceDB

```ts
it("writes a lease only while the mark stands at the lock generation expected, refusing as 'stale_write' otherwise", async () => {
  const deviceDB = await makeDeviceDB()
  await deviceDB.writeMark(markOf('u1', { lock_generation: 2 }))
  await expectRefusal(deviceDB.writeLease(await leaseOf('u1'), { lock_generation: 1 }), 'stale_write')
  expect(await deviceDB.readLease(scopeOf('u1'))).to.be.null
  await deviceDB.writeLease(await leaseOf('u1'), { lock_generation: 2 })
  expect(await deviceDB.readLease(scopeOf('u1'))).to.not.be.null
})
```

### reads the lock generation of a scope with no mark as 0, and of each scope apart

`packages/safebyok/tests/test-helpers/device-db-conformance.ts:86`, in ${adapterTitle}, as a DeviceDB

```ts
it("reads the lock generation of a scope with no mark as 0, and of each scope apart", async () => {
  const deviceDB = await makeDeviceDB()
  await deviceDB.writeLease(await leaseOf('u1'), NoLocks)
  await deviceDB.writeMark(markOf('u1', { lock_generation: 1 }))
  await deviceDB.writeLease(await leaseOf('u2'), NoLocks)
  expect(await deviceDB.readLease(scopeOf('u2'))).to.not.be.null
  await expectRefusal(deviceDB.writeLease(await leaseOf('u1'), NoLocks), 'stale_write')
})
```

### never lowers a mark's lock generation: a mark written from an older read keeps the higher

`packages/safebyok/tests/test-helpers/device-db-conformance.ts:95`, in ${adapterTitle}, as a DeviceDB

```ts
it("never lowers a mark's lock generation: a mark written from an older read keeps the higher", async () => {
  const deviceDB = await makeDeviceDB()
  await deviceDB.writeMark(markOf('u1', { lock_generation: 3 }))
  await deviceDB.writeMark(markOf('u1', { seen: { unlock_epoch: 4 }, lock_generation: 1 }))
  expect(await deviceDB.readMark(scopeOf('u1'))).to.deep.equal(markOf('u1', { seen: { unlock_epoch: 4 }, lock_generation: 3 }))
  await deviceDB.writeMark(markOf('u1', { lock_generation: 5 }))
  expect(await deviceDB.readMark(scopeOf('u1'))).to.deep.equal(markOf('u1', { lock_generation: 5 }))
})
```

### keeps a mark that has seen no vault, its lock generation counting as any mark's

`packages/safebyok/tests/test-helpers/device-db-conformance.ts:104`, in ${adapterTitle}, as a DeviceDB

```ts
it("keeps a mark that has seen no vault, its lock generation counting as any mark's", async () => {
  const deviceDB = await makeDeviceDB()
  await deviceDB.writeMark(markOf('u1', { seen: null, lock_generation: 2 }))
  expect(await deviceDB.readMark(scopeOf('u1'))).to.deep.equal(markOf('u1', { seen: null, lock_generation: 2 }))
  await expectRefusal(deviceDB.writeLease(await leaseOf('u1'), NoLocks), 'stale_write')
  await deviceDB.writeMark(markOf('u1'))
  expect(await deviceDB.readMark(scopeOf('u1'))).to.deep.equal(markOf('u1', { lock_generation: 2 }))
})
```

## C. A lock against a lease being taken up, and a lease a lock could not erase

TODO scenario(s): 1, 6.

`revokesSoFar` made any revocation on a handle final for that handle: a `hello()` that had read the lease before a lock (or a storage refusal saying the user signed out) landed took nothing up, and a lease the lock *failed to erase* (the device store threw) was left for the next page load, never taken up again by this handle even after a failed read made it say hello afresh. Today the next fresh hello on the same handle takes such a lease up. Note the sign-out case: `identity_revoked` met by a background refresh while an open is taking up the lease.

### takes up no lease after ${blurb} could not erase it, though a failed read has it say hello afresh: a page load may, this handle never

`packages/safebyok/tests/vault/vault-make.test.ts:369`, in hello

```ts
const LockThatKeptItsLeaseCases = [
  ["lock()",                       async (vault: Vault) => { await TH.expectRefusal(vault.lock(), 'storage_unavailable') }],
  ["lockSoon()",                   async (vault: Vault) => { await TH.expectRefusal(vault.lockSoon(), 'storage_unavailable') }],
  ["a lock for untrusted storage", async (vault: Vault, world: ReturnType<typeof makeWorld>) => {
    vi.spyOn(world.vaultDB, 'readBox').mockRejectedValueOnce(new VaultError('identity_revoked', 'Signed out.'))
    await TH.expectRefusal(vault.readBox('anthropic'), 'identity_revoked')
  }],
] as const

for (const [blurb, lockIt] of LockThatKeptItsLeaseCases) {
  it(`takes up no lease after ${blurb} could not erase it, though a failed read has it say hello afresh: a page load may, this handle never`, async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    vi.spyOn(world.deviceDB, 'eraseLease').mockRejectedValueOnce(new Error('the device store is read-only'))
    await lockIt(vault, world)
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.readLease()).to.not.be.null
    vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(new VaultError('storage_unavailable', 'The vault storage could not be reached.'))
    world.dbStore.write('elsewhere', '{}')
    await TH.wakeupAtNextTick()
    await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
    expect(vault.getSnapshot()).to.deep.include({ state: 'locked', trouble: null })
    expect(await world.stateOnOpen()).to.eq('unlocked')
  })
}
```

### lets lockSoon() win likewise over a lease being read: no new secrets from this instant

`packages/safebyok/tests/vault/vault-make.test.ts:399`, in hello

```ts
it("lets lockSoon() win likewise over a lease being read: no new secrets from this instant", async () => {
  const world = makeWorld()
  await seedVault(world)
  const gate = TH.holdNextCall(world.deviceDB, 'readLease')
  const vault = Vault.make(world.optsWith())
  await gate.reached
  await vault.lockSoon()
  gate.release()
  await vault.hello()
  expect(vault.getSnapshot().state).to.eq('locked')
  await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
})
```

### wins over the lease an open is taking up, when a background refresh meets it meanwhile

`packages/safebyok/tests/vault/vault-storage.test.ts:567`, in when storage says the user is no longer signed in

```ts
it("wins over the lease an open is taking up, when a background refresh meets it meanwhile", async () => {
  const world = makeWorld()
  const first = await world.openUnlocked('pw one')
  first.close()
  const readLease = world.deviceDB.readLease.bind(world.deviceDB)
  vi.spyOn(world.deviceDB, 'readLease').mockImplementationOnce(async (scope) => {
    const kept = await readLease(scope)
    // The open's own read is past; the next, a background refresh's, meets the sign-out.
    vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(signedOut())
    world.dbStore.write('elsewhere', '{}')
    await vi.waitFor(async () => { expect(await readLease(scope)).to.be.null })
    return kept
  })
  const vault = await world.open()
  expect(vault.getSnapshot().state).to.eq('locked')
  await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
})
```

### wins over an unlock under way, as lock() does: it throws 'vault_locked' and grants no lease

`packages/safebyok/tests/vault/vault-storage.test.ts:540`, in when storage says the user is no longer signed in

```ts
it("wins over an unlock under way, as lock() does: it throws 'vault_locked' and grants no lease", async () => {
  const world = makeRacingWorld()
  const vault = await world.openUnlocked('pw one')
  await vault.lock()
  const gate = world.holdNextDerive()
  const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
  await gate.reached
  vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(signedOut())
  world.dbStore.write('elsewhere', '{}')
  await vi.waitFor(() => { expect(world.logged.map((heard) => heard.level)).to.include('warn') })
  gate.release()
  await unlocking
  expect(vault.getSnapshot().state).to.eq('locked')
  expect(await world.readLease()).to.be.null
})
```

### reads nothing anew after a lock, a lockSoon or a stale write caught up with

`packages/safebyok/tests/vault/vault-make.test.ts:308`, in hello

```ts
it("reads nothing anew after a lock, a lockSoon or a stale write caught up with", async () => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw')
  await vault.storeBox('anthropic', 'sk-fake')
  vi.spyOn(world.vaultDB, 'updateBox').mockRejectedValueOnce(new VaultError('stale_write', 'Someone else wrote first.'))
  await TH.expectRefusal(vault.storeBox('anthropic', 'sk-other'), 'stale_write')
  await vault.lockSoon()
  await vault.lock()
  const reads = vi.spyOn(world.vaultDB, 'readVaultProps')
  await vault.hello()
  expect(reads).not.toHaveBeenCalled()
})
```

## D. A read or a store in flight when a lock lands

TODO scenario(s): 3, 4.

Kept, not removed: a read still refuses once no key is in hand when storage answers or when the whisper is deciphered (`openBox` looks twice). Removed: the soft-lock variants, where a read or a store already in hand finished within the grace, and a stale refusal landing alongside a `lockSoon()` stayed `stale_write` rather than `vault_locked`. With `lock()` the same store-plus-stale-refusal throws `vault_locked` today (the catch-up finds no key): a case the policy should decide deliberately.

### finishes when lockSoon() lands while storage is read: a soft lock waits for work in hand

`packages/safebyok/tests/vault/vault-races.test.ts:200`, in a read in flight when a lock lands

```ts
it("finishes when lockSoon() lands while storage is read: a soft lock waits for work in hand", async () => {
  const world = makeRacingWorld()
  const vault = await world.openUnlocked('pw one')
  await vault.storeBox('anthropic', 'sk-fake')
  const gate = world.holdNextBoxRead()
  const reading = vault.readBox('anthropic')
  await gate.reached
  await vault.lockSoon()
  gate.release()
  expect(await reading).to.eq('sk-fake')
  await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
})
```

### a lockSoon() landing with the refusal leaves the store refused as stale, not as locked: work in hand ends as it would have

`packages/safebyok/tests/vault/vault-races.test.ts:1107`, in versioned updates: two devices writing at once

```ts
it("a lockSoon() landing with the refusal leaves the store refused as stale, not as locked: work in hand ends as it would have", async () => {
  const { here, there, beforeNextWrite } = await twoDeviceWorld()
  await here.storeBox('anthropic', 'sk-ant-fake-one')
  beforeNextWrite('updateBox', async () => {
    await there.storeBox('anthropic', 'sk-ant-fake-theirs')
    await here.lockSoon(30)
  })
  await TH.expectRefusal(here.storeBox('anthropic', 'sk-ant-fake-mine'), 'stale_write')
  expect(here.getSnapshot().state).to.eq('locked')
  expect(await there.readBox('anthropic')).to.eq('sk-ant-fake-theirs')
})
```

## E. Expiry: the minute past askPassphraseAt, late timers, a failing clock

TODO scenario(s): 5.

The two-stage timer let work in hand keep the key for one minute past the deadline while new work was refused at the gate; a timer that rang late (a device asleep) left the second stage only what remained of the minute; a key past its shut time was dropped at the next look; a clock that failed as the window ended dropped the key at once and warned (`{ call: 'expiry' }`). Today one timer drops the key at the deadline, work in hand included, and a look past the deadline drops a late timer's key. The sleeping-device and clock-failure cases are the ones to carry into any future expiry policy (e.g. the Contract's `lease_ending` ask).

### says 'locked' to subscribers at askPassphraseAt, and drops the vaultKey a minute later, with no call made

`packages/safebyok/tests/vault/vault-lease.test.ts:446`, in natural expiry

```ts
it("says 'locked' to subscribers at askPassphraseAt, and drops the vaultKey a minute later, with no call made", async () => {
  const world = makeTimedWorld()
  const vault = await world.openUnlocked('pw one', { leaseHours: 1 })
  const listener = vi.fn()
  vault.subscribe(listener)
  world.pass(HourMillis - 1)
  expect(listener).not.toHaveBeenCalled()
  world.pass(1)
  expect(listener).toHaveBeenCalledTimes(1)
  expect(vault.getSnapshot().state).to.eq('locked')
  expect(vault.getSnapshot().askPassphraseAt).to.be.null
  world.pass(MinuteMillis - 1)
  expect(vi.getTimerCount()).to.eq(1)
  world.pass(1)
  expect(vi.getTimerCount()).to.eq(0)
  expect(listener).toHaveBeenCalledTimes(1)
})
```

### refuses new work from askPassphraseAt on, while work in hand keeps the key to finish within the minute

`packages/safebyok/tests/vault/vault-lease.test.ts:464`, in natural expiry

```ts
it("refuses new work from askPassphraseAt on, while work in hand keeps the key to finish within the minute", async () => {
  const world = makeTimedWorld()
  const vault = await world.openUnlocked('pw one', { leaseHours: 1 })
  const gate = world.holdNextBoxRead()
  const storing = vault.storeBox('anthropic', 'sk-fake')
  await gate.reached
  world.pass(HourMillis)
  await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
  expect(vault.getSnapshot().state).to.eq('locked')
  gate.release()
  await storing
  await vault.unlock('pw one')
  expect(await vault.readBox('anthropic')).to.eq('sk-fake')
})
```

### drops the key by its timer for work still in hand when the minute runs out: that work is refused, and writes nothing

`packages/safebyok/tests/vault/vault-lease.test.ts:479`, in natural expiry

```ts
it("drops the key by its timer for work still in hand when the minute runs out: that work is refused, and writes nothing", async () => {
  const world = makeTimedWorld()
  const vault = await world.openUnlocked('pw one', { leaseHours: 1 })
  const gate = world.holdNextBoxRead()
  const storing = TH.expectRefusal(vault.storeBox('anthropic', 'sk-fake'), 'vault_locked')
  await gate.reached
  world.pass(HourMillis)
  await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
  world.pass(MinuteMillis)
  gate.release()
  await storing
  await vault.unlock('pw one')
  await TH.expectRefusal(vault.readBox('anthropic'), 'absent_box')
})
```

### drops a key whose timer has not run by its shut time at the next look: the threshold is the truth

`packages/safebyok/tests/vault/vault-lease.test.ts:494`, in natural expiry

```ts
it("drops a key whose timer has not run by its shut time at the next look: the threshold is the truth", async () => {
  const world = makeTimedWorld()
  const vault = await world.openUnlocked('pw one', { leaseHours: 1 })
  const gate = world.holdNextBoxRead()
  const storing = TH.expectRefusal(vault.storeBox('anthropic', 'sk-fake'), 'vault_locked')
  await gate.reached
  world.advance(HourMillis + MinuteMillis)  // the clock alone, as a device asleep would see it
  gate.release()
  await storing
  expect(vi.getTimerCount()).to.eq(0)
})
```

### drops the key at its shut time though the deadline's timer rang late: the drop waits only for what is left of the minute

`packages/safebyok/tests/vault/vault-lease.test.ts:571`, in natural expiry

```ts
it("drops the key at its shut time though the deadline's timer rang late: the drop waits only for what is left of the minute", async () => {
  const world = makeTimedWorld()
  const vault = await world.openUnlocked('pw one', { leaseHours: 1 })
  world.advance(MinuteMillis / 2)  // the device sleeps half a minute: its timers ring that much late
  world.pass(HourMillis)
  expect(vault.getSnapshot().state).to.eq('locked')
  world.pass((MinuteMillis / 2) - 1)
  expect(vi.getTimerCount()).to.eq(1)
  world.pass(1)
  expect(vi.getTimerCount()).to.eq(0)
})
```

### drops the key at once, and says so through the logger, when the clock fails as the window ends

`packages/safebyok/tests/vault/vault-lease.test.ts:583`, in natural expiry

```ts
it("drops the key at once, and says so through the logger, when the clock fails as the window ends", async () => {
  const world = makeTimedWorld()
  let broken = false
  const clock = { now: () => { if (broken) { throw new Error('the host clock broke: battery flat') } return Date.now() } }
  const vault = await world.openUnlocked('pw one', { leaseHours: 1, clock })
  broken = true
  world.pass(HourMillis)
  expect(vi.getTimerCount()).to.eq(0)
  expect(world.logged.map((heard) => [heard.level, heard.story])).to.deep.equal([['warn', { call: 'expiry' }]])
  broken = false
  expect(vault.getSnapshot().state).to.eq('locked')
  await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
})
```

### is MaxLeaseHours at most, short of what one timer reaches, with a minute's grace to spare

`packages/safebyok/tests/vault/vault-lease.test.ts:219`, in the lease

```ts
it("is MaxLeaseHours at most, short of what one timer reaches, with a minute's grace to spare", () => {
  expect(MaxLeaseHours).to.eq(588)
  expect((MaxLeaseHours * HourMillis) + MinuteMillis).to.be.below((2 ** 31) - 1)
})
```

### gives lockSoon() on a key past its deadline no more than the minute it had left: a shut time only moves earlier

`packages/safebyok/tests/vault/vault-lease.test.ts:560`, in natural expiry

```ts
it("gives lockSoon() on a key past its deadline no more than the minute it had left: a shut time only moves earlier", async () => {
  const world = makeTimedWorld()
  const vault = await world.openUnlocked('pw one', { leaseHours: 1 })
  world.pass(HourMillis + (MinuteMillis / 2))
  await vault.lockSoon(60)
  world.pass((MinuteMillis / 2) - 1)
  expect(vi.getTimerCount()).to.eq(1)
  world.pass(1)
  expect(vi.getTimerCount()).to.eq(0)
})
```

### has lockSoon() drop a key past its shut time at once, its timer late

`packages/safebyok/tests/vault/vault-lease.test.ts:597`, in natural expiry

```ts
it("has lockSoon() drop a key past its shut time at once, its timer late", async () => {
  const world = makeTimedWorld()
  const vault = await world.openUnlocked('pw one', { leaseHours: 1 })
  world.advance(HourMillis + (2 * MinuteMillis))
  await vault.lockSoon(30)
  expect(vi.getTimerCount()).to.eq(0)
  expect(await world.readLease()).to.be.null
})
```

## F. The soft lock itself (`lockSoon()` and its grace)

TODO scenario(s): the Contract's lease_ending ask.

The "prompt early, let the user carry on" behaviour: the gate closed at once (snapshot `locked`, new work refused, lease revoked) while work in hand kept the key for `graceSeconds`; an unlock or a passphrase change within the grace ended it; a shorter grace shortened a running one, never the reverse; the gate stayed closed even if the clock stepped back (no deadline at all, rather than one at now); `close()`, `lock()` and `retire()` cut it short; and a clock that could not time a grace locked at once with a warning. Its use case now belongs to the Contract's `lease_ending` ask; these tests are the checklist of edge cases that ask must answer.

### closes the entry gate at once: the snapshot reads 'locked', and no whisper comes out

`packages/safebyok/tests/vault/vault-locksoon.test.ts:13`, in lockSoon

```ts
it("closes the entry gate at once: the snapshot reads 'locked', and no whisper comes out", async () => {
  const world = makeRacingWorld()
  const vault = await world.openUnlocked('pw one')
  await vault.storeBox('anthropic', 'sk-fake')
  await vault.lockSoon()
  expect(vault.getSnapshot().state).to.eq('locked')
  expect(vault.getSnapshot().askPassphraseAt).to.be.null
  await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
  await TH.expectRefusal(vault.storeBox('openai', 'sk-fake-too'), 'vault_locked')
})
```

### keeps the gate closed through the grace, even if the clock steps back

`packages/safebyok/tests/vault/vault-locksoon.test.ts:24`, in lockSoon

```ts
it("keeps the gate closed through the grace, even if the clock steps back", async () => {
  const world = makeRacingWorld()
  const vault = await world.openUnlocked('pw one')
  await vault.storeBox('anthropic', 'sk-fake')
  await vault.lockSoon(30)
  world.advance(-10_000)
  await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
  expect(vault.getSnapshot().state).to.eq('locked')
})
```

### revokes the lease at once: a reopen within the grace asks for the passphrase

`packages/safebyok/tests/vault/vault-locksoon.test.ts:34`, in lockSoon

```ts
it("revokes the lease at once: a reopen within the grace asks for the passphrase", async () => {
  const world = makeRacingWorld()
  const vault = await world.openUnlocked('pw one')
  await vault.lockSoon()
  expect(await world.readLease()).to.be.null
  expect(await world.stateOnOpen()).to.eq('locked')
})
```

### lets work in hand finish: a store already under way lands within the grace

`packages/safebyok/tests/vault/vault-locksoon.test.ts:42`, in lockSoon

```ts
it("lets work in hand finish: a store already under way lands within the grace", async () => {
  const world = makeRacingWorld()
  const vault = await world.openUnlocked('pw one')
  const gate = world.holdNextBoxRead()
  const storing = vault.storeBox('anthropic', 'sk-fake')
  await gate.reached
  await vault.lockSoon()
  gate.release()
  await storing
  await vault.unlock('pw one')
  expect(await vault.readBox('anthropic')).to.eq('sk-fake')
})
```

### keeps the key for work in hand while new work is refused at the gate

`packages/safebyok/tests/vault/vault-locksoon.test.ts:55`, in lockSoon

```ts
it("keeps the key for work in hand while new work is refused at the gate", async () => {
  const world = makeRacingWorld()
  const vault = await world.openUnlocked('pw one')
  const gate = world.holdNextBoxRead()
  const storing = vault.storeBox('anthropic', 'sk-fake')
  await gate.reached
  await vault.lockSoon()
  await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
  gate.release()
  await storing
})
```

### drops the vaultKey when the grace runs out: work still in hand after it is refused

`packages/safebyok/tests/vault/vault-locksoon.test.ts:67`, in lockSoon

```ts
it("drops the vaultKey when the grace runs out: work still in hand after it is refused", async () => {
  const world = makeRacingWorld()
  const vault = await world.openUnlocked('pw one')
  const gate = world.holdNextBoxRead()
  const storing = TH.expectRefusal(vault.storeBox('anthropic', 'sk-fake'), 'vault_locked')
  await gate.reached
  await vault.lockSoon()
  vi.advanceTimersByTime(GraceMillis)
  gate.release()
  await storing
  expect(vi.getTimerCount()).to.eq(0)
  await vault.unlock('pw one')
  await TH.expectRefusal(vault.readBox('anthropic'), 'absent_box')
})
```

### unlike lock(), which refuses work in hand at its next look

`packages/safebyok/tests/vault/vault-locksoon.test.ts:82`, in lockSoon

```ts
it("unlike lock(), which refuses work in hand at its next look", async () => {
  const world = makeRacingWorld()
  const vault = await world.openUnlocked('pw one')
  const gate = world.holdNextBoxRead()
  const storing = TH.expectRefusal(vault.storeBox('anthropic', 'sk-fake'), 'vault_locked')
  await gate.reached
  await vault.lock()
  gate.release()
  await storing
})
```

### lets an unlock under way when it is called finish, unlocked and leased: a soft lock waits for work in hand

`packages/safebyok/tests/vault/vault-locksoon.test.ts:93`, in lockSoon

```ts
it("lets an unlock under way when it is called finish, unlocked and leased: a soft lock waits for work in hand", async () => {
  const world = makeRacingWorld()
  const vault = await world.openUnlocked('pw one')
  const gate = world.holdNextDerive()
  const unlocking = vault.unlock('pw one')
  await gate.reached
  await vault.lockSoon()
  expect(vault.getSnapshot().state).to.eq('locked')
  gate.release()
  await unlocking
  vi.advanceTimersByTime(GraceMillis * 2)
  expect(vault.getSnapshot().state).to.eq('unlocked')
  expect(await world.readLease()).to.not.be.null
})
```

### lets a changePassphrase() under way finish, unlocked under the new passphrase

`packages/safebyok/tests/vault/vault-locksoon.test.ts:108`, in lockSoon

```ts
it("lets a changePassphrase() under way finish, unlocked under the new passphrase", async () => {
  const world = makeRacingWorld()
  const vault = await world.openUnlocked('old passphrase')
  const gate = world.holdNextDerive()
  const changing = vault.changePassphrase('old passphrase', 'new passphrase')
  await gate.reached
  await vault.lockSoon()
  gate.release()
  await changing
  vi.advanceTimersByTime(GraceMillis * 2)
  expect(vault.getSnapshot().state).to.eq('unlocked')
  expect(await world.readLease()).to.not.be.null
  await vault.lock()
  await TH.expectRefusal(vault.unlock('old passphrase'), 'wrong_passphrase')
  await vault.unlock('new passphrase')
  expect(vault.getSnapshot().state).to.eq('unlocked')
})
```

### lets an unlock under way in another tab finish, raising no lock generation

`packages/safebyok/tests/vault/vault-locksoon.test.ts:126`, in lockSoon

```ts
it("lets an unlock under way in another tab finish, raising no lock generation", async () => {
  const world = makeRacingWorld()
  const otherTab = await world.openUnlocked('pw one')
  const thisTab = await world.open()
  await thisTab.lock()
  const gate = world.holdNextDerive()
  const unlocking = thisTab.unlock('pw one')
  await gate.reached
  await otherTab.unlock('pw one')
  await otherTab.lockSoon()
  gate.release()
  await unlocking
  expect(thisTab.getSnapshot().state).to.eq('unlocked')
  expect(await generationOf(world)).to.eq(1)
  expect(await world.readLease()).to.not.be.null
})
```

### is ended by an unlock within the grace: the new unlock stands past it, with its lease

`packages/safebyok/tests/vault/vault-locksoon.test.ts:143`, in lockSoon

```ts
it("is ended by an unlock within the grace: the new unlock stands past it, with its lease", async () => {
  const world = makeRacingWorld()
  const vault = await world.openUnlocked('pw one')
  await vault.storeBox('anthropic', 'sk-fake')
  await vault.lockSoon()
  await vault.unlock('pw one')
  expect(vi.getTimerCount()).to.eq(1)  // the new unlock's own shut, seven days and a minute out
  vi.advanceTimersByTime(GraceMillis * 2)
  expect(vault.getSnapshot().state).to.eq('unlocked')
  expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + SevenDaysMillis)
  expect(await vault.readBox('anthropic')).to.eq('sk-fake')
  expect(await world.readLease()).to.not.be.null
})
```

### is ended by a changePassphrase() within the grace, which proves the passphrase as an unlock does

`packages/safebyok/tests/vault/vault-locksoon.test.ts:157`, in lockSoon

```ts
it("is ended by a changePassphrase() within the grace, which proves the passphrase as an unlock does", async () => {
  const world = makeRacingWorld()
  const vault = await world.openUnlocked('old passphrase')
  await vault.storeBox('anthropic', 'sk-fake')
  await vault.lockSoon()
  await vault.changePassphrase('old passphrase', 'new passphrase')
  expect(vi.getTimerCount()).to.eq(1)  // the new deadline's own shut
  vi.advanceTimersByTime(GraceMillis * 2)
  expect(vault.getSnapshot().state).to.eq('unlocked')
  expect(await vault.readBox('anthropic')).to.eq('sk-fake')
})
```

### loses to an unlock begun within the grace and still under way when it runs out

`packages/safebyok/tests/vault/vault-locksoon.test.ts:169`, in lockSoon

```ts
it("loses to an unlock begun within the grace and still under way when it runs out", async () => {
  const world = makeRacingWorld()
  const vault = await world.openUnlocked('pw one')
  await vault.storeBox('anthropic', 'sk-fake')
  await vault.lockSoon()
  const gate = world.holdNextDerive()
  const unlocking = vault.unlock('pw one')
  await gate.reached
  vi.advanceTimersByTime(GraceMillis)
  gate.release()
  await unlocking
  expect(vault.getSnapshot().state).to.eq('unlocked')
  expect(await vault.readBox('anthropic')).to.eq('sk-fake')
})
```

### never lengthens a grace already running, and a shorter one shortens it

`packages/safebyok/tests/vault/vault-locksoon.test.ts:184`, in lockSoon

```ts
it("never lengthens a grace already running, and a shorter one shortens it", async () => {
  const world = makeRacingWorld()
  const vault = await world.openUnlocked('pw one')
  const firstGate = world.holdNextBoxRead()
  const firstStoring = TH.expectRefusal(vault.storeBox('anthropic', 'sk-fake'), 'vault_locked')
  await firstGate.reached
  await vault.lockSoon(1)
  await vault.lockSoon(30)
  vi.advanceTimersByTime(1000)
  firstGate.release()
  await firstStoring

  await vault.unlock('pw one')
  const secondGate = world.holdNextBoxRead()
  const secondStoring = TH.expectRefusal(vault.storeBox('anthropic', 'sk-fake'), 'vault_locked')
  await secondGate.reached
  await vault.lockSoon(30)
  await vault.lockSoon(1)
  vi.advanceTimersByTime(1000)
  secondGate.release()
  await secondStoring
  expect(vi.getTimerCount()).to.eq(0)
})
```

### with a grace of 0 is lock(): work in hand is refused, and no timer is left

`packages/safebyok/tests/vault/vault-locksoon.test.ts:208`, in lockSoon

```ts
it("with a grace of 0 is lock(): work in hand is refused, and no timer is left", async () => {
  const world = makeRacingWorld()
  const vault = await world.openUnlocked('pw one')
  const gate = world.holdNextBoxRead()
  const storing = TH.expectRefusal(vault.storeBox('anthropic', 'sk-fake'), 'vault_locked')
  await gate.reached
  await vault.lockSoon(0)
  expect(vi.getTimerCount()).to.eq(0)
  gate.release()
  await storing
  expect(await world.readLease()).to.be.null
})
```

### on a vault already locked, or never made, leaves it so, with no timer

`packages/safebyok/tests/vault/vault-locksoon.test.ts:221`, in lockSoon

```ts
it("on a vault already locked, or never made, leaves it so, with no timer", async () => {
  const world = makeRacingWorld()
  const vault = await world.open()
  await vault.lockSoon()
  expect(vault.getSnapshot().state).to.eq('absent')
  await vault.unlock('pw one')
  await vault.lock()
  await vault.lockSoon()
  expect(vault.getSnapshot().state).to.eq('locked')
  expect(vi.getTimerCount()).to.eq(0)
})
```

### tells subscribers once, when the gate closes, and not again when the key goes

`packages/safebyok/tests/vault/vault-locksoon.test.ts:233`, in lockSoon

```ts
it("tells subscribers once, when the gate closes, and not again when the key goes", async () => {
  const world = makeRacingWorld()
  const vault = await world.openUnlocked('pw one')
  const listener = vi.fn()
  vault.subscribe(listener)
  await vault.lockSoon()
  expect(listener).toHaveBeenCalledTimes(1)
  vi.advanceTimersByTime(GraceMillis)
  expect(listener).toHaveBeenCalledTimes(1)
})
```

### is cut short by close(): no timer outlives the handle

`packages/safebyok/tests/vault/vault-locksoon.test.ts:244`, in lockSoon

```ts
it("is cut short by close(): no timer outlives the handle", async () => {
  const world = makeRacingWorld()
  const vault = await world.openUnlocked('pw one')
  await vault.lockSoon(60)
  expect(vi.getTimerCount()).to.eq(1)
  vault.close()
  expect(vi.getTimerCount()).to.eq(0)
  await TH.expectRefusal(vault.lockSoon(), 'vault_closed')
})
```

### is cut short by lock(), and by retire()

`packages/safebyok/tests/vault/vault-locksoon.test.ts:254`, in lockSoon

```ts
it("is cut short by lock(), and by retire()", async () => {
  const world = makeRacingWorld()
  const vault = await world.openUnlocked('pw one')
  await vault.lockSoon()
  await vault.lock()
  expect(vi.getTimerCount()).to.eq(0)
  await vault.unlock('pw one')
  await vault.lockSoon()
  await vault.retire()
  expect(vi.getTimerCount()).to.eq(0)
  expect(vault.getSnapshot().state).to.eq('absent')
})
```

### as the screen-lock recipe calls it, when the tab is hidden

`packages/safebyok/tests/vault/vault-locksoon.test.ts:267`, in lockSoon

```ts
it("as the screen-lock recipe calls it, when the tab is hidden", async () => {
  const world = makeRacingWorld()
  const vault = await world.openUnlocked('pw one')
  // A stand-in for `document`, which Node has not.
  const page = Object.assign(new EventTarget(), { hidden: false })
  page.addEventListener('visibilitychange', () => { if (page.hidden) { void vault.lockSoon() } })
  const listener = vi.fn()
  vault.subscribe(listener)
  page.hidden = true
  page.dispatchEvent(new Event('visibilitychange'))
  await vi.waitFor(() => { expect(listener).toHaveBeenCalled() })
  expect(vault.getSnapshot().state).to.eq('locked')
})
```

### still locks when the clock has gone wrong: lock(), and lockSoon() at once, without a grace

`packages/safebyok/tests/vault/vault-make.test.ts:520`, in the host's clock

```ts
it("still locks when the clock has gone wrong: lock(), and lockSoon() at once, without a grace", async () => {
  const world = makeWorld()
  let reading = world.clock.now()
  const vault = await world.openUnlocked('pw', { clock: { now: () => reading } })
  reading = NaN
  await vault.lockSoon(5)
  expect(world.logged).to.have.lengthOf(1)
  expect(world.logged[0]?.level).to.eq('warn')
  expect(world.logged[0]?.message).to.match(/locked at once/)
  expect(world.logged[0]?.message).to.not.include('NaN')
  expect(vault.getSnapshot().state).to.eq('locked')
  expect(await world.readLease()).to.be.null
  reading = world.clock.now()
  await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
  await vault.unlock('pw')
  reading = 0
  await vault.lock()
  expect(vault.getSnapshot().state).to.eq('locked')
  expect(await world.readLease()).to.be.null
})
```

### warns when lockSoon() locks at once on a clock gone wrong, the clock's refusal its error

`packages/safebyok/tests/vault/vault-storage.test.ts:352`, in the logger

```ts
it("warns when lockSoon() locks at once on a clock gone wrong, the clock's refusal its error", async () => {
  const world = makeWorld()
  let reading = world.clock.now()
  const vault = await world.openUnlocked('pw', { clock: { now: () => reading } })
  reading = world.clock.now() / 1000
  await vault.lockSoon()
  expect(world.logged).to.have.lengthOf(1)
  const [heard] = world.logged
  expect(heard?.level).to.eq('warn')
  expect(heard?.story).to.deep.equal({ call: 'lockSoon' })
  expect(heard?.err).to.be.instanceOf(VaultError)
  expect((heard?.err as VaultError).kind).to.eq('bad_option')
})
```

## Appendix: `vault-locksoon.test.ts`'s preamble

The whole file went; its imports and helpers, for reading the tests in F:

```ts
import { describe, beforeEach, vi, afterEach, it, expect } from 'vitest'
import * as TH from '../test-helpers'
import { makeRacingWorld, makeWorld, generationOf, SevenDaysMillis } from './world'
```
