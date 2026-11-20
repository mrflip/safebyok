# Guarantees: drift in the new core

`notes/guarantees-big.md` states where secret material lives in `safebyok-big`, as numbered guarantees, and is not
edited. The new core (`packages/safebyok`) may cite a guarantee by number where it keeps it in substance. Where it
drops, loosens, changes or adds one, the change is written here, one entry each, until the guarantees are rebuilt for
the new core.

An entry gives the date, the thread or PR, the guarantee's number (or *new*), the files of the new core concerned, and
what differs from big, in a sentence or two.

## Added

* 2026-11-15 (lean_buttonup), *new*: **No remote subscription protocol.** The design never depends on change
  notices that arrive over a protocol of their own, apart from the store's answers. A store with a watch of its own
  (memory, Postgres) notifies from the device's side, and a hosted vaultDB, such as GraphQL's, turns that off and
  notifies by itself.

## Drifted

* 2026-11-19 (bank_gatings), the leaseKey's access chain: **A device's sweep evicts no lease.** In big, the device's
  sweep reaches `bank.lock()`, which evicts the lease. The new core's `Device` holds no handle to its banks, so
  `device.sweep()` reaches none: a bank of a swept device refuses every call (its `isEnabled` reads its device's), and
  its lease refuses every seal and unseal, but the lease keeps its leaseKey until the `Bank` is let go.
  `bank.sweep()` (`packages/safebyok/src/models/bank.ts`) evicts it through `lease.sweep()`; nothing calls it from the
  device yet.
  amended 2026-11-20 (snapshots, #773): `device.sweep()` now reaches the last `Bank` made on the device, through
  `device.cheatHoldBank`, and sweeps its lease; a `Bank` made earlier on the same device still keeps its leaseKey.
* 2026-11-20 (bank_gatings, #772), G1 and G9: **The Bank takes cleartexts, unread.** In big no `Bank` method ever
  received a passphrase or PRF bytes (G1's chain; G9's "only Gating, Proving and Lease"). In the new core the Bank's
  four re-entry points, `attemptUnlock`, `attemptReplacePassphrase`, `attemptAddPasskey` and `attemptRevokePasskey`
  (`packages/safebyok/src/models/bank.ts`), take the cleartexts a form collected and pass them unread to `gating.ts`
  (the open gating, or `attemptWithoutGating`), so G1 and G9 hold in substance.
  amended 2026-11-20 (vault_try): the four are now `tryAttemptUnlock`, `tryAttemptReplacePassphrase`,
  `tryAttemptAddPasskey` and `tryAttemptRevokePasskey`, each answering an outcome, with throwing twins under the old names
  that call them; neither reads the cleartexts, so G1 and G9 still hold in substance.
