/** The ending of a bank and its device, over a real vaultDB and deviceDB: autolock, lock, vacate and sweep, and what follows a vacate. */

import { describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import type { Device } from '../../src/models/device'
import * as Phrases from '../../src/helpers/phrases'
import { makeLifeTok } from '../../src/helpers/crypto'
import type { LeaseRow } from '../../src/shapes/shapes-storage'
import type { RequestCleartext } from '../../src/shapes/shapes-gateish'
import * as TH from '../test-helpers'
import { AutolockMinutes, BankScopeGiven, OtherScopeGiven, VaultScopeGiven, labelsOf, makeBankWithVault, makeBankWorld, useBankWorlds } from '../test-helpers/bank-world'
import { Dna, Passphrase, T0, byPassphrase } from '../test-helpers/vault-world'

useBankWorlds()

const AutolockMillis = AutolockMinutes * 60_000

/** A lease row of this bank, as `world`'s one cached row but under `vaultlabel` and another life, proved long before the clock's first reading. */
function oldLeaseRow(world: ReturnType<typeof makeBankWorld>, vaultlabel: string): LeaseRow { return { ...(world.leaseRows()[0] as LeaseRow), vaultlabel, vault_tok: makeLifeTok(), proved_at: T0 - (2 * AutolockMillis) } }

describe("bank.autolock", () => {
  it("locks a listed vault past its autolock, which forgets its lease, leaving a younger one", async () => {
    const { world, bank, vault } = await makeBankWithVault()
    await bank.autolock()
    expect(vault.isUnlocked).to.be.true
    expect(world.leaseRows()).to.have.lengthOf(1)
    world.advance(AutolockMillis + 1)
    await bank.autolock()
    expect(vault.isLocked).to.be.true
    expect(bank.snapshot.vaults[0]?.isLocked).to.be.true
    await TH.eventually(() => world.leaseRows().length === 0)
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
    const vault = fresh.vaultAt(VaultScopeGiven)
    await vault?.ensureUnlocked()
    expect(forget).not.toHaveBeenCalled()
    expect(requestCleartext).toHaveBeenCalledOnce()
    expect(vault?.isUnlocked).to.be.true
    expect(tryListLeases).not.toHaveBeenCalled()
    expect(world.leaseRows()).to.have.lengthOf(1)
    expect((world.leaseRows()[0] as LeaseRow).proved_at).to.eq(T0 + AutolockMillis + 1)
  })

  it("past autolock, ensureUnlocked asks for the passphrase again", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    world.advance(AutolockMillis + 1)
    const fresh = await world.bankOn({ requestCleartext: () => undefined })
    const vault = fresh.vaultAt(VaultScopeGiven)
    await TH.expectRefusal(vault!.ensureUnlocked(), 'dismissed')
    expect(world.leaseRows()).to.have.lengthOf(1)
  })

  it("a row just inside autolock still opens on a fresh page, asking nothing", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    world.advance(AutolockMillis)
    const requestCleartext = vi.fn<RequestCleartext>()
    const fresh = await world.bankOn({ requestCleartext })
    const vault = fresh.vaultAt(VaultScopeGiven)
    await vault?.ensureUnlocked()
    expect(vault?.isUnlocked).to.be.true
    expect(requestCleartext).not.toHaveBeenCalled()
    expect(world.leaseRows()).to.have.lengthOf(1)
  })

  it("past autolock, ensureUnlocked leaves an unlocked vault unlocked without asking", async () => {
    const world = makeBankWorld()
    const requestCleartext = vi.fn<RequestCleartext>(async (gating) => { await gating.attempt(byPassphrase(Passphrase)) })
    const { vault } = await makeBankWithVault(world, { requestCleartext })
    requestCleartext.mockClear()
    world.advance(AutolockMillis + 1)
    const peek = vi.spyOn(world.deviceDB, 'peek')
    const forget = vi.spyOn(world.deviceDB, 'forget')
    await vault.ensureUnlocked()
    expect(vault.isUnlocked).to.be.true
    expect(peek).not.toHaveBeenCalled()
    expect(forget).not.toHaveBeenCalled()
    expect(requestCleartext).not.toHaveBeenCalled()
    expect(world.leaseRows()).to.have.lengthOf(1)
  })

  it("past autolock, a second page leaves the lease row for the first page's autolock", async () => {
    const world = makeBankWorld()
    const { bank: pageA, vault: vaultA } = await makeBankWithVault(world)
    const row = world.leaseRows()[0]
    world.advance(AutolockMillis + 1)
    const pageB = await world.bankOn({ requestCleartext: () => undefined })
    await TH.expectRefusal(pageB.vaultAt(VaultScopeGiven)!.ensureUnlocked(), 'dismissed')
    expect(world.leaseRows()).to.deep.equal([row])
    expect(vaultA.isUnlocked).to.be.true
    await pageA.autolock()
    expect(vaultA.isLocked).to.be.true
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
    const vault = fresh.vaultAt(VaultScopeGiven)
    expect(vault?.isLocked).to.be.true
    await vault?.ensureUnlocked()
    expect(requestCleartext).toHaveBeenCalledOnce()
  })

  it("relies on vault.lock() forgetting the row cached for a vault already locked", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    const fresh = await world.bankOn()
    const vault = fresh.vaultAt(VaultScopeGiven)
    expect(vault?.isLocked).to.be.true
    expect(world.leaseRows()).to.have.lengthOf(1)
    vault?.lock()
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
    for (const other of others) { expect(other.vaultAt(VaultScopeGiven)?.isUnlocked).to.be.true }
    expect(ours.vaultAt(VaultScopeGiven)?.isLocked).to.be.true
  })

  it("ignores old lease rows of an unlisted vault and of another vault life", async () => {
    const { world, bank, vault } = await makeBankWithVault()
    await world.deviceDB.stow(oldLeaseRow(world, 'unlisted'))
    await world.deviceDB.stow(oldLeaseRow(world, Dna.vaultlabel))
    const rowsBefore = world.leaseRows()
    await bank.autolock()
    expect(vault.isUnlocked).to.be.true
    expect(world.leaseRows()).to.deep.equal(rowsBefore)
  })

  it("reports a refused listing as bad news, never throwing", async () => {
    const world = makeBankWorld()
    const onBadNews = vi.fn()
    const bank = await world.bankOn({ onBadNews })
    const refusal = new VaultError('storage_unavailable', 'no storage')
    vi.spyOn(world.deviceDB, 'tryListLeases').mockResolvedValueOnce({ ok: false, err: refusal })
    await bank.autolock()
    expect(onBadNews).toHaveBeenCalledWith({ news: refusal, device: bank.device })
  })

  it("logs a refused listing that lands after a sweep, and never calls onBadNews", async () => {
    const world = makeBankWorld()
    const onBadNews = vi.fn()
    const spy = TH.spyLogger()
    const bank = await world.bankOn({ onBadNews, logger: spy.logger })
    const refusal = new VaultError('storage_unavailable', 'no storage')
    vi.spyOn(world.deviceDB, 'tryListLeases').mockResolvedValueOnce({ ok: false, err: refusal })
    const locking = bank.autolock()
    bank.device.sweep()
    await locking
    await TH.eventually(() => spy.calls.some(({ message }) => message === refusal.message))
    expect(onBadNews).not.toHaveBeenCalled()
  })

  it("reports a refused forget to onLifecycle, and still locks the vault", async () => {
    const onLifecycle = vi.fn()
    const { world, bank, vault } = await makeBankWithVault(makeBankWorld(), { onLifecycle })
    onLifecycle.mockClear()
    const refusal = new VaultError('storage_unavailable', 'no storage')
    vi.spyOn(world.deviceDB, 'forget').mockRejectedValue(refusal)
    world.advance(AutolockMillis + 1)
    await bank.autolock()
    expect(vault.isLocked).to.be.true
    await TH.eventually(() => onLifecycle.mock.calls.length === 1)
    expect(onLifecycle).toHaveBeenCalledWith({ kind: 'lease_revoke_failed', refusal, vault, where: 'lock', device: bank.device })
  })

  it("locks nothing under an autolock of Infinity", async () => {
    const onBadNews = vi.fn()
    const { world, bank, vault } = await makeBankWithVault(makeBankWorld(), { autolockMinutes: Infinity, onBadNews })
    world.advance(AutolockMillis * 1000)
    await bank.autolock()
    expect(vault.isUnlocked).to.be.true
    expect(onBadNews).not.toHaveBeenCalled()
  })
})

describe("bank.lock, device.vacate, device.sweep", () => {
  it("locks every listed vault and forgets its lease, the bank unchanged", async () => {
    const { world, bank, vault } = await makeBankWithVault()
    const other = await bank.ensureVault(OtherScopeGiven)
    bank.lock()
    expect([vault.isLocked, other.isLocked]).to.deep.equal([true, true])
    await TH.eventually(() => world.leaseRows().length === 0)
    expect(bank.device.snapshot.stage).to.eq('ready')
    expect(await bank.ensureVault(VaultScopeGiven)).to.equal(vault)
  })

  it("a vacate disables the device and vacates every vault and lease it has on this device", async () => {
    const world = makeBankWorld()
    const { bank, vault } = await makeBankWithVault(world)
    const { device } = bank
    const elsewhere = await world.bankOn({ user_id: 'u2' })
    await elsewhere.ensureVault(VaultScopeGiven)
    await world.deviceDB.stow(oldLeaseRow(world, 'unlisted'))
    const seen = vi.fn()
    device.subscribe(seen)
    await device.vacate()
    expect(vault.isEnabled).to.be.false
    expect(() => vault.demandEnabled()).to.throw(VaultError)
    expect(device.snapshot.stage).to.eq('disabled')
    expect(device.snapshot.err).to.include({ refusalkind: 'disabled' })
    expect(device.snapshot.bank).to.be.null
    expect(device.bank).to.be.null
    expect(bank.snapshot.vaults).to.deep.equal([])
    expect(seen).toHaveBeenCalled()
    await TH.eventually(() => world.leaseRows().length === 1)
    await TH.expectRefusal(device.ensureBank(), 'disabled')
    const next = await world.bankOn()
    const relisted = next.vaultAt(VaultScopeGiven)
    expect(relisted?.isPresent).to.be.true
    expect(relisted?.isLocked).to.be.true
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
    const row = { ...BankScopeGiven, vaultlabel: 'unlisted', vault_tok: makeLifeTok(), proved_at: T0 }
    vi.spyOn(world.deviceDB, 'tryListLeases').mockResolvedValue({ ok: true, val: [row] })
    const forget = vi.spyOn(world.deviceDB, 'forget').mockRejectedValue(refusal)
    const vacating = device.vacate()
    expect(device.isEnabled).to.be.false
    await vacating
    expect(onLifecycle.mock.calls).to.deep.equal([
      [{ kind: 'lease_revoke_failed', refusal, vault: null, where: 'vacate', device }],
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
    expect(() => bank.vaultAt(VaultScopeGiven)).to.throw(Phrases.DeviceLetGo)
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
    vi.spyOn(world.deviceDB, 'forget').mockRejectedValue(refusal)
    const listing = TH.pendingNextCall(world.deviceDB, 'tryListLeases')
    const vacating = bank.device.vacate()
    await listing.reached
    const news = new VaultError('storage_unavailable', 'news past the disable')
    vi.spyOn(world.deviceDB, 'tryListLeases').mockResolvedValueOnce({ ok: false, err: news })
    await bank.autolock()
    expect([requestCleartext, onLifecycle, onBadNews].map((handler) => handler.mock.calls.length)).to.deep.equal([0, 0, 0])
    listing.release()
    await vacating
    expect(onLifecycle.mock.calls).to.deep.equal([
      [{ kind: 'lease_revoke_failed', refusal, vault: null, where: 'vacate', device: bank.device }],
      [{ kind: 'vacated', cause: bank.device.snapshot.err, unrevoked: 1, device: bank.device }],
    ])
    expect([requestCleartext, onBadNews].map((handler) => handler.mock.calls.length)).to.deep.equal([0, 0])
    await TH.eventually(() => reported.mock.calls.some(([err]) => err === refusal))
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
    const row = { ...BankScopeGiven, vaultlabel: 'unlisted', vault_tok: makeLifeTok(), proved_at: T0 }
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
    expect(bank.snapshot.vaults).to.deep.equal([])
    expect(vault.isEnabled).to.be.false
    expect(vault.isUnlocked).to.be.false
    expect(world.leaseRows()).to.have.lengthOf(1)
    await TH.expectRefusal(bank.ensureVault(VaultScopeGiven), 'disabled')
    await TH.expectRefusal(bank.device.ensureBank(), 'disabled')
    const next = await world.bankOn()
    expect(labelsOf(next.snapshot)).to.deep.equal([Dna.vaultlabel])
    const again = await next.ensureVault(VaultScopeGiven)
    await again.ensureUnlocked()
    expect(again.isUnlocked).to.be.true
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
    ['a sweep', (device: Device) => { device.sweep() }],
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
      world.vaultDB._cheat_refuseGets('identity_revoked')
      await TH.expectRefusal(vault.get({ maxMillisSinceRefresh: 0 }), 'identity_revoked')
      world.vaultDB._cheat_refuseGets(null)
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
    await expect(bank.ensureVault(VaultScopeGiven)).rejects.toThrow(Phrases.DeviceLetGo)
    expect(() => bank.vaultAt(VaultScopeGiven)).to.throw(Phrases.DeviceLetGo)
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
