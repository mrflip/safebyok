import { v } from 'convex/values'
import type { Infer } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { DatabaseReader, DatabaseWriter } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import * as Tallies from './tallies'
import {
  Capacity, VaultPropsExpectation, VaultDelExpectation, ListedBox, BoxRecord, BoxExpectation, BoxDelExpectation, BoxDeletion, PutBoxAnswer, VaultProps, VaultScope, VaultSignature,
} from './validators'

/** The component's functions, one per verb of the core's `VaultDB`, reached through the host's `SafebyokComponent.api`.
 * That wrapper authenticates first: inside the component every call is trusted to be its
 * `user_id`'s own. Each function keeps the contract of the `VaultDB` method it serves, and says
 * only where it differs.
 *
 * Convex runs mutations serializably, so each check and its write hold together. A failed
 * expectation is not an error: it resolves `false`, or `null` for a box deletion, which the client
 * refuses as `stale_write`.
 *
 * Every vault is held to the limits in `./tallies`, whatever its client asks, so that it can
 * always be deleted whole. A delete is never refused for room.
 */

// ------------------------------------------------------------------------------- the vault props

/** The vault props, exactly as stored, or null when the vault was never created. */
export const getVaultProps = query({
  args:    { scope: VaultScope },
  returns: v.nullable(VaultProps),
  handler: async (ctx, { scope }) => {
    const row = await findVaultPropsRow(ctx.db, scope)
    return row && vaultPropsOfRow(row)
  },
})

/** Store `vaultProps` only if their scope holds none, and return whichever vault props stand there afterwards. */
export const ensureVaultProps = mutation({
  args:    { vaultProps: VaultProps },
  returns: VaultProps,
  handler: async (ctx, { vaultProps }) => {
    const standing = await findVaultPropsRow(ctx.db, scopeOfVaultProps(vaultProps))
    if (standing) { return vaultPropsOfRow(standing) }
    await ctx.db.insert('safebyok_vaults', vaultProps)
    return vaultProps
  },
})

/** Replace the vault props, only while those standing have `expected.vault_id` and `expected.unlock_epoch`.
 * It also resolves false, writing nothing, for vault props that name another vault or do not move
 * `unlock_epoch` forward.
 */
export const putVaultProps = mutation({
  args:    { vaultProps: VaultProps, expected: VaultPropsExpectation },
  returns: v.boolean(),
  handler: async (ctx, { vaultProps, expected }) => {
    const standing = await findVaultPropsRow(ctx.db, scopeOfVaultProps(vaultProps))
    const meetsExpectation = standing !== null
      && standing.vault_id === expected.vault_id
      && standing.unlock_epoch === expected.unlock_epoch
    const movesForward = standing !== null
      && vaultProps.vault_id === standing.vault_id
      && vaultProps.unlock_epoch > standing.unlock_epoch
    if (! (meetsExpectation && movesForward)) { return false }
    await ctx.db.replace('safebyok_vaults', standing._id, vaultProps)
    return true
  },
})

// ----------------------------------------------------------------------------- the boxes

/** One box, exactly as stored, or null when there is none under `boxlabel`. */
export const getBox = query({
  args:    { scope: VaultScope, boxlabel: v.string() },
  returns: v.nullable(BoxRecord),
  handler: async (ctx, { scope, boxlabel }) => {
    const row = await findBoxRow(ctx.db, scope, boxlabel)
    return row && boxOfRow(row)
  },
})

/** Every box in the vault without its two ciphered fields, in boxlabel order, read in one query within the tallies' limits. */
export const listBoxSummaries = query({
  args:    { scope: VaultScope },
  returns: v.array(ListedBox),
  handler: async (ctx, { scope }) => {
    const rows = await vaultBoxRows(ctx.db, scope)
    return rows.map((row) => {
      const { box_key_wrapped: _boxKeyWrapped, whisper_ciphered: _whisperCiphered, ...listed } = boxOfRow(row)
      return listed
    })
  },
})

/** Write `box` as `VaultDB`'s `doPutBox` does, resolving a {@link PutBoxAnswer} where that throws.
 * Beside its refusals, it resolves `vault_full` for a write that would take the vault past {@link
 * Tallies.MaxVaultBoxes} boxes or {@link Tallies.MaxVaultBoxBytes} bytes and leave it larger: a new
 * box in a full vault, or a heavier replacement. A vault with no tally yet is counted first,
 * reading it once.
 */
export const putBox = mutation({
  args:    { scope: VaultScope, expected: BoxExpectation, box: BoxRecord },
  returns: PutBoxAnswer,
  handler: async (ctx, { scope, expected, box }): Promise<Infer<typeof PutBoxAnswer>> => {
    const vaultProps = await findVaultPropsRow(ctx.db, scope)
    if (vaultProps?.vault_id !== expected.vault_id) {
      return { landed: false, refusalkind: 'vault_mismatch' }
    }
    const standing = await findBoxRow(ctx.db, scope, box.boxlabel)
    const standingRevisionTok = standing?.revision_tok ?? null
    if (standingRevisionTok !== expected.revision_tok) {
      return { landed: false, refusalkind: 'stale_write', box_stored: standing && boxOfRow(standing) }
    }
    //
    const row = boxRowOf(scope, box)
    const reckoning = await Tallies.reckon(ctx.db, vaultProps._id, vaultBoxQuery(ctx.db, scope))
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
    await Tallies.record(ctx.db, vaultProps._id, reckoning, growthAs(rowId))
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
  args:    { scope: VaultScope },
  returns: Capacity,
  handler: async (ctx, { scope }) => {
    const vaultProps = await findVaultPropsRow(ctx.db, scope)
    if (vaultProps === null) { return Tallies.capacityOf({ box_count: 0, box_bytes: 0 }) }
    const { tally } = await Tallies.reckon(ctx.db, vaultProps._id, vaultBoxQuery(ctx.db, scope))
    return Tallies.capacityOf(tally)
  },
})

/** Remove the box under `boxlabel` as `VaultDB`'s `doDelBox` does, and take it off the vault's tally. */
export const delBox = mutation({
  args:    { scope: VaultScope, boxlabel: v.string(), expected: BoxDelExpectation },
  returns: v.nullable(BoxDeletion),
  handler: async (ctx, { scope, boxlabel, expected }): Promise<Infer<typeof BoxDeletion> | null> => {
    const vaultProps = await findVaultPropsRow(ctx.db, scope)
    if (vaultProps?.vault_id !== expected.vault_id) { return null }
    const standing = await findBoxRow(ctx.db, scope, boxlabel)
    if (! standing) { return { outcome: 'absent' } }
    await ctx.db.delete('safebyok_boxes', standing._id)
    await Tallies.forget(ctx.db, vaultProps._id, standing)
    // An empty revision reads as none, as the client lists a damaged box holding one.
    const standingRevision = standing.revision_tok === '' ? null : standing.revision_tok
    return { outcome: standingRevision === expected.revision_tok ? 'deleted' : 'deleted_other' }
  },
})

// --------------------------------------------------------------------------------- the vault

/** Remove the vault props, every box and the tally in one transaction, only while the vault props have `expected.vault_id`. */
export const delVault = mutation({
  args:    { scope: VaultScope, expected: VaultDelExpectation },
  returns: v.boolean(),
  handler: async (ctx, { scope, expected }) => {
    const vaultProps = await findVaultPropsRow(ctx.db, scope)
    if (vaultProps?.vault_id !== expected.vault_id) { return false }
    const boxes = await vaultBoxRows(ctx.db, scope)
    await Promise.all(boxes.map((row) => ctx.db.delete('safebyok_boxes', row._id)))
    await Tallies.drop(ctx.db, vaultProps._id)
    await ctx.db.delete('safebyok_vaults', vaultProps._id)
    return true
  },
})

/** The vault's change signature, for a client to subscribe to: it changes when, and only when, a write lands in the vault.
 * Each run reads every box document whole, ciphertext and all, as a Convex query cannot read some
 * of a document's fields. The tallies' limits keep that within one query's reads.
 */
export const watchVault = query({
  args:    { scope: VaultScope },
  returns: VaultSignature,
  handler: async (ctx, { scope }) => {
    const vaultProps = await findVaultPropsRow(ctx.db, scope)
    const boxes = await vaultBoxRows(ctx.db, scope)
    return {
      vault_id:     vaultProps?.vault_id ?? null,
      unlock_epoch: vaultProps?.unlock_epoch ?? null,
      boxes:        boxes.map((row) => [row.boxlabel, row.revision_tok]),
    }
  },
})

// ------------------------------------------------------------------------------------ helpers

type VaultScope = Infer<typeof VaultScope>
type VaultProps = Infer<typeof VaultProps>
type BoxRecord = Infer<typeof BoxRecord>

const scopeOfVaultProps = ({ applabel, user_id, vaultlabel }: VaultProps): VaultScope => ({ applabel, user_id, vaultlabel })

// `.unique()` throws on a second row: find-or-insert never makes one, so two would be damage,
// and damage surfaces rather than being papered over.
const findVaultPropsRow = (db: DatabaseReader, scope: VaultScope) => (
  db.query('safebyok_vaults')
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

/** A vault row as the vault props it holds: Convex's system fields stripped. */
const vaultPropsOfRow = ({ _id, _creationTime, ...vaultProps }: Doc<'safebyok_vaults'>): VaultProps => vaultProps

/** A box row as the record it holds: system fields and scope columns stripped. */
const boxOfRow = (row: Doc<'safebyok_boxes'>): BoxRecord => {
  const { _id, _creationTime, applabel: _applabel, user_id: _userId, vaultlabel: _vaultlabel, ...box } = row
  return box
}

/** The row a box is stored as: its scope columns added. */
const boxRowOf = (scope: VaultScope, box: BoxRecord) => ({ ...scope, ...box })
