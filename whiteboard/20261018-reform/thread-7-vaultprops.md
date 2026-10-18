# Thread 7: vaultprops (2026-10-18)

Branch `20261018-vaultprops`, PR #TBD, stacked on #164 (line main → #159 → #160 → #161 → #162 →
#163 → #164). Justify: green -- core 2117 passed | 35 skipped; react 218; indexeddb 135 | 10;
convex 258 | 8; postgres 246 | 14; graphql 239 | 14; fastkey 49; demo 190 | 16; e2e 81 | 89;
root scripts 258.

* **Built**: the bundle is the vault's props and erase is retire, repo-wide, in one `crypto:`
  commit (plus a `docs:` commit for the security note and VOCABULARY rows). Core: `VaultProps`,
  `VaultIdentity`, `VaultPropsExpectation`, `RetireExpectation`, `RetireDamagedVaultOpts`,
  `damaged_vault`; VaultDB `readVaultProps`/`fetchOrCreateVaultProps`/`updateVaultProps`/
  `retireBox`/`retireVault`/`retireDamagedVault` and their `do*` halves; the vault's
  `storeBox`/`readBox`/`useBox`/`retireBox`/`retire` (the logger's `story.call` names follow);
  `revision_tok`/`revisionTok` everywhere; internals `UnreadVaultProps`, `vaultPropsMeets`,
  `OlderVaultPropsFormats`, `refuseStaleStoreBox`; `VaultProps['wayins']` in `vault.ts`. All four
  adapters, react, demos, e2e, READMEs, `VAULTDB.md` (lines 3.2, 3.4, 3.5 retitled, with
  `TH.VaultDBContract`), the changeset (`minor`, six packages) with the Postgres `ALTER` lines and
  the Convex clear-tables line.
* **Decisions taken** (derived names, YOLO):
  * `Ckeys.bundle` → `Ckeys.vaultProps` (stored ckey `vault^…` unchanged); `TH.bundleOf` /
    `rotatedBundleOf` → `TH.vaultPropsOf` / `rotatedVaultPropsOf`; `Refusals.staleWrite` kinds
    `'bundle'`/`'erase'` → `'vaultProps'`/`'retire'`. Public, so in VOCABULARY's *Old names*.
  * Postgres: `safebyok_vaults`, trigger `safebyok_vaults_changed`, `VaultPropsColumns`. There
    was no Postgres `bundle_id`: the lockbox row already names its vault by `vault_id`.
  * Convex: `bundle_id` was the tally's reference to the vault row's Convex `_id`, not the
    vault's `vault_id`, so `vault_id` could not serve: it is `vault_row_id`, index
    `by_vault_row`. Functions `getVaultProps` (the query was `getBundle`, kept beside `getBox`),
    `fetchOrCreateVaultProps`, `updateVaultProps`, `retireBox`, `retireVault`, their `bundle`
    argument `vaultProps`; `*VaultPropsDoc` and `safebyok*VaultProps` are GraphQL's (the handoff
    placed them in Convex).
  * GraphQL: `SafebyokVaultProps(Input)`, `SafebyokVaultPropsExpectationInput`,
    `SafebyokRetireExpectationInput`, operations `safebyokReadVaultProps`,
    `safebyokFetchOrCreateVaultProps`, `safebyokUpdateVaultProps`, `safebyokRetireBox`,
    `safebyokRetireVault`, argument `vaultProps`.
  * Prose: "vault props" is plural ("the vault props are"); a storage row is "the vault row".
    "A retirement" for the act. Refusal messages that told the user to erase now say retire
    (`vault_full`, `damaged_lockbox`, `bad_whisper`, `last_wayin`, stale writes).
  * `fetchOrCreateVaultProps`'s doc block says it returns the standing props, untouched and with
    their own `vault_id`, when the vault already existed, and that a caller tells by comparing
    `vault_id` (for thread 9's `created_elsewhere`).
* **Deviations**:
  * End-user UI copy keeps "Erase": react's `startOverQuestion`/`startOverConfirm` ("Erase and
    start over"), the demo's confirm and button, and the README sample `confirm()`. Retire is a
    developer's word; a person clicking a button reads "erase". Flagged for the Coach.
  * `ctx-bytes.test.ts`'s first test (how `cipherCtx` encodes an arbitrary record) keeps
    `revision_id` and `safebyok-lockbox-v4` as inputs: it is not the lockbox's ctx, and the
    handoff allowed the lockbox literals only. A grep survivor.
* **Discoveries**:
  * Only the lockbox ctx binds a renamed field; the wayin ctx (scope, `vault_id`,
    `registered_at`, its own header) and the lease ctx bind none, so their bytes stand.
  * A Postgres host must also rename the trigger: `CREATE OR REPLACE TRIGGER
    safebyok_vaults_changed` on a renamed table would otherwise sit beside the old
    `safebyok_bundles_changed` and notify twice. The changeset says so.
  * Build-sense "bundle" survives (`bundleOf` in `index.test.ts`/`browser.test.ts` measures a JS
    bundle; a script renamed it and it was put back).
* **Retirement grep** (handoff's patterns): survivors are VOCABULARY's *Old names*, old
  `notes/security.md` entries, `ctx-bytes.test.ts` lines 32-33 (above), a StringStore's
  `.erase(` (core, demo), Convex's `app.use(`, and "bundle" in its build sense (bundler, tsdown,
  eslint configs, `bundleOf` measuring a JS bundle, notes/ci.md, STYLE.md). No `.store(`/`.read(`
  on a vault remains.
