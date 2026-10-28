# Thread 27: restyle tidy (2026-10-28)

Branch `20261028-restyle_tidy`, PR #353, on main (`1f22111b`, #322 merged). Justify: green at the
tip (the PR's **Tests:** line has the counts). The size budgets did not move.

The tidy after #322. The Coach approved every item. Each item is one commit, in the order below.

* **Built**:
  * **1. StoredBox.box** (`7ea86f73`) is now typed `DamagedBoxRecord | Z.input<typeof boxSparse>`.
    The type is the same as before, but it now names the exported `DamagedBoxRecord`.
  * **2. `src/shapes/host-code.ts`, alias `HX`** (`e9abbb35`). It holds the shapes of a host's
    code: `vaultDBShape`, `deviceDBShape`, `clockShape`, `keyDeriverShape`, `loggerShape`,
    `localVaultDBOpts` and `callback`. `shapes/bank-opts.ts` keeps the options, the defaults and
    the limits, `clockReading` among them. logger.ts imports only `HX` now. STYLE.md's alias table
    has the new row. `callback` joins the in-package validators held to the no-quoting test.
  * **3. The Shape suffix** (`6e2620ca`): `localVaultDBOptsShape` is now `localVaultDBOpts`, with a
    changeset line. STYLE.md *Naming* now says a validator takes no `Shape` suffix. The five public
    checks of a host's code are the exception. An in-package validator follows the rule where
    its plain name is free. In-package: `madeShape` became `made`, since nothing named `made`
    shares a scope with it (box.ts reaches it as `BX.made.parse(made)`). Both `listenerShape`s
    (idb.ts, string-store.ts) keep the suffix under the exception, because each sits beside the
    `listener` it checks. `Phrases.leaseHoursShape` and the other `Phrases.*Shape` are sentences,
    not validators. They live in phrases.ts, which is thread 29's, so they are untouched.
  * **4. Types beside validators** (`6cdeb09a`), exported from the main entry: `VaultBag`,
    `BankBag`, `BankScopepath`, `VaultScopepath`, `LeaseScopepath`, `DeviceScopepath`,
    `BoxScopepath`, `ClockReading` (new, `Z.infer` of `clockReading`), `MaskOpts` and `IdbOpts`.
    I found no other validator the entry exports without its type. `label`'s types are
    `Applabel`, `Vaultlabel` and `Boxlabel`; the duck checks' types are the interfaces they
    check. There is a changeset line. A type-level test in index.test.ts covers them.
  * **5. PROCESS.md** (`8b7e6f3e`): the commit-prefix table gains `style`, for the
    `style-reviewer` agent's commits.
  * **6. STYLE.md *Imports*** (`89b3b2cf`): the tree-shaking line is qualified. A star import
    reached only through its members shakes as named imports do. One passed as a value (`[FX]`)
    keeps the namespace object, about 0.2 kB in idbDeviceDB. I checked that `fields_exports` is
    in `dist/shapes/fields.js` and is used by `dist/shapes/host-code.js`. The rule stands.
  * **7. Tests** (`ef3a7fe8`): validators.test.ts and index.test.ts star-import the entry as
    `Safebyok`.
  * **8. The count** (`47f30a75`): **65**, not 63 and not "perhaps makeBankOpts and
    bankVaultOpts fail the filter". Both pass `instanceof ZodType`. index.test.ts lists 65 names,
    and the test passes. The 63 came from a count that dropped `salt_b64` and `prf_salt_b64`,
    the two names with digits (a `[A-Za-z_]` pattern makes that mistake). Before #322,
    validators.ts re-exported 66 names, 65 objects: `VaultScope` was a second name for
    `vaultScope`. notes/security.md is corrected, with the header's `amended` markers, through
    a sonnet subagent. **Correction to thread-22's file:** "exports all 63 validators by name"
    should read 65. Its file is left as written.
  * **9. thread-22-recase.cjs** (`1c382c3a`): `nsOfFile` maps the entry points to no namespace.
    A validator imported from `safebyok` by name now stays named, as #322 left those. The dead
    `Validators` branches and `hasNamed` are gone. Its header carries the amended recipe, which
    supersedes thread-22's "For a later branch", with a new step 5. A pre-#322
    `import { Validators }` comes out of the rename as `Validators.boxRecord`, and step 5 turns
    it into `Safebyok.x` with one perl line. `node --check` passes. The script was **not** run
    against a pre-#322 tree.
* **Review round** (2026-10-28): the reviewer's five commits (`4895f9e1` to `a7b4c58d`): the
  [Limits] banner names ClockReading; the changeset says `localVaultDBOptsShape` is gone with no
  alias and the type exports are additions; STYLE.md's HX row indented; host-code.ts's doc block
  covers keyDeriverShape's field checks; the type-export test retitled. Then, at the orchestrator's
  word: #322's unreleased changeset no longer lists `localVaultDBOptsShape` among the names kept;
  STYLE.md's Shape paragraph says "in-package", not "module-private" (`BX.made` is exported from
  shapes/box.ts). Minor findings left: `Clock` and `wallClock` stay in bank-opts.ts beside
  clockShape's move (taste); host-code.ts's member doc blocks repeat its header (a documentarian
  matter); `callback`'s `@example` has no test; `IdbOpts`, `MaskOpts` and `LocalVaultDBOpts` are
  hand-written, not `Z.infer` of their validators.
* **Decisions taken**:
  * Item 2 also moved the four store and library checks. They are the same kind of check,
    a host's object judged by the verbs the vault calls. Keeping them in bank-opts would have
    split one concern across two modules.
  * The module is named `host-code` after bank-opts' old section banner, "Host code and
    adapters' options". `HX` was free.
* **Deviations**:
  * **vault.ts touched, 3 lines**, against "stay out of vault.ts". vault.ts called
    `OX.callback` twice, and `callback` moved to `HX`. The change is its import line, `OX` to
    `HX`, and the two call sites (lines 253 and 680). If it meets thread 29's work, the rebase
    is mechanical.
  * Per-commit checks: commits 1 to 4 each passed a full `pnpm justify`. Commits 5 to 9 are docs,
    tests or winboard only. Before committing each, I ran the core's lint, typecheck and the tests
    they touch. The tip passed a full justify.
* **Discoveries**:
  * The narrower logger.ts import moved no size budget. idbDeviceDB measured 28.063 kB before
    and after, so whatever pulls bank-opts into that bundle is not logger.ts alone.
  * `HX.callback` does exactly what the two in-package `listenerShape`s do. They could use it,
    at the price of idb.ts and string-store.ts importing `shapes/host-code`.
* **For the Coach**:
  * **listenerShape → HX.callback?** Rec: yes, in a later tidy. It removes two copies of one
    check.
  * **vault.ts's 3 lines** (above). Rec: keep them here.
