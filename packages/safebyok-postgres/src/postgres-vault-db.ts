/** A vaultDB that keeps its Things in Postgres. */

import { type EX, type Errors, Throwers, Validator } from 'safebyok-big/internals'
// eslint-disable-next-line import-x/no-extraneous-dependencies -- a devDependency while PostgresVaultDB is not exported
import {
  type Actual, type AnyAsk, type AdapterVaultDBOpts, type BirthBankActual, type BirthBankAsk, type BirthPuts, type GetAsk, type ListThingsActual, type ListAsk, type Received,
  type ThingWatchScope, type WriteAsk, AdapterVaultDB, Classifier, Shell, getAskOf,
} from 'safebyok/storage'
import { type PostgresListen, type PostgresQueryable, jsonOrNull, listenOrNull, refusalOf, unlistenOnceListening } from './postgres-bank-db'
import { BirthRootsSql, GetThingSql, ListThingsSql, WriteThingSql } from './vault-queries'

// == [The driver]: PostgresVaultDBOpts, isPostgresQueryable

/** Options for `new PostgresVaultDB(opts)`, beside {@link AdapterVaultDBOpts}:
 * - `client` -- runs the queries: a pool, a connection, or a PGlite
 * - `listen` -- subscribes to Postgres notifications for `watch`, which hears nothing without it
 */
export type PostgresVaultDBOpts = Readonly<AdapterVaultDBOpts & { client: PostgresQueryable, listen?: PostgresListen }>

/** True for a client with a `query` function. */
function isPostgresQueryable(candidate: unknown): candidate is PostgresQueryable {
  return (typeof candidate === 'object') && (candidate !== null) && ('query' in candidate) && (typeof candidate.query === 'function')
}

// `custom` and `fn` return the same client and listen objects they were given, so the driver's methods keep their `this`.
const postgresVaultDBOpts = Validator.objCheck(({ custom, fn, bool }) => ({
  client:          custom<PostgresQueryable>(isPostgresQueryable, 'Expected a client with a query function'),
  listen:          fn<PostgresListen>().optional(),
  doNotifyTracked: bool.optional(),
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

const toldCheck = Validator.objCheck(({ obj, str, unk }) => ({
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

// == [What the database returns]: FetchedThing, trackParam, mayWrite, writtenActOf

/** A get's row, unchecked: the Thing, null for none, the raw world, and how it compares with the ask's track. */
type FetchedThing = { thing: unknown, world: Classifier.WorldFetched, tracked: Classifier.TrackedFetched }

/** The parameter that carries what `ask` tracks: its JSON, or null for none. */
function trackParam({ track }: AnyAsk): string | null { return (track === undefined) ? null : JSON.stringify(track) }

// The classifier finds a write only where the Thing stored is the one cited, so only the flag for the cited Thing can let the ask write.
/** True when the ask's flags let it write over the Thing it cites: a del over a live Thing; a put by `ifPresent` over a live one, by `ifAbsent` over a tombstone or the shell. */
function mayWrite({ op, cited, ifAbsent, ifPresent }: WriteAsk): boolean {
  if (op === 'del') { return cited.am === 'a' }
  return (cited.am === 'a') ? (ifPresent === 'repl') : (ifAbsent === 'add')
}

/** The act of a write the store made, over the Thing the ask cites. */
function writtenActOf({ op, cited }: WriteAsk): EX.WriteAct {
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
    const { client, listen, ...adapterOpts } = postgresVaultDBOpts.parse(opts)
    super(adapterOpts)
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

  /** The raw Thing at `ask`'s scope, null for none, its bank's raw world, and how it compares with what `ask` tracks. */
  async #fetchThing(ask: GetAsk | WriteAsk): Promise<FetchedThing> {
    const { userid, banklabel, labelpath, modelkind } = ask
    return await this.#firstRow<FetchedThing>(GetThingSql[modelkind], [userid, banklabel, labelpath, trackParam(ask)])
  }
  // --

  // == [Protected, the calls of AdapterVaultDB]: doGetThing, doWriteThing, doListThings, doBirthBank, doWatch

  protected async doGetThing(ask: GetAsk): Promise<Actual<EX.GotAct>> {
    const { thing, world, tracked } = await this.#fetchThing(ask)
    return this.classifyGetThing(ask, thing, { ...world, tracked })
  }

  protected async doWriteThing(ask: WriteAsk): Promise<Actual<EX.PutAct | EX.DelAct>> {
    if (! mayWrite(ask)) {
      const { thing, world, tracked } = await this.#fetchThing(ask)
      return this.classifyWriteThing(ask, thing, { ...world, tracked })
    }
    const policies = (ask.modelkind === 'gate') ? [ask.options?.policies ?? []] : []
    const params   = [JSON.stringify(ask.record), JSON.stringify(ask.cited), trackParam(ask), ...policies]
    // Whether it stored the record, the Thing as it now stands, the raw world, how it compares with the track, and the verdicts
    // of the checks the act tables cannot name: the stored born_at kept, and the storage policies met (the gate's alone). Each
    // verdict is true where its check does not apply.
    const written  = await this.#firstRow<FetchedThing & { ok: boolean, born_at_ok: boolean, policies_ok?: boolean }>(WriteThingSql[ask.modelkind], params)
    if (written.ok) {
      return { ok: true, act: writtenActOf(ask), world: Classifier.worldOf(ask, written.world), ...Classifier.trackedFieldOf(ask, written.tracked), record: Classifier.writtenThingOf(ask, written.thing) }
    }
    // The store wrote nothing. The act tables say why, of the revision cited; where they find a write, a verdict names the check it failed.
    const stored = Classifier.storedCitedOf(ask, written.thing)
    const act    = Classifier.writeActOf(ask, stored)
    if (! Classifier.isWriteAct(act))             { return Classifier.unwrittenWriteOf(written.thing, { ask, act, world: { ...written.world, tracked: written.tracked } }) }
    if (! written.born_at_ok)          { Classifier.demandBornAtKept(ask, written.thing) }
    if (written.policies_ok === false) { Classifier.demandPolicies(ask, written.thing) }
    // No verdict explains the refusal: a check a validated ask cannot fail, or a verdict the classifier does not share.
    throw Throwers.storageIssue()
  }

  protected async doListThings(ask: ListAsk): Promise<ListThingsActual> {
    const { userid, banklabel, labelpath, modelkind } = ask
    const params = [userid, banklabel, labelpath, trackParam(ask)]
    const { parent, children, world, tracked } = await this.#firstRow<Classifier.ThingsFetched & { world: Classifier.WorldFetched, tracked: Classifier.TrackedFetched }>(ListThingsSql[modelkind], params)
    return this.classifyListThings(ask, { parent, children }, { ...world, tracked })
  }

  protected async doBirthBank(ask: BirthBankAsk, puts: BirthPuts): Promise<BirthBankActual> {
    // Whether it stored the three roots, each as it now stands, and how they compare with the track.
    const params  = [...puts.map(({ record }) => JSON.stringify(record)), trackParam(ask)]
    const written = await this.#firstRow<Classifier.BankRootsFetched & { ok: boolean, tracked: Classifier.TrackedFetched }>(BirthRootsSql, params)
    if (written.ok) {
      const things = Classifier.writtenRootsOf(puts, written)
      return { ok: true, act: 'born', world: { ...things.bank, maingate: things.gate }, ...Classifier.trackedFieldOf(ask, written.tracked), things }
    }
    // The store refused. The act tables name why: a live bank, or a root the birth would write over. Every other check is one a validated ask cannot fail.
    const unwritten = Classifier.unwrittenBirthOf(puts, written)
    if (unwritten === null) { throw Throwers.storageIssue() }
    return unwritten
  }

  protected override doWatch(scope: ThingWatchScope, receive: (received: Received) => void, onBadNews: (news: Errors.VaultError) => void): () => void {
    const listen = this.#listen
    if (listen === undefined) { return super.doWatch(scope, receive, onBadNews) }
    let isListening = true
    const onNotify = (text: string): void => {
      const told = toldOf(scope, text)
      if ((told === null) || (! isListening)) { return }
      void this.#receivedOrNull(scope, told).then((received) => { if ((received !== null) && isListening) { receive(received) } })
    }
    const onListenFailed = (news: Errors.VaultError): void => {
      if (! isListening) { return }
      isListening = false
      onBadNews(news)
    }
    const listening = listenOrNull(listen, thingsChannelOf(scope.userid), onNotify, onListenFailed)
    return () => {
      if (! isListening) { return }
      isListening = false
      void unlistenOnceListening(listening)
    }
  }
  // --

  // == [Hearing]: #receivedOrNull

  /** The Thing and world a notice carried, or fetched now if it carried less. Null if that fetch fails, or finds no Thing. */
  async #receivedOrNull(scope: ThingWatchScope, { labelpath, thing, world }: Told): Promise<Received | null> {
    if ((thing !== undefined) && (world !== undefined)) { return { record: thing, world: Classifier.worldOf(scope, world as Classifier.WorldFetched) } }
    try {
      const fetched = await this.#fetchThing(getAskOf({ ...scope, labelpath }))
      return (fetched.thing === null) ? null : { record: fetched.thing, world: Classifier.worldOf(scope, fetched.world) }
    } catch {
      return null  // a notice is only a hint: if its Thing cannot be fetched, drop it
    }
  }
  // --
}
