# Thread 3: Every schema in classic Zod (2026-10-26)

Branch `20261026-zod_classic`, PR (draft, see below), stacked on
[#273](https://github.com/mrflip/safebyok/pull/273). Justify: green (core 3124 passed, 37 skipped;
every package and e2e green; size within the budgets this thread raised).

* **Built**:
  - Every `zod/mini` schema in `src/` is classic Zod made in a `Validator` call, by concern, one
    kind each: types.ts (`Whisper`/`whisperBag` 'bad_whisper', `Sidecar` 'bad_option',
    `VaultScope` 'bad_scope', `BoxSummary`, `Capacity`, the vault records call (both vault props,
    both wayin records, `WayinRecord`, `VaultProps`, `Tombstone`), `LeaseRecord`, `DeviceRecord`,
    all 'bad_record'), crypto.ts `Ciphered`, box.ts `BoxRecord` and Box.seal's inputs, lease.ts,
    vault-db.ts (expectations and `BoxDeletion`; `ListedBox`/`StoredRevision`; `StoredVaultTok`),
    vault-opts.ts (one call for the two bags, one for every other option), vault.ts, options.ts,
    key-deriver-spec.ts, passphrase-strength.ts, proving.ts, logger.ts, mask.ts, idb-opts.ts,
    local-vault-db.ts. `zod/mini` is gone from every package's `src/` and tests.
  - **Strict records**, both ways: every stored record and `Ciphered` is `.strict()`. A VaultDB
    verb refuses a record with an unknown field ('bad_record', a box 'invalid_box'); one read back
    is damage. `ListedBox` is `BoxRecord.partial({ box_key_wrapped, whisper_ciphered })`, so a
    whole record or a projected one lists, and a malformed ciphered field now lists as damaged
    (as `getBox` would refuse it).
  - Read-back helpers: vault-db.ts `checked()` calls `.parse()`, catches 'bad_record' and re-throws
    the helper's own kind (`damaged_vault`, `damaged_box`, `corrupt_record`, outgoing
    'bad_record'/'invalid_box'), the 'bad_record' as its cause. Other sites keep `safeParse` and
    their hand-written messages (each schema still made in a call).
  - `optionsCheck(fieldsOf, said, hint)` takes a builder from the kit; its refusal is the
    Validator's message, then `said`, with `meta.fieldnames`. `issuesText` and options.ts's
    `InEnglish` are gone. `checkMakeBankOpts` finds unknown keys by `Object.keys` against the
    shape and names them through `sayable` (now exported from validator.ts).
  - #273's directives: `SayableName` narrowed (snake_case or camelCase words, letters ending in up
    to three digits, 32 characters at most; split into `SnakeFieldname` and `CamelFieldname` for
    the regex-complexity rule), tested with credential-shaped keys; `abort: true` on `user_id`'s
    `min(1)`, tested; the changeset's locale sentence; Convex's doc block, the Postgres and GraphQL
    READMEs reworded. VAULTDB.md 1.3 says records are strict.
  - eslint: the core's `zod-paths` and the four packages' `zod-size` rules ban `zod/mini` (and
    `zod/v4`, `zod/v3`) in `src/`.
* **Decisions taken**:
  - Exported names stay as today (`VaultProps`, `BoxRecord`, `Whisper`, ...), value and type
    pairs: renames are threads 6 and 8. Each call is `export const { X, Y } = Validator(...)`
    with a doc block on the statement; the rich per-record doc blocks moved to the
    `export type X = Z.infer<...>` beside it.
  - `EpochMillis` stays plain Zod in types.ts beside its bounds (a primitive, like `label`), not
    added to the kit: that needs `FarPast`/`FarFuture` moved to consts.ts and a second name.
    Thread 4 can move it with the aliases.
  - Expectations, `BoxSummary`, `Capacity` and the option bags keep stripping (not stored
    records); lease.ts's `VisibleShape` is `.strip()` explicitly, as a slice of strict `BoxRecord`.
  - The record-format snapshots (types.test.ts) were rewritten without a `format` bump: the only
    change is Zod rendering `lit(null)` as `{ type: null, const: null }` where `Z.null()` was
    `{ type: null }`. No stored shape changed.
  - safebyok-indexeddb's idb-opts.ts is plain classic Zod with `safeParse`, not a Validator call:
    `Validator` is not exported from `safebyok`, and exporting it is a public-surface call.
* **Deviations**:
  - `refusing` in validator.ts (thread 2's) now wraps with `schema.clone()`, not
    `Object.create(schema)`: classic Zod binds each schema's JSON Schema processor to the instance,
    so a wrapped pipe rendered as nothing (`sidecar: {}` in the box snapshot) or threw. Tested.
  - key-deriver-spec.ts keeps its call as `const SpecChecks = /* @__PURE__ */ Validator(...)`,
    read inside `parseKeyDeriverSpec`, not destructured (see Discoveries).
  - STYLE.md on this branch still says `src/` uses `zod/mini` (lines 25, 180-191); left for #272,
    which rewrites *Validation*. The lint now contradicts it until #272 lands.
* **Discoveries**:
  - **A destructured or exported Validator call is never dropped by a bundler**, `/* @__PURE__ */`
    or not: esbuild (size-limit's bundler) keeps `export const { a } = /* @__PURE__ */ f()` and
    `f().a`, as a property read may run a getter (rollup's `propertyReadSideEffects` defaults to
    keeping them too; untested here). Only an unexported `const X = /* @__PURE__ */
    Validator(...)` read inside functions shakes. So granularity is per module: a module imported
    for one schema keeps every call in it (types.ts for `idbDeviceDB`).
  - Dropping mini saved almost nothing: mini and classic share `zod/v4/core`. `everything` 61.0 kB
    (was 61.1), `Bank` 53.7 (53.7). Raised (`--raise`, the rule's): `idbDeviceDB` 28.1 kB (26 to
    32), `browserOpts` 33.7 (32 to 37), `mask` 25.2 (9.1 to 29), `argon2idWasmDeriver` 34.7 (19 to
    38): each now carries classic Zod or more of it. `idbVaultDB`'s rule would lower 2.7 to 2.6,
    untouched by this thread, so left.
  - A union of strict objects (`VaultProps`) refuses as "Invalid input", naming no field: the
    damaged_vault cause says little for vault props. Thread 8's single record fixes it.
* **For the Coach**: the mask and fastkey size jumps; the snapshot rewrite without a bump;
  `Validator` not exported to the adapters; the clone change to thread 2's factory. Each is an
  Open Matter in the PR.
