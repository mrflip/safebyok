import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'
import type { SafebyokErrorData } from '../refusals'
import { mutation, query } from './_generated/server'
import type { DatabaseReader, DatabaseWriter } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import * as Tallies from './tallies'
import {
  VaultPropsExpectation, RetireExpectation, ListedLockbox, Lockbox, LockboxExpectation, LockboxRetireExpectation, LockboxRetirement, VaultProps, VaultScope, VaultSignature,
} from './validators'

/**
 * The component's functions, one per verb of the core's `VaultDB`: what `convexVaultDB` reaches,
 * through the host's wrappers (`SafebyokComponent.api`), which authenticate first. Inside the
 * component every call is trusted to be its `user_id`'s own.
 *
 * Every update checks its expectation in the same transaction it writes in, and Convex runs
 * mutations serializably, so the check holds for real. A failed expectation writes nothing and
 * resolves `false` -- for a lockbox write, `null` -- which the client refuses as `stale_write`; it
 * is not an error. A lockbox write that lands resolves the lockbox as stored, read back in its
 * own transaction. A retire lands only in the vault it expects: it wins over any lockbox revision,
 * but never lands in a vault made anew. A lockbox retire that lands resolves what it removed.
 *
 * Every vault is held to the limits in `./tallies`, whatever its client asks, so that it can
 * always be retired whole: a lockbox write that would take the vault past one is refused with a
 * `ConvexError` of kind `vault_full`. A retire is never refused for room.
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

/**
 * Store `vaultProps` only if their scope holds none, and return whichever vault props stand there
 * afterwards: these, or those another device got in first with. Find and insert are one
 * transaction, so two devices creating at once settle on one vault row.
 */
export const fetchOrCreateVaultProps = mutation({
  args:    { vaultProps: VaultProps },
  returns: VaultProps,
  handler: async (ctx, { vaultProps }) => {
    const standing = await findVaultPropsRow(ctx.db, scopeOfVaultProps(vaultProps))
    if (standing) { return vaultPropsOfRow(standing) }
    await ctx.db.insert('safebyok_vaults', vaultProps)
    return vaultProps
  },
})

/**
 * Replace the vault props with `vaultProps`, only while those standing have `expected.vault_id`
 * and `expected.unlock_epoch`, and only when `vaultProps` names the same vault and moves its
 * `unlock_epoch` forward. True when written; false, writing nothing, otherwise -- including when
 * no vault props stand.
 */
export const updateVaultProps = mutation({
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

// ----------------------------------------------------------------------------- the lockboxes

/** One lockbox, exactly as stored, or null when there is none under `boxlabel`. */
export const getBox = query({
  args:    { scope: VaultScope, boxlabel: v.string() },
  returns: v.nullable(Lockbox),
  handler: async (ctx, { scope, boxlabel }) => {
    const row = await findBoxRow(ctx.db, scope, boxlabel)
    return row && lockboxOfRow(row)
  },
})

/**
 * Every lockbox in the vault without its two ciphered fields, `format` kept, in boxlabel order.
 * Reads the whole vault in one query: a vault's lockboxes together must fit in one Convex
 * transaction's read limits.
 */
export const listBoxSummaries = query({
  args:    { scope: VaultScope },
  returns: v.array(ListedLockbox),
  handler: async (ctx, { scope }) => {
    const rows = await vaultBoxRows(ctx.db, scope)
    return rows.map((row) => {
      const { lockbox_key_wrapped: _lockboxKeyWrapped, whisper_ciphered: _whisperCiphered, ...listed } = lockboxOfRow(row)
      return listed
    })
  },
})

/**
 * Write `lockbox` under its boxlabel, only while the scope's vault props have `expected.vault_id`
 * and `expected.vault_key_epoch` -- they stand for the vaultKey the lockbox was sealed under -- and
 * the standing lockbox has `expected.revision_tok` -- or, for null, there is none. Resolves the
 * lockbox as stored once written, read back in this same transaction; null, writing nothing,
 * otherwise -- including when the scope holds no vault props.
 *
 * Refuses, writing nothing, with a `ConvexError` of kind `vault_full` a write that would take the
 * vault past {@link Tallies.MaxVaultLockboxes} lockboxes or {@link Tallies.MaxVaultLockboxBytes}
 * bytes and leave it larger than it was: a new lockbox in a full vault, or a heavier replacement.
 * A vault with no tally yet is counted first, reading it once.
 */
export const updateBox = mutation({
  args:    { scope: VaultScope, lockbox: Lockbox, expected: LockboxExpectation },
  returns: v.nullable(Lockbox),
  handler: async (ctx, { scope, lockbox, expected }) => {
    const vaultProps = await findVaultPropsRow(ctx.db, scope)
    if (vaultProps?.vault_id !== expected.vault_id || vaultProps.vault_key_epoch !== expected.vault_key_epoch) { return null }
    const standing = await findBoxRow(ctx.db, scope, lockbox.boxlabel)
    const standingRevisionTok = standing?.revision_tok ?? null
    if (standingRevisionTok !== expected.revision_tok) { return null }
    //
    const row = boxRowOf(scope, lockbox)
    const reckoning = await Tallies.reckon(ctx.db, vaultProps._id, vaultBoxQuery(ctx.db, scope))
    const standingBytes = standing === null ? 0 : Tallies.weigh(standing)
    // A new row is weighed with Convex's estimate of an `_id` until it has one.
    const growthAs = (rowId?: Id<'safebyok_lockboxes'>) => ({
      lockbox_count: standing === null ? 1 : 0,
      lockbox_bytes: Tallies.weigh(row, rowId) - standingBytes,
    })
    if (Tallies.refuses(reckoning.tally, growthAs(standing?._id))) {
      throw new ConvexError<SafebyokErrorData>({ kind: 'vault_full', message: 'This vault is full: remove a lockbox to make room, then try again.' })
    }
    const rowId = standing === null
      ? await ctx.db.insert('safebyok_lockboxes', row)
      : await replaceBoxRow(ctx.db, standing._id, row)
    await Tallies.record(ctx.db, vaultProps._id, reckoning, growthAs(rowId))
    const stored = await ctx.db.get('safebyok_lockboxes', rowId)
    return stored && lockboxOfRow(stored)
  },
})

/**
 * Remove the lockbox under `boxlabel`, whatever revision stands, only while the scope's vault props
 * have `expected.vault_id`. Resolves what it removed when that holds -- `retired` for a lockbox at
 * `expected.revision_tok`, `retired_other` for any other, `absent` for none; null, removing
 * nothing, otherwise -- including when the scope holds no vault props.
 */
export const retireBox = mutation({
  args:    { scope: VaultScope, boxlabel: v.string(), expected: LockboxRetireExpectation },
  returns: v.nullable(LockboxRetirement),
  handler: async (ctx, { scope, boxlabel, expected }): Promise<Infer<typeof LockboxRetirement> | null> => {
    const vaultProps = await findVaultPropsRow(ctx.db, scope)
    if (vaultProps?.vault_id !== expected.vault_id) { return null }
    const standing = await findBoxRow(ctx.db, scope, boxlabel)
    if (! standing) { return { outcome: 'absent' } }
    await ctx.db.delete('safebyok_lockboxes', standing._id)
    await Tallies.forget(ctx.db, vaultProps._id, standing)
    return { outcome: standing.revision_tok === expected.revision_tok ? 'retired' : 'retired_other' }
  },
})

// --------------------------------------------------------------------------------- the vault

/**
 * Remove the vault props and every lockbox, in one transaction, only while the vault props have
 * `expected.vault_id`. True when removed; false, removing nothing, otherwise -- including when
 * the scope holds no vault props.
 */
export const retireVault = mutation({
  args:    { scope: VaultScope, expected: RetireExpectation },
  returns: v.boolean(),
  handler: async (ctx, { scope, expected }) => {
    const vaultProps = await findVaultPropsRow(ctx.db, scope)
    if (vaultProps?.vault_id !== expected.vault_id) { return false }
    const boxes = await vaultBoxRows(ctx.db, scope)
    await Promise.all(boxes.map((row) => ctx.db.delete('safebyok_lockboxes', row._id)))
    await Tallies.drop(ctx.db, vaultProps._id)
    await ctx.db.delete('safebyok_vaults', vaultProps._id)
    return true
  },
})

/**
 * The vault's change signature, for a client to subscribe to: it changes when, and only when, a
 * write lands in the vault -- the vault props replaced, a lockbox written or retired, the vault
 * retired. It reads each lockbox document whole, ciphertext and all, for its revision: a Convex
 * query cannot read some of a document's fields. So each run reads the vault, within the read
 * limits a listing and a retire keep it to.
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
type Lockbox = Infer<typeof Lockbox>

const scopeOfVaultProps = ({ applabel, user_id, vaultlabel }: VaultProps): VaultScope => ({ applabel, user_id, vaultlabel })

// `.unique()` throws on a second row: find-or-insert never makes one, so two would be damage,
// and damage surfaces rather than being papered over.
const findVaultPropsRow = (db: DatabaseReader, scope: VaultScope) => (
  db.query('safebyok_vaults')
    .withIndex('by_scope', (idx) => idx.eq('user_id', scope.user_id).eq('applabel', scope.applabel).eq('vaultlabel', scope.vaultlabel))
    .unique()
)

const findBoxRow = (db: DatabaseReader, scope: VaultScope, boxlabel: string) => (
  db.query('safebyok_lockboxes')
    .withIndex('by_box', (idx) => idx.eq('user_id', scope.user_id).eq('applabel', scope.applabel).eq('vaultlabel', scope.vaultlabel).eq('boxlabel', boxlabel))
    .unique()
)

// One vault's range of one index: bounded by that vault, not by the table.
const vaultBoxQuery = (db: DatabaseReader, scope: VaultScope) => (
  db.query('safebyok_lockboxes')
    .withIndex('by_box', (idx) => idx.eq('user_id', scope.user_id).eq('applabel', scope.applabel).eq('vaultlabel', scope.vaultlabel))
)

// Every lockbox row of one vault, which the tallies' limits keep within one transaction's reads.
const vaultBoxRows = (db: DatabaseReader, scope: VaultScope) => vaultBoxQuery(db, scope).collect()

/** Replace a lockbox row in place, handing back its `_id`, which a replacement keeps. */
const replaceBoxRow = async (db: DatabaseWriter, rowId: Id<'safebyok_lockboxes'>, row: ReturnType<typeof boxRowOf>) => {
  await db.replace('safebyok_lockboxes', rowId, row)
  return rowId
}

/** A vault row as the vault props it holds: Convex's system fields stripped. */
const vaultPropsOfRow = ({ _id, _creationTime, ...vaultProps }: Doc<'safebyok_vaults'>): VaultProps => vaultProps

/** A lockbox row as the record it holds: system fields and scope columns stripped. */
const lockboxOfRow = (row: Doc<'safebyok_lockboxes'>): Lockbox => {
  const { _id, _creationTime, applabel: _applabel, user_id: _userId, vaultlabel: _vaultlabel, ...lockbox } = row
  return lockbox
}

/** The row a lockbox is stored as: its scope columns added. */
const boxRowOf = (scope: VaultScope, lockbox: Lockbox) => ({ ...scope, ...lockbox })
