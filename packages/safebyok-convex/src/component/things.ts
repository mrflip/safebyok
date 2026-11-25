import * as DB from 'safebyok/storage'
import type { AnyAsk, BirthBankActual, ThingScope, ThingWatchScope, WroteActual } from 'safebyok/storage'
import { ConvexError } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { DatabaseReader, DatabaseWriter } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import type { SafebyokRefusal } from '../refusals'
import * as CVX from './validators'

// One function for each call of AdapterVaultDB, and the query a watch subscribes to. They are called through the host's
// wrapper, which has already checked that the caller is the user the call names. Convex runs a mutation as one serializable
// transaction, so each write is atomic. A write function, in one mutation:
// * checks its ask with the core's checker,
// * fetches the Thing at the ask's scope, the nearest Thing above it, and the bank, main gate and root box,
// * classifies the ask with the core's classifier, then
// * writes the ask's record over the Thing it cites if the act is a write, and reads back what was stored.
// It returns what it fetched, as it stood before any write, and as `written` what it read back, or null if it wrote nothing.
// The client classifies what was fetched with the same classifier, so it reaches the same act, outcome or refusal, checks
// that the act agrees with whether anything was written, and answers what was read back. A get, a listing, a get of the
// world and the stats only read, from one snapshot.

// == [Gets]: getThing, listThings, getWorld

/** Fetch the Thing at the ask's scope, the nearest Thing stored above it, and the bank and how its roots compare with the ask's track, in one snapshot. */
export const getThing = query({
  args:    CVX.askArgs,
  returns: CVX.thingFetched,
  handler: async (ctx, { ask: sent }) => {
    const ask = askFor(() => DB.AskChecks.getAsk.parse(sent))
    const [thing, above] = await Promise.all([rawAt(ctx.db, ask), aboveIn(ctx.db, ask)])
    return { thing, ...above }
  },
})

/** Fetch the parent at the ask's scope, each Thing one label under it, and the bank and how its roots compare with the ask's track, in one snapshot. */
export const listThings = query({
  args:    CVX.askArgs,
  returns: CVX.thingsFetched,
  handler: async (ctx, { ask: sent }) => {
    const ask = askFor(() => DB.AskChecks.listAsk.parse(sent))
    const [parent, children, { bank, tracked }] = await Promise.all([rawAt(ctx.db, ask), childrenIn(ctx.db, ask), rootsIn(ctx.db, ask)])
    return { parent, children, bank, tracked }
  },
})

/** Fetch the bank, main gate and root box, and how they compare with the ask's track, in one snapshot. */
export const getWorld = query({
  args:    CVX.askArgs,
  returns: CVX.rootsFetched,
  handler: async (ctx, { ask: sent }) => await rootsIn(ctx.db, askFor(() => DB.AskChecks.getWorldAsk.parse(sent))),
})
// --

// == [Writes]: writeThing, birthBank

/** Classify a write against the Thing at its scope, and write its record over that Thing if the act is a write. */
export const writeThing = mutation({
  args:    CVX.askArgs,
  returns: CVX.thingWritten,
  handler: async (ctx, { ask: sent }) => {
    const ask = askFor(() => DB.checkedWriteAsk(sent))
    const [thing, above] = await Promise.all([rawAt(ctx.db, ask), aboveIn(ctx.db, ask)])
    const isWrite = wouldWrite(() => DB.Classifier.classifyWriteThing(ask, thing, { ...above, read_tc: DB.readTcNow() }))
    if (! isWrite) { return { thing, ...above, written: null } }

    const thingWritten = await writeAt(ctx.db, ask, ask.record)
    const { bank, tracked } = await rootsIn(ctx.db, ask)
    return { thing, ...above, written: { thing: thingWritten, bank, tracked } }
  },
})

/** Classify a bank's birth against its bank, main gate and root box, and write the three if it is born. */
export const birthBank = mutation({
  args:    CVX.askArgs,
  returns: CVX.rootsWritten,
  handler: async (ctx, { ask: sent }) => {
    const ask = askFor(() => DB.checkedBirthBankAsk(sent))
    const puts = DB.birthPutsOf(ask)
    const fetched = await rootsIn(ctx.db, ask)
    const isBorn = wouldWrite(() => DB.Classifier.classifyBirthBank(puts, { ...fetched, read_tc: DB.readTcNow() }))
    if (! isBorn) { return { ...fetched, written: null } }

    for (const put of puts) { await writeAt(ctx.db, put, put.record) }
    return { ...fetched, written: await rootsIn(ctx.db, ask) }
  },
})
// --

// == [Stats]: stats

/** Count and weigh the boxes and gates of a bank, and fetch the bank and how its roots compare with the ask's track, in one snapshot. */
export const stats = query({
  args:    CVX.askArgs,
  returns: CVX.statsFetched,
  handler: async (ctx, { ask: sent }) => {
    const ask = askFor(() => DB.AskChecks.statsAsk.parse(sent))
    const [filed, { bank, tracked }] = await Promise.all([bankThingsIn(ctx.db, ask), rootsIn(ctx.db, ask)])
    const { box, gate } = DB.vaultStatsOf(filed)
    return { box, gate, bank, tracked }
  },
})
// --

// == [Watching]: watchThings

// Convex re-runs this query whenever a Thing in its range is committed, and sends the client its whole result each time,
// so the client watches again from the cursor each result returns. Every later commit has a higher commit timestamp than
// any this query read, and than the snapshot it read, so watching from that cursor misses nothing.
/** Fetch each Thing of a bank committed after `cursor`, each raw beside its labelpath, and the bank, with the cursor to watch from next. Given null, fetch nothing, the cursor being now. */
export const watchThings = query({
  args:    CVX.watchArgs,
  returns: CVX.thingsWatched,
  handler: async (ctx, { scope: sent, cursor }) => {
    const scope = askFor(() => DB.AskChecks.thingWatchScope.parse(sent))
    return (cursor === null) ? { things: [], bank: null, cursor: ctx.meta.getSnapshotTs() } : await committedAfterIn(ctx.db, scope, cursor)
  },
})
// --

// == [Asks and refusals]: askFor, wouldWrite

// Anyone signed in may call these functions with an ask of their own making, so each parses its ask again here, with the core's
// own checker, before a Thing is read, and continues with what the parse returns. The ask's checks refuse `bad_record` only.
/** Return what `parse` returns, rethrowing a refusal of the ask as a ConvexError the client sees. */
function askFor<AskT>(parse: () => AskT): AskT {
  try {
    return parse()
  } catch (err) {
    if (! DB.isVaultError(err, 'bad_record')) { throw err }
    throw new ConvexError<SafebyokRefusal>({ kind: 'bad_record', message: err.message })
  }
}

// A refusal writes nothing, and the client's own classification reaches the same refusal.
/** True when `classify` reaches a write act. */
function wouldWrite(classify: () => WroteActual | BirthBankActual): boolean {
  try {
    const actual = classify()
    return actual.ok && DB.Classifier.isWriteAct(actual.act)
  } catch (err) {
    if (DB.isVaultError(err)) { return false }
    throw err
  }
}
// --

// == [Things stored]: ThingDoc, docAt, rawAt, rootsIn, aboveIn, childrenIn, bankThingsIn, committedAfterIn, writeAt

/** A Thing's document. Its `thing` is `unknown` until the core has checked it. */
type ThingDoc = Omit<Doc<'things'>, 'thing'> & { thing: unknown }

// `.unique()` throws if it finds two documents. A document is inserted only when none was found in the same transaction, so
// two would mean damage, and that should fail loudly.
/** The document of the Thing at `scope`, or null for none. */
async function docAt(db: DatabaseReader, { userid, banklabel, labelpath }: ThingScope): Promise<ThingDoc | null> {
  return await db.query('things').withIndex('by_scope', (idx) => idx.eq('userid', userid).eq('banklabel', banklabel).eq('labelpath', labelpath)).unique()
}

/** The raw Thing at `scope`, or null for none. */
async function rawAt(db: DatabaseReader, scope: ThingScope): Promise<unknown> {
  const doc = await docAt(db, scope)
  return doc?.thing ?? null
}

/** The raw bank, main gate and root box of `ask`'s bank, and how they compare with what `ask` tracks. */
async function rootsIn(db: DatabaseReader, ask: AnyAsk) {
  const { userid, banklabel } = ask
  const [bank, gate, root] = await Promise.all([
    rawAt(db, { userid, banklabel, labelpath: 'bank' }),
    rawAt(db, { userid, banklabel, labelpath: DB.Labelpath.MainGate }),
    rawAt(db, { userid, banklabel, labelpath: DB.Labelpath.RootBox }),
  ])
  return { bank, gate, root, tracked: DB.Classifier.trackedFetchedOf(ask, { bank, [DB.Labelpath.MainGate]: gate, [DB.Labelpath.RootBox]: root }) }
}

/** The raw bank of `ask`'s bank, how its roots compare with what `ask` tracks, and the nearest Thing stored above its scope. */
async function aboveIn(db: DatabaseReader, ask: AnyAsk & ThingScope) {
  const { userid, banklabel } = ask
  const [{ bank, tracked }, ...ancestors] = await Promise.all([
    rootsIn(db, ask),
    ...DB.Labelpath.ancestorsOf(ask.labelpath).map(async (labelpath) => await rawAt(db, { userid, banklabel, labelpath })),
  ])
  return { bank, tracked, ancestor: ancestors.find((raw) => raw !== null) ?? null }
}

// The index sorts a bank's labelpaths, so the Things below `scope` are the one range from `<labelpath>/` up to `<labelpath>0`,
// '0' being the character after '/'. A child is one label under it: no '/' past the prefix.
/** Each raw Thing one label under `scope`, beside its labelpath. */
async function childrenIn(db: DatabaseReader, { userid, banklabel, labelpath }: ThingScope) {
  const under = `${labelpath}/`
  const docs: ThingDoc[] = await db.query('things')
    .withIndex('by_scope', (idx) => idx.eq('userid', userid).eq('banklabel', banklabel).gte('labelpath', under).lt('labelpath', `${labelpath}0`))
    .collect()
  return docs.filter((doc) => ! doc.labelpath.includes('/', under.length)).map((doc) => ({ labelpath: doc.labelpath, raw: doc.thing }))
}

/** Every raw Thing of a bank, each beside its labelpath. */
async function bankThingsIn(db: DatabaseReader, { userid, banklabel }: ThingWatchScope) {
  const docs: ThingDoc[] = await db.query('things').withIndex('by_scope', (idx) => idx.eq('userid', userid).eq('banklabel', banklabel)).collect()
  return docs.map(({ labelpath, thing }) => ({ labelpath, raw: thing }))
}

/** Each raw Thing of a bank committed after `cursor`, beside its labelpath, in commit order; the raw bank; and the last commit timestamp among them, else `cursor`. Called from a query only. */
async function committedAfterIn(db: DatabaseReader, { userid, banklabel }: ThingWatchScope, cursor: bigint) {
  // Only the mutation that writes a document reads its `commit_ts` back as Convex's placeholder; a query reads the timestamp.
  type CommittedThingDoc = ThingDoc & { commit_ts: bigint }
  const [docs, bank] = await Promise.all([
    db.query('things').withIndex('by_commit', (idx) => idx.eq('userid', userid).eq('banklabel', banklabel).gt('commit_ts', cursor)).collect() as Promise<CommittedThingDoc[]>,
    rawAt(db, { userid, banklabel, labelpath: 'bank' }),
  ])
  const things = docs.map(({ labelpath, thing }) => ({ labelpath, raw: thing }))
  return { things, bank, cursor: docs.at(-1)?.commit_ts ?? cursor }
}

/** Write `thing` at `scope`, over the document there or as a new one, stamped with the commit's timestamp, and return the Thing then stored. */
async function writeAt(db: DatabaseWriter, scope: ThingScope, thing: unknown): Promise<unknown> {
  const { userid, banklabel, labelpath } = scope
  const doc = { userid, banklabel, labelpath, thing, commit_ts: db.vars.commitTs }
  const anteDoc = await docAt(db, scope)
  let id = anteDoc?._id
  if (id === undefined) { id = await db.insert('things', doc) } else { await db.replace('things', id, doc) }
  const stored = await db.get('things', id)
  return stored?.thing ?? null
}
// --
