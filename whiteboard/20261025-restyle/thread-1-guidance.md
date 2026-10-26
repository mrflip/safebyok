# Thread 1: Guidance (2026-10-26)

Branch `20261026-guidance`, PR (opening), stacked on #267. Justify: green (core 3156 passed, 37
skipped; every package and the root green; size budgets unchanged).

* **Built**:
  - STYLE.md takes in NEWSTYLE §1-§10. New sections: *Build for maintenance* (§1), *Shapes and
    duck typing* (§3), *Crossings, spreading and logging* (§4), *Stateful objects and snapshots*
    (§5), *Order comes from an explicit list* (§6), *Scopepaths* (§7), *Tree-shaking* (§10).
    *Validation* is rewritten to §2 (always at a boundary; Zod for preconditions with a specific
    check beside it where warranted; the `Validator` call; what a refusal says; sanitizing
    shape). *Naming* gains §8 (smushed `path`, `Boxscope`, `Pred`, validator names, enumerations,
    `state`/`lifecycle`, shape names, `-Sparse`, the stamp, a host-facing field's stored
    spelling). *Imports* gains §9 and the `Z` type import. *Tags*: `ckey` is a generic key, and
    `scopepath` is a tag. *Comments* asks for shape names and *stamp*. *Mechanically enforced*
    lists `no-multi-spaces` off and the named-ignore rule. Every existing heading is kept, so
    `STYLE.md, *Naming*` and the rest still resolve.
  - VOCABULARY.md: *The stamp* rewritten to NEWSTYLE's meaning; a new *Shapes* section (record,
    sparse, stamp, scope, dna, tombstone, snapshot); a **scopepath** row; the **ckey** row and
    *Words safebyok does not use* make `ckey` a generic map key.
  - CLAUDE.md: *Non-Negotiables* says an entrypoint is every export, a private helper trusting its
    exported caller; *Conventions At A Glance* gains a named ignore, `scopepath` among the
    smushed tags, a host-facing field's stored spelling, and "never spread a thing to take a part
    of it"; the STYLE.md line in *Notable files* names *Validation* for a validator and *Shapes
    and duck typing* for a type's shapes or a stateful class.
  - `@typescript-eslint/no-unused-vars` ignore patterns go from `^_` to `^_[a-zA-Z0-9]` in all ten
    configs (the core's, the root's, each package's, the demo's and e2e's).
  - An empty changeset, `.changeset/20261026-guidance.md`.
* **Decisions taken**:
  - **One transition paragraph, not a caveat per line.** STYLE.md's introduction says the
    `Validator`, primitives, `Phrases`, `consts` and `Scopepath` are still being built, that
    `whiteboard/20261025-restyle/good/` holds the worked example of each until it lands, and that
    unconverted code keeps its older form (`zod/mini`, `Ckeys`, a hand-written type). VOCABULARY's
    *Shapes* intro, its **scopepath** row and its *The stamp* paragraph each carry one such
    sentence. The wrap-up thread strikes them (see *For the Coach*).
  - **The lint change flagged nothing.** `no-unused-vars` defaults to `args: 'after-used'`, so
    `(_, ii) =>` was never reported. I renamed the eleven bare `_` and holes in tests anyway
    (`_slot`, `_racer`, `_fnName`, `_match`, `_callback`), so the code follows the rule it is
    taught by. All are in tests; nothing in `src/` changed, so the changeset is empty.
  - **CLAUDE.md lines weighed by cost.** Four short additions, each something a writer gets wrong
    unless told; the principles stay in STYLE.md. No line came out: none was made obsolete.
  - "Bound", "what the tag authenticates" and "binding" all say *stamp*. I wrote "authenticated
    by the tag" in place of NEWSTYLE's "authentics", which read as a typo.
  - `types/types.ts` (NEWSTYLE §3) is written `types.ts`: the file is `src/types.ts` today.
* **Deviations**:
  - **The eslint `safebyok/tree-shaking` comment and message are left for thread 2.** NEWSTYLE §11
    wants "classic zod does not tree-shake" restated as §10. Thread 2 loosens that rule and
    rewrites those same lines beside this thread, so editing them here would only conflict.
    Thread 2 (or 3) should restate the reason as §10's: the library's size, not tree-shaking.
  - NEWSTYLE §11's `src/validators.ts` line (`NameFloor`'s one outer `@__PURE__`) is a code fact,
    not guidance. Thread 2 removes `src/validators.ts`, so nothing is done here.
  - VOCABULARY's `ctx`, **visible** and **unencrypted** rows still say "bound". Rewording them in
    terms of stamps describes thread 9's ctx, so that is thread 9's to do. Retiring "vault props"
    is thread 8's, as the plan says.
* **Discoveries**:
  - Today's `Stamp` type holds both epochs, and NEWSTYLE's stamp holds neither. VOCABULARY now
    says so in one sentence, and the preplan folds `Stamp` into `VaultSparse`.
  - `src/utils.ts` exists beside the planned `src/utils/` folder. Thread 2 should choose names that
    keep `./utils` from resolving two ways.
* **For the Coach**:
  - The transition sentences (STYLE.md's introduction; VOCABULARY's *The stamp*, *Shapes* and
    **scopepath**) are development caveats in guidance documents. I judged them the honest way to
    say "write this from now on" while `src/` does not yet read that way. The wrap-up thread
    should strike them once thread 13 files.
  - CLAUDE.md gained one line that is a principle rather than a name: "never spread a thing to
    take a part of it, nor hand host code the thing itself". I kept it because it is a safety rule
    and the habit runs the other way. Strike it if STYLE.md alone should carry it.
  - Once thread 2 lands, CLAUDE.md might name the `Validator` call in *Conventions At A Glance*
    ("validators are made in a `Validator(kind, kit => ...)` call"). It shapes code deeply, but
    today it would name a module that does not exist.
