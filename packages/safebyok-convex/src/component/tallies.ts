import * as DB from 'safebyok/storage'
import { getDocumentSize } from 'convex/values'
import type { Value } from 'convex/values'
import type { WithoutSystemFields } from 'convex/server'
import type { Doc } from './_generated/dataModel'
import type { DatabaseReader, DatabaseWriter } from './_generated/server'

// The component enforces its own limits on a vault, whatever cap the client sends, so that one
// transaction can always delete the whole vault. `delVault` reads every box row of the life and
// deletes each, and a Convex transaction may read 16 MiB and write 16,000 documents. The limits are
// half of each, which leaves room for the vault row and the tally. They are enforced here because a
// modified client cannot be trusted to keep its vault small. `delVault` has to read and delete a
// box's tombstone too, so tombstones count toward both limits: putting and deleting under new
// boxlabels fills a life just as putting alone does. A tally keeps the live rows' figures beside them.

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

// == [Tallies]: Life, Tally, Reckoning, BoxDocGiven, weigh, tallyOf, growthOf, capacityOf, reckon, refuses, record, forget, drop

/** The labels and token that name one life of one vault. */
export type Life = { applabel: string, user_id: string, vaultlabel: string, vault_tok: string }

/** A life's box rows counted and weighed: `all_*` of every row, tombstones included, and `live_*` of the live rows alone. */
export type Tally = { all_count: number, live_count: number, all_size: number, live_size: number }

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

/** The tally of `boxDoc` alone, or an empty tally for null. */
export function tallyOf(boxDoc: BoxDocGiven | null): Tally {
  const size = weigh(boxDoc)
  const isLive = DB.isLiveRow(boxDoc?.box)
  return { all_count: (boxDoc === null) ? 0 : 1, live_count: isLive ? 1 : 0, all_size: size, live_size: isLive ? size : 0 }
}

/** How a life's tally changes when `boxDoc` is written in place of `anteDoc`, or as a new row where it is null. */
export function growthOf(anteDoc: BoxDocGiven | null, boxDoc: BoxDocGiven): Tally { return plus(tallyOf(boxDoc), negated(tallyOf(anteDoc))) }

/** Return how full a life is against `maxBoxes` and the byte limit. A life past a limit (a null tally) is reported as full. */
export function capacityOf(tally: Tally | null, maxBoxes: number) {
  return {
    boxes: { used: tally?.all_count ?? maxBoxes, max: maxBoxes },
    bytes: { used: tally?.all_size ?? MaxVaultBoxBytes, max: MaxVaultBoxBytes },
  }
}

/** Read the life's tally: the stored one, or else a count of its box rows that stops once a limit is passed. */
export async function reckon(db: DatabaseReader, life: Life): Promise<Reckoning> {
  const kept = await getTallyRow(db, life)
  if (kept) { return { kept, tally: { all_count: kept.all_count, live_count: kept.live_count, all_size: kept.all_size, live_size: kept.live_size } } }
  // A loop, not a reduce, so it can stop reading rows once a limit is passed.
  let tally = tallyOf(null)
  for await (const boxDoc of lifeBoxQuery(db, life)) {
    tally = plus(tally, tallyOf(boxDoc))
    if ((tally.all_count > MaxVaultBoxes) || (tally.all_size > MaxVaultBoxBytes)) { return { kept: null, tally: null } }
  }
  return { kept: null, tally }
}

/** True when a put that grows the life by `growth` would pass `maxBoxes` or the byte limit. Both limits count every box row, tombstones included. */
export function refuses(tally: Tally | null, growth: Tally, maxBoxes: number): boolean {
  if (tally === null) { return (growth.all_count > 0) || (growth.all_size > 0) }
  const after = plus(tally, growth)
  return ((growth.all_count > 0) && (after.all_count > maxBoxes)) || ((growth.all_size > 0) && (after.all_size > MaxVaultBoxBytes))
}

/** Add a put's `growth` to the life's tally, inserting the tally row the first time. A life past a limit gets no tally row. */
export const record = async (db: DatabaseWriter, life: Life, { kept, tally }: Reckoning, growth: Tally): Promise<void> => {
  if (tally === null) { return }
  if (kept) { await db.patch('safebyok_tallies', kept._id, plus(tally, growth)) } else { await db.insert('safebyok_tallies', { ...life, ...plus(tally, growth) }) }
}

// A del never recounts a life: a life too large to read in one transaction must still be able to shrink, one box at a time.
/** Add a del's `growth` to the life's tally, if it has one. */
export const forget = async (db: DatabaseWriter, life: Life, growth: Tally): Promise<void> => {
  const kept = await getTallyRow(db, life)
  if (kept) { await db.patch('safebyok_tallies', kept._id, plus(kept, growth)) }
}

/** Delete the life's tally row, if it has one. */
export const drop = async (db: DatabaseWriter, life: Life): Promise<void> => {
  const kept = await getTallyRow(db, life)
  if (kept) { await db.delete('safebyok_tallies', kept._id) }
}

function plus(tally: Tally, growth: Tally): Tally {
  return {
    all_count:  tally.all_count + growth.all_count,
    live_count: tally.live_count + growth.live_count,
    all_size:   tally.all_size + growth.all_size,
    live_size:  tally.live_size + growth.live_size,
  }
}

function negated({ all_count, live_count, all_size, live_size }: Tally): Tally {
  return { all_count: -all_count, live_count: -live_count, all_size: -all_size, live_size: -live_size }
}

// `.unique()` throws if it finds two rows. A tally is inserted only when none was found in the same
// transaction, so two would mean damage, and that should fail loudly.
const getTallyRow = (db: DatabaseReader, { applabel, user_id, vaultlabel, vault_tok }: Life) => (
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
