import { anyApi, defineSchema } from 'convex/server'
import { ConvexError } from 'convex/values'
import { convexTest, defineTestApp } from 'convex-test'
import { SafebyokVaultComponent } from '../src/server'
import type { GetUserId, SafebyokRefusal, SafebyokVaultApi } from '../src/server'
import { modules, register, schema } from '../src/test'

// Re-export the core's test helpers, so a test here can star-import this one module as TH.
export * from 'safebyok/testing'

/** The component's vaultDB functions typed as a client calls them (`SafebyokVaultApi`), at the root: no host wrapper and no auth. */
export const rootVaultApi = anyApi['things'] as unknown as SafebyokVaultApi

/** Make a fresh in-memory backend with only the component, its functions at the root. */
export function componentTest() { return convexTest({ schema, modules }) }

/** Make a host with only the component, its functions at the root, for a fake deployment whose clients may write as any user. */
export function componentHost() { return { api: anyApi, createTest: () => componentTest() } }

/** Make a host like {@link componentHost} whose backend refuses a function that writes more than `documentsWritten` documents. */
export function componentHostWritingAtMost(documentsWritten: number) {
  return { api: anyApi, createTest: () => convexTest({ schema, modules, transactionLimits: { documentsWritten } }) }
}

/** Make a host app with the component installed as `safebyok`, and the SafebyokVaultComponent that wraps it. */
export function installedVaultComponent() {
  const app = defineTestApp({ schema: defineSchema({}), components: { safebyok: { register } } })
  return { app, component: new SafebyokVaultComponent(app.components.safebyok) }
}

/** Make a host app set up as the README shows: the component installed as `safebyok`, and its vaultDB functions served from `convex/safebyokVault.ts` using `getUserId`. */
export function vaultHostWith(getUserId: GetUserId) {
  const { app, component } = installedVaultComponent()
  return app.defineModules({ safebyokVault: component.api({ getUserId }) })
}

/** Return the `data` of the ConvexError that `operation` rejects with. Fails the test if `operation` resolves. */
export async function convexRefusalOf(operation: Promise<unknown>): Promise<SafebyokRefusal> {
  try {
    await operation
  } catch (err) {
    if (err instanceof ConvexError) { return err.data as SafebyokRefusal }
    throw err
  }
  throw new Error('the call was not refused')
}

/** The README's `getUserId`: returns the signed-in identity's subject, or null when no one is signed in. */
export const bySubject: GetUserId = async (ctx) => {
  const identity = await ctx.auth.getUserIdentity()
  return identity?.subject ?? null
}
