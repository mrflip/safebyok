# Thread 21: gate_verbs_plain (2026-11-13)

Branch `20261113-gate_verbs_plain`, PR #692 (draft), stacked on #691 (thread 20). Justify: green,
5283 tests (core 2954, graphql 401, convex 299, react 262, postgres 208, indexeddb 193, demo 99,
fastkey 43, e2e 537, scripts 287).

From the Coach's answers of 2026-11-13: (1) the gate verbs read like `putVault`; (2) no puritanical
throwers on `bank.del()`, `gate.del()`, the bank listing's put, `GateListing.tombstoneOver`; (3) the
gate snapshot shows no wayin header. One commit and one changeset per item.

* **Built**:
  * Item 1 (`storage: each gate verb is a plain put...`). `AdapterBankDB`'s three gate verbs each
    parse with `BX.gatePut`, call `doPutGate`, answer: no lambda, no shared mover, no `#tryPutGate`.
    `classifyStoredGate` is `putActOf({ ...ask, ...GatePolicies }, gate)` and nothing else.
    `GateListing`'s three verbs build their record inline (`#gateMoveOf` gone). Removed: the gate
    verbs' policy table, `gateVerb` on the ask and on `crossedAsk`, `gateVerbVals`/`GateVerb`,
    `gate_issue` (kind, thrower, phrases), and the dead `gateActVals`/`GateAct` (`added`, `revoked`:
    no verb answers them). `GateVerbAsk` is `GatePutAsk`. Postgres: `safebyok_put_gate(new_record,
    expected_row)`, no policy WHERE. GraphQL: the `SafebyokGateVerb` enum and the input's `gateVerb`
    are gone (the input keeps the name `SafebyokGateVerbAskInput`). Convex: a comment only.
  * `gating.ts` `addPasskey`: `gate.demandPasskeyAddable()` right after `timelyAnte`, before proving.
    Without it a passkey added elsewhere while the dialog was open would be silently replaced, which
    the bankDB's `camped` used to refuse. Test: `bank-gate.test.ts` "refuses a passkey added
    elsewhere while its dialog was open" (fails without the line).
  * Item 2 (`vault: bank.del() deletes the bank...`). `Bank.del` and `Gate.del` overrides removed:
    each del is Storable's (enabled, unlocked, pins, then `listing.del`). `bank.del(scope)` stores the
    bank's tombstone; adopting it revokes the lease ('tombstone'), so the cached lease goes as with
    `delPrompt`. `GateListing.tombstoneOver` is plain (next revision, `am: 'x'`, fresh `gate_tok`);
    `GateListing.doTryDel` is the one refusal, as no bankDB verb deletes a gate alone.
    `BankListing.doTryPut` and `GateListing.doTryPut` still refuse: no bankDB verb puts either row
    alone. The `WrittenByOwnVerbs` phrase now names `bank.del()` beside `bank.delPrompt()`.
  * Item 3 (`api: a gate's snapshot shows only...`). `GateSnapshot.wayins` is
    `{ main: WayinSnapshot, passkey0?: WayinSnapshot }`, `WayinSnapshot = { registered_at }`, exported.
    `Wayin.toJSON` stays: `gating.ts` `passkeyHeader` uses it. The demo's WaysIn reads only
    `registered_at`, unchanged.
  * Notes: `answer-contract.md` (*Vault put*, *Gate ops*, *The bank adapter*), `design-proof.md`,
    `design-models.md` (a `bad_option` row for `add_passkey`), the GraphQL and Convex READMEs.

* **Decisions taken**:
  * The classifier needs no per-verb policy: with `ifAbsent: 'fail'`, `ifPresent: 'repl'` a good
    answer is `replaced`, a replay of the stored record is `retcon`.
  * A bankDB `revokePasskey` over a gate with no passkey stores the next revision, still with none.
    The model never sends one (`revokePasskeyPrompt` returns early); its listing test went.
  * `gate.del()` keeps refusing: no plain meaning without inventing one (see *For the Coach*). Set
    aside: keeping `Gate.del`'s up-front override (a special case the Coach asked to drop), and
    keeping `tombstoneOver`'s thrower (it would make `doTryDel`'s refusal unreachable).
  * `bank.del()` does not lock first, as `del_bank` does: simple before failsafe; the tombstone
    revokes the lease on delivery.

* **Deviations**:
  * design.md R3 ("shared policy, not shared code") is overridden by answer (1); design.md's
    *The gate verbs' policy* (sprint worktree) is stale, for the orchestrator.
  * Pulled in: the dead `gateActVals`/`GateAct` removal, and the add_passkey precondition above.
  * Fixed in passing: Postgres `REVOKE ALL ON FUNCTION safebyok_put_gate(jsonb, jsonb, text)` named
    the old signature; now `(jsonb, jsonb)`.

* **Discoveries**:
  * `notes/guarantees.md` *The secret values* says "The snapshot shows no salt": the gate snapshot
    showed `main`'s `salt_b64` until item 3. Now true again; the file is not edited.
  * An upgraded Postgres keeps the old three-argument `safebyok_put_gate`; no migration (pre-1.0),
    the changeset says it may be dropped.
  * `notes/gallant-docblocks.md:872` keeps "Refuses `camped` when a passkey wayin is already
    stored" as an exemplar; left alone.

* **For the Coach**:
  * **What `gate.del()` means**: refuses `bad_option` (kept) vs deletes the bank. Recommend keeping
    the refusal: deleting the bank from the gate would be a destructive surprise.
  * **`bank.del()` without a prompt**: an unlocked bank deletes with no passphrase. Confirm that is
    the reading of answer (2).
