/** The device: its options, the host's functions it wraps, and its sweep, over its MemoryVaultDB. */

import { noop } from 'es-toolkit'
import { afterEach, describe, expect, it, vi } from 'vitest'
// fake-indexeddb installs IndexedDB's globals, for the device database browserOpts() opens: no browser.
import 'fake-indexeddb/auto'
import { Consts, Errors, Phrases } from 'safebyok-big/internals'
import { browserOpts } from '../../src/browser'
import { Bank } from '../../src/models/bank'
import { DefaultLeaseMillis, DefaultOnBadNews, Device, tellBadNewsTo } from '../../src/models/device'
import { BirthGating } from '../../src/models/gating'
import { VaultMinder } from '../../src/minding/vault-minder'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import { type DevicePersisters, MemoryPersister } from '../../src/storage/persister'
import { refusedAnswerOf } from '../../src/storage/refused-answer'
import type { BankScope } from '../../src/shapes/shapes-stamps'
import { type BadNews, type DeviceOpts, type DeviceSnapshot, PendingBank, SignedOutBank } from '../../src/shapes/shapes-bankish'
import * as TH from '../test-helpers'

describe("a page that is not a secure context", () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it("refuses hello and signIn, though it makes the device", () => {
    vi.stubGlobal('isSecureContext', false)
    const device = TH.makeDevice({ userid: null })
    const err = TH.expectSyncRefusal(() => device.hello(), 'insecure_context')
    expect(err.message).to.match(/https/)
    TH.expectSyncRefusal(() => device.signIn(TH.WorldScope.userid), 'insecure_context')
    expect(device.userid).to.be.null
  })

  it("starts a device in a secure context, or where the platform has no isSecureContext", async () => {
    vi.stubGlobal('isSecureContext', true)
    await expect(TH.makeDevice({ userid: null }).hello()).resolves.toBeUndefined()
    vi.stubGlobal('isSecureContext', undefined)
    await expect(TH.makeDevice({ userid: null }).hello()).resolves.toBeUndefined()
  })
})

describe("Device.make(record, opts)", () => {
  it("makes an enabled device of the record's banklabel and token, nobody signed in", () => {
    const device = TH.makeDevice({ userid: null })
    expect(device).to.include({ banklabel: TH.WorldScope.banklabel, device_tok: TH.DeviceTok, userid: null, bank: null })
    expect(device.getSnapshot()).to.deep.equal({ bank: SignedOutBank })
    expect(device.isEnabled).to.be.true
    expect(device.demandEnabled()).to.equal(device)
    expect(device.modelkind).to.eq('device')
  })

  it("serves the bank labelled 'main' where its record names none", () => {
    const device = Device.make({ device_tok: TH.DeviceTok }, { keyDeriver: TH.testDeriver, logger: TH.quietLogger, vaultDB: new MemoryVaultDB() })
    expect(device.banklabel).to.eq('main')
  })

  it("asks its vaultDB nothing, and watches nothing, until it signs in", async () => {
    const vaultDB = new MemoryVaultDB()
    const [tryGetThing, watch] = [vi.spyOn(vaultDB, 'tryGetThing'), vi.spyOn(vaultDB, 'watch')]
    const device = TH.makeDevice({ userid: null }, { vaultDB })
    await device.hello()
    expect([tryGetThing.mock.calls.length, watch.mock.calls.length]).to.deep.equal([0, 0])
    await device.signIn(TH.WorldScope.userid)
    // A get of the root box, and a watch for each of the user's two minders.
    expect([tryGetThing.mock.calls.length, watch.mock.calls.length]).to.deep.equal([1, 2])
  })

  it("accepts the bag of browserOpts() spread in, ignoring its device database", () => {
    const vaultDB = new MemoryVaultDB()
    const device = Device.make({ banklabel: TH.WorldScope.banklabel, device_tok: TH.DeviceTok }, { ...browserOpts({ dbName: 'device-test' }), vaultDB, logger: TH.quietLogger })
    expect(device.isEnabled).to.be.true
    expect(device.vaultDB).to.equal(vaultDB)
    expect(device).to.not.have.property('deviceDB')
  })

  it("gives each bank made on it the vaultDB it is given", () => {
    const vaultDB = new MemoryVaultDB()
    expect(TH.makeDevice({}, { vaultDB }).vaultDB).to.equal(vaultDB)
  })

  it("refuses a vaultDB missing a verb, naming it", () => {
    const err = TH.expectSyncRefusal(() => TH.makeDevice({}, { vaultDB: { tryGetThing: vi.fn() } } as never), 'bad_record')
    expect(err.message).to.include('vaultDB: ')
  })

  it("refuses a queryCacheOpts the minder refuses, and gives its minder the one it is given", () => {
    TH.expectSyncRefusal(() => TH.makeDevice({}, { queryCacheOpts: { retry: 3 } } as never), 'bad_record')
    expect(TH.makeDevice({}, { queryCacheOpts: { staleTime: 5 } }).minder).to.be.an('object')
  })

  it("makes its QueryClient with it, empty, the one the minder its signIn makes caches in", () => {
    const device = TH.makeDevice({ userid: null })
    const { queryClient } = device
    expect(VaultMinder.isClient(queryClient)).to.be.true
    expect(queryClient.getQueryCache().getAll()).to.have.lengthOf(0)
    void device.signIn(TH.WorldScope.userid)
    expect([device.queryClient, device.minder.queryClient]).to.deep.equal([queryClient, queryClient])
  })

  it("serializes as its user, banklabel and token alone, and is frozen", () => {
    expect(TH.jsonOf(TH.makeDevice({ userid: null }))).to.deep.equal({ userid: null, banklabel: TH.WorldScope.banklabel, device_tok: TH.DeviceTok })
    const device = TH.makeDevice()
    expect(TH.jsonOf(device)).to.deep.equal({ ...TH.WorldScope, device_tok: TH.DeviceTok })
    expect(device.toJSON()).to.deep.equal(TH.jsonOf(device))
    expect(Object.isFrozen(device)).to.be.true
  })

  it("wraps each of the host's functions, leaving none of the host's own on a property", () => {
    const device = TH.makeDevice()
    for (const guarded of [device.keyDeriver, device.strengthChecker]) { expect(Consts.isGuarded(guarded)).to.be.true }
    expect(Object.values(device)).to.not.include.members([TH.testDeriver, TH.anyStrengthChecker])
  })

  it("rounds a fraction of a minute to the nearest millisecond, and turns Infinity into ForeverMillis", () => {
    expect(TH.makeDevice({}, { autolockMinutes: 1 / 7 }).leaseMillis).to.eq(8571)
    expect(TH.makeDevice({}, { autolockMinutes: Infinity }).leaseMillis).to.eq(Consts.ForeverMillis)
    expect(TH.makeDevice({}, { autolockMinutes: 30 }).autolockMinutes).to.eq(30)
  })

  it("leases for DefaultLeaseMillis where the host names no autolockMinutes", () => {
    expect(TH.makeDevice({}, { autolockMinutes: undefined }).leaseMillis).to.eq(DefaultLeaseMillis)
  })

  it("warns through its logger of a test key deriver", () => {
    const warn = vi.fn()
    TH.makeDevice({}, { logger: { log: vi.fn(), warn, error: vi.fn() } })
    expect(warn.mock.calls[0]?.slice(0, 2)).to.deep.equal([Phrases.TestDeriverNotice, { oplabel: 'Device.make' }])
  })

  const OptsCases = [
    ['keyDeriver',       { keyDeriver: 3 }],
    ['strengthChecker',  { strengthChecker: 3 }],
    ['logger',           { logger: 3 }],
  ] as const

  for (const [fieldname, moved] of OptsCases) {
    it(`refuses a ${fieldname} of the wrong type, naming it`, () => {
      const err = TH.expectSyncRefusal(() => TH.makeDevice({}, moved as never), 'bad_record')
      expect(err.message.startsWith(`${fieldname}: `)).to.be.true
    })
  }

  const OtherOptsCases = [
    [{ autolockMinutes: 0 },     'an autolock of no minutes'],
    [{ autolockMinutes: -5 },    'an autolock of negative minutes'],
    [{ autolockMinutes: '30' },  'an autolock written as text'],
    [{ gates: ['main'] },        'an option of the old core'],
    [{ requestCleartext: vi.fn() }, 'a requestCleartext, which a device does not take'],
    [{ onBadNews: 'tell me' },   'an onBadNews that is not a function'],
  ] as const

  for (const [moved, blurb] of OtherOptsCases) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => TH.makeDevice({}, moved as never), 'bad_record')
    })
  }

  const RecordCases = [
    [{ device_tok: undefined },            'no device_tok'],
    [{ device_tok: 'device_one' },         'a device_tok that is a label'],
    [{ banklabel: '' },                    'an empty banklabel'],
    [{ userid: 'u1' },                     'a userid, which signIn takes'],
    [{ gates: ['main'] },                  'a field a device record does not have'],
  ] as const

  for (const [moved, blurb] of RecordCases) {
    it(`refuses a record with ${blurb}`, () => {
      TH.expectSyncRefusal(() => Device.make({ device_tok: TH.DeviceTok, ...moved } as never, { keyDeriver: TH.testDeriver, vaultDB: new MemoryVaultDB() }), 'bad_record')
    })
  }

  it("refuses no record, no opts, or opts with no keyDeriver or no vaultDB", () => {
    const vaultDB = new MemoryVaultDB()
    const record = { banklabel: TH.WorldScope.banklabel, device_tok: TH.DeviceTok }
    TH.expectSyncRefusal(() => Device.make(null as never, { keyDeriver: TH.testDeriver, vaultDB }))
    TH.expectSyncRefusal(() => Device.make(record, undefined as never))
    TH.expectSyncRefusal(() => Device.make(record, { vaultDB } as never))
    TH.expectSyncRefusal(() => Device.make(record, { keyDeriver: TH.testDeriver } as never))
  })
})

/** The stages `device`'s snapshot shows, from now on, each once in a row. */
function stagesOf(device: Device): string[] {
  const stages = [device.getSnapshot().bank.stage as string]
  device.subscribe(() => { const { stage } = device.getSnapshot().bank; if (stages.at(-1) !== stage) { stages.push(stage) } })
  return stages
}

describe("device.hello()", () => {
  it("starts the device, signing nobody in, and answers the same promise each time", async () => {
    const device = TH.makeDevice({ userid: null })
    const helloing = device.hello()
    expect(device.hello()).to.equal(helloing)
    await helloing
    expect(device.getSnapshot()).to.deep.equal({ bank: SignedOutBank })
  })
})

describe("a device's persisters", () => {
  it("restore the roots at hello, and the stage stays starting until they have, asking the vaultDB nothing before", async () => {
    const { born, device, persisters } = await bornAndReloaded()
    const saved       = persisters.roots.restoreClient()
    let land          = noop
    vi.spyOn(persisters.roots, 'restoreClient').mockReturnValue(new Promise((resolve) => { land = () => { resolve(saved) } }))
    const tryGetThing = vi.spyOn(born.device.vaultDB, 'tryGetThing')
    const stages      = stagesOf(device)
    const signingIn   = device.signIn(TH.WorldScope.userid)
    await nextTick()
    expect([device.getSnapshot().bank.stage, tryGetThing.mock.calls.length]).to.deep.equal(['starting', 0])
    land()
    await signingIn
    expect(stages).to.deep.equal(['signed_out', 'starting', 'locked'])
  })

  it("restore the boxes and listings its vault cached", async () => {
    const persisters = memoryPersisters()
    const first      = TH.makeDevice({}, { persisters })
    const { vault }  = await TH.buildBornVault({ device: first })
    await vault.putBoxOnce('box/openai', { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    await first.minder.list('box')
    await nextTick()
    const device = TH.makeDevice({}, { vaultDB: vault.bank.vaultDB, persisters })
    await device.signIn(TH.WorldScope.userid)
    expect(Object.keys(device.minder.listingAt({ ...TH.WorldScope, labelpath: 'box' })?.items ?? {})).to.deep.equal(['openai'])
    expect(device.minder.at({ ...TH.WorldScope, labelpath: 'box/openai' })).to.have.property('labelpath', 'box/openai')
  })

  it("restore the signed-in bank's boxes at signIn, from the persister its scope gives, and the stage stays starting until they have", async () => {
    const persisters     = memoryPersisters()
    const born           = await TH.buildBornBank({ device: TH.makeDevice({}, { persisters }) })
    await nextTick()
    const boxesPersister = persisters.boxes(TH.WorldScope)
    const saved          = boxesPersister.restoreClient()
    let land             = noop
    vi.spyOn(boxesPersister, 'restoreClient').mockReturnValue(new Promise((resolve) => { land = () => { resolve(saved) } }))
    const boxes       = vi.fn(persisters.boxes)
    const device      = TH.makeDevice({ userid: null }, { vaultDB: born.device.vaultDB, persisters: { roots: persisters.roots, boxes } })
    const tryGetThing = vi.spyOn(born.device.vaultDB, 'tryGetThing')
    await device.hello()
    expect(boxes).not.toHaveBeenCalled()
    const signingIn = device.signIn(TH.WorldScope.userid)
    await nextTick()
    expect([device.getSnapshot().bank.stage, tryGetThing.mock.calls.length]).to.deep.equal(['starting', 0])
    expect(boxes.mock.calls).to.deep.equal([[TH.WorldScope]])
    land()
    await signingIn
    expect(device.getSnapshot().bank).to.include({ stage: 'locked' })
  })

  it("keep each bank's boxes in its own record, so another user signing in restores none of them", async () => {
    const persisters = memoryPersisters()
    const first      = TH.makeDevice({}, { persisters })
    const { vault }  = await TH.buildBornVault({ device: first })
    await vault.putBoxOnce('box/openai', { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    await nextTick()
    const otherScope = { ...TH.WorldScope, userid: 'u_other' }
    const device     = TH.makeDevice({ userid: null }, { vaultDB: vault.bank.vaultDB, persisters })
    await device.signIn(otherScope.userid)
    await nextTick()
    expect(device.minder.at({ ...otherScope, labelpath: 'box/openai' })).to.be.undefined
    expect(device.queryClient.getQueryCache().getAll().map((tsqQuery) => tsqQuery.queryKey[1])).to.not.include(TH.WorldScope.userid)
    const savedUserids = (await persisters.boxes(TH.WorldScope).restoreClient())!.clientState.queries.map((saved) => saved.queryKey[1])
    expect(new Set(savedUserids)).to.deep.equal(new Set([TH.WorldScope.userid]))
  })

  it("tell onBadNews where the signed-in bank's boxes fail to restore, and the bank comes up all the same", async () => {
    vi.spyOn(console, 'error').mockImplementation(noop)
    vi.spyOn(console, 'warn').mockImplementation(noop)
    const onBadNews              = vi.fn()
    const { device, persisters } = await bornAndReloaded({ onBadNews })
    vi.spyOn(persisters.boxes(TH.WorldScope), 'restoreClient').mockRejectedValue(new Error('disk on fire'))
    await device.signIn(TH.WorldScope.userid)
    expect(device.getSnapshot().bank).to.include({ stage: 'locked' })
    expect(onBadNews).toHaveBeenCalledTimes(1)
    expect((onBadNews.mock.calls[0]![0] as BadNews).news).to.include({ refusalkind: 'storage_unavailable' })
  })

  it("tell onBadNews where the roots fail to restore, and the device starts with that cache empty, never rejecting", async () => {
    vi.spyOn(console, 'error').mockImplementation(noop)
    vi.spyOn(console, 'warn').mockImplementation(noop)
    const onBadNews  = vi.fn()
    const persisters = memoryPersisters()
    vi.spyOn(persisters.roots, 'restoreClient').mockRejectedValue(new Error('disk on fire'))
    const device = TH.makeDevice({ userid: null }, { persisters, onBadNews })
    await device.hello()
    expect(onBadNews).toHaveBeenCalledTimes(1)
    expect((onBadNews.mock.calls[0]![0] as BadNews).news).to.include({ refusalkind: 'storage_unavailable' })
    await device.signIn(TH.WorldScope.userid)
    expect(device.getSnapshot().bank).to.include({ stage: 'unborn' })
  })

  it("tell the device which users it has seen a bank of, on any page", async () => {
    const { device } = await bornAndReloaded()
    expect(device.useridsSeen()).to.deep.equal([])
    await device.hello()
    expect(device.useridsSeen()).to.deep.equal([TH.WorldScope.userid])
    expect(TH.makeDevice({ userid: null }).useridsSeen()).to.deep.equal([])
  })

  it("tell the device of no user whose roots it has asked for and not heard of", async () => {
    const vaultDB = new MemoryVaultDB()
    vi.spyOn(vaultDB, 'tryGetThing').mockImplementation((ask) => Promise.resolve(refusedAnswerOf(ask, new Errors.VaultError('storage_unavailable', "Down."))))
    const device = TH.makeDevice({ userid: null }, { vaultDB, logger: TH.quietLogger })
    await device.hello()
    await device.signIn(TH.WorldScope.userid)
    expect(device.bankMinder.queryClient.getQueryCache().getAll()).to.not.be.empty
    expect(device.useridsSeen()).to.deep.equal([])
  })

  it("are refused where roots is not a Persister, or boxes not a function, naming it", () => {
    const rootsErr = TH.expectSyncRefusal(() => TH.makeDevice({}, { persisters: { roots: {}, boxes: memoryPersisters().boxes } } as never), 'bad_record')
    expect(rootsErr.message).to.include('persisters.roots')
    const boxesErr = TH.expectSyncRefusal(() => TH.makeDevice({}, { persisters: { roots: new MemoryPersister(), boxes: new MemoryPersister() } } as never), 'bad_record')
    expect(boxesErr.message).to.include('persisters.boxes')
  })
})

describe("a device nobody is signed in to", () => {
  it("refuses what needs a user, absent_vault", async () => {
    const device = TH.makeDevice({ userid: null })
    TH.expectSyncRefusal(() => device.scope, 'absent_vault')
    TH.expectSyncRefusal(() => device.bankMinder, 'absent_vault')
    TH.expectSyncRefusal(() => device.minder, 'absent_vault')
    await TH.expectRefusal(device.judgeStrength(TH.TestPassphrase), 'absent_vault')
  })

  it("refuses a birth, zeroing the passkey answer", () => {
    const passkeyCleartext = TH.passkeyAnswerOf()
    TH.expectSyncRefusal(() => TH.makeDevice({ userid: null }).birthGating({ passphraseCleartext: TH.TestPassphrase, passkeyCleartext }))
    expect(TH.isZeroed(passkeyCleartext.prfBytes)).to.be.true
  })
})

/** A device's persisters, each in memory: one of the roots, and one of each bank's boxes, the same at every call for that bank. */
function memoryPersisters(): DevicePersisters & Readonly<{ boxes: (scope: BankScope) => MemoryPersister }> {
  const boxesPersisters = new Map<string, MemoryPersister>()
  function boxes({ userid, banklabel }: BankScope): MemoryPersister {
    const recordlabel = `boxes:${userid}:${banklabel}`
    if (! boxesPersisters.has(recordlabel)) { boxesPersisters.set(recordlabel, new MemoryPersister()) }
    return boxesPersisters.get(recordlabel)!
  }
  return { roots: new MemoryPersister(), boxes }
}

/** Resolve on the next turn of the macrotask queue, by when TanStack has told its persister of what its cache last did. */
async function nextTick(): Promise<void> { await new Promise((resolve) => { setTimeout(resolve, 0) }) }

/** A bank born on a device that saves its caches to a pair of memory persisters, and a second device over its vaultDB and the same persisters, signed out: the page reloaded. */
async function bornAndReloaded(opts: Partial<DeviceOpts> = {}): Promise<{ born: TH.BornBank, device: Device, persisters: ReturnType<typeof memoryPersisters> }> {
  const persisters = memoryPersisters()
  const born       = await TH.buildBornBank({ device: TH.makeDevice({}, { persisters }) })
  await nextTick()
  return { born, device: TH.makeDevice({ userid: null }, { vaultDB: born.device.vaultDB, persisters, ...opts }), persisters }
}

describe("device.signIn(userid)", () => {
  it("finds the bank stored for its scope and shows it locked, with its vault", async () => {
    const born   = await TH.buildBornBank()
    const device = TH.makeDevice({ userid: null }, { vaultDB: born.device.vaultDB })
    const stages = stagesOf(device)
    await device.signIn(TH.WorldScope.userid)
    expect(stages).to.deep.equal(['signed_out', 'starting', 'locked'])
    expect([device.userid, device.scope]).to.deep.equal([TH.WorldScope.userid, TH.WorldScope])
    expect(device.bank).to.be.instanceOf(Bank)
    expect(device.bank!.scope).to.deep.equal(born.bank.scope)
    expect(device.vault!.bank).to.equal(device.bank)
    expect(device.vault!.minder).to.equal(device.minder)
    await TH.expectGood(device.bank!.gate.tryUnlock({ passphraseCleartext: TH.TestPassphrase }))
    expect(device.getSnapshot().bank).to.include({ stage: 'unlocked' })
  })

  it("brings the bank up locked from the world its persisters restored, and unlocks it on the cached gate, before the vaultDB answers", async () => {
    const { born, device } = await bornAndReloaded()
    const vaultDB = born.device.vaultDB as MemoryVaultDB
    vi.spyOn(vaultDB, 'tryGetThing').mockReturnValue(new Promise(noop))
    const stages = stagesOf(device)
    void device.signIn(TH.WorldScope.userid)
    await TH.eventually(() => device.bank !== null)
    expect(stages).to.deep.equal(['signed_out', 'starting', 'locked'])
    await TH.expectGood(device.bank!.gate.tryUnlock({ passphraseCleartext: TH.TestPassphrase }))
    expect(device.getSnapshot().bank).to.include({ stage: 'unlocked' })
  })

  it("keeps the bank brought up from the cache, and tells onBadNews, where the vaultDB is unavailable", async () => {
    const onBadNews        = vi.fn()
    const { born, device } = await bornAndReloaded({ onBadNews })
    const vaultDB          = born.device.vaultDB as MemoryVaultDB
    vi.spyOn(vaultDB, 'tryGetThing').mockImplementation((ask) => Promise.resolve(refusedAnswerOf(ask, new Errors.VaultError('storage_unavailable', "Down."))))
    await device.signIn(TH.WorldScope.userid)
    expect(device.getSnapshot().bank).to.include({ stage: 'locked' })
    await TH.eventually(() => onBadNews.mock.calls.length === 1)
    expect((onBadNews.mock.calls[0]![0] as BadNews).news).to.include({ refusalkind: 'storage_unavailable' })
  })

  it("shows its bank unborn where none is stored, and the bank born on it after", async () => {
    const device = TH.makeDevice({ userid: null })
    const stages = stagesOf(device)
    await device.signIn(TH.WorldScope.userid)
    expect(device.getSnapshot().bank).to.include({ stage: 'unborn', isLocked: true, lastErr: null })
    expect(device.bank).to.be.null
    expect(device.vault).to.be.null
    const bank = await device.birthGating({ passphraseCleartext: TH.TestPassphrase }).attempt()
    expect(stages).to.deep.equal(['signed_out', 'starting', 'unborn', 'unlocked'])
    expect(device.bank).to.equal(bank)
    expect(device.vault!.bank).to.equal(bank)
    expect(device.getSnapshot().bank).to.equal(bank.getSnapshot())
  })

  it("shows the refusal as failed where its bank cannot be read, and never rejects", async () => {
    const born    = await TH.buildBornBank()
    const vaultDB = born.device.vaultDB as MemoryVaultDB
    vaultDB._cheat_things(born.bank.scope).set('bank', { mangled: true })
    const device = TH.makeDevice({}, { vaultDB })
    await device.signIn(TH.WorldScope.userid)
    const shown = device.getSnapshot().bank
    expect(shown).to.include({ stage: 'failed', isLocked: true })
    expect(shown.lastErr).to.include({ refusalkind: 'storage_issue' })
    expect(Object.isFrozen(shown.lastErr)).to.be.true
    expect(device.bank).to.be.null
  })

  it("shows failed, and does not reject, where its vaultDB cannot watch", async () => {
    const vaultDB = new MemoryVaultDB()
    vi.spyOn(vaultDB, 'watch').mockImplementation(() => { throw new Error('no watching here') })
    const device = TH.makeDevice({}, { vaultDB })
    await device.signIn(TH.WorldScope.userid)
    expect(device.getSnapshot().bank).to.include({ stage: 'failed' })
    expect(device.getSnapshot().bank.lastErr).to.not.be.null
  })

  it("answers the same promise each time, and keeps the bank born on it since", async () => {
    const { bank, device } = await TH.buildBornBank()
    const signingIn = device.signIn(TH.WorldScope.userid)
    expect(device.signIn(TH.WorldScope.userid)).to.equal(signingIn)
    await signingIn
    expect(device.bank).to.equal(bank)
  })

  it("refuses a userid that is not one", () => {
    const device = TH.makeDevice({ userid: null })
    for (const userid of [42, '', undefined]) { TH.expectSyncRefusal(() => device.signIn(userid as never), 'bad_record') }
    expect(device.userid).to.be.null
  })
})

describe("device.birthGating(cleartexts)", () => {
  it("refuses until `signIn` answers", async () => {
    const device = TH.makeDevice()
    const signingIn = device.signIn(TH.WorldScope.userid)
    TH.expectSyncRefusal(() => device.birthGating({ passphraseCleartext: TH.TestPassphrase }), 'disabled')
    await signingIn
    expect(device.birthGating({ passphraseCleartext: TH.TestPassphrase })).to.be.instanceOf(BirthGating)
  })

  it("zeroes the passkey answer when it refuses before `signIn` answers", () => {
    const passkeyCleartext = TH.passkeyAnswerOf()
    TH.expectSyncRefusal(() => TH.makeDevice().birthGating({ passphraseCleartext: TH.TestPassphrase, passkeyCleartext }), 'disabled')
    expect(TH.isZeroed(passkeyCleartext.prfBytes)).to.be.true
  })

  it("keeps no bank where the birth is refused", async () => {
    const device = TH.makeDevice({}, { strengthChecker: () => ({ strong: false, reason: 'too short' }) })
    await device.signIn(TH.WorldScope.userid)
    await TH.expectRefusal(device.birthGating({ passphraseCleartext: TH.TestPassphrase }).attempt(), 'weak_passphrase')
    expect(device.bank).to.be.null
    expect(device.getSnapshot().bank).to.include({ stage: 'unborn' })
  })
})

describe("device.sweep()", () => {
  it("sweeps its bank, the device staying enabled and showing it swept, and never throws", async () => {
    const { bank, device } = await TH.buildBornBank()
    expect(device.sweep()).to.equal(device)
    expect(bank.isEnabled).to.be.false
    expect(device.isEnabled).to.be.true
    expect(device.getSnapshot().bank).to.include({ stage: 'swept' })
    expect(device.sweep()).to.equal(device)
    expect(device.getSnapshot().bank).to.equal(bank.getSnapshot())
  })

  it("rejects a call waiting for an `unlock` gating with its bank's end cause", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.lock()
    const ensuring = bank.ensureUnlocked()
    device.sweep()
    expect(await TH.expectRefusal(ensuring, 'disabled')).to.equal(bank.endCause)
  })

  it("leaves the device able to judge a passphrase", async () => {
    const { device } = await TH.buildBornBank()
    device.sweep()
    expect(await device.judgeStrength(TH.TestPassphrase)).to.deep.equal({ strong: true })
  })

  it("does nothing on a device with no bank, which births one after it", async () => {
    const device = TH.makeDevice()
    await device.signIn(TH.WorldScope.userid)
    device.sweep()
    const bank = await device.birthGating({ passphraseCleartext: TH.TestPassphrase }).attempt()
    expect(device.getSnapshot().bank).to.equal(bank.getSnapshot())
  })
})

describe("device.judgeStrength(passphraseCleartext)", () => {
  it("returns the verdict of the device's strength checker, given the device's scope", async () => {
    const strengthChecker = vi.fn((passphrase: string) => (passphrase === 'weak' ? { strong: false as const, reason: 'too short' } : { strong: true as const }))
    const device = TH.makeDevice({}, { strengthChecker })
    expect(await device.judgeStrength('weak')).to.deep.equal({ strong: false, reason: 'too short' })
    expect(await device.judgeStrength(TH.TestPassphrase)).to.deep.equal({ strong: true })
    expect(strengthChecker).toHaveBeenLastCalledWith(TH.TestPassphrase, TH.WorldScope)
  })

  it("judges every passphrase weak with no strengthChecker", async () => {
    const device = TH.makeDevice({}, { strengthChecker: undefined })
    expect(await device.judgeStrength(TH.TestPassphrase)).to.include({ strong: false })
  })

  it("rejects, rather than throws, a value that is not a string", async () => {
    await TH.expectRefusal(TH.makeDevice().judgeStrength(null as never), 'bad_record')
  })
})

describe("device.lock()", () => {
  it("locks the bank made on the device, and never throws", async () => {
    const { bank, device } = await TH.buildBornBank()
    expect(device.lock()).to.equal(device)
    expect(bank.isLocked).to.be.true
    expect(device.lock()).to.equal(device)
    expect(bank.isLocked).to.be.true
  })

  it("does nothing on a device with no bank, or a swept one", () => {
    const device = TH.makeDevice()
    expect(device.lock()).to.equal(device)
    device.sweep()
    expect(device.lock()).to.equal(device)
  })
})

/** A listener on `device`'s snapshot that records each snapshot it reads. */
function snapshotsOf(device: Device): DeviceSnapshot[] {
  const snapshots: DeviceSnapshot[] = []
  device.subscribe(() => { snapshots.push(device.getSnapshot()) })
  return snapshots
}

describe("device.getSnapshot() and device.subscribe(listener)", () => {
  it("shows the pending bank from signIn until a bank is found", () => {
    const device = TH.makeDevice()
    expect(device.getSnapshot()).to.deep.equal({ bank: PendingBank })
    expect(Object.isFrozen(device.getSnapshot())).to.be.true
  })

  it("carries the bank's own snapshot, and tells its subscribers of each change to it", async () => {
    const { bank, device } = await TH.buildBornBank()
    const snapshots = snapshotsOf(device)
    expect(device.getSnapshot().bank).to.equal(bank.getSnapshot())
    bank.lock()
    bank.lock()
    expect(snapshots).to.have.lengthOf(1)
    expect(snapshots[0]!.bank).to.equal(bank.getSnapshot())
    expect(snapshots[0]!.bank).to.include({ stage: 'locked' })
  })

  it("shows its own bank still when another bank is made over the same vaultDB, which it is not told of", async () => {
    const born = await TH.buildBornBank()
    const { bank, device } = born
    const other = TH.makeStoredBank(born)
    const snapshots = snapshotsOf(device)
    other.lock()
    expect(snapshots).to.have.lengthOf(0)
    expect(device.getSnapshot().bank).to.equal(bank.getSnapshot())
    expect(device.bank).to.equal(bank)
  })

  it("shows an `unlock` gating wanted while a call waits for one, and carries no cleartext", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.lock()
    const snapshots = snapshotsOf(device)
    const ensuring = bank.ensureUnlocked()
    const passphraseCleartext = 'not the passphrase, though long enough'
    await TH.expectRefusal(bank.gate.unlock({ passphraseCleartext }), 'wrong_passphrase')
    await bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    await ensuring
    expect(snapshots.map(({ bank: { stage, isUnlockWanted } }) => ({ stage, isUnlockWanted }))).to.deep.equal([
      { stage: 'locked', isUnlockWanted: true },
      { stage: 'unlocked', isUnlockWanted: false },
    ])
    expect(JSON.stringify(snapshots)).not.to.include(passphraseCleartext)
  })

  it("shows its bank swept once it is swept, and tells its subscribers so", async () => {
    const { bank, device } = await TH.buildBornBank()
    const snapshots = snapshotsOf(device)
    bank.sweep()
    expect(device.getSnapshot().bank).to.include({ stage: 'swept' })
    expect(snapshots.at(-1)).to.equal(device.getSnapshot())
  })

  it("tells every subscriber when one throws, and passes the throw to onBadNews", async () => {
    const onBadNews = vi.fn()
    const { bank, device } = await TH.buildBornBank({ device: TH.makeDevice({}, { onBadNews }) })
    device.subscribe(() => { throw new Error('a bug in the host') })
    const listener = vi.fn()
    device.subscribe(listener)
    bank.lock()
    expect(listener).toHaveBeenCalledOnce()
    await TH.eventually(() => onBadNews.mock.calls.length === 1)
    expect((onBadNews.mock.calls[0]![0] as BadNews).news).to.include({ refusalkind: 'unexpected_error' })
  })

  it("stops telling a listener once it unsubscribes", async () => {
    const { bank, device } = await TH.buildBornBank()
    const listener = vi.fn()
    const unsubscribe = device.subscribe(listener)
    unsubscribe()
    bank.lock()
    expect(listener).not.toHaveBeenCalled()
  })

  it("refuses a listener that is not a function", async () => {
    const { device } = await TH.buildBornBank()
    TH.expectSyncRefusal(() => device.subscribe(null as never), 'bad_record')
  })
})

describe("device.tellBadNews(badnews)", () => {
  it("passes a refusal on unchanged, wraps anything else thrown as an unexpected error, and drops the news of a thing disabled", async () => {
    const onBadNews = vi.fn()
    const device = TH.makeDevice({}, { onBadNews })
    device.tellBadNews([new Errors.VaultError('storage_unavailable', "Down."), new Error("Thrown."), new Errors.VaultError('disabled', "Gone.")])
    await TH.eventually(() => onBadNews.mock.calls.length === 2)
    expect(onBadNews.mock.calls.map(([heard]) => (heard as BadNews).news.refusalkind)).to.deep.equal(['storage_unavailable', 'unexpected_error'])
  })

  it("warns of each on the device's logger by default", async () => {
    const warn = vi.fn()
    const device = TH.makeDevice({}, { logger: { log: vi.fn(), warn, error: vi.fn() }, onBadNews: undefined })
    warn.mockClear()
    device.tellBadNews([new Errors.VaultError('storage_unavailable', "Down.")])
    await TH.eventually(() => warn.mock.calls.length === 1)
    expect(warn.mock.calls[0]?.slice(0, 2)).to.deep.equal(["Down.", { oplabel: 'Device.onBadNews', refusalkind: 'storage_unavailable' }])
    expect(DefaultOnBadNews).to.be.a('function')
  })

  it("tells the host's onBadNews still, once the device is swept", async () => {
    const onBadNews = vi.fn()
    const device = TH.makeDevice({}, { onBadNews })
    device.sweep()
    device.tellBadNews([new Errors.VaultError('storage_unavailable', "Down.")])
    await TH.eventually(() => onBadNews.mock.calls.length === 1)
    expect(onBadNews).toHaveBeenCalledOnce()
  })
})

describe("tellBadNewsTo", () => {
  it("calls the handler with each item of news and its device", async () => {
    const device = TH.makeDevice()
    const onBadNews = vi.fn()
    const news = [new Errors.VaultError('storage_unavailable', "Down."), new Errors.VaultError('absent_box', "Gone.")]
    tellBadNewsTo(onBadNews, device, news)
    await TH.eventually(() => onBadNews.mock.calls.length === 2)
    expect(onBadNews.mock.calls).to.deep.equal(news.map((told) => [{ news: told, device }]))
  })

  it("reports a handler's throw to the platform and still delivers the rest of the news", () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const told: string[] = []
    const device = TH.makeDevice()
    tellBadNewsTo(({ news }) => { told.push(news.refusalkind); throw new Error("The handler is broken.") }, device, [new Errors.VaultError('storage_unavailable', "Down."), new Errors.VaultError('absent_box', "Gone.")])
    expect(told).to.deep.equal(['storage_unavailable', 'absent_box'])
    expect(reported).toHaveBeenCalledTimes(2)
    vi.unstubAllGlobals()
  })

  it("reports a handler whose promise rejects to the platform, with no unhandled rejection", async () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const device = TH.makeDevice()
    tellBadNewsTo(() => Promise.reject(new Error("Rejected.")), device, [new Errors.VaultError('storage_unavailable', "Down.")])
    await TH.eventually(() => reported.mock.calls.length === 1)
    expect(reported.mock.calls[0]?.[0]).to.have.property('message', "Rejected.")
    vi.unstubAllGlobals()
  })

  it("refuses a handler that is not a function, or news that is not a VaultError", () => {
    const device = TH.makeDevice()
    const onBadNews = vi.fn()
    const news = new Errors.VaultError('storage_unavailable', "Down.")
    TH.expectSyncRefusal(() => { tellBadNewsTo('tell me' as never, device, [news]) }, 'bad_record')
    TH.expectSyncRefusal(() => { tellBadNewsTo(onBadNews, device, [new Error("Down.") as never]) }, 'bad_record')
    expect(onBadNews).not.toHaveBeenCalled()
  })
})
