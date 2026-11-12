/** Convex validators for the arguments and return values of the bankDB's functions in the component. */

import { v } from 'convex/values'
import { capacity, watchScope } from './validators'

// An ask is any value here. Each function parses its ask with the core's own checker before it reads a row, and the client
// classifies every row it gets back with the core's classifier: what Convex's validators could check of either, the core does.

// == [Arguments]: askArgs, putBoxArgs, watchRowsArgs

/** A function of the bankDB takes its ask, as the client's verb checked it. */
export const askArgs = { ask: v.any() }

/** `putBox` takes a box's put ask, and an optional soft cap on the box rows of the vault life, tombstones included. */
export const putBoxArgs = { ask: v.any(), maxBoxes: v.optional(v.number()) }

/** `watchRows` takes a watch's scope. */
export const watchRowsArgs = { scope: watchScope }
// --

// == [Fetched]: rowOfGate, rowOfVault, rowOfBox, rowOfWatchedBox, bankEnsureFetched, vaultFetched, boxesFetched, boxFetched
// The rows a get fetched, in one snapshot, each null for none.

/** A gate row as stored, with its gatelabel. */
const rowOfGate = v.object({ gatelabel: v.string(), gate: v.any() })

/** A vault row as stored, with its vaultlabel. */
const rowOfVault = v.object({ vaultlabel: v.string(), vault: v.any() })

/** A box row as stored, with its boxlabel. */
const rowOfBox = v.object({ boxlabel: v.string(), box: v.any() })

/** A box row as stored, with its vaultlabel and boxlabel. */
const rowOfWatchedBox = v.object({ vaultlabel: v.string(), boxlabel: v.string(), box: v.any() })

/** The bank row, its `main` gate row, and every vault row of the bank with its vaultlabel. */
export const bankEnsureFetched = v.object({ bank: v.any(), gate: v.any(), vaults: v.array(rowOfVault) })

/** The bank row and the vault row. */
export const vaultFetched = v.object({ bank: v.any(), vault: v.any() })

/** One life's box rows, each with its boxlabel, and the vault row as `parent`. */
export const boxesFetched = v.object({ parent: v.any(), boxes: v.array(rowOfBox) })

/** One box row, and the vault row as `parent`. */
export const boxFetched = v.object({ parent: v.any(), box: v.any() })
// --

// == [Written]: gateWritten, bankWritten, vaultWritten, boxWritten, boxPutWritten, tidied, rowsWatched
// The rows a write fetched, as they stood before it, and whether it stored the ask's record.

/** The bank row and the gate row, and whether the gate record was stored. */
export const gateWritten = v.object({ bank: v.any(), gate: v.any(), wrote: v.boolean() })

/** The bank row, and whether its tombstone was stored. */
export const bankWritten = v.object({ bank: v.any(), wrote: v.boolean() })

/** The bank row and the vault row, and whether the vault record was stored. */
export const vaultWritten = v.object({ bank: v.any(), vault: v.any(), wrote: v.boolean() })

/** The vault row as `parent` and the box row, and whether the box record was stored. */
export const boxWritten = v.object({ parent: v.any(), box: v.any(), wrote: v.boolean() })

/** As {@link boxWritten}, with the life's capacity, and whether a write was refused for a limit the life would pass (`roomless`). */
export const boxPutWritten = v.object({ parent: v.any(), box: v.any(), capacity, wrote: v.boolean(), roomless: v.boolean() })

/** How many box rows a bank's live vaults hold after a tidy. */
export const tidied = v.object({ totalCount: v.number() })

/** The bank row, and every gate row, vault row and box row of a live vault in a watch's scope. */
export const rowsWatched = v.object({
  bank:   v.any(),
  gates:  v.array(rowOfGate),
  vaults: v.array(rowOfVault),
  boxes:  v.array(rowOfWatchedBox),
})
// --
