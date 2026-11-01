# Sprint reform2: resolutions

These are the Coach's rulings on the sprint doc's Open Matters, 2026-10-19, swept from its
Resolved tab, newest batch first.

- **GraphQL marks the sidecar 'plain'.** In safebyok-graphql's fields.ts, the sidecar_json column is
  classed 'plain', a code identifier that disagrees with the vocabulary; Rec leave it for a later
  sweep, since renaming it is code. Coach: "yes". 2026-10-19, thread 7 (#176). Work: VOCABULARY.md
  notes the exception (restack tidy, #184); the rename goes into the sprint's TODO PR.
- **A lost write over a damaged box goes unseen.** When a damaged lockbox names no revision, a store
  clears it and then writes; two overlapping stores can both land and the first whisper is silently
  gone; Rec bring back thread 4 (or just its refusal). Coach: "the store mechanics will be changing
  to solve this, but go with your rec". 2026-10-19, #176 review. Work: thread 4 (no_clear) revived
  whole, cut from #184's tip.
- **No change bell for a retire that found nothing.** IndexedDB no longer rings other tabs when a
  retire finds the lockbox gone; Rec keep. Coach: "yes". 2026-10-19, thread 2 (#178). Work: as
  built.
- **Mismatch checks also become bad_record.** The vault-id and key-epoch mismatch checks moved from
  bad_option to bad_record; Rec keep. Coach: "yes bad_record". 2026-10-19, thread 6 (#179). Work: as
  built.
- **"Nothing was written" on a retire.** bad_record's message says "so nothing was written" even for
  a retire; Rec "nothing was changed". Coach: "if you know it's a retire, say "nothing was removed"
  -- that's the headline". 2026-10-19, #179 review. Work: thread 11 (refusal_rulings).
- **Some bad records are still bad_label.** A store with no lockbox, or vault props whose app label
  fails, is refused bad_label; Rec (taken) a README clause, added by thread 8. Coach: "go with
  what's natural. if something is validating the label only it should throw bad_label without
  checking the rest. if something is validating the record it should refuse bad_record even if it
  was only the label at fault". 2026-10-19, #179 review. Work: thread 11 (refusal_rulings), which
  also rewrites thread 8's README clause.
- **GraphQL says bad_option for the same mistake.** The GraphQL client reports a server's
  malformed-variables refusal as bad_option; Rec leave it. Coach: "if the record is at fault that
  should be the refusal". 2026-10-19, thread 6 (#179). Work: thread 11 (refusal_rulings).
- **The size-budget rule's wording.** #181 words the rule for the sprint skill and PROCESS.md; Rec
  merge #181 as worded. Coach: "y". 2026-10-19, #181. Work: none; #181 awaits your merge.
- **For coach: let #184 out of draft.** Coach: "done". 2026-10-19, thread 10 (#184). Work: none.
  Thread 10's file still says "PR to follow"; left as the worker's own record.
- **Two vault-props fields are not authenticated.** unlock_epoch, the props' own vault_key_epoch and
  the wayins list are bound into no encryption context, so they are called unencrypted; Rec confirm.
  Coach: "I don't thkn we can bind wayins and unlock_epoch will be removed as a feature soon".
  2026-10-19, thread 10 (#184). Work: as built; unlock_epoch's removal noted in the sprint's human
  entry.
- **"Visible in storage" where plain "visible" is unclear.** Rec keep. Coach: "yes". 2026-10-19,
  thread 10 (#184). Work: as built.
- **One security-note word.** "visible bags" for a Convex error that may quote the sidecar; Rec
  keep. Coach: "yes". 2026-10-19, thread 10 (#184). Work: as built.
- **storeBox() docs omit the new warning.** Rec (taken) add the sentence at the restack. Coach:
  "store will be losing its role in even thinking about removal so go with what's easiest".
  2026-10-19, #183 review. Work: added by the restack (330871ca, #184); thread 4 removes it again,
  since the store no longer clears.
- **A separate warning for a damaged retire.** retireBox() logs its own message when it removes
  something other than the damaged lockbox it showed; both warnings carry `damaged: true`; Rec keep.
  Coach: "this sounds conjectural? Is there a plausible way this can happen?". 2026-10-19, thread 9
  (#183). Work: as built. Answer: yes, whenever two devices act on one damaged lockbox at once.
  Device A lists it damaged; device B stores a fresh whisper over it (the ordinary repair); A's
  user, still looking at the damaged row, presses retire. A's retire names the damaged revision,
  finds B's, and removes B's fresh whisper. The warning is the only trace of that, so it says the
  box shown was damaged.
- **GraphQL retire outcome is an enum.** `SafebyokRetireOutcome` rather than a plain string; Rec
  keep. Coach: "yes; don't we use an enum too?". 2026-10-19, thread 2 (#178). Work: as built.
  Answer: yes, the core checks the same three values with a Zod enum (`Z.enum(['retired',
  'retired_other', 'absent'])`, vault-db.ts:85), and the GraphQL enum mirrors it.
- **Per-PR changesets stay beside the summary.** Rec keep. Coach: "yes". 2026-10-19, thread 8
  (#182). Work: as built.
- **Summary names five packages.** safebyok and the four adapters, not react or fastkey; Rec keep.
  Coach: "yes". 2026-10-19, thread 8 (#182). Work: as built.
- **Only null means "someone else wrote first".** Any other non-record answer from a write is
  `corrupt_record`; Rec keep. Coach: "yes Once a new return shape is added, we will want the adapter
  to return the record that is in the DB at the time it returns -- old_record or new_record -- and
  an explanation. Absent the means to communicate the distinction, go as you proposed". 2026-10-19,
  thread 1 (#177). Work: as built; the direction goes into the plan's *Deferred* (the
  always-complete result).
- **The bad-answer case lives in core tests.** Rec keep. Coach: "yes". 2026-10-19, thread 1 (#177).
  Work: as built.
- **Errors after a store lands: six kinds, not four.** Rec keep. Coach: "yes". 2026-10-19, thread 1
  (#177). Work: as built.
- **corrupt_record can reach a store's caller.** Rec keep until the always-complete result. Coach:
  "yes". 2026-10-19, thread 1 (#177). Work: as built.
- **A malformed write answer leaves the snapshot stale.** Rec leave for the deferred fold of a
  write's answer into the snapshot. Coach: "yes". 2026-10-19, #177 review. Work: the plan's
  *Deferred*.
- **Postgres write result is loosely typed.** Rec tidy next time Postgres is touched. Coach: "add as
  todo". 2026-10-19, #177 review. Work: a TODO entry, in a TODO PR of its own at wrap-up.
- **New exported names for a lockbox retire.** Rec keep. Coach: "yes". 2026-10-19, thread 2 (#178).
  Work: as built.
- **"A usage count" as a sidecar example.** The server can never change a sidecar, and a client
  bumps a count only by storing the whole lockbox again; Rec swap it for something set once. Coach:
  "reword "usage count" as "calls made to openrouter by app using this whisper". I was conjecturing
  metadata that made obvious sense to store next to a whisper, unencrypted but securely verified".
  2026-10-19, #176 review. Work: thread 10 (`visible`), as a directive.
- **"Visible" for more than the sidecar.** The trust class covers every authenticated, unencrypted
  field; Rec (taken) thread 10 gives *visible* its own VOCABULARY entry. Coach: "yes. Add "visible"
  as meaning "visible and authenticated", strictly, and "unencrypted" as meaning "unencrypted,
  possibly authenticated, possibly not"". 2026-10-19, #176 review. Work: thread 10 (`visible`), as a
  directive: two VOCABULARY entries, each field classed by whether it is truly authenticated.
- **Retire of a changed lockbox.** When a retire finds a different revision than the one shown,
  thread 2 removes it anyway and warns through the host's logger; Rec keep honor-and-warn. Coach:
  "yes". 2026-10-19, thread 2 (#178). Work: already built in #178; nothing further.
- **The same mismatch inside a store over a damaged box.** `storeBox()`'s clear-then-write can meet
  a different revision; Rec the same honor-and-warn, then write. Coach: "yes. Once a record exists
  there must always be a record (tombstone or valid) while the vault exists. Clearing a damaged box
  with an old revision id should still warn, with something in there making clear it was a damaged
  record". 2026-10-19, thread 2 (#178). Work: honor-and-warn stands (#178); the warning's wording
  goes to a new thread 9 (`damaged_warning`); the invariant goes into the plan's *Deferred*
  (tombstones) and the progress document.
- **The new refusal's name.** Rec `bad_record`. Coach: "Fine for now". 2026-10-19, thread 6 (#179).
  Work: built in #179; nothing further.
- **Docs thread split in two.** Thread 7 does the wording beside the line; thread 8 the budget and
  summary changeset. Coach: "LGTM". 2026-10-19, plan. Work: as run.
- **Size budgets left unmeasured.** A thread over a limit reports rather than raises; thread 8
  rewrites budgets at the end. Coach: "please update the skill to say something like "threads should
  adjust the size budget when its change, up or down, is proportional to the changes they've made".
  If that's too vague or strident adjust and add a matter with your wording (It's probably the right
  one) I'll paste this in to chat-- you have permission to edit the skill". 2026-10-19, plan. Work:
  a PR of its own editing the sprint skill's *Size budgets* paragraph, with a matter giving its
  wording.
- **The sidecar's word.** TODO's "server accessible" against the preplan's *server-readable*; Rec
  *server-readable*. Coach: "how about "visible"?". 2026-10-19, thread 7 (#176). Work: a new thread
  10 (`visible`) sweeps the trust class to *visible*.
- **Other "public fields" wording.** Record-general "public fields / face / shell" left by thread 7;
  Rec one later sweep. Coach: "yeah, visible, in a sweep -- you can leave intermediate rewordings as
  is if that's easiesst (i.e. it's ok if it changed and then is changed back)". 2026-10-19, thread 7
  (#176). Work: thread 10 (`visible`), on top of the line.
