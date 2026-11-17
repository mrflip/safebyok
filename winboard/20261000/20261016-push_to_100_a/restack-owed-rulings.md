# Rulings owed beside their questions, at the restack

For the orchestrator, at the restack (sprint skill §5.1): each line below goes directly under its
question, as a sub-bullet when the question is a bullet, in one `plan:` commit on that branch.
The PR descriptions already carry them (#126, #127, #128, #129, #130, edited 2026-10-16). The
full question and reply for each are in `20261016-push_to_100_a-resolutions.md`.

* **20261016-crypto_small**, `whiteboard/20261016-push_to_100_a/thread-6-crypto_small.md`
  * under `**G072**: please confirm the passkey-plus-several-passphrases rule`:
    `→ *Coach (2026-10-16):* Keep as built; too complex for users, so a TODO asks if several passphrases help anyone.`
  * `**G031**` (the KeyDeriver union): nothing yet; the Coach asked for an explanation only.
* **20261016-locks_and_expiry**, `thread-3-locks_and_expiry.md`
  * under `Is lockSoon() soft ... or as built` (about line 94):
    `→ *Coach (2026-10-16):* lockSoon() is a soft lock; thread 4 (#132) builds it so.`
* **20261016-names_and_keys**, `thread-1-names_and_keys.md`
  * under `Opened: G497 (Standard Schema) would now land only in Names.rulesOf` (about line 120):
    `→ *Coach (2026-10-16):* NOTYET: stays unbuilt, nothing in this sprint needs it.`
* **20261016-react_tidy**, `thread-7-react_tidy.md`
  * under `**Opened**: "do we offer a hint?"` (about line 44):
    `→ *Coach (2026-10-16):* Yes: host placeholder, no default hint; NOTYET: option for a user's passphrase hint.`
  * after the "Still open with the Coach ... an uncontrolled `WhisperField`" sentence (about lines 48-49):
    `→ *Coach (2026-10-16):* Proceed (thread 14): uncontrolled, eyeball kept, host-fed passphrase message beside it.`
    (Thread 14's worker may already add this on its branch, which carries thread 7's file.)
  * under `autocomplete="new-password" (your list) stops autofill...` (about line 94):
    `→ *Coach (2026-10-16):* Whisper field turns away autofill and generators; passphrase field welcomes password managers (thread 14).`
  * under `The provider no longer reopens on bad_option per the ruling...` (about line 96):
    `→ *Coach (2026-10-16):* Took it as it stands; no change, thread 7 stands as filed.`
  * under `Not done: a real screen reader, real shadow-DOM hosting, a real browser (G356 stays).` (about line 101):
    `→ *Coach (2026-10-16):* Add to NOTYET (done): React binding under real assistive technology and real hosts.`
* **20261016-ci_release**, `human/20261016-ci_release.md`, each a sub-bullet under its top-level bullet
  * `**Add node-compat (22) to the main ruleset's required checks.**`:
    `→ *Coach (2026-10-16):* Added to TODO.md (Sand in the sandals); the ruleset is the Coach's to change.`
  * `**Watch the first Dependabot runtime-dependency PR after merge.**` and `**The release workflow's retry**`:
    `→ *Coach (2026-10-16):* Noted; the Coach will watch the first failed release and first Dependabot PR.`
  * `**CLAUDE.md's *Commands* is a line stale**`:
    `→ *Coach (2026-10-16):* Fixed in the Coach's own branch; nothing for the sprint.`
* **20261016-pg_container**: none owed; thread 11's worker put its lines in before filing.
* **20261016-refusals_and_catchup**, `thread-4-refusals_and_catchup.md` (the PR body, #132, carries them)
  * under `**Every device-store failure is storage_unavailable**` (about line 46):
    `→ *Coach (2026-10-16):* Keep the kind; each message as fine-grained as reasonable, groupings later if needed (thread 13).`
  * under `**The single-flight refresh queue is hand-rolled**` (about line 63):
    `→ *Coach (2026-10-16):* Yes, kept, but out of vault.ts: thread 13 moves it to a module of its own.`
  * under `**A pre-existing race**` (about line 71):
    `→ *Coach (2026-10-16):* Into TODO.md (Soonish), beside "Are we doing anyone a favor by accepting multiple passphrases?".`
  * under the review's leftover `1. close(), an outlived relock, a clock failure and lockSoon()...` (about line 86):
    `→ *Coach (2026-10-16):* Yes: close() and the outlived key count as hard locks; lock()'s doc says the clock and soft cases do not (thread 13).`
  * G499 (no question of its own in the file): the PR body carries `→ *Coach (2026-10-16):* G499 stays on the NOT YET shelf (NOTYET.md).`
* **20261016-pg_container**, `thread-11-pg_container.md` (the PR body, #131, carries them)
  * under `"Widening to every Postgres test is a one-line change"` (about line 18):
    `→ *Coach (2026-10-16):* NOTYET: the adapter's own tests stay on PGlite (NOTYET.md).`
  * after the review's six minors (about lines 25-30), under 5:
    `→ *Coach (2026-10-16):* Fix in a later thread: thread 9 takes 1-5.`

## Fifth batch (doc rev 7737): owed in the PR bodies *and* the thread files

Not yet written anywhere but the resolutions file and the plan when the first session ended. For
each, find the question in the PR body (`gh pr view N -R mrflip/safebyok --json body`) and in the
thread's file (or its `human/` entry), and put the line directly under it; in the PR now
(`gh pr edit`), in the thread file at the restack.

* **#132** (thread 4, `thread-4-refusals_and_catchup.md`)
  * Is every lockSoon() a hard lock: `→ *Coach (2026-10-16):* Kept as built: no, a soft lock.`
  * store() deciphers the old whisper to compare: `→ *Coach (2026-10-16):* Drop the compare; changed_at becomes written_at, with no claim of change (thread 17).`
  * erase() into a reborn vault says stale_write: `→ *Coach (2026-10-16):* Keep the kind, as long as the message says what happened (thread 17).`
  * A failed catch-up hides the real kind: `→ *Coach (2026-10-16):* Rec taken: pass the kinds through (thread 17, unless 13 did).`
* **#133** (thread 2, `thread-2-public_bag.md`)
  * Storing without a public bag keeps the old one: `→ *Coach (2026-10-16):* Keep for now; filed under RAGEBAIT.`
  * The empty bag counts toward the limit: `→ *Coach (2026-10-16):* Yes, keep.`
  * Room per lockbox could halve: `→ *Coach (2026-10-16):* Lower to 1,024 in thread 9, without letting many more lockboxes in.`
  * Unknown store() options: `→ *Coach (2026-10-16):* Refuse them in thread 9, through one helper shared with validators if possible.`
  * cipherBinding's part guard: `→ *Coach (2026-10-16):* Yes, thread 9.`
  * Lockbox in a module of its own: `→ *Coach (2026-10-16):* Yes, a file of its own, thread 9.`
  * __proto__ keys silently dropped: `→ *Coach (2026-10-16):* No refusal: WONTFIX, undefined behaviour (thread 9 writes it).`
* **#134** (thread 14, `thread-14-uncontrolled_fields.md`)
  * Composition rules ("a capital letter"): `→ *Coach (2026-10-16):* None of ours; three strength principles go to thread 16.`
  * The name a manager files the passphrase under: `→ *Coach (2026-10-16):* Keep the default; try it out.`
  * The demo's whisper editor stays controlled: `→ *Coach (2026-10-16):* Yes, a plain text box in the demo.`
  * The demo's WaysIn passphrase field: `→ *Coach (2026-10-16):* Yes, thread 9.`
  * The changeset reads as a migration: `→ *Coach (2026-10-16):* No migration text; describe the fields as they stand (at the restack).`
  * The App tests depend on order: `→ *Coach (2026-10-16):* Leave; filed under RAGEBAIT.`
  * Host CSS can un-hide the username field: `→ *Coach (2026-10-16):* Hide it with display: none for now (thread 9).`
  * Strength test as passphrase advice: `→ *Coach (2026-10-16):* Yes (thread 16).`
* **#136** (thread 10, `thread-10-secure_floor.md`)
  * 12 characters, or NIST's 15: `→ *Coach (2026-10-16):* No length-only test; a good estimator in safebyok/browser; host override (thread 16).`
  * A second zxcvbn dependency: `→ *Coach (2026-10-16):* Yes, keep.`
  * zxcvbn's passing score: `→ *Coach (2026-10-16):* Keep 3.`
  * Should the strength test know the user's names: `→ *Coach (2026-10-16):* Yes: a bag with their id and the vault label (thread 16).`
  * A weak passphrase during another's create: `→ *Coach (2026-10-16):* Accept.`
  * A host's test that throws: `→ *Coach (2026-10-16):* Keep.`
  * A hand-written all-zero check: `→ *Coach (2026-10-16):* Yes, the one line.`
  * An inline strength test reopens the vault: `→ *Coach (2026-10-16):* Hold it like logger instead (thread 16, YOLO 17).`
  * zxcvbn as hard dependencies: `→ *Coach (2026-10-16):* Optional peers (thread 16).`
  * Spaces count toward the floor: `→ *Coach (2026-10-16):* Why no length test is offered (thread 16).`
  * The provider repeats the core's check: `→ *Coach (2026-10-16):* Validate early, keep immutable: export checkStrengthTest (thread 16).`
* **#137** (thread 13, `thread-13-epoch_expectation.md`)
  * A device store that never opens: `→ *Coach (2026-10-16):* A kind of its own: cannot succeed vs might later (thread 17).`
  * The hard-cap recipe: `→ *Coach (2026-10-16):* Delete it; a short agent prompt instead (thread 9).`
  * FOR SHARE on a real Postgres: nothing yet; the Coach asked for an explanation.
* **#131** (thread 11, `thread-11-pg_container.md`)
  * node:crypto in a test helper: `→ *Coach (2026-10-16):* Yes: getRandomValues, the helper exported (thread 9).`

*Orchestrator, 2026-10-16:* the fifth batch's PR-body lines are written (33 placed). Nine had no
question in the PR body, because they were raised in review comments or the thread files:
#132 the store compare; #134 strength test as advice; #136 the throwing test, the all-zero line,
the inline strength test, zxcvbn as hard dependencies, spaces and the floor; #137 `FOR SHARE`
(explain pending). They stay owed in the thread files at the restack only. Two placements to
check: on #132, the lockSoon ruling sits under "Soft `lockSoon()` still forgets the remembered
unlock", and the catch-up ruling under the review's minor (2).
