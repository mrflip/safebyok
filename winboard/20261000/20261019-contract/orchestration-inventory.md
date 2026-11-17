# Orchestration inside the core: an inventory (2026-10-19)

*Orchestrator:* the Coach's note (2026-10-19): the core is "hello (earning a vault state) → unlock
(earning a lease) → op (an operation that will 99% succeed)"; retries, refreshes and "if X then try
Y" fallbacks belong to a layer on top. A read-only subagent listed every such mechanism at the line's
tip (`20261019-a_sec`, 15f2f8bf). Each orchestration or borderline item is an *Open Matters* row;
whichever thread removes one reads its entry here. Lines are in `packages/safebyok/src/vault.ts`
unless named; they drift as threads land, so grep the private name.

1. **Re-read on an absent_box miss** (`#checkListed`): a_fixes. Ruled out; `a_sec2` removes it.
2. **Implicit hello inside every data call** (`#ensureLease` → `#helloWithin`, and again after an
   `unlocked` answer). Contract: yes (ensureLease steps 1, 4). Core.
3. **A second, forced read in unlock, ways-in changes and del** (`#unlockWith`, `#reviseWayins`,
   `#tryDel`: `#hello` then `#refresh`). Contract: del says hello first; the others are silent. Borderline.
4. **Hello's staleness gate** (`#helloWithin`, `staleMinutes`). Contract: yes. Core.
5. **Shared in-flight hello** (`#hello`/`#greeting`). Contract: yes. Core.
6. **The read queue's "one more" run** (`#refresh` over `one-at-a-time.ts`): callers arriving during a
   read share one further read. Contract: only "a forced hello while a read is under way shares that
   read". Borderline.
7. **A read after every write** (`#tryPutBox`, `#tryDelBox`, `#tryDel`). Contract: putBox step 7
   "updates the listing from what came back". Orchestration; also a throw after the write landed.
8. **A storage read before putBox/delBox** (`#getBoxOrDamaged`, `#checkStandingBoxlabel`). Contract:
   "from vault.boxes ... nothing below reads state again". Borderline, contradicts the Contract.
9. **A catch-up read on stale_write** (`#refreshOnStale`, `#catchUp`; putBox, delBox, del,
   reviseWayins). Contract: stale_write carries `meta.box_stored`; the app retries with `over`.
   Orchestration (the relock on revoked props is the one safety piece).
10. **A catch-up read before naming damaged_box** (`#decipherOrCatchUp`), so a box a reborn vault
    wrote reads `vault_locked`. Contract: no. Orchestration / borderline.
11. **A catch-up read before created_elsewhere** (`#refuseCreatedElsewhere`, from `#settleUnlock`).
    Contract: names the refusal only. Borderline.
12. **A re-read when the vault looks full** (`#checkRoomFor`). Contract: capacity best effort,
    "storage's answer wins". Orchestration.
13. **Create-if-absent inside unlock, falling through to the other device's vault** (`#settleUnlock`).
    Create: core. Trying this passphrase on the winner's vault: borderline.
14. **Trying each passphrase way in in turn** (`wayin.ts` `openWithPassphrase`). Core.
15. **Lease take-up in hello** (`#fetchLease`/`#takeUpLease` in `#greet`). Contract: hello step 2. Core.
16. **The background watch** (`#watchStorage`, `#watchRefresh`): each ring runs a hello or a read,
    warns once per failing streak, reports recovery. Contract: starts the watch; "nothing polls".
    Borderline.
17. **Forget the hello on a failed read** (`#readStorage`, `#greet`, `#heedRefusal`). Core.
18. **Self-lock timer; relock on revocation** (`#armExpiry`, `#takeStorage`, `#whyAsk`). Core.
19. **One prompt shared by all callers** (`#asking`, `#raiseAsk`). Core.
20. **Ask stand-down races** (`ask.ts` `#over`/`#landed`, `#grantLease`, take-up aborts). Core safety.

React:

21. **The provider's own hello on mount** (`vault-provider.tsx`, `sayHello`). The outer layer driving
    the core. Borderline only in that it duplicates #2.
22. **`retryOpen`, `delDamagedVault` then `sayHello`**: user-triggered, no loop. Orchestration of the
    right kind.
23. **The dialog's wrong-passphrase loop, its `carry_on`/decline**: the dialog's, as the Contract says.

No timers, backoffs, polling or retry-until-success loops are in the core; every re-read is "read once
more" (#1, 7, 9, 10, 11, 12), and none repeats a failed write. The Contract's home for orchestration is
*Batteries* (retry with backoff over p-retry, D1) and *Layers above the core*.
