import { GraphQLError } from 'graphql'
import { Refusals, VaultError, isVaultError } from 'safebyok'
import type { Outcome, RefusalKind, RefusalMeta, VaultPropsExpectation, VaultDelExpectation, BoxRecord, BoxExpectation, BoxDelExpectation, VaultProps, VaultDB, VaultScope } from 'safebyok'
import { VaultPropsFields, BoxFields, ScopeFields, recordOf } from './fields'

/**
 * What the resolvers need of the VaultDB they serve: the verbs a browser's vault calls, and
 * `listBoxRecords`, which lists a vault's boxes as stored records -- what the browser's
 * VaultDB must hand back from its own listing -- where a VaultDB's `listBoxes` gives the
 * summaries a vault shows. Every VaultDB is one: `safebyok-postgres`'s, or one of your own.
 */
export type ServedVaultDB = Pick<VaultDB, 'getVaultProps' | 'ensureVaultProps' | 'putVaultProps' | 'getBox' | 'listBoxRecords' | 'putBox' | 'getCapacity' | 'delBox' | 'delVault' | 'subscribe'>

/** What {@link vaultResolvers} is made with, once, at your server's start. */
export type VaultResolversOpts<ContextT> = {
  /**
   * The VaultDB for one request, made from your server's context for it: for the user your own
   * auth signed in, never one the request names. Called for every vault field resolved, so it
   * should be cheap -- `postgresVaultDB` is, connecting to nothing. To refuse the request by a
   * rule of your own, it throws a VaultError of kind `not_permitted` (`Refusals.notPermitted()`),
   * or `identity_revoked` for a user your app knows is gone, which crosses as it is, kind and
   * message. Anything else it throws is the server's own setup gone wrong, never the request's:
   * it crosses as `bad_option` with a generic message. The VaultDB, not this, refuses a
   * signed-out request.
   */
  vaultDBFor: (context: ContextT) => ServedVaultDB
}

/** A root field's arguments, as {@link VaultSchemaSdl} names them and GraphQL has coerced them. */
export type VaultFieldArgs = {
  scope?:    unknown
  boxlabel?: unknown
  vaultProps?: unknown
  box?:      unknown
  expected?: unknown
}

/** One query or mutation's resolver, as every GraphQL server calls it. */
export type VaultFieldResolver<ContextT> = (parent: unknown, args: VaultFieldArgs, context: ContextT) => Promise<unknown>

/**
 * The resolvers {@link vaultResolvers} makes, keyed as {@link VaultSchemaSdl} names its root
 * fields: the shape Yoga, Apollo Server, Mercurius and graphql-tools all take.
 */
export type VaultResolvers<ContextT> = {
  Query: {
    safebyokGetVaultProps:    VaultFieldResolver<ContextT>
    safebyokGetBox:           VaultFieldResolver<ContextT>
    safebyokListBoxes:        VaultFieldResolver<ContextT>
    safebyokGetCapacity:      VaultFieldResolver<ContextT>
  }
  Mutation: {
    safebyokEnsureVaultProps: VaultFieldResolver<ContextT>
    safebyokPutVaultProps:    VaultFieldResolver<ContextT>
    safebyokPutBox:           VaultFieldResolver<ContextT>
    safebyokDelBox:           VaultFieldResolver<ContextT>
    safebyokDelVault:         VaultFieldResolver<ContextT>
  }
  Subscription: {
    safebyokVaultChanged: {
      subscribe: (parent: unknown, args: VaultFieldArgs, context: ContextT) => AsyncIterableIterator<VaultScope>
      resolve:   (scope: VaultScope) => VaultScope
    }
  }
}

/**
 * The resolvers for {@link VaultSchemaSdl}: each root field one verb of the VaultDB that
 * `vaultDBFor` makes for the request, so they drop into any GraphQL server beside your own.
 *
 * * **Who may reach a vault** is the VaultDB's to say: `postgresVaultDB`, made for the signed-in
 *   user, refuses every other user's vault, and every vault while signed out, with
 *   `identity_revoked`.
 * * **A refusal crosses as a GraphQL error** whose message is the VaultError's calm one and whose
 *   `extensions.kind` is its kind, which the browser's `graphqlVaultDB` throws as the same
 *   VaultError. Never a record, and never the VaultError's `cause` -- your driver's own error,
 *   which may name your database. That stays on the server, as the GraphQL error's `cause`, for
 *   your own logs. Anything else a VaultDB throws crosses as `storage_unavailable`, what it threw
 *   kept as that VaultError's cause.
 * * **A `vaultDBFor` that throws** a VaultError of kind `not_permitted` or `identity_revoked` --
 *   the host refusing the request's user -- crosses as that refusal. Anything else it throws crosses as
 *   `bad_option` saying only that the server is misconfigured: its own message, which may name
 *   your setup, stays on the server as the cause.
 * * **`safebyokVaultChanged`** sends the vault's scope after every write to it, as the VaultDB's
 *   `subscribe` hears them -- for `postgresVaultDB`, through its `listen` -- and stops listening
 *   when the subscriber goes. Changes that come while the subscriber is still busy with the last
 *   one are sent as one. It sends one as it starts, too, when the VaultDB calls as its watch
 *   begins, as `postgresVaultDB` does: a write made while the browser was subscribing is read then.
 *
 * @param opts - `vaultDBFor`, which makes the VaultDB for a request from its context.
 * @returns The resolver map, for your GraphQL server beside your own.
 *
 * @example
 *   const resolvers = vaultResolvers({
 *     vaultDBFor: (context: AppContext) => postgresVaultDB({ client: pool, userId: context.userId, listen }),
 *   })
 */
export const vaultResolvers = <ContextT>(opts: VaultResolversOpts<ContextT>): VaultResolvers<ContextT> => {
  const vaultDBFor = (opts as Partial<VaultResolversOpts<ContextT>> | null | undefined)?.vaultDBFor
  if (typeof vaultDBFor !== 'function') {
    throw new VaultError('bad_option', "vaultResolvers needs a `vaultDBFor`: (context) => the VaultDB for that request's signed-in user, such as postgresVaultDB({ client, userId }).")
  }
  // The server holds a name only to the floor every name is held to and to its storage's limits,
  // which every VaultDB verb checks: what text a name may be beyond that is each browser vault's
  // own validators' to say, at its entry. The server's job is to keep each user to their own vault.
  /**
   * The request's VaultDB; or the host's refusal of the request, as it came; or the refusal that
   * says the server could not make one.
   */
  const vaultDBOf = (context: ContextT): ServedVaultDB => {
    try {
      return vaultDBFor(context)
    } catch (err) {
      if (isVaultError(err) && HostRefusalKinds.has(err.refusalkind)) { throw err }
      throw new VaultError('bad_option', MisconfiguredMessage, { cause: err })
    }
  }
  /**
   * A resolver calling `verb` on the request's VaultDB: its outcome's `val`, as `answered` hands
   * it to the wire, or its refusal made one a wire can carry.
   */
  const served = (verb: (vaultDB: ServedVaultDB, args: VaultFieldArgs) => Promise<Outcome<unknown>>, answered: (val: unknown) => unknown = (val) => val): VaultFieldResolver<ContextT> => (
    async (_parent, args, context) => {
      try {
        const { ok, val, err } = await verb(vaultDBOf(context), args)
        if (! ok) { throw err }
        return answered(val)
      } catch (err) {
        throw crossing(err)
      }
    }
  )
  return {
    Query: {
      safebyokGetVaultProps: served((vaultDB, args) => vaultDB.getVaultProps(scopeIn(args))),
      safebyokGetBox:        served((vaultDB, args) => vaultDB.getBox(scopeIn(args), args.boxlabel as string)),
      // As stored records, which the browser's VaultDB validates: not listBoxes' summaries.
      safebyokListBoxes:  served((vaultDB, args) => vaultDB.listBoxRecords(scopeIn(args))),
      safebyokGetCapacity: served((vaultDB, args) => vaultDB.getCapacity(scopeIn(args))),
    },
    Mutation: {
      safebyokEnsureVaultProps: served((vaultDB, args) => vaultDB.ensureVaultProps(vaultPropsIn(args))),
      safebyokPutVaultProps: served((vaultDB, args) => vaultDB.putVaultProps(vaultPropsIn(args), vaultPropsExpectationIn(args)), () => true),
      safebyokPutBox: served((vaultDB, args) => vaultDB.putBox(scopeIn(args), boxExpectationIn(args), recordOf(args.box, BoxFields) as BoxRecord)),
      safebyokDelBox: served((vaultDB, args) => vaultDB.delBox(scopeIn(args), args.boxlabel as string, boxDelExpectationIn(args))),
      safebyokDelVault: served((vaultDB, args) => vaultDB.delVault(scopeIn(args), vaultDelExpectationIn(args)), () => true),
    },
    Subscription: {
      safebyokVaultChanged: {
        subscribe: (_parent, args, context) => {
          try {
            return changesOf(vaultDBOf(context), scopeIn(args))
          } catch (err) {
            throw crossing(err)
          }
        },
        resolve: (scope) => scope,
      },
    },
  }
}

/**
 * The refusals a `vaultDBFor` throws that cross as they are: the host refusing the request's user,
 * by its own rules or as gone. Any other is the server's setup gone wrong.
 */
const HostRefusalKinds: ReadonlySet<RefusalKind> = new Set(['not_permitted', 'identity_revoked'])

/** What a browser hears when `vaultDBFor` throws: the server's own message stays on the server. */
const MisconfiguredMessage = "The vault's server could not serve this request: its own setup is wrong, not the request. Retrying will not help until it is fixed; the server's logs say what is wrong."

// The arguments as the schema shapes them, rebuilt field by field as plain records: the
// VaultDB checks them as it would any caller's.
const scopeIn = (args: VaultFieldArgs) => recordOf(args.scope, ScopeFields) as VaultScope
const vaultPropsIn = (args: VaultFieldArgs) => recordOf(args.vaultProps, VaultPropsFields) as VaultProps

const vaultPropsExpectationIn = (args: VaultFieldArgs): VaultPropsExpectation => {
  const { vault_id, unlock_epoch } = args.expected as VaultPropsExpectation
  return { vault_id, unlock_epoch }
}

// A revision_tok left out, as a GraphQL client may leave out a null, is the null it means.
const boxExpectationIn = (args: VaultFieldArgs): BoxExpectation => {
  const { vault_id, revision_tok = null, vault_key_epoch } = args.expected as { vault_id: string, revision_tok?: string | null, vault_key_epoch: number }
  return { vault_id, revision_tok, vault_key_epoch }
}

const vaultDelExpectationIn = (args: VaultFieldArgs): VaultDelExpectation => {
  const { vault_id } = args.expected as VaultDelExpectation
  return { vault_id }
}

// A revision_tok left out, as for a box write, is the null it means.
const boxDelExpectationIn = (args: VaultFieldArgs): BoxDelExpectation => {
  const { vault_id, revision_tok = null } = args.expected as { vault_id: string, revision_tok?: string | null }
  return { vault_id, revision_tok }
}

/**
 * Each change `vaultDB` hears to the vault in `scope`, as its scope, until the subscriber goes:
 * ending the iteration -- which a GraphQL server does when the subscription ends -- cancels the
 * stream, which unsubscribes. A change heard while one is still waiting to be read is that one:
 * either says the vault changed. A refusal from `subscribe` throws at once, before any stream is
 * made. The stream is read through a reader, not its own iterator: that one's `return` waits for
 * a pending `next`, which for a quiet vault is forever, so a subscriber gone while it waited would
 * keep the VaultDB listening. A reader's `cancel` ends the pending read as done, at once. The
 * iterator is its own iterable, as a GraphQL server expects: graphql-js asks for it twice.
 */
const changesOf = (vaultDB: ServedVaultDB, scope: VaultScope): AsyncIterableIterator<VaultScope> => {
  let unsubscribe = noUnsubscribing
  const changes = new ReadableStream<VaultScope>({
    start: (controller) => {
      unsubscribe = vaultDB.subscribe(scope, () => {
        // Room only while none waits; none, too, once the stream has closed.
        if ((controller.desiredSize ?? 0) > 0) { controller.enqueue(scope) }
      })
    },
    cancel: () => { unsubscribe() },
  })
  const reader = changes.getReader()
  const iterator: AsyncIterableIterator<VaultScope> = {
    next:   () => reader.read(),
    return: async () => {
      await reader.cancel()
      return { done: true, value: undefined }
    },
    [Symbol.asyncIterator]: () => iterator,
  }
  return iterator
}

const noUnsubscribing = (): void => undefined

/**
 * A refusal as the wire carries it: a GraphQL error with the VaultError's message and its kind as
 * `extensions.kind`, and {@link metaCrossing} as `extensions.meta`. Nothing more. A GraphQL server sends a GraphQLError of its resolvers'
 * as it stands, where it hides anything else behind "Unexpected error" (Yoga) or sends its
 * message as it is (Apollo). The VaultError rides along as the error's `cause`, unenumerable, as
 * an Error's own cause is, for the server's logs: no GraphQL server sends a cause.
 */
const crossing = (err: unknown): GraphQLError => {
  const refusal = isVaultError(err) ? err : Refusals.storageUnavailable(err)
  const crossed = new GraphQLError(refusal.message, { extensions: { kind: refusal.refusalkind, ...metaCrossing(refusal) } })
  // Set after, never as the constructor's `cause` or `originalError`: either becomes the error's
  // originalError, and Yoga masks a GraphQLError whose originalError is not a GraphQLError too.
  Object.defineProperty(crossed, 'cause', { value: refusal, configurable: true, writable: true })
  return crossed
}

/**
 * What of a refusal's meta crosses the wire: a stale box write's `box_stored`, the box that
 * stands, whole, as a read would send it; or a full vault's `capacity`. Nothing else.
 */
const metaCrossing = (refusal: VaultError): { meta?: RefusalMeta } => {
  const { box_stored: boxStored, capacity } = refusal.meta ?? {}
  if (boxStored !== undefined) { return { meta: { box_stored: boxStored } } }
  if (capacity !== undefined) { return { meta: { capacity } } }
  return {}
}
