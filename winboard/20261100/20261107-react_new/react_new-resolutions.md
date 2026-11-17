# Sprint react_new: resolutions

The Coach's rulings from the sprint doc's Resolved tab and the calls left to the orchestrator, swept 2026-11-07.

## Rulings

Newest batch first; within a batch, in the order the doc held them.

- **`device-db-new.ts` has the same `-new` suffix.** Rename it in thread 18, after 15.
  Coach answer (in chat): "yes rename it to plain-old device-db.ts".
  2026-11-07. Raised in thread 18.
  Work: thread 18's gloss, which now waits on 15; with it the chat rulings on brands (`isVaultDB` checks a getter
  brand on every VaultDB class; `IsAdapterVaultDB` / `isAdapterVaultDB` only on the adapter and its children, in
  the ThingVaultDB order).

- **A knock exposes the saved box.** (empty, drafting) Superseded 2026-11-07: thread 5's review found the knock read
  the exposed working copy (an unsaved edit could be sent); the rework reads the saved key with
  `box.extractWhisper()`, and a knock no longer exposes the field.
  Coach answer: (empty, drafting; superseded).
  2026-11-07. Raised in #584, thread 5.
  Work: the thread 5 rework's new PR.

- **What `device_id` is for.** Only a label in each wayin's header; it must be a UUID; Rec: keep `browserOpts` free of
  it, and a remembered random id per app and user if hosts want help.
  Coach answer: "gotcha. What we want is something run right ahead of the bank that will get-or-create a device id,
  keyed by the bank scope, using DeviceDB. call it bank and store { applabel, user_id, device_id }; it should be a
  random uuid. It is supposed to be fed to the bank provider. Is this straightforward? The way of doing it by bank
  itself was very janky."
  2026-11-07. Raised in #579, thread 9.
  Work: Straightforward: a `bank` row and an `ensureBank` verb beside the lease verbs, in both stores; the IndexedDB
  device database moves to a new version (remembered unlocks forgotten once). Thread 15 (device_bank, core) and
  thread 16 (the provider calls it); the reading is an Open Matters row.

- **Options could be read once, when the bank is made.** Rec: make the bank once per `user_id`, ignore later changes,
  warn once.
  Coach answer: "yay simpler: one per applabel + user_id (you only mentioned user_id, it should be both".
  2026-11-07. Raised in #575, thread 12.
  Work: thread 16 (provider_once); handlers read once too is an Open Matters row.

- **For coach: try adding a passkey on a real Safari before release.**
  Coach answer: "heard".
  2026-11-07. Raised in #578 review, thread 11.
  Work: yours.

- **The core has no "passkeys unavailable here" refusal.** A core thread adds `passkey_unavailable`; the React side
  switches to it.
  Coach answer: (empty: took the Rec).
  2026-11-07. Raised in #578, thread 11.
  Work: thread 17 (passkey_unavailable), on #583.

- **The demo's stand-in strength checker.** A demo-local 12-character checker, marked DEMO JANK, until thread 10
  brings zxcvbn.
  Coach answer: "can you just speedrun the browser resurrection".
  2026-11-07. Raised in the plan, ground rules.
  Work: thread 5 runs the demo on `browserOpts` from #579, cut from its tip; thread 10 folded into 5 and 8 (plan).

- **The demo forgets the unlock on reload, until thread 10.**
  Coach answer: (empty, drafting) Settled by the speedrun ruling above: thread 5 uses `idbDeviceDB`.
  2026-11-07. Raised in the plan, ground rules.
  Work: thread 5 (see the speedrun ruling).

- **Who rewrites the safebyok-react README.** Each thread rewrites its sections; a documentarian after.
  Coach answer: "we'll rewrite from scratch later. Strip it down to a sentence or so if that won't cause a failing
  test".
  2026-11-07. Raised in the plan, ground rules.
  Work: thread 14 (react_doc_trim).

- **A void vault instead of a create dialog.** Leave it for a thread of its own after this sprint.
  Coach answer: (empty: took the Rec).
  2026-11-07. Raised in chat.
  Work: a TODO.md entry, thread 13.

- **What replaces the holder count.** Yours when ready; nothing in the sprint waits on it.
  Coach answer: (empty: took the Rec).
  2026-11-07. Raised in regressions.md.
  Work: no work; regressions.md's first entry stands.

- **The start-over offer is dropped.** Decide later whether it returns, likely as delete-and-rebuild behind a warning.
  Coach answer: (empty: took the Rec).
  2026-11-07. Raised in #574, thread 2.
  Work: a regressions.md entry; #574.

- **Autolock is checked every minute.** Keep the fixed one-minute `bank.autolock()` interval.
  Coach answer: "autolock is intended to be more on the period of weeks. A timer isn't the right solution; just leave
  it and note that in regressions".
  2026-11-07. Raised in #574, thread 2.
  Work: a regressions.md entry; #574.

- **A deleted vault reads as unborn.** Keep it.
  Coach answer: (empty: took the Rec).
  2026-11-07. Raised in #574, thread 2.
  Work: #574.

- **A failed box listing goes to `onBadNews`.** Keep it.
  Coach answer: (empty: took the Rec).
  2026-11-07. Raised in #574, thread 2.
  Work: #574.

- **The dialog's gesture check leans open.** Keep it.
  Coach answer: (empty: took the Rec).
  2026-11-07. Raised in #574, thread 2.
  Work: #574.

- **A documentarian run over safebyok-react.** One run after threads 3, 11 and 12.
  Coach answer: "would you have an agent write a simple single line on each now and I'll have a documentarian run
  later -- i get best results when it starts from something small".
  2026-11-07. Raised in #574 review.
  Work: thread 14 (react_doc_trim); a plan ground rule: one-line doc blocks.

- **A let-go bank's panic goes to the platform, not the next user.** Keep it.
  Coach answer: (empty: took the Rec).
  2026-11-07. Raised in #575, thread 12.
  Work: #575.

- **`onBadNews: null` is now refused.** Accept it, and name null in the changeset.
  Coach answer: (empty: took the Rec).
  2026-11-07. Raised in #575, thread 12.
  Work: thread 13 amends `.changeset/20261107-provider_handlers.md`; #575.

- **A quiet `declined` also hides "asked no one".** Leave it.
  Coach answer: (empty: took the Rec).
  2026-11-07. Raised in #577 review, thread 3.
  Work: #577.

- **`useBoxes` can't say "not listed yet".** Leave it unless the demo's flows need it.
  Coach answer: (empty: took the Rec).
  2026-11-07. Raised in #576 review, thread 4.
  Work: thread 5's handoff; #576.

- **TOP For coach: run `/restacker 573 574 576 577 575 578`.**
  Coach answer: "done".
  2026-11-07. Raised in the sprint.
  Work: the Coach merged #573 to #578; #579 stands on them; threads 5, 13 and 14 cut.

- **Thread 11 goes ahead on thread 3 alone.**
  Coach answer: (empty, drafting) Settled by the merge of #577 and #578.
  2026-11-07. Raised in the sprint.
  Work: none further.

- **A mistyped add leaves an unused passkey behind.** Accept it for now; refusing an empty field first is a small
  follow-up.
  Coach answer: (empty: took the Rec).
  2026-11-07. Raised in #578, thread 11.
  Work: the empty-field refusal is a directive to thread 13; #578.

- **No "Replace fingerprint".** Accept it; Replace is Remove then Add.
  Coach answer: "add to regressions".
  2026-11-07. Raised in #578, thread 11.
  Work: a regressions.md entry; #578.

- **For coach: `notes/guarantees.md` still names the old passkey form.** Reword lines 107, 155 and 162, or say an
  agent may.
  Coach answer: "we will go over those".
  2026-11-07. Raised in #578, thread 11.
  Work: left to the Coach; #578.

- **For coach: threads 9 and 10 wait on your restack.** The browser thread needs `idbDeviceDB`, which arrives with the
  devicedb_idb line (#567, #568, #569, #570), and that line waits on your /restacker. Rec: restack and merge that line
  when you can.
  Coach answer: none needed: the line merged (main at de4943bd6) before the row was answered.
  2026-11-07. Raised in the plan.
  Work: thread 9 started from main.

- **Demo parked during thread 2.** Moving safebyok-react onto the new core breaks every demo component at once, so
  thread 2 strips the demo to sign-in and the provider, and threads 3 to 8 bring each piece back on the new API;
  porting the whole demo inside thread 2 would double the sprint's largest thread. Rec: park it.
  Coach answer: (empty: took the Rec).
  2026-11-07. Raised in the plan, thread 2 (#574).
  Work: already done in #574; nothing further.

## Calls left to the orchestrator

- **Threads 3 (dialogs), 4 (box hooks) and 12 (provider handlers) build side by side.**
  Call: both cut from thread 2; I restack them into one line before thread 5.
  Landed in: Plan, waves.

- **Demo's vault storage before thread 10.**
  Call: `idbVaultDB` from `safebyok-indexeddb`, already on main, so the dev panels show real rows.
  Landed in: Plan, ground rules.

- **`DevDeviceDBInspector`.**
  Call: built in thread 8: the DeviceDB verbs are on main, and thread 10 is folded.
  Landed in: Plan, thread 8.

- **Panel spelling.**
  Call: `VaultDB` / `DeviceDB`, as the code and VOCABULARY.md spell them.
  Landed in: Plan, ground rules.

- **A non-function onBadNews no longer reaches Bank.make to be refused (#574).**
  Call: restore the pass-through, so misuse still reaches the error boundary: a two-line ride-along.
  Landed in: thread 12, with the other provider-handler findings.

- **Thread 2 compacted three times before its first justify.**
  Call: split thread 3: dialogs (change passphrase, delete vault) stay in 3; passkeys (add, revoke, the WebAuthn
  calls, the unlock button) become thread 11, stacked on 3.
  Landed in: Plan, threads 3 and 11.

- **Writing onPanic inline remakes the bank, and closes any open dialog (#574 review).**
  Call: hold it in a ref as onBadNews is; with none given, keep the core's no-handler behaviour; a let-go bank's panic
  never reaches the next user's handler.
  Landed in: thread 12.

- **The warning when a prop remakes the bank was lost (#574 review).**
  Call: bring it back: said once through the logger, for logger, keyDeriver, strengthChecker, vaultDB and deviceDB.
  Landed in: thread 12.

- **Strings and flags left from deleted features in messages.ts (#574 review).**
  Call: prune once the dialogs settle which strings return, leaving what passkeys need.
  Landed in: thread 3.

- **The new ReplacePassphraseModal and DelVaultModal are unexported (#577).**
  Call: export them, as the old package exported PassphraseModal: generous exports, pre-1.0.
  Landed in: thread 11, beside the passkey exports.

- **#574's description promised allowStartOver and the passkey exports for thread 3 (#577).**
  Call: corrected: passkeys to thread 11; start-over is an Open Matters row.
  Landed in: #574, done.

- **Delete account asks confirm() before the gesture-gated dialog; a slow OK makes the click silently do nothing
  (#577 review).**
  Call: confirm only for an unborn vault; for a present one, the passphrase dialog is the confirmation.
  Landed in: thread 5, which rebuilds the account strip.

- **App.tsx subscribes to the session twice (#577 review).**
  Call: pass the session down.
  Landed in: thread 5.

- **The eye's Show survives a lock: the next unlock writes the key into a plain-text field (#576 review).**
  Call: reset the toggle to hidden whenever its field hides.
  Landed in: thread 5, a ride-along (moved from 11).

- **VaultLockControl's Unlock goes through bank.ensureVault, so it can create a vault deleted elsewhere
  (#576 review).**
  Call: unlock the vault in hand; only CreateVaultButton creates (my plan's wording was wrong).
  Landed in: thread 5, a ride-along (moved from 11).

- **Thread 10 after the browser speedrun ruling.**
  Call: folded: the demo's move to browserOpts is thread 5's; DevDeviceDBInspector is thread 8's.
  Landed in: Plan, threads 5, 8 and 10.

- **Thread 5's base, with #579 still open.**
  Call: cut from #579's tip (on the merged #573 to #578), stacked on it; #580 and #571 come in at the wrap-up restack.
  Landed in: Plan, thread 5.

- **The one-line doc blocks and the README cut.**
  Call: a thread of its own (14, react_doc_trim): sonnet, low review, from main beside 5 and 13.
  Landed in: Plan, thread 14.

- **The changeset naming onBadNews: null, the void-vault TODO, the empty-passphrase refusal.**
  Call: ride-alongs on thread 13, already in safebyok-react's passkey and provider files.
  Landed in: Plan, thread 13.

- **The one-line trim dropped PassphraseAdvice's warning that it hears the passphrase in plain text (#581).**
  Call: restored on its one line: a caveat about a secret a host could get wrong.
  Landed in: #581, the reviewer's commit.
