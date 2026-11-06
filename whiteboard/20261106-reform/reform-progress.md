# Sprint reform: progress

The orchestrator's curated summary of what the threads have taught. Newer than the plan wherever they disagree. Workers
look things up here; they do not read it whole.

**Sprint doc:** https://claude.ai/artifact/DB1KsEoW5VKU99LDZTS3uk (tabs: Open Matters, Cleanup, Progress, Resolved). **Sprint PR:** #516.

## State (2026-11-06)

* Thread 1 `vocab_sweep`: ready, PR #518, in review (high, opus style pass); compacted once before its first justify.
* Thread 2 `guarantees_pass`: ready, PR #517, in review (high).
* Threads 3 to 10 wait for PRs #511, #513 and #514 to merge (plan, *Ground rules* 1).

## Facts the threads start from

* **Kinds** (after #509 and #511): 34 refusal kinds; `damaged_row` is the kind and the `damagekind` value;
  `damaged_rows` the listing field (#511); `vault_mismatch` kept, `vault_remade` culled; `record_conflict` holds the
  impossible; VaultDB's prepared record refuses `unexpected_error` by `recordPreparedWrong`; `Bank.make` requires
  `requestCleartext`; `sanitizeForeignError(thrown: Thrown): Error` stands as every foreign cause.
* **objCheck's option** is `refusalkind` (#511). The `*KindVals` and `*Kind` names are thread 10's.
* **Parses** (after #513): two re-parses removed in `proving.ts`; four relabels at their default kind; three builds kept
  for the brands they mint. `boxListing.hello(listed)` still parses, pending thread 4.
* **Examples** (after #514): 59 in src, 28 in the test helpers; `LabelShape` names all three rules; fourteen kept
  examples have no pointer (thread 3).
* **Fenced off**: both `absentBox`es and `storeFailed`; `weakPassphrase` stays.

## Discoveries

*Orchestrator, from thread 2 (#517):* guarantees.md's old-core clauses (G1, G2, G4, G6, G9, the secret-values table, the
access chains, the minimal-path paragraph, open item 1) name sites that live only in safebyok-old: a follow-up thread, not
this sprint's. Eleven findings F1-F11 are in `thread-2-findings.md` on the branch; six are Open Matters rows, five are
Cleanup calls. **For thread 5:** G4 says "Both go by the host's clock"; the clock thread rewrites that clause when the clock
leaves the options. **For thread 7:** G8 and *Where the guarantees are kept* cite `deriveKeyBytes`/`keyDeriverThrew`,
`invokeStrengthChecker` and `Gating.#askHost`/`requestCleartextThrew` as they stand; thread 7 moves all three and rewrites
those sentences with F2 (only the strength checker's throw goes through `refusalFor` today; the deriver's and the dialog's
guards do not, and nothing logs). No guarantee cites `parseLogger`.

*Orchestrator, from thread 1 (#518):* VOCABULARY now describes the new core alone; the old design's rows moved whole to
`notes/old_vocabulary.md`. It writes `Wayinkind` and `Gatingkind` already (thread 10) and `damaged_rows` ahead of #511 (the
`am` row conflicts on one line at the restack: keep #518's). Stale core text it could not fix, for the thread that owns each
file: `vault.unlock`'s doc says "Ask the user for proof" (proof is ruled out); `helpers/consts.ts` names `ask_passphrase_at`
(now `proved_at`); `helpers/phrases.ts` names `maxWhisperBytes` and `staleMinutes`, not options on main; `Ciphered` is not
exported from index.ts; `tests/loosened/loosened.test.ts` titles cite VOCABULARY line numbers. Facts it could not verify
and kept only in old_vocabulary.md: that `putBox()` writes over a damaged box; that a test keeps each format's schema.
