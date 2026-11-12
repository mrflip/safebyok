import { GraphQLError, GraphQLScalarType, Kind, valueFromASTUntyped } from 'graphql'
import * as DB from 'safebyok/storage'

// == [Types]: VaultResolversOpts, VaultFieldArgs, CrossingAnswer, CrossingNotice, VaultFieldResolver, VaultResolvers

/** Options for {@link vaultResolvers}, which you call once when your server starts. */
export type VaultResolversOpts<ContextT> = {
  /** The vaultDB that serves every request, such as a `PostgresVaultDB`. */
  vaultDB:  DB.AdapterVaultDB
  /** Return the `user_id` your own auth signed this request in as, or null when signed out. */
  getUserId: (context: ContextT) => DB.Awaitable<string | null>
}

/** Each root field's arguments, as GraphQL coerced them, keyed by the field's name. */
export type VaultFieldArgs = {
  safebyokListVaults:        DB.BankScope
  safebyokGetVault:          { ask: DB.VaultGetAsk }
  safebyokListBoxes:         DB.VaultQuery
  safebyokGetBox:            { ask: DB.BoxGetAsk }
  safebyokPutVault:          { ask: DB.VaultPutAsk }
  safebyokPutBox:            { ask: DB.BoxPutAsk }
  safebyokReplacePassphrase: { record: DB.VaultRecord, opts: DB.GateVerbOpts }
  safebyokAddPasskey:        { record: DB.VaultRecord, opts: DB.GateVerbOpts }
  safebyokRevokePasskey:     { record: DB.VaultRecord, opts: DB.GateVerbOpts }
  safebyokDelBox:            { ask: DB.BoxDelAsk }
  safebyokDelVault:          { ask: DB.VaultDelAsk }
  safebyokTidyGone:          DB.BankScope
  safebyokWatch:             DB.BankScope & { vaultlabel?: string | null }
}

/** A vaultDB answer in wire form: every field of its schema type is present, and null where the answer has no value. */
export type CrossingAnswer = {
  ok:         boolean
  act:        DB.GoodAct | DB.BadAct
  val:        unknown
  world:      unknown
  dbhas:      unknown
  ask:        DB.LoggableAsk
  err:        DB.CrossedErr | null
}

/** A watch notice in wire form, or the refusal that ends the watch. */
export type CrossingNotice = {
  ok:    boolean
  act:   'gotlive' | 'gotgone' | DB.BadAct
  val:   DB.VaultRow | DB.BoxRow | null
  world: DB.VaultRow | null
  err:   DB.CrossedErr | null
}

/** The resolver for one query or mutation field, taking the standard GraphQL resolver arguments. */
export type VaultFieldResolver<ContextT, FieldnameT extends keyof VaultFieldArgs> = (
  parent: unknown, args: VaultFieldArgs[FieldnameT], context: ContextT,
) => Promise<CrossingAnswer>

/** The resolver map {@link vaultResolvers} returns, keyed by the type and root field names in `VaultSchemaSdl`. */
export type VaultResolvers<ContextT> = {
  SafebyokJson:        GraphQLScalarType
  SafebyokEpochMillis: GraphQLScalarType<number, number>
  SafebyokVaultRow:    { __resolveType: (row: DB.VaultRow) => string }
  SafebyokBoxRow:      { __resolveType: (row: DB.BoxRow) => string }
  SafebyokRow:         { __resolveType: (row: DB.VaultRow | DB.BoxRow) => string }
  Query: {
    safebyokListVaults: VaultFieldResolver<ContextT, 'safebyokListVaults'>
    safebyokGetVault:   VaultFieldResolver<ContextT, 'safebyokGetVault'>
    safebyokListBoxes:  VaultFieldResolver<ContextT, 'safebyokListBoxes'>
    safebyokGetBox:     VaultFieldResolver<ContextT, 'safebyokGetBox'>
  }
  Mutation: {
    safebyokPutVault:          VaultFieldResolver<ContextT, 'safebyokPutVault'>
    safebyokPutBox:            VaultFieldResolver<ContextT, 'safebyokPutBox'>
    safebyokReplacePassphrase: VaultFieldResolver<ContextT, 'safebyokReplacePassphrase'>
    safebyokAddPasskey:        VaultFieldResolver<ContextT, 'safebyokAddPasskey'>
    safebyokRevokePasskey:     VaultFieldResolver<ContextT, 'safebyokRevokePasskey'>
    safebyokDelBox:            VaultFieldResolver<ContextT, 'safebyokDelBox'>
    safebyokDelVault:          VaultFieldResolver<ContextT, 'safebyokDelVault'>
    safebyokTidyGone:          VaultFieldResolver<ContextT, 'safebyokTidyGone'>
  }
  Subscription: {
    safebyokWatch: {
      subscribe: (parent: unknown, args: VaultFieldArgs['safebyokWatch'], context: ContextT) => Promise<AsyncIterableIterator<CrossingNotice>>
      resolve:   (notice: CrossingNotice) => CrossingNotice
    }
  }
}
// --

// == [Resolvers]: vaultResolvers

const vaultResolversOpts = DB.objCheck(({ custom, fn }) => ({
  vaultDB:  custom<DB.AdapterVaultDB>(DB.isAdapterVaultDB, 'Expected an AdapterVaultDB from safebyok/storage'),
  getUserId: fn<VaultResolversOpts<unknown>['getUserId']>(),
}), 'bad_option')

/** Make the resolvers for `VaultSchemaSdl`. A request can reach only the bank of the user it is signed in as. */
export function vaultResolvers<ContextT>(opts: VaultResolversOpts<ContextT>): VaultResolvers<ContextT> {
  const { vaultDB, getUserId } = vaultResolversOpts.parse(opts)

  /** Return null if the request is signed in as `user_id`, else the refusal to send back. */
  async function signInRefusalOf(context: ContextT, user_id: string): Promise<DB.VaultError | null> {
    const signedIn = await DB.outcomeOf(() => getUserId(context))
    if (! signedIn.ok) { return signedIn.err }
    return (signedIn.val === user_id) ? null : DB.identityRevoked()
  }

  /** Run `verb` if the request is signed in as `user_id`, and return its answer in wire form.
   * Otherwise return a bad answer in wire form: the refusal from checking `ask` if it fails, else the sign-in refusal.
   */
  async function serveSignedIn(context: ContextT, user_id: string, ask: object, verb: () => Promise<DB.Answer<unknown, DB.GoodAct, unknown>>): Promise<CrossingAnswer> {
    const refusal = await signInRefusalOf(context, user_id)
    if (refusal === null) { return crossingOf(await verb()) }
    const loggableAsk = await DB.outcomeOf(() => DB.loggableAsk.parse(ask))
    if (! loggableAsk.ok) { return crossingOf(DB.badAnswerOf(loggableAsk.err)) }
    return crossingOf({ ok: false, err: refusal, act: 'unclassified_storing', world: null, ask: loggableAsk.val })
  }

  /** Watch `scope` and yield its notices in wire form, for as long as the request stays signed in as that user. */
  async function watchNotices(context: ContextT, scope: DB.WatchScope): Promise<AsyncIterableIterator<CrossingNotice>> {
    const refusal = await signInRefusalOf(context, scope.user_id)
    if (refusal !== null) { return endingWith(refusal) }
    // vaultDB.watch throws `bad_scope` inside the stream's `start`, and the ReadableStream constructor rethrows it.
    const watched = await DB.outcomeOf(() => openWatch(vaultDB, scope))
    if (! watched.ok) { return endingWith(watched.err) }
    const reader = watched.val
    const iterator: AsyncIterableIterator<CrossingNotice> = {
      next: async () => {
        const read = await reader.read()
        if (read.done) { return read }
        // Check the sign-in again at every notice. A session revoked after it subscribed gets one last notice
        // carrying the refusal. The stream is cancelled, so the read after that is done.
        const revoked = await signInRefusalOf(context, scope.user_id)
        if (revoked === null) { return { done: false, value: { ok: true, ...read.value, err: null } } }
        await reader.cancel()
        return { done: false, value: badNoticeOf(revoked) }
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
    SafebyokJson:        safebyokJson,
    SafebyokEpochMillis: safebyokEpochMillis,
    SafebyokVaultRow:    { __resolveType: typenameOf },
    SafebyokBoxRow:      { __resolveType: typenameOf },
    SafebyokRow:         { __resolveType: typenameOf },
    Query: {
      safebyokListVaults: async (_parent, { user_id, banklabel }, context) => {
        const ask = { op: 'list', user_id, banklabel } as const
        return await serveSignedIn(context, user_id, ask, async () => await vaultDB.tryListVaults(ask))
      },
      safebyokGetVault:   async (_parent, { ask }, context) => await serveSignedIn(context, ask.user_id, ask, async () => await vaultDB.tryGetVault(ask)),
      safebyokListBoxes:  async (_parent, { user_id, banklabel, vaultlabel, vault_tok }, context) => {
        const ask = { op: 'list', user_id, banklabel, vaultlabel, vault_tok } as const
        return await serveSignedIn(context, user_id, ask, async () => await vaultDB.tryListBoxes(ask))
      },
      safebyokGetBox:     async (_parent, { ask }, context) => await serveSignedIn(context, ask.user_id, ask, async () => await vaultDB.tryGetBox(ask)),
    },
    Mutation: {
      safebyokPutVault:          async (_parent, { ask }, context) => await serveSignedIn(context, ask.user_id, ask, async () => await vaultDB.tryPutVault(ask)),
      safebyokPutBox:            async (_parent, { ask }, context) => await serveSignedIn(context, ask.user_id, ask, async () => await vaultDB.tryPutBox(ask)),
      safebyokReplacePassphrase: async (_parent, { record, opts }, context) => await serveSignedIn(context, record.user_id, DB.gateVerbAskOf('replacePassphrase', record), async () => await vaultDB.tryReplacePassphrase(record, opts)),
      safebyokAddPasskey:        async (_parent, { record, opts }, context) => await serveSignedIn(context, record.user_id, DB.gateVerbAskOf('addPasskey', record), async () => await vaultDB.tryAddPasskey(record, opts)),
      safebyokRevokePasskey:     async (_parent, { record, opts }, context) => await serveSignedIn(context, record.user_id, DB.gateVerbAskOf('revokePasskey', record), async () => await vaultDB.tryRevokePasskey(record, opts)),
      safebyokDelBox:            async (_parent, { ask }, context) => await serveSignedIn(context, ask.user_id, ask, async () => await vaultDB.tryDelBox(ask)),
      safebyokDelVault:          async (_parent, { ask }, context) => await serveSignedIn(context, ask.user_id, ask, async () => await vaultDB.tryDelVault(ask)),
      safebyokTidyGone:          async (_parent, { user_id, banklabel }, context) => {
        const ask = { op: 'tidy_gone', user_id, banklabel } as const
        return await serveSignedIn(context, user_id, ask, async () => await vaultDB.tryTidyGone(ask))
      },
    },
    Subscription: {
      safebyokWatch: {
        // A null vaultlabel means the whole bank, the same as leaving it out.
        subscribe: async (_parent, { vaultlabel, ...bank }, context) => await watchNotices(context, (typeof vaultlabel === 'string') ? { ...bank, vaultlabel } : bank),
        resolve:   (notice) => notice,
      },
    },
  }
}
// --

// == [Scalars]: safebyokJson, safebyokEpochMillis

/** `SafebyokJson`: any JSON value, passed through unchanged. The vaultDB at each end validates it. */
const safebyokJson = new GraphQLScalarType({
  name:               'SafebyokJson',
  coerceOutputValue:  (val) => val,
  coerceInputValue:   (val) => val,
  coerceInputLiteral: (ast) => valueFromASTUntyped(ast),
})

/** Return `val` if it is a safe integer, else throw a GraphQLError. */
const epochMillisOf = (val: unknown): number => {
  if (Number.isSafeInteger(val)) { return val as number }
  throw new GraphQLError('SafebyokEpochMillis is a time in integer UTC epoch milliseconds')
}

/** `SafebyokEpochMillis`: a time in integer UTC epoch milliseconds. GraphQL's own Int is 32-bit, too small for one. */
const safebyokEpochMillis = new GraphQLScalarType<number, number>({
  name:               'SafebyokEpochMillis',
  coerceOutputValue:  epochMillisOf,
  coerceInputValue:   epochMillisOf,
  coerceInputLiteral: (ast) => epochMillisOf((ast.kind === Kind.INT) ? Number(ast.value) : undefined),
})
// --

// == [Helpers]: crossingOf, crossedErrOf, badNoticeOf, endingWith, openWatch, typenameOf

/** Convert `answer` to wire form. */
function crossingOf(answer: DB.Answer<unknown, DB.GoodAct, unknown>): CrossingAnswer {
  return {
    ok:         answer.ok,
    act:        answer.act,
    val:        answer.ok ? answer.val : null,
    world:      answer.world,
    dbhas:      answer.dbhas ?? null,
    ask:        answer.ask,
    err:        answer.ok ? null : crossedErrOf(answer.err),
  }
}

/** Convert a refusal to wire form. Its `cause` is never sent. */
function crossedErrOf({ refusalkind, message, meta }: DB.VaultError): DB.CrossedErr {
  // Parse the capacity before sending it: JSON cannot carry Infinity, so the check turns an infinite limit into the largest safe integer.
  const capacity = DB.capacity.safeParse(meta?.capacity)
  return {
    refusalkind,
    message,
    meta: {
      capacity:   capacity.success ? capacity.data : null,
      fieldnames: (meta?.fieldnames === undefined) ? null : [...meta.fieldnames],
      oplabel:    meta?.oplabel ?? null,
    },
  }
}

/** Make the notice that ends a watch, carrying `refusal`. */
function badNoticeOf(refusal: DB.VaultError): CrossingNotice { return { ok: false, act: 'unclassified_storing', val: null, world: null, err: crossedErrOf(refusal) } }

/** Make the iterator for a watch refused before it started: it yields one notice carrying the refusal, then ends. */
function endingWith(refusal: DB.VaultError): AsyncIterableIterator<CrossingNotice> {
  const notices = [badNoticeOf(refusal)].values()
  const iterator: AsyncIterableIterator<CrossingNotice> = {
    next:                  () => Promise.resolve(notices.next()),
    return:                () => Promise.resolve({ done: true, value: undefined }),
    [Symbol.asyncIterator]: () => iterator,
  }
  return iterator
}

/** Start watching `scope` on `vaultDB` and return a stream reader. Cancelling the reader stops the watch. */
function openWatch(vaultDB: DB.AdapterVaultDB, scope: DB.WatchScope): ReadableStreamDefaultReader<DB.Notice> {
  // Use a reader, not the stream's own async iterator. The iterator's `return` waits for a pending
  // `next`, which on a quiet bank never resolves, so a subscriber that left would keep the watch
  // open. A reader's `cancel` ends the pending read immediately.
  let unwatch = noUnwatching
  const notices = new ReadableStream<DB.Notice>({
    start: (controller) => {
      unwatch = vaultDB.watch(scope, (notice) => {
        // Enqueue every notice while the stream is open, however many are unread. Drop notices once it has closed.
        if ((controller.desiredSize ?? 0) > 0) { controller.enqueue(notice) }
      })
    },
    cancel: () => { unwatch() },
  }, { highWaterMark: Infinity })
  return notices.getReader()
}

const noUnwatching = (): void => undefined

/** The schema typename for a row: `SafebyokVaultRecord`, `SafebyokVaultTombstone`, `SafebyokBoxRecord` or `SafebyokBoxTombstone`. */
const typenameOf = (row: DB.VaultRow | DB.BoxRow): string => {
  const thing = ('boxlabel' in row) ? 'Box' : 'Vault'
  return `Safebyok${thing}${(row.am === 'x') ? 'Tombstone' : 'Record'}`
}
// --
