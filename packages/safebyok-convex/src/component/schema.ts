import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

// Each row is stored whole, exactly as the core wrote it, beside the labels used to find it. The
// component writes what it is given and checks a row only with the core's own predicates, so a row
// the core would call damaged is stored and returned unchanged. `user_id` leads every index, so one
// user's rows form a single index range.

/** The component's tables: ciphertext rows, the labels used to find them, and a tally per vault life. */
export default defineSchema({
  safebyok_vaults: defineTable({
    applabel:   v.string(),
    user_id:    v.string(),
    vaultlabel: v.string(),
    vault:      v.any(),
  })
    .index('by_scope', ['user_id', 'applabel', 'vaultlabel']),
  safebyok_boxes: defineTable({
    applabel:   v.string(),
    user_id:    v.string(),
    vaultlabel: v.string(),
    vault_tok:  v.string(),
    boxlabel:   v.string(),
    box:        v.any(),
  })
    .index('by_box', ['user_id', 'applabel', 'vaultlabel', 'vault_tok', 'boxlabel']),
  safebyok_tallies: defineTable({
    applabel:   v.string(),
    user_id:    v.string(),
    vaultlabel: v.string(),
    vault_tok:  v.string(),
    box_count:  v.number(),
    box_bytes:  v.number(),
  })
    .index('by_life', ['user_id', 'applabel', 'vaultlabel', 'vault_tok']),
})
