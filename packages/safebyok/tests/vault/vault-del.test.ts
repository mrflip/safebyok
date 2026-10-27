import { describe, it, expect, vi } from 'vitest'
import { memoryDeviceDB } from '../../src/device-db'
import { toB64 } from '../../src/crypto'
import { StaleMinutes } from '../../src/types/types'
import { MinuteMillis } from '../../src/consts'
import * as TH from '../test-helpers'
import { makeWorld, u1BoxScopepath, storedRowOf, storedVaultRecordOf, boxlabelsOf, rowsOf, u1VaultScopepath, vaultWithPasskey, spoilWayin } from './world'

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
  it("deletes as del()'s example shows: storage holds a tombstone, and bank.ensureVault births the next life, novel", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    TH.answering(vault, async (gating) => {
      if (gating.gatingkind === 'del_vault') { await gating.attempt('pw') }
    })
    await vault.del()
    expect(storedVaultRecordOf(world)).to.include({ format: 'safebyok-tombstone-v1' })
    const next = await TH.bankOf(vault).ensureVault({ user_id: 'u1', vaultlabel: 'main' })
    expect(TH.stateOf(next.snapshot)).to.eq('novel')
    expect(next.vault_tok).to.not.eq(vault.vault_tok)
  })

  for (const [spoil, blurb] of SpoiledBoxes) {
    it(`delBox removes a box ${blurb}, and leaves the vault's other boxes as they were`, async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw')
      await vault.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake')
      await vault.putBox({ boxlabel: 'openai', sidecar: { note: 'work account' } }, 'sk-openai-fake')
      world.dbStore.write(u1BoxScopepath('anthropic'), spoil(storedRowOf(world, 'anthropic')))
      await TH.expectRefusal(vault.getWhisper('anthropic'), 'damaged_box')
      await vault.delBox('anthropic')
      expect(world.dbStore.read(u1BoxScopepath('anthropic'))).to.be.null
      expect(boxlabelsOf(vault)).to.deep.equal(['openai'])
      expect(vault.getSnapshot().boxes[0]?.sidecar).to.deep.equal({ note: 'work account' })
      expect(await vault.getWhisper('openai')).to.eq('sk-openai-fake')
    })
  }

  it("delBox of a box that fails verification still needs the vault unlocked, and leaves it as it is", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake')
    const [spoil] = SpoiledBoxes[0]
    const spoiled = spoil(storedRowOf(world, 'anthropic'))
    world.dbStore.write(u1BoxScopepath('anthropic'), spoiled)
    await vault.lock()
    await TH.expectRefusal(vault.delBox('anthropic'), 'vault_locked')
    expect(world.dbStore.read(u1BoxScopepath('anthropic'))).to.eq(spoiled)
  })

  it("delBox removes the box; a second delBox finds it absent", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    await vault.delBox('anthropic')
    expect(vault.getSnapshot().boxes).to.have.lengthOf(0)
    await TH.expectRefusal(vault.delBox('anthropic'), 'absent_box')
  })

  it("del() removes every trace of this vault but its tombstone, and only this vault: the Vault object is gone after", async () => {
    const world = makeWorld()
    const mine = await world.openUnlocked('my pw')
    await mine.putBox({ boxlabel: 'anthropic' }, 'mine')
    const theirs = await world.openUnlocked('their pw', { user_id: 'u2' })
    await theirs.putBox({ boxlabel: 'anthropic' }, 'theirs')

    await TH.del(mine, 'my pw')
    await TH.expectRefusal(mine.hello(), 'vault_gone')
    expect(rowsOf(world, 'u1'), 'a tombstone in the place of the vault record').to.deep.equal([u1VaultScopepath])
    expect(storedVaultRecordOf(world)['format']).to.eq('safebyok-tombstone-v1')
    expect(await world.getLease()).to.be.null
    expect(await theirs.getWhisper('anthropic')).to.eq('theirs')
  })

  it("del() works on a locked vault, proven by its passphrase, and the bank's next life is novel", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    await vault.lock()
    await TH.del(vault, 'pw')
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'vault_gone')
    const reborn = await TH.bankOf(vault).ensureVault({ user_id: 'u1', vaultlabel: 'main' })
    expect(TH.stateOf(reborn.getSnapshot())).to.eq('novel')
    expect(TH.cheatGetVaultEpoch(reborn).gate_epoch).to.eq(0)
    expect(reborn.getSnapshot().boxes).to.have.lengthOf(0)
  })

  it("del() raises this device's record of the vault to the tombstone's epoch, never erasing it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await TH.del(vault, 'pw')
    const tombstoneEpoch = storedVaultRecordOf(world)['vault_epoch']
    const deviceRecord = await TH.expectGood(world.deviceDB.getDeviceRecord(TH.scopeOf('u1')))
    expect(deviceRecord?.highest_vault_epoch).to.eq(tombstoneEpoch)
  })

  it("del() from a novel picture of a vault gated elsewhere since refuses absent_vault, deleting nothing: 'delete my vault' never reports success over one standing", async () => {
    const world = makeWorld()
    const stale = await world.open({ vaultDB: world.deafVaultDB() })
    expect(TH.stateOf(stale.getSnapshot())).to.eq('novel')
    const elsewhere = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    await elsewhere.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    await TH.expectRefusal(TH.del(stale, 'pw'), 'absent_vault')
    expect(storedVaultRecordOf(world)['format']).to.not.eq('safebyok-tombstone-v1')
    await stale.hello({ staleMinutes: 0 })
    expect(TH.stateOf(stale.getSnapshot())).to.eq('locked')
    await TH.del(stale, 'pw')
    expect(rowsOf(world, 'u1'), 'a tombstone in the place of the vault record').to.deep.equal([u1VaultScopepath])
  })

  it("del() from a novel picture older than staleMinutes reads first: the vault gated elsewhere since is asked for and deleted, never refused absent_vault", async () => {
    const world = makeWorld()
    const stale = await world.open({ vaultDB: world.deafVaultDB() })
    const elsewhere = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    await elsewhere.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    expect(TH.stateOf(stale.getSnapshot())).to.eq('novel')
    world.advance(StaleMinutes * MinuteMillis)
    await TH.del(stale, 'pw')
    expect(storedVaultRecordOf(world)).to.include({ format: 'safebyok-tombstone-v1' })
  })

  it("del() on a novel vault refuses absent_vault, asking nothing and writing nothing; once its first passphrase is set, del() lands, and a second refuses vault_gone; the next life's unlock and del() land", async () => {
    const world = makeWorld()
    const vault = await world.open()
    expect(TH.stateOf(vault.getSnapshot())).to.eq('novel')
    const stored = world.dbStore.read(u1VaultScopepath)
    const requestCleartext = vi.fn()
    const asked = await world.open({ requestCleartext })
    await TH.expectRefusal(asked.del(), 'absent_vault')
    expect(requestCleartext).not.toHaveBeenCalled()
    await TH.expectRefusal(TH.del(vault, 'pw'), 'absent_vault')
    expect(world.dbStore.read(u1VaultScopepath)).to.eq(stored)
    await TH.unlock(vault, 'pw')
    await TH.del(vault, 'pw')
    expect(storedVaultRecordOf(world)['format']).to.eq('safebyok-tombstone-v1')
    await TH.expectRefusal(TH.del(vault, 'pw'), 'vault_gone')
    const reborn = await TH.bankOf(vault).ensureVault({ user_id: 'u1', vaultlabel: 'main' })
    await TH.unlock(reborn, 'pw')
    await TH.del(reborn, 'pw')
    await TH.expectRefusal(TH.unlock(reborn, 'pw'), 'vault_gone')
  })
})

/** The VaultDB verbs that write to storage, so a test can count every write a call makes. */
const WriteVerbs = ['ensureVault', 'putVaultRecord', 'putBox', 'delBox', 'delVault', 'delDamagedVault'] as const

/** Ways a stored box row can be spoiled that the listing sees, so that it lists as damaged. */
const DamagedListings = [
  [() => '{"not": json',                                                                          'damaged',      'that is not JSON at all'],
  [(row: Record<string, unknown>) => JSON.stringify({ ...row, boxlabel: 'other_box' }),           'damaged',      'naming another boxlabel than the one it is stored under'],
  [(row: Record<string, unknown>) => JSON.stringify({ ...row, written_at: 1_792_022_400_000.5 }), 'damaged',      'whose written_at holds a fraction of a millisecond'],
  [(row: Record<string, unknown>) => JSON.stringify({ ...row, sidecar: undefined }),              'damaged',      'whose sidecar is gone'],
  [(row: Record<string, unknown>) => JSON.stringify({ ...row, format: 'safebyok-box-v9' }),       'newer_format', 'written in a format this version does not know, which a newer one may have written'],
  [({ sidecar: kept, ...row }: Record<string, unknown>) => JSON.stringify({ ...row, format: 'safebyok-box-v7', sidecar_json: JSON.stringify(kept) }), 'damaged', 'written before the sidecar was a JSON value, as safebyok-box-v7 with its sidecar_json'],
  [({ written_at: kept, ...row }: Record<string, unknown>) => JSON.stringify({ ...row, format: 'safebyok-box-v3', changed_at: kept }), 'damaged', 'written before written_at, as safebyok-box-v3 with its changed_at'],
] as const

/** A world holding `anthropic`, spoiled by `spoil`, beside a sound `openai` with a sidecar; and the vault that stored them, unlocked. */
const worldWithDamagedBox = async (spoil: (row: Record<string, unknown>) => string, overrides?: Partial<TH.BornVaultOpts>) => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw', overrides)
  await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'personal account' } }, 'sk-ant-fake')
  await vault.putBox({ boxlabel: 'openai', sidecar: { note: 'work account' } }, 'sk-openai-fake')
  // That write's bell is answered first: a ring during a read is answered by that read.
  await TH.wakeupAtNextTick()
  world.dbStore.write(u1BoxScopepath('anthropic'), spoil(storedRowOf(world, 'anthropic')))
  return { world, vault }
}

describe("damaged boxes", () => {
  for (const [spoil, damage, blurb] of DamagedListings) {
    it(`a vault with a box ${blurb} opens, listing it apart from the sound ones as ${damage}, holding room`, async () => {
      const { world } = await worldWithDamagedBox(spoil)
      const fresh = await world.open()
      expect(TH.stateOf(fresh.getSnapshot())).to.eq('unlocked')
      expect(fresh.getSnapshot().boxes).to.have.lengthOf(1)
      expect(fresh.getSnapshot().boxes[0]).to.deep.include({ boxlabel: 'openai', sidecar: { note: 'work account' } })
      expect(fresh.getSnapshot().damagedBoxes).to.have.lengthOf(1)
      expect(fresh.getSnapshot().damagedBoxes[0]).to.deep.include({ boxlabel: 'anthropic', damage })
      expect(fresh.getSnapshot().capacity.boxes.used).to.eq(2)
      expect(world.logged).to.have.lengthOf(0)
    })

    it(`a freshly opened vault deletes a box ${blurb}, and keeps the rest`, async () => {
      const { world } = await worldWithDamagedBox(spoil)
      const fresh = await world.open()
      await fresh.delBox('anthropic')
      expect(world.dbStore.read(u1BoxScopepath('anthropic'))).to.be.null
      expect(boxlabelsOf(fresh)).to.deep.equal(['openai'])
      expect(await fresh.getWhisper('openai')).to.eq('sk-openai-fake')
    })
  }

  // The first names no revision, so a store over it is refused (below).
  for (const [spoil, , blurb] of DamagedListings.slice(1)) {
    it(`putBox over a box ${blurb} writes it afresh, carrying nothing from it`, async () => {
      const { world, vault } = await worldWithDamagedBox(spoil)
      world.advance(60_000)
      await vault.putBox({ boxlabel: 'anthropic' }, 'sk-ant-new')
      expect(await vault.getWhisper('anthropic')).to.eq('sk-ant-new')
      const summary = vault.getSnapshot().boxes[0]
      expect(summary).to.deep.include({ boxlabel: 'anthropic', sidecar: {}, registered_at: world.clock.now(), written_at: world.clock.now() })
      expect(boxlabelsOf(vault)).to.deep.equal(['anthropic', 'openai'])
    })
  }

  it("getWhisper and useWhisper refuse a damaged box as 'damaged_box', handing the callback nothing, and leave it as it is", async () => {
    const [spoil] = DamagedListings[1]
    const { world, vault } = await worldWithDamagedBox(spoil)
    const spoiled = world.dbStore.read(u1BoxScopepath('anthropic'))
    const callback = vi.fn()
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'damaged_box')
    await TH.expectRefusal(vault.useWhisper('anthropic', callback), 'damaged_box')
    expect(callback).not.toHaveBeenCalled()
    expect(world.dbStore.read(u1BoxScopepath('anthropic'))).to.eq(spoiled)
    expect(vault.getSnapshot().damagedBoxes[0]).to.deep.include({ boxlabel: 'anthropic' })
  })

  it("a background refresh lists a box damaged elsewhere, warning nothing", async () => {
    const [spoil] = DamagedListings[0]
    const { world, vault } = await worldWithDamagedBox(spoil)
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().damagedBoxes[0]).to.deep.include({ boxlabel: 'anthropic' })
    expect(world.logged).to.have.lengthOf(0)
  })

  it("delBox of a sound box beside a damaged one lands without complaint, the damaged one still listed", async () => {
    const [spoil] = DamagedListings[2]
    const { world, vault } = await worldWithDamagedBox(spoil)
    await TH.wakeupAtNextTick()
    await vault.delBox('openai')
    expect(world.dbStore.read(u1BoxScopepath('openai'))).to.be.null
    expect(vault.getSnapshot().boxes).to.have.lengthOf(0)
    expect(vault.getSnapshot().damagedBoxes).to.have.lengthOf(1)
    expect(vault.getSnapshot().damagedBoxes[0]).to.deep.include({ boxlabel: 'anthropic' })
  })

  it("putBox over a damaged box whose record names its revision is a single write to storage, over that revision", async () => {
    const [spoil] = DamagedListings[2]
    const { world, vault } = await worldWithDamagedBox(spoil)
    const revisionTok = storedRowOf(world, 'anthropic')['revision_tok']
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().damagedBoxes).to.deep.equal([{ boxlabel: 'anthropic', revision_tok: revisionTok, damage: 'damaged' }])
    const writes = WriteVerbs.map((verb) => [verb, vi.spyOn(world.vaultDB, verb)] as const)
    const putBox = vi.spyOn(world.vaultDB, 'putBox')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-ant-new')
    const callsOf = Object.fromEntries(writes.map(([verb, spy]) => [verb, spy.mock.calls.length]))
    expect(callsOf).to.deep.equal({ ensureVault: 0, putVaultRecord: 0, putBox: 1, delBox: 0, delVault: 0, delDamagedVault: 0 })
    expect(putBox.mock.calls[0]?.[1]).to.deep.include({ revision_tok: revisionTok })
    expect(await vault.getWhisper('anthropic')).to.eq('sk-ant-new')
    vi.restoreAllMocks()
  })

  it("putBox over a damaged box whose record names no revision refuses it as 'damaged_box', writing nothing; once deleted, the store lands", async () => {
    const [spoil] = DamagedListings[0]
    const { world, vault } = await worldWithDamagedBox(spoil)
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().damagedBoxes).to.deep.equal([{ boxlabel: 'anthropic', revision_tok: null, damage: 'damaged' }])
    const spoiled = world.dbStore.read(u1BoxScopepath('anthropic'))
    const writes = WriteVerbs.map((verb) => vi.spyOn(world.vaultDB, verb))
    const refusal = await TH.expectRefusal(vault.putBox({ boxlabel: 'anthropic' }, 'sk-ant-new'), 'damaged_box')
    expect(refusal.message).to.match(/damaged beyond naming.*Nothing was written\. Remove it with delBox\(\) first/)
    expect(refusal.message).to.not.include('anthropic')
    for (const spy of writes) { expect(spy).not.toHaveBeenCalled() }
    expect(world.dbStore.read(u1BoxScopepath('anthropic'))).to.eq(spoiled)
    vi.restoreAllMocks()
    await vault.delBox('anthropic')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-ant-new')
    expect(await vault.getWhisper('anthropic')).to.eq('sk-ant-new')
  })

  it("putBox over a damaged box keeps a sidecar given with it", async () => {
    const [spoil] = DamagedListings[3]
    const { vault } = await worldWithDamagedBox(spoil)
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'mended' } }, 'sk-ant-new')
    expect(vault.getSnapshot().boxes[0]?.sidecar).to.deep.equal({ note: 'mended' })
  })

  it("putBox over a damaged box in a full vault replaces it, never refused by maxBoxes", async () => {
    const [spoil] = DamagedListings[2]
    const { vault } = await worldWithDamagedBox(spoil, { maxBoxes: 2 })
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-ant-new')
    expect(await vault.getWhisper('anthropic')).to.eq('sk-ant-new')
    await TH.expectRefusal(vault.putBox({ boxlabel: 'third' }, 'sk-fake'), 'vault_full')
  })

  it("putBox over a box that lists soundly but will not open, missing its whisper, writes it afresh", async () => {
    const { world, vault } = await worldWithDamagedBox(({ whisper_ciphered: _gone, ...row }) => JSON.stringify(row))
    expect(vault.getSnapshot().boxes[0]?.sidecar).to.deep.equal({ note: 'personal account' })
    world.advance(60_000)
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-ant-new')
    expect(await vault.getWhisper('anthropic')).to.eq('sk-ant-new')
    expect(vault.getSnapshot().boxes[0]).to.deep.include({ sidecar: {}, registered_at: world.clock.now() })
  })

  it("putBox over a damaged box still needs the vault unlocked, and leaves it as it is", async () => {
    const [spoil] = DamagedListings[1]
    const { world, vault } = await worldWithDamagedBox(spoil)
    const spoiled = world.dbStore.read(u1BoxScopepath('anthropic'))
    await vault.lock()
    await TH.expectRefusal(vault.putBox({ boxlabel: 'anthropic' }, 'sk-ant-new'), 'vault_locked')
    expect(world.dbStore.read(u1BoxScopepath('anthropic'))).to.eq(spoiled)
  })

  it("a damaged box's listing quotes nothing from its record", async () => {
    const { world } = await worldWithDamagedBox((row) => JSON.stringify({ ...row, written_at: 'FAKESECRET' }))
    const fresh = await world.open()
    expect(JSON.stringify(fresh.getSnapshot())).to.not.include('FAKESECRET')
  })
})

/**
 * A vault of the passphrase `pw` and the passkey `laptop`, the passkey's salt spoiled in storage,
 * freshly opened locked: the salt decodes, so passes the schema, but to 16 bytes, not the 32 a
 * passkey's salt has. Hands back the spoiled answer `laptop` gives for it.
 */
const vaultWithDamagedPasskey = async () => {
  const { world, laptop } = await vaultWithPasskey()
  const shortSalt = toB64(new Uint8Array(16))
  spoilWayin(world, 'passkey', { prf_salt_b64: shortSalt })
  const fresh = await world.open({ deviceDB: memoryDeviceDB() })
  return { world, fresh, spoiledLaptop: { ...laptop, prf_salt_b64: shortSalt } }
}

describe("a way in stored damaged", () => {

  it("shuts out no other: the vault's sound passphrase still opens it", async () => {
    const { fresh } = await vaultWithDamagedPasskey()
    await TH.unlock(fresh, 'pw')
    expect(await fresh.getWhisper('anthropic')).to.eq('sk-fake')
  })

  it("a passkey stored damaged refuses its answer as damaged_wayin, and the passphrase still opens", async () => {
    const { fresh, spoiledLaptop } = await vaultWithDamagedPasskey()
    const err = await TH.expectRefusal(TH.unlock(fresh, spoiledLaptop), 'damaged_wayin')
    expect(err.message).to.include('Unlock with the passphrase')
    await TH.unlock(fresh, 'pw')
    expect(TH.stateOf(fresh.getSnapshot())).to.eq('unlocked')
  })

  it("a passphrase stored damaged refuses it as damaged_wayin, quoting nothing, and the passkey still opens", async () => {
    const { world, laptop } = await vaultWithPasskey()
    spoilWayin(world, 'passphrase', { salt_b64: 'c2FsdA' })
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    const err = await TH.expectRefusal(TH.unlock(fresh, 'pw'), 'damaged_wayin')
    expect(TH.thrownText(err)).to.not.include('c2FsdA')
    await TH.unlock(fresh, laptop)
    expect(await fresh.getWhisper('anthropic')).to.eq('sk-fake')
  })

  it("a passkey stored damaged is removed by the passphrase, leaving the vault no passkey", async () => {
    const { fresh, spoiledLaptop } = await vaultWithDamagedPasskey()
    await TH.expectRefusal(TH.unlock(fresh, spoiledLaptop), 'damaged_wayin')
    expect(TH.stateOf(fresh.getSnapshot())).to.eq('locked')
    await TH.delWayin(fresh, 'pw')
    expect(fresh.getSnapshot().gate?.passkey).to.be.null
  })

  it("a passkey whose answer no longer opens vault record altered in storage is told that its way in may be damaged", async () => {
    const { world, laptop } = await vaultWithPasskey()
    const vaultRecord = JSON.parse(world.dbStore.read(u1VaultScopepath) ?? '{}') as { gate: { passkey: { registered_at: number } } }
    world.dbStore.write(u1VaultScopepath, JSON.stringify({ ...vaultRecord, gate: { ...vaultRecord.gate, passkey: { ...vaultRecord.gate.passkey, registered_at: vaultRecord.gate.passkey.registered_at - 1 } } }))
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    const err = await TH.expectRefusal(TH.unlock(fresh, laptop), 'wrong_passkey')
    expect(err.message).to.include('may be damaged')
  })
})
