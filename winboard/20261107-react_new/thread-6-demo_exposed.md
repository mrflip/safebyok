# Thread 6: demo, exposed whisper (2026-11-07)

Branch `20261107-demo_exposed`, PR [#588](https://github.com/mrflip/safebyok/pull/588), stacked on [#587](https://github.com/mrflip/safebyok/pull/587). Justify: green; the demo 78 passed (13 new), every other package unchanged.

* **Built**:
  * **`KnockKnockExposed`** (`demos/safebyok-demo-react/src/components/KnockKnockExposed.tsx`), flow 2: `useBox('main', 'anthropic_api_key_exposed')` + `useWhisper(box)`, a controlled password input of `apiKey` (a string, else `''`). Typing is `box.patchWhisper({ apiKey })`, *Save* is `box.putExposed()`, *Done* is `box.unexpose()` through `perform` (clears "Saved."), and an effect's cleanup runs `box.unexpose()` at unmount. *Add key*/*Edit key* exposes from a click only. The field is disabled while the box does not show.
  * **Shared code**, so neither flow copies the other: `src/lib/saved-api-key.ts` (`ApiKeyVaultlabel`, `FieldsApiKeyBoxlabel`, `ExposedApiKeyBoxlabel`, `extractSavedApiKey(vault, boxlabel)`, the knock's extractor: unlock, `vault.getBox(.., { ifAbsent: 'nil' })`, `extractWhisper()`, so the saved key and never the working copy; and `ensureApiKeyBoxExposed(bank, boxlabel)`, the Edit flow of thread 5) and `src/hooks/useIsShowing.ts`. `KnockKnockFields` now uses all three.
  * `App.tsx`: `<KnockKnockExposed />` beside `KnockKnockFields` in the flows div; nothing else touched. README line added. Empty changeset.
  * **Tests** (`tests/components/KnockKnockExposed.test.tsx`): add, StrictMode, save encrypted, Done and Edit, unsaved edit dropped on Done, unexpose at unmount, knocks (saved key; saved key over an unsaved edit, which stays in the field; after a lock), knock before saving, cancel, and both flows on one page keeping separate keys (each knock sends its own). `App.test.tsx` scopes its Add key clicks to the managed-fields region, as the label is now on the page twice.
* **Decisions taken**:
  * A box per flow, per the review ruling; the extractor and edit flow take the boxlabel.
  * Shared the extractor and edit flow in a lib file rather than duplicate (the handoff asked for it).
  * A *Done* button, though the note's twelve lines do not have one: without it nothing but unmount hides the key.
* **Deviations**: none; no `eslint-disable` or `@ts-expect-error`.
* **Discoveries**:
  * **Both flows on the page**: each keeps its own key in a box of its own (`anthropic_api_key_fields`, `anthropic_api_key_exposed`, one vault, `main`), so the three ways compare side by side and typing or saving in one leaves the other untouched. Review found that one shared Box let a Save in one flow seal the other's stale key under "Saved."; the orchestrator ruled a box per flow (demo only). Thread 7 (`KnockKnockSealed`) adds a third.
  * A StrictMode simulated unmount at first mount cannot hide a key: exposure only happens from a click after mount.
  * `useWhisper` returns an index-signature object (`noPropertyAccessFromIndexSignature`), so the component destructures `{ apiKey }`.
* **For the Coach**: see the proposals in the PR's open questions.

## Open matters

* **`useExposedWhisper(box)` in safebyok-react**: recommend a thread after the sprint; `useBoxIsShowing` first as the small step.
* **Holder count for exposure**: accepted as is; recommend leave.
