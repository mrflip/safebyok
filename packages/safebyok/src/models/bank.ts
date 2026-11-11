import { ForeverMillis, MinuteMillis, brandGuarded, type Modelkind } from '../helpers/consts'
import { nowMillis } from '../helpers/clock'
import { Checkers } from '../helpers/validator'
import { isTestDeriver } from '../deriver/basederiver'
import { VaultError, isVaultError } from '../refusals/errors'
import { tattoo } from '../helpers/helpers'
import { type VaultLogger, parseLogger } from '../helpers/logger'
import { DefaultStrengthChecker, type GuardedStrengthChecker, guardStrengthChecker } from '../helpers/passphrase-strength'
import { type Outcome, demandGood, good, outcomeOf } from '../refusals/outcome'
import * as Phrases from '../helpers/phrases'
import { reportToPlatform } from '../refusals/report-error'
import { type BankScope, type BankedVaultScope, type VaultScope, bankScope, bankedVaultScope } from '../shapes/shapes-core'
import * as SX from '../shapes/shapes-storage'
import type { GoodAnswer } from '../storage/vault-db'
import type { Box } from './box'
import type { LeaseDated } from '../shapes/shapes-storage'
import type { AnyGating, AskUser, RequestCleartext } from '../shapes/shapes-gateish'
import * as VX from '../shapes/shapes-vaultish'
import type { BadNewsHandler, BankAnnouncement, BankEvent, BankOpts, BankSnapshot, BankStage, GuardedLifecycleHandler, LifecycleHandler, VacateStory } from '../shapes/shapes-vaultish'
import type { DeviceDB } from '../storage/device-db'
import { bankDisabled, helloFirst, insecureContext } from '../refusals/throwers'
import { DefaultLeaseMillis, type Vault } from './vault'
import { type GuardedKeyDeriver, guardKeyDeriver } from './proving'
import { VaultListing } from './vault-listing'

// == [Given to a bank]: DefaultRefreshMillis

/** How old a vault or box may grow before it is fetched again, unless the host's options say otherwise. */
export const DefaultRefreshMillis = 5 * MinuteMillis
// --

/** The signed-in user's vaults in the app, one Vault object per scope, and what they share. */
export class Bank {
  // == [Props]: applabel, user_id, scope, device_id, keyDeriver, deviceDB, logger, strengthChecker, leaseMillis, boxRefreshMillis, #hostHandlers, #tellBadNews, #listeners, #vaultListing, #endCause, #vacating, #lastHello, #snapshot, #getSnapshot, #subscribe

  declare readonly applabel: string
  declare readonly user_id:  string
  readonly scope:            BankScope
  readonly device_id:        string
  readonly keyDeriver:       GuardedKeyDeriver
  readonly deviceDB:         DeviceDB
  readonly logger:           VaultLogger
  readonly strengthChecker:  GuardedStrengthChecker
  readonly leaseMillis:      number
  /** The refresh horizon of each vault's boxes. */
  readonly boxRefreshMillis: number

  /** The host's `onLifecycle`, guarded, and its `onBadNews`, called while the bank is enabled and by its vacate. */
  readonly #hostHandlers: Handlers

  /** Tell bad news no caller waits on to the host, its every listing and box coming straight here: the friend they tell it through. */
  readonly #tellBadNews = brandGuarded((badnews: readonly VaultError[]): void => { tellBadNewsTo(this.#handlers.onBadNews, this, badnews) })
  // Not awaited: an announcement is news of what happened, and nothing waits on the host's answer.
  /** Tell the host's `onLifecycle` what happened, its every listing and vault coming straight here: the friend they announce through. */
  readonly #announce = brandGuarded((announcement: BankAnnouncement): void => { void this.#handlers.onLifecycle({ ...announcement, bank: this }) })
  readonly #listeners = new Set<() => void>()
  readonly #vaultListing: VaultListing
  /** Why a sweep or a vacate disabled the bank, its snapshot's refusal from then on; null while it is enabled. */
  #endCause:              VaultError | null = null
  /** The first vacate's promise, which a repeat answers; null until a vacate. */
  #vacating:              Promise<void> | null = null
  /** Whether a `hello` has succeeded. */
  #isHelloed              = false
  #snapshot:              BankSnapshot

  readonly #getSnapshot = (): BankSnapshot => this.#snapshot

  readonly #subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(VX.listener.parse(listener))
    return () => { this.#listeners.delete(listener) }
  }
  // --

  // == [Getters]: vaultListing, autolockMinutes, snapshot, getSnapshot, subscribe, toJSON

  /** The listing of this bank's vaults. */
  get vaultListing(): VaultListing { return this.#vaultListing }

  /** The autolock duration in minutes, past which a cached lease no longer unlocks a vault. */
  get autolockMinutes(): number { return this.leaseMillis / MinuteMillis }

  /** This bank's current {@link BankSnapshot}. */
  get snapshot(): BankSnapshot { return this.#snapshot }

  /** The unbound snapshot getter, for `useSyncExternalStore`. */
  get getSnapshot(): () => BankSnapshot { return this.#getSnapshot }

  /** The unbound subscribe callback, for `useSyncExternalStore`. */
  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }

  /** This bank's snapshot, for `JSON.stringify`. */
  toJSON(): BankSnapshot { return this.#snapshot }
  // --

  // == [Construction]: make, constructor, vaultScopeOf

  /** Make a bank from the host's options, ready for {@link hello}. */
  static make(opts: BankOpts): Bank { return new Bank(opts) }

  constructor(opts: BankOpts) {
    checkSecureContext()
    const { applabel, user_id, device_id, vaultDB, deviceDB, keyDeriver, requestCleartext, strengthChecker = DefaultStrengthChecker, logger, autolockMinutes, vaultRefreshMinutes, boxRefreshMinutes, onBadNews = DefaultOnBadNews, onLifecycle = DefaultOnLifecycle } = VX.bankOpts.parse(opts)
    this.scope = bankScope.parse({ applabel, user_id })
    tattoo(this, this.scope)
    this.device_id = device_id
    this.keyDeriver = guardKeyDeriver(keyDeriver)
    this.deviceDB = deviceDB
    // A disabled bank calls none of the host's functions, but in its vacate: the page may belong to the next user by then.
    this.#hostHandlers = { onLifecycle: guardOnLifecycle(onLifecycle), onBadNews }
    // A revoked identity vacates the bank whatever the host's onLifecycle does; the host hears of it as the vacate's `vacated`.
    const panic = brandGuarded((refusal: VaultError): void => { void this.vacate({ cause: refusal }) })
    // A disabled bank asks no one: every gating's launch follows an enabled check in the same tick.
    const askUser = requestCleartext === undefined ? null : guardRequestCleartext(requestCleartext)
    this.logger = parseLogger(logger)
    this.strengthChecker = guardStrengthChecker(strengthChecker)
    this.leaseMillis = millisOf(autolockMinutes, DefaultLeaseMillis)
    this.boxRefreshMillis = millisOf(boxRefreshMinutes, DefaultRefreshMillis)
    const maxMillisSinceRefresh = millisOf(vaultRefreshMinutes, DefaultRefreshMillis)
    this.#vaultListing = new VaultListing(this, { vaultDB, maxMillisSinceRefresh, bankFriend: { panic, announce: this.#announce, tellBadNews: this.#tellBadNews, askUser } })
    this.#vaultListing.subscribe(this.#remakeSnapshot)
    this.#snapshot = this.#makeSnapshot()
    if (isTestDeriver(keyDeriver)) { this.logger.warn(Phrases.TestDeriverNotice, { call: 'Bank.make' }) }
    Object.freeze(this)
  }

  /** The full {@link VaultScope} of `scope` in this bank, refusing a scope of another bank. */
  vaultScopeOf(scope: BankedVaultScope): VaultScope {
    const { vaultlabel } = bankedVaultScope.parseConsistent(scope, this.scope, { message: Phrases.otherScope })
    return { ...this.scope, vaultlabel }
  }
  // --

  // == [The world of its vaults]: isLocked, ensureTimely, receiveWorld

  /** False: a bank has no lock, and each vault keeps its own. */
  get isLocked(): boolean { return false }

  /** Resolves at once: nothing above a bank needs refreshing. */
  ensureTimely(): Promise<void> { return Promise.resolve() }

  /** Does nothing: no world sits above a bank. */
  receiveWorld(): void { /* no world sits above a bank */ }
  // --

  // == [Starting]: hello, tryHello, bringUp

  /** SLOPDOC: Brings the bank up from the vaultDB, and again whenever the host calls it to force a reset. */
  async hello(): Promise<void> {
    this.demandEnabled()
    const hello = await outcomeOf(() => this.#bringUp())
    this.#isHelloed ||= hello.ok
    this.#remakeSnapshot()
    this.#announce({ kind: 'helloed', outcome: hello, vault: null })
    demandGood(hello)
  }

  /** Non-throwing form of {@link hello}. */
  tryHello(): Promise<Outcome<void>> { return outcomeOf(() => this.hello()) }

  /** A sweep or a vacate crossing it leaves the listing disabled, which refuses. */
  async #bringUp(): Promise<void> {
    await this.keyDeriver.load()
    await this.strengthChecker.load()
    await this.#vaultListing.list()
    await this.#vaultListing.hello()
  }
  // --

  // == [Ending]: autolock, lock, vacate, sweep, letGo, listOwnLeases, vacateDevice, revokeOwnLeases, forgetOwnBank, tellHost

  /** Lock each listed vault with a cached lease past autolock, forgetting it. Call it after `hello` and on your own timer.
   * A best-effort reminder, not a guarantee: it finds leases only by row, and `Lease.buildFromCache` leaves such a row for it.
   */
  async autolock(): Promise<void> {
    const cutoff = nowMillis() - this.leaseMillis
    const listed = await this.#listOwnLeases()
    if (! listed.ok) { this.#tellBadNews([listed.err]); return }
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

  /** Sign out on this device: disable the bank, and forget every lease of this bank cached here and its bank row, settling once each forget has been tried. */
  vacate(story: VacateStory = {}): Promise<void> {
    const { cause = bankDisabled() } = VX.vacateStory.parse(story)
    this.#disable(cause, () => { this.#vaultListing.vacate() })
    // A vacate alone uses the host's handlers past the disable: a lease that outlives sign-out is the one the host most needs to hear of.
    // A vacate after a sweep still forgets its rows, as sign-out may come after the page's cleanup.
    this.#vacating ??= this.#vacateDevice(cause)
    return this.#vacating
  }

  /** Cleanup while the page lives: disable the bank, leaving each cached lease for the next bank. Never throws. */
  sweep(): this {
    this.#disable(bankDisabled(), () => { this.#vaultListing.sweep() })
    return this
  }

  /** The bank disabled, its snapshot saying `cause` and its listing let go by `discard`, for good; a repeat is a no-op. */
  #disable(cause: VaultError, discard: () => void): void {
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

  // A fresh device has no bank row: the next bank of this scope gets a new device_id.
  /** This bank's leases revoked and its bank row forgotten on this device, then `vacated` told. */
  async #vacateDevice(cause: VaultError): Promise<void> {
    const unrevoked = await this.#revokeOwnLeases()
    await this.#forgetOwnBank()
    this.#tellHost({ kind: 'vacated', cause, unrevoked })
  }

  /** A vacate's revoke of every lease of this bank, listed or not, as a fresh page told 'identity_revoked' has listed
   * none; answers how many it could not revoke.
   */
  async #revokeOwnLeases(): Promise<number> {
    const listed = await this.#listOwnLeases()
    if (! listed.ok) { tellBadNewsTo(this.#hostHandlers.onBadNews, this, [listed.err]); return 0 }
    const revoked = await Promise.all(listed.val.map(async (row) => {
      const forgot = await this.deviceDB.tryForget(row)
      if (! forgot.ok) { this.#tellHost({ kind: 'lease_revoke_failed', refusal: forgot.err, vault: null, where: 'vacate' }) }
      return forgot.ok
    }))
    return revoked.filter((isRevoked) => ! isRevoked).length
  }

  /** A vacate's forget of this bank's row in the deviceDB, a refusal told as bad news. */
  async #forgetOwnBank(): Promise<void> {
    const forgot = await this.deviceDB.tryForgetBank(this.scope)
    if (! forgot.ok) { tellBadNewsTo(this.#hostHandlers.onBadNews, this, [forgot.err]) }
  }

  /** A vacate's word to the host's own `onLifecycle`, past the disable. */
  #tellHost(announcement: BankAnnouncement): void {
    // Not awaited: a host's onLifecycle that awaits bank.vacate() is handed this vacate, and each would wait on the other.
    void this.#hostHandlers.onLifecycle({ ...announcement, bank: this })
  }
  // --

  // == [Vaults]: vaultAt, ensureVault, tryEnsureVault, tryProbe, probe

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

  /** Non-throwing form of {@link ensureVault}. */
  tryEnsureVault(scope: BankedVaultScope): Promise<Outcome<Vault>> { return outcomeOf(() => this.ensureVault(scope)) }

  /** Trials this bank's storage end to end at startup and reports each step, asking the user if the vault needs it: replaces one box, fetches it back and opens it, surfacing nothing it held. */
  tryProbe(asked: VX.ProbeAsked = {}, opts: VX.ProbeOpts = {}): Promise<Outcome<VX.ProbeReport>> { return outcomeOf(() => this.#probe(asked, opts)) }

  async #probe(asked: VX.ProbeAsked, opts: VX.ProbeOpts): Promise<VX.ProbeReport> {
    const { vaultlabel, boxlabel, whisper, sidecar } = VX.probeAsked.parse(asked)
    const { maxMillisSinceRefresh } = VX.probeOpts.parse(opts)
    const vault = await this.ensureVault({ vaultlabel })
    await vault.ensureUnlocked()
    const horizons = { maxMillisSinceRefresh, maxWorldMillis: maxMillisSinceRefresh }
    await vault.hydrate(horizons)
    // A device that has not listed the box would otherwise put over it as if none stood there.
    const found = await vault.getBox(boxlabel, { ...horizons, ifAbsent: 'nil' })
    const timely = { box: found?.sparse ?? null, vault: vault.sparse, boxRefreshedAt: found?.refreshedAt ?? null, vaultRefreshedAt: vault.refreshedAt, timestamp: nowMillis() }
    const boxscope = { ...vault.scope, boxlabel }
    const replacing = { ifAbsent: 'add', ifPresent: 'repl' } as const
    const put = probeStepOf(demandGood(await vault.boxListing.puttable(boxscope, replacing).tryPut({ whisper, sidecar }, { ...horizons, ...replacing })))
    const fetched = demandGood(await vault.boxListing.tryFetch(boxscope))
    const fetch = probeStepOf(fetched)
    await fetched.val?.extractWhisper({ maxMillisSinceRefresh: Infinity })
    return { timely, put, fetch, unseal: { ok: true, timestamp: nowMillis() } }
  }
  // --

  // == [Snapshot]: remakeSnapshot, makeSnapshot

  /** Make the snapshot again, and tell every listener where it differs. Bound, as each listing calls it. */
  readonly #remakeSnapshot = (): void => {
    const next = this.#makeSnapshot()
    const prior = this.#snapshot
    if ((next.stage === prior.stage) && (next.err === prior.err) && (next.vaults === prior.vaults) && (next.openGating === prior.openGating)) { return }
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
    const stage: BankStage = this.#isHelloed ? 'ready' : 'made'
    return Object.freeze({ ...this.scope, stage: this.#endCause ? 'disabled' : stage, err: this.#endCause ?? null, device_id: this.device_id, vaults: this.#vaultListing.snapshot, openGating: this.#vaultListing.openGating })
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
    if (! this.#isHelloed) { throw helloFirst() }
  }
  // --

  /** Answers 'bank', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'bank' { return 'bank' satisfies Modelkind }
}

// == [Host functions]: HostChecks, DefaultOnBadNews, tellBadNewsTo, reportAtError, heedRevokeFailed, DefaultOnLifecycle, guardRequestCleartext, guardOnLifecycle, Handlers, DefaultHandlers

const HostChecks = Checkers('bad_option', ({ fn }) => ({
  requestCleartext: fn<RequestCleartext>(),
  onLifecycle:      fn<LifecycleHandler>(),
}))

/** The `onBadNews` a bank has when given none: each news to the bank's logger. */
export const DefaultOnBadNews: BadNewsHandler = ({ news, bank }) => {
  bank.logger.warn(news.message, { call: 'Bank.onBadNews', refusalkind: news.refusalkind })
}

/** Tell `onBadNews` each of `badnews` that reached `bank`, awaiting none: the handler's throw or rejection reaches only the platform. */
export function tellBadNewsTo(onBadNews: BadNewsHandler, bank: Bank, badnews: readonly VaultError[]): void {
  VX.tellBadNewsToArgs.parse({ onBadNews, bank, badnews })
  for (const news of badnews) {
    // Any answer is heard out, a thenable among them: none is awaited.
    void (async () => {
      try {
        await onBadNews({ news, bank })
      } catch (err) {
        reportToPlatform(err)
      }
    })()
  }
}

// The logger too, as a platform with no reportError (Node, SSR) would hear nothing of it.
/** `refusal` to `bank`'s logger at error, and to the platform. */
function reportAtError(refusal: VaultError, bank: Bank): void {
  bank.logger.error(refusal.message, { call: 'Bank.onLifecycle', refusalkind: refusal.refusalkind })
  reportToPlatform(refusal)
}

// A lock or a vacate meant the lease gone; a tombstone's forget and an outdated row's are tried again by the next lease cached.
/** The default's answer to a cached lease that outlived its revoke. */
function heedRevokeFailed({ refusal, vault, where, bank }: Extract<BankEvent, { kind: 'lease_revoke_failed' }>): void {
  if (where === 'tombstone' || where === 'undeleted') {
    bank.logger.warn(refusal.message, { call: 'Bank.onLifecycle', refusalkind: refusal.refusalkind })
    return
  }
  reportAtError(refusal, bank)
  vault?.vacate()
}

/** The `onLifecycle` a bank has when given none: a lease that outlived a lock or a vacate, and a vacate with a cause, to the logger at error and the platform, the vault vacated; a hello refused but by the bank's end to the logger. */
export const DefaultOnLifecycle: LifecycleHandler = (event) => {
  switch (event.kind) {
  case 'lease_revoke_failed': {
    heedRevokeFailed(event)
    break
  }
  case 'vacated': {
    if (! isVaultError(event.cause, 'disabled')) { reportAtError(event.cause, event.bank) }
    break
  }
  case 'helloed': {
    const { outcome, bank } = event
    if (! outcome.ok && outcome.err.refusalkind !== 'disabled') { bank.logger.warn(outcome.err.message, { call: 'Bank.onLifecycle', refusalkind: outcome.err.refusalkind }) }
    break
  }
  }
}

// What the dialog throws is dropped: it may quote what the user typed.
/** `requestCleartext`, made to honor its contract: the one way a gating asks the user. */
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

/** `onLifecycle`, made to honor its contract: the one way the core tells the host what happened in the bank's life. */
export function guardOnLifecycle(onLifecycle: LifecycleHandler): GuardedLifecycleHandler {
  const host = HostChecks.onLifecycle.parse(onLifecycle, { where: 'onLifecycle' })
  return brandGuarded(async (event: BankEvent): Promise<void> => {
    try {
      await host(event)
    } catch (err) {
      reportToPlatform(err)
    }
  })
}

/** What a bank tells of its life and of bad news: the host's `onLifecycle`, guarded, and its `onBadNews`, or the defaults a disabled bank tells. */
interface Handlers {
  readonly onLifecycle: GuardedLifecycleHandler
  readonly onBadNews:   BadNewsHandler
}

// The defaults vacate only a vault, which a disabled bank has already let go: past the disable they only report.
/** A disabled bank's reports: `DefaultOnLifecycle` and `DefaultOnBadNews`. */
const DefaultHandlers: Handlers = { onLifecycle: guardOnLifecycle(DefaultOnLifecycle), onBadNews: DefaultOnBadNews }
// --

// == [Helpers]: millisOf, checkSecureContext, probeStepOf

/** A storage verb's answer with no wrapped key or ciphertext left in it, and when it came back. */
function probeStepOf({ act, ask, val, world }: GoodAnswer<Box | null, string, unknown>): VX.ProbeStep {
  return { ok: true, act, ask, val: SX.boxSparse.parse(val?.sparse), world: SX.vaultSparse.parse(world), timestamp: nowMillis() }
}

// A host's Infinity minutes, for never, is kept as ForeverMillis: past the entrypoint, nothing is infinite.
function millisOf(minutes: number | undefined, fallback: number): number { return (minutes === undefined ? fallback : Math.min(Math.round(minutes * MinuteMillis), ForeverMillis)) }

function checkSecureContext(): void {
  if ((globalThis as { isSecureContext?: unknown }).isSecureContext === false) { throw insecureContext() }
}
// --
