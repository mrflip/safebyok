/** What the vaultDB and the deviceDB store and take, and their helpers. Imported as `VS`. */

import type * as Z from 'zod'
import { Checker, Checkers, objCheck } from '../helpers/validator'
import { randomId } from '../helpers/crypto'
import * as EX from './shapes-enums'
import * as CX from './shapes-core'
import { sidecar } from './shapes-core'

// == [Sentinels and formats]: VoidRevisionTok, VoidRevisionSeq, VoidLifeTok, VoidTime, BoxFormat, VaultFormat, VoidRevision

/** The `revision_tok` of a void row, and of a birth's prior: no populated row ever holds it. */
export const VoidRevisionTok = '00000000-0000-0000-0000-000000000000'
/** The `revision_seq` of a void row, and of a birth's prior: every populated row holds 0 or more. */
export const VoidRevisionSeq = -1
/** The `box_tok` or `vault_tok` of a void row: no life ever minted holds it. */
export const VoidLifeTok = '00000000-0000-0000-0000-000000000000'
/** The `registered_at` and `written_at` of a void row: 2008-08-08T08:08:08.777Z, plain on sight. */
export const VoidTime = 1_218_182_888_777
export const BoxFormat = 5001
export const VaultFormat = 6001
/** The revision of a void row, and of a birth's prior. */
export const VoidRevision = { revision_tok: VoidRevisionTok, revision_seq: VoidRevisionSeq } as const

// --

// == [Checkers]: am, revision, times, vaulted, sparseBase, the scopes, the wayins, gate, the vault's and box's forms, the verbs' params and options

export const {
  am, revision, times, vaulted, sparseBase, bankScope, vaultScope, boxscope, boxQuery, watchScope,
  passphraseWayin, passkeyWayin, gate, vaultSparse, vaultRecord, vaultTombstone, vaultRow,
  boxSparse, boxRecord, boxTombstone, boxRow,
  replacePassphraseParams, passkeyAddParams, revokePasskeyParams,
  ifAbsentOpts, putOpts, putVaultOpts, delOpts, reqParams, rowPeek, fmtPeek,
} = Checkers('invalid_input', ({ obj, lit, int, uint, num, unk, oneof, discrim, applabel, user_id, vaultlabel, boxlabel, epochMillis, revision_tok, vault_tok, box_tok, device_id, key_deriver_label, credential_id, salt_b64, prfSalt, vault_key_wayin_wrapped, box_key_wrapped, whisper_ciphered }) => {
  const revision = obj({
    revision_tok,
    /** A counter the writer moves at every put and del: of two revisions, the higher `revision_seq` is the newer. */
    revision_seq: int,
  })
  const am = oneof(EX.amVals)
  const times = obj({
    /** When this life of the thing began: the `written_at` of its birth, kept by every later revision of that life. */
    registered_at: epochMillis,
    /** When the record in hand was written; on a tombstone, when it was deleted. */
    written_at:    epochMillis,
  })
  const vaulted = obj({ vault_tok })
  const sparseBase = obj({ ...revision.shape, ...times.shape, am, ...vaulted.shape })

  const bankScope  = obj({ applabel, user_id })
  const vaultScope = bankScope.extend({ vaultlabel })
  const boxscope   = vaultScope.extend({ boxlabel })
  const boxQuery   = boxscope.extend({ vault_tok })
  const watchScope = bankScope.extend({ vaultlabel: vaultlabel.optional() })

  const passphraseWayin = obj({ wayinkind: lit('passphrase'), key_deriver_label, salt_b64, device_id, registered_at: epochMillis, vault_key_wayin_wrapped }).strict()
  const passkeyWayin    = obj({ wayinkind: lit('passkey'), credential_id, prf_salt_b64: prfSalt, device_id, registered_at: epochMillis, vault_key_wayin_wrapped }).strict()
  const gate            = obj({ gate_epoch: uint.positive(), passphrase_wayin: passphraseWayin, passkey_wayin: passkeyWayin.nullable() }).strict()

  const vaultSparse    = vaultScope.extend({ fmt: lit(VaultFormat), ...sparseBase.shape })
  const vaultRecord    = vaultSparse.extend({ am: lit('a'), gate }).strict()
  const vaultTombstone = vaultSparse.extend({ am: lit('x') }).strict()
  const vaultRow       = discrim('am', [vaultRecord, vaultTombstone])

  const boxSparse = boxscope.extend({
    fmt: lit(BoxFormat),
    ...sparseBase.shape,
    /** The life of the box under its boxlabel: minted at its birth, and kept by every later revision. */
    box_tok,
    /** How the whisper became the bytes ciphered: `json_v1`, its JSON with every object's keys sorted, as UTF-8. */
    whisper_codec:          lit('json_v1'),
    /** Which generation of the whisper's own shape this box holds: 1, the only one so far. */
    whisper_schema_version: lit(1),
  })
  const boxRecord = boxSparse.extend({
    am: lit('a'),
    sidecar,
    /** This box's boxKey, wrapped under the vaultKey. */
    box_key_wrapped,
    /** The whisper, ciphered under this box's boxKey. */
    whisper_ciphered,
  }).strict()
  const boxTombstone = boxSparse.extend({ am: lit('x') }).strict()
  const boxRow       = discrim('am', [boxRecord, boxTombstone])

  // A vault record holding a gate that holds the wayin. A verb's other wayin is admitted here so that the vaultDB can refuse it 'gate_issue', against the row it read.
  const gateParams = vaultSparse.extend({ am: lit('a') })
  const replacePassphraseParams = gateParams.extend({ gate: obj({ passphrase_wayin: passphraseWayin, passkey_wayin: unk.optional() }).strict() }).strict()
  const passkeyAddParams        = gateParams.extend({ gate: obj({ passkey_wayin: passkeyWayin, passphrase_wayin: unk.optional() }).strict() }).strict()
  const revokePasskeyParams     = gateParams.extend({ gate: obj({ passkey_wayin: lit(null), passphrase_wayin: unk.optional() }).strict() }).strict()

  const ifAbsentOpts = obj({ ifAbsent: oneof(EX.ifAbsentVals).default('fail') })
  const putIfAbsent = oneof(EX.putIfAbsentVals).default('add')
  const putOpts = obj({ prior: revision, ifAbsent: putIfAbsent, ifPresent: oneof(EX.ifPresentVals).default('repl') })
  const putVaultOpts = obj({ prior: revision, ifAbsent: putIfAbsent, ifPresent: oneof(['fail', 'get']).default('fail') })
  const delOpts = obj({ prior: revision })

  const reqParams = obj({ applabel, user_id, vaultlabel, boxlabel, vault_tok, box_tok, ...revision.shape, prior: revision }).partial()
  const rowPeek   = obj({ ...revision.shape, am, vault_tok })
  const fmtPeek   = obj({ fmt: num })

  return {
    am, revision, times, vaulted, sparseBase, bankScope, vaultScope, boxscope, boxQuery, watchScope,
    passphraseWayin, passkeyWayin, gate, vaultSparse, vaultRecord, vaultTombstone, vaultRow,
    boxSparse, boxRecord, boxTombstone, boxRow,
    replacePassphraseParams, passkeyAddParams, revokePasskeyParams,
    ifAbsentOpts, putOpts, putVaultOpts, delOpts, reqParams, rowPeek, fmtPeek,
  }
}, [CX])

export const vaultDBOpts = objCheck(({ num }) => ({ clock: CX.clockShape.optional(), maxRecordBytes: num.positive().optional() }), 'bad_option')
export const memoryVaultDBOpts = objCheck(({ uint }) => ({ ...vaultDBOpts.shape, maxBoxes: uint.optional() }), 'bad_option')

export type Times          = Readonly<Z.infer<typeof times>>
export type Revision       = Readonly<Z.infer<typeof revision>>
export type BankScope      = Readonly<Z.infer<typeof bankScope>>
export type VaultScope     = Readonly<Z.infer<typeof vaultScope>>
export type Boxscope       = Readonly<Z.infer<typeof boxscope>>
export type BoxQuery       = Readonly<Z.infer<typeof boxQuery>>
export type WatchScope     = Readonly<Z.input<typeof watchScope>>
export type Gate           = Readonly<Z.infer<typeof gate>>
export type VaultSparse    = Readonly<Z.infer<typeof vaultSparse>>
export type VaultRecord    = Readonly<Z.infer<typeof vaultRecord>>
export type VaultTombstone = Readonly<Z.infer<typeof vaultTombstone>>
export type VaultRow       = VaultRecord | VaultTombstone
export type BoxSparse      = Readonly<Z.infer<typeof boxSparse>>
export type BoxRecord      = Readonly<Z.infer<typeof boxRecord>>
export type BoxTombstone   = Readonly<Z.infer<typeof boxTombstone>>
export type BoxRow         = BoxRecord | BoxTombstone
export type ReplacePassphraseParams = Readonly<Z.input<typeof replacePassphraseParams>>
export type AddPasskeyParams        = Readonly<Z.input<typeof passkeyAddParams>>
export type RevokePasskeyParams     = Readonly<Z.input<typeof revokePasskeyParams>>
export type DamagedVault = VaultSparse & Readonly<{ damagekind: EX.Damagekind }>
export type DamagedBox   = BoxSparse & Readonly<{ damagekind: EX.Damagekind }>
export type IfAbsentOpts = Readonly<Z.input<typeof ifAbsentOpts>>
export type PutOpts = Readonly<Z.input<typeof putOpts>>
/** A vault row is replaced only by a gate verb: `putVault` births one, or finds one in the way. */
export type PutVaultOpts = Readonly<Z.input<typeof putVaultOpts>>
export type DelOpts = Readonly<Z.input<typeof delOpts>>
export type ReqParams = Readonly<Z.infer<typeof reqParams>>
export type VaultDBOpts = Readonly<Z.input<typeof vaultDBOpts>>
export type MemoryVaultDBOpts = Readonly<Z.input<typeof memoryVaultDBOpts>>
// --

// == [Capacity]: capacity, Capacity

/** How much room a vault has: boxes against the most it holds, and bytes against the most its storage holds of one vault.
 * A vault reckons it from its last read; a VaultDB from storage, in `getCapacity` and a
 * `vault_full`'s `meta.capacity`. Either is an estimate: storage checks again on every write, and
 * its answer wins. A limit storage reports as `Infinity` reads as `Number.MAX_SAFE_INTEGER`. Its
 * `parse` refuses 'bad_record'.
 *
 * @example { boxes: { used: 12, max: 100 }, bytes: { used: 48_000, max: 1_000_000 } }
 */
export const capacity = objCheck(({ obj, union, int, uint, lit }) => {
  // A storage adapter's `Infinity`, its way of saying it sets no limit, is kept as the largest
  // safe integer, as Bank.make keeps a declared limit: past this check, no limit is infinite.
  const roomLimit = union([int.positive(), lit(Infinity)]).transform((most) => Math.min(most, Number.MAX_SAFE_INTEGER))
  const room      = obj({ used: uint, max: roomLimit })
  return { boxes: room, bytes: room }
}, { extras: 'strip' })
export type Capacity = Z.infer<typeof capacity>
// --

// == [Row helpers]: reqParamsOf, revisionOf, nextRevisionOf, isRowAt, isLiveRow, isLiveRowUnder, isCheckedLiveVault, isLifeOver, isTombstoneRow, sentinelVaultOf, sentinelBoxOf, isNewerFormat, damagedVaultOf, damagedBoxOf, isDamagedVaultAt, isDamagedBoxAt, boxTombstoneOf

/** The request's safe metadata, for an answer to carry; empty when any of it fails its check, as a bad field may be anything. */
export const reqParamsOf = (args: unknown): ReqParams => {
  const parsed = reqParams.safeParse(args)
  return parsed.success ? parsed.data : {}
}

export const revisionOf = ({ revision_tok, revision_seq }: Revision): Revision => ({ revision_tok, revision_seq })

export const nextRevisionOf = ({ revision_seq }: Revision, written_at: number) => ({ revision_tok: randomId(), revision_seq: revision_seq + 1, written_at })

const peekOf = (raw: unknown) => {
  const parsed = rowPeek.safeParse(raw)
  return parsed.success ? parsed.data : null
}

/** True when `raw`, a stored row or null for a void one, stands at `prior`. A store's conditional put is atomic on this. */
export const isRowAt = (raw: unknown, prior: Revision): boolean => {
  if (raw === null) { return (prior.revision_tok === VoidRevisionTok) && (prior.revision_seq === VoidRevisionSeq) }
  const peek = peekOf(raw)
  return (peek?.revision_tok === prior.revision_tok) && (peek.revision_seq === prior.revision_seq)
}

export const isLiveRow = (raw: unknown): boolean => (peekOf(raw)?.am === 'a')

/** True when `raw` is a live row of the life `vault_tok`. */
export const isLiveRowUnder = (raw: unknown, vault_tok: string): boolean => (isLiveRow(raw) && (peekOf(raw)?.vault_tok === vault_tok))

/** True when `raw` passes a vault row's checks, live in the life `vault_tok`. */
export const isCheckedLiveVault = (raw: unknown, vault_tok: string): boolean => {
  const parsed = vaultRow.safeParse(raw)
  return parsed.success && (parsed.data.am === 'a') && (parsed.data.vault_tok === vault_tok)
}

/** True when `raw` is no row, a tombstone, or a row of another life, so the boxes under `vault_tok` belong to nothing. A row past peeking might be theirs, and is false. */
export const isLifeOver = (raw: unknown, vault_tok: string): boolean => {
  if (raw === null) { return true }
  const peek = peekOf(raw)
  return (peek !== null) && ((peek.am === 'x') || (peek.vault_tok !== vault_tok))
}

export const isTombstoneRow = (raw: unknown): boolean => (peekOf(raw)?.am === 'x')

const sentinelTimes = { registered_at: VoidTime, written_at: VoidTime }

/** The tombstone of a vault row nothing holds. A damaged listing's label comes from storage, and is not checked here: it is part of what is reported. */
export const sentinelVaultOf = ({ applabel, user_id, vaultlabel }: VaultScope, vault_tok: string = VoidLifeTok): VaultTombstone => ({
  applabel, user_id, vaultlabel, fmt: VaultFormat, ...VoidRevision, ...sentinelTimes, am: 'x', vault_tok,
})

/** The tombstone of a box row nothing holds. */
export const sentinelBoxOf = ({ applabel, user_id, vaultlabel, boxlabel }: Boxscope, vault_tok: string): BoxTombstone => ({
  applabel, user_id, vaultlabel, boxlabel, fmt: BoxFormat, ...VoidRevision, ...sentinelTimes, am: 'x', vault_tok, box_tok: VoidLifeTok, whisper_codec: 'json_v1', whisper_schema_version: 1,
})

/** True when `raw` names a format past `ownFormat`: a row a newer version of the app wrote. */
export const isNewerFormat = (raw: unknown, ownFormat: number): boolean => {
  const peek = fmtPeek.safeParse(raw)
  return peek.success && (peek.data.fmt > ownFormat)
}

const damagekindOf = (raw: unknown, ownFormat: number): EX.Damagekind => (isNewerFormat(raw, ownFormat) ? 'format_mismatch' : 'damaged_record')

/** A vault row that failed validation, in the one shape: `am` 'd', with sentinels where the row cannot be read. */
export const damagedVaultOf = (scope: VaultScope, raw: unknown): DamagedVault => ({ ...sentinelVaultOf(scope), ...peekOf(raw), am: 'd', damagekind: damagekindOf(raw, VaultFormat) })

/** A box row that failed validation, in the one shape: `am` 'd', with sentinels where the row cannot be read. */
export const damagedBoxOf = (scope: Boxscope, vault_tok: string, raw: unknown): DamagedBox => ({ ...sentinelBoxOf(scope, vault_tok), ...peekOf(raw), vault_tok, am: 'd', damagekind: damagekindOf(raw, BoxFormat) })

/** True when `raw` fails a vault row's checks, and `tombstone` over `prior` names it as `damaged_records` lists it: `am` 'd' at its revision and `vault_tok`, or their sentinels. */
export const isDamagedVaultAt = (raw: unknown, tombstone: VaultTombstone, prior: Revision): boolean => {
  if ((raw === null) || vaultRow.safeParse(raw).success) { return false }
  const listed = damagedVaultOf(tombstone, raw)
  return (listed.vault_tok === tombstone.vault_tok) && isRowAt(listed, prior)
}

/** True when `raw` fails a box row's checks, and `prior` names it as `damaged_records` lists it. */
export const isDamagedBoxAt = (raw: unknown, tombstone: BoxTombstone, prior: Revision): boolean => (
  (raw !== null) && (! boxRow.safeParse(raw).success) && isRowAt(damagedBoxOf(tombstone, tombstone.vault_tok, raw), prior)
)

/** The tombstone a vault's deletion leaves for a box row, or null for a row already one or past reading. */
export const boxTombstoneOf = (raw: unknown, written_at: number): BoxTombstone | null => {
  const parsed = boxRow.safeParse(raw)
  if ((! parsed.success) || (parsed.data.am === 'x')) { return null }
  return { ...boxSparse.parse(parsed.data), ...nextRevisionOf(parsed.data, written_at), am: 'x' }
}
// --

// == [The deviceDB]: leaseQuery, leaseSparse, leaseRow, deviceRecord, cutoff, LeaseQuery, LeaseSparse, LeaseRow, DeviceRecord

export const leaseQuery = Checker(({ obj, applabel, user_id, vaultlabel, vault_tok }) => obj({ applabel, user_id, vaultlabel, vault_tok }), 'bad_scope', [CX])

/** A lease row is structural here: the lease's own shape is the models'. The rest of it is carried as it came, a `lease_key` handle included. */
export const { leaseSparse, leaseRow, deviceRecord } = Checkers('bad_record', ({ obj, epochMillis, applabel, user_id, vaultlabel, vault_tok, device_id }) => {
  const leaseSparse = obj({ applabel, user_id, vaultlabel, vault_tok, proved_at: epochMillis })
  return { leaseSparse, leaseRow: leaseSparse.loose(), deviceRecord: obj({ applabel, user_id, device_id }).strict() }
}, [CX])

export const cutoff = Checker(({ epochMillis }) => epochMillis, 'bad_option')

export type LeaseQuery   = Z.infer<typeof leaseQuery>
export type LeaseSparse  = Z.infer<typeof leaseSparse>
export type LeaseRow     = Z.infer<typeof leaseRow>
export type DeviceRecord = Z.infer<typeof deviceRecord>
// --
