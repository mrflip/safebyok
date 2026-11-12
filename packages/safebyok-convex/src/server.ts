/** The safebyok functions a host app serves from its own `convex/` folder. */

import { mutationGeneric, queryGeneric } from 'convex/server'
import type { FunctionReference, GenericDataModel, GenericQueryCtx, MutationBuilder, QueryBuilder } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import * as DB from 'safebyok/storage'
import type { ComponentApi } from './component-api'
import * as CVX from './component/validators'
import * as Phrases from './phrases'
import type { SafebyokErrorData } from './refusals'

export type { ComponentApi } from './component-api'
export { safebyokErrorKindVals, safebyokErrorData, isSafebyokErrorData } from './refusals'
export type { SafebyokErrorData, SafebyokErrorKind } from './refusals'
export { SafebyokBankComponent } from './bank-server'
export type { SafebyokBankApi } from './bank-server'

// == [Options]: GetUserId, SafebyokApiOpts

/** A host function that returns the signed-in caller's `user_id`, or null, undefined or `''` when no one is signed in.
 *
 * @example async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null
 */
export type GetUserId<DataModel extends GenericDataModel = GenericDataModel> =
  (ctx: GenericQueryCtx<DataModel>) => Promise<string | null | undefined> | string | null | undefined

/** Options for {@link SafebyokComponent.api}. */
export type SafebyokApiOpts<DataModel extends GenericDataModel = GenericDataModel> = {
  /** Identifies the caller of each function. */
  getUserId: GetUserId<DataModel>
}
// --

// == [The wrapper]: SafebyokComponent, SafebyokApi

/** A wrapper around the installed safebyok component that serves its functions to signed-in users.
 *
 * @example
 *   // convex/safebyok.ts
 *   export const { listVaults, getVault, listBoxes, getBox, putVault, putBox, delVault, delBox, tidyGone, watchRows } =
 *     new SafebyokComponent(components.safebyok).api({
 *       getUserId: async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null,
 *     })
 */
export class SafebyokComponent {
  readonly #component: ComponentApi

  constructor(component: ComponentApi) {
    this.#component = componentCheck.parse(component, { where: 'SafebyokComponent', advice: Phrases.SafebyokComponentAdvice })
  }

  /** Build the public functions a `ConvexVaultDB` calls. Export them, under these names, from one module of the host's `convex/`.
   * Each one refuses `identity_revoked` unless the caller is signed in as the `user_id` named in its scope or `ask`.
   */
  api<DataModel extends GenericDataModel>(opts: SafebyokApiOpts<DataModel>) {
    // Validate only, and keep using `opts` itself: `getUserId` is called on the host's own object, so one that relies on `this` still works.
    safebyokApiOpts.parse(opts, { where: 'SafebyokComponent.api', advice: Phrases.SafebyokApiAdvice })
    const { vaults } = this.#component
    // Convex's generic builders, typed with the host's data model as its codegen would type them, so each `ctx` has the type `getUserId` was written for.
    const publicQuery: QueryBuilder<DataModel, 'public'> = queryGeneric
    const publicMutation: MutationBuilder<DataModel, 'public'> = mutationGeneric

    /** Throw `identity_revoked` unless the caller is signed in as `user_id`. */
    async function demandCaller(ctx: GenericQueryCtx<DataModel>, user_id: string): Promise<void> {
      const callerId = await opts.getUserId(ctx)
      if ((! callerId) || (callerId !== user_id)) { throw new ConvexError<SafebyokErrorData>({ kind: 'identity_revoked' }) }
    }

    return {
      listVaults: publicQuery({
        args:    CVX.listVaultsArgs,
        returns: v.array(CVX.rowOfVault),
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.ask.user_id)
          return await ctx.runQuery(vaults.listVaults, args)
        },
      }),
      getVault: publicQuery({
        args:    CVX.getVaultArgs,
        returns: v.any(),
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.ask.user_id)
          return await ctx.runQuery(vaults.getVault, args)
        },
      }),
      listBoxes: publicQuery({
        args:    CVX.listBoxesArgs,
        returns: CVX.boxesFetched,
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.ask.user_id)
          return await ctx.runQuery(vaults.listBoxes, args)
        },
      }),
      getBox: publicQuery({
        args:    CVX.getBoxArgs,
        returns: CVX.boxFetched,
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.ask.user_id)
          return await ctx.runQuery(vaults.getBox, args)
        },
      }),
      putVault: publicMutation({
        args:    CVX.putVaultArgs,
        returns: CVX.vaultStored,
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.ask.user_id)
          return await ctx.runMutation(vaults.putVault, args)
        },
      }),
      putBox: publicMutation({
        args:    CVX.putBoxArgs,
        returns: CVX.boxStored,
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.ask.user_id)
          return await ctx.runMutation(vaults.putBox, args)
        },
      }),
      delVault: publicMutation({
        args:    CVX.delVaultArgs,
        returns: CVX.vaultStored,
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.ask.user_id)
          return await ctx.runMutation(vaults.delVault, args)
        },
      }),
      delBox: publicMutation({
        args:    CVX.delBoxArgs,
        returns: CVX.boxStored,
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.ask.user_id)
          return await ctx.runMutation(vaults.delBox, args)
        },
      }),
      tidyGone: publicMutation({
        args:    CVX.tidyGoneArgs,
        returns: CVX.tidied,
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.ask.user_id)
          return await ctx.runMutation(vaults.tidyGone, args)
        },
      }),
      watchRows: publicQuery({
        args:    CVX.watchRowsArgs,
        returns: CVX.rowsWatched,
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.scope.user_id)
          return await ctx.runQuery(vaults.watchRows, args)
        },
      }),
    }
  }
}

/** The host's public safebyok functions as its clients reference them: the type of `api.safebyok`. */
export type SafebyokApi = {
  [Fnname in keyof ComponentApi['vaults']]: ComponentApi['vaults'][Fnname] extends FunctionReference<infer Fnkind, infer _Visibility, infer ArgsT, infer ReturnT>
    ? FunctionReference<Fnkind, 'public', ArgsT, ReturnT>
    : never
}
// --

// == [Checks]: componentCheck, safebyokApiOpts

/** Validator for the component handed to {@link SafebyokComponent}: an object or a function, never undefined or null. */
const componentCheck = DB.Checker(({ custom }) => custom<ComponentApi>((candidate) => ((typeof candidate === 'object') || (typeof candidate === 'function')) && (candidate !== null), Phrases.ComponentExpected), 'bad_option')

/** Validator for {@link SafebyokApiOpts}. */
const safebyokApiOpts = DB.objCheck(({ fn }) => ({ getUserId: fn<GetUserId>() }), 'bad_option')
// --
