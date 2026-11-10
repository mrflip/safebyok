/** The battery's case of who may reach a vault: every verb refused, nothing read or written, for anyone but the user it names. */

import { describe, expect, it } from 'vitest'
import { isVaultError } from '../../src/refusals/errors'
import * as SX from '../../src/shapes/shapes-storage'
import type { VaultDB } from '../../src/storage/vault-db'
import { bankScope, boxAt, boxQuery, boxTombstoneOf, passkeyWayin, passphraseWayin, priorOf, vaultAt, vaultQuery, vaultScope, vaultTombstoneOf } from './storage-world'
import type { BatteryWorld } from './vault-db-battery'
import { gateMoveOf } from './vault-db-battery-puts'

const vault = vaultAt()
const box = boxAt()
const opts = { prior: SX.VoidRevision }

/** Each verb of `vaultDB`, by name, called on u1's vault: all that a stranger must be refused. */
const everyVerbOn = (vaultDB: VaultDB) => ({
  listVaults:        () => vaultDB.listVaults(bankScope),
  getVault:          () => vaultDB.getVault(vaultScope),
  listBoxes:         () => vaultDB.listBoxes(vaultQuery),
  getBox:            () => vaultDB.getBox(boxQuery),
  putVault:          () => vaultDB.putVault(vault, opts),
  putBox:            () => vaultDB.putBox(box, opts),
  replacePassphrase: () => vaultDB.replacePassphrase(...gateMoveOf(vault, { passphrase_wayin: passphraseWayin })),
  addPasskey:        () => vaultDB.addPasskey(...gateMoveOf(vault, { passkey_wayin: passkeyWayin })),
  revokePasskey:     () => vaultDB.revokePasskey(...gateMoveOf(vault, { passkey_wayin: null })),
  delBox:            () => vaultDB.delBox(boxTombstoneOf(box), { prior: priorOf(box) }),
  delVault:          () => vaultDB.delVault(vaultTombstoneOf(vault), { prior: priorOf(vault) }),
})

/** Registers the cases of who may reach a vault over `world`. */
export const describeIdentity = ({ hasIdentity, makeVaultDBFor }: BatteryWorld): void => {
  describe.runIf(hasIdentity)("who may reach a vault", () => {
    for (const [blurb, user_id] of [['another user', 'u2'], ['no one signed in', null]] as const) {
      it(`refuses ${blurb} every verb on a vault as identity_revoked, changing nothing`, async () => {
        const vaultDBFor = await makeVaultDBFor()
        const owner = vaultDBFor('u1')
        await owner.putVault(vault, opts)
        await owner.putBox(box, opts)
        const stranger = everyVerbOn(vaultDBFor(user_id))
        for (const [verbname, call] of Object.entries(stranger)) {
          await expect(call(), verbname).rejects.toSatisfy((err) => isVaultError(err, 'identity_revoked'))
        }
        const [storedVault, storedBox] = await Promise.all([owner.getVault(vaultScope), owner.getBox(boxQuery)])
        expect(storedVault.val).to.deep.equal(vault)
        expect(storedBox.val).to.deep.equal(box)
      })
    }
  })
}
