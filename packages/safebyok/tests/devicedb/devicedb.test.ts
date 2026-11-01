import { describe, expect, it, vi } from 'vitest'
import { type DeviceRow, type FoundRow, DeviceDB, advancedDeviceRecord, deviceRecordOf, highestGateEpochOf } from '../../src/devicedb/devicedb'
import { memoryDeviceDB } from '../../src/devicedb/memory'
import { VaultError } from '../../src/errors'
import type { DeviceRecord, LeaseRecord } from '../../src/models/models-shapes'
import * as Scopepath from '../../src/scopepath'
import * as TH from '../test-helpers'
import { bankScopeOf, cacheableOf, describeModelsDeviceDB, modelsLeaseOf } from '../test-helpers/models-device-db'

describeModelsDeviceDB('memoryDeviceDB', () => memoryDeviceDB())

const u1 = TH.scopeOf('u1')
const bank1 = bankScopeOf('u1')

/** A DeviceDB over a Map the test reaches, `rows`, each hook a spy; `trouble`, when set, is what every hook throws. */
class OpenDeviceDB extends DeviceDB {
  readonly rows = new Map<string, unknown>()
  trouble: Error | undefined = undefined
  /** What `doFind` answers in place of the rows, when set: a find that read the rows before a write landed. */
  staleFind: readonly FoundRow[] | undefined = undefined

  protected doGet = vi.fn((scopepath: string) => this.#answer(() => this.rows.get(scopepath)))
  protected doPut = vi.fn((scopepath: string, row: DeviceRow) => this.#answer(() => { this.rows.set(scopepath, row) }))
  protected doUpdate = vi.fn((scopepath: string, updatedFrom: (stored: unknown) => DeviceRow) => this.#answer(() => { this.rows.set(scopepath, updatedFrom(this.rows.get(scopepath))) }))
  protected doDel = vi.fn((scopepath: string) => this.#answer(() => { this.rows.delete(scopepath) }))
  protected doFind = vi.fn((prefix: string) => this.#answer(() => this.staleFind ?? [...this.rows].filter(([scopepath]) => scopepath.startsWith(prefix)).map(([scopepath, row]) => ({ scopepath, row }))))
  protected doDelDamaged = vi.fn((scopepath: string, isSound: (row: unknown) => boolean) => this.#answer(() => { if (! isSound(this.rows.get(scopepath))) { this.rows.delete(scopepath) } }))
  protected doDelAll = vi.fn(() => this.#answer(() => { this.rows.clear() }))

  /** Every hook, by name, for a test that checks when each is called. */
  get hooks() {
    return { doGet: this.doGet, doPut: this.doPut, doUpdate: this.doUpdate, doDel: this.doDel, doFind: this.doFind, doDelDamaged: this.doDelDamaged, doDelAll: this.doDelAll }
  }

  #answer<AnswerT>(work: () => AnswerT): Promise<AnswerT> {
    if (this.trouble !== undefined) { return Promise.reject(this.trouble) }
    return Promise.resolve(work())
  }
}

describe("DeviceDB's leases, as stored", () => {
  it("hands back a lease row that fails its check as it lies, and erases nothing: the lease judges it", async () => {
    const deviceDB = new OpenDeviceDB()
    deviceDB.rows.set(Scopepath.lease(u1), { fmt: 'not a lease' })
    expect(await deviceDB.getLease(u1)).to.deep.equal({ fmt: 'not a lease' })
    expect(deviceDB.rows.has(Scopepath.lease(u1))).to.be.true
  })

  it("files a lease under its vault's lease scopepath, and nothing else", async () => {
    const deviceDB = new OpenDeviceDB()
    const lease = await modelsLeaseOf('u1')
    await deviceDB.putLease(lease)
    expect([...deviceDB.rows.keys()]).to.deep.equal(['lease^acme^u1^main'])
  })

  it("refuses 'bad_scope' a scope whose names fail their checks, before the store sees it", async () => {
    const deviceDB = new OpenDeviceDB()
    await TH.expectBad(deviceDB.tryGetLease({ ...u1, user_id: 'u1^x' }), 'bad_scope')
    await TH.expectBad(deviceDB.tryDelLease({ ...u1, vaultlabel: 'Main' }), 'bad_scope')
    await TH.expectBad(deviceDB.tryGetDeviceRecord({ applabel: 'acme', user_id: '' }), 'bad_scope')
    await TH.expectBad(deviceDB.tryFindCachedVaults({ applabel: 'acme', user_id: 'u1^x' }), 'bad_scope')
    await TH.expectBad(deviceDB.tryClearCachedVault({ ...u1, vaultlabel: 'Main' }), 'bad_scope')
    TH.expectSyncRefusal(() => deviceDB.vaultCache({ applabel: 'acme', user_id: 'u1^x' }), 'bad_scope')
    for (const hook of Object.values(deviceDB.hooks)) { expect(hook).not.toHaveBeenCalled() }
  })
})

describe("DeviceDB's device record, as stored", () => {
  it("files the record under its bank's scopepath", async () => {
    const deviceDB = new OpenDeviceDB()
    await deviceDB.advanceDeviceRecord(deviceRecordOf(bank1, 'device-a'))
    expect([...deviceDB.rows.keys()]).to.deep.equal(['bank^acme^u1'])
  })

  it("reads a stored row that fails its check, or names another scope, as none, and writes over it at the next advance", async () => {
    const deviceDB = new OpenDeviceDB()
    const record = deviceRecordOf(bank1, 'device-a')
    for (const damaged of [{ fmt: 'junk' }, { ...record, device_id: '' }, deviceRecordOf(bankScopeOf('u2'), 'device-z')]) {
      deviceDB.rows.set(Scopepath.bank(bank1), damaged)
      expect(await deviceDB.getDeviceRecord(bank1)).to.be.null
      expect(await deviceDB.advanceDeviceRecord(record)).to.deep.equal(record)
      expect(deviceDB.rows.get(Scopepath.bank(bank1))).to.deep.equal(record)
    }
  })

  it("refuses 'bad_record' a record that fails its check, before the store sees it", async () => {
    const deviceDB = new OpenDeviceDB()
    const record = deviceRecordOf(bank1, 'device-a')
    await TH.expectBad(deviceDB.tryAdvanceDeviceRecord({ ...record, device_id: '' }), 'bad_record')
    await TH.expectBad(deviceDB.tryAdvanceDeviceRecord({ ...record, stray: 1 } as DeviceRecord), 'bad_record')
    await TH.expectBad(deviceDB.tryAdvanceDeviceRecord({ ...record, highest_gate_epochs: [{ vaultlabel: 'main', gate_epoch: 1 }, { vaultlabel: 'main', gate_epoch: 2 }] }), 'bad_record')
    expect(deviceDB.hooks.doUpdate).not.toHaveBeenCalled()
  })
})

describe("DeviceDB's cached vaults, as stored", () => {
  it("erases a row filed under another scope than its own, or no copy at all, and leaves it out of what it finds", async () => {
    const deviceDB = new OpenDeviceDB()
    const sound = cacheableOf(u1)
    deviceDB.rows.set(Scopepath.vault(u1), sound)
    deviceDB.rows.set(Scopepath.vault(TH.scopeOf('u1', 'spare')), cacheableOf(TH.scopeOf('u1', 'other')))
    deviceDB.rows.set(Scopepath.vault(TH.scopeOf('u1', 'third')), 'not a copy')
    expect(await deviceDB.findCachedVaults(bank1)).to.deep.equal([sound])
    expect([...deviceDB.rows.keys()]).to.deep.equal([Scopepath.vault(u1)])
  })

  it("never erases a sound copy stored since the find that read a damaged one", async () => {
    const deviceDB = new OpenDeviceDB()
    const sound = cacheableOf(u1)
    deviceDB.rows.set(Scopepath.vault(u1), sound)
    deviceDB.staleFind = [{ scopepath: Scopepath.vault(u1), row: 'damaged when found' }]
    expect(await deviceDB.findCachedVaults(bank1)).to.deep.equal([])
    expect(deviceDB.rows.get(Scopepath.vault(u1))).to.equal(sound)
  })

  it("files a copy under its vault's scopepath", async () => {
    const deviceDB = new OpenDeviceDB()
    await deviceDB.putCachedVault(cacheableOf(u1))
    expect([...deviceDB.rows.keys()]).to.deep.equal(['vault^acme^u1^main'])
  })
})

/** Each verb of `deviceDB` that reaches the store, by name, as its try form. */
const verbsOf = async (deviceDB: DeviceDB) => {
  const lease = await modelsLeaseOf('u1')
  return {
    getLease:            () => deviceDB.tryGetLease(u1),
    putLease:            () => deviceDB.tryPutLease(lease),
    delLease:            () => deviceDB.tryDelLease(u1),
    getDeviceRecord:     () => deviceDB.tryGetDeviceRecord(bank1),
    advanceDeviceRecord: () => deviceDB.tryAdvanceDeviceRecord(deviceRecordOf(bank1, 'device-a')),
    findCachedVaults:    () => deviceDB.tryFindCachedVaults(bank1),
    putCachedVault:      () => deviceDB.tryPutCachedVault(cacheableOf(u1)),
    clearCachedVault:    () => deviceDB.tryClearCachedVault(u1),
    delAll:              () => deviceDB.tryDelAll(),
  }
}

describe("DeviceDB, given trouble in the store", () => {
  it("answers 'storage_blocked' for every verb over a store the browser withholds, naming what failed and the error's name, and quoting nothing more", async () => {
    const deviceDB = new OpenDeviceDB()
    deviceDB.trouble = new DOMException("sk-SECRET quoted by the store", 'QuotaExceededError')
    const verbs = Object.entries(await verbsOf(deviceDB))
    for (const [verb, attempt] of verbs) {
      const refusal = await TH.expectBad(attempt(), 'storage_blocked')
      expect(refusal.message, verb).to.include("The device store threw QuotaExceededError.")
      expect(TH.thrownText(refusal), verb).to.not.include('sk-SECRET')
      expect(refusal.cause, verb).to.be.undefined
    }
  })

  it("answers 'storage_unavailable' for any other failure, naming no scope", async () => {
    const deviceDB = new OpenDeviceDB()
    deviceDB.trouble = new Error("sk-SECRET lease^acme^u1^main")
    const verbs = Object.entries(await verbsOf(deviceDB))
    for (const [verb, attempt] of verbs) {
      const refusal = await TH.expectBad(attempt(), 'storage_unavailable')
      expect(refusal.message, verb).to.include("The device store threw Error.")
      expect(TH.thrownText(refusal), verb).to.not.include('sk-SECRET')
      expect(TH.thrownText(refusal), verb).to.not.include('u1')
    }
  })

  it("passes a VaultError the store throws as it came, and the throwing form rejects with it", async () => {
    const deviceDB = new OpenDeviceDB()
    const thrown = new VaultError('stale_write', "the store says so")
    deviceDB.trouble = thrown
    expect(await deviceDB.tryGetLease(u1)).to.deep.equal({ ok: false, err: thrown })
    expect(await TH.expectRefusal(deviceDB.getLease(u1), 'stale_write')).to.equal(thrown)
  })
})

describe("DeviceDB, the order of calls", () => {
  it("calls each verb's hook before it awaits anything, so calls reach the store in the order they were made", async () => {
    const deviceDB = new OpenDeviceDB()
    const lease = await modelsLeaseOf('u1')
    const calls: [() => Promise<unknown>, keyof OpenDeviceDB['hooks']][] = [
      [() => deviceDB.getLease(u1), 'doGet'],
      [() => deviceDB.putLease(lease), 'doPut'],
      [() => deviceDB.delLease(u1), 'doDel'],
      [() => deviceDB.getDeviceRecord(bank1), 'doGet'],
      [() => deviceDB.advanceDeviceRecord(deviceRecordOf(bank1, 'device-a')), 'doUpdate'],
      [() => deviceDB.findCachedVaults(bank1), 'doFind'],
      [() => deviceDB.putCachedVault(cacheableOf(u1)), 'doPut'],
      [() => deviceDB.clearCachedVault(u1), 'doDel'],
      [() => deviceDB.delAll(), 'doDelAll'],
    ]
    for (const [call, hookname] of calls) {
      const hook = deviceDB.hooks[hookname]
      hook.mockClear()
      const calling = call()
      expect(hook, hookname).toHaveBeenCalled()
      await calling
    }
  })
})

describe("deviceRecordOf(scope, device_id, highest_gate_epochs)", () => {
  it("makes a frozen record of the scope's names alone, seeing no epoch by default", () => {
    const record = deviceRecordOf({ ...u1, stray: 'x' } as never, 'device-a')
    expect(record).to.deep.equal({ fmt: 8001, applabel: 'acme', user_id: 'u1', device_id: 'device-a', highest_gate_epochs: [] })
    expect(Object.isFrozen(record)).to.be.true
  })

  it("refuses 'bad_scope' a scope that fails its check, and 'bad_record' an empty device_id, a vault named twice or an epoch that is no count", () => {
    TH.expectSyncRefusal(() => deviceRecordOf({ applabel: 'acme', user_id: 'u1^x' }, 'device-a'), 'bad_scope')
    TH.expectSyncRefusal(() => deviceRecordOf(bank1, ''), 'bad_record')
    TH.expectSyncRefusal(() => deviceRecordOf(bank1, 'device-a', [{ vaultlabel: 'main', gate_epoch: 1 }, { vaultlabel: 'main', gate_epoch: 1 }]), 'bad_record')
    TH.expectSyncRefusal(() => deviceRecordOf(bank1, 'device-a', [{ vaultlabel: 'main', gate_epoch: -1 }]), 'bad_record')
  })
})

describe("advancedDeviceRecord(stored, record)", () => {
  const record = deviceRecordOf(bank1, 'device-b', [{ vaultlabel: 'main', gate_epoch: 2 }])

  it("is `record` as it came over nothing stored, a row that fails its check, or another scope's record", () => {
    for (const stored of [undefined, null, 'junk', deviceRecordOf(bankScopeOf('u2'), 'device-a', [{ vaultlabel: 'main', gate_epoch: 9 }])]) {
      expect(advancedDeviceRecord(stored, record)).to.equal(record)
    }
  })

  it("keeps the stored device_id, and for each vault the higher of the two epochs", () => {
    const stored = deviceRecordOf(bank1, 'device-a', [{ vaultlabel: 'main', gate_epoch: 5 }, { vaultlabel: 'spare', gate_epoch: 1 }])
    const advanced = advancedDeviceRecord(stored, deviceRecordOf(bank1, 'device-b', [{ vaultlabel: 'main', gate_epoch: 2 }, { vaultlabel: 'spare', gate_epoch: 4 }]))
    expect(advanced.device_id).to.eq('device-a')
    expect(advanced.highest_gate_epochs).to.have.deep.members([{ vaultlabel: 'main', gate_epoch: 5 }, { vaultlabel: 'spare', gate_epoch: 4 }])
    expect(Object.isFrozen(advanced)).to.be.true
  })
})

describe("highestGateEpochOf(record, vaultlabel)", () => {
  it("is the epoch the record has seen of the vault, or 0 where it has seen none", () => {
    const record = deviceRecordOf(bank1, 'device-a', [{ vaultlabel: 'main', gate_epoch: 3 }])
    expect(highestGateEpochOf(record, 'main')).to.eq(3)
    expect(highestGateEpochOf(record, 'spare')).to.eq(0)
  })
})

describe("DeviceDB's try forms", () => {
  it("resolve the throwing form's answer as a good Outcome", async () => {
    const deviceDB = memoryDeviceDB()
    const lease = await modelsLeaseOf('u1')
    const record = deviceRecordOf(bank1, 'device-a')
    expect(await deviceDB.tryPutLease(lease)).to.deep.equal({ ok: true, val: lease })
    expect(await deviceDB.tryGetLease(u1)).to.deep.equal({ ok: true, val: lease })
    expect(await deviceDB.tryAdvanceDeviceRecord(record)).to.deep.equal({ ok: true, val: record })
    expect(await deviceDB.tryGetDeviceRecord(bank1)).to.deep.equal({ ok: true, val: record })
    expect(await deviceDB.tryPutCachedVault(cacheableOf(u1))).to.deep.equal({ ok: true, val: undefined })
    expect(await deviceDB.tryFindCachedVaults(bank1)).to.deep.equal({ ok: true, val: [cacheableOf(u1)] })
    expect(await deviceDB.tryClearCachedVault(u1)).to.deep.equal({ ok: true, val: undefined })
    expect(await deviceDB.tryDelLease(u1)).to.deep.equal({ ok: true, val: undefined })
    expect(await deviceDB.tryDelAll()).to.deep.equal({ ok: true, val: undefined })
    expect(await deviceDB.tryGetLease(u1)).to.deep.equal({ ok: true, val: null })
  })

  it("resolve a refusal as a bad Outcome, never a rejection", async () => {
    const deviceDB = memoryDeviceDB()
    const lease = await modelsLeaseOf('u1')
    await TH.expectBad(deviceDB.tryPutLease({ ...lease, fmt: 1 } as unknown as LeaseRecord), 'bad_record')
  })
})
