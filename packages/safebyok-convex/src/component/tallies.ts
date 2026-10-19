import { getDocumentSize } from 'convex/values'
import type { Value } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import type { DatabaseReader, DatabaseWriter } from './_generated/server'

/**
 * Each vault's tally, and the limits the component holds every vault to, so that any vault it
 * takes in can be retired whole. Retiring a vault (`delVault`, which `del()` calls) reads
 * every row of it twice in one transaction -- once to find it, once to delete it -- and a Convex
 * transaction may read 16 MiB and 32,000 documents, and write 16,000. A client keeps its vault far
 * smaller (`maxBoxes`, under `convexVaultDB`'s `maxVaultBytes`), but a modified client need
 * not, so the component checks these limits itself on every box write, against a tally kept in
 * step with each write and retire rather than by reading the vault.
 */

/** Convex's most for one document, in bytes: 1 MiB. */
const ConvexDocumentBytes = 1_048_576

/** Convex's most for one transaction to read, in bytes: 16 MiB. */
const ConvexTransactionReadBytes = 16_777_216

/** Convex's most documents for one transaction to write. */
const ConvexTransactionWrittenDocuments = 16_000

/** Room for the vault's tally row, which a retire reads twice as well: several times its weight. */
const TallyReserveBytes = 1024

/**
 * The most boxes one vault holds: half the documents a Convex transaction may write, so that
 * a retire -- a deletion and two reads per box -- stays well inside every per-transaction
 * limit. Twice the most any client's `maxBoxes` can be over `convexVaultDB`.
 */
export const MaxVaultBoxes = ConvexTransactionWrittenDocuments / 2

/**
 * The most one vault's boxes weigh together, in bytes as Convex counts a document: half of
 * what a transaction may read, as a retire reads every row twice, less a whole document for the
 * vault's props and room for its tally, which the retire reads twice too. 7 MiB less 1 KiB.
 */
export const MaxVaultBoxBytes = (ConvexTransactionReadBytes / 2) - ConvexDocumentBytes - TallyReserveBytes

/** How full a vault is: how many boxes it holds, and what they weigh in bytes, as Convex counts them. */
export type Tally = {
  box_count: number
  box_bytes: number
}

/**
 * A vault's tally as a write finds it: `kept` is its stored row, if it has one, and `tally` the
 * count -- or null, when counting afresh stopped at a limit, so the vault is past it by an unknown
 * amount.
 */
export type Reckoning = {
  kept:  Doc<'safebyok_vault_tallies'> | null
  tally: Tally | null
}

/**
 * What a box row weighs toward its vault's limit: its size as Convex counts the document.
 *
 * @param row - The row, as stored (with its `_id`) or about to be.
 * @param rowId - The `_id` a row not yet read back is stored under; without one, a row lacking its
 *   `_id` is weighed with Convex's estimate of one.
 * @returns The row's size in bytes, as Convex counts it against a transaction's reads.
 *
 * @example weigh(standing)            // a row read from the table
 * @example weigh(row, insertedId)     // a row just inserted
 */
export const weigh = (row: Record<string, Value>, rowId?: Id<'safebyok_boxes'>): number => (
  getDocumentSize(rowId === undefined ? row : { ...row, _id: rowId, _creationTime: 0 })
)

/**
 * The vault's tally as it stands, for a box write to check: the one kept, or -- for a vault
 * with none yet -- counted afresh from its rows, reading them once. Counting stops at the first
 * row past a limit, so it never reads much more than a vault may hold; the tally then comes back
 * null, and the vault is refused anything that adds to it until retired boxes bring it back in.
 *
 * @param db - The transaction's database.
 * @param vaultRowId - The vault row, which its tally is filed under.
 * @param boxRows - The vault's box rows, read only when there is no tally to keep.
 */
export const reckon = async (
  db: DatabaseReader, vaultRowId: Id<'safebyok_vaults'>, boxRows: AsyncIterable<Doc<'safebyok_boxes'>>,
): Promise<Reckoning> => {
  const kept = await findTallyRow(db, vaultRowId)
  if (kept) { return { kept, tally: { box_count: kept.box_count, box_bytes: kept.box_bytes } } }
  // A loop rather than a reduce: it reads the rows as it goes, and stops reading past a limit.
  let tally: Tally = { box_count: 0, box_bytes: 0 }
  for await (const row of boxRows) {
    tally = plus(tally, { box_count: 1, box_bytes: weigh(row) })
    if (tally.box_count > MaxVaultBoxes || tally.box_bytes > MaxVaultBoxBytes) {
      return { kept: null, tally: null }
    }
  }
  return { kept: null, tally }
}

/**
 * True when a write that changes the vault by `growth` must be refused: it would leave the vault
 * past a limit, and larger by that measure than it found it. A write that adds nothing by a
 * measure -- a replacement, by count; a replacement no heavier, by weight -- is never refused by
 * it, so a vault over its limits can always shrink.
 *
 * @param tally - The vault's tally before the write, or null for a vault past a limit, uncounted.
 * @param growth - What the write adds: a box for a new one, and its weight less any it replaces.
 *
 * @example refuses({ box_count: 8000, box_bytes: 4096 }, { box_count: 1, box_bytes: 512 })  // => true
 * @example refuses({ box_count: 8000, box_bytes: 4096 }, { box_count: 0, box_bytes: 512 })  // => false
 */
export const refuses = (tally: Tally | null, growth: Tally): boolean => {
  if (tally === null) { return growth.box_count > 0 || growth.box_bytes > 0 }
  const after = plus(tally, growth)
  return (growth.box_count > 0 && after.box_count > MaxVaultBoxes)
    || (growth.box_bytes > 0 && after.box_bytes > MaxVaultBoxBytes)
}

/**
 * Keep the vault's tally in step with a box write that landed: moved by `growth`, or stored for
 * the first time. A vault whose count stopped at a limit keeps no tally: its next write counts it
 * again.
 */
export const record = async (db: DatabaseWriter, vaultRowId: Id<'safebyok_vaults'>, { kept, tally }: Reckoning, growth: Tally): Promise<void> => {
  if (tally === null) { return }
  const moved = plus(tally, growth)
  if (kept) {
    await db.patch('safebyok_vault_tallies', kept._id, moved)
  } else {
    await db.insert('safebyok_vault_tallies', { vault_row_id: vaultRowId, ...moved })
  }
}

/**
 * Take a retired box off its vault's tally, when the vault has one. A retire never counts a
 * vault that has none: a vault too large to read whole must still be retirable, a box at a time.
 */
export const forget = async (db: DatabaseWriter, vaultRowId: Id<'safebyok_vaults'>, deleted: Doc<'safebyok_boxes'>): Promise<void> => {
  const kept = await findTallyRow(db, vaultRowId)
  if (! kept) { return }
  await db.patch('safebyok_vault_tallies', kept._id, plus(kept, { box_count: -1, box_bytes: -weigh(deleted) }))
}

/** Remove the vault's tally, when it has one: its vault is being retired. */
export const drop = async (db: DatabaseWriter, vaultRowId: Id<'safebyok_vaults'>): Promise<void> => {
  const kept = await findTallyRow(db, vaultRowId)
  if (kept) { await db.delete('safebyok_vault_tallies', kept._id) }
}

const plus = (tally: Tally, growth: Tally): Tally => ({
  box_count: tally.box_count + growth.box_count,
  box_bytes: tally.box_bytes + growth.box_bytes,
})

// `.unique()` throws on a second row: a tally is inserted only where none was found, in the same
// transaction, so two would be damage, and damage surfaces rather than being papered over.
const findTallyRow = (db: DatabaseReader, vaultRowId: Id<'safebyok_vaults'>) => (
  db.query('safebyok_vault_tallies')
    .withIndex('by_vault_row', (idx) => idx.eq('vault_row_id', vaultRowId))
    .unique()
)
