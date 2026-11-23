# Thread 5: dojo_practice (2026-11-23)

Branch `20261123-dojo_practice`, PR #863, stacked on #862 (`20261123-dojo_forms`). Proved: the dojo's own lint,
typecheck, test (16 files, 90 tests, 32 of them the Practice tab's) and build; `pnpm justify` not run, by the brief (a
reviewer's tests share the machine).

The Coach: "Have a tab also showing the things to do right: how to hold submit until zod validates (and show its message
by an input); how to prevent double-submit; why _.debounce is a bad plan; how to invite, and how to disinvite, a password
manager -- what else?"

What each card shows, and which of its claims were run and which only read, is in [dojo-findings.md](dojo-findings.md),
*What each Practice card shows*; what the library made awkward is that file's items 15 to 17.

* **Built** (all in `demos/safebyok-demo-dojo`):
  * `src/components/practice/`: `PracticeTab`, `PracticeCard` (a card: title, why, examples; `Example`, a figure
    labelled `Do: …` or `Don't: …`), and one file a card: `ValidateCard`, `DoubleSubmitCard`, `DebounceCard`,
    `PasswordManagerCard`, `NewPassphraseCard`, `RevealCard`, `PasteCard`, `RefusalCard`, `TestKeyCard`, `PostMethodCard`.
  * `src/lib/made-up-service.ts`: `isKeyAccepted` (accepts `sk-dojo-…` of 20 characters or more, after 300 ms) and
    `saveMadeUp` (2 s), the dojo's stand-ins for a key-checking service and a slow save. They call nothing.
  * `App.tsx`: a Practice tab between Forms and Inspect. `styles.css`: the cards' few rules, appended. README: a
    Practice paragraph.
  * Tests: `tests/components/practice/<Card>.test.tsx`, one file a card, with `world.ts` (the tab on a fresh page, a card,
    an example). `tests/test-helpers/fiber-holds.ts`, re-exported from the door: `TH.fiberHolds(element, text)` walks
    every fiber of the React tree (hooks, props, form status, `FormData`, current and alternate) for a text. Also
    `TH.expectTextSoon` and `TH.describingTextOf` in the door.
  * Dependencies of the private dojo: `zod` ^4.6.7 and `es-toolkit` ^1.53.2, the versions the library already uses.
  * An empty changeset: the dojo ships nothing.
* **Decisions made**:
  * **The brief's items 5 and 6 are one card** (`NewPassphraseCard`): `useNewPassphrase` is both the meter and the
    comparison, over `useStrengthVerdict`; two cards would have shown the same hook twice.
  * **The password-manager card shows the kit's `UnlockForm`**, handed `username`, rather than a hand-built form: it
    already does everything the card teaches, and the hidden username field it uses is not exported (findings item 15).
    The markup a host's own form needs is printed beside it.
  * **The debounce card's check and save are the made-up ones**, not the library's: what it shows is the timer, and fake
    timers stay clear of IndexedDB and Argon2id that way. Its tests render the card alone.
  * **Validation runs in `onSubmit`**, with the form Action left to save; the Don't runs it inside the action. Set aside: a
    check as the user types (state or a ref per keystroke for nothing the submit check does not do), and a check inside
    the action that cancels React's reset (it works, as Forms row 1 shows, but holds nothing back from React's form status).
  * **The double-submit card holds its saves six seconds** with the vaultDB's `holdNextWrite`, armed in an
    `onSubmitCapture` on a `display: contents` wrapper, so the example's own code stays a host's.
  * **The refusal card has its own words for `stale_write`**: the kit's text is the kind itself. Its "Save, refused" and
    "Save, stale" buttons arrange their outcome on click, as the Forms rows do (`refuseNextWrite`, `armOutcome`).
  * **The method card is kept**, for `onSubmit` forms only: reading react-dom's server renderer and running
    `renderToString` showed the risk is real for them, and absent for a form Action.
  * **Tests render a card alone where it needs no giver** (debounce, reveal, test-a-key, method); the rest drive the page
    as Hero. `world.practiceTab` clears the remembered tab first: on the Practice tab the header's Unlock has a namesake in
    the kit's form, which `TH.unlock` would trip on.
* **Deviations**:
  * `App.tsx`: one changed line beyond added ones, the `TabTitles` object gaining `practice`, as thread 4's did for Forms.
  * `tests/test-helpers.tsx` gained lines (added only): the two helpers and the re-export.
  * The brief's debounce claim "as a guard against a double submit it only delays the second one" is not quite what runs:
    within its wait it keeps the last press and drops the earlier ones (the review corrected this), and lets one after it
    through while the save is pending. The card and the
    findings say what is true.
* **Discoveries**:
  * The kit's `UnlockForm` and passkey unlock are `onSubmit` forms with no `method` (findings item 16): server-rendered and
    submitted early, they would put the passphrase in the URL. Narrow, since they show at stage `locked`, but worth a
    look by whoever owns the kit.
  * React's replay script for a form Action keeps an early submit's `FormData`, secret included, in
    `document.$$reactFormReplay` until React attaches (read from the script `renderToString` writes; not run in a browser).
  * `UnlockForm` submitted before bring-up rejects unhandled (findings item 17).
* **For the Coach**:
  * **Not looked at in a real browser**: there is none here. The build passes, and the dev server serves the new modules.
  * **What else, beyond the cards built** (not built): show a stored key by its mask, never by revealing it (the library's
    `mask` and `WhisperMask`; the saving cards already store a `mask` in the sidecar); keep the field out of session
    replay, analytics and error reporting, which often record input values; keep a key out of the URL and never prefill a
    field from one.
