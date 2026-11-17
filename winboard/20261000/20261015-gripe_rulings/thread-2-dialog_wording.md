# Thread 2: dialog_wording (2026-10-15)

Branch `20261015-dialog_wording`, PR [#91](https://github.com/mrflip/safebyok/pull/91), stacked on #83. Justify: green (react 53 tests, core 868, convex 268, demo 124).

* **Built**: `PassphraseModal`'s window line (`packages/safebyok-react/src/passphrase-modal.tsx`) reads "Locks again on this device in 7 days" through `new Intl.RelativeTimeFormat(Locale, { numeric: 'always', style: 'long' })`, with today's unit choice (whole days, else hours, else minutes, at least one minute), from `vault.reentryWindowMs`. While the dialog creates the vault (state `absent`) it reads "Locks on this device in 7 days", with no "again". `ForeverMs` or longer reads "Stays unlocked on this device until you lock it." Tests cover both phrasings; the react README and a patch changeset say it.
* **Decisions taken**:
  * `numeric: 'always'`, so one day is "in 1 day", never "tomorrow".
  * The window line is two whole sentences, "Locks on ..." while creating and "Locks again on ..." otherwise, never a spliced fragment, for the i18n thread. The locale is one module constant, `Locale = 'en'`, for the relative phrase; the sentence frames are still English literals for the i18n thread.
  * No fallback where `Intl.RelativeTimeFormat` is missing (dropped on review): the fallback relied on `Intl.NumberFormat`'s unit style, which every engine gained after `RelativeTimeFormat`, so on a platform without RTF it threw `RangeError` and could never run successfully. (A syntax target such as es2022 guarantees no `Intl` API; that was not the reason.) The dialog is DOM-only markup, so React Native is not a platform for it. The first version's fallback and its `counted()` helper are gone.
  * `windowCount` splits the unit choice out of `unlockedFor`.
* **Discoveries**: `Intl.RelativeTimeFormat` has no grouping option, so a window just under `ForeverMs` reads "in 288,000,000,000 minutes" with separators; the edge-case test allows commas. Recorded for honesty only.
* **For the Coach**: nothing; commits use the `client:` prefix PROCESS.md names for `safebyok-react` (the first commit's `react:` stands, since it was pushed).
