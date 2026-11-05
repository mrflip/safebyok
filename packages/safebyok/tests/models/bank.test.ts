/** The bank of `src/models/` end to end, over a real vaultDB and deviceDB. */

import { describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import * as Phrases from '../../src/helpers/phrases'
import { makeLifeTok } from '../../src/helpers/crypto'
import type { LeaseRow } from '../../src/shapes/shapes-storage'
import type { RequestCleartext } from '../../src/shapes/shapes-gateish'
import type { BankSnapshot } from '../../src/shapes/shapes-vaultish'
import * as TH from '../test-helpers'
import { AutolockMinutes, BankBag, VaultBag, makeBankWithVault, makeBankWorld, useBankWorlds } from '../test-helpers/bank-world'
import { Dna, Passphrase, T0, byPassphrase } from '../test-helpers/vault-world'
import { anyStrengthChecker, testDeriver } from '../test-helpers/builders'

useBankWorlds()

const AutolockMillis = AutolockMinutes * 60_000

const OtherBag = Object.freeze({ vaultlabel: 'other' })

const labelsOf = ({ vaults }: BankSnapshot): string[] => vaults.map(({ vaultlabel }) => vaultlabel)

/** A lease row of this bank, as `world`'s one cached row but under `vaultlabel` and another life, proved long before the clock's first reading. */
const oldLeaseRow = (world: ReturnType<typeof makeBankWorld>, vaultlabel: string): LeaseRow => ({ ...(world.leaseRows()[0] as LeaseRow), vaultlabel, vault_tok: makeLifeTok(), proved_at: T0 - (2 * AutolockMillis) })

describe("bank.hello", () => {
  it("readies a bank over empty stores, loading its plugins, telling its listeners, and answering the same snapshot until something changes", async () => {
    const world = makeBankWorld()
    const load = vi.fn()
    const bank = world.bankOn({ keyDeriver: Object.assign(Object.create(testDeriver) as typeof testDeriver, { load }) })
    const listener = vi.fn()
    bank.subscribe(listener)
    expect(bank.getSnapshot().stage).to.eq('made')
    await bank.hello()
    expect(load).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledOnce()
    const snapshot = bank.getSnapshot()
    expect(snapshot).to.include({ ...BankBag, stage: 'ready', err: null, device_id: bank.device_id })
    expect(snapshot.vaults).to.deep.equal([])
    await bank.hello()
    expect(bank.getSnapshot()).to.equal(snapshot)
    expect(listener).toHaveBeenCalledOnce()
  })

  it("lists every vault and tombstone the vaultDB holds, locked, with no prompt, the tombstone in its slot but not its snapshot", async () => {
    const world = makeBankWorld()
    const { bank: elsewhere, vault } = await makeBankWithVault(world)
    await elsewhere.ensureVault(OtherBag)
    await vault.delVault()
    const requestCleartext = vi.fn()
    const bank = world.bankOnAnotherDevice({ requestCleartext })
    await bank.hello()
    expect(requestCleartext).not.toHaveBeenCalled()
    expect(labelsOf(bank.snapshot)).to.deep.equal([OtherBag.vaultlabel])
    expect(bank.vaultOf(OtherBag)?.isLocked).to.be.true
    expect(bank.vaultOf(VaultBag)?.isPresent).to.be.false
  })

  it("on a second call receives a row of the same life into the vault held, and replaces one of a new life, the old vault vacated", async () => {
    const world = makeBankWorld()
    const { bank: elsewhere, vault } = await makeBankWithVault(world)
    const bank = world.bankOnAnotherDevice()
    await bank.hello()
    const held = bank.vaultOf(VaultBag)
    await bank.hello()
    expect(bank.vaultOf(VaultBag)).to.equal(held)
    await vault.delVault()
    await elsewhere.ensureVault(VaultBag)
    await bank.hello()
    const reborn = bank.vaultOf(VaultBag)
    expect(reborn).not.to.equal(held)
    expect(reborn?.isPresent).to.be.true
    expect(held?.isEnabled).to.be.false
  })

  it("tombstones the vault held where the row is deleted, the vault staying in its slot and gone from the snapshot, and a rebuild goes over it", async () => {
    const world = makeBankWorld()
    const { vault } = await makeBankWithVault(world)
    const bank = world.bankOnAnotherDevice()
    await bank.hello()
    const held = bank.vaultOf(VaultBag)
    await vault.delVault()
    await bank.hello()
    expect(bank.vaultOf(VaultBag)).to.equal(held)
    expect(held?.isPresent).to.be.false
    expect(bank.snapshot.vaults).to.deep.equal([])
    const reborn = await bank.ensureVault(VaultBag)
    expect(reborn).not.to.equal(held)
    expect(reborn.isUnlocked).to.be.true
    expect(labelsOf(bank.snapshot)).to.deep.equal([Dna.vaultlabel])
  })

  it("refuses with no network, the bank not ready: its own refusal is what the snapshot shows and each bank call throws, until a hello lands", async () => {
    const world = makeBankWorld()
    const bank = world.bankOn()
    world.vaultDB._cheat_refuseGets('storage_error')
    const refusal = await TH.expectRefusal(bank.hello(), 'storage_error')
    expect(bank.snapshot).to.include({ stage: 'refused', err: refusal })
    await expect(bank.ensureVault(VaultBag)).rejects.toThrow(refusal)
    expect(() => bank.vaultOf(VaultBag)).to.throw(refusal)
    world.vaultDB._cheat_refuseGets(null)
    await bank.hello()
    expect(bank.snapshot).to.include({ stage: 'ready', err: null })
  })

  it("refuses when a plugin will not load, asking nothing of the vaultDB", async () => {
    const world = makeBankWorld()
    const getBank = vi.spyOn(world.vaultDB, 'tryGetBank')
    const refused = new VaultError('crypto_failed', 'no wasm here')
    const bank = world.bankOn({ strengthChecker: Object.assign((() => ({ strong: true })) as typeof anyStrengthChecker, { load: () => Promise.reject(refused) }) })
    await TH.expectRefusal(bank.hello(), 'crypto_failed')
    expect(bank.snapshot.err).to.equal(refused)
    expect(getBank).not.toHaveBeenCalled()
  })

  it("tells of a damaged vault row as bad news, and readies the bank without it", async () => {
    const world = makeBankWorld()
    world.vaultDB._cheat_vaultRowsOf(BankBag).set('broken', { am: 'a', nonsense: true })
    const onBadNews = vi.fn()
    const bank = world.bankOn({ onBadNews })
    await bank.hello()
    expect(bank.snapshot.stage).to.eq('ready')
    expect(onBadNews.mock.calls.map(([news]) => (news as VaultError).refusalkind)).to.deep.equal(['damaged_record'])
    expect((onBadNews.mock.calls[0]?.[0] as VaultError).message).to.include('broken')
  })

  it("tells of a damaged vault row even where another row's delivery refuses the hello", async () => {
    const onBadNews = vi.fn()
    const { world, bank } = await makeBankWithVault(makeBankWorld(), { onBadNews })
    const rows = world.vaultDB._cheat_vaultRowsOf(BankBag)
    rows.set(Dna.vaultlabel, { ...(rows.get(Dna.vaultlabel) as object), revision_tok: 'rev-other' })
    rows.set('broken', { am: 'a', nonsense: true })
    await TH.expectRefusal(bank.hello(), 'record_conflict')
    expect(onBadNews.mock.calls.map(([news]) => (news as VaultError).refusalkind)).to.deep.equal(['damaged_record'])
  })

  it("adopts the first device_id cached for the bank, whatever it was handed, and is told of a damaged record written over", async () => {
    const world = makeBankWorld()
    const first = world.bankOn({ device_id: 'device-first' })
    await first.hello()
    expect(first.device_id).to.eq('device-first')
    const second = world.bankOn({ device_id: 'device-second' })
    await second.hello()
    expect(second.device_id).to.eq('device-first')
    expect(second.snapshot.device_id).to.eq('device-first')
    const rows = world.deviceDB._cheat_deviceRows()
    for (const ckey of rows.keys()) { rows.set(ckey, { broken: true }) }
    const onBadNews = vi.fn()
    const third = world.bankOn({ device_id: 'device-third', onBadNews })
    await third.hello()
    expect(third.device_id).to.eq('device-third')
    expect(onBadNews.mock.calls.map(([news]) => (news as VaultError).refusalkind)).to.deep.equal(['damaged_record'])
  })

  it("hears a vault made elsewhere over the watch it starts", async () => {
    const world = makeBankWorld()
    const bank = world.bankOnAnotherDevice()
    await bank.hello()
    const listener = vi.fn()
    bank.subscribe(listener)
    await makeBankWithVault(world)
    await TH.eventually(() => bank.snapshot.vaults.length === 1)
    expect(listener).toHaveBeenCalled()
  })
})

describe("bank.ensureVault", () => {
  it("refuses before any hello, asking nobody", async () => {
    const requestCleartext = vi.fn()
    const bank = makeBankWorld().bankOn({ requestCleartext })
    await TH.expectRefusal(bank.ensureVault(VaultBag), 'bad_option')
    expect(() => bank.vaultOf(VaultBag)).to.throw(VaultError)
    expect(requestCleartext).not.toHaveBeenCalled()
  })

  it("builds a vault by asking, unlocked, and answers it from then on, nobody asked, through the snapshot and the subscription", async () => {
    const { bank, vault } = await makeBankWithVault()
    expect(vault.isUnlocked).to.be.true
    expect(labelsOf(bank.snapshot)).to.deep.equal([Dna.vaultlabel])
    expect(bank.snapshot.vaults[0]?.lockState).to.eq('unlocked')
    const seen = vi.fn()
    bank.subscribe(seen)
    vault.lock()
    expect(seen).toHaveBeenCalled()
    expect(bank.snapshot.vaults[0]?.lockState).to.eq('locked')
    expect(await bank.ensureVault(VaultBag)).to.equal(vault)
    expect(vault.isLocked).to.be.true
  })

  it("refuses 'already_asking' while a gating is open, and refuses with no dialog given", async () => {
    const world = makeBankWorld()
    let closeDialog = (): void => undefined
    const bank = world.bankOn({ requestCleartext: async (gating) => {
      await new Promise<void>((resolve) => { closeDialog = resolve })
      await gating.attempt(byPassphrase(Passphrase) as never)
    } })
    await bank.hello()
    const asking = bank.ensureVault(VaultBag)
    await TH.expectRefusal(bank.ensureVault(OtherBag), 'already_asking')
    closeDialog()
    await asking
    const silent = world.bankOnAnotherDevice({ requestCleartext: undefined })
    await silent.hello()
    await TH.expectRefusal(silent.ensureVault(OtherBag), 'bad_option')
  })

  it("answers tryEnsureVault's refusal as an Outcome", async () => {
    const { ok, err } = await makeBankWorld().bankOn().tryEnsureVault(VaultBag)
    expect(ok).to.be.false
    expect(err?.refusalkind).to.eq('bad_option')
  })

  it("hands a fresh bank the lease this device has cached, nobody asked", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    const requestCleartext = vi.fn()
    const fresh = world.bankOn({ requestCleartext })
    await fresh.hello()
    const vault = await fresh.ensureVault(VaultBag)
    expect(vault.isLocked).to.be.true
    await vault.ensureUnlocked()
    expect(vault.isUnlocked).to.be.true
    expect(requestCleartext).not.toHaveBeenCalled()
  })
})

describe("bank.autolock", () => {
  it("locks a listed vault past its autolock, which erases its lease, leaving a younger one", async () => {
    const { world, bank, vault } = await makeBankWithVault()
    await bank.autolock()
    expect(vault.isUnlocked).to.be.true
    expect(world.leaseRows()).to.have.lengthOf(1)
    world.advance(AutolockMillis + 1)
    await bank.autolock()
    expect(vault.isLocked).to.be.true
    expect(bank.snapshot.vaults[0]?.lockState).to.eq('locked')
    await TH.eventually(() => world.leaseRows().length === 0)
  })

  it("is not called by hello, so an old row stands, and the vault's ensureUnlocked leaves it, asking for a proof whose lease is written over it", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    world.advance(AutolockMillis + 1)
    const requestCleartext = vi.fn<RequestCleartext>(async (gating) => { await gating.attempt(byPassphrase(Passphrase) as never) })
    const fresh = world.bankOn({ requestCleartext })
    const scan = vi.spyOn(world.deviceDB, 'tryLeasesProvedBefore')
    const tryVacate = vi.spyOn(world.deviceDB, 'tryVacate')
    await fresh.hello()
    expect(scan).not.toHaveBeenCalled()
    expect(world.leaseRows()).to.have.lengthOf(1)
    const vault = fresh.vaultOf(VaultBag)
    await vault?.ensureUnlocked()
    expect(tryVacate).not.toHaveBeenCalled()
    expect(requestCleartext).toHaveBeenCalledOnce()
    expect(vault?.isUnlocked).to.be.true
    expect(scan).not.toHaveBeenCalled()
    expect(world.leaseRows()).to.have.lengthOf(1)
    expect((world.leaseRows()[0] as LeaseRow).proved_at).to.eq(T0 + AutolockMillis + 1)
  })

  it("past autolock, ensureUnlocked with no dialog refuses as it does with no row at all, not for the lease's age", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    world.advance(AutolockMillis + 1)
    const fresh = world.bankOn({ requestCleartext: undefined })
    await fresh.hello()
    const vault = fresh.vaultOf(VaultBag)
    await TH.expectRefusal(vault!.ensureUnlocked(), 'vault_locked')
    expect(world.leaseRows()).to.have.lengthOf(1)
  })

  it("a row just inside autolock still opens on a fresh page, asking nothing", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    world.advance(AutolockMillis)
    const requestCleartext = vi.fn<RequestCleartext>()
    const fresh = world.bankOn({ requestCleartext })
    await fresh.hello()
    const vault = fresh.vaultOf(VaultBag)
    await vault?.ensureUnlocked()
    expect(vault?.isUnlocked).to.be.true
    expect(requestCleartext).not.toHaveBeenCalled()
    expect(world.leaseRows()).to.have.lengthOf(1)
  })

  it("past autolock, a lease held stays held: ensureUnlocked looks at no row, erases nothing and asks nothing", async () => {
    const world = makeBankWorld()
    const requestCleartext = vi.fn<RequestCleartext>(async (gating) => { await gating.attempt(byPassphrase(Passphrase) as never) })
    const { vault } = await makeBankWithVault(world, { requestCleartext })
    requestCleartext.mockClear()
    world.advance(AutolockMillis + 1)
    const peek = vi.spyOn(world.deviceDB, 'peek')
    const tryVacate = vi.spyOn(world.deviceDB, 'tryVacate')
    await vault.ensureUnlocked()
    expect(vault.isUnlocked).to.be.true
    expect(peek).not.toHaveBeenCalled()
    expect(tryVacate).not.toHaveBeenCalled()
    expect(requestCleartext).not.toHaveBeenCalled()
    expect(world.leaseRows()).to.have.lengthOf(1)
  })

  it("past autolock, a late page's ensureUnlocked leaves the row, not loaded, so the page holding its lease finds it and locks", async () => {
    const world = makeBankWorld()
    const { bank: pageA, vault: vaultA } = await makeBankWithVault(world)
    const row = world.leaseRows()[0]
    world.advance(AutolockMillis + 1)
    const pageB = world.bankOn({ requestCleartext: undefined })
    await pageB.hello()
    await TH.expectRefusal(pageB.vaultOf(VaultBag)!.ensureUnlocked(), 'vault_locked')
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
    const requestCleartext = vi.fn<RequestCleartext>(async (gating) => { await gating.attempt(byPassphrase(Passphrase) as never) })
    const fresh = world.bankOn({ requestCleartext })
    await fresh.hello()
    await fresh.autolock()
    await TH.eventually(() => world.leaseRows().length === 0)
    const vault = fresh.vaultOf(VaultBag)
    expect(vault?.isLocked).to.be.true
    await vault?.ensureUnlocked()
    expect(requestCleartext).toHaveBeenCalledOnce()
  })

  it("relies on vault.lock() erasing the row cached for a vault already locked, as a fresh page's vault holds no lease", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    const fresh = world.bankOn()
    await fresh.hello()
    const vault = fresh.vaultOf(VaultBag)
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
      await other.ensureVault(VaultBag)
    }
    expect(world.leaseRows()).to.have.lengthOf(3)
    world.advance(AutolockMillis + 1)
    await ours.autolock()
    await TH.eventually(() => world.leaseRows().length === 2)
    expect(world.leaseRows().map((row) => (row as { user_id: string, applabel: string }).user_id + (row as { applabel: string }).applabel)).to.have.members(['u2acme', 'u1other_app'])
    for (const other of others) { expect(other.vaultOf(VaultBag)?.isUnlocked).to.be.true }
    expect(ours.vaultOf(VaultBag)?.isLocked).to.be.true
  })

  it("leaves an old row whose vault is not listed, and one of another life, neither locking the vault listed", async () => {
    const { world, bank, vault } = await makeBankWithVault()
    await world.deviceDB.cache(oldLeaseRow(world, 'unlisted'))
    await world.deviceDB.cache(oldLeaseRow(world, Dna.vaultlabel))
    const rowsBefore = world.leaseRows()
    await bank.autolock()
    expect(vault.isUnlocked).to.be.true
    expect(world.leaseRows()).to.deep.equal(rowsBefore)
  })

  it("tells a refused scan as bad news, never throwing", async () => {
    const world = makeBankWorld()
    const onBadNews = vi.fn()
    const bank = world.bankOn({ onBadNews })
    const refusal = new VaultError('storage_unavailable', 'no store')
    vi.spyOn(world.deviceDB, 'tryLeasesProvedBefore').mockResolvedValueOnce({ ok: false, err: refusal })
    await bank.autolock()
    expect(onBadNews).toHaveBeenCalledWith(refusal)
  })

  it("leaves a refused erase to the vault's own lock, whose panic onPanic hears", async () => {
    const onPanic = vi.fn()
    const { world, bank, vault } = await makeBankWithVault(makeBankWorld(), { onPanic })
    const refusal = new VaultError('storage_unavailable', 'no store')
    vi.spyOn(world.deviceDB, 'tryVacate').mockResolvedValue({ ok: false, err: refusal })
    world.advance(AutolockMillis + 1)
    await bank.autolock()
    expect(vault.isLocked).to.be.true
    await TH.eventually(() => onPanic.mock.calls.length === 1)
    expect(onPanic).toHaveBeenCalledWith(refusal)
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
    const other = await bank.ensureVault(OtherBag)
    bank.lock()
    expect([vault.isLocked, other.isLocked]).to.deep.equal([true, true])
    await TH.eventually(() => world.leaseRows().length === 0)
    expect(bank.snapshot.stage).to.eq('ready')
    expect(await bank.ensureVault(VaultBag)).to.equal(vault)
  })

  it("vacates every listed vault and every lease of the bank on this device, leaving the vaultDB, the bank not ready, and a hello lists them afresh", async () => {
    const world = makeBankWorld()
    const { bank, vault } = await makeBankWithVault(world)
    const elsewhere = world.bankOn({ user_id: 'u2' })
    await elsewhere.hello()
    await elsewhere.ensureVault(VaultBag)
    await world.deviceDB.cache(oldLeaseRow(world, 'unlisted'))
    const seen = vi.fn()
    bank.subscribe(seen)
    bank.vacate()
    expect(vault.isEnabled).to.be.false
    expect(() => vault.demandEnabled()).to.throw(VaultError)
    expect(bank.snapshot).to.include({ stage: 'made', err: null })
    expect(bank.snapshot.vaults).to.deep.equal([])
    expect(seen).toHaveBeenCalled()
    await TH.eventually(() => world.leaseRows().length === 1)
    await bank.hello()
    const relisted = bank.vaultOf(VaultBag)
    expect(relisted?.isPresent).to.be.true
    expect(relisted).not.to.equal(vault)
    expect(relisted?.isLocked).to.be.true
  })

  it("erases a fresh page's rows of its own bank with nothing listed, another user's staying", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    const elsewhere = world.bankOn({ user_id: 'u2' })
    await elsewhere.hello()
    await elsewhere.ensureVault(VaultBag)
    world.bankOn().vacate()
    await TH.eventually(() => world.leaseRows().length === 1)
    expect((world.leaseRows()[0] as { user_id: string }).user_id).to.eq('u2')
  })

  it("panics at a lease it cannot erase: onPanic hears it, a rejection of it goes to the platform, and without one the refusal does", async () => {
    const world = makeBankWorld()
    const refusal = new VaultError('storage_unavailable', 'no store')
    const onPanic = vi.fn()
    const bank = world.bankOn({ onPanic })
    const row = { ...BankBag, vaultlabel: 'unlisted', vault_tok: makeLifeTok(), proved_at: T0 }
    vi.spyOn(world.deviceDB, 'tryLeasesProvedBefore').mockResolvedValue({ ok: true, val: [row] })
    vi.spyOn(world.deviceDB, 'tryVacate').mockResolvedValue({ ok: false, err: refusal })
    bank.vacate()
    await TH.eventually(() => onPanic.mock.calls.length === 1)
    expect(onPanic).toHaveBeenCalledWith(refusal)
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    onPanic.mockRejectedValueOnce(new Error('panic handler broke'))
    bank.vacate()
    await TH.eventually(() => reported.mock.calls.length === 1)
    world.bankOn().vacate()
    await TH.eventually(() => reported.mock.calls.length === 2)
    expect(reported).toHaveBeenLastCalledWith(refusal)
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
    expect(bank.snapshot.stage).to.eq('made')
  })

  it("declines a birth's open gating, so no lease lands past the vacate and the next ask is free to open", async () => {
    const world = makeBankWorld()
    let closeDialog: () => void = vi.fn()
    const bank = world.bankOn({ requestCleartext: async (gating) => {
      await new Promise<void>((resolve) => { closeDialog = resolve })
      await gating.attempt(byPassphrase(Passphrase) as never)
    } })
    await bank.hello()
    const asking = bank.ensureVault(VaultBag)
    bank.vacate()
    await TH.expectRefusal(asking, 'locked_while_asking')
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

  it("sweeps its vaults and leaves their cached leases; refuses until the next hello, which builds a fresh listing and picks the lease up, nobody asked", async () => {
    const world = makeBankWorld()
    const { bank, vault } = await makeBankWithVault(world)
    bank.sweep()
    expect(bank.snapshot).to.include({ stage: 'made' })
    expect(bank.snapshot.vaults).to.deep.equal([])
    expect(vault.isEnabled).to.be.false
    expect(vault.isUnlocked).to.be.false
    expect(world.leaseRows()).to.have.lengthOf(1)
    await TH.expectRefusal(bank.ensureVault(VaultBag), 'bad_option')
    const seen = vi.fn()
    bank.subscribe(seen)
    await bank.hello()
    expect(seen).toHaveBeenCalled()
    expect(labelsOf(bank.snapshot)).to.deep.equal([Dna.vaultlabel])
    const again = await bank.ensureVault(VaultBag)
    expect(again).not.to.equal(vault)
    await again.ensureUnlocked()
    expect(again.isUnlocked).to.be.true
  })

  it("does not let a hello crossing a sweep touch the bank's stage: its own caller hears the refusal, as an effect's cleanup does not want a flicker", async () => {
    const world = makeBankWorld()
    const bank = world.bankOn()
    const hello = bank.tryHello()
    bank.sweep()
    const { ok, err } = await hello
    expect(ok).to.be.false
    expect(err?.refusalkind).to.eq('disabled')
    expect(bank.snapshot.stage).to.eq('made')
    await bank.hello()
    expect(bank.snapshot.stage).to.eq('ready')
  })

  it("keeps the snapshot's device_id with the bank's where a sweep crosses the hello that cached it, and tells its listeners", async () => {
    const world = makeBankWorld()
    await world.bankOn({ device_id: 'device-first' }).hello()
    const bank = world.bankOn({ device_id: 'device-second' })
    const listener = vi.fn()
    bank.subscribe(listener)
    const caching = world.deviceDB.cacheDeviceRecord.bind(world.deviceDB)
    vi.spyOn(world.deviceDB, 'cacheDeviceRecord').mockImplementation(async (asked) => {
      const cached = await caching(asked)
      bank.sweep()
      return cached
    })
    const { err } = await bank.tryHello()
    expect(err?.refusalkind).to.eq('disabled')
    expect(bank.device_id).to.eq('device-first')
    expect(bank.snapshot).to.include({ stage: 'made', device_id: 'device-first' })
    expect(listener).toHaveBeenCalled()
  })

  it("never throws on a repeat", async () => {
    const { bank } = await makeBankWithVault()
    expect(bank.lock().lock()).to.equal(bank)
    expect(bank.vacate().vacate()).to.equal(bank)
    expect(bank.sweep().sweep()).to.equal(bank)
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
  ] as const)("refuses ensureVault and vaultOf with BankHelloFirst and opens no gating, after %s, and a hello answers the stored vault with nobody asked", async (_label, vacating) => {
    const requestCleartext = vi.fn<RequestCleartext>(async (gating) => { await gating.attempt(byPassphrase(Passphrase) as never) })
    const { world, bank, vault } = await makeBankWithVault(makeBankWorld(), { requestCleartext })
    requestCleartext.mockClear()
    await vacating({ world, bank, vault })
    await expect(bank.ensureVault(VaultBag)).rejects.toThrow(Phrases.BankHelloFirst)
    expect(() => bank.vaultOf(VaultBag)).to.throw(Phrases.BankHelloFirst)
    expect(bank.vaultListing.openGating).to.be.null
    expect(requestCleartext).not.toHaveBeenCalled()
    await bank.hello()
    const relisted = await bank.ensureVault(VaultBag)
    expect(relisted.vault_tok).to.equal(vault.vault_tok)
    expect(requestCleartext).not.toHaveBeenCalled()
  })
})

describe("'identity_revoked' and bad news", () => {
  it("vacates the bank before a refused hello throws, leaving no lease of the bank on this device, listed or not", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    const onBadNews = vi.fn()
    const fresh = world.bankOn({ onBadNews })
    world.vaultDB._cheat_refuseGets('identity_revoked')
    const refusal = await TH.expectRefusal(fresh.hello(), 'identity_revoked')
    expect(onBadNews).toHaveBeenCalledWith(refusal)
    await TH.eventually(() => world.leaseRows().length === 0)
    expect(fresh.snapshot).to.include({ stage: 'refused', err: refusal })
  })

  it("vacates the bank when any vault's call into the vaultDB is refused so, then passes the refusal up", async () => {
    const { world, bank, vault } = await makeBankWithVault()
    world.vaultDB._cheat_refuseGets('identity_revoked')
    await TH.expectRefusal(vault.fetch(), 'identity_revoked')
    expect(vault.isEnabled).to.be.false
    expect(bank.snapshot.vaults).to.deep.equal([])
    await TH.eventually(() => world.leaseRows().length === 0)
    expect(bank.snapshot.stage).to.eq('made')
  })

  it("logs a bad news with no onBadNews to hear it, and other news vacates nothing", async () => {
    const world = makeBankWorld()
    const spy = TH.spyLogger()
    const { bank, vault } = await makeBankWithVault(world, { logger: spy.logger })
    const news = new VaultError('damaged_record', 'something stored is damaged')
    bank.vaultListing.tellBadNews([news])
    expect(spy.calls.map(({ message }) => message)).to.include(news.message)
    expect(vault.isEnabled).to.be.true
  })
})

describe("the snapshot and its subscription", () => {
  it("tells no listener once unsubscribed, and a listener's throw reaches the platform and not the call that changed the bank", async () => {
    const bank = makeBankWorld().bankOn()
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const broken = vi.fn(() => { throw new Error('listener broke') })
    const gone = vi.fn()
    bank.subscribe(broken)
    bank.subscribe(gone)()
    await bank.hello()
    expect(broken).toHaveBeenCalledOnce()
    expect(gone).not.toHaveBeenCalled()
    expect(reported).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })

  it("is frozen, and serializes as itself", async () => {
    const { bank } = await makeBankWithVault()
    expect(Object.isFrozen(bank.snapshot)).to.be.true
    expect(bank.toJSON()).to.equal(bank.snapshot)
  })
})
