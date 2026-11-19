/** The checks and types of the gate: its gatings, provings, leases and the host's strength checker. */

import type * as Z from 'zod'
import { Consts, GX, Phrases as BigPhrases, Validator } from 'safebyok-big/internals'
import type { DefaultStrengthChecker, guardStrengthChecker } from '../helpers/passphrase-strength'
import type { Bank } from '../models/bank'
import type { Device } from '../models/device'
import type { Gate } from '../models/gate'
import type { Gating } from '../models/gating'
import type { Lease } from '../models/lease'
import type { guardKeyDeriver } from '../models/proving'
import type { Wayin } from '../models/wayin'
import type { BankScope, BankStamp, GateStamp } from './shapes-stamps'
import { BankChecks, GateChecks } from './shapes-thingkinds'
import { ThingChecks } from './shapes-thing'

// == [The gating's forms]: gatingkindVals, Gatingkind, GatingSnapshot, CleartextsForGatingkind

/** The kinds of gating: what each asks the user to prove, and for what. */
export const gatingkindVals = ['birth_bank'] as const
/** A kind of gating, one of {@link gatingkindVals}. */
export type Gatingkind = typeof gatingkindVals[number]

/** A gating as a host's dialog renders it: its kind, its token and its bank scope. */
export type GatingSnapshot = BankScope & { readonly gatingkind: Gatingkind, readonly gatingTok: string }

/** The cleartexts a dialog hands `attempt`, by kind of gating. */
export interface CleartextsForGatingkind {
  birth_bank: Z.input<typeof GX.bankBuildCleartexts>
}
// --

// == [Given to a gating]: GatingAttempt, RequestCleartext, AskUser, GatingOpts, GatingRecord

/** An attempt's work: prove the user's cleartexts, then make the change its gating is for. */
export type GatingAttempt = (cleartexts: unknown) => Promise<Bank>

/** The host's dialog: show `gating`, and hand what the user types to `gating.attempt`. */
export type RequestCleartext = (gating: Gating) => unknown

/** The host's `requestCleartext`, guarded: it resolves true when the host's dialog returns, and false when it throws. */
export type AskUser = (gating: Gating) => Promise<boolean>

/** The options of {@link Gating.make}, beside its record. */
export interface GatingOpts {
  /** The device the gating opens on. */
  device: Device
  /** The bank the gating is for; null for a `birth_bank` gating, whose bank does not exist yet. */
  bank:    Bank | null
  /** The work each attempt does on the cleartexts it is handed. */
  attempt: GatingAttempt
  /** The host's dialog, guarded, or null to wait for the host's own `attempt` or `dismiss`. */
  askUser: AskUser | null
}

/** A gating's record: its kind. */
export interface GatingRecord<KindT extends Gatingkind = Gatingkind> {
  gatingkind: KindT
}
// --

// == [The gate's forms]: GateDna, GateBank, GateOpts

/** The dna of a new main gate: its stamp, and its wayins. */
export type GateDna = GateStamp & { wayins: { main: Wayin, passkey0: Wayin | null } }

/** The part of its bank a gate uses: its stamp. */
export type GateBank = Pick<Bank, 'stamp'>

/** The options of {@link Gate.make}, beside its record. */
export interface GateOpts {
  /** The bank the gate belongs to. */
  bank: GateBank
}
// --

// == [What a proving is handed]: RawChecks, leaseBank, GateRevisionedStamp, ProvingDevice, GuardedKeyDeriver, ProvingParts, ProvingOpts

/** The checks of what a lease and a proving are handed. */
const RawChecks = Validator.Checkers('bad_record', ({ obj, fn, bool, custom }) => ({
  leaseBank:           obj({ stamp: BankChecks.stamp, lock: fn<() => unknown>(), isEnabled: bool, demandEnabled: fn<() => unknown>() }),
  // A gate's stamp is fixed for its life; the lease pins one revision of the gate too.
  gateRevisionedStamp: GateChecks.stamp.extend(ThingChecks.sparse.pick({ revtok: true }).shape),
  provingDevice:       GX.provingDevice.extend({ strengthChecker: custom<GuardedStrengthChecker>(Consts.isGuarded, BigPhrases.GuardedExpected) }),
}))

/** A {@link GateStamp} with the `revtok` of one revision of the gate: the revision a lease is granted under. */
export type GateRevisionedStamp = Z.infer<typeof GateishChecks.gateRevisionedStamp>

/** What a proving is given of its device: the wrapped key deriver and strength checker, and the device's token. */
export type ProvingDevice = Z.infer<typeof GateishChecks.provingDevice>

/** The host's key deriver, wrapped by {@link guardKeyDeriver}. */
export type GuardedKeyDeriver = ProvingDevice['keyDeriver']

/** The parts of a proving: the stamps its wayin is bound to, the wayin's header, and the stored wayin it proves, if any. */
export interface ProvingParts<HeaderT extends GX.WayinHeader> {
  bankStamp: BankStamp
  gateStamp: GateStamp
  header:    HeaderT
  /** The stored wayin this proving proves, or null for a new wayin, which `buildWayin` makes. */
  stored:    Wayin | null
}

/** The options of a proving's `make`, beside its parts. */
export interface ProvingOpts {
  /** The key the proving wraps and unwraps the bankKey under: non-extractable. */
  wayinKey: CryptoKey
}
// --

// == [What a lease is handed]: LeaseBank, SecretFieldname, LeaseOpts

/** The part of its bank a lease uses: its stamp, its `lock` (called when the bankKey will not unwrap), and whether its device is enabled. */
export type LeaseBank = Pick<Bank, 'stamp' | 'lock' | 'isEnabled' | 'demandEnabled'>

/** A field that holds a cleartext or a sealed part: `whisper`, or any name ending `_sealed`. */
export type SecretFieldname = 'whisper' | `${string}_sealed`

/** The options of {@link Lease.make}, beside its record. */
export interface LeaseOpts {
  /** The bank the lease is granted to. */
  bank: LeaseBank
}
// --

// == [Strength]: StrengthChecker, GuardedStrengthChecker, StrengthChecks, GateishChecks

/** `Device.make`'s `strengthChecker`: judges whether a new passphrase is strong enough, returning a {@link GX.PassphraseVerdict}.
 * It is given the passphrase as typed, and the bank's scope, `{ userid, banklabel }`: words a guesser who knows the user tries first.
 * It runs on each new passphrase before any key is derived: the one a `birth_bank` gating births the bank
 * with. It never hears a blank passphrase, which is judged weak without it. It should not throw: one that
 * throws, or returns no verdict, refuses its call.
 *
 * It hears the passphrase in plain text: it should keep nothing, send nothing anywhere, and never quote
 * it, not even in its `reason`, which becomes the refusal's message.
 *
 * A checker that needs something fetched or built first, such as a dictionary, carries it as `load`.
 * Make the checker once, before any device, and pass the same one to each. Make `load` cost nothing once
 * it has succeeded, and forget a failure.
 *
 * `safebyok-big/browser` ships `zxcvbnStrengthChecker`, or pass your own (notes/configuration.md). To judge as
 * the user types, call `gating.judgeStrength(typed)`. With no checker, every new passphrase is judged weak
 * ({@link DefaultStrengthChecker}).
 *
 * @example
 *   const strengthChecker = (typed: string) => (typed.length < 20 ? { strong: false, reason: 'Twenty characters or more, please.' } : { strong: true })
 * @example
 *   const strengthChecker = Object.assign((typed: string) => judge(typed), { load: () => loadWordList() })
 */
export type StrengthChecker = {
  (passphrase: string, scope: BankScope): GX.PassphraseVerdict | Promise<GX.PassphraseVerdict>
  /** Fetch or build what the checker needs before it can judge. */
  load?: (() => void | Promise<void>) | undefined
}

/** The host's strength checker as a device keeps it, wrapped by {@link guardStrengthChecker}. */
export type GuardedStrengthChecker = {
  (passphrase: string, scope: BankScope): Promise<GX.PassphraseVerdict>
  readonly load: () => Promise<void>
}

/** The check of a host's {@link StrengthChecker}. */
const StrengthChecks = Validator.Checkers('bad_record', ({ custom }) => ({
  strengthChecker: custom<StrengthChecker>(GX.isStrengthChecker, BigPhrases.StrengthCheckerShape),
}))

/** The checks of a {@link GateRevisionedStamp}, a {@link ProvingDevice}, a {@link LeaseBank} and a host's {@link StrengthChecker}.
 * Also `gatingkindVals`, the kinds of gating.
 */
export const GateishChecks = Object.freeze({ ...RawChecks, ...StrengthChecks, gatingkindVals })
// --
