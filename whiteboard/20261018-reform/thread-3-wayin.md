# Thread 3: the envelope becomes the wayin (2026-10-18)

Branch `20261018-wayin`, PR [#161](https://github.com/mrflip/safebyok/pull/161), stacked on
[#160](https://github.com/mrflip/safebyok/pull/160) (line main → #159 → #160 → #161).
Justify: green (core 2106 passed / 35 skipped; react 218; convex 258 / 8; graphql 239 / 14; postgres 246 / 14; indexeddb 135 / 10; fastkey 49; scripts 258; demo 190 / 16; e2e 81 / 89 skipped).

* **Built**: the unlock envelope is the wayin, repo-wide, per VOCABULARY.md's *Old names*.
  - Core: `src/envelope.ts` → `src/wayin.ts` (`git mv`, and its test), star-imported as `Wayin`.
    `Wayin`/`PassphraseWayin`/`PasskeyWayin`, `WayinSummary`, `WayinKind(Vals)`, `Proof`,
    `WayinHeader`, `WayinStamp`, `absentWayin`, `retireWayin`, the `wayinId` option. Stored:
    `wayinkind`, `wayin_id`, `wayinlabel`, `vault_key_wayin_wrapped`, the bundle's `wayins`,
    format `safebyok-vault-v3` (`prior_vault_key.vault_key_wrapped` unchanged). Refusal kinds
    `absent_wayin`, `damaged_wayin`, `last_wayin`, `too_many_wayins`, their messages, the
    README table. The key that wraps or unwraps the vaultKey is `wayinKey` in `wayin.ts`;
    `passphraseKeyOf`/`passkeyKeyOf` keep their names. `OlderBundleFormats` gains
    `safebyok-vault-v2`, and a new test shows a v2-tagged vault reads as `damaged_bundle`, never
    `newer_format`, and is cleared by `eraseDamagedVault`. Tests that used `-v3` as "a format
    from the future" now use `-v4`.
  - Adapters: Postgres column `unlocks` → `wayins` (both SQL copies); GraphQL
    `SafebyokUnlockEnvelope` → `SafebyokWayin`, field `wayins`; Convex component validators;
    indexeddb README. React: `askPasskey(wayins)`, the passkey button, `VaultProvider`'s
    `wayinlabel` check. Demo `WaysIn`. `notes/security.md`: a new entry (via a `sonnet`
    subagent). `.changeset/20261018-wayin.md`, minor, five packages.
* **Decisions taken** (YOLO, in *Open Matters*):
  - The ctx bytes follow the renamed fields and the v3 tag (orchestrator's ruling A): the
    construction is unchanged, no v2 record is read. Purpose strings
    `vault_key_passphrase_wrapped`/`vault_key_passkey_wrapped` keep their spelling.
  - Derived names: the public `validators.wayinlabel` check and `{ wayinlabel }` option of
    `addPassphrase`/`addPasskey` (were `unlocklabel`); internals `FirstWayinlabel`,
    `PurposeForWayinkind`, `parseWayinId`, `parseWayinlabel`, `wayinIdShape`, `reviseWayins`,
    `ensureRoomForWayin`, `wayinSummaries`, `wayinList`; test helpers `TH.wayinOf`,
    `TH.passkeyWayinOf`; fake ids `wayin-<label>`; Postgres column `wayins`.
  - `vault.ts` and `wayin.test.ts` import the `Wayin` module and need the type too, which would
    collide: they name the list's type as `VaultBundle['wayins']` instead (thread 7 makes it
    `VaultProps['wayins']`).
* **Discoveries**:
  - The device-unlock noun ("remembered unlocks", `device-db.ts`'s `unlocks` map, a TH battery
    title) also matches `\bunlocks\b`: left for thread 6, which renames it to the lease.
  - The lockbox ctx (`boxBinding`: `LockboxFormat` plus the whole header, so `public_json`,
    `revision_id`) and the lease ctx (`'safebyok-unlock-v1'`, purpose
    `'vault_key_local_wrapped'`) are built the same way: the same ruling applies in threads 5-7.
  - The Postgres DDL creates only what is missing, so an existing database must
    `ALTER TABLE safebyok_bundles RENAME COLUMN unlocks TO wayins`; the changeset says so.
* **For the Coach**: `notes/security.md`'s header forbids editing existing entries, so its older entries still say envelope, `unlock_id`, `removeUnlock` and the rest (they are the only names this thread retired that survive outside VOCABULARY.md's *Old names*). Ruling wanted: allow mechanical renames there (thread 10), or leave history as written.
