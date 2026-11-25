/** A vaultDB that keeps its Things in Postgres. */

import {
  type AnyAsk, type Awaitable, type BadAnswer, type BirthBankActual, type BirthBankAsk, type BirthPuts, type GetAsk, type GetWorldActual, type GetWorldAsk, type GotActual, type ListThingsActual, type ListAsk, type StatsActual, type StatsAsk,
  type ThingkindStats, type ReadTc, type Received, type ThingWatchScope, type VaultError, type WriteAct, type WriteAsk, type WroteActual, AdapterVaultDB, Classifier, Shell, VoidLifeTok, VoidTrack, getAskOf, isVaultError, objCheck, storeLimitsOf,
} from 'safebyok/storage'
import { type ThingNotification, thingNotificationOf, thingsChannelOf } from './notifications'
import { refusalOf, storedNothing } from './refusals'
import { BirthRootsSql, GetThingSql, GetWorldSql, ListThingsSql, StatsSql, WriteThingSql } from './vault-queries'

// == [Options]: PostgresQueryable, PostgresListen, PostgresVaultDBOpts, isPostgresQueryable, postgresVaultDBOpts

/** A pool or connection that runs one parameterized statement and resolves its rows: a `pg` Pool or Client, or a PGlite. */
export type PostgresQueryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }

/** A host's LISTEN: pass `onNotify` the text of each notification on `channel`, and return a function that stops listening. */
export type PostgresListen = (channel: string, onNotify: (text: string) => void) => Awaitable<() => unknown>

/** Options for `new PostgresVaultDB(opts)`:
 * - `client` -- runs the statements
 * - `listen` -- hears the notifications each write sends, for `watch`, which hears nothing without it
 */
export type PostgresVaultDBOpts = Readonly<{ client: PostgresQueryable, listen?: PostgresListen }>

/** True for a client with a `query` function. */
function isPostgresQueryable(candidate: unknown): candidate is PostgresQueryable {
  return (typeof candidate === 'object') && (candidate !== null) && ('query' in candidate) && (typeof candidate.query === 'function')
}

// `custom` and `fn` return the client and the listen they are given, so a driver's methods keep their `this`.
const postgresVaultDBOpts = objCheck(({ custom, fn }) => ({
  client: custom<PostgresQueryable>(isPostgresQueryable, 'Expected a client with a query function'),
  listen: fn<PostgresListen>().optional(),
}), 'bad_record')
// --

// == [Rows]: FetchedThing, trackParam, mayWrite, writtenActOf

/** A get's row, unchecked: the Thing, null for none, the raw bank, the nearest Thing stored above it, how the roots compare with the ask's track, and when Postgres read them. */
type FetchedThing = { thing: unknown, bank: unknown, ancestor: unknown, tracked: Classifier.TrackedFetched, read_tc: ReadTc }

/** The parameter that carries what `ask` tracks: its JSON. */
function trackParam({ track }: AnyAsk): string { return JSON.stringify(track) }

// The classifier finds a write only where the Thing stored is the one cited, so only the flag for the cited Thing can let the ask write.
/** True when the ask's flags let it write over the Thing it cites: a del over a live Thing, or a put by `ifPresent` over a live one and by `ifAbsent` over a tombstone or the shell. */
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

  // == [Statements]: #queryRow, #fetchThing

  // Every statement it runs returns one row, whatever is stored.
  /** The one row of the statement `text`, run with `params`. */
  async #queryRow<RowT>(text: string, params: unknown[]): Promise<RowT> {
    const { rows } = await this.#client.query(text, params)
    return rows[0] as RowT
  }

  /** The row of the Thing at `ask`'s scope. */
  async #fetchThing(ask: GetAsk | WriteAsk): Promise<FetchedThing> {
    const { userid, banklabel, labelpath, modelkind } = ask
    return await this.#queryRow<FetchedThing>(GetThingSql[modelkind], [userid, banklabel, labelpath, trackParam(ask)])
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
    // Each verdict is of a check of the Thing stored that the act tables cannot name, and is true where its check does not apply:
    // the stored born_at kept, the stored lifetok kept (the bank's alone), and the storage policies met (the gate's alone).
    /** A write's row, unchecked: whether it stored the record, a get's row as the Thing now stands, and the verdicts. */
    type WrittenThing = FetchedThing & { ok: boolean, born_at_ok: boolean, lifetok_ok: boolean, policies_ok: boolean }
    const policies = (ask.modelkind === 'gate') ? [ask.options?.policies ?? []] : []
    const params   = [JSON.stringify(ask.record), JSON.stringify(ask.cited), trackParam(ask), ...policies]
    const written  = await this.#queryRow<WrittenThing>(WriteThingSql[ask.modelkind], params)
    if (written.ok) {
      return { ok: true, act: writtenActOf(ask), banktok: Classifier.banktokOf(ask, written.bank), tracked: Classifier.trackedOf(ask, written.tracked), read_tc: written.read_tc, record: Classifier.writtenThingOf(ask, written.thing) }
    }
    // Postgres wrote nothing. The act tables say why, of the revision cited; where they find a write, a verdict names the check it failed.
    const { thing, bank, ancestor, tracked, read_tc } = written
    const act = Classifier.writeActOf(ask, Classifier.storedCitedOf(ask, thing))
    if (! Classifier.isWriteAct(act))  { return Classifier.unwrittenWriteOf(thing, { ask, act, above: { bank, ancestor, tracked, read_tc } }) }
    if (! written.born_at_ok)          { Classifier.demandBornAtKept(ask, thing) }
    if (! written.lifetok_ok)          { Classifier.demandLifetokKept(ask, thing) }
    if (! written.policies_ok)         { Classifier.demandPolicies(ask, thing) }
    // No verdict explains the refusal: a check a validated ask cannot fail, or a verdict the classifier does not share.
    throw storedNothing()
  }

  protected async doListThings(ask: ListAsk): Promise<ListThingsActual> {
    const { userid, banklabel, labelpath, modelkind } = ask
    const { parent, children, ...bankFetched } = await this.#queryRow<Classifier.ThingsFetched & Classifier.BankFetched>(ListThingsSql[modelkind], [userid, banklabel, labelpath, trackParam(ask)])
    return this.classifyListThings(ask, { parent, children }, bankFetched)
  }

  protected async doBirthBank(ask: BirthBankAsk, puts: BirthPuts): Promise<BirthBankActual> {
    // Whether it stored the three roots, each as it now stands, and how they compare with the track.
    const params  = [...puts.map(({ record }) => JSON.stringify(record)), trackParam(ask)]
    const written = await this.#queryRow<Classifier.BankRootsFetched & { ok: boolean }>(BirthRootsSql, params)
    if (written.ok) {
      const things = Classifier.writtenRootsOf(puts, written)
      return { ok: true, act: 'born', banktok: things.bank.lifetok, tracked: Classifier.trackedOf(ask, written.tracked), read_tc: written.read_tc, things }
    }
    // Postgres wrote nothing. The act tables say why: a live bank, or a root the birth would write over. Every other check is one a validated ask cannot fail.
    const unwritten = Classifier.unwrittenBirthOf(puts, written)
    if (unwritten === null) { throw storedNothing() }
    return unwritten
  }

  protected async doGetWorld(ask: GetWorldAsk): Promise<GetWorldActual> {
    const { userid, banklabel } = ask
    const fetched = await this.#queryRow<Classifier.BankRootsFetched>(GetWorldSql, [userid, banklabel, trackParam(ask)])
    return this.classifyGetWorld(ask, fetched)
  }

  // Postgres sets no limit of its own that a client can read, so each is the cap.
  protected async doStats(ask: StatsAsk): Promise<StatsActual> {
    const { userid, banklabel } = ask
    const { box, gate, ...bankFetched } = await this.#queryRow<Classifier.BankFetched & Record<'box' | 'gate', ThingkindStats>>(StatsSql, [userid, banklabel, trackParam(ask)])
    return this.classifyStats(ask, bankFetched, { box, gate, max: storeLimitsOf() })
  }

  // A notice may come before or after a read or a write made beside it, and before or after another notice.
  protected override doWatch(scope: ThingWatchScope, receive: (received: Received) => void, onBadNews: (news: VaultError) => void, onEnded: () => void): () => void {
    const listen = this.#listen
    if (listen === undefined) { return super.doWatch(scope, receive, onBadNews, onEnded) }
    // A watch stops once, whether it ends itself or its holder stops it: the holder of a watch that ended itself may still
    // call its stop, and the host's unlisten is not promised to bear a second call.
    let isWatching = true
    const stop = (): void => {
      if (! isWatching) { return }
      isWatching = false
      void stopListening(listening, onBadNews)
    }
    const end = (why: VaultError): void => {
      if (! isWatching) { return }
      stop()
      onEnded()
      onBadNews(why)
    }
    const onNotify = (text: string): void => {
      const notification = thingNotificationOf(scope, text)
      if (notification !== null) { void this.#receiveNotified(scope, notification, receive, end) }
    }
    const listening = startListening(listen, thingsChannelOf(scope.userid), onNotify, end)
    return stop
  }
  // --

  // == [Failures]: answerForThrown

  /** The refused answer for a verb that threw, telling a failure a retry may mend from one it would not. */
  protected override answerForThrown(thrown: unknown, oplabel: string, ask: unknown): BadAnswer {
    return super.answerForThrown(refusalOf(oplabel, thrown), oplabel, ask)
  }
  // --

  // == [Notifications]: #receiveNotified

  // A notification is a hint: one whose Thing cannot be fetched for now is dropped, and the device learns of the write at its next fetch.
  /** Pass `receive` the Thing a notification tells of, fetched where the notification does not carry it, and nothing where none is stored.
   * A fetch that would fail the same way again ends the watch, through `end`.
   */
  async #receiveNotified(scope: ThingWatchScope, { labelpath, read_tc, thing, bank }: ThingNotification, receive: (received: Received) => void, end: (why: VaultError) => void): Promise<void> {
    if ((thing !== undefined) && (bank !== undefined)) {
      receive({ record: thing, banktok: Classifier.banktokOf(scope, bank), read_tc })
      return
    }
    let fetched: FetchedThing
    try {
      fetched = await this.#fetchThing(getAskOf({ ...scope, labelpath, track: VoidTrack, banktok: VoidLifeTok }))
    } catch (err) {
      const refusal = refusalOf('getThing', err)
      if (! isVaultError(refusal, 'storage_unavailable')) { end(refusal) }
      return
    }
    if (fetched.thing !== null) { receive({ record: fetched.thing, banktok: Classifier.banktokOf(scope, fetched.bank), read_tc: fetched.read_tc }) }
  }
  // --
}

// == [Listening]: startListening, stopListening

// The host's listen is called after `watch` returns, so a watch that cannot start ends once its holder has its stop.
/** Start the host's listen, resolving its unlisten, or null where it fails, which ends the watch through `end`. */
async function startListening(listen: PostgresListen, channel: string, onNotify: (text: string) => void, end: (why: VaultError) => void): Promise<(() => unknown) | null> {
  try {
    await Promise.resolve()
    return await listen(channel, onNotify)
  } catch (err) {
    end(refusalOf('listen', err))
    return null
  }
}

/** Stop the host's listen once `listening` has started it, telling `onBadNews` if its unlisten fails. */
async function stopListening(listening: Promise<(() => unknown) | null>, onBadNews: (news: VaultError) => void): Promise<void> {
  const unlisten = await listening
  try {
    await unlisten?.()
  } catch (err) {
    onBadNews(refusalOf('unlisten', err))
  }
}
// --
