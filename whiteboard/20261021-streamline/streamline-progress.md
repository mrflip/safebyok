# streamline: progress

What the sprint's threads have taught, newest wins. Workers look things up here; the orchestrator
keeps it. Newer than the plan and the preplan wherever they disagree.

## Rulings in force

None yet. Until the Coach rules on an Open Matter, threads take its Rec (the plan, *Ground
rules* 3).

## Threads

| # | Label | Status | PR |
|---|---|---|---|
| 1 | renames | filed | #243 |
| 2 | get_vault | building | |
| 3 | turns | planned | |
| 4 | bank | planned | |
| 5 | device_id | planned | |
| 6 | proving | planned | |
| 7 | gate | planned | |
| 8 | gating | planned | |
| 9 | react | planned | |
| 10 | docs | planned | |

## What the threads found

### Thread 1, renames (#243)

*Orchestrator:* every name is `vault_tok` / `gate_epoch` (`vaultTok`, `gateEpoch`,
`Expectations.vaultTokMeets`, `standingVaultTok`, `StoredVaultTok`). Convex `watchVault` answers
`{ vault_tok, gate_epoch, boxes }`; Postgres constraints are `..._vault_tok_key` and
`..._vault_tok_fkey`. ctx binds values positionally, not field names, so ctx bytes did not
change. VOCABULARY's rule: an `_id` is a hard identifier, a `_tok` is only compared. Postgres
tests run on PGlite locally; CI also has a live Postgres job; `SAFEBYOK_PG_URL` is unset in
this environment, so the live suites skip here.
