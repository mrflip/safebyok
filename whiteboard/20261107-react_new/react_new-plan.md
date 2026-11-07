# Sprint react_new: the plan

* **Date:** 2026-11-07. **Mode:** YOLO (two-way calls made and recorded as Open Matters rows and in
  the sprint's `human/` entry).
* **Levels (defaults):** review `medium`; worker and reviewer at their agents' own model and
  effort; style pass at `style-reviewer`'s pin (`sonnet`). At most **3** threads at once.
* **Issued by:** the Coach (flip), in this session, after the design talk recorded in
  [design.md](design.md).
* **Sprint worktree:** `../byok-react_new`, branch `20261107-react_new`, from `origin/main` at
  `495cc5d6e` (the vaultdb line merged).
* **Sprint PR:** #572 (draft).
* **Sprint doc:** https://claude.ai/artifact/UN5fpxiLeEaLHjpFgBiHg9 (doc
  dd983d99-c90e-49a6-908a-a9d4a431cc86; State enum 17bf4ab3-9727; Open Matters body 644feba5-d4ff,
  matters table mnx96vk4741.393, bookmark rev 23; Cleanup body 6cb5c40d-1cc7; Progress body
  4e2c8165-c64b, table mnx96vk4741.105; Resolved body 7b60aab3-b0e6).
* **Status:** filed 1 (#573), 2 (#574), 3 (#577), 4 (#576), 12 (#575). Thread 11 building from 3. Thread 5
  waits on the Coach's `/restacker 573 574 576 577 575`.

## Read first

Every worker has CLAUDE.md. Beyond it, by thread:

* `notes/expose_improves_security.md`, whole (short): threads 4 to 8. It is the sketch of the three
  ways to hold a whisper that flows 1, 2 and 3 implement.
* `packages/safebyok/README.md`, *A host* and *Showing a whisper*: threads 2 to 8.
* `packages/safebyok/tests/models/proof.test.ts`: a host driving a bank's whole life; consult by
  `rg`, never read through. Threads 2 to 5.
* [design.md](design.md), *1. Inventory* and *2. What the React layer needs*: threads 2 to 5.
* [regressions.md](regressions.md): threads 4 to 8, which build on the first entry.

## Ground rules

* **Never consult `packages/safebyok-old/` for implementation or contract**, and never change it.
  Old tests may suggest coverage. The old React and demo code is being replaced, not ported line by
  line: keep what still serves, rewrite the rest.
* **Don't change the core's whisper policies**: when `expose`, `unexpose`, `veil`, `unveil`,
  `patchWhisper` and `putExposed` keep, drop, show or refuse. The files of `safebyok/dom`
  (`packages/safebyok/src/dom/`) are ours to customize and improve. Any other core change is the
  smallest additive export the thread needs.
* **A race or a design flaw met in the core**: report it in the thread file's open matters, and move
  on. It is not this sprint's to fix.
* **The whisper is always an object.** The demo's Anthropic key is `{ apiKey }`.
* **A box is made, or fetched, by spelling both options out**:
  `vault.putBox({ boxlabel, whisper: {} }, { ifPresent: 'get', ifAbsent: 'add' })`, then
  `box.expose()`.
* **Nothing asks the user on its own.** `useVault` reads `bank.vaultAt` once `hello` is `ready` and
  never calls `bank.ensureVault`, which launches `build_vault` for an unborn vault. Click handlers
  call `bank.ensureVault` and then `vault.ensureUnlocked()` before any verb that needs the vault
  unlocked, so each dialog opens on the user's gesture.
* **No holder count.** A component that exposes a box unexposes it on unmount, and that hides the
  whisper from every holder of the same Box: [regressions.md](regressions.md), first entry. The
  Coach expects a different approach later, not a counter.
* **The demo runs under `<StrictMode>`**: expose from a button after mount, never in an effect.
* **Names.** The dev panels are `DevBoxInspector`, `DevVaultDBInspector`, `DevDeviceDBInspector`,
  exported only from a new `safebyok-react/devmode` entry, so a host gets them only by importing it
  by name. `VaultDB` and `DeviceDB` are spelled so, never `Db`.
* **Dependencies** that `safebyok-old` used may be added without asking first. Name each one in the
  thread file and the PR. Any other runtime dependency is proposed first (PROCESS.md,
  *Dependencies*).
* **The `devicedb_idb` line (#567 → #568 → #569 → #570) is in flight** on the core: DeviceDB verbs
  become `stow`, `peek`, `forget`, `listLeases`, and `IdbDeviceDB` joins `safebyok/browser`. Until it
  merges, touch no core file it changes beyond a re-export in `src/index.ts`:
  `helpers/consts.ts`, `helpers/phrases.ts`, `refusals/errors.ts`, `shapes/*`, `storage/*`,
  `models/bank.ts`, `models/lease.ts`, `models/vault.ts`.
* **The demo's storage until thread 10:**
  * `idbVaultDB` from `safebyok-indexeddb`, which is on the new core on main;
  * `MemoryDeviceDB`, so every reload asks for the passphrase;
  * a demo-local strength checker in `src/lib/`, marked DEMO JANK, of at least 12 characters;
  * a `device_id` the demo mints once and keeps in `localStorage`.

  Thread 10 replaces all of these with `browserOpts`. The fake auth's stores stay demo-local.
* **The safebyok-react README** is 555 lines about the old API. Each thread rewrites the sections
  for what it changes and deletes sections that describe what is gone. It never keeps a stale
  section.
* **Changesets**: every thread that changes a published package writes one (PROCESS.md,
  *Changesets*). safebyok-react's surface changes wholesale; pre-1.0, nothing keeps a shim.

## The Coach's request, verbatim

> The code is nearing the end of a rewrite. You will cement one of the last big pieces, the
> react_new part. [...] I would like to get react and the demo-react working. There are likely some
> gaps to fill. You can, in notes/expose_improves_security.md, see a pencil sketch of two ways to use
> the library:
> 1. a slightly "higher" security one that never involve exposing secrets;
> 2. the pure-react aw-ain't-that-cute demo friendly one: everything is handled for you, it's barely
> more than 12 lines and some of those are closing braces
> 3. the one where you've taken a bit more control over the forms themselves and are building off
> managed input fields we provide
>
> Implement the knock-knock app, doing them in reverse order: 3, 2, 1
>
> The react library should export the following:
> 1. an input usable to store a secret: it has all the no-password-manager tags, marked as a
> password field, an eye to show and hide the text as entered (this is diffferent than
> veiled/unveiled, we'll add that later).
> 2. a component suitable for the "Account" hamburger, allowing you to lock your vault
> 3. ... and so on: the rest of the facilities needed to make our demo app
> 4. pull the inspection panels from the demo into safebyok-react. it should require importing
> safebyok/devmode, and every component should have DevMode in the name. [...]
>   - a dev mode VaultDb panel : simple sparse component to see the contents of the db and make
>   calls against it. This is a bare-bones "database" view of the data
>   - a dev mode whisper panel : simple sparse component showing the "client side": select a vault
>   scope, select a box label, and exercise the commands against it, including put, lock, expose,
>   etc. exposing the box "bob" in this panel should affect a box "bob" everywhere in the same page
>   (i.e. they share a provider)

Later rulings in the same session, verbatim where they bind the threads:

> Call the two dashboard panels DevBackdoorBoxViewer and DevBackdoorVaultDB [...] Add as a thread:
> resurrect safebyok/browser [...] Can you work around it for now? [the unborn vault] [...] May we
> keep the unpleasant unmount behavior to start [...] You are approved to add any packages needed
> without checking first -- make sure I know about it. Assume that the list of packages we'll need
> is the same as for -old, and that `safebyok/browser` will export the same cohort of stuff [...]
> my bad, I meant Requires importing safebyok-react/devmode -- you can only get the danger panels by
> acknowledging what you are adding. yes to a lease browser as a dev mode panel.

> pay extra and get the `vault.putBox({ boxlabel, whisper: {} }, { ifPresent: 'get', ifAbsent:
> 'add' })` version [...] Let's call the panels DevBoxInspector, DevVaultDbInspector,
> DevDeviceDbInspector [...] I want the demo to represent something that would (after removing the
> inspectors) reasonably last all the way to production. I also want it to be easy to compare 3 and
> 2. I also don't want to have complications of routes or tabs. So I think all three on one page is
> OK and we'll iterate

## The threads

Waves: **1**, then **2**, then **3, 4 and 12 side by side**. Then **11** (from 3), and **5** once the
Coach restacks 4, 3 and 12 into one line, then **6 → 7 beside 8**. **9** waits on the `devicedb_idb` line merging;
**10** comes last.

### 1. core_for_react

> the rest of the facilities needed to make our demo app

*Gloss.* The small, additive core exports safebyok-react needs, so later threads import rather
than reach in:
* the correctable refusal kinds (`correctablekindVals`, or an `isCorrectable(err)` beside
  `isVaultError`);
* the types `Gatingkind`, `LockState`, `BankStage`, `DamagedBox`, and the passkey wayin header type
  `gating.passkeyHeader` carries;
* `PasskeySaltBytes` / `PrfAnswerBytes`, `MinuteMillis`;
* whatever the boundary needs to turn a foreign throw into a VaultError without quoting it (today's
  `refusalFor`).

Re-exports in `src/index.ts`, with tests in `tests/index.test.ts`; a changeset.
* *Touches:* `packages/safebyok/src/index.ts`, its test. Nothing on the `devicedb_idb` line's list.
* *Levels:* worker `sonnet`; review `low`.
* *Depends on:* nothing. *Size:* small.
* *Look-ahead:* threads 2 and 3 import these. Name the passkey header type as the core names it.
* *Review:* `low`, fixed. The style pass put the three new tests in chai form. Left, minor: the `HostErrorSanitizer` test doesn't say it covers `refusalFor`'s `@example`; no hostile-input case for `refusalFor` (moved to Cleanup); two compound test titles. PR #573.

### 2. react_port

> I would like to get react and the demo-react working.

*Gloss.* safebyok-react onto the new core:
* Its peer dependency becomes `safebyok`.
* `BankProvider`:
  * one Bank per `user_id`, made in an effect;
  * `bank.hello()` once made;
  * `bank.sweep()` on unmount or a change of user;
  * a `bank.autolock()` interval;
  * the default `requestCleartext` renders `GatingModal`, still only while the user's gesture is in
    hand;
  * handlers written inline make no new bank, as today.
* Hooks, each `useSyncExternalStore` over the model's `subscribe` / `getSnapshot`:
  * `useBank`, `useBankSnapshot`;
  * `useVault(vaultlabel)`, which never asks, and calls `vault.hello()` once for each vault it names;
  * `useVaultSnapshot`.
* `GatingModal`, as a map from gatingkind to dialog, with **`build_vault` and `unlock_vault`** (the
  passphrase dialog) only.
* `boundary.tsx`, `attempt-refusals.ts`, `messages.ts`, `when-shown.ts` and `WhisperField`, ported.
* The remaining kinds and the passkey calls are thread 3's. Delete them here if they won't compile,
  with their tests.
* **The demo is parked:**
  * it keeps the fake auth, a ported `SessionBar` (sign in and out) and `App` with the provider on
    the ground rules' storage;
  * `KnockKnock`, `VaultDashboard`, `WaysIn`, `PsstModal` and `inspection/` go, with their tests;
  * later threads bring each back on the new API.
  * This is a YOLO call; its row is in Open Matters.
* *Touches:* all of `packages/safebyok-react/src` and `tests`, its README and `package.json`,
  `.size-limit.json`'s `BankProvider` and `reactEverything` lines (`ignore` names `safebyok-old`),
  `demos/safebyok-demo-react`.
* *Depends on:* 1. *Size:* large. The old tests are thousands of lines on old behaviour: write new
  tests in proportion rather than porting them case by case.
* *Look-ahead:* thread 3 adds dialogs to `GatingModal`'s map and nothing else in the provider.
  Thread 4 adds box hooks beside the vault hooks, so keep the hooks' file open to that. Thread 5's
  account menu reads `useVaultSnapshot` and an unborn-vault state, so expose `unborn` plainly
  (from the bank's snapshot, or the hook's answer).
* *Review:* `medium`, fixed (6 fixes kept): `askByDialog` again ends the showing a new gating replaces;
  `NoDialog` answers once though `onDone` is inline; the README's deriver example; three style fixes.
  Left: inline `onPanic` remakes the bank, misused handlers no longer refused, the remake warning lost
  (all three to thread 12); dead strings in `messages.ts` (to thread 3); about 14 doc-block first lines
  joining two facts, and about 15 compound test titles (a row for the Coach); test gaps for the
  held-bank guard mid-render and dialogs under StrictMode; `useProvided` throws a plain `Error`. PR #574.

### 3. react_dialogs

> 3. ... and so on: the rest of the facilities needed to make our demo app

*Gloss.* *Orchestrator:* revised after thread 2 compacted three times; the passkey half moved to
thread 11.
* `GatingModal` gains `replace_passphrase` and `del_vault`.
* In the demo:
  * `WaysIn` comes back with *Change passphrase* on `vault.replacePassphrasePrompt`;
  * `SessionBar` gets *Delete account* back, on `vault.delVaultPrompt`.
* Prune what thread 2 left of deleted features once these dialogs settle which strings return:
  `Messages` entries no dialog uses, `Gripe.fromPasskey` if passkeys (thread 11) don't need it,
  `BoundarySource`'s `'GatingModal'` if nothing passes it, `useAttempts`' unused `isShown`. Leave
  what thread 11 will need.
* *Touches:* `gating-modal.tsx`, `modal.tsx`, the passphrase dialog, their tests; demo `WaysIn`,
  `SessionBar`; README sections.
* *Depends on:* 2. Runs beside 4. *Size:* medium.
* *Look-ahead:* thread 11 adds the passkey kinds the same way. Thread 5 restacks this thread with 4
  into one line, so keep `src/index.ts` edits to whole lines.
* *Review:* `medium`, fixed. The demo's cancel tests await the prompt's own promise instead of
  sleeping 20ms; *Delete account* refuses while the vault is `waiting` before it asks to confirm; one
  style fix. Left: `confirm()` before the gesture-gated delete dialog can outlast the browser's
  activation window, so a slow OK silently does nothing (fix rides in thread 5); a quiet `declined`
  also hides "asked no one" (a row for the Coach); a duplicate `useSession` in `App.tsx` (thread 5);
  duplicated `LookFor` strings and CSS; doc-block and test-title shape for the documentarian. PR #577.

### 4. react_boxes

> 1. an input usable to store a secret: it has all the no-password-manager tags, marked as a
> password field, an eye to show and hide the text as entered (this is diffferent than
> veiled/unveiled, we'll add that later).
> 2. a component suitable for the "Account" hamburger, allowing you to lock your vault

*Gloss.*
* Box hooks:
  * `useBoxes(vaultlabel)`, the box listing's snapshot;
  * `useBox(vaultlabel, boxlabel)`, the Box the listing holds, so one Box per label across the page;
  * `useBoxSnapshot(box)`;
  * `useWhisper(box)`, live `box.whisper`.
* Components:
  * `BoxWhisperField`: an input bound through `BoxFields.of(box).bind(path)`, with
    `WhisperFieldAttributes`, `type="password"` and the eye, which flips the input's type and never
    calls `veil`;
  * `VaultLockControl`, for an account menu: lock state, Lock (`vault.lock()`), Unlock
    (`vault.ensureUnlocked()`, after `bank.ensureVault`);
  * `CreateVaultButton`.
* `safebyok/dom` may be improved where `BoxWhisperField` needs it. Its policies may not change.
* *Touches:* new files in `packages/safebyok-react/src` and tests, `src/index.ts`, README;
  maybe `packages/safebyok/src/dom/`.
* *Levels:* review `high`: it puts whisper text into the DOM (`notes/guarantees.md`).
* *Depends on:* 2. Runs beside 3. *Size:* medium.
* *Look-ahead:* threads 5 to 8 build on these hooks. `DevBoxInspector` (8) uses `useBox` and so
  shares the Box with every flow; regressions.md's first entry applies, and the hooks' doc blocks
  say nothing of it beyond one line.
* *Review:* `high`, fixed. `CreateVaultButton` stays disabled until the bank is `ready`; seven test
  titles trimmed; a new test that `useBox` and `useBoxes` read none after the vault's tombstone. The
  DOM paths were checked by hand: no whisper in state, props or attributes. Left: Show survives a
  hide (thread 11); Unlock through `bank.tryEnsureVault` can open a build dialog for a vault deleted
  elsewhere (thread 11 uses the vault in hand); `useBoxes` can't say "not listed yet" (a row for the
  Coach); no double-click guard (recorded only); doc-block shape; test helper names. PR #576.

### 5. demo_fields

> Implement the knock-knock app, doing them in reverse order: 3, 2, 1

*Gloss.* The demo stands up on the new core, and flow 3 comes first:
* The ground rules' storage, and a demo-local `localStorage` store for the fake auth in place of
  `safebyok-old`'s `domStore`.
* The outage switch becomes a subclass of `IdbVaultDB`.
* An account menu with `VaultLockControl`, kept in a form that could ship.
* `KnockKnockFields`:
  * `useBox('main', 'anthropic_api_key')` and `BoxWhisperField path="apiKey"`;
  * Edit is `bank.ensureVault` → `vault.ensureUnlocked()` → `putBox(..., { ifPresent: 'get',
    ifAbsent: 'add' })` → `box.expose()`;
  * Save is `BoxFields.of(box).save()`;
  * knock reads the key from the exposed whisper.
* The page holds the three flows side by side, with no routes or tabs, and reads as an app that
  could ship once the inspectors are removed. `lib/anthropic.ts` takes the key as text from
  whichever flow calls it.
* After this thread, nothing in the demo imports `safebyok-old`.
* Ride-alongs from thread 3's review (#577):
  * *Delete account* calls `confirm()` before `vault.tryDelVaultPrompt()`, and a slow OK outlasts the
    browser's activation window, so the gated dialog is declined unasked and nothing happens. Confirm
    only on the unborn path; for a present vault the passphrase dialog is the confirmation.
  * `App.tsx`'s `Page` calls `useSession(auth)` a second time; pass the session down.
* Ride-alongs from thread 4's review (#576), in `packages/safebyok-react`:
  * `useRevealToggle` (`reveal-toggle.tsx`) resets to hidden when its field hides. Today Show
    survives a lock, veil or unexpose, so the next unlock writes the key into a `type="text"` field.
    Never by remounting the input, which would unbind and unexpose.
  * `VaultLockControl`'s Unlock calls `vault.tryEnsureUnlocked()` on the vault in hand rather than
    `bank.tryEnsureVault`, so Unlock never creates a vault; only `CreateVaultButton` does.
* *Touches:* `demos/safebyok-demo-react` (`src/lib/*`, `App.tsx`, new components, tests).
* *Depends on:* 3, 4 and 12, restacked into one line first. *Size:* medium-large.
* *Look-ahead:* threads 6 and 7 each add one sibling flow component beside `KnockKnockFields`;
  thread 8 adds the dev panels below the app. Give each a slot in `App.tsx`.

### 6. demo_exposed

> 2. the pure-react aw-ain't-that-cute demo friendly one: everything is handled for you, it's barely
> more than 12 lines and some of those are closing braces

*Gloss.* `KnockKnockExposed`:
* `useBox` + `useWhisper(box)`, a controlled input of `whisper.apiKey ?? ''`;
* `box.patchWhisper({ apiKey })`, `box.putExposed()`;
* `unexpose` on unmount; Edit exposes as in 5.

The form's whisper handling aims at the note's twelve lines. Where safebyok-react could take more
of it (a `useExposedWhisper`-style hook), propose it in open matters rather than build it.
* *Levels:* worker `sonnet`.
* *Depends on:* 5. *Size:* small.

### 7. demo_sealed

> 1. a slightly "higher" security one that never involve exposing secrets;

*Gloss.* `KnockKnockSealed`:
* `WhisperField` (free, uncontrolled) + `vault.putBox({ boxlabel, whisper: { apiKey } })` to save;
* knock does `await box.extractWhisper()` inside its handler;
* nothing is exposed.

* *Levels:* worker `sonnet`; review `low`.
* *Depends on:* 6. *Size:* small.

### 8. dev_inspectors

> pull the inspection panels from the demo into safebyok-react [...] you can only get the danger
> panels by acknowledging what you are adding.

*Gloss.* A `safebyok-react/devmode` entry (`package.json` `exports`, `tsdown.config.ts`), with:
* **`DevVaultDBInspector`**, a bare database view over any VaultDB's public verbs: `listVaults`,
  then `listBoxes` for each live vault, `watch` for changes. Raw `getVault`, `getBox`, `delBox` and
  `tidyGone` buttons.
* **`DevBoxInspector`**: pick a vaultlabel and a boxlabel, then `put`, `expose`, `unexpose`,
  `veil`, `unveil`, `vault.lock()`, `ensureUnlocked`, `extractWhisper`, `delBox`. It goes through
  `useBox`, so exposing "bob" here exposes "bob" everywhere on the page.

The demo shows both below the app, behind its outage switch, and drops its old `inspection/`
folder. `DevDeviceDBInspector` waits for thread 10, after the DeviceDB verbs are renamed.
* *Touches:* `packages/safebyok-react` (new `src/devmode/`, `package.json`, `tsdown.config.ts`,
  README, a size line of its own), demo `App.tsx`.
* *Depends on:* 5. Runs beside 6 and 7. *Size:* medium.
* *Look-ahead:* thread 10 adds `DevDeviceDBInspector` to the same entry.

### 9. browser_batteries

> Add as a thread: resurrect safebyok/browser [...] Assume that the list of packages we'll need is
> the same as for -old, and that `safebyok/browser` will export the same cohort of stuff

*Gloss.* `safebyok/browser` exports what the old one did:
* `zxcvbnStrengthChecker`, with `MinPassphraseChars` and `MinZxcvbnScore`;
* `idbDeviceDB` (from #569);
* `browserOpts({ dbName }?)`, the frozen bag of `keyDeriver`, `deviceDB` and `strengthChecker`, the
  same bag for the same `dbName`.

More detail:
* The zxcvbn dictionary loads as its own chunk at `hello()`, through the checker's `load`.
* Dependencies: `@zxcvbn-ts/core` and `@zxcvbn-ts/language-common`.
* `Bank.make` now requires a `device_id` the old bag had no part in: decide whether `browserOpts`
  supplies one. It is sync and called in render, so it would come from `localStorage`. Either way,
  record it as an open matter.
* The core README's *Not done yet* and CUSTOMIZATION.md's checker section come back with it. The
  `zxcvbnStrengthChecker` and `browserOpts` size lines point at `packages/safebyok/dist/browser.js`.
* The prose on why these live in core is `notes/good_bank_opts_are_in_browser.md`, on the sprint
  PR. Link it; don't restate it.
* *Touches:* `packages/safebyok/src/browser.ts`, a new checker module, `package.json`, README,
  CUSTOMIZATION.md, `.size-limit.json`.
* *Depends on:* the `devicedb_idb` line (#567 → #568 → #569 → #570) on main. Cut from main once it
  has merged. *Size:* medium.

### 10. demo_browser

> yes to a lease browser as a dev mode panel.

*Gloss.* The demo moves to `...browserOpts({ dbName: Applabel })`:
* `idbDeviceDB`, so a lease survives a reload;
* zxcvbn in place of the demo-local checker;
* `device_id` as thread 9 decides.

`DevDeviceDBInspector` joins `safebyok-react/devmode`: the lease rows through the renamed DeviceDB
verbs (`listLeases`, or `listRawLeases` for damaged rows too), each row with `forget`. The demo
shows it beside the other two.
* *Levels:* worker `sonnet`; review `low`.
* *Depends on:* 9, 7, 8 and 11, restacked into one line. *Size:* small-medium.

### 11. react_passkeys

> 3. ... and so on: the rest of the facilities needed to make our demo app

*Gloss.* *Orchestrator:* split from thread 3.
* `GatingModal` gains `add_passkey` and `revoke_passkey`.
* `createPasskey`, `askPasskey` and `passkeysAvailable` are rebuilt on `gating.passkeyHeader`
  (`WayinHeader | null`) and the new `PasskeyAnswer`, with `PrfAnswerBytes` from `safebyok`.
* `PasskeyUnlockButton` joins the unlock dialog.
* The demo's `WaysIn` gets back *Add / Replace fingerprint* (`vault.addPasskeyPrompt`) and *Remove
  fingerprint* (`vault.revokePasskeyPrompt`).
* Thread 2 deleted the old passkey files and the fake WebAuthn authenticator from the old test
  helpers. They are in git at `b903c131c`, to restore and rebuild rather than port line by line.
* *Touches:* `passkey.ts`, `passkey-unlock-button.tsx`, `gating-modal.tsx`, their tests; demo
  `WaysIn`; README.
* Read the passkey gating kinds from the core (`add_passkey`, `revoke_passkey`), not from thread 3's
  thread file, which says `replace_passkey` in one line.
* Ride-along: export `ReplacePassphraseModal` and `DelVaultModal` (thread 3).
* *Depends on:* 3. *Orchestrator:* cut from thread 3's tip while the restack of 4, 3 and 12 waits on
  the Coach (`/restacker` refuses agents from the base checkout); its two thread-4 ride-alongs moved
  to thread 5. *Size:* medium.

### 12. provider_handlers

> I would like to get react and the demo-react working.

*Gloss.* *Orchestrator:* from thread 2's review (#574). The provider's handler props, made right:
* A non-function `onBadNews` or `requestCleartext` from a JavaScript host reaches `Bank.make` as
  given, so it is refused `bad_option` to the error boundary, as before thread 2.
* `onPanic` is held in a ref as `onBadNews` is, so writing it inline makes no new bank. With no
  `onPanic` given, the bank must still behave as the core does with none (it vacates the vault). A
  panic from a bank the provider has let go must never reach the next user's handler. Prefer the
  core's no-handler behaviour for it, and record the choice as an open matter.
* The warning, said once through the logger, when a prop that remakes the bank (`logger`,
  `keyDeriver`, `strengthChecker`, `vaultDB`, `deviceDB`) changes identity between renders, as the
  old provider gave.
* *Touches:* `packages/safebyok-react/src/bank-provider.tsx`, its tests, the README's provider
  section.
* *Levels:* worker `sonnet`; review `medium` (a lease that survived its erase is what `onPanic`
  hears).
* *Depends on:* 2. Runs beside 3 and 4. *Size:* small.
* *Review:* `medium`, fixed. The remake warning no longer fires falsely when a host makes `vaultDB` or
  `deviceDB` anew for each user; three test titles trimmed. The let-go panic was traced through the
  core: a swept vault's `vacate()` is a no-op, so throwing to the platform is what the core does with
  no handler. Left, minor: `misusedHandler`'s doc block; `null` hidden by its cast; small
  redundancies; an `it.each` table in `'`. PR #575.

## For the Coach

* **Run `/restacker 573 574 576 577 575`** (line `main → #573 → #574 → #576 → #577 → #575`). Thread 5
  waits on it; the skill refuses agents from the base checkout.

* Threads 9 and 10 wait on the `devicedb_idb` line (`main → #567 → #568 → #569 → #570`) merging,
  which waits on your restack. The other threads don't.
* The base checkout's `whiteboard/20261107-react_new/` holds my pre-sprint drafts (`plan.md`,
  `regressions.md`). This directory's copies (`design.md`, `regressions.md`) are current. I haven't
  touched the base checkout's.
* The sprint doc's Open Matters holds the questions still hanging.
