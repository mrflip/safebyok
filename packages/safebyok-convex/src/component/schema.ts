import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { Labelpath } from 'safebyok/storage'
import type { Thingkind } from 'safebyok/storage'

// A table for each kind of Thing, with a field for each of the Thing's fields, as safebyok-postgres has a column for each
// (`VaultTablesSql`); a field that is an object is `v.any()`, where Postgres has jsonb. The component checks a Thing only
// with the core's own checks, so a Thing the core would call incompatible, but of these types, is stored and returned unchanged.
// The index `by_scope` sorts a bank's Things of a kind by labelpath, so the Things below one form a single range. Each write
// stamps its document with Convex's commit timestamp, which rises in commit order, so the Things of a bank committed after
// a given time are a single range of each table's index `by_commit`.

/** The fields of every kind of Thing, and the commit timestamp of its last write. */
const thingFields = {
  userid:     v.string(),
  banklabel:  v.string(),
  labelpath:  v.string(),
  label:      v.string(),
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
  // A bank: its Thing alone.
  bank_things: defineTable({ ...thingFields, lifetok: v.string() })
    .index('by_scope', ['userid', 'banklabel', 'labelpath'])
    .index('by_commit', ['userid', 'banklabel', 'commit_ts']),
  // A gate: its wayins, and `auth`, `sigs` and `meta`, reserved and always empty.
  gate_things: defineTable({ ...thingFields, wayins: v.any(), auth: v.any(), sigs: v.any(), meta: v.any() })
    .index('by_scope', ['userid', 'banklabel', 'labelpath'])
    .index('by_commit', ['userid', 'banklabel', 'commit_ts']),
  // A box: its sidecar and its sealed whisper.
  box_things: defineTable({ ...thingFields, sidecar: v.any(), whisper_sealed: v.any() })
    .index('by_scope', ['userid', 'banklabel', 'labelpath'])
    .index('by_commit', ['userid', 'banklabel', 'commit_ts']),
})

/** The table of each kind of Thing. */
export const ThingTables = { bank: 'bank_things', gate: 'gate_things', box: 'box_things' } as const satisfies Record<Thingkind, string>

/** The table of the kind of Thing stored at `labelpath`. */
export function tableOf(labelpath: string): typeof ThingTables[Thingkind] { return ThingTables[Labelpath.modelkindOf(labelpath)] }
