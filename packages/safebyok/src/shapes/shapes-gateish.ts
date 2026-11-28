/** The checks and types of the gate: the form verbs' cleartexts, provings, leases and the host's strength checker. */

import type * as Z from 'zod'
import { NEVER } from 'zod'
import { Consts, GX, Phrases as BigPhrases, Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import type { DefaultStrengthChecker, guardStrengthChecker } from '../helpers/passphrase-strength'
import type { Bank } from '../models/bank'
import type { Gate } from '../models/gate'
import type { Gating } from '../models/gating'
import type { Lease } from '../models/lease'
import type { Proving, guardKeyDeriver } from '../models/proving'
import type { Wayin } from '../models/wayin'
import type { BankScope, GateLife, GateStamp, LeaseRecord } from './shapes-stamps'
import { GateChecks } from './shapes-thingkinds'
import type { GateRecord, Sparse, Tombstone } from './shapes-thing'
import type { ShellOf } from './shapes-sealers'
import type { PutAskDraft } from './shapes-asks'
import type { WayinHeader } from './shapes-wayin'
import type { Devicetok, Userid } from './primitives'

// == [The form verbs' cleartexts]: CleartextChecks, BirthCleartexts, UnlockCleartexts, ReplacePassphraseCleartexts, AddPasskeyCleartexts, RevokePasskeyCleartexts, ProvedCleartexts, GatingCleartexts

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
    replacePassphrase: obj({ ...proof, nextPassphraseCleartext: GX.passphraseCleartext }).strict().transform(({ nextPassphraseCleartext, ...given }, ctx) => ({ proof: oneProofOf(given, ctx), nextPassphraseCleartext })),
    addPasskey:        obj({ passphraseCleartext: GX.passphraseCleartext, nextPasskeyCleartext: GX.freshPasskeyAnswer }).strict(),
    revokePasskey:     obj(proof).strict().transform(oneProofOf),
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
export type ReplacePassphraseCleartexts = Z.input<typeof CleartextChecks.replacePassphrase>

/** The cleartexts {@link Gate.addPasskey} is handed: the passphrase, and the new passkey's answer. */
export type AddPasskeyCleartexts = Z.input<typeof CleartextChecks.addPasskey>

/** The cleartexts {@link Gate.revokePasskey} is handed: the proof, by the passphrase or the passkey's answer. */
export type RevokePasskeyCleartexts = Z.input<typeof CleartextChecks.revokePasskey>

/** The cleartexts a {@link Gating} adopts: any of the form verbs' fields. */
export type GatingCleartexts = Partial<BirthCleartexts & UnlockCleartexts & ReplacePassphraseCleartexts & AddPasskeyCleartexts>

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

// == [Given to a gating]: BirthGatingFriend, GateGatingFriend, LeaseShellScope, BankGateFriend

/** A bank's lease verbs, for {@link Bank.birth}'s gating to call. Internal. */
export interface BirthGatingFriend {
  /** A lease `proving` builds, granted under the gate's revision `cited`, which it proves: the birth seals its root box under it. */
  leaseByProving: (proving: Proving, cited: GateStamp) => Promise<Lease>
  /** Attach `lease` to the bank, unlocking it, and stow it in the deviceDB. */
  attachLease:    (lease: Lease) => void
}

/** What names a gate's lease shell: the gate's bank scope and labelpath. */
export type LeaseShellScope = Pick<GateLife, 'userid' | 'banklabel' | 'labelpath'>

/** A gate's private verbs, for its form verbs' gatings to call. Internal. */
export interface GateGatingFriend {
  /** Unlock the gate under a lease `proved` builds, citing the revision it models. */
  unlockByProving: (proved: Proving) => Promise<Gate>
  /** Write the gate's next revision, and model the revision written. */
  putGate:         (ask: Omit<PutAskDraft<GateRecord>, 'track' | 'banktok'>) => Promise<Gate>
}

/** A bank's lease verbs, for each gate it makes to call. Internal. */
export interface BankGateFriend {
  /** A view of the bank for a lease granted under the gate's life `gateLife`. */
  leaseGateOf:   (gateLife: GateLife) => LeaseGate
  /** The Thing fields a lease granted under the gate at `gateScope` follows: the lease record the deviceDB has, the bank's lease, or the gate's lease shell. */
  leaseFollowed: (gateScope: LeaseShellScope) => Promise<Sparse<LeaseRecord>>
  /** Attach `lease` in place of the bank's lease, resuming every call waiting for an `unlock` gating, and stow it in the deviceDB. Refuses on a disabled bank. */
  attachLease:   (lease: Lease) => void
}
// --

// == [The gate's forms]: GateDna, GateFound

/** The dna of a new life of a bank's gate: the life, its banktok among it, and its wayins. */
export type GateDna = GateLife & { wayins: { main: Wayin, passkey0: Wayin | null } }

/** A bank's gate as a birth finds it: its tombstone, or its shell where none is stored. */
export type GateFound = Tombstone<GateRecord> | ShellOf<GateRecord>
// --

// == [What a proving is handed]: RawChecks, leaseGate, isWayinKey, ProvingDevice, GuardedKeyDeriver, ProvingParts, ProvingOpts

/** The checks of what a lease and a proving are handed. */
const RawChecks = Validator.Checkers('bad_record', ({ obj, fn, bool, uint, custom }) => ({
  leaseGate:           obj({ gateLife: GateChecks.life, leaseMillis: uint, lock: fn<() => unknown>(), isEnabled: bool, demandEnabled: fn<() => unknown>() }),
  provingDevice:       GX.provingDevice.omit({ device_tok: true }).extend({ strengthChecker: custom<GuardedStrengthChecker>(Consts.isGuarded, BigPhrases.GuardedExpected), ensureDevicetok: fn<(userid: Userid) => Promise<Devicetok>>() }),
  provingOpts:         obj({ wayinKey: custom<CryptoKey>(isWayinKey, Phrases.WayinKeyExpected) }).strict(),
}))

/** True for a wayinKey as a proving derives one: a non-extractable 256-bit AES-GCM CryptoKey for `wrapKey` and `unwrapKey`, and nothing else. */
function isWayinKey(val: unknown): val is CryptoKey {
  return (val instanceof CryptoKey) && (! val.extractable)
    && (val.algorithm.name === 'AES-GCM') && ('length' in val.algorithm) && (val.algorithm.length === 256)
    && (val.usages.length === 2) && val.usages.includes('wrapKey') && val.usages.includes('unwrapKey')
}

/** The parts of its device a proving is given: the wrapped key deriver and strength checker, and what answers the device's token. */
export type ProvingDevice = Z.infer<typeof GateishChecks.provingDevice>

/** The host's key deriver, wrapped by {@link guardKeyDeriver}. */
export type GuardedKeyDeriver = ProvingDevice['keyDeriver']

/** The parts of a proving: the life of the gate its wayin's stamp takes, the wayin's header, and the stored wayin it proves, if any. */
export interface ProvingParts<HeaderT extends WayinHeader> {
  gateLife:  GateLife
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

/** A view of the bank a lease is granted in: its gate's life, how long a lease lasts, whether it is enabled, and its `lock` (called when the bankKey will not unwrap) and `demandEnabled`. */
export interface LeaseGate {
  /** The life of the gate the lease was granted under, fixed for the lease's life. */
  readonly gateLife: GateLife
  /** How long a lease granted in the bank lasts, in milliseconds. */
  readonly leaseMillis: number
  /** True until the bank's device ends. */
  readonly isEnabled: boolean
  /** Lock the bank, dropping its lease. */
  lock:          () => void
  /** Throw unless the bank is enabled. */
  demandEnabled: () => void
}

/** A field that contains a cleartext or a sealed part: `whisper`, or any name ending `_sealed`. */
export type SecretFieldname = 'whisper' | `${string}_sealed`

/** The options of {@link Lease.make}, beside its record. */
export interface LeaseOpts {
  /** The bank the lease is granted in, as the lease reads it back. */
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

/** The checks of a {@link ProvingDevice}, a proving's {@link ProvingOpts}, a {@link LeaseGate} and a host's {@link StrengthChecker}. */
export const GateishChecks = Object.freeze({ ...RawChecks, ...StrengthChecks })
// --
