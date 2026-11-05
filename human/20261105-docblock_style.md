# Thread docblock_style: the doc-block reform's rules land (2026-11-05)

Branch `20261105-docblock_style`, cut from `origin/main` at fa7ff8e5. Step 1 of the reform's order of operations
(`whiteboard/20261102-newdesign/docblock-reform.md` 3f, in the base checkout): the rules land at `warn`; the
documentarian sweep that turns them to `error` is a later thread. Justify green; lint 534 warnings, 0 errors.

* **Built**: STYLE.md *Comments and doc blocks* replaced by 3a's draft, *Tests*' title rule per 3b; CLAUDE.md
  *Doc blocks at a glance* (3h, verbatim); the documentarian brief's 3e cuts; `eslint-plugin-jsdoc` ^65.4.2 as a
  dev dependency of the core, with jsdoc-eval's recommended block at `warn` and `vitest/valid-title` at `warn`;
  `notes/gallant.md`, `notes/gallant-docblocks.md`, `notes/gallant-test_titles.md` copied unedited from the base checkout.
* **Warnings, per rule** (core package): `jsdoc/require-jsdoc` 295 (256 src, 39 test-helpers);
  `vitest/valid-title` 204 (all a quoted kind in a title); `jsdoc/no-restricted-syntax` 28 (bare `/**`, all in
  test-helpers); `jsdoc/no-undefined-types` 5 (2 src, 3 test-helpers); `jsdoc/multiline-blocks` 2 (vault.ts).
  Matches jsdoc-eval's trial, less the 21 phrases.ts exempts; valid-title is one higher than the trial's 203.
* **Decisions taken**: the Coach's six answers: `src/helpers/phrases.ts` exempt by a files-level override; getters
  kept; protected members exempt (publicOnly does it, checked with a planted file); the underscore regex, as one
  `QuotedKind` const shared by the jsdoc catalog rule and valid-title; no mood check; test-helpers in. The pin is a
  caret range (`^65.4.2`), as every other dev dependency: PROCESS.md keeps exact pins for hot releases. The 3a draft
  went in with its two Goofus-and-Gallant pairs, which the brief's "STYLE.md's two pairs" needs. Two nested-backtick
  code spans in 3a were re-quoted with double backticks so they render. The section's closing paragraph on running
  comments ("Well-named, short functions...") stayed: 3a's dropped list does not name it.
* **Amendment**: on the Coach's ruling relayed by the orchestrator, 3a's `@example`s bullet became
  `#example-earns-its-lines` (an example shows what the first line and signature do not; none for an enum validator,
  a getter or a one-call method). The old "Don't be stingy" sentence went with the section replacement.
* **Deviations**: the brief's lint step says "flags a refusal catalog" where 3e says "refuses a quoted kind": the rule
  wants two kinds, and at `warn` it refuses nothing. "Then each member" became "Each member" once *Gather first* was cut.
* **Discoveries**: `allowArguments` skips any identifier title, so a bulk list's blurb quoting a kind goes unseen by
  the lint, though STYLE.md now says the linter refuses one. Eight STYLE.md tags have no bestiary entry yet
  (#facts-from-the-code, #guard-names-its-predicates, #name-the-act, #one-verb-one-fact, #option-values-get-a-list,
  #point-dont-redefine, #reason-goes-above, #three-questions). The `create` Gallant uses `-` bullets at top level,
  where the section's own first paragraph says `*`. "One file per spawn" in the brief sits beside its unchanged
  frontmatter (target: files or folders) and *Done* (commits grouped by folder, four at most).
* **For the Coach**: the bestiaries here are copies; the latest from the base checkout sweep in before merge. The
  other packages' eslint configs are cut from the core's and were left alone.
