/** The checks and types of the gate: its wayins, provings, leases and gatings. Imported as `GX`. */

import { NEVER } from 'zod'
import type * as Z from 'zod'
import { Checker, Checkers, objCheck, objStrict, objStrip } from '../helpers/validator'
import type { Outcome } from '../refusals/outcome'
import * as Phrases from '../helpers/phrases'
import { ForeverMillis, PasskeySaltSize, hasModelkind, isGuarded } from '../helpers/consts'
import { type VaultLogger, isGuardedLogger } from '../helpers/logger'
import { type CipherCtxRecord, fromB64OrNull } from '../helpers/crypto'
import type { GuardedStrengthChecker, StrengthChecker } from '../helpers/passphrase-strength'
import type { Gating } from '../models/gating'
import type { GuardedKeyDeriver, NOVEL, Proving } from '../models/proving'
import type { Bank } from '../models/bank'
import type { BankListing } from '../models/bank-listing'
import * as EX from './shapes-enums'
import * as CX from './shapes-core'
import { type BankScope, bankScope } from './shapes-core'
import * as BX from './shapes-bankdb'

// == [Wayin kinds]: wayinkind, isPrfSalt

/** The check of a wayin's kind: one of {@link EX.wayinkindVals}. */
export const wayinkind = Checker(({ oneof }) => oneof(EX.wayinkindVals), 'bad_option')

/** True for base64url text of {@link PasskeySaltSize} bytes, as a passkey wayin's salt must be. */
export function isPrfSalt(prf_salt_b64: string): boolean { return fromB64OrNull(prf_salt_b64)?.length === PasskeySaltSize }
// --

// == [The wayin's forms]: passphraseWayinHeader, passkeyWayinHeader, wayinHeader, wayinRecord, PassphraseWayinHeader, PasskeyWayinHeader, WayinHeader, PassphraseWayinRecord, PasskeyWayinRecord, WayinRecord

/** The checks of a wayin's forms, as a gate row keeps them: a header, which omits the wrapped bankKey, and the full record. */
export const { passphraseWayinHeader, passkeyWayinHeader, wayinHeader, wayinRecord } = Checkers('bad_record', ({ discrim }) => {
  const passphraseWayinHeader = BX.passphraseWayin.omit({ bank_key_wayin_wrapped: true }).strip()
  const passkeyWayinHeader    = BX.passkeyWayin.omit({ bank_key_wayin_wrapped: true }).strip()
  return {
    passphraseWayinHeader,
    passkeyWayinHeader,
    wayinHeader: discrim('wayinkind', [passphraseWayinHeader, passkeyWayinHeader]),
    wayinRecord: discrim('wayinkind', [BX.passphraseWayin, BX.passkeyWayin]),
  }
})

/** A passphrase wayin without its wrapped bankKey. */
export type PassphraseWayinHeader = Z.infer<typeof passphraseWayinHeader>
/** A passkey wayin without its wrapped bankKey. */
export type PasskeyWayinHeader    = Z.infer<typeof passkeyWayinHeader>
/** A wayin without its wrapped bankKey: a tagged union on `wayinkind`. */
export type WayinHeader           = Z.infer<typeof wayinHeader>
/** A passphrase wayin as its gate row stores it, under `main`. */
export type PassphraseWayinRecord = Z.infer<typeof BX.passphraseWayin>
/** A passkey wayin as its gate row stores it, under `passkey0`. */
export type PasskeyWayinRecord    = Z.infer<typeof BX.passkeyWayin>
/** A stored wayin: a tagged union on `wayinkind` of {@link PassphraseWayinRecord} and {@link PasskeyWayinRecord}. */
export type WayinRecord           = Z.infer<typeof wayinRecord>
// --

// == [Cleartexts]: passphraseCleartext, PassphraseCleartext, PrfAnswerSize, passkeyAnswer, PasskeyAnswer, freshPasskeyAnswer

/** The check of a passphrase's cleartext, the text the user typed: any string, blank included. No refusal quotes it.
 * Whether a blank one will do is the gating's call.
 */
export const passphraseCleartext = Checker(({ str }) => str.brand<'PassphraseCleartext'>(), 'bad_option')

/** A passphrase's cleartext once {@link passphraseCleartext} has parsed it: the only text the key deriver is handed. */
export type PassphraseCleartext = Z.infer<typeof passphraseCleartext>

/** The length in bytes of a passkey's PRF answer: always 32, by the WebAuthn PRF extension. */
export const PrfAnswerSize = 32

/** The check of a passkey's answer: its credential's id, the salt it answered for, and its PRF bytes. No refusal quotes it, as its bytes are secret.
 * An answer already used is refused, as the gating that spent it zeroed its bytes: sealed again, it
 * would make a key anyone could rebuild.
 *
 * @example passkeyAnswer.parse(usedAnswer)  // throws: its bytes were zeroed at its first use
 */
export const passkeyAnswer = objCheck(({ str, bytes, credential_id }) => ({
  /** Base64url, as `PublicKeyCredential.id` gives it. */
  credential_id,
  prf_salt_b64:  str.min(1),
  /** 32 bytes, as good as the passphrase for this bank: hand them to the gating, then drop them. */
  prfBytes:      bytes(PrfAnswerSize).refine((prfBytes) => prfBytes.reduce((seen, byte) => seen | byte, 0) !== 0, Phrases.PasskeyAnswerUsed),
}), { refusalkind: 'bad_option', extras: 'strip' }, [CX])

/** A passkey's answer when asked for a vault's PRF: the cleartext a gating accepts for a passkey. `safebyok-react`'s `askPasskey` makes one.
 * An `unlock_bank` gating accepts it as `passkeyClear` in `attempt`, in place of the passphrase.
 * A `build_bank` gating accepts it there beside the passphrase.
 *
 * @example await gating.attempt({ passkeyClear: passkey })   // an unlock_bank gating, by the passkey alone
 */
export type PasskeyAnswer = Z.infer<typeof passkeyAnswer>

/** The check of a new passkey's answer, as `safebyok-react`'s `createPasskey` gives it: a {@link passkeyAnswer} over a fresh salt of {@link PasskeySaltSize} bytes.
 * A passkey wayin sealed over another salt would read as damaged at every later unlock.
 *
 * @example freshPasskeyAnswer.parse({ ...answer, prf_salt_b64: 'c2hvcnQ' })  // throws
 */
export const freshPasskeyAnswer = Checker(() => (
  passkeyAnswer.refine(({ prf_salt_b64: prfSalt }) => isPrfSalt(prfSalt), { error: Phrases.prfSaltShape(PasskeySaltSize), path: ['prf_salt_b64'] })
), 'bad_option')
// --

// == [Strength]: isStrengthChecker, strengthChecker, passphraseVerdict, PassphraseVerdict

/** True for a {@link StrengthChecker}: a function, whose `load`, if it carries one, is a function too. */
const isStrengthChecker = (candidate: unknown): candidate is StrengthChecker => (
  typeof candidate === 'function' && ['undefined', 'function'].includes(typeof (candidate as { load?: unknown }).load)
)

/** The checks of a `strengthChecker` and of the verdict it returns. */
export const { strengthChecker, passphraseVerdict } = Checkers('bad_option', ({ custom, union, obj, lit, str }) => ({
  strengthChecker: custom<StrengthChecker>(isStrengthChecker, Phrases.StrengthCheckerShape),
  passphraseVerdict: union([
    obj({ strong: lit(true) }),
    obj({ strong: lit(false), reason: str.min(1) }),
  ]),
}))

/** A strength checker's verdict on a passphrase: strong enough, or weak with a `reason` for the user.
 * Make the reason calm, say what to do, and never quote the passphrase. A dialog shows it, and the
 * `weak_passphrase` refusal carries it as its message.
 */
export type PassphraseVerdict = Z.infer<typeof passphraseVerdict>
// --

// == [The stamps]: bankStamp, gateStamp, vaultStamp, citedGate, BankStamp, GateStamp, VaultStamp, CitedGate

/** The check of a bank's stamp: its scope, `bank_tok` and `registered_at`, fixed for its life and bound into every ctx under it.
 * Anything carrying those fields passes, such as a bank record, and the rest is dropped.
 */
export const bankStamp = objCheck(({ bankScope, bank_tok, epochMillis }) => ({
  ...bankScope.unwrap().shape,
  bank_tok,
  registered_at: epochMillis,
}), { refusalkind: 'bad_option', extras: 'strip' }, [CX])

/** The check of a gate's stamp: its scope, `gate_tok` and `registered_at`, fixed for its life and bound into the ctx of each of its wayins.
 * Anything carrying those fields passes, such as a Gate or its record, and the rest is dropped.
 */
export const gateStamp = objCheck(({ gateScope, gate_tok, epochMillis }) => ({
  ...gateScope.unwrap().shape,
  gate_tok,
  registered_at: epochMillis,
}), { refusalkind: 'bad_option', extras: 'strip' }, [CX])

/** The check of a vault's stamp: its scope, `vault_tok` and `registered_at`, fixed for its life and bound into every ctx under it.
 * Anything carrying those fields passes, such as a Vault, and the rest is dropped.
 */
export const vaultStamp = objCheck(({ vaultScope, vault_tok, epochMillis }) => ({
  ...vaultScope.unwrap().shape,
  vault_tok,
  registered_at: epochMillis,
}), { refusalkind: 'bad_option', extras: 'strip' }, [CX])

/** The check of what a lease cites of the gate it was granted under: its label, its `gate_tok`, and its row's `revision_tok`.
 * A Gate or its record passes. Every gate verb puts a new `revision_tok`, so a lease citing the old one is forgotten.
 */
export const citedGate = objCheck(({ gateScope, gate_tok, revision_tok }) => ({
  gatelabel: gateScope.unwrap().shape.gatelabel,
  gate_tok,
  revision_tok,
}), { refusalkind: 'bad_option', extras: 'strip' }, [CX])

/** A bank's stamp, as {@link bankStamp} checks it. */
export type BankStamp = Z.infer<typeof bankStamp>
/** A gate's stamp, as {@link gateStamp} checks it. */
export type GateStamp = Z.infer<typeof gateStamp>
/** A vault's stamp, as {@link vaultStamp} checks it. */
export type VaultStamp = Z.infer<typeof vaultStamp>
/** What a lease cites of its gate, as {@link citedGate} checks it. */
export type CitedGate = Z.infer<typeof citedGate>
// --

// == [What a proving is handed]: provingWorld, stampedGate, passphraseNovelArgs, passkeyNovelArgs, passphraseStoredArgs, passkeyStoredArgs, strengthArgs, ProvingWorld, StampedGate, Novel

/** The check of what a proving is given of its bank. */
export const provingWorld = objStrip(({ custom, device_tok }) => ({
  /** The key deriver, as the core wraps it: it turns a passphrase into key bytes. */
  keyDeriver:      custom<GuardedKeyDeriver>(isGuarded, Phrases.GuardedExpected),
  /** The strength checker, as the core wraps it: it judges a new passphrase. */
  strengthChecker: custom<GuardedStrengthChecker>(isGuarded, Phrases.GuardedExpected),
  /** This device's token, written into the wayin header a proving mints. */
  device_tok,
}), 'bad_option', [CX])

/** What a proving is given of its bank: two wrapped host functions and this device's token. */
export type ProvingWorld = Z.infer<typeof provingWorld>

/** The checks of the arguments of the provings' static builders.
 * A `bank`, or a new wayin's `gate`, is anything carrying its stamp. A stored wayin's `gate` is anything carrying a
 * {@link bankStamp} as `bankStamp`, a {@link gateStamp} as `stamp`, and the gate row's `wayins`, as a `Gate` does.
 */
export const { stampedGate, passphraseNovelArgs, passkeyNovelArgs, passphraseStoredArgs, passkeyStoredArgs, strengthArgs } = Checkers('bad_option', ({ obj }) => {
  const stampedGate = obj({ bankStamp, stamp: gateStamp, wayins: BX.wayins })
  return {
    stampedGate,
    passphraseNovelArgs:   obj({ bank: bankStamp, gate: gateStamp, passphraseClear: passphraseCleartext, world: provingWorld }),
    passkeyNovelArgs:      obj({ bank: bankStamp, gate: gateStamp, passkeyClear: freshPasskeyAnswer, world: provingWorld }),
    passphraseStoredArgs:  obj({ gate: stampedGate, passphraseClear: passphraseCleartext, world: provingWorld }),
    passkeyStoredArgs:     obj({ gate: stampedGate, passkeyClear: passkeyAnswer }),
    strengthArgs:          obj({ passphraseClear: passphraseCleartext, scope: bankScope, world: provingWorld }),
  }
})

/** A gate as a stored wayin's proving takes it: its bank's stamp, its own stamp, and its wayins. */
export type StampedGate = Z.infer<typeof stampedGate>

/** What `Proving.buildWayin` is passed for a wayin over a bankKey made new: the type of `NOVEL`. */
export type Novel = typeof NOVEL
// --

// == [The lease's forms]: LeaseFormat, isLeaseKey, leaseStamp, leaseRecord, LeaseStamp, LeaseSparse, LeaseRecord

/** The `fmt` a lease carries, as `Lease` checks it. */
export const LeaseFormat = 7003

/** True when `val` is a leaseKey as `makeLeaseKey` makes one: a non-extractable AES-GCM CryptoKey for `unwrapKey`, and at most `wrapKey` besides.
 * A cached lease whose key fails this was not written by this package, and is treated as damaged.
 *
 * @example isLeaseKey(await makeBankKey())  // false: extractable
 */
export const isLeaseKey = (val: unknown): val is CryptoKey => (
  val instanceof CryptoKey
    && ! val.extractable
    && val.algorithm.name === 'AES-GCM'
    && val.usages.includes('unwrapKey')
    && val.usages.every((usage) => usage === 'wrapKey' || usage === 'unwrapKey')
)

/** The checks of a lease's stamp and its record.
 * The stamp cites the gate the lease was granted under, and is bound into the wrap of its bankKey.
 * The record adds the leaseKey and the bankKey wrapped under it.
 */
export const { leaseStamp, leaseRecord } = Checkers('bad_record', ({ obj, lit, custom, epochMillis, gate_tok, revision_tok, bank_key_lease_wrapped }) => {
  const leaseStamp  = obj({
    fmt: lit(LeaseFormat), ...bankStamp.shape,
    gatelabel: CX.gateScope.unwrap().shape.gatelabel, gate_tok, gate_revision_tok: revision_tok,
    proved_at: epochMillis, wayinkind,
  })
  const leaseRecord = leaseStamp.extend({
    lease_key:               custom<CryptoKey>(isLeaseKey, Phrases.LeaseKeyExpected),
    bank_key_lease_wrapped: bank_key_lease_wrapped.readonly(),
  }).strict().readonly()
  return { leaseStamp, leaseRecord }
}, [CX])

/** A lease's stamp, as {@link leaseStamp} checks it. */
export type LeaseStamp  = Z.infer<typeof leaseStamp>
/** The parts of a lease that are safe to show: its {@link LeaseStamp}. */
export type LeaseSparse = LeaseStamp
/** A lease's record, as a device caches it: its stamp, its leaseKey handle, and the bankKey wrapped under it. */
export type LeaseRecord = Z.infer<typeof leaseRecord>
// --

// == [What a lease is handed]: sealedWhisper, leaseMillis, guardedLogger, leaseFriend, leaseGrantOpts, ctxStamp, leaseFromCacheArgs, leaseGrantedArgs, provingLeaseArgs, leaseSealArgs, leaseUnsealArgs, SealedWhisper, LeaseFriend, LeaseGrantOpts

/** The check of a box's sealed parts: its wrapped boxKey and ciphered whisper. */
export const sealedWhisper = objCheck(({ box_key_wrapped, whisper_ciphered }) => ({ box_key_wrapped, whisper_ciphered }), { refusalkind: 'bad_record', extras: 'strip' }, [CX])

/** A box's sealed parts: its wrapped boxKey and ciphered whisper. */
export type SealedWhisper = Z.infer<typeof sealedWhisper>

/** The check of the autolock duration in milliseconds, at most {@link ForeverMillis}. */
export const leaseMillis = Checker(({ int }) => int.positive().max(ForeverMillis), 'bad_option')

/** The check of a logger wrapped by `parseLogger`. */
export const guardedLogger = Checker(({ custom }) => custom<VaultLogger>(isGuardedLogger, Phrases.GuardedLoggerExpected), 'bad_option')

/** The check of all a lease or a proving is given of its bank: the bank's stamp, and the deviceDB's lease verbs bound to its scope and `bank_tok`.
 * It holds no key, and reaches neither the bankDB nor the boxes.
 */
export const leaseFriend = objCheck(({ fn }) => ({
  ...bankStamp.shape,
  logger:          guardedLogger,
  /** The autolock duration: a cached row proved longer ago than this is due for locking. */
  leaseMillis,
  /** Lock the bank, as a lease does when it will not unwrap the bankKey. */
  lock:            fn<() => unknown>(),
  /** The record this device has cached, or null for none. */
  peekLease:       fn<() => Promise<unknown>>(),
  /** Cache a lease's record on this device, in place of any it had. */
  tryCacheLease:   fn<(record: LeaseRecord) => Promise<Outcome<unknown>>>(),
  /** Forget the lease this device has cached. */
  forgetLease:     fn<() => Promise<void>>(),
  /** Forget the lease this device has cached, telling the host of a failed revoke. */
  tryForgetLease:  fn<() => Promise<Outcome<void>>>(),
  /** Tell the host what went wrong in a lease's cache put. */
  tellBadNews:     fn<(badnews: readonly unknown[]) => unknown>(),
}), { refusalkind: 'bad_option', extras: 'strip' })

/** All a lease or a proving is given of its bank, as {@link leaseFriend} checks it. */
export type LeaseFriend = Z.infer<typeof leaseFriend>

/** The check of the gate a lease is granted under, as it cites it, and the kind of wayin proved. */
export const leaseGrantOpts = objCheck(() => ({
  gate:      citedGate,
  wayinkind: wayinkind,
}), 'bad_option')

/** The gate a lease is granted under, as it cites it, and the kind of wayin proved. */
export type LeaseGrantOpts = Z.infer<typeof leaseGrantOpts>

/** True for a stamp a caller hands the lease as additional data: a flat object of strings and finite numbers, at least one. */
const isCtxStamp = (val: unknown): boolean => (
  typeof val === 'object' && val !== null && ! Array.isArray(val) && Object.keys(val).length > 0
    && Object.values(val).every((field) => typeof field === 'string' || Number.isFinite(field))
)

/** The checks of each lease verb's arguments, and of one stamp a caller hands a seal.
 * Each ctx under the lease binds the bank's stamp, then the caller's stamps, in order.
 */
export const { ctxStamp, leaseFromCacheArgs, leaseGrantedArgs, provingLeaseArgs, leaseSealArgs, leaseUnsealArgs } = Checkers('bad_option', ({ obj, custom, str }) => {
  const cryptoKey = custom<CryptoKey>((val) => val instanceof CryptoKey, 'Expected a CryptoKey')
  const ctxStamp  = custom<CipherCtxRecord>(isCtxStamp, Phrases.CtxStampExpected)
  return {
    ctxStamp,
    leaseFromCacheArgs: obj({ friend: leaseFriend, gate: citedGate }),
    leaseGrantedArgs:   obj({ friend: leaseFriend, bankKey: cryptoKey.refine((val) => val.extractable, 'Expected an extractable CryptoKey'), opts: leaseGrantOpts }),
    provingLeaseArgs:   obj({ friend: leaseFriend, gate: citedGate }),
    leaseSealArgs:      obj({ whisperText: str, stamps: ctxStamp.array().min(1) }),
    leaseUnsealArgs:    obj({ sealed: sealedWhisper, stamps: ctxStamp.array().min(1) }),
  }
}, [CX])

// --

// == [The gating's forms]: gatingkind, bankBuildCleartexts, bankUnlockCleartexts, passphraseReplaceCleartexts, passkeyAddCleartexts, passkeyRevokeCleartexts, bankDelCleartexts, gatingLaunchOnArgs, gatingLaunchBirthArgs, CleartextsForGatingkind

// A cleartext is only ever checked here, in the attempt's own call.
/** The checks of what the user hands an attempt, by the kind of gating. */
export const { gatingkind, bankBuildCleartexts, bankUnlockCleartexts, passphraseReplaceCleartexts, passkeyAddCleartexts, passkeyRevokeCleartexts, bankDelCleartexts } = Checkers('bad_option', ({ oneof, obj }) => ({
  gatingkind:              oneof(EX.gatingkindVals),
  bankBuildCleartexts:         obj({ passphraseClear: passphraseCleartext, passkeyClear: freshPasskeyAnswer.nullable().optional() }).strict(),
  bankUnlockCleartexts:        obj({ passphraseClear: passphraseCleartext.optional(), passkeyClear: passkeyAnswer.nullable().optional() }).strict()
    .transform(({ passphraseClear, passkeyClear }, ctx) => {
      if (passphraseClear !== undefined) { return { passphraseClear } }
      if (passkeyClear) { return { passkeyClear } }
      ctx.addIssue({ code: 'custom', message: Phrases.CleartextMissing })
      return NEVER
    }),
  passphraseReplaceCleartexts: obj({ antePassphraseClear: passphraseCleartext, nextPassphraseClear: passphraseCleartext }).strict(),
  passkeyAddCleartexts:        obj({ passphraseClear: passphraseCleartext, passkeyClear: freshPasskeyAnswer }).strict(),
  passkeyRevokeCleartexts:     obj({ passphraseClear: passphraseCleartext }).strict(),
  bankDelCleartexts:           obj({ passphraseClear: passphraseCleartext }).strict(),
}))

/** The arguments that launch a gating on a stored bank: its kind, the bank, the bank's `unlockByProving`, and the device's dialog or null. */
export const gatingLaunchOnArgs = objStrict(({ oneof, custom, fn }) => ({
  gatingkind:      oneof(EX.gatingkindVals).exclude(['build_bank']),
  bank:            custom<Bank>((val) => hasModelkind(val, 'bank'), Phrases.BankExpected),
  unlockByProving: fn<UnlockByProving>(),
  askUser:         custom<AskUser>(isGuarded, Phrases.GuardedExpected).nullable(),
}), 'bad_option')

/** The arguments that launch a `build_bank` gating: the bank listing, the row the bank is built over, `unlockByProving`, and the device's dialog or null. */
export const gatingLaunchBirthArgs = objStrict(({ custom, fn }) => ({
  listing:         custom<BankListing>((val) => hasModelkind(val, 'bank_listing'), Phrases.ListingExpected),
  expected:        BX.bankSparse,
  unlockByProving: fn<UnlockByProving>(),
  askUser:         custom<AskUser>(isGuarded, Phrases.GuardedExpected).nullable(),
}), 'bad_option')

/** What an attempt takes, by the kind of gating. */
export type CleartextsForGatingkind = {
  build_bank:         Z.input<typeof bankBuildCleartexts>
  unlock_bank:        Z.input<typeof bankUnlockCleartexts>
  replace_passphrase: Z.input<typeof passphraseReplaceCleartexts>
  add_passkey:        Z.input<typeof passkeyAddCleartexts>
  revoke_passkey:     Z.input<typeof passkeyRevokeCleartexts>
  del_bank:           Z.input<typeof bankDelCleartexts>
}
// --

// == [Given to a gating]: RequestCleartext, AskUser, AnyGating, GatingSnapshot, BankForGatingkind, BankGatingkind, UnlockByProving

/** The host's dialog for `gating`: show it, and resolve once it closes.
 * It hands the user's cleartexts to `gating.attempt`. Resolving with no attempt under way dismisses the gating.
 */
export type RequestCleartext = (gating: AnyGating) => unknown

/** The host's dialog as the core keeps it, wrapped by `guardRequestCleartext`: true once it closes, false if it threw. It never throws. */
export type AskUser = (gating: AnyGating) => Promise<boolean>

/** A gating of any kind. */
export type AnyGating = { [KindT in EX.Gatingkind]: Gating<KindT> }[EX.Gatingkind]

/** A gating as a host's dialog renders it: the bank it asks for, and what it asks for. */
export interface GatingSnapshot extends BankScope {
  /** What the gating does once the user's cleartext proves the gate: build, unlock or delete the bank, or change its gate. */
  readonly gatingkind: EX.Gatingkind
  /** Unique to this gating, for a dialog to key on. */
  readonly gatingTok:  string
}

/** The bank each kind of gating acts on, null for a `build_bank` whose bank does not exist yet. */
export type BankForGatingkind = { build_bank: null, unlock_bank: Bank, replace_passphrase: Bank, add_passkey: Bank, revoke_passkey: Bank, del_bank: Bank }

/** A gating of a bank already built: every kind but `build_bank`. */
export type BankGatingkind = Exclude<EX.Gatingkind, 'build_bank'>

/** Unlock `bank` by what `proved` proved, with a lease citing `cited`, by default its main gate as it stands. */
export type UnlockByProving = (bank: Bank, proved: Proving, cited?: CitedGate) => Promise<Bank>
// --
