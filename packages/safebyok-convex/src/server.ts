import { mutationGeneric, queryGeneric } from 'convex/server'
import type { ApiFromModules, GenericDataModel, GenericQueryCtx, MutationBuilder, QueryBuilder } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import { VaultError } from 'safebyok'
import type { ComponentApi } from './component-api'
import type { SafebyokErrorData } from './refusals'
import {
  Capacity, GatelessVaultProps, VaultAnswer, VaultPropsExpectation, VaultDelExpectation, BoxRecord, BoxGetExpectation, BoxExpectation, BoxDelExpectation, BoxDeletion, GetBoxAnswer, PutBoxAnswer, PutVaultPropsAnswer, Tombstone, VaultProps, VaultScope, VaultSignature,
} from './component/validators'

export type { ComponentApi } from './component-api'
export { SafebyokErrorKindVals } from './refusals'
export type { SafebyokErrorData, SafebyokErrorKind } from './refusals'

/** The host app's answer to "who is calling?": the signed-in user's id as the vault scopes it, or null, undefined or empty for no one.
 * It runs first in every safebyok function. To refuse a signed-in user by a rule of the app's own,
 * it throws a `ConvexError` whose `data` is `{ kind: 'not_permitted', message }` ({@link
 * SafebyokErrorData}), which locks nothing. `identity_revoked`, thrown likewise, locks the vault:
 * throw it only for a user the app knows is gone. Anything else it throws reaches the client as
 * `storage_unavailable`.
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

/** safebyok's storage on Convex as the host app serves it: the functions the host re-exports from its own `convex/`.
 * It wraps the installed component, `components.safebyok`, and each function authenticates its
 * caller through the host's {@link GetUserId}.
 *
 * @example
 *   // convex/safebyok.ts
 *   import { SafebyokComponent } from 'safebyok-convex/server'
 *   import { components } from './_generated/api'
 *
 *   export const {
 *     getVault, ensureVault, putVaultProps, getBox, putBox, getCapacity, delBox, delVault, watchVault,
 *   } = new SafebyokComponent(components.safebyok).api({
 *     getUserId: async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null,
 *   })
 */
export class SafebyokComponent {
  private readonly component: ComponentApi

  /** Wrap the installed component, `components.safebyok` from the host's generated api.
   * Kind 'bad_option' for anything that is not an object, such as the `undefined` a forgotten install leaves.
   */
  constructor(component: ComponentApi) {
    if ((component as unknown) === null || (typeof component !== 'object' && typeof component !== 'function')) {
      throw new VaultError('bad_option', "SafebyokComponent takes the installed component, components.safebyok from your generated api: install it with app.use(safebyok) in convex.config.ts, then run Convex codegen.")
    }
    this.component = component
  }

  /** The nine public functions a client's `convexVaultDB` calls, one per storage verb.
   * Export them under these names from one module of the host's `convex/`. Each refuses with
   * `identity_revoked` unless `getUserId` names the vault's own `user_id`, before it calls the
   * component. A refusal `getUserId` throws itself reaches the client as it was thrown. Kind
   * 'bad_option' at once, not on the first request, for options with no `getUserId` function.
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

    /** Refuses unless the caller is signed in as `user_id`, the vault's own user. */
    const mustBe = async (ctx: GenericQueryCtx<DataModel>, user_id: string): Promise<void> => {
      // Called as a method of the host's bag, so a getUserId that leans on `this` works.
      const callerId = await opts.getUserId(ctx)
      if (! callerId) {
        throw identityRevoked('No one is signed in, so this vault cannot be reached: sign in, then try again.')
      }
      if (callerId !== user_id) {
        throw identityRevoked('This vault belongs to another user than the one signed in: a signed-in user reaches only their own vaults. If the user changed, open the vault for the new one.')
      }
    }

    return {
      getVault: publicQuery({
        args:    { scope: VaultScope },
        returns: v.nullable(VaultAnswer),
        handler: async (ctx, args) => {
          await mustBe(ctx, args.scope.user_id)
          return await ctx.runQuery(vaults.getVault, args)
        },
      }),
      ensureVault: publicMutation({
        args:    { draft: GatelessVaultProps },
        returns: VaultAnswer,
        handler: async (ctx, args) => {
          await mustBe(ctx, args.draft.user_id)
          return await ctx.runMutation(vaults.ensureVault, args)
        },
      }),
      putVaultProps: publicMutation({
        args:    { vaultProps: VaultProps, expected: VaultPropsExpectation },
        returns: PutVaultPropsAnswer,
        handler: async (ctx, args) => {
          await mustBe(ctx, args.vaultProps.user_id)
          return await ctx.runMutation(vaults.putVaultProps, args)
        },
      }),
      getBox: publicQuery({
        args:    { scope: VaultScope, boxlabel: v.string(), expected: BoxGetExpectation },
        returns: GetBoxAnswer,
        handler: async (ctx, args) => {
          await mustBe(ctx, args.scope.user_id)
          return await ctx.runQuery(vaults.getBox, args)
        },
      }),
      putBox: publicMutation({
        args:    { scope: VaultScope, expected: BoxExpectation, box: BoxRecord },
        returns: PutBoxAnswer,
        handler: async (ctx, args) => {
          await mustBe(ctx, args.scope.user_id)
          return await ctx.runMutation(vaults.putBox, args)
        },
      }),
      getCapacity: publicQuery({
        args:    { scope: VaultScope },
        returns: Capacity,
        handler: async (ctx, args) => {
          await mustBe(ctx, args.scope.user_id)
          return await ctx.runQuery(vaults.getCapacity, args)
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
        returns: v.nullable(Tombstone),
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

/** The host's safebyok functions as its clients reference them: the type of `api.safebyok`.
 * That holds when the host re-exports {@link SafebyokComponent.api}'s functions from `convex/safebyok.ts`.
 */
export type SafebyokApi = ApiFromModules<{ safebyok: ReturnType<SafebyokComponent['api']> }>['safebyok']

const identityRevoked = (message: string) => (
  new ConvexError<SafebyokErrorData>({ kind: 'identity_revoked', message })
)
