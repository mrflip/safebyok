import { verifyConsistent } from '../checks/validator'
import { VaultError } from '../errors'
import { outcomeOf } from '../outcome'
import * as Phrases from '../phrases'
import type { Clock } from '../shapes/bank-opts'
import type { VaultScope } from '../shapes/scopes'
import type { BoxWorld } from './box-listing'
import { Gate } from './gate'
import { Lease } from './lease'
import type { AttemptClosure, Fetched, GateProps, LeaseDBFriend, LockState, TimelyOpts, VaultRecord, VaultSparse } from './models-shapes'
import * as MSX from './models-shapes'
import { Storable } from './storable'
import type { VaultWorld } from './vault-listing'

// == [Record forms]: DefaultLeaseMillis, VaultSnapshot, VaultPatch

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

/** A host's patch for `edit` and `send`: any prop of the vault's record, each checked and all ignored, the gate included, so `{}` or `{ ...record }` will do and a patch only moves the revision. `vaultPatch` checks it. */
export type VaultPatch = { [Prop in keyof VaultRecord]?: VaultRecord[Prop] | undefined }
// --

// == [Vault]

/** A vault as this device holds it: a storable that ducks as its record, and the world its boxes live in.
 * Its `vault_tok` is the life of the vault in its scope, fixed at birth: a draft's is minted
 * here, a received record's is its own, and a record under another `vault_tok` throws
 * 'unexpected_error', a draft's central never stored included. Its record carries its gate, the
 * wayins, and nothing else stores them. Its guards take no lock: its record holds no secret. A
 * vault deleted or damaged is not edited back to life, as a box is: a new life is a new
 * `vault_tok`, so a new instance, built by the listing.
 */
export class Vault extends Storable<VaultScope, VaultRecord, VaultSparse, VaultPatch, VaultSnapshot> implements BoxWorld {
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

  /** The one look for the lease this device keeps, at `hello` or the first `ensureUnlocked`. */
  #keptLookup: Promise<Lease | null> | null = null

  #gate: { props: GateProps, gate: Gate } | null = null

  // == [Props, as the record has them]: fmt

  get fmt(): number { return this.combined.fmt }
  // --

  // == [The world of its boxes]: clock, lockState, isLocked, ensureTimely, takeWorld

  get clock(): Clock { return this.world.clock }

  lockState(): LockState { return this.#isLocked ? 'locked' : 'unlocked' }

  /** The vault's own lock, not its world's: the bank has none. */
  override get isLocked(): boolean { return this.lockState() === 'locked' }

  /** A box's verb wants its world timely: hydrate the vault by `maxWorldMillis`, the box's horizon for its world. */
  async ensureTimely(opts: TimelyOpts): Promise<void> {
    await this.hydrate({ maxMillisSinceRefresh: opts.maxWorldMillis })
  }

  /** The vault record a box's answer carries, received as any record of this vault is. What `receive` hands back goes nowhere: the box listing takes its world synchronously, where the vault listing delivers asynchronously. The vault saves itself to the device cache as it settles, as at any receive. */
  takeWorld(world: unknown): void {
    this.receive(this.listing.sparseOf(world))
  }
  // --

  // == [The gate]: gate

  // Made on first read, not at settle: the base constructor settles before this class's fields exist.
  /** The Gate of the record in hand, the same while the record's `gate` is the same object, so a record received remakes it. A vault held sparse, or a tombstone, has none in hand and refuses 'bad_option': hydrate first. */
  get gate(): Gate {
    const full = this.demandedFull()
    if (this.#gate?.props !== full.gate) { this.#gate = { props: full.gate, gate: new Gate(full, full.gate) } }
    return this.#gate.gate
  }
  // --

  // == [Unlocking]: isUnlocked, leaseMillis, ensureUnlocked, demandLease, takeUpLease, takeUpKeptLease, unlock, lookUpKept, setLease

  get isUnlocked(): boolean { return ! this.#isLocked }

  /** How long a lease granted this vault lasts: the world's `leaseMillis`, else {@link DefaultLeaseMillis}. */
  get leaseMillis(): number { return this.world.leaseMillis ?? DefaultLeaseMillis }

  /** The lease in force, unlocking first where there is none: through the lease this device keeps, else the proof `proofClosure` answers; with neither, refuses 'vault_locked'. A lease held past its time locks the vault first. */
  async ensureUnlocked(proofClosure?: AttemptClosure): Promise<Lease> {
    await this.ensureTimely({})
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

  /** Hold `lease`, granted to this Vault object, as its lease: the vault reads unlocked. A lease of another refuses 'bad_option'. */
  takeUpLease(lease: Lease): Lease {
    if (lease.vault !== this) { throw leaseOfOtherHolder() }
    return this.#setLease(lease)
  }

  /** Take up the lease this device keeps of the vault, where one is kept in force; looked for once, and a refused look is told as bad news. */
  takeUpKeptLease(): Promise<Lease | null> {
    // A vault holding a lease in force keeps no other: a Lease made of its own record would arm a second autolock.
    this.#keptLookup ??= this.#lease?.isInForce === true ? Promise.resolve(null) : this.#lookUpKept()
    return this.#keptLookup
  }

  async #unlock(proofClosure?: AttemptClosure): Promise<Lease> {
    const kept = await this.takeUpKeptLease()
    if (kept !== null && kept === this.#lease && kept.isInForce) { return kept }
    if (proofClosure === undefined) { throw noProofToUnlock() }
    if (! this.isFull) { await this.fetch() }
    const proving = await this.gate.attemptProof(proofClosure, this.world)
    // An erase a lock queued lands before this grant's put.
    await this.#leaseChores
    return this.#setLease(await proving.makeLease(this, this.leaseDBFriend(), { leaseMillis: this.leaseMillis }))
  }

  async #lookUpKept(): Promise<Lease | null> {
    // An erase a lock queued lands before this look, so a lease just locked is not taken up again.
    await this.#leaseChores
    const kept = await Lease.tryGet(this, this.leaseDBFriend())
    if (! kept.ok) {
      this.listing.tellBadNews([kept.err])
      return null
    }
    if (kept.val === null || ! kept.val.isInForce || this.#lease?.isInForce === true) { return null }
    return this.#setLease(kept.val)
  }

  #setLease(lease: Lease): Lease {
    this.#lease = lease
    this.#isLocked = false
    this.settle()
    return lease
  }
  // --

  // == [The lease]: leaseDBFriend, lock, dropLease, leaseChore

  /** The deviceDB as this vault's lease reaches it: the world's lease verbs, bound to this vault's scope, so no verb takes one. */
  leaseDBFriend(): LeaseDBFriend {
    const { scope, world: { logger, deviceDB } } = this
    return {
      logger,
      tryGetLease: () => deviceDB.tryGetLease(scope),
      tryPutLease: (record) => deviceDB.tryPutLease(record),
      tryDelLease: () => deviceDB.tryDelLease(scope),
    }
  }

  /** Lock the vault, synchronously: the lease is dropped and the vault reads locked before this returns; the lease's forgetting (its record erased from the deviceDB) is queued as a chore. A box's whisper reads LOCKED from here on. */
  lock(): void {
    this.#isLocked = true
    this.#dropLease()
    this.settle()
  }

  /** Let the lease go, its forgetting queued as a chore. */
  #dropLease(): void {
    const lease = this.#lease
    this.#lease = null
    if (lease !== null) { this.#leaseChore(() => lease.forget()) }
  }

  /** Queue deviceDB work on the lease, in order, never awaited by a caller: a refusal is told as bad news. `#unlock` awaits the queue before granting and `#lookUpKept` before looking, so an erase lands before the next put or get. */
  #leaseChore(work: () => Promise<void>): void {
    const prior = this.#leaseChores
    this.#leaseChores = (async () => {
      await prior
      const done = await outcomeOf(work)
      if (! done.ok) { this.listing.tellBadNews([done.err]) }
    })()
  }
  // --

  // == [Guards]: ensureReadyToEdit, demandReadyToEdit, demandReadyToDel

  /** What an edit stages keeps the gate of the record in hand, so a vault held sparse fetches its full record first, whatever its age. */
  override async ensureReadyToEdit(opts: TimelyOpts = {}): Promise<this> {
    await super.ensureReadyToEdit(opts)
    if (! this.isFull) { await this.fetch(opts) }
    return this.demandReadyToEdit()
  }

  /** An edit needs the vault present; no lock, as its record holds no secret. */
  override demandReadyToEdit(): this { return this.demandPresent() }

  /** A vault deleted has no life left to delete; a damaged one may be deleted, as `bank.delDamagedVault` did. Not yet: the passphrase's proof the old `vault.del` took. */
  override demandReadyToDel(): this {
    if (this.am === 'x') { throw this.listing.absentRefusal(this.scope) }
    return this
  }
  // --

  // == [Required by Storable]: isFullRecord, isFullPatch, makeStaged, lifeTokPathOf, makeSnapshot

  /** A full vault record is one alive that carries its `gate`; a sparse one or a tombstone is not. */
  protected isFullRecord(fetched: VaultSparse): fetched is VaultRecord {
    return fetched.am === 'a' && 'gate' in fetched
  }

  /** Returns for a full patch of this vault, and refuses any other 'bad_option', naming the field; `edit`, so `send`, calls it first of all, before any guard. Every patch held to `vaultPatch` is full: `{}`, or the props of the vault's record, each checked, and all ignored. A scope field that names another vault refuses, naming it. */
  protected isFullPatch(patch: unknown): asserts patch is VaultPatch {
    verifyConsistent(MSX.vaultPatch.parse(patch), this.scope, { kind: 'bad_option', message: Phrases.patchOfOtherScope })
  }

  /** `makeStagedBase`'s base, the record in hand under its next revision, its `vault_tok` and its gate kept: a patch's props are all ignored. No birthday reaches here: `demandReadyToEdit` refuses a vault deleted or damaged, whose new life is a new instance. */
  protected makeStaged(): Promise<VaultRecord> {
    const { base } = this.makeStagedBase()
    // not yet: the gate verbs stage a new gate through a private path of their own, never through a patch
    return Promise.resolve({ ...base, gate: this.demandedFull().gate })
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

// == [Refusals]: unlockFirst, noProofToUnlock, leaseOfOtherHolder

const unlockFirst = (): VaultError => new VaultError('vault_locked', Phrases.UnlockFirst)

const noProofToUnlock = (): VaultError => new VaultError('vault_locked', Phrases.NoProofToUnlock)

const leaseOfOtherHolder = (): VaultError => new VaultError('bad_option', Phrases.LeaseOfOtherHolder)
// --
