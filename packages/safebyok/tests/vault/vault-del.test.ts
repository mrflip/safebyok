import { describe, it, expect, vi } from 'vitest'
import { memoryDeviceDB } from '../../src/device-db'
import { type MakeVaultOpts } from '../../src/vault-opts'
import { toB64 } from '../../src/crypto'
import * as TH from '../test-helpers'
import { makeWorld, u1BoxCkey, storedRowOf, boxlabelsOf, rowsOf, u1VaultPropsCkey, wayinlabelsOf, vaultWithPasskey } from './world'

/** A stored box row, as text, with its whisper's ciphertext bent a little. */
const withTweakedCiphertext = (row: Record<string, unknown>): string => {
  const ciphered = row['whisper_ciphered'] as { cipher_iv_b64: string, ciphertext_b64: string }
  const tweaked = TH.tweakB64(ciphered.ciphertext_b64)
  return JSON.stringify({ ...row, whisper_ciphered: { ...ciphered, ciphertext_b64: tweaked } })
}

/** Ways a stored box row can be spoiled so that it reads as 'damaged_box'. */
const SpoiledBoxes = [
  [withTweakedCiphertext,                                                                        'whose ciphertext was altered, so it fails verification'],
  [({ whisper_ciphered: _gone, ...row }: Record<string, unknown>) => JSON.stringify(row),       'missing its whisper, so it is no box this package knows'],
  [(row: Record<string, unknown>) => JSON.stringify({ ...row, boxlabel: 'other_box' }),          'naming another boxlabel than the one it is stored under'],
  [() => '{"not": json',                                                                         'that is not JSON at all'],
] as const

describe("delBox and del()", () => {
  for (const [spoil, blurb] of SpoiledBoxes) {
    it(`delBox removes a box ${blurb}, and leaves the vault's other boxes as they were`, async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw')
      await vault.putBox('anthropic', 'sk-ant-fake')
      await vault.putBox('openai', 'sk-openai-fake', { sidecar: { note: 'work account' } })
      world.dbStore.write(u1BoxCkey('anthropic'), spoil(storedRowOf(world, 'anthropic')))
      await TH.expectRefusal(vault.getBox('anthropic'), 'damaged_box')
      await vault.delBox('anthropic')
      expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.be.null
      expect(boxlabelsOf(vault)).to.deep.equal(['openai'])
      expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({ note: 'work account' })
      expect(await vault.getBox('openai')).to.eq('sk-openai-fake')
    })
  }

  it("delBox of a box that fails verification still needs the vault unlocked, and leaves it as it is", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox('anthropic', 'sk-ant-fake')
    const [spoil] = SpoiledBoxes[0]
    const spoiled = spoil(storedRowOf(world, 'anthropic'))
    world.dbStore.write(u1BoxCkey('anthropic'), spoiled)
    await vault.lock()
    await TH.expectRefusal(vault.delBox('anthropic'), 'vault_locked')
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.eq(spoiled)
  })

  it("delBox removes the box; a second delBox finds it absent", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox('anthropic', 'sk-fake')
    await vault.delBox('anthropic')
    expect(vault.getSnapshot().boxes).to.have.lengthOf(0)
    await TH.expectRefusal(vault.delBox('anthropic'), 'absent_box')
  })

  it("del() removes every trace of this vault, and only this vault", async () => {
    const world = makeWorld()
    const mine = await world.openUnlocked('my pw')
    await mine.putBox('anthropic', 'mine')
    const theirs = await world.openUnlocked('their pw', { userId: 'u2' })
    await theirs.putBox('anthropic', 'theirs')

    await mine.del()
    expect(mine.getSnapshot().state).to.eq('absent')
    expect(world.dbStore.ckeys().filter((ckey) => ckey.includes(':u1:'))).to.have.lengthOf(0)
    expect(await theirs.getBox('anthropic')).to.eq('theirs')
  })

  it("del() works on a locked vault: owning the account is enough to delete it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox('anthropic', 'sk-fake')
    await vault.lock()
    await vault.del()
    expect(vault.getSnapshot().state).to.eq('absent')
  })

  it("del() on a handle that has seen no vault looks first, and deletes the one made elsewhere since: 'delete my vault' never reports success over one standing", async () => {
    const world = makeWorld()
    const handle = await world.open({ vaultDB: world.deafVaultDB() })
    expect(handle.getSnapshot().state).to.eq('absent')
    const elsewhere = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    await elsewhere.putBox('anthropic', 'sk-fake')
    await handle.del()
    expect(handle.getSnapshot().state).to.eq('absent')
    expect(rowsOf(world, 'u1')).to.deep.equal([])
  })

  it("del() on a vault already gone is quiet: a second del() finds nothing to refuse", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.del()
    await vault.unlock('pw')
    await vault.del()
    await vault.del()
    expect(vault.getSnapshot().state).to.eq('absent')
  })
})

/** The VaultDB verbs that write to storage, so a test can count every write a call makes. */
const WriteVerbs = ['ensureVaultProps', 'putVaultProps', 'putBox', 'delBox', 'delVault', 'delDamagedVault'] as const

/** Ways a stored box row can be spoiled that the listing sees, so that it lists as damaged. */
const DamagedListings = [
  [() => '{"not": json',                                                                          'that is not JSON at all'],
  [(row: Record<string, unknown>) => JSON.stringify({ ...row, boxlabel: 'other_box' }),           'naming another boxlabel than the one it is stored under'],
  [(row: Record<string, unknown>) => JSON.stringify({ ...row, written_at: 1_792_022_400_000.5 }), 'whose written_at holds a fraction of a millisecond'],
  [(row: Record<string, unknown>) => JSON.stringify({ ...row, sidecar_json: '{"note":' }),         'whose sidecar is not JSON'],
  [(row: Record<string, unknown>) => JSON.stringify({ ...row, format: 'safebyok-box-v9' }),   'written in a format this version does not know'],
  [({ sidecar_json: kept, ...row }: Record<string, unknown>) => JSON.stringify({ ...row, format: 'safebyok-box-v4', public_json: kept }), 'written before the sidecar was named, as safebyok-box-v4 with its public_json'],
  [({ written_at: kept, ...row }: Record<string, unknown>) => JSON.stringify({ ...row, format: 'safebyok-box-v3', changed_at: kept }), 'written before written_at, as safebyok-box-v3 with its changed_at'],
] as const

/** A world holding `anthropic`, spoiled by `spoil`, beside a sound `openai` with a sidecar; and the vault that stored them, unlocked. */
const worldWithDamagedBox = async (spoil: (row: Record<string, unknown>) => string, overrides?: Partial<MakeVaultOpts>) => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw', overrides)
  await vault.putBox('anthropic', 'sk-ant-fake', { sidecar: { note: 'personal account' } })
  await vault.putBox('openai', 'sk-openai-fake', { sidecar: { note: 'work account' } })
  world.dbStore.write(u1BoxCkey('anthropic'), spoil(storedRowOf(world, 'anthropic')))
  return { world, vault }
}

describe("damaged boxes", () => {
  for (const [spoil, blurb] of DamagedListings) {
    it(`a vault with a box ${blurb} opens, listing it as damaged among the others`, async () => {
      const { world } = await worldWithDamagedBox(spoil)
      const fresh = await world.open()
      expect(fresh.getSnapshot().state).to.eq('unlocked')
      expect(fresh.getSnapshot().boxes).to.have.lengthOf(2)
      expect(fresh.getSnapshot().boxes[0]).to.deep.include({ boxlabel: 'anthropic', damaged: true })
      expect(fresh.getSnapshot().boxes[1]).to.deep.include({ boxlabel: 'openai', sidecar: { note: 'work account' }, damaged: false })
      expect(world.logged).to.have.lengthOf(0)
    })

    it(`a freshly opened vault deletes a box ${blurb}, and keeps the rest`, async () => {
      const { world } = await worldWithDamagedBox(spoil)
      const fresh = await world.open()
      await fresh.delBox('anthropic')
      expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.be.null
      expect(boxlabelsOf(fresh)).to.deep.equal(['openai'])
      expect(await fresh.getBox('openai')).to.eq('sk-openai-fake')
    })
  }

  // The first names no revision, so a store over it is refused (below).
  for (const [spoil, blurb] of DamagedListings.slice(1)) {
    it(`putBox over a box ${blurb} writes it afresh, carrying nothing from it`, async () => {
      const { world, vault } = await worldWithDamagedBox(spoil)
      world.advance(60_000)
      await vault.putBox('anthropic', 'sk-ant-new')
      expect(await vault.getBox('anthropic')).to.eq('sk-ant-new')
      const summary = TH.summaryOf(vault.getSnapshot().boxes[0])
      expect(summary).to.deep.include({ boxlabel: 'anthropic', sidecar: {}, registered_at: world.clock.now(), written_at: world.clock.now() })
      expect(boxlabelsOf(vault)).to.deep.equal(['anthropic', 'openai'])
    })
  }

  it("getBox and useBox refuse a damaged box as 'damaged_box', handing the callback nothing, and leave it as it is", async () => {
    const [spoil] = DamagedListings[1]
    const { world, vault } = await worldWithDamagedBox(spoil)
    const spoiled = world.dbStore.read(u1BoxCkey('anthropic'))
    const callback = vi.fn()
    await TH.expectRefusal(vault.getBox('anthropic'), 'damaged_box')
    await TH.expectRefusal(vault.useBox('anthropic', callback), 'damaged_box')
    expect(callback).not.toHaveBeenCalled()
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.eq(spoiled)
    expect(vault.getSnapshot().boxes[0]).to.deep.include({ boxlabel: 'anthropic', damaged: true })
  })

  it("a background refresh lists a box damaged elsewhere, warning nothing", async () => {
    const [spoil] = DamagedListings[0]
    const { world, vault } = await worldWithDamagedBox(spoil)
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().boxes[0]).to.deep.include({ boxlabel: 'anthropic', damaged: true })
    expect(world.logged).to.have.lengthOf(0)
  })

  it("delBox of a sound box beside a damaged one lands without complaint, the damaged one still listed", async () => {
    const [spoil] = DamagedListings[2]
    const { world, vault } = await worldWithDamagedBox(spoil)
    await vault.delBox('openai')
    expect(world.dbStore.read(u1BoxCkey('openai'))).to.be.null
    expect(vault.getSnapshot().boxes).to.have.lengthOf(1)
    expect(vault.getSnapshot().boxes[0]).to.deep.include({ boxlabel: 'anthropic', damaged: true })
  })

  it("putBox over a damaged box whose record names its revision is a single write to storage, over that revision", async () => {
    const [spoil] = DamagedListings[2]
    const { world, vault } = await worldWithDamagedBox(spoil)
    const revisionTok = storedRowOf(world, 'anthropic')['revision_tok']
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().boxes[0]).to.deep.equal({ boxlabel: 'anthropic', damaged: true, revision_tok: revisionTok })
    const writes = WriteVerbs.map((verb) => [verb, vi.spyOn(world.vaultDB, verb)] as const)
    const putBox = vi.spyOn(world.vaultDB, 'putBox')
    await vault.putBox('anthropic', 'sk-ant-new')
    const callsOf = Object.fromEntries(writes.map(([verb, spy]) => [verb, spy.mock.calls.length]))
    expect(callsOf).to.deep.equal({ ensureVaultProps: 0, putVaultProps: 0, putBox: 1, delBox: 0, delVault: 0, delDamagedVault: 0 })
    expect(putBox.mock.calls[0]?.[2]).to.deep.include({ revision_tok: revisionTok })
    expect(await vault.getBox('anthropic')).to.eq('sk-ant-new')
    vi.restoreAllMocks()
  })

  it("putBox over a damaged box whose record names no revision refuses it as 'damaged_box', writing nothing; once deleted, the store lands", async () => {
    const [spoil] = DamagedListings[0]
    const { world, vault } = await worldWithDamagedBox(spoil)
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().boxes[0]).to.deep.equal({ boxlabel: 'anthropic', damaged: true, revision_tok: null })
    const spoiled = world.dbStore.read(u1BoxCkey('anthropic'))
    const writes = WriteVerbs.map((verb) => vi.spyOn(world.vaultDB, verb))
    const refusal = await TH.expectRefusal(vault.putBox('anthropic', 'sk-ant-new'), 'damaged_box')
    expect(refusal.message).to.match(/damaged beyond naming.*Nothing was written\. Remove it with delBox\(\) first/)
    expect(refusal.message).to.not.include('anthropic')
    for (const spy of writes) { expect(spy).not.toHaveBeenCalled() }
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.eq(spoiled)
    vi.restoreAllMocks()
    await vault.delBox('anthropic')
    await vault.putBox('anthropic', 'sk-ant-new')
    expect(await vault.getBox('anthropic')).to.eq('sk-ant-new')
  })

  it("lists a box under a vaultKey the vault does not hold as damaged from its epoch alone, its revision kept, and putBox() replaces it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox('anthropic', 'sk-fake')
    const row = storedRowOf(world, 'anthropic')
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...row, vault_key_epoch: 5 }))
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().boxes).to.deep.equal([{ boxlabel: 'anthropic', damaged: true, revision_tok: row['revision_tok'] }])
    await TH.expectRefusal(vault.getBox('anthropic'), 'damaged_box')
    await vault.putBox('anthropic', 'sk-fake-again')
    expect(await vault.getBox('anthropic')).to.eq('sk-fake-again')
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.vault_key_epoch).to.eq(1)
  })

  it("putBox over a box it lists as damaged under its epoch alone carries nothing from it: a record that will not open vouches for no sidecar", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox('anthropic', 'sk-fake', { sidecar: { note: 'work account' } })
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), vault_key_epoch: 5 }))
    await TH.wakeupAtNextTick()
    await vault.putBox('anthropic', 'sk-fake-again')
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({})
  })

  it("putBox over a damaged box keeps a sidecar given with it", async () => {
    const [spoil] = DamagedListings[3]
    const { vault } = await worldWithDamagedBox(spoil)
    await vault.putBox('anthropic', 'sk-ant-new', { sidecar: { note: 'mended' } })
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({ note: 'mended' })
  })

  it("putBox over a damaged box in a full vault replaces it, never refused by maxBoxes", async () => {
    const [spoil] = DamagedListings[2]
    const { vault } = await worldWithDamagedBox(spoil, { maxBoxes: 2 })
    await vault.putBox('anthropic', 'sk-ant-new')
    expect(await vault.getBox('anthropic')).to.eq('sk-ant-new')
    await TH.expectRefusal(vault.putBox('third', 'sk-fake'), 'vault_full')
  })

  it("putBox over a box that lists soundly but will not open, missing its whisper, writes it afresh", async () => {
    const { world, vault } = await worldWithDamagedBox(({ whisper_ciphered: _gone, ...row }) => JSON.stringify(row))
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({ note: 'personal account' })
    world.advance(60_000)
    await vault.putBox('anthropic', 'sk-ant-new')
    expect(await vault.getBox('anthropic')).to.eq('sk-ant-new')
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])).to.deep.include({ sidecar: {}, registered_at: world.clock.now() })
  })

  it("putBox over a damaged box still needs the vault unlocked, and leaves it as it is", async () => {
    const [spoil] = DamagedListings[1]
    const { world, vault } = await worldWithDamagedBox(spoil)
    const spoiled = world.dbStore.read(u1BoxCkey('anthropic'))
    await vault.lock()
    await TH.expectRefusal(vault.putBox('anthropic', 'sk-ant-new'), 'vault_locked')
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.eq(spoiled)
  })

  it("a damaged box's listing quotes nothing from its record", async () => {
    const { world } = await worldWithDamagedBox((row) => JSON.stringify({ ...row, sidecar_json: '"FAKESECRET' }))
    const fresh = await world.open()
    expect(JSON.stringify(fresh.getSnapshot())).to.not.include('FAKESECRET')
  })
})

/** u1's stored vault props in `world`, their second way in spoiled by `spoil`. */
const spoilSecondWayin = (world: ReturnType<typeof makeWorld>, spoil: Record<string, unknown>) => {
  const vaultProps = JSON.parse(world.dbStore.read(u1VaultPropsCkey) ?? '{}') as { wayins: Record<string, unknown>[] }
  const wayins = vaultProps.wayins.map((wayin, ii) => (ii === 1 ? { ...wayin, ...spoil } : wayin))
  world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...vaultProps, wayins }))
}

/**
 * A vault of passphrases `pw` and `spare`, the spare's salt spoiled in storage, freshly opened
 * locked. 'c2FsdA' decodes, so passes the schema, but to four bytes: no 16-byte deriver made it.
 */
const vaultWithDamagedSpare = async () => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw')
  await vault.putBox('anthropic', 'sk-fake')
  const spareId = await vault.addPassphrase('pw', 'spare', { wayinlabel: 'spare' })
  spoilSecondWayin(world, { salt_b64: 'c2FsdA' })
  const fresh = await world.open({ deviceDB: memoryDeviceDB() })
  return { world, fresh, spareId }
}

describe("a way in stored damaged", () => {

  it("shuts out no other: the vault's sound passphrase still opens it", async () => {
    const { fresh } = await vaultWithDamagedSpare()
    await fresh.unlock('pw')
    expect(await fresh.getBox('anthropic')).to.eq('sk-fake')
  })

  it("refuses its own passphrase as wrong_passphrase, saying a damaged way in went untried", async () => {
    const { fresh } = await vaultWithDamagedSpare()
    const err = await TH.expectRefusal(fresh.unlock('spare'), 'wrong_passphrase')
    expect(err.message).to.include('stored damaged')
    expect(err.message).to.not.include('spare')
  })

  it("refuses an unlock aimed at it as damaged_wayin, and is removed by a sound way in", async () => {
    const { fresh, spareId } = await vaultWithDamagedSpare()
    await TH.expectRefusal(fresh.unlock('spare', { wayinId: spareId }), 'damaged_wayin')
    expect(fresh.getSnapshot().state).to.eq('locked')
    await fresh.delWayin('pw', spareId)
    expect(wayinlabelsOf(fresh)).to.deep.equal(['passphrase'])
  })

  it("a passkey stored damaged refuses its answer as damaged_wayin, and the passphrase still opens", async () => {
    const { world, laptop } = await vaultWithPasskey()
    const shortSalt = toB64(new Uint8Array(16))
    spoilSecondWayin(world, { prf_salt_b64: shortSalt })
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    const err = await TH.expectRefusal(fresh.unlock({ ...laptop, prfSaltB64: shortSalt }), 'damaged_wayin')
    expect(err.message).to.include('Unlock with a passphrase')
    await fresh.unlock('pw')
    expect(fresh.getSnapshot().state).to.eq('unlocked')
  })

  it("a passkey whose answer no longer opens vault props altered in storage is told that its way in may be damaged", async () => {
    const { world, laptop } = await vaultWithPasskey()
    const vaultProps = JSON.parse(world.dbStore.read(u1VaultPropsCkey) ?? '{}') as { registered_at: number }
    world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...vaultProps, registered_at: vaultProps.registered_at - 1 }))
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    const err = await TH.expectRefusal(fresh.unlock(laptop), 'wrong_passkey')
    expect(err.message).to.include('may be damaged')
  })
})
