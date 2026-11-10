import type { Modelkind } from '../helpers/consts'
import { verifyConsistent } from '../helpers/validator'
import * as Phrases from '../helpers/phrases'
import type { CipherCtxRecord } from '../helpers/crypto'
import { type Outcome, demandGood, outcomeOf } from '../refusals/outcome'
import type { Gatingkind } from '../shapes/shapes-enums'
import type { VaultScope } from '../shapes/shapes-core'
import * as SX from '../shapes/shapes-storage'
import * as GX from '../shapes/shapes-gateish'
import type { AskUser, GateProps, GatingFriend, LaunchArgs, LeaseFriend, SealedWhisper } from '../shapes/shapes-gateish'
import * as VX from '../shapes/shapes-vaultish'
import type { BankFriend, BoxPut, BoxPutOpts, RevokeSite, Fetched, FetchOpts, TimelyOpts, VaultSnapshot, VaultWorld } from '../shapes/shapes-vaultish'
import type { VaultRecord, VaultSparse } from '../shapes/shapes-storage'
import { alreadyListedError, deletedVaultError, unlockFirst } from '../refusals/throwers'
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
  // == [Props]: applabel, user_id, vaultlabel, world, listing, #bankFriend, #lease, #friend, #boxListing, #gate

  /** The scope, tattooed on by Storable's constructor. */
  declare readonly applabel:   string
  declare readonly user_id:    string
  declare readonly vaultlabel: string
  declare readonly world:      VaultWorld
  declare readonly listing:    VaultListing

  /** The bank's private calls, as the listing handed them. */
  readonly #bankFriend: BankFriend

  /** The lease granted on this device, and null is what locked means. */
  #lease: Lease | null = null

  #friend: LeaseFriend | null = null

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

  /** SLOPDOC: Builds a vault under `scope` through a build_vault gating, over the slot's tombstone if it has one. */
  static async launchBirth(listing: VaultListing, scope: VaultScope, askUser: AskUser | null): Promise<Vault> {
    const checked = listing.scopeOf(scope)
    listing.demandEnabled()
    const listed = listing.at(checked)
    if (listed?.isPresent === true) { throw alreadyListedError() }
    const prior = SX.revisionOf(listed ?? SX.VoidRevision)
    return Gating.launch('build_vault', { listing, scope: checked, vault: null, prior, friend: Vault.#gatingFriend, askUser })
  }
  // --

  // == [Changing the gate]: replacePassphrasePrompt, addPasskeyPrompt, revokePasskeyPrompt, delVaultPrompt, del, each with its try form

  /** SLOPDOC: Replaces the passphrase through a gating; the passkey stays and no other device is locked. */
  async replacePassphrasePrompt(): Promise<this> {
    await this.ensureTimely(); this.demandPromptable()
    await Gating.launch('replace_passphrase', this.#launchArgs)
    return this
  }

  /** Non-throwing form of {@link replacePassphrasePrompt}. */
  tryReplacePassphrasePrompt(): Promise<Outcome<this>> { return outcomeOf(() => this.replacePassphrasePrompt()) }

  /** Add a passkey through an add_passkey gating. */
  async addPasskeyPrompt(): Promise<this> {
    await this.ensureTimely(VX.Promptly); this.demandPromptable()
    this.gate.demandPasskeyAddable()
    await Gating.launch('add_passkey', this.#launchArgs)
    return this
  }

  /** Non-throwing form of {@link addPasskeyPrompt}. */
  tryAddPasskeyPrompt(): Promise<Outcome<this>> { return outcomeOf(() => this.addPasskeyPrompt()) }

  /** Revoke the passkey through a revoke_passkey gating. With none it answers at once, nobody asked. The vaultKey does not change: a device that has it keeps it to its lock. */
  async revokePasskeyPrompt(): Promise<this> {
    await this.ensureTimely(VX.Promptly); this.demandPromptable()
    if (this.gate.pkWayin === null) { return this }
    await Gating.launch('revoke_passkey', this.#launchArgs)
    return this
  }

  /** Non-throwing form of {@link revokePasskeyPrompt}. */
  tryRevokePasskeyPrompt(): Promise<Outcome<this>> { return outcomeOf(() => this.revokePasskeyPrompt()) }

  /** SLOPDOC: Deletes this vault through a gating, leaving a tombstone in its slot and nothing of it on this device. */
  async delVaultPrompt(): Promise<this> {
    await this.ensureTimely(); this.demandPromptable()
    await Gating.launch('del_vault', this.#launchArgs)
    return this
  }

  /** Non-throwing form of {@link delVaultPrompt}. */
  tryDelVaultPrompt(): Promise<Outcome<this>> { return outcomeOf(() => this.delVaultPrompt()) }

  /** Delete this vault by {@link delVaultPrompt}, which accepts the passphrase's proof. */
  override del(): Promise<this> { return this.delVaultPrompt() }

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

  /** Ask the user for proof, and unlock by it. */
  async unlock(): Promise<this> {
    await this.ensureTimely(); this.demandPromptable()
    await Gating.launch('unlock_vault', this.#launchArgs)
    return this
  }

  /** Non-throwing form of {@link unlock}. */
  tryUnlock(): Promise<Outcome<this>> { return outcomeOf(() => this.unlock()) }
  // --

  // == [The lease]: lock, vacateLease, unlockByProof, attachLease

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
    const revoked = await revoking
    if (! revoked.ok) { this.#bankFriend.announce({ kind: 'lease_revoke_failed', refusal: revoked.err, vault: this, where }) }
  }

  /** The lease `proved` earns, attached. A lock called during the unlock does not stand: the proof says this user may have the vault unlocked. */
  async #unlockByProof(proved: Proving, gate_epoch?: number): Promise<this> {
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
  }
  // --

  // == [The gating's friend]: gatingFriend, launchArgs

  /** The private verbs a gating's run calls past the enter key, as no public method of a vault accepts a proving (G9). */
  static readonly #gatingFriend: GatingFriend = {
    unlockByProof: (vault, proved, gate_epoch) => vault.#unlockByProof(proved, gate_epoch),
  }

  get #launchArgs(): LaunchArgs<Exclude<Gatingkind, 'build_vault'>> {
    return { listing: this.listing, scope: this.scope, vault: this, prior: null, friend: Vault.#gatingFriend, askUser: this.#bankFriend.askUser }
  }
  // --

  // == [The lease's friend]: leaseFriend, makeFriend, stampOfLife

  /** All a lease or a proving hears of this vault, made once. */
  #leaseFriend(): LeaseFriend {
    this.#friend ??= this.#makeFriend()
    return this.#friend
  }

  #makeFriend(): LeaseFriend {
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

  // == [The boxes' world]: sealStampedString, unsealStampedString, receiveWorld

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

  /** The vault row a box's answer carries, received whole, so a gate moved elsewhere arrives with it. */
  // `receive` refuses `otherVaultTok` for a row of another life: the one consistency guard on this path.
  receiveWorld(world: unknown): void { this.receive(SX.vaultRow.refusingAs('record_conflict').parse(world)) }
  // --

  // == [Box verbs]: hello, bringUp, getBox, fetchBox, putBox, delBox, each with its try form

  /** List this vault's boxes and start their watch. */
  async hello(): Promise<this> {
    this.demandHelloable()
    const hello = await outcomeOf(() => this.#bringUp())
    this.#bankFriend.announce({ kind: 'helloed', outcome: hello, vault: this })
    demandGood(hello)
    return this
  }

  /** The boxes' watch started and their listing fetched. */
  async #bringUp(): Promise<void> {
    await this.boxListing.hello()
    await this.boxListing.list()
  }

  /** Non-throwing form of {@link hello}. */
  tryHello(): Promise<Outcome<this>> { return outcomeOf(() => this.hello()) }

  /** Hydrate and return the box listed at `boxlabel` (i.e. fetch if stale). A missing box is null for `ifAbsent: 'nil'`, or refused for `ifAbsent: 'fail'`. */
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

  /** Tombstones the box listed at `boxlabel` and answers it, or null where none is stored; {@link BoxListing.del} has the refusals. */
  async delBox(boxlabel: string, opts: TimelyOpts = {}): Promise<Box | null> {
    const box = await this.boxListing.deletable({ ...this.scope, boxlabel }).del(opts)
    return SX.isRowAt(box, SX.VoidRevision) ? null : box
  }

  /** Non-throwing form of {@link delBox}. */
  tryDelBox(boxlabel: string, opts: TimelyOpts = {}): Promise<Outcome<Box | null>> { return outcomeOf(() => this.delBox(boxlabel, opts)) }
  // --

  // == [Guards]: isLocked, isUnlocked, demandUnlocked, demandLease, demandPromptable, demandAttachable, demandHelloable, demandPresent, ensureTimely

  /** The vault's own lock, not its world's: the bank has none. */
  get isLocked(): boolean { return this.#lease === null }

  /** True while this vault has a lease granted. */
  get isUnlocked(): boolean { return this.#lease !== null }

  /** Refuses unless the vault is enabled, present and unlocked. */
  override demandUnlocked(): this {
    this.demandEnabled().demandPresent()
    return super.demandUnlocked()
  }

  #demandLease(stamp: CipherCtxRecord): Lease {
    this.demandEnabled().demandPresent()
    verifyConsistent(stamp, this.#stampOfLife(), { kind: 'unexpected_error', message: Phrases.StampOfOtherVault })
    if (this.#lease === null) { throw unlockFirst() }
    return this.#lease
  }

  /** A prompt needs the vault enabled and present. */
  demandPromptable(): this { return this.demandEnabled().demandPresent() }

  /** An attach needs the vault enabled and present. */
  demandAttachable(): this { return this.demandEnabled().demandPresent() }

  /** A hello needs the vault enabled and present. */
  demandHelloable(): this { return this.demandEnabled().demandPresent() }

  /** Demand that this vault is present. */
  demandPresent(): this {
    if (! this.isPresent) { throw deletedVaultError() }
    return this
  }

  /** This vault, refreshed within `maxMillis`, by default its horizon: as it stands where it is recent, otherwise fetched. */
  ensureTimely(maxMillis?: number): Promise<this> { return this.hydrate({ maxMillisSinceRefresh: maxMillis }) }
  // --

  // == [Protected, overriding Storable's]: adopt, sweepContents, vacateContents, isFullRecord, lifeTokPathOf, makeSnapshot

  /** Adopt `central`. A tombstone locks the vault, forgets the cached row and vacates the boxes, the vault keeping its slot.
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
    this.listing.dismissGatingAtDiscard(this)
  }

  /** Locked, the row cached forgotten, and the boxes vacated. */
  protected override vacateContents(): void {
    void this.#revokeLease('vacate')
    this.#boxListing?.vacate()
    this.listing.dismissGatingAtDiscard(this)
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
