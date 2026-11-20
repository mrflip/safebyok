import { isEqual } from 'es-toolkit'
import { Consts, Deriver, Errors, Logger, Phrases as PhrasesX, ReportError, VX, Validator } from 'safebyok-big/internals'
import type { Bank } from './bank'
import type { Gating } from './gating'
import { guardKeyDeriver } from './proving'
import { DefaultStrengthChecker, guardStrengthChecker } from '../helpers/passphrase-strength'
import { type BadNewsHandler, type DeviceOpts, type DeviceRecord, type DeviceSnapshot, BankishChecks } from '../shapes/shapes-bankish'
import type { AskUser, GuardedKeyDeriver, GuardedStrengthChecker, RequestCleartext, StrengthChecker } from '../shapes/shapes-gateish'
import { type BankScope, StampChecks } from '../shapes/shapes-stamps'
import type { Banklabel, DeviceTok, Userid } from '../shapes/primitives'
import type { VaultDB } from '../storage/vault-db'
import { type Modelkind, ThingChecks } from '../shapes/shapes-thing'
import * as Throwers from '../refusals/throwers'

// == [Defaults]: DefaultLeaseMillis

/** How long a lease lasts when the host gives no `autolockMinutes`: fourteen days. */
export const DefaultLeaseMillis = 14 * 24 * 60 * 60_000
// --
/** The signed-in user's presence in this browser for one bank scope: the host's functions, guarded, and at most one open gating.
 * Make it with `Device.make(record, opts)`. A `sweep()` ends it for good.
 */
export class Device {
  // == [Props]: userid, banklabel, device_tok, vaultDB, keyDeriver, strengthChecker, logger, leaseMillis, askUser, #onBadNews, #openGating, #gatingseq, #thisIsTemporaryBank, #unsubscribeBank, #endCause, #snapshot, #subscribers, #getSnapshot, #subscribe, toJSON

  declare readonly userid:     Userid
  declare readonly banklabel:  Banklabel
  /** This device's token in its bank scope, recorded in each wayin it builds. */
  declare readonly device_tok: DeviceTok
  /** Where this device's banks are stored. */
  readonly vaultDB:            VaultDB
  readonly keyDeriver:         GuardedKeyDeriver
  readonly strengthChecker:    GuardedStrengthChecker
  readonly logger:             Logger.VaultLogger
  /** The autolock duration in milliseconds: how long a lease lasts on this device. */
  readonly leaseMillis:        number
  /** The host's dialog, guarded, or null to leave the host to render `openGating` itself. */
  readonly askUser:            AskUser | null

  /** The host's `onBadNews`, or the default. */
  readonly #onBadNews: BadNewsHandler
  #openGating: Gating | null = null
  /** The count of gatings opened and ended on this device, which names the open one in the snapshot. */
  #gatingseq = 0
  /** The bank {@link lock} locks and {@link sweep} sweeps, whose snapshot this device's forwards: the last made on this device, or null for none. */
  #thisIsTemporaryBank: Bank | null = null
  /** Ends this device's subscription to the bank it holds. */
  #unsubscribeBank: () => void = () => undefined
  /** Why a sweep disabled the device, or null while it is enabled. */
  #endCause:   Errors.VaultError | null = null

  /** The snapshot held, which {@link getSnapshot} returns until something in it changes. */
  #snapshot: DeviceSnapshot
  readonly #subscribers = new Set<() => void>()
  readonly #getSnapshot = (): DeviceSnapshot => this.#snapshot
  readonly #subscribe = (listener: () => void): (() => void) => {
    this.#subscribers.add(VX.listener.parse(listener))
    return () => { this.#subscribers.delete(listener) }
  }

  /** This device's scope and token, for `JSON.stringify`. */
  toJSON(): DeviceRecord {
    const { userid, banklabel, device_tok } = this
    return { userid, banklabel, device_tok }
  }
  // --

  // == [Getters]: scope, openGating, autolockMinutes, getSnapshot, subscribe

  /** The bank scope this device serves. */
  get scope(): BankScope { return StampChecks.bankScope.parse(this) }

  /** The gating open on this device, or null. */
  get openGating(): Gating | null { return this.#openGating }

  /** The autolock duration in minutes, past which a lease no longer unlocks the bank. */
  get autolockMinutes(): number { return this.leaseMillis / Consts.MinuteMillis }

  /** A function returning this device's snapshot: the same frozen object until something in it changes. Safe to pass without binding, as `useSyncExternalStore` wants.
   * It carries the bank's own snapshot, so one subscription here hears every change to either.
   */
  get getSnapshot(): () => DeviceSnapshot { return this.#getSnapshot }

  /** A function that subscribes a listener to this device's snapshot and returns its unsubscribe. Safe to pass without binding, as `useSyncExternalStore` wants.
   * The listener is called with no argument after each change: read the snapshot again. What it throws is reported through {@link tellBadNews}.
   */
  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }
  // --

  // == [Construction]: make, constructor

  /** Make a device for the bank scope and token in `record`, guarding the host's functions in `opts`. Nothing is fetched or stored. */
  static make(record: DeviceRecord, opts: DeviceOpts): Device { return new Device(record, opts) }

  private constructor(record: DeviceRecord, opts: DeviceOpts) {
    checkSecureContext()
    const { record: { userid, banklabel, device_tok }, opts: { vaultDB, keyDeriver, strengthChecker = DefaultStrengthChecker, logger, autolockMinutes, requestCleartext, onBadNews = DefaultOnBadNews } } = Checks.deviceMakeArgs.parse({ record, opts })
    Object.assign(this, { userid, banklabel, device_tok })
    this.vaultDB = vaultDB
    this.keyDeriver = guardKeyDeriver(keyDeriver)
    this.strengthChecker = guardStrengthChecker(strengthChecker)
    this.logger = Logger.parseLogger(logger)
    this.leaseMillis = millisOf(autolockMinutes, DefaultLeaseMillis)
    this.askUser = (requestCleartext === undefined) ? null : guardRequestCleartext(requestCleartext)
    this.#onBadNews = onBadNews
    this.#snapshot = this.#makeSnapshot()
    if (Deriver.isTestDeriver(keyDeriver)) { this.logger.warn(PhrasesX.TestDeriverNotice, { oplabel: 'Device.make' }) }
    Object.freeze(this)
  }
  // --

  // == [Locking]: lock, cheatHoldBank

  /** Lock this device's bank. Never throws. */
  lock(): this {
    this.#thisIsTemporaryBank?.lock()
    return this
  }

  // A stand-in, until the device brings up its own bank: each Bank made on this device calls it, and the last is kept.
  /** Hold `bank` as the bank {@link lock} locks, {@link sweep} sweeps and the snapshot shows. Internal: call it from each Bank made on this device. */
  cheatHoldBank(bank: Bank): void {
    this.#unsubscribeBank()
    this.#thisIsTemporaryBank = bank
    this.#unsubscribeBank = bank.subscribe(this.#align)
    this.#align()
  }
  // --

  // == [Ending]: sweep

  /** Disable this device for good, dismissing its open gating and sweeping its bank. Never throws. */
  sweep(): this {
    if (! this.isEnabled) { return this }
    this.#endCause = Throwers.deviceDisabled()
    this.#openGating?.dismiss()
    this.#thisIsTemporaryBank?.sweep()
    return this
  }
  // --

  // == [The one gating open]: attachGating, detachGating, alignOpenGating

  /** Attach `gating` as this device's open gating. Refuses `already_asking` while another is open. */
  attachGating(gating: Gating): void {
    this.demandEnabled()
    if (this.#openGating !== null) { throw Throwers.alreadyAsking() }
    this.#openGating = gating
    this.#gatingseq += 1
    this.#align()
  }

  /** Detach `gating` if it is this device's open gating. */
  detachGating(gating: Gating): void {
    if (this.#openGating !== gating) { return }
    this.#openGating = null
    this.#gatingseq += 1
    this.#align()
  }

  /** Tell the subscribers if the open gating's attempt began or ended. Internal: call it as the open gating's attempt begins and ends. */
  alignOpenGating(): void { this.#align() }
  // --

  // == [Snapshot]: align, makeSnapshot

  // An arrow, so it stays bound: the bank calls it as a subscriber.
  /** Remake the snapshot, and where it changed, hold the new one and tell each subscriber. */
  readonly #align = (): void => {
    const next = this.#makeSnapshot()
    if (isEqual(next, this.#snapshot)) { return }
    this.#snapshot = next
    for (const listener of this.#subscribers) {
      try {
        listener()
      } catch (err) {
        this.tellBadNews([err])
      }
    }
  }

  /** This device's snapshot as its state stands: its bank's own, and the open gating's. */
  #makeSnapshot(): DeviceSnapshot {
    const gating = this.#openGating
    return Object.freeze({
      bank:   this.#thisIsTemporaryBank?.getSnapshot() ?? null,
      gating: gating === null ? null : Object.freeze({
        gatingkind: gating.gatingkind, gatingseq: this.#gatingseq, isAttempting: gating.isAttempting,
      }),
    })
  }
  // --

  // == [Telling the host]: tellBadNews

  /** Tell the host's `onBadNews` of failures no caller is waiting on. Never throws.
   * Anything but a refusal is told as `unexpected_error`, and a `disabled` refusal is dropped. Once the device is disabled, the
   * default handler hears instead of the host's.
   */
  tellBadNews(badnews: readonly unknown[]): void {
    const refusals = badnews.map((news) => (Errors.isVaultError(news) ? news : Throwers.unexpectedError(news)))
    // A thing disabled since is no news: the host swept it, or its bank went away.
    tellBadNewsTo(this.isEnabled ? this.#onBadNews : DefaultOnBadNews, this, refusals.filter((refusal) => refusal.refusalkind !== 'disabled'))
  }
  // --

  // == [Guards]: isEnabled, endCause, demandEnabled

  /** True from `Device.make` until a sweep, and never again. */
  get isEnabled(): boolean { return this.#endCause === null }

  /** The refusal every call on this device meets after a sweep, or null while it is enabled. */
  get endCause(): Errors.VaultError | null { return this.#endCause }

  /** Throw unless {@link isEnabled}. */
  demandEnabled(): this {
    if (this.#endCause !== null) { throw this.#endCause }
    return this
  }
  // --

  /** Always `'device'`: this model's {@link Modelkind}. */
  get modelkind(): 'device' { return 'device' satisfies Modelkind }
}

// == [Host functions]: DefaultOnBadNews, tellBadNewsTo

/** The default `onBadNews`: warn of each failure on the device's logger. */
export const DefaultOnBadNews: BadNewsHandler = ({ news, device }) => {
  device.logger.warn(news.message, { oplabel: 'Device.onBadNews', refusalkind: news.refusalkind })
}

/** Tell `onBadNews` each of `badnews`, awaiting none. Never throws.
 * Anything the handler throws or rejects with is reported to the platform, and reaches no caller.
 */
export function tellBadNewsTo(onBadNews: BadNewsHandler, device: Device, badnews: readonly Errors.VaultError[]): void {
  Checks.tellBadNewsToArgs.parse({ onBadNews, device, badnews })
  for (const news of badnews) {
    // Any answer is heard out, a thenable among them: none is awaited.
    void (async () => {
      try {
        await onBadNews({ news, device })
      } catch (err) {
        ReportError.reportToPlatform(err)
      }
    })()
  }
}
// --

// == [Helpers]: guardRequestCleartext, millisOf, checkSecureContext

// What the dialog throws is dropped: it may quote what the user typed.
/** Guard the host's `requestCleartext`: the guard resolves true when the host's resolves, and false when it throws, dropping the throw. */
export function guardRequestCleartext(requestCleartext: RequestCleartext): AskUser {
  const host = Checks.requestCleartext.parse(requestCleartext, { where: 'requestCleartext' })
  return Consts.brandGuarded(async (gating: Gating): Promise<boolean> => {
    try {
      await host(gating)
      return true
    } catch {
      return false
    }
  })
}

// A host's Infinity minutes, for never, is kept as ForeverMillis: past the entrypoint, nothing is infinite.
/** `minutes` in milliseconds, capped at `ForeverMillis`, or `fallback` for none. */
function millisOf(minutes: number | undefined, fallback: number): number { return (minutes === undefined ? fallback : Math.min(Math.round(minutes * Consts.MinuteMillis), Consts.ForeverMillis)) }

/** Refuse to run outside a secure context, where WebCrypto is missing */
function checkSecureContext(): void {
  if ((globalThis as { isSecureContext?: unknown }).isSecureContext === false) { throw Throwers.insecureContext() }
}
// --

// == [Checks]: Checks

/** The checks of {@link Device.make}'s arguments. */
const Checks = Validator.Checkers('bad_record', ({ obj, arr, fn, custom }) => ({
  requestCleartext: fn<RequestCleartext>(),
  deviceMakeArgs: obj({
    record: BankishChecks.deviceRecord,
    opts:   Validator.objCheck(() => ({
      vaultDB:         ThingChecks.vaultDBShape,
      keyDeriver:      custom<Deriver.KeyDeriver>(),
      strengthChecker: custom<StrengthChecker>().optional(),
      logger:          custom<Logger.VaultLogger>().optional(),
      autolockMinutes: VX.positiveMinutes.optional(),
      requestCleartext: custom<RequestCleartext>().optional(),
      onBadNews:       fn<BadNewsHandler>().optional(),
      // Ignored: the new core keeps no device database. Taken so that `...browserOpts()` from safebyok/browser, which carries one, spreads in.
      deviceDB:        custom<unknown>().optional(),
    }), { refusalkind: 'bad_record' }),
  }),
  tellBadNewsToArgs: obj({
    onBadNews: fn<BadNewsHandler>(),
    device:    custom<Device>((val) => val instanceof Device, PhrasesX.DeviceExpected),
    badnews:   arr(custom<Errors.VaultError>(Errors.isVaultError, PhrasesX.VaultErrorExpected)),
  }),
}))
// --
