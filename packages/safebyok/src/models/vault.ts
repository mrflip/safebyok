import type { Modelkind } from '../helpers/consts'
import { consistent } from '../helpers/validator'
import type { CipherCtxRecord } from '../helpers/crypto'
import { VaultError } from '../refusals/errors'
import { type Outcome, outcomeOf } from '../refusals/outcome'
import { reportToPlatform } from '../refusals/report-error'
import type { GatingKind, LockState } from '../shapes/shapes-enums'
import type { VaultScope } from '../shapes/shapes-core'
import * as SX from '../shapes/shapes-storage'
import * as GX from '../shapes/shapes-gateish'
import type { GateProps, GatingFriend, LaunchArgs, LeaseFriend, SealedWhisper } from '../shapes/shapes-gateish'
import * as VX from '../shapes/shapes-vaultish'
import type { BoxPut, BoxPutOpts, Fetched, FetchOpts, TimelyOpts, VaultRecord, VaultSnapshot, VaultSparse, VaultWorld } from '../shapes/shapes-vaultish'
import { absentDamagedBoxError, alreadyHeldError, deletedVaultError, stampOfOtherVault, unlockFirst } from '../refusals/throwers'
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

/** SLOPDOC: A vault as this device holds it: a storable that ducks as its record, and the world its boxes live in. */
export class Vault extends Storable<VaultScope, VaultRecord, VaultSparse, VaultSnapshot> {
  // == [Props]: applabel, user_id, vaultlabel, world, listing, #lease, #friend, #boxListing, #gate

  /** The scope, tattooed on by Storable's constructor. */
  declare readonly applabel:   string
  declare readonly user_id:    string
  declare readonly vaultlabel: string
  declare readonly world:      VaultWorld
  declare readonly listing:    VaultListing

  /** The lease this device holds, and null is what locked means. */
  #lease: Lease | null = null

  #friend: LeaseFriend | null = null

  #boxListing: BoxListing | null = null

  #gate: { props: GateProps, gate: Gate } | null = null
  // --

  // == [Getters]: fmt, fullRecord, gate, boxListing

  get fmt(): number { return this.central.fmt }

  /** The full record in hand, what a gate change spreads into its params. */
  get fullRecord(): VaultRecord { return this.demandFullProps() }

  // Made on first read, not at settle: the base constructor settles before this class's fields exist.
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

  // == [Construction]: launchBirth

  /** SLOPDOC: Builds a vault under `scope` through a build_vault gating, over the slot's tombstone if it holds one. */
  static async launchBirth(listing: VaultListing, scope: VaultScope): Promise<Vault> {
    const checked = listing.scopeOf(scope)
    listing.demandEnabled()
    const held = listing.at(checked)
    if (held?.isPresent === true) { throw alreadyHeldError() }
    const prior = SX.revisionOf(held ?? SX.VoidRevision)
    return Gating.launch('build_vault', { listing, scope: checked, vault: null, prior, friend: Vault.#gatingFriend })
  }
  // --

  // == [Changing the gate]: replacePassphrasePrompt, addPasskeyPrompt, revokePasskeyPrompt, delVaultPrompt, del, each with its try form, landGate

  /** SLOPDOC: Replaces the passphrase through a gating; the passkey stays and no other device is locked. */
  async replacePassphrasePrompt(): Promise<this> {
    await this.ensureTimely(); this.demandEnabled()
    await Gating.launch('replace_passphrase', this.#launchArgs)
    return this
  }

  tryReplacePassphrasePrompt(): Promise<Outcome<this>> { return outcomeOf(() => this.replacePassphrasePrompt()) }

  /** Add a passkey through an add_passkey gating. */
  async addPasskeyPrompt(): Promise<this> {
    await this.ensureTimely(VX.Promptly); this.demandEnabled()
    this.gate.demandPasskeyAddable()
    await Gating.launch('add_passkey', this.#launchArgs)
    return this
  }

  tryAddPasskeyPrompt(): Promise<Outcome<this>> { return outcomeOf(() => this.addPasskeyPrompt()) }

  /** Revoke the passkey through a revoke_passkey gating. With none held it answers at once, nobody asked. The vaultKey does not change: a device that has it keeps it to its lock. */
  async revokePasskeyPrompt(): Promise<this> {
    await this.ensureTimely(VX.Promptly); this.demandEnabled()
    if (this.gate.pkWayin === null) { return this }
    await Gating.launch('revoke_passkey', this.#launchArgs)
    return this
  }

  tryRevokePasskeyPrompt(): Promise<Outcome<this>> { return outcomeOf(() => this.revokePasskeyPrompt()) }

  /** SLOPDOC: Deletes this vault through a gating, leaving a tombstone in its slot and nothing of it on this device. */
  async delVaultPrompt(): Promise<this> {
    await this.ensureTimely(); this.demandEnabled()
    await Gating.launch('del_vault', this.#launchArgs)
    return this
  }

  tryDelVaultPrompt(): Promise<Outcome<this>> { return outcomeOf(() => this.delVaultPrompt()) }

  /** Delete this vault by {@link delVaultPrompt}, which takes the passphrase's proof. */
  override del(): Promise<this> { return this.delVaultPrompt() }

  // The old lease stays in force for the moments between: the vaultKey did not change.
  /** Run the commit, then attach a lease under the epoch it landed. */
  async #landGate(proved: Proving, commit: () => Promise<SX.VaultRecord>): Promise<this> {
    const heldLease = this.#lease
    const stored = await commit()
    await this.#renewLease(proved, stored.gate.gate_epoch, heldLease)
    return this
  }
  // --

  // == [Unlocking]: ensureUnlocked, unlock, each with its try form

  /** This vault timely and unlocked: as it stands, else by the lease cached on this device, else by {@link unlock}. */
  async ensureUnlocked(): Promise<this> {
    await this.ensureTimely(); this.demandEnabled()
    if (this.isUnlocked) { return this }
    const cached = await Lease.buildFromCache(this.#leaseFriend(), this.gate.gate_epoch)
    if (cached) { await this.#attachLease(cached); return this }
    return this.unlock()
  }

  tryEnsureUnlocked(): Promise<Outcome<this>> { return outcomeOf(() => this.ensureUnlocked()) }

  /** Ask the user for proof, and unlock by it. */
  async unlock(): Promise<this> {
    await this.ensureAttachable(); this.demandAttachable()
    await Gating.launch('unlock_vault', this.#launchArgs)
    return this
  }

  tryUnlock(): Promise<Outcome<this>> { return outcomeOf(() => this.unlock()) }
  // --

  // == [The lease]: lockState, lock, vacateLease, panic, unlockByProof, attachLease, renewLease

  lockState(): LockState { return this.#lease === null ? 'locked' : 'unlocked' }

  /** Lock the vault and its boxes before returning, and erase the row cached on this device.
   * A refused erase panics and does not throw. A no-op on a vault discarded. */
  override lock(): this {
    if (! this.isEnabled) { return this }
    void this.#vacateLease()
    this.listing.declineGatingAtLock(this)
    return this
  }

  /** SLOPDOC: Drops any lease held and erases the row cached on this device. */
  async #vacateLease(onRefused: (refusal: VaultError) => unknown = (refusal) => this.#panic(refusal)): Promise<void> {
    // The lease goes first, so a refused erase leaves none; the erase starts before any await, landing in call order.
    const held = this.#lease
    this.#lease = null
    const vacating = held?.tryVacate() ?? Lease.tryUncache(this.#leaseFriend())
    this.settle()
    const vacated = await vacating
    if (! vacated.ok) { await onRefused(vacated.err) }
  }

  /** Tell `onPanic` that a cached lease survived a lock; with none, tell the platform and vacate this vault. */
  async #panic(refusal: VaultError): Promise<void> {
    const { onPanic } = this.world
    if (onPanic === undefined) {
      reportToPlatform(refusal)
      this.vacate()
      return
    }
    try {
      await onPanic(refusal)
    } catch (err) {
      reportToPlatform(err)
    }
  }

  /** The lease `proved` earns, attached. A lock landing during the unlock does not hold: the proof says this user may have the vault unlocked. */
  async #unlockByProof(proved: Proving): Promise<this> {
    const lease = await proved.buildLease(this.#leaseFriend())
    await this.#attachLease(lease)
    return this
  }

  /** Hold `lease` as this vault's, and cache it on this device. */
  async #attachLease(lease: Lease): Promise<void> {
    this.demandEnabled()
    this.#lease = lease
    await lease.cacheAsCacheCan()
    this.settle()
  }

  /** Attach a new lease under `gate_epoch` where `heldLease` is in force. A lock crossing the change wins. */
  async #renewLease(proved: Proving, gate_epoch: number, heldLease: Lease | null): Promise<void> {
    if (heldLease === null) { return }
    const lease = await proved.buildLease(this.#leaseFriend(), gate_epoch)
    if (! heldLease.isPresent) {
      lease.evict()
      return
    }
    await this.#attachLease(lease)
  }
  // --

  // == [The gating's friend]: gatingFriend, launchArgs

  /** The private verbs a gating's run calls past the enter key, as no public method of a vault takes a proving (G9). */
  static readonly #gatingFriend: GatingFriend = {
    unlockByProof: (vault, proved) => vault.#unlockByProof(proved),
    landGate:      (vault, proved, commit) => vault.#landGate(proved, commit),
  }

  get #launchArgs(): LaunchArgs<Exclude<GatingKind, 'build_vault'>> {
    return { listing: this.listing, scope: this.scope, vault: this, prior: null, friend: Vault.#gatingFriend }
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
      tryPeekLease:    () => deviceDB.tryPeek(asked),
      tryCacheLease:   (record) => deviceDB.tryCache(record),
      tryUncacheLease: () => deviceDB.tryVacate(asked),
      tellBadNews:     (badnews) => { this.world.tellBadNews(badnews) },
    }
  }

  /** What a seal's stamp or a lease has to agree with: this vault's scope and this life of it. */
  #stampOfLife(): VaultScope & { vault_tok: string } { return { ...this.scope, vault_tok: this.vault_tok } }
  // --

  // == [The boxes' world]: sealStampedString, unsealStampedString, takeWorld, tellBadNews

  /** `whisperText` sealed under a fresh boxKey under this vault's key, both bound to `stamp`. */
  async sealStampedString(whisperText: string, stamp: CipherCtxRecord): Promise<SealedWhisper> {
    const checked = GX.leaseSealArgs.parse({ whisperText, stamp })
    return this.#demandLease(checked.stamp).sealWith(checked.whisperText, checked.stamp)
  }

  /** The text `sealed` holds, bound to `stamp`. */
  async unsealStampedString(sealed: SealedWhisper, stamp: CipherCtxRecord): Promise<string> {
    const checked = GX.leaseUnsealArgs.parse({ sealed, stamp })
    return this.#demandLease(checked.stamp).unsealWith(checked.sealed, checked.stamp)
  }

  /** The vault row a box's answer carries, received whole, so a gate moved elsewhere arrives with it. */
  // `receive` refuses `otherVaultTok` for a row of another life: the one consistency guard on this path.
  takeWorld(world: unknown): void { this.receive(VX.vaultRow.parse(world)) }

  /** Tell bad news of this vault's boxes where its own goes. */
  tellBadNews(badnews: readonly VaultError[]): void { this.world.tellBadNews(badnews) }
  // --

  // == [Box verbs]: hello, getBox, fetchBox, putBox, delBox, tryDelDamagedBox, each with its try form

  /** List this vault's boxes and start their watch. */
  async hello(): Promise<this> {
    this.demandEnabled()
    await this.boxListing.hello()
    await this.boxListing.list()
    return this
  }

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

  /** Seals `patch` over the box listed at its `boxlabel` as the next revision and stores it, answering the box; {@link Box.put} has the options and the refusals. */
  async putBox(patch: BoxPut, opts: BoxPutOpts = {}): Promise<Box> {
    const box = this.boxListing.puttable({ ...patch, ...this.scope }, opts)
    return box.put(patch, opts)
  }

  /** Non-throwing form of {@link putBox}. */
  tryPutBox(patch: BoxPut, opts: BoxPutOpts = {}): Promise<Outcome<Box>> { return outcomeOf(() => this.putBox(patch, opts)) }

  /** Tombstones the box listed at `boxlabel` and answers it, or null where none is stored; {@link BoxListing.del} has the refusals.
   * A damaged box, one that failed validation when read back, reads as missing here: {@link tryDelDamagedBox} removes it. */
  async delBox(boxlabel: string, opts: TimelyOpts = {}): Promise<Box | null> {
    const timely = VX.timelyOpts.parse(opts)
    const boxes = this.boxListing
    const scope = boxes.scopeOf({ ...this.scope, boxlabel })
    this.demandUnlocked()
    const held = boxes.at(scope)
    if (held !== null) { return held.del(timely) }
    await this.ensureTimely(timely.maxWorldMillis); this.demandUnlocked()
    return boxes.del(SX.sentinelBoxOf(scope, this.vault_tok))
  }

  tryDelBox(boxlabel: string, opts: TimelyOpts = {}): Promise<Outcome<Box | null>> { return outcomeOf(() => this.delBox(boxlabel, opts)) }

  /** Delete the damaged box listed at `boxlabel`, the only verb that does. Refuses 'absent_box' for a healthy box or none listed. */
  tryDelDamagedBox(boxlabel: string, opts: TimelyOpts = {}): Promise<Outcome<Box | null>> {
    return outcomeOf(async () => { // this method does not offer a throwing (delDamagedBox) form
      const timely = VX.timelyOpts.parse(opts)
      const boxes = this.boxListing
      const scope = boxes.scopeOf({ ...this.scope, boxlabel })
      this.demandUnlocked()
      await this.ensureTimely(timely.maxWorldMillis); this.demandUnlocked()
      const damaged = boxes.damagedAt(scope)
      if (damaged === null) { throw absentDamagedBoxError(scope) }
      return boxes.del(damaged)
    })
  }
  // --

  // == [Guards]: isLocked, isUnlocked, demandUnlocked, demandLease, demandAttachable, demandEnabled, demandPresent, ensureAttachable, ensureTimely

  /** The vault's own lock, not its world's: the bank has none. */
  override get isLocked(): boolean { return this.lockState() === 'locked' }

  get isUnlocked(): boolean { return this.#lease !== null }

  /** Refuses unless the vault is enabled, present and unlocked. */
  override demandUnlocked(): this {
    this.demandEnabled()
    return super.demandUnlocked()
  }

  #demandLease(stamp: CipherCtxRecord): Lease {
    this.demandEnabled()
    if (! consistent(stamp, this.#stampOfLife())) { throw stampOfOtherVault() }
    if (this.#lease === null) { throw unlockFirst() }
    return this.#lease
  }

  /** An attach needs the vault enabled and present. */
  demandAttachable(): this { return this.demandEnabled() }

  /** Refuses unless the vault is enabled and present. */
  override demandEnabled(): this {
    super.demandEnabled()
    return this.demandPresent()
  }

  demandPresent(): this {
    if (! this.isPresent) { throw deletedVaultError() }
    return this
  }

  ensureAttachable(): Promise<this> { return this.ensureTimely() }

  /** This vault, refreshed within `maxMillis`, by default its horizon: as it stands where it is recent, otherwise fetched. */
  ensureTimely(maxMillis?: number): Promise<this> { return this.hydrate({ maxMillisSinceRefresh: maxMillis }) }
  // --

  // == [Protected, overriding Storable's]: adopt, sweepContents, vacateContents, isFullRecord, lifeTokPathOf, makeSnapshot

  /** Take in `central`. A tombstone locks the vault, erases the cached row and vacates the boxes, the vault keeping its slot.
   * A refused erase is bad news, and the tombstone stands. */
  protected override adopt(central: Fetched<VaultRecord, VaultSparse>): void {
    super.adopt(central)
    if (this.isPresent) { return }
    void this.#vacateLease((refusal) => { this.world.tellBadNews([refusal]) })
    this.#boxListing?.vacate()
  }

  /** The lease dropped, the row cached left for the next session, and the boxes swept. */
  protected override sweepContents(): void {
    this.#lease?.evict()
    this.#lease = null
    this.#boxListing?.sweep()
    this.listing.declineGatingAtDiscard(this)
  }

  /** Locked, the row cached erased, and the boxes vacated. */
  protected override vacateContents(): void {
    void this.#vacateLease()
    this.#boxListing?.vacate()
    this.listing.declineGatingAtDiscard(this)
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
      present:       this.isPresent,
      lockState:     this.lockState(),
    })
  }
  // --

  /** Answers 'vault', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'vault' { return 'vault' satisfies Modelkind }
}
