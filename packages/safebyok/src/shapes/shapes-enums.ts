/** The closed lists of values, each with the type it makes: this file imports nothing, so anything may import it. Imported as `EX`. */

// == [Records]: amVals, Am, tombstoneAmVals, damagekindVals, Damagekind

/** Whether a record is alive (`a`), damaged (`d`: it failed its check, and is set aside in `damaged_rows`) or gone (`x`: deleted). */
export const amVals = ['a', 'd', 'x'] as const
export type Am = typeof amVals[number]

/** The `am` a tombstone carries: damaged or gone, never alive. */
export const tombstoneAmVals = ['d', 'x'] as const

/** Why a row is in `damaged_rows`: `format_mismatch`, written by a newer version of the app, so updating the app may read it; `damaged_row`, anything else that failed its check. */
export const damagekindVals = ['format_mismatch', 'damaged_row'] as const
export type Damagekind = typeof damagekindVals[number]
// --

// == [Reconciling]: recordShapeVals, RecordShape, ageVals, Age, centralPolicyVals, CentralPolicy

/** The shapes of a record as `classifyRecordShape` tells them: `sparse`, `full` or `gone` (a tombstone). */
export const recordShapeVals = ['sparse', 'full', 'gone'] as const
export type RecordShape = typeof recordShapeVals[number]

/** How a revision `post` compares to an `ante`, as `cmpRevisions` tells it. */
export const ageVals = ['older', 'same', 'newer'] as const
export type Age = typeof ageVals[number]

/** Every policy `reconcileCentral` may choose: `older` and `same` end the receive with central as it was; `fill` takes the record over the one in hand; `adopt` takes the one received; `gone` takes its tombstone. */
export const centralPolicyVals = ['older', 'same', 'fill', 'adopt', 'gone'] as const
export type CentralPolicy = typeof centralPolicyVals[number]
// --

// == [Policies]: ifPresentVals, IfPresent, ifAbsentVals, IfAbsent, putIfAbsentVals, PutIfAbsent

/** The policies for a put over a live record: `repl`, the default, replaces it; `fail` refuses `camped`; `get` takes it up. */
export const ifPresentVals = ['repl', 'fail', 'get'] as const
export type IfPresent = typeof ifPresentVals[number]

/** The policies when fetching a thing that is absent, never stored or deleted: `fail` with the absent refusal, or resolve `nil`. */
export const ifAbsentVals = ['fail', 'nil'] as const
export type IfAbsent = typeof ifAbsentVals[number]

/** The policies for a put over a thing absent, never stored or deleted: `add`, the default, stores it; `fail` refuses. */
export const putIfAbsentVals = ['add', 'fail'] as const
export type PutIfAbsent = typeof putIfAbsentVals[number]
// --

// == [The world]: lockStateVals, LockState

/** Whether the world a storable lives in is `unlocked` or `locked`: for a box, its vault's lock. */
export const lockStateVals = ['unlocked', 'locked'] as const
export type LockState = typeof lockStateVals[number]
// --

// == [Wayins and gatings]: wayinkindVals, Wayinkind, gatingkindVals, Gatingkind, correctablekindVals

/** The kinds of wayin, each with a record shape and a slot of the gate of its own: a `passphrase` the user types, or a `passkey` the user touches. */
export const wayinkindVals = ['passphrase', 'passkey'] as const
export type Wayinkind = typeof wayinkindVals[number]

export const gatingkindVals = ['build_vault', 'unlock_vault', 'replace_passphrase', 'add_passkey', 'revoke_passkey', 'del_vault'] as const
export type Gatingkind = typeof gatingkindVals[number]

/** The refusals an attempt leaves its gating open under, for the user to try again. */
export const correctablekindVals = ['wrong_passphrase', 'wrong_passkey', 'weak_passphrase', 'same_passphrase'] as const
// --
