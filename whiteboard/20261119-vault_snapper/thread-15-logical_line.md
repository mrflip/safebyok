# Thread 15: logical_line (2026-11-20)

Branch `20261120-logical_core` (PR A) and `20261120-logical_gating` (PR B, stacked on A), both cut from origin/main
95f1a0425. They re-slice the net diff `origin/main...origin/20261120-pending_bank` (3d430cc6d, the tip of #768 … #781)
into logical commits with no take-backs. Target moved mid-thread to origin/20261120-doc_sweep 590781bc6 (#782, on #781); its doc-block
hunks are folded into the commits they belong to. PR A [#783](https://github.com/mrflip/safebyok/pull/783), PR B
[#784](https://github.com/mrflip/safebyok/pull/784), stacked on #783, both drafts with `ci`.
Proved: B's tip tree is byte-identical to 590781bc6 (tree 115e099fa); `pnpm justify` green at B's tip (safebyok 1376,
safebyok-react 329, e2e 576, the rest). A's tip: typecheck, test and lint green in safebyok (1333), safebyok-react (308) and
safebyok-postgres (341).

This file is left uncommitted. B's tip tree had to equal the target byte for byte, and committing this file on either
branch would break that.

* **Built**: the slice map below, as built. PR B is coarse, four commits, after the orchestrator's change of course (the
  gating flows may be redesigned).
* **Deviations**: `device.lock()` lands in A6, with the snapshots, not in B: it is one line over the bank the device holds,
  and that bank's doc names it. `bank.ensureUnlocked()` lands in A7, with withWhisper, which needs it, and B adds the
  gating part (the wait for a gate change).
  A few lines are written in A without their gating parts, and B adds those parts back:
  - `DeviceSnapshot` has only `bank` in A;
  - the core's `ensureUnlocked` doc block has its first line only;
  - the device test of the pending bank;
  - two bank snapshot tests unlock through `answerPrompt` and an open gating's `attempt` in A, and B replaces that with
    `tryAttemptUnlock`;
  - sentences of the snapshots and with_whisper changesets.
  notes/security.md is split by a sonnet subagent, as CLAUDE.md asks. Its with_whisper entry and the vault_writes
  amendment are in A7. The bank_gatings, snapshots and knock_knock entries are in B: the snapshots entry names the gating
  fields throughout.
* **Discoveries**: the final tree keeps changeset text that describes states which were later taken back. See the report.


## Slice map

A file named alone moves whole in that commit; "hunks" means the commit takes only the hunks named, and a later commit
takes the rest. Tests ride with the commit whose behaviour they state.

### PR A: everything but the gating flows

1. **shapes: ThingFormat and LeaseFormat are the string 'a010501'.** shapes-thing.ts; shapes-stamps.ts; safebyok-postgres
   (vault-functions.ts, vault-tables.ts, postgres-vault-db.test.ts); shapes-thing.test.ts; lease.test.ts; ctx-bytes.test.ts
   hunk (lease fmt); notes/reference-sizes.md; changeset format_string; changeset vault_try's LeaseFormat bullet.
2. **minder: every car carries an agerank, is frozen through, and spells behind `bhnd`.** thing-car.ts; thing-car.test.ts;
   primitives.ts (`Revseq`); core.ts and storage.ts (`Revseq` export); shapes-minder.ts hunks (ThingCar, carLivenessVals,
   bhnd comments); phrases.ts hunks (Car*); thing-minder.ts hunks (bhnd comments); minder tests' bhnd/frozen hunks
   (cache, staleness, reads); VOCABULARY.md car row (liveness, agerank); changeset car_agerank.
3. **minder: listen tells TanStack's cache event, decorated, under the feed version; keys start 'sok' and are made
   without a minder.** thing-minder.ts hunks (Labelpathed, listener invariants, listen version, invalidate, keys and the
   static queryKeyOf/bankQueryKeyOf/isThingEvent, #minderEventOf, UsefulTSQEvent, keyHeadOf); shapes-minder.ts hunks
   (MinderEvent and its kin, feedVersion); phrases.ts FeedVersionOther; index.ts minder exports; tests listen,
   invalidate, keys, listing-orders, world.ts, writes' listen hunks; VOCABULARY.md car row (events); changeset minder_feed.
4. **minder: get, list and write come as try pairs, and backgroundRefresh is its one background get.** thing-minder.ts
   hunks (imports, goodbye, tryAt, tryGet, backgroundRefresh, tryList, write, #doGet); storage/refused-answer.ts; tests
   reads, lifecycle, writes' write describe; notes/wontfix.md's goodbye-then-hello section; changesets minder_try,
   background_refresh.
5. **vault: a Vault writes a bank's boxes once each through its minder, and sealBox answers the write's ask.** vault.ts
   (less withWhisper); bank.ts hunks (vaultDB getter, sealBox/tombstoneBox, try*Box and disabledAnswerOf gone);
   shapes-bankish.ts hunks (SealedBoxAsk, GetBoxAskDraft and GetBoxAnswer gone); phrases.ts and throwers.ts
   (VaultBankExpected, otherThanBox gone); index.ts `Vault`; core.ts header; bank-flows.test.ts gone; vault.test.ts
   (make, flows, put/del describes, minder beside the bank); bank.test.ts sealBox hunks; models-world.ts; index.test.ts;
   ctx-bytes.test.ts and writes test sealBox hunks; notes/wontfix.md sidecar section; changesets vault_writes, vault_try's
   vault bullets.
6. **vault: a Bank and a Device offer getSnapshot() and subscribe(), the device's carrying its bank's.** bank.ts hunks
   (snapshot props, getters, #align, #makeSnapshot, cheatHoldBank call, sweep's end cause); device.ts hunks (snapshot
   props, getters, cheatHoldBank, sweep sweeps the bank, #align, #makeSnapshot of the bank alone); shapes-bankish.ts
   hunks (bankStageVals, BankStage, RefusalSnapshot, BankSnapshot, PendingBank, DeviceSnapshot's bank); core.ts exports;
   bank.test.ts and device.test.ts snapshot describes (less the gating); VOCABULARY.md stage row;
   notes/guarantees-drift.md's sweep amendment; changesets snapshots, pending_bank (less gating).
7. **vault: withWhisper unseals a box for a callback, unlocking the bank if it must.** vault.ts withWhisper and Checks.fn;
   bank.ts `ensureUnlocked` (its first doc line); vault.test.ts withWhisper describe (less joining); changesets
   with_whisper, whisper_refresh (less gating).
8. **giver: the giver serves the Device's one bank, and adopts the minder's feed and keys.** shapes-giver.ts (less
   nothing gating); react-giver.ts hunks (all but useGating and ServerSnapshot's gating); react-bridge.ts; minder-bank.ts;
   tests react-bridge, react-giver (less gating), minder-giver, fake-giver-world (less gating), minder-giver-world,
   test-helpers.ts; changeset giver_feed.
9. **plan:** the old threads' files, but threads 5 and 9.

### PR B: the gating flows (planned fine; built coarse as 4 commits: core flows, giver, notes and changesets, plan)

1. **vault: a Bank's prompts join the gating open on it, and its re-entry points hand cleartexts in, as try pairs.**
   bank.ts hunks (prompts, ensureUnlocked's wait line, #launchOrJoin, re-entry points, #handIn, the attempts);
   gating.ts attemptWithoutGating; bank-prompts.test.ts; VOCABULARY.md cleartext and prompt rows; notes/wontfix.md gate
   change section; notes/guarantees-drift.md G1/G9 entry; changesets bank_gatings, vault_try's Bank bullet, with_whisper's
   waiting.
2. **vault: device.lock() locks the device's bank.** device.ts lock(); device.test.ts describe.
3. **vault: the device snapshot shows the open gating, its gatingseq and whether an attempt is under way.** device.ts
   hunks; gating.ts isAttempting and alignOpenGating calls; shapes-bankish.ts OpenGatingSnapshot and DeviceSnapshot's
   gating; core.ts export; device.test.ts and gating.test.ts gating hunks; vault.test.ts joining; changeset snapshots'
   gating.
4. **giver: useGating, and an end-to-end knock-knock test of an unlock dialog over the real core.** react-giver.ts
   useGating and ServerSnapshot's gating; knock-knock test and world; secret-search; fake-giver-world and react-giver
   test gating hunks; changeset knock_knock.
5. **plan:** threads 5 and 9's files, and this one's.

notes/security.md is split by entry through a subagent, as CLAUDE.md asks.
