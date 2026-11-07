import { GraphQLError, GraphQLScalarType, Kind, valueFromASTUntyped } from 'graphql'
import * as DB from 'safebyok/storage'

// == [Types]: VaultResolversOpts, VaultFieldArgs, CrossingAnswer, CrossingNotice, VaultFieldResolver, VaultResolvers

/** What {@link vaultResolvers} is made with, once, at your server's start. */
export type VaultResolversOpts<ContextT> = {
  /** The vaultDB every request is served from, such as a `PostgresVaultDB`. */
  vaultDB:  DB.AdapterVaultDB
  /** The user_id your own auth signed this request in as, or null when signed out. */
  userIdOf: (context: ContextT) => DB.Awaitable<string | null>
}

/** Each root field's arguments, as GraphQL coerced them, keyed by the field's name. */
export type VaultFieldArgs = {
  safebyokListVaults:        DB.BankScope
  safebyokGetVault:          DB.VaultScope & { opts?: DB.IfAbsentOpts | null }
  safebyokListBoxes:         DB.VaultQuery
  safebyokGetBox:            DB.BoxQuery & { opts?: DB.IfAbsentOpts | null }
  safebyokPutVault:          { record: DB.VaultRecord, opts: DB.PutVaultOpts }
  safebyokPutBox:            { record: DB.BoxRecord, opts: DB.PutOpts }
  safebyokReplacePassphrase: { params: DB.ReplacePassphraseParams }
  safebyokAddPasskey:        { params: DB.AddPasskeyParams }
  safebyokRevokePasskey:     { params: DB.RevokePasskeyParams }
  safebyokDelBox:            { tombstone: DB.BoxTombstone, opts: DB.DelOpts }
  safebyokDelVault:          { tombstone: DB.VaultTombstone, opts: DB.DelOpts }
  safebyokTidyGone:          DB.BankScope
  safebyokWatch:             DB.BankScope & { vaultlabel?: string | null }
}

/** A verb's answer as it crosses the wire: every field its answer type names, null where it holds none. */
export type CrossingAnswer = {
  ok:         boolean
  act:        string
  val:        unknown
  world:      unknown
  dbhas:      unknown
  req_params: DB.ReqParams
  err:        DB.CrossedErr | null
}

/** A watch's notice as it crosses the wire, or the refusal that ends the watch. */
export type CrossingNotice = {
  ok:    boolean
  act:   string
  val:   DB.VaultRow | DB.BoxRow | null
  world: DB.VaultRow | null
  err:   DB.CrossedErr | null
}

/** One query's or mutation's resolver, as every GraphQL server calls it. */
export type VaultFieldResolver<ContextT, FieldnameT extends keyof VaultFieldArgs> = (
  parent: unknown, args: VaultFieldArgs[FieldnameT], context: ContextT,
) => Promise<CrossingAnswer>

/** The resolvers {@link vaultResolvers} makes, keyed as `VaultSchemaSdl` names its types and root fields. */
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
  userIdOf: fn<VaultResolversOpts<unknown>['userIdOf']>(),
}), 'bad_option')

/** The resolvers for `VaultSchemaSdl`, serving each request its signed-in user's bank alone. */
export const vaultResolvers = <ContextT>(opts: VaultResolversOpts<ContextT>): VaultResolvers<ContextT> => {
  const { vaultDB, userIdOf } = vaultResolversOpts.parse(opts)

  /** The refusal a request gets unless it is signed in as `user_id`, or null. */
  const gateRefusalOf = async (context: ContextT, user_id: string): Promise<DB.VaultError | null> => {
    const signedIn = await DB.outcomeOf(() => userIdOf(context))
    if (! signedIn.ok) { return signedIn.err }
    return (signedIn.val === user_id) ? null : DB.identityRevoked()
  }

  /** What `verb` answers, as it crosses, once the request is shown signed in as `user_id`. */
  const served = async (context: ContextT, user_id: string, asked: object, verb: () => Promise<DB.Answer<unknown, string, unknown>>): Promise<CrossingAnswer> => {
    const refusal = await gateRefusalOf(context, user_id)
    if (refusal === null) { return crossingOf(await verb()) }
    return crossingOf({ ok: false, err: refusal, act: refusal.refusalkind, world: null, req_params: DB.reqParamsOf(asked) })
  }

  /** Watches `scope` for the notices that cross, while the request stays signed in as its user. */
  const watchNotices = async (context: ContextT, scope: DB.WatchScope): Promise<AsyncIterableIterator<CrossingNotice>> => {
    const refusal = await gateRefusalOf(context, scope.user_id)
    if (refusal !== null) { return endingWith(refusal) }
    // A watch's own refusal, bad_scope, is thrown from the stream's start, and the stream's constructor throws it on.
    const watched = await DB.outcomeOf(() => openWatch(vaultDB, scope))
    if (! watched.ok) { return endingWith(watched.err) }
    const reader = watched.val
    const iterator: AsyncIterableIterator<CrossingNotice> = {
      next: async () => {
        const read = await reader.read()
        if (read.done) { return read }
        // Asked again at each notice, so a session revoked since it subscribed hears no more of its bank:
        // its last notice carries the refusal, and the read after it finds the stream cancelled.
        const revoked = await gateRefusalOf(context, scope.user_id)
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
      safebyokListVaults: async (_parent, scope, context) => await served(context, scope.user_id, scope, async () => await vaultDB.tryListVaults(scope)),
      safebyokGetVault:   async (_parent, { opts, ...scope }, context) => await served(context, scope.user_id, scope, async () => await vaultDB.tryGetVault(scope, opts ?? undefined)),
      safebyokListBoxes:  async (_parent, asked, context) => await served(context, asked.user_id, asked, async () => await vaultDB.tryListBoxes(asked)),
      safebyokGetBox:     async (_parent, { opts, ...asked }, context) => await served(context, asked.user_id, asked, async () => await vaultDB.tryGetBox(asked, opts ?? undefined)),
    },
    Mutation: {
      safebyokPutVault:          async (_parent, { record, opts }, context) => await served(context, record.user_id, { ...record, ...opts }, async () => await vaultDB.tryPutVault(record, opts)),
      safebyokPutBox:            async (_parent, { record, opts }, context) => await served(context, record.user_id, { ...record, ...opts }, async () => await vaultDB.tryPutBox(record, opts)),
      safebyokReplacePassphrase: async (_parent, { params }, context) => await served(context, params.user_id, params, async () => await vaultDB.tryReplacePassphrase(params)),
      safebyokAddPasskey:        async (_parent, { params }, context) => await served(context, params.user_id, params, async () => await vaultDB.tryAddPasskey(params)),
      safebyokRevokePasskey:     async (_parent, { params }, context) => await served(context, params.user_id, params, async () => await vaultDB.tryRevokePasskey(params)),
      safebyokDelBox:            async (_parent, { tombstone, opts }, context) => await served(context, tombstone.user_id, { ...tombstone, ...opts }, async () => await vaultDB.tryDelBox(tombstone, opts)),
      safebyokDelVault:          async (_parent, { tombstone, opts }, context) => await served(context, tombstone.user_id, { ...tombstone, ...opts }, async () => await vaultDB.tryDelVault(tombstone, opts)),
      safebyokTidyGone:          async (_parent, scope, context) => await served(context, scope.user_id, scope, async () => await vaultDB.tryTidyGone(scope)),
    },
    Subscription: {
      safebyokWatch: {
        // A vaultlabel sent as null asks for the whole bank, as one left out does.
        subscribe: async (_parent, { vaultlabel, ...bank }, context) => await watchNotices(context, (typeof vaultlabel === 'string') ? { ...bank, vaultlabel } : bank),
        resolve:   (notice) => notice,
      },
    },
  }
}
// --

// == [Scalars]: safebyokJson, safebyokEpochMillis

/** `SafebyokJson`: any JSON value, carried whole for the vaultDB at each end to check. */
const safebyokJson = new GraphQLScalarType({
  name:               'SafebyokJson',
  coerceOutputValue:  (val) => val,
  coerceInputValue:   (val) => val,
  coerceInputLiteral: (ast) => valueFromASTUntyped(ast),
})

/** `val` as a time in epoch milliseconds, refused unless a safe integer. */
const epochMillisOf = (val: unknown): number => {
  if (Number.isSafeInteger(val)) { return val as number }
  throw new GraphQLError('SafebyokEpochMillis is a time in integer UTC epoch milliseconds')
}

/** `SafebyokEpochMillis`: a time as integer UTC epoch milliseconds, past the 32 bits GraphQL's own Int holds. */
const safebyokEpochMillis = new GraphQLScalarType<number, number>({
  name:               'SafebyokEpochMillis',
  coerceOutputValue:  epochMillisOf,
  coerceInputValue:   epochMillisOf,
  coerceInputLiteral: (ast) => epochMillisOf((ast.kind === Kind.INT) ? Number(ast.value) : undefined),
})
// --

// == [Helpers]: crossingOf, crossedErrOf, badNoticeOf, endingWith, openWatch, typenameOf

/** `answer` as it crosses, each field the schema names. */
const crossingOf = (answer: DB.Answer<unknown, string, unknown>): CrossingAnswer => ({
  ok:         answer.ok,
  act:        answer.act,
  val:        answer.ok ? answer.val : null,
  world:      answer.world,
  dbhas:      answer.dbhas ?? null,
  req_params: answer.req_params,
  err:        answer.ok ? null : crossedErrOf(answer.err),
})

/** A refusal as it crosses, never its cause. */
const crossedErrOf = ({ refusalkind, message, meta }: DB.VaultError): DB.CrossedErr => {
  // Checked for the wire: a limit of Infinity, which JSON cannot carry, becomes the largest safe integer.
  const capacity = DB.capacity.safeParse(meta?.capacity)
  return {
    refusalkind,
    message,
    meta: {
      capacity:   capacity.success ? capacity.data : null,
      fieldnames: (meta?.fieldnames === undefined) ? null : [...meta.fieldnames],
      call:       meta?.call ?? null,
    },
  }
}

/** The notice that ends a watch, carrying its refusal. */
const badNoticeOf = (refusal: DB.VaultError): CrossingNotice => ({ ok: false, act: refusal.refusalkind, val: null, world: null, err: crossedErrOf(refusal) })

/** A watch refused before it began: its one notice carries the refusal. */
const endingWith = (refusal: DB.VaultError): AsyncIterableIterator<CrossingNotice> => {
  const notices = [badNoticeOf(refusal)].values()
  const iterator: AsyncIterableIterator<CrossingNotice> = {
    next:                  () => Promise.resolve(notices.next()),
    return:                () => Promise.resolve({ done: true, value: undefined }),
    [Symbol.asyncIterator]: () => iterator,
  }
  return iterator
}

/** Opens a watch of `scope` on `vaultDB`, as a reader whose cancel stops it. */
const openWatch = (vaultDB: DB.AdapterVaultDB, scope: DB.WatchScope): ReadableStreamDefaultReader<DB.Notice> => {
  // Read through a reader, not the stream's own iterator: that one's `return` waits for a pending
  // `next`, which for a quiet bank is forever, so a subscriber gone while it waited would keep the
  // watch open. A reader's `cancel` ends the pending read at once.
  let unwatch = noUnwatching
  const notices = new ReadableStream<DB.Notice>({
    start: (controller) => {
      unwatch = vaultDB.watch(scope, (notice) => {
        // None once the stream has closed; every one before, however many wait to be read.
        if ((controller.desiredSize ?? 0) > 0) { controller.enqueue(notice) }
      })
    },
    cancel: () => { unwatch() },
  }, { highWaterMark: Infinity })
  return notices.getReader()
}

const noUnwatching = (): void => undefined

/** The schema's name for a row's type: a vault's or a box's, live or deleted. */
const typenameOf = (row: DB.VaultRow | DB.BoxRow): string => {
  const thing = ('boxlabel' in row) ? 'Box' : 'Vault'
  return `Safebyok${thing}${(row.am === 'x') ? 'Tombstone' : 'Record'}`
}
// --
