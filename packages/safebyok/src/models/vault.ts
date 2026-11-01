import { consistent, verifyConsistent } from '../checks/validator'
import * as RefusalFuncs from '../helpers/refusal-funcs'
import { type Outcome, outcomeOf, valOf } from '../outcome'
import * as Phrases from '../phrases'
import type { Clock } from '../shapes/bank-opts'
import type { VaultScope } from '../shapes/scopes'
import type { BoxWorld } from './box-listing'
import { Gate } from './gate'
import { Lease } from './lease'
import type { AttemptClosure, Fetched, GateProps, LeaseDBFriend, LockState, PasskeyClosure, PassphraseClosure, TimelyOpts, VaultRecord, VaultSparse } from './models-shapes'
import * as MSX from './models-shapes'
import { Storable } from './storable'
import type { VaultWorld } from './vault-listing'

// == [Record forms]: DefaultLeaseMillis, VaultSnapshot, VaultPatch, GateStaging

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

/** The one patch whose gate the vault stages: made only by `Vault.#sendGate`, and never exported, so no host's patch carries a gate. */
class GateStaging {
  /** The record's gate that `Vault.#sendGate`'s caller proved against, the very object: `makeStaged` refuses where the record in hand no longer holds it. */
  readonly ante: GateProps
  readonly gate: GateProps
  constructor(ante: GateProps, gate: GateProps) {
    this.ante = ante
    this.gate = gate
    Object.freeze(this)
  }
}
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

  /** The look for the lease this device keeps in flight, which a look begun meanwhile joins; null once it settles. */
  #keptLookup: Promise<Lease | null> | null = null

  /** The unlock by proof in flight, which an `ensureUnlocked` begun meanwhile joins; null once it settles. */
  #unlocking: Promise<Lease> | null = null

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
    const full = this.demandFullProps()
    if (this.#gate?.props !== full.gate) { this.#gate = { props: full.gate, gate: new Gate(full, full.gate) } }
    return this.#gate.gate
  }
  // --

  // == [Changing the gate]: replacePassphrase, addPasskey, revokePasskey, sendGate, each with its try form

  /** Replace the passphrase with the one `passphraseClosure` answers, once `proofClosure` proves the gate by the passphrase, and send. The passkey stays, and must be revoked separately if unwanted; the vaultKey does not change, so a lease held stays in force. A record changed elsewhere while the proof ran refuses 'stale_write', storing nothing. */
  async replacePassphrase(proofClosure: AttemptClosure, passphraseClosure: PassphraseClosure): Promise<this> {
    MSX.passphraseReplaceArgs.parse({ proofClosure, passphraseClosure })
    await this.ensureReadyToEdit()
    const ante = this.demandFullProps().gate
    return this.#sendGate(ante, await this.gate.withPassphraseReplaced(proofClosure, passphraseClosure, this.world))
  }

  tryReplacePassphrase(proofClosure: AttemptClosure, passphraseClosure: PassphraseClosure): Promise<Outcome<this>> { return outcomeOf(() => this.replacePassphrase(proofClosure, passphraseClosure)) }

  /** Add the passkey whose answer `passkeyClosure` hands in, once `proofClosure` proves the gate by the passphrase, and send. A vault with a passkey refuses 'bad_option', asking nothing. The vaultKey does not change, so a lease held stays in force. A record changed elsewhere while the proof ran refuses 'stale_write', storing nothing. */
  async addPasskey(proofClosure: AttemptClosure, passkeyClosure: PasskeyClosure): Promise<this> {
    MSX.passkeyAddArgs.parse({ proofClosure, passkeyClosure })
    await this.ensureReadyToEdit()
    const ante = this.demandFullProps().gate
    return this.#sendGate(ante, await this.gate.withPasskeyAdded(proofClosure, passkeyClosure, this.world))
  }

  tryAddPasskey(proofClosure: AttemptClosure, passkeyClosure: PasskeyClosure): Promise<Outcome<this>> { return outcomeOf(() => this.addPasskey(proofClosure, passkeyClosure)) }

  /** Revoke the passkey, once `proofClosure` proves the gate by the passphrase, and send. A vault without one refuses 'absent_wayin', asking nothing. Removal is not revocation of the vaultKey, which does not change: a lease held stays in force. A record changed elsewhere while the proof ran refuses 'stale_write', storing nothing. */
  async revokePasskey(proofClosure: AttemptClosure): Promise<this> {
    MSX.passkeyRevokeArgs.parse({ proofClosure })
    await this.ensureReadyToEdit()
    const ante = this.demandFullProps().gate
    return this.#sendGate(ante, await this.gate.withPasskeyRevoked(proofClosure, this.world))
  }

  tryRevokePasskey(proofClosure: AttemptClosure): Promise<Outcome<this>> { return outcomeOf(() => this.revokePasskey(proofClosure)) }

  /** Stage `gate` over the record in hand and send it: the vault's one path to a new gate. Where the record's gate is no longer `ante`, the one proved against, it refuses 'stale_write', storing nothing. */
  #sendGate(ante: GateProps, gate: GateProps): Promise<this> {
    return this.send(new GateStaging(ante, gate))
  }
  // --

  // == [Unlocking]: isUnlocked, leaseMillis, ensureUnlocked, demandLease, takeUpLease, takeUpKeptLease, unlock, unlockAlone, unlockByProof, lookUpKept, setLease

  get isUnlocked(): boolean { return ! this.#isLocked }

  /** How long a lease granted this vault lasts: the world's `leaseMillis`, else {@link DefaultLeaseMillis}. */
  get leaseMillis(): number { return this.world.leaseMillis ?? DefaultLeaseMillis }

  /** The lease in force, unlocking first where there is none: through the lease this device keeps, else the unlock in flight, else the proof `proofClosure` answers; with none of them, refuses 'vault_locked'. A lease held past its time locks the vault first.
   * A caller that joins an unlock in flight shares its outcome, a refusal included, and proves by calling again.
   */
  async ensureUnlocked(proofClosure?: AttemptClosure): Promise<Lease> {
    await this.ensureTimely({})
    const held = this.#lease
    if (held?.isInForce) { return held }
    if (held !== null) { this.lock() }
    return this.#unlock(proofClosure)
  }

  /** The lease the vault holds; a locked vault refuses 'vault_locked'. */
  demandLease(): Lease {
    if (this.#isLocked || this.#lease === null) { throw RefusalFuncs.needVaultUnlocked() }
    return this.#lease
  }

  /** Hold `lease` as the vault's lease, letting go any it held: the vault reads unlocked. A lease of another vault, or granted another Vault object, refuses 'bad_option'; one not in force, 'vault_locked'. */
  takeUpLease(lease: Lease): Lease {
    if (lease.vault !== this || ! consistent(MSX.vaultStamp.parse(lease), MSX.vaultStamp.parse(this))) { throw RefusalFuncs.leaseOfOtherHolder() }
    if (! lease.isInForce) { throw RefusalFuncs.leaseNotInForce() }
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
    if (this.#unlocking === null) { throw RefusalFuncs.noProofToUnlock() }
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
    return this.#setLease(await proving.makeLease(this, this.leaseDBFriend(), { leaseMillis: this.leaseMillis }))
  }

  async #lookUpKept(): Promise<Lease | null> {
    try {
      // An erase a lock queued lands before this look, so a lease just locked is not taken up again. Awaited first, so `#keptLookup` is set before the finally clears it.
      await this.#leaseChores
      const kept = await Lease.tryGet(this, this.leaseDBFriend())
      if (! kept.ok) {
        this.listing.tellBadNews([kept.err])
        return null
      }
      if (kept.val === null) { return null }
      // Declined, it is evicted: its autolock would otherwise lock the vault at its own `autolock_at`.
      if (! kept.val.isInForce || this.#lease?.isInForce === true) {
        kept.val.evict()
        return null
      }
      return this.#setLease(kept.val)
    } finally {
      this.#keptLookup = null
    }
  }

  /** Hold `lease` as the vault's, the vault reading unlocked, and evict the lease it displaces. */
  #setLease(lease: Lease): Lease {
    const displaced = this.#lease
    this.#lease = lease
    this.#isLocked = false
    // Let go, the displaced lease's autolock neither locks the vault nor erases this lease's record at the old `autolock_at`.
    if (displaced !== null && displaced !== lease) { displaced.evict() }
    this.settle()
    return lease
  }
  // --

  // == [The lease]: leaseDBFriend, lock, letLeaseGo, leaseChore

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

  /** Lock the vault, synchronously, and erase the lease this device keeps, whether or not the vault holds one: the vault reads locked before this returns; letting the held lease go and the erase are queued as a chore. */
  lock(): void {
    this.#isLocked = true
    const lease = this.#lease
    this.#lease = null
    const { tryDelLease } = this.leaseDBFriend()
    this.#leaseChore(async () => {
      lease?.evict()
      valOf(await tryDelLease())
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

  /** Returns for a full patch of this vault, and refuses any other 'bad_option', naming the field; `edit`, so `send`, calls it first of all, before any guard. Every patch held to `vaultPatch` is full: `{}`, or the props of the vault's record, each checked, and all ignored. A scope field that names another vault refuses, naming it. The gate's own staging, from `#sendGate`, is full too. */
  protected isFullPatch(patch: unknown): asserts patch is VaultPatch {
    if (patch instanceof GateStaging) { return }
    verifyConsistent(MSX.vaultPatch.parse(patch), this.scope, { kind: 'bad_option', message: Phrases.patchOfOtherScope })
  }

  /** `makeStagedBase`'s base, the record in hand under its next revision, its `vault_tok` kept, and its gate, but where `#sendGate` stages a new one: a host's patch's props are all ignored. A staged gate proved against another gate than the record's refuses 'stale_write', its `meta` carrying the revisions as `edit`'s own refusal does. No birthday reaches here: `demandReadyToEdit` refuses a vault deleted or damaged, whose new life is a new instance. */
  protected makeStaged(patch: VaultPatch): Promise<VaultRecord> {
    const { base } = this.makeStagedBase()
    const held = this.demandFullProps().gate
    if (! (patch instanceof GateStaging)) { return Promise.resolve({ ...base, gate: held }) }
    if (patch.ante !== held) { throw RefusalFuncs.gateMovedUnderChange({ stored_revision: MSX.revision.parse(this.central), staged_revision: MSX.revision.parse(base) }) }
    return Promise.resolve({ ...base, gate: patch.gate })
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
