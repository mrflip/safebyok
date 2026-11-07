// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { IdbDeviceDB, zxcvbnStrengthChecker } from 'safebyok/browser'
import { OutageVaultDB } from '../../src/lib/outage-vault-db'
import { bankOpts } from '../../src/lib/stores'

describe("the demo's bank options", () => {
  it("are the browser's batteries and the vaultDB behind the outage switch", () => {
    expect(bankOpts.applabel).to.eq('safebyok_demo')
    expect(bankOpts.deviceDB).to.be.instanceOf(IdbDeviceDB)
    expect(bankOpts.strengthChecker).to.eq(zxcvbnStrengthChecker)
    expect(bankOpts.vaultDB).to.be.instanceOf(OutageVaultDB)
  })
})
