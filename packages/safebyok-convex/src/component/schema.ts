import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { $brand } from 'zod/v4/core' // eslint-disable-line @typescript-eslint/no-unused-vars -- named for the emitted declarations, which carry the core's brand on a salt
import * as CVX from './validators'

/** The component's own tables, isolated from the host app's: ciphertext and unencrypted fields only.
 * Each row is a record as the core writes it, in typed columns, a salt the core brands keeping its
 * {@link $brand}. `user_id` leads every index, so an account's rows are one range.
 */
export default defineSchema({
  /** One VaultRecord per vault, as-is. */
  safebyok_vaults: defineTable(CVX.vaultRecord)
    .index('by_scope', ['user_id', 'applabel', 'vaultlabel']),
  /** One VaultTombstone per scope whose vault was deleted and not made anew: a scope holds a vault row or a tombstone, never both. */
  safebyok_vault_tombstones: defineTable(CVX.vaultTombstone)
    .index('by_scope', ['user_id', 'applabel', 'vaultlabel']),
  /** One BoxRecord per boxlabel, as-is, with its vault's scope columns beside it, added on write and stripped on read.
   * `by_box` serves one box (all four fields) and a vault's boxes (the first three).
   */
  safebyok_boxes: defineTable(CVX.boxRecord.extend(CVX.vaultScope.fields))
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
