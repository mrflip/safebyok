# Thread 6: dojo_scenarios (2026-11-23)

Branch `20261123-dojo_scenarios`, PR #864, stacked on #862. Proved: the dojo's lint, typecheck, build, and its tests, 71
passed, 16 of them the Scenarios tab's. `pnpm justify` left to the orchestrator, as
the handoff asks.

* **Built**: a Scenarios tab (`demos/safebyok-demo-dojo/src/components/scenarios/`), with two forms and a checklist
  beside each, one row for each claim in the Coach's sentences (`claims.ts`), and a test for each claim
  (`tests/components/scenarios/ScenariosTab.test.tsx`).
  * **Envman** (`EnvmanForm.tsx`): Hero's stored box `github` on `useDraft`. The username (sidecar) is a controlled
    input over `draft.sidecar`; the password (whisper) is `draft.whisperField('password')`, kept read-only by the host
    until a double click or the quill; an eye that focuses or blurs the field; Save (`draft.put()`), or a save when
    either field loses focus, behind a checkbox on the tab; a log of saves under way and how the last four ended.
  * **API key** (`ApiKeyForm.tsx`): the Forms tab's row 1 (a form Action on `putBoxAction`, `onReset` cancelled on a
    refusal), with a `WhisperInput`, and the box stored shown beneath by `WhisperMask` (`tail: 4`; the sidecar keeps
    `mask(…, { tail: 0 })` for a locked bank).
  * Each form has the Forms tab's mirror cell (`MirrorCell`, and `src/lib/mirror.ts` unchanged). Two buttons arm the
    vaultDB to hold the next write or refuse it. `App.tsx` mounts the kit's `UnlockDialog`, which a draft's `put` and
    reveal need on a locked bank.
* **Findings**: the claim table, what was tried, and items 18-27 of the library's list are in `dojo-findings.md`, a
  section of their own at its end. In short: eight claims work, six work with something odd, and E9 cannot today (the
  review's mark). The weightiest finding: `put` starts the draft again from the box stored when it lands, so typing done
  during a save is lost, and a focused field is emptied under the user.
* **Decisions made**:
  * The envman box is the fixture's `github` (sidecar `username`, whisper `password`), not a new env-var box: remaking
    the fixture rewrites every row of `fixture.json`, and the sibling thread builds from the same tip.
  * The eye reveals in the field itself, through the focus, since `useDraft` binds its reveal to focus and has no other
    call. Its `mousedown` is cancelled so the press does not blur the field first; so is the quill's.
  * Save is disabled while the draft is clean, as `useDraft`'s example has it, and is not disabled while a save runs
    (the draft gives no pending state, and the example does not), so a double press shows what the library does.
  * Save on blur hides the Save button, the dojo's choice and not the Coach's words, and saves only a dirty draft.
  * The eye's dead press after a lock is left as a plain host would write it (one `blur()` before the `focus()` would
    hide it), and reported.
* **Set aside**: `WhisperText` for the eye (it shows the text in a span beside, not in the field); the parts'
  `useRevealToggle` (not exported, and it toggles `type` only, while a draft's masked field is empty); a new fixture box;
  keeping typing across a save (would need a host-side diff of the draft: machinery).
* **Deviations**: `App.tsx`'s `TabTitles` line changes (one line; the rest are added lines). The sibling thread adding a
  tab will meet the same line. `styles.css` gains three lines at its end.
* **Discoveries**: a draft's `put` on a locked bank waits for the unlock form, and nothing in the dojo showed one until
  this thread mounted `UnlockDialog`. jsdom moves no focus on a click, so the tests focus and blur around each press as a
  browser would; the tab-switch case can only be reasoned about without a browser.
* **For the Coach**: nobody ran either form in a real browser; the machine has none. The readings taken of the
  sentences are listed under the claim table in `dojo-findings.md`.
