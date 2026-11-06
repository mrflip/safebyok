/** The checks and types of what's stored and listed: records, options, listings, boxes, vaults and banks, imported as `VX`. */

import { omit } from 'es-toolkit'
import type * as Z from 'zod'
import { Checker, Checkers, objCheck } from '../helpers/validator'
import { isListing } from '../helpers/consts'
import { type VaultError, isVaultError } from '../refusals/errors'
import * as Phrases from '../helpers/phrases'
import type { CipherCtxRecord } from '../helpers/crypto'
import type { KeyDeriver } from '../deriver/basederiver'
import type { VaultLogger } from '../helpers/logger'
import type { Listing } from '../models/listing'
import type { Storable } from '../models/storable'
import type { DeviceDB } from '../storage/device-db-new'
import type { Answer, VaultDB } from '../storage/vault-db-new'
import * as EX from './shapes-enums'
import * as CX from './shapes-core'
import { type Sidecar, sidecar, type Whisper, whisper, type BankScope, type Boxscope, type VaultScope } from './shapes-core'
import * as SX from './shapes-storage'
import * as GX from './shapes-gateish'
import type { ProvingWorld, RequestCleartext, SealedWhisper, StrengthChecker } from './shapes-gateish'

// == [Checks]: Checks

/** The checks this module makes for itself, passed as `sources` to the validators below: `vaultError`, a VaultError as {@link isVaultError} tells one. */
const Checks = Checkers('bad_record', ({ custom }) => ({
  vaultError: custom<VaultError>(isVaultError, Phrases.VaultErrorExpected),
}))

// --

// == [Record forms]: am, revision, times, liveness, vaulted, sparseBase, tombstone, VoidRevisionSeq, isTombstone, Revision, Times, Liveness, Vaulted, SparseBase, Tombstone, Fetched, Dna

/** SLOPDOC: The checks of what the base knows of any record, from whatever carries it: record, storable or snapshot. */
export const am         = SX.am.refusingAs('bad_record')
export const revision   = SX.revision.refusingAs('bad_record')
export const times      = SX.times.refusingAs('bad_record')
export const vaulted    = SX.vaulted.refusingAs('bad_record')
export const sparseBase = SX.sparseBase.refusingAs('bad_record')

export const { liveness, tombstone } = Checkers('bad_record', ({ obj, oneof }) => ({
  liveness:  obj({ am }),
  tombstone: sparseBase.extend({ am: oneof(EX.tombstoneAmVals) }),
}))

/** A record's revision: its `revision_tok`, minted at each put and del, and its `revision_seq`, higher on the later one. */
export type Revision = SX.Revision

/** When this life of the thing began, and when the record in hand was written; on a tombstone, when it was deleted. */
export type Times = SX.Times

/** Whether a record is alive, damaged or gone: its `am`. */
export type Liveness = Readonly<Z.infer<typeof liveness>>

/** The `vault_tok` of the vault a record lies in, which every storable records and seals; a vault's is its own. */
export type Vaulted = Readonly<Z.infer<typeof vaulted>>

/** The least a sparse form carries: the scope, and what {@link sparseBase} checks, the revision, the times, whether it is alive and the vault it lies in. */
export type SparseBase<ScopeT> = ScopeT & Revision & Times & Liveness & Vaulted

/** SLOPDOC: The sparse form of a thing damaged or gone: its sparse props stay on it, the user's content goes. */
export type Tombstone<SparseT> = SparseT & Readonly<{ am: typeof EX.tombstoneAmVals[number] }>

/** The `val` a storage call delivers: the full record, its sparse form, or its tombstone. {@link sparseBase} checks what the base knows of any of the three. */
export type Fetched<RecordT, SparseT> = RecordT | SparseT | Tombstone<SparseT>

/** The DNA of a storable, what a caller hands `listing.create`: the scope, and any of the record's props, each missing or undefined where not given; those the factory controls are ignored. */
export type Dna<ScopeT, RecordT> = ScopeT & { [Prop in keyof RecordT]?: RecordT[Prop] | undefined }

/** The `revision_seq` of a void row, and of a birth's prior: every populated row holds 0 or more. */
export const { VoidRevisionSeq } = SX

/** True for a record whose `am` says damaged or gone. */
export const isTombstone = <SparseT extends Liveness>(fetched: SparseT): fetched is Tombstone<SparseT> => (fetched.am === 'd' || fetched.am === 'x')

// --

// == [Reconciling]: reconciled, settled, Reconciled, Settled

/** The checks of what reconciling passes: `reconciled`, what `reconcileCentral` hands back; and `settled`, what `settle` and `receive` hand back. Checks only. */
export const { reconciled, settled } = Checkers('unexpected_error', ({ obj, arr, oneof, vaultError }) => ({
  reconciled:    obj({ central: sparseBase, policy: oneof(EX.centralPolicyVals) }),
  settled:       obj({ badnews: arr(vaultError).readonly() }).readonly(),
}), [Checks])

/** Return type of `reconcileCentral`: the central that results, and the policy that chose it. {@link reconciled} checks what the base knows of one. */
export type Reconciled<RecordT, SparseT> = Readonly<{ central: Fetched<RecordT, SparseT>, policy: EX.CentralPolicy }>

/** Return type of `settle` and `receive`: `badnews`, the refusals to tell the host once. */
export type Settled = Z.infer<typeof settled>

// --

// == [Options]: Promptly, ifPresent, ifAbsent, putIfAbsent, horizonMillis, maxMillis, timelyOpts, fetchOpts, boxPutOpts, boxCreateOpts, storableOpts, listener, TimelyOpts, FetchOpts, BoxPutOpts, BoxCreateOpts, StorableOpts

/** How old, in milliseconds, a vault's record may be and still be acted on with no fetch. `ensureTimely(0)` accepts none: it fetches, or joins the fetch under way. */
export const Promptly = 2000

/** SLOPDOC: The checks of the options a storable and its verbs take. */
export const { ifPresent, ifAbsent, putIfAbsent, horizonMillis, maxMillis, timelyOpts, fetchOpts, boxPutOpts, boxCreateOpts, storableOpts, listener } = Checkers('bad_option', ({ obj, num, union, lit, oneof, fn }) => {
  const ifPresent     = oneof(EX.ifPresentVals)
  const ifAbsent      = oneof(EX.ifAbsentVals)
  const putIfAbsent   = oneof(EX.putIfAbsentVals)
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

// == [The listing's world]: world, World, ListingWorld, ListingOpts, vaultDBDuck, listingOpts, putListingOpts, PutListingOpts

/** The check of the world a listing lives in, the vault for boxes and the bank for vaults, as far as the base needs it: an object. */
export const world = objCheck(() => ({}), { refusalkind: 'bad_option', extras: 'strip' })

// Not `Z.infer<typeof world>`: that is `Record<string, never>`, which no `World & {...}` below would admit.
/** The world a listing lives in: the vault for boxes, the bank for vaults. */
export type World = object

/** The world as a listing needs it: its lock, its own timeliness, the taking of the world an answer carries, and where bad news goes. */
export type ListingWorld = World & {
  lockState(): EX.LockState
  ensureTimely(maxMillis?: number): Promise<unknown>
  takeWorld(world: unknown): void
  /** Told bad news nobody asked about. A bank hears it, by way of a vault for its boxes. */
  tellBadNews(badnews: readonly VaultError[]): void
}

/** The options a listing is made with: its world and vaultDB, and the refresh horizon of each thing it makes. */
export type ListingOpts = {
  world:                 ListingWorld
  vaultDB:               VaultDB
  maxMillisSinceRefresh: number
}

/** The check of a vaultDB as a model is handed one: the verbs the listings call. Checks only. */
export const vaultDBDuck = Checker(({ obj, fn }) => obj({ tryGetVault: fn(), tryPutVault: fn(), tryDelVault: fn(), tryListBoxes: fn(), tryGetBox: fn(), tryPutBox: fn(), tryDelBox: fn(), watch: fn() }), 'bad_option')

/** The check of a listing's constructor arguments, as far as the base can tell. Checks only. */
export const listingOpts = objCheck(({ obj, fn }) => ({
  world:                 obj({ lockState: fn(), ensureTimely: fn(), takeWorld: fn(), tellBadNews: fn() }),
  vaultDB:               vaultDBDuck,
  maxMillisSinceRefresh: horizonMillis,
}), 'bad_option')

/** The check of what `listing.put` is told: the revision `prior` it goes over, and how it meets a row absent or live. */
export const putListingOpts = objCheck(() => ({ prior: revision, ifAbsent: putIfAbsent.optional(), ifPresent: ifPresent.optional() }), 'bad_option')

export type PutListingOpts = Z.infer<typeof putListingOpts>

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

// == [The box's forms]: BoxFormat, boxRecord, boxSparse, BoxRecord, BoxSparse, BoxSnapshot

/** The box format these forms describe, as each record carries it in `fmt`. */
export const { BoxFormat } = SX

/** SLOPDOC: The checks of a box's stored forms, full and sparse, from a record or a box ducking as one. */
export const { boxRecord } = SX
export const boxSparse = SX.boxSparse.refusingAs('bad_record')

export type BoxSparse = SX.BoxSparse
export type BoxRecord = SX.BoxRecord

export type BoxSnapshot = Boxscope & Readonly<{
  revision_tok:  string
  revision_seq:  number
  registered_at: number
  written_at:    number
  sidecar:       Sidecar | null
  full:          boolean
  present:       boolean
  exposed:       boolean
  veiled:        boolean
}>

// --

// == [What a box is handed]: boxDna, boxPatch, boxExposedPatch, whisperPatch, BoxHalves, BoxPatchGiven, BoxPatch, BoxExposedPatch, BoxPut, BoxDna

/** Both halves of a box, the whisper and the sidecar: what every update of a box names, and what it seals. */
export type BoxHalves = { whisper: Whisper, sidecar: Sidecar }

/** True where a patch names a half of its box. */
const namesAHalf = ({ whisper, sidecar }: { whisper?: unknown, sidecar?: unknown }): boolean => (whisper !== undefined) || (sidecar !== undefined)

/** The checks of what a caller hands `create` (`boxDna`) and `put` (`boxPatch`). */
export const { boxDna, boxPatch } = Checkers('bad_option', ({ lit, oneof, applabel, user_id, vaultlabel, boxlabel }) => {
  const factory = boxSparse.pick({ fmt: true, am: true, vault_tok: true, box_tok: true, revision_tok: true, registered_at: true, written_at: true }).partial()
  const boxDna  = factory.extend({
    applabel, user_id, vaultlabel, boxlabel,
    whisper: whisper.default({}),
    sidecar: sidecar.default({}),
    whisper_codec:          lit('json_v1').default('json_v1'),
    whisper_schema_version: lit(1).default(1),
  }).strict().transform((dna) => omit(dna, factory.keyof().options))
  const boxPatch = boxRecord.omit({ sidecar: true }).partial().extend({ am: oneof(EX.amVals).optional(), whisper: whisper.optional(), sidecar: sidecar.optional() }).strict().refine(namesAHalf, Phrases.PatchNamesNeitherHalf)
    .transform(({ whisper, sidecar, applabel, user_id, vaultlabel, boxlabel }) => ({ whisper, sidecar, applabel, user_id, vaultlabel, boxlabel }))
  return { boxDna, boxPatch }
})

/** The check of what `box.putExposed` takes: a sidecar, if any, and never a whisper. */
export const boxExposedPatch = objCheck(({ sidecar }) => ({ sidecar: sidecar.optional() }), { refusalkind: 'bad_option' }, [CX])

/** A host's patch for `box.putExposed`, which seals the whisper exposed. */
export type BoxExposedPatch = Z.input<typeof boxExposedPatch>

/** The check of what `box.patchWhisper` takes: a whisper, to merge over the one exposed. */
export const whisperPatch = Checker(() => CX.whisper, 'bad_option')

/** A box's patch as {@link boxPatch} hands it back: the whisper and the sidecar, each undefined where kept, and the scope's fields as given. */
export type BoxPatchGiven = Z.output<typeof boxPatch>

/** A host's patch for `put`: one or both {@link BoxHalves}, the other kept; any other prop of the box's record is ignored. */
export type BoxPatch = Omit<Z.input<typeof boxPatch>, keyof BoxHalves> & { [Prop in keyof BoxHalves]?: BoxHalves[Prop] | undefined }

/** A host's patch for `vault.putBox`: a {@link BoxPatch} under its `boxlabel`. */
export type BoxPut = BoxPatch & { boxlabel: string }

/** SLOPDOC: What a caller hands `create` to make a box: its scope, whisper and sidecar, with no sealed parts. */
export type BoxDna = Omit<Z.input<typeof boxDna>, keyof BoxHalves> & Partial<BoxHalves>

// --

// == [The box's world]: boxListingOpts, BoxWorld, BoxListingOpts

/** The check of a box listing's options, beyond what {@link listingOpts} checks: its world names the vault's scope and its `vault_tok`, and answers the seal verbs. Checks only. */
export const boxListingOpts = objCheck(({ obj, fn, applabel, user_id, vaultlabel, vault_tok }) => ({
  world: obj({ scope: obj({ applabel, user_id, vaultlabel }), vault_tok, subscribe: fn(), sealStampedString: fn(), unsealStampedString: fn() }),
}), { refusalkind: 'bad_option', extras: 'strip' }, [CX])

/** The vault's face to its boxes: a {@link ListingWorld}, the vault's scope, token and demand, and its seal verbs. */
export type BoxWorld = ListingWorld & {
  scope:     VaultScope
  vault_tok: string
  demandUnlocked(): unknown
  subscribe(listener: () => void): () => void
  sealStampedString(whisperText: string, stamp: CipherCtxRecord): Promise<SealedWhisper>
  unsealStampedString(sealed: SealedWhisper, stamp: CipherCtxRecord): Promise<string>
}

export type BoxListingOpts = ListingOpts & { world: BoxWorld }

// --

// == [The vault's forms]: VaultFormat, vaultRecord, vaultSparse, vaultRow, VaultRecord, VaultSparse, VaultSnapshot

/** The vault format these forms describe, as each record carries it in `fmt`. */
export const { VaultFormat } = SX

/** SLOPDOC: The checks of a vault's stored forms, sparse and with its gate, from a record or a vault ducking as one. */
export const { vaultRecord } = SX
export const vaultSparse = SX.vaultSparse.refusingAs('bad_record')
export const vaultRow    = SX.vaultRow.refusingAs('damaged_row')

export type VaultSparse = SX.VaultSparse
export type VaultRecord = SX.VaultRecord

export type VaultSnapshot = VaultScope & Readonly<{
  vault_tok:     string
  revision_tok:  string
  revision_seq:  number
  registered_at: number
  written_at:    number
  present:       boolean
  lockState:     EX.LockState
}>

// --

// == [The vault's world]: deviceDBDuck, vaultListingOpts, VaultWorld, VaultListingOpts

/** A deviceDB, as far as a duck can tell: the verbs a vault's lease friend binds. */
export const deviceDBDuck = Checker(({ obj, fn }) => obj({ tryPeek: fn(), tryCache: fn(), tryVacate: fn() }), 'bad_option')

/** The check of a vault listing's options past what {@link listingOpts} checks: that its world carries what a vault's gate and lease need. Checks only. */
export const vaultListingOpts = objCheck(({ obj, fn }) => ({
  world: obj({ ...GX.provingWorld.shape, logger: CX.loggerShape, leaseMillis: GX.leaseMillis.optional(), deviceDB: deviceDBDuck, onPanic: fn().optional(), requestCleartext: fn() }),
}), { refusalkind: 'bad_option', extras: 'strip' })

/** SLOPDOC: The bank, as far as its vaults need it: a {@link ListingWorld} and what a vault's gate and lease need. */
export type VaultWorld = ListingWorld & ProvingWorld & {
  scope:       BankScope
  logger:      VaultLogger
  leaseMillis?: number
  deviceDB:    DeviceDB
  /** Hears a refused erase of the cached lease, and no secret material. */
  onPanic?:    ((refusal: VaultError) => unknown) | undefined
  /** The host's dialog. */
  requestCleartext: RequestCleartext
  /** The horizon of a vault's boxes, by default the vault's own. */
  boxRefreshMillis?: number
}

export type VaultListingOpts = ListingOpts & { world: VaultWorld }

// --

// == [The bank]: positiveMinutes, refreshMinutes, bankOpts, BankOpts, BankStage, BankSnapshot

export const { positiveMinutes, refreshMinutes } = Checkers('bad_option', ({ num, union, lit }) => ({
  positiveMinutes: union([num.positive(), lit(Infinity)], Phrases.PositiveMinutesShape),
  refreshMinutes:  union([num.nonnegative(), lit(Infinity)], Phrases.MinutesShape),
}))

export const bankOpts = objCheck(({ fn, applabel, user_id, device_id }) => ({
  applabel,
  user_id,
  device_id,
  vaultDB:             vaultDBDuck,
  deviceDB:            deviceDBDuck,
  keyDeriver:          CX.keyDeriverShape,
  requestCleartext:    fn(),
  strengthChecker:     GX.strengthChecker.optional(),
  logger:              CX.loggerShape.optional(),
  autolockMinutes:     positiveMinutes.optional(),
  vaultRefreshMinutes: refreshMinutes.optional(),
  boxRefreshMinutes:   refreshMinutes.optional(),
  onBadNews:           fn().optional(),
  onPanic:             fn().optional(),
}), { refusalkind: 'bad_option' }, [CX])

export type BankOpts = {
  applabel:             string
  user_id:              string
  device_id:            string
  vaultDB:              VaultDB
  deviceDB:             DeviceDB
  keyDeriver:           KeyDeriver
  requestCleartext:     RequestCleartext
  strengthChecker?:     StrengthChecker | undefined
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
