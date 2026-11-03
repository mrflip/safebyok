/** The vaultDB's records, its verbs' params and their checkers, imported as `VS`. Every `parse` refuses 'invalid_input', quoting none of it; a stored row is judged by `safeParse`. */

import type * as Z from 'zod'
import { Checkers, objCheck } from '../checks/validator'
import { FarPast } from '../consts'
import { randomId } from '../crypto'
import { sidecar } from '../shapes/box'
import * as FX from '../shapes/fields'
import * as HX from '../shapes/host-code'

// == [Sentinels and formats]: NeverStoredTok, NeverStoredSeq, BoxFormat, VaultFormat, NeverStored

/** The `revision_tok` a birth names as its prior: no populated row ever holds it. */
export const NeverStoredTok = 'deadbeef-never-stored'
/** The `revision_seq` a birth names as its prior: every populated row holds 0 or more. */
export const NeverStoredSeq = -1
export const BoxFormat = 5001
export const VaultFormat = 6001
/** What a void row matches: the prior of a birth over a row never stored. */
export const NeverStored = { revision_tok: NeverStoredTok, revision_seq: NeverStoredSeq } as const
// --

// == [Checkers]: revision, bankScope, vaultScope, boxscope, boxQuery, watchScope, vaultRecord, boxRecord and their tombstones, sparse forms and rows, the gate verbs' params, the verbs' opts, reqParams, the peeks

export const amVals = ['a', 'd', 'x'] as const
export const ifAbsentVals = ['fail', 'nil'] as const
export const ifPresentVals = ['repl', 'fail', 'get'] as const

export const {
  revision, bankScope, vaultScope, boxscope, boxQuery, watchScope,
  passphraseWayin, passkeyWayin, gate, vaultSparse, vaultRecord, vaultTombstone, vaultRow,
  boxSparse, boxRecord, boxTombstone, boxRow,
  replacePassphraseParams, passkeyAddParams, revokePasskeyParams,
  ifAbsentOpts, putOpts, delOpts, reqParams, rowPeek, fmtPeek,
} = Checkers('invalid_input', ({ obj, lit, int, uint, num, unk, oneof, discrim, applabel, user_id, vaultlabel, boxlabel, epochMillis, revision_tok, vault_tok, box_tok, device_id, key_deriver_label, credential_id, salt_b64, prfSalt, vault_key_wayin_wrapped, box_key_wrapped, whisper_ciphered }) => {
  const revision = obj({ revision_tok, revision_seq: int })
  const am = oneof(amVals)
  const sparseBase = obj({ ...revision.shape, registered_at: epochMillis, written_at: epochMillis, am, vault_tok })

  const bankScope  = obj({ applabel, user_id })
  const vaultScope = bankScope.extend({ vaultlabel })
  const boxscope   = vaultScope.extend({ boxlabel })
  const boxQuery   = boxscope.extend({ vault_tok })
  const watchScope = bankScope.extend({ vaultlabel: vaultlabel.optional() })

  const passphraseWayin = obj({ wayinkind: lit('passphrase'), key_deriver_label, salt_b64, device_id, registered_at: epochMillis, vault_key_wayin_wrapped }).strict()
  const passkeyWayin    = obj({ wayinkind: lit('passkey'), credential_id, prf_salt_b64: prfSalt, device_id, registered_at: epochMillis, vault_key_wayin_wrapped }).strict()
  const gate            = obj({ gate_epoch: uint, passphrase_wayin: passphraseWayin, passkey_wayin: passkeyWayin.nullable() }).strict()

  const vaultSparse    = vaultScope.extend({ fmt: lit(VaultFormat), ...sparseBase.shape })
  const vaultRecord    = vaultSparse.extend({ am: lit('a'), gate }).strict()
  const vaultTombstone = vaultSparse.extend({ am: lit('x') }).strict()
  const vaultRow       = discrim('am', [vaultRecord, vaultTombstone])

  const boxSparse    = boxscope.extend({ fmt: lit(BoxFormat), ...sparseBase.shape, box_tok, whisper_codec: lit('json_v1'), whisper_schema_version: lit(1) })
  const boxRecord    = boxSparse.extend({ am: lit('a'), sidecar, box_key_wrapped, whisper_ciphered }).strict()
  const boxTombstone = boxSparse.extend({ am: lit('x') }).strict()
  const boxRow       = discrim('am', [boxRecord, boxTombstone])

  // A vault record holding a gate that holds the wayin. A verb's other wayin is admitted here so that the vaultDB can refuse it 'gate_issue', against the row it read.
  const gateParams = vaultSparse.extend({ am: lit('a') })
  const replacePassphraseParams = gateParams.extend({ gate: obj({ passphrase_wayin: passphraseWayin, passkey_wayin: unk.optional() }).strict() }).strict()
  const passkeyAddParams        = gateParams.extend({ gate: obj({ passkey_wayin: passkeyWayin, passphrase_wayin: unk.optional() }).strict() }).strict()
  const revokePasskeyParams     = gateParams.extend({ gate: obj({ passkey_wayin: lit(null), passphrase_wayin: unk.optional() }).strict() }).strict()

  const ifAbsentOpts = obj({ ifAbsent: oneof(ifAbsentVals).default('fail') })
  const putOpts = obj({ prior: revision, ifPresent: oneof(ifPresentVals).default('repl') })
  const delOpts = obj({ prior: revision })

  const reqParams = obj({ applabel, user_id, vaultlabel, boxlabel, vault_tok, box_tok, ...revision.shape, prior: revision }).partial()
  const rowPeek   = obj({ ...revision.shape, am, vault_tok })
  const fmtPeek   = obj({ fmt: num })

  return {
    revision, bankScope, vaultScope, boxscope, boxQuery, watchScope,
    passphraseWayin, passkeyWayin, gate, vaultSparse, vaultRecord, vaultTombstone, vaultRow,
    boxSparse, boxRecord, boxTombstone, boxRow,
    replacePassphraseParams, passkeyAddParams, revokePasskeyParams,
    ifAbsentOpts, putOpts, delOpts, reqParams, rowPeek, fmtPeek,
  }
}, [FX])

export const vaultDBOpts = objCheck(({ num }) => ({ clock: HX.clockShape.optional(), maxRecordBytes: num.positive().optional() }), 'bad_option')
export const memoryVaultDBOpts = objCheck(({ uint }) => ({ ...vaultDBOpts.shape, maxBoxes: uint.optional() }), 'bad_option')

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
export type IfAbsentOpts = Readonly<Z.input<typeof ifAbsentOpts>>
export type PutOpts = Readonly<Z.input<typeof putOpts>>
export type DelOpts = Readonly<Z.input<typeof delOpts>>
export type ReqParams = Readonly<Z.infer<typeof reqParams>>
export type VaultDBOpts = Readonly<Z.input<typeof vaultDBOpts>>
export type MemoryVaultDBOpts = Readonly<Z.input<typeof memoryVaultDBOpts>>
// --

// == [Row helpers]: reqParamsOf, revisionOf, nextRevisionOf, isRowAt, isLiveRow, isLiveRowUnder, isCheckedLiveVault, isLifeOver, isTombstoneRow, sentinelVaultOf, sentinelBoxOf, damagedVaultOf, damagedBoxOf, boxTombstoneOf

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
  if (raw === null) { return (prior.revision_tok === NeverStoredTok) && (prior.revision_seq === NeverStoredSeq) }
  const peek = peekOf(raw)
  return (peek?.revision_tok === prior.revision_tok) && (peek.revision_seq === prior.revision_seq)
}

export const isLiveRow = (raw: unknown): boolean => (peekOf(raw)?.am === 'a')

/** True when `raw` is a live row of the life `vault_tok`. */
export const isLiveRowUnder = (raw: unknown, vault_tok: string): boolean => (isLiveRow(raw) && (peekOf(raw)?.vault_tok === vault_tok))

/** True when `raw` passes a vault row's checks, live in the life `vault_tok`: a box write lands only under one, as the base refuses any other. */
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

const sentinelTimes = { registered_at: FarPast, written_at: FarPast }

/** The tombstone of a vault row nothing holds. A damaged listing's label comes from storage, and is not checked here: it is part of what is reported. */
export const sentinelVaultOf = ({ applabel, user_id, vaultlabel }: VaultScope, vault_tok: string = NeverStoredTok): VaultTombstone => ({
  applabel, user_id, vaultlabel, fmt: VaultFormat, ...NeverStored, ...sentinelTimes, am: 'x', vault_tok,
})

/** The tombstone of a box row nothing holds. */
export const sentinelBoxOf = ({ applabel, user_id, vaultlabel, boxlabel }: Boxscope, vault_tok: string): BoxTombstone => ({
  applabel, user_id, vaultlabel, boxlabel, fmt: BoxFormat, ...NeverStored, ...sentinelTimes, am: 'x', vault_tok, box_tok: NeverStoredTok, whisper_codec: 'json_v1', whisper_schema_version: 1,
})

/** A vault row that failed validation, in the one shape: `am` 'd', with sentinels where the row cannot be read. */
export const damagedVaultOf = (scope: VaultScope, raw: unknown): VaultSparse => ({ ...sentinelVaultOf(scope), ...peekOf(raw), am: 'd' })

/** A box row that failed validation, in the one shape: `am` 'd', with sentinels where the row cannot be read. */
export const damagedBoxOf = (scope: Boxscope, vault_tok: string, raw: unknown): BoxSparse => ({ ...sentinelBoxOf(scope, vault_tok), ...peekOf(raw), vault_tok, am: 'd' })

/** The tombstone a vault's deletion leaves for a box row, or null for a row already one or past reading. */
export const boxTombstoneOf = (raw: unknown, written_at: number): BoxTombstone | null => {
  const parsed = boxRow.safeParse(raw)
  if ((! parsed.success) || (parsed.data.am === 'x')) { return null }
  return { ...boxSparse.parse(parsed.data), ...nextRevisionOf(parsed.data, written_at), am: 'x' }
}
// --
