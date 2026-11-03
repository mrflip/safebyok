import { describe, expect, it, vi } from 'vitest'
import { makeLeaseKey } from '../../src/crypto'
import { VaultError } from '../../src/errors'
import { LOCKED } from '../../src/models/models-shapes'
import { NOVEL, PassphraseProving } from '../../src/models/proving'
import { VaultListing } from '../../src/models/vault-listing'
import { passphraseCleartext } from '../../src/shapes/vault'
import * as TH from '../test-helpers'
import { NewPassphrase, Passphrase, byPasskey, byPassphrase, makeBornVault, makeBornVaultWithPasskey, makeVaultWorld, makeProving, storedVaultRecord, useVaultWorlds, vaultRoundTrip } from '../test-helpers/vault-world'

useVaultWorlds()

/** A key deriver that must never be called. */
const deriveNothing = (): never => { throw new Error('derived') }

const Stamp = Object.freeze({ boxlabel: 'anthropic_api_key', revision_seq: 1 })

describe("Gate.attemptProof: the proving of a stored wayin that the proof opens", () => {
  it("answers the passphrase proving of the gate, which holds the vaultKey the vault was born under", async () => {
    const { vault, opts: { world } } = await makeBornVault()
    const proving = await vault.gate.attemptProof(() => ({ passphrase: Passphrase }), world)
    expect(proving.wayinkind).to.eq('passphrase')
    const lease = await proving.buildLease(vault.leaseFriend())
    expect(await roundTrip(vault.demandLease(), lease)).to.eq('sk-test')
    lease.evict()
  })

  it("refuses 'wrong_passphrase' a passphrase the wayin will not open under", async () => {
    const { vault, opts: { world } } = await makeBornVault()
    await TH.expectRefusal(vault.gate.attemptProof(() => ({ passphrase: 'not the passphrase' }), world), 'wrong_passphrase')
  })

  it("refuses 'unknown_key_deriver' a world whose key deriver is not the one the wayin names, before deriving anything", async () => {
    const { vault, opts: { world } } = await makeBornVault()
    await TH.expectRefusal(vault.gate.attemptProof(() => ({ passphrase: Passphrase }), { ...world, keyDeriver: { ...TH.testDeriver, key_deriver_label: 'other_digest_v0', deriveKeyBytes: deriveNothing } }), 'unknown_key_deriver')
  })

  it("answers the passkey proving where the proof hands a passkey alone, and refuses 'wrong_passkey' another credential or another salt", async () => {
    const passkeyAnswer = await TH.passkeyOf('laptop')
    const { vault, opts: { world } } = await makeBornVault(() => ({ passphrase: Passphrase, passkeyAnswer }))
    const proving = await vault.gate.attemptProof(async () => ({ passkeyAnswer: await TH.passkeyOf('laptop') }), world)
    expect(proving.wayinkind).to.eq('passkey')
    const lease = await proving.buildLease(vault.leaseFriend())
    expect(await roundTrip(vault.demandLease(), lease)).to.eq('sk-test')
    lease.evict()
    await TH.expectRefusal(vault.gate.attemptProof(async () => ({ passkeyAnswer: await TH.passkeyOf('phone') }), world), 'wrong_passkey')
    const { prf_salt_b64: otherSalt } = await TH.passkeyOf('elsewhere')
    await TH.expectRefusal(vault.gate.attemptProof(async () => ({ passkeyAnswer: await TH.passkeyOf('laptop', otherSalt) }), world), 'wrong_passkey')
  })

  it("refuses 'absent_wayin' a passkey where the gate has no passkey wayin, and 'bad_option' a proof that hands neither", async () => {
    const { vault, opts: { world } } = await makeBornVault()
    await TH.expectRefusal(vault.gate.attemptProof(async () => ({ passkeyAnswer: await TH.passkeyOf('laptop') }), world), 'absent_wayin')
    await TH.expectRefusal(vault.gate.attemptProof(() => ({}), world), 'bad_option')
  })
})

describe("proving.buildWayin: one wayin per proving, of its own vault", () => {
  it("refuses a second wayin of a proving that holds one, and a source proving of another vault", async () => {
    const { vault, opts: { world } } = await makeBornVault()
    const mine = await vault.gate.attemptProof(() => ({ passphrase: Passphrase }), world)
    await TH.expectRefusal(mine.buildWayin(NOVEL), 'unexpected_error')
    const novel = await PassphraseProving.buildNovel(vault.gate.stamp, passphraseCleartext.parse('a new passphrase'), world)
    await TH.expectRefusal(novel.buildWayin(await makeProving({ vault_tok: 'vault-tok-other', registered_at: T0 })), 'bad_option')
    const wayin = await novel.buildWayin(mine)
    expect(wayin.wayinkind).to.eq('passphrase')
  })
})

describe("Vault.ensureUnlocked and the vault's lock", () => {
  it("is born unlocked, under the lease its passphrase proving grants and the deviceDB caches; ensureUnlocked answers the vault and asks nothing", async () => {
    const { vault, deviceDB } = await makeBornVault()
    expect(vault.isUnlocked).to.be.true
    expect(vault.lockState()).to.eq('unlocked')
    expect(deviceDB.tryCache).toHaveBeenCalledOnce()
    expect(deviceDB.keptNow()).to.deep.include({ gate_epoch: vault.gate.gate_epoch, wayinkind: 'passphrase' })
    expect(await vault.ensureUnlocked()).to.equal(vault)
    expect(await vaultRoundTrip(vault, vault)).to.eq('sk-test')
  })

  it("refuses 'bad_option' a stamp of no fields, at the seal and at the unseal: a seal bound to nothing of the box's binds nothing", async () => {
    const { vault } = await makeBornVault()
    await TH.expectRefusal(vault.sealStampedString('sk-test', {}), 'bad_option')
    await TH.expectRefusal(vault.unsealStampedString(await vault.sealStampedString('sk-test', Stamp), {}), 'bad_option')
  })

  it("locks at `lock()`, reading locked before it returns and erasing the row; seal and unseal refuse; then 'vault_locked' with no proof, the proof's own refusal with a wrong one, and it unlocks with the right one", async () => {
    const { vault, deviceDB } = await makeBornVault()
    const sealed = await vault.sealStampedString('sk-test', Stamp)
    expect(vault.lock()).to.equal(vault)
    expect(vault.isLocked).to.be.true
    expect(vault.lockState()).to.eq('locked')
    await TH.expectRefusal(vault.sealStampedString('sk-test', Stamp), 'vault_locked')
    await TH.expectRefusal(vault.unsealStampedString(sealed, Stamp), 'vault_locked')
    await TH.eventually(() => deviceDB.keptNow() === null)
    await TH.expectRefusal(vault.ensureUnlocked(), 'vault_locked')
    await TH.expectRefusal(vault.ensureUnlocked(byPassphrase('not the passphrase')), 'wrong_passphrase')
    expect(vault.isLocked).to.be.true
    await vault.ensureUnlocked(byPassphrase(Passphrase))
    expect(vault.isUnlocked).to.be.true
    expect(await vault.unsealStampedString(sealed, Stamp)).to.eq('sk-test')
    expect(deviceDB.tryVacate).toHaveBeenCalledOnce()
    expect(deviceDB.tryCache).toHaveBeenCalledTimes(2)
    expect(deviceDB.keptNow()).not.to.be.null
  })

  it("tells listeners the lock moved, as the snapshot shows it", async () => {
    const { vault } = await makeBornVault()
    vault.becomeNotifiable()
    const listener = vi.fn()
    vault.subscribe(listener)
    expect(vault.getSnapshot().lockState).to.eq('unlocked')
    vault.lock()
    expect(listener).toHaveBeenCalledOnce()
    expect(vault.getSnapshot().lockState).to.eq('locked')
  })

  it("unlocks a vault held sparse by proof, its full record fetched for the gate", async () => {
    const { demandStored } = await makeBornVault()
    const record = demandStored()
    const { listing } = makeVaultWorld(record)
    const vault = await listing.build(listing.sparseOf(record))
    expect(vault.isLocked).to.be.true
    await vault.ensureUnlocked(byPassphrase(Passphrase))
    expect(vault.isUnlocked).to.be.true
    expect(vault.isFull).to.be.true
  })

  it("refuses a seal or an unseal crossed by a lock, handing nothing back", async () => {
    const { vault } = await makeBornVault()
    const sealed = await vault.sealStampedString('sk-test', Stamp)
    const sealing = vault.sealStampedString('sk-test', Stamp)
    const unsealing = vault.unsealStampedString(sealed, Stamp)
    vault.lock()
    await TH.expectRefusal(sealing, 'vault_locked')
    await TH.expectRefusal(unsealing, 'vault_locked')
  })

  it("seals nothing another vault opens: the vaultKey and the vault's stamp are bound in", async () => {
    const { vault } = await makeBornVault()
    const { vault: other } = await makeBornVault()
    await TH.expectRefusal(other.unsealStampedString(await vault.sealStampedString('sk-test', Stamp), Stamp), 'damaged_box')
  })
})

describe("lease.attach: the one way a vault comes to hold a lease", () => {
  const makeFreshLease = async ({ vault, opts: { world } }: Awaited<ReturnType<typeof makeBornVault>>) => {
    const proving = await vault.gate.attemptProof(byPassphrase(Passphrase), world)
    return proving.buildLease(vault.leaseFriend())
  }

  it("holds the lease, reading unlocked, and caches its row: the lease it displaces is dropped", async () => {
    const born = await makeBornVault()
    const { vault, deviceDB } = born
    const first = await makeFreshLease(born)
    const second = await makeFreshLease(born)
    await first.attach()
    await second.attach()
    expect(first.isForgotten).to.be.true
    expect(second.isInForce).to.be.true
    expect(vault.isUnlocked).to.be.true
    expect(deviceDB.keptNow()).to.deep.include({ proved_at: second.proved_at })
  })

  it("refuses 'bad_option' a lease built on another Vault object of the same stamp, and leaves its row", async () => {
    const born = await makeBornVault()
    const later = born.anotherSession()
    const other = await later.build(born.demandStored())
    const proving = await born.vault.gate.attemptProof(byPassphrase(Passphrase), born.opts.world)
    const lease = await proving.buildLease(other.leaseFriend())
    await TH.expectRefusal(born.vault.leaseFriend().attachLease(lease), 'bad_option')
    expect(lease.isInForce).to.be.true
    expect(born.deviceDB.tryVacate).not.toHaveBeenCalled()
  })

  it("refuses 'vault_locked' a lease out of force", async () => {
    const born = await makeBornVault()
    const lease = await makeFreshLease(born)
    lease.evict()
    await TH.expectRefusal(lease.attach(), 'vault_locked')
  })

  it("past a sweep refuses, the lease vacated, no row cached, and the row the sweep left erased", async () => {
    const born = await makeBornVault()
    const { vault, deviceDB } = born
    const lease = await makeFreshLease(born)
    vault.sweep()
    expect(deviceDB.keptNow()).not.to.be.null
    await TH.expectRefusal(lease.attach(), 'bad_option')
    expect(lease.isForgotten).to.be.true
    expect(vault.isLocked).to.be.true
    expect(deviceDB.keptNow()).to.be.null
    expect(deviceDB.tryCache).toHaveBeenCalledOnce()
  })

  it("holds the lease where the deviceDB refuses its row, told as bad news: it costs the next session a proof, not this one its lease", async () => {
    const onBadNews = vi.fn()
    const { opts, deviceDB, demandStored } = await makeBornVault()
    const record = demandStored()
    const listing = new VaultListing({ ...opts, onBadNews })
    const vault = await listing.build(record)
    deviceDB.tryCache.mockResolvedValueOnce(TH.bad(new VaultError('storage_blocked', 'the disk is full')))
    vault.lock()
    await vault.ensureUnlocked(byPassphrase(Passphrase))
    expect(vault.isUnlocked).to.be.true
    expect(onBadNews).toHaveBeenCalledOnce()
    listing.goodbye()
  })
})

describe("The lease this device has cached: taken up in ensureUnlocked alone", () => {
  it("attaches it at the next session's ensureUnlocked, opening what the born one sealed, asking nothing; hello takes up nothing", async () => {
    const { vault, demandStored, anotherSession } = await makeBornVault()
    const later = anotherSession()
    const again = await later.build(demandStored())
    await later.hello()
    expect(again.isLocked).to.be.true
    expect(await again.ensureUnlocked()).to.equal(again)
    expect(again.isUnlocked).to.be.true
    expect(await vaultRoundTrip(vault, again)).to.eq('sk-test')
  })

  it("looks for no lease at a hello, of a vault deleted or any other", async () => {
    const { gate: _gate, ...sparse } = await storedVaultRecord()
    const tombstone = { ...sparse, am: 'x' as const }
    const { listing, deviceDB } = makeVaultWorld(tombstone as never)
    await listing.build(tombstone)
    await listing.hello()
    expect(deviceDB.peek).not.toHaveBeenCalled()
  })

  it("takes up no lease cached under an older gate, and uncaches it: asking for the proof", async () => {
    const { vault, demandStored, anotherSession, deviceDB } = await makeBornVault()
    vault.lock()
    await vault.ensureUnlocked(byPassphrase(Passphrase))
    const stale = deviceDB.keptNow()
    await vault.replacePassphrase(byPassphrase(Passphrase), byPassphrase(NewPassphrase))
    deviceDB.keep(stale)
    const again = await anotherSession().build(demandStored())
    await TH.expectRefusal(again.ensureUnlocked(), 'vault_locked')
    expect(deviceDB.keptNow()).to.be.null
    await again.ensureUnlocked(byPassphrase(NewPassphrase))
    expect(again.isUnlocked).to.be.true
  })

  it("takes up no lease another device cached before the gate changed: a revoked passkey's holder asks for the proof", async () => {
    const { vault, demandStored } = await makeBornVaultWithPasskey()
    const other = makeVaultWorld(demandStored(), { device_id: 'device-2' })
    const theirs = await other.listing.build(other.demandStored())
    await theirs.ensureUnlocked(byPasskey('laptop'))
    await vault.revokePasskey(byPassphrase(Passphrase))
    other.storeBehindOurBack(demandStored())
    const again = await other.anotherSession().build(other.demandStored())
    expect(other.deviceDB.keptNow()).not.to.be.null
    await TH.expectRefusal(again.ensureUnlocked(), 'vault_locked')
    expect(again.gate.pkWayin).to.be.null
    expect(other.deviceDB.keptNow()).to.be.null
  })

  it("makes no check of a cached lease's age: taken up however long ago it was proved", async () => {
    const { demandStored, anotherSession, advance } = await makeBornVault()
    advance(400 * 24 * 60 * 60_000)
    const again = await anotherSession().build(demandStored())
    await again.ensureUnlocked()
    expect(again.isUnlocked).to.be.true
  })

  it("locks the vault where a cached lease will not open at its first seal: 'damaged_lease', and the row erased", async () => {
    const { demandStored, anotherSession, deviceDB } = await makeBornVault()
    const kept = deviceDB.keptNow() as Record<string, unknown>
    deviceDB.keep({ ...kept, lease_key: await makeLeaseKey() })
    const again = await anotherSession().build(demandStored())
    await again.ensureUnlocked()
    await TH.expectRefusal(again.sealStampedString('sk-test', Stamp), 'damaged_lease')
    expect(again.isLocked).to.be.true
    await TH.eventually(() => deviceDB.keptNow() === null)
    expect(deviceDB.tryVacate).toHaveBeenCalledOnce()
  })

  it("tells a row that is no lease as bad news and asks for the proof, leaving it to be cached over", async () => {
    const onBadNews = vi.fn()
    const { opts, demandStored, deviceDB } = await makeBornVault()
    const kept = deviceDB.keptNow() as Record<string, unknown>
    deviceDB.keep({ ...kept, lease_key: 'no key at all' })
    const listing = new VaultListing({ ...opts, onBadNews })
    const again = await listing.build(demandStored())
    await TH.expectRefusal(again.ensureUnlocked(), 'vault_locked')
    expect(onBadNews.mock.calls[0]?.[0]).to.deep.include({ refusalkind: 'damaged_lease' })
    await again.ensureUnlocked(byPassphrase(Passphrase))
    expect(again.isUnlocked).to.be.true
    listing.goodbye()
  })

  it("takes up, at the next ensureUnlocked, a lease another session cached after this vault's first look", async () => {
    const { vault, demandStored, anotherSession, deviceDB } = await makeBornVault()
    const record = demandStored()
    vault.lock()
    await TH.eventually(() => deviceDB.keptNow() === null)
    const again = await anotherSession().build(record)
    await TH.expectRefusal(again.ensureUnlocked(), 'vault_locked')
    await vault.ensureUnlocked(byPassphrase(Passphrase))
    await again.ensureUnlocked()
    expect(await vaultRoundTrip(vault, again)).to.eq('sk-test')
  })

  it("erases the row at a lock() of a vault that holds no lease: the next session asks for the proof", async () => {
    const { demandStored, anotherSession, deviceDB } = await makeBornVault()
    const record = demandStored()
    const idle = await anotherSession().build(record)
    expect(idle.isLocked).to.be.true
    idle.lock()
    await TH.eventually(() => deviceDB.keptNow() === null)
    const again = await anotherSession().build(record)
    await TH.expectRefusal(again.ensureUnlocked(), 'vault_locked')
  })
})

describe("A refused erase of the row: the panic", () => {
  const Refusal = new VaultError('storage_blocked', 'the disk is full')

  it("hears the host's onPanic, leaving the vault locked and enabled; a rejection of it goes to the platform and no further", async () => {
    const reported = vi.spyOn(globalThis, 'reportError').mockImplementation(() => undefined)
    const onPanic = vi.fn(() => Promise.reject(new Error('the host panicked')))
    const { vault, deviceDB } = await makeBornVault(byPassphrase(Passphrase), { onPanic })
    deviceDB.tryVacate.mockResolvedValueOnce(TH.bad(Refusal))
    vault.lock()
    expect(vault.isLocked).to.be.true
    await TH.eventually(() => reported.mock.calls.length === 1)
    expect(onPanic).toHaveBeenCalledWith(Refusal)
    expect(vault.isDisabled).to.be.false
    expect(deviceDB.keptNow()).not.to.be.null
  })

  it("with no onPanic reports it and vacates the vault; the vacate's own refusal finds that done", async () => {
    const reported = vi.spyOn(globalThis, 'reportError').mockImplementation(() => undefined)
    const { vault, listing, deviceDB } = await makeBornVault()
    deviceDB.tryVacate.mockResolvedValue(TH.bad(Refusal))
    vault.lock()
    await TH.eventually(() => reported.mock.calls.length === 2)
    expect(reported).toHaveBeenCalledWith(Refusal)
    expect(vault.isDisabled).to.be.true
    expect(listing.at(vault.scope)).to.be.null
    expect(deviceDB.tryVacate).toHaveBeenCalledTimes(2)
  })
})

describe("The discards: sweep and vacate, down the chain", () => {
  const BoxDna = { boxlabel: 'anthropic_api_key', whisper: { val: 'sk-test' }, sidecar: {} }
  const makeVaultWithBox = async () => {
    const born = await makeBornVault()
    const box = await born.vault.boxListing.create({ ...born.vault.scope, ...BoxDna })
    return { ...born, box }
  }

  it("seals a box through the vault and opens it, end to end", async () => {
    const { box } = await makeVaultWithBox()
    expect(await box.unsealWhisper()).to.deep.eq({ val: 'sk-test' })
  })

  it("sweep leaves the row, drops the lease, disables and unlists all the way down", async () => {
    const { vault, listing, box, deviceDB } = await makeVaultWithBox()
    const { boxListing } = vault
    await box.expose()
    expect(vault.sweep()).to.equal(vault)
    expect(vault.isLocked).to.be.true
    expect(vault.isDisabled).to.be.true
    expect(box.isDisabled).to.be.true
    expect(listing.at(vault.scope)).to.be.null
    expect(boxListing.at(box.scope)).to.be.null
    expect(box.whisper).to.equal(LOCKED)
    expect(deviceDB.keptNow()).not.to.be.null
    expect(deviceDB.tryVacate).not.toHaveBeenCalled()
    expect(deviceDB.peek).not.toHaveBeenCalled()
  })

  it("vacate erases the row too, disables and unlists all the way down, and leaves the vaultDB untouched", async () => {
    const { vault, listing, box, deviceDB, demandStored } = await makeVaultWithBox()
    const stored = demandStored()
    vault.vacate()
    expect(vault.isLocked).to.be.true
    expect(box.isDisabled).to.be.true
    expect(listing.at(vault.scope)).to.be.null
    await TH.eventually(() => deviceDB.keptNow() === null)
    expect(demandStored()).to.eq(stored)
  })

  it("past a discard every guard refuses, what would take a call refuses, and lock, sweep and vacate are no-ops", async () => {
    const { vault, box, deviceDB } = await makeVaultWithBox()
    vault.sweep()
    TH.expectSyncRefusal(() => vault.demandEnabled(), 'bad_option')
    TH.expectSyncRefusal(() => vault.demandPresent(), 'bad_option')
    TH.expectSyncRefusal(() => box.demandUnlocked(), 'bad_option')
    await TH.expectRefusal(vault.ensureUnlocked(byPassphrase(Passphrase)), 'bad_option')
    await TH.expectRefusal(vault.fetch(), 'bad_option')
    await TH.expectRefusal(vault.sealStampedString('sk-test', Stamp), 'bad_option')
    expect(vault.lock().sweep().vacate()).to.equal(vault)
    expect(box.lock().sweep().vacate()).to.equal(box)
    expect(deviceDB.tryVacate).not.toHaveBeenCalled()
  })

  it("a listing past a sweep or a vacate takes no further call, and answers a late notice with nothing", async () => {
    const { listing, vault, demandStored } = await makeBornVault()
    const record = demandStored()
    await listing.hello()
    expect(listing.sweep()).to.equal(listing)
    expect(vault.isDisabled).to.be.true
    expect(listing.things).to.have.lengthOf(0)
    await TH.expectRefusal(listing.hello(), 'bad_option')
    await TH.expectRefusal(listing.fetch(vault.scope), 'bad_option')
    await TH.expectRefusal(listing.build(record), 'bad_option')
    expect(listing.vacate()).to.equal(listing)
    expect(listing.things).to.have.lengthOf(0)
  })

  it("a listener's throw at a discard goes to the platform, and the discard goes on", async () => {
    const reported = vi.spyOn(globalThis, 'reportError').mockImplementation(() => undefined)
    const { vault, listing } = await makeBornVault()
    vault.becomeNotifiable()
    const thrown = new Error('the listener threw')
    vault.subscribe(() => { throw thrown })
    vault.lock()
    expect(reported).toHaveBeenCalledWith(thrown)
    vault.sweep()
    expect(listing.at(vault.scope)).to.be.null
  })
})
