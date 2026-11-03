/** The box's seal through a real vault's lease, the one place a box meets real cryptography in `tests/models/`. */

import { afterEach, describe, expect, it } from 'vitest'
import type { BoxRecord } from '../../src/models/models-shapes'
import * as TH from '../test-helpers'
import { type ModelsWorld, boxListingOf, makeModelsWorld } from '../test-helpers/models-world'
import { Dna, Passphrase, boxWorldOf, makeVaultWorld, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()

/** The models worlds a test made, disposed after it. */
const modelsWorlds: ModelsWorld[] = []
afterEach(() => { for (const mw of modelsWorlds.splice(0)) { mw.dispose() } })

const Whisper = { val: { apiKey: 'sk-test-0000', orgId: null } }
const BoxDna = { ...Dna, boxlabel: 'anthropic_api_key', whisper: Whisper, sidecar: { account: 'work' } }

/** Box listings whose world is a real vault, born unlocked under `Passphrase`, over its vaultDB. */
const sealWorld = async () => {
  const vaultWorld = makeVaultWorld()
  const vault = await vaultWorld.listing.create(Dna, () => ({ passphrase: Passphrase }))
  const mw = makeModelsWorld({ fakeTimers: false })
  modelsWorlds.push(mw)
  const boxesOf = () => boxListingOf(mw, { world: boxWorldOf(vault), vaultDB: vaultWorld.opts.vaultDB })
  return { ...vaultWorld, vault, boxesOf, boxes: boxesOf() }
}

describe("a box sealed and unsealed through the vault's lease", () => {
  it("opens the whisper create sealed, and the one a later send sealed, each as its { val }; the sealed parts carry none of it", async () => {
    const { boxes } = await sealWorld()
    const box = await boxes.create(BoxDna)
    expect(await box.unsealWhisper()).to.deep.equal(Whisper)
    expect(JSON.stringify(box._cheat_central)).to.not.include('sk-test-0000')
    await box.send({ whisper: { val: 'sk-test-1111' }, sidecar: { account: 'home' } })
    expect(await box.unsealWhisper()).to.deep.equal({ val: 'sk-test-1111' })
  })

  it("opens the sealed record in another listing, and refuses 'damaged_box' for it with its sidecar altered, as the seal binds it", async () => {
    const { boxes, boxesOf } = await sealWorld()
    const built = await boxes.create(BoxDna)
    const sealed = built._cheat_central
    const intact = await boxesOf().build(sealed)
    expect(await intact.unsealWhisper()).to.deep.equal(Whisper)
    const altered = await boxesOf().build({ ...sealed, sidecar: { account: 'home' } } as BoxRecord)
    await TH.expectRefusal(altered.unsealWhisper(), 'damaged_box')
  })

  it("refuses 'vault_locked' from the lease, at the seal and the unseal, once the vault locks", async () => {
    const { boxes, vault } = await sealWorld()
    const box = await boxes.create(BoxDna)
    vault.lock()
    await TH.expectRefusal(box.unsealWhisper(), 'vault_locked')
    await TH.expectRefusal(box.send({ whisper: { val: 'sk-test-1111' }, sidecar: { account: 'home' } }), 'vault_locked')
  })
})
