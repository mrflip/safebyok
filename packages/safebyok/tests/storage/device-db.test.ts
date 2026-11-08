/** DeviceDB, the base: what it makes of a store that throws. The cases every store must pass are the battery's (tests/test-helpers/device-db-battery.ts). */

import { describe, expect, it } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import { makeLeaseKey } from '../../src/helpers/crypto'
import { DeviceDB } from '../../src/storage/device-db'
import * as TH from '../test-helpers'

const asked = { applabel: 'acme', user_id: 'u1', vaultlabel: 'main', vault_tok: 'tok_one' }

/** A store whose every generic call throws what it is told. */
class BrokenDeviceDB extends DeviceDB {
  readonly thrown: unknown
  constructor(thrown: unknown) { super(); this.thrown = thrown }
  protected doStow(): never { throw this.thrown }
  protected doPeek(): never { throw this.thrown }
  protected doForget(): never { throw this.thrown }
  protected doListLeases(): never { throw this.thrown }
  protected doDelRawLease(): never { throw this.thrown }
  protected doEnsureBank(): unknown { throw this.thrown }
  protected doForgetBank(): never { throw this.thrown }
  protected doListBanks(): never { throw this.thrown }
}

describe("a deviceDB whose store throws", () => {
  it("refuses every verb, naming the verb and the thrown name, never quoting the thrown message", async () => {
    const thrown = new DOMException('lease_key secret-looking text', 'QuotaExceededError')
    const deviceDB = new BrokenDeviceDB(thrown)
    const row = { ...asked, proved_at: Date.UTC(2026, 10, 3), lease_key: await makeLeaseKey() }
    const refused = [
      ['stow',       await TH.expectBad(deviceDB.tryStow(row), 'storage_unavailable')],
      ['peek',       await TH.expectBad(deviceDB.tryPeek(asked), 'storage_unavailable')],
      ['forget',     await TH.expectBad(deviceDB.tryForget(asked), 'storage_unavailable')],
      ['listLeases', await TH.expectBad(deviceDB.tryListLeases(), 'storage_unavailable')],
      ['delRawLease', await TH.expectBad(deviceDB.tryDelRawLease(['acme', 'u1', 'main']), 'storage_unavailable')],
      ['ensureBank', await TH.expectBad(deviceDB.tryEnsureBank(asked), 'storage_unavailable')],
      ['forgetBank', await TH.expectBad(deviceDB.tryForgetBank(asked), 'storage_unavailable')],
      ['listRawBanks', await TH.expectBad(deviceDB.tryListRawBanks(), 'storage_unavailable')],
    ] as const
    for (const [verb, err] of refused) {
      expect(err.message).to.include(verb)
      expect(err.message).to.include('QuotaExceededError')
      expect(err.message).to.not.include('secret-looking')
      expect(err.cause).to.be.undefined
    }
  })

  it("passes a VaultError the store throws as it came", async () => {
    const refusal = new VaultError('storage_unavailable', 'This browser does not let the app keep anything on this device.')
    const err = await TH.expectBad(new BrokenDeviceDB(refusal).tryPeek(asked), 'storage_unavailable')
    expect(err).to.eq(refusal)
  })
})

describe("a deviceDB whose store answers a bank row that fails its check", () => {
  it("refuses ensureBank", async () => {
    class GarbledDeviceDB extends BrokenDeviceDB {
      protected override doEnsureBank(): unknown { return { applabel: 'acme', user_id: 'u1', device_id: 'not-a-uuid' } }
    }
    await TH.expectBad(new GarbledDeviceDB(null).tryEnsureBank(asked), 'bad_record')
  })
})
