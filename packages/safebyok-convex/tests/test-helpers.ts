import { anyApi, defineSchema } from 'convex/server'
import { ConvexError } from 'convex/values'
import { convexTest, defineTestApp } from 'convex-test'
import type { ComponentApi } from '../src/component-api'
import { SafebyokComponent } from '../src/server'
import type { GetUserId, SafebyokApi, SafebyokErrorData } from '../src/server'
import { modules, register, schema } from '../src/test'

// Everything the core's tests use too, so a test here star-imports this one module as TH.
export * from 'safebyok/testing'

/** The component's functions, called directly as a root app's: no host wrapper, no auth. */
export const vaults = anyApi['vaults'] as unknown as ComponentApi['vaults']

/** The component's functions at the root, as a client calls them: no host wrapper, no auth. */
export const rootApi = anyApi['vaults'] as unknown as SafebyokApi

/** A fresh in-memory backend holding only the component, its functions at the root, held to Convex's transaction limits if asked. */
export const componentTest = (transactionLimits = false) => convexTest({ schema, modules, transactionLimits })

/** A host of only the component, its functions at the root, for a fake deployment whose clients write as any user. */
export const componentHost = () => ({ api: anyApi, createTest: () => componentTest() })

/** A host app as the README has it: the component installed as `safebyok`, its functions served from `convex/safebyok.ts` through `getUserId`. */
export const hostWith = (getUserId: GetUserId) => {
  const { app, component } = installedComponent()
  return app.defineModules({ safebyok: component.api({ getUserId }) })
}

/** A host app with the component installed as `safebyok`, and the SafebyokComponent wrapping it. */
export const installedComponent = () => {
  const app = defineTestApp({ schema: defineSchema({}), components: { safebyok: { register } } })
  return { app, component: new SafebyokComponent(app.components.safebyok) }
}

/** The data of the ConvexError `operation` refused with, failing the test if it resolves. */
export const convexRefusalOf = async (operation: Promise<unknown>): Promise<SafebyokErrorData> => {
  try {
    await operation
  } catch (err) {
    if (err instanceof ConvexError) { return err.data as SafebyokErrorData }
    throw err
  }
  throw new Error('the call was not refused')
}

/** The README's getUserId: the signed-in identity's subject, or null when no one is. */
export const bySubject: GetUserId = async (ctx) => {
  const identity = await ctx.auth.getUserIdentity()
  return identity?.subject ?? null
}
