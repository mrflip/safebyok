import { describe, it, expect, vi } from 'vitest'
import * as ZClassic from 'zod'
import { Box } from '../../src/box'
import { BoxRecord, type Whisper, type Sidecar } from '../../src/shapes/box'
import type { VaultError } from '../../src/errors'
import type { RequestCleartext } from '../../src/gating'
import { valOf } from '../../src/outcome'
import { Vault } from '../../src/vault'
import { heldLeaseOf, registerLeaseGetter } from '../../src/held-lease'
import { Lease } from '../../src/lease'
import { MaxWhisperBytes, MaxBoxes } from '../../src/shapes/bank-opts'
import { VaultScope } from '../../src/shapes/scopes'
import { FarFuture } from '../../src/consts'
import { MaxLabelChars, MaxUserIdChars } from '../../src/checks/primitives'
import { type VaultDB, jsonBytes } from '../../src/vault-db'
import { StoredBytesPerWhisperByte, BoxFieldsBytes, BoxFixedBytes } from '../../src/vault-opts'
import { cipherCtx, makeBoxKey, wrapKeyUnder, makeVaultKey, cipherBytes, randomBytes } from '../../src/crypto'
import { memoryDeviceDB } from '../../src/device-db'
import * as TH from '../test-helpers'
import { makeWorld, boxlabelsOf, storedRowOf, u1BoxScopepath, u1PlantedScopepath, storedVaultRecordOf, u1VaultScopepath, isU1Box } from './world'


// == [Storing and reading]: RoundTrips, putBox and getWhisper, times a vault keeps

const RoundTrips: readonly (readonly [Whisper, string])[] = [
  ["sk-ant-api03-fake",            'a string'],
  [42,                             'a number'],
  [false,                          'a boolean'],
  [["alpha", "beta"],              'an array'],
  [{ apiKey: "fake", tier: 2 },  'an object'],
  [{ orgId: null },                'an object holding a null'],
]

describe("putBox and getWhisper", () => {
  for (const [whisper, blurb] of RoundTrips) {
    it(`round-trips ${blurb}`, async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw')
      await vault.putBox({ boxlabel: 'the_box' }, whisper)
      expect(await vault.getWhisper('the_box')).to.deep.equal(whisper)
    })
  }

  it("keeps the summary public and the whisper out of it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'personal account' } }, 'sk-fake')
    const summary = vault.getSnapshot().boxes[0]
    expect(summary?.boxlabel).to.eq('anthropic')
    expect(summary?.sidecar).to.deep.equal({ note: 'personal account' })
    expect(summary).to.not.have.property('whisper')
  })

  it("freezes its own copy of a sidecar, never the caller's", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const sidecar = { note: 'work account', tags: ['atlas'] }
    const box = await vault.putBox({ boxlabel: 'anthropic', sidecar }, 'sk-fake')
    expect(Object.isFrozen(sidecar)).to.be.false
    expect(Object.isFrozen(sidecar.tags)).to.be.false
    expect(box.sidecar).to.deep.equal(sidecar)
  })

  it("replacing a whisper keeps the sidecar", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'keep me' } }, 'sk-old')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-new')
    expect(await vault.getWhisper('anthropic')).to.eq('sk-new')
    expect(vault.getSnapshot().boxes[0]?.sidecar).to.deep.equal({ note: 'keep me' })
  })

  it("refuses a whisper JSON cannot carry, quoting none of it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const sneaky = { apiKey: 'sk-ant-SUPERSECRET', when: new Date() }
    const err = await TH.expectRefusal(vault.putBox({ boxlabel: 'the_box' }, sneaky as unknown as Whisper), 'bad_whisper')
    expect(err.message).to.not.include('SUPERSECRET')
    await TH.expectRefusal(vault.putBox({ boxlabel: 'the_box' }, null as unknown as Whisper), 'bad_whisper')
    expect(vault.getSnapshot().boxes).to.have.lengthOf(0)
  })

  it("stores a whisper of exactly MaxWhisperBytes with its empty sidecar, and refuses one byte more, quoting none of it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    // A JSON string is its characters plus two quotes, and the empty sidecar, {}, is two bytes more.
    const atLimit = 'x'.repeat(MaxWhisperBytes - 4)
    await vault.putBox({ boxlabel: 'the_box' }, atLimit)
    expect(await vault.getWhisper('the_box')).to.eq(atLimit)
    const oneOver = `${'x'.repeat(MaxWhisperBytes - 9)}SECRET`
    const err = await TH.expectRefusal(vault.putBox({ boxlabel: 'the_box' }, oneOver), 'whisper_too_large')
    expect(err.message).to.not.include('SECRET')
    expect(await vault.getWhisper('the_box')).to.eq(atLimit)
  })

  it("counts the limit in bytes, not characters", async () => {
    const world = makeWorld()
    // Four é are eight bytes and two quotes; the empty sidecar, two more.
    const vault = await world.openUnlocked('pw', { maxWhisperBytes: 12 })
    await vault.putBox({ boxlabel: 'the_box' }, 'éééé')
    await TH.expectRefusal(vault.putBox({ boxlabel: 'other_box' }, 'ééééé'), 'whisper_too_large')
    expect(boxlabelsOf(vault)).to.deep.equal(['the_box'])
  })

  it("checks the limit on write only, so lowering it strands nothing already stored", async () => {
    const world = makeWorld()
    const roomy = await world.openUnlocked('pw')
    await roomy.putBox({ boxlabel: 'the_box' }, 'x'.repeat(100))
    TH.closeVault(roomy)
    const tight = await world.open({ maxWhisperBytes: 16 })
    expect(await tight.getWhisper('the_box')).to.eq('x'.repeat(100))
    await TH.expectRefusal(tight.putBox({ boxlabel: 'the_box' }, 'x'.repeat(100)), 'whisper_too_large')
  })

  it("refuses a maxWhisperBytes over half of what the adapter holds in one record", async () => {
    const world = makeWorld()
    const halfAMebibyte = world.vaultDB.maxRecordBytes / 2
    expect(halfAMebibyte).to.eq(524_288)
    await world.open({ maxWhisperBytes: halfAMebibyte })
    await TH.expectRefusal(world.open({ maxWhisperBytes: halfAMebibyte + 1 }), 'bad_option')
  })

  it("refuses a maxWhisperBytes that is not a whole number of bytes above zero", async () => {
    const world = makeWorld()
    for (const nonsense of [0, -1, 1.5, NaN]) {
      await TH.expectRefusal(world.open({ maxWhisperBytes: nonsense }), 'bad_option')
    }
  })

  it("refuses a malformed boxlabel before touching storage", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await TH.expectRefusal(vault.putBox({ boxlabel: 'not a label' }, 'whatever'), 'bad_scope')
  })

  it("refuses a get or a use of an absent box without quoting the boxlabel, which may be a key pasted by mistake; getBox of one resolves null", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    expect(await vault.getBox('sk_fake_pasted_by_mistake')).to.be.null
    const calls = [() => vault.getWhisper('sk_fake_pasted_by_mistake'), () => vault.useWhisper('sk_fake_pasted_by_mistake', (whisper) => whisper)]
    for (const call of calls) {
      const err = await TH.expectRefusal(call(), 'absent_box')
      expect(err.message).not.to.include('sk_fake_pasted_by_mistake')
    }
  })
})

describe("putBox, the box it seals and stores", () => {
  it("resolves the box as stored, stamped with the vault it lies in, as its first example shows", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const box = await vault.putBox({ boxlabel: 'anthropic_api_key', sidecar: { note: 'work account' } }, 'sk-ant-fake')
    expect(box).to.be.instanceOf(Box)
    expect(box).to.deep.include({ boxlabel: 'anthropic_api_key', sidecar: { note: 'work account' }, vault_tok: vault.vault_tok, gate_epoch: TH.cheatGetVaultEpoch(vault).gate_epoch })
    expect(box.record).to.deep.equal(BoxRecord.parse(storedRowOf(world, 'anthropic_api_key')))
    expect(box.baseRevisionTok).to.be.null
    expect(await box.extractWhisper()).to.eq('sk-ant-fake')
  })

  it("keeps the sidecar it has when the sidecar is left out, as its second example shows", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic_api_key', sidecar: { note: 'work account' } }, 'sk-ant-old')
    const box = await vault.putBox({ boxlabel: 'anthropic_api_key' }, 'sk-ant-new')
    expect(box.sidecar).to.deep.equal({ note: 'work account' })
    expect(await vault.getWhisper('anthropic_api_key')).to.eq('sk-ant-new')
  })

  it("keeps the whisper it has when the whisper is left out, changing the sidecar alone, as its third example shows", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const first = await vault.putBox({ boxlabel: 'anthropic_api_key', sidecar: { note: 'work account' } }, 'sk-ant-fake')
    world.advance(60_000)
    const box = await vault.putBox({ boxlabel: 'anthropic_api_key', sidecar: { note: 'personal' } })
    expect(box).to.deep.include({ sidecar: { note: 'personal' }, registered_at: first.registered_at, written_at: first.written_at + 60_000 })
    expect(box.revision_tok).to.not.eq(first.revision_tok)
    expect(await vault.getWhisper('anthropic_api_key')).to.eq('sk-ant-fake')
  })

  it("stores the stored box again when both are left out: a fresh revision of the same whisper and sidecar", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const first = await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'work account' } }, 'sk-fake')
    const again = await vault.putBox({ boxlabel: 'anthropic' })
    expect(again).to.deep.include({ sidecar: { note: 'work account' }, registered_at: first.registered_at })
    expect(again.revision_tok).to.not.eq(first.revision_tok)
    expect(await vault.getWhisper('anthropic')).to.eq('sk-fake')
  })

  it("refuses 'no_whisper' when the whisper is left out and no box is stored, writing nothing", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await TH.expectRefusal(vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'work account' } }), 'no_whisper')
    const leftOut: Whisper | undefined = undefined
    await TH.expectRefusal(vault.putBox({ boxlabel: 'anthropic' }, leftOut), 'no_whisper')
    expect(world.dbStore.scopepaths().filter((scopepath) => isU1Box(scopepath))).to.have.lengthOf(0)
  })

  it("refuses 'damaged_box' when the whisper is left out and the box will not open, writing nothing: there is no whisper to keep", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'work account' } }, 'sk-fake')
    const planted = JSON.stringify({ ...storedRowOf(world, 'anthropic'), sidecar: { note: 'planted' } })
    world.dbStore.put(u1BoxScopepath('anthropic'), planted)
    await TH.expectRefusal(vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'mended' } }), 'damaged_box')
    expect(world.dbStore.get(u1BoxScopepath('anthropic'))).to.eq(planted)
  })

  it("reads nothing for a whole store, writing over the revision the listing in hand shows and keeping its registered_at", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const first = await vault.putBox({ boxlabel: 'anthropic' }, 'sk-old')
    const reads = vi.spyOn(world.vaultDB, 'tryGetBox')
    const writes = vi.spyOn(world.vaultDB, 'tryPutBox')
    world.advance(60_000)
    const box = await vault.putBox({ boxlabel: 'anthropic', sidecar: {} }, 'sk-new')
    expect(reads).not.toHaveBeenCalled()
    expect(writes.mock.calls[0]?.[1]).to.deep.equal({ vault_tok: vault.vault_tok, revision_tok: first.revision_tok })
    expect(box.registered_at).to.eq(first.registered_at)
  })

  it("stores a whole box the listing does not show as a new one, over none", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const writes = vi.spyOn(world.vaultDB, 'tryPutBox')
    await vault.putBox({ boxlabel: 'anthropic', sidecar: {} }, 'sk-fake')
    expect(writes.mock.calls[0]?.[1]).to.deep.equal({ vault_tok: vault.vault_tok, revision_tok: null })
  })

  it("refuses a whole store over a listing a moment stale as 'stale_write', writing nothing: what another device wrote is kept", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { vaultDB: world.deafVaultDB() })
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-mine')
    const there = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    await there.putBox({ boxlabel: 'anthropic' }, 'sk-theirs')
    await TH.expectRefusal(vault.putBox({ boxlabel: 'anthropic', sidecar: {} }, 'sk-mine-again'), 'stale_write')
    expect(await there.getWhisper('anthropic')).to.eq('sk-theirs')
  })

  it("seals a box over the revision it read when the sidecar is left out, so a write landing elsewhere between refuses it as stale", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { vaultDB: world.deafVaultDB() })
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-mine')
    const there = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    await there.putBox({ boxlabel: 'anthropic', sidecar: { note: 'theirs' } }, 'sk-theirs')
    // The read finds their revision, and the store lands over it, keeping their sidecar.
    const box = await vault.putBox({ boxlabel: 'anthropic' }, 'sk-mine-again')
    expect(box.sidecar).to.deep.equal({ note: 'theirs' })
    expect(await there.getWhisper('anthropic')).to.eq('sk-mine-again')
  })
})

describe("vault.delBox, what it removed", () => {
  it("resolves what it removed, 'deleted' for the revision the snapshot listed, as its example shows", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic_api_key' }, 'sk-ant-fake')
    const deleted = await vault.delBox('anthropic_api_key')
    expect(deleted).to.deep.equal({ boxlabel: 'anthropic_api_key', vault_tok: vault.vault_tok, outcome: 'deleted' })
    expect(Object.isFrozen(deleted)).to.be.true
    vault.demandConsistentWith(deleted)
  })

  it("resolves 'deleted_other' for a revision another device wrote over the one listed, deleted all the same", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { vaultDB: world.deafVaultDB() })
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-mine')
    const there = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    await there.putBox({ boxlabel: 'anthropic' }, 'sk-theirs')
    const { outcome } = await vault.delBox('anthropic')
    expect(outcome).to.eq('deleted_other')
    expect(world.dbStore.get(u1BoxScopepath('anthropic'))).to.be.null
  })
})

describe("the lease a vault holds", () => {
  it("is no getter or field of the Vault object: the package reads it with heldLeaseOf, as its example shows, null once locked", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    expect('lease' in vault).to.be.false
    expect(heldLeaseOf(vault)?.vault_tok).to.eq(vault.vault_tok)
    await vault.lock()
    expect(heldLeaseOf(vault)).to.be.null
  })

  it("keeps the reader the Vault object registered as it was made: a second registration changes nothing", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    registerLeaseGetter(vault, () => null)
    expect(heldLeaseOf(vault)).to.not.be.null
  })

  it("deciphers what a box holds, as decipherWith's example shows: what box.extractWhisper does", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const box = await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const { box_key_wrapped: boxKeyWrapped, whisper_ciphered: whisperCiphered, ...visible } = box.record
    const lease = heldLeaseOf(vault)
    if (lease === null) { throw new Error('expected the vault to hold a lease') }
    const whisperBytes = await lease.decipherWith({ box_key_wrapped: boxKeyWrapped, whisper_ciphered: whisperCiphered }, visible)
    expect(new TextDecoder().decode(whisperBytes)).to.eq('"sk-fake"')
  })
})

/** A vault this device unlocked, holding a box, whose VaultDB hears no bells, and a second device on the same storage, which can delete and remake it. */
const remadeWorld = async () => {
  const world = makeWorld()
  const deaf = world.deafVaultDB()
  const vault = await world.openUnlocked('pw', { vaultDB: deaf })
  await vault.putBox({ boxlabel: 'anthropic' }, 'sk-mine')
  const there = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
  /** Delete and remake the vault from the second device, and have this one read the new life, which makes it gone as 'vault_remade'. */
  const remake = async () => {
    await TH.del(there, 'pw')
    const reborn = await TH.bankOf(there).ensureVault({ user_id: 'u1', vaultlabel: 'main' })
    await TH.unlock(reborn, 'pw two')
    await TH.expectBad(vault.tryHello({ staleMinutes: 0 }), 'vault_remade')
  }
  return { world, deaf, vault, remake }
}

describe("a box call whose vault is made anew elsewhere during its wait", () => {
  for (const [verb, call] of [
    ['getBox',  (vault: Vault) => vault.getWhisper('anthropic')],
    ['putBox',  (vault: Vault) => vault.putBox({ boxlabel: 'anthropic', sidecar: {} }, 'sk-mine-again')],
    ['delBox',  (vault: Vault) => vault.delBox('anthropic')],
  ] as const) {
    it(`refuses 'vault_remade' when the vault is made anew while ${verb} waits on storage, never what storage answered`, async () => {
      const { deaf, vault, remake } = await remadeWorld()
      const waiting = TH.holdNextCall(deaf, verb)
      const calling = call(vault)
      await waiting.reached
      await remake()
      waiting.release()
      await TH.expectRefusal(calling, 'vault_remade')
    })
  }
})

describe("the times a vault keeps", () => {
  it("stamps a new box's registered_at and written_at with the clock's time", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const storedAt = world.clock.now()
    expect(vault.getSnapshot().boxes[0]).to.include({ registered_at: storedAt, written_at: storedAt })
    expect(storedRowOf(world, 'anthropic')).to.include({ registered_at: storedAt, written_at: storedAt })
  })

  it("keeps registered_at when the whisper is replaced, and moves written_at", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-old')
    const storedAt = world.clock.now()
    world.advance(60_000)
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-new')
    expect(vault.getSnapshot().boxes[0]).to.include({ registered_at: storedAt, written_at: storedAt + 60_000 })
  })

  it("moves written_at when the same whisper is stored again: it says when the box was written, not whether it changed", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'openai' }, { apiKey: 'sk-fake', tier: 2 })
    const storedAt = world.clock.now()
    const before = vault.getSnapshot().boxes[0]
    world.advance(60_000)
    // The same whisper, its fields given in another order: it serializes the same.
    await vault.putBox({ boxlabel: 'openai', sidecar: { note: 'a new note' } }, { tier: 2, apiKey: 'sk-fake' })
    const after = vault.getSnapshot().boxes[0]
    expect(after).to.deep.include({ registered_at: storedAt, written_at: storedAt + 60_000, sidecar: { note: 'a new note' } })
    expect(after?.revision_tok).to.not.eq(before?.revision_tok)
  })

  it("writes over a previous record that will not open, carrying nothing from it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'work account' } }, 'sk-fake')
    const storedAt = world.clock.now()
    const row = storedRowOf(world, 'anthropic') as { whisper_ciphered: { ciphertext_b64: string } }
    row.whisper_ciphered.ciphertext_b64 = TH.tweakB64(row.whisper_ciphered.ciphertext_b64)
    world.dbStore.put(u1BoxScopepath('anthropic'), JSON.stringify(row))
    world.advance(60_000)
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    expect(vault.getSnapshot().boxes[0]).to.deep.include({ registered_at: storedAt + 60_000, written_at: storedAt + 60_000, sidecar: {} })
    expect(await vault.getWhisper('anthropic')).to.eq('sk-fake')
  })

  it("never seals a sidecar planted in storage into a fresh revision: a store over it without a sidecar writes {}", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'work account' } }, 'sk-fake')
    world.dbStore.put(u1BoxScopepath('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), sidecar: { note: 'INJECTED' } }))
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'damaged_box')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake-2')
    expect(await vault.getWhisper('anthropic')).to.eq('sk-fake-2')
    expect(vault.getSnapshot().boxes[0]?.sidecar).to.deep.equal({})
    expect(storedRowOf(world, 'anthropic')['sidecar']).to.deep.equal({})
    // A sidecar given with the store is written as given, over the planted one.
    world.dbStore.put(u1BoxScopepath('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), sidecar: { note: 'INJECTED' } }))
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'mended' } }, 'sk-fake-3')
    expect(vault.getSnapshot().boxes[0]?.sidecar).to.deep.equal({ note: 'mended' })
  })

  it("never carries forward a registered_at moved in storage: a store over it stamps now", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const planted = Date.UTC(2001, 0, 1)
    world.dbStore.put(u1BoxScopepath('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), registered_at: planted }))
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'damaged_box')
    world.advance(60_000)
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    expect(vault.getSnapshot().boxes[0]).to.include({ registered_at: world.clock.now(), written_at: world.clock.now() })
    expect(await vault.getWhisper('anthropic')).to.eq('sk-fake')
  })

  it("opens a box whose stored sidecar storage respaced or reordered, as a jsonb column does: the sidecar is bound as its JSON with keys sorted", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'respaced', sidecar: { note: 'work' } }, 'sk-fake-one')
    await vault.putBox({ boxlabel: 'reordered', sidecar: { alpha: 1, beta: { gamma: 3, delta: [2, 1] } } }, 'sk-fake-two')
    world.dbStore.put(u1BoxScopepath('respaced'), JSON.stringify(storedRowOf(world, 'respaced'), null, 2))
    world.dbStore.put(u1BoxScopepath('reordered'), JSON.stringify({ ...storedRowOf(world, 'reordered'), sidecar: { beta: { delta: [2, 1], gamma: 3 }, alpha: 1 } }))
    const fresh = await world.openUnlocked('pw')
    expect(fresh.getSnapshot().boxes.map((box) => box.boxlabel)).to.deep.equal(['reordered', 'respaced'])
    expect(fresh.getSnapshot().damagedBoxes).to.deep.equal([])
    expect(await fresh.getWhisper('respaced')).to.eq('sk-fake-one')
    expect(await fresh.getWhisper('reordered')).to.eq('sk-fake-two')
  })

  it("stamps the vault record's registered_at when the vault is made, and keeps it through a passphrase change", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    const madeAt = world.clock.now()
    expect(storedVaultRecordOf(world)).to.include({ registered_at: madeAt })
    world.advance(60_000)
    await TH.putWayin(vault, 'pw one', 'pw two')
    expect(storedVaultRecordOf(world)).to.include({ registered_at: madeAt, gate_epoch: 2 })
  })

  it("writes no created_at or updated_at, to a box or the vault record", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    for (const row of [storedRowOf(world, 'anthropic'), storedVaultRecordOf(world)]) {
      expect(row).to.not.have.any.keys('created_at', 'updated_at')
    }
  })

  it("writes whole milliseconds from a clock that returns fractions", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { clock: { now: () => world.clock.now() + 0.75 } })
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    expect(storedVaultRecordOf(world)).to.include({ registered_at: world.clock.now() })
    expect(storedRowOf(world, 'anthropic')).to.include({ registered_at: world.clock.now(), written_at: world.clock.now() })
  })

  it("refuses a stored box or vault record whose time holds a fraction of a millisecond, leaving the record as it is", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const box = JSON.stringify({ ...storedRowOf(world, 'anthropic'), written_at: world.clock.now() + 0.5 })
    world.dbStore.put(u1BoxScopepath('anthropic'), box)
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'damaged_box')
    expect(world.dbStore.get(u1BoxScopepath('anthropic'))).to.eq(box)
    const vaultRecord = JSON.stringify({ ...storedVaultRecordOf(world), registered_at: world.clock.now() + 0.5 })
    world.dbStore.put(u1VaultScopepath, vaultRecord)
    await TH.expectRefusal(world.open(), 'damaged_vault')
    expect(world.dbStore.get(u1VaultScopepath)).to.eq(vaultRecord)
  })

  it("never quotes the boxlabel of a damaged box it refuses, which may be a key pasted by mistake", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const pasted = 'sk_ant_fake_pasted_as_a_label'
    await vault.putBox({ boxlabel: pasted }, 'sk-fake')
    await vault.putBox({ boxlabel: 'other' }, 'sk-fake-two')
    const row = storedRowOf(world, pasted)
    world.dbStore.put(u1BoxScopepath(pasted), JSON.stringify({ ...row, written_at: world.clock.now() + 0.5 }))
    const storedDamaged = await TH.expectRefusal(vault.getWhisper(pasted), 'damaged_box')
    // The other box's ciphertext, moved under this boxlabel: it will not open here.
    world.dbStore.put(u1BoxScopepath(pasted), JSON.stringify({ ...row, whisper_ciphered: storedRowOf(world, 'other')['whisper_ciphered'] }))
    const unopened = await TH.expectRefusal(vault.getWhisper(pasted), 'damaged_box')
    expect(TH.thrownText(storedDamaged) + TH.thrownText(unopened)).to.not.include('sk_ant_fake')
  })

  it("refuses a stored box from before its times were renamed, leaving it as it is", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const { registered_at: _registered, written_at: _written, ...row } = storedRowOf(world, 'anthropic')
    const olden = JSON.stringify({ ...row, created_at: '2026-10-14T00:00:00.000Z', updated_at: '2026-10-14T00:00:00.000Z' })
    world.dbStore.put(u1BoxScopepath('anthropic'), olden)
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'damaged_box')
    expect(world.dbStore.get(u1BoxScopepath('anthropic'))).to.eq(olden)
  })

  it("refuses stored vault record from before its time was renamed, leaving it as it is", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const { registered_at: _registered, ...row } = storedVaultRecordOf(world)
    const olden = JSON.stringify({ ...row, created_at: '2026-10-14T00:00:00.000Z', updated_at: '2026-10-14T00:00:00.000Z' })
    world.dbStore.put(u1VaultScopepath, olden)
    await TH.expectRefusal(world.open(), 'damaged_vault')
    expect(world.dbStore.get(u1VaultScopepath)).to.eq(olden)
  })
})
// --

// == [Sidecar]: the sidecar

describe("the sidecar", () => {
  it("is {} in the summary and the stored row of a box given none", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    expect(vault.getSnapshot().boxes[0]?.sidecar).to.deep.equal({})
    expect(storedRowOf(world, 'anthropic')['sidecar']).to.deep.equal({})
  })

  it("is written whether given as {} or left out, so the two bind the same, and a row without one is damaged", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'omitted' }, 'sk-fake-one')
    await vault.putBox({ boxlabel: 'emptied', sidecar: {} }, 'sk-fake-two')
    expect(storedRowOf(world, 'omitted')['sidecar']).to.deep.equal({})
    expect(storedRowOf(world, 'emptied')['sidecar']).to.deep.equal({})
    const { sidecar: _gone, ...sidecarless } = storedRowOf(world, 'omitted')
    world.dbStore.put(u1BoxScopepath('omitted'), JSON.stringify(sidecarless))
    const fresh = await world.open()
    expect(fresh.getSnapshot().damagedBoxes[0]).to.deep.include({ boxlabel: 'omitted', damage: 'damaged' })
    expect(await fresh.getWhisper('emptied')).to.eq('sk-fake-two')
  })

  it("is stored as the JSON value given, and handed back in the summary as that value", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const sidecar = { project: 'atlas', note: 'work account', tags: ['billing', null], limit: 2.5 }
    await vault.putBox({ boxlabel: 'anthropic', sidecar }, 'sk-fake')
    expect(storedRowOf(world, 'anthropic')['sidecar']).to.deep.equal(sidecar)
    expect(vault.getSnapshot().boxes[0]?.sidecar).to.deep.equal(sidecar)
    const again = await world.open()
    expect(again.getSnapshot().boxes[0]?.sidecar).to.deep.equal(sidecar)
  })

  it("takes a JSON object of any JSON values, never interpreting it: text with a control character, null, an array", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const sidecars: Sidecar[] = [{ note: 'beep\u{7}' }, { gone: null }, { list: [1, 'two'] }, { count: 42 }]
    for (const [ii, sidecar] of sidecars.entries()) {
      await vault.putBox({ boxlabel: `box${String(ii)}`, sidecar }, 'sk-fake')
    }
    expect(vault.getSnapshot().boxes.map((box) => box.sidecar)).to.deep.equal(sidecars)
  })

  it("leaving it out keeps the stored sidecar; {} empties it; another sidecar replaces it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'work account' } }, 'sk-one')
    await vault.putBox({ boxlabel: 'anthropic', sidecar: undefined }, 'sk-two')
    expect(vault.getSnapshot().boxes[0]?.sidecar).to.deep.equal({ note: 'work account' })
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'personal' } }, 'sk-three')
    expect(vault.getSnapshot().boxes[0]?.sidecar).to.deep.equal({ note: 'personal' })
    await vault.putBox({ boxlabel: 'anthropic', sidecar: {} }, 'sk-four')
    expect(vault.getSnapshot().boxes[0]?.sidecar).to.deep.equal({})
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-five')
    expect(vault.getSnapshot().boxes[0]?.sidecar).to.deep.equal({})
  })

  it("refuses a sidecar that is no JSON object, or holds what JSON cannot carry, with kind 'bad_option', writing nothing and quoting none of it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const unfit = [{ when: new Date() }, { nested: { hook: () => 'SUPERSECRET' } }, { count: NaN }, new Map([['a', 1]])]
    // A sidecar is always a JSON object: JSON that is none is refused alike.
    const unobject = ['SUPERSECRET', null, ['SUPERSECRET'], 42, true]
    for (const sidecar of [...unfit, ...unobject]) {
      const err = await TH.expectRefusal(vault.putBox({ boxlabel: 'anthropic', sidecar: sidecar as unknown as Sidecar }, 'sk-fake'), 'bad_option')
      expect(err.message).to.include('sidecar')
      expect(TH.thrownText(err)).to.not.include('SUPERSECRET')
    }
    expect(world.dbStore.scopepaths().filter((scopepath) => isU1Box(scopepath))).to.have.lengthOf(0)
  })

  it("refuses a prop beside `boxlabel` and `sidecar`, or props that are no object, as 'bad_option', writing nothing: a note is kept in the sidecar, not beside it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const misfits = [{ boxlabel: 'anthropic', note: 'work account' }, { boxlabel: 'anthropic', sidcar: { note: 'work account' } }, { boxlabel: 'anthropic', sidecar: {}, note: 'work account' }]
    for (const props of misfits) {
      const err = await TH.expectRefusal(vault.putBox(props, 'sk-fake'), 'bad_option')
      expect(err.message).to.include('it takes only boxlabel, sidecar')
      expect(err.message).to.not.include('work account')
    }
    const unbagged = await TH.expectRefusal(vault.putBox('work account' as never, 'sk-fake'), 'bad_option')
    expect(unbagged.message).to.include('expected object')
    expect(unbagged.message).to.not.include('work account')
    expect(world.dbStore.scopepaths().filter((scopepath) => isU1Box(scopepath))).to.have.lengthOf(0)
    await vault.putBox({ boxlabel: 'anthropic', sidecar: undefined }, 'sk-fake')
    expect(vault.getSnapshot().boxes[0]?.sidecar).to.deep.equal({})
  })

  it("counts toward maxWhisperBytes with the whisper, refusing the two together as 'whisper_too_large'", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { maxWhisperBytes: 64 })
    // '"' plus 30 characters plus '"': 32 bytes of whisper JSON, and {"note":"..."} around a 20-character note: 31 bytes of sidecar.
    const whisper = 'w'.repeat(30)
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'n'.repeat(20) } }, whisper)
    const err = await TH.expectRefusal(vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'n'.repeat(22) } }, whisper), 'whisper_too_large')
    expect(err.message).to.include('sidecar')
    expect(err.message).to.not.include('nnnn')
    // A sidecar kept from the box counts as much as one given.
    await TH.expectRefusal(vault.putBox({ boxlabel: 'anthropic' }, `${whisper}ww`), 'whisper_too_large')
    expect(vault.getSnapshot().boxes[0]?.sidecar).to.deep.equal({ note: 'n'.repeat(20) })
  })

  it("refuses a sidecar over maxWhisperBytes alone, its whisper left out, before raising a gating", async () => {
    const world = makeWorld()
    const warm = await world.openUnlocked('pw', { maxWhisperBytes: 64 })
    await warm.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    await warm.lock()
    const requestCleartext = vi.fn<RequestCleartext>()
    const cold = await world.open({ maxWhisperBytes: 64, requestCleartext })
    await TH.expectRefusal(cold.putBox({ boxlabel: 'anthropic', sidecar: { note: 'n'.repeat(60) } }), 'whisper_too_large')
    expect(requestCleartext).not.toHaveBeenCalled()
  })

  it("weighs a sidecar kept from the box before any key is made for the new one (Contract: vault.putBox, Does)", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { maxWhisperBytes: 64 })
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'n'.repeat(20) } }, 'w'.repeat(30))
    const generateKey = vi.spyOn(crypto.subtle, 'generateKey')
    const encrypt = vi.spyOn(crypto.subtle, 'encrypt')
    try {
      await TH.expectRefusal(vault.putBox({ boxlabel: 'anthropic' }, 'w'.repeat(32)), 'whisper_too_large')
      expect(generateKey).not.toHaveBeenCalled()
      expect(encrypt).not.toHaveBeenCalled()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it("is shown while locked, the stored sidecar as storage holds it", async () => {
    const world = makeWorld()
    const warm = await world.openUnlocked('pw')
    await warm.putBox({ boxlabel: 'anthropic', sidecar: { note: 'visible while locked' } }, 'sk-fake')
    await warm.lock()
    const cold = await world.open()
    expect(TH.stateOf(cold.getSnapshot())).to.eq('locked')
    expect(cold.getSnapshot().boxes[0]?.sidecar).to.deep.equal({ note: 'visible while locked' })
  })

  it("is written beside the whisper's codec, json_v1, and its schema version, 1", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, { apiKey: 'sk-fake' })
    expect(storedRowOf(world, 'anthropic')).to.include({ format: 'safebyok-box-v8', whisper_codec: 'json_v1', whisper_schema_version: 1 })
  })
})
// --

// == [Box limit]: declaringVaultBytes, declaringBoxes, heaviestRowOf, the box limit

/**
 * `vaultDB` declaring `maxVaultBytes` as given, and otherwise itself: the in-tree local adapters
 * set no limit on a vault, and the limit's check wants one that does.
 */
const declaringVaultBytes = (vaultDB: VaultDB, maxVaultBytes: unknown): VaultDB => (
  Object.create(vaultDB, { maxVaultBytes: { value: maxVaultBytes } }) as VaultDB
)

/**
 * `vaultDB` declaring `maxBoxes` as given, and otherwise itself: the in-tree local adapters
 * count no boxes, and the limit's checks want one that does.
 */
const declaringBoxes = (vaultDB: VaultDB, maxBoxes: unknown): VaultDB => (
  Object.create(vaultDB, { maxBoxes: { value: maxBoxes } }) as VaultDB
)

/**
 * A box row as a backend files it, with every field but the whisper and its sidecar at its
 * largest: the longest labels, a user_id of 100 UTF-16 code units at three UTF-8 bytes apiece, the
 * latest times, real ciphertext of `whisperBytes` random bytes, and
 * `sidecar` as its sidecar.
 */
const heaviestRowOf = async (whisperBytes: number, sidecar: Sidecar = {}) => {
  const ctx = cipherCtx({ test: 'heaviest_row' }, 'a test ctx')
  const boxKey = await makeBoxKey()
  return {
    applabel:               'a'.repeat(40),
    user_id:                'u'.repeat(MaxUserIdChars),
    vaultlabel:             'v'.repeat(40),
    format:                 'safebyok-box-v8',
    boxlabel:               'b'.repeat(40),
    revision_tok:           crypto.randomUUID(),
    box_key_wrapped:        await wrapKeyUnder(await makeVaultKey(), boxKey, ctx),
    whisper_ciphered:       await cipherBytes(boxKey, randomBytes(whisperBytes), ctx),
    whisper_codec:          'json_v1',
    whisper_schema_version: 1,
    sidecar,
    registered_at:          FarFuture,
    written_at:             FarFuture,
  }
}

/**
 * The heaviest whisper and sidecar a vault of `limitBytes` (its `maxWhisperBytes`) stores, two
 * ways: all whisper, beside an empty sidecar; and a one-byte whisper beside a sidecar holding a
 * string of double quotes, each escaped in its JSON, so the string runs to twice its length
 * there -- or beside `{}`, where the limit leaves no room for one.
 */
const heaviestSplitsOf = (limitBytes: number) => {
  // `{"":""}` is seven bytes of JSON, and the one-byte whisper beside it makes eight.
  const quotes = Math.floor((limitBytes - 8) / 2)
  return [
    { whisperBytes: limitBytes - 2, sidecar: {} },
    { whisperBytes: 1, sidecar: quotes < 0 ? {} : { '': '"'.repeat(quotes) } },
  ]
}

describe("the box limit", () => {
  it("stores up to maxBoxes, then refuses a new box as 'vault_full', quoting none of its label", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { maxBoxes: 2 })
    await vault.putBox({ boxlabel: 'openai' }, 'sk-fake-one')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-two')
    const err = await TH.expectRefusal(vault.putBox({ boxlabel: 'secret_project_x' }, 'sk-fake-three'), 'vault_full')
    expect(err.message).to.include('2 boxes')
    expect(err.message).to.not.include('secret_project_x')
    expect(boxlabelsOf(vault)).to.deep.equal(['anthropic', 'openai'])
    expect(world.dbStore.scopepaths().filter((scopepath) => scopepath.includes('secret_project_x'))).to.have.lengthOf(0)
  })

  it("holds MaxBoxes, 100, unless told otherwise", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    for (let ii = 0; ii < MaxBoxes; ii++) { await vault.putBox({ boxlabel: `box_${String(ii)}` }, `sk-fake-${String(ii)}`) }
    expect(vault.getSnapshot().boxes).to.have.lengthOf(100)
    await TH.expectRefusal(vault.putBox({ boxlabel: 'one_more' }, 'sk-fake'), 'vault_full')
  })

  it("never refuses a replacement for room: a full vault still takes a new whisper in a box it holds", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { maxBoxes: 1 })
    await vault.putBox({ boxlabel: 'openai' }, 'sk-fake-old')
    await vault.putBox({ boxlabel: 'openai' }, 'sk-fake-new')
    expect(await vault.getWhisper('openai')).to.eq('sk-fake-new')
  })

  it("deleting a box makes room for the next new one", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { maxBoxes: 1 })
    await vault.putBox({ boxlabel: 'openai' }, 'sk-fake-one')
    await TH.expectRefusal(vault.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake'), 'vault_full')
    await vault.delBox('openai')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake')
    expect(boxlabelsOf(vault)).to.deep.equal(['anthropic'])
  })

  it("checks the limit on a new box only, so lowering it strands nothing already stored", async () => {
    const world = makeWorld()
    const roomy = await world.openUnlocked('pw')
    for (const boxlabel of ['one', 'two', 'three']) { await roomy.putBox({ boxlabel }, `sk-fake-${boxlabel}`) }
    TH.closeVault(roomy)
    const tight = await world.open({ maxBoxes: 2 })
    expect(await tight.getWhisper('three')).to.eq('sk-fake-three')
    await tight.putBox({ boxlabel: 'three' }, 'sk-fake-replaced')
    await tight.delBox('one')
    await TH.expectRefusal(tight.putBox({ boxlabel: 'four' }, 'sk-fake-four'), 'vault_full')
    await tight.delBox('two')
    await tight.putBox({ boxlabel: 'four' }, 'sk-fake-four')
    expect(boxlabelsOf(tight)).to.deep.equal(['four', 'three'])
  })

  it("counts the boxes other devices have stored", async () => {
    const world = makeWorld()
    const here = await world.openUnlocked('pw', { maxBoxes: 2 })
    const there = await world.open()
    await there.putBox({ boxlabel: 'openai' }, 'sk-fake-one')
    await there.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-two')
    await vi.waitFor(() => { expect(here.getSnapshot().boxes).to.have.lengthOf(2) })
    await TH.expectRefusal(here.putBox({ boxlabel: 'mistral' }, 'sk-fake-three'), 'vault_full')
  })

  it("counts from the listing in hand, reading nothing first: room another device made unheard is found by a hello", async () => {
    const world = makeWorld()
    // This handle hears nothing pushed from storage, so its snapshot falls behind.
    vi.spyOn(world.vaultDB, 'subscribe').mockReturnValueOnce(() => { /* nothing to unsubscribe */ })
    const here = await world.openUnlocked('pw', { maxBoxes: 1 })
    await here.putBox({ boxlabel: 'openai' }, 'sk-fake-one')
    const there = await world.open()
    await there.delBox('openai')
    expect(boxlabelsOf(here)).to.deep.equal(['openai'])
    const reads = vi.spyOn(world.vaultDB, 'tryGetVault')
    await TH.expectRefusal(here.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake'), 'vault_full')
    expect(reads).not.toHaveBeenCalled()
    await here.hello({ staleMinutes: 0 })
    await here.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake')
    expect(boxlabelsOf(here)).to.deep.equal(['anthropic'])
  })

  it("opens with the defaults on a backend holding 8 MiB of a vault, as Convex does", async () => {
    const world = makeWorld()
    expect(await world.stateOnOpen({ vaultDB: declaringVaultBytes(world.vaultDB, 8 * 1024 * 1024) })).to.eq('novel')
  })

  it("refuses a maxBoxes and maxWhisperBytes the adapter might not hold together, naming both and its limit", async () => {
    const world = makeWorld()
    const vaultDB = declaringVaultBytes(world.vaultDB, 8 * 1024 * 1024)
    const err = await TH.expectRefusal(world.open({ vaultDB, maxBoxes: 103 }), 'bad_option')
    expect(err.message).to.include('maxBoxes')
    expect(err.message).to.include('maxWhisperBytes')
    expect(err.message).to.include('8388608 bytes')
    expect(err.message).to.include('at most 102 boxes')
  })

  it("lets the host raise either limit while the pair still fits", async () => {
    const world = makeWorld()
    const vaultDB = declaringVaultBytes(world.vaultDB, 8 * 1024 * 1024)
    await world.open({ vaultDB, maxBoxes: 1000, maxWhisperBytes: 3000 })
    await world.open({ vaultDB, maxBoxes: 1, maxWhisperBytes: 500_000 })
    await TH.expectRefusal(world.open({ vaultDB, maxBoxes: 1000, maxWhisperBytes: 4000 }), 'bad_option')
  })

  it("counts room for each box's other fields, so a vault of tiny whispers cannot be made unerasable", async () => {
    const world = makeWorld()
    const vaultDB = declaringVaultBytes(world.vaultDB, 8 * 1024 * 1024)
    await world.open({ vaultDB, maxBoxes: 8176, maxWhisperBytes: 1 })
    await TH.expectRefusal(world.open({ vaultDB, maxBoxes: 8177, maxWhisperBytes: 1 }), 'bad_option')
  })

  for (const limitBytes of [3, 100, 2048, MaxWhisperBytes]) {
    it(`counts room enough for a box of ${String(limitBytes)} whisper and sidecar bytes, its other fields at their largest`, async () => {
      for (const { whisperBytes, sidecar } of heaviestSplitsOf(limitBytes)) {
        const row = await heaviestRowOf(whisperBytes, sidecar)
        const { applabel, user_id, vaultlabel, ...box } = row
        expect(BoxRecord.safeParse(box).success).to.be.true
        expect(VaultScope.safeParse({ applabel, user_id, vaultlabel }).success).to.be.true
        const rowBytes = new TextEncoder().encode(JSON.stringify(row)).length
        expect(rowBytes).to.be.at.most((limitBytes * StoredBytesPerWhisperByte) + BoxFieldsBytes)
      }
    })
  }

  it("refuses a maxBoxes that is not a whole number above zero", async () => {
    const world = makeWorld()
    for (const nonsense of [0, -1, 1.5, NaN]) {
      await TH.expectRefusal(world.open({ maxBoxes: nonsense }), 'bad_option')
    }
  })

  it("refuses an adapter that declares no maxVaultBytes, no maxRecordBytes, or no maxBoxes", async () => {
    const world = makeWorld()
    for (const undeclared of [undefined, NaN, 0, -1]) {
      const noVaultLimit = await TH.expectRefusal(world.open({ vaultDB: declaringVaultBytes(world.vaultDB, undeclared) }), 'bad_option')
      expect(noVaultLimit.message).to.include('maxVaultBytes')
      const noRecordLimit = Object.create(world.vaultDB, { maxRecordBytes: { value: undeclared } }) as VaultDB
      const err = await TH.expectRefusal(world.open({ vaultDB: noRecordLimit }), 'bad_option')
      expect(err.message).to.include('maxRecordBytes')
      const noBoxLimit = await TH.expectRefusal(world.open({ vaultDB: declaringBoxes(world.vaultDB, undeclared) }), 'bad_option')
      expect(noBoxLimit.message).to.include('does not declare maxBoxes')
    }
  })

  it("refuses an adapter whose maxBoxes is no whole number, or past the largest it keeps", async () => {
    const world = makeWorld()
    for (const misdeclared of [1.5, '100', -Infinity, Number.MAX_SAFE_INTEGER + 2]) {
      await TH.expectRefusal(world.open({ vaultDB: declaringBoxes(world.vaultDB, misdeclared) }), 'bad_option')
    }
  })

  it("refuses a maxBoxes over the adapter's own, naming the adapter's", async () => {
    const world = makeWorld()
    const vaultDB = declaringBoxes(world.vaultDB, 50)
    expect(await world.stateOnOpen({ vaultDB, maxBoxes: 50 })).to.eq('novel')
    const err = await TH.expectRefusal(world.open({ vaultDB, maxBoxes: 51 }), 'bad_option')
    expect(err.message).to.include('maxBoxes')
    expect(err.message).to.include('50 boxes')
  })

  it("holds the adapter's own maxBoxes, unless told otherwise, when it is under MaxBoxes", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { vaultDB: declaringBoxes(world.vaultDB, 2) })
    await vault.putBox({ boxlabel: 'openai' }, 'sk-fake-one')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-two')
    const err = await TH.expectRefusal(vault.putBox({ boxlabel: 'mistral' }, 'sk-fake-three'), 'vault_full')
    expect(err.message).to.include('2 boxes')
  })

  it("holds MaxBoxes, unless told otherwise, on an adapter holding more", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { vaultDB: declaringBoxes(world.vaultDB, 8000) })
    for (let ii = 0; ii < MaxBoxes; ii++) { await vault.putBox({ boxlabel: `box_${String(ii)}` }, `sk-fake-${String(ii)}`) }
    const err = await TH.expectRefusal(vault.putBox({ boxlabel: 'one_more' }, 'sk-fake'), 'vault_full')
    expect(err.message).to.include(`${String(MaxBoxes)} boxes`)
  })

  it("takes an adapter's Infinity, or a large whole number, for no limit on its boxes", async () => {
    const world = makeWorld()
    expect(world.vaultDB.maxBoxes).to.eq(Infinity)
    expect(await world.stateOnOpen({ maxBoxes: 1_000_000_000 })).to.eq('novel')
    const unlimitedish = declaringBoxes(world.vaultDB, 1_200_300_400_500_600)
    expect(await world.stateOnOpen({ vaultDB: unlimitedish, maxBoxes: 1_000_000_000 })).to.eq('novel')
    const err = await TH.expectRefusal(world.open({ vaultDB: unlimitedish, maxBoxes: 1_200_300_400_500_601 }), 'bad_option')
    expect(err.message).to.include('1200300400500600 boxes')
  })

  it("takes an adapter's Infinity, for no limit, as the largest finite limit, so nothing past Bank.make holds Infinity", async () => {
    const world = makeWorld()
    const unlimited = String(Number.MAX_SAFE_INTEGER)
    expect(world.vaultDB.maxVaultBytes).to.eq(Infinity)
    await world.open({ maxBoxes: 1_000_000_000 })
    const tooManyBoxes = await TH.expectRefusal(world.open({ maxBoxes: 9_000_000_000_000 }), 'bad_option')
    expect(tooManyBoxes.message).to.include(`${unlimited} bytes`)
    expect(tooManyBoxes.message).to.not.include('Infinity')
    const noRecordLimit = Object.create(world.vaultDB, { maxRecordBytes: { value: Infinity } }) as VaultDB
    await world.open({ vaultDB: noRecordLimit, maxBoxes: 1, maxWhisperBytes: 1_000_000_000 })
    const tooLarge = await TH.expectRefusal(world.open({ vaultDB: noRecordLimit, maxWhisperBytes: Number.MAX_SAFE_INTEGER }), 'bad_option')
    expect(tooLarge.message).to.include(`${unlimited} bytes`)
    expect(tooLarge.message).to.not.include('Infinity')
  })

  it("says so plainly when not even one box of that maxWhisperBytes fits", async () => {
    const world = makeWorld()
    const vaultDB = declaringVaultBytes(world.vaultDB, world.vaultDB.maxRecordBytes)
    const err = await TH.expectRefusal(world.open({ vaultDB, maxWhisperBytes: 524_288 }), 'bad_option')
    expect(err.message).to.include('not even one box fits')
    expect(err.message).to.not.include('at most 0')
  })
})
// --

// == [Names]: the vault's names

describe("the vault's names", () => {
  it("refuse a boxlabel that is not a label as 'bad_scope' in every call that takes one, naming the field and quoting none of it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const calls = [
      () => vault.putBox({ boxlabel: 'Secret Project' }, 'sk-fake'), () => vault.getBox('Secret Project'), () => vault.getWhisper('Secret Project'),
      () => vault.useWhisper('Secret Project', (whisper) => whisper), () => vault.delBox('Secret Project'),
    ]
    for (const call of calls) {
      const err = await TH.expectRefusal(call(), 'bad_scope')
      expect(err.message).to.match(/^boxlabel: A label is/)
      expect(err.meta?.fieldnames).to.deep.equal(['boxlabel'])
      expect(TH.thrownText(err)).to.not.include('Secret')
    }
    expect(boxlabelsOf(vault)).to.deep.equal(['anthropic'])
  })

  it("never let a name hold ^, which a scopepath joins names on: refused at ensureVault and at putBox()", async () => {
    const world = makeWorld()
    const err = await TH.expectRefusal(world.open({ user_id: 'alice^admin' }), 'bad_scope')
    expect(err.message).to.match(/^user_id: A user_id is ASCII letters/)
    expect(TH.thrownText(err)).to.not.include('alice')
    await TH.expectRefusal(world.open({ vaultlabel: 'main^x' }), 'bad_scope')
    const vault = await world.openUnlocked('pw')
    const stored = await TH.expectRefusal(vault.putBox({ boxlabel: 'anthro^pic' }, 'sk-fake'), 'bad_scope')
    expect(stored.message).to.include('boxlabel')
    expect(boxlabelsOf(vault)).to.deep.equal([])
  })

  it("refuse a user_id of 101 characters at ensureVault, and take one of 100", async () => {
    const world = makeWorld()
    const err = await TH.expectRefusal(world.open({ user_id: 'u'.repeat(MaxUserIdChars + 1) }), 'bad_scope')
    expect(err.message).to.include('at most 100 characters')
    expect(await world.stateOnOpen({ user_id: 'u'.repeat(MaxUserIdChars) })).to.eq('novel')
  })

  it("take a user_id percent-encoded, an email address, or a provider's id, and refuse dots alone", async () => {
    const world = makeWorld()
    for (const user_id of ['alice%40example.com', 'alice+vault@example.com', 'auth0|5f7c8ec7', '~alice']) {
      expect(await world.stateOnOpen({ user_id }), user_id).to.eq('novel')
    }
    await TH.expectRefusal(world.open({ user_id: '..' }), 'bad_scope')
  })

  it("are the package's own: Bank.make refuses a validators option as 'bad_option', as it does any option it does not take", async () => {
    const world = makeWorld()
    await TH.expectRefusal(world.open({ validators: { boxlabel: ZClassic.string() } } as never), 'bad_option')
  })

  it("never list a row planted under a name that is not a label, which no call could reach", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    for (const planted of ['OpenAI: work', 'key \u{D83D}', 'bell\u{7}']) {
      world.dbStore.put(u1PlantedScopepath(planted), JSON.stringify({ ...storedRowOf(world, 'anthropic'), boxlabel: planted }))
    }
    const fresh = await world.openUnlocked('pw')
    expect(boxlabelsOf(fresh)).to.deep.equal(['anthropic'])
    await TH.expectRefusal(fresh.delBox('OpenAI: work'), 'bad_scope')
    await TH.expectRefusal(fresh.getWhisper('bell\u{7}'), 'bad_scope')
  })
})
// --

// == [Weight, locked, useWhisper]: LongestNames, declaringRecordBytes, what a box weighs, while locked, useWhisper

/** The longest names a vault takes: forty characters for each label, a hundred for the user_id. */
const LongestNames = { applabel: 'a'.repeat(MaxLabelChars), user_id: 'u'.repeat(MaxUserIdChars), vaultlabel: 'v'.repeat(MaxLabelChars) } as const

/** `vaultDB` declaring `maxRecordBytes` as given, and otherwise itself. */
const declaringRecordBytes = (vaultDB: VaultDB, maxRecordBytes: number): VaultDB => (
  Object.create(vaultDB, { maxRecordBytes: { value: maxRecordBytes } }) as VaultDB
)

describe("what a box weighs in storage", () => {
  it("stores a box at its whisper limit beside the longest names, in a record storage holds, and fills a vault to maxBoxes so", async () => {
    const world = makeWorld()
    const vaultDB = declaringVaultBytes(declaringRecordBytes(world.vaultDB, 2048), 3 * ((1024 * StoredBytesPerWhisperByte) + BoxFieldsBytes))
    const vault = await world.openUnlocked('pw', { vaultDB, maxWhisperBytes: 1024, maxBoxes: 3, ...LongestNames })
    for (const ii of [1, 2, 3]) {
      await vault.putBox({ boxlabel: String(ii).padStart(MaxLabelChars, 'b'), sidecar: { note: 'n'.repeat(990) } }, 'sk-fake')
    }
    expect(boxlabelsOf(vault)).to.have.lengthOf(3)
    await TH.expectRefusal(vault.putBox({ boxlabel: 'four' }, 'sk-fake'), 'vault_full')
  })

  for (const limitBytes of [3, 100, 2048, MaxWhisperBytes]) {
    it(`weighs a box of ${String(limitBytes)} whisper and sidecar bytes, its names at their longest, at no less than it stores as`, async () => {
      for (const { whisperBytes, sidecar } of heaviestSplitsOf(limitBytes)) {
        const row = await heaviestRowOf(whisperBytes, sidecar)
        const { applabel, user_id, vaultlabel, boxlabel } = row
        const weight = (limitBytes * StoredBytesPerWhisperByte) + BoxFixedBytes + jsonBytes([{ applabel, user_id, vaultlabel }, boxlabel])
        expect(jsonBytes(row)).to.be.at.most(weight)
      }
    })
  }

  it("plans no less at Bank.make than a store weighs a box at the default checks' longest", async () => {
    const { applabel, user_id, vaultlabel, boxlabel } = await heaviestRowOf(1)
    expect(BoxFixedBytes + jsonBytes([{ applabel, user_id, vaultlabel }, boxlabel])).to.be.at.most(BoxFieldsBytes)
  })
})

describe("while locked", () => {
  it("every whisper-touching operation refuses with kind 'vault_locked'", async () => {
    const world = makeWorld()
    const warm = await world.openUnlocked('pw')
    await warm.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    await warm.lock()
    await TH.expectRefusal(warm.getWhisper('anthropic'), 'vault_locked')
    await TH.expectRefusal(warm.putBox({ boxlabel: 'anthropic' }, 'sk-new'), 'vault_locked')
    await TH.expectRefusal(warm.useWhisper('anthropic', (whisper) => whisper), 'vault_locked')
    await TH.expectRefusal(warm.delBox('anthropic'), 'vault_locked')
  })

  it("box summaries stay readable: that is what their visible fields are for", async () => {
    const world = makeWorld()
    const warm = await world.openUnlocked('pw')
    await warm.putBox({ boxlabel: 'anthropic', sidecar: { note: 'visible while locked' } }, 'sk-fake')
    await warm.lock()
    const cold = await world.open()
    expect(TH.stateOf(cold.getSnapshot())).to.eq('locked')
    expect(boxlabelsOf(cold)).to.deep.equal(['anthropic'])
  })
})

describe("vault.getBox", () => {
  it("hands back the sealed box under a boxlabel, as its example shows", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'work account' } }, 'sk-fake')
    const box = await gotBox(vault)
    expect(box).to.be.instanceOf(Box)
    expect(box.boxlabel).to.eq('anthropic')
    expect(box.sidecar).to.deep.equal({ note: 'work account' })
    expect(box.record).to.deep.equal(storedBoxOf(world))
    expect(await box.extractWhisper()).to.eq('sk-fake')
  })

  it("resolves null where no box is stored, as its example shows", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    expect(await vault.getBox('anthropic')).to.be.null
  })

  it("stamps the box it hands back with the vault as it stood at the read: its scope, vault_tok and epochs", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const box = await gotBox(vault)
    expect(TH.scopeOf('u1')).to.deep.include({ applabel: box.applabel, user_id: box.user_id, vaultlabel: box.vaultlabel })
    expect({ vault_tok: box.vault_tok, vault_epoch: box.vault_epoch, gate_epoch: box.gate_epoch }).to.deep.equal({ vault_tok: TH.cheatGetVaultEpoch(vault).vault_tok, vault_epoch: TH.cheatGetVaultEpoch(vault).vault_epoch, gate_epoch: TH.cheatGetVaultEpoch(vault).gate_epoch })
    vault.demandConsistentWith(box, { leaseBound: true })
  })

  it("keeps the whisper sealed: nothing of it is in the box but its ciphertext", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake-whisper')
    expect(JSON.stringify(await vault.getBox('anthropic'))).to.not.include('sk-fake-whisper')
  })

  it("resolves the box as an Outcome's val from tryGetBox", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const { ok, val: box } = await vault.tryGetBox('anthropic')
    expect(ok).to.eq(true)
    expect(box).to.be.instanceOf(Box)
  })

  it("raises no gating where the listing shows no box under the boxlabel, resolving null, and raises one when one is there", async () => {
    const world = makeWorld()
    const warm = await world.openUnlocked('pw')
    await warm.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    await warm.lock()
    const requestCleartext = vi.fn<RequestCleartext>()
    const cold = await world.open({ requestCleartext })
    expect(await cold.getBox('openai')).to.be.null
    expect(requestCleartext).not.toHaveBeenCalled()
    await TH.expectRefusal(cold.getBox('anthropic'), 'vault_locked')
    expect(requestCleartext).toHaveBeenCalledTimes(1)
  })

  it("hands back a box whose whisper will not open, which only extracting it finds out", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'work account' } }, 'sk-fake')
    world.dbStore.put(u1BoxScopepath('anthropic'), JSON.stringify({ ...storedBoxOf(world), sidecar: { note: 'planted' } }))
    const box = await gotBox(vault)
    expect(box.sidecar).to.deep.equal({ note: 'planted' })
    await TH.expectRefusal(box.extractWhisper(), 'damaged_box')
  })

  it("refuses 'vault_locked' when a lock lands while storage is read, handing back no box", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const reading = TH.holdNextCall(world.vaultDB, 'tryGetBox')
    const getting = TH.expectRefusal(vault.getBox('anthropic'), 'vault_locked')
    await reading.reached
    await vault.lock()
    reading.release()
    await getting
  })

  it("refuses 'vault_locked' from getWhisper when a lock lands while storage is read, opening nothing", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const reading = TH.holdNextCall(world.vaultDB, 'tryGetBox')
    const getting = TH.expectRefusal(vault.getWhisper('anthropic'), 'vault_locked')
    await reading.reached
    await vault.lock()
    reading.release()
    await getting
  })

  it("refuses 'vault_locked' from useWhisper when a lock lands while storage is read, never calling back", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const callback = vi.fn(() => 'used')
    const reading = TH.holdNextCall(world.vaultDB, 'tryGetBox')
    const using = TH.expectRefusal(vault.useWhisper('anthropic', callback), 'vault_locked')
    await reading.reached
    await vault.lock()
    reading.release()
    await using
    expect(callback).to.not.have.been.called
  })
})

describe("useWhisper", () => {
  it("hands the whisper to the callback and returns its result", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const shouted = await vault.useWhisper('anthropic', (whisper) => (typeof whisper === 'string' ? whisper.toUpperCase() : ''))
    expect(shouted).to.eq('SK-FAKE')
  })

  it("passes an async callback's rejection through untouched", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    await expect(vault.useWhisper('anthropic', () => Promise.reject(new Error('the API said no')))).rejects.toThrow('the API said no')
  })

  it("refuses a callback that is not a function before it opens the box", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const err = await TH.expectRefusal(vault.useWhisper('anthropic', 'not a callback' as unknown as () => void), 'bad_option')
    expect(err.message).to.include('Expected a function')
  })
})
// --


// == [Opening a box]: storedBoxOf, gotBox, box.extractWhisper through a vault, what a vault hands its boxes

/** The record storage holds for `u1`'s box `anthropic`, checked as a box record. */
const storedBoxOf = (world: ReturnType<typeof makeWorld>): BoxRecord => BoxRecord.parse(storedRowOf(world, 'anthropic'))

/** The box `vault.getBox('anthropic')` resolves, failing the test where it resolves none. */
const gotBox = async (vault: Vault): Promise<Box> => {
  const box = await vault.getBox('anthropic')
  if (box === null) { throw new Error('expected a box under anthropic') }
  return box
}

describe("box.extractWhisper, through a vault", () => {
  it("opens a box without checking its record again: Box.make checked it once", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const record = storedBoxOf(world)
    const checks = vi.spyOn(BoxRecord, 'parse')
    const box = Box.make(vault, record, TH.cheatGetVaultEpoch(vault))
    expect(checks).toHaveBeenCalledTimes(1)
    checks.mockClear()
    expect(await box.extractWhisper()).to.eq('sk-fake')
    expect(checks).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it("opens a box with the lease in hand, reading no storage and raising no gating, as its example shows", async () => {
    const world = makeWorld()
    const requestCleartext = vi.fn<RequestCleartext>(TH.scriptedRequestCleartext)
    const vault = await world.openUnlocked('pw', { requestCleartext })
    requestCleartext.mockClear()
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'work account' } }, 'sk-fake')
    const box = Box.make(vault, storedBoxOf(world), TH.cheatGetVaultEpoch(vault))
    const reads = (['getBox', 'getVault'] as const).map((verb) => vi.spyOn(world.vaultDB, verb))
    expect(await box.extractWhisper()).to.eq('sk-fake')
    for (const read of reads) { expect(read).not.toHaveBeenCalled() }
    expect(requestCleartext).not.toHaveBeenCalled()
  })

  it("opens a stored record made a box by any handle on the vault, each under its own handle's lease", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const record = storedBoxOf(world)
    const other = await world.open()
    expect(TH.stateOf(other.snapshot)).to.eq('unlocked')
    expect(await Box.make(vault, record, TH.cheatGetVaultEpoch(vault)).extractWhisper()).to.eq('sk-fake')
    expect(await Box.make(other, record, TH.cheatGetVaultEpoch(other)).extractWhisper()).to.eq('sk-fake')
  })

  it("refuses as 'vault_remade' a box made under another vault_tok than the vault holds: one read before the vault was made anew", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const elder = Box.make(vault, storedBoxOf(world), { ...TH.cheatGetVaultEpoch(vault), vault_tok: 'vault-tok-before' })
    await TH.expectRefusal(elder.extractWhisper(), 'vault_remade')
  })

  it("resolves the whisper as an Outcome's val from tryExtractWhisper, as its example shows", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, { apiKey: 'sk-fake' })
    const box = await gotBox(vault)
    const { ok, val: whisper } = await box.tryExtractWhisper()
    expect(ok).to.be.true
    expect(whisper).to.deep.equal({ apiKey: 'sk-fake' })
  })

  it("refuses 'vault_locked' with no lease in hand, raising no gating", async () => {
    const world = makeWorld()
    const requestCleartext = vi.fn<RequestCleartext>(TH.scriptedRequestCleartext)
    const vault = await world.openUnlocked('pw', { requestCleartext })
    requestCleartext.mockClear()
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const box = await gotBox(vault)
    await vault.lock()
    await TH.expectRefusal(box.extractWhisper(), 'vault_locked')
    expect(requestCleartext).not.toHaveBeenCalled()
  })

  it("refuses a box that will not open as 'damaged_box', which getWhisper tells onBadNews and returns, quoting nothing of it", async () => {
    const world = makeWorld()
    const told: VaultError[] = []
    const vault = await world.openUnlocked('pw', { onBadNews: (news) => { told.push(news) } })
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'work account' } }, 'sk-fake')
    world.dbStore.put(u1BoxScopepath('anthropic'), JSON.stringify({ ...storedBoxOf(world), sidecar: { note: 'planted' } }))
    const err = await TH.expectBad(vault.tryGetWhisper('anthropic'), 'damaged_box')
    expect(told).to.deep.equal([err])
    expect(err.message).to.not.include('sk-fake')
  })

  it("refuses what is no box record as 'bad_record', before it opens anything", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    TH.expectSyncRefusal(() => Box.make(vault, { boxlabel: 'anthropic' } as unknown as BoxRecord, TH.cheatGetVaultEpoch(vault)), 'bad_record')
  })

  it("refuses 'vault_locked' for a box made on a handle opened locked", async () => {
    const world = makeWorld()
    const first = await world.openUnlocked('pw')
    await first.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const record = storedBoxOf(world)
    // Locking erases this device's lease, so no vault opened after it holds a key.
    await first.lock()
    const locked = await world.open()
    await TH.expectRefusal(Box.make(locked, record, TH.cheatGetVaultEpoch(locked)).extractWhisper(), 'vault_locked')
  })

  it("refuses 'vault_gone' once the vault is let go", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const box = await gotBox(vault)
    TH.closeVault(vault)
    await TH.expectRefusal(box.extractWhisper(), 'vault_gone')
  })
})

/** Every value reachable from `root` through its own fields, hidden and symbol-named ones included, and the getters of its prototypes, `depth` steps deep: what a host holding it can read without calling a method. */
const reachableFrom = (root: unknown, depth = 8): unknown[] => {
  const seen = new Set<unknown>()
  const walk = (val: unknown, left: number): void => {
    if (val === null || typeof val !== 'object' || seen.has(val)) { return }
    seen.add(val)
    if (left === 0) { return }
    const fieldnames = new Set<PropertyKey>(Reflect.ownKeys(val))
    for (let proto = Object.getPrototypeOf(val) as object | null; proto !== null && proto !== Object.prototype; proto = Object.getPrototypeOf(proto) as object | null) {
      for (const fieldname of Reflect.ownKeys(proto)) {
        if (Reflect.getOwnPropertyDescriptor(proto, fieldname)?.get !== undefined) { fieldnames.add(fieldname) }
      }
    }
    for (const fieldname of fieldnames) {
      walk(Reflect.get(val, fieldname), left - 1)
    }
  }
  walk(root, depth)
  return [...seen]
}

describe("the Vault object's public surface", () => {
  it("yields no Lease, no CryptoKey and no wrapped key through any field or getter", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await TH.putWayin(vault, 'pw', await TH.passkeyOf('laptop'))
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    expect(heldLeaseOf(vault)).to.not.be.null
    const reached = reachableFrom(vault)
    expect(reached.filter((val) => val instanceof Lease)).to.have.lengthOf(0)
    expect(reached.filter((val) => val instanceof CryptoKey)).to.have.lengthOf(0)
    const wrapped = reached.filter((val) => typeof val === 'object' && val !== null && 'ciphertext_b64' in val)
    expect(wrapped).to.have.lengthOf(0)
    expect(reached.filter((val) => typeof val === 'object' && val !== null && 'lease_key' in val)).to.have.lengthOf(0)
  })
})

describe("what a vault hands its boxes", () => {
  it("exposes the logger it was made with, read-only, and no key deriver", async () => {
    const world = makeWorld()
    const vault = await world.open()
    expect(vault).to.not.have.property('keyDeriver')
    vault.logger.warn('a word from a box', { call: 'getBox' })
    expect(world.logged.map((call) => call.message)).to.include('a word from a box')
    for (const field of ['logger', 'keyDeriver'] as const) {
      expect(Reflect.set(vault, field, null), field).to.be.false
      expect(Object.keys(vault), field).to.not.include(field)
    }
  })

  it("lists summaries frozen through, so a host changing one reaches nothing the vault holds, as heldListing's example shows", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'work account', tags: ['team'] } }, 'sk-fake')
    const summary = vault.snapshot.boxes[0]
    const sidecar = summary?.sidecar as { note: string, tags: string[] }
    expect(() => { sidecar.note = 'changed' }).to.throw(TypeError)
    expect(() => { sidecar.tags.push('mallory') }).to.throw(TypeError)
    await vault.hello({ staleMinutes: 0 })
    expect(vault.snapshot.boxes[0]?.sidecar).to.deep.equal({ note: 'work account', tags: ['team'] })
  })

  it("lists each sidecar as the listing's check made it, frozen in place, never serialized and parsed again", async () => {
    const world = makeWorld()
    const writer = await world.openUnlocked('pw')
    await writer.putBox({ boxlabel: 'anthropic', sidecar: { note: 'work account' } }, 'sk-fake')
    TH.closeVault(writer)
    const listings = vi.spyOn(world.vaultDB, 'tryEnsureVault')
    const parses = vi.spyOn(JSON, 'parse')
    const stringifies = vi.spyOn(JSON, 'stringify')
    // Born anew, so its listing is its birth's read.
    const vault = await world.open()
    const sidecar = vault.snapshot.boxes[0]?.sidecar
    const listed = await Promise.all(listings.mock.results.map(async (result) => valOf(await (result.value as ReturnType<VaultDB['tryEnsureVault']>)).boxes))
    expect(listed.some(([box]) => box !== undefined && box.sidecar === sidecar)).to.be.true
    expect(Object.isFrozen(sidecar)).to.be.true
    const sidecarText = '{"note":"work account"}'
    expect(parses.mock.calls.filter(([text]) => text === sidecarText)).to.have.lengthOf(0)
    expect(stringifies.mock.calls.filter(([val]) => val === sidecar)).to.have.lengthOf(0)
    vi.restoreAllMocks()
  })

  it("seals every put under a fresh boxKey and revision, the same whisper twice included (Contract: vault.putBox, Guarantees)", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const first = storedBoxOf(world)
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const second = storedBoxOf(world)
    expect(second.revision_tok).to.not.eq(first.revision_tok)
    expect(second.box_key_wrapped).to.not.deep.equal(first.box_key_wrapped)
    expect(second.whisper_ciphered.ciphertext_b64).to.not.eq(first.whisper_ciphered.ciphertext_b64)
    expect(JSON.stringify(second)).to.not.include('sk-fake')
  })
})
// --
