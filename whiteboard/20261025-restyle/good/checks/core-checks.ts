/** The checks for scopes and scopepaths, made in {@link Validator}: a failed `parse` refuses `bad_scope`, quoting nothing. */

import type * as Z from 'zod'
import { ScopepathDelimiter } from '../utils/consts'
import * as Phrases from '../utils/phrases'
import { Validator } from './validator'

export { MaxLabelChars, LabelPattern, label, MaxUserIdChars, UserIdPattern, user_id } from './primitives'

// == [Fieldnames]: each scope's fieldnames, in the order its scopepath joins them

/** The fieldnames of a bank's scope, in the order its scopepath joins them. */
export const BankScopepathFieldnameVals = ['applabel', 'user_id'] as const
/** The fieldnames of a vault's scope, in the order its scopepath joins them: its bank's, then its vaultlabel. */
export const VaultScopepathFieldnameVals = [...BankScopepathFieldnameVals, 'vaultlabel'] as const
/** The fieldnames of a box's scope, in the order its scopepath joins them: its vault's, then its boxlabel. */
export const BoxScopepathFieldnameVals = [...VaultScopepathFieldnameVals, 'boxlabel'] as const

export type BankScopepathFieldname = typeof BankScopepathFieldnameVals[number]
export type VaultScopepathFieldname = typeof VaultScopepathFieldnameVals[number]
export type BoxScopepathFieldname = typeof BoxScopepathFieldnameVals[number]
// --

// == [Scopes and scopepaths]: bankScope, vaultScope, boxscope, bankScopepath, vaultScopepath, boxScopepath

/** A scope, or its scopepath as the parts it splits into. A scope carrying more fields passes, the rest left out. */
export const { bankScope, vaultScope, boxscope, bankScopepath, vaultScopepath, boxScopepath } = Validator('bad_scope', ({ obj, str, tuple, lit, applabel, user_id, vaultlabel, boxlabel }) => {
  const bankScope  = obj({ applabel, user_id })
  const vaultScope = bankScope.extend({ vaultlabel })
  const boxscope   = vaultScope.extend({ boxlabel })

  const parts = (scopepath: string): string[] => scopepath.split(ScopepathDelimiter)
  const bankScopepath  = str.transform(parts).pipe(tuple([lit('bank'), applabel, user_id], Phrases.BankScopepathShape))
  const vaultScopepath = str.transform(parts).pipe(tuple([lit('vault'), applabel, user_id, vaultlabel], Phrases.VaultScopepathShape))
  const boxScopepath   = str.transform(parts).pipe(tuple([lit('box'), applabel, user_id, vaultlabel, boxlabel], Phrases.BoxScopepathShape))

  return { bankScope, vaultScope, boxscope, bankScopepath, vaultScopepath, boxScopepath }
})

export type BankScope = Z.infer<typeof bankScope>
export type VaultScope = Z.infer<typeof vaultScope>
export type Boxscope = Z.infer<typeof boxscope>
// --
