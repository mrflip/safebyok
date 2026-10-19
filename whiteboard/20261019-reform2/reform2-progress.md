# Sprint reform2: progress

The orchestrator's curated summary of what the threads have taught, newer than the plan where
they disagree. Workers look things up here; they do not write it.

## Standing

* 2026-10-19: planned. The Coach struck threads 3, 4 and 5. The line is 1 → 2 → 6 → 8; thread 7
  (documents) runs beside it from `origin/main` and joins the line at wrap-up.
* Coach's rulings, 2026-10-19: honor-and-warn stands, in both places; `bad_record` "fine for
  now"; the trust class is *visible* (thread 10 sweeps it); the warning over a damaged box says
  so (thread 9); each thread moves its own size budgets (sprint skill, #181, for later
  sprints; this sprint keeps thread 8's `--write`). Invariant for the deferred tombstones:
  once a record exists there is always a record (tombstone or valid) while the vault exists.
* *Orchestrator:* 2026-10-19, wrap-up: the line is restacked onto main `dbc3dfcc` (#180 merged),
  tips 35b0f35e … 330871ca; thread 7's conflicts with main's #172 wording kept main's "guaranteed
  unchanged" beside the sprint's *visible*/authenticated. Late rulings: thread 4 comes back whole
  (the store stops clearing; a damaged box naming no revision is refused); thread 11 makes a
  record check refuse `bad_record` even for a bad label, says "nothing was removed" on a retire,
  and has GraphQL say `bad_record` when the record is at fault. `unlock_epoch` "will be removed as
  a feature soon"; wayins can't be bound (the Coach).

## Discoveries

* *Thread 7 (#176, filed):* the sidecar is *server-readable* in VOCABULARY.md, README, the
  `storeBox()` and `Sidecar` doc blocks and `checkStoreOpts`'s message. In `src/vault.ts` it
  touched the `storeBox()` doc block's sidecar paragraph and one clause of its damaged-record
  paragraph ("server-readable fields"), `recordOpens`' doc block, a comment in `storeBox`, and the
  `checkStoreOpts` message; a fixture string in `tests/vault.test.ts`. Any thread rewriting
  those lines meets it at the restack.
* *#176 review:* `writeOver`'s clear-then-write over a damaged box naming no revision can lose a
  write silently (A retires, A writes, B retires A's write, B writes). Thread 2's honor-and-warn
  only logs it. It is with the Coach (bring back thread 4?).
* *Thread 1 (#177, filed):* `doUpdateBox` resolves the stored lockbox or `null`; only `null` is
  stale, any other malformed answer is `corrupt_record`. `writtenBack(said, check)` in
  `vault-db.ts` validates an adapter's answer; `refreshOnStale` and IndexedDB's `ringIfLanded`
  are generic. Beyond the adapters, a VaultDB verb change reaches the demo's
  `src/lib/outage.ts`, the Postgres README route recipe (and its test copy) and authoring
  bullets, the Convex README table and the core README's refusal table. The malformed-answer
  case is tested in the core's `tests/vault-db.test.ts`, not `describeVaultDB` (which cannot make
  an adapter misbehave).
* *Thread 2 (#178, filed):* a lockbox retire takes `LockboxRetireExpectation` (with
  `revision_tok`) and resolves `LockboxRetirement` (`retired | retired_other | absent`);
  `RetireExpectation` stays vault-only. `Expectations.retirementOf` decides the outcome (the
  Convex component inlines it, as it imports nothing from `safebyok`). An empty `revision_tok`
  reads as none everywhere. `retireBox()` and `writeOver`'s retire warn on `retired_other`
  and carry on; the #176 lost-write sequence has a test showing exactly one warning. IndexedDB
  no longer rings for an `absent` retire. GraphQL: enum `SafebyokRetireOutcome`.
* *Thread 6 (#179, filed):* kind `bad_record` (misuse) for whatever `checkOutgoing` throws and
  for the two record-versus-expectation mismatches; `retireDamagedVault`'s sound-vault refusal,
  the GraphQL client's BAD_USER_INPUT mapping and the Postgres route recipe stay `bad_option`.
  A missing lockbox or failing applabel is still `bad_label` (those checks run first).
* *Restack (orchestrator):* thread 7 rebased cleanly onto #179 at `47d66578`; #176's body says
  so. Thread 8 is cut from there.
* *Orchestrator, thread 8 (#182, filed):* the summary changeset `.changeset/20261019-summary.md`;
  the README's `bad_record` row says `bad_label` still comes first (thread 11 rewrites that).
* *Orchestrator, thread 9 (#183, filed):* `retireBox()` logs its own damaged-specific warning
  when what it removed was not the damaged record the snapshot showed; both `retired_other`
  warnings carry `damaged: true` in the logger's story. Thread 4 removes the store-side one.
* *Orchestrator, thread 10 (#184, filed):* VOCABULARY's *visible* (strictly unencrypted and
  authenticated) and *unencrypted* (authentication unsaid). `unlock_epoch`, the props' own
  `vault_key_epoch` and the wayins list are *unencrypted*; GraphQL's `'plain'` field class keeps
  its name as a code identifier. The sidecar's example is the OpenRouter call count.
* *Orchestrator, restack onto `dbc3dfcc`:* main's #172 calls the sidecar "guaranteed unchanged";
  both phrases stand (README bullet title, VOCABULARY's guarantee sentence).
* *Orchestrator, threads 4 (#186) and 11 (#185), side by side on #184:* thread 4 makes a store
  one `updateBox`, refusing a damaged box naming no revision as `damaged_lockbox` (it touched
  the demo and threads 2's and 9's changesets). Thread 11 makes a record check refuse
  `bad_record` even for its label (a name over a backend's byte limit stays `bad_label`), leads a
  retire's refusal with "Nothing was removed", and keeps GraphQL's BAD_USER_INPUT `bad_option`
  (a record at fault never reaches the server). Restack: 4, then 11.
