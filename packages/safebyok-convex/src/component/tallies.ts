import { getDocumentSize } from 'convex/values'
import type { Value } from 'convex/values'
import type { WithoutSystemFields } from 'convex/server'
import type { Doc } from './_generated/dataModel'
import type { DatabaseReader, DatabaseWriter } from './_generated/server'

// The component enforces its own limits on a vault, whatever cap the client sends, so that one
// transaction can always tombstone the whole vault. `delVault` reads every box row of the life and
// writes each live one, and a Convex transaction may read 16 MiB and write 16,000 documents. The
// limits are half of each, which leaves room for the vault row and the tally. They are enforced
// here because a modified client cannot be trusted to keep its vault small. `delVault` has to read
// a box's tombstone too, so tombstones count toward both limits: putting and deleting under new
// boxlabels fills a life just as putting alone does.

// == [Limits]: MaxVaultBoxes, MaxVaultBoxBytes

/** Convex's size limit for one document, in bytes. */
const ConvexDocumentBytes = 1_048_576

/** Convex's limit on what one transaction may read, in bytes. */
const ConvexTransactionReadBytes = 16_777_216

/** Convex's limit on the documents one transaction may write. */
const ConvexTransactionWrittenDocuments = 16_000

/** Bytes reserved for reading the tally row. */
const TallyReserveBytes = 1024

/** The most box rows one life of a vault may have, tombstones included. */
export const MaxVaultBoxes = ConvexTransactionWrittenDocuments / 2

/** The most bytes one life's box rows may total, tombstones included, measured as Convex sizes a document. */
export const MaxVaultBoxBytes = (ConvexTransactionReadBytes / 2) - ConvexDocumentBytes - TallyReserveBytes
// --

// == [Tallies]: Life, Tally, Reckoning, BoxDocGiven, weigh, capacityOf, reckon, refuses, record, forget, drop

/** The labels and token that name one life of one vault. */
export type Life = { applabel: string, user_id: string, vaultlabel: string, vault_tok: string }

/** A life's box row count and total bytes, tombstones included. */
export type Tally = { box_count: number, box_bytes: number }

/** A life's tally as read for a put. `kept` is the stored tally row, if any. `tally` is null when the life is past a limit. */
export type Reckoning = { kept: Doc<'safebyok_tallies'> | null, tally: Tally | null }

/** A box document, stored or about to be. Its `box` row is `unknown` until the core's predicates have checked it. */
export type BoxDocGiven = Omit<WithoutSystemFields<Doc<'safebyok_boxes'>>, 'box'> & { box: unknown }

/** Return the bytes `boxDoc` counts toward its life's limit, by Convex's `getDocumentSize` with its allowance for system fields. Null counts 0. */
export const weigh = (boxDoc: BoxDocGiven | null): number => {
  if (boxDoc === null) { return 0 }
  const { applabel, user_id, vaultlabel, vault_tok, boxlabel, box } = boxDoc
  // The box row came through a Convex validator or out of the table, so it is a Convex value.
  return getDocumentSize({ applabel, user_id, vaultlabel, vault_tok, boxlabel, box: box as Value })
}

/** Return how full a life is against `maxBoxes` and the byte limit. A life past a limit (a null tally) is reported as full. */
export const capacityOf = (tally: Tally | null, maxBoxes: number) => ({
  boxes: { used: tally?.box_count ?? maxBoxes, max: maxBoxes },
  bytes: { used: tally?.box_bytes ?? MaxVaultBoxBytes, max: MaxVaultBoxBytes },
})

/** Read the life's tally: the stored one, or else a count of its box rows that stops once a limit is passed. */
export const reckon = async (db: DatabaseReader, life: Life): Promise<Reckoning> => {
  const kept = await findTallyRow(db, life)
  if (kept) { return { kept, tally: { box_count: kept.box_count, box_bytes: kept.box_bytes } } }
  // A loop, not a reduce, so it can stop reading rows once a limit is passed.
  let tally: Tally = { box_count: 0, box_bytes: 0 }
  for await (const boxDoc of lifeBoxQuery(db, life)) {
    tally = plus(tally, { box_count: 1, box_bytes: weigh(boxDoc) })
    if ((tally.box_count > MaxVaultBoxes) || (tally.box_bytes > MaxVaultBoxBytes)) { return { kept: null, tally: null } }
  }
  return { kept: null, tally }
}

/** True when a put that grows the life by `growth` would pass `maxBoxes` or the byte limit. */
export const refuses = (tally: Tally | null, growth: Tally, maxBoxes: number): boolean => {
  if (tally === null) { return (growth.box_count > 0) || (growth.box_bytes > 0) }
  const after = plus(tally, growth)
  return ((growth.box_count > 0) && (after.box_count > maxBoxes)) || ((growth.box_bytes > 0) && (after.box_bytes > MaxVaultBoxBytes))
}

/** Add a put's `growth` to the life's tally, inserting the tally row the first time. A life past a limit gets no tally row. */
export const record = async (db: DatabaseWriter, life: Life, { kept, tally }: Reckoning, growth: Tally): Promise<void> => {
  if (tally === null) { return }
  if (kept) { await db.patch('safebyok_tallies', kept._id, plus(tally, growth)) } else { await db.insert('safebyok_tallies', { ...life, ...plus(tally, growth) }) }
}

// A del never recounts a life: a life too large to read in one transaction must still be able to shrink, one box at a time.
/** Add a del's `growth` to the life's tally, if it has one. */
export const forget = async (db: DatabaseWriter, life: Life, growth: Tally): Promise<void> => {
  const kept = await findTallyRow(db, life)
  if (kept) { await db.patch('safebyok_tallies', kept._id, plus(kept, growth)) }
}

/** Delete the life's tally row, if it has one. */
export const drop = async (db: DatabaseWriter, life: Life): Promise<void> => {
  const kept = await findTallyRow(db, life)
  if (kept) { await db.delete('safebyok_tallies', kept._id) }
}

const plus = (tally: Tally, growth: Tally): Tally => ({
  box_count: tally.box_count + growth.box_count,
  box_bytes: tally.box_bytes + growth.box_bytes,
})

// `.unique()` throws if it finds two rows. A tally is inserted only when none was found in the same
// transaction, so two would mean damage, and that should fail loudly.
const findTallyRow = (db: DatabaseReader, { applabel, user_id, vaultlabel, vault_tok }: Life) => (
  db.query('safebyok_tallies')
    .withIndex('by_life', (idx) => idx.eq('user_id', user_id).eq('applabel', applabel).eq('vaultlabel', vaultlabel).eq('vault_tok', vault_tok))
    .unique()
)

/** Query the box rows of one life, in boxlabel order. */
export const lifeBoxQuery = (db: DatabaseReader, { applabel, user_id, vaultlabel, vault_tok }: Life) => (
  db.query('safebyok_boxes')
    .withIndex('by_box', (idx) => idx.eq('user_id', user_id).eq('applabel', applabel).eq('vaultlabel', vaultlabel).eq('vault_tok', vault_tok))
)
// --
