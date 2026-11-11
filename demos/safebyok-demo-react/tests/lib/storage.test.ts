// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { IdbDeviceDB, zxcvbnStrengthChecker } from 'safebyok/browser'
import { OutageVaultDB } from '../../src/lib/outage-vault-db'
import { bankOpts } from '../../src/lib/storage'

describe("the demo's bank options", () => {
  it("use the browser's deviceDB and strength checker, and a vaultDB behind the outage switch", () => {
    expect(bankOpts.applabel).to.eq('safebyok_demo')
    expect(bankOpts.deviceDB).to.be.instanceOf(IdbDeviceDB)
    expect(bankOpts.strengthChecker).to.eq(zxcvbnStrengthChecker)
    expect(bankOpts.vaultDB).to.be.instanceOf(OutageVaultDB)
  })
})
