import { anyApi, defineSchema } from 'convex/server'
import { ConvexError } from 'convex/values'
import { convexTest, defineTestApp } from 'convex-test'
import { SafebyokBankComponent } from '../src/server'
import type { GetUserId, SafebyokBankApi, SafebyokErrorData } from '../src/server'
import { modules, register, schema } from '../src/test'

// Re-export the core's test helpers, so a test here can star-import this one module as TH.
export * from 'safebyok-big/testing'

/** The component's bankDB functions typed as a client calls them (`SafebyokBankApi`), at the root: no host wrapper and no auth. */
export const rootBankApi = anyApi['banks'] as unknown as SafebyokBankApi

/** Make a fresh in-memory backend with only the component, its functions at the root. Pass true to enforce Convex's transaction limits. */
export function componentTest(transactionLimits = false) { return convexTest({ schema, modules, transactionLimits }) }

/** Make a host with only the component, its functions at the root, for a fake deployment whose clients may write as any user. */
export function componentHost() { return { api: anyApi, createTest: () => componentTest() } }

/** Make a host app with the component installed as `safebyok`, and the SafebyokBankComponent that wraps it. */
export function installedBankComponent() {
  const app = defineTestApp({ schema: defineSchema({}), components: { safebyok: { register } } })
  return { app, component: new SafebyokBankComponent(app.components.safebyok) }
}

/** Make a host app set up as the README shows for the bankDB: the component installed as `safebyok`, and its bankDB functions served from `convex/safebyokBank.ts` using `getUserId`. */
export function bankHostWith(getUserId: GetUserId) {
  const { app, component } = installedBankComponent()
  return app.defineModules({ safebyokBank: component.api({ getUserId }) })
}

/** Return the `data` of the ConvexError that `operation` rejects with. Fails the test if `operation` resolves. */
export async function convexRefusalOf(operation: Promise<unknown>): Promise<SafebyokErrorData> {
  try {
    await operation
  } catch (err) {
    if (err instanceof ConvexError) { return err.data as SafebyokErrorData }
    throw err
  }
  throw new Error('the call was not refused')
}

/** The README's `getUserId`: returns the signed-in identity's subject, or null when no one is signed in. */
export const bySubject: GetUserId = async (ctx) => {
  const identity = await ctx.auth.getUserIdentity()
  return identity?.subject ?? null
}
