import { describe, expect, it } from 'vitest'
// fake-indexeddb installs IndexedDB's globals, for the device database browserOpts() opens: no browser.
import 'fake-indexeddb/auto'
import * as BigBrowser from 'safebyok-big/browser'
import * as Browser from '../src/browser'
import * as Front from '../src/index'
import * as TH from './test-helpers'

describe("safebyok/browser", () => {
  it("exports every value safebyok-big/browser exports, the same value, but its own device database and browserOpts", () => {
    const ownnames = new Set(['IdbDeviceDB', 'idbDeviceDB', 'browserOpts'])
    const shared   = Object.entries(BigBrowser).filter(([exportname]) => ! ownnames.has(exportname))
    for (const [exportname, val] of shared) { expect(Browser, exportname).to.have.property(exportname).that.eq(val) }
    for (const exportname of ownnames) { expect(Browser, exportname).to.have.property(exportname).that.not.eq(BigBrowser[exportname as keyof typeof BigBrowser]) }
  })

  it("answers from browserOpts() this package's IdbDeviceDB, the same bag for the same dbName", () => {
    const bag = Browser.browserOpts({ dbName: 'browser-test' })
    expect(bag.deviceDB).to.be.instanceOf(Browser.IdbDeviceDB).and.not.be.instanceOf(BigBrowser.IdbDeviceDB)
    expect(Browser.browserOpts({ dbName: 'browser-test' })).to.eq(bag)
    expect(Browser.browserOpts({ dbName: 'browser-test-2' })).to.not.eq(bag)
    expect(Object.isFrozen(bag)).to.be.true
  })

  it("refuses browserOpts() a misspelt field", () => {
    TH.expectSyncRefusal(() => Browser.browserOpts({ dbname: 'x' } as never), 'bad_record')
  })

  it("answers from browserOpts() the zxcvbn checker, which takes the scope Device.make hands it", async () => {
    const { strengthChecker } = Browser.browserOpts({ dbName: 'browser-test' })
    expect(strengthChecker).to.eq(Browser.zxcvbnStrengthChecker)
    expect(await strengthChecker('correct horse battery staple', { userid: 'u1', banklabel: 'main' })).to.have.property('strong')
  })

  it("keeps the deriver, the device database and the strength checker off the front door", () => {
    for (const exportname of ['argon2idWebV1Deriver', 'makeArgon2idDeriver', 'idbDeviceDB', 'zxcvbnStrengthChecker', 'browserOpts']) { expect(Front, exportname).to.not.have.property(exportname) }
  })
})
