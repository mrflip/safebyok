import type { Lease } from './lease'

/** How this package reads the lease a vault holds, which no getter, field or JSON of the Vault object shows.
 * A Vault object registers a reader of its private lease as it is made; a {@link Box} and a
 * {@link Lease} read through it, each holding the vault it is of. The package's entry points export
 * none of this, so a host holding a Vault object reaches no Lease.
 */

/** Each registered vault's reader of the lease it holds now: a weak map, so a vault let go is let go here too. */
const readers = new WeakMap<object, () => Lease | null>()

/** Let this package read the lease `vault` holds through `read`, once: what a Vault object's constructor calls, and a test's stand-in for one.
 * A vault already registered keeps its first reader.
 *
 * @example registerLeaseReader(this, () => this.#lease)
 */
export const registerLeaseReader = (vault: object, read: () => Lease | null): void => {
  if (! readers.has(vault)) { readers.set(vault, read) }
}

/** The lease `vault` holds now, read afresh at each call, or null: while it is locked, or for anything no {@link registerLeaseReader} registered.
 *
 * @example const lease = heldLeaseOf(vault)   // null while locked
 */
export const heldLeaseOf = (vault: object): Lease | null => readers.get(vault)?.() ?? null
