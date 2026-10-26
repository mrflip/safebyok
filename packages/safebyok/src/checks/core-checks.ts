/** The checks for scopes and scopepaths, made in {@link Validator}: a failed `parse` refuses 'bad_scope', quoting nothing. */

import type * as Z from 'zod'
import { ScopepathDelimiter } from '../consts'
import * as Phrases from '../phrases'
import { Validator } from './validator'

export { MaxLabelChars, LabelPattern, label, MaxUserIdChars, UserIdPattern, user_id } from './primitives'

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

// == [Scopes and scopepaths]: bankScope, vaultScope, boxscope, bankScopepath, vaultScopepath, leaseScopepath, deviceScopepath, boxScopepath

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
// --
