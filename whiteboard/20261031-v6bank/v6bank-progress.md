# Sprint v6bank: progress

What the threads have taught, newest where it disagrees with the plan. Curated by the
orchestrator; workers look things up here, they do not write it. Each worker keeps its own
`thread-<N>-<label>.md` beside this file, on its own branch.

## Standing facts (from planning)

* `BankOpts.keyDeriver` is already required with no default; `requestCleartext` is optional in
  the sketch and becomes required in 3a.
* The browser entry already exports `zxcvbnStrengthChecker`.
* `thread-worker` and `thread-reviewer` run on Opus 5.5 unless the plan names `sonnet`.

## By thread

### 1. names_and_refusals (#426, built, in review)

* **Refusal factories:** every factory the models throw is in `src/helpers/refusal-funcs.ts`,
  imported whole as `RefusalFuncs` (`throw RefusalFuncs.x()`), banners per section: Opening a
  vault, Storables, Listings, Leases, Boxes, Vaults, Gates, Provings, Gatings, Banks.
  `helpers/throwers.ts` is gone. The old core keeps its own Refusals sections (`vault.ts`,
  `gating.ts`). The deriver's factories stay in `deriver/basederiver.ts` until the restack.
* **Renames later threads meet:** `unlockFirst` → `needVaultUnlocked`; `lockedError` →
  `vaultLocked`; `goneError` → `vaultGoneWhileOpening`; `behindError` →
  `vaultBehindWhileOpening`; `otherStoresError` → `otherStoresThanHeld`; `partialLoadError` →
  `partialLoad`; `movedUnderEditError` → `movedUnderEdit`; `alreadyHeldError` → `alreadyHeld`;
  listings' absent refusals `vaultAbsent(label)`/`boxAbsent(label)`.
  `raiseDeviceRecord` family → `incrementDeviceRecord` (*Orchestrator:* thread 5 renames it again
  to `advanceDeviceRecord`, YOLO call); `RaisedGating.raise` → `RaisedGating.make` and Vault's
  `#raiseGating` → `#launchGating` (*Orchestrator:* 3a renames `RaisedGating` → `LaunchedGating`
  and "raise a gating" → "launch" everywhere, YOLO call); `takeUpKeptLease` →
  `takeUpCachedLease`, `KeptLease` → `CachedLease`, `keptLeaseRow` → `cachedLeaseRow`,
  `eraseKept` → `eraseCached`; `checkSuppliedSpecKept` → `checkSuppliedSpecUnchanged`.
* **Listeners:** both Storable's and Listing's listeners are isolated at settle, each failure
  reported through the bad-news path.
* **GAPs left for later threads:** `models/bank.ts` 64, 66, 137, 153; `models/gating.ts` 67, 78
  (pester, box listing, 4a, gatings).

### 2. deriver_and_strength (#427, built, in review)

* Already on main: `KeyDeriver` interface (`deriver/basederiver.ts`), `BankOpts.keyDeriver`
  required, `RefusingStrengthChecker`, `Phrases.NoStrengthChecker`, browser export of
  `zxcvbnStrengthChecker`.
* New: **`checkKeyDeriver`** in `basederiver.ts`, called in `Bank`'s constructor (refuses a
  deriver wearing a supplied label over other parameters, a reserved label, a bad argon2id
  spec). **A thread that rewrites the constructor keeps that line.** `KeyDeriver.load` is now an
  optional property, not a method. `tests/models/bank.test.ts` and `bank-reach.test.ts` are new:
  a thread creating `tests/models/bank.test.ts` from main would collide; 4a stands on a line
  that has it after the restack.
* `bank.hello()` awaits `keyDeriver.load?.()` bare: a failed load surfaces as the deriver's own
  error (open matter; 4a owns hello).

### 9. whispers_and_names (#428, filed)

* `Box.getWhisper`/`tryGetWhisper`/`useWhisper` on `unsealWhisper`; `useWhisper` zeroes the
  opened bytes before the callback (the callback gets the parsed value); `getWhisper` always
  opens the stored record. `parseJsonOrNull` → `src/helpers/parse-json.ts`.
* The models' `Bank`: `bankOpts` takes `applabel`/`user_id` as `unk`, `bankScope` refuses
  `bad_scope`; a second `checkKeyDeriver` (duplicate of thread 2's), called after
  `bankScope.parse`. **Until the restack, the line under 3a has thread 9's copy, not thread 2's.**
* `kept` leftovers renamed; VOCABULARY.md and guarantees.md say `CachedLease`.

### 6. store_fronting (#429, built, in review)

* `src/models/store-front.ts`: abstract `StoreFront` with hooks `doGetRows`, `doSwapRow`
  (atomic read-and-swap answering the row read), `doFindRows`, `doWatch`; `vaultStore(bankScope)`,
  `boxStore(vaultScope)`; `localStoreFront({ store })` over a StringStore. The old `VaultDB` is
  untouched.
* Versioned `put`/`del` refuse a stale `revision_tok` with `stale_write` carrying the stored row;
  `revision_seq` computed by the front. A damaged row is refused by name (`damaged_box`,
  `damaged_vault`), never written over. `delUnparsed(scope)` is the unconditional delete.
* `Store.watch(…, onChange)`: rung when the watch cannot say what changed; the listing answers
  with `hydrateAll({ maxMillisSinceRefresh: 0 })`.
* Signed-out is bad news of kind **`identity_revoked`** (no `signed_out`).

## Lessons for handoffs

* `gh pr ready` can be refused by the harness's permission classifier: a worker leaves the PR
  in draft and says so, without retrying; the Coach flips it.
* Worker contexts reach ~130k on S/M threads: keep handoffs lean. Thread 6 (M) compacted twice
  before its first justify: an M thread that builds a new module plus its tests is near the cap.
  Split 7b, 8 and 12 further if their glosses grow.
* **A handoff names what a sibling thread on another branch already built in the same files**
  (thread 9 duplicated thread 2's `checkKeyDeriver` for want of it).
* Force-push is refused by the harness classifier; workers fix forward with new commits.
