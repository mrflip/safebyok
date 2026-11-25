/** The safebyok functions a host app serves from its own `convex/` folder. */

import { mutationGeneric, queryGeneric } from 'convex/server'
import type { FunctionReference, GenericDataModel, GenericQueryCtx, MutationBuilder, QueryBuilder } from 'convex/server'
import { ConvexError } from 'convex/values'
import * as DB from 'safebyok/storage'
import type { Userid } from 'safebyok/storage'
import type { ComponentApi } from './component-api'
import * as CVX from './component/validators'
import * as Phrases from './phrases'
import type { SafebyokRefusal } from './refusals'

export type { ComponentApi } from './component-api'
export { safebyokErrorkindVals, safebyokRefusal, isSafebyokRefusal } from './refusals'
export type { SafebyokRefusal, SafebyokErrorkind } from './refusals'

// == [Options]: GetUserId, SafebyokApiOpts

/** A host function that returns the signed-in caller's userid, or null, undefined or `''` when no one is signed in.
 *
 * @example async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null
 */
export type GetUserId<DataModel extends GenericDataModel = GenericDataModel> =
  (ctx: GenericQueryCtx<DataModel>) => Promise<Userid | null | undefined> | Userid | null | undefined

/** Options for {@link SafebyokVaultComponent.api}. */
export type SafebyokApiOpts<DataModel extends GenericDataModel = GenericDataModel> = {
  /** Identifies the caller of each function. */
  getUserId: GetUserId<DataModel>
}
// --

// == [The wrapper]: SafebyokVaultComponent, SafebyokVaultApi

/** A wrapper around the installed safebyok component that serves its vaultDB functions to signed-in users.
 *
 * @example
 *   // convex/safebyokVault.ts
 *   export const { getThing, writeThing, listThings, birthBank, getWorld, stats, watchThings } =
 *     new SafebyokVaultComponent(components.safebyok).api({
 *       getUserId: async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null,
 *     })
 */
export class SafebyokVaultComponent {
  readonly #component: ComponentApi

  constructor(component: ComponentApi) {
    this.#component = componentCheck.parse(component, { where: 'SafebyokVaultComponent', advice: Phrases.SafebyokVaultComponentAdvice })
  }

  /** Build the public functions a `ConvexVaultDB` calls, to export under these names from one module of the host's `convex/`.
   * Each refuses `identity_revoked` unless the caller is signed in as the `userid` its scope or `ask` names.
   */
  api<DataModel extends GenericDataModel>(opts: SafebyokApiOpts<DataModel>) {
    // Validate only, and keep using `opts` itself: `getUserId` is called on the host's own object, so one that relies on `this` still works.
    safebyokApiOpts.parse(opts, { where: 'SafebyokVaultComponent.api', advice: Phrases.SafebyokVaultApiAdvice })
    const { things } = this.#component
    // Convex's generic builders, typed with the host's data model as its codegen would type them, so each `ctx` has the type `getUserId` was written for.
    const publicQuery: QueryBuilder<DataModel, 'public'> = queryGeneric
    const publicMutation: MutationBuilder<DataModel, 'public'> = mutationGeneric

    // An ask is any value until the component parses it, so its `userid` is read here with the core's own check of one.
    // An ask with no lawful `userid` refuses `identity_revoked` too, not `bad_record`: until the caller is shown to be the user
    // the ask names, nothing is said to them about the ask.
    /** Throw `identity_revoked` unless the caller is signed in as the `userid` of `scope`. */
    async function checkCaller(ctx: GenericQueryCtx<DataModel>, scope: unknown): Promise<void> {
      const callerId = await opts.getUserId(ctx)
      const userReport = scopeUser.safeParse(scope)
      if ((! callerId) || (! userReport.success) || (callerId !== userReport.data.userid)) { throw new ConvexError<SafebyokRefusal>({ kind: 'identity_revoked' }) }
    }

    return {
      getThing: publicQuery({
        args:    CVX.askArgs,
        returns: CVX.thingFetched,
        handler: async (ctx, args) => {
          await checkCaller(ctx, args.ask)
          return await ctx.runQuery(things.getThing, args)
        },
      }),
      writeThing: publicMutation({
        args:    CVX.askArgs,
        returns: CVX.thingWritten,
        handler: async (ctx, args) => {
          await checkCaller(ctx, args.ask)
          return await ctx.runMutation(things.writeThing, args)
        },
      }),
      listThings: publicQuery({
        args:    CVX.askArgs,
        returns: CVX.thingsFetched,
        handler: async (ctx, args) => {
          await checkCaller(ctx, args.ask)
          return await ctx.runQuery(things.listThings, args)
        },
      }),
      birthBank: publicMutation({
        args:    CVX.askArgs,
        returns: CVX.rootsWritten,
        handler: async (ctx, args) => {
          await checkCaller(ctx, args.ask)
          return await ctx.runMutation(things.birthBank, args)
        },
      }),
      getWorld: publicQuery({
        args:    CVX.askArgs,
        returns: CVX.rootsFetched,
        handler: async (ctx, args) => {
          await checkCaller(ctx, args.ask)
          return await ctx.runQuery(things.getWorld, args)
        },
      }),
      stats: publicQuery({
        args:    CVX.askArgs,
        returns: CVX.statsFetched,
        handler: async (ctx, args) => {
          await checkCaller(ctx, args.ask)
          return await ctx.runQuery(things.stats, args)
        },
      }),
      watchThings: publicQuery({
        args:    CVX.watchArgs,
        returns: CVX.thingsWatched,
        handler: async (ctx, args) => {
          await checkCaller(ctx, args.scope)
          return await ctx.runQuery(things.watchThings, args)
        },
      }),
    }
  }
}

/** The host's public safebyok vaultDB functions as its clients reference them: the type of `api.safebyokVault`. */
export type SafebyokVaultApi = {
  [Fnname in keyof ComponentApi['things']]: ComponentApi['things'][Fnname] extends FunctionReference<infer Fnkind, infer _Visibility, infer ArgsT, infer ReturnT>
    ? FunctionReference<Fnkind, 'public', ArgsT, ReturnT>
    : never
}
// --

// == [Checks]: componentCheck, safebyokApiOpts, scopeUser

/** Validator for the component handed to {@link SafebyokVaultComponent}: an object or a function, not null. */
const componentCheck = DB.Checker(({ custom }) => custom<ComponentApi>((candidate) => ((typeof candidate === 'object') || (typeof candidate === 'function')) && (candidate !== null), Phrases.ComponentExpected), 'bad_record')

/** Validator for {@link SafebyokApiOpts}. */
const safebyokApiOpts = DB.objCheck(({ fn }) => ({ getUserId: fn<GetUserId>() }), 'bad_record')

/** Validator for the `userid` an ask or a watch's scope names. It strips the other fields, which the component checks. */
const scopeUser = DB.objCheck(({ user_id }) => ({ userid: user_id }), { refusalkind: 'identity_revoked', extras: 'strip' })
// --
