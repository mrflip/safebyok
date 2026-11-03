import { consistent } from '../checks/validator'
import { randomId } from '../crypto'
import { VaultError } from '../errors'
import { type Outcome, outcomeOf, valOf } from '../outcome'
import * as Phrases from '../phrases'
import type { Clock } from '../shapes/bank-opts'
import type { VaultScope } from '../shapes/scopes'
import type { BoxWorld } from './box-listing'
import { Gate } from './gate'
import { Lease } from './lease'
import type { AttemptClosure, Fetched, GateProps, LeaseFriend, LockState, PasskeyClosure, PassphraseClosure, Revision, VaultRecord, VaultSparse } from './models-shapes'
import * as MSX from './models-shapes'
import type { Proving } from './proving'
import { Storable } from './storable'
import type { VaultWorld } from './vault-listing'

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

  /** Locked until a lease is set; `lock()` sets it again. */
  #isLocked = true

  /** The lease this device holds while the vault is unlocked, null while it is locked. */
  #lease: Lease | null = null

  /** The deviceDB work on the lease in flight, one chore after another. */
  #leaseChores: Promise<void> = Promise.resolve()

  /** The look for the lease this device keeps in flight, which a look begun meanwhile joins; null once it settles. */
  #keptLookup: Promise<Lease | null> | null = null

  /** The unlock by proof in flight, which an `ensureUnlocked` begun meanwhile joins; null once it settles. */
  #unlocking: Promise<Lease> | null = null

  #gate: { props: GateProps, gate: Gate } | null = null

  // == [Props, as the record has them]: fmt

  get fmt(): number { return this.central.fmt }
  // --

  // == [The world of its boxes]: clock, lockState, isLocked, ensureTimely, takeWorld

  get clock(): Clock { return this.world.clock }

  lockState(): LockState { return this.#isLocked ? 'locked' : 'unlocked' }

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

  /** Replace the passphrase with the one `passphraseClosure` answers, once `proofClosure` proves the gate by the passphrase, and send. The passkey stays, and must be revoked separately if unwanted; the vaultKey does not change, so a lease held stays in force. A record changed elsewhere while the proof ran refuses 'stale_write', storing nothing. */
  async replacePassphrase(proofClosure: AttemptClosure, passphraseClosure: PassphraseClosure): Promise<this> {
    MSX.passphraseReplaceArgs.parse({ proofClosure, passphraseClosure })
    await this.ensureReadyToChangeGate()
    const ante = this.demandFullProps().gate
    return this.#sendGate(ante, await this.gate.withPassphraseReplaced(proofClosure, passphraseClosure, this.world))
  }

  tryReplacePassphrase(proofClosure: AttemptClosure, passphraseClosure: PassphraseClosure): Promise<Outcome<this>> { return outcomeOf(() => this.replacePassphrase(proofClosure, passphraseClosure)) }

  /** Add the passkey whose answer `passkeyClosure` hands in, once `proofClosure` proves the gate by the passphrase, and send. A vault with a passkey refuses 'bad_option', asking nothing. The vaultKey does not change, so a lease held stays in force. A record changed elsewhere while the proof ran refuses 'stale_write', storing nothing. */
  async addPasskey(proofClosure: AttemptClosure, passkeyClosure: PasskeyClosure): Promise<this> {
    MSX.passkeyAddArgs.parse({ proofClosure, passkeyClosure })
    await this.ensureReadyToChangeGate()
    const ante = this.demandFullProps().gate
    return this.#sendGate(ante, await this.gate.withPasskeyAdded(proofClosure, passkeyClosure, this.world))
  }

  tryAddPasskey(proofClosure: AttemptClosure, passkeyClosure: PasskeyClosure): Promise<Outcome<this>> { return outcomeOf(() => this.addPasskey(proofClosure, passkeyClosure)) }

  /** Revoke the passkey, once `proofClosure` proves the gate by the passphrase, and send. A vault without one refuses 'absent_wayin', asking nothing. Removal is not revocation of the vaultKey, which does not change: a lease held stays in force. A record changed elsewhere while the proof ran refuses 'stale_write', storing nothing. */
  async revokePasskey(proofClosure: AttemptClosure): Promise<this> {
    MSX.passkeyRevokeArgs.parse({ proofClosure })
    await this.ensureReadyToChangeGate()
    const ante = this.demandFullProps().gate
    return this.#sendGate(ante, await this.gate.withPasskeyRevoked(proofClosure, this.world))
  }

  tryRevokePasskey(proofClosure: AttemptClosure): Promise<Outcome<this>> { return outcomeOf(() => this.revokePasskey(proofClosure)) }

  /** Put `gate` over the record in hand, under the next revision: the vault's one path to a new gate. Where a hydrate shows the record's gate is no longer `ante`, the one proved against, it refuses 'stale_write', storing nothing. */
  async #sendGate(ante: GateProps, gate: GateProps): Promise<this> {
    await this.hydrate()
    const held = this.demandFullProps()
    if (held.gate !== ante) { throw gateMovedUnderChange(held) }
    const record = { ...held, revision_tok: randomId(), revision_seq: held.revision_seq + 1, written_at: this.world.clock.now(), gate }
    await this.listing.put(record, held)
    return this
  }
  // --

  // == [Unlocking]: isUnlocked, ensureUnlocked, demandLease, takeUpLease, takeUpKeptLease, unlock, unlockAlone, unlockByProof, lookUpKept, setLease

  get isUnlocked(): boolean { return ! this.#isLocked }

  /** The lease in force, unlocking first where there is none: through the lease this device keeps, else the unlock in flight, else the proof `proofClosure` answers; with none of them, refuses 'vault_locked'.
   * A caller that joins an unlock in flight shares its outcome, a refusal included, and proves by calling again.
   */
  async ensureUnlocked(proofClosure?: AttemptClosure): Promise<Lease> {
    await this.ensureTimely()
    const held = this.#lease
    if (held?.isInForce) { return held }
    if (held !== null) { this.lock() }
    return this.#unlock(proofClosure)
  }

  /** The lease the vault holds; a locked vault refuses 'vault_locked'. */
  demandLease(): Lease {
    if (this.#isLocked || this.#lease === null) { throw unlockFirst() }
    return this.#lease
  }

  /** Hold `lease` as the vault's lease, letting go any it held: the vault reads unlocked. A lease of another vault refuses 'bad_option'; one not in force, 'vault_locked'. */
  takeUpLease(lease: Lease): Lease {
    if (! consistent(MSX.vaultStamp.parse(lease), MSX.vaultStamp.parse(this))) { throw leaseOfOtherHolder() }
    if (! lease.isInForce) { throw leaseNotInForce() }
    return this.#setLease(lease)
  }

  /** Take up the lease this device keeps of the vault, where the vault holds none and one is kept in force; a refused look is told as bad news. */
  takeUpKeptLease(): Promise<Lease | null> {
    if (this.#lease !== null) { return Promise.resolve(null) }
    this.#keptLookup ??= this.#lookUpKept()
    return this.#keptLookup
  }

  async #unlock(proofClosure?: AttemptClosure): Promise<Lease> {
    const inFlight = this.#unlocking
    if (inFlight !== null) { return inFlight }
    const kept = await this.takeUpKeptLease()
    if (kept !== null) { return kept }
    // A lease taken up meanwhile, through `takeUpLease`, is the answer: the look declined the kept one for it.
    const held = this.#lease
    if (held?.isInForce) { return held }
    if (proofClosure !== undefined) { this.#unlocking ??= this.#unlockAlone(proofClosure) }
    if (this.#unlocking === null) { throw noProofToUnlock() }
    return this.#unlocking
  }

  /** The unlock by proof as the one in flight: `#unlocking`, cleared once it settles. */
  async #unlockAlone(proofClosure: AttemptClosure): Promise<Lease> {
    try {
      // The await always yields first, so the finally never runs before `#unlock` has set `#unlocking`.
      return await this.#unlockByProof(proofClosure)
    } finally {
      this.#unlocking = null
    }
  }

  async #unlockByProof(proofClosure: AttemptClosure): Promise<Lease> {
    if (! this.isFull) { await this.fetch() }
    const proving = await this.gate.attemptProof(proofClosure, this.world)
    // An erase a lock queued lands before this grant's put.
    await this.#leaseChores
    return this.#setLease(await this.leaseCachedOf(proving))
  }

  /** A lease from `proving`, cached on this device; a refused cache is told as bad news, as it costs the next session a proof, not this one its lease. */
  async leaseCachedOf(proving: Proving): Promise<Lease> {
    const lease = await proving.buildLease(this.leaseFriend())
    const cached = await lease.tryCache()
    if (! cached.ok) { this.listing.tellBadNews([cached.err]) }
    return lease
  }

  async #lookUpKept(): Promise<Lease | null> {
    try {
      // An erase a lock queued lands before this look, so a lease just locked is not taken up again. Awaited first, so `#keptLookup` is set before the finally clears it.
      await this.#leaseChores
      const kept = await outcomeOf(() => this.#peekLease())
      if (! kept.ok) {
        this.listing.tellBadNews([kept.err])
        return null
      }
      if (kept.val === null) { return null }
      if (this.#lease?.isInForce === true) {
        kept.val.evict()
        return null
      }
      return this.#setLease(kept.val)
    } finally {
      this.#keptLookup = null
    }
  }

  /** The lease this device has cached for the gate of the record in hand, fetching a vault held sparse for that gate. */
  async #peekLease(): Promise<Lease | null> {
    if (! this.isFull) { await this.fetch() }
    return Lease.peek(this.leaseFriend(), this.gate.gate_epoch)
  }

  /** Hold `lease` as the vault's, the vault reading unlocked, and evict the lease it displaces. */
  #setLease(lease: Lease): Lease {
    const displaced = this.#lease
    this.#lease = lease
    this.#isLocked = false
    if (displaced !== null && displaced !== lease) { displaced.evict() }
    this.settle()
    return lease
  }
  // --

  // == [The lease]: leaseFriend, lock, letLeaseGo, leaseChore

  /** All a lease or a proving hears of this vault: its stamp, clock and logger, `lock`, and the world's lease verbs bound to its scope. */
  leaseFriend(): LeaseFriend {
    const { scope, world: { clock, logger, deviceDB } } = this
    return {
      ...MSX.vaultStamp.parse(this),
      clock,
      logger,
      lock:            () => { this.lock() },
      peekLease:       async () => valOf(await deviceDB.tryGetLease(scope)),
      tryCacheLease:   (record) => deviceDB.tryPutLease(record),
      tryUncacheLease: () => deviceDB.tryDelLease(scope),
    }
  }

  /** Lock the vault, synchronously, and erase the lease this device keeps, whether or not the vault holds one: the vault reads locked before this returns; letting the held lease go and the erase are queued as a chore. */
  lock(): void {
    this.#isLocked = true
    const lease = this.#lease
    this.#lease = null
    const { tryUncacheLease } = this.leaseFriend()
    this.#leaseChore(async () => {
      lease?.evict()
      valOf(await tryUncacheLease())
    })
    this.settle()
  }

  /** Let the vault's lease go, the vault reading locked and the lease this device keeps left for the next load: the listing's goodbye, where `lock()` erases. */
  letLeaseGo(): void {
    this.#isLocked = true
    const lease = this.#lease
    this.#lease = null
    lease?.evict()
    this.settle()
  }

  /** Queue deviceDB work on the lease, in order, never awaited by a caller: a refusal is told as bad news. `#unlockByProof` awaits the queue before granting and `#lookUpKept` before looking, so a lock's erase lands before the next put or get. */
  #leaseChore(work: () => Promise<void>): void {
    const prior = this.#leaseChores
    this.#leaseChores = (async () => {
      await prior
      const done = await outcomeOf(work)
      if (! done.ok) { this.listing.tellBadNews([done.err]) }
    })()
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
