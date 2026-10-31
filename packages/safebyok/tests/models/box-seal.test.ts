/** The box's seal through a real vault's lease, the one place a box meets real cryptography in `tests/models/`. */

import { afterEach, describe, expect, it } from 'vitest'
import * as TH from '../test-helpers'
import { type ModelsWorld, boxListingOf, makeModelsWorld } from '../test-helpers/models-world'
import { Dna, LeaseMillis, Passphrase, boxWorldOf, makeVaultWorld, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()

/** The models worlds a test made, disposed after it. */
const modelsWorlds: ModelsWorld[] = []
afterEach(() => { for (const mw of modelsWorlds.splice(0)) { mw.dispose() } })

const Whisper = { val: { apiKey: 'sk-test-0000', orgId: null } }
const BoxDna = { ...Dna, boxlabel: 'anthropic_api_key', whisper: Whisper, sidecar: { account: 'work' } }

/** Box listings whose world is a real vault, born unlocked under `Passphrase`, over the models world's fake store and cache. */
const sealWorld = async () => {
  const vaultWorld = makeVaultWorld()
  const vault = await vaultWorld.listing.build(Dna, () => ({ passphrase: Passphrase }))
  const mw = makeModelsWorld({ fakeTimers: false })
  modelsWorlds.push(mw)
  const boxesOf = () => boxListingOf(mw, { world: boxWorldOf(vault) })
  return { ...vaultWorld, vault, boxesOf, boxes: boxesOf() }
}

describe("a box sealed and unsealed through the vault's lease", () => {
  it("opens the whisper build sealed, and the one a later seal sealed, each as its { val }; the sealed parts carry none of it", async () => {
    const { boxes } = await sealWorld()
    const box = await boxes.build(BoxDna)
    expect(await box.unsealWhisper()).to.deep.equal(Whisper)
    expect(JSON.stringify(box._cheat_staged)).to.not.include('sk-test-0000')
    await box.seal({ val: 'sk-test-1111' }, { account: 'home' })
    expect(await box.unsealWhisper()).to.deep.equal({ val: 'sk-test-1111' })
  })

  it("opens the sealed record in another listing, and refuses 'damaged_box' for it with its sidecar altered, as the seal binds it", async () => {
    const { boxes, boxesOf } = await sealWorld()
    const built = await boxes.build(BoxDna)
    const sealed = built._cheat_staged
    if (sealed === null) { throw new Error('nothing staged') }
    const intact = await boxesOf().build(sealed)
    expect(await intact.unsealWhisper()).to.deep.equal(Whisper)
    const altered = await boxesOf().build({ ...sealed, sidecar: { account: 'home' } })
    await TH.expectRefusal(altered.unsealWhisper(), 'damaged_box')
  })

  it("refuses 'vault_locked' from the lease, at the seal and the unseal, once the clock passes its autolock_at", async () => {
    const { boxes, advance } = await sealWorld()
    const box = await boxes.build(BoxDna)
    advance(LeaseMillis)
    await TH.expectRefusal(box.unsealWhisper(), 'vault_locked')
    await TH.expectRefusal(box.seal({ val: 'sk-test-1111' }, { account: 'home' }), 'vault_locked')
  })
})
