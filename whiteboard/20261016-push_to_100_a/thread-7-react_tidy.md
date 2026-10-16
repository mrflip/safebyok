# Thread 7: react_tidy (2026-10-16)

Branch `20261016-react_tidy`, PR [#129](https://github.com/mrflip/safebyok/pull/129), cut from
`main` (`f63bd915`). Justify: green at every package (react 158, demo 176 + 15 skipped, core
1612 + 33 skipped); `pnpm size` within every existing budget.

* **Built**:
  - `safebyok-react/src/messages.ts`: every word a user reads (dialog, passkey button and its
    condition messages, whisper field), frames as functions, `Locale = 'en'`.
  - `PassphraseModal`: a modal `dialog` (on the scrim, named by its heading, Escape cancels and
    stops propagation); the error line a live region mounted from the start; subscribes through
    `useSyncExternalStore`; keyed by its vault handle (`useRoundFor`, `boundary.tsx`); passkey
    first, with focus; focus check reads the form's own root (shadow DOM); one
    `Intl.RelativeTimeFormat` per locale, made at first use and assumed present (the Coach);
    far future is `>= ForeverMs - MinuteMillis`; `allowStartOver` (ask first, `vault.destroy()`,
    then "Choose a vault passphrase").
  - `PasskeyUnlockButton`: subscribes, keyed by handle, `onGripe(null)` as each press begins,
    `autoFocus`.
  - `VaultProvider`: each dialog keyed by the vault the action ran against (`ranOn`), the
    snapshot read when a dialog would open, a warn-once for a `logger`/`clock` changing identity,
    `allowStartOver`, `eraseDamagedVault` reopening only on `stale_write`.
  - `WhisperField` (React) over `WhisperFieldAttributes` (`safebyok/utils`); `parseLogger`
    exported from `safebyok`.
  - Demo: `keepStorage()` on the sign-in click, a "lives only in this browser" line,
    `TroubleBoundary`, `allowStartOver`, `asksAgain` ("never asks again"), the saved flash,
    `WhisperField` for the key, the attributes on the dashboard's textarea, `createAuth`'s clock
    check, and a jsdom click-through of the dialog in `tests/App.test.tsx`.
  - README sections: *Starting over*, *The dialog's words*, *Entering a whisper*, *Revealing a
    whisper*. Three `notes/security.md` entries.

* **Rows** (for the sweep):
  - **Closed**: G321 (no prop; README *React reports it to you* stands), G322 (code, README),
    G323's *now* half (`messages.ts`; real locales stay NOT YET), G324's wording half (code,
    README; the `Millis` half is thread 3's), G325 (tests, both wordings), G326 and G327 (code,
    tests), G328 (the second race fixed; the first, a `lock()` between unlock and retries, right
    as built: `withUnlockedVault`'s doc block and a test), G329, G331, G332 (code, tests), G330
    (right as built; the README's `useVault` bullet already says it), G333 (code and test:
    pulled forward, below), G334 (README *Revealing a whisper*), G358, G359, G360 (demo, tests),
    G357 but its fifth point, and the entry-field items of `whiteboard/20261015-push_to_100/`
    (named `whisper_text`, the attributes, show/hide, passkey first, exported from
    `safebyok/utils`).
  - **Not closed**: G357's "blank note clears" point: the note dies in thread 2 (G023), so it
    is moot there, not here. The note's "do we offer a hint?" (opened, below).
  - **Opened**: "do we offer a hint?" (built default: no hint; I read it as "a hint under the
    whisper field", and a host's `placeholder` covers the common case). The polyfill question
    the preplan opened is answered by the Coach and closed: we assume `Intl.RelativeTimeFormat`,
    add no dependency, and the README tells a host on Hermes or an older engine to import
    `@formatjs/intl-relativetimeformat` with its locale data. Still open with the Coach, through
    the orchestrator: an uncontrolled `WhisperField` (below). **Answered**: proceed (the Coach,
    2026-10-16); built in thread 14, both fields, with the reveal toggle kept.

* **Decisions taken**:
  - `Intl.RelativeTimeFormat` is assumed, at the Coach's word on filing: no presence check, no
    fallback, no warning. On an engine without it the dialog's boundary shows its trouble notice.
  - G322's warning needs the console when the host passes no logger, and `src/` may reach it only
    through the core's fallback: so `parseLogger` is exported (fallback and guard in one).
  - The dialog role goes on `.modal-scrim` (Bootstrap's pattern): a `form` may not carry
    `role="dialog"`, and wrapping it would move `.modal`'s grid off the fields hosts style.
  - `allowStartOver` is opt-in on both `VaultProvider` and `PassphraseModal`: it erases every
    lockbox, and a vault with a second way in may not want it.
  - `onGripe` widens to `string | null` (null as a press begins), which clears a stale gripe and
    lets the live region announce a repeated one.
  - `WhisperFieldAttributes` are spelled as React props with text values: React spreads them
    without warnings, and `setAttribute` lowercases the names in an HTML document.

* **Deviations**:
  - **G333 pulled forward from thread 4**: the provider change is one line (`stale_write` only),
    so the test runs for real instead of an `it.todo`. Thread 4 can strike it; at the restack its
    identical edit should merge or resolve trivially.
  - The far-future rule uses local `MinuteMillis` constants (`passphrase-modal.tsx`, the demo's
    `lib/asks-again.ts`) and main's names (`ForeverMs`, `reentryWindowMs`, also in the React
    tests' `TH.stubVault`). At the restack onto thread 3, import its `MinuteMillis` and take its
    names; thread 3's own edit of the same line collapses into `unlockedFor`'s.

* **Discoveries**:
  - The fake vaults in the React tests returned a fresh snapshot object per call; with
    `useSyncExternalStore` that loops. `TH.stubVault` keeps one snapshot, as a vault does.
  - React reuses sibling buttons across a ternary's two branches by position, so `autoFocus` on
    the swapped-in one never fired; the two button rows are keyed.
  - Suppressions added, each with its reason inline: `jsx-a11y/no-autofocus` (passkey button,
    the modal's passkey line, "Keep it", one test) and
    `jsx-a11y/no-noninteractive-element-interactions` (the dialog scrim's Escape). No
    `@ts-expect-error`, no `any`.

* **Review** (thread-reviewer, `fixed`): three commits on the start-over path, each with a
  test -- a `stale_write` erase now ends the question, a vault turning absent ends it, and
  "Erase and start over" waits for its erase (no double destroy). Folded in at filing: minor 1,
  React 19 copies a controlled input's value into its `value` attribute, so a whisper typed into
  `WhisperField` is in `outerHTML` (README *Revealing a whisper*, `notes/security.md`, a test
  pinning it; the uncontrolled option is with the Coach, not built); minor 6, the formatter
  made once per locale. The review's other minors are left as the reviewer reported them: their
  text went to the orchestrator, not to this worker, so they are not restated here.

* **For the Coach**:
  - `autocomplete="new-password"` (your list) stops autofill of saved passwords, but Chrome may
    offer its password generator on such a field. Keep it, or drop that one attribute?
    **Answered** (the Coach, 2026-10-16: two fields, two jobs): the whisper field turns autofill
    and generators away (`autocomplete="off"`); the passphrase field invites managers. Built in
    thread 14.
  - The provider no longer reopens on `bad_option` per the ruling, though from the provider a
    "reads sound now" refusal is a race, not misuse; `retryOpen()` mends it.
  - Size: no `safebyok-react` line in `.size-limit.json` (thread 8 adds it). Measured with
    `react` and `safebyok` external: everything 4,554 B, `{ VaultProvider }` 4,034 B,
    `{ WhisperField }` 974 B; by PROCESS.md's rule, everything's budget is **6.9 kB**.
  - Not done: a real screen reader, real shadow-DOM hosting, a real browser (G356 stays).
