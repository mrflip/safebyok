import type { Modelkind } from '../helpers/consts'
import { checkedConsistent } from '../helpers/validator'
import * as Phrases from '../helpers/phrases'
import type { CipherCtxRecord } from '../helpers/crypto'
import { type Outcome, demandGood, outcomeOf } from '../refusals/outcome'
import type { VaultScope } from '../shapes/shapes-core'
import * as SX from '../shapes/shapes-storage'
import * as GX from '../shapes/shapes-gateish'
import type { AskUser, GateProps, LeaseFriend, SealedWhisper, UnlockByProving } from '../shapes/shapes-gateish'
import * as VX from '../shapes/shapes-vaultish'
import type { BankFriend, BoxPut, BoxPutOpts, RevokeSite, Fetched, FetchOpts, TimelyOpts, VaultSnapshot, VaultWorld } from '../shapes/shapes-vaultish'
import type { VaultRecord, VaultSparse } from '../shapes/shapes-storage'
import { alreadyListed, deletedVault, needUnlocked } from '../refusals/throwers'
import type { Box } from './box'
import type { BoxListing } from './box-listing'
import { Gate } from './gate'
import { Gating } from './gating'
import { Lease } from './lease'
import type { Proving } from './proving'
import { Storable } from './storable'
import type { VaultListing } from './vault-listing'

// == [Defaults]: DefaultLeaseMillis

/** How long a lease lasts where the host names no `autolockMinutes`: fourteen days. */
export const DefaultLeaseMillis = 14 * 24 * 60 * 60_000
// --

/** SLOPDOC: A vault as this device has it: a storable that ducks as its record, and the world its boxes live in. */
export class Vault extends Storable<VaultScope, VaultRecord, VaultSparse, VaultSnapshot> {
  // == [Props]: user_id, banklabel, vaultlabel, world, listing, #bankFriend, #lease, #vaultFriend, #boxListing, #gate

  /** The scope, tattooed on by Storable's constructor. */
  declare readonly user_id:    string
  declare readonly banklabel:  string
  declare readonly vaultlabel: string
  declare readonly world:      VaultWorld
  declare readonly listing:    VaultListing

  /** The bank's private calls, as the listing handed them. */
  readonly #bankFriend: BankFriend

  /** The lease granted on this device, and null is what locked means. */
  #lease: Lease | null = null

  #vaultFriend: LeaseFriend | null = null

  #boxListing: BoxListing | null = null

  #gate: { props: GateProps, gate: Gate } | null = null
  // --

  // == [Getters]: fmt, fullRecord, gate, boxListing

  /** The storage format of the record in hand. */
  get fmt(): number { return this.central.fmt }

  /** The full record in hand, what a gate change spreads into its params. */
  get fullRecord(): VaultRecord { return this.demandFullProps() }

  // Made on first read, not at align: the base constructor aligns before this class's fields exist.
  /** The Gate of the record in hand, the same while the record's `gate` is the same object, so a record received remakes it. */
  get gate(): Gate {
    const full = this.demandFullProps()
    if (this.#gate?.props !== full.gate) { this.#gate = { props: full.gate, gate: new Gate(full, full.gate) } }
    return this.#gate.gate
  }

  /** The listing of this vault's boxes, made once, on first asking. */
  get boxListing(): BoxListing {
    this.#boxListing ??= this.listing.boxListingOf(this)
    return this.#boxListing
  }
  // --

  // == [Construction]: constructor, launchBirth

  /** Construct the storable vault, adopting its bank friend. */
  constructor(world: VaultWorld, listing: VaultListing, central: Fetched<VaultRecord, VaultSparse>, bankFriend: BankFriend) {
    super(world, listing, central)
    this.#bankFriend = VX.bankFriend.parse(bankFriend)
  }

  /** SLOPDOC: Builds a vault under `scope` through a build_vault gating, over the tombstone listed, if one is. */
  static async launchBirth(listing: VaultListing, scope: VaultScope, askUser: AskUser | null): Promise<Vault> {
    const checked = listing.scopeOf(scope)
    listing.demandEnabled()
    const listed = listing.at(checked)
    if (listed?.isPresent === true) { throw alreadyListed() }
    const expected = listed?.sparse ?? SX.shellVaultOf(checked)
    return Gating.launchBirth(listing, checked, expected, Vault.#unlockVaultByProving, askUser)
  }
  // --

  // == [Changing the gate]: replacePassphrasePrompt, addPasskeyPrompt, revokePasskeyPrompt, each with its try form

  /** SLOPDOC: Replaces the passphrase through a gating; the passkey stays and no other device is locked. */
  async replacePassphrasePrompt(): Promise<this> {
    await this.ensureTimely(); this.demandPromptable()
    await Gating.launchOn(this, 'replace_passphrase', Vault.#unlockVaultByProving, this.#bankFriend.askUser)
    return this
  }

  /** Non-throwing form of {@link replacePassphrasePrompt}. */
  tryReplacePassphrasePrompt(): Promise<Outcome<this>> { return outcomeOf(() => this.replacePassphrasePrompt()) }

  /** Add a passkey through an add_passkey gating. */
  async addPasskeyPrompt(): Promise<this> {
    await this.ensureTimely(VX.Promptly); this.demandPromptable()
    this.gate.demandPasskeyAddable()
    await Gating.launchOn(this, 'add_passkey', Vault.#unlockVaultByProving, this.#bankFriend.askUser)
    return this
  }

  /** Non-throwing form of {@link addPasskeyPrompt}. */
  tryAddPasskeyPrompt(): Promise<Outcome<this>> { return outcomeOf(() => this.addPasskeyPrompt()) }

  /** Revoke the passkey through a revoke_passkey gating. With none it answers at once, nobody asked. The vaultKey does not change: a device that has it keeps it to its lock. */
  async revokePasskeyPrompt(): Promise<this> {
    await this.ensureTimely(VX.Promptly); this.demandPromptable()
    if (this.gate.pkWayin === null) { return this }
    await Gating.launchOn(this, 'revoke_passkey', Vault.#unlockVaultByProving, this.#bankFriend.askUser)
    return this
  }

  /** Non-throwing form of {@link revokePasskeyPrompt}. */
  tryRevokePasskeyPrompt(): Promise<Outcome<this>> { return outcomeOf(() => this.revokePasskeyPrompt()) }
  // --

  // == [Unlocking]: ensureUnlocked, unlock, each with its try form

  /** This vault timely and unlocked: as it stands, else by the lease cached on this device, else by {@link unlock}. */
  async ensureUnlocked(): Promise<this> {
    await this.ensureTimely(); this.demandPromptable()
    if (this.isUnlocked) { return this }
    const cached = await Lease.buildFromCache(this.#leaseFriend(), this.gate.gate_epoch)
    if (cached) { await this.#attachLease(cached); return this }
    return this.unlock()
  }

  /** Non-throwing form of {@link ensureUnlocked}. */
  tryEnsureUnlocked(): Promise<Outcome<this>> { return outcomeOf(() => this.ensureUnlocked()) }

  /** Ask the user for a passphrase or passkey, and unlock by its proving. */
  async unlock(): Promise<this> {
    await this.ensureTimely(); this.demandPromptable()
    await Gating.launchOn(this, 'unlock_vault', Vault.#unlockVaultByProving, this.#bankFriend.askUser)
    return this
  }

  /** Non-throwing form of {@link unlock}. */
  tryUnlock(): Promise<Outcome<this>> { return outcomeOf(() => this.unlock()) }
  // --

  // == [The lease]: lock, revokeLease, unlockByProving, attachLease, alignBoxes

  /** Lock the vault and its boxes before returning, and forget the row cached on this device.
   * A failed revoke is announced as `lease_revoke_failed` and does not throw. A no-op on a vault discarded.
   */
  override lock(): this {
    if (! this.isEnabled) { return this }
    void this.#revokeLease('lock')
    return this
  }

  /** SLOPDOC: Drops any lease granted and forgets the row cached on this device, announcing a failed revoke at `where`. */
  async #revokeLease(where: Exclude<RevokeSite, 'undeleted'>): Promise<void> {
    // The lease goes first, so a refused forget leaves none; the forget starts before any await, so forgets start in call order.
    const granted = this.#lease
    this.#lease = null
    const revoking = granted?.tryRevoke() ?? Lease.tryForget(this.#leaseFriend())
    this.align()
    this.#alignBoxes()
    const revoked = await revoking
    if (! revoked.ok) { this.#bankFriend.announce({ kind: 'lease_revoke_failed', refusal: revoked.err, vault: this, where }) }
  }

  /** The lease `proved` earns, attached. A lock called during the unlock does not stand: the proving says this user may have the vault unlocked. */
  async #unlockByProving(proved: Proving, gate_epoch?: number): Promise<this> {
    const lease = await proved.buildLease(this.#leaseFriend(), gate_epoch)
    await this.#attachLease(lease)
    return this
  }

  /** Attach `lease` to this vault, and cache it on this device. */
  async #attachLease(lease: Lease): Promise<void> {
    this.demandAttachable()
    this.#lease = lease
    await lease.cacheAsCacheCan()
    this.align()
    this.#alignBoxes()
  }

  /** Bring each box listed up to this vault's lock, which its snapshot shows. */
  #alignBoxes(): void {
    const boxes = this.#boxListing?.things ?? []
    for (const box of boxes) { box.align() }
  }
  // --

  // == [The gating's unlock]: unlockVaultByProving

  // A gating comes to #unlockByProving by this, as no public method of a vault accepts a proving (G9).
  static readonly #unlockVaultByProving: UnlockByProving = (vault, proved, gate_epoch) => vault.#unlockByProving(proved, gate_epoch)
  // --

  // == [The lease's friend]: leaseFriend, makeFriend, stampOfLife

  /** All a lease or a proving hears of this vault, made once. */
  #leaseFriend(): LeaseFriend {
    this.#vaultFriend ??= this.#makeVaultFriend()
    return this.#vaultFriend
  }

  #makeVaultFriend(): LeaseFriend {
    const { world: { logger, deviceDB, leaseMillis } } = this
    const stamp = GX.vaultStamp.parse(this)
    const asked = this.#stampOfLife()
    return {
      ...stamp,
      logger,
      leaseMillis,
      lock:            () => { this.lock() },
      peekLease:       () => deviceDB.peek(asked),
      tryCacheLease:   (record) => deviceDB.tryStow(record),
      forgetLease:     () => deviceDB.forget(asked),
      tryForgetLease:  async (): Promise<Outcome<void>> => {
        const outcome = await deviceDB.tryForget(asked)
        if (! outcome.ok) { this.#bankFriend.announce({ kind: 'lease_revoke_failed', refusal: outcome.err, vault: this, where: 'undeleted' }) }
        return outcome
      },
      tellBadNews:     (badnews) => { this.#bankFriend.tellBadNews(badnews) },
    }
  }

  /** What a seal's stamp or a lease has to agree with: this vault's scope and this life of it. */
  #stampOfLife(): VaultScope & { vault_tok: string } { return { ...this.scope, vault_tok: this.vault_tok } }
  // --

  // == [The boxes' world]: sealStampedString, unsealStampedString, receiveParent

  /** `whisperText` sealed under a fresh boxKey under this vault's key, both bound to `stamp`. */
  async sealStampedString(whisperText: string, stamp: CipherCtxRecord): Promise<SealedWhisper> {
    const checked = GX.leaseSealArgs.parse({ whisperText, stamp })
    return this.#demandLease(checked.stamp).sealWith(checked.whisperText, checked.stamp)
  }

  /** The text `sealed` contains, bound to `stamp`. */
  async unsealStampedString(sealed: SealedWhisper, stamp: CipherCtxRecord): Promise<string> {
    const checked = GX.leaseUnsealArgs.parse({ sealed, stamp })
    return this.#demandLease(checked.stamp).unsealWith(checked.sealed, checked.stamp)
  }

  // The vault listing receives the `world` as it would a row from any vault request:
  // a gate changed on another device comes with it, and a newer row from another life
  // replaces this Vault in the listing.
  /** Deliver the vault row a box answer carries. */
  receiveParent(parent: unknown): void { this.listing.deliverRecord(SX.vaultRow.refusingAs('record_conflict').parse(parent)) }
  // --

  // == [Box verbs]: beginWatch, bringUp, getBox, fetchBox, putBox, delBox, each with its try form

  /** List this vault's boxes and start their watch. */
  async beginWatch(): Promise<this> {
    this.demandWatchable()
    const brought = await outcomeOf(() => this.#bringUp())
    this.#bankFriend.announce({ kind: 'helloed', outcome: brought, vault: this })
    demandGood(brought)
    return this
  }

  /** The boxes' watch started and their listing fetched. */
  async #bringUp(): Promise<void> {
    await this.boxListing.hello()
    await this.boxListing.list()
  }

  /** Non-throwing form of {@link beginWatch}. */
  tryBeginWatch(): Promise<Outcome<this>> { return outcomeOf(() => this.beginWatch()) }

  /** Hydrate and return the box listed at `boxlabel` (i.e. fetch if stale). A missing box is null for `ifAbsent: 'nil'`, or refused for `ifAbsent: 'fail'`.
   * Chute: vault.getBox → listing.get → tryGet → #doTryGetJoined → doTryGet → deliverAnswer → answerDeliveringOf → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  async getBox(boxlabel: string, opts: FetchOpts = {}): Promise<Box | null> {
    return this.boxListing.get({ ...this.scope, boxlabel }, opts)
  }

  /** Non-throwing form of {@link getBox}. */
  tryGetBox(boxlabel: string, opts: FetchOpts = {}): Promise<Outcome<Box | null>> { return outcomeOf(() => this.getBox(boxlabel, opts)) }

  /** {@link getBox}, the box's record fetched whatever its age. */
  fetchBox(boxlabel: string, opts: FetchOpts = {}): Promise<Box | null> { return this.getBox(boxlabel, { ...opts, maxMillisSinceRefresh: 0 }) }

  /** Non-throwing form of {@link fetchBox}. */
  tryFetchBox(boxlabel: string, opts: FetchOpts = {}): Promise<Outcome<Box | null>> { return outcomeOf(() => this.fetchBox(boxlabel, opts)) }

  /** Seals `patch` over the box listed at its `boxlabel` as the next revision and puts it, answering the box; {@link Box.put} has the options and the refusals. */
  async putBox(patch: BoxPut, opts: BoxPutOpts = {}): Promise<Box> {
    const box = this.boxListing.puttable({ ...patch, ...this.scope }, opts)
    return box.put(patch, opts)
  }

  /** Non-throwing form of {@link putBox}. */
  tryPutBox(patch: BoxPut, opts: BoxPutOpts = {}): Promise<Outcome<Box>> { return outcomeOf(() => this.putBox(patch, opts)) }

  /** Delete the box listed at `boxlabel`, and return it.
   * Refuses `absent_box` for a box already deleted or never stored.
   */
  async delBox(boxlabel: string, opts: TimelyOpts = {}): Promise<Box | null> {
    const scope = { ...this.scope, boxlabel }
    const box = await this.boxListing.deletable(scope).del(scope, opts)
    return SX.isRowAt(box, SX.VoidRevision) ? null : box
  }

  /** Non-throwing form of {@link delBox}. */
  tryDelBox(boxlabel: string, opts: TimelyOpts = {}): Promise<Outcome<Box | null>> { return outcomeOf(() => this.delBox(boxlabel, opts)) }
  // --

  // == [Guards]: isLocked, isUnlocked, demandLease, demandPromptable, demandAttachable, demandWatchable, demandPresent, ensureTimely

  /** The vault's own lock, not its world's: the bank has none. */
  get isLocked(): boolean { return this.#lease === null }

  /** True while this vault has a lease granted. */
  get isUnlocked(): boolean { return this.#lease !== null }

  #demandLease(stamp: CipherCtxRecord): Lease {
    this.demandEnabled().demandPresent()
    checkedConsistent(stamp, this.#stampOfLife(), { kind: 'unexpected_error', message: Phrases.StampOfOtherVault })
    if (this.#lease === null) { throw needUnlocked() }
    return this.#lease
  }

  /** A prompt needs the vault enabled and present. */
  demandPromptable(): this { return this.demandEnabled().demandPresent() }

  /** An attach needs the vault enabled and present. */
  demandAttachable(): this { return this.demandEnabled().demandPresent() }

  /** A watch needs the vault enabled and present. */
  demandWatchable(): this { return this.demandEnabled().demandPresent() }

  /** Demand that this vault is present. */
  demandPresent(): this {
    if (! this.isPresent) { throw deletedVault() }
    return this
  }

  /** This vault, refreshed within `maxMillis`, by default its horizon: as it stands where it is recent, otherwise fetched. */
  ensureTimely(maxMillis?: number): Promise<this> { return this.hydrate({ maxMillisSinceRefresh: maxMillis }) }
  // --

  // == [Protected, overriding Storable's]: adopt, sweepContents, vacateContents, isFullRecord, lifeTokPathOf, makeSnapshot

  /** Adopt `central`. A tombstone locks the vault, forgets the cached row and vacates the boxes, the vault staying listed.
   * A failed revoke is announced as `lease_revoke_failed`, and the tombstone stands.
   */
  protected override adopt(central: Fetched<VaultRecord, VaultSparse>): void {
    super.adopt(central)
    if (this.isPresent) { return }
    void this.#revokeLease('tombstone')
    this.#boxListing?.vacate()
  }

  /** The lease dropped, the row cached left for the next session, and the boxes swept. */
  protected override sweepContents(): void {
    this.#lease?.evict()
    this.#lease = null
    this.#boxListing?.sweep()
    this.world.device.dismissGatingAtDiscard(this)
  }

  /** Locked, the row cached forgotten, and the boxes vacated. */
  protected override vacateContents(): void {
    void this.#revokeLease('vacate')
    this.#boxListing?.vacate()
    this.world.device.dismissGatingAtDiscard(this)
  }

  /** A full vault record is one alive that carries its `gate`; a sparse one or a tombstone is not. */
  protected isFullRecord(fetched: VaultSparse): fetched is VaultRecord {
    return fetched.am === 'a' && 'gate' in fetched
  }

  /** A vault's life is its `vault_tok`. */
  protected lifeTokPathOf({ vault_tok }: Fetched<VaultRecord, VaultSparse>): string { return vault_tok }

  protected makeSnapshot(): VaultSnapshot {
    return Object.freeze({
      ...this.scope,
      vault_tok:     this.vault_tok,
      revision_tok:  this.revision_tok,
      revision_seq:  this.revision_seq,
      registered_at: this.registered_at,
      written_at:    this.written_at,
      isPresent:     this.isPresent,
      isLocked:      this.isLocked,
    })
  }
  // --

  /** Answers 'vault', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'vault' { return 'vault' satisfies Modelkind }
}
