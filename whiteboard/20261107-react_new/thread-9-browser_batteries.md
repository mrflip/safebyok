# Thread 9: browser batteries (2026-11-07)

Branch `20261107-browser_batteries`, PR [#579](https://github.com/mrflip/safebyok/pull/579), cut from main at de4943bd6. Justify: green; safebyok 2413 passed, lint 0 errors, every size-limit line within budget.

* **Built**:
  * `packages/safebyok/src/helpers/zxcvbn-strength-checker.ts`: `zxcvbnStrengthChecker`,
    `MinPassphraseChars` (12), `MinZxcvbnScore` (3). Length counted in graphemes
    (`Intl.Segmenter`), then zxcvbn's score with the vault's scope (applabel, user_id,
    vaultlabel) as user inputs, Levenshtein on. Reasons are three new phrases in `phrases.ts`
    (`passphraseTooShort`, `PassphraseGuessable`, `PassphraseUnjudged`); none quotes its input.
  * The dictionary (`@zxcvbn-ts/language-common`) is a dynamic `import()` inside `load`, never at
    import; the judge (`ZxcvbnFactory`) is built over it at the first load and kept in a closure
    (`makeZxcvbnStrengthChecker`). A failed import leaves it unbuilt, so the next load retries.
  * `src/browser.ts`: `browserOpts({ dbName }?)` and its `BrowserOpts` interface, one frozen bag
    per dbName (module-level Map); it also re-exports the checker, its thresholds and the
    `StrengthChecker` type its bag names. Its options are checked by `idbDeviceDBOpts`, now
    exported from `storage/idb-device-db.ts` (the same `{ dbName }` shape), refusing `bad_option`.
  * Tests: `tests/helpers/zxcvbn-strength-checker.test.ts` (verdict cases, graphemes, scope names,
    no quoting, refusals, the guard, load at import / once / retried after failure, via
    `vi.doMock` of the dictionary); `tests/browser.test.ts` gains `browserOpts` (identity,
    refusals, a real bank over fake-indexeddb creating a vault under the zxcvbn checker, a field
    after the spread winning) and the front-door check covers the new names.
  * Docs: CUSTOMIZATION.md's checker section (*The one safebyok ships*, *Wrapping it*, *Leaving
    it out: your own*, links `notes/good_bank_opts_are_in_browser.md` by path); README's host
    example now spreads `browserOpts` and passes a `device_id`, and *Not done yet* names the new
    exports. `StrengthCheckerShape`, the default checker's reason and `StrengthChecker`'s doc
    block now point at `zxcvbnStrengthChecker` instead of "safebyok ships none".
  * Dependencies: `@zxcvbn-ts/core@^4.2.0` (2026-08-12) and `@zxcvbn-ts/language-common@^4.1.3`
    (2026-07-16), the current releases, both aged; already in the lockfile through safebyok-old.
    Approved by the Coach in advance.
  * `.size-limit.json`: `browserOpts` and `zxcvbnStrengthChecker` now measure
    `packages/safebyok/dist/browser.js`, with `ignore: ["zod"]` (zod is the core's peer, as on
    `idbDeviceDB (core)`). `browserOpts` keeps `entry: ["index"]`, which measures only the
    import-time chunk (25.0 kB, budget 37 -> 29 kB); `zxcvbnStrengthChecker` measures it with the
    dictionary chunk (220.8 kB, budget 220 -> 230 kB). Other lines left alone, though
    `size:budget` says several drifted (not this thread's).
* **Decisions taken**:
  * **No `device_id` from `browserOpts`.** Reasons: VOCABULARY.md says safebyok mints none and
    keeps no record of it; a deviceId is per bank scope (applabel, user_id) while the bag is per
    dbName, so one id across users on a device would link their wayins in storage; `localStorage`
    is absent during SSR and in some private modes, which would make the render-safe bag throw
    or mismatch at hydration (the IdbDeviceDB opens nothing until first use, so the bag is
    SSR-safe today). If the Coach wants the battery, a separate sync helper keyed per bank scope
    (say `rememberedDeviceId({ applabel, user_id })`) keeps the bag scope-free.
  * The checker loads its own dictionary if asked before `load`, and answers a weak verdict
    (`PassphraseUnjudged`) if that fails, rather than throwing: the contract says answer, never
    throw, and a throw would reach the user as the guard's `unexpected_error`.
  * It validates its own input (`checkerInput`, `bad_option`), so a direct host call with no text
    or no scope refuses; under the bank's guard that never happens.
  * Grapheme count, not code points or UTF-16 units: "12 characters" as the user sees them.
    `@typescript-eslint/no-misused-spread` pushed this; `Intl.Segmenter` is Baseline 2024.
  * Approaches set aside: a module-level `let` for the judge (lint's no-top-level-assignment;
    the closure factory also gives the load tests a fresh instance via `vi.resetModules`);
    `decorate` to attach `load` (its Partial type drops `load`; `Object.assign` keeps it);
    supplying `device_id` (above); dropping `entry: ["index"]` on the `browserOpts` size line
    (it then measured the dictionary too, 227 kB).
  * Tests call the checker through `judgedAsync`: `StrengthChecker` may answer synchronously, and
    `TH.expectRefusal` wants a Promise (`Promise.try` is past the tsconfig's lib).
* **Deviations**: none from the gloss. The module lives in `src/helpers/` beside
  `passphrase-strength.ts`.
* **Discoveries**:
  * zxcvbn scores "correct horse battery staple" 4, and "acme keys u1 acme" strong under scope
    acme/u1/keys (spaces between scope words defeat the user-input match). A single scope name
    as the whole passphrase is refused.
  * A browser may cache a failed dynamic `import()` in its module map until reload; our side
    forgets the failure, but whether a retry refetches depends on the browser and bundler.
  * The `everything`, `Bank`, `mask` etc. budgets are below what `pnpm size:budget` now gives.
* **For thread 10**: `...browserOpts({ dbName: Applabel })` is ready; the demo keeps its own
  `device_id`. The bag is identical per dbName, so it is safe to call during render.
* **For the Coach**: the `device_id` row (recommendation above); the doc link to
  `notes/good_bank_opts_are_in_browser.md` dangles until the sprint PR (#572) brings the note.
