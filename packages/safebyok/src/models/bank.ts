import { FarFuture, FarPast, ForeverMillis, MinuteMillis, brandGuarded, type Modelkind } from '../helpers/consts'
import { nowMillis } from '../helpers/clock'
import { Checkers } from '../helpers/validator'
import { isTestDeriver } from '../deriver/basederiver'
import { VaultError, isVaultError } from '../refusals/errors'
import { tattoo } from '../helpers/helpers'
import { type VaultLogger, parseLogger } from '../helpers/logger'
import { DefaultStrengthChecker, type GuardedStrengthChecker, guardStrengthChecker } from '../helpers/passphrase-strength'
import { type Outcome, outcomeOf, valOf } from '../refusals/outcome'
import * as Phrases from '../helpers/phrases'
import { reportToPlatform } from '../refusals/report-error'
import type { LockState } from '../shapes/shapes-enums'
import { type BankScope, type BankedVaultScope, type VaultScope, bankScope, bankedVaultScope } from '../shapes/shapes-core'
import type { LeaseDated } from '../shapes/shapes-storage'
import type { AnyGating, AskUser, RequestCleartext } from '../shapes/shapes-gateish'
import * as VX from '../shapes/shapes-vaultish'
import type { BadNewsHandler, BankOpts, BankSnapshot, BankStage, Panic, PanicHandler } from '../shapes/shapes-vaultish'
import type { DeviceDB } from '../storage/device-db-new'
import { helloFirst, insecureContext } from '../refusals/throwers'
import { DefaultLeaseMillis, type Vault } from './vault'
import { type GuardedKeyDeriver, guardKeyDeriver } from './proving'
import { VaultListing } from './vault-listing'

// == [Given to a bank]: DefaultRefreshMillis

export const DefaultRefreshMillis = 5 * MinuteMillis
// --

export class Bank {
  // == [Props]: applabel, user_id, scope, device_id, keyDeriver, deviceDB, logger, askUser, strengthChecker, leaseMillis, panic, boxRefreshMillis, #makeListing, #onBadNews, #listeners, #vaultListing, #lastHello, #snapshot, #getSnapshot, #subscribe

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
  /** Tells the host of a refused erase of a cached lease, and no secret material. */
  readonly panic:            Panic
  /** The refresh horizon of each vault's boxes. */
  readonly boxRefreshMillis: number

  readonly #makeListing: () => VaultListing
  readonly #onBadNews:   BadNewsHandler | undefined
  readonly #listeners = new Set<() => void>()
  #vaultListing:         VaultListing
  /** The outcome of the last `hello`, null with none since the bank was made, swept or vacated. */
  #lastHello:            Outcome<void> | null = null
  #snapshot:             BankSnapshot

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
    VX.bankOpts.parse(opts)
    const { applabel, user_id, device_id, vaultDB, deviceDB, keyDeriver, requestCleartext, strengthChecker = DefaultStrengthChecker, autolockMinutes, vaultRefreshMinutes, boxRefreshMinutes, onBadNews, onPanic } = opts
    this.scope = bankScope.parse({ applabel, user_id })
    tattoo(this, this.scope)
    this.device_id = device_id
    this.keyDeriver = guardKeyDeriver(keyDeriver)
    this.deviceDB = deviceDB
    this.panic = guardOnPanic(onPanic)
    this.logger = parseLogger(opts.logger)
    this.askUser = guardRequestCleartext(requestCleartext)
    this.strengthChecker = guardStrengthChecker(strengthChecker)
    this.leaseMillis = millisOf(autolockMinutes, DefaultLeaseMillis)
    this.boxRefreshMillis = millisOf(boxRefreshMinutes, DefaultRefreshMillis)
    this.#onBadNews = onBadNews
    const maxMillisSinceRefresh = millisOf(vaultRefreshMinutes, DefaultRefreshMillis)
    this.#makeListing = () => {
      const listing = new VaultListing(this, { vaultDB, maxMillisSinceRefresh })
      listing.subscribe(this.#remakeSnapshot)
      return listing
    }
    this.#vaultListing = this.#makeListing()
    this.#snapshot = this.#makeSnapshot()
    if (isTestDeriver(keyDeriver)) { this.logger.warn(Phrases.TestDeriverNotice, { call: 'Bank.make' }) }
    Object.freeze(this)
  }

  vaultScopeOf(scope: BankedVaultScope): VaultScope {
    const { vaultlabel } = bankedVaultScope.parseConsistent(scope, this.scope, { message: Phrases.otherScope })
    return { ...this.scope, vaultlabel }
  }
  // --

  // == [The world of its vaults]: lockState, ensureTimely, takeWorld

  lockState(): LockState { return 'unlocked' }

  ensureTimely(): Promise<void> { return Promise.resolve() }

  takeWorld(): void { /* no world sits above a bank */ }
  // --

  // == [Starting]: hello, tryHello, bringUp

  /** SLOPDOC: Brings the bank up from the vaultDB, and again whenever the host calls it to force a reset. */
  async hello(): Promise<void> {
    const listing = this.#vaultListing
    const hello = await outcomeOf(() => this.#bringUp(listing))
    if (listing === this.#vaultListing) { this.#lastHello = hello }
    this.#remakeSnapshot()
    valOf(hello)
  }

  tryHello(): Promise<Outcome<void>> { return outcomeOf(() => this.hello()) }

  /** A sweep crossing it leaves `listing` disabled, which refuses. */
  async #bringUp(listing: VaultListing): Promise<void> {
    await this.keyDeriver.load()
    await this.strengthChecker.load()
    await listing.list()
    await listing.hello()
  }
  // --

  // == [Ending]: autolock, lock, vacate, sweep, scanOwnLeasesProvedBefore, eraseOwnLeases, eraseLease

  /** Lock each listed vault with a cached lease past autolock, erasing it. Call it after `hello` and on your own timer.
   * A best-effort reminder, not a guarantee: it finds leases only by row, and `Lease.buildFromCache` leaves such a row for it.
   */
  async autolock(): Promise<void> {
    const cutoff = Math.floor(nowMillis() - this.leaseMillis)
    const oldRows = await this.#scanOwnLeasesProvedBefore(Math.max(FarPast, cutoff))
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

  /** Every listed vault vacated, the open gating declined, a birth's too, and every lease of this bank cached on this device erased, the vaultDB untouched. Not ready until the next `hello`, which lists them afresh. Never throws. */
  vacate(): this {
    this.#lastHello = null
    this.#vaultListing.openGating?.declineAtDiscard()
    for (const vault of this.#vaultListing.things) { vault.vacate() }
    void this.#eraseOwnLeases()
    this.#remakeSnapshot()
    return this
  }

  /** Cleanup while the page lives: the watch ended and each vault swept, its cached lease left for the next session. Not ready until the next `hello`, which starts a fresh listing. Never throws. */
  sweep(): this {
    this.#lastHello = null
    this.#vaultListing.sweep()
    this.#vaultListing = this.#makeListing()
    this.#remakeSnapshot()
    return this
  }

  /** This bank's rows among the cached leases proved before `cutoff`; a refused scan is bad news, and finds none. */
  async #scanOwnLeasesProvedBefore(cutoff: number): Promise<LeaseDated[]> {
    const scan = await this.deviceDB.tryLeasesProvedBefore(cutoff)
    if (! scan.ok) {
      this.tellBadNews([scan.err])
      return []
    }
    return scan.val.filter((row) => this.#isOwnLease(row))
  }

  /** A vacate's erase of every row of this bank, listed or not, as a fresh page told 'identity_revoked' has listed
   * none.
   */
  async #eraseOwnLeases(): Promise<void> {
    const rows = await this.#scanOwnLeasesProvedBefore(FarFuture)
    await Promise.all(rows.map((row) => this.#eraseLease(row)))
  }

  async #eraseLease(row: LeaseDated): Promise<void> {
    const vacated = await this.deviceDB.tryVacate(row)
    // As a vault's own panic tells it, but with no vault to vacate.
    if (! vacated.ok) { await this.panic(vacated.err) }
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

  // == [Bad news]: tellBadNews, hearBadNews

  /** Tell bad news no caller waits on to the host, its every listing and box coming straight here. A handler's failure reaches only the platform. */
  tellBadNews(badnews: readonly VaultError[]): void {
    for (const news of badnews) {
      // Any answer is heard out, a thenable among them: none is awaited.
      void (async () => {
        try {
          await this.#hearBadNews(news)
        } catch (err) {
          reportToPlatform(err)
        }
      })()
    }
  }

  /** Every news goes to the host's `onBadNews`, else the logger; 'identity_revoked' vacates the bank first. */
  #hearBadNews(news: VaultError): unknown {
    if (isVaultError(news, 'identity_revoked')) { this.vacate() }
    if (this.#onBadNews !== undefined) { return this.#onBadNews(news) }
    this.logger.warn(news.message, { call: 'Bank.onBadNews', refusalkind: news.refusalkind })
    return undefined
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
    return Object.freeze({ ...this.scope, stage: stageOf(hello), err: hello?.err ?? null, device_id: this.device_id, vaults: this.#vaultListing.snapshot })
  }
  // --

  // == [Guards]: isOwnLease, demandReady

  #isOwnLease({ applabel, user_id }: LeaseDated): boolean { return (applabel === this.applabel) && (user_id === this.user_id) }

  #demandReady(): void {
    if (this.#lastHello === null) { throw helloFirst() }
    valOf(this.#lastHello)
  }
  // --

  /** Answers 'bank', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'bank' { return 'bank' satisfies Modelkind }
}

// == [Host functions]: HostChecks, guardRequestCleartext, guardOnPanic

const HostChecks = Checkers('bad_option', ({ fn }) => ({
  requestCleartext: fn<RequestCleartext>(),
  onPanic:          fn<PanicHandler>().optional(),
}))

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

/** `onPanic` held to its contract: the one way a bank or a vault tells the host of a cached lease that survived its erase. */
export const guardOnPanic = (onPanic: PanicHandler | undefined): Panic => {
  const host = HostChecks.onPanic.parse(onPanic, { where: 'onPanic' })
  return brandGuarded(async (refusal: VaultError): Promise<boolean> => {
    if (host === undefined) {
      reportToPlatform(refusal)
      return false
    }
    try {
      await host(refusal)
    } catch (err) {
      reportToPlatform(err)
    }
    return true
  })
}
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
