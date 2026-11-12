import type { Modelkind } from '../helpers/consts'
import type { GoodAct } from '../shapes/shapes-enums'
import { nowMillis } from '../helpers/clock'
import { tattoo } from '../helpers/helpers'
import type { CipherCtxRecord } from '../helpers/crypto'
import type { VaultLogger } from '../helpers/logger'
import type { GuardedStrengthChecker } from '../helpers/passphrase-strength'
import { type Outcome, demandGood, good, outcomeOf } from '../refusals/outcome'
import * as Phrases from '../helpers/phrases'
import { actRefused, instanceDisabled, mainGateMissing, needUnlocked } from '../refusals/throwers'
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

/** The signed-in user's bank on this device, kept in step with its row: its main gate, its one lease, and its vaults, one Vault object per scope. Made by the {@link Device}, through `device.ensureBank()`.
 * One Bank object is one life of the bank: deleted, or built again elsewhere, it answers nothing more, and the device's next `ensureBank` makes another.
 */
export class Bank extends Storable<BankScope, BankRecord, BankSparse, BankSnapshot> {
  // == [Props]: user_id, banklabel, bank_tok, listing, #deviceTok, #askUser, #gateListing, #vaultListing, #lease, #leaseFriend

  /** The scope, tattooed on by Storable's constructor. */
  declare readonly user_id:   string
  declare readonly banklabel: string
  /** This bank's life, inscribed once by `assignInitialProps` and never moved: one Bank object is one life of the bank. */
  declare readonly bank_tok:  string
  declare readonly listing:   BankListing

  readonly #deviceTok:    string
  /** The host's dialog, guarded, as the device handed it; null with none. */
  readonly #askUser:      AskUser | null
  readonly #gateListing:  GateListing
  readonly #vaultListing: VaultListing

  /** The lease granted on this device, and null is what locked means. */
  #lease: Lease | null = null

  #leaseFriend: LeaseFriend | null = null
  // --

  // == [Getters]: device, device_tok, keyDeriver, deviceDB, logger, strengthChecker, leaseMillis, boxRefreshMillis, stamp, maingate, gateListing, vaultListing

  /** The device that made this bank: its options, its host's functions, its open gating and its end. */
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

  /** How long an unlock lasts on this device. */
  get leaseMillis(): number { return this.device.leaseMillis }

  /** The refresh horizon of each vault's boxes. */
  get boxRefreshMillis(): number { return this.device.boxRefreshMillis }

  /** This bank's stamp, fixed for its life: what every ctx under it binds first. */
  get stamp(): BankStamp { return GX.bankStamp.parse(this) }

  /** The bank's one gate, which each unlock proves against. */
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

  /** Construct the storable bank, with the host's dialog, and a listing for its gate and one for its vaults. */
  constructor(listing: BankListing, central: Fetched<BankRecord, BankSparse>, opts: BankListingOpts) {
    super(listing, central)
    const { askUser, ...listingOpts } = VX.bankListingOpts.parse(opts)
    this.#deviceTok = VX.bankArgs.parse({ device: listing.device, device_tok: listing.device.device_tok }).device_tok
    this.#askUser = askUser
    this.#gateListing = new GateListing(this, listingOpts)
    this.#vaultListing = new VaultListing(this, listingOpts)
    this.#gateListing.subscribe(() => { this.align() })
    // A vault brought up to a lock not yet told waits for the bank's own align, which tells the lock and every vault at once.
    this.#vaultListing.subscribe(() => { if (this.snapshot.isLocked === this.isLocked) { this.align() } })
  }

  /** Inscribes this bank's `bank_tok` beside what the base inscribes. */
  protected override assignInitialProps(central: Fetched<BankRecord, BankSparse>): void {
    tattoo(this, { bank_tok: central.bank_tok }, { configurable: false })
    super.assignInitialProps(central)
  }

  /** Builds a bank through a build_bank gating, over the row `expected`, a tombstone or none, and answers it unlocked. */
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

  /** Ask the user, through a gating of `gatingkind`, to prove the change it names, and answer this bank once it is made. */
  async prompt(gatingkind: BankGatingkind): Promise<this> {
    await Gating.launchOn(this, gatingkind, Bank.#unlockBankByProving, this.#askUser)
    return this
  }

  /** This bank unlocked: as it stands, else by the lease cached on this device, else by {@link unlock}. */
  async ensureUnlocked(): Promise<this> {
    const gate = await this.maingate.ensureTimely(VX.Promptly); this.demandPromptable()
    if (this.isUnlocked) { return this }
    const cached = await Lease.buildFromCache(this.#leaseFriendOf(), gate)
    if (cached) { await this.#attachLease(cached); return this }
    return this.unlock()
  }

  /** Non-throwing form of {@link ensureUnlocked}. */
  tryEnsureUnlocked(): Promise<Outcome<this>> { return outcomeOf(() => this.ensureUnlocked()) }

  /** Ask the user for a passphrase or passkey, and unlock by its proving. */
  async unlock(): Promise<this> {
    await this.maingate.ensureTimely(VX.Promptly); this.demandPromptable()
    return this.prompt('unlock_bank')
  }

  /** Non-throwing form of {@link unlock}. */
  tryUnlock(): Promise<Outcome<this>> { return outcomeOf(() => this.unlock()) }

  /** Delete this bank, its gate, its vaults and their boxes through a del_bank gating, which asks for the passphrase. This Bank answers nothing more, and the device has no bank until its next `ensureBank`. */
  async delPrompt(): Promise<this> {
    await this.maingate.ensureTimely(VX.Promptly); this.demandPromptable()
    return this.prompt('del_bank')
  }

  /** Non-throwing form of {@link delPrompt}. */
  tryDelPrompt(): Promise<Outcome<this>> { return outcomeOf(() => this.delPrompt()) }
  // --

  // == [The lease]: lock, autolock, revokeLease, unlockByProving, attachLease, alignAll

  // At the bank's end, a lock is its one duty: the lease and every exposed whisper are dropped, and the watches end. The
  // row cached is left: a sweep leaves it for the next page, a vacate forgets every lease of the bank scope itself.
  /** Lock the bank, its vaults and their boxes before returning, and forget the row cached on this device; past the bank's end, leave that row.
   * A failed revoke is announced as `lease_revoke_failed` and does not throw.
   */
  lock(): this {
    if (this.isEnabled) {
      void this.#revokeLease('lock')
      return this
    }
    this.#lease?.evict()
    this.#lease = null
    this.#vaultListing.goodbye()
    this.#alignAll()
    return this
  }

  /** Lock the bank where the lease cached on this device has expired. Call it after `ensureBank` and on your own timer.
   * A best-effort reminder, not a guarantee: a cache that refuses or a row that will not read is told as bad news.
   */
  async autolock(): Promise<void> {
    const expiring = await Lease.tryExpiresAt(this.#leaseFriendOf())
    if (! expiring.ok) { this.device.tellBadNews([expiring.err]); return }
    if ((expiring.val !== null) && (expiring.val < nowMillis())) { this.lock() }
  }

  /** Drops any lease granted and forgets the row cached on this device, announcing a failed revoke at `where`. */
  async #revokeLease(where: Exclude<RevokeSite, 'undeleted'>): Promise<void> {
    // The lease goes first, so a refused forget leaves none; the forget starts before any await, so forgets start in call order.
    const granted = this.#lease
    this.#lease = null
    const revoking = granted?.tryRevoke() ?? Lease.tryForget(this.#leaseFriendOf())
    this.#alignAll()
    const revoked = await revoking
    if (! revoked.ok) { this.device.announce({ kind: 'lease_revoke_failed', refusal: revoked.err, bank: this, where }) }
  }

  /** Attach the lease `proved` earns, citing `cited`. A `lock()` made while the lease is being built is undone by it: the proving shows this user may unlock. */
  async #unlockByProving(proved: Proving, cited: CitedGate = this.maingate): Promise<this> {
    const lease = await proved.buildLease(this.#leaseFriendOf(), cited)
    await this.#attachLease(lease)
    return this
  }

  /** Attach `lease` to this bank, and cache it on this device. */
  async #attachLease(lease: Lease): Promise<void> {
    this.demandAttachable()
    this.#lease = lease
    await lease.cacheAsCacheCan()
    this.#alignAll()
  }

  // The vaults first, the bank's own align last: the device is told once, every vault's lock and the bank's together.
  /** Bring each vault listed, and its boxes, up to this bank's lock, which their snapshots show, and then this bank's own snapshot. */
  #alignAll(): void {
    for (const vault of this.#vaultListing.things) { vault.alignLock() }
    this.align()
  }
  // --

  // == [The gating's unlock]: unlockBankByProving

  // A gating comes to #unlockByProving by this, as no public method of a bank accepts a proving (G9).
  static readonly #unlockBankByProving: UnlockByProving = (bank, proved, cited) => bank.#unlockByProving(proved, cited)
  // --

  // == [The lease's friend]: leaseFriendOf, makeLeaseFriend

  /** All a lease or a proving hears of this bank, made once. */
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

  /** `whisperText` sealed under a fresh boxKey under the bankKey, each bound to the bank's stamp and then to `stamps`, in order. */
  async sealWith(whisperText: string, stamps: readonly CipherCtxRecord[]): Promise<SealedWhisper> {
    const checked = GX.leaseSealArgs.parse({ whisperText, stamps })
    return this.#demandLease().sealWith(checked.whisperText, checked.stamps)
  }

  /** The text `sealed` contains, bound to the bank's stamp and then to `stamps`, in order. */
  async unsealWith(sealed: SealedWhisper, stamps: readonly CipherCtxRecord[]): Promise<string> {
    const checked = GX.leaseUnsealArgs.parse({ sealed, stamps })
    return this.#demandLease().unsealWith(checked.sealed, checked.stamps)
  }
  // --

  // == [Vaults]: vaultAt, ensureVault, tryEnsureVault, tryProbe, probe

  /** The vault listed for `scope`, a tombstone among them, or null. */
  vaultAt(scope: BankedVaultScope): Vault | null {
    this.demandEnabled()
    return this.#vaultListing.at(this.vaultScopeOf(scope))
  }

  /** The vault for `scope`: the one listed, else the one stored, else one put now, which needs the bank unlocked. */
  async ensureVault(scope: BankedVaultScope): Promise<Vault> {
    const asked = this.vaultScopeOf(scope)
    this.demandEnabled()
    const listed = this.#vaultListing.at(asked)
    if (listed?.isPresent === true) { return listed }
    this.demandUnlocked()
    const expected = listed?.sparse ?? BX.shellVaultOf(asked)
    return this.#vaultListing.put(this.#vaultListing.recordOfBirth(asked, expected), { expected, ifAbsent: 'add', ifPresent: 'get' })
  }

  /** Non-throwing form of {@link ensureVault}. */
  tryEnsureVault(scope: BankedVaultScope): Promise<Outcome<Vault>> { return outcomeOf(() => this.ensureVault(scope)) }

  /** Trials this bank's storage end to end at startup and reports each step, asking the user if the bank needs it: replaces one box, fetches it back and opens it, surfacing nothing it held. */
  tryProbe(asked: VX.ProbeAsked = {}, opts: VX.ProbeOpts = {}): Promise<Outcome<VX.ProbeReport>> { return outcomeOf(() => this.#probe(asked, opts)) }

  async #probe(asked: VX.ProbeAsked, opts: VX.ProbeOpts): Promise<VX.ProbeReport> {
    const { vaultlabel, boxlabel, whisper, sidecar } = VX.probeAsked.parse(asked)
    const { maxMillisSinceRefresh, maxMillisAtGetBack } = VX.probeOpts.parse(opts)
    await this.ensureUnlocked()
    const vault = await this.ensureVault({ vaultlabel })
    const horizons = { maxMillisSinceRefresh, maxWorldMillis: maxMillisSinceRefresh }
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

  // == [Guards]: isEnabled, demandEnabled, isLocked, isUnlocked, demandLease, demandPromptable, demandAttachable, demandPresent

  /** Whether this bank answers: its device does, and it is the device's bank, a live row of this life in hand. */
  override get isEnabled(): boolean { return super.isEnabled && this.#isLiveOfLife }

  /** Demand that this bank answers: see {@link isEnabled}. */
  override demandEnabled(): this {
    super.demandEnabled()
    if (! this.#isLiveOfLife) { throw instanceDisabled() }
    return this
  }

  // A tombstone carries a life token of its own, and a bank built again elsewhere another.
  /** Whether the record in hand is a live row of this Bank's life. */
  get #isLiveOfLife(): boolean { return this.isPresent && (this.central.bank_tok === this.bank_tok) }

  /** True unless this device has a lease granted and in force. */
  get isLocked(): boolean { return this.#lease === null }

  /** True while this bank has a lease granted. */
  get isUnlocked(): boolean { return this.#lease !== null }

  #demandLease(): Lease {
    this.demandEnabled().demandPresent()
    if (this.#lease === null) { throw needUnlocked() }
    return this.#lease
  }

  /** A prompt needs the bank enabled and present. */
  demandPromptable(): this { return this.demandEnabled().demandPresent() }

  /** An attach needs the bank enabled and present. */
  demandAttachable(): this { return this.demandEnabled().demandPresent() }

  /** Demand that this bank is present. */
  demandPresent(): this {
    if (! this.isPresent) { throw actRefused('vault', 'bank_gone') }
    return this
  }
  // --

  // == [Protected, overriding Storable's]: adopt, isFullRecord, lifeTokPathOf, makeSnapshot

  /** Adopt `central`. A tombstone, or a newer row of another life, ends this bank: it locks, forgets the cached row, ends the watch and dismisses a gating open for it, staying listed.
   * A failed revoke is announced as `lease_revoke_failed`, and the record stands.
   */
  protected override adopt(central: Fetched<BankRecord, BankSparse>): void {
    super.adopt(central)
    if (this.#isLiveOfLife) { return }
    void this.#revokeLease('tombstone')
    this.#vaultListing.goodbye()
    this.device.dismissGatingAtDiscard(this)
  }

  /** A bank row has nothing encrypted: a full one is one alive. */
  protected isFullRecord(fetched: BankSparse): fetched is BankRecord { return fetched.am === 'a' }

  /** A bank's life is its `bank_tok`. */
  protected lifeTokPathOf({ bank_tok }: Fetched<BankRecord, BankSparse>): string { return bank_tok }

  protected makeSnapshot(): BankSnapshot {
    return Object.freeze({ ...this.scope, device_tok: this.device_tok, isLocked: this.isLocked, maingate: this.#gateListing.snapshot[0] ?? null, vaults: this.#vaultListing.snapshot })
  }
  // --

  /** Answers 'bank', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'bank' { return 'bank' satisfies Modelkind }
}

// == [Helpers]: listOwnLeases, probeStepOf

/** The leases cached in `deviceDB` for the bank scope `scope`, oldest first. */
export async function listOwnLeases(deviceDB: DeviceDB, { user_id, banklabel }: BankScope): Promise<Outcome<LeaseDated[]>> {
  const listed = await deviceDB.tryListLeases()
  return listed.ok ? good(listed.val.filter((row) => (row.user_id === user_id) && (row.banklabel === banklabel))) : listed
}

/** A storage verb's answer with no wrapped key or ciphertext left in it, and when it came back. */
function probeStepOf({ act, ask, val, parent }: GoodAnswer<Box | null, GoodAct, unknown>): VX.ProbeStep {
  return { ok: true, act, ask, val: BX.boxSparse.parse(val?.sparse), parent: BX.vaultRow.parse(parent), timestamp: nowMillis() }
}
// --
