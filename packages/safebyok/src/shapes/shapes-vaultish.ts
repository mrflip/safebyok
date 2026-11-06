/** The checks and types of what's stored and listed: records, options, listings, boxes, vaults and banks, imported as `VX`. */

import { omit } from 'es-toolkit'
import type * as Z from 'zod'
import { Checker, Checkers, objCheck } from '../helpers/validator'
import { ForeverMillis, hasModelkind, isDeviceDB, isGuarded, isVaultDB } from '../helpers/consts'
import { type VaultError, isVaultError } from '../refusals/errors'
import * as Phrases from '../helpers/phrases'
import type { KeyDeriver } from '../deriver/basederiver'
import { type VaultLogger, isGuardedLogger } from '../helpers/logger'
import type { Bank } from '../models/bank'
import type { Listing } from '../models/listing'
import type { Storable } from '../models/storable'
import type { Vault } from '../models/vault'
import type { DeviceDB } from '../storage/device-db-new'
import type { Answer, VaultDB } from '../storage/vault-db-new'
import * as EX from './shapes-enums'
import * as CX from './shapes-core'
import { type Sidecar, sidecar, type Whisper, whisper, type BankScope, type Boxscope, type VaultScope } from './shapes-core'
import * as SX from './shapes-storage'
import * as GX from './shapes-gateish'
import type { AskUser, ProvingWorld, RequestCleartext, StrengthChecker } from './shapes-gateish'

// == [Checks]: Checks

/** The checks this module makes for itself, passed as `sources` to the validators below: `vaultError`, a VaultError as {@link isVaultError} tells one. */
const Checks = Checkers('bad_record', ({ custom }) => ({
  vaultError: custom<VaultError>(isVaultError, Phrases.VaultErrorExpected),
}))

// --

// == [Record forms]: liveness, tombstone, isTombstone, Liveness, Vaulted, SparseBase, Tombstone, Fetched, Dna

export const { liveness, tombstone } = Checkers('bad_record', ({ obj, oneof }) => ({
  liveness:  obj({ am: SX.am }),
  tombstone: SX.sparseBase.extend({ am: oneof(EX.tombstoneAmVals) }),
}))

/** Whether a record is alive, damaged or gone: its `am`. */
export type Liveness = Readonly<Z.infer<typeof liveness>>

/** The `vault_tok` of the vault a record lies in, which every storable records and seals; a vault's is its own. */
export type Vaulted = Readonly<Z.infer<typeof SX.vaulted>>

/** The least a sparse form carries: the scope, and what {@link SX.sparseBase} checks, the revision, the times, whether it is alive and the vault it lies in. */
export type SparseBase<ScopeT> = ScopeT & SX.Revision & SX.Times & Liveness & Vaulted

/** SLOPDOC: The sparse form of a thing damaged or gone: its sparse props stay on it, the user's content goes. */
export type Tombstone<SparseT> = SparseT & Readonly<{ am: typeof EX.tombstoneAmVals[number] }>

/** The `val` a storage call delivers: the full record, its sparse form, or its tombstone. {@link SX.sparseBase} checks what the base knows of any of the three. */
export type Fetched<RecordT, SparseT> = RecordT | SparseT | Tombstone<SparseT>

/** The DNA of a storable, what a caller hands `listing.create`: the scope, and any of the record's props, each missing or undefined where not given; those the factory controls are ignored. */
export type Dna<ScopeT, RecordT> = ScopeT & { [Prop in keyof RecordT]?: RecordT[Prop] | undefined }

/** True for a record whose `am` says damaged or gone. */
export const isTombstone = <SparseT extends Liveness>(fetched: SparseT): fetched is Tombstone<SparseT> => (fetched.am === 'd' || fetched.am === 'x')

// --

// == [Reconciling]: reconciled, settled, Reconciled, Settled

/** The checks of what reconciling passes: `reconciled`, what `reconcileCentral` hands back; and `settled`, what `settle` and `receive` hand back. Checks only. */
export const { reconciled, settled } = Checkers('unexpected_error', ({ obj, arr, oneof, vaultError }) => ({
  reconciled:    obj({ central: SX.sparseBase, policy: oneof(EX.centralPolicyVals) }),
  settled:       obj({ badnews: arr(vaultError).readonly() }).readonly(),
}), [Checks])

/** Return type of `reconcileCentral`: the central that results, and the policy that chose it. {@link reconciled} checks what the base knows of one. */
export type Reconciled<RecordT, SparseT> = Readonly<{ central: Fetched<RecordT, SparseT>, policy: EX.CentralPolicy }>

/** Return type of `settle` and `receive`: `badnews`, the refusals to tell the host once. */
export type Settled = Z.infer<typeof settled>

// --

// == [Options]: Promptly, ifPresent, ifAbsent, putIfAbsent, horizonMillis, maxMillis, timelyOpts, fetchOpts, boxPutOpts, boxCreateOpts, listener, TimelyOpts, FetchOpts, BoxPutOpts, BoxCreateOpts

/** How old, in milliseconds, a vault's record may be and still be acted on with no fetch. `ensureTimely(0)` accepts none: it fetches, or joins the fetch under way. */
export const Promptly = 2000

/** SLOPDOC: The checks of the options a storable and its verbs take. */
export const { ifPresent, ifAbsent, putIfAbsent, horizonMillis, maxMillis, timelyOpts, fetchOpts, boxPutOpts, boxCreateOpts, listener } = Checkers('bad_option', ({ obj, num, union, lit, oneof, fn }) => {
  const ifPresent     = oneof(EX.ifPresentVals)
  const ifAbsent      = oneof(EX.ifAbsentVals)
  const putIfAbsent   = oneof(EX.putIfAbsentVals)
  // A caller's Infinity, for never, is kept as ForeverMillis: past the entrypoint, nothing is infinite.
  const horizonMillis = union([num.nonnegative(), lit(Infinity)]).transform((most) => Math.min(most, ForeverMillis))
  const maxMillis     = horizonMillis.optional()
  const timelyOpts    = obj({ maxMillisSinceRefresh: maxMillis, maxWorldMillis: maxMillis })
  const fetchOpts     = timelyOpts.extend({ ifAbsent: ifAbsent.default('fail') })
  const boxPutOpts    = timelyOpts.extend({ ifAbsent: putIfAbsent.default('add'), ifPresent: ifPresent.default('repl') })
  const boxCreateOpts = timelyOpts.extend({ ifAbsent: lit('add').default('add'), ifPresent: ifPresent.default('fail') })
  const listener      = fn<() => void>()
  return { ifPresent, ifAbsent, putIfAbsent, horizonMillis, maxMillis, timelyOpts, fetchOpts, boxPutOpts, boxCreateOpts, listener }
})

/** How fresh the record in hand and the world must be before a verb goes on. The world heeds `maxWorldMillis`; the record, `maxMillisSinceRefresh`. */
export type TimelyOpts = Z.infer<typeof timelyOpts>

/** `fetch`'s options: its {@link TimelyOpts}, and `ifAbsent`, how it treats a thing that is absent: `fail` by default, with the listing's absent refusal; `nil` resolves null. */
export type FetchOpts = Z.input<typeof fetchOpts>

/** `box.put`'s options: its {@link TimelyOpts}, and an upcreate unless `ifAbsent` or `ifPresent` says otherwise. */
export type BoxPutOpts = Z.input<typeof boxPutOpts>

/** `create`'s options: {@link BoxPutOpts}, with `ifPresent` defaulting to `fail`, and `ifAbsent` always `add`. */
export type BoxCreateOpts = Z.input<typeof boxCreateOpts>

// --

// == [The listing's world]: listingWorld, ListingWorld, ListingOpts, brandedVaultDB, listingOpts

/** The check of the world a listing lives in, the bank for vaults and the vault for boxes, as far as the base reaches into it. Checks only. */
export const listingWorld = objCheck(({ fn }) => ({ lockState: fn(), ensureTimely: fn(), takeWorld: fn(), tellBadNews: fn() }), { refusalkind: 'bad_option', extras: 'strip' })

/** The world a listing lives in, as far as the base reaches into it: the bank for vaults, the vault for boxes. */
export type ListingWorld = Pick<Bank | Vault, 'lockState' | 'ensureTimely' | 'takeWorld' | 'tellBadNews'>

/** The options a listing is made with, after its world. */
export type ListingOpts = {
  vaultDB:               VaultDB
  /** The refresh horizon of each thing the listing makes: how long after its last refresh the record in hand stays timely. */
  maxMillisSinceRefresh: number
}

/** The check of a vaultDB as a model is handed one, by its brand: an instance of a class extending VaultDB, from whichever copy of safebyok. */
export const brandedVaultDB = Checker(({ custom }) => custom<VaultDB>(isVaultDB, Phrases.VaultDBExpected), 'bad_option')

/** The check of a listing's options. Checks only. */
export const listingOpts = objCheck(() => ({
  vaultDB:               brandedVaultDB,
  maxMillisSinceRefresh: horizonMillis,
}), 'bad_option')

// --

// == [Making a storable]: storableArgs

/** The check of a storable's constructor arguments, as far as the base can tell. Checks only. */
export const storableArgs = objCheck(({ custom }) => ({
  world:   listingWorld,
  listing: custom<object>((val) => hasModelkind(val, 'vault_listing', 'box_listing'), Phrases.ListingExpected),
  central: SX.sparseBase,
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

// == [The box's forms]: BoxSnapshot

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
  const factory = SX.boxSparse.pick({ fmt: true, am: true, vault_tok: true, box_tok: true, revision_tok: true, registered_at: true, written_at: true }).partial()
  const boxDna  = factory.extend({
    applabel, user_id, vaultlabel, boxlabel,
    whisper: whisper.default({}),
    sidecar: sidecar.default({}),
    whisper_codec:          lit('json_v1').default('json_v1'),
    whisper_schema_version: lit(1).default(1),
  }).strict().transform((dna) => omit(dna, factory.keyof().options))
  const boxPatch = SX.boxRecord.omit({ sidecar: true }).partial().extend({ am: oneof(EX.amVals).optional(), whisper: whisper.optional(), sidecar: sidecar.optional() }).strict().refine(namesAHalf, Phrases.PatchNamesNeitherHalf)
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

// == [The box's world]: boxWorld, BoxWorld

/** The check of a box listing's world past {@link listingWorld}: the vault's scope and `vault_tok`, its demand, and its seal verbs. Checks only. */
export const boxWorld = Checker(({ fn, vaultScope, vault_tok }) => listingWorld.extend({
  scope: vaultScope, vault_tok, demandUnlocked: fn(), subscribe: fn(), sealStampedString: fn(), unsealStampedString: fn(),
}), 'bad_option', [CX])

/** The vault, as far as its boxes reach into it. */
export type BoxWorld = Pick<Vault, keyof ListingWorld | 'scope' | 'vault_tok' | 'demandUnlocked' | 'subscribe' | 'sealStampedString' | 'unsealStampedString'>

// --

// == [The vault's forms]: VaultSnapshot

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

// == [The vault's world]: brandedDeviceDB, vaultWorld, VaultWorld

/** The check of a deviceDB as a model is handed one, by its brand: an instance of a class extending DeviceDB, from whichever copy of safebyok. */
export const brandedDeviceDB = Checker(({ custom }) => custom<DeviceDB>(isDeviceDB, Phrases.DeviceDBExpected), 'bad_option')

/** The check of a vault listing's world past {@link listingWorld}: what a vault's gate, lease and boxes need of the bank. Checks only. */
export const vaultWorld = Checker(({ custom, bankScope }) => listingWorld.extend({
  ...GX.provingWorld.shape, scope: bankScope, logger: custom<VaultLogger>(isGuardedLogger, Phrases.GuardedLoggerExpected), leaseMillis: GX.leaseMillis, deviceDB: brandedDeviceDB, boxRefreshMillis: horizonMillis,
  askUser: custom<AskUser>(isGuarded, Phrases.GuardedExpected),
  panic:   custom<Panic>(isGuarded, Phrases.GuardedExpected),
}), 'bad_option', [CX])

/** The bank, as far as its vaults reach into it. */
export type VaultWorld = Pick<Bank, keyof ListingWorld | keyof ProvingWorld | 'scope' | 'logger' | 'leaseMillis' | 'deviceDB' | 'askUser' | 'panic' | 'boxRefreshMillis'>

// --

// == [The bank]: positiveMinutes, refreshMinutes, bankOpts, BankOpts, BadNewsHandler, PanicHandler, Panic, BankStage, BankSnapshot

export const { positiveMinutes, refreshMinutes } = Checkers('bad_option', ({ num, union, lit }) => ({
  positiveMinutes: union([num.positive(), lit(Infinity)], Phrases.PositiveMinutesShape),
  refreshMinutes:  union([num.nonnegative(), lit(Infinity)], Phrases.MinutesShape),
}))

// The host's functions and logger are checked once, by the guard that wraps each; here they are only named.
export const bankOpts = objCheck(({ fn, custom, applabel, user_id, device_id }) => ({
  applabel,
  user_id,
  device_id,
  vaultDB:             brandedVaultDB,
  deviceDB:            brandedDeviceDB,
  keyDeriver:          custom<KeyDeriver>(),
  requestCleartext:    custom<RequestCleartext>(),
  strengthChecker:     custom<StrengthChecker>().optional(),
  logger:              custom<VaultLogger>().optional(),
  autolockMinutes:     positiveMinutes.optional(),
  vaultRefreshMinutes: refreshMinutes.optional(),
  boxRefreshMinutes:   refreshMinutes.optional(),
  onBadNews:           fn().optional(),
  onPanic:             custom<PanicHandler>().optional(),
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
  onBadNews?:           BadNewsHandler | undefined
  /** Hears a refused erase of a cached lease, and no secret material; without it, the refusal goes to the platform and the vault is vacated. */
  onPanic?:             PanicHandler | undefined
}

/** `Bank.make`'s `onBadNews`: hears each refusal no caller waits on. */
export type BadNewsHandler = (news: VaultError) => unknown

/** `Bank.make`'s `onPanic`: hears a cached lease that survived its erase. */
export type PanicHandler = (refusal: VaultError) => unknown

/** `onPanic` as a bank keeps it, wrapped by `guardOnPanic`: false when the host gave none. Never throws. */
export type Panic = (refusal: VaultError) => Promise<boolean>

/** `made` until a `hello` answers, and again past a sweep or a vacate; `ready` once one lands; `refused` once one refuses, the snapshot's `err` saying why. */
export type BankStage = 'made' | 'ready' | 'refused'

export type BankSnapshot = BankScope & Readonly<{ stage: BankStage, err: VaultError | null, device_id: string, vaults: readonly VaultSnapshot[] }>

// --
