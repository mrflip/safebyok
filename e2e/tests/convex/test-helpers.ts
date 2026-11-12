import { anyApi, defineSchema } from 'convex/server'
import { convexTest, defineTestApp } from 'convex-test'
import * as DB from 'safebyok/storage'
import { BW } from 'safebyok/testing'
import type { SafebyokBankApi } from 'safebyok-convex'
import { SafebyokBankComponent } from 'safebyok-convex/server'
import type { GetUserId } from 'safebyok-convex/server'
import { modules, register, schema } from 'safebyok-convex/test'

// Everything the core's tests use too, so a test here star-imports this one module as TH.
export * from 'safebyok/testing'

/** A host of only the component, its functions at the root, for a fake deployment whose clients act as any user. */
export const componentHost = () => ({ api: anyApi, createTest: () => convexTest({ schema, modules }) })

/** The component's bankDB functions at the root, as a client calls them: no host wrapper, no auth. */
export const rootBankApi = anyApi['banks'] as unknown as SafebyokBankApi

/** A host app as the README has it, built from `safebyok-convex`'s published entries: its bankDB functions served from `convex/safebyokBank.ts` through `getUserId`. */
export const bankHostWith = (getUserId: GetUserId) => {
  const app = defineTestApp({ schema: defineSchema({}), components: { safebyok: { register } } })
  return app.defineModules({ safebyokBank: new SafebyokBankComponent(app.components.safebyok).api({ getUserId }) })
}

/** The README's getUserId: the signed-in identity's subject, or null when no one is. */
export const bySubject: GetUserId = async (ctx) => {
  const identity = await ctx.auth.getUserIdentity()
  return identity?.subject ?? null
}

/** The args of `buildBank`: the build of `record` and its `main` gate over no bank, as a client sends it once the core has checked it. */
export const buildBankArgs = (record: DB.BX.BankRecord) => ({ ask: DB.BX.bankBuild.parse(BW.bankBuildAskOf(record)) })
