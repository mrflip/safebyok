import { isEqual } from 'es-toolkit'
import { Consts, Deriver, Errors, type GX, Logger, Phrases as PhrasesX, ReportError, VX, Validator } from 'safebyok-big/internals'
import type { Bank } from './bank'
import { Proving, guardKeyDeriver } from './proving'
import { DefaultStrengthChecker, guardStrengthChecker } from '../helpers/passphrase-strength'
import { type BadNewsHandler, type DeviceOpts, type DeviceRecord, type DeviceSnapshot, BankishChecks, PendingBank } from '../shapes/shapes-bankish'
import type { GuardedKeyDeriver, GuardedStrengthChecker, StrengthChecker } from '../shapes/shapes-gateish'
import { type BankScope, StampChecks } from '../shapes/shapes-stamps'
import type { Banklabel, DeviceTok, Userid } from '../shapes/primitives'
import type { VaultDB } from '../storage/vault-db'
import { type Modelkind, ThingChecks } from '../shapes/shapes-thing'
import * as Throwers from '../refusals/throwers'

// == [Defaults]: DefaultLeaseMillis

/** How long a lease lasts when the host gives no `autolockMinutes`: fourteen days. */
export const DefaultLeaseMillis = 14 * 24 * 60 * 60_000
// --
/** The signed-in user's presence in this browser for one bank scope: the host's functions, guarded, and the bank it holds.
 * Make it with `Device.make(record, opts)`. A `sweep()` ends it for good.
 */
export class Device {
  // == [Props]: userid, banklabel, device_tok, vaultDB, keyDeriver, strengthChecker, logger, leaseMillis, #onBadNews, #thisIsTemporaryBank, #unsubscribeBank, #endCause, #snapshot, #subscribers, #getSnapshot, #subscribe, toJSON

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

  /** The host's `onBadNews`, or the default. */
  readonly #onBadNews: BadNewsHandler
  /** The last bank made on this device, or null for none. {@link lock} and {@link sweep} act on it, and the device's
   * snapshot carries its snapshot, or {@link PendingBank} while there is none.
   */
  #thisIsTemporaryBank: Bank | null = null
  /** Ends this device's subscription to the bank it holds. */
  #unsubscribeBank: () => void = () => undefined
  /** Why a sweep disabled the device, or null while it is enabled. */
  #endCause:   Errors.VaultError | null = null

  /** The current snapshot, which {@link getSnapshot} returns. */
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

  // == [Getters]: scope, autolockMinutes, getSnapshot, subscribe

  /** The bank scope this device serves. */
  get scope(): BankScope { return StampChecks.bankScope.parse(this) }

  /** The autolock duration in minutes, past which a lease no longer unlocks the bank. */
  get autolockMinutes(): number { return this.leaseMillis / Consts.MinuteMillis }

  /** This device's snapshot getter, already bound, as `useSyncExternalStore` wants it.
   * It returns the same frozen object until something in the snapshot changes. The snapshot includes the bank's, so one
   * subscription here hears every change to either.
   */
  get getSnapshot(): () => DeviceSnapshot { return this.#getSnapshot }

  /** Subscribe a listener to this device's snapshot, returning its unsubscribe. Already bound, as `useSyncExternalStore` wants it.
   * The listener is called with no argument after each change: read the snapshot again. What it throws goes to {@link tellBadNews}.
   */
  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }
  // --

  // == [Construction]: make, constructor

  /** Make a device for the bank scope and token in `record`, guarding the host's functions in `opts`. Nothing is fetched or stored. */
  static make(record: DeviceRecord, opts: DeviceOpts): Device { return new Device(record, opts) }

  private constructor(record: DeviceRecord, opts: DeviceOpts) {
    checkSecureContext()
    const { record: { userid, banklabel, device_tok }, opts: { vaultDB, keyDeriver, strengthChecker = DefaultStrengthChecker, logger, autolockMinutes, onBadNews = DefaultOnBadNews } } = Checks.deviceMakeArgs.parse({ record, opts })
    Object.assign(this, { userid, banklabel, device_tok })
    this.vaultDB = vaultDB
    this.keyDeriver = guardKeyDeriver(keyDeriver)
    this.strengthChecker = guardStrengthChecker(strengthChecker)
    this.logger = Logger.parseLogger(logger)
    this.leaseMillis = millisOf(autolockMinutes, DefaultLeaseMillis)
    this.#onBadNews = onBadNews
    this.#snapshot = this.#makeSnapshot()
    if (Deriver.isTestDeriver(keyDeriver)) { this.logger.warn(PhrasesX.TestDeriverNotice, { oplabel: 'Device.make' }) }
    Object.freeze(this)
  }
  // --

  // == [Strength]: judgeStrength

  /** The strength checker's verdict on a new passphrase: show it as the user types, and hold the submit until it is strong.
   * `Bank.birth` and `bank.replacePassphrase` ask the same checker, and refuse `weak_passphrase` where it is not.
   */
  judgeStrength(passphraseCleartext: string): Promise<GX.PassphraseVerdict> { return Proving.judgeStrength(this, this.scope, passphraseCleartext) }
  // --

  // == [Locking]: lock, cheatHoldBank

  /** Lock this device's bank, if it holds one. Never throws. */
  lock(): this {
    this.#thisIsTemporaryBank?.lock()
    return this
  }

  // A stand-in, until the device brings up its own bank: each Bank made on this device calls it, and the last is kept.
  /** Hold `bank` as this device's bank, the one {@link lock}, {@link sweep} and the snapshot act on. Internal. */
  cheatHoldBank(bank: Bank): void {
    this.#unsubscribeBank()
    this.#thisIsTemporaryBank = bank
    this.#unsubscribeBank = bank.subscribe(this.#align)
    this.#align()
  }
  // --

  // == [Ending]: sweep

  /** Disable this device for good, and sweep its bank. Never throws. */
  sweep(): this {
    if (! this.isEnabled) { return this }
    this.#endCause = Throwers.deviceDisabled()
    this.#thisIsTemporaryBank?.sweep()
    return this
  }
  // --

  // == [Snapshot]: align, makeSnapshot

  // An arrow, so it stays bound: the bank calls it as a subscriber.
  /** Remake the snapshot, and tell each subscriber if it changed. */
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

  /** A new snapshot of this device: its bank's snapshot. */
  #makeSnapshot(): DeviceSnapshot {
    return Object.freeze({ bank: this.#thisIsTemporaryBank?.getSnapshot() ?? PendingBank })
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

// == [Helpers]: millisOf, checkSecureContext

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
  deviceMakeArgs: obj({
    record: BankishChecks.deviceRecord,
    opts:   Validator.objCheck(() => ({
      vaultDB:         ThingChecks.vaultDBShape,
      keyDeriver:      custom<Deriver.KeyDeriver>(),
      strengthChecker: custom<StrengthChecker>().optional(),
      logger:          custom<Logger.VaultLogger>().optional(),
      autolockMinutes: VX.positiveMinutes.optional(),
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
