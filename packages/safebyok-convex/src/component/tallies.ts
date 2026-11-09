import { getDocumentSize } from 'convex/values'
import type { Value } from 'convex/values'
import type { WithoutSystemFields } from 'convex/server'
import type { Doc } from './_generated/dataModel'
import type { DatabaseReader, DatabaseWriter } from './_generated/server'

// A vault is held to limits, whatever its client asks, so that one transaction can always tombstone
// it whole: `delVault` reads every box row of the life once and writes each live one, and a Convex
// transaction may read 16 MiB and write 16,000 documents. The limits are half of each, leaving room
// for the vault row and the tally, as a modified client need not keep its vault small. A box's
// tombstone is a row `delVault` reads as surely as a live box, so it counts toward both limits:
// putting and deleting under fresh boxlabels fills a life as putting alone does.

// == [Limits]: MaxVaultBoxes, MaxVaultBoxBytes

/** Convex's most for one document, in bytes. */
const ConvexDocumentBytes = 1_048_576

/** Convex's most for one transaction to read, in bytes. */
const ConvexTransactionReadBytes = 16_777_216

/** Convex's most documents for one transaction to write. */
const ConvexTransactionWrittenDocuments = 16_000

/** Room for the tally row beside the vault row. */
const TallyReserveBytes = 1024

/** The most box rows one life of a vault holds, live or tombstoned. */
export const MaxVaultBoxes = ConvexTransactionWrittenDocuments / 2

/** The most one life's box rows weigh together, live or tombstoned, in bytes as Convex counts a document. */
export const MaxVaultBoxBytes = (ConvexTransactionReadBytes / 2) - ConvexDocumentBytes - TallyReserveBytes
// --

// == [Tallies]: Life, Tally, Reckoning, BoxDocGiven, weigh, capacityOf, reckon, refuses, record, forget, drop

/** The labels and token that name one life of one vault. */
export type Life = { applabel: string, user_id: string, vaultlabel: string, vault_tok: string }

/** How many box rows a life holds, live or tombstoned, and what they weigh. */
export type Tally = { box_count: number, box_bytes: number }

/** A life's tally as a put finds it: the row it is kept in, if any, and the count, null for a life past a limit. */
export type Reckoning = { kept: Doc<'safebyok_tallies'> | null, tally: Tally | null }

/** A box document as stored or about to be, its row unknown until the core's predicates judge it. */
export type BoxDocGiven = Omit<WithoutSystemFields<Doc<'safebyok_boxes'>>, 'box'> & { box: unknown }

/** What `boxDoc` weighs toward its life's limit, its system fields at Convex's estimate. */
export const weigh = (boxDoc: BoxDocGiven | null): number => {
  if (boxDoc === null) { return 0 }
  const { applabel, user_id, vaultlabel, vault_tok, boxlabel, box } = boxDoc
  // A box row came through a Convex validator or out of the table, so it is a Convex value.
  return getDocumentSize({ applabel, user_id, vaultlabel, vault_tok, boxlabel, box: box as Value })
}

/** How full a life is against the cap `maxBoxes`, a life past a limit answered as full. */
export const capacityOf = (tally: Tally | null, maxBoxes: number) => ({
  boxes: { used: tally?.box_count ?? maxBoxes, max: maxBoxes },
  bytes: { used: tally?.box_bytes ?? MaxVaultBoxBytes, max: MaxVaultBoxBytes },
})

/** The life's tally as it stands: the one kept, or one counted from its box rows, stopping past a limit. */
export const reckon = async (db: DatabaseReader, life: Life): Promise<Reckoning> => {
  const kept = await findTallyRow(db, life)
  if (kept) { return { kept, tally: { box_count: kept.box_count, box_bytes: kept.box_bytes } } }
  // A loop rather than a reduce: it reads the rows as it goes, and stops reading past a limit.
  let tally: Tally = { box_count: 0, box_bytes: 0 }
  for await (const boxDoc of lifeBoxQuery(db, life)) {
    tally = plus(tally, { box_count: 1, box_bytes: weigh(boxDoc) })
    if ((tally.box_count > MaxVaultBoxes) || (tally.box_bytes > MaxVaultBoxBytes)) { return { kept: null, tally: null } }
  }
  return { kept: null, tally }
}

/** True when a put growing the life by `growth` would pass `maxBoxes` or the byte limit. */
export const refuses = (tally: Tally | null, growth: Tally, maxBoxes: number): boolean => {
  if (tally === null) { return (growth.box_count > 0) || (growth.box_bytes > 0) }
  const after = plus(tally, growth)
  return ((growth.box_count > 0) && (after.box_count > maxBoxes)) || ((growth.box_bytes > 0) && (after.box_bytes > MaxVaultBoxBytes))
}

/** Move the life's tally by a put's `growth`, writing it the first time; a life past a limit keeps none. */
export const record = async (db: DatabaseWriter, life: Life, { kept, tally }: Reckoning, growth: Tally): Promise<void> => {
  if (tally === null) { return }
  if (kept) { await db.patch('safebyok_tallies', kept._id, plus(tally, growth)) } else { await db.insert('safebyok_tallies', { ...life, ...plus(tally, growth) }) }
}

/** Move the life's tally by a del's `growth`, where it has one. */
// A del never counts a life afresh: a life too large to read whole must still shrink, a box at a time.
export const forget = async (db: DatabaseWriter, life: Life, growth: Tally): Promise<void> => {
  const kept = await findTallyRow(db, life)
  if (kept) { await db.patch('safebyok_tallies', kept._id, plus(kept, growth)) }
}

/** Remove the life's tally, where it has one. */
export const drop = async (db: DatabaseWriter, life: Life): Promise<void> => {
  const kept = await findTallyRow(db, life)
  if (kept) { await db.delete('safebyok_tallies', kept._id) }
}

const plus = (tally: Tally, growth: Tally): Tally => ({
  box_count: tally.box_count + growth.box_count,
  box_bytes: tally.box_bytes + growth.box_bytes,
})

// `.unique()` throws on a second row: a tally is inserted only where none was found, in the same
// transaction, so two would be damage, which surfaces rather than being papered over.
const findTallyRow = (db: DatabaseReader, { applabel, user_id, vaultlabel, vault_tok }: Life) => (
  db.query('safebyok_tallies')
    .withIndex('by_life', (idx) => idx.eq('user_id', user_id).eq('applabel', applabel).eq('vaultlabel', vaultlabel).eq('vault_tok', vault_tok))
    .unique()
)

/** The box rows of one life, in boxlabel order. */
export const lifeBoxQuery = (db: DatabaseReader, { applabel, user_id, vaultlabel, vault_tok }: Life) => (
  db.query('safebyok_boxes')
    .withIndex('by_box', (idx) => idx.eq('user_id', user_id).eq('applabel', applabel).eq('vaultlabel', vaultlabel).eq('vault_tok', vault_tok))
)
// --
