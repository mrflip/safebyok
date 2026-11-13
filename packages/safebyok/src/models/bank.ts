import type { Modelkind } from '../helpers/consts'
import type { GoodAct } from '../shapes/shapes-enums'
import { nowMillis } from '../helpers/clock'
import { tattoo } from '../helpers/helpers'
import type { CipherCtxRecord } from '../helpers/crypto'
import type { VaultLogger } from '../helpers/logger'
import type { GuardedStrengthChecker } from '../helpers/passphrase-strength'
import { type Outcome, demandGood, good, outcomeOf } from '../refusals/outcome'
import * as Phrases from '../helpers/phrases'
import { actRefused, mainGateMissing, needUnlocked } from '../refusals/throwers'
import { type BankScope, type BankedVaultScope, type VaultScope, bankedVaultScope } from '../shapes/shapes-core'
import type { LeaseDated } from '../shapes/shapes-storage'
import * as BX from '../shapes/shapes-bankdb'
import type { BankRecord, BankSparse } from '../shapes/shapes-bankdb'
import * as GX from '../shapes/shapes-gateish'
import type { AskUser, BankGatingkind, BankStamp, CitedGate, LeaseFriend, SealedWhisper, UnlockByProving } from '../shapes/shapes-gateish'
import * as VX from '../shapes/shapes-vaultish'
import type { BankListingOpts, BankSnapshot, Fetched, RevokeSite } from '../shapes/shapes-vaultish'
import type { GoodAnswer } from '../storage/bank-db'
import type { DeviceDB } from '../storage/device-db'
import type { BankListing } from './bank-listing'
import type { Box } from './box'
import type { Device } from './device'
import type { Gate } from './gate'
import { GateListing } from './gate-listing'
import { Gating } from './gating'
import { Lease } from './lease'
import type { GuardedKeyDeriver, Proving } from './proving'
import { Storable } from './storable'
import type { Vault } from './vault'
import { VaultListing } from './vault-listing'

// == [Defaults]: DefaultLeaseMillis

/** How long a lease lasts where the host names no `autolockMinutes`: fourteen days. */
export const DefaultLeaseMillis = 14 * 24 * 60 * 60_000
// --

/** The signed-in user's bank on this device: its main gate, its lease, and its vaults, one Vault object per scope.
 * Get it from `device.ensureBank()`. A Bank object serves one life of the bank: once the bank is deleted or built again
 * elsewhere, this object is disabled for good, and the next `device.ensureBank()` brings up another.
 */
export class Bank extends Storable<BankScope, BankRecord, BankSparse, BankSnapshot> {
  // == [Props]: user_id, banklabel, bank_tok, listing, #deviceTok, #askUser, #gateListing, #vaultListing, #lease, #leaseFriend

  /** The user's id; with `banklabel`, this bank's scope. */
  declare readonly user_id:   string
  declare readonly banklabel: string
  /** This bank's life token, fixed for this object: a bank built again elsewhere has another. */
  declare readonly bank_tok:  string
  declare readonly listing:   BankListing

  readonly #deviceTok:    string
  /** The host's guarded `requestCleartext`, or null if the host gave none. */
  readonly #askUser:      AskUser | null
  readonly #gateListing:  GateListing
  readonly #vaultListing: VaultListing

  /** The lease attached to this bank; null means locked. */
  #lease: Lease | null = null

  #leaseFriend: LeaseFriend | null = null
  // --

  // == [Getters]: device, device_tok, keyDeriver, deviceDB, logger, strengthChecker, leaseMillis, boxRefreshMillis, stamp, maingate, gateListing, vaultListing

  /** The device this bank belongs to. */
  get device(): Device { return this.listing.device }

  /** The token of this device's row in the deviceDB, which each wayin records. */
  get device_tok(): string { return this.#deviceTok }

  /** The device's key deriver, guarded. */
  get keyDeriver(): GuardedKeyDeriver { return this.device.keyDeriver }

  /** The device database that caches the bank's lease. */
  get deviceDB(): DeviceDB { return this.device.deviceDB }

  /** The device's logger, guarded. */
  get logger(): VaultLogger { return this.device.logger }

  /** The device's strength checker, guarded. */
  get strengthChecker(): GuardedStrengthChecker { return this.device.strengthChecker }

  /** The autolock duration in milliseconds: how long a lease lasts on this device. */
  get leaseMillis(): number { return this.device.leaseMillis }

  /** How old a box may grow before it is fetched again, in milliseconds. */
  get boxRefreshMillis(): number { return this.device.boxRefreshMillis }

  /** This bank's {@link BankStamp}, which every ctx under it binds first. */
  get stamp(): BankStamp { return GX.bankStamp.parse(this) }

  /** The bank's main gate: the wayins a user unlocks with. */
  get maingate(): Gate {
    this.demandEnabled()
    const gate = this.#gateListing.at({ ...this.scope, gatelabel: 'main' })
    if (gate === null) { throw mainGateMissing(this.sparse) }
    return gate
  }

  /** The listing of this bank's gate. */
  get gateListing(): GateListing { return this.#gateListing }

  /** The listing of this bank's vaults. */
  get vaultListing(): VaultListing { return this.#vaultListing }
  // --

  // == [Construction]: constructor, assignInitialProps, launchBirth, vaultScopeOf

  /** The bank for the row `central`, listed in `listing`. A host gets its bank from `device.ensureBank()`. */
  constructor(listing: BankListing, central: Fetched<BankRecord, BankSparse>, opts: BankListingOpts) {
    super(listing, central)
    const { askUser, ...listingOpts } = VX.bankListingOpts.parse(opts)
    this.#deviceTok = VX.bankArgs.parse({ device: listing.device, device_tok: listing.device.device_tok }).device_tok
    this.#askUser = askUser
    this.#gateListing = new GateListing(this, listingOpts)
    this.#vaultListing = new VaultListing(this, listingOpts)
  }

  /** Fix `bank_tok` on this bank, beside the base's props. */
  protected override assignInitialProps(central: Fetched<BankRecord, BankSparse>): void {
    tattoo(this, { bank_tok: central.bank_tok }, { configurable: false })
    super.assignInitialProps(central)
  }

  /** Build the bank over `expected`, a tombstone or void row, through a `build_bank` gating, resolving it unlocked. */
  static launchBirth(listing: BankListing, expected: BankSparse, askUser: AskUser | null): Promise<Bank> {
    return Gating.launchBirth(listing, expected, Bank.#unlockBankByProving, askUser)
  }

  /** The full {@link VaultScope} of `scope` in this bank, refusing a scope of another bank. */
  vaultScopeOf(scope: BankedVaultScope): VaultScope {
    const { vaultlabel } = bankedVaultScope.parseConsistent(scope, this.scope, { message: Phrases.otherScope })
    return { ...this.scope, vaultlabel }
  }
  // --

  // == [Above its gate and vaults]: receiveParent

  // The bank listing receives the parent as it would a row from any bank request: a newer row of another life ends
  // this Bank.
  /** Deliver the bank row a gate or vault answer carries. */
  receiveParent(parent: unknown): void { this.listing.deliverRecord(BX.bankRow.refusingAs('record_conflict').parse(parent)) }
  // --

  // == [Prompting]: prompt, ensureUnlocked, unlock, delPrompt, each with its try form

  /** Ask the user through a gating of `gatingkind`, resolving this bank once the change it names is made. */
  async prompt(gatingkind: BankGatingkind): Promise<this> {
    await Gating.launchOn(this, gatingkind, Bank.#unlockBankByProving, this.#askUser)
    return this
  }

  /** Unlock this bank if it is locked: from the lease cached on this device if it can, else by asking the user. */
  async ensureUnlocked(): Promise<this> {
    const gate = await this.maingate.ensureTimely(VX.Promptly); this.demandEnabled()
    if (this.isUnlocked) { return this }
    const cached = await Lease.buildFromCache(this.#leaseFriendOf(), gate)
    if (cached) { await this.#attachLease(cached); return this }
    return this.unlock()
  }

  /** Non-throwing form of {@link ensureUnlocked}. */
  tryEnsureUnlocked(): Promise<Outcome<this>> { return outcomeOf(() => this.ensureUnlocked()) }

  /** Unlock by asking the user for a passphrase or passkey, even when a lease is attached or cached. */
  async unlock(): Promise<this> {
    await this.maingate.ensureTimely(VX.Promptly); this.demandEnabled()
    return this.prompt('unlock_bank')
  }

  /** Non-throwing form of {@link unlock}. */
  tryUnlock(): Promise<Outcome<this>> { return outcomeOf(() => this.unlock()) }

  /** Delete this bank, its gate, its vaults and their boxes, once the user proves it through a `del_bank` gating.
   * This Bank is then disabled for good, and the device has no bank until the next `device.ensureBank()`.
   */
  async delPrompt(): Promise<this> {
    await this.maingate.ensureTimely(VX.Promptly); this.demandEnabled()
    return this.prompt('del_bank')
  }

  /** Non-throwing form of {@link delPrompt}. */
  tryDelPrompt(): Promise<Outcome<this>> { return outcomeOf(() => this.delPrompt()) }
  // --

  // == [The lease]: lock, autolock, revokeLease, unlockByProving, attachLease

  // At the bank's end, a lock is its one duty: the lease and every exposed whisper are dropped, and the watches end. The
  // row cached is left: a sweep leaves it for the next page, a vacate forgets every lease of the bank scope itself.
  /** Lock the bank, and forget the lease cached on this device.
   * The snapshots of the bank and of its boxes show the lock before this returns. A failed forget is announced as
   * `lease_revoke_failed`, never thrown. Once the bank is disabled, a lock leaves the cached lease in place.
   */
  lock(): this {
    if (this.isEnabled) {
      void this.#revokeLease('lock')
    } else {
      this.#lease?.evict()
      this.#lease = null
    }
    this.align()
    return this
  }

  /** Lock the bank if the lease cached on this device has expired. Call it after `device.ensureBank()`, and on a timer of your own.
   * Autolock is a best-effort reminder, not a guarantee: a device database refusal or a damaged row is told as bad news, and
   * nothing locks.
   */
  async autolock(): Promise<void> {
    const expiring = await Lease.tryExpiresAt(this.#leaseFriendOf())
    if (! expiring.ok) { this.device.tellBadNews([expiring.err]); return }
    if ((expiring.val !== null) && (expiring.val < nowMillis())) { this.lock() }
  }

  /** Drop the attached lease and forget the cached row, announcing a failed forget as from `where`. */
  async #revokeLease(where: Exclude<RevokeSite, 'undeleted'>): Promise<void> {
    // The lease goes first, so a refused forget leaves none; the forget starts before any await, so forgets start in call order.
    const granted = this.#lease
    this.#lease = null
    const revoking = granted?.tryRevoke() ?? Lease.tryForget(this.#leaseFriendOf())
    const revoked = await revoking
    if (! revoked.ok) { this.device.announce({ kind: 'lease_revoke_failed', refusal: revoked.err, bank: this, where }) }
  }

  /** Build the lease `proved` earns, citing `cited`, and attach it.
   * The attach undoes a `lock()` made while the lease was built: the proving shows this user may unlock.
   */
  async #unlockByProving(proved: Proving, cited: CitedGate = this.maingate): Promise<this> {
    const lease = await proved.buildLease(this.#leaseFriendOf(), cited)
    await this.#attachLease(lease)
    return this
  }

  /** Attach `lease` to this bank, and cache it on this device. */
  async #attachLease(lease: Lease): Promise<void> {
    this.demandEnabled()
    this.#lease = lease
    await lease.cacheAsCacheCan()
    this.align()
  }
  // --

  // == [The gating's unlock]: unlockBankByProving

  // A gating comes to #unlockByProving by this, as no public method of a bank accepts a proving (G9).
  static readonly #unlockBankByProving: UnlockByProving = (bank, proved, cited) => bank.#unlockByProving(proved, cited)
  // --

  // == [The lease's friend]: leaseFriendOf, makeLeaseFriend

  /** This bank's {@link LeaseFriend}, made on first use. */
  #leaseFriendOf(): LeaseFriend {
    this.#leaseFriend ??= this.#makeLeaseFriend()
    return this.#leaseFriend
  }

  #makeLeaseFriend(): LeaseFriend {
    const { logger, deviceDB, leaseMillis } = this
    const asked = { ...this.scope, bank_tok: this.bank_tok }
    return {
      ...this.stamp,
      logger,
      leaseMillis,
      lock:            () => { this.lock() },
      peekLease:       () => deviceDB.peek(asked),
      tryCacheLease:   (record) => deviceDB.tryStow(record),
      forgetLease:     () => deviceDB.forget(asked),
      tryForgetLease:  async (): Promise<Outcome<void>> => {
        const outcome = await deviceDB.tryForget(asked)
        if (! outcome.ok) { this.device.announce({ kind: 'lease_revoke_failed', refusal: outcome.err, bank: this, where: 'undeleted' }) }
        return outcome
      },
      tellBadNews:     (badnews) => { this.device.tellBadNews(badnews) },
    }
  }
  // --

  // == [Sealing for the vaults]: sealWith, unsealWith

  /** Seal `whisperText` under this bank's lease, bound to the bank's stamp and then `stamps`, in order.
   * Needs the bank unlocked. {@link unsealWith} needs the same stamps in the same order.
   */
  async sealWith(whisperText: string, stamps: readonly CipherCtxRecord[]): Promise<SealedWhisper> {
    const checked = GX.leaseSealArgs.parse({ whisperText, stamps })
    return this.#demandLease().sealWith(checked.whisperText, checked.stamps)
  }

  /** The whisper text in `sealed`, under this bank's lease, given the stamps it was sealed with, in the same order. */
  async unsealWith(sealed: SealedWhisper, stamps: readonly CipherCtxRecord[]): Promise<string> {
    const checked = GX.leaseUnsealArgs.parse({ sealed, stamps })
    return this.#demandLease().unsealWith(checked.sealed, checked.stamps)
  }
  // --

  // == [Vaults]: vaultAt, ensureVault, tryEnsureVault, tryProbe, probe

  /** Vault **or tombstone** listed at `scope`, or null if none is listed. */
  vaultAt(scope: BankedVaultScope): Vault | null {
    this.demandEnabled()
    return this.#vaultListing.at(this.vaultScopeOf(scope))
  }

  /** The vault at `scope`, as listed or stored, creating it if absent (void or tombstoned). A locked bank will do. */
  async ensureVault(scope: BankedVaultScope): Promise<Vault> {
    const asked = this.vaultScopeOf(scope)
    this.demandEnabled()
    const listed = this.#vaultListing.at(asked)
    if (listed?.isPresent === true) { return listed }
    const expected = listed?.sparse ?? BX.shellVaultOf(asked)
    return this.#vaultListing.put(this.#vaultListing.recordOfBirth(asked, expected), { expected, ifAbsent: 'add', ifPresent: 'get' })
  }

  /** Non-throwing form of {@link ensureVault}. */
  tryEnsureVault(scope: BankedVaultScope): Promise<Outcome<Vault>> { return outcomeOf(() => this.ensureVault(scope)) }

  /** Test this bank's storage end to end at startup: put one box, fetch it back and extract its whisper, reporting each step.
   * The box at `asked.boxlabel` is overwritten. A locked bank asks the user. The report carries no whisper, wrapped key or ciphertext.
   */
  tryProbe(asked: VX.ProbeAsked = {}, opts: VX.ProbeOpts = {}): Promise<Outcome<VX.ProbeReport>> { return outcomeOf(() => this.#probe(asked, opts)) }

  async #probe(asked: VX.ProbeAsked, opts: VX.ProbeOpts): Promise<VX.ProbeReport> {
    const { vaultlabel, boxlabel, whisper, sidecar } = VX.probeAsked.parse(asked)
    const { maxMillisSinceRefresh, maxMillisAtGetBack } = VX.probeOpts.parse(opts)
    await this.ensureUnlocked()
    const vault = await this.ensureVault({ vaultlabel })
    const horizons = { maxMillisSinceRefresh, maxParentMillis: maxMillisSinceRefresh }
    await vault.hydrate(horizons)
    // A device that has not listed the box would otherwise put over it as if none stood there.
    const found = await vault.getBox(boxlabel, { ...horizons, ifAbsent: 'nil' })
    const timely = { box: found?.sparse ?? null, vault: vault.sparse, boxRefreshedAt: found?.refreshedAt ?? null, vaultRefreshedAt: vault.refreshedAt, timestamp: nowMillis() }
    const boxscope = { ...vault.scope, boxlabel }
    const replacing = { ifAbsent: 'add', ifPresent: 'repl' } as const
    const put = probeStepOf(demandGood(await vault.boxListing.puttable(boxscope, replacing).tryPut({ whisper, sidecar }, { ...horizons, ...replacing })))
    const fetched = demandGood(await vault.boxListing.tryGet(boxscope, { maxMillisSinceRefresh: maxMillisAtGetBack }))
    const fetch = probeStepOf(fetched)
    await fetched.val?.extractWhisper({ maxMillisSinceRefresh: Infinity })
    return { timely, put, fetch, unseal: { ok: true, timestamp: nowMillis() } }
  }
  // --

  // == [Guards]: isEnabled, isPresent, isLocked, isUnlocked, demandLease, demandPresent

  /** True while this bank is usable: its device is enabled, and it is listed and present. */
  override get isEnabled(): boolean { return super.isEnabled && this.isPresent }

  // A tombstone carries a life token of its own, and a bank built again elsewhere another: either ends this Bank's life,
  // and takes it out of its listing's list.
  /** True when the record in hand is a live row of this Bank's life. */
  override get isPresent(): boolean { return super.isPresent && (this.central.bank_tok === this.bank_tok) }

  /** True when no lease is attached to this bank. */
  get isLocked(): boolean { return this.#lease === null }

  /** True when a lease is attached to this bank. */
  get isUnlocked(): boolean { return this.#lease !== null }

  #demandLease(): Lease {
    this.demandEnabled().demandPresent()
    if (this.#lease === null) { throw needUnlocked() }
    return this.#lease
  }

  /** Demand that this bank is present. */
  demandPresent(): this {
    if (! this.isPresent) { throw actRefused('vault', 'bank_gone') }
    return this
  }
  // --

  // == [Aligning]: align

  // Dismissed once everything below is aligned: the dismiss tells the device's listeners.
  /** Align (see {@link Storable.align}), dismissing a gating open for this bank once its life has ended. Never throws. */
  override align(): void {
    super.align()
    if (! this.isPresent) { this.device.dismissGatingAtDiscard(this) }
  }
  // --

  // == [Protected, overriding Storable's]: adopt, children, isFullRecord, lifeTokPathOf, makeSnapshot

  // The lease goes before the align, so that every snapshot below shows the bank locked.
  /** Adopt `central`. A tombstone, or a row of another life, disables this bank for good, and its lease is dropped and the cached row forgotten.
   * A failed forget is announced as `lease_revoke_failed`.
   */
  protected override adopt(central: Fetched<BankRecord, BankSparse>): void {
    super.adopt(central)
    if (! this.isPresent) { void this.#revokeLease('tombstone') }
  }

  /** The bank's gate listing and vault listing. */
  protected get children(): readonly [GateListing, VaultListing] { return [this.#gateListing, this.#vaultListing] }

  /** True for a live row: a bank row has no encrypted part, so a live one is always full. */
  protected isFullRecord(fetched: BankSparse): fetched is BankRecord { return fetched.am === 'a' }

  /** The life token of a bank row: its `bank_tok`. */
  protected lifeTokPathOf({ bank_tok }: Fetched<BankRecord, BankSparse>): string { return bank_tok }

  protected makeSnapshot(): BankSnapshot {
    return Object.freeze({ ...this.scope, device_tok: this.device_tok, isLocked: this.isLocked })
  }
  // --

  /** Always `'bank'`: marks this model for a {@link Modelkind} check. */
  get modelkind(): 'bank' { return 'bank' satisfies Modelkind }
}

// == [Helpers]: listOwnLeases, probeStepOf

/** The leases cached in `deviceDB` for the bank scope `scope`, oldest first. */
export async function listOwnLeases(deviceDB: DeviceDB, { user_id, banklabel }: BankScope): Promise<Outcome<LeaseDated[]>> {
  const listed = await deviceDB.tryListLeases()
  return listed.ok ? good(listed.val.filter((row) => (row.user_id === user_id) && (row.banklabel === banklabel))) : listed
}

/** A probe step from a box verb's answer, with no wrapped key or ciphertext left in it, timed now. */
function probeStepOf({ act, ask, val, parent }: GoodAnswer<Box | null, GoodAct, unknown>): VX.ProbeStep {
  return { ok: true, act, ask, val: BX.boxSparse.parse(val?.sparse), parent: BX.vaultRow.parse(parent), timestamp: nowMillis() }
}
// --
