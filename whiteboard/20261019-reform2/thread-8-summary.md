# Thread 8: size budget and the sprint's summary changeset (2026-10-19)

Branch `20261019-summary`, stacked on #176, in the line main -> #177 -> #178 -> #179 -> #176 -> (this PR). Justify: green (core 2225 passed, 35 skipped; indexeddb 142; postgres 257; convex 267; graphql 250; react 228; e2e 86).

* **Built**:
  * `.changeset/20261019-summary.md`, five packages minor (core, indexeddb, postgres, convex, graphql; react ships nothing in the four PRs): what a host does who uses one of our adapters, writes its own VaultDB, or catches refusal kinds, and that nothing stored changes. Cautions on the sidecar's trust class and overlapping `storeBox()` calls close it.
  * The core README's `bad_record` row gains a clause: a store with no lockbox, or vault props whose applabel fails the name floor, is still `bad_label` (those checks run first).
* **Size budget**: `pnpm size` (builds) passed, and `pnpm size:budget --write` changed no line of `.size-limit.json`. Every entry's rule stayed where it was (measures: everything 35.874 kB of 39; Vault 28.584 of 32; stableJsonify 2.324 of 3.5; argon2idWebV1Deriver 5.163 of 8.2; idbDeviceDB 10.578 of 14; browserOpts 16.4 of 20; mask 5.742 of 8.8; validators 4.042 of 6.1; DefaultValidators 3.455 of 5.2; argon2idWasmWebV1Deriver 9.513 of 13; argon2idWasmDeriver 15.221 of 19; zxcvbnPassphraseTest 213.738 of 220; idbVaultDB 1.379 of 2.4; VaultProvider 4.786 of 7.2; reactEverything 5.273 of 8.3).
* **Decisions taken**:
  * The last sprint's summary changeset is `.changeset/20261018-sweep.md`; it left the per-thread changesets beside it ("this release's other entries say each change in full"). This one does the same, and its first paragraph says so.
  * Written from the four PRs' changesets, not the code, except that the `idbVaultDB` bell clause was checked against `idb-vault-db.ts` (the changesets do not mention it).
  * Level minor for the five packages, as #177 and #178 are.

## Open matters

* **Per-PR changesets stay beside the summary**, as last sprint. Recommendation: keep.
* **Summary names five packages, not react/fastkey.** Recommendation: keep; they release in lockstep anyway.
