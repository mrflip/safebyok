import { describe, it, expect, vi } from 'vitest'
import * as ZClassic from 'zod'
import * as Z from 'zod/mini'
import { type DeviceDB } from '../src/device-db'
import { localVaultDB, type VaultDB } from '../src/vault-db'
import { type MakeVaultOpts } from '../src/vault-opts'
import { retireDamagedVault } from '../src/retire-damaged-vault'
import * as Ckeys from '../src/ckeys'
import * as TH from './test-helpers'
import { damagedVaultWorld, rowsOf, makeWorld, u1VaultPropsCkey, isU1Box, storedVaultPropsOf, MisfitStores, VaultDBVerbsUsed } from './vault/world'


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
