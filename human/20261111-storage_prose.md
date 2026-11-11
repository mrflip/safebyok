# 20261111-storage_prose: open questions

PR: https://github.com/mrflip/safebyok/pull/645, a plain-English pass over core storage, the classifier hunks and the four vaultDB adapters. Stacked on #639.

1. Convex box cap, soft or exact? `ConvexVaultDBOpts.maxBoxes` and the `putBox` comment in `component/vaults.ts` say "soft". The mutation enforces `min(maxBoxes, MaxVaultBoxes)` inside its transaction, and the README says "exact". The comments still say "soft" pending a ruling.
2. Your Gallant for `liveVaultOf` opens with "Fetch", but the helper fetches nothing: it returns the row it is handed, or throws. I used your wording as written; "Return" would match the code.
3. Possible renames, not made: `gateRefusalOf` (safebyok-graphql) names the sign-in check, and `signInRefusalOf` would fit. `VaultAnswered` and `BoxAnswered` (safebyok-postgres) name raw database results, not `Answer`s.
4. The `/* The refusals of a vaultDB ... */` comment in `refusals/throwers.ts` says `meta` carries `world` and `dbhas`. The throwers put them in `rows`. Outside this PR's scope, so left alone.
5. `e2e/tests/postgres/races.test.ts` (the box-cap race) fails on the unmodified #639 tip as well as on this branch.

## Settled (2026-11-11, second round)

1. The box cap is soft everywhere. Convex and IndexedDB say they currently enforce it exactly, with no promise.
2. `liveVaultOf` uses the Coach's edited Gallant, corrected to name `absent_vault` and `vault_reborn`, the kinds it throws.
3. `signInRefusalOf` is renamed. The Coach takes the Postgres names.
4. The throwers banner is in TODO.md.
5. The gallant edits and the Coach's `refusalOf` and `listedRowOf` hand edits are swept into #645. The meta key stays `call`.
6. The gallantdocs skill is in #646, stacked on #645.
