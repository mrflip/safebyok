/** The shapes the models share, imported as `MSX`: the record forms a storable holds and reconciles, what storage answers, the bags reconciling passes, the world and listing a storable lives in, the options its verbs take, the arguments it is made with, and the dna a box is built from.
 * A type generic over a model's record cannot come from its validator, so it stays a type, with
 * the validator beside it: each check judges what the base can know of a record, its revision,
 * its times, its `am` and its `vault_tok`, and leaves the concrete class's validator the rest.
 * A check of a bag reconciling passes refuses 'unexpected_error': a bag that fails one is a bug
 * in Storable, never a host's. Every other `parse` refuses as its doc says, quoting none of its input.
 */

import { deepFreeze, omit } from 'es-toolkit'
import type * as Z from 'zod'
import { Checker, Checkers, objCheck } from '../checks/validator'
import { type VaultError, isVaultError } from '../errors'
import { type Outcome } from '../outcome'
import * as Phrases from '../phrases'
import * as HX from '../shapes/host-code'
import { sidecar, whisper } from '../shapes/box'
import * as FX from '../shapes/fields'

// == [Checks]: Checks

/** The checks this module makes for itself, passed as `sources` to the validators below: `vaultError`, a VaultError as {@link isVaultError} tells one; and `absent`, a field that must be left out, which `unk` alone would not allow (it refuses a missing key). */
const Checks = Checkers('bad_record', ({ unk, custom }) => ({
  vaultError: custom<VaultError>(isVaultError, Phrases.VaultErrorExpected),
  absent:     unk.optional().refine((val) => val === undefined, Phrases.LeftOutExpected),
}))
// --

// == [Record forms]: amVals, tombstoneAmVals, am, revision, times, liveness, vaulted, sparseBase, tombstone, cacheable, cacheLoaded, Am, Revision, Times, Liveness, Vaulted, SparseBase, Tombstone, Fetched, Dna, Cacheable, NeverStoredSeq, isTombstone

/** Whether a record is alive (`a`), damaged (`d`: it failed its check or its seal, and reads as gone) or gone (`x`: deleted). */
export const amVals = ['a', 'd', 'x'] as const

/** The `am` a tombstone carries: damaged or gone, never alive. */
export const tombstoneAmVals = ['d', 'x'] as const

/** The checks of what the base knows of any record, each refusing 'bad_record': `am`, one of {@link amVals}; `revision`, `times`, `liveness` and `vaulted`, a part each; and `sparseBase`, the four together, the least a sparse form carries beside its scope.
 * `tombstone` is a sparse base that is damaged or gone; `cacheable` is one with `central` and
 * `staged` beside it, as a storable saves it to the device cache. Each takes its fields from
 * whatever carries them, a record, a storable or a snapshot, and strips the rest. `cacheLoaded`
 * checks that the cache's load is an array, and leaves each copy in it to `cacheable`.
 *
 * @example sparseBase.parse(box)   // { revision_tok, revision_seq, registered_at, written_at, am, vault_tok }
 */
export const { am, revision, times, liveness, vaulted, sparseBase, tombstone, cacheable, cacheLoaded } = Checkers('bad_record', ({ obj, arr, unk, int, oneof, revision_tok, vault_tok, epochMillis }) => {
  const am = oneof(amVals)
  const revision = obj({
    revision_tok,
    /** A counter the store moves at every put and del: of two revisions, the higher `revision_seq` is the newer. {@link NeverStoredSeq} marks a central never stored. */
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
  const cacheLoaded = arr(unk)
  return { am, revision, times, liveness, vaulted, sparseBase, tombstone, cacheable, cacheLoaded }
}, [FX])

/** Whether a record is alive, damaged or gone, as {@link am} checks it: one of {@link amVals}. */
export type Am = Z.infer<typeof am>

/** A record's revision: its `revision_tok`, minted at each put and del, and its `revision_seq`, higher on the later one. */
export type Revision = Readonly<Z.infer<typeof revision>>

/** When the thing was first stored, and when the record in hand was written; on a tombstone, when it was deleted. */
export type Times = Readonly<Z.infer<typeof times>>

/** Whether a record is alive, damaged or gone: its `am`. */
export type Liveness = Readonly<Z.infer<typeof liveness>>

/** The `vault_tok` of the vault a record lies in, which every storable records and seals; a vault's is its own. */
export type Vaulted = Readonly<Z.infer<typeof vaulted>>

/** The least a sparse form carries: the scope, and what {@link sparseBase} checks, the revision, the times, whether it is alive and the vault it lies in. */
export type SparseBase<ScopeT> = ScopeT & Revision & Times & Liveness & Vaulted

/** The sparse form of a thing damaged or gone: every sparse prop stays on it, for the record; nothing the user put in the thing does. {@link tombstone} checks what the base knows of one.
 * A stored record that fails its check arrives as a tombstone, `am` 'd': the sparse props as far
 * as storage recovered them, and the kind's constants filled in by the adapter, so that the
 * concrete listing's `sparseOf` accepts it. Where that much cannot be recovered, the store
 * refuses 'corrupt_record' instead. For a box, see {@link boxSparse}.
 */
export type Tombstone<SparseT> = SparseT & Readonly<{ am: typeof tombstoneAmVals[number] }>

/** The `val` a storage call delivers: the full record, its sparse form, or its tombstone. {@link sparseBase} checks what the base knows of any of the three. */
export type Fetched<RecordT, SparseT> = RecordT | SparseT | Tombstone<SparseT>

/** The DNA of a storable, what a caller hands `listing.build`: the scope, and any of the record's props, each missing or undefined where not given; those the factory controls are ignored. */
export type Dna<ScopeT, RecordT> = ScopeT & { [Prop in keyof RecordT]?: RecordT[Prop] | undefined }

/** The copy a storable saves to the device cache at each settle, and a listing revives it from: the sparse form, with `central` and `staged` beside it, `staged` null where nothing is staged. {@link cacheable} checks what the base knows of one. */
export type Cacheable<RecordT, SparseT> = SparseT & Readonly<{
  central: Fetched<RecordT, SparseT>
  staged:  Fetched<RecordT, SparseT> | null
}>

/** The `revision_seq` of a central never stored: a thing is born with a tombstone here as its central, so that any record received is newer, and nothing stored is what it expects. */
export const NeverStoredSeq = -1

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
 * Whatever an `Outcome` carries, an answer carries. A stored record that fails its check is
 * delivered as a damaged {@link Tombstone}, in the kind's sparse form, or refused 'corrupt_record'
 * by the store. {@link answer} checks what the base knows of one.
 */
export type Answer<ScopeT, RecordT, SparseT> = Outcome<Fetched<RecordT, SparseT> | null> & AnswerBase<ScopeT>

/** A notice from the watch: an answer nobody asked for, always naming a record, sparse at least; a damaged one arrives as {@link Answer} says, a {@link Tombstone}. {@link notice} checks what the base knows of one. */
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

/** The checks of what a caller hands to make or update a box, each a duckish refusing 'bad_option' and naming the failing field: `boxDna`, what `build` takes; `boxPatch`, what `edit`, `send` and `seal` take. A record is checked by `boxRecord` or `boxSparse`, never by these.
 * Both require `whisper`, the {@link WhisperHolder} sealed in, and `sidecar`, as every update of a
 * box names both. A whisper that fails {@link whisperHolder} refuses 'bad_option' here, as every
 * field does, naming `whisper` or `whisper.val`. The props the factory controls may be given, must
 * pass their checks, and are stripped. A field neither takes refuses, as a bag a person typed would.
 *
 * `boxDna` requires the scope too, and fills `whisper_codec` and `whisper_schema_version` with
 * their defaults where missing or undefined; the factory's props are `fmt`, `am`, `vault_tok`,
 * `revision_tok` and the times. The sealed parts never come from a dna: `build` seals every box it
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
  const factory = boxSparse.pick({ fmt: true, am: true, vault_tok: true, revision_tok: true, registered_at: true, written_at: true }).partial()
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

// == [The vault's forms]: VaultFormat, vaultRecord, vaultSparse, vaultPatch, VaultRecord, VaultSparse

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

/** The check of a vault's patch, refusing 'bad_option', naming the field: nothing yet, so `{}`, and any prop of the vault's record, which the vault controls and ignores, so `{ ...record }` will do; each is checked, and one no vault record has refuses. Its output is the props given, for the vault to hold its scope fields to its own.
 * Not yet: the gate, the one payload a vault's patch will carry.
 * @example vaultPatch.parse({})                          // {}
 * @example vaultPatch.parse({ ...record })               // the record's props, as given
 * @example vaultPatch.parse({ gate: {} })                // throws 'bad_option', naming gate
 */
export const vaultPatch = Checker(() => vaultRecord.partial().strict(), 'bad_option')

export type VaultSparse = Z.infer<typeof vaultSparse>
export type VaultRecord = Z.infer<typeof vaultRecord>
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

/** `edit`'s options: its {@link TimelyOpts}. */
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

/** The vaultDB's verbs for one kind of thing, as a listing calls them. `priorTok` is the `revision_tok` of the record this device holds, null where it holds none; no prior `revision_seq` is sent.
 * Every `put` is the versioned replace (compare-and-swap), judged by storage in this order:
 * * `priorTok` null with a `revision_seq` other than 0, or a `priorTok` with a `revision_seq` below 1, refuses 'bad_record': no device of this package puts it.
 * * Over no row, `priorTok` null lands; a `priorTok` given refuses 'stale_write', carrying nothing.
 * * Over a row under another `revision_tok` than `priorTok` (any row, where `priorTok` is null; a tombstone is a row), it refuses 'stale_write', carrying that row.
 * * Over the row under `priorTok`, it lands only at that row's `revision_seq` + 1, which storage computes or queries itself; any other `revision_seq` refuses 'bad_record'.
 * A put that lands keeps the record exactly as given, never renumbered or patched, and answers what storage then holds.
 * `del` follows the same `priorTok` rule and answers the tombstone it lands, at the row's `revision_seq` + 1 under a fresh `revision_tok`; over no row, with `priorTok` null, it lands a tombstone at revision 0.
 * `watch` pushes a notice for every change; `fullFor` names the scopes to push full records for, every other notice sparse at most.
 */
export type Store<ScopeT, RecordT, SparseT> = {
  get(scope: ScopeT): Promise<Answer<ScopeT, RecordT, SparseT>>
  put(record: RecordT, priorTok: string | null): Promise<Answer<ScopeT, RecordT, SparseT>>
  del(scope: ScopeT, priorTok: string | null): Promise<Answer<ScopeT, RecordT, SparseT>>
  watch(onNotice: (notice: Notice<RecordT, SparseT>) => Promise<void>, fullFor: () => readonly ScopeT[]): () => void
}

/** The deviceDB's cache of one kind of thing: loaded once, by the listing's `hello`; saved by each instance's settle, the listing handing it to each instance it makes. */
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

/** The check of a box listing's options, beyond what {@link listingOpts} checks: its world names the vault's scope and its `vault_tok`. Its `parse` refuses 'bad_option'. Checks only. */
export const boxListingOpts = objCheck(({ obj, applabel, user_id, vaultlabel, vault_tok }) => ({
  world: obj({ scope: obj({ applabel, user_id, vaultlabel }), vault_tok }),
}), { refuseAs: 'bad_option', extras: 'strip' }, [FX])
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
