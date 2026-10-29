/** The vault record: the one record per vault every device syncs, its gate nested in it, the shapes sliced from it, the proofs its wayins take, and a new passphrase's strength checker and verdict. Each record's `parse` refuses 'bad_record', quoting none of it. */

import { string as zodString } from 'zod'
import type * as Z from 'zod'
import { Checker, Checkers, objCheck } from '../checks/validator'
import * as Phrases from '../phrases'
import { fromB64OrNull } from '../crypto'
import type { StrengthChecker } from '../passphrase-strength'
import * as FX from './fields'

// == [Formats]: VaultFormat, TombstoneFormat

/** The `format` a {@link VaultRecord} carries, and the first part of every wayin's ctx. */
export const VaultFormat = 'safebyok-vault-v6'

/** The `format` a {@link VaultTombstone} carries, which tells it from a vault record stored in the same place. */
export const TombstoneFormat = 'safebyok-tombstone-v1'
// --

// == [Wayin kinds]: wayinKindVals, wayinkind, WayinKind, PasskeySaltBytes, isPrfSalt

/** The kinds of wayin, each with a record shape and a slot of the gate of its own: a `passphrase` the user types, or a `passkey` the user touches. */
export const wayinKindVals = ['passphrase', 'passkey'] as const

/** The check of a wayin's kind, as a caller names the slot of the gate it means: one of {@link wayinKindVals}. Its `parse` refuses 'bad_option'.
 *
 * @example wayinkind.safeParse('passkey').success   // true
 */
export const wayinkind = Checker(({ oneof }) => oneof(wayinKindVals), 'bad_option')
export type WayinKind = typeof wayinKindVals[number]

/** How many random bytes a passkey wayin's `prf_salt_b64` holds.
 * A new passkey's {@link PasskeyAnswer} carries a fresh salt this long, as `createPasskey` mints.
 */
export const PasskeySaltBytes = 32

/** True for a passkey wayin's salt as its kind makes one: base64url text of {@link PasskeySaltBytes} bytes. A stored one that is not marks the wayin damaged; a new passkey's answer over one that is not is refused. */
export const isPrfSalt = (prf_salt_b64: string): boolean => fromB64OrNull(prf_salt_b64)?.length === PasskeySaltBytes
// --

// == [The records]: passphraseWayinRecord, passkeyWayinRecord, wayinRecord, gateRecord, vaultRecord, vaultSparse, vaultStamp, vaultStampButFormat, vaultTombstone, gateSparse, passphraseWayinSparse, passkeyWayinSparse, passphraseWayinHeader, passkeyWayinHeader, WayinHeader, headerOf, vaultDraft

/** The vault's stored records and the shapes sliced from them: each wayin, the gate holding them, the vault record holding the gate, and the tombstone a deletion leaves.
 * Each record is strict: a field this version does not know is damage. A VaultDB reads each back
 * through these, and refuses what fails as 'damaged_vault'. Each shape is the record's own fields,
 * picked or left out; a part's shapes nest as the part does. A shape taken out of whatever carries
 * it strips the rest: a Vault object, its record or its snapshot passes as its stamp or its sparse
 * shape.
 *
 * @example vaultRecord.safeParse(await myBackend.getRow(id)).success   // false for a row that is no vault record
 * @example vaultSparse.parse(omit(record, ['gate']))                    // the record without its gate
 */
export const { passphraseWayinRecord, passkeyWayinRecord, wayinRecord, gateRecord, vaultRecord, vaultSparse, vaultStamp, vaultStampButFormat, vaultTombstone, gateSparse, passphraseWayinSparse, passkeyWayinSparse, passphraseWayinHeader, passkeyWayinHeader } = Checkers('bad_record', ({ obj, uint, int, lit, discrim, applabel, user_id, vaultlabel, epochMillis, key_deriver_label, salt_b64, device_id, vault_key_wayin_wrapped, credential_id, prf_salt_b64, vault_tok }) => {
  const passphraseWayinRecord = obj({
    wayinkind:               lit('passphrase'),
    /** Which keyDeriverSpec made the passphraseKey: `argon2id_web_v1`, or a host's own label. */
    key_deriver_label,
    /** This wayin's passphraseSalt: fresh for every passphrase the vault takes. */
    salt_b64,
    /** The sealing device's random id for the vault, from its device record: never drawn from the device itself. */
    device_id,
    /** When this wayin was sealed: a new passphrase stamps it afresh. */
    registered_at:           epochMillis,
    /** The vaultKey, wrapped under the passphraseKey: unwrapping it is the passphrase check. */
    vault_key_wayin_wrapped,
  }).strict()

  const passkeyWayinRecord = obj({
    wayinkind:               lit('passkey'),
    /** The WebAuthn credential's id, base64url, as `PublicKeyCredential.id` gives it: which passkey to ask. */
    credential_id,
    /** The salt the passkey's PRF is evaluated over: `PasskeySaltBytes` random bytes, fresh for every wayin. */
    prf_salt_b64,
    /** The adding device's random id for the vault, from its device record: never drawn from the device itself. */
    device_id,
    /** When this wayin was added. */
    registered_at:           epochMillis,
    /** The vaultKey, wrapped under the passkeyKey: unwrapping it is the passkey check. */
    vault_key_wayin_wrapped,
  }).strict()

  const wayinRecord = discrim('wayinkind', [passphraseWayinRecord, passkeyWayinRecord])

  const gateRecord = obj({
    /** The vault's passphrase wayin, which every gate has. */
    passphrase:              passphraseWayinRecord,
    /** The vault's passkey wayin, or null when it has none: at most one. */
    passkey:                 passkeyWayinRecord.nullable(),
  }).strict()

  // The record's fields, before its one rule across them: what every shape is sliced from, since
  // Zod slices no object that carries a refinement.
  const vaultRecordFields = obj({
    format:                  lit(VaultFormat),
    applabel,
    user_id,
    vaultlabel,
    /** A random token minted when the vault is made, never changed, and bound into every encryption. */
    vault_tok,
    /** When the vault was made; never changed. */
    registered_at:           epochMillis,
    /** A counter the store bumps on every write of the vault record and on the vault's deletion, and carries on into a new life of the scope.
     * It only goes up; a device that has seen a higher one than storage shows knows storage was rolled back.
     * No box write moves it, and a writer's own value is ignored: the store decides.
     */
    vault_epoch:             uint,
    /** A counter that moves up by one at every write of the gate: 0 while the vault is novel, with no gate, and 1 or more once it has one. */
    gate_epoch:              uint,
    /** The vault's ways in, or null while it is novel. */
    gate:                    gateRecord.nullable(),
  }).strict()

  const vaultRecord = vaultRecordFields.refine((record) => (record.gate === null) === (record.gate_epoch === 0), { error: Phrases.GateEpochAndGate, path: ['gate_epoch'] })

  const vaultSparse = vaultRecordFields.omit({ gate: true }).strip()
  const vaultStamp = vaultRecordFields.pick({ format: true, applabel: true, user_id: true, vaultlabel: true, vault_tok: true, registered_at: true }).strip()
  // Any format: a box and a lease bind their vault's stamp without it, so a new vault format leaves them open.
  const vaultStampButFormat = vaultStamp.omit({ format: true })
  const vaultTombstone = vaultRecordFields.pick({ applabel: true, user_id: true, vaultlabel: true }).extend({ format: lit(TombstoneFormat), vault_epoch: int.positive() }).strict()

  const passphraseWayinSparse = passphraseWayinRecord.omit({ key_deriver_label: true, salt_b64: true, vault_key_wayin_wrapped: true })
  const passkeyWayinSparse = passkeyWayinRecord.omit({ vault_key_wayin_wrapped: true })
  const gateSparse = gateRecord.extend({ passphrase: passphraseWayinSparse, passkey: passkeyWayinSparse.nullable() })

  const passphraseWayinHeader = passphraseWayinRecord.omit({ vault_key_wayin_wrapped: true })
  const passkeyWayinHeader = passkeyWayinRecord.omit({ vault_key_wayin_wrapped: true })

  return { passphraseWayinRecord, passkeyWayinRecord, wayinRecord, gateRecord, vaultRecord, vaultSparse, vaultStamp, vaultStampButFormat, vaultTombstone, gateSparse, passphraseWayinSparse, passkeyWayinSparse, passphraseWayinHeader, passkeyWayinHeader }
}, [FX])

/** A passphrase wayin as stored: the vaultKey wrapped under the passphraseKey the passphrase and this wayin's passphraseSalt make.
 * Every other field is visible, and bound into that wrap, so a wayin altered or moved to another
 * vault refuses to open. A gate holds exactly one, as its `passphrase`.
 */
export type PassphraseWayinRecord = Z.infer<typeof passphraseWayinRecord>

/** A passkey wayin as stored: the vaultKey wrapped under the passkeyKey made from the authenticator's PRF answer over this wayin's salt.
 * The authenticator holds the secret. Every other field is visible, and bound into that wrap. A
 * gate holds at most one, as its `passkey`.
 */
export type PasskeyWayinRecord = Z.infer<typeof passkeyWayinRecord>

/** One wayin as stored, a {@link PassphraseWayinRecord} or a {@link PasskeyWayinRecord}, told apart by `wayinkind`; `Wayin.make` reads one. */
export type WayinRecord = Z.infer<typeof wayinRecord>

/** A vault's ways in as stored, its gate: the passphrase's wayin, and the passkey's or null.
 * The vault record holds it as its `gate`, null while the vault is novel. Each wayin wraps the one
 * vaultKey, and none opens without its cleartext.
 *
 * @example { passphrase: passphraseWayinRecord, passkey: null }
 */
export type GateRecord = Z.infer<typeof gateRecord>

/** The one record per vault that every device syncs: its {@link VaultStamp}, its two epochs, and its gate. None of it opens without a passphrase or passkey.
 * `vault_epoch` moves at every write of the record; `gate_epoch` at every write of the gate. A
 * novel vault, as `VaultDB.ensureVault` first stores it, has `gate_epoch` 0 and `gate` null; its
 * first gate is written over it at `gate_epoch` 1, expecting 0. The record's check holds
 * `gate_epoch` 0 exactly when `gate` is null. The record and its gate are written in one
 * compare-and-write; a shape that wants no gate leaves it out ({@link VaultSparse}).
 *
 * @example { format: 'safebyok-vault-v6', ...scope, vault_tok, registered_at, vault_epoch: 0, gate_epoch: 0, gate: null }
 * @example { format: 'safebyok-vault-v6', ...scope, vault_tok, registered_at, vault_epoch: 3, gate_epoch: 2, gate: { passphrase, passkey: null } }
 */
export type VaultRecord = Z.infer<typeof vaultRecord>

/** A vault record as storage may hold it: typed as a {@link VaultRecord} is written, though it may fail its check and read back damaged.
 * It names what a VaultDB's `doGetVault` may hand up as `vault`, beside a sound record, a
 * tombstone, and null: present, dead, broken, missing. The base class's check tells them apart.
 */
export type DamagedVaultRecord = Z.input<typeof vaultRecord>

/** A vault record without its gate: its stamp and both epochs, the shape wherever the gate is not needed.
 *
 * @example { format: 'safebyok-vault-v6', applabel: 'acme', user_id: 'u1', vaultlabel: 'main', vault_tok: 'Qm9vdA', registered_at, vault_epoch: 3, gate_epoch: 2 }
 */
export type VaultSparse = Z.infer<typeof vaultSparse>

/** The fields of a vault record fixed for the vault's life: its `format`, scope, `vault_tok` and `registered_at`, never an epoch, which counts.
 *
 * @example { format: 'safebyok-vault-v6', applabel: 'acme', user_id: 'u1', vaultlabel: 'main', vault_tok: 'Qm9vdA', registered_at }
 */
export type VaultStamp = Z.infer<typeof vaultStamp>

/** A vault's stamp as what lies in it binds it: every field of its {@link VaultStamp} but the format, so a new vault format leaves each box and lease open.
 *
 * @example vaultStampButFormat.parse(vault)   // { applabel: 'acme', user_id: 'u1', vaultlabel: 'main', vault_tok: 'Qm9vdA', registered_at }
 */
export type VaultStampButFormat = Z.infer<typeof vaultStampButFormat>

/** The check of what a thing carries of the vault it was made under, as `vault.demandConsistentWith` judges it: a `vault_tok`, and each of the scope's labels and epochs the thing carries checked as the vault record checks it. Its `parse` refuses 'bad_option', naming each failing field.
 * Taken out of whatever carries it, it strips the rest: a box's own `format` or `registered_at`
 * is no part of it.
 *
 * @example vaultMadeUnder.parse(box)                          // { applabel, user_id, vaultlabel, vault_tok, vault_epoch, gate_epoch }
 * @example vaultMadeUnder.parse({ gate_epoch: 1 })            // throws 'bad_option', "vault_tok: ..."
 */
export const vaultMadeUnder = Checker(() => (
  vaultSparse.pick({ vault_tok: true, applabel: true, user_id: true, vaultlabel: true, vault_epoch: true, gate_epoch: true })
    .partial({ applabel: true, user_id: true, vaultlabel: true, vault_epoch: true, gate_epoch: true })
), 'bad_option')

/** What a thing carries of the vault it was made under, as `vault.demandConsistentWith` judges it: the vault's `vault_tok`, and whichever of its scope and epochs the thing carries.
 * A Box, a Lease, a Gate, a Proving, a snapshot and a vault record are each one. A field the
 * thing has of its own beside these, a box's `format` or `registered_at`, is no part of it.
 *
 * @example vault.demandConsistentWith(box)
 * @example vault.demandConsistentWith({ vault_tok: vault.vault_tok, gate_epoch: 0 })   // throws 'gate_moved' for a vault with a way in
 */
export type VaultMadeUnder = Z.infer<typeof vaultMadeUnder>

/** A vault record whose gate is made: what {@link isGated} tells apart, and what every gating but a vault's first works on. */
export type GatedVaultRecord = VaultRecord & { gate: GateRecord }

/** The check of a {@link VaultDraft}, as `VaultDB.ensureVault` takes one. Its `parse` refuses 'bad_record'. */
export const vaultDraft = Checker(({ lit }) => vaultSparse.extend({ vault_epoch: lit(0), gate_epoch: lit(0), gate: lit(null) }).strict())

/** A novel vault record, as `bank.ensureVault` drafts it and `VaultDB.ensureVault` first stores it: no gate, `gate_epoch` 0, and `vault_epoch` 0, as the store sets the counter.
 *
 * @example { format: 'safebyok-vault-v6', ...scope, vault_tok, registered_at: now, vault_epoch: 0, gate_epoch: 0, gate: null }
 */
export type VaultDraft = Z.infer<typeof vaultDraft>

/** What a deleted vault leaves in its scope: its counter, which the next life of the scope carries on.
 * `vault_epoch` is the deleted vault's plus one. Every write refuses over a tombstone as it does
 * over no vault, a deletion included: it holds no `vault_tok` for an expectation to name. The next
 * `ensureVault` of the scope replaces it with a new life.
 *
 * @example { format: 'safebyok-tombstone-v1', ...scope, vault_epoch: 4 }
 */
export type VaultTombstone = Z.infer<typeof vaultTombstone>

/** A passphrase wayin without its wrap, its salt or its key deriver's label: what a guess at the passphrase needs is left out. */
export type PassphraseWayinSparse = Z.infer<typeof passphraseWayinSparse>

/** A passkey wayin without its wrap: what to ask the authenticator with, and when and by which device it was added. */
export type PasskeyWayinSparse = Z.infer<typeof passkeyWayinSparse>

/** A gate as a host may see it while the vault is locked: each wayin as its sparse shape. */
export type GateSparse = Z.infer<typeof gateSparse>

/** A passphrase wayin's visible fields: its record but the wrap, which the wrap is bound to. */
export type PassphraseWayinHeader = Z.infer<typeof passphraseWayinHeader>

/** A passkey wayin's visible fields: its record but the wrap, which the wrap is bound to. */
export type PasskeyWayinHeader = Z.infer<typeof passkeyWayinHeader>

/** A wayin's visible header, every field but its wrap: what the wrap is bound to. A {@link PassphraseWayinHeader} or a {@link PasskeyWayinHeader}, told apart by `wayinkind`. */
export type WayinHeader = PassphraseWayinHeader | PasskeyWayinHeader

/** True for a vault record whose gate is made, as opposed to a novel one's: its `gate` there to read.
 *
 * @example if (isGated(record)) { offerUnlock(record.gate.passphrase) } else { offerNewPassphrase() }
 */
export const isGated = <RecordT extends Pick<VaultRecord, 'gate'>>(record: RecordT): record is RecordT & { gate: GateRecord } => record.gate !== null

/** `record` without its gate, frozen: its {@link VaultSparse}, every other field as it is.
 *
 * @example vaultSparseOf(record).gate_epoch === record.gate_epoch   // true, and no gate to read
 */
export const vaultSparseOf = (record: VaultRecord): VaultSparse => {
  const { gate: _gate, ...sparse } = record
  return Object.freeze(sparse)
}

/** `record`'s visible fields, its header: every field but the wrap, which a proving of that wayin seals over and its wrap's ctx binds.
 *
 * @example await PassphraseProving.seal(vault, headerOf(vaultRecord.gate.passphrase), typed, { gating })
 */
export function headerOf(record: PassphraseWayinRecord): PassphraseWayinHeader
export function headerOf(record: PasskeyWayinRecord): PasskeyWayinHeader
export function headerOf(record: WayinRecord): WayinHeader
export function headerOf(record: WayinRecord): WayinHeader {
  const { vault_key_wayin_wrapped: _wrapped, ...header } = record
  return header
}

/** `gate` as a host may see it, frozen through: its {@link GateSparse}, each wayin without what a guess at the passphrase would start from or what opens the vault.
 *
 * @example gateSparseOf(record.gate).passphrase   // { wayinkind: 'passphrase', device_id, registered_at }: no salt, key deriver label or wrap
 */
export const gateSparseOf = (gate: GateRecord): GateSparse => {
  const { key_deriver_label: _deriver, salt_b64: _salt, vault_key_wayin_wrapped: _passphraseWrap, ...passphrase } = gate.passphrase
  if (gate.passkey === null) { return Object.freeze({ passphrase: Object.freeze(passphrase), passkey: null }) }
  const { vault_key_wayin_wrapped: _passkeyWrap, ...passkey } = gate.passkey
  return Object.freeze({ passphrase: Object.freeze(passphrase), passkey: Object.freeze(passkey) })
}
// --

// == [Wayin summaries]: PassphraseWayinSummary, PasskeyWayinSummary, WayinSummary

/** A vault's passphrase wayin as a log line or a `damaged_wayin` refusal's `meta.wayin_listed` shows it: its {@link PassphraseWayinSparse} and its `vault_tok`.
 * The `device_id` is one per device per vault, so it links nothing the vault does not already
 * link. A snapshot's `gate` shows the sparse shape alone.
 *
 * @example err.meta?.wayin_listed   // { wayinkind: 'passphrase', device_id: 'k3x9...', registered_at: 1760000000000, vault_tok: 'v7q2...' }
 */
export type PassphraseWayinSummary = PassphraseWayinSparse & Pick<VaultRecord, 'vault_tok'>

/** A vault's passkey wayin as a log line or a `damaged_wayin` refusal's `meta.wayin_listed` shows it: its {@link PasskeyWayinSparse} and its `vault_tok`.
 * A snapshot's `gate` shows the sparse shape alone.
 *
 * @example err.meta?.wayin_listed   // { wayinkind: 'passkey', device_id, registered_at, vault_tok, credential_id: 'AXk3...', prf_salt_b64: 'q83v...' }
 */
export type PasskeyWayinSummary = PasskeyWayinSparse & Pick<VaultRecord, 'vault_tok'>

/** A wayin of either kind as a log line shows it, told apart by `wayinkind`: what a `damaged_wayin` refusal's `meta.wayin_listed` holds. */
export type WayinSummary = PassphraseWayinSummary | PasskeyWayinSummary
// --

// == [Proofs]: passphraseCleartext, PassphraseCleartext, PrfAnswerBytes, passkeyAnswer, PasskeyAnswer, freshPasskeyAnswer

/** The check for a passphrase's cleartext, the text the user typed: any string, blank included. Its `parse` refuses 'bad_option', quoting none of it.
 * What a blank one means is the gating's to say.
 *
 * @example passphraseCleartext.parse(typed)   // a PassphraseCleartext, for the key deriver
 * @example passphraseCleartext.parse(42)      // throws 'bad_option', "A passphrase is the text the user typed, as a string"
 */
export const passphraseCleartext = Checker(() => zodString({ error: Phrases.PassphraseNotText }).brand<'PassphraseCleartext'>(), 'bad_option')

/** A passphrase's cleartext once {@link passphraseCleartext} has parsed it: the only text the key deriver is handed. */
export type PassphraseCleartext = Z.infer<typeof passphraseCleartext>

/** How many bytes a passkey's PRF answers with: always 32, by the WebAuthn PRF extension. */
export const PrfAnswerBytes = 32

/** What a passkey's answer must carry: its credential's id, the salt it answered for, and its PRF bytes, judged by their tag, so bytes from an iframe pass. Its `parse` refuses 'bad_option', quoting none of it, as its bytes are secret.
 * An answer already used, its bytes zeroed by the proving sealed of it, is refused too: sealed
 * again, it would make a key anyone could rebuild.
 *
 * @example passkeyAnswer.parse(await askPasskey(vault.snapshot.gate))
 * @example passkeyAnswer.parse(usedAnswer)   // throws 'bad_option': its bytes were zeroed at its first use
 */
export const passkeyAnswer = objCheck(({ str, bytes, credential_id }) => ({
  /** Base64url, as `PublicKeyCredential.id` gives it. */
  credential_id,
  prf_salt_b64:  str.min(1),
  /** 32 bytes, as good as the passphrase for this vault: hand them to the gating, then drop them. */
  prfBytes:      bytes(PrfAnswerBytes).refine((prfBytes) => prfBytes.reduce((seen, byte) => seen | byte, 0) !== 0, Phrases.PasskeyAnswerUsed),
}), { refuseAs: 'bad_option', extras: 'strip' }, [FX])

/** A passkey's answer when asked for a vault's PRF: the cleartext a gating takes for a passkey. `safebyok-react`'s `askPasskey` makes one.
 * An `unlock_vault` gating takes it in `attemptPasskey`; `initialize_gate` and `put_passkey` take
 * it in `attempt`, beside the passphrase.
 *
 * @example
 *   const passkey = await askPasskey(vault.getSnapshot().gate)   // null when the user dismissed it
 *   if (passkey !== null) { await gating.attemptPasskey(passkey) }   // an unlock_vault gating's
 */
export type PasskeyAnswer = Z.infer<typeof passkeyAnswer>

/** A new passkey's answer, as `safebyok-react`'s `createPasskey` gives it: a passkey's answer, over a fresh salt of {@link PasskeySaltBytes} bytes as base64url text. Its `parse` refuses 'bad_option', quoting none of it.
 * A passkey wayin sealed over another salt would read as damaged at every later unlock.
 *
 * @example freshPasskeyAnswer.parse(await createPasskey(opts))   // passes
 * @example freshPasskeyAnswer.parse({ ...answer, prf_salt_b64: 'c2hvcnQ' })   // throws 'bad_option'
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

/** The checks of a `strengthChecker` and of the verdict it answers, each refusing 'bad_option'. */
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
