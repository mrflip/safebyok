import { ForeverMillis, MinuteMillis, brandGuarded, type Modelkind } from '../helpers/consts'
import { Checkers } from '../helpers/validator'
import { isTestDeriver } from '../deriver/basederiver'
import { VaultError, isVaultError } from '../refusals/errors'
import { tattoo } from '../helpers/helpers'
import { type VaultLogger, parseLogger } from '../helpers/logger'
import { DefaultStrengthChecker, type GuardedStrengthChecker, guardStrengthChecker } from '../helpers/passphrase-strength'
import { type Outcome, demandGood, good, outcomeOf } from '../refusals/outcome'
import * as Phrases from '../helpers/phrases'
import { reportToPlatform } from '../refusals/report-error'
import { type BankScope, bankScope } from '../shapes/shapes-core'
import type { AnyGating, AskUser, RequestCleartext } from '../shapes/shapes-gateish'
import * as VX from '../shapes/shapes-vaultish'
import type { BadNewsHandler, DeviceAnnouncement, BankFriend, DeviceEvent, DeviceOpts, DeviceSnapshot, DeviceStage, GuardedLifecycleHandler, LifecycleHandler, VacateStory } from '../shapes/shapes-vaultish'
import type { DeviceDB } from '../storage/device-db'
import type { BankDB } from '../storage/bank-db'
import { alreadyAsking, deviceDisabled, insecureContext, unexpectedError } from '../refusals/throwers'
import { Bank, DefaultLeaseMillis, listOwnLeases } from './bank'
import { BankListing } from './bank-listing'
import { type GuardedKeyDeriver, guardKeyDeriver } from './proving'

// == [Given to a device]: DefaultRefreshMillis

/** How old a vault or box may grow before it is fetched again, unless the host's options say otherwise. */
export const DefaultRefreshMillis = 5 * MinuteMillis
// --

/** This device's place in the app for the signed-in user: the host's options and functions, the one gating open, and the bank once ensured. */
export class Device {
  // == [Props]: user_id, banklabel, scope, gates, keyDeriver, deviceDB, logger, strengthChecker, leaseMillis, boxRefreshMillis, #bankDB, #hostHandlers, #tellBadNews, #announce, #bankFriend, #bankListing, #listeners, #deviceTok, #bank, #openGating, #endCause, #vacating, #isReady, #snapshot, #getSnapshot, #subscribe

  declare readonly user_id:   string
  declare readonly banklabel: string
  readonly scope:            BankScope
  /** The bank's gates, as `Device.make` was given them. */
  readonly gates:            readonly ['main']
  readonly keyDeriver:       GuardedKeyDeriver
  readonly deviceDB:         DeviceDB
  readonly logger:           VaultLogger
  readonly strengthChecker:  GuardedStrengthChecker
  readonly leaseMillis:      number
  /** The refresh horizon of each vault's boxes. */
  readonly boxRefreshMillis: number

  readonly #bankDB:             BankDB
  /** The host's `onLifecycle`, guarded, and its `onBadNews`, called while the device is enabled and by its vacate. */
  readonly #hostHandlers:       Handlers

  /** Tell bad news no caller waits on to the host, its bank's every listing and box coming straight here: the friend they tell it through.
   * A refusal is told as it is, anything else thrown as `unexpected_error`, and a `disabled` refusal not at all.
   */
  readonly #tellBadNews = brandGuarded((badnews: readonly unknown[]): void => {
    const refusals = badnews.map((news) => (isVaultError(news) ? news : unexpectedError(news)))
    // A thing disabled since is no news: the host swept or vacated it, or its vault went away.
    tellBadNewsTo(this.#handlers.onBadNews, this, refusals.filter((refusal) => refusal.refusalkind !== 'disabled'))
  })
  // Not awaited: an announcement is news of what happened, and nothing waits on the host's answer.
  /** Tell the host's `onLifecycle` what happened, its bank's every listing and vault coming straight here: the friend they announce through. */
  readonly #announce = brandGuarded((announcement: DeviceAnnouncement): void => { void this.#handlers.onLifecycle({ ...announcement, device: this }) })
  /** The device's private calls, handed to its bank as it is made. */
  readonly #bankFriend: BankFriend
  /** The listing the bank is made in, its refresh horizon each vault's. */
  readonly #bankListing: BankListing
  readonly #listeners = new Set<() => void>()
  /** The token of this device's row in the deviceDB, once an `ensureBank` has ensured the row; null until then. */
  #deviceTok:           string | null = null
  /** The bank once an `ensureBank` has made it, even before it is brought up; null until then, and after a sweep or a vacate. */
  #bank:                Bank | null = null
  #openGating:          AnyGating | null = null
  /** Why a sweep or a vacate disabled the device, its snapshot's refusal from then on; null while it is enabled. */
  #endCause:            VaultError | null = null
  /** The first vacate's promise, which a repeat answers; null until a vacate. */
  #vacating:            Promise<void> | null = null
  /** Whether an `ensureBank` has succeeded. */
  #isReady              = false
  #snapshot:            DeviceSnapshot

  readonly #getSnapshot = (): DeviceSnapshot => this.#snapshot

  readonly #subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(VX.listener.parse(listener))
    return () => { this.#listeners.delete(listener) }
  }
  // --

  // == [Getters]: bank, device_tok, openGating, autolockMinutes, snapshot, getSnapshot, subscribe, toJSON

  /** The bank, once an `ensureBank` has brought it up; null before, and after a sweep or a vacate. */
  get bank(): Bank | null { return this.#isReady ? this.#bank : null }

  /** The token of this device's row in the deviceDB, which each wayin records; null until an `ensureBank` has ensured the row. */
  get device_tok(): string | null { return this.#deviceTok }

  /** The gating open on this device, or null. */
  get openGating(): AnyGating | null { return this.#openGating }

  /** The autolock duration in minutes, past which a cached lease no longer unlocks a vault. */
  get autolockMinutes(): number { return this.leaseMillis / MinuteMillis }

  /** This device's current {@link DeviceSnapshot}. */
  get snapshot(): DeviceSnapshot { return this.#snapshot }

  /** The unbound snapshot getter, for `useSyncExternalStore`. */
  get getSnapshot(): () => DeviceSnapshot { return this.#getSnapshot }

  /** The unbound subscribe callback, for `useSyncExternalStore`. */
  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }

  /** This device's snapshot, for `JSON.stringify`. */
  toJSON(): DeviceSnapshot { return this.#snapshot }
  // --

  // == [Construction]: make, constructor

  /** Make a device from the host's options, ready for {@link ensureBank}. Nothing is fetched or stored. */
  static make(opts: DeviceOpts): Device { return new Device(opts) }

  constructor(opts: DeviceOpts) {
    checkSecureContext()
    const { user_id, banklabel, gates, bankDB, deviceDB, keyDeriver, requestCleartext, strengthChecker = DefaultStrengthChecker, logger, autolockMinutes, vaultRefreshMinutes, boxRefreshMinutes, onBadNews = DefaultOnBadNews, onLifecycle = DefaultOnLifecycle } = VX.deviceOpts.parse(opts)
    this.scope = bankScope.parse({ user_id, banklabel })
    tattoo(this, this.scope)
    this.gates = gates
    this.keyDeriver = guardKeyDeriver(keyDeriver)
    this.deviceDB = deviceDB
    // A disabled device calls none of the host's functions, but in its vacate: the page may belong to the next user by then.
    this.#hostHandlers = { onLifecycle: guardOnLifecycle(onLifecycle), onBadNews }
    // A revoked identity vacates the device whatever the host's onLifecycle does; the host hears of it as the vacate's `vacated`.
    const panic = brandGuarded((refusal: VaultError): void => { void this.vacate({ cause: refusal }) })
    // A disabled device asks no one: every gating's launch follows an enabled check in the same tick.
    const askUser = requestCleartext === undefined ? null : guardRequestCleartext(requestCleartext)
    this.#bankFriend = { panic, announce: this.#announce, tellBadNews: this.#tellBadNews, askUser }
    this.logger = parseLogger(logger)
    this.strengthChecker = guardStrengthChecker(strengthChecker)
    this.leaseMillis = millisOf(autolockMinutes, DefaultLeaseMillis)
    this.boxRefreshMillis = millisOf(boxRefreshMinutes, DefaultRefreshMillis)
    this.#bankDB = bankDB
    this.#bankListing = new BankListing(this, { bankDB, maxMillisSinceRefresh: millisOf(vaultRefreshMinutes, DefaultRefreshMillis), bankFriend: this.#bankFriend })
    this.#bankListing.subscribe(this.#remakeSnapshot)
    this.#snapshot = this.#makeSnapshot()
    if (isTestDeriver(keyDeriver)) { this.logger.warn(Phrases.TestDeriverNotice, { oplabel: 'Device.make' }) }
    Object.freeze(this)
  }
  // --

  // == [Starting]: ensureBank, tryEnsureBank, bringUp, fetchBank

  /** The bank, brought up on the first call that succeeds: this device's row ensured in the deviceDB, then the bank fetched, or built where none is stored, and its vaults watched. */
  async ensureBank(): Promise<Bank> {
    this.demandEnabled()
    if (this.bank !== null) { return this.bank }
    const brought = await outcomeOf(() => this.#bringUp())
    this.#isReady ||= brought.ok
    this.#remakeSnapshot()
    this.#announce({ kind: 'helloed', outcome: brought.ok ? good(undefined) : brought, vault: null })
    return demandGood(brought).val
  }

  /** Non-throwing form of {@link ensureBank}. */
  tryEnsureBank(): Promise<Outcome<Bank>> { return outcomeOf(() => this.ensureBank()) }

  // Two calls under way share the one bank, its listing's, and each brings it up.
  /** A sweep or a vacate crossing it leaves the bank's listing disabled, which refuses. */
  async #bringUp(): Promise<Bank> {
    const { device_tok } = await this.deviceDB.ensureCachedDevice(this.scope)
    this.demandEnabled()
    this.#deviceTok = device_tok
    await this.keyDeriver.load()
    await this.strengthChecker.load()
    const bank = this.#bank ?? await this.#fetchBank()
    this.#bank = bank
    await bank.vaultListing.hello()
    return bank
  }

  // The one ensureBank of a startup: it feeds the bank its gate and its vaults, so the vault listing is not asked to list.
  /** The bank stored, made from the rows ensureBank answers; else, where no live bank is stored, one built through a build_bank gating. */
  async #fetchBank(): Promise<Bank> {
    const answer = await this.#bankDB.tryEnsureBank({ op: 'ensure', ...this.scope, gates: ['main'] })
    this.demandEnabled()
    if (! answer.ok) {
      if (isVaultError(answer.err, 'identity_revoked')) { this.#bankFriend.panic(answer.err) }
      throw answer.err
    }
    if (answer.val === null) { return Bank.launchBirth(this, answer.parent, this.#bankFriend.askUser) }
    const bank = this.#bankListing.deliverRecord(answer.parent)
    bank.vaultListing.deliverEnsured(answer)
    return bank
  }
  // --

  // == [Ending]: vacate, sweep, disable, vacateDevice, revokeOwnLeases, forgetOwnDevice, tellHost

  /** Sign out on this device: disable it and its bank, and forget every lease of this bank scope cached here and its device row, settling once each forget has been tried. */
  vacate(story: VacateStory = {}): Promise<void> {
    const { cause = deviceDisabled() } = VX.vacateStory.parse(story)
    this.#disable(cause, (listing) => { listing.vacate() })
    // A vacate alone uses the host's handlers past the disable: a lease that outlives sign-out is the one the host most needs to hear of.
    // A vacate after a sweep still forgets its rows, as sign-out may come after the page's cleanup.
    this.#vacating ??= this.#vacateDevice(cause)
    return this.#vacating
  }

  /** Cleanup while the page lives: disable the device and its bank, leaving each cached lease for the next device. Never throws. */
  sweep(): this {
    this.#disable(deviceDisabled(), (listing) => { listing.sweep() })
    return this
  }

  /** The device disabled, its snapshot saying `cause`, its bank listing let go by `discard` and its open gating dismissed, for good; a repeat is a no-op. */
  #disable(cause: VaultError, discard: (listing: BankListing) => void): void {
    if (! this.isEnabled) { return }
    this.#endCause = cause
    this.#bank = null
    discard(this.#bankListing)
    // Past the disable: the dismiss tells the listeners, who must meet the device already disabled.
    this.#openGating?.dismiss()
    this.#remakeSnapshot()
  }

  // A fresh device has no device row: the next device of this scope gets a new device_tok.
  /** This bank scope's leases revoked and its device row forgotten on this device, then `vacated` told. */
  async #vacateDevice(cause: VaultError): Promise<void> {
    const unrevoked = await this.#revokeOwnLeases()
    await this.#forgetOwnDevice()
    this.#tellHost({ kind: 'vacated', cause, unrevoked })
  }

  /** A vacate's revoke of every lease of this bank scope, listed or not, as a fresh page told 'identity_revoked' has listed
   * none; answers how many it could not revoke.
   */
  async #revokeOwnLeases(): Promise<number> {
    const listed = await listOwnLeases(this.deviceDB, this.scope)
    if (! listed.ok) { tellBadNewsTo(this.#hostHandlers.onBadNews, this, [listed.err]); return 0 }
    const revoked = await Promise.all(listed.val.map(async (row) => {
      const forgot = await this.deviceDB.tryForget(row)
      if (! forgot.ok) { this.#tellHost({ kind: 'lease_revoke_failed', refusal: forgot.err, bank: null, where: 'vacate' }) }
      return forgot.ok
    }))
    return revoked.filter((isRevoked) => ! isRevoked).length
  }

  /** A vacate's forget of this device's row in the deviceDB, a refusal told as bad news. */
  async #forgetOwnDevice(): Promise<void> {
    const forgot = await this.deviceDB.tryForgetDevice(this.scope)
    if (! forgot.ok) { tellBadNewsTo(this.#hostHandlers.onBadNews, this, [forgot.err]) }
  }

  /** A vacate's word to the host's own `onLifecycle`, past the disable. */
  #tellHost(announcement: DeviceAnnouncement): void {
    // Not awaited: a host's onLifecycle that awaits device.vacate() is handed this vacate, and each would wait on the other.
    void this.#hostHandlers.onLifecycle({ ...announcement, device: this })
  }
  // --

  // == [The one gating open]: attachGating, detachGating, dismissGatingAtDiscard

  /** Attach `gating` as the one this device has open, refusing while another is. */
  attachGating(gating: AnyGating): void {
    if (this.#openGating !== null) { throw alreadyAsking() }
    this.#openGating = gating
    this.#remakeSnapshot()
  }

  /** Let go of the open gating, which has concluded. */
  detachGating(): void {
    this.#openGating = null
    this.#remakeSnapshot()
  }

  /** `bank` is going away: the open gating concludes, if it asks for that bank, whatever its kind. */
  dismissGatingAtDiscard(bank: Bank): void {
    if (this.#openGating?.bank === bank) { this.#openGating.dismiss() }
  }
  // --

  // == [The world of its bank]: isLocked, ensureTimely, receiveParent

  /** False: a device has no lock, and its bank keeps the one lease. */
  get isLocked(): boolean { return false }

  /** Resolves at once: nothing above a bank needs refreshing. */
  ensureTimely(): Promise<void> { return Promise.resolve() }

  /** Does nothing: no row sits above a bank. */
  receiveParent(): void { /* no row sits above a bank */ }
  // --

  // == [Snapshot]: remakeSnapshot, makeSnapshot

  /** Make the snapshot again, and tell every listener where it differs. Bound, as the bank calls it. */
  readonly #remakeSnapshot = (): void => {
    const next = this.#makeSnapshot()
    const prior = this.#snapshot
    if ((next.stage === prior.stage) && (next.err === prior.err) && (next.openGating === prior.openGating) && (next.bank === prior.bank)) { return }
    this.#snapshot = next
    for (const listener of this.#listeners) {
      try {
        listener()
      } catch (err) {
        reportToPlatform(err)
      }
    }
  }

  #makeSnapshot(): DeviceSnapshot {
    const stage: DeviceStage = this.#isReady ? 'ready' : 'made'
    return Object.freeze({ ...this.scope, stage: this.#endCause ? 'disabled' : stage, err: this.#endCause, openGating: this.#openGating, bank: this.bank?.snapshot ?? null })
  }
  // --

  // == [Guards]: isEnabled, demandEnabled, handlers

  /** True from `Device.make` until a sweep or a vacate, and never again. */
  get isEnabled(): boolean { return this.#endCause === null }

  /** Demands that this device be enabled. */
  demandEnabled(): this {
    if (! this.isEnabled) { throw deviceDisabled() }
    return this
  }

  /** The host's handlers while the device is enabled, and handlers that only report once it is disabled. */
  get #handlers(): Handlers { return this.isEnabled ? this.#hostHandlers : DefaultHandlers }
  // --

  /** Answers 'device', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'device' { return 'device' satisfies Modelkind }
}

// == [Host functions]: HostChecks, DefaultOnBadNews, tellBadNewsTo, reportAtError, heedRevokeFailed, DefaultOnLifecycle, guardRequestCleartext, guardOnLifecycle, Handlers, DefaultHandlers

const HostChecks = Checkers('bad_option', ({ fn }) => ({
  requestCleartext: fn<RequestCleartext>(),
  onLifecycle:      fn<LifecycleHandler>(),
}))

/** The `onBadNews` a device has when given none: each news to the device's logger. */
export const DefaultOnBadNews: BadNewsHandler = ({ news, device }) => {
  device.logger.warn(news.message, { oplabel: 'Device.onBadNews', refusalkind: news.refusalkind })
}

/** Tell `onBadNews` each of `badnews` that reached `device`, awaiting none: the handler's throw or rejection reaches only the platform. */
export function tellBadNewsTo(onBadNews: BadNewsHandler, device: Device, badnews: readonly VaultError[]): void {
  VX.tellBadNewsToArgs.parse({ onBadNews, device, badnews })
  for (const news of badnews) {
    // Any answer is heard out, a thenable among them: none is awaited.
    void (async () => {
      try {
        await onBadNews({ news, device })
      } catch (err) {
        reportToPlatform(err)
      }
    })()
  }
}

// The logger too, as a platform with no reportError (Node, SSR) would hear nothing of it.
/** `refusal` to `device`'s logger at error, and to the platform. */
function reportAtError(refusal: VaultError, device: Device): void {
  device.logger.error(refusal.message, { oplabel: 'Device.onLifecycle', refusalkind: refusal.refusalkind })
  reportToPlatform(refusal)
}

// A lock or a vacate meant the lease gone; a tombstone's forget and an outdated row's are tried again by the next lease cached.
/** The default's answer to a cached lease that outlived its revoke. */
function heedRevokeFailed({ refusal, bank, where, device }: Extract<DeviceEvent, { kind: 'lease_revoke_failed' }>): void {
  if (where === 'tombstone' || where === 'undeleted') {
    device.logger.warn(refusal.message, { oplabel: 'Device.onLifecycle', refusalkind: refusal.refusalkind })
    return
  }
  reportAtError(refusal, device)
  bank?.vacate()
}

/** The `onLifecycle` a device has when given none: a lease that outlived a lock or a vacate, and a vacate with a cause, to the logger at error and the platform, the bank vacated; a bring-up or beginWatch refused but by the device's end to the logger. */
export const DefaultOnLifecycle: LifecycleHandler = (event) => {
  switch (event.kind) {
  case 'lease_revoke_failed': {
    heedRevokeFailed(event)
    break
  }
  case 'vacated': {
    if (! isVaultError(event.cause, 'disabled')) { reportAtError(event.cause, event.device) }
    break
  }
  case 'helloed': {
    const { outcome, device } = event
    if (! outcome.ok && outcome.err.refusalkind !== 'disabled') { device.logger.warn(outcome.err.message, { oplabel: 'Device.onLifecycle', refusalkind: outcome.err.refusalkind }) }
    break
  }
  }
}

// What the dialog throws is dropped: it may quote what the user typed.
/** `requestCleartext`, made to honor its contract: the one way a gating asks the user. */
export function guardRequestCleartext(requestCleartext: RequestCleartext): AskUser {
  const host = HostChecks.requestCleartext.parse(requestCleartext, { where: 'requestCleartext' })
  return brandGuarded(async (gating: AnyGating): Promise<boolean> => {
    try {
      await host(gating)
      return true
    } catch {
      return false
    }
  })
}

/** `onLifecycle`, made to honor its contract: the one way the core tells the host what happened in the device's life. */
export function guardOnLifecycle(onLifecycle: LifecycleHandler): GuardedLifecycleHandler {
  const host = HostChecks.onLifecycle.parse(onLifecycle, { where: 'onLifecycle' })
  return brandGuarded(async (event: DeviceEvent): Promise<void> => {
    try {
      await host(event)
    } catch (err) {
      reportToPlatform(err)
    }
  })
}

/** What a device tells of its life and of bad news: the host's `onLifecycle`, guarded, and its `onBadNews`, or the defaults a disabled device tells. */
interface Handlers {
  readonly onLifecycle: GuardedLifecycleHandler
  readonly onBadNews:   BadNewsHandler
}

// The defaults vacate only a vault, which a disabled device has already let go: past the disable they only report.
/** A disabled device's reports: `DefaultOnLifecycle` and `DefaultOnBadNews`. */
const DefaultHandlers: Handlers = { onLifecycle: guardOnLifecycle(DefaultOnLifecycle), onBadNews: DefaultOnBadNews }
// --

// == [Helpers]: millisOf, checkSecureContext

// A host's Infinity minutes, for never, is kept as ForeverMillis: past the entrypoint, nothing is infinite.
function millisOf(minutes: number | undefined, fallback: number): number { return (minutes === undefined ? fallback : Math.min(Math.round(minutes * MinuteMillis), ForeverMillis)) }

function checkSecureContext(): void {
  if ((globalThis as { isSecureContext?: unknown }).isSecureContext === false) { throw insecureContext() }
}
// --
