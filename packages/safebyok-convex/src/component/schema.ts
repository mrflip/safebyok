import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

// Each row is stored whole, exactly as the core wrote it, beside the labels used to find it. The
// component writes what it is given and checks a row only with the core's own predicates, so a row
// the core would call damaged is stored and returned unchanged. `user_id` leads every index, so one
// user's rows form a single index range.

/** The component's tables: ciphertext rows, the labels used to find them, and a tally per vault life. */
export default defineSchema({
  safebyok_vaults: defineTable({
    user_id:    v.string(),
    banklabel:  v.string(),
    vaultlabel: v.string(),
    vault:      v.any(),
  })
    .index('by_scope', ['user_id', 'banklabel', 'vaultlabel']),
  safebyok_boxes: defineTable({
    user_id:    v.string(),
    banklabel:  v.string(),
    vaultlabel: v.string(),
    vault_tok:  v.string(),
    boxlabel:   v.string(),
    box:        v.any(),
  })
    .index('by_box', ['user_id', 'banklabel', 'vaultlabel', 'vault_tok', 'boxlabel']),
  safebyok_tallies: defineTable({
    user_id:    v.string(),
    banklabel:  v.string(),
    vaultlabel: v.string(),
    vault_tok:  v.string(),
    all_count:  v.number(),
    live_count: v.number(),
    all_size:   v.number(),
    live_size:  v.number(),
  })
    .index('by_life', ['user_id', 'banklabel', 'vaultlabel', 'vault_tok']),
})
