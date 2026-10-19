import { mutationGeneric, queryGeneric } from 'convex/server'
import type { ApiFromModules, GenericDataModel, GenericQueryCtx, MutationBuilder, QueryBuilder } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import { VaultError } from 'safebyok'
import type { ComponentApi } from './component-api'
import type { SafebyokErrorData } from './refusals'
import {
  VaultPropsExpectation, VaultDelExpectation, ListedBox, BoxRecord, BoxExpectation, BoxDelExpectation, BoxDeletion, VaultProps, VaultScope, VaultSignature,
} from './component/validators'

export type { ComponentApi } from './component-api'
export { SafebyokErrorKindVals } from './refusals'
export type { SafebyokErrorData, SafebyokErrorKind } from './refusals'

/**
 * The host app's answer to "who is calling?": the signed-in user's id, as the vault scopes it, or
 * null (or undefined, or empty) when no one is signed in. Runs first in every safebyok function.
 * To refuse a signed-in user by a rule of the app's own, it throws a `ConvexError` whose `data` is
 * `{ kind: 'not_permitted', message }` ({@link SafebyokErrorData}), which reaches the client's
 * vault as a refusal of that kind, locking nothing; `identity_revoked` likewise, which locks the
 * vault, for a user the app knows is gone. Anything else it throws is the client's
 * `storage_unavailable`, as a passing fault.
 *
 * @example async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null
 * @example
 *   async (ctx) => {
 *     const identity = await ctx.auth.getUserIdentity()
 *     if (identity?.['suspended'] === true) {
 *       throw new ConvexError<SafebyokErrorData>({ kind: 'not_permitted', message: 'This account is suspended: its vault is closed to it.' })
 *     }
 *     return identity?.subject ?? null
 *   }
 */
export type GetUserId<DataModel extends GenericDataModel = GenericDataModel> =
  (ctx: GenericQueryCtx<DataModel>) => Promise<string | null | undefined> | string | null | undefined

/** What {@link SafebyokComponent.api} needs from the host app. */
export type SafebyokApiOpts<DataModel extends GenericDataModel = GenericDataModel> = {
  /** Who is calling: see {@link GetUserId}. */
  getUserId: GetUserId<DataModel>
}

/**
 * safebyok's storage on Convex, as the host app serves it: wraps the installed component
 * (`components.safebyok`) and hands back the functions the host re-exports from its own
 * `convex/` directory, each authenticating its caller through the host's {@link GetUserId}.
 *
 * @example
 *   // convex/safebyok.ts
 *   import { SafebyokComponent } from 'safebyok-convex/server'
 *   import { components } from './_generated/api'
 *
 *   export const {
 *     getVaultProps, ensureVaultProps, putVaultProps, getBox, listBoxSummaries,
 *     putBox, delBox, delVault, watchVault,
 *   } = new SafebyokComponent(components.safebyok).api({
 *     getUserId: async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null,
 *   })
 */
export class SafebyokComponent {
  private readonly component: ComponentApi

  /**
   * @param component - The installed component, `components.safebyok` from the host's generated api.
   *   Kind 'bad_option' for anything that is not an object, such as the `undefined` a forgotten
   *   install leaves.
   */
  constructor(component: ComponentApi) {
    if ((component as unknown) === null || (typeof component !== 'object' && typeof component !== 'function')) {
      throw new VaultError('bad_option', "SafebyokComponent takes the installed component, components.safebyok from your generated api: install it with app.use(safebyok) in convex.config.ts, then run Convex codegen.")
    }
    this.component = component
  }

  /**
   * The nine public functions a client's `convexVaultDB` calls, one per storage verb. Each first
   * resolves `getUserId(ctx)`, and refuses with a `ConvexError` of kind `identity_revoked` when
   * it is null, or when the vault's `user_id` is someone else's -- the user the vault was opened
   * for is not the one signed in, and the vault locks itself -- then it calls the component. A
   * refusal `getUserId` throws itself goes to the client as it was thrown.
   *
   * @param opts - `getUserId`: who is calling, from the host's own auth.
   * @returns The functions, to export under these names from one module of the host's `convex/`.
   *   Kind 'bad_option', here and now rather than on the first request, for options that are not
   *   a bag holding a `getUserId` function.
   */
  api<DataModel extends GenericDataModel>(opts: SafebyokApiOpts<DataModel>) {
    if (typeof (opts as Partial<SafebyokApiOpts<DataModel>> | null | undefined)?.getUserId !== 'function') {
      throw new VaultError('bad_option', "SafebyokComponent.api takes { getUserId }, a function that answers who is signed in: async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null.")
    }
    const { vaults } = this.component
    // Convex's builders, typed by the host's data model, as its own codegen types them: each
    // handler's ctx is then the one the host's getUserId is written against.
    const publicQuery: QueryBuilder<DataModel, 'public'> = queryGeneric
    const publicMutation: MutationBuilder<DataModel, 'public'> = mutationGeneric

    /** Refuses unless the caller is signed in as `userId`, the vault's own user. */
    const mustBe = async (ctx: GenericQueryCtx<DataModel>, userId: string): Promise<void> => {
      // Called as a method of the host's bag, so a getUserId that leans on `this` works.
      const callerId = await opts.getUserId(ctx)
      if (! callerId) {
        throw identityRevoked('No one is signed in, so this vault cannot be reached: sign in, then try again.')
      }
      if (callerId !== userId) {
        throw identityRevoked('This vault belongs to another user than the one signed in: a signed-in user reaches only their own vaults. If the user changed, open the vault for the new one.')
      }
    }

    return {
      getVaultProps: publicQuery({
        args:    { scope: VaultScope },
        returns: v.nullable(VaultProps),
        handler: async (ctx, args) => {
          await mustBe(ctx, args.scope.user_id)
          return await ctx.runQuery(vaults.getVaultProps, args)
        },
      }),
      ensureVaultProps: publicMutation({
        args:    { vaultProps: VaultProps },
        returns: VaultProps,
        handler: async (ctx, args) => {
          await mustBe(ctx, args.vaultProps.user_id)
          return await ctx.runMutation(vaults.ensureVaultProps, args)
        },
      }),
      putVaultProps: publicMutation({
        args:    { vaultProps: VaultProps, expected: VaultPropsExpectation },
        returns: v.boolean(),
        handler: async (ctx, args) => {
          await mustBe(ctx, args.vaultProps.user_id)
          return await ctx.runMutation(vaults.putVaultProps, args)
        },
      }),
      getBox: publicQuery({
        args:    { scope: VaultScope, boxlabel: v.string() },
        returns: v.nullable(BoxRecord),
        handler: async (ctx, args) => {
          await mustBe(ctx, args.scope.user_id)
          return await ctx.runQuery(vaults.getBox, args)
        },
      }),
      listBoxSummaries: publicQuery({
        args:    { scope: VaultScope },
        returns: v.array(ListedBox),
        handler: async (ctx, args) => {
          await mustBe(ctx, args.scope.user_id)
          return await ctx.runQuery(vaults.listBoxSummaries, args)
        },
      }),
      putBox: publicMutation({
        args:    { scope: VaultScope, box: BoxRecord, expected: BoxExpectation },
        returns: v.nullable(BoxRecord),
        handler: async (ctx, args) => {
          await mustBe(ctx, args.scope.user_id)
          return await ctx.runMutation(vaults.putBox, args)
        },
      }),
      delBox: publicMutation({
        args:    { scope: VaultScope, boxlabel: v.string(), expected: BoxDelExpectation },
        returns: v.nullable(BoxDeletion),
        handler: async (ctx, args) => {
          await mustBe(ctx, args.scope.user_id)
          return await ctx.runMutation(vaults.delBox, args)
        },
      }),
      delVault: publicMutation({
        args:    { scope: VaultScope, expected: VaultDelExpectation },
        returns: v.boolean(),
        handler: async (ctx, args) => {
          await mustBe(ctx, args.scope.user_id)
          return await ctx.runMutation(vaults.delVault, args)
        },
      }),
      watchVault: publicQuery({
        args:    { scope: VaultScope },
        returns: VaultSignature,
        handler: async (ctx, args) => {
          await mustBe(ctx, args.scope.user_id)
          return await ctx.runQuery(vaults.watchVault, args)
        },
      }),
    }
  }
}

/**
 * The host's safebyok functions as its clients reference them: the type of `api.safebyok` when
 * the host re-exports {@link SafebyokComponent.api}'s functions from `convex/safebyok.ts`.
 */
export type SafebyokApi = ApiFromModules<{ safebyok: ReturnType<SafebyokComponent['api']> }>['safebyok']

const identityRevoked = (message: string) => (
  new ConvexError<SafebyokErrorData>({ kind: 'identity_revoked', message })
)
