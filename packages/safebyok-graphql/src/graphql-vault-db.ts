/** A browser-side vaultDB that sends each verb to your GraphQL server, where `vaultResolvers` answers it from the server's own vaultDB.
 *
 * GraphQL only carries each answer, so a verb answers here as the server's vaultDB answered it. Where trouble lies decides how you meet it:
 * - The server's vaultDB refused, or failed in its datastore (`storage_issue`, `unexpected_error` or any other kind): the bad answer it gave, as it gave it.
 * - The server could not serve the request, as where its `getUserId` throws: a bad answer carrying that refusal, `unexpected_error` or the VaultError `getUserId` threw. A watch ends with it.
 * - The request broke this package's rules, as a watch scope that fails its check, which only another client sends: likewise, carrying the refusal of the rule (`bad_record`).
 * - GraphQL itself failed, as where the server serves some other schema: a bad answer of `unexpected_error`, which leaves the server's text behind. A request that fails in the network is `storage_unavailable`.
 */

import type { AnyVariables, Client, CombinedError, OperationResult } from '@urql/core'
import * as DB from 'safebyok/storage'
import { Classifier } from 'safebyok/storage'
import { CrossedErrExtension, WireChecks } from './shapes/shapes-wire'
import { networkTroubleOf, schemaNotServed, serverErred, watchEnded } from './refusals/throwers'
import { VaultOperations } from './vault-operations'
import * as Phrases from './phrases'

// == [Options]: GraphQLVaultClient, GraphQLVaultDBOpts, graphQLVaultDBOpts

/** The part of an urql Client that {@link GraphQLVaultDB} uses. */
export type GraphQLVaultClient = Pick<Client, 'query' | 'mutation' | 'subscription'>

/** Options for `new GraphQLVaultDB(opts)`. */
export interface GraphQLVaultDBOpts {
  /** Your app's urql Client, pointed at a server that serves `VaultSchemaSdl` with `vaultResolvers`. */
  client: GraphQLVaultClient
}

const isGraphQLVaultClient = (candidate: unknown): candidate is GraphQLVaultClient => (
  (typeof candidate === 'object') && (candidate !== null)
  && ('query' in candidate) && (typeof candidate.query === 'function')
  && ('mutation' in candidate) && (typeof candidate.mutation === 'function')
  && ('subscription' in candidate) && (typeof candidate.subscription === 'function')
)

// `custom` returns the same client object it was given, so the client's methods keep their `this`.
const graphQLVaultDBOpts = DB.objCheck(({ custom }) => ({
  client: custom<GraphQLVaultClient>(isGraphQLVaultClient, Phrases.NotGraphQLVaultClient),
}), 'bad_record')

true satisfies DB.AssertEqual<GraphQLVaultDBOpts, DB.CheckerInput<typeof graphQLVaultDBOpts>>
// --

// == [The vaultDB]: GraphQLVaultDB

/** A vaultDB that sends each verb to your GraphQL server: `new GraphQLVaultDB({ client })`.
 * The server answers from its own vaultDB, and this one checks every Thing the answer carries against the ask, as it would a datastore's.
 */
export class GraphQLVaultDB extends DB.AdapterVaultDB {
  // == [Props]: #client

  readonly #client: GraphQLVaultClient
  // --

  // == [Construction]: constructor

  constructor(opts: GraphQLVaultDBOpts) {
    super()
    const { client } = graphQLVaultDBOpts.parse(opts)
    this.#client = client
  }
  // --

  // == [Verbs]: doGetThing, doWriteThing, doListThings, doBirthBank, doGetWorld, doStats
  // Each sends its ask and reads the server's answer back into the report a datastore would make. A refusal the server's
  // verb threw is thrown again here, so it answers as it did there.

  /** Get the Thing at the ask's scope from the server. */
  protected async doGetThing(ask: DB.GetAsk): Promise<DB.GotActual> {
    const answer = WireChecks.gotAnswer.parse(thingAnswerDrop(await this.#runQuery(VaultOperations.getThing, 'safebyokGetThing', { ask })))
    if (! answer.ok) { throwIfThrown(ask, answer) }
    return { ...besideOf(ask, answer), ...Classifier.crossedGotOf(ask, answer.act, (answer.act === 'gotlive') ? answer.val : answer.dbhas) }
  }

  /** Write the ask's record on the server. */
  protected async doWriteThing(ask: DB.WriteAsk): Promise<DB.WroteActual> {
    const answer = WireChecks.wroteAnswer.parse(thingAnswerDrop(await this.#runMutation(VaultOperations.writeThing, 'safebyokWriteThing', { ask })))
    if (! answer.ok) {
      throwIfThrown(ask, answer)
      return { ...besideOf(ask, answer), ok: false, act: refusedActOf(answer.act), record: Classifier.crossedThingOf(ask, answer.dbhas) }
    }
    return { ...besideOf(ask, answer), ok: true, act: answer.act, record: Classifier.crossedWrittenOf(ask, answer.val) }
  }

  /** List the children of the live Thing at the ask's scope from the server. */
  protected async doListThings(ask: DB.ListAsk): Promise<DB.ListThingsActual> {
    const answer = WireChecks.listAnswer.parse(listAnswerDrop(await this.#runQuery(VaultOperations.listThings, 'safebyokListThings', { ask })))
    if (! answer.ok) {
      throwIfThrown(ask, answer)
      if ((answer.act !== 'void') && (answer.act !== 'gone')) { throw DB.storageIssue() }
      const record = (answer.dbhas === null) ? null : Classifier.crossedThingOf(ask, answer.dbhas)
      return { ...besideOf(ask, answer), ok: false, act: answer.act, record, parentage: [], deltas: [], damaged_rows: [] }
    }
    return { ...besideOf(ask, answer), ok: true, act: answer.act, ...Classifier.crossedListingOf(ask, answer) }
  }

  /** Write a new bank's three roots on the server. */
  protected async doBirthBank(ask: DB.BirthBankAsk, puts: DB.BirthPuts): Promise<DB.BirthBankActual> {
    const answer = WireChecks.rootsAnswer.parse(rootsAnswerDrop(await this.#runMutation(VaultOperations.birthBank, 'safebyokBirthBank', { ask })))
    if (! answer.ok) {
      throwIfThrown(ask, answer)
      return { ...besideOf(ask, answer), ok: false, act: refusedActOf(answer.act), record: Classifier.crossedNamedOf(ask, answer.dbhas) }
    }
    return { ...besideOf(ask, answer), ok: true, act: answer.act, things: Classifier.crossedRootsOf(puts, answer.val) }
  }

  /** Get the bank's three roots from the server. */
  protected async doGetWorld(ask: DB.GetWorldAsk): Promise<DB.GetWorldActual> {
    const answer = WireChecks.worldAnswer.parse(rootsAnswerDrop(await this.#runQuery(VaultOperations.getWorld, 'safebyokGetWorld', { ask })))
    if (! answer.ok) {
      throwIfThrown(ask, answer)
      throw DB.storageIssue()
    }
    return { ...besideOf(ask, answer), ok: true, act: answer.act, things: Classifier.crossedWorldOf(ask, answer.val) }
  }

  /** Get the bank's storage stats from the server. `AdapterVaultDB` checks them. */
  protected async doStats(ask: DB.StatsAsk): Promise<DB.StatsActual> {
    const answer = WireChecks.statsAnswer.parse(statsAnswerDrop(await this.#runQuery(VaultOperations.stats, 'safebyokStats', { ask })))
    if (! answer.ok) {
      throwIfThrown(ask, answer)
      throw DB.storageIssue()
    }
    return { ...besideOf(ask, answer), ok: true, act: answer.act, stats: answer.val as DB.VaultStats }
  }
  // --

  // == [Watch]: doWatch

  /** Subscribe to the bank's changes on the server, passing each changed Thing to `receive`.
   * The watch ends, once, at the notice the server marks as its last, or when the server ends the stream or the request fails; it never resubscribes.
   */
  protected override doWatch(scope: DB.ThingWatchScope, receive: (received: DB.Received) => void, onBadNews: (news: DB.VaultError) => void, onEnded: () => void): () => void {
    const watching: { isOn: boolean, subscription?: { unsubscribe: () => void } } = { isOn: true }
    let heardData: unknown
    // End once: stop the subscription, and where the watch ended itself, say so, then why. A stream can end inside
    // subscribe(), before `watch` returns, so the ending is told in a microtask, always after it.
    function end(news: DB.VaultError | null): void {
      watching.isOn = false
      watching.subscription?.unsubscribe()
      if (news === null) { return }
      queueMicrotask(() => {
        onEnded()
        onBadNews(news)
      })
    }
    watching.subscription = this.#client.subscription(VaultOperations.watchThings, { scope }).subscribe((result) => {
      if (! watching.isOn) { return }
      if (result.error !== undefined) {
        end(troubleOf(result.error))
        return
      }
      // When a stream over fetch closes, its final result repeats the previous notice. Do not hear it twice.
      const isHeard = (result.data === heardData)
      heardData = result.data
      const ending = isHeard ? null : hearNotice(result, receive, onBadNews)
      if (ending !== null) {
        end(ending)
        return
      }
      if (! result.hasNext) { end(watchEnded()) }
    })
    // If the stream ended synchronously inside subscribe(), `end` ran before `watching.subscription` was set. Unsubscribe now.
    if (! watching.isOn) { watching.subscription.unsubscribe() }
    return () => { end(null) }
  }
  // --

  // == [Operations]: #runQuery, #runMutation

  /** Run a query against the server, bypassing any cache, and return its `fieldname` field. */
  async #runQuery(document: string, fieldname: string, variables: AnyVariables): Promise<unknown> {
    return fieldOf(await this.#client.query(document, variables, { requestPolicy: 'network-only' }).toPromise(), fieldname)
  }

  /** Run a mutation and return its `fieldname` field. */
  async #runMutation(document: string, fieldname: string, variables: AnyVariables): Promise<unknown> {
    return fieldOf(await this.#client.mutation(document, variables).toPromise(), fieldname)
  }
  // --
}
// --

// == [Answers]: CheckedAnswer, RefusedAnswer, besideOf, throwIfThrown, refusedActOf, fieldOf, troubleOf, carriedErrOf, hearNotice

/** What every answer carries, as its check read it. */
type CheckedAnswer = Readonly<{ banktok: DB.Lifetok, tracked: unknown, read_tc: DB.ReadTc }>

/** A refused answer, as its check read it. */
type RefusedAnswer = CheckedAnswer & Readonly<{ ok: false, act: DB.BadAct, dbhas: unknown, err: DB.CrossedErr }>

/** What a report carries beside its act, read from `answer`: its banktok and read_tc, and its `tracked` checked against `ask`. */
function besideOf(ask: DB.AnyAsk, { banktok, tracked, read_tc }: CheckedAnswer): DB.ActualBeside {
  return { banktok, tracked: Classifier.crossedTrackedOf(ask, tracked), read_tc }
}

// A verb that threw answers `tracked: 'unread'`, and only it: its refusal is thrown again, with its act and the Thing it names.
/** Where `answer` is that of a verb that threw, throw its refusal again, naming its act and the Thing stored it names, checked. */
function throwIfThrown(ask: DB.AnyAsk, { act, tracked, dbhas, err }: RefusedAnswer): void {
  if (tracked === 'unread') { throw DB.refusedOverWire(err, { act, dbhas: (dbhas === null) ? null : Classifier.crossedNamedOf(ask, dbhas) }) }
}

/** `act`, a refused answer's act from a verb that did not throw, which must be one a datastore's report has. */
function refusedActOf(act: DB.BadAct): DB.RefusedAct {
  if (! (DB.refusedActVals as readonly string[]).includes(act)) { throw DB.storageIssue() }
  return act as DB.RefusedAct
}

/** Return the `fieldname` field of an operation's result, or throw the refusal for a failed operation. */
function fieldOf({ error: err, data }: OperationResult<unknown>, fieldname: string): unknown {
  if (err !== undefined) { throw troubleOf(err) }
  if ((typeof data !== 'object') || (data === null) || ! Object.hasOwn(data, fieldname)) { throw schemaNotServed() }
  return (data as Record<string, unknown>)[fieldname]
}

// A server's GraphQL error arrives among `graphQLErrors`; one that a subscription's `next` rejected with can arrive, in-process, as the `networkError`.
/** The refusal for a failed operation: the one a GraphQL error carries across, checked; else {@link networkTroubleOf} for a network failure, else {@link serverErred}. */
function troubleOf(err: CombinedError): DB.VaultError {
  const carried = [...err.graphQLErrors, err.networkError].map((gqlErr) => carriedErrOf(gqlErr)).find((crossed) => crossed !== undefined)
  if (carried !== undefined) {
    const report = DB.CrossedChecks.err.safeParse(carried)
    return report.success ? DB.refusedOverWire(report.data) : DB.storageIssue()
  }
  return (err.networkError === undefined) ? serverErred() : networkTroubleOf(err)
}

/** The refusal a GraphQL error carries under {@link CrossedErrExtension}, raw, or undefined where it carries none. */
function carriedErrOf(gqlErr: unknown): unknown {
  const extensions: unknown = (typeof gqlErr === 'object') && (gqlErr !== null) && ('extensions' in gqlErr) ? gqlErr.extensions : undefined
  return ((typeof extensions === 'object') && (extensions !== null)) ? (extensions as Record<string, unknown>)[CrossedErrExtension] : undefined
}

/** Pass the Thing a notice in `result` carries to `receive`, or its trouble to `onBadNews`. Return the trouble where the notice is the watch's last, else null. */
function hearNotice({ data }: OperationResult<unknown>, receive: (received: DB.Received) => void, onBadNews: (news: DB.VaultError) => void): DB.VaultError | null {
  const fields = ((typeof data === 'object') && (data !== null)) ? data as Record<string, unknown> : {}
  const report = WireChecks.notice.safeParse(noticeDrop(fields['safebyokWatchThings']))
  if (! report.success) {
    onBadNews(DB.storageIssue())
    return null
  }
  const notice = report.data
  if (notice.err === null) {
    receive({ record: notice.record, banktok: notice.banktok, read_tc: notice.read_tc })
    return null
  }
  const news = DB.refusedOverWire(notice.err)
  if (notice.isEnded) { return news }
  onBadNews(news)
  return null
}
// --

// == [Typenames]: Drop, dropTypename, errDrop, thingAnswerDrop, listAnswerDrop, rootsAnswerDrop, statsAnswerDrop, noticeDrop

// An exchange such as urql's cacheExchange adds `__typename` to every typed selection in a document. Remove it one selection
// at a time, never with a deep strip: a Thing, carried as SafebyokJson, may have a `__typename` field of its own.

/** A function that removes `__typename` from one selection's value. */
type Drop = (val: unknown) => unknown

/** Return `bag` without its `__typename`, applying each drop in `nested` to the field it names. */
const dropTypename = (bag: unknown, nested: Record<string, Drop> = {}): unknown => {
  if ((typeof bag !== 'object') || (bag === null) || Array.isArray(bag)) { return bag }
  const { __typename: _typename, ...fields } = bag as Record<string, unknown>
  for (const [fieldname, drop] of Object.entries(nested)) {
    if (Object.hasOwn(fields, fieldname)) { fields[fieldname] = drop(fields[fieldname]) }
  }
  return fields
}

const errDrop: Drop = (err) => dropTypename(err, { meta: dropTypename })
const thingAnswerDrop: Drop = (answer) => dropTypename(answer, { err: errDrop })
const listAnswerDrop: Drop = (answer) => dropTypename(answer, {
  err: errDrop, val: dropTypename, damaged_rows: (rows) => (Array.isArray(rows) ? rows.map((row) => dropTypename(row)) : rows),
})
const rootsAnswerDrop: Drop = (answer) => dropTypename(answer, { err: errDrop, val: dropTypename })
const statsAnswerDrop: Drop = (answer) => dropTypename(answer, { err: errDrop, val: (stats) => dropTypename(stats, { box: dropTypename, gate: dropTypename, max: dropTypename }) })
const noticeDrop: Drop = (notice) => dropTypename(notice, { err: errDrop })
// --
