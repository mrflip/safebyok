/** The device of `src/models/` end to end, over a real bankDB and deviceDB: its options, ensureBank, its host's functions, bad news, the snapshot and the open gating. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { DefaultLogger, setDefaultLogger } from '../../src/helpers/logger'
import { ForeverMillis, isGuarded } from '../../src/helpers/consts'
import type { Bank } from '../../src/models/bank'
import { type Device, DefaultOnLifecycle, guardOnLifecycle, guardRequestCleartext, tellBadNewsTo } from '../../src/models/device'
import { DefaultLeaseMillis } from '../../src/models/bank'
import type { Vault } from '../../src/models/vault'
import type { BadNews, DeviceEvent } from '../../src/shapes/shapes-vaultish'
import { deviceDisabled } from '../../src/refusals/throwers'
import type { AnyGating } from '../../src/shapes/shapes-gateish'
import { VaultError } from '../../src/refusals/errors'
import type { Outcome } from '../../src/refusals/outcome'
import * as TH from '../test-helpers'
import { BankScopeGiven, OtherScopeGiven, VaultScopeGiven, makeBankWithVault, makeBankWorld, useBankWorlds } from '../test-helpers/bank-world'
import { Dna, Passphrase, byPassphrase } from '../test-helpers/vault-world'
import { anyStrengthChecker, testDeriver } from '../test-helpers/builders'

useBankWorlds()
const nothing = (): void => undefined

/** `news`, told as bad news by `bank`: its autolock, whose peek at the cached lease `world`'s deviceDB refuses with it. */
async function tellByAutolock(world: ReturnType<typeof makeBankWorld>, bank: Bank, news: VaultError): Promise<void> {
  vi.spyOn(world.deviceDB, 'peek').mockRejectedValueOnce(news)
  await bank.autolock()
}


describe("a page that is not a secure context", () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it("refuses Device.make, before it touches storage", () => {
    const world = makeBankWorld()
    const listVaults = vi.spyOn(world.bankDB, 'tryEnsureBank')
    vi.stubGlobal('isSecureContext', false)
    const err = TH.expectSyncRefusal(() => world.deviceOn(), 'insecure_context')
    expect(err.message).to.match(/https/)
    expect(listVaults).not.toHaveBeenCalled()
  })

  it("makes a device in a secure context, or where the platform has no isSecureContext", () => {
    const world = makeBankWorld()
    vi.stubGlobal('isSecureContext', true)
    expect(world.deviceOn().getSnapshot().stage).to.eq('made')
    vi.stubGlobal('isSecureContext', undefined)
    expect(world.deviceOn().getSnapshot().stage).to.eq('made')
  })
})

describe("Device.make", () => {
  it("refuses a null requestCleartext", () => {
    const refusal = TH.expectSyncRefusal(() => makeBankWorld().deviceOn({ requestCleartext: null as never }), 'bad_option')
    expect(refusal.message).to.match(/^requestCleartext: /)
  })

  it.each([
    ['keyDeriver',      { keyDeriver: 3 }],
    ['strengthChecker', { strengthChecker: 3 }],
    ['logger',          { logger: 3 }],
    ['onLifecycle',     { onLifecycle: 3 }],
  ])("refuses a %s of the wrong type, naming it", (fieldname, overrides) => {
    const refusal = TH.expectSyncRefusal(() => makeBankWorld().deviceOn(overrides as never))
    expect(refusal.message.startsWith(`${fieldname}: `)).to.be.true
  })

  it.each([
    ['missing',                       undefined],
    ['empty',                         []],
    ['another gate',                  ["other"]],
    ['the main gate twice',           ["main", "main"]],
    ['a string, not a list',          "main"],
  ])("refuses gates that are %s", (_what, gates) => {
    TH.expectSyncRefusal(() => makeBankWorld().deviceOn({ gates: gates as never }), 'bad_option')
  })

  it("takes a fraction of a minute to the nearest millisecond, and Infinity as ForeverMillis", () => {
    const device = makeBankWorld().deviceOn({ autolockMinutes: 1 / 7, boxRefreshMinutes: 0.000025 })
    expect([device.leaseMillis, device.boxRefreshMillis]).to.deep.equal([8571, 2])
    expect(makeBankWorld().deviceOn({ autolockMinutes: Infinity }).leaseMillis).to.eq(ForeverMillis)
  })

  it("leases for DefaultLeaseMillis where the host names no autolockMinutes", () => {
    const device = makeBankWorld().deviceOn({ autolockMinutes: undefined })
    expect(device.leaseMillis).to.eq(DefaultLeaseMillis)
  })
})

describe("device.ensureBank", () => {
  it("builds a bank over empty storage through a build_bank gating, and readies it", async () => {
    const world = makeBankWorld()
    const load = vi.fn()
    const device = world.deviceOn({ keyDeriver: Object.assign(Object.create(testDeriver) as typeof testDeriver, { load }) })
    const seen: unknown[] = []
    device.subscribe(() => { seen.push(device.snapshot.openGating?.gatingkind ?? device.snapshot.stage) })
    expect(device.getSnapshot().stage).to.eq('made')
    expect(device.bank).to.be.null
    const bank = await device.ensureBank()
    expect(load).toHaveBeenCalledOnce()
    expect(seen).to.include('build_bank')
    expect(seen.at(-1)).to.eq('ready')
    expect(device.bank).to.equal(bank)
    const snapshot = device.getSnapshot()
    expect(snapshot).to.include({ ...BankScopeGiven, stage: 'ready', err: null, bank_tok: bank.bank_tok })
    expect(bank.snapshot).to.include({ ...BankScopeGiven, device_tok: bank.device_tok })
    expect(bank.vaultListing.snapshot).to.deep.equal([])
  })

  it("answers the same bank on a second call, without listing again", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    const device = world.deviceOnAnotherDevice()
    const bank = await device.ensureBank()
    const listed = bank.vaultAt(VaultScopeGiven)
    const listVaults = vi.spyOn(world.bankDB, 'tryEnsureBank')
    const { snapshot } = device
    expect(await device.ensureBank()).to.equal(bank)
    expect(listVaults).not.toHaveBeenCalled()
    expect(bank.vaultAt(VaultScopeGiven)).to.equal(listed)
    expect(device.snapshot).to.equal(snapshot)
  })

  it("reports each bring-up's outcome to onLifecycle, naming the vault for a vault's beginWatch", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    const onLifecycle = vi.fn()
    const device = world.deviceOn({ onLifecycle })
    world.bankDB._cheat_refuseGets('storage_unavailable')
    const refusal = await TH.expectRefusal(device.ensureBank(), 'storage_unavailable')
    expect(onLifecycle).toHaveBeenLastCalledWith({ kind: 'helloed', outcome: { ok: false, err: refusal }, vault: null, device })
    world.bankDB._cheat_refuseGets(null)
    const bank = await device.ensureBank()
    expect(onLifecycle).toHaveBeenLastCalledWith({ kind: 'helloed', outcome: { ok: true, val: undefined }, vault: null, device })
    const vault = bank.vaultAt(VaultScopeGiven)
    await vault?.beginWatch()
    expect(onLifecycle).toHaveBeenLastCalledWith({ kind: 'helloed', outcome: { ok: true, val: undefined }, vault, device })
    expect(onLifecycle).toHaveBeenCalledTimes(3)
  })

  it("reports nothing to the host for a bring-up interrupted by a sweep", async () => {
    const onLifecycle = vi.fn()
    const world = makeBankWorld()
    const device = world.deviceOn({ onLifecycle })
    const answer = TH.pendingNextAnswer(world.bankDB, 'tryEnsureBank')
    const ensuring = device.tryEnsureBank()
    await answer.reached
    device.sweep()
    answer.release()
    await TH.expectBad(ensuring, 'disabled')
    expect(onLifecycle).not.toHaveBeenCalled()
  })

  it("lists every stored vault as locked, without asking", async () => {
    const world = makeBankWorld()
    const { bank: elsewhere, vault } = await makeBankWithVault(world)
    await elsewhere.ensureVault(OtherScopeGiven)
    await vault.del(vault)
    const requestCleartext = vi.fn()
    const bank = await world.bankOnAnotherDevice({ requestCleartext })
    expect(requestCleartext).not.toHaveBeenCalled()
    expect(bank.vaultListing.snapshot).to.deep.equal([OtherScopeGiven.vaultlabel])
    expect(bank.isLocked).to.be.true
    expect(bank.vaultAt(VaultScopeGiven)?.isPresent).to.be.false
  })

  it("refuses while storage is unavailable, and leaves the device without a bank until a call succeeds", async () => {
    const world = makeBankWorld()
    const spy = TH.spyLogger()
    const device = world.deviceOn({ logger: spy.logger })
    world.bankDB._cheat_refuseGets('storage_unavailable')
    const refusal = await TH.expectRefusal(device.ensureBank(), 'storage_unavailable')
    expect(refusal.refusalkind).to.eq('storage_unavailable')
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['warn'])
    expect(device.snapshot).to.include({ stage: 'made', err: null, bank_tok: null })
    expect(device.bank).to.be.null
    world.bankDB._cheat_refuseGets(null)
    const bank = await device.ensureBank()
    expect(device.snapshot).to.include({ stage: 'ready', err: null, bank_tok: bank.bank_tok })
  })

  it("refuses when the strength checker fails to load, with its error as the cause", async () => {
    const world = makeBankWorld()
    const listVaults = vi.spyOn(world.bankDB, 'tryEnsureBank')
    const thrown = new Error('no word list here')
    const spy = TH.spyLogger()
    const device = world.deviceOn({ logger: spy.logger, strengthChecker: Object.assign((() => ({ strong: true })) as typeof anyStrengthChecker, { load: () => Promise.reject(thrown) }) })
    const err = await TH.expectRefusal(device.ensureBank())
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['warn'])
    expect(err.cause).to.eq(thrown)
    expect(err.message).to.match(/strengthChecker's load\(\) failed/)
    expect(device.snapshot).to.include({ stage: 'made', err: null })
    expect(listVaults).not.toHaveBeenCalled()
  })

  it("refuses when the key deriver fails to load, with its error as the cause", async () => {
    const world = makeBankWorld()
    const listVaults = vi.spyOn(world.bankDB, 'tryEnsureBank')
    const thrown = new Error('no wasm here')
    const spy = TH.spyLogger()
    const device = world.deviceOn({ logger: spy.logger, keyDeriver: Object.assign(Object.create(testDeriver) as typeof testDeriver, { load: () => Promise.reject(thrown) }) })
    const err = await TH.expectRefusal(device.ensureBank())
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['warn'])
    expect(err.cause).to.eq(thrown)
    expect(err.message).to.match(/keyDeriver's load\(\) failed/)
    expect(device.snapshot).to.include({ stage: 'made', err: null })
    expect(listVaults).not.toHaveBeenCalled()
  })

  it("rethrows a VaultError from the key deriver's load unchanged", async () => {
    const world = makeBankWorld()
    const refused = new VaultError('storage_unavailable', 'no wasm here')
    const spy = TH.spyLogger()
    const device = world.deviceOn({ logger: spy.logger, keyDeriver: Object.assign(Object.create(testDeriver) as typeof testDeriver, { load: () => Promise.reject(refused) }) })
    const err = await TH.expectRefusal(device.ensureBank(), 'storage_unavailable')
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['warn'])
    expect(err).to.eq(refused)
    expect(device.snapshot).to.include({ stage: 'made', err: null })
  })

  it("rethrows a VaultError from the strength checker's load unchanged", async () => {
    const world = makeBankWorld()
    const refused = new VaultError('storage_unavailable', 'no word list here')
    const spy = TH.spyLogger()
    const device = world.deviceOn({ logger: spy.logger, strengthChecker: Object.assign((() => ({ strong: true })) as typeof anyStrengthChecker, { load: () => Promise.reject(refused) }) })
    const err = await TH.expectRefusal(device.ensureBank(), 'storage_unavailable')
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['warn'])
    expect(err).to.eq(refused)
    expect(device.snapshot).to.include({ stage: 'made', err: null })
  })

  it("reports a damaged vault row as bad news, and readies the bank without it", async () => {
    const world = makeBankWorld()
    await world.ensureBuilt()
    world.bankDB._cheat_shelfOf(BankScopeGiven).vaultrows.set('broken', { am: 'a', nonsense: true })
    const onBadNews = vi.fn()
    const device = world.deviceOn({ onBadNews })
    await device.ensureBank()
    expect(device.snapshot.stage).to.eq('ready')
    expect(onBadNews.mock.calls.map(([heard]) => (heard as BadNews).news.refusalkind)).to.deep.equal(['damaged_row'])
    expect((onBadNews.mock.calls[0]?.[0] as BadNews).news.message).to.include('broken')
  })

  it("lists a vault built on another device, through the watch it starts", async () => {
    const world = makeBankWorld()
    const bank = await world.bankOnAnotherDevice()
    const listener = vi.fn()
    bank.vaultListing.subscribe(listener)
    await makeBankWithVault(world)
    await TH.eventually(() => bank.vaultListing.snapshot.length === 1)
    expect(listener).toHaveBeenCalled()
  })

  it("hands the listed vault a deleted vault's tombstone through the watch, the same vault standing for its scope through the next life", async () => {
    const world = makeBankWorld()
    const { vault } = await makeBankWithVault(world)
    const bank = await world.bankOnAnotherDevice()
    const listed = bank.vaultAt(VaultScopeGiven)
    const lived = listed?.vault_tok
    await vault.del(vault)
    await TH.eventually(() => listed?.isPresent === false)
    expect(bank.vaultAt(VaultScopeGiven)).to.eq(listed)
    expect(listed?.vault_tok).to.not.eq(lived)
    expect(bank.vaultListing.snapshot).to.deep.equal([])
    await bank.ensureUnlocked()
    const reborn = await bank.ensureVault(VaultScopeGiven)
    expect(reborn).to.equal(listed)
    expect(reborn.isPresent).to.be.true
    expect(bank.isUnlocked).to.be.true
    expect(bank.vaultListing.snapshot).to.deep.equal([Dna.vaultlabel])
  })
})

describe("the host's functions inside a device", () => {
  it("are each wrapped, with none of the host's own on a property", () => {
    const requestCleartext = vi.fn()
    const onLifecycle = vi.fn()
    const device = makeBankWorld().deviceOn({ requestCleartext, onLifecycle })
    for (const guarded of [device.keyDeriver, device.strengthChecker]) { expect(isGuarded(guarded)).to.be.true }
    expect(Object.values(device)).to.not.include.members([requestCleartext, onLifecycle, testDeriver, anyStrengthChecker])
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
    await guardOnLifecycle(() => { throw thrown })({ kind: 'vacated', cause, unrevoked: 0, device: {} as Device })
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
    [{ kind: 'lease_revoke_failed', refusal: Refusal, where: 'lock' },      'error', true,  'reports a lock\'s refused forget at error and to the platform, and vacates the device'],
    [{ kind: 'lease_revoke_failed', refusal: Refusal, where: 'vacate' },    'error', false, 'reports a vacate\'s refused forget at error and to the platform, the device ended already'],
    [{ kind: 'lease_revoke_failed', refusal: Refusal, where: 'tombstone' }, 'warn',  false, 'warns of a tombstone\'s refused forget, vacating nothing'],
    [{ kind: 'lease_revoke_failed', refusal: Refusal, where: 'undeleted' },  'warn',  false, 'warns of an outdated row\'s refused forget, vacating nothing'],
    // a vacate:
    [{ kind: 'vacated', cause: Revoked, unrevoked: 0 },                   'error', false, 'reports a vacate for a revoked identity at error and to the platform'],
    [{ kind: 'vacated', cause: deviceDisabled(), unrevoked: 1 },          null,    false, 'says nothing of a sign-out'],
    // a hello:
    [{ kind: 'helloed', outcome: { ok: false, err: Refusal } },           'warn',  false, 'warns of a refused hello'],
    [{ kind: 'helloed', outcome: { ok: true, val: undefined } },          null,    false, 'says nothing of a hello that lands'],
    [{ kind: 'helloed', outcome: { ok: false, err: deviceDisabled() } },  null,    false, 'says nothing of a hello the device\'s end refused'],
  ] as const

  for (const [told, level, isVacating, blurb] of LifecycleCases) {
    it(blurb, () => {
      const reported = vi.fn()
      vi.stubGlobal('reportError', reported)
      const spy = TH.spyLogger()
      const vacate = vi.fn()
      // A vacate's forget is refused with its device ended already.
      const isEnabled = ! ('where' in told && told.where === 'vacate')
      const device = { vacate, isEnabled, logger: spy.logger } as unknown as Device
      const named = { lease_revoke_failed: { bank: {} as Bank }, helloed: { vault: {} as Vault }, vacated: {} }[told.kind]
      DefaultOnLifecycle({ ...told, ...named, device } as DeviceEvent)
      expect(spy.calls.map((call) => call.level)).to.deep.equal(level === null ? [] : [level])
      expect(reported.mock.calls.length).to.eq(level === 'error' ? 1 : 0)
      expect(vacate.mock.calls.length).to.eq(isVacating ? 1 : 0)
      vi.unstubAllGlobals()
    })
  }

  it("logs a refusal at error through the device's logger, its kind and nothing more, where the platform has no reportError", () => {
    vi.stubGlobal('reportError', undefined)
    const spy = TH.spyLogger()
    const device = { vacate: vi.fn(), logger: spy.logger } as unknown as Device
    DefaultOnLifecycle({ kind: 'lease_revoke_failed', refusal: Refusal, bank: null, where: 'vacate', device })
    expect(spy.calls).to.deep.equal([{ level: 'error', message: Refusal.message, story: { oplabel: 'Device.onLifecycle', refusalkind: 'storage_unavailable' }, err: undefined }])
    expect(JSON.stringify(spy.calls)).not.to.include(Passphrase)
    vi.unstubAllGlobals()
  })
})

describe("'identity_revoked', the lifecycle and bad news", () => {
  it("vacates the device when ensureBank is refused for a revoked identity", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    const onBadNews = vi.fn()
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const spy = TH.spyLogger()
    const fresh = world.deviceOn({ onBadNews, logger: spy.logger })
    world.bankDB._cheat_refuseGets('identity_revoked')
    const refusal = await TH.expectRefusal(fresh.ensureBank(), 'identity_revoked')
    await TH.eventually(() => world.leaseRows().length === 0)
    await TH.eventually(() => reported.mock.calls.length > 0)
    expect(reported).toHaveBeenCalledExactlyOnceWith(refusal)
    expect(spy.calls.map((call) => call.level)).to.have.members(['warn', 'error'])
    expect(onBadNews).not.toHaveBeenCalled()
    await TH.eventually(() => ! fresh.isEnabled)
    expect(fresh.snapshot).to.include({ stage: 'disabled', err: refusal })
    await TH.expectRefusal(fresh.ensureBank(), 'disabled')
    vi.unstubAllGlobals()
  })

  it("vacates the device when any vault's call is refused for a revoked identity", async () => {
    const spy = TH.spyLogger()
    const { world, bank, vault } = await makeBankWithVault(makeBankWorld(), { logger: spy.logger })
    world.bankDB._cheat_refuseGets('identity_revoked')
    const refusal = await TH.expectRefusal(vault.get({ maxMillisSinceRefresh: 0 }), 'identity_revoked')
    expect(vault.isEnabled).to.be.false
    expect(bank.device.snapshot.bank_tok).to.be.null
    await TH.eventually(() => world.leaseRows().length === 0)
    await TH.eventually(() => spy.calls.length > 0)
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['error'])
    expect(bank.device.snapshot).to.include({ stage: 'disabled', err: refusal })
  })

  it("vacates the device on a revocation, and reports it to onLifecycle as vacated once the vacate settles", async () => {
    const onLifecycle = vi.fn()
    const { world, bank, vault } = await makeBankWithVault(makeBankWorld(), { onLifecycle })
    onLifecycle.mockClear()
    world.bankDB._cheat_refuseGets('identity_revoked')
    const refusal = await TH.expectRefusal(vault.get({ maxMillisSinceRefresh: 0 }), 'identity_revoked')
    expect(bank.device.snapshot).to.include({ stage: 'disabled', err: refusal })
    expect(onLifecycle).not.toHaveBeenCalled()
    await TH.eventually(() => onLifecycle.mock.calls.length > 0)
    expect(onLifecycle).toHaveBeenCalledExactlyOnceWith({ kind: 'vacated', cause: refusal, unrevoked: 0, device: bank.device })
    expect(world.leaseRows()).to.deep.equal([])
  })

  it("vacates the device when a vault's box listing is refused for a revoked identity", async () => {
    const onLifecycle = vi.fn()
    const { world, bank, vault } = await makeBankWithVault(makeBankWorld(), { onLifecycle })
    onLifecycle.mockClear()
    const revoked = new VaultError('identity_revoked', 'signed out')
    vi.spyOn(world.bankDB, 'tryListBoxes').mockResolvedValue({ ok: false, err: revoked, parent: null } as never)
    await TH.expectRefusal(vault.boxListing.list(), 'identity_revoked')
    expect(bank.device.isEnabled).to.be.false
    await TH.eventually(() => onLifecycle.mock.calls.length > 0)
    expect(onLifecycle).toHaveBeenCalledExactlyOnceWith({ kind: 'vacated', cause: revoked, unrevoked: 0, device: bank.device })
  })

  it("ignores a revocation that arrives after a sweep", async () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const onLifecycle = vi.fn(DefaultOnLifecycle)
    const world = makeBankWorld()
    await makeBankWithVault(world)
    const device = world.deviceOn({ onLifecycle })
    world.bankDB._cheat_refuseGets('identity_revoked')
    const answer = TH.pendingNextAnswer(world.bankDB, 'tryEnsureBank')
    const ensuring = device.tryEnsureBank()
    await answer.reached
    device.sweep()
    answer.release()
    await TH.expectBad(ensuring, 'disabled')
    expect([onLifecycle, reported].map((spied) => spied.mock.calls.length)).to.deep.equal([0, 0])
    expect(device.snapshot.err).to.include({ refusalkind: 'disabled' })
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
    world.bankDB._cheat_refuseGets('identity_revoked')
    const fetched = await Promise.all([vault.tryGet({ maxMillisSinceRefresh: 0 }), other.tryGet({ maxMillisSinceRefresh: 0 })])
    expect(fetched.map((outcome) => (outcome.ok ? null : outcome.err.refusalkind))).to.deep.equal(['identity_revoked', 'disabled'])
    await TH.eventually(() => onLifecycle.mock.calls.length > 0)
    expect(onLifecycle).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'vacated', cause: bank.device.snapshot.err }))
    expect(reported).toHaveBeenCalledOnce()
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['error'])
    expect(world.leaseRows()).to.deep.equal([])
    vi.unstubAllGlobals()
  })

  it("reports a damaged vault row even when another row's delivery refuses the listing", async () => {
    const onBadNews = vi.fn()
    const { world, bank } = await makeBankWithVault(makeBankWorld(), { onBadNews })
    const rows = world.bankDB._cheat_shelfOf(BankScopeGiven).vaultrows
    rows.set(Dna.vaultlabel, { ...(rows.get(Dna.vaultlabel) as object), revision_tok: 'rev-other' })
    rows.set('broken', { am: 'a', nonsense: true })
    await TH.expectRefusal(bank.vaultListing.list())
    expect(onBadNews.mock.calls.map(([heard]) => (heard as BadNews).news.refusalkind)).to.deep.equal(['damaged_row'])
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
    const device = makeBankWorld().deviceOn({ strengthChecker: undefined, requestCleartext: async (gating) => { attempts.push(await gating.attempt(byPassphrase(Passphrase))) } })
    await TH.expectRefusal(device.ensureBank(), 'dismissed')
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
    const [cached] = world.leaseRows() as [object]
    vi.spyOn(world.deviceDB, 'peek').mockResolvedValueOnce({ ...cached, gate_revision_tok: 'rev-other' } as never)
    vi.spyOn(world.deviceDB, 'forget').mockRejectedValueOnce(new VaultError('storage_unavailable', 'the datastore is down'))
    const page = await world.bankOn({ logger })
    await page.ensureUnlocked()
    expect(page.isUnlocked).to.be.true
    expect(warn).toHaveBeenCalledWith('the datastore is down', expect.objectContaining({ oplabel: 'Device.onLifecycle' }), undefined)
  })

  it("reports a vault's bad news to onBadNews the same as its own", async () => {
    const onBadNews = vi.fn()
    const spy = TH.spyLogger()
    const world = makeBankWorld()
    const { bank, vault } = await makeBankWithVault(world, { onBadNews, logger: spy.logger })
    const [news, revoked] = [new VaultError('storage_unavailable', 'the device database is down'), new VaultError('identity_revoked', 'the host says no')]
    for (const peekRefusal of [news, revoked]) {
      bank.lock()
      vi.spyOn(world.deviceDB, 'peek').mockRejectedValueOnce(peekRefusal)
      await bank.ensureUnlocked()
      expect(onBadNews).toHaveBeenLastCalledWith({ news: peekRefusal, device: bank.device })
      expect(vault.isEnabled).to.be.true
    }
    bank.device.sweep()
    const later = new VaultError('storage_unavailable', 'news for a device let go')
    await tellByAutolock(world, bank, later)
    expect(onBadNews).toHaveBeenCalledTimes(2)
    expect(spy.calls.map(({ message }) => message)).to.include(later.message)
  })
})

describe("device.tellBadNews(badnews)", () => {
  it("tells a refusal as it is and anything else thrown as an unexpected error, and drops the news of a thing disabled", async () => {
    const onBadNews = vi.fn()
    const bank = await makeBankWorld().bankOn({ onBadNews })
    bank.device.tellBadNews([new VaultError('storage_unavailable', "Down."), new Error("Thrown."), new VaultError('disabled', "Gone.")])
    await TH.eventually(() => onBadNews.mock.calls.length === 2)
    expect(onBadNews.mock.calls.map(([heard]) => (heard as BadNews).news.refusalkind)).to.deep.equal(['storage_unavailable', 'unexpected_error'])
  })
})

describe("tellBadNewsTo", () => {
  it("calls the handler with each news and its device", async () => {
    const device = makeBankWorld().deviceOn()
    const onBadNews = vi.fn()
    const news = [new VaultError('storage_unavailable', "Down."), new VaultError('absent_box', "Gone.")]
    tellBadNewsTo(onBadNews, device, news)
    await TH.eventually(() => onBadNews.mock.calls.length === 2)
    expect(onBadNews.mock.calls).to.deep.equal(news.map((told) => [{ news: told, device }]))
  })

  it("reports a handler's throw to the platform and still delivers the rest of the news", () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const told: string[] = []
    const device = makeBankWorld().deviceOn()
    tellBadNewsTo(({ news }) => { told.push(news.refusalkind); throw new Error("The handler is broken.") }, device, [new VaultError('storage_unavailable', "Down."), new VaultError('absent_box', "Gone.")])
    expect(told).to.deep.equal(['storage_unavailable', 'absent_box'])
    expect(reported).toHaveBeenCalledTimes(2)
    vi.unstubAllGlobals()
  })

  it("reports a handler whose promise rejects to the platform, with no unhandled rejection", async () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const device = makeBankWorld().deviceOn()
    tellBadNewsTo(() => Promise.reject(new Error("Rejected.")), device, [new VaultError('storage_unavailable', "Down.")])
    await TH.eventually(() => reported.mock.calls.length === 1)
    expect(reported.mock.calls[0]?.[0]).to.have.property('message', "Rejected.")
    vi.unstubAllGlobals()
  })

  it("refuses a handler that is not a function, a missing device, or news that is not a VaultError", () => {
    const device = makeBankWorld().deviceOn()
    const onBadNews = vi.fn()
    const news = new VaultError('storage_unavailable', "Down.")
    TH.expectSyncRefusal(() => { tellBadNewsTo('tell me' as never, device, [news]) }, 'bad_option')
    TH.expectSyncRefusal(() => { tellBadNewsTo(onBadNews, {} as never, [news]) }, 'bad_option')
    TH.expectSyncRefusal(() => { tellBadNewsTo(onBadNews, device, [new Error("Down.") as never]) }, 'bad_option')
    expect(onBadNews).not.toHaveBeenCalled()
  })
})

describe("the snapshot and its subscription", () => {
  it("notifies no unsubscribed listener, and reports a listener's throw to the platform", async () => {
    const world = makeBankWorld()
    await world.ensureBuilt()
    const device = world.deviceOn()
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const broken = vi.fn(() => { throw new Error('listener broke') })
    const gone = vi.fn()
    device.subscribe(broken)
    device.subscribe(gone)()
    await device.ensureBank()
    expect(broken).toHaveBeenCalledOnce()
    expect(gone).not.toHaveBeenCalled()
    expect(reported).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })

  it("is frozen, and serializes as itself", async () => {
    const { bank } = await makeBankWithVault()
    expect(Object.isFrozen(bank.device.snapshot)).to.be.true
    expect(bank.device.toJSON()).to.equal(bank.device.snapshot)
  })
})

/** A device with no `requestCleartext`, its bank ensured, with the vault of `Dna` locked to it and `ensureUnlocked` waiting on its gating. */
async function deviceWaitingOnUnlock() {
  const { world } = await makeBankWithVault()
  const device = world.deviceOnAnotherDevice({ requestCleartext: undefined })
  const bank = await device.ensureBank()
  const vault = bank.vaultAt(VaultScopeGiven)!
  const unlocking = bank.ensureUnlocked()
  const gating = await vi.waitFor(() => device.snapshot.openGating ?? fail("no gating yet"), { interval: 1 })
  return { world, device, bank, vault, unlocking, gating }
}

function fail(message: string): never { throw new Error(message) }

/** What a test of the open gating holds: the device, its bank, and the vault the gating asks for. */
interface Made { device: Device, bank: Bank, vault: Vault }

describe("the snapshot's open gating", () => {
  it("is null with no gating open", async () => {
    const { bank } = await makeBankWithVault()
    expect(bank.device.snapshot.openGating).to.be.null
  })

  it("is the open gating while it waits, in a frozen snapshot", async () => {
    const { device, gating, unlocking } = await deviceWaitingOnUnlock()
    expect(device.snapshot.openGating).to.equal(device.openGating)
    expect(gating.isOpen).to.be.true
    expect(Object.isFrozen(device.snapshot)).to.be.true
    gating.dismiss()
    await TH.expectRefusal(unlocking, 'dismissed')
  })

  it("serializes an open gating as its scope and kind, having no secret", async () => {
    const { device, gating, unlocking } = await deviceWaitingOnUnlock()
    const text = JSON.stringify(device.snapshot)
    const { openGating } = JSON.parse(text) as { openGating: unknown }
    expect(openGating).to.deep.equal({ ...BankScopeGiven, gatingkind: 'unlock_bank', gatingTok: gating.gatingTok })
    gating.dismiss()
    await TH.expectRefusal(unlocking, 'dismissed')
  })

  it("notifies a subscriber when a gating opens and again when it concludes", async () => {
    const { device, bank, gating, unlocking } = await deviceWaitingOnUnlock()
    const seen: unknown[] = []
    device.subscribe(() => { seen.push(device.snapshot.openGating) })
    gating.dismiss()
    await TH.expectRefusal(unlocking, 'dismissed')
    expect(seen).to.deep.equal([null])
    const again = bank.ensureUnlocked()
    await vi.waitFor(() => device.snapshot.openGating ?? fail("no gating yet"), { interval: 1 })
    expect(seen).to.have.lengthOf(2)
    device.snapshot.openGating?.dismiss()
    await TH.expectRefusal(again, 'dismissed')
    expect(seen).to.have.lengthOf(3)
  })

  it("keeps the snapshot's reference while the gating stays the same", async () => {
    const { device, gating, unlocking } = await deviceWaitingOnUnlock()
    const before = device.snapshot
    expect(device.snapshot).to.equal(before)
    expect(device.snapshot.openGating).to.equal(gating)
    gating.dismiss()
    await TH.expectRefusal(unlocking, 'dismissed')
    expect(device.snapshot).to.not.equal(before)
  })

  it("drops a gating concluded by an attempt", async () => {
    const { device, gating, unlocking } = await deviceWaitingOnUnlock()
    await TH.expectGood(gating.attempt(byPassphrase(Passphrase)))
    await unlocking
    expect(device.snapshot.openGating).to.be.null
  })

  const Enders: readonly (readonly [string, (made: Made) => void])[] = [
    ["a sweep of the device",   ({ device }) => { device.sweep() }],
    ["a vacate of the device",  ({ device }) => { void device.vacate() }],
  ]

  it("keeps the gating through a lock of the bank", async () => {
    const { device, bank, gating, unlocking } = await deviceWaitingOnUnlock()
    bank.lock()
    expect(device.snapshot.openGating).to.equal(gating)
    gating.dismiss()
    await TH.expectRefusal(unlocking)
  })

  it.each(Enders)("drops the gating at %s, before the call returns", async (_label, end) => {
    const { device, bank, vault, gating, unlocking } = await deviceWaitingOnUnlock()
    end({ device, bank, vault })
    expect(device.snapshot.openGating).to.be.null
    await TH.expectRefusal(unlocking)
    expect(gating.isOpen).to.be.false
  })

  it("drops a build's gating at a sweep, after disabling the device", async () => {
    const world = makeBankWorld()
    const device = world.deviceOn({ requestCleartext: undefined })
    const building = device.ensureBank()
    await vi.waitFor(() => device.snapshot.openGating ?? fail("no gating yet"), { interval: 1 })
    const heard: boolean[] = []
    device.subscribe(() => {
      if (device.snapshot.openGating === null) { heard.push(device.isEnabled) }
    })
    device.sweep()
    await TH.expectRefusal(building)
    expect(heard[0]).to.be.false
    expect(device.bank).to.be.null
  })

  it("keeps a gating whose attempt a sweep interrupts in the snapshot until the attempt concludes", async () => {
    const { world } = await makeBankWithVault()
    const pending = pendingDeriver()
    const device = world.deviceOnAnotherDevice({ requestCleartext: undefined, keyDeriver: pending.deriver })
    const bank = await device.ensureBank()
    const unlocking = bank.ensureUnlocked()
    const gating = await vi.waitFor(() => device.snapshot.openGating ?? fail("no gating yet"), { interval: 1 })
    const attempting = gating.attempt(byPassphrase(Passphrase))
    await vi.waitFor(() => pending.isAsked() || fail("not derived yet"), { interval: 1 })
    device.sweep()
    expect(device.snapshot.openGating).to.equal(gating)
    pending.answer()
    await TH.expectRefusal(unlocking)
    await attempting
    expect(device.snapshot.openGating).to.be.null
  })

  it("waits with no host dialog until an attempt concludes it", async () => {
    const { device, gating, unlocking } = await deviceWaitingOnUnlock()
    await TH.wakeupAtNextTick()
    expect(gating.isOpen).to.be.true
    await TH.expectGood(gating.attempt(byPassphrase(Passphrase)))
    const unlocked = await unlocking
    expect(unlocked.isUnlocked).to.be.true
    expect(device.snapshot.openGating).to.be.null
  })

  it("waits with no host dialog until a dismiss concludes it", async () => {
    const { gating, unlocking } = await deviceWaitingOnUnlock()
    gating.dismiss()
    await TH.expectRefusal(unlocking, 'dismissed')
    await TH.expectBad(gating.whenConcluded, 'dismissed')
  })
})

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
