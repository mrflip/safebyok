/** A vaultDB that keeps its Things in Postgres. */

import {
  type AnyAsk, type Awaitable, type BadAnswer, type BankObserved, type BirthBankAsk, type BirthManifest, type BirthPuts, type GetAsk, type GetManifest, type GetBankAsk, type ListAsk, type ListManifest, type Received,
  type StatsAsk, type StatsManifest, type ThingWatchScope, type VaultError, type GetBankManifest, type WriteAsk, type WriteManifest, AdapterVaultDB, VoidBanktok, VoidTrack, getAskOf, isVaultError, objCheck,
  storeLimitsOf,
} from 'safebyok/storage'
import { type ThingNotification, thingNotificationOf, thingsChannelOf } from './notifications'
import * as Phrases from './phrases'
import { refusalOf } from './refusals'
import { BirthRootsSql, GetThingSql, GetBankSql, ListThingsSql, StatsSql, WriteThingSql } from './vault-queries'

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
  client: custom<PostgresQueryable>(isPostgresQueryable, Phrases.ClientExpected),
  listen: fn<PostgresListen>().optional(),
}), 'bad_record')
// --

// == [Parameters]: trackParam, writeParamsOf

/** The parameter that carries what `ask` tracks: its JSON. */
function trackParam({ track }: AnyAsk): string { return JSON.stringify(track) }

/** The parameters of `ask`'s statement in `WriteThingSql`: its record, what it cites, its flags and its track, and for a gate the storage policies it names. */
export function writeParamsOf(ask: WriteAsk): unknown[] {
  const { modelkind, record, cited, ifAbsent, ifPresent } = ask
  const policies = (modelkind === 'gate') ? [ask.options?.policies ?? []] : []
  return [JSON.stringify(record), JSON.stringify(cited), ifAbsent, ifPresent, trackParam(ask), ...policies]
}
// --

/** A vaultDB that keeps its Things in Postgres, a table for each kind: run `VaultTablesSql`, then `VaultFunctionsSql`, before its first call.
 * Each verb is one statement, which hands back its manifest whole. A write calls its kind's write function, which decides in the
 * statement that writes whether to write, and notifies the user's channel ({@link thingsChannelOf}) for `watch`.
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

  // == [Statements]: #queryRow

  // Every statement it runs returns one row, whatever is stored.
  /** The one row of the statement `text`, run with `params`. */
  async #queryRow<RowT>(text: string, params: unknown[]): Promise<RowT> {
    const { rows } = await this.#client.query(text, params)
    return rows[0] as RowT
  }
  // --

  // == [Protected, the calls of AdapterVaultDB]: doGetThing, doWriteThing, doListThings, doBirthBank, doGetBank, doStats, doWatch

  protected async doGetThing(ask: GetAsk): Promise<GetManifest> {
    const { userid, banklabel, labelpath, modelkind } = ask
    return await this.#queryRow<GetManifest>(GetThingSql[modelkind], [userid, banklabel, labelpath, trackParam(ask)])
  }

  protected async doWriteThing(ask: WriteAsk): Promise<WriteManifest> {
    return await this.#queryRow<WriteManifest>(WriteThingSql[ask.modelkind], writeParamsOf(ask))
  }

  protected async doListThings(ask: ListAsk): Promise<ListManifest> {
    const { userid, banklabel, labelpath, modelkind } = ask
    return await this.#queryRow<ListManifest>(ListThingsSql[modelkind], [userid, banklabel, labelpath, trackParam(ask)])
  }

  protected async doBirthBank(ask: BirthBankAsk, puts: BirthPuts): Promise<BirthManifest> {
    return await this.#queryRow<BirthManifest>(BirthRootsSql, [...puts.flatMap(({ record, cited }) => [JSON.stringify(record), JSON.stringify(cited)]), trackParam(ask)])
  }

  protected async doGetBank(ask: GetBankAsk): Promise<GetBankManifest> {
    const { userid, banklabel } = ask
    return await this.#queryRow<GetBankManifest>(GetBankSql, [userid, banklabel, trackParam(ask)])
  }

  // Postgres sets no limit of its own that a client can read, so each is the cap.
  protected async doStats(ask: StatsAsk): Promise<StatsManifest> {
    const { userid, banklabel } = ask
    const { box, gate, ...observed } = await this.#queryRow<BankObserved & Record<'box' | 'gate', unknown>>(StatsSql, [userid, banklabel, trackParam(ask)])
    return { stats: { box, gate, max: storeLimitsOf() }, ...observed }
  }

  // A notification may come before or after a read or a write made beside it, and before or after another notification.
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
  async #receiveNotified(scope: ThingWatchScope, { modelkind, labelpath, read_tc, thing, banktok }: ThingNotification, receive: (received: Received) => void, end: (why: VaultError) => void): Promise<void> {
    if ((thing !== undefined) && (banktok !== undefined)) {
      receive({ record: thing, modelkind, banktok, read_tc })
      return
    }
    let got: GetManifest
    try {
      got = await this.doGetThing(getAskOf({ ...scope, modelkind, labelpath, track: VoidTrack, banktok: VoidBanktok }))
    } catch (err) {
      const refusal = refusalOf('getThing', err)
      if (! isVaultError(refusal, 'storage_unavailable')) { end(refusal) }
      return
    }
    if (got.actual !== null) { receive({ record: got.actual, modelkind, banktok: got.banktok, read_tc: got.read_tc }) }
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
