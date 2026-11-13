# Sprint bank_world: done

2026-11-13. Mode: YOLO. The sprint moved safebyok from a vault-per-gate model to one bank per user and app. A bank has one gate, one lease and one lock; the BankDB is the only storage contract, every adapter implements it, and the VaultDB stack is deleted. After two Closer Looks and the Coach's answers, the last threads made five more changes:

- A listing's list is its present things.
- The gate verbs are plain puts.
- Convex's tidyGone works in batches and reports a bound on what is left.
- A storage answer carries the record the datastore stored, checked against the record sent.
- A deleted Vault stays enabled.

Plan, threads and reviews: [bank_world-plan.md](../whiteboard/20261112-bank_world/bank_world-plan.md). The Coach's rulings and the orchestrator's own calls: [bank_world-resolutions.md](../whiteboard/20261112-bank_world/bank_world-resolutions.md).

## Already merged

#657, #658, #660–#663, #665–#675, #677, #679 (2026-11-12); #680, #681, and the line #682 → #684 → #683 → #685 → #686 → #687 → #688 → #689 (2026-11-13). Tooling: #659, #664, #676.

## The line still open, in merge order

Stacked as main → #691 → #692 → #693 → #694 → #695 → #690 → #678 → #656. **The top is #656 (this sprint PR): merge it with a merge commit and the whole line lands.** Each PR's base is main.

| PR | Thread | What it does | Review |
|---|---|---|---|
| #691 | 20 `listing_membership` | A listing's list is its present things: tombstoned and damaged things are delisted, `damaged_rows` is gone, the device makes its own snapshot, a throwing unwatch goes to `tellBadNews` | fixed (high) |
| #692 | 21 `gate_verbs_plain` | Gate verbs are a plain put through `doPutGate`; `bank.del()` deletes; the gate snapshot shows only `registered_at` | fixed |
| #693 | 23 `closer_fixes` | The Closer Looks' plain fixes (a)–(l); `VX.Promptly` is one hour; `isKept`, `maxParentMillis`, `Bank.demandEnabled()` | fixed |
| #694 | 24 `stored_record` | Answers carry the stored record, not the record sent; buildBank's answer is checked too (`demandDeliveredAs`). Hosts rerun `BankFunctionsSql` and redeploy the Convex component | flagged, reworked, fixed (high) |
| #695 | 25 `vault_enabled` | A deleted Vault stays enabled; its calls answer what storage has | fixed |
| #690 | 22 `convex_tidy` | `Tidied.leftover`: `'none'`, `'some'` or `'many'`; Convex tidyGone deletes in batches of up to 1000 | fixed |
| #678 | G `guarantees_bank` | `notes/guarantees.md` restated for one gate per bank and rechecked above 20–25; `notes/security.md` records `bank.del()` without a prompt and the hour's Promptly | fixed (its wrapup review); the update leg above 20–25 is docs only, not reviewed |
| #656 | the sprint PR | Plan, progress, resolutions, Closer Looks, this note | -- |

## YOLO decisions

All are in the resolutions file, with the Coach's answers. The last, buildBank's `as_sent` check (#694), was approved on 2026-11-13.

## Answered after the close

The Coach, 2026-11-13, in chat. These were the last questions; none is left open.

- A wayin change goes on making other devices prove again: "Yes".
- The three rows left on *Open Matters*: "1-3 approve". These were the buildBank `as_sent` check (#694); `putBox` and `beginWatch` on a deleted Vault refusing `vault_gone` (#695); and a lease cached before a gate change elsewhere loading for up to an hour (#678). On that last one: "Yes. subscriptions, polling, and page reload/backgrounding set the floor for staleness, and it's under customers' control".

## Carried to the next sprint

From *Cleanup*'s *Finally*, not done in this sprint:

- **The React rework.** The demo brings in TanStack; safebyok-react offers what it needs. 19's TODO regressions are its list, along with:
  - a Vault's new life not restarting its box watch;
  - `alignLock()` → `lock()`;
  - the `delUnlocked` helper and the extra `ensureUnlocked` calls.
- **Library first for Listing's sync work** (revision order, freshness horizons, joined gets).
- **Design notes:** the watched `life_tok`.
- **Side quest:** `@repeaterjs/repeater` for the GraphQL server's iterator.
- **Docs:**
  - gallant.md's #no-fake-values / #ask-the-host pair, around the real flow;
  - design-models.md, design-proof.md and gallant*.md, stale beyond names (they still name `demandPromptable`, `demandAttachable` and `maxWorldMillis`);
  - VOCABULARY's *lease* row;
  - hooks.ts's banner.
- **notes/guarantees.md's next restatement:**
  - one "verified against <sha>" sentence;
  - split G4 and "Besides these files";
  - "is made anew";
  - "no leaseKey and no bankKey".
- **Tidies:**
  - Bank's `demandEnabled().demandPresent()` chains, including `#demandLease`;
  - the unused throwers `alreadyListed` and `recordForNewBox`;
  - narrowing `del`/`delBank`/`delBox`'s `| null`;
  - a non-null gate on `BankBuildStored`/`GateStored`;
  - a required written row on the `*Stored` types (#694);
  - the duplicate `noUnwatching` in safebyok-graphql.
- **TODO entries:**
  - the Convex component's tally and weight-cap tests;
  - the e2e graphql-bank-db watch test that failed once;
  - Convex delBank with no leftover (#690).
- **Tooling:** tests/scripts' `isolatedEnv` leaks `GIT_DIR`, `GIT_INDEX_FILE` and `GIT_WORK_TREE`.
- **Watched for, not built:** a box drops its exposed whisper only because every event that disables it also calls `alignLock()`. A redesign of what disables a box must keep that call.
