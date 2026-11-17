# Wrap-up review of the primitives line: final report

Status: **flagged** (report only: no fixes, no commits, nothing pushed). Range 381b5339...89b65977, read at 89b65977.

`pnpm justify` passes at 89b65977:

| package | passed | skipped |
|---|---|---|
| core | 3139 | 37 |
| indexeddb | 164 | 11 |
| postgres | 318 | 15 |
| fastkey | 49 | 0 |
| react | 300 | 0 |
| convex | 316 | 9 |
| graphql | 323 | 15 |
| demo | 227 | 17 |
| e2e | 107 | 116 |
| root | 265 | 0 |

The size budgets hold.

This report adds to the partial one. Findings 1–6 are not repeated; new findings start at 7.

## How the review ran

By hand: no `/code-review`, since a whole line of 231 files is not one diff to review at once. I split it across six opus helpers. All six reported:
- vault.ts and bank.ts against the rules;
- gating, proving, lease, box, gate, wayin, device-db, idb and the vault-db wrapper;
- secrets, React (threads 10 and 7b) and the route recipe (thread 12);
- the *Contract, primitives* tab against the code;
- the eight contract races and the tests-retired ledger;
- the adapters, and notes/security.md.

The notes/security.md sweep went to three more helpers, whose results the orchestrator relayed to me. I re-checked these against the files myself:
- U1, S1, U4, M2, U3 and U6;
- the first-gate kind (finding 8);
- the vacuous renewal test (finding 9);
- the Postgres race (finding 10);
- finding 11's README line;
- finding 12's putBox doc block.

## Verdict

The line holds the demand model. Each primitive demands before its junction and after it. The only awaits with no demand are the recorded exempt ones. Nothing in the core retries, re-reads mid-call, aborts or reconciles beyond the recorded rulings. The only mutexes are the spec's four plus `oneAtATime`. Each catch only classifies a refusal, and each is recorded.

No secret leaves through a side door in the new code:
- **Gating and proving:** `requestCleartext`'s throw and the strength checker's are dropped whole; a deriver's keeps only its kind. No vaultKey is returned. The byte arrays are zeroed. The cryptography is unchanged from 381b5339 (crypto.ts changed in comments only).
- **React:** passphrase fields are uncontrolled, and nothing typed reaches state.
- **Route recipe:** `refusal.meta` is built from an allowlist.

Nothing blocks the sprint. What remains is drift between the Contract or docs and the code, one first-gate refusal kind that is unrecorded and untested, a vacuous race test, and a long tail of low items.

## The earlier review's items (core-line-review.md)

- **Closed, verified against the code:**
  - **U1:** `putLease` resolves an Outcome. `grantLease` demands at proving.ts:193-194 before `valOf`. `#grantAfterChange` (gating.ts:408-416) swallows only `storage_unavailable` and `storage_blocked`, and rethrows when the call is `ensureUnlocked`. A `gating_landed`, a vault that moved on, or a deriver or HKDF throw is never swallowed. The warn-and-resolve itself is thread 9's recorded decision, left for a ruling.
  - **S1:** vault-opts.ts:375-387.
  - **U4:** gating.ts:262-264.
  - **M2:** `{ gating }` is required; `StandingGating` remains, for tests only.
- **Closed per thread 9b and its opus review (plan:577); I did not re-trace them:** U2 and U5.
- **Still open, recorded as Coach rows with no ruling found in the sprint files:**
  - **U3:** vault.ts:1071 and 1936-1944.
  - **U6:** vault.ts:1045-1046.
  - **M1:** gating.ts:160-224, unchanged.
- **M4, part closed:** 9c folded the four gate-write classifiers into `#gateWriteRefusal` and removed the wayin casts. Three parts remain:
  - `leaseRecordOf` stays, for tests only (lease.ts:265).
  - `#dropDamaged` still erases through `tryLock` (lease.ts:249).
  - The Lease and Gate stamps are still enumerable.

## Findings, ranked (numbering continues from the partial report)

### Medium

7. **The Contract documents `vault.checkPassphrase`, which does not exist.**
   - Where: Contract lines 27, 132, 138 and 266-268. The method was retired for `checkStrength` (tests-retired.md:149, thread-10-react.md:22).
   - What a customer sees: following the Contract gets a `TypeError: vault.checkPassphrase is not a function`. There is no `{ strong, reason }` verdict call; the only route to the reason is `tryCheckStrength`'s message on `weak_passphrase`.
   - Line 138's list of calls exempt from `vault_gone` is also wrong: the code exempts `checkStrength` (vault.ts:139-140, 485-494).
   - Rec: rewrite the Contract's checkPassphrase entry as `checkStrength`/`tryCheckStrength`, with what each returns.

8. **A first gate that loses a race mid-chain refuses `gate_moved`, not `gate_made_elsewhere`.**
   - Where: gating.ts:309-315, with vault.ts:1143 and 1153.
   - `#initializeGate` tests for `gate_made_elsewhere` only at `freshen` and at `putGate`'s refused write. Suppose a refresh takes another device's first gate (epoch 1) during the strength check, the Argon2 seal or `sealWayins`. Then the next demand fails as `gate_moved`: on the `{ gate_epoch: 0 }` stamp at vault.ts:1143, or on the fresh proving at vault.ts:1153.
   - What a customer sees: a host that branches on the documented `gate_made_elsewhere` ("enter the passphrase chosen there") shows "unlock again" instead.
   - Every `gate_made_elsewhere` test uses `deafVaultDB` (vault-races.test.ts:284, 298), so this window is never run. Thread 9's `vault_not_novel` decision covers only the state at the chain's start.
   - Rec: have the first-gate chain's demands refuse a gated picture as `gate_made_elsewhere`, and add a test with a ringing store.

9. **The renewal race test is vacuous.**
   - Where: vault-races.test.ts:1086.
   - The test runs `world.advance(60_000)` under the 7-day lease, then `TH.unlock`, which is `tryEnsureUnlocked()` with no `renewMinutes`. That resolves at once (test-helpers/gating.ts:43-50; vault.ts:362-372), so no gating runs and no lease is granted while `putBox` is held.
   - The spec race "a renewal during a box write in flight" is therefore untested. The passkey-change sibling at :1100 does hold its race.
   - What anyone sees: nothing, beyond a false sense of coverage.
   - Rec: renew for real (`ensureUnlocked({ renewMinutes })` near the lease's end, with the gating answered), or use a short `leaseHours`.

10. **Postgres: an `ensureVault` racing a `delVault` restarts the counter, and docs still promise otherwise.**
    - Where: postgres-vault-db.ts:134-141 (`EnsureVaultSql`) and 290-297 (`DelVaultSql`).
    - Under READ COMMITTED the new life starts at `vault_epoch` 0, with the tombstone left beside it. I worked through the SQL and agree.
    - The race itself is recorded and fails safe (toldjaso 16): a device that saw the higher epoch refuses `vault_behind` until `clearCachedVault`.
    - Three things stay untrue:
      - the adapter doc's "every guarantee holds under READ COMMITTED" (postgres-vault-db.ts:67);
      - vault-tables.ts:41, "a row of vault props or a tombstone, never both";
      - notes/security.md:270, "never goes down across a deletion".
    - New detail: `DelVaultSql`'s `ON CONFLICT DO UPDATE SET vault_epoch = EXCLUDED.vault_epoch` can then overwrite that stale tombstone with a lower counter.
    - Rec: make the doc lines name the race, and use `GREATEST` in `DelVaultSql`'s `ON CONFLICT`. Keeping the tombstone in the vault row stays the Coach's call (toldjaso 16).

11. **The React README names the wrong refusal after a sign-out the app did not hear of.**
    - Where: safebyok-react/README.md:216-218, which says "the call refused `vault_locked`".
    - What the code does: `#heedRefusal` (vault.ts:1399) resets `#readAt`, so the next call's hello refuses `identity_revoked` before any dialog. A dialog already up settles its waiters with `identity_revoked` (gating.ts:205). The route-recipe test expects exactly that (route-recipe.test.ts:254).
    - What a customer sees: one who reads `vault_locked` as "cancelled" mishandles a sign-out.
    - Rec: say `identity_revoked`, and that no dialog opens.

12. **A box write to a vault deleted or made anew: three docs say `stale_write`; a partial put refuses `vault_gone`.**
    - What the code does: a whole `putBox` refuses `stale_write` with only a `cause` and no `meta` (vault.ts:1736-1738). A sidecar- or whisper-omitted `putBox` reads first, gets `vault_mismatch`, and refuses `vault_gone`, letting the Vault object go (vault.ts:1631-1636, 1694). The asymmetry is recorded (thread-7-bank.md).
    - What the docs say:
      - the putBox doc block (vault.ts:605-606) says `stale_write`;
      - Contract 393 says "a vault says `vault_gone`";
      - Contract 220 says `stale_write`, with a `meta.box_stored` that is not sent.
    - What a customer sees: a host branching on either kind misses half the cases.
    - Rec: state both kinds, by call shape, in the doc block and the Contract.

13. **The Contract says an unlisted box is answered "at once, asking nobody", which is true only while locked.**
    - Where: Contract 210 (`no_whisper`), 224 (`getBox` null) and 236 (`delBox` `absent_box`). The doc blocks at vault.ts:652-653, 681 and 711-712 say the same.
    - What the code does while unlocked:
      - `getBox` reads storage, and can return a box the listing lacks (vault.ts:1597-1603);
      - `delBox` sends `revision_tok: null` and deletes another device's box, as `deleted_other` (vault.ts:735-745);
      - a whisper-less `putBox` reads, and keeps a whisper stored elsewhere.
    - The design is recorded (thread-6-lease_box.md:22, 78).
    - Rec: reword those Contract lines and doc blocks to "while locked".

14. **The Contract's Box view (307) lists `vault_tok` as shown by JSON and a spread.**
    - What the code does: the stamp is non-enumerable and `toJSON` leaves it out (box.ts:146-150, 278-281).
    - Contract 306 is untrue too: it says a Box is made only from a successful put or a read, but `Box.seal`/`trySeal` and the public `Box.make` make one otherwise.
    - What a customer sees: code reading `box.vault_tok` from `JSON.stringify` output finds nothing.
    - Rec: correct both Contract lines.

### Low

15. **Smaller Contract lines the code makes untrue.**
    - **Gating chains:**
      - 290: the strength check runs before the provings, not beside them.
      - 292: in `change_passphrase`, a weak `next` with a wrong `current` refuses `weak_passphrase`.
      - 301: `lockLanded` still settles once a sent deletion is refused.
    - **Bank:**
      - 87: a throw from `onBadNews` at birth is only logged; the bank has no `trouble`.
      - 104: `ensureVault`'s list of refusals leaves out three: `vault_gone` when the vault is let go during birth, `vault_gone`/`vault_remade` just after birth, and `unexpected_error` from the load.
      - 108: `closeVault` still refuses `bad_label`.
    - **Vault calls:**
      - 144: a hello within `staleMinutes` does not share a read in flight.
      - 155: hello's refusals leave out `storage_blocked` and `corrupt_record`.
      - 250: "unlocked" after `putWayin` contradicts line 299 when the device store refuses the grant.
      - 254: `putWayin('passphrase')` on a novel vault can refuse `gate_made_elsewhere`.
    - **Wording:**
      - 13: "any failure is `damaged_box`" contradicts line 315.
      - 15: "the vaultKey never crosses a method boundary" overstates; it is passed in, never returned. This matters to a security reviewer.
      - 20: a Lease carries no `vault_epoch`.
    - **Public surface the Contract does not describe:**
      - the standalone `delDamagedVault`;
      - the getters on Vault (`logger`, `keyDeriver`) and Bank (`applabel`, `status`, `snapshot`);
      - Box's `seal`/`trySeal`, `baseRevisionTok` and `toJSON`;
      - the Lease and Wayin classes;
      - the error helpers;
      - the adapter kit.
    - **Kinds are clean:**
      - `RefusalKindVals` (errors.ts:96-138, 41 kinds) matches the Contract's table and the README's table exactly, family for family.
      - Every kind thrown in src is listed.
      - `CorrectableKindVals` matches Contract 286.
      - `box_moved` and `vault_not_novel` are recorded as not added. Thread 5 still calls `box_moved` an open matter while the Contract calls it dropped.
    - Rec: thread-11-style Contract edits, plus a Coach call on which parts of the public surface the Contract should name.

16. **U3 and U6 remain open, the code unchanged.**
    - U3: another tab's newer lease still drops this tab's lease in memory, so the snapshot flickers to `locked`.
    - U6: a tab already holding the newer picture ignores a rolled-back read rather than reporting it. Its listing freezes and every hello re-reads until the next birth.
    - The helper adds an input for the Coach on U6: `#takeStorage` reads the device record before `getVault` (vault.ts:1012-1013). So on a store that never serves stale reads, testing `vault_behind` first cannot misfire on this tab's own late write.
    - Rec: rule on both rows.

17. **`#ensureUnlocked` says hello before its sync lease check (vault.ts:1204).**
    - So every box call reads storage once `staleMinutes` have passed. That differs from primitives.md's `ensureUnlocked` row and from *Composition*'s "never calls refresh".
    - The Contract and plan:356 have it; no Deviations entry records it.
    - Rec: the Coach confirms it, and the spec row records it.

18. **Try-pair exceptions that no thread file records.**
    - `useWhisper` has no `tryUseWhisper` (vault.ts:703; the README at :855 says so).
    - `Bank.closeVault`, `closeVaults` and `entryOf` are single sync forms (bank.ts:76).
    - The gating attempts are Outcome-only, and not named `try…` (gating.ts:51-83).
    - Rec: record these exceptions to ground rule 12, or add the missing halves.

19. **`putLease`'s answer is read before anything checks it (proving.ts:194).**
    - A DeviceDB still on the old void answer throws a TypeError, which becomes `unexpected_error`. After `putWayin`'s gate has landed, `#grantAfterChange` rethrows it, so the call refuses although the change stands.
    - An answer in another shape refuses `vault_remade`, a misleading kind for an adapter bug.
    - Rec: check the answer as `corrupt_record` or `bad_option` before the demand.

20. **A gate write that landed can still refuse `gate_moved` (vault.ts:1325).**
    - The race: another device writes on top, and our watch takes that gate before our write's answer arrives. This is as the spec orders it.
    - What a user sees: the message says nothing more was done, though the user's change did land.
    - Rec: let the message say the change may have landed, and that a hello will show what stands.

21. **During a sent deletion, a decline followed by a lock leaves `{ lock: false }` (`??=` at gating.ts:210 and 220).**
    - When storage then refuses the deletion, `lockLanded` never settles.
    - Rec: let a lock overwrite a decline's mark.

22. **The IndexedDB device record and the ordering suite.**
    - `idbDeviceDB.getDeviceRecord` deletes an unreadable row unconditionally after an await (idb.ts:115-118). A `raiseDeviceRecord` landing between the read and the delete is erased, breaking "never lowers" and per-scope order. `getLease` re-checks in its transaction (idb.ts:152); this does not.
    - device-db.ts:21-25 and security.md:307-313 say `describeDeviceDB` checks per-scope order, but it tests leases only (device-db-conformance.ts:83).
    - Rec: use `getLease`'s re-checking discard, and add a device-record ordering case to the suite.

23. **The route recipe's `isKind` accepts any `RefusalKindVals` kind, and the dialogs show the message (route-recipe.test.ts:172; modal.tsx:129; passkey-unlock-button.tsx:258).**
    - So a hostile route could answer with `wrong_passphrase` and text of its own, which the dialog shows in place while the gating stays open.
    - It matters only where the backend is distrusted beyond confidentiality.
    - Rec: let `checkedAnswer` accept only the kinds a VaultDB refuses.

24. **The Postgres README does not name the known residual (safebyok-postgres/README.md:226-234).**
    - `vault_props_stored` in the main meta carries both wayins' salts and wrapped vaultKeys. The next bullet stresses that a refusal never carries them, which a host may read as a promise about the whole answer.
    - Likewise, a `putBox` `stale_write`'s thrown `meta.box_stored` is the full record, with `box_key_wrapped` and `whisper_ciphered` (vault.ts:1729-1740). This is documented and not secret, but it is a wrapped key in a thrown value.
    - Rec: one README sentence telling hosts not to log answer bodies or whole VaultErrors.

25. **React README lines the code makes untrue.**
    - :515-517 sends a user who forgot the passphrase to *Starting over*, which is no longer offered.
    - ~:205 says `delDamagedVault`'s `stale_write` leaves the entry as it was, but bank.ts:289 lets it go.
    - Dead code: the `startOver*` strings in messages.ts:57-60.
    - Rec: fix both lines and drop the dead strings.

26. **No field to confirm a new passphrase (passphrase-modal.tsx:152, gating-modal.tsx:114).**
    - A typo in a changed passphrase also drops the passkey, and the vault is lost once the lease ends.
    - This is a design question, not a regression.
    - Rec: the Coach decides whether to add a confirm field.

27. **The ledger has gaps.**
    - Two React tests were deleted in thread 9 (commit 6e9327ae, passphrase-modal.test.tsx) with no row:
      - "asks first, and keeping the vault goes back to the passphrase, deleting nothing" (start over);
      - "shows the vault's message as advice, quiet and not a gripe, in the live region, and not as a wrong passphrase" (`gate_made_elsewhere`).
    - The roll-up's "105 tests" counts rows: 106 with thread 10's, some bundling several cases, some retiring part of a test.
    - Row 98 misquotes its title ("made elsewhere" for "made and deleted elsewhere").
    - What was sampled: 321 of the 504 gone titles. That is all 261 outside `tests/vault/`, plus 60 of the 243 inside it, spread by file. Of those, 60 are in the ledger, 259 were retitled, and 2 are unaccounted. All 19 tests that "primitive moved" rows name exist at 89b65977.
    - Rec: add the two rows, and state the roll-up as rows, not tests.

28. **Two of the eight contract races are tested in part.**
    - Race 3 (a superseded passphrase) is held at the seal's demand, not after the reseal. The reseal's demand is covered by a unit test only (proving.test.ts:200). This is unrecorded.
    - Race 4: no test declines alone while the deriver is held.
    - The other races hold as specified: 1 at vault-races:1075, 2 at :1165 (its `gate_moved` needs a hello first, else `stale_write`; recorded in thread 8), 5 at :1216, 6's passkey half at :1100, 7 at gating.test:409, and 8 at vault-demand:231.
    - Race 4's decline leaving the lease in the pantry is recorded (toldjaso 8).
    - Rec: record race 3's holding point, and add a decline-alone case.

29. **More retired names, beyond finding 5.**
    - React tests: `proof` names in passkey.test.ts:28-31, and "a new vault handle" in bank-provider-options.test.tsx:61.
    - types.ts:195's doc block still says "from its device mark".
    - "proof" also stands in bank.ts:213 and 420, already covered by finding 3.
    - Rec: fold these into finding 5's rename.

### Informational (no Rec needed)

- Passkey answers are not zeroed when a chain ends before `PasskeyProving.seal` runs. In `put_passkey` on a wrong passphrase this is deliberate, so the answer can be reused.
- The seals demand only after their first await. The spec rows list only that demand; the cost is at most one wasted derivation.
- Two checks cannot fail: `#takeOwnWrite`'s `isOlderPicture` (vault.ts:1366), and `#readBox`'s `#demand(fetched)` (vault.ts:1621).
- `#watchRefresh` logs an adapter's throw whole (vault.ts:1778). logger.ts:12-13 says keeping that clean is the host's job.
- `Bank.#loaded` memoizes the strength checker's load. Thread 7 records it, and it guards no vault state.

## notes/security.md drift (input to the Coach's post-sprint audit; no agent edits the file)

Three helpers swept lines 44-330, 331-1345 and 1346-3245; the orchestrator relayed their results. A fourth, the adapters helper, checked 231-330 and the route-recipe passages itself. In all:
- about 40 claims that the code contradicts;
- about 80 places that still name retired mechanisms as current. `Vault.make` alone appears about 35 times past line 1346, and there are about 30 stale symbols across 368-1303.

**High-confidence contradictions:**
- **Leases, take-up and the device record:**
  - 213: an old-epoch pantry lease is "discarded by the next take-up". No take-up erases (`#takeUpFromPantry`/`#takeUpAtBirth`); only `#lockNow`, `#heedRefusal` and `#dropDamaged` call `delLease`.
  - 231-236: "or a newer pantry lease" revokes. The code needs both conditions (`leasesSeen >= #leasesHeld && ! standsBeside`, vault.ts:1011 and 1071), and the same-millisecond sentence is stale (cd27f83a).
  - 270: the counter "never goes down across a deletion". Postgres race, finding 10.
  - 307-313: `describeDeviceDB` checks order. It does so for leases only (finding 22).
  - 1223: "only the first hello, or ensureLease(), takes a lease up". Birth and the gating's pantry consult do.
  - 1346: a failed raise is "a warning, not a refusal". At birth it refuses (bank.ts:449).
- **Gating, passphrases and derivers:**
  - 72: "No vault call takes a passphrase". `checkStrength` does (vault.ts:482-485).
  - 254: a `sessionKey` that no longer exists.
  - 956: four in-place kinds. `CorrectableKindVals` has seven (gating.ts:28).
  - 1819-1832: a deriver's condition "passes through as itself". It keeps only its kind (proving.ts:484-491).
  - 2192 and 2203-2213: `putWayin` takes the passkey's answer, and `reviseWayins`. `putWayin` takes a slotlabel (vault.ts:2017).
  - 2147 names `PasskeyProof.wayinKeyFor` and `Wayin.seal`, now `PasskeyProving.seal`; 2760 names `passphraseKeyOf` in wayin.ts or proof.ts, now proving.ts:509.
- **Bank, deletion and start over:**
  - 136: "the only automatic ask left is start over". Start over is gone.
  - 142-143 and 2460-2462: `delDamagedVault` lets the entry go "only once the delete succeeds". It does on `stale_write` too (bank.ts:285-292).
  - 298-299: gateless props read as "no vault yet", where they read as novel; and "a failing key deriver creates nothing", where birth now writes first (bank.ts:431).
  - 2683-2684: "the README's delMark recipe stays the only way out". `bank.clearCachedVault` is that way.
  - 2863-2865: `onStartedOver` is "called". It never is.
- **The route recipe:**
  - 1141-1142: it sends `refusal.box_stored`. That is now in the main meta.
  - 1759-1763: it sends a refusal's meta whole. It no longer does; 1763 also names `rolled_back`.
- **Other:**
  - 386-394: every `hello()` runs the checker's `load`. The bank loads it once (bank.ts:333-354).
  - 1015-1016: the bad-news kinds omit `damaged_lease`. Medium confidence.
  - 2709-2710: putBox to a gone vault refuses `vault_gone`. It refuses `stale_write`, or `vault_gone` when partial (finding 12). Low confidence.

**Retired names left unamended:**
- **Mechanisms:** `Vault.make`, `unlock()`, `close()`, `vault_closed`, `rolled_back` (1744, 1762, 2374, 2680, 3132, 3136), `getProof`, `Ask`, `PassphraseProof`/`PasskeyProof`.
- **Lease and device-record names:** `ensureLease`/`tryEnsureLease` (218, 239, 243, 257, 615, 924-927, 3212), `#grantLease` (188, 615, 924-927), the device mark (`getMark`/`putMark`/`delMark`, `safebyok-mark-v3`, `-v4`, `-v5`).
- **Storage verbs:** `listBoxes`, `ensureVaultProps`/`getVaultProps`, `listBoxRecords`.
- **Old signatures and options:** `parseMakeVaultOpts`, the `vault_id`/`unlock_epoch` getters, `putWayin(passphrase, newProof)`, `delWayin(passphrase)`.
- **Removed internals:** `#settleUnlock`, `#reviseWayins`, `RefusalPolicy.decide`, `catchUp`/`CatchUpPassesThrough` (3135), `withUnlockedVault` (3092-3099), `vault-provider.tsx` (2855, 2973).

615 also says `leaseRecordOf` is used only by lease.test.ts; proving.test.ts uses it too.

**Checked and sound:** the entries for threads 5, 7b, 9, 9b and 10, lease_box, box_seal, store_verbs and wire_meta in 44-330. In 331-1345: getVault/ensureVault, the schemas, checkStrength, proving, lease sealing, gating, requestCleartext's throw, BankProvider, the delVault expectations, GraphQL's box_stored, and getBox's vault_mismatch. Also 265-294 (tombstones) and 315-330 (GraphQL answer types).

## What I could not check

- The Contract's *Tradeoffs* table (402-417), and whether VAULTDB.md and the conformance suite match Contract 350.
- 182 of the 243 gone titles under `tests/vault/`; the sample is described in finding 27.
- Anything at runtime. No helper ran tests or a browser: WebAuthn, `userActivation`, how DevTools or `inspect` show private fields, and whether Zod issues ever quote an input.
- Whether a pg driver error's `detail` could quote jsonb wayins into a host's logs as a `cause`.
- Whether each adapter's `getVault` is linearizable, which bears on U6's input.
- The living design doc's other tabs, where the Coach may already have ruled on U3, U6 or M1.

## Open matters

**Kinds and refusals:**
- **First gate's lost-race kind** (8): refuses `gate_moved` rather than `gate_made_elsewhere` when a refresh lands mid-chain. Rec: demand as `gate_made_elsewhere` in that chain, and test it with a ringing store.
- **Partial-putBox kind** (12): a partial put to a remade vault refuses `vault_gone`; the docs say `stale_write`. Rec: state both, by call shape.
- **putLease answer unchecked** (19): an adapter bug reads as `unexpected_error` or `vault_remade`. Rec: check the answer first.
- **Landed write refused** (20): `gate_moved` after a change that landed. Rec: the message says it may have landed.
- **Sent-deletion lockLanded** (21): a decline, then a lock, leaves it unsettled. Rec: a lock overwrites the decline.
- **Server-chosen refusal kinds** (23): the route can pick any kind and message. Rec: accept only VaultDB kinds.

**The Contract and the READMEs:**
- **Contract checkPassphrase** (7): documents a method that does not exist. Rec: rewrite as `checkStrength`.
- **Contract "at once, asking nobody"** (13): true only while locked. Rec: reword.
- **Contract Box view** (14): `vault_tok` is not in JSON. Rec: correct lines 306-307.
- **Contract small lines and surface** (15): 13 small lines are untrue, and part of the public surface is undescribed. Rec: Contract edits; the Coach picks the surface.
- **React README sign-out kind** (11): says `vault_locked`. Rec: `identity_revoked`.
- **Postgres README residual** (24): salts and wrapped keys in the main meta. Rec: one warning sentence.
- **React README stale lines** (25): start over, and `delDamagedVault`. Rec: fix both and drop the dead strings.

**Tests and the ledger:**
- **Vacuous renewal race test** (9): renews nothing. Rec: renew for real.
- **Partial race coverage** (28): race 3 held at the seal; no decline-alone case for race 4. Rec: record race 3, add the case.
- **Ledger rows** (27): two React deletions have no row, and the roll-up counts rows as tests. Rec: add the rows, restate the count.

**Postgres and the device store:**
- **Postgres counter docs** (10): the READ COMMITTED claim and "never both" are untrue under toldjaso 16. Rec: name the race, and use `GREATEST` in `DelVaultSql`.
- **IDB device-record discard** (22): an unconditional delete after an await, and an ordering suite that covers leases only. Rec: a re-checking discard and a suite case.

**Spec, rules and rulings:**
- **U3 / U6** (16): still open, no ruling. Rec: rule; U6's input is the record-first read order.
- **ensureUnlocked hello first** (17): a deviation that no thread records. Rec: confirm it and record it in the spec.
- **Try-pair exceptions** (18): `useWhisper`, Bank's sync forms, the gating attempts. Rec: record them or pair them.
- **M1 and M4 leftovers** (earlier review): sent-deletion machinery; `#dropDamaged` erases; `leaseRecordOf` is test-only; stamps are enumerable. Rec: rule on them.
- **#grantAfterChange warn** (6, still open): U1 is closed, and the warn is a recorded decision. Rec: rule on the warn.

**Design:**
- **No confirm-passphrase field** (26): a typo can lose the vault. Rec: the Coach decides.

**Docs and vocabulary:**
- **Retired names, more** (29): React test `proof` names, "vault handle", types.ts:195's device mark. Rec: fold into finding 5's rename.
- **notes/security.md drift**: about 40 contradictions and about 80 stale names. Rec: an input to the Coach's audit; no agent edits the file.
