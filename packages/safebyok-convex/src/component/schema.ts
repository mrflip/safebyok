import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

// Each row is held whole, as the core wrote it, under the labels it is found by: the component
// writes what it is handed and judges a row only through the core's own predicates, so a row the
// core would call damaged is kept as it is and read back as it is. `user_id` leads every index, so
// one user's rows are one range.

/** The component's own tables: ciphertext and the labels that find it. */
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
