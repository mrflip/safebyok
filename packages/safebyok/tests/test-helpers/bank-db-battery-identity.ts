/** The battery's case of who may reach a vault: every verb refused, nothing read or written, for anyone but the user it names. */

import { describe, expect, it } from 'vitest'
import { isVaultError } from '../../src/refusals/errors'
import type { VaultDB } from '../../src/storage/vault-db'
import {
  vaultListAsk, boxListAsk, boxAt, passkeyWayin, passphraseWayin, vaultAt, gateMoveOf,
  vaultGetAskOf, boxGetAskOf, vaultPutAskOf, boxPutAskOf, vaultDelAskOf, boxDelAskOf,
} from './storage-world'
import type { BatteryWorld } from './vault-db-battery'

const vault = vaultAt()
const box = boxAt()

/** Each verb of `vaultDB`, by name, called on u1's vault as its owner could call it: all that a stranger must be refused. */
function everyVerbOn(vaultDB: VaultDB) {
  return {
    listVaults:        () => vaultDB.listVaults(vaultListAsk),
    getVault:          () => vaultDB.getVault(vaultGetAskOf()),
    listBoxes:         () => vaultDB.listBoxes(boxListAsk),
    getBox:            () => vaultDB.getBox(boxGetAskOf()),
    putVault:          () => vaultDB.putVault(vaultPutAskOf(vaultAt(1), vault)),
    putBox:            () => vaultDB.putBox(boxPutAskOf(boxAt(1), box)),
    replacePassphrase: () => vaultDB.replacePassphrase(...gateMoveOf(vault, { passphrase_wayin: passphraseWayin })),
    addPasskey:        () => vaultDB.addPasskey(...gateMoveOf(vault, { passkey_wayin: passkeyWayin })),
    revokePasskey:     () => vaultDB.revokePasskey(...gateMoveOf(vault, { passkey_wayin: null })),
    delBox:            () => vaultDB.delBox(boxDelAskOf(box)),
    delVault:          () => vaultDB.delVault(vaultDelAskOf(vault)),
  }
}

/** Registers the cases of who may reach a vault over `world`. */
export function describeIdentity({ hasIdentity, makeVaultDBFor }: BatteryWorld): void {
  if (hasIdentity) {
    describe("who may reach a vault", () => {
      for (const [blurb, user_id] of [['another user', 'u2'], ['no one signed in', null]] as const) {
        it(`refuses ${blurb} every verb on a vault as identity_revoked, changing nothing`, async () => {
          const vaultDBFor = await makeVaultDBFor()
          const owner = vaultDBFor('u1')
          await owner.putVault(vaultPutAskOf(vault))
          await owner.putBox(boxPutAskOf(box))
          const stranger = everyVerbOn(vaultDBFor(user_id))
          for (const [verbname, call] of Object.entries(stranger)) {
            await expect(call(), verbname).rejects.toSatisfy((err) => isVaultError(err, 'identity_revoked'))
          }
          const [storedVault, storedBox] = await Promise.all([owner.getVault(vaultGetAskOf()), owner.getBox(boxGetAskOf())])
          expect(storedVault.val).to.deep.equal(vault)
          expect(storedBox.val).to.deep.equal(box)
        })
      }
    })
  }
}
