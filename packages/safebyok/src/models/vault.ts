import { verifyConsistent } from '../checks/validator'
import { outcomeOf } from '../outcome'
import * as Phrases from '../phrases'
import type { Clock } from '../shapes/bank-opts'
import type { VaultScope } from '../shapes/scopes'
import { VaultError } from '../errors'
import type { BoxWorld } from './box-listing'
import { Gate } from './gate'
import type { Lease } from './lease'
import type { Fetched, GateProps, LeaseDBFriend, LockState, ProofClosure, TimelyOpts, VaultRecord, VaultSparse } from './models-shapes'
import * as MSX from './models-shapes'
import { Storable } from './storable'
import type { VaultWorld } from './vault-listing'

// == [Record forms]: VaultSnapshot, VaultProps, VaultPatch

export type VaultSnapshot = VaultScope & Readonly<{
  vault_tok:     string
  revision_tok:  string
  revision_seq:  number
  registered_at: number
  written_at:    number
  present:       boolean
}>

/** The one prop a vault takes from a patch: its first gate, which `buildGate` hands `edit`. A vault with a gate ignores a patch's, as it does every other prop of its record, so a patch only moves the revision, and a draft's `send` stores it. */
export type VaultProps = Readonly<{ gate?: GateProps | null | undefined }>

/** A host's patch for `edit` and `send`: the {@link VaultProps}, and any prop of the vault's record, which the vault controls and ignores, so `{ ...record }` will do. `vaultPatch` checks it. */
export type VaultPatch = { [Prop in keyof VaultRecord]?: VaultRecord[Prop] | undefined }
// --

// == [Vault]

/** A vault as this device holds it: a storable that ducks as its record, and the world its boxes live in.
 * Its `vault_tok` is the life of the vault in its scope, fixed at birth: a draft's is minted
 * here, a received record's is its own, and a record under another `vault_tok` throws
 * 'unexpected_error', a draft's central never stored included. Its record carries its gate, the
 * wayins, and nothing else stores them. Its guards take no lock: its record holds no secret. A vault deleted or damaged is not edited back to life, as a box is: a new life is a new
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

  /** The lease this device holds while the vault is unlocked, null while it is locked. Not yet: setting one, through `ensureUnlocked`. */
  #lease: Lease | null = null

  /** The deviceDB work on the lease in flight, one chore after another. */
  #leaseChores: Promise<void> = Promise.resolve()

  /** The gate `gate` made last, and the record's gate it was made from. */
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

  // == [The gate]: gate, buildGate

  /** The gate of the record in hand, made from its `gate`, and made again once that changes; null for a vault not yet gated, or whose record in hand is sparse or a tombstone. Made here, not at `settle`, as the base constructor settles before this class's fields exist. */
  get gate(): Gate | null {
    const props = this.full?.gate ?? null
    if (props === null) { return null }
    if (this.#gate?.props !== props) { this.#gate = { props, gate: new Gate(this, props) } }
    return this.#gate.gate
  }

  /** Build this vault's gate from what `proofClosure` answers, and stage it by `edit`; `send` stores it. A vault born of a dna has none until this lands. Refuses 'bad_option' a vault that has one. */
  async buildGate(proofClosure: ProofClosure): Promise<this> {
    MSX.buildGateArgs.parse({ proofClosure })
    if (this.gate !== null) { throw gateAlreadyBuilt() }
    const gate = await Gate.build(this, proofClosure, this.world)
    return this.edit({ gate: gate.pickle() })
  }
  // --

  // == [The lease]: leaseDBFriend, lock, leaseChore

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
    const lease = this.#lease
    this.#lease = null
    if (lease !== null) { this.#leaseChore(() => lease.forget()) }
    this.settle()
  }

  /** Queue deviceDB work on the lease, in order, never awaited by a caller: a refusal is told as bad news. Not yet: `#unlock` awaits the queue before granting, so an erase lands before the next put. */
  #leaseChore(work: () => Promise<void>): void {
    const prior = this.#leaseChores
    this.#leaseChores = (async () => {
      await prior
      const done = await outcomeOf(work)
      if (! done.ok) { this.listing.tellBadNews([done.err]) }
    })()
  }
  // --

  // == [Guards]: demandReadyToEdit, demandReadyToSend, demandReadyToDel

  /** An edit needs the vault present and full, as what it stages keeps the gate of the record in hand; no lock. */
  override demandReadyToEdit(): this { return this.demandPresent().demandFull() }

  /** A send needs what an edit does, and a gate: a vault is never stored without one. */
  override demandReadyToSend(): this {
    if (this.demandReadyToEdit().gate === null) { throw notGatedYet() }
    return this
  }

  /** A vault deleted has no life left to delete; a damaged one may be deleted, as `bank.delDamagedVault` did. Not yet: the passphrase's proof the old `vault.del` took. */
  override demandReadyToDel(): this {
    if (this.am === 'x') { throw this.listing.absentRefusal(this.scope) }
    return this
  }
  // --

  // == [Required by Storable]: isFullRecord, isFullPatch, makeStaged, lifeTokPathOf, makeSnapshot

  /** A full vault record is one alive that carries its `gate`, null or not; a sparse one or a tombstone is not. */
  protected isFullRecord(fetched: VaultSparse): fetched is VaultRecord {
    return fetched.am === 'a' && 'gate' in fetched
  }

  /** Returns for a full patch of this vault, and refuses any other 'bad_option', naming the field; `edit`, so `send`, calls it first of all, before any guard. Every patch held to `vaultPatch` is full: `{}`, or the props of the vault's record, each checked, and all but a first gate ignored. A scope field that names another vault refuses, naming it. */
  protected isFullPatch(patch: unknown): asserts patch is VaultPatch {
    verifyConsistent(MSX.vaultPatch.parse(patch), this.scope, { kind: 'bad_option', message: Phrases.patchOfOtherScope })
  }

  /** `makeStagedBase`'s base, the record in hand under its next revision, its `vault_tok` kept, with the gate of the record in hand, or the patch's where it has none. No birthday reaches here: `demandReadyToEdit` refuses a vault deleted or damaged, whose new life is a new instance. */
  protected makeStaged(patch: VaultPatch): Promise<VaultRecord> {
    const { base } = this.makeStagedBase()
    return Promise.resolve({ ...base, gate: this.full?.gate ?? patch.gate ?? null })
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

// == [Refusals]: gateAlreadyBuilt, notGatedYet

const gateAlreadyBuilt = (): VaultError => new VaultError('bad_option', 'This vault has its gate already.')

const notGatedYet = (): VaultError => new VaultError('bad_option', 'This vault has no gate yet, so it cannot be stored: buildGate gives it one.')
// --
