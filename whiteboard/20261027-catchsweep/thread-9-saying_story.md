# Thread 9: saying_story (2026-10-28)

Branch `20261028-saying_story`, PR #331, stacked on #327 (base `c51b7274`; main has since merged
#327, #330 and #328). Justify: green (core 3476 passed, 37 skipped; every package green; size
budget within limits).

* **Built**: in `packages/safebyok/src/checks/validator.ts`, `Saying` → `Story` and `SayingShape` →
  `StoryShape`; `parse(val, story?)` and every doc block follow ("saying" is "story" in prose, in
  STYLE.md *Validation* too). `Story` and `Refusing` are exported from `src/index.ts`. `Story` and
  `ConsistencyRefusal` are read off their shapes with `Z.infer`, no longer written by hand. The
  module's three shapes (`Bag`, `ConsistencyRefusalShape`, `StoryShape`) are made in one `Validator`
  call kept under one name, `Checks`, in a `[Checks]` section of their own at the file's foot. STYLE.md
  *Shapes and duck typing* gains a bullet quoting the Coach's rule, with a gloss. Tests: three titles
  renamed; one type test added, pinning `Story` and `ConsistencyRefusal` to the shapes they used to
  be written as. Changeset `20261028-saying_story.md`, minor, naming the rename and both exports.
* **Decisions taken**:
  - *The two types are `interface X extends Z.infer<typeof Checks.XShape> {}`, not `type X =
    Z.infer<...>`.* The alias form does not compile: `Refusing` names `Story` (its `parse`) and
    `ConsistencyRefusal` (its `parseConsistent`), and each is read off a `Refusing`, so TS reports
    `Type alias 'Story' circularly references itself` (TS2456/TS2615) and, before that, made
    `Validator` itself `any` (TS7022, 293 errors downstream). Tried and failed the same way:
    `Z.output<...>` and a raw `['_zod']['output']`. An interface's members are resolved on demand,
    which is exactly the "recursive types" exception the Coach's rule names; the `Z.infer` is kept.
    A running comment above the two says why. `no-empty-object-type` is off in the lint config,
    so no suppression.
  - *Namespacing:* read "namespace it, using Validator or a star-import" as: keep the object a
    `Validator` call returns under one name (`Checks.StoryShape`) rather than destructuring three
    module-level names, the star import being the form for a module of validators (`Validators.*`).
    The STYLE.md gloss says so; the Coach can correct the reading there.
  - *The common checks folder:* glossed as "the shared folders (`src/checks/`, `src/shapes/`)",
    since the cast's shapes live in `src/shapes/` and the shared checks in `src/checks/`. These
    three shapes stay in `checks/validator.ts`, which is in the common checks folder already.
  - `Refusing`'s doc block, now a host's, says it is what a `Validator` call returns under each name.
* **Deviations**: none from the plan beyond the interface form above.
* **Discoveries**:
  - `ConsistencyRefusalShape`'s `message` checks the function arm with a bare `custom(...)` where
    the kit's `fn<...>()` would say `FunctionExpected`; behaviour kept, as the thread is names and
    types. A Cleanup candidate.
  - "story" collides with nothing in VOCABULARY.md; "saying" appears there only as prose.
  - The zxcvbn strength checker's `PlainSaying`, `SayingForWarning` and `saying` are a weak
    passphrase's reason sentence, not a Story, so the sweep left them; the #317 near-collision row
    is moot now the type is `Story`. Every other "saying" in the repo is the plain participle.
* **Review round** (the Coach's rulings, 2026-10-28, built on `a984cea5`):
  - *Interfaces over the inferred types*: accepted as built; the comment above the two stays.
  - *Exports*. The Coach: "Don't be chary with the exports. It's really frustrating for a lib
    contributor to be denied things at arms reach. It's a lil baby tiny library right now, we can be
    forgiven churn but not surliness." Followed as: every type an exported signature of
    `checks/validator.ts` names is exported from the module and `src/index.ts`. Added:
    `ConsistencyRefusal` (named by `Refusing.parseConsistent`, `demandConsistent`,
    `verifyConsistent`) and `Merged` (named by `KitWith`; was module-private). The changeset names
    each. A second ruling (yes to the open matter) then exported `consistent`, `demandConsistent`
    and `verifyConsistent` as values too; `verifyConsistent`'s doc block stated its relation to
    `parseConsistent` as a contract where it had named its caller.
    `tests/index.test.ts` pins the entry point's surface exactly, which that commit (`c16df6f7`) and
    the plan commit after it (`f02d2b88`) were pushed without updating, so both are red at
    `pnpm justify`; `3d4dcc8b` adds the three names and is green. Cause: the push was chained after a
    log check that read the wrong exit line.
  - *"story" replaces "saying" everywhere*: the sweep found one remaining place meaning the Story,
    `.changeset/20261028-where_prefix.md` (#327's note, on this branch), changed in its own commit.
  - *STYLE.md's Shapes bullet*: the reading is now the rule's own wording; namespacing is the
    object a `Validator` call returns or the module's star import, conventionally `CX`, which the
    codebase uses for `shapes/scopes` (`import * as CX from './shapes/scopes'`); the "common checks
    folder" gloss (`src/checks/`, `src/shapes/`) kept as settled.
  - *`Stored-` prefix* (from #330's review): the sentence it amends is main's (#330), not on this
    base, so the paragraph here carries main's sentence verbatim plus the clause: the prefix names
    what storage holds, checked or not (`StoredVaultTok`, `StoredRevision`). **The restack will
    conflict on this paragraph** (both sides add text at the same spot): take this branch's side,
    which is main's sentence with the clause.
  - *Doc-block lead verb* (from #328's review): the rule and its worked example lead "Get and open
    the box", the body "Gets through `#getBox`", the body line written exactly as main (#328) has
    it, so the restack merges it clean.
  - *VOCABULARY.md*: a **story** row in *Names, records and times*, in the Coach's words: "a
    controlled record of what is happening, suitable for logs or refusals".
  - STYLE.md's edits are one `docs:` commit; the exports and changeset one `api:`; the sweep one;
    VOCABULARY.md one `docs:`.
  - The zxcvbn `PlainSaying`/`SayingForWarning` names stay, a reason sentence and not a Story: the
    orchestrator records that call.
