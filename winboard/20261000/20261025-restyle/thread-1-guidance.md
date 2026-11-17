# Thread 1: Guidance (2026-10-26, reworked 2026-10-27)

Branch `20261026-guidance`, PR [#272](https://github.com/mrflip/safebyok/pull/272), based on
`main`. Justify: green (core 3276 passed, 37 skipped; react 308; convex 350; postgres 322;
graphql 344; indexeddb 165; fastkey 49; demo 229; e2e 107; root 265).

* **Built**:
  - STYLE.md takes in NEWSTYLE §1-§10. New sections: *Build for maintenance* (§1), *Shapes and
    duck typing* (§3), *Crossings, spreading and logging* (§4), *Stateful objects and snapshots*
    (§5), *Order comes from an explicit list* (§6), *Scopepaths* (§7), *Tree-shaking* (§10).
    *Validation* is rewritten to §2; *Naming* gains §8 and the one-name rule; *Imports* gains §9;
    *Tags* makes `ckey` a generic key and `scopepath` a tag. Every existing heading is kept.
  - VOCABULARY.md: a *Shapes* section (record, sparse, stamp, scope, dna, tombstone, snapshot), a
    **scopepath** row, **ckey** a generic map key, and the time row spelt `registered_at`,
    `written_at`.
  - CLAUDE.md (126 lines on main, 132 here), each line weighed by its per-turn cost:
    - *Values*: "validate at each module entrypoint, every export", the one line saying a validator
      a validator a module exports is made in a `Validator` call (softened by the 2026-10-27 amendment below), and "take a part of a
      thing by parsing or destructuring, never by spreading it" (kept by the Coach's ruling).
    - *Notable files*: the STYLE.md pointer names *Shapes and duck typing*.
    - *Naming at a glance*: a host-facing field keeps its stored spelling (`user_id`).
  - `no-unused-vars` passes only a named ignore (`^_[a-zA-Z0-9]`) in all ten eslint configs; the
    eleven bare `_` and holes in tests now say what they skip. An empty changeset.
* **Decisions taken**:
  - **#285's structure wins.** CLAUDE.md is main's, with this branch's lines placed where #285
    sends such lines: the principles into *Values*, the naming line into *Naming at a glance*. The
    named-ignore line went nowhere new: STYLE.md (*Build for maintenance*) already has it, and the
    linter enforces it. `scopepath` among the smushed tags is in STYLE.md alone.
  - **STYLE.md's camelCase rule is scoped, not deleted.** "Everything else is camelCase" became
    "a field holding a stored value keeps its stored spelling wherever it goes ... Other names are
    camelCase: a field with no stored counterpart (`damagedBoxes`), a verb (`getUserId`), a
    concept (`keyDeriverLabel`)". Thread 6's note asked for the concept names to stay camel. The
    `askPassphraseAt` example is gone.
  - **Paths as on main**: `consts.ts` and `phrases.ts` sit at `src/`'s root, not `src/utils/`.
  - **The spread example**: NEWSTYLE's `{ ...vault }` no longer appears; STYLE.md says the linter
    refuses a spread of a class instance (`no-misused-spread`), and "a getter hands out a frozen
    shallow copy of its fields", unnamed, for thread 15 to name.
  - **The kit**: `zod` is gone from STYLE.md's list, `lazy` and `custom` are in, with `epochMillis`
    among the primitives, as `checks/validator.ts`'s `Kit` has them. A maker the kit lacks comes in
    by a named import from `zod`, as the kit's own doc block says.
* **Deviations**:
  - **NEWSTYLE.md itself is not edited here.** It lives only on the sprint branch, which this
    thread does not write. Its two ruled edits (drop `zod` from §2's kit list, adding `lazy` and
    `custom`; §4's `{ ...vault }` example becomes "a getter hands out a frozen shallow copy of its
    fields") are the orchestrator's to make there, if NEWSTYLE is to be kept current at all now
    STYLE.md carries it.
* **Discoveries**:
  - The rebase took one hand resolution in code: `safebyok-convex/tests/component/vaults.test.ts`,
    main's flat arguments with this branch's `_slot`. The docs conflicts were STYLE.md's
    introduction, VOCABULARY's *The stamp* (main's, thread 9 and 11's, kept whole) and its
    format/ckey rows (main's format row; the validators row dropped, as its option is gone).
  - `src/scopepath.ts` still says "The scopepath of a vault's props" (line 26): a "props" left for
    thread 15.
  - The **dna** shape has no type in `src/`; `VaultDraft` is the record a VaultDB's `ensureVault`
    takes, scope included, so it is not one.
* **For the Coach**:
  - CLAUDE.md gains six lines; the PR says why each earns its cost.

## Amendment, 2026-10-27 (the Coach's four rulings on the review)

Justify green again, with the same counts as above (the amendment adds no tests).

* **Built**:
  - CLAUDE.md's validator line now reads "A validator a module exports is made in a `Validator`
    call (STYLE.md, *Validation*), not in plain Zod", one line still: STYLE.md allows plain Zod for
    the kit's own primitives and for a variation made from a validator (`VaultSparse.pick(...)`).
  - STYLE.md *Naming*: a shape's validator is the exception to "named after the parameter it
    checks"; it takes its type's name (`export const { BoxSparse } = ...`,
    `type BoxSparse = Z.infer<typeof BoxSparse>`). `checks/validator.ts` is untouched: thread 15
    fixes its examples.
  - `@typescript-eslint/no-unused-vars` is `error`, not `warn`, in all ten eslint configs (the
    root's, the eight packages' and e2e's, and the demo's). **It surfaced 0 sites** (`eslint
    --no-cache` over all ten): the rule's `args: 'after-used'` and the earlier renames had left no
    bare `_`. No fix to a name changed behaviour.
  - Three holes in tests, found by grepping every package, root `tests/` and `scripts/` for
    `[,` and `, ,`, are named for the slot they skip: `vault-resolvers.test.ts` line 264
    (`_rootField`, as line 254 names it), `vault-del.test.ts` line 210 (`_damage`, as line 186 has
    it) and `device-db-conformance.ts` line 94 (`_putOutcome`, the `putLease` result in a
    `Promise.all`).
* **Decisions taken**: `_putOutcome` is my name for the middle result; the Coach may prefer another.

## Rebase, 2026-10-27 (onto main after #286 and #287)

Justify green: core 3380 passed, 37 skipped; react 309; convex 350; postgres 322; graphql 344;
indexeddb 167; fastkey 49; demo 229; e2e 107; root 265.

* **Conflict**: one, in STYLE.md's *Validation*, where #287 rewrote the two refusal bullets this
  branch had reorganized into *What a refusal says*. Resolved as main has the bullets ("a refusal of
  a host's bag of options says what Zod found", "a refusal never repeats its input: no value, and
  no key"), which replace this branch's "as informative as it can be" and "a message never carries
  the input" bullets (the second contradicted #287: a key no longer repeats). The branch's own
  layout round them is kept.
* **Follow-ups from #287 and #286**: STYLE.md's list of the kit's makers drops `rec` and says why
  (a record's keys in a failing path would be the input's own) and that a value checked whole takes
  `custom`; a typed bag is `obj({ ... }).strict()` (no `strictObject` in the kit); `LeaseVault`,
  a type the code no longer has, is no longer cited. The `zod/mini` mentions that remained are the
  *Tree-shaking* measurements, now marked as taken while the choice was open; the core and every
  package using Zod are on classic Zod (IndexedDB depends on none). The names the guidance cites
  were checked against main: `useBankVault` and `Validators` exist.
