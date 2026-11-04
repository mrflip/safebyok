import { verifyConsistent } from '../checks/validator'
import type { CipherCtxRecord } from '../crypto'
import { VaultError } from '../errors'
import { type Outcome, outcomeOf, valOf } from '../outcome'
import * as Phrases from '../phrases'
import { reportToPlatform } from '../report-error'
import type { Clock } from '../shapes/bank-opts'
import type { VaultScope } from '../shapes/scopes'
import * as VS from '../storage/vault-db-shapes'
import { alreadyHeldError, deletedVaultError, listingExpected, noProofToUnlock, unlockFirst } from '../helpers/throwers'
import type { Box } from './box'
import type { BoxListing } from './box-listing'
import { Gate } from './gate'
import { Gating } from './gating'
import { Lease } from './lease'
import type { BoxPut, BoxPutOpts, BoxWorld, Fetched, FetchOpts, GateProps, LeaseFriend, LockState, ProvingsForGatingkind, SealedWhisper, TimelyOpts, VaultRecord, VaultSnapshot, VaultSparse, VaultWorld } from './models-shapes'
import * as MSX from './models-shapes'
import { type Proving, NOVEL } from './proving'
import { Storable } from './storable'
import type { VaultListing } from './vault-listing'

// == [Defaults]: DefaultLeaseMillis

/** How long a lease lasts where the world names no `leaseMillis`: fourteen days. */
export const DefaultLeaseMillis = 14 * 24 * 60 * 60_000
// --

// == [Vault]

/** SLOPDOC: A vault as this device holds it: a storable that ducks as its record, and the world its boxes live in. */
export class Vault extends Storable<VaultScope, VaultRecord, VaultSparse, VaultSnapshot> implements BoxWorld {
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

  // == [Props, as the record has them]: fmt

  get fmt(): number { return this.central.fmt }
  // --

  // == [The world of its boxes]: clock, lockState, isLocked, ensureTimely, demandPresent, demandEnabled, demandUnlocked, takeWorld

  get clock(): Clock { return this.world.clock }

  lockState(): LockState { return this.#lease === null ? 'locked' : 'unlocked' }

  /** The vault's own lock, not its world's: the bank has none. */
  override get isLocked(): boolean { return this.lockState() === 'locked' }

  /** This vault, refreshed within `maxMillis`, by default its horizon: as it stands where it is recent, otherwise fetched. */
  ensureTimely(maxMillis?: number): Promise<this> { return this.hydrate({ maxMillisSinceRefresh: maxMillis }) }

  demandPresent(): this {
    if (! this.isPresent) { throw deletedVaultError() }
    return this
  }

  /** Refuses unless the vault is enabled and present. */
  override demandEnabled(): this {
    super.demandEnabled()
    return this.demandPresent()
  }

  /** Refuses unless the vault is enabled, present and unlocked. */
  override demandUnlocked(): this {
    this.demandEnabled()
    return super.demandUnlocked()
  }

  /** The vault row a box's answer carries, received whole, so a gate moved elsewhere arrives with it. */
  takeWorld(world: unknown): void {
    const row = MSX.vaultRow.parse(world)
    if (row.vault_tok === this.vault_tok) { this.receive(row) }
  }
  // --

  // == [The gate]: fullRecord, gate

  /** The full record in hand, what a gate change spreads into its params. */
  get fullRecord(): VaultRecord { return this.demandFullProps() }

  // Made on first read, not at settle: the base constructor settles before this class's fields exist.
  /** The Gate of the record in hand, the same while the record's `gate` is the same object, so a record received remakes it. */
  get gate(): Gate {
    const full = this.demandFullProps()
    if (this.#gate?.props !== full.gate) { this.#gate = { props: full.gate, gate: new Gate(full, full.gate) } }
    return this.#gate.gate
  }
  // --

  // == [Changing the gate]: replacePassphrase, addPasskey, revokePasskey, delVault, del, each with its try form, landGate

  /** SLOPDOC: Replaces the passphrase through a gating; the passkey stays and no other device is locked. */
  async replacePassphrase(): Promise<this> {
    await this.ensureTimely(); this.demandEnabled()
    await Gating.launch('replace_passphrase', { listing: this.listing, scope: this.scope, vault: this, run: (provings) => this.#runReplacePassphrase(provings) })
    return this
  }

  tryReplacePassphrase(): Promise<Outcome<this>> { return outcomeOf(() => this.replacePassphrase()) }

  async #runReplacePassphrase({ ante, anteProving, nextProving }: ProvingsForGatingkind['replace_passphrase']): Promise<this> {
    const nextWayin = await nextProving.buildWayin(anteProving)
    return this.#landGate(anteProving, () => this.listing.replacePassphrase({ ...ante, gate: { passphrase_wayin: MSX.passphraseWayinRecord.parse(nextWayin.pickle()) } }))
  }

  /** Add a passkey through an add_passkey gating. */
  async addPasskey(): Promise<this> {
    await this.ensureTimely(MSX.Promptly); this.demandEnabled()
    this.gate.demandPasskeyAddable()
    await Gating.launch('add_passkey', { listing: this.listing, scope: this.scope, vault: this, run: (provings) => this.#runAddPasskey(provings) })
    return this
  }

  tryAddPasskey(): Promise<Outcome<this>> { return outcomeOf(() => this.addPasskey()) }

  async #runAddPasskey({ ante, proved, passkeyProving }: ProvingsForGatingkind['add_passkey']): Promise<this> {
    const passkeyWayin = await passkeyProving.buildWayin(proved)
    return this.#landGate(proved, () => this.listing.addPasskey({ ...ante, gate: { passkey_wayin: MSX.passkeyWayinRecord.parse(passkeyWayin.pickle()) } }))
  }

  /** Revoke the passkey through a revoke_passkey gating. With none held it answers at once, nobody asked. The vaultKey does not change: a device that has it keeps it to its lock. */
  async revokePasskey(): Promise<this> {
    await this.ensureTimely(MSX.Promptly); this.demandEnabled()
    if (this.gate.pkWayin === null) { return this }
    await Gating.launch('revoke_passkey', { listing: this.listing, scope: this.scope, vault: this, run: ({ ante, proved }) => this.#landGate(proved, () => this.listing.revokePasskey({ ...ante, gate: { passkey_wayin: null } })) })
    return this
  }

  tryRevokePasskey(): Promise<Outcome<this>> { return outcomeOf(() => this.revokePasskey()) }

  // The old lease stays in force for the moments between: the vaultKey did not change.
  /** Run the commit, then attach a lease under the epoch it landed. */
  async #landGate(proved: Proving, commit: () => Promise<VS.VaultRecord>): Promise<this> {
    const heldLease = this.#lease
    const stored = await commit()
    await this.#renewLease(proved, stored.gate.gate_epoch, heldLease)
    return this
  }

  /** SLOPDOC: Deletes this vault through a gating, leaving a tombstone in its slot and nothing of it on this device. */
  async delVault(): Promise<this> {
    await this.ensureTimely(); this.demandEnabled()
    await Gating.launch('del_vault', { listing: this.listing, scope: this.scope, vault: this, run: ({ ante }) => this.#runDelVault(ante) })
    return this
  }

  tryDelVault(): Promise<Outcome<this>> { return outcomeOf(() => this.delVault()) }

  // The lock first: no box opens under a lease while the tombstone goes out.
  /** Lock this vault and store its tombstone; the answer delivered vacates its boxes. */
  async #runDelVault(ante: VaultRecord): Promise<this> {
    this.lock()
    await this.listing.del(ante)
    return this
  }

  /** Delete this vault by {@link delVault}, which takes the passphrase's proof. */
  override del(): Promise<this> { return this.delVault() }
  // --

  // == [Birth]: launchBirth, runBirth

  /** SLOPDOC: Builds a vault under `scope` through a build_vault gating, over the slot's tombstone if it holds one. */
  static async launchBirth(listing: VaultListing, scope: VaultScope): Promise<Vault> {
    if (! MSX.isListing(listing)) { throw listingExpected() }
    const checked = listing.scopeOf(scope)
    listing.demandEnabled()
    const held = listing.at(checked)
    if (held?.isPresent === true) { throw alreadyHeldError() }
    const prior = VS.revisionOf(held ?? VS.VoidRevision)
    return Gating.launch('build_vault', { listing, scope: checked, vault: null, run: (provings) => Vault.#runBirth(listing, provings, prior) })
  }

  /** SLOPDOC: Stores the birth record, and unlocks under its passphrase's lease if the vault stored is its own. */
  static async #runBirth(listing: VaultListing, { passphraseProving, passkeyProving }: ProvingsForGatingkind['build_vault'], prior: MSX.Revision): Promise<Vault> {
    const passphraseWayin = await passphraseProving.buildWayin(NOVEL)
    const passkeyWayin = await passkeyProving?.buildWayin(passphraseProving) ?? null
    const record = recordOfBirth(Gate.make(passphraseProving.stamp, passphraseWayin, passkeyWayin), prior, listing.clock.now())
    const vault = await listing.put(record, { prior, ifAbsent: 'add', ifPresent: 'get' })
    if (vault.vault_tok === record.vault_tok) { await vault.#unlockByProof(passphraseProving) }
    return vault
  }
  // --

  // == [Unlocking]: isUnlocked, ensureUnlocked, tryEnsureUnlocked, unlock, tryUnlock, unlockByProof

  get isUnlocked(): boolean { return this.#lease !== null }

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
    if (this.world.requestCleartext === undefined) { throw noProofToUnlock() }
    await Gating.launch('unlock_vault', { listing: this.listing, scope: this.scope, vault: this, run: ({ proved }) => this.#unlockByProof(proved) })
    return this
  }

  tryUnlock(): Promise<Outcome<this>> { return outcomeOf(() => this.unlock()) }

  /** Past the enter key: a lock crossing this is answered by the next `lock()`, as the proof says this user may have the vault unlocked. */
  async #unlockByProof(proved: Proving): Promise<this> {
    const lease = await proved.buildLease(this.#leaseFriend())
    await this.#attachLease(lease)
    return this
  }
  // --

  // == [The lease]: leaseFriend, ensureAttachable, demandAttachable, attachLease, renewLease, dropLease, vacateLease, panic, lock

  /** All a lease or a proving hears of this vault, made once. */
  #leaseFriend(): LeaseFriend {
    this.#friend ??= this.#makeFriend()
    return this.#friend
  }

  #makeFriend(): LeaseFriend {
    const { world: { clock, logger, deviceDB, leaseMillis = DefaultLeaseMillis } } = this
    const stamp = MSX.vaultStamp.parse(this)
    const asked = this.#stampOfLife()
    return {
      ...stamp,
      clock,
      logger,
      leaseMillis,
      lock:            () => { this.lock() },
      tryPeekLease:    () => deviceDB.tryPeek(asked),
      tryCacheLease:   (record) => deviceDB.tryCache(record),
      tryUncacheLease: () => deviceDB.tryVacate(asked),
      tellBadNews:     (badnews) => { this.listing.tellBadNews(badnews) },
    }
  }

  ensureAttachable(): Promise<this> { return this.ensureTimely() }

  /** An attach needs the vault enabled and present. */
  demandAttachable(): this { return this.demandEnabled() }

  /** What a seal's stamp or a lease has to agree with: this vault's scope and this life of it. */
  #stampOfLife(): VaultScope & { vault_tok: string } { return { ...this.scope, vault_tok: this.vault_tok } }

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
    if (heldLease.isForgotten) {
      lease.evict()
      return
    }
    await this.#attachLease(lease)
  }

  #dropLease(): void {
    this.#lease?.evict()
    this.#lease = null
  }

  /** SLOPDOC: Drops any lease held and erases the row cached on this device. */
  async #vacateLease(onRefused: (refusal: VaultError) => unknown = (refusal) => this.#panic(refusal)): Promise<void> {
    // The lease goes first, so a refused erase leaves none; the erase starts before any await, landing in call order.
    this.#dropLease()
    const vacating = outcomeOf(async () => { valOf(await this.#leaseFriend().tryUncacheLease()) })
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

  /** Lock the vault and its boxes before returning, and erase the row cached on this device.
   * A refused erase panics and does not throw. A no-op on a vault discarded. */
  override lock(): this {
    if (! this.isEnabled) { return this }
    void this.#vacateLease()
    this.listing.declineGatingAtLock(this)
    return this
  }
  // --

  // == [Seal verbs]: sealStampedString, unsealStampedString, demandLease

  /** `whisperText` sealed under a fresh boxKey under this vault's key, both bound to `stamp`. */
  async sealStampedString(whisperText: string, stamp: CipherCtxRecord): Promise<SealedWhisper> {
    MSX.leaseSealArgs.parse({ whisperText, stamp })
    return this.#demandLease(stamp).sealWith(whisperText, stamp)
  }

  /** The text `sealed` holds, bound to `stamp`. */
  async unsealStampedString(sealed: SealedWhisper, stamp: CipherCtxRecord): Promise<string> {
    MSX.leaseUnsealArgs.parse({ sealed, stamp })
    return this.#demandLease(stamp).unsealWith(sealed, stamp)
  }

  #demandLease(stamp: CipherCtxRecord): Lease {
    this.demandEnabled()
    verifyConsistent(stamp, this.#stampOfLife(), { kind: 'bad_option', message: Phrases.otherVaultsBag })
    if (this.#lease === null) { throw unlockFirst() }
    return this.#lease
  }
  // --

  // == [Box verbs]: hello, getBox, fetchBox, putBox, delBox, each with its try form

  /** List this vault's boxes and start their watch. */
  async hello(): Promise<this> {
    const listed = await this.listing.fetchListed(this)
    this.demandEnabled()
    await this.boxListing.hello(listed)
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

  /** Returns box after applying `patch`, sealing the new revision, and storing it. See {@link BoxListing.put} for important details on refusals and options */
  async putBox(patch: BoxPut, opts: BoxPutOpts = {}): Promise<Box> {
    const box = this.boxListing.puttable({ ...patch, ...this.scope }, opts)
    return box.put(patch, opts)
  }

  /** Non-throwing form of {@link putBox}. */
  tryPutBox(patch: BoxPut, opts: BoxPutOpts = {}): Promise<Outcome<Box>> { return outcomeOf(() => this.putBox(patch, opts)) }

  /** Return the (tombstoned) box listed at `boxlabel` -- see {@link BoxListing.del} for important details on refusals and options
   * Boxes considered "damaged" (failed validation after reading back) are
   * treated as missing, not tombstoned -- you must use {@link tryDelDamagedBox} to remove them.
   */
  async delBox(boxlabel: string, opts: TimelyOpts = {}): Promise<Box | null> {
    const timely = MSX.timelyOpts.parse(opts)
    const boxes = this.boxListing
    const scope = boxes.scopeOf({ ...this.scope, boxlabel })
    this.demandUnlocked()
    const held = boxes.at(scope)
    if (held !== null) { return held.del(timely) }
    await this.ensureTimely(timely.maxWorldMillis); this.demandUnlocked()
    return boxes.del(boxes.damagedAt(scope) ?? VS.sentinelBoxOf(scope, this.vault_tok))
  }

  tryDelBox(boxlabel: string, opts: TimelyOpts = {}): Promise<Outcome<Box | null>> { return outcomeOf(() => this.delBox(boxlabel, opts)) }

  // --

  // == [Children and discards]: boxListing, adopt, sweepContents, vacateContents

  /** The listing of this vault's boxes, made once, on first asking. */
  get boxListing(): BoxListing {
    this.#boxListing ??= this.listing.boxListingOf(this)
    return this.#boxListing
  }

  /** Take in `central`. A tombstone locks the vault, erases the cached row and vacates the boxes, the vault keeping its slot.
   * A refused erase is bad news, and the tombstone stands. */
  protected override adopt(central: Fetched<VaultRecord, VaultSparse>): void {
    super.adopt(central)
    if (this.isPresent) { return }
    void this.#vacateLease((refusal) => { this.listing.tellBadNews([refusal]) })
    this.#boxListing?.vacate()
  }

  /** The lease dropped, the row cached left for the next session, and the boxes swept. */
  protected override sweepContents(): void {
    this.#dropLease()
    this.#boxListing?.sweep()
    this.listing.declineGatingAtDiscard(this)
  }

  /** Locked, the row cached erased, and the boxes vacated. */
  protected override vacateContents(): void {
    void this.#vacateLease()
    this.#boxListing?.vacate()
    this.listing.declineGatingAtDiscard(this)
  }
  // --

  // == [Required by Storable]: isFullRecord, lifeTokPathOf, makeSnapshot

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
}
// --

// == [Birth's record]: recordOfBirth

/** The record of a birth, at the revision after `prior`, carrying `gate` and the stamp it was made under. */
const recordOfBirth = (gate: Gate, prior: MSX.Revision, now: number): VaultRecord => (
  { ...gate.stamp, fmt: MSX.VaultFormat, am: 'a', ...VS.nextRevisionOf(prior, now), gate: gate.pickle() }
)
// --
