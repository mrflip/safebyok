import { getDocumentSize } from 'convex/values'
import type { Value } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import type { DatabaseReader, DatabaseWriter } from './_generated/server'

/** Each vault's tally, and the limits the component holds every vault to, so that it can always be deleted whole.
 * `delVault` reads every row twice in one transaction, and a Convex transaction may read 16 MiB and
 * 32,000 documents, and write 16,000. A modified client need not keep its vault small, so the
 * component checks these limits on every box write, against a tally kept in step with each write
 * and delete.
 */

/** Convex's most for one document, in bytes: 1 MiB. */
const ConvexDocumentBytes = 1_048_576

/** Convex's most for one transaction to read, in bytes: 16 MiB. */
const ConvexTransactionReadBytes = 16_777_216

/** Convex's most documents for one transaction to write. */
const ConvexTransactionWrittenDocuments = 16_000

/** Room for the vault's tally row, which a delete reads twice as well: several times its weight. */
const TallyReserveBytes = 1024

/** The most boxes one vault holds: half the documents a Convex transaction may write.
 * A delete, a deletion and two reads per box, then stays inside every per-transaction limit.
 */
export const MaxVaultBoxes = ConvexTransactionWrittenDocuments / 2

/** The most one vault's boxes weigh together, in bytes as Convex counts a document: 7 MiB less 1 KiB.
 * That is half of what a transaction may read, as a delete reads every row twice, less a whole
 * document for the vault record and room for the tally.
 */
export const MaxVaultBoxBytes = (ConvexTransactionReadBytes / 2) - ConvexDocumentBytes - TallyReserveBytes

/** How full a vault is: how many boxes it holds, and what they weigh in bytes, as Convex counts them. */
export type Tally = {
  box_count: number
  box_bytes: number
}

/** How full a vault is, from its tally, against the component's limits.
 * Its boxes, and their bytes as Convex counts a document. A vault past a limit and left uncounted
 * (a null tally) is answered as full by both, as {@link refuses} treats it.
 *
 * @example capacityOf({ box_count: 12, box_bytes: 48_000 })  // { boxes: { used: 12, max: 8000 }, bytes: { used: 48000, max: MaxVaultBoxBytes } }
 */
export const capacityOf = (tally: Tally | null) => ({
  boxes: { used: tally?.box_count ?? MaxVaultBoxes, max: MaxVaultBoxes },
  bytes: { used: tally?.box_bytes ?? MaxVaultBoxBytes, max: MaxVaultBoxBytes },
})

/** A vault's tally as a write finds it: its stored row, if any, and the count.
 * The count is null when counting afresh stopped at a limit: the vault is past it by an unknown amount.
 */
export type Reckoning = {
  kept:  Doc<'safebyok_vault_tallies'> | null
  tally: Tally | null
}

/** What a box row weighs toward its vault's limit: its size as Convex counts the document.
 *
 * @param rowId - The `_id` of a row not yet read back; without one, a row lacking its `_id` is
 *   weighed with Convex's estimate of one.
 *
 * @example weigh(storedRow)           // a row read from the table
 * @example weigh(row, insertedId)     // a row just inserted
 */
export const weigh = (row: Record<string, Value>, rowId?: Id<'safebyok_boxes'>): number => (
  getDocumentSize(rowId === undefined ? row : { ...row, _id: rowId, _creationTime: 0 })
)

/** The vault's tally as it is now, for a box write to check: the one kept, or one counted afresh from `boxRows`.
 * Counting stops at the first row past a limit, so it never reads much more than a vault may hold.
 * The tally then comes back null, and the vault is refused anything that adds to it until deleted
 * boxes bring it back in.
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

/** True when a write that changes the vault by `growth` must be refused: it leaves the vault past a limit, and larger by that measure.
 * A write that adds nothing by a measure (a replacement, by count; one no heavier, by weight) is
 * never refused by it, so a vault over its limits can always shrink.
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

/** Keep the vault's tally in step with a box write that landed: moved by `growth`, or stored for the first time.
 * A vault whose count stopped at a limit keeps no tally: its next write counts it again.
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

/** Take a deleted box off its vault's tally, when the vault has one.
 * A delete never counts a vault that has none: a vault too large to read whole must still be
 * deletable, a box at a time.
 */
export const forget = async (db: DatabaseWriter, vaultRowId: Id<'safebyok_vaults'>, deleted: Doc<'safebyok_boxes'>): Promise<void> => {
  const kept = await findTallyRow(db, vaultRowId)
  if (! kept) { return }
  await db.patch('safebyok_vault_tallies', kept._id, plus(kept, { box_count: -1, box_bytes: -weigh(deleted) }))
}

/** Remove the vault's tally, when it has one: its vault is being deleted. */
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
