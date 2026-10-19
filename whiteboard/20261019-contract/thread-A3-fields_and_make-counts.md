# Thread A3: test counts per file, base and tip

For the reviewer of [thread A3](thread-A3-fields_and_make.md): every test file in the workspace, counted with vitest's JSON reporter at the base (`7b175db8`) and at the tip (`9e629043`). *Total* counts every test, skipped included; *skipped* are the live-backend suites. Rows in bold moved. `vault-hello.test.ts` took 52 tests out of `vault-make.test.ts` unchanged (commit `fcf6acee`); at the first tip `vault-make.test.ts` held 72 of its own and 21 new, `vault-hello.test.ts` the 52 and 35 new. The review rework (after `cf405f13`) added one to `vault-make.test.ts` (the reviewer's) and four to `vault-hello.test.ts`: the rows below, and the safebyok and all totals, are as of the rework, from `pnpm justify`'s counts.

| Workspace | Base total (skipped) | Tip total (skipped) |
| --- | ---: | ---: |
| root | 265 (0) | 265 (0) |
| safebyok | 2219 (35) | 2280 (35) |
| safebyok-convex | 277 (8) | 277 (8) |
| safebyok-fastkey | 49 (0) | 49 (0) |
| safebyok-graphql | 271 (14) | 271 (14) |
| safebyok-indexeddb | 154 (10) | 154 (10) |
| safebyok-postgres | 278 (14) | 278 (14) |
| safebyok-react | 230 (0) | 231 (0) |
| safebyok-demo-react | 215 (16) | 215 (16) |
| e2e | 184 (96) | 184 (96) |
| **all** | **4142 (193)** | **4204 (193)** |

| File | Base total | Base skipped | Tip total | Tip skipped |
| --- | ---: | ---: | ---: | ---: |
| `demos/safebyok-demo-react/tests/App.test.tsx` | 3 | 0 | 3 | 0 |
| `demos/safebyok-demo-react/tests/components/KnockKnock.test.tsx` | 15 | 0 | 15 | 0 |
| `demos/safebyok-demo-react/tests/components/PsstModal.test.tsx` | 3 | 0 | 3 | 0 |
| `demos/safebyok-demo-react/tests/components/SessionBar.test.tsx` | 7 | 0 | 7 | 0 |
| `demos/safebyok-demo-react/tests/components/TroubleBoundary.test.tsx` | 2 | 0 | 2 | 0 |
| `demos/safebyok-demo-react/tests/components/VaultDashboard.test.tsx` | 20 | 0 | 20 | 0 |
| `demos/safebyok-demo-react/tests/components/WaysIn.test.tsx` | 3 | 0 | 3 | 0 |
| `demos/safebyok-demo-react/tests/components/inspection/DeviceDBInspectionPanel.test.tsx` | 3 | 0 | 3 | 0 |
| `demos/safebyok-demo-react/tests/components/inspection/StoreTable.test.tsx` | 9 | 0 | 9 | 0 |
| `demos/safebyok-demo-react/tests/components/inspection/VaultDBInspectionPanel.test.tsx` | 4 | 0 | 4 | 0 |
| `demos/safebyok-demo-react/tests/hooks/useSession.test.tsx` | 1 | 0 | 1 | 0 |
| `demos/safebyok-demo-react/tests/lib/anthropic.test.ts` | 4 | 0 | 4 | 0 |
| `demos/safebyok-demo-react/tests/lib/asks-again.test.ts` | 4 | 0 | 4 | 0 |
| `demos/safebyok-demo-react/tests/lib/auth.test.ts` | 16 | 0 | 16 | 0 |
| `demos/safebyok-demo-react/tests/lib/outage.test.ts` | 93 | 16 | 93 | 16 |
| `demos/safebyok-demo-react/tests/lib/persist-storage.test.ts` | 4 | 0 | 4 | 0 |
| `demos/safebyok-demo-react/tests/lib/whisper-text.test.ts` | 10 | 0 | 10 | 0 |
| `demos/safebyok-demo-react/tests/test-helpers.test.tsx` | 14 | 0 | 14 | 0 |
| `e2e/tests/convex/convex-vault-db.test.ts` | 96 | 8 | 96 | 8 |
| `e2e/tests/postgres/battery.test.ts` | 83 | 83 | 83 | 83 |
| `e2e/tests/postgres/foreign-key.test.ts` | 2 | 2 | 2 | 2 |
| `e2e/tests/postgres/races.test.ts` | 3 | 3 | 3 | 3 |
| `packages/safebyok-convex/tests/component/tallies.test.ts` | 19 | 0 | 19 | 0 |
| `packages/safebyok-convex/tests/component/validators.test.ts` | 43 | 0 | 43 | 0 |
| `packages/safebyok-convex/tests/component/vaults.test.ts` | 31 | 0 | 31 | 0 |
| `packages/safebyok-convex/tests/convex-vault-db.test.ts` | 108 | 8 | 108 | 8 |
| `packages/safebyok-convex/tests/refusals.test.ts` | 12 | 0 | 12 | 0 |
| `packages/safebyok-convex/tests/server.test.ts` | 51 | 0 | 51 | 0 |
| `packages/safebyok-convex/tests/test-helpers.test.ts` | 4 | 0 | 4 | 0 |
| `packages/safebyok-convex/tests/test.test.ts` | 2 | 0 | 2 | 0 |
| `packages/safebyok-convex/tests/testing.test.ts` | 7 | 0 | 7 | 0 |
| `packages/safebyok-fastkey/tests/index.test.ts` | 1 | 0 | 1 | 0 |
| `packages/safebyok-fastkey/tests/wasm-deriver.test.ts` | 48 | 0 | 48 | 0 |
| `packages/safebyok-graphql/tests/fields.test.ts` | 12 | 0 | 12 | 0 |
| `packages/safebyok-graphql/tests/graphql-vault-db.test.ts` | 119 | 0 | 119 | 0 |
| `packages/safebyok-graphql/tests/index.test.ts` | 2 | 0 | 2 | 0 |
| `packages/safebyok-graphql/tests/server.test.ts` | 1 | 0 | 1 | 0 |
| `packages/safebyok-graphql/tests/vault-resolvers.test.ts` | 20 | 0 | 20 | 0 |
| `packages/safebyok-graphql/tests/vault-schema.test.ts` | 31 | 0 | 31 | 0 |
| `packages/safebyok-graphql/tests/yoga-recipe.test.ts` | 86 | 14 | 86 | 14 |
| `packages/safebyok-indexeddb/tests/ckeys.test.ts` | 18 | 0 | 18 | 0 |
| `packages/safebyok-indexeddb/tests/idb-opts.test.ts` | 7 | 0 | 7 | 0 |
| `packages/safebyok-indexeddb/tests/idb-vault-db.test.ts` | 114 | 10 | 114 | 10 |
| `packages/safebyok-indexeddb/tests/index.test.ts` | 1 | 0 | 1 | 0 |
| `packages/safebyok-indexeddb/tests/inspect-idb-vault-db.test.ts` | 5 | 0 | 5 | 0 |
| `packages/safebyok-indexeddb/tests/shelf.test.ts` | 9 | 0 | 9 | 0 |
| `packages/safebyok-postgres/tests/columns.test.ts` | 14 | 0 | 14 | 0 |
| `packages/safebyok-postgres/tests/index.test.ts` | 1 | 0 | 1 | 0 |
| `packages/safebyok-postgres/tests/postgres-vault-db.test.ts` | 162 | 0 | 162 | 0 |
| `packages/safebyok-postgres/tests/route-recipe.test.ts` | 87 | 14 | 87 | 14 |
| `packages/safebyok-postgres/tests/vault-tables.test.ts` | 14 | 0 | 14 | 0 |
| `packages/safebyok-react/tests/boundary.test.tsx` | 6 | 0 | 6 | 0 |
| `packages/safebyok-react/tests/is-mounted.test.tsx` | 6 | 0 | 6 | 0 |
| `packages/safebyok-react/tests/messages.test.ts` | 3 | 0 | 3 | 0 |
| `packages/safebyok-react/tests/passkey-unlock-button.test.tsx` | 21 | 0 | 21 | 0 |
| `packages/safebyok-react/tests/passkey.test.ts` | 13 | 0 | 13 | 0 |
| `packages/safebyok-react/tests/passphrase-modal.test.tsx` | 91 | 0 | 91 | 0 |
| `packages/safebyok-react/tests/reveal-toggle.test.tsx` | 2 | 0 | 2 | 0 |
| **`packages/safebyok-react/tests/vault-provider.test.tsx`** | 79 | 0 | 80 | 0 |
| `packages/safebyok-react/tests/whisper-field.test.tsx` | 9 | 0 | 9 | 0 |
| `packages/safebyok/tests/box.test.ts` | 28 | 0 | 28 | 0 |
| `packages/safebyok/tests/browser.test.ts` | 13 | 0 | 13 | 0 |
| `packages/safebyok/tests/change-bell.test.ts` | 16 | 0 | 16 | 0 |
| `packages/safebyok/tests/ckeys.test.ts` | 37 | 0 | 37 | 0 |
| `packages/safebyok/tests/console-logger.test.ts` | 3 | 0 | 3 | 0 |
| `packages/safebyok/tests/crypto.test.ts` | 20 | 0 | 20 | 0 |
| `packages/safebyok/tests/ctx-bytes.test.ts` | 4 | 0 | 4 | 0 |
| `packages/safebyok/tests/del-damaged-vault.test.ts` | 11 | 0 | 11 | 0 |
| `packages/safebyok/tests/device-db.test.ts` | 7 | 0 | 7 | 0 |
| `packages/safebyok/tests/errors.test.ts` | 58 | 0 | 58 | 0 |
| `packages/safebyok/tests/expectations.test.ts` | 40 | 0 | 40 | 0 |
| `packages/safebyok/tests/idb-opts.test.ts` | 6 | 0 | 6 | 0 |
| `packages/safebyok/tests/idb.test.ts` | 33 | 0 | 33 | 0 |
| `packages/safebyok/tests/index.test.ts` | 9 | 0 | 9 | 0 |
| `packages/safebyok/tests/key-deriver-spec.test.ts` | 30 | 0 | 30 | 0 |
| `packages/safebyok/tests/key-deriver.test.ts` | 47 | 0 | 47 | 0 |
| `packages/safebyok/tests/local-vault-db.test.ts` | 19 | 0 | 19 | 0 |
| `packages/safebyok/tests/logger.test.ts` | 30 | 0 | 30 | 0 |
| `packages/safebyok/tests/mask.test.ts` | 155 | 0 | 155 | 0 |
| `packages/safebyok/tests/names.test.ts` | 28 | 0 | 28 | 0 |
| `packages/safebyok/tests/one-at-a-time.test.ts` | 8 | 0 | 8 | 0 |
| `packages/safebyok/tests/options.test.ts` | 6 | 0 | 6 | 0 |
| `packages/safebyok/tests/outcome.test.ts` | 10 | 0 | 10 | 0 |
| `packages/safebyok/tests/passphrase-strength.test.ts` | 16 | 0 | 16 | 0 |
| `packages/safebyok/tests/refusal-policy.test.ts` | 21 | 0 | 21 | 0 |
| `packages/safebyok/tests/refusals.test.ts` | 29 | 0 | 29 | 0 |
| `packages/safebyok/tests/report-error.test.ts` | 4 | 0 | 4 | 0 |
| `packages/safebyok/tests/sanitizer.test.ts` | 4 | 0 | 4 | 0 |
| `packages/safebyok/tests/stable-jsonify.test.ts` | 4 | 0 | 4 | 0 |
| `packages/safebyok/tests/string-store.test.ts` | 11 | 0 | 11 | 0 |
| `packages/safebyok/tests/test-helpers.test.ts` | 374 | 18 | 374 | 18 |
| `packages/safebyok/tests/types.test.ts` | 117 | 0 | 117 | 0 |
| `packages/safebyok/tests/utils.test.ts` | 3 | 0 | 3 | 0 |
| `packages/safebyok/tests/validators.test.ts` | 76 | 0 | 76 | 0 |
| `packages/safebyok/tests/vault-db.test.ts` | 291 | 17 | 291 | 17 |
| `packages/safebyok/tests/vault/vault-boxes.test.ts` | 102 | 0 | 102 | 0 |
| `packages/safebyok/tests/vault/vault-del.test.ts` | 47 | 0 | 47 | 0 |
| **`packages/safebyok/tests/vault/vault-hello.test.ts`** | 0 | 0 | 91 | 0 |
| `packages/safebyok/tests/vault/vault-lease.test.ts` | 84 | 0 | 84 | 0 |
| **`packages/safebyok/tests/vault/vault-make.test.ts`** | 124 | 0 | 94 | 0 |
| `packages/safebyok/tests/vault/vault-races.test.ts` | 61 | 0 | 61 | 0 |
| `packages/safebyok/tests/vault/vault-storage.test.ts` | 74 | 0 | 74 | 0 |
| `packages/safebyok/tests/vault/vault-wayins.test.ts` | 64 | 0 | 64 | 0 |
| `packages/safebyok/tests/wayin.test.ts` | 60 | 0 | 60 | 0 |
| `packages/safebyok/tests/whisper-field.test.ts` | 3 | 0 | 3 | 0 |
| `packages/safebyok/tests/zxcvbn-passphrase-test.test.ts` | 32 | 0 | 32 | 0 |
| `tests/scripts/changeset.test.ts` | 35 | 0 | 35 | 0 |
| `tests/scripts/clear-ds-store.test.ts` | 9 | 0 | 9 | 0 |
| `tests/scripts/cut-thread.test.ts` | 6 | 0 | 6 | 0 |
| `tests/scripts/dependabot.test.ts` | 19 | 0 | 19 | 0 |
| `tests/scripts/file-thread.test.ts` | 14 | 0 | 14 | 0 |
| `tests/scripts/git-attic.test.ts` | 15 | 0 | 15 | 0 |
| `tests/scripts/git-survey.test.ts` | 27 | 0 | 27 | 0 |
| `tests/scripts/newb-label.test.ts` | 16 | 0 | 16 | 0 |
| `tests/scripts/release.test.ts` | 52 | 0 | 52 | 0 |
| `tests/scripts/require-pnpm.test.ts` | 7 | 0 | 7 | 0 |
| `tests/scripts/runtime-deps.test.ts` | 28 | 0 | 28 | 0 |
| `tests/scripts/size-budget.test.ts` | 33 | 0 | 33 | 0 |
| `tests/test-helpers.test.ts` | 4 | 0 | 4 | 0 |
