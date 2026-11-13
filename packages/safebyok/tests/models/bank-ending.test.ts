/** The ending of a bank and its device, over a real bankDB and deviceDB: autolock, lock, vacate and sweep, and what follows a vacate. */

import { describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import type { Bank } from '../../src/models/bank'
import type { Box } from '../../src/models/box'
import type { Device } from '../../src/models/device'
import * as Phrases from '../../src/helpers/phrases'
import { nowMillis } from '../../src/helpers/clock'
import { makeLifeTok } from '../../src/helpers/crypto'
import { Lease } from '../../src/models/lease'
import { good } from '../../src/refusals/outcome'
import type { LeaseRow, WatchScope } from '../../src/shapes/shapes-storage'
import type { RequestCleartext } from '../../src/shapes/shapes-gateish'
import * as TH from '../test-helpers'
import { AutolockMinutes, BankScopeGiven, OtherScopeGiven, VaultScopeGiven, makeBankWithVault, makeBankWorld, useBankWorlds } from '../test-helpers/bank-world'
import { Dna, NewPassphrase, Passphrase, T0, bankTyping, boxlabel, byPassphrase, delTyping, makeWorldWithBox, useVaultWorlds } from '../test-helpers/vault-world'
import { parseLogger } from '../../src/helpers/logger'
import type { MemoryBankDB } from '../../src/storage/memory-bank-db'

useBankWorlds()
useVaultWorlds()

const AutolockMillis = AutolockMinutes * 60_000
const Stamp = Object.freeze({ boxlabel: 'anthropic_api_key', revision_seq: 1 })

/** A lease row of this bank scope, as `world`'s one cached row but of another bank life, proved long before the clock's first reading. */
function oldLeaseRow(world: ReturnType<typeof makeBankWorld>): LeaseRow { return { ...(world.leaseRows()[0] as LeaseRow), bank_tok: makeLifeTok(), proved_at: T0 - (2 * AutolockMillis) } }

describe("bank.autolock", () => {
  it("locks a listed vault past its autolock, which forgets its lease, leaving a younger one", async () => {
    const { world, bank } = await makeBankWithVault()
    await bank.autolock()
    expect(bank.isUnlocked).to.be.true
    expect(world.leaseRows()).to.have.lengthOf(1)
    world.advance(AutolockMillis + 1)
    await bank.autolock()
    expect(bank.isLocked).to.be.true
    expect(bank.snapshot.isLocked).to.be.true
    await TH.eventually(() => world.leaseRows().length === 0)
  })

  it("locks by the expiry its cached lease reports", async () => {
    const { world, bank } = await makeBankWithVault()
    world.advance(AutolockMillis + 1)
    const tryExpiresAt = vi.spyOn(Lease, 'tryExpiresAt').mockResolvedValueOnce(good(nowMillis() + 1))
    await bank.autolock()
    expect(bank.isUnlocked).to.be.true
    await bank.autolock()
    expect(bank.isLocked).to.be.true
    expect(tryExpiresAt).toHaveBeenCalledTimes(2)
  })

  it("is not called by ensureBank", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    world.advance(AutolockMillis + 1)
    const requestCleartext = vi.fn<RequestCleartext>(async (gating) => { await gating.attempt(byPassphrase(Passphrase)) })
    const device = world.deviceOn({ requestCleartext })
    const tryListLeases = vi.spyOn(world.deviceDB, 'tryListLeases')
    const forget = vi.spyOn(world.deviceDB, 'forget')
    const fresh = await device.ensureBank()
    expect(tryListLeases).not.toHaveBeenCalled()
    expect(world.leaseRows()).to.have.lengthOf(1)
    await fresh.ensureUnlocked()
    expect(forget).not.toHaveBeenCalled()
    expect(requestCleartext).toHaveBeenCalledOnce()
    expect(fresh.isUnlocked).to.be.true
    expect(tryListLeases).not.toHaveBeenCalled()
    expect(world.leaseRows()).to.have.lengthOf(1)
    expect((world.leaseRows()[0] as LeaseRow).proved_at).to.eq(T0 + AutolockMillis + 1)
  })

  it("past autolock, ensureUnlocked asks for the passphrase again", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    world.advance(AutolockMillis + 1)
    const fresh = await world.bankOn({ requestCleartext: () => undefined })
    await TH.expectRefusal(fresh.ensureUnlocked(), 'dismissed')
    expect(world.leaseRows()).to.have.lengthOf(1)
  })

  it("a row just inside autolock still opens on a fresh page, asking nothing", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    world.advance(AutolockMillis)
    const requestCleartext = vi.fn<RequestCleartext>()
    const fresh = await world.bankOn({ requestCleartext })
    await fresh.ensureUnlocked()
    expect(fresh.isUnlocked).to.be.true
    expect(requestCleartext).not.toHaveBeenCalled()
    expect(world.leaseRows()).to.have.lengthOf(1)
  })

  it("past autolock, ensureUnlocked leaves an unlocked bank unlocked without asking", async () => {
    const world = makeBankWorld()
    const requestCleartext = vi.fn<RequestCleartext>(async (gating) => { await gating.attempt(byPassphrase(Passphrase)) })
    const { bank } = await makeBankWithVault(world, { requestCleartext })
    requestCleartext.mockClear()
    world.advance(AutolockMillis + 1)
    const peek = vi.spyOn(world.deviceDB, 'peek')
    const forget = vi.spyOn(world.deviceDB, 'forget')
    await bank.ensureUnlocked()
    expect(bank.isUnlocked).to.be.true
    expect(peek).not.toHaveBeenCalled()
    expect(forget).not.toHaveBeenCalled()
    expect(requestCleartext).not.toHaveBeenCalled()
    expect(world.leaseRows()).to.have.lengthOf(1)
  })

  it("past autolock, a second page leaves the lease row for the first page's autolock", async () => {
    const world = makeBankWorld()
    const { bank: pageA } = await makeBankWithVault(world)
    const row = world.leaseRows()[0]
    world.advance(AutolockMillis + 1)
    const pageB = await world.bankOn({ requestCleartext: () => undefined })
    await TH.expectRefusal(pageB.ensureUnlocked(), 'dismissed')
    expect(world.leaseRows()).to.deep.equal([row])
    expect(pageA.isUnlocked).to.be.true
    await pageA.autolock()
    expect(pageA.isLocked).to.be.true
    await TH.eventually(() => world.leaseRows().length === 0)
  })

  it("forgets an old lease when called after ensureBank on a fresh page", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    world.advance(AutolockMillis + 1)
    const requestCleartext = vi.fn<RequestCleartext>(async (gating) => { await gating.attempt(byPassphrase(Passphrase)) })
    const fresh = await world.bankOn({ requestCleartext })
    await fresh.autolock()
    await TH.eventually(() => world.leaseRows().length === 0)
    expect(fresh.isLocked).to.be.true
    await fresh.ensureUnlocked()
    expect(requestCleartext).toHaveBeenCalledOnce()
  })

  it("relies on bank.lock() forgetting the row cached for a bank already locked", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    const fresh = await world.bankOn()
    expect(fresh.isLocked).to.be.true
    expect(world.leaseRows()).to.have.lengthOf(1)
    fresh.lock()
    await TH.eventually(() => world.leaseRows().length === 0)
  })

  it("does nothing once its device is swept", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    const onBadNews = vi.fn()
    const swept = await world.bankOn({ onBadNews })
    swept.device.sweep()
    world.advance(AutolockMillis + 1)
    await swept.autolock()
    expect(world.leaseRows()).to.have.lengthOf(1)
    expect(onBadNews).not.toHaveBeenCalled()
  })

  it("leaves another user's and another app's old leases alone", async () => {
    const world = makeBankWorld()
    const { bank: ours } = await makeBankWithVault(world)
    const others = [await world.bankOn({ user_id: 'u2' }), await world.bankOn({ banklabel: 'other_app' })]
    for (const other of others) { await other.ensureVault(VaultScopeGiven) }
    expect(world.leaseRows()).to.have.lengthOf(3)
    world.advance(AutolockMillis + 1)
    await ours.autolock()
    await TH.eventually(() => world.leaseRows().length === 2)
    expect(world.leaseRows().map((row) => (row as { user_id: string, banklabel: string }).user_id + (row as { banklabel: string }).banklabel)).to.have.members(['u2acme', 'u1other_app'])
    for (const other of others) { expect(other.isUnlocked).to.be.true }
    expect(ours.isLocked).to.be.true
  })

  it("ignores an old lease row of another bank life", async () => {
    const { world, bank } = await makeBankWithVault()
    await world.deviceDB.stow(oldLeaseRow(world))
    const rowsBefore = world.leaseRows()
    await bank.autolock()
    expect(bank.isUnlocked).to.be.true
    expect(world.leaseRows()).to.deep.equal(rowsBefore)
  })

  it("reports a refused peek as bad news, never throwing", async () => {
    const world = makeBankWorld()
    const onBadNews = vi.fn()
    const bank = await world.bankOn({ onBadNews })
    const refusal = new VaultError('storage_unavailable', 'no storage')
    vi.spyOn(world.deviceDB, 'peek').mockRejectedValueOnce(refusal)
    await bank.autolock()
    expect(onBadNews).toHaveBeenCalledWith({ news: refusal, device: bank.device })
  })

  it("logs a refused peek that lands after a sweep, and never calls onBadNews", async () => {
    const world = makeBankWorld()
    const onBadNews = vi.fn()
    const spy = TH.spyLogger()
    const bank = await world.bankOn({ onBadNews, logger: spy.logger })
    const refusal = new VaultError('storage_unavailable', 'no storage')
    vi.spyOn(world.deviceDB, 'peek').mockRejectedValueOnce(refusal)
    const locking = bank.autolock()
    bank.device.sweep()
    await locking
    await TH.eventually(() => spy.calls.some(({ message }) => message === refusal.message))
    expect(onBadNews).not.toHaveBeenCalled()
  })

  it("reports a refused forget to onLifecycle, and still locks the vault", async () => {
    const onLifecycle = vi.fn()
    const { world, bank } = await makeBankWithVault(makeBankWorld(), { onLifecycle })
    onLifecycle.mockClear()
    const refusal = new VaultError('storage_unavailable', 'no storage')
    vi.spyOn(world.deviceDB, 'forget').mockRejectedValue(refusal)
    world.advance(AutolockMillis + 1)
    await bank.autolock()
    expect(bank.isLocked).to.be.true
    await TH.eventually(() => onLifecycle.mock.calls.length === 1)
    expect(onLifecycle).toHaveBeenCalledWith({ kind: 'lease_revoke_failed', refusal, bank, where: 'lock', device: bank.device })
  })

  it("locks nothing under an autolock of Infinity", async () => {
    const onBadNews = vi.fn()
    const { world, bank } = await makeBankWithVault(makeBankWorld(), { autolockMinutes: Infinity, onBadNews })
    world.advance(AutolockMillis * 1000)
    await bank.autolock()
    expect(bank.isUnlocked).to.be.true
    expect(onBadNews).not.toHaveBeenCalled()
  })
})

describe("bank.lock, device.vacate, device.sweep", () => {
  it("locks every listed vault and forgets its lease, the bank unchanged", async () => {
    const { world, bank, vault } = await makeBankWithVault()
    const other = await bank.ensureVault(OtherScopeGiven)
    bank.lock()
    expect(bank.isLocked).to.be.true
    await TH.expectRefusal(vault.sealStampedString('sk-test', Stamp), 'bank_locked')
    await TH.expectRefusal(other.sealStampedString('sk-test', { ...Stamp, ...OtherScopeGiven }), 'bank_locked')
    await TH.eventually(() => world.leaseRows().length === 0)
    expect(bank.device.snapshot.stage).to.eq('ready')
    expect(await bank.ensureVault(VaultScopeGiven)).to.equal(vault)
  })

  it("unlocks every listed vault at one unlock, each opening what it sealed before the lock", async () => {
    const { world, bank, vault } = await makeBankWithVault()
    const other = await bank.ensureVault(OtherScopeGiven)
    const otherStamp = { ...Stamp, ...OtherScopeGiven }
    const sealed = [await vault.sealStampedString('sk-one', Stamp), await other.sealStampedString('sk-other', otherStamp)]
    bank.lock()
    await TH.eventually(() => world.leaseRows().length === 0)
    await bank.ensureUnlocked()
    expect(await vault.unsealStampedString(sealed[0]!, Stamp)).to.eq('sk-one')
    expect(await other.unsealStampedString(sealed[1]!, otherStamp)).to.eq('sk-other')
  })

  it("a vacate disables the device and vacates every vault and lease it has on this device", async () => {
    const world = makeBankWorld()
    const { bank, vault } = await makeBankWithVault(world)
    const { device } = bank
    const elsewhere = await world.bankOn({ user_id: 'u2' })
    await elsewhere.ensureVault(VaultScopeGiven)
    await world.deviceDB.stow(oldLeaseRow(world))
    const seen = vi.fn()
    device.subscribe(seen)
    await device.vacate()
    expect(vault.isEnabled).to.be.false
    expect(() => vault.demandEnabled()).to.throw(VaultError)
    expect(device.snapshot.stage).to.eq('disabled')
    expect(device.snapshot.err).to.include({ refusalkind: 'disabled' })
    expect(device.snapshot.bank_tok).to.be.null
    expect(device.bank).to.be.null
    expect(bank.isEnabled).to.be.false
    expect(seen).toHaveBeenCalled()
    await TH.eventually(() => world.leaseRows().length === 1)
    await TH.expectRefusal(device.ensureBank(), 'disabled')
    const next = await world.bankOn()
    const relisted = next.vaultAt(VaultScopeGiven)
    expect(relisted?.isPresent).to.be.true
    expect(next.isLocked).to.be.true
  })

  it("a vacate on a fresh page forgets only its own bank scope's lease rows", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    const elsewhere = await world.bankOn({ user_id: 'u2' })
    await elsewhere.ensureVault(VaultScopeGiven)
    await world.deviceOn().vacate()
    await TH.eventually(() => world.leaseRows().length === 1)
    expect((world.leaseRows()[0] as { user_id: string }).user_id).to.eq('u2')
  })

  it("a vacate reports a lease it cannot forget, then the vacate itself, to onLifecycle", async () => {
    const world = makeBankWorld()
    const refusal = new VaultError('storage_unavailable', 'no storage')
    const onLifecycle = vi.fn()
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const device = world.deviceOn({ onLifecycle })
    const row = { ...BankScopeGiven, bank_tok: makeLifeTok(), proved_at: T0 }
    vi.spyOn(world.deviceDB, 'tryListLeases').mockResolvedValue({ ok: true, val: [row] })
    const forget = vi.spyOn(world.deviceDB, 'forget').mockRejectedValue(refusal)
    const vacating = device.vacate()
    expect(device.isEnabled).to.be.false
    await vacating
    expect(onLifecycle.mock.calls).to.deep.equal([
      [{ kind: 'lease_revoke_failed', refusal, bank: null, where: 'vacate', device }],
      [{ kind: 'vacated', cause: device.snapshot.err, unrevoked: 1, device }],
    ])
    expect(reported).not.toHaveBeenCalled()
    await device.vacate()
    expect(forget).toHaveBeenCalledOnce()
    expect(onLifecycle).toHaveBeenCalledTimes(2)
    vi.unstubAllGlobals()
  })

  it("a vacate reports a refused listing of the cached leases to onBadNews, though the device is disabled", async () => {
    const world = makeBankWorld()
    const refusal = new VaultError('storage_unavailable', 'no storage')
    const onBadNews = vi.fn()
    const device = world.deviceOn({ onBadNews })
    vi.spyOn(world.deviceDB, 'tryListLeases').mockResolvedValue({ ok: false, err: refusal })
    const vacating = device.vacate()
    expect(device.isEnabled).to.be.false
    await vacating
    expect(onBadNews).toHaveBeenCalledExactlyOnceWith({ news: refusal, device })
  })

  it("a vacate forgets the device row in the deviceDB after its leases", async () => {
    const world = makeBankWorld()
    const { bank } = await makeBankWithVault(world)
    const made = await world.deviceDB.ensureCachedDevice(BankScopeGiven)
    const kept = await world.deviceDB.ensureCachedDevice({ ...BankScopeGiven, user_id: 'u2' })
    const forget = vi.spyOn(world.deviceDB, 'forget')
    const tryForgetDevice = vi.spyOn(world.deviceDB, 'tryForgetDevice')
    await bank.device.vacate()
    expect(await world.deviceDB.listRawDevices()).to.deep.equal([kept])
    expect(forget.mock.invocationCallOrder[0]).to.be.below(tryForgetDevice.mock.invocationCallOrder[0]!)
    const remade = await world.deviceDB.ensureCachedDevice(BankScopeGiven)
    expect(remade.device_tok).to.not.eq(made.device_tok)
  })

  it("a sweep leaves the device row", async () => {
    const world = makeBankWorld()
    const { bank } = await makeBankWithVault(world)
    const made = await world.deviceDB.ensureCachedDevice(BankScopeGiven)
    bank.device.sweep()
    expect(await world.deviceDB.ensureCachedDevice(BankScopeGiven)).to.deep.equal(made)
  })

  it("a vacate reports a device row it cannot forget to onBadNews", async () => {
    const world = makeBankWorld()
    const [refusal, listRefused] = [new VaultError('storage_unavailable', 'no storage'), new VaultError('storage_unavailable', 'no listing')]
    const onLifecycle = vi.fn()
    const onBadNews = vi.fn()
    const device = world.deviceOn({ onLifecycle, onBadNews })
    vi.spyOn(world.deviceDB, 'tryListLeases').mockResolvedValue({ ok: false, err: listRefused })
    vi.spyOn(world.deviceDB, 'tryForgetDevice').mockResolvedValueOnce({ ok: false, err: refusal })
    await device.vacate()
    expect(onBadNews.mock.calls).to.deep.equal([[{ news: listRefused, device }], [{ news: refusal, device }]])
    expect(onLifecycle).toHaveBeenCalledExactlyOnceWith({ kind: 'vacated', cause: device.snapshot.err, unrevoked: 0, device })
  })

  it("a vacate disables the device before it forgets its rows", async () => {
    const spy = TH.spyLogger()
    const { world, bank } = await makeBankWithVault(makeBankWorld(), { logger: spy.logger })
    const { device } = bank
    const listing = TH.pendingNextCall(world.deviceDB, 'tryListLeases')
    const cause = new VaultError('identity_revoked', 'signed out')
    const vacating = device.vacate({ cause })
    expect(device.isEnabled).to.be.false
    expect(() => device.demandEnabled()).to.throw(Phrases.DeviceLetGo)
    expect(() => bank.vaultAt(VaultScopeGiven)).to.throw(Phrases.LetGoInstance)
    expect(device.snapshot).to.include({ stage: 'disabled', err: cause })
    await listing.reached
    await TH.expectRefusal(bank.ensureVault(VaultScopeGiven), 'disabled')
    await TH.expectRefusal(device.ensureBank(), 'disabled')
    listing.release()
    await vacating
    expect(world.leaseRows()).to.deep.equal([])
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['error'])
  })

  it("after disabling, a vacate reports only its own refusals to the host", async () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const requestCleartext = vi.fn<RequestCleartext>(async (gating) => { await gating.attempt(byPassphrase(Passphrase)) })
    const [onLifecycle, onBadNews] = [vi.fn(), vi.fn()]
    const spy = TH.spyLogger()
    const world = makeBankWorld()
    const { bank, vault } = await makeBankWithVault(world, { requestCleartext, onLifecycle, onBadNews, logger: spy.logger })
    requestCleartext.mockClear()
    onLifecycle.mockClear()
    const refusal = new VaultError('storage_unavailable', 'no storage')
    const forget = vi.spyOn(world.deviceDB, 'forget').mockRejectedValue(refusal)
    const listing = TH.pendingNextCall(world.deviceDB, 'tryListLeases')
    const vacating = bank.device.vacate()
    await listing.reached
    const news = new VaultError('storage_unavailable', 'news past the disable')
    vi.spyOn(world.deviceDB, 'peek').mockRejectedValueOnce(news)
    await bank.autolock()
    expect([requestCleartext, onLifecycle, onBadNews].map((handler) => handler.mock.calls.length)).to.deep.equal([0, 0, 0])
    listing.release()
    await vacating
    expect(onLifecycle.mock.calls).to.deep.equal([
      [{ kind: 'lease_revoke_failed', refusal, bank: null, where: 'vacate', device: bank.device }],
      [{ kind: 'vacated', cause: bank.device.snapshot.err, unrevoked: 1, device: bank.device }],
    ])
    expect([requestCleartext, onBadNews].map((handler) => handler.mock.calls.length)).to.deep.equal([0, 0])
    expect(forget).toHaveBeenCalledOnce()
    expect(reported).not.toHaveBeenCalled()
    expect(vault.isEnabled).to.be.false
    expect(spy.calls.map(({ message }) => message)).to.include(news.message)
    vi.unstubAllGlobals()
  })

  it("a repeated vacate resolves without listing the leases again, and keeps the first cause", async () => {
    const { world, bank: { device } } = await makeBankWithVault()
    const tryListLeases = vi.spyOn(world.deviceDB, 'tryListLeases')
    const vacating = device.vacate()
    await Promise.all([vacating, device.vacate({ cause: new VaultError('identity_revoked', 'signed out') })])
    await device.vacate()
    expect(tryListLeases).toHaveBeenCalledOnce()
    expect(device.snapshot.err).to.include({ refusalkind: 'disabled' })
  })

  it("a vacate resolves when onLifecycle awaits a vacate of the same device", async () => {
    const world = makeBankWorld()
    const refusal = new VaultError('storage_unavailable', 'no storage')
    const onLifecycle = vi.fn(async ({ device }: { device: Device }) => { await device.vacate() })
    const device = world.deviceOn({ onLifecycle })
    const row = { ...BankScopeGiven, bank_tok: makeLifeTok(), proved_at: T0 }
    vi.spyOn(world.deviceDB, 'tryListLeases').mockResolvedValue({ ok: true, val: [row] })
    vi.spyOn(world.deviceDB, 'forget').mockRejectedValue(refusal)
    await device.vacate()
    expect(onLifecycle).toHaveBeenCalledTimes(2)
    await expect(Promise.all(onLifecycle.mock.results.map((result) => result.value as unknown))).resolves.to.deep.equal([undefined, undefined])
  })

  it("a vacate refuses a story whose cause is not a VaultError or that has an unknown field", () => {
    const device = makeBankWorld().deviceOn()
    TH.expectSyncRefusal(() => device.vacate({ cause: new Error('signed out') as VaultError }), 'bad_option')
    TH.expectSyncRefusal(() => device.vacate({ reason: 'signed out' } as never), 'bad_option')
    expect(device.isEnabled).to.be.true
  })

  it("a vacate notifies listeners even with nothing listed", async () => {
    const world = makeBankWorld()
    const { device } = await world.bankOn()
    const seen = vi.fn()
    device.subscribe(seen)
    await device.vacate()
    expect(seen).toHaveBeenCalledOnce()
    expect(device.snapshot.stage).to.eq('disabled')
  })

  it("dismisses a birth's open gating, so no lease is stowed past the vacate", async () => {
    const world = makeBankWorld()
    let closeDialog: () => void = vi.fn()
    const bank = await world.bankOn({ requestCleartext: async (gating) => {
      await new Promise<void>((resolve) => { closeDialog = resolve })
      await gating.attempt(byPassphrase(Passphrase))
    } })
    const asking = bank.ensureVault(VaultScopeGiven)
    const vacating = bank.device.vacate()
    await TH.expectRefusal(asking)
    expect(bank.device.openGating).to.be.null
    closeDialog()
    await vacating
    expect(world.leaseRows()).to.deep.equal([])
  })

  it("shows no listener 'ready' while it sweeps", async () => {
    const { bank: { device } } = await makeBankWithVault(makeBankWorld())
    const stages: string[] = []
    device.subscribe(() => { stages.push(device.snapshot.stage) })
    device.sweep()
    expect(stages).to.not.be.empty
    expect(stages).to.not.include('ready')
  })

  it("a sweep leaves cached leases for the next bank to unlock with", async () => {
    const world = makeBankWorld()
    const { bank, vault } = await makeBankWithVault(world)
    bank.device.sweep()
    expect(bank.device.snapshot.stage).to.eq('disabled')
    expect(bank.isEnabled).to.be.false
    expect(vault.isEnabled).to.be.false
    expect(bank.isUnlocked).to.be.false
    expect(world.leaseRows()).to.have.lengthOf(1)
    await TH.expectRefusal(bank.ensureVault(VaultScopeGiven), 'disabled')
    await TH.expectRefusal(bank.device.ensureBank(), 'disabled')
    const next = await world.bankOn()
    expect(next.vaultListing.snapshot).to.deep.equal([Dna.vaultlabel])
    await next.ensureVault(VaultScopeGiven)
    await next.ensureUnlocked()
    expect(next.isUnlocked).to.be.true
  })

  it.each([
    ['sweep',  (device: Device): unknown => device.sweep()],
    ['vacate', (device: Device): unknown => device.vacate()],
  ] as const)("a %s that interrupts an ensureBank leaves the device disabled, and the ensureBank is refused", async (_label, ending) => {
    const world = makeBankWorld()
    const device = world.deviceOn()
    const ensuring = device.tryEnsureBank()
    await ending(device)
    await TH.expectBad(ensuring, 'disabled')
    expect(device.bank).to.be.null
    expect(device.snapshot.stage).to.eq('disabled')
    expect(device.snapshot.err).to.include({ refusalkind: 'disabled', message: Phrases.DeviceLetGo })
  })

  it("a vacate after a sweep forgets the bank's cached leases", async () => {
    const world = makeBankWorld()
    const { bank } = await makeBankWithVault(world)
    bank.device.sweep()
    expect(world.leaseRows()).to.have.lengthOf(1)
    await bank.device.vacate()
    expect(world.leaseRows()).to.deep.equal([])
  })

})

describe("device.isEnabled", () => {
  it.each([
    ['a sweep',  (device: Device) => { device.sweep() }],
    ['a vacate', async (device: Device) => { await device.vacate() }],
  ] as const)("is true from Device.make until %s, and never again", async (_label, ending) => {
    const { device } = await makeBankWorld().bankOn()
    expect(device.isEnabled).to.be.true
    expect(device.demandEnabled()).to.equal(device)
    await ending(device)
    await TH.eventually(() => ! device.isEnabled)
    await TH.expectBad(device.tryEnsureBank(), 'disabled')
    await device.sweep().vacate()
    expect(device.isEnabled).to.be.false
    expect(() => device.demandEnabled()).to.throw(Phrases.DeviceLetGo)
  })
})

describe("a bank past a vacate", () => {
  type Vacating = Awaited<ReturnType<typeof makeBankWithVault>>

  it.each([
    ['a plain vacate', [], async ({ bank }: Vacating) => { await bank.device.vacate() }],
    ['identity_revoked', ['error'], async ({ world, vault }: Vacating) => {
      world.bankDB._cheat_refuseGets('identity_revoked')
      await TH.expectRefusal(vault.get({ maxMillisSinceRefresh: 0 }), 'identity_revoked')
      world.bankDB._cheat_refuseGets(null)
    }],
  ] as const)("refuses ensureVault, vaultAt and ensureBank after %s, and the next bank returns the stored vault without asking", async (_label, loggedLevels, vacating) => {
    const requestCleartext = vi.fn<RequestCleartext>(async (gating) => { await gating.attempt(byPassphrase(Passphrase)) })
    const world = makeBankWorld()
    const spy = TH.spyLogger()
    const { bank, vault } = await makeBankWithVault(world, { requestCleartext, logger: spy.logger })
    requestCleartext.mockClear()
    await vacating({ world, bank, vault })
    await TH.eventually(() => spy.calls.length >= loggedLevels.length)
    expect(spy.calls.map((call) => call.level)).to.deep.equal(loggedLevels)
    await expect(bank.ensureVault(VaultScopeGiven)).rejects.toThrow(Phrases.LetGoInstance)
    expect(() => bank.vaultAt(VaultScopeGiven)).to.throw(Phrases.LetGoInstance)
    await expect(bank.device.ensureBank()).rejects.toThrow(Phrases.DeviceLetGo)
    expect(bank.device.openGating).to.be.null
    expect(requestCleartext).not.toHaveBeenCalled()
    const next = await world.bankOn({ requestCleartext })
    const relisted = await next.ensureVault(VaultScopeGiven)
    expect(relisted.vault_tok).to.equal(vault.vault_tok)
    expect(requestCleartext).not.toHaveBeenCalled()
  })

  it("refuses a box put that a vacate interrupts", async () => {
    const { bank, vault } = await makeBankWithVault(makeBankWorld())
    const putting = vault.putBox({ boxlabel: 'crossed', whisper: { apiKey: 'sk-test-fake' } })
    const vacating = bank.device.vacate()
    await TH.expectRefusal(putting, 'disabled')
    await vacating
  })
})

describe("the end of a bank, a vault and a device, as their listeners and the bankDB's watches see it", () => {
  const Endings = [
    // the bank deleted on another device, its row delivered here:
    [false, false, 'shows a device listener the bank locked and its box let go, at a tombstone'],
    [true,  false, 'shows a device listener the bank locked and its box let go, at a bank of another life'],
    // the delivery dismisses the unlock gating open, which tells the device's listeners:
    [false, true,  'shows a device listener the bank locked and its box let go, at a tombstone that dismisses a gating'],
  ] as const

  for (const [isBuiltAgain, isAsking, blurb] of Endings) {
    it(blurb, async () => {
      const { device, bank, box, dialog, anotherDevice, storedBankNow } = await makeWorldWithBox()
      bank.vaultListing.goodbye()
      await box.expose()
      const other = anotherDevice()
      await delTyping(await other.ensureBank(), Passphrase)
      if (isBuiltAgain) { await bankTyping(other, byPassphrase(NewPassphrase)) }
      const unlocking = isAsking ? startUnlocking(bank, dialog) : null
      if (unlocking !== null) { await TH.eventually(() => device.openGating !== null) }
      const seen: unknown[] = []
      device.subscribe(() => { seen.push(readEnding(device, bank, box)) })
      bank.receiveParent(storedBankNow())
      expect(seen).to.deep.equal([{ bank_tok: null, openGating: null, isLocked: true, box: { isExposed: false, isLocked: true } }])
      if (unlocking !== null) { await TH.expectRefusal(unlocking) }
    })
  }

  it("ends a vault's box watch at its tombstone and every watch at a sweep, each once, and a disabled lock ends nothing more", async () => {
    const world = await makeWorldWithBox()
    const watches = spyWatches(world.bankDB)
    const next = await world.openNextSession()
    await next.beginWatch()
    const { bank, boxListing } = next
    expect(watches.live()).to.deep.equal([Dna.banklabel, `${Dna.banklabel}/${Dna.vaultlabel}`])
    bank.lock()
    expect(watches.live()).to.deep.equal([Dna.banklabel, `${Dna.banklabel}/${Dna.vaultlabel}`])
    await world.vault.del(world.vault)
    await TH.eventually(() => ! next.isPresent)
    expect(watches.live()).to.deep.equal([Dna.banklabel])
    await TH.expectRefusal(next.beginWatch(), 'vault_gone')
    await TH.expectRefusal(boxListing.hello(), 'disabled')
    TH.expectSyncRefusal(() => next.boxListing, 'vault_gone')
    expect(watches.live()).to.deep.equal([Dna.banklabel])
    await bank.ensureVault(Dna)
    await next.beginWatch()
    expect(watches.live()).to.deep.equal([Dna.banklabel, `${Dna.banklabel}/${Dna.vaultlabel}`])
    bank.device.sweep()
    expect(watches.live()).to.deep.equal([])
    bank.lock()
    expect(watches.live()).to.deep.equal([])
    expect(watches.stoppedTwice()).to.deep.equal([])
  })

  it("ends the watches of a bank's vaults and boxes at a bank of another life, and keeps the bank's own", async () => {
    const world = await makeWorldWithBox()
    const watches = spyWatches(world.bankDB)
    const next = await world.openNextSession()
    await next.beginWatch()
    expect(watches.live()).to.deep.equal([Dna.banklabel, `${Dna.banklabel}/${Dna.vaultlabel}`])
    const other = world.anotherDevice()
    await delTyping(await other.ensureBank(), Passphrase)
    await bankTyping(other, byPassphrase(NewPassphrase))
    next.bank.receiveParent(world.storedBankNow())
    expect(watches.live()).to.deep.equal([Dna.banklabel])
    expect(watches.stoppedTwice()).to.deep.equal([])
  })

  it("logs an unwatch that throws at a sweep as bad news, never throwing, and aligns every snapshot all the same", async () => {
    const spy = TH.spyLogger()
    const world = await makeWorldWithBox({ logger: parseLogger(spy.logger) })
    const watches = spyWatches(world.bankDB, Dna.banklabel)
    const next = await world.openNextSession()
    await next.beginWatch()
    const box = (await next.getBox(boxlabel))!
    await box.expose()
    const { device } = next.bank
    expect(() => device.sweep()).not.to.throw()
    expect(watches.live()).to.deep.equal([])
    expect(device.snapshot).to.include({ stage: 'disabled', bank_tok: null })
    expect(next.bank.snapshot.isLocked).to.be.true
    expect(box.snapshot).to.include({ isExposed: false, isLocked: true })
    expect(spy.calls.map(({ level, story }) => ({ level, refusalkind: story?.['refusalkind'] }))).to.deep.include({ level: 'warn', refusalkind: 'unexpected_error' })
  })

  it("tells the host of an unwatch that throws at a vault's tombstone, and lets the boxes go all the same", async () => {
    const world = await makeWorldWithBox()
    const watches = spyWatches(world.bankDB, `${Dna.banklabel}/${Dna.vaultlabel}`)
    const next = await world.openNextSession()
    await next.beginWatch()
    const box = (await next.getBox(boxlabel))!
    await box.expose()
    world.badnews.length = 0
    await world.vault.del(world.vault)
    await TH.eventually(() => ! next.isPresent)
    expect(watches.live()).to.deep.equal([Dna.banklabel])
    expect(box.snapshot).to.include({ isExposed: false })
    expect(world.badnews.map((news) => news.refusalkind)).to.deep.equal(['unexpected_error'])
  })
})

// == [Helpers]: startUnlocking, readEnding, spyWatches, watchedOf

/** `bank.unlock()` after a lock, its dialog left up until the gating concludes. */
function startUnlocking(bank: Bank, dialog: { requestCleartext: RequestCleartext }): Promise<Bank> {
  bank.lock()
  dialog.requestCleartext = (gating) => gating.whenConcluded
  return bank.unlock()
}

/** What a device listener reads of the device, its bank and a box, as the bank's life ends. */
function readEnding(device: Device, bank: Bank, box: Box) {
  const { isExposed, isLocked } = box.snapshot
  return { bank_tok: device.snapshot.bank_tok, openGating: device.snapshot.openGating, isLocked: bank.snapshot.isLocked, box: { isExposed, isLocked } }
}

/** Spy on `bankDB`'s watch from here on, telling each watch by the scope it watches; the unwatch of the watch of `throwsAt` throws once it has stopped. */
function spyWatches(bankDB: MemoryBankDB, throwsAt: string | null = null) {
  const watches: { watched: string, stops: number }[] = []
  const watch = bankDB.watch.bind(bankDB)
  vi.spyOn(bankDB, 'watch').mockImplementation((scope, onNotice, onBadNews) => {
    const started = { watched: watchedOf(scope), stops: 0 }
    const unwatch = watch(scope, onNotice, onBadNews)
    watches.push(started)
    return () => {
      started.stops += 1
      unwatch()
      if (started.watched === throwsAt) { throw new Error('the adapter could not stop its watch') }
    }
  })
  return {
    /** What each watch started and not stopped watches, oldest first. */
    live:         () => watches.filter(({ stops }) => stops === 0).map(({ watched }) => watched),
    /** What each watch stopped more than once watches. */
    stoppedTwice: () => watches.filter(({ stops }) => stops > 1).map(({ watched }) => watched),
  }
}

/** What a watch of `scope` watches: its banklabel, and its vaultlabel after a slash for a vault's. */
function watchedOf({ banklabel, vaultlabel }: WatchScope): string { return (vaultlabel === undefined) ? banklabel : `${banklabel}/${vaultlabel}` }
// --
