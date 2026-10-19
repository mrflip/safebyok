import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { Lockbox, VaultProps, VaultScope } from './validators'

/**
 * The component's own tables, isolated from the host app's. Each row is a record as the core
 * writes it, in typed columns: ciphertext and unencrypted fields only.
 *
 * `user_id` leads both indexes: every call is one user's, and an account's rows are one range.
 */
export default defineSchema({
  /** One VaultProps per vault, as-is. */
  safebyok_vaults: defineTable(VaultProps)
    .index('by_scope', ['user_id', 'applabel', 'vaultlabel']),
  /**
   * One Lockbox per boxlabel, as-is, with its vault's scope columns beside it: added on write,
   * stripped on read. `by_box` serves one box (all four fields) and a vault's boxes (the first three).
   */
  safebyok_lockboxes: defineTable(Lockbox.extend(VaultScope.fields))
    .index('by_box', ['user_id', 'applabel', 'vaultlabel', 'boxlabel']),
  /**
   * One tally per vault: how many lockboxes it holds and what they weigh as Convex counts bytes,
   * kept in step by every lockbox write and retire, so a write checks the vault's limits without
   * reading the vault. Filed under its vault row, so a vault made anew starts a tally of its
   * own. A vault with no tally yet -- one written before tallies were kept -- is counted at its
   * next lockbox write.
   */
  safebyok_vault_tallies: defineTable({
    vault_row_id:  v.id('safebyok_vaults'),
    lockbox_count: v.number(),
    lockbox_bytes: v.number(),
  })
    .index('by_vault_row', ['vault_row_id']),
})
