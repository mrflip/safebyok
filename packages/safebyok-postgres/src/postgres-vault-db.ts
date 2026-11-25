/** A vaultDB that keeps its Things in Postgres. */

// eslint-disable-next-line import-x/no-extraneous-dependencies -- a devDependency while PostgresVaultDB is not exported
import {
  type AnyAsk, type BirthBankActual, type BirthBankAsk, type BirthPuts, type GetAsk, type GetWorldActual, type GetWorldAsk, type GotActual, type ListThingsActual, type ListAsk, type StatsActual, type StatsAsk, type ThingkindStats,
  type ReadTc, type Received, type ThingWatchScope, type VaultError, type WriteAct, type WriteAsk, type WroteActual, AdapterVaultDB, Classifier, Shell, VoidLifeTok, VoidTrack, getAskOf, isVaultError, objCheck, storeLimitsOf,
} from 'safebyok/storage'
import { type PostgresListen, type PostgresQueryable, jsonOrNull, listenOrNull, refusalOf, storedNothing, unlistenOnceListening } from './postgres-bank-db'
import { BirthRootsSql, GetThingSql, GetWorldSql, ListThingsSql, StatsSql, WriteThingSql } from './vault-queries'

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
// when Postgres read it under `read_tc`, the Thing under `thing` and the raw bank row under `bank`, whichever fit.

// AdapterVaultDB checks the read_tc, as it checks the Thing.
/** A parsed notice: the labelpath of the Thing stored, when Postgres read it, and the Thing and raw bank row, where they fit. */
type Told = { labelpath: string, read_tc?: unknown, thing?: unknown, bank?: unknown }

const toldCheck = objCheck(({ obj, str, unk }) => ({
  at:      obj({ userid: str, banklabel: str, labelpath: str }),
  read_tc: unk.optional(),
  thing:   unk.optional(),
  bank:    unk.optional(),
}), { refusalkind: 'bad_record', extras: 'strip' })

/** The notice in `text` of a Thing in `scope`'s bank, or null for anything else. */
function toldOf({ userid, banklabel }: ThingWatchScope, text: string): Told | null {
  const toldReport = toldCheck.safeParse(jsonOrNull(text))
  if ((! toldReport.success) || (toldReport.data.at.userid !== userid) || (toldReport.data.at.banklabel !== banklabel)) { return null }
  const { at: { labelpath }, read_tc, thing, bank } = toldReport.data
  return { labelpath, read_tc, thing, bank }
}
// --

// == [What the database returns]: FetchedThing, trackParam, mayWrite, writtenActOf

/** A get's row, unchecked: the Thing, null for none, the raw bank, the nearest Thing stored above it, how the bank, main gate and root box compare with the ask's track, and when Postgres read them. */
type FetchedThing = { thing: unknown, bank: unknown, ancestor: unknown, tracked: Classifier.TrackedFetched, read_tc: ReadTc }

/** The parameter that carries what `ask` tracks: its JSON. */
function trackParam({ track }: AnyAsk): string { return JSON.stringify(track) }

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

  /** The raw Thing at `ask`'s scope, null for none, its bank's raw row, the nearest Thing stored above it, how the bank, main gate and root box compare with what `ask` tracks, and when they were read. */
  async #fetchThing(ask: GetAsk | WriteAsk): Promise<Classifier.AboveFetched & { thing: unknown }> {
    const { userid, banklabel, labelpath, modelkind } = ask
    return await this.#firstRow<FetchedThing>(GetThingSql[modelkind], [userid, banklabel, labelpath, trackParam(ask)])
  }
  // --

  // == [Protected, the calls of AdapterVaultDB]: doGetThing, doWriteThing, doListThings, doBirthBank, doGetWorld, doStats, doWatch

  protected async doGetThing(ask: GetAsk): Promise<GotActual> {
    const { thing, ...above } = await this.#fetchThing(ask)
    return this.classifyGetThing(ask, thing, above)
  }

  protected async doWriteThing(ask: WriteAsk): Promise<WroteActual> {
    if (! mayWrite(ask)) {
      const { thing, ...above } = await this.#fetchThing(ask)
      return this.classifyWriteThing(ask, thing, above)
    }
    const policies = (ask.modelkind === 'gate') ? [ask.options?.policies ?? []] : []
    const params   = [JSON.stringify(ask.record), JSON.stringify(ask.cited), trackParam(ask), ...policies]
    // Whether it stored the record, the Thing as it now stands, the raw bank, the nearest Thing stored above it, how the roots compare with the track, when Postgres read them, and the verdicts
    // of the checks the act tables cannot name: the stored born_at kept, the stored lifetok kept (the bank's alone), and the
    // storage policies met (the gate's alone). Each verdict is true where its check does not apply.
    const written  = await this.#firstRow<FetchedThing & { ok: boolean, born_at_ok: boolean, lifetok_ok: boolean, policies_ok: boolean }>(WriteThingSql[ask.modelkind], params)
    if (written.ok) {
      return { ok: true, act: writtenActOf(ask), banktok: Classifier.banktokOf(ask, written.bank), tracked: Classifier.trackedOf(ask, written.tracked), read_tc: written.read_tc, record: Classifier.writtenThingOf(ask, written.thing) }
    }
    // Postgres wrote nothing. The act tables say why, of the revision cited; where they find a write, a verdict names the check it failed.
    const stored = Classifier.storedCitedOf(ask, written.thing)
    const act    = Classifier.writeActOf(ask, stored)
    if (! Classifier.isWriteAct(act))  { return Classifier.unwrittenWriteOf(written.thing, { ask, act, above: { bank: written.bank, ancestor: written.ancestor, tracked: written.tracked, read_tc: written.read_tc } }) }
    if (! written.born_at_ok)          { Classifier.demandBornAtKept(ask, written.thing) }
    if (! written.lifetok_ok)          { Classifier.demandLifetokKept(ask, written.thing) }
    if (! written.policies_ok)         { Classifier.demandPolicies(ask, written.thing) }
    // No verdict explains the refusal: a check a validated ask cannot fail, or a verdict the classifier does not share.
    throw storedNothing()
  }

  protected async doListThings(ask: ListAsk): Promise<ListThingsActual> {
    const { userid, banklabel, labelpath, modelkind } = ask
    const params = [userid, banklabel, labelpath, trackParam(ask)]
    const { parent, children, bank, tracked, read_tc } = await this.#firstRow<Classifier.ThingsFetched & Classifier.BankFetched>(ListThingsSql[modelkind], params)
    return this.classifyListThings(ask, { parent, children }, { bank, tracked, read_tc })
  }

  protected async doBirthBank(ask: BirthBankAsk, puts: BirthPuts): Promise<BirthBankActual> {
    // Whether it stored the three roots, each as it now stands, and how they compare with the track.
    const params  = [...puts.map(({ record }) => JSON.stringify(record)), trackParam(ask)]
    const written = await this.#firstRow<Classifier.BankRootsFetched & { ok: boolean }>(BirthRootsSql, params)
    if (written.ok) {
      const things = Classifier.writtenRootsOf(puts, written)
      return { ok: true, act: 'born', banktok: things.bank.lifetok, tracked: Classifier.trackedOf(ask, written.tracked), read_tc: written.read_tc, things }
    }
    // Postgres refused. The act tables name why: a live bank, or a root the birth would write over. Every other check is one a validated ask cannot fail.
    const unwritten = Classifier.unwrittenBirthOf(puts, written)
    if (unwritten === null) { throw storedNothing() }
    return unwritten
  }

  protected async doGetWorld(ask: GetWorldAsk): Promise<GetWorldActual> {
    const { userid, banklabel } = ask
    const fetched = await this.#firstRow<Classifier.BankRootsFetched>(GetWorldSql, [userid, banklabel, trackParam(ask)])
    return this.classifyGetWorld(ask, fetched)
  }

  // Postgres sets no limit of its own a client can read, so each is the cap.
  protected async doStats(ask: StatsAsk): Promise<StatsActual> {
    const { userid, banklabel } = ask
    const { box, gate, ...fetched } = await this.#firstRow<Classifier.BankFetched & Record<'box' | 'gate', ThingkindStats>>(StatsSql, [userid, banklabel, trackParam(ask)])
    return this.classifyStats(ask, fetched, { box, gate, max: storeLimitsOf() })
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

  /** The Thing, banktok and read_tc a notice carried, or fetched now if it carried less. Null if that fetch finds no Thing, or fails.
   * A failure a retry would not mend also hands `onFailed` its refusal.
   */
  async #receivedOrNull(scope: ThingWatchScope, { labelpath, read_tc, thing, bank }: Told, onFailed: (news: VaultError) => void): Promise<Received | null> {
    if ((thing !== undefined) && (bank !== undefined)) { return { record: thing, banktok: Classifier.banktokOf(scope, bank), read_tc } }
    try {
      const fetched = await this.#fetchThing(getAskOf({ ...scope, labelpath, track: VoidTrack, banktok: VoidLifeTok }))
      return (fetched.thing === null) ? null : { record: fetched.thing, banktok: Classifier.banktokOf(scope, fetched.bank), read_tc: fetched.read_tc }
    } catch (err) {
      // A notice is only a hint: if its Thing cannot be fetched for now, drop it.
      const refusal = refusalOf(err)
      if (! isVaultError(refusal, 'storage_unavailable')) { onFailed(refusal) }
      return null
    }
  }
  // --
}
