/** SLOPDOC: The shapes the models share, imported as `MSX`; each section banner names the forms it holds. */

import { deepFreeze, omit } from 'es-toolkit'
import type * as Z from 'zod'
import { Checker, Checkers, objCheck } from '../checks/validator'
import { type VaultError, isVaultError } from '../errors'
import type { Outcome } from '../outcome'
import * as Phrases from '../phrases'
import * as HX from '../shapes/host-code'
import type { CipherCtxRecord } from '../crypto'
import type { Lease } from './lease'
import * as VX from '../shapes/vault'
import { ModelsLeaseFormat, isLeaseKey } from '../shapes/device'
import { vaultScope } from '../shapes/scopes'
import { sidecar, whisper } from '../shapes/box'
import * as FX from '../shapes/fields'
import type { VaultDB } from '../storage/vault-db-new'
import * as VS from '../storage/vault-db-shapes'

// == [Checks]: Checks

/** The checks this module makes for itself, passed as `sources` to the validators below: `vaultError`, a VaultError as {@link isVaultError} tells one. */
const Checks = Checkers('bad_record', ({ custom }) => ({
  vaultError: custom<VaultError>(isVaultError, Phrases.VaultErrorExpected),
}))
// --

// == [Record forms]: amVals, tombstoneAmVals, am, revision, times, liveness, vaulted, sparseBase, tombstone, Am, Revision, Times, Liveness, Vaulted, SparseBase, Tombstone, Fetched, Dna, VoidRevisionSeq, isTombstone

/** Whether a record is alive (`a`), damaged (`d`: it failed its check, and is set aside in `damaged_records`) or gone (`x`: deleted). */
export const { amVals } = VS

/** The `am` a tombstone carries: damaged or gone, never alive. */
export const tombstoneAmVals = ['d', 'x'] as const

/** SLOPDOC: The checks of what the base knows of any record, from whatever carries it: record, storable or snapshot. */
export const { am, revision, times, liveness, vaulted, sparseBase, tombstone } = Checkers('bad_record', ({ obj, oneof }) => ({
  am:         VS.am,
  revision:   VS.revision,
  times:      VS.times,
  liveness:   obj({ am: VS.am }),
  vaulted:    VS.vaulted,
  sparseBase: VS.sparseBase,
  tombstone:  VS.sparseBase.extend({ am: oneof(tombstoneAmVals) }),
}))

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

/** SLOPDOC: The sparse form of a thing damaged or gone: its sparse props stay on it, the user's content goes. */
export type Tombstone<SparseT> = SparseT & Readonly<{ am: typeof tombstoneAmVals[number] }>

/** The `val` a storage call delivers: the full record, its sparse form, or its tombstone. {@link sparseBase} checks what the base knows of any of the three. */
export type Fetched<RecordT, SparseT> = RecordT | SparseT | Tombstone<SparseT>

/** The DNA of a storable, what a caller hands `listing.create`: the scope, and any of the record's props, each missing or undefined where not given; those the factory controls are ignored. */
export type Dna<ScopeT, RecordT> = ScopeT & { [Prop in keyof RecordT]?: RecordT[Prop] | undefined }

/** The `revision_seq` of a central never stored: a thing is born with a tombstone here as its central, so that any record received is newer, and nothing stored is what it expects. */
export const { VoidRevisionSeq } = VS

/** True for a record whose `am` says damaged or gone. */
export const isTombstone = <SparseT extends Liveness>(fetched: SparseT): fetched is Tombstone<SparseT> => (fetched.am === 'd' || fetched.am === 'x')
// --

// == [Reconciling]: recordShapeVals, ageVals, centralPolicyVals, recordShape, age, centralPolicy, reconciled, settled, RecordShape, Age, CentralPolicy, Reconciled, Settled

/** The shapes of a record as `classifyRecordShape` tells them: `sparse`, `full` or `gone` (a tombstone). */
export const recordShapeVals = ['sparse', 'full', 'gone'] as const

/** How a revision `post` compares to an `ante`, as `cmpRevisions` tells it. */
export const ageVals = ['older', 'same', 'newer'] as const

/** Every policy `reconcileCentral` may choose: `older` and `same` end the receive with central as it was; `fill` takes the record over the one in hand; `adopt` takes the one received; `gone` takes it as deleted. */
export const centralPolicyVals = ['older', 'same', 'fill', 'adopt', 'gone'] as const

/** The checks of what reconciling passes: the kinds above, each by its list; `reconciled`, what `reconcileCentral` hands back; and `settled`, what `settle` and `receive` hand back. Checks only. */
export const { recordShape, age, centralPolicy, reconciled, settled } = Checkers('unexpected_error', ({ obj, arr, oneof, vaultError }) => ({
  recordShape:   oneof(recordShapeVals),
  age:           oneof(ageVals),
  centralPolicy: oneof(centralPolicyVals),
  reconciled:    obj({ central: sparseBase, policy: oneof(centralPolicyVals) }),
  settled:       obj({ badnews: arr(vaultError).readonly() }).readonly(),
}), [Checks])

/** The shape of a record: one of {@link recordShapeVals}. */
export type RecordShape = Z.infer<typeof recordShape>

/** How one revision compares to another: one of {@link ageVals}. */
export type Age = Z.infer<typeof age>

/** A policy of `reconcileCentral`: one of {@link centralPolicyVals}. */
export type CentralPolicy = Z.infer<typeof centralPolicy>

/** Return type of `reconcileCentral`: the central that results, and the policy that chose it. {@link reconciled} checks what the base knows of one. */
export type Reconciled<RecordT, SparseT> = Readonly<{ central: Fetched<RecordT, SparseT>, policy: CentralPolicy }>

/** Return type of `settle` and `receive`: `badnews`, the refusals to tell the host once. */
export type Settled = Z.infer<typeof settled>
// --

// == [The box's forms]: BoxFormat, whisperHolder, WhisperHolder, boxRecord, boxSparse, boxDna, boxPatch, boxPut, boxesListed, boxlabelArg, BoxRecord, BoxSparse, BoxDnaFilled, BoxPatchGiven, BoxPutGiven, BoxesListed

/** The box format these forms describe, as each record carries it in `fmt`. */
export const { BoxFormat } = VS

/** SLOPDOC: The check of `{ val }`, the object a box takes and gives its whisper in, handing back a frozen copy. */
export const whisperHolder = Checker(({ obj, custom }) => custom((val) => val !== LOCKED, Phrases.LockedIsNoWhisper)
  .pipe(obj({ val: whisper }).strict().overwrite((holder) => deepFreeze(holder)).readonly()), 'bad_option')

/** The object a box takes and gives its whisper in: `{ val }`, frozen, the whisper its `val`. */
export type WhisperHolder = Z.output<typeof whisperHolder>

/** SLOPDOC: The checks of a box's stored forms, full and sparse, from a record or a box ducking as one. */
export const { boxRecord, boxSparse } = Checkers('bad_record', () => ({ boxRecord: VS.boxRecord, boxSparse: VS.boxSparse }))

export type BoxSparse = Z.infer<typeof boxSparse>
export type BoxRecord = Z.infer<typeof boxRecord>

/** True where a patch names a half of its box. */
const namesAHalf = ({ whisper, sidecar }: { whisper?: unknown, sidecar?: unknown }): boolean => (whisper !== undefined) || (sidecar !== undefined)

/** SLOPDOC: The checks of what a caller hands to make or update a box: for `create`, `send` and `putBox`. */
export const { boxDna, boxPatch, boxPut } = Checkers('bad_option', ({ lit, oneof, applabel, user_id, vaultlabel, boxlabel }) => {
  const halves  = { whisper: whisperHolder, sidecar }
  const factory = boxSparse.pick({ fmt: true, am: true, vault_tok: true, box_tok: true, revision_tok: true, registered_at: true, written_at: true }).partial()
  const boxDna  = factory.extend({
    applabel, user_id, vaultlabel, boxlabel,
    ...halves,
    whisper_codec:          lit('json_v1').default('json_v1'),
    whisper_schema_version: lit(1).default(1),
  }).strict().transform((dna) => omit(dna, factory.keyof().options))
  const patchProps = boxRecord.omit({ sidecar: true }).partial().extend({ am: oneof(amVals).optional(), whisper: whisperHolder.optional(), sidecar: sidecar.optional() })
  const boxPatch = patchProps.strict().refine(namesAHalf, Phrases.PatchNamesNeitherHalf)
    .transform(({ whisper, sidecar, applabel, user_id, vaultlabel, boxlabel }) => ({ whisper, sidecar, applabel, user_id, vaultlabel, boxlabel }))
  const boxPut = patchProps.extend({ boxlabel }).strict().refine(namesAHalf, Phrases.PatchNamesNeitherHalf)
    .transform(({ whisper, sidecar, applabel, user_id, vaultlabel, boxlabel }) => ({ whisper, sidecar, applabel, user_id, vaultlabel, boxlabel }))
  return { boxDna, boxPatch, boxPut }
})

/** A box's dna as {@link boxDna} hands it back: the scope, the whisper and the sidecar, and the record's own props with their defaults filled. */
export type BoxDnaFilled = Z.output<typeof boxDna>

/** A box's patch as {@link boxPatch} hands it back: the whisper and the sidecar, each undefined where kept, and the scope's fields as given. */
export type BoxPatchGiven = Z.output<typeof boxPatch>

/** What `vault.putBox` is told, as {@link boxPut} hands it back: a {@link BoxPatchGiven} under its `boxlabel`. */
export type BoxPutGiven = Z.output<typeof boxPut>

/** The check of what a vault's get lists of its boxes: `boxes`, sparse, tombstones among them, and `damaged_records`, each row that failed its check, whose boxlabel is whatever storage has it under. */
export const boxesListed = objCheck(({ arr, oneof, obj, str }) => {
  const damaged = boxSparse.extend({ boxlabel: str }).and(obj({ damagekind: oneof(VS.damagekindVals) }))
  return { boxes: arr(boxSparse), damaged_records: arr(damaged) }
}, { refuseAs: 'bad_record', extras: 'strip' })

/** What a vault's get lists of its boxes, as {@link boxesListed} checks it. */
export type BoxesListed = Z.output<typeof boxesListed>

/** The check of a boxlabel a box verb is handed. */
export const boxlabelArg = Checker(({ boxlabel }) => boxlabel, 'bad_option')
// --

// == [Options]: ifPresentVals, ifAbsentVals, putIfAbsentVals, ifPresent, ifAbsent, putIfAbsent, Promptly, horizonMillis, maxMillis, timelyOpts, fetchOpts, sendOpts, storableOpts, listener, IfPresent, IfAbsent, PutIfAbsent, TimelyOpts, FetchOpts, SendOpts, StorableOpts

/** The policies when sending a record to a place that already holds a live one: `repl`, the default, replaces it; `fail` refuses `camped`; `get` saves nothing and takes up the live record. Storage decides, atomically. */
export const { ifPresentVals } = VS

/** The policies when fetching a thing that is absent, never stored or deleted: `fail` with the absent refusal, or resolve `nil`. */
export const { ifAbsentVals } = VS

/** The policies when putting over a thing that is absent, never stored or deleted: `add`, the default, stores it; `fail` refuses. */
export const { putIfAbsentVals } = VS

/** How old, in milliseconds, a vault's record may be and still be acted on with no fetch. `ensureTimely(0)` accepts none: it fetches, or joins the fetch under way. */
export const Promptly = 2000

/** SLOPDOC: The checks of the options a storable and its verbs take. */
export const { ifPresent, ifAbsent, putIfAbsent, horizonMillis, maxMillis, timelyOpts, fetchOpts, sendOpts, storableOpts, listener } = Checkers('bad_option', ({ obj, num, union, lit, oneof, fn }) => {
  const ifPresent     = oneof(ifPresentVals)
  const ifAbsent      = oneof(ifAbsentVals)
  const putIfAbsent   = oneof(putIfAbsentVals)
  const horizonMillis = union([num.nonnegative(), lit(Infinity)])
  const maxMillis     = horizonMillis.optional()
  const timelyOpts    = obj({ maxMillisSinceRefresh: maxMillis, maxWorldMillis: maxMillis })
  const fetchOpts     = timelyOpts.extend({ ifAbsent: ifAbsent.optional() })
  const sendOpts      = timelyOpts.extend({ ifPresent: ifPresent.optional() })
  const storableOpts  = obj({
    /** The refresh horizon: how long after its last refresh the record in hand stays timely. */
    maxMillisSinceRefresh: horizonMillis,
  })
  const listener      = fn<() => void>()
  return { ifPresent, ifAbsent, putIfAbsent, horizonMillis, maxMillis, timelyOpts, fetchOpts, sendOpts, storableOpts, listener }
})

/** How `send` meets a live record storage holds, as {@link ifPresent} checks it: one of {@link ifPresentVals}. */
export type IfPresent = Z.infer<typeof ifPresent>

/** How `fetch` treats a thing that is absent, as {@link ifAbsent} checks it: one of {@link ifAbsentVals}. */
export type IfAbsent = Z.infer<typeof ifAbsent>

/** How a put treats a thing that is absent, as {@link putIfAbsent} checks it: one of {@link putIfAbsentVals}. */
export type PutIfAbsent = Z.infer<typeof putIfAbsent>

/** How fresh the record in hand and the world must be before a verb goes on. The world heeds `maxWorldMillis`; the record, `maxMillisSinceRefresh`. */
export type TimelyOpts = Z.infer<typeof timelyOpts>

/** `fetch`'s options: its {@link TimelyOpts}, and `ifAbsent`, how it treats a thing that is absent: `fail` by default, with the listing's absent refusal; `nil` resolves null. */
export type FetchOpts = Z.infer<typeof fetchOpts>

/** `send`'s options: its {@link TimelyOpts}, and `ifPresent`, optional, one of {@link ifPresentVals}: `repl` by default. */
export type SendOpts = Z.infer<typeof sendOpts>

/** The options a storable is made with, after its world, listing and records: its refresh horizon. */
export type StorableOpts = Z.infer<typeof storableOpts>
// --

// == [The world and the listing]: lockStateVals, LOCKED, LockedBag, IsListing, isListing, lockState, world, vaultDBDuck, listingOpts, putListingOpts, boxListingOpts, LockState, World, ListingWorld, ListingOpts, PutListingOpts

/** Whether the world a storable lives in is `unlocked` or `locked`: for a box, its vault's lock. */
export const lockStateVals = ['unlocked', 'locked'] as const

/** The brand {@link LOCKED} is made with: a symbol of this module's, never `Symbol.for`, so no code outside the package spells it. A copy of LOCKED carries it too, so the brand tells LOCKED from a whisper, never from its copies. */
const LockedBrand: unique symbol = Symbol('safebyok.locked')

/** SLOPDOC: The frozen singleton answered for what the locked vault hides; `Storable.isLockedFUBag` tells it. */
export const LOCKED: LockedBag = Object.freeze({ [LockedBrand]: true as const })

/** The type of {@link LOCKED}, which a copy of it has too: `Storable.isLockedFUBag` alone tells LOCKED itself. */
export type LockedBag = Readonly<{ [LockedBrand]: true }>

/** The tag a Listing answers true to, so a storable can tell one without importing it. */
export const IsListing: unique symbol = Symbol('safebyok.listing')

/** True for a Listing: an object that answers true to {@link IsListing}. */
export const isListing = (val: unknown): val is { [IsListing]: true } => (
  typeof val === 'object' && val !== null && (val as { [IsListing]?: unknown })[IsListing] === true
)

/** The check of whether the world a listing lives in is unlocked or locked: one of {@link lockStateVals}. */
export const lockState = Checker(({ oneof }) => oneof(lockStateVals), 'unexpected_error')

/** The check of the world a listing lives in, the vault for boxes and the bank for vaults, as far as the base needs it: the one `clock`. */
export const world = objCheck(() => ({ clock: HX.clockShape }), { refuseAs: 'bad_option', extras: 'strip' })

/** Whether the world a listing lives in is unlocked or locked, as {@link lockState} checks it: one of {@link lockStateVals}. */
export type LockState = Z.infer<typeof lockState>

/** The world a listing lives in: the vault for boxes, the bank for vaults. The one clock lives here. */
export type World = Z.infer<typeof world>

/** The world as a listing needs it beyond the clock: its lock, its own timeliness, and the taking of the world an answer carries. */
export type ListingWorld = World & {
  lockState(): LockState
  ensureTimely(maxMillis?: number): Promise<unknown>
  takeWorld(world: unknown): void
}

/** The options a listing is made with: its world and vaultDB, the refresh horizon of each thing it makes, and where to tell bad news. */
export type ListingOpts = {
  world:                 ListingWorld
  vaultDB:               VaultDB
  maxMillisSinceRefresh: number
  /** Told bad news nobody asked about; its answer, a promise too, is heard out and never awaited. */
  onBadNews?:            ((news: VaultError) => unknown) | undefined
}

/** The check of a vaultDB as a model is handed one: the verbs the listings call. Checks only. */
export const vaultDBDuck = Checker(({ obj, fn }) => obj({ tryGetVault: fn(), tryPutVault: fn(), tryDelVault: fn(), tryGetBox: fn(), tryPutBox: fn(), tryDelBox: fn(), watch: fn() }), 'bad_option')

/** The check of a listing's constructor arguments, as far as the base can tell. Checks only. */
export const listingOpts = objCheck(({ obj, fn }) => ({
  world:                 obj({ clock: HX.clockShape, lockState: fn(), ensureTimely: fn(), takeWorld: fn() }),
  vaultDB:               vaultDBDuck,
  maxMillisSinceRefresh: horizonMillis,
  onBadNews:             fn().optional(),
}), 'bad_option')

/** The check of what `listing.put` is told: the revision `prior` it goes over, and how it meets a row absent or live, an upcreate where left out. */
export const putListingOpts = objCheck(() => ({ prior: revision, ifAbsent: putIfAbsent.optional(), ifPresent: ifPresent.optional() }), 'bad_option')

export type PutListingOpts = Z.infer<typeof putListingOpts>

/** The check of a box listing's options, beyond what {@link listingOpts} checks: its world names the vault's scope and its `vault_tok`, and answers the seal verbs. Checks only. */
export const boxListingOpts = objCheck(({ obj, fn, applabel, user_id, vaultlabel, vault_tok }) => ({
  world: obj({ scope: obj({ applabel, user_id, vaultlabel }), vault_tok, sealStampedString: fn(), unsealStampedString: fn() }),
}), { refuseAs: 'bad_option', extras: 'strip' }, [FX])
// --

// == [Making a storable]: storableArgs

/** The check of a storable's constructor arguments, as far as the base can tell. Checks only. */
export const storableArgs = objCheck(({ custom }) => ({
  world,
  listing: custom<object>(isListing, Phrases.ListingExpected),
  central: sparseBase,
  opts:    storableOpts,
}), 'bad_option')
// --

// == [The vault's stamp]: vaultStamp, VaultStamp

/** The fields of a vault fixed for its life, which every ctx under it binds: the scope, `vault_tok` and `registered_at`. Its `parse` takes them from whatever carries them, a Vault included, and strips the rest. */
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

export const { passphraseWayinHeader, passkeyWayinHeader, wayinHeader, passphraseWayinRecord, passkeyWayinRecord, wayinRecord } = Checkers('bad_record', ({ discrim }) => {
  const passphraseWayinHeader = VS.passphraseWayin.omit({ vault_key_wayin_wrapped: true }).strip()
  const passkeyWayinHeader    = VS.passkeyWayin.omit({ vault_key_wayin_wrapped: true }).strip()
  return {
    passphraseWayinHeader,
    passkeyWayinHeader,
    wayinHeader: discrim('wayinkind', [passphraseWayinHeader, passkeyWayinHeader]),
    passphraseWayinRecord: VS.passphraseWayin,
    passkeyWayinRecord:    VS.passkeyWayin,
    wayinRecord: discrim('wayinkind', [VS.passphraseWayin, VS.passkeyWayin]),
  }
})

export type PassphraseWayinHeader = Z.infer<typeof passphraseWayinHeader>
export type PasskeyWayinHeader    = Z.infer<typeof passkeyWayinHeader>
export type WayinHeader           = Z.infer<typeof wayinHeader>
export type PassphraseWayinRecord = Z.infer<typeof passphraseWayinRecord>
export type PasskeyWayinRecord    = Z.infer<typeof passkeyWayinRecord>
export type WayinRecord           = Z.infer<typeof wayinRecord>
export type WayinKind             = WayinRecord['wayinkind']
// --

// == [The gate's forms]: FirstGateEpoch, gateEpoch, gateProps, GateProps

/** The `gate_epoch` of a vault's first gate. */
export const FirstGateEpoch = 1

/** Which gate of its vault a gate is: bound into every lease, which a gate of another epoch does not honour. */
export const gateEpoch = Checker(({ int }) => int.positive(), 'bad_record')

export const gateProps = objCheck(() => ({
  gate_epoch:       gateEpoch,
  passphrase_wayin: passphraseWayinRecord,
  passkey_wayin:    passkeyWayinRecord.nullable(),
}), 'bad_record')

export type GateProps = Z.infer<typeof gateProps>
// --

// == [The vault's forms]: VaultFormat, vaultRecord, vaultSparse, vaultRow, VaultRecord, VaultSparse

/** The vault format these forms describe, as each record carries it in `fmt`. */
export const { VaultFormat } = VS

/** SLOPDOC: The checks of a vault's stored forms, sparse and with its gate, from a record or a vault ducking as one. */
export const { vaultRecord, vaultSparse, vaultRow } = Checkers('bad_record', () => ({ vaultRecord: VS.vaultRecord, vaultSparse: VS.vaultSparse, vaultRow: VS.vaultRow }))

export type VaultSparse = Z.infer<typeof vaultSparse>
export type VaultRecord = Z.infer<typeof vaultRecord>
// --

// == [What a proving is handed]: provingWorld, passphraseNovelArgs, passkeyNovelArgs, passphraseStoredArgs, passkeyStoredArgs, strengthArgs, ProvingWorld, StampedGate

export const { provingWorld } = Checkers('bad_option', ({ obj, clockShape, keyDeriverShape, strengthChecker, device_id }) => ({
  provingWorld: obj({ clock: clockShape, keyDeriver: keyDeriverShape, strengthChecker, device_id }),
}), [FX, HX, VX])

export type ProvingWorld = Z.infer<typeof provingWorld>

/** The arguments of the provings' statics. A `stamp` is whatever carries a {@link vaultStamp}, a record or a vault, stripped to one; a `gate` is whatever carries a {@link vaultStamp} as `stamp`, and {@link gateProps}, as a `Gate` does. */
export const { stampedGate, passphraseNovelArgs, passkeyNovelArgs, passphraseStoredArgs, passkeyStoredArgs, strengthArgs } = Checkers('bad_option', ({ obj, passphraseCleartext, passkeyAnswer, freshPasskeyAnswer }) => {
  const stampedGate = obj({ stamp: vaultStamp, ...gateProps.shape })
  return {
    stampedGate,
    passphraseNovelArgs:   obj({ stamp: vaultStamp, passphraseClear: passphraseCleartext, world: provingWorld }),
    passkeyNovelArgs:      obj({ stamp: vaultStamp, passkeyClear: freshPasskeyAnswer, world: provingWorld }),
    passphraseStoredArgs:  obj({ gate: stampedGate, passphraseClear: passphraseCleartext, world: provingWorld }),
    passkeyStoredArgs:     obj({ gate: stampedGate, passkeyClear: passkeyAnswer }),
    strengthArgs:          obj({ passphraseClear: passphraseCleartext, scope: vaultScope, world: provingWorld }),
  }
}, [VX])

export type StampedGate = Z.infer<typeof stampedGate>
// --

// == [The lease's forms]: LeaseFormat, leaseStamp, leaseRecord, sealedWhisper, leaseFriend, leaseGrantOpts, ctxStamp, leasePeekArgs, leaseGrantArgs, provingLeaseArgs, leaseSealArgs, leaseUnsealArgs, LeaseStamp, LeaseSparse, LeaseRecord, SealedWhisper, LeaseFriend, LeaseGrantOpts

export const LeaseFormat = ModelsLeaseFormat

/** `leaseStamp` is what the wrap of a lease's vaultKey is bound to; `leaseRecord` adds its keys. */
export const { leaseStamp, leaseRecord } = Checkers('bad_record', ({ obj, lit, custom, epochMillis, vault_key_lease_wrapped }) => {
  const leaseStamp  = obj({ fmt: lit(LeaseFormat), ...vaultStamp.shape, gate_epoch: gateEpoch, proved_at: epochMillis, wayinkind: VX.wayinkind })
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

/** The autolock duration in milliseconds, Infinity for none. */
const leaseMillis = Checker(({ int, lit, union }) => union([int.positive(), lit(Infinity)]), 'bad_option')

/** All a lease or a proving hears of a vault, as a plain object, its fields fixed for the vault's life, the deviceDB's lease verbs bound to its scope and `vault_tok`. It holds no key, and reaches neither the record nor the boxes. */
export const leaseFriend = objCheck(({ fn }) => ({
  ...vaultStamp.shape,
  clock:           HX.clockShape,
  logger:          HX.loggerShape,
  /** The autolock duration: a cached row proved longer ago than this is due for locking. */
  leaseMillis,
  /** Lock the vault: a lease that will not open calls it, as what the vault holds is no use. */
  lock:            fn<() => unknown>(),
  /** Hold a lease as the vault's: what `lease.attach()` calls. */
  attachLease:     fn<(lease: Lease) => Promise<void>>(),
  /** The record this device has cached, or null for none. */
  peekLease:       fn<() => Promise<unknown>>(),
  tryCacheLease:   fn<(record: LeaseRecord) => Promise<Outcome<unknown>>>(),
  tryUncacheLease: fn<() => Promise<Outcome<void>>>(),
}), { refuseAs: 'bad_option', extras: 'strip' })

export type LeaseFriend = Z.infer<typeof leaseFriend>

export const leaseGrantOpts = objCheck(() => ({
  gate_epoch: gateEpoch,
  wayinkind:  VX.wayinkind,
}), 'bad_option')

export type LeaseGrantOpts = Z.infer<typeof leaseGrantOpts>

/** True for a stamp a caller hands the lease as additional data: a flat object of strings and finite numbers, at least one. */
const isCtxStamp = (val: unknown): boolean => (
  typeof val === 'object' && val !== null && ! Array.isArray(val) && Object.keys(val).length > 0
    && Object.values(val).every((field) => typeof field === 'string' || Number.isFinite(field))
)

/** SLOPDOC: The arguments of each lease verb, and the flat stamp binding what a lease seals to its caller's record. */
export const { ctxStamp, leasePeekArgs, leaseGrantArgs, provingLeaseArgs, leaseSealArgs, leaseUnsealArgs } = Checkers('bad_option', ({ obj, custom, str }) => {
  const cryptoKey = custom<CryptoKey>((val) => val instanceof CryptoKey, 'Expected a CryptoKey')
  const ctxStamp  = custom<CipherCtxRecord>(isCtxStamp, Phrases.CtxStampExpected)
  return {
    ctxStamp,
    leasePeekArgs:    obj({ friend: leaseFriend, gate_epoch: gateEpoch }),
    leaseGrantArgs:   obj({ friend: leaseFriend, vaultKey: cryptoKey.refine((val) => val.extractable, 'Expected an extractable CryptoKey'), opts: leaseGrantOpts }),
    provingLeaseArgs: obj({ friend: leaseFriend, gate_epoch: gateEpoch.optional() }),
    leaseSealArgs:    obj({ whisperText: str, stamp: ctxStamp }),
    leaseUnsealArgs:  obj({ sealed: sealedWhisper, stamp: ctxStamp }),
  }
}, [FX])
// --

// == [The vault's world]: deviceDBDuck, vaultListingOpts

/** A deviceDB, as far as a duck can tell: the verbs a vault's lease friend binds. */
export const deviceDBDuck = Checker(({ obj, fn }) => obj({ peek: fn(), tryCache: fn(), tryVacate: fn() }), 'bad_option')

/** The check of a vault listing's options past what {@link listingOpts} checks: that its world carries what a vault's gate and lease need. Checks only. */
export const vaultListingOpts = objCheck(({ obj, fn }) => ({
  world: obj({ ...provingWorld.shape, logger: HX.loggerShape, leaseMillis: leaseMillis.optional(), deviceDB: deviceDBDuck, onPanic: fn().optional(), requestCleartext: fn().optional() }),
}), { refuseAs: 'bad_option', extras: 'strip' })
// --

// == [The gating's forms]: gatingKindVals, correctableKindVals, gatingkind, vaultBuildClears, vaultUnlockClears, passphraseReplaceClears, passkeyAddClears, passkeyRevokeClears, vaultDelClears, gatingLaunchArgs, GatingKind, ClearsForGatingkind, StrengthChecker

export const gatingKindVals = ['build_vault', 'unlock_vault', 'replace_passphrase', 'add_passkey', 'revoke_passkey', 'del_vault'] as const

/** The refusals an attempt leaves its gating open under, for the user to try again. */
export const correctableKindVals = ['wrong_passphrase', 'wrong_passkey', 'weak_passphrase', 'same_passphrase'] as const

/** What the user hands an attempt, by the kind of gating; a clear is only ever checked here, in the attempt's own call. */
export const { gatingkind, vaultBuildClears, vaultUnlockClears, passphraseReplaceClears, passkeyAddClears, passkeyRevokeClears, vaultDelClears } = Checkers('bad_option', ({ oneof, obj, passphraseCleartext, passkeyAnswer, freshPasskeyAnswer }) => ({
  gatingkind:              oneof(gatingKindVals),
  vaultBuildClears:        obj({ passphraseClear: passphraseCleartext, passkeyClear: freshPasskeyAnswer.nullable().optional() }).strict(),
  vaultUnlockClears:       obj({ passphraseClear: passphraseCleartext.optional(), passkeyClear: passkeyAnswer.nullable().optional() }).strict()
    .refine(({ passphraseClear, passkeyClear = null }) => passphraseClear !== undefined || passkeyClear !== null, Phrases.ProofMissing),
  passphraseReplaceClears: obj({ antePassphraseClear: passphraseCleartext, nextPassphraseClear: passphraseCleartext }).strict(),
  passkeyAddClears:        obj({ passphraseClear: passphraseCleartext, passkeyClear: freshPasskeyAnswer }).strict(),
  passkeyRevokeClears:     obj({ passphraseClear: passphraseCleartext }).strict(),
  vaultDelClears:          obj({ passphraseClear: passphraseCleartext }).strict(),
}), [VX])

/** The check of what launches a gating. */
export const gatingLaunchArgs = objCheck(({ fn }) => ({ gatingkind, scope: vaultScope, run: fn() }), { refuseAs: 'bad_option', extras: 'strip' })

export type GatingKind = typeof gatingKindVals[number]

export type ClearsForGatingkind = {
  build_vault:        Z.input<typeof vaultBuildClears>
  unlock_vault:       Z.input<typeof vaultUnlockClears>
  replace_passphrase: Z.input<typeof passphraseReplaceClears>
  add_passkey:        Z.input<typeof passkeyAddClears>
  revoke_passkey:     Z.input<typeof passkeyRevokeClears>
  del_vault:          Z.input<typeof vaultDelClears>
}

export type StrengthChecker = Z.infer<typeof VX.strengthChecker>
// --

// == [The bank's forms]: positiveMinutes, refreshMinutes, bankOpts

export const { positiveMinutes, refreshMinutes } = Checkers('bad_option', ({ num, union, lit }) => ({
  positiveMinutes: union([num.positive(), lit(Infinity)], Phrases.PositiveMinutesShape),
  refreshMinutes:  union([num.nonnegative(), lit(Infinity)], Phrases.MinutesShape),
}))

export const bankOpts = objCheck(({ fn, applabel, user_id, device_id }) => ({
  applabel,
  user_id,
  device_id:           device_id.optional(),
  vaultDB:             vaultDBDuck,
  deviceDB:            deviceDBDuck,
  keyDeriver:          HX.keyDeriverShape,
  requestCleartext:    fn().optional(),
  strengthChecker:     VX.strengthChecker.optional(),
  clock:               HX.clockShape.optional(),
  logger:              HX.loggerShape.optional(),
  autolockMinutes:     positiveMinutes.optional(),
  vaultRefreshMinutes: refreshMinutes.optional(),
  boxRefreshMinutes:   refreshMinutes.optional(),
  onBadNews:           fn().optional(),
  onPanic:             fn().optional(),
}), { refuseAs: 'bad_option' }, [FX])
// --
