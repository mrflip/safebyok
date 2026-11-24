import { QueryClient } from '@tanstack/query-core'
import { isEqual } from 'es-toolkit'
import { Consts, Deriver, Errors, type GX, Helpers, Logger, Outcome, Phrases as PhrasesX, ReportError, VX, Validator } from 'safebyok-big/internals'
import type { Bank } from './bank'
import type { BirthGating } from './gating'
import { Proving, guardKeyDeriver } from './proving'
import { Vault } from './vault'
import { World } from './world'
import { DefaultStrengthChecker, guardStrengthChecker } from '../helpers/passphrase-strength'
import { BankMinder } from '../minding/bank-minder'
import { VaultMinder } from '../minding/vault-minder'
import { VaultTSQ } from '../minding/vault-tsq'
import { type BadNewsHandler, type DeviceJSON, type DeviceOpts, type DeviceRecord, type DeviceSnapshot, BankishChecks } from '../shapes/shapes-bankish'
import { type MaskedView, type MaskedViewLease, type MinderFriend, EmptyMaskedView } from '../shapes/shapes-minder'
import { isQueryClient } from '../shapes/shapes-vault-tsq'
import type { BirthCleartexts, BirthDna, GuardedKeyDeriver, GuardedStrengthChecker, StrengthChecker } from '../shapes/shapes-gateish'
import type { BankScope } from '../shapes/shapes-stamps'
import type { Banklabel, DeviceTok, Lifetok, Userid } from '../shapes/primitives'
import type { ReadTc, VaultDB } from '../storage/vault-db'
import { SortedVaultDB } from '../storage/sorted-vault-db'
import { itemSeenOf } from '../storage/agerank'
import { readTcNow } from '../storage/thing-classifier'
import { Labelpath } from '../shapes/primitives'
import type { VaultEvent } from '../shapes/shapes-vault-event'
import type { DevicePersisters, PersisterOfBank } from '../storage/persister'
import { type Modelkind, type ThingRecord, ThingChecks } from '../shapes/shapes-thing'
import * as Phrases from '../phrases'
import * as Throwers from '../refusals/throwers'

// == [Defaults]: DefaultLeaseMillis

/** How long a lease lasts when the host gives no `autolockMinutes`: fourteen days. */
export const DefaultLeaseMillis = 14 * 24 * 60 * 60_000
// --
/** This browser, before and after anyone signs in: the host's functions, guarded, the minders, its world, and the signed-in user's bank and vault.
 * Make it with `Device.make(record, opts)`, which does no I/O, touches no browser global and subscribes to nothing; call
 * `hello()` to start it, and `signin(userid)` once the host knows who is signed in, which restores that user's caches
 * from the host's persisters. Its snapshot's stage is `'signed_out'` until then, `'starting'` while it restores the
 * caches and starts the user's bank, then `'locked'` for a bank stored, or `'unborn'` for none, which a
 * {@link birthGating} on this device fills.
 * It serves the first user it is told of for its life: another user signing in is a sign-out, which the host answers by
 * reloading the page.
 */
export class Device implements MinderFriend {
  // == [Props]: banklabel, device_tok, vaultDB, keyDeriver, strengthChecker, logger, leaseMillis, #onBadNews, #persisters, #bankMinder, #minder, #tsqClient, #world, #userid, #vaultTSQ, #vault, #signinAnswer, #endCause, #snapshot, #subscribers, #getSnapshot, #subscribe, toJSON

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
  /** The host's persisters, which the signed-in bank's caches are restored from and saved to, or undefined for none. */
  readonly #persisters: DevicePersisters | undefined
  /** The minder of the signed-in user's bank's roots: the bank, its main gate and its root box, made with the device, which is its friend. */
  readonly #bankMinder: BankMinder
  /** The minder of the signed-in user's boxes, made with the device, which is its friend. */
  readonly #minder: VaultMinder
  /** The QueryClient the vault TSQ keeps the boxes in: the host's, or one made with the device. */
  readonly #tsqClient: QueryClient
  /** The world of the signed-in user's bank, made with the device. */
  readonly #world: World
  /** The user signed in on this device, from `signin`. Null until then. */
  #userid: Userid | null = null
  /** The vault TSQ of the signed-in user's boxes, made as `signin` starts the bank. */
  #vaultTSQ: VaultTSQ | null = null
  /** The vault of the bank's boxes, made once the bank is. */
  #vault: Vault | null = null
  /** What `signin` resolves, once it has been called. */
  #signinAnswer: Promise<void> | null = null
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

  // == [Getters]: userid, scope, autolockMinutes, bankMinder, vaultTsqClient, tsqClient, vaultTSQ, minder, world, bank, vault, getSnapshot, subscribe

  /** The user signed in on this device, or null until `signin`. */
  get userid(): Userid | null { return this.#userid }

  /** The scope of the signed-in user's bank. Refuses `absent_vault` until `signin`. */
  get scope(): BankScope {
    if (this.#userid === null) { throw Throwers.nobodySignedIn() }
    return { userid: this.#userid, banklabel: this.banklabel }
  }

  /** The autolock duration in minutes, past which a lease no longer unlocks the bank. */
  get autolockMinutes(): number { return this.leaseMillis / Consts.MinuteMillis }

  // Refusing rather than null, as `minder` does: a bank, its gate and their gatings exist only once someone is signed in, and read it unchecked.
  /** The minder of the signed-in user's bank's roots: its bank, main gate and root box, as last heard of. Refuses `absent_vault` until `signin`. */
  get bankMinder(): BankMinder {
    if (this.#userid === null) { throw Throwers.nobodySignedIn() }
    return this.#bankMinder
  }
  // Scaffolding until safebyok-react-lean's hooks read the vault TSQ: the old minder's own client, which they observe.
  /** The QueryClient of the minder of the signed-in user's boxes: the same one from `Device.make` on, empty until `signin`, for hooks to observe. */
  get vaultTsqClient(): QueryClient { return this.#minder.tsqClient }

  /** The QueryClient the vault TSQ keeps the signed-in user's boxes in: `opts.queryClient`, the host's own, or one the device made. The same one from `Device.make` on. */
  get tsqClient(): QueryClient { return this.#tsqClient }

  /** The vault TSQ of the signed-in user's boxes, in {@link tsqClient}. Refuses `absent_vault` until `signin`, and `disabled` until the sign-in has restored the bank's caches. */
  get vaultTSQ(): VaultTSQ {
    if (this.#userid === null) { throw Throwers.nobodySignedIn() }
    if (this.#vaultTSQ === null) { throw Throwers.signinUnanswered() }
    return this.#vaultTSQ
  }

  /** The minder of the signed-in user's boxes. Refuses `absent_vault` until `signin`. */
  get minder(): VaultMinder {
    if (this.#userid === null) { throw Throwers.nobodySignedIn() }
    return this.#minder
  }

  /** The world of the signed-in user's bank: what locks, unlocks and ends it, and holds its lease. The same one from `Device.make` on. */
  get world(): World { return this.#world }

  /** The signed-in user's bank, or null until its world has it live, with its main gate and root box: found stored, or born on this device. */
  get bank(): Bank | null { return this.#world.areRootsLive ? this.#world.bank : null }

  /** The vault of this device's bank's boxes, or null while the device has no bank. */
  get vault(): Vault | null { return this.#vault }

  /** This device's snapshot getter, already bound, as `useSyncExternalStore` wants it.
   * It returns the same frozen object until something in the snapshot changes. The snapshot includes the world's, so one
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
   * The signed-in user's boxes are kept in `opts.queryClient`, the host's own, under the bank's key, or in a QueryClient the
   * device makes: {@link tsqClient}. The signed-in bank's caches are restored from `opts.persisters` at {@link signin}, and
   * nothing is fetched from the vaultDB, or watched, until then.
   */
  static make(record: DeviceRecord, opts: DeviceOpts): Device { return new Device(record, opts) }

  private constructor(record: DeviceRecord, opts: DeviceOpts) {
    const { record: { banklabel, device_tok }, opts: { vaultDB, keyDeriver, strengthChecker = DefaultStrengthChecker, logger, autolockMinutes, onBadNews = DefaultOnBadNews, queryClient = new QueryClient(), persisters } } = Checks.deviceMakeArgs.parse({ record, opts })
    this.banklabel = banklabel
    this.device_tok = device_tok
    Helpers.decorate<Device>(this, { vaultDB, keyDeriver: guardKeyDeriver(keyDeriver), strengthChecker: guardStrengthChecker(strengthChecker), logger: Logger.parseLogger(logger) })
    this.leaseMillis = millisOf(autolockMinutes, DefaultLeaseMillis)
    this.#onBadNews = onBadNews
    this.#persisters = persisters
    // The roots cache in a minder of their own: the main gate's wrapped bankKeys stay out of the client a host observes.
    this.#bankMinder = BankMinder.make({}, this)
    // Scaffolding until safebyok-react-lean's hooks read the vault TSQ: the minders keep the caches they read and persist.
    this.#minder = VaultMinder.make({}, this)
    this.#tsqClient = queryClient
    this.#world = World.make({ device: this })
    this.#snapshot = this.#makeSnapshot()
    this.#world.subscribe(this.#align)
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

  // == [Starting]: hello, #restore, #receiveRestored, signin, birthGating, gatingBirthAttempt, #doSignin

  /** Start the device. It resolves at once, and never rejects.
   * Refuses `insecure_context` outside a secure context, where WebCrypto is missing.
   */
  hello(): Promise<void> {
    checkSecureContext()
    return Promise.resolve()
  }

  // Before the minder says hello, so what it caches lands over what was restored.
  /** Restore `minder`'s cache from the persister `persisterOf` gives the signed-in bank, and save it there from then on, telling `onBadNews` if it fails to restore. */
  async #restore(minder: BankMinder | VaultMinder, persisterOf: PersisterOfBank | undefined): Promise<void> {
    if (persisterOf === undefined) { return }
    try {
      await minder.persist(persisterOf(this.scope))
    } catch (err) {
      this.tellBadNews([Outcome.storageRefusalOf(err)])
    }
  }

  // Scaffolding until the LocalBridge restores the Things: the persisters restore into the minders, whose records reach the
  // Things here. Each box record is told apart, so a damaged one is news, and the rest still reach their Things.
  /** Hand `sortedVaultDB` what `bankMinder` and `minder` restored: the bank's roots, where all three were cached, and each record of a box. */
  #receiveRestored(sortedVaultDB: SortedVaultDB, bankMinder: BankMinder, minder: VaultMinder): void {
    const read_tc = readTcNow()
    const roots   = bankMinder.worldAt()
    const banktok = roots?.bank.lifetok
    if (roots !== undefined) {
      for (const root of [roots.bank, roots.gate, roots.root]) { sortedVaultDB.receive(restoredEventOf(root, read_tc, banktok)) }
    }
    for (const { state } of minder.tsqClient.getQueryCache().getAll()) {
      if (! isRestoredBox(state.data)) { continue }
      try { sortedVaultDB.receive(restoredEventOf(state.data, read_tc, banktok)) } catch (err) { this.tellBadNews([err]) }
    }
  }

  /** Tell the device who is signed in, and start that user's bank: resolves once the snapshot shows `'locked'`, `'unborn'` or `'failed'` (with `lastErr`). Never rejects.
   * It restores the bank's roots and boxes first. Where the device has cached the bank's world, the bank comes up
   * `'locked'` from it at once, and unlocks on its cached gate, before the vaultDB answers.
   * Each later call resolves as the first, whatever userid it is handed: the device serves its first user for its life.
   */
  signin(userid: Userid): Promise<void> {
    const signedIn = Checks.userid.parse(userid)
    checkSecureContext()
    if (this.#signinAnswer !== null) { return this.#signinAnswer }
    this.#userid = signedIn
    this.#world.align()
    this.#signinAnswer = this.#doSignin(this.#bankMinder, this.#minder)
    return this.#signinAnswer
  }

  /** The gating of a birth of this device's bank over `params`, for a form mutation to attempt: the bank it births is then this device's, unlocked.
   * Call it once `signin` shows the stage `'unborn'`. See {@link Bank.birth} for what the birth refuses.
   */
  birthGating(params: FormData | BirthDna | BirthCleartexts): BirthGating {
    // Made before the stage is checked, so a refusal here zeroes the host's passkey answer, and empties a form's secret
    // fields, as every gating does (G2).
    const gating = this.#world.birthGating(params)
    if (['signed_out', 'starting'].includes(this.#snapshot.bank.stage)) {
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

  // The world fetched lands in the world's Things, which the stage is read from; a failure to fetch it, once a bank is up
  // from the cache, is no caller's to hear.
  // The SortedVaultDB is made right before the vault TSQ and the world listen to it and the minders hello it, with nothing
  // awaited between: its Things remember what they take, so a record it took with no one listening would reach them later
  // only as a repeat, which it drops. The records restored are the exception: the minders have them already, the world
  // reads its Things at its signin, and the vault TSQ reads a Thing for a host's query.
  /** Start the signed-in user's bank, with `bankMinder` minding its roots and `minder` its boxes over a SortedVaultDB of the bank they share: from what was cached, where there is a world, and from the world the vaultDB answers. */
  async #doSignin(bankMinder: BankMinder, minder: VaultMinder): Promise<void> {
    try {
      await this.#restore(bankMinder, this.#persisters?.roots)
      await this.#restore(minder, this.#persisters?.boxes)
      const sortedVaultDB = SortedVaultDB.make(this.scope, { vaultDB: this.vaultDB, makeThing: (seen) => this.#world.makeThing(seen) })
      this.#receiveRestored(sortedVaultDB, bankMinder, minder)
      this.#vaultTSQ = VaultTSQ.make({ vaultMinder: sortedVaultDB, queryClient: this.#tsqClient, scope: this.scope, onBadNews: (news) => { this.tellBadNews([news]) } })
      this.#world.signin(sortedVaultDB)
      bankMinder.hello(sortedVaultDB)
      minder.hello(sortedVaultDB)
      // Scaffolding until sign-in is one get of the roots: a get of the root box, whose answer's world brings the bank and
      // main gate. Where none is stored, the bank is asked for, and its shell shows the stage `'unborn'`.
      const rootAnswer = await sortedVaultDB.tryGetOnce({ ...this.scope, labelpath: Labelpath.RootBox })
      if (! rootAnswer.ok) { throw rootAnswer.err }
      if ((rootAnswer.act === 'gotvoid') && (rootAnswer.world === null)) {
        const bankAnswer = await sortedVaultDB.tryGetOnce({ ...this.scope, labelpath: 'bank' })
        if (! bankAnswer.ok) { throw bankAnswer.err }
        return
      }
      // Roots answered that are not all live in the world are broken: reported as the sign-in's refusal.
      if (! this.#world.areRootsLive) { throw Throwers.bankRootsMissing() }
    } catch (err) {
      if (this.bank !== null) {
        this.tellBadNews([err])
        return
      }
      this.#world.showSigninRefusal(err)
    }
  }
  // --

  // == [Locking]: lock

  /** Lock the signed-in user's bank ({@link World.lock}). Never throws. */
  lock(): this {
    this.#world.lock()
    return this
  }
  // --

  // == [Ending]: sweep

  /** Sweep the signed-in user's bank, if the device has one, and stop watching its vaultDB. Never throws.
   * The device stays usable: it judges passphrases. Its snapshot shows the swept bank.
   */
  sweep(): this {
    if (this.bank !== null) { this.#world.sweep() }
    // The watch's stop is the host's vaultDB code: what it throws is news.
    try { this.#world.sortedVaultDB?.sweep() } catch (err) { this.tellBadNews([err]) }
    return this
  }
  // --

  // == [Snapshot]: align, sayGoodbye, makeSnapshot

  // An arrow, so it stays bound: the world calls it as a subscriber. The bank is live once the world's stage reads
  // `'locked'`, which the world tells of, so the vault is made here, before a subscriber reads it.
  /** Make the vault once the bank is live, remake the snapshot, and tell each subscriber if it changed. */
  readonly #align = (): void => {
    const { bank } = this
    if ((bank !== null) && (this.#vault === null)) {
      this.#vault = Vault.make(bank, this.vaultTSQ)
      // Scaffolding until the old minders go: the bank's sweep empties the minder safebyok-react-lean's hooks read.
      bank.hostVault({ sweep: () => { this.#sayGoodbye(this.#minder) } })
    }
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

  /** Stop `minder` minding, telling `onBadNews` what that throws. */
  #sayGoodbye(minder: VaultMinder): void {
    try { minder.goodbye() } catch (err) { this.tellBadNews([err]) }
  }

  /** A new snapshot of this device: its world's snapshot. */
  #makeSnapshot(): DeviceSnapshot {
    return Object.freeze({ bank: this.#world.getSnapshot() })
  }
  // --

  // == [A devtool's view]: maskedView

  // The bank TSQ is no devtool's to read whole: the gate's record has each wayin's wrapped bankKey, which an offline
  // guess at a passphrase is checked against. What leaves here is a copy, with every ciphertext masked, and of
  // the lease only its loggable: the world hands out no lease.
  /** The bank TSQ, the vault TSQ and the lease, masked for a devtool.
   * Each row has its key, its state, and a copy of its record or listing with each ciphertext masked. The lease shows its loggable and when it ends, never its key material.
   * For experimenting, never for an app's own logic: what it answers may change without notice. Before `signin`, it answers {@link EmptyMaskedView}.
   */
  maskedView(): MaskedView {
    if (this.#userid === null) { return EmptyMaskedView }
    return { bankTSQ: this.#bankMinder.maskedRows(), vaultTSQ: this.#minder.maskedRows(), lease: maskedViewLeaseOf(this.bank === null ? undefined : this.#world) }
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

// == [Helpers]: millisOf, checkSecureContext, RestoredSourcelabel, restoredEventOf, isRestoredBox, maskedViewLeaseOf

// A host's Infinity minutes, for never, becomes ForeverMillis: past the entrypoint, nothing is infinite.
/** `minutes` in milliseconds, capped at `ForeverMillis`, or `fallback` for none. */
function millisOf(minutes: number | undefined, fallback: number): number { return (minutes === undefined ? fallback : Math.min(Math.round(minutes * Consts.MinuteMillis), Consts.ForeverMillis)) }

/** Refuse to run outside a secure context, where WebCrypto is missing */
function checkSecureContext(): void {
  if ((globalThis as { isSecureContext?: unknown }).isSecureContext === false) { throw Throwers.insecureContext() }
}

/** The `sourcelabel` of the events of the roots a device's persister restored. */
const RestoredSourcelabel = 'persister'

/** The `item` event of `record`, a record a persister restored, read at `read_tc` in the bank of `banktok` */
function restoredEventOf(record: ThingRecord, read_tc: ReadTc, banktok: Lifetok | undefined): VaultEvent {
  const { userid, banklabel, labelpath } = record
  return {
    eventkind: 'item', userid, banklabel, labelpath, modelkind: Labelpath.modelkindOf(labelpath), agerank: undefined, agerankWas: undefined,
    sourcelabel: RestoredSourcelabel, read_tc, banktok, ...itemSeenOf(record),
  }
}

/** True for what a minder's query restored that is a box's record, live, sparse or a tombstone: not a listing, nor null */
function isRestoredBox(val: unknown): val is ThingRecord {
  const checked = ThingChecks.sparse.safeParse(val)
  return checked.success && Labelpath.isBox(checked.data.labelpath)
}

/** The lease `world` holds, as a devtool is shown it: its loggable and when it ends, or `active: false` for no world, or one locked. */
function maskedViewLeaseOf(world: World | undefined): MaskedViewLease {
  const loggable = world?.leaseLoggable ?? null
  const endsAt = world?.leaseEndsAt ?? null
  return ((loggable === null) || (endsAt === null)) ? EmptyMaskedView.lease : { active: true, ...loggable, ends_at: endsAt }
}
// --

// == [Checks]: Checks

/** The checks of {@link Device.make}'s arguments, {@link Device.signin}'s and {@link tellBadNewsTo}'s. */
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
      persisters:      obj({ roots: fn<PersisterOfBank>(), boxes: fn<PersisterOfBank>() }).optional(),
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
