/** The safebyok functions a host serves from its own `convex/`, each refusing a caller who is not the user its call names. */

import { mutationGeneric, queryGeneric } from 'convex/server'
import type { FunctionReference, GenericDataModel, GenericQueryCtx, MutationBuilder, QueryBuilder } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import * as SX from 'safebyok/storage'
import type { ComponentApi } from './component-api'
import * as CVX from './component/validators'
import * as Phrases from './phrases'
import type { SafebyokErrorData } from './refusals'

export type { ComponentApi } from './component-api'
export { safebyokErrorKindVals, isSafebyokErrorData } from './refusals'
export type { SafebyokErrorData, SafebyokErrorKind } from './refusals'

// == [Options]: GetUserId, SafebyokApiOpts

/** The user signed in to the call, as the vault scopes them: null, undefined or empty for no one.
 *
 * @example async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null
 */
export type GetUserId<DataModel extends GenericDataModel = GenericDataModel> =
  (ctx: GenericQueryCtx<DataModel>) => Promise<string | null | undefined> | string | null | undefined

/** What {@link SafebyokComponent.api} needs of the host. */
export type SafebyokApiOpts<DataModel extends GenericDataModel = GenericDataModel> = {
  /** Who is calling. */
  getUserId: GetUserId<DataModel>
}
// --

// == [The wrapper]: SafebyokComponent, SafebyokApi

/** The installed safebyok component, wrapped to serve its functions to the host's signed-in users.
 *
 * @example
 *   // convex/safebyok.ts
 *   export const { listVaults, getVault, listBoxes, getBox, putVault, putBox, delVault, delBox, tidyGone, watchRows } =
 *     new SafebyokComponent(components.safebyok).api({ getUserId: async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null })
 */
export class SafebyokComponent {
  readonly #component: ComponentApi

  constructor(component: ComponentApi) {
    this.#component = componentCheck.parse(component, { where: 'SafebyokComponent', advice: Phrases.SafebyokComponentAdvice })
  }

  /** The functions a `ConvexVaultDB` calls, to export under these names from one module of the host's `convex/`. */
  api<DataModel extends GenericDataModel>(opts: SafebyokApiOpts<DataModel>) {
    // A check only: getUserId is called on the host's own bag, so one that leans on `this` works.
    safebyokApiOpts.parse(opts, { where: 'SafebyokComponent.api', advice: Phrases.SafebyokApiAdvice })
    const { vaults } = this.#component
    // Convex's builders, typed by the host's data model as its codegen types them, so each ctx is the one getUserId is written against.
    const publicQuery: QueryBuilder<DataModel, 'public'> = queryGeneric
    const publicMutation: MutationBuilder<DataModel, 'public'> = mutationGeneric

    /** Refuses unless the caller is signed in as `user_id`. */
    const demandCaller = async (ctx: GenericQueryCtx<DataModel>, user_id: string): Promise<void> => {
      const callerId = await opts.getUserId(ctx)
      if ((! callerId) || (callerId !== user_id)) { throw new ConvexError<SafebyokErrorData>({ kind: 'identity_revoked' }) }
    }

    return {
      listVaults: publicQuery({
        args:    CVX.listVaultsArgs,
        returns: v.array(CVX.rowOfVault),
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.scope.user_id)
          return await ctx.runQuery(vaults.listVaults, args)
        },
      }),
      getVault: publicQuery({
        args:    CVX.getVaultArgs,
        returns: v.any(),
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.scope.user_id)
          return await ctx.runQuery(vaults.getVault, args)
        },
      }),
      listBoxes: publicQuery({
        args:    CVX.listBoxesArgs,
        returns: CVX.boxesFetched,
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.asked.user_id)
          return await ctx.runQuery(vaults.listBoxes, args)
        },
      }),
      getBox: publicQuery({
        args:    CVX.getBoxArgs,
        returns: CVX.boxFetched,
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.asked.user_id)
          return await ctx.runQuery(vaults.getBox, args)
        },
      }),
      putVault: publicMutation({
        args:    CVX.putVaultArgs,
        returns: CVX.landing,
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.record.user_id)
          return await ctx.runMutation(vaults.putVault, args)
        },
      }),
      putBox: publicMutation({
        args:    CVX.putBoxArgs,
        returns: CVX.putBoxAnswer,
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.record.user_id)
          return await ctx.runMutation(vaults.putBox, args)
        },
      }),
      delVault: publicMutation({
        args:    CVX.delVaultArgs,
        returns: CVX.landing,
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.tombstone.user_id)
          return await ctx.runMutation(vaults.delVault, args)
        },
      }),
      delBox: publicMutation({
        args:    CVX.delBoxArgs,
        returns: CVX.boxLanding,
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.tombstone.user_id)
          return await ctx.runMutation(vaults.delBox, args)
        },
      }),
      tidyGone: publicMutation({
        args:    CVX.tidyGoneArgs,
        returns: CVX.tidied,
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.scope.user_id)
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

/** The host's safebyok functions as its clients reference them, `api.safebyok`, once re-exported from `convex/safebyok.ts`. */
export type SafebyokApi = {
  [Fnname in keyof ComponentApi['vaults']]: ComponentApi['vaults'][Fnname] extends FunctionReference<infer Fnkind, infer _Visibility, infer ArgsT, infer ReturnT>
    ? FunctionReference<Fnkind, 'public', ArgsT, ReturnT>
    : never
}
// --

// == [Checks]: componentCheck, safebyokApiOpts

/** The check of what {@link SafebyokComponent} wraps: an object, as `components.safebyok` is, and not the undefined a missing install leaves. */
const componentCheck = SX.Checker(({ custom }) => custom<ComponentApi>((candidate) => ((typeof candidate === 'object') || (typeof candidate === 'function')) && (candidate !== null), Phrases.ComponentExpected), 'bad_option')

/** The check of {@link SafebyokComponent.api}'s options. */
const safebyokApiOpts = SX.objCheck(({ fn }) => ({ getUserId: fn<GetUserId>() }), 'bad_option')
// --
