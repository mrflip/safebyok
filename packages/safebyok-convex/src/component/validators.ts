/** Convex validators for the component's arguments and return values, converted from the core's checkers. */

import { zodOutputToConvex, zodToConvex } from 'convex-helpers/server/zod4'
import { v } from 'convex/values'
import type { Validator } from 'convex/values'
import * as DB from 'safebyok/storage'

// Convex accepts only its own validators for a function's arguments and return values. Where Convex
// has no equivalent check (a label's pattern, a time's range), the conversion falls back to the
// looser check it does have. That is safe because the core checks each record in full before it
// reaches the component, and checks each row again when it reads it back.

// == [Scopes]: bankScope, vaultScope, vaultQuery, boxQuery, watchScope

/** One user's vaults in one app. */
export const bankScope = zodToConvex(DB.bankScope)

/** One vault, named by its labels. */
export const vaultScope = zodToConvex(DB.vaultScope)

/** One life of one vault. */
export const vaultQuery = zodToConvex(DB.vaultQuery)

/** One box of one life of one vault. */
export const boxQuery = zodToConvex(DB.boxQuery)

/** The scope of a watch: a bank, or one of its vaults. */
export const watchScope = zodToConvex(DB.watchScope)
// --

// == [Records and options]: vaultRecord, vaultTombstone, boxRecord, boxTombstone, putOptsGiven, delOpts, capacity

// The two live-record validators are annotated with the core's own types. The type Convex infers
// carries the core's zod brands, which a declaration file cannot name, and for a box it recurses
// into the sidecar past TypeScript's depth limit.

/** A live vault row as the core writes it. */
export const vaultRecord: Validator<DB.VaultRecord, 'required', string> = zodToConvex(DB.vaultRecord)

/** A vault's tombstone as the core writes it. */
export const vaultTombstone = zodToConvex(DB.vaultTombstone)

/** A live box row as the core writes it. */
export const boxRecord = zodToConvex(DB.boxRecord) as unknown as Validator<DB.BoxRecord, 'required', string>

/** A box's tombstone as the core writes it. */
export const boxTombstone = zodToConvex(DB.boxTombstone)

/** A put's options, with defaults filled in. */
export const putOptsGiven = zodToConvex(DB.putOptsGiven)

/** A del's options. */
export const delOpts = zodToConvex(DB.delOpts)

/** How full a vault is, in boxes and in bytes. */
export const capacity = zodOutputToConvex(DB.capacity)
// --

// == [Answers]: rowOfVault, rowOfBox, boxesFetched, boxFetched, written, boxWritten, putBoxAnswer, tidied, rowsWatched

/** A vault row as stored, with its vaultlabel. */
export const rowOfVault = v.object({ vaultlabel: v.string(), vault: v.any() })

/** A box row as stored, with its boxlabel. */
export const rowOfBox = v.object({ boxlabel: v.string(), box: v.any() })

/** One life's box rows, and the vault row read in the same snapshot. */
export const boxesFetched = v.object({ vault: v.any(), boxes: v.array(rowOfBox) })

/** One box row, and the vault row read in the same snapshot. */
export const boxFetched = v.object({ vault: v.any(), box: v.any() })

/** The result of a vault's put or del: whether it was written, and the row it found. */
export const written = v.object({ isWritten: v.boolean(), ante: v.any() })

/** The result of a box's put or del: whether it was written, the row it found, and the vault row read in the same transaction. */
export const boxWritten = v.object({ isWritten: v.boolean(), ante: v.any(), vault: v.any() })

/** The result of a box's put, or the vault's capacity when it had no room for the box. */
export const putBoxAnswer = v.union(boxWritten, v.object({ capacity }))

/** How many box rows a bank has left after a tidy. */
export const tidied = v.object({ totalCount: v.number() })

/** A box row as stored, with its vaultlabel, `vault_tok` and boxlabel. */
export const rowOfWatchedBox = v.object({ vaultlabel: v.string(), vault_tok: v.string(), boxlabel: v.string(), box: v.any() })

/** Every vault row and box row in a watch's scope. */
export const rowsWatched = v.object({ vaults: v.array(rowOfVault), boxes: v.array(rowOfWatchedBox) })
// --

// == [Arguments]: the args of each function, shared by the component and the host's wrapper

export const listVaultsArgs = { scope: bankScope }
export const getVaultArgs   = { scope: vaultScope }
export const listBoxesArgs  = { asked: vaultQuery }
export const getBoxArgs     = { asked: boxQuery }
export const putVaultArgs   = { record: vaultRecord, opts: putOptsGiven }
export const putBoxArgs     = { record: boxRecord, opts: putOptsGiven, maxBoxes: v.optional(v.number()) }
export const delVaultArgs   = { tombstone: vaultTombstone, opts: delOpts }
export const delBoxArgs     = { tombstone: boxTombstone, opts: delOpts }
export const tidyGoneArgs   = { scope: bankScope }
export const watchRowsArgs  = { scope: watchScope }
// --
