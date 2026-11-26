/** A browser-side vaultDB that sends each verb to your GraphQL server, where `vaultResolvers` answers it from the server's own vaultDB.
 *
 * A verb answers here as the server's vaultDB answered it. Where the trouble lies decides the bad answer you get:
 * - The server's vaultDB refused, or its datastore failed: the bad answer it gave, whatever its kind.
 * - The server could not serve the request, as when its `getUserId` throws: the VaultError `getUserId` threw, or else `unexpected_error`. A watch ends with it.
 * - The request broke this package's rules, as a watch scope that fails its check (only another client sends one): the rule's refusal, `bad_record`.
 * - GraphQL itself failed, as when the server serves another schema: `unexpected_error`, without the server's error text. A request that fails in the network gets `storage_unavailable`.
 * - The server's answer disagrees with what it carries, as a server of another version's may: `storage_issue`, as from a broken datastore. A refusal whose act alone disagrees answers the act this vaultDB finds for the Thing it carries.
 */

import type { AnyVariables, Client, CombinedError, OperationResult } from '@urql/core'
import * as DB from 'safebyok/storage'
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
 * The server answers from its own vaultDB, and this one checks what the answer carries against the ask, as it checks a datastore's manifest.
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
  // To this vaultDB the server is its datastore. Each verb sends its ask, and hands back as its manifest what the server
  // answered: the rows the answer carries, and the tags the server's act names, or where an act names no tags of its own,
  // those made of the rows as a datastore makes them. A refusal the server's verb threw is thrown again here, so it answers
  // as it did there.

  /** Get the Thing at the ask's scope from the server. */
  protected async doGetThing(ask: DB.GetAsk): Promise<DB.GetManifest> {
    const answer = WireChecks.gotAnswer.parse(thingAnswerDrop(await this.#runQuery(VaultOperations.getThing, 'safebyokGetThing', { ask })))
    if (! answer.ok) { throwIfThrown(answer) }
    const carried = (answer.act === 'gotlive') ? answer.val : answer.dbhas
    return { tags: presenceTagsOf(answer.act), ...rowsOfCarried(ask, carried), ...observedOf(answer) }
  }

  // A written write's tags are those its ask alone makes; an unwritten one's ante row is the row the server carried.
  /** Write the ask's record on the server. */
  protected async doWriteThing(ask: DB.WriteAsk): Promise<DB.WriteManifest> {
    const answer = WireChecks.wroteAnswer.parse(thingAnswerDrop(await this.#runMutation(VaultOperations.writeThing, 'safebyokWriteThing', { ask })))
    if (! answer.ok) { throwIfThrown(answer) }
    const rows = rowsOfCarried(ask, answer.ok ? answer.val : answer.dbhas)
    const tags = DB.isWriteAct(answer.act) ? DB.ManifestTags.writtenTagsOf(ask) : DB.ManifestTags.writeTagsOf(ask, rows.actual, false)
    return { tags, ...rows, ...observedOf(answer) }
  }

  // The children of a listing the server refused are never read, so none are handed back. A child the server could not
  // read crosses as its scope alone, which fails every kind's checks, so this vaultDB answers it as incompatible again.
  /** List the children of the live Thing at the ask's scope from the server. */
  protected async doListThings(ask: DB.ListAsk): Promise<DB.ListManifest> {
    const answer = WireChecks.listAnswer.parse(listAnswerDrop(await this.#runQuery(VaultOperations.listThings, 'safebyokListThings', { ask })))
    if (! answer.ok) {
      throwIfThrown(answer)
      return { tags: presenceTagsOf(answer.act), actual: rowOf(answer.dbhas), children: [], ...observedOf(answer) }
    }
    const children = [...answer.deltas, ...answer.incompatible_rows].map((raw) => ({ labelpath: DB.ManifestTags.fieldOf(raw, 'labelpath'), raw }))
    return { tags: presenceTagsOf(answer.act), actual: answer.parentage[0], children, ...observedOf(answer) }
  }

  // A birth writes only where it read none of the three roots.
  /** Write a new bank's three roots on the server. */
  protected async doBirthBank(ask: DB.BirthBankAsk, puts: DB.BirthPuts): Promise<DB.BirthManifest> {
    const answer = WireChecks.rootsAnswer.parse(rootsAnswerDrop(await this.#runMutation(VaultOperations.birthBank, 'safebyokBirthBank', { ask })))
    if (! answer.ok) {
      throwIfThrown(answer)
      const named = namedRootsOf(answer.dbhas)
      return { tags: DB.ManifestTags.birthTagsOf(puts, named, false), actual: named, ...observedOf(answer) }
    }
    const actual    = rootRowsOf(answer.val)
    const isWritten = DB.isWriteAct(answer.act)
    return { tags: DB.ManifestTags.birthTagsOf(puts, isWritten ? NoRoots : actual, isWritten), actual, ...observedOf(answer) }
  }

  /** Get the bank's three roots from the server. */
  protected async doGetWorld(ask: DB.GetWorldAsk): Promise<DB.WorldManifest> {
    const answer = WireChecks.worldAnswer.parse(rootsAnswerDrop(await this.#runQuery(VaultOperations.getWorld, 'safebyokGetWorld', { ask })))
    if (! answer.ok) {
      throwIfThrown(answer)
      throw DB.storageIssue()
    }
    return { actual: rootRowsOf(answer.val), ...observedOf(answer) }
  }

  /** Get the bank's storage stats from the server. */
  protected async doStats(ask: DB.StatsAsk): Promise<DB.StatsManifest> {
    const answer = WireChecks.statsAnswer.parse(statsAnswerDrop(await this.#runQuery(VaultOperations.stats, 'safebyokStats', { ask })))
    if (! answer.ok) {
      throwIfThrown(answer)
      throw DB.storageIssue()
    }
    return { stats: answer.val, ...observedOf(answer) }
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

// == [Answers]: CheckedAnswer, RefusedAnswer, PresenceOfAct, NoRoots, observedOf, presenceTagsOf, isShell, rowOf, rowsOfCarried, ancestorLivesOf, rootRowsOf, namedRootsOf, throwIfThrown, fieldOf, troubleOf, carriedErrOf, hearNotice

/** What every answer carries, as its check read it. */
type CheckedAnswer = Readonly<{ act: string, banktok: unknown, tracked: unknown, read_tc: unknown }>

/** A refused answer, as its check read it. */
type RefusedAnswer = CheckedAnswer & Readonly<{ ok: false, act: DB.CrossedAct, err: DB.CrossedErr }>

/** The presence of the row a get's or a listing's act names. Any other act names none, and its tags refuse. */
const PresenceOfAct: Readonly<Partial<Record<string, DB.Presence>>> = { gotlive: 'live', gotgone: 'gone', gotvoid: 'void', gone: 'gone', void: 'void' }

/** A bank's three roots where none is stored. */
const NoRoots: DB.RootRows = { bank: null, gate: null, root: null }

/** What a manifest observes of the bank, as `answer` carries it: its banktok, its tracked and its read_tc. */
function observedOf({ banktok, tracked, read_tc }: CheckedAnswer): DB.BankObserved { return { banktok, tracked, read_tc } }

// An act that names no presence leaves it undefined, and AdapterVaultDB's check of the tags refuses them.
/** A get's or a listing's tags: the presence its act names. */
function presenceTagsOf(act: string): DB.GetTags { return { presence: PresenceOfAct[act] } as DB.GetTags }

/** True when `carried` is the shell, the void sentinel, which stands for no row: told by its revseq. */
function isShell(carried: unknown): boolean { return DB.ManifestTags.fieldOf(carried, 'revseq') === DB.Shell.Cited.revseq }

/** The row `carried` stands for: itself, or null where it is the shell. */
function rowOf(carried: unknown): unknown { return isShell(carried) ? null : carried }

// The shell names the lives above its scope, which are all of an ancestor that the shell is built from.
/** What `carried`, a Thing an answer carries at `ask`'s scope, stands for: the row itself; or where it is the shell, no row, and the ancestor's lives it names. */
function rowsOfCarried(ask: DB.ThingScope, carried: unknown): Pick<DB.GetManifest, 'actual' | 'ancestor'> {
  if (! isShell(carried)) { return { actual: carried, ancestor: null } }
  return { actual: null, ancestor: ancestorLivesOf(ask, WireChecks.shell.parse(carried)) }
}

/** The lives of the nearest Thing stored above `ask`'s scope, as `shell` names them: the stored lifeseqs of its lifepath, under as many labels of the ask's labelpath. Null for none. */
function ancestorLivesOf({ userid, banklabel, labelpath }: DB.ThingScope, shell: DB.VoidSentinel): DB.AncestorLives | null {
  const lifeseqs = shell.lifepath.split('/').filter((lifeseq) => lifeseq !== DB.Shell.VoidLifeseq)
  if (lifeseqs.length === 0) { return null }
  return { userid, banklabel, labelpath: labelpath.split('/').slice(0, lifeseqs.length).join('/'), lifepath: lifeseqs.join('/') }
}

/** The rows of a bank's three roots as an answer carries them, raw: each null where it is the shell. */
function rootRowsOf(roots: unknown): DB.RootRows {
  const rootOf = (rootckey: keyof DB.RootRows): unknown => rowOf(DB.ManifestTags.fieldOf(roots, rootckey))
  return { bank: rootOf('bank'), gate: rootOf('gate'), root: rootOf('root') }
}

// The roots before the one a refusal names held nothing, or that root's put would have passed or refused first; the roots after it are not read.
/** A refused birth's roots: the root `dbhas` names, at its labelpath, and none at the others. */
function namedRootsOf(dbhas: unknown): DB.RootRows {
  const named  = rowOf(dbhas)
  const rootOf = (rootckey: keyof DB.RootRows): unknown => ((DB.ManifestTags.fieldOf(named, 'labelpath') === DB.RootLabelpaths[rootckey]) ? named : null)
  return { bank: rootOf('bank'), gate: rootOf('gate'), root: rootOf('root') }
}

// The server answers `tracked: 'unread'` for a verb that threw, and for no other answer.
/** Rethrow the refusal of a server verb that threw, with its act. */
function throwIfThrown({ act, tracked, err }: RefusedAnswer): void {
  if (tracked === 'unread') { throw DB.refusedOverWire(err, { act }) }
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

/** Pass a notice's Thing to `receive` and its trouble to `onBadNews`, or return the trouble that ends the watch. */
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
  err: errDrop, incompatible_rows: (rows) => (Array.isArray(rows) ? rows.map((row) => dropTypename(row)) : rows),
})
const rootsAnswerDrop: Drop = (answer) => dropTypename(answer, { err: errDrop, val: dropTypename })
const statsAnswerDrop: Drop = (answer) => dropTypename(answer, { err: errDrop, val: (stats) => dropTypename(stats, { box: dropTypename, gate: dropTypename, max: dropTypename }) })
const noticeDrop: Drop = (notice) => dropTypename(notice, { err: errDrop })
// --
