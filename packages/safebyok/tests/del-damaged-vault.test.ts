import { describe, it, expect, vi } from 'vitest'
import { type DeviceDB } from '../src/device-db'
import { type VaultDB } from '../src/vault-db'
import { localVaultDB } from '../src/local-vault-db'
import { type DelDamagedVaultOpts } from '../src/del-damaged-vault'
import { delDamagedVault } from '../src/del-damaged-vault'
import { Bank } from '../src/bank'
import { isVaultError } from '../src/errors'
import * as Scopepath from '../src/scopepath'
import * as TH from './test-helpers'
import { damagedVaultWorld, rowsOf, makeWorld, u1VaultScopepath, isU1Box, storedVaultPropsOf, MisfitStores, VaultDBVerbsUsed } from './vault/world'


describe("delDamagedVault", () => {
  it("clears a vault whose birth refuses it as damaged_vault -- its vault props, its boxes and this device's lease -- so a new one can be born", async () => {
    const world = await damagedVaultWorld()
    expect(await world.getLease()).to.not.be.null
    await TH.expectRefusal(world.open(), 'damaged_vault')
    await delDamagedVault(world.optsWith())
    expect(rowsOf(world, 'u1'), 'a tombstone in the place of the vault props, and no box').to.deep.equal([u1VaultScopepath])
    expect(await world.getLease()).to.be.null
    const fresh = await world.open()
    expect(fresh.getSnapshot().state).to.eq('novel')
    await TH.unlock(fresh, 'another pw')
    await fresh.putBox({ boxlabel: 'anthropic' }, 'sk-new-fake')
    expect(await fresh.getWhisper('anthropic')).to.eq('sk-new-fake')
  })

  it("says the device store failing as it clears this device as 'storage_unavailable', naming what failed, the vault already deleted", async () => {
    const world = await damagedVaultWorld()
    const trouble = new Error('device storage is unavailable')
    vi.spyOn(world.deviceDB, 'raiseDeviceRecord').mockRejectedValueOnce(trouble)
    const err = await TH.expectRefusal(delDamagedVault(world.optsWith()), 'storage_unavailable')
    expect(err.message).to.match(/writing its record of this vault/)
    expect(err.cause).to.eq(trouble)
    expect(rowsOf(world, 'u1'), 'a tombstone in the place of the vault props, and no box').to.deep.equal([u1VaultScopepath])
  })

  it("deletes that vault alone: another user's vault, and this device's lease of it, stay", async () => {
    const world = await damagedVaultWorld()
    const theirs = await world.openUnlocked('their pw', { userId: 'u2' })
    await theirs.putBox({ boxlabel: 'anthropic' }, 'theirs')
    await delDamagedVault(world.optsWith())
    expect(await theirs.getWhisper('anthropic')).to.eq('theirs')
    expect(await TH.expectingGood(world.deviceDB).getLease(TH.scopeOf('u2'))).to.not.be.null
    expect(rowsOf(world, 'u2')).to.not.deep.equal([])
  })

  it("refuses a vault that stands sound, removing nothing from storage or the device: that one is del()'s", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const before = world.dbStore.ckeys().map((ckey) => [ckey, world.dbStore.read(ckey)])
    const lease = await world.getLease()
    const err = await TH.expectRefusal(delDamagedVault(world.optsWith()), 'bad_option')
    expect(err.message).to.include('del()')
    expect(world.dbStore.ckeys().map((ckey) => [ckey, world.dbStore.read(ckey)])).to.deep.equal(before)
    expect(await world.getLease()).to.deep.equal(lease)
    expect(await vault.getWhisper('anthropic')).to.eq('sk-fake')
  })

  it("refuses vault props too damaged to name their vault, removing nothing, the lease included", async () => {
    const world = await damagedVaultWorld()
    world.dbStore.write(u1VaultScopepath, '{"format":"safebyok-vault-v1"}')
    const err = await TH.expectRefusal(delDamagedVault(world.optsWith()), 'damaged_vault')
    expect(err.message).to.include('nothing was removed')
    expect(world.dbStore.read(u1VaultScopepath)).to.eq('{"format":"safebyok-vault-v1"}')
    expect(world.dbStore.ckeys().some((ckey) => isU1Box(ckey))).to.eq(true)
    expect(await world.getLease()).to.not.be.null
  })

  it("refuses a vault a newer safebyok may have written as newer_format, as hello() does: nothing deleted, the lease kept", async () => {
    const world = await damagedVaultWorld()
    const newer = JSON.stringify({ ...storedVaultPropsOf(world), format: 'safebyok-vault-v7' })
    world.dbStore.write(u1VaultScopepath, newer)
    const atOpen = await TH.expectRefusal(world.open(), 'newer_format')
    expect(atOpen.message).to.include('update the app')
    const err = await TH.expectRefusal(delDamagedVault(world.optsWith()), 'newer_format')
    expect(err.message).to.include('newer version')
    expect(world.dbStore.read(u1VaultScopepath)).to.eq(newer)
    expect(world.dbStore.ckeys().some((ckey) => isU1Box(ckey))).to.eq(true)
    expect(await world.getLease()).to.not.be.null
  })

  it("with no vault stored, clears only a leftover lease, and a call cut short by the device can be made again", async () => {
    const world = await damagedVaultWorld()
    let failures = 1
    const flakyDevice: DeviceDB = {
      ...world.deviceDB,
      delLease: async (scope) => {
        if (failures > 0) { failures -= 1; throw new Error('device store is busy') }
        return await world.deviceDB.delLease(scope)
      },
    }
    const err = await TH.expectRefusal(delDamagedVault(world.optsWith({ deviceDB: flakyDevice })), 'storage_unavailable')
    expect((err.cause as Error).message).to.include('busy')
    expect(rowsOf(world, 'u1'), 'a tombstone in the place of the vault props, and no box').to.deep.equal([u1VaultScopepath])
    expect(await world.getLease()).to.not.be.null
    await delDamagedVault(world.optsWith({ deviceDB: flakyDevice }))
    expect(await world.getLease()).to.be.null
  })

  it("lets a vault made anew since survive: stale_write, the new vault and its unlock untouched", async () => {
    const world = await damagedVaultWorld()
    // Storage answers the first look at the vault props with the damaged vault, and every later one with another.
    let looks = 0
    const replacing = localVaultDB({
      store: {
        ...world.dbStore,
        read: (ckey) => {
          if (ckey !== u1VaultScopepath) { return world.dbStore.read(ckey) }
          looks += 1
          return looks === 1 ? world.dbStore.read(ckey) : JSON.stringify({ ...storedVaultPropsOf(world), vault_tok: 'made-anew' })
        },
      },
    })
    await TH.expectRefusal(delDamagedVault(world.optsWith({ vaultDB: replacing })), 'stale_write')
    expect(world.dbStore.ckeys().some((ckey) => isU1Box(ckey))).to.eq(true)
    expect(await world.getLease()).to.not.be.null
  })

  it("checks the scope as Bank.make and bank.ensureVault do, handing the VaultDB's verb the scope alone", async () => {
    const world = await damagedVaultWorld()
    const verb = vi.spyOn(world.vaultDB, 'delDamagedVault')
    const err = await TH.expectRefusal(delDamagedVault(world.optsWith({ userId: 'alice smith' })), 'bad_scope')
    expect(err.meta?.fieldnames).to.deep.equal(['user_id'])
    expect(verb).not.toHaveBeenCalled()
    await delDamagedVault(world.optsWith())
    expect(verb.mock.calls[0]).to.deep.equal([TH.scopeOf('u1')])
    expect(rowsOf(world, 'u1'), 'a tombstone in the place of the vault props, and no box').to.deep.equal([u1VaultScopepath])
  })

  it("takes the options Bank.make took beside the vault's names, and refuses misuse before touching storage", async () => {
    const world = await damagedVaultWorld()
    await TH.expectRefusal(delDamagedVault(world.optsWith({ applabel: 'not-a-label' })), 'bad_scope')
    await TH.expectRefusal(delDamagedVault(world.optsWith({ userId: '' })), 'bad_scope')
    await TH.expectRefusal(delDamagedVault(null as unknown as DelDamagedVaultOpts), 'bad_option')
    for (const [misfit] of MisfitStores) {
      await TH.expectRefusal(delDamagedVault(world.optsWith(misfit)), 'bad_option')
    }
    const withoutTheVerb = Object.fromEntries(VaultDBVerbsUsed.map((verb) => [verb, () => Promise.resolve(null)])) as unknown as VaultDB
    await TH.expectRefusal(delDamagedVault(world.optsWith({ vaultDB: withoutTheVerb })), 'bad_option')
    expect(world.dbStore.ckeys().some((ckey) => isU1Box(ckey))).to.eq(true)
    expect(await world.getLease()).to.not.be.null
  })

  it("takes a user_id that is an email address, as Bank.make does", async () => {
    const world = makeWorld()
    const opts = world.optsWith({ userId: 'u1@example' })
    const vault = await TH.settledVault(opts)
    await TH.unlock(vault, 'pw')
    TH.closeVault(vault)
    const vaultScopepath = Scopepath.vault({ applabel: 'acme', user_id: 'u1@example', vaultlabel: 'main' })
    const vaultProps = JSON.parse(world.dbStore.read(vaultScopepath) ?? 'null') as object
    world.dbStore.write(vaultScopepath, JSON.stringify({ ...vaultProps, gate_epoch: 'one' }))
    await delDamagedVault(opts)
    expect(JSON.parse(world.dbStore.read(vaultScopepath) ?? 'null')).to.include({ format: 'safebyok-tombstone-v1', vault_epoch: 2 })
  })

  it("raises this device's record to the tombstone's vault_epoch, keeping its device_id, so a restored copy of the damaged vault is behind", async () => {
    const world = await damagedVaultWorld()
    const before = await TH.expectGood(world.deviceDB.getDeviceRecord(TH.scopeOf('u1')))
    await delDamagedVault(world.optsWith())
    const tombstone = JSON.parse(world.dbStore.read(u1VaultScopepath) ?? 'null') as { vault_epoch: number }
    const after = await TH.expectGood(world.deviceDB.getDeviceRecord(TH.scopeOf('u1')))
    expect(after?.highest_vault_epoch).to.eq(tombstone.vault_epoch)
    expect(after?.device_id).to.eq(before?.device_id)
  })

  it("clears a vault its bank refused as damaged_vault, and the same bank then births a new life, novel, as its example shows", async () => {
    const world = await damagedVaultWorld()
    const { userId, vaultlabel, ...bankOpts } = world.optsWith()
    const bank = Bank.make(bankOpts)
    const { ok, err } = await bank.tryEnsureVault({ userId, vaultlabel: 'main' })
    expect(ok).to.be.false
    expect(isVaultError(err, 'damaged_vault')).to.be.true
    await delDamagedVault({ ...bankOpts, userId, vaultlabel })
    const vault = await bank.ensureVault({ userId, vaultlabel: 'main' })
    expect(vault.getSnapshot().state).to.eq('novel')
    bank.closeVaults()
  })
})
