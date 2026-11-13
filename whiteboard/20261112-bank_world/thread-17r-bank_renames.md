# Thread 17r: bank_renames (2026-11-12)

Branch `20261112-bank_renames`, PR #687, stacked on #686. Justify: green (safebyok 2964, react 262, convex 304, demo 99, e2e 549).

* **Built**: four commits, plus an empty changeset (nothing exported was renamed).
  * convex `Tallies.refuses` is `wouldPassLimit` and `Tallies.weigh` is `sizeOf` (`src/component/tallies.ts`, its caller in `banks.ts`, `tests/component/tallies.test.ts`). `refuses` returned true when a put would pass a limit, which is how `wouldPassLimit` reads, so no boolean was inverted.
  * react devmode `Listing<ValT>` is `PanelListing<ValT>` (`src/shapes.ts`, `src/devmode/last-call.tsx`).
  * react `hooks.ts` banner no longer lists `VaultStage, VaultLifecycle`; `VaultLifecycle` takes its stages from `VaultStage` with `Extract`.
  * the `delUnlocked` test helper is removed from `packages/safebyok/tests/test-helpers/vault-world.ts`.
* **Decisions taken**: `Extract<VaultStage, ...>` per variant, so a stage dropped from `VaultStage` fails the typecheck. `Exclude` would have let a new stage slide into the `vault: null` variant.
* **Deviations**:
  * Item 3, `useProvided`, is left alone: it is exported from `provider/bank-provider.tsx` but not from `src/index.ts` or `src/devmode/index.ts`, so it is internal. `Listing` (item 2) and the two convex names (item 1) are internal too, hence no changeset.
  * Item 5's premise is stale: `f30dca523` made `vault.del` and `putBox` demand the unlock again, so `delUnlocked` did still add the `ensureUnlocked`. It had no caller anywhere, so it went as dead code, and the commit says so.
  * Item 6, no change. Both calls stay because removing them changes what the user sees. `KnockKnockWidget` goes on to `putBox`, which refuses `bank_locked` on a locked bank. `CreateVaultButton` documents "building or unlocking the bank first": without the call, no unlock dialog is shown and the vault is created locked.
* **For the Coach**: whether `CreateVaultButton` should stop unlocking (its doc block and the demo's tests say it unlocks).

* **Discoveries**: the first worker was interrupted after four commits; the second checked them (item 1's boolean unchanged; item 3 internal; item 6 left) and ran justify. Nothing else remained.
