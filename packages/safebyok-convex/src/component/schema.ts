import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

// Each Thing is stored whole, exactly as the core wrote it, beside the scope it is found by. The component writes what it is
// given and checks a Thing only with the core's own classifier, so a Thing the core would call damaged is stored and returned
// unchanged. The index sorts a bank's Things by labelpath, so the Things below one form a single range.

/** The component's one table: each Thing of a bank, ciphertext, at its scope. */
export default defineSchema({
  things: defineTable({
    userid:    v.string(),
    banklabel: v.string(),
    labelpath: v.string(),
    thing:     v.any(),
  })
    .index('by_scope', ['userid', 'banklabel', 'labelpath']),
})
