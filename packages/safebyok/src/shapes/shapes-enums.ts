/** The closed lists of values, each with the type it makes: this file imports nothing, so anything may import it. Imported as `EX`. */

// == [Records]: amVals, Am, tombstoneAmVals

/** Whether a record is alive (`a`), damaged (`d`: it failed its check, and is set aside in `damaged_rows`) or gone (`x`: deleted). */
export const amVals = ['a', 'd', 'x'] as const
export type Am = typeof amVals[number]

/** The `am` a tombstone carries: damaged or gone, never alive. */
export const tombstoneAmVals = ['d', 'x'] as const

// --

// == [Reconciling]: recordShapeVals, RecordShape, ageVals, Age, centralPolicyVals, CentralPolicy

/** The shapes of a record as `classifyRecordShape` tells them: `sparse`, `full` or `gone` (a tombstone). */
export const recordShapeVals = ['sparse', 'full', 'gone'] as const
export type RecordShape = typeof recordShapeVals[number]

/** How a revision `post` compares to an `ante`, as `cmpRevisions` tells it. */
export const ageVals = ['older', 'same', 'newer'] as const
export type Age = typeof ageVals[number]

/** Every policy `reconcileCentral` may choose: `older` and `same` make no change; `fill`, `adopt` replace the #central record; `gone` becomes a tombstone. */
export const centralPolicyVals = ['older', 'same', 'fill', 'adopt', 'gone'] as const
export type CentralPolicy = typeof centralPolicyVals[number]
// --

// == [Policies]: ifPresentVals, IfPresent, ifAbsentVals, IfAbsent, putIfAbsentVals, PutIfAbsent

/** The policies for a put over a live record: `repl`, the default, replaces it; `fail` refuses `camped`; `get` answers it. */
export const ifPresentVals = ['repl', 'fail', 'get'] as const
export type IfPresent = typeof ifPresentVals[number]

/** The policies when fetching a thing that is absent, never stored or deleted: `fail` with the absent refusal, or resolve `nil`. */
export const ifAbsentVals = ['fail', 'nil'] as const
export type IfAbsent = typeof ifAbsentVals[number]

/** The policies for a put over a thing absent, never stored or deleted: `add`, the default, puts it; `fail` refuses. */
export const putIfAbsentVals = ['add', 'fail'] as const
export type PutIfAbsent = typeof putIfAbsentVals[number]
// --

// == [The whisper]: boxExposureVals, BoxExposure

// A string, not a bag: each copy of safebyok freezes its own bags, so comparing `box.whisper` with one fails across copies.
/** Where a box's whisper stands, as `box.exposure` answers it: `showing`, or why it hides.
 * `locked` means the whisper is exposed but hidden while the vault is locked; it is not the vault's lock, for which ask the vault (an unexposed box in a locked vault answers `unexposed`).
 */
export const boxExposureVals = ['unexposed', 'locked', 'veiled', 'showing'] as const
export type BoxExposure = typeof boxExposureVals[number]
// --

// == [Wayins and gatings]: wayinkindVals, Wayinkind, gatingkindVals, Gatingkind, correctablekindVals

/** The kinds of wayin, each with a record shape and a slot of the gate of its own: a `passphrase` the user types, or a `passkey` the user touches. */
export const wayinkindVals = ['passphrase', 'passkey'] as const
export type Wayinkind = typeof wayinkindVals[number]

/** The kinds of gating, each named for the change the user's cleartext allows. */
export const gatingkindVals = ['build_vault', 'unlock_vault', 'replace_passphrase', 'add_passkey', 'revoke_passkey', 'del_vault'] as const
export type Gatingkind = typeof gatingkindVals[number]

/** The refusals an attempt leaves its gating open under, for the user to try again. */
export const correctablekindVals = ['wrong_passphrase', 'wrong_passkey', 'passkey_unavailable', 'weak_passphrase', 'same_passphrase'] as const
// --

// == [Acts]: listActVals, ListAct, gotActVals, GotAct, putActVals, PutAct, delActVals, DelAct

/** What a listing verb's answer says happened: `got` rows, or `gotvoid` for none. */
export const listActVals = ['got', 'gotvoid'] as const
export type ListAct = typeof listActVals[number]

/** What a get's answer says happened: `got` the row, `gotvoid` for none stored, `gotgone` for a tombstone. */
export const gotActVals = ['got', 'gotvoid', 'gotgone'] as const
export type GotAct = typeof gotActVals[number]

/** What a put's answer says happened: `born` over nothing, `reborn` over a tombstone, `replaced` a live row, or `declined` for the live row taken up. */
export const putActVals = ['born', 'reborn', 'replaced', 'declined'] as const
export type PutAct = typeof putActVals[number]

/** What a del's answer says happened: `deleted` the row, `gone` for a tombstone found, or `void` for nothing stored. */
export const delActVals = ['deleted', 'gone', 'void'] as const
export type DelAct = typeof delActVals[number]
// --

// == [Classified acts]: writeActVals, WriteAct, foundActVals, FoundAct, refusedActVals, RefusedAct, boxVaultActVals, BoxVaultAct, VaultAct, BoxAct

/** The acts of a put or del that stored its record: `born` over nothing, `reborn` over a tombstone, `replaced` over a live row, or `deleted`. */
export const writeActVals = ['born', 'reborn', 'replaced', 'deleted'] as const
export type WriteAct = typeof writeActVals[number]

/** The acts that answer what is stored and write nothing: a get's `gotlive`, `gotvoid` or `gotgone`, and `passed` for a put told to get the live row it met. */
export const foundActVals = ['gotlive', 'gotvoid', 'gotgone', 'passed'] as const
export type FoundAct = typeof foundActVals[number]

/** The acts a get, put or del refuses with over the row it asked for, a box's or a vault's alike. */
export const refusedActVals = ['void', 'gone', 'camped', 'dubdel', 'stale', 'retcon', 'clash', 'forked', 'ahead'] as const
export type RefusedAct = typeof refusedActVals[number]

// 'vault_full' is the soft cap on a vault's boxes: where it falls among the others is no promise (notes/answer-contract.md, *Soft caps*).
/** The acts a box's get, put or del refuses with for the state of its vault: none stored, a tombstone, a live vault of another life, or one at its cap. */
export const boxVaultActVals = ['vault_void', 'vault_gone', 'vault_reborn', 'vault_full'] as const
export type BoxVaultAct = typeof boxVaultActVals[number]

/** Every act a vault's get, put or del is classified as. */
export type VaultAct = WriteAct | FoundAct | RefusedAct
/** Every act a box's get, put or del is classified as: those of its own row, and those of its vault. */
export type BoxAct   = VaultAct | BoxVaultAct
// --
