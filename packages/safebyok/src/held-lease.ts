/** How this package gets the lease a vault holds, which no getter, field or JSON of the Vault object shows.
 * A Vault object registers a getter of its private lease as it is made; a `Box` and a
 * {@link Lease} read through it, each holding the vault it is of. The package's entry points export
 * none of this, so a host holding a Vault object reaches no Lease.
 */

import type { Lease } from './lease'

/** Each registered vault's getter of the lease it holds now: a weak map, so a vault let go is let go here too. */
const leaseGetters = new WeakMap<object, () => Lease | null>()

/** Let this package get the lease `vault` holds through `getLease`, once. Call it in a Vault object's constructor, or a test's stand-in for one.
 * A vault already registered keeps its first getter.
 *
 * @example registerLeaseGetter(this, () => this.#lease)
 */
export const registerLeaseGetter = (vault: object, getLease: () => Lease | null): void => {
  if (! leaseGetters.has(vault)) { leaseGetters.set(vault, getLease) }
}

/** The lease `vault` holds now, got afresh at each call, or null: while it is locked, or for anything no {@link registerLeaseGetter} registered.
 *
 * @example const lease = heldLeaseOf(vault)   // null while locked
 */
export const heldLeaseOf = (vault: object): Lease | null => leaseGetters.get(vault)?.() ?? null
