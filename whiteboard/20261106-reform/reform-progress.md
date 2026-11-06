# Sprint reform: progress

The orchestrator's curated summary of what the threads have taught. Newer than the plan wherever they disagree. Workers
look things up here; they do not read it whole.

**Sprint doc:** https://claude.ai/artifact/DB1KsEoW5VKU99LDZTS3uk (tabs: Open Matters, Cleanup, Progress, Resolved). **Sprint PR:** #516.

## State (2026-11-06, 05:15: paused)

The sprint is paused: every unstarted thread (5 to 10) waits on PRs #511 and #513 reaching `main`, which the Coach's
queue line delivers. `human/20261106-sprint_reform_paused.md` says where each thread stands. Resume: when
`git grep refusalkind origin/main -- packages/safebyok/src/helpers/validator.ts` hits and #513 is an ancestor of
`origin/main`, cut thread 5 from `origin/main` and go on down the plan; thread 10 last from the top of the line.

* Thread 1 `vocab_sweep`: filed, PR #518 at e9b58da04 (two reviews; plan, thread 1 *Review*).
* Thread 2 `guarantees_pass`: filed, PR #517 (two reviews, the second clean); in the Coach's line; a commit for G2's
  core test is coming (plan, ground rule 10).
* Thread 3 `example_pointers`: filed, PR #522 at 51741eb57; in the Coach's line.
* Thread 4 `hello_listed`: filed, PR #523 at 895949623 on #513's current tip (not in the Coach's line).
* Thread 11 `duck_calibration`: filed, PR #525 at 781f7e625, on main.
* Thread 12 `refusalof_removed`: filed, PR #526 at 255d2c5d7, on main; merge with or after #517.
* Thread 13 `guarantees_models`: built, PR #528, in review (high). **For thread 7:** the host-function paragraph still
  says all three guards go through `refusalFor`; only `invokeStrengthChecker` does.
* Thread 14 `deviceid_label`: filed, PR #527 at 846f0d285, on main. `device_id` is a `label` everywhere; the minted id is
  `d` + 32 hex.
* **The Closer Look** (sprint doc tab, 2026-11-06 06:00) at 3b1b38999: its 1.1 is a real regression from #513 (`buildLease`
  hands `consistent` the raw friend; fix `checked.friend`, one token, on thread 5 once triaged); 1.2 the self-built-value
  kind (ruled on #513, errors.ts's paragraph now disagrees); 1.3 `_takeListed`; 1.4 `box.isShowing` (#515); 1.5 prose ahead
  of code; 1.6 "open" still in identifiers (thread 5/6 territory: `Lease.#opened`, `unopenedWhisper`); 1.7 two cores in
  guarantees.md (thread 13); 1.8 a console spy. Nothing new in the undergrowth. Triage waits on the Coach.
* **Listing responsibilities** (tab and `listing-responsibilities.md`): recommendation B, a `listBoxes` verb and `getVault`
  the row alone, as thread 15 `list_boxes` after thread 7, pending the Coach's word.
* **Merged 05:10:** #513 and #517 (and #521, the Coach's queue tooling). #511 is still the gate for threads 5 to 10.
* **Rulings of 05:30** (sprint doc, Resolved): `#the-host-is-not-our-threat-model`; brands are getters; "world is as listing
  has it: bank for vaults, vault for boxes"; the deviceId sentence; the orchestrator owes a listing-responsibilities
  recommendation (a tab and `listing-responsibilities.md`), on which `_takeListed`'s name waits. **For thread 9:** a `Z.ZodType<T>` checker loses
  `.pick`/`.extend`/`.shape`: widen only what the package exports; the `Boxlabel` alias STYLE.md cites does not exist.
* **The Coach keeps a merge line** (plan, ground rule 9): #513, #517, #521, #522, #512, #518, #519, #520, #511 in that
  order. #511 and #513 conflict with each other in `refusals/throwers.ts` and `tests/test-helpers/models-world.ts`; the
  line resolves that at #511's turn, on top. Thread 5 is cut once #511 and #513 are on main, or from the line's top if the
  Coach says so.

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

*Orchestrator, from thread 3 (#522):* `FarFuture` and `ForeverMillis` in `helpers/consts.ts` describe `ask_passphrase_at`
and a gating's `leaseMillis`, which the core lacks (`autolockMinutes` is the option; `ForeverMillis` is unused in src).
**For thread 5:** rewrite or retire them with the clock. #511 adds a `VaultError` example calling `vault.getWhisper`,
which the core lacks: thread 5 fixes it as thread 3 fixed `isVaultError`'s (`box.extractWhisper()`, a valid label).
Thread 1's second review: `Storable.#isEnabled`'s comment and `isEnabled`'s doc block say a delete disables the object
(only a sweep or a vacate does); `refusals/errors.ts`'s `damaged_box` comment describes the `damaged_row` case. **For
thread 5** too, being in those files.

*Orchestrator, from thread 2 (#517):* guarantees.md's old-core clauses (G1, G2, G4, G6, G9, the secret-values table, the
access chains, the minimal-path paragraph, open item 1) name sites that live only in safebyok-old: a follow-up thread, not
this sprint's. Eleven findings F1-F11 are in `thread-2-findings.md` on the branch; six are Open Matters rows, five are
Cleanup calls. **For thread 5:** G4 says "Both go by the host's clock"; the clock thread rewrites that clause when the clock
leaves the options. **For thread 7:** G8 and *Where the guarantees are kept* cite `deriveKeyBytes`/`keyDeriverThrew`,
`invokeStrengthChecker` and `Gating.#askHost`/`requestCleartextThrew` as they stand; thread 7 moves all three and rewrites
those sentences with F2 (only the strength checker's throw goes through `refusalFor` today; the deriver's and the dialog's
guards do not, and nothing logs). No guarantee cites `parseLogger`. **From the review:** G8's route
sentence adopted from #511 was wrong for the throwing verbs: `putBox`, `box.put` and `putExposed` reach `Lease.sealWith`
with no `outcomeOf`, so a WebCrypto DOMException reaches the host raw; only the `try*` forms wrap it (the guarantee holds:
a DOMException carries no key). **For thread 7:** the wrap it builds is the place to decide whether the seal path should
go through `outcomeOf` too; today it does not.

*Orchestrator, from thread 1 (#518):* VOCABULARY now describes the new core alone; the old design's rows moved whole to
`notes/old_vocabulary.md`. It writes `Wayinkind` and `Gatingkind` already (thread 10) and `damaged_rows` ahead of #511 (the
`am` row conflicts on one line at the restack: keep #518's). Stale core text it could not fix, for the thread that owns each
file: `vault.unlock`'s doc says "Ask the user for proof" (proof is ruled out); `helpers/consts.ts` names `ask_passphrase_at`
(now `proved_at`); `helpers/phrases.ts` names `maxWhisperBytes` and `staleMinutes`, not options on main; `Ciphered` is not
exported from index.ts; `tests/loosened/loosened.test.ts` titles cite VOCABULARY line numbers. Facts it could not verify
and kept only in old_vocabulary.md: that `putBox()` writes over a damaged box; that a test keeps each format's schema.
