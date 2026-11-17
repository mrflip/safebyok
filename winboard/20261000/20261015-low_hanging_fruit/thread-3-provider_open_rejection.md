# Thread 3: provider_open_rejection (2026-10-15)

Branch `20261015-provider_open_rejection`, PR [#32](https://github.com/mrflip/safebyok/pull/32), cut from `origin/main`. Justify: green
(core 242, convex 210, react 12, demo 24 tests; root 67).

* **Built**: `VaultProvider` (`packages/safebyok-react/src/vault-provider.tsx`) holds an
  `openVault` rejection in state (`openFailure`, the error wrapped in `{ err }` so a rejection of
  any value, even `null`, still reads as failed) and throws it during render, after every hook
  has run. A rejection arriving after the effect was cleaned up (user signed out, props changed)
  is ignored. Once the provider throws, the boundary unmounts it, so a fresh attempt for a new identity needs the host to reset or re-key its boundary (the README says so); the `setOpenFailure(null)` in cleanup only matters for a provider that stays mounted. Five
  tests in `tests/vault-provider.test.tsx`: a bad label throws to a boundary as the very
  `bad_label` `VaultError`; a storage failure (`storage_unavailable` from `readBundle`) does too;
  a null user opens nothing and throws nothing even with a bad label; the reviewer added a `null` rejection and one arriving after sign-out. The doc block says so.
  Changeset `.changeset/20261015-provider_open_rejection.md`: `safebyok-react` patch.
* **Decisions taken**: the error is thrown as-is, not wrapped: it is already a `VaultError` with
  a `kind` and no secret in it, and a boundary can branch on it. `then(ok, onRejected)` rather
  than `.catch`, so only `openVault`'s rejection is caught, not a failure inside the success path.
  The edit is confined to the open effect, the error state and the render throw, so threads 1
  and 2 (props on the same provider) rebase mechanically.
* **Discoveries**: `open_vault_unsubscribe` (uncommitted in `/workspace/byok-open_vault_unsubscribe`)
  changes `openVault` itself to `close()` and rethrow when its first `refresh()` or
  `rememberedUnlock()` fails, so the storage watch is not leaked. That is the core half; this
  thread needs nothing from it, and the two meet only on the same failure path: with both, a
  rejected open leaves no watch and the provider shows the error. Its diff still uses pre-move
  paths (`src/vault.ts`, `tests/vault.test.ts`), so it needs repathing to `packages/safebyok/`
  before it can land. Nothing was carried over.
* **Open questions**: `storage_unavailable` is now thrown to the boundary although its message says
  "try again shortly"; for the Coach when the misuse-versus-condition split (TODO.md, *Error
  families*) comes up. And a failed open still leaks openVault's storage watch until the
  `open_vault_unsubscribe` core fix lands; each boundary reset repeats the leak.
* **Pulled forward from thread 9**: the README paragraph telling hosts to wrap `VaultProvider` in
  an error boundary keyed on the user's identity (`packages/safebyok-react/README.md`).
* **Reviewer**: added two tests (a `null` rejection reaches the boundary; a rejection after
  sign-out is ignored). The first commit's prefix was reworded from `react:` to `client:`.
* **For the Coach**: the demo (`demos/safebyok-demo-react`) has no error boundary, so a bad
  option there now reaches React's default (the dev overlay in dev, a blank tree in production).
  The README now tells a host to wrap `VaultProvider` in a boundary.
