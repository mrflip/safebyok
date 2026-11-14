import { isEqual } from 'es-toolkit'
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
import type { BadNewsHandler, DeviceAnnouncement, DeviceEvent, DeviceOpts, DeviceSnapshot, DeviceStage, GuardedLifecycleHandler, LifecycleHandler, VacateStory } from '../shapes/shapes-vaultish'
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

/** The signed-in user's presence on this browser for one bank: the host's options and functions, the one gating open, and the bank once ensured.
 * Make it with `Device.make(opts)`, then call {@link ensureBank}. A `sweep()` or a `vacate()` ends it for good.
 */
export class Device {
  // == [Props]: user_id, banklabel, scope, gates, keyDeriver, deviceDB, logger, strengthChecker, leaseMillis, boxRefreshMillis, #bankDB, #hostHandlers, #askUser, #vaultRefreshMillis, #bankListing, #listeners, #deviceTok, #openGating, #endCause, #vacating, #isReady, #snapshot, #getSnapshot, #subscribe

  declare readonly user_id:   string
  declare readonly banklabel: string
  readonly scope:            BankScope
  /** The bank's gates, as `Device.make` was given them. */
  readonly gates:            readonly ['main']
  readonly keyDeriver:       GuardedKeyDeriver
  readonly deviceDB:         DeviceDB
  readonly logger:           VaultLogger
  readonly strengthChecker:  GuardedStrengthChecker
  /** The autolock duration in milliseconds: how long a lease lasts on this device. */
  readonly leaseMillis:      number
  /** How old a box may grow before it is fetched again, in milliseconds. */
  readonly boxRefreshMillis: number

  readonly #bankDB:             BankDB
  /** The host's guarded `onLifecycle` and its `onBadNews`, called while the device is enabled, and by its vacate. */
  readonly #hostHandlers:       Handlers
  /** The host's guarded `requestCleartext`, or null if the host gave none. */
  readonly #askUser:            AskUser | null
  /** How old the bank or a vault may grow before it is fetched again, in milliseconds. */
  readonly #vaultRefreshMillis: number
  readonly #listeners = new Set<() => void>()
  /** The listing the bank is made in, made anew once the bank listed there has ended. */
  #bankListing:         BankListing
  /** The token of this device's row in the deviceDB, once an `ensureBank` has ensured the row; null until then. */
  #deviceTok:           string | null = null
  #openGating:          AnyGating | null = null
  /** Why a sweep or a vacate disabled the device, shown as its snapshot's `err`; null while it is enabled. */
  #endCause:            VaultError | null = null
  /** The first vacate's promise, which a repeat vacate returns; null until then. */
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

  // A bank deleted, or built anew elsewhere, is no longer the device's: the next ensureBank brings up another.
  /** The bank, once an `ensureBank` has brought it up; null before then, after a sweep or a vacate, and once the bank is deleted or built again. */
  get bank(): Bank | null {
    const bank = this.#isReady ? this.#bankListing.at(this.scope) : null
    return (bank?.isEnabled === true) ? bank : null
  }

  /** The token of this device's row in the deviceDB, which each wayin records; null until an `ensureBank` has ensured the row. */
  get device_tok(): string | null { return this.#deviceTok }

  /** The gating open on this device, or null. */
  get openGating(): AnyGating | null { return this.#openGating }

  /** The autolock duration in minutes, past which a cached lease no longer unlocks the bank. */
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
    // A disabled device asks no one: every gating's launch follows an enabled check in the same tick.
    this.#askUser = requestCleartext === undefined ? null : guardRequestCleartext(requestCleartext)
    this.logger = parseLogger(logger)
    this.strengthChecker = guardStrengthChecker(strengthChecker)
    this.leaseMillis = millisOf(autolockMinutes, DefaultLeaseMillis)
    this.boxRefreshMillis = millisOf(boxRefreshMinutes, DefaultRefreshMillis)
    this.#bankDB = bankDB
    this.#vaultRefreshMillis = millisOf(vaultRefreshMinutes, DefaultRefreshMillis)
    this.#bankListing = this.#makeBankListing()
    this.#snapshot = this.#makeSnapshot()
    if (isTestDeriver(keyDeriver)) { this.logger.warn(Phrases.TestDeriverNotice, { oplabel: 'Device.make' }) }
    Object.freeze(this)
  }

  // The device is the bank listing's parent: the listing tells it once its list changes, after the bank and everything
  // below it have aligned, and only then is the device's snapshot remade.
  /** Make a bank listing whose comings and goings remake this device's snapshot. */
  #makeBankListing(): BankListing {
    const listing = new BankListing(this, { bankDB: this.#bankDB, maxMillisSinceRefresh: this.#vaultRefreshMillis, askUser: this.#askUser })
    listing.subscribe(this.#remakeSnapshot)
    return listing
  }
  // --

  // == [Starting]: ensureBank, tryEnsureBank, bringUp, fetchBank, bankListingInHand

  /** The bank, brought up on the first call that succeeds: fetched with its vaults and their watch, or built by asking the user if none is stored. */
  async ensureBank(): Promise<Bank> {
    this.demandEnabled()
    if (this.bank !== null) { return this.bank }
    const brought = await outcomeOf(() => this.#bringUp())
    this.#isReady ||= brought.ok
    this.#remakeSnapshot()
    this.announce({ kind: 'helloed', outcome: brought.ok ? good(undefined) : brought, vault: null })
    return demandGood(brought).val
  }

  /** Non-throwing form of {@link ensureBank}. */
  tryEnsureBank(): Promise<Outcome<Bank>> { return outcomeOf(() => this.ensureBank()) }

  // Two calls under way with a bank stored both get the one bank of the listing; with none stored, the second refuses `already_asking`, the first's gating being open.
  /** Bring up the bank, refusing if a sweep or a vacate lands meanwhile. */
  async #bringUp(): Promise<Bank> {
    const { device_tok } = await this.deviceDB.ensureCachedDevice(this.scope)
    this.demandEnabled()
    this.#deviceTok = device_tok
    await this.keyDeriver.load()
    await this.strengthChecker.load()
    const listed = this.#bankListing.at(this.scope)
    const bank = (listed?.isEnabled === true) ? listed : await this.#fetchBank()
    await bank.vaultListing.hello()
    return bank
  }

  // The one ensureBank of a startup: it feeds the bank its gate and its vaults, so the vault listing is not asked to list.
  /** The stored bank, or one built through a `build_bank` gating if no live bank is stored. */
  async #fetchBank(): Promise<Bank> {
    const answer = await this.#bankDB.tryEnsureBank({ op: 'ensure', ...this.scope, gates: ['main'] })
    this.demandEnabled()
    if (! answer.ok) {
      // A revoked identity vacates the device whatever the host's onLifecycle does; the host hears of it as the vacate's `vacated`.
      if (isVaultError(answer.err, 'identity_revoked')) { void this.vacate({ cause: answer.err }) }
      throw answer.err
    }
    const listing = this.#bankListingInHand()
    if (answer.val === null) { return Bank.launchBirth(listing, answer.parent, this.#askUser) }
    const bank = listing.deliverRecord(answer.parent)
    bank.vaultListing.deliverEnsured(answer)
    return bank
  }

  // One Bank object is one life of the bank: a listing whose bank has ended is let go, and its successor makes the next.
  /** The bank listing, made anew if the bank listed there is disabled. */
  #bankListingInHand(): BankListing {
    const listed = this.#bankListing.at(this.scope)
    if ((listed !== null) && (! listed.isEnabled)) { this.#bankListing = this.#makeBankListing() }
    return this.#bankListing
  }
  // --

  // == [Ending]: vacate, sweep, disable, vacateDevice, revokeOwnLeases, forgetOwnDevice, tellHost

  /** Sign out on this device: disable it and its bank for good, and forget every lease of this bank scope cached here, and its device row.
   * Resolves once each forget has been tried. A repeat returns the first vacate's promise.
   */
  vacate(story: VacateStory = {}): Promise<void> {
    const { cause = deviceDisabled() } = VX.vacateStory.parse(story)
    this.#disable(cause)
    // A vacate alone uses the host's handlers past the disable: a lease that outlives sign-out is the one the host most needs to hear of.
    // A vacate after a sweep still forgets its rows, as sign-out may come after the page's cleanup.
    this.#vacating ??= this.#vacateDevice(cause)
    return this.#vacating
  }

  /** Disable this device and its bank for good, leaving each cached lease for the next Device. Never throws.
   * Call it when the page is done with this device but the user stays signed in.
   */
  sweep(): this {
    this.#disable(deviceDisabled())
    return this
  }

  // Disabled first, so that the bank's lock is its lock at its end: the lease and every exposed whisper dropped, the watches ended.
  /** Disable the device for good, with `cause` as its snapshot's `err`: lock its bank and dismiss its open gating. A repeat does nothing. */
  #disable(cause: VaultError): void {
    if (! this.isEnabled) { return }
    this.#endCause = cause
    this.#bankListing.at(this.scope)?.lock()
    // Past the disable: the dismiss tells the listeners, who must meet the device already disabled.
    this.#openGating?.dismiss()
    this.#remakeSnapshot()
  }

  // A fresh device has no device row: the next device of this scope gets a new device_tok.
  /** Forget this bank scope's cached leases and device row, then tell the host `vacated`. */
  async #vacateDevice(cause: VaultError): Promise<void> {
    const unrevoked = await this.#revokeOwnLeases()
    await this.#forgetOwnDevice()
    this.#tellHost({ kind: 'vacated', cause, unrevoked })
  }

  // Every row of the bank scope, not only the bank's own: a fresh page told 'identity_revoked' has listed none.
  /** Forget every lease of this bank scope cached on this device, returning how many it could not forget. */
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

  /** Forget this device's row in the deviceDB, telling a refusal as bad news. */
  async #forgetOwnDevice(): Promise<void> {
    const forgot = await this.deviceDB.tryForgetDevice(this.scope)
    if (! forgot.ok) { tellBadNewsTo(this.#hostHandlers.onBadNews, this, [forgot.err]) }
  }

  /** Tell the host's own `onLifecycle`, even past the disable. */
  #tellHost(announcement: DeviceAnnouncement): void {
    // Not awaited: a host's onLifecycle that awaits device.vacate() is handed this vacate, and each would wait on the other.
    void this.#hostHandlers.onLifecycle({ ...announcement, device: this })
  }
  // --

  // == [Telling the host]: tellBadNews, announce

  /** Tell the host's `onBadNews` of failures no caller is waiting on. Never throws.
   * Anything but a refusal is told as `unexpected_error`, and a `disabled` refusal is dropped. Once the device is disabled, the
   * default handler hears instead of the host's.
   */
  tellBadNews(badnews: readonly unknown[]): void {
    const refusals = badnews.map((news) => (isVaultError(news) ? news : unexpectedError(news)))
    // A thing disabled since is no news: the host swept or vacated it, or its vault went away.
    tellBadNewsTo(this.#handlers.onBadNews, this, refusals.filter((refusal) => refusal.refusalkind !== 'disabled'))
  }

  // Not awaited: an announcement is news of what happened, and nothing waits on the host's answer.
  /** Tell the host's `onLifecycle` what happened in this device's life. Never throws.
   * Once the device is disabled, the default handler hears instead of the host's.
   */
  announce(announcement: DeviceAnnouncement): void { void this.#handlers.onLifecycle({ ...announcement, device: this }) }
  // --

  // == [The one gating open]: attachGating, detachGating, dismissGatingAtDiscard

  /** Attach `gating` as this device's open gating. Refuses `already_asking` while another is open. */
  attachGating(gating: AnyGating): void {
    if (this.#openGating !== null) { throw alreadyAsking() }
    this.#openGating = gating
    this.#remakeSnapshot()
  }

  /** Detach the open gating, once it has concluded. */
  detachGating(): void {
    this.#openGating = null
    this.#remakeSnapshot()
  }

  /** Dismiss the open gating if it is for `bank`, whatever its kind. */
  dismissGatingAtDiscard(bank: Bank): void {
    if (this.#openGating?.bank === bank) { this.#openGating.dismiss() }
  }
  // --

  // == [Snapshot]: remakeSnapshot, makeSnapshot

  // An arrow, so it stays bound: the bank listing calls it as a listener.
  /** Remake the snapshot, telling every listener if it changed. */
  readonly #remakeSnapshot = (): void => {
    const next = this.#makeSnapshot()
    if (isEqual(next, this.#snapshot)) { return }
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
    return Object.freeze({ ...this.scope, stage: this.#endCause ? 'disabled' : stage, err: this.#endCause, openGating: this.#openGating, bank_tok: this.bank?.bank_tok ?? null })
  }
  // --

  // == [Guards]: isEnabled, demandEnabled, handlers

  /** True from `Device.make` until a sweep or a vacate, and never again. */
  get isEnabled(): boolean { return this.#endCause === null }

  /** Throw unless {@link isEnabled}. */
  demandEnabled(): this {
    if (! this.isEnabled) { throw deviceDisabled() }
    return this
  }

  /** The host's handlers while the device is enabled; once it is disabled, the defaults, which only report. */
  get #handlers(): Handlers { return this.isEnabled ? this.#hostHandlers : DefaultHandlers }
  // --

  /** Always `'device'`: marks this model for a {@link Modelkind} check. */
  get modelkind(): 'device' { return 'device' satisfies Modelkind }
}

// == [Host functions]: HostChecks, DefaultOnBadNews, tellBadNewsTo, reportAtError, heedRevokeFailed, DefaultOnLifecycle, guardRequestCleartext, guardOnLifecycle, Handlers, DefaultHandlers

const HostChecks = Checkers('bad_option', ({ fn }) => ({
  requestCleartext: fn<RequestCleartext>(),
  onLifecycle:      fn<LifecycleHandler>(),
}))

/** The default `onBadNews`: warn of each failure on the device's logger. */
export const DefaultOnBadNews: BadNewsHandler = ({ news, device }) => {
  device.logger.warn(news.message, { oplabel: 'Device.onBadNews', refusalkind: news.refusalkind })
}

/** Tell `onBadNews` each of `badnews`, awaiting none. Never throws.
 * Anything the handler throws or rejects with is reported to the platform, and reaches no caller.
 */
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
/** Log `refusal` at error on `device`'s logger, and report it to the platform. */
function reportAtError(refusal: VaultError, device: Device): void {
  device.logger.error(refusal.message, { oplabel: 'Device.onLifecycle', refusalkind: refusal.refusalkind })
  reportToPlatform(refusal)
}

// A lock or a vacate meant the lease gone, and a vacate tries every forget again; a tombstone's forget and an outdated
// row's are tried again by the next lease cached.
/** Handle `lease_revoke_failed` for {@link DefaultOnLifecycle}. */
function heedRevokeFailed({ refusal, where, device }: Extract<DeviceEvent, { kind: 'lease_revoke_failed' }>): void {
  if (where === 'tombstone' || where === 'undeleted') {
    device.logger.warn(refusal.message, { oplabel: 'Device.onLifecycle', refusalkind: refusal.refusalkind })
    return
  }
  reportAtError(refusal, device)
  if (device.isEnabled) { void device.vacate() }
}

/** The default `onLifecycle`: log what a host should hear of, by the event's kind.
 * - `lease_revoke_failed`, after a lock or a vacate: logged at error and reported to the platform, and the device vacated
 * - the same, after a tombstone or at an unlock: a warning
 * - `vacated`, for any cause but `disabled`: logged at error and reported to the platform
 * - `helloed` refused, by `device.ensureBank()` or `vault.beginWatch()`, for any cause but `disabled`: a warning
 */
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
/** Guard the host's `requestCleartext`: the guard resolves true once the host's resolves, and false on a throw, which it drops. */
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

/** Guard the host's `onLifecycle`: anything it throws or rejects with is reported to the platform, never thrown. */
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

/** A device's lifecycle and bad-news handlers: the host's, or the defaults. */
interface Handlers {
  readonly onLifecycle: GuardedLifecycleHandler
  readonly onBadNews:   BadNewsHandler
}

// Past the disable the defaults only report: their vacate is the device's own, already under way.
/** The handlers of a disabled device: {@link DefaultOnLifecycle} and {@link DefaultOnBadNews}. */
const DefaultHandlers: Handlers = { onLifecycle: guardOnLifecycle(DefaultOnLifecycle), onBadNews: DefaultOnBadNews }
// --

// == [Helpers]: millisOf, checkSecureContext

// A host's Infinity minutes, for never, is kept as ForeverMillis: past the entrypoint, nothing is infinite.
function millisOf(minutes: number | undefined, fallback: number): number { return (minutes === undefined ? fallback : Math.min(Math.round(minutes * MinuteMillis), ForeverMillis)) }

function checkSecureContext(): void {
  if ((globalThis as { isSecureContext?: unknown }).isSecureContext === false) { throw insecureContext() }
}
// --
