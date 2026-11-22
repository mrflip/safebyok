# Thread 1: house_port (2026-11-22)

Branch `20261122-house_port`, PR [#840](https://github.com/mrflip/safebyok/pull/840), on main. Proved: safebyok 1369 tests, safebyok-react-lean 252, typecheck and lint in both; `pnpm justify` at ready (see the PR's **Tests:** line).

* **Built**: [#827](https://github.com/mrflip/safebyok/pull/827)'s core commits carried onto main by cherry-pick, in order: `2900e6c07` (a watch is told each Thing a good list answers), `bbd2eb844` (the minder's subtree, pins, listing as a real query, one settler, goodbye removes the subtree), `fa86a376c`, `472c02420`, `4fe1c3f73`, `f292e9ffc`. Left behind: #827's thread file and its empty changeset; this branch has its own.
* **Decisions made**: the minder header's invariant now reads "the record got or written, or the labelpaths listed … (a refusal's `dbhas`, each Thing a list answers, or a tracked bank, main gate or root box)". Checked against the code: `#fetchListing` returns only labelpaths; `tryWrite` sends its good answer to the cache; listed Things land through the watch's `#sendToTSQ`.
* **Deviations**: none from #827. Every cherry-pick applied cleanly: the expected conflicts in `thing-minder.ts` and `provider-world.ts` did not arise.
* **Discoveries**: no code outside `packages/safebyok` (React layer, demos, e2e) calls `tryList` or reads `ThingNotice`, so the React layer needed no change. `safebyok-postgres` builds on `AdapterVaultDB`, so its watches now hear each listed Thing, sparse.
* **For the Coach**: #827's open questions travel with the port unchanged: `list`'s per-call `staleTime: 0` persisting on the listing's options; whether to keep pinning `select`. The `listen` question is settled by `fa86a376c` (it tells only this bank's entries).
