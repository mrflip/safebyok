# 20261014-convex: the Convex VaultDB adapter

Design agreed in chat with the Coach, 2026-10-14. Built since: the component, the host's `SafebyokComponent` and the client's `convexVaultDB` shipped in `packages/safebyok-convex` (this file is historical, and what it says may have moved on; the code and the package README are current).

## Decisions

* **A Convex component, in its own workspace package**, `packages/safebyok-convex` (like
  safebyok-react). It ships `convex.config` with its own isolated tables, a server class whose
  `.api({ getUserId })` returns the functions the host re-exports from its `convex/` directory,
  and the client `convexVaultDB(client, api)`. `convex` is a peer dependency.
* **Typed schema columns** that mirror the Zod records field for field, not an opaque blob. A new
  record format widens a `v.union` on `format`: an additive deploy that ships with the package.
* **Ciphered fields stay nested**, `{ cipher_iv_b64, ciphertext_b64 }`, exactly as the record holds
  them, under one shared `ciphered` validator. Not flattened into columns, not `v.bytes()`.
* **Only the bundle and lockboxes go remote.** DeviceUnlock never does; no revision history is kept.
* **New error kinds are added as the adapter needs them** (likely `not_permitted`,
  `storage_unavailable`).
* **The adapter implements the vault's verbs directly** (the Coach's storage rulings,
  `winboard/20261014-crypto/rulings.md`): no fetch/save/trash primitives underneath. Each verb
  is one Convex query or mutation, and the base class keeps validation wrapped around it.
* **`versionedUpdate` is a mutation** that reads the standing row and checks its `revision_id`
  (lockbox) or `passphrase_epoch` (bundle) in the same transaction it writes in. Convex mutations
  are serializable, so the check is atomic for real; a failed expectation refuses as `stale_write`.
* **`maxRecordBytes` is 1 MiB** (1_048_576), Convex's document limit.
* **Numbers are `v.number()`** (float64, exact to 2^53 - 1, the rulings' safe-integer storage
  contract), never `v.int64()`, which reads back as a BigInt.
* **Dev dependencies**: `convex-test` (with its `@edge-runtime/vm` environment) tests the
  component's functions under vitest. `convex-helpers` is left out: its Zod bridge is the kind of
  kit CLAUDE.md rules out, and nothing else in it is needed.

## Tables

`safebyok_bundles`: the VaultBundle record as-is. Index `by_scope: [user_id, applabel, vaultlabel]`.

`safebyok_lockboxes`: scope columns (`applabel`, `user_id`, `vaultlabel`) added on write and stripped
on read, plus the Lockbox record as-is. Index `by_box: [user_id, applabel, vaultlabel, boxlabel]`
serves both one box (all four) and the vault's boxes (the first three). `note` is omitted, never
written as `undefined`, which Convex refuses.

`user_id` leads both indexes: every call is one user's, and deleting an account is one range.

## Interface map

The VaultDB verbs are as the storage thread settled them (2026-10-15, thread
`20261014-storage_verbs`): each public verb validates and calls the adapter's `do*` half, so
`convexVaultDB` implements `doReadBundle`, `doCreateBundle` and the rest, one Convex function each.
The rulings' `versionedUpdate` is `updateBundle` and `updateBox`; the erases carry a `vault_id`-only
`EraseExpectation` (ruled 2026-10-15), and refuse as `stale_write` like the updates.

| VaultDB verb                 | Convex function                  | Notes                                                       |
| ---------------------------- | -------------------------------- | ----------------------------------------------------------- |
| `readBundle`                 | query `getBundle`                | record minus `_id`, `_creationTime`; or null                |
| `createBundle`               | mutation `createBundle`          | find-or-insert in one transaction: the creation race closes |
| `updateBundle`               | mutation `updateBundle`          | only if the standing `vault_id` and `passphrase_epoch` are the expected ones |
| `readBox`                    | query `getBox`                   |                                                             |
| `listBoxes`                  | query `listBoxSummaries`         | projected server-side, keeping `format`; sorted client-side |
| `updateBox`                  | mutation `updateBox`             | only if the scope's bundle has the expected `vault_id`, and the standing `revision_id` is the expected one (or, for null, there is none); refuses when the scope holds no bundle |
| `eraseBox`                   | mutation `eraseBox`              | only if the scope's bundle has the expected `vault_id`; no revision expected, so erase wins; quiet (true) on an absent box |
| `eraseVault`                 | mutation `eraseVault`            | only if the bundle has the expected `vault_id`; boxes and bundle in one transaction |
| `subscribe`                  | `onUpdate` on query `watchVault` | `{ vault_id, passphrase_epoch, boxes: [[boxlabel, revision_id]] }`, ids null while no bundle stands; every result calls `onChange`, the first included |
| `maxRecordBytes`             | (a constant)                     | 1 MiB                                                       |

Every function first resolves `getUserId(ctx)`, the host's callback: inside a component
`ctx.auth` is not available, so the app authenticates and passes the user id in (Convex docs,
*Authoring Components*, which show the same re-export wrapper taking an auth callback). Null
(or empty) and a `user_id` argument that differs both refuse with a `ConvexError` whose data is
`{ kind: 'not_permitted', message }`, the VaultError kind of that name. An update or erase whose
expectation fails is not refused: it writes nothing and resolves `false`, which the base class
turns into `stale_write` (built 2026-10-15, thread `20261014-convex_component`; the functions'
args and returns are in its thread file).

The client accepts a `ConvexReactClient` or a `ConvexClient`, so a React app reuses its socket
(built 2026-10-15, thread `20261014-convex_client`): `convexVaultDB(client, api.safebyok)` takes
either through a structural type, watching with `onUpdate` or `watchQuery(...).onUpdate`. The first
`watchVault` result is not skipped, as first planned: the vault subscribes before its first read,
so that result may carry a write the read missed, and a `ConvexReactClient` already watching the
vault sends no first result at all, only changes. A redundant refresh costs two queries.

## Sizes

Measured 2026-10-14. PKCS#8 PEM private keys are 1704, 3272 and 6392 bytes at RSA 2048, 4096 and
8192; their public keys 451, 800 and 1491. Stored as a whisper, the 8192 PEM is 8680 bytes of
base64 ciphertext. Per-record limits: DynamoDB 400 KB, Convex and Firestore 1 MiB; localStorage
holds about 5 MB per origin in all. The binding constraints on whisper size are those limits,
base64 growth, refresh fan-out (every refresh reads every lockbox) and one-shot WebCrypto
encryption holding the whole whisper in memory several times; encryption time is not one.

Per vault, on Convex (measured 2026-10-15, under `convex-test`'s enforced limits): listing,
watching and erasing each read the whole vault in one transaction, which may read 16 MiB, and an
erase reads every lockbox twice. At the default `maxWhisperBytes` a lockbox is about 54 KB, so a
vault erases whole up to about 150 such lockboxes (140 passes, 160 fails); an API-key lockbox is
about 1 KB.

## Open

* Whisper size cap: built in the core, PR #7 (`maxWhisperBytes`, adapters' `maxRecordBytes`).
* ~~A box written under one `vault_id` landing in a vault recreated under another.~~ Closed by
  the storage thread: `updateBox` carries a `vault_id` expectation.
* Component packaging: settled for the workspace, not for npm. The package is source-exported:
  `safebyok-convex/convex.config`, `./server` (`SafebyokComponent`), `./test` (`register`), and
  `./_generated/component.js`, where `ComponentApi` is derived from the functions' types because
  Convex's codegen of a component's `component.ts` needs a deployment. A published build keeps
  each component module its own file (no bundling), with `convex.config.js` and `_generated/`
  beside it; that waits on the release threads.
