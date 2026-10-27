import * as CX from './checks/core-checks'
import type { BankScope, Boxscope, VaultScope } from './checks/core-checks'
import { ScopepathDelimiter } from './utils/consts'

/** Where a store files what a scope names: the kind, then the scope's names in order, joined on `^`.
 *
 *     bank^acme^u1               a bank
 *     vault^acme^u1^main         a vault's props
 *     lease^acme^u1^main         a vault's lease, on a device
 *     device^acme^u1^main        a vault's device record, on a device
 *     box^acme^u1^main^openai    a box
 *
 * No two share a scopepath, and each splits back into its kind and names. Each maker checks its
 * scope, and each inverse its scopepath, and throws what the check found for the public call's
 * wrapper to refuse.
 */

export { ScopepathDelimiter } from './utils/consts'

/** A bank's scopepath. */
export type BankScopepath = string
/** A vault's scopepath. */
export type VaultScopepath = string
/** A vault's lease's scopepath. */
export type LeaseScopepath = string
/** A vault's device record's scopepath. */
export type DeviceScopepath = string
/** A box's scopepath. */
export type BoxScopepath = string

/** What a predicate here returns: true for text it matches, and false for anything else, text or not. */
export type ScopepathPred = (candidate: unknown) => candidate is string

// == [Makers]: bank, vault, lease, device, box

/** The scopepath of the bank `scope` names: any record carrying its fields.
 *
 * @example Scopepath.bank({ applabel: 'acme', user_id: 'u1' })  // 'bank^acme^u1'
 */
export const bank = (scope: BankScope): BankScopepath => {
  const         { applabel, user_id } = CX.bankScope.parse(scope)
  return ['bank', applabel, user_id].join(ScopepathDelimiter)
}

/** The scopepath of the vault props of the vault `scope` names: any record carrying its fields, vault props and leases among them.
 *
 * @example Scopepath.vault({ applabel: 'asdf', user_id: 'a234', vaultlabel: 'b99' })  // 'vault^asdf^a234^b99'
 */
export const vault = (scope: VaultScope): VaultScopepath => {
  const          { applabel, user_id, vaultlabel } = CX.vaultScope.parse(scope)
  return ['vault', applabel, user_id, vaultlabel].join(ScopepathDelimiter)
}

/** The scopepath of the lease of the vault `scope` names, on a device's own storage.
 *
 * @example Scopepath.lease(scope)  // 'lease^acme^u1^main'
 */
export const lease = (scope: VaultScope): LeaseScopepath => {
  const          { applabel, user_id, vaultlabel } = CX.vaultScope.parse(scope)
  return ['lease', applabel, user_id, vaultlabel].join(ScopepathDelimiter)
}

/** The scopepath of the device record of the vault `scope` names, on a device's own storage.
 *
 * @example Scopepath.device(scope)  // 'device^acme^u1^main'
 */
export const device = (scope: VaultScope): DeviceScopepath => {
  const           { applabel, user_id, vaultlabel } = CX.vaultScope.parse(scope)
  return ['device', applabel, user_id, vaultlabel].join(ScopepathDelimiter)
}

/** The scopepath of the box `scope` names.
 *
 * @example Scopepath.box({ ...scope, boxlabel: 'openai' })  // 'box^acme^u1^main^openai'
 */
export const box = (scope: Boxscope): BoxScopepath => {
  const        { applabel, user_id, vaultlabel, boxlabel } = CX.boxscope.parse(scope)
  return ['box', applabel, user_id, vaultlabel, boxlabel].join(ScopepathDelimiter)
}
// --

// == [Scopes]: bankScope, vaultScope, boxscope

/** The bank scope `bankScopepath` names: the inverse of {@link bank}.
 *
 * @example Scopepath.bankScope('bank^acme^u1')  // { applabel: 'acme', user_id: 'u1' }
 */
export const bankScope = (bankScopepath: BankScopepath): BankScope => {
  const [_scopepathkind, applabel, user_id] = CX.bankScopepath.parse(bankScopepath)
  return               { applabel, user_id }
}

/** The vault scope `vaultScopepath` names: the inverse of {@link vault}.
 *
 * @example Scopepath.vaultScope('vault^acme^u1^main')        // { applabel: 'acme', user_id: 'u1', vaultlabel: 'main' }
 * @example Scopepath.vaultScope('lease^acme^u1^main')        // throws: a lease's
 * @example Scopepath.vaultScope('vault^acme^u1^main^extra')  // throws: one name too many
 */
export const vaultScope = (vaultScopepath: VaultScopepath): VaultScope => {
  const [_scopepathkind, applabel, user_id, vaultlabel] = CX.vaultScopepath.parse(vaultScopepath)
  return               { applabel, user_id, vaultlabel }
}

/** The box scope `boxScopepath` names: the inverse of {@link box}, for a store listing its rows.
 *
 * @example Scopepath.boxscope(listed).boxlabel  // 'openai'
 */
export const boxscope = (boxScopepath: BoxScopepath): Boxscope => {
  const [_scopepathkind, applabel, user_id, vaultlabel, boxlabel] = CX.boxScopepath.parse(boxScopepath)
  return               { applabel, user_id, vaultlabel, boxlabel }
}
// --

// == [Predicates]: withinVaultScopepathPred

/** A predicate, for filtering a list of scopepaths, true for each box's in the vault `scope` names, and for nothing else.
 * A box's scopepath begins with `box`, the vault's names and the delimiter after them.
 *
 * @example store.ckeys().filter(Scopepath.withinVaultScopepathPred(scope))   // the scopepath of each box of the vault
 */
export const withinVaultScopepathPred = (scope: VaultScope): ScopepathPred => {
  const                { applabel, user_id, vaultlabel } = CX.vaultScope.parse(scope)
  const prefix = ['box', applabel, user_id, vaultlabel].join(ScopepathDelimiter) + ScopepathDelimiter
  return (candidate: unknown): candidate is string => typeof candidate === 'string' && candidate.startsWith(prefix)
}
// --
