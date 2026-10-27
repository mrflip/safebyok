// fake-indexeddb installs a Node-side indexedDB global before the adapters load, so the device
// store browserOpts makes in the class's example is a real IndexedDB one.
import 'fake-indexeddb/auto'
import { describe, it, expect, vi } from 'vitest'
import { Bank, type BankSnapshot } from '../src/bank'
import { VaultError, isVaultError } from '../src/errors'
import { memoryDeviceDB } from '../src/device-db'
import type { VaultDB } from '../src/vault-db'
import type { VaultTombstone } from '../src/shapes/vault'
import { localVaultDB } from '../src/local-vault-db'
import { memoryStore } from '../src/string-store'
import { browserOpts } from '../src/browser'
import type { MakeBankOpts, BankVaultOpts } from '../src/shapes/bank-opts'
import { parseMakeBankOpts, vaultPartsOf } from '../src/vault-opts'
import type { Gating } from '../src/gating'
import type { KeyDeriver } from '../src/key-deriver'
import { Vault, bear, letGo } from '../src/vault'
import * as TH from './test-helpers'
import { damagedVaultWorld, makeWorld, makeRacingWorld, rolledBackWorld, u1VaultScopepath, VaultDBVerbsUsed, SevenDaysMillis } from './vault/world'

// == [Helpers]: Main, bankOptsOf, bankIn, recordOf, gotVaultOf, highestEpochOf, leaseFieldsOf, storeSnapshotOf, stepsOf, checkerLoading, keptTombstones

type World = ReturnType<typeof makeWorld>

/** The vault each world births, `u1`'s `main`, as a call of u1's bank names it. */
const Main = Object.freeze({ vaultlabel: 'main' })

/** `world`'s options for Bank.make, u1's, `overrides` in place: its vault's vaultlabel left out, as each call naming the vault takes it. */
const bankOptsOf = (world: World, overrides?: Partial<TH.BornVaultOpts>): MakeBankOpts => {
  const { vaultlabel: _vaultlabel, ...bankOpts } = world.optsWith(overrides)
  return bankOpts
}

/** A bank made of `world`'s options, `overrides` in place. */
const bankIn = (world: World, overrides?: Partial<TH.BornVaultOpts>): Bank => Bank.make(bankOptsOf(world, overrides))

/** This device's record of u1's vault in `world`'s device store, or null for none. */
const recordOf = (world: World) => TH.expectGood(world.deviceDB.getDeviceRecord(TH.scopeOf('u1')))

/** What `vaultDB.getVault` answers for u1's vault in `world`: null for none stored. */
const gotVaultOf = (world: World) => TH.expectGood(world.vaultDB.getVault(TH.scopeOf('u1')))

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

/** What `useSyncExternalStore` renders from, outside React: the snapshot `getSnapshot` hands back. */
const storeSnapshotOf = (_subscribe: unknown, getSnapshot: () => BankSnapshot): BankSnapshot => getSnapshot()

/** `lifecycles` with each run of one lifecycle cut to one: the steps a vault in the listing took, as a UI would see them. */
const stepsOf = (lifecycles: readonly (string | undefined)[]) => lifecycles.filter((lifecycle, ii) => ii === 0 || lifecycle !== lifecycles[ii - 1])

/** A strength checker admitting any passphrase, whose `load` is `load`. */
const checkerLoading = (load: () => void | Promise<void>) => Object.assign(vi.fn(TH.anyStrengthChecker), { load: vi.fn(load) })

/** The tombstones `vaultDB.delVault` resolves from now on, kept in a list as they land. */
const keptTombstones = (vaultDB: Pick<VaultDB, 'delVault'>): VaultTombstone[] => {
  const kept: VaultTombstone[] = []
  const delVault = vaultDB.delVault.bind(vaultDB)
  vi.spyOn(vaultDB, 'delVault').mockImplementation(async (scope, expected) => {
    const deleted = await delVault(scope, expected)
    if (deleted.ok) { kept.push(deleted.val) }
    return deleted
  })
  return kept
}
// --

// == [Bank.make]: examples, vaultlabel refused, user_id required, touches nothing

describe("Bank.make", () => {
  it("makes a bank of the app's options for the signed-in user, and nothing more, as its first example shows", () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    const session = { user_id: 'u1' }
    const bank = Bank.make({ applabel: 'acme', user_id: session.user_id, vaultDB, ...browserOpts() })   // as the user signs in
    expect(bank.lifecycle).to.eq('made')
    expect(bank.applabel).to.eq('acme')
    expect(bank.user_id).to.eq('u1')
    expect(bank.scope).to.deep.equal({ applabel: 'acme', user_id: 'u1' })
    expect(Object.isFrozen(bank.scope)).to.be.true
    expect(bank.getSnapshot()).to.deep.equal({ applabel: 'acme', user_id: 'u1', lifecycle: 'made', vaults: [] })
  })

  it("refuses vaultlabel as 'bad_option', counting it and naming the options it takes, as its second example shows", () => {
    const opts = bankOptsOf(makeWorld())
    const err = TH.expectSyncRefusal(() => Bank.make({ ...opts, vaultlabel: 'main' } as MakeBankOpts), 'bad_option')
    expect(err.message).to.match(/^In Bank\.make's options: There is a field it does not take \(its name is not repeated\): it takes only applabel, user_id, /)
    expect(err.message).to.not.include('vaultlabel')
  })

  it("refuses a user_id left out or failing its check as 'bad_scope', naming the field", () => {
    const { user_id: _user_id, ...opts } = bankOptsOf(makeWorld())
    for (const user_id of [undefined, '', 'u^1', 42]) {
      const err = TH.expectSyncRefusal(() => Bank.make({ ...opts, user_id } as MakeBankOpts), 'bad_scope')
      expect(err.meta?.fieldnames).to.deep.equal(['user_id'])
    }
  })

  it("refuses a keyDeriver whose load is no function 'bad_option'", () => {
    const keyDeriver = { ...TH.testDeriver, load: 'soon' }
    const err = TH.expectSyncRefusal(() => bankIn(makeWorld(), { keyDeriver: keyDeriver as unknown as KeyDeriver }), 'bad_option')
    expect(err.message).to.include('its load, if it carries one, is a function too')
  })

  it("touches nothing: the bank is 'made', its snapshot holds no vault, and no store verb or load is called", async () => {
    const world = makeWorld()
    const vaultDBCalls = VaultDBVerbsUsed.map((verb) => vi.spyOn(world.vaultDB, verb))
    const deviceDBCalls = (Object.keys(world.deviceDB) as (keyof typeof world.deviceDB)[]).map((verb) => vi.spyOn(world.deviceDB, verb))
    const strengthChecker = checkerLoading(() => undefined)
    const bank = bankIn(world, { strengthChecker })
    await TH.wakeupAtNextTick()
    expect(bank.lifecycle).to.eq('made')
    expect(bank.vaults).to.deep.equal([])
    for (const called of [...vaultDBCalls, ...deviceDBCalls, strengthChecker.load]) { expect(called).not.toHaveBeenCalled() }
  })
})
// --

// == [bank.hello]: the strength checker's and key deriver's loads, once, shared, and again after a failure

describe("bank.hello", () => {
  it("loads the strength checker, and the bank is ready, as its example shows", async () => {
    const strengthChecker = checkerLoading(() => undefined)
    const bank = bankIn(makeWorld(), { strengthChecker })
    await bank.hello()   // bank.lifecycle: 'ready'
    expect(bank.lifecycle).to.eq('ready')
    expect(strengthChecker.load).toHaveBeenCalledOnce()
  })

  it("loads once: a hello while the load runs shares it, and one after it succeeded loads nothing", async () => {
    const gate = TH.makeLatch()
    const strengthChecker = checkerLoading(() => gate.pass())
    const bank = bankIn(makeWorld(), { strengthChecker })
    const first = bank.hello()
    const second = bank.hello()
    await gate.reached
    expect(bank.lifecycle).to.eq('starting')
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
    bank.subscribe(() => { if (bank.lifecycle === 'starting' && heard.length === 0) { heard.push(bank.hello()) } })
    await bank.hello()
    expect(heard).to.have.lengthOf(1)
    expect(await heard[0]).to.eq(bank)
    expect(bank.lifecycle).to.eq('ready')
    expect(strengthChecker.load).toHaveBeenCalledOnce()
  })

  it("leaves the bank 'refused' with its err when the load fails, and the next hello loads again", async () => {
    const thrown = new Error('the zxcvbn chunk did not load')
    const strengthChecker = checkerLoading(() => undefined)
    strengthChecker.load.mockRejectedValueOnce(thrown)
    const bank = bankIn(makeWorld(), { strengthChecker })
    const err = await TH.expectRefusal(bank.hello(), 'unexpected_error')
    expect(err.cause).to.eq(thrown)
    expect(bank.getSnapshot()).to.deep.include({ lifecycle: 'refused', err })
    await bank.hello()
    expect(bank.getSnapshot()).to.deep.include({ lifecycle: 'ready' }).and.not.have.property('err')
    expect(strengthChecker.load).toHaveBeenCalledTimes(2)
  })

  it("loads the key deriver too, beside the strength checker, once", async () => {
    const keyDeriver = { ...TH.testDeriver, load: vi.fn(() => undefined) }
    const strengthChecker = checkerLoading(() => undefined)
    const bank = bankIn(makeWorld(), { keyDeriver, strengthChecker })
    await bank.hello()
    await bank.ensureVault(Main)
    expect(bank.lifecycle).to.eq('ready')
    expect(keyDeriver.load).toHaveBeenCalledOnce()
    expect(strengthChecker.load).toHaveBeenCalledOnce()
  })

  it("refuses as the key deriver's load failed, 'unexpected_error' with what it threw the cause, and the next hello loads again", async () => {
    const thrown = new Error('the WebAssembly module did not load')
    const keyDeriver = { ...TH.testDeriver, load: vi.fn(() => undefined) }
    keyDeriver.load.mockImplementationOnce(() => { throw thrown })
    const bank = bankIn(makeWorld(), { keyDeriver })
    const err = await TH.expectRefusal(bank.hello(), 'unexpected_error')
    expect(err.cause).to.eq(thrown)
    expect(err.message).to.include("keyDeriver's load()")
    expect(bank.getSnapshot()).to.deep.include({ lifecycle: 'refused', err })
    await bank.hello()
    expect(bank.getSnapshot()).to.deep.include({ lifecycle: 'ready' }).and.not.have.property('err')
    expect(keyDeriver.load).toHaveBeenCalledTimes(2)
  })

  it("refuses as the strength checker's load did where both fail", async () => {
    const keyDeriver = { ...TH.testDeriver, load: vi.fn(() => Promise.reject(new Error('no wasm'))) }
    const strengthChecker = checkerLoading(() => Promise.reject(new Error('no zxcvbn')))
    const err = await TH.expectRefusal(bankIn(makeWorld(), { keyDeriver, strengthChecker }).hello(), 'unexpected_error')
    expect(err.message).to.include("strengthChecker's load()")
  })

  it("is 'starting', its err null, as a hello after a failure loads again: the refusal told of a load no longer under way", async () => {
    const gate = TH.makeLatch()
    const strengthChecker = checkerLoading(() => gate.pass())
    strengthChecker.load.mockRejectedValueOnce(new Error('offline'))
    const bank = bankIn(makeWorld(), { strengthChecker })
    await TH.expectRefusal(bank.hello(), 'unexpected_error')
    const again = bank.hello()
    await gate.reached
    expect(bank.getSnapshot()).to.deep.include({ lifecycle: 'starting' }).and.not.have.property('err')
    gate.release()
    expect(await again).to.eq(bank)
  })

  it("runs a checker and a deriver made once and handed to two banks at each bank's hello, as each bank loads its own", async () => {
    const world = makeWorld()
    const keyDeriver = { ...TH.testDeriver, load: vi.fn(() => undefined) }
    const strengthChecker = checkerLoading(() => undefined)
    const banks = [bankIn(world, { keyDeriver, strengthChecker }), bankIn(world, { keyDeriver, strengthChecker, user_id: 'u2' })]
    for (const bank of banks) { await bank.hello() }
    expect(keyDeriver.load).toHaveBeenCalledTimes(2)
    expect(strengthChecker.load).toHaveBeenCalledTimes(2)
  })

  it("has ensureVault refuse while the load fails, birthing nothing", async () => {
    const world = makeWorld()
    const births = vi.spyOn(world.vaultDB, 'ensureVault')
    const bank = bankIn(world, { strengthChecker: checkerLoading(() => Promise.reject(new Error('offline'))) })
    const err = await TH.expectRefusal(bank.ensureVault(Main), 'unexpected_error')
    expect(births).not.toHaveBeenCalled()
    expect(bank.bankVaultOf(Main)).to.deep.include({ lifecycle: 'refused', err })
    expect(bank.vaultOf(Main)).to.be.null
    expect(await TH.vaultRecordIn(world.vaultDB, TH.scopeOf('u1'))).to.be.null
  })
})
// --

// == [bank.ensureVault]: examples, novel and locked births, a bag or options amiss, one birth at a time

describe("bank.ensureVault", () => {
  it("births the vault a bag names, as its first example shows", async () => {
    const bank = bankIn(makeWorld())
    const vault = await bank.ensureVault({ vaultlabel: 'main' })
    expect(TH.stateOf(vault.snapshot)).to.eq('novel')
    expect(vault).to.deep.include({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })
    expect(bank.bankVaultOf(Main)).to.deep.include({ lifecycle: 'ready' })
    expect(bank.vaultOf(Main)).to.eq(vault)
  })

  it("births a vault stored elsewhere, in its options' own vaultDB, as its second example shows", async () => {
    const world = makeWorld()
    const bank = bankIn(world)
    const workVaultDB = localVaultDB({ store: memoryStore() })
    const vault = await bank.ensureVault({ vaultlabel: 'work' }, { vaultDB: workVaultDB })   // a vault stored elsewhere
    expect(vault.vaultlabel).to.eq('work')
    expect(await TH.vaultRecordIn(workVaultDB, TH.scopeOf('u1', 'work'))).to.deep.include({ vault_tok: vault.vault_tok })
    expect(await TH.vaultRecordIn(world.vaultDB, TH.scopeOf('u1', 'work'))).to.be.null
  })

  it("births 'novel' over empty storage, its gateless vault record stored, and its vault_tok fixed for the Vault object's life", async () => {
    const world = makeWorld()
    const vault = await bankIn(world).ensureVault(Main)
    expect(TH.stateOf(vault.getSnapshot())).to.eq('novel')
    expect(TH.cheatGetVaultEpoch(vault).gate_epoch).to.eq(0)
    expect(await TH.vaultRecordIn(world.vaultDB, TH.scopeOf('u1'))).to.deep.include({ vault_tok: vault.vault_tok, gate_epoch: 0, gate: null })
    const bornAs = vault.vault_tok
    await TH.unlock(vault, 'pw')
    await vault.hello({ staleMinutes: 0 })
    expect(vault.vault_tok).to.eq(bornAs)
  })

  it("births 'locked' over a vault gated elsewhere", async () => {
    const world = makeWorld()
    const maker = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    const vault = await bankIn(world).ensureVault(Main)
    expect(TH.stateOf(vault.getSnapshot())).to.eq('locked')
    expect(TH.cheatGetVaultEpoch(vault).gate_epoch).to.eq(1)
    expect(vault.getSnapshot()).to.deep.include({ vault_tok: maker.vault_tok })
  })

  it("takes a bag of the vaultlabel, and of the bank's own applabel and user_id if it likes, handing back the vault held", async () => {
    const bank = bankIn(makeWorld())
    const vault = await bank.ensureVault(Main)
    for (const bag of [Main, { ...Main, user_id: 'u1' }, { ...Main, user_id: 'u1', applabel: 'acme' }, { vaultlabel: vault.vaultlabel }]) {
      expect(await bank.ensureVault(bag)).to.eq(vault)
    }
  })

  it("refuses a bag of another user or app than the bank's 'bad_scope', naming the field and quoting neither, before storage is touched", async () => {
    const world = makeWorld()
    const births = vi.spyOn(world.vaultDB, 'ensureVault')
    const bank = bankIn(world)
    const other = await TH.expectRefusal(bank.ensureVault({ ...Main, user_id: 'u2' }), 'bad_scope')
    expect(other.meta?.fieldnames).to.deep.equal(['user_id'])
    expect(other.message).to.not.include('u2')
    const both = await TH.expectRefusal(bank.ensureVault({ ...TH.scopeOf('u2'), applabel: 'other' }), 'bad_scope')
    expect(both.meta?.fieldnames).to.deep.equal(['applabel', 'user_id'])
    expect(births).not.toHaveBeenCalled()
    expect(bank.vaults).to.deep.equal([])
  })

  it("refuses a bag or options amiss before storage is touched: 'bad_scope' for no bag or a name that fails, 'bad_option' for options it does not take", async () => {
    const world = makeWorld()
    const births = vi.spyOn(world.vaultDB, 'ensureVault')
    const bank = bankIn(world)
    for (const bag of [undefined, null, 'main', {}, { ...Main, user_id: '' }, { vaultlabel: 'not-a-label' }]) {
      await TH.expectRefusal(bank.ensureVault(bag as unknown as typeof Main), 'bad_scope')
    }
    for (const opts of [null, 'elsewhere', { leaseHours: 1 }, { vaultlabel: 'main' }, { vaultDB: 'elsewhere' }]) {
      await TH.expectRefusal(bank.ensureVault(Main, opts as unknown as BankVaultOpts), 'bad_option')
    }
    expect(births).not.toHaveBeenCalled()
  })

  it("refuses a store in the bag 'bad_scope', naming neither the field nor its value, before either store is touched: a vault's own stores go in the second bag", async () => {
    const world = makeWorld()
    const elsewhere = makeWorld()
    const births = [vi.spyOn(world.vaultDB, 'ensureVault'), vi.spyOn(elsewhere.vaultDB, 'ensureVault')]
    const bank = bankIn(world)
    for (const bag of [{ ...Main, vaultDB: elsewhere.vaultDB }, { ...Main, deviceDB: elsewhere.deviceDB }]) {
      const refusal = await TH.expectRefusal(bank.ensureVault(bag as unknown as typeof Main), 'bad_scope')
      expect(refusal.message).to.match(/^In the bag naming the vault: /u)
      expect(refusal.message).to.include("A vault's stores go in the second bag, its options")
    }
    for (const birth of births) { expect(birth).not.toHaveBeenCalled() }
    expect(bank.vaults).to.deep.equal([])
  })

  it("names the vault by whatever carries its label -- a Vault object, its snapshot, its element of the bank's listing, its record, a bag with a stray field -- the same from every call naming a vault, as vaultBag's second example shows", async () => {
    const world = makeWorld()
    const bank = bankIn(world)
    const vault = await bank.ensureVault(Main)
    const [bankVault] = bank.vaults
    const record = await TH.vaultRecordIn(world.vaultDB, TH.scopeOf('u1'))
    const bags: unknown[] = [vault, vault.getSnapshot(), bankVault, record, { ...Main, leaseHours: 1 }]
    for (const bag of bags) {
      const named = bag as typeof Main
      expect(bank.vaultOf(named)).to.eq(vault)
      expect(bank.bankVaultOf(named)).to.eq(bankVault)
      expect(await bank.ensureVault(named)).to.eq(vault)
    }
    bank.closeVault(vault)
    expect(bank.vaultOf(Main)).to.be.null
  })

  it("refuses 'bad_scope' a carrier naming another bank's user, from every call naming a vault", async () => {
    const world = makeWorld()
    const bank = bankIn(world)
    const other = { ...TH.scopeOf('u2') }
    await TH.expectRefusal(bank.ensureVault(other), 'bad_scope')
    await TH.expectRefusal(bank.reopenVault(other), 'bad_scope')
    await TH.expectRefusal(bank.clearCachedVault(other), 'bad_scope')
    await TH.expectRefusal(bank.delDamagedVault(other), 'bad_scope')
    for (const lookup of [() => bank.vaultOf(other), () => bank.bankVaultOf(other), () => { bank.closeVault(other) }]) {
      expect(lookup).to.throw(VaultError).with.property('refusalkind', 'bad_scope')
    }
  })

  it("refuses options naming other stores than the vault held was born from 'bad_option', during its birth and after, handing back the held one to options naming its own", async () => {
    const world = makeWorld()
    const bank = bankIn(world)
    const elsewhere = { vaultDB: localVaultDB({ store: memoryStore() }) }
    const birth = bank.ensureVault(Main)
    await TH.expectRefusal(bank.ensureVault(Main, elsewhere), 'bad_option')
    const vault = await birth
    await TH.expectRefusal(bank.ensureVault(Main, elsewhere), 'bad_option')
    await TH.expectRefusal(bank.ensureVault(Main, { deviceDB: memoryDeviceDB() }), 'bad_option')
    expect(await bank.ensureVault(Main, { vaultDB: world.vaultDB, deviceDB: world.deviceDB })).to.eq(vault)
    expect(bank.vaultOf(Main)).to.eq(vault)
    const moved = await bank.reopenVault(Main, elsewhere)
    expect(moved).to.not.eq(vault)
    await TH.expectRefusal(bank.ensureVault(Main), 'bad_option')
  })

  it("refuses a vaultDB made afresh over the same storage 'bad_option', saying stores are compared as objects", async () => {
    const world = makeWorld()
    const bank = bankIn(world)
    await bank.ensureVault(Main)
    const err = await TH.expectRefusal(bank.ensureVault(Main, { vaultDB: localVaultDB({ store: world.dbStore }) }), 'bad_option')
    expect(err.message).to.include('the same vaultDB object')
    expect(err.message).to.include('make each store once')
  })

  it("hands two asks at once one Vault object, calling vaultDB.ensureVault once, and a third ask, once ready, the same", async () => {
    const world = makeWorld()
    const births = vi.spyOn(world.vaultDB, 'ensureVault')
    const bank = bankIn(world)
    const [first, second] = await Promise.all([bank.ensureVault(Main), bank.ensureVault(Main)])
    expect(second).to.eq(first)
    expect(births).toHaveBeenCalledOnce()
    expect(await bank.ensureVault(Main)).to.eq(first)
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
    expect(TH.stateOf(vault.snapshot)).to.eq('unlocked')
    expect(vault.snapshot.ask_passphrase_at).to.eq(kept?.ask_passphrase_at)
    world.advance((kept?.ask_passphrase_at ?? 0) - world.clock.now() + 1)
    await vault.hello()
    expect(TH.stateOf(vault.snapshot)).to.eq('locked')
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
      const remade = await TH.bankOf(elsewhere).ensureVault(Main)
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
      expect(TH.stateOf(vault.snapshot)).to.eq('locked')
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
  world.dbStore.write(u1VaultScopepath, older)
  return { world, olderEpoch: (JSON.parse(older) as { vault_epoch: number }).vault_epoch }
}

describe("a vault served behind this device's record", () => {
  it("refuses 'vault_behind' at birth, nothing born, the entry refused and onBadNews told once; clearCachedVault then ensureVault births it", async () => {
    const { world, olderEpoch } = await behindWorld()
    const onBadNews = vi.fn()
    const bank = bankIn(world, { onBadNews })
    const err = await TH.expectRefusal(bank.ensureVault(Main), 'vault_behind')
    expect(bank.bankVaultOf(Main)).to.deep.include({ lifecycle: 'refused', err })
    expect(bank.vaultOf(Main)).to.be.null
    expect(onBadNews).toHaveBeenCalledOnce()
    expect(onBadNews).toHaveBeenCalledWith(err)
    await bank.clearCachedVault(Main)
    const vault = await bank.ensureVault(Main)
    expect(TH.stateOf(vault.snapshot)).to.eq('locked')
    expect(TH.cheatGetVaultEpoch(vault).vault_epoch).to.eq(olderEpoch)
    expect(await highestEpochOf(world)).to.eq(olderEpoch)
    expect(onBadNews).toHaveBeenCalledOnce()
  })

  it("lets the entry go only once this device's record and lease are erased, so a listener asking again then takes up no lease", async () => {
    const world = makeWorld()
    const bank = bankIn(world)
    const vault = await bank.ensureVault(Main)
    await TH.unlock(vault, 'pw')
    expect(await world.getLease()).to.not.be.null
    const asked: Promise<Vault>[] = []
    bank.subscribe(() => { if (bank.bankVaultOf(Main) === null && asked.length === 0) { asked.push(bank.ensureVault(Main)) } })
    const gate = TH.holdNextCall(world.deviceDB, 'delLease')
    const clearing = bank.clearCachedVault(Main)
    await gate.reached
    await TH.wakeupAtNextTick()
    gate.release()
    await clearing
    expect(asked).to.have.lengthOf(1)
    const reborn = await asked[0]
    expect(reborn && TH.stateOf(reborn.snapshot)).to.eq('locked')
    expect(await world.getLease()).to.be.null
  })

  it("accepts the vault storage holds once support confirms the restore, as clearCachedVault's example shows", async () => {
    const world = makeWorld()
    TH.closeVault(await world.openUnlocked('pw'))
    await TH.expectGood(world.deviceDB.raiseDeviceRecord(TH.deviceRecordOf('u1', { highest_vault_epoch: 9 })))
    const bank = bankIn(world)
    const err = await TH.expectRefusal(bank.ensureVault(Main), 'vault_behind')
    if (isVaultError(err, 'vault_behind') && supportConfirmedTheRestore()) {
      await bank.clearCachedVault({ vaultlabel: 'main' })
      await bank.ensureVault({ vaultlabel: 'main' })
    }
    expect(bank.bankVaultOf(Main)?.lifecycle).to.eq('ready')
    expect(await world.getLease()).to.be.null
    expect(await highestEpochOf(world)).to.eq(1)
  })
})

describe("bank.clearCachedVault", () => {
  it("is a quiet success for a vault the bank holds no entry for and storage holds none: no unlock, no passphrase asked, no vaultDB verb called", async () => {
    const world = makeWorld()
    const vaultDBCalls = VaultDBVerbsUsed.map((verb) => vi.spyOn(world.vaultDB, verb))
    const requestCleartext = vi.fn(TH.scriptedRequestCleartext)
    const bank = bankIn(world, { requestCleartext })
    expect(await bank.tryClearCachedVault(Main)).to.deep.equal({ ok: true, val: undefined })
    await bank.clearCachedVault(Main)
    expect(bank.bankVaultOf(Main)).to.be.null
    expect(await recordOf(world)).to.be.null
    for (const called of [...vaultDBCalls, requestCleartext]) { expect(called).not.toHaveBeenCalled() }
  })

  it("erases the record and the lease an earlier session left, for a vault this bank never opened, opening nothing", async () => {
    const world = makeWorld()
    TH.closeVault(await world.openUnlocked('pw'))
    expect(await world.getLease()).to.not.be.null
    expect(await recordOf(world)).to.not.be.null
    const vaultDBCalls = VaultDBVerbsUsed.map((verb) => vi.spyOn(world.vaultDB, verb))
    const requestCleartext = vi.fn(TH.scriptedRequestCleartext)
    const bank = bankIn(world, { requestCleartext })
    await bank.clearCachedVault(Main)
    expect(await recordOf(world)).to.be.null
    expect(await world.getLease()).to.be.null
    expect(bank.bankVaultOf(Main)).to.be.null
    for (const called of [...vaultDBCalls, requestCleartext]) { expect(called).not.toHaveBeenCalled() }
  })

  it("erases in the deviceDB its options name and lets go the entry the bank holds for the scope, whichever stores that was born from: no stores are checked", async () => {
    const world = makeWorld()
    const bank = bankIn(world)
    await bank.ensureVault(Main)
    const otherDeviceDB = memoryDeviceDB()
    await TH.expectGood(otherDeviceDB.raiseDeviceRecord(TH.deviceRecordOf('u1')))
    await bank.clearCachedVault(Main, { deviceDB: otherDeviceDB })
    expect(bank.bankVaultOf(Main)).to.be.null
    const otherRecord = await TH.expectGood(otherDeviceDB.getDeviceRecord(TH.scopeOf('u1')))
    expect(otherRecord).to.be.null
    expect(await recordOf(world)).to.not.be.null
  })

  it("keeps the entry when the device store refuses 'storage_unavailable' as it erases: a second call erases both and lets it go", async () => {
    const world = makeWorld()
    const bank = bankIn(world)
    const vault = await bank.ensureVault(Main)
    vi.spyOn(world.deviceDB, 'delLease').mockResolvedValueOnce(TH.bad(new VaultError('storage_unavailable', 'The device store could not be reached: try again shortly.')))
    await TH.expectRefusal(bank.clearCachedVault(Main), 'storage_unavailable')
    expect(bank.vaultOf(Main)).to.eq(vault)
    expect(await recordOf(world)).to.be.null
    await bank.clearCachedVault(Main)
    expect(bank.bankVaultOf(Main)).to.be.null
  })
})
// --

// == [damaged_vault at birth]: delDamagedVault's way out

describe("bank.delDamagedVault", () => {
  it("deletes a vault refused 'damaged_vault' with the bank's own stores, letting it go; the next ensureVault births a new life, novel, as its example shows", async () => {
    const world = await damagedVaultWorld()
    const bank = bankIn(world)
    await bank.tryEnsureVault(Main)
    const confirm = vi.fn(() => true)
    const bankVault = bank.bankVaultOf({ vaultlabel: 'main' })
    expect(bankVault?.lifecycle).to.eq('refused')
    if (bankVault?.lifecycle === 'refused' && isVaultError(bankVault.err, 'damaged_vault') && confirm()) {
      await bank.delDamagedVault({ vaultlabel: 'main' })
      expect(bank.bankVaultOf(Main)).to.be.null
      await bank.ensureVault({ vaultlabel: 'main' })
    }
    expect(confirm).toHaveBeenCalledOnce()
    expect(await world.getLease()).to.be.null
    const reopened = bank.vaultOf(Main)
    expect(reopened && TH.stateOf(reopened.snapshot)).to.eq('novel')
  })

  it("lets the entry go and still refuses 'stale_write' when the vault was made anew elsewhere as it deleted: the next ensureVault births the vault that stands", async () => {
    const world = await damagedVaultWorld()
    const bank = bankIn(world)
    await TH.expectRefusal(bank.ensureVault(Main), 'damaged_vault')
    const elsewhere = bankIn(world, { deviceDB: memoryDeviceDB() })
    const delDamagedVault = world.vaultDB.delDamagedVault.bind(world.vaultDB)
    vi.spyOn(world.vaultDB, 'delDamagedVault').mockImplementationOnce(async (scope) => {
      await TH.expectGood(delDamagedVault(scope))
      await elsewhere.ensureVault(Main)
      return TH.bad(new VaultError('stale_write', 'The vault was made anew elsewhere while it was being deleted.'))
    })
    await TH.expectRefusal(bank.delDamagedVault(Main), 'stale_write')
    expect(bank.bankVaultOf(Main)).to.be.null
    const standing = await bank.ensureVault(Main)
    expect(standing.vault_tok).to.eq(elsewhere.vaultOf(Main)?.vault_tok)
    expect(TH.stateOf(standing.snapshot)).to.eq('novel')
  })

  it("keeps the refused entry when storage refuses the delete 'storage_unavailable': a second call deletes, and the next ensureVault births a new life, novel", async () => {
    const world = await damagedVaultWorld()
    const bank = bankIn(world)
    await TH.expectRefusal(bank.ensureVault(Main), 'damaged_vault')
    vi.spyOn(world.vaultDB, 'delDamagedVault').mockResolvedValueOnce(TH.bad(new VaultError('storage_unavailable', 'Storage could not be reached: try again shortly.')))
    await TH.expectRefusal(bank.delDamagedVault(Main), 'storage_unavailable')
    expect(bank.bankVaultOf(Main)?.lifecycle).to.eq('refused')
    await bank.delDamagedVault(Main)
    expect(bank.bankVaultOf(Main)).to.be.null
    const reborn = await bank.ensureVault(Main)
    expect(TH.stateOf(reborn.snapshot)).to.eq('novel')
  })

  it("refuses a vault that reads sound 'bad_option', deleting nothing and keeping its Vault object, and a bad name 'bad_scope'", async () => {
    const world = makeWorld()
    const bank = bankIn(world)
    const vault = await bank.ensureVault(Main)
    await TH.expectRefusal(bank.delDamagedVault(Main), 'bad_option')
    const stored = await TH.expectGood(world.vaultDB.getVault(TH.scopeOf('u1')))
    expect(stored).to.not.be.null
    expect(bank.vaultOf(Main)).to.eq(vault)
    await TH.expectRefusal(bank.delDamagedVault({ vaultlabel: 'Not A Label' }), 'bad_scope')
  })

  it("deletes a damaged vault the bank holds no entry for, never asked of it: storage's own checks decide, and the next ensureVault births a new life, novel", async () => {
    const world = await damagedVaultWorld()
    const requestCleartext = vi.fn(TH.scriptedRequestCleartext)
    const bank = bankIn(world, { requestCleartext })
    expect(bank.bankVaultOf(Main)).to.be.null
    await bank.delDamagedVault(Main)
    expect(bank.bankVaultOf(Main)).to.be.null
    expect(await gotVaultOf(world)).to.be.null
    expect(await world.getLease()).to.be.null
    expect(requestCleartext).not.toHaveBeenCalled()
    const reborn = await bank.ensureVault(Main)
    expect(TH.stateOf(reborn.snapshot)).to.eq('novel')
  })

  it("refuses a sound vault the bank holds no entry for 'bad_option', as storage decides: nothing deleted, this device's lease kept", async () => {
    const world = makeWorld()
    TH.closeVault(await world.openUnlocked('pw'))
    const bank = bankIn(world)
    await TH.expectRefusal(bank.delDamagedVault(Main), 'bad_option')
    expect(await gotVaultOf(world)).to.not.be.null
    expect(await world.getLease()).to.not.be.null
    expect(bank.bankVaultOf(Main)).to.be.null
  })

  it("is a quiet success with no vault stored and no entry held, as storage finds nothing to delete", async () => {
    const world = makeWorld()
    const bank = bankIn(world)
    await bank.delDamagedVault(Main)
    expect(bank.bankVaultOf(Main)).to.be.null
    expect(await gotVaultOf(world)).to.be.null
  })

  it("lets go the entry the bank holds for the scope once options naming another vaultDB delete there, whichever stores the entry was born from: no stores are checked", async () => {
    const world = makeWorld()
    const bank = bankIn(world)
    await bank.ensureVault(Main)
    const otherVaultDB = localVaultDB({ store: memoryStore() })
    await bank.delDamagedVault(Main, { vaultDB: otherVaultDB })
    expect(bank.bankVaultOf(Main)).to.be.null
    expect(await gotVaultOf(world)).to.not.be.null
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
      expect(seen.at(-1)).to.eq(TH.cheatGetVaultEpoch(vault).vault_epoch)
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
    expect(vault.snapshot.gate?.passphrase.device_id).to.eq(deviceId)
    expect(vault.snapshot.gate?.passkey?.device_id).to.eq(deviceId)
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
    expect(TH.cheatGetVaultEpoch(otherTab).vault_epoch).to.eq(1)
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
    expect(bank.bankVaultOf(Main)).to.deep.include({ lifecycle: 'refused' })
    expect(bank.vaultOf(Main)).to.be.null
    expect(bank.bankVaultOf(Main)).to.have.nested.property('err.refusalkind', 'vault_gone')
    const next = await bank.ensureVault(Main)
    expect(next).to.not.eq(vault)
    expect(TH.stateOf(next.snapshot)).to.eq('novel')
    expect(next.vault_tok).to.not.eq(vault.vault_tok)
    expect(TH.cheatGetVaultEpoch(next).vault_epoch).to.be.at.least(tombstoneEpoch)
    expect(next.snapshot.boxes).to.have.lengthOf(0)
    expect(await highestEpochOf(world)).to.be.at.least(tombstoneEpoch)
  })

  it("has a stale device's hello refuse 'vault_remade' once another device deletes and remakes the vault: gone for good, its entry refused, and its next birth the new life, locked", async () => {
    const world = makeWorld()
    const stale = await world.openUnlocked('pw', { vaultDB: world.deafVaultDB() })
    await stale.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const elsewhere = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.del(elsewhere, 'pw')
    const remade = await TH.bankOf(elsewhere).ensureVault(Main)
    await TH.unlock(remade, 'another phrase')
    await remade.putBox({ boxlabel: 'openai' }, 'sk-fake-two')
    await TH.expectRefusal(stale.hello({ staleMinutes: 0 }), 'vault_remade')
    await TH.expectRefusal(stale.getWhisper('anthropic'), 'vault_remade')
    await TH.expectRefusal(TH.unlock(stale, 'pw'), 'vault_remade')
    const bank = TH.bankOf(stale)
    expect(bank.bankVaultOf(Main)?.lifecycle).to.eq('refused')
    expect(bank.bankVaultOf(Main)).to.have.nested.property('err.refusalkind', 'vault_remade')
    const reborn = await bank.ensureVault(Main)
    expect(TH.stateOf(reborn.getSnapshot())).to.eq('locked')
    expect(reborn.getSnapshot()).to.deep.include({ vault_tok: remade.vault_tok })
    expect(reborn.snapshot.boxes.map((box) => box.boxlabel)).to.deep.equal(['openai'])
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
    expect(bank.bankVaultOf(Main)).to.have.nested.property('err.refusalkind', 'vault_gone')
    const reborn = await bank.ensureVault(Main)
    expect(TH.stateOf(reborn.snapshot)).to.eq('novel')
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
    await TH.expectBad(bank.tryEnsureVault(Main), 'vault_gone')
    expect(bank.bankVaultOf(Main)).to.deep.include({ lifecycle: 'refused' })
    expect(bank.vaultOf(Main)).to.be.null
    expect(bank.bankVaultOf(Main)).to.have.nested.property('err.refusalkind', 'vault_gone')
    const reborn = await bank.ensureVault(Main)
    expect(TH.stateOf(reborn.snapshot)).to.eq('novel')
  })
})
// --

// == [Letting go]: closeVault, closeVaults, reopenVault, a let-go landing mid-call

describe("bank.closeVault", () => {
  it("lets the vault go: every call 'vault_gone', its entry out of the snapshot, its lease kept, and the next birth takes the lease up", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const bank = TH.bankOf(vault)
    bank.closeVault(Main)
    await TH.expectRefusal(vault.hello(), 'vault_gone')
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'vault_gone')
    expect(bank.bankVaultOf(Main)).to.be.null
    expect(await world.getLease()).to.not.be.null
    const next = await bank.ensureVault(Main)
    expect(next).to.not.eq(vault)
    expect(TH.stateOf(next.snapshot)).to.eq('unlocked')
  })

  it("lets the vault go, by its label or by the Vault object's, as its examples show", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const bank = TH.bankOf(vault)
    bank.closeVault({ vaultlabel: 'main' })
    await TH.expectBad(vault.tryHello(), 'vault_gone')
    // A vault the bank no longer holds is no refusal.
    bank.closeVault({ vaultlabel: 'main' })
    expect(bank.vaults).to.deep.equal([])
    const next = await bank.ensureVault(Main)
    bank.closeVault({ vaultlabel: next.vaultlabel })   // the vault a Vault object is of
    await TH.expectBad(next.tryHello(), 'vault_gone')
  })

  it("refuses a bag of another user 'bad_scope', letting nothing go", async () => {
    const vault = await makeWorld().open()
    const bank = TH.bankOf(vault)
    TH.expectSyncRefusal(() => { bank.closeVault({ ...Main, user_id: 'u2' }) }, 'bad_scope')
    expect(bank.vaultOf(Main)).to.eq(vault)
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
    const birth = bank.tryEnsureVault(Main)
    await reading.reached
    expect(bank.bankVaultOf(Main)?.lifecycle).to.eq('starting')
    bank.closeVault(Main)
    expect(bank.bankVaultOf(Main)).to.be.null
    reading.release()
    await TH.expectBad(birth, 'vault_gone')
    expect(bank.bankVaultOf(Main)).to.be.null
  })
})

describe("bank.closeVaults and bank.reopenVault", () => {
  it("lets every vault go at sign-out, as closeVaults's example shows", async () => {
    const world = makeWorld()
    const bank = bankIn(world)
    const vaults = [await bank.ensureVault(Main), await bank.ensureVault({ vaultlabel: 'work' })]
    const signingOut: (() => void)[] = []
    const onSignOut = (handler: () => void) => { signingOut.push(handler) }
    onSignOut(() => { bank.closeVaults() })
    for (const handler of signingOut) { handler() }
    for (const vault of vaults) { await TH.expectRefusal(vault.hello(), 'vault_gone') }
    expect(bank.vaults).to.deep.equal([])
  })

  it("hands back a new Vault object, the one let go gone, as reopenVault's example shows", async () => {
    const vault = await makeWorld().openUnlocked('pw')
    const bank = TH.bankOf(vault)
    const reopened = await bank.reopenVault({ vaultlabel: 'main' })   // after 'vault_gone', say
    expect(reopened).to.not.eq(vault)
    expect(TH.stateOf(reopened.snapshot)).to.eq('unlocked')
    await TH.expectRefusal(vault.hello(), 'vault_gone')
    expect(bank.vaultOf(Main)).to.eq(reopened)
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
  it("refuses 'vault_gone' when a let-go lands while the key deriver is held, and storage keeps the gateless vault record", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    const deriving = world.holdNextDerive()
    const unlocking = TH.tryUnlock(vault, 'pw')
    await deriving.reached
    TH.closeVault(vault)
    deriving.release()
    await TH.expectBad(unlocking, 'vault_gone')
    expect(await TH.vaultRecordIn(world.vaultDB, TH.scopeOf('u1'))).to.deep.include({ gate_epoch: 0, gate: null })
  })

  it("refuses 'gate_made_elsewhere' when another device set the first gate meanwhile, even with its passphrase, writing nothing; the next hello shows locked, and that passphrase unlocks", async () => {
    const world = makeRacingWorld()
    const here = await world.open({ vaultDB: world.deafVaultDB() })
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    expect([TH.stateOf(here.snapshot), TH.stateOf(there.snapshot)]).to.deep.equal(['novel', 'novel'])
    const deriving = world.holdNextDerive()
    const unlocking = TH.tryUnlock(here, 'there phrase')
    await deriving.reached
    await TH.unlock(there, 'there phrase')
    const gated = await TH.vaultRecordIn(world.vaultDB, TH.scopeOf('u1'))
    deriving.release()
    await TH.expectBad(unlocking, 'gate_made_elsewhere')
    expect(await TH.vaultRecordIn(world.vaultDB, TH.scopeOf('u1'))).to.deep.equal(gated)
    expect(TH.stateOf(here.snapshot)).to.eq('novel')
    await here.hello()
    expect(TH.stateOf(here.snapshot)).to.eq('locked')
    await TH.unlock(here, 'there phrase')
    expect(TH.stateOf(here.snapshot)).to.eq('unlocked')
  })
})
// --

// == [The snapshot]: the listing, vaultOf, bankVaultOf, subscribe, getSnapshot

describe("bank.snapshot, bank.lifecycle, bank.vaults, bank.vaultOf, bank.bankVaultOf, bank.subscribe and bank.getSnapshot", () => {
  it("keeps the snapshot's identity until something changes, an entry moving from starting to ready", async () => {
    const bank = bankIn(makeWorld())
    const made = bank.getSnapshot()
    expect(bank.getSnapshot()).to.eq(made)
    const lifecycles: (string | undefined)[] = []
    bank.subscribe(() => { lifecycles.push(bank.bankVaultOf(Main)?.lifecycle) })
    await bank.ensureVault(Main)
    expect(stepsOf(lifecycles)).to.deep.equal(['starting', 'ready'])
    const settled = bank.getSnapshot()
    expect(settled).to.not.eq(made)
    await bank.ensureVault(Main)
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
    bank.subscribe(() => { if (bank.bankVaultOf(Main)?.lifecycle !== 'ready') { asked.push(bank.ensureVault(Main)) } })
    const vault = await bank.ensureVault(Main)
    expect(asked.length).to.be.at.least(2)
    for (const ask of asked) { expect(await ask).to.eq(vault) }
    expect(ensureVault).toHaveBeenCalledOnce()
    expect(bank.vaultOf(Main)).to.eq(vault)
  })

  it("reads nothing for a birth let go in the task that asked for it, its caller refused 'vault_gone'", async () => {
    const world = makeWorld()
    const ensureVault = vi.spyOn(world.vaultDB, 'ensureVault')
    const getDeviceRecord = vi.spyOn(world.deviceDB, 'getDeviceRecord')
    const bank = bankIn(world)
    const asked = bank.ensureVault(Main)
    bank.closeVault(Main)
    await TH.expectRefusal(asked, 'vault_gone')
    expect(ensureVault).not.toHaveBeenCalled()
    expect(getDeviceRecord).not.toHaveBeenCalled()
    expect(bank.bankVaultOf(Main)).to.be.null
  })

  it("moves an entry from starting to refused when its birth is refused, the refusal kept", async () => {
    const world = makeWorld()
    const unreachable = new VaultError('storage_unavailable', 'Storage could not be reached: try again shortly.')
    vi.spyOn(world.vaultDB, 'ensureVault').mockResolvedValueOnce(TH.bad(unreachable))
    const bank = bankIn(world)
    const lifecycles: (string | undefined)[] = []
    bank.subscribe(() => { lifecycles.push(bank.bankVaultOf(Main)?.lifecycle) })
    await TH.expectRefusal(bank.ensureVault(Main), 'storage_unavailable')
    expect(stepsOf(lifecycles)).to.deep.equal(['starting', 'refused'])
    expect(bank.bankVaultOf(Main)).to.deep.include({ lifecycle: 'refused', err: unreachable })
    expect(bank.vaultOf(Main)).to.be.null
    expect(await bank.ensureVault(Main)).to.eq(bank.vaultOf(Main))
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
    // One identity each for the bank's life, as useSyncExternalStore asks, and no own field a spread shows.
    expect(bank.subscribe).to.eq(bank.subscribe)
    expect(bank.getSnapshot).to.eq(bank.getSnapshot)
    expect(Object.keys(bank)).to.not.include('subscribe')
    expect(Object.keys(bank)).to.not.include('getSnapshot')
    await bank.ensureVault(Main)
    expect(heard).toHaveBeenCalled()
  })

  it("stops telling a listener once it unsubscribes, and refuses a listener that is no function 'bad_option', at once", async () => {
    const bank = bankIn(makeWorld())
    const heard = vi.fn()
    const unsubscribe = bank.subscribe(heard)
    unsubscribe()
    await bank.ensureVault(Main)
    expect(heard).not.toHaveBeenCalled()
    TH.expectSyncRefusal(() => bank.subscribe('listen' as unknown as () => void), 'bad_option')
  })

  it("reads a vault's lifecycle, or undefined for a vault not asked for, as bankVaultOf's example shows; a bad name or another user's bag refuses 'bad_scope'", async () => {
    const bank = bankIn(makeWorld())
    expect(bank.bankVaultOf({ vaultlabel: 'main' })?.lifecycle).to.be.undefined
    await bank.ensureVault(Main)
    expect(bank.bankVaultOf({ vaultlabel: 'main' })?.lifecycle).to.eq('ready')
    expect(bank.bankVaultOf(Main)).to.eq(bank.vaults[0])
    TH.expectSyncRefusal(() => bank.bankVaultOf({ vaultlabel: 'not-a-label' }), 'bad_scope')
    TH.expectSyncRefusal(() => bank.bankVaultOf({ ...Main, user_id: 'u2' }), 'bad_scope')
  })

  it("hands out the Vault object once born, and null before it is asked for and while its birth is under way, as vaultOf's example shows; a bad name or another user's bag refuses 'bad_scope'", async () => {
    const bank = bankIn(makeWorld())
    expect(bank.vaultOf({ vaultlabel: 'main' })).to.be.null
    const asked = bank.ensureVault(Main)
    expect(bank.bankVaultOf(Main)?.lifecycle).to.eq('starting')
    expect(bank.vaultOf(Main)).to.be.null
    const born = await asked
    const vault = bank.vaultOf({ vaultlabel: 'main' })   // null until bank.ensureVault has born it
    expect(vault).to.eq(born)
    bank.closeVault(Main)
    expect(bank.vaultOf(Main)).to.be.null
    TH.expectSyncRefusal(() => bank.vaultOf({ vaultlabel: 'not-a-label' }), 'bad_scope')
    TH.expectSyncRefusal(() => bank.vaultOf({ ...Main, user_id: 'u2' }), 'bad_scope')
  })

  it("lists each vault asked for, sorted by vaultlabel whatever the order asked, frozen, each element its scope and lifecycle and no Vault object", async () => {
    const bank = bankIn(makeWorld())
    for (const vaultlabel of ['work', 'main', 'home']) { await bank.ensureVault({ vaultlabel }) }
    const { vaults } = bank.snapshot
    expect(vaults.map((bankVault) => bankVault.vaultlabel)).to.deep.equal(['home', 'main', 'work'])
    expect(vaults[1]).to.deep.equal({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main', lifecycle: 'ready' })
    for (const bankVault of vaults) { expect(Object.isFrozen(bankVault)).to.be.true }
    expect(Object.isFrozen(vaults)).to.be.true
    bank.closeVault({ vaultlabel: 'main' })
    expect(bank.vaults.map((bankVault) => bankVault.vaultlabel)).to.deep.equal(['home', 'work'])
  })

  it("keeps the listing's identity until a vault in it changes, and each element's until it changes itself", async () => {
    const bank = bankIn(makeWorld())
    const empty = bank.vaults
    await bank.hello()
    expect(bank.vaults).to.eq(empty)
    await bank.ensureVault(Main)
    const listed = bank.vaults
    const [mainListed] = listed
    await bank.ensureVault(Main)
    expect(bank.vaults).to.eq(listed)
    await bank.ensureVault({ vaultlabel: 'work' })
    expect(bank.vaults).to.not.eq(listed)
    expect(bank.bankVaultOf(Main)).to.eq(mainListed)
  })

  it("keeps the latest refusal's own err in its element when a second birth is refused alike", async () => {
    const world = makeWorld()
    const first = new VaultError('storage_unavailable', 'Storage could not be reached: try again shortly.')
    const second = new VaultError('storage_unavailable', 'Storage could not be reached: try again shortly.')
    vi.spyOn(world.vaultDB, 'ensureVault').mockResolvedValueOnce(TH.bad(first)).mockResolvedValueOnce(TH.bad(second))
    const bank = bankIn(world)
    await TH.expectRefusal(bank.ensureVault(Main), 'storage_unavailable')
    const listed = bank.vaults
    await TH.expectRefusal(bank.ensureVault(Main), 'storage_unavailable')
    expect(bank.vaults).to.not.eq(listed)
    expect(bank.bankVaultOf(Main)).to.have.property('err', second)
  })

  it("tells a refused vault by its lifecycle, its err why, as BankVault's example shows", async () => {
    const world = makeWorld()
    const unreachable = new VaultError('storage_unavailable', 'Storage could not be reached: try again shortly.')
    vi.spyOn(world.vaultDB, 'ensureVault').mockResolvedValueOnce(TH.bad(unreachable))
    const bank = bankIn(world)
    await bank.tryEnsureVault(Main)
    const showTrouble = vi.fn()
    for (const bankVault of bank.vaults) {
      if (bankVault.lifecycle === 'refused') { showTrouble(bankVault.err) }
    }
    expect(showTrouble).toHaveBeenCalledWith(unreachable)
  })

  it("sits flat on the bank's scope, so the bank holds its own snapshot consistent, as BankSnapshot's example shows", async () => {
    const bank = bankIn(makeWorld())
    await bank.ensureVault(Main)
    const { lifecycle, vaults } = storeSnapshotOf(bank.subscribe, bank.getSnapshot)
    expect(lifecycle).to.eq('ready')
    expect(vaults).to.have.lengthOf(1)
    expect(bank.snapshot).to.deep.include({ applabel: 'acme', user_id: 'u1' })
    expect(() => { bank.demandConsistentWith(bank.snapshot) }).to.not.throw()
    expect(bank.snapshot).to.not.have.property('err')
  })

  it("reads its lifecycle and its listing through getters, each the current snapshot's own", async () => {
    const bank = bankIn(makeWorld())
    expect(bank.lifecycle).to.eq('made')
    await bank.ensureVault(Main)
    expect(bank.lifecycle).to.eq(bank.snapshot.lifecycle)
    expect(bank.vaults).to.eq(bank.snapshot.vaults)
    expect(Object.keys(bank)).to.not.include.members(['lifecycle', 'vaults'])
  })

  it("says hello when it is not ready, as lifecycle's example shows", async () => {
    const bank = bankIn(makeWorld())
    if (bank.lifecycle !== 'ready') { await bank.hello() }
    expect(bank.lifecycle).to.eq('ready')
  })

  it("filters the listing for the refused, as vaults' example shows", async () => {
    const world = makeWorld()
    vi.spyOn(world.vaultDB, 'ensureVault').mockResolvedValueOnce(TH.bad(new VaultError('storage_unavailable', 'Storage could not be reached: try again shortly.')))
    const bank = bankIn(world)
    await bank.tryEnsureVault({ vaultlabel: 'work' })
    await bank.ensureVault(Main)
    const refused = bank.vaults.filter((bankVault) => bankVault.lifecycle === 'refused')
    expect(refused.map((bankVault) => bankVault.vaultlabel)).to.deep.equal(['work'])
  })

  it("births a vault through the browser's defaults, as the class's first example shows", async () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    const session = { user_id: 'u1' }
    const bank = Bank.make({ applabel: 'acme', user_id: session.user_id, vaultDB, ...browserOpts() })   // as the user signs in
    const vault = await bank.ensureVault({ vaultlabel: 'main' })
    expect(TH.stateOf(vault.snapshot)).to.eq('novel')   // 'novel' | 'locked' | 'unlocked'
    expect(bank.lifecycle).to.eq('ready')
  })
})
// --

// == [Parsing]: demandConsistentWith, parseMakeBankOpts, vaultPartsOf

describe("bank.demandConsistentWith", () => {
  it("returns for a Vault object the bank handed out, as its first example shows", async () => {
    const bank = bankIn(makeWorld())
    const vault = await bank.ensureVault(Main)
    for (const thing of [vault, vault.getSnapshot(), bank, {}]) {
      expect(() => { bank.demandConsistentWith(thing) }).to.not.throw()
    }
    bank.demandConsistentWith(vault)   // returns, for a Vault object this bank handed out
  })

  it("refuses another user's scope 'bad_scope', naming the field, never its value, as its second example shows", () => {
    const bank = bankIn(makeWorld())
    const err = TH.expectSyncRefusal(() => { bank.demandConsistentWith({ user_id: 'u2' }) }, 'bad_scope')
    expect(err.meta?.fieldnames).to.deep.equal(['user_id'])
    expect(err.message).to.include('a bank serves one app and one signed-in user')
    expect(err.message).to.not.include('u2')
  })

  it("refuses another app's scope, a name that fails its check, and no bag at all 'bad_scope'", () => {
    const bank = bankIn(makeWorld())
    for (const thing of [{ applabel: 'other' }, { user_id: '' }, { applabel: 'Not A Label' }, null, 'u1']) {
      TH.expectSyncRefusal(() => { bank.demandConsistentWith(thing as unknown as object) }, 'bad_scope')
    }
  })
})

describe("parseMakeBankOpts", () => {
  it("reads the bank's options before storage is touched, as its example shows", () => {
    const world = makeWorld()
    const { applabel, user_id, leaseMillis } = parseMakeBankOpts(bankOptsOf(world, { leaseHours: 2 }))
    expect(applabel).to.eq('acme')
    expect(user_id).to.eq('u1')
    expect(leaseMillis).to.eq(2 * 60 * 60 * 1000)
  })

  it("refuses the camelCase userId a host wrote before user_id, as bad_option naming user_id", () => {
    const { user_id, ...opts } = bankOptsOf(makeWorld())
    const err = TH.expectSyncRefusal(() => parseMakeBankOpts({ ...opts, userId: user_id } as unknown as MakeBankOpts), 'bad_option')
    expect(err.message).to.include('user_id')
  })
})

describe("vaultPartsOf", () => {
  it("takes its options' own vaultDB, holding its limits to it, as its example shows", () => {
    const bank = parseMakeBankOpts(bankOptsOf(makeWorld()))
    const workVaultDB = localVaultDB({ store: memoryStore() })
    const scope = TH.scopeOf('u1', 'work')
    const { vaultDB } = vaultPartsOf(bank, scope, { vaultDB: workVaultDB })   // the work vault's own store, its limits held to it
    expect(vaultDB).to.eq(workVaultDB)
    expect(vaultPartsOf(bank, scope, undefined)).to.deep.include({ ...scope, vaultDB: bank.vaultDB, deviceDB: bank.deviceDB })
  })

  it("carries the scope's names as its own fields, frozen, whatever else the scope it is handed carries", () => {
    const bank = parseMakeBankOpts(bankOptsOf(makeWorld()))
    const parts = vaultPartsOf(bank, { ...TH.scopeOf('u1', 'work'), boxlabel: 'stray' } as ReturnType<typeof TH.scopeOf>, undefined)
    expect(parts).to.deep.include({ applabel: 'acme', user_id: 'u1', vaultlabel: 'work' })
    expect(parts).to.not.have.property('scope')
    expect(parts).to.not.have.property('boxlabel')
    expect(Object.isFrozen(parts)).to.be.true
  })

  it("refuses a misspelt option, or a vaultlabel, as bad_option", () => {
    const bank = parseMakeBankOpts(bankOptsOf(makeWorld()))
    for (const opts of [{ vaultdb: bank.vaultDB }, { vaultlabel: 'main' }]) {
      TH.expectSyncRefusal(() => vaultPartsOf(bank, TH.scopeOf('u1'), opts as unknown as BankVaultOpts), 'bad_option')
    }
  })
})
// --
