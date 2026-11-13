# Thread 21: gate_verbs_plain (2026-11-13)

Branch `20261113-gate_verbs_plain`, PR pending, stacked on #691 (thread 20). Justify: not yet run;
core, postgres, convex, graphql, indexeddb and demo tests green after item 1.

From the Coach's answers of 2026-11-13: (1) the gate verbs read like `putVault`; (2) no puritanical
throwers on `bank.del()`, `gate.del()`, the bank listing's put, `GateListing.tombstoneOver`; (3) the
gate snapshot shows no wayin header.

* **Built**:
  * Item 1 (commit `storage: each gate verb is a plain put...`). `AdapterBankDB`'s three gate verbs each
    parse with `BX.gatePut`, call `doPutGate`, answer: no lambda, no shared mover, no `#tryPutGate`.
    `classifyStoredGate` is `putActOf({ ...ask, ...GatePolicies }, gate)` and nothing else.
    `GateListing`'s three verbs build their record inline (`#gateMoveOf` gone). Removed from the core:
    the gate verbs' policy table, `gateVerb` on the ask and on `crossedAsk`, `gateVerbVals`/`GateVerb`,
    `gate_issue` (kind, thrower, phrases), and the dead `gateActVals`/`GateAct` (`added`, `revoked`:
    no verb answers them). `GateVerbAsk` is `GatePutAsk`. Postgres: `safebyok_put_gate(new_record,
    expected_row)`, two arguments, no policy WHERE. GraphQL: the `SafebyokGateVerb` enum and the
    input's `gateVerb` are gone (the input keeps its name `SafebyokGateVerbAskInput`). Convex: only a
    comment changed; its `putGate` already ran the core's classifier.
  * `gating.ts` `addPasskey`: `gate.demandPasskeyAddable()` right after `timelyAnte`, before proving.
    Without it, a passkey added elsewhere while the dialog was open would be silently replaced, which
    the bankDB's `camped` used to refuse. Test: `bank-gate.test.ts` "refuses a passkey added elsewhere
    while its dialog was open".
  * Notes: `answer-contract.md` (*Vault put*, *Gate ops*), `design-proof.md`, `design-models.md`, the
    GraphQL and Convex READMEs no longer describe the policy.

* **Decisions taken**:
  * The classifier needs no per-verb policy: with `ifAbsent: 'fail'` and `ifPresent: 'repl'` a good
    answer is `replaced`, and a replay of the stored record is `retcon`.
  * A `revokePasskey` over a gate with no passkey now stores the next revision, still with none. The
    model never sends one (`revokePasskeyPrompt` returns early); the listing test for it went.

* **Deviations**:
  * design.md R3 ("shared policy, not shared code", the gate verbs' policy checked by device and
    storage) is overridden by the Coach's answer (1). design.md is in the sprint worktree; its
    *The gate verbs' policy* section is now stale, for the orchestrator.
  * Fixed in passing: the Postgres `REVOKE ALL ON FUNCTION safebyok_put_gate(jsonb, jsonb, text)`
    named the old signature; now `(jsonb, jsonb)`.

* **Discoveries**:
  * An upgraded Postgres keeps the old three-argument `safebyok_put_gate` beside the new one; no
    migration (pre-1.0), the changeset says it may be dropped.
