# 2026-11-19: Sentinel, swallowed-data and refusal-rephrasing audit -- new core, adapters, react

Scope: non-test source in `packages/safebyok`, every adapter (`-convex`, `-indexeddb`, `-postgres`,
`-graphql`, `-fastkey`) and `safebyok-react` (kept in a section of its own at the end: it is
getting a big redo); `safebyok-big` skipped. Five read-only opus reviewers,
one slice each. Items marked **[verified]** I read in source myself; the rest are a reviewer's
reading. Snippets are verbatim, to search on. Patterns are named as in the request:

* **P1** null as a sentinel: (a) a real absent value, fine; (b) a safeParse used as a type guard;
  (c) null carries a condition *and* a value.
* **P2** bad data ignored, or its report moved away from where it is detected.
* **P3** branching for a finer phrase or kind. The five tests: EXACT, UPGRADE,
  NEEDED-TO-SANITIZE, LOCAL, LEAK-REAL.

## The function that prompted this: `liveBankTokOf` (convex `component/banks.ts`) [verified]

```ts
const bank = BX.bankRecord.safeParse(bankRaw)
return bank.success ? bank.data.bank_tok : null
```

This is your **case 2, with a dose of case 3**. Null stands for three things: no bank row, a
tombstone, and a row that fails its check. Callers then compare `vault.data.bank_tok !== bank_tok`.

* **`tidyGone` loses data on a damaged bank row.** The damaged row reads as "no live bank", so every
  vault row is deleted as ended, and repeated calls delete every box row after them. The same
  handler leaves a *damaged vault row* alone, with its boxes and tallies (`damagedlabels`). So
  damage one level up wipes everything, and damage one level down is kept.
* **`watchRows` is harmless.** It drops the boxes from the watch, but passes the raw bank row on, and
  the client classifies it.
* **Recommendation:** `const bank = (bankDoc === null) ? null : BX.bankRow.parse(bankDoc.bank)`.
  Damage throws, as the bankDB is ground truth. Then branch on `bank?.am === 'a'` at the call site.
  Delete the helper.

## Cross-cutting

1. **tidyGone has three implementations and three policies on damage.**
   * Postgres (SQL, `bank-queries.ts` `DeleteEndedVaultsSql`) is the careful one. It keys on typed
     `am`/`bank_tok` columns and leaves a vault row of a later `fmt`, and its boxes, alone.
   * Convex wipes everything on a damaged bank row (above).
   * IndexedDB parses nothing (next section).

   One core helper deciding "which lives have ended, given the raw bank and vault rows" would make
   the in-JS adapters agree. The rule would be: damage throws, or is kept, but never reads as ended.
   - yes
2. **One class of finding is "a damaged read merged into absent or ended".** It recurs in `worldOf`,
   `liveBankTokOf`, idb `doTidyGone`, `thing-minder.list` and graphql `crossedErrOf`, and in react
   (R1, R2). The fix has one shape everywhere: parse with the refusing checker, so
   damage throws where it is detected, or return a discriminant tag. Never a null that means two
   things.
   - yes
3. **The P3 rephrasings mostly pass NEEDED-TO-SANITIZE and LOCAL, and fail EXACT.** Transport
   wrappers (postgres `refusalOf`, convex `askFor`, graphql `troubleOf`) are
   real helpers, as they should be. Their defect is a catch-all bucket whose phrase is right for the
   common case and wrong for the rest. The commonest wrong one: "transient, try again" for
   something permanent or a bug.

## Inventory, most serious first

### A. Destructive

| # | Where | Snippet | Pattern | What happens | Recommendation |
|---|---|---|---|---|---|
| A1 | `safebyok-convex/src/component/banks.ts` `tidyGone` + `liveBankTokOf` **[verified]** | `vault.data.bank_tok !== bank_tok` | P1c, P2 | Damaged bank row → every vault row and then every box row deleted | Above: `BX.bankRow.parse`, throw on damage |
| A2 | `safebyok-indexeddb/src/idb-bank-db.ts` `doTidyGone` **[verified]** | `const bank_tok = (bank?.am === 'a') ? bank.bank_tok : null` / `const vault = row as BX.VaultRow` | P1c, P2 | No parse at all. A damaged bank row deletes the whole bank. A damaged vault row is deleted with its boxes (Convex keeps it). A null row throws a TypeError, which reads as `storage_unavailable`. The comment "a row damaged inside the datastore is out of scope" contradicts STYLE *Validation* (storage is a boundary) | Parse the bank with `BX.bankRow` and the vaults with `BX.vaultRow`. Throw, or keep damaged vaults as Convex does. Better: the shared core helper (cross-cutting 1) |
| A3 | `safebyok/src/models/core-box.ts` `sealedOf` **[verified]** | `if (! Validator.isConsistent(whisper_sealed, BoxTags)) { throw Throwers.undecodedWhisper() }` | P3, fails EXACT | Runs *before* decryption, but `UndecodedWhisper` says "That box opened … remove it, or seal a whisper over it". Unknown tags most likely mean another version's codec, and the advice is to overwrite it | A thrower and phrase of its own ("sealed in a form this version does not read"), with no overwrite advice |
**go on these**

### B. Damage silently reads as absent, empty or transient

| # | Where | Snippet | Pattern | What happens | Recommendation |
|---|---|---|---|---|---|
| B1 | `safebyok/src/minding/thing-minder.ts` `list` **[verified]** | `return answer.val.map((record) => record.labelpath)` | P2 | `damaged_rows` from `tryListThings` is dropped without a word. A damaged child vanishes from the listing, and a host may treat its labelpath as free | Return the damaged rows, or at least `tellBadNews` them |
| B2 | `safebyok/src/storage/thing-classifier.ts` `worldOf` **[verified]** | `return ((bank === null) \|\| (maingate === null)) ? null : { ...bank, maingate }` / `} catch { return null }` | P1c, P2 | **This is a stated design, so it is a concern to air, not a bug** ("A world is news, never the verdict"). Still: the bare catch also swallows `storage_issue` and plain bugs. And `trackedFieldOf` throws on the very same rows, so whether an ask carries `track` decides between a silent null and a refusal. It also undercuts the reasoning in the `notes/wontfix.md` row on `tracked` | At minimum, narrow the catch to the damaged kinds. Better: a tag (`'none' \| 'damaged' \| record`) |
| B3 | `safebyok-postgres/src/postgres-bank-db.ts` `refusalOf` **[verified]** | `if (codeOf(thrown)?.startsWith('42')) { return DB.unexpectedError(...) }` / `return DB.storageUnavailable(...)` | P3, fails EXACT and UPGRADE | Every SQLSTATE outside class 42 answers "try again shortly". That includes a channel name too long for a long user_id (22023, permanent), a CHECK violation (23514, validators and tables disagree), the functions' own `RAISE EXCEPTION` (P0001), and a host client's own TypeError | Allowlist the transient classes (08, 40, 53, 57, and network errors with no code). Everything else is `unexpected_error`. The helper itself is right: one function, used everywhere |
| B4 | `safebyok-graphql/src/bank-resolvers.ts` `openWatch` | `unwatch = bankDB.watch(scope, (notice) => {` | P2 | No `onBadNews` is passed, so a server LISTEN failure is dropped and the stream never closes. The client's watch stays open, silent and stale. That breaks `GraphQLBankDB.watch`'s documented "at the first trouble the watch ends and calls `onBadNews` once" | Pass an `onBadNews` that enqueues `badNoticeOf(news)` and closes, as `endingWith` already does |
| B5 | `safebyok-convex/src/refusals.ts` `sentenceKindVals` (+ `askFor`) | `['bad_record', 'damaged_row', 'damaged_vault', 'storage_issue']` | P3, fails EXACT | The ask checkers `bankEnsure`, `boxList` and `boxTidy` refuse `bad_scope`, which is not on the list. It crosses as a bare error and the client reads it as `storage_unavailable`, "try again". Reached only through a forged or skewed ask. Per the reviewer, the `damaged_*` and `storage_issue` entries are unreachable | Add `bad_scope` and drop the kinds that cannot reach it |
B1: tellBadNews the labelpaths
B2: do the minimum. That rat king needs a thread of its own
B3: go
B4: go
B5: go

### C. A finer phrase or kind that misdescribes (EXACT fails); nothing lost beyond that

| # | Where | Snippet | Issue | Recommendation |
|---|---|---|---|---|
| C1 | `safebyok/src/storage/thing-classifier.ts` `watchedThingOf` | `if (! scope.success) { throw Throwers.storageIssue() }` | Only the row's own labelpath reaches this. The phrase says "a row that is not an object", but it is an object. The module's own rule makes this `damaged_row`, and the field name is dropped | `thingScope.refusingAs('damaged_row').parse(...)` |
| C2 | `safebyok/src/storage/adapter-vault-db.ts` `answerOf` | `if ((record === null) && (actual.act !== 'gotvoid')) { throw Throwers.storageIssue() }` | The kind is right, the phrase wrong ("not an object" when there is no Thing at all) | A phrase of its own |
| C3 | `safebyok/src/storage/adapter-vault-db.ts` `answerForThrown` | `} catch { return { ok: false, ..., err: answerNotMade() } }` | Loses both throws. "A bug in safebyok" is likeliest the host's bug (assigning to a frozen error) | `Throwers.unexpectedError(thrown)`, keeping the sanitized cause |
| C4 | `safebyok/src/minding/thing-minder.ts` `tryAt` | `err: Outcome.storageRefusalOf(err)` | Everything in that try is cache code, so a non-VaultError thrown there is a bug, yet it reads as transient | `isVaultError(err) ? err : Throwers.unexpectedError(err)` |
| C5 | `safebyok/src/models/core-box.ts` `deserializeWhisper` | `if (! checked.success) { throw Throwers.undecodedWhisper() }` | A hand-built refusal where the kit has one, and the field context is lost. LEAK-REAL fails: `CX.whisper` quotes nothing. Keep the `JSON.parse` catch above it: a SyntaxError can quote plaintext | `CX.whisper.refusingAs('damaged_whisper').parse(parsed)` |
| C6 | `safebyok-postgres` `doBuildBank` and four others / `postgres-vault-db.ts` | `throw DB.unexpectedError(new Error(StoredNothing))` vs `throw Throwers.storageIssue()` | The same condition gets two kinds across the two adapters. Written out five times inline. `StoredNothing` is not in `phrases.ts` | One kind, one `#demandWrote` helper, the phrase moved to `phrases.ts` |
| C7 | `safebyok-graphql/src/graphql-bank-db.ts` `troubleOf` | `(err.networkError === undefined) ? schemaNotServed() : networkTroubleOf(err)` | Any resolver or gateway error reads as "is it serving BankSchemaSdl?". Dropping the server's text is right: it can quote the record | Reword, or add `path`/`extensions.code` as safe meta |
| C8 | `safebyok-convex/src/server.ts` `demandCaller` | `if ((! callerId) \|\| (! asked.success) \|\| ...) { throw ... 'identity_revoked' }` | A malformed `user_id` folds into `identity_revoked`. Arguably deliberate (say nothing to a caller you cannot identify) | Leave it, with a comment saying so |
| C9 | `safebyok/src/models/lease.ts` `make` | `Validator.checkedConsistent(..., { kind: 'damaged_lease' })` | A bank mismatch is a mixup, not damage. Unreachable today: `buildLease` checks first | `record_conflict` or `unexpected_error` |
| C10 | `safebyok-fastkey/src/wasm-deriver.ts` | `if (err instanceof WebAssembly.CompileError) { throw new VaultError('bad_record', "...Content-Security-Policy..."` | A corrupt binary also reads as CSP. The sentences are inline | Say "likely CSP" |

**go on all these**

### D. Null-as-flag that is harmless today (tidy when touching the file)

* `safebyok/src/minding/thing-minder.ts` `#fetchCar`: `answer.val ?? this.#shellAt(ask)`. Branch
  on `act === 'gotvoid'`, as the working-tree `Bank.tryGetBox` now does.
* `safebyok/src/storage/thing-classifier.ts` `demandBornAtKept`:
  `storedCitedOf(ask, raw)?.born_at`. A null row reads as a born_at mismatch. Exported to stores;
  latent. Drop the `?.`.
* `safebyok/src/storage/thing-classifier.ts` `listedThingOf`: null means only "damaged", and the
  damage is reported in `damaged_rows`. Fine. Quirk: damaged children skip the lifepath filter.
* `safebyok/src/shapes/shapes-thing.ts` `isWholeRecord`: a damaged whole record reads as sparse,
  so it refetches. Reachable only with input that was not kind-checked.
* `safebyok/src/shapes/shapes-asks.ts` `loggableAskOf`: `parsed.success ? parsed.data : {}`. The doc
  says the sound part survives, but `.optional()` does not do that: one bad field empties
  `meta.ask`. Fix the doc or add `.catch(undefined)` per field.
* `safebyok-graphql/src/bank-resolvers.ts` `crossedErrOf`: `DB.capacity.safeParse(meta?.capacity)`.
  Damaged capacity crosses as null. Use `(meta?.capacity === undefined) ? null : DB.capacity.parse(...)`.
* `safebyok-postgres/src/postgres-vault-db.ts`: `if (unwritten === null) { throw Throwers.storageIssue() }`.
  The core's `unwrittenBirthOf` could throw this itself.
* `safebyok-convex/src/component/banks.ts` `storedOrNull` + `isWrite`: a null that is only turned
  into a boolean. Fold into one `wouldWrite`.
* `safebyok-convex/src/component/tallies.ts` `Reckoning.tally`: `{ kept: null, tally: null }`
  means "past a limit". It is documented and refuses correctly. A tag would read better.
* `safebyok-convex/src/convex-bank-db.ts` `refusalOf`: an `isSafebyokRefusal` guard, then a parse
  that cannot fail. One safeParse.

Don't touch thing-classifier.ts, and don't fix anything that is based on damaged records,
fix the others

### E. Behaviour worth a sentence, not a change

* `safebyok/src/models/proving.ts` `checkUnwraps`: a damaged `bank_key_wayin_wrapped` reads as a
  wrong passphrase. AES-GCM cannot tell the two apart; at most say so in the doc.
* `safebyok/src/models/bank.ts` `#tryBirth`: sweeping during a birth returns ok with a locked
  bank. Nothing is destructive; throw `endCause` or document it.
* `safebyok/src/minding/thing-minder.ts` `#sendToTSQ` / `thing-car.ts` `bestCarOf`: nothing checks
  that a delivered record is in this bank, so an adapter bug could cache another bank's record under
  this bank's key. Cache only.
* Postgres and vault-db watch notice fetches: `} catch { return null  // a notice is only a hint`.
  Deliberate and consistent with core `watch`.

go on all thee

## safebyok-react, kept apart: it is getting a big redo

These are inputs to the redo, not fixes to make in the current code. R1 and R2 also need something
from the core: a "listed" stage on the box listing, and the last bring-up refusal kept on the
device snapshot.

| # | Where | Snippet | Pattern | What happens | Recommendation for the redo |
|---|---|---|---|---|---|
| R1 | `hooks/hooks.ts` `useBoxes`/`useBox` | `const boxes = vault?.boxListing ?? null` | P1c | `[]`/`null` means "still listing", "listing failed" and "no boxes" alike. A host that shows "No key saved" will show it after a damaged read. The failure reaches only `onLifecycle`. Also, `void vault.tryBeginWatch()` swallows a refusal thrown before `announce`, and `watchedLives` is already set, so the watch is never retried for that life | A stage discriminant (`'listing' \| 'listed' \| 'failed'`) |
| R2 | `hooks/hooks.ts` `useVault` | `if ((bank === null) \|\| (vaultlabels === null)) { return BanklessLifecycle }` | P1c | A refused `tryEnsureBank` (damaged bank, storage down) reads as `'bankless'`, the same as "coming up" or "signed out", for good | A `'failed'` stage carrying `cause`, as `'spent'` has |
| R3 | `provider/boundary.tsx` + `modals/modal-kit.tsx` | `override componentDidCatch() { this.props.onCaught?.() }` | P2 | A dialog's refusal that cannot be corrected (for example `bad_record` from a wrong `passkeyRpId`) goes nowhere. The dialog shows generic text, Close dismisses it, and the opener hears `dismissed`, which hosts drop. It appears only in React's `console.error` | The boundary passes `err` on, and the gating concludes with the sanitized refusal, or it goes to `tellBadNews` |
| R4 | `components/passkey-unlock-button.tsx` | `onCaught={() => { props.onGripe(Messages.passkeyTrouble) }}` | P3, fails EXACT and UPGRADE | A damaged credential_id or an rpId misconfiguration reads to the user as "can't be used here just now", and nothing is reported | Keep the text for the user. Report the refusal (as R3) |
| R5 | `modals/del-vault-modal.tsx` | `if (! deleted.ok) { return deleted.err.message }` | P2, P3 | Any refusal's text, written for the developer, is shown to the end user. Nothing reaches `onBadNews`. Its sibling dialogs split by kind | Split by kind, as `gripeOfRefusal` does |
| R6 | `helpers/passkey.ts` | `toB64(...) !== credential_id` → `passkeyAskFailed` | P3, fails EXACT | "Couldn't ask", but the browser did ask, and the wrong credential answered | A phrase of its own |
| R7 | `giver/react-giver.ts` `PendingBank` | `Object.freeze({ stage: 'signed_out', ... })` | P1c | A signed-in user whose bank has not started reads as `'signed_out'`. Not yet exported | Derive `'starting'` from userid |
| R8 | `provider/gating-modal.tsx` `NoDialog` | (dismisses an unknown gatingkind) | P2 | A newer core's gating kind is dismissed with no log line | `logger.warn` naming the gatingkind |

Judged fine in react: `gripeOfRefusal`'s null when the gating is closed, `boundaryRefusalOf`,
`askAuthenticator`'s NotAllowed→null, `useChosenPassphrase` dropping stale failures, the
`useDevice`/`useBank` nulls, the placeholder values on a null box, and the dev-mode panels.

## Judged fine (coverage)

The reviewers passed, with reasons: every `?? null` over a fetched doc (absent rows), postgres
`causeOf`/`codeOf` and the three `throw refusalOf(err)` wrappers, `HostErrorSanitizer`,
`gating.ts` `checkedCleartexts` (the
leak there is real: a passphrase), `deriveKeyBytes` dropping its cause (real), the
`JSON.parse` catch in `deserializeWhisper` (real), `Bank.birth`'s `gateMadeElsewhere`,
`#demandOwnBox`, `writtenOf`, `unwrittenWriteOf`, `classifyListThings`, the guard family in
`shapes-thing.ts`, `memory-vault-db.ts`, `policies.ts`, `throwers.ts` and `phrases.ts`, every
options parse framed with `where`/`advice`.

## Outcome (2026-11-19, after the Coach's notes)

Four PRs, each built, reviewed and filed with `pnpm justify` green:

* [#764](https://github.com/mrflip/safebyok/pull/764) tidy_damage, ready: covers cross-cutting 1
  (`BX.endedLivesOf` in big, as authorized), A1, A2, B5, C8, and the Convex D items.
* [#763](https://github.com/mrflip/safebyok/pull/763) pg_refusals, ready: covers B3, B4, C6, C7,
  C10, `crossedErrOf`, and E for the postgres notice fetches.
* [#762](https://github.com/mrflip/safebyok/pull/762) core_refusals, ready: covers A3, C2, C3,
  C5, C9, `loggableAskOf`, E for `checkUnwraps` and `Bank.birth`, plus B2 (minimum) and C1.
* [#761](https://github.com/mrflip/safebyok/pull/761) minder_damage, a draft stacked on #759:
  covers B1, C4, `#fetchCar`, and E for the scope check.

Not done, per the notes: the D items that rest on damaged records or live in thing-classifier.ts
(`isWholeRecord`, `listedThingOf`, `demandBornAtKept`, `unwrittenBirthOf`), and all of react.

Merge order: #762 and #763 both touch `#receivedOrNull` in `postgres-vault-db.ts`, so whichever
merges second rebases. The resolution keeps both changes: the carried-world `worldOf` call inside
the try, and #763's catch reporting it.

Open matters, each with a recommendation:

1. #761: `tryWrite` rejects after a write was made when the answer carries another bank's record.
   Keep it.
2. #761: a list or write answer may cache records that come before a foreign one. One check over
   all of them first would close both gaps. Leave it: only an adapter bug causes it.
3. #762: `answerForThrown` mutates the thrown refusal, so a frozen `identity_revoked` comes back as
   `unexpected_error`. This predates the thread. A follow-up should copy instead of mutating.
4. #762: the `dbhas` cast in `answerForThrown` is unchecked. Leave it, or check it in a later
   thread.
5. #763: a tripwire test pinning pg's lost-connection message strings. **Done**, beside the code, with `pg` as a devDependency.
6. #763: SQLSTATE `25006` (read_only_sql_transaction, met during failover) joins the transient list. **Done.**
7. #763: move the postgres test fakes behind `TH`. A later tidy.
8. #764: IndexedDB counts box rows under a kept damaged vault in `totalCount`, where Convex and
   the `Tidied` doc do not. A two-line change makes IndexedDB match. Yes, or loosen the doc.
9. #764: a vault row filed under the wrong address reads as sound to `endedLivesOf`, as before.
   Only if you want that broken state covered.
10. #764: big's `memory-bank-db.ts` `doTidyGone` still wipes on a damaged bank row. Leave it
    until the new core's memory store is ported.
11. #764: the 2026-11-17 `notes/security.md` entry may still list the two crossing kinds dropped
    from Convex. Amending it is your call.
12. The B2 "rat king": `worldOf` tells damage from a broken store by filtering refusal kinds in a
    catch, while `listedThingOf` does it structurally. Its own thread.

Second pass (the Coach: "go ahead: lost connection string, sqlstate, style-reviewer"; left for a
separate session: IndexedDB `totalCount`, the classifier rat king, `answerForThrown`). Items 5 and 6
are done. A style-reviewer pass ran on all four PRs, and its findings with a clear fix are applied:
`#checkedDelivered`, `checkedWrote`, one-clause test titles, and doc blocks that name no refusal kind.
All four were filed again with `pnpm justify` green.
