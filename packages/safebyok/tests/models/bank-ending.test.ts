/** The bank's ending, over a real vaultDB and deviceDB: autolock, lock, vacate and sweep, and what follows a vacate. */

import { describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import type { Bank } from '../../src/models/bank'
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

  it("is not called by hello", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    world.advance(AutolockMillis + 1)
    const requestCleartext = vi.fn<RequestCleartext>(async (gating) => { await gating.attempt(byPassphrase(Passphrase)) })
    const fresh = world.bankOn({ requestCleartext })
    const tryListLeases = vi.spyOn(world.deviceDB, 'tryListLeases')
    const forget = vi.spyOn(world.deviceDB, 'forget')
    await fresh.hello()
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
    const fresh = world.bankOn({ requestCleartext: () => undefined })
    await fresh.hello()
    const vault = fresh.vaultAt(VaultScopeGiven)
    await TH.expectRefusal(vault!.ensureUnlocked(), 'dismissed')
    expect(world.leaseRows()).to.have.lengthOf(1)
  })

  it("a row just inside autolock still opens on a fresh page, asking nothing", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    world.advance(AutolockMillis)
    const requestCleartext = vi.fn<RequestCleartext>()
    const fresh = world.bankOn({ requestCleartext })
    await fresh.hello()
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
    const pageB = world.bankOn({ requestCleartext: () => undefined })
    await pageB.hello()
    await TH.expectRefusal(pageB.vaultAt(VaultScopeGiven)!.ensureUnlocked(), 'dismissed')
    expect(world.leaseRows()).to.deep.equal([row])
    expect(vaultA.isUnlocked).to.be.true
    await pageA.autolock()
    expect(vaultA.isLocked).to.be.true
    await TH.eventually(() => world.leaseRows().length === 0)
  })

  it("forgets an old lease when called after hello on a fresh page", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    world.advance(AutolockMillis + 1)
    const requestCleartext = vi.fn<RequestCleartext>(async (gating) => { await gating.attempt(byPassphrase(Passphrase)) })
    const fresh = world.bankOn({ requestCleartext })
    await fresh.hello()
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
    const fresh = world.bankOn()
    await fresh.hello()
    const vault = fresh.vaultAt(VaultScopeGiven)
    expect(vault?.isLocked).to.be.true
    expect(world.leaseRows()).to.have.lengthOf(1)
    vault?.lock()
    await TH.eventually(() => world.leaseRows().length === 0)
  })

  it("does nothing before hello", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    world.advance(AutolockMillis + 1)
    const onBadNews = vi.fn()
    await world.bankOn({ onBadNews }).autolock()
    expect(world.leaseRows()).to.have.lengthOf(1)
    expect(onBadNews).not.toHaveBeenCalled()
  })

  it("leaves another user's and another app's old leases alone", async () => {
    const world = makeBankWorld()
    const { bank: ours } = await makeBankWithVault(world)
    const others = [world.bankOn({ user_id: 'u2' }), world.bankOn({ banklabel: 'other_app' })]
    for (const other of others) {
      await other.hello()
      await other.ensureVault(VaultScopeGiven)
    }
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
    const bank = world.bankOn({ onBadNews })
    const refusal = new VaultError('storage_unavailable', 'no storage')
    vi.spyOn(world.deviceDB, 'tryListLeases').mockResolvedValueOnce({ ok: false, err: refusal })
    await bank.autolock()
    expect(onBadNews).toHaveBeenCalledWith({ news: refusal, bank })
  })

  it("logs a refused listing that lands after a sweep, and never calls onBadNews", async () => {
    const world = makeBankWorld()
    const onBadNews = vi.fn()
    const spy = TH.spyLogger()
    const bank = world.bankOn({ onBadNews, logger: spy.logger })
    const refusal = new VaultError('storage_unavailable', 'no storage')
    vi.spyOn(world.deviceDB, 'tryListLeases').mockResolvedValueOnce({ ok: false, err: refusal })
    const locking = bank.autolock()
    bank.sweep()
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
    expect(onLifecycle).toHaveBeenCalledWith({ kind: 'lease_revoke_failed', refusal, vault, where: 'lock', bank })
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

describe("bank.lock, bank.vacate, bank.sweep", () => {
  it("locks every listed vault and forgets its lease, the bank unchanged", async () => {
    const { world, bank, vault } = await makeBankWithVault()
    const other = await bank.ensureVault(OtherScopeGiven)
    bank.lock()
    expect([vault.isLocked, other.isLocked]).to.deep.equal([true, true])
    await TH.eventually(() => world.leaseRows().length === 0)
    expect(bank.snapshot.stage).to.eq('ready')
    expect(await bank.ensureVault(VaultScopeGiven)).to.equal(vault)
  })

  it("a vacate disables the bank and vacates every vault and lease it has on this device", async () => {
    const world = makeBankWorld()
    const { bank, vault } = await makeBankWithVault(world)
    const elsewhere = world.bankOn({ user_id: 'u2' })
    await elsewhere.hello()
    await elsewhere.ensureVault(VaultScopeGiven)
    await world.deviceDB.stow(oldLeaseRow(world, 'unlisted'))
    const seen = vi.fn()
    bank.subscribe(seen)
    await bank.vacate()
    expect(vault.isEnabled).to.be.false
    expect(() => vault.demandEnabled()).to.throw(VaultError)
    expect(bank.snapshot.stage).to.eq('disabled')
    expect(bank.snapshot.err).to.include({ refusalkind: 'disabled' })
    expect(bank.snapshot.vaults).to.deep.equal([])
    expect(seen).toHaveBeenCalled()
    await TH.eventually(() => world.leaseRows().length === 1)
    await TH.expectRefusal(bank.hello(), 'disabled')
    const next = world.bankOn()
    await next.hello()
    const relisted = next.vaultAt(VaultScopeGiven)
    expect(relisted?.isPresent).to.be.true
    expect(relisted?.isLocked).to.be.true
  })

  it("a vacate on a fresh page forgets only its own bank's lease rows", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    const elsewhere = world.bankOn({ user_id: 'u2' })
    await elsewhere.hello()
    await elsewhere.ensureVault(VaultScopeGiven)
    await world.bankOn().vacate()
    await TH.eventually(() => world.leaseRows().length === 1)
    expect((world.leaseRows()[0] as { user_id: string }).user_id).to.eq('u2')
  })

  it("a vacate reports a lease it cannot forget, then the vacate itself, to onLifecycle", async () => {
    const world = makeBankWorld()
    const refusal = new VaultError('storage_unavailable', 'no storage')
    const onLifecycle = vi.fn()
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const bank = world.bankOn({ onLifecycle })
    const row = { ...BankScopeGiven, vaultlabel: 'unlisted', vault_tok: makeLifeTok(), proved_at: T0 }
    vi.spyOn(world.deviceDB, 'tryListLeases').mockResolvedValue({ ok: true, val: [row] })
    const forget = vi.spyOn(world.deviceDB, 'forget').mockRejectedValue(refusal)
    const vacating = bank.vacate()
    expect(bank.isEnabled).to.be.false
    await vacating
    expect(onLifecycle.mock.calls).to.deep.equal([
      [{ kind: 'lease_revoke_failed', refusal, vault: null, where: 'vacate', bank }],
      [{ kind: 'vacated', cause: bank.snapshot.err, unrevoked: 1, bank }],
    ])
    expect(reported).not.toHaveBeenCalled()
    await bank.vacate()
    expect(forget).toHaveBeenCalledOnce()
    expect(onLifecycle).toHaveBeenCalledTimes(2)
    vi.unstubAllGlobals()
  })

  it("a vacate reports a refused listing of the cached leases to onBadNews, though the bank is disabled", async () => {
    const world = makeBankWorld()
    const refusal = new VaultError('storage_unavailable', 'no storage')
    const onBadNews = vi.fn()
    const bank = world.bankOn({ onBadNews })
    vi.spyOn(world.deviceDB, 'tryListLeases').mockResolvedValue({ ok: false, err: refusal })
    const vacating = bank.vacate()
    expect(bank.isEnabled).to.be.false
    await vacating
    expect(onBadNews).toHaveBeenCalledExactlyOnceWith({ news: refusal, bank })
  })

  it("a vacate forgets the bank's row in the deviceDB after its leases", async () => {
    const world = makeBankWorld()
    const { bank } = await makeBankWithVault(world)
    const made = await world.deviceDB.ensureCachedDevice(BankScopeGiven)
    const kept = await world.deviceDB.ensureCachedDevice({ ...BankScopeGiven, user_id: 'u2' })
    const forget = vi.spyOn(world.deviceDB, 'forget')
    const tryForgetDevice = vi.spyOn(world.deviceDB, 'tryForgetDevice')
    await bank.vacate()
    expect(await world.deviceDB.listRawDevices()).to.deep.equal([kept])
    expect(forget.mock.invocationCallOrder[0]).to.be.below(tryForgetDevice.mock.invocationCallOrder[0]!)
    const remade = await world.deviceDB.ensureCachedDevice(BankScopeGiven)
    expect(remade.device_tok).to.not.eq(made.device_tok)
  })

  it("a sweep leaves the bank's row", async () => {
    const world = makeBankWorld()
    const { bank } = await makeBankWithVault(world)
    const made = await world.deviceDB.ensureCachedDevice(BankScopeGiven)
    bank.sweep()
    expect(await world.deviceDB.ensureCachedDevice(BankScopeGiven)).to.deep.equal(made)
  })

  it("a vacate reports a device row it cannot forget to onBadNews", async () => {
    const world = makeBankWorld()
    const [refusal, listRefused] = [new VaultError('storage_unavailable', 'no storage'), new VaultError('storage_unavailable', 'no listing')]
    const onLifecycle = vi.fn()
    const onBadNews = vi.fn()
    const bank = world.bankOn({ onLifecycle, onBadNews })
    vi.spyOn(world.deviceDB, 'tryListLeases').mockResolvedValue({ ok: false, err: listRefused })
    vi.spyOn(world.deviceDB, 'tryForgetDevice').mockResolvedValueOnce({ ok: false, err: refusal })
    await bank.vacate()
    expect(onBadNews.mock.calls).to.deep.equal([[{ news: listRefused, bank }], [{ news: refusal, bank }]])
    expect(onLifecycle).toHaveBeenCalledExactlyOnceWith({ kind: 'vacated', cause: bank.snapshot.err, unrevoked: 0, bank })
  })

  it("a vacate disables the bank before it forgets its rows", async () => {
    const spy = TH.spyLogger()
    const { world, bank } = await makeBankWithVault(makeBankWorld(), { logger: spy.logger })
    const listing = TH.pendingNextCall(world.deviceDB, 'tryListLeases')
    const cause = new VaultError('identity_revoked', 'signed out')
    const vacating = bank.vacate({ cause })
    expect(bank.isEnabled).to.be.false
    expect(() => bank.demandEnabled()).to.throw(Phrases.BankLetGo)
    expect(() => bank.vaultAt(VaultScopeGiven)).to.throw(Phrases.BankLetGo)
    expect(bank.snapshot).to.include({ stage: 'disabled', err: cause })
    await listing.reached
    await TH.expectRefusal(bank.ensureVault(VaultScopeGiven), 'disabled')
    await TH.expectRefusal(bank.hello(), 'disabled')
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
    const vacating = bank.vacate()
    await listing.reached
    const news = new VaultError('storage_unavailable', 'news past the disable')
    vi.spyOn(world.deviceDB, 'tryListLeases').mockResolvedValueOnce({ ok: false, err: news })
    await bank.autolock()
    expect([requestCleartext, onLifecycle, onBadNews].map((handler) => handler.mock.calls.length)).to.deep.equal([0, 0, 0])
    listing.release()
    await vacating
    expect(onLifecycle.mock.calls).to.deep.equal([
      [{ kind: 'lease_revoke_failed', refusal, vault: null, where: 'vacate', bank }],
      [{ kind: 'vacated', cause: bank.snapshot.err, unrevoked: 1, bank }],
    ])
    expect([requestCleartext, onBadNews].map((handler) => handler.mock.calls.length)).to.deep.equal([0, 0])
    await TH.eventually(() => reported.mock.calls.some(([err]) => err === refusal))
    expect(vault.isEnabled).to.be.false
    expect(spy.calls.map(({ message }) => message)).to.include(news.message)
    vi.unstubAllGlobals()
  })

  it("a repeated vacate resolves without listing the leases again, and keeps the first cause", async () => {
    const { world, bank } = await makeBankWithVault()
    const tryListLeases = vi.spyOn(world.deviceDB, 'tryListLeases')
    const vacating = bank.vacate()
    await Promise.all([vacating, bank.vacate({ cause: new VaultError('identity_revoked', 'signed out') })])
    await bank.vacate()
    expect(tryListLeases).toHaveBeenCalledOnce()
    expect(bank.snapshot.err).to.include({ refusalkind: 'disabled' })
  })

  it("a vacate resolves when onLifecycle awaits a vacate of the same bank", async () => {
    const world = makeBankWorld()
    const refusal = new VaultError('storage_unavailable', 'no storage')
    const onLifecycle = vi.fn(async ({ bank }: { bank: Bank }) => { await bank.vacate() })
    const bank = world.bankOn({ onLifecycle })
    const row = { ...BankScopeGiven, vaultlabel: 'unlisted', vault_tok: makeLifeTok(), proved_at: T0 }
    vi.spyOn(world.deviceDB, 'tryListLeases').mockResolvedValue({ ok: true, val: [row] })
    vi.spyOn(world.deviceDB, 'forget').mockRejectedValue(refusal)
    await bank.vacate()
    expect(onLifecycle).toHaveBeenCalledTimes(2)
    await expect(Promise.all(onLifecycle.mock.results.map((result) => result.value as unknown))).resolves.to.deep.equal([undefined, undefined])
  })

  it("a vacate refuses a story whose cause is not a VaultError or that has an unknown field", () => {
    const bank = makeBankWorld().bankOn()
    TH.expectSyncRefusal(() => bank.vacate({ cause: new Error('signed out') as VaultError }), 'bad_option')
    TH.expectSyncRefusal(() => bank.vacate({ reason: 'signed out' } as never), 'bad_option')
    expect(bank.isEnabled).to.be.true
  })

  it("a vacate notifies listeners even with nothing listed", async () => {
    const world = makeBankWorld()
    const bank = world.bankOn()
    await bank.hello()
    const seen = vi.fn()
    bank.subscribe(seen)
    await bank.vacate()
    expect(seen).toHaveBeenCalledOnce()
    expect(bank.snapshot.stage).to.eq('disabled')
  })

  it("dismisses a birth's open gating, so no lease is stowed past the vacate", async () => {
    const world = makeBankWorld()
    let closeDialog: () => void = vi.fn()
    const bank = world.bankOn({ requestCleartext: async (gating) => {
      await new Promise<void>((resolve) => { closeDialog = resolve })
      await gating.attempt(byPassphrase(Passphrase))
    } })
    await bank.hello()
    const asking = bank.ensureVault(VaultScopeGiven)
    const vacating = bank.vacate()
    await TH.expectRefusal(asking)
    expect(bank.vaultListing.openGating).to.be.null
    closeDialog()
    await vacating
    expect(world.leaseRows()).to.deep.equal([])
  })

  it("shows no listener 'ready' while it sweeps", async () => {
    const { bank } = await makeBankWithVault(makeBankWorld())
    const stages: string[] = []
    bank.subscribe(() => { stages.push(bank.snapshot.stage) })
    bank.sweep()
    expect(stages).to.not.be.empty
    expect(stages).to.not.include('ready')
  })

  it("a sweep leaves cached leases for the next bank to unlock with", async () => {
    const world = makeBankWorld()
    const { bank, vault } = await makeBankWithVault(world)
    bank.sweep()
    expect(bank.snapshot.stage).to.eq('disabled')
    expect(bank.snapshot.vaults).to.deep.equal([])
    expect(vault.isEnabled).to.be.false
    expect(vault.isUnlocked).to.be.false
    expect(world.leaseRows()).to.have.lengthOf(1)
    await TH.expectRefusal(bank.ensureVault(VaultScopeGiven), 'disabled')
    await TH.expectRefusal(bank.hello(), 'disabled')
    const next = world.bankOn()
    await next.hello()
    expect(labelsOf(next.snapshot)).to.deep.equal([Dna.vaultlabel])
    const again = await next.ensureVault(VaultScopeGiven)
    await again.ensureUnlocked()
    expect(again.isUnlocked).to.be.true
  })

  it.each([
    ['sweep',  (bank: Bank): unknown => bank.sweep()],
    ['vacate', (bank: Bank): unknown => bank.vacate()],
  ] as const)("a %s that interrupts a hello leaves the bank disabled, and the hello is refused", async (_label, ending) => {
    const world = makeBankWorld()
    const bank = world.bankOn()
    const hello = bank.tryHello()
    await ending(bank)
    await TH.expectBad(hello, 'disabled')
    expect(bank.snapshot.stage).to.eq('disabled')
    expect(bank.snapshot.err).to.include({ refusalkind: 'disabled', message: Phrases.BankLetGo })
  })

  it("a vacate after a sweep forgets the bank's cached leases", async () => {
    const world = makeBankWorld()
    const { bank } = await makeBankWithVault(world)
    bank.sweep()
    expect(world.leaseRows()).to.have.lengthOf(1)
    await bank.vacate()
    expect(world.leaseRows()).to.deep.equal([])
  })

})

describe("bank.isEnabled", () => {
  type Ending = Awaited<ReturnType<typeof makeBankWithVault>>

  it.each([
    ['a sweep', ({ bank }: Ending) => { bank.sweep() }],
    ['a vacate', async ({ bank }: Ending) => { await bank.vacate() }],
  ] as const)("is true from Bank.make until %s, and never again", async (_label, ending) => {
    const made = await makeBankWithVault(makeBankWorld())
    expect(made.bank.isEnabled).to.be.true
    expect(made.bank.demandEnabled()).to.equal(made.bank)
    await ending(made)
    await TH.eventually(() => ! made.bank.isEnabled)
    await TH.expectBad(made.bank.tryHello(), 'disabled')
    await made.bank.sweep().vacate()
    expect(made.bank.isEnabled).to.be.false
    expect(() => made.bank.demandEnabled()).to.throw(Phrases.BankLetGo)
  })
})

describe("a bank past a vacate", () => {
  type Vacating = Awaited<ReturnType<typeof makeBankWithVault>>

  it.each([
    ['a plain vacate', [], async ({ bank }: Vacating) => { await bank.vacate() }],
    ['identity_revoked', ['error'], async ({ world, vault }: Vacating) => {
      world.vaultDB._cheat_refuseGets('identity_revoked')
      await TH.expectRefusal(vault.get({ maxMillisSinceRefresh: 0 }), 'identity_revoked')
      world.vaultDB._cheat_refuseGets(null)
    }],
  ] as const)("refuses ensureVault, vaultAt and hello after %s, and the next bank returns the stored vault without asking", async (_label, loggedLevels, vacating) => {
    const requestCleartext = vi.fn<RequestCleartext>(async (gating) => { await gating.attempt(byPassphrase(Passphrase)) })
    const world = makeBankWorld()
    const spy = TH.spyLogger()
    const { bank, vault } = await makeBankWithVault(world, { requestCleartext, logger: spy.logger })
    requestCleartext.mockClear()
    await vacating({ world, bank, vault })
    await TH.eventually(() => spy.calls.length >= loggedLevels.length)
    expect(spy.calls.map((call) => call.level)).to.deep.equal(loggedLevels)
    await expect(bank.ensureVault(VaultScopeGiven)).rejects.toThrow(Phrases.BankLetGo)
    expect(() => bank.vaultAt(VaultScopeGiven)).to.throw(Phrases.BankLetGo)
    await expect(bank.hello()).rejects.toThrow(Phrases.BankLetGo)
    expect(bank.vaultListing.openGating).to.be.null
    expect(requestCleartext).not.toHaveBeenCalled()
    const next = world.bankOn({ requestCleartext })
    await next.hello()
    const relisted = await next.ensureVault(VaultScopeGiven)
    expect(relisted.vault_tok).to.equal(vault.vault_tok)
    expect(requestCleartext).not.toHaveBeenCalled()
  })

  it("refuses a box put that a vacate interrupts", async () => {
    const { bank, vault } = await makeBankWithVault(makeBankWorld())
    const putting = vault.putBox({ boxlabel: 'crossed', whisper: { apiKey: 'sk-test-fake' } })
    const vacating = bank.vacate()
    await TH.expectRefusal(putting, 'disabled')
    await vacating
  })
})
