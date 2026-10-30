/** The shapes the models share, imported as `MSX`: the record forms a storable holds and reconciles, the listing and the bag a storable is made with, the options its verbs take, and the checks of each bag that crosses into a storable. */

import type * as Z from 'zod'
import { Checker, objCheck } from '../checks/validator'
import type { VaultError } from '../errors'
import type { Clock } from '../shapes/bank-opts'
import type { Storable } from './storable'

// == [Record forms]: Revision, Times, Am, Liveness, VaultTok, SparseBase, Tombstone, Fetched, Dna, Cacheable, Settled, NeverStoredSeq, isTombstone

export type Revision = Readonly<{ revision_tok: string, revision_seq: number }>

// When the thing was first stored, and when the record in hand was written; on a tombstone, when it was deleted.
export type Times = Readonly<{ registered_at: number, written_at: number }>

/** Whether a record is alive, damaged (it failed its check or its seal, and reads as gone), or gone (deleted). */
export const Ams = ['a', 'd', 'x'] as const
export const am = Checker(({ oneof }) => oneof(Ams))
export type Am = Z.infer<typeof am>
export type Liveness = Readonly<{ am: Am }>

// Every storable records, and seals, the token of the vault it lies in; a vault's is its own.
export type VaultTok = Readonly<{ vault_tok: string }>

// The least a sparse form carries: the scope, the revision, the times, whether it is alive, and the vault token.
export type SparseBase<ScopeT> = ScopeT & Revision & Times & Liveness & VaultTok

// A tombstone is the sparse form of a thing damaged or gone: every sparse prop stays on it, for the record; nothing the user put in the thing does.
export type Tombstone<SparseT> = SparseT & Readonly<{ am: 'd' | 'x' }>

/** Outcome `val` of storage calls: the full record, its sparse form, or its tombstone. */
export type Fetched<RecordT, SparseT> = RecordT | SparseT | Tombstone<SparseT>

// The DNA of a storable, what a caller hands `listing.build`: the scope, and any of the record's props; those the factory controls are ignored.
export type Dna<ScopeT, RecordT> = ScopeT & Partial<RecordT>

// The copy the listing writes to the device cache: the sparse form, with central and the staged beside it.
export type Cacheable<RecordT, SparseT> = SparseT & Readonly<{
  central: Fetched<RecordT, SparseT>
  staged:  Fetched<RecordT, SparseT>
}>

// Bag `settle` and `receive` hand back: news to tell the host once. The copy to cache is the instance's `cacheable`.
export type Settled = Readonly<{ badnews: readonly VaultError[] }>

// The revision_seq of a central nothing has stored: a thing never stored is born with a tombstone here as central, and its first record, at revision 0, staged.
export const NeverStoredSeq = -1

export const isTombstone = <SparseT extends Liveness>(fetched: SparseT): fetched is Tombstone<SparseT> => fetched.am !== 'a'
// --

// == [Reconciling]: RecordShape, Age, ReceivedAct, CentralPolicy, Reconciled, StagedAct, StagedForms, receivedAct, stagedForms

/** The shape of a record as `classifyRecordShape` tells it: sparse, full, gone (a tombstone), or ouch (damaged, as the listing delivered it). */
export const RecordShapes = ['sparse', 'full', 'gone', 'ouch'] as const
export const recordShape = Checker(({ oneof }) => oneof(RecordShapes), 'unexpected_error')
export type RecordShape = Z.infer<typeof recordShape>

/** How `post` compares to `ante`, as `cmpRevisions` tells it. */
export const Ages = ['older', 'same', 'newer'] as const
export const age = Checker(({ oneof }) => oneof(Ages), 'unexpected_error')
export type Age = Z.infer<typeof age>

/** The policies of `reconcileCentral` that go on to `reconcileStaged`; older, same and skip end the receive with central as it was. */
export const ReceivedActs = ['fill', 'adopt', 'gone', 'ouch'] as const
export const receivedAct = Checker(({ oneof }) => oneof(ReceivedActs), 'unexpected_error')
export type ReceivedAct = Z.infer<typeof receivedAct>

export const CentralPolicies = ['older', 'same', 'skip', ...ReceivedActs] as const
export const centralPolicy = Checker(({ oneof }) => oneof(CentralPolicies), 'unexpected_error')
export type CentralPolicy = Z.infer<typeof centralPolicy>

export type Reconciled<RecordT, SparseT> = Readonly<{ central: Fetched<RecordT, SparseT>, policy: CentralPolicy }>

/** The row `reconcileStaged` takes: a verb called here, or a ReceivedAct. */
export const StagedActs = ['edit', 'del', ...ReceivedActs] as const
export const stagedAct = Checker(({ oneof }) => oneof(StagedActs), 'unexpected_error')
export type StagedAct = Z.infer<typeof stagedAct>

// The bag `reconcileStaged` reads, and all it reads: `central` and `staged` as held, the revision after the central that results, and by act, the record `makeStaged` made of an edit's patch, or the record storage delivered.
type FormsBase<RecordT, SparseT> = Readonly<{
  central:      Fetched<RecordT, SparseT>
  staged:       Fetched<RecordT, SparseT>
  nextRevision: Revision
}>
export type StagedForms<RecordT, SparseT> =
  | (FormsBase<RecordT, SparseT> & Readonly<{ act: 'edit', patch: RecordT, rcvd?: undefined }>)
  | (FormsBase<RecordT, SparseT> & Readonly<{ act: 'del', patch?: undefined, rcvd?: undefined }>)
  | (FormsBase<RecordT, SparseT> & Readonly<{ act: ReceivedAct, patch?: undefined, rcvd: Fetched<RecordT, SparseT> }>)

/** The check of a {@link StagedForms}: the act, and the `patch` or `rcvd` it calls for, and no other. Refuses 'unexpected_error': a bag that fails it is a bug in Storable. Checks only. */
export const stagedForms = Checker(({ discrim, obj, lit, oneof, unk, str, int }) => {
  const revision = obj({ revision_tok: str, revision_seq: int })
  const record   = obj({ revision_tok: str, revision_seq: int, am: oneof(Ams) })
  const absent   = unk.optional().refine((val) => val === undefined, 'must be left out')
  const base     = { central: record, staged: record, nextRevision: revision }
  return discrim('act', [
    obj({ act: lit('edit'),          ...base, patch: record, rcvd: absent }),
    obj({ act: lit('del'),           ...base, patch: absent, rcvd: absent }),
    obj({ act: oneof(ReceivedActs),  ...base, patch: absent, rcvd: record }),
  ])
}, 'unexpected_error')
// --

// == [The listing, as a storable sees it]: LockState, World, StorableListing

export type LockState = 'unlocked' | 'locked'

// The world a listing lives in: the vault for boxes, the bank for vaults. The one clock lives here.
export type World = { clock: Clock }

export type StorableListing<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>> = {
  world: World
  clock: Clock
  lockState(): LockState
  ensureTimelyWorld(opts: TimelyOpts): Promise<void>
  absentRefusal(scope: ScopeT): VaultError
  fetchRecordOf(thing: Storable<ScopeT, RecordT, SparseT, unknown, unknown>): Promise<void>
  putRecordOf(thing: Storable<ScopeT, RecordT, SparseT, unknown, unknown>, record: RecordT): Promise<void>
  delRecordOf(thing: Storable<ScopeT, RecordT, SparseT, unknown, unknown>): Promise<void>
}
// --

// == [Making a storable]: StorableOpts, storableOpts

// The bag a storable is made with: its world and listing, the record it holds as central, the staged where one is revived from the cache or born with it, and its refresh horizon.
export type StorableOpts<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>> = {
  world:                  World
  listing:                StorableListing<ScopeT, RecordT, SparseT>
  central:                Fetched<RecordT, SparseT>
  staged?:                Fetched<RecordT, SparseT> | undefined
  maxMillisSinceRefresh:  number
  // The trigger's: the fraction of the horizon after which the next refresh is scheduled.
  eagerFrac?:             number | undefined
}

/** The check of a {@link StorableOpts}, as far as the base can tell: the concrete class's validator judges the records. Refuses 'bad_option'. Checks only; the bag goes on as it came. */
export const storableOpts = objCheck(({ obj, fn, custom, str, int, num, epochMillis }) => {
  const revised = obj({ revision_tok: str, revision_seq: int, registered_at: epochMillis, written_at: epochMillis })
  return {
    world:                 obj({ clock: obj({ now: fn<Clock['now']>() }) }),
    listing:               obj({ lockState: fn(), ensureTimelyWorld: fn(), absentRefusal: fn(), fetchRecordOf: fn(), putRecordOf: fn(), delRecordOf: fn() }),
    central:               revised,
    staged:                revised.optional(),
    maxMillisSinceRefresh: num.nonnegative().or(custom<number>((val) => val === Infinity)),
    eagerFrac:             num.positive().max(1).optional(),
  }
}, 'bad_option')
// --

// == [Options]: IfPresent, ifPresent, TimelyOpts, SendOpts, EditOpts

/** Policies when writing to an already-existing record: replace it, throw an error, return it instead */
export const IfPresentValues = ['replace', 'fail', 'fetch'] as const
/** Policy when writing to an already-existing record: replace it, throw an error, return it instead */
export const ifPresent = Checker(({ oneof }) => oneof(IfPresentValues))
export type  IfPresent = Z.infer<typeof ifPresent>

// How fresh the record in hand and the world must be before a verb goes on. The world reads `maxWorldMillis`; the record, `maxMillisSinceRefresh`.
export type TimelyOpts = { maxMillisSinceRefresh?: number | undefined, maxWorldMillis?: number | undefined }

// `ifPresent`: how `send` treats a thing storage already holds. Not yet acted on.
export type SendOpts = TimelyOpts & { ifPresent?: IfPresent | undefined }

export type EditOpts = TimelyOpts
// --
