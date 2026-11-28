import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Thingkind } from 'safebyok/storage'

// A table for each kind of Thing, with a field for each of the Thing's fields, as safebyok-postgres has a column for each
// (`VaultTablesSql`); a field that is an object is `v.any()`, where Postgres has jsonb. The component checks a Thing only
// with the core's own checks, so a Thing the core would call incompatible, but of these types, is stored and returned unchanged.
// Each document states its `modelkind`, fixed to its table's kind, and a Thing's table is picked by the kind stated, never by
// its labelpath: a bank may be labelled `box`, and then its gate and its root box share a labelpath, each in its own table.
// The index `by_scope` sorts a bank's Things of a kind by labelpath, so the Things below one form a single range. Each write
// stamps its document with Convex's commit timestamp, which rises in commit order, so the Things of a bank committed after
// a given time are a single range of each table's index `by_commit`.

// A Thing's banktok names the life of the bank it was written in: a gate's is minted at each birth and kept by each
// write over the live gate; a box's is its gate's when it was sealed, which nothing here compares with the gate's.
/** The fields of every kind of Thing, and the commit timestamp of its last write. */
const thingFields = {
  userid:     v.string(),
  banklabel:  v.string(),
  labelpath:  v.string(),
  label:      v.string(),
  banktok:    v.string(),
  fmt:        v.string(),
  am:         v.string(),
  lifepath:   v.string(),
  lifeseq:    v.string(),
  revtok:     v.string(),
  revseq:     v.number(),
  born_at:    v.number(),
  written_at: v.number(),
  commit_ts:  v.commitTs(),
}

/** The component's tables: each Thing of a bank, ciphertext, at its scope, in the table of its kind. */
export default defineSchema({
  // A gate, at its bank's banklabel: its wayins, each null in its tombstone, and `auth`, `sigs` and `meta`, reserved and always empty.
  gate_things: defineTable({ ...thingFields, modelkind: v.literal('gate'), wayins: v.any(), auth: v.any(), sigs: v.any(), meta: v.any() })
    .index('by_scope', ['userid', 'banklabel', 'labelpath'])
    .index('by_commit', ['userid', 'banklabel', 'commit_ts']),
  // A box: its sidecar and its sealed whisper.
  box_things: defineTable({ ...thingFields, modelkind: v.literal('box'), sidecar: v.any(), whisper_sealed: v.any() })
    .index('by_scope', ['userid', 'banklabel', 'labelpath'])
    .index('by_commit', ['userid', 'banklabel', 'commit_ts']),
})

/** The table of each kind of Thing. */
export const ThingTables = { gate: 'gate_things', box: 'box_things' } as const satisfies Record<Thingkind, string>
