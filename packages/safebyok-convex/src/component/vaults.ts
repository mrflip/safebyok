import * as DB from 'safebyok/storage'
import type { VaultScope, WatchScope } from 'safebyok/storage'
import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { DatabaseReader, DatabaseWriter } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import * as Tallies from './tallies'
import type { BoxDocGiven, Life } from './tallies'
import * as CVX from './validators'

// One function for each of AdapterVaultDB's generic calls. They are called through the host's
// wrapper, which has already checked that the caller is the user the call names. Convex runs a
// mutation as one serializable transaction, so each put and del reads its rows, decides with the
// core's own predicates, and writes (or not) atomically. A query reads from one snapshot.

// == [Gets]: listVaults, getVault, listBoxes, getBox

/** List every vault row of a bank, each with its vaultlabel. */
export const listVaults = query({
  args:    CVX.listVaultsArgs,
  returns: v.array(CVX.rowOfVault),
  handler: async (ctx, { scope }) => {
    const vaultDocs = await listVaultDocs(ctx.db, scope)
    return vaultDocs.map(({ vaultlabel, vault }) => ({ vaultlabel, vault }))
  },
})

/** Get the vault row at `scope`, or null. */
export const getVault = query({
  args:    CVX.getVaultArgs,
  returns: v.any(),
  handler: async (ctx, { scope }) => {
    const vaultDoc = await findVaultDoc(ctx.db, scope)
    return vaultDoc?.vault ?? null
  },
})

/** List the box rows of one life of a vault, with the vault row read in the same snapshot. */
export const listBoxes = query({
  args:    CVX.listBoxesArgs,
  returns: CVX.boxesFetched,
  handler: async (ctx, { asked }) => {
    const vaultDoc = await findVaultDoc(ctx.db, asked)
    const vault = vaultDoc?.vault ?? null
    const boxDocs: BoxDoc[] = await Tallies.lifeBoxQuery(ctx.db, asked).collect()
    return { vault, boxes: boxDocs.map(({ boxlabel, box }) => ({ boxlabel, box })) }
  },
})

/** Get one box row (or null) from one life of a vault, with the vault row read in the same snapshot. */
export const getBox = query({
  args:    CVX.getBoxArgs,
  returns: CVX.boxFetched,
  handler: async (ctx, { asked }) => {
    const vaultDoc = await findVaultDoc(ctx.db, asked)
    const vault = vaultDoc?.vault ?? null
    const boxDoc = await findBoxDoc(ctx.db, asked, asked.boxlabel)
    const box = boxDoc?.box ?? null
    return { vault, box }
  },
})
// --

// == [Puts]: putVault, putBox

/** Put a vault row if `opts` allow it over the stored row. Returns whether it was written, and the row it found. */
export const putVault = mutation({
  args:    CVX.putVaultArgs,
  returns: CVX.written,
  handler: async (ctx, { record, opts }) => {
    const anteDoc = await findVaultDoc(ctx.db, record)
    const ante = anteDoc?.vault ?? null
    const isWritten = DB.isVaultPutAllowed(ante, record, opts)
    if (isWritten) { await writeVaultDoc(ctx.db, anteDoc, record) }
    return { isWritten, ante }
  },
})

/** Put a box row if its vault is live and `opts` allow it over the stored row.
 * Returns whether it was written, or the vault's capacity when there is no room for it.
 */
export const putBox = mutation({
  args:    CVX.putBoxArgs,
  returns: CVX.putBoxAnswer,
  handler: async (ctx, { record, opts, maxBoxes = Tallies.MaxVaultBoxes }) => {
    const vaultDoc = await findVaultDoc(ctx.db, record)
    const vault = vaultDoc?.vault ?? null
    const life = lifeOf(record)
    const anteDoc = await findBoxDoc(ctx.db, life, record.boxlabel)
    const ante = anteDoc?.box ?? null
    const isWritten = DB.isLiveVaultRecord(vault, record.vault_tok) && DB.isBoxPutAllowed(ante, record, opts)
    if (! isWritten) { return { isWritten, ante, vault } }
    // Convex accepts NaN as a number. Math.min would return it, and no count is greater than NaN, so the limit would never apply.
    const cap = Number.isNaN(maxBoxes) ? Tallies.MaxVaultBoxes : Math.min(maxBoxes, Tallies.MaxVaultBoxes)
    const boxDoc = { ...life, boxlabel: record.boxlabel, box: record }
    // A put over a tombstone replaces that row, so only a new boxlabel adds to the count.
    const growth = { box_count: (anteDoc === null ? 1 : 0), box_bytes: Tallies.weigh(boxDoc) - Tallies.weigh(anteDoc) }
    const reckoning = await Tallies.reckon(ctx.db, life)
    if (Tallies.refuses(reckoning.tally, growth, cap)) { return { capacity: Tallies.capacityOf(reckoning.tally, cap) } }
    await writeBoxDoc(ctx.db, anteDoc, boxDoc)
    await Tallies.record(ctx.db, life, reckoning, growth)
    return { isWritten, ante, vault }
  },
})
// --

// == [Dels]: delVault, delBox

/** Replace a vault's live row with its tombstone when the row is at revision `opts.prior`, then tombstone that life's boxes.
 * Returns whether the vault row was written.
 */
export const delVault = mutation({
  args:    CVX.delVaultArgs,
  returns: CVX.written,
  handler: async (ctx, { tombstone, opts: { prior } }) => {
    const anteDoc = await findVaultDoc(ctx.db, tombstone)
    const ante = anteDoc?.vault ?? null
    const isOurs = DB.isLiveVaultRecord(ante, tombstone.vault_tok)
    const isDamaged = (ante !== null) && (! DB.vaultRow.safeParse(ante).success)
    const isWritten = isOurs && DB.isRowAt(ante, prior)
    // Stop, leaving the boxes alone, when this life's live row is at another revision or the row is damaged.
    // In every other case go on, so that a repeated del can finish tombstoning the boxes.
    if ((! isWritten) && (isOurs || isDamaged)) { return { isWritten, ante } }
    if (isWritten) { await writeVaultDoc(ctx.db, anteDoc, tombstone) }
    await tombstoneBoxes(ctx.db, lifeOf(tombstone), tombstone.written_at)
    return { isWritten, ante }
  },
})

/** Replace a box's live row with its tombstone when the row is at revision `opts.prior` and its vault is live. Returns whether it was written. */
export const delBox = mutation({
  args:    CVX.delBoxArgs,
  returns: CVX.boxWritten,
  handler: async (ctx, { tombstone, opts: { prior } }) => {
    const vaultDoc = await findVaultDoc(ctx.db, tombstone)
    const vault = vaultDoc?.vault ?? null
    const life = lifeOf(tombstone)
    const anteDoc = await findBoxDoc(ctx.db, life, tombstone.boxlabel)
    const ante = anteDoc?.box ?? null
    const isDeletable = DB.isLiveBoxRecord(ante, tombstone.vault_tok) && DB.isRowAt(ante, prior)
    const isWritten = DB.isLiveVaultRecord(vault, tombstone.vault_tok) && isDeletable
    if (isWritten) {
      const boxDoc = { ...life, boxlabel: tombstone.boxlabel, box: tombstone }
      await writeBoxDoc(ctx.db, anteDoc, boxDoc)
      // The tombstone replaces the row and still counts as one box row. Only the bytes change.
      await Tallies.forget(ctx.db, life, { box_count: 0, box_bytes: Tallies.weigh(boxDoc) - Tallies.weigh(anteDoc) })
    }
    return { isWritten, ante, vault }
  },
})
// --

// == [Upkeep]: tidyGone, watchRows

/** Delete the box rows and tallies of every ended life in a bank. Returns how many box rows remain. */
export const tidyGone = mutation({
  args:    CVX.tidyGoneArgs,
  returns: CVX.tidied,
  handler: async (ctx, { scope }) => {
    const vaultDocs = await listVaultDocs(ctx.db, scope)
    const vaultsBylabel = new Map(vaultDocs.map(({ vaultlabel, vault }) => [vaultlabel, vault]))
    const isOver = ({ vaultlabel, vault_tok }: Life) => DB.isLifeOver(vaultsBylabel.get(vaultlabel) ?? null, vault_tok)
    const boxDocs = await listBoxDocs(ctx.db, scope)
    const tallyDocs = await listTallyDocs(ctx.db, scope)
    const overBoxDocs = boxDocs.filter((boxDoc) => isOver(boxDoc))
    const overTallyDocs = tallyDocs.filter((tallyDoc) => isOver(tallyDoc))
    await Promise.all(overBoxDocs.map(({ _id }) => ctx.db.delete('safebyok_boxes', _id)))
    await Promise.all(overTallyDocs.map(({ _id }) => ctx.db.delete('safebyok_tallies', _id)))
    return { totalCount: boxDocs.length - overBoxDocs.length }
  },
})

// A Convex query reads whole documents, so a bank-wide watch reads every row of the bank each time it runs.
/** List every vault row and box row in `scope`, for a client to subscribe to. */
export const watchRows = query({
  args:    CVX.watchRowsArgs,
  returns: CVX.rowsWatched,
  handler: async (ctx, { scope }) => {
    const vaultDocs = await listVaultDocs(ctx.db, scope)
    const boxDocs = await listBoxDocs(ctx.db, scope)
    return {
      vaults: vaultDocs.map(({ vaultlabel, vault }) => ({ vaultlabel, vault })),
      boxes:  boxDocs.map(({ vaultlabel, vault_tok, boxlabel, box }) => ({ vaultlabel, vault_tok, boxlabel, box })),
    }
  },
})
// --

// == [Helpers]: lifeOf, findVaultDoc, findBoxDoc, writeVaultDoc, writeBoxDoc, tombstoneBoxes, listVaultDocs, listBoxDocs, listTallyDocs, VaultDoc, BoxDoc

/** Return the life a record belongs to: its vault's scope and `vault_tok`. */
const lifeOf = ({ applabel, user_id, vaultlabel, vault_tok }: Life): Life => ({ applabel, user_id, vaultlabel, vault_tok })

// `.unique()` throws if it finds two documents. A document is inserted only when none was found in
// the same transaction, so two would mean damage, and that should fail loudly.
const findVaultDoc = async (db: DatabaseReader, { applabel, user_id, vaultlabel }: VaultScope): Promise<VaultDoc | null> => (
  await db.query('safebyok_vaults')
    .withIndex('by_scope', (idx) => idx.eq('user_id', user_id).eq('applabel', applabel).eq('vaultlabel', vaultlabel))
    .unique()
)

const findBoxDoc = async (db: DatabaseReader, { applabel, user_id, vaultlabel, vault_tok }: Life, boxlabel: string): Promise<BoxDoc | null> => (
  await db.query('safebyok_boxes')
    .withIndex('by_box', (idx) => idx.eq('user_id', user_id).eq('applabel', applabel).eq('vaultlabel', vaultlabel).eq('vault_tok', vault_tok).eq('boxlabel', boxlabel))
    .unique()
)

/** Write `vault` in place of `anteDoc`, or as a new document. */
const writeVaultDoc = async (db: DatabaseWriter, anteDoc: VaultDoc | null, vault: DB.VaultRecord | DB.VaultTombstone): Promise<void> => {
  const { applabel, user_id, vaultlabel } = vault
  if (anteDoc) { await db.replace('safebyok_vaults', anteDoc._id, { applabel, user_id, vaultlabel, vault }) } else { await db.insert('safebyok_vaults', { applabel, user_id, vaultlabel, vault }) }
}

/** Write `boxDoc` in place of `anteDoc`, or as a new document. */
const writeBoxDoc = async (db: DatabaseWriter, anteDoc: BoxDoc | null, boxDoc: BoxDocGiven): Promise<void> => {
  if (anteDoc) { await db.replace('safebyok_boxes', anteDoc._id, boxDoc) } else { await db.insert('safebyok_boxes', boxDoc) }
}

/** Tombstone every live box row of `life`, and drop its tally. */
const tombstoneBoxes = async (db: DatabaseWriter, life: Life, written_at: number): Promise<void> => {
  const boxDocs: BoxDoc[] = await Tallies.lifeBoxQuery(db, life).collect()
  await Promise.all(boxDocs.map(async (boxDoc) => {
    const boxTombstone = DB.boxTombstoneOf(boxDoc.box, written_at)
    if (boxTombstone !== null) { await db.patch('safebyok_boxes', boxDoc._id, { box: boxTombstone }) }
  }))
  await Tallies.drop(db, life)
}

/** List the vault documents of a bank, or of one vault when the scope has a `vaultlabel`. */
const listVaultDocs = async (db: DatabaseReader, { applabel, user_id, vaultlabel }: WatchScope): Promise<VaultDoc[]> => (
  await db.query('safebyok_vaults').withIndex('by_scope', (idx) => {
    const bank = idx.eq('user_id', user_id).eq('applabel', applabel)
    return (vaultlabel === undefined) ? bank : bank.eq('vaultlabel', vaultlabel)
  }).collect()
)

/** List the box documents of a bank, or of one vault when the scope has a `vaultlabel`, across every life. */
const listBoxDocs = async (db: DatabaseReader, { applabel, user_id, vaultlabel }: WatchScope): Promise<BoxDoc[]> => (
  await db.query('safebyok_boxes').withIndex('by_box', (idx) => {
    const bank = idx.eq('user_id', user_id).eq('applabel', applabel)
    return (vaultlabel === undefined) ? bank : bank.eq('vaultlabel', vaultlabel)
  }).collect()
)

/** List the tally documents of a bank. */
const listTallyDocs = async (db: DatabaseReader, { applabel, user_id }: WatchScope): Promise<Doc<'safebyok_tallies'>[]> => (
  await db.query('safebyok_tallies').withIndex('by_life', (idx) => idx.eq('user_id', user_id).eq('applabel', applabel)).collect()
)

/** A vault document. Its `vault` row is `unknown` until the core's predicates have checked it. */
type VaultDoc = Omit<Doc<'safebyok_vaults'>, 'vault'> & { vault: unknown }

/** A box document. Its `box` row is `unknown` until the core's predicates have checked it. */
type BoxDoc = Omit<Doc<'safebyok_boxes'>, 'box'> & { box: unknown }
// --
