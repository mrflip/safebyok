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
| 5 | `packages/safebyok/tests/one-at-a-time.test.ts` | queues a call made during the queued run behind it, never beside it | turn-queue order (ground rule 10): the refresh joins the run under way |
| 5 | `packages/safebyok/tests/vault/vault-races.test.ts` | is still created_elsewhere when the catch-up after it fails, the snapshot saying it is not syncing, and the failure warned of | in-call refresh (ground rule 10): a lost first unlock reads nothing more |
| 5 | `packages/safebyok/tests/vault/vault-races.test.ts` | deleted elsewhere once a read took it up: the make stands down, nothing unlocked and no lease left, the vault absent | abort controller (ground rule 10): `#createsStandDown` is gone; the race is flagged (thread file, *Races flagged*) until thread 7 births a novel Vault |
| 5 | `packages/safebyok/tests/vault/vault-races.test.ts` | a store refused as stale whose catch-up finds the passphrase changed elsewhere relocks the device, and writes nothing | in-call refresh (ground rule 10): a stale write refuses as it came; a hello relocks |
| 5 | `packages/safebyok/tests/vault/vault-races.test.ts` | a store whose catch-up fails is refused as stale, the failure its cause, saying so, and still carries what won as meta.box_stored | in-call refresh (ground rule 10) |
| 5 | `packages/safebyok/tests/vault/vault-races.test.ts` | a store whose catch-up is refused as identity_revoked throws that refusal as it came, never as stale: the user signed out: the vault locks, and the user signs in again | in-call refresh (ground rule 10) |
| 5 | `packages/safebyok/tests/vault/vault-races.test.ts` | a store whose catch-up is refused as rolled_back throws that refusal as it came, never as stale: storage handed back an older copy: the vault locks, forgetting its vault props, and storage wants looking at | in-call refresh (ground rule 10) |
| 5 | `packages/safebyok/tests/vault/vault-races.test.ts` | a store whose catch-up is refused as newer_format throws that refusal as it came, never as stale: a newer build wrote the vault: the app wants updating | in-call refresh (ground rule 10) |
| 5 | `packages/safebyok/tests/vault/vault-races.test.ts` | a deletion whose catch-up is refused as identity_revoked throws that refusal as it came, never as stale | in-call refresh (ground rule 10) |
| 5 | `packages/safebyok/tests/vault/vault-races.test.ts` | a deletion whose catch-up is refused as rolled_back throws that refusal as it came, never as stale | in-call refresh (ground rule 10) |
| 5 | `packages/safebyok/tests/vault/vault-races.test.ts` | a deletion whose catch-up is refused as newer_format throws that refusal as it came, never as stale | in-call refresh (ground rule 10) |
| 5 | `packages/safebyok/tests/vault/vault-races.test.ts` | a deletion whose catch-up fails says so, the failure its cause, rather than that the vault is gone | in-call refresh (ground rule 10) |
| 5 | `packages/safebyok/tests/vault/vault-hello.test.ts` | is told the bad news a catch-up meets, though the write refuses only as stale, that news its cause | in-call refresh (ground rule 10): a stale write reads nothing after |
| 5 | `packages/safebyok/tests/vault/vault-lease.test.ts` | takes up nothing from the lease a stood-down attempt wrote, though a hello reads it before it is erased (Contract: getProof, attempt refuses: vault_locked) | lease take-up outside birth (`primitives.md`, *Vault and bank*): a hello takes no lease up; and the attempt's erase after its write is gone (ground rule 10), a lock's erase landing behind the write in the device store's order |
| 5 | `packages/safebyok/tests/vault/vault-lease.test.ts` | erases the lease an attempt wrote when the user cancels as it writes it, so a reload opens locked (Contract: getProof, attempt refuses: vault_locked) | after-wait erase (ground rule 10), narrowed by `primitives-toldjaso.md` 8: a cancel declines this prompt only, and an attempt past its demand before `putLease` leaves its lease written |
| 5 | `packages/safebyok/tests/vault/vault-storage.test.ts` | is accepted on the very handle that refused it, its mark erased and hello said again, as the Vault's class doc says: unlock and a change to the ways in then land | a late read of this tab's own write is ignored (`primitives-progress.md`, *Rulings in force*; `guarantees-audit.md` 6): a handle holding the newer vault props ignores the older copy rather than refusing it, so there is nothing on it to accept; a handle made anew still refuses and accepts it, as the README's recipe test keeps |
| 5 | `packages/safebyok/tests/vault/vault-boxes.test.ts` | catches up with storage before refusing: room another device made unheard is found | in-call refresh (ground rule 10): `vault_full` is judged from the listing in hand; rewritten as "counts from the listing in hand, reading nothing first: room another device made unheard is found by a hello" |
