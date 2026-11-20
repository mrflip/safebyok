/** The checks and types of the gate: the form verbs' cleartexts, provings, leases and the host's strength checker. */

import type * as Z from 'zod'
import { NEVER } from 'zod'
import { Consts, GX, Phrases as BigPhrases, Validator } from 'safebyok-big/internals'
import type { cloak } from '../helpers/cloak'
import type { DefaultStrengthChecker, guardStrengthChecker } from '../helpers/passphrase-strength'
import type { Bank } from '../models/bank'
import type { Gate } from '../models/gate'
import type { Lease } from '../models/lease'
import type { Proving, guardKeyDeriver } from '../models/proving'
import type { Wayin } from '../models/wayin'
import type { BankScope, BankStamp, GateStamp } from './shapes-stamps'
import { BankChecks, GateChecks } from './shapes-thingkinds'
import { type GateRecord, ThingChecks } from './shapes-thing'
import type { PutAskDraft } from './shapes-asks'
import type { BankMakeRecord } from './shapes-bankish'

// == [The form verbs' cleartexts]: CleartextChecks, BirthCleartexts, UnlockCleartexts, PassphraseReplaceCleartexts, PasskeyAddCleartexts, PasskeyRevokeCleartexts, ProvedCleartexts, CloakCleartexts

// A gate change's proof is named as an unlock's, `passphraseClear` or `passkeyClear`, and what it puts in place is named `next…`.
/** The checks of what {@link Bank.birth}, {@link Bank.unlock}, {@link Bank.replacePassphrase}, {@link Bank.addPasskey}, {@link Bank.revokePasskey} and {@link cloak} are handed.
 * A cleartext is only ever checked in its gating (models/gating.ts): the cloak's check judges none.
 */
export const CleartextChecks = Validator.Checkers('bad_record', ({ obj, unk }) => {
  const proof = { passphraseClear: GX.passphraseCleartext.optional(), passkeyClear: GX.passkeyAnswer.nullable().optional() }
  return {
    // The cloak checks only that it knows each field: each verb checks the fields it takes.
    cloakArgs:         obj({ passphraseClear: unk.optional(), passkeyClear: unk.optional(), nextPassphraseClear: unk.optional(), nextPasskeyClear: unk.optional() }).strict(),
    birth:             GX.bankBuildCleartexts,
    unlock:            GX.bankUnlockCleartexts,
    passphraseReplace: obj({ ...proof, nextPassphraseClear: GX.passphraseCleartext }).strict().transform(({ nextPassphraseClear, ...given }, ctx) => ({ proof: oneProofOf(given, ctx), nextPassphraseClear })),
    passkeyAdd:        obj({ passphraseClear: GX.passphraseCleartext, nextPasskeyClear: GX.freshPasskeyAnswer }).strict(),
    passkeyRevoke:     obj(proof).strict().transform((given, ctx) => oneProofOf(given, ctx)),
  }
})

/** The one proof among `given`: its passphrase where it has one, else its passkey answer. Neither is an issue on `ctx`. */
function oneProofOf({ passphraseClear, passkeyClear }: { passphraseClear?: GX.PassphraseCleartext | undefined, passkeyClear?: GX.PasskeyAnswer | null | undefined }, ctx: Z.RefinementCtx): ProvedCleartexts {
  if (passphraseClear !== undefined) { return { passphraseClear } }
  if (passkeyClear) { return { passkeyClear } }
  ctx.addIssue({ code: 'custom', message: BigPhrases.CleartextMissing })
  return NEVER
}

/** What {@link Bank.birth} is handed: the new passphrase, and a new passkey's answer or none. */
export type BirthCleartexts = Z.input<typeof CleartextChecks.birth>

/** What {@link Bank.unlock} is handed: the passphrase, or the passkey's answer. Given both, the passphrase is tried. */
export type UnlockCleartexts = Z.input<typeof CleartextChecks.unlock>

/** What {@link Bank.replacePassphrase} is handed: the proof, by the passphrase or the passkey's answer, and the new passphrase. */
export type PassphraseReplaceCleartexts = Z.input<typeof CleartextChecks.passphraseReplace>

/** What {@link Bank.addPasskey} is handed: the passphrase, and the new passkey's answer. */
export type PasskeyAddCleartexts = Z.input<typeof CleartextChecks.passkeyAdd>

/** What {@link Bank.revokePasskey} is handed: the proof, by the passphrase or the passkey's answer. */
export type PasskeyRevokeCleartexts = Z.input<typeof CleartextChecks.passkeyRevoke>

/** What {@link cloak} adopts: the cleartexts of a form verb, any of whose fields it takes. */
export type CloakCleartexts = Partial<BirthCleartexts & UnlockCleartexts & PassphraseReplaceCleartexts & PasskeyAddCleartexts & PasskeyRevokeCleartexts>

/** One proof of a gate's way in, once checked: the passphrase, or the passkey's answer. */
export type ProvedCleartexts = { passphraseClear: GX.PassphraseCleartext, passkeyClear?: never } | { passkeyClear: GX.PasskeyAnswer, passphraseClear?: never }
// --

// == [Given to a gating]: BirthGatingFriend, BankGatingFriend

/** The bank's private birth, for {@link Bank.birth}'s gating to call. Internal. */
export interface BirthGatingFriend {
  /** Write the bank of `record`, and resolve it unlocked under a lease `proving` builds. */
  birth: (record: BankMakeRecord, proving: Proving) => Promise<Bank>
}

/** A bank's private verbs, for its form verbs' gatings to call. Internal. */
export interface BankGatingFriend {
  /** Unlock the bank under a lease `proved` builds, citing its main gate. */
  unlockByProving: (proved: Proving) => Promise<Bank>
  /** Write the main gate's next revision, and hold the gate written as the bank's main gate. */
  putGate:         (ask: PutAskDraft<GateRecord>) => Promise<Gate>
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
 * It runs on each new passphrase before any key is derived: the one `Bank.birth` births the bank with, and the one
 * `bank.replacePassphrase` puts in place. It never hears a blank passphrase, which is judged weak without it. It should not throw: one that
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

/** The host's strength checker as a device keeps it, wrapped by {@link guardStrengthChecker}. */
export type GuardedStrengthChecker = {
  (passphrase: string, scope: BankScope): Promise<GX.PassphraseVerdict>
  readonly load: () => Promise<void>
}

/** The check of a host's {@link StrengthChecker}. */
const StrengthChecks = Validator.Checkers('bad_record', ({ custom }) => ({
  strengthChecker: custom<StrengthChecker>(GX.isStrengthChecker, BigPhrases.StrengthCheckerShape),
}))

/** The checks of a {@link GateRevisionedStamp}, a {@link ProvingDevice}, a {@link LeaseBank} and a host's {@link StrengthChecker}. */
export const GateishChecks = Object.freeze({ ...RawChecks, ...StrengthChecks })
// --
