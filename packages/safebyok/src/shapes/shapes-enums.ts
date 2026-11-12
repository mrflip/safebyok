/** The closed lists of values, each with the type it makes: this file imports nothing, so anything may import it. Imported as `EX`. */

// == [Records]: amVals, Am

/** Whether a record is alive (`a`), damaged (`d`: it failed its check, and is set aside in `damaged_rows`) or gone (`x`: deleted). */
export const amVals = ['a', 'd', 'x'] as const
export type Am = typeof amVals[number]
// --

// == [Delivering]: recordShapeVals, RecordShape, ageVals, Age, deliveryFieldingVals, DeliveryFielding, deliveryMakingVals, DeliveryMaking, deliveryModificationVals, DeliveryModification

/** The shapes of a record as a thing's `shapeOf` tells them: `sparse`, `full` or `gone` (a tombstone). */
export const recordShapeVals = ['sparse', 'full', 'gone'] as const
export type RecordShape = typeof recordShapeVals[number]

/** How a revision `post` compares to an `ante`, as `cmpRevisions` tells it. */
export const ageVals = ['older', 'same', 'newer'] as const
export type Age = typeof ageVals[number]

/** Where a listing finds the record an answer delivers, by its act:
 * - `as_sent` -- in `val`, and it must be the record sent, at its revision
 * - `as_got`  -- in `val`, and it must be of the scope sent; null where storage answered that nothing is stored
 * - `as_db`   -- in `dbhas`, and it must be of the scope sent; null where nothing is stored
 * - `none`    -- nowhere: the answer says nothing of the record, as a box's `vault_*` act or an unclassified_storing refusal
 */
export const deliveryFieldingVals = ['as_sent', 'as_got', 'as_db', 'none'] as const
export type DeliveryFielding = typeof deliveryFieldingVals[number]

/** Which instance receives what a listing delivers:
 * - `none`   -- no instance: there is nothing to receive, or none is listed to tell
 * - `listed` -- the instance listed at the record's scope
 * - `make`   -- one made of the record, where none is listed
 */
export const deliveryMakingVals = ['none', 'listed', 'make'] as const
export type DeliveryMaking = typeof deliveryMakingVals[number]

/** What becomes of the record of the instance that receives:
 * - `older` -- unchanged, and not marked refreshed: the record received is older
 * - `same`  -- unchanged, and marked refreshed: storage has the record in hand
 * - `adopt` -- the record received replaces it: newer, a tombstone, or the full record over a sparse one
 */
export const deliveryModificationVals = ['older', 'same', 'adopt'] as const
export type DeliveryModification = typeof deliveryModificationVals[number]
// --

// == [Policies]: askOpVals, AskOp, bankAskOpVals, BankAskOp, ifPresentVals, IfPresent, ifAbsentVals, IfAbsent, putIfAbsentVals, PutIfAbsent

/** What a vaultDB ask asks for, the tag every ask carries as its `op`. */
export const askOpVals = ['get', 'put', 'del', 'list', 'tidy_gone'] as const
export type AskOp = typeof askOpVals[number]

/** What a bankDB ask asks for: a vaultDB's ops, `ensure` for `ensureBank` and `build` for `buildBank`. */
export const bankAskOpVals = [...askOpVals, 'ensure', 'build'] as const
export type BankAskOp = typeof bankAskOpVals[number]

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

/** The kinds of wayin, each with a record shape and a field of the gate of its own: a `passphrase` the user types, or a `passkey` the user touches. */
export const wayinkindVals = ['passphrase', 'passkey'] as const
export type Wayinkind = typeof wayinkindVals[number]

/** The kinds of gating, each named for the change the user's cleartext allows. */
export const gatingkindVals = ['build_bank', 'unlock_bank', 'replace_passphrase', 'add_passkey', 'revoke_passkey', 'del_bank'] as const
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

// == [Classified acts]: writeActVals, WriteAct, foundActVals, FoundAct, OkAct, refusedActVals, RefusedAct, boxVaultActVals, BoxVaultAct, parentBankActVals, ParentBankAct, VaultAct, BoxAct, gateActVals, GateAct, goodActVals, GoodAct, badActVals, BadAct, bankBadActVals, BankBadAct

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

/** The acts a bankDB's gate verb or vault verb refuses with for the state of its parent, the bank row: none stored, a tombstone, or a live bank of another life. */
export const parentBankActVals = ['bank_void', 'bank_gone', 'bank_reborn'] as const
export type ParentBankAct = typeof parentBankActVals[number]

/** Every act a vault's get, put or del is classified as. */
export type VaultAct = WriteAct | FoundAct | RefusedAct
/** Every act a box's get, put or del is classified as: those of its own row, and those of its vault. */
export type BoxAct   = VaultAct | BoxVaultAct

/** The acts only a gate verb answers: `added` for `addPasskey`, `revoked` for `revokePasskey`. Its others are a put's. */
export const gateActVals = ['added', 'revoked'] as const
export type GateAct = typeof gateActVals[number]

/** Every act a good answer carries, a listing's `timely` among them: the instance listed served a get, and storage was not asked. */
export const goodActVals = [...writeActVals, ...foundActVals, ...gateActVals, 'got', 'tidied', 'timely'] as const
export type GoodAct = typeof goodActVals[number]

/** Every act a refused answer carries; `unclassified_storing` for a refusal the classifier never saw: a bad ask, storage out of reach, a revoked identity. */
export const badActVals = [...refusedActVals, ...boxVaultActVals, 'unclassified_storing'] as const
export type BadAct = typeof badActVals[number]

/** Every act a bankDB's refused answer carries: a vaultDB's, and those of a parent bank row. */
export const bankBadActVals = [...badActVals, ...parentBankActVals] as const
export type BankBadAct = typeof bankBadActVals[number]
// --
