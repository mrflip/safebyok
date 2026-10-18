# Thread 1: vocabulary (2026-10-18)

Branch `20261018-vocabulary`, PR [#159](https://github.com/mrflip/safebyok/pull/159), cut from `origin/main`. Justify: green (core 2118
passed, 35 skipped; every package and the demos and e2e green). Documents only.

* **Built**: `VOCABULARY.md` rewritten in the reform's cast, for the tree as it will stand at the
  sprint's end: wayin (with `wayinkind`, `wayin_id`, `wayinlabel`, `WayinSummary`), `Proof`,
  `wayinKey`, lease and `leaseKey`, ctx (`cipherCtx`, `CipherCtxPart`, `boxCtx`, `wayinCtx`,
  `leaseCtx`), sidecar, vaultProps, retire, `Vault.make` and `hello()`, the new format tags, and
  the `_id`/`_tok` rule under *Ingredients and contexts*. The one-passphrase, at-most-one-passkey
  policy is in the wayin row as intended, not landed. An *Old names* table closes the file,
  marked for deletion at 1.0.0: every row of the preplan's name map and the plan's amendments,
  one line each, plus the derived names below. `STYLE.md`: the star-import example is
  `Wayin.open(...)`, the role-named key example `leaseKey`, the stored-field example says "a
  wayin", and *Tags* gains `_id`, `_tok`, pointing at VOCABULARY.md. `CLAUDE.md`: *Conventions At
  A Glance* uses `Wayin.open(...)`. Empty changeset.
* **Decisions taken** (YOLO, derived from the map's pattern; each is a row in *Open matters*):
  * `vaultKeyWayinWrapped`, `vaultKeyLeaseWrapped`, `revisionTok`: the camelCase of the map's
    stored fields, replacing the doc-only names vaultKeyPassphraseWrapped/PasskeyWrapped,
    vaultKeyLocalWrapped and the code's `revisionId`.
  * `reentryWindowMillis` (a public field on the vault) → `leaseMillis`, beside `leaseHours`.
  * `unlockId` (the option on `unlock` and `changePassphrase`) → `wayinId`.
  * `EnvelopeHeader`, `EnvelopeStamp`, `absentUnlock` → `WayinHeader`, `WayinStamp`,
    `absentWayin`; `publicJsonOf` → `sidecarJsonOf`; `EraseDamagedVaultOpts` →
    `RetireDamagedVaultOpts`.
  * cipherAdditionalData, the doc-only name of the concept, → ctx; the section *Ingredients and
    bindings* → *Ingredients and contexts*.
  * `wayinKey` is described as a role name, not a sixth key: "five keys" stands.
  * The `_id`/`_tok` rule lives in VOCABULARY.md (STYLE.md's *Naming* did not speak of `_id`),
    with a one-line pointer in STYLE.md's *Tags*, where the preplan's *Read first* expects it.
  * *Words safebyok does not use* gains "unlock, as a noun", a rule that outlives the table.
* **Deviations**: the task named `bag` in STYLE.md "where it meant the public bag": there is no
  such use. STYLE.md's and CLAUDE.md's `bag` is the generic key-value tag, and stays.
* **Discoveries**, for the rename threads:
  * Names the map lacks that thread 7 will meet, not put in VOCABULARY.md: Postgres's
    `safebyok_bundles` table and `bundle_id` column, `BundleColumns`, `BundleFields`; GraphQL's
    `SafebyokVaultBundle`, `SafebyokBundleExpectationInput`, `SafebyokUnlockEnvelope`; Convex's
    `safebyokReadBundle`/`CreateBundle`/`UpdateBundle`, `ReadBundleDoc` and friends; core
    internals `UnreadBundle`, `bundleMeets`. Suggested: `safebyok_vaults` and the `VaultProps`
    stem for the rest.
  * A case-insensitive `\bbundle` grep hits the JS-bundle sense in `PROCESS.md` (*Size budgets*)
    and STYLE.md's "the bundler": not survivors.
  * `prior_vault_key.vault_key_wrapped` keeps its name: the map renames only the wayin's.
  * `CLAUDE.md` says VOCABULARY.md's names are what "the code already speaks": true again only once
    thread 8 lands. Until then the *Old names* table is the bridge.
* **For the Coach**: the derived names above, and whether `leaseMillis` reads right for what a
  vault reports.
