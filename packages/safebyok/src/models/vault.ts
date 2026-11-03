import { type CipherCtxRecord, randomId } from '../crypto'
import { VaultError } from '../errors'
import { type Outcome, outcomeOf } from '../outcome'
import * as Phrases from '../phrases'
import { reportToPlatform } from '../report-error'
import type { Clock } from '../shapes/bank-opts'
import type { VaultScope } from '../shapes/scopes'
import type { BoxListing, BoxWorld } from './box-listing'
import { type GateChange, Gate } from './gate'
import { Lease } from './lease'
import type { AttemptClosure, Fetched, GateProps, LeaseFriend, LockState, PasskeyClosure, PassphraseClosure, Revision, SealedWhisper, VaultRecord, VaultSparse } from './models-shapes'
import * as MSX from './models-shapes'
import type { Proving } from './proving'
import { Storable } from './storable'
import type { VaultListing, VaultWorld } from './vault-listing'

// == [Record forms]: DefaultLeaseMillis, VaultSnapshot

/** How long a lease lasts where the world names no `leaseMillis`: fourteen days. */
export const DefaultLeaseMillis = 14 * 24 * 60 * 60_000

export type VaultSnapshot = VaultScope & Readonly<{
  vault_tok:     string
  revision_tok:  string
  revision_seq:  number
  registered_at: number
  written_at:    number
  present:       boolean
  lockState:     LockState
}>
// --

// == [Vault]

/** A vault as this device holds it: a storable that ducks as its record, and the world its boxes live in.
 * Its `vault_tok` is the life of the vault in its scope, fixed at birth: a birth's is minted
 * by the listing, a received record's is its own, and a record under another `vault_tok` throws
 * 'unexpected_error'. Its record carries its gate, the wayins, and nothing else stores them. Its
 * guards take no lock: its record holds no secret. A vault deleted or damaged is not sent back to
 * life, as a box is: a new life is a new `vault_tok`, so a new instance, created by the listing.
 */
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

  // == [The world of its boxes]: clock, lockState, isLocked, ensureTimely, takeWorld

  get clock(): Clock { return this.world.clock }

  lockState(): LockState { return this.#lease === null ? 'locked' : 'unlocked' }

  /** The vault's own lock, not its world's: the bank has none. */
  override get isLocked(): boolean { return this.lockState() === 'locked' }

  /** This vault, refreshed within `maxMillis`, by default its horizon: as it stands where it is recent, otherwise fetched. A vault found gone or damaged refuses its absent refusal. */
  async ensureTimely(maxMillis?: number): Promise<this> {
    await this.hydrate({ maxMillisSinceRefresh: maxMillis })
    return this.demandPresent()
  }

  /** The vault record a box's answer carries, received as any record of this vault is. What `receive` hands back goes nowhere: the box listing takes its world synchronously, where the vault listing delivers asynchronously. */
  takeWorld(world: unknown): void {
    const sparse = this.listing.sparseOf(world)
    if (sparse.vault_tok === this.vault_tok) { this.receive(sparse) }
  }
  // --

  // == [The gate]: gate

  // Made on first read, not at settle: the base constructor settles before this class's fields exist.
  /** The Gate of the record in hand, the same while the record's `gate` is the same object, so a record received remakes it. A vault held sparse, or a tombstone, has none in hand and refuses 'bad_option': hydrate first. */
  get gate(): Gate {
    const full = this.demandFullProps()
    if (this.#gate?.props !== full.gate) { this.#gate = { props: full.gate, gate: new Gate(full, full.gate) } }
    return this.#gate.gate
  }
  // --

  // == [Changing the gate]: replacePassphrase, addPasskey, revokePasskey, sendGate, each with its try form

  /** Replace the passphrase with the one `passphraseClosure` answers, once `proofClosure` proves the gate by the passphrase, and send. The passkey stays, and must be revoked separately if unwanted; the vaultKey does not change, so a lease held is renewed under the new epoch. A record changed elsewhere while the proof ran refuses 'stale_write', storing nothing. */
  async replacePassphrase(proofClosure: AttemptClosure, passphraseClosure: PassphraseClosure): Promise<this> {
    MSX.passphraseReplaceArgs.parse({ proofClosure, passphraseClosure })
    await this.ensureReadyToChangeGate()
    const ante = this.demandFullProps().gate
    const heldLease = this.#lease
    return this.#sendGate(ante, heldLease, await this.gate.withPassphraseReplaced(proofClosure, passphraseClosure, this.world))
  }

  tryReplacePassphrase(proofClosure: AttemptClosure, passphraseClosure: PassphraseClosure): Promise<Outcome<this>> { return outcomeOf(() => this.replacePassphrase(proofClosure, passphraseClosure)) }

  /** Add the passkey whose answer `passkeyClosure` hands in, once `proofClosure` proves the gate by the passphrase, and send. A vault with a passkey refuses 'bad_option', asking nothing. The vaultKey does not change, so a lease held is renewed under the new epoch. A record changed elsewhere while the proof ran refuses 'stale_write', storing nothing. */
  async addPasskey(proofClosure: AttemptClosure, passkeyClosure: PasskeyClosure): Promise<this> {
    MSX.passkeyAddArgs.parse({ proofClosure, passkeyClosure })
    await this.ensureReadyToChangeGate()
    const ante = this.demandFullProps().gate
    const heldLease = this.#lease
    return this.#sendGate(ante, heldLease, await this.gate.withPasskeyAdded(proofClosure, passkeyClosure, this.world))
  }

  tryAddPasskey(proofClosure: AttemptClosure, passkeyClosure: PasskeyClosure): Promise<Outcome<this>> { return outcomeOf(() => this.addPasskey(proofClosure, passkeyClosure)) }

  /** Revoke the passkey, once `proofClosure` proves the gate by the passphrase, and send. A vault without one refuses 'absent_wayin', asking nothing. Removal is not revocation of the vaultKey, which does not change: a lease held is renewed under the new epoch. A record changed elsewhere while the proof ran refuses 'stale_write', storing nothing. */
  async revokePasskey(proofClosure: AttemptClosure): Promise<this> {
    MSX.passkeyRevokeArgs.parse({ proofClosure })
    await this.ensureReadyToChangeGate()
    const ante = this.demandFullProps().gate
    const heldLease = this.#lease
    return this.#sendGate(ante, heldLease, await this.gate.withPasskeyRevoked(proofClosure, this.world))
  }

  tryRevokePasskey(proofClosure: AttemptClosure): Promise<Outcome<this>> { return outcomeOf(() => this.revokePasskey(proofClosure)) }

  /** Put `gate` over the record in hand, under the next revision: the vault's one path to a new gate. Where a hydrate shows the record's gate is no longer `ante`, the one proved against, it refuses 'stale_write', storing nothing. Once it lands, `heldLease` is renewed. */
  async #sendGate(ante: GateProps, heldLease: Lease | null, { gate, proved }: GateChange): Promise<this> {
    await this.hydrate()
    const held = this.demandFullProps()
    if (held.gate !== ante) { throw gateMovedUnderChange(held) }
    const record = { ...held, revision_tok: randomId(), revision_seq: held.revision_seq + 1, written_at: this.world.clock.now(), gate }
    await this.listing.put(record, held)
    await this.#renewLease(proved, gate.gate_epoch, heldLease)
    return this
  }
  // --

  // == [Unlocking]: isUnlocked, ensureUnlocked, attachCachedLease

  get isUnlocked(): boolean { return this.#lease !== null }

  /** This vault, unlocked: as it stands, else by the lease this device has cached, else by the proof `proofClosure` answers; with no proof, refuses 'vault_locked'. A refused look at the cache is told as bad news, and asks for the proof. A `lock()` crossing an unlock before its attach ends unlocked, as the proof shows this user may have it so; the next `lock()` ends that. */
  async ensureUnlocked(proofClosure?: AttemptClosure): Promise<this> {
    await this.ensureTimely()
    if (this.isUnlocked) { return this }
    if (! this.isFull) { await this.fetch() }
    if (await this.#attachCachedLease()) { return this }
    if (proofClosure === undefined) { throw noProofToUnlock() }
    const proving = await this.gate.attemptProof(proofClosure, this.world)
    const lease = await proving.buildLease(this.leaseFriend())
    await lease.attach()
    return this
  }

  /** True where the lease this device has cached for this gate is now attached. */
  async #attachCachedLease(): Promise<boolean> {
    const peeked = await Lease.tryPeek(this.leaseFriend(), this.gate.gate_epoch)
    if (! peeked.ok) {
      this.listing.tellBadNews([peeked.err])
      return false
    }
    if (peeked.val === null) { return false }
    await peeked.val.attach()
    return true
  }
  // --

  // == [The lease]: leaseFriend, demandReadyToAttach, attachLease, renewLease, vacateLease, vacateUnattached, panic, lock

  /** All a lease or a proving hears of this vault: the one friend for its life, which is how an attach knows a lease made for this very instance. */
  leaseFriend(): LeaseFriend {
    this.#friend ??= this.#makeFriend()
    return this.#friend
  }

  #makeFriend(): LeaseFriend {
    const { world: { clock, logger, deviceDB } } = this
    const stamp = MSX.vaultStamp.parse(this)
    const asked = { ...this.scope, vault_tok: this.vault_tok }
    return {
      ...stamp,
      clock,
      logger,
      lock:            () => { this.lock() },
      attachLease:     (lease) => this.#attachLease(lease),
      peekLease:       () => deviceDB.peek(asked),
      tryCacheLease:   (record) => deviceDB.tryCache(record),
      tryUncacheLease: () => deviceDB.tryVacate(asked),
    }
  }

  /** An attach needs the vault enabled and present. */
  demandReadyToAttach(): this { return this.demandEnabled().demandPresent() }

  /** Hold `lease` as the vault's, dropping any it displaces, and cache it. A lease of another holder refuses 'bad_option', left alone, as its row is another's; one out of force refuses 'vault_locked'; on a vault not ready, the lease is vacated and the refusal thrown. A refused cache costs the next session a proof, not this one its lease, so it is told as bad news. */
  async #attachLease(lease: Lease): Promise<void> {
    if (lease.friend !== this.leaseFriend()) { throw leaseOfOtherHolder() }
    if (lease.isForgotten) { throw leaseNotInForce() }
    try {
      this.demandReadyToAttach()
    } catch (refusal) {
      await this.#vacateUnattached(lease)
      throw refusal
    }
    // Called before the settle, as a listener may call `lock()`, whose erase must land after this put.
    const caching = lease.tryCache()
    const displaced = this.#lease
    this.#lease = lease
    if (displaced !== null && displaced !== lease) { displaced.evict() }
    this.settle()
    const cached = await caching
    if (! cached.ok) { this.listing.tellBadNews([cached.err]) }
  }

  /** The lease `heldLease` was, under `gate_epoch`, where it is still in force: a vault locked at the start stays locked, and a lock crossing the change wins, the new lease vacated. */
  async #renewLease(proved: Proving, gate_epoch: number, heldLease: Lease | null): Promise<void> {
    if (heldLease === null) { return }
    const lease = await proved.buildLease(this.leaseFriend(), gate_epoch)
    if (heldLease.isForgotten) {
      await this.#vacateUnattached(lease)
      return
    }
    await lease.attach()
  }

  /** Read locked and erase the row, whether or not a lease is held. The erase is called before the first await, so it lands in call order against any cache; refused, it is a panic. */
  async #vacateLease(): Promise<void> {
    const vacating = this.leaseFriend().tryUncacheLease()
    this.#lease?.evict()
    this.#lease = null
    this.settle()
    const vacated = await vacating
    if (! vacated.ok) { await this.#panic(vacated.err) }
  }

  /** Drop a lease this vault did not attach, and its row. */
  async #vacateUnattached(lease: Lease): Promise<void> {
    const vacated = await lease.tryVacate()
    if (! vacated.ok) { this.listing.tellBadNews([vacated.err]) }
  }

  /** The cached lease survived a lock. The host's `onPanic` hears it, and a rejection goes no further than the platform; with none, the refusal goes to the platform and this vault is vacated, so this tab stops reopening it. */
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

  /** Lock the vault: it reads locked before this returns, its boxes with it, and the row this device has cached is erased. A refused erase is a panic, not a throw. On a vault discarded, a no-op. */
  override lock(): this {
    if (this.isDisabled) { return this }
    void this.#vacateLease()
    this.#boxListing?.lock()
    return this
  }
  // --

  // == [Seal verbs]: sealStampedString, unsealStampedString, demandLease

  /** `whisperText` sealed under a fresh boxKey under this vault's key, both bound to `stamp`. A locked vault refuses 'vault_locked', as does a lock crossing it; a lease that will not open locks the vault and refuses 'damaged_lease'. */
  async sealStampedString(whisperText: string, stamp: CipherCtxRecord): Promise<SealedWhisper> {
    MSX.leaseSealArgs.parse({ whisperText, stamp })
    return this.#demandLease().sealWith(whisperText, stamp)
  }

  /** The text `sealed` holds, bound to `stamp`. It refuses as `sealStampedString` does, and 'damaged_box' where `sealed` will not open. */
  async unsealStampedString(sealed: SealedWhisper, stamp: CipherCtxRecord): Promise<string> {
    MSX.leaseUnsealArgs.parse({ sealed, stamp })
    return this.#demandLease().unsealWith(sealed, stamp)
  }

  #demandLease(): Lease {
    this.demandEnabled()
    if (this.#lease === null) { throw unlockFirst() }
    return this.#lease
  }
  // --

  // == [Children and discards]: boxListing, sweepContents, vacateContents

  /** The listing of this vault's boxes, made once, on first asking. */
  get boxListing(): BoxListing {
    this.#boxListing ??= this.listing.boxListingOf(this)
    return this.#boxListing
  }

  /** The lease dropped, the row cached left for the next session, and the boxes swept. */
  protected override sweepContents(): void {
    this.#lease?.evict()
    this.#lease = null
    this.#boxListing?.sweep()
  }

  /** Locked, the row cached erased, and the boxes vacated. */
  protected override vacateContents(): void {
    void this.#vacateLease()
    this.#boxListing?.vacate()
  }
  // --

  // == [Guards]: ensureReadyToChangeGate, demandReadyToDel

  /** A gate change keeps the rest of the record in hand and needs the vault present and refreshed {@link MSX.Promptly}; no lock, as its record holds no secret. */
  ensureReadyToChangeGate(): Promise<this> { return this.ensureTimely(MSX.Promptly) }

  /** A vault deleted has no life left to delete; a damaged one may be deleted, as `bank.delDamagedVault` did. Not yet: the passphrase's proof the old `vault.del` took. */
  override demandReadyToDel(): this {
    if (this.am === 'x') { throw this.listing.absentRefusal(this.scope) }
    return this
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

// == [Refusals]: unlockFirst, noProofToUnlock, leaseOfOtherHolder, leaseNotInForce, gateMovedUnderChange

const unlockFirst = (): VaultError => new VaultError('vault_locked', Phrases.UnlockFirst)

const noProofToUnlock = (): VaultError => new VaultError('vault_locked', Phrases.NoProofToUnlock)

const leaseOfOtherHolder = (): VaultError => new VaultError('bad_option', Phrases.LeaseOfOtherHolder)

const leaseNotInForce = (): VaultError => new VaultError('vault_locked', Phrases.LeaseNotInForce)

/** The 'stale_write' of a gate change proved against a record that moved meanwhile, its `meta` the revision now held. */
const gateMovedUnderChange = (held: Revision): VaultError => new VaultError('stale_write', Phrases.GateMovedUnderChange, { meta: { stored_revision: MSX.revision.parse(held) } })
// --
