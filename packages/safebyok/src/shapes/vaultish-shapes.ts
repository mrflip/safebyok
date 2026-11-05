/** The checks and types of what's stored and listed: records, options, listings, boxes, vaults and banks, imported as `VX`. */

import { deepFreeze, omit } from 'es-toolkit'
import type * as Z from 'zod'
import { Checker, Checkers, objCheck } from '../helpers/validator'
import { type VaultError, isVaultError } from '../refusals/errors'
import * as Phrases from '../helpers/phrases'
import type { CipherCtxRecord } from '../helpers/crypto'
import type { KeyDeriver } from '../deriver/basederiver'
import type { VaultLogger } from '../helpers/logger'
import type { Listing } from '../models/listing'
import type { Storable } from '../models/storable'
import type { DeviceDB } from '../storage/device-db-new'
import type { Answer, VaultDB } from '../storage/vault-db-new'
import * as VS from '../storage/vault-db-shapes'
import * as FX from './fields'
import { type Sidecar, sidecar, whisper } from './fields'
import * as GX from './gateish-shapes'
import type { ProvingWorld, RequestCleartext, SealedWhisper, StrengthChecker } from './gateish-shapes'
import * as HX from './host-code'
import type { Clock } from './host-code'
import type { BankScope, Boxscope, VaultScope } from './scopes'

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

/** The `revision_seq` of a void row, and of a birth's prior: every populated row holds 0 or more. */
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

// == [The box's forms]: BoxFormat, whisperHolder, WhisperHolder, boxRecord, boxSparse, boxDna, boxPatch, boxesListed, BoxRecord, BoxSparse, BoxPatchGiven, BoxesListed

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

/** The checks of what a caller hands `create` (`boxDna`) and `put` (`boxPatch`). */
export const { boxDna, boxPatch } = Checkers('bad_option', ({ lit, oneof, applabel, user_id, vaultlabel, boxlabel }) => {
  const factory = boxSparse.pick({ fmt: true, am: true, vault_tok: true, box_tok: true, revision_tok: true, registered_at: true, written_at: true }).partial()
  const boxDna  = factory.extend({
    applabel, user_id, vaultlabel, boxlabel,
    whisper: whisperHolder.default({ val: {} }),
    sidecar: sidecar.default({}),
    whisper_codec:          lit('json_v1').default('json_v1'),
    whisper_schema_version: lit(1).default(1),
  }).strict().transform((dna) => omit(dna, factory.keyof().options))
  const boxPatch = boxRecord.omit({ sidecar: true }).partial().extend({ am: oneof(amVals).optional(), whisper: whisperHolder.optional(), sidecar: sidecar.optional() }).strict().refine(namesAHalf, Phrases.PatchNamesNeitherHalf)
    .transform(({ whisper, sidecar, applabel, user_id, vaultlabel, boxlabel }) => ({ whisper, sidecar, applabel, user_id, vaultlabel, boxlabel }))
  return { boxDna, boxPatch }
})

/** A box's patch as {@link boxPatch} hands it back: the whisper and the sidecar, each undefined where kept, and the scope's fields as given. */
export type BoxPatchGiven = Z.output<typeof boxPatch>

/** The check of what a vault's get lists of its boxes: `boxes`, sparse, tombstones among them, and `damaged_records`, each row that failed its check, whose boxlabel is whatever storage has it under. */
export const boxesListed = objCheck(({ arr, oneof, obj, str }) => {
  const damaged = boxSparse.extend({ boxlabel: str }).and(obj({ damagekind: oneof(VS.damagekindVals) }))
  return { boxes: arr(boxSparse), damaged_records: arr(damaged) }
}, { refuseAs: 'bad_record', extras: 'strip' })

/** What a vault's get lists of its boxes, as {@link boxesListed} checks it. */
export type BoxesListed = Z.output<typeof boxesListed>
// --

// == [The box's snapshot and patch]: BoxSnapshot, BoxHalves, BoxPatch, BoxPut

export type BoxSnapshot = Boxscope & Readonly<{
  revision_tok:  string
  revision_seq:  number
  registered_at: number
  written_at:    number
  sidecar:       Sidecar | null
  full:          boolean
  present:       boolean
  exposed:       boolean
}>

/** Both halves of a box, the whisper, as its {@link WhisperHolder} `{ val }`, and the sidecar: what every update of a box names, and what it seals. */
export type BoxHalves = { whisper: WhisperHolder, sidecar: Sidecar }

/** A host's patch for `put`: one or both {@link BoxHalves}, the other kept; any other prop of the box's record is ignored. */
export type BoxPatch = Omit<Z.input<typeof boxPatch>, keyof BoxHalves> & { [Prop in keyof BoxHalves]?: BoxHalves[Prop] | undefined }

/** A host's patch for `vault.putBox`: a {@link BoxPatch} under its `boxlabel`. */
export type BoxPut = BoxPatch & { boxlabel: string }
// --

// == [Options]: ifPresentVals, ifAbsentVals, putIfAbsentVals, ifPresent, ifAbsent, putIfAbsent, Promptly, horizonMillis, maxMillis, timelyOpts, fetchOpts, boxPutOpts, boxCreateOpts, storableOpts, listener, IfPresent, IfAbsent, PutIfAbsent, TimelyOpts, FetchOpts, BoxPutOpts, BoxCreateOpts, StorableOpts

/** The policies for a put over a live record: `repl`, the default, replaces it; `fail` refuses `camped`; `get` takes it up. */
export const { ifPresentVals } = VS

/** The policies when fetching a thing that is absent, never stored or deleted: `fail` with the absent refusal, or resolve `nil`. */
export const { ifAbsentVals } = VS

/** The policies for a put over a thing absent, never stored or deleted: `add`, the default, stores it; `fail` refuses. */
export const { putIfAbsentVals } = VS

/** How old, in milliseconds, a vault's record may be and still be acted on with no fetch. `ensureTimely(0)` accepts none: it fetches, or joins the fetch under way. */
export const Promptly = 2000

/** SLOPDOC: The checks of the options a storable and its verbs take. */
export const { ifPresent, ifAbsent, putIfAbsent, horizonMillis, maxMillis, timelyOpts, fetchOpts, boxPutOpts, boxCreateOpts, storableOpts, listener } = Checkers('bad_option', ({ obj, num, union, lit, oneof, fn }) => {
  const ifPresent     = oneof(ifPresentVals)
  const ifAbsent      = oneof(ifAbsentVals)
  const putIfAbsent   = oneof(putIfAbsentVals)
  const horizonMillis = union([num.nonnegative(), lit(Infinity)])
  const maxMillis     = horizonMillis.optional()
  const timelyOpts    = obj({ maxMillisSinceRefresh: maxMillis, maxWorldMillis: maxMillis })
  const fetchOpts     = timelyOpts.extend({ ifAbsent: ifAbsent.optional() })
  const boxPutOpts    = timelyOpts.extend({ ifAbsent: putIfAbsent.optional(), ifPresent: ifPresent.optional() })
  const boxCreateOpts = timelyOpts.extend({ ifAbsent: lit('add').default('add'), ifPresent: ifPresent.default('fail') })
  const storableOpts  = obj({
    /** The refresh horizon: how long after its last refresh the record in hand stays timely. */
    maxMillisSinceRefresh: horizonMillis,
  })
  const listener      = fn<() => void>()
  return { ifPresent, ifAbsent, putIfAbsent, horizonMillis, maxMillis, timelyOpts, fetchOpts, boxPutOpts, boxCreateOpts, storableOpts, listener }
})

/** How `put` meets a live record storage holds: one of {@link ifPresentVals}. */
export type IfPresent = Z.infer<typeof ifPresent>

/** How `fetch` treats a thing that is absent, as {@link ifAbsent} checks it: one of {@link ifAbsentVals}. */
export type IfAbsent = Z.infer<typeof ifAbsent>

/** How a put treats a thing absent: one of {@link putIfAbsentVals}. */
export type PutIfAbsent = Z.infer<typeof putIfAbsent>

/** How fresh the record in hand and the world must be before a verb goes on. The world heeds `maxWorldMillis`; the record, `maxMillisSinceRefresh`. */
export type TimelyOpts = Z.infer<typeof timelyOpts>

/** `fetch`'s options: its {@link TimelyOpts}, and `ifAbsent`, how it treats a thing that is absent: `fail` by default, with the listing's absent refusal; `nil` resolves null. */
export type FetchOpts = Z.infer<typeof fetchOpts>

/** `box.put`'s options: its {@link TimelyOpts}, and an upcreate unless `ifAbsent` or `ifPresent` says otherwise. */
export type BoxPutOpts = Z.infer<typeof boxPutOpts>

/** `create`'s options: {@link BoxPutOpts}, with `ifPresent` defaulting to `fail`, and `ifAbsent` always `add`. */
export type BoxCreateOpts = Z.input<typeof boxCreateOpts>

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

/** The check of what `listing.put` is told: the revision `prior` it goes over, and how it meets a row absent or live. */
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

// == [Given to a listing]: Thing, ListingAnswer, DelTombstone, SlotFate, ListingOf

export type Thing<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>> = Storable<ScopeT, RecordT, SparseT, unknown>

/** The answer of a vaultDB verb, as a listing delivers it: a record in any form, or null for nothing stored, or a refusal. */
export type ListingAnswer<RecordT, SparseT> = Answer<Fetched<RecordT, SparseT> | null, string, unknown>

/** The tombstone `listing.del` hands the vaultDB: gone, at the revision after the one it goes over. */
export type DelTombstone<SparseT> = SparseT & Readonly<{ am: 'x' }>

/** The fate of a record meeting the thing in its slot: `receive` takes it in, `lose` drops it unheard, and `replace` gives the slot a new instance of it. */
export type SlotFate = 'receive' | 'lose' | 'replace'

/** The listing a storable is made in, as it sees it: its own kind of thing, whatever snapshot the concrete class makes. */
export type ListingOf<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>> =
  Listing<ScopeT, RecordT, SparseT, unknown, Storable<ScopeT, RecordT, SparseT, unknown>>
// --

// == [The vault's forms]: VaultFormat, vaultRecord, vaultSparse, vaultRow, VaultRecord, VaultSparse, VaultSnapshot

/** The vault format these forms describe, as each record carries it in `fmt`. */
export const { VaultFormat } = VS

/** SLOPDOC: The checks of a vault's stored forms, sparse and with its gate, from a record or a vault ducking as one. */
export const { vaultRecord, vaultSparse, vaultRow } = Checkers('bad_record', () => ({ vaultRecord: VS.vaultRecord, vaultSparse: VS.vaultSparse, vaultRow: VS.vaultRow }))

export type VaultSparse = Z.infer<typeof vaultSparse>
export type VaultRecord = Z.infer<typeof vaultRecord>

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

// == [The vault's world]: deviceDBDuck, vaultListingOpts

/** A deviceDB, as far as a duck can tell: the verbs a vault's lease friend binds. */
export const deviceDBDuck = Checker(({ obj, fn }) => obj({ tryPeek: fn(), tryCache: fn(), tryVacate: fn() }), 'bad_option')

/** The check of a vault listing's options past what {@link listingOpts} checks: that its world carries what a vault's gate and lease need. Checks only. */
export const vaultListingOpts = objCheck(({ obj, fn }) => ({
  world: obj({ ...GX.provingWorld.shape, logger: HX.loggerShape, leaseMillis: GX.leaseMillis.optional(), deviceDB: deviceDBDuck, onPanic: fn().optional(), requestCleartext: fn().optional() }),
}), { refuseAs: 'bad_option', extras: 'strip' })
// --

// == [Given to a box listing]: BoxWorld, BoxDna, BoxListingOpts

/** The vault's face to its boxes: a {@link ListingWorld}, the vault's scope, token and demand, and its seal verbs. */
export type BoxWorld = ListingWorld & {
  scope:     VaultScope
  vault_tok: string
  demandUnlocked(): unknown
  sealStampedString(whisperText: string, stamp: CipherCtxRecord): Promise<SealedWhisper>
  unsealStampedString(sealed: SealedWhisper, stamp: CipherCtxRecord): Promise<string>
}

/** SLOPDOC: What a caller hands `create` to make a box: its scope, whisper and sidecar, with no sealed parts. */
export type BoxDna = Omit<Z.input<typeof boxDna>, keyof BoxHalves> & Partial<BoxHalves>

export type BoxListingOpts = ListingOpts & { world: BoxWorld }
// --

// == [Given to a vault listing]: VaultWorld, VaultListingOpts

/** SLOPDOC: The bank, as far as its vaults need it: a {@link ListingWorld} and what a vault's gate and lease need. */
export type VaultWorld = ListingWorld & ProvingWorld & {
  scope:       BankScope
  logger:      VaultLogger
  leaseMillis?: number
  deviceDB:    DeviceDB
  /** Hears a refused erase of the cached lease, and no secret material. */
  onPanic?:    ((refusal: VaultError) => unknown) | undefined
  /** The host's dialog, if the host gave one. */
  requestCleartext?: RequestCleartext | undefined
  /** The horizon of a vault's boxes, by default the vault's own. */
  boxRefreshMillis?: number
}

export type VaultListingOpts = ListingOpts & { world: VaultWorld }
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
  strengthChecker:     GX.strengthChecker.optional(),
  clock:               HX.clockShape.optional(),
  logger:              HX.loggerShape.optional(),
  autolockMinutes:     positiveMinutes.optional(),
  vaultRefreshMinutes: refreshMinutes.optional(),
  boxRefreshMinutes:   refreshMinutes.optional(),
  onBadNews:           fn().optional(),
  onPanic:             fn().optional(),
}), { refuseAs: 'bad_option' }, [FX])
// --

// == [Given to a bank]: BankOpts, BankStage, BankSnapshot

export type BankOpts = {
  applabel:             string
  user_id:              string
  device_id?:           string | undefined
  vaultDB:              VaultDB
  deviceDB:             DeviceDB
  keyDeriver:           KeyDeriver
  requestCleartext?:    RequestCleartext | undefined
  strengthChecker?:     StrengthChecker | undefined
  clock?:               Clock | undefined
  logger?:              VaultLogger | undefined
  autolockMinutes?:     number | undefined
  vaultRefreshMinutes?: number | undefined
  boxRefreshMinutes?:   number | undefined
  onBadNews?:           ((news: VaultError) => unknown) | undefined
  /** Hears a refused erase of a cached lease, and no secret material; without it, the refusal goes to the platform and the vault is vacated. */
  onPanic?:             ((refusal: VaultError) => unknown) | undefined
}

/** `made` until a `hello` answers, and again past a sweep or a vacate; `ready` once one lands; `refused` once one refuses, the snapshot's `err` saying why. */
export type BankStage = 'made' | 'ready' | 'refused'

export type BankSnapshot = BankScope & Readonly<{ stage: BankStage, err: VaultError | null, device_id: string, vaults: readonly VaultSnapshot[] }>
// --
