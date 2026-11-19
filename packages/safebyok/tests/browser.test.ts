import { describe, expect, it } from 'vitest'
// fake-indexeddb installs IndexedDB's globals, for the device database browserOpts() opens: no browser.
import 'fake-indexeddb/auto'
import * as BigBrowser from 'safebyok-big/browser'
import * as Browser from '../src/browser'
import * as Front from '../src/index'

describe("safebyok/browser", () => {
  it("exports every value safebyok-big/browser exports, the same value", () => {
    for (const [exportname, val] of Object.entries(BigBrowser)) { expect(Browser, exportname).to.have.property(exportname).that.eq(val) }
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
