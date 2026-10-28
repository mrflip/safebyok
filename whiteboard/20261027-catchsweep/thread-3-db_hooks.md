# Thread 3: db_hooks (2026-10-28)

Branch `20261028-db_hooks`, PR #330, stacked on #321 (cut from its tip 496e3046). Justify: green
(core 3478 tests pass, 37 skipped; graphql 344; every package lints, typechecks, builds and fits its
size budget).

* **Built**:
  - `vault-db.ts`: the `do*` hooks are adapted once, in `VaultDB`'s private **static** table
    `#hooks` (section *Constructor, logger and hooks*), each entry `adaptedHook` (a new section
    *Hook adapter*, above the class) applied to one hook and handed the instance first. A verb reads
    `await VaultDB.#hooks.doGetVault(this, asked)`. `adapterAnswer` and the module-level
    `asStorageTrouble` are gone from the file. `readStoredVault` is gone: `delDamagedVault` wraps its
    one `doGetVault` call in a `try` and turns the adapter's own `damaged_vault` into
    `unnamedVaultRecord({ cause })` there, with a running comment saying why.
  - `outcome.ts` exports **`asStorageTrouble(thrown)`**, added to `index.ts` and `index.test.ts`'s
    surface list, with tests in `outcome.test.ts`. `safebyok-graphql`'s `crossing` calls it.
  - `vault-resolvers.ts` `vaultDBOf`: `not_permitted` and `identity_revoked` from `vaultDBFor` still
    cross as they came; anything else is `Refusals.unexpectedError(err)` (was `bad_option` with
    `MisconfiguredMessage`, now deleted). `VaultResolversOpts`' doc, the graphql README and its two
    tests follow.
  - Renames: `VaultReadResponse` → **`StoredVault`** (shapes, index, vault-db, local-vault-db, the
    convex, graphql, indexeddb and postgres adapters, the postgres README and route recipe, the demo's
    `outage.ts`, the core README, STYLE.md l.94 and l.480, the core tests); `ReadAnswer` →
    `StoredVaultAnswer`; `readVault` → `gottenVault`; `checkWrittenVaultRecord`/`checkWrittenBox` →
    `checkPutVaultRecord`/`checkPutBox` (`written` → `put`); `withMissChecked`'s and
    `withStaleVaultRecordChecked`'s `writing` → `putting`; locals `read` → `answer` (one doc example's
    → `got`); the doc example `this.readVaultRows(scope)` → `getVaultRows`. `notes/security.md`'s two
    mentions amended by a `sonnet` subagent per the file's header.
  - Changeset `20261028-db_hooks.md`: `safebyok` minor (the rename, the export), `safebyok-graphql`
    patch (the kind change).
  - One new core test: a store built with `Object.create(vaultDB, { doGetVault })` is reached through
    the prototype and its throw is `storage_unavailable`.
* **Decisions taken**:
  - **`#hooks` is static, handed the instance**, not the instance field the plan sketched. An
    instance `#field` broke 12 tests: `vault-make.test.ts` asserts a host's store built as
    `Object.create(world.vaultDB)` is taken "prototype and all", `vault-boxes.test.ts` builds
    limit-overriding stores the same way, and `test-helpers.test.ts` wraps one in a Proxy; none runs
    the constructor, so the brand check fails. The static table's entries call `db.doGetVault(...)`
    on the object the verb was called on, which is what `this.doGetVault(...)` did, so overrides,
    prototype-built stores and spies set after construction all behave as before. Still adapted once,
    at class definition.
  - **`asStorageTrouble` lives in `outcome.ts`**: it is the one line `outcomeOf` applies with
    `Refusals.storageUnavailable` as `otherwise`, so the pass-a-VaultError rule has one home; it is
    used by a server package that never touches the `VaultDB` class; and `vault-db.ts` exports
    nothing but the class and its helpers for adapters.
  - **`vaultDBOf` keeps the two-kind pass-through** (`HostRefusalKinds`), reading "a VaultError from
    the host's `vaultDBFor` passes through as today" as today's pass-through. A `bad_option` from
    `postgresVaultDB({ client: null })` is a server bug too, and crossing it as `bad_option` would
    tell the browser developer their `Bank.make` options are wrong. The reviewer's test for it now
    expects `unexpected_error`, cause kept.
  - **`delDamagedVaultIn` is unchanged.** Thread 6's reviewer named a `bad_option` message there
    naming `tryDelDamagedVault`; no such message exists on the branch (the file's only mention is
    the call `vaultDB.tryDelDamagedVault(scope)`, which `bank.test.ts` and `del-damaged-vault.test.ts`
    spy on). The two texts that can disagree are the class doc ("override `delDamagedVault`") and
    `vaultDBShape`'s requirement of `tryDelDamagedVault`; both hold at once, since the `try` form
    derives from the throwing one. The class doc now says so in one clause.
  - `checkOutgoing`'s `spared: 'written' | 'removed' | 'read'` and the message strings ('a vault
    read', "Nothing was read") stay: prose a host reads, not operation names.
* **Deviations**: `.size-limit.json` untouched, though `pnpm size:budget` would raise
  `argon2idWasmDeriver` (37 → 38 kB) and lower `idbVaultDB` (2.7 → 2.6 kB): neither bundle holds
  anything this thread changed (fastkey; indexeddb's entry ignores `safebyok`), so the drift is
  the base's, for whoever moved them or the restack.
* **Discoveries**:
  - For thread 8: `VaultReadResponse`'s successor is **`StoredVault`**; `graphql-vault-db.ts`'s
    `vaultReadOf` is typed with it now, and its rename to `storedVaultOf` is clean. The postgres
    adapter and the demo already have a `storedVaultOf(): StoredVault`.
  - The `Object.create(vaultDB, {...})` host pattern is a contract (`vault-make.test.ts`), which
    rules out instance `#fields` reached from any verb; `#logger` survives only because no verb
    path reads it before a failure. Worth a line in STYLE.md's *Stateful objects* if more private
    state is ever added to `VaultDB`.
* **For the Coach**:
  - **`vaultDBOf`'s pass-through**: two kinds, as today, or every VaultError? Kept at two
    (*Decisions*); say if a host's own `storage_unavailable` or `bad_scope` from `vaultDBFor` should
    cross as itself.
