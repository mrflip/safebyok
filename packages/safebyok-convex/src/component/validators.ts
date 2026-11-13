/** Convex validators for the arguments and return values of the component's bankDB functions. */

import { zodOutputToConvex, zodToConvex } from 'convex-helpers/server/zod4'
import { v } from 'convex/values'
import * as DB from 'safebyok/storage'

// An ask is any value here. Each function parses its ask with the core's own checker before it reads a row, and the client
// classifies every row it gets back with the core's classifier: what Convex's validators could check of either, the core does.

// == [Shapes]: watchScope, capacity

/** The scope of a watch: a bank, or one of its vaults. */
export const watchScope = zodToConvex(DB.watchScope)

/** How full a vault is, in boxes and in bytes. */
export const capacity = zodOutputToConvex(DB.capacity)
// --

// == [Arguments]: askArgs, putBoxArgs, watchRowsArgs

/** The arguments of a bankDB function that takes only an ask. */
export const askArgs = { ask: v.any() }

/** The arguments of `putBox`: its ask, and an optional soft cap on the vault life's box rows, tombstones included. */
export const putBoxArgs = { ask: v.any(), maxBoxes: v.optional(v.number()) }

/** The arguments of `watchRows`: the scope to watch. */
export const watchRowsArgs = { scope: watchScope }
// --

// == [Fetched]: rowOfGate, rowOfVault, rowOfBox, rowOfWatchedBox, bankEnsureFetched, vaultFetched, boxesFetched, boxFetched
// The rows a get fetched, in one snapshot, each null for none.

/** A gate row from storage, unchecked, with its gatelabel. */
const rowOfGate = v.object({ gatelabel: v.string(), gate: v.any() })

/** A vault row from storage, unchecked, with its vaultlabel. */
const rowOfVault = v.object({ vaultlabel: v.string(), vault: v.any() })

/** A box row from storage, unchecked, with its boxlabel. */
const rowOfBox = v.object({ boxlabel: v.string(), box: v.any() })

/** A box row from storage, unchecked, with its vaultlabel and boxlabel. */
const rowOfWatchedBox = v.object({ vaultlabel: v.string(), boxlabel: v.string(), box: v.any() })

/** What `ensureBank` returns: the bank row, its `main` gate row, and every vault row of the bank. */
export const bankEnsureFetched = v.object({ bank: v.any(), gate: v.any(), vaults: v.array(rowOfVault) })

/** What `getVault` returns: the bank row and the vault row. */
export const vaultFetched = v.object({ bank: v.any(), vault: v.any() })

/** What `listBoxes` returns: one vault life's box rows, and the vault row as `parent`. */
export const boxesFetched = v.object({ parent: v.any(), boxes: v.array(rowOfBox) })

/** What `getBox` returns: the box row, and the vault row as `parent`. */
export const boxFetched = v.object({ parent: v.any(), box: v.any() })
// --

// == [Written]: gateWritten, bankWritten, vaultWritten, boxWritten, boxPutWritten, tidied, rowsWatched
// The rows a write fetched, as they stood before it, and whether it stored the ask's record.

/** What `buildBank` and `putGate` return: the bank row, the gate row, and whether the ask's records were stored. */
export const gateWritten = v.object({ bank: v.any(), gate: v.any(), wrote: v.boolean() })

/** What `delBank` returns: the bank row, and whether its tombstone was stored. */
export const bankWritten = v.object({ bank: v.any(), wrote: v.boolean() })

/** What `putVault` and `delVault` return: the bank row, the vault row, and whether the ask's record was stored. */
export const vaultWritten = v.object({ bank: v.any(), vault: v.any(), wrote: v.boolean() })

/** What `delBox` returns: the vault row as `parent`, the box row, and whether the ask's record was stored. */
export const boxWritten = v.object({ parent: v.any(), box: v.any(), wrote: v.boolean() })

/** What `putBox` returns: the fields of {@link boxWritten}, plus the vault life's capacity.
 * `roomless` is true when the record was not stored because the life would pass a limit.
 */
export const boxPutWritten = v.object({ parent: v.any(), box: v.any(), capacity, wrote: v.boolean(), roomless: v.boolean() })

/** What `tidyGone` returns: how many box rows the bank's live vaults hold afterward. */
export const tidied = v.object({ totalCount: v.number() })

/** What `watchRows` returns: the bank row, every gate and vault row in scope, and the box rows of each live vault. */
export const rowsWatched = v.object({
  bank:   v.any(),
  gates:  v.array(rowOfGate),
  vaults: v.array(rowOfVault),
  boxes:  v.array(rowOfWatchedBox),
})
// --
