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
      is made in a `Validator` call, never plain Zod (the Coach's ruling), and "take a part of a
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
