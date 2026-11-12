/** DeviceDB, the base: what it makes of a device database that throws. The cases every DeviceDB must pass are the battery's (tests/test-helpers/device-db-battery.ts). */

import { describe, expect, it } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import { makeLeaseKey } from '../../src/helpers/crypto'
import { DeviceDB } from '../../src/storage/device-db'
import * as TH from '../test-helpers'

const asked = { user_id: 'u1', banklabel: 'acme', bank_tok: 'tok_one' }

/** A DeviceDB whose every generic call throws what it is told. */
class BrokenDeviceDB extends DeviceDB {
  readonly thrown: unknown
  constructor(thrown: unknown) { super(); this.thrown = thrown }
  protected doStow(): never { throw this.thrown }
  protected doPeek(): never { throw this.thrown }
  protected doForget(): never { throw this.thrown }
  protected doListLeases(): never { throw this.thrown }
  protected doForgetRawLease(): never { throw this.thrown }
  protected doEnsureCachedDevice(): unknown { throw this.thrown }
  protected doForgetDevice(): never { throw this.thrown }
  protected doListDevices(): never { throw this.thrown }
}

describe("a deviceDB whose generic call throws", () => {
  it("refuses every verb, naming the verb and the thrown name, never quoting the thrown message", async () => {
    const thrown = new DOMException('lease_key secret-looking text', 'QuotaExceededError')
    const deviceDB = new BrokenDeviceDB(thrown)
    const row = { ...asked, proved_at: Date.UTC(2026, 10, 3), lease_key: await makeLeaseKey() }
    const refused = [
      ['stow',       await TH.expectBad(deviceDB.tryStow(row), 'storage_unavailable')],
      ['peek',       await TH.expectBad(deviceDB.tryPeek(asked), 'storage_unavailable')],
      ['forget',     await TH.expectBad(deviceDB.tryForget(asked), 'storage_unavailable')],
      ['listLeases', await TH.expectBad(deviceDB.tryListLeases(), 'storage_unavailable')],
      ['forgetRawLease', await TH.expectBad(deviceDB.tryForgetRawLease(['u1', 'acme']), 'storage_unavailable')],
      ['ensureCachedDevice', await TH.expectBad(deviceDB.tryEnsureCachedDevice(asked), 'storage_unavailable')],
      ['forgetDevice', await TH.expectBad(deviceDB.tryForgetDevice(asked), 'storage_unavailable')],
      ['listRawDevices', await TH.expectBad(deviceDB.tryListRawDevices(), 'storage_unavailable')],
    ] as const
    for (const [verb, err] of refused) {
      expect(err.message).to.include(verb)
      expect(err.message).to.include('QuotaExceededError')
      expect(err.message).to.not.include('secret-looking')
      expect(err.cause).to.be.undefined
    }
  })

  it("rethrows a VaultError from a generic call unchanged", async () => {
    const refusal = new VaultError('storage_unavailable', 'This browser does not let the app keep anything on this device.')
    const err = await TH.expectBad(new BrokenDeviceDB(refusal).tryPeek(asked), 'storage_unavailable')
    expect(err).to.eq(refusal)
  })
})

describe("a deviceDB whose generic call returns an invalid device row", () => {
  it("refuses ensureCachedDevice", async () => {
    class GarbledDeviceDB extends BrokenDeviceDB {
      protected override doEnsureCachedDevice(): unknown { return { user_id: 'u1', banklabel: 'acme', device_tok: 'not-a-uuid' } }
    }
    await TH.expectBad(new GarbledDeviceDB(null).tryEnsureCachedDevice(asked), 'bad_record')
  })
})
