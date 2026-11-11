import { anyApi, defineSchema } from 'convex/server'
import { convexTest, defineTestApp } from 'convex-test'
import * as DB from 'safebyok/storage'
import { vaultPutAskOf } from 'safebyok/testing'
import type { SafebyokApi } from 'safebyok-convex'
import { SafebyokComponent } from 'safebyok-convex/server'
import type { GetUserId } from 'safebyok-convex/server'
import { modules, register, schema } from 'safebyok-convex/test'

// Everything the core's tests use too, so a test here star-imports this one module as TH.
export * from 'safebyok/testing'

/** A host of only the component, its functions at the root, for a fake deployment whose clients act as any user. */
export const componentHost = () => ({ api: anyApi, createTest: () => convexTest({ schema, modules }) })

/** The component's functions at the root, as a client calls them: no host wrapper, no auth. */
export const rootApi = anyApi['vaults'] as unknown as SafebyokApi

/** A host app as the README has it, built from `safebyok-convex`'s published entries: its functions served from `convex/safebyok.ts` through `getUserId`. */
export const hostWith = (getUserId: GetUserId) => {
  const app = defineTestApp({ schema: defineSchema({}), components: { safebyok: { register } } })
  return app.defineModules({ safebyok: new SafebyokComponent(app.components.safebyok).api({ getUserId }) })
}

/** The README's getUserId: the signed-in identity's subject, or null when no one is. */
export const bySubject: GetUserId = async (ctx) => {
  const identity = await ctx.auth.getUserIdentity()
  return identity?.subject ?? null
}

/** The args of `putVault`: the put of `record` over no row, its `expected` cut to the meta the core's check keeps, as a client sends it. */
export const putVaultArgs = (record: DB.VaultRecord) => {
  const ask = vaultPutAskOf(record)
  return { ask: { ...ask, expected: DB.rowMeta.parse(ask.expected) } }
}
