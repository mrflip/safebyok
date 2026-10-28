# Thread 22: validator names (2026-10-28)

Branch `20261028-validator_names`, PR #322, on main (its base #319 has merged; the branch stands
on #319's tip `90b28414`). Justify: green at the tip (the PR's **Tests:** line has the counts).
Re-runs thread 20 (#310, superseded) under the Coach's rulings of 2026-10-28, and folds in the
rulings of round 4.

* **Built** (SHAs as of the round-4 restack):
  * **Moves into `src/shapes/`** (`5254c7c6`): every exported validator lives there. That covers
    the primitives and keyDeriverSpec (out of `checks/`), the seal's checks (box.ts), `leaseGrant`
    and `idbOpts` (`shapes/device.ts`), `freshPasskeyAnswer` with `isPrfSalt`, the strength
    checker's and the verdict's checks (`shapes/vault.ts`), `loggerShape`,
    `localVaultDBOptsShape`, `callback` (`shapes/bank-opts.ts`) and `maskOpts` (`shapes/mask.ts`).
  * **Namespaces** (`d87b8037` for the core; the rest came with the rename): PX, FX, CX, BX, DX,
    VX, VDX, OX, KX, MX, and CVX for convex's component validators. Types are imported by name. A
    record's field validators come in from `[FX]` as a source.
  * **Rename** (`9aab24f6` for the core, tests, adapters and demo; `74d8a2f1` for convex's own):
    lowerFirst. `VaultScope`, a second name for `vaultScope`, is gone. After that come `madeUnder`
    and `boxCiphered` (`7d50e60c`). The **Vals** lists are lowerFirst too (`01498e11`).
  * **phrases.ts** (`6d846513`): `otherScope`, `VaultGoneWhileOpening`, `OtherStoresThanHeld`,
    `VaultBehindWhileOpening`, `VaultObjectGone` and `VaultBehind`, beside main's
    `VaultBagAdvice`.
  * **Docs**: STYLE.md *Imports* and *Naming*, the README, notes/guarantees.md and
    notes/security.md (through sonnet subagents). The changeset lists every rename.
  * **Round 4, the Coach's rulings**, one commit each:
    * (a) `e73bc1df`: no `Validators` namespace. `src/validators.ts` is gone, and the main entry
      exports all 63 validators by name. Adapters, tests and the demo import the few they use by
      name. Convex's component and the two test files that reach many validators star-import the
      main entry as `Safebyok`. The README, changeset and notes/security.md follow.
    * (b) `fc7ea59f`: STYLE.md has a table of the namespace aliases against their files, checked
      against the code. It says the core's `src/shapes/` holds the validators a module exports,
      and one a module keeps to itself stays beside its one user.
    * (c) `fdf65251`: STYLE.md says the namespace is there because a named import is unwieldy,
      not because it is banned. There is no lint rule.
    * (d) `1912601a`: `passkeyAnswerShape` -> `passkeyAnswer` (public, so the changeset names
      it), and `Checks.ConsistencyRefusalShape` -> `Checks.consistencyRefusal`.
  * **Size** (`0acda6c6`): idbDeviceDB's budget goes from 31 to 32 kB, by
    `pnpm size:budget --write`.
* **Decisions taken**:
  * Namespace names end in X, not STYLE's Startcase, because `Box`, `Vault` and `KeyDeriverSpec`
    are taken.
  * Outside the core, a file that reaches one or two validators imports them by name. One that
    reaches many star-imports `safebyok` as `Safebyok`, by STYLE's Startcase rule for a module
    imported whole.
  * Main's #331 made checks/validator.ts's private checks one object, `Checks` (`Bag`,
    `ConsistencyRefusalShape`, `StoryShape`). I kept that shape. The rename made its members
    lowerFirst (`Checks.bag`). In (d), `Checks.consistencyRefusal` and, by the same rule,
    `Checks.story`.
  * `Scopepath`, `Expectations`, `Refusals` and `HostErrorSanitizer` stay namespace exports.
    Each is one real module's namespace (STYLE *Imports*), not a confection gathered from several.
  * `maskOpts`, `idbOpts`, the bank-opts checks and everything else `Validators` held are exported
    by name from the main entry, so a host loses nothing it could reach before.
* **Deviations**:
  * The changeset no longer lists `Refusals.staleWriteVals`, because main removed it.
* **Discoveries**:
  * **The round-4 restack**: I merged the moves commit by hand, because main had reworked
    `localVaultDBOptsShape` and `idbOpts`'s callers. I re-ran the namespace and rename commits
    rather than merging them. The script ran over the new base. The old commit's hand edits came
    across by a three-way `git merge-file`: the base was the script's output on the old base,
    theirs the old commit, ours the script's output on the new base. I settled its conflicts by
    hand, with main's names winning (`StoredVaultAnswer`, `getRow`, `get`/`put`/`del`,
    `HostErrorSanitizer`).
  * **The committed `thread-22-recase.cjs` did not reproduce the rename.** The original run used a
    core-only variant, which left convex's own validators for their own commit and skipped a type
    alias's declared name. The script now does both under `CORE_ONLY=1`, and its header gives the
    order.
  * **Star imports do not always shake the same as named ones.** The namespace commit alone grew
    the `idbDeviceDB` bundle by 0.21 kB (27.90 -> 28.11 kB). STYLE *Imports* says they shake
    identically, so that claim may want a qualifier.
  * **`GIT_DIR` leaking into `tests/scripts/` under `rebase --exec`**: avoided. Every per-commit
    check ran from a plain shell, never under `--exec`.
* **For a later branch** cut before #322:
  1. Rebase onto `5254c7c6` (the moves).
  2. Re-run the rename with `thread-22-recase.cjs` under `CORE_ONLY=1`: `ns`, then `rename`, then
     `verify`. Run each adapter, the demo and e2e before the core, whose `src` must still be
     pre-rename.
  3. Lowercase the `*Vals` with `perl -pi -e 's/\b(<lists>)\b/lcfirst($1)/ge'`.
  4. Rebase onto #322's tip. A conflict there is a name, and #322's side wins.
* **For the Coach** (also the PR's open questions):
  * Field validators come into records through `[FX]` sources. Rec: keep.
  * The vault's sentences are named `VaultObjectGone` and `VaultBehind`. Rec: confirm.
  * `Checks.story` was renamed with `consistencyRefusal`, beyond the two names the ruling gave.
    Rec: keep.
  * Outside the core: named imports for one or two validators, `Safebyok` for many. Rec: keep.
  * `Scopepath`, `Expectations`, `Refusals` and `HostErrorSanitizer` are kept as namespace
    exports. Rec: keep. They are modules, not confections.
  * STYLE says named and star imports shake identically, against the 0.21 kB above. Rec: qualify
    the line ("nearly") and leave the rule as it is.
