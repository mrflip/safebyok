/** The safebyok functions a host app serves from its own `convex/` folder. */

import { mutationGeneric, queryGeneric } from 'convex/server'
import type { FunctionReference, GenericDataModel, GenericQueryCtx, MutationBuilder, QueryBuilder } from 'convex/server'
import { ConvexError } from 'convex/values'
import * as DB from 'safebyok/storage'
import type { ComponentApi } from './component-api'
import * as CVX from './component/validators'
import * as Phrases from './phrases'
import type { SafebyokErrorData } from './refusals'

export type { ComponentApi } from './component-api'
export { safebyokErrorKindVals, safebyokErrorData, isSafebyokErrorData } from './refusals'
export type { SafebyokErrorData, SafebyokErrorKind } from './refusals'

// == [Options]: GetUserId, SafebyokApiOpts

/** A host function that returns the signed-in caller's `user_id`, or null, undefined or `''` when no one is signed in.
 *
 * @example async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null
 */
export type GetUserId<DataModel extends GenericDataModel = GenericDataModel> =
  (ctx: GenericQueryCtx<DataModel>) => Promise<string | null | undefined> | string | null | undefined

/** Options for {@link SafebyokBankComponent.api}. */
export type SafebyokApiOpts<DataModel extends GenericDataModel = GenericDataModel> = {
  /** Identifies the caller of each function. */
  getUserId: GetUserId<DataModel>
}
// --

// == [The wrapper]: SafebyokBankComponent, SafebyokBankApi

/** A wrapper around the installed safebyok component that serves its bankDB functions to signed-in users.
 *
 * @example
 *   // convex/safebyokBank.ts
 *   export const { ensureBank, buildBank, putGate, delBank, getVault, putVault, delVault, listBoxes, getBox, putBox, delBox, tidyGone, watchRows } =
 *     new SafebyokBankComponent(components.safebyok).api({
 *       getUserId: async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null,
 *     })
 */
export class SafebyokBankComponent {
  readonly #component: ComponentApi

  constructor(component: ComponentApi) {
    this.#component = componentCheck.parse(component, { where: 'SafebyokBankComponent', advice: Phrases.SafebyokBankComponentAdvice })
  }

  /** Build the public functions a `ConvexBankDB` calls, to export under these names from one module of the host's `convex/`.
   * Each refuses `identity_revoked` unless the caller is signed in as the `user_id` its scope or `ask` names.
   */
  api<DataModel extends GenericDataModel>(opts: SafebyokApiOpts<DataModel>) {
    // Validate only, and keep using `opts` itself: `getUserId` is called on the host's own object, so one that relies on `this` still works.
    safebyokApiOpts.parse(opts, { where: 'SafebyokBankComponent.api', advice: Phrases.SafebyokBankApiAdvice })
    const { banks } = this.#component
    // Convex's generic builders, typed with the host's data model as its codegen would type them, so each `ctx` has the type `getUserId` was written for.
    const publicQuery: QueryBuilder<DataModel, 'public'> = queryGeneric
    const publicMutation: MutationBuilder<DataModel, 'public'> = mutationGeneric

    // An ask is any value until the component parses it, so its `user_id` is read here with the core's own check of one.
    /** Throw `identity_revoked` unless the caller is signed in as the `user_id` of `scope`. */
    async function demandCaller(ctx: GenericQueryCtx<DataModel>, scope: unknown): Promise<void> {
      const callerId = await opts.getUserId(ctx)
      const asked = scopeUser.safeParse(scope)
      if ((! callerId) || (! asked.success) || (callerId !== asked.data.user_id)) { throw new ConvexError<SafebyokErrorData>({ kind: 'identity_revoked' }) }
    }

    return {
      ensureBank: publicQuery({
        args:    CVX.askArgs,
        returns: CVX.bankEnsureFetched,
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.ask)
          return await ctx.runQuery(banks.ensureBank, args)
        },
      }),
      buildBank: publicMutation({
        args:    CVX.askArgs,
        returns: CVX.bankBuilt,
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.ask)
          return await ctx.runMutation(banks.buildBank, args)
        },
      }),
      putGate: publicMutation({
        args:    CVX.askArgs,
        returns: CVX.gateWritten,
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.ask)
          return await ctx.runMutation(banks.putGate, args)
        },
      }),
      delBank: publicMutation({
        args:    CVX.askArgs,
        returns: CVX.bankWritten,
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.ask)
          return await ctx.runMutation(banks.delBank, args)
        },
      }),
      getVault: publicQuery({
        args:    CVX.askArgs,
        returns: CVX.vaultFetched,
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.ask)
          return await ctx.runQuery(banks.getVault, args)
        },
      }),
      putVault: publicMutation({
        args:    CVX.askArgs,
        returns: CVX.vaultWritten,
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.ask)
          return await ctx.runMutation(banks.putVault, args)
        },
      }),
      delVault: publicMutation({
        args:    CVX.askArgs,
        returns: CVX.vaultWritten,
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.ask)
          return await ctx.runMutation(banks.delVault, args)
        },
      }),
      listBoxes: publicQuery({
        args:    CVX.askArgs,
        returns: CVX.boxesFetched,
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.ask)
          return await ctx.runQuery(banks.listBoxes, args)
        },
      }),
      getBox: publicQuery({
        args:    CVX.askArgs,
        returns: CVX.boxFetched,
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.ask)
          return await ctx.runQuery(banks.getBox, args)
        },
      }),
      putBox: publicMutation({
        args:    CVX.putBoxArgs,
        returns: CVX.boxPutWritten,
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.ask)
          return await ctx.runMutation(banks.putBox, args)
        },
      }),
      delBox: publicMutation({
        args:    CVX.askArgs,
        returns: CVX.boxWritten,
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.ask)
          return await ctx.runMutation(banks.delBox, args)
        },
      }),
      tidyGone: publicMutation({
        args:    CVX.askArgs,
        returns: CVX.tidied,
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.ask)
          return await ctx.runMutation(banks.tidyGone, args)
        },
      }),
      watchRows: publicQuery({
        args:    CVX.watchRowsArgs,
        returns: CVX.rowsWatched,
        handler: async (ctx, args) => {
          await demandCaller(ctx, args.scope)
          return await ctx.runQuery(banks.watchRows, args)
        },
      }),
    }
  }
}

/** The host's public safebyok bankDB functions as its clients reference them: the type of `api.safebyokBank`. */
export type SafebyokBankApi = {
  [Fnname in keyof ComponentApi['banks']]: ComponentApi['banks'][Fnname] extends FunctionReference<infer Fnkind, infer _Visibility, infer ArgsT, infer ReturnT>
    ? FunctionReference<Fnkind, 'public', ArgsT, ReturnT>
    : never
}
// --

// == [Checks]: componentCheck, safebyokApiOpts, scopeUser

/** Validator for the component handed to {@link SafebyokBankComponent}: an object or a function, not null. */
const componentCheck = DB.Checker(({ custom }) => custom<ComponentApi>((candidate) => ((typeof candidate === 'object') || (typeof candidate === 'function')) && (candidate !== null), Phrases.ComponentExpected), 'bad_option')

/** Validator for {@link SafebyokApiOpts}. */
const safebyokApiOpts = DB.objCheck(({ fn }) => ({ getUserId: fn<GetUserId>() }), 'bad_option')

/** Validator for the `user_id` an ask or a watch's scope names. It strips the other fields, which the component checks. */
const scopeUser = DB.objCheck(({ user_id }) => ({ user_id }), { refusalkind: 'identity_revoked', extras: 'strip' })
// --
