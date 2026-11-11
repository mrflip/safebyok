/** The closed lists of values, each with the type it makes: this file imports nothing, so anything may import it. Imported as `EX`. */

// == [Records]: amVals, Am

/** Whether a record is alive (`a`), damaged (`d`: it failed its check, and is set aside in `damaged_rows`) or gone (`x`: deleted). */
export const amVals = ['a', 'd', 'x'] as const
export type Am = typeof amVals[number]
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

// == [Acts]: listActVals, ListAct, gotActVals, GotAct, putActVals, PutAct, delActVals, DelAct, gateVerbVals, GateVerb

/** A listing verb's act: `got` for rows found, or `gotvoid` for none. */
export const listActVals = ['got', 'gotvoid'] as const
export type ListAct = typeof listActVals[number]

/** A get's act:
 * - `gotlive` -- a live row
 * - `gotvoid` -- no row stored
 * - `gotgone` -- a tombstone
 */
export const gotActVals = ['gotlive', 'gotvoid', 'gotgone'] as const
export type GotAct = typeof gotActVals[number]

/** A put's act:
 * - `born`     -- stored where no row was
 * - `reborn`   -- stored over a tombstone
 * - `replaced` -- stored over a live row
 * - `passed`   -- (for `ifPresent: 'get'`) nothing stored, the answer's `val` is the live row found
 */
export const putActVals = ['born', 'reborn', 'replaced', 'passed'] as const
export type PutAct = typeof putActVals[number]

/** A del's act: `deleted`, the tombstone stored over the live row. */
export const delActVals = ['deleted'] as const
export type DelAct = typeof delActVals[number]

/** The verbs that change a vault's gate. Each is a put of the vault record with checks of its own, and the put request names its verb. */
export const gateVerbVals = ['replacePassphrase', 'addPasskey', 'revokePasskey'] as const
export type GateVerb = typeof gateVerbVals[number]
// --

// == [Classified acts]: writeActVals, WriteAct, foundActVals, FoundAct, OkAct, refusedActVals, RefusedAct, boxVaultActVals, BoxVaultAct, VaultAct, BoxAct

/** The acts of a put or del that stored its record: `born` over nothing, `reborn` over a tombstone, `replaced` over a live row, or `deleted`. */
export const writeActVals = ['born', 'reborn', 'replaced', 'deleted'] as const
export type WriteAct = typeof writeActVals[number]

/** The acts that store nothing and return what is stored: a get's `gotlive`, `gotvoid` or `gotgone`, and a put's `passed`. */
export const foundActVals = ['gotlive', 'gotvoid', 'gotgone', 'passed'] as const
export type FoundAct = typeof foundActVals[number]

/** The acts of a good answer: the record was stored, or the stored row is returned. */
export type OkAct = WriteAct | FoundAct

/** The acts a get, put or del refuses with, from the requested row, box or vault alike. */
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
