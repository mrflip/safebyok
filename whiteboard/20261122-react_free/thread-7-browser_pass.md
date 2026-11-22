# Thread 7: browser_pass (2026-11-22)

Branch `20261122-browser_pass`, PR [#838](https://github.com/mrflip/safebyok/pull/838), stacked on [#836](https://github.com/mrflip/safebyok/pull/836). Proved: both new demos and the old one walked in headless
Chromium 159 (Playwright 1.65.1), against each demo's `vite` dev server at 14cc583e6; `pnpm justify` green (7,423
tests, at 3272f9d76). Nothing broke that is a demo's bug to fix; the one code change is a test fix, below.

* **Built**: this walk-through, and the scripts that make it, in [thread-7-browser_pass/](thread-7-browser_pass/).
  `setup.sh <workdir>` installs Playwright, Chromium and the libraries it lacks into the workdir; `run.sh <workdir> kk.mjs`
  runs one walk against a running dev server (`kk`, `kk2`: Knock-Knock on 5181; `en`, `en2`: Envman on 5182; `rd`: the
  old demo on 5183). Each step leaves a screenshot, an aria snapshot and the console log in `<workdir>/shots/<app>/`.
  This pass's are in `/tmp/claude-1000/-workspace-byok/828c4c83-c086-432c-ab49-a8ff67ebb6d7/scratchpad/browser_pass/shots/`,
  until that scratch is cleared.
* **Method**: a fresh browser context for each script (empty localStorage). A MutationObserver logs every change to the
  key card's text (Knock-Knock) or the list's text (Envman), with milliseconds, so a blank moment would show as a line in
  the log. A refused write is provoked by making `Storage.prototype.setItem` throw `QuotaExceededError`.

## Knock-Knock (`demos/safebyok-demo-knockknock`)

1. Landing: "Sign in to start. Any username will do: there is no password." Username box, Sign in.
2. Username `Bob!`: alert "A username is 2 to 40 lowercase letters, digits and underscores, starting with a letter." Shown, not thrown.
3. Sign in as `alice`: "Create your vault", with visible labels "New passphrase" and "Confirm passphrase", each with Show.
4. Short or mismatched passphrase: "A passphrase needs 12 characters or more…", "The passphrases do not match", Create vault disabled.
5. Strong passphrase: "Strong enough", "The passphrases match". Create vault showed "Creating…", then went straight to unlocked.
6. Unlocked page: Lock; Knock form disabled with "Save your Anthropic API key below, then knock."; "No key saved yet."; Ways in (Replace passphrase, Add passkey), visible labels.
7. Save key: the button showed "Saving…". Then "Saved key: sk******************wxyz", Show, Delete, "Replace key"; the input was emptied.
8. Show: the key in clear, `data-revealed="true"`, `aria-pressed="true"`, button reads Hide. Hide: the mask again.
9. Knock "Lettuce": button "Knocking…", then alert "Anthropic refused that API key. Check it and save a fresh one." Console: only the browser's `401` resource line.
10. Lock: "Your vault is locked", with a visible "Passphrase" label. The key card went from `sk…wxyz` straight to the sidecar mask `sk**********************`, no step between (log: 2 lines).
11. Show while locked: the unlock dialog opened ("Unlock your vault"). Escape closed it.
12. Knock while locked: the dialog asked; unlocked there, and the knock went on to the same refusal alert.
13. Show while locked, wrong passphrase in the dialog: "That is not the passphrase." Right one: the dialog closed and the key showed in clear.
14. Knock while locked, then Cancel in the dialog: the dialog closed and nothing was said (no alert).
15. Reload while locked: "Looking for your key…" for 2 ms, then the mask. No blank.
16. Unlock form, wrong passphrase: "That is not the passphrase." Right one: unlocked.
17. Refused save (setItem throws): alert "The vault's storage could not be reached, or failed partway: try again shortly. The storage adapter's own error is this error's cause." (the developer sentence is known). The input was emptied (no texts to refill: the key is its one field).
18. Delete: "No key saved yet." A reload, locked, still says so.
19. Sign out reloads to the sign-in; signing in as `bob` again finds the vault locked with its mask.

Console across the walk: React DevTools' info line on each load, and the 401 of each knock. No warnings, no errors from the app.

## Envman (`demos/safebyok-demo-envman`)

1. Landing as Knock-Knock's. Username `Dave!`: the same alert, and the box still says `Dave!` (refilled).
2. Sign in, create the vault: as Knock-Knock, "Creating…", then unlocked.
3. Unlocked page: Lock; "No secrets yet."; Add a secret, with Title, Description, "Rotate every [90] days", "Last rotated [ ] (blank for today)", Value with Show.
4. Add OPENAI_API_KEY with a description and a value: "Adding…", then a row with title, gear, description, "Rotate every 90 days. Last rotated 2026-11-22.", mask `sk******************9876`, an empty value box, Save and Undo disabled. The add form went back to blank, period 90.
5. Value Show in the add form: the box turns to text; Hide back.
6. Reveal: focusing the row's value box turns it to text and fills it with the value. Blurring empties it again.
7. Edit the value: Save and Undo enabled. Save: mask `sk…1111`, the box emptied, both disabled again.
8. Gear: dialog "Settings of OPENAI_API_KEY" with labelled Title, Description, period and Last rotated, filled from the row; Done, Cancel.
9. Period `2.5`, Done: the browser's own number check holds the form, so the app shows no alert.
10. Description, period 30, last rotated 2026-01-15, Done: the dialog closed and the row showed the new settings, red "Overdue for rotation", Save enabled.
11. Save: kept, `class="card env overdue"`.
12. Cancel and Escape in the dialog: closed, nothing changed.
13. Undo: a typed value and a description from the dialog, then Undo: both gone, the stored description back, Save and Undo disabled.
14. Lock: the mask went from `sk…1111` straight to `sk**********************` (log: 2 lines), and the box shows `••••••••`. A value typed before the lock is gone after it (the demo's `draft.discard` on lock).
15. Reload while locked: "Looking for your secrets…", "Loading…" (2 ms), then the row with its mask. No blank.
16. Focus the value while locked: the unlock dialog. Unlocked there: the dialog closed, focus back on the value box, the value in it.
17. Lock, then unlock with the form: unlocked.
18. Refused Save (setItem throws): the row's alert says the storage sentence; the box is emptied, as its comment says.
19. Refused Add: the add form's alert, with Title and Description refilled and the value blank (`secretFieldnames: ['val']`).

Console across the walk: DevTools' info line only.

## The old demo (`demos/safebyok-demo-react`, on safebyok-big)

It still builds and typechecks. Walked the landing page only: sign in as `erin`, the "Choose a vault passphrase" dialog,
Create vault, save a key ("Saved."), Show and Hide, knock (the refusal alert "…save a fresh one below."), Lock from the
account strip, Unlock in its dialog, reload (locked, "A key is saved."). All worked; console as above. One flicker: half
a second after Create vault, the account strip still showed a "Create vault" button beside Lock (`shots/react/03-vault-created.png`),
gone a second later. safebyok-big is frozen, so I left it.

## Discoveries

* **A refused write in the demos' localStorage vaultDB is half made.** `LocalStorageVaultDB` writes the memory vaultDB
  first and saves to localStorage after, so a throwing `setItem` refuses a write the memory store has already taken:
  after step 17 (Knock-Knock) the mask shows the refused key's tail, and after Envman's refused Add the new row is in the
  list *and* the form is refilled, so a second Add would make a twin. A reload drops both. Only seen under the injected
  fault; the cheat stands until a browser vaultDB exists (idb_lean). Recorded, not fixed.
* **The demos' own fields have no visible label**: Username, "Who's there?", the API key box, Envman's Title, Description,
  Value and each row's value box rely on `aria-label` and a placeholder. The kit's forms all have visible labels.
* **"Any username will do"** sits beside a sign-in that refuses `Bob!`. The refusal says why, but the line overpromises.
* **A flake in `packages/safebyok-react-lean/tests/giver/react-giver.test.tsx`**, "resolves a refusal as its error, and
  never rejects", red on CI's node-compat (26) at 751a544a4 while `pnpm justify` was green locally. The KeyEditor
  harness sets `seen.result` in a `useEffect`, after the render that shows the `Refused` output `findByText` waits on,
  so the test could read `seen.result` as null. Fixed at the orchestrator's word (below).

## Deviations

* **The browser's libraries** came from deb.debian.org as 15 bookworm arm64 .debs, each checked against the Packages
  index's SHA256 (the index checked against Release), unpacked with `dpkg -x` into scratch, and loaded through
  `LD_LIBRARY_PATH`: the orchestrator's call, after my first `blocked` report. Nothing outside scratch was changed.

* **The react-giver flake, fixed** (3272f9d76, test-only), at the orchestrator's word. The orchestrator named the one
  test; every test of both editors that reads `seen` after a rendered `Saved` or `Refused` had the same race (the
  mutation editor's `seen.put` is set in an effect too), so all eleven wait on `seen` instead, through `resultOf` and
  `settledPutOf`. Shown: with each harness effect slowed by a 50 ms `setTimeout`, 12 of the 27 `putBox` tests failed
  before (the named one with CI's `Cannot destructure property 'err' of 'seen.result' as it is null`), and one after:
  "runs offline and never retries", which reads `seen.options` straight after an `await act(...)`, and `act` flushes
  effects, so it has no race without the artificial delay. Left as it was.

## For the Coach

* The three discoveries above: does any deserve a fix? I would leave the half-made refusal to idb_lean's vaultDB, and
  leave the labels and the username line alone unless your own run found them wanting.
