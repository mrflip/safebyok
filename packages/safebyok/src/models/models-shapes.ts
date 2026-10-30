/** The shapes the models share, imported as `MSX`: the record forms a storable holds and reconciles, what storage answers, the bags reconciling passes, the world and listing a storable lives in, the options its verbs take, and the arguments it is made with.
 * A type generic over a model's record cannot come from its validator, so it stays a type, with
 * the validator beside it: each check judges what the base can know of a record, its revision,
 * its times, its `am` and its `vault_tok`, and leaves the concrete class's validator the rest.
 * A check of a bag reconciling passes refuses 'unexpected_error': a bag that fails one is a bug
 * in Storable, never a host's. Every other `parse` refuses as its doc says, quoting none of its input.
 */

import type * as Z from 'zod'
import { Checker, Checkers, objCheck } from '../checks/validator'
import { type VaultError, isVaultError } from '../errors'
import { type Outcome } from '../outcome'
import * as Phrases from '../phrases'
import * as HX from '../shapes/host-code'
import { sidecar } from '../shapes/box'
import * as FX from '../shapes/fields'

// == [Checks]: Checks

/** The checks this module makes for itself, passed as `sources` to the validators below: `vaultError`, a VaultError as {@link isVaultError} tells one; and `absent`, a field that must be left out, which `unk` alone would not allow (it refuses a missing key). */
const Checks = Checkers('bad_record', ({ unk, custom }) => ({
  vaultError: custom<VaultError>(isVaultError, Phrases.VaultErrorExpected),
  absent:     unk.optional().refine((val) => val === undefined, Phrases.LeftOutExpected),
}))
// --

// == [Record forms]: amVals, tombstoneAmVals, am, revision, times, liveness, vaulted, sparseBase, tombstone, cacheable, Am, Revision, Times, Liveness, Vaulted, SparseBase, Tombstone, Fetched, Dna, Cacheable, NeverStoredSeq, isTombstone

/** Whether a record is alive (`a`), damaged (`d`: it failed its check or its seal, and reads as gone) or gone (`x`: deleted). */
export const amVals = ['a', 'd', 'x'] as const

/** The `am` a tombstone carries: damaged or gone, never alive. */
export const tombstoneAmVals = ['d', 'x'] as const

/** The checks of what the base knows of any record, each refusing 'bad_record': `am`, one of {@link amVals}; `revision`, `times`, `liveness` and `vaulted`, a part each; and `sparseBase`, the four together, the least a sparse form carries beside its scope.
 * `tombstone` is a sparse base that is damaged or gone; `cacheable` is one with `central` and
 * `staged` beside it, as the listing writes it to the device cache. Each takes its fields from
 * whatever carries them, a record, a storable or a snapshot, and strips the rest.
 *
 * @example sparseBase.parse(box)   // { revision_tok, revision_seq, registered_at, written_at, am, vault_tok }
 */
export const { am, revision, times, liveness, vaulted, sparseBase, tombstone, cacheable } = Checkers('bad_record', ({ obj, int, oneof, revision_tok, vault_tok, epochMillis }) => {
  const am = oneof(amVals)
  const revision = obj({
    revision_tok,
    /** A counter the store moves at every write: of two revisions, the higher `revision_seq` is the newer. {@link NeverStoredSeq} marks a central never stored. */
    revision_seq: int,
  })
  const times = obj({
    /** When the thing was first stored. */
    registered_at: epochMillis,
    /** When the record in hand was written; on a tombstone, when it was deleted. */
    written_at:    epochMillis,
  })
  const liveness   = obj({ am })
  const vaulted    = obj({ vault_tok })
  const sparseBase = obj({ ...revision.shape, ...times.shape, ...liveness.shape, ...vaulted.shape })
  const tombstone  = sparseBase.extend({ am: oneof(tombstoneAmVals) })
  const cacheable  = sparseBase.extend({ central: sparseBase, staged: sparseBase.nullable() })
  return { am, revision, times, liveness, vaulted, sparseBase, tombstone, cacheable }
}, [FX])

/** Whether a record is alive, damaged or gone, as {@link am} checks it: one of {@link amVals}. */
export type Am = Z.infer<typeof am>

/** A record's revision: its `revision_tok`, minted at each write, and its `revision_seq`, higher on the later write. */
export type Revision = Readonly<Z.infer<typeof revision>>

/** When the thing was first stored, and when the record in hand was written; on a tombstone, when it was deleted. */
export type Times = Readonly<Z.infer<typeof times>>

/** Whether a record is alive, damaged or gone: its `am`. */
export type Liveness = Readonly<Z.infer<typeof liveness>>

/** The `vault_tok` of the vault a record lies in, which every storable records and seals; a vault's is its own. */
export type Vaulted = Readonly<Z.infer<typeof vaulted>>

/** The least a sparse form carries: the scope, and what {@link sparseBase} checks, the revision, the times, whether it is alive and the vault it lies in. */
export type SparseBase<ScopeT> = ScopeT & Revision & Times & Liveness & Vaulted

/** The sparse form of a thing damaged or gone: every sparse prop stays on it, for the record; nothing the user put in the thing does. {@link tombstone} checks what the base knows of one. */
export type Tombstone<SparseT> = SparseT & Readonly<{ am: typeof tombstoneAmVals[number] }>

/** What a storage call delivers as its `val`: the full record, its sparse form, or its tombstone. {@link sparseBase} checks what the base knows of any of the three. */
export type Fetched<RecordT, SparseT> = RecordT | SparseT | Tombstone<SparseT>

/** The DNA of a storable, what a caller hands `listing.build`: the scope, and any of the record's props; those the factory controls are ignored. */
export type Dna<ScopeT, RecordT> = ScopeT & Partial<RecordT>

/** The copy the listing writes to the device cache: the sparse form, with `central` and `staged` beside it, `staged` null where nothing is staged. {@link cacheable} checks what the base knows of one. */
export type Cacheable<RecordT, SparseT> = SparseT & Readonly<{
  central: Fetched<RecordT, SparseT>
  staged:  Fetched<RecordT, SparseT> | null
}>

/** The `revision_seq` of a central never stored: a thing is born with a tombstone here as its central, so that any record received is newer, and nothing stored is what it expects. */
export const NeverStoredSeq = -1

/** True for a record whose `am` says damaged or gone. */
export const isTombstone = <SparseT extends Liveness>(fetched: SparseT): fetched is Tombstone<SparseT> => fetched.am !== 'a'
// --

// == [What storage answers]: answer, notice, Answer, Notice

/** The checks of what storage delivers, as far as the base can tell, each refusing 'bad_record': `answer`, an {@link Answer}, and `notice`, a {@link Notice}.
 * An answer is an `Outcome` with the `scope` asked about and the `world` beside it: its `val`, or
 * a notice's `record`, passes {@link sparseBase} (a `val` may be null for nothing stored); its `err`
 * is a VaultError, and each is left out beside the other, as an `Outcome` leaves them. Checks only:
 * nothing is taken from the result.
 */
export const { answer, notice } = Checkers('bad_record', ({ obj, union, lit, unk, absent, vaultError }) => {
  const answered = obj({ scope: obj({}).loose(), world: unk })
  const answer = union([
    answered.extend({ ok: lit(true),  val: sparseBase.nullable(), err: absent }),
    answered.extend({ ok: lit(false), err: vaultError,            val: absent }),
  ])
  const notice = obj({ world: unk, record: sparseBase })
  return { answer, notice }
}, [Checks])

/** The fields every answer carries beside its outcome: the `scope` the call asked about, and the world the record lies in as storage holds it now. */
type AnswerBase<ScopeT> = Readonly<{ scope: ScopeT, world: unknown }>

/** The outcome of a storage call about `scope`, as the concrete listing maps it: an {@link Outcome} whose `val` is the record stored (null for none), or whose `err` is the refusal, with the `scope` and the `world` it lies in as storage holds it now beside it.
 * Whatever an `Outcome` carries, an answer carries. A stored record that fails its check is
 * delivered as a tombstone, `am` 'd', made of what was recovered of it: its scope, `vault_tok`,
 * revision and times, and nothing else. Where that much cannot be recovered, the store refuses
 * 'corrupt_record' instead. {@link answer} checks what the base knows of one.
 */
export type Answer<ScopeT, RecordT, SparseT> = Outcome<Fetched<RecordT, SparseT> | null> & AnswerBase<ScopeT>

/** A notice from the watch: an answer nobody asked for, always naming a record, sparse at least, a damaged one as the tombstone an answer would carry. {@link notice} checks what the base knows of one. */
export type Notice<RecordT, SparseT> = Readonly<{ record: Fetched<RecordT, SparseT>, world: unknown }>
// --

// == [Reconciling]: recordShapeVals, ageVals, receivedActVals, centralPolicyVals, stagedActVals, recordShape, age, receivedAct, centralPolicy, stagedAct, reconciled, stagedForms, settled, RecordShape, Age, ReceivedAct, CentralPolicy, StagedAct, Reconciled, StagedForms, Settled

/** The shapes of a record as `classifyRecordShape` tells them: `sparse`, `full`, `gone` (a tombstone, `am` 'x') or `ouch` (a damaged one's tombstone, `am` 'd'). */
export const recordShapeVals = ['sparse', 'full', 'gone', 'ouch'] as const

/** How a revision `post` compares to an `ante`, as `cmpRevisions` tells it. */
export const ageVals = ['older', 'same', 'newer'] as const

/** The policies of `reconcileCentral` that go on to `reconcileStaged`: `fill` the record in hand, `adopt` the one received, or take it as `gone` or `ouch`. */
export const receivedActVals = ['fill', 'adopt', 'gone', 'ouch'] as const

/** Every policy `reconcileCentral` may choose: `older`, `same` and `skip` end the receive with central as it was; the rest are {@link receivedActVals}. */
export const centralPolicyVals = ['older', 'same', 'skip', ...receivedActVals] as const

/** The rows of `reconcileStaged`: a verb called here, `edit` or `del`, or one of {@link receivedActVals}. */
export const stagedActVals = ['edit', 'del', ...receivedActVals] as const

/** The checks of what reconciling passes, each refusing 'unexpected_error': the kinds above, each by its list; `reconciled`, what `reconcileCentral` hands back; `stagedForms`, what `reconcileStaged` reads; and `settled`, what `settle` and `receive` hand back.
 * `stagedForms` holds the act to its row: `edit` carries the `patch` and no `rcvd`, `del`
 * neither, and a received act the `rcvd` and no `patch`. Every record passes {@link sparseBase};
 * `staged` is null where nothing is staged. Checks only.
 */
export const { recordShape, age, receivedAct, centralPolicy, stagedAct, reconciled, stagedForms, settled } = Checkers('unexpected_error', ({ obj, arr, discrim, lit, oneof, absent, vaultError }) => {
  const forms = obj({ central: sparseBase, staged: sparseBase.nullable(), nextRevision: revision })
  return {
    recordShape:   oneof(recordShapeVals),
    age:           oneof(ageVals),
    receivedAct:   oneof(receivedActVals),
    centralPolicy: oneof(centralPolicyVals),
    stagedAct:     oneof(stagedActVals),
    reconciled:    obj({ central: sparseBase, policy: oneof(centralPolicyVals) }),
    stagedForms:   discrim('act', [
      forms.extend({ act: lit('edit'),            patch: sparseBase, rcvd: absent }),
      forms.extend({ act: lit('del'),             patch: absent,     rcvd: absent }),
      forms.extend({ act: oneof(receivedActVals), patch: absent,     rcvd: sparseBase }),
    ]),
    settled:       obj({ badnews: arr(vaultError).readonly() }).readonly(),
  }
}, [Checks])

/** The shape of a record: one of {@link recordShapeVals}. */
export type RecordShape = Z.infer<typeof recordShape>

/** How one revision compares to another: one of {@link ageVals}. */
export type Age = Z.infer<typeof age>

/** A policy that goes on to `reconcileStaged`: one of {@link receivedActVals}. */
export type ReceivedAct = Z.infer<typeof receivedAct>

/** A policy of `reconcileCentral`: one of {@link centralPolicyVals}. */
export type CentralPolicy = Z.infer<typeof centralPolicy>

/** A row of `reconcileStaged`: one of {@link stagedActVals}. */
export type StagedAct = Z.infer<typeof stagedAct>

/** What `reconcileCentral` hands back: the central that results, and the policy that chose it. {@link reconciled} checks what the base knows of one. */
export type Reconciled<RecordT, SparseT> = Readonly<{ central: Fetched<RecordT, SparseT>, policy: CentralPolicy }>

/** What every row of `reconcileStaged` reads: `central` as held, `staged` as held or null where nothing is staged, and the revision after the central that results. */
type FormsBase<RecordT, SparseT> = Readonly<{
  central:      Fetched<RecordT, SparseT>
  staged:       Fetched<RecordT, SparseT> | null
  nextRevision: Revision
}>

/** The bag `reconcileStaged` reads, and all it reads: the act, and by act the record `makeStaged` made of an edit's `patch`, or the record storage delivered as `rcvd`. {@link stagedForms} checks what the base knows of one. */
export type StagedForms<RecordT, SparseT> =
  | (FormsBase<RecordT, SparseT> & Readonly<{ act: 'edit', patch: RecordT, rcvd?: undefined }>)
  | (FormsBase<RecordT, SparseT> & Readonly<{ act: 'del', patch?: undefined, rcvd?: undefined }>)
  | (FormsBase<RecordT, SparseT> & Readonly<{ act: ReceivedAct, patch?: undefined, rcvd: Fetched<RecordT, SparseT> }>)

/** What `settle` and `receive` hand back: `badnews`, the refusals to tell the host once. The copy to cache is the instance's `cacheable`. */
export type Settled = Z.infer<typeof settled>
// --

// == [The box's forms]: BoxFormat, boxRecord, boxSparse, BoxRecord, BoxSparse

/** The box format these forms describe, as each record carries it in `fmt`. */
export const BoxFormat = 5001

/** The checks of a box's forms, each refusing 'bad_record', from a record or from a box ducking as one: `boxRecord`, the full record, strict, as a stored record is; `boxSparse`, a plain copy of every field but the sidecar and the sealed parts, the rest stripped. The scope alone is `boxscope` in shapes/scopes.
 * The sealed parts are the whisper ciphered under the boxKey, and that boxKey wrapped under the
 * vaultKey, each the {@link FX.ciphered} bag AES-GCM hands back, its iv and its ciphertext, as
 * the kit's `whisper_ciphered` and `box_key_wrapped` check them. The sidecar is the host's JSON
 * object, stored in the clear beside them but bound by the seal, so it rides only on the full record.
 * The sparse form keeps `whisper_codec` and `whisper_schema_version`, which say how a whisper is
 * sealed, so a sparse record can be sealed over as it is.
 */
export const { boxRecord, boxSparse } = Checkers('bad_record', ({ obj, lit, applabel, user_id, vaultlabel, boxlabel, box_key_wrapped, whisper_ciphered }) => {
  const boxSparse = obj({
    applabel, user_id, vaultlabel, boxlabel,
    fmt: lit(BoxFormat),
    ...sparseBase.shape,
    /** How the whisper became the bytes ciphered: `json_v1`, its JSON with every object's keys sorted, as UTF-8. */
    whisper_codec:          lit('json_v1'),
    /** Which generation of the whisper's own shape this box holds: 1, the only one so far. */
    whisper_schema_version: lit(1),
  })
  const boxRecord = boxSparse.extend({
    sidecar,
    /** This box's boxKey, wrapped under the vaultKey. */
    box_key_wrapped,
    /** The whisper, ciphered under this box's boxKey. */
    whisper_ciphered,
  }).strict()
  return { boxRecord, boxSparse }
}, [FX])

export type BoxSparse = Z.infer<typeof boxSparse>
export type BoxRecord = Z.infer<typeof boxRecord>
// --

// == [The vault's forms]: VaultFormat, vaultRecord, vaultSparse, VaultRecord, VaultSparse

/** The vault format these forms describe, as each record carries it in `fmt`. */
export const VaultFormat = 6001

/** The checks of a vault's forms, each refusing 'bad_record', from a record or from a vault ducking as one: `vaultSparse`, a plain copy of the scope and the base's fields, the rest stripped; `vaultRecord`, the same fields, strict, as a stored record is. The scope alone is `vaultScope` in shapes/scopes.
 * Not yet: the gate and its `gate_epoch`, the payload that will make the full record more than
 * the sparse one. Until then every vault record is full.
 */
export const { vaultRecord, vaultSparse } = Checkers('bad_record', ({ obj, lit, applabel, user_id, vaultlabel }) => {
  const vaultSparse = obj({ applabel, user_id, vaultlabel, fmt: lit(VaultFormat), ...sparseBase.shape })
  const vaultRecord = vaultSparse.strict()
  return { vaultRecord, vaultSparse }
}, [FX])

export type VaultSparse = Z.infer<typeof vaultSparse>
export type VaultRecord = Z.infer<typeof vaultRecord>
// --

// == [Options]: ifPresentVals, ifPresent, horizonMillis, timelyOpts, sendOpts, storableOpts, IfPresent, TimelyOpts, SendOpts, EditOpts, StorableOpts

/** The policies when sending a record to a place that already holds one: `replace` it, `fail`, or `fetch` it and hand that back instead. */
export const ifPresentVals = ['replace', 'fail', 'fetch'] as const

/** The checks of the options a storable and its verbs take, each refusing 'bad_option', naming the failing field.
 * `ifPresent` is one of {@link ifPresentVals}. `horizonMillis` is a span of milliseconds, 0 or more,
 * or `Infinity` for never. `timelyOpts` says how fresh the record in hand (`maxMillisSinceRefresh`)
 * and the world (`maxWorldMillis`) must be before a verb goes on; `sendOpts` adds `ifPresent`;
 * `storableOpts` is what a storable is made with. Each takes its fields from the bag given and
 * strips the rest.
 */
export const { ifPresent, horizonMillis, timelyOpts, sendOpts, storableOpts } = Checkers('bad_option', ({ obj, num, union, lit, oneof }) => {
  const ifPresent     = oneof(ifPresentVals)
  const horizonMillis = union([num.nonnegative(), lit(Infinity)])
  const timelyOpts    = obj({ maxMillisSinceRefresh: horizonMillis.optional(), maxWorldMillis: horizonMillis.optional() })
  const sendOpts      = timelyOpts.extend({ ifPresent: ifPresent.optional() })
  const storableOpts  = obj({
    /** The refresh horizon: how long after its last refresh the record in hand stays timely. */
    maxMillisSinceRefresh: horizonMillis,
    /** The fraction of the horizon after which the trigger schedules the next refresh. */
    eagerFrac:             num.positive().max(1).optional(),
  })
  return { ifPresent, horizonMillis, timelyOpts, sendOpts, storableOpts }
})

/** How `send` treats a thing storage already holds, as {@link ifPresent} checks it: one of {@link ifPresentVals}. */
export type IfPresent = Z.infer<typeof ifPresent>

/** How fresh the record in hand and the world must be before a verb goes on. The world reads `maxWorldMillis`; the record, `maxMillisSinceRefresh`. */
export type TimelyOpts = Z.infer<typeof timelyOpts>

/** `send`'s options: its {@link TimelyOpts}, and `ifPresent`, how it treats a thing storage already holds. Not yet acted on. */
export type SendOpts = Z.infer<typeof sendOpts>

/** `edit`'s options: its {@link TimelyOpts}. */
export type EditOpts = TimelyOpts

/** The options a storable is made with, after its world, listing and records: its refresh horizon, and the trigger's `eagerFrac`. */
export type StorableOpts = Z.infer<typeof storableOpts>
// --

// == [The world and the listing]: lockStateVals, IsListing, isListing, lockState, world, listingOpts, LockState, World, ListingWorld, Store, Cache, ListingOpts

/** Whether the world a storable lives in is `unlocked` or `locked`: for a box, its vault's lock. */
export const lockStateVals = ['unlocked', 'locked'] as const

/** The tag a Listing answers true to, so a storable can tell one without importing it. */
export const IsListing: unique symbol = Symbol('safebyok.listing')

/** True for a Listing: an object that answers true to {@link IsListing}. */
export const isListing = (val: unknown): val is { [IsListing]: true } => (
  typeof val === 'object' && val !== null && (val as { [IsListing]?: unknown })[IsListing] === true
)

/** The check of whether the world a listing lives in is unlocked or locked: one of {@link lockStateVals}. Its `parse` refuses 'unexpected_error', as a world that answers otherwise is a bug. */
export const lockState = Checker(({ oneof }) => oneof(lockStateVals), 'unexpected_error')

/** The check of the world a listing lives in, the vault for boxes and the bank for vaults, as far as the base needs it: the one `clock`. Its `parse` takes the clock from whatever carries it, strips the rest, and refuses 'bad_option'. */
export const world = objCheck(() => ({ clock: HX.clockShape }), { refuseAs: 'bad_option', extras: 'strip' })

/** Whether the world a listing lives in is unlocked or locked, as {@link lockState} checks it: one of {@link lockStateVals}. */
export type LockState = Z.infer<typeof lockState>

/** The world a listing lives in: the vault for boxes, the bank for vaults. The one clock lives here. */
export type World = Z.infer<typeof world>

/** The world as a listing needs it beyond the clock: its lock, its own timeliness, and the taking of the world an answer carries. */
export type ListingWorld = World & {
  lockState(): LockState
  ensureTimely(opts: TimelyOpts): Promise<void>
  takeWorld(world: unknown): void
}

/** The vaultDB's verbs for one kind of thing, as a listing calls them: `expected` is the revision storage should hold, null for none. `watch` pushes a notice for every change; `fullFor` names the scopes to push full records for, every other notice sparse at most. */
export type Store<ScopeT, RecordT, SparseT> = {
  get(scope: ScopeT): Promise<Answer<ScopeT, RecordT, SparseT>>
  put(record: RecordT, expected: Revision | null): Promise<Answer<ScopeT, RecordT, SparseT>>
  del(scope: ScopeT, expected: Revision | null): Promise<Answer<ScopeT, RecordT, SparseT>>
  watch(onNotice: (notice: Notice<RecordT, SparseT>) => Promise<void>, fullFor: () => readonly ScopeT[]): () => void
}

/** The deviceDB's cache of one kind of thing, as a listing calls it: read once at `hello`, written after each delivery. */
export type Cache<RecordT, SparseT> = {
  load(): Promise<readonly Cacheable<RecordT, SparseT>[]>
  save(cacheable: Cacheable<RecordT, SparseT>): Promise<void>
}

/** What a listing is made with: its world, store and cache, the refresh horizon of each thing it makes, and where to tell bad news. */
export type ListingOpts<ScopeT, RecordT, SparseT> = {
  world:                 ListingWorld
  store:                 Store<ScopeT, RecordT, SparseT>
  cache:                 Cache<RecordT, SparseT>
  maxMillisSinceRefresh: number
  onBadNews?:            ((news: VaultError) => void) | undefined
}

/** The check of a listing's constructor arguments, as far as the base can tell: each of the world, store and cache answers to its verbs, and the horizon is {@link horizonMillis}. Its `parse` refuses 'bad_option'. Checks only. */
export const listingOpts = objCheck(({ obj, fn }) => ({
  world:                 obj({ clock: HX.clockShape, lockState: fn(), ensureTimely: fn(), takeWorld: fn() }),
  store:                 obj({ get: fn(), put: fn(), del: fn(), watch: fn() }),
  cache:                 obj({ load: fn(), save: fn() }),
  maxMillisSinceRefresh: horizonMillis,
  onBadNews:             fn().optional(),
}), 'bad_option')
// --

// == [Making a storable]: storableArgs

/** The check of a storable's constructor arguments, as far as the base can tell: the world carries a clock, the listing answers to {@link IsListing}, `central` passes {@link sparseBase}, `staged` does too or is null, and the options are {@link storableOpts}. The concrete class's validator judges the records further. Its `parse` refuses 'bad_option'. Checks only. */
export const storableArgs = objCheck(({ custom }) => ({
  world,
  listing: custom<object>(isListing, Phrases.ListingExpected),
  central: sparseBase,
  staged:  sparseBase.nullable(),
  opts:    storableOpts,
}), 'bad_option')
// --
