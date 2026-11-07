import * as DB from 'safebyok/storage'
import type { PutOptsGiven, VaultScope, WatchScope } from 'safebyok/storage'
import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { DatabaseReader, DatabaseWriter } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import * as Tallies from './tallies'
import type { BoxDocGiven, Life } from './tallies'
import * as CVX from './validators'

// One function for each of the VaultDB's generic calls, reached through the host's wrapper, which
// has already proved the caller is the user each call names. Convex runs a mutation as one
// serializable transaction, so each put and del is one atomic step: it reads the rows it judges,
// decides by the core's own predicates, and writes, or not, in one go. A query reads one snapshot.

// == [Gets]: listVaults, getVault, listBoxes, getBox

/** Every vault row of a bank, by vaultlabel. */
export const listVaults = query({
  args:    CVX.listVaultsArgs,
  returns: v.array(CVX.rowOfVault),
  handler: async (ctx, { scope }) => {
    const vaultDocs = await listVaultDocs(ctx.db, scope)
    return vaultDocs.map(({ vaultlabel, vault }) => ({ vaultlabel, vault }))
  },
})

/** The vault row at `scope`, or null. */
export const getVault = query({
  args:    CVX.getVaultArgs,
  returns: v.any(),
  handler: async (ctx, { scope }) => {
    const vaultDoc = await findVaultDoc(ctx.db, scope)
    return vaultDoc?.vault ?? null
  },
})

/** The box rows of one life of a vault, and the vault row, from one snapshot. */
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

/** One box row of one life of a vault, or null, and the vault row, from one snapshot. */
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

/** Store a vault row where `opts` allow it over the row found, answering the landing. */
export const putVault = mutation({
  args:    CVX.putVaultArgs,
  returns: CVX.landing,
  handler: async (ctx, { record, opts }) => {
    const anteDoc = await findVaultDoc(ctx.db, record)
    const ante = anteDoc?.vault ?? null
    const landed = isPutAllowed(ante, opts)
    if (landed) { await storeVaultDoc(ctx.db, anteDoc, record) }
    return { landed, ante }
  },
})

/** Store a box row under the vault's live life as `opts` allow, answering the landing. */
export const putBox = mutation({
  args:    CVX.putBoxArgs,
  returns: CVX.putBoxAnswer,
  handler: async (ctx, { record, opts, maxBoxes = Tallies.MaxVaultBoxes }) => {
    const vaultDoc = await findVaultDoc(ctx.db, record)
    const vault = vaultDoc?.vault ?? null
    const life = lifeOf(record)
    const anteDoc = await findBoxDoc(ctx.db, life, record.boxlabel)
    const ante = anteDoc?.box ?? null
    const landed = DB.isCheckedLiveVault(vault, record.vault_tok) && isPutAllowed(ante, opts)
    if (! landed) { return { landed, ante, vault } }
    // Convex passes NaN as a number, and Math.min would carry it past the limit: no box count exceeds NaN.
    const cap = Number.isNaN(maxBoxes) ? Tallies.MaxVaultBoxes : Math.min(maxBoxes, Tallies.MaxVaultBoxes)
    const boxDoc = { ...life, boxlabel: record.boxlabel, box: record }
    // A put over a tombstone or a damaged row takes that row's place: only a new boxlabel adds a row.
    const growth = { box_count: (anteDoc === null ? 1 : 0), box_bytes: Tallies.weigh(boxDoc) - Tallies.weigh(anteDoc) }
    const reckoning = await Tallies.reckon(ctx.db, life)
    if (Tallies.refuses(reckoning.tally, growth, cap)) { return { capacity: Tallies.capacityOf(reckoning.tally, cap) } }
    await storeBoxDoc(ctx.db, anteDoc, boxDoc)
    await Tallies.record(ctx.db, life, reckoning, growth)
    return { landed, ante, vault }
  },
})
// --

// == [Dels]: delVault, delBox

/** Store a vault's tombstone over its live or damaged row at `opts.prior`, answering the landing. */
export const delVault = mutation({
  args:    CVX.delVaultArgs,
  returns: CVX.landing,
  handler: async (ctx, { tombstone, opts: { prior } }) => {
    const anteDoc = await findVaultDoc(ctx.db, tombstone)
    const ante = anteDoc?.vault ?? null
    const isOurs = DB.isLiveRowUnder(ante, tombstone.vault_tok)
    const isDamaged = (ante !== null) && (! DB.vaultRow.safeParse(ante).success)
    const landed = (isOurs && DB.isRowAt(ante, prior)) || DB.isDamagedVaultAt(ante, tombstone, prior)
    // A live row of this life, or damage, that the tombstone does not name stops the del whole; any other row lets a repeat sweep the boxes.
    if ((! landed) && (isOurs || isDamaged)) { return { landed, ante } }
    if (landed) { await storeVaultDoc(ctx.db, anteDoc, tombstone) }
    await tombstoneBoxes(ctx.db, lifeOf(tombstone), tombstone.written_at)
    return { landed, ante }
  },
})

/** Store a box's tombstone over its live or damaged row at `opts.prior`, answering the landing. */
export const delBox = mutation({
  args:    CVX.delBoxArgs,
  returns: CVX.boxLanding,
  handler: async (ctx, { tombstone, opts: { prior } }) => {
    const vaultDoc = await findVaultDoc(ctx.db, tombstone)
    const vault = vaultDoc?.vault ?? null
    const life = lifeOf(tombstone)
    const anteDoc = await findBoxDoc(ctx.db, life, tombstone.boxlabel)
    const ante = anteDoc?.box ?? null
    const isDeletable = (DB.isLiveRow(ante) && DB.isRowAt(ante, prior)) || DB.isDamagedBoxAt(ante, tombstone, prior)
    const landed = DB.isCheckedLiveVault(vault, tombstone.vault_tok) && isDeletable
    if (landed) {
      const boxDoc = { ...life, boxlabel: tombstone.boxlabel, box: tombstone }
      await storeBoxDoc(ctx.db, anteDoc, boxDoc)
      // The tombstone takes the row's place, and counts as the row did.
      await Tallies.forget(ctx.db, life, { box_count: 0, box_bytes: Tallies.weigh(boxDoc) - Tallies.weigh(anteDoc) })
    }
    return { landed, ante, vault }
  },
})
// --

// == [Upkeep]: tidyGone, watchRows

/** Remove the box rows and tallies of every life of a bank that has ended, answering how many box rows remain. */
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

/** Every vault row and box row under `scope`, for a client to subscribe to. */
// A Convex query reads whole documents, so a bank-wide watch reads every row of the bank on each run.
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

// == [Helpers]: isPutAllowed, lifeOf, findVaultDoc, findBoxDoc, storeVaultDoc, storeBoxDoc, tombstoneBoxes, listVaultDocs, listBoxDocs, listTallyDocs, VaultDoc, BoxDoc

/** True when a put under `opts` may land over `ante`, the row it would replace. */
const isPutAllowed = (ante: unknown, { prior, ifAbsent, ifPresent }: PutOptsGiven): boolean => (
  DB.isRowAt(ante, prior) && (DB.isLiveRow(ante) ? (ifPresent === 'repl') : (ifAbsent === 'add'))
)

/** The life a record is filed under. */
const lifeOf = ({ applabel, user_id, vaultlabel, vault_tok }: Life): Life => ({ applabel, user_id, vaultlabel, vault_tok })

// `.unique()` throws on a second document: one is inserted only where none was found, in the same
// transaction, so two would be damage, which surfaces rather than being papered over.
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

/** Store `vault` in place of `anteDoc`, or as a new document. */
const storeVaultDoc = async (db: DatabaseWriter, anteDoc: VaultDoc | null, vault: DB.VaultRecord | DB.VaultTombstone): Promise<void> => {
  const { applabel, user_id, vaultlabel } = vault
  if (anteDoc) { await db.replace('safebyok_vaults', anteDoc._id, { applabel, user_id, vaultlabel, vault }) } else { await db.insert('safebyok_vaults', { applabel, user_id, vaultlabel, vault }) }
}

/** Store `boxDoc` in place of `anteDoc`, or as a new document. */
const storeBoxDoc = async (db: DatabaseWriter, anteDoc: BoxDoc | null, boxDoc: BoxDocGiven): Promise<void> => {
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

/** The vault documents of a bank, or of the one vault a scope names. */
const listVaultDocs = async (db: DatabaseReader, { applabel, user_id, vaultlabel }: WatchScope): Promise<VaultDoc[]> => (
  await db.query('safebyok_vaults').withIndex('by_scope', (idx) => {
    const bank = idx.eq('user_id', user_id).eq('applabel', applabel)
    return (vaultlabel === undefined) ? bank : bank.eq('vaultlabel', vaultlabel)
  }).collect()
)

/** The box documents of a bank, or of the one vault a scope names, every life. */
const listBoxDocs = async (db: DatabaseReader, { applabel, user_id, vaultlabel }: WatchScope): Promise<BoxDoc[]> => (
  await db.query('safebyok_boxes').withIndex('by_box', (idx) => {
    const bank = idx.eq('user_id', user_id).eq('applabel', applabel)
    return (vaultlabel === undefined) ? bank : bank.eq('vaultlabel', vaultlabel)
  }).collect()
)

/** The tally documents of a bank. */
const listTallyDocs = async (db: DatabaseReader, { applabel, user_id }: WatchScope): Promise<Doc<'safebyok_tallies'>[]> => (
  await db.query('safebyok_tallies').withIndex('by_life', (idx) => idx.eq('user_id', user_id).eq('applabel', applabel)).collect()
)

/** A vault document, its row unknown until the core's predicates judge it. */
type VaultDoc = Omit<Doc<'safebyok_vaults'>, 'vault'> & { vault: unknown }

/** A box document, its row unknown until the core's predicates judge it. */
type BoxDoc = Omit<Doc<'safebyok_boxes'>, 'box'> & { box: unknown }
// --
