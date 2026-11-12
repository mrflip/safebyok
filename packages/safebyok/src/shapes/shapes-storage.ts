/** What the bankDB and the deviceDB share: the box rows a bank's extend, the policies, and the deviceDB's rows. Imported as `SX`. */

import type * as Z from 'zod'
import { Checker, Checkers, objCheck, objStrip } from '../helpers/validator'
import { randomId } from '../helpers/crypto'
import * as EX from './shapes-enums'
import * as CX from './shapes-core'
import { type VaultScope, sidecar } from './shapes-core'

// == [Shells and formats]: VoidRevisionTok, VoidRevisionSeq, VoidLifeTok, VoidTime, BoxFormat, VoidRevision

/** The `revision_tok` of a void row, and of a birth's prior: no populated row ever has it. */
export const VoidRevisionTok = '00000000-0000-0000-0000-000000000000'
/** The `revision_seq` of a void row, and of a birth's prior: every populated row has 0 or more. */
export const VoidRevisionSeq = -1
/** The `box_tok` or `vault_tok` of a void row: no life ever minted has it. */
export const VoidLifeTok = '00000000-0000-0000-0000-000000000000'
/** The `registered_at` and `written_at` of a void row: 2008-08-08T08:08:08.777Z, plain on sight. */
export const VoidTime = 1_218_182_888_777
/** The `fmt` every box row carries. */
export const BoxFormat = 5002
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

// == [Scopes]: watchScope, boxTidy, WatchScope, BoxTidyAsk

// A scope's validator is CX's, frozen; `unwrap()` is its object, to extend. A tidying's ask is its scope and its `op`, so it refuses as a scope does.
/** The checks of the scope of a watch, and of the ask of `tidyGone`. */
export const { watchScope, boxTidy } = Checkers('bad_scope', ({ lit, vaultlabel, bankScope }) => ({
  watchScope: bankScope.unwrap().extend({ vaultlabel: vaultlabel.optional() }),
  boxTidy:    bankScope.unwrap().extend({ op: lit('tidy_gone') }),
}), [CX])

export type WatchScope = Readonly<Z.input<typeof watchScope>>
/** A `tidyGone` ask: the bank's scope. */
export type BoxTidyAsk = Readonly<Z.output<typeof boxTidy>>
// --

// == [Wayins]: passphraseWayinRecord, passkeyWayinRecord

/** The checks of the wayins as stored. */
export const { passphraseWayinRecord, passkeyWayinRecord } = Checkers('bad_option', ({ obj, lit, epochMillis, key_deriver_label, credential_id, salt_b64, prfSalt, device_tok, bank_key_wayin_wrapped }) => ({
  passphraseWayinRecord: obj({ wayinkind: lit('passphrase'), key_deriver_label, salt_b64, device_tok, registered_at: epochMillis, bank_key_wayin_wrapped }).strict(),
  passkeyWayinRecord:    obj({ wayinkind: lit('passkey'), credential_id, prf_salt_b64: prfSalt, device_tok, registered_at: epochMillis, bank_key_wayin_wrapped }).strict(),
}), [CX])
// --

// == [Damaged rows]: DamagedVault, DamagedRow

/** A vault row that failed validation, named by where it is stored: its scope, under whatever label storage has, and `am` 'd'. */
export type DamagedVault   = Readonly<{ user_id: string, banklabel: string, vaultlabel: string, am: 'd' }>
/** A vault row or a box row that failed validation, named by where it is stored.
 * A damaged row never indicates format drift: it is thrown by the bankDB tied to the datastore.
 */
export type DamagedRow     = DamagedVault | DamagedBox
// --

// == [Box forms]: boxSparse, boxRecord, boxTombstone, BoxSparse, BoxRecord, BoxTombstone, BoxRow, DamagedBox

/** The checks of a box's stored forms, which a bank's extend: its sparse fields, its live record and its tombstone. */
export const { boxSparse, boxRecord, boxTombstone } = Checkers('bad_option', ({ lit, box_tok, box_key_wrapped, whisper_ciphered }) => {
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
    /** This box's boxKey, wrapped under the bankKey. */
    box_key_wrapped,
    /** The whisper, ciphered under this box's boxKey. */
    whisper_ciphered,
  }).strict()
  const boxTombstone = boxSparse.extend({ am: lit('x') }).strict()
  return { boxSparse, boxRecord, boxTombstone }
}, [CX])

export type BoxSparse    = Readonly<Z.infer<typeof boxSparse>>
export type BoxRecord    = Readonly<Z.infer<typeof boxRecord>>
export type BoxTombstone = Readonly<Z.infer<typeof boxTombstone>>
/** A box row as stored: live, or a tombstone. */
export type BoxRow       = BoxRecord | BoxTombstone
/** A box row that failed validation, named by where it is stored: its scope, under whatever label storage has, its vault's `vault_tok`, and `am` 'd'. */
export type DamagedBox   = Readonly<{ user_id: string, banklabel: string, vaultlabel: string, boxlabel: string, vault_tok: string, am: 'd' }>
// --

// == [Policies]: ifPresent, ifAbsent, putIfAbsent, anyIfAbsent

/** The checks of an ask's policies: `ifPresent`, a get's `ifAbsent`, a put's `ifAbsent`, and either `ifAbsent`, as an answer's ask may carry. */
export const { ifPresent, ifAbsent, putIfAbsent, anyIfAbsent } = Checkers('bad_option', ({ oneof, union }) => {
  const ifAbsent    = oneof(EX.ifAbsentVals)
  const putIfAbsent = oneof(EX.putIfAbsentVals)
  return { ifPresent: oneof(EX.ifPresentVals), ifAbsent, putIfAbsent, anyIfAbsent: union([ifAbsent, putIfAbsent]) }
})
// --

// == [Options]: putOpts, PutOpts

/** The check of a put's options through a listing: the row it expects to find, and its policies. */
export const putOpts = objCheck(({ obj, orDefault }) => ({
  // The row a put expects to find is parsed here as a row's meta, and its other fields, a life tok among them, are kept for code that knows its kind.
  expected:  obj({ ...revision.shape, am }).loose(),
  ifAbsent:  orDefault(putIfAbsent, 'add'),
  ifPresent: orDefault(ifPresent, 'repl'),
}), 'bad_option', [CX])

export type PutOpts = Readonly<Z.input<typeof putOpts>>
// --

// == [Capacity]: capacity, Capacity

/** How full a vault is: its box rows against their cap, and its bytes against the most its storage allows for one vault.
 * The box rows are every box of the vault's life, live and deleted together. A `vault_full` refusal
 * carries the bankDB's count in `meta.capacity`, as an estimate: storage checks again on every
 * write. A limit storage reports as `Infinity` reads as `Number.MAX_SAFE_INTEGER`.
 *
 * @example { boxes: { used: 12, max: 100 }, bytes: { used: 48_000, max: 1_000_000 } }
 */
export const capacity = objCheck(({ obj, union, int, uint, lit }) => {
  // A storage adapter's `Infinity`, its way of saying it sets no limit, is kept as the largest
  // safe integer, as Device.make keeps a declared limit: past this check, no limit is infinite.
  const roomLimit = union([int.positive(), lit(Infinity)]).transform((most) => Math.min(most, Number.MAX_SAFE_INTEGER))
  const room      = obj({ used: uint, max: roomLimit })
  return { boxes: room, bytes: room }
}, { extras: 'strip' })
export type Capacity = Z.infer<typeof capacity>
// --

// == [Row helpers]: rowMeta, revisionPins, revisionOf, nextRevisionOf, isRowAt, isLiveRow, damagedVaultOf

/** The check that reads a row's revision and liveness without judging the rest. */
export const rowMeta = objStrip(({ vault_tok }) => ({ ...revision.shape, am, vault_tok }), 'bad_option', [CX])

// Not an ask: what a caller pins when it names a row by a scope or a record of any form.
/** The check of the revision and life tokens a scope or record carries, each one optional, every other field dropped. */
export const revisionPins = objStrip(({ int, revision_tok, vault_tok, box_tok }) => ({
  revision_tok: revision_tok.optional(),
  revision_seq: int.optional(),
  vault_tok:    vault_tok.optional(),
  box_tok:      box_tok.optional(),
}), 'bad_option', [CX])

/** The {@link Revision} fields of a row. */
export const revisionOf = ({ revision_tok, revision_seq }: Revision): Revision => ({ revision_tok, revision_seq })

/** Fresh revision fields for the next write, written at `written_at`. */
export function nextRevisionOf({ revision_seq }: Revision, written_at: number) { return { revision_tok: randomId(), revision_seq: revision_seq + 1, written_at } }

function metaOf(raw: unknown) {
  const parsed = rowMeta.safeParse(raw)
  return parsed.success ? parsed.data : null
}

/** True when `raw`, a stored row or null for a void one, stands at `prior`. Storage's conditional put is atomic on this. */
export function isRowAt(raw: unknown, prior: Revision): boolean {
  if (raw === null) { return (prior.revision_tok === VoidRevisionTok) && (prior.revision_seq === VoidRevisionSeq) }
  const meta = metaOf(raw)
  return (meta?.revision_tok === prior.revision_tok) && (meta.revision_seq === prior.revision_seq)
}

/** True when `raw` is a live row. */
export function isLiveRow(raw: unknown): boolean { return (metaOf(raw)?.am === 'a') }

/** A listing's entry for a vault row that failed validation. Its label comes from storage, unchecked: it is part of what is reported. */
export function damagedVaultOf({ user_id, banklabel, vaultlabel }: VaultScope): DamagedVault { return { user_id, banklabel, vaultlabel, am: 'd' } }
// --

// == [The deviceDB]: leaseQuery, leaseDated, leaseRow, LeaseQuery, LeaseDated, LeaseRow, leaseScopepath, LeaseScopepath, RawLease, deviceRow, DeviceRow

/** A lease row is structural here: the lease's own shape is the models'. The rest of it is carried as it came, a `lease_key` handle included. */
export const { leaseQuery, leaseDated, leaseRow } = Checkers('bad_option', ({ epochMillis, bankScope, bank_tok }) => {
  const leaseQuery = bankScope.unwrap().extend({ bank_tok })
  const leaseDated = leaseQuery.extend({ proved_at: epochMillis })
  return { leaseQuery, leaseDated, leaseRow: leaseDated.loose() }
}, [CX])

/** A bank scope under its `bank_tok`: which lease row a deviceDB verb means. */
export type LeaseQuery   = Z.infer<typeof leaseQuery>
/** A stowed lease as the deviceDB dates it: its query and its `proved_at`. */
export type LeaseDated   = Z.infer<typeof leaseDated>
export type LeaseRow     = Z.infer<typeof leaseRow>

// Two strings, and no label rules: `forgetRawLease` is for reaching a row filed under labels today's checks refuse.
/** The check of a lease scopepath, as `forgetRawLease` accepts one: two strings. */
export const leaseScopepath = Checker(({ tuple, str }) => tuple([str, str]), 'bad_scope')

/** Where a device database files a bank's lease row: its user_id and banklabel, as stored. */
export type LeaseScopepath = [user_id: string, banklabel: string]

/** A lease row as stored, unchecked, beside the scopepath it is filed under. */
export type RawLease = { scopepath: LeaseScopepath, row: unknown }

true satisfies Z.core.util.AssertEqual<LeaseScopepath, Z.infer<typeof leaseScopepath>>

/** The device row: the `device_tok` this device goes by in one bank scope, and the version of safebyok that last asked for it. */
export const deviceRow = objCheck(({ str, user_id, banklabel, device_tok }) => ({ user_id, banklabel, device_tok, package_version: str.min(1) }), 'bad_record', [CX])

export type DeviceRow = Z.infer<typeof deviceRow>
// --
