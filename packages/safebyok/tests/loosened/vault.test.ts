/** What a vault does today that safebyok-old's README forbids, pinned as it is until the Coach rules. Each `it` names its source and line. */

import { describe, expect, it } from 'vitest'
import * as TH from '../test-helpers'
import { NewPassphrase, Passphrase, byPassphrase, makeBornVault, replaceTyping, useVaultWorlds, unlockTyping } from '../test-helpers/vault-world'

useVaultWorlds()

describe("an older copy of the vault record", () => {
  it("safebyok-old/README.md:1204, 'Storage handing back an older copy could otherwise bring back a way in that was removed': the next session on this device has a vault record restored from before a passphrase change, and the passphrase replaced opens it again", async () => {
    const { vault, restoreRow, demandStored, anotherSession, deviceDB } = await makeBornVault()
    const ante = demandStored()
    await replaceTyping(vault, Passphrase, NewPassphrase)
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    restoreRow(ante)
    const later = anotherSession()
    const restored = await later.build(demandStored())
    await later.hello()
    expect(restored.isLocked).to.be.true
    expect(restored.revision_seq).to.eq(ante.revision_seq)
    expect(restored.gate.pickle()).to.deep.equal(ante.gate)
    await unlockTyping(restored, byPassphrase(Passphrase))
    expect(restored.isUnlocked).to.be.true
  })
})
