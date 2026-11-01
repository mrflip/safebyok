import { noop } from 'es-toolkit'
import { verifyConsistent } from '../checks/validator'
import { MinuteMillis } from '../consts'
import { randomId } from '../crypto'
import { type KeyDeriver, isTestDeriver } from '../deriver/basederiver'
import { VaultError } from '../errors'
import * as RefusalFuncs from '../helpers/refusal-funcs'
import { tattoo } from '../helpers'
import { DefaultLogger, type VaultLogger } from '../logger'
import { type Outcome, outcomeOf } from '../outcome'
import * as Phrases from '../phrases'
import { type Clock, wallClock } from '../shapes/bank-opts'
import { type BankScope, type VaultBag, type VaultScope, bankScope, vaultBag } from '../shapes/scopes'
import { Gating, type GatingWorld, type RequestCleartext } from './gating'
import type { LeaseDeviceDB, LockState, ProofClosure, StrengthChecker } from './models-shapes'
import * as MSX from './models-shapes'
import { DefaultLeaseMillis, type Vault, type VaultSnapshot } from './vault'
import { type VaultCache, type VaultStore, type VaultWorld, VaultListing } from './vault-listing'

// == [Given to a bank]: DefaultPesterMillis, DefaultRefreshMillis, BankOpts, BankSnapshot, RefusingStrengthChecker

export const DefaultPesterMillis = 7 * 24 * 60 * MinuteMillis

export const DefaultRefreshMillis = 5 * MinuteMillis

export type BankOpts = {
  applabel:             string
  user_id:              string
  device_id?:           string | undefined
  vaultStore:           VaultStore
  vaultCache:           VaultCache
  deviceDB:             LeaseDeviceDB
  keyDeriver:           KeyDeriver
  requestCleartext?:    RequestCleartext | undefined
  strengthChecker?:     StrengthChecker | undefined
  clock?:               Clock | undefined
  logger?:              VaultLogger | undefined
  autolockMinutes?:     number | undefined
  pesterMinutes?:       number | undefined
  vaultRefreshMinutes?: number | undefined
  boxRefreshMinutes?:   number | undefined
  onBadNews?:           ((news: VaultError) => unknown) | undefined
}

export type BankSnapshot = BankScope & Readonly<{ device_id: string, vaults: readonly VaultSnapshot[] }>

const RefusingStrengthChecker: StrengthChecker = () => ({ strong: false, reason: Phrases.NoStrengthChecker })
// --

// == [Bank]

export class Bank implements VaultWorld, GatingWorld {
  declare readonly applabel: string
  declare readonly user_id:  string
  readonly scope:            BankScope
  readonly device_id:        string
  readonly clock:            Clock
  readonly keyDeriver:       KeyDeriver
  readonly deviceDB:         LeaseDeviceDB
  readonly logger:           VaultLogger
  readonly requestCleartext: RequestCleartext | undefined
  readonly strengthChecker:  StrengthChecker
  readonly leaseMillis:      number
  // GAP: vault-listing.ts `VaultWorld` and models-shapes.ts `vaultListingOpts` name no `pesterMillis`; the vault's pester trigger would read it as `autolock` reads `leaseMillis`, and offer `pesterMinutes` as a getter.
  readonly pesterMillis:     number
  // GAP: the box listing a vault makes would take `boxRefreshMillis` as its `maxMillisSinceRefresh`; no vault makes one yet.
  readonly boxRefreshMillis: number
  readonly vaultListing:     VaultListing

  #snapshot: BankSnapshot | null = null

  static make(opts: BankOpts): Bank { return new Bank(opts) }

  constructor(opts: BankOpts) {
    checkSecureContext()
    MSX.bankOpts.parse(opts)
    const { applabel, user_id, device_id = randomId(), vaultStore, vaultCache, deviceDB, keyDeriver, requestCleartext, strengthChecker = RefusingStrengthChecker, clock = wallClock, logger = DefaultLogger, autolockMinutes, pesterMinutes, vaultRefreshMinutes, boxRefreshMinutes, onBadNews } = opts
    this.scope = bankScope.parse({ applabel, user_id })
    tattoo(this, this.scope, { writable: false })
    this.device_id = device_id
    this.clock = clock
    this.keyDeriver = keyDeriver
    this.deviceDB = deviceDB
    this.logger = logger
    this.requestCleartext = requestCleartext
    this.strengthChecker = strengthChecker
    this.leaseMillis = millisOf(autolockMinutes, DefaultLeaseMillis)
    this.pesterMillis = millisOf(pesterMinutes, DefaultPesterMillis)
    this.boxRefreshMillis = millisOf(boxRefreshMinutes, DefaultRefreshMillis)
    this.vaultListing = new VaultListing({ world: this, store: vaultStore, cache: vaultCache, maxMillisSinceRefresh: millisOf(vaultRefreshMinutes, DefaultRefreshMillis), onBadNews })
    if (isTestDeriver(keyDeriver)) { logger.warn(Phrases.TestDeriverNotice, { call: 'Bank.make' }) }
    Object.freeze(this)
  }

  // == [The world of its vaults]: lockState, ensureTimely, takeWorld, autolockMinutes, pesterMinutes

  lockState(): LockState { return 'unlocked' }

  ensureTimely(): Promise<void> { return Promise.resolve() }

  takeWorld(): void { noop() }

  get autolockMinutes(): number { return this.leaseMillis / MinuteMillis }

  get pesterMinutes(): number { return this.pesterMillis / MinuteMillis }
  // --

  // == [Starting and ending]: hello, goodbye

  async hello(): Promise<void> {
    await this.keyDeriver.load?.()
    await this.strengthChecker.load?.()
    await this.vaultListing.hello()
  }

  tryHello(): Promise<Outcome<void>> { return outcomeOf(() => this.hello()) }

  goodbye(): void { this.vaultListing.goodbye() }
  // --

  // == [Vaults]: vaultScopeOf, vaultOf, ensureVault, closeVault, closeVaults, with ensureVault's try form

  vaultScopeOf(bag: VaultBag): VaultScope {
    const { vaultlabel } = verifyConsistent(vaultBag.parse(bag), this.scope, { kind: 'bad_scope', message: Phrases.otherScope })
    return { ...this.scope, vaultlabel }
  }

  vaultOf(bag: VaultBag): Vault | null { return this.vaultListing.at(this.vaultScopeOf(bag)) }

  async ensureVault(bag: VaultBag, proofClosure?: ProofClosure): Promise<Vault> {
    const scope = this.vaultScopeOf(bag)
    const fetched = await this.vaultListing.fetch(scope, { ifAbsent: 'nil' })
    if (fetched !== null) { return fetched }
    const built = await outcomeOf(() => this.#buildVault(scope, proofClosure))
    if (built.ok) { return built.val }
    if (built.err.refusalkind !== 'stale_write') { throw built.err }
    // GAP: listing.ts keeps the draft held under `scope` after its first send meets 'stale_write', and `Vault.receive` refuses the record stored under the other `vault_tok`; the listing needs to drop the draft (or `#buildOrReceive` to replace a never-stored draft) for this fetch to hand back the vault another device built.
    const stored = await this.vaultListing.fetch(scope)
    if (stored === null) { throw this.vaultListing.absentRefusal(scope) }
    return stored
  }

  tryEnsureVault(bag: VaultBag, proofClosure?: ProofClosure): Promise<Outcome<Vault>> { return outcomeOf(() => this.ensureVault(bag, proofClosure)) }

  async #buildVault(scope: VaultScope, proofClosure?: ProofClosure): Promise<Vault> {
    if (proofClosure === undefined) { return Gating.buildVault(this.vaultListing, scope, this) }
    const vault = await this.vaultListing.build(scope, proofClosure)
    return vault.send({})
  }

  closeVault(bag: VaultBag): void {
    this.vaultOf(bag)?.lock()
    // GAP: listing.ts has no verb to drop a held thing; `Listing.release(scope)` (delete it from `#things`, drop its subscription, remake the snapshot) would finish the close, and `closeVaults` would call it for each. Until then the locked vault stays listed.
  }

  closeVaults(): void {
    for (const vault of this.vaultListing.things) { vault.lock() }
  }
  // --

  // == [Snapshot and subscription]: snapshot, getSnapshot, subscribe, toJSON

  get snapshot(): BankSnapshot {
    const vaults = this.vaultListing.snapshot
    if (this.#snapshot?.vaults !== vaults) { this.#snapshot = Object.freeze({ ...this.scope, device_id: this.device_id, vaults }) }
    return this.#snapshot
  }

  get getSnapshot(): () => BankSnapshot { return this.#getSnapshot }
  readonly #getSnapshot = (): BankSnapshot => this.snapshot

  get subscribe(): (listener: () => void) => (() => void) { return this.vaultListing.subscribe }

  toJSON(): BankSnapshot { return this.snapshot }
  // --
}
// --

// == [Helpers]: millisOf, checkSecureContext

const millisOf = (minutes: number | undefined, fallback: number): number => (minutes === undefined ? fallback : minutes * MinuteMillis)

const checkSecureContext = (): void => {
  if ((globalThis as { isSecureContext?: unknown }).isSecureContext === false) { throw RefusalFuncs.insecureContext() }
}
// --
