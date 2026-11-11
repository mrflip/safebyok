/** The checks and types of what's stored and listed: records, options, listings, boxes, vaults and banks, imported as `VX`. */

import { omit } from 'es-toolkit'
import type * as Z from 'zod'
import { Checker, Checkers, objCheck } from '../helpers/validator'
import { ForeverMillis, hasModelkind, isDeviceDB, isGuarded, isVaultDB } from '../helpers/consts'
import { type VaultError, isVaultError } from '../refusals/errors'
import * as Phrases from '../helpers/phrases'
import type { KeyDeriver } from '../deriver/basederiver'
import type { VaultLogger } from '../helpers/logger'
import type { Bank } from '../models/bank'
import type { Listing } from '../models/listing'
import type { Storable } from '../models/storable'
import type { Vault } from '../models/vault'
import type { DeviceDB } from '../storage/device-db'
import type { Outcome } from '../refusals/outcome'
import { type Answer, type GoodAnswer, type ListAct, type VaultDB, VaultDBVerbnames } from '../storage/vault-db'
import * as EX from './shapes-enums'
import * as CX from './shapes-core'
import { type Sidecar, sidecar, type Whisper, whisper, type BankScope, type Boxscope, type VaultScope } from './shapes-core'
import * as SX from './shapes-storage'
import * as GX from './shapes-gateish'
import type { AnyGating, AskUser, ProvingWorld, RequestCleartext } from './shapes-gateish'
import type { StrengthChecker } from '../helpers/passphrase-strength'

// == [Checks]: Checks

/** The checks this module makes for itself, passed as `sources` to the validators below: `vaultError`, a VaultError as {@link isVaultError} tells one. */
const Checks = Checkers('bad_record', ({ custom }) => ({
  vaultError: custom<VaultError>(isVaultError, Phrases.VaultErrorExpected),
}))

// --

// == [Record forms]: liveness, tombstone, isTombstone, Liveness, Vaulted, SparseBase, Tombstone, Fetched, Dna

/** The checks of a record's `am`, and of a tombstone's fields. */
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

// == [Reconciling]: reconciled, aligned, Reconciled, Aligned

/** The checks of what reconciling passes: `reconciled`, what `reconcileCentral` hands back; and `aligned`, what `align` and `receive` hand back. Checks only. */
export const { reconciled, aligned } = Checkers('unexpected_error', ({ obj, arr, oneof, vaultError }) => ({
  reconciled:    obj({ central: SX.sparseBase, policy: oneof(EX.centralPolicyVals) }),
  aligned:       obj({ badnews: arr(vaultError).readonly() }).readonly(),
}), [Checks])

/** Return type of `reconcileCentral`: the central that results, and the policy that chose it. {@link reconciled} checks what the base knows of one. */
export type Reconciled<RecordT, SparseT> = Readonly<{ central: Fetched<RecordT, SparseT>, policy: EX.CentralPolicy }>

/** Return type of `align` and `receive`: `badnews`, the refusals to tell the host once. */
export type Aligned = Z.infer<typeof aligned>

// --

// == [Options]: Promptly, ifPresent, ifAbsent, putIfAbsent, horizonMillis, maxMillis, timelyOpts, fetchOpts, boxPutOpts, boxCreateOpts, listener, probeAsked, probeOpts, ProbeAsked, ProbeOpts, ProbeStep, ProbeReport, TimelyOpts, FetchOpts, BoxPutOpts, BoxCreateOpts

/** How old, in milliseconds, a vault's record may be and still be acted on with no fetch. `ensureTimely(0)` accepts none: it fetches, or joins the fetch under way. */
export const Promptly = 2000

/** SLOPDOC: The checks of the options a storable and its verbs accept. */
export const { ifPresent, ifAbsent, putIfAbsent, horizonMillis, maxMillis, timelyOpts, fetchOpts, boxPutOpts, boxCreateOpts, listener } = Checkers('bad_option', ({ obj, num, union, lit, oneof, orDefault, fn }) => {
  const ifPresent     = oneof(EX.ifPresentVals)
  const ifAbsent      = oneof(EX.ifAbsentVals)
  const putIfAbsent   = oneof(EX.putIfAbsentVals)
  // A caller's Infinity, for never, is kept as ForeverMillis: past the entrypoint, nothing is infinite.
  const horizonMillis = union([num.nonnegative(), lit(Infinity)]).transform((most) => Math.min(most, ForeverMillis))
  const maxMillis     = horizonMillis.optional()
  const timelyOpts    = obj({
    /** How long ago, at most, the record in hand was refreshed from the vaultDB; Infinity for no limit. */
    maxMillisSinceRefresh: maxMillis,
    /** How long ago, at most, the world the verb runs in was refreshed; Infinity for no limit. */
    maxWorldMillis:        maxMillis,
  })
  const fetchOpts     = timelyOpts.extend({
    /** What an absent thing does: `fail`, the default, refuses with the listing's absent refusal; `nil` resolves null. */
    ifAbsent: orDefault(ifAbsent, 'fail'),
  })
  const boxPutOpts    = timelyOpts.extend({
    /** What an absent box does: `add`, the default, creates it. */
    ifAbsent:  orDefault(putIfAbsent, 'add'),
    /** What a present box does: `repl`, the default, replaces it. */
    ifPresent: orDefault(ifPresent, 'repl'),
  })
  const boxCreateOpts = timelyOpts.extend({
    /** Always `add`: a create creates. */
    ifAbsent:  orDefault(lit('add'), 'add'),
    /** What a present box does: `fail`, the default, refuses. */
    ifPresent: orDefault(ifPresent, 'fail'),
  })
  const listener      = fn<() => void>()
  return { ifPresent, ifAbsent, putIfAbsent, horizonMillis, maxMillis, timelyOpts, fetchOpts, boxPutOpts, boxCreateOpts, listener }
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
    /** How long ago, at most, the trial's vault and box were refreshed from the vaultDB; apart from the bank's own refresh settings. */
    maxMillisSinceRefresh: horizonMillis.default(1000),
  }),
}))

/** Where `bank.tryProbe` puts its trial box and what it holds, each with a default. */
export type ProbeAsked = Z.input<typeof probeAsked>
/** How fresh `bank.tryProbe` needs its trial's vault and box. */
export type ProbeOpts = Z.input<typeof probeOpts>

/** One storage verb's answer as `bank.tryProbe` reports it: sparse rows, no wrapped key or ciphertext, and when it came back. */
export type ProbeStep = Readonly<{ ok: true, act: string, req_params: SX.ReqParams, val: SX.BoxSparse, world: SX.VaultSparse, timestamp: number }>

/** How `bank.tryProbe` went, step by step: the box and vault as found, the put, the fetch back, and that the box opened. */
export type ProbeReport = Readonly<{
  timely: Readonly<{ box: SX.BoxSparse | null, vault: SX.VaultSparse, boxRefreshedAt: number | null, vaultRefreshedAt: number | null, timestamp: number }>
  put:    ProbeStep
  fetch:  ProbeStep
  unseal: Readonly<{ ok: true, timestamp: number }>
}>

/** How fresh the record in hand and the world must be before a verb goes on. */
export type TimelyOpts = Z.infer<typeof timelyOpts>

/** `fetch`'s options, as a caller hands them in, defaults unapplied. */
export type FetchOpts = Z.input<typeof fetchOpts>

/** `box.put`'s options, as a caller hands them in, defaults unapplied: an upcreate unless they say otherwise. */
export type BoxPutOpts = Z.input<typeof boxPutOpts>

/** `create`'s options, as a caller hands them in, defaults unapplied. */
export type BoxCreateOpts = Z.input<typeof boxCreateOpts>

// --

// == [The listing's world]: listingWorld, ListingWorld, BankFriend, ListingOpts, answersEachVerb, brandedVaultDB, bankPanic, bankFriend, listingOpts

/** The check of the world a listing lives in, the bank for vaults and the vault for boxes, as far as the base reaches into it. Checks only. */
export const listingWorld = objCheck(({ fn, bool }) => ({ isLocked: bool, ensureTimely: fn(), receiveWorld: fn() }), { refusalkind: 'bad_option', extras: 'strip' })

/** The world a listing lives in, as far as the base reaches into it: the bank for vaults, the vault for boxes. */
export type ListingWorld = Pick<Bank | Vault, 'isLocked' | 'ensureTimely' | 'receiveWorld'>

/** The bank's private calls, handed down to each listing and vault as it is made. */
export interface BankFriend {
  /** Vacate the bank for a revoked identity. */
  readonly panic:       BankPanic
  /** Tell the host's `onLifecycle` what happened, through the bank, which names itself. Never throws. */
  readonly announce:    BankAnnounce
  /** Tell the host's `onBadNews` each news no caller waits on. Never throws. */
  readonly tellBadNews: (badnews: readonly VaultError[]) => void
  /** Show the host's dialog, wrapped by `guardRequestCleartext`; null with none. */
  readonly askUser:     AskUser | null
}

/** The options a listing is made with, after its world. */
export type ListingOpts = {
  vaultDB:               VaultDB
  /** The refresh horizon of each thing the listing makes: how long after its last refresh the record in hand stays timely. */
  maxMillisSinceRefresh: number
  /** The bank's private calls, handed down to the listing as it is made. */
  bankFriend:            BankFriend
}

/** True for an object answering each of {@link VaultDBVerbnames} with a function. */
const answersEachVerb = (val: object): boolean => (
  VaultDBVerbnames.every((verbname) => typeof (val as Partial<Record<string, unknown>>)[verbname] === 'function')
)

/** The check of a vaultDB as a model is handed one: branded, from whichever copy of safebyok, and answering each verb with a function. */
export const brandedVaultDB = Checker(({ custom }) => custom<VaultDB>((val) => isVaultDB(val) && answersEachVerb(val), Phrases.VaultDBExpected), 'bad_option')

/** The check of the bank's panic as a listing or a vault is handed it, by the brand the bank gave it. */
export const bankPanic = Checker(({ custom }) => custom<BankPanic>(isGuarded, Phrases.GuardedExpected), 'bad_option')

/** The check of the bank's private calls as a listing or a vault is handed them, each by the brand the bank gave it. */
export const bankFriend = objCheck(({ custom }) => ({
  panic:       bankPanic,
  announce:    custom<BankAnnounce>(isGuarded, Phrases.GuardedExpected),
  tellBadNews: custom<BankFriend['tellBadNews']>(isGuarded, Phrases.GuardedExpected),
  askUser:     custom<AskUser>(isGuarded, Phrases.GuardedExpected).nullable(),
}), 'bad_option')

/** The check of a listing's options. Checks only. */
export const listingOpts = objCheck(() => ({
  vaultDB:               brandedVaultDB,
  maxMillisSinceRefresh: horizonMillis,
  bankFriend,
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

// == [Given to a listing]: Thing, ListingAnswer, ListingPutAnswer, ListingPutOpts, ListingDelOpts, DelTombstone, SlotFate, ListingOf

/** A vault or box in a listing. */
export type Thing<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>> = Storable<ScopeT, RecordT, SparseT, unknown>

/** The answer of a vaultDB verb, as a listing delivers it: a record in any form, or null for nothing stored, or a refusal. */
export type ListingAnswer<RecordT, SparseT> = Answer<Fetched<RecordT, SparseT> | null, string, unknown>

/** A put's {@link ListingAnswer}, whose good form always carries a record. */
export type ListingPutAnswer<RecordT, SparseT> = Answer<Fetched<RecordT, SparseT>, string, unknown>

/** A listing put's options besides its record: the row it expects to find, in sparse form, and `ifPresent` and `ifAbsent`, for a live row or none. */
export type ListingPutOpts<SparseT> = Readonly<{ expected: SparseT, ifAbsent: EX.PutIfAbsent, ifPresent: EX.IfPresent }>

/** A listing del's options besides its tombstone: the row it expects to find, in sparse form. */
export type ListingDelOpts<SparseT> = Readonly<{ expected: SparseT }>

/** A listing's answer from `listVaults` or `listBoxes`: the rows listed, and those set aside as damaged. */
export type ListingListAnswer<RecordT, SparseT, DamagedT> = Answer<{ listed: readonly Fetched<RecordT, SparseT>[], damaged_rows: readonly DamagedT[] }, ListAct, unknown>

/** What a listing's `tryGet` answers: the vaultDB's own answer where storage was asked, or the act `timely`, with no world, where the instance listed served it. */
export type ListingGetAnswer<ValT> = ThingAnswer<ValT> | GoodAnswer<ValT, 'timely', null>

/** What a listing's `tryPut` and `tryFetch` answer: the vaultDB's own answer, with the instance listed as its `val`. */
export type ThingAnswer<ValT> = Answer<ValT, string, unknown>

/** The tombstone `listing.del` sends the vaultDB: at the revision after the row it replaces, with a life token of its own. */
export type DelTombstone<SparseT> = SparseT & Readonly<{ am: 'x' }>

/** The fate of a record meeting the thing in its slot: `receive` judges it, `lose` drops it unheard, and `replace` gives the slot a new instance of it. */
export type SlotFate = 'receive' | 'lose' | 'replace'

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
  /** Your app's data beside the whisper, never encrypted; null until the full record is fetched. */
  readonly sidecar:       Sidecar | null
  /** True when the full record is in hand, false for a box only listed or deleted. */
  readonly isFull:        boolean
  /** True unless the box is deleted or damaged. */
  readonly isPresent:     boolean
  /** True while the box keeps its whisper exposed. */
  readonly isExposed:     boolean
  /** True while `box.veil()` hides the whisper exposed. */
  readonly isVeiled:      boolean
  /** True while the box's vault is locked. */
  readonly isLocked:      boolean
}

// --

// == [What a box is handed]: boxDna, boxPatch, boxExposedPatch, whisperPatch, BoxHalves, BoxPatchGiven, BoxPatch, BoxExposedPatch, BoxPut, BoxDna

/** Both halves of a box, the whisper and the sidecar: what every update of a box names, and what it seals. */
export type BoxHalves = { whisper: Whisper, sidecar: Sidecar }

/** True where a patch names a half of its box. */
const namesAHalf = ({ whisper, sidecar }: { whisper?: unknown, sidecar?: unknown }): boolean => (whisper !== undefined) || (sidecar !== undefined)

/** The checks of what a caller hands `create` (`boxDna`) and `put` (`boxPatch`, and `boxPatchNew` where `ifPresent` is 'fail'). */
export const { boxDna, boxPatch, boxPatchNew } = Checkers('bad_option', ({ lit, oneof, applabel, user_id, vaultlabel, boxlabel }) => {
  const factory = SX.boxSparse.pick({ fmt: true, am: true, vault_tok: true, box_tok: true, revision_tok: true, registered_at: true, written_at: true }).partial()
  const boxDna  = factory.extend({
    applabel, user_id, vaultlabel, boxlabel,
    whisper: whisper.default({}),
    sidecar: sidecar.default({}),
    whisper_codec:          lit('json_v1').default('json_v1'),
    whisper_schema_version: lit(1).default(1),
  }).strict().transform((dna) => omit(dna, factory.keyof().options))
  const patchFields = SX.boxRecord.omit({ sidecar: true }).partial().extend({ am: oneof(EX.amVals).optional(), whisper: whisper.optional(), sidecar: sidecar.optional() }).strict().refine(namesAHalf, Phrases.PatchNamesNeitherHalf)
  const pickHalves  = ({ whisper, sidecar, applabel, user_id, vaultlabel, boxlabel }: Z.output<typeof patchFields>) => ({ whisper, sidecar, applabel, user_id, vaultlabel, boxlabel })
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
export type BoxPatchGiven = Z.output<typeof boxPatch>

/** A host's patch for `put`: one or both {@link BoxHalves}, the other kept; any other prop of the box's record is ignored. */
export type BoxPatch = Omit<Z.input<typeof boxPatch>, keyof BoxHalves> & { [Prop in keyof BoxHalves]?: BoxHalves[Prop] | undefined }

/** A host's patch for `vault.putBox`: a {@link BoxPatch} under its `boxlabel`. */
export type BoxPut = BoxPatch & { boxlabel: string }

/** SLOPDOC: What a caller hands `create` to make a box: its scope, whisper and sidecar, with no sealed parts. */
export type BoxDna = Omit<Z.input<typeof boxDna>, keyof BoxHalves> & Partial<BoxHalves>

// --

// == [The box's world]: boxWorld, BoxWorld, boxListingOpts, BoxListingOpts

/** The check of a box listing's world past {@link listingWorld}: the vault's `vault_tok`, its demand, and its seal verbs. Checks only. */
export const boxWorld = Checker(({ fn, vault_tok }) => listingWorld.extend({
  vault_tok, subscribe: fn(), sealStampedString: fn(), unsealStampedString: fn(),
}), 'bad_option', [CX])

/** The vault, as far as its boxes reach into it. */
export type BoxWorld = Pick<Vault, keyof ListingWorld | 'vault_tok' | 'subscribe' | 'sealStampedString' | 'unsealStampedString'>

/** The check of a box listing's options: a listing's, and the scope of the vault it lists. Checks only. */
export const boxListingOpts = Checker(({ vaultScope }) => listingOpts.extend({ scope: vaultScope }), 'bad_option', [CX])

/** The options a box listing is made with, after its world: a listing's, and the scope of the vault it lists. */
export type BoxListingOpts = ListingOpts & { scope: VaultScope }

// --

// == [The vault's forms]: VaultSnapshot

/** A vault as a host renders it: its scope, its life and revision, and whether it is locked. */
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
  /** True unless this device has a lease granted and in force. */
  readonly isLocked:      boolean
}

// --

// == [The vault's world]: brandedDeviceDB, vaultWorld, VaultWorld

/** The check of a deviceDB as a model is handed one, by its brand: an instance of a class extending DeviceDB, from whichever copy of safebyok. */
export const brandedDeviceDB = Checker(({ custom }) => custom<DeviceDB>(isDeviceDB, Phrases.DeviceDBExpected), 'bad_option')

/** The check of a vault listing's world past {@link listingWorld}: what a vault's gate, lease and boxes need of the bank. Checks only. */
export const vaultWorld = Checker(({ bankScope }) => listingWorld.extend({
  ...GX.provingWorld.shape, scope: bankScope, logger: GX.guardedLogger, leaseMillis: GX.leaseMillis, deviceDB: brandedDeviceDB, boxRefreshMillis: horizonMillis,
}), 'bad_option', [CX])

/** The bank, as far as its vaults reach into it. */
export type VaultWorld = Pick<Bank, keyof ListingWorld | keyof ProvingWorld | 'scope' | 'logger' | 'leaseMillis' | 'deviceDB' | 'boxRefreshMillis'>

// --

// == [The bank]: positiveMinutes, refreshMinutes, bankOpts, BankOpts, vacateStory, VacateStory, BadNews, BadNewsHandler, RevokeSite, BankAnnouncement, BankEvent, LifecycleHandler, GuardedLifecycleHandler, BankAnnounce, BankPanic, BankStage, BankSnapshot

/** The checks of a bank's durations in minutes: `positiveMinutes` for the autolock, and `refreshMinutes` for a refresh interval, which may be zero. */
export const { positiveMinutes, refreshMinutes } = Checkers('bad_option', ({ num, union, lit }) => ({
  positiveMinutes: union([num.positive(), lit(Infinity)], Phrases.PositiveMinutesShape),
  refreshMinutes:  union([num.nonnegative(), lit(Infinity)], Phrases.MinutesShape),
}))

// The host's functions and logger are checked once, by the guard that wraps each; here they are only named.
/** The check of the options handed to `Bank.make`. */
export const bankOpts = objCheck(({ fn, custom, applabel, user_id, device_id }) => ({
  applabel,
  user_id,
  device_id,
  vaultDB:             brandedVaultDB,
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

/** What a host hands `Bank.make`: who the bank is for, where it writes, and the functions it calls back. */
export interface BankOpts {
  /** Your app's own label, so several apps can share one backend. */
  applabel:             string
  /** The signed-in user's stable, opaque id from your own auth, hashed first if it contains anything sensitive. */
  user_id:              string
  /** Your id for this device, a random UUID you keep per device. */
  device_id:            string
  /** The VaultDB the vaults are synchronized through, from a storage adapter. */
  vaultDB:              VaultDB
  /** The device database that caches each vault's lease. */
  deviceDB:             DeviceDB
  /** What makes a key from a passphrase: `argon2idWebV1Deriver` from `safebyok/browser`, or your own. */
  keyDeriver:           KeyDeriver
  /** Your dialog, called with each gating that needs the user's passphrase or passkey; left out, each gating waits in the bank's snapshot for your own `attempt` or `dismiss`. */
  requestCleartext?:    RequestCleartext | undefined
  /** Judges each new passphrase before a vault accepts it; without one, every new passphrase is too weak (notes/configuration.md). */
  strengthChecker?:     StrengthChecker | undefined
  /** Where the bank says what it has no caller to throw to; the console when left out. */
  logger?:              VaultLogger | undefined
  /** How long an unlock lasts on this device, in minutes, `Infinity` for until locked; 14 days when left out. */
  autolockMinutes?:     number | undefined
  /** How recently a vault's record must have been fetched to be trusted, in minutes; 5 when left out. */
  vaultRefreshMinutes?: number | undefined
  /** How recently a box's record must have been fetched to be trusted, in minutes; 5 when left out. */
  boxRefreshMinutes?:   number | undefined
  /** Hears each refusal no caller waits on while the bank is enabled and in its vacate's forget; else `DefaultOnBadNews`, the bank's logger. */
  onBadNews?:           BadNewsHandler | undefined
  /** Hears what happened in the bank's life, and no secret material, while the bank is enabled and in its vacate's forget; `DefaultOnLifecycle` when left out. */
  onLifecycle?:         LifecycleHandler | undefined
}

true satisfies Z.core.util.AssertEqual<BankOpts, Z.input<typeof bankOpts>>

/** The check of what `bank.vacate` may be told. */
export const vacateStory = objCheck(({ vaultError }) => ({ cause: vaultError.optional() }), 'bad_option', [Checks])

/** What `bank.vacate` may be told: the refusal that called for it, which its snapshot then shows. */
export interface VacateStory {
  /** The refusal that called for the vacate; `disabled` when left out. */
  cause?: VaultError | undefined
}

true satisfies Z.core.util.AssertEqual<VacateStory, Z.input<typeof vacateStory>>

/** What `onBadNews` hears: a refusal no caller waits on, and the bank it reached. */
export interface BadNews {
  readonly news: VaultError
  readonly bank: Bank
}

/** `Bank.make`'s `onBadNews`: hears each refusal no caller waits on. */
export type BadNewsHandler = (badnews: BadNews) => unknown

/** The check of what `tellBadNewsTo` is handed: a handler, the bank the news reached, and the news. */
export const tellBadNewsToInput = objCheck(({ fn, custom, arr }) => ({
  onBadNews: fn<BadNewsHandler>(),
  bank:      custom<Bank>((val) => hasModelkind(val, 'bank'), Phrases.BankExpected),
  badnews:   arr(custom<VaultError>(isVaultError, Phrases.VaultErrorExpected)),
}), 'bad_option')

/** Where a cached lease outlived its revoke: a vault's lock, tombstone or vacate, the bank's vacate, or a row of another epoch or life met at an unlock. */
export type RevokeSite = 'lock' | 'tombstone' | 'vacate' | 'undeleted'

/** What a bank's listings and vaults announce through it: a {@link BankEvent} before the bank names itself. */
export type BankAnnouncement =
  | { readonly kind: 'lease_revoke_failed', readonly refusal: VaultError, readonly vault: Vault | null, readonly where: RevokeSite }
  | { readonly kind: 'vacated', readonly cause: VaultError, readonly unrevoked: number }
  | { readonly kind: 'helloed', readonly outcome: Outcome<void>, readonly vault: Vault | null }

/** What `onLifecycle` hears: what happened in the bank's life, told by its `kind`, and the bank it happened to. */
export type BankEvent = { readonly bank: Bank } & BankAnnouncement

/** `Bank.make`'s `onLifecycle`: hears what happened in the bank's life, as a hello, a vacate or a cached lease that outlived its revoke. */
export type LifecycleHandler = (event: BankEvent) => unknown

/** `onLifecycle` as a bank keeps it, wrapped by `guardOnLifecycle`. Never throws. */
export type GuardedLifecycleHandler = (event: BankEvent) => Promise<void>

/** How a vault or a listing tells the host's `onLifecycle` through its bank: handed to each as it is made. Never throws. */
export type BankAnnounce = (announcement: BankAnnouncement) => void

/** How a listing vacates its bank for a revoked identity: handed to each as it is made. Never throws. */
export type BankPanic = (refusal: VaultError) => void

/** `made` until a `hello` succeeds; `ready` after one does; `disabled` once the bank is swept or vacated, the snapshot's `err` saying why. */
export type BankStage = 'made' | 'ready' | 'disabled'

/** A bank as a host renders it: its scope, how far its `hello` got, its vaults, and the gating it has open. */
export interface BankSnapshot extends BankScope {
  /** How far the bank has come: `made`, `ready` or `disabled`. */
  readonly stage:      BankStage
  /** Why the bank is disabled, or null. */
  readonly err:        VaultError | null
  /** Your id for this device, as `Bank.make` was given it. */
  readonly device_id:  string
  /** A snapshot of each vault the bank lists. */
  readonly vaults:     readonly VaultSnapshot[]
  /** The gating open on this bank, live, for a dialog to answer; null with none. */
  readonly openGating: AnyGating | null
}

// --
