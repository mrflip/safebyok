# Thread 8, cut in three (and 8d)

*Orchestrator, 2026-11-12:* an opus planner read the models as thread 7 left them and the BankDB
contract as threads 3 and 4 build it, and proposed this cut. Handoffs for 8a to 8d quote it. Line
counts are estimates. The line is red from 8a's tip and green again at 8c's (ground rule 20).

## The cut

**8a `bank_keys`** (thread 8's item 6, and the value half of item 4). `BankStamp`, `GateStamp`,
`LeaseStamp` (`fmt` 7003, citing `gate_tok` and `gate_revision_tok`). The wayin ctx becomes
`[bankStamp, gateStamp]` with `wayinlabel` in the header; the lease ctx and the box ctx gain
`bankStamp` at the front. The lease row is keyed `[user_id, banklabel]`. `Gate` becomes a plain
value over a `GateRecord` (`main`, `passkey0`). `judgeStrength` is handed the bank's scope.
`leaseSealArgs` takes a list of stamps, so the box ctx `[bank, vault, box]` can pass through.
* Files: `shapes-gateish.ts`, `wayin.ts`, `proving.ts`, `gate.ts`, `lease.ts`, the deviceDB part of
  `shapes-storage.ts`, `device-db.ts`, `memory-device-db.ts`, `idb-device-db.ts`. About 200 src lines.
* Tests: `proving-world.ts`, the proving, wayin, gate, lease and ctx-bytes suites, the device-db
  battery. `ctx-bytes.test.ts` changes on purpose, to the ruled ctx table.
* Red at its tip, mended by 8b: `tsc` in `vault.ts`, `vault-listing.ts`, `gating.ts`, `bank.ts`
  (autolock) and `device.ts`, so safebyok-react does not build; suites over `vault-world` or
  `bank-world`; ctx-bytes' "real box stamp" case.
* Open first: `tests/test-helpers/proving-world.ts`, then `proving.ts` *[Methods]*. Counterparts:
  `wayinCtxOf` in `wayin.ts`; *[The vault's stamp]* and *[The lease's forms]* in
  `shapes-gateish.ts`; *Gate forms* in `shapes-bankdb.ts`.

**8b `bank_switch`** (item 2; item 3 without `delPrompt` and `autolock`; the Storable half of
item 4: the stub listings and the gate row delivered; item 5 for `build_bank` and `unlock_bank`;
item 7). `Listing` moves from `vaultDB` to `bankDB` and from `world` to `parent`. The Vault's
*[Unlocking]*, *[The lease]* and *[The lease's friend]* sections move to the bank nearly verbatim.
The fixture builders (`models-world`, `bank-world`, `vault-world`; `TestableVaultDB` seeds a vault
row carrying a gate) move to the bank here, once: 38 test files build on them, so they cannot wait
for 8d. Pulls one bullet forward from thread 10: `Storable`'s `vault_tok` moves down to `Vault` and
`Box` (storable.ts tattoos it from every record), since `Bank` and `Gate` cannot be Storables
otherwise. The minimal React edits for the renamed gatingkinds land here.
* About 450 src lines added, 350 removed.
* Red at its tip, mended by 8c: safebyok-react `tsc` (the Vault's three wayin prompts are gone);
  skipped by name: `vault-gate`, the gate-kind cases in `gating`, the delete and tombstone cases in
  `bank-ending`, autolock in `bank.test`.
* Open first: `listing.ts` *[Props]* and *[Delivering]*; `vault-listing.ts` is the template for
  `BankListing` and `GateListing`; vault.ts *[Unlocking]*, *[The lease]*, *[The lease's friend]*
  and gating.ts *[The acts]*' `build_vault` go to `bank.ts` and `gating.ts`; today's `Bank`, which
  ducks as a `ListingWorld`, shows what must answer to the bank. Tests: `models-world.ts` first.
* Startup must ask `ensureBank` once, not twice (`device.ensureBank` and the vault listing's
  `list()`, whose `doTryList` is `ensureBank`): one feeds the other.

**8c `bank_prompts`**: the three prompts on `Gate`, the gate verbs moved from `VaultListing` to the
gate over `bankDB`. Replace, add and revoke re-grant this device's lease citing the new
`gate_revision_tok`. `delPrompt` launches `del_bank` and calls `delBank`; a bank tombstone
delivered drops the lease and leaves `device.bank` null. `autolock` peeks the one lease row. The
Vault gets its three prompt one-liners (the scaffold of ground rule 11), and React compiles. About
250 lines added. It unskips everything 8b skipped.
* Open first: `gate.ts`. Counterparts by `git show e0f05d4c1:`: vault.ts *[Changing the gate]*,
  vault-listing.ts *[The gate verbs]*, the replace, add and revoke acts in gating.ts; for
  `del_bank`, the `delVault` act at `git show 06e4e4b8d^:packages/safebyok/src/models/gating.ts`.

**8d `bank_gate_tests`** (the plan's former 8b): the new tests of `threads.md` § 8 item 8, and
item 9: `guarantees-bank.md` promoted into `notes/guarantees.md` against the code, and VOCABULARY.

## Atomic, and the scaffolds

* `Listing` is the base of both the vault and the box listing, so both move to `bankDB` together.
* The vault row has no gate in the new contract, so the vault listing's switch, the Vault losing its
  gate and lease, and the lease landing on the bank are one step.
* Proving, wayin and gate stamps move together.
* No scaffold in `src/` beyond ground rule 11's; red `tsc` and named skips stand in between.

## Where the design reads wrong against the code (ground rule 4)

* `Storable` wants a `world` until thread 10; the Bank's would have to be the Device ducking as a
  `ListingWorld`, which the design says it does not do. (Open Matters.)
* Device-side "policy checked before each call": the record is built from the ante, so the policy
  holds by construction. *Coach, ruled:* make the new code look like the current code; no added
  check on the device; the bastion adapters re-run the policy inside their databases.
* `Bank` has two enabled flags in 8b (Storable's and the device's) until thread 10.
* `ensureVault` refusing `bank_locked` "where it would have to put" judges by the listing: a vault
  stored but not yet listed is refused where a get would have found it. (Open matters, rule 2.)
