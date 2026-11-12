import * as DB from 'safebyok/storage'
import { BX } from 'safebyok/storage'
import type { BankScope, VaultScope, WatchScope } from 'safebyok/storage'
import { ConvexError, getDocumentSize } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { DatabaseReader, DatabaseWriter } from './_generated/server'
import type { Doc, TableNames } from './_generated/dataModel'
import { sentenceKindVals } from '../refusals'
import type { SafebyokErrorData } from '../refusals'
import * as Tallies from './tallies'
import type { BoxDocGiven, Budget, Life } from './tallies'
import * as CVX from './validators'

// One function for each of AdapterBankDB's generic calls. They are called through the host's wrapper, which has already
// checked that the caller is the user the call names. Convex runs a mutation as one serializable transaction, so each write
// is atomic. In one mutation, it will:
// * check its ask with the core's checker,
// * fetch the row asked for and the row above it,
// * classify the ask with the core's classifier, then
// * store the ask's record if the classifier instructs it to write.
// It returns the rows it fetched, as they stood before any write, and whether it wrote. The client classifies those rows with
// the same classifier, so it reaches the same act, outcome or refusal, and checks that the act agrees with what was written.
// A get only reads, from one snapshot, and returns its rows for the client to classify.

// == [Bank verbs]: ensureBank, buildBank, putGate, delBank

/** Fetch the bank row, its `main` gate row and every vault row of the bank, in one snapshot. */
export const ensureBank = query({
  args:    CVX.askArgs,
  returns: CVX.bankEnsureFetched,
  handler: async (ctx, { ask: sent }) => {
    const ask = askFor(() => BX.bankEnsure.parse(sent))
    const bankDoc = await getBankDoc(ctx.db, ask)
    const gateDoc = await getGateDoc(ctx.db, ask, 'main')
    const vaultDocs = await listVaultDocs(ctx.db, ask)
    return { bank: bankDoc?.bank ?? null, gate: gateDoc?.gate ?? null, vaults: vaultDocs.map(({ vaultlabel, vault }) => ({ vaultlabel, vault })) }
  },
})

/** Classify a `buildBank` ask against the bank row and its `main` gate row, and store its bank and gate records if the act is a write. */
export const buildBank = mutation({
  args:    CVX.askArgs,
  returns: CVX.gateWritten,
  handler: async (ctx, { ask: sent }) => {
    const ask = askFor(() => BX.bankBuild.parse(sent))
    const bankDoc = await getBankDoc(ctx.db, ask)
    const gateDoc = await getGateDoc(ctx.db, ask, 'main')
    const fetched = { bank: bankDoc?.bank ?? null, gate: gateDoc?.gate ?? null }
    const wrote = isWrite(storedOrNull(() => BX.classifyBuildBank(ask, fetched)))
    if (wrote) {
      await writeBankDoc(ctx.db, bankDoc, ask, ask.record)
      await writeGateDoc(ctx.db, gateDoc, ask.gate)
    }
    return { ...fetched, wrote }
  },
})

// The classifier runs each gate verb's policy, so the policy runs here, on the gate row this mutation fetched.
/** Classify a gate verb's ask against the bank row and the gate row, under the verb's policy, and store its gate record if the act is a write. */
export const putGate = mutation({
  args:    CVX.askArgs,
  returns: CVX.gateWritten,
  handler: async (ctx, { ask: sent }) => {
    const ask = askFor(() => BX.gatePut.parse(sent))
    const bankDoc = await getBankDoc(ctx.db, ask)
    const gateDoc = await getGateDoc(ctx.db, ask, ask.gatelabel)
    const fetched = { bank: bankDoc?.bank ?? null, gate: gateDoc?.gate ?? null }
    const wrote = isWrite(storedOrNull(() => BX.classifyStoredGate(ask, fetched)))
    if (wrote) { await writeGateDoc(ctx.db, gateDoc, ask.record) }
    return { ...fetched, wrote }
  },
})

// One transaction may read 16 MiB and write 16,000 documents, and a bank holds any number of vaults, each up to the limits in
// `tallies.ts`. So the tombstone is written first, and the rows under the bank are deleted while the cascade's budget lasts.
// The rows left are of the life the tombstone ended: a gate or vault row under another `bank_tok` than its bank row's reads as
// no row, and a box row is found only by its own life's tokens. `tidyGone` deletes them.
/** Classify a `delBank` ask against the bank row. If the act is a write, store its tombstone and delete the rows under the bank, as many as one transaction allows. */
export const delBank = mutation({
  args:    CVX.askArgs,
  returns: CVX.bankWritten,
  handler: async (ctx, { ask: sent }) => {
    const ask = askFor(() => BX.bankDel.parse(sent))
    const bankDoc = await getBankDoc(ctx.db, ask)
    const fetched = { bank: bankDoc?.bank ?? null }
    const wrote = isWrite(storedOrNull(() => BX.classifyDelBank(ask, fetched)))
    if (wrote) {
      await writeBankDoc(ctx.db, bankDoc, ask, ask.record)
      await deleteBank(ctx.db, ask)
    }
    return { ...fetched, wrote }
  },
})
// --

// == [Vault verbs]: getVault, putVault, delVault

/** Fetch the bank row and the vault row at the ask's scope, in one snapshot. */
export const getVault = query({
  args:    CVX.askArgs,
  returns: CVX.vaultFetched,
  handler: async (ctx, { ask: sent }) => {
    const ask = askFor(() => BX.vaultGet.parse(sent))
    const bankDoc = await getBankDoc(ctx.db, ask)
    const vaultDoc = await getVaultDoc(ctx.db, ask)
    return { bank: bankDoc?.bank ?? null, vault: vaultDoc?.vault ?? null }
  },
})

/** Classify a vault put against the bank row and the vault row, and store its record if the act is a write. */
export const putVault = mutation({
  args:    CVX.askArgs,
  returns: CVX.vaultWritten,
  handler: async (ctx, { ask: sent }) => {
    const ask = askFor(() => BX.vaultPut.parse(sent))
    const bankDoc = await getBankDoc(ctx.db, ask)
    const vaultDoc = await getVaultDoc(ctx.db, ask)
    const fetched = { bank: bankDoc?.bank ?? null, vault: vaultDoc?.vault ?? null }
    const wrote = isWrite(storedOrNull(() => BX.classifyStoredVault(ask, fetched)))
    if (wrote) { await writeVaultDoc(ctx.db, vaultDoc, ask, ask.record) }
    return { ...fetched, wrote }
  },
})

/** Classify a vault del against the bank row and the vault row. If the act is a write, store its tombstone and delete the box rows of the life it ends. */
export const delVault = mutation({
  args:    CVX.askArgs,
  returns: CVX.vaultWritten,
  handler: async (ctx, { ask: sent }) => {
    const ask = askFor(() => BX.vaultDel.parse(sent))
    const bankDoc = await getBankDoc(ctx.db, ask)
    const vaultDoc = await getVaultDoc(ctx.db, ask)
    const fetched = { bank: bankDoc?.bank ?? null, vault: vaultDoc?.vault ?? null }
    const wrote = isWrite(storedOrNull(() => BX.classifyStoredVault(ask, fetched)))
    if (wrote) {
      await writeVaultDoc(ctx.db, vaultDoc, ask, ask.record)
      // A vault's boxes end with its life, and the component's limits keep a life small enough to delete in this transaction.
      await deleteBoxes(ctx.db, lifeOf({ ...ask, vault_tok: ask.expected.vault_tok }))
    }
    return { ...fetched, wrote }
  },
})
// --

// == [Box verbs]: listBoxes, getBox, putBox, delBox
// A box ask fetches its vault row, never the bank row: the vault row's `bank_tok` stands for its bank's life.

/** Fetch the box rows of one life of a vault, with the vault row read in the same snapshot. */
export const listBoxes = query({
  args:    CVX.askArgs,
  returns: CVX.boxesFetched,
  handler: async (ctx, { ask: sent }) => {
    const ask = askFor(() => BX.boxList.parse(sent))
    const vaultDoc = await getVaultDoc(ctx.db, ask)
    const boxDocs: BoxDoc[] = await Tallies.lifeBoxQuery(ctx.db, ask).collect()
    return { parent: vaultDoc?.vault ?? null, boxes: boxDocs.map(({ boxlabel, box }) => ({ boxlabel, box })) }
  },
})

/** Fetch one box row (or null) from one life of a vault, with the vault row read in the same snapshot. */
export const getBox = query({
  args:    CVX.askArgs,
  returns: CVX.boxFetched,
  handler: async (ctx, { ask: sent }) => {
    const ask = askFor(() => BX.boxGet.parse(sent))
    const vaultDoc = await getVaultDoc(ctx.db, ask)
    const boxDoc = await getBoxDoc(ctx.db, ask, ask.boxlabel)
    return { parent: vaultDoc?.vault ?? null, box: boxDoc?.box ?? null }
  },
})

// The cap the client sends is a soft cap, as every bankDB's is. Like the tally's `all_count`, it counts every box row, tombstones
// included. This component currently enforces it and its own limits exactly, inside the mutation: a write that would take the life
// past one is not stored, and the put answers `roomless` instead. Nothing promises that exactness.
/** Classify a box put against the vault row, the box row and the life's capacity, and store its record if the act is a write.
 * Answers `roomless`, storing nothing, when the write would take the life past a limit.
 */
export const putBox = mutation({
  args:    CVX.putBoxArgs,
  returns: CVX.boxPutWritten,
  handler: async (ctx, { ask: sent, maxBoxes = Tallies.MaxVaultBoxes }) => {
    const ask = askFor(() => BX.boxPut.parse(sent))
    const life = lifeOf(ask)
    const vaultDoc = await getVaultDoc(ctx.db, ask)
    const anteDoc = await getBoxDoc(ctx.db, life, ask.boxlabel)
    const reckoning = await Tallies.reckon(ctx.db, life)
    // Convex accepts NaN as a number. Math.min would return it, and no count is greater than NaN, so the limit would never apply.
    const cap = Number.isNaN(maxBoxes) ? Tallies.MaxVaultBoxes : Math.min(maxBoxes, Tallies.MaxVaultBoxes)
    const fetched = { parent: vaultDoc?.vault ?? null, box: anteDoc?.box ?? null, capacity: Tallies.capacityOf(reckoning.tally, cap) }
    if (! isWrite(storedOrNull(() => BX.classifyStoredBox(ask, fetched)))) { return { ...fetched, wrote: false, roomless: false } }
    const boxDoc = { ...life, boxlabel: ask.boxlabel, box: ask.record }
    // A put over a tombstone replaces that row, so only a new boxlabel adds to `all_count`.
    const growth = Tallies.growthOf(anteDoc, boxDoc)
    if (Tallies.wouldPassLimit(reckoning.tally, growth, cap)) { return { ...fetched, wrote: false, roomless: true } }
    await writeBoxDoc(ctx.db, anteDoc, boxDoc)
    await Tallies.record(ctx.db, life, reckoning, growth)
    return { ...fetched, wrote: true, roomless: false }
  },
})

/** Classify a box del against the vault row and the box row, and store its tombstone if the act is a write. */
export const delBox = mutation({
  args:    CVX.askArgs,
  returns: CVX.boxWritten,
  handler: async (ctx, { ask: sent }) => {
    const ask = askFor(() => BX.boxDel.parse(sent))
    const life = lifeOf(ask)
    const vaultDoc = await getVaultDoc(ctx.db, ask)
    const anteDoc = await getBoxDoc(ctx.db, life, ask.boxlabel)
    const fetched = { parent: vaultDoc?.vault ?? null, box: anteDoc?.box ?? null }
    const wrote = isWrite(storedOrNull(() => BX.classifyStoredBox(ask, fetched)))
    if (wrote) {
      const boxDoc = { ...life, boxlabel: ask.boxlabel, box: ask.record }
      await writeBoxDoc(ctx.db, anteDoc, boxDoc)
      // The tombstone replaces the row and still counts as one box row: of the `all_*` figures, only the size changes.
      await Tallies.forget(ctx.db, life, Tallies.growthOf(anteDoc, boxDoc))
    }
    return { ...fetched, wrote }
  },
})
// --

// == [Upkeep]: tidyGone, watchRows

// A vault row is of an ended life when its `bank_tok` is not the live bank row's, and a box row or a tally when its life pair is
// not that of a live vault row. Like `delBank`, it deletes while the cascade's budget lasts, and reaches the box rows of ended
// lives through the index alone, never reading one of a live life: a host calls it again to delete the rest. A vault row that
// fails its checks is left alone, with every box row and tally under its vaultlabel, and those box rows go uncounted.
/** Delete the vault and box rows and the tallies of every ended life in a bank, as many as one transaction allows. Returns how many box rows its live vaults hold. */
export const tidyGone = mutation({
  args:    CVX.askArgs,
  returns: CVX.tidied,
  handler: async (ctx, { ask: sent }) => {
    const ask = askFor(() => DB.boxTidy.parse(sent))
    const budget = Tallies.cascadeBudget()
    const bankDoc = await getBankDoc(ctx.db, ask)
    const bank_tok = liveBankTokOf(bankDoc?.bank ?? null)
    const vaultDocs = await listVaultDocs(ctx.db, ask)
    const lives: Life[] = []
    const damagedlabels: string[] = []
    const endedVaultDocs: VaultDoc[] = []
    for (const vaultDoc of vaultDocs) {
      const { vaultlabel } = vaultDoc
      const vault = BX.vaultRow.safeParse(vaultDoc.vault)
      if (! vault.success) {
        damagedlabels.push(vaultlabel)
      } else if (vault.data.bank_tok !== bank_tok) {
        endedVaultDocs.push(vaultDoc)
      } else if (vault.data.am === 'a') {
        lives.push(lifeOf({ ...ask, vaultlabel, bank_tok: vault.data.bank_tok, vault_tok: vault.data.vault_tok }))
      }
    }
    await deleteWithin(ctx.db, 'safebyok_vaults', endedVaultDocs, budget)
    const endedBoxQueryList = endedBoxQueries(ctx.db, ask, damagedlabels, lives)
    for (const endedBoxes of endedBoxQueryList) { await deleteWithin(ctx.db, 'safebyok_boxes', endedBoxes, budget) }
    const liveCkeys = new Set(lives.map((life) => ckeyOfLife(life)))
    const tallyDocs = await listTallyDocs(ctx.db, ask)
    const endedTallyDocs = tallyDocs.filter((tallyDoc) => (! damagedlabels.includes(tallyDoc.vaultlabel)) && (! liveCkeys.has(ckeyOfLife(tallyDoc))))
    await deleteWithin(ctx.db, 'safebyok_tallies', endedTallyDocs, budget)
    let totalCount = 0
    for (const life of lives) { totalCount += await Tallies.countBoxes(ctx.db, life) }
    return { totalCount }
  },
})

// A Convex query reads whole documents, so a bank-wide watch reads every box row of the bank's live vaults each time it runs.
/** List the bank row, every gate and vault row in `scope`, and the box rows of each live vault, for a client to subscribe to. */
export const watchRows = query({
  args:    CVX.watchRowsArgs,
  returns: CVX.rowsWatched,
  handler: async (ctx, { scope: sent }) => {
    const scope = askFor(() => DB.watchScope.parse(sent))
    const bankDoc = await getBankDoc(ctx.db, scope)
    const bank_tok = liveBankTokOf(bankDoc?.bank ?? null)
    const gateDocs = (scope.vaultlabel === undefined) ? await listGateDocs(ctx.db, scope) : []
    const vaultDocs = await listVaultDocs(ctx.db, scope)
    const boxes: { vaultlabel: string, boxlabel: string, box: unknown }[] = []
    for (const { vaultlabel, vault } of vaultDocs) {
      const live = BX.vaultRecord.safeParse(vault)
      if ((! live.success) || (live.data.bank_tok !== bank_tok)) { continue }
      const boxDocs: BoxDoc[] = await Tallies.lifeBoxQuery(ctx.db, lifeOf({ ...scope, vaultlabel, bank_tok: live.data.bank_tok, vault_tok: live.data.vault_tok })).collect()
      boxes.push(...boxDocs.map(({ boxlabel, box }) => ({ vaultlabel, boxlabel, box })))
    }
    return {
      bank:   bankDoc?.bank ?? null,
      gates:  gateDocs.map(({ gatelabel, gate }) => ({ gatelabel, gate })),
      vaults: vaultDocs.map(({ vaultlabel, vault }) => ({ vaultlabel, vault })),
      boxes,
    }
  },
})
// --

// == [Asks and refusals]: askFor, crossingOf, storedOrNull, isWrite

// Anyone signed in may call these functions with an ask of their own making, so each parses its ask again here, with the core's
// own checker, before a row is read, and continues with what the parse returns.
/** Return what `parse` returns, rethrowing a refusal of the ask as a ConvexError the client sees. */
function askFor<AskT>(parse: () => AskT): AskT {
  try {
    return parse()
  } catch (err) {
    throw crossingOf(err)
  }
}

// A ConvexError's `data` reaches the client whole, on any deployment, where another error's text is withheld or may quote the
// call's arguments. The message is the core's own sentence, which quotes no value (notes/guarantees.md, G8).
/** `thrown` wrapped in a ConvexError if it is a refusal the client must see, else `thrown` unchanged. */
function crossingOf(thrown: unknown): unknown {
  if (! DB.isVaultError(thrown)) { return thrown }
  const { refusalkind: kind, message } = thrown
  const sentenceKind = sentenceKindVals.find((crossed) => crossed === kind)
  return (sentenceKind === undefined) ? thrown : new ConvexError<SafebyokErrorData>({ kind: sentenceKind, message })
}

// The client classifies the same rows with the same classifier, and throws the refusal itself, with its rows.
/** What `classify` returns, or null if it refuses. */
function storedOrNull<StoredT>(classify: () => StoredT): StoredT | null {
  try {
    return classify()
  } catch (err) {
    if (DB.isVaultError(err)) { return null }
    throw err
  }
}

/** True when `stored` is the classifier's outcome and its act is a write. */
function isWrite(stored: { act: DB.BoxAct | DB.VaultAct | DB.ParentBankAct } | null): boolean { return (stored !== null) && BX.isWriteAct(stored.act) }
// --

// == [Cascades]: deleteBank, deleteBoxes, deleteWithin, endedBoxQueries

/** Delete the gate, vault and box rows and the tallies under the bank at `scope`, while the cascade's budget lasts. */
async function deleteBank(db: DatabaseWriter, scope: BankScope): Promise<void> {
  const budget = Tallies.cascadeBudget()
  await deleteWithin(db, 'safebyok_gates', listGateDocsQuery(db, scope), budget)
  await deleteWithin(db, 'safebyok_vaults', listVaultDocsQuery(db, scope), budget)
  await deleteWithin(db, 'safebyok_tallies', listTallyDocsQuery(db, scope), budget)
  await deleteWithin(db, 'safebyok_boxes', listBoxDocsQuery(db, scope), budget)
}

/** Delete every box row of `life`, and its tally. */
async function deleteBoxes(db: DatabaseWriter, life: Life): Promise<void> {
  const boxDocs: BoxDoc[] = await Tallies.lifeBoxQuery(db, life).collect()
  await Promise.all(boxDocs.map(({ _id }) => db.delete('safebyok_boxes', _id)))
  await Tallies.drop(db, life)
}

/** Delete each document of `table` that `docs` yields, while `budget` lasts. */
async function deleteWithin<TableT extends TableNames>(db: DatabaseWriter, table: TableT, docs: AsyncIterable<Doc<TableT>> | Iterable<Doc<TableT>>, budget: Budget): Promise<void> {
  for await (const doc of docs) {
    if (Tallies.isSpent(budget)) { return }
    Tallies.spend(budget, getDocumentSize(doc))
    await db.delete(table, doc._id)
  }
}

// The box index runs vaultlabel, bank_tok, vault_tok, boxlabel. A box row of an ended life lies under a vaultlabel with no live
// vault row, or beside the one live life of its vaultlabel: under another bank_tok, or under its bank_tok and another vault_tok.
// Each range excludes its bounds, so no query reads a box row of a live life, or one under a vaultlabel in `sparedlabels`.
/** Queries for the bank's box rows that belong to no life in `lives` and lie under no vaultlabel in `sparedlabels`. */
function endedBoxQueries(db: DatabaseReader, { user_id, banklabel }: BankScope, sparedlabels: readonly string[], lives: readonly Life[]) {
  // The index orders strings by code unit, as `<` does, and a label is ASCII.
  const bounds = [...new Set([...sparedlabels, ...lives.map(({ vaultlabel }) => vaultlabel)])].toSorted(byCodeUnits)
  const begs = [undefined, ...bounds]
  const ends = [...bounds, undefined]
  const between = begs.map((beg, ii) => {
    const end = ends[ii]
    return db.query('safebyok_boxes').withIndex('by_box', (idx) => {
      const bank = idx.eq('user_id', user_id).eq('banklabel', banklabel)
      if (beg === undefined) { return (end === undefined) ? bank : bank.lt('vaultlabel', end) }
      return (end === undefined) ? bank.gt('vaultlabel', beg) : bank.gt('vaultlabel', beg).lt('vaultlabel', end)
    })
  })
  const beside = lives.flatMap(({ vaultlabel, bank_tok, vault_tok }) => [
    db.query('safebyok_boxes').withIndex('by_box', (idx) => idx.eq('user_id', user_id).eq('banklabel', banklabel).eq('vaultlabel', vaultlabel).lt('bank_tok', bank_tok)),
    db.query('safebyok_boxes').withIndex('by_box', (idx) => idx.eq('user_id', user_id).eq('banklabel', banklabel).eq('vaultlabel', vaultlabel).gt('bank_tok', bank_tok)),
    db.query('safebyok_boxes').withIndex('by_box', (idx) => idx.eq('user_id', user_id).eq('banklabel', banklabel).eq('vaultlabel', vaultlabel).eq('bank_tok', bank_tok).lt('vault_tok', vault_tok)),
    db.query('safebyok_boxes').withIndex('by_box', (idx) => idx.eq('user_id', user_id).eq('banklabel', banklabel).eq('vaultlabel', vaultlabel).eq('bank_tok', bank_tok).gt('vault_tok', vault_tok)),
  ])
  return [...between, ...beside]
}
// --

// == [Helpers]: byCodeUnits, lifeOf, ckeyOfLife, liveBankTokOf, getBankDoc, getGateDoc, getVaultDoc, getBoxDoc, writeBankDoc, writeGateDoc, writeVaultDoc, writeBoxDoc, the list queries, BankDoc, GateDoc, VaultDoc, BoxDoc

/** Order two strings as an index does, by code unit. */
function byCodeUnits(aa: string, bb: string): number {
  if (aa === bb) { return 0 }
  return (aa < bb) ? -1 : 1
}

/** The {@link Life} of an ask or a record, without its other fields. */
function lifeOf({ user_id, banklabel, vaultlabel, bank_tok, vault_tok }: Life): Life { return { user_id, banklabel, vaultlabel, bank_tok, vault_tok } }

/** A map key for `life`, among the lives of one bank. */
function ckeyOfLife({ vaultlabel, bank_tok, vault_tok }: Life): string { return DB.ckeyOf(vaultlabel, bank_tok, vault_tok) }

/** The `bank_tok` of `bankRaw` when it is a live bank row, else null. */
function liveBankTokOf(bankRaw: unknown): string | null {
  const bank = BX.bankRecord.safeParse(bankRaw)
  return bank.success ? bank.data.bank_tok : null
}

// `.unique()` throws if it finds two documents. A document is inserted only when none was found in
// the same transaction, so two would mean damage, and that should fail loudly.
async function getBankDoc(db: DatabaseReader, { user_id, banklabel }: BankScope): Promise<BankDoc | null> {
  return await db.query('safebyok_banks').withIndex('by_scope', (idx) => idx.eq('user_id', user_id).eq('banklabel', banklabel)).unique()
}

async function getGateDoc(db: DatabaseReader, { user_id, banklabel }: BankScope, gatelabel: string): Promise<GateDoc | null> {
  return await db.query('safebyok_gates').withIndex('by_scope', (idx) => idx.eq('user_id', user_id).eq('banklabel', banklabel).eq('gatelabel', gatelabel)).unique()
}

async function getVaultDoc(db: DatabaseReader, { user_id, banklabel, vaultlabel }: VaultScope): Promise<VaultDoc | null> {
  return await db.query('safebyok_vaults')
    .withIndex('by_scope', (idx) => idx.eq('user_id', user_id).eq('banklabel', banklabel).eq('vaultlabel', vaultlabel))
    .unique()
}

async function getBoxDoc(db: DatabaseReader, { user_id, banklabel, vaultlabel, bank_tok, vault_tok }: Life, boxlabel: string): Promise<BoxDoc | null> {
  return await db.query('safebyok_boxes')
    .withIndex('by_box', (idx) => idx.eq('user_id', user_id).eq('banklabel', banklabel).eq('vaultlabel', vaultlabel).eq('bank_tok', bank_tok).eq('vault_tok', vault_tok).eq('boxlabel', boxlabel))
    .unique()
}

/** Write `bank` at `scope`, in place of `anteDoc`, or as a new document. */
async function writeBankDoc(db: DatabaseWriter, anteDoc: BankDoc | null, { user_id, banklabel }: BankScope, bank: BX.BankRow): Promise<void> {
  if (anteDoc) { await db.replace('safebyok_banks', anteDoc._id, { user_id, banklabel, bank }) } else { await db.insert('safebyok_banks', { user_id, banklabel, bank }) }
}

/** Write `gate` at its own scope, in place of `anteDoc`, or as a new document. */
async function writeGateDoc(db: DatabaseWriter, anteDoc: GateDoc | null, gate: BX.GateRecord): Promise<void> {
  const { user_id, banklabel, gatelabel } = gate
  if (anteDoc) { await db.replace('safebyok_gates', anteDoc._id, { user_id, banklabel, gatelabel, gate }) } else { await db.insert('safebyok_gates', { user_id, banklabel, gatelabel, gate }) }
}

/** Write `vault` at `scope`, in place of `anteDoc`, or as a new document. */
async function writeVaultDoc(db: DatabaseWriter, anteDoc: VaultDoc | null, { user_id, banklabel, vaultlabel }: VaultScope, vault: BX.VaultRow): Promise<void> {
  if (anteDoc) { await db.replace('safebyok_vaults', anteDoc._id, { user_id, banklabel, vaultlabel, vault }) } else { await db.insert('safebyok_vaults', { user_id, banklabel, vaultlabel, vault }) }
}

/** Write `boxDoc` in place of `anteDoc`, or as a new document. */
async function writeBoxDoc(db: DatabaseWriter, anteDoc: BoxDoc | null, boxDoc: BoxDocGiven): Promise<void> {
  if (anteDoc) { await db.replace('safebyok_boxes', anteDoc._id, boxDoc) } else { await db.insert('safebyok_boxes', boxDoc) }
}

/** Query the gate documents of a bank. */
function listGateDocsQuery(db: DatabaseReader, { user_id, banklabel }: BankScope) {
  return db.query('safebyok_gates').withIndex('by_scope', (idx) => idx.eq('user_id', user_id).eq('banklabel', banklabel))
}

/** List the gate documents of a bank. */
async function listGateDocs(db: DatabaseReader, scope: BankScope): Promise<GateDoc[]> { return await listGateDocsQuery(db, scope).collect() }

/** Query the vault documents of a bank, or of one vault when the scope has a `vaultlabel`. */
function listVaultDocsQuery(db: DatabaseReader, { user_id, banklabel, vaultlabel }: WatchScope) {
  return db.query('safebyok_vaults').withIndex('by_scope', (idx) => {
    const bank = idx.eq('user_id', user_id).eq('banklabel', banklabel)
    return (vaultlabel === undefined) ? bank : bank.eq('vaultlabel', vaultlabel)
  })
}

/** List the vault documents of a bank, or of one vault when the scope has a `vaultlabel`. */
async function listVaultDocs(db: DatabaseReader, scope: WatchScope): Promise<VaultDoc[]> { return await listVaultDocsQuery(db, scope).collect() }

/** Query the box documents of a bank, across every life. */
function listBoxDocsQuery(db: DatabaseReader, { user_id, banklabel }: BankScope) {
  return db.query('safebyok_boxes').withIndex('by_box', (idx) => idx.eq('user_id', user_id).eq('banklabel', banklabel))
}

/** Query the tally documents of a bank. */
function listTallyDocsQuery(db: DatabaseReader, { user_id, banklabel }: BankScope) {
  return db.query('safebyok_tallies').withIndex('by_life', (idx) => idx.eq('user_id', user_id).eq('banklabel', banklabel))
}

/** List the tally documents of a bank. */
async function listTallyDocs(db: DatabaseReader, scope: BankScope): Promise<Doc<'safebyok_tallies'>[]> { return await listTallyDocsQuery(db, scope).collect() }

/** A bank document. Its `bank` row is `unknown` until the core has checked it. */
type BankDoc = Omit<Doc<'safebyok_banks'>, 'bank'> & { bank: unknown }

/** A gate document. Its `gate` row is `unknown` until the core has checked it. */
type GateDoc = Omit<Doc<'safebyok_gates'>, 'gate'> & { gate: unknown }

/** A vault document. Its `vault` row is `unknown` until the core has checked it. */
type VaultDoc = Omit<Doc<'safebyok_vaults'>, 'vault'> & { vault: unknown }

/** A box document. Its `box` row is `unknown` until the core has checked it. */
type BoxDoc = Omit<Doc<'safebyok_boxes'>, 'box'> & { box: unknown }
// --
