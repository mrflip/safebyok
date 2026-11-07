// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { IdbDeviceDB, zxcvbnStrengthChecker } from 'safebyok/browser'
import { OutageVaultDB } from '../../src/lib/outage-vault-db'
import { bankOpts, deviceIdOf } from '../../src/lib/stores'

const UuidV4 = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[\da-f]{4}-[\da-f]{12}$/

afterEach(() => { localStorage.clear() })

describe("deviceIdOf", () => {
  it("makes a UUID on the first visit and keeps it in localStorage", () => {
    const device_id = deviceIdOf()
    expect(device_id).to.match(UuidV4)
    expect(localStorage.getItem('safebyok-demo:device_id')).to.eq(device_id)
  })

  it("answers the kept one at each later visit", () => {
    expect(deviceIdOf()).to.eq(deviceIdOf())
  })
})

describe("the demo's bank options", () => {
  it("are the browser's batteries, this browser's device_id, and the vaultDB behind the outage switch", () => {
    expect(bankOpts.applabel).to.eq('safebyok_demo')
    expect(bankOpts.device_id).to.match(UuidV4)
    expect(bankOpts.deviceDB).to.be.instanceOf(IdbDeviceDB)
    expect(bankOpts.strengthChecker).to.eq(zxcvbnStrengthChecker)
    expect(bankOpts.vaultDB).to.be.instanceOf(OutageVaultDB)
  })
})
