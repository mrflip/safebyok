/** Convex validators for the arguments and return values of the component's vaultDB functions. */

import { v } from 'convex/values'

// An ask is any value here. Each function parses its ask with the core's own checker before it reads a Thing, and the client
// classifies every Thing it gets back with the core's classifier: what Convex's validators could check of either, the core does.

// == [Arguments]: askArgs, watchArgs

/** The arguments of a vaultDB function whose only argument is an ask. */
export const askArgs = { ask: v.any() }

/** The arguments of `watchThings`: the bank to watch, and the cursor, or null to watch from now. */
export const watchArgs = { scope: v.any(), cursor: v.union(v.null(), v.int64()) }
// --

// == [Fetched]: tracked, filed, thingkindStats, thingFetched, thingsFetched, rootsFetched, statsFetched, thingsWatched
// The Things a call fetched, in one snapshot, each raw and null for none.

/** How the bank, main gate and root box compare with what the ask tracks: for each, `'same'` or the raw Thing, null for none. */
const tracked = v.object({ bank: v.any(), gate: v.any(), box: v.any() })

/** A raw Thing, with the labelpath it is stored at. */
const filed = v.object({ labelpath: v.string(), raw: v.any() })

/** The Things of one kind stored for a bank: how many, how many of them live, and their summed weight in bytes. */
const thingkindStats = v.object({ count: v.number(), live_count: v.number(), size: v.number() })

/** What `getThing` returns: the Thing at the ask's scope, the bank, the nearest Thing stored above the scope, and `tracked`. */
export const thingFetched = v.object({ thing: v.any(), bank: v.any(), ancestor: v.any(), tracked })

/** What `listThings` returns: the parent at the ask's scope, each Thing one label under it, the bank, and `tracked`. */
export const thingsFetched = v.object({ parent: v.any(), children: v.array(filed), bank: v.any(), tracked })

/** What `getWorld` returns: the bank, main gate and root box, and `tracked`. */
export const rootsFetched = v.object({ bank: v.any(), gate: v.any(), root: v.any(), tracked })

/** What `stats` returns: the bank's boxes and gates as stored, the bank, and `tracked`. */
export const statsFetched = v.object({ box: thingkindStats, gate: thingkindStats, bank: v.any(), tracked })

/** The result of `watchThings`: the Things committed after the cursor, the bank, and the next cursor. */
export const thingsWatched = v.object({ things: v.array(filed), bank: v.any(), cursor: v.int64() })
// --

// == [Written]: thingWritten, rootsWritten
// What a write fetched, as it stood before the write, and as `written` what stood after it, read back, or null if it wrote nothing.

/** What `writeThing` read back after its write: the Thing stored, the bank and `tracked`. */
const thingAfter = v.object({ thing: v.any(), bank: v.any(), tracked })

/** What `writeThing` returns: the fields of {@link thingFetched}, and as `written` what it read back, or null. */
export const thingWritten = v.object({ ...thingFetched.fields, written: v.union(v.null(), thingAfter) })

/** What `birthBank` returns: the fields of {@link rootsFetched}, and as `written` the same read back after the write, or null. */
export const rootsWritten = v.object({ ...rootsFetched.fields, written: v.union(v.null(), rootsFetched) })
// --
