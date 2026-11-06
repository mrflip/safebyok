# Thread 19: utils_port (2026-11-06)

Branch `20261106-utils_port`, PR #TBD, stacked on #531. Justify: see the PR's Tests line.

* **Built**: `safebyok/utils` now also exports `mask`, `MaskOpts`, `fromB64`, `toB64` and `WhisperFieldAttributes`, in the new core.
  - `src/helpers/mask.ts`: `mask` and its private helpers, ported from the old `src/mask.ts` (same algorithm, same results on every old case).
  - `src/shapes/shapes-utils.ts`: `maskOpts`, an `objCheck(..., 'bad_option')`, and `MaskOpts = Z.input<typeof maskOpts>`, so the type comes from the schema. A shapes module of its own so that `safebyok/utils` reaches no other validator.
  - `src/helpers/whisper-field.ts`: `WhisperFieldAttributes`, a const with a doc block.
  - `fromB64` and `toB64` re-export `helpers/crypto.ts`'s existing codec; no second one.
  - Tests: `tests/helpers/mask.test.ts` and `whisper-field.test.ts` (ported, path for path with `src/helpers/`), and the entry-point cases in `tests/utils.test.ts` beside `mash`'s.
  - VOCABULARY.md: the **mask** row moved back from `notes/old_vocabulary.md`, beside **mash**, its text checked against the code.
  - Changeset `.changeset/20261106-utils_port.md`, minor.
* **Decisions taken**:
  - The text parameter is `text`, as `mash`'s, not `whisper`: a whisper is always an object in the new design, and `mask` takes a string, usually `whisper.apiKey`. The test blurbs and the VOCABULARY row say text; the row's example is `mask(whisper.apiKey)`.
  - A text that is not a string refuses 'bad_option' (a `Checker` named `maskInput`, as `mash` has `mashInput`): the new core has no 'bad_whisper' kind. The changeset says so.
  - `codePointsOf` is a private one-liner in `mask.ts` (`match(/./gsu)`), not a shared helper: `[...text]` and `Array.from(text)` are both refused by lint (`no-misused-spread` against `unicorn/prefer-spread`). The zxcvbn thread, when it needs the same, may lift it.
  - The old tests ran by file path (`tests/mask.test.ts`); they sit under `tests/helpers/` here, following STYLE.md's path-for-path rule, and the old `tests/utils.test.ts` cases are in `tests/utils.test.ts`.
  - The doc blocks are rewritten, not copied: first line a purpose, no refusal list, four `@example`s on `mask` (each tagged `// mask @example N` on its test row), and the second `WhisperFieldAttributes` example tagged on its test (the JSX one has no test).
  - Test titles: "refuses ${blurb}" without the kind, since `vitest/valid-title` warns on a quoted kind; the old case list is otherwise unchanged.
* **Deviations**: `.size-limit.json`'s `mask` entry still measures `safebyok-old/dist/utils.js` (root file, not this thread's). A later thread that retargets the size budget to the core should point it at `packages/safebyok/dist/utils.js`.
* **Discoveries**: `safebyok/utils` now reaches `helpers/crypto.ts` (through the codec re-export), which pulls `refusals/throwers` and `stable-jsonify`; `mash` already pulled `helpers/validator`. Still none of the vault, but the entry is no longer as small as the old one.
* **For the Coach**: nothing blocking. The `mask` row's "Standard term" column says `redact`; change it if you would rather it say none.
