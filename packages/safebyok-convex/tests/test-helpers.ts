import { anyApi, defineSchema } from 'convex/server'
import { ConvexError } from 'convex/values'
import { convexTest, defineTestApp } from 'convex-test'
import * as DB from 'safebyok/storage'
import { boxDelAskOf, boxPutAskOf, vaultDelAskOf, vaultPutAskOf } from 'safebyok/testing'
import type { ComponentApi } from '../src/component-api'
import { SafebyokComponent } from '../src/server'
import type { GetUserId, SafebyokApi, SafebyokErrorData } from '../src/server'
import { modules, register, schema } from '../src/test'

// Re-export the core's test helpers, so a test here can star-import this one module as TH.
export * from 'safebyok/testing'

/** The component's functions, called directly at the root: no host wrapper and no auth. */
export const vaults = anyApi['vaults'] as unknown as ComponentApi['vaults']

/** The same functions typed as a client calls them (`SafebyokApi`): no host wrapper and no auth. */
export const rootApi = anyApi['vaults'] as unknown as SafebyokApi

/** Make a fresh in-memory backend with only the component, its functions at the root. Pass true to enforce Convex's transaction limits. */
export function componentTest(transactionLimits = false) { return convexTest({ schema, modules, transactionLimits }) }

/** Make a host with only the component, its functions at the root, for a fake deployment whose clients may write as any user. */
export function componentHost() { return { api: anyApi, createTest: () => componentTest() } }

/** Make a host app set up as the README shows: the component installed as `safebyok`, and its functions served from `convex/safebyok.ts` using `getUserId`. */
export function hostWith(getUserId: GetUserId) {
  const { app, component } = installedComponent()
  return app.defineModules({ safebyok: component.api({ getUserId }) })
}

/** Make a host app with the component installed as `safebyok`, and the SafebyokComponent that wraps it. */
export function installedComponent() {
  const app = defineTestApp({ schema: defineSchema({}), components: { safebyok: { register } } })
  return { app, component: new SafebyokComponent(app.components.safebyok) }
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

/** `ask` as a client sends it once the core has checked it: its `expected` row cut to the meta the check keeps. */
export function sentAskOf<AskT extends DB.VaultPutAsk | DB.VaultDelAsk | DB.BoxPutAsk | DB.BoxDelAsk>(ask: AskT): AskT {
  const { box_tok, ...expected }: Record<string, unknown> = ask.expected
  const meta = DB.rowMeta.parse(expected)
  return { ...ask, expected: (box_tok === undefined) ? meta : { ...meta, box_tok } }
}

/** The args of `putVault`: the put of `record` over the row `ante`, or over none. */
export function putVaultArgs(record: DB.VaultRecord, ante: DB.VaultRow | null = null) { return { ask: sentAskOf(vaultPutAskOf(record, ante)) } }

/** The args of `putBox`: the put of `record` over the row `ante`, or over none, under the soft cap `maxBoxes` where given. */
export function putBoxArgs(record: DB.BoxRecord, ante: DB.BoxRow | null = null, maxBoxes?: number) {
  return {
    ask: sentAskOf(boxPutAskOf(record, ante)), ...((maxBoxes !== undefined) && { maxBoxes }),
  }
}

/** The args of `delVault`: the del of the vault row `ante`. */
export function delVaultArgs(ante: DB.VaultRow) { return { ask: sentAskOf(vaultDelAskOf(ante)) } }

/** The args of `delBox`: the del of the box row `ante`. */
export function delBoxArgs(ante: DB.BoxRow) { return { ask: sentAskOf(boxDelAskOf(ante)) } }
