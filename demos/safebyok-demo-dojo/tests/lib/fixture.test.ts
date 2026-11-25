import { Device } from 'safebyok'
import { IdbVaultDB } from 'safebyok-idb-lean'
import { describe, expect, it } from 'vitest'
import { Banklabel, DojoDBName, dojoDeriver } from '../../src/lib/dojo'
import { Fixture } from '../../src/lib/fixture'
import { loadFixture } from '../../src/lib/stores'
import { switchableChecker } from '../../src/lib/switchable-checker'

// A fixture the library can no longer read fails here, loudly: run `pnpm --filter safebyok-demo-dojo fixture` to write it again.

/** A device of the app's settings with `userid` signed in, its sign-in answered. */
async function signedInDevice(userid: string): Promise<Device> {
  const device = Device.make({ banklabel: Banklabel, device_tok: globalThis.crypto.randomUUID() }, {
    vaultDB: new IdbVaultDB({ dbName: DojoDBName }), keyDeriver: dojoDeriver, strengthChecker: switchableChecker,
  })
  await device.hello()
  await device.signin(userid)
  return device
}

describe('the fixture', () => {
  it("unlocks Hero's and Thierry's banks with the passphrases printed on the page, and has no bank for Nolo", async () => {
    await loadFixture()
    for (const userid of ['hero', 'thierry']) {
      const device = await signedInDevice(userid)
      expect(device.getSnapshot().bank.stage).to.eq('locked')
      const passphraseCleartext = Fixture.users.find((user) => user.userid === userid)?.passphrase ?? ''
      await device.bank!.gate.unlockGating({ passphraseCleartext }).attempt()
      expect(device.getSnapshot().bank.stage).to.eq('unlocked')
    }
    const nolo = await signedInDevice('nolo')
    expect(nolo.getSnapshot().bank.stage).to.eq('unborn')
  })
})
