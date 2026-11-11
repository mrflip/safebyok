/** Convex validators for the component's arguments and return values, converted from the core's checkers. */

import { zodOutputToConvex, zodToConvex } from 'convex-helpers/server/zod4'
import { v } from 'convex/values'
import type { Validator } from 'convex/values'
import * as DB from 'safebyok/storage'

// Convex accepts only its own validators for a function's arguments and return values. Where Convex
// has no equivalent check (a label's pattern, a time's range), the conversion falls back to the
// looser check it does have. That is safe because the component checks each ask in full with the
// core's own checker before it reads a row, and the core checks each row again when it reads it back.

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

// == [Records]: vaultRecord, vaultTombstone, boxRecord, boxTombstone, capacity

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

/** How full a vault is, in boxes and in bytes. */
export const capacity = zodOutputToConvex(DB.capacity)
// --

// == [Asks]: vaultPutAsk, boxPutAsk, vaultDelAsk, boxDelAsk
// An ask's structure alone: the component checks each ask again with the core's own checker before it reads a row.

// The row a put or del expects to find, as a checked ask carries it: a row's meta.
const vaultExpected = zodToConvex(DB.rowMeta)
const boxExpected   = v.object({ ...vaultExpected.fields, box_tok: v.string() })
const putPolicies   = { ifAbsent: zodToConvex(DB.putOptsGiven.shape.ifAbsent), ifPresent: zodToConvex(DB.putOptsGiven.shape.ifPresent) }
const gateVerb      = v.union(...DB.gateVerbVals.map((verb) => v.literal(verb)))

/** What `putVault` is asked. */
export const vaultPutAsk = v.object({
  ...vaultScope.fields, op: v.literal('put'), ...putPolicies, expected: vaultExpected, record: vaultRecord,
  gateVerb: v.optional(gateVerb),
}) as unknown as Validator<DB.VaultPutAsk, 'required', string>

/** What `putBox` is asked. */
export const boxPutAsk = v.object({
  ...boxQuery.fields, op: v.literal('put'), ...putPolicies, expected: boxExpected, record: boxRecord,
}) as unknown as Validator<DB.BoxPutAsk, 'required', string>

/** What `delVault` is asked. */
export const vaultDelAsk = v.object({
  ...vaultScope.fields, op: v.literal('del'), expected: vaultExpected, record: vaultTombstone,
}) as unknown as Validator<DB.VaultDelAsk, 'required', string>

/** What `delBox` is asked. */
export const boxDelAsk = v.object({
  ...boxQuery.fields, op: v.literal('del'), expected: boxExpected, record: boxTombstone,
}) as unknown as Validator<DB.BoxDelAsk, 'required', string>
// --

// == [Answers]: rowOfVault, rowOfBox, boxesFetched, boxFetched, vaultClassified, boxClassified, tidied, rowsWatched

/** A vault row as stored, with its vaultlabel. */
export const rowOfVault = v.object({ vaultlabel: v.string(), vault: v.any() })

/** A box row as stored, with its boxlabel. */
export const rowOfBox = v.object({ boxlabel: v.string(), box: v.any() })

/** One life's box rows, and the vault row read in the same snapshot. */
export const boxesFetched = v.object({ vault: v.any(), boxes: v.array(rowOfBox) })

/** One box row, and the vault row read in the same snapshot. */
export const boxFetched = v.object({ vault: v.any(), box: v.any() })

/** What a vault's put or del came to, as the core's classifier answered it. The client checks it in full. */
export const vaultClassified = v.object({ ok: v.boolean(), act: v.string(), world: v.any(), vault: v.any(), presence: v.string() })

/** What a box's put or del came to, as the core's classifier answered it. The client checks it in full. */
export const boxClassified = v.object({ ok: v.boolean(), act: v.string(), world: v.any(), box: v.any(), presence: v.union(v.string(), v.null()), capacity: v.union(capacity, v.null()) })

/** How many box rows a bank has left after a tidy. */
export const tidied = v.object({ totalCount: v.number() })

/** A box row as stored, with its vaultlabel, `vault_tok` and boxlabel. */
export const rowOfWatchedBox = v.object({ vaultlabel: v.string(), vault_tok: v.string(), boxlabel: v.string(), box: v.any() })

/** Every vault row and box row in a watch's scope. */
export const rowsWatched = v.object({ vaults: v.array(rowOfVault), boxes: v.array(rowOfWatchedBox) })
// --

// == [Arguments]: the args of each function, shared by the component and the host's wrapper

/** `listVaults` takes a bank's scope. */
export const listVaultsArgs = { scope: bankScope }
/** `getVault` takes a vault's scope. */
export const getVaultArgs   = { scope: vaultScope }
/** `listBoxes` takes one life of a vault. */
export const listBoxesArgs  = { asked: vaultQuery }
/** `getBox` takes one box of one life of a vault. */
export const getBoxArgs     = { asked: boxQuery }
/** `putVault` takes a vault's put ask. */
export const putVaultArgs   = { ask: vaultPutAsk }
/** `putBox` takes a box's put ask, and an optional soft cap on the vault's live boxes. */
export const putBoxArgs     = { ask: boxPutAsk, maxBoxes: v.optional(v.number()) }
/** `delVault` takes a vault's del ask. */
export const delVaultArgs   = { ask: vaultDelAsk }
/** `delBox` takes a box's del ask. */
export const delBoxArgs     = { ask: boxDelAsk }
/** `tidyGone` takes a bank's scope. */
export const tidyGoneArgs   = { scope: bankScope }
/** `watchRows` takes a watch's scope. */
export const watchRowsArgs  = { scope: watchScope }
// --
