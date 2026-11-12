import * as DB from 'safebyok/storage'
import type { VaultScope, WatchScope } from 'safebyok/storage'
import { ConvexError, v } from 'convex/values'
import type { Value } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { DatabaseReader, DatabaseWriter } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { sentenceKindVals } from '../refusals'
import type { SafebyokErrorData } from '../refusals'
import * as Tallies from './tallies'
import type { BoxDocGiven, Life } from './tallies'
import * as CVX from './validators'

// One function for each of AdapterVaultDB's generic calls. They are called through the host's
// wrapper, which has already checked that the caller is the user the call names. Convex runs a
// mutation as one serializable transaction, so each put and del is atomic. In one mutation, it will:
// * check its ask with the core's checker,
// * read the stored rows,
// * classify the ask with the core's classifier, then
// * store the ask's record if the classifier instructs it to write.
// A get only reads, from one snapshot, and the client classifies what it read.

// == [Gets]: listVaults, getVault, listBoxes, getBox

/** List every vault row of a bank, each with its vaultlabel. */
export const listVaults = query({
  args:    CVX.listVaultsArgs,
  returns: v.array(CVX.rowOfVault),
  handler: async (ctx, { ask }) => {
    const vaultDocs = await listVaultDocs(ctx.db, ask)
    return vaultDocs.map(({ vaultlabel, vault }) => ({ vaultlabel, vault }))
  },
})

/** Get the vault row at the ask's scope, or null. */
export const getVault = query({
  args:    CVX.getVaultArgs,
  returns: v.any(),
  handler: async (ctx, { ask }) => {
    const vaultDoc = await getVaultDoc(ctx.db, ask)
    return vaultDoc?.vault ?? null
  },
})

/** List the box rows of one life of a vault, with the vault row read in the same snapshot. */
export const listBoxes = query({
  args:    CVX.listBoxesArgs,
  returns: CVX.boxesFetched,
  handler: async (ctx, { ask }) => {
    const vaultDoc = await getVaultDoc(ctx.db, ask)
    const boxDocs: BoxDoc[] = await Tallies.lifeBoxQuery(ctx.db, ask).collect()
    return { world: vaultDoc?.vault ?? null, boxes: boxDocs.map(({ boxlabel, box }) => ({ boxlabel, box })) }
  },
})

/** Get one box row (or null) from one life of a vault, with the vault row read in the same snapshot. */
export const getBox = query({
  args:    CVX.getBoxArgs,
  returns: CVX.boxFetched,
  handler: async (ctx, { ask }) => {
    const vaultDoc = await getVaultDoc(ctx.db, ask)
    const boxDoc = await getBoxDoc(ctx.db, ask, ask.boxlabel)
    return { world: vaultDoc?.vault ?? null, box: boxDoc?.box ?? null }
  },
})
// --

// == [Puts]: putVault, putBox

/** Classify a vault put against the stored row, and store its record if the outcome is a write. Returns the classifier's outcome. */
export const putVault = mutation({
  args:    CVX.putVaultArgs,
  returns: CVX.vaultStored,
  handler: async (ctx, { ask: sent }) => {
    const ask = runForClient(() => DB.vaultPut.parse(sent))
    const anteDoc = await getVaultDoc(ctx.db, ask)
    const vault = anteDoc?.vault ?? null
    const stored = runForClient(() => DB.classifyStoredVault(ask, { vault }), vault)
    if (DB.isWriteAct(stored.act)) { await writeVaultDoc(ctx.db, anteDoc, ask, ask.record) }
    return stored
  },
})

// The cap the client sends is a soft cap, as every vaultDB's is. Like the tally's `all_count`, it counts every box row, tombstones
// included. This component currently enforces it and its own limits exactly, inside the mutation: a write that would take the life
// past one is not stored, and the put returns `vault_full` instead. Nothing promises that exactness.
/** Classify a box put against the stored rows and the vault's capacity, and store its record if the outcome is a write.
 * Returns the classifier's outcome, or `vault_full` if the write would pass a limit.
 */
export const putBox = mutation({
  args:    CVX.putBoxArgs,
  returns: CVX.boxStored,
  handler: async (ctx, { ask: sent, maxBoxes = Tallies.MaxVaultBoxes }) => {
    const ask = runForClient(() => DB.boxPut.parse(sent))
    const life = lifeOf(ask)
    const vaultDoc = await getVaultDoc(ctx.db, ask)
    const anteDoc = await getBoxDoc(ctx.db, life, ask.boxlabel)
    const reckoning = await Tallies.reckon(ctx.db, life)
    // Convex accepts NaN as a number. Math.min would return it, and no count is greater than NaN, so the limit would never apply.
    const cap = Number.isNaN(maxBoxes) ? Tallies.MaxVaultBoxes : Math.min(maxBoxes, Tallies.MaxVaultBoxes)
    const capacity = Tallies.capacityOf(reckoning.tally, cap)
    const stored = runForClient(() => DB.classifyStoredBox(ask, { world: vaultDoc?.vault ?? null, box: anteDoc?.box ?? null, capacity }))
    if (! DB.isWriteAct(stored.act)) { return stored }
    const boxDoc = { ...life, boxlabel: ask.boxlabel, box: ask.record }
    // A put over a tombstone replaces that row, so only a new boxlabel adds to `all_count`.
    const growth = Tallies.growthOf(anteDoc, boxDoc)
    if (Tallies.refuses(reckoning.tally, growth, cap)) { return roomlessOf(stored, anteDoc, capacity) }
    await writeBoxDoc(ctx.db, anteDoc, boxDoc)
    await Tallies.record(ctx.db, life, reckoning, growth)
    return stored
  },
})
// --

// == [Dels]: delVault, delBox

/** Classify a vault del against the stored row. If the outcome is a write, store its tombstone and delete the box rows of the life it ends.
 * Returns the classifier's outcome.
 */
export const delVault = mutation({
  args:    CVX.delVaultArgs,
  returns: CVX.vaultStored,
  handler: async (ctx, { ask: sent }) => {
    const ask = runForClient(() => DB.vaultDel.parse(sent))
    const anteDoc = await getVaultDoc(ctx.db, ask)
    const vault = anteDoc?.vault ?? null
    const stored = runForClient(() => DB.classifyStoredVault(ask, { vault }), vault)
    if (DB.isWriteAct(stored.act)) {
      await writeVaultDoc(ctx.db, anteDoc, ask, ask.record)
      // A vault's boxes end with its life: nothing reads a box row of a life that is over.
      await deleteBoxes(ctx.db, lifeOf({ ...ask, vault_tok: ask.expected.vault_tok }))
    }
    return stored
  },
})

/** Classify a box del against the stored rows, and store its tombstone if the outcome is a write. Returns the classifier's outcome. */
export const delBox = mutation({
  args:    CVX.delBoxArgs,
  returns: CVX.boxStored,
  handler: async (ctx, { ask: sent }) => {
    const ask = runForClient(() => DB.boxDel.parse(sent))
    const life = lifeOf(ask)
    const vaultDoc = await getVaultDoc(ctx.db, ask)
    const anteDoc = await getBoxDoc(ctx.db, life, ask.boxlabel)
    const stored = runForClient(() => DB.classifyStoredBox(ask, { world: vaultDoc?.vault ?? null, box: anteDoc?.box ?? null }))
    if (DB.isWriteAct(stored.act)) {
      const boxDoc = { ...life, boxlabel: ask.boxlabel, box: ask.record }
      await writeBoxDoc(ctx.db, anteDoc, boxDoc)
      // The tombstone replaces the row and still counts as one box row: of the `all_*` figures, only the size changes.
      await Tallies.forget(ctx.db, life, Tallies.growthOf(anteDoc, boxDoc))
    }
    return stored
  },
})
// --

// == [Upkeep]: tidyGone, watchRows

/** Delete the box rows and tallies of every ended life in a bank. Returns how many box rows remain. */
export const tidyGone = mutation({
  args:    CVX.tidyGoneArgs,
  returns: CVX.tidied,
  handler: async (ctx, { ask }) => {
    const vaultDocs = await listVaultDocs(ctx.db, ask)
    const vaultsBylabel = new Map(vaultDocs.map(({ vaultlabel, vault }) => [vaultlabel, vault]))
    function isOver({ vaultlabel, vault_tok }: Life) { return DB.isLifeOver(vaultsBylabel.get(vaultlabel) ?? null, vault_tok) }
    const boxDocs = await listBoxDocs(ctx.db, ask)
    const tallyDocs = await listTallyDocs(ctx.db, ask)
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

// == [Asks and refusals]: runForClient, crossingOf, roomlessOf

// Anyone signed in may call these functions with an ask of their own making, so each mutation parses its ask again here,
// with the core's own checker, before a row is read, and continues with what the parse returns.

/** Return what `step` returns, rethrowing a refusal the client must see as a ConvexError.
 * `world` is the stored vault row, sent along with a `gate_issue`.
 */
function runForClient<ValT>(step: () => ValT, world: unknown = null): ValT {
  try {
    return step()
  } catch (err) {
    throw crossingOf(err, world)
  }
}

// A ConvexError's `data` reaches the client whole, on any deployment, where another error's text is withheld or may quote
// the call's arguments. The message is the core's own sentence, which quotes no value (notes/guarantees.md, G8). A
// `gate_issue` carries the stored vault row it checked, as the core's refusal does. The caller may read that row with `getVault`.
/** `thrown` wrapped in a ConvexError if it is a refusal the client must see, else `thrown` unchanged. */
function crossingOf(thrown: unknown, world: unknown): unknown {
  if (! DB.isVaultError(thrown)) { return thrown }
  const { refusalkind: kind, message } = thrown
  // The row came out of the table, so it is a Convex value.
  if (kind === 'gate_issue') { return new ConvexError<SafebyokErrorData>({ kind, message, world: world as Value }) }
  const sentenceKind = sentenceKindVals.find((crossed) => crossed === kind)
  return (sentenceKind === undefined) ? thrown : new ConvexError<SafebyokErrorData>({ kind: sentenceKind, message })
}

/** The `vault_full` refusal, with the stored box row, for a box put classified as a write that the life has no room for. */
function roomlessOf(stored: DB.BoxStored, anteDoc: BoxDoc | null, capacity: DB.Capacity): DB.BoxStored {
  const box = DB.storedBoxRowOrNull.parse(anteDoc?.box ?? null)
  return { ok: false, act: 'vault_full', world: stored.world, box, presence: stored.presence, capacity }
}
// --

// == [Helpers]: lifeOf, getVaultDoc, getBoxDoc, writeVaultDoc, writeBoxDoc, deleteBoxes, listVaultDocs, listBoxDocs, listTallyDocs, VaultDoc, BoxDoc

/** Return the life an ask or a record belongs to: its vault's scope and `vault_tok`. */
function lifeOf({ user_id, banklabel, vaultlabel, vault_tok }: Life): Life { return { user_id, banklabel, vaultlabel, vault_tok } }

// `.unique()` throws if it finds two documents. A document is inserted only when none was found in
// the same transaction, so two would mean damage, and that should fail loudly.
async function getVaultDoc(db: DatabaseReader, { user_id, banklabel, vaultlabel }: VaultScope): Promise<VaultDoc | null> {
  return await db.query('safebyok_vaults')
    .withIndex('by_scope', (idx) => idx.eq('user_id', user_id).eq('banklabel', banklabel).eq('vaultlabel', vaultlabel))
    .unique()
}

async function getBoxDoc(db: DatabaseReader, { user_id, banklabel, vaultlabel, vault_tok }: Life, boxlabel: string): Promise<BoxDoc | null> {
  return await db.query('safebyok_boxes')
    .withIndex('by_box', (idx) => idx.eq('user_id', user_id).eq('banklabel', banklabel).eq('vaultlabel', vaultlabel).eq('vault_tok', vault_tok).eq('boxlabel', boxlabel))
    .unique()
}

/** Write `vault` at `scope`, in place of `anteDoc`, or as a new document. */
async function writeVaultDoc(db: DatabaseWriter, anteDoc: VaultDoc | null, { user_id, banklabel, vaultlabel }: VaultScope, vault: DB.VaultRecord | DB.VaultTombstone): Promise<void> {
  if (anteDoc) { await db.replace('safebyok_vaults', anteDoc._id, { user_id, banklabel, vaultlabel, vault }) } else { await db.insert('safebyok_vaults', { user_id, banklabel, vaultlabel, vault }) }
}

/** Write `boxDoc` in place of `anteDoc`, or as a new document. */
async function writeBoxDoc(db: DatabaseWriter, anteDoc: BoxDoc | null, boxDoc: BoxDocGiven): Promise<void> {
  if (anteDoc) { await db.replace('safebyok_boxes', anteDoc._id, boxDoc) } else { await db.insert('safebyok_boxes', boxDoc) }
}

/** Delete every box row of `life`, and its tally. */
async function deleteBoxes(db: DatabaseWriter, life: Life): Promise<void> {
  const boxDocs: BoxDoc[] = await Tallies.lifeBoxQuery(db, life).collect()
  await Promise.all(boxDocs.map(({ _id }) => db.delete('safebyok_boxes', _id)))
  await Tallies.drop(db, life)
}

/** List the vault documents of a bank, or of one vault when the scope has a `vaultlabel`. */
async function listVaultDocs(db: DatabaseReader, { user_id, banklabel, vaultlabel }: WatchScope): Promise<VaultDoc[]> {
  return await db.query('safebyok_vaults').withIndex('by_scope', (idx) => {
    const bank = idx.eq('user_id', user_id).eq('banklabel', banklabel)
    return (vaultlabel === undefined) ? bank : bank.eq('vaultlabel', vaultlabel)
  }).collect()
}

/** List the box documents of a bank, or of one vault when the scope has a `vaultlabel`, across every life. */
async function listBoxDocs(db: DatabaseReader, { user_id, banklabel, vaultlabel }: WatchScope): Promise<BoxDoc[]> {
  return await db.query('safebyok_boxes').withIndex('by_box', (idx) => {
    const bank = idx.eq('user_id', user_id).eq('banklabel', banklabel)
    return (vaultlabel === undefined) ? bank : bank.eq('vaultlabel', vaultlabel)
  }).collect()
}

/** List the tally documents of a bank. */
async function listTallyDocs(db: DatabaseReader, { user_id, banklabel }: WatchScope): Promise<Doc<'safebyok_tallies'>[]> {
  return await db.query('safebyok_tallies').withIndex('by_life', (idx) => idx.eq('user_id', user_id).eq('banklabel', banklabel)).collect()
}

/** A vault document. Its `vault` row is `unknown` until the core has checked it. */
type VaultDoc = Omit<Doc<'safebyok_vaults'>, 'vault'> & { vault: unknown }

/** A box document. Its `box` row is `unknown` until the core has checked it. */
type BoxDoc = Omit<Doc<'safebyok_boxes'>, 'box'> & { box: unknown }
// --
