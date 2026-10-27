/** The facets a type gains, each a generic named for the facet: what has no validator, and wants none. */

import type { VaultError } from '../errors'
import type { Vault } from '../vault'

// == [Facets]: Lifecycled, Refused, ConsistencyWith

/** `OT` at a stage of its life, told by its `lifecycle`: the stages are `LifecycleT`, `'starting' | 'ready'` unless named.
 * A thing whose life can also stop at a refusal is `Lifecycled<OT> | Refused<OT>`, told apart by
 * `lifecycle`.
 *
 * @example type BankStage = Lifecycled<BankScope, 'made' | 'starting' | 'ready'> | Refused<BankScope>
 */
export type Lifecycled<OT, LifecycleT extends string = 'starting' | 'ready'> = OT & { readonly lifecycle: LifecycleT }

/** `OT` whose life stopped at a refusal: its `lifecycle` is `'refused'`, and `err` says why.
 *
 * @example if (stage.lifecycle === 'refused') { showTrouble(stage.err) }
 */
export type Refused<OT> = OT & { readonly lifecycle: 'refused', readonly err: VaultError }

/** `OT`, and the vault's `demandConsistentWith`: what a collaborator of a Vault object takes, to demand at each of its junctions that the vault still stands where it did.
 *
 * @example const make = (vault: ConsistencyWith<VaultScope>) => { vault.demandConsistentWith(thing) }
 */
export type ConsistencyWith<OT> = OT & Pick<Vault, 'demandConsistentWith'>
// --
