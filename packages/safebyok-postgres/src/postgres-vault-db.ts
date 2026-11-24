/** A vaultDB that keeps its Things in Postgres. */

// eslint-disable-next-line import-x/no-extraneous-dependencies -- a devDependency while PostgresVaultDB is not exported
import {
  type AnyAsk, type BirthBankActual, type BirthBankAsk, type BirthPuts, type GetAsk, type GotActual, type ListThingsActual, type ListAsk,
  type Received, type ThingWatchScope, type VaultError, type WriteAct, type WriteAsk, type WroteActual, AdapterVaultDB, Classifier, Shell, getAskOf, isVaultError, objCheck,
} from 'safebyok/storage'
import { type PostgresListen, type PostgresQueryable, jsonOrNull, listenOrNull, refusalOf, storedNothing, unlistenOnceListening } from './postgres-bank-db'
import { BirthRootsSql, GetThingSql, ListThingsSql, WriteThingSql } from './vault-queries'

// == [The driver]: PostgresVaultDBOpts, isPostgresQueryable

/** Options for `new PostgresVaultDB(opts)`:
 * - `client` -- runs the queries: a pool, a connection, or a PGlite
 * - `listen` -- subscribes to Postgres notifications for `watch`, which hears nothing without it
 */
export type PostgresVaultDBOpts = Readonly<{ client: PostgresQueryable, listen?: PostgresListen }>

/** True for a client with a `query` function. */
function isPostgresQueryable(candidate: unknown): candidate is PostgresQueryable {
  return (typeof candidate === 'object') && (candidate !== null) && ('query' in candidate) && (typeof candidate.query === 'function')
}

// `custom` and `fn` return the same client and listen objects they were given, so the driver's methods keep their `this`.
const postgresVaultDBOpts = objCheck(({ custom, fn }) => ({
  client: custom<PostgresQueryable>(isPostgresQueryable, 'Expected a client with a query function'),
  listen: fn<PostgresListen>().optional(),
}), 'bad_record')
// --

// == [Notices]: thingsChannelOf, Told, toldOf

// Postgres identifiers are at most 63 bytes. A userid whose channel name is longer cannot be notified, so a write that would notify for it fails.
/** The notification channel of `userid`'s Things: the channel a `PostgresListen` subscribes to. */
export function thingsChannelOf(userid: string): string { return `safebyok_things_${userid}` }

// Each notice comes from the `tell_thing` function in `vault-functions.ts`: a JSON object with the Thing's scope under `at`,
// the Thing under `thing` and the raw world under `world`, whichever fit.

/** A parsed notice: the labelpath of the Thing stored, and the Thing and raw world, where they fit. */
type Told = { labelpath: string, thing?: unknown, world?: unknown }

const toldCheck = objCheck(({ obj, str, unk }) => ({
  at:    obj({ userid: str, banklabel: str, labelpath: str }),
  thing: unk.optional(),
  world: unk.optional(),
}), { refusalkind: 'bad_record', extras: 'strip' })

/** The notice in `text` of a Thing in `scope`'s bank, or null for anything else. */
function toldOf({ userid, banklabel }: ThingWatchScope, text: string): Told | null {
  const toldReport = toldCheck.safeParse(jsonOrNull(text))
  if ((! toldReport.success) || (toldReport.data.at.userid !== userid) || (toldReport.data.at.banklabel !== banklabel)) { return null }
  const { at: { labelpath }, thing, world } = toldReport.data
  return { labelpath, thing, world }
}
// --

// == [What the database returns]: FetchedThing, knownRootsParam, mayWrite, writtenActOf

/** A get's row, unchecked: the Thing, null for none, the raw world, the nearest Thing stored above it, and how the world and root box compare with the ask's `known_roots`. */
type FetchedThing = { thing: unknown, world: Classifier.WorldFetched, ancestor: unknown, tracked: Classifier.TrackedFetched }

/** The parameter that carries what `ask` tracks: its JSON, or null for none. */
function knownRootsParam({ known_roots }: AnyAsk): string | null { return (known_roots === undefined) ? null : JSON.stringify(known_roots) }

// The classifier finds a write only where the Thing stored is the one cited, so only the flag for the cited Thing can let the ask write.
/** True when the ask's flags let it write over the Thing it cites: a del over a live Thing; a put by `ifPresent` over a live one, by `ifAbsent` over a tombstone or the shell. */
function mayWrite({ op, cited, ifAbsent, ifPresent }: WriteAsk): boolean {
  if (op === 'del') { return cited.am === 'a' }
  return (cited.am === 'a') ? (ifPresent === 'repl') : (ifAbsent === 'add')
}

/** The act of a write Postgres made, over the Thing the ask cites. */
function writtenActOf({ op, cited }: WriteAsk): WriteAct {
  if (op === 'del')                        { return 'deleted' }
  if (cited.revseq === Shell.Cited.revseq)  { return 'born' }
  return (cited.am === 'a') ? 'replaced' : 'reborn'
}
// --

/** A vaultDB that keeps its Things in Postgres, a table for each kind: run `VaultTablesSql`, then `VaultFunctionsSql`, before its first call.
 * Each write is one call of its kind's write function, which makes every check again in the statement that writes, and notifies the
 * user's channel ({@link thingsChannelOf}) for `watch`.
 */
export class PostgresVaultDB extends AdapterVaultDB {
  // == [Props]: #client, #listen

  readonly #client: PostgresQueryable
  readonly #listen: PostgresListen | undefined
  // --

  // == [Construction]: constructor

  constructor(opts: PostgresVaultDBOpts) {
    const { client, listen } = postgresVaultDBOpts.parse(opts)
    super()
    this.#client = client
    this.#listen = listen
  }
  // --

  // == [Statements]: #firstRow, #fetchThing

  // Each statement it runs returns one row, whatever is stored.
  async #firstRow<RowT>(text: string, params: unknown[]): Promise<RowT> {
    try {
      const { rows } = await this.#client.query(text, params)
      return rows[0] as RowT
    } catch (err) { throw refusalOf(err) }
  }

  /** The raw Thing at `ask`'s scope, null for none, its bank's raw world, the nearest Thing stored above it, and how the world and root box compare with what `ask` tracks. */
  async #fetchThing(ask: GetAsk | WriteAsk): Promise<FetchedThing> {
    const { userid, banklabel, labelpath, modelkind } = ask
    return await this.#firstRow<FetchedThing>(GetThingSql[modelkind], [userid, banklabel, labelpath, knownRootsParam(ask)])
  }
  // --

  // == [Protected, the calls of AdapterVaultDB]: doGetThing, doWriteThing, doListThings, doBirthBank, doWatch

  protected async doGetThing(ask: GetAsk): Promise<GotActual> {
    const { thing, world, ancestor, tracked } = await this.#fetchThing(ask)
    return this.classifyGetThing(ask, thing, { ...world, ancestor, tracked })
  }

  protected async doWriteThing(ask: WriteAsk): Promise<WroteActual> {
    if (! mayWrite(ask)) {
      const { thing, world, ancestor, tracked } = await this.#fetchThing(ask)
      return this.classifyWriteThing(ask, thing, { ...world, ancestor, tracked })
    }
    const policies = (ask.modelkind === 'gate') ? [ask.options?.policies ?? []] : []
    const params   = [JSON.stringify(ask.record), JSON.stringify(ask.cited), knownRootsParam(ask), ...policies]
    // Whether it stored the record, the Thing as it now stands, the raw world, the nearest Thing stored above it, how the world compares with the ask's `known_roots`, and the verdicts
    // of the checks the act tables cannot name: the stored born_at kept, the stored lifetok kept (the bank's alone), and the
    // storage policies met (the gate's alone). Each verdict is true where its check does not apply.
    const written  = await this.#firstRow<FetchedThing & { ok: boolean, born_at_ok: boolean, lifetok_ok?: boolean, policies_ok?: boolean }>(WriteThingSql[ask.modelkind], params)
    if (written.ok) {
      return { ok: true, act: writtenActOf(ask), world: Classifier.worldOf(ask, written.world), ...Classifier.trackedFieldOf(ask, written.tracked), record: Classifier.writtenThingOf(ask, written.thing) }
    }
    // Postgres wrote nothing. The act tables say why, of the revision cited; where they find a write, a verdict names the check it failed.
    const stored = Classifier.storedCitedOf(ask, written.thing)
    const act    = Classifier.writeActOf(ask, stored)
    if (! Classifier.isWriteAct(act))  { return Classifier.unwrittenWriteOf(written.thing, { ask, act, above: { ...written.world, ancestor: written.ancestor, tracked: written.tracked } }) }
    if (! written.born_at_ok)          { Classifier.demandBornAtKept(ask, written.thing) }
    if (written.lifetok_ok === false)  { Classifier.demandLifetokKept(ask, written.thing) }
    if (written.policies_ok === false) { Classifier.demandPolicies(ask, written.thing) }
    // No verdict explains the refusal: a check a validated ask cannot fail, or a verdict the classifier does not share.
    throw storedNothing()
  }

  protected async doListThings(ask: ListAsk): Promise<ListThingsActual> {
    const { userid, banklabel, labelpath, modelkind } = ask
    const params = [userid, banklabel, labelpath, knownRootsParam(ask)]
    // Made before the statement, whose snapshot is no earlier: Postgres before 18 has no UUID version 7 of its own.
    const read_tc = Classifier.readTcNow()
    const { parent, children, world, tracked } = await this.#firstRow<Omit<Classifier.ThingsFetched, 'read_tc'> & { world: Classifier.WorldFetched, tracked: Classifier.TrackedFetched }>(ListThingsSql[modelkind], params)
    return this.classifyListThings(ask, { parent, children, read_tc }, { ...world, tracked })
  }

  protected async doBirthBank(ask: BirthBankAsk, puts: BirthPuts): Promise<BirthBankActual> {
    // Whether it stored the three roots, each as it now stands, and how they compare with the ask's `known_roots`.
    const params  = [...puts.map(({ record }) => JSON.stringify(record)), knownRootsParam(ask)]
    const written = await this.#firstRow<Classifier.BankRootsFetched & { ok: boolean, tracked: Classifier.TrackedFetched }>(BirthRootsSql, params)
    if (written.ok) {
      const things = Classifier.writtenRootsOf(puts, written)
      return { ok: true, act: 'born', world: { ...things.bank, maingate: things.gate }, ...Classifier.trackedFieldOf(ask, written.tracked), things }
    }
    // Postgres refused. The act tables name why: a live bank, or a root the birth would write over. Every other check is one a validated ask cannot fail.
    const unwritten = Classifier.unwrittenBirthOf(puts, written)
    if (unwritten === null) { throw storedNothing() }
    return unwritten
  }

  // The order and timing of an *adapter*'s notifications relative to reads, writes, or other notifications is unspecified, even for datastores that provide assurance.
  protected override doWatch(scope: ThingWatchScope, receive: (received: Received) => void, onBadNews: (news: VaultError) => void): () => void {
    const listen = this.#listen
    if (listen === undefined) { return super.doWatch(scope, receive, onBadNews) }
    let isListening = true
    const onNotify = (text: string): void => {
      const told = toldOf(scope, text)
      if ((told === null) || (! isListening)) { return }
      void this.#receivedOrNull(scope, told, onFetchFailed).then((received) => { if ((received !== null) && isListening) { receive(received) } })
    }
    const onListenFailed = (news: VaultError): void => {
      if (! isListening) { return }
      isListening = false
      onBadNews(news)
    }
    const unwatch = (): void => {
      if (! isListening) { return }
      isListening = false
      void unlistenOnceListening(listening)
    }
    // A notice's fetch that would fail the same way again ends the watch.
    const onFetchFailed = (news: VaultError): void => {
      if (! isListening) { return }
      unwatch()
      onBadNews(news)
    }
    // Listen last, so a notice heard while `listen` runs finds every handler above.
    const listening = listenOrNull(listen, thingsChannelOf(scope.userid), onNotify, onListenFailed)
    return unwatch
  }
  // --

  // == [Hearing]: #receivedOrNull

  /** The Thing and world a notice carried, or fetched now if it carried less. Null if that fetch finds no Thing, or fails.
   * A failure a retry would not mend also hands `onFailed` its refusal.
   */
  async #receivedOrNull(scope: ThingWatchScope, { labelpath, thing, world }: Told, onFailed: (news: VaultError) => void): Promise<Received | null> {
    if ((thing !== undefined) && (world !== undefined)) { return { record: thing, world: Classifier.worldOf(scope, world as Classifier.WorldFetched) } }
    try {
      const fetched = await this.#fetchThing(getAskOf({ ...scope, labelpath }))
      return (fetched.thing === null) ? null : { record: fetched.thing, world: Classifier.worldOf(scope, fetched.world) }
    } catch (err) {
      // A notice is only a hint: if its Thing cannot be fetched for now, drop it.
      const refusal = refusalOf(err)
      if (! isVaultError(refusal, 'storage_unavailable')) { onFailed(refusal) }
      return null
    }
  }
  // --
}
