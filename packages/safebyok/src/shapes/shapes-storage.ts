/** What the vaultDB and the deviceDB write and accept, and their helpers. Imported as `SX`. */

import type * as Z from 'zod'
import { Checker, Checkers, objCheck, objStrip } from '../helpers/validator'
import * as Phrases from '../helpers/phrases'
import { randomId } from '../helpers/crypto'
import * as EX from './shapes-enums'
import * as CX from './shapes-core'
import { type Boxscope, type VaultScope, sidecar } from './shapes-core'

// == [Sentinels and formats]: VoidRevisionTok, VoidRevisionSeq, VoidLifeTok, VoidTime, BoxFormat, VaultFormat, VoidRevision

/** The `revision_tok` of a void row, and of a birth's prior: no populated row ever has it. */
export const VoidRevisionTok = '00000000-0000-0000-0000-000000000000'
/** The `revision_seq` of a void row, and of a birth's prior: every populated row has 0 or more. */
export const VoidRevisionSeq = -1
/** The `box_tok` or `vault_tok` of a void row: no life ever minted has it. */
export const VoidLifeTok = '00000000-0000-0000-0000-000000000000'
/** The `registered_at` and `written_at` of a void row: 2008-08-08T08:08:08.777Z, plain on sight. */
export const VoidTime = 1_218_182_888_777
/** The `fmt` every box row carries. */
export const BoxFormat = 5001
/** The `fmt` every vault row carries. */
export const VaultFormat = 6001
/** The revision of a void row, and of a birth's prior. */
export const VoidRevision = { revision_tok: VoidRevisionTok, revision_seq: VoidRevisionSeq } as const

// --

// == [Record bases]: am, revision, times, vaulted, sparseBase, Revision, Times

/** What every stored row has in common: its `am`, its revision, its times and its vault's `vault_tok`, and `sparseBase`, the four together. */
export const { am, revision, times, vaulted, sparseBase } = Checkers('bad_option', ({ obj, int, oneof, epochMillis, revision_tok, vault_tok }) => {
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
  return { am, revision, times, vaulted, sparseBase }
}, [CX])

export type Revision = Readonly<Z.infer<typeof revision>>
export type Times    = Readonly<Z.infer<typeof times>>
// --

// == [Scopes]: vaultQuery, boxQuery, watchScope, VaultQuery, BoxQuery, WatchScope

// A scope's validator is CX's, frozen; `unwrap()` is its object, to extend.
/** The checks of a vaultDB verb's request: a vault or box scope under its `vault_tok`, and the scope of a watch. */
export const { vaultQuery, boxQuery, watchScope } = Checkers('bad_scope', ({ vaultlabel, vault_tok, bankScope, vaultScope, boxscope }) => ({
  vaultQuery: vaultScope.unwrap().extend({ vault_tok }),
  boxQuery:   boxscope.unwrap().extend({ vault_tok }),
  watchScope: bankScope.unwrap().extend({ vaultlabel: vaultlabel.optional() }),
}), [CX])

export type VaultQuery = Readonly<Z.infer<typeof vaultQuery>>
export type BoxQuery   = Readonly<Z.infer<typeof boxQuery>>
export type WatchScope = Readonly<Z.input<typeof watchScope>>
// --

// == [Wayins and gate]: passphraseWayinRecord, passkeyWayinRecord, gate, Gate

/** The checks of the wayins as stored, and of the gate that has them. */
export const { passphraseWayinRecord, passkeyWayinRecord, gate } = Checkers('bad_option', ({ obj, lit, uint, epochMillis, key_deriver_label, credential_id, salt_b64, prfSalt, device_id, vault_key_wayin_wrapped }) => {
  const passphraseWayinRecord = obj({ wayinkind: lit('passphrase'), key_deriver_label, salt_b64, device_id, registered_at: epochMillis, vault_key_wayin_wrapped }).strict()
  const passkeyWayinRecord    = obj({ wayinkind: lit('passkey'), credential_id, prf_salt_b64: prfSalt, device_id, registered_at: epochMillis, vault_key_wayin_wrapped }).strict()
  const gate                  = obj({ gate_epoch: uint.positive(), passphrase_wayin: passphraseWayinRecord, passkey_wayin: passkeyWayinRecord.nullable() }).strict()
  return { passphraseWayinRecord, passkeyWayinRecord, gate }
}, [CX])

export type Gate = Readonly<Z.infer<typeof gate>>
// --

// == [Vault forms]: vaultSparse, vaultRecord, vaultTombstone, vaultRow, VaultSparse, VaultRecord, VaultTombstone, VaultRow, DamagedVault

/** The checks of a vault's stored forms: its sparse fields, its live record, its tombstone, and a row of either. */
export const { vaultSparse, vaultRecord, vaultTombstone, vaultRow } = Checkers('bad_option', ({ lit, discrim }) => {
  const vaultSparse    = CX.vaultScope.unwrap().extend({ fmt: lit(VaultFormat), ...sparseBase.shape })
  const vaultRecord    = vaultSparse.extend({ am: lit('a'), gate }).strict()
  const vaultTombstone = vaultSparse.extend({ am: lit('x') }).strict()
  const vaultRow       = discrim('am', [vaultRecord, vaultTombstone])
  return { vaultSparse, vaultRecord, vaultTombstone, vaultRow }
})

export type VaultSparse    = Readonly<Z.infer<typeof vaultSparse>>
export type VaultRecord    = Readonly<Z.infer<typeof vaultRecord>>
export type VaultTombstone = Readonly<Z.infer<typeof vaultTombstone>>
/** A vault row as stored: live, or a tombstone. */
export type VaultRow       = VaultRecord | VaultTombstone
/** A vault row that failed validation, named by where it is stored: its scope, under whatever label storage has, and `am` 'd'. */
export type DamagedVault   = Readonly<{ applabel: string, user_id: string, vaultlabel: string, am: 'd' }>
/** A vault row or a box row that failed validation, named by where it is stored.
 * A damaged row never indicates format drift: it is thrown by the vaultDB tied to the datastore.
 */
export type DamagedRow     = DamagedVault | DamagedBox
// --

// == [Box forms]: boxSparse, boxRecord, boxTombstone, boxRow, BoxSparse, BoxRecord, BoxTombstone, BoxRow, DamagedBox

/** The checks of a box's stored forms: its sparse fields, its live record, its tombstone, and a row of either. */
export const { boxSparse, boxRecord, boxTombstone, boxRow } = Checkers('bad_option', ({ lit, discrim, box_tok, box_key_wrapped, whisper_ciphered }) => {
  const boxSparse = CX.boxscope.unwrap().extend({
    fmt: lit(BoxFormat),
    ...sparseBase.shape,
    /** The life of the box under its boxlabel: minted at its birth, and kept by every later revision. */
    box_tok,
    /** How the whisper became the bytes ciphered: `json_v1`, its JSON with every object's keys sorted, as UTF-8. */
    whisper_codec:          lit('json_v1'),
    /** Which generation of the whisper's own shape this box has: 1, the only one so far. */
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
  return { boxSparse, boxRecord, boxTombstone, boxRow }
}, [CX])

export type BoxSparse    = Readonly<Z.infer<typeof boxSparse>>
export type BoxRecord    = Readonly<Z.infer<typeof boxRecord>>
export type BoxTombstone = Readonly<Z.infer<typeof boxTombstone>>
/** A box row as stored: live, or a tombstone. */
export type BoxRow       = BoxRecord | BoxTombstone
/** A box row that failed validation, named by where it is stored: its scope, under whatever label storage has, its vault's `vault_tok`, and `am` 'd'. */
export type DamagedBox   = Readonly<{ applabel: string, user_id: string, vaultlabel: string, boxlabel: string, vault_tok: string, am: 'd' }>
// --

// == [Rows found]: foundVaultRow, foundBoxRow, storedVaultRow, storedBoxRow

/** A vault row or box row as storage answers it, null for none where the check says `found`: one failing its checks refuses 'damaged_row'. */
export const { foundVaultRow, foundBoxRow, storedVaultRow, storedBoxRow } = Checkers('damaged_row', () => ({
  foundVaultRow:  vaultRow.nullable(),
  foundBoxRow:    boxRow.nullable(),
  storedVaultRow: vaultRow,
  storedBoxRow:   boxRow,
}))
// --

// == [Gate verbs' records]: passkeyAddRecord, passkeyRevokeRecord

/** The checks of the record `addPasskey` and `revokePasskey` are given: a vault record with a passkey wayin, and one with none. */
export const { passkeyAddRecord, passkeyRevokeRecord } = Checkers('bad_option', ({ lit }) => {
  const passkeyAddRecord    = vaultRecord.extend({ gate: gate.extend({ passkey_wayin: passkeyWayinRecord }).strict() }).strict()
  const passkeyRevokeRecord = vaultRecord.extend({ gate: gate.extend({ passkey_wayin: lit(null) }).strict() }).strict()
  return { passkeyAddRecord, passkeyRevokeRecord }
})
// --

// == [Options]: ifAbsentOpts, putOpts, gateVerbOpts, delOpts, reqParams, nextSeq, adapterVaultDBOpts, memoryVaultDBOpts, IfAbsentOpts, PutOpts, PutOptsGiven, GateVerbOpts, DelOpts, ReqParams, AdapterVaultDBOpts, MemoryVaultDBOpts

/** The checks of the options a vaultDB verb accepts, of a write's record against its prior revision, and of the safe metadata an answer carries. */
export const { ifAbsentOpts, putOptsGiven, putOpts, gateVerbOpts, delOpts, reqParams, nextSeq } = Checkers('bad_option', ({ obj, oneof, orDefault, box_tok }) => {
  const ifAbsentOpts = obj({ ifAbsent: orDefault(oneof(EX.ifAbsentVals), 'fail') })
  const putOptsGiven = obj({ prior: revision, ifAbsent: oneof(EX.putIfAbsentVals), ifPresent: oneof(EX.ifPresentVals) })
  const putOpts = obj({ ...putOptsGiven.shape, ifAbsent: orDefault(putOptsGiven.shape.ifAbsent, 'add'), ifPresent: orDefault(putOptsGiven.shape.ifPresent, 'repl') })
  // A gate verb and a deletion say for themselves what a put over a missing or present row does: neither takes ifAbsent or ifPresent.
  const gateVerbOpts = obj({ prior: revision }).strict()
  const delOpts = obj({ prior: revision }).strict()

  const reqParams = boxQuery.extend({ box_tok, ...revision.shape, prior: revision }).partial()
  const nextSeq = obj({ record: revision, prior: revision }).refine(({ record, prior }) => record.revision_seq === (prior.revision_seq + 1), Phrases.SeqNotNext)
  return { ifAbsentOpts, putOptsGiven, putOpts, gateVerbOpts, delOpts, reqParams, nextSeq }
}, [CX])

/** The check of an AdapterVaultDB's options, refusing 'bad_option'. */
export const adapterVaultDBOpts = objCheck(({ num }) => ({
  /** The most bytes one stored box record may weigh; `DefaultMaxRecordBytes` by default. */
  maxRecordBytes: num.positive().optional(),
}), 'bad_option')
/** The check of a memory vaultDB's options, refusing 'bad_option'. */
export const memoryVaultDBOpts = objCheck(({ uint }) => ({
  ...adapterVaultDBOpts.shape,
  // Best effort, not a hard cap: exact at moderate write rates; a strict cap would need concurrency machinery in every adapter.
  /** A soft cap on the live boxes one vault has; `DefaultMaxBoxes` by default. */
  maxBoxes: uint.optional(),
}), 'bad_option')

export type IfAbsentOpts = Readonly<Z.input<typeof ifAbsentOpts>>
export type PutOpts = Readonly<Z.input<typeof putOpts>>
/** A put's options as parsed, defaults filled in: what a subclass's `doPutVault` and `doPutBox` receive. */
export type PutOptsGiven = Readonly<Z.infer<typeof putOptsGiven>>
/** What a gate verb is told beside its record: the revision the record replaces. */
export type GateVerbOpts = Readonly<Z.input<typeof gateVerbOpts>>
export type DelOpts = Readonly<Z.input<typeof delOpts>>
export type ReqParams = Readonly<Z.infer<typeof reqParams>>
/** What an AdapterVaultDB's constructor accepts. */
export type AdapterVaultDBOpts = Readonly<Z.input<typeof adapterVaultDBOpts>>
/** What a memory vaultDB's constructor accepts. */
export type MemoryVaultDBOpts = Readonly<Z.input<typeof memoryVaultDBOpts>>
// --

// == [Capacity]: capacity, Capacity

/** How much room a vault has: boxes against the most it has, and bytes against the most its storage allows of one vault.
 * A vault reckons it from its last read; a VaultDB from storage, in `getCapacity` and a
 * `vault_full`'s `meta.capacity`. Either is an estimate: storage checks again on every write, and
 * its answer wins. A limit storage reports as `Infinity` reads as `Number.MAX_SAFE_INTEGER`.
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

// == [Row helpers]: rowMeta, reqParamsOf, revisionOf, nextRevisionOf, isRowAt, isLiveRow, isLiveVaultRecord, isLiveBoxRecord, isVaultPutAllowed, isBoxPutAllowed, isLifeOver, isTombstoneRow, sentinelVaultOf, sentinelBoxOf, damagedVaultOf, damagedBoxOf, boxTombstoneOf

/** The check that reads a row's revision and liveness without judging the rest. */
export const rowMeta = objStrip(({ vault_tok }) => ({ ...revision.shape, am, vault_tok }), 'bad_option', [CX])

/** The request's safe metadata, for an answer to carry; empty when any of it fails its check, as a bad field may be anything. */
export const reqParamsOf = (args: unknown): ReqParams => {
  const parsed = reqParams.safeParse(args)
  return parsed.success ? parsed.data : {}
}

/** The {@link Revision} fields of a row. */
export const revisionOf = ({ revision_tok, revision_seq }: Revision): Revision => ({ revision_tok, revision_seq })

/** Fresh revision fields for the next write, written at `written_at`. */
export const nextRevisionOf = ({ revision_seq }: Revision, written_at: number) => ({ revision_tok: randomId(), revision_seq: revision_seq + 1, written_at })

const metaOf = (raw: unknown) => {
  const parsed = rowMeta.safeParse(raw)
  return parsed.success ? parsed.data : null
}

/** True when `raw`, a stored row or null for a void one, stands at `prior`. Storage's conditional put is atomic on this. */
export const isRowAt = (raw: unknown, prior: Revision): boolean => {
  if (raw === null) { return (prior.revision_tok === VoidRevisionTok) && (prior.revision_seq === VoidRevisionSeq) }
  const meta = metaOf(raw)
  return (meta?.revision_tok === prior.revision_tok) && (meta.revision_seq === prior.revision_seq)
}

/** True when `raw` is a live row. */
export const isLiveRow = (raw: unknown): boolean => (metaOf(raw)?.am === 'a')

/** True when `raw` passes a vault row's checks, live in the life `vault_tok`. */
export const isLiveVaultRecord = (raw: unknown, vault_tok: string): boolean => {
  const parsed = vaultRow.safeParse(raw)
  return parsed.success && (parsed.data.am === 'a') && (parsed.data.vault_tok === vault_tok)
}

/** True when `raw` passes a box row's checks, live in the life `vault_tok`. */
export const isLiveBoxRecord = (raw: unknown, vault_tok: string): boolean => {
  const parsed = boxRow.safeParse(raw)
  return parsed.success && (parsed.data.am === 'a') && (parsed.data.vault_tok === vault_tok)
}

// A row that fails its check is never put over, whatever `prior` names: only `isRowAt` reads its meta, and it runs after the check.
// A put replaces a live row only within its own life: a new life is born over a tombstone or nothing.
const isPutAllowedOver = (found: { am: EX.Am } | null, isSameLife: boolean, ante: unknown, { prior, ifAbsent, ifPresent }: PutOptsGiven): boolean => (
  isRowAt(ante, prior) && ((found?.am === 'a') ? ((ifPresent === 'repl') && isSameLife) : (ifAbsent === 'add'))
)

/** True when `record` may be written over `ante`, the vault row stored there or null, under `opts`. */
export const isVaultPutAllowed = (ante: unknown, record: VaultRecord, opts: PutOptsGiven): boolean => {
  const found = foundVaultRow.safeParse(ante)
  return found.success && isPutAllowedOver(found.data, found.data?.vault_tok === record.vault_tok, ante, opts)
}

/** True when `record` may be written over `ante`, the box row stored there or null, under `opts`. */
export const isBoxPutAllowed = (ante: unknown, record: BoxRecord, opts: PutOptsGiven): boolean => {
  const found = foundBoxRow.safeParse(ante)
  return found.success && isPutAllowedOver(found.data, found.data?.box_tok === record.box_tok, ante, opts)
}

/** True when `raw` is no row, a tombstone, or a row of another life, so the boxes under `vault_tok` belong to nothing. A row failing its checks might be theirs, and is false. */
export const isLifeOver = (raw: unknown, vault_tok: string): boolean => {
  if (raw === null) { return true }
  const parsed = vaultRow.safeParse(raw)
  return parsed.success && ((parsed.data.am === 'x') || (parsed.data.vault_tok !== vault_tok))
}

/** True when `raw` is the tombstone of a deleted row. */
export const isTombstoneRow = (raw: unknown): boolean => (metaOf(raw)?.am === 'x')

const sentinelTimes = { registered_at: VoidTime, written_at: VoidTime }

/** The tombstone of a vault row that is not stored. */
export const sentinelVaultOf = ({ applabel, user_id, vaultlabel }: VaultScope, vault_tok: string = VoidLifeTok): VaultTombstone => ({
  applabel, user_id, vaultlabel, fmt: VaultFormat, ...VoidRevision, ...sentinelTimes, am: 'x', vault_tok,
})

/** The tombstone of a box row that is not stored. */
export const sentinelBoxOf = ({ applabel, user_id, vaultlabel, boxlabel }: Boxscope, vault_tok: string): BoxTombstone => ({
  applabel, user_id, vaultlabel, boxlabel, fmt: BoxFormat, ...VoidRevision, ...sentinelTimes, am: 'x', vault_tok, box_tok: VoidLifeTok, whisper_codec: 'json_v1', whisper_schema_version: 1,
})

/** A listing's entry for a vault row that failed validation. Its label comes from storage, unchecked: it is part of what is reported. */
export const damagedVaultOf = ({ applabel, user_id, vaultlabel }: VaultScope): DamagedVault => ({ applabel, user_id, vaultlabel, am: 'd' })

/** A listing's entry for a box row that failed validation. Its label comes from storage, unchecked: it is part of what is reported. */
export const damagedBoxOf = ({ applabel, user_id, vaultlabel, boxlabel }: Boxscope, vault_tok: string): DamagedBox => ({ applabel, user_id, vaultlabel, boxlabel, vault_tok, am: 'd' })

/** The tombstone a vault's deletion leaves for a box row, or null for a row already one or past reading. */
export const boxTombstoneOf = (raw: unknown, written_at: number): BoxTombstone | null => {
  const parsed = boxRow.safeParse(raw)
  if ((! parsed.success) || (parsed.data.am === 'x')) { return null }
  return { ...boxSparse.parse(parsed.data), ...nextRevisionOf(parsed.data, written_at), am: 'x' }
}
// --

// == [The deviceDB]: leaseQuery, leaseDated, leaseRow, LeaseQuery, LeaseDated, LeaseRow, leaseScopepath, LeaseScopepath, RawLease, bankRow, BankRow

/** A lease row is structural here: the lease's own shape is the models'. The rest of it is carried as it came, a `lease_key` handle included. */
export const { leaseQuery, leaseDated, leaseRow } = Checkers('bad_option', ({ epochMillis }) => {
  const leaseDated = vaultQuery.extend({ proved_at: epochMillis })
  return { leaseQuery: vaultQuery, leaseDated, leaseRow: leaseDated.loose() }
})

export type LeaseQuery   = Z.infer<typeof leaseQuery>
/** A stowed lease as the deviceDB dates it: its query and its `proved_at`. */
export type LeaseDated   = Z.infer<typeof leaseDated>
export type LeaseRow     = Z.infer<typeof leaseRow>

// Three strings, and no label rules: `forgetRawLease` is for reaching a row filed under labels today's checks refuse.
/** The check of a lease scopepath, as `forgetRawLease` accepts one: three strings. */
export const leaseScopepath = Checker(({ tuple, str }) => tuple([str, str, str]), 'bad_scope')

/** Where a device database files a vault's lease row: its applabel, user_id and vaultlabel, as stored. */
export type LeaseScopepath = [applabel: string, user_id: string, vaultlabel: string]

/** A lease row as stored, unchecked, beside the scopepath it is filed under. */
export type RawLease = { scopepath: LeaseScopepath, row: unknown }

true satisfies Z.core.util.AssertEqual<LeaseScopepath, Z.infer<typeof leaseScopepath>>

/** The bank row: the `device_id` this device goes by in one bank scope. */
export const bankRow = objCheck(({ applabel, user_id, device_id }) => ({ applabel, user_id, device_id }), 'bad_record', [CX])

export type BankRow      = Z.infer<typeof bankRow>
// --
