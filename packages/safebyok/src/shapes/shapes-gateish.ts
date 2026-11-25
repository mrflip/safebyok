/** The checks and types of the gate: the form verbs' cleartexts, provings, leases and the host's strength checker. */

import type * as Z from 'zod'
import { NEVER } from 'zod'
import { Consts, GX, Phrases as BigPhrases, Validator } from 'safebyok-big/internals'
import type { DefaultStrengthChecker, guardStrengthChecker } from '../helpers/passphrase-strength'
import type { Bank } from '../models/bank'
import type { Device } from '../models/device'
import type { Gate } from '../models/gate'
import type { Gating } from '../models/gating'
import type { Lease } from '../models/lease'
import type { Proving, guardKeyDeriver } from '../models/proving'
import type { Wayin } from '../models/wayin'
import type { BankScope, BankStamp, GateStamp, LeaseStamp } from './shapes-stamps'
import { BankChecks, GateChecks } from './shapes-thingkinds'
import { type GateRecord, type ThingMakeOpts, ThingChecks } from './shapes-thing'
import type { PutAskDraft } from './shapes-asks'
import type { WayinHeader } from './shapes-wayin'

// == [The form verbs' cleartexts]: CleartextChecks, BirthCleartexts, UnlockCleartexts, PassphraseReplaceCleartexts, PasskeyAddCleartexts, PasskeyRevokeCleartexts, ProvedCleartexts, GatingCleartexts

// A gate change's proof is named as an `unlock` gating's, `passphraseCleartext` or `passkeyCleartext`, and what it puts in place is named `next…`.
/** The checks of what {@link Bank.birth}, {@link Gate.unlock}, {@link Gate.replacePassphrase}, {@link Gate.addPasskey}, {@link Gate.revokePasskey} and a {@link Gating} are handed.
 * A cleartext is only ever checked by its gating's body (models/gating.ts): a gating's own check at construction judges none.
 */
export const CleartextChecks = Validator.Checkers('bad_record', ({ obj, unk }) => {
  const proof = { passphraseCleartext: GX.passphraseCleartext.optional(), passkeyCleartext: GX.passkeyAnswer.nullable().optional() }
  return {
    // A gating checks only that it knows each field: each body checks the fields it takes.
    gatingArgs:        obj({ passphraseCleartext: unk.optional(), passkeyCleartext: unk.optional(), nextPassphraseCleartext: unk.optional(), nextPasskeyCleartext: unk.optional() }).strict(),
    birth:             obj({ passphraseCleartext: GX.passphraseCleartext, passkeyCleartext: GX.freshPasskeyAnswer.nullable().optional() }).strict(),
    unlock:            obj(proof).strict().transform(oneProofOf),
    passphraseReplace: obj({ ...proof, nextPassphraseCleartext: GX.passphraseCleartext }).strict().transform(({ nextPassphraseCleartext, ...given }, ctx) => ({ proof: oneProofOf(given, ctx), nextPassphraseCleartext })),
    passkeyAdd:        obj({ passphraseCleartext: GX.passphraseCleartext, nextPasskeyCleartext: GX.freshPasskeyAnswer }).strict(),
    passkeyRevoke:     obj(proof).strict().transform(oneProofOf),
  }
})

/** The one proof among `given`: its passphrase where it has one, else its passkey answer. Neither is an issue on `ctx`. */
function oneProofOf({ passphraseCleartext, passkeyCleartext }: { passphraseCleartext?: GX.PassphraseCleartext | undefined, passkeyCleartext?: GX.PasskeyAnswer | null | undefined }, ctx: Z.RefinementCtx): ProvedCleartexts {
  if (passphraseCleartext !== undefined) { return { passphraseCleartext } }
  if (passkeyCleartext) { return { passkeyCleartext } }
  ctx.addIssue({ code: 'custom', message: BigPhrases.CleartextMissing })
  return NEVER
}

/** The cleartexts {@link Bank.birth} is handed: the new passphrase, and a new passkey's answer or none. */
export type BirthCleartexts = Z.input<typeof CleartextChecks.birth>

/** The cleartexts {@link Gate.unlock} is handed: the passphrase, or the passkey's answer. Given both, the passphrase is tried. */
export type UnlockCleartexts = Z.input<typeof CleartextChecks.unlock>

/** The cleartexts {@link Gate.replacePassphrase} is handed: the proof, by the passphrase or the passkey's answer, and the new passphrase. */
export type PassphraseReplaceCleartexts = Z.input<typeof CleartextChecks.passphraseReplace>

/** The cleartexts {@link Gate.addPasskey} is handed: the passphrase, and the new passkey's answer. */
export type PasskeyAddCleartexts = Z.input<typeof CleartextChecks.passkeyAdd>

/** The cleartexts {@link Gate.revokePasskey} is handed: the proof, by the passphrase or the passkey's answer. */
export type PasskeyRevokeCleartexts = Z.input<typeof CleartextChecks.passkeyRevoke>

/** The cleartexts a {@link Gating} adopts: any of the form verbs' fields. */
export type GatingCleartexts = Partial<BirthCleartexts & UnlockCleartexts & PassphraseReplaceCleartexts & PasskeyAddCleartexts>

/** One proof of a gate's way in, once checked: the passphrase, or the passkey's answer. */
export type ProvedCleartexts = { passphraseCleartext: GX.PassphraseCleartext, passkeyCleartext?: never } | { passkeyCleartext: GX.PasskeyAnswer, passphraseCleartext?: never }
// --

// == [The form verbs' dnas]: GatingChecks, DnaCheck, HandedCleartexts, FormSecretFieldnames, BirthDna, UnlockDna, ReplacePassphraseDna, AddPasskeyDna, RevokePasskeyDna

// A dna keeps a form's fieldnames, and its check renames each into the cleartext its gating's body takes. It judges no
// value, as a gating's own check does not: any field it does not know, a username or a host's own, is ignored.
/** The checks of a form verb's dna, each named for its gating: each answers the cleartexts the gating takes. */
export const GatingChecks = Validator.Checkers('bad_record', ({ obj, unk }) => ({
  birthGating:             obj({ passphrase: unk.optional(), passkeyAnswer: unk.optional() }).loose()
    .transform(({ passphrase, passkeyAnswer }) => ({ passphraseCleartext: passphrase, passkeyCleartext: passkeyAnswer })),
  unlockGating:            obj({ passphrase: unk.optional(), passkeyAnswer: unk.optional() }).loose()
    .transform(({ passphrase, passkeyAnswer }) => ({ passphraseCleartext: passphrase, passkeyCleartext: passkeyAnswer })),
  replacePassphraseGating: obj({ passphrase: unk.optional(), passkeyAnswer: unk.optional(), nextPassphrase: unk.optional() }).loose()
    .transform(({ passphrase, passkeyAnswer, nextPassphrase }) => ({ passphraseCleartext: passphrase, passkeyCleartext: passkeyAnswer, nextPassphraseCleartext: nextPassphrase })),
  addPasskeyGating:        obj({ passphrase: unk.optional(), nextPasskeyAnswer: unk.optional() }).loose()
    .transform(({ passphrase, nextPasskeyAnswer }) => ({ passphraseCleartext: passphrase, nextPasskeyCleartext: nextPasskeyAnswer })),
  revokePasskeyGating:     obj({ passphrase: unk.optional(), passkeyAnswer: unk.optional() }).loose()
    .transform(({ passphrase, passkeyAnswer }) => ({ passphraseCleartext: passphrase, passkeyCleartext: passkeyAnswer })),
  // No gating is made with it: it reads every fieldname above, to clear what was handed to a verb not attempted.
  anyGating:               obj({ passphrase: unk.optional(), passkeyAnswer: unk.optional(), nextPassphrase: unk.optional(), nextPasskeyAnswer: unk.optional() }).loose()
    .transform(({ passphrase, passkeyAnswer, nextPassphrase, nextPasskeyAnswer }) => ({
      passphraseCleartext: passphrase, passkeyCleartext: passkeyAnswer, nextPassphraseCleartext: nextPassphrase, nextPasskeyCleartext: nextPasskeyAnswer,
    })),
}))

/** A form verb's check of its dna, from {@link GatingChecks}: it answers the cleartexts its gating takes, unjudged. */
export type DnaCheck = Readonly<{ parse: (dna: unknown) => HandedCleartexts }>

/** The cleartexts handed to a gating, in the names its body takes, before any is judged. */
export type HandedCleartexts = Partial<Record<keyof GatingCleartexts, unknown>>

/** The fields a form verb takes out of a `FormData`, whichever verb it is: the passphrase, the new passphrase, and the confirmation of either. */
export const FormSecretFieldnames = Object.freeze(['passphrase', 'nextPassphrase', 'confirmation'] as const)

/** What a birth is handed: the new passphrase, a new passkey's answer or none, and the confirmation, which is ignored. */
export type BirthDna = { passphrase: string, passkeyAnswer?: GX.PasskeyAnswer | null | undefined, confirmation?: string | undefined }

/** What an unlock is handed: the passphrase, or the passkey's answer. Given both, the passphrase is tried. */
export type UnlockDna = { passphrase?: string | undefined, passkeyAnswer?: GX.PasskeyAnswer | null | undefined }

/** What a passphrase replacement is handed: the proof, by the passphrase or the passkey's answer, the new passphrase, and its confirmation, which is ignored. */
export type ReplacePassphraseDna = { passphrase?: string | undefined, passkeyAnswer?: GX.PasskeyAnswer | null | undefined, nextPassphrase: string, confirmation?: string | undefined }

/** What adding a passkey is handed: the passphrase, and the new passkey's answer. */
export type AddPasskeyDna = { passphrase: string, nextPasskeyAnswer: GX.PasskeyAnswer }

/** What revoking the passkey is handed: the proof, by the passphrase or the passkey's answer. */
export type RevokePasskeyDna = { passphrase?: string | undefined, passkeyAnswer?: GX.PasskeyAnswer | null | undefined }
// --

// == [Given to a gating]: BirthGatingFriend, GateGatingFriend, WorldGateFriend

/** A world's lease verbs, for {@link Bank.birth}'s gating to call. Internal. */
export interface BirthGatingFriend {
  /** A lease `proving` builds, granted in the world under `bankStamp` and citing `cited`, the gate revision it proves: the birth seals its root box under it. */
  leaseByProving: (proving: Proving, bankStamp: BankStamp, cited: GateRevisionedStamp) => Promise<Lease>
  /** Attach `lease` to the world, unlocking it. */
  attachLease:    (lease: Lease) => void
}

/** A gate's private verbs, for its form verbs' gatings to call. Internal. */
export interface GateGatingFriend {
  /** Unlock the gate under a lease `proved` builds, citing the revision it models. */
  unlockByProving: (proved: Proving) => Promise<Gate>
  /** Write the gate's next revision, and model the revision written. */
  putGate:         (ask: Omit<PutAskDraft<GateRecord>, 'track' | 'banktok'>) => Promise<Gate>
}

/** A world's lease verbs, for each gate it makes to call. Internal. */
export interface WorldGateFriend {
  /** The world as a lease granted under `bankStamp` reads it back. */
  leaseGateOf: (bankStamp: BankStamp) => LeaseGate
  /** The `born_at` of the world's lease, which a renewal keeps, or null while locked. */
  renewal:     () => Pick<LeaseStamp, 'born_at'> | null
  /** Attach `lease` in place of the world's lease, resuming every call waiting for an `unlock` gating. Refuses on a disabled world. */
  attachLease: (lease: Lease) => void
}
// --

// == [The gate's forms]: GateDna, GateOpts

/** The dna of a new main gate: its stamp, and its wayins. */
export type GateDna = GateStamp & { wayins: { main: Wayin, passkey0: Wayin | null } }

/** The options of {@link Gate.make}, beside its record. */
export interface GateOpts extends ThingMakeOpts {
  /** The device the gate's bank is on. */
  device: Device
}
// --

// == [What a proving is handed]: RawChecks, leaseGate, GateRevisionedStamp, ProvingDevice, GuardedKeyDeriver, ProvingParts, ProvingOpts

/** The checks of what a lease and a proving are handed. */
const RawChecks = Validator.Checkers('bad_record', ({ obj, fn, bool, custom }) => ({
  leaseGate:           obj({ bankStamp: BankChecks.stamp, lock: fn<() => unknown>(), isEnabled: bool, demandEnabled: fn<() => unknown>() }),
  // A gate's stamp is fixed for its life; the lease pins one revision of the gate too.
  gateRevisionedStamp: GateChecks.stamp.extend(ThingChecks.sparse.pick({ revtok: true }).shape),
  provingDevice:       GX.provingDevice.extend({ strengthChecker: custom<GuardedStrengthChecker>(Consts.isGuarded, BigPhrases.GuardedExpected) }),
}))

/** A {@link GateStamp} with the `revtok` of one revision of the gate: the revision a lease is granted under. */
export type GateRevisionedStamp = Z.infer<typeof GateishChecks.gateRevisionedStamp>

/** The parts of its device a proving is given: the wrapped key deriver and strength checker, and the device's token. */
export type ProvingDevice = Z.infer<typeof GateishChecks.provingDevice>

/** The host's key deriver, wrapped by {@link guardKeyDeriver}. */
export type GuardedKeyDeriver = ProvingDevice['keyDeriver']

/** The parts of a proving: the stamps its wayin is bound to, the wayin's header, and the stored wayin it proves, if any. */
export interface ProvingParts<HeaderT extends WayinHeader> {
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

// == [What a lease is handed]: LeaseGate, SecretFieldname, LeaseOpts

/** What a lease reads back of the world it is granted in: its bank's stamp, the world's `lock` (called when the bankKey will not unwrap), and whether the world is enabled. */
export interface LeaseGate {
  /** The stamp of the bank the lease was granted under, fixed for the lease's life. */
  readonly bankStamp: BankStamp
  /** True until the world is swept or its device ends. */
  readonly isEnabled: boolean
  /** Lock the world, dropping its lease. */
  lock:          () => void
  /** Throw unless the world is enabled. */
  demandEnabled: () => void
}

/** A field that contains a cleartext or a sealed part: `whisper`, or any name ending `_sealed`. */
export type SecretFieldname = 'whisper' | `${string}_sealed`

/** The options of {@link Lease.make}, beside its record. */
export interface LeaseOpts {
  /** The world the lease is granted in, as the lease reads it back. */
  gate: LeaseGate
}
// --

// == [Strength]: StrengthChecker, GuardedStrengthChecker, StrengthChecks, GateishChecks

/** `Device.make`'s `strengthChecker`: judges whether a new passphrase is strong enough, returning a {@link GX.PassphraseVerdict}.
 * It is given the passphrase as typed, and the bank's scope, `{ userid, banklabel }`: words a guesser who knows the user tries first.
 * It runs on each new passphrase before any key is derived: the one `Bank.birth` births the bank with, and the one
 * `gate.replacePassphrase` puts in place. It is never asked to judge a blank passphrase, which is weak without it. It should not throw: one that
 * throws, or returns no verdict, refuses its call.
 *
 * It is given the passphrase in cleartext: it should retain nothing, send nothing anywhere, and never quote
 * it, not even in its `reason`, which becomes the refusal's message.
 *
 * A checker that needs something fetched or built first, such as a dictionary, carries it as `load`.
 * Make the checker once, before any device, and pass the same one to each. Make `load` cost nothing once
 * it has succeeded, and forget a failure.
 *
 * `safebyok-big/browser` ships `zxcvbnStrengthChecker`, or pass your own (notes/configuration.md). To judge as
 * the user types, call `device.judgeStrength(typed)`. With no checker, every new passphrase is judged weak
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

/** The host's strength checker, wrapped by {@link guardStrengthChecker} for a device. */
export type GuardedStrengthChecker = {
  (passphrase: string, scope: BankScope): Promise<GX.PassphraseVerdict>
  readonly load: () => Promise<void>
}

/** The check of a host's {@link StrengthChecker}. */
const StrengthChecks = Validator.Checkers('bad_record', ({ custom }) => ({
  strengthChecker: custom<StrengthChecker>(GX.isStrengthChecker, BigPhrases.StrengthCheckerShape),
}))

/** The checks of a {@link GateRevisionedStamp}, a {@link ProvingDevice}, a {@link LeaseGate} and a host's {@link StrengthChecker}. */
export const GateishChecks = Object.freeze({ ...RawChecks, ...StrengthChecks })
// --
