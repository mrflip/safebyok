import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

// Each row is stored whole, exactly as the core wrote it, beside the labels used to find it. The
// component writes what it is given and checks a row only with the core's own predicates, so a row
// the core would call damaged is stored and returned unchanged. `user_id` leads every index, so one
// user's rows form a single index range.

// The bankDB's tables are named apart from the vaultDB's, which share the component until the vaultDB is removed. A box row and
// a tally are found by the whole life pair, `bank_tok` and `vault_tok`, so each life's rows form one index range of their own.

/** The component's tables: ciphertext rows, the labels used to find them, and a tally per vault life, for the vaultDB and the bankDB. */
export default defineSchema({
  safebyok_banks: defineTable({
    user_id:   v.string(),
    banklabel: v.string(),
    bank:      v.any(),
  })
    .index('by_scope', ['user_id', 'banklabel']),
  safebyok_gates: defineTable({
    user_id:   v.string(),
    banklabel: v.string(),
    gatelabel: v.string(),
    gate:      v.any(),
  })
    .index('by_scope', ['user_id', 'banklabel', 'gatelabel']),
  safebyok_bank_vaults: defineTable({
    user_id:    v.string(),
    banklabel:  v.string(),
    vaultlabel: v.string(),
    vault:      v.any(),
  })
    .index('by_scope', ['user_id', 'banklabel', 'vaultlabel']),
  safebyok_bank_boxes: defineTable({
    user_id:    v.string(),
    banklabel:  v.string(),
    vaultlabel: v.string(),
    bank_tok:   v.string(),
    vault_tok:  v.string(),
    boxlabel:   v.string(),
    box:        v.any(),
  })
    .index('by_box', ['user_id', 'banklabel', 'vaultlabel', 'bank_tok', 'vault_tok', 'boxlabel']),
  safebyok_bank_tallies: defineTable({
    user_id:    v.string(),
    banklabel:  v.string(),
    vaultlabel: v.string(),
    bank_tok:   v.string(),
    vault_tok:  v.string(),
    all_count:  v.number(),
    live_count: v.number(),
    all_size:   v.number(),
    live_size:  v.number(),
  })
    .index('by_life', ['user_id', 'banklabel', 'vaultlabel', 'bank_tok', 'vault_tok']),
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
