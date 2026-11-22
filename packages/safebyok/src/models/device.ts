import type { QueryClient } from '@tanstack/query-core'
import { isEqual } from 'es-toolkit'
import { Consts, Deriver, Errors, type GX, Logger, Phrases as PhrasesX, ReportError, VX, Validator } from 'safebyok-big/internals'
import { Bank } from './bank'
import { Gate } from './gate'
import type { BirthGating } from './gating'
import { Proving, guardKeyDeriver } from './proving'
import { Vault } from './vault'
import { DefaultStrengthChecker, guardStrengthChecker } from '../helpers/passphrase-strength'
import { ThingMinder } from '../minding/thing-minder'
import { type BadNewsHandler, type BankAskDraft, type BankSnapshot, type DeviceOpts, type DeviceRecord, type DeviceSnapshot, type RefusalSnapshot, BankishChecks, PendingBank } from '../shapes/shapes-bankish'
import { type GetAsk, type ListAsk, getAskOf, listAskOf } from '../shapes/shapes-asks'
import { type MinderFriend, MinderChecks } from '../shapes/shapes-minder'
import type { LiveOf, ShellOf } from '../shapes/shapes-sealers'
import type { BirthCleartexts, GuardedKeyDeriver, GuardedStrengthChecker, StrengthChecker } from '../shapes/shapes-gateish'
import { type BankScope, StampChecks } from '../shapes/shapes-stamps'
import { type Banklabel, type DeviceTok, Labelpath, type Userid } from '../shapes/primitives'
import type { VaultDB } from '../storage/vault-db'
import { type BankRecord, type BoxRecord, type GateRecord, type Modelkind, Shell, ThingChecks } from '../shapes/shapes-thing'
import { BoxChecks } from '../shapes/shapes-thingkinds'
import * as Phrases from '../phrases'
import * as Throwers from '../refusals/throwers'

// == [Defaults]: DefaultLeaseMillis

/** How long a lease lasts when the host gives no `autolockMinutes`: fourteen days. */
export const DefaultLeaseMillis = 14 * 24 * 60 * 60_000
// --
/** The signed-in user's presence in this browser for one bank scope: the host's functions, guarded, its minder, and its bank and vault.
 * Make it with `Device.make(record, opts)`, then call `hello()` to bring its bank up. Its snapshot's stage goes from
 * `'starting'` to `'locked'` for a bank stored, or to `'unborn'` for none, which a {@link birthGating} on this device fills.
 */
export class Device implements MinderFriend {
  // == [Props]: userid, banklabel, device_tok, vaultDB, keyDeriver, strengthChecker, logger, leaseMillis, #onBadNews, #minder, #rootShell, #bank, #vault, #broughtUp, #banklessSnapshot, #endCause, #snapshot, #subscribers, #getSnapshot, #subscribe, toJSON

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
  /** The minder of this device's bank's Things, which this device is the friend of. */
  readonly #minder: ThingMinder
  /** The shell of the root box, which the minder is given while the device has no bank. */
  readonly #rootShell: ShellOf<BoxRecord>
  /** This device's bank, from when `hello` finds it stored or a birth on this device makes it. Null until then. */
  #bank:  Bank | null = null
  /** The vault of this device's bank's boxes, made with the bank. */
  #vault: Vault | null = null
  /** What `hello` resolves, once it has been called. */
  #broughtUp: Promise<void> | null = null
  /** The bank snapshot shown while the device has no bank: {@link PendingBank}, then `'unborn'` or `'failed'` as `hello` finds. */
  #banklessSnapshot: BankSnapshot = PendingBank
  // Nothing ends a device yet: its sweep ends only its banks.
  /** Why the device ended, or null while it is enabled. */
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

  // == [Getters]: scope, autolockMinutes, minder, bank, vault, rootBox, getSnapshot, subscribe

  /** The bank scope this device serves. */
  get scope(): BankScope { return StampChecks.bankScope.parse(this) }

  /** The autolock duration in minutes, past which a lease no longer unlocks the bank. */
  get autolockMinutes(): number { return this.leaseMillis / Consts.MinuteMillis }

  /** The minder of this device's bank's Things: it says `hello` with the device. */
  get minder(): ThingMinder { return this.#minder }

  /** This device's bank, or null until `hello` finds it stored or a birth on this device makes it. */
  get bank(): Bank | null { return this.#bank }

  /** The vault of this device's bank's boxes, or null while the device has no bank. */
  get vault(): Vault | null { return this.#vault }

  /** The bank's root box, or its shell while the device has no bank. The minder reads it. */
  get rootBox(): LiveOf<BoxRecord> | ShellOf<BoxRecord> { return this.#bank?.rootBox ?? this.#rootShell }

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

  /** Make a device for the bank scope and token in `record`, guarding the host's functions in `opts`, with its minder. Nothing is fetched or stored until {@link hello}. */
  static make(record: DeviceRecord, opts: DeviceOpts): Device { return new Device(record, opts) }

  private constructor(record: DeviceRecord, opts: DeviceOpts) {
    checkSecureContext()
    const { record: { userid, banklabel, device_tok }, opts: { vaultDB, keyDeriver, strengthChecker = DefaultStrengthChecker, logger, autolockMinutes, onBadNews = DefaultOnBadNews, queryCacheOpts, queryClient } } = Checks.deviceMakeArgs.parse({ record, opts })
    Object.assign(this, { userid, banklabel, device_tok })
    this.#rootShell = Object.freeze(BoxChecks.liveOrShell.parse(Shell.of({ userid, banklabel, labelpath: Labelpath.RootBox })) as ShellOf<BoxRecord>)
    this.vaultDB = vaultDB
    this.keyDeriver = guardKeyDeriver(keyDeriver)
    this.strengthChecker = guardStrengthChecker(strengthChecker)
    this.logger = Logger.parseLogger(logger)
    this.leaseMillis = millisOf(autolockMinutes, DefaultLeaseMillis)
    this.#onBadNews = onBadNews
    this.#minder = ThingMinder.make({ vaultDB, queryCacheOpts, queryClient }, this)
    this.#snapshot = this.#makeSnapshot()
    if (Deriver.isTestDeriver(keyDeriver)) { this.logger.warn(PhrasesX.TestDeriverNotice, { oplabel: 'Device.make' }) }
    Object.freeze(this)
  }
  // --

  // == [Strength]: judgeStrength

  /** The strength checker's verdict on a new passphrase: show it as the user types, and disable the submit until it is strong.
   * `Bank.birth` and `bank.gate.replacePassphrase` ask the same checker, and refuse `weak_passphrase` where it is not.
   */
  judgeStrength(passphraseCleartext: string): Promise<GX.PassphraseVerdict> { return Proving.judgeStrength(this, this.scope, passphraseCleartext) }
  // --

  // == [Starting]: hello, birthGating, #bringUp, #attachBank

  /** Start the minder and bring up the bank: resolves once the snapshot shows `'locked'`, `'unborn'` or `'failed'` (with `lastErr`). Never rejects.
   * Each later call resolves as the first.
   */
  hello(): Promise<void> {
    this.#broughtUp ??= this.#bringUp()
    return this.#broughtUp
  }

  /** The gating of a birth of this device's bank, for a form mutation to attempt: the bank it births is then this device's, unlocked.
   * Call it once `hello` shows the stage `'unborn'`. See {@link Bank.birth} for what the birth refuses.
   */
  birthGating(cleartexts: BirthCleartexts): BirthGating {
    // Made before the stage is checked, so a refusal here zeroes the host's passkey answer as every gating does (G2).
    const gating = Bank.birthGating(this, cleartexts, (bank) => { this.#attachBank(bank) })
    if (this.#snapshot.bank.stage === 'starting') {
      gating.vacate()
      throw Throwers.bankNotBroughtUp()
    }
    return gating
  }

  /** Bring up this device's bank. */
  async #bringUp(): Promise<void> {
    try {
      this.#minder.hello()
      const [bankRecord, maingate, rootBox] = await Promise.all([
        this.#minder.get({ ...this.scope, labelpath: 'bank' }),
        this.#minder.get({ ...this.scope, labelpath: Labelpath.MainGate }),
        this.#minder.get({ ...this.scope, labelpath: Labelpath.RootBox }),
      ])
      if (! Bank.isLive(bankRecord)) {
        this.#banklessSnapshot = Object.freeze({ ...PendingBank, stage: 'unborn' })
        this.#align()
        return
      }
      // Gate.make checks the gate and Bank.make the root box: a tombstone or a shell of either refuses.
      const { vaultDB } = this
      const gate = Gate.make(maingate as GateRecord, { device: this, vaultDB, bankStamp: bankRecord })
      this.#attachBank(Bank.make({ ...(bankRecord as BankRecord), rootBox: rootBox as LiveOf<BoxRecord> }, { device: this, vaultDB, gate }))
    } catch (err) {
      this.#banklessSnapshot = Object.freeze({ ...PendingBank, stage: 'failed', lastErr: refusalSnapshotOf(err) })
      this.#align()
    }
  }

  // The bank's own sweep clears its subscribers, so nothing here unsubscribes.
  /** Make `bank` this device's bank. */
  #attachBank(bank: Bank): void {
    this.#bank  = bank
    this.#vault = Vault.make(bank, this.#minder)
    bank.subscribe(this.#align)
    this.#align()
  }
  // --

  // == [Locking]: lock

  /** Lock this device's bank, if it has one. Never throws. */
  lock(): this {
    this.#bank?.lock()
    return this
  }
  // --

  // == [Ending]: sweep

  /** Sweep this device's bank, if it has one. Never throws.
   * The device stays usable: it judges passphrases. Its snapshot shows the swept bank.
   */
  sweep(): this {
    this.#bank?.sweep()
    return this
  }
  // --

  // == [The minder's friend]: makeGetAsk, makeListAsk
  // The bank's builders where the device has one, so that each ask tracks the bank, its main gate and its root box; until then, asks that track nothing.

  /** The get ask for the Thing at `ask.labelpath` in this device's bank scope. */
  makeGetAsk(ask: BankAskDraft): GetAsk { return this.#bank?.makeGetAsk(ask) ?? getAskOf({ ...ask, ...this.scope }) }

  /** The list ask for the children of the Thing at `ask.labelpath` in this device's bank scope. */
  makeListAsk(ask: BankAskDraft): ListAsk { return this.#bank?.makeListAsk(ask) ?? listAskOf({ ...ask, ...this.scope }) }
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

  /** A new snapshot of this device: its bank's snapshot, or the stand-in while it has none. */
  #makeSnapshot(): DeviceSnapshot {
    return Object.freeze({ bank: this.#bank?.getSnapshot() ?? this.#banklessSnapshot })
  }
  // --

  // == [Telling the host]: tellBadNews

  /** Tell the host's `onBadNews` of failures no caller is waiting on. Never throws.
   * Anything but a refusal is told as `unexpected_error`, and a `disabled` refusal is dropped. Once the device ends, the
   * default handler is called instead of the host's.
   */
  tellBadNews(badnews: readonly unknown[]): void {
    const refusals = badnews.map((news) => (Errors.isVaultError(news) ? news : Throwers.unexpectedError(news)))
    // A thing disabled since is no news: the host swept it, or its bank went away.
    tellBadNewsTo(this.isEnabled ? this.#onBadNews : DefaultOnBadNews, this, refusals.filter((refusal) => refusal.refusalkind !== 'disabled'))
  }
  // --

  // == [Guards]: isEnabled, endCause, demandEnabled

  /** True from `Device.make` until the device ends, and never again. */
  get isEnabled(): boolean { return this.#endCause === null }

  /** The refusal every call on this device meets once it ends, or null while it is enabled. */
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
    // Whatever the handler returns is ignored, a thenable among them: none is awaited.
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

// == [Helpers]: millisOf, checkSecureContext, refusalSnapshotOf

// A host's Infinity minutes, for never, becomes ForeverMillis: past the entrypoint, nothing is infinite.
/** `minutes` in milliseconds, capped at `ForeverMillis`, or `fallback` for none. */
function millisOf(minutes: number | undefined, fallback: number): number { return (minutes === undefined ? fallback : Math.min(Math.round(minutes * Consts.MinuteMillis), Consts.ForeverMillis)) }

/** Refuse to run outside a secure context, where WebCrypto is missing */
function checkSecureContext(): void {
  if ((globalThis as { isSecureContext?: unknown }).isSecureContext === false) { throw Throwers.insecureContext() }
}

/** What a snapshot shows of `err`: its refusal's kind, family and message, anything but a refusal as an unexpected error. */
function refusalSnapshotOf(err: unknown): RefusalSnapshot {
  const { refusalkind, family, message } = Errors.isVaultError(err) ? err : Throwers.unexpectedError(err)
  return Object.freeze({ refusalkind, family, message })
}
// --

// == [Checks]: Checks

/** The checks of {@link Device.make}'s arguments and {@link tellBadNewsTo}'s. */
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
      queryCacheOpts:  MinderChecks.queryCacheOptsOrDefault,
      queryClient:     custom<QueryClient>((val) => ThingMinder.isClient(val), Phrases.MinderClientExpected).optional(),
      // Ignored: the new core has no device database. Accepted so that `...browserOpts()` from safebyok/browser, which carries one, spreads in.
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
