# Sprint big_feats -- progress

Newer than the plan wherever they disagree. Each thread's own notes are in
`thread-<N>-<label>.md` on that thread's branch.

## Status

| # | Thread            | Base                                   | Status                         |
| - | ----------------- | -------------------------------------- | ------------------------------ |
| 1 | argon2_wasm       | #78 `4d2a0f8` (restacked; was #68)     | filed #74 `00daf1f`            |
| 2 | unlock_envelopes  | #82 `7bf5a4b` (restacked; was main)    | filed #71 `1c83205`            |
| 3 | passkey_unlock    | #71 `1c83205`                          | filed #76 `cfdd0be`            |
| 4 | indexeddb_package | #74 `00daf1f` (restacked; was #70)     | filed #77 `12fc4d0`            |
| 5 | postgres_vaultdb  | #76 `cfdd0be` (restacked; was #71)     | filed #73 `6d23727`            |
| 6 | graphql_vaultdb   | #73 `6d23727`                          | filed #78 `4d2a0f8`            |
| 7 | epoch_rename      | #77 `12fc4d0`                          | filed #84 `60af0b7`            |
| 8 | store_vault_cap   | #84 `60af0b7`                          | underway                       |
| 9 | unlock_fixes      | #77 `12fc4d0`                          | filed #88 `b616bc0`            |
| 10 | docs_housekeeping | #77 `12fc4d0`                         | filed #86 `e467b08`            |

## What the threads have taught

* *Orchestrator:* **For the final assembly** (#77 → #84 → thread 8 → #88 → #86 → #79, justify at the top):
  * **The PGlite boot fix moved #73 and #78.** CI timed out on the first test of each Postgres file while PGlite booted, so #73 (`89017f9`) and #78 (`b0e9e63`) now boot it in a `beforeAll` with a 60 s hook timeout. #74 still sits on #78's old tip: replay it with `--onto b0e9e63 4d2a0f8`, then #77 onto it, then the amendments.
  * **#88 against #84:** one known conflict, in `reviseUnlocks` (`vault.ts`). Resolve it as `unlock_epoch: standing.unlock_epoch + 1,` then `unlocks,`.
  * **#86 against #84:** the reviewer's u2 routing test in `packages/safebyok/tests/test-helpers.test.ts` names `passphrase_epoch`. Rename it.
  * **#86 against thread 8:** `perUser` and the test's `servingOnly` each need `maxLockboxes` beside `maxRecordBytes`.
* *Orchestrator:* **Reviews of the amendments:** #84, #86 and #88 all came back `fixed`, with nothing significant. Each review is posted on its PR. One correction from them reaches past the sprint: `@noble/hashes`'s one audit (Cure53, 2022) left Argon2 out of scope, so none of our Argon2id implementations is audited. #86 corrects `notes/security.md`.

* *Orchestrator:* **The restack** (2026-10-15, at the Coach's word). gripe_fixes restacked into one
  line on main (#66's duplicates dropped), top #82 `7bf5a4b`. Thread 2's worker replayed all six
  big_feats branches onto it, justified once at the top, and pushed. What it changed:
  * gripe_fixes' 32-byte check on a deriver's output (`derivePassphraseKey`) now lives in
    `envelope.ts`, where every derivation runs.
  * The four new packages' `build:deps` honour `SAFEBYOK_SKIP_BUILD_DEPS`.
  * A Postgres test now expects `bad_option` for a bundle naming another vault_id (#70 refuses it
    in the core).
  * Size budgets rose: `openVault` 19 kB, `everything` 27 kB, `idbDeviceDB` 9.5 kB, `browserOpts`
    14.5 kB.
  * Tests use gripe_fixes' `TH.expectRefusal` and `openUnlocked`.

* *Orchestrator:* **Adapters store field by field** (the Coach, 2026-10-15). The plan first said
  "store records whole"; the Convex component in fact keeps a typed column per field, and the
  Coach ruled that the cutoff is one opaque (`jsonb`) column per ciphered value or structured
  public payload, each its own field. The plan's *Ground rules* now say so, and thread 5 rebases
  onto thread 2 before filing.
* *Orchestrator:* **Thread 2 (unlock_envelopes), what later threads inherit** (from its thread
  file, `thread-2-unlock_envelopes.md` on `20261015-unlock_envelopes`):
  - **The bundle, for the adapters (threads 4-6):** `{ format, applabel, user_id, vaultlabel,
    vault_id, passphrase_epoch, unlocks, registered_at }`. `unlocks` is plain JSON, one `jsonb`
    column: a list of 1 to 8 `{ method: 'passphrase', unlock_id, unlocklabel, key_deriver_label,
    salt_b64, vault_key_wrapped: { cipher_iv_b64, ciphertext_b64 } }`. Nothing a verb compares is
    inside it. Build test bundles with `TH.bundleOf` / `TH.envelopeOf`, never by hand with the old
    field names (`vault_key_passphrase_wrapped`, `passphrase_salt_b64`).
  - **For thread 3 (passkey):** add `PasskeyEnvelope` to the union and `UnlockMethodVals`, its
    purpose to `PurposeForMethod` (`envelope.ts`), its public fields to `UnlockSummary` (make it a
    union) and `Envelope.summarize`; filter non-passphrase envelopes where `openWithPassphrase`'s
    comment says. **Every envelope change takes a proof** (the session vaultKey is
    non-extractable): adding a passkey needs a passphrase or another passkey's PRF bytes as
    proof, through a generalized `reviseUnlocks`, never an extractable vaultKey.
  - The envelope binding is `[format, scope, vault_id, purpose-per-method, header]`, with the
    epoch out, so one envelope's change never needs the other passphrases.
* *Orchestrator:* **Thread 4's base is [#70](https://github.com/mrflip/safebyok/pull/70)**
  (gripe_fixes `vaultdb_validation`, `d874db3`). What it changes under thread 4: `idbVaultDB`'s
  `dbName` is checked by a private parser, `src/idb-opts.ts`, shared with `idbDeviceDB`,
  `browserOpts` and `inspectIdb`. VaultDB's write verbs now validate each record and expectation
  before `do*` sees it, and hand the adapter the *parsed* record (unknown fields stripped).
  `openVault` duck-types `vaultDB`, since `instanceof` breaks across package copies. And #68 plus
  #70 together likely exceed the 16.5 kB `openVault` budget; thread 2 already raised it to 17.5 kB
  on its branch.
* *Orchestrator:* **Thread 5 (postgres_vaultdb), for thread 6** (from `thread-5-postgres_vaultdb.md`
  on `20261015-postgres_vaultdb`):
  - **The listBoxes resolver uses `PostgresVaultDB.listBoxRecords(scope)`**, not `listBoxes`: a
    VaultDB's public listing (summaries: no `format`, `note: null`) is not valid `doListBoxes`
    input, so a VaultDB over a wire cannot pass it through. #70 kept listings validated by the
    listed shape, so `listBoxRecords` stands as built.
  - The subscription resolver wraps `vaultDB.subscribe(scope, onChange)`; one `listen` (the
    README's `pg` fan-out) serves every per-request VaultDB. Change channel `safebyok_vault_changes`,
    payload the scope as JSON.
  - `describeVaultDB` over a per-request VaultDB needs `TH.perUser`. PGlite starts in about a
    second; share one per test file and truncate between tests.
  - Its README's route recipe (a POST handler plus a client VaultDB over `fetch`, tested in
    `tests/route-recipe.test.ts`) is the REST shape thread 6 parallels.
* *Orchestrator:* **Thread 1 (argon2_wasm), ready.** hash-wasm's Argon2id derives
  `argon2id_web_v1` in about 130 ms against noble's 580 ms (Node 24), byte for byte the same, and
  both meet Argon2id's reference test vector. It exports `parseKeyDeriverSpec` from the core (a
  public-surface addition awaiting the Coach's yes), so any Argon2id stand-in refuses exactly what
  `argon2idDeriver` refuses. hash-wasm runs synchronously (it holds the thread for its ~130 ms)
  and needs a Content-Security-Policy allowing `'wasm-unsafe-eval'`.
* *Orchestrator:* **The second_harvest stack has merged** (main is #63's merge, `0152367`, whose
  tree is byte-identical to `ea4b93d`, though the stack's commits were rebased, so `ea4b93d` is
  not on main). Hence:
  - Thread 2 rebased onto main cleanly before filing (#71).
  - **Thread 5 rebases onto #71's tip** before filing, as planned; its `ea4b93d` commits then sit
    on main through #71.
  - **Threads 1 and 4 stand on gripe_fixes PRs** (#68, #70) that are still on the old stack.
    When gripe_fixes rebases them onto main, each of our threads rebases onto the new tip of its
    base before filing (unpushed, so allowed). If its base has not moved by then, it files
    stacked on the base as it is.
  - The sprint branch itself was cut from `ea4b93d`, and is rebased onto main at wrap-up.
* *Orchestrator:* **Thread 4 (indexeddb_package), ready.** It pulled forward the TODO side quest
  "IndexedDB `versionedUpdate` truly atomic": every write verb is now one readwrite transaction,
  with four race tests that fail against the old adapter. Strike that side quest from TODO at
  wrap-up. It also splits `inspectIdb` into `inspectIdbDeviceDB` (core) and `inspectIdbVaultDB`
  (package), a public-surface break, and settles roadmap 3's "decision on `safebyok/idb`". Old
  vaults keep reading: same database, store, ckeys and channel. Expect one-line conflicts with #73
  in `.changeset/config.json` and the root README's package list. CLAUDE.md's *Layout* lists only
  the old packages here and on #73 (#74 added its own line): a sweep after they land.
