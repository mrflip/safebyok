# Thread 10: demo_envman (2026-11-21)

Branch `20261121-demo_envman`, PR #807, stacked on #806. Proved: `safebyok-demo-envman` lint, typecheck, test (3 files,
18: the app's integration test 5, `local-vault-db` 4, `session` 9); `safebyok-react-lean` lint and typecheck. `pnpm justify`
green after the catch-up onto #806's tip (bad537cb6). Nobody has clicked through the page in a real browser.

* **Built**
  * **`demos/safebyok-demo-envman`**, a package of its own. Shell copied with `cp` from Knock-Knock (configs,
    `index.html`, `tests/setup.ts`, `main.tsx`, `styles.css`, `local-vault-db.ts`, `session.ts`, `useSession.ts`,
    `form-text.ts`, `SessionBar.tsx`, `App.tsx`, and the `session` and `local-vault-db` tests), its localStorage keys
    under `envman:` (vault and session); `pnpm demo:envman` at the root. No passkey ways in, no Anthropic.
    * `src/lib/sok.ts`: `SOK = reactGiver({ banks: { envman: { vaultDB } }, keyDeriver, strengthChecker })`, `Envman`.
    * `src/lib/env-sidecar.ts`: the stored sidecar, `{ title, description, rotation_period_ms, last_rotated_at, mask }`;
      `envSidecarOf` (a missing or mistyped field reads empty, rotated at 0, period 90 days), `isOverdueAt`,
      `newEnvLabel` (`env_` + 32 hex), `valMaskOf` (the one call of `maskOf`, `{ head: 7, tail: 0 }`), the date-input helpers (UTC days).
    * `src/lib/env-form.ts`: `envFieldsOf(form, blankRotatedAt)`, the sidecar fields both forms read, throwing a gripe.
    * `src/components/EnvmanPage.tsx`: the stage switch; `Opened` renders locked and unlocked alike (list always; Lock
      or the unlock form; the add form only unlocked). `UnlockDialog` mounted at every stage.
    * `EnvList` (`useBoxList`), `EnvRow` (`useBox`: null renders nothing, undefined "Loading…") and its `EnvEditor`
      (`useDraft`: title, description, period, last rotated, red with "Overdue for rotation", `ValInput`, Save and Undo,
      the gear). Save is a `useMutation` over `draft.put({ sidecarOf })`, stamping `last_rotated_at` and a fresh mask
      when `isWhisperDirty`.
    * `ValInput.tsx`: the one place the masked value shows: `draft.whisperField('val')` on a plain input, its
      placeholder the stored mask (the draft's own `••••` where no mask is stored). Thread 12 swaps this.
    * `EnvSettingsDialog.tsx`: the gear's dialog (title, description, period, last-rotated day). Done calls
      `draft.setSidecar`; the row's Save writes it, Undo drops it.
    * `AddEnvForm.tsx`: `useActionState` over `addEnvAction`, which makes `Envman.putBoxAction(newEnvLabel(), AddEnvOpts)`
      per submit and runs it.
  * **`ModalDialog` exported from `safebyok-react-lean/kit`** (pulled in, not in the plan): the gear's dialog is the
    kit's, rather than a second copy of `showWhileMounted` in the demo. Its file's first line no longer says "private".
  * **Integration test** (`tests/components/App.test.tsx`), Knock-Knock's harness: add two (one back-dated by the add
    form), reload and see both, red where overdue; focus reveals, Undo masks unchanged; Save a new value stamps today,
    clears the red, survives a reload; the gear renames and back-dates, red before Save, kept after a reload; focusing a
    value on a locked vault opens the dialog, and the value shows after the unlock. Each searches the tree and the
    QueryClient for every value and the passphrase.

* **Decisions made**
  * **The gear stages into the draft** (`setSidecar`), and Save writes: one Save/Undo per row for every edit, and the
    red shows the draft's sidecar, so a back-date shows red before it is saved. Set aside: the dialog putting through
    its own `sidecarOf`, which would also write any value typed but not yet saved.
  * **The add form's action is made per submit**, so each new secret gets a fresh label, rather than a module-scope
    action bound to one label, or a hand-written action over `putBoxOnce` (which would redo `putBoxAction`'s emptying
    of the form and its never-reject).
  * **The mask is stored** (`mask`, `tail: 0`), as the orchestrator's note allows, so a locked row tells secrets apart.
  * **"Now" is when the row was first shown** (`useState(Date.now)`): no clock in render, no ticking hook. A row open
    past its due day turns red at the next reload; the README says so.
  * **Last rotated is a day** (a date input, UTC midnight); blank in the add form means now.
  * **No delete**: not asked for. Nothing built beside the giver's hooks; envman needed none of `useBoxes`, a revisor, or `editBox`.

* **Discoveries**
  * **Wait on Undo, not Save, for a draft's write to land**: Save is disabled while pending as well as when clean, so a
    test waiting on it can reload before the write. The first justify caught this; the test now waits for Undo to disable.
  * Every hook the handoff named worked as described the first time; the only giver-side change was the export.
  * `maskOf`'s schedule takes both `head` and `tail`: `{ tail: 0 }` alone does not typecheck, hence `{ head: 7, tail: 0 }`.
    Thread 12's `mask` swap goes through `valMaskOf` alone.

* **For the Coach**
  * **Hand run**: the page builds and the flows pass under jsdom; recommend a click-through before showing it.
  * **Overdue as of first render**: fine for a demo? A live clock would be a small `useSyncExternalStore` over a minute timer.
