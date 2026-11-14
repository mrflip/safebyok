// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { IdbDeviceDB, zxcvbnStrengthChecker } from 'safebyok-big/browser'
import { OutageBankDB } from '../../src/lib/outage-bank-db'
import { bankOpts } from '../../src/lib/storage'

describe("the demo's bank options", () => {
  it("use the browser's deviceDB and strength checker, and a bankDB behind the outage switch", () => {
    expect(bankOpts.banklabel).to.eq('safebyok_demo')
    expect(bankOpts.deviceDB).to.be.instanceOf(IdbDeviceDB)
    expect(bankOpts.strengthChecker).to.eq(zxcvbnStrengthChecker)
    expect(bankOpts.bankDB).to.be.instanceOf(OutageBankDB)
  })
})
