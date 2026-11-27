/** A browser-side vaultDB that sends each verb to your GraphQL server, where `vaultResolvers` answers it from the server's own vaultDB.
 *
 * A verb answers here as the server's vaultDB answered it. Where the trouble lies decides the bad answer you get:
 * - The server's vaultDB refused, or its datastore failed: the bad answer it gave, whatever its kind.
 * - The server could not serve the request, as when its `getUserId` throws: the VaultError `getUserId` threw, or else `unexpected_error`. A watch ends with it.
 * - The request broke this package's rules, as a watch scope that fails its check (only another client sends one): the rule's refusal, `bad_record`.
 * - GraphQL itself failed, as when the server serves another schema: `unexpected_error`, without the server's error text. A request that fails in the network gets `storage_unavailable`.
 * - The server answered what no vaultDB answers, or a Thing where the ask reaches none: `storage_issue`.
 */

import type { AnyVariables, Client, CombinedError, OperationResult } from '@urql/core'
import * as DB from 'safebyok/storage'
import { type AnyAnswer, type CheckedAnswer, type CheckedNotice, CrossedErrExtension, WireChecks, checkGotAt, checkListedAt, checkRootsAt, checkStatsAt, checkWatchedAt } from './shapes/shapes-wire'
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
 * Each verb checks its ask before sending it, and answers what the server's vaultDB answered, once it is checked by its form and by where its Things sit.
 */
export class GraphQLVaultDB implements DB.VaultDB {
  // == [Props]: #client

  readonly #client: GraphQLVaultClient
  // --

  // == [Construction]: constructor

  constructor(opts: GraphQLVaultDBOpts) {
    const { client } = graphQLVaultDBOpts.parse(opts)
    this.#client = client
  }
  // --

  // == [Verbs]: tryGetThing, tryWriteThing, tryListThings, tryBirthBank, tryGetWorld, tryStats
  // Each checks its ask, sends it, checks the answer that crosses back by its form and then by its scopes, and answers it:
  // as its own verb's answer, the only one its form check lets through. Every throw in it lands in `answerForThrown`.

  /** The Thing at `ask`'s scope ({@link DB.VaultDB.tryGetThing}). */
  async tryGetThing(ask: DB.GetAsk): Promise<DB.GetThingAnswer> {
    try {
      const thingGetAsk = DB.AskChecks.getAsk.parse(ask)
      const crossed     = WireChecks.getAnswer.parse(thingAnswerDrop(await this.#runQuery(VaultOperations.getThing, 'safebyokGetThing', { ask: thingGetAsk })))
      checkGotAt(thingGetAsk, crossed)
      return answerOf(thingGetAsk, crossed) as DB.GetThingAnswer
    } catch (err) { return answerForThrown(err, 'getThing', ask) }
  }

  /** Write `ask.record` over the Thing `ask.cited` ({@link DB.VaultDB.tryWriteThing}). */
  async tryWriteThing(ask: DB.WriteAsk): Promise<DB.WriteThingAnswer> {
    try {
      const writeAsk = DB.checkedWriteAsk(ask)
      const crossed  = WireChecks.writeAnswer.parse(thingAnswerDrop(await this.#runMutation(VaultOperations.writeThing, 'safebyokWriteThing', { ask: writeAsk })))
      checkGotAt(writeAsk, crossed)
      return answerOf(writeAsk, crossed) as DB.WriteThingAnswer
    } catch (err) { return answerForThrown(err, 'writeThing', ask) }
  }

  /** The children of the Thing at `ask`'s scope ({@link DB.VaultDB.tryListThings}). */
  async tryListThings(ask: DB.ListAsk): Promise<DB.ListThingsAnswer> {
    try {
      const listAsk = DB.AskChecks.listAsk.parse(ask)
      const crossed = WireChecks.listAnswer.parse(listAnswerDrop(await this.#runQuery(VaultOperations.listThings, 'safebyokListThings', { ask: listAsk })))
      checkListedAt(listAsk, crossed)
      return answerOf(listAsk, crossed) as DB.ListThingsAnswer
    } catch (err) { return { ...answerForThrown(err, 'listThings', ask), parentage: [], deltas: [], incompatible_rows: [] } }
  }

  /** Write a new bank's three roots, or answer the actual roots of a bank already live ({@link DB.VaultDB.tryBirthBank}). */
  async tryBirthBank(ask: DB.BirthBankAsk): Promise<DB.BirthBankAnswer> {
    try {
      const birthBankAsk = DB.checkedBirthBankAsk(ask)
      const crossed      = WireChecks.birthAnswer.parse(rootsAnswerDrop(await this.#runMutation(VaultOperations.birthBank, 'safebyokBirthBank', { ask: birthBankAsk })))
      checkRootsAt(birthBankAsk, crossed)
      return answerOf(birthBankAsk, crossed) as DB.BirthBankAnswer
    } catch (err) { return answerForThrown(err, 'birthBank', ask) }
  }

  /** The bank's three roots, read in one step ({@link DB.VaultDB.tryGetWorld}). */
  async tryGetWorld(ask: DB.GetWorldAsk): Promise<DB.GetWorldAnswer> {
    try {
      const worldAsk = DB.AskChecks.getWorldAsk.parse(ask)
      const crossed  = WireChecks.worldAnswer.parse(rootsAnswerDrop(await this.#runQuery(VaultOperations.getWorld, 'safebyokGetWorld', { ask: worldAsk })))
      checkRootsAt(worldAsk, crossed)
      return answerOf(worldAsk, crossed) as DB.GetWorldAnswer
    } catch (err) { return answerForThrown(err, 'getWorld', ask) }
  }

  /** The bank's storage stats, read in one step ({@link DB.VaultDB.tryStats}). */
  async tryStats(ask: DB.StatsAsk): Promise<DB.StatsAnswer> {
    try {
      const statsAsk = DB.AskChecks.statsAsk.parse(ask)
      const crossed  = WireChecks.statsAnswer.parse(statsAnswerDrop(await this.#runQuery(VaultOperations.stats, 'safebyokStats', { ask: statsAsk })))
      checkStatsAt(statsAsk, crossed)
      return answerOf(statsAsk, crossed) as DB.StatsAnswer
    } catch (err) { return answerForThrown(err, 'stats', ask) }
  }
  // --

  // == [Watch]: watch

  /** Watch a bank's Things on the server ({@link DB.VaultDB.watch}): each notice is of a Thing the server's vaultDB notified, read when it says.
   * A notice that fails its check, or is of a Thing in another bank, goes to `onBadNews` instead of `onNotice`, as does an error `onNotice` throws.
   * The watch ends, once, at the notice the server marks as its last, or when the server ends the stream or the request fails; it never resubscribes.
   */
  watch(scope: DB.ThingWatchScope, onNotice: (event: DB.VaultEvent) => void, onBadNews: (news: DB.VaultError) => void, onEnded: () => void = noEnding): () => void {
    const { scope: bankScope } = DB.AskChecks.watchArgs.parse({ scope, onNotice, onBadNews, onEnded })
    const watching: { isOn: boolean, subscription?: { unsubscribe: () => void } } = { isOn: true }
    let heardData: unknown
    // A notice handler that throws is a bug in the host's code, not trouble in storage.
    const notify = DB.bulletproofHandlerOf(onNotice, { ifError: 'tell', transformer: DB.refusalOfThrown, onBadNews })
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
    watching.subscription = this.#client.subscription(VaultOperations.watchThings, { scope: bankScope }).subscribe((result) => {
      if (! watching.isOn) { return }
      if (result.error !== undefined) {
        end(troubleOf(result.error))
        return
      }
      // When a stream over fetch closes, its final result repeats the previous notice. Do not hear it twice.
      const isHeard = (result.data === heardData)
      heardData = result.data
      const ending = isHeard ? null : hearNotice(bankScope, result, notify, onBadNews)
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

// == [Answers]: answerOf, answerForThrown, noEnding, fieldOf, troubleOf, carriedErrOf, hearNotice

// A record crosses checked for its scope and citation alone, and is typed here as the answer has it: whoever reads it
// checks the rest where a Thing takes it, as for an answer from any vaultDB.
/** The answer to `ask` that `crossed` carries: its refusal made a VaultError again, naming the Thing its `dbhas` gives, and without each field the answer lacks.
 * Its ask is the loggable part of `ask`, and every record it carries is deeply frozen.
 */
function answerOf(ask: DB.AnyAsk, crossed: CheckedAnswer): AnyAnswer {
  const loggableAsk = DB.loggableAskOf(ask)
  if (crossed.ok) {
    const { val, dbhas, err: _err, ...beside } = crossed
    return DB.frozenAnswerOf((dbhas === null) ? { ...beside, ask: loggableAsk, val } : { ...beside, ask: loggableAsk, val, dbhas }) as unknown as AnyAnswer
  }
  const { val: _val, err, ...beside } = crossed
  const refusal = DB.refusedOverWire(err, { act: crossed.act, dbhas: crossed.dbhas as DB.ThingRecord | DB.VoidSentinel | null })
  Object.assign(refusal, { meta: { ...refusal.meta, ask: loggableAsk } })
  return DB.frozenAnswerOf({ ...beside, ask: loggableAsk, err: refusal }) as unknown as AnyAnswer
}

// Every throw in a verb lands here: an ask that fails its check, a server out of reach, or an answer that fails its own.
/** The refused answer for a verb that threw, as an `AdapterVaultDB`'s is: its refusal, or `storage_unavailable` for anything else, its meta naming `oplabel` and the loggable ask.
 * Its act is the one in the refusal's meta, else `unclassified_storing`. It names no Thing.
 */
function answerForThrown(thrown: unknown, oplabel: string, ask: unknown): DB.BadAnswer<null> {
  const err         = DB.storageRefusalOf(thrown)
  const loggableAsk = DB.loggableAskOf(ask)
  Object.assign(err, { meta: { ...err.meta, oplabel, ask: loggableAsk } })
  return { ok: false, ask: loggableAsk, act: err.meta?.act ?? 'unclassified_storing', banktok: DB.VoidLifeTok, tracked: 'unread', read_tc: DB.readTcNow(), dbhas: null, err }
}

/** The `onEnded` of a watch given none. */
const noEnding = (): void => undefined

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

/** Pass a notice's Thing to `onNotice` and its trouble to `onBadNews`, or return the trouble that ends the watch. */
function hearNotice(scope: DB.ThingWatchScope, { data }: OperationResult<unknown>, notify: (event: DB.VaultEvent) => void, onBadNews: (news: DB.VaultError) => void): DB.VaultError | null {
  const fields = ((typeof data === 'object') && (data !== null)) ? data as Record<string, unknown> : {}
  let notice: CheckedNotice
  try {
    notice = WireChecks.notice.parse(noticeDrop(fields['safebyokWatchThings']))
    checkWatchedAt(scope, notice)
  } catch (err) {
    onBadNews(DB.refusalOfThrown(err))
    return null
  }
  if (notice.err === null) {
    // Checked for its scope and citation alone, as an answer's records are (`answerOf`).
    notify(DB.noticeOf(notice.record as DB.ThingRecord, notice.banktok, notice.read_tc))
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
  err: errDrop, val: dropTypename, incompatible_rows: (rows) => (Array.isArray(rows) ? rows.map((row) => dropTypename(row)) : rows),
})
const rootsAnswerDrop: Drop = (answer) => dropTypename(answer, { err: errDrop, val: dropTypename })
const statsAnswerDrop: Drop = (answer) => dropTypename(answer, { err: errDrop, val: (stats) => dropTypename(stats, { box: dropTypename, gate: dropTypename, max: dropTypename }) })
const noticeDrop: Drop = (notice) => dropTypename(notice, { err: errDrop })
// --
