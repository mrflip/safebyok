import { v } from 'convex/values'
import type { Infer } from 'convex/values'
import { Expectations } from 'safebyok'
import { mutation, query } from './_generated/server'
import type { DatabaseReader, DatabaseWriter } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import * as Tallies from './tallies'
import {
  Capacity, NovelVaultRecord, VaultAnswer, VaultRecordExpectation, VaultDelExpectation, BoxSparse, BoxRecord, BoxGetExpectation, BoxExpectation, BoxDelExpectation, BoxDeletion, GetBoxAnswer, PutBoxAnswer, PutVaultRecordAnswer, VaultTombstone, VaultRecord, VaultScope, VaultSignature,
} from './validators'

/** The component's functions, one per verb of the core's `VaultDB`, reached through the host's `SafebyokComponent.api`.
 * That wrapper authenticates first: inside the component every call is trusted to be its
 * `user_id`'s own. Each function keeps the contract of the `VaultDB` method it serves, and says
 * only where it differs.
 *
 * Convex runs mutations serializably, so each check and its write hold together, and a query reads
 * one snapshot. A failed expectation is not an error: it resolves `false`, `null` for a box
 * deletion, or an answer naming what stands, which the client refuses as `stale_write`.
 *
 * Every vault is held to the limits in `./tallies`, whatever its client asks, so that it can
 * always be deleted whole. A delete is never refused for room.
 */

// ------------------------------------------------------------------------------- the vault

/** The vault record and every box without its two ciphered fields, from one query's snapshot, or null when the vault was never created. */
export const getVault = query({
  args:    { ...VaultScope.fields },
  returns: v.nullable(VaultAnswer),
  handler: async (ctx, scope) => {
    const row = await findVaultRecordRow(ctx.db, scope)
    return row && { vault: vaultRecordOfRow(row), boxes: boxSparsesOf(await vaultBoxRows(ctx.db, scope)) }
  },
})

/** Store `draft` only if its scope holds no vault record, and return whichever vault record stands there afterwards, with every box, from one transaction.
 * Over a tombstone the new vault's `vault_epoch` is the tombstone's, and the tombstone goes: a new
 * life, the counter carried on, as the core's `Expectations.newLifeOf` makes it.
 */
export const ensureVault = mutation({
  args:    { draft: NovelVaultRecord },
  returns: VaultAnswer,
  handler: async (ctx, { draft }) => {
    const scope = scopeOf(draft)
    const standing = await findVaultRecordRow(ctx.db, scope)
    if (standing) { return { vault: vaultRecordOfRow(standing), boxes: boxSparsesOf(await vaultBoxRows(ctx.db, scope)) } }
    const tombstone = await findTombstoneRow(ctx.db, scope)
    const life = Expectations.newLifeOf(draft, tombstone) ?? draft
    if (tombstone) { await ctx.db.delete('safebyok_vault_tombstones', tombstone._id) }
    await ctx.db.insert('safebyok_vaults', life)
    return { vault: life, boxes: boxSparsesOf(await vaultBoxRows(ctx.db, scope)) }
  },
})

// ------------------------------------------------------------------------------- the vault record

/** Replace the vault record, only while the one standing has `expected.vault_tok` and `expected.gate_epoch`, resolving a {@link PutVaultRecordAnswer}.
 * What lands is `vaultRecord` with its `vault_epoch` the standing one plus one, whatever it carries.
 * It also misses, writing nothing, for a vault record that names another vault or does not move
 * `gate_epoch` forward. A miss names the vault record standing, or null for none.
 */
export const putVaultRecord = mutation({
  args:    { vaultRecord: VaultRecord, expected: VaultRecordExpectation },
  returns: PutVaultRecordAnswer,
  handler: async (ctx, { vaultRecord, expected }): Promise<Infer<typeof PutVaultRecordAnswer>> => {
    const standing = await findVaultRecordRow(ctx.db, scopeOf(vaultRecord))
    // The core's comparison, then the server's own: the record written stays the vault's, its gate moving forward.
    const movesForward = standing !== null
      && Expectations.vaultRecordMeets(standing, expected)
      && vaultRecord.vault_tok === standing.vault_tok
      && vaultRecord.gate_epoch > standing.gate_epoch
    if (! movesForward) { return { landed: false, vault_stored: standing && vaultRecordOfRow(standing) } }
    const stored = Expectations.vaultRecordPutOf(vaultRecord, standing)
    await ctx.db.replace('safebyok_vaults', standing._id, stored)
    return { landed: true, vault_stored: stored }
  },
})

// ----------------------------------------------------------------------------- the boxes

/** Read the box under `boxlabel` as `VaultDB`'s `doGetBox` does, resolving a {@link GetBoxAnswer} where that throws.
 * The vault record and the box are read from one query's snapshot.
 */
export const getBox = query({
  args:    { ...VaultScope.fields, boxlabel: v.string(), expected: BoxGetExpectation },
  returns: GetBoxAnswer,
  handler: async (ctx, { boxlabel, expected, ...scope }): Promise<Infer<typeof GetBoxAnswer>> => {
    const vaultRow = await findVaultRecordRow(ctx.db, scope)
    if (! Expectations.vaultMeets(vaultRow, expected)) {
      return { read: false, refusalkind: 'vault_mismatch' }
    }
    const row = await findBoxRow(ctx.db, scope, boxlabel)
    return { read: true, box_stored: row && boxOfRow(row) }
  },
})

/** Write `box` as `VaultDB`'s `doPutBox` does, resolving a {@link PutBoxAnswer} where that throws.
 * Beside its refusals, it resolves `vault_full` for a write that would take the vault past {@link
 * Tallies.MaxVaultBoxes} boxes or {@link Tallies.MaxVaultBoxBytes} bytes and leave it larger: a new
 * box in a full vault, or a heavier replacement. A vault with no tally yet is counted first,
 * reading it once.
 */
export const putBox = mutation({
  args:    { ...VaultScope.fields, expected: BoxExpectation, box: BoxRecord },
  returns: PutBoxAnswer,
  handler: async (ctx, { expected, box, ...scope }): Promise<Infer<typeof PutBoxAnswer>> => {
    const vaultRow = await findVaultRecordRow(ctx.db, scope)
    if (vaultRow === null || ! Expectations.vaultMeets(vaultRow, expected)) {
      return { landed: false, refusalkind: 'vault_mismatch' }
    }
    const standing = await findBoxRow(ctx.db, scope, box.boxlabel)
    if (Expectations.boxRefusalOf(vaultRow, standing, expected)) {
      return { landed: false, refusalkind: 'stale_write', box_stored: standing && boxOfRow(standing) }
    }
    //
    const row = boxRowOf(scope, box)
    const reckoning = await Tallies.reckon(ctx.db, vaultRow._id, vaultBoxQuery(ctx.db, scope))
    const standingBytes = standing === null ? 0 : Tallies.weigh(standing)
    // A new row is weighed with Convex's estimate of an `_id` until it has one.
    const growthAs = (rowId?: Id<'safebyok_boxes'>) => ({
      box_count: standing === null ? 1 : 0,
      box_bytes: Tallies.weigh(row, rowId) - standingBytes,
    })
    if (Tallies.refuses(reckoning.tally, growthAs(standing?._id))) {
      return { landed: false, refusalkind: 'vault_full', capacity: Tallies.capacityOf(reckoning.tally) }
    }
    const rowId = standing === null
      ? await ctx.db.insert('safebyok_boxes', row)
      : await replaceBoxRow(ctx.db, standing._id, row)
    await Tallies.record(ctx.db, vaultRow._id, reckoning, growthAs(rowId))
    // The row just written, which this transaction reads back as it left it.
    const stored = await ctx.db.get('safebyok_boxes', rowId)
    if (stored === null) { throw new Error('A box row this mutation wrote could not be read back in the same transaction.') }
    return { landed: true, box_stored: boxOfRow(stored) }
  },
})

/** How full the vault is: its tally against the component's limits, as a box write checks them.
 * A vault with no tally yet is counted afresh, reading it once; a scope holding no vault is empty.
 */
export const getCapacity = query({
  args:    { ...VaultScope.fields },
  returns: Capacity,
  handler: async (ctx, scope) => {
    const vaultRow = await findVaultRecordRow(ctx.db, scope)
    if (vaultRow === null) { return Tallies.capacityOf({ box_count: 0, box_bytes: 0 }) }
    const { tally } = await Tallies.reckon(ctx.db, vaultRow._id, vaultBoxQuery(ctx.db, scope))
    return Tallies.capacityOf(tally)
  },
})

/** Remove the box under `boxlabel` as `VaultDB`'s `doDelBox` does, and take it off the vault's tally. */
export const delBox = mutation({
  args:    { ...VaultScope.fields, boxlabel: v.string(), expected: BoxDelExpectation },
  returns: v.nullable(BoxDeletion),
  handler: async (ctx, { boxlabel, expected, ...scope }): Promise<Infer<typeof BoxDeletion> | null> => {
    const vaultRow = await findVaultRecordRow(ctx.db, scope)
    if (vaultRow === null || ! Expectations.vaultMeets(vaultRow, expected)) { return null }
    const standing = await findBoxRow(ctx.db, scope, boxlabel)
    const deletion = Expectations.deletionOf(standing, expected)
    if (standing) {
      await ctx.db.delete('safebyok_boxes', standing._id)
      await Tallies.forget(ctx.db, vaultRow._id, standing)
    }
    return deletion
  },
})

// --------------------------------------------------------------------------------- the vault

/** Remove the vault record, every box and the tally in one transaction, only while the vault record has `expected.vault_tok` and, unless it is null, `expected.gate_epoch`, leaving a tombstone, which it resolves.
 * The tombstone takes the vault's place in the scope, its `vault_epoch` the vault's plus one.
 * Null when the vault record does not meet the expectation, or none stands.
 */
export const delVault = mutation({
  args:    { ...VaultScope.fields, expected: VaultDelExpectation },
  returns: v.nullable(VaultTombstone),
  handler: async (ctx, { expected, ...scope }): Promise<Infer<typeof VaultTombstone> | null> => {
    const vaultRow = await findVaultRecordRow(ctx.db, scope)
    const tombstone = vaultRow && Expectations.tombstoneOf(vaultRow, scope, expected)
    if (! vaultRow || ! tombstone) { return null }
    const boxes = await vaultBoxRows(ctx.db, scope)
    await Promise.all(boxes.map((row) => ctx.db.delete('safebyok_boxes', row._id)))
    await Tallies.drop(ctx.db, vaultRow._id)
    await ctx.db.delete('safebyok_vaults', vaultRow._id)
    await ctx.db.insert('safebyok_vault_tombstones', tombstone)
    return tombstone
  },
})

/** The vault's change signature, for a client to subscribe to: it changes when, and only when, a write lands in the vault.
 * Each run reads every box document whole, ciphertext and all, as a Convex query cannot read some
 * of a document's fields. The tallies' limits keep that within one query's reads.
 */
export const watchVault = query({
  args:    { ...VaultScope.fields },
  returns: VaultSignature,
  handler: async (ctx, scope) => {
    const vaultRow = await findVaultRecordRow(ctx.db, scope)
    const boxes = await vaultBoxRows(ctx.db, scope)
    return {
      vault_tok:  vaultRow?.vault_tok ?? null,
      gate_epoch: vaultRow?.gate_epoch ?? null,
      boxes:      boxes.map((row) => [row.boxlabel, row.revision_tok]),
    }
  },
})

// ------------------------------------------------------------------------------------ helpers

type VaultScope = Infer<typeof VaultScope>
type VaultRecord = Infer<typeof VaultRecord>
type BoxRecord = Infer<typeof BoxRecord>

/** The scope vault record names: its three names picked out, and nothing else. */
const scopeOf = ({ applabel, user_id, vaultlabel }: VaultScope): VaultScope => ({ applabel, user_id, vaultlabel })

// `.unique()` throws on a second row: find-or-insert never makes one, so two would be damage,
// and damage surfaces rather than being papered over.
const findVaultRecordRow = (db: DatabaseReader, scope: VaultScope) => (
  db.query('safebyok_vaults')
    .withIndex('by_scope', (idx) => idx.eq('user_id', scope.user_id).eq('applabel', scope.applabel).eq('vaultlabel', scope.vaultlabel))
    .unique()
)

/** The tombstone a deleted vault left in `scope`, whose counter a new life there carries on, or null where none stands. */
const findTombstoneRow = (db: DatabaseReader, scope: VaultScope) => (
  db.query('safebyok_vault_tombstones')
    .withIndex('by_scope', (idx) => idx.eq('user_id', scope.user_id).eq('applabel', scope.applabel).eq('vaultlabel', scope.vaultlabel))
    .unique()
)

const findBoxRow = (db: DatabaseReader, scope: VaultScope, boxlabel: string) => (
  db.query('safebyok_boxes')
    .withIndex('by_box', (idx) => idx.eq('user_id', scope.user_id).eq('applabel', scope.applabel).eq('vaultlabel', scope.vaultlabel).eq('boxlabel', boxlabel))
    .unique()
)

// One vault's range of one index: bounded by that vault, not by the table.
const vaultBoxQuery = (db: DatabaseReader, scope: VaultScope) => (
  db.query('safebyok_boxes')
    .withIndex('by_box', (idx) => idx.eq('user_id', scope.user_id).eq('applabel', scope.applabel).eq('vaultlabel', scope.vaultlabel))
)

// Every box row of one vault, which the tallies' limits keep within one transaction's reads.
const vaultBoxRows = (db: DatabaseReader, scope: VaultScope) => vaultBoxQuery(db, scope).collect()

/** Replace a box row in place, handing back its `_id`, which a replacement keeps. */
const replaceBoxRow = async (db: DatabaseWriter, rowId: Id<'safebyok_boxes'>, row: ReturnType<typeof boxRowOf>) => {
  await db.replace('safebyok_boxes', rowId, row)
  return rowId
}

/** A vault row as the vault record it holds: Convex's system fields stripped. */
const vaultRecordOfRow = ({ _id, _creationTime, ...vaultRecord }: Doc<'safebyok_vaults'>): VaultRecord => vaultRecord

/** A box row as the record it holds: system fields and scope columns stripped. */
const boxOfRow = (row: Doc<'safebyok_boxes'>): BoxRecord => {
  const { _id, _creationTime, applabel: _applabel, user_id: _user_id, vaultlabel: _vaultlabel, ...box } = row
  return box
}

/** Box rows as a listing returns them: each box's sparse shape, its record without its two ciphered fields. */
const boxSparsesOf = (rows: Doc<'safebyok_boxes'>[]): Infer<typeof BoxSparse>[] => rows.map((row) => {
  const { box_key_wrapped: _boxKeyWrapped, whisper_ciphered: _whisperCiphered, ...sparse } = boxOfRow(row)
  return sparse
})

/** The row a box is stored as: its scope columns added. */
const boxRowOf = (scope: VaultScope, box: BoxRecord) => ({ ...scope, ...box })
