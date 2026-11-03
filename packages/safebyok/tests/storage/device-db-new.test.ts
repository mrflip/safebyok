import { describe, expect, it } from 'vitest'
import { makeLeaseKey } from '../../src/crypto'
import * as Refusals from '../../src/refusals'
import { MemoryDeviceDB } from '../../src/storage/memory-device-db'
import { DeviceDB } from '../../src/storage/device-db-new'
import type { DeviceRecord, LeaseRow } from '../../src/storage/device-db-shapes'
import * as TH from '../test-helpers'

const T0 = Date.UTC(2026, 10, 3)
const Hour = 3_600_000
const scope = { applabel: 'acme', user_id: 'u1', vaultlabel: 'main' }
const asked = { ...scope, vault_tok: 'tok_one' }

const leaseRowOf = async (over: Partial<LeaseRow> = {}): Promise<LeaseRow> => ({ ...asked, proved_at: T0, lease_key: await makeLeaseKey(), wrapped: 'opaque', ...over })
const deviceRecordOf = (over: Partial<DeviceRecord> = {}): DeviceRecord => ({ applabel: 'acme', user_id: 'u1', device_id: 'dev_one', ...over })

/** A store whose every generic call throws what it is told. */
class BrokenDeviceDB extends DeviceDB {
  readonly thrown: unknown
  constructor(thrown: unknown) { super(); this.thrown = thrown }
  protected doCache(): never { throw this.thrown }
  protected doPeek(): never { throw this.thrown }
  protected doVacate(): never { throw this.thrown }
  protected doLeasesProvedBefore(): never { throw this.thrown }
  protected doCacheDeviceRecord(): never { throw this.thrown }
}

describe("deviceDB.cache(row), peek(asked)", () => {
  it("peeks the row cached for the vault, its lease_key handle and its opaque fields as cached", async () => {
    const deviceDB = new MemoryDeviceDB()
    const row = await leaseRowOf()
    await deviceDB.cache(row)
    const peeked = await deviceDB.peek(asked)
    expect(peeked).to.deep.include({ ...asked, proved_at: T0, wrapped: 'opaque' })
    const leaseKey = peeked?.['lease_key']
    expect(leaseKey).to.be.instanceOf(CryptoKey)
    expect((leaseKey as CryptoKey).extractable).to.be.false
  })

  it("peeks null for a vault with nothing cached", async () => {
    expect(await new MemoryDeviceDB().peek(asked)).to.be.null
  })

  it("peeks null under another vault_tok: a row of another life is no row", async () => {
    const deviceDB = new MemoryDeviceDB()
    await deviceDB.cache(await leaseRowOf())
    expect(await deviceDB.peek({ ...asked, vault_tok: 'tok_two' })).to.be.null
  })

  it("keeps vaults apart by scope, and a bank apart from another", async () => {
    const deviceDB = new MemoryDeviceDB()
    await deviceDB.cache(await leaseRowOf())
    expect(await deviceDB.peek({ ...asked, vaultlabel: 'other' })).to.be.null
    expect(await deviceDB.peek({ ...asked, user_id: 'u2' })).to.be.null
  })

  it("caches a new vault_tok over the old row of the scope", async () => {
    const deviceDB = new MemoryDeviceDB()
    await deviceDB.cache(await leaseRowOf())
    await deviceDB.cache(await leaseRowOf({ vault_tok: 'tok_two' }))
    expect(await deviceDB.peek(asked)).to.be.null
    expect(await deviceDB.peek({ ...asked, vault_tok: 'tok_two' })).to.not.be.null
  })

  it("hands back a copy: changing a peeked row changes nothing cached", async () => {
    const deviceDB = new MemoryDeviceDB()
    await deviceDB.cache(await leaseRowOf())
    const peeked = (await deviceDB.peek(asked))!
    peeked.proved_at = 0
    const again = await deviceDB.peek(asked)
    expect(again?.proved_at).to.eq(T0)
  })

  it("peeks null for a stored row that fails its check, as for none", async () => {
    const deviceDB = new MemoryDeviceDB()
    deviceDB._cheat_leaseRows().set(JSON.stringify(['acme', 'u1', 'main']), { ...asked, proved_at: 'yesterday' })
    expect(await deviceDB.peek(asked)).to.be.null
  })

  it("refuses a row without proved_at as 'bad_record', and a malformed query as 'bad_scope'", async () => {
    const deviceDB = new MemoryDeviceDB()
    await TH.expectRefusal(deviceDB.cache({ ...asked, lease_key: await makeLeaseKey() } as unknown as LeaseRow), 'bad_record')
    await TH.expectRefusal(deviceDB.peek({ ...asked, vaultlabel: 'No Good!' }), 'bad_scope')
    await TH.expectRefusal(deviceDB.peek({ ...scope } as never), 'bad_scope')
  })

  it("answers each as an Outcome through its try form, refusing the same", async () => {
    const deviceDB = new MemoryDeviceDB()
    const row = await leaseRowOf()
    const cached = await deviceDB.tryCache(row)
    expect(cached.ok).to.be.true
    expect(await TH.expectGood(deviceDB.tryPeek(asked))).to.not.be.null
    await TH.expectBad(deviceDB.tryPeek({ ...asked, applabel: '' }), 'bad_scope')
  })
})

describe("deviceDB.vacate(asked)", () => {
  it("erases the row cached under that vault_tok", async () => {
    const deviceDB = new MemoryDeviceDB()
    await deviceDB.cache(await leaseRowOf())
    await deviceDB.vacate(asked)
    expect(await deviceDB.peek(asked)).to.be.null
    expect(deviceDB._cheat_leaseRows().size).to.eq(0)
  })

  it("leaves a row of another vault_tok where it stands: the old life's vacate spares the new life's lease", async () => {
    const deviceDB = new MemoryDeviceDB()
    await deviceDB.cache(await leaseRowOf({ vault_tok: 'tok_two' }))
    await deviceDB.vacate(asked)
    expect(await deviceDB.peek({ ...asked, vault_tok: 'tok_two' })).to.not.be.null
  })

  it("is a no-op where nothing is cached, and again for a repeat", async () => {
    const deviceDB = new MemoryDeviceDB()
    await deviceDB.vacate(asked)
    const vacated = await deviceDB.tryVacate(asked)
    expect(vacated.ok).to.be.true
  })

  it("lands after a cache called before it and not awaited: the calls land in the order made", async () => {
    const deviceDB = new MemoryDeviceDB()
    const row = await leaseRowOf()
    const caching = deviceDB.cache(row)
    const vacating = deviceDB.vacate(asked)
    await Promise.all([caching, vacating])
    expect(await deviceDB.peek(asked)).to.be.null
  })

  it("peeks what stood before a vacate called after it, however late it is awaited", async () => {
    const deviceDB = new MemoryDeviceDB()
    await deviceDB.cache(await leaseRowOf())
    const peeking = deviceDB.peek(asked)
    const vacating = deviceDB.vacate(asked)
    expect(await peeking).to.not.be.null
    await vacating
  })
})

describe("deviceDB.leasesProvedBefore(cutoff)", () => {
  it("answers the scope, vault_tok and proved_at of each lease proved before the cutoff, oldest first, and never its key", async () => {
    const deviceDB = new MemoryDeviceDB()
    await deviceDB.cache(await leaseRowOf({ vaultlabel: 'late', proved_at: T0 - Hour }))
    await deviceDB.cache(await leaseRowOf({ vaultlabel: 'early', proved_at: T0 - (3 * Hour) }))
    await deviceDB.cache(await leaseRowOf({ vaultlabel: 'fresh', proved_at: T0 }))
    const found = await deviceDB.leasesProvedBefore(T0)
    expect(found.map((row) => row.vaultlabel)).to.deep.equal(['early', 'late'])
    expect(found[0]).to.deep.equal({ ...asked, vaultlabel: 'early', proved_at: T0 - (3 * Hour) })
  })

  it("finds the leases of every bank on the device", async () => {
    const deviceDB = new MemoryDeviceDB()
    await deviceDB.cache(await leaseRowOf({ proved_at: T0 - Hour }))
    await deviceDB.cache(await leaseRowOf({ user_id: 'u2', proved_at: T0 - Hour }))
    expect(await deviceDB.leasesProvedBefore(T0)).to.have.lengthOf(2)
  })

  it("leaves out a lease proved at the cutoff, a vacated one and a damaged row", async () => {
    const deviceDB = new MemoryDeviceDB()
    await deviceDB.cache(await leaseRowOf({ proved_at: T0 }))
    await deviceDB.cache(await leaseRowOf({ vaultlabel: 'gone', proved_at: T0 - Hour }))
    await deviceDB.vacate({ ...asked, vaultlabel: 'gone' })
    deviceDB._cheat_leaseRows().set('damaged', { proved_at: 5 })
    expect(await deviceDB.leasesProvedBefore(T0)).to.deep.equal([])
  })

  it("answers an empty list for an empty store, and refuses a cutoff that is no instant as 'bad_option'", async () => {
    const deviceDB = new MemoryDeviceDB()
    expect(await TH.expectGood(deviceDB.tryLeasesProvedBefore(T0))).to.deep.equal([])
    await TH.expectBad(deviceDB.tryLeasesProvedBefore(NaN), 'bad_option')
    await TH.expectRefusal(deviceDB.leasesProvedBefore('now' as never), 'bad_option')
  })
})

describe("deviceDB.cacheDeviceRecord(record)", () => {
  it("caches the first record of a bank scope: born", async () => {
    const deviceDB = new MemoryDeviceDB()
    expect(await deviceDB.cacheDeviceRecord(deviceRecordOf())).to.deep.equal({ act: 'born', record: deviceRecordOf() })
  })

  it("keeps the first device_id: a later record is held off, and the first answered", async () => {
    const deviceDB = new MemoryDeviceDB()
    await deviceDB.cacheDeviceRecord(deviceRecordOf())
    expect(await deviceDB.cacheDeviceRecord(deviceRecordOf({ device_id: 'dev_two' }))).to.deep.equal({ act: 'held', record: deviceRecordOf() })
    expect(deviceDB._cheat_deviceRows().get(JSON.stringify(['acme', 'u1']))).to.deep.equal(deviceRecordOf())
  })

  it("holds one record for each bank scope", async () => {
    const deviceDB = new MemoryDeviceDB()
    await deviceDB.cacheDeviceRecord(deviceRecordOf())
    const other = await deviceDB.cacheDeviceRecord(deviceRecordOf({ user_id: 'u2', device_id: 'dev_two' }))
    expect(other.act).to.eq('born')
  })

  it("writes a damaged record over, and says so: rewrote", async () => {
    const deviceDB = new MemoryDeviceDB()
    deviceDB._cheat_deviceRows().set(JSON.stringify(['acme', 'u1']), { applabel: 'acme', user_id: 'u1', device_id: 7 })
    expect(await deviceDB.cacheDeviceRecord(deviceRecordOf({ device_id: 'dev_two' }))).to.deep.equal({ act: 'rewrote', record: deviceRecordOf({ device_id: 'dev_two' }) })
    const again = await deviceDB.cacheDeviceRecord(deviceRecordOf())
    expect(again.act).to.eq('held')
  })

  it("lets the first of two calls made together win", async () => {
    const deviceDB = new MemoryDeviceDB()
    const [first, second] = await Promise.all([deviceDB.cacheDeviceRecord(deviceRecordOf()), deviceDB.cacheDeviceRecord(deviceRecordOf({ device_id: 'dev_two' }))])
    expect([first.act, second.act]).to.deep.equal(['born', 'held'])
    expect(second.record.device_id).to.eq('dev_one')
  })

  it("refuses a record without a device_id or with a stray field as 'bad_record'", async () => {
    const deviceDB = new MemoryDeviceDB()
    await TH.expectBad(deviceDB.tryCacheDeviceRecord({ applabel: 'acme', user_id: 'u1' } as DeviceRecord), 'bad_record')
    await TH.expectBad(deviceDB.tryCacheDeviceRecord({ ...deviceRecordOf(), extra: 1 } as DeviceRecord), 'bad_record')
  })
})

describe("a deviceDB whose store throws", () => {
  it("refuses every verb 'storage_unavailable', naming the verb and the thrown name, never quoting the thrown message", async () => {
    const thrown = new DOMException('lease_key secret-looking text', 'QuotaExceededError')
    const deviceDB = new BrokenDeviceDB(thrown)
    const row = await leaseRowOf()
    const refusals = [
      await TH.expectBad(deviceDB.tryCache(row), 'storage_unavailable'),
      await TH.expectBad(deviceDB.tryPeek(asked), 'storage_unavailable'),
      await TH.expectBad(deviceDB.tryVacate(asked), 'storage_unavailable'),
      await TH.expectBad(deviceDB.tryLeasesProvedBefore(T0), 'storage_unavailable'),
      await TH.expectBad(deviceDB.tryCacheDeviceRecord(deviceRecordOf()), 'storage_unavailable'),
    ]
    for (const err of refusals) {
      expect(err.message).to.include('QuotaExceededError')
      expect(err.message).to.not.include('secret-looking')
      expect(err.cause).to.be.undefined
    }
  })

  it("passes a VaultError the store throws as it came", async () => {
    const refusal = Refusals.storageBlocked()
    const err = await TH.expectBad(new BrokenDeviceDB(refusal).tryPeek(asked), 'storage_blocked')
    expect(err).to.eq(refusal)
  })
})
