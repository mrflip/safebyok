import { QueryClient } from '@tanstack/query-core'
import { Consts, Crypto, Deriver, Errors, type GX, Helpers, Logger, Phrases as PhrasesX, ReportError, VX, Validator } from 'safebyok-big/internals'
import { Bank } from './bank'
import type { BirthGating } from './gating'
import { Proving, guardKeyDeriver } from './proving'
import { Vault } from './vault'
import { DefaultStrengthChecker, guardStrengthChecker } from '../helpers/passphrase-strength'
import { guardRootShelf } from '../minding/root-shelf'
import { VaultTSQ } from '../minding/vault-tsq'
import { type BadNewsHandler, type DeviceAnnouncement, type DeviceEvent, type DeviceJSON, type DeviceOpts, type DeviceRecord, type GuardedLifecycleHandler, type LifecycleHandler, type RootShelf, BankishChecks, bankStageVals, isRootShelf, leasekindVals } from '../shapes/shapes-bankish'
import { type MaskedView, EmptyMaskedView } from '../shapes/shapes-masked-view'
import { isQueryClient } from '../shapes/shapes-vault-tsq'
import type { BirthCleartexts, BirthDna, GuardedKeyDeriver, GuardedStrengthChecker, StrengthChecker } from '../shapes/shapes-gateish'
import type { BankScope } from '../shapes/shapes-stamps'
import type { Banklabel, Devicetok, Userid } from '../shapes/primitives'
import type { VaultDB } from '../storage/vault-db'
import type { DeviceDB } from '../storage/device-db'
import { MemoryDeviceDB } from '../storage/memory-device-db'
import { DeviceDBChecks } from '../shapes/shapes-device-db'
import { type ActualRoots, rootScopesOf } from '../shapes/shapes-asks'
import { VaultMinder } from '../minding/vault-minder'
import type { ThingCar } from '../minding/thing-car'
import { type Modelkind, ThingChecks } from '../shapes/shapes-thing'
import * as Phrases from '../phrases'
import * as Throwers from '../refusals/throwers'

// == [Defaults]: DefaultLeaseMillis, DefaultSoftlockMillis, DefaultJanitorMillis, DefaultGateStaleMillis

/** How long a lease lasts when the host gives no `autolockMinutes`: fourteen days. */
export const DefaultLeaseMillis = 14 * 24 * 60 * 60_000

/** How near its end a lease asks the user again when the host gives no `softlockMinutes`: ten minutes, before the cap a short lease sets. */
export const DefaultSoftlockMillis = 10 * 60_000

/** How often the janitor runs when the host gives no `janitorMinutes`: every ten minutes. */
export const DefaultJanitorMillis = 10 * 60_000

/** How long after the gate was last read the bank gets it again, when the host gives no `gateStaleMinutes`: twelve hours. */
export const DefaultGateStaleMillis = 12 * 60 * 60_000
// --
/** This browser, before and after anyone signs in: the host's functions, guarded, and the signed-in user's bank and vault.
 * Make it with `Device.make(record, opts)`, which does no I/O, touches no browser global and subscribes to nothing; call
 * `hello()` to start it, `connect()` to keep it in step with the vaultDB until `disconnect()`, and `signin(userid)` once
 * the host knows who is signed in, which brings up that user's bank from the roots on the host's root shelf. Its bank's
 * snapshot shows the stage `'signed_out'` until then, `'starting'` while it starts the user's bank, then `'locked'` for a
 * bank stored, or `'unborn'` for none, which a {@link birthGating} on this device fills.
 * It serves the first user it is told of for its life: another user signing in is a sign-out, which the host answers by
 * reloading the page.
 */
export class Device {
  // == [Props]: banklabel, vaultDB, deviceDB, keyDeriver, strengthChecker, logger, leaseMillis, softlockMillis, janitorMillis, gateStaleMillis, #onBadNews, #onLifecycle, #rootShelf, #vaultTsqClient, #bank, #userid, #vaultTSQ, #vault, #signinAnswer, #endCause, #devicetok, toJSON

  /** The label of the bank this device serves each user. */
  readonly banklabel:          Banklabel
  // Hidden, so that a spread or a log line of the device passes by the host's objects and their guards.
  /** Where the signed-in user's bank is stored. */
  declare readonly vaultDB:            VaultDB
  /** Where the signed-in bank's lease is stowed, shared by every tab given the same one: the host's, or one in this device's memory. */
  declare readonly deviceDB:           DeviceDB
  declare readonly keyDeriver:         GuardedKeyDeriver
  declare readonly strengthChecker:    GuardedStrengthChecker
  declare readonly logger:             Logger.VaultLogger
  /** The autolock duration in milliseconds: how long a lease lasts on this device. */
  readonly leaseMillis:        number
  /** How near its end, in milliseconds, a lease asks the user again: `softlockMinutes`, at most a twentieth of {@link leaseMillis}, or 0 where that is under a minute. */
  readonly softlockMillis:     number
  /** How often, in milliseconds, the bank's janitor locks a lease past its end, and, while connected, starts the watch where it is not running and checks whether the gate is stale. */
  readonly janitorMillis:      number
  /** How long after this device last read the gate, in milliseconds, the bank gets it again. */
  readonly gateStaleMillis:    number

  /** The host's `onBadNews`, or the default. */
  readonly #onBadNews: BadNewsHandler
  /** The host's `onLifecycle`, or the default, guarded. */
  readonly #onLifecycle: GuardedLifecycleHandler
  /** The host's root shelf, guarded, which the signed-in bank's roots are read from and put to, or null for none. */
  readonly #rootShelf: RootShelf | null
  /** The QueryClient the vault TSQ caches the boxes in: the host's, or one made with the device. */
  readonly #vaultTsqClient: QueryClient
  /** The signed-in user's bank, made with the device. */
  readonly #bank: Bank
  /** The user signed in on this device, from `signin`. Null until then. */
  #userid: Userid | null = null
  /** The vault TSQ of the signed-in user's boxes, made as `signin` starts the bank. */
  #vaultTSQ: VaultTSQ | null = null
  /** The vault of the bank's boxes, made as `signin` starts the bank. */
  #vault: Vault | null = null
  /** The promise `signin` returns, once it has been called. */
  #signinAnswer: Promise<void> | null = null
  /** Why the device ended, or null while it is enabled. */
  #endCause:   Errors.VaultError | null = null
  /** The host's `devicetok`, or null for none: then the deviceDB's is recorded. */
  readonly #devicetok: Devicetok | null

  /** The user signed in on this device and its banklabel, for `JSON.stringify`. */
  toJSON(): DeviceJSON {
    const { userid, banklabel } = this
    return { userid, banklabel }
  }
  // --

  // == [Getters]: userid, scope, autolockMinutes, vaultTsqClient, vaultTSQ, bank, vault

  /** The user signed in on this device, or null until `signin`. */
  get userid(): Userid | null { return this.#userid }

  /** The scope of the signed-in user's bank. Refuses `absent_vault` until `signin`. */
  get scope(): BankScope {
    if (this.#userid === null) { throw Throwers.nobodySignedIn() }
    return { userid: this.#userid, banklabel: this.banklabel }
  }

  /** The autolock duration in minutes, past which a lease no longer unlocks the bank. */
  get autolockMinutes(): number { return this.leaseMillis / Consts.MinuteMillis }

  /** The QueryClient the vault TSQ caches the signed-in user's boxes in: `opts.queryClient`, the host's own, or one the device made. The same one from `Device.make` on. */
  get vaultTsqClient(): QueryClient { return this.#vaultTsqClient }

  /** The vault TSQ of the signed-in user's boxes, in {@link vaultTsqClient}. Refuses `absent_vault` until `signin`, and `disabled` until the sign-in has started the bank. */
  get vaultTSQ(): VaultTSQ {
    if (this.#userid === null) { throw Throwers.nobodySignedIn() }
    if (this.#vaultTSQ === null) { throw Throwers.signinUnanswered() }
    return this.#vaultTSQ
  }

  /** The signed-in user's bank: what locks, unlocks and ends it, has its lease attached, and has the snapshot a host renders. The same one from `Device.make` on.
   * It is the bank of {@link banklabel} from the start, and unsealable until its gate and root box are live, found stored or born on this device: its snapshot's stage says which.
   */
  get bank(): Bank { return this.#bank }

  /** The vault of this device's bank's boxes, or null until `signin` starts the bank. The same one from then on.
   * Its verbs refuse `absent_thing` while the bank's gate or root box is not live.
   */
  get vault(): Vault | null { return this.#vault }
  // --

  // == [Construction]: make, constructor

  /** Make a device of the banklabel in `record`, guarding the host's functions in `opts`, with nobody signed in.
   * The signed-in user's boxes are cached in `opts.queryClient`, the host's own, under the bank's query key, or in a QueryClient the
   * device makes: {@link vaultTsqClient}. The signed-in bank's roots are read from `opts.rootShelf` at {@link signin}.
   * Nothing is fetched from the vaultDB until then, and nothing is watched until the device is both signed in and {@link connect}ed.
   */
  static make(record: DeviceRecord, opts: DeviceOpts): Device { return new Device(record, opts) }

  private constructor(record: DeviceRecord, opts: DeviceOpts) {
    const { record: { banklabel }, opts: { vaultDB, deviceDB = new MemoryDeviceDB(), keyDeriver, strengthChecker = DefaultStrengthChecker, logger, autolockMinutes, softlockMinutes, janitorMinutes, gateStaleMinutes, onBadNews = DefaultOnBadNews, onLifecycle = DefaultOnLifecycle, queryClient = new QueryClient(), rootShelf, devicetok = null } } = Checks.deviceMakeArgs.parse({ record, opts })
    this.banklabel = banklabel
    this.#devicetok = devicetok
    Helpers.decorate<Device>(this, { vaultDB, deviceDB, keyDeriver: guardKeyDeriver(keyDeriver), strengthChecker: guardStrengthChecker(strengthChecker), logger: Logger.parseLogger(logger) })
    this.leaseMillis     = millisOf(autolockMinutes, DefaultLeaseMillis)
    this.softlockMillis  = softlockMillisOf(millisOf(softlockMinutes, DefaultSoftlockMillis), this.leaseMillis)
    this.janitorMillis   = millisOf(janitorMinutes, DefaultJanitorMillis)
    this.gateStaleMillis = millisOf(gateStaleMinutes, DefaultGateStaleMillis)
    this.#onBadNews = onBadNews
    this.#onLifecycle = guardOnLifecycle(onLifecycle)
    this.#rootShelf = (rootShelf === undefined) ? null : guardRootShelf(rootShelf, (news) => { this.tellBadNews([news]) })
    this.#vaultTsqClient = queryClient
    this.#bank = Bank.make({ device: this })
    if (Deriver.isTestDeriver(keyDeriver)) { this.logger.warn(PhrasesX.TestDeriverNotice, { oplabel: 'Device.make' }) }
    Object.freeze(this)
  }
  // --

  // == [Strength]: judgeStrength

  /** The strength checker's verdict on a new passphrase: show it as the user types, and disable the submit until it is strong.
   * `Bank.birth` and `bank.gate.replacePassphrase` ask the same checker, and refuse `weak_passphrase` where it is not.
   */
  async judgeStrength(passphraseCleartext: string): Promise<GX.PassphraseVerdict> { return await Proving.judgeStrength(this, this.scope, passphraseCleartext) }
  // --

  // == [The devicetok]: ensureDevicetok

  // As a refused lease stow is (Bank.#stowLease), a refused devicetok is bad news: the wayin is still built.
  /** The token each wayin this device builds records: the host's `devicetok`, or the one the deviceDB keeps for the user `userid`, made at its first use.
   * Where the deviceDB refuses, it tells `onBadNews`, and answers a fresh token for this call alone.
   */
  async ensureDevicetok(userid: Userid): Promise<Devicetok> {
    if (this.#devicetok !== null) { return this.#devicetok }
    try {
      return await this.deviceDB.ensureDevicetok(userid)
    } catch (err) {
      this.tellBadNews([err])
      return Crypto.randomId()
    }
  }
  // --

  // == [Starting]: hello, signin, birthGating, gatingBirthAttempt, #doSignin

  /** Start the device. It resolves at once, and never rejects.
   * Throws `insecure_context`, before returning a promise, outside a secure context, where WebCrypto is missing.
   */
  hello(): Promise<void> {
    checkSecureContext()
    return Promise.resolve()
  }

  /** Tell the device who is signed in, and start that user's bank: resolves once the snapshot shows `'locked'`, `'unborn'` or `'failed'` (with `lastErr`). Never rejects.
   * Where the host's root shelf keeps the bank's roots, the bank comes up `'locked'` from them at once, and unlocks on
   * that gate, before the vaultDB answers.
   * Each later call resolves as the first, whatever userid it is handed: the device serves its first user for its life.
   */
  signin(userid: Userid): Promise<void> {
    const signedIn = Checks.userid.parse(userid)
    checkSecureContext()
    if (this.#signinAnswer !== null) { return this.#signinAnswer }
    this.#userid = signedIn
    this.#signinAnswer = this.#doSignin()
    return this.#signinAnswer
  }

  /** The gating of a birth of this device's bank over `params`, for a form mutation to attempt: the bank it births is then this device's, unlocked.
   * Call it once `signin` shows the stage `'unborn'`. See {@link Bank.birth} for what the birth refuses.
   */
  birthGating(params: FormData | BirthDna | BirthCleartexts): BirthGating {
    // Made before the stage is checked, so a refusal here zeroes the host's passkey answer, and empties a form's secret
    // fields, as every gating does (G2).
    const gating = this.#bank.birthGating(params)
    if (['signed_out', 'starting'].includes(this.#bank.getSnapshot().stage)) {
      gating.vacate()
      throw Throwers.signinUnanswered()
    }
    return gating
  }

  /** Birth this device's bank under the new `passphrase`, and a new passkey's answer if given, in a form or a dna: the bank is then this device's, unlocked. See {@link Bank.birth}.
   * A `FormData` loses its `passphrase`, `nextPassphrase` and `confirmation` fields before anything is awaited; its other fields stay. A dna's fields are never changed, but a passkey answer's PRF bytes are zeroed.
   * @example
   *   await device.gatingBirthAttempt(new FormData(formEl))
   */
  async gatingBirthAttempt(params: FormData | BirthDna): Promise<Bank> { return await this.birthGating(params).attempt() }

  // The roots fetched are received by the bank's Things, which the stage is read from. A root its Thing refuses reaches the host
  // once, as bad news told by the VaultMinder; sign-in then reports only what the roots amount to: both live, the
  // bank unborn, or broken. A failure to fetch them, once a bank is up from what was restored, is no caller's to hear.
  // The VaultMinder and the vault TSQ are made, the bank is given the VaultMinder, and the vault is made, with nothing
  // awaited between: the VaultMinder's cars remember each record they receive, so a record received with no one
  // listening would reach a later listener only as a repeat, which the VaultMinder drops. The vault TSQ listens from the
  // vault's making where the device is connected, and else from its next connect, which refetches what the vault TSQ
  // caches. The bank is seeded from the shelved roots before the vaultDB is asked. The vault is made last, on everything
  // made before it.
  /** Start the signed-in user's bank over a VaultMinder of it: from the roots shelved, where there are any, and from the two roots the vaultDB answers. */
  async #doSignin(): Promise<void> {
    try {
      const vaultMinder = VaultMinder.make(this.scope, { vaultDB: this.vaultDB, bank: this.#bank })
      this.#vaultTSQ = VaultTSQ.make({ vaultMinder, queryClient: this.#vaultTsqClient, scope: this.scope, onBadNews: (news) => { this.tellBadNews([news]) } })
      this.#bank.signin(vaultMinder, this.#rootShelf)
      this.#vault = Vault.make(this.#bank, this.#vaultTSQ)
      const answer = await vaultMinder.tryGetBankOnce()
      if (! answer.ok) { throw answer.err }
      // A root void at signin is no newer than the shell its Thing holds, so no subscriber hears it: the bank is told here.
      this.#bank.align()
      if (! (this.#bank.areRootsLive || isUnbornIn(answer.val))) { throw Throwers.bankRootsMissing() }
    } catch (err) {
      if (this.#bank.areRootsLive) {
        this.tellBadNews([err])
        return
      }
      this.#bank.showSigninRefusal(err)
    }
  }
  // --

  // == [Locking and connecting]: lock, connect, disconnect, disable

  // #lock-is-intent: a lock asks the user again at the next promptable action, and is not an alarm.
  /** Lock the signed-in user's bank, in every tab sharing this device's deviceDB ({@link Bank.lock}). Never throws. */
  lock(): this {
    this.#bank.lock()
    return this
  }

  // Call it as a QueryClient's `mount` is called, from an effect whose cleanup calls `disconnect`.
  /** Keep the device in step with the vaultDB and the deviceDB: watch the signed-in user's bank in the vaultDB, from now or from `signin`, and follow the lease the deviceDB has ({@link Bank.connect}). Never throws; a second call, or a call once the device is disabled, does nothing.
   * @example
   *   useEffect(() => { device.connect(); return () => { device.disconnect() } }, [device])
   */
  connect(): this {
    this.#bank.connect()
    return this
  }

  /** Lock the signed-in user's bank in this tab alone, and stop watching the vaultDB and following the deviceDB, until the next {@link connect} ({@link Bank.disconnect}). Never throws; calling it twice in a row is the same as once.
   * The device stays enabled: its verbs still work, and a call waiting for an `unlock` gating still waits. The next connect takes up the lease the deviceDB has.
   */
  disconnect(): this {
    this.#bank.disconnect()
    return this
  }

  // It shuts first, so that a subscriber told of the lock, or a vault as it disconnects, finds every call refusing.
  /** End the device for good: lock its bank in this tab alone, reject every call waiting for an `unlock` gating, and disconnect. Never throws; calling it twice in a row is the same as once.
   * Every call on its bank, gate or vault after refuses `disabled`, and its bank's snapshot shows the stage `'disabled'`.
   */
  disable(): this {
    if (this.#endCause !== null) { return this }
    this.#endCause = Throwers.deviceDisabled()
    this.#bank.disable()
    return this
  }
  // --

  // == [Telling the host]: tellBadNews, announce

  /** Tell the host's `onBadNews` of failures no caller is waiting on. Never throws.
   * Anything but a refusal is told as `unexpected_error`, and a `disabled` refusal is dropped. Once the device ends, the
   * default handler is called instead of the host's.
   */
  tellBadNews(badnews: readonly unknown[]): void {
    const refusals = badnews.map((news) => Throwers.refusalOfThrown(news))
    // A `disabled` refusal is no news: the device has ended, and its bank with it.
    tellBadNewsTo(this.isEnabled ? this.#onBadNews : DefaultOnBadNews, this, refusals.filter((refusal) => refusal.refusalkind !== 'disabled'))
  }

  // Not awaited: an announcement is news of what happened, and nothing waits on the host's answer.
  /** Tell the host's `onLifecycle` of `announcement`. What the handler throws or rejects with is reported to the platform, never thrown. Internal: the bank calls it. */
  announce(announcement: DeviceAnnouncement): void {
    Checks.announcement.parse(announcement)
    void this.#onLifecycle({ ...announcement, device: this })
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

  // == [A devtool's view]: inspectable

  /** A masked view of the device, for logging and debugging.
   * It has the bank's roots (`bankTSQ`) and the vault TSQ, each ciphertext masked, and the lease's loggable and when it ends, never its key material. Before `signin`, it answers {@link EmptyMaskedView}.
   * For experimenting, never for an app's own logic: what it answers may change without notice.
   */
  inspectable(): MaskedView {
    if (this.#userid === null) { return EmptyMaskedView }
    const { scope, vaultMinder } = this.#bank
    return {
      bankTSQ:  rootCarsOf(scope, vaultMinder).flatMap((car) => car?.inspectable() ?? []),
      vaultTSQ: this.#vaultTSQ?.inspectable() ?? [],
      lease:    this.#bank.inspectable(),
    }
  }
  // --
}

// == [Host functions]: DefaultOnBadNews, tellBadNewsTo, DefaultOnLifecycle, guardOnLifecycle

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

/** The default `onLifecycle`: log each announcement on the device's logger, at the level for news and not for trouble. */
export const DefaultOnLifecycle: LifecycleHandler = ({ device, ...announcement }) => {
  // The story names each field it logs, so a field added to an announcement is logged only by a decision.
  if (announcement.kind === 'stage_crossed') {
    device.logger.log(Phrases.StageCrossed(announcement.from, announcement.to), { oplabel: 'Device.onLifecycle', kind: announcement.kind, from: announcement.from, to: announcement.to })
  } else if (announcement.kind === 'watch_ended') {
    device.logger.log(Phrases.WatchEnded, { oplabel: 'Device.onLifecycle', kind: announcement.kind })
  } else {
    device.logger.log(Phrases.LeaseAnnounced(announcement.kind), { oplabel: 'Device.onLifecycle', kind: announcement.kind })
  }
}

/** Guard the host's `onLifecycle`: anything it throws or rejects with is reported to the platform, never thrown. */
function guardOnLifecycle(onLifecycle: LifecycleHandler): GuardedLifecycleHandler {
  return Consts.brandGuarded(async (event: DeviceEvent): Promise<void> => {
    try {
      await onLifecycle(event)
    } catch (err) {
      ReportError.reportToPlatform(err)
    }
  })
}
// --

// == [Helpers]: millisOf, softlockMillisOf, checkSecureContext, isUnbornIn, rootCarsOf

// A host's Infinity minutes, for never, becomes ForeverMillis: past the entrypoint, nothing is infinite.
/** `minutes` in milliseconds, capped at `ForeverMillis`, or `fallback` for none. */
function millisOf(minutes: number | undefined, fallback: number): number { return (minutes === undefined ? fallback : Math.min(Math.round(minutes * Consts.MinuteMillis), Consts.ForeverMillis)) }

/** `softlockMillis`, capped at a twentieth of `leaseMillis`, or 0 where that is under a minute */
function softlockMillisOf(softlockMillis: number, leaseMillis: number): number {
  const capped = Math.min(softlockMillis, Math.floor(leaseMillis / 20))
  return (capped < Consts.MinuteMillis) ? 0 : capped
}

/** Refuse to run outside a secure context, where WebCrypto is missing */
function checkSecureContext(): void {
  if ((globalThis as { isSecureContext?: unknown }).isSecureContext === false) { throw Throwers.insecureContext() }
}

// A root's tombstone is unborn as its shell is, since a birth writes over either: a live root box beside a gate not live is broken.
/** True where `roots` keep no live gate, and no live root box: the bank is unborn. */
function isUnbornIn({ gate, root }: ActualRoots): boolean { return (gate.am !== 'a') && (root.am !== 'a') }

/** The car `vaultMinder` keeps of each of `scope`'s bank's roots, undefined for none or for no VaultMinder */
function rootCarsOf(scope: BankScope, vaultMinder: VaultMinder | null): (ThingCar | undefined)[] {
  const scopes = rootScopesOf(scope)
  return [vaultMinder?.carAt(scopes.gate), vaultMinder?.carAt(scopes.root)]
}

// --

// == [Checks]: Checks

/** The checks of {@link Device.make}'s arguments, {@link Device.signin}'s, {@link Device.announce}'s and {@link tellBadNewsTo}'s. */
const Checks = Validator.Checkers('bad_record', ({ obj, arr, fn, custom, oneof, lit, union }) => ({
  userid:        BankishChecks.userid,
  deviceMakeArgs: obj({
    record: BankishChecks.deviceRecord,
    opts:   Validator.objCheck(() => ({
      vaultDB:          ThingChecks.vaultDBShape,
      keyDeriver:       custom<Deriver.KeyDeriver>(),
      strengthChecker:  custom<StrengthChecker>().optional(),
      logger:           custom<Logger.VaultLogger>().optional(),
      autolockMinutes:  VX.positiveMinutes.optional(),
      softlockMinutes:  VX.positiveMinutes.optional(),
      janitorMinutes:   VX.positiveMinutes.optional(),
      gateStaleMinutes: VX.positiveMinutes.optional(),
      onBadNews:        fn<BadNewsHandler>().optional(),
      onLifecycle:      fn<LifecycleHandler>().optional(),
      queryClient:      custom<QueryClient>(isQueryClient, Phrases.QueryClientExpected).optional(),
      rootShelf:        custom<RootShelf>(isRootShelf, Phrases.RootShelfExpected).optional(),
      deviceDB:         DeviceDBChecks.deviceDB.optional(),
      devicetok:        BankishChecks.devicetok.optional(),
    }), { refusalkind: 'bad_record' }),
  }),
  announcement:  union([
    obj({ kind: oneof(leasekindVals) }).strict(),
    obj({ kind: lit('stage_crossed'), from: oneof(bankStageVals), to: oneof(bankStageVals) }).strict(),
    obj({ kind: lit('watch_ended') }).strict(),
  ]),
  tellBadNewsToArgs: obj({
    onBadNews: fn<BadNewsHandler>(),
    device:    custom<Device>(),
    badnews:   arr(custom<Errors.VaultError>(Errors.isVaultError, PhrasesX.VaultErrorExpected)),
  }),
}))
// --
