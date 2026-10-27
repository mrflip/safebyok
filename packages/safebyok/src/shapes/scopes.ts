/** The checks for scopes, the bags naming a vault, and scopepaths, made in {@link Validator}, with the names a scope is made of: a failed `parse` refuses 'bad_scope', quoting nothing. */

import type * as Z from 'zod'
import { ScopepathDelimiter } from '../consts'
import * as Phrases from '../phrases'
import type { label, user_id } from '../checks/primitives'
import { Validator } from '../checks/validator'

export { MaxLabelChars, LabelPattern, label, MaxUserIdChars, UserIdPattern, user_id } from '../checks/primitives'

// == [Names]: Applabel, Vaultlabel, Boxlabel, UserId

/** The app's label, as a host writes it to `Bank.make`: a {@link label}, which every scope opens with. */
export type Applabel = Z.infer<typeof label>

/** The label of one of a user's vaults, as a host writes it to `bank.ensureVault`: a {@link label}, such as `main`. */
export type Vaultlabel = Z.infer<typeof label>

/** A box's label within its vault, as a host writes it to `putBox` and `getBox`: a {@link label}, such as `anthropic`. */
export type Boxlabel = Z.infer<typeof label>

/** The signed-in user's stable, opaque id from the host's own auth, as {@link user_id} checks it: the one name in a scope that is not a label. */
export type UserId = Z.infer<typeof user_id>
// --

// == [Fieldnames]: each scope's fieldnames, in the order its scopepath joins them

/** The fieldnames of a bank's scope, in the order its scopepath joins them. */
export const BankScopepathFieldnameVals = ['applabel', 'user_id'] as const
/** The fieldnames of a vault's scope, in the order its scopepath joins them: its bank's, then its vaultlabel. */
export const VaultScopepathFieldnameVals = [...BankScopepathFieldnameVals, 'vaultlabel'] as const
/** The fieldnames of a box's scope, in the order its scopepath joins them: its vault's, then its boxlabel. */
export const BoxScopepathFieldnameVals = [...VaultScopepathFieldnameVals, 'boxlabel'] as const

/** A fieldname of a bank's scope. */
export type BankScopepathFieldname = typeof BankScopepathFieldnameVals[number]
/** A fieldname of a vault's scope. */
export type VaultScopepathFieldname = typeof VaultScopepathFieldnameVals[number]
/** A fieldname of a box's scope. */
export type BoxScopepathFieldname = typeof BoxScopepathFieldnameVals[number]
// --

// == [Scopes and scopepaths]: bankScope, vaultScope, boxscope, VaultScope, bankScopepath, vaultScopepath, leaseScopepath, deviceScopepath, boxScopepath

/** A scopepath's parts, as its validator checks them: split on {@link ScopepathDelimiter}. */
const partsOf = (scopepath: string): string[] => scopepath.split(ScopepathDelimiter)

/** A scope, frozen, or a scopepath split into its kind and names. A scope carrying more fields passes, the rest left out: a vault's record, or a Vault object, passes as its scope.
 * A scope comes back a frozen copy, so no one it is handed to can change it for everyone else.
 * Each refuses 'bad_scope', naming each failing field.
 *
 * @example CX.vaultScope.parse(vault)                                   // { applabel, user_id, vaultlabel }, frozen
 * @example CX.boxscope.parse({ ...scope, boxlabel: 'OpenAI' })          // throws 'bad_scope', "boxlabel: A label is ..."
 * @example CX.vaultScopepath.parse('vault^acme^auth0|x^main')           // ['vault', 'acme', 'auth0|x', 'main']
 * @example CX.vaultScopepath.parse('lease^acme^u1^main')                // throws 'bad_scope': a lease's
 */
export const { bankScope, vaultScope, boxscope, bankScopepath, vaultScopepath, leaseScopepath, deviceScopepath, boxScopepath } = Validator('bad_scope', ({ obj, str, tuple, lit, applabel, user_id, vaultlabel, boxlabel }) => {
  const bankScope  = obj({ applabel, user_id })
  const vaultScope = bankScope.extend({ vaultlabel })
  const boxscope   = vaultScope.extend({ boxlabel })

  const bankScopepath   = str.transform(partsOf).pipe(tuple([lit('bank'),   applabel, user_id], Phrases.BankScopepathShape))
  const vaultScopepath  = str.transform(partsOf).pipe(tuple([lit('vault'),  applabel, user_id, vaultlabel], Phrases.VaultScopepathShape))
  const leaseScopepath  = str.transform(partsOf).pipe(tuple([lit('lease'),  applabel, user_id, vaultlabel], Phrases.LeaseScopepathShape))
  const deviceScopepath = str.transform(partsOf).pipe(tuple([lit('device'), applabel, user_id, vaultlabel], Phrases.DeviceScopepathShape))
  const boxScopepath    = str.transform(partsOf).pipe(tuple([lit('box'),    applabel, user_id, vaultlabel, boxlabel], Phrases.BoxScopepathShape))

  return { bankScope: bankScope.readonly(), vaultScope: vaultScope.readonly(), boxscope: boxscope.readonly(), bankScopepath, vaultScopepath, leaseScopepath, deviceScopepath, boxScopepath }
})

/** What names a bank: the app's label and the signed-in user's id. */
export type BankScope = Z.infer<typeof bankScope>
/** What names one vault: its bank's scope and the vault's own label. */
export type VaultScope = Z.infer<typeof vaultScope>
/** What names one box: its vault's scope and its boxlabel. */
export type Boxscope = Z.infer<typeof boxscope>

/** What names one vault: the app's label, the signed-in user's id, and the vault's own label, frozen once checked. Its `parse` refuses 'bad_scope'.
 * Each label is a `label`, and the user's id a `user_id`. A scope carrying more fields passes,
 * the rest left out: a vault record, or a Vault object, passes as its scope. It is
 * `CX.vaultScope`, under the name a host imports.
 */
export const VaultScope = vaultScope
// --

// == [Bags]: vaultBag, bankBag, VaultBag, BankBag

/** The bag naming one of a bank's vaults, as its calls are handed it, and what of a bank's scope a thing carries: each name checked, each optional but the `vaultlabel`. Each refuses 'bad_scope'.
 * `vaultBag` is strict, as a bag a person types is: a field other than its three names refuses,
 * a store put there among them. `bankBag` judges a thing carrying a scope (a Vault object, a box,
 * an element of the bank's listing), so everything else the thing carries is left out.
 *
 * @example vaultBag.parse({ vaultlabel: 'main' })                          // { vaultlabel: 'main' }
 * @example vaultBag.parse({ vaultlabel: 'main', vaultDB })                 // throws 'bad_scope': a field it does not take
 * @example bankBag.parse(vault)                                            // { applabel: 'acme', user_id: 'u1' }
 */
export const { vaultBag, bankBag } = Validator('bad_scope', ({ obj, applabel, user_id, vaultlabel }) => {
  const bankBag = obj({ applabel: applabel.optional(), user_id: user_id.optional() })
  return { bankBag, vaultBag: bankBag.extend({ vaultlabel }).strict() }
})

/** The bag naming one of a bank's vaults, as {@link vaultBag} checks it: its `vaultlabel`, and the bank's own `applabel` and `user_id` if you like.
 *
 * @example bank.ensureVault({ vaultlabel: 'main' })
 */
export type VaultBag = Z.input<typeof vaultBag>

/** What of a bank's scope a thing carries, as {@link bankBag} checks it: an `applabel` and a `user_id`, each optional. */
export type BankBag = Z.input<typeof bankBag>
// --
