/** The box's seal through a real vault's lease, the one place a box meets real cryptography in `tests/models/`. */

import { describe, expect, it } from 'vitest'
import type { BoxRecord } from '../../src/shapes/shapes-storage'
import * as TH from '../test-helpers'
import { TestableBoxListing } from '../test-helpers/models-world'
import { Dna, Passphrase, boxWorldOf, makeVaultWorld, useVaultWorlds, buildTyping } from '../test-helpers/vault-world'

useVaultWorlds()

const Whisper = { apiKey: 'sk-test-0000', orgId: null }
const BoxDna = { ...Dna, boxlabel: 'anthropic_api_key', whisper: Whisper, sidecar: { account: 'work' } }

/** Box listings whose world is a real vault, born unlocked under `Passphrase`, over its vaultDB. */
async function sealWorld() {
  const vaultWorld = makeVaultWorld()
  const vault = await buildTyping(vaultWorld.listing, Dna, { passphraseClear: Passphrase })
  const boxesOf = () => new TestableBoxListing(boxWorldOf(vault), { ...vaultWorld.opts, scope: vault.scope })
  return { ...vaultWorld, vault, boxesOf, boxes: boxesOf() }
}

describe("a box sealed and unsealed through the vault's lease", () => {
  it("opens the whispers sealed by create and by a later put", async () => {
    const { boxes } = await sealWorld()
    const box = await boxes.create(BoxDna)
    expect(await box.extractWhisper()).to.deep.equal(Whisper)
    expect(JSON.stringify(box._cheat_central)).to.not.include('sk-test-0000')
    await box.put({ whisper: { apiKey: 'sk-test-1111' }, sidecar: { account: 'home' } })
    expect(await box.extractWhisper()).to.deep.equal({ apiKey: 'sk-test-1111' })
  })

  it("opens the sealed record in another listing, and opens it with its sidecar altered, as the seal leaves the sidecar out", async () => {
    const { boxes, boxesOf } = await sealWorld()
    const built = await boxes.create(BoxDna)
    const sealed = built._cheat_central
    const intact = boxesOf().deliverRecord(sealed)
    expect(await intact.extractWhisper()).to.deep.equal(Whisper)
    const altered = boxesOf().deliverRecord({ ...sealed, sidecar: { account: 'home' } } as BoxRecord)
    expect(await altered.extractWhisper()).to.deep.equal(Whisper)
    expect(altered.sidecar).to.deep.equal({ account: 'home' })
  })

  it("refuses 'damaged_whisper' when a field of the stamp is altered", async () => {
    const { boxes, boxesOf } = await sealWorld()
    const built = await boxes.create(BoxDna)
    const sealed = built._cheat_central
    const altered = boxesOf().deliverRecord({ ...sealed, written_at: sealed.written_at + 1 })
    await TH.expectRefusal(altered.extractWhisper(), 'damaged_whisper')
  })

  it("refuses 'vault_locked' at the seal and the unseal once the vault locks", async () => {
    const { boxes, vault } = await sealWorld()
    const box = await boxes.create(BoxDna)
    vault.lock()
    await TH.expectRefusal(box.extractWhisper(), 'vault_locked')
    await TH.expectRefusal(box.put({ whisper: { apiKey: 'sk-test-1111' }, sidecar: { account: 'home' } }), 'vault_locked')
  })
})
