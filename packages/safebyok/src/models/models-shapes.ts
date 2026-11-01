/** The shapes the models share, imported as `MSX`: each section banner names the forms it holds.
 * A type generic over a model's record cannot come from its validator, so it stays a type, with
 * the validator beside it: each check judges what the base can know of a record, its revision,
 * its times, its `am` and its `vault_tok`, and leaves the concrete class's validator the rest.
 * A check of a bag reconciling passes refuses 'unexpected_error': a bag that fails one is a bug
 * in Storable, never a host's. Every other `parse` refuses as its doc says, quoting none of its input.
 */

import { deepFreeze, omit } from 'es-toolkit'
import type * as Z from 'zod'
import { Checker, Checkers, objCheck } from '../checks/validator'
import { type RefusalKind, type VaultError, isVaultError } from '../errors'
import { type Outcome } from '../outcome'
import * as Phrases from '../phrases'
import * as HX from '../shapes/host-code'
import type { CipherCtxRecord } from '../crypto'
import * as VX from '../shapes/vault'
import { ModelsLeaseFormat, isLeaseKey } from '../shapes/device'
import type { Clock } from '../shapes/bank-opts'
import type { StringStore } from '../string-store'
import type { BankScope, VaultScope } from '../shapes/scopes'
import { sidecar, whisper } from '../shapes/box'
import * as FX from '../shapes/fields'

// == [Checks]: Checks

/** The checks this module makes for itself, passed as `sources` to the validators below: `vaultError`, a VaultError as {@link isVaultError} tells one; and `absent`, a field that must be left out, which `unk` alone would not allow (it refuses a missing key). */
const Checks = Checkers('bad_record', ({ unk, custom }) => ({
  vaultError: custom<VaultError>(isVaultError, Phrases.VaultErrorExpected),
  absent:     unk.optional().refine((val) => val === undefined, Phrases.LeftOutExpected),
}))
// --

// == [Record forms]: amVals, tombstoneAmVals, am, revision, times, liveness, vaulted, sparseBase, tombstone, buildableRecord, buildableRecords, Am, Revision, Times, Liveness, Vaulted, SparseBase, Tombstone, Fetched, Dna, Cacheable, NeverStoredSeq, MinRefreshMillis, isTombstone

/** Whether a record is alive (`a`), damaged (`d`: it failed its check or its seal, and reads as gone) or gone (`x`: deleted). */
export const amVals = ['a', 'd', 'x'] as const

/** The `am` a tombstone carries: damaged or gone, never alive. */
export const tombstoneAmVals = ['d', 'x'] as const

/** The checks of what the base knows of any record, each refusing 'bad_record': `am`, one of {@link amVals}; `revision`, `times`, `liveness` and `vaulted`, a part each; and `sparseBase`, the four together, the least a sparse form carries beside its scope.
 * `tombstone` is a sparse base that is damaged or gone; `buildableRecord` is one with `central` and
 * `staged` beside it, a copy as a storable saves it to the device cache, uncached and ready for a
 * listing to build an instance with. Each takes its fields from whatever carries them, a record, a
 * storable or a snapshot, and strips the rest. `buildableRecords` checks that the cache's load is
 * an array, and leaves each copy in it to `buildableRecord`.
 *
 * @example sparseBase.parse(box)   // { revision_tok, revision_seq, registered_at, written_at, am, vault_tok }
 */
export const { am, revision, times, liveness, vaulted, sparseBase, tombstone, buildableRecord, buildableRecords } = Checkers('bad_record', ({ obj, arr, unk, int, oneof, revision_tok, vault_tok, epochMillis }) => {
  const am = oneof(amVals)
  const revision = obj({
    revision_tok,
    /** A counter the store moves at every put and del: of two revisions, the higher `revision_seq` is the newer. {@link NeverStoredSeq} marks a central never stored. */
    revision_seq: int,
  })
  const times = obj({
    /** When this life of the thing began: the `written_at` of its birth, a draft's or an edit's over a tombstone, kept by every later revision of that life. */
    registered_at: epochMillis,
    /** When the record in hand was written; on a tombstone, when it was deleted. */
    written_at:    epochMillis,
  })
  const liveness   = obj({ am })
  const vaulted    = obj({ vault_tok })
  const sparseBase = obj({ ...revision.shape, ...times.shape, ...liveness.shape, ...vaulted.shape })
  const tombstone  = sparseBase.extend({ am: oneof(tombstoneAmVals) })
  const buildableRecord  = sparseBase.extend({ central: sparseBase, staged: sparseBase.nullable() })
  const buildableRecords = arr(unk)
  return { am, revision, times, liveness, vaulted, sparseBase, tombstone, buildableRecord, buildableRecords }
}, [FX])

/** Whether a record is alive, damaged or gone, as {@link am} checks it: one of {@link amVals}. */
export type Am = Z.infer<typeof am>

/** A record's revision: its `revision_tok`, minted at each put and del, and its `revision_seq`, higher on the later one. */
export type Revision = Readonly<Z.infer<typeof revision>>

/** When this life of the thing began, and when the record in hand was written; on a tombstone, when it was deleted. */
export type Times = Readonly<Z.infer<typeof times>>

/** Whether a record is alive, damaged or gone: its `am`. */
export type Liveness = Readonly<Z.infer<typeof liveness>>

/** The `vault_tok` of the vault a record lies in, which every storable records and seals; a vault's is its own. */
export type Vaulted = Readonly<Z.infer<typeof vaulted>>

/** The least a sparse form carries: the scope, and what {@link sparseBase} checks, the revision, the times, whether it is alive and the vault it lies in. */
export type SparseBase<ScopeT> = ScopeT & Revision & Times & Liveness & Vaulted

/** The sparse form of a thing damaged or gone: every sparse prop stays on it, for the record; nothing the user put in the thing does. {@link tombstone} checks what the base knows of one.
 * A store makes no tombstone of a row that reads as neither the kind's record nor its tombstone:
 * it refuses it by name, 'damaged_box' or 'damaged_vault'. A row stored as a tombstone, `am` 'd'
 * or 'x', is delivered as stored. For a box, see {@link boxSparse}.
 */
export type Tombstone<SparseT> = SparseT & Readonly<{ am: typeof tombstoneAmVals[number] }>

/** The `val` a storage call delivers: the full record, its sparse form, or its tombstone. {@link sparseBase} checks what the base knows of any of the three. */
export type Fetched<RecordT, SparseT> = RecordT | SparseT | Tombstone<SparseT>

/** The DNA of a storable, what a caller hands `listing.build`: the scope, and any of the record's props, each missing or undefined where not given; those the factory controls are ignored. */
export type Dna<ScopeT, RecordT> = ScopeT & { [Prop in keyof RecordT]?: RecordT[Prop] | undefined }

/** The copy a storable saves to the device cache at each settle, and a listing revives it from: the sparse form, with `central` and `staged` beside it, `staged` null where nothing is staged. {@link buildableRecord} checks what the base knows of one. */
export type Cacheable<RecordT, SparseT> = SparseT & Readonly<{
  central: Fetched<RecordT, SparseT>
  staged:  Fetched<RecordT, SparseT> | null
}>

/** The `revision_seq` of a central never stored: a thing is born with a tombstone here as its central, so that any record received is newer, and nothing stored is what it expects. */
export const NeverStoredSeq = -1

/** The shortest horizon, in milliseconds, of a fetch made whatever the record's age: a call made within it of the last fetch that succeeded shares that fetch, so none forces a fetch at a horizon of 0. */
export const MinRefreshMillis = 50

/** True for a record whose `am` says damaged or gone. */
export const isTombstone = <SparseT extends Liveness>(fetched: SparseT): fetched is Tombstone<SparseT> => (fetched.am === 'd' || fetched.am === 'x')
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
 * Whatever an `Outcome` carries, an answer carries. A stored row that reads as neither the kind's
 * record nor its tombstone is refused by name, 'damaged_box' or 'damaged_vault', and never delivered.
 * {@link answer} checks what the base knows of one.
 */
export type Answer<ScopeT, RecordT, SparseT> = Outcome<Fetched<RecordT, SparseT> | null> & AnswerBase<ScopeT>

/** A notice from the watch: an answer nobody asked for, always naming a record, sparse at least. A row that does not read sends no notice: the watch rings its `onChange` instead. {@link notice} checks what the base knows of one. */
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

/** Return type of `reconcileCentral`: the central that results, and the policy that chose it. {@link reconciled} checks what the base knows of one. */
export type Reconciled<RecordT, SparseT> = Readonly<{ central: Fetched<RecordT, SparseT>, policy: CentralPolicy }>

/** The forms every row of `reconcileStaged` takes: `central` as held, `staged` as held or null where nothing is staged, and the revision after the central that results. */
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

/** Return type of `settle` and `receive`: `badnews`, the refusals to tell the host once. The copy for the device cache is saved by `settle` itself, not handed back in this return. */
export type Settled = Z.infer<typeof settled>
// --

// == [The box's forms]: BoxFormat, whisperHolder, WhisperHolder, boxRecord, boxSparse, boxDna, boxPatch, BoxRecord, BoxSparse, BoxDnaFilled, BoxPatchGiven

/** The box format these forms describe, as each record carries it in `fmt`. */
export const BoxFormat = 5001

/** The check of the object a box takes and gives its whisper in, `{ val }`, the whisper itself its `val`: what `edit`, `send`, `seal` and `build` take as `whisper`, and what `box.whisper` and `unsealWhisper` give. Its `parse` refuses 'bad_option', naming the failing field and quoting none of it.
 * The `val` is a whisper as the old box keeps one, checked by the same check: any JSON value a
 * whisper can carry, never a bare null. The object takes no other field. {@link LOCKED}, which a
 * locked box answers for its whisper, refuses with a sentence that names it. A parse hands back a
 * copy frozen through, `val` and all, never the caller's own object, so the host's later changes
 * to theirs reach no box, and a box's to its own reach no host: set `box.whisper` anew to change
 * it.
 *
 * Its kind is 'bad_option', not the old box's 'bad_whisper': a whisper reaches a box inside a
 * dna or a patch, each checked whole by one check of one kind, so the setter, which takes the
 * whisper alone, refuses as they do.
 *
 * @example whisperHolder.parse({ val: 'sk-ant-...' })                 // a frozen { val: 'sk-ant-...' }, a copy
 * @example whisperHolder.parse({ val: { apiKey: 'sk-ant-...', orgId: null } })
 * @example whisperHolder.parse('sk-ant-...')                          // throws 'bad_option': a whisper is given as { val }
 * @example whisperHolder.parse({ val: null })                         // throws 'bad_option', naming val: emptying a box is del's job
 * @example whisperHolder.parse({ val: 'sk-ant-...', note: 'work' })   // throws 'bad_option': it takes no other field
 * @example whisperHolder.parse(LOCKED)                                // throws 'bad_option': LOCKED is not a whisper
 */
export const whisperHolder = Checker(({ obj, custom }) => custom((val) => val !== LOCKED, Phrases.LockedIsNoWhisper)
  .pipe(obj({ val: whisper }).strict().overwrite((holder) => deepFreeze(holder)).readonly()), 'bad_option')

/** The object a box takes and gives its whisper in: `{ val }`, frozen, the whisper its `val`. */
export type WhisperHolder = Z.output<typeof whisperHolder>

/** The checks of a box's forms, each refusing 'bad_record', from a record or from a box ducking as one: `boxRecord`, the full record, strict, as a stored record is; `boxSparse`, a plain copy of every field but the sidecar and the sealed parts, the rest stripped. The scope alone is `boxscope` in shapes/scopes.
 * The sealed parts are the whisper ciphered under the boxKey, and that boxKey wrapped under the
 * vaultKey, each the {@link FX.ciphered} bag AES-GCM hands back, its iv and its ciphertext, as
 * the kit's `whisper_ciphered` and `box_key_wrapped` check them. The sidecar is the host's JSON
 * object, stored in the clear beside them but bound by the seal, so it rides only on the full record.
 * The sparse form keeps `whisper_codec` and `whisper_schema_version`, which say how a whisper is
 * sealed, so a sparse record can be sealed over as it is.
 */
export const { boxRecord, boxSparse } = Checkers('bad_record', ({ obj, lit, applabel, user_id, vaultlabel, boxlabel, box_tok, box_key_wrapped, whisper_ciphered }) => {
  const boxSparse = obj({
    applabel, user_id, vaultlabel, boxlabel,
    fmt: lit(BoxFormat),
    ...sparseBase.shape,
    /** The life of the box under its boxlabel: minted at its birth, a draft's or an edit's over a tombstone, and kept by every later revision. */
    box_tok,
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

/** The checks of what a caller hands to make or update a box, each a duckish refusing 'bad_option' and naming the failing field: `boxDna`, what `build` takes; `boxPatch`, what `edit`, `send` and `seal` take. A record is checked by `boxRecord` or `boxSparse`, never by these.
 * Both require `whisper`, the {@link WhisperHolder} sealed in, and `sidecar`, as every update of a
 * box names both. A whisper that fails {@link whisperHolder} refuses 'bad_option' here, as every
 * field does, naming `whisper` or `whisper.val`. The props the factory controls may be given, must
 * pass their checks, and are stripped. A field neither takes refuses, as a bag a person typed would.
 *
 * `boxDna` requires the scope too, and fills `whisper_codec` and `whisper_schema_version` with
 * their defaults where missing or undefined; the factory's props are `fmt`, `am`, `vault_tok`,
 * `box_tok`, `revision_tok` and the times. The sealed parts never come from a dna: `build` seals every box it
 * makes, so a dna carrying one refuses, as a field it does not take, and `revision_seq` among them:
 * input carrying one is a record, which `build` holds to the record check.
 *
 * `boxPatch` takes the round trip of a box's record, `{ ...record, whisper, sidecar }`: every prop
 * of the record but the sidecar is the factory's, the scope, `revision_seq`, the whisper's codec and
 * the sealed parts among them. It hands back the whisper and the sidecar, and the scope's fields as
 * given, each undefined where left out, for the box to hold to its own scope.
 *
 * @example boxDna.parse({ ...scope, whisper: { val: 'sk-ant-...' }, sidecar: {} })                                 // { ...scope, sidecar: {}, whisper_codec: 'json_v1', whisper_schema_version: 1, whisper: { val: 'sk-ant-...' } }
 * @example boxDna.parse({ ...scope, whisper: { val: 'sk-ant-...' }, sidecar: {}, am: 'x', vault_tok: 'tok-u1' })   // the scope, whisper, sidecar and defaults: am and vault_tok are the factory's
 * @example boxDna.parse({ ...scope, whisper: { val: 'sk-ant-...' } })                                              // throws 'bad_option', naming sidecar
 * @example boxDna.parse({ ...scope, revision_seq: 3 })                                                             // throws 'bad_option': a dna carries no revision_seq
 * @example boxDna.parse({ ...scope, whisper_ciphered: ciphered })                                                  // throws 'bad_option': the sealed parts are the seal's to make
 * @example boxPatch.parse({ ...record, whisper: { val: 'sk-ant-...' }, sidecar: {} })                              // { whisper: { val: 'sk-ant-...' }, sidecar: {}, ...scope }
 * @example boxPatch.parse({ whisper: LOCKED, sidecar: {} })                                                        // throws 'bad_option', naming whisper: LOCKED is not a whisper
 */
export const { boxDna, boxPatch } = Checkers('bad_option', ({ lit, applabel, user_id, vaultlabel, boxlabel }) => {
  const halves  = { whisper: whisperHolder, sidecar }
  const factory = boxSparse.pick({ fmt: true, am: true, vault_tok: true, box_tok: true, revision_tok: true, registered_at: true, written_at: true }).partial()
  const boxDna  = factory.extend({
    applabel, user_id, vaultlabel, boxlabel,
    ...halves,
    whisper_codec:          lit('json_v1').default('json_v1'),
    whisper_schema_version: lit(1).default(1),
  }).strict().transform((dna) => omit(dna, factory.keyof().options))
  const boxPatch = boxRecord.omit({ sidecar: true }).partial().extend(halves).strict()
    .transform(({ whisper, sidecar, applabel, user_id, vaultlabel, boxlabel }) => ({ whisper, sidecar, applabel, user_id, vaultlabel, boxlabel }))
  return { boxDna, boxPatch }
})

/** A box's dna as {@link boxDna} hands it back: the scope, the whisper and the sidecar, and the record's own props with their defaults filled. */
export type BoxDnaFilled = Z.output<typeof boxDna>

/** A box's patch as {@link boxPatch} hands it back: the whisper and the sidecar, and the scope's fields as given. */
export type BoxPatchGiven = Z.output<typeof boxPatch>
// --

// == [Options]: ifPresentVals, ifAbsentVals, ifPresent, ifAbsent, horizonMillis, timelyOpts, fetchOpts, sendOpts, storableOpts, watchable, listener, IfPresent, IfAbsent, TimelyOpts, FetchOpts, SendOpts, EditOpts, StorableOpts

/** The policies when sending a record to a place that already holds one: the one value, `replace`, the versioned replace (compare-and-swap) every put is, and the default. `fetch` is not implemented. */
export const ifPresentVals = ['replace'] as const

/** The policies when fetching a thing that is absent, never stored, deleted or damaged: `fail` with the absent refusal, or resolve `nil`. */
export const ifAbsentVals = ['fail', 'nil'] as const

/** The checks of the options a storable and its verbs take, each refusing 'bad_option', naming the failing field.
 * `ifPresent` is optional, and only ever {@link ifPresentVals}' `'replace'`, which names what every put already is and changes nothing; `ifAbsent` is one of {@link ifAbsentVals}. `horizonMillis`
 * is a span of milliseconds, 0 or more, or `Infinity` for never. `timelyOpts` says how fresh the
 * record in hand (`maxMillisSinceRefresh`) and the world (`maxWorldMillis`) must be before a verb
 * goes on; `fetchOpts` adds `ifAbsent`; `sendOpts` adds `ifPresent`; `storableOpts` is what a storable is made with. Each takes its fields from the bag given and
 * strips the rest. `watchable` is the flag `isWatchable` is set to, a boolean; `listener` is what
 * `subscribe` enrolls, a function.
 */
export const { ifPresent, ifAbsent, horizonMillis, timelyOpts, fetchOpts, sendOpts, storableOpts, watchable, listener } = Checkers('bad_option', ({ obj, num, union, lit, oneof, bool, fn }) => {
  const ifPresent     = oneof(ifPresentVals)
  const ifAbsent      = oneof(ifAbsentVals)
  const horizonMillis = union([num.nonnegative(), lit(Infinity)])
  const timelyOpts    = obj({ maxMillisSinceRefresh: horizonMillis.optional(), maxWorldMillis: horizonMillis.optional() })
  const fetchOpts     = timelyOpts.extend({ ifAbsent: ifAbsent.optional() })
  const sendOpts      = timelyOpts.extend({ ifPresent: ifPresent.optional() })
  const storableOpts  = obj({
    /** The refresh horizon: how long after its last refresh the record in hand stays timely. */
    maxMillisSinceRefresh: horizonMillis,
    /** The fraction of the horizon after which the trigger schedules the next refresh. */
    eagerFrac:             num.positive().max(1).optional(),
  })
  const watchable     = bool
  const listener      = fn<() => void>()
  return { ifPresent, ifAbsent, horizonMillis, timelyOpts, fetchOpts, sendOpts, storableOpts, watchable, listener }
})

/** How `send` meets what storage holds, as {@link ifPresent} checks it: `'replace'`, the default and only policy, is the versioned replace (compare-and-swap). Nothing hands it to storage. `'fetch'` is not implemented. */
export type IfPresent = Z.infer<typeof ifPresent>

/** How `fetch` treats a thing that is absent, as {@link ifAbsent} checks it: one of {@link ifAbsentVals}. */
export type IfAbsent = Z.infer<typeof ifAbsent>

/** How fresh the record in hand and the world must be before a verb goes on. The world heeds `maxWorldMillis`; the record, `maxMillisSinceRefresh`. */
export type TimelyOpts = Z.infer<typeof timelyOpts>

/** `fetch`'s options: its {@link TimelyOpts}, and `ifAbsent`, how it treats a thing that is absent: `fail` by default, with the listing's absent refusal; `nil` resolves null. */
export type FetchOpts = Z.infer<typeof fetchOpts>

/** `send`'s options: its {@link TimelyOpts}, and `ifPresent`, optional: `'replace'`, the default and only policy, the versioned replace. */
export type SendOpts = Z.infer<typeof sendOpts>

export type EditOpts = TimelyOpts

/** The options a storable is made with, after its world, listing and records: its refresh horizon, and the trigger's `eagerFrac`. */
export type StorableOpts = Z.infer<typeof storableOpts>
// --

// == [The world and the listing]: lockStateVals, LOCKED, LockedBag, IsListing, isListing, lockState, world, listingOpts, boxListingOpts, LockState, World, ListingWorld, Store, Cache, ListingOpts

/** Whether the world a storable lives in is `unlocked` or `locked`: for a box, its vault's lock. */
export const lockStateVals = ['unlocked', 'locked'] as const

/** The brand {@link LOCKED} is made with: a symbol of this module's, never `Symbol.for`, so no code outside the package spells it. A copy of LOCKED carries it too, so the brand tells LOCKED from a whisper, never from its copies. */
const LockedBrand: unique symbol = Symbol('safebyok.locked')

/** The bag a storable answers in place of what the locked vault hides: `box.whisper` answers it while the vault is locked. A frozen singleton, branded by a symbol of the package's own.
 * Tell it apart with `Storable.isLockedFUBag(val)`, which is true for this one object alone: never
 * by `===` against a bag you built, nor by its look, as a copy of it is no LOCKED. Setting
 * `box.whisper = LOCKED` forgets the exposed whisper, as null does.
 */
export const LOCKED: LockedBag = Object.freeze({ [LockedBrand]: true as const })

/** The type of {@link LOCKED}, which a copy of it has too: `Storable.isLockedFUBag` alone tells LOCKED itself. */
export type LockedBag = Readonly<{ [LockedBrand]: true }>

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

/** The vaultDB's verbs for one kind of thing, as a listing calls them. `priorRevisionTok` is the `revision_tok` of the record this device holds, null where it holds none; no prior `revision_seq` is sent.
 * Every `put` is the versioned replace (compare-and-swap), judged by storage in this order:
 * * `priorRevisionTok` null with a `revision_seq` other than 0, or a `priorRevisionTok` with a `revision_seq` below 1, refuses 'bad_record': no device of this package puts it.
 * * Over no row, `priorRevisionTok` null lands; a `priorRevisionTok` given refuses 'stale_write', carrying nothing.
 * * Over a row under another `revision_tok` than `priorRevisionTok` (any row, where `priorRevisionTok` is null; a tombstone is a row), it refuses 'stale_write', carrying that row.
 * * Over the row under `priorRevisionTok`, it lands only at that row's `revision_seq` + 1, which storage computes or queries itself; any other `revision_seq` refuses 'bad_record'.
 * A put that lands keeps the record exactly as given, never renumbered or patched, and answers what storage then holds.
 * `del` follows the same `priorRevisionTok` rule and answers the tombstone it lands, at the row's `revision_seq` + 1 under a fresh `revision_tok`; over no row, with `priorRevisionTok` null, it lands nothing and answers null.
 * A row that reads as neither the kind's record nor its tombstone is refused by name, 'damaged_box' or 'damaged_vault', by each verb that meets it, and nothing is stored over it.
 * `watch` pushes a notice for every change since it began; `fullFor` names the scopes to push full records for, every other notice sparse at most. Where it cannot say what changed (its backend failed, a row does not read, or one vanished) it rings `onChange`, so each thing fetches again and meets the refusal itself.
 */
export type Store<ScopeT, RecordT, SparseT> = {
  get(scope: ScopeT): Promise<Answer<ScopeT, RecordT, SparseT>>
  put(record: RecordT, priorRevisionTok: string | null): Promise<Answer<ScopeT, RecordT, SparseT>>
  del(scope: ScopeT, priorRevisionTok: string | null): Promise<Answer<ScopeT, RecordT, SparseT>>
  watch(onNotice: (notice: Notice<RecordT, SparseT>) => Promise<void>, fullFor: () => readonly ScopeT[], onChange: () => void): () => void
}

/** The deviceDB's cache of one kind of thing: loaded once, by the listing's `hello`; saved by each instance's settle, the listing handing it to each instance it makes.
 * `save` is best effort, never awaited by the settle that calls it: a refusal is told as bad news,
 * and nothing waits on it. An adapter keeps the order of its calls, so the last `save` of a thing
 * wins. A settle saves each time, so a host whose cache is slow may debounce `save` for each thing,
 * keyed by its scope (`_.debounce` per scope, or a join primitive), before handing the cache over:
 * one `save` serves every thing of the kind, so a single debounce over every call keeps only the
 * last thing's copy.
 */
export type Cache<RecordT, SparseT> = {
  load(): Promise<readonly Cacheable<RecordT, SparseT>[]>
  save(cacheable: Cacheable<RecordT, SparseT>): Promise<void>
}

/** The options a listing is made with: its world, store and cache, the refresh horizon of each thing it makes, and where to tell bad news. */
export type ListingOpts<ScopeT, RecordT, SparseT> = {
  world:                 ListingWorld
  store:                 Store<ScopeT, RecordT, SparseT>
  cache:                 Cache<RecordT, SparseT>
  maxMillisSinceRefresh: number
  /** Told bad news nobody asked about; its answer, a promise too, is heard out and never awaited. */
  onBadNews?:            ((news: VaultError) => unknown) | undefined
}

/** The check of a listing's constructor arguments, as far as the base can tell: each of the world, store and cache answers to its verbs, and the horizon is {@link horizonMillis}. Its `parse` refuses 'bad_option'. Checks only. */
export const listingOpts = objCheck(({ obj, fn }) => ({
  world:                 obj({ clock: HX.clockShape, lockState: fn(), ensureTimely: fn(), takeWorld: fn() }),
  store:                 obj({ get: fn(), put: fn(), del: fn(), watch: fn() }),
  cache:                 obj({ load: fn(), save: fn() }),
  maxMillisSinceRefresh: horizonMillis,
  onBadNews:             fn().optional(),
}), 'bad_option')

/** The check of a box listing's options, beyond what {@link listingOpts} checks: its world names the vault's scope and its `vault_tok`, and answers `demandLease`. Its `parse` refuses 'bad_option'. Checks only. */
export const boxListingOpts = objCheck(({ obj, fn, applabel, user_id, vaultlabel, vault_tok }) => ({
  world: obj({ scope: obj({ applabel, user_id, vaultlabel }), vault_tok, demandLease: fn() }),
}), { refuseAs: 'bad_option', extras: 'strip' }, [FX])
// --

// == [Store fronts]: storeFrontOpts, localStoreFrontOpts, storeWatchArgs, priorRevisionTok, storeRows, foundRows, StoreFrontOpts, LocalStoreFrontOpts, FoundRow

/** The check of a `StoreFront`'s options: a `clock`, which stamps each tombstone it lands, `wallClock` where left out. Its `parse` refuses 'bad_option'. */
export const storeFrontOpts = objCheck(() => ({ clock: HX.clockShape.optional() }), 'bad_option')

/** The check of `localStoreFront`'s options: a `store` carrying a StringStore's five calls, and the `clock` {@link storeFrontOpts} takes. Its `parse` refuses 'bad_option'. Only checked: `opts` goes on as it came. */
export const localStoreFrontOpts = objCheck(({ obj, fn }) => {
  const call = fn()
  return {
    store: obj({ get: call, put: call, del: call, scopepaths: call, subscribe: call }, Phrases.StringStoreShape),
    clock: HX.clockShape.optional(),
  }
}, 'bad_option')

/** The check of what a store's `watch` is handed: its `onNotice`, `fullFor` and `onChange`, each a function. Its `parse` refuses 'bad_option'. */
export const storeWatchArgs = objCheck(({ fn }) => ({ onNotice: fn(), fullFor: fn(), onChange: fn() }), 'bad_option')

/** The check of a `put` or `del`'s `priorRevisionTok`: a `revision_tok`, or null for no record held. Its `parse` refuses 'bad_record'. */
export const priorRevisionTok = Checker(({ revision_tok }) => revision_tok.nullable(), 'bad_record', [FX])

/** The checks of what a store front's hooks answer, each refusing 'corrupt_record', a bug in the adapter: `storeRows`, `doGetRows`' list of rows, and `foundRows`, `doFindRows`' list of `{ scopepath, row }`. Checks only: each row is judged as the kind's. */
export const { storeRows, foundRows } = Checkers('corrupt_record', ({ arr, obj, str, unk }) => ({
  storeRows: arr(unk),
  foundRows: arr(obj({ scopepath: str, row: unk })),
}))

/** The options of a `StoreFront`, as {@link storeFrontOpts} checks them. */
export type StoreFrontOpts = { clock?: Clock | undefined }

/** The options of `localStoreFront`, as {@link localStoreFrontOpts} checks them: where the rows live (`domStore(localStorage, prefix)`, `memoryStore()`, or a StringStore of your own), and the clock. */
export type LocalStoreFrontOpts = StoreFrontOpts & { store: StringStore }

/** A row `doFindRows` found: its `scopepath`, and the `row` as stored, unjudged. */
export type FoundRow = Z.infer<typeof foundRows>[number]
// --

// == [Making a storable]: storableArgs

/** The check of a storable's constructor arguments, as far as the base can tell: the world carries a clock, the listing answers to {@link IsListing}, the cache answers to `load` and `save`, `central` passes {@link sparseBase}, `staged` does too or is null, and the options are {@link storableOpts}. The concrete class's validator judges the records further. Its `parse` refuses 'bad_option'. Checks only. */
export const storableArgs = objCheck(({ custom, obj, fn }) => ({
  world,
  listing: custom<object>(isListing, Phrases.ListingExpected),
  cache:   obj({ load: fn(), save: fn() }),
  central: sparseBase,
  staged:  sparseBase.nullable(),
  opts:    storableOpts,
}), 'bad_option')
// --

// == [The vault's stamp]: vaultStamp, VaultStamp

/** The fields of a vault fixed for its life, which every ctx under it binds: the scope, `vault_tok` and `registered_at`. Its `parse` takes them from whatever carries them, a Vault included, strips the rest, and refuses 'bad_option'. */
export const vaultStamp = objCheck(({ applabel, user_id, vaultlabel, vault_tok, epochMillis }) => ({
  applabel,
  user_id,
  vaultlabel,
  vault_tok,
  registered_at: epochMillis,
}), { refuseAs: 'bad_option', extras: 'strip' }, [FX])

export type VaultStamp = Z.infer<typeof vaultStamp>
// --

// == [The wayin's forms]: passphraseWayinHeader, passkeyWayinHeader, wayinHeader, passphraseWayinRecord, passkeyWayinRecord, wayinRecord, PassphraseWayinHeader, PasskeyWayinHeader, WayinHeader, PassphraseWayinRecord, PasskeyWayinRecord, WayinRecord, WayinKind

export const { passphraseWayinHeader, passkeyWayinHeader, wayinHeader, passphraseWayinRecord, passkeyWayinRecord, wayinRecord } = Checkers('bad_record', ({ obj, lit, discrim, epochMillis, key_deriver_label, salt_b64, credential_id, prfSalt, device_id, vault_key_wayin_wrapped }) => {
  const passphraseWayinHeader = obj({ wayinkind: lit('passphrase'), key_deriver_label, salt_b64, device_id, registered_at: epochMillis })
  const passkeyWayinHeader    = obj({ wayinkind: lit('passkey'), credential_id, prf_salt_b64: prfSalt, device_id, registered_at: epochMillis })
  const passphraseWayinRecord = passphraseWayinHeader.extend({ vault_key_wayin_wrapped }).strict()
  const passkeyWayinRecord    = passkeyWayinHeader.extend({ vault_key_wayin_wrapped }).strict()
  return {
    passphraseWayinHeader,
    passkeyWayinHeader,
    wayinHeader: discrim('wayinkind', [passphraseWayinHeader, passkeyWayinHeader]),
    passphraseWayinRecord,
    passkeyWayinRecord,
    wayinRecord: discrim('wayinkind', [passphraseWayinRecord, passkeyWayinRecord]),
  }
}, [FX])

export type PassphraseWayinHeader = Z.infer<typeof passphraseWayinHeader>
export type PasskeyWayinHeader    = Z.infer<typeof passkeyWayinHeader>
export type WayinHeader           = Z.infer<typeof wayinHeader>
export type PassphraseWayinRecord = Z.infer<typeof passphraseWayinRecord>
export type PasskeyWayinRecord    = Z.infer<typeof passkeyWayinRecord>
export type WayinRecord           = Z.infer<typeof wayinRecord>
export type WayinKind             = WayinRecord['wayinkind']
// --

// == [The gate's forms]: gateProps, GateProps

export const gateProps = objCheck(() => ({
  passphrase_wayin: passphraseWayinRecord,
  passkey_wayin:    passkeyWayinRecord.nullable(),
}), 'bad_record')

export type GateProps = Z.infer<typeof gateProps>
// --

// == [The vault's forms]: VaultFormat, vaultRecord, vaultSparse, vaultPatch, VaultRecord, VaultSparse, VaultTrouble

/** The vault format these forms describe, as each record carries it in `fmt`. */
export const VaultFormat = 6001

/** The checks of a vault's forms, each refusing 'bad_record', from a record or from a vault ducking as one: `vaultSparse`, a plain copy of the scope and the base's fields, the rest stripped; `vaultRecord`, those fields and the `gate`, its wayins as {@link gateProps} checks them, strict, as a stored record is. A vault record is never without its gate. The scope alone is `vaultScope` in shapes/scopes. */
export const { vaultRecord, vaultSparse } = Checkers('bad_record', ({ obj, lit, applabel, user_id, vaultlabel }) => {
  const vaultSparse = obj({ applabel, user_id, vaultlabel, fmt: lit(VaultFormat), ...sparseBase.shape })
  const vaultRecord = vaultSparse.extend({ gate: gateProps }).strict()
  return { vaultRecord, vaultSparse }
}, [FX])

/** The check of a vault's patch, refusing 'bad_option', naming the field: `{}`, or any prop of the vault's record, each checked, so `{ ...record }` will do; a field no vault record has refuses. The vault ignores every prop, its `gate` included: a patch only moves the revision. Its output is the props given, for the vault to hold its scope fields to its own.
 * @example vaultPatch.parse({})                          // {}
 * @example vaultPatch.parse({ ...record })               // the record's props, as given
 */
export const vaultPatch = Checker(() => vaultRecord.partial().strict(), 'bad_option')

export type VaultSparse = Z.infer<typeof vaultSparse>
export type VaultRecord = Z.infer<typeof vaultRecord>

/** What is wrong with a vault, as its snapshot shows it: the refusal kind that names it, and a sentence for the user. */
export type VaultTrouble = Readonly<{ refusalkind: RefusalKind, message: string }>
// --

// == [What a proving is handed]: cleartexts, attemptCleartexts, passphraseCleartexts, passphraseReplaceCleartexts, passkeyAddCleartexts, provingWorld, gateWorld, provingPairArgs, provingMakeArgs, passphraseMakeArgs, provingAttemptArgs, vaultBuildArgs, vaultUnlockArgs, passphraseReplaceArgs, passkeyAddArgs, passkeyRevokeArgs, Cleartexts, AttemptCleartexts, PassphraseCleartexts, PassphraseReplaceCleartexts, PasskeyAddCleartexts, ProvingWorld, GateWorld

/** The cleartexts the user hands in: `cleartexts` at a vault's birth, a passphrase and perhaps a new passkey's answer; `attemptCleartexts` at an unlock, a passphrase or a passkey's answer; the rest for a change to the gate, each proved by the passphrase. */
export const { cleartexts, attemptCleartexts, passphraseCleartexts, passphraseReplaceCleartexts, passkeyAddCleartexts, provingWorld, gateWorld } = Checkers('bad_option', ({ obj, passphraseCleartext, passkeyAnswer, freshPasskeyAnswer, clockShape, keyDeriverShape, device_id, strengthChecker }) => {
  const provingWorld = obj({ clock: clockShape, keyDeriver: keyDeriverShape, device_id })
  return {
    cleartexts:                  obj({ passphrase: passphraseCleartext, passkeyAnswer: freshPasskeyAnswer.nullable().optional() }).strict(),
    attemptCleartexts:           obj({ passphrase: passphraseCleartext.optional(), passkeyAnswer: passkeyAnswer.nullable().optional() }).strict()
      .refine(({ passphrase, passkeyAnswer: answer = null }) => passphrase !== undefined || answer !== null, Phrases.ProofMissing),
    passphraseCleartexts:        obj({ passphrase: passphraseCleartext }).strict(),
    passphraseReplaceCleartexts: obj({ passphrase: passphraseCleartext, nextPassphrase: passphraseCleartext }).strict(),
    passkeyAddCleartexts:        obj({ passphrase: passphraseCleartext, passkeyAnswer: freshPasskeyAnswer }).strict(),
    provingWorld,
    gateWorld:                   obj({ ...provingWorld.shape, strengthChecker }),
  }
}, [FX, HX, VX])

export type Cleartexts                  = Z.input<typeof cleartexts>
export type AttemptCleartexts           = Z.input<typeof attemptCleartexts>
export type PassphraseCleartexts        = Z.input<typeof passphraseCleartexts>
export type PassphraseReplaceCleartexts = Z.input<typeof passphraseReplaceCleartexts>
export type PasskeyAddCleartexts        = Z.input<typeof passkeyAddCleartexts>
export type ProvingWorld                = Z.infer<typeof provingWorld>
/** A {@link ProvingWorld} with the host's `strengthChecker`, which hears each new passphrase before a wayin is made for it. */
export type GateWorld                   = Z.infer<typeof gateWorld>

/** The arguments of the proving makers, of `VaultListing.build` of a dna, and of the vault's gated verbs: a `stamp` is whatever carries a {@link vaultStamp}, a record or a vault, stripped to one. A gated verb's cleartexts are optional: without them, it asks the user. */
export const { provingPairArgs, provingMakeArgs, passphraseMakeArgs, provingAttemptArgs, vaultBuildArgs, vaultUnlockArgs, passphraseReplaceArgs, passkeyAddArgs, passkeyRevokeArgs } = Checkers('bad_option', ({ obj, passphraseCleartext }) => ({
  provingPairArgs:       obj({ stamp: vaultStamp, cleartexts, world: provingWorld }),
  provingMakeArgs:       obj({ stamp: vaultStamp, world: provingWorld }),
  passphraseMakeArgs:    obj({ stamp: vaultStamp, world: provingWorld, passphrase: passphraseCleartext }),
  provingAttemptArgs:    obj({ stamp: vaultStamp, gate: gateProps, cleartexts: attemptCleartexts, world: provingWorld }),
  vaultBuildArgs:        obj({ cleartexts }),
  vaultUnlockArgs:       obj({ cleartexts: attemptCleartexts.optional() }),
  passphraseReplaceArgs: obj({ cleartexts: passphraseReplaceCleartexts.optional() }),
  passkeyAddArgs:        obj({ cleartexts: passkeyAddCleartexts.optional() }),
  passkeyRevokeArgs:     obj({ cleartexts: passphraseCleartexts.optional() }),
}), [VX])
// --

// == [The lease's forms]: LeaseFormat, leaseStamp, leaseRecord, sealedWhisper, leaseDBFriend, leaseGrantOpts, ctxStamp, serializedBytes, leaseGetArgs, leaseGrantArgs, leaseSealArgs, leaseUnsealArgs, LeaseStamp, LeaseSparse, LeaseRecord, SealedWhisper, LeaseVault, LeaseDBFriend, LeaseGrantOpts

export const LeaseFormat = ModelsLeaseFormat

export const { leaseStamp, leaseRecord } = Checkers('bad_record', ({ obj, lit, custom, epochMillis, vault_key_lease_wrapped }) => {
  const leaseStamp  = obj({ fmt: lit(LeaseFormat), ...vaultStamp.shape, autolock_at: epochMillis })
  const leaseRecord = leaseStamp.extend({
    lease_key:               custom<CryptoKey>(isLeaseKey, Phrases.LeaseKeyExpected),
    vault_key_lease_wrapped: vault_key_lease_wrapped.readonly(),
  }).strict().readonly()
  return { leaseStamp, leaseRecord }
}, [FX])

export type LeaseStamp  = Z.infer<typeof leaseStamp>
export type LeaseSparse = LeaseStamp
export type LeaseRecord = Z.infer<typeof leaseRecord>

export const sealedWhisper = objCheck(({ box_key_wrapped, whisper_ciphered }) => ({ box_key_wrapped, whisper_ciphered }), { refuseAs: 'bad_record', extras: 'strip' }, [FX])

export type SealedWhisper = Z.infer<typeof sealedWhisper>

/** What a lease needs of its vault: the stamp, the clock, and `lock()`, called when the lease proves damaged or its autolock fires. The lease erases nothing itself then: `lock()` erases the lease the device keeps, by scope, whether or not the vault holds one. */
export type LeaseVault = VaultStamp & { clock: Clock, lock(): unknown }

/** The deviceDB as a lease reaches it, bound to the vault's scope by the vault that makes the friend, so no verb takes a scope. */
export const leaseDBFriend = objCheck(({ fn }) => ({
  logger:      HX.loggerShape,
  tryGetLease: fn<() => Promise<Outcome<unknown>>>(),
  tryPutLease: fn<(record: LeaseRecord) => Promise<Outcome<unknown>>>(),
  tryDelLease: fn<() => Promise<Outcome<void>>>(),
}), { refuseAs: 'bad_option', extras: 'strip' })

export type LeaseDBFriend = Z.infer<typeof leaseDBFriend>

export const leaseGrantOpts = objCheck(({ int, lit, union }) => ({
  leaseMillis: union([int.positive(), lit(Infinity)]),
}), 'bad_option')

export type LeaseGrantOpts = Z.infer<typeof leaseGrantOpts>

/** True for a stamp a caller hands the lease as additional data: a flat object of strings and finite numbers, at least one. */
const isCtxStamp = (val: unknown): boolean => (
  typeof val === 'object' && val !== null && ! Array.isArray(val) && Object.keys(val).length > 0
    && Object.values(val).every((field) => typeof field === 'string' || Number.isFinite(field))
)

/** The arguments of each lease verb. A stamp is the caller's own fields fixed for its record's life, flat; the lease binds each under the vault's stamp and its own purpose (`box_key_wrapped`, `whisper_ciphered`), so the purposes never leave it. */
export const { ctxStamp, serializedBytes, leaseGetArgs, leaseGrantArgs, leaseSealArgs, leaseUnsealArgs } = Checkers('bad_option', ({ obj, fn, custom, bytes }) => {
  const vault     = obj({ ...vaultStamp.shape, clock: HX.clockShape, lock: fn<() => unknown>() })
  const cryptoKey = custom<CryptoKey>((val) => val instanceof CryptoKey, 'Expected a CryptoKey')
  const ctxStamp  = custom<CipherCtxRecord>(isCtxStamp, Phrases.CtxStampExpected)
  return {
    ctxStamp,
    serializedBytes: bytes(),
    leaseGetArgs:    obj({ vault, dbfriend: leaseDBFriend }),
    leaseGrantArgs:  obj({ vault, dbfriend: leaseDBFriend, vaultKey: cryptoKey.refine((val) => val.extractable, 'Expected an extractable CryptoKey'), opts: leaseGrantOpts }),
    leaseSealArgs:   obj({ boxKeyStamp: ctxStamp, whisperStamp: ctxStamp }),
    leaseUnsealArgs: obj({ sealed: sealedWhisper, boxKeyStamp: ctxStamp, whisperStamp: ctxStamp }),
  }
}, [FX])
// --

// == [The vault's world]: leaseDeviceDB, boxVaultDB, vaultListingOpts, boxBag, LeaseDeviceDB, BoxBag

/** The deviceDB's lease verbs, as the vault's world carries them: each by the vault's scope, which `vault.leaseDBFriend()` binds, so no verb of the dbfriend takes one. */
export const leaseDeviceDB = objCheck(({ fn }) => ({
  tryGetLease: fn<(scope: VaultScope) => Promise<Outcome<unknown>>>(),
  tryPutLease: fn<(record: LeaseRecord) => Promise<Outcome<unknown>>>(),
  tryDelLease: fn<(scope: VaultScope) => Promise<Outcome<void>>>(),
}), { refuseAs: 'bad_option', extras: 'strip' })

export type LeaseDeviceDB = Z.infer<typeof leaseDeviceDB>

/** The check of the vaultDB as a vault's boxes reach it: `boxStore`, which hands the store of one vault's boxes, as a `StoreFront`'s does. Its `parse` refuses 'bad_option'. Checks only. */
export const boxVaultDB = objCheck(({ fn }) => ({
  boxStore: fn(),
}), { refuseAs: 'bad_option', extras: 'strip' })

/** The check of a vault listing's options past what {@link listingOpts} checks: that its world carries what a vault's gate, lease, gatings and box listing need. Its `parse` refuses 'bad_option'. Checks only. */
export const vaultListingOpts = objCheck(({ obj, fn }) => ({
  world: obj({
    ...gateWorld.shape, requestCleartext: fn(), logger: HX.loggerShape,
    leaseMillis: leaseGrantOpts.shape.leaseMillis.optional(), pesterMillis: leaseGrantOpts.shape.leaseMillis.optional(),
    deviceDB: leaseDeviceDB, vaultDB: boxVaultDB, boxRefreshMillis: horizonMillis,
  }),
}), { refuseAs: 'bad_option', extras: 'strip' })

/** The check of the bag naming one of a vault's boxes, as the vault's box verbs are handed it: its `boxlabel`, and the vault's own scope fields if you like, each checked. It takes a box, its snapshot or a dna, and leaves the rest. Its `parse` refuses 'bad_scope'. */
export const boxBag = Checker(({ obj, applabel, user_id, vaultlabel, boxlabel }) => obj({
  applabel: applabel.optional(), user_id: user_id.optional(), vaultlabel: vaultlabel.optional(), boxlabel,
}), 'bad_scope')

/** The bag naming one of a vault's boxes, as {@link boxBag} checks it.
 *
 * @example vault.getBox({ boxlabel: 'anthropic' })
 */
export type BoxBag = Z.input<typeof boxBag>
// --

// == [Refusal kinds]: modelsRefusalKindVals, ModelsRefusalKind

/** Every refusalkind the models throw, the gatings' and the vault verbs' alike, each meaning what errors.ts's `refusalKindVals` says: the list a host's messages map on.
 * The list grows as the models do.
 */
export const modelsRefusalKindVals = [
  // Misuse: the host developer's to fix.
  'bad_option', 'bad_scope', 'bad_record', 'corrupt_record', 'unknown_key_deriver', 'insecure_context', 'unexpected_error',
  // Correctable: an attempt refused so leaves its gating open (correctableKindVals).
  'wrong_passphrase', 'wrong_passkey', 'weak_passphrase', 'same_passphrase',
  // A gating ended, unlocking and changing nothing.
  'declined', 'gating_landed', 'gate_made_elsewhere', 'gate_moved', 'absent_wayin',
  // The vault and its boxes.
  'vault_locked', 'absent_vault', 'absent_box', 'vault_gone', 'vault_remade',
  // Storage's word, passed through.
  'stale_write', 'record_conflict', 'not_permitted', 'storage_unavailable', 'storage_blocked', 'vault_full', 'box_too_large',
  // Bad news.
  'damaged_vault', 'damaged_wayin', 'damaged_box', 'damaged_lease', 'vault_behind', 'identity_revoked',
] as const satisfies readonly RefusalKind[]

export type ModelsRefusalKind = typeof modelsRefusalKindVals[number]
// --

// == [The gating's forms]: gatingKindVals, correctableKindVals, isCorrectable, gatingkind, cleartextsForGatingkind, ProvedByForGatingkind, gatingWorld, GatingKind, CleartextsForGatingkind, PasskeyGatingKind, StrengthChecker

export const gatingKindVals = ['build_vault', 'unlock_vault', 'replace_passphrase', 'add_passkey', 'revoke_passkey'] as const

/** The refusals of an attempt that leave its gating open, for the user to try again. */
export const correctableKindVals = ['wrong_passphrase', 'wrong_passkey', 'weak_passphrase', 'same_passphrase'] as const satisfies readonly ModelsRefusalKind[]

/** True for a refusal of a kind in {@link correctableKindVals}: one that leaves a gating open, and a passkey's answer unspent (G2). */
export const isCorrectable = (err: unknown): boolean => isVaultError(err) && (correctableKindVals as readonly string[]).includes(err.refusalkind)

export const gatingkind = Checker(({ oneof }) => oneof(gatingKindVals), 'bad_option')

/** The cleartexts an attempt on each kind of gating hands in. */
export const cleartextsForGatingkind = Object.freeze({
  build_vault:        cleartexts,
  unlock_vault:       attemptCleartexts,
  replace_passphrase: passphraseReplaceCleartexts,
  add_passkey:        passkeyAddCleartexts,
  revoke_passkey:     passphraseCleartexts,
} as const)

/** The wayins whose proof each kind of gating takes: none for a vault not yet built, either to unlock, and the passphrase alone to change the gate. */
export const ProvedByForGatingkind = Object.freeze({
  build_vault:        Object.freeze([] as const),
  unlock_vault:       Object.freeze(['passphrase', 'passkey'] as const),
  replace_passphrase: Object.freeze(['passphrase'] as const),
  add_passkey:        Object.freeze(['passphrase'] as const),
  revoke_passkey:     Object.freeze(['passphrase'] as const),
} as const satisfies Readonly<Record<GatingKind, readonly WayinKind[]>>)

export const gatingWorld = objCheck(({ fn }) => ({
  requestCleartext: fn(),
  strengthChecker:  VX.strengthChecker,
  logger:           HX.loggerShape,
}), { refuseAs: 'bad_option', extras: 'strip' })

export type GatingKind = typeof gatingKindVals[number]

export type CleartextsForGatingkind = { [KindT in GatingKind]: Z.input<typeof cleartextsForGatingkind[KindT]> }

/** The kinds of gating a passkey's answer may prove, as {@link ProvedByForGatingkind} says: the kinds `attemptPasskey` is called on. */
export type PasskeyGatingKind = { [KindT in GatingKind]: 'passkey' extends typeof ProvedByForGatingkind[KindT][number] ? KindT : never }[GatingKind]

/** A function from a new passphrase and the vault's scope to a verdict, `{ strong: true }` or `{ strong: false, reason }`, where `reason` is the sentence the user sees.
 * It may be async, and may carry a `load()` that `bank.hello()` awaits. It hears the passphrase:
 * log nothing it is given. What it throws is replaced, so a bug in it cannot leak a passphrase.
 *
 * @example const strengthChecker: StrengthChecker = (passphrase) => (passphrase.length >= 16 ? { strong: true } : { strong: false, reason: 'Use at least 16 characters.' })
 */
export type StrengthChecker = Z.infer<typeof VX.strengthChecker>
// --

// == [The device's forms]: DeviceRecordFormat, gateEpochSeen, deviceRecord, vaultCacheable, GateEpochSeen, DeviceRecord, VaultCacheable

/** The device record format these forms describe, as each record carries it in `fmt`. */
export const DeviceRecordFormat = 8001

/** True where no two entries name the same vault. */
const hasEachVaultOnce = (seen: readonly { vaultlabel: string }[]): boolean => new Set(seen.map(({ vaultlabel }) => vaultlabel)).size === seen.length

/** The checks of what a device keeps of a bank's scope, each refusing 'bad_record': `deviceRecord`, this device's `device_id` for the scope and the highest `gate_epoch` it has seen of each vault, strict and frozen; `gateEpochSeen`, one vault's entry. A vault appears at most once.
 *
 * @example deviceRecord.parse({ fmt: 8001, applabel: 'acme', user_id: 'u1', device_id: 'Zm9vYmFy', highest_gate_epochs: [{ vaultlabel: 'main', gate_epoch: 3 }] })
 */
export const { gateEpochSeen, deviceRecord } = Checkers('bad_record', ({ obj, arr, lit, uint, applabel, user_id, vaultlabel, device_id }) => {
  const gateEpochSeen = obj({ vaultlabel, gate_epoch: uint }).strict().readonly()
  const deviceRecord  = obj({
    fmt:                 lit(DeviceRecordFormat),
    applabel,
    user_id,
    device_id,
    highest_gate_epochs: arr(gateEpochSeen).refine(hasEachVaultOnce, Phrases.VaultlabelRepeated).readonly(),
  }).strict().readonly()
  return { gateEpochSeen, deviceRecord }
}, [FX])

/** The check of a vault's copy as the deviceDB files it, refusing 'bad_record': the scope it is filed under, with `central` and `staged` beside it. The rest is the listing's to judge, as {@link buildableRecord} does at its hello. */
export const vaultCacheable = Checker(({ obj, unk, applabel, user_id, vaultlabel }) => obj({ applabel, user_id, vaultlabel, central: unk, staged: unk }).loose(), 'bad_record')

export type GateEpochSeen  = Z.infer<typeof gateEpochSeen>
export type DeviceRecord   = Z.infer<typeof deviceRecord>
export type VaultCacheable = Cacheable<VaultRecord, VaultSparse>
// --

// == [The bank's forms]: positiveMinutes, refreshMinutes, bankDeviceDB, bankVaultDB, bankOpts, cheatClock, BankDeviceDB

export const { positiveMinutes, refreshMinutes } = Checkers('bad_option', ({ num, union, lit }) => ({
  positiveMinutes: union([num.positive(), lit(Infinity)], Phrases.PositiveMinutesShape),
  refreshMinutes:  union([num.nonnegative(), lit(Infinity)], Phrases.MinutesShape),
}))

/** The check of the bank's deviceDB: the lease verbs a vault's world carries, as {@link leaseDeviceDB} checks them; `vaultCache`, which hands the device cache of a bank's vaults; `advanceDeviceRecord`, which keeps the device record; and `clearCachedVault`, which drops what the device keeps of one vault. Its `parse` refuses 'bad_option'. Checks only. */
export const bankDeviceDB = objCheck(({ fn }) => ({
  ...leaseDeviceDB.shape,
  vaultCache:          fn<(scope: BankScope) => Cache<VaultRecord, VaultSparse>>(),
  advanceDeviceRecord: fn<(record: DeviceRecord) => Promise<DeviceRecord>>(),
  clearCachedVault:    fn<(scope: VaultScope) => Promise<void>>(),
}), { refuseAs: 'bad_option', extras: 'strip' })

/** The deviceDB a bank is made with, as {@link bankDeviceDB} checks it. */
export type BankDeviceDB = Z.infer<typeof bankDeviceDB>

/** The check of the bank's vaultDB: `vaultStore`, which hands the store of a bank's vaults, and the `boxStore` {@link boxVaultDB} checks; a `StoreFront` answers both. Its `parse` refuses 'bad_option'. Checks only. */
export const bankVaultDB = objCheck(({ fn }) => ({
  ...boxVaultDB.shape,
  vaultStore: fn(),
}), { refuseAs: 'bad_option', extras: 'strip' })

export const bankOpts = objCheck(({ fn, unk, device_id }) => ({
  // Judged by `bankScope` after, so a bad name refuses 'bad_scope', as `bank.vaultOf` refuses a bad vaultlabel.
  applabel:            unk,
  user_id:             unk,
  device_id:           device_id.optional(),
  vaultDB:             bankVaultDB,
  deviceDB:            bankDeviceDB,
  keyDeriver:          HX.keyDeriverShape,
  requestCleartext:    fn(),
  strengthChecker:     VX.strengthChecker.optional(),
  logger:              HX.loggerShape.optional(),
  autolockMinutes:     positiveMinutes.optional(),
  pesterMinutes:       positiveMinutes.optional(),
  vaultRefreshMinutes: refreshMinutes.optional(),
  boxRefreshMinutes:   refreshMinutes.optional(),
  onBadNews:           fn().optional(),
}), { refuseAs: 'bad_option' }, [FX])

/** The check of a test's `_cheat_clock`, the clock a bank is made with in place of the wall clock. Its `parse` refuses 'bad_option'. */
export const cheatClock = Checker(() => HX.clockShape.optional(), 'bad_option')
// --
