# gripeoween: todo

Wants work or a decision now. Groups in order of readiness; within a group, the smaller first.
**ctx** marks an item with a section in `gripeoween-context.md`.

## A. Ruled, ready: each a small PR cut from `main`

- GW-01 **ctx** **The storage-docs fix, #302's follow-up.** `packages/safebyok/VAULTDB.md` lines 28 and 46 still say
  a stale delete resolves `false` where the base turns only `null` (box: `vault-db.ts:347`) or
  `null`/`undefined` (vault: `vault-db.ts:374`) into 'stale_write'; section 5.1 says `null`. The
  Coach: "yes make it consistent", and asked whether the value is checked by a pre-made,
  well-named Zod checker (it is: `checkAnswer(BoxDeletion, …)` after the null test). Beside it: the
  README's `whisper_too_large` row (l.1035) says the whisper alone, where `vault.ts:1518-1524`
  weighs whisper and sidecar together; the Coach: "weigh the two together, make it box_too_large",
  which reads as a kind rename and collides with storage's own `box_too_large` (`vault.ts:101`):
  confirm before renaming. And `delBox` taking `undefined` as stale like `delVault`: the Coach asked
  instead that the adapter hand back `null` itself. One PR, with a `describeVaultDB` test for the
  delete answers. (Open Matters: three `proceed` rows on #302.)
- GW-02 **The rename PR the Cleanup tab owes.** Ruled, still in the code: `#picture` to `#snapshotAt`
  (`vault.ts:914`); `RefusalPolicy.decide` to `responseOf` (`refusal-policy.ts`); `#storedBase` to
  `#fillFromStored` (`vault.ts:1609`, the orchestrator's call, STYLE.md's example already says it);
  `Proving.wrongProof` to `wrongCleartext` (`proving.ts:230`, "proof" is retired); Convex's `written`
  (`component/vaults.ts:78,137`) beside `storedRow`, the Coach: "storableRow and storedRow?";
  `OutsideGating` (`proving.ts:34`, tests only) to the test helpers. Hold out of it the four names
  that wait on an answer or a thread: GW-20, GW-21, GW-16, GW-22.
- GW-03 **Stale refusal messages, one PR** (Cleanup tab). `lease.ts:123` and `:125` ('corrupt_record') and
  `box.ts:283` (`lockedError`) still say "proof"; `#gateWriteRefusal`'s 'stale_write' (`vault.ts:1293`
  on) blames a vault deleted or remade elsewhere, a case refused earlier; `lock()` and `tryLock()`
  (`vault.ts:397,417`) open "Forget the unlock", unlock as a noun: "Drop the lease…". The
  `useWhisper` "needs a callback" wording is already gone.
- GW-04 **Pin the one lock rule with a test**: a gating re-unlocks the vault mid-`putBox` and the write
  lands (#304's class doc promises it; the Coach: "yes one rule please"). No such test in `tests/`.
- GW-05 **ctx** **`Box.make` checks its vault.** `box.ts:150` parses the record and `madeUnder` and takes
  `vault` on trust (`VaultOfBox` is a type, `box.ts:18`). The Coach: "just have a liveVault instance
  checker". The second gap that row named, `Box.seal(vault, undefined)`, is closed by #301's
  `SealBoxProps.parse` (`box.ts:181`).
- GW-06 **ctx** **Write the TODO.md entry for the bank's trouble pipeline.** On `onBadNews` throwing during a
  vault's birth (nothing holds the trouble yet), the Coach: "bank should probably take over the
  trouble pipeline or have things bubble to it? TODO that and carry on". Not in TODO.md.
- GW-07 **Preplan items 6 and 7 as their own PRs** (Cleanup tab). Item 6: `consistent-type-definitions`
  is `'off'` (`eslint.config.mjs:271`), one `interface` left in `src/`. Item 7: `func-style` still
  allows arrows (`eslint.config.mjs:129`); a codemod over about 420 sites, React packages excepted.
  The restyle it waited for has merged.
- GW-08 **Close the fixup sprint's books.** Sweep the 21 Open Matters rows into
  `whiteboard/20261027-fixup_sprint/fixup_sprint-resolutions.md` (the *Resolved* tab is empty, the
  rows were never moved), then move the folder to `winboard/`. #295 is merged. This triage is the
  sweep's raw material.
- GW-09 **Process PR**: `.claude/agents/style-reviewer.md:45` tells it to commit with prefix `style`,
  which PROCESS.md's *Commit messages* does not list; reviewers rename by hand.
- GW-10 **security.md through a `sonnet` subagent**: the thread 3 amendment (about nine lines) checked
  against the header rules (Cleanup tab); and whichever sentences the catchsweep's thread 2 does
  not pick up (l.248 names `Lease.tryCipheredWith` for a body now in `cipheredWith`).

## B. In flight: the catchsweep sprint (#314). Watch, do not duplicate.

- GW-11 **#321 `store_trynames`**: DeviceDB's throwing forms reject with the store's raw error; the
  worker is moving the mapping into each throwing body per the Coach's ruling. Its other two
  questions want a word: patch changesets for test-only packages (rec keep), and whether `heed`
  should hand Outcomes so `vault.ts`'s `outcomeOf(() => this.#vaultDB.X(...))` rewraps go (a
  contract-shaped thread of its own).
- GW-12 **Thread 3 `db_hooks`** rewrites the VaultDB verbs' insides; GW-16 rides on it.
- GW-13 **Thread 2 `aead_narrow`**: `deviceTrouble` still carries the store's throw as `cause`
  (`device-db.ts:271`, two sites); the thread drops it.
- GW-14 **Thread 5 `one_sanitizer`**: if `Sanitizer` is an exported type its shape is a contract
  question for the Coach (the plan's *For the Coach*).
- GW-15 **Thread 7 `vault_bank_flip`** (new, on thread 6): the 18 `vault.ts` and 5 `bank.ts` pairs in the
  one-catch form.

## C. Needs the Coach's answer

The `explain` rows and open questions, each with its context section.

- GW-16 **ctx** **VaultDB's private workers' names.** `readVault`, `ensuredVault` (`vault-db.ts:226` on) serve
  `getVault`/`getVaultRecords` and `ensureVault`/`ensureVaultRecords`. The run proposed
  `getVaultChecked`; the Coach: a raw version should get the business, "but yes please match the
  name". After GW-12 lands, since it rewrites these.
- GW-17 **ctx** **A full localStorage: `storage_blocked` or `storage_unavailable`?** `localVaultDB` says
  'storage_unavailable' (`local-vault-db.ts:34`); the README's `storage_blocked` row promises
  'storage_blocked' for no room. The Coach: "why wouldn't it be storage_unavailable? how much
  machinery is going on in there". Either way one of the two documents is wrong.
- GW-18 **ctx** **`consistentWith` throws 'bad_option' on misuse** (`vault.ts:388-391`), against the verb
  table's rule that a yes/no never throws. The Coach: "who calls it? safeParse doesn't throw on
  anything does it?"
- GW-19 **ctx** **`checkFoo` returning a value becomes `checkedFoo`.** Three remain after #301:
  `checkHelloOpts`, `checkEnsureUnlockedOpts`, `checkDemandOpts` (`vault.ts:1920-1929`), each an
  `optionsCheck` returning the options. The Coach: "hold for now but I'll have you check" (the
  other thread was #301; it replaced the other two with `PutBoxProps` and `SealBoxProps`).
- GW-20 **ctx** **`DeviceDB.#readableOf`** (`device-db.ts:106`) deletes an unreadable row through
  `doDelUnreadable`, so a name ending `Of` misleads. The Coach prefers `checkOrDiscard` and asks
  what exactly is checked, and whether a name beats `if (! check(foo)) { discard(foo) }`.
- GW-21 **ctx** **`Vault.#raiseRecordAfter`** (`vault.ts:1000,1071`) to `#raiseDeviceRecord`. The Coach:
  "what does 'raise' mean in this context?"
- GW-22 **`held-lease.ts` stays a WeakMap** (thread 5's deviation): a Symbol getter would make the Lease
  reachable from the Vault object, which `vault-boxes.test.ts`'s surface test forbids. Rec keep;
  the Coach to confirm, or to rule the test should stop asserting it.
- GW-23 **validator_ducks (#301), four questions left in its human/ entry**: `vaultScope` and
  `VaultScope`, one validator under two names; retire 'invalid_box' for 'bad_record' (bug-only,
  checked twice on the box write path); `VaultBag`, `BankBag`, `BoxListing` in public signatures but
  not exported, `BoxListing` and `VaultOfBox` first-guess names; the host interfaces
  (`MakeBankOpts`, `VaultLogger`, `KeyDeriver`, `Clock`, `StrengthChecker`) as `Z.infer` at the cost of
  per-member docs in a host's editor.
- GW-24 **ctx** **security.md l.570, "left as an open matter for the Coach"**: `delDamagedVault` over props
  that fail validation passes `gate_epoch: null` and counts a `vault_epoch` it cannot read from zero,
  so a damaged vault's tombstone can carry a counter lower than devices have seen.
- GW-25 **#320's two questions**: the dialog fix filed as a patch (host-visible only toward what the
  doc blocks promise; rec confirm), and the core flake `test-helpers.test.ts` "misses that late
  device…" timing out once in ten loaded rounds: a thread if it shows in a normal justify.
- GW-26 **Two required checks are the Coach's to flip** (TODO.md *Sand*): `postgres` once it has a
  record (#131), and `node-compat (22)` (#130). A workflow cannot make a check required.

## D. TODO.md's standing shelves, carried

Each stands as written in TODO.md; listed so this triage is complete. Nothing to copy.

- GW-27 **Loud: one validation check, next to the storage** (the Coach, 2026-10-22). Waits on the
  stores' verbs settling, which the catchsweep's threads 3, 6 and 7 are moving now: pick up after
  #314 closes.
- GW-28 **Sand**: GraphQL's `'plain'` field class (`fields.ts:6`, still there); Postgres `insertBox`'s
  answer type still names only the four flags (`postgres-vault-db.ts:467`, `BoxAnswer`; the entry's
  `InsertBoxOutcome` name is gone, the looseness is not).
- GW-29 **Side quests**, all still open: the dialogs' phrases sent in by the host (`messages.ts`,
  English only); one test container for every backend; a schema snapshot test keyed by `format`
  (the only `toJSONSchema` use is the Validator test); `ShelfVaultDB`; a test that runs the Postgres
  README's route recipe; the Postgres README pointing at GraphQL or an AI prompt; an agent skill
  set; `bank.hello()` checking the device store; the three demo items; the lease deadline formatter;
  a forgetful user's start-over; the restyle's three later changes (`Box.seal` still takes the
  epochs through `madeUnder`, `box.ts:28`; `getVaultRecords` still beside `getVault`, five sites;
  `damaged_wayin`'s `meta.wayin_listed` summary); the unreachable name byte-size refusals.
