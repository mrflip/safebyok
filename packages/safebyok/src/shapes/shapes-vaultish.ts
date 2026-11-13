/** The checks and types of the models: record forms, options, listings, boxes, gates, vaults, banks and the device. Imported as `VX`. */

import { omit } from 'es-toolkit'
import type * as Z from 'zod'
import { Checker, Checkers, objCheck } from '../helpers/validator'
import { ForeverMillis, hasModelkind, isBankDB, isDeviceDB, isGuarded } from '../helpers/consts'
import { type VaultError, isVaultError } from '../refusals/errors'
import * as Phrases from '../helpers/phrases'
import type { KeyDeriver } from '../deriver/basederiver'
import type { VaultLogger } from '../helpers/logger'
import type { Bank } from '../models/bank'
import type { Device } from '../models/device'
import type { Listing } from '../models/listing'
import type { Storable } from '../models/storable'
import type { Vault } from '../models/vault'
import type { DeviceDB } from '../storage/device-db'
import type { Outcome } from '../refusals/outcome'
import { type Answer, type BankDB, type GoodAnswer, BankDBVerbnames } from '../storage/bank-db'
import * as EX from './shapes-enums'
import * as CX from './shapes-core'
import { type Sidecar, sidecar, type Whisper, whisper, type BankScope, type Boxscope, type VaultScope } from './shapes-core'
import * as SX from './shapes-storage'
import * as BX from './shapes-bankdb'
import type { AnyGating, AskUser, RequestCleartext } from './shapes-gateish'
import type { StrengthChecker } from '../helpers/passphrase-strength'

// == [Checks]: Checks

/** This module's own checks: `vaultError`, a VaultError from any copy of safebyok. */
const Checks = Checkers('bad_record', ({ custom }) => ({
  vaultError: custom<VaultError>(isVaultError, Phrases.VaultErrorExpected),
}))

// --

// == [Record forms]: storableBase, liveness, tombstone, isTombstone, Liveness, SparseBase, Tombstone, Fetched, Dna

/** The check of what every stored row has: its revision, its times and its `am`. */
export const storableBase = Checker(({ obj }) => obj({ ...SX.revision.shape, ...SX.times.shape, am: SX.am }), 'bad_option')

/** The checks of a record's `am`, and of a tombstone's fields. */
export const { liveness, tombstone } = Checkers('bad_record', ({ obj, lit }) => ({
  liveness:  obj({ am: SX.am }),
  tombstone: storableBase.extend({ am: lit('x') }),
}))

/** Whether a record is alive, damaged or gone: its `am`. */
export type Liveness = Readonly<Z.infer<typeof liveness>>

/** The least a sparse form carries: its scope, revision, times and `am`. */
export type SparseBase<ScopeT> = ScopeT & SX.Revision & SX.Times & Liveness

/** The sparse form of a deleted thing: its sparse props stay, and the user's content is gone. */
export type Tombstone<SparseT> = SparseT & Readonly<{ am: 'x' }>

/** The `val` a storage call delivers: the full record, its sparse form, or its tombstone. */
export type Fetched<RecordT, SparseT> = RecordT | SparseT | Tombstone<SparseT>

/** What a caller hands `listing.create` for a storable: its scope, and any of the record's props.
 * A prop not given may be missing or undefined. Those the factory controls are ignored.
 */
export type Dna<ScopeT, RecordT> = ScopeT & { [Prop in keyof RecordT]?: RecordT[Prop] | undefined }

/** True for a deleted record: its `am` is 'x'. */
export function isTombstone<SparseT extends Liveness>(fetched: SparseT): fetched is Tombstone<SparseT> { return (fetched.am === 'x') }

// --

// == [Options]: Promptly, horizonMillis, maxMillis, timelyOpts, fetchOpts, boxPutOpts, boxCreateOpts, listener, probeAsked, probeOpts, ProbeAsked, ProbeOpts, ProbeStep, ProbeReport, TimelyOpts, FetchOpts, BoxPutOpts, BoxCreateOpts

/** How old, in milliseconds, the gate's record may be before a prompt fetches it again. */
export const Promptly = 2000

/** The checks of the options a storable's verbs take: how fresh the record in hand must be, a get's and a put's policies, and a listener. */
export const { horizonMillis, maxMillis, timelyOpts, fetchOpts, boxPutOpts, boxCreateOpts, listener } = Checkers('bad_option', ({ obj, num, union, lit, orDefault, fn }) => {
  // A caller's Infinity, for never, is kept as ForeverMillis: past the entrypoint, nothing is infinite.
  const horizonMillis = union([num.nonnegative(), lit(Infinity)]).transform((most) => Math.min(most, ForeverMillis))
  const maxMillis     = horizonMillis.optional()
  const timelyOpts    = obj({
    /** How long ago, at most, the record in hand was refreshed from the bankDB; Infinity for no limit. */
    maxMillisSinceRefresh: maxMillis,
    /** How long ago, at most, the parent of the record was refreshed from the bankDB; Infinity for no limit. */
    maxParentMillis:        maxMillis,
  })
  const fetchOpts     = timelyOpts.extend({
    /** Where nothing live is stored:
     * - `'fail'` -- refuse as absent (default)
     * - `'nil'`  -- resolve null
     */
    ifAbsent: orDefault(SX.ifAbsent, 'fail'),
  })
  const boxPutOpts    = timelyOpts.extend({
    /** Where no live box is stored:
     * - `'add'`  -- create it (default)
     * - `'fail'` -- refuse as absent
     */
    ifAbsent:  orDefault(SX.putIfAbsent, 'add'),
    /** Where a live box is stored:
     * - `'repl'` -- replace it (default)
     * - `'fail'` -- refuse `camped`
     * - `'get'`  -- leave it, and return it as stored
     */
    ifPresent: orDefault(SX.ifPresent, 'repl'),
  })
  const boxCreateOpts = timelyOpts.extend({
    /** Always `add`: a create creates. */
    ifAbsent:  orDefault(lit('add'), 'add'),
    /** Where a live box is stored: `'fail'` (default) refuses `camped`. `'repl'` and `'get'` are as a put's. */
    ifPresent: orDefault(SX.ifPresent, 'fail'),
  })
  const listener      = fn<() => void>()
  return { horizonMillis, maxMillis, timelyOpts, fetchOpts, boxPutOpts, boxCreateOpts, listener }
})

/** The checks of what `bank.tryProbe` is handed: where its trial box goes and what it holds, and how fresh its record must be. */
export const { probeAsked, probeOpts } = Checkers('bad_option', ({ obj, vaultlabel, boxlabel }) => ({
  probeAsked: obj({
    vaultlabel: vaultlabel.default('home'),
    boxlabel:   boxlabel.default('box1'),
    whisper:    CX.whisper.default({ note: 'Shhh, this is a whisper' }),
    sidecar:    CX.sidecar.default({ example: true }),
  }),
  probeOpts: obj({
    /** How long ago, at most, the trial's vault and box were refreshed from the bankDB, whatever the device's refresh settings. */
    maxMillisSinceRefresh: horizonMillis.default(1000),
    /** How fresh the box fetched back after the put must be: 0 (default) asks storage, and more lets the listing answer from the box the put left. */
    maxMillisAtGetBack:    horizonMillis.default(0),
  }),
}))

/** Where `bank.tryProbe` puts its trial box and what it holds, each with a default. */
export type ProbeAsked = Z.input<typeof probeAsked>
/** How fresh `bank.tryProbe` needs its trial's vault and box. */
export type ProbeOpts = Z.input<typeof probeOpts>

/** One storage verb's answer as `bank.tryProbe` reports it: sparse rows, no wrapped key or ciphertext, and when it came back. */
export type ProbeStep = Readonly<{ ok: true, act: EX.GoodAct, ask: BX.LoggableAsk, val: BX.BoxSparse, parent: BX.VaultRow, timestamp: number }>

/** How `bank.tryProbe` went, step by step: the box and vault as found, the put, the fetch back, and that the box opened. */
export type ProbeReport = Readonly<{
  timely: Readonly<{ box: BX.BoxSparse | null, vault: BX.VaultSparse, boxRefreshedAt: number | null, vaultRefreshedAt: number | null, timestamp: number }>
  put:    ProbeStep
  fetch:  ProbeStep
  unseal: Readonly<{ ok: true, timestamp: number }>
}>

/** How fresh the record in hand and its parent must be before a verb goes on. */
export type TimelyOpts = Z.infer<typeof timelyOpts>

/** The options of a get (`listing.get`, `vault.getBox`), as a caller hands them in, defaults unapplied. */
export type FetchOpts = Z.input<typeof fetchOpts>

/** `box.put`'s options, as a caller hands them in, defaults unapplied. By default a put creates or replaces. */
export type BoxPutOpts = Z.input<typeof boxPutOpts>

/** `create`'s options, as a caller hands them in, defaults unapplied. */
export type BoxCreateOpts = Z.input<typeof boxCreateOpts>

// --

// == [A listing's options]: ListingOpts, BankListingOpts, answersEachVerb, brandedBankDB, listingOpts, bankListingOpts, listedUnder

/** The options a listing is made with, besides the thing it is made under. */
export type ListingOpts = {
  bankDB:                BankDB
  /** The refresh horizon of each thing the listing makes: how long after its last refresh the record in hand stays timely. */
  maxMillisSinceRefresh: number
}

/** The options a bank listing is made with, besides its device: a listing's, and the host's dialog, which it hands each bank it makes. */
export type BankListingOpts = ListingOpts & {
  /** Show the host's dialog, wrapped by `guardRequestCleartext`; null with none. */
  askUser: AskUser | null
}

/** True for an object answering each of {@link BankDBVerbnames} with a function. */
function answersEachVerb(val: object): boolean {
  return BankDBVerbnames.every((verbname) => typeof (val as Partial<Record<string, unknown>>)[verbname] === 'function')
}

/** The check of a bankDB handed to a model: branded by any copy of safebyok, with a function for each verb. */
export const brandedBankDB = Checker(({ custom }) => custom<BankDB>((val) => isBankDB(val) && answersEachVerb(val), Phrases.BankDBExpected), 'bad_option')

/** The check of a listing's options. Checks only. */
export const listingOpts = objCheck(() => ({
  bankDB:                brandedBankDB,
  maxMillisSinceRefresh: horizonMillis,
}), 'bad_option')

/** The check of a bank listing's options: a listing's, and the host's dialog as `Device.make` wraps it. Checks only. */
export const bankListingOpts = Checker(({ custom }) => listingOpts.extend({
  askUser: custom<AskUser>(isGuarded, Phrases.GuardedExpected).nullable(),
}), 'bad_option')

/** The checks of what a listing is made under: the device for its bank, the bank for its gate and vaults, the vault for its boxes. Checks only. */
export const listedUnder = Checkers('bad_option', ({ custom }) => ({
  device: custom<Device>((val) => hasModelkind(val, 'device'), Phrases.DeviceExpected),
  bank:   custom<Bank>((val) => hasModelkind(val, 'bank'), Phrases.BankExpected),
  vault:  custom<Vault>((val) => hasModelkind(val, 'vault'), Phrases.VaultExpected),
}))

// --

// == [Making a storable]: storableArgs

/** The check of a storable's constructor arguments, as far as the base can tell. Checks only. */
export const storableArgs = objCheck(({ custom }) => ({
  listing: custom<object>((val) => hasModelkind(val, 'bank_listing', 'gate_listing', 'vault_listing', 'box_listing'), Phrases.ListingExpected),
  central: storableBase,
}), 'bad_option')

// --

// == [Given to a listing]: Thing, ListingAnswer, ListingPutAnswer, ListingPutOpts, ListingDelOpts, DelTombstone, ListingOf

/** A thing a listing holds: a bank, gate, vault or box. */
export type Thing<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>> = Storable<ScopeT, RecordT, SparseT, unknown>

/** The answer of a bankDB verb, as a listing delivers it: a record in any form, or null for nothing stored, or a refusal. */
export type ListingAnswer<RecordT, SparseT> = Answer<Fetched<RecordT, SparseT> | null, EX.OkAct, unknown>

/** A put's {@link ListingAnswer}, whose good form always carries a record. */
export type ListingPutAnswer<RecordT, SparseT> = Answer<Fetched<RecordT, SparseT>, EX.OkAct, unknown>

/** A listing put's options besides its record: the row it expects to find, in sparse form, and `ifPresent` and `ifAbsent`, for a live row or none. */
export type ListingPutOpts<SparseT> = Readonly<{ expected: SparseT, ifAbsent: EX.PutIfAbsent, ifPresent: EX.IfPresent }>

/** A listing del's options besides its tombstone: the row it expects to find, in sparse form. */
export type ListingDelOpts<SparseT> = Readonly<{ expected: SparseT }>

/** A listing's answer from `listVaults` or `listBoxes`: the rows listed, and those set aside as damaged. */
export type ListingListAnswer<RecordT, SparseT, DamagedT> = Answer<{ listed: readonly Fetched<RecordT, SparseT>[], damaged_rows: readonly DamagedT[] }, EX.ListAct, unknown>

/** What a listing's `tryGet` answers: the bankDB's own answer where storage was asked, or the act `timely`, with no parent, where the instance listed served it. */
export type ListingGetAnswer<ValT> = ThingAnswer<ValT> | GoodAnswer<ValT, 'timely', null>

/** What a listing's `tryPut` and `tryDel` answer: the bankDB's own answer, with the instance listed as its `val`. */
export type ThingAnswer<ValT> = Answer<ValT, EX.GoodAct, unknown>

/** The tombstone `listing.del` sends the bankDB: at the revision after the row it replaces, with a life token of its own. */
export type DelTombstone<SparseT> = SparseT & Readonly<{ am: 'x' }>


/** The listing a storable is made in, as it sees it: its own kind of thing, whatever snapshot the concrete class makes. */
export type ListingOf<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>> =
  Listing<ScopeT, RecordT, SparseT, unknown, Storable<ScopeT, RecordT, SparseT, unknown>>

// --

// == [The box's forms]: BoxSnapshot

/** A box as a host renders it: its scope, its revision and times, its sidecar, and what it shows. */
export interface BoxSnapshot extends Boxscope {
  /** The token of the revision in hand, new at each put and del. */
  readonly revision_tok:  string
  /** The count of the revision in hand, higher on the later one. */
  readonly revision_seq:  number
  /** When this life of the box began. */
  readonly registered_at: number
  /** When the revision in hand was written; for a box deleted, when it was deleted. */
  readonly written_at:    number
  /** Your app's data beside the whisper, never encrypted, or null until the full record is fetched. */
  readonly sidecar:       Sidecar | null
  /** True when the full record is in hand, false for a box only listed or deleted. */
  readonly isFull:        boolean
  /** True unless the box is deleted or damaged. */
  readonly isPresent:     boolean
  /** True while the box keeps its whisper exposed. */
  readonly isExposed:     boolean
  /** True while `box.veil()` hides the whisper exposed. */
  readonly isVeiled:      boolean
  /** True while the box's bank is locked. */
  readonly isLocked:      boolean
}

// --

// == [What a box is handed]: boxDna, boxPatch, boxExposedPatch, whisperPatch, BoxHalves, BoxPatchParsed, BoxPatch, BoxExposedPatch, BoxPut, BoxDna

/** Both halves of a box, the whisper and the sidecar: what every update of a box names, and what it seals. */
export type BoxHalves = { whisper: Whisper, sidecar: Sidecar }

/** True where a patch names a half of its box. */
const namesAHalf = ({ whisper, sidecar }: { whisper?: unknown, sidecar?: unknown }): boolean => (whisper !== undefined) || (sidecar !== undefined)

/** The checks of what a caller hands `create` (`boxDna`) and `put` (`boxPatch`, and `boxPatchNew` where `ifPresent` is 'fail'). */
export const { boxDna, boxPatch, boxPatchNew } = Checkers('bad_option', ({ lit, oneof, user_id, banklabel, vaultlabel, boxlabel }) => {
  const factory = BX.boxSparse.pick({ fmt: true, am: true, bank_tok: true, vault_tok: true, box_tok: true, revision_tok: true, registered_at: true, written_at: true }).partial()
  const boxDna  = factory.extend({
    user_id, banklabel, vaultlabel, boxlabel,
    whisper: whisper.default({}),
    sidecar: sidecar.default({}),
    whisper_codec:          lit('json_v1').default('json_v1'),
    whisper_schema_version: lit(1).default(1),
  }).strict().transform((dna) => omit(dna, factory.keyof().options))
  const patchFields = BX.boxRecord.omit({ sidecar: true }).partial().extend({ am: oneof(EX.amVals).optional(), whisper: whisper.optional(), sidecar: sidecar.optional() }).strict().refine(namesAHalf, Phrases.PatchNamesNeitherHalf)
  const pickHalves  = ({ whisper, sidecar, user_id, banklabel, vaultlabel, boxlabel }: Z.output<typeof patchFields>) => ({ whisper, sidecar, user_id, banklabel, vaultlabel, boxlabel })
  const boxPatch    = patchFields.transform(pickHalves)
  // A whole record's whisper_ciphered is recycled, so a put told to only create refuses one, before pickHalves drops it.
  const boxPatchNew = patchFields.refine((patch) => ! ('whisper_ciphered' in patch), Phrases.RecordForNewBox).transform(pickHalves)
  return { boxDna, boxPatch, boxPatchNew }
})

/** The check of what `box.putExposed` accepts: a sidecar, if any, and never a whisper. */
export const boxExposedPatch = objCheck(({ sidecar }) => ({ sidecar: sidecar.optional() }), { refusalkind: 'bad_option' }, [CX])

/** A host's patch for `box.putExposed`, which seals the whisper exposed. */
export type BoxExposedPatch = Z.input<typeof boxExposedPatch>

/** The check of what `box.patchWhisper` accepts: a whisper, to merge over the one exposed. */
export const whisperPatch = Checker(() => CX.whisper, 'bad_option')

/** A box's patch as {@link boxPatch} hands it back: the whisper and the sidecar, each undefined where kept, and the scope's fields as given. */
export type BoxPatchParsed = Z.output<typeof boxPatch>

/** A host's patch for `put`: one or both {@link BoxHalves}, the other kept; any other prop of the box's record is ignored. */
export type BoxPatch = Omit<Z.input<typeof boxPatch>, keyof BoxHalves> & { [Prop in keyof BoxHalves]?: BoxHalves[Prop] | undefined }

/** A host's patch for `vault.putBox`: a {@link BoxPatch} under its `boxlabel`. */
export type BoxPut = BoxPatch & { boxlabel: string }

/** What a caller hands `create` for a new box: its scope, whisper and sidecar. */
export type BoxDna = Omit<Z.input<typeof boxDna>, keyof BoxHalves> & Partial<BoxHalves>

// --

// == [The gate's forms]: WayinSnapshot, GateSnapshot

/** A wayin as a gate's snapshot shows it: when it was registered. */
export type WayinSnapshot = Readonly<{ registered_at: number }>

/** A gate as a dialog renders it: its scope, its life and revision, and which wayins it has, by `wayinlabel`. */
export interface GateSnapshot extends CX.GateScope {
  /** The life of the bank the gate is of. */
  readonly bank_tok:      string
  /** The life of the gate, kept by every gate verb. */
  readonly gate_tok:      string
  /** The token of the revision in hand, new at each gate verb. */
  readonly revision_tok:  string
  /** The count of the revision in hand, higher on the later one. */
  readonly revision_seq:  number
  /** When this life of the gate began. */
  readonly registered_at: number
  /** When the revision in hand was written. */
  readonly written_at:    number
  /** Each wayin the gate has: `main`, and `passkey0` where it has one. */
  readonly wayins:        Readonly<{ main: WayinSnapshot, passkey0?: WayinSnapshot }>
}

// --

// == [The vault's forms]: VaultSnapshot

/** A vault as a host renders it: its scope, its life and revision, and whether it is present. */
export interface VaultSnapshot extends VaultScope {
  /** The token of this life of the vault, new when the vault is made again for its scope. */
  readonly vault_tok:     string
  /** The token of the revision in hand, new at each put and del. */
  readonly revision_tok:  string
  /** The count of the revision in hand, higher on the later one. */
  readonly revision_seq:  number
  /** When this life of the vault began. */
  readonly registered_at: number
  /** When the revision in hand was written; for a vault deleted, when it was deleted. */
  readonly written_at:    number
  /** True unless the vault is deleted or damaged. */
  readonly isPresent:     boolean
}

// --

// == [The bank's making]: brandedDeviceDB, bankArgs

/** The check of a deviceDB handed to a model, by its brand: an instance of a class extending DeviceDB, from any copy of safebyok. */
export const brandedDeviceDB = Checker(({ custom }) => custom<DeviceDB>(isDeviceDB, Phrases.DeviceDBExpected), 'bad_option')

/** The check of what a bank is made with, besides its listing's options: its device, and the `device_tok` of this device's row. */
export const bankArgs = objCheck(({ custom, device_tok }) => ({
  device: custom<Device>((val) => hasModelkind(val, 'device'), Phrases.DeviceExpected),
  device_tok,
}), 'bad_option', [CX])

// --

// == [The device]: positiveMinutes, refreshMinutes, deviceOpts, DeviceOpts, vacateStory, VacateStory, BadNews, BadNewsHandler, RevokeSite, DeviceAnnouncement, DeviceEvent, LifecycleHandler, GuardedLifecycleHandler, DeviceStage, DeviceSnapshot, BankSnapshot

/** The checks of a device's durations in minutes: `positiveMinutes` for the autolock, and `refreshMinutes` for a refresh interval, which may be zero. */
export const { positiveMinutes, refreshMinutes } = Checkers('bad_option', ({ num, union, lit }) => ({
  positiveMinutes: union([num.positive(), lit(Infinity)], Phrases.PositiveMinutesShape),
  refreshMinutes:  union([num.nonnegative(), lit(Infinity)], Phrases.MinutesShape),
}))

// The host's functions and logger are checked once, by the guard that wraps each; here they are only named.
/** The check of the options handed to `Device.make`. */
export const deviceOpts = objCheck(({ fn, custom, tuple, lit, user_id, banklabel }) => ({
  user_id,
  banklabel,
  gates:               tuple([lit('main')], Phrases.GatesShape).readonly(),
  bankDB:              brandedBankDB,
  deviceDB:            brandedDeviceDB,
  keyDeriver:          custom<KeyDeriver>(),
  requestCleartext:    custom<RequestCleartext>().optional(),
  strengthChecker:     custom<StrengthChecker>().optional(),
  logger:              custom<VaultLogger>().optional(),
  autolockMinutes:     positiveMinutes.optional(),
  vaultRefreshMinutes: refreshMinutes.optional(),
  boxRefreshMinutes:   refreshMinutes.optional(),
  onBadNews:           fn<BadNewsHandler>().optional(),
  onLifecycle:         fn<LifecycleHandler>().optional(),
}), { refusalkind: 'bad_option' }, [CX])

/** What a host hands `Device.make`: who the bank is for, where it writes, and the functions it calls back. */
export interface DeviceOpts {
  /** The signed-in user's stable, opaque id from your own auth, hashed first if it contains anything sensitive. */
  user_id:              string
  /** Your app's own label, so several apps can share one backend. */
  banklabel:            string
  /** The bank's gates: `['main']`, the only list accepted. */
  gates:                readonly ['main']
  /** The BankDB the bank is synchronized through, from a storage adapter. */
  bankDB:               BankDB
  /** The device database that caches the bank's lease and this device's row. */
  deviceDB:             DeviceDB
  /** What makes a key from a passphrase: `argon2idWebV1Deriver` from `safebyok/browser`, or your own. */
  keyDeriver:           KeyDeriver
  /** Your dialog, called with each gating that needs the user's passphrase or passkey.
   * Left out, each gating waits in the device's snapshot for your own `attempt` or `dismiss`.
   */
  requestCleartext?:    RequestCleartext | undefined
  /** Judges each new passphrase before the bank accepts it. Without one, every new passphrase is too weak (notes/configuration.md). */
  strengthChecker?:     StrengthChecker | undefined
  /** Where the device reports what it has no caller to throw to: the default logger, the console, when left out. */
  logger?:              VaultLogger | undefined
  /** How long an unlock lasts on this device, in minutes, `Infinity` for until locked; 14 days when left out. */
  autolockMinutes?:     number | undefined
  /** How recently a vault's record must have been fetched to be trusted, in minutes; 5 when left out. */
  vaultRefreshMinutes?: number | undefined
  /** How recently a box's record must have been fetched to be trusted, in minutes; 5 when left out. */
  boxRefreshMinutes?:   number | undefined
  /** Hears each refusal no caller waits on, while the device is enabled or being vacated. Left out, the device's logger warns of each. */
  onBadNews?:           BadNewsHandler | undefined
  /** Hears what happened in the device's life, and no secret material, while the device is enabled or being vacated. `DefaultOnLifecycle` when left out. */
  onLifecycle?:         LifecycleHandler | undefined
}

true satisfies Z.core.util.AssertEqual<DeviceOpts, Z.input<typeof deviceOpts>>

/** The check of what `device.vacate` may be told. */
export const vacateStory = objCheck(({ vaultError }) => ({ cause: vaultError.optional() }), 'bad_option', [Checks])

/** What `device.vacate` may be told: the refusal that called for it, which its snapshot then shows. */
export interface VacateStory {
  /** The refusal that called for the vacate; `disabled` when left out. */
  cause?: VaultError | undefined
}

true satisfies Z.core.util.AssertEqual<VacateStory, Z.input<typeof vacateStory>>

/** What `onBadNews` hears: a refusal no caller waits on, and the device it reached. */
export interface BadNews {
  readonly news:   VaultError
  readonly device: Device
}

/** `Device.make`'s `onBadNews`: hears each refusal no caller waits on. */
export type BadNewsHandler = (badnews: BadNews) => unknown

/** The check of what `tellBadNewsTo` is handed: a handler, the device the news reached, and the news. */
export const tellBadNewsToArgs = objCheck(({ fn, custom, arr }) => ({
  onBadNews: fn<BadNewsHandler>(),
  device:    custom<Device>((val) => hasModelkind(val, 'device'), Phrases.DeviceExpected),
  badnews:   arr(custom<VaultError>(isVaultError, Phrases.VaultErrorExpected)),
}), 'bad_option')

/** Where a cached lease outlived its revoke:
 * - `'lock'`      -- the bank's lock
 * - `'tombstone'` -- the bank found deleted, or of another life
 * - `'vacate'`    -- the device's vacate
 * - `'undeleted'` -- a cached row of another gate revision or bank life, met at an unlock
 */
export type RevokeSite = 'lock' | 'tombstone' | 'vacate' | 'undeleted'

/** What the device, its bank and their listings announce: a {@link DeviceEvent} without its `device`. */
export type DeviceAnnouncement =
  | { readonly kind: 'lease_revoke_failed', readonly refusal: VaultError, readonly bank: Bank | null, readonly where: RevokeSite }
  | { readonly kind: 'vacated', readonly cause: VaultError, readonly unrevoked: number }
  | { readonly kind: 'helloed', readonly outcome: Outcome<void>, readonly vault: Vault | null }

/** What `onLifecycle` hears: what happened in the device's life, told by its `kind`, and the device it happened to. */
export type DeviceEvent = { readonly device: Device } & DeviceAnnouncement

/** `Device.make`'s `onLifecycle`: hears what happened in the device's life, by `kind`: `helloed`, `vacated` or `lease_revoke_failed`. */
export type LifecycleHandler = (event: DeviceEvent) => unknown

/** `onLifecycle` as a device keeps it, wrapped by `guardOnLifecycle`. It never throws. */
export type GuardedLifecycleHandler = (event: DeviceEvent) => Promise<void>

/** How far a device has come:
 * - `'made'`     -- until an `ensureBank` succeeds
 * - `'ready'`    -- once one has
 * - `'disabled'` -- once the device is swept or vacated, its snapshot's `err` saying why
 */
export type DeviceStage = 'made' | 'ready' | 'disabled'

/** A device as a host renders it: its scope, how far its `ensureBank` got, the gating it has open, and which bank it has. */
export interface DeviceSnapshot extends BankScope {
  /** How far the device has come: `made`, `ready` or `disabled`. */
  readonly stage:      DeviceStage
  /** Why the device is disabled, or null. */
  readonly err:        VaultError | null
  /** The gating open on this device, live, for a dialog to answer; null with none. */
  readonly openGating: AnyGating | null
  /** The life of the bank `device.bank` returns; null while it has none. */
  readonly bank_tok:   string | null
}

/** A bank as a host renders it: its scope, the token of this device's row, and whether it is locked. */
export interface BankSnapshot extends BankScope {
  /** The token of this device's row in the deviceDB, as the bank was made with it. */
  readonly device_tok: string
  /** True unless this device has a lease granted and in force. */
  readonly isLocked:   boolean
}

// --
