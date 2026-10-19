import { defineSchema } from 'convex/server'
import { defineTestApp } from 'convex-test'
import { SafebyokComponent } from 'safebyok-convex/server'
import type { GetUserId } from 'safebyok-convex/server'
import { register } from 'safebyok-convex/test'
import { boxOf } from 'safebyok/testing'

// Everything the core's tests use too, so a test here star-imports this one module as TH.
export * from 'safebyok/testing'

/**
 * A host app as the README has it: no tables of its own, the component installed as `safebyok`,
 * and its functions re-exported from `convex/safebyok.ts`, authenticating through `getUserId`.
 * Built from `safebyok-convex`'s published entries alone, as a host's own tests would.
 */
export const hostWith = (getUserId: GetUserId) => {
  const app = defineTestApp({ schema: defineSchema({}), components: { safebyok: { register } } })
  return app.defineModules({ safebyok: new SafebyokComponent(app.components.safebyok).api({ getUserId }) })
}

/** The README's getUserId: the signed-in identity's subject, or null when no one is. */
export const bySubject: GetUserId = async (ctx) => {
  const identity = await ctx.auth.getUserIdentity()
  return identity?.subject ?? null
}

/**
 * A box whose whisper's ciphertext is `bytes` long. Its tag goes into three of its fields, so
 * a replacement weighs exactly `bytes` more or less only under a tag as long as the one it replaces.
 */
export const heavyBox = (boxlabel: string, bytes: number, tag = boxlabel) => (
  boxOf(boxlabel, tag, { whisper_ciphered: { cipher_iv_b64: 'iv', ciphertext_b64: 'c'.repeat(bytes) } })
)

export const RealPassphrase = 'correct horse battery staple'
