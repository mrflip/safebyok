/** Convex validators for the arguments and return values of the component's vaultDB functions. */

import { v } from 'convex/values'

// An ask is any value here, and so is each row and tag of a manifest. Each function parses its ask with the core's own
// checker before it reads a Thing, and the client's vaultDB checks every manifest it gets back with the core's checks:
// what Convex's validators could check of either, the core does.

// == [Arguments]: askArgs, watchArgs

/** The arguments of a vaultDB function whose only argument is an ask. */
export const askArgs = { ask: v.any() }

/** The arguments of `watchThings`: the bank to watch, and the cursor, or null to watch from now. */
export const watchArgs = { scope: v.any(), cursor: v.union(v.null(), v.int64()) }
// --

// == [Manifests]: bankObserved, filed, rootRows, getManifest, writeManifest, listManifest, birthManifest, worldManifest, statsManifest, thingsWatched
// What each function observed in its one query or mutation, each row raw and null for none. The client adds the `read_tc`.

/** The bank fields of every manifest: its `banktok` and its `tracked`. */
const bankObserved = { banktok: v.any(), tracked: v.any() }

/** A raw Thing, with the labelpath it is stored at. */
const filed = v.object({ labelpath: v.string(), raw: v.any() })

/** A bank's three roots, raw. */
const rootRows = v.object({ bank: v.any(), gate: v.any(), root: v.any() })

/** The `GetManifest` that `getThing` returns, without its `read_tc`. */
export const getManifest = v.object({ tags: v.any(), actual: v.any(), ancestor: v.any(), ...bankObserved })

/** The `WriteManifest` that `writeThing` returns, without its `read_tc`. */
export const writeManifest = v.object({ tags: v.any(), actual: v.any(), ancestor: v.any(), ...bankObserved })

/** The `ListManifest` that `listThings` returns, without its `read_tc`. */
export const listManifest = v.object({ tags: v.any(), actual: v.any(), children: v.any(), ...bankObserved })

/** The `BirthManifest` that `birthBank` returns, without its `read_tc`. */
export const birthManifest = v.object({ tags: v.any(), actual: rootRows, ...bankObserved })

/** The `WorldManifest` that `getWorld` returns, without its `read_tc`. */
export const worldManifest = v.object({ actual: rootRows, ...bankObserved })

/** The `StatsManifest` that `stats` returns, without its `read_tc`. */
export const statsManifest = v.object({ stats: v.any(), ...bankObserved })

/** The result of `watchThings`: the Things committed after the cursor, the banktok of their bank, and the next cursor. */
export const thingsWatched = v.object({ things: v.array(filed), banktok: v.any(), cursor: v.int64() })
// --
