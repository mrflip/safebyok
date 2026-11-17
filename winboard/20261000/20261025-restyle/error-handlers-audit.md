# Error handlers in the restyle line: an audit

*Orchestrator, 2026-10-26.* The Coach's note in the sprint doc asked whether the restyle put
"contraptions inside error handlers" to recover the old validators' granular reporting, and
held that a catch-and-rethrow block should only align the refusal kind and attach context, and
must not throw. A `sonnet` subagent read `origin/20261026-snapshot` (#283) against its base
(`origin/20261024-contract_tab`, #267). Its report follows as given; paths are under
`packages/safebyok/src/` on that ref. Thread 14 acts on it.

## Verdict

The Coach is mostly wrong about the catch blocks, and right about one cluster of "key-sifting"
code. No handler can throw beyond its deliberate rethrow.

The restyle also removed more than it added: the old handlers (`names.ts`'s `OurChecks` /
`issues[0].message`, `validators.ts`, `issuesText` in `options.ts`) are gone. The base already
repeated every unknown key through Zod's "Unrecognized key" text; the new code restricts that
echo, and that is where the complexity came from.

## Counts

* **Catch blocks, 6 added.** Five only align: `loadKeyDeriver` (key-deriver-spec.ts:84, cause
  attached), `damagedWayinUnless` (wayin.ts:190-197, cause), `checked` (vault-db.ts:945-952,
  cause), `checkMakeBankOpts` (vault-opts.ts:191-196) and `checkBankVaultOpts`
  (vault-opts.ts:203-209), the last two prefixing the message and copying `meta`. One does a
  little more: `optionsCheck` (options.ts:23-31) adds a hint chosen by `isPlainBag(candidate)`.
  Every catch rethrows what it does not recognise unchanged.
* **Failed `safeParse` branches, about 20.** Nearly all give a fixed sentence and a kind and look
  at nothing (box.ts:371-433, lease.ts:316-328, vault-opts.ts:302-440, proving.ts:439,
  mask.ts:38). One reads the issue: `parseKeyDeriverSpec` (key-deriver-spec.ts:156-167),
  unchanged from the base.
* **Issue readers, in checks/validator.ts.** `refusing` (98-106) only aligns; `refusalOf`,
  `sentenceOf`, `fieldnameOf`, `sayable` and `isSayable` (123-157) read the issues.
* **Sifting outside any handler:** `checkMakeBankOpts`'s pre-scan (vault-opts.ts:181-190),
  `checkNoStoresIn` (bank.ts:608-613, new), `mayBeNewer` / `mayBeNewerBox` (vault-db.ts:794,
  1005).
* **Can throw: none.** `refusalOf` only slices and maps `issue.path`, `issue.keys` and
  `issue.message`; `sayable` type-guards symbols; both regexes run after a 32-character cap.
  Zod's English locale names only a type, never a value. The nearest case is `isPlainBag`, which
  could throw only on a revoked Proxy.

## The cases that do more than align

1. **The key-echo gate** (validator.ts:114-137, about 12 lines, used at 140, 145, bank.ts:612,
   vault-opts.ts:186): a length cap and two regexes decide which unknown key names to repeat. It
   is the only code that exists to prevent an echo, and it leaks anyway: a lowercase key of 32
   characters or fewer (`hunter2`) passes, and since it also applies to whisper and sidecar
   records, the public `Whisper.parse` repeats their key names. Cut to nothing, a refusal says
   "N unknown fields" and the user loses the misspelt name.
2. **`refusalOf` / `sentenceOf`** (validator.ts:143-157, about 13 lines): caps at 8 issues and
   builds `meta.fieldnames`. Can be one line: join the first issues' messages.
3. **`checkMakeBankOpts`'s pre-scan** (about 10 lines and the `RenamedMakeBankOpts` map):
   re-implements `.strict()` to add "called X now" and "hand it to ensureVault" hints, which is
   migration help; before 1.0 it can go.
4. **`checkNoStoresIn`** (6 lines): a real bug-catcher (a store in the wrong bag would silently
   use the bank's stores), not in a handler. Keep it, naming no key.
5. **`parseKeyDeriverSpec`** (6 lines and the `SpecLimitForField` table): reads
   `issues[0].path[0]` to pick a sentence. Can be one fixed sentence; the user loses which field.
6. **`optionsCheck`'s hint** (1 line): can go.

## The Coach's three questions

1. **Is someone sifting the keys?** Yes: `checkMakeBankOpts` filters every key before Zod runs,
   and `sentenceOf` maps an `unrecognized_keys` issue's keys through `sayable`. Two regexes, a
   length cap, about 25 lines in all; over-engineered, since the base repeated everything.
   Remove it and repeat no key names; list the allowed names, as the `takes` list already does.
2. **`Wayin.make`'s re-throw.** `damagedWayinUnless` (wayin.ts:190) only aligns: one
   `isVaultError(err, 'bad_record')` test, then a wrapper with `cause`. The test keeps a foreign
   throw from being relabelled; one line, keep it.
3. **Fine-grained decisions on broken data.** Mostly already gone: the fixed fields are literals
   in the schema, so Zod's text speaks and our code decides nothing per field. What remains is
   `mayBeNewer` / `mayBeNewerBox`, which read `format` before the parse to choose `newer_format`
   over `damaged_vault`: a contract the Coach has already accepted (#281), not a handler.

## Rebuttal

The catch blocks align: kind, cause, a message prefix, `meta` copied. They hold no sifting. The
fixed-sentence `safeParse` branches are the Coach's own model. The offender is the "say it only
if it looks like ours" machinery and the pre-parse key scan, neither a catch block.

## Recommended for thread 14

1. Delete `isSayable`, both regexes and `MaxSayableChars`; `sayable` gives an index as text and
   `UnsaidName` for any string key; `unknownFields` lists a count, or the schema's allowed names.
2. `refusalOf`: slice 8, join `issue.message`, `meta.fieldnames` from numeric and fixed paths only.
3. Delete `checkMakeBankOpts`'s pre-scan and `RenamedMakeBankOpts`; let `.strict()` speak and
   append the `takes` list.
4. `checkNoStoresIn` names no key ("a store field").
5. `parseKeyDeriverSpec` gives one fixed sentence; drop `SpecLimitForField`.
6. Leave the six catch blocks. Add a test that no validator message holds a value from the input.
