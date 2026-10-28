import { describe, expect, it, vi } from 'vitest'
import { DeviceDB, deviceRecordFor, deviceRecordOf, memoryDeviceDB, raisedDeviceRecord } from '../src/device-db'
import { VaultError } from '../src/errors'
import type { Outcome } from '../src/outcome'
import * as Scopepath from '../src/scopepath'
import type { DeviceRecord, LeaseRecord } from '../src/shapes/device'
import type { VaultScope } from '../src/shapes/scopes'
import * as TH from './test-helpers'

TH.describeDeviceDB('memoryDeviceDB', () => memoryDeviceDB())

describe("memoryDeviceDB", () => {
  it("treats a mangled record as no lease, and discards it", async () => {
    const deviceDB = TH.expectingGood(memoryDeviceDB())
    const mangled = { ...(await TH.leaseOf('u1')), lease_key: 'not a key handle' }
    await deviceDB.putLease(mangled as unknown as LeaseRecord)
    expect(await deviceDB.getLease(TH.scopeOf('u1'))).to.be.null
    expect(await deviceDB.getLease(TH.scopeOf('u1'))).to.be.null  // stays gone
  })

  it("treats a mangled device record as none, and clears it", async () => {
    const deviceDB = TH.expectingGood(memoryDeviceDB())
    await deviceDB.raiseDeviceRecord(TH.deviceRecordOf('u1', { device_id: '' }))
    expect(await deviceDB.getDeviceRecord(TH.scopeOf('u1'))).to.be.null
    expect(await deviceDB.getDeviceRecord(TH.scopeOf('u1'))).to.be.null  // stays gone
  })

  it("answers a null lease as a good Outcome, as its first example shows", async () => {
    expect(await memoryDeviceDB().getLease({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })).to.deep.equal({ ok: true, val: null })
  })

  it("answers a null device record as a good Outcome, as its second example shows", async () => {
    expect(await memoryDeviceDB().getDeviceRecord({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })).to.deep.equal({ ok: true, val: null })
  })

  it("refuses a scope whose name holds the ckey delimiter as a bad Outcome of 'bad_scope', never a rejection", async () => {
    await TH.expectBad(memoryDeviceDB().getLease({ ...TH.scopeOf('u1'), user_id: 'u^1' }), 'bad_scope')
  })
})

describe("raisedDeviceRecord", () => {
  const record: DeviceRecord = TH.deviceRecordOf('u1')

  it("stores the record as it came where none is stored, as its first example shows", () => {
    expect(raisedDeviceRecord(undefined, record)).to.eq(record)
  })

  it("keeps the higher highest_vault_epoch where a record is stored, as its second example shows", () => {
    expect(raisedDeviceRecord({ ...record, highest_vault_epoch: 5 }, { ...record, highest_vault_epoch: 3 }).highest_vault_epoch).to.eq(5)
  })

  it("raises a stored record to a higher epoch, keeping its own device_id", () => {
    const stored = TH.deviceRecordOf('u1', { device_id: 'device-one', highest_vault_epoch: 2 })
    expect(raisedDeviceRecord(stored, TH.deviceRecordOf('u1', { device_id: 'device-two', highest_vault_epoch: 4 })))
      .to.deep.equal(TH.deviceRecordOf('u1', { device_id: 'device-one', highest_vault_epoch: 4 }))
  })

  it("throws 'bad_record' rather than raise a stored record to an epoch that fails its check, as its doc block says: no record the core hands it carries one", () => {
    const stored = TH.deviceRecordOf('u1', { highest_vault_epoch: 2 })
    TH.expectSyncRefusal(() => raisedDeviceRecord(stored, { ...record, highest_vault_epoch: 4.5 }), 'bad_record')
  })

  const GivesWayCases = [
    // what may be stored under the ckey that is no device record of this scope:
    [null,                                                       'a null left by a store'],
    [{ format: 'safebyok-device-v0', highest_vault_epoch: 9 },  'a row that fails its check'],
    [TH.deviceRecordOf('u2', { highest_vault_epoch: 9 }),        "another scope's record, filed where it should not be"],
  ] as const

  for (const [stored, blurb] of GivesWayCases) {
    it(`gives way to the record handed to it over ${blurb}`, () => {
      expect(raisedDeviceRecord(stored, record)).to.eq(record)
    })
  }
})

describe("deviceRecordOf", () => {
  it("builds the record from the scope's parsed names alone, frozen: a Vault object passes as its scope, as its example shows", () => {
    // A Vault object's methods are its prototype's: its own fields are its stamp.
    const holder = Object.defineProperty({ ...TH.scopeOf('u1'), vault_tok: 'vault-tok-u1' }, 'lock', { value: () => undefined })
    const record = deviceRecordOf(holder, 'device-one', 3)
    expect(record).to.deep.equal(TH.deviceRecordOf('u1', { highest_vault_epoch: 3 }))
    expect(Object.isFrozen(record)).to.be.true
  })

  it("refuses a scope that fails its check as bad_scope, and a device_id or epoch that fails as bad_record", () => {
    TH.expectSyncRefusal(() => deviceRecordOf({ ...TH.scopeOf('u1'), vaultlabel: 'Main' }, 'device-one', 3), 'bad_scope')
    TH.expectSyncRefusal(() => deviceRecordOf(TH.scopeOf('u1'), '', 3), 'bad_record')
    TH.expectSyncRefusal(() => deviceRecordOf(TH.scopeOf('u1'), 'device-one', -1), 'bad_record')
  })
})

describe("deviceRecordFor", () => {
  const scope = TH.scopeOf('u1')
  const record: DeviceRecord = TH.deviceRecordOf('u1')

  it("hands back a record of the scope as it came, and none as none, as its first example shows", () => {
    expect(deviceRecordFor(scope, record)).to.deep.equal(record)
    expect(deviceRecordFor(scope, null)).to.be.null
  })

  it("reads a record naming another user as none, as its second example shows", () => {
    expect(deviceRecordFor(scope, { ...record, user_id: 'someone-else' })).to.be.null
  })

  const NoneCases = [
    [{ ...record, device_id: undefined },          'one with no device_id'],
    [{ ...record, device_id: '' },                 'one with an empty device_id'],
    [{ ...record, highest_vault_epoch: -1 },       'one with a negative epoch'],
    [{ ...record, user_id: 'u 1' },                "one whose user_id fails its check, never refused as the check's bad_scope"],
    [{ ...record, format: 'safebyok-device-v0' },  'one of another format'],
    [{ ...record, vaultlabel: 'work' },            "another vault's"],
    ['a string, not a record',                     'what is no record at all'],
  ] as const

  for (const [answer, blurb] of NoneCases) {
    it(`reads ${blurb} as none`, () => {
      expect(deviceRecordFor(scope, answer)).to.be.null
    })
  }
})

/** A DeviceDB whose every `do*` method answers as `answer` says, synchronously, its name logged in `calls` as it is made: for the base class's own tests.
 * A throw from `answer` is a store that throws before its promise.
 */
class ScriptedDeviceDB extends DeviceDB {
  readonly calls: string[] = []
  readonly #answer: (hookname: string, args: unknown[]) => unknown

  constructor(answer: (hookname: string, args: unknown[]) => unknown = () => undefined) {
    super()
    this.#answer = answer
  }

  protected doGetLease(...args: unknown[]) { return this.#heard('doGetLease', args) }
  protected doPutLease(...args: unknown[]) { return this.#heard('doPutLease', args) as Promise<void> }
  protected doDelLease(...args: unknown[]) { return this.#heard('doDelLease', args) as Promise<void> }
  protected doGetDeviceRecord(...args: unknown[]) { return this.#heard('doGetDeviceRecord', args) }
  protected doRaiseDeviceRecord(...args: unknown[]) { return this.#heard('doRaiseDeviceRecord', args) as Promise<void> }
  protected doDelDeviceRecord(...args: unknown[]) { return this.#heard('doDelDeviceRecord', args) as Promise<void> }
  protected doDelAll(...args: unknown[]) { return this.#heard('doDelAll', args) as Promise<void> }
  protected doDelUnreadable(...args: unknown[]) { return this.#heard('doDelUnreadable', args) as Promise<void> }

  #heard(hookname: string, args: unknown[]): Promise<unknown> {
    this.calls.push(hookname)
    return Promise.resolve(this.#answer(hookname, args))
  }
}

describe("DeviceDB, the base class", () => {
  it("calls each verb's do* method before it awaits anything, so the store hears one scope's calls in the order they were made", async () => {
    const deviceDB = new ScriptedDeviceDB()
    const lease = await TH.leaseOf('u1')
    const answers = [
      deviceDB.getLease(TH.scopeOf('u1')), deviceDB.putLease(lease), deviceDB.delLease(TH.scopeOf('u1')),
      deviceDB.getDeviceRecord(TH.scopeOf('u1')), deviceDB.raiseDeviceRecord(TH.deviceRecordOf('u1')), deviceDB.delDeviceRecord(TH.scopeOf('u1')), deviceDB.delAll(),
    ]
    expect(deviceDB.calls).to.deep.equal(['doGetLease', 'doPutLease', 'doDelLease', 'doGetDeviceRecord', 'doRaiseDeviceRecord', 'doDelDeviceRecord', 'doDelAll'])
    await Promise.all(answers)
  })

  it("hands each do* method the row's scopepath, never the scope", async () => {
    const heard: unknown[][] = []
    const deviceDB = new ScriptedDeviceDB((_hookname, args) => { heard.push(args) })
    await deviceDB.getLease(TH.scopeOf('u1'))
    await deviceDB.delDeviceRecord(TH.scopeOf('u1'))
    expect(heard).to.deep.equal([[Scopepath.lease(TH.scopeOf('u1'))], [Scopepath.device(TH.scopeOf('u1'))]])
  })

  it("refuses a scope whose names fail their checks as 'bad_scope', before the store hears of it", async () => {
    const deviceDB = new ScriptedDeviceDB()
    await TH.expectBad(deviceDB.getLease({ ...TH.scopeOf('u1'), user_id: 'u^1' }), 'bad_scope')
    await TH.expectBad(deviceDB.raiseDeviceRecord({ ...TH.deviceRecordOf('u1'), vaultlabel: 'Main' }), 'bad_scope')
    expect(deviceDB.calls).to.deep.equal([])
  })

  const UnreadableCases = [
    ['getLease',        { format: 'safebyok-lease-v1', mangled: true }],
    ['getDeviceRecord', { ...TH.deviceRecordOf('u1'), highest_vault_epoch: 'one' }],
  ] as const

  for (const [verb, row] of UnreadableCases) {
    it(`reads a row that fails its check through ${verb} as none, and has the store discard it only while it still fails`, async () => {
      let isReadable: ((candidate: unknown) => boolean) | undefined
      const deviceDB = new ScriptedDeviceDB((hookname, args) => {
        if (hookname === 'doDelUnreadable') { isReadable = args[1] as (candidate: unknown) => boolean }
        return hookname === 'doDelUnreadable' ? undefined : row
      })
      const found: Promise<Outcome<unknown>> = verb === 'getLease' ? deviceDB.getLease(TH.scopeOf('u1')) : deviceDB.getDeviceRecord(TH.scopeOf('u1'))
      expect(await TH.expectGood(found)).to.be.null
      expect(deviceDB.calls.at(-1)).to.eq('doDelUnreadable')
      expect(isReadable?.(row)).to.be.false
      expect(isReadable?.(undefined)).to.be.false
      expect(isReadable?.(verb === 'getLease' ? await TH.leaseOf('u1') : TH.deviceRecordOf('u1'))).to.be.true
    })
  }

  it("discards nothing for no row, or a sound one", async () => {
    const lease = await TH.leaseOf('u1')
    const answers: Record<string, unknown> = { doGetLease: lease, doGetDeviceRecord: null }
    const deviceDB = new ScriptedDeviceDB((hookname) => answers[hookname])
    const scope = TH.scopeOf('u1')
    expect(await TH.expectGood(deviceDB.getLease(scope))).to.deep.equal(lease)
    expect(await TH.expectGood(deviceDB.getDeviceRecord(scope))).to.be.null
    expect(deviceDB.calls).to.deep.equal(['doGetLease', 'doGetDeviceRecord'])
  })

  it("hands doRaiseDeviceRecord the raise as an updater, resolving what it returned", async () => {
    let raisedFrom: ((stored: unknown) => DeviceRecord) | undefined
    const stored = TH.deviceRecordOf('u1', { device_id: 'device-one', highest_vault_epoch: 5 })
    const deviceDB = new ScriptedDeviceDB((_hookname, args) => {
      raisedFrom = args[1] as (stored: unknown) => DeviceRecord
      raisedFrom(stored)
    })
    const raised = await TH.expectGood(deviceDB.raiseDeviceRecord(TH.deviceRecordOf('u1', { device_id: 'device-two', highest_vault_epoch: 3 })))
    expect(raised).to.deep.equal(stored)
    expect(raisedFrom?.(undefined)).to.deep.equal(TH.deviceRecordOf('u1', { device_id: 'device-two', highest_vault_epoch: 3 }))
  })

  it("says a SecurityError as 'storage_blocked', keeping only the store's error's name, never rejecting", async () => {
    const blocked = new DOMException('The operation is insecure.', 'SecurityError')
    const deviceDB = new ScriptedDeviceDB(() => Promise.reject(blocked))
    const err = await TH.expectBad(deviceDB.delDeviceRecord(TH.scopeOf('u1')), 'storage_blocked')
    expect(err.cause).to.be.undefined
    expect(err.message).to.match(/erasing its record of this vault/)
    expect(err.message).to.match(/will not help until that changes/)
    expect(err.message).to.match(/The device store threw SecurityError\.$/)
    expect(err.message).to.not.include('insecure')
  })

  it("keeps nothing of a store's throw that quotes the record it was handed but its name: not as its cause, not in its message or meta", async () => {
    const record = await TH.leaseOf('u1')
    const quoting = new Error(`could not store ${JSON.stringify({ ...record, lease_key: 'the leaseKey, as a careless store might print it' })}`)
    const deviceDB = new ScriptedDeviceDB(() => Promise.reject(quoting))
    const err = await TH.expectBad(deviceDB.putLease(record), 'storage_unavailable')
    expect(err.cause).to.be.undefined
    expect(err.meta).to.be.undefined
    expect(err.message).to.match(/The device store threw Error\.$/)
    expect(TH.thrownText(err)).to.not.include(record.vault_tok)
    expect(TH.thrownText(err)).to.not.include('careless')
  })

  const ThrownCases = [
    // what a host's own store may throw, what the vault hears, and how the message ends: the error's name, or no word of it
    [new DOMException('No room.', 'QuotaExceededError'),     "storage_blocked",      /The device store threw QuotaExceededError\.$/, 'no room, as a private window or a full disk gives'],
    [new DOMException('Gone.', 'NotSupportedError'),          "storage_blocked",      /The device store threw NotSupportedError\.$/,  'no such storage at all'],
    [{ name: 'SecurityError', message: 'from another frame' }, "storage_blocked",      /The device store threw SecurityError\.$/,      'a refusal told by its name alone, from another frame'],
    [new Error('socket closed'),                              "storage_unavailable",  /The device store threw Error\.$/,              'any other failure, which a retry may mend'],
    ["a bare string",                                         "storage_unavailable",  /or a private window\.$/,                       'a thrown value that is no Error, which has no name to keep'],
  ] as const

  for (const [thrown, refusalkind, ending, blurb] of ThrownCases) {
    it(`says ${blurb} as '${refusalkind}', keeping nothing of what was thrown but its name`, async () => {
      const deviceDB = new ScriptedDeviceDB(vi.fn<() => Promise<never>>().mockRejectedValue(thrown))
      const err = await TH.expectBad(deviceDB.getLease(TH.scopeOf('u1')), refusalkind)
      expect(err.cause).to.be.undefined
      expect(err.message).to.match(ending)
      for (const quoted of ['No room', 'Gone', 'another frame', 'socket closed', 'bare string']) { expect(err.message).to.not.include(quoted) }
    })
  }

  it("passes a VaultError the store throws through as it came", async () => {
    const refusal = new VaultError('not_permitted', 'This device may not read its records.')
    const deviceDB = new ScriptedDeviceDB(() => { throw refusal })
    const passed = await TH.expectBad(deviceDB.delDeviceRecord(TH.scopeOf('u1')), 'not_permitted')
    expect(passed).to.eq(refusal)
  })

  it("never rejects, even for a store that throws before its promise", async () => {
    const deviceDB = new ScriptedDeviceDB(() => { throw new Error('thrown at once') })
    await TH.expectBad(deviceDB.delAll(), 'storage_unavailable')
  })

  it("names no scope in what it says", async () => {
    const scope: VaultScope = { applabel: 'acme', user_id: 'distinctive_user', vaultlabel: 'main' }
    const deviceDB = new ScriptedDeviceDB(() => Promise.reject(new Error('no')))
    const err = await TH.expectBad(deviceDB.getDeviceRecord(scope), 'storage_unavailable')
    expect(err.message).not.to.include('distinctive_user')
  })
})
