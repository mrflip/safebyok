/** The battery's case of who may reach a bank: every verb refused, nothing read or written, for anyone but the user it names. */

import { describe, expect, it } from 'vitest'
import { isVaultError } from '../../src/refusals/errors'
import type { BankDB } from '../../src/storage/bank-db'
import {
  MainOnly, bankAt, gateAt, vaultAt, boxAt, bankEnsureAsk, boxListAsk, boxTidyAsk, mainWayin, passkey0Wayin, otherMainWayin,
  bankBuildAskOf, gatePutAskOf, bankDelAskOf, vaultGetAskOf, boxGetAskOf, vaultPutAskOf, boxPutAskOf, vaultDelAskOf, boxDelAskOf,
} from './bankdb-world'
import type { BatteryWorld } from './bank-db-battery'

const bank = bankAt()
const gate = gateAt()
const vault = vaultAt()
const box = boxAt()

/** Each verb of `bankDB`, by name, called on u1's bank as its owner could call it: all that a stranger must be refused. */
function everyVerbOn(bankDB: BankDB) {
  return {
    ensureBank:        () => bankDB.ensureBank(bankEnsureAsk),
    buildBank:         () => bankDB.buildBank(bankBuildAskOf(bankAt(0, 'bank2'), gateAt(0, 'bank2'))),
    replacePassphrase: () => bankDB.replacePassphrase(gatePutAskOf(gate, { main: otherMainWayin })),
    addPasskey:        () => bankDB.addPasskey(gatePutAskOf(gate, { main: mainWayin, passkey0: passkey0Wayin })),
    revokePasskey:     () => bankDB.revokePasskey(gatePutAskOf(gate, MainOnly)),
    getVault:          () => bankDB.getVault(vaultGetAskOf()),
    putVault:          () => bankDB.putVault(vaultPutAskOf(vaultAt(1), vault)),
    listBoxes:         () => bankDB.listBoxes(boxListAsk),
    getBox:            () => bankDB.getBox(boxGetAskOf()),
    putBox:            () => bankDB.putBox(boxPutAskOf(boxAt(1), box)),
    delBox:            () => bankDB.delBox(boxDelAskOf(box)),
    delVault:          () => bankDB.delVault(vaultDelAskOf(vault)),
    tidyGone:          () => bankDB.tidyGone(boxTidyAsk),
    delBank:           () => bankDB.delBank(bankDelAskOf(bank)),
  }
}

/** Registers the cases of who may reach a bank over `world`. */
export function describeIdentity({ hasIdentity, makeBankDBFor }: BatteryWorld): void {
  if (hasIdentity) {
    describe("who may reach a bank", () => {
      for (const [blurb, user_id] of [['another user', 'u2'], ['no one signed in', null]] as const) {
        it(`refuses ${blurb} every verb on a bank with a refusal, changing nothing`, async () => {
          const bankDBFor = await makeBankDBFor()
          const owner = bankDBFor('u1')
          await owner.buildBank(bankBuildAskOf(bank, gate))
          await owner.putVault(vaultPutAskOf(vault))
          await owner.putBox(boxPutAskOf(box))
          const stranger = everyVerbOn(bankDBFor(user_id))
          for (const [verbname, call] of Object.entries(stranger)) {
            await expect(call(), verbname).rejects.toSatisfy((err) => isVaultError(err))
          }
          const [storedBank, storedVault, storedBox] = await Promise.all([owner.ensureBank(bankEnsureAsk), owner.getVault(vaultGetAskOf()), owner.getBox(boxGetAskOf())])
          expect(storedBank.val?.gates).to.deep.equal({ main: gate })
          expect(storedVault.val).to.deep.equal(vault)
          expect(storedBox.val).to.deep.equal(box)
        })
      }
    })
  }
}
