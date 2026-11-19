# Thread 3: core_refusals (2026-11-19)

Branch `20261119-core_refusals`, PR [#762](https://github.com/mrflip/safebyok/pull/762), on main (cut at 240a5bca2). Batch `sentinel_audit`.
Proved: `pnpm justify` green after the rebase onto main (past #760 bank_gatings and #763): 6858 tests in 11 packages, 1227 of them in `safebyok` (29 files); see the PR's **Tests:** line.

* **Built**, all in `packages/safebyok/src/`, phrases in `phrases.ts`, throwers in `refusals/throwers.ts`:
  1. **A3** `models/base-box.ts` `sealedOf` (the brief said `core-box.ts`): throws `unknownWhisperForm()`, `damaged_whisper`, phrase `UnknownWhisperForm`, no overwrite or remove advice. Test: base-box.test.ts checks the message.
  2. **C5** `deserializeWhisper`: the `JSON.parse` catch stays (a SyntaxError can quote plaintext); the decoded value goes through `WhisperChecker = CX.whisper.refusingAs('damaged_whisper')`, with `where: Phrases.OpenedNoWhisper`. Test: a JSON array is refused with the OpenedNoWhisper lead; bad JSON is not.
  3. **C2** `storage/adapter-vault-db.ts` `answerOf`: throws `noThingReported()`, `storage_issue`, phrase `NoThingReported`. Tests check the message.
  4. **C3** `answerForThrown`: defensive catch kept; it builds `answerNotMade(thrown)`, `unexpected_error`, with `thrown` as cause, and the phrase `AnswerNotMade` rewritten to say what happened. New test: a frozen refusal thrown.
  5. **C9** `models/lease.ts` `make`: the bank mismatch refuses `unexpected_error`, as `Proving.buildLease` does. Unreachable today. Lease tests updated.
  6. **D** `shapes/shapes-asks.ts`: the kit allowed it cleanly, so the doc was made true. Every loggable-ask field is `soundOrAbsent(...)` (`.optional().catch(undefined)`), and `loggableAskOf` drops the undefined fields with es-toolkit's `omitBy(isUndefined)` (Zod 4 leaves `{ field: undefined }` for a caught field). New test in shapes-thing.test.ts.
  7. **E** `models/proving.ts` `checkUnwraps`: doc only, its own `crypto:` commit. Recorded in `notes/security.md` by a sonnet subagent (an entry dated 2026-11-19 at the top of *Of Interest*).
  8. **E** a device swept mid-birth throws its end cause (`disabled`), evicting the new lease. Built as a `bank.demandEnabled()` in `Bank.birth`; on the rebase, main (#760) had replaced `Bank.birth` with `Bank.#birth`, whose `#attachLease` already evicts and throws on a swept bank, so the source change was dropped and only its test stays, moved to gating.test.ts's `birthBank` describe ("throws the device's refusal where the device is swept mid-birth").
  9. **B2, minimum** `storage/thing-classifier.ts` `worldOf` (added mid-thread by the Coach): the catch keeps only a `damaged_row` refusal (`Errors.isVaultError(err, 'damaged_row')`), which still leaves the world null; `storage_issue` and plain bugs propagate. Doc line added. No discriminant, nothing to `trackedFieldOf`. New tests in memory-vault-db.test.ts (sound, damaged, two broken stores, a TypeError), the three new ones seen failing before.
  10. **C1** `watchedThingOf`: `ThingChecks.thingScope.refusingAs('damaged_row').parse(...)`, a module const `watchedScopeChecker`; the `isPlainBag` pre-check stays. Test: labelpath 42 refuses `damaged_row` naming `labelpath`.
  11. **`safebyok-postgres`** `#receivedOrNull`: the carried-world `Classifier.worldOf` call moves inside the try, since `worldOf` now refuses a broken store and threw outside it as an unhandled rejection. With #763's catch, that `storage_issue` goes to `onFailed`, so a notice carrying a world that is no object ends the watch, telling its onBadNews `storage_issue`. Test in postgres-vault-db.test.ts.
  * Changeset `.changeset/20261119-core_refusals.md`, empty (the core is private).

* **Decisions made**:
  * **A3 kind stays `damaged_whisper`.** `newer_format` is arguably more exact, but an unknown tag may also be damage or an older pre-release, `newer_format`'s comment is about a wayin's key deriver, and keeping the kind leaves a host's branch unchanged. Open matter.
  * **C2's phrase names no act**: putting the act in meta would make `answerForThrown` use it as the BadAnswer's act.
  * **C9 keeps the default fieldsDisagree message**: big's `LeaseOfOtherGate` speaks of a proving and does not fit.
  * **#8 needs no code past main**: `Bank.#birth`'s `#attachLease` keeps the promise ("resolve it unlocked"), and an enabled device never throws there.

* **Deviations** (each as a contract question):
  * **C3: the cause is `thrown` as it came, not sanitized.** The brief said `unexpectedError(thrown)` or an equivalent with a sanitized cause. `sanitizeForeignError` runs `instanceof Error`, which itself throws on the uninspectable value the existing "never throws, even for a failure it cannot look at" test uses (a Proxy). It trims nothing from an Error, so there is no security difference. Before: an `unexpected_error` with no cause. Now: one whose cause is what the verb threw. The error the handler itself hit is not kept; open matter.
  * **C5: a `where` story.** Without it the message is only `CX.whisper`'s put-time sentence ("cannot be put, so wrap one as..."), which misleads for a decode. Before: `UndecodedWhisper`. Now: `OpenedNoWhisper: <the whisper check's sentence>.`
  * **D**: before, one unsound field emptied `meta.ask`; now only that field drops. An ask that is not an object still gives `{}`.
  * **#8**: main (#760) already rejects with `device.endCause`, the bank stored all the same; this thread adds only the test.
  * **Postgres carried world**: before #763 and this thread, a carried world that is no object was an unhandled rejection; now it ends the watch with `storage_issue` to onBadNews, as #763 does for any fetch failure a retry would not mend.
  * **B2**: before, a non-object or misfiled bank or main gate, or a bug, left the world null and the step's answer stood; now the verb refuses `storage_issue` (or the bug becomes the verb's refused answer).
  * **C1**: before, `storage_issue` with a sentence about a non-object row; now `damaged_row`, naming `labelpath`.

* **Discoveries**:
  * `adapter-vault-db.ts` `answerForThrown`: `(Errors.rowsOfRefusal(err).dbhas ?? null) as ThingRecord | null` trusts `rows.dbhas` unchecked; a comment above it says only the classifier sets it, to a checked Thing. Noted here only, per the brief; not changed.
  * Big's `UndecodedWhisper` opens with the same words as `OpenedNoWhisper`; a test telling them apart has to look for the colon.
  * `pnpm --filter safebyok exec vitest run` fails until safebyok-big is built; `pnpm --filter safebyok test` builds it first.

* **For the Coach**: the open matters, in the PR body: `newer_format` for A3; keeping the handler's own error in C3; the `dbhas` cast; the `where` on decode.
