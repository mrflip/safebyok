import { anyApi, defineSchema } from 'convex/server'
import { ConvexError } from 'convex/values'
import { convexTest, defineTestApp } from 'convex-test'
import { Lockbox, VaultBundle, localVaultDB, memoryStore, openVault } from 'safebyok'
import type { PublicBag, StringStore, Whisper } from 'safebyok'
import { boxOf, memoryVaultOpts } from 'safebyok/testing'
import type { ComponentApi } from '../src/component-api'
import { SafebyokComponent } from '../src/server'
import type { GetUserId, SafebyokErrorData } from '../src/server'
import { modules, register, schema } from '../src/test'

// Everything the core's tests use too, so a test here star-imports this one module as TH.
export * from 'safebyok/testing'

/** The component's functions, called directly as a root app's: no host wrapper, no auth. */
export const vaults = anyApi['vaults'] as unknown as ComponentApi['vaults']

/**
 * A fresh in-memory backend holding only the component, its functions at the root. With
 * `transactionLimits`, it enforces Convex's own per-transaction limits.
 */
export const componentTest = (transactionLimits = false) => convexTest({ schema, modules, transactionLimits })

/**
 * A host app as the README has it: no tables of its own, the component installed as `safebyok`,
 * and its functions re-exported from `convex/safebyok.ts`, authenticating through `getUserId`.
 */
export const hostWith = (getUserId: GetUserId) => {
  const app = defineTestApp({ schema: defineSchema({}), components: { safebyok: { register } } })
  return app.defineModules({ safebyok: new SafebyokComponent(app.components.safebyok).api({ getUserId }) })
}

/**
 * The data of the ConvexError `operation` refused with: the component's and the host wrapper's
 * way of refusing, which reaches a client as data rather than as a VaultError. The test fails if
 * `operation` resolves, and any other error is thrown on.
 *
 * @param operation - The call that should refuse.
 * @returns The refusal's data, its `kind` and `message`.
 *
 * @example
 *   const refusal = await TH.convexRefusalOf(t.query(api.safebyok.getBundle, { scope }))
 *   expect(refusal.kind).to.eq('identity_revoked')
 */
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

/**
 * A lockbox whose whisper's ciphertext is `bytes` long. Its tag goes into three of its fields, so
 * a replacement weighs exactly `bytes` more or less only under a tag as long as the one it replaces.
 */
export const heavyBox = (boxlabel: string, bytes: number, tag = boxlabel) => (
  boxOf(boxlabel, tag, { whisper_ciphered: { cipher_iv_b64: 'iv', ciphertext_b64: 'c'.repeat(bytes) } })
)

/** The whispers a real vault is made with: obvious fakes, never real keys. */
export const RealWhispers: Record<string, { whisper: Whisper, bag?: PublicBag }> = {
  anthropic_api_key: { whisper: 'sk-ant-test-not-a-real-key', bag: { note: 'work account' } },
  openai_api_key:    { whisper: { apiKey: 'sk-test-not-a-real-key', orgId: null } },
}

export const RealPassphrase = 'correct horse battery staple'

/** Opens a vault for `userId` over `store` the way an app does, deriving through the cheap test deriver. */
export const openOver = (store: StringStore, userId = 'u1') => openVault(memoryVaultOpts({ userId, vaultDB: localVaultDB(store) }))

/**
 * A real vault, made by the core's own code: a bundle and a lockbox per {@link RealWhispers}
 * entry, each record exactly as the core stores it, read back from its in-memory store by ckey.
 */
export const realRecords = async (userId = 'u1') => {
  const store = memoryStore()
  const vault = await openOver(store, userId)
  await vault.unlock(RealPassphrase)
  for (const [boxlabel, { whisper, bag }] of Object.entries(RealWhispers)) {
    await vault.store(boxlabel, whisper, { public: bag })
  }
  vault.close()
  const rows = store.ckeys().map((ckey) => ({ ckey, record: JSON.parse(store.read(ckey) ?? 'null') as unknown }))
  const bundleRow = rows.find((row) => VaultBundle.safeParse(row.record).success)
  if (! bundleRow) { throw new Error('the core stored no bundle') }
  return {
    bundleCkey: bundleRow.ckey,
    bundle:     VaultBundle.parse(bundleRow.record),
    boxes:      rows.flatMap((row) => {
      const checked = Lockbox.safeParse(row.record)
      return checked.success ? { ckey: row.ckey, lockbox: checked.data } : []
    }),
  }
}
