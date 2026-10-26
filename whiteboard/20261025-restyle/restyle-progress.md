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
