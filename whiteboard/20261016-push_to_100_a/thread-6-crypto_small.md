# Thread 6: crypto_small (2026-10-16)

Branch `20261016-crypto_small`, PR [#126](https://github.com/mrflip/safebyok/pull/126), cut from
`main` (`f63bd915`). Justify: green (core 1664 tests, fastkey 49, react 111, graphql 212, the rest
unchanged). `pnpm size`: openVault 22.75 kB against main's 23 kB limit (main's measure 21.79, so
+0.96 kB for the Argon2id schema now reached by `openVault`); every other bundle moves by under
0.2 kB. No `.size-limit.json` edit.

## Closes

| Row | Status |
|---|---|
| G024 | **closed**: `ensureSaltFits` (`key-deriver-spec.ts`), called by `deriverOf` (core: `argon2idDeriver`, `argon2idWebV1Deriver`) and `deriveWithWasm` (fastkey). `bad_option`, never quoting the salt. Exported so another implementation can. |
| G032 | **closed**: `passphraseKeyOf` (`envelope.ts`) zeroes the bytes in a `finally` after `importKey`, through the view's own buffer range. Every derivation path (sealing, each envelope tried). `notes/security.md`. |
| G034 | **closed**: `passphraseKeyOf` refuses a result over a `SharedArrayBuffer` as `bad_option`. |
| G029 | **closed**: `ensureSuppliedSpecKept` refuses any label beginning `argon2id_web_` (case-insensitive) that is not a supplied spec's, at `openVault`, `argon2idDeriver` and fastkey. |
| G030 | **closed**: the Argon2id schema moved to `key-deriver-spec.ts` with `parseKeyDeriverSpec`; `openVault` runs it for any deriver declaring `algorithm: 'argon2id'`. Cost: openVault's bundle +0.96 kB (see above). |
| G031 | **closed**: `KeyDeriver = Argon2idKeyDeriver | CustomKeyDeriver` (`key-deriver.ts`). See *Decisions*. |
| G072 | **closed**: `changePassphrase(proof, newPassphrase, { unlockId? })`. See *Decisions*. |
| G073 | **closed**: both `wrong_passphrase` messages in `openWithPassphrase` append the count of skipped other-deriver envelopes and "open the vault where it was made". |
| G075 | **closed**: seal helpers no longer return an unused `sessionKey` (`sealFirstPassphrase` keeps it for creation only; `sealPasskey` returns the bare envelope); `Envelope.absentUnlock()` is the one "no way in with that unlock_id" refusal (vault.ts's `removeUnlock` and envelope.ts's aimed open); `changePassphrase` seals the one envelope and maps the rest with no `Promise.all`; `saltLengthOf` removed for `Envelope.saltBytesOf`. The errors.ts comment was already true (askPasskey throws `absent_unlock` for "none of the method asked for"): left. |
| G515 | **closed**: `UnlockSummary` and `Envelope.summarize` carry `device_id` and `registered_at`; VOCABULARY.md, README, `notes/security.md`. |
| G374 | **closed** as ruled in the Coach's answer (a warning, not a refusal): `openVault` warns through the logger when the label begins `test_`. The testing entry keeps its label. See *Decisions* for `spyLogger`. |
| G062 | **closed by a note**: `notes/security.md` (removeUnlock and rotation stay separate verbs, as `whiteboard/20261016-rotation/rotation-design.md` has them). No code. |
| G070 | **closed by a note**: the `addPasskey` doc already said the passkey is orphaned after `stale_write`; it now also says a `lock()` during the prompt locks this device and the passkey still lands. No code. |
| G037 | **closed**: already done (two `notes/security.md` entries from 2026-10-15); nothing to add. |

## Built

* `key-deriver-spec.ts`: the spec schema, `parseKeyDeriverSpec`, `ReservedLabelPrefix`,
  `ensureSaltFits`, `TestLabelPrefix`/`TestDeriverNotice`; `ensureSuppliedSpecKept` takes any
  `{ key_deriver_label }` bag. `key-deriver.ts` keeps the type and the two derivers.
* `envelope.ts`: zeroing, SAB refusal, G073 message, G075 cleanups, `summarize`.
* `vault.ts`: `parseKeyDeriver(candidate, logger)`, `passphraseToReplace`, `changePassphrase`.
* Tests beside every bullet; the changeset (`.changeset/20261016-crypto_small.md`, minor, both
  `safebyok` and `safebyok-fastkey`) says what a host sees.

## Decisions taken

* **G031 shape**: `Argon2idKeyDeriver = KeyDeriverSpec & { key_deriver_label, salt_bytes,
  deriveKeyBytes }` (every Argon2id field required) and `CustomKeyDeriver = { key_deriver_label,
  salt_bytes, deriveKeyBytes, algorithm?: string }`. Field names are as before, so threads 5 and
  10 reading `key_deriver_label` and `algorithm` off a `KeyDeriver` still compile
  (`algorithm` is `string | undefined` on the union). `algorithm: 'argon2id'` on a custom
  deriver is refused at open unless the whole spec is there: TypeScript cannot say "any string
  but this one", so this one half is a runtime check (G030) and not a compile-time one.
* **G072**: with a passphrase proof, nothing changes (the way in it opens is replaced; `unlockId`
  aims the try). With a passkey proof, `unlockId` names *which passphrase to replace*; absent, the
  vault's only passphrase; several and absent is `bad_option` (never guess); an id that is not a
  passphrase is `absent_unlock`. The change is inside `changePassphrase`'s body only, and
  `reviseUnlocks` is untouched, so thread 3's renewal (in `takeUpUnlock`/`reviseUnlocks`) merges
  mechanically.
* **G374's warning vs the suite**: every test vault opened through `testDeriver` now logs the
  notice. `TH.spyLogger` (published in `safebyok/testing`) drops exactly that message
  (`TestDeriverNotice`), so no test's count of what a vault said moves; `vault.test.ts` tests the
  warning with a logger that keeps everything.
* **Reserved prefix is case-insensitive** (`Argon2id_Web_X` refused), since a case-sensitive
  match would leave the collision one capital away.
* **`ensureSaltFits` is exported** (`safebyok`), rather than copied into fastkey: one message for
  every Argon2id deriver, as `parseKeyDeriverSpec` already is.
* The preplan said the bytes are zeroed "after `importKey`"; they are zeroed in a `finally`, so a
  failed import leaves no copy either.

## Deviations

None from the preplan. The Coach's G374 answer is a warning where the row's text said "refuse";
built as answered.

## Discoveries

* `class X implements KeyDeriver` no longer compiles (a class cannot implement a union): a host
  writes `implements CustomKeyDeriver` or `Argon2idKeyDeriver`. One test of ours did exactly that.
* A deriver that returns a buffer it keeps (a cache) now sees it zeroed. Documented on the type,
  README and `notes/security.md`; no in-tree deriver does so.
* Any other package's tests that count a vault's logger calls through `TH.spyLogger` are
  unaffected; a hand-written logger over `testDeriver` will hear the notice once per `openVault`.
* Threads 1/3/4/5 rewrite `vault.ts` too: my hunks are `parseKeyDeriver` (and its call),
  `draftBundle`/`sealFor`/`addPasskey` call sites, `changePassphrase`, and `passphraseToReplace`
  beside `parseUnlockId`.

## For the Coach

* **G031**: the exported type is now a union (changeset says so). If you would rather keep one
  object type, the alternative is `KeyDeriverBase & { algorithm?: string }` plus an optional
  `Partial<KeyDeriverSpec>`-less bag, which loses "an Argon2id deriver carries every parameter" at
  compile time. I judged the union the better reading of "split by algorithm".
* **G072**: please confirm the passkey-plus-several-passphrases rule (`unlockId` names the
  passphrase to replace; `bad_option` rather than a guess).
* G028 (a menu of shipped KDF configurations) is not touched.
