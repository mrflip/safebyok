# Thread 3: idb_fold (2026-11-26)

Branch `claude/bank-table-refactor-fr1ycq`, no PR (the orchestrator pushes). Proved: `pnpm --filter safebyok-indexeddb` lint, typecheck, test (130 passed, the vaultDB battery included) and build, all green.

* **Built**: `packages/safebyok-indexeddb/src/idb-datastore.ts` reads a bank's two roots (`rootsOf` through `DB.rootLabelpathsOf`), takes the banktok from the gate row, tracks `gate` and `box`, and rings two notices at a birth. It lost a root and gained no branch.
* **Decisions made**: `VaultDBVersion` stays `001-001-001`. The scopepath `[userid, banklabel, labelpath]` is unchanged; only the gate's labelpath moved. Pre-1.0 rule: no migration.
* **Deviations**: none. `src/vault-shelf.ts` changed a doc line only. It is the IndexedDB object store, not the core's `root-shelf`, so the old 4-entry shelf value does not touch it.
* **Discoveries**: the one test that needed editing was the watch test: a gate written over no bank row now notifies with the gate's `lifetok` as banktok, not the void lifetok. Parallel `pnpm run build` calls from several workers clobber `safebyok-big/dist`; one build failed on that (publint, missing dist/index.cjs) and passed on retry.
