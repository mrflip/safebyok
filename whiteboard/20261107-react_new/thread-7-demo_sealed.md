# Thread 7: demo, sealed key (2026-11-07)

Branch `20261107-demo_sealed`, PR (see below), stacked on [#588](https://github.com/mrflip/safebyok/pull/588). Justify: green; the demo 98 passed (20 new), every other package unchanged.

* **Built**:
  * **`KnockKnockSealed`** (`demos/safebyok-demo-react/src/components/KnockKnockSealed.tsx`), flow 1: an uncontrolled `WhisperField` in a `<form>`; submit reads `FormData` `whisper_text`, then `bank.ensureVault` -> `vault.ensureUnlocked()` -> `vault.putBox({ boxlabel, whisper: { apiKey } }, { ifAbsent: 'add', ifPresent: 'repl' })`, then `form.reset()` clears the field. No `expose`, no `useWhisper`. `useBox` answers only presence ("No key saved yet." / "A key is saved."). The knock is `extractSavedApiKey(vault, SealedApiKeyBoxlabel)`.
  * `SealedApiKeyBoxlabel = 'anthropic_api_key_sealed'` in `src/lib/saved-api-key.ts`; the component is placed in `App.tsx`'s flows div; README paragraph; empty changeset.
  * **Tests**: `tests/components/KnockKnockSealed.test.tsx` (field before any Save; saved encrypted in a box of its own; field cleared; saved-state text; StrictMode save; empty Save asks and builds no vault; second Save replaces; knocks; knock after a lock; never exposed; knock before saving; cancel stays quiet and keeps the typed text); `tests/lib/saved-api-key.test.ts` (direct tests for `extractSavedApiKey` and `ensureApiKeyBoxExposed` over a real Bank in memory whose dialog types the passphrase); `App.test.tsx` checks the third heading.
* **Decisions taken**:
  * Put options are spelled out as `{ ifAbsent: 'add', ifPresent: 'repl' }` (the core's defaults) so the replace is visible to a reader.
  * A form with a submit button, so Enter in the field saves too; the field is uncontrolled, read once at submit from `FormData`.
  * An empty Save says "Type your key first." before any dialog opens.
  * A cancelled dialog leaves the typed text in the field (cleared only after a successful put).
* **Deviations**:
  * `useIsShowing` stays: `useBoxIsShowing` is not in `packages/safebyok-react/src/index.ts` on this base (it arrives with #590, thread 8). The sealed flow needs no showing hook.
* **Discoveries**: the demo's tests need `safebyok`, `safebyok-react` and `safebyok-indexeddb` built (`pnpm justify` at the root does it); a node-side Bank test needs `bank.hello()` before `ensureVault`.
