/** The bank of `src/models/` end to end, over a real vaultDB and deviceDB: hello, ensureVault, bad news and the snapshot. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { DefaultLogger, setDefaultLogger } from '../../src/helpers/logger'
import { ForeverMillis, isGuarded } from '../../src/helpers/consts'
import { type Bank, DefaultOnLifecycle, guardOnLifecycle, guardRequestCleartext, tellBadNewsTo } from '../../src/models/bank'
import { DefaultLeaseMillis, type Vault } from '../../src/models/vault'
import type { BadNews, BankEvent, BankFriend } from '../../src/shapes/shapes-vaultish'
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
async function tellByAutolock(world: ReturnType<typeof makeBankWorld>, bank: Bank, news: VaultError): Promise<void> {
  vi.spyOn(world.deviceDB, 'tryListLeases').mockResolvedValueOnce({ ok: false, err: news })
  await bank.autolock()
}


describe("a page that is not a secure context", () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it("refuses Bank.make, before it touches storage", () => {
    const world = makeBankWorld()
    const listVaults = vi.spyOn(world.vaultDB, 'tryListVaults')
    vi.stubGlobal('isSecureContext', false)
    const err = TH.expectSyncRefusal(() => world.bankOn(), 'insecure_context')
    expect(err.message).to.match(/https/)
    expect(listVaults).not.toHaveBeenCalled()
  })

  it("makes a bank in a secure context, or where the platform has no isSecureContext", () => {
    const world = makeBankWorld()
    vi.stubGlobal('isSecureContext', true)
    expect(world.bankOn().getSnapshot().stage).to.eq('made')
    vi.stubGlobal('isSecureContext', undefined)
    expect(world.bankOn().getSnapshot().stage).to.eq('made')
  })
})

describe("bank.hello", () => {
  it("readies a bank over empty storage", async () => {
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

  it("reports each hello's outcome to onLifecycle, naming the vault for a vault's hello", async () => {
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

  it("reports nothing to the host for a hello interrupted by a sweep", async () => {
    const onLifecycle = vi.fn()
    const world = makeBankWorld()
    const bank = world.bankOn({ onLifecycle })
    const answer = TH.pendingNextAnswer(world.vaultDB, 'tryListVaults')
    const hello = bank.tryHello()
    await answer.reached
    bank.sweep()
    answer.release()
    await TH.expectBad(hello, 'disabled')
    expect(onLifecycle).not.toHaveBeenCalled()
  })

  it("lists every stored vault as locked, without asking", async () => {
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

  it("on a second call keeps a listed vault of the same life and replaces one of a new life", async () => {
    const world = makeBankWorld()
    const { bank: elsewhere, vault } = await makeBankWithVault(world)
    const bank = world.bankOnAnotherDevice()
    await bank.hello()
    const listed = bank.vaultAt(VaultScopeGiven)
    await bank.hello()
    expect(bank.vaultAt(VaultScopeGiven)).to.equal(listed)
    await vault.delVaultPrompt()
    await elsewhere.ensureVault(VaultScopeGiven)
    await bank.hello()
    const reborn = bank.vaultAt(VaultScopeGiven)
    expect(reborn).not.to.equal(listed)
    expect(reborn?.isPresent).to.be.true
    expect(listed?.isEnabled).to.be.false
  })

  it("lists a deleted vault's tombstone at its scope, the vault of the life deleted vacated", async () => {
    const world = makeBankWorld()
    const { vault } = await makeBankWithVault(world)
    const bank = world.bankOnAnotherDevice()
    await bank.hello()
    const listed = bank.vaultAt(VaultScopeGiven)
    await vault.delVaultPrompt()
    await bank.hello()
    const gone = bank.vaultAt(VaultScopeGiven)
    expect(gone).to.not.equal(listed)
    expect(gone?.isPresent).to.be.false
    expect(listed?.isEnabled).to.be.false
    expect(bank.snapshot.vaults).to.deep.equal([])
    const reborn = await bank.ensureVault(VaultScopeGiven)
    expect(reborn).not.to.equal(gone)
    expect(reborn.isUnlocked).to.be.true
    expect(labelsOf(bank.snapshot)).to.deep.equal([Dna.vaultlabel])
  })

  it("refuses while storage is unavailable, and leaves the bank not ready until a hello succeeds", async () => {
    const world = makeBankWorld()
    const spy = TH.spyLogger()
    const bank = world.bankOn({ logger: spy.logger })
    world.vaultDB._cheat_refuseGets('storage_unavailable')
    const refusal = await TH.expectRefusal(bank.hello(), 'storage_unavailable')
    expect(refusal.refusalkind).to.eq('storage_unavailable')
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['warn'])
    expect(bank.snapshot).to.include({ stage: 'made', err: null })
    await TH.expectRefusal(bank.ensureVault(VaultScopeGiven), 'bad_option')
    TH.expectSyncRefusal(() => bank.vaultAt(VaultScopeGiven), 'bad_option')
    world.vaultDB._cheat_refuseGets(null)
    await bank.hello()
    expect(bank.snapshot).to.include({ stage: 'ready', err: null })
  })

  it("refuses when the strength checker fails to load, with its error as the cause", async () => {
    const world = makeBankWorld()
    const listVaults = vi.spyOn(world.vaultDB, 'tryListVaults')
    const thrown = new Error('no word list here')
    const spy = TH.spyLogger()
    const bank = world.bankOn({ logger: spy.logger, strengthChecker: Object.assign((() => ({ strong: true })) as typeof anyStrengthChecker, { load: () => Promise.reject(thrown) }) })
    const err = await TH.expectRefusal(bank.hello())
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['warn'])
    expect(err.cause).to.eq(thrown)
    expect(err.message).to.match(/strengthChecker's load\(\) failed/)
    expect(bank.snapshot).to.include({ stage: 'made', err: null })
    expect(listVaults).not.toHaveBeenCalled()
  })

  it("refuses when the key deriver fails to load, with its error as the cause", async () => {
    const world = makeBankWorld()
    const listVaults = vi.spyOn(world.vaultDB, 'tryListVaults')
    const thrown = new Error('no wasm here')
    const spy = TH.spyLogger()
    const bank = world.bankOn({ logger: spy.logger, keyDeriver: Object.assign(Object.create(testDeriver) as typeof testDeriver, { load: () => Promise.reject(thrown) }) })
    const err = await TH.expectRefusal(bank.hello())
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['warn'])
    expect(err.cause).to.eq(thrown)
    expect(err.message).to.match(/keyDeriver's load\(\) failed/)
    expect(bank.snapshot).to.include({ stage: 'made', err: null })
    expect(listVaults).not.toHaveBeenCalled()
  })

  it("rethrows a VaultError from the key deriver's load unchanged", async () => {
    const world = makeBankWorld()
    const refused = new VaultError('storage_unavailable', 'no wasm here')
    const spy = TH.spyLogger()
    const bank = world.bankOn({ logger: spy.logger, keyDeriver: Object.assign(Object.create(testDeriver) as typeof testDeriver, { load: () => Promise.reject(refused) }) })
    const err = await TH.expectRefusal(bank.hello(), 'storage_unavailable')
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['warn'])
    expect(err).to.eq(refused)
    expect(bank.snapshot).to.include({ stage: 'made', err: null })
  })

  it("rethrows a VaultError from the strength checker's load unchanged", async () => {
    const world = makeBankWorld()
    const refused = new VaultError('storage_unavailable', 'no word list here')
    const spy = TH.spyLogger()
    const bank = world.bankOn({ logger: spy.logger, strengthChecker: Object.assign((() => ({ strong: true })) as typeof anyStrengthChecker, { load: () => Promise.reject(refused) }) })
    const err = await TH.expectRefusal(bank.hello(), 'storage_unavailable')
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['warn'])
    expect(err).to.eq(refused)
    expect(bank.snapshot).to.include({ stage: 'made', err: null })
  })

  it("reports a damaged vault row as bad news, and readies the bank without it", async () => {
    const world = makeBankWorld()
    world.vaultDB._cheat_vaultRowsOf(BankScopeGiven).set('broken', { am: 'a', nonsense: true })
    const onBadNews = vi.fn()
    const bank = world.bankOn({ onBadNews })
    await bank.hello()
    expect(bank.snapshot.stage).to.eq('ready')
    expect(onBadNews.mock.calls.map(([heard]) => (heard as BadNews).news.refusalkind)).to.deep.equal(['damaged_row'])
    expect((onBadNews.mock.calls[0]?.[0] as BadNews).news.message).to.include('broken')
  })

  it("reports a vault whose stored passphrase salt will not decode as a damaged row", async () => {
    const { world } = await makeBankWithVault()
    const rows = world.vaultDB._cheat_vaultRowsOf(BankScopeGiven)
    const row = rows.get(Dna.vaultlabel) as { gate: { passphrase_wayin: object } }
    rows.set(Dna.vaultlabel, { ...row, gate: { ...row.gate, passphrase_wayin: { ...row.gate.passphrase_wayin, salt_b64: `${'A'.repeat(21)}B` } } })
    const onBadNews = vi.fn()
    const bank = world.bankOn({ onBadNews })
    await bank.hello()
    expect(onBadNews.mock.calls.map(([heard]) => (heard as BadNews).news.refusalkind)).to.deep.equal(['damaged_row'])
    expect((onBadNews.mock.calls[0]?.[0] as BadNews).news.message).to.include(Dna.vaultlabel)
  })

  it("reports a damaged vault row even when another row's delivery refuses the hello", async () => {
    const onBadNews = vi.fn()
    const spy = TH.spyLogger()
    const { world, bank } = await makeBankWithVault(makeBankWorld(), { onBadNews, logger: spy.logger })
    const rows = world.vaultDB._cheat_vaultRowsOf(BankScopeGiven)
    rows.set(Dna.vaultlabel, { ...(rows.get(Dna.vaultlabel) as object), revision_tok: 'rev-other' })
    rows.set('broken', { am: 'a', nonsense: true })
    await TH.expectRefusal(bank.hello())
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['warn'])
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

  it("lists a vault built on another device, through the watch it starts", async () => {
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

describe("the host's functions inside a bank", () => {
  it("are each wrapped, with none of the host's own on a property", () => {
    const requestCleartext = vi.fn()
    const onLifecycle = vi.fn()
    const bank = makeBankWorld().bankOn({ requestCleartext, onLifecycle })
    for (const guarded of [bank.keyDeriver, bank.strengthChecker]) { expect(isGuarded(guarded)).to.be.true }
    expect(Object.values(bank)).to.not.include.members([requestCleartext, onLifecycle, testDeriver, anyStrengthChecker])
  })

  it("guardRequestCleartext returns true when the dialog closes and false when it throws", async () => {
    const gating = {} as AnyGating
    const dialog = vi.fn()
    expect(await guardRequestCleartext(dialog)(gating)).to.be.true
    expect(dialog).toHaveBeenCalledWith(gating)
    expect(await guardRequestCleartext(() => { throw new Error(Passphrase) })(gating)).to.be.false
  })

  it("guardOnLifecycle reports a handler's throw to the platform", async () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const cause = new VaultError('identity_revoked', 'signed out')
    const thrown = new Error('lifecycle handler broke')
    await guardOnLifecycle(() => { throw thrown })({ kind: 'vacated', cause, unrevoked: 0, bank: {} as Bank })
    expect(reported).toHaveBeenCalledWith(thrown)
    vi.unstubAllGlobals()
  })

  it("refuses a requestCleartext or an onLifecycle that is not a function", () => {
    TH.expectSyncRefusal(() => guardRequestCleartext('ask' as never), 'bad_option')
    TH.expectSyncRefusal(() => guardOnLifecycle('call me' as never), 'bad_option')
  })
})

describe("DefaultOnLifecycle", () => {
  const Refusal = new VaultError('storage_unavailable', 'no storage', { cause: new Error(Passphrase) })
  const Revoked = new VaultError('identity_revoked', 'signed out')
  const LifecycleCases = [
    // a cached lease that outlived its forget:
    [{ kind: 'lease_revoke_failed', refusal: Refusal, where: 'lock' },      'error', true,  'reports a lock\'s refused forget at error and to the platform, and vacates the vault'],
    [{ kind: 'lease_revoke_failed', refusal: Refusal, where: 'vacate' },    'error', true,  'reports a vacate\'s refused forget at error and to the platform'],
    [{ kind: 'lease_revoke_failed', refusal: Refusal, where: 'tombstone' }, 'warn',  false, 'warns of a tombstone\'s refused forget, vacating nothing'],
    [{ kind: 'lease_revoke_failed', refusal: Refusal, where: 'undeleted' },  'warn',  false, 'warns of an outdated row\'s refused forget, vacating nothing'],
    // a vacate:
    [{ kind: 'vacated', cause: Revoked, unrevoked: 0 },                 'error', false, 'reports a vacate for a revoked identity at error and to the platform'],
    [{ kind: 'vacated', cause: bankDisabled(), unrevoked: 1 },          null,    false, 'says nothing of a sign-out'],
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
    DefaultOnLifecycle({ kind: 'lease_revoke_failed', refusal: Refusal, vault: null, where: 'vacate', bank })
    expect(spy.calls).to.deep.equal([{ level: 'error', message: Refusal.message, story: { oplabel: 'Bank.onLifecycle', refusalkind: 'storage_unavailable' }, err: undefined }])
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
  it("builds an unlocked vault by asking, then returns the same vault without asking again", async () => {
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

  it("refuses a null requestCleartext", () => {
    const refusal = TH.expectSyncRefusal(() => makeBankWorld().bankOn({ requestCleartext: null as never }), 'bad_option')
    expect(refusal.message).to.match(/^requestCleartext: /)
  })

  it.each([
    ['keyDeriver',      { keyDeriver: 3 }],
    ['strengthChecker', { strengthChecker: 3 }],
    ['logger',          { logger: 3 }],
    ['onLifecycle',     { onLifecycle: 3 }],
  ])("refuses at Bank.make a %s of the wrong type, naming it", (fieldname, overrides) => {
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

  it("tryEnsureVault returns a refusal as an Outcome", async () => {
    await TH.expectBad(makeBankWorld().bankOn().tryEnsureVault(VaultScopeGiven))
  })

  it("unlocks a fresh bank's vault with the device's cached lease, without asking", async () => {
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
  it("vacates the bank when hello is refused for a revoked identity", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    const onBadNews = vi.fn()
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const spy = TH.spyLogger()
    const fresh = world.bankOn({ onBadNews, logger: spy.logger })
    world.vaultDB._cheat_refuseGets('identity_revoked')
    const refusal = await TH.expectRefusal(fresh.hello(), 'identity_revoked')
    await TH.eventually(() => world.leaseRows().length === 0)
    await TH.eventually(() => reported.mock.calls.length > 0)
    expect(reported).toHaveBeenCalledExactlyOnceWith(refusal)
    expect(spy.calls.map((call) => call.level)).to.have.members(['warn', 'error'])
    expect(onBadNews).not.toHaveBeenCalled()
    await TH.eventually(() => ! fresh.isEnabled)
    expect(fresh.snapshot).to.include({ stage: 'disabled', err: refusal })
    await TH.expectRefusal(fresh.hello(), 'disabled')
    vi.unstubAllGlobals()
  })

  it("vacates the bank when any vault's call is refused for a revoked identity", async () => {
    const spy = TH.spyLogger()
    const { world, bank, vault } = await makeBankWithVault(makeBankWorld(), { logger: spy.logger })
    world.vaultDB._cheat_refuseGets('identity_revoked')
    const refusal = await TH.expectRefusal(vault.get({ maxMillisSinceRefresh: 0 }), 'identity_revoked')
    expect(vault.isEnabled).to.be.false
    expect(bank.snapshot.vaults).to.deep.equal([])
    await TH.eventually(() => world.leaseRows().length === 0)
    await TH.eventually(() => spy.calls.length > 0)
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['error'])
    expect(bank.snapshot).to.include({ stage: 'disabled', err: refusal })
  })

  it("vacates the bank on a revocation, and reports it to onLifecycle as vacated once the vacate settles", async () => {
    const onLifecycle = vi.fn()
    const { world, bank, vault } = await makeBankWithVault(makeBankWorld(), { onLifecycle })
    onLifecycle.mockClear()
    world.vaultDB._cheat_refuseGets('identity_revoked')
    const refusal = await TH.expectRefusal(vault.get({ maxMillisSinceRefresh: 0 }), 'identity_revoked')
    expect(bank.snapshot).to.include({ stage: 'disabled', err: refusal })
    expect(onLifecycle).not.toHaveBeenCalled()
    await TH.eventually(() => onLifecycle.mock.calls.length > 0)
    expect(onLifecycle).toHaveBeenCalledExactlyOnceWith({ kind: 'vacated', cause: refusal, unrevoked: 0, bank })
    expect(world.leaseRows()).to.deep.equal([])
  })

  it("vacates the bank when a vault's box listing is refused for a revoked identity", async () => {
    const onLifecycle = vi.fn()
    const { world, bank, vault } = await makeBankWithVault(makeBankWorld(), { onLifecycle })
    onLifecycle.mockClear()
    const revoked = new VaultError('identity_revoked', 'signed out')
    vi.spyOn(world.vaultDB, 'tryListBoxes').mockResolvedValue({ ok: false, err: revoked, world: null } as never)
    await TH.expectRefusal(vault.boxListing.list(), 'identity_revoked')
    expect(bank.isEnabled).to.be.false
    await TH.eventually(() => onLifecycle.mock.calls.length > 0)
    expect(onLifecycle).toHaveBeenCalledExactlyOnceWith({ kind: 'vacated', cause: revoked, unrevoked: 0, bank })
  })

  it("ignores a revocation that arrives after a sweep", async () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const onLifecycle = vi.fn(DefaultOnLifecycle)
    const world = makeBankWorld()
    await makeBankWithVault(world)
    const bank = world.bankOn({ onLifecycle })
    world.vaultDB._cheat_refuseGets('identity_revoked')
    const answer = TH.pendingNextAnswer(world.vaultDB, 'tryListVaults')
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

  it("vacates once for a burst of revocations", async () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const onLifecycle = vi.fn(DefaultOnLifecycle)
    const spy = TH.spyLogger()
    const { world, bank, vault } = await makeBankWithVault(makeBankWorld(), { onLifecycle, logger: spy.logger })
    const other = await bank.ensureVault(OtherScopeGiven)
    onLifecycle.mockClear()
    world.vaultDB._cheat_refuseGets('identity_revoked')
    const fetched = await Promise.all([vault.tryGet({ maxMillisSinceRefresh: 0 }), other.tryGet({ maxMillisSinceRefresh: 0 })])
    expect(fetched.map((outcome) => (outcome.ok ? null : outcome.err.refusalkind))).to.deep.equal(['identity_revoked', 'disabled'])
    await TH.eventually(() => onLifecycle.mock.calls.length > 0)
    expect(onLifecycle).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'vacated', cause: bank.snapshot.err }))
    expect(reported).toHaveBeenCalledOnce()
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['error'])
    expect(world.leaseRows()).to.deep.equal([])
    vi.unstubAllGlobals()
  })

  it("logs bad news when there is no onBadNews", async () => {
    const world = makeBankWorld()
    const spy = TH.spyLogger()
    const { bank, vault } = await makeBankWithVault(world, { logger: spy.logger })
    const news = new VaultError('damaged_row', 'something stored is damaged')
    await tellByAutolock(world, bank, news)
    expect(spy.calls.map(({ message }) => message)).to.include(news.message)
    expect(vault.isEnabled).to.be.true
  })

  // VaultLogger @example 1
  it("logs nothing to the console through a no-op logger", async () => {
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
  it("logs through the logger the app gave setDefaultLogger when given DefaultLogger", async () => {
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

  it("with no strengthChecker, finds every new passphrase weak", async () => {
    const attempts: Outcome<unknown>[] = []
    const bank = makeBankWorld().bankOn({ strengthChecker: undefined, requestCleartext: async (gating) => { attempts.push(await gating.attempt(byPassphrase(Passphrase))) } })
    await bank.hello()
    await TH.expectRefusal(bank.ensureVault(VaultScopeGiven), 'dismissed')
    const [attempted] = attempts
    expect(attempted?.err).to.include({ refusalkind: 'weak_passphrase' })
    expect(attempted?.err?.message).to.include('notes/configuration.md')
  })

  it("carries on when the host's logger throws", async () => {
    const world = makeBankWorld()
    const warn = vi.fn(() => { throw new Error('the logger broke') })
    const logger = { log: warn, warn, error: warn }
    await makeBankWithVault(world, { logger })
    expect(warn.mock.calls).to.have.length(1)
    const [cached] = world.leaseRows() as [{ gate_epoch: number }]
    vi.spyOn(world.deviceDB, 'peek').mockResolvedValueOnce({ ...cached, gate_epoch: cached.gate_epoch + 1 } as never)
    vi.spyOn(world.deviceDB, 'forget').mockRejectedValueOnce(new VaultError('storage_unavailable', 'the datastore is down'))
    const page = world.bankOn({ logger })
    await page.hello()
    const unlocked = await page.vaultAt(VaultScopeGiven)?.ensureUnlocked()
    expect(unlocked?.isUnlocked).to.be.true
    expect(warn).toHaveBeenCalledWith('the datastore is down', expect.objectContaining({ oplabel: 'Bank.onLifecycle' }), undefined)
  })

  it("reports a vault's bad news to onBadNews the same as its own", async () => {
    const onBadNews = vi.fn()
    const spy = TH.spyLogger()
    const world = makeBankWorld()
    const { bank, vault } = await makeBankWithVault(world, { onBadNews, logger: spy.logger })
    const [news, revoked] = [new VaultError('storage_unavailable', 'the device database is down'), new VaultError('identity_revoked', 'the host says no')]
    for (const peekRefusal of [news, revoked]) {
      vault.lock()
      vi.spyOn(world.deviceDB, 'peek').mockRejectedValueOnce(peekRefusal)
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

describe("the friend a bank's listings tell bad news through", () => {
  it("tells a refusal as it is and anything else thrown as an unexpected error, and drops the news of a thing disabled", async () => {
    const onBadNews = vi.fn()
    const bank = makeBankWorld().bankOn({ onBadNews })
    // The listing's friend is protected: the test reaches it as the listing's own code does.
    const { bankFriend } = bank.vaultListing as unknown as { bankFriend: BankFriend }
    bankFriend.tellBadNews([new VaultError('storage_unavailable', "Down."), new Error("Thrown."), new VaultError('disabled', "Gone.")])
    await TH.eventually(() => onBadNews.mock.calls.length === 2)
    expect(onBadNews.mock.calls.map(([heard]) => (heard as BadNews).news.refusalkind)).to.deep.equal(['storage_unavailable', 'unexpected_error'])
  })
})

describe("tellBadNewsTo", () => {
  it("calls the handler with each news and its bank", async () => {
    const bank = makeBankWorld().bankOn()
    const onBadNews = vi.fn()
    const news = [new VaultError('storage_unavailable', "Down."), new VaultError('absent_box', "Gone.")]
    tellBadNewsTo(onBadNews, bank, news)
    await TH.eventually(() => onBadNews.mock.calls.length === 2)
    expect(onBadNews.mock.calls).to.deep.equal(news.map((told) => [{ news: told, bank }]))
  })

  it("reports a handler's throw to the platform and still delivers the rest of the news", () => {
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

  it("refuses a handler that is not a function, a missing bank, or news that is not a VaultError", () => {
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
  it("notifies no unsubscribed listener, and reports a listener's throw to the platform", async () => {
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
async function bankWaitingOnUnlock() {
  const { world } = await makeBankWithVault()
  const bank = world.bankOnAnotherDevice({ requestCleartext: undefined })
  await bank.hello()
  const vault = bank.vaultAt(VaultScopeGiven)!
  const unlocking = vault.ensureUnlocked()
  const gating = await vi.waitFor(() => bank.snapshot.openGating ?? fail("no gating yet"), { interval: 1 })
  return { world, bank, vault, unlocking, gating }
}

function fail(message: string): never { throw new Error(message) }

describe("the snapshot's open gating", () => {
  it("is null with no gating open", async () => {
    const { bank } = await makeBankWithVault()
    expect(bank.snapshot.openGating).to.be.null
  })

  it("is the open gating while it waits, in a frozen snapshot", async () => {
    const { bank, gating, unlocking } = await bankWaitingOnUnlock()
    expect(bank.snapshot.openGating).to.equal(bank.vaultListing.openGating)
    expect(gating.isOpen).to.be.true
    expect(Object.isFrozen(bank.snapshot)).to.be.true
    gating.dismiss()
    await TH.expectRefusal(unlocking, 'dismissed')
  })

  it("serializes an open gating as its scope and kind, having no secret", async () => {
    const { bank, gating, unlocking } = await bankWaitingOnUnlock()
    const text = JSON.stringify(bank.snapshot)
    const { openGating } = JSON.parse(text) as { openGating: unknown }
    expect(openGating).to.deep.equal({ ...VaultScopeGiven, ...BankScopeGiven, gatingkind: 'unlock_vault', gatingTok: gating.gatingTok })
    gating.dismiss()
    await TH.expectRefusal(unlocking, 'dismissed')
  })

  it("notifies a subscriber when a gating opens and again when it concludes", async () => {
    const { bank, gating, unlocking } = await bankWaitingOnUnlock()
    const seen: unknown[] = []
    bank.subscribe(() => { seen.push(bank.snapshot.openGating) })
    gating.dismiss()
    await TH.expectRefusal(unlocking, 'dismissed')
    expect(seen).to.deep.equal([null])
    const bornOver = bank.vaultAt(VaultScopeGiven)!
    const again = bornOver.ensureUnlocked()
    await vi.waitFor(() => bank.snapshot.openGating ?? fail("no gating yet"), { interval: 1 })
    expect(seen).to.have.lengthOf(2)
    bank.snapshot.openGating?.dismiss()
    await TH.expectRefusal(again, 'dismissed')
    expect(seen).to.have.lengthOf(3)
  })

  it("keeps the snapshot's reference while the gating stays the same", async () => {
    const { bank, gating, unlocking } = await bankWaitingOnUnlock()
    const before = bank.snapshot
    expect(bank.snapshot).to.equal(before)
    expect(bank.snapshot.openGating).to.equal(gating)
    gating.dismiss()
    await TH.expectRefusal(unlocking, 'dismissed')
    expect(bank.snapshot).to.not.equal(before)
  })

  it("drops a gating concluded by an attempt", async () => {
    const { bank, gating, unlocking } = await bankWaitingOnUnlock()
    await TH.expectGood(gating.attempt(byPassphrase(Passphrase)))
    await unlocking
    expect(bank.snapshot.openGating).to.be.null
  })

  const Enders: readonly (readonly [string, (made: { bank: Bank, vault: Vault }) => void])[] = [
    ["a sweep of its vault",  ({ vault }) => { vault.sweep() }],
    ["a vacate of its vault", ({ vault }) => { vault.vacate() }],
    ["a sweep of the bank",   ({ bank })  => { bank.sweep() }],
    ["a vacate of the bank",  ({ bank })  => { void bank.vacate() }],
  ]

  it.each([
    ["a lock of its vault", ({ vault }: { bank: Bank, vault: Vault }) => { vault.lock() }],
    ["a lock of the bank",  ({ bank }: { bank: Bank, vault: Vault })  => { bank.lock() }],
  ] as const)("keeps the gating through %s", async (_label, lockIt) => {
    const { bank, vault, gating, unlocking } = await bankWaitingOnUnlock()
    lockIt({ bank, vault })
    expect(bank.snapshot.openGating).to.equal(gating)
    gating.dismiss()
    await TH.expectRefusal(unlocking, 'dismissed')
  })

  it.each(Enders)("drops the gating at %s, before the call returns", async (_label, end) => {
    const { bank, vault, gating, unlocking } = await bankWaitingOnUnlock()
    end({ bank, vault })
    expect(bank.snapshot.openGating).to.be.null
    await TH.expectRefusal(unlocking)
    expect(gating.isOpen).to.be.false
  })

  it("drops a birth's gating at a sweep, after disabling the bank", async () => {
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

  it("keeps a gating whose attempt a sweep interrupts in the snapshot until the attempt concludes", async () => {
    const { world } = await makeBankWithVault()
    const pending = pendingDeriver()
    const bank = world.bankOnAnotherDevice({ requestCleartext: undefined, keyDeriver: pending.deriver })
    await bank.hello()
    const unlocking = (bank.vaultAt(VaultScopeGiven)!).ensureUnlocked()
    const gating = await vi.waitFor(() => bank.snapshot.openGating ?? fail("no gating yet"), { interval: 1 })
    const attempting = gating.attempt(byPassphrase(Passphrase))
    await vi.waitFor(() => pending.isAsked() || fail("not derived yet"), { interval: 1 })
    bank.sweep()
    expect(bank.snapshot.openGating).to.equal(gating)
    pending.answer()
    await TH.expectRefusal(unlocking)
    await attempting
    expect(bank.snapshot.openGating).to.be.null
  })

  it("waits with no host dialog until an attempt concludes it", async () => {
    const { bank, gating, unlocking } = await bankWaitingOnUnlock()
    await TH.wakeupAtNextTick()
    expect(gating.isOpen).to.be.true
    await TH.expectGood(gating.attempt(byPassphrase(Passphrase)))
    const vault = await unlocking
    expect(vault.isUnlocked).to.be.true
    expect(bank.snapshot.openGating).to.be.null
  })

  it("waits with no host dialog until a dismiss concludes it", async () => {
    const { gating, unlocking } = await bankWaitingOnUnlock()
    gating.dismiss()
    await TH.expectRefusal(unlocking, 'dismissed')
    await TH.expectBad(gating.whenConcluded, 'dismissed')
  })
})

function isRefusing(call: () => unknown): boolean {
  try {
    call()
    return false
  } catch {
    return true
  }
}

/** A key deriver that has each derivation until the test calls `answer`. */
function pendingDeriver() {
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
