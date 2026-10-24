// fake-indexeddb installs a Node-side indexedDB global before the adapters load, so the device
// store browserOpts makes in the class's example is a real IndexedDB one.
import 'fake-indexeddb/auto'
import { describe, it, expect, vi } from 'vitest'
import { Bank } from '../src/bank'
import { VaultError, isVaultError } from '../src/errors'
import { memoryDeviceDB } from '../src/device-db'
import type { VaultDB } from '../src/vault-db'
import type { Tombstone } from '../src/types'
import { localVaultDB } from '../src/local-vault-db'
import { memoryStore } from '../src/string-store'
import { browserOpts } from '../src/browser'
import { type MakeBankOpts, type VaultDraft, parseMakeBankOpts, parseVaultDraft } from '../src/vault-opts'
import type { Gating } from '../src/gating'
import { Vault, bear, letGo } from '../src/vault'
import * as TH from './test-helpers'
import { damagedVaultWorld, makeWorld, makeRacingWorld, rolledBackWorld, u1VaultPropsCkey, VaultDBVerbsUsed, SevenDaysMillis } from './vault/world'

// == [Helpers]: U1, bankOptsOf, bankIn, recordOf, highestEpochOf, leaseFieldsOf, stepsOf, checkerLoading, keptTombstones

type World = ReturnType<typeof makeWorld>

/** The vault each world births, `u1`'s `main`, as a draft names it. */
const U1 = Object.freeze({ userId: 'u1', vaultlabel: 'main' })

/** `world`'s options for Bank.make, `overrides` in place: its vault's userId and vaultlabel left out, as each vault's draft takes them. */
const bankOptsOf = (world: World, overrides?: Partial<TH.BornVaultOpts>): MakeBankOpts => {
  const { userId: _userId, vaultlabel: _vaultlabel, ...bankOpts } = world.optsWith(overrides)
  return bankOpts
}

/** A bank made of `world`'s options, `overrides` in place. */
const bankIn = (world: World, overrides?: Partial<TH.BornVaultOpts>): Bank => Bank.make(bankOptsOf(world, overrides))

/** This device's record of u1's vault in `world`'s device store, or null for none. */
const recordOf = (world: World) => TH.expectGood(world.deviceDB.getDeviceRecord(TH.scopeOf('u1')))

/** The highest `vault_epoch` this device's record of u1's vault in `world` has seen, or null for no record. */
const highestEpochOf = async (world: World) => {
  const record = await recordOf(world)
  return record?.highest_vault_epoch ?? null
}

/** The fields of the lease u1's vault keeps in `world`'s device store that say whose it is and when it ends, or null for none. */
const leaseFieldsOf = async (world: World) => {
  const kept = await world.getLease()
  return kept === null ? null : { vault_tok: kept.vault_tok, gate_epoch: kept.gate_epoch, ask_passphrase_at: kept.ask_passphrase_at }
}

/** `statuses` with each run of one status cut to one: the steps an entry took, as a UI would see them. */
const stepsOf = (statuses: readonly (string | undefined)[]) => statuses.filter((status, ii) => ii === 0 || status !== statuses[ii - 1])

/** A strength checker admitting any passphrase, whose `load` is `load`. */
const checkerLoading = (load: () => void | Promise<void>) => Object.assign(vi.fn(TH.anyStrengthChecker), { load: vi.fn(load) })

/** The tombstones `vaultDB.delVault` resolves from now on, kept in a list as they land. */
const keptTombstones = (vaultDB: Pick<VaultDB, 'delVault'>): Tombstone[] => {
  const kept: Tombstone[] = []
  const delVault = vaultDB.delVault.bind(vaultDB)
  vi.spyOn(vaultDB, 'delVault').mockImplementation(async (scope, expected) => {
    const deleted = await delVault(scope, expected)
    if (deleted.ok) { kept.push(deleted.val) }
    return deleted
  })
  return kept
}
// --

// == [Bank.make]: examples, userId and vaultlabel refused, touches nothing

describe("Bank.make", () => {
  it("makes a bank of the app's options, and nothing more, as its first example shows", () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    const bank = Bank.make({ applabel: 'acme', vaultDB, ...browserOpts() })
    expect(bank.status).to.eq('made')
    expect(bank.applabel).to.eq('acme')
    expect(bank.getSnapshot()).to.deep.equal({ status: 'made', err: null, vaults: {} })
  })

  it("refuses userId and vaultlabel as 'bad_option', naming each as a vault's own, as its second example shows", () => {
    const opts = bankOptsOf(makeWorld())
    const err = TH.expectSyncRefusal(() => Bank.make({ ...opts, userId: 'u1' } as MakeBankOpts), 'bad_option')
    expect(err.message).to.include("userId (each vault's own: hand it to bank.ensureVault)")
    const both = TH.expectSyncRefusal(() => Bank.make({ ...opts, userId: 'u1', vaultlabel: 'main' } as MakeBankOpts), 'bad_option')
    expect(both.message).to.include("vaultlabel (each vault's own")
  })

  it("touches nothing: the bank is 'made', its snapshot holds no vault, and no store verb or load is called", async () => {
    const world = makeWorld()
    const vaultDBCalls = VaultDBVerbsUsed.map((verb) => vi.spyOn(world.vaultDB, verb))
    const deviceDBCalls = (Object.keys(world.deviceDB) as (keyof typeof world.deviceDB)[]).map((verb) => vi.spyOn(world.deviceDB, verb))
    const strengthChecker = checkerLoading(() => undefined)
    const bank = bankIn(world, { strengthChecker })
    await TH.wakeupAtNextTick()
    expect(bank.status).to.eq('made')
    expect(bank.snapshot.vaults).to.deep.equal({})
    for (const called of [...vaultDBCalls, ...deviceDBCalls, strengthChecker.load]) { expect(called).not.toHaveBeenCalled() }
  })
})
// --

// == [bank.hello]: the strength checker's load, once, shared, and again after a failure

describe("bank.hello", () => {
  it("loads the strength checker, and the bank is timely, as its example shows", async () => {
    const strengthChecker = checkerLoading(() => undefined)
    const bank = bankIn(makeWorld(), { strengthChecker })
    await bank.hello()   // bank.status: 'timely'
    expect(bank.status).to.eq('timely')
    expect(strengthChecker.load).toHaveBeenCalledOnce()
  })

  it("loads once: a hello while the load runs shares it, and one after it succeeded loads nothing", async () => {
    const gate = TH.makeGate()
    const strengthChecker = checkerLoading(() => gate.pass())
    const bank = bankIn(makeWorld(), { strengthChecker })
    const first = bank.hello()
    const second = bank.hello()
    await gate.reached
    expect(bank.status).to.eq('starting')
    gate.release()
    expect(await first).to.eq(bank)
    expect(await second).to.eq(bank)
    await bank.hello()
    expect(strengthChecker.load).toHaveBeenCalledOnce()
  })

  it("loads once when a listener says hello as the bank goes 'starting': its hello shares the load under way", async () => {
    const strengthChecker = checkerLoading(() => undefined)
    const bank = bankIn(makeWorld(), { strengthChecker })
    const heard: Promise<Bank>[] = []
    bank.subscribe(() => { if (bank.status === 'starting' && heard.length === 0) { heard.push(bank.hello()) } })
    await bank.hello()
    expect(heard).to.have.lengthOf(1)
    expect(await heard[0]).to.eq(bank)
    expect(bank.status).to.eq('timely')
    expect(strengthChecker.load).toHaveBeenCalledOnce()
  })

  it("leaves the bank 'refused' with its err when the load fails, and the next hello loads again", async () => {
    const thrown = new Error('the zxcvbn chunk did not load')
    const strengthChecker = checkerLoading(() => undefined)
    strengthChecker.load.mockRejectedValueOnce(thrown)
    const bank = bankIn(makeWorld(), { strengthChecker })
    const err = await TH.expectRefusal(bank.hello(), 'unexpected_error')
    expect(err.cause).to.eq(thrown)
    expect(bank.getSnapshot()).to.deep.include({ status: 'refused', err })
    await bank.hello()
    expect(bank.getSnapshot()).to.deep.include({ status: 'timely', err: null })
    expect(strengthChecker.load).toHaveBeenCalledTimes(2)
  })

  it("has ensureVault refuse while the load fails, birthing nothing", async () => {
    const world = makeWorld()
    const births = vi.spyOn(world.vaultDB, 'ensureVault')
    const bank = bankIn(world, { strengthChecker: checkerLoading(() => Promise.reject(new Error('offline'))) })
    const err = await TH.expectRefusal(bank.ensureVault(U1), 'unexpected_error')
    expect(births).not.toHaveBeenCalled()
    expect(bank.entryOf(U1)).to.deep.include({ status: 'refused', vault: null, err })
    expect(await TH.propsOf(world.vaultDB, TH.scopeOf('u1'))).to.be.null
  })
})
// --

// == [bank.ensureVault]: examples, novel and locked births, a draft amiss, one birth at a time

describe("bank.ensureVault", () => {
  it("births the vault a draft names, as its first example shows", async () => {
    const bank = bankIn(makeWorld())
    const session = { userId: 'u1' }
    const vault = await bank.ensureVault({ userId: session.userId, vaultlabel: 'main' })
    expect(vault.state).to.eq('novel')
    expect(bank.entryOf(U1)).to.deep.include({ status: 'timely', vault })
  })

  it("births a vault stored elsewhere, in the draft's own vaultDB, as its second example shows", async () => {
    const world = makeWorld()
    const bank = bankIn(world)
    const workVaultDB = localVaultDB({ store: memoryStore() })
    const userId = 'u1'
    const vault = await bank.ensureVault({ userId, vaultlabel: 'work', vaultDB: workVaultDB })   // a vault stored elsewhere
    expect(vault.vaultlabel).to.eq('work')
    expect(await TH.propsOf(workVaultDB, TH.scopeOf('u1', 'work'))).to.deep.include({ vault_tok: vault.vault_tok })
    expect(await TH.propsOf(world.vaultDB, TH.scopeOf('u1', 'work'))).to.be.null
  })

  it("births 'novel' over empty storage, its gateless props stored, and its vault_tok fixed for the Vault object's life", async () => {
    const world = makeWorld()
    const vault = await bankIn(world).ensureVault(U1)
    expect(vault.getSnapshot()).to.deep.include({ state: 'novel', gate_epoch: 0, passphrase: null })
    expect(await TH.propsOf(world.vaultDB, TH.scopeOf('u1'))).to.deep.include({ vault_tok: vault.vault_tok, gate_epoch: 0, passphrase: null, passkey: null })
    const bornAs = vault.vault_tok
    await TH.unlock(vault, 'pw')
    await vault.hello({ staleMinutes: 0 })
    expect(vault.vault_tok).to.eq(bornAs)
  })

  it("births 'locked' over a vault gated elsewhere", async () => {
    const world = makeWorld()
    const maker = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    const vault = await bankIn(world).ensureVault(U1)
    expect(vault.getSnapshot()).to.deep.include({ state: 'locked', vault_tok: maker.vault_tok, gate_epoch: 1 })
  })

  it("refuses a draft amiss before storage is touched: 'bad_option' for no bag or a field it does not take, 'bad_label' for a name", async () => {
    const world = makeWorld()
    const births = vi.spyOn(world.vaultDB, 'ensureVault')
    const bank = bankIn(world)
    for (const draft of [undefined, null, 'u1', { ...U1, leaseHours: 1 }, { ...U1, vaultDB: 'elsewhere' }]) {
      await TH.expectRefusal(bank.ensureVault(draft as unknown as typeof U1), 'bad_option')
    }
    for (const draft of [{ ...U1, userId: '' }, { ...U1, vaultlabel: 'not-a-label' }, { vaultlabel: 'main' }]) {
      await TH.expectRefusal(bank.ensureVault(draft as unknown as typeof U1), 'bad_label')
    }
    expect(births).not.toHaveBeenCalled()
  })

  it("refuses a draft naming other stores than the vault held was born from 'bad_option', during its birth and after, handing back the held one to a draft naming its own", async () => {
    const world = makeWorld()
    const bank = bankIn(world)
    const elsewhere = { ...U1, vaultDB: localVaultDB({ store: memoryStore() }) }
    const birth = bank.ensureVault(U1)
    await TH.expectRefusal(bank.ensureVault(elsewhere), 'bad_option')
    const vault = await birth
    await TH.expectRefusal(bank.ensureVault(elsewhere), 'bad_option')
    await TH.expectRefusal(bank.ensureVault({ ...U1, deviceDB: memoryDeviceDB() }), 'bad_option')
    expect(await bank.ensureVault({ ...U1, vaultDB: world.vaultDB, deviceDB: world.deviceDB })).to.eq(vault)
    expect(bank.entryOf(U1)?.vault).to.eq(vault)
    const moved = await bank.reopenVault(elsewhere)
    expect(moved).to.not.eq(vault)
    await TH.expectRefusal(bank.ensureVault(U1), 'bad_option')
  })

  it("refuses a vaultDB made afresh over the same storage 'bad_option', saying stores are compared as objects", async () => {
    const world = makeWorld()
    const bank = bankIn(world)
    await bank.ensureVault(U1)
    const err = await TH.expectRefusal(bank.ensureVault({ ...U1, vaultDB: localVaultDB({ store: world.dbStore }) }), 'bad_option')
    expect(err.message).to.include('the same vaultDB object')
    expect(err.message).to.include('make each store once')
  })

  it("hands two asks at once one Vault object, calling vaultDB.ensureVault once, and a third ask, once timely, the same", async () => {
    const world = makeWorld()
    const births = vi.spyOn(world.vaultDB, 'ensureVault')
    const bank = bankIn(world)
    const [first, second] = await Promise.all([bank.ensureVault(U1), bank.ensureVault(U1)])
    expect(second).to.eq(first)
    expect(births).toHaveBeenCalledOnce()
    expect(await bank.ensureVault(U1)).to.eq(first)
    expect(births).toHaveBeenCalledOnce()
  })
})
// --

// == [Taking a lease up at birth]: the one that fits, and those left lying

describe("a lease taken up at birth", () => {
  it("takes up a lease of the vault's gate, not ended and ending within leaseHours: born unlocked until its deadline, then locked", async () => {
    const world = makeWorld()
    const maker = await world.openUnlocked('pw')
    const kept = await leaseFieldsOf(world)
    TH.closeVault(maker)
    const vault = await world.open()
    expect(vault.state).to.eq('unlocked')
    expect(vault.askPassphraseAt).to.eq(kept?.ask_passphrase_at)
    world.advance((kept?.ask_passphrase_at ?? 0) - world.clock.now() + 1)
    await vault.hello()
    expect(vault.state).to.eq('locked')
  })

  /** Each lease that does not fit the vault born after it: what happens between the unlock that granted it and the birth, and the birth's options. */
  const UnfitLeases: readonly (readonly [(world: World) => Promise<Partial<TH.BornVaultOpts>>, string])[] = [
    [(world) => { world.advance(SevenDaysMillis + 1); return Promise.resolve({}) },        'a lease that has ended'],
    [async (world) => {
      const elsewhere = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
      await TH.putWayin(elsewhere, 'pw', 'new phrase')
      return {}
    },                                                                                          'a lease of another gate_epoch, the passphrase changed elsewhere'],
    [async (world) => {
      const elsewhere = await world.open({ deviceDB: memoryDeviceDB() })
      await TH.del(elsewhere, 'pw')
      const remade = await TH.bankOf(elsewhere).ensureVault(U1)
      await TH.unlock(remade, 'pw')
      return {}
    },                                                                                          'a lease of another vault_tok, another life of the vault'],
    [() => Promise.resolve({ leaseHours: 1 }),                                                 'a lease ending past leaseHours from now, granted under a longer leaseHours'],
  ]

  for (const [meanwhile, blurb] of UnfitLeases) {
    it(`leaves ${blurb} where it lies, and is born locked`, async () => {
      const world = makeWorld()
      TH.closeVault(await world.openUnlocked('pw'))
      const kept = await leaseFieldsOf(world)
      const overrides = await meanwhile(world)
      const vault = await world.open(overrides)
      expect(vault.state).to.eq('locked')
      expect(await leaseFieldsOf(world)).to.deep.equal(kept)
    })
  }
})
// --

// == [vault_behind at birth]: refused, told once, and clearCachedVault's way out

/** What a host asks its support before accepting a vault restored from an older copy: here, yes. */
const supportConfirmedTheRestore = () => true

/** A world whose `u1` vault this device saw at a newer copy than storage now serves: the older copy restored over it. */
const behindWorld = async () => {
  const { world, vault, older } = await rolledBackWorld()
  TH.closeVault(vault)
  world.dbStore.write(u1VaultPropsCkey, older)
  return { world, olderEpoch: (JSON.parse(older) as { vault_epoch: number }).vault_epoch }
}

describe("a vault served behind this device's record", () => {
  it("refuses 'vault_behind' at birth, nothing born, the entry refused and onBadNews told once; clearCachedVault then ensureVault births it", async () => {
    const { world, olderEpoch } = await behindWorld()
    const onBadNews = vi.fn()
    const bank = bankIn(world, { onBadNews })
    const err = await TH.expectRefusal(bank.ensureVault(U1), 'vault_behind')
    expect(bank.entryOf(U1)).to.deep.include({ status: 'refused', vault: null, err })
    expect(onBadNews).toHaveBeenCalledOnce()
    expect(onBadNews).toHaveBeenCalledWith(err)
    await bank.clearCachedVault(U1)
    const vault = await bank.ensureVault(U1)
    expect(vault.state).to.eq('locked')
    expect(vault.stamp.vault_epoch).to.eq(olderEpoch)
    expect(await highestEpochOf(world)).to.eq(olderEpoch)
    expect(onBadNews).toHaveBeenCalledOnce()
  })

  it("lets the entry go only once this device's record and lease are erased, so a listener asking again then takes up no lease", async () => {
    const world = makeWorld()
    const bank = bankIn(world)
    const vault = await bank.ensureVault(U1)
    await TH.unlock(vault, 'pw')
    expect(await world.getLease()).to.not.be.null
    const asked: Promise<Vault>[] = []
    bank.subscribe(() => { if (bank.entryOf(U1) === null && asked.length === 0) { asked.push(bank.ensureVault(U1)) } })
    const gate = TH.holdNextCall(world.deviceDB, 'delLease')
    const clearing = bank.clearCachedVault(U1)
    await gate.reached
    await TH.wakeupAtNextTick()
    gate.release()
    await clearing
    expect(asked).to.have.lengthOf(1)
    const reborn = await asked[0]
    expect(reborn?.state).to.eq('locked')
    expect(await world.getLease()).to.be.null
  })

  it("accepts the vault storage holds once support confirms the restore, as clearCachedVault's example shows", async () => {
    const world = makeWorld()
    TH.closeVault(await world.openUnlocked('pw'))
    await TH.expectGood(world.deviceDB.raiseDeviceRecord(TH.deviceRecordOf('u1', { highest_vault_epoch: 9 })))
    const bank = bankIn(world)
    const userId = 'u1'
    const err = await TH.expectRefusal(bank.ensureVault(U1), 'vault_behind')
    if (isVaultError(err, 'vault_behind') && supportConfirmedTheRestore()) {
      await bank.clearCachedVault({ userId, vaultlabel: 'main' })
      await bank.ensureVault({ userId, vaultlabel: 'main' })
    }
    expect(bank.entryOf(U1)?.status).to.eq('timely')
    expect(await world.getLease()).to.be.null
    expect(await highestEpochOf(world)).to.eq(1)
  })
})
// --

// == [damaged_vault at birth]: delDamagedVault's way out

describe("bank.delDamagedVault", () => {
  it("deletes a vault refused 'damaged_vault' with the bank's own stores, letting its entry go; the next ensureVault births a new life, novel, as its example shows", async () => {
    const world = await damagedVaultWorld()
    const bank = bankIn(world)
    const { userId, vaultlabel } = U1
    const { err } = await bank.tryEnsureVault(U1)
    expect(bank.entryOf(U1)?.status).to.eq('refused')
    const confirm = vi.fn(() => true)
    if (isVaultError(err, 'damaged_vault') && confirm()) {
      await bank.delDamagedVault({ userId, vaultlabel: 'main' })
      expect(bank.entryOf(U1)).to.be.null
      await bank.ensureVault({ userId, vaultlabel })
    }
    expect(confirm).toHaveBeenCalledOnce()
    expect(await world.getLease()).to.be.null
    expect(bank.entryOf(U1)?.vault?.state).to.eq('novel')
  })

  it("lets the entry go and still refuses 'stale_write' when the vault was made anew elsewhere as it deleted: the next ensureVault births the vault that stands", async () => {
    const world = await damagedVaultWorld()
    const bank = bankIn(world)
    await TH.expectRefusal(bank.ensureVault(U1), 'damaged_vault')
    const elsewhere = bankIn(world, { deviceDB: memoryDeviceDB() })
    const delDamagedVault = world.vaultDB.delDamagedVault.bind(world.vaultDB)
    vi.spyOn(world.vaultDB, 'delDamagedVault').mockImplementationOnce(async (scope) => {
      await TH.expectGood(delDamagedVault(scope))
      await elsewhere.ensureVault(U1)
      return TH.bad(new VaultError('stale_write', 'The vault was made anew elsewhere while it was being deleted.'))
    })
    await TH.expectRefusal(bank.delDamagedVault(U1), 'stale_write')
    expect(bank.entryOf(U1)).to.be.null
    const standing = await bank.ensureVault(U1)
    expect(standing.vault_tok).to.eq(elsewhere.entryOf(U1)?.vault?.vault_tok)
    expect(standing.state).to.eq('novel')
  })

  it("keeps the refused entry when storage refuses the delete 'storage_unavailable': a second call deletes, and the next ensureVault births a new life, novel", async () => {
    const world = await damagedVaultWorld()
    const bank = bankIn(world)
    await TH.expectRefusal(bank.ensureVault(U1), 'damaged_vault')
    vi.spyOn(world.vaultDB, 'delDamagedVault').mockResolvedValueOnce(TH.bad(new VaultError('storage_unavailable', 'Storage could not be reached: try again shortly.')))
    await TH.expectRefusal(bank.delDamagedVault(U1), 'storage_unavailable')
    expect(bank.entryOf(U1)?.status).to.eq('refused')
    await bank.delDamagedVault(U1)
    expect(bank.entryOf(U1)).to.be.null
    const reborn = await bank.ensureVault(U1)
    expect(reborn.state).to.eq('novel')
  })

  it("refuses a vault that reads sound 'bad_option', deleting nothing and keeping its Vault object, and a bad name 'bad_label'", async () => {
    const world = makeWorld()
    const bank = bankIn(world)
    const vault = await bank.ensureVault(U1)
    await TH.expectRefusal(bank.delDamagedVault(U1), 'bad_option')
    const stored = await TH.expectGood(world.vaultDB.getVault(TH.scopeOf('u1')))
    expect(stored).to.not.be.null
    expect(bank.entryOf(U1)?.vault).to.eq(vault)
    await TH.expectRefusal(bank.delDamagedVault({ userId: 'u1', vaultlabel: 'Not A Label' }), 'bad_label')
  })
})
// --

// == [The device record]: raised at birth, at a refresh, at each own write, at del(), never lowered

describe("this device's record of the vault", () => {
  it("is raised at birth: a device_id minted and kept by a later birth, highest_vault_epoch the vault's", async () => {
    const world = makeWorld()
    await world.open()
    const minted = await recordOf(world)
    expect(minted).to.deep.include({ highest_vault_epoch: 0 })
    expect(minted?.device_id).to.have.length.greaterThan(0)
    await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    await world.open()
    expect(await recordOf(world)).to.deep.include({ device_id: minted?.device_id, highest_vault_epoch: 1 })
  })

  it("is raised at a refresh: another device's passphrase change reaches this device's record at its next hello", async () => {
    const world = makeWorld()
    const elsewhere = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    const vault = await world.open({ vaultDB: world.deafVaultDB() })
    expect(await highestEpochOf(world)).to.eq(1)
    await TH.putWayin(elsewhere, 'pw', 'new phrase')
    expect(await highestEpochOf(world)).to.eq(1)
    await vault.hello({ staleMinutes: 0 })
    expect(await highestEpochOf(world)).to.eq(2)
  })

  it("is raised by this device's own gate writes: the first unlock, putWayin and delWayin", async () => {
    const world = makeWorld()
    const vault = await world.open({ vaultDB: world.deafVaultDB() })
    const seen: number[] = []
    for (const write of [() => TH.unlock(vault, 'pw'), async () => TH.putWayin(vault, 'pw', await TH.passkeyOf('laptop')), () => TH.delWayin(vault, 'pw')]) {
      await write()
      seen.push(await highestEpochOf(world) ?? -1)
      expect(seen.at(-1)).to.eq(vault.stamp.vault_epoch)
    }
    expect(seen).to.deep.equal([1, 2, 3])
  })

  it("is raised by del() to the tombstone's vault_epoch", async () => {
    const world = makeWorld()
    const vaultDB = world.deafVaultDB()
    const vault = await world.openUnlocked('pw', { vaultDB })
    const tombstones = keptTombstones(vaultDB)
    await TH.del(vault, 'pw')
    expect(tombstones).to.have.lengthOf(1)
    const tombstoneEpoch = tombstones[0]?.vault_epoch ?? -1
    expect(tombstoneEpoch).to.be.greaterThan(1)
    expect(await highestEpochOf(world)).to.eq(tombstoneEpoch)
  })

  it("names the device that sealed each way in: the record's device_id", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await TH.putWayin(vault, 'pw', await TH.passkeyOf('laptop'))
    const record = await recordOf(world)
    const deviceId = record?.device_id
    expect(vault.passphrase?.device_id).to.eq(deviceId)
    expect(vault.passkey?.device_id).to.eq(deviceId)
  })

  it("is never lowered by another tab's raise of a lower epoch: one whose read was served before this tab's change", async () => {
    const world = makeWorld()
    const tab = await world.openUnlocked('pw')
    const deaf = world.deafVaultDB()
    const otherTab = await world.open({ vaultDB: deaf })
    const served = TH.holdNextAnswer(deaf, 'getVault')
    const refreshing = otherTab.tryRefresh()
    await served.reached
    await TH.putWayin(tab, 'pw', 'new phrase')
    expect(await highestEpochOf(world)).to.eq(2)
    served.release()
    await TH.expectGood(refreshing)
    expect(otherTab.stamp.vault_epoch).to.eq(1)
    expect(await highestEpochOf(world)).to.eq(2)
  })
})
// --

// == [Gone and made anew]: del() and the next life, a stale device, a refresh finding the vault deleted

describe("a vault deleted, and its next life", () => {
  it("leaves the Vault gone after del(), every call 'vault_gone'; bank.ensureVault births a new life, novel, past the tombstone", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const bank = TH.bankOf(vault)
    const tombstones = keptTombstones(world.vaultDB)
    await TH.del(vault, 'pw')
    expect(tombstones).to.have.lengthOf(1)
    const tombstoneEpoch = tombstones[0]?.vault_epoch ?? -1
    for (const call of [() => vault.hello(), () => TH.unlock(vault, 'pw'), () => vault.getBox('anthropic'), () => vault.lock(), () => vault.del()]) {
      await TH.expectRefusal(call(), 'vault_gone')
    }
    expect(bank.entryOf(U1)).to.deep.include({ status: 'refused', vault: null })
    expect(bank.entryOf(U1)?.err?.refusalkind).to.eq('vault_gone')
    const next = await bank.ensureVault(U1)
    expect(next).to.not.eq(vault)
    expect(next.state).to.eq('novel')
    expect(next.vault_tok).to.not.eq(vault.vault_tok)
    expect(next.stamp.vault_epoch).to.be.at.least(tombstoneEpoch)
    expect(next.boxes).to.have.lengthOf(0)
    expect(await highestEpochOf(world)).to.be.at.least(tombstoneEpoch)
  })

  it("has a stale device's hello refuse 'vault_remade' once another device deletes and remakes the vault: gone for good, its entry refused, and its next birth the new life, locked", async () => {
    const world = makeWorld()
    const stale = await world.openUnlocked('pw', { vaultDB: world.deafVaultDB() })
    await stale.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const elsewhere = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.del(elsewhere, 'pw')
    const remade = await TH.bankOf(elsewhere).ensureVault(U1)
    await TH.unlock(remade, 'another phrase')
    await remade.putBox({ boxlabel: 'openai' }, 'sk-fake-two')
    await TH.expectRefusal(stale.hello({ staleMinutes: 0 }), 'vault_remade')
    await TH.expectRefusal(stale.getWhisper('anthropic'), 'vault_remade')
    await TH.expectRefusal(TH.unlock(stale, 'pw'), 'vault_remade')
    const bank = TH.bankOf(stale)
    expect(bank.entryOf(U1)?.status).to.eq('refused')
    expect(bank.entryOf(U1)?.err?.refusalkind).to.eq('vault_remade')
    const reborn = await bank.ensureVault(U1)
    expect(reborn.getSnapshot()).to.deep.include({ state: 'locked', vault_tok: remade.vault_tok })
    expect(reborn.boxes.map((box) => box.boxlabel)).to.deep.equal(['openai'])
    expect(await remade.getWhisper('openai')).to.eq('sk-fake-two')
  })

  it("has a refresh that finds the vault deleted elsewhere refuse 'vault_gone': gone for good, its entry refused, and its next birth a new, novel life", async () => {
    const world = makeWorld()
    const stale = await world.openUnlocked('pw', { vaultDB: world.deafVaultDB() })
    const elsewhere = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.del(elsewhere, 'pw')
    await TH.expectRefusal(stale.refresh(), 'vault_gone')
    await TH.expectRefusal(stale.lock(), 'vault_gone')
    const bank = TH.bankOf(stale)
    expect(bank.entryOf(U1)?.err?.refusalkind).to.eq('vault_gone')
    const reborn = await bank.ensureVault(U1)
    expect(reborn.state).to.eq('novel')
    expect(reborn.vault_tok).to.not.eq(stale.vault_tok)
  })

  it("refuses a birth whose Vault object goes gone before the bank files it 'vault_gone': the entry refused, never handing out the gone Vault object, and the next birth a new, novel life", async () => {
    const world = makeWorld()
    const maker = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    const bank = bankIn(world)
    await TH.del(maker, 'pw')
    // The newborn left as its watch leaves it on finding the vault deleted in the microtasks
    // before the bank files it -- gone, the bank told a microtask on -- which no read in this
    // process is quick enough to race.
    const bearing = Vault[bear].bind(Vault)
    vi.spyOn(Vault, bear).mockImplementationOnce((parts, born, onGone) => {
      const newborn = bearing(parts, born, onGone)
      newborn[letGo]()
      queueMicrotask(() => { onGone(new VaultError('vault_gone', 'This vault was deleted.')) })
      return newborn
    })
    await TH.expectBad(bank.tryEnsureVault(U1), 'vault_gone')
    expect(bank.entryOf(U1)).to.deep.include({ status: 'refused', vault: null })
    expect(bank.entryOf(U1)?.err?.refusalkind).to.eq('vault_gone')
    const reborn = await bank.ensureVault(U1)
    expect(reborn.state).to.eq('novel')
  })
})
// --

// == [Letting go]: closeVault, closeVaults, reopenVault, a let-go landing mid-call

describe("bank.closeVault", () => {
  it("lets the vault go: every call 'vault_gone', its entry out of the snapshot, its lease kept, and the next birth takes the lease up", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const bank = TH.bankOf(vault)
    bank.closeVault(U1)
    await TH.expectRefusal(vault.hello(), 'vault_gone')
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'vault_gone')
    expect(bank.entryOf(U1)).to.be.null
    expect(await world.getLease()).to.not.be.null
    const next = await bank.ensureVault(U1)
    expect(next).to.not.eq(vault)
    expect(next.state).to.eq('unlocked')
  })

  it("lets the vault go, as its example shows", async () => {
    const vault = await makeWorld().open()
    const bank = TH.bankOf(vault)
    const userId = 'u1'
    bank.closeVault({ userId, vaultlabel: 'main' })
    await TH.expectBad(vault.tryHello(), 'vault_gone')
    // A vault the bank no longer holds is no refusal.
    bank.closeVault({ userId, vaultlabel: 'main' })
    expect(bank.snapshot.vaults).to.deep.equal({})
  })

  it("ends the gating standing: its lockLanded settles, and the call waiting on it refuses vault_gone", async () => {
    const world = makeWorld()
    TH.closeVault(await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() }))
    const seen: { gating: Gating | null, landed: boolean } = { gating: null, landed: false }
    const vault = await world.open({ requestCleartext: (gating) => {
      seen.gating = gating
      void gating.lockLanded.then(() => { seen.landed = true })
      return new Promise(() => { /* the user never answers */ })
    } })
    const waiting = vault.tryEnsureUnlocked()
    await TH.eventually(() => seen.gating !== null)
    TH.closeVault(vault)
    await TH.expectBad(waiting, 'vault_gone')
    expect(seen.landed).to.be.true
  })

  it("refuses a birth under way 'vault_gone' when it lands during the birth's read", async () => {
    const world = makeWorld()
    const bank = bankIn(world)
    const reading = TH.holdNextCall(world.vaultDB, 'ensureVault')
    const birth = bank.tryEnsureVault(U1)
    await reading.reached
    expect(bank.entryOf(U1)?.status).to.eq('starting')
    bank.closeVault(U1)
    expect(bank.entryOf(U1)).to.be.null
    reading.release()
    await TH.expectBad(birth, 'vault_gone')
    expect(bank.entryOf(U1)).to.be.null
  })
})

describe("bank.closeVaults and bank.reopenVault", () => {
  it("lets every vault go at sign-out, as closeVaults's example shows", async () => {
    const world = makeWorld()
    const bank = bankIn(world)
    const vaults = [await bank.ensureVault(U1), await bank.ensureVault({ userId: 'u1', vaultlabel: 'work' })]
    const signingOut: (() => void)[] = []
    const onSignOut = (handler: () => void) => { signingOut.push(handler) }
    onSignOut(() => { bank.closeVaults() })
    for (const handler of signingOut) { handler() }
    for (const vault of vaults) { await TH.expectRefusal(vault.hello(), 'vault_gone') }
    expect(bank.snapshot.vaults).to.deep.equal({})
  })

  it("hands back a new Vault object, the one let go gone, as reopenVault's example shows", async () => {
    const vault = await makeWorld().openUnlocked('pw')
    const bank = TH.bankOf(vault)
    const userId = 'u1'
    const reopened = await bank.reopenVault({ userId, vaultlabel: 'main' })   // after 'vault_gone', say
    expect(reopened).to.not.eq(vault)
    expect(reopened.state).to.eq('unlocked')
    await TH.expectRefusal(vault.hello(), 'vault_gone')
    expect(bank.entryOf(U1)?.vault).to.eq(reopened)
  })
})

describe("a let-go landing mid-call", () => {
  it("refuses ensureUnlocked 'vault_gone' when it lands during the call's hello, never calling requestCleartext", async () => {
    const world = makeRacingWorld()
    TH.closeVault(await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() }))
    const requestCleartext = vi.fn()
    const vault = await world.open({ staleMinutes: 0, requestCleartext })
    const looking = world.holdNextLook()
    const leasing = vault.tryEnsureUnlocked()
    await looking.reached
    TH.closeVault(vault)
    looking.release()
    await TH.expectBad(leasing, 'vault_gone')
    expect(requestCleartext).not.toHaveBeenCalled()
  })

  it("refuses ensureUnlocked 'vault_gone' when it lands during the gating's pantry consult, never calling requestCleartext", async () => {
    const world = makeWorld()
    TH.closeVault(await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() }))
    const requestCleartext = vi.fn()
    const vault = await world.open({ requestCleartext })
    // The hello within staleMinutes of the birth reads nothing: this device's store is next read by the take-up.
    const takingUp = TH.holdNextCall(world.deviceDB, 'getLease')
    const leasing = vault.tryEnsureUnlocked()
    await takingUp.reached
    TH.closeVault(vault)
    takingUp.release()
    await TH.expectBad(leasing, 'vault_gone')
    expect(requestCleartext).not.toHaveBeenCalled()
  })

  for (const [callname, call] of [['tryHello', (vault: Vault) => vault.tryHello({ staleMinutes: 0 })], ['tryRefresh', (vault: Vault) => vault.tryRefresh()]] as const) {
    it(`resolves ${callname} 'vault_gone' when it lands during the call's read`, async () => {
      const world = makeRacingWorld()
      const vault = await world.open()
      const looking = world.holdNextLook()
      const reading = call(vault)
      await looking.reached
      TH.closeVault(vault)
      looking.release()
      await TH.expectBad(reading, 'vault_gone')
    })
  }
})
// --

// == [The first unlock]: a let-go while it derives, a gate made elsewhere

describe("the first unlock of a novel vault", () => {
  it("refuses 'vault_gone' when a let-go lands while the key deriver is held, and storage keeps the gateless props", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    const deriving = world.holdNextDerive()
    const unlocking = TH.tryUnlock(vault, 'pw')
    await deriving.reached
    TH.closeVault(vault)
    deriving.release()
    await TH.expectBad(unlocking, 'vault_gone')
    expect(await TH.propsOf(world.vaultDB, TH.scopeOf('u1'))).to.deep.include({ gate_epoch: 0, passphrase: null })
  })

  it("refuses 'gate_made_elsewhere' when another device set the first gate meanwhile, even with its passphrase, writing nothing; the next hello shows locked, and that passphrase unlocks", async () => {
    const world = makeRacingWorld()
    const here = await world.open({ vaultDB: world.deafVaultDB() })
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    expect([here.state, there.state]).to.deep.equal(['novel', 'novel'])
    const deriving = world.holdNextDerive()
    const unlocking = TH.tryUnlock(here, 'there phrase')
    await deriving.reached
    await TH.unlock(there, 'there phrase')
    const gated = await TH.propsOf(world.vaultDB, TH.scopeOf('u1'))
    deriving.release()
    await TH.expectBad(unlocking, 'gate_made_elsewhere')
    expect(await TH.propsOf(world.vaultDB, TH.scopeOf('u1'))).to.deep.equal(gated)
    expect(here.state).to.eq('novel')
    await here.hello()
    expect(here.state).to.eq('locked')
    await TH.unlock(here, 'there phrase')
    expect(here.state).to.eq('unlocked')
  })
})
// --

// == [The snapshot]: entryOf, subscribe, getSnapshot

describe("bank.entryOf, bank.subscribe and bank.getSnapshot", () => {
  it("keeps the snapshot's identity until something changes, an entry moving from starting to timely", async () => {
    const bank = bankIn(makeWorld())
    const made = bank.getSnapshot()
    expect(bank.getSnapshot()).to.eq(made)
    const statuses: (string | undefined)[] = []
    bank.subscribe(() => { statuses.push(bank.entryOf(U1)?.status) })
    await bank.ensureVault(U1)
    expect(stepsOf(statuses)).to.deep.equal(['starting', 'timely'])
    const settled = bank.getSnapshot()
    expect(settled).to.not.eq(made)
    await bank.ensureVault(U1)
    await bank.hello()
    expect(bank.getSnapshot()).to.eq(settled)
    expect(Object.isFrozen(settled)).to.be.true
    expect(Object.isFrozen(settled.vaults)).to.be.true
  })

  it("births once when a listener asks for the vault as each change lands: every ask, the bank's own 'starting' and the entry's among them, joins the birth under way", async () => {
    const world = makeWorld()
    const ensureVault = vi.spyOn(world.vaultDB, 'ensureVault')
    const bank = bankIn(world)
    const asked: Promise<Vault>[] = []
    bank.subscribe(() => { if (bank.entryOf(U1)?.status !== 'timely') { asked.push(bank.ensureVault(U1)) } })
    const vault = await bank.ensureVault(U1)
    expect(asked.length).to.be.at.least(2)
    for (const ask of asked) { expect(await ask).to.eq(vault) }
    expect(ensureVault).toHaveBeenCalledOnce()
    expect(bank.entryOf(U1)?.vault).to.eq(vault)
  })

  it("reads nothing for a birth let go in the task that asked for it, its caller refused 'vault_gone'", async () => {
    const world = makeWorld()
    const ensureVault = vi.spyOn(world.vaultDB, 'ensureVault')
    const getDeviceRecord = vi.spyOn(world.deviceDB, 'getDeviceRecord')
    const bank = bankIn(world)
    const asked = bank.ensureVault(U1)
    bank.closeVault(U1)
    await TH.expectRefusal(asked, 'vault_gone')
    expect(ensureVault).not.toHaveBeenCalled()
    expect(getDeviceRecord).not.toHaveBeenCalled()
    expect(bank.entryOf(U1)).to.be.null
  })

  it("moves an entry from starting to refused when its birth is refused, the refusal kept", async () => {
    const world = makeWorld()
    const unreachable = new VaultError('storage_unavailable', 'Storage could not be reached: try again shortly.')
    vi.spyOn(world.vaultDB, 'ensureVault').mockResolvedValueOnce(TH.bad(unreachable))
    const bank = bankIn(world)
    const statuses: (string | undefined)[] = []
    bank.subscribe(() => { statuses.push(bank.entryOf(U1)?.status) })
    await TH.expectRefusal(bank.ensureVault(U1), 'storage_unavailable')
    expect(stepsOf(statuses)).to.deep.equal(['starting', 'refused'])
    expect(bank.entryOf(U1)?.err).to.eq(unreachable)
    expect(await bank.ensureVault(U1)).to.eq(bank.entryOf(U1)?.vault)
  })

  it("hands subscribe and getSnapshot to useSyncExternalStore as they are, as the class's second example shows", async () => {
    const bank = bankIn(makeWorld())
    const heard = vi.fn()
    const useSyncExternalStore = (subscribe: (listener: () => void) => () => void, getSnapshot: () => unknown) => {
      subscribe(heard)
      return getSnapshot()
    }
    const snapshot = useSyncExternalStore(bank.subscribe, bank.getSnapshot)
    expect(snapshot).to.eq(bank.snapshot)
    await bank.ensureVault(U1)
    expect(heard).toHaveBeenCalled()
  })

  it("stops telling a listener once it unsubscribes, and refuses a listener that is no function 'bad_option', at once", async () => {
    const bank = bankIn(makeWorld())
    const heard = vi.fn()
    const unsubscribe = bank.subscribe(heard)
    unsubscribe()
    await bank.ensureVault(U1)
    expect(heard).not.toHaveBeenCalled()
    TH.expectSyncRefusal(() => bank.subscribe('listen' as unknown as () => void), 'bad_option')
  })

  it("reads an entry's status, or undefined for a vault not asked for, as entryOf's example shows; a bad name refuses 'bad_label'", async () => {
    const bank = bankIn(makeWorld())
    expect(bank.entryOf({ userId: 'u1', vaultlabel: 'main' })?.status).to.be.undefined
    await bank.ensureVault(U1)
    expect(bank.entryOf({ userId: 'u1', vaultlabel: 'main' })?.status).to.eq('timely')
    TH.expectSyncRefusal(() => bank.entryOf({ userId: 'u1', vaultlabel: 'not-a-label' }), 'bad_label')
  })

  it("births a vault through the browser's defaults, as the class's first example shows", async () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    const session = { userId: 'u1' }
    const bank = Bank.make({ applabel: 'acme', vaultDB, ...browserOpts() })   // once, at module level
    const vault = await bank.ensureVault({ userId: session.userId, vaultlabel: 'main' })
    expect(vault.state).to.eq('novel')   // 'novel' | 'locked' | 'unlocked'
    expect(bank.status).to.eq('timely')
  })
})
// --

// == [Parsing]: parseMakeBankOpts, parseVaultDraft

describe("parseMakeBankOpts", () => {
  it("reads the bank's options before storage is touched, as its example shows", () => {
    const world = makeWorld()
    const { applabel, leaseMillis } = parseMakeBankOpts(bankOptsOf(world, { leaseHours: 2 }))
    expect(applabel).to.eq('acme')
    expect(leaseMillis).to.eq(2 * 60 * 60 * 1000)
  })
})

describe("parseVaultDraft", () => {
  it("names the draft's scope under the bank's applabel, as its example shows", () => {
    const bank = parseMakeBankOpts(bankOptsOf(makeWorld()))
    const { scope } = parseVaultDraft({ userId: 'u1', vaultlabel: 'main' }, bank)
    expect(scope).to.deep.equal({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })
  })

  it("refuses a name that fails its check as bad_label, and a misspelt field as bad_option", () => {
    const bank = parseMakeBankOpts(bankOptsOf(makeWorld()))
    TH.expectSyncRefusal(() => parseVaultDraft({ userId: 'u^1', vaultlabel: 'main' }, bank), 'bad_label')
    TH.expectSyncRefusal(() => parseVaultDraft({ userId: 'u1', vaultlabel: 'main', vaultlable: 'x' } as VaultDraft, bank), 'bad_option')
  })
})
// --
