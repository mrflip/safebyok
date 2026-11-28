import * as DB from 'safebyok/storage'
import type {
  AnyAsk, BankObserved, BirthManifest, GetAsk, GetManifest, ThingScope, ListAsk, RootRows, StatsManifest, ListManifest, ThingWatchScope, GetBankManifest, WriteAsk, WriteManifest,
} from 'safebyok/storage'
import { ConvexError } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { DatabaseReader, DatabaseWriter } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { ThingTables } from './schema'
import type { SafebyokRefusal } from '../refusals'
import * as CVX from './validators'

// The datastore of `ConvexVaultDB` (`notes/vault-adapter-contract.md`): one function for each call of AdapterVaultDB, and the
// query a watch subscribes to. They are called through the host's wrapper, which has already checked that the caller is
// the user the call names. Each is one Convex query or mutation, and a mutation is one serializable transaction. Each hands
// back a manifest of what it observed, its tags made with `ManifestTags` and its write decided by the core's own predicate,
// as `MemoryDatastore` does; it reads no check and no act table. The client adds the manifest's `read_tc`.

/** A manifest as the component hands it back: the client adds its `read_tc`. */
type Observed<ManifestT extends BankObserved> = Omit<ManifestT, 'read_tc'>

// == [Gets]: getThing, listThings, getBank

/** The Thing at the ask's scope, observed in one query. */
export const getThing = query({
  args:    CVX.askArgs,
  returns: CVX.getManifest,
  handler: async (ctx, { ask: sent }): Promise<Observed<GetManifest>> => {
    const ask    = askFor(() => DB.AskChecks.getAsk.parse(sent))
    const actual = await rowAt(ctx.db, ask)
    return { tags: DB.ManifestTags.getTagsOf(actual), actual, ancestor: await ancestorOf(ctx.db, ask, actual), ...(await bankObservedOf(ctx.db, ask)) }
  },
})

// Like Postgres's, the listing reads the children whatever the parent: the vaultDB reads them only under a live one.
/** The Thing at the ask's scope, and each Thing one label under it, observed in one query. */
export const listThings = query({
  args:    CVX.askArgs,
  returns: CVX.listManifest,
  handler: async (ctx, { ask: sent }): Promise<Observed<ListManifest>> => {
    const ask    = askFor(() => DB.AskChecks.listAsk.parse(sent))
    const actual = await rowAt(ctx.db, ask)
    return { tags: DB.ManifestTags.getTagsOf(actual), actual, children: await childrenIn(ctx.db, ask), ...(await bankObservedOf(ctx.db, ask)) }
  },
})

/** The two roots of the ask's bank, observed in one query. */
export const getBank = query({
  args:    CVX.askArgs,
  returns: CVX.getBankManifest,
  handler: async (ctx, { ask: sent }): Promise<Observed<GetBankManifest>> => {
    const ask = askFor(() => DB.AskChecks.getBankAsk.parse(sent))
    return { actual: await rootsOf(ctx.db, ask), ...(await bankObservedOf(ctx.db, ask)) }
  },
})
// --

// == [Writes]: writeThing, birthBank

/** Write the ask's record where `isWritable` allows, and observe the result, in one mutation. */
export const writeThing = mutation({
  args:    CVX.askArgs,
  returns: CVX.writeManifest,
  handler: async (ctx, { ask: sent }): Promise<Observed<WriteManifest>> => {
    const ask       = askFor(() => DB.checkedWriteAsk(sent))
    const prior     = await rowAt(ctx.db, ask)
    const isWritten = DB.isWritable(ask, prior)
    if (isWritten) { await writeAt(ctx.db, ask) }
    const actual = await rowAt(ctx.db, ask)
    return { tags: DB.ManifestTags.writeTagsOf(ask, prior, isWritten), actual, ancestor: await ancestorOf(ctx.db, ask, actual), ...(await bankObservedOf(ctx.db, ask)) }
  },
})

/** Write a new bank's two roots, each put's record, where `isBirthWritable` allows, and observe the result, in one mutation. */
export const birthBank = mutation({
  args:    CVX.askArgs,
  returns: CVX.birthManifest,
  handler: async (ctx, { ask: sent }): Promise<Observed<BirthManifest>> => {
    const ask       = askFor(() => DB.checkedBirthBankAsk(sent))
    const puts      = DB.birthPutsOf(ask)
    const prior     = await rootsOf(ctx.db, ask)
    const isWritten = DB.isBirthWritable(puts, prior)
    if (isWritten) { for (const put of puts) { await writeAt(ctx.db, put) } }
    return { tags: DB.ManifestTags.birthTagsOf(puts, prior, isWritten), actual: await rootsOf(ctx.db, ask), ...(await bankObservedOf(ctx.db, ask)) }
  },
})
// --

// == [Stats]: ConvexBankLimits, stats

// docs.convex.dev/production/state/limits: one query may scan 32,000 documents and read 16 MiB. The stats read every Thing
// of a bank in one query, as may a watch that comes back after long enough away, so a bank holds no more than that.
/** The most a bank holds in Convex: the documents and bytes one query may read. */
const ConvexBankLimits = { count: 32_000, size: 16_777_216 }

/** The storage stats of the ask's bank, observed in one query. */
export const stats = query({
  args:    CVX.askArgs,
  returns: CVX.statsManifest,
  handler: async (ctx, { ask: sent }): Promise<Observed<StatsManifest>> => {
    const ask = askFor(() => DB.AskChecks.statsAsk.parse(sent))
    return { stats: DB.vaultStatsOf(await bankThingsIn(ctx.db, ask), ConvexBankLimits), ...(await bankObservedOf(ctx.db, ask)) }
  },
})
// --

// == [Watching]: watchThings

// Convex re-runs this query whenever a Thing in its ranges is committed, and sends the client its whole result each time,
// so the client watches again from the cursor each result returns. Every later commit has a higher commit timestamp than
// any this query read, and than the snapshot it read, so watching from that cursor misses nothing.
/** The Things of a bank committed after `cursor`, with the banktok of their bank and the cursor to watch from next.
 * A null cursor reads nothing, and returns the cursor of now.
 */
export const watchThings = query({
  args:    CVX.watchArgs,
  returns: CVX.thingsWatched,
  handler: async (ctx, { scope: sent, cursor }) => {
    const scope = askFor(() => DB.AskChecks.thingWatchScope.parse(sent))
    return (cursor === null) ? { things: [], banktok: null, cursor: ctx.meta.getSnapshotTs() } : await committedAfterIn(ctx.db, scope, cursor)
  },
})
// --

// == [Asks]: askFor

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
// --

// == [Rows]: ThingDoc, docAt, rowOf, rowAt, ancestorOf, rootsOf, bankObservedOf, childrenIn, bankThingsIn, committedAfterIn, writeAt

/** A Thing's document, in the table of any kind. */
type ThingDoc = Doc<'gate_things'> | Doc<'box_things'>

// `.unique()` throws if it finds two documents. A document is inserted only when none was found in the same transaction, so
// two would mean damage, and that should fail loudly.
/** The document of the Thing at `scope`, or null for none. */
async function docAt(db: DatabaseReader, { modelkind, userid, banklabel, labelpath }: ThingScope): Promise<ThingDoc | null> {
  return await db.query(ThingTables[modelkind]).withIndex('by_scope', (idx) => idx.eq('userid', userid).eq('banklabel', banklabel).eq('labelpath', labelpath)).unique()
}

/** The raw row a document holds: the Thing's fields, without Convex's own or the commit timestamp. */
function rowOf(doc: ThingDoc): unknown {
  const { _id, _creationTime, commit_ts: _commitTs, ...row } = doc
  return row
}

/** The raw row at `scope`, or null for none. */
async function rowAt(db: DatabaseReader, scope: ThingScope): Promise<unknown> {
  const doc = await docAt(db, scope)
  return (doc === null) ? null : rowOf(doc)
}

/** Where `actual` is null, the nearest row above `ask`'s scope, or null for none; otherwise null, as it is read nowhere else. */
async function ancestorOf(db: DatabaseReader, ask: GetAsk | WriteAsk, actual: unknown): Promise<unknown> {
  if (actual !== null) { return null }
  const { modelkind, userid, banklabel } = ask
  const aboves = await Promise.all(DB.Labelpath.ancestorsOf(ask.labelpath).map(async (labelpath) => await rowAt(db, { modelkind, userid, banklabel, labelpath })))
  return aboves.find((raw) => raw !== null) ?? null
}

/** The raw roots of `scope`'s bank, each null for none. */
async function rootsOf(db: DatabaseReader, scope: ThingWatchScope): Promise<RootRows> {
  const scopes = DB.rootScopesOf(scope)
  const [gate, root] = await Promise.all([rowAt(db, scopes.gate), rowAt(db, scopes.root)])
  return { gate, root }
}

/** The banktok of `ask`'s bank as it now stands, and its `tracked` for what `ask` tracks. */
async function bankObservedOf(db: DatabaseReader, ask: AnyAsk): Promise<Observed<BankObserved>> {
  const { gate, root } = await rootsOf(db, ask)
  return { banktok: DB.ManifestTags.banktokOf(gate), tracked: DB.ManifestTags.trackedOf(ask, { gate, root }) }
}

// The index sorts a bank's labelpaths, so the Things below `scope` are the one range from `<labelpath>/` up to `<labelpath>0`,
// '0' being the character after '/'. A child is one label under it: no '/' past the prefix.
/** Each raw row one label under the ask's scope, in the table of its kind, beside its labelpath. */
async function childrenIn(db: DatabaseReader, { modelkind, userid, banklabel, labelpath }: ListAsk) {
  const under = `${labelpath}/`
  const docs: ThingDoc[] = await db.query(ThingTables[modelkind])
    .withIndex('by_scope', (idx) => idx.eq('userid', userid).eq('banklabel', banklabel).gte('labelpath', under).lt('labelpath', `${labelpath}0`))
    .collect()
  return docs.filter((doc) => ! doc.labelpath.includes('/', under.length)).map((doc) => ({ labelpath: doc.labelpath, raw: rowOf(doc) }))
}

/** Every raw row of a bank beside its labelpath, kind by kind. */
async function bankThingsIn(db: DatabaseReader, scope: ThingWatchScope) {
  const [gate, box] = await Promise.all([kindThingsIn(db, ThingTables.gate, scope), kindThingsIn(db, ThingTables.box, scope)])
  return { gate, box }
}

/** Every raw row of a bank in `table`, beside its labelpath. */
async function kindThingsIn(db: DatabaseReader, table: typeof ThingTables[keyof typeof ThingTables], { userid, banklabel }: ThingWatchScope) {
  const docs: ThingDoc[] = await db.query(table).withIndex('by_scope', (idx) => idx.eq('userid', userid).eq('banklabel', banklabel)).collect()
  return docs.map((doc) => ({ labelpath: doc.labelpath, raw: rowOf(doc) }))
}

/** The raw rows of a bank, of each kind and beside it, committed after `cursor` and in commit order, with the banktok of the bank and the next cursor. */
async function committedAfterIn(db: DatabaseReader, { userid, banklabel }: ThingWatchScope, cursor: bigint) {
  // Only the mutation that writes a document reads its `commit_ts` back as Convex's placeholder; a query reads the timestamp.
  type CommittedThingDoc = ThingDoc & { commit_ts: bigint }
  const [docsByTable, gate] = await Promise.all([
    Promise.all(Object.values(ThingTables).map(async (table) =>
      await db.query(table).withIndex('by_commit', (idx) => idx.eq('userid', userid).eq('banklabel', banklabel).gt('commit_ts', cursor)).collect() as CommittedThingDoc[])),
    rowAt(db, DB.rootScopesOf({ userid, banklabel }).gate),
  ])
  // Commit timestamps rise in commit order, so the last of the sorted documents carries the next cursor.
  const docs   = docsByTable.flat().toSorted((one, other) => Number(one.commit_ts - other.commit_ts))
  const things = docs.map((doc) => ({ labelpath: doc.labelpath, modelkind: doc.modelkind, raw: rowOf(doc) }))
  return { things, banktok: DB.ManifestTags.banktokOf(gate), cursor: docs.at(-1)?.commit_ts ?? cursor }
}

/** Write `ask.record` at its scope, over the document there or as a new one, stamped with the commit's timestamp. */
async function writeAt(db: DatabaseWriter, ask: WriteAsk): Promise<void> {
  const doc      = { ...ask.record, commit_ts: db.vars.commitTs }
  const table    = ThingTables[ask.modelkind]
  const priorDoc = await docAt(db, ask)
  if (priorDoc === null) { await db.insert(table, doc) } else { await db.replace(table, priorDoc._id, doc) }
}
// --
