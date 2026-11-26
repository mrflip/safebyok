/** The resolvers that serve `VaultSchemaSdl` over any vaultDB, each reaching only the bank of the user a request is signed in as. */

import type { GraphQLScalarType } from 'graphql'
import * as DB from 'safebyok/storage'
import type { WireAnswer, WireNotice } from './shapes/shapes-wire'
import { safebyokJson } from './vault-schema'
import * as Phrases from './phrases'

// == [Types]: VaultResolversOpts, VaultFieldArgs, VaultFieldResolver, VaultResolvers

/** Options for {@link vaultResolvers}. */
export type VaultResolversOpts<ContextT> = {
  /** The vaultDB that serves every request, such as a `PostgresVaultDB`. */
  vaultDB:   DB.VaultDB
  /** Return the `userid` your own auth signed this request in as, or null when signed out. */
  getUserId: (context: ContextT) => DB.Awaitable<DB.Userid | null>
}

/** Each root field's arguments, as GraphQL coerced them, keyed by the field's name. */
export type VaultFieldArgs = {
  safebyokGetThing:    { ask: DB.GetAsk }
  safebyokListThings:  { ask: DB.ListAsk }
  safebyokGetWorld:    { ask: DB.GetWorldAsk }
  safebyokStats:       { ask: DB.StatsAsk }
  safebyokWriteThing:  { ask: DB.WriteAsk }
  safebyokBirthBank:   { ask: DB.BirthBankAsk }
  safebyokWatchThings: { scope: DB.ThingWatchScope }
}

/** The resolver for one query or mutation field, given the standard GraphQL resolver arguments. */
export type VaultFieldResolver<ContextT, FieldnameT extends keyof VaultFieldArgs> = (parent: unknown, args: VaultFieldArgs[FieldnameT], context: ContextT) => Promise<WireAnswer>

/** The resolver map {@link vaultResolvers} returns, keyed by the type and root field names in `VaultSchemaSdl`. */
export type VaultResolvers<ContextT> = {
  SafebyokJson: GraphQLScalarType
  Query: {
    safebyokGetThing:   VaultFieldResolver<ContextT, 'safebyokGetThing'>
    safebyokListThings: VaultFieldResolver<ContextT, 'safebyokListThings'>
    safebyokGetWorld:   VaultFieldResolver<ContextT, 'safebyokGetWorld'>
    safebyokStats:      VaultFieldResolver<ContextT, 'safebyokStats'>
  }
  Mutation: {
    safebyokWriteThing: VaultFieldResolver<ContextT, 'safebyokWriteThing'>
    safebyokBirthBank:  VaultFieldResolver<ContextT, 'safebyokBirthBank'>
  }
  Subscription: {
    safebyokWatchThings: {
      subscribe: (parent: unknown, args: VaultFieldArgs['safebyokWatchThings'], context: ContextT) => Promise<AsyncIterableIterator<WireNotice>>
      resolve:   (notice: WireNotice) => WireNotice
    }
  }
}
// --

// == [Resolvers]: vaultResolvers

const vaultResolversOpts = DB.objCheck(({ custom, fn }) => ({
  vaultDB:   custom<DB.VaultDB>(DB.isVaultDB, Phrases.NotVaultDB),
  getUserId: fn<VaultResolversOpts<unknown>['getUserId']>(),
}), 'bad_record')

/** Make the resolvers for `VaultSchemaSdl`, once when your server starts.
 * A request reaches only the bank of the user it is signed in as: any other is answered `identity_revoked`. An error `getUserId` throws is left to GraphQL.
 */
export function vaultResolvers<ContextT>(opts: VaultResolversOpts<ContextT>): VaultResolvers<ContextT> {
  const { vaultDB, getUserId } = vaultResolversOpts.parse(opts)

  /** Return null if the request is signed in as `userid`, else the refusal to send back. */
  async function signinRefusalOf(context: ContextT, userid: DB.Userid): Promise<DB.VaultError | null> {
    return ((await getUserId(context)) === userid) ? null : DB.identityRevoked()
  }

  /** Answer `given` by `verb` if `checkAsk` passes it and the request is signed in as its user, in wire form; else the refusal, as a verb that threw answers. */
  async function serveSignedIn<AskT extends DB.AnyAsk>(context: ContextT, given: AskT, checkAsk: (given: unknown) => AskT, verb: (ask: AskT) => Promise<AnyAnswer>): Promise<WireAnswer> {
    // graphql-js builds an input object with a null prototype: the check's parse gives it back as plain objects, which the vaultDB's checks take.
    let ask: AskT
    try {
      ask = checkAsk(given)
    } catch (err) { return refusedAnswerOf(DB.refusalOfThrown(err)) }
    const refusal = await signinRefusalOf(context, ask.userid)
    if (refusal !== null) { return refusedAnswerOf(refusal) }
    return wireAnswerOf(await verb(ask))
  }

  /** Watch `scope` and yield its notices in wire form, for as long as the request stays signed in as its user. */
  async function watchNotices(context: ContextT, given: DB.ThingWatchScope): Promise<AsyncIterableIterator<WireNotice>> {
    const scope = DB.AskChecks.thingWatchScope.parse(given)
    const refusal = await signinRefusalOf(context, scope.userid)
    if (refusal !== null) { return endingWith(refusal) }
    const reader = openWatch(vaultDB, scope)
    const iterator: AsyncIterableIterator<WireNotice> = {
      next: async () => {
        const read = await reader.read()
        if (read.done) { return read }
        // Check the sign-in again at every notice. A session revoked after it subscribed gets one last notice carrying the
        // refusal, and the stream is cancelled, so the read after that is done. An error getUserId throws is left to
        // GraphQL, which calls no `return` after a `next` that rejects: the stream is cancelled first, so the watch ends.
        let revoked: DB.VaultError | null
        try {
          revoked = await signinRefusalOf(context, scope.userid)
        } catch (err) {
          await reader.cancel()
          throw err
        }
        if (revoked !== null) {
          await reader.cancel()
          return { done: false, value: badNoticeOf(revoked, true) }
        }
        return { done: false, value: read.value }
      },
      return: async () => {
        await reader.cancel()
        return { done: true, value: undefined }
      },
      [Symbol.asyncIterator]: () => iterator,
    }
    return iterator
  }

  return {
    SafebyokJson: safebyokJson,
    Query: {
      safebyokGetThing:   async (_parent, { ask }, context) => await serveSignedIn(context, ask, (given) => DB.AskChecks.getAsk.parse(given), async (checked) => await vaultDB.tryGetThing(checked)),
      safebyokListThings: async (_parent, { ask }, context) => await serveSignedIn(context, ask, (given) => DB.AskChecks.listAsk.parse(given), async (checked) => await vaultDB.tryListThings(checked)),
      safebyokGetWorld:   async (_parent, { ask }, context) => await serveSignedIn(context, ask, (given) => DB.AskChecks.getWorldAsk.parse(given), async (checked) => await vaultDB.tryGetWorld(checked)),
      safebyokStats:      async (_parent, { ask }, context) => await serveSignedIn(context, ask, (given) => DB.AskChecks.statsAsk.parse(given), async (checked) => await vaultDB.tryStats(checked)),
    },
    Mutation: {
      safebyokWriteThing: async (_parent, { ask }, context) => await serveSignedIn(context, ask, DB.checkedWriteAsk, async (checked) => await vaultDB.tryWriteThing(checked)),
      safebyokBirthBank:  async (_parent, { ask }, context) => await serveSignedIn(context, ask, DB.checkedBirthBankAsk, async (checked) => await vaultDB.tryBirthBank(checked)),
    },
    Subscription: {
      safebyokWatchThings: {
        subscribe: async (_parent, { scope }, context) => await watchNotices(context, scope),
        resolve:   (notice) => notice,
      },
    },
  }
}
// --

// == [Helpers]: AnyAnswer, wireAnswerOf, refusedAnswerOf, goodNoticeOf, badNoticeOf, endingWith, openWatch

/** Any vaultDB verb's answer. */
type AnyAnswer = DB.GetThingAnswer | DB.WriteThingAnswer | DB.ListThingsAnswer | DB.BirthBankAnswer | DB.GetWorldAnswer | DB.StatsAnswer

/** `answer` in wire form: less its ask, with its refusal reduced to what may cross, and null for each field the schema has and it lacks. */
function wireAnswerOf({ ask: _ask, ...answer }: AnyAnswer): WireAnswer {
  return { val: null, dbhas: null, ...answer, err: answer.ok ? null : DB.crossedErrOf(answer.err) }
}

/** The answer in wire form for an ask refused before its verb ran, as a verb that threw answers. A listing's lists are empty. */
function refusedAnswerOf(refusal: DB.VaultError): WireAnswer {
  return {
    ok: false, act: 'unclassified_storing', banktok: DB.VoidLifeTok, tracked: 'unread', read_tc: DB.readTcNow(), val: null, dbhas: null,
    err: DB.crossedErrOf(refusal), parentage: [], deltas: [], damaged_rows: [],
  }
}

/** The notice in wire form for an item event: its Thing, its bank's banktok, and when it was read. */
function goodNoticeOf({ val, banktok, read_tc }: DB.VaultItemEvent): WireNotice { return { record: val, banktok, read_tc, err: null, isEnded: false } }

/** The notice in wire form for the trouble a watch met, and whether the watch ended with it. */
function badNoticeOf(refusal: DB.VaultError, isEnded: boolean): WireNotice { return { record: null, banktok: null, read_tc: null, err: DB.crossedErrOf(refusal), isEnded } }

/** The iterator for a watch refused before it started: it yields one notice carrying the refusal, then ends. */
function endingWith(refusal: DB.VaultError): AsyncIterableIterator<WireNotice> {
  const notices = [badNoticeOf(refusal, true)].values()
  const iterator: AsyncIterableIterator<WireNotice> = {
    next:                   () => Promise.resolve(notices.next()),
    return:                 () => Promise.resolve({ done: true, value: undefined }),
    [Symbol.asyncIterator]: () => iterator,
  }
  return iterator
}

/** Start watching `scope` on `vaultDB`, and return a stream reader of its notices in wire form. Cancelling the reader stops the watch.
 * Where the watch ends itself, the stream closes after the bad news that says why.
 */
function openWatch(vaultDB: DB.VaultDB, scope: DB.ThingWatchScope): ReadableStreamDefaultReader<WireNotice> {
  // Use a reader, not the stream's own async iterator. The iterator's `return` waits for a pending `next`, which on a quiet
  // bank never resolves, so a subscriber that left would keep the watch open. A reader's `cancel` ends the pending read at once.
  let unwatch = noUnwatching
  const notices = new ReadableStream<WireNotice>({
    start: (controller) => {
      let isEnded = false
      // Enqueue every notice and bad news while the stream is open, however many are unread. Drop them once it has closed.
      const enqueue = (notice: WireNotice): void => { if ((controller.desiredSize ?? 0) > 0) { controller.enqueue(notice) } }
      // An AdapterVaultDB notifies item events alone, and only those cross.
      const onNotice = (event: DB.VaultEvent): void => { if (event.eventkind === 'item') { enqueue(goodNoticeOf(event)) } }
      const onBadNews = (news: DB.VaultError): void => {
        enqueue(badNoticeOf(news, isEnded))
        if (isEnded) { controller.close() }
      }
      unwatch = vaultDB.watch(scope, onNotice, onBadNews, () => { isEnded = true })
    },
    cancel: () => { unwatch() },
  }, { highWaterMark: Infinity })
  return notices.getReader()
}

const noUnwatching = (): void => undefined
// --
