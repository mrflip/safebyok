import * as DB from 'safebyok-big/storage'
import { BX } from 'safebyok-big/storage'
import type { BankScope, VaultScope, WatchScope } from 'safebyok-big/storage'
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
// * store the ask's record if the classifier instructs it to write, and read back the row stored.
// It returns the rows it fetched, as they stood before any write, and as `written` the rows read back, or null if it wrote
// nothing. The client classifies the fetched rows with the same classifier, so it reaches the same act, outcome or refusal,
// checks that the act agrees with whether anything was written, and answers the rows read back.
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
  returns: CVX.bankBuilt,
  handler: async (ctx, { ask: sent }) => {
    const ask = askFor(() => BX.bankBuild.parse(sent))
    const bankDoc = await getBankDoc(ctx.db, ask)
    const gateDoc = await getGateDoc(ctx.db, ask, 'main')
    const fetched = { bank: bankDoc?.bank ?? null, gate: gateDoc?.gate ?? null }
    if (! isWrite(storedOrNull(() => BX.classifyBuildBank(ask, fetched)))) { return { ...fetched, written: null } }
    const bank = await writeBankDoc(ctx.db, bankDoc, ask, ask.record)
    const gate = await writeGateDoc(ctx.db, gateDoc, ask.gate)
    return { ...fetched, written: { bank, gate } }
  },
})

/** Classify a `putGate` ask against the bank row and the gate row, apply its storage policy, and store its gate record if the act is a write. */
export const putGate = mutation({
  args:    CVX.askArgs,
  returns: CVX.gateWritten,
  handler: async (ctx, { ask: sent }) => {
    const ask = askFor(() => BX.gatePut.parse(sent))
    const bankDoc = await getBankDoc(ctx.db, ask)
    const gateDoc = await getGateDoc(ctx.db, ask, ask.gatelabel)
    const fetched = { bank: bankDoc?.bank ?? null, gate: gateDoc?.gate ?? null }
    if (! isWrite(storedOrNull(() => policedGateOf(ask, fetched)))) { return { ...fetched, written: null } }
    return { ...fetched, written: { gate: await writeGateDoc(ctx.db, gateDoc, ask.record) } }
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
    if (! isWrite(storedOrNull(() => BX.classifyDelBank(ask, fetched)))) { return { ...fetched, written: null } }
    const bank = await writeBankDoc(ctx.db, bankDoc, ask, ask.record)
    await deleteBank(ctx.db, ask)
    return { ...fetched, written: { bank } }
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
    if (! isWrite(storedOrNull(() => BX.classifyStoredVault(ask, fetched)))) { return { ...fetched, written: null } }
    return { ...fetched, written: { vault: await writeVaultDoc(ctx.db, vaultDoc, ask, ask.record) } }
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
    if (! isWrite(storedOrNull(() => BX.classifyStoredVault(ask, fetched)))) { return { ...fetched, written: null } }
    const vault = await writeVaultDoc(ctx.db, vaultDoc, ask, ask.record)
    // A vault's boxes end with its life, and the component's limits keep a life small enough to delete in this transaction.
    await deleteBoxes(ctx.db, lifeOf({ ...ask, vault_tok: ask.expected.vault_tok }))
    return { ...fetched, written: { vault } }
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
    if (! isWrite(storedOrNull(() => BX.classifyStoredBox(ask, fetched)))) { return { ...fetched, written: null, roomless: false } }
    const boxDoc = { ...life, boxlabel: ask.boxlabel, box: ask.record }
    // A put over a tombstone replaces that row, so only a new boxlabel adds to `all_count`.
    const growth = Tallies.growthOf(anteDoc, boxDoc)
    if (Tallies.wouldPassLimit(reckoning.tally, growth, cap)) { return { ...fetched, written: null, roomless: true } }
    const box = await writeBoxDoc(ctx.db, anteDoc, boxDoc)
    await Tallies.record(ctx.db, life, reckoning, growth)
    return { ...fetched, written: { box }, roomless: false }
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
    if (! isWrite(storedOrNull(() => BX.classifyStoredBox(ask, fetched)))) { return { ...fetched, written: null } }
    const boxDoc = { ...life, boxlabel: ask.boxlabel, box: ask.record }
    const box = await writeBoxDoc(ctx.db, anteDoc, boxDoc)
    // The tombstone replaces the row and still counts as one box row: of the `all_*` figures, only the size changes.
    await Tallies.forget(ctx.db, life, Tallies.growthOf(anteDoc, boxDoc))
    return { ...fetched, written: { box } }
  },
})
// --

// == [Upkeep]: tidyGone, watchRows

// A vault row is of an ended life when its `bank_tok` is not the live bank row's, and a box row or a tally when its life pair is
// not that of a live vault row. A vault row that fails its checks is left alone, with every box row and tally under its
// vaultlabel, and those box rows go uncounted. The box rows of ended lives may be more than one transaction can hold, so it
// deletes a batch of them, and a host calls it again until it answers that none are left.
/** Delete the vault rows and tallies of every ended life in a bank, and a batch of their box rows.
 * Returns how many box rows its live vaults hold, and what is left of the box rows of ended lives.
 */
export const tidyGone = mutation({
  args:    CVX.askArgs,
  returns: CVX.tidied,
  handler: async (ctx, { ask: sent }) => {
    const ask = askFor(() => DB.boxTidy.parse(sent))
    const bankDoc = await getBankDoc(ctx.db, ask)
    const bank_tok = liveBankTokOf(bankDoc?.bank ?? null)
    const vaultDocs = await listVaultDocs(ctx.db, ask)
    const lives: Life[] = []
    const damagedlabels: string[] = []
    for (const vaultDoc of vaultDocs) {
      const { vaultlabel } = vaultDoc
      const vault = BX.vaultRow.safeParse(vaultDoc.vault)
      if (! vault.success) {
        damagedlabels.push(vaultlabel)
      } else if (vault.data.bank_tok !== bank_tok) {
        await ctx.db.delete('safebyok_vaults', vaultDoc._id)
      } else if (vault.data.am === 'a') {
        lives.push(lifeOf({ ...ask, vaultlabel, bank_tok: vault.data.bank_tok, vault_tok: vault.data.vault_tok }))
      }
    }
    const liveCkeys = new Set(lives.map((life) => ckeyOfLife(life)))
    const isEnded = (doc: Life) => (! damagedlabels.includes(doc.vaultlabel)) && (! liveCkeys.has(ckeyOfLife(doc)))
    const tallyDocs = await listTallyDocs(ctx.db, ask)
    for (const tallyDoc of tallyDocs) {
      if (isEnded(tallyDoc)) { await ctx.db.delete('safebyok_tallies', tallyDoc._id) }
    }
    const leftover = await deleteEndedBoxes(ctx.db, ask, isEnded)
    let totalCount = 0
    for (const life of lives) { totalCount += await Tallies.countBoxes(ctx.db, life) }
    return { totalCount, leftover }
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

// == [Asks and refusals]: askFor, crossingOf, policedGateOf, storedOrNull, isWrite

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

// `replaced` means a live gate row was found, so `stored.gate` is set.
/** A `putGate` ask classified against `fetched`, its storage policy applied where it would replace the gate row. Throws `gate_issue` where the policy refuses. */
function policedGateOf(ask: BX.GatePutAsk, fetched: BX.GateFetched): BX.GateStored {
  const stored = BX.classifyStoredGate(ask, fetched)
  if (stored.act === 'replaced') { BX.demandStorage(ask, { parent: stored.parent, gate: stored.gate! }) }
  return stored
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

// == [Cascades]: deleteBank, deleteBoxes, deleteWithin, deleteEndedBoxes

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

// It reads the bank's box rows in index order, live ones among them, as `watchRows` does. Each box row of an ended life past the
// batch is read only to count it, against a second budget the size of the first: the rows counted within it are what the next
// call's batch deletes, if no more are left in the meantime.
/** Delete a batch of the bank's box rows that `isEnded` holds of, and say what is left of them. */
async function deleteEndedBoxes(db: DatabaseWriter, scope: BankScope, isEnded: (boxDoc: BoxDoc) => boolean): Promise<DB.Leftover> {
  const deleting = Tallies.tidyBudget()
  const counting = Tallies.tidyBudget()
  let leftover: DB.Leftover = 'none'
  for await (const boxDoc of listBoxDocsQuery(db, scope)) {
    if (! isEnded(boxDoc)) { continue }
    if (! Tallies.isSpent(deleting)) {
      Tallies.spend(deleting, getDocumentSize(boxDoc))
      await db.delete('safebyok_boxes', boxDoc._id)
    } else if (Tallies.isSpent(counting)) {
      return 'many'
    } else {
      Tallies.spend(counting, getDocumentSize(boxDoc))
      leftover = 'some'
    }
  }
  return leftover
}
// --

// == [Helpers]: lifeOf, ckeyOfLife, liveBankTokOf, getBankDoc, getGateDoc, getVaultDoc, getBoxDoc, writeBankDoc, writeGateDoc, writeVaultDoc, writeBoxDoc, the list queries, BankDoc, GateDoc, VaultDoc, BoxDoc

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

/** Write `bank` at `scope`, in place of `anteDoc` or as a new document, and return the bank row then stored. */
async function writeBankDoc(db: DatabaseWriter, anteDoc: BankDoc | null, { user_id, banklabel }: BankScope, bank: BX.BankRow): Promise<unknown> {
  const doc = { user_id, banklabel, bank }
  let id = anteDoc?._id
  if (id === undefined) { id = await db.insert('safebyok_banks', doc) } else { await db.replace('safebyok_banks', id, doc) }
  const stored = await db.get('safebyok_banks', id)
  return stored?.bank ?? null
}

/** Write `gate` at its own scope, in place of `anteDoc` or as a new document, and return the gate row then stored. */
async function writeGateDoc(db: DatabaseWriter, anteDoc: GateDoc | null, gate: BX.GateRecord): Promise<unknown> {
  const { user_id, banklabel, gatelabel } = gate
  const doc = { user_id, banklabel, gatelabel, gate }
  let id = anteDoc?._id
  if (id === undefined) { id = await db.insert('safebyok_gates', doc) } else { await db.replace('safebyok_gates', id, doc) }
  const stored = await db.get('safebyok_gates', id)
  return stored?.gate ?? null
}

/** Write `vault` at `scope`, in place of `anteDoc` or as a new document, and return the vault row then stored. */
async function writeVaultDoc(db: DatabaseWriter, anteDoc: VaultDoc | null, { user_id, banklabel, vaultlabel }: VaultScope, vault: BX.VaultRow): Promise<unknown> {
  const doc = { user_id, banklabel, vaultlabel, vault }
  let id = anteDoc?._id
  if (id === undefined) { id = await db.insert('safebyok_vaults', doc) } else { await db.replace('safebyok_vaults', id, doc) }
  const stored = await db.get('safebyok_vaults', id)
  return stored?.vault ?? null
}

/** Write `boxDoc` in place of `anteDoc` or as a new document, and return the box row then stored. */
async function writeBoxDoc(db: DatabaseWriter, anteDoc: BoxDoc | null, boxDoc: BoxDocGiven): Promise<unknown> {
  let id = anteDoc?._id
  if (id === undefined) { id = await db.insert('safebyok_boxes', boxDoc) } else { await db.replace('safebyok_boxes', id, boxDoc) }
  const stored = await db.get('safebyok_boxes', id)
  return stored?.box ?? null
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
