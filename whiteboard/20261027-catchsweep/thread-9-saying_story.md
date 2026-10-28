# Thread 9: saying_story (2026-10-28)

Branch `20261028-saying_story`, PR (pending), stacked on #327. Justify: green (core 3476 passed, 37
skipped; every package green; size budget within limits).

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
  - `ConsistencyRefusal` is not exported, though `Refusing.parseConsistent`'s signature names it,
    so a host typing that argument must write `Parameters<typeof X.parseConsistent>[2]`. Not asked
    for; left for the Coach (below).
  - `ConsistencyRefusalShape`'s `message` checks the function arm with a bare `custom(...)` where
    the kit's `fn<...>()` would say `FunctionExpected`; behaviour kept, as the thread is names and
    types. A Cleanup candidate.
  - "story" collides with nothing in VOCABULARY.md; "saying" appears there only as prose.
* **For the Coach**:
  - Export `ConsistencyRefusal` beside `Story` and `Refusing`? Recommendation: yes, one word in
    `src/index.ts` and a line in the changeset; a follow-up or a resume of this thread.
  - Confirm the two glosses of the rule in STYLE.md: namespacing (object of a `Validator` call, or a
    star import) and "the common checks folder" (`src/checks/` and `src/shapes/`).
