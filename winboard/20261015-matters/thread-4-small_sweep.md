# Thread 4: small_sweep (2026-10-15)

Branch `20261015-small_sweep`, PR [#99](https://github.com/mrflip/safebyok/pull/99), cut from main at `c4c070f`. Justify: green (root 123 tests; core 956, indexeddb 104, postgres 156, react 71, demo 124, convex 276, graphql 153, argon2-wasm 44).

* **Built**: six commits, one per bullet of the gloss.
  - `demo:` the flaky read at `demos/safebyok-demo-react/tests/test-helpers.test.tsx:62` is now a `waitFor`.
  - `docs:` the Postgres README's Supabase section says in bold that the package has not been run against Supabase (it said "a reading of the docs" before). Not in the TODO. Carries an empty changeset (`.changeset/20261015-small_sweep.md`), since a README ships with the package.
  - `tools:` `justify:root` now runs lint, typecheck and test all three and fails if any failed (the shape of `justify`). Checked by running the shape with a failing middle step: exit 1, the others still ran.
  - `plan:` `TODO.md`: the e2e testing question; a "Ruled since" line replacing "Still awaiting a ruling" (HKDF info and `minimumReleaseAge`, threads 1 and 2; `addPasskey`'s shape kept as built); the three elevated matters pointed at the Open Matters tab; *Sand in the sandals* cleared.
  - `tools:` `.size-limit.json`: each budget is its measured size + 3 kB, rounded up to a whole kB (size-limit counts kB as 1000 bytes): everything 30, openVault 23, stableJsonify 6, argon2idWebV1Deriver 9, idbDeviceDB 13, browserOpts 18, mask 9, argon2idWasmWebV1Deriver 13, argon2idWasmDeriver 19.
  - `docs:` `.claude/skills/sprint/SKILL.md`: a *Size budgets* paragraph in §1 (read `pnpm size` when planning, estimate each thread's addition, have the first thread advance each cap to cover the sum -- the Coach's 25/28 + 1, 3, 6 -> 38 example) and a paragraph in §2 (workers do not edit the budgets afterwards, and report an overshoot).
* **Decisions taken**:
  - Sand items struck after checking each on main: the root `lint`/`typecheck`/`test` run every package and fail if any failed (the `both()` wrappers); the root eslint config ignores `**/dist/**`; the demo's vite coverage has `include`; no `--no-error-on-unmatched-pattern` remains in any script, config or workflow. `justify:root` was the last `&&` chain, fixed in this thread.
  - Also struck, beyond the list: "The second flaky tamper test" -- `vault.test.ts` already uses `TH.tweakB64` (low_hanging_fruit thread 10 swept it in).
  - Two of the three elevated-matter lines are a sentence added to the existing bullet (the base class, the vault cap); the revocation one is a new bullet, since none existed. Each links the sprint doc's Open Matters tab. The old "epoch revocation note" mention is folded into the revocation bullet / "Ruled since" line; Postgres's default limit of 1000 now rides with the cap matter.
  - The e2e line is worded from the Coach's question and "I will run acceptance tests"; the body text around the question is mine.
* **Deviations**: commit order differs from the gloss's listing (the `justify:root` fix precedes the TODO commit, so the TODO's struck line is true when it lands). No eslint-disable or ts-expect-error.
* **Discoveries**: size-limit measured the current budgets with 0.2 to 0.7 kB to spare, so every thread that added to the core would have hit the cap; the new margin is about 3 to 3.7 kB each.
* **For the Coach**: nothing blocking. `.size-limit.json` and `TODO.md` were edited by this thread alone, per the sprint plan.
