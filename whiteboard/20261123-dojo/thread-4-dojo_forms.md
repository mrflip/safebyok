# Thread 4: dojo_forms (2026-11-23)

Branch `20261123-dojo_forms`, PR #862, stacked on #861 (`20261123-dojo_backdoor`). Proved at the build: `pnpm justify`
green, 7587 tests in 16 suites. Proved at the reworks: see the reworks file.

The Coach: a tab called "Forms" that shows how to build a form with a secret in it and how not to, a row each, the same
size; each button slow-plays saving the box (six seconds); `<form> <not secret> <secret> <save> <stale> <fail> dom:
<mirror of secret text> <ok/err @ locale time[: err text]></form>`; non-React JavaScript in the page that fishes the
value out of the DOM; a form library as a dependency, anything goes for the dojo.

The main deliverable, the table of where the secret was for each row and button, is in
[dojo-findings.md](dojo-findings.md), *Where each Forms row keeps the secret*; what the library made awkward is that
file's items 11 to 14.

* **Built** (all in `demos/safebyok-demo-dojo`):
  * `src/components/forms/`: `FormsTab`, one file per row, and `RowParts` (the three submit buttons, the mirror, variables
    and result cells). Every row is a CSS grid of the same columns and height (`form.formrow` in `styles.css`).
  * `src/lib/refusing-vault-db.ts`: `holdNextWrite(meanwhile?)` holds the next write for `holdMs` (6000; the tests set
    400), running `meanwhile` as the hold begins. `scenarios.disarm()` forgets a hold too.
  * `src/lib/form-outcomes.ts`: `armOutcome` (save: hold; stale: hold, with a box written elsewhere meanwhile; fail:
    hold, then refuse), called from each button's `onClick`, before the submit; `RowOutcome` and `outcomeNow`.
  * `src/lib/elsewhere.ts`: a second `Device` of the page's user, over its own `IdbVaultDB`, made once, unlocked with the
    fixture's passphrase, that writes the stale box.
  * `src/lib/mirror.ts`, started by an inline module script in `index.html`: every 200 ms, for each `input[data-secret]`,
    writes `value: "…" | attribute: …` into its form's `[data-mirror]` cell with `textContent`, only when it changed.
  * `App.tsx`: a Forms tab between New Box and Inspect. README: a Forms paragraph.
  * Tests: `tests/components/forms/FormsTab.test.tsx`, one per row per button, asserting the mirror during the hold and
    the mirror and result after, and a few more (see the rework below).
  * Dependency: `react-hook-form` ^7.92.0 (runtime, the private dojo only; 7.92.0 released 2026-11-11, past the
    seven-day floor).
* **Decisions made**:
  * **Stale is a real second device writing during the hold**, so the store refuses for real and the watch then tells
    the page; the approaches set aside are dojo-findings' item 14.
  * **The arrangement happens on the button's click**, synchronously, before the submit event: no row knows about it.
  * **The `onSubmit` rows reset themselves once stored** (`form.reset()`, `reset()`), since React never resets an
    `onSubmit` form: plain code a host would copy. The controlled row empties its state.
  * **The mutation handed the form is `putBoxMutationOptions` exactly as its docs show** (`<form action={(form) => {
    put.mutate(form) }}>`); the TanStack row a host might choose is its own `mutationFn`, reading the form through a ref.
  * **The recommended row reads `put?.err` from the closure** in `onReset`; no ref was needed (tested).
  * **The result shows `toLocaleTimeString()`**, seconds included, so two presses in a minute differ; pending reads
    `saving…`. The buttons are disabled while a save is pending.
  * **A page checkbox switches every password input to `type="text"`**, to check the attribute finding for both types.
* **Deviations**:
  * App.tsx: one changed line, not only added ones: the `TabTitles` object gained `forms`.
  * `refusing-vault-db.ts` and `scenarios.ts` (outside the brief's list of files) gained lines; the class keeps its name.
* **Discoveries**: in dojo-findings.md, *Where each Forms row keeps the secret* and items 11 to 14.
* **For the Coach**:
  * **Not looked at in a real browser**: there is none here. The dev server starts and serves every new module and the
    inline mirror script (curl), and the build passes.

## Reworks

The two reworks after review, what they changed and why, are in
[thread-4-dojo_forms-reworks.md](thread-4-dojo_forms-reworks.md): read it before reworking the Forms tab again.
