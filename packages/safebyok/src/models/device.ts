import type { QueryClient } from '@tanstack/query-core'
import { isEqual } from 'es-toolkit'
import { Consts, Deriver, Errors, type GX, Logger, Outcome, Phrases as PhrasesX, ReportError, VX, Validator } from 'safebyok-big/internals'
import { Bank } from './bank'
import { Gate } from './gate'
import type { BirthGating } from './gating'
import { Proving, guardKeyDeriver } from './proving'
import { Vault } from './vault'
import { DefaultStrengthChecker, guardStrengthChecker } from '../helpers/passphrase-strength'
import { BankMinder } from '../minding/bank-minder'
import { VaultMinder } from '../minding/vault-minder'
import { useridsCachedIn } from '../minding/minder-keys'
import { type BadNewsHandler, type BankAskDraft, type BankSnapshot, type DeviceJSON, type DeviceOpts, type DeviceRecord, type DeviceSnapshot, type RefusalSnapshot, BankishChecks, PendingBank, SignedOutBank } from '../shapes/shapes-bankish'
import { type BankRoots, type GetAsk, type ListAsk, getAskOf, listAskOf } from '../shapes/shapes-asks'
import { type MinderFriend, type QueryCacheOpts, MinderChecks } from '../shapes/shapes-minder'
import type { BirthCleartexts, GuardedKeyDeriver, GuardedStrengthChecker, StrengthChecker } from '../shapes/shapes-gateish'
import type { BankScope } from '../shapes/shapes-stamps'
import type { Banklabel, DeviceTok, Userid } from '../shapes/primitives'
import type { VaultDB } from '../storage/vault-db'
import { type DevicePersisters, type Persister, type PersisterOfBank, isPersister } from '../storage/persister'
import { type Modelkind, ThingChecks } from '../shapes/shapes-thing'
import * as Throwers from '../refusals/throwers'
import * as Phrases from '../phrases'

// == [Defaults]: DefaultLeaseMillis

/** How long a lease lasts when the host gives no `autolockMinutes`: fourteen days. */
export const DefaultLeaseMillis = 14 * 24 * 60 * 60_000
// --
/** This browser, before and after anyone signs in: the host's functions, guarded, the minders, and the signed-in user's bank and vault.
 * Make it with `Device.make(record, opts)`, which does no I/O, touches no browser global and subscribes to nothing; call
 * `hello()` to start it, which restores its roots' cache from the host's persisters, and `signIn(userid)` once the host
 * knows who is signed in, which restores that user's boxes. Its snapshot's stage is `'signed_out'` until then,
 * `'starting'` while it restores its caches and brings up the user's bank, then `'locked'` for a bank stored, or
 * `'unborn'` for none, which a {@link birthGating} on this device fills.
 * It serves the first user it is told of for its life: another user signing in is a sign-out, which the host answers by
 * reloading the page.
 */
export class Device implements MinderFriend {
  // == [Props]: banklabel, device_tok, vaultDB, keyDeriver, strengthChecker, logger, leaseMillis, #onBadNews, #queryCacheOpts, #persisters, #bankClient, #bankMinder, #queryClient, #userid, #minder, #bank, #vault, #started, #broughtUp, #banklessSnapshot, #endCause, #snapshot, #subscribers, #getSnapshot, #subscribe, toJSON

  /** The label of the bank this device serves each user. */
  readonly banklabel:          Banklabel
  /** This device's token, recorded in each wayin it builds. */
  readonly device_tok:         DeviceTok
  /** Where this device's banks are stored. */
  readonly vaultDB:            VaultDB
  readonly keyDeriver:         GuardedKeyDeriver
  readonly strengthChecker:    GuardedStrengthChecker
  readonly logger:             Logger.VaultLogger
  /** The autolock duration in milliseconds: how long a lease lasts on this device. */
  readonly leaseMillis:        number

  /** The host's `onBadNews`, or the default. */
  readonly #onBadNews: BadNewsHandler
  /** The cache options of the signed-in user's VaultMinder, which {@link queryClient} takes for its boxes. */
  readonly #queryCacheOpts: QueryCacheOpts
  /** The host's persisters, which the roots' QueryClient and the signed-in bank's boxes are restored from and saved to, or undefined for none. */
  readonly #persisters: DevicePersisters | undefined
  /** The QueryClient each user's BankMinder caches the bank's roots in, made with the device, empty. */
  readonly #bankClient: QueryClient
  /** The minder of the signed-in user's bank's roots: the bank, its main gate and its root box, made at `signIn`. Null until then. */
  #bankMinder: BankMinder | null = null
  /** The QueryClient each user's VaultMinder caches boxes in, made with the device, empty. */
  readonly #queryClient: QueryClient
  /** The user signed in on this device, from `signIn`. Null until then. */
  #userid: Userid | null = null
  /** The minder of the signed-in user's boxes, which this device is the friend of, made at `signIn`. Null until then. */
  #minder: VaultMinder | null = null
  /** The signed-in user's bank, from when the device finds it stored or a birth on this device makes it. Null until then. */
  #bank:  Bank | null = null
  /** The vault of the bank's boxes, made with the bank. */
  #vault: Vault | null = null
  /** What `hello` resolves, once it has been called. */
  #started: Promise<void> | null = null
  /** What `signIn` resolves, once it has been called. */
  #broughtUp: Promise<void> | null = null
  /** The bank snapshot shown while the device has no bank: {@link SignedOutBank}, then {@link PendingBank} from `signIn`, then `'unborn'` or `'failed'` as it finds. */
  #banklessSnapshot: BankSnapshot = SignedOutBank
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

  /** The user signed in on this device, its banklabel and its token, for `JSON.stringify`. */
  toJSON(): DeviceJSON {
    const { userid, banklabel, device_tok } = this
    return { userid, banklabel, device_tok }
  }
  // --

  // == [Getters]: userid, scope, autolockMinutes, useridsSeen, bankMinder, queryClient, minder, bank, vault, getSnapshot, subscribe

  /** The user signed in on this device, or null until `signIn`. */
  get userid(): Userid | null { return this.#userid }

  /** The scope of the signed-in user's bank. Refuses `absent_vault` until `signIn`. */
  get scope(): BankScope {
    if (this.#userid === null) { throw Throwers.nobodySignedIn() }
    return { userid: this.#userid, banklabel: this.banklabel }
  }

  /** The autolock duration in minutes, past which a lease no longer unlocks the bank. */
  get autolockMinutes(): number { return this.leaseMillis / Consts.MinuteMillis }

  // Read from the keys of what the roots' client caches: each user signed in here whose bank's roots were heard of, stored or not.
  /** The userids this device has cached a bank of, on this page or, once `hello` resolves, on any page its persisters kept. */
  useridsSeen(): Userid[] { return useridsCachedIn(this.#bankClient) }

  // Refusing rather than null, as `minder` does: a bank, its gate and their gatings exist only once someone is signed in, and read it unchecked.
  /** The minder of the signed-in user's bank's roots: its bank, main gate and root box, as last heard of. Refuses `absent_vault` until `signIn`. */
  get bankMinder(): BankMinder {
    if (this.#bankMinder === null) { throw Throwers.nobodySignedIn() }
    return this.#bankMinder
  }
  /** The QueryClient the signed-in user's boxes are cached in: the same one from `Device.make` on, empty until `signIn`, for hooks to observe. */
  get queryClient(): QueryClient { return this.#queryClient }

  /** The minder of the signed-in user's boxes. Refuses `absent_vault` until `signIn`. */
  get minder(): VaultMinder {
    if (this.#minder === null) { throw Throwers.nobodySignedIn() }
    return this.#minder
  }

  /** The signed-in user's bank, or null until the device finds it stored or a birth on this device makes it. */
  get bank(): Bank | null { return this.#bank }

  /** The vault of this device's bank's boxes, or null while the device has no bank. */
  get vault(): Vault | null { return this.#vault }

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

  /** Make a device of the banklabel and token in `record`, guarding the host's functions in `opts`, with nobody signed in.
   * It makes the two QueryClients its users' minders cache in, empty: one for the bank's roots, and {@link queryClient} for its boxes.
   * The roots are restored from `opts.persisters` at {@link hello}, and the signed-in bank's boxes at {@link signIn}, and
   * nothing is fetched from the vaultDB until `signIn`.
   */
  static make(record: DeviceRecord, opts: DeviceOpts): Device { return new Device(record, opts) }

  private constructor(record: DeviceRecord, opts: DeviceOpts) {
    const { record: { banklabel, device_tok }, opts: { vaultDB, keyDeriver, strengthChecker = DefaultStrengthChecker, logger, autolockMinutes, onBadNews = DefaultOnBadNews, queryCacheOpts, persisters } } = Checks.deviceMakeArgs.parse({ record, opts })
    this.banklabel = banklabel
    this.device_tok = device_tok
    this.vaultDB = vaultDB
    this.keyDeriver = guardKeyDeriver(keyDeriver)
    this.strengthChecker = guardStrengthChecker(strengthChecker)
    this.logger = Logger.parseLogger(logger)
    this.leaseMillis = millisOf(autolockMinutes, DefaultLeaseMillis)
    this.#onBadNews = onBadNews
    this.#queryCacheOpts = queryCacheOpts
    this.#persisters = persisters
    // The roots cache in a client of their own: the main gate's wrapped bankKeys stay out of the client a host observes.
    this.#bankClient = BankMinder.makeClient()
    this.#queryClient = VaultMinder.makeClient()
    this.#snapshot = this.#makeSnapshot()
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

  // == [Starting]: hello, #restore, #restoreBoxes, signIn, birthGating, #bringUp, #attachWorld, #attachBank

  /** Start the device, resolving once its roots' cache is restored from the host's persisters, and saved to them from then on. Never rejects, and each later call resolves as the first.
   * A restore that fails is told to `onBadNews`, and the cache starts empty.
   * Refuses `insecure_context` outside a secure context, where WebCrypto is missing.
   */
  hello(): Promise<void> {
    checkSecureContext()
    this.#started ??= this.#restore()
    return this.#started
  }

  // Before anything speaks to the vaultDB: a minder says hello only once this has resolved, so what it caches lands over what was restored.
  /** Restore the roots' QueryClient from its persister, and save it there from then on, telling `onBadNews` if it fails to restore. */
  async #restore(): Promise<void> {
    if (this.#persisters === undefined) { return }
    try {
      await BankMinder.persist(this.#bankClient, this.#persisters.roots)
    } catch (err) {
      this.tellBadNews([Outcome.storageRefusalOf(err)])
    }
  }

  // Before the VaultMinder says hello, so what it caches lands over what was restored.
  /** Restore the boxes of the bank at `scope` from the persister the host gives for it, and save them there from then on, telling `onBadNews` if it fails to restore. */
  async #restoreBoxes(scope: BankScope): Promise<void> {
    if (this.#persisters === undefined) { return }
    try {
      const persister = Checks.persister.parse(this.#persisters.boxes(scope))
      await VaultMinder.persist(this.#queryClient, persister, scope)
    } catch (err) {
      this.tellBadNews([Outcome.storageRefusalOf(err)])
    }
  }

  /** Tell the device who is signed in, and bring up that user's bank: resolves once the snapshot shows `'locked'`, `'unborn'` or `'failed'` (with `lastErr`). Never rejects.
   * It starts the device first, as {@link hello} does, then restores the bank's boxes. Where the device has cached the
   * bank's world, the bank comes up `'locked'` from it at once, and unlocks on its cached gate, before the vaultDB answers.
   * Each later call resolves as the first, whatever userid it is handed: the device serves its first user for its life.
   */
  signIn(userid: Userid): Promise<void> {
    const signedIn = Checks.userid.parse(userid)
    checkSecureContext()
    if (this.#broughtUp !== null) { return this.#broughtUp }
    this.#userid = signedIn
    const { vaultDB } = this
    this.#bankMinder = BankMinder.make({ vaultDB, queryClient: this.#bankClient }, this)
    this.#minder = VaultMinder.make({ vaultDB, queryCacheOpts: this.#queryCacheOpts, queryClient: this.#queryClient }, this)
    this.#banklessSnapshot = PendingBank
    this.#align()
    this.#broughtUp = this.#bringUp(this.#bankMinder, this.#minder)
    return this.#broughtUp
  }

  /** The gating of a birth of this device's bank, for a form mutation to attempt: the bank it births is then this device's, unlocked.
   * Call it once `signIn` shows the stage `'unborn'`. See {@link Bank.birth} for what the birth refuses.
   */
  birthGating(cleartexts: BirthCleartexts): BirthGating {
    // Made before the stage is checked, so a refusal here zeroes the host's passkey answer as every gating does (G2).
    const gating = Bank.birthGating(this, cleartexts, (bank) => { this.#attachBank(bank) })
    if (['signed_out', 'starting'].includes(this.#snapshot.bank.stage)) {
      gating.vacate()
      throw Throwers.bankNotBroughtUp()
    }
    return gating
  }

  // The world fetched lands in the BankMinder, where a bank brought up from the cache reads it; a failure to fetch it,
  // once that bank is up, is no caller's to hear.
  /** Bring up the signed-in user's bank, with `bankMinder` minding its roots and `minder` its boxes: from the world cached, where there is one, and from the world the vaultDB answers. */
  async #bringUp(bankMinder: BankMinder, minder: VaultMinder): Promise<void> {
    try {
      await this.hello()
      await this.#restoreBoxes(this.scope)
      bankMinder.hello()
      minder.hello()
      const cached = bankMinder.worldAt()
      if ((cached !== undefined) && Bank.isLive(cached.bank)) { this.#attachWorld(cached) }
      const world = await bankMinder.fetchWorld()
      if (this.#bank !== null) { return }
      if ((world === null) || (! Bank.isLive(world.bank))) {
        this.#banklessSnapshot = Object.freeze({ ...PendingBank, stage: 'unborn' })
        this.#align()
        return
      }
      this.#attachWorld(world)
    } catch (err) {
      if (this.#bank !== null) {
        this.tellBadNews([err])
        return
      }
      this.#banklessSnapshot = Object.freeze({ ...PendingBank, stage: 'failed', lastErr: refusalSnapshotOf(err) })
      this.#align()
    }
  }

  // Gate.make checks the gate and Bank.make the root box: a tombstone of either refuses.
  /** Make the bank of `world`, and its main gate, this device's bank. */
  #attachWorld(world: BankRoots): void {
    const { vaultDB } = this
    const gate = Gate.make(world.gate, { device: this, vaultDB, bankStamp: world.bank })
    this.#attachBank(Bank.make(world.bank, { device: this, vaultDB, gate }))
  }

  // The bank's own sweep clears its subscribers, so nothing here unsubscribes.
  /** Make `bank` this device's bank. */
  #attachBank(bank: Bank): void {
    this.#bank  = bank
    this.#vault = Vault.make(bank, this.minder)
    bank.subscribe(this.#align)
    this.#align()
  }
  // --

  // == [Locking]: lock

  /** Lock the signed-in user's bank, if the device has one. Never throws. */
  lock(): this {
    this.#bank?.lock()
    return this
  }
  // --

  // == [Ending]: sweep

  /** Sweep the signed-in user's bank, if the device has one. Never throws.
   * The device stays usable: it judges passphrases. Its snapshot shows the swept bank.
   */
  sweep(): this {
    this.#bank?.sweep()
    return this
  }
  // --

  // == [The minder's friend]: makeGetAsk, makeListAsk
  // The bank's builders where the device has one, so that each ask tracks the bank, its main gate and its root box; until then, asks that track nothing.

  /** The get ask for the Thing at `ask.labelpath` in the signed-in user's bank scope. */
  makeGetAsk(ask: BankAskDraft): GetAsk { return this.#bank?.makeGetAsk(ask) ?? getAskOf({ ...ask, ...this.scope }) }

  /** The list ask for the children of the Thing at `ask.labelpath` in the signed-in user's bank scope. */
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

/** The checks of {@link Device.make}'s arguments, {@link Device.signIn}'s and {@link tellBadNewsTo}'s. */
const Checks = Validator.Checkers('bad_record', ({ obj, arr, fn, custom }) => ({
  userid:        BankishChecks.userid,
  persister:     custom<Persister>(isPersister, Phrases.PersisterExpected),
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
      persisters:      obj({ roots: custom<Persister>(isPersister, Phrases.PersisterExpected), boxes: fn<PersisterOfBank>() }).optional(),
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
