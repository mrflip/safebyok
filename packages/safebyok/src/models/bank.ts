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
import type { AskUser, BankStamp, LeaseFriend, SealedWhisper, UnlockByProving } from '../shapes/shapes-gateish'
import * as VX from '../shapes/shapes-vaultish'
import type { BankFriend, BankSnapshot, Fetched, ListingOpts, RevokeSite } from '../shapes/shapes-vaultish'
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

/** The signed-in user's bank on this device, kept in step with its row: its main gate, its one lease, and its vaults, one Vault object per scope. Made by the {@link Device}, through `device.ensureBank()`. */
export class Bank extends Storable<BankScope, BankRecord, BankSparse, BankSnapshot> {
  // == [Props]: user_id, banklabel, bank_tok, world, listing, #deviceTok, #bankFriend, #gateListing, #vaultListing, #lease, #leaseFriend

  /** The scope, tattooed on by Storable's constructor. */
  declare readonly user_id:   string
  declare readonly banklabel: string
  /** This bank's life, inscribed once by `assignInitialProps` and never moved: one Bank object is one life of the bank. */
  declare readonly bank_tok:  string
  /** The device that made this bank: its options, its host's functions, its open gating and its end. */
  declare readonly world:     Device
  declare readonly listing:   BankListing

  readonly #deviceTok:    string
  /** The device's private calls, as the listing handed them. */
  readonly #bankFriend:   BankFriend
  readonly #gateListing:  GateListing
  readonly #vaultListing: VaultListing

  /** The lease granted on this device, and null is what locked means. */
  #lease: Lease | null = null

  #leaseFriend: LeaseFriend | null = null
  // --

  // == [Getters]: device, device_tok, keyDeriver, deviceDB, logger, strengthChecker, leaseMillis, boxRefreshMillis, stamp, maingate, gateListing, vaultListing

  /** The device that made this bank. */
  get device(): Device { return this.world }

  /** The token of this device's row in the deviceDB, which each wayin records. */
  get device_tok(): string { return this.#deviceTok }

  /** The device's key deriver, guarded. */
  get keyDeriver(): GuardedKeyDeriver { return this.world.keyDeriver }

  /** The device database that caches the bank's lease. */
  get deviceDB(): DeviceDB { return this.world.deviceDB }

  /** The device's logger, guarded. */
  get logger(): VaultLogger { return this.world.logger }

  /** The device's strength checker, guarded. */
  get strengthChecker(): GuardedStrengthChecker { return this.world.strengthChecker }

  /** How long an unlock lasts on this device. */
  get leaseMillis(): number { return this.world.leaseMillis }

  /** The refresh horizon of each vault's boxes. */
  get boxRefreshMillis(): number { return this.world.boxRefreshMillis }

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

  /** Construct the storable bank, with the device's private calls, and a listing for its gate and one for its vaults. */
  constructor(world: Device, listing: BankListing, central: Fetched<BankRecord, BankSparse>, opts: ListingOpts) {
    super(world, listing, central)
    this.#deviceTok = VX.bankArgs.parse({ device: world, device_tok: world.device_tok }).device_tok
    this.#bankFriend = VX.bankFriend.parse(opts.bankFriend)
    this.#gateListing = new GateListing(this, opts)
    this.#vaultListing = new VaultListing(this, opts)
    this.#gateListing.subscribe(() => { this.align() })
    this.#vaultListing.subscribe(() => { this.align() })
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

  // == [The world of its gate and vaults]: ensureTimely, receiveParent

  /** Resolves at once: the bank's row comes with every answer about its gate and its vaults. */
  ensureTimely(): Promise<void> { return Promise.resolve() }

  // The bank listing receives the parent as it would a row from any bank request: a newer row from another life
  // replaces this Bank in the listing.
  /** Deliver the bank row a gate or vault answer carries. */
  receiveParent(parent: unknown): void { this.listing.deliverRecord(BX.bankRow.refusingAs('record_conflict').parse(parent)) }
  // --

  // == [Unlocking]: ensureUnlocked, unlock, each with its try form

  /** This bank unlocked: as it stands, else by the lease cached on this device, else by {@link unlock}. */
  async ensureUnlocked(): Promise<this> {
    const gate = await this.maingate.ensureTimely(); this.demandPromptable()
    if (this.isUnlocked) { return this }
    const cached = await Lease.buildFromCache(this.#leaseFriendOf(), gate)
    if (cached) { await this.#attachLease(cached); return this }
    return this.unlock()
  }

  /** Non-throwing form of {@link ensureUnlocked}. */
  tryEnsureUnlocked(): Promise<Outcome<this>> { return outcomeOf(() => this.ensureUnlocked()) }

  /** Ask the user for a passphrase or passkey, and unlock by its proving. */
  async unlock(): Promise<this> {
    await this.maingate.ensureTimely(); this.demandPromptable()
    await Gating.launchOn(this, 'unlock_bank', Bank.#unlockBankByProving, this.#bankFriend.askUser)
    return this
  }

  /** Non-throwing form of {@link unlock}. */
  tryUnlock(): Promise<Outcome<this>> { return outcomeOf(() => this.unlock()) }
  // --

  // == [The lease]: lock, autolock, revokeLease, unlockByProving, attachLease, alignVaults

  /** Lock the bank, its vaults and their boxes before returning, and forget the row cached on this device.
   * A failed revoke is announced as `lease_revoke_failed` and does not throw. A no-op on a bank discarded.
   */
  override lock(): this {
    if (! this.isEnabled) { return this }
    void this.#revokeLease('lock')
    return this
  }

  /** Lock the bank where the lease cached on this device was proved longer ago than autolock. Call it after `ensureBank` and on your own timer.
   * A best-effort reminder, not a guarantee: a refused peek is told as bad news.
   */
  async autolock(): Promise<void> {
    const peeked = await this.deviceDB.tryPeek({ ...this.scope, bank_tok: this.bank_tok })
    if (! peeked.ok) { this.#bankFriend.tellBadNews([peeked.err]); return }
    if ((peeked.val !== null) && (peeked.val.proved_at < nowMillis() - this.leaseMillis)) { this.lock() }
  }

  /** Drops any lease granted and forgets the row cached on this device, announcing a failed revoke at `where`. */
  async #revokeLease(where: Exclude<RevokeSite, 'undeleted'>): Promise<void> {
    // The lease goes first, so a refused forget leaves none; the forget starts before any await, so forgets start in call order.
    const granted = this.#lease
    this.#lease = null
    const revoking = granted?.tryRevoke() ?? Lease.tryForget(this.#leaseFriendOf())
    this.align()
    this.#alignVaults()
    const revoked = await revoking
    if (! revoked.ok) { this.#bankFriend.announce({ kind: 'lease_revoke_failed', refusal: revoked.err, bank: this, where }) }
  }

  /** The lease `proved` earns, attached. A lock called during the unlock does not stand: the proving says this user may have the bank unlocked. */
  async #unlockByProving(proved: Proving): Promise<this> {
    const lease = await proved.buildLease(this.#leaseFriendOf(), this.maingate)
    await this.#attachLease(lease)
    return this
  }

  /** Attach `lease` to this bank, and cache it on this device. */
  async #attachLease(lease: Lease): Promise<void> {
    this.demandAttachable()
    this.#lease = lease
    await lease.cacheAsCacheCan()
    this.align()
    this.#alignVaults()
  }

  /** Bring each vault listed, and its boxes, up to this bank's lock, which their snapshots show. */
  #alignVaults(): void {
    for (const vault of this.#vaultListing.things) { vault.alignLock() }
  }
  // --

  // == [The gating's unlock]: unlockBankByProving

  // A gating comes to #unlockByProving by this, as no public method of a bank accepts a proving (G9).
  static readonly #unlockBankByProving: UnlockByProving = (bank, proved) => bank.#unlockByProving(proved)
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
        if (! outcome.ok) { this.#bankFriend.announce({ kind: 'lease_revoke_failed', refusal: outcome.err, bank: this, where: 'undeleted' }) }
        return outcome
      },
      tellBadNews:     (badnews) => { this.#bankFriend.tellBadNews(badnews) },
    }
  }
  // --

  // == [Sealing for the vaults]: sealWith, unsealWith

  /** `whisperText` sealed under a fresh boxKey under the bank's vaultKey, each bound to the bank's stamp and then to `stamps`, in order. */
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
    this.device.demandEnabled()
    return this.#vaultListing.at(this.vaultScopeOf(scope))
  }

  /** The vault for `scope`: the one listed, else the one stored, else one put now, which needs the bank unlocked. */
  async ensureVault(scope: BankedVaultScope): Promise<Vault> {
    const asked = this.vaultScopeOf(scope)
    this.device.demandEnabled()
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

  // == [Guards]: isLocked, isUnlocked, demandLease, demandPromptable, demandAttachable, demandPresent

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

  // == [Protected, overriding Storable's]: adopt, sweepContents, vacateContents, isFullRecord, lifeTokPathOf, makeSnapshot

  /** Adopt `central`. A tombstone locks the bank, forgets the cached row and vacates the gate and the vaults, the bank staying listed.
   * A failed revoke is announced as `lease_revoke_failed`, and the tombstone stands.
   */
  protected override adopt(central: Fetched<BankRecord, BankSparse>): void {
    super.adopt(central)
    if (this.isPresent) { return }
    void this.#revokeLease('tombstone')
    this.#gateListing.vacate()
    this.#vaultListing.vacate()
  }

  /** The lease dropped, the row cached left for the next session, and the gate and the vaults swept. */
  protected override sweepContents(): void {
    this.#lease?.evict()
    this.#lease = null
    this.#gateListing.sweep()
    this.#vaultListing.sweep()
    this.world.dismissGatingAtDiscard(this)
  }

  /** Locked, the row cached forgotten, and the gate and the vaults vacated. */
  protected override vacateContents(): void {
    void this.#revokeLease('vacate')
    this.#gateListing.vacate()
    this.#vaultListing.vacate()
    this.world.dismissGatingAtDiscard(this)
  }

  /** A bank row has nothing encrypted: a full one is one alive. */
  protected isFullRecord(fetched: BankSparse): fetched is BankRecord { return fetched.am === 'a' }

  /** A bank's life is its `bank_tok`. */
  protected lifeTokPathOf({ bank_tok }: Fetched<BankRecord, BankSparse>): string { return bank_tok }

  protected makeSnapshot(): BankSnapshot {
    return Object.freeze({ ...this.scope, device_tok: this.device_tok, isLocked: this.isLocked, vaults: this.#vaultListing.snapshot })
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
