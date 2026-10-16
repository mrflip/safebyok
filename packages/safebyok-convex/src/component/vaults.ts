import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'
import type { SafebyokErrorData } from '../refusals'
import { mutation, query } from './_generated/server'
import type { DatabaseReader, DatabaseWriter } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import * as Tallies from './tallies'
import {
  BundleExpectation, EraseExpectation, ListedLockbox, Lockbox, LockboxExpectation, VaultBundle, VaultScope, VaultSignature,
} from './validators'

/**
 * The component's functions, one per verb of the core's `VaultDB`: what `convexVaultDB` reaches,
 * through the host's wrappers (`SafebyokComponent.api`), which authenticate first. Inside the
 * component every call is trusted to be its `user_id`'s own.
 *
 * Every update checks its expectation in the same transaction it writes in, and Convex runs
 * mutations serializably, so the check holds for real. A failed expectation writes nothing and
 * resolves `false` (the client refuses it as `stale_write`); it is not an error. Erases expect
 * only the vault: an erase wins over any lockbox revision, but never lands in a vault made anew.
 *
 * Every vault is held to the limits in `./tallies`, whatever its client asks, so that it can
 * always be erased whole: a lockbox write that would take the vault past one is refused with a
 * `ConvexError` of kind `vault_full`. Erases are never refused for room.
 */

// ------------------------------------------------------------------------------- the bundle

/** The vault's bundle, exactly as stored, or null when the vault was never created. */
export const getBundle = query({
  args:    { scope: VaultScope },
  returns: v.nullable(VaultBundle),
  handler: async (ctx, { scope }) => {
    const row = await findBundleRow(ctx.db, scope)
    return row && bundleOfRow(row)
  },
})

/**
 * Store `bundle` only if its scope holds none, and return whichever bundle stands there after:
 * this one, or the one another device got in first with. Find and insert are one transaction, so
 * two devices creating at once settle on one bundle.
 */
export const createBundle = mutation({
  args:    { bundle: VaultBundle },
  returns: VaultBundle,
  handler: async (ctx, { bundle }) => {
    const standing = await findBundleRow(ctx.db, scopeOfBundle(bundle))
    if (standing) { return bundleOfRow(standing) }
    await ctx.db.insert('safebyok_bundles', bundle)
    return bundle
  },
})

/**
 * Replace the bundle with `bundle`, only while the standing one has `expected.vault_id` and
 * `expected.unlock_epoch`. True when written; false, writing nothing, otherwise -- including
 * when no bundle stands.
 */
export const updateBundle = mutation({
  args:    { bundle: VaultBundle, expected: BundleExpectation },
  returns: v.boolean(),
  handler: async (ctx, { bundle, expected }) => {
    const standing = await findBundleRow(ctx.db, scopeOfBundle(bundle))
    const meetsExpectation = standing !== null
      && standing.vault_id === expected.vault_id
      && standing.unlock_epoch === expected.unlock_epoch
    if (! meetsExpectation) { return false }
    await ctx.db.replace('safebyok_bundles', standing._id, bundle)
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
 * Write `lockbox` under its boxlabel, only while the scope's bundle has `expected.vault_id` and
 * `expected.vault_key_epoch` -- it stands for the vaultKey the lockbox was sealed under -- and
 * the standing lockbox has `expected.revision_id` -- or, for null, there is none. True when
 * written; false, writing nothing, otherwise -- including when the scope holds no bundle.
 *
 * Refuses, writing nothing, with a `ConvexError` of kind `vault_full` a write that would take the
 * vault past {@link Tallies.MaxVaultLockboxes} lockboxes or {@link Tallies.MaxVaultLockboxBytes}
 * bytes and leave it larger than it was: a new lockbox in a full vault, or a heavier replacement.
 * A vault with no tally yet is counted first, reading it once.
 */
export const updateBox = mutation({
  args:    { scope: VaultScope, lockbox: Lockbox, expected: LockboxExpectation },
  returns: v.boolean(),
  handler: async (ctx, { scope, lockbox, expected }) => {
    const bundle = await findBundleRow(ctx.db, scope)
    if (bundle?.vault_id !== expected.vault_id || bundle.vault_key_epoch !== expected.vault_key_epoch) { return false }
    const standing = await findBoxRow(ctx.db, scope, lockbox.boxlabel)
    const standingRevisionId = standing?.revision_id ?? null
    if (standingRevisionId !== expected.revision_id) { return false }
    //
    const row = boxRowOf(scope, lockbox)
    const reckoning = await Tallies.reckon(ctx.db, bundle._id, vaultBoxQuery(ctx.db, scope))
    const standingBytes = standing === null ? 0 : Tallies.weigh(standing)
    // A new row is weighed with Convex's estimate of an `_id` until it has one.
    const growthAs = (rowId?: Id<'safebyok_lockboxes'>) => ({
      lockbox_count: standing === null ? 1 : 0,
      lockbox_bytes: Tallies.weigh(row, rowId) - standingBytes,
    })
    if (Tallies.refuses(reckoning.tally, growthAs(standing?._id))) {
      throw new ConvexError<SafebyokErrorData>({ kind: 'vault_full', message: 'This vault is full: erase a lockbox to make room, then try again.' })
    }
    const rowId = standing === null
      ? await ctx.db.insert('safebyok_lockboxes', row)
      : await replaceBoxRow(ctx.db, standing._id, row)
    await Tallies.record(ctx.db, bundle._id, reckoning, growthAs(rowId))
    return true
  },
})

/**
 * Remove the lockbox under `boxlabel`, whatever revision stands, only while the scope's bundle
 * has `expected.vault_id`. True when that holds -- also when there was no lockbox to remove;
 * false, removing nothing, otherwise -- including when the scope holds no bundle.
 */
export const eraseBox = mutation({
  args:    { scope: VaultScope, boxlabel: v.string(), expected: EraseExpectation },
  returns: v.boolean(),
  handler: async (ctx, { scope, boxlabel, expected }) => {
    const bundle = await findBundleRow(ctx.db, scope)
    if (bundle?.vault_id !== expected.vault_id) { return false }
    const standing = await findBoxRow(ctx.db, scope, boxlabel)
    if (standing) {
      await ctx.db.delete('safebyok_lockboxes', standing._id)
      await Tallies.forget(ctx.db, bundle._id, standing)
    }
    return true
  },
})

// --------------------------------------------------------------------------------- the vault

/**
 * Remove the vault's bundle and every lockbox, in one transaction, only while its bundle has
 * `expected.vault_id`. True when removed; false, removing nothing, otherwise -- including when
 * the scope holds no bundle.
 */
export const eraseVault = mutation({
  args:    { scope: VaultScope, expected: EraseExpectation },
  returns: v.boolean(),
  handler: async (ctx, { scope, expected }) => {
    const bundle = await findBundleRow(ctx.db, scope)
    if (bundle?.vault_id !== expected.vault_id) { return false }
    const boxes = await vaultBoxRows(ctx.db, scope)
    await Promise.all(boxes.map((row) => ctx.db.delete('safebyok_lockboxes', row._id)))
    await Tallies.drop(ctx.db, bundle._id)
    await ctx.db.delete('safebyok_bundles', bundle._id)
    return true
  },
})

/**
 * The vault's change signature, for a client to subscribe to: it changes when, and only when, a
 * write lands in the vault -- the bundle replaced, a lockbox written or erased, the vault erased.
 */
export const watchVault = query({
  args:    { scope: VaultScope },
  returns: VaultSignature,
  handler: async (ctx, { scope }) => {
    const bundle = await findBundleRow(ctx.db, scope)
    const boxes = await vaultBoxRows(ctx.db, scope)
    return {
      vault_id:         bundle?.vault_id ?? null,
      unlock_epoch: bundle?.unlock_epoch ?? null,
      boxes:            boxes.map((row) => [row.boxlabel, row.revision_id]),
    }
  },
})

// ------------------------------------------------------------------------------------ helpers

type VaultScope = Infer<typeof VaultScope>
type VaultBundle = Infer<typeof VaultBundle>
type Lockbox = Infer<typeof Lockbox>

const scopeOfBundle = ({ applabel, user_id, vaultlabel }: VaultBundle): VaultScope => ({ applabel, user_id, vaultlabel })

// `.unique()` throws on a second row: find-or-insert never makes one, so two would be damage,
// and damage surfaces rather than being papered over.
const findBundleRow = (db: DatabaseReader, scope: VaultScope) => (
  db.query('safebyok_bundles')
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

/** A bundle row as the record it holds: Convex's system fields stripped. */
const bundleOfRow = ({ _id, _creationTime, ...bundle }: Doc<'safebyok_bundles'>): VaultBundle => bundle

/** A lockbox row as the record it holds: system fields and scope columns stripped. */
const lockboxOfRow = (row: Doc<'safebyok_lockboxes'>): Lockbox => {
  const { _id, _creationTime, applabel: _applabel, user_id: _userId, vaultlabel: _vaultlabel, ...lockbox } = row
  return lockbox
}

/** The row a lockbox is stored as: its scope columns added. */
const boxRowOf = (scope: VaultScope, lockbox: Lockbox) => ({ ...scope, ...lockbox })
