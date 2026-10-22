import { describe, it, expect, vi } from 'vitest'
import * as ZClassic from 'zod'
import * as Z from 'zod/mini'
import { Box, BoxRecord } from '../../src/box'
import type { VaultError } from '../../src/errors'
import type { GetProof } from '../../src/ask'
import { valOf } from '../../src/outcome'
import { Vault } from '../../src/vault'
import { type Whisper, MaxWhisperBytes, type Sidecar, FarFuture, MaxBoxes, VaultScope } from '../../src/types'
import { AnyTextValidators, MaxUserIdChars, NameFloorBytes } from '../../src/validators'
import { type VaultDB, jsonBytes } from '../../src/vault-db'
import { StoredBytesPerWhisperByte, BoxFieldsBytes, type MakeVaultOpts, BoxFixedBytes } from '../../src/vault-opts'
import { cipherCtx, makeBoxKey, wrapKeyUnder, makeVaultKey, cipherBytes, randomBytes } from '../../src/crypto'
import { memoryDeviceDB } from '../../src/device-db'
import * as TH from '../test-helpers'
import { makeWorld, boxlabelsOf, storedRowOf, u1BoxCkey, storedVaultPropsOf, u1VaultPropsCkey, isU1Box } from './world'


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
    const summary = TH.summaryOf(vault.getSnapshot().boxes[0])
    expect(summary?.boxlabel).to.eq('anthropic')
    expect(summary?.sidecar).to.deep.equal({ note: 'personal account' })
    expect(summary).to.not.have.property('whisper')
  })

  it("replacing a whisper keeps the sidecar", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'keep me' } }, 'sk-old')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-new')
    expect(await vault.getWhisper('anthropic')).to.eq('sk-new')
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({ note: 'keep me' })
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
    roomy.close()
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
    await TH.expectRefusal(vault.putBox({ boxlabel: 'not a label' }, 'whatever'), 'bad_label')
  })

  it("refuses a use of an absent box without quoting the boxlabel, which may be any text a host admits; a get of one resolves null", async () => {
    const world = makeWorld({ validators: AnyTextValidators })
    const vault = await world.openUnlocked('pw')
    expect(await vault.getWhisper('sk-fake-pasted-by-mistake')).to.be.null
    const err = await TH.expectRefusal(vault.useWhisper('sk-fake-pasted-by-mistake', (whisper) => whisper), 'absent_box')
    expect(err.message).not.to.include('sk-fake-pasted-by-mistake')
  })
})

describe("putBox, the box it seals and stores", () => {
  it("resolves the box as stored, stamped with the vault it lies in, as its first example shows", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const box = await vault.putBox({ boxlabel: 'anthropic_api_key', sidecar: { note: 'work account' } }, 'sk-ant-fake')
    expect(box).to.be.instanceOf(Box)
    expect(box).to.deep.include({ boxlabel: 'anthropic_api_key', sidecar: { note: 'work account' }, vault_tok: vault.vault_tok, gate_epoch: vault.gate_epoch })
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

  it("stores again what stands when both are left out: a fresh revision of the same whisper and sidecar", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const first = await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'work account' } }, 'sk-fake')
    const again = await vault.putBox({ boxlabel: 'anthropic' })
    expect(again).to.deep.include({ sidecar: { note: 'work account' }, registered_at: first.registered_at })
    expect(again.revision_tok).to.not.eq(first.revision_tok)
    expect(await vault.getWhisper('anthropic')).to.eq('sk-fake')
  })

  it("refuses 'no_whisper' when the whisper is left out and no box stands, writing nothing", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await TH.expectRefusal(vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'work account' } }), 'no_whisper')
    const leftOut: Whisper | undefined = undefined
    await TH.expectRefusal(vault.putBox({ boxlabel: 'anthropic' }, leftOut), 'no_whisper')
    expect(world.dbStore.ckeys().filter((ckey) => isU1Box(ckey))).to.have.lengthOf(0)
  })

  it("refuses 'damaged_box' when the whisper is left out and the box will not open, writing nothing: there is no whisper to keep", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'work account' } }, 'sk-fake')
    const planted = JSON.stringify({ ...storedRowOf(world, 'anthropic'), sidecar: { note: 'planted' } })
    world.dbStore.write(u1BoxCkey('anthropic'), planted)
    await TH.expectRefusal(vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'mended' } }), 'damaged_box')
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.eq(planted)
  })

  it("reads nothing for a whole store, writing over the revision the listing in hand shows and keeping its registered_at", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const first = await vault.putBox({ boxlabel: 'anthropic' }, 'sk-old')
    const reads = vi.spyOn(world.vaultDB, 'getBox')
    const writes = vi.spyOn(world.vaultDB, 'putBox')
    world.advance(60_000)
    const box = await vault.putBox({ boxlabel: 'anthropic', sidecar: {} }, 'sk-new')
    expect(reads).not.toHaveBeenCalled()
    expect(writes.mock.calls[0]?.[1]).to.deep.equal({ vault_tok: vault.vault_tok, revision_tok: first.revision_tok })
    expect(box.registered_at).to.eq(first.registered_at)
  })

  it("stores a whole box the listing does not show as a new one, over none", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const writes = vi.spyOn(world.vaultDB, 'putBox')
    await vault.putBox({ boxlabel: 'anthropic', sidecar: {} }, 'sk-fake')
    expect(writes.mock.calls[0]?.[1]).to.deep.equal({ vault_tok: vault.vault_tok, revision_tok: null })
  })

  it("refuses a whole store over a listing a moment stale as 'stale_write', writing nothing: what another device wrote stands", async () => {
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
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.be.null
  })
})

describe("vault.lease", () => {
  it("is the lease the vault holds, and null once locked", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    expect(vault.lease).to.not.be.null
    expect(vault.lease?.vault_tok).to.eq(vault.vault_tok)
    await vault.lock()
    expect(vault.lease).to.be.null
  })

  it("deciphers what a box holds, as its example shows: what box.extractWhisper does", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const box = await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const { box_key_wrapped: boxKeyWrapped, whisper_ciphered: whisperCiphered, ...visible } = box.record
    const whisperBytes = await vault.lease?.decipherWith({ box_key_wrapped: boxKeyWrapped, whisper_ciphered: whisperCiphered }, visible)
    expect(new TextDecoder().decode(whisperBytes)).to.eq('"sk-fake"')
  })
})

/** A vault this device unlocked, holding a box, whose VaultDB hears no bells, and a second device on the same storage. */
const remadeWorld = async () => {
  const world = makeWorld()
  const deaf = world.deafVaultDB()
  const vault = await world.openUnlocked('pw', { vaultDB: deaf })
  await vault.putBox({ boxlabel: 'anthropic' }, 'sk-mine')
  const there = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
  /** Delete and remake the vault from the second device, and have this one read the new life. */
  const remake = async () => {
    await there.del()
    await there.unlock('pw two')
    await vault.hello({ staleMinutes: 0 })
  }
  return { world, deaf, vault, there, remake }
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
    const before = TH.summaryOf(vault.getSnapshot().boxes[0])
    world.advance(60_000)
    // The same whisper, its fields given in another order: it serializes the same.
    await vault.putBox({ boxlabel: 'openai', sidecar: { note: 'a new note' } }, { tier: 2, apiKey: 'sk-fake' })
    const after = TH.summaryOf(vault.getSnapshot().boxes[0])
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
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify(row))
    world.advance(60_000)
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    expect(vault.getSnapshot().boxes[0]).to.deep.include({ registered_at: storedAt + 60_000, written_at: storedAt + 60_000, sidecar: {} })
    expect(await vault.getWhisper('anthropic')).to.eq('sk-fake')
  })

  it("never seals a sidecar planted in storage into a fresh revision: a store over it without a sidecar writes {}", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'work account' } }, 'sk-fake')
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), sidecar: { note: 'INJECTED' } }))
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'damaged_box')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake-2')
    expect(await vault.getWhisper('anthropic')).to.eq('sk-fake-2')
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({})
    expect(storedRowOf(world, 'anthropic')['sidecar']).to.deep.equal({})
    // A sidecar given with the store is written as given, over the planted one.
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), sidecar: { note: 'INJECTED' } }))
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'mended' } }, 'sk-fake-3')
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({ note: 'mended' })
  })

  it("never carries forward a registered_at moved in storage: a store over it stamps now", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const planted = Date.UTC(2001, 0, 1)
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), registered_at: planted }))
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
    world.dbStore.write(u1BoxCkey('respaced'), JSON.stringify(storedRowOf(world, 'respaced'), null, 2))
    world.dbStore.write(u1BoxCkey('reordered'), JSON.stringify({ ...storedRowOf(world, 'reordered'), sidecar: { beta: { delta: [2, 1], gamma: 3 }, alpha: 1 } }))
    const fresh = await world.openUnlocked('pw')
    expect(fresh.getSnapshot().boxes.map((box) => [box.boxlabel, box.damaged])).to.deep.equal([['reordered', false], ['respaced', false]])
    expect(await fresh.getWhisper('respaced')).to.eq('sk-fake-one')
    expect(await fresh.getWhisper('reordered')).to.eq('sk-fake-two')
  })

  it("stamps the vault props' registered_at when the vault is made, and keeps it through a passphrase change", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    const madeAt = world.clock.now()
    expect(storedVaultPropsOf(world)).to.include({ registered_at: madeAt })
    world.advance(60_000)
    await vault.putWayin('pw one', 'pw two')
    expect(storedVaultPropsOf(world)).to.include({ registered_at: madeAt, gate_epoch: 2 })
  })

  it("writes no created_at or updated_at, to a box or the vault props", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    for (const row of [storedRowOf(world, 'anthropic'), storedVaultPropsOf(world)]) {
      expect(row).to.not.have.any.keys('created_at', 'updated_at')
    }
  })

  it("writes whole milliseconds from a clock that returns fractions", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { clock: { now: () => world.clock.now() + 0.75 } })
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    expect(storedVaultPropsOf(world)).to.include({ registered_at: world.clock.now() })
    expect(storedRowOf(world, 'anthropic')).to.include({ registered_at: world.clock.now(), written_at: world.clock.now() })
  })

  it("refuses a stored box or vault props whose time holds a fraction of a millisecond, leaving the record as it is", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const box = JSON.stringify({ ...storedRowOf(world, 'anthropic'), written_at: world.clock.now() + 0.5 })
    world.dbStore.write(u1BoxCkey('anthropic'), box)
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'damaged_box')
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.eq(box)
    const vaultProps = JSON.stringify({ ...storedVaultPropsOf(world), registered_at: world.clock.now() + 0.5 })
    world.dbStore.write(u1VaultPropsCkey, vaultProps)
    await TH.expectRefusal(world.open(), 'damaged_vault')
    expect(world.dbStore.read(u1VaultPropsCkey)).to.eq(vaultProps)
  })

  it("never quotes the boxlabel of a damaged box it refuses, which a host's checks may let be any text", async () => {
    const world = makeWorld({ validators: AnyTextValidators })
    const vault = await world.openUnlocked('pw')
    const pasted = 'sk-ant-fake-pasted-as-a-label'
    await vault.putBox({ boxlabel: pasted }, 'sk-fake')
    await vault.putBox({ boxlabel: 'other' }, 'sk-fake-two')
    const row = storedRowOf(world, pasted)
    world.dbStore.write(u1BoxCkey(pasted), JSON.stringify({ ...row, written_at: world.clock.now() + 0.5 }))
    const storedDamaged = await TH.expectRefusal(vault.getWhisper(pasted), 'damaged_box')
    // The other box's ciphertext, moved under this boxlabel: it will not open here.
    world.dbStore.write(u1BoxCkey(pasted), JSON.stringify({ ...row, whisper_ciphered: storedRowOf(world, 'other')['whisper_ciphered'] }))
    const unopened = await TH.expectRefusal(vault.getWhisper(pasted), 'damaged_box')
    expect(TH.thrownText(storedDamaged) + TH.thrownText(unopened)).to.not.include('sk-ant-fake')
  })

  it("refuses a stored box from before its times were renamed, leaving it as it is", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const { registered_at: _registered, written_at: _written, ...row } = storedRowOf(world, 'anthropic')
    const olden = JSON.stringify({ ...row, created_at: '2026-10-14T00:00:00.000Z', updated_at: '2026-10-14T00:00:00.000Z' })
    world.dbStore.write(u1BoxCkey('anthropic'), olden)
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'damaged_box')
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.eq(olden)
  })

  it("refuses stored vault props from before their time was renamed, leaving them as they are", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const { registered_at: _registered, ...row } = storedVaultPropsOf(world)
    const olden = JSON.stringify({ ...row, created_at: '2026-10-14T00:00:00.000Z', updated_at: '2026-10-14T00:00:00.000Z' })
    world.dbStore.write(u1VaultPropsCkey, olden)
    await TH.expectRefusal(world.open(), 'damaged_vault')
    expect(world.dbStore.read(u1VaultPropsCkey)).to.eq(olden)
  })
})
// --

// == [Sidecar]: the sidecar

describe("the sidecar", () => {
  it("is {} in the summary and the stored row of a box given none", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({})
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
    world.dbStore.write(u1BoxCkey('omitted'), JSON.stringify(sidecarless))
    const fresh = await world.open()
    expect(fresh.getSnapshot().boxes[1]).to.deep.include({ boxlabel: 'omitted', damaged: true })
    expect(await fresh.getWhisper('emptied')).to.eq('sk-fake-two')
  })

  it("is stored as the JSON value given, and handed back in the summary as that value", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const sidecar = { project: 'atlas', note: 'work account', tags: ['billing', null], limit: 2.5 }
    await vault.putBox({ boxlabel: 'anthropic', sidecar }, 'sk-fake')
    expect(storedRowOf(world, 'anthropic')['sidecar']).to.deep.equal(sidecar)
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal(sidecar)
    const again = await world.open()
    expect(TH.summaryOf(again.getSnapshot().boxes[0])?.sidecar).to.deep.equal(sidecar)
  })

  it("takes a JSON object of any JSON values, never interpreting it: text with a control character, null, an array", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const sidecars: Sidecar[] = [{ note: 'beep\u{7}' }, { gone: null }, { list: [1, 'two'] }, { count: 42 }]
    for (const [ii, sidecar] of sidecars.entries()) {
      await vault.putBox({ boxlabel: `box${String(ii)}`, sidecar }, 'sk-fake')
    }
    expect(vault.getSnapshot().boxes.map((box) => TH.summaryOf(box)?.sidecar)).to.deep.equal(sidecars)
  })

  it("leaving it out keeps the sidecar standing; {} empties it; another sidecar replaces it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'work account' } }, 'sk-one')
    await vault.putBox({ boxlabel: 'anthropic', sidecar: undefined }, 'sk-two')
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({ note: 'work account' })
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'personal' } }, 'sk-three')
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({ note: 'personal' })
    await vault.putBox({ boxlabel: 'anthropic', sidecar: {} }, 'sk-four')
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({})
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-five')
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({})
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
    expect(world.dbStore.ckeys().filter((ckey) => isU1Box(ckey))).to.have.lengthOf(0)
  })

  it("refuses a prop beside `boxlabel` and `sidecar`, or props that are no object, as 'bad_option', writing nothing: a note is kept in the sidecar, not beside it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const misfits = [{ boxlabel: 'anthropic', note: 'work account' }, { boxlabel: 'anthropic', sidcar: { note: 'work account' } }, { boxlabel: 'anthropic', sidecar: {}, note: 'work account' }, 'work account']
    for (const props of misfits) {
      const err = await TH.expectRefusal(vault.putBox(props as never, 'sk-fake'), 'bad_option')
      expect(err.message).to.include('sidecar')
      expect(err.message).to.not.include('work account')
    }
    expect(world.dbStore.ckeys().filter((ckey) => isU1Box(ckey))).to.have.lengthOf(0)
    await vault.putBox({ boxlabel: 'anthropic', sidecar: undefined }, 'sk-fake')
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({})
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
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({ note: 'n'.repeat(20) })
  })

  it("refuses a sidecar over maxWhisperBytes alone, its whisper left out, before asking for a proof", async () => {
    const world = makeWorld()
    const warm = await world.openUnlocked('pw', { maxWhisperBytes: 64 })
    await warm.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    await warm.lock()
    const getProof = vi.fn<GetProof>(() => 'declined')
    const cold = await world.open({ maxWhisperBytes: 64, getProof })
    await TH.expectRefusal(cold.putBox({ boxlabel: 'anthropic', sidecar: { note: 'n'.repeat(60) } }), 'whisper_too_large')
    expect(getProof).not.toHaveBeenCalled()
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
    expect(cold.getSnapshot().state).to.eq('locked')
    expect(TH.summaryOf(cold.getSnapshot().boxes[0])?.sidecar).to.deep.equal({ note: 'visible while locked' })
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
  const ctx = cipherCtx('a test ctx')
  const boxKey = await makeBoxKey()
  return {
    applabel:               'a'.repeat(40),
    user_id:                '\u{4E00}'.repeat(MaxUserIdChars),
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
 * string of double quotes, each escaped in its JSON, so the string stands at twice its length
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
    expect(world.dbStore.ckeys().filter((ckey) => ckey.includes('secret_project_x'))).to.have.lengthOf(0)
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
    roomy.close()
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
    const reads = vi.spyOn(world.vaultDB, 'getVault')
    await TH.expectRefusal(here.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake'), 'vault_full')
    expect(reads).not.toHaveBeenCalled()
    await here.hello({ staleMinutes: 0 })
    await here.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake')
    expect(boxlabelsOf(here)).to.deep.equal(['anthropic'])
  })

  it("opens with the defaults on a backend holding 8 MiB of a vault, as Convex does", async () => {
    const world = makeWorld()
    expect(await world.stateOnOpen({ vaultDB: declaringVaultBytes(world.vaultDB, 8 * 1024 * 1024) })).to.eq('absent')
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
        expect(BoxRecord.safeParse(row).success).to.be.true
        expect(VaultScope.safeParse(row).success).to.be.true
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
    expect(await world.stateOnOpen({ vaultDB, maxBoxes: 50 })).to.eq('absent')
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
    expect(await world.stateOnOpen({ maxBoxes: 1_000_000_000 })).to.eq('absent')
    const unlimitedish = declaringBoxes(world.vaultDB, 1_200_300_400_500_600)
    expect(await world.stateOnOpen({ vaultDB: unlimitedish, maxBoxes: 1_000_000_000 })).to.eq('absent')
    const err = await TH.expectRefusal(world.open({ vaultDB: unlimitedish, maxBoxes: 1_200_300_400_500_601 }), 'bad_option')
    expect(err.message).to.include('1200300400500600 boxes')
  })

  it("takes an adapter's Infinity, for no limit, as the largest finite limit, so nothing past Vault.make holds Infinity", async () => {
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

// == [Host validators]: AnyScript, ScriptLabels, the host's validators

/**
 * What a host keeping labels in any script might pass: any text of 1 to 200 characters for each
 * label, written in classic Zod, as most hosts write it.
 */
const AnyScript = {
  applabel:   ZClassic.string().min(1).max(200),
  vaultlabel: ZClassic.string().min(1).max(200),
  boxlabel:   ZClassic.string().min(1).max(200),
}

/** Labels no default check admits: punctuation the ckeys and ctx once leaned on, and Hebrew, Arabic and Thai text. */
const ScriptLabels = ['OpenAI: work', String.raw`say "hi", \ [ok]`, 'מפתח API של העבודה', 'مفتاح العمل', 'กุญแจงาน', 'Mixed: English, עברית, العربية, ไทย'] as const

describe("the host's validators", () => {
  it("replace ours outright: a vault keeps labels in any script, and reads each back", async () => {
    const world = makeWorld({ validators: AnyScript, applabel: 'Acme: אקמה', vaultlabel: 'ราก' })
    const vault = await world.openUnlocked('pw')
    for (const [ii, boxlabel] of ScriptLabels.entries()) {
      await vault.putBox({ boxlabel, sidecar: { note: `${boxlabel} — ${'ノート'.repeat(100)}` } }, `sk-fake-${String(ii)}`)
    }
    expect(boxlabelsOf(vault)).to.have.members([...ScriptLabels])
    for (const [ii, boxlabel] of ScriptLabels.entries()) {
      expect(await vault.getWhisper(boxlabel)).to.eq(`sk-fake-${String(ii)}`)
    }
    await vault.delBox(ScriptLabels[0])
    expect(boxlabelsOf(vault)).to.not.include(ScriptLabels[0])
    vault.close()
    const again = await world.openUnlocked('pw')
    expect(boxlabelsOf(again)).to.have.lengthOf(ScriptLabels.length - 1)
  })

  it("take AnyTextValidators whole, as its example shows: any text above the floor names a vault and its boxes", async () => {
    const world = makeWorld({ validators: AnyTextValidators })
    const vault = await world.openUnlocked('pw', { applabel: 'Acme Corp', userId: 'alice smith', vaultlabel: 'Main vault' })
    await vault.putBox({ boxlabel: 'Work: מפתח API', sidecar: { note: 'n'.repeat(4000) } }, 'sk-fake')
    await vault.putBox({ boxlabel: String.raw`["box","acme"] \ x` }, 'sk-fake-two')
    expect(await vault.getWhisper('Work: מפתח API')).to.eq('sk-fake')
    expect(boxlabelsOf(vault)).to.have.lengthOf(2)
    await TH.expectRefusal(vault.putBox({ boxlabel: '' }, 'sk-fake'), 'bad_label')
    await TH.expectRefusal(world.open({ validators: AnyTextValidators, userId: '' }), 'bad_label')
  })

  it("never widen the floor: a host's z.string() still meets a refusal of half a character, a control character or a decomposed letter", async () => {
    const world = makeWorld({ validators: { boxlabel: ZClassic.string(), userId: ZClassic.string() } })
    const vault = await world.openUnlocked('pw')
    for (const boxlabel of ['key \u{D83D}', 'tab\there', 'cafe\u{301}', 'n'.repeat(NameFloorBytes + 1)]) {
      await TH.expectRefusal(vault.putBox({ boxlabel }, 'sk-fake'), 'bad_label')
    }
    await TH.expectRefusal(world.open({ userId: 'u1\u{D800}' }), 'bad_label')
    expect(world.dbStore.ckeys().filter((ckey) => isU1Box(ckey))).to.have.lengthOf(0)
  })

  it("never let a name hold ^, which storage joins names on: refused at Vault.make and at putBox(), whatever the validators", async () => {
    const world = makeWorld({ validators: AnyTextValidators })
    const err = await TH.expectRefusal(world.open({ userId: 'alice^admin' }), 'bad_label')
    expect(err.message).to.include('userId')
    expect(err.message).to.include('no ^')
    expect(TH.thrownText(err)).to.not.include('alice')
    await TH.expectRefusal(world.open({ vaultlabel: 'main^x' }), 'bad_label')
    const vault = await world.openUnlocked('pw')
    const stored = await TH.expectRefusal(vault.putBox({ boxlabel: 'anthro^pic' }, 'sk-fake'), 'bad_label')
    expect(stored.message).to.include('boxlabel')
    expect(boxlabelsOf(vault)).to.deep.equal([])
  })

  it("refuse a user_id of 101 characters at Vault.make, under the default check", async () => {
    const world = makeWorld()
    const err = await TH.expectRefusal(world.open({ userId: 'u'.repeat(MaxUserIdChars + 1) }), 'bad_label')
    expect(err.message).to.include('at most 100 characters')
    expect(await world.stateOnOpen({ userId: 'u'.repeat(MaxUserIdChars) })).to.eq('absent')
  })

  it("refuse, as ours would, what they refuse: a host narrows the user id to its auth's shape", async () => {
    const clerkUserId = ZClassic.string().regex(/^user_[A-Za-z0-9]{27}$/)
    const world = makeWorld({ validators: { userId: clerkUserId } })
    expect(await world.stateOnOpen({ userId: `user_${'A'.repeat(27)}` })).to.eq('absent')
    const err = await TH.expectRefusal(world.open({ userId: 'alice@example.com' }), 'bad_label')
    expect(err.message).to.include('userId')
    expect(TH.thrownText(err)).to.not.include('alice')
  })

  it("keep ours for every field a host leaves out", async () => {
    const world = makeWorld({ validators: { vaultlabel: AnyScript.vaultlabel } })
    const vault = await world.openUnlocked('pw', { vaultlabel: 'Main vault' })
    await TH.expectRefusal(vault.putBox({ boxlabel: 'Not A Label' }, 'sk-fake'), 'bad_label')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    await TH.expectRefusal(world.open({ applabel: 'Acme' }), 'bad_label')
  })

  it("refuse a note check, as there is no note: a host checks its sidecar itself", async () => {
    const world = makeWorld()
    await TH.expectRefusal(world.open({ validators: { note: ZClassic.string() } as never }), 'bad_option')
  })

  it("take a mini schema as readily as a classic one", async () => {
    const world = makeWorld({ validators: { boxlabel: Z.string().check(Z.minLength(1), Z.maxLength(80)) } })
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'Anthropic API key' }, 'sk-fake')
    expect(await vault.getWhisper('Anthropic API key')).to.eq('sk-fake')
  })

  it("only check: what the vault keeps and binds is what it was handed, never what a schema made of it", async () => {
    const trimming = { boxlabel: ZClassic.string().trim().toLowerCase().min(1), userId: ZClassic.string().trim().min(1) }
    const world = makeWorld({ validators: trimming })
    const vault = await world.openUnlocked('pw', { userId: '  U1  ' })
    expect(vault.user_id).to.eq('  U1  ')
    await vault.putBox({ boxlabel: '  Padded Box  ' }, 'sk-fake')
    expect(boxlabelsOf(vault)).to.deep.equal(['  Padded Box  '])
    expect(await vault.getWhisper('  Padded Box  ')).to.eq('sk-fake')
    expect(await vault.getWhisper('padded box')).to.be.null
  })

  it("never pass a host schema's issues along, which may quote the name", async () => {
    const quoting = ZClassic.string().refine(() => false, { error: (issue) => `no such label ${String(issue.input)}` })
    const world = makeWorld({ validators: { boxlabel: quoting } })
    const vault = await world.openUnlocked('pw')
    const err = await TH.expectRefusal(vault.putBox({ boxlabel: 'secret_project_x' }, 'sk-fake'), 'bad_label')
    expect(TH.thrownText(err)).to.not.include('secret_project_x')
  })

  it("refuse an async check, or one that throws, as misuse", async () => {
    const world = makeWorld()
    const asyncCheck = ZClassic.string().refine(async () => { await TH.wakeupAtNextTick(); return true })
    await TH.expectRefusal(world.open({ validators: { applabel: asyncCheck } }), 'bad_option')
    const throwing = ZClassic.string().refine(() => { throw new Error('the host check fell over') })
    const vault = await world.openUnlocked('pw', { validators: { boxlabel: throwing } })
    await TH.expectRefusal(vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake'), 'bad_option')
  })

  it("are the vault's alone, checked at its entry: no VaultDB verb is handed them, and every verb takes a name they admitted", async () => {
    const longUserId = ZClassic.string().min(1).max(300)
    const world = makeWorld({ validators: { userId: longUserId }, userId: 'u'.repeat(200) })
    const verbs = ['getVault', 'ensureVault', 'putVaultProps', 'getBox', 'getVault', 'putBox', 'delBox', 'delVault', 'subscribe'] as const
    const spies = verbs.map((verb) => vi.spyOn(world.vaultDB, verb))
    const vault = await world.openUnlocked('pw one')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    expect(await vault.getWhisper('anthropic')).to.eq('sk-fake')
    await vault.putWayin('pw one', 'pw two')
    await vault.delBox('anthropic')
    await vault.del()
    for (const [ii, spy] of spies.entries()) {
      expect(spy.mock.calls.length, verbs[ii]).to.be.above(0)
      for (const args of spy.mock.calls) {
        expect(args, verbs[ii]).to.not.include(longUserId)
      }
    }
  })

  it("refuse a bag holding anything but schemas, or a field the bag does not know, before storage is touched", async () => {
    const world = makeWorld()
    const getVaultProps = vi.spyOn(world.vaultDB, 'getVault')
    const misfits = ['acme', 42, { boxlabel: 'Label' }, { boxlabel: /^[a-z]+$/ }, { boxLabel: ZClassic.string() }, { userID: ZClassic.string() }]
    for (const validators of misfits) {
      const err = await TH.expectRefusal(world.open({ validators: validators as unknown as MakeVaultOpts['validators'] }), 'bad_option')
      expect(err.message).to.include('validators')
    }
    expect(getVaultProps).not.toHaveBeenCalled()
    expect(await world.stateOnOpen({ validators: undefined })).to.eq('absent')
    expect(await world.stateOnOpen({ validators: { boxlabel: undefined } })).to.eq('absent')
  })

  it("list a box stored under a boxlabel narrowed checks refuse as sound, read it, and delBox() removes it by that name", async () => {
    const world = makeWorld()
    const roomy = await world.openUnlocked('pw', { validators: AnyScript })
    await roomy.putBox({ boxlabel: 'OpenAI: work' }, 'sk-fake')
    await roomy.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake')
    roomy.close()
    const narrow = await world.openUnlocked('pw')
    expect(narrow.getSnapshot().boxes.map((box) => [box.boxlabel, box.damaged])).to.deep.equal([['OpenAI: work', false], ['anthropic', false]])
    expect(await narrow.getWhisper('OpenAI: work')).to.eq('sk-fake')
    expect(await narrow.useWhisper('OpenAI: work', (whisper) => whisper)).to.eq('sk-fake')
    await narrow.delBox('OpenAI: work')
    expect(world.dbStore.read(u1BoxCkey('OpenAI: work'))).to.be.null
    expect(boxlabelsOf(narrow)).to.deep.equal(['anthropic'])
  })

  it("delBox() reads no box before it deletes, under a refused boxlabel or a passing one, and a name with nothing there is absent_box", async () => {
    const world = makeWorld()
    const roomy = await world.openUnlocked('pw', { validators: AnyScript })
    await roomy.putBox({ boxlabel: 'OpenAI: work' }, 'sk-fake')
    await roomy.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake')
    roomy.close()
    // Deaf, so no read rung by its first delete lands over its second.
    const deaf = world.deafVaultDB()
    const narrow = await world.openUnlocked('pw', { vaultDB: deaf })
    const getBox = vi.spyOn(deaf, 'getBox')
    await narrow.delBox('OpenAI: work')
    await narrow.delBox('anthropic')
    await TH.expectRefusal(narrow.delBox('OpenAI: work'), 'absent_box')
    expect(getBox).not.toHaveBeenCalled()
    expect(boxlabelsOf(narrow)).to.deep.equal([])
  })

  it("reads a name the host's check refuses, with nothing under it, as none: getBox and getWhisper resolve null, useWhisper and delBox refuse absent_box; the check gates writes alone", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    expect(await vault.getBox('Other: box')).to.be.null
    expect(await vault.getWhisper('Other: box')).to.be.null
    for (const call of [() => vault.useWhisper('Other: box', (whisper) => whisper), () => vault.delBox('Other: box')]) {
      await TH.expectRefusal(call(), 'absent_box')
    }
  })

  it("refuse a wayinlabel check as bad_option, as a vault's ways in carry no labels", async () => {
    const world = makeWorld()
    const err = await TH.expectRefusal(world.open({ validators: { wayinlabel: ZClassic.string() } as never }), 'bad_option')
    expect(err.message).to.include('validators')
  })

  it("never list a row planted under a name below the floor, which no call could reach", async () => {
    const world = makeWorld({ validators: { boxlabel: ZClassic.string() } })
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    world.dbStore.write(u1BoxCkey('key \u{D83D}'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), boxlabel: 'key \u{D83D}' }))
    world.dbStore.write(u1BoxCkey('bell\u{7}'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), boxlabel: 'bell\u{7}' }))
    const fresh = await world.openUnlocked('pw')
    expect(boxlabelsOf(fresh)).to.deep.equal(['anthropic'])
    await TH.expectRefusal(fresh.delBox('key \u{D83D}'), 'bad_label')
    await TH.expectRefusal(fresh.getWhisper('bell\u{7}'), 'bad_label')
  })

  it("refuses a store under a refused boxlabel as 'bad_label', over a box stored there or not, writing nothing", async () => {
    const world = makeWorld()
    const roomy = await world.openUnlocked('pw', { validators: AnyScript })
    await roomy.putBox({ boxlabel: 'OpenAI: work', sidecar: { note: 'personal account' } }, 'sk-fake')
    roomy.close()
    const stored = world.dbStore.read(u1BoxCkey('OpenAI: work'))
    const narrow = await world.openUnlocked('pw')
    await TH.expectRefusal(narrow.putBox({ boxlabel: 'OpenAI: work' }, 'sk-new'), 'bad_label')
    expect(world.dbStore.read(u1BoxCkey('OpenAI: work'))).to.eq(stored)
    expect(narrow.getSnapshot().boxes.map((box) => [box.boxlabel, box.damaged])).to.deep.equal([['OpenAI: work', false]])
    await TH.expectRefusal(narrow.putBox({ boxlabel: 'Other: box' }, 'sk-fake'), 'bad_label')
    await TH.expectRefusal(narrow.delBox('Other: box'), 'absent_box')
    expect(world.dbStore.read(u1BoxCkey('Other: box'))).to.be.null
  })
})
// --

// == [Weight, locked, useWhisper]: LongScope, declaringRecordBytes, what a box weighs, while locked, useWhisper

/** A scope of names a kibibyte long, which only a host's validators admit: heavier than the default fields' plan. */
const LongScope = { applabel: 'a'.repeat(1000), vaultlabel: 'v'.repeat(1000) } as const

/** `vaultDB` declaring `maxRecordBytes` as given, and otherwise itself. */
const declaringRecordBytes = (vaultDB: VaultDB, maxRecordBytes: number): VaultDB => (
  Object.create(vaultDB, { maxRecordBytes: { value: maxRecordBytes } }) as VaultDB
)

describe("what a box weighs in storage", () => {
  it("refuses, as 'box_too_large', a box heavier than storage holds in one record, writing nothing", async () => {
    const world = makeWorld({ validators: AnyTextValidators })
    const vaultDB = declaringRecordBytes(world.vaultDB, 2048)
    const vault = await world.openUnlocked('pw', { vaultDB, maxWhisperBytes: 1024 })
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'n'.repeat(990) } }, 'sk-fake')
    // A sidecar near the whisper limit, beside a boxlabel the host's validators let run long.
    const err = await TH.expectRefusal(vault.putBox({ boxlabel: 'o'.repeat(1000), sidecar: { note: 'n'.repeat(990) } }, 'sk-fake'), 'box_too_large')
    expect(err.message).to.include('2048')
    expect(boxlabelsOf(vault)).to.deep.equal(['anthropic'])
  })

  it("refuses, as 'vault_full', a box whose names would take the vault past what storage holds of it", async () => {
    const world = makeWorld({ validators: AnyTextValidators })
    // Room for three boxes of the default fields' plan, each a whisper of 1000 bytes; names
    // of half a kibibyte take more than that plan, so two fit and a third does not.
    const vaultDB = declaringVaultBytes(world.vaultDB, 3 * ((1000 * StoredBytesPerWhisperByte) + BoxFieldsBytes))
    const halfLongScope = { applabel: 'a'.repeat(500), vaultlabel: 'v'.repeat(500) }
    const vault = await world.openUnlocked('pw', { vaultDB, maxWhisperBytes: 1000, maxBoxes: 3, ...halfLongScope })
    await vault.putBox({ boxlabel: 'one' }, 'sk-fake')
    await vault.putBox({ boxlabel: 'two' }, 'sk-fake')
    const err = await TH.expectRefusal(vault.putBox({ boxlabel: 'three' }, 'sk-fake'), 'vault_full')
    expect(err.message).to.include('shorter boxlabel')
    expect(boxlabelsOf(vault)).to.deep.equal(['one', 'two'])
    await vault.delBox('one')
    await vault.putBox({ boxlabel: 'three' }, 'sk-fake')
    expect(boxlabelsOf(vault)).to.deep.equal(['three', 'two'])
  })

  it("never refuses a replacement, which weighs what it replaces, even in a vault over its limit", async () => {
    const world = makeWorld({ validators: AnyTextValidators })
    const roomy = await world.openUnlocked('pw', LongScope)
    await roomy.putBox({ boxlabel: 'one' }, 'sk-fake')
    await roomy.putBox({ boxlabel: 'two' }, 'sk-fake')
    roomy.close()
    const vaultDB = declaringVaultBytes(world.vaultDB, 2 * ((1000 * StoredBytesPerWhisperByte) + BoxFieldsBytes))
    const tight = await world.open({ vaultDB, maxWhisperBytes: 1000, maxBoxes: 2, ...LongScope })
    await tight.putBox({ boxlabel: 'one', sidecar: { note: 'n'.repeat(900) } }, 'sk-fake-new')
    await tight.putBox({ boxlabel: 'two' }, 'sk-fake-new')
    expect(TH.summaryOf(tight.getSnapshot().boxes[0])?.sidecar).to.deep.equal({ note: 'n'.repeat(900) })
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

  it("plans no less at Vault.make than a store weighs a box at the default checks' longest", async () => {
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
    expect(cold.getSnapshot().state).to.eq('locked')
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

  it("resolves null where no box stands, as its example shows", async () => {
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
    expect({ vault_tok: box.vault_tok, vault_epoch: box.vault_epoch, gate_epoch: box.gate_epoch }).to.deep.equal({ vault_tok: vault.stamp?.vault_tok, vault_epoch: vault.stamp?.vault_epoch, gate_epoch: vault.stamp?.gate_epoch })
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

  it("asks for no proof where the listing shows no box under the boxlabel, resolving null, and asks when one is there", async () => {
    const world = makeWorld()
    const warm = await world.openUnlocked('pw')
    await warm.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    await warm.lock()
    const getProof = vi.fn<GetProof>(() => 'declined')
    const cold = await world.open({ getProof })
    expect(await cold.getBox('openai')).to.be.null
    expect(getProof).not.toHaveBeenCalled()
    await TH.expectRefusal(cold.getBox('anthropic'), 'vault_locked')
    expect(getProof).toHaveBeenCalledTimes(1)
  })

  it("hands back a box whose whisper will not open, which only extracting it finds out", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'work account' } }, 'sk-fake')
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...storedBoxOf(world), sidecar: { note: 'planted' } }))
    const box = await gotBox(vault)
    expect(box.sidecar).to.deep.equal({ note: 'planted' })
    await TH.expectRefusal(box.extractWhisper(), 'damaged_box')
  })

  it("lets a lock landing while storage is read through, handing back the box, which opens to nothing: 'vault_locked'", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const reading = TH.holdNextCall(world.vaultDB, 'getBox')
    const getting = vault.getBox('anthropic')
    await reading.reached
    await vault.lock()
    reading.release()
    const box = await getting
    expect(box?.boxlabel).to.eq('anthropic')
    await TH.expectRefusal(box!.extractWhisper(), 'vault_locked')
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
    expect(err.message).to.include('callback function')
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
    const checks = vi.spyOn(BoxRecord, 'safeParse')
    const box = Box.make(vault, record)
    expect(checks).toHaveBeenCalledTimes(1)
    checks.mockClear()
    expect(await box.extractWhisper()).to.eq('sk-fake')
    expect(checks).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it("opens a box with the lease in hand, reading no storage and asking for no proof, as its example shows", async () => {
    const world = makeWorld()
    const getProof = vi.fn<GetProof>(() => 'declined')
    const vault = await world.openUnlocked('pw', { getProof })
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'work account' } }, 'sk-fake')
    const box = Box.make(vault, storedBoxOf(world))
    const reads = (['getBox', 'getVault'] as const).map((verb) => vi.spyOn(world.vaultDB, verb))
    expect(await box.extractWhisper()).to.eq('sk-fake')
    for (const read of reads) { expect(read).not.toHaveBeenCalled() }
    expect(getProof).not.toHaveBeenCalled()
  })

  it("opens a stored record made a box by any handle on the vault, each under its own handle's lease", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const record = storedBoxOf(world)
    const other = await world.open()
    expect(other.state).to.eq('unlocked')
    expect(await Box.make(vault, record).extractWhisper()).to.eq('sk-fake')
    expect(await Box.make(other, record).extractWhisper()).to.eq('sk-fake')
  })

  it("refuses as 'vault_remade' a box made under another vault_tok than the vault holds: one read before the vault was made anew", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const { stamp } = vault
    if (stamp === null) { throw new Error('expected the vault to hold a stamp') }
    const elder = Box.make(vault, storedBoxOf(world), { ...stamp, vault_tok: 'vault-tok-before' })
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

  it("refuses 'vault_locked' with no lease in hand, asking for no proof", async () => {
    const world = makeWorld()
    const getProof = vi.fn<GetProof>(() => 'declined')
    const vault = await world.openUnlocked('pw', { getProof })
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const box = await gotBox(vault)
    await vault.lock()
    await TH.expectRefusal(box.extractWhisper(), 'vault_locked')
    expect(getProof).not.toHaveBeenCalled()
  })

  it("refuses a box that will not open as 'damaged_box', which getWhisper tells onBadNews and returns, quoting nothing of it", async () => {
    const world = makeWorld()
    const told: VaultError[] = []
    const vault = await world.openUnlocked('pw', { onBadNews: (news) => { told.push(news) } })
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'work account' } }, 'sk-fake')
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...storedBoxOf(world), sidecar: { note: 'planted' } }))
    const err = await TH.expectBad(vault.tryGetWhisper('anthropic'), 'damaged_box')
    expect(told).to.deep.equal([err])
    expect(err.message).to.not.include('sk-fake')
  })

  it("refuses what is no box record as 'bad_record', before it opens anything", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    TH.expectSyncRefusal(() => Box.make(vault, { boxlabel: 'anthropic' } as unknown as BoxRecord), 'bad_record')
  })

  it("refuses 'vault_locked' for a box made on a handle opened locked", async () => {
    const world = makeWorld()
    const first = await world.openUnlocked('pw')
    await first.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const record = storedBoxOf(world)
    // Locking erases this device's lease, so no vault opened after it holds a key.
    await first.lock()
    const locked = await world.open()
    await TH.expectRefusal(Box.make(locked, record).extractWhisper(), 'vault_locked')
  })

  it("refuses 'vault_closed' once the vault is closed", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const box = await gotBox(vault)
    vault.close()
    await TH.expectRefusal(box.extractWhisper(), 'vault_closed')
  })
})

describe("what a vault hands its boxes", () => {
  it("exposes the logger and key deriver it was made with, read-only", async () => {
    const world = makeWorld()
    const vault = await world.open()
    expect(vault.keyDeriver).to.equal(TH.testDeriver)
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
    const summary = TH.summaryOf(vault.boxes[0])
    const sidecar = summary?.sidecar as { note: string, tags: string[] }
    expect(() => { sidecar.note = 'changed' }).to.throw(TypeError)
    expect(() => { sidecar.tags.push('mallory') }).to.throw(TypeError)
    await vault.hello({ staleMinutes: 0 })
    expect(TH.summaryOf(vault.boxes[0])?.sidecar).to.deep.equal({ note: 'work account', tags: ['team'] })
  })

  it("lists each sidecar as the listing's check made it, frozen where it stands, never serialized and parsed again", async () => {
    const world = makeWorld()
    const writer = await world.openUnlocked('pw')
    await writer.putBox({ boxlabel: 'anthropic', sidecar: { note: 'work account' } }, 'sk-fake')
    writer.close()
    const listings = vi.spyOn(world.vaultDB, 'getVault')
    const parses = vi.spyOn(JSON, 'parse')
    const stringifies = vi.spyOn(JSON, 'stringify')
    // Opened anew, so its listing is a read's.
    const vault = await world.open()
    const sidecar = TH.summaryOf(vault.boxes[0])?.sidecar
    const listed = await Promise.all(listings.mock.results.map(async (result) => valOf(await (result.value as ReturnType<VaultDB['getVault']>))?.boxes ?? []))
    expect(listed.some(([box]) => box !== undefined && ! box.damaged && box.sidecar === sidecar)).to.be.true
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
