# primitives: tests retired

The ledger (the plan, *Ground rules* 1). No test is deleted without a line here naming its file,
its title, and the ruling that retired it. A test of behaviour that survives is rewritten, not
retired, and does not appear here. The thread reviewer checks each PR's deletions against this
file; the PR body carries the per-file counts (before, after, retired).

Counts at the sprint's start (`grep -c 'it('` in `packages/safebyok/tests`): 1472 cases in the
core; the vault themes this sprint touches hold 575 (lease 114, wayins 94, races 66, hello 79,
boxes 107, make 73, del 25, twins 17), plus the unit files wayin 47, box 43, proof 35, lease 27.

Rulings that retire a test, by name: **in-call refresh** (ground rule 10), **abort controller**
(ground rule 10), **lease take-up outside birth** (`primitives.md`, *Vault and bank*),
**turn-queue order** (ground rule 10), **Outcome shape** (ground rule 12), **primitive moved**
(the primitive it tested no longer exists, named).

| thread | file | title | ruling |
|---|---|---|---|
