import { describe, expect, it, vi } from 'vitest'
import { deviceRecordOf } from '../../src/devicedb/devicedb'
import { VaultError } from '../../src/errors'
import * as TH from '../test-helpers'
import { makeBankWorld, useBankWorlds } from '../test-helpers/bank-world'
import { Dna, Passphrase, byPassphrase, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()
useBankWorlds()

const Main = Object.freeze({ vaultlabel: Dna.vaultlabel })
const BankScope = Object.freeze({ applabel: Dna.applabel, user_id: Dna.user_id })

// == [The device record]: hello keeps it and takes its device_id

describe("bank.hello() and this device's record of the scope", () => {
  it("stores a device record holding the device_id option where the device holds none, and keeps that device_id", async () => {
    const { bank, devices, advanceDeviceRecord } = makeBankWorld()
    await bank.hello()
    expect(advanceDeviceRecord).toHaveBeenCalledWith(deviceRecordOf(BankScope, 'device-1'))
    expect(await devices.getDeviceRecord(BankScope)).to.deep.equal(deviceRecordOf(BankScope, 'device-1'))
    expect(bank.device_id).to.eq('device-1')
  })

  it("takes the device_id the device record holds in place of the option's, and remakes its snapshot with it", async () => {
    const { bank, devices } = makeBankWorld()
    await devices.advanceDeviceRecord(deviceRecordOf(BankScope, 'device-0', [{ vaultlabel: 'main', gate_epoch: 3 }]))
    const listener = vi.fn()
    bank.subscribe(listener)
    await bank.hello()
    expect(bank.device_id).to.eq('device-0')
    expect(bank.snapshot.device_id).to.eq('device-0')
    expect(listener).toHaveBeenCalled()
    expect(await devices.getDeviceRecord(BankScope)).to.deep.equal(deviceRecordOf(BankScope, 'device-0', [{ vaultlabel: 'main', gate_epoch: 3 }]))
  })

  it("gives the next session on this device the device_id the first stored, though it was made with none", async () => {
    const { bank, makeBank, bankOpts } = makeBankWorld(null, { device_id: undefined })
    await bank.hello()
    const next = makeBank()
    expect(next.device_id).to.not.eq(bank.device_id)
    await next.hello()
    expect(next.device_id).to.eq(bank.device_id)
    expect(bankOpts.device_id).to.be.undefined
  })

  it("refuses as the deviceDB does where it fails to keep the record, reading 'refused', the listing not warmed", async () => {
    const { bank, advanceDeviceRecord } = makeBankWorld()
    const refusal = new VaultError('storage_unavailable', "This device's own storage failed.")
    advanceDeviceRecord.mockRejectedValueOnce(refusal)
    expect(await bank.tryHello()).to.deep.equal({ ok: false, err: refusal })
    expect(bank.snapshot.lifecycle).to.eq('refused')
    expect(bank.device_id).to.eq('device-1')
    await bank.hello()
    expect(bank.snapshot.lifecycle).to.eq('ready')
  })
})
// --

// == [Clearing a cached vault]: clearCachedVault, tryClearCachedVault

describe("bank.clearCachedVault(bag): the vault closed, and what the device keeps of it erased", () => {
  it("closes the vault and has the deviceDB erase its lease and cached copy; the next ensureVault gets it anew", async () => {
    const { bank, deviceDB, clearCachedVault } = makeBankWorld()
    const vault = await bank.ensureVault(Main, byPassphrase(Passphrase))
    await bank.clearCachedVault(Main)
    expect(vault.isLocked).to.be.true
    expect(bank.vaultOf(Main)).to.be.null
    expect(bank.snapshot.vaults).to.deep.equal([])
    expect(clearCachedVault).toHaveBeenCalledWith({ ...BankScope, ...Main })
    expect(deviceDB.cachedNow()).to.be.null
    const again = await bank.ensureVault(Main)
    expect(again).to.not.equal(vault)
    expect(again.vault_tok).to.eq(vault.vault_tok)
  })

  it("erases what the device keeps of a vault the bank does not hold, and leaves the device record", async () => {
    const { bank, devices, clearCachedVault } = makeBankWorld()
    await bank.hello()
    await bank.clearCachedVault({ vaultlabel: 'work' })
    expect(clearCachedVault).toHaveBeenCalledWith({ ...BankScope, vaultlabel: 'work' })
    expect(await devices.getDeviceRecord(BankScope)).to.deep.equal(deviceRecordOf(BankScope, 'device-1'))
  })

  it("refuses as the deviceDB does where it fails the erase, the vault closed all the same; tryClearCachedVault resolves that refusal", async () => {
    const { bank, clearCachedVault } = makeBankWorld()
    const vault = await bank.ensureVault(Main, byPassphrase(Passphrase))
    const refusal = new VaultError('storage_blocked', "This browser does not let the app keep anything on this device.")
    clearCachedVault.mockRejectedValueOnce(refusal)
    expect(await bank.tryClearCachedVault(Main)).to.deep.equal({ ok: false, err: refusal })
    expect(vault.isLocked).to.be.true
    expect(bank.vaultOf(Main)).to.be.null
  })

  it("refuses 'bad_scope' a bag of another user, erasing nothing", async () => {
    const { bank, clearCachedVault } = makeBankWorld()
    await TH.expectBad(bank.tryClearCachedVault({ vaultlabel: Dna.vaultlabel, user_id: 'u2' }), 'bad_scope')
    expect(clearCachedVault).not.toHaveBeenCalled()
  })
})
// --
