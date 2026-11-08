/** The checks and types of the gate: wayins, provings, leases and gatings, imported as `GX`. */

import { string as zodString } from 'zod'
import type * as Z from 'zod'
import { Checker, Checkers, objCheck } from '../helpers/validator'
import type { VaultError } from '../refusals/errors'
import type { Outcome } from '../refusals/outcome'
import * as Phrases from '../helpers/phrases'
import { ForeverMillis, PasskeySaltBytes, isGuarded } from '../helpers/consts'
import { type VaultLogger, isGuardedLogger } from '../helpers/logger'
import { type CipherCtxRecord, fromB64OrNull } from '../helpers/crypto'
import type { GuardedStrengthChecker, StrengthChecker } from '../helpers/passphrase-strength'
import type { Gating } from '../models/gating'
import type { GuardedKeyDeriver, NOVEL, PasskeyProving, PassphraseProving, Proving } from '../models/proving'
import type { Vault } from '../models/vault'
import type { VaultListing } from '../models/vault-listing'
import * as EX from './shapes-enums'
import * as CX from './shapes-core'
import { type VaultScope, vaultScope } from './shapes-core'
import * as SX from './shapes-storage'
import type { Revision, VaultRecord } from './shapes-storage'
import type { VaultWorld } from './shapes-vaultish'

// == [Wayin kinds]: wayinkind, isPrfSalt

/** The check of a wayin's kind, as a caller names the slot of the gate it means: one of {@link wayinkindVals}. */
export const wayinkind = Checker(({ oneof }) => oneof(EX.wayinkindVals), 'bad_option')

/** True for a passkey wayin's salt as its kind makes one: base64url text of {@link PasskeySaltBytes} bytes. A stored one that is not marks the wayin damaged; a new passkey's answer over one that is not is refused. */
export const isPrfSalt = (prf_salt_b64: string): boolean => fromB64OrNull(prf_salt_b64)?.length === PasskeySaltBytes
// --

// == [The wayin's forms]: passphraseWayinHeader, passkeyWayinHeader, wayinHeader, wayinRecord, PassphraseWayinHeader, PasskeyWayinHeader, WayinHeader, PassphraseWayinRecord, PasskeyWayinRecord, WayinRecord

export const { passphraseWayinHeader, passkeyWayinHeader, wayinHeader, wayinRecord } = Checkers('bad_record', ({ discrim }) => {
  const passphraseWayinHeader = SX.passphraseWayinRecord.omit({ vault_key_wayin_wrapped: true }).strip()
  const passkeyWayinHeader    = SX.passkeyWayinRecord.omit({ vault_key_wayin_wrapped: true }).strip()
  return {
    passphraseWayinHeader,
    passkeyWayinHeader,
    wayinHeader: discrim('wayinkind', [passphraseWayinHeader, passkeyWayinHeader]),
    wayinRecord: discrim('wayinkind', [SX.passphraseWayinRecord, SX.passkeyWayinRecord]),
  }
})

export type PassphraseWayinHeader = Z.infer<typeof passphraseWayinHeader>
export type PasskeyWayinHeader    = Z.infer<typeof passkeyWayinHeader>
export type WayinHeader           = Z.infer<typeof wayinHeader>
export type PassphraseWayinRecord = Z.infer<typeof SX.passphraseWayinRecord>
export type PasskeyWayinRecord    = Z.infer<typeof SX.passkeyWayinRecord>
export type WayinRecord           = Z.infer<typeof wayinRecord>
// --

// == [The gate's forms]: FirstGateEpoch, gateEpoch, gateProps, GateProps

/** The `gate_epoch` of a vault's first gate. */
export const FirstGateEpoch = 1

/** Which gate of its vault a gate is: bound into every lease, which a gate of another epoch does not honour. */
export const gateEpoch = Checker(({ int }) => int.positive(), 'bad_record')

export const gateProps = objCheck(() => ({
  gate_epoch:       gateEpoch,
  passphrase_wayin: SX.passphraseWayinRecord,
  passkey_wayin:    SX.passkeyWayinRecord.nullable(),
}), 'bad_record')

export type GateProps = Z.infer<typeof gateProps>
// --

// == [Proofs]: passphraseCleartext, PassphraseCleartext, PrfAnswerBytes, passkeyAnswer, PasskeyAnswer, freshPasskeyAnswer

/** The check for a passphrase's cleartext, the text the user typed: any string, blank included. Its `parse` quotes none of it.
 * What a blank one means is the gating's to say.
 */
export const passphraseCleartext = Checker(() => zodString({ error: Phrases.PassphraseNotText }).brand<'PassphraseCleartext'>(), 'bad_option')

/** A passphrase's cleartext once {@link passphraseCleartext} has parsed it: the only text the key deriver is handed. */
export type PassphraseCleartext = Z.infer<typeof passphraseCleartext>

/** How many bytes a passkey's PRF answers with: always 32, by the WebAuthn PRF extension. */
export const PrfAnswerBytes = 32

/** What a passkey's answer must carry: its credential's id, the salt it answered for, and its PRF bytes, judged by their tag, so bytes from an iframe pass. Its `parse` quotes none of it, as its bytes are secret.
 * An answer already used, its bytes zeroed by the proving sealed of it, is refused too: sealed
 * again, it would make a key anyone could rebuild.
 *
 * @example passkeyAnswer.parse(usedAnswer)  // throws: its bytes were zeroed at its first use
 */
export const passkeyAnswer = objCheck(({ str, bytes, credential_id }) => ({
  /** Base64url, as `PublicKeyCredential.id` gives it. */
  credential_id,
  prf_salt_b64:  str.min(1),
  /** 32 bytes, as good as the passphrase for this vault: hand them to the gating, then drop them. */
  prfBytes:      bytes(PrfAnswerBytes).refine((prfBytes) => prfBytes.reduce((seen, byte) => seen | byte, 0) !== 0, Phrases.PasskeyAnswerUsed),
}), { refusalkind: 'bad_option', extras: 'strip' }, [CX])

/** A passkey's answer when asked for a vault's PRF: the cleartext a gating takes for a passkey. `safebyok-react`'s `askPasskey` makes one.
 * An `unlock_vault` gating takes it as `passkeyClear` in `attempt`, in place of the passphrase.
 * `build_vault` and `add_passkey` take it there beside the passphrase.
 *
 * @example await gating.attempt({ passkeyClear: passkey })   // an unlock_vault gating, by the passkey alone
 */
export type PasskeyAnswer = Z.infer<typeof passkeyAnswer>

/** A new passkey's answer, as `safebyok-react`'s `createPasskey` gives it: a passkey's answer, over a fresh salt of {@link PasskeySaltBytes} bytes as base64url text. Its `parse` quotes none of it.
 * A passkey wayin sealed over another salt would read as damaged at every later unlock.
 *
 * @example freshPasskeyAnswer.parse({ ...answer, prf_salt_b64: 'c2hvcnQ' })  // throws
 */
export const freshPasskeyAnswer = Checker(() => (
  passkeyAnswer.refine(({ prf_salt_b64: prfSalt }) => isPrfSalt(prfSalt), { error: Phrases.prfSaltNotFresh(PasskeySaltBytes), path: ['prf_salt_b64'] })
), 'bad_option')
// --

// == [Strength]: isStrengthChecker, strengthChecker, passphraseVerdict, PassphraseVerdict

/** True for a {@link StrengthChecker}: a function, whose `load`, if it carries one, is a function too. */
const isStrengthChecker = (candidate: unknown): candidate is StrengthChecker => (
  typeof candidate === 'function' && ['undefined', 'function'].includes(typeof (candidate as { load?: unknown }).load)
)

/** The checks of a `strengthChecker` and of the verdict it answers. */
export const { strengthChecker, passphraseVerdict } = Checkers('bad_option', ({ custom, union, obj, lit, str }) => ({
  strengthChecker: custom<StrengthChecker>(isStrengthChecker, Phrases.StrengthCheckerShape),
  passphraseVerdict: union([
    obj({ strong: lit(true) }),
    obj({ strong: lit(false), reason: str.min(1) }),
  ]),
}))

/** What a strength checker finds of one passphrase: strong enough, or weak with a `reason` for the user.
 * The reason is calm, says what to do, and never quotes the passphrase. A field shows it, and the
 * vault's 'weak_passphrase' refusal carries it as its message.
 */
export type PassphraseVerdict = Z.infer<typeof passphraseVerdict>
// --

// == [The vault's stamp]: vaultStamp, VaultStamp

/** The fields of a vault fixed for its life, which every ctx under it binds: the scope, `vault_tok` and `registered_at`. Its `parse` takes them from whatever carries them, a Vault included, and strips the rest. */
export const vaultStamp = objCheck(({ vaultScope, vault_tok, epochMillis }) => ({
  ...vaultScope.unwrap().shape,
  vault_tok,
  registered_at: epochMillis,
}), { refusalkind: 'bad_option', extras: 'strip' }, [CX])

export type VaultStamp = Z.infer<typeof vaultStamp>
// --

// == [What a proving is handed]: provingWorld, stampedGate, passphraseNovelArgs, passkeyNovelArgs, passphraseStoredArgs, passkeyStoredArgs, strengthArgs, ProvingWorld, StampedGate, Novel

/** The check of what a proving hears of the bank, refusing 'bad_option'. */
export const { provingWorld } = Checkers('bad_option', ({ obj, custom, device_id }) => ({
  provingWorld: obj({
    /** The bank's key deriver, guarded: it turns a passphrase into key bytes. */
    keyDeriver:      custom<GuardedKeyDeriver>(isGuarded, Phrases.GuardedExpected),
    /** The bank's strength checker, guarded: it judges a new passphrase. */
    strengthChecker: custom<GuardedStrengthChecker>(isGuarded, Phrases.GuardedExpected),
    /** This device's id, written into the wayin header a proving mints. */
    device_id,
  }),
}), [CX])

/** What a proving hears of the bank: its two guarded host functions and this device's id. */
export type ProvingWorld = Z.infer<typeof provingWorld>

/** The arguments of the provings' statics. A `stamp` is whatever carries a {@link vaultStamp}, a record or a vault, stripped to one; a `gate` is whatever carries a {@link vaultStamp} as `stamp`, and {@link gateProps}, as a `Gate` does. */
export const { stampedGate, passphraseNovelArgs, passkeyNovelArgs, passphraseStoredArgs, passkeyStoredArgs, strengthArgs } = Checkers('bad_option', ({ obj }) => {
  const stampedGate = obj({ stamp: vaultStamp, ...gateProps.shape })
  return {
    stampedGate,
    passphraseNovelArgs:   obj({ stamp: vaultStamp, passphraseClear: passphraseCleartext, world: provingWorld }),
    passkeyNovelArgs:      obj({ stamp: vaultStamp, passkeyClear: freshPasskeyAnswer, world: provingWorld }),
    passphraseStoredArgs:  obj({ gate: stampedGate, passphraseClear: passphraseCleartext, world: provingWorld }),
    passkeyStoredArgs:     obj({ gate: stampedGate, passkeyClear: passkeyAnswer }),
    strengthArgs:          obj({ passphraseClear: passphraseCleartext, scope: vaultScope, world: provingWorld }),
  }
})

export type StampedGate = Z.infer<typeof stampedGate>

/** What `Proving.buildWayin` is passed for a wayin over a vaultKey made new: the type of `NOVEL`. */
export type Novel = typeof NOVEL
// --

// == [The lease's forms]: LeaseFormat, isLeaseKey, leaseStamp, leaseRecord, LeaseStamp, LeaseSparse, LeaseRecord

/** The `fmt` a lease carries, as `Lease` checks it. */
export const LeaseFormat = 7001

/** True when `val` is a leaseKey as `makeLeaseKey` makes one: a non-extractable AES-GCM CryptoKey whose usages are within `wrapKey` and `unwrapKey`, among them `unwrapKey`.
 * A device store hands back what it kept by structured clone, so a key that is extractable, of
 * another algorithm, or for another use was not written by this package: its record reads as none.
 *
 * @example isLeaseKey(await makeVaultKey())  // false: extractable
 */
export const isLeaseKey = (val: unknown): val is CryptoKey => (
  val instanceof CryptoKey
    && ! val.extractable
    && val.algorithm.name === 'AES-GCM'
    && val.usages.includes('unwrapKey')
    && val.usages.every((usage) => usage === 'wrapKey' || usage === 'unwrapKey')
)

/** `leaseStamp` is what the wrap of a lease's vaultKey is bound to; `leaseRecord` adds its keys. */
export const { leaseStamp, leaseRecord } = Checkers('bad_record', ({ obj, lit, custom, epochMillis, vault_key_lease_wrapped }) => {
  const leaseStamp  = obj({ fmt: lit(LeaseFormat), ...vaultStamp.shape, gate_epoch: gateEpoch, proved_at: epochMillis, wayinkind: wayinkind })
  const leaseRecord = leaseStamp.extend({
    lease_key:               custom<CryptoKey>(isLeaseKey, Phrases.LeaseKeyExpected),
    vault_key_lease_wrapped: vault_key_lease_wrapped.readonly(),
  }).strict().readonly()
  return { leaseStamp, leaseRecord }
}, [CX])

export type LeaseStamp  = Z.infer<typeof leaseStamp>
export type LeaseSparse = LeaseStamp
export type LeaseRecord = Z.infer<typeof leaseRecord>
// --

// == [What a lease is handed]: sealedWhisper, leaseMillis, guardedLogger, leaseFriend, leaseGrantOpts, ctxStamp, leaseFromCacheArgs, leaseGrantedArgs, provingLeaseArgs, leaseSealArgs, leaseUnsealArgs, SealedWhisper, LeaseFriend, LeaseGrantOpts

export const sealedWhisper = objCheck(({ box_key_wrapped, whisper_ciphered }) => ({ box_key_wrapped, whisper_ciphered }), { refusalkind: 'bad_record', extras: 'strip' }, [CX])

export type SealedWhisper = Z.infer<typeof sealedWhisper>

/** The autolock duration in milliseconds, at most {@link ForeverMillis}. */
export const leaseMillis = Checker(({ int }) => int.positive().max(ForeverMillis), 'bad_option')

/** The check of a logger as the bank hands its models one: guarded by `parseLogger`. */
export const guardedLogger = Checker(({ custom }) => custom<VaultLogger>(isGuardedLogger, Phrases.GuardedLoggerExpected), 'bad_option')

/** All a lease or a proving hears of a vault, as a plain object, its fields fixed for the vault's life, the deviceDB's lease verbs bound to its scope and `vault_tok`. It holds no key, and reaches neither the record nor the boxes. */
export const leaseFriend = objCheck(({ fn }) => ({
  ...vaultStamp.shape,
  logger:          guardedLogger,
  /** The autolock duration: a cached row proved longer ago than this is due for locking. */
  leaseMillis,
  /** Lock the vault: a lease that will not open calls it, as what the vault holds is no use. */
  lock:            fn<() => unknown>(),
  /** The record this device has cached, or null for none. */
  tryPeekLease:    fn<() => Promise<Outcome<unknown>>>(),
  /** Cache a lease's record on this device, in place of any it held. */
  tryCacheLease:   fn<(record: LeaseRecord) => Promise<Outcome<unknown>>>(),
  /** Forget the lease this device has cached. */
  tryForgetLease:  fn<() => Promise<Outcome<void>>>(),
  /** Tell the host what went wrong in a lease's cache put. */
  tellBadNews:     fn<(badnews: readonly VaultError[]) => unknown>(),
}), { refusalkind: 'bad_option', extras: 'strip' })

/** All a lease or a proving hears of its vault, once {@link leaseFriend} has checked it. */
export type LeaseFriend = Z.infer<typeof leaseFriend>

export const leaseGrantOpts = objCheck(() => ({
  gate_epoch: gateEpoch,
  wayinkind:  wayinkind,
}), 'bad_option')

export type LeaseGrantOpts = Z.infer<typeof leaseGrantOpts>

/** True for a stamp a caller hands the lease as additional data: a flat object of strings and finite numbers, at least one. */
const isCtxStamp = (val: unknown): boolean => (
  typeof val === 'object' && val !== null && ! Array.isArray(val) && Object.keys(val).length > 0
    && Object.values(val).every((field) => typeof field === 'string' || Number.isFinite(field))
)

/** SLOPDOC: The arguments of each lease verb, and the flat stamp binding what a lease seals to its caller's record. */
export const { ctxStamp, leaseFromCacheArgs, leaseGrantedArgs, provingLeaseArgs, leaseSealArgs, leaseUnsealArgs } = Checkers('bad_option', ({ obj, custom, str }) => {
  const cryptoKey = custom<CryptoKey>((val) => val instanceof CryptoKey, 'Expected a CryptoKey')
  const ctxStamp  = custom<CipherCtxRecord>(isCtxStamp, Phrases.CtxStampExpected)
  return {
    ctxStamp,
    leaseFromCacheArgs: obj({ friend: leaseFriend, gate_epoch: gateEpoch }),
    leaseGrantedArgs:   obj({ friend: leaseFriend, vaultKey: cryptoKey.refine((val) => val.extractable, 'Expected an extractable CryptoKey'), opts: leaseGrantOpts }),
    provingLeaseArgs:   obj({ friend: leaseFriend, gate_epoch: gateEpoch }),
    leaseSealArgs:      obj({ whisperText: str, stamp: ctxStamp }),
    leaseUnsealArgs:    obj({ sealed: sealedWhisper, stamp: ctxStamp }),
  }
}, [CX])

// --

// == [The gating's forms]: gatingkind, vaultBuildClears, vaultUnlockClears, passphraseReplaceClears, passkeyAddClears, passkeyRevokeClears, vaultDelClears, gatingFriend, gatingLaunchArgs, GatingFriend, ClearsForGatingkind

/** What the user hands an attempt, by the kind of gating; a clear is only ever checked here, in the attempt's own call. */
export const { gatingkind, vaultBuildClears, vaultUnlockClears, passphraseReplaceClears, passkeyAddClears, passkeyRevokeClears, vaultDelClears } = Checkers('bad_option', ({ oneof, obj }) => ({
  gatingkind:              oneof(EX.gatingkindVals),
  vaultBuildClears:        obj({ passphraseClear: passphraseCleartext, passkeyClear: freshPasskeyAnswer.nullable().optional() }).strict(),
  vaultUnlockClears:       obj({ passphraseClear: passphraseCleartext.optional(), passkeyClear: passkeyAnswer.nullable().optional() }).strict()
    .refine(({ passphraseClear, passkeyClear = null }) => passphraseClear !== undefined || passkeyClear !== null, Phrases.ProofMissing),
  passphraseReplaceClears: obj({ antePassphraseClear: passphraseCleartext, nextPassphraseClear: passphraseCleartext }).strict(),
  passkeyAddClears:        obj({ passphraseClear: passphraseCleartext, passkeyClear: freshPasskeyAnswer }).strict(),
  passkeyRevokeClears:     obj({ passphraseClear: passphraseCleartext }).strict(),
  vaultDelClears:          obj({ passphraseClear: passphraseCleartext }).strict(),
}))

/** What a gating's run hears of its vault's private verbs, past the enter key. A plain object, held in private by the vault and the gating: no public method of a vault takes a proving. */
export const gatingFriend = objCheck(({ fn }) => ({
  /** Unlock the vault with what a proving proved. */
  unlockByProof: fn<(vault: Vault, proved: Proving) => Promise<Vault>>(),
  /** Store a changed gate by `commit`, then lease the vault under the epoch it landed. */
  landGate:      fn<(vault: Vault, proved: Proving, commit: () => Promise<VaultRecord>) => Promise<Vault>>(),
}), { refusalkind: 'bad_option', extras: 'strip' })

/** What a gating's run hears of its vault's private verbs, once {@link gatingFriend} has checked it. */
export type GatingFriend = Z.infer<typeof gatingFriend>

/** The check of what launches a gating. */
export const gatingLaunchArgs = objCheck(({ custom }) => ({ gatingkind, scope: vaultScope, friend: gatingFriend, askUser: custom<AskUser>(isGuarded, Phrases.GuardedExpected) }), { refusalkind: 'bad_option', extras: 'strip' })

export type ClearsForGatingkind = {
  build_vault:        Z.input<typeof vaultBuildClears>
  unlock_vault:       Z.input<typeof vaultUnlockClears>
  replace_passphrase: Z.input<typeof passphraseReplaceClears>
  add_passkey:        Z.input<typeof passkeyAddClears>
  revoke_passkey:     Z.input<typeof passkeyRevokeClears>
  del_vault:          Z.input<typeof vaultDelClears>
}
// --

// == [Given to a gating]: RequestCleartext, AskUser, AnyGating, GatingSnapshot, VaultBuildProvings, VaultUnlockProvings, AnteProvings, PassphraseReplaceProvings, PasskeyAddProvings, ProvingsForGatingkind, Run, VaultForGatingkind, LaunchArgs, Asked, Prove

/** The host's dialog: shown with this gating, resolving once it closes. It hands the user's clears to `gating.attempt`, and its returning with no attempt under way declines. */
export type RequestCleartext = (gating: AnyGating) => unknown

/** The host's dialog as a bank keeps it, wrapped by `guardRequestCleartext`: true once the dialog closes, false if it threw. Never throws. */
export type AskUser = (gating: AnyGating) => Promise<boolean>

export type AnyGating = { [KindT in EX.Gatingkind]: Gating<KindT> }[EX.Gatingkind]

/** A gating as a host's dialog renders it: the vault it asks for, and what it asks for. */
export interface GatingSnapshot extends VaultScope {
  /** What the gating does once the user's cleartext proves the gate: build, unlock or delete the vault, or change its gate. */
  readonly gatingkind: EX.Gatingkind
}

/** What a build_vault attempt proves: the provings of a new vault's wayins, with no record to prove them against. */
export type VaultBuildProvings = { passphraseProving: PassphraseProving, passkeyProving: PasskeyProving | null }

/** What an unlock_vault attempt proves: either wayin will do. */
export type VaultUnlockProvings = { proved: Proving }

/** The record an attempt read and the passphrase proved against it: all a revoke_passkey or a del_vault needs, and a commit's `ante`. */
export type AnteProvings = { ante: VaultRecord, proved: PassphraseProving }

/** What a replace_passphrase attempt proves: the ante passphrase against the record it read, and the next, unproved. */
export type PassphraseReplaceProvings = { ante: VaultRecord, anteProving: PassphraseProving, nextProving: PassphraseProving }

/** What an add_passkey attempt proves: the passphrase, and the passkey to wrap the vaultKey for. */
export type PasskeyAddProvings = AnteProvings & { passkeyProving: PasskeyProving }

/** The provings by kind of gating, for what must look one up by its kind: `Run` and `Prove`. */
export type ProvingsForGatingkind = {
  build_vault:        VaultBuildProvings
  unlock_vault:       VaultUnlockProvings
  replace_passphrase: PassphraseReplaceProvings
  add_passkey:        PasskeyAddProvings
  revoke_passkey:     AnteProvings
  del_vault:          AnteProvings
}

/** The change a gating is launched for, past the enter key. It hears provings, never a clear. */
export type Run<KindT extends EX.Gatingkind> = (provings: ProvingsForGatingkind[KindT], launchArgs: LaunchArgs<KindT>) => Promise<Vault>

export type VaultForGatingkind = { build_vault: null, unlock_vault: Vault, replace_passphrase: Vault, add_passkey: Vault, revoke_passkey: Vault, del_vault: Vault }

/** All a gating is launched with; `prior`, the revision a birth lands after, is read at launch, and `askUser` is the bank's. */
export type LaunchArgs<KindT extends EX.Gatingkind> = { listing: VaultListing, scope: VaultScope, vault: VaultForGatingkind[KindT], prior: KindT extends 'build_vault' ? Revision : null, friend: GatingFriend, askUser: AskUser }

export type Asked<KindT extends EX.Gatingkind> = { scope: VaultScope, vault: VaultForGatingkind[KindT], listing: VaultListing, world: VaultWorld }

export type Prove<KindT extends EX.Gatingkind> = (asked: Asked<KindT>, clears: unknown) => Promise<ProvingsForGatingkind[KindT]>
// --
