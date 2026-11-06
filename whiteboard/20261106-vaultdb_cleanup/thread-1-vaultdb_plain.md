# Thread 1: vaultdb_plain (2026-11-06)

Branch `20261106-vaultdb_plain`, PR #TBD, off `main`. Justify: green (safebyok 2191 tests, 0 lint errors).

* **Built**: `src/storage/vault-db-new.ts` rewritten. Each verb is one method: `req_params`, then a
  method-wide `try { ... } catch (err) { throw refusalOf(err, '<verb>', req_params) }` around lines
  that read top to bottom. A found row is parsed once by the new `SX.foundVaultRow` / `SX.foundBoxRow`
  (`shapes-storage.ts`, *Rows found*: `damaged_row` on failure, null for none), then branched null,
  tombstone, live. `memory-vault-db.ts` takes `PutOptsGiven` / `DelOpts`; `isPutAllowed` reads
  `(ifPresent === 'repl')` / `(ifAbsent === 'add')`; the del cascade is `#tombstoneBoxesOf`. Tests
  reach rows only through `_cheat_rowsOf(vaultDB).vaultrows()` / `.boxrows(tok?, scope?)` in
  `tests/test-helpers/storage-world.ts`.

## The Coach's critique, item by item

- [x] **`#call` trades 2 lines for 7** -- gone. Every verb holds its own `try/catch`; `refusalOf`
  (one line of meta) is the only shared step.
- [x] **`preparedOf` wipes out debugging** -- gone. Each verb parses its record with the plain
  checker (`SX.vaultRecord.parse` ...), which refuses `bad_option` naming the field.
- [x] **`adapted`** -- gone with `#call`.
- [x] **delVault inlines what typed functions should say** -- `delVault` dispatches to
  `#answerDelVaultVoid` / `#answerDelVaultGone` / `#answerDelVaultRecord` (`never`); `delBox` got
  the same three, for symmetry.
- [x] **checkedVaultLife's `stored?.vault_tok !== vault_tok`** -- gone. `liveVaultOf(raw, asked)`
  parses with `foundVaultRow`, branches `null` first, then `am`, then the tok. No `?.` remains in
  the file (delVault's void case is two plain lines rather than one optional chain).
- [x] **movegate takes a closure** -- gone. A gate verb reads `asked = SX.xParams.parse(params)`,
  `stored = await this.#gateRowOf(asked)`, `record = movedGateOf(stored, wayin)`,
  `await this.#putMovedGate(record, stored)`.
- [x] **`vaultRowOf(ante); if (stored?.am === 'a')`: a null branch and a parse into another error** --
  the `foundVaultRow` / `foundBoxRow` checkers refuse `damaged_row` directly; the null branch
  comes first, so no `?.` paranoia.
- [x] **putTermsOf** -- gone with `PutTerms`. Adapters read `PutOpts` as everywhere else; no
  `mayReplaceLive` helper was needed: `isPutAllowed` is one expression.
- [x] **Review against notes/gallant** -- doc blocks are one line of purpose; no SLOPDOC in either file.

## Decisions taken

* **Single-row reads drop `newer_format`**: a later `fmt` on `getVault`, `getBox`, a put's `ante`
  or a del's `ante` is `damaged_row`, its `meta.fieldnames` naming `fmt`. One checker, one kind;
  `newer_format` is left to `unknownKeyDeriver`. Listings still mark it `format_mismatch`.
* **Records handed in refuse `bad_option`**, not `unexpected_error`: they are the caller's.
* **Gate params are strict** (`shapes-storage.ts`): touching the other wayin is `bad_option` at
  parse; `gate_issue` is left to a `registered_at` that disagrees.
* **`meta` leaves the answers.** No `src/models` caller read `answer.meta.call`; the verb's name
  stays on `err.meta.call`.
* **`storageError` is removed**, with `recordPreparedWrong`, `damagedRecord`, `newerFormat` and
  their phrases. A foreign throw becomes `storage_unavailable` via `storageTroubleOf`.
* **`#putMovedGate` puts with `ifAbsent: 'fail'`** (was 'add'), and maps a miss through
  `liveVaultOf`: `vault_empty`, `vault_gone`, `vault_mismatch`, or `stale_write`.
* **putVault's last line is plain `camped`**: its `ifPresent` is 'fail' | 'get', so over a live row
  'get' declines and anything else is camped.
* **Puts dispatch inline** (a ternary per row kind); a named answer per case read worse there than
  in the dels, where each answer is a whole return.

## Kept, though src/models does not call them

* **The put acts** (`born`/`reborn`/`replaced`/`declined`): models read only `ok`/`val`/`act === 'void'`,
  but the acts cost one helper (`landingActOf`) and make a test or a debug log say what happened.
* **`tidyGone`**: no models caller; a host GC verb, not clearly dead. Worth a ruling.
* **`watch`**: models call it.

## Deviations

* **The method-wide catch is wider than the old one**: a non-VaultError thrown anywhere in a verb
  (a bug in our own lines, not only the store call) reads as `storage_unavailable`. That is what
  the Coach's "method-wide try/catch" asks; noted so a reviewer sees it.
* **describeVaultDB was not consulted** (Coach directive): verbs, answers and `do*` were judged by
  `src/models` callers and readability.

## Discoveries

* `vitest/valid-title` warns on a title quoting a kind in quotes ('damaged_row'); the three
  titles this thread touched were reworded.
* A strict object's unrecognized key gives `meta.fieldnames` of `[]` (Zod puts the key in the
  issue, not its path).

## For thread 2 (the battery)

* Adapters throw `storageUnavailable`; the plan's `storageError` export no longer exists.
* The `do*` contract: `doPutVault(record, PutOptsGiven)`, `doPutBox(record, PutOptsGiven)`,
  `doDelVault(tombstone, DelOpts)`, `doDelBox(tombstone, DelOpts)`, each one atomic step answering
  a `Landing` (`BoxLanding` with the vault row read in the same step).
* Tests call only public verbs; rows go through `_cheat_rowsOf` alone.

## For the Coach

* **newer_format on single reads**: dropped for `damaged_row` + `fieldnames: ['fmt']`. Recommend keep.
* **tidyGone**: kept with no models caller. Recommend keep until a host GC story is written.
* **Wider catch**: foreign throws anywhere in a verb read `storage_unavailable`. Recommend keep.
* **Suppressions**: none added; the two `_cheat_` methods keep their existing
  `eslint-disable-line unicorn/prefer-private-class-fields`.
