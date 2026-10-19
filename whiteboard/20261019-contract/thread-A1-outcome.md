# Thread A1: outcome (2026-10-19)

Branch `20261019-outcome`, [PR #194](https://github.com/mrflip/safebyok/pull/194), stacked on [#193](https://github.com/mrflip/safebyok/pull/193) (`20261019-rename_pass`). Justify: green. Tests: root 265, safebyok 2183 (+35 skipped), convex 269, demo-react 199, fastkey 49, graphql 257, indexeddb 144, postgres 264, react 230, e2e 88 (96 skipped: live backends).

* **Built**:
  * `packages/safebyok/src/outcome.ts`: `Outcome<T>`, `GoodOutcome<T>`, `BadOutcome` (Contract,
    *Shapes*), `good`, `bad`, `outcomeOf(thunk)` (a thrown non-VaultError becomes
    `storage_unavailable`, the thrown value its `cause`), and `valOf` (val, or throw err).
    `outcomeOf` and the three types are exported from `safebyok`; `good`, `bad`, `valOf` are not.
  * `errors.ts`: `RefusalKind`/`RefusalKindVals` (were `VaultErrorKind*`), `RefusalFamily`/
    `RefusalFamilyVals`/`RefusalFamilyForKind` (were `VaultErrorFamily*`) with `bad_news`
    (`damaged_vault`, `damaged_wayin`, `damaged_box`, `newer_format`, `rolled_back`,
    `identity_revoked`, as the Contract's *Refusals* table has them). `VaultError` gains
    `family` (read from the table) and `meta?: RefusalMeta` (`box_stored`, `vault_props_stored`,
    `capacity`); its constructor takes `{ cause, meta }` (`VaultErrorOpts`). `Capacity` is in
    `types.ts`, shaped as the Contract's `vault.capacity`.
  * `vault-db.ts`: every public verb wraps its old body in `outcomeOf`, so the base's boundary is
    the one place an adapter's throw becomes an Outcome; `fromStorage` is gone. Covers the nine
    verbs the thread names and `listBoxRecords`. `localVaultDB` and `idbVaultDB` needed no code
    change (they implement only `do*` hooks); their doc examples and tests follow.
  * The battery expects Outcomes: `expectGood`/`expectBad`/`expectingGood(db)` in
    `tests/test-helpers/refusals.ts` (also `TH.good`, `TH.bad`), and two new lines under 5.1:
    every verb resolves a refusal as a bad Outcome, never a rejection; a good one is `{ ok, val }`.
    `racing.ts`'s `outcomeOf` is now `raceOutcomeOf`, and reads Outcomes.
  * Docs: README *Errors* split into three family tables, VAULTDB.md says verbs never reject.
* **The interim shims** (for A4 and phase C to remove), every place an Outcome is unwrapped back
  into a throw:
  1. `packages/safebyok/src/refusal-policy.ts`, `heed`'s `heeding`: the vault calls its VaultDB
     only through `heed`, so this one unwrap serves every vault.ts call site. `HeededVaultDB` is
     the unwrapped type. vault.ts itself is untouched.
  2. `packages/safebyok/src/del-damaged-vault.ts`: `valOf(await vaultDB.delDamagedVault(scope))`.
  3. `packages/safebyok-graphql/src/vault-resolvers.ts`, `served`: unwraps, then `crossing(err)`.
  4. `packages/safebyok-postgres/README.md` route recipe (and `tests/route-recipe.test.ts`): the
     POST handler reads `{ ok, val, err }`.
  5. `demos/safebyok-demo-react/src/lib/outage.ts`, `answered`: a wrapper VaultDB's hooks unwrap
     the inner VaultDB's Outcomes.
* **Decisions taken**:
  * **One shim, in `heed`, not twelve at the vault's call sites.** The preplan asked for
    `const { ok, val, err } = ...; if (! ok) { throw err }` at each call; every one of them goes
    through `RefusalPolicy.heed`, which already wraps each verb to hand refusals to the vault.
    Unwrapping there keeps vault.ts clean for A2's class move. Two-way door.
  * **`listBoxRecords` returns an Outcome too**, though the Contract's VaultDB block omits it:
    every public async verb of the base answers the same way. `subscribe` still throws its misuse
    synchronously (it returns an unsubscribe, not a promise).
  * **`isVaultCondition` is "not misuse"**: true for `condition` and `bad_news`. Its callers (the
    React provider, modal and passkey button) want "may reach the user", and so answer as before.
  * **Names**: `RefusalKind`, `RefusalKindVals`, `RefusalFamily`, `RefusalFamilyVals`,
    `RefusalFamilyForKind`, `RefusalMeta`, `VaultErrorOpts`.
  * **`meta` is an own property only when given** (`declare`d), so a refusal that learned
    nothing shows none; `family` is an own enumerable field.
  * **`box_stored` is typed `Box | null`**: there is no `Tombstone` yet.
  * **Tests**: `expectingGood(vaultDB).getBox(...)` keeps call nesting under the linter's limit
    of 3, where `expect(await expectGood(vaultDB.getBox(scopeOf(...))))` is 4. A script over the
    TypeScript checker rewrote some 1,000 call sites in every package and e2e.
* **Deviations**:
  * **Adapter packages touched.** The base's change reaches every adapter built on it, so Postgres,
    Convex and GraphQL tests (and GraphQL's resolvers, Postgres's route recipe) were changed as
    far as justify needed: unwrap and `expectBad`, no behaviour. What A1b still owns: auth
    refusals with `cause`, the wire shapes, the battery against each backend, and the e2e suites
    against live backends (they typecheck; they were not run).
  * **Two `eslint-disable-line`s** in `tests/outcome.test.ts` (`only-throw-error`,
    `prefer-promise-reject-errors`), to test a thrown string and a rejection with nothing, as
    `change-bell.test.ts` and `test-helpers.test.ts` already do.
  * **`expectRefusal` stays for throwing calls**; a VaultDB call that resolves a bad Outcome fails
    it with a pointer to `expectBad`.
* **Discoveries**:
  * **A wrapper VaultDB breaks silently.** Its `do*` hooks are typed `Promise<unknown>`, so one
    that returns another VaultDB's verb now hands up an Outcome, which the outer base reads as a
    damaged record. The demo's `OutageVaultDB` was one; the changeset warns hosts.
  * **The family table rides with every `VaultError`**: about 0.3 kB on each bundle that refuses.
    Budgets moved: `Vault` 31 to 32 kB, `argon2idWebV1Deriver` 8.2 to 8.5, `browserOpts` 19 to
    20, `mask` 8.8 to 9.1. `everything` stayed at 39 kB.
  * `e2e/tests/postgres/races.test.ts` read `reason.kind` (stale since thread 0); now reads
    `err.refusalkind`. Its helper `outcomeOf` became `settledKind`, and is unused.
* **Contract drift** (proposed text; built to the Contract as written):
  * *VaultDB* interface: add `listBoxRecords(scope)`, "every box as stored, ciphered fields left
    out, for a server to serve; resolves an Outcome like the rest".
  * *Shapes*, `outcomeOf`: "a thrown value that is not a VaultError becomes
    `storage_unavailable`, the value as its `cause`". As written it is silent on the mapping.
* **For the Coach**:
  * **`outcomeOf` and bugs**: a `TypeError` from a bug in a wrapped body reads as
    `storage_unavailable`, which says "retry". Fine for an adapter's driver; for A4's vault
    `tryX`, a bug in the vault's own code would read the same. Recommend: keep for A1; A4 decides
    whether the vault's own boundary maps a non-VaultError otherwise.
  * **`valOf` export**: a host writing a wrapper VaultDB needs it (the demo wrote its own).
    Recommend: export it with A4's `X()` forms, under the name A4 settles.
