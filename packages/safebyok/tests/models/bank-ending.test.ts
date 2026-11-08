/** The bank's ending, over a real vaultDB and deviceDB: autolock, lock, vacate and sweep, and what follows a vacate. */

import { describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
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
const oldLeaseRow = (world: ReturnType<typeof makeBankWorld>, vaultlabel: string): LeaseRow => ({ ...(world.leaseRows()[0] as LeaseRow), vaultlabel, vault_tok: makeLifeTok(), proved_at: T0 - (2 * AutolockMillis) })

describe("bank.autolock", () => {
  it("locks a listed vault past its autolock, which erases its lease, leaving a younger one", async () => {
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

  it("is not called by hello, so an old row stands, and the vault's ensureUnlocked leaves it, asking for a proof whose lease is written over it", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    world.advance(AutolockMillis + 1)
    const requestCleartext = vi.fn<RequestCleartext>(async (gating) => { await gating.attempt(byPassphrase(Passphrase)) })
    const fresh = world.bankOn({ requestCleartext })
    const tryListLeases = vi.spyOn(world.deviceDB, 'tryListLeases')
    const tryForget = vi.spyOn(world.deviceDB, 'tryForget')
    await fresh.hello()
    expect(tryListLeases).not.toHaveBeenCalled()
    expect(world.leaseRows()).to.have.lengthOf(1)
    const vault = fresh.vaultAt(VaultScopeGiven)
    await vault?.ensureUnlocked()
    expect(tryForget).not.toHaveBeenCalled()
    expect(requestCleartext).toHaveBeenCalledOnce()
    expect(vault?.isUnlocked).to.be.true
    expect(tryListLeases).not.toHaveBeenCalled()
    expect(world.leaseRows()).to.have.lengthOf(1)
    expect((world.leaseRows()[0] as LeaseRow).proved_at).to.eq(T0 + AutolockMillis + 1)
  })

  it("past autolock, ensureUnlocked asks the dialog as it does with no row at all, not refusing for the lease's age", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    world.advance(AutolockMillis + 1)
    const fresh = world.bankOn({ requestCleartext: () => undefined })
    await fresh.hello()
    const vault = fresh.vaultAt(VaultScopeGiven)
    await TH.expectRefusal(vault!.ensureUnlocked(), 'declined')
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

  it("past autolock, a lease held stays held: ensureUnlocked looks at no row, erases nothing and asks nothing", async () => {
    const world = makeBankWorld()
    const requestCleartext = vi.fn<RequestCleartext>(async (gating) => { await gating.attempt(byPassphrase(Passphrase)) })
    const { vault } = await makeBankWithVault(world, { requestCleartext })
    requestCleartext.mockClear()
    world.advance(AutolockMillis + 1)
    const peek = vi.spyOn(world.deviceDB, 'peek')
    const tryForget = vi.spyOn(world.deviceDB, 'tryForget')
    await vault.ensureUnlocked()
    expect(vault.isUnlocked).to.be.true
    expect(peek).not.toHaveBeenCalled()
    expect(tryForget).not.toHaveBeenCalled()
    expect(requestCleartext).not.toHaveBeenCalled()
    expect(world.leaseRows()).to.have.lengthOf(1)
  })

  it("past autolock, a late page's ensureUnlocked leaves the row, not loaded, so the page holding its lease finds it and locks", async () => {
    const world = makeBankWorld()
    const { bank: pageA, vault: vaultA } = await makeBankWithVault(world)
    const row = world.leaseRows()[0]
    world.advance(AutolockMillis + 1)
    const pageB = world.bankOn({ requestCleartext: () => undefined })
    await pageB.hello()
    await TH.expectRefusal(pageB.vaultAt(VaultScopeGiven)!.ensureUnlocked(), 'declined')
    expect(world.leaseRows()).to.deep.equal([row])
    expect(vaultA.isUnlocked).to.be.true
    await pageA.autolock()
    expect(vaultA.isLocked).to.be.true
    await TH.eventually(() => world.leaseRows().length === 0)
  })

  it("called by a host after hello on a fresh page, erases an old lease through the vault just listed, and that vault asks again", async () => {
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

  it("relies on vault.lock() erasing the row cached for a vault already locked", async () => {
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

  it("does nothing before a hello, having nothing listed, and leaves the row where it is", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    world.advance(AutolockMillis + 1)
    const onBadNews = vi.fn()
    await world.bankOn({ onBadNews }).autolock()
    expect(world.leaseRows()).to.have.lengthOf(1)
    expect(onBadNews).not.toHaveBeenCalled()
  })

  it("keeps to its own bank's leases: another user's and another app's old leases on this device survive", async () => {
    const world = makeBankWorld()
    const { bank: ours } = await makeBankWithVault(world)
    const others = [world.bankOn({ user_id: 'u2' }), world.bankOn({ applabel: 'other_app' })]
    for (const other of others) {
      await other.hello()
      await other.ensureVault(VaultScopeGiven)
    }
    expect(world.leaseRows()).to.have.lengthOf(3)
    world.advance(AutolockMillis + 1)
    await ours.autolock()
    await TH.eventually(() => world.leaseRows().length === 2)
    expect(world.leaseRows().map((row) => (row as { user_id: string, applabel: string }).user_id + (row as { applabel: string }).applabel)).to.have.members(['u2acme', 'u1other_app'])
    for (const other of others) { expect(other.vaultAt(VaultScopeGiven)?.isUnlocked).to.be.true }
    expect(ours.vaultAt(VaultScopeGiven)?.isLocked).to.be.true
  })

  it("leaves an old row whose vault is not listed, and one of another life, neither locking the vault listed", async () => {
    const { world, bank, vault } = await makeBankWithVault()
    await world.deviceDB.stow(oldLeaseRow(world, 'unlisted'))
    await world.deviceDB.stow(oldLeaseRow(world, Dna.vaultlabel))
    const rowsBefore = world.leaseRows()
    await bank.autolock()
    expect(vault.isUnlocked).to.be.true
    expect(world.leaseRows()).to.deep.equal(rowsBefore)
  })

  it("tells a refused listing as bad news, never throwing", async () => {
    const world = makeBankWorld()
    const onBadNews = vi.fn()
    const bank = world.bankOn({ onBadNews })
    const refusal = new VaultError('storage_unavailable', 'no store')
    vi.spyOn(world.deviceDB, 'tryListLeases').mockResolvedValueOnce({ ok: false, err: refusal })
    await bank.autolock()
    expect(onBadNews).toHaveBeenCalledWith({ news: refusal, bank })
  })

  it("leaves a refused erase to the vault's own lock, whose panic onPanic hears", async () => {
    const onPanic = vi.fn()
    const { world, bank, vault } = await makeBankWithVault(makeBankWorld(), { onPanic })
    const refusal = new VaultError('storage_unavailable', 'no store')
    vi.spyOn(world.deviceDB, 'tryForget').mockResolvedValue({ ok: false, err: refusal })
    world.advance(AutolockMillis + 1)
    await bank.autolock()
    expect(vault.isLocked).to.be.true
    await TH.eventually(() => onPanic.mock.calls.length === 1)
    expect(onPanic).toHaveBeenCalledWith({ refusal, vault })
  })

  it("finds nothing past an autolock of Infinity", async () => {
    const onBadNews = vi.fn()
    const { world, bank, vault } = await makeBankWithVault(makeBankWorld(), { autolockMinutes: Infinity, onBadNews })
    world.advance(AutolockMillis * 1000)
    await bank.autolock()
    expect(vault.isUnlocked).to.be.true
    expect(onBadNews).not.toHaveBeenCalled()
  })
})

describe("bank.lock, bank.vacate, bank.sweep", () => {
  it("locks every listed vault and erases its lease, the bank unchanged", async () => {
    const { world, bank, vault } = await makeBankWithVault()
    const other = await bank.ensureVault(OtherScopeGiven)
    bank.lock()
    expect([vault.isLocked, other.isLocked]).to.deep.equal([true, true])
    await TH.eventually(() => world.leaseRows().length === 0)
    expect(bank.snapshot.stage).to.eq('ready')
    expect(await bank.ensureVault(VaultScopeGiven)).to.equal(vault)
  })

  it("vacates every listed vault and every lease of the bank on this device, leaving the vaultDB, and disables the bank for good", async () => {
    const world = makeBankWorld()
    const { bank, vault } = await makeBankWithVault(world)
    const elsewhere = world.bankOn({ user_id: 'u2' })
    await elsewhere.hello()
    await elsewhere.ensureVault(VaultScopeGiven)
    await world.deviceDB.stow(oldLeaseRow(world, 'unlisted'))
    const seen = vi.fn()
    bank.subscribe(seen)
    bank.vacate()
    expect(vault.isEnabled).to.be.false
    expect(() => vault.demandEnabled()).to.throw(VaultError)
    expect(bank.snapshot.stage).to.eq('refused')
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

  it("erases a fresh page's rows of its own bank with nothing listed, another user's staying", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    const elsewhere = world.bankOn({ user_id: 'u2' })
    await elsewhere.hello()
    await elsewhere.ensureVault(VaultScopeGiven)
    world.bankOn().vacate()
    await TH.eventually(() => world.leaseRows().length === 1)
    expect((world.leaseRows()[0] as { user_id: string }).user_id).to.eq('u2')
  })

  it("tells the platform and not onPanic of a lease its vacate cannot erase, and tries again on a repeat", async () => {
    const world = makeBankWorld()
    const refusal = new VaultError('storage_unavailable', 'no store')
    const onPanic = vi.fn()
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const bank = world.bankOn({ onPanic })
    const row = { ...BankScopeGiven, vaultlabel: 'unlisted', vault_tok: makeLifeTok(), proved_at: T0 }
    vi.spyOn(world.deviceDB, 'tryListLeases').mockResolvedValue({ ok: true, val: [row] })
    vi.spyOn(world.deviceDB, 'tryForget').mockResolvedValue({ ok: false, err: refusal })
    bank.vacate()
    await TH.eventually(() => reported.mock.calls.length === 1)
    bank.vacate()
    await TH.eventually(() => reported.mock.calls.length === 2)
    expect(reported).toHaveBeenLastCalledWith(refusal)
    expect(onPanic).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it("tells its listeners of a vacate with nothing listed, the stage alone having changed", async () => {
    const world = makeBankWorld()
    const bank = world.bankOn()
    await bank.hello()
    const seen = vi.fn()
    bank.subscribe(seen)
    bank.vacate()
    expect(seen).toHaveBeenCalledOnce()
    expect(bank.snapshot.stage).to.eq('refused')
  })

  it("declines a birth's open gating, so no lease lands past the vacate", async () => {
    const world = makeBankWorld()
    let closeDialog: () => void = vi.fn()
    const bank = world.bankOn({ requestCleartext: async (gating) => {
      await new Promise<void>((resolve) => { closeDialog = resolve })
      await gating.attempt(byPassphrase(Passphrase))
    } })
    await bank.hello()
    const asking = bank.ensureVault(VaultScopeGiven)
    bank.vacate()
    await TH.expectRefusal(asking)
    expect(bank.vaultListing.openGating).to.be.null
    closeDialog()
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

  it("sweeps its vaults and leaves their cached leases for the next bank, which picks one up with nobody asked", async () => {
    const world = makeBankWorld()
    const { bank, vault } = await makeBankWithVault(world)
    bank.sweep()
    expect(bank.snapshot.stage).to.eq('refused')
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

  it("leaves the stage to a sweep that a hello crosses, the hello's own caller hearing the refusal", async () => {
    const world = makeBankWorld()
    const bank = world.bankOn()
    const hello = bank.tryHello()
    bank.sweep()
    await TH.expectBad(hello, 'disabled')
    expect(bank.snapshot.stage).to.eq('refused')
    expect(bank.snapshot.err).to.include({ refusalkind: 'disabled' })
  })

  it("erases the bank's cached leases at a vacate after a sweep, as a sign-out after the page's cleanup", async () => {
    const world = makeBankWorld()
    const { bank } = await makeBankWithVault(world)
    bank.sweep()
    expect(world.leaseRows()).to.have.lengthOf(1)
    bank.vacate()
    await TH.eventually(() => world.leaseRows().length === 0)
  })

  it("never throws on a repeat", async () => {
    const { bank } = await makeBankWithVault()
    expect(bank.lock().lock()).to.equal(bank)
    expect(bank.vacate().vacate()).to.equal(bank)
    expect(bank.sweep().sweep()).to.equal(bank)
    expect(bank.lock()).to.equal(bank)
  })
})

describe("bank.isEnabled", () => {
  type Ending = Awaited<ReturnType<typeof makeBankWithVault>>

  it.each([
    ['a sweep', ({ bank }: Ending) => { bank.sweep() }],
    ['a vacate', ({ bank }: Ending) => { bank.vacate() }],
    ['a revocation', async ({ world, vault }: Ending) => {
      world.vaultDB._cheat_refuseGets('identity_revoked')
      await TH.expectRefusal(vault.fetch(), 'identity_revoked')
      world.vaultDB._cheat_refuseGets(null)
    }],
  ] as const)("is true from Bank.make until %s, and never again", async (_label, ending) => {
    const made = await makeBankWithVault(makeBankWorld())
    expect(made.bank.isEnabled).to.be.true
    expect(made.bank.demandEnabled()).to.equal(made.bank)
    await ending(made)
    expect(made.bank.isEnabled).to.be.false
    await TH.expectBad(made.bank.tryHello(), 'disabled')
    made.bank.sweep().vacate()
    expect(made.bank.isEnabled).to.be.false
    expect(() => made.bank.demandEnabled()).to.throw(Phrases.BankLetGo)
  })
})

describe("a bank past a vacate", () => {
  type Vacating = Awaited<ReturnType<typeof makeBankWithVault>>

  it.each([
    ['a plain vacate', ({ bank }: Vacating) => { bank.vacate() }],
    ['identity_revoked', async ({ world, vault }: Vacating) => {
      world.vaultDB._cheat_refuseGets('identity_revoked')
      await TH.expectRefusal(vault.fetch(), 'identity_revoked')
      world.vaultDB._cheat_refuseGets(null)
    }],
  ] as const)("refuses ensureVault, vaultAt and hello, and opens no gating, after %s, and the next bank answers the stored vault with nobody asked", async (_label, vacating) => {
    const requestCleartext = vi.fn<RequestCleartext>(async (gating) => { await gating.attempt(byPassphrase(Passphrase)) })
    const world = makeBankWorld()
    const { bank, vault } = await makeBankWithVault(world, { requestCleartext })
    requestCleartext.mockClear()
    await vacating({ world, bank, vault })
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

  it("refuses a box put that the vacate crosses", async () => {
    const { bank, vault } = await makeBankWithVault(makeBankWorld())
    const putting = vault.putBox({ boxlabel: 'crossed', whisper: { apiKey: 'sk-test-fake' } })
    bank.vacate()
    await TH.expectRefusal(putting, 'disabled')
  })
})
