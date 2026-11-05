/** The bank of `src/models/` end to end, over a real vaultDB and deviceDB: hello, ensureVault, bad news and the snapshot. */

import { describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import type { Outcome } from '../../src/refusals/outcome'
import * as TH from '../test-helpers'
import { BankScopeGiven, OtherScopeGiven, VaultScopeGiven, labelsOf, makeBankWithVault, makeBankWorld, useBankWorlds } from '../test-helpers/bank-world'
import { Dna, Passphrase, byPassphrase } from '../test-helpers/vault-world'
import { anyStrengthChecker, testDeriver } from '../test-helpers/builders'

useBankWorlds()

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
    expect(snapshot).to.include({ ...BankScopeGiven, stage: 'ready', err: null, device_id: bank.device_id })
    expect(snapshot.vaults).to.deep.equal([])
    await bank.hello()
    expect(bank.getSnapshot()).to.equal(snapshot)
    expect(listener).toHaveBeenCalledOnce()
  })

  it("lists every vault and tombstone the vaultDB holds, locked, with no prompt, the tombstone in its slot but not its snapshot", async () => {
    const world = makeBankWorld()
    const { bank: elsewhere, vault } = await makeBankWithVault(world)
    await elsewhere.ensureVault(OtherScopeGiven)
    await vault.delVaultPrompt()
    const requestCleartext = vi.fn()
    const bank = world.bankOnAnotherDevice({ requestCleartext })
    await bank.hello()
    expect(requestCleartext).not.toHaveBeenCalled()
    expect(labelsOf(bank.snapshot)).to.deep.equal([OtherScopeGiven.vaultlabel])
    expect(bank.vaultAt(OtherScopeGiven)?.isLocked).to.be.true
    expect(bank.vaultAt(VaultScopeGiven)?.isPresent).to.be.false
  })

  it("on a second call receives a row of the same life into the vault held, and replaces one of a new life, the old vault vacated", async () => {
    const world = makeBankWorld()
    const { bank: elsewhere, vault } = await makeBankWithVault(world)
    const bank = world.bankOnAnotherDevice()
    await bank.hello()
    const held = bank.vaultAt(VaultScopeGiven)
    await bank.hello()
    expect(bank.vaultAt(VaultScopeGiven)).to.equal(held)
    await vault.delVaultPrompt()
    await elsewhere.ensureVault(VaultScopeGiven)
    await bank.hello()
    const reborn = bank.vaultAt(VaultScopeGiven)
    expect(reborn).not.to.equal(held)
    expect(reborn?.isPresent).to.be.true
    expect(held?.isEnabled).to.be.false
  })

  it("tombstones the vault held where the row is deleted, the vault staying in its slot and gone from the snapshot, and a rebuild goes over it", async () => {
    const world = makeBankWorld()
    const { vault } = await makeBankWithVault(world)
    const bank = world.bankOnAnotherDevice()
    await bank.hello()
    const held = bank.vaultAt(VaultScopeGiven)
    await vault.delVaultPrompt()
    await bank.hello()
    expect(bank.vaultAt(VaultScopeGiven)).to.equal(held)
    expect(held?.isPresent).to.be.false
    expect(bank.snapshot.vaults).to.deep.equal([])
    const reborn = await bank.ensureVault(VaultScopeGiven)
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
    await expect(bank.ensureVault(VaultScopeGiven)).rejects.toThrow(refusal)
    expect(() => bank.vaultAt(VaultScopeGiven)).to.throw(refusal)
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
    world.vaultDB._cheat_vaultRowsOf(BankScopeGiven).set('broken', { am: 'a', nonsense: true })
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
    const rows = world.vaultDB._cheat_vaultRowsOf(BankScopeGiven)
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
    await TH.expectRefusal(bank.ensureVault(VaultScopeGiven), 'bad_option')
    expect(() => bank.vaultAt(VaultScopeGiven)).to.throw(VaultError)
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
    expect(await bank.ensureVault(VaultScopeGiven)).to.equal(vault)
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
    const asking = bank.ensureVault(VaultScopeGiven)
    await TH.expectRefusal(bank.ensureVault(OtherScopeGiven), 'already_asking')
    closeDialog()
    await asking
    const silent = world.bankOnAnotherDevice({ requestCleartext: undefined })
    await silent.hello()
    await TH.expectRefusal(silent.ensureVault(OtherScopeGiven), 'bad_option')
  })

  it("answers tryEnsureVault's refusal as an Outcome", async () => {
    const { ok, err } = await makeBankWorld().bankOn().tryEnsureVault(VaultScopeGiven)
    expect(ok).to.be.false
    expect(err?.refusalkind).to.eq('bad_option')
  })

  it("hands a fresh bank the lease this device has cached, nobody asked", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    const requestCleartext = vi.fn()
    const fresh = world.bankOn({ requestCleartext })
    await fresh.hello()
    const vault = await fresh.ensureVault(VaultScopeGiven)
    expect(vault.isLocked).to.be.true
    await vault.ensureUnlocked()
    expect(vault.isUnlocked).to.be.true
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
    bank.tellBadNews([news])
    expect(spy.calls.map(({ message }) => message)).to.include(news.message)
    expect(vault.isEnabled).to.be.true
  })

  it("with no strengthChecker, finds every new passphrase weak, its reason sending the app's makers to CUSTOMIZATION.md", async () => {
    const attempts: Outcome<unknown>[] = []
    const bank = makeBankWorld().bankOn({ strengthChecker: undefined, requestCleartext: async (gating) => { attempts.push(await gating.attempt(byPassphrase(Passphrase) as never)) } })
    await bank.hello()
    await TH.expectRefusal(bank.ensureVault(VaultScopeGiven), 'declined')
    const [attempted] = attempts
    expect(attempted?.err).to.include({ refusalkind: 'weak_passphrase' })
    expect(attempted?.err?.message).to.include('CUSTOMIZATION.md')
  })

  it("keeps to its call when the host's logger throws, in Bank.make and past a cached lease row it cannot erase", async () => {
    const world = makeBankWorld()
    const warn = vi.fn(() => { throw new Error('the logger broke') })
    const logger = { log: warn, warn, error: warn }
    await makeBankWithVault(world, { logger })
    expect(warn.mock.calls).to.have.length(1)
    const [cached] = world.leaseRows() as [{ gate_epoch: number }]
    vi.spyOn(world.deviceDB, 'tryPeek').mockResolvedValueOnce(TH.good({ ...cached, gate_epoch: cached.gate_epoch + 1 } as never))
    vi.spyOn(world.deviceDB, 'tryVacate').mockResolvedValueOnce(TH.bad(new VaultError('storage_unavailable', 'the store is down')))
    const page = world.bankOn({ logger })
    await page.hello()
    const unlocked = await page.vaultAt(VaultScopeGiven)?.ensureUnlocked()
    expect(unlocked?.isUnlocked).to.be.true
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not be erased'), expect.objectContaining({ call: 'Lease.buildFromCache' }), undefined)
  })

  it("hears a vault's bad news, a box's way, the same as its own, and 'identity_revoked' told so vacates it", async () => {
    const onBadNews = vi.fn()
    const { vault } = await makeBankWithVault(makeBankWorld(), { onBadNews })
    const news = new VaultError('damaged_record', 'something stored is damaged')
    vault.tellBadNews([news])
    expect(onBadNews.mock.calls).to.deep.equal([[news]])
    expect(vault.isEnabled).to.be.true
    const revoked = new VaultError('identity_revoked', 'the host says no')
    vault.tellBadNews([revoked])
    expect(onBadNews).toHaveBeenCalledWith(revoked)
    expect(vault.isEnabled).to.be.false
  })

  it("reports a handler that throws to the platform and goes on, the rest of the news told", () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const told: string[] = []
    const bank = makeBankWorld().bankOn({ onBadNews: (news) => { told.push(news.refusalkind); throw new Error("The handler is broken.") } })
    bank.tellBadNews([new VaultError('storage_unavailable', "Down."), new VaultError('absent_box', "Gone.")])
    expect(told).to.deep.equal(['storage_unavailable', 'absent_box'])
    expect(reported).toHaveBeenCalledTimes(2)
    vi.unstubAllGlobals()
  })

  it("reports a handler whose promise rejects to the platform, with no unhandled rejection", async () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const bank = makeBankWorld().bankOn({ onBadNews: () => Promise.reject(new Error("Rejected.")) })
    bank.tellBadNews([new VaultError('storage_unavailable', "Down.")])
    await TH.eventually(() => reported.mock.calls.length === 1)
    expect(reported.mock.calls[0]?.[0]).to.have.property('message', "Rejected.")
    vi.unstubAllGlobals()
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
