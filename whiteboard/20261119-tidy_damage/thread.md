# Thread 1: tidy_damage (2026-11-19)

Branch `20261119-tidy_damage`, PR [#764](https://github.com/mrflip/safebyok/pull/764), on main (batch `sentinel_audit`; audit `human/20261119-sentinel_audit.md`, items A1, A2, B5, C8, D).
Proved: `pnpm justify` green after the catch-up onto origin/main at b9ec1b520: safebyok-big 2946, safebyok-convex 333, safebyok-indexeddb 215, safebyok 1073, postgres 331, graphql 445, react 300, fastkey 43, demo 99, e2e 576, scripts 328.

* **Built**:
  * `BX.endedLivesOf(bankRaw, vaults)` in `packages/safebyok-big/src/shapes/shapes-bankdb.ts`, beside `vaultLifeOf`, with
    `EndedLives`. The rule: damage throws, or is kept, but never reads as ended. A bank row failing its checks refuses
    `damaged_row` (`storedBankRow`); an absent bank or its tombstone ends every vault life; a vault row failing `vaultRow` is
    kept, with every box row under its vaultlabel. Returns `ended` (the entries handed in, so each adapter keeps its own ids),
    `live` (records), and `isEnded(place)` for box rows and tallies. Tests in `tests/shapes/shapes-bankdb.test.ts`.
    **An addition to frozen big beyond export-or-broaden, by the Coach's "yes" on the audit's item.**
  * A1: Convex `tidyGone` (`component/banks.ts`) on the helper; `liveBankTokOf` and `ckeyOfLife` gone. `watchRows` parses the
    bank row where it reads it and branches on `am === 'a'`. Both route a refusal through `storedFor` (new, beside `askFor`) to
    `crossingOf`, so the client hears `damaged_row`.
  * A2: IndexedDB `doTidyGone` on the helper; the "rows are trusted to be rows" comment is gone.
  * B5: `refusals.ts`: `bad_scope` added; `damaged_vault` and `storage_issue` dropped (only the classifiers throw them, inside
    `wouldWrite`, which swallows every VaultError); `damaged_row` kept, reachable now through `storedFor`. Doc block fixed.
  * C8: a `//` on `demandCaller` in `server.ts`; behaviour unchanged.
  * D: `wouldWrite` replaces `storedOrNull` + `isWrite`; `Reckoning` is `{ isPastLimit: true } | { isPastLimit: false, tally, kept }`,
    and `capacityOf` / `wouldPassLimit` take the reckoning; `refusalOf` makes one safeParse and passes `.data` to
    `refusalOfCrossed`. `isSafebyokRefusal` stays exported.
  * Damage tests in each adapter's own file (the shared battery also runs memory, which still wipes): Convex
    `ConvexBankDB over damaged rows` (tidyGone over a damaged bank, a damaged vault with its tally, the watch, `bad_scope`
    crossing); IDB `IdbBankDB's tidyGone over damaged rows`. Each fails on the old code (checked by stashing the src).
  * READMEs of both adapters say what tidyGone does with a damaged row. Changeset `20261119-tidy_damage`, minor (an
    exported kind list shrinks). `notes/security.md`: the 2026-11-13 bank_docs entry amended, by a sonnet subagent.
* **Decisions made**:
  * One function returning a predicate, not a list of box rows: Convex streams box rows under a budget
    (`deleteEndedBoxes`), so it needs `isEnded`, and IDB filters its own list with the same predicate.
  * `watchRows` parses with `BX.storedBankRow` (refuses `damaged_row`), not the `BX.bankRow` the brief named (refuses
    `bad_record`, which reads as a bad ask): the same kind tidyGone gives.
  * Reckoning tag named `isPastLimit` (STYLE.md: a boolean reads as a predicate).
* **Deviations** (contract changes on broken state only; no working-case answer changes):
  * Convex tidyGone, damaged bank row: deleted every vault, box and tally row; now refuses `damaged_row`, deletes nothing.
  * Convex watchRows, damaged bank row: listed rows without boxes; now the watch errors `damaged_row`.
  * IDB tidyGone, damaged bank row: deleted the bank's vaults and boxes; now refuses `damaged_row`, transaction aborts.
  * IDB tidyGone, damaged vault row: deleted with its boxes; now kept, and its boxes kept and counted in `totalCount`.
  * Convex crossings: `bad_scope` read as `storage_unavailable`; now crosses as `bad_scope`. Exported
    `safebyokErrorKindVals` loses `damaged_vault`, `storage_issue`.
  * No existing test pinned the old wipe; none changed for it.
* **Discoveries**:
  * `memory-bank-db.ts` `doTidyGone` (frozen big) still reads a damaged bank as ended: out of the brief.
  * Convex leaves a kept (damaged-vault) life's boxes out of `totalCount`; IDB, memory and Postgres count them.
  * `notes/security.md`'s 2026-11-17 option_record entry names `crossingOf` / `sentenceKindVals`; the subagent left it, per
    the file's rule, and it may now list kinds no longer sent.
* **For the Coach**: the open matters in the PR body.
