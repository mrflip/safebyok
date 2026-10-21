import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { BoxRecord, VaultProps, VaultScope } from './validators'

/** The component's own tables, isolated from the host app's: ciphertext and unencrypted fields only.
 * Each row is a record as the core writes it, in typed columns. `user_id` leads every index, so an
 * account's rows are one range.
 */
export default defineSchema({
  /** One VaultProps per vault, as-is. */
  safebyok_vaults: defineTable(VaultProps)
    .index('by_scope', ['user_id', 'applabel', 'vaultlabel']),
  /** One BoxRecord per boxlabel, as-is, with its vault's scope columns beside it, added on write and stripped on read.
   * `by_box` serves one box (all four fields) and a vault's boxes (the first three).
   */
  safebyok_boxes: defineTable(BoxRecord.extend(VaultScope.fields))
    .index('by_box', ['user_id', 'applabel', 'vaultlabel', 'boxlabel']),
  /** One tally per vault, filed under its vault row: how many boxes it holds, and what they weigh as Convex counts bytes.
   * Every box write and delete keeps it in step, so a write checks the vault's limits without
   * reading the vault. A vault made anew starts a tally of its own. A vault with no tally is
   * counted at its next box write.
   */
  safebyok_vault_tallies: defineTable({
    vault_row_id: v.id('safebyok_vaults'),
    box_count:    v.number(),
    box_bytes:    v.number(),
  })
    .index('by_vault_row', ['vault_row_id']),
})
