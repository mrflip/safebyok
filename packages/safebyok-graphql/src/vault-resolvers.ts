import { GraphQLError } from 'graphql'
import * as SX from 'safebyok/storage'

// == [Types]: VaultResolversOpts, VaultFieldArgs, VaultFieldResolver, VaultResolvers

/** What {@link vaultResolvers} is made with, once, at your server's start. */
export type VaultResolversOpts<ContextT> = {
  /** The VaultDB every request is served from, such as a `PostgresVaultDB`. */
  vaultDB:  SX.VaultDB
  /** The user_id your own auth signed this request in as, or null when signed out. */
  userIdOf: (context: ContextT) => SX.Awaitable<string | null>
}

/** A root field's arguments, as GraphQL coerced them: unchecked until the VaultDB checks them. */
export type VaultFieldArgs = {
  readonly applabel?:   unknown
  readonly user_id?:    unknown
  readonly vaultlabel?: unknown
  readonly boxlabel?:   unknown
  readonly vault_tok?:  unknown
  readonly record?:     unknown
  readonly tombstone?:  unknown
  readonly opts?:       unknown
}

/** One query's or mutation's resolver, as every GraphQL server calls it. */
export type VaultFieldResolver<ContextT> = (parent: unknown, args: VaultFieldArgs, context: ContextT) => Promise<unknown>

/** The resolvers {@link vaultResolvers} makes, keyed as `VaultSchemaSdl` names its root fields. */
export type VaultResolvers<ContextT> = {
  Query: {
    safebyokListVaults: VaultFieldResolver<ContextT>
    safebyokGetVault:   VaultFieldResolver<ContextT>
    safebyokListBoxes:  VaultFieldResolver<ContextT>
    safebyokGetBox:     VaultFieldResolver<ContextT>
  }
  Mutation: {
    safebyokPutVault:   VaultFieldResolver<ContextT>
    safebyokPutBox:     VaultFieldResolver<ContextT>
    safebyokDelVault:   VaultFieldResolver<ContextT>
    safebyokDelBox:     VaultFieldResolver<ContextT>
    safebyokTidyGone:   VaultFieldResolver<ContextT>
  }
  Subscription: {
    safebyokHeard: {
      subscribe: (parent: unknown, args: VaultFieldArgs, context: ContextT) => Promise<AsyncIterableIterator<SX.Heard>>
      resolve:   (heard: SX.Heard) => SX.Heard
    }
  }
}
// --

// == [Resolvers]: vaultResolvers

const vaultResolversOpts = SX.objCheck(({ custom, fn }) => ({
  vaultDB:  custom<SX.VaultDB>((candidate) => candidate instanceof SX.VaultDB, 'Expected a VaultDB from safebyok/storage'),
  userIdOf: fn<VaultResolversOpts<unknown>['userIdOf']>(),
}), 'bad_option')

/** The resolvers for `VaultSchemaSdl`, each root field one of the VaultDB's generic calls, for the user the request is signed in as alone. */
export const vaultResolvers = <ContextT>(opts: VaultResolversOpts<ContextT>): VaultResolvers<ContextT> => {
  const { vaultDB, userIdOf } = vaultResolversOpts.parse(opts)
  const { relay } = vaultDB

  /** What `call` answers, once the request is shown signed in as `user_id`; its refusal otherwise, as the wire carries one. */
  const served = async <ValT>(context: ContextT, user_id: unknown, call: () => SX.Awaitable<ValT>): Promise<ValT> => {
    try {
      demandSignedInAs(await userIdOf(context), user_id)
      return await call()
    } catch (err) { throw crossing(err) }
  }

  return {
    Query: {
      safebyokListVaults: async (_parent, args, context) => await served(context, args.user_id, () => relay.listVaults(args)),
      safebyokGetVault:   async (_parent, args, context) => await served(context, args.user_id, () => relay.getVault(args)),
      safebyokListBoxes:  async (_parent, args, context) => await served(context, args.user_id, () => relay.listBoxes(args)),
      safebyokGetBox:     async (_parent, args, context) => await served(context, args.user_id, () => relay.getBox(args)),
    },
    Mutation: {
      safebyokPutVault: async (_parent, { record, opts }, context) => await served(context, userIdIn(record), () => relay.putVault(record, opts)),
      safebyokPutBox:   async (_parent, { record, opts }, context) => await served(context, userIdIn(record), () => relay.putBox(record, opts)),
      safebyokDelVault: async (_parent, { tombstone, opts }, context) => await served(context, userIdIn(tombstone), () => relay.delVault(tombstone, opts)),
      safebyokDelBox:   async (_parent, { tombstone, opts }, context) => await served(context, userIdIn(tombstone), () => relay.delBox(tombstone, opts)),
      safebyokTidyGone: async (_parent, args, context) => await served(context, args.user_id, () => relay.tidyGone(args)),
    },
    Subscription: {
      safebyokHeard: {
        subscribe: async (_parent, args, context) => await served(context, args.user_id, () => heardOf(relay, args)),
        resolve:   (heard) => heard,
      },
    },
  }
}
// --

// == [Helpers]: demandSignedInAs, userIdIn, crossing, extensionsOf, heardOf

const NotSignedInAs = "This request is not signed in as the user whose vaults it asks for."

/** Refuses unless the request is signed in, and as the user it asks for. */
const demandSignedInAs = (signedIn: string | null, asked: unknown): void => {
  if (signedIn === null || asked !== signedIn) { throw new SX.VaultError('identity_revoked', NotSignedInAs) }
}

/** The user_id a record or tombstone names, before it is checked. */
const userIdIn = (bag: unknown): unknown => ((typeof bag === 'object' && bag !== null && 'user_id' in bag) ? bag.user_id : undefined)

/** A refusal as the wire carries it: its message, and in `extensions` its kind and what a caller reads of its meta, never its cause. */
const crossing = (thrown: unknown): GraphQLError => {
  // A VaultError is the relay's refusal, or the gate's; anything else was thrown by the host's userIdOf.
  const refusal = SX.isVaultError(thrown) ? thrown : SX.unexpectedError(thrown)
  const crossed = new GraphQLError(refusal.message, { extensions: extensionsOf(refusal) })
  // The refusal rides along for the server's logs as an unenumerable `cause`, which no GraphQL
  // server sends. Never the constructor's `originalError`: Yoga masks an error whose original is
  // not a GraphQLError, and the kind would be lost.
  Object.defineProperty(crossed, 'cause', { value: refusal, configurable: true, writable: true })
  return crossed
}

/** A refusal's kind, with the room it reports and the fields it names, as the browser's VaultDB rebuilds them. */
const extensionsOf = ({ refusalkind, meta }: SX.VaultError): Record<string, unknown> => {
  // Checked for the wire: a limit of Infinity, which JSON cannot carry, becomes the largest safe integer.
  const capacity = SX.capacity.safeParse(meta?.capacity)
  return {
    kind: refusalkind,
    ...(capacity.success && { capacity: capacity.data }),
    ...(meta?.fieldnames && { fieldnames: meta.fieldnames }),
  }
}

/** What the relay's watch hears of `scope`, as the async iterator a subscription resolver answers; ending it stops the watch. */
const heardOf = (relay: SX.VaultDBRelay, scope: VaultFieldArgs): AsyncIterableIterator<SX.Heard> => {
  // Read through a reader, not the stream's own iterator: that one's `return` waits for a pending
  // `next`, which for a quiet bank is forever, so a subscriber gone while it waited would keep the
  // watch open. A reader's `cancel` ends the pending read at once.
  let unwatch = noUnwatching
  const heards = new ReadableStream<SX.Heard>({
    start: (controller) => {
      unwatch = relay.watch(scope, (heard) => {
        // None once the stream has closed; every one before, however many wait to be read.
        if ((controller.desiredSize ?? 0) > 0) { controller.enqueue(heard) }
      })
    },
    cancel: () => { unwatch() },
  }, { highWaterMark: Infinity })
  const reader = heards.getReader()
  const iterator: AsyncIterableIterator<SX.Heard> = {
    next:   async () => await reader.read() as IteratorResult<SX.Heard>,
    return: async () => {
      await reader.cancel()
      return { done: true, value: undefined }
    },
    [Symbol.asyncIterator]: () => iterator,
  }
  return iterator
}

const noUnwatching = (): void => undefined
// --
