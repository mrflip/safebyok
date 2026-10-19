import { describe, it, expect, vi } from 'vitest'
import * as ZClassic from 'zod'
import * as Z from 'zod/mini'
import { memoryDeviceDB, type DeviceDB } from '../../src/device-db'
import { localVaultDB, type VaultDB } from '../../src/vault-db'
import { retireDamagedVault, type MakeVaultOpts } from '../../src/vault'
import { toB64 } from '../../src/crypto'
import * as Ckeys from '../../src/ckeys'
import * as TH from '../test-helpers'
import { makeWorld, u1BoxCkey, storedRowOf, boxlabelsOf, rowsOf, damagedVaultWorld, u1VaultPropsCkey, isU1Box, storedVaultPropsOf, MisfitStores, VaultDBVerbsUsed, wayinlabelsOf, vaultWithPasskey } from './world'


/** A stored lockbox row, as text, with its whisper's ciphertext bent a little. */
const withTweakedCiphertext = (row: Record<string, unknown>): string => {
  const ciphered = row['whisper_ciphered'] as { cipher_iv_b64: string, ciphertext_b64: string }
  const tweaked = TH.tweakB64(ciphered.ciphertext_b64)
  return JSON.stringify({ ...row, whisper_ciphered: { ...ciphered, ciphertext_b64: tweaked } })
}

/** Ways a stored lockbox row can be spoiled so that it reads as 'damaged_lockbox'. */
const SpoiledBoxes = [
  [withTweakedCiphertext,                                                                        'whose ciphertext was altered, so it fails verification'],
  [({ whisper_ciphered: _gone, ...row }: Record<string, unknown>) => JSON.stringify(row),       'missing its whisper, so it is no lockbox this package knows'],
  [(row: Record<string, unknown>) => JSON.stringify({ ...row, boxlabel: 'other_box' }),          'naming another boxlabel than the one it is stored under'],
  [() => '{"not": json',                                                                         'that is not JSON at all'],
] as const

describe("retireBox and retire", () => {
  for (const [spoil, blurb] of SpoiledBoxes) {
    it(`retireBox removes a lockbox ${blurb}, and leaves the vault's other boxes as they were`, async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw')
      await vault.storeBox('anthropic', 'sk-ant-fake')
      await vault.storeBox('openai', 'sk-openai-fake', { sidecar: { note: 'work account' } })
      world.dbStore.write(u1BoxCkey('anthropic'), spoil(storedRowOf(world, 'anthropic')))
      await TH.expectRefusal(vault.readBox('anthropic'), 'damaged_lockbox')
      await vault.retireBox('anthropic')
      expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.be.null
      expect(boxlabelsOf(vault)).to.deep.equal(['openai'])
      expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({ note: 'work account' })
      expect(await vault.readBox('openai')).to.eq('sk-openai-fake')
    })
  }

  it("retireBox of a lockbox that fails verification still needs the vault unlocked, and leaves it as it is", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-ant-fake')
    const [spoil] = SpoiledBoxes[0]
    const spoiled = spoil(storedRowOf(world, 'anthropic'))
    world.dbStore.write(u1BoxCkey('anthropic'), spoiled)
    await vault.lock()
    await TH.expectRefusal(vault.retireBox('anthropic'), 'vault_locked')
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.eq(spoiled)
  })

  it("retireBox removes the box; a second retireBox finds it absent", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    await vault.retireBox('anthropic')
    expect(vault.getSnapshot().boxes).to.have.lengthOf(0)
    await TH.expectRefusal(vault.retireBox('anthropic'), 'absent_box')
  })

  it("retire removes every trace of this vault, and only this vault", async () => {
    const world = makeWorld()
    const mine = await world.openUnlocked('my pw')
    await mine.storeBox('anthropic', 'mine')
    const theirs = await world.openUnlocked('their pw', { userId: 'u2' })
    await theirs.storeBox('anthropic', 'theirs')

    await mine.retire()
    expect(mine.getSnapshot().state).to.eq('absent')
    expect(world.dbStore.ckeys().filter((ckey) => ckey.includes(':u1:'))).to.have.lengthOf(0)
    expect(await theirs.readBox('anthropic')).to.eq('theirs')
  })

  it("retire works on a locked vault: owning the account is enough to delete it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    await vault.lock()
    await vault.retire()
    expect(vault.getSnapshot().state).to.eq('absent')
  })

  it("retire on a handle that has seen no vault looks first, and retires the one made elsewhere since: 'delete my vault' never reports success over one standing", async () => {
    const world = makeWorld()
    const handle = await world.open({ vaultDB: world.deafVaultDB() })
    expect(handle.getSnapshot().state).to.eq('absent')
    const elsewhere = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    await elsewhere.storeBox('anthropic', 'sk-fake')
    await handle.retire()
    expect(handle.getSnapshot().state).to.eq('absent')
    expect(rowsOf(world, 'u1')).to.deep.equal([])
  })

  it("retire on a vault already gone is quiet: a second retire finds nothing to refuse", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.retire()
    await vault.unlock('pw')
    await vault.retire()
    await vault.retire()
    expect(vault.getSnapshot().state).to.eq('absent')
  })
})

describe("retireDamagedVault", () => {
  it("clears a vault whose hello() refuses it as damaged_vault -- its vault props, its lockboxes and this device's lease -- so a new one can be made", async () => {
    const world = await damagedVaultWorld()
    expect(await world.readLease()).to.not.be.null
    await TH.expectRefusal(world.open(), 'damaged_vault')
    await retireDamagedVault(world.optsWith())
    expect(rowsOf(world, 'u1')).to.deep.equal([])
    expect(await world.readLease()).to.be.null
    const fresh = await world.open()
    expect(fresh.getSnapshot().state).to.eq('absent')
    await fresh.unlock('another pw')
    await fresh.storeBox('anthropic', 'sk-new-fake')
    expect(await fresh.readBox('anthropic')).to.eq('sk-new-fake')
  })

  it("says the device store failing as it clears this device as 'storage_unavailable', naming what failed, the vault already retired", async () => {
    const world = await damagedVaultWorld()
    const trouble = new Error('device storage is unavailable')
    vi.spyOn(world.deviceDB, 'eraseMark').mockRejectedValueOnce(trouble)
    const err = await TH.expectRefusal(retireDamagedVault(world.optsWith()), 'storage_unavailable')
    expect(err.message).to.match(/erasing its mark of this vault/)
    expect(err.cause).to.eq(trouble)
    expect(rowsOf(world, 'u1')).to.deep.equal([])
  })

  it("retires that vault alone: another user's vault, and this device's lease of it, stay", async () => {
    const world = await damagedVaultWorld()
    const theirs = await world.openUnlocked('their pw', { userId: 'u2' })
    await theirs.storeBox('anthropic', 'theirs')
    await retireDamagedVault(world.optsWith())
    expect(await theirs.readBox('anthropic')).to.eq('theirs')
    expect(await world.deviceDB.readLease(TH.scopeOf('u2'))).to.not.be.null
    expect(rowsOf(world, 'u2')).to.not.deep.equal([])
  })

  it("refuses a vault that stands sound, removing nothing from storage or the device: that one is retire()'s", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    const before = world.dbStore.ckeys().map((ckey) => [ckey, world.dbStore.read(ckey)])
    const lease = await world.readLease()
    const err = await TH.expectRefusal(retireDamagedVault(world.optsWith()), 'bad_option')
    expect(err.message).to.include('retire()')
    expect(world.dbStore.ckeys().map((ckey) => [ckey, world.dbStore.read(ckey)])).to.deep.equal(before)
    expect(await world.readLease()).to.deep.equal(lease)
    expect(await vault.readBox('anthropic')).to.eq('sk-fake')
  })

  it("refuses vault props too damaged to name their vault, removing nothing, the lease included", async () => {
    const world = await damagedVaultWorld()
    world.dbStore.write(u1VaultPropsCkey, '{"format":"safebyok-vault-v1"}')
    const err = await TH.expectRefusal(retireDamagedVault(world.optsWith()), 'damaged_vault')
    expect(err.message).to.include('nothing was removed')
    expect(world.dbStore.read(u1VaultPropsCkey)).to.eq('{"format":"safebyok-vault-v1"}')
    expect(world.dbStore.ckeys().some((ckey) => isU1Box(ckey))).to.eq(true)
    expect(await world.readLease()).to.not.be.null
  })

  it("refuses a vault a newer safebyok may have written as newer_format, as hello() does: nothing retired, the lease kept", async () => {
    const world = await damagedVaultWorld()
    const newer = JSON.stringify({ ...storedVaultPropsOf(world), format: 'safebyok-vault-v4' })
    world.dbStore.write(u1VaultPropsCkey, newer)
    const atOpen = await TH.expectRefusal(world.open(), 'newer_format')
    expect(atOpen.message).to.include('update the app')
    const err = await TH.expectRefusal(retireDamagedVault(world.optsWith()), 'newer_format')
    expect(err.message).to.include('newer version')
    expect(world.dbStore.read(u1VaultPropsCkey)).to.eq(newer)
    expect(world.dbStore.ckeys().some((ckey) => isU1Box(ckey))).to.eq(true)
    expect(await world.readLease()).to.not.be.null
  })

  it("with no vault stored, clears only a leftover lease, and a call cut short by the device can be made again", async () => {
    const world = await damagedVaultWorld()
    let failures = 1
    const flakyDevice: DeviceDB = {
      ...world.deviceDB,
      eraseLease: async (scope) => {
        if (failures > 0) { failures -= 1; throw new Error('device store is busy') }
        await world.deviceDB.eraseLease(scope)
      },
    }
    const err = await TH.expectRefusal(retireDamagedVault(world.optsWith({ deviceDB: flakyDevice })), 'storage_unavailable')
    expect((err.cause as Error).message).to.include('busy')
    expect(rowsOf(world, 'u1')).to.deep.equal([])
    expect(await world.readLease()).to.not.be.null
    await retireDamagedVault(world.optsWith({ deviceDB: flakyDevice }))
    expect(await world.readLease()).to.be.null
  })

  it("lets a vault made anew since survive: stale_write, the new vault and its unlock untouched", async () => {
    const world = await damagedVaultWorld()
    // Storage answers the first look at the vault props with the damaged vault, and every later one with another.
    let looks = 0
    const replacing = localVaultDB({
      store: {
        ...world.dbStore,
        read: (ckey) => {
          if (ckey !== u1VaultPropsCkey) { return world.dbStore.read(ckey) }
          looks += 1
          return looks === 1 ? world.dbStore.read(ckey) : JSON.stringify({ ...storedVaultPropsOf(world), vault_id: 'made-anew' })
        },
      },
    })
    await TH.expectRefusal(retireDamagedVault(world.optsWith({ vaultDB: replacing })), 'stale_write')
    expect(world.dbStore.ckeys().some((ckey) => isU1Box(ckey))).to.eq(true)
    expect(await world.readLease()).to.not.be.null
  })

  it("checks the scope with the vault's validators, handing the VaultDB's verb the scope alone, and refuses a misspelt bag as Vault.make does", async () => {
    const world = await damagedVaultWorld()
    const longUserId = ZClassic.string().min(1).max(300)
    const verb = vi.spyOn(world.vaultDB, 'retireDamagedVault')
    await TH.expectRefusal(retireDamagedVault(world.optsWith({ validators: { userID: longUserId } as unknown as MakeVaultOpts['validators'] })), 'bad_option')
    const narrowUserId = ZClassic.string().max(1)
    await TH.expectRefusal(retireDamagedVault(world.optsWith({ validators: { userId: narrowUserId } })), 'bad_label')
    expect(verb).not.toHaveBeenCalled()
    await retireDamagedVault(world.optsWith({ validators: { userId: longUserId } }))
    expect(verb.mock.calls[0]).to.deep.equal([TH.scopeOf('u1')])
    expect(rowsOf(world, 'u1')).to.deep.equal([])
  })

  it("takes the options Vault.make took, and refuses misuse before touching storage", async () => {
    const world = await damagedVaultWorld()
    await TH.expectRefusal(retireDamagedVault(world.optsWith({ applabel: 'not-a-label' })), 'bad_label')
    await TH.expectRefusal(retireDamagedVault(world.optsWith({ userId: '' })), 'bad_label')
    await TH.expectRefusal(retireDamagedVault(null as unknown as MakeVaultOpts), 'bad_option')
    for (const [misfit] of MisfitStores) {
      await TH.expectRefusal(retireDamagedVault(world.optsWith(misfit)), 'bad_option')
    }
    const withoutTheVerb = Object.fromEntries(VaultDBVerbsUsed.map((verb) => [verb, () => Promise.resolve(null)])) as unknown as VaultDB
    await TH.expectRefusal(retireDamagedVault(world.optsWith({ vaultDB: withoutTheVerb })), 'bad_option')
    expect(world.dbStore.ckeys().some((ckey) => isU1Box(ckey))).to.eq(true)
    expect(await world.readLease()).to.not.be.null
  })

  it("checks names with the host's validators, as Vault.make does", async () => {
    const world = makeWorld()
    const opts = world.optsWith({ userId: 'u1@example', validators: { userId: Z.string() } })
    const vault = await TH.settledVault(opts)
    await vault.unlock('pw')
    vault.close()
    const ckey = Ckeys.vaultProps({ applabel: 'acme', user_id: 'u1@example', vaultlabel: 'main' })
    const vaultProps = JSON.parse(world.dbStore.read(ckey) ?? 'null') as object
    world.dbStore.write(ckey, JSON.stringify({ ...vaultProps, unlock_epoch: 'one' }))
    await retireDamagedVault(opts)
    expect(world.dbStore.read(ckey)).to.be.null
  })
})

/** The VaultDB verbs that write to storage, so a test can count every write a call makes. */
const WriteVerbs = ['fetchOrCreateVaultProps', 'updateVaultProps', 'updateBox', 'retireBox', 'retireVault', 'retireDamagedVault'] as const

/** Ways a stored lockbox row can be spoiled that the listing sees, so that it lists as damaged. */
const DamagedListings = [
  [() => '{"not": json',                                                                          'that is not JSON at all'],
  [(row: Record<string, unknown>) => JSON.stringify({ ...row, boxlabel: 'other_box' }),           'naming another boxlabel than the one it is stored under'],
  [(row: Record<string, unknown>) => JSON.stringify({ ...row, written_at: 1_792_022_400_000.5 }), 'whose written_at holds a fraction of a millisecond'],
  [(row: Record<string, unknown>) => JSON.stringify({ ...row, sidecar_json: '{"note":' }),         'whose sidecar is not JSON'],
  [(row: Record<string, unknown>) => JSON.stringify({ ...row, format: 'safebyok-lockbox-v9' }),   'written in a format this version does not know'],
  [({ sidecar_json: kept, ...row }: Record<string, unknown>) => JSON.stringify({ ...row, format: 'safebyok-lockbox-v4', public_json: kept }), 'written before the sidecar was named, as safebyok-lockbox-v4 with its public_json'],
  [({ written_at: kept, ...row }: Record<string, unknown>) => JSON.stringify({ ...row, format: 'safebyok-lockbox-v3', changed_at: kept }), 'written before written_at, as safebyok-lockbox-v3 with its changed_at'],
] as const

/** A world holding `anthropic`, spoiled by `spoil`, beside a sound `openai` with a sidecar; and the vault that stored them, unlocked. */
const worldWithDamagedBox = async (spoil: (row: Record<string, unknown>) => string, overrides?: Partial<MakeVaultOpts>) => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw', overrides)
  await vault.storeBox('anthropic', 'sk-ant-fake', { sidecar: { note: 'personal account' } })
  await vault.storeBox('openai', 'sk-openai-fake', { sidecar: { note: 'work account' } })
  world.dbStore.write(u1BoxCkey('anthropic'), spoil(storedRowOf(world, 'anthropic')))
  return { world, vault }
}

describe("damaged lockboxes", () => {
  for (const [spoil, blurb] of DamagedListings) {
    it(`a vault with a lockbox ${blurb} opens, listing it as damaged among the others`, async () => {
      const { world } = await worldWithDamagedBox(spoil)
      const fresh = await world.open()
      expect(fresh.getSnapshot().state).to.eq('unlocked')
      expect(fresh.getSnapshot().boxes).to.have.lengthOf(2)
      expect(fresh.getSnapshot().boxes[0]).to.deep.include({ boxlabel: 'anthropic', damaged: true })
      expect(fresh.getSnapshot().boxes[1]).to.deep.include({ boxlabel: 'openai', sidecar: { note: 'work account' }, damaged: false })
      expect(world.logged).to.have.lengthOf(0)
    })

    it(`a freshly opened vault retires a lockbox ${blurb}, and keeps the rest`, async () => {
      const { world } = await worldWithDamagedBox(spoil)
      const fresh = await world.open()
      await fresh.retireBox('anthropic')
      expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.be.null
      expect(boxlabelsOf(fresh)).to.deep.equal(['openai'])
      expect(await fresh.readBox('openai')).to.eq('sk-openai-fake')
    })
  }

  // The first names no revision, so a store over it is refused (below).
  for (const [spoil, blurb] of DamagedListings.slice(1)) {
    it(`storeBox over a lockbox ${blurb} writes it afresh, carrying nothing from it`, async () => {
      const { world, vault } = await worldWithDamagedBox(spoil)
      world.advance(60_000)
      await vault.storeBox('anthropic', 'sk-ant-new')
      expect(await vault.readBox('anthropic')).to.eq('sk-ant-new')
      const summary = TH.summaryOf(vault.getSnapshot().boxes[0])
      expect(summary).to.deep.include({ boxlabel: 'anthropic', sidecar: {}, registered_at: world.clock.now(), written_at: world.clock.now() })
      expect(boxlabelsOf(vault)).to.deep.equal(['anthropic', 'openai'])
    })
  }

  it("readBox and useBox refuse a damaged lockbox as 'damaged_lockbox', handing the callback nothing, and leave it as it is", async () => {
    const [spoil] = DamagedListings[1]
    const { world, vault } = await worldWithDamagedBox(spoil)
    const spoiled = world.dbStore.read(u1BoxCkey('anthropic'))
    const callback = vi.fn()
    await TH.expectRefusal(vault.readBox('anthropic'), 'damaged_lockbox')
    await TH.expectRefusal(vault.useBox('anthropic', callback), 'damaged_lockbox')
    expect(callback).not.toHaveBeenCalled()
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.eq(spoiled)
    expect(vault.getSnapshot().boxes[0]).to.deep.include({ boxlabel: 'anthropic', damaged: true })
  })

  it("a background refresh lists a lockbox damaged elsewhere, warning nothing", async () => {
    const [spoil] = DamagedListings[0]
    const { world, vault } = await worldWithDamagedBox(spoil)
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().boxes[0]).to.deep.include({ boxlabel: 'anthropic', damaged: true })
    expect(world.logged).to.have.lengthOf(0)
  })

  it("retireBox of a sound lockbox beside a damaged one lands without complaint, the damaged one still listed", async () => {
    const [spoil] = DamagedListings[2]
    const { world, vault } = await worldWithDamagedBox(spoil)
    await vault.retireBox('openai')
    expect(world.dbStore.read(u1BoxCkey('openai'))).to.be.null
    expect(vault.getSnapshot().boxes).to.have.lengthOf(1)
    expect(vault.getSnapshot().boxes[0]).to.deep.include({ boxlabel: 'anthropic', damaged: true })
  })

  it("storeBox over a damaged lockbox whose record names its revision is a single write to storage, over that revision", async () => {
    const [spoil] = DamagedListings[2]
    const { world, vault } = await worldWithDamagedBox(spoil)
    const revisionTok = storedRowOf(world, 'anthropic')['revision_tok']
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().boxes[0]).to.deep.equal({ boxlabel: 'anthropic', damaged: true, revision_tok: revisionTok })
    const writes = WriteVerbs.map((verb) => [verb, vi.spyOn(world.vaultDB, verb)] as const)
    const updateBox = vi.spyOn(world.vaultDB, 'updateBox')
    await vault.storeBox('anthropic', 'sk-ant-new')
    const callsOf = Object.fromEntries(writes.map(([verb, spy]) => [verb, spy.mock.calls.length]))
    expect(callsOf).to.deep.equal({ fetchOrCreateVaultProps: 0, updateVaultProps: 0, updateBox: 1, retireBox: 0, retireVault: 0, retireDamagedVault: 0 })
    expect(updateBox.mock.calls[0]?.[2]).to.deep.include({ revision_tok: revisionTok })
    expect(await vault.readBox('anthropic')).to.eq('sk-ant-new')
    vi.restoreAllMocks()
  })

  it("storeBox over a damaged lockbox whose record names no revision refuses it as 'damaged_lockbox', writing nothing; once retired, the store lands", async () => {
    const [spoil] = DamagedListings[0]
    const { world, vault } = await worldWithDamagedBox(spoil)
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().boxes[0]).to.deep.equal({ boxlabel: 'anthropic', damaged: true, revision_tok: null })
    const spoiled = world.dbStore.read(u1BoxCkey('anthropic'))
    const writes = WriteVerbs.map((verb) => vi.spyOn(world.vaultDB, verb))
    const refusal = await TH.expectRefusal(vault.storeBox('anthropic', 'sk-ant-new'), 'damaged_lockbox')
    expect(refusal.message).to.match(/damaged beyond naming.*Nothing was written\. Remove it with retireBox\(\) first/)
    expect(refusal.message).to.not.include('anthropic')
    for (const spy of writes) { expect(spy).not.toHaveBeenCalled() }
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.eq(spoiled)
    vi.restoreAllMocks()
    await vault.retireBox('anthropic')
    await vault.storeBox('anthropic', 'sk-ant-new')
    expect(await vault.readBox('anthropic')).to.eq('sk-ant-new')
  })

  it("lists a lockbox under a vaultKey the vault does not hold as damaged from its epoch alone, its revision kept, and storeBox() replaces it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    const row = storedRowOf(world, 'anthropic')
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...row, vault_key_epoch: 5 }))
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().boxes).to.deep.equal([{ boxlabel: 'anthropic', damaged: true, revision_tok: row['revision_tok'] }])
    await TH.expectRefusal(vault.readBox('anthropic'), 'damaged_lockbox')
    await vault.storeBox('anthropic', 'sk-fake-again')
    expect(await vault.readBox('anthropic')).to.eq('sk-fake-again')
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.vault_key_epoch).to.eq(1)
  })

  it("storeBox over a lockbox it lists as damaged under its epoch alone carries nothing from it: a record that will not open vouches for no sidecar", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake', { sidecar: { note: 'work account' } })
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), vault_key_epoch: 5 }))
    await TH.wakeupAtNextTick()
    await vault.storeBox('anthropic', 'sk-fake-again')
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({})
  })

  it("storeBox over a damaged lockbox keeps a sidecar given with it", async () => {
    const [spoil] = DamagedListings[3]
    const { vault } = await worldWithDamagedBox(spoil)
    await vault.storeBox('anthropic', 'sk-ant-new', { sidecar: { note: 'mended' } })
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({ note: 'mended' })
  })

  it("storeBox over a damaged lockbox in a full vault replaces it, never refused by maxLockboxes", async () => {
    const [spoil] = DamagedListings[2]
    const { vault } = await worldWithDamagedBox(spoil, { maxLockboxes: 2 })
    await vault.storeBox('anthropic', 'sk-ant-new')
    expect(await vault.readBox('anthropic')).to.eq('sk-ant-new')
    await TH.expectRefusal(vault.storeBox('third', 'sk-fake'), 'vault_full')
  })

  it("storeBox over a lockbox that lists soundly but will not open, missing its whisper, writes it afresh", async () => {
    const { world, vault } = await worldWithDamagedBox(({ whisper_ciphered: _gone, ...row }) => JSON.stringify(row))
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({ note: 'personal account' })
    world.advance(60_000)
    await vault.storeBox('anthropic', 'sk-ant-new')
    expect(await vault.readBox('anthropic')).to.eq('sk-ant-new')
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])).to.deep.include({ sidecar: {}, registered_at: world.clock.now() })
  })

  it("storeBox over a damaged lockbox still needs the vault unlocked, and leaves it as it is", async () => {
    const [spoil] = DamagedListings[1]
    const { world, vault } = await worldWithDamagedBox(spoil)
    const spoiled = world.dbStore.read(u1BoxCkey('anthropic'))
    await vault.lock()
    await TH.expectRefusal(vault.storeBox('anthropic', 'sk-ant-new'), 'vault_locked')
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.eq(spoiled)
  })

  it("a damaged lockbox's listing quotes nothing from its record", async () => {
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
  await vault.storeBox('anthropic', 'sk-fake')
  const spareId = await vault.addPassphrase('pw', 'spare', { wayinlabel: 'spare' })
  spoilSecondWayin(world, { salt_b64: 'c2FsdA' })
  const fresh = await world.open({ deviceDB: memoryDeviceDB() })
  return { world, fresh, spareId }
}

describe("a way in stored damaged", () => {

  it("shuts out no other: the vault's sound passphrase still opens it", async () => {
    const { fresh } = await vaultWithDamagedSpare()
    await fresh.unlock('pw')
    expect(await fresh.readBox('anthropic')).to.eq('sk-fake')
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
    await fresh.retireWayin('pw', spareId)
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
