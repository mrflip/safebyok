# Sprint gripes_part2 -- plan

* **Date**: 2026-10-16
* **Mode**: normal
* **Review level**: medium
* **At once**: 3 threads
* **Issued by**: flip (the Coach), through the Open Matters tab of the gripe_rulings sprint doc
  (`/turbochat`): each thread below gathers rows they set to `proceed`, quoted with their answer
  verbatim. The Coach: "sprint gripes_sprint part 2, normal mode".
* **Status**: round 2 -- thread 5 underway; 1 to 4 filed and restacked onto main at `5090c1a` (#99 merged under them): main → #104 → #103 → #102 → #101

## Read first

Beyond CLAUDE.md, and STYLE.md and VOCABULARY.md before naming anything or writing a test:

* `winboard/20261015-gripe_rulings/`: the plan, the progress document, and the thread file your
  thread's rows came from (thread 4, replaceable_validators, for thread 1; thread 1,
  damaged_boxes, for thread 1's leftovers).
* `winboard/20261015-gripe_fixes/gripe_fixes-progress.md`, around line 145-175, for thread 3:
  where the test helpers' leftovers were found.
* `notes/security.md`.

## Ground rules

* **The base is main** at `b60e516` (the whole gripes line merged, #90 on top). Push only with an
  explicit refspec:
  `git -c credential.helper= -c credential.helper='!gh auth git-credential' push origin <branch>:<branch>`.
* **No backward compatibility** until 1.0.0 (CLAUDE.md; the Coach again on the old-contract
  adapters row: "do not need to provide backwards compatability, for anything, until v1.0.0").
* **Fine-grained errors.** The Coach, twice this round: "error messages should be as fine grained
  as reasonable". A new refusal names exactly what was wrong, calmly, without quoting the input.
  A new `kind` is public surface: name it in the PR's open questions.
* **Another sprint runs beside us**: `matters`, in YOLO, from its own session
  (`/workspace/byok-matters`, PRs #96 to #99 open, more coming: an IndexedDB fixes thread, a
  `VaultDB` battery audit, a race helper, a `VaultDB` contract, identity revocation, key
  rotation). Never touch its worktrees. Shared files to keep hunks small and additive in:
  `packages/safebyok-react/src/vault-provider.tsx` (#98 rewrites `withUnlockedVault` there),
  `packages/safebyok/src/errors.ts` and `vault.ts` (its threads 9 and 10 add kinds),
  `TODO.md`, `notes/security.md`, `.size-limit.json`, and the test helpers under
  `packages/safebyok/tests/` (its battery audit grows `TH.describeVaultDB`).
* **Size budgets**: #99 (unmerged) raises every budget by a written rule. Don't edit
  `.size-limit.json` unless a budget on main actually fails; then say so in the report and raise
  it by #99's rule (measured + 3 kB at 5 kB and over, + 50% and at least 1 kB under it, rounded up
  to two significant figures).
* **`TODO.md` and `STYLE.md` are thread 4's alone** in this sprint. Another thread with something
  for them says so in its report.

## Threads

### 1. validators_tightening

> **Lone surrogates** (#95). Convex refuses strings that aren't valid Unicode as
> `storage_unavailable`, while `AnyTextValidators` admits them. *Rec:* have `AnyTextValidators`
> refuse ill-formed text, so the refusal is ours and calm. The Coach: "yes. Is their error message
> that unspecific? be as fine grained as reasonable. add to TODO: Sounds like we may need to group
> error message"
>
> **Control characters in notes** (#70). A default note allows them, they display badly, and
> each JSON-escapes to six bytes. *Rec:* the default note check refuses control characters other
> than tab and newline; a host can still replace it. The Coach: "for now do what's easy. However,
> add this under the TODO "What exactly are we guaranteeing with these validators""
>
> **`safebyok/validators` is heavier than it needs to be** (#95). It re-exports `Whisper` and
> `EpochMillis`, which pulls in the record schemas: 6.6 kB against 3.4 kB for the defaults alone.
> *Rec:* drop those two re-exports from that entry; they stay in the main entry. The Coach: "yes"
>
> **Cleanup leftovers from #95 and #93.** *Rec:* one small cleanup thread after the restack. The
> Coach, item by item:
> * "yes A wrapper that forgets the `validators` bag falls back to the defaults;"
> * "don't like this, it's done once at startup, right? validate the key names if zod mini won't
>   do that for you. Better yet, make a helper that will do it. -- the provider drops a misspelt
>   field quietly;"
> * (the other three items -- JSON escapes and `vault_full`, erase reading twice, `read()`'s doc
>   and `bad_label` -- went back to the Coach as questions; not this thread's.)

*Gloss.* `packages/safebyok/src/validators.ts`, `names.ts`, the `safebyok/validators` entry in
`tsdown.config.ts`, and `packages/safebyok-react/src/vault-provider.tsx`.

* **Ill-formed text.** `AnyTextValidators` (and every default check that would otherwise admit
  it) refuses a string holding a lone surrogate, as `bad_label` (`bad_option` for a note) with a
  message that says the text isn't valid Unicode. Look for a library-first way to test
  well-formedness (`String.prototype.isWellFormed` is ES2024: check the lib target and the
  runtimes we promise, PROCESS.md *Dependencies*) before writing one. Answer the Coach's
  question in the thread file and the PR: what exactly does Convex say for such a string
  (its error text, as far as the code, its docs or a test against `convex-test` show), and could
  the adapter map it to something finer than `storage_unavailable` today?
* **Control characters.** The default note check refuses C0 and C1 control characters other than
  tab and newline (and DEL), with a message saying so. A host's replacement is untouched.
* **The entry.** `safebyok/validators` stops re-exporting `Whisper` and `EpochMillis`; report
  the entry's size before and after. A changeset says what an importer must change.
* **The forgotten bag.** Today a `VaultDB` wrapper that calls another `VaultDB`'s public verbs
  without forwarding `validators` gets the defaults silently (the demo's wrapper, Convex's test
  `perUser`). Make forgetting it impossible or loud: e.g. the wrapper helpers forward it, or the
  bag stops being an optional per-call argument. Find the smallest change that makes the mistake
  hard to make; if the cleanest fix reshapes the `VaultDB` verbs' signatures (public surface),
  that's a significant question: report `blocked` with the options before building it.
* **The misspelt field.** `VaultProvider` picks the known fields out of its `validators` prop, so
  `boxLabel` is dropped without a word (`openVault`'s own bag is a `strictObject` and refuses
  it). The Coach: check the key names once, at startup, and better, a helper that does it -- one
  helper the core exports (or `safebyok/utils`) that both `openVault` and the provider use, so
  the check is written once. Zod mini's `strictObject` may already be that helper: use it if so.
  Keep the hunk in `vault-provider.tsx` small (#98).

`vault:` / `api:` / `client:` prefixes as fits. Depends on nothing. Look-ahead: thread 4 records
the Coach's TODO lines for this thread's rows; tell it nothing more unless the build turns up a
question for that TODO heading.

### 2. convex_setup_check (sonnet)

> **Check Convex's `getUserId` at setup** (#70). The Convex component only calls the host's
> `getUserId` on the first request, so a misconfiguration shows up late. *Rec:* check it's a
> function when the component is built. The Coach: "yes. add to TODO soonish -- Is it reasonable
> to demand there is a function of this name? do we want a generic interface to request an
> identity; it might not be through the database"

*Gloss.* `packages/safebyok-convex`: where the host hands the component its `getUserId`, refuse a
non-function at construction with a calm error that says what to pass (a `kind` from the
existing vocabulary if one fits; a new one is public surface). A test for each. The TODO line is
thread 4's. `storage:` prefix. Depends on nothing; starts when a slot frees (after thread 4).
Look-ahead: none.

### 3. test_hygiene (sonnet)

> **Test hygiene batch** (#75, #80). `tallyWatches` can miss a leak on a double close; refusal
> tests check name and kind, not class; some demo tests leave handles open or share stores;
> `beforeNextCall` double-records; `convexRefusalOf` has no test. *Rec:* one cleanup thread,
> after the restack. The Coach: "yes"

*Gloss.* `safebyok/testing` (`packages/safebyok/tests/` helpers published as `TH`), the demo's
tests, and `safebyok-convex`'s test helpers.

* `tallyWatches`: a double close must not cancel out a leaked watch (count per watch, not a
  running total); a test that fails on the old helper.
* Refusal tests also check the class (`instanceof VaultError`, or whatever the error module's
  class is), ideally once, in the shared refusal helper, not at every call site.
* The demo's tests close what they open and each gets its own store.
* `beforeNextCall` on an existing spy records each call once.
* `convexRefusalOf` gets its test.

`safebyok/testing` is public surface: a changed helper's behaviour goes in a changeset.
`tests:` prefix. Depends on nothing. The matters sprint's battery audit will grow
`TH.describeVaultDB` beside this: keep edits inside the helpers named here.

### 4. docs_rulings (sonnet; documents only)

> **Refused text reaches the box list** (#93). A box stored under a name your validators now
> refuse lists as damaged *with that name*, so whoever can write storage can put any text (huge,
> control characters, markup) into `snapshot.boxes`. *Rec:* keep it, documented (render a damaged
> label as text); the alternatives are capping or hiding such labels, or an opaque erase handle.
> The Coach: "no changes; but document in TODO under a heading "What exactly are we guaranteeing
> with these validators, and where (client/server/both), and when (read, send, write, entry), and
> why and for whom (database limits, unexpected behavior canaries, actual constraints)""
>
> **Control characters in notes** -- the Coach: "... add this under the TODO "What exactly are we
> guaranteeing with these validators"" (built in thread 1)
>
> **Lone surrogates** -- the Coach: "... add to TODO: Sounds like we may need to group error
> message" (built in thread 1)
>
> **Store over a damaged box can race** (#93). It erases then writes; a healthy box another device
> writes in between is lost, and if our write then fails, nothing stands. *Rec:* leave for now and
> add a TODO: closing it needs a revision-checked erase in the adapter contract. The Coach: "yes,
> TODO it we will have a contract tightening party once all the adaptors share a test suite"
>
> **Check Convex's `getUserId` at setup** -- the Coach: "... add to TODO soonish -- Is it
> reasonable to demand there is a function of this name? do we want a generic interface to request
> an identity; it might not be through the database" (built in thread 2)
>
> **A too-big lockbox: its own error kind?** (#95) *Rec:* keep `lockbox_too_large` separate. The
> Coach: "yes. error messages should be as fine grained as reasonable. There's going to be a thread
> elsewhere to build a policy machine"
>
> **The `expect*` lint convention** (#80). The linter counts any helper named `expect...` as an
> assertion, so every such helper must actually assert. *Rec:* adopt it as a `STYLE.md` rule. The
> Coach: "yes, but make clear that it should choose a different name if an assert isn't
> warranted, or add an assert and keep the name (i.e. don't add a dumb assert just to make the
> rule happy)"
>
> From the rebase agent's note (Your notes), with no answer of the Coach's on it, reconciled into
> the first row: **Server-side names** -- the Postgres route recipe, `listBoxRecords` and the
> GraphQL resolvers take names as any text (`AnyTextValidators`); the browser's validators decide.
> **`unlocklabel`** -- host validators have no slot for it; the stored envelope checks it as plain
> text, and the `Label` grammar is enforced only when a way in is added.

*Gloss.* `TODO.md` and `STYLE.md` only.

* **`TODO.md`**, a new entry under *Soonish* (beside *Pluggable label validator*), headed with
  the Coach's question verbatim: "What exactly are we guaranteeing with these validators, and
  where (client/server/both), and when (read, send, write, entry), and why and for whom (database
  limits, unexpected behavior canaries, actual constraints)". Under it, one line each, in plain
  words with the PR: refused text reaching `snapshot.boxes` (kept as is, #93; render a damaged
  label as text); control characters in notes (the default refuses them now, thread 1; is that
  the right guarantee and where else it should hold); server-side names taken as any text (#95);
  `unlocklabel` with no validator slot (#95); lone surrogates (refused by the defaults now,
  thread 1, because Convex refuses them). Fold in *Pluggable label validator* and *Validating the
  user id* if they are the same question (keep their text; move, don't rewrite).
* **`TODO.md`**, *Soonish*: "Group error messages?" -- the Coach: "Sounds like we may need to
  group error message[s]", with "error messages should be as fine grained as reasonable", and
  that a policy machine is coming in another thread (the matters sprint's identity_revoked).
* **`TODO.md`**, *Soonish*: the store-over-a-damaged-box race (#93), and that it waits on "a
  contract tightening party once all the adaptors share a test suite" (the matters sprint's
  battery audit): closing it needs a revision-checked erase in the `VaultDB` contract.
* **`TODO.md`**, *Soonish*: the Coach's identity question from the Convex row, verbatim, with the
  context (Convex's component calls a host `getUserId`; thread 2 now checks it at setup).
* **`TODO.md`**, *Open from second_harvest* or wherever this session's rulings are listed: one
  line of rulings, no thread needed: `Ckeys` stays public (its JSON-tuple encoding is a contract);
  old remembered unlocks are swept as now; `lockbox_too_large` stays its own kind; old-contract
  adapters fail as they do (no back-compat before 1.0).
* **`STYLE.md`**, *Tests*: the `expect*` rule with the Coach's nuance -- a helper named `expect...`
  must assert; if it shouldn't, rename it; never add an assertion only to satisfy the rule.

`docs:` / `plan:` prefixes. No review (documents only). Depends on nothing. Keep each `TODO.md`
hunk additive: the matters sprint adds a NOTYET there too.

## Swept without a thread

* **Keep `Ckeys` public?** -- "yes". Already so; thread 4 records the ruling.
* **When old remembered unlocks are swept** -- "yes, leave as is". Recorded by thread 4.
* **Old-contract adapters fail quietly** -- no back-compat before 1.0; recorded by thread 4.
* **`openVault` has no size headroom** -- "yes". Done: the restack raised it to 20.5 kB, and #99
  raises it to 23 kB.
* **A misuse error leaves `withUnlockedVault` waiting** -- "yes". Overtaken: the matters sprint's
  #98 settles every call, but by resolving null on Close rather than rejecting, as this row's Rec
  said. Back to the Coach as a matter.
* **The rebase agent's note** -- the IndexedDB ckeys and the changeset landed with #92; the ports
  and the budgets "LGTM"; the server-side names and `unlocklabel` items go to thread 4's TODO
  heading, and `unlocklabel`'s missing slot back to the Coach as a matter.
* **Delete leftover directories** -- the copy-paste command is in the matter row and chat.

## For the Coach

* Three of the cleanup leftovers came back as questions ("please explain", and "why can't we
  check size after serialization?"): explained in new matter rows.
* `withUnlockedVault`: #98 resolves null on a misuse rather than rejecting -- a matter row.
* `unlocklabel` has no validator slot -- a matter row.

## Round 2: the Coach's answers to the round's matters (2026-10-16)

From the Open Matters tab, each row the Coach set to `proceed`, with their answer verbatim. One
thread, stacked on #101 (the line's top before the sprint PR), since it builds on #104's
validators and edits the same files. Rows needing no build: **`withUnlockedVault` against #98**
-- "yes as you recommended" (#98 stands; nothing to do). **Leftover directories** -- "I will run
this when things settle down" (noted).

### 5. matters_followups

> **Convex's error as a refusal's cause** (#75). On a dev deployment Convex's validator error
> repeats the refused arguments; that was harmless when labels were narrow, but now a label may
> hold a pasted key. *Rec:* drop the cause, as #95 did for a host schema's error. The Coach: "offer
> a pluggable sanitizer. Add a todo to offer a pluggable sanitizer. Make a sanitizer module and put
> the function that drops it in there. Don't try to make it serve multiple purposes; but that's
> where that decision should be made"
>
> **Size checks: why not once, after serialization?** (#95) ... *Rec:* keep both, and say in the
> docs that the vault-total estimate is conservative. The Coach: "yes. Make a note of this in the
> "What are these validators actually for" TODO section"
>
> **Erasing a box under a refused name reads it twice.** (#93) ... *Rec:* have the first lookup
> hand its result to the second. The Coach: "yes"
>
> **`read()` and `use()` don't document `bad_label`.** (#93) ... *Rec:* a sentence in each doc
> block, pointing at `erase()` as the way to clear such a box; no code change. The Coach: "yes"
>
> **`unlocklabel` has no validator slot.** (#95) ... *Rec:* add an `unlocklabel` slot to
> `validators`, as a small follow-up thread. The Coach: "yes"
>
> **Closing a vault twice unsubscribes twice.** (#103's review) ... *Rec:* a one-line fix,
> `close()` returns early when already closed. The Coach: "yes"
>
> **KDF follow-ups** (#68). Reserve a label prefix for derivers we ship; check a host-built
> Argon2id deriver at open, not first unlock; split the deriver type by algorithm; zero the
> derived key's bytes after use. *Rec:* fold all four into the recommended-KDFs TODO thread. The
> Coach: "yes"
>
> **The forgotten validators bag: harmless or loud?** (#104) A storage verb called without your
> validators now admits any well-formed text instead of the defaults ... Loud would mean a
> required argument on nine public verbs. *Rec:* keep it harmless, as built. The Coach: "yikes
> parts of this sound hinky. Defaults are supposed to come in from eg importing safebyok/browser
> (I forget how it's requested) and otherwise we ask you to, yes, spell everything out. My bigger
> issue is "A storage verb called without your validators"; they should be deposited onto a
> dispatch object not passed as arguments -- might have misunderstood but I still need to take a
> closer look / would you add a section under the "What do the Validators actually guarantee"
> called "Re-examine the pluggable validators interface" -- include my response and your question"

*Gloss.* One commit per item, in this order (code first, then `TODO.md`):

* **The sanitizer** (`api:` or `storage:`). A small core module (e.g.
  `packages/safebyok/src/sanitizer.ts`) holding the one function that decides a foreign error
  does not ride along as a refusal's `cause` -- the drop #95 made for a throwing host schema
  (find it in `names.ts`), moved there, and now used by `safebyok-convex` for Convex's validator
  error too (`convex-vault-db.ts` / `refusals.ts`). One purpose only, as the Coach said: no
  redaction, no options. Export it only if the Convex package needs it from the core's public
  surface; if so, name it in the PR's open questions. Tests: a refusal from a Convex validator
  error carries no cause and no text of the refused argument.
* **erase's single lookup** (`vault:`): `checkStandingBoxlabel`'s lookup handed to
  `ensureBoxStands`, so erasing a box under a refused name reads storage once. A test counting
  the reads.
* **`read()` and `use()` docs** (`vault:`): their doc blocks say they refuse `bad_label` for a
  malformed name and for a box stored under a name today's validators refuse (it lists as
  damaged), and point at `erase()` to clear it.
* **The vault-total estimate** (`docs:`): where `maxVaultBytes` is documented (the core README
  and its doc block), say the estimate is conservative and can refuse slightly early at an
  exactly tight limit; the record cap is checked on the real serialized bytes.
* **`unlocklabel` slot** (`api:`): `validators.unlocklabel` beside the other five, checked
  through `names.ts` like them, defaulting to today's `Label` grammar where a way in is added,
  and used where the stored envelope's `unlocklabel` is read. Public surface: changeset and the
  PR's open questions.
* **`close()` idempotent** (`vault:`): a second `close()` returns early, never unsubscribing
  twice; a test with `TH.tallyWatches` or a spy on the unsubscribe.
* **`TODO.md`** (`docs:`, one commit), in the validator-guarantees section (#101's heading,
  "What exactly are we guaranteeing with these validators..."):
  - the two size checks and why both stay (record bytes at the write; a conservative vault
    estimate before sealing);
  - a sub-section headed "Re-examine the pluggable validators interface", with the Coach's answer
    above verbatim, and our question: should a `VaultDB` carry its validators from construction
    (a dispatch object built once) rather than take them per verb, and should a bare verb then
    refuse or admit -- today (#104) it admits any well-formed text;
  - "Offer a pluggable sanitizer", pointing at the new module as where that decision is made;
  - the four KDF follow-ups (#68) folded into the recommended-KDFs entry (find it; keep its
    text, add them as lines).

`TODO.md` is this thread's in this round (thread 4 has filed). Depends on #101. Look-ahead: none;
this is the round's last thread before the sprint PR.
