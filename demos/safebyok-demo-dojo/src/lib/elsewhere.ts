/** Another device of the signed-in user, as another browser would be: its own device over its own connection to the vault database, unlocked with the fixture's passphrase. */

import { Device } from 'safebyok'
import { IdbVaultDB } from 'safebyok-idb-lean'
import { Banklabel, DojoDBName, dojoDeriver } from './dojo'
import { Fixture } from './fixture'
import { switchableChecker } from './switchable-checker'

/** The device elsewhere, signed in as the page's user, once one is asked for: one for the page's life. */
const elsewhere: { device: Promise<Device> | null } = { device: null }

// Its write tells this page's watch, so this page's minder hears of the box and a later save here cites it.
/** Put a box at the host labelpath `labelpath` from the device elsewhere, signed in as `userid`: a newer revision than this page has heard of. */
export async function putBoxElsewhere(userid: string, labelpath: string): Promise<void> {
  elsewhere.device ??= signedInElsewhere(userid)
  const { bank, vault } = await elsewhere.device
  if ((bank === null) || (vault === null)) { throw new Error(`${userid} has no bank for another device to write a box in.`) }
  if (! bank.isUnlocked) { await bank.gate.unlock({ passphraseCleartext: passphraseOf(userid) }) }
  await vault.putBoxOnce(`box/${labelpath}`, { sidecar: { username: 'written_elsewhere' } }, { whisper: { password: 'written elsewhere, meanwhile' } })
}

/** A new device, signed in as `userid`, over a vaultDB of its own on the dojo's database. */
async function signedInElsewhere(userid: string): Promise<Device> {
  const vaultDB = new IdbVaultDB({ dbName: DojoDBName })
  const device = Device.make({ banklabel: Banklabel, device_tok: globalThis.crypto.randomUUID() }, { vaultDB, keyDeriver: dojoDeriver, strengthChecker: switchableChecker })
  await device.hello()
  await device.signin(userid)
  return device
}

/** The printed passphrase of the fixture user `userid`. */
function passphraseOf(userid: string): string {
  const user = Fixture.users.find((each) => each.userid === userid)
  if (user === undefined) { throw new Error(`The dojo has no user ${userid}.`) }
  return user.passphrase
}
