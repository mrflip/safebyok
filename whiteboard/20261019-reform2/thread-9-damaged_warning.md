# Thread 9: damaged_warning (2026-10-19)

Branch `20261019-damaged_warning`, PR [#183](https://github.com/mrflip/safebyok/pull/183), stacked on [#182](https://github.com/mrflip/safebyok/pull/182), in the line main -> #177 -> #178 -> #179 -> #176 -> #182. Justify: green (core 2226 passed, 35 skipped; indexeddb 142; postgres 257; convex 267; graphql 250; react 228; e2e 86). No size line moved.

* **Built**:
  * `Vault.retireBox()` (`packages/safebyok/src/vault.ts`): when the retirement meets `retired_other` and the lockbox the snapshot showed was listed damaged (asked before the call, so a catch-up cannot change the answer), it warns "The lockbox this device showed was a damaged one, and the lockbox retired was not that record: ...", context `{ call: 'retireBox', damaged: true }`. Over a sound box the message and context are as before, with no `damaged` field.
  * `writeOver`'s retire-first warning keeps its wording (it already says "damaged") and its context becomes `{ call: 'storeBox', damaged: true }`.
  * `retireBox`'s doc block and the README's honor-and-warn paragraph (end of *Damaged lockboxes*) mention the flag. Minor changeset `.changeset/20261019-damaged_warning.md`.
  * Tests (`tests/vault.test.ts`, "versioned updates"): a new retireBox-over-damaged test (one warning, damaged wording, `damaged: true`, neither revision nor boxlabel logged); the sound-box test now checks no "damaged" wording and no `damaged` property; the #178 lost-write test checks `damaged: true`.
* **Decisions taken**:
  * The logger's `story` is `Record<string, unknown>` (`src/logger.ts`), so `damaged` needed no type change.
  * `retireBox()` uses a separate message for the damaged case rather than appending to the sound one, so the log reads plainly to a non-expert and a host can match either by `damaged`.
  * `retireBox()`'s wording names the damaged record only as "the lockbox this device showed", no revision, boxlabel or secret.

## Open matters

* **Two messages, not one with a clause (decision taken).** Recommendation: keep.
* **The invariant (always a record while the vault stands) is the deferred tombstones' work**, not done here, as the sprint says.
