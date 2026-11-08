/** The bank of `src/models/` end to end, over a real vaultDB and deviceDB: hello, ensureVault, bad news and the snapshot. */

import { describe, expect, it, vi } from 'vitest'
import { DefaultLogger, setDefaultLogger } from '../../src/helpers/logger'
import { ForeverMillis, isGuarded } from '../../src/helpers/consts'
import { type Bank, DefaultOnLifecycle, guardOnLifecycle, guardRequestCleartext, tellBadNewsTo } from '../../src/models/bank'
import { DefaultLeaseMillis, type Vault } from '../../src/models/vault'
import type { BadNews, BankEvent } from '../../src/shapes/shapes-vaultish'
import { bankDisabled } from '../../src/refusals/throwers'
import type { AnyGating } from '../../src/shapes/shapes-gateish'
import { VaultError } from '../../src/refusals/errors'
import type { Outcome } from '../../src/refusals/outcome'
import * as TH from '../test-helpers'
import { BankScopeGiven, OtherScopeGiven, VaultScopeGiven, labelsOf, makeBankWithVault, makeBankWorld, useBankWorlds } from '../test-helpers/bank-world'
import { Dna, Passphrase, byPassphrase } from '../test-helpers/vault-world'
import { anyStrengthChecker, testDeriver } from '../test-helpers/builders'

useBankWorlds()
const nothing = (): void => undefined

/** `news`, told as bad news by `bank`: its autolock, whose listing of the cached leases `world`'s deviceDB refuses with it. */
const tellByAutolock = async (world: ReturnType<typeof makeBankWorld>, bank: Bank, news: VaultError): Promise<void> => {
  vi.spyOn(world.deviceDB, 'tryListLeases').mockResolvedValueOnce({ ok: false, err: news })
  await bank.autolock()
}


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

  it("tells onLifecycle each hello's outcome, a bank's naming no vault and a vault's naming it", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    const onLifecycle = vi.fn()
    const bank = world.bankOn({ onLifecycle })
    world.vaultDB._cheat_refuseGets('storage_unavailable')
    const refusal = await TH.expectRefusal(bank.hello(), 'storage_unavailable')
    expect(onLifecycle).toHaveBeenLastCalledWith({ kind: 'helloed', outcome: { ok: false, err: refusal }, vault: null, bank })
    world.vaultDB._cheat_refuseGets(null)
    await bank.hello()
    expect(onLifecycle).toHaveBeenLastCalledWith({ kind: 'helloed', outcome: { ok: true, val: undefined }, vault: null, bank })
    const vault = bank.vaultAt(VaultScopeGiven)
    await vault?.hello()
    expect(onLifecycle).toHaveBeenLastCalledWith({ kind: 'helloed', outcome: { ok: true, val: undefined }, vault, bank })
    expect(onLifecycle).toHaveBeenCalledTimes(3)
  })

  it("tells the host nothing of a hello a sweep crosses", async () => {
    const onLifecycle = vi.fn()
    const world = makeBankWorld()
    const bank = world.bankOn({ onLifecycle })
    const answer = TH.holdNextAnswer(world.vaultDB, 'tryListVaults')
    const hello = bank.tryHello()
    await answer.reached
    bank.sweep()
    answer.release()
    await TH.expectBad(hello, 'disabled')
    expect(onLifecycle).not.toHaveBeenCalled()
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
    world.vaultDB._cheat_refuseGets('storage_unavailable')
    const refusal = await TH.expectRefusal(bank.hello(), 'storage_unavailable')
    expect(bank.snapshot).to.include({ stage: 'refused', err: refusal })
    await expect(bank.ensureVault(VaultScopeGiven)).rejects.toThrow(refusal)
    expect(() => bank.vaultAt(VaultScopeGiven)).to.throw(refusal)
    world.vaultDB._cheat_refuseGets(null)
    await bank.hello()
    expect(bank.snapshot).to.include({ stage: 'ready', err: null })
  })

  it("refuses when a strength checker will not load, what it threw the cause, asking nothing of the vaultDB", async () => {
    const world = makeBankWorld()
    const listVaults = vi.spyOn(world.vaultDB, 'tryListVaults')
    const thrown = new Error('no word list here')
    const bank = world.bankOn({ strengthChecker: Object.assign((() => ({ strong: true })) as typeof anyStrengthChecker, { load: () => Promise.reject(thrown) }) })
    const err = await TH.expectRefusal(bank.hello())
    expect(err.cause).to.eq(thrown)
    expect(err.message).to.match(/strengthChecker's load\(\) failed/)
    expect(bank.snapshot).to.include({ stage: 'refused', err })
    expect(listVaults).not.toHaveBeenCalled()
  })

  it("refuses when a key deriver will not load, what it threw the cause, asking nothing of the vaultDB", async () => {
    const world = makeBankWorld()
    const listVaults = vi.spyOn(world.vaultDB, 'tryListVaults')
    const thrown = new Error('no wasm here')
    const bank = world.bankOn({ keyDeriver: Object.assign(Object.create(testDeriver) as typeof testDeriver, { load: () => Promise.reject(thrown) }) })
    const err = await TH.expectRefusal(bank.hello())
    expect(err.cause).to.eq(thrown)
    expect(err.message).to.match(/keyDeriver's load\(\) failed/)
    expect(bank.snapshot).to.include({ stage: 'refused', err })
    expect(listVaults).not.toHaveBeenCalled()
  })

  it("passes a VaultError a key deriver's load throws as it came", async () => {
    const world = makeBankWorld()
    const refused = new VaultError('storage_unavailable', 'no wasm here')
    const bank = world.bankOn({ keyDeriver: Object.assign(Object.create(testDeriver) as typeof testDeriver, { load: () => Promise.reject(refused) }) })
    const err = await TH.expectRefusal(bank.hello(), 'storage_unavailable')
    expect(err).to.eq(refused)
    expect(bank.snapshot).to.include({ stage: 'refused', err })
  })

  it("passes a VaultError a strength checker's load throws as it came", async () => {
    const world = makeBankWorld()
    const refused = new VaultError('storage_unavailable', 'no word list here')
    const bank = world.bankOn({ strengthChecker: Object.assign((() => ({ strong: true })) as typeof anyStrengthChecker, { load: () => Promise.reject(refused) }) })
    const err = await TH.expectRefusal(bank.hello(), 'storage_unavailable')
    expect(err).to.eq(refused)
    expect(bank.snapshot).to.include({ stage: 'refused', err })
  })

  it("tells of a damaged vault row as bad news, and readies the bank without it", async () => {
    const world = makeBankWorld()
    world.vaultDB._cheat_vaultRowsOf(BankScopeGiven).set('broken', { am: 'a', nonsense: true })
    const onBadNews = vi.fn()
    const bank = world.bankOn({ onBadNews })
    await bank.hello()
    expect(bank.snapshot.stage).to.eq('ready')
    expect(onBadNews.mock.calls.map(([heard]) => (heard as BadNews).news.refusalkind)).to.deep.equal(['damaged_row'])
    expect((onBadNews.mock.calls[0]?.[0] as BadNews).news.message).to.include('broken')
  })

  it("tells of a damaged vault row even where another row's delivery refuses the hello", async () => {
    const onBadNews = vi.fn()
    const { world, bank } = await makeBankWithVault(makeBankWorld(), { onBadNews })
    const rows = world.vaultDB._cheat_vaultRowsOf(BankScopeGiven)
    rows.set(Dna.vaultlabel, { ...(rows.get(Dna.vaultlabel) as object), revision_tok: 'rev-other' })
    rows.set('broken', { am: 'a', nonsense: true })
    await TH.expectRefusal(bank.hello())
    expect(onBadNews.mock.calls.map(([heard]) => (heard as BadNews).news.refusalkind)).to.deep.equal(['damaged_row'])
  })

  it("keeps the device_id each bank was handed", async () => {
    const world = makeBankWorld()
    const [firstId, secondId] = [crypto.randomUUID(), crypto.randomUUID()]
    const first = world.bankOn({ device_id: firstId })
    await first.hello()
    const second = world.bankOn({ device_id: secondId })
    await second.hello()
    expect([first.device_id, first.snapshot.device_id]).to.deep.equal([firstId, firstId])
    expect([second.device_id, second.snapshot.device_id]).to.deep.equal([secondId, secondId])
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

describe("the host's functions, as a bank holds them", () => {
  it("holds each wrapped and branded, never the host's own on a prop", () => {
    const requestCleartext = vi.fn()
    const onLifecycle = vi.fn()
    const bank = makeBankWorld().bankOn({ requestCleartext, onLifecycle })
    for (const held of [bank.keyDeriver, bank.strengthChecker]) { expect(isGuarded(held)).to.be.true }
    expect(Object.values(bank)).to.not.include.members([requestCleartext, onLifecycle, testDeriver, anyStrengthChecker])
  })

  it("asks the dialog, answering true once it closes and false when it throws, keeping nothing of the throw", async () => {
    const gating = {} as AnyGating
    const dialog = vi.fn()
    expect(await guardRequestCleartext(dialog)(gating)).to.be.true
    expect(dialog).toHaveBeenCalledWith(gating)
    expect(await guardRequestCleartext(() => { throw new Error(Passphrase) })(gating)).to.be.false
  })

  it("tells onLifecycle, sending a throw from it to the platform", async () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const cause = new VaultError('identity_revoked', 'signed out')
    const thrown = new Error('lifecycle handler broke')
    await guardOnLifecycle(() => { throw thrown })({ kind: 'vacated', cause, unerased: 0, bank: {} as Bank })
    expect(reported).toHaveBeenCalledWith(thrown)
    vi.unstubAllGlobals()
  })

  it("refuses a requestCleartext or an onLifecycle that is no function", () => {
    TH.expectSyncRefusal(() => guardRequestCleartext('ask' as never), 'bad_option')
    TH.expectSyncRefusal(() => guardOnLifecycle('call me' as never), 'bad_option')
  })
})

describe("DefaultOnLifecycle", () => {
  const Refusal = new VaultError('storage_unavailable', 'no store', { cause: new Error(Passphrase) })
  const Revoked = new VaultError('identity_revoked', 'signed out')
  const LifecycleCases = [
    // a cached lease that outlived its erase:
    [{ kind: 'lease_unerased', refusal: Refusal, where: 'lock' },      'error', true,  'reports a lock\'s refused erase at error and to the platform, and vacates the vault'],
    [{ kind: 'lease_unerased', refusal: Refusal, where: 'vacate' },    'error', true,  'reports a vacate\'s refused erase at error and to the platform'],
    [{ kind: 'lease_unerased', refusal: Refusal, where: 'tombstone' }, 'warn',  false, 'warns of a tombstone\'s refused erase, vacating nothing'],
    [{ kind: 'lease_unerased', refusal: Refusal, where: 'outdated' },  'warn',  false, 'warns of an outdated row\'s refused erase, vacating nothing'],
    // a vacate:
    [{ kind: 'vacated', cause: Revoked, unerased: 0 },                 'error', false, 'reports a vacate for a revoked identity at error and to the platform'],
    [{ kind: 'vacated', cause: bankDisabled(), unerased: 1 },          null,    false, 'says nothing of a sign-out'],
    // a hello:
    [{ kind: 'helloed', outcome: { ok: false, err: Refusal } },         'warn',  false, 'warns of a refused hello'],
    [{ kind: 'helloed', outcome: { ok: true, val: undefined } },        null,    false, 'says nothing of a hello that lands'],
    [{ kind: 'helloed', outcome: { ok: false, err: bankDisabled() } },  null,    false, 'says nothing of a hello the bank\'s end refused'],
  ] as const

  for (const [told, level, isVacating, blurb] of LifecycleCases) {
    it(blurb, () => {
      const reported = vi.fn()
      vi.stubGlobal('reportError', reported)
      const spy = TH.spyLogger()
      const [vacate, bankVacate] = [vi.fn(), vi.fn()]
      const bank = { vacate: bankVacate, logger: spy.logger } as unknown as Bank
      const vault = { vacate } as unknown as Vault
      DefaultOnLifecycle({ ...told, ...(told.kind !== 'vacated' && { vault }), bank } as BankEvent)
      expect(spy.calls.map((call) => call.level)).to.deep.equal(level === null ? [] : [level])
      expect(reported.mock.calls.length).to.eq(level === 'error' ? 1 : 0)
      expect(vacate.mock.calls.length).to.eq(isVacating ? 1 : 0)
      expect(bankVacate).not.toHaveBeenCalled()
      vi.unstubAllGlobals()
    })
  }

  it("logs a refusal at error through the bank's logger, its kind and nothing more, where the platform has no reportError", () => {
    vi.stubGlobal('reportError', undefined)
    const spy = TH.spyLogger()
    const bank = { vacate: vi.fn(), logger: spy.logger } as unknown as Bank
    DefaultOnLifecycle({ kind: 'lease_unerased', refusal: Refusal, vault: null, where: 'vacate', bank })
    expect(spy.calls).to.deep.equal([{ level: 'error', message: Refusal.message, story: { call: 'Bank.onLifecycle', refusalkind: 'storage_unavailable' }, err: undefined }])
    expect(JSON.stringify(spy.calls)).not.to.include(Passphrase)
    vi.unstubAllGlobals()
  })
})

describe("bank.ensureVault", () => {
  it("refuses before any hello, asking nobody", async () => {
    const requestCleartext = vi.fn()
    const bank = makeBankWorld().bankOn({ requestCleartext })
    await TH.expectRefusal(bank.ensureVault(VaultScopeGiven))
    expect(() => bank.vaultAt(VaultScopeGiven)).to.throw(VaultError)
    expect(requestCleartext).not.toHaveBeenCalled()
  })

  // BankedVaultScope @example
  it("builds a vault by asking, unlocked, and answers it from then on, nobody asked, through the snapshot and the subscription", async () => {
    const { bank, vault } = await makeBankWithVault()
    expect(vault).to.include({ ...BankScopeGiven, ...VaultScopeGiven })
    expect(vault.isUnlocked).to.be.true
    expect(labelsOf(bank.snapshot)).to.deep.equal([Dna.vaultlabel])
    expect(bank.snapshot.vaults[0]?.isLocked).to.be.false
    const seen = vi.fn()
    bank.subscribe(seen)
    vault.lock()
    expect(seen).toHaveBeenCalled()
    expect(bank.snapshot.vaults[0]?.isLocked).to.be.true
    expect(await bank.ensureVault(VaultScopeGiven)).to.equal(vault)
    expect(vault.isLocked).to.be.true
  })

  it("refuses while a gating is open", async () => {
    const world = makeBankWorld()
    let closeDialog = nothing
    const bank = world.bankOn({ requestCleartext: async (gating) => {
      await new Promise<void>((resolve) => { closeDialog = resolve })
      await gating.attempt(byPassphrase(Passphrase))
    } })
    await bank.hello()
    const asking = bank.ensureVault(VaultScopeGiven)
    await TH.expectRefusal(bank.ensureVault(OtherScopeGiven))
    closeDialog()
    await asking
  })

  it("refuses a null requestCleartext, which is no function and no leaving out", () => {
    const refusal = TH.expectSyncRefusal(() => makeBankWorld().bankOn({ requestCleartext: null as never }), 'bad_option')
    expect(refusal.message).to.match(/^requestCleartext: /)
  })

  it.each([
    ['keyDeriver',      { keyDeriver: 3 }],
    ['strengthChecker', { strengthChecker: 3 }],
    ['logger',          { logger: 3 }],
    ['onLifecycle',     { onLifecycle: 3 }],
  ])("refuses at Bank.make a %s that is none, naming it", (fieldname, overrides) => {
    const refusal = TH.expectSyncRefusal(() => makeBankWorld().bankOn(overrides as never))
    expect(refusal.message.startsWith(`${fieldname}: `)).to.be.true
  })

  it.each([
    ['a label in it',                 "device_one"],
    ['no hyphens',                    "00000000000040008000000000000001"],
    ['a digit short',                 "00000000-0000-4000-8000-00000000001"],
    ['nothing in it',                 ""],
  ])("refuses at Bank.make a device_id with %s", (_what, device_id) => {
    TH.expectSyncRefusal(() => makeBankWorld().bankOn({ device_id }))
  })

  it("refuses at Bank.make a missing device_id", () => {
    TH.expectSyncRefusal(() => makeBankWorld().bankOn({ device_id: undefined as never }))
  })

  it("takes a fraction of a minute to the nearest millisecond, and Infinity as ForeverMillis", () => {
    const bank = makeBankWorld().bankOn({ autolockMinutes: 1 / 7, boxRefreshMinutes: 0.000025 })
    expect([bank.leaseMillis, bank.boxRefreshMillis]).to.deep.equal([8571, 2])
    expect(makeBankWorld().bankOn({ autolockMinutes: Infinity }).leaseMillis).to.eq(ForeverMillis)
  })

  it("leases for DefaultLeaseMillis where the host names no autolockMinutes", () => {
    const bank = makeBankWorld().bankOn({ autolockMinutes: undefined })
    expect(bank.leaseMillis).to.eq(DefaultLeaseMillis)
  })

  it("answers tryEnsureVault's refusal as an Outcome", async () => {
    await TH.expectBad(makeBankWorld().bankOn().tryEnsureVault(VaultScopeGiven))
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

describe("'identity_revoked', the lifecycle and bad news", () => {
  it("vacates the bank on a refused hello, which shows the revocation, its caller hearing it, the default reporting it, and no lease left", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    const onBadNews = vi.fn()
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const fresh = world.bankOn({ onBadNews })
    world.vaultDB._cheat_refuseGets('identity_revoked')
    const refusal = await TH.expectRefusal(fresh.hello(), 'identity_revoked')
    await TH.eventually(() => world.leaseRows().length === 0)
    await TH.eventually(() => reported.mock.calls.length > 0)
    expect(reported).toHaveBeenCalledExactlyOnceWith(refusal)
    expect(onBadNews).not.toHaveBeenCalled()
    await TH.eventually(() => ! fresh.isEnabled)
    expect(fresh.snapshot).to.include({ stage: 'refused', err: refusal })
    await TH.expectRefusal(fresh.hello(), 'disabled')
    vi.unstubAllGlobals()
  })

  it("vacates the bank when any vault's call into the vaultDB is refused so, then passes the refusal up", async () => {
    const { world, bank, vault } = await makeBankWithVault()
    world.vaultDB._cheat_refuseGets('identity_revoked')
    const refusal = await TH.expectRefusal(vault.fetch(), 'identity_revoked')
    expect(vault.isEnabled).to.be.false
    expect(bank.snapshot.vaults).to.deep.equal([])
    await TH.eventually(() => world.leaseRows().length === 0)
    expect(bank.snapshot).to.include({ stage: 'refused', err: refusal })
  })

  it("vacates the bank on a revocation whatever the host's onLifecycle does, which hears it as vacated once the scrub settles", async () => {
    const onLifecycle = vi.fn()
    const { world, bank, vault } = await makeBankWithVault(makeBankWorld(), { onLifecycle })
    onLifecycle.mockClear()
    world.vaultDB._cheat_refuseGets('identity_revoked')
    const refusal = await TH.expectRefusal(vault.fetch(), 'identity_revoked')
    expect(bank.snapshot).to.include({ stage: 'refused', err: refusal })
    expect(onLifecycle).not.toHaveBeenCalled()
    await TH.eventually(() => onLifecycle.mock.calls.length > 0)
    expect(onLifecycle).toHaveBeenCalledExactlyOnceWith({ kind: 'vacated', cause: refusal, unerased: 0, bank })
    expect(world.leaseRows()).to.deep.equal([])
  })

  it("vacates the bank where a revocation refuses a vault's boxes' listing", async () => {
    const onLifecycle = vi.fn()
    const { world, bank, vault } = await makeBankWithVault(makeBankWorld(), { onLifecycle })
    onLifecycle.mockClear()
    const revoked = new VaultError('identity_revoked', 'signed out')
    vi.spyOn(world.vaultDB, 'tryListBoxes').mockResolvedValue({ ok: false, err: revoked, world: null } as never)
    await TH.expectRefusal(vault.boxListing.list(), 'identity_revoked')
    expect(bank.isEnabled).to.be.false
    await TH.eventually(() => onLifecycle.mock.calls.length > 0)
    expect(onLifecycle).toHaveBeenCalledExactlyOnceWith({ kind: 'vacated', cause: revoked, unerased: 0, bank })
  })

  it("refuses as disabled a listing of the vaults answered after a sweep, so a revocation in it neither reaches the host nor vacates", async () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const onLifecycle = vi.fn(DefaultOnLifecycle)
    const world = makeBankWorld()
    await makeBankWithVault(world)
    const bank = world.bankOn({ onLifecycle })
    world.vaultDB._cheat_refuseGets('identity_revoked')
    const answer = TH.holdNextAnswer(world.vaultDB, 'tryListVaults')
    const hello = bank.tryHello()
    await answer.reached
    bank.sweep()
    answer.release()
    await TH.expectBad(hello, 'disabled')
    expect([onLifecycle, reported].map((spied) => spied.mock.calls.length)).to.deep.equal([0, 0])
    expect(bank.snapshot.err).to.include({ refusalkind: 'disabled' })
    await TH.wakeupAtNextTick()
    expect(world.leaseRows()).to.have.lengthOf(1)
    vi.unstubAllGlobals()
  })

  it("vacates once for a burst of revocations, the first its cause and the rest refused as disabled before they vacate", async () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const onLifecycle = vi.fn(DefaultOnLifecycle)
    const { world, bank, vault } = await makeBankWithVault(makeBankWorld(), { onLifecycle })
    const other = await bank.ensureVault(OtherScopeGiven)
    onLifecycle.mockClear()
    world.vaultDB._cheat_refuseGets('identity_revoked')
    const fetched = await Promise.all([vault.tryFetch(), other.tryFetch()])
    expect(fetched.map((outcome) => (outcome.ok ? null : outcome.err.refusalkind))).to.deep.equal(['identity_revoked', 'disabled'])
    await TH.eventually(() => onLifecycle.mock.calls.length > 0)
    expect(onLifecycle).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'vacated', cause: bank.snapshot.err }))
    expect(reported).toHaveBeenCalledOnce()
    expect(world.leaseRows()).to.deep.equal([])
    vi.unstubAllGlobals()
  })

  it("logs a bad news with no onBadNews to hear it, and other news vacates nothing", async () => {
    const world = makeBankWorld()
    const spy = TH.spyLogger()
    const { bank, vault } = await makeBankWithVault(world, { logger: spy.logger })
    const news = new VaultError('damaged_row', 'something stored is damaged')
    await tellByAutolock(world, bank, news)
    expect(spy.calls.map(({ message }) => message)).to.include(news.message)
    expect(vault.isEnabled).to.be.true
  })

  // VaultLogger @example 1
  it("logs nothing to the console with a logger of three no-ops, though a bad news has no onBadNews to hear it", async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(nothing)
    try {
      const silent = { log: nothing, warn: nothing, error: nothing }
      const world = makeBankWorld()
      const { bank } = await makeBankWithVault(world, { logger: silent })
      await tellByAutolock(world, bank, new VaultError('damaged_row', 'something stored is damaged'))
      expect(consoleWarn).not.toHaveBeenCalled()
    } finally {
      consoleWarn.mockRestore()
    }
  })

  // DefaultLogger @example
  it("tells the default logger what it logs when given DefaultLogger, whichever the app gave setDefaultLogger", async () => {
    const spy = TH.spyLogger()
    setDefaultLogger(spy.logger)
    try {
      const world = makeBankWorld()
      const { bank } = await makeBankWithVault(world, { logger: DefaultLogger })
      const news = new VaultError('damaged_row', 'something stored is damaged')
      await tellByAutolock(world, bank, news)
      expect(spy.calls.map(({ message }) => message)).to.include(news.message)
    } finally {
      setDefaultLogger(undefined)
    }
  })

  it("with no strengthChecker, finds every new passphrase weak, its reason sending the app's makers to CUSTOMIZATION.md", async () => {
    const attempts: Outcome<unknown>[] = []
    const bank = makeBankWorld().bankOn({ strengthChecker: undefined, requestCleartext: async (gating) => { attempts.push(await gating.attempt(byPassphrase(Passphrase))) } })
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
    vi.spyOn(world.deviceDB, 'tryForget').mockResolvedValueOnce(TH.bad(new VaultError('storage_unavailable', 'the store is down')))
    const page = world.bankOn({ logger })
    await page.hello()
    const unlocked = await page.vaultAt(VaultScopeGiven)?.ensureUnlocked()
    expect(unlocked?.isUnlocked).to.be.true
    expect(warn).toHaveBeenCalledWith('the store is down', expect.objectContaining({ call: 'Bank.onLifecycle' }), undefined)
  })

  it("hears a vault's bad news the same as its own, a revocation told so vacating nothing, and news past a sweep going to the logger", async () => {
    const onBadNews = vi.fn()
    const spy = TH.spyLogger()
    const world = makeBankWorld()
    const { bank, vault } = await makeBankWithVault(world, { onBadNews, logger: spy.logger })
    const [news, revoked] = [new VaultError('storage_unavailable', 'the device store is down'), new VaultError('identity_revoked', 'the host says no')]
    for (const peekRefusal of [news, revoked]) {
      vault.lock()
      vi.spyOn(world.deviceDB, 'tryPeek').mockResolvedValueOnce({ ok: false, err: peekRefusal })
      await vault.ensureUnlocked()
      expect(onBadNews).toHaveBeenLastCalledWith({ news: peekRefusal, bank })
      expect(vault.isEnabled).to.be.true
    }
    bank.sweep()
    const later = new VaultError('storage_unavailable', 'news for a bank let go')
    await tellByAutolock(world, bank, later)
    expect(onBadNews).toHaveBeenCalledTimes(2)
    expect(spy.calls.map(({ message }) => message)).to.include(later.message)
  })
})

describe("tellBadNewsTo", () => {
  it("tells the handler each news with the bank it reached", async () => {
    const bank = makeBankWorld().bankOn()
    const onBadNews = vi.fn()
    const news = [new VaultError('storage_unavailable', "Down."), new VaultError('absent_box', "Gone.")]
    tellBadNewsTo(onBadNews, bank, news)
    await TH.eventually(() => onBadNews.mock.calls.length === 2)
    expect(onBadNews.mock.calls).to.deep.equal(news.map((told) => [{ news: told, bank }]))
  })

  it("reports a handler that throws to the platform and goes on, the rest of the news told", () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const told: string[] = []
    const bank = makeBankWorld().bankOn()
    tellBadNewsTo(({ news }) => { told.push(news.refusalkind); throw new Error("The handler is broken.") }, bank, [new VaultError('storage_unavailable', "Down."), new VaultError('absent_box', "Gone.")])
    expect(told).to.deep.equal(['storage_unavailable', 'absent_box'])
    expect(reported).toHaveBeenCalledTimes(2)
    vi.unstubAllGlobals()
  })

  it("reports a handler whose promise rejects to the platform, with no unhandled rejection", async () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const bank = makeBankWorld().bankOn()
    tellBadNewsTo(() => Promise.reject(new Error("Rejected.")), bank, [new VaultError('storage_unavailable', "Down.")])
    await TH.eventually(() => reported.mock.calls.length === 1)
    expect(reported.mock.calls[0]?.[0]).to.have.property('message', "Rejected.")
    vi.unstubAllGlobals()
  })

  it("refuses a handler that is no function, no bank, or news that is no VaultError, telling nobody", () => {
    const bank = makeBankWorld().bankOn()
    const onBadNews = vi.fn()
    const news = new VaultError('storage_unavailable', "Down.")
    TH.expectSyncRefusal(() => { tellBadNewsTo('tell me' as never, bank, [news]) }, 'bad_option')
    TH.expectSyncRefusal(() => { tellBadNewsTo(onBadNews, {} as never, [news]) }, 'bad_option')
    TH.expectSyncRefusal(() => { tellBadNewsTo(onBadNews, bank, [new Error("Down.") as never]) }, 'bad_option')
    expect(onBadNews).not.toHaveBeenCalled()
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

/** A bank with no `requestCleartext`, past its hello, with the vault of `Dna` locked to it and `ensureUnlocked` waiting on its gating. */
const bankWaitingOnUnlock = async () => {
  const { world } = await makeBankWithVault()
  const bank = world.bankOnAnotherDevice({ requestCleartext: undefined })
  await bank.hello()
  const vault = bank.vaultAt(VaultScopeGiven)!
  const unlocking = vault.ensureUnlocked()
  const gating = await vi.waitFor(() => bank.snapshot.openGating ?? fail("no gating yet"), { interval: 1 })
  return { world, bank, vault, unlocking, gating }
}

const fail = (message: string): never => { throw new Error(message) }

describe("the snapshot's open gating", () => {
  it("answers null with no gating open", async () => {
    const { bank } = await makeBankWithVault()
    expect(bank.snapshot.openGating).to.be.null
  })

  it("answers the live gating while it waits, in a frozen snapshot", async () => {
    const { bank, gating, unlocking } = await bankWaitingOnUnlock()
    expect(bank.snapshot.openGating).to.equal(bank.vaultListing.openGating)
    expect(gating.isOpen).to.be.true
    expect(Object.isFrozen(bank.snapshot)).to.be.true
    gating.decline()
    await TH.expectRefusal(unlocking, 'declined')
  })

  it("serializes an open gating as its scope and kind, holding no secret", async () => {
    const { bank, gating, unlocking } = await bankWaitingOnUnlock()
    const text = JSON.stringify(bank.snapshot)
    const { openGating } = JSON.parse(text) as { openGating: unknown }
    expect(openGating).to.deep.equal({ ...VaultScopeGiven, ...BankScopeGiven, gatingkind: 'unlock_vault' })
    gating.decline()
    await TH.expectRefusal(unlocking, 'declined')
  })

  it("tells a subscriber when a gating opens and again when it settles", async () => {
    const { bank, gating, unlocking } = await bankWaitingOnUnlock()
    const seen: unknown[] = []
    bank.subscribe(() => { seen.push(bank.snapshot.openGating) })
    gating.decline()
    await TH.expectRefusal(unlocking, 'declined')
    expect(seen).to.deep.equal([null])
    const bornOver = bank.vaultAt(VaultScopeGiven)!
    const again = bornOver.ensureUnlocked()
    await vi.waitFor(() => bank.snapshot.openGating ?? fail("no gating yet"), { interval: 1 })
    expect(seen).to.have.lengthOf(2)
    bank.snapshot.openGating?.decline()
    await TH.expectRefusal(again, 'declined')
    expect(seen).to.have.lengthOf(3)
  })

  it("keeps the snapshot's reference while the gating stays the same", async () => {
    const { bank, gating, unlocking } = await bankWaitingOnUnlock()
    const before = bank.snapshot
    expect(bank.snapshot).to.equal(before)
    expect(bank.snapshot.openGating).to.equal(gating)
    gating.decline()
    await TH.expectRefusal(unlocking, 'declined')
    expect(bank.snapshot).to.not.equal(before)
  })

  it("drops a gating settled by an attempt", async () => {
    const { bank, gating, unlocking } = await bankWaitingOnUnlock()
    await TH.expectGood(gating.attempt(byPassphrase(Passphrase)))
    await unlocking
    expect(bank.snapshot.openGating).to.be.null
  })

  const Enders: readonly (readonly [string, (made: { bank: Bank, vault: Vault }) => void])[] = [
    ["a lock of its vault",   ({ vault }) => { vault.lock() }],
    ["a lock of the bank",    ({ bank })  => { bank.lock() }],
    ["a sweep of its vault",  ({ vault }) => { vault.sweep() }],
    ["a vacate of its vault", ({ vault }) => { vault.vacate() }],
    ["a sweep of the bank",   ({ bank })  => { bank.sweep() }],
    ["a vacate of the bank",  ({ bank })  => { void bank.vacate() }],
  ]

  it.each(Enders)("drops the gating at %s, before the call returns", async (_label, end) => {
    const { bank, vault, gating, unlocking } = await bankWaitingOnUnlock()
    end({ bank, vault })
    expect(bank.snapshot.openGating).to.be.null
    await TH.expectRefusal(unlocking)
    expect(gating.isOpen).to.be.false
  })

  it("drops a birth's gating at a sweep, whose listeners meet the bank and its listing already disabled", async () => {
    const world = makeBankWorld()
    const bank = world.bankOn({ requestCleartext: undefined })
    await bank.hello()
    const asking = bank.ensureVault(VaultScopeGiven)
    const heard: { isBankEnabled: boolean, isListingRefusing: boolean }[] = []
    bank.subscribe(() => {
      if (bank.snapshot.openGating === null) { heard.push({ isBankEnabled: bank.isEnabled, isListingRefusing: isRefusing(() => bank.vaultListing.demandEnabled()) }) }
    })
    bank.sweep()
    await TH.expectRefusal(asking)
    expect(heard[0]).to.deep.equal({ isBankEnabled: false, isListingRefusing: true })
  })

  it("keeps an attempt that crosses a sweep in the snapshot until it settles, past the disable", async () => {
    const { world } = await makeBankWithVault()
    const held = heldDeriver()
    const bank = world.bankOnAnotherDevice({ requestCleartext: undefined, keyDeriver: held.deriver })
    await bank.hello()
    const unlocking = (bank.vaultAt(VaultScopeGiven)!).ensureUnlocked()
    const gating = await vi.waitFor(() => bank.snapshot.openGating ?? fail("no gating yet"), { interval: 1 })
    const attempting = gating.attempt(byPassphrase(Passphrase))
    await vi.waitFor(() => held.isAsked() || fail("not derived yet"), { interval: 1 })
    bank.sweep()
    expect(bank.snapshot.openGating).to.equal(gating)
    held.answer()
    await TH.expectRefusal(unlocking)
    await attempting
    expect(bank.snapshot.openGating).to.be.null
  })

  it("waits with no host dialog until an attempt settles it", async () => {
    const { bank, gating, unlocking } = await bankWaitingOnUnlock()
    await TH.wakeupAtNextTick()
    expect(gating.isOpen).to.be.true
    await TH.expectGood(gating.attempt(byPassphrase(Passphrase)))
    const vault = await unlocking
    expect(vault.isUnlocked).to.be.true
    expect(bank.snapshot.openGating).to.be.null
  })

  it("waits with no host dialog until a decline settles it", async () => {
    const { gating, unlocking } = await bankWaitingOnUnlock()
    gating.decline()
    await TH.expectRefusal(unlocking, 'declined')
    await TH.expectBad(gating.whenSettled, 'declined')
  })
})

const isRefusing = (call: () => unknown): boolean => {
  try {
    call()
    return false
  } catch {
    return true
  }
}

/** A key deriver that holds each derivation until the test calls `answer`. */
const heldDeriver = () => {
  let isAsked = false
  let release = nothing
  const released = new Promise<void>((resolve) => { release = resolve })
  const deriver = { ...testDeriver, deriveKeyBytes: async (passphrase: string, saltBytes: Uint8Array) => {
    isAsked = true
    await released
    return testDeriver.deriveKeyBytes(passphrase, saltBytes)
  } }
  return { deriver, isAsked: () => isAsked, answer: () => { release() } }
}
