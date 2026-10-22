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
| 4 | `packages/safebyok/tests/test-helpers/vault-db-conformance.ts` | lists every box as stored through listBoxRecords, for a server to serve: each record whole but for its two ciphered fields (one case per adapter battery) | primitive moved: `listBoxRecords` is gone; the same guarantee is `getVaultRecords`' (line 2.4's test) |
| 4 | `packages/safebyok/tests/test-helpers/vault-db-conformance.ts` | `rivalCreates` timing check: settles two creates of one vault made at once on one vault record (one case per adapter battery) | primitive moved: `ensureVaultProps` is gone; `rivalEnsures` races the same creation through `ensureVault` |
| 4 | `packages/safebyok/tests/test-helpers.test.ts` | fails a check-then-write split by an await in this process, its round trips unheld: rivalCreates (and its two siblings: split across two round trips over a wire; a second device six round trips late) | primitive moved: the `rivalCreates` handle is gone with `ensureVaultProps`; `rivalEnsures` stays in the list |
| 4 | `packages/safebyok/tests/vault/vault-races.test.ts` | refuses a first unlock as created_elsewhere, creating nothing, and says to set the passphrase on that device | primitive moved: gateless props are now gated by the first unlock (ensureVault then putVaultProps); replaced by "takes a first unlock's passphrase as its gate" |
| 4 | `demos/safebyok-demo-react/tests/lib/outage.test.ts` | lists a box its inner adapter finds damaged as damaged (the non-JSON row and the row missing its whisper) | primitive moved: `doListBoxes` is gone; the outage adapter relays `getVaultRecords`, which cannot name a row that is no object, and a whole-read check of each box is no longer made. Rewritten for a row that names its boxlabel and fails its checks |
| 4 | `packages/safebyok/tests/vault-db.test.ts` | the "RefusedWrites" rows and the `ensureVaultProps`/`getVaultProps`/`listBoxes`-specific tests, rewritten for `ensureVault`, `getVault`, `getVaultRecords` (renamed, not retired); only the one row "a draft naming another scope than the one it came with" retired | primitive moved: `ensureVault(draft)` takes one argument, so its scope cannot disagree with the draft's |
