/** The lease key's test, and the format a lease is stored in. */

/** True when `val` is a leaseKey as `makeLeaseKey` makes one: a non-extractable AES-GCM CryptoKey whose usages are within `wrapKey` and `unwrapKey`, among them `unwrapKey`.
 * A device store hands back what it kept by structured clone, so a key that is extractable, of
 * another algorithm, or for another use was not written by this package: its record reads as none.
 *
 * @example isLeaseKey(await makeLeaseKey())   // true
 * @example isLeaseKey(await makeVaultKey())   // false: extractable
 */
export const isLeaseKey = (val: unknown): val is CryptoKey => (
  val instanceof CryptoKey
    && ! val.extractable
    && val.algorithm.name === 'AES-GCM'
    && val.usages.includes('unwrapKey')
    && val.usages.every((usage) => usage === 'wrapKey' || usage === 'unwrapKey')
)

/** The `fmt` a lease the vault models grant carries (`models/lease.ts`), whose record `Lease.get` checks. */
export const ModelsLeaseFormat = 7001
