import { anyApi, defineSchema } from 'convex/server'
import { ConvexError } from 'convex/values'
import { convexTest, defineTestApp } from 'convex-test'
import { BoxRecord, VaultRecord, localVaultDB, memoryStore } from 'safebyok'
import type { GatedVaultRecord, Sidecar, StringStore, VaultScope, Whisper } from 'safebyok'
import { boxOf, closeVault, type FakeCiphered, memoryVaultOpts, settledVault, unlock } from 'safebyok/testing'
import type { ComponentApi } from '../src/component-api'
import { SafebyokComponent } from '../src/server'
import type { GetUserId, SafebyokErrorData } from '../src/server'
import { modules, register, schema } from '../src/test'

// Everything the core's tests use too, so a test here star-imports this one module as TH.
export * from 'safebyok/testing'

/** The component's functions, called directly as a root app's: no host wrapper, no auth. */
export const vaults = anyApi['vaults'] as unknown as ComponentApi['vaults']

/**
 * A fresh in-memory CVX holding only the component, its functions at the root. With
 * `transactionLimits`, it enforces Convex's own per-transaction limits.
 */
export const componentTest = (transactionLimits = false) => convexTest({ schema, modules, transactionLimits })

/**
 * Store `vaultRecord` in a component test's CVX as a first unlock does: the vault ensured novel,
 * then its gate written over it expecting `gate_epoch` 0. Resolves the vault record as stored, its
 * `vault_epoch` the component's.
 *
 * @example const stored = await ensureGatedIn(CVX, vaultRecordOf('u1'))   // stored.vault_epoch is 1
 */
export const ensureGatedIn = async (CVX: ReturnType<typeof componentTest>, vaultRecord: GatedVaultRecord) => {
  await CVX.mutation(vaults.ensureVault, { draft: { ...vaultRecord, vault_epoch: 0, gate_epoch: 0, gate: null } })
  const answer = await CVX.mutation(vaults.putVaultRecord, { vaultRecord: vaultRecord, expected: { vault_tok: vaultRecord.vault_tok, gate_epoch: 0 } })
  if (! answer.landed) { throw new Error('The first gate of a new vault did not land.') }
  return answer.vault_stored
}

/** The vault record a component test's CVX holds for `scope`, as `getVault` reads it, or null. */
export const storedVaultRecordIn = async (CVX: ReturnType<typeof componentTest>, scope: VaultScope) => {
  const read = await CVX.query(vaults.getVault, { ...scope })
  return read?.vault ?? null
}

/** The listing a component test's CVX shows for `scope`, as `getVault` reads it: empty where no vault is stored. */
export const boxesIn = async (CVX: ReturnType<typeof componentTest>, scope: VaultScope) => {
  const read = await CVX.query(vaults.getVault, { ...scope })
  return read?.boxes ?? []
}

/**
 * A host app as the README has it: no tables of its own, the component installed as `safebyok`,
 * and its functions re-exported from `convex/safebyok.ts`, authenticating through `getUserId`.
 */
export const hostWith = (getUserId: GetUserId) => {
  const { app, component } = installedComponent()
  return app.defineModules({ safebyok: component.api({ getUserId }) })
}

/** A host app with the component installed as `safebyok`, and the SafebyokComponent wrapping it: for a test that builds `api` with options of its own. */
export const installedComponent = () => {
  const app = defineTestApp({ schema: defineSchema({}), components: { safebyok: { register } } })
  return { app, component: new SafebyokComponent(app.components.safebyok) }
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
 *   const refusal = await TH.convexRefusalOf(CVX.query(api.safebyok.getVaultRecord, { ...scope }))
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

/**
 * `GetUserId`'s second example: the signed-in identity's subject, refusing a suspended one
 * `not_permitted`.
 */
export const unlessSuspended: GetUserId = async (ctx) => {
  const identity = await ctx.auth.getUserIdentity()
  if (identity?.['suspended'] === true) {
    throw new ConvexError<SafebyokErrorData>({ kind: 'not_permitted', message: 'This account is suspended: its vault is closed to it.' })
  }
  return identity?.subject ?? null
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
  boxOf(boxlabel, tag, { whisper_ciphered: { cipher_iv_b64: 'iv', ciphertext_b64: 'c'.repeat(bytes) } as FakeCiphered })
)

/** The whispers a real vault is made with: obvious fakes, never real keys. */
export const RealWhispers: Record<string, { whisper: Whisper, sidecar?: Sidecar }> = {
  anthropic_api_key: { whisper: 'sk-ant-test-not-a-real-key', sidecar: { note: 'work account' } },
  openai_api_key:    { whisper: { apiKey: 'sk-test-not-a-real-key', orgId: null } },
}

export const RealPassphrase = 'correct horse battery staple'

/** Opens a vault for `user_id` over `store` the way an app does, deriving through the cheap test deriver. */
export const openOver = (store: StringStore, user_id = 'u1') => settledVault(memoryVaultOpts({ user_id, vaultDB: localVaultDB({ store }) }))

/**
 * A real vault, made by the core's own code: vault record and a box per {@link RealWhispers}
 * entry, each record exactly as the core stores it, read back from its in-memory store by ckey.
 */
export const realRecords = async (user_id = 'u1') => {
  const store = memoryStore()
  const vault = await openOver(store, user_id)
  await unlock(vault, RealPassphrase)
  for (const [boxlabel, { whisper, sidecar }] of Object.entries(RealWhispers)) {
    await vault.putBox({ boxlabel, sidecar }, whisper)
  }
  closeVault(vault)
  const rows = store.scopepaths().map((ckey) => ({ ckey, record: JSON.parse(store.read(ckey) ?? 'null') as unknown }))
  const vaultRecordRow = rows.find((row) => VaultRecord.safeParse(row.record).success)
  if (! vaultRecordRow) { throw new Error('the core stored no vault record') }
  return {
    vaultRecordCkey: vaultRecordRow.ckey,
    vaultRecord:     VaultRecord.parse(vaultRecordRow.record),
    boxes:           rows.flatMap((row) => {
      const checked = BoxRecord.safeParse(row.record)
      return checked.success ? { ckey: row.ckey, box: checked.data } : []
    }),
  }
}
