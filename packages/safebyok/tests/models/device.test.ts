/** The device: its options, the host's functions it wraps, and its connect and disconnect, over its MemoryVaultDB. */

import { QueryClient } from '@tanstack/query-core'
import { noop } from 'es-toolkit'
import { afterEach, describe, expect, it, vi } from 'vitest'
// fake-indexeddb installs IndexedDB's globals, for the device database browserOpts() opens: no browser.
import 'fake-indexeddb/auto'
import { Consts, Errors, Phrases, SX } from 'safebyok-big/internals'
import { browserOpts } from '../../src/browser'
import { maskUuid } from '../../src/helpers/mask-uuid'
import { Bank } from '../../src/models/bank'
import { DefaultGateStaleMillis, DefaultJanitorMillis, DefaultLeaseMillis, DefaultOnBadNews, DefaultOnLifecycle, DefaultSoftlockMillis, Device, tellBadNewsTo } from '../../src/models/device'
import { BirthGating } from '../../src/models/gating'
import { VaultTSQ } from '../../src/minding/vault-tsq'
import { Vault } from '../../src/models/vault'
import { BankRootsMissing } from '../../src/phrases'
import { EmptyMaskedView } from '../../src/shapes/shapes-masked-view'
import { MemoryDeviceDB } from '../../src/storage/memory-device-db'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import { type GateRecord, type ThingRecord, ThingFormat } from '../../src/shapes/shapes-thing'
import { v7 as uuidv7 } from 'uuid'
import type { GetBankAnswer } from '../../src/shapes/shapes-answers'
import { refusedAnswerOf } from '../../src/storage/refused-answer'
import { VacantReadTc, readAtOf, readTcNow } from '../../src/storage/agerank'
import { type BadNews, type DeviceOpts, SignedOutBank } from '../../src/shapes/shapes-bankish'
import * as TH from '../test-helpers'

describe("a page that is not a secure context", () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it("refuses hello and signin, though it makes the device", () => {
    vi.stubGlobal('isSecureContext', false)
    const device = TH.makeDevice({ userid: null })
    const err = TH.expectSyncRefusal(() => device.hello(), 'insecure_context')
    expect(err.message).to.match(/https/)
    TH.expectSyncRefusal(() => device.signin(TH.WorldScope.userid), 'insecure_context')
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
  it("makes an enabled device of the record's banklabel, nobody signed in", () => {
    const device = TH.makeDevice({ userid: null })
    expect(device).to.include({ banklabel: TH.WorldScope.banklabel, userid: null })
    expect(device.bank.areRootsLive).to.be.false
    expect(device.bank.getSnapshot()).to.equal(SignedOutBank)
    expect(device.isEnabled).to.be.true
    expect(device.demandEnabled()).to.equal(device)
    expect(device.modelkind).to.eq('device')
  })

  it("serves the bank labelled 'main' where its record names none", () => {
    const device = Device.make({}, { keyDeriver: TH.testDeriver, logger: TH.quietLogger, vaultDB: new MemoryVaultDB() })
    expect(device.banklabel).to.eq('main')
  })

  it("asks its vaultDB nothing, and watches nothing, until it signs in", async () => {
    const vaultDB = new MemoryVaultDB()
    const [tryGetBank, tryGetThing, watch] = [vi.spyOn(vaultDB, 'tryGetBank'), vi.spyOn(vaultDB, 'tryGetThing'), vi.spyOn(vaultDB, 'watch')]
    const device = TH.makeDevice({ userid: null }, { vaultDB })
    await device.hello()
    expect([tryGetBank, tryGetThing, watch].map((spied) => spied.mock.calls.length)).to.deep.equal([0, 0, 0])
    await device.signin(TH.WorldScope.userid)
    // One get of the bank's three roots, and one watch, which everything listening shares through the device's VaultMinder.
    expect([tryGetBank, tryGetThing, watch].map((spied) => spied.mock.calls.length)).to.deep.equal([1, 0, 1])
  })

  it("accepts the bag of browserOpts() spread in, keeping the lease in its device database", () => {
    const vaultDB = new MemoryVaultDB()
    const opts = browserOpts({ dbName: 'device-test' })
    const device = Device.make({ banklabel: TH.WorldScope.banklabel }, { ...opts, vaultDB, logger: TH.quietLogger })
    expect(device.isEnabled).to.be.true
    expect([device.vaultDB, device.deviceDB]).to.deep.equal([vaultDB, opts.deviceDB])
  })

  it("keeps the lease in a MemoryDeviceDB of its own where the host gives no deviceDB", () => {
    const [device, other] = [TH.makeDevice(), TH.makeDevice()]
    expect(device.deviceDB).to.be.instanceOf(MemoryDeviceDB).and.not.equal(other.deviceDB)
  })

  it("refuses a deviceDB missing a verb, naming it", () => {
    const err = TH.expectSyncRefusal(() => TH.makeDevice({}, { deviceDB: { peekLease: vi.fn(), stowLease: vi.fn() } } as never), 'bad_record')
    expect(err.message).to.include('deviceDB: ')
  })

  it("gives each bank made on it the vaultDB it is given", () => {
    const vaultDB = new MemoryVaultDB()
    expect(TH.makeDevice({}, { vaultDB }).vaultDB).to.equal(vaultDB)
  })

  it("refuses a vaultDB missing a verb, naming it", () => {
    const err = TH.expectSyncRefusal(() => TH.makeDevice({}, { vaultDB: { tryGetThing: vi.fn() } } as never), 'bad_record')
    expect(err.message).to.include('vaultDB: ')
  })

  it("refuses queryCacheOpts, an option it does not take", () => {
    TH.expectSyncRefusal(() => TH.makeDevice({}, { queryCacheOpts: { staleTime: 5 } } as never), 'bad_record')
  })

  it("keeps the boxes in the host's QueryClient, under the bank's key, beside the host's own queries", async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['host', 'notes'], { note: 'mine' })
    const { device, vault } = await TH.buildBornVault({ device: TH.makeDevice({}, { queryClient }) })
    expect(device.vaultTsqClient).to.equal(queryClient)
    await vault.putBoxOnce('box/openai', { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const keys = queryClient.getQueryCache().getAll().map(({ queryKey }) => queryKey)
    expect(keys).to.deep.include(['host', 'notes'])
    expect(keys).to.deep.include(VaultTSQ.itemQueryKeyOf({ ...TH.WorldScope, modelkind: 'box', labelpath: 'box/openai' }))
    expect(queryClient.getQueryData(['host', 'notes'])).to.deep.equal({ note: 'mine' })
  })

  it("refuses a queryClient that is not one", () => {
    TH.expectSyncRefusal(() => TH.makeDevice({}, { queryClient: { query: vi.fn() } } as never), 'bad_record')
  })

  it("makes a QueryClient of its own where the host gives none, empty, the same before and after signin", async () => {
    const device = TH.makeDevice({ userid: null })
    const { vaultTsqClient } = device
    expect(vaultTsqClient.getQueryCache().getAll()).to.have.lengthOf(0)
    await device.signin(TH.WorldScope.userid)
    expect(device.vaultTsqClient).to.equal(vaultTsqClient)
    expect(device.vaultTsqClient).to.not.equal(TH.makeDevice({ userid: null }).vaultTsqClient)
  })

  it("makes the vault TSQ at signin, refusing it before then", async () => {
    const device = TH.makeDevice({ userid: null })
    TH.expectSyncRefusal(() => device.vaultTSQ, 'absent_vault')
    await device.signin(TH.WorldScope.userid)
    expect(device.vaultTSQ).to.be.instanceOf(VaultTSQ)
    expect(device.vaultTSQ).to.equal(device.vaultTSQ)
  })

  it("makes the vault last as signin starts the bank, null before then, before the vaultDB answers", () => {
    const vaultDB = new MemoryVaultDB()
    vi.spyOn(vaultDB, 'tryGetBank').mockReturnValue(new Promise(noop))
    const device = TH.makeDevice({ userid: null }, { vaultDB })
    expect(device.vault).to.be.null
    void device.signin(TH.WorldScope.userid)
    expect(device.vault).to.be.instanceOf(Vault)
    expect(device.bank.getSnapshot().stage).to.eq('starting')
  })

  it("serializes as its user and banklabel alone, and is frozen", () => {
    expect(TH.jsonOf(TH.makeDevice({ userid: null }))).to.deep.equal({ userid: null, banklabel: TH.WorldScope.banklabel })
    const device = TH.makeDevice()
    expect(TH.jsonOf(device)).to.deep.equal({ ...TH.WorldScope })
    expect(device.toJSON()).to.deep.equal(TH.jsonOf(device))
    expect(Object.isFrozen(device)).to.be.true
  })

  it("wraps each of the host's functions, leaving none of the host's own on a property", () => {
    const device = TH.makeDevice()
    for (const guarded of [device.keyDeriver, device.strengthChecker]) { expect(Consts.isGuarded(guarded)).to.be.true }
    expect([device.keyDeriver, device.strengthChecker]).to.not.include(TH.testDeriver).and.to.not.include(TH.anyStrengthChecker)
  })

  it("spreads to its banklabel and durations alone: nothing secret and nothing opaque", () => {
    const device = TH.makeDevice()
    // The spread is this test's subject: what a log line or a host's `{ ...device }` sees of a device.
    const spread = { ...device } // eslint-disable-line @typescript-eslint/no-misused-spread
    expect(Object.keys(spread)).to.have.members(['banklabel', 'leaseMillis', 'softlockMillis', 'janitorMillis', 'gateStaleMillis'])
    expect(Object.values(spread).every((val) => ['string', 'number'].includes(typeof val))).to.be.true
    expect([device.vaultDB, device.keyDeriver, device.strengthChecker, device.logger]).to.not.include(undefined)
  })

  it("rounds a fraction of a minute to the nearest millisecond, and turns Infinity into ForeverMillis", () => {
    expect(TH.makeDevice({}, { autolockMinutes: 1 / 7 }).leaseMillis).to.eq(8571)
    expect(TH.makeDevice({}, { autolockMinutes: Infinity }).leaseMillis).to.eq(Consts.ForeverMillis)
    expect(TH.makeDevice({}, { autolockMinutes: 30 }).autolockMinutes).to.eq(30)
  })

  it("leases for DefaultLeaseMillis where the host names no autolockMinutes", () => {
    expect(TH.makeDevice({}, { autolockMinutes: undefined }).leaseMillis).to.eq(DefaultLeaseMillis)
  })

  it("keeps the softlock, janitor period and gate staleness the host names, or their defaults", () => {
    const device = TH.makeDevice()
    expect([device.softlockMillis, device.janitorMillis, device.gateStaleMillis]).to.deep.equal([DefaultSoftlockMillis, DefaultJanitorMillis, DefaultGateStaleMillis])
    expect(TH.makeDevice({}, { softlockMinutes: 3, janitorMinutes: 2, gateStaleMinutes: 60 })).to.include({ softlockMillis: 3 * 60_000, janitorMillis: 2 * 60_000, gateStaleMillis: 60 * 60_000 })
  })

  it("softlocks for at most a twentieth of its lease, and not at all where that is under a minute", () => {
    expect(TH.makeDevice({}, { autolockMinutes: 100, softlockMinutes: 10 }).softlockMillis).to.eq(5 * 60_000)
    expect(TH.makeDevice({}, { autolockMinutes: 30, softlockMinutes: 10 }).softlockMillis).to.eq(90_000)
    expect(TH.makeDevice({}, { autolockMinutes: 19, softlockMinutes: 10 }).softlockMillis).to.eq(0)
    expect(TH.makeDevice({}, { autolockMinutes: 60, softlockMinutes: 0.5 }).softlockMillis).to.eq(0)
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
    [{ softlockMinutes: 0 },     'a softlock of no minutes'],
    [{ janitorMinutes: -1 },     'a janitor period of negative minutes'],
    [{ gateStaleMinutes: '720' }, 'a gate staleness written as text'],
    [{ gates: ['main'] },        'an option of the old core'],
    [{ requestCleartext: vi.fn() }, 'a requestCleartext, which a device does not take'],
    [{ onBadNews: 'tell me' },   'an onBadNews that is not a function'],
    [{ onLifecycle: 'tell me' }, 'an onLifecycle that is not a function'],
    [{ devicetok: 'device_one' }, 'a devicetok that is a label'],
    [{ devicetok: '' },          'an empty devicetok'],
  ] as const

  for (const [moved, blurb] of OtherOptsCases) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => TH.makeDevice({}, moved as never), 'bad_record')
    })
  }

  const RecordCases = [
    [{ devicetok: TH.Devicetok },          'a devicetok, which its opts take'],
    [{ banklabel: '' },                    'an empty banklabel'],
    [{ userid: 'u1' },                     'a userid, which signin takes'],
    [{ gates: ['main'] },                  'a field a device record does not have'],
  ] as const

  for (const [moved, blurb] of RecordCases) {
    it(`refuses a record with ${blurb}`, () => {
      TH.expectSyncRefusal(() => Device.make({ ...moved } as never, { keyDeriver: TH.testDeriver, vaultDB: new MemoryVaultDB() }), 'bad_record')
    })
  }

  it("is made of a record with the root box's labelpath for a banklabel", () => {
    const device = Device.make({ banklabel: 'box' }, { keyDeriver: TH.testDeriver, vaultDB: new MemoryVaultDB() })
    expect(device.isEnabled).to.be.true
  })

  it("refuses no record, no opts, or opts with no keyDeriver or no vaultDB", () => {
    const vaultDB = new MemoryVaultDB()
    const record = { banklabel: TH.WorldScope.banklabel }
    TH.expectSyncRefusal(() => Device.make(null as never, { keyDeriver: TH.testDeriver, vaultDB }))
    TH.expectSyncRefusal(() => Device.make(record, undefined as never))
    TH.expectSyncRefusal(() => Device.make(record, { vaultDB } as never))
    TH.expectSyncRefusal(() => Device.make(record, { keyDeriver: TH.testDeriver } as never))
  })
})

/** The stages `device`'s bank shows, from now on, each once in a row. */
function stagesOf(device: Device): string[] {
  const { bank } = device
  const stages = [bank.getSnapshot().stage as string]
  bank.subscribe(() => { const { stage } = bank.getSnapshot(); if (stages.at(-1) !== stage) { stages.push(stage) } })
  return stages
}

describe("device.hello()", () => {
  it("starts the device, signing nobody in and reading nothing from its root shelf, each time", async () => {
    const rootShelf = new TH.MemoryShelf()
    const getItem   = vi.spyOn(rootShelf, 'getItem')
    const device    = TH.makeDevice({ userid: null }, { rootShelf })
    await device.hello()
    await device.hello()
    expect(device.bank.getSnapshot()).to.equal(SignedOutBank)
    expect(getItem).not.toHaveBeenCalled()
  })
})

/** The value `rootShelf` keeps of the device's bank, parsed: its version, then its gate's and its root box's records. */
function shelvedOf(rootShelf: TH.MemoryShelf): unknown[] {
  return JSON.parse(rootShelf.getItem(WorldShelfCkey) ?? 'null') as unknown[]
}

/** The root shelf's key of the device's bank. */
const WorldShelfCkey = `safebyok:roots:${TH.WorldScope.banklabel}:${TH.WorldScope.userid}`

/** Each value at the bank's key that reads as nothing kept, and what it is. */
const UnreadShelvedCases = [
  ["[\"roots-a000000\",{},{}]",            'a value of another version'],
  [`["roots-${ThingFormat}",{},{}]`,        'a value of the version that kept no read times'],
  [`["roots-tc-${ThingFormat}",{},{},{}]`,  'a value of today\'s version with three roots, as when the bank was a Thing of its own'],
  ["{\"bank\":",                            'a value that does not parse'],
  [`["roots-tc-${ThingFormat}"]`,            'a value of today\'s version without its roots'],
] as const

describe("a device's root shelf", () => {
  it("has the bank's two roots once it is born, under the bank's key, after the version, each whole beside when it was read", async () => {
    const rootShelf = new TH.MemoryShelf()
    const { device, bank } = await TH.buildBornBank({ device: TH.makeDevice({}, { rootShelf }) })
    expect([...rootShelf.items.keys()]).to.deep.equal([WorldShelfCkey])
    const [version, ...roots] = shelvedOf(rootShelf)
    expect(version).to.eq(`roots-tc-${ThingFormat}`)
    const records = [bank.gate.pickle(), bank.rootBox]
    expect(roots).to.deep.equal(records.map((record) => ({ record, read_tc: device.bank.vaultMinder!.carAt(record)!.read_tc })))
    expect(roots.map((root) => (root as { read_tc: string }).read_tc)).to.not.include(VacantReadTc)
  })

  it("has the gate's next revision once the passphrase is replaced", async () => {
    const rootShelf = new TH.MemoryShelf()
    const { bank }  = await TH.buildBornBank({ device: TH.makeDevice({}, { rootShelf }) })
    await bank.gate.gatingReplacePassphraseAttempt({ passphrase: TH.TestPassphrase, nextPassphrase: 'another fake passphrase for tests' })
    const { record } = shelvedOf(rootShelf)[1] as { record: { revseq: number } }
    expect(record).to.deep.equal(bank.gate.pickle())
    expect(record.revseq).to.eq(1)
  })

  for (const [shelved, blurb] of UnreadShelvedCases) {
    it(`reads ${blurb} as nothing kept, removing it, and the bank comes up from the vaultDB`, async () => {
      const { born, device, rootShelf } = await bornAndReloaded()
      rootShelf.setItem(WorldShelfCkey, shelved)
      const removeItem  = vi.spyOn(rootShelf, 'removeItem')
      const tryGetBank = vi.spyOn(born.device.vaultDB, 'tryGetBank')
      const stages      = stagesOf(device)
      await device.signin(TH.WorldScope.userid)
      expect(stages).to.deep.equal(['signed_out', 'starting', 'locked'])
      expect(tryGetBank).toHaveBeenCalled()
      expect(removeItem.mock.calls[0]).to.deep.equal([WorldShelfCkey])
    })
  }

  it("keeps when each root was read, so storage confirming the same revisions in a later tcchunk is news, put back with when it was read", async () => {
    const { born, device, rootShelf } = await bornAndReloaded()
    const earlier = uuidv7({ msecs: (Math.floor(Date.now() / 65_536) - 10) * 65_536 })
    const [version, ...shelved] = shelvedOf(rootShelf) as [string, ...{ record: ThingRecord, read_tc: string }[]]
    rootShelf.setItem(WorldShelfCkey, JSON.stringify([version, ...shelved.map(({ record }) => ({ record, read_tc: earlier }))]))
    const tryGetBank = vi.spyOn(born.device.vaultDB, 'tryGetBank')
    const signingIn   = device.signin(TH.WorldScope.userid)
    const things      = [device.bank.gate.pickle(), device.bank.rootBox]
    expect(things.map((thing) => device.bank.vaultMinder!.carAt(thing)!.read_tc)).to.deep.equal([earlier, earlier])
    await signingIn
    const { read_tc } = await tryGetBank.mock.results[0]!.value as GetBankAnswer
    expect(things.map((thing) => device.bank.vaultMinder!.carAt(thing)!.read_tc)).to.deep.equal([read_tc, read_tc])
    expect(shelvedOf(rootShelf).slice(1)).to.deep.equal(shelved.map(({ record }) => ({ record, read_tc })))
  })

  it("keeps each bank's roots under a key of its own, so another user signing in reads none of them", async () => {
    const { device, rootShelf } = await bornAndReloaded()
    const otherScope = { ...TH.WorldScope, userid: 'u_other' }
    const stages     = stagesOf(device)
    await device.signin(otherScope.userid)
    expect(stages).to.deep.equal(['signed_out', 'starting', 'unborn'])
    expect(device.bank.gate.pickle()).to.deep.equal({ ...TH.gateShellOf(), userid: otherScope.userid })
    expect([...rootShelf.items.keys()]).to.deep.equal([WorldShelfCkey])
  })

  it("tells onBadNews of an incompatible root, and the others still reach their Things", async () => {
    const onBadNews = vi.fn()
    const { born, device, rootShelf } = await bornAndReloaded({ onBadNews })
    const [version, , rootBox] = shelvedOf(rootShelf) as [string, unknown, { record: unknown }]
    rootShelf.setItem(WorldShelfCkey, JSON.stringify([version, { record: { labelpath: TH.GateScope.labelpath }, read_tc: readTcNow() }, rootBox]))
    vi.spyOn(born.device.vaultDB, 'tryGetBank').mockReturnValue(new Promise(noop))
    void device.signin(TH.WorldScope.userid)
    await TH.eventually(() => onBadNews.mock.calls.length === 1)
    expect((onBadNews.mock.calls[0]![0] as BadNews).news).to.include({ refusalkind: 'bad_record' })
    expect(device.bank.vaultMinder!.thingAt(TH.RootScope)?.pickle()).to.deep.equal(rootBox.record)
    expect(device.bank.vaultMinder!.thingAt(TH.GateScope)?.pickle()).to.deep.equal(TH.gateShellOf())
    expect(device.bank.getSnapshot().stage).to.eq('starting')
  })

  it("tells onBadNews where it throws, and the bank comes up from the vaultDB, or is born, all the same", async () => {
    const onBadNews = vi.fn()
    const { device, rootShelf } = await bornAndReloaded({ onBadNews })
    vi.spyOn(rootShelf, 'getItem').mockImplementation(() => { throw new Error('storage withheld') })
    await device.signin(TH.WorldScope.userid)
    expect(device.bank.getSnapshot()).to.include({ stage: 'locked' })
    const fullShelf = new TH.MemoryShelf()
    vi.spyOn(fullShelf, 'setItem').mockImplementation(() => { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError') })
    const { bank } = await TH.buildBornBank({ device: TH.makeDevice({}, { rootShelf: fullShelf, onBadNews }) })
    expect(bank.device.bank.getSnapshot().stage).to.eq('unlocked')
    await TH.eventually(() => onBadNews.mock.calls.length === 2)
    expect(onBadNews.mock.calls.map((call) => (call[0] as BadNews).news.refusalkind)).to.deep.equal(['storage_unavailable', 'storage_unavailable'])
  })

  it("is refused where it lacks a method of the three, naming the option", () => {
    for (const rootShelf of [{}, { getItem: noop, setItem: noop }, 'localStorage']) {
      const err = TH.expectSyncRefusal(() => TH.makeDevice({}, { rootShelf } as never), 'bad_record')
      expect(err.message).to.include('rootShelf')
    }
  })
})

/** A bank born on a device that keeps its roots on a memory shelf, and a second device over its vaultDB and the same shelf, signed out: the page reloaded. */
// The VaultMinder reads no wayin, so the gate's Thing is the first to refuse it.
/** `answer`, its gate's wayins mangled in its roots, at `revseq` where given */
function withGateMangled(answer: GetBankAnswer, revseq?: number): GetBankAnswer {
  if (! answer.ok) { return answer }
  const gate = { ...answer.val.gate, wayins: { main: {}, passkey0: null }, ...((revseq !== undefined) && { revseq }) } as GateRecord
  return { ...answer, val: { ...answer.val, gate } }
}

async function bornAndReloaded(opts: Partial<DeviceOpts> = {}): Promise<{ born: TH.BornBank, device: Device, rootShelf: TH.MemoryShelf }> {
  const rootShelf = new TH.MemoryShelf()
  const born      = await TH.buildBornBank({ device: TH.makeDevice({}, { rootShelf }) })
  return { born, device: TH.makeDevice({ userid: null }, { vaultDB: born.device.vaultDB, rootShelf, ...opts }), rootShelf }
}

describe("device.signin(userid)", () => {
  it("finds the bank stored for its scope and shows it locked, with its vault", async () => {
    const born   = await TH.buildBornBank()
    const device = TH.makeDevice({ userid: null }, { vaultDB: born.device.vaultDB })
    const stages = stagesOf(device)
    await device.signin(TH.WorldScope.userid)
    expect(stages).to.deep.equal(['signed_out', 'starting', 'locked'])
    expect([device.userid, device.scope]).to.deep.equal([TH.WorldScope.userid, TH.WorldScope])
    expect(device.bank).to.be.instanceOf(Bank)
    expect(device.bank.areRootsLive).to.be.true
    expect(device.bank.scope).to.deep.equal(born.bank.scope)
    expect(device.vault!.bank).to.equal(device.bank)
    expect(device.vault!.bank.device).to.equal(device)
    await device.bank.gate.gatingUnlockAttempt({ passphrase: TH.TestPassphrase })
    expect(device.bank.getSnapshot()).to.include({ stage: 'unlocked' })
  })

  it("brings the bank up locked from the roots its root shelf keeps, and unlocks it on that gate, before the vaultDB answers", async () => {
    const { born, device } = await bornAndReloaded()
    const vaultDB = born.device.vaultDB as MemoryVaultDB
    vi.spyOn(vaultDB, 'tryGetBank').mockReturnValue(new Promise(noop))
    const stages = stagesOf(device)
    void device.signin(TH.WorldScope.userid)
    await TH.eventually(() => device.bank.areRootsLive)
    expect(stages).to.deep.equal(['signed_out', 'starting', 'locked'])
    await device.bank.gate.gatingUnlockAttempt({ passphrase: TH.TestPassphrase })
    expect(device.bank.getSnapshot()).to.include({ stage: 'unlocked' })
  })

  it("keeps the bank its root shelf brought up, and tells onBadNews, where the vaultDB is unavailable", async () => {
    const onBadNews        = vi.fn()
    const { born, device } = await bornAndReloaded({ onBadNews })
    const vaultDB          = born.device.vaultDB as MemoryVaultDB
    vi.spyOn(vaultDB, 'tryGetBank').mockImplementation((ask) => Promise.resolve(refusedAnswerOf(ask, new Errors.VaultError('storage_unavailable', "Down."))))
    await device.signin(TH.WorldScope.userid)
    expect(device.bank.getSnapshot()).to.include({ stage: 'locked' })
    await TH.eventually(() => onBadNews.mock.calls.length === 1)
    expect((onBadNews.mock.calls[0]![0] as BadNews).news).to.include({ refusalkind: 'storage_unavailable' })
  })

  it("shows its bank unborn where none is stored, and the bank born on it after, locked and then unlocked", async () => {
    const device = TH.makeDevice({ userid: null })
    const stages = stagesOf(device)
    await device.signin(TH.WorldScope.userid)
    expect(device.bank.getSnapshot()).to.include({ stage: 'unborn', isLocked: true, lastErr: null })
    expect(device.bank.areRootsLive).to.be.false
    const { vault } = device
    expect(vault!.bank).to.equal(device.bank)
    const shownLocked: (Bank | null)[] = []
    device.bank.subscribe(() => { if (device.bank.getSnapshot().stage === 'locked') { shownLocked.push(device.bank) } })
    const bank = await device.birthGating({ passphraseCleartext: TH.TestPassphrase }).attempt()
    expect(stages).to.deep.equal(['signed_out', 'starting', 'unborn', 'locked', 'unlocked'])
    expect(shownLocked).to.have.lengthOf(1)
    expect(shownLocked[0]).to.equal(bank)
    expect(device.bank).to.equal(bank)
    expect(device.vault).to.equal(vault)
    expect(vault!.bank).to.equal(bank)
    expect(device.bank.getSnapshot()).to.include({ stage: 'unlocked' })
  })

  it("has its bank's VaultMinder build asks that carry the void banktok until it has a bank, and the bank's after", async () => {
    const device = TH.makeDevice({ userid: null })
    await device.signin(TH.WorldScope.userid)
    const vaultMinder = device.bank.demandVaultMinder()
    expect(vaultMinder.makeGetAsk({ modelkind: 'gate', labelpath: TH.GateScope.labelpath })).to.deep.include({ banktok: SX.VoidLifeTok })
    expect(vaultMinder.makeListAsk({ modelkind: 'box', labelpath: 'box' })).to.deep.include({ banktok: SX.VoidLifeTok })
    const bank = await device.birthGating({ passphraseCleartext: TH.TestPassphrase }).attempt()
    expect(vaultMinder.makeGetAsk({ modelkind: 'gate', labelpath: TH.GateScope.labelpath })).to.deep.include({ banktok: bank.banktok })
  })

  it("shows the vaultDB's refusal as failed where its gate is incompatible, and never rejects", async () => {
    const born    = await TH.buildBornBank()
    const vaultDB = born.device.vaultDB as MemoryVaultDB
    vaultDB._cheat_things(born.bank.scope).gate.set(TH.GateScope.labelpath, { mangled: true })
    const device = TH.makeDevice({}, { vaultDB })
    await device.signin(TH.WorldScope.userid)
    const shown = device.bank.getSnapshot()
    expect(shown).to.include({ stage: 'failed', isLocked: true })
    expect(shown.lastErr).to.include({ refusalkind: 'incompatible_row' })
    expect(Object.isFrozen(shown.lastErr)).to.be.true
    expect(device.bank.areRootsLive).to.be.false
  })

  it("shows the roots missing as failed where the gate is stored live with no root box, and never rejects", async () => {
    const born    = await TH.buildBornBank()
    const vaultDB = born.device.vaultDB as MemoryVaultDB
    vaultDB._cheat_things(born.bank.scope).box.delete('box')
    const device = TH.makeDevice({}, { vaultDB })
    await device.signin(TH.WorldScope.userid)
    const shown = device.bank.getSnapshot()
    expect(shown).to.include({ stage: 'failed', isLocked: true })
    expect(shown.lastErr).to.include({ refusalkind: 'storage_issue', message: BankRootsMissing })
    expect(device.bank.areRootsLive).to.be.false
  })

  it("tells onBadNews once of a root its Thing refuses, and shows the roots missing as failed", async () => {
    const onBadNews = vi.fn()
    const born      = await TH.buildBornBank()
    const vaultDB   = born.device.vaultDB as MemoryVaultDB
    const device    = TH.makeDevice({ userid: null }, { vaultDB, onBadNews })
    const getBank  = vaultDB.tryGetBank.bind(vaultDB)
    vi.spyOn(vaultDB, 'tryGetBank').mockImplementation(async (ask) => withGateMangled(await getBank(ask)))
    await device.signin(TH.WorldScope.userid)
    expect(device.bank.getSnapshot().lastErr).to.include({ refusalkind: 'storage_issue', message: BankRootsMissing })
    await TH.eventually(() => onBadNews.mock.calls.length > 0)
    expect(onBadNews.mock.calls.map((call) => (call[0] as BadNews).news.refusalkind)).to.deep.equal(['bad_record'])
  })

  it("tells onBadNews once of a root its Thing refuses, and keeps the bank its root shelf brought up", async () => {
    const onBadNews        = vi.fn()
    const { born, device } = await bornAndReloaded({ onBadNews })
    const vaultDB          = born.device.vaultDB as MemoryVaultDB
    const getBank         = vaultDB.tryGetBank.bind(vaultDB)
    vi.spyOn(vaultDB, 'tryGetBank').mockImplementation(async (ask) => withGateMangled(await getBank(ask), born.bank.gate.pickle().revseq + 1))
    await device.signin(TH.WorldScope.userid)
    expect(device.bank.getSnapshot()).to.include({ stage: 'locked', lastErr: null })
    await TH.eventually(() => onBadNews.mock.calls.length > 0)
    expect(onBadNews.mock.calls.map((call) => (call[0] as BadNews).news.refusalkind)).to.deep.equal(['bad_record'])
  })

  it("tells onBadNews, and brings the bank up all the same, where its vaultDB cannot watch", async () => {
    const onBadNews = vi.fn()
    const vaultDB = new MemoryVaultDB()
    vi.spyOn(vaultDB, 'watch').mockImplementation(() => { throw new Error('no watching here') })
    const device = TH.makeDevice({}, { vaultDB, onBadNews })
    await device.signin(TH.WorldScope.userid)
    expect(device.bank.getSnapshot()).to.include({ stage: 'unborn', lastErr: null })
    await TH.eventually(() => onBadNews.mock.calls.length > 0)
    expect(onBadNews.mock.calls.map(([heard]) => (heard as BadNews).news.refusalkind)).to.deep.equal(['unexpected_error'])
  })

  it("answers the same promise each time, and keeps the bank born on it since", async () => {
    const { bank, device } = await TH.buildBornBank()
    const signingIn = device.signin(TH.WorldScope.userid)
    expect(device.signin(TH.WorldScope.userid)).to.equal(signingIn)
    await signingIn
    expect(device.bank).to.equal(bank)
  })

  it("refuses a userid that is not one", () => {
    const device = TH.makeDevice({ userid: null })
    for (const userid of [42, '', undefined]) { TH.expectSyncRefusal(() => device.signin(userid as never), 'bad_record') }
    expect(device.userid).to.be.null
  })
})

describe("device.birthGating(cleartexts)", () => {
  it("refuses until `signin` answers", async () => {
    const device = TH.makeDevice()
    const signingIn = device.signin(TH.WorldScope.userid)
    TH.expectSyncRefusal(() => device.birthGating({ passphraseCleartext: TH.TestPassphrase }), 'disabled')
    await signingIn
    expect(device.birthGating({ passphraseCleartext: TH.TestPassphrase })).to.be.instanceOf(BirthGating)
  })

  it("zeroes the passkey answer when it refuses before `signin` answers", () => {
    const passkeyCleartext = TH.passkeyAnswerOf()
    TH.expectSyncRefusal(() => TH.makeDevice().birthGating({ passphraseCleartext: TH.TestPassphrase, passkeyCleartext }), 'disabled')
    expect(TH.isZeroed(passkeyCleartext.prfBytes)).to.be.true
  })

  it("keeps no bank where the birth is refused", async () => {
    const device = TH.makeDevice({}, { strengthChecker: () => ({ strong: false, reason: 'too short' }) })
    await device.signin(TH.WorldScope.userid)
    await TH.expectRefusal(device.birthGating({ passphraseCleartext: TH.TestPassphrase }).attempt(), 'weak_passphrase')
    expect(device.bank.areRootsLive).to.be.false
    expect(device.bank.getSnapshot()).to.include({ stage: 'unborn' })
  })
})

/** A device signed in where no bank is stored, its watch muted where `isWatching` is false, and a bank born on another device over its vaultDB after. */
async function unbornThenBornElsewhere(isWatching: boolean): Promise<Device> {
  const vaultDB = new MemoryVaultDB()
  if (! isWatching) { vi.spyOn(vaultDB, 'watch').mockReturnValue(noop) }
  const device = TH.makeDevice({ userid: null }, { vaultDB })
  await device.signin(TH.WorldScope.userid)
  expect(device.bank.getSnapshot().stage).to.eq('unborn')
  await TH.buildBornBank({ device: TH.makeDevice({ userid: null }, { vaultDB }) })
  return device
}

describe("a device signed in to an unborn bank, of the bank born on another device over its vaultDB", () => {
  it("shows it locked once an ordinary get answers", async () => {
    const device = await unbornThenBornElsewhere(false)
    await TH.aWhile()
    expect(device.bank.getSnapshot().stage).to.eq('unborn')
    await device.bank.demandVaultMinder().tryGetOnce({ ...TH.WorldScope, modelkind: 'box', labelpath: 'box/openai' })
    expect(device.bank.getSnapshot().stage).to.eq('locked')
  })

  it("shows it locked from its watch's notices", async () => {
    const device = await unbornThenBornElsewhere(true)
    await TH.eventually(() => device.bank.getSnapshot().stage === 'locked')
    expect(device.bank.getSnapshot()).to.include({ stage: 'locked', lastErr: null })
  })
})

describe("device.connect() and device.disconnect()", () => {
  it("watches nothing until connected, even once signed in, and watches once however often connected", async () => {
    const vaultDB = new MemoryVaultDB()
    const watch = vi.spyOn(vaultDB, 'watch')
    const device = Device.make({ banklabel: TH.WorldScope.banklabel }, { keyDeriver: TH.testDeriver, logger: TH.quietLogger, vaultDB })
    await device.signin(TH.WorldScope.userid)
    expect(watch).not.toHaveBeenCalled()
    expect(device.connect().connect()).to.equal(device)
    expect(watch).toHaveBeenCalledOnce()
  })

  it("locks its bank and stops the watch, however often disconnected, the device and its bank staying enabled, and at its next connect watches again and takes up the lease stored", async () => {
    const vaultDB = new MemoryVaultDB()
    const stop = vi.fn()
    const watch = vi.spyOn(vaultDB, 'watch').mockReturnValue(stop)
    const { bank, device } = await TH.buildBornBank({ device: TH.makeDevice({}, { vaultDB }) })
    expect(device.disconnect().disconnect()).to.equal(device)
    expect([bank.isLocked, bank.isEnabled, device.isEnabled, stop.mock.calls.length]).to.deep.equal([true, true, true, 1])
    expect(device.bank.getSnapshot()).to.include({ stage: 'locked' })
    device.connect()
    expect(watch).toHaveBeenCalledTimes(2)
    await TH.eventually(() => bank.isUnlocked)
  })

  it("leaves a call waiting for an `unlock` gating waiting, and the next unlock resolves it", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.lock()
    const ensuring = bank.ensureUnlocked()
    device.disconnect()
    expect(device.bank.getSnapshot().isUnlockWanted).to.be.true
    await bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    expect(await ensuring).to.equal(bank)
  })

  it("never throws, telling onBadNews what the vaultDB's watch throws as it starts or stops", async () => {
    const onBadNews = vi.fn()
    const vaultDB = new MemoryVaultDB()
    const device = Device.make({ banklabel: TH.WorldScope.banklabel }, { keyDeriver: TH.testDeriver, logger: TH.quietLogger, vaultDB, onBadNews })
    await device.signin(TH.WorldScope.userid)
    vi.spyOn(vaultDB, 'watch').mockImplementationOnce(() => { throw new Error('no watching here') }).mockReturnValue(() => { throw new Error('no stopping here') })
    device.connect()
    device.disconnect()
    device.connect()
    device.disconnect()
    await TH.eventually(() => onBadNews.mock.calls.length === 2)
    expect(onBadNews.mock.calls.map(([heard]) => (heard as BadNews).news.refusalkind)).to.deep.equal(['unexpected_error', 'unexpected_error'])
  })

  it("leaves the device's verbs working: it judges a passphrase, and births a bank", async () => {
    const device = TH.makeDevice()
    await device.signin(TH.WorldScope.userid)
    device.disconnect()
    expect(await device.judgeStrength(TH.TestPassphrase)).to.deep.equal({ strong: true })
    const bank = await device.birthGating({ passphraseCleartext: TH.TestPassphrase }).attempt()
    expect(device.bank).to.equal(bank)
    expect(device.bank.getSnapshot()).to.include({ stage: 'unlocked' })
  })
})

describe("device.disable()", () => {
  it("ends the device and its bank for good, once", async () => {
    const vaultDB = new MemoryVaultDB()
    const stop = vi.fn()
    vi.spyOn(vaultDB, 'watch').mockReturnValue(stop)
    const { bank, device } = await TH.buildBornBank({ device: TH.makeDevice({}, { vaultDB }) })
    expect(device.disable()).to.equal(device)
    expect([device.isEnabled, bank.isEnabled, bank.isLocked, stop.mock.calls.length]).to.deep.equal([false, false, true, 1])
    expect(device.endCause).to.include({ refusalkind: 'disabled', message: Phrases.DeviceLetGo })
    const disabled = device.bank.getSnapshot()
    expect(disabled).to.include({ stage: 'disabled', isEnded: true, endCause: device.endCause })
    expect(device.disable()).to.equal(device)
    expect([device.bank.getSnapshot(), stop.mock.calls.length]).to.deep.equal([disabled, 1])
  })

  it("rejects a call waiting for an `unlock` gating with its end cause", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.lock()
    const ensuring = bank.ensureUnlocked()
    device.disable()
    expect(await TH.expectRefusal(ensuring, 'disabled')).to.equal(device.endCause)
  })

  it("watches nothing, and gets nothing, at a connect after it", async () => {
    const vaultDB = new MemoryVaultDB()
    const { device } = await TH.buildBornBank({ device: TH.makeDevice({}, { vaultDB }) })
    device.disable()
    const watch = vi.spyOn(vaultDB, 'watch')
    const tryGetBank = vi.spyOn(vaultDB, 'tryGetBank')
    device.connect()
    expect([watch.mock.calls.length, tryGetBank.mock.calls.length]).to.deep.equal([0, 0])
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

/** A deviceDB in memory whose devicetok stow throws. */
class DevicetokFailingDB extends MemoryDeviceDB {
  protected override doStowDevicetok(): never { throw new TypeError('no devicetok here') }
}

describe("device.ensureDevicetok()", () => {
  it("answers the host's devicetok, asking the deviceDB nothing, before signin as after", async () => {
    const deviceDB = new MemoryDeviceDB()
    const ensure   = vi.spyOn(deviceDB, 'ensureDevicetok')
    expect(await TH.makeDevice({ userid: null }, { deviceDB }).ensureDevicetok(TH.WorldScope.userid)).to.eq(TH.Devicetok)
    expect(await TH.makeDevice({}, { deviceDB }).ensureDevicetok(TH.WorldScope.userid)).to.eq(TH.Devicetok)
    expect(ensure).not.toHaveBeenCalled()
  })

  it("with no devicetok from the host, answers the one its deviceDB keeps for the user: the same at each call, and to each device given that deviceDB", async () => {
    const deviceDB     = new MemoryDeviceDB()
    const [one, other] = [TH.makeDevice({}, { deviceDB, devicetok: undefined }), TH.makeDevice({}, { deviceDB, devicetok: undefined })]
    const devicetok    = await one.ensureDevicetok(TH.WorldScope.userid)
    expect([await one.ensureDevicetok(TH.WorldScope.userid), await other.ensureDevicetok(TH.WorldScope.userid), await deviceDB.ensureDevicetok(TH.WorldScope.userid)]).to.deep.equal([devicetok, devicetok, devicetok])
  })

  it("with no devicetok from the host, answers another devicetok for another user given the same deviceDB", async () => {
    const device = TH.makeDevice({}, { deviceDB: new MemoryDeviceDB(), devicetok: undefined })
    expect(await device.ensureDevicetok(TH.WorldScope.userid)).to.not.eq(await device.ensureDevicetok('u2'))
  })

  it("with no devicetok from the host, answers the devicetok of the user it is asked for, signed in or not", async () => {
    const deviceDB = new MemoryDeviceDB()
    const device   = TH.makeDevice({ userid: null }, { deviceDB, devicetok: undefined })
    expect(await device.ensureDevicetok(TH.WorldScope.userid)).to.eq(await deviceDB.ensureDevicetok(TH.WorldScope.userid))
  })

  it("with no deviceDB from the host either, answers a devicetok of each device's own", async () => {
    const [one, other] = [TH.makeDevice({}, { devicetok: undefined }), TH.makeDevice({}, { devicetok: undefined })]
    expect(await one.ensureDevicetok(TH.WorldScope.userid)).to.not.eq(await other.ensureDevicetok(TH.WorldScope.userid))
  })

  it("is recorded in each wayin a birth builds", async () => {
    const deviceDB = new MemoryDeviceDB()
    const { bank } = await TH.buildBornBank({ passkeyCleartext: TH.passkeyAnswerOf(), device: TH.makeDevice({}, { deviceDB, devicetok: undefined }) })
    const devicetok = await deviceDB.ensureDevicetok(TH.WorldScope.userid)
    expect([bank.gate.main.devicetok, bank.gate.passkey0?.devicetok]).to.deep.equal([devicetok, devicetok])
  })

  it("tells onBadNews where the deviceDB refuses, and answers a fresh devicetok, so that a birth still builds its wayin", async () => {
    const onBadNews = vi.fn()
    const { bank, device } = await TH.buildBornBank({ device: TH.makeDevice({}, { deviceDB: new DevicetokFailingDB(), devicetok: undefined, onBadNews }) })
    expect(bank.gate.main.devicetok).to.not.eq(TH.Devicetok)
    expect(await device.ensureDevicetok(TH.WorldScope.userid)).to.not.eq(bank.gate.main.devicetok)
    await TH.eventually(() => onBadNews.mock.calls.length === 2)
    expect(onBadNews.mock.calls.map(([heard]) => (heard as BadNews).news.refusalkind)).to.deep.equal(['storage_unavailable', 'storage_unavailable'])
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

  it("does nothing on a device with no bank", () => {
    const device = TH.makeDevice()
    expect(device.lock()).to.equal(device)
  })
})

describe("device.inspectable()", () => {
  it("answers EmptyMaskedView before signin", () => {
    expect(TH.makeDevice({ userid: null }).inspectable()).to.equal(EmptyMaskedView)
    expect(EmptyMaskedView).to.deep.equal({ bankTSQ: [], vaultTSQ: [], lease: { active: false } })
  })

  it("answers the lease of an unlocked bank by its loggable and when it ends, and none granted once it locks", async () => {
    const { device, bank } = await TH.buildBornVault()
    const { lease } = device.inspectable()
    expect(lease).to.have.all.keys(
      'active', 'ends_at', 'fmt', 'userid', 'banklabel', 'labelpath', 'wayinkind', 'born_at', 'proved_at', 'gate_labelpath', 'gate_lifepath', 'gate_born_at', 'gate_revtok', 'banktok', 'isEvicted',
    )
    const { proved_at } = lease as { proved_at: number }
    expect(lease).to.include({ active: true, ends_at: proved_at + device.leaseMillis, born_at: proved_at, labelpath: `lease/${TH.WorldScope.banklabel}`, gate_revtok: maskUuid(bank.gate.revtok), banktok: maskUuid(bank.banktok), wayinkind: 'passphrase', isEvicted: false })
    bank.lock()
    expect(device.inspectable().lease).to.deep.equal({ active: false })
  })

  it("answers the bank's gate and its root box in the bank TSQ, and the boxes put in the vault TSQ, each with its state", async () => {
    const { device, vault } = await TH.buildBornVault()
    await vault.putBoxOnce('box/openai', { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const { bankTSQ, vaultTSQ } = device.inspectable()
    expect(bankTSQ.map(({ val }) => (val as { labelpath: string }).labelpath)).to.have.members([TH.GateScope.labelpath, 'box'])
    expect(vaultTSQ.map(({ val }) => (val as { labelpath?: string } | null)?.labelpath)).to.include('box/openai')
    for (const row of [...bankTSQ, ...vaultTSQ]) {
      expect(row).to.include({ status: 'success', fetchStatus: 'idle', isInvalidated: false, lastRefusalkind: null })
      expect(row.queryKey.slice(2, 4)).to.deep.equal([TH.WorldScope.userid, TH.WorldScope.banklabel])
    }
    expect(bankTSQ.map(({ queryKey }) => queryKey.slice(0, 2))).to.have.deep.members([['sok', 'gate'], ['sok', 'box']])
  })

  it("shows the refusal a root's Thing last threw at a record as its row's lastRefusalkind, and when the record it holds was read as its dataUpdatedAt", async () => {
    const { bank, device } = await TH.buildBornVault()
    const gateRow = () => device.inspectable().bankTSQ.find(({ val }) => (val as { labelpath: string }).labelpath === TH.GateScope.labelpath)
    expect(gateRow()).to.include({ dataUpdatedAt: readAtOf(device.bank.demandVaultMinder().carAt(bank.gate)!.read_tc), lastRefusalkind: null })
    // A read_tc that is no time code: the Things refuse every record the answer carries.
    const get = device.vaultDB.tryGetThing.bind(device.vaultDB)
    vi.spyOn(device.vaultDB, 'tryGetThing').mockImplementation(async (ask) => ({ ...(await get(ask)), read_tc: crypto.randomUUID() }))
    await TH.expectRefusal(device.bank.demandVaultMinder().getOnce(TH.GateScope), 'bad_record')
    expect(gateRow()).to.include({ dataUpdatedAt: readAtOf(device.bank.demandVaultMinder().carAt(bank.gate)!.read_tc), lastRefusalkind: 'bad_record' })
  })

  it("cuts each wrapped bankKey and each sealed whisper's ciphertext to its last 2 characters and its length", async () => {
    const { device, vault, gateRecord } = await TH.buildBornVault()
    const { whisper_sealed } = await vault.putBoxOnce('box/openai', { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const named = [gateRecord.wayins.main.bank_key_wayin_wrapped, whisper_sealed.key_wrapped, whisper_sealed.ciphered].map(({ ciphertext_b64 }) => ciphertext_b64)
    // Every ciphertext the vault TSQ and the roots' Things hold, the root box's among them, not only those named above.
    const roots     = [TH.GateScope, TH.RootScope].map((root) => device.bank.demandVaultMinder().thingAt({ ...TH.WorldScope, ...root })?.pickle())
    const cachedJsons = [...device.vaultTsqClient.getQueryCache().getAll().map(({ state }) => state.data), ...roots].map((val) => JSON.stringify(val ?? null))
    const ciphertexts = new Set(cachedJsons.flatMap((json) => [...json.matchAll(/"ciphertext_b64":"([^"]+)"/g)].map(([, ciphertext]) => ciphertext!)))
    expect([...ciphertexts]).to.include.members(named)
    expect(ciphertexts.size).to.be.at.least(5)
    const shown = JSON.stringify(device.inspectable())
    for (const ciphertext of ciphertexts) {
      expect(shown).to.not.include(ciphertext)
      expect(shown).to.include(`"…${ciphertext.slice(-2)}(${String(ciphertext.length)})"`)
    }
    expect(shown).to.not.include(`"${named[0]!.slice(0, 8)}`)
    expect(shown).to.include(gateRecord.wayins.main.bank_key_wayin_wrapped.cipher_iv_b64)
  })

  it("leaves out what a host keeps beside its rows in the vault TSQ", async () => {
    const { device } = await TH.buildBornVault()
    device.vaultTsqClient.setQueryData(['host', 'notes'], { note: 'mine' })
    expect(JSON.stringify(device.inspectable())).to.not.include('mine')
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

  it("tells the host's onBadNews still, once the device is disconnected", async () => {
    const onBadNews = vi.fn()
    const device = TH.makeDevice({}, { onBadNews })
    device.disconnect()
    device.tellBadNews([new Errors.VaultError('storage_unavailable', "Down.")])
    await TH.eventually(() => onBadNews.mock.calls.length === 1)
    expect(onBadNews).toHaveBeenCalledOnce()
  })
})

describe("a device's onBadNews, told of trouble in storage", () => {
  it("hears each trouble once", async () => {
    const onBadNews = vi.fn()
    const { vault } = await TH.buildBornVault({ device: TH.makeDevice({}, { onBadNews }) })
    const vaultDB   = vault.bank.device.vaultDB as MemoryVaultDB
    vaultDB._cheat_things(TH.WorldScope).box.set('box/bad', { ...TH.boxThingOf('bad'), revseq: -2 })
    await vault.bank.device.vaultTSQ.listOnce('box')
    await TH.eventually(() => onBadNews.mock.calls.length > 0)
    await TH.aWhile()
    expect(onBadNews.mock.calls.map(([heard]) => (heard as BadNews).news.refusalkind)).to.deep.equal(['incompatible_row'])
  })
})

describe("device.announce(announcement)", () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it("tells the host's onLifecycle the announcement and its device, awaiting nothing", () => {
    const onLifecycle = vi.fn(() => new Promise(noop))
    const device = TH.makeDevice({}, { onLifecycle })
    onLifecycle.mockClear()
    device.announce({ kind: 'softlocked' })
    expect(onLifecycle.mock.calls).to.deep.equal([[{ kind: 'softlocked', device }]])
  })

  it("reports a handler's throw, or its promise's rejection, to the platform, and throws nothing", async () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const throwing = TH.makeDevice({}, { onLifecycle: ({ kind }) => { if (kind === 'autolocked') { throw new Error("The handler is broken.") } } })
    const rejecting = TH.makeDevice({}, { onLifecycle: ({ kind }) => (kind === 'autolocked') ? Promise.reject(new Error("Rejected.")) : undefined })
    throwing.announce({ kind: 'autolocked' })
    rejecting.announce({ kind: 'autolocked' })
    await TH.eventually(() => reported.mock.calls.length === 2)
    expect(reported.mock.calls.map(([err]) => (err as Error).message)).to.have.members(["The handler is broken.", "Rejected."])
  })

  it("logs each announcement by default, as news and not as trouble", () => {
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const device = TH.makeDevice({}, { logger })
    vi.clearAllMocks()
    device.announce({ kind: 'lock_taken_up' })
    device.announce({ kind: 'stage_crossed', from: 'locked', to: 'unlocked' })
    device.announce({ kind: 'watch_ended' })
    expect((logger.log.mock.calls as [string, unknown][]).map(([message, story]) => [message, story])).to.deep.equal([
      ["The device's lease changed: lock_taken_up.", { oplabel: 'Device.onLifecycle', kind: 'lock_taken_up' }],
      ["The bank's stage went from 'locked' to 'unlocked'.", { oplabel: 'Device.onLifecycle', kind: 'stage_crossed', from: 'locked', to: 'unlocked' }],
      ["The device's watch of its bank ended; it starts again at the janitor's next tick.", { oplabel: 'Device.onLifecycle', kind: 'watch_ended' }],
    ])
    expect([logger.warn, logger.error].map((logged) => logged.mock.calls.length)).to.deep.equal([0, 0])
  })

  it("logs only the fields it names, whatever else an announcement carries", () => {
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const device = TH.makeDevice({}, { logger })
    vi.clearAllMocks()
    DefaultOnLifecycle({ device, kind: 'softlocked', extra: 'not logged' } as never)
    expect(logger.log.mock.calls[0]?.slice(0, 2)).to.deep.equal(["The device's lease changed: softlocked.", { oplabel: 'Device.onLifecycle', kind: 'softlocked' }])
  })

  it("refuses a crossing to a stage that does not exist", () => {
    const device = TH.makeDevice()
    TH.expectSyncRefusal(() => { device.announce({ kind: 'stage_crossed', from: 'locked', to: 'asleep' } as never) }, 'bad_record')
  })

  it("refuses a crossing that lacks its stages", () => {
    const device = TH.makeDevice()
    TH.expectSyncRefusal(() => { device.announce({ kind: 'stage_crossed' } as never) }, 'bad_record')
  })

  it("refuses a kind it does not announce", () => {
    const onLifecycle = vi.fn()
    const device = TH.makeDevice({}, { onLifecycle })
    onLifecycle.mockClear()
    TH.expectSyncRefusal(() => { device.announce({ kind: 'vacated' } as never) }, 'bad_record')
    expect(onLifecycle).not.toHaveBeenCalled()
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
