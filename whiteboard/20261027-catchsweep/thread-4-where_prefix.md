# Thread 4: where_prefix, one parse, said where (2026-10-28)

Branch `20261028-where_prefix`, PR #TBD, stacked on #311 (`20261027-proving_tidy`, on main).
Justify: green; core 3426 passed, 37 skipped; indexeddb 167 passed, 11 skipped; every package built,
size budgets kept.

* **Built**: `Validator`'s `parse` takes a `Saying`, `parse(val, { where?, advice? })`
  (`packages/safebyok/src/checks/validator.ts`). `where` goes before the failures (`In Bank.make's
  options: <failures>.`), `advice` after them (`<failures>. putBox()'s only option is sidecar.`);
  with either, the failures end in a period; with neither, the message is the failures alone, as
  before, so no other refusal's wording moves. A saying that is none refuses 'bad_option', checked
  by `SayingShape` beside `ConsistencyRefusalShape`. The framing is `framed`, called from
  `refusalOf`, where the message was already composed. The seven catch-and-rethrow sites are each
  one parse: `parseVaultBag` (bank.ts), `optionsCheck` (options.ts), `checkMakeBankOpts` and
  `checkBankVaultOpts` (vault-opts.ts), and both `parseDbName`s (core and `safebyok-indexeddb`
  `idb-opts.ts`). `isVaultError` left the four files that imported it only for those catches.
  Tests in `tests/checks/validator.test.ts` cover where, advice, both, a saying of nothing and a
  saying that is none; every test asserting a host-facing message passes unchanged. STYLE.md
  *Validation* now says a check of options names the call in the parse's saying, not in a catch.
  Changeset: `safebyok` patch.
* **Decisions taken**:
  - *The saying rides on `parse`, not on the `Validator` call and not on a sibling method.* The
    kind is per call, but the framing is per schema (`makeBankOpts` and `bankVaultOpts` share a
    call and name different places) and, for `parseDbName`, per parse: the lead-in names the
    function the host called (`browserOpts`, `idbDeviceDB`), a runtime argument. A sibling
    (`parseSaying`) would do the same with one more name to learn; the one parse, with a second
    argument, keeps "one parse" literal.
  - *Zod offers no hook.* Its error maps (`z.config`, a parse's `error`) speak per issue and its
    formatters lay issues out; nothing frames the one message. So no library path to take.
  - *`Refusing<SchemaT>` is `SchemaT & { parse(val, saying?) }`*, an overload beside Zod's
    `parse(val, ParseContext?)`, which the type keeps. `Omit<SchemaT, 'parse'>` was tried first and
    broke every place a validator is handed to a function typed on `Z.ZodType` (`vault-db.ts`).
    A Zod parse context passed at runtime now refuses 'bad_option' (it is no saying) where it was
    quietly ignored before; nothing in the repo passes one.
  - *The sentences stay at their sites*, not in `Phrases`: the thread moves no wording, and
    `safebyok-indexeddb` cannot import the core's `Phrases`. `parseVaultBag`'s long advice became
    `VaultBagAdvice`, a const beside it, so the parse is one line.
  - *`parseDbName`'s `said` parameter is `callname`*: it is the function the host called, and
    `said` now reads as the saying.
  - *The two `idb-opts.ts` stay two files.* They were never one schema: the core's judges
    `{ dbName }` strictly for `browserOpts` and `idbDeviceDB`; `safebyok-indexeddb`'s judges
    `{ dbName, logger }` (`Validators.idbOpts.extend`) and its lead-in says so. What they shared
    beyond the schema was the catch, which is gone; one line each is left, with different
    schemas, types and wording. `parseDbName` reaches no entry point (only `IdbOpts`, the type,
    through `safebyok/idb`; `idbOpts`, the schema, through `Validators`), so a re-export would
    also have widened the public surface for a one-liner.
* **Deviations**: none from the handoff. `safebyok-indexeddb` gets no changeset: its file stays,
  its message is unchanged, and the packages version in lockstep.
* **Discoveries**: `Refusing` cannot be narrowed with `Omit` while validators are passed as
  `Z.ZodType`s; an intersection overload is the shape for any further addition to `parse`.
  `parseConsistent` takes no saying; no site needs one today, and its `refusal` already carries a
  `message` for the disagreement.
* **For the Coach**: whether a host-passed Zod `ParseContext` refusing 'bad_option' (rather than
  being ignored, as before) is the behaviour wanted. My read: yes, the type never promised Zod's
  context would be honoured and the doc says only `parse` is ours; a quiet ignore hid that.
