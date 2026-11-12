import { GraphQLError, GraphQLScalarType, Kind, valueFromASTUntyped } from 'graphql'
import * as DB from 'safebyok/storage'
import { BX } from 'safebyok/storage'

// == [Types]: BankResolversOpts, BankFieldArgs, CrossingAnswer, CrossingNotice, BankFieldResolver, BankResolvers

/** Options for {@link bankResolvers}, which you call once when your server starts. */
export type BankResolversOpts<ContextT> = {
  /** The bankDB that serves every request, such as a `PostgresBankDB`. */
  bankDB:    DB.AdapterBankDB
  /** Return the `user_id` your own auth signed this request in as, or null when signed out. */
  getUserId: (context: ContextT) => DB.Awaitable<string | null>
}

/** Each root field's arguments, as GraphQL coerced them, keyed by the field's name. */
export type BankFieldArgs = {
  safebyokEnsureBank:        DB.BankScope
  safebyokGetVault:          { ask: BX.VaultGetAsk }
  safebyokListBoxes:         Omit<BX.BoxListAsk, 'op'>
  safebyokGetBox:            { ask: BX.BoxGetAsk }
  safebyokBuildBank:         { ask: BX.BankBuildAsk }
  safebyokReplacePassphrase: { ask: BX.GateVerbAsk }
  safebyokAddPasskey:        { ask: BX.GateVerbAsk }
  safebyokRevokePasskey:     { ask: BX.GateVerbAsk }
  safebyokDelBank:           { ask: BX.BankDelAsk }
  safebyokPutVault:          { ask: BX.VaultPutAsk }
  safebyokDelVault:          { ask: BX.VaultDelAsk }
  safebyokPutBox:            { ask: BX.BoxPutAsk }
  safebyokDelBox:            { ask: BX.BoxDelAsk }
  safebyokTidyGone:          DB.BankScope
  safebyokWatch:             DB.BankScope & { vaultlabel?: string | null }
}

/** A bankDB answer in wire form: every field of its schema type is present, and null where the answer has no value. */
export type CrossingAnswer = {
  ok:     boolean
  act:    DB.GoodAct | DB.BankBadAct
  val:    unknown
  parent: unknown
  dbhas:  unknown
  ask:    BX.LoggableAsk
  err:    DB.CrossedErr | null
}

/** A watch notice in wire form, or the refusal that ends the watch. */
export type CrossingNotice = {
  ok:     boolean
  act:    'gotlive' | 'gotgone' | DB.BankBadAct
  val:    BX.BankRow | BX.GateRecord | BX.VaultRow | BX.BoxRow | null
  parent: BX.BankRow | BX.VaultRow | null
  err:    DB.CrossedErr | null
}

/** The resolver for one query or mutation field, taking the standard GraphQL resolver arguments. */
export type BankFieldResolver<ContextT, FieldnameT extends keyof BankFieldArgs> = (
  parent: unknown, args: BankFieldArgs[FieldnameT], context: ContextT,
) => Promise<CrossingAnswer>

/** The resolver map {@link bankResolvers} returns, keyed by the type and root field names in `BankSchemaSdl`. */
export type BankResolvers<ContextT> = {
  SafebyokJson:        GraphQLScalarType
  SafebyokEpochMillis: GraphQLScalarType<number, number>
  SafebyokBoxRow:      { __resolveType: (row: BX.BoxRow) => string }
  SafebyokParentRow:   { __resolveType: (row: BX.BankRow | BX.VaultRow) => string }
  SafebyokRow:         { __resolveType: (row: NoticedRow) => string }
  Query: {
    safebyokEnsureBank: BankFieldResolver<ContextT, 'safebyokEnsureBank'>
    safebyokGetVault:   BankFieldResolver<ContextT, 'safebyokGetVault'>
    safebyokListBoxes:  BankFieldResolver<ContextT, 'safebyokListBoxes'>
    safebyokGetBox:     BankFieldResolver<ContextT, 'safebyokGetBox'>
  }
  Mutation: {
    safebyokBuildBank:         BankFieldResolver<ContextT, 'safebyokBuildBank'>
    safebyokReplacePassphrase: BankFieldResolver<ContextT, 'safebyokReplacePassphrase'>
    safebyokAddPasskey:        BankFieldResolver<ContextT, 'safebyokAddPasskey'>
    safebyokRevokePasskey:     BankFieldResolver<ContextT, 'safebyokRevokePasskey'>
    safebyokDelBank:           BankFieldResolver<ContextT, 'safebyokDelBank'>
    safebyokPutVault:          BankFieldResolver<ContextT, 'safebyokPutVault'>
    safebyokDelVault:          BankFieldResolver<ContextT, 'safebyokDelVault'>
    safebyokPutBox:            BankFieldResolver<ContextT, 'safebyokPutBox'>
    safebyokDelBox:            BankFieldResolver<ContextT, 'safebyokDelBox'>
    safebyokTidyGone:          BankFieldResolver<ContextT, 'safebyokTidyGone'>
  }
  Subscription: {
    safebyokWatch: {
      subscribe: (parent: unknown, args: BankFieldArgs['safebyokWatch'], context: ContextT) => Promise<AsyncIterableIterator<CrossingNotice>>
      resolve:   (notice: CrossingNotice) => CrossingNotice
    }
  }
}

/** A row a watch hears: a bank, gate, vault or box row. */
type NoticedRow = BX.BankRow | BX.GateRecord | BX.VaultRow | BX.BoxRow
// --

// == [Resolvers]: bankResolvers

const bankResolversOpts = DB.objCheck(({ custom, fn }) => ({
  bankDB:    custom<DB.AdapterBankDB>(DB.isAdapterBankDB, 'Expected an AdapterBankDB from safebyok/storage'),
  getUserId: fn<BankResolversOpts<unknown>['getUserId']>(),
}), 'bad_option')

/** Make the resolvers for `BankSchemaSdl`. A request can reach only the bank of the user it is signed in as. */
export function bankResolvers<ContextT>(opts: BankResolversOpts<ContextT>): BankResolvers<ContextT> {
  const { bankDB, getUserId } = bankResolversOpts.parse(opts)

  /** Return null if the request is signed in as `user_id`, else the refusal to send back. */
  async function signInRefusalOf(context: ContextT, user_id: string): Promise<DB.VaultError | null> {
    const signedIn = await DB.outcomeOf(() => getUserId(context))
    if (! signedIn.ok) { return signedIn.err }
    return (signedIn.val === user_id) ? null : DB.identityRevoked()
  }

  /** Run `verb` if the request is signed in as `user_id`, and return its answer in wire form.
   * Otherwise return a bad answer in wire form: the refusal from checking `ask` if it fails, else the sign-in refusal.
   */
  async function serveSignedIn(context: ContextT, user_id: string, ask: object, verb: () => Promise<BX.Answer<unknown, DB.GoodAct, unknown>>): Promise<CrossingAnswer> {
    const refusal = await signInRefusalOf(context, user_id)
    if (refusal === null) { return crossingOf(await verb()) }
    const loggableAsk = await DB.outcomeOf(() => BX.loggableAsk.parse(ask))
    if (! loggableAsk.ok) { return crossingOf(BX.badAnswerOf(loggableAsk.err)) }
    return crossingOf({ ok: false, err: refusal, act: 'unclassified_storing', parent: null, ask: loggableAsk.val })
  }

  /** Watch `scope` and yield its notices in wire form, for as long as the request stays signed in as that user. */
  async function watchNotices(context: ContextT, scope: DB.WatchScope): Promise<AsyncIterableIterator<CrossingNotice>> {
    const refusal = await signInRefusalOf(context, scope.user_id)
    if (refusal !== null) { return endingWith(refusal) }
    // bankDB.watch throws `bad_scope` inside the stream's `start`, and the ReadableStream constructor rethrows it.
    const watched = await DB.outcomeOf(() => openWatch(bankDB, scope))
    if (! watched.ok) { return endingWith(watched.err) }
    const reader = watched.val
    const iterator: AsyncIterableIterator<CrossingNotice> = {
      next: async () => {
        const read = await reader.read()
        if (read.done) { return read }
        // Check the sign-in again at every notice. A session revoked after it subscribed gets one last notice
        // carrying the refusal. The stream is cancelled, so the read after that is done.
        const revoked = await signInRefusalOf(context, scope.user_id)
        // A GraphQL union cannot hold the string `main`: a bank row's notice crosses with a null parent, and the client restores it.
        const { parent } = read.value
        if (revoked === null) { return { done: false, value: { ok: true, ...read.value, parent: (parent === BX.BankTop) ? null : parent, err: null } } }
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
    SafebyokBoxRow:      { __resolveType: typenameOf },
    SafebyokParentRow:   { __resolveType: typenameOf },
    SafebyokRow:         { __resolveType: typenameOf },
    Query: {
      safebyokEnsureBank: async (_parent, { user_id, banklabel }, context) => {
        const ask = { op: 'ensure', user_id, banklabel, gates: ['main'] } as const satisfies BX.BankEnsureAsk
        return await serveSignedIn(context, user_id, ask, async () => await bankDB.tryEnsureBank(ask))
      },
      safebyokGetVault:   async (_parent, { ask }, context) => await serveSignedIn(context, ask.user_id, ask, async () => await bankDB.tryGetVault(ask)),
      safebyokListBoxes:  async (_parent, { user_id, banklabel, vaultlabel, bank_tok, vault_tok }, context) => {
        const ask = { op: 'list', user_id, banklabel, vaultlabel, bank_tok, vault_tok } as const
        return await serveSignedIn(context, user_id, ask, async () => await bankDB.tryListBoxes(ask))
      },
      safebyokGetBox:     async (_parent, { ask }, context) => await serveSignedIn(context, ask.user_id, ask, async () => await bankDB.tryGetBox(ask)),
    },
    Mutation: {
      safebyokBuildBank:         async (_parent, { ask }, context) => await serveSignedIn(context, ask.user_id, ask, async () => await bankDB.tryBuildBank(ask)),
      safebyokReplacePassphrase: async (_parent, { ask }, context) => await serveSignedIn(context, ask.user_id, { ...ask, gateVerb: 'replacePassphrase' }, async () => await bankDB.tryReplacePassphrase(ask)),
      safebyokAddPasskey:        async (_parent, { ask }, context) => await serveSignedIn(context, ask.user_id, { ...ask, gateVerb: 'addPasskey' }, async () => await bankDB.tryAddPasskey(ask)),
      safebyokRevokePasskey:     async (_parent, { ask }, context) => await serveSignedIn(context, ask.user_id, { ...ask, gateVerb: 'revokePasskey' }, async () => await bankDB.tryRevokePasskey(ask)),
      safebyokDelBank:           async (_parent, { ask }, context) => await serveSignedIn(context, ask.user_id, ask, async () => await bankDB.tryDelBank(ask)),
      safebyokPutVault:          async (_parent, { ask }, context) => await serveSignedIn(context, ask.user_id, ask, async () => await bankDB.tryPutVault(ask)),
      safebyokDelVault:          async (_parent, { ask }, context) => await serveSignedIn(context, ask.user_id, ask, async () => await bankDB.tryDelVault(ask)),
      safebyokPutBox:            async (_parent, { ask }, context) => await serveSignedIn(context, ask.user_id, ask, async () => await bankDB.tryPutBox(ask)),
      safebyokDelBox:            async (_parent, { ask }, context) => await serveSignedIn(context, ask.user_id, ask, async () => await bankDB.tryDelBox(ask)),
      safebyokTidyGone:          async (_parent, { user_id, banklabel }, context) => {
        const ask = { op: 'tidy_gone', user_id, banklabel } as const
        return await serveSignedIn(context, user_id, ask, async () => await bankDB.tryTidyGone(ask))
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

/** `SafebyokJson`: any JSON value, passed through unchanged. The bankDB at each end validates it. */
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
function crossingOf(answer: BX.Answer<unknown, DB.GoodAct, unknown>): CrossingAnswer {
  return {
    ok:     answer.ok,
    act:    answer.act,
    val:    answer.ok ? answer.val : null,
    parent: answer.parent,
    dbhas:  answer.dbhas ?? null,
    ask:    answer.ask,
    err:    answer.ok ? null : crossedErrOf(answer.err),
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
function badNoticeOf(refusal: DB.VaultError): CrossingNotice { return { ok: false, act: 'unclassified_storing', val: null, parent: null, err: crossedErrOf(refusal) } }

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

/** Start watching `scope` on `bankDB` and return a stream reader. Cancelling the reader stops the watch. */
function openWatch(bankDB: DB.AdapterBankDB, scope: DB.WatchScope): ReadableStreamDefaultReader<BX.Notice> {
  // Use a reader, not the stream's own async iterator. The iterator's `return` waits for a pending
  // `next`, which on a quiet bank never resolves, so a subscriber that left would keep the watch
  // open. A reader's `cancel` ends the pending read immediately.
  let unwatch = noUnwatching
  const notices = new ReadableStream<BX.Notice>({
    start: (controller) => {
      unwatch = bankDB.watch(scope, (notice) => {
        // Enqueue every notice while the stream is open, however many are unread. Drop notices once it has closed.
        if ((controller.desiredSize ?? 0) > 0) { controller.enqueue(notice) }
      })
    },
    cancel: () => { unwatch() },
  }, { highWaterMark: Infinity })
  return notices.getReader()
}

const noUnwatching = (): void => undefined

/** The schema typename for a row: `SafebyokBankRow`, `SafebyokGateRecord`, `SafebyokVaultRow`, `SafebyokBoxRecord` or `SafebyokBoxTombstone`. */
const typenameOf = (row: NoticedRow): string => {
  if ('gatelabel' in row) { return 'SafebyokGateRecord' }
  if ('boxlabel' in row) { return (row.am === 'x') ? 'SafebyokBoxTombstone' : 'SafebyokBoxRecord' }
  return ('vaultlabel' in row) ? 'SafebyokVaultRow' : 'SafebyokBankRow'
}
// --
