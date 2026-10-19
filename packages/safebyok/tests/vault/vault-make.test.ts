import { describe, it, expect, vi, afterEach, expectTypeOf } from 'vitest'
import { LeaseHours, FarFuture, VaultScope } from '../../src/types'
import { MaxUserIdChars } from '../../src/validators'
import { VaultError, isVaultError } from '../../src/errors'
import { memoryDeviceDB } from '../../src/device-db'
import { Vault } from '../../src/vault'
import { type MakeVaultOpts } from '../../src/vault-opts'
import { delDamagedVault, deviceTroubleAsConditions } from '../../src/del-damaged-vault'
import { fromB64 } from '../../src/crypto'
import type { KeyDeriver, CustomKeyDeriver } from '../../src/key-deriver'
import { type VaultLogger } from '../../src/logger'
import { Argon2idWebV1, MaxSaltBytes, TestDeriverNotice } from '../../src/key-deriver-spec'
import { bad } from '../../src/outcome'
import * as TH from '../test-helpers'
import { makeWorld, MisfitStores, VaultDBVerbsUsed, uncheckingDeviceDB, HourMillis, damagedVaultWorld, isU1Box, u1VaultPropsCkey } from './world'


// == [Making a vault]: Vault.make, options

describe("Vault.make", () => {
  it("settles into 'absent' against an empty backend, prompting nobody", async () => {
    const world = makeWorld()
    const vault = await world.open()
    expect(vault.getSnapshot().state).to.eq('absent')
    expect(vault.getSnapshot().boxes).to.have.lengthOf(0)
  })

  it("refuses a hyphenated applabel or vaultlabel at the door", async () => {
    const world = makeWorld()
    await TH.expectRefusal(world.open({ applabel: 'not-a-label' }), 'bad_label')
    await TH.expectRefusal(world.open({ vaultlabel: 'not-a-label' }), 'bad_label')
  })

  it("refuses to open without a signed-in user", async () => {
    const world = makeWorld()
    await TH.expectRefusal(world.open({ userId: '' }), 'bad_label')
  })

  it("takes a userId of a hundred characters, and refuses a longer one, naming the bound and never the id", async () => {
    const world = makeWorld()
    expect(await world.stateOnOpen({ userId: 'u'.repeat(MaxUserIdChars) })).to.eq('absent')
    const overlong = `alice@example.com${'u'.repeat(MaxUserIdChars)}`
    const err = await TH.expectRefusal(world.open({ userId: overlong }), 'bad_label')
    expect(err.message).to.include('at most 100 characters')
    expect(TH.thrownText(err)).to.not.include('alice')
  })

  it("refuses a userId that is not text, as no signed-in user", async () => {
    const world = makeWorld()
    for (const userId of [42, null, undefined, { id: 'u1' }]) {
      await TH.expectRefusal(world.open({ userId: userId as unknown as string }), 'bad_label')
    }
  })

  it("refuses a call with no bag of options at all", async () => {
    for (const opts of [undefined, null, 'acme']) {
      await TH.expectRefusal(TH.settledVault(opts as unknown as MakeVaultOpts), 'bad_option')
    }
  })

  for (const ckey of ['vaultDB', 'deviceDB'] as const) {
    it(`refuses a missing ${ckey} with kind 'bad_option'`, async () => {
      const opts = TH.omitting(makeWorld().optsWith(), ckey)
      const err = await TH.expectRefusal(TH.settledVault(opts), 'bad_option')
      expect(err.message).to.include(`${ckey} is not a`)
    })
  }

  for (const [opts, blurb] of MisfitStores) {
    it(`refuses ${blurb} with kind 'bad_option', before it touches storage`, async () => {
      const world = makeWorld()
      const err = await TH.expectRefusal(world.open(opts), 'bad_option')
      expect(err.message).to.match(/vaultDB is not a VaultDB|deviceDB is not a DeviceDB/)
    })
  }

  it("refuses a vaultDB that carries every verb but is no VaultDB, whose checks it would skip", async () => {
    const world = makeWorld()
    const verbs = Object.fromEntries(VaultDBVerbsUsed.map((verb) => [verb, world.vaultDB[verb].bind(world.vaultDB)]))
    const lookalike = { maxRecordBytes: 1024 * 1024, maxVaultBytes: Infinity, maxBoxes: Infinity, delDamagedVault: () => Promise.resolve(), ...verbs }
    const err = await TH.expectRefusal(world.open({ vaultDB: lookalike as unknown as MakeVaultOpts['vaultDB'] }), 'bad_option')
    expect(err.message).to.include('extends the VaultDB class')
  })

  it("says stored vault props refused as corrupt as damaged_vault, even from an adapter that throws before its promise", async () => {
    const world = makeWorld()
    const corrupt = new VaultError('corrupt_record', 'The stored vault props did not read back.')
    vi.spyOn(world.vaultDB, 'getVaultProps').mockImplementationOnce(() => { throw corrupt })
    const err = await TH.expectRefusal(world.open(), 'damaged_vault')
    expect(err.cause).to.eq(corrupt)
    vi.restoreAllMocks()
  })

  it("takes a store of the host's own that carries every verb, prototype and all", async () => {
    const world = makeWorld()
    expect(await world.stateOnOpen({ vaultDB: Object.create(world.vaultDB) as MakeVaultOpts['vaultDB'], deviceDB: uncheckingDeviceDB().deviceDB })).to.eq('absent')
  })
})

describe("Vault.make's options", () => {
  it("makes the handle at once, still opening, before storage has answered", () => {
    const world = makeWorld()
    const vault = Vault.make(world.optsWith())
    expect(vault.getSnapshot()).to.deep.include({ state: 'opening', trouble: null, syncing: true })
  })

  it("makes a handle that settles once its hello is awaited, as its first two examples, and the Vault's own, show", async () => {
    const { vaultDB, deviceDB } = makeWorld()
    const vault = Vault.make({ applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB, deviceDB, keyDeriver: TH.testDeriver, passphraseStrengthTest: TH.anyPassphraseTest })
    await vault.hello()
    expect(vault.getSnapshot().state).to.eq('absent')
  })

  it("throws misuse at once, never as a rejection: a bad label, a missing store", () => {
    const world = makeWorld()
    TH.expectSyncRefusal(() => Vault.make(world.optsWith({ applabel: 'not-a-label' })), 'bad_label')
    TH.expectSyncRefusal(() => Vault.make(TH.omitting(world.optsWith(), 'vaultDB')), 'bad_option')
  })

  it("refuses an option it does not take as 'bad_option', naming it, before storage is touched", () => {
    const world = makeWorld()
    const getVaultProps = vi.spyOn(world.vaultDB, 'getVaultProps')
    const err = TH.expectSyncRefusal(() => Vault.make({ ...world.optsWith(), leaseHour: 1 } as MakeVaultOpts), 'bad_option')
    expect(err.message).to.match(/does not take the option leaseHour: check the spelling/)
    expect(err.message).to.include('leaseHours')
    expect(getVaultProps).not.toHaveBeenCalled()
  })

  it("refuses forcePassphraseReentryHours, naming leaseHours, as its third example shows", () => {
    const world = makeWorld()
    const err = TH.expectSyncRefusal(() => Vault.make({ ...world.optsWith(), forcePassphraseReentryHours: 1 } as MakeVaultOpts), 'bad_option')
    expect(err.message).to.include('forcePassphraseReentryHours (called leaseHours now)')
  })

  it("names every option it refuses, and never quotes a value", () => {
    const world = makeWorld()
    const err = TH.expectSyncRefusal(() => Vault.make({ ...world.optsWith(), note: 'FAKESECRET', colour: 'FAKESECRET' } as MakeVaultOpts), 'bad_option')
    expect(err.message).to.match(/the options note, colour:/)
    expect(TH.thrownText(err)).to.not.include('FAKESECRET')
  })

  it("takes an option given as undefined as one left out", async () => {
    const world = makeWorld()
    const vault = Vault.make(world.optsWith({ leaseHours: undefined, clock: undefined, logger: undefined }))
    await vault.hello()
    expect(vault.leaseMillis).to.eq(LeaseHours * HourMillis)
  })
})
// --

// == [hello]: seedVault, hello

/** Makes the vault, with a box in it, and closes the handle: what a later open will find. */
const seedVault = async (world: ReturnType<typeof makeWorld>) => {
  const vault = await world.openUnlocked('pw')
  await vault.putBox('anthropic', 'sk-fake')
  vault.close()
}

describe("hello", () => {
  it("settles the snapshot into absent, locked or unlocked, as its first example shows", async () => {
    const world = makeWorld()
    const fresh = Vault.make(world.optsWith())
    await fresh.hello()
    expect(fresh.getSnapshot().state).to.eq('absent')
    await seedVault(world)
    const leased = Vault.make(world.optsWith())
    await leased.hello()
    expect(leased.getSnapshot().state).to.eq('unlocked')
    await leased.lock()
    const locked = Vault.make(world.optsWith())
    await locked.hello()
    expect(locked.getSnapshot().state).to.eq('locked')
  })

  it("is started by make and shared: make's hello and every call while it runs are one promise, and one read", async () => {
    const world = makeWorld()
    const reads = vi.spyOn(world.vaultDB, 'getVaultProps')
    const vault = Vault.make(world.optsWith())
    const first = vault.hello()
    expect(vault.hello()).to.eq(first)
    await first
    expect(reads).toHaveBeenCalledTimes(1)
  })

  it("has a call made before storage answered wait for it, then run as on a settled vault", async () => {
    const world = makeWorld()
    await seedVault(world)
    const gate = TH.holdNextCall(world.vaultDB, 'getVaultProps')
    const vault = Vault.make(world.optsWith())
    await gate.reached
    const reading = vault.getBox('anthropic')
    expect(vault.getSnapshot().state).to.eq('opening')
    gate.release()
    expect(await reading).to.eq('sk-fake')
  })

  it("is a no-op once settled: a later hello reads nothing", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const reads = vi.spyOn(world.vaultDB, 'getVaultProps')
    const before = vault.getSnapshot()
    await vault.hello()
    expect(reads).not.toHaveBeenCalled()
    expect(vault.getSnapshot()).to.eq(before)
  })

  it("forgets a hello refused at once: the next reads afresh, and clears the trouble once it succeeds", async () => {
    const world = makeWorld()
    vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(bad(new VaultError('storage_unavailable', 'The vault storage could not be reached.')))
    const vault = Vault.make(world.optsWith())
    await TH.expectRefusal(vault.hello(), 'storage_unavailable')
    await vault.hello()
    expect(vault.getSnapshot()).to.deep.include({ state: 'absent', syncing: true, trouble: null })
  })

  it("shows why a vault is still opening, beside a retry that says hello again, as the trouble's example shows", async () => {
    const world = makeWorld()
    vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(bad(new VaultError('storage_unavailable', 'The vault storage could not be reached.')))
    const vault = Vault.make(world.optsWith())
    await TH.wakeupAtNextTick()
    const { state, trouble } = vault.getSnapshot()
    expect(state).to.eq('opening')
    expect(trouble?.refusalkind).to.eq('storage_unavailable')
    await vault.hello()
    expect(vault.getSnapshot()).to.deep.include({ state: 'absent', trouble: null })
  })

  it("has any other call try again first, once a hello was refused", async () => {
    const world = makeWorld()
    vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(bad(new VaultError('storage_unavailable', 'The vault storage could not be reached.')))
    const vault = Vault.make(world.optsWith())
    await TH.wakeupAtNextTick()
    await vault.unlock('pw')
    expect(vault.getSnapshot()).to.deep.include({ state: 'unlocked', trouble: null })
  })

  it("refuses a call as the hello it waited for was refused", async () => {
    const world = makeWorld()
    const refusal = new VaultError('not_permitted', 'Sign in to reach this vault.')
    vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValue(bad(refusal))
    const vault = Vault.make(world.optsWith())
    expect(await TH.expectRefusal(vault.putBox('anthropic', 'sk-fake'), 'not_permitted')).to.eq(refusal)
    expect(await TH.expectRefusal(vault.del(), 'not_permitted')).to.eq(refusal)
  })

  it("clears a damaged vault and says hello again on the same handle, as its second example shows, and delDamagedVault's", async () => {
    const world = await damagedVaultWorld()
    const vault = Vault.make(world.optsWith())
    try { await vault.hello() } catch (err) {
      if (isVaultError(err, 'damaged_vault')) { await delDamagedVault(world.optsWith()); await vault.hello() }
    }
    expect(vault.getSnapshot()).to.deep.include({ state: 'absent', trouble: null })
  })

  it("reads afresh once a background refresh has failed, saying so as its trouble until a read succeeds", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const trouble = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    const reads = vi.spyOn(world.vaultDB, 'getVaultProps')
    reads.mockResolvedValueOnce(bad(trouble))
    world.dbStore.write('elsewhere', '{}')
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot()).to.deep.include({ state: 'unlocked', syncing: false, trouble })
    const readsBefore = reads.mock.calls.length
    await vault.hello()
    expect(reads.mock.calls.length).to.eq(readsBefore + 1)
    expect(vault.getSnapshot()).to.deep.include({ state: 'unlocked', syncing: true, trouble: null })
  })

  it("reads afresh once a refresh inside a call has failed", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    const reads = vi.spyOn(world.vaultDB, 'getVaultProps')
    reads.mockResolvedValueOnce(bad(new VaultError('storage_unavailable', 'The vault storage could not be reached.')))
    await TH.expectRefusal(vault.unlock('pw'), 'storage_unavailable')
    expect(vault.getSnapshot()).to.deep.include({ state: 'locked', syncing: false })
    expect(vault.getSnapshot().trouble?.refusalkind).to.eq('storage_unavailable')
    const readsBefore = reads.mock.calls.length
    await vault.hello()
    expect(reads.mock.calls.length).to.eq(readsBefore + 1)
    expect(vault.getSnapshot().trouble).to.be.null
  })

  const UntrustedWriteCases = [
    ["identity_revoked",   'storage no longer serving the user'],
    ["rolled_back",        'storage saying the vault went back'],
    ["newer_format",       'storage holding the vault in a newer form'],
  ] as const

  for (const [kind, blurb] of UntrustedWriteCases) {
    it(`reads afresh once a write is refused as '${kind}': ${blurb}`, async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw')
      vi.spyOn(world.vaultDB, 'putBox').mockResolvedValueOnce(bad(new VaultError(kind, 'Storage cannot be trusted as it stands.')))
      await TH.expectRefusal(vault.putBox('anthropic', 'sk-fake'), kind)
      const reads = vi.spyOn(world.vaultDB, 'getVaultProps')
      await vault.hello()
      expect(reads).toHaveBeenCalledTimes(1)
    })
  }

  it("reads afresh once the vault is deleted", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.del()
    const reads = vi.spyOn(world.vaultDB, 'getVaultProps')
    await vault.hello()
    expect(reads).toHaveBeenCalledTimes(1)
    expect(vault.getSnapshot().state).to.eq('absent')
  })

  it("reads nothing anew after a lock or a stale write caught up with", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox('anthropic', 'sk-fake')
    vi.spyOn(world.vaultDB, 'putBox').mockResolvedValueOnce(bad(new VaultError('stale_write', 'Someone else wrote first.')))
    await TH.expectRefusal(vault.putBox('anthropic', 'sk-other'), 'stale_write')
    await vault.lock()
    const reads = vi.spyOn(world.vaultDB, 'getVaultProps')
    await vault.hello()
    expect(reads).not.toHaveBeenCalled()
  })

  it("refuses with kind 'vault_closed' after close(), as every later call does", async () => {
    const world = makeWorld()
    const vault = await world.open()
    vault.close()
    await TH.expectRefusal(vault.hello(), 'vault_closed')
    await TH.expectRefusal(vault.getBox('anthropic'), 'vault_closed')
  })

  it("never takes the state back to opening: a locked vault whose read fails stays locked, saying why", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(bad(new VaultError('storage_unavailable', 'The vault storage could not be reached.')))
    world.dbStore.write('elsewhere', '{}')
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(vault.getSnapshot().trouble?.refusalkind).to.eq('storage_unavailable')
  })

  it("keeps the snapshot's identity while nothing changes, and tells two refusals of one kind apart", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const reads = vi.spyOn(world.vaultDB, 'getVaultProps')
    const first = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    const second = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    reads.mockResolvedValueOnce(bad(first)).mockResolvedValueOnce(bad(second))
    await TH.expectRefusal(vault.unlock('pw'), 'storage_unavailable')
    const once = vault.getSnapshot()
    expect(once.trouble).to.eq(first)
    await TH.expectRefusal(vault.hello(), 'storage_unavailable')
    expect(vault.getSnapshot()).to.not.eq(once)
    expect(vault.getSnapshot().trouble).to.eq(second)
    await vault.hello()
    const settled = vault.getSnapshot()
    await vault.hello()
    expect(vault.getSnapshot()).to.eq(settled)
  })

  it("lets lock() win at once, waiting for no hello: storage unreachable, and the lease being read is not taken up", async () => {
    const world = makeWorld()
    await seedVault(world)
    const gate = TH.holdNextCall(world.deviceDB, 'getLease')
    const vault = Vault.make(world.optsWith())
    await gate.reached
    await vault.lock()
    gate.release()
    await vault.hello()
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.getLease()).to.be.null
  })

  it("lets lock() and close() go while storage has not answered at all", async () => {
    const world = makeWorld()
    const gate = TH.holdNextCall(world.vaultDB, 'getVaultProps')
    const vault = Vault.make(world.optsWith())
    await gate.reached
    await vault.lock()
    expect(vault.getSnapshot().state).to.eq('opening')
    vault.close()
    gate.release()
    await TH.wakeupAtNextTick()
    expect(world.logged).to.have.lengthOf(0)
  })

  it("takes up no lease for a handle closed while its hello ran", async () => {
    const world = makeWorld()
    await seedVault(world)
    const gate = TH.holdNextCall(world.deviceDB, 'getLease')
    const vault = Vault.make(world.optsWith())
    await gate.reached
    vault.close()
    gate.release()
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().state).to.not.eq('unlocked')
    expect(await world.getLease()).to.not.be.null
  })
})
// --

// == [Host environment]: secure context, host's clock, OutOfBoundsReadings

describe("a page that is not a secure context", () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it("refuses Vault.make over plain http with kind 'insecure_context', before it touches storage", async () => {
    vi.stubGlobal('isSecureContext', false)
    const world = makeWorld()
    const getVaultProps = vi.spyOn(world.vaultDB, 'getVaultProps')
    const err = await TH.expectRefusal(world.open(), 'insecure_context')
    expect(err.message).to.match(/https/)
    expect(getVaultProps).not.toHaveBeenCalled()
  })

  it("refuses first of all, even a bag of options that is no bag", async () => {
    vi.stubGlobal('isSecureContext', false)
    await TH.expectRefusal(TH.settledVault(null as unknown as MakeVaultOpts), 'insecure_context')
  })

  it("opens in a secure context, and in a runtime with no notion of one (Node)", async () => {
    expect((globalThis as { isSecureContext?: unknown }).isSecureContext).to.be.undefined
    expect(await makeWorld().stateOnOpen()).to.eq('absent')
    vi.stubGlobal('isSecureContext', true)
    expect(await makeWorld().stateOnOpen()).to.eq('absent')
  })
})

/** Clock readings outside EpochMillis's bounds, each a unit mistake or no time at all. */
const OutOfBoundsReadings = [
  [Date.parse('2026-10-14T12:00:00Z') / 1000,   'epoch seconds'],
  [Date.parse('2026-10-14T12:00:00Z') * 1000,   'epoch microseconds'],
  [0,                                           'the epoch itself, before 1981'],
  [FarFuture + 1,                               'one millisecond past FarFuture'],
  [Infinity,                                    'Infinity'],
  [NaN,                                         'NaN'],
  ['1792022400000',                             'a number written as text'],
  [new Date('2026-10-14T12:00:00Z'),            'a Date, not its epoch milliseconds'],
] as const

describe("the host's clock", () => {
  for (const [reading, blurb] of OutOfBoundsReadings) {
    it(`refuses a clock reading ${blurb} at Vault.make, before reading storage`, async () => {
      const world = makeWorld()
      const getVaultProps = vi.spyOn(world.vaultDB, 'getVaultProps')
      const err = await TH.expectRefusal(world.open({ clock: { now: () => reading as number } }), 'bad_option')
      expect(err.message).to.match(/epoch milliseconds/)
      expect(getVaultProps).not.toHaveBeenCalled()
    })
  }

  it("refuses a clock that is not a Clock", async () => {
    const world = makeWorld()
    for (const nonsense of [{}, { now: 1_792_022_400_000 }, () => 1_792_022_400_000, 'now', null]) {
      await TH.expectRefusal(world.open({ clock: nonsense as unknown as MakeVaultOpts['clock'] }), 'bad_option')
    }
  })

  it("takes a reading with a fraction of a millisecond, in bounds", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { clock: { now: () => world.clock.now() + 0.5 } })
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("is checked at every reading: a clock gone wrong after the open refuses each call that reads it, and unlocks nothing", async () => {
    const world = makeWorld()
    let reading = world.clock.now()
    const vault = await world.openUnlocked('pw', { clock: { now: () => reading } })
    await vault.lock()
    reading /= 1000
    await TH.expectRefusal(vault.unlock('pw'), 'bad_option')
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.getLease()).to.be.null
  })

  it("refuses an unlock that would create the vault, writing nothing, when the clock has gone wrong", async () => {
    const world = makeWorld()
    let reading = world.clock.now()
    const vault = await world.open({ clock: { now: () => reading } })
    reading *= 1000
    await TH.expectRefusal(vault.unlock('pw'), 'bad_option')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
  })

  it("still locks when the clock has gone wrong", async () => {
    const world = makeWorld()
    let reading = world.clock.now()
    const vault = await world.openUnlocked('pw', { clock: { now: () => reading } })
    reading = 0
    await vault.lock()
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.getLease()).to.be.null
    reading = world.clock.now()
    await TH.expectRefusal(vault.getBox('anthropic'), 'vault_locked')
  })

  it("fails closed: a reading gone wrong while unlocked drops the vaultKey before it refuses the clock", async () => {
    const world = makeWorld()
    let reading = world.clock.now()
    const vault = await world.openUnlocked('pw', { clock: { now: () => reading } })
    await vault.putBox('anthropic', 'sk-fake')
    reading = world.clock.now() / 1000
    await TH.expectRefusal(vault.getBox('anthropic'), 'bad_option')
    expect(vault.getSnapshot().state).to.eq('locked')
    reading = world.clock.now()
    await TH.expectRefusal(vault.getBox('anthropic'), 'vault_locked')
  })

  it("refuses a clock whose now() throws, at Vault.make, keeping its error as the cause and quoting none of it", async () => {
    const world = makeWorld()
    const thrown = new Error('clock broke near sk-ant-SUPERSECRET')
    const err = await TH.expectRefusal(world.open({ clock: { now: () => { throw thrown } } }), 'bad_option')
    expect(err.cause).to.eq(thrown)
    expect(err.message).to.not.include('SUPERSECRET')
  })

  it("refuses, and drops the vaultKey, when now() starts throwing after the open", async () => {
    const world = makeWorld()
    let broken = false
    const clock = { now: () => { if (broken) { throw new Error('no time today') } return world.clock.now() } }
    const vault = await world.openUnlocked('pw', { clock })
    await vault.putBox('anthropic', 'sk-fake')
    broken = true
    const err = await TH.expectRefusal(vault.getBox('anthropic'), 'bad_option')
    expect((err.cause as Error).message).to.eq('no time today')
    broken = false
    expect(vault.getSnapshot().state).to.eq('locked')
    await TH.expectRefusal(vault.getBox('anthropic'), 'vault_locked')
  })

  it("refuses a store when the clock has gone wrong while unlocked", async () => {
    const world = makeWorld()
    let reading = world.clock.now()
    const vault = await world.openUnlocked('pw', { clock: { now: () => reading } })
    reading = Infinity
    await TH.expectRefusal(vault.putBox('anthropic', 'sk-fake'), 'bad_option')
    expect(world.dbStore.ckeys().filter((ckey) => isU1Box(ckey))).to.have.lengthOf(0)
  })
})
// --

// == [Key deriver seam]: cheapDerive, handBuilt, hearingEverything, key deriver

/** The testDeriver's derivation, to put in a deriver of another shape. */
const cheapDerive: KeyDeriver['deriveKeyBytes'] = (passphrase, saltBytes) => TH.testDeriver.deriveKeyBytes(passphrase, saltBytes)

/** A hand-built Argon2id deriver over the cheap derivation: the whole spec, under a label of its own, then `change`. */
const handBuilt = (change: Record<string, unknown> = {}): KeyDeriver => (
  { ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', deriveKeyBytes: cheapDerive, ...change }
)

/** A logger that keeps everything it hears, the notice included, which TH.spyLogger drops. */
const hearingEverything = () => {
  const heard: TH.LoggedCall[] = []
  const hear = (level: keyof VaultLogger) => (message?: string, story?: Record<string, unknown>, err?: Error | null) => { heard.push({ level, message, story, err }) }
  return { heard, logger: { log: hear('log'), warn: hear('warn'), error: hear('error') } }
}

describe("the key deriver seam", () => {
  it("a vault made under one deriver refuses to unlock under another, by label", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const alienDeriver = { ...TH.testDeriver, key_deriver_label: 'someone_elses_deriver_v9' }
    const alien = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver: alienDeriver })
    await TH.expectRefusal(alien.unlock('pw'), 'unknown_key_deriver')
  })

  it("asks for a keyDeriver outright: there is no default to fall back on", () => {
    expectTypeOf<Pick<MakeVaultOpts, 'keyDeriver'>>().toEqualTypeOf<{ keyDeriver: KeyDeriver }>()
  })

  it("refuses to open without a keyDeriver, pointing at the browser's defaults", async () => {
    const opts = TH.omitting(makeWorld().optsWith(), 'keyDeriver')
    const err = await TH.expectRefusal(TH.settledVault(opts), 'bad_option')
    expect(err.message).to.include('keyDeriver')
    expect(err.message).to.include('safebyok/browser')
  })

  it("refuses a keyDeriver that is not one", async () => {
    const world = makeWorld()
    const NotDerivers = [
      null,
      'argon2id_web_v1',
      { key_deriver_label: 'test_digest_v0', salt_bytes: 16 },
      { ...TH.testDeriver, salt_bytes: 0 },
      { ...TH.testDeriver, salt_bytes: 1.5 },
      { ...TH.testDeriver, salt_bytes: MaxSaltBytes + 1 },
      { ...TH.testDeriver, key_deriver_label: '' },
    ]
    for (const notDeriver of NotDerivers) {
      await TH.expectRefusal(world.open({ keyDeriver: notDeriver as unknown as KeyDeriver }), 'bad_option')
    }
  })

  it("allows a foolish salt of one byte, and the longest the platform's random source hands out", async () => {
    for (const saltBytes of [1, MaxSaltBytes]) {
      const world = makeWorld()
      await world.openUnlocked('pw', { keyDeriver: { ...TH.testDeriver, salt_bytes: saltBytes } })
      const stored = await TH.expectingGood(world.vaultDB).getVaultProps(TH.scopeOf('u1'))
      const [wayin] = stored?.wayins ?? []
      expect(fromB64(wayin?.wayinkind === 'passphrase' ? wayin.salt_b64 : '')).to.have.lengthOf(saltBytes)
    }
  })

  it("refuses a deriver wearing a supplied spec's label without that spec's parameters", async () => {
    const world = makeWorld()
    const Impostors = [
      { ...TH.testDeriver, key_deriver_label: Argon2idWebV1.key_deriver_label },
      { ...Argon2idWebV1, iterations: 1, deriveKeyBytes: cheapDerive },
      { ...Argon2idWebV1, salt_bytes: 32, deriveKeyBytes: cheapDerive },
    ]
    for (const impostor of Impostors) {
      const err = await TH.expectRefusal(world.open({ keyDeriver: impostor }), 'bad_option')
      expect(err.message).to.include('argon2id_web_v1')
    }
  })

  it("takes a stand-in that carries a supplied spec whole, as a WebAssembly Argon2id would", async () => {
    const world = makeWorld()
    const standIn: KeyDeriver = { ...Argon2idWebV1, deriveKeyBytes: cheapDerive }
    await world.openUnlocked('pw', { keyDeriver: standIn })
    const stored = await TH.expectingGood(world.vaultDB).getVaultProps(TH.scopeOf('u1'))
    const [wayin] = stored?.wayins ?? []
    expect(wayin?.wayinkind === 'passphrase' && wayin.key_deriver_label).to.eq('argon2id_web_v1')
  })

  it("refuses a deriver that hands back anything but 32 key bytes, and makes no vault of it", async () => {
    const Outputs = [new Uint8Array(16), new Uint8Array(24), new Uint8Array(64), new Uint8Array(0), 'thirty-two bytes, honest'] as const
    for (const output of Outputs) {
      const world = makeWorld()
      const shortDeriver = { ...TH.testDeriver, deriveKeyBytes: () => Promise.resolve(output as Uint8Array) }
      const vault = await world.open({ keyDeriver: shortDeriver })
      await TH.expectRefusal(vault.unlock('pw'), 'bad_option')
      expect(await TH.expectingGood(world.vaultDB).getVaultProps(TH.scopeOf('u1'))).to.be.null
      expect(vault.getSnapshot().state).to.eq('absent')
    }
  })

  it("refuses a deriver that hands back 32 zero bytes, a key anyone could rebuild, and makes no vault of it", async () => {
    const Zeros = [new Uint8Array(32), new Uint32Array(8), new Uint8Array(new ArrayBuffer(40), 8, 32)] as const
    for (const output of Zeros) {
      const world = makeWorld()
      const zeroDeriver = { ...TH.testDeriver, deriveKeyBytes: () => Promise.resolve(output as Uint8Array) }
      const vault = await world.open({ keyDeriver: zeroDeriver })
      const err = await TH.expectRefusal(vault.unlock('pw'), 'bad_option')
      expect(err.message).to.match(/zero bytes/)
      expect(world.dbStore.ckeys()).to.have.lengthOf(0)
    }
  })

  it("refuses zero bytes at unlock too: a deriver that kept its output cannot open a vault", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const zeroDeriver = { ...TH.testDeriver, deriveKeyBytes: () => Promise.resolve(new Uint8Array(32)) }
    const fresh = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver: zeroDeriver })
    await TH.expectRefusal(fresh.unlock('pw'), 'bad_option')
    expect(fresh.getSnapshot().state).to.eq('locked')
  })

  it("takes a key whose one nonzero byte is its last: only all zeros is refused", async () => {
    const world = makeWorld()
    const lastByteSet = new Uint8Array(32)
    lastByteSet[31] = 1
    const vault = await world.openUnlocked('pw', { keyDeriver: { ...TH.testDeriver, deriveKeyBytes: () => Promise.resolve(lastByteSet.slice()) } })
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  describe("a deriver that declares Argon2id", () => {
    it("opens, and unlocks, when its spec is one Argon2id can run", async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw', { keyDeriver: handBuilt({ salt_bytes: 16 }) })
      expect(vault.getSnapshot().state).to.eq('unlocked')
    })

    const Unrunnable = [
      [{ salt_bytes: 4 },            'a salt under 8 bytes'],
      [{ memory_kib: 4 },            'memory under 8 KiB a lane'],
      [{ iterations: 0 },            'no passes'],
      [{ parallelism: 0 },           'no lanes'],
      [{ output_bytes: 16 },         'a key other than 32 bytes'],
      [{ memory_kib: undefined },    'a parameter missing'],
    ] as const

    for (const [change, blurb] of Unrunnable) {
      it(`is refused at open as bad_option, not at the first unlock: ${blurb}`, async () => {
        const world = makeWorld()
        const err = await TH.expectRefusal(world.open({ keyDeriver: handBuilt(change) }), 'bad_option')
        expect(err.message).to.include('keyDeriverSpec')
        expect(await TH.expectingGood(world.vaultDB).getVaultProps(TH.scopeOf('u1'))).to.be.null
      })
    }

    it("is refused at open when it wears the supplied label on other parameters", async () => {
      const err = await TH.expectRefusal(makeWorld().open({ keyDeriver: handBuilt({ key_deriver_label: 'argon2id_web_v1', iterations: 2 }) }), 'bad_option')
      expect(err.message).to.include('argon2id_web_v1')
    })
  })

  describe("a deriver of another algorithm, or none declared", () => {
    it("opens and unlocks, declaring an algorithm of its own, with no Argon2id parameters to carry", async () => {
      const scrypt: CustomKeyDeriver = { ...TH.testDeriver, key_deriver_label: 'acme_scrypt_v1', algorithm: 'scrypt' }
      const vault = await makeWorld().openUnlocked('pw', { keyDeriver: scrypt })
      expect(vault.getSnapshot().state).to.eq('unlocked')
    })

    it("opens and unlocks, declaring none, as the test deriver does", async () => {
      expect(TH.testDeriver).to.not.have.property('algorithm')
      const vault = await makeWorld().openUnlocked('pw')
      expect(vault.getSnapshot().state).to.eq('unlocked')
    })

    it("is refused at open when its algorithm is not text", async () => {
      await TH.expectRefusal(makeWorld().open({ keyDeriver: { ...TH.testDeriver, algorithm: 7 } as unknown as KeyDeriver }), 'bad_option')
    })
  })

  describe("the reserved label namespace", () => {
    const Reserved = [
      ['argon2id_web_v2',     'a spec safebyok may supply later'],
      ['Argon2id_Web_acme',   'the prefix in another case'],
      ['argon2id_web_v1',     'the supplied label, on a deriver carrying no parameters'],
    ] as const

    for (const [label, blurb] of Reserved) {
      it(`is refused at open as bad_option: ${blurb}`, async () => {
        const err = await TH.expectRefusal(makeWorld().open({ keyDeriver: { ...TH.testDeriver, key_deriver_label: label } }), 'bad_option')
        expect(err.message).to.match(/argon2id_web_/u)
      })
    }
  })

  describe("a label that begins test_", () => {
    it("warns once through the logger as the vault opens, and goes on to work", async () => {
      const { heard, logger } = hearingEverything()
      const vault = await makeWorld().openUnlocked('pw', { logger })
      expect(heard).to.deep.equal([{ level: 'warn', message: TestDeriverNotice, story: { call: 'make' }, err: undefined }])
      expect(vault.getSnapshot().state).to.eq('unlocked')
    })

    it("warns each time a vault is opened, quoting no passphrase", async () => {
      const { heard, logger } = hearingEverything()
      const world = makeWorld()
      await world.open({ logger })
      await world.open({ logger })
      expect(heard).to.have.lengthOf(2)
      expect(TH.loggedText(heard)).to.not.include('pw ')
    })

    it("says nothing of a label that does not begin test_, or merely holds it", async () => {
      const { heard, logger } = hearingEverything()
      const world = makeWorld()
      await world.open({ logger, keyDeriver: { ...TH.testDeriver, key_deriver_label: 'acme_test_v1' } })
      await world.open({ logger, keyDeriver: { ...TH.testDeriver, key_deriver_label: 'Test_digest' } })
      expect(heard).to.deep.equal([])
    })

    it("is heard by TH.spyLogger as nothing, so a test's own count of what the vault said stands", async () => {
      const world = makeWorld()
      await world.open()
      expect(world.logged).to.deep.equal([])
    })
  })

  it("keeps the keyDeriver it was handed, so one whose method lives on its prototype still derives", async () => {
    class PrototypeDeriver implements CustomKeyDeriver {
      readonly key_deriver_label = TH.testDeriver.key_deriver_label
      readonly salt_bytes = TH.testDeriver.salt_bytes
      readonly #inner = TH.testDeriver
      deriveKeyBytes(passphrase: string, saltBytes: Uint8Array) { return this.#inner.deriveKeyBytes(passphrase, saltBytes) }
    }
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { keyDeriver: new PrototypeDeriver() })
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })
})
// --

// == [Failed hello]: FailedOpenCases, a hello that fails

// Each arranges for one storage call during the open to fail, and hands back the error it planted
// (or a promise of it, for an arrangement that first seeds the vault).
const FailedOpenCases: readonly (readonly [string, (world: ReturnType<typeof makeWorld>) => unknown])[] = [
  ['storage refuses the first read, as for a user not yet signed in', (world) => {
    const refusal = new VaultError('not_permitted', 'Sign in to reach this vault.')
    vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(bad(refusal))
    return refusal
  }],
  ['storage cannot be reached for the first read', (world) => {
    const trouble = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(bad(trouble))
    return trouble
  }],
  ['storage fails listing the boxes, after reading the vault props', async (world) => {
    await seedVault(world)
    const trouble = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    vi.spyOn(world.vaultDB, 'listBoxes').mockResolvedValueOnce(bad(trouble))
    return trouble
  }],
]

describe("a hello that fails", () => {
  for (const [blurb, arrange] of FailedOpenCases) {
    it(`rejects with the very error, which the snapshot keeps as its trouble, still opening, when ${blurb}`, async () => {
      const world = makeWorld()
      const planted = await arrange(world)
      const vault = Vault.make(world.optsWith())
      let refusal: unknown = null
      try {
        await vault.hello()
      } catch (err) {
        refusal = err
      }
      expect(refusal).to.eq(planted)
      expect(vault.getSnapshot()).to.deep.include({ state: 'opening', syncing: false, trouble: planted, boxes: [], wayins: [] })
    })
  }

  it("says the device's own store failing to read the lease as 'storage_unavailable', its error the cause, settling locked beside that trouble", async () => {
    const world = makeWorld()
    await seedVault(world)
    const trouble = new Error('device storage is unavailable')
    vi.spyOn(world.deviceDB, 'getLease').mockRejectedValueOnce(trouble)
    const vault = Vault.make(world.optsWith())
    const err = await TH.expectRefusal(vault.hello(), 'storage_unavailable')
    expect(err.cause).to.eq(trouble)
    expect(vault.getSnapshot()).to.deep.include({ state: 'locked', trouble: err })
  })

  it("says the device's own store failing to read its mark of the vault as 'storage_unavailable', its error the cause", async () => {
    const world = makeWorld()
    await seedVault(world)
    const trouble = new Error('device storage is unavailable')
    vi.spyOn(world.deviceDB, 'getMark').mockRejectedValueOnce(trouble)
    const err = await TH.expectRefusal(world.open(), 'storage_unavailable')
    expect(err.cause).to.eq(trouble)
  })

  it("says the device's own store failing as 'storage_unavailable' to any call, a lock's among them, even one that throws before its promise", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const trouble = new Error('device storage is unavailable')
    vi.spyOn(world.deviceDB, 'delLease').mockImplementationOnce(() => { throw trouble })
    const err = await TH.expectRefusal(vault.lock(), 'storage_unavailable')
    expect(err.cause).to.eq(trouble)
    expect(vault.getSnapshot().state).to.eq('locked')
  })

  const DeviceVerbCases = [
    // what each verb's failure says it was doing:
    ["getLease",   /reading the lease it keeps/,         'reading the lease'],
    ["putLease",   /writing the lease it keeps/,         'writing the lease'],
    ["delLease",   /erasing the lease it keeps/,         'erasing the lease'],
    ["getMark",    /reading its mark of this vault/,     "reading the device's mark"],
    ["putMark",    /writing its mark of this vault/,     "writing the device's mark"],
    ["delMark",    /erasing its mark of this vault/,     "erasing the device's mark"],
    ["delAll",     /erasing everything it keeps/,        'erasing everything'],
  ] as const

  for (const [verb, said, blurb] of DeviceVerbCases) {
    it(`says what failed, ${blurb}, as 'storage_unavailable', with what to do and its error the cause`, async () => {
      const deviceDB = memoryDeviceDB()
      const trouble = new Error('device storage is unavailable')
      vi.spyOn(deviceDB, verb).mockRejectedValueOnce(trouble)
      const wrapped = deviceTroubleAsConditions(deviceDB)
      const calling = verb === 'delAll' ? wrapped.delAll() : (wrapped[verb] as (scope: VaultScope) => Promise<unknown>)(TH.scopeOf('u1'))
      const err = await TH.expectRefusal(calling, 'storage_unavailable')
      expect(err.cause).to.eq(trouble)
      expect(err.message).to.match(said)
      expect(err.message).to.match(/try again/)
      expect(err.message).to.match(/private window/)
      expect(err.message).not.to.include('u1')
    })
  }

  const BlockedNameCases = [
    // what holds until something outside the app changes:
    ["SecurityError",        "storage_blocked",      'storage withheld from the page: site data blocked, a sandboxed frame'],
    ["QuotaExceededError",   "storage_blocked",      'no room: a quota of zero, as some private windows give, or a full disk'],
    ["NotSupportedError",    "storage_blocked",      'no IndexedDB at all'],
    // what may pass:
    ["InvalidStateError",    "storage_unavailable",  'a connection closing under the store'],
    ["UnknownError",         "storage_unavailable",  'a failure the browser gives no reason for'],
    ["AbortError",           "storage_unavailable",  'a transaction aborted'],
  ] as const

  for (const [errName, kind, blurb] of BlockedNameCases) {
    it(`says a device store's ${errName} as '${kind}': ${blurb}`, async () => {
      const deviceDB = memoryDeviceDB()
      const trouble = new DOMException('The browser refused.', errName)
      vi.spyOn(deviceDB, 'putMark').mockRejectedValueOnce(trouble)
      const err = await TH.expectRefusal(deviceTroubleAsConditions(deviceDB).putMark(TH.markOf('u1')), kind)
      expect(err.cause).to.eq(trouble)
      expect(err.message).to.match(/writing its mark of this vault/)
      expect(err.message).to.match(kind === 'storage_blocked' ? /will not help until that changes/ : /try again/)
    })
  }

  it("keeps a verb's own way forward in its 'storage_blocked' message: a lease that will not read leaves a passphrase or passkey", async () => {
    const deviceDB = memoryDeviceDB()
    vi.spyOn(deviceDB, 'getLease').mockRejectedValueOnce(new DOMException('The operation is insecure.', 'SecurityError'))
    const err = await TH.expectRefusal(deviceTroubleAsConditions(deviceDB).getLease(TH.scopeOf('u1')), 'storage_blocked')
    expect(err.message).to.match(/reading the lease it keeps/)
    expect(err.message).to.match(/will not help until that changes: unlock with a passphrase or passkey instead\./)
    expect(err.message).to.not.match(/try again/i)
  })

  it("keeps it in its 'storage_unavailable' message too, beside trying again", async () => {
    const deviceDB = memoryDeviceDB()
    vi.spyOn(deviceDB, 'getLease').mockRejectedValueOnce(new Error('device storage is unavailable'))
    const err = await TH.expectRefusal(deviceTroubleAsConditions(deviceDB).getLease(TH.scopeOf('u1')), 'storage_unavailable')
    expect(err.message).to.match(/try again, or unlock with a passphrase or passkey\./)
  })

  it("tells a blocked store by its error's name, so one from another frame, no instance of this one's Error, is told alike", async () => {
    const deviceDB = memoryDeviceDB()
    const trouble = { name: 'SecurityError', message: 'The operation is insecure.' }
    vi.spyOn(deviceDB, 'getLease').mockRejectedValueOnce(trouble)
    const err = await TH.expectRefusal(deviceTroubleAsConditions(deviceDB).getLease(TH.scopeOf('u1')), 'storage_blocked')
    expect(err.cause).to.eq(trouble)
  })

  it("refuses to open as 'storage_blocked' when the browser withholds the device's storage, without a word of retrying", async () => {
    const world = makeWorld()
    await seedVault(world)
    const trouble = new DOMException('The operation is insecure.', 'SecurityError')
    vi.spyOn(world.deviceDB, 'getMark').mockRejectedValue(trouble)
    const err = await TH.expectRefusal(world.open(), 'storage_blocked')
    expect(err.cause).to.eq(trouble)
    expect(err.message).to.not.match(/try again/i)
    expect(err.message).not.to.include('u1')
  })

  it("lets a refusal the device store gives as a VaultError through as it came", async () => {
    const world = makeWorld()
    await seedVault(world)
    const refusal = new VaultError('not_permitted', 'This device may not read its records.')
    vi.spyOn(world.deviceDB, 'getLease').mockRejectedValueOnce(refusal)
    expect(await TH.expectRefusal(world.open(), 'not_permitted')).to.eq(refusal)
  })

  it("says stored vault props that do not parse as damaged_vault, which the snapshot keeps as its trouble", async () => {
    const world = makeWorld()
    world.dbStore.write(u1VaultPropsCkey, '{"format":"safebyok-vault-v4"}')
    const vault = Vault.make(world.optsWith())
    const err = await TH.expectRefusal(vault.hello(), 'damaged_vault')
    expect(vault.getSnapshot().trouble).to.eq(err)
  })

  it("keeps its storage watch, so the vault settles of itself once storage relents and rings", async () => {
    const world = makeWorld()
    const reads = vi.spyOn(world.vaultDB, 'getVaultProps')
    reads.mockResolvedValueOnce(bad(new VaultError('not_permitted', 'Sign in to reach this vault.')))
    const vault = Vault.make(world.optsWith())
    await TH.expectRefusal(vault.hello(), 'not_permitted')
    // Any write rings the store's change bell, and the vault, not yet settled, says hello again.
    world.dbStore.write('elsewhere', '{}')
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot()).to.deep.include({ state: 'absent', syncing: true, trouble: null })
  })

  it("takes up this device's lease once a ring settles the vault, as a hello does", async () => {
    const world = makeWorld()
    await seedVault(world)
    const reads = vi.spyOn(world.vaultDB, 'getVaultProps')
    reads.mockResolvedValueOnce(bad(new VaultError('storage_unavailable', 'The vault storage could not be reached.')))
    const vault = Vault.make(world.optsWith())
    await TH.expectRefusal(vault.hello(), 'storage_unavailable')
    world.dbStore.write('elsewhere', '{}')
    await TH.wakeupAtNextTick()
    // The ring's hello, under way or done, is the one a call shares: no read of its own.
    const readsByRing = reads.mock.calls.length
    await vault.hello()
    expect(reads.mock.calls.length).to.eq(readsByRing)
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("ends its storage watch only when closed: a refused hello leaves the handle for the host to retry or close", async () => {
    const world = makeWorld()
    const tally = TH.tallyWatches(world.vaultDB)
    vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(bad(new VaultError('not_permitted', 'Sign in to reach this vault.')))
    const vault = Vault.make(world.optsWith())
    await TH.expectRefusal(vault.hello(), 'not_permitted')
    expect(tally).to.deep.equal({ opened: 1, closed: 0 })
    vault.close()
    expect(tally).to.deep.equal({ opened: 1, closed: 1 })
  })

  it("rejects nothing unheard: make's own hello, refused, is the logger's to tell, once, the refusal its error", async () => {
    const world = makeWorld()
    const refusal = new VaultError('not_permitted', 'Sign in to reach this vault.')
    vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(bad(refusal))
    const vault = Vault.make(world.optsWith())
    await TH.wakeupAtNextTick()
    expect(world.logged).to.have.lengthOf(1)
    expect(world.logged[0]).to.deep.include({ level: 'warn', story: { call: 'hello' }, err: refusal })
    expect(world.logged[0]?.message).to.match(/vault\.hello\(\) to try again/)
    expect(vault.getSnapshot().trouble).to.eq(refusal)
  })

  it("tells the logger nothing of make's hello refused once the handle is closed", async () => {
    const world = makeWorld()
    vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(bad(new VaultError('not_permitted', 'Sign in to reach this vault.')))
    const vault = Vault.make(world.optsWith())
    vault.close()
    await TH.wakeupAtNextTick()
    expect(world.logged).to.have.lengthOf(0)
  })
})
// --
