# Thread 3: the Convex component (2026-10-15)

Branch `20261014-convex_component`, PR [#19](https://github.com/mrflip/safebyok/pull/19), stacked on #18 (restacked onto its final
tip, `0e67d7a`). Justify: root green (268 tests, build, attw, publint); `packages/safebyok-convex`
green (lint, typecheck, 99 tests).

* **Built**, all in `packages/safebyok-convex/`:
  - `src/component/`: `convex.config.ts` (`defineComponent('safebyok')`), `schema.ts`
    (`safebyok_bundles` by `by_scope`, `safebyok_lockboxes` by `by_box`, `user_id` leading),
    `validators.ts` (one Convex validator per core record and expectation, `Ciphered` shared and
    nested, `format` a `v.union` of literals), and `vaults.ts`, the nine functions.
  - `src/server.ts`: `SafebyokComponent`, whose `.api({ getUserId })` returns the nine public
    functions a host re-exports; `GetUserId`, `SafebyokErrorData`, `SafebyokErrorKindVals`, and
    `SafebyokApi`, the type of `api.safebyok` on the client.
  - `src/component-api.ts`: `ComponentApi`, derived from the functions' types.
  - `src/test.ts`: `register(t, componentPath?)` for hosts' `convex-test` suites; returns the
    typed `components.safebyok`.
  - Entry points: `./convex.config`(`.js`), `./_generated/component.js`, `./server`, `./test`.
    `.` is left free for thread 4's `convexVaultDB`.
  - README (install, what is stored, the functions); four entries in `notes/security.md`.

* **The functions** (host wrappers and component alike; host refs are `api.safebyok.<fn>`, component
  refs `components.safebyok.vaults.<fn>`). `scope` is `{ applabel, user_id, vaultlabel }`; records
  are the core's, exactly.

  | Function           | Args                                                       | Returns                                       |
  | ------------------ | ---------------------------------------------------------- | --------------------------------------------- |
  | `getBundle`        | `{ scope }`                                                | `VaultBundle \| null`                         |
  | `createBundle`     | `{ bundle: VaultBundle }`                                  | `VaultBundle` (the one standing after)        |
  | `updateBundle`     | `{ bundle, expected: { vault_id, passphrase_epoch } }`     | `boolean`                                     |
  | `getBox`           | `{ scope, boxlabel }`                                      | `Lockbox \| null`                             |
  | `listBoxSummaries` | `{ scope }`                                                | `Lockbox` minus both ciphered fields, `format` kept, boxlabel order |
  | `updateBox`        | `{ scope, lockbox, expected: { vault_id, revision_id: string \| null } }` | `boolean`                      |
  | `eraseBox`         | `{ scope, boxlabel, expected: { vault_id } }`              | `boolean` (true also when no box stood)       |
  | `eraseVault`       | `{ scope, expected: { vault_id } }`                        | `boolean`                                     |
  | `watchVault`       | `{ scope }`                                                | `{ vault_id: string \| null, passphrase_epoch: number \| null, boxes: [boxlabel, revision_id][] }` |

* **Decisions taken**:
  - **An expectation miss resolves `false`; it never throws.** It maps one to one onto thread 2's
    `do*` halves (which resolve `false`; the base class throws `stale_write`), and an expected
    race is not an error in the host's Convex logs. A scope with no bundle is a miss too.
  - **The only `ConvexError` is `{ kind: 'not_permitted', message }`**, thrown by the host
    wrapper for signed out (null, undefined or empty id) and for another user alike, with
    different fixed messages. Thread 4 maps `data.kind` straight to `VaultError`. Anything else
    (a validator refusing malformed args, `.unique()` finding two rows) is a plain Error:
    `storage_unavailable` to the client.
  - **The component itself never authenticates** (no `ctx.auth` inside a component) and never
    throws; the host wrapper authenticates before calling it, in the same transaction.
  - **Arguments are named objects with `scope` nested**, as the `do*` signatures are, so an
    argument can be added without reshaping.
  - **`watchVault` with no bundle** answers `vault_id` and `passphrase_epoch` as null.
  - **`_generated/`**: codegen for a component needs a deployment (the CLI loads deployment
    credentials before anything else). `server.ts`, `dataModel.ts` and the stub `api.ts` are
    static templates, so I ran Convex 1.46.0's own template functions offline, formatted by its
    prettier dependency: what codegen writes before its push (same templates, same formatter). `component.ts` needs the
    server's analysis, so `ComponentApi` is derived from the functions' types instead, and the
    `./_generated/component.js` export points at it. Nothing is blocked.
  - **Erase expectation** (the Coach's ruling of 2026-10-15): `EraseExpectation`, `{ vault_id }`,
    the core's own name and type, checked in the transaction and resolving `false` like the updates.
  - Source-exported, like safebyok-react today; no `dist/`.
  - `vite` added as a dev dependency (the types of `import.meta.glob`, which `src/test.ts`
    uses to load the component's modules).

* **Deviations**:
  - Pulled forward: `SafebyokApi`, the type of a client's `api.safebyok`, for thread 4's
    `convexVaultDB(client, api)` signature.
  - **A core change**, under the Coach's ruling that threads may shape the core (`c7ea3e5`,
    `api:`): `safebyok` exports `VaultBundle` and `VaultScope` as Zod validators too, as it
    already did `Lockbox` and `LockboxSummary`. It is additive public surface, and no stored
    record changed. The core's export-list test and two new case tables in `tests/types.test.ts`
    cover it. The package's tests now import the records from `safebyok`, not `src/`.
  - `design.md` updated after the restack: the refusal and miss conventions, the per-vault size
    bound under *Sizes*, and the *Open* packaging item, now settled for the workspace.

* **Discoveries**:
  - **Size bound.** Listing, watching and erasing read the whole vault in one transaction
    (16 MiB read). Each delete reads its row again, so an erase reads the vault twice: about
    150 lockboxes at the largest default whisper (about 54 KB each). Tested at 140; 160 fails.
    API-key boxes are about 1 KB.
  - Zod strips an unknown field; Convex refuses it. Tested and recorded.
  - The tests still import the core's test-only `testDeriver` by relative path
    (`../../../tests/helpers`). That path moves with #16.
  - `convex-test`'s `defineTestApp` tests a host app with no codegen.
  - **For thread 4**: `tests/helpers.ts` has `realRecords()` (a vault made by the core) and
    `componentTest()`. A ConvexError's `data` arrives intact through `convex-test`.

* **Review**: clean, no commits. Two of its minor notes taken as docs (`62c2051`): Convex's
  validation errors quote refused arguments into the host's logs (`notes/security.md`), and
  `./test` assumes vitest or Vite (README).

* **For the Coach**:
  - **Vault size**: no write enforces a cap, so a vault can outgrow one transaction's erase
    (and later list and watch). Should a write-side cap or a batched erase come before publishing?
  - **CI**: `safebyok-convex` is in no CI job. Wiring it waits on #15. It needs `pnpm build` at
    the root first.
  - **Publishing**: a built `dist/` needs each component module kept as its own file (no
    bundling), with `convex.config.js` and `_generated/` beside it, as Convex's component
    template builds with `tsc`. That belongs with the release threads.
  - **Optional codegen**, needing a deployment: from a Convex app with `CONVEX_DEPLOYMENT` set,
    `npx convex codegen --component-dir <path>/packages/safebyok-convex/src/component` writes
    the real `component.ts` and a typed `api.ts`. I have not run it, and nothing waits on it.
  - Should the component enforce the label grammar server-side too? It is structural today
    (`notes/security.md`).
