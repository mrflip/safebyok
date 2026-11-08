import { ForeverMillis, MinuteMillis, brandGuarded, type Modelkind } from '../helpers/consts'
import { nowMillis } from '../helpers/clock'
import { Checkers } from '../helpers/validator'
import { isTestDeriver } from '../deriver/basederiver'
import { VaultError, isVaultError } from '../refusals/errors'
import { tattoo } from '../helpers/helpers'
import { type VaultLogger, parseLogger } from '../helpers/logger'
import { DefaultStrengthChecker, type GuardedStrengthChecker, guardStrengthChecker } from '../helpers/passphrase-strength'
import { type Outcome, good, outcomeOf, valOf } from '../refusals/outcome'
import * as Phrases from '../helpers/phrases'
import { reportToPlatform } from '../refusals/report-error'
import { type BankScope, type BankedVaultScope, type VaultScope, bankScope, bankedVaultScope } from '../shapes/shapes-core'
import type { LeaseDated } from '../shapes/shapes-storage'
import type { AnyGating, AskUser, RequestCleartext } from '../shapes/shapes-gateish'
import * as VX from '../shapes/shapes-vaultish'
import type { BadNewsHandler, BankOpts, BankPanic, BankSnapshot, BankStage, GuardedPanicHandler, Panic, PanicHandler, VacateStory } from '../shapes/shapes-vaultish'
import type { DeviceDB } from '../storage/device-db'
import { bankDisabled, helloFirst, insecureContext } from '../refusals/throwers'
import { DefaultLeaseMillis, type Vault } from './vault'
import { type GuardedKeyDeriver, guardKeyDeriver } from './proving'
import { VaultListing } from './vault-listing'

// == [Given to a bank]: DefaultRefreshMillis

export const DefaultRefreshMillis = 5 * MinuteMillis
// --

export class Bank {
  // == [Props]: applabel, user_id, scope, device_id, keyDeriver, deviceDB, logger, askUser, strengthChecker, leaseMillis, panic, boxRefreshMillis, #hostHandlers, #listeners, #vaultListing, #endCause, #vacating, #lastHello, #snapshot, #getSnapshot, #subscribe

  declare readonly applabel: string
  declare readonly user_id:  string
  readonly scope:            BankScope
  readonly device_id:        string
  readonly keyDeriver:       GuardedKeyDeriver
  readonly deviceDB:         DeviceDB
  readonly logger:           VaultLogger
  /** The host's dialog. */
  readonly askUser:          AskUser
  readonly strengthChecker:  GuardedStrengthChecker
  readonly leaseMillis:      number
  /** Tells the host what it must act on for safety, naming this bank, and no secret material. */
  readonly panic:            BankPanic
  /** The refresh horizon of each vault's boxes. */
  readonly boxRefreshMillis: number

  /** The host's `onPanic`, guarded, and its `onBadNews`, called while the bank is enabled and by its vacate's scrub. */
  readonly #hostHandlers: Handlers
  readonly #listeners = new Set<() => void>()
  readonly #vaultListing: VaultListing
  /** Why a sweep or a vacate disabled the bank, its snapshot's refusal from then on; null while it is enabled. */
  #endCause:              VaultError | null = null
  /** The first vacate's scrub, which a repeat answers; null until a vacate. */
  #vacating:              Promise<void> | null = null
  /** The outcome of the last `hello`, null with none yet. */
  #lastHello:             Outcome<void> | null = null
  #snapshot:              BankSnapshot

  readonly #getSnapshot = (): BankSnapshot => this.#snapshot

  readonly #subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(VX.listener.parse(listener))
    return () => { this.#listeners.delete(listener) }
  }
  // --

  // == [Getters]: vaultListing, autolockMinutes, snapshot, getSnapshot, subscribe, toJSON

  get vaultListing(): VaultListing { return this.#vaultListing }

  get autolockMinutes(): number { return this.leaseMillis / MinuteMillis }

  get snapshot(): BankSnapshot { return this.#snapshot }

  get getSnapshot(): () => BankSnapshot { return this.#getSnapshot }

  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }

  toJSON(): BankSnapshot { return this.#snapshot }
  // --

  // == [Construction]: make, constructor, vaultScopeOf

  static make(opts: BankOpts): Bank { return new Bank(opts) }

  constructor(opts: BankOpts) {
    checkSecureContext()
    const { applabel, user_id, device_id, vaultDB, deviceDB, keyDeriver, requestCleartext, strengthChecker = DefaultStrengthChecker, logger, autolockMinutes, vaultRefreshMinutes, boxRefreshMinutes, onBadNews = DefaultOnBadNews, onPanic = DefaultOnPanic } = VX.bankOpts.parse(opts)
    this.scope = bankScope.parse({ applabel, user_id })
    tattoo(this, this.scope)
    this.device_id = device_id
    this.keyDeriver = guardKeyDeriver(keyDeriver)
    this.deviceDB = deviceDB
    // A disabled bank calls none of the host's functions, but in its vacate's scrub: the page may belong to the next user by then.
    this.#hostHandlers = { onPanic: guardOnPanic(onPanic), onBadNews }
    this.panic = brandGuarded((panic: Omit<Panic, 'bank'>) => this.#handlers.onPanic({ ...panic, bank: this }))
    // A disabled bank asks no one: every Gating.launch follows an enabled check in the same tick.
    this.askUser = guardRequestCleartext(requestCleartext)
    this.logger = parseLogger(logger)
    this.strengthChecker = guardStrengthChecker(strengthChecker)
    this.leaseMillis = millisOf(autolockMinutes, DefaultLeaseMillis)
    this.boxRefreshMillis = millisOf(boxRefreshMinutes, DefaultRefreshMillis)
    const maxMillisSinceRefresh = millisOf(vaultRefreshMinutes, DefaultRefreshMillis)
    this.#vaultListing = new VaultListing(this, { vaultDB, maxMillisSinceRefresh })
    this.#vaultListing.subscribe(this.#remakeSnapshot)
    this.#snapshot = this.#makeSnapshot()
    if (isTestDeriver(keyDeriver)) { this.logger.warn(Phrases.TestDeriverNotice, { call: 'Bank.make' }) }
    Object.freeze(this)
  }

  vaultScopeOf(scope: BankedVaultScope): VaultScope {
    const { vaultlabel } = bankedVaultScope.parseConsistent(scope, this.scope, { message: Phrases.otherScope })
    return { ...this.scope, vaultlabel }
  }
  // --

  // == [The world of its vaults]: isLocked, ensureTimely, takeWorld

  /** False: a bank has no lock, and each vault keeps its own. */
  get isLocked(): boolean { return false }

  ensureTimely(): Promise<void> { return Promise.resolve() }

  takeWorld(): void { /* no world sits above a bank */ }
  // --

  // == [Starting]: hello, tryHello, bringUp

  /** SLOPDOC: Brings the bank up from the vaultDB, and again whenever the host calls it to force a reset. */
  async hello(): Promise<void> {
    this.demandEnabled()
    const hello = await outcomeOf(() => this.#bringUp())
    this.#lastHello = hello
    this.#remakeSnapshot()
    valOf(hello)
  }

  tryHello(): Promise<Outcome<void>> { return outcomeOf(() => this.hello()) }

  /** A sweep or a vacate crossing it leaves the listing disabled, which refuses. */
  async #bringUp(): Promise<void> {
    await this.keyDeriver.load()
    await this.strengthChecker.load()
    await this.#vaultListing.list()
    await this.#vaultListing.hello()
  }
  // --

  // == [Ending]: autolock, lock, vacate, sweep, letGo, listOwnLeases, eraseOwnLeases

  /** Lock each listed vault with a cached lease past autolock, erasing it. Call it after `hello` and on your own timer.
   * A best-effort reminder, not a guarantee: it finds leases only by row, and `Lease.buildFromCache` leaves such a row for it.
   */
  async autolock(): Promise<void> {
    const cutoff = nowMillis() - this.leaseMillis
    const listed = await this.#listOwnLeases()
    if (! listed.ok) { this.tellBadNews([listed.err]); return }
    const oldRows = listed.val.filter((row) => row.proved_at < cutoff)
    for (const row of oldRows) {
      const listed = this.#vaultListing.at(row)
      if (listed?.vault_tok === row.vault_tok) { listed.lock() }
    }
  }

  /** Every listed vault locked; the bank stays ready. Never throws. */
  lock(): this {
    this.#vaultListing.lock()
    return this
  }

  /** Sign out on this device: disable the bank and erase every lease of this bank cached here, settling once each erase has been tried. */
  vacate(story: VacateStory = {}): Promise<void> {
    const { cause = bankDisabled() } = VX.vacateStory.parse(story)
    this.#letGo(cause, () => { this.#vaultListing.vacate() })
    // The scrub alone holds the host's handlers past the disable: a lease that outlives sign-out is the one the host most needs to hear of.
    // A vacate after a sweep still scrubs, as sign-out may come after the page's cleanup.
    this.#vacating ??= this.#eraseOwnLeases()
    return this.#vacating
  }

  /** Cleanup while the page lives: disable the bank, leaving each cached lease for the next bank. Never throws. */
  sweep(): this {
    this.#letGo(bankDisabled(), () => { this.#vaultListing.sweep() })
    return this
  }

  /** The bank disabled, its snapshot refused with `cause` and its listing let go by `discard`, for good; a repeat is a no-op. */
  #letGo(cause: VaultError, discard: () => void): void {
    if (! this.isEnabled) { return }
    this.#endCause = cause
    discard()
    this.#remakeSnapshot()
  }

  /** This bank's rows among the cached leases, oldest first. */
  async #listOwnLeases(): Promise<Outcome<LeaseDated[]>> {
    const listed = await this.deviceDB.tryListLeases()
    return listed.ok ? good(listed.val.filter((row) => this.#isOwnLease(row))) : listed
  }

  /** A vacate's erase of every row of this bank, listed or not, as a fresh page told 'identity_revoked' has listed
   * none.
   */
  async #eraseOwnLeases(): Promise<void> {
    const { onPanic, onBadNews } = this.#hostHandlers
    const listed = await this.#listOwnLeases()
    if (! listed.ok) { this.#tellBadNewsTo(onBadNews, [listed.err]); return }
    await Promise.all(listed.val.map(async (row) => {
      const forgotten = await this.deviceDB.tryForget(row)
      // Not awaited: a host's onPanic that awaits bank.vacate() is handed this scrub, and each would wait on the other.
      if (! forgotten.ok) { void onPanic({ refusal: forgotten.err, bank: this }) }
    }))
  }
  // --

  // == [Vaults]: vaultAt, ensureVault, tryEnsureVault

  /** The vault listed for `scope`, a tombstone among them, or null. */
  vaultAt(scope: BankedVaultScope): Vault | null {
    this.#demandReady()
    return this.#vaultListing.at(this.vaultScopeOf(scope))
  }

  /** SLOPDOC: The vault for `scope`, whether already listed or built now by asking the user. */
  async ensureVault(scope: BankedVaultScope): Promise<Vault> {
    const asked = this.vaultScopeOf(scope)
    this.#demandReady()
    const listed = this.#vaultListing.at(asked)
    return (listed?.isPresent === true) ? listed : this.#vaultListing.buildVault(asked)
  }

  tryEnsureVault(scope: BankedVaultScope): Promise<Outcome<Vault>> { return outcomeOf(() => this.ensureVault(scope)) }
  // --

  // == [Bad news]: tellBadNews, tellBadNewsTo

  /** Tell bad news no caller waits on to the host, its every listing and box coming straight here. A handler's failure reaches only the platform. */
  tellBadNews(badnews: readonly VaultError[]): void { this.#tellBadNewsTo(this.#handlers.onBadNews, badnews) }

  /** Tell each news to `onBadNews`, awaiting none; a handler's failure reaches only the platform. */
  #tellBadNewsTo(onBadNews: BadNewsHandler, badnews: readonly VaultError[]): void {
    for (const news of badnews) {
      // Any answer is heard out, a thenable among them: none is awaited.
      void (async () => {
        try {
          await onBadNews({ news, bank: this })
        } catch (err) {
          reportToPlatform(err)
        }
      })()
    }
  }
  // --

  // == [Snapshot]: remakeSnapshot, makeSnapshot

  /** Make the snapshot again, and tell every listener where it differs. Bound, as each listing calls it. */
  readonly #remakeSnapshot = (): void => {
    const next = this.#makeSnapshot()
    const prior = this.#snapshot
    if ((next.stage === prior.stage) && (next.err === prior.err) && (next.vaults === prior.vaults)) { return }
    this.#snapshot = next
    for (const listener of this.#listeners) {
      try {
        listener()
      } catch (err) {
        reportToPlatform(err)
      }
    }
  }

  #makeSnapshot(): BankSnapshot {
    const hello = this.#lastHello
    const [stage, err] = this.#endCause ? ['refused' as const, this.#endCause] : [stageOf(hello), hello?.err ?? null]
    return Object.freeze({ ...this.scope, stage, err, device_id: this.device_id, vaults: this.#vaultListing.snapshot })
  }
  // --

  // == [Guards]: isEnabled, demandEnabled, handlers, isOwnLease, demandReady

  /** True from `Bank.make` until a sweep or a vacate, and never again. */
  get isEnabled(): boolean { return this.#endCause === null }

  /** Demands that this bank be enabled. */
  demandEnabled(): this {
    if (! this.isEnabled) { throw bankDisabled() }
    return this
  }

  /** The host's handlers while the bank is enabled, and handlers that only report once it is disabled. */
  get #handlers(): Handlers { return this.isEnabled ? this.#hostHandlers : DefaultHandlers }

  #isOwnLease({ applabel, user_id }: LeaseDated): boolean { return (applabel === this.applabel) && (user_id === this.user_id) }

  #demandReady(): void {
    this.demandEnabled()
    if (this.#lastHello === null) { throw helloFirst() }
    valOf(this.#lastHello)
  }
  // --

  /** Answers 'bank', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'bank' { return 'bank' satisfies Modelkind }
}

// == [Host functions]: HostChecks, DefaultOnBadNews, DefaultOnPanic, guardRequestCleartext, guardOnPanic, Handlers, DefaultHandlers

const HostChecks = Checkers('bad_option', ({ fn }) => ({
  requestCleartext: fn<RequestCleartext>(),
  onPanic:          fn<PanicHandler>(),
}))

/** The `onBadNews` a bank has when given none: each news to the bank's logger. */
export const DefaultOnBadNews: BadNewsHandler = ({ news, bank }) => {
  bank.logger.warn(news.message, { call: 'Bank.onBadNews', refusalkind: news.refusalkind })
}

/** The `onPanic` a bank has when given none: the refusal to the platform, then the bank vacated on 'identity_revoked', else the vault, if one. */
export const DefaultOnPanic: PanicHandler = ({ refusal, bank, vault }) => {
  reportToPlatform(refusal)
  if (isVaultError(refusal, 'identity_revoked')) {
    void bank.vacate({ cause: refusal })
  } else {
    vault?.vacate()
  }
}

// What the dialog throws is dropped: it may quote what the user typed.
/** `requestCleartext` held to its contract: the one way a gating asks the user. */
export const guardRequestCleartext = (requestCleartext: RequestCleartext): AskUser => {
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

/** `onPanic` held to its contract: the one way the core tells the host what it must act on for safety. */
export const guardOnPanic = (onPanic: PanicHandler): GuardedPanicHandler => {
  const host = HostChecks.onPanic.parse(onPanic, { where: 'onPanic' })
  return brandGuarded(async (panic: Panic): Promise<void> => {
    try {
      await host(panic)
    } catch (err) {
      reportToPlatform(err)
    }
  })
}

/** What a bank tells of a panic and of bad news: the host's `onPanic`, guarded, and its `onBadNews`, or what a disabled bank reports. */
interface Handlers {
  readonly onPanic:   GuardedPanicHandler
  readonly onBadNews: BadNewsHandler
}

// Not DefaultOnPanic: past the disable it would vacate nothing, or start a scrub on a swept bank.
/** A disabled bank's reports: each panic's refusal to the platform, and bad news to `DefaultOnBadNews`. */
const DefaultHandlers: Handlers = { onPanic: guardOnPanic(({ refusal }) => { reportToPlatform(refusal) }), onBadNews: DefaultOnBadNews }
// --

// == [Helpers]: millisOf, stageOf, checkSecureContext

// A host's Infinity minutes, for never, is kept as ForeverMillis: past the entrypoint, nothing is infinite.
const millisOf = (minutes: number | undefined, fallback: number): number => (minutes === undefined ? fallback : Math.min(Math.round(minutes * MinuteMillis), ForeverMillis))

const stageOf = (hello: Outcome<void> | null): BankStage => {
  if (hello === null) { return 'made' }
  return hello.ok ? 'ready' : 'refused'
}

const checkSecureContext = (): void => {
  if ((globalThis as { isSecureContext?: unknown }).isSecureContext === false) { throw insecureContext() }
}
// --
