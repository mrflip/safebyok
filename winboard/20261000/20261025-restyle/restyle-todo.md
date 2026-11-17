# restyle: todo

What the restyle sprint's follow-up threads (21 to 29) left, as the sprint wraps up on 2026-10-28.
Groups in order of readiness; within a group, the smaller first. What the Coach ruled is in
`restyle-resolutions.md`; each thread's own account is its `thread-<N>-<label>.md` here.

## A. Waiting on the clock

- RS-01 **Finish thread 28 (helpers_range, #354) after 2026-10-28 23:13:40 UTC:**
  `/workspace/byok-helpers_range/winboard/20261025-restyle/thread-28-finish.sh`. #354 drops
  convex-helpers 0.1.129's `minimumReleaseAgeExclude` and returns the dev pins to `^0.1.129`, as the
  Coach approved. Until 0.1.129 has been public seven days, pnpm's strict release age refuses it from
  the lockfile (`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`, frozen or not), so the PR waits as a draft
  with everything but the re-lock, `notes/security.md`'s record of the exception already ended. The
  script (on #354's branch) refuses to run before then; after, it re-locks, checks the lockfile still
  says 0.1.129 and a frozen install passes, commits the lockfile, files the thread and takes #354 out
  of draft. If filing stops (exit 3 or 4), #354 stays a draft: hand the worktree and the script's last
  lines to a fresh thread-worker. Until the re-lock, any `pnpm <script>` in that worktree is refused.

## B. Small, ready: each a few lines, any tidy PR may take them

- RS-02 **Two private `listenerShape`s repeat `HX.callback`.** `idb.ts` and `string-store.ts` each keep
  one beside the listener it checks; #353 gave the host-code checks a home in `shapes/host-code.ts`.
  Switch both to `HX.callback`. (#353, thread 27)
- RS-03 **`useAdvice`'s `creatingNow` guards a case that cannot arise**: both callers fix `creating` for
  the life of the mount, so the ref and the mode half of `latest()` can go. (#350 review, thread 26)
- RS-04 **The script tests write the shared repository under `git rebase --exec`.** `isolatedEnv` (and
  `dependabot.test`'s own env) spread `process.env`, so a `GIT_DIR` set by rebase --exec or a git hook
  sends their scratch `git init --bare`, commits and tags into the real `.git` (it set `core.bare` true
  for two minutes on 2026-10-28). Drop `GIT_DIR`, `GIT_WORK_TREE` and `GIT_INDEX_FILE` there. Until
  then: no `pnpm justify` under rebase --exec or a hook. (#319, thread 21)
- RS-05 **Three option types are written by hand beside their exported validators.** `IdbOpts`,
  `MaskOpts` and `LocalVaultDBOpts` are not `Z.infer` of `idbOpts`, `maskOpts` and `localVaultDBOpts`,
  though #353 now exports each beside its type. Derive them, or tie each with a type test.
  (#353 review, thread 27)

## C. Goes with other work

- RS-06 **The vault's refusals give two recoveries for one remade vault.** In phrases.ts since #352:
  `VaultDeletedWhilePuttingBox` says "Read the vault again (hello)", where `VaultGoneWhileGettingBox`
  and `VaultRemade` say `bank.ensureVault`; `VaultChangedInStorage` says "Read the vault again" and names
  no call; `VaultGoneWhileGettingBox` nearly repeats `VaultObjectGone`. A word-for-word move kept them.
  With #340 (gripeoween_vault), which reworks these calls, or a wording pass after it. (#352 review)
- RS-07 **Run the amended recase recipe with `--dry` first.** `thread-22-recase.cjs` and its recipe
  (now with the step that turns a pre-#322 `Validators.x` into `Safebyok.x`) passed `node --check` but
  have not been run on a pre-#322 branch. Whoever rebases #340 or #335 over #322. (#353, thread 27)

## D. For the documentarian

- RS-08 `useWhenShown`'s doc block: its first line runs about 27 words, and its second paragraph
  describes internals rather than the caller's contract. The untouched `/**` openers of
  `useAnswerOnce`, `useAttempts`, `useAdvice` and `PasskeyUnlockButton` sit alone on their line.
  (#350 review)
- RS-09 `shapes/host-code.ts`'s member doc blocks repeat its module header (every `parse` refuses
  'bad_option' and passes on what it was handed); `callback`'s `@example` has no test titled for it.
  (#353 review)

## E. Kept as built, the Rec standing: no work unless the Coach overturns one

Each was an Open Matters row the Coach had not flipped when the sprint wrapped up.

- **A dialog hidden by Suspense now waits, as one hidden by Activity does** (React cannot tell them
  apart), and so a `put_passkey` dialog Suspense hides and the host then unmounts leaves a credential
  the vault never learns of, as one unmounted while showing already did. (#350)
- **A passkey pressed while its button is hidden is tried once it shows again**; before, the press was
  dropped and the button stayed disabled. (#350)
- **Module namespaces stay** (`Scopepath`, `Expectations`, `Refusals`, `HostErrorSanitizer`); only the
  gathered `Validators` went. Outside the core, a file reaching one or two validators imports them by
  name and one reaching many star-imports the entry as `Safebyok`. `StoryShape` became `Checks.story`
  with `consistencyRefusal`. (#322)
- **#353 touches three lines of vault.ts** (`OX.callback` to `HX.callback`), against its brief, since
  `callback` moved; it and #352 merge cleanly over each other. (#353)
- **vault.ts's logger lines stay in vault.ts**: they are for a developer reading logs, not refusals.
  (#352)
- **`Clock` and `wallClock` stay in `bank-opts.ts`** beside the options that default to them, while
  `clockShape` moved to `host-code.ts` (a type-only import). (#353 review)
- **The other over-the-wire timing cases stay on the real clock** until one flakes; each would be a
  one-line `onFakeClock` wrap. Three fake-clock setups now serve different jobs; `onFakeClock` moves to
  `tests/test-helpers/timing.ts` if a second file wants it. A hung test there leaves fake timers
  installed for the rest of its file. (#349)
- **No test ties a vault error builder to its phrase** (`lockedError()` to `Phrases.VaultLocked`); the
  move was checked by script. (#352 review)

## F. Coach notes on the sprint doc, not taken up

Two rows of the doc's *Coach notes* table, `drafting`, quoted as they stand (both read as cut off):

- "Have the validator wrapper include a method"
- "can you have a sonnet subagent, in its own worktree, audit files for /** first-line compliance,
  making a list in the -restyle whiteboard of cases where: - the name is vacuous or a mismatch to the
  purpose ('function"
