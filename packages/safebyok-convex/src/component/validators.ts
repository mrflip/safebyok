/** Convex validators for the component's arguments and answers, converted from the core's checkers. */

import { zodOutputToConvex, zodToConvex } from 'convex-helpers/server/zod4'
import { v } from 'convex/values'
import type { Validator } from 'convex/values'
import * as DB from 'safebyok/storage'

// Convex takes only its own validators for a function's arguments and answers. What Convex has no
// check for (a label's pattern, a time's range) converts to the looser check it has: the core
// checks each record whole before it reaches the component, and again each row it reads back.

// == [Scopes]: bankScope, vaultScope, vaultQuery, boxQuery, watchScope

/** One user's vaults in one app. */
export const bankScope = zodToConvex(DB.bankScope)

/** One vault, by its labels. */
export const vaultScope = zodToConvex(DB.vaultScope)

/** One life of one vault. */
export const vaultQuery = zodToConvex(DB.vaultQuery)

/** One box of one life of one vault. */
export const boxQuery = zodToConvex(DB.boxQuery)

/** A bank, or one vault of it, for a watch. */
export const watchScope = zodToConvex(DB.watchScope)
// --

// == [Records and options]: vaultRecord, vaultTombstone, boxRecord, boxTombstone, putOptsGiven, delOpts, capacity

// A live record's type is the core's own, named: Convex's copy of it carries the core's zod brands, which a
// declaration file cannot name, and for a box recurses into its sidecar past TypeScript's depth.

/** A live vault row as the core writes it. */
export const vaultRecord: Validator<DB.VaultRecord, 'required', string> = zodToConvex(DB.vaultRecord)

/** A vault's tombstone as the core writes it. */
export const vaultTombstone = zodToConvex(DB.vaultTombstone)

/** A live box row as the core writes it. */
export const boxRecord = zodToConvex(DB.boxRecord) as unknown as Validator<DB.BoxRecord, 'required', string>

/** A box's tombstone as the core writes it. */
export const boxTombstone = zodToConvex(DB.boxTombstone)

/** A put's options, their defaults filled in. */
export const putOptsGiven = zodOutputToConvex(DB.putOpts)

/** A del's options. */
export const delOpts = zodToConvex(DB.delOpts)

/** How full a vault is, by boxes and by bytes. */
export const capacity = zodOutputToConvex(DB.capacity)
// --

// == [Answers]: rowOfVault, rowOfBox, boxesFetched, boxFetched, landing, boxLanding, putBoxAnswer, tidied, rowsWatched

/** A vault row by its vaultlabel, the row as stored. */
export const rowOfVault = v.object({ vaultlabel: v.string(), vault: v.any() })

/** A box row by its boxlabel, the row as stored. */
export const rowOfBox = v.object({ boxlabel: v.string(), box: v.any() })

/** One life's box rows, and the vault row read beside them. */
export const boxesFetched = v.object({ vault: v.any(), boxes: v.array(rowOfBox) })

/** One box row, and the vault row read beside it. */
export const boxFetched = v.object({ vault: v.any(), box: v.any() })

/** Whether a vault's put or del landed, and the row it found. */
export const landing = v.object({ landed: v.boolean(), ante: v.any() })

/** Whether a box's put or del landed, the row it found, and the vault row read beside it. */
export const boxLanding = v.object({ landed: v.boolean(), ante: v.any(), vault: v.any() })

/** A box's put, or the vault's capacity when it had no room for a new box. */
export const putBoxAnswer = v.union(boxLanding, v.object({ capacity }))

/** How many box rows a bank's live vaults still hold. */
export const tidied = v.object({ totalCount: v.number() })

/** A box row with the labels and life it is filed under. */
export const rowOfWatchedBox = v.object({ vaultlabel: v.string(), vault_tok: v.string(), boxlabel: v.string(), box: v.any() })

/** Every row a watch's scope holds. */
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
export const delDamagedBoxArgs = { tombstone: boxTombstone, boxprops: v.any() }
export const tidyGoneArgs   = { scope: bankScope }
export const watchRowsArgs  = { scope: watchScope }
// --
