# Thread 6: demo, exposed whisper (2026-11-07)

Branch `20261107-demo_exposed`, PR [#588](https://github.com/mrflip/safebyok/pull/588), stacked on [#587](https://github.com/mrflip/safebyok/pull/587). Justify: green; the demo 78 passed (13 new), every other package unchanged.

* **Built**:
  * **`KnockKnockExposed`** (`demos/safebyok-demo-react/src/components/KnockKnockExposed.tsx`), flow 2: `useBox('main', 'anthropic_api_key')` + `useWhisper(box)`, a controlled password input of `apiKey` (a string, else `''`). Typing is `box.patchWhisper({ apiKey })`, *Save* is `box.putExposed()`, *Done* is `box.unexpose()` through `perform` (clears "Saved."), and an effect's cleanup runs `box.unexpose()` at unmount. *Add key*/*Edit key* exposes from a click only. The field is disabled while the box does not show.
  * **Shared code**, so neither flow copies the other: `src/lib/saved-api-key.ts` (`ApiKeyVaultlabel`, `ApiKeyBoxlabel`, `extractSavedApiKey(vault)`, the knock's extractor: unlock, `vault.getBox(.., { ifAbsent: 'nil' })`, `extractWhisper()`, so the saved key and never the working copy; and `ensureApiKeyBoxExposed(bank)`, the Edit flow of thread 5) and `src/hooks/useIsShowing.ts`. `KnockKnockFields` now uses all three.
  * `App.tsx`: `<KnockKnockExposed />` beside `KnockKnockFields` in the flows div; nothing else touched. README line added. Empty changeset.
  * **Tests** (`tests/components/KnockKnockExposed.test.tsx`): add, StrictMode, save encrypted, Done and Edit, unsaved edit dropped on Done, unexpose at unmount, knocks (saved key; saved key over an unsaved edit, which stays in the field; after a lock), knock before saving, cancel, and both flows on one page. `App.test.tsx` scopes its Add key clicks to the managed-fields region, as the label is now on the page twice.
* **Decisions taken**:
  * Shared the extractor and edit flow in a lib file rather than duplicate (the handoff asked for it).
  * A *Done* button, though the note's twelve lines do not have one: without it nothing but unmount hides the key.
* **Deviations**: none; no `eslint-disable` or `@ts-expect-error`.
* **Discoveries**:
  * **Both flows on the page**: the Box is one object, so *Add key*/*Edit key* in either shows the key in both fields (the managed field fills, the exposed one reads it from `useWhisper`); typing in the exposed flow shows live in the managed field (a test pins it); *Save* in either stores whatever is in the working copy, whichever field was typed in; *Done* in either hides both. The leaving flow's unmount unexpose hides it for the other too. Accepted per regressions.md.
  * A StrictMode simulated unmount at first mount cannot hide a key: exposure only happens from a click after mount.
  * `useWhisper` returns an index-signature object (`noPropertyAccessFromIndexSignature`), so the component destructures `{ apiKey }`.
* **For the Coach**: see the proposals in the PR's open questions.

## Open matters

* **`useExposedWhisper(box)` in safebyok-react**: recommend a thread after the sprint; `useBoxIsShowing` first as the small step.
* **Holder count for exposure**: accepted as is; recommend leave.
