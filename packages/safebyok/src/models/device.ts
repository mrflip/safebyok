import { QueryClient } from '@tanstack/query-core'
import { Consts, Deriver, Errors, type GX, Helpers, Logger, Phrases as PhrasesX, ReportError, VX, Validator } from 'safebyok-big/internals'
import type { Bank } from './bank'
import type { BirthGating } from './gating'
import { Proving, guardKeyDeriver } from './proving'
import { Vault } from './vault'
import { World } from './world'
import { BaseThing } from './base-thing'
import { DefaultStrengthChecker, guardStrengthChecker } from '../helpers/passphrase-strength'
import { guardRootShelf } from '../minding/root-shelf'
import { VaultTSQ } from '../minding/vault-tsq'
import { type BadNewsHandler, type DeviceJSON, type DeviceOpts, type DeviceRecord, type RootShelf, BankishChecks, isRootShelf } from '../shapes/shapes-bankish'
import { type MaskedView, EmptyMaskedView } from '../shapes/shapes-masked-view'
import { isQueryClient } from '../shapes/shapes-vault-tsq'
import type { BirthCleartexts, BirthDna, GuardedKeyDeriver, GuardedStrengthChecker, StrengthChecker } from '../shapes/shapes-gateish'
import type { BankScope } from '../shapes/shapes-stamps'
import type { Banklabel, DeviceTok, Userid } from '../shapes/primitives'
import type { VaultDB } from '../storage/vault-db'
import type { WorldRoots } from '../shapes/shapes-asks'
import { VaultMinder } from '../minding/vault-minder'
import { type Modelkind, ThingChecks } from '../shapes/shapes-thing'
import * as Phrases from '../phrases'
import * as Throwers from '../refusals/throwers'

// == [Defaults]: DefaultLeaseMillis

/** How long a lease lasts when the host gives no `autolockMinutes`: fourteen days. */
export const DefaultLeaseMillis = 14 * 24 * 60 * 60_000
// --
/** This browser, before and after anyone signs in: the host's functions, guarded, its world, and the signed-in user's bank and vault.
 * Make it with `Device.make(record, opts)`, which does no I/O, touches no browser global and subscribes to nothing; call
 * `hello()` to start it, `connect()` to keep it in step with the vaultDB until `disconnect()`, and `signin(userid)` once
 * the host knows who is signed in, which brings up that user's bank
 * from the roots kept on the host's root shelf. Its world's snapshot shows the stage `'signed_out'` until then, `'starting'` while it
 * starts the user's bank, then `'locked'` for a bank stored, or `'unborn'` for none, which a
 * {@link birthGating} on this device fills.
 * It serves the first user it is told of for its life: another user signing in is a sign-out, which the host answers by
 * reloading the page.
 */
export class Device {
  // == [Props]: banklabel, device_tok, vaultDB, keyDeriver, strengthChecker, logger, leaseMillis, #onBadNews, #rootShelf, #vaultTsqClient, #world, #userid, #vaultTSQ, #vault, #signinAnswer, #endCause, toJSON

  /** The label of the bank this device serves each user. */
  readonly banklabel:          Banklabel
  /** This device's token, recorded in each wayin it builds. */
  readonly device_tok:         DeviceTok
  // Hidden, so that a spread or a log line of the device passes by the host's objects and their guards.
  /** Where this device's banks are stored. */
  declare readonly vaultDB:            VaultDB
  declare readonly keyDeriver:         GuardedKeyDeriver
  declare readonly strengthChecker:    GuardedStrengthChecker
  declare readonly logger:             Logger.VaultLogger
  /** The autolock duration in milliseconds: how long a lease lasts on this device. */
  readonly leaseMillis:        number

  /** The host's `onBadNews`, or the default. */
  readonly #onBadNews: BadNewsHandler
  /** The host's root shelf, guarded, which the signed-in bank's roots are read from and put to, or null for none. */
  readonly #rootShelf: RootShelf | null
  /** The QueryClient the vault TSQ keeps the boxes in: the host's, or one made with the device. */
  readonly #vaultTsqClient: QueryClient
  /** The world of the signed-in user's bank, made with the device. */
  readonly #world: World
  /** The user signed in on this device, from `signin`. Null until then. */
  #userid: Userid | null = null
  /** The vault TSQ of the signed-in user's boxes, made as `signin` starts the bank. */
  #vaultTSQ: VaultTSQ | null = null
  /** The vault of the bank's boxes, made as `signin` starts the bank. */
  #vault: Vault | null = null
  /** What `signin` resolves, once it has been called. */
  #signinAnswer: Promise<void> | null = null
  /** Why the device ended, or null while it is enabled. */
  #endCause:   Errors.VaultError | null = null

  /** The user signed in on this device, its banklabel and its token, for `JSON.stringify`. */
  toJSON(): DeviceJSON {
    const { userid, banklabel, device_tok } = this
    return { userid, banklabel, device_tok }
  }
  // --

  // == [Getters]: userid, scope, autolockMinutes, vaultTsqClient, vaultTSQ, world, bank, vault

  /** The user signed in on this device, or null until `signin`. */
  get userid(): Userid | null { return this.#userid }

  /** The scope of the signed-in user's bank. Refuses `absent_vault` until `signin`. */
  get scope(): BankScope {
    if (this.#userid === null) { throw Throwers.nobodySignedIn() }
    return { userid: this.#userid, banklabel: this.banklabel }
  }

  /** The autolock duration in minutes, past which a lease no longer unlocks the bank. */
  get autolockMinutes(): number { return this.leaseMillis / Consts.MinuteMillis }

  /** The QueryClient the vault TSQ keeps the signed-in user's boxes in: `opts.queryClient`, the host's own, or one the device made. The same one from `Device.make` on. */
  get vaultTsqClient(): QueryClient { return this.#vaultTsqClient }

  /** The vault TSQ of the signed-in user's boxes, in {@link vaultTsqClient}. Refuses `absent_vault` until `signin`, and `disabled` until the sign-in has started the bank. */
  get vaultTSQ(): VaultTSQ {
    if (this.#userid === null) { throw Throwers.nobodySignedIn() }
    if (this.#vaultTSQ === null) { throw Throwers.signinUnanswered() }
    return this.#vaultTSQ
  }

  /** The world of the signed-in user's bank: what locks, unlocks and ends it, holds its lease, and has the snapshot a host renders. The same one from `Device.make` on. */
  get world(): World { return this.#world }

  /** The signed-in user's bank, or null until its world has it live, with its main gate and root box: found stored, or born on this device. */
  get bank(): Bank | null { return this.#world.areRootsLive ? this.#world.bank : null }

  /** The vault of this device's bank's boxes, or null until `signin` starts the bank. The same one from then on.
   * Its verbs refuse `absent_thing` while {@link bank} is null.
   */
  get vault(): Vault | null { return this.#vault }
  // --

  // == [Construction]: make, constructor

  /** Make a device of the banklabel and token in `record`, guarding the host's functions in `opts`, with nobody signed in.
   * The signed-in user's boxes are kept in `opts.queryClient`, the host's own, under the bank's key, or in a QueryClient the
   * device makes: {@link vaultTsqClient}. The signed-in bank's roots are read from `opts.rootShelf` at {@link signin}.
   * Nothing is fetched from the vaultDB until then, and nothing is watched until the device is both signed in and {@link connect}ed.
   */
  static make(record: DeviceRecord, opts: DeviceOpts): Device { return new Device(record, opts) }

  private constructor(record: DeviceRecord, opts: DeviceOpts) {
    const { record: { banklabel, device_tok }, opts: { vaultDB, keyDeriver, strengthChecker = DefaultStrengthChecker, logger, autolockMinutes, onBadNews = DefaultOnBadNews, queryClient = new QueryClient(), rootShelf } } = Checks.deviceMakeArgs.parse({ record, opts })
    this.banklabel = banklabel
    this.device_tok = device_tok
    Helpers.decorate<Device>(this, { vaultDB, keyDeriver: guardKeyDeriver(keyDeriver), strengthChecker: guardStrengthChecker(strengthChecker), logger: Logger.parseLogger(logger) })
    this.leaseMillis = millisOf(autolockMinutes, DefaultLeaseMillis)
    this.#onBadNews = onBadNews
    this.#rootShelf = (rootShelf === undefined) ? null : guardRootShelf(rootShelf, (news) => { this.tellBadNews([news]) })
    this.#vaultTsqClient = queryClient
    this.#world = World.make({ device: this })
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

  // == [Starting]: hello, signin, birthGating, gatingBirthAttempt, #doSignin

  /** Start the device. It resolves at once, and never rejects.
   * Refuses `insecure_context` outside a secure context, where WebCrypto is missing.
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
    this.#world.align()
    this.#signinAnswer = this.#doSignin()
    return this.#signinAnswer
  }

  /** The gating of a birth of this device's bank over `params`, for a form mutation to attempt: the bank it births is then this device's, unlocked.
   * Call it once `signin` shows the stage `'unborn'`. See {@link Bank.birth} for what the birth refuses.
   */
  birthGating(params: FormData | BirthDna | BirthCleartexts): BirthGating {
    // Made before the stage is checked, so a refusal here zeroes the host's passkey answer, and empties a form's secret
    // fields, as every gating does (G2).
    const gating = this.#world.birthGating(params)
    if (['signed_out', 'starting'].includes(this.#world.getSnapshot().stage)) {
      gating.vacate()
      throw Throwers.signinUnanswered()
    }
    return gating
  }

  /** Birth this device's bank under the new `passphrase`, and a new passkey's answer if given, in a form or a dna, as {@link Bank.birth} does: the bank is then this device's, unlocked.
   * A `FormData` loses its `passphrase`, `nextPassphrase` and `confirmation` fields before anything is awaited; its other fields stay. A dna's fields are never changed, but a passkey answer's PRF bytes are zeroed.
   * @example
   *   await device.gatingBirthAttempt(new FormData(formEl))
   */
  async gatingBirthAttempt(params: FormData | BirthDna): Promise<Bank> { return await this.birthGating(params).attempt() }

  // The roots fetched land in the world's Things, which the stage is read from. A root its Thing refuses reaches the host
  // once, as bad news told by the VaultMinder; sign-in then reports only what the roots amount to: all three live, the
  // bank unborn, or broken. A failure to fetch them, once a bank is up from what was restored, is no caller's to hear.
  // The VaultMinder is made right before the vault TSQ and the world listen to it, with nothing awaited between: its
  // cars remember what they take, so a record it took with no one listening would reach them later only as a repeat,
  // which it drops. The world takes the roots shelved before the vaultDB is asked. The vault is made last, on everything
  // made before it.
  /** Start the signed-in user's bank over a VaultMinder of it: from the roots shelved, where there are any, and from the three roots the vaultDB answers. */
  async #doSignin(): Promise<void> {
    try {
      const vaultMinder = VaultMinder.make(this.scope, { vaultDB: this.vaultDB, world: this.#world })
      this.#vaultTSQ = VaultTSQ.make({ vaultMinder, queryClient: this.#vaultTsqClient, scope: this.scope, onBadNews: (news) => { this.tellBadNews([news]) } })
      this.#world.signin(vaultMinder, this.#rootShelf)
      this.#vault = Vault.make(this.#world, this.#vaultTSQ)
      const answer = await vaultMinder.tryGetWorldOnce()
      if (! answer.ok) { throw answer.err }
      // A root void at signin is no newer than the shell its Thing holds, so no subscriber hears it: the world is told here.
      this.#world.align()
      if (! (this.#world.areRootsLive || isUnbornIn(answer.val))) { throw Throwers.bankRootsMissing() }
    } catch (err) {
      if (this.bank !== null) {
        this.tellBadNews([err])
        return
      }
      this.#world.showSigninRefusal(err)
    }
  }
  // --

  // == [Locking and connecting]: lock, connect, disconnect

  /** Lock the signed-in user's bank ({@link World.lock}). Never throws. */
  lock(): this {
    this.#world.lock()
    return this
  }

  // Call it as a QueryClient's `mount` is called, from an effect whose cleanup calls `disconnect`.
  /** Keep the device in step with the vaultDB: watch the signed-in user's bank there, from now or from `signin` ({@link World.connect}). Never throws, and a second call does nothing.
   * @example
   *   useEffect(() => { device.connect(); return () => { device.disconnect() } }, [device])
   */
  connect(): this {
    this.#world.connect()
    return this
  }

  /** Lock the signed-in user's bank, and stop watching the vaultDB, until the next {@link connect} ({@link World.disconnect}). Never throws, and a second call does nothing.
   * The device stays enabled: its verbs still work, and a call waiting for an `unlock` gating still waits.
   */
  disconnect(): this {
    this.#world.disconnect()
    return this
  }
  // --

  // == [Telling the host]: tellBadNews

  /** Tell the host's `onBadNews` of failures no caller is waiting on. Never throws.
   * Anything but a refusal is told as `unexpected_error`, and a `disabled` refusal is dropped. Once the device ends, the
   * default handler is called instead of the host's.
   */
  tellBadNews(badnews: readonly unknown[]): void {
    const refusals = badnews.map((news) => Throwers.refusalOfThrown(news))
    // A thing disabled since is no news: its bank went away.
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

  // == [A devtool's view]: inspectable

  /** Safe view of the device, for logging and debugging.
   * It has the bank's roots (`bankTSQ`) and the vault TSQ, each ciphertext masked, and the lease's loggable and when it ends, never its key material. Before `signin`, it answers {@link EmptyMaskedView}.
   * For experimenting, never for an app's own logic: what it answers may change without notice.
   */
  inspectable(): MaskedView {
    if (this.#userid === null) { return EmptyMaskedView }
    const { bank, gate, rootBox } = this.#world
    return {
      bankTSQ:  [bank, gate, rootBox].filter((thing) => thing !== null).flatMap((thing) => this.#world.vaultMinder?.carAt(thing)?.inspectable() ?? []),
      vaultTSQ: this.#vaultTSQ?.inspectable() ?? [],
      lease:    this.#world.inspectable(),
    }
  }
  // --
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

// == [Helpers]: millisOf, checkSecureContext, isUnbornIn

// A host's Infinity minutes, for never, becomes ForeverMillis: past the entrypoint, nothing is infinite.
/** `minutes` in milliseconds, capped at `ForeverMillis`, or `fallback` for none. */
function millisOf(minutes: number | undefined, fallback: number): number { return (minutes === undefined ? fallback : Math.min(Math.round(minutes * Consts.MinuteMillis), Consts.ForeverMillis)) }

/** Refuse to run outside a secure context, where WebCrypto is missing */
function checkSecureContext(): void {
  if ((globalThis as { isSecureContext?: unknown }).isSecureContext === false) { throw Throwers.insecureContext() }
}

// A bank's tombstone alone is unborn too: a root stored beside a bank not live is broken.
/** True where `roots` keep no live bank, and no main gate or root box: the bank is unborn. */
function isUnbornIn({ bank, gate, root }: WorldRoots): boolean { return (bank.am !== 'a') && BaseThing.isVoidSentinel(gate) && BaseThing.isVoidSentinel(root) }

// --

// == [Checks]: Checks

/** The checks of {@link Device.make}'s arguments, {@link Device.signin}'s, and {@link tellBadNewsTo}'s. */
const Checks = Validator.Checkers('bad_record', ({ obj, arr, fn, custom }) => ({
  userid:        BankishChecks.userid,
  deviceMakeArgs: obj({
    record: BankishChecks.deviceRecord,
    opts:   Validator.objCheck(() => ({
      vaultDB:         ThingChecks.vaultDBShape,
      keyDeriver:      custom<Deriver.KeyDeriver>(),
      strengthChecker: custom<StrengthChecker>().optional(),
      logger:          custom<Logger.VaultLogger>().optional(),
      autolockMinutes: VX.positiveMinutes.optional(),
      onBadNews:       fn<BadNewsHandler>().optional(),
      queryClient:     custom<QueryClient>(isQueryClient, Phrases.QueryClientExpected).optional(),
      rootShelf:       custom<RootShelf>(isRootShelf, Phrases.RootShelfExpected).optional(),
      // Ignored: the new core has no device database. Accepted so that `...browserOpts()` from safebyok/browser, which carries one, spreads in.
      deviceDB:        custom<unknown>().optional(),
    }), { refusalkind: 'bad_record' }),
  }),
  tellBadNewsToArgs: obj({
    onBadNews: fn<BadNewsHandler>(),
    device:    custom<Device>(),
    badnews:   arr(custom<Errors.VaultError>(Errors.isVaultError, PhrasesX.VaultErrorExpected)),
  }),
}))
// --
