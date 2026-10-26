import type * as Z from 'zod'
import * as CX from './checks/core-checks'
import type { BankScope, Boxscope, VaultScope } from './checks/core-checks'
import { ScopepathDelimiter } from './consts'

/** Where a store files what a scope names: the kind, then the scope's names in order, joined on `^`. A key-value adapter of your own files its rows under these.
 *
 *     bank^acme^u1               a bank
 *     vault^acme^u1^main         a vault's record
 *     lease^acme^u1^main         a vault's lease, on a device
 *     device^acme^u1^main        a vault's device record, on a device
 *     box^acme^u1^main^openai    a box
 *
 * No two share a scopepath, and each splits back into its kind and names. A scopepath is part of
 * what is stored: rows filed under these are where every other device's copy of the package
 * looks, so file under these, never a join of your own. Each maker checks its scope, and each
 * inverse its scopepath, refusing 'bad_scope' for any name that fails its check, quoting none of
 * it; no name may hold `^`. Each kind test and predicate answers false, never throwing.
 */

/** The character a scopepath joins its parts on, which no name may hold: `^`. */
export { ScopepathDelimiter as Delimiter } from './consts'

/** A bank's scopepath: `bank^acme^u1`. */
export type BankScopepath = Z.input<typeof CX.bankScopepath>
/** The scopepath of a vault's props: `vault^acme^u1^main`. */
export type VaultScopepath = Z.input<typeof CX.vaultScopepath>
/** The scopepath of a vault's lease, on a device: `lease^acme^u1^main`. */
export type LeaseScopepath = Z.input<typeof CX.leaseScopepath>
/** The scopepath of a vault's device record, on a device: `device^acme^u1^main`. */
export type DeviceScopepath = Z.input<typeof CX.deviceScopepath>
/** A box's scopepath: `box^acme^u1^main^openai`. */
export type BoxScopepath = Z.input<typeof CX.boxScopepath>

/** What a predicate here returns: true for the text it matches, and false for anything else, text or not. */
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

/** The scopepath of the vault record of the vault `scope` names: any record carrying its fields, vault record and leases among them.
 *
 * @example Scopepath.vault({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })  // 'vault^acme^u1^main'
 * @example Scopepath.vault({ applabel: 'acme', user_id: 'u1^x', vaultlabel: 'main' })  // throws 'bad_scope': "user_id: A user_id is ASCII letters, ..."
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

/** The scopepath of the box `scope` names: a vault's scope and a boxlabel.
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
 * @example Scopepath.vaultScope('lease^acme^u1^main')        // throws 'bad_scope': a lease's
 * @example Scopepath.vaultScope('vault^acme^u1^main^extra')  // throws 'bad_scope': one name too many
 */
export const vaultScope = (vaultScopepath: VaultScopepath): VaultScope => {
  const [_scopepathkind, applabel, user_id, vaultlabel] = CX.vaultScopepath.parse(vaultScopepath)
  return               { applabel, user_id, vaultlabel }
}

/** The box scope `boxScopepath` names: the inverse of {@link box}, for a store listing its rows. Test a row's scopepath with {@link isBox} first, to pass over one no box is filed under.
 *
 * @example Scopepath.boxscope('box^acme^u1^main^openai').boxlabel  // 'openai'
 */
export const boxscope = (boxScopepath: BoxScopepath): Boxscope => {
  const [_scopepathkind, applabel, user_id, vaultlabel, boxlabel] = CX.boxScopepath.parse(boxScopepath)
  return               { applabel, user_id, vaultlabel, boxlabel }
}
// --

// == [Kind tests]: isLease, isDevice, isBox

/** True for a lease's scopepath, as {@link lease} makes one for any scope; false for anything else, an earlier version's lease among them.
 * On a device shelf, a row both this and {@link isDevice} reject is one this version did not file.
 *
 * @example Scopepath.isLease(Scopepath.lease(scope))   // true
 * @example Scopepath.isLease('unlock^acme^u1^main')    // false: an earlier version's
 */
export const isLease = (candidate: unknown): candidate is LeaseScopepath => CX.leaseScopepath.safeParse(candidate).success

/** True for a device record's scopepath, as {@link device} makes one for any scope; false for anything else, an earlier version's device mark (`mark^...`) among them.
 *
 * @example Scopepath.isDevice(Scopepath.device(scope))   // true
 * @example Scopepath.isDevice(Scopepath.lease(scope))    // false
 */
export const isDevice = (candidate: unknown): candidate is DeviceScopepath => CX.deviceScopepath.safeParse(candidate).success

/** True for a box's scopepath, as {@link box} makes one for any box; false for anything else, a row no box is filed under among them.
 * A store listing a vault's rows passes over one this rejects: no verb reaches it, so it holds no box.
 *
 * @example Scopepath.isBox('box^acme^u1^main^openai')      // true
 * @example Scopepath.isBox('box^acme^u1^main^Open AI')     // false: no box is filed there
 */
export const isBox = (candidate: unknown): candidate is BoxScopepath => CX.boxScopepath.safeParse(candidate).success
// --

// == [Within a vault]: withinVaultScopepathPrefix, withinVaultScopepathPred

/** The text that begins the scopepath of every box in the vault `scope` names, and of nothing else, for a store that reads by prefix or key range.
 * It ends in the delimiter, so no other vault whose label starts the same (`main2`) shares it.
 *
 * @example Scopepath.withinVaultScopepathPrefix(scope)   // 'box^acme^u1^main^'
 */
export const withinVaultScopepathPrefix = (scope: VaultScope): string => {
  const        { applabel, user_id, vaultlabel } = CX.vaultScope.parse(scope)
  return ['box', applabel, user_id, vaultlabel].join(ScopepathDelimiter) + ScopepathDelimiter
}

/** A predicate, for filtering a list of scopepaths, true for each that begins as a box's in the vault `scope` names, and for nothing else.
 * It is a test of the prefix alone: a row under the vault's prefix that {@link isBox} rejects
 * passes it, so a vault's deletion erases that row too.
 *
 * @example store.ckeys().filter(Scopepath.withinVaultScopepathPred(scope))   // each row under the vault's prefix: test each with isBox before boxscope
 */
export const withinVaultScopepathPred = (scope: VaultScope): ScopepathPred => {
  const prefix = withinVaultScopepathPrefix(scope)
  return (candidate: unknown): candidate is BoxScopepath => typeof candidate === 'string' && candidate.startsWith(prefix)
}
// --
