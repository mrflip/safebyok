# restyle: progress

What the threads have taught, newer than the plan wherever they disagree. Kept by the
orchestrator; workers look things up here and write their own thread files.

## The line

main → #265 → #252 → #268 → #269 → #270 → #266 → #267 (the primitives line, unmerged) → restyle
threads 2 to 13 → the sprint PR. Thread 1 (`guidance`) stands on #267 beside the line.

## Decisions so far

* *Orchestrator:* stored records parse strict both ways (the preplan's suggestion): an unknown
  field reads as damage or a newer `format`.
* *Orchestrator:* the restyle stacks on #267, not `main` (plan, *Base*).

## Discoveries

* *Orchestrator:* **STYLE.md carries the rules from #272 on** (thread 1): NEWSTYLE §1–§10 are its
  sections *Build for maintenance*, *Shapes and duck typing*, *Crossings, spreading and logging*,
  *Stateful objects and snapshots*, *Order comes from an explicit list*, *Scopepaths*,
  *Tree-shaking*, and a rewritten *Validation*. A thread cut from #267 does not hold them yet:
  it reads NEWSTYLE.md.
* *Orchestrator:* **a PR's base is `main`**, with "Stacked on #N" in its body. Workers may find
  `gh pr edit` and `gh pr ready` denied; they report it and carry on, and the Coach is asked.
* *Orchestrator:* the lint's `^_[a-zA-Z0-9]` flagged nothing in `src/` (`args: 'after-used'`
  never reported `(_, ii) =>`); write named ignores anyway.

## From thread 2 (validator, #273)

Who reads this: threads 3, 5 and 8.

* **Where things are.** `src/checks/validator.ts` (the factory), `src/checks/primitives.ts`,
  `src/checks/core-checks.ts` (star-imported as `CX`); `src/phrases.ts` and `src/consts.ts` sit at
  the top of `src/`, not in `utils/` (`src/utils.ts` already exists).
* **The kit** holds `obj arr tuple rec oneof union discrim lit lazy custom unk str num int uint bool`
  and `label applabel vaultlabel boxlabel user_id`; **no `zod` namespace** (it kept every locale:
  +49 kB). Null is `lit(null)`; `.strict()` / `.loose()` for object modes. Not in the kit:
  `Z.core` types, `Z.locales` (options.ts `InEnglish`), `Z.config`: import those as types or
  directly where needed.
* **A variation of a wrapped validator** (`pick`, `omit`, `extend`, `.strict()`, `.optional()`)
  made outside a `Validator` call is plain Zod and throws a ZodError; made inside a call it
  refuses with that call's kind. A validator nested in another refuses with the outer call's
  kind. Tested, and in the doc block.
* **Scope validators are `.readonly()`**, which has no `.extend`: a record builds from the kit's
  names, and slices its scope with `pick(...).strip()`.
* **Interim validators**: `bankApplabel` (vault-opts.ts) and `sealBoxlabel` (box.ts), one-field
  `bad_scope` validators holding the place until thread 7.
* **Two `VaultScope` types** for now: types.ts's (mutable, a Convex type test needs it) and
  `CX.VaultScope` (readonly). Thread 8 unifies them.
* **Scopepaths**: `CX.bankScopepath`, `CX.vaultScopepath`, `CX.boxScopepath` (tuples) and the
  `*ScopepathFieldnameVals`, for thread 5.
* **Names are strict at every layer**: a vault's entry, each VaultDB verb, each record read back.
  A box stored under a non-label name is no longer listed (pre-1.0, in the changeset).
* **Size**: `everything` 61.1 kB (budget 65), `Bank` 53.7 (57), `idbDeviceDB` 22.6 (26),
  `browserOpts` 28.3 (32), with both Zod flavours bundled. Thread 3 should bring these down.
* **Permissions**: workers' `gh pr edit` and `gh pr ready` are denied; a worker writes its PR
  body to its scratch directory and reports. The `--base main` at `gh pr create` works.

## From thread 3 (zod_classic, #274)

Who reads this: threads 4 and 8; any thread writing a validator.

* **Every schema is classic Zod in a `Validator` call, by concern**; `zod/mini` is banned by lint.
  Each export keeps today's name as a value and type pair (`VaultProps`, `BoxRecord`, `Whisper`,
  ...), its detailed doc block on the `export type X = Z.infer<...>` line.
* **Stored records parse strict**; a read-back helper re-throws `damaged_*` with its check's
  `bad_record` as cause.
* **`refusing` wraps a `schema.clone()`**, not `Object.create`: classic Zod ties JSON Schema
  rendering to the original object. `sayable` is exported from `src/checks/validator.ts`; it
  repeats an unknown key only when snake_case or camelCase and at most 32 characters.
* **`Validator` is not exported**: safebyok-indexeddb's `idb-opts.ts` is plain classic Zod.
* **Tree-shaking is per module, not per call**: esbuild never drops a destructured or exported
  `Validator` call, `@__PURE__` or not. An unexported `const X = /* @__PURE__ */ Validator(...)`
  read inside a function is dropped with the function (key-deriver-spec does this, keeping
  `argon2idWebV1Deriver` at 5.5 kB). Finer granularity means a module of its own.
* **For thread 4**: `EpochMillis` is still plain Zod in types.ts, outside the kit; move it with the
  aliases.
* **For thread 8**: `VaultProps` is a union of two strict objects, whose refusal names no field
  ("Invalid input"); the single record with a nullable gate fixes that.
* **GitHub push protection** refuses a test fixture shaped like a real key (`sk_live_...`): build
  such fakes at runtime (CLAUDE.md: an obvious fake that validates).
* **Size** (budgets raised): `idbDeviceDB` 28.1 kB, `browserOpts` 33.7, `mask` 25.2 (was ~6),
  `argon2idWasmDeriver` 34.7 (was ~16); `everything` 61.0 and `Bank` 53.7 barely moved (mini and
  classic share `zod/v4/core`).

## From thread 4 (brands, #275)

Who reads this: threads 5 to 13.

* **Names**: `src/types/types.ts` (moved) and `src/types/type-aliases.ts`. Plain aliases (each
  `Z.infer` of its validator, since lint refuses `type X = string`): `Applabel`, `Vaultlabel`,
  `Boxlabel`, `UserId`, `VaultTok`, `RevisionTok`, `EpochMillis`. Brands: `PassphraseSalt`,
  `PrfSalt`, `WhisperCiphered`, `BoxKeyWrapped`, `VaultKeyWayinWrapped`, `VaultKeyLeaseWrapped`,
  `PassphraseCleartext`.
* **Validators named for their field**: `vault_tok`, `revision_tok`, `salt_b64`, `prf_salt_b64`,
  `whisper_ciphered`, `box_key_wrapped`, `vault_key_wayin_wrapped`, `vault_key_lease_wrapped`,
  `passphraseCleartext`; a record writes `obj({ salt_b64, vault_tok, ... })`. `epochMillis` is in
  the kit; `FarFuture`, `FarPast`, `ForeverMillis`, `MinuteMillis` are in `consts.ts`.
* **Facets**: `Lifecycled<OT, LifecycleT = 'starting' | 'ready'>` (adds `readonly lifecycle`),
  `Refused<OT>` (`lifecycle: 'refused'`, `err: VaultError`), `ConsistencyWith<OT>` (`OT &
  Pick<Vault, 'demandConsistentWith'>`), with type tests of thread 13's bank union and a Vault as
  `ConsistencyWith<VaultScope>`.
* **For thread 10**: a brand is output-only; type what a host's adapter returns as the record's
  `Z.input` (unbranded), and let the base class's parse brand it, so no host casts.
  `DamagedVaultRecord` is left to thread 10's `VaultReadResponse`.
* **A brand is minted only by a parse**, including where safebyok mints a salt or a wrap; the
  passphrase is branded at `PassphraseProving.seal` and `passphraseKeyOf`, not the gating.
  Tests plant damage `as never`; `TH.fakeCiphered` returns `FakeCiphered` (all four ciphered
  brands, one cast inside).
* **`gh pr ready` went through** for this thread; the refusal is not constant.

## From thread 5 (scopepath, #276)

Who reads this: threads 6, 8, 10 and 13.

* **`Scopepath`** (`src/scopepath.ts`, a namespace export): makers `bank`, `vault`, `lease`,
  `device`, `box` (each checks the whole scope, refuses `bad_scope`); inverses `bankScope`,
  `vaultScope`, `boxscope`; kind tests `isLease`, `isDevice`, `isBox` (full `safeParse`s);
  `withinVaultScopepathPrefix`, `withinVaultScopepathPred`, `Delimiter`; types are
  `Z.input<typeof CX.*Scopepath>`. `CX.leaseScopepath` and `CX.deviceScopepath` are new.
* **A listing** goes `withinVaultScopepathPred` → `Scopepath.isBox` → `boxscope`: a malformed row
  under a vault's prefix is skipped, still counted by `getCapacity`, still erased by `delVault`.
* **bank.ts** keys its entries `Map<Scopepath.VaultScopepath, ...>` already (thread 13).
* **The IndexedDB adapter's** `src/ckeys.ts` is `src/box-range.ts`. `IdbRow.ckey` and
  `StringStore.ckeys()` keep `ckey` in its generic sense (thread 6 may rename `IdbRow.ckey`).
* Every read-back site refuses a misnamed record as its own kind, pinned by a test (the Coach's
  TODO entry, settled); a lease stays `corrupt_record`.
* `gh pr create` and `gh pr ready` both went through for this thread.

## From thread 6 (names, #277)

Who reads this: threads 7, 9, 11 and 12.

* **Renamed**: `user_id` everywhere (a draft naming `userId` refuses `bad_option` naming
  `user_id`); `PasskeyAnswer` is `{ credential_id, prf_salt_b64, prfBytes }`; `ask_passphrase_at`
  on the snapshot and the Vault object's getter (thread 11 decides the getter); resolved limits
  `maxWhisperBytes`, `maxBoxes`, `maxVaultBytes` (`VaultParts` has the last two, `ParsedBankOpts`
  the first).
* **Wire arguments are flat**: Convex's component and host wrapper, GraphQL's root fields and
  client take `applabel`, `user_id`, `vaultlabel` as their own arguments; `SafebyokVaultScopeInput`
  is gone. Seven Convex functions `mustBe(ctx, args.user_id)` and pass the same `args` on;
  `ensureVault` and `putVaultProps` check the record's own `user_id` (they carry records). The
  Postgres route recipe keeps positional `args: [scope, ...]`.
* **For thread 7**: the bank's calls take `user_id` and `BankProvider`'s prop is `user_id`;
  `Bank.make`'s doc block still says it refuses `user_id`, which the draft takes: thread 7 moves it.
* **For thread 9**: the "stamp" wording was deferred to it (today's `Stamp` type holds the epochs).
* **A blanket rename can collapse a comparison** (`user_id !== user_id` happened once;
  `noUnusedLocals` caught it): grep for tautologies after any sweep.

## From thread 7 (bank_per_user, #278)

Who reads this: threads 8, 11 and 13.

* **`Bank.make({ applabel, user_id, ... })`**, its scope read by `CX.bankScope` (thread 2's
  interim `bankApplabel` is gone); `bank.user_id`, `bank.scope` and the public
  `bank.demandConsistentWith(thing)` are new.
* **Bag-taking calls**: `ensureVault`, `reopenVault`, `clearCachedVault`, `delDamagedVault` (and
  their `try` forms) take `(bag, opts?: BankVaultOpts)`; `closeVault` and `entryOf` take `(bag)`.
  `vaultlabel` required; a bag's `applabel`/`user_id` must be the bank's (`bad_scope`); the rest is
  dropped; a store in the first bag refuses `bad_option`. `VaultChoice` gone, `VaultDraft` is
  `BankVaultOpts`.
* **Load**: `KeyDeriver` has an optional `load` (`loadKeyDeriver` in key-deriver-spec.ts); each
  `hello()` runs both loads side by side. One `LibsLoad` value holds the bank's status and its
  `err`; `#initialize()` returns an `Outcome` and alone moves and publishes the status (the
  Coach's FIXMEs). Status values unchanged: `made | starting | timely | refused`; thread 13 maps
  `#libs.status` onto `Lifecycled | Refused`.
* **React**: `BankProvider` makes a new bank when `user_id` changes; `useBank()` is null while no
  one is signed in.
* **For thread 8**: `draftOf` in bank.ts still spreads the parsed scope into the record (Phase 9).
  `sealBoxlabel` in box.ts stays (no bag reaches `Box.seal`).

## From thread 8 (vault_record, #279)

Who reads this: threads 9 to 13.

* **`src/vault-record.ts`** holds `VaultRecord`, `GateRecord`, the wayin records, `VaultSparse`,
  `VaultStamp`, `VaultTombstone`, `GateSparse`, `PassphraseWayinSparse`/`PasskeyWayinSparse`,
  `VaultFormat`, `TombstoneFormat` and `isGated`. `BoxStamp` is in box.ts; `LeaseStamp` and
  `LeaseSparse` in lease.ts. `deviceRecordOf` (new export) builds every device record from a
  parsed scope; `draftOf` likewise. **Phase 9 is done.**
* **`VaultRecord` carries a `.refine`** (`gate_epoch` 0 ⇔ `gate` null), and Zod 4.6.7 refuses to
  `pick`/`omit` a refined object: **slice from `VaultSparse`**, not the record.
* **Every ctx is unchanged**; the format stays `safebyok-vault-v6` (the Coach's no-format-bumps
  ruling); an old flat record reads as damaged. Snapshots render each record as output and as
  `io: 'input'`.
* `vault.stamp` returns the full `VaultSparse` (thread 11: rename or drop it, beside `VaultStamp`).
* `Lease implements Omit<LeaseSparse, 'format'>`: its tests keep the format private (thread 11).
* `demandConsistentWith`'s parameter `Partial<VaultSparse>` would refuse a thing carrying its own
  `format`: thread 11 makes it `Partial<Omit<VaultSparse, 'format'>>`.
* **Still named "props"** (thread 10 renames): `StoredVault`/`ListedVault`'s `vaultProps`,
  `putVaultProps`, `vault_props_stored`, `staleVaultProps`, `Expectations.vaultProps*`, the Convex
  and GraphQL `vaultProps` argument; and ~33 lines of "vault props" prose in VAULTDB.md, READMEs,
  test titles.
* Postgres keeps its two wayin jsonb columns and nests them on read. Convex hosts clear the
  component's tables before deploying (changeset, README).
* VOCABULARY's "vault props" retirement is on this branch's text; at the restack, apply it to
  #272's VOCABULARY.

## From thread 9 (cipher_ctx, #280)

Who reads this: threads 10 to 13; the restack.

* **`cipherCtx(stamp, purpose, ...header)`** (crypto.ts): stamp is one record or a list; bytes are
  `stableJsonify([...stamps, purpose, ...header])`. Wayins bind `VaultStamp` (`registered_at`
  now among it); a box binds `VaultStampButFormat` + `BoxStamp` (sidecar as its sorted JSON
  string); a lease binds `VaultStampButFormat` + `LeaseStamp`. `boxCtxOf`, `leaseCtxOf`,
  `VaultStampButFormat` in lease.ts. Nothing sealed before opens (no new damage beyond thread 8's).
* **Public signatures**: `Wayin.make(vault, vaultStamp, record)` and the wayin constructors take a
  stamp (a whole record passes); `WayinVault` is `keyDeriver | now`; `GateVault` names its scope;
  `LeaseVault` adds `vault_tok`, `registered_at`; `Gate.of` takes a record carrying its stamp.
  Provings keep a private `#vaultStamp`. Test helpers' `VaultSlice` gains `registered_at`.
* **For thread 11**: "stamp" in its old sense (scope, `vault_tok`, epochs a thing was made under)
  remains in Box's getter doc blocks, `vault.stamp`, provings' `stamp` parameter, `StampedShape`,
  `checkedStamp`; VOCABULARY calls that set "made under". Rename them as Box and Vault reshape.
* **For the restack**: VOCABULARY's ctx, stamp, visible, unencrypted, sidecar, revisionTok,
  whisper codec and format rows are on this branch's text; apply them to #272's VOCABULARY.

## From thread 10 (reads, #281)

Who reads this: threads 11 to 13.

* **Reads**: an adapter's half answers `{ vault, boxes, damagedBoxes }` via the exported
  `splitStoredBoxes`; the base class re-checks the split (a server's too). `getVault`,
  `ensureVault`, `getVaultRecords`, `ensureVaultRecords` resolve `VaultRecord & { boxes,
  damagedBoxes }`, frozen. `BirthRead.listed` is `BirthRead.listing`. Convex's component answers
  rows; its client splits.
* **Renamed**: `putVaultRecord` (`doPutVaultRecord`), `meta.vault_stored`, `staleVaultRecord`,
  `Expectations.vaultRecord*`. "Vault props" is gone from docs and test titles.
* **For thread 11**: `BoxView` remains as a `Pick` of `BoxSparse`, for `class Box implements
  Boxscope, BoxSparse`; `boxSparseOf(record)` in box.ts gives a frozen sparse box; a new
  `vault.damagedBoxes` getter sits beside the per-field getters thread 11 removes.
* **For thread 12**: the vault keeps `#boxes` and `#damagedBoxes` as frozen arrays replaced only
  when a box changes, and the snapshot hands them out as they are: half the slices work is done.
* Test helpers: `TH.recordOfRead`, `TH.damagedBoxesOf`; `TH.summaryOf` is gone.
* **The demo typechecks against the built `dist`**: a stale build hides breaks there until
  `pnpm justify` builds.

## From thread 11 (vault_object, #282)

Who reads this: threads 12 and 13; the restack.

* **The Vault object** is its own stamp, frozen; everything that changes is read through
  `vault.snapshot`. Gone: the per-field getters, `vault.stamp`, `keyDeriver`, `leaseMillis`,
  `now()`. `getSnapshot`/`subscribe` are prototype getters on Vault and Bank (`Bank` is not
  frozen and has no own stamp fields).
* **The snapshot is unchanged** (still `registered_at`, `gate_epoch`, `passphrase`, `passkey`,
  `state`): thread 12 reshapes it. Readers in tests, React and GraphQL now read
  `vault.snapshot.<field>`, `vault.snapshot.gate_epoch` among them: thread 12 moves them. Tests
  needing the vault's epochs use `TH.madeUnderOf(vault)` (through `vaultRecordHeldBy`, a
  test-only accessor in src/proving.ts, exported by no entry).
* **`gating.leaseMillis`** on every `Gating` replaces `vault.leaseMillis` (React's dialogs).
  Provings get their key deriver, logger, lease length, clock and vault record through
  `ProvingInside`, registered when the vault is made.
* **Types**: `demandConsistentWith` takes `VaultMadeUnder`; `GatedVaultRecord` and `VaultDraft`
  are exported, `VaultDraft` what `ensureVault`/`ensureVaultRecords`/`doEnsureVault` take.
  `Lease.format` is public. Box and Lease have no `toJSON`; their JSON is their own fields.
* **Lint vs NEWSTYLE**: `sonarjs/redundant-type-aliases` refuses `LeaseSparse = LeaseStamp`;
  `no-misused-spread` refuses `{ ...vault }` (tests use `TH.shownOf(vault)`). At the restack,
  NEWSTYLE's examples in #272's STYLE.md follow the lint. STYLE.md line 87 still cites
  `vault.passphrase`/`vault.passkey`.
