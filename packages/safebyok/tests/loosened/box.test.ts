/** What a box does today that the README forbids, pinned as it is until the Coach rules. Each `it` names its source and line. */

import { afterEach, describe, expect, it } from 'vitest'
import type { BoxWorld } from '../../src/models/box-listing'
import { type ModelsWorld, boxListingOf, makeModelsWorld } from '../test-helpers/models-world'
import { Dna, Passphrase, boxWorldOf, byPassphrase, makeVaultWorld, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()

/** The models worlds a test made, disposed after it. */
const modelsWorlds: ModelsWorld[] = []
afterEach(() => { for (const mw of modelsWorlds.splice(0)) { mw.dispose() } })

const Whisper = { val: 'sk-test-0000' }
const BoxDna = { ...Dna, boxlabel: 'anthropic_api_key', whisper: Whisper, sidecar: { account: 'work' } }

describe("a lock() landing while an unseal is under way", () => {
  it("README.md:617, 'getBox(), getWhisper() or useWhisper() under way refuses with vault_locked too, handing nothing back': an unseal whose lease was handed out just before lock() resolves with the whisper, the vault locked", async () => {
    const { listing } = makeVaultWorld()
    const vault = await listing.ensure(Dna, byPassphrase(Passphrase))
    const mw = makeModelsWorld({ fakeTimers: false })
    modelsWorlds.push(mw)
    const built = await boxListingOf(mw, { world: boxWorldOf(vault) }).build(BoxDna)
    await built.send({ whisper: Whisper, sidecar: BoxDna.sidecar })
    const lockingWorld: BoxWorld = { ...boxWorldOf(vault), demandLease: () => { const lease = vault.demandLease(); vault.lock(); return lease } }
    const box = await boxListingOf(mw, { world: lockingWorld }).build(built._cheat_central)
    expect(await box.unsealWhisper()).to.deep.equal(Whisper)
    expect(vault.isLocked).to.be.true
  })
})
