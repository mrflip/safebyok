# Thread 22: validator names (2026-10-28)

Branch `20261028-validator_names`, PR #322, stacked on #319 (its base stays main). Justify: green
at the tip (core 3448 passed, every package and e2e green). Re-runs thread 20 (#310, superseded)
under the Coach's rulings of 2026-10-28.

* **Built**:
  * **Moves into `src/shapes/`** (`f0147022`): `checks/primitives.ts` and
    `checks/key-deriver-spec-checks.ts` become `shapes/primitives.ts` and
    `shapes/key-deriver-spec.ts` (tests moved beside); the seal's checks (box.ts) to
    `shapes/box.ts`; `LeaseGrant` (lease.ts) and `idbOpts` (idb-opts.ts) to `shapes/device.ts`;
    `freshPasskeyAnswer` (proving.ts) with `isPrfSalt` (wayin.ts), and `strengthChecker`,
    `passphraseVerdict`, `PassphraseVerdict` (passphrase-strength.ts) to `shapes/vault.ts`;
    `loggerShape`, `localVaultDBOptsShape` and `callback` to `shapes/bank-opts.ts`; `maskOpts` to
    a new `shapes/mask.ts`, so `safebyok/utils` pulls no other validator. Sizes unchanged.
  * **Namespaces** (`d07f4267` core; the rest in the rename commits): no
    file names a validator in a value import. PX primitives, FX fields, CX scopes, BX box, DX
    device, VX vault, VDX vault-db, OX bank-opts, KX key-deriver-spec, MX mask; `Validators`
    outside the core; CVX for safebyok-convex's component validators. Types by name. A record's
    field validators come into its `Validator` call from `[FX]` as a source, so records still read
    `obj({ vault_tok, salt_b64 })`. bank.ts uses `CX.bankBag` beside `CX.vaultBag`;
    shapes/vault-db.ts has `import * as BX` plus `import type { BoxSparse, BoxDamaged }`.
  * **Rename** (`a7a996ae`, one green commit: core, its tests, adapters, demo): 48 validators
    lowerFirst, private ones too; `VaultScope` (a second name for `vaultScope`) gone; Validators
    holds values only. Convex's own validators lowerCamelCase and reached as CVX in a commit of
    their own (`078f9317`): `gate`, `novelVaultRecord`, `vaultAnswer`, ... Later (`a589e466`)
    `madeUnderShape` and `cipheredShape` became `madeUnder` and `boxCiphered`, named for their
    types.
  * **Vals** (`0f875b96`): twelve lists lowerFirst, convex's `safebyokErrorKindVals` among them.
  * **Docs** (`704ec5d9`): STYLE.md *Imports* has the namespace rule with an example, *Naming*
    the Coach's rule; README and notes/guarantees.md follow. notes/security.md amended by a
    sonnet subagent (`fac8ae99`), 17 entries marked `amended 2026-10-28 (validator_names)`.
  * **phrases.ts** (`f154be58`): `otherScope`, `VaultGoneWhileOpening`, `OtherStoresThanHeld`,
    `VaultBehindWhileOpening`, and vault.ts's two as `VaultObjectGone`, `VaultBehind`, in a
    `[Bank and vault]` section; the header says it holds these and every check's sentence (`f38fb3f3`).
    Wording and kinds unchanged.
  * **Changeset** (`3d04edbf`): minor, safebyok and safebyok-convex, every rename old -> new.
* **Decisions taken**:
  * Namespace names: STYLE *Imports* says a module of functions comes in under its Startcase
    name, but `Box`, `Vault` and `KeyDeriverSpec` are taken; the short `X` names mirror the `T`
    rule for type modules and keep the Coach's `CX`. STYLE.md says so.
  * Values through the namespace, types by name, even where that is two import lines of one module
    (as #301's `CX` + `import type { VaultScope }` already were).
  * Module-private validators stay where they are, STYLE's "module-local variation"
    (lease.ts `serializedBytes`, `leaseSealProps`; string-store.ts and idb.ts `listenerShape`;
    vault.ts `putBoxProps`; del-damaged-vault.ts; vault-opts.ts's three; checks/validator.ts
    `bagShape`, `consistencyRefusalShape`). `options.ts`'s `optionsBag`, built per call by
    `optionsCheck`, is judged machinery, not a validator. `Kit` is the builder kit.
  * checks/validator.ts's private `Bag` would become `bag`, which its own `bag` parameters take: it
    is `bagShape`, as the house's other host-object checks are named (`loggerShape`). The only
    rename beyond lowerFirst.
  * `phrases:` was thread 21's commit prefix; PROCESS has none, so these used `api`.
* **Deviations**:
  * Commit order: namespaces in the core first, so the rename touches `BX.BoxRecord` as a
    property and never meets a local of the new name. Every commit is green (`pnpm --filter`
    lint, typecheck, test on each package it touches; full justify at the tip).
* **Review round** (2026-10-28): the history was rebuilt from `d07f4267` so that no commit is red.
  The core's rename, its tests, the adapters and the demo are one commit, and convex's own
  renames are another. The reviewer's InPackage fix was folded into the rename, and its doc-link
  fix kept (`c910b5c7`). After those: `madeUnder` and `boxCiphered` (`a589e466`); the `Validator`
  example's module is `GateChecks` again, not `GX` (`37a1e58f`); the phrases.ts header narrowed;
  shapes/mask.ts's reason is a comment (`7cce9189`); STYLE.md says an out-of-scope `{@link}` is
  backticks only (`a1ed35fe`). Left for the Coach by the orchestrator: a small shapes module for
  `loggerShape`, `callback` and `localVaultDBOptsShape`; the private validators; vault.ts's
  other lifecycle sentences.
  * safebyok-indexeddb's own `idbVaultDBOpts` stays in its package (an adapter's own check).
* **Discoveries**: `tests/types/type-aliases.test.ts` imported `./shapes/fields` both as
  `Fields` and by name; folded into FX.
* **For a later branch** cut before #322: rebase it onto `f43dc37e` (the moves; conflicts there
  are text). Then re-run, rather than merge, the rename: `thread-22-recase.cjs` (beside this file;
  its header says how) `ns`, then `rename`, then `verify`, over the whole tree, whose core `src` is
  still pre-rename as the script needs; lowercase the `*Vals` with `perl -pi -e
  's/\b(<lists>)\b/lcfirst($1)/ge'`; commit; then rebase onto #322's tip, where a conflict is a
  name and #322's side wins. Docs, phrases and changeset merge as text.
* **For the Coach** (also the PR's open questions):
  * Private validators stay out of shapes/ (STYLE's module-local variation). Rec: keep.
  * The X namespace names, not STYLE's Startcase. Rec: keep.
  * Field validators through `[FX]` sources in records. Rec: keep.
  * The main entry still exports validators by name beside `Validators`. Rec: keep.
  * The vault's sentences named `VaultObjectGone` and `VaultBehind`. Rec: confirm.
  * No lint rule for the namespace rule. Rec: none for now.
  * `passkeyAnswerShape` (type `PasskeyAnswer`, public) and the private `consistencyRefusalShape`
    keep a Shape suffix, as `madeUnderShape` did. Rec: rename to `passkeyAnswer` and
    `consistencyRefusal` in the same way.
