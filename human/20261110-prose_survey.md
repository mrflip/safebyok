# 2026-11-10: Non-code files surveyed for slop and length -- the agent files, PROCESS.md and most READMEs are plain; the slop is in VOCABULARY.md, the design notes, guarantees.md and the core README, and most of the excess length is history and leftovers from the old design

Surveyed in the worktree `/workspace/byok-adapter_docblocks` at `8510e4f08`. No existing file was changed.

**Scope.** Every git-tracked Markdown file outside `whiteboard/`, `winboard/`, `human/`, CHANGELOGs, individual
changesets and `notes/security.md`; the agent and skill files under `.claude/`; `.github/` templates and workflow
comments; and the comment prose in `tsconfig.base.json`, `.mergify.yml` and the eslint configs. The six Convex skills
under `packages/safebyok-convex/.claude/skills/` are copied from Convex's repository (their README says so), so they
are listed but not judged.

**Method.** I measured everything with `wc -l -w`. I read these whole: CLAUDE.md, PROCESS.md, VOCABULARY.md, every
package and demo README, CONTRIBUTING.md, SECURITY.md, NOTYET.md, CUSTOMIZATION.md, `e2e/README.md`, every agent file,
and the sprint, turbochat, closeout, tighten-guidance and wrapup skills. Files past 800 lines (STYLE.md,
`notes/gallant.md`, `notes/gallant-docblocks.md`) and the rest of `notes/` I read by headings, sampling several
sections each. Where I say something is stale, I checked it with `rg` against `packages/safebyok/src`.

**What counts as slop here** is the register described in `notes/gallant-docblocks.md`, *Plain English*: ordinary
words in an order nobody would say, house verbs used oddly ("answers" for returns, "stands", "hears", "born", "in
hand"), "the one X", stacked prepositions, participle pile-ups, invented figures of speech. VOCABULARY.md's terms
are not slop. Text that is dense but clear is not slop either.

## 1. The files

Worst first. "Fine" files are at the bottom. Line and word counts are `wc -l -w`.

| Path | Lines | Words | Verdict |
|---|---:|---:|---|
| `notes/design-models.md` | 363 | 6,138 | slop + long |
| `notes/design-proof.md` | 528 | 5,043 | slop + long |
| `notes/guarantees.md` | 432 | 5,893 | slop + long |
| `VOCABULARY.md` | 279 | 7,254 | slop + long |
| `TODO.md` | 536 | 5,765 | slop + long |
| `notes/reference-timings.md` | 98 | 1,588 | slop + long |
| `packages/safebyok/README.md` | 220 | 1,880 | slop |
| `notes/design-vaultdb.md` | 168 | 3,060 | slop |
| `README.md` (root) | 54 | 506 | slop |
| `packages/safebyok-graphql/README.md` | 145 | 1,257 | slop |
| `packages/safebyok/CUSTOMIZATION.md` | 146 | 1,374 | slop |
| `packages/safebyok-fastkey/README.md` | 90 | 687 | slop |
| `notes/simplicity-means-safety.md` | 9 | 320 | slop |
| `STYLE.md` | 949 | 10,747 | long |
| `notes/gallant-docblocks.md` | 803 | 4,663 | long |
| `notes/gallant.md` | 1,138 | 6,387 | long |
| `notes/wontfix.md` | 150 | 2,610 | long |
| `notes/reference-sizes.md` | 438 | 5,999 | long |
| `notes/old_vocabulary.md` | 223 | 3,429 | long |
| `.claude/skills/sprint/DESIGN.md` | 136 | 1,889 | long |
| `notes/configuration.md` | 36 | 262 | long |
| `CLAUDE.md` | 171 | 1,801 | fine |
| `PROCESS.md` | 212 | 2,375 | fine |
| `NOTYET.md` | 71 | 872 | fine |
| `CONTRIBUTING.md` | 42 | 355 | fine |
| `SECURITY.md` | 56 | 449 | fine |
| `packages/safebyok-convex/README.md` | 173 | 1,331 | fine |
| `packages/safebyok-postgres/README.md` | 154 | 1,246 | fine |
| `packages/safebyok-indexeddb/README.md` | 78 | 617 | fine |
| `packages/safebyok-react/README.md` | 82 | 777 | fine |
| `demos/safebyok-demo-react/README.md` | 68 | 594 | fine |
| `e2e/README.md` | 86 | 778 | fine |
| `.changeset/README.md` | 10 | 100 | fine |
| `notes/expose_improves_security.md` | 213 | 1,697 | fine |
| `notes/housekeeping.md` | 188 | 1,737 | fine |
| `notes/gallant-test_titles.md` | 119 | 1,263 | fine |
| `notes/release-checklist.md` | 78 | 715 | fine |
| `notes/good_bank_opts_are_in_browser.md` | 54 | 485 | fine |
| `notes/dependabot-prs.md` | 47 | 507 | fine |
| `notes/ci.md` | 39 | 406 | fine |
| `notes/releasing.md` | 38 | 497 | fine |
| `notes/more_style.md` | 14 | 155 | fine |
| `.claude/skills/restacker/SKILL.md` | 295 | 2,266 | fine |
| `.claude/skills/sprint/SKILL.md` | 273 | 3,077 | fine |
| `.claude/skills/turbochat/SKILL.md` | 174 | 1,993 | fine |
| `.claude/agents/thread-worker.md` | 148 | 1,590 | fine |
| `.claude/skills/closeout/SKILL.md` | 125 | 1,201 | fine |
| `.claude/agents/thread-reviewer.md` | 117 | 1,224 | fine |
| `.claude/skills/sprint/closer-look.md` | 107 | 1,135 | fine |
| `.claude/skills/branch-sweep/SKILL.md` | 100 | 815 | fine |
| `.claude/skills/tighten-guidance/SKILL.md` | 68 | 671 | fine |
| `.claude/agents/documentarian.md` | 63 | 644 | fine |
| `.claude/agents/style-reviewer.md` | 62 | 669 | fine |
| `.claude/skills/sprint/wrapup.md` | 34 | 459 | fine |
| `.claude/agents/doc-tab-reader.md` | 34 | 423 | fine |
| `.claude/agents/restack-conflict-scout.md` | 28 | 190 | fine |
| `.claude/agents/restack-verifier.md` | 23 | 171 | fine |
| `.claude/agents/restack-test-runner.md` | 22 | 149 | fine |
| `.claude/skills/sprint/post-compaction.md` | 17 | 194 | fine |
| `.github/workflows/release.yml` | 206 | 1,339 | fine |
| `.github/workflows/ci.yml` | 167 | 1,091 | fine |
| `.github/workflows/dependabot-changeset.yml` | 84 | 553 | fine |
| `.github/workflows/codeql.yml` | 40 | 169 | fine |
| `.github/dependabot.yml` | 48 | 200 | fine |
| `.github/pull_request_template.md` | 17 | 86 | fine |
| `.mergify.yml` | 52 | 378 | fine |
| `tsconfig.base.json` | 42 | 164 | fine |
| `packages/safebyok/eslint.config.mjs` | 489 | 2,756 | fine |
| `eslint.config.mjs` (root) | 403 | 2,074 | fine |
| other eslint configs (7 packages, demo, e2e) | 3,165 | 16,128 | fine |
| `packages/safebyok-postgres/vault-tables.sql` | 30 | 192 | fine |
| `.ignore`, `notes/.ignore` | 12 | 90 | fine |
| `packages/safebyok-convex/.claude/skills/README.md` | 115 | 987 | fine |
| `packages/safebyok-convex/.claude/skills/*` (6 skills, 3 references) | 751 | 4,948 | not judged (copied from Convex) |

## 2. The files not marked fine

### `notes/design-models.md` -- slop + long

> "💣 err=refused: oops"
> "🌀 misaligned: something is so wrong it's difficult to deliver a quality issue report"
> "Gone from the interface, so in no table: every `cleartexts` parameter"
> "`camped` ... a passkey added before the enter key"

**The fault.** The file is a table of every method of each model, with an emoji legend of 19 symbols and a *note*
column that runs to 500 characters a cell. The notes are shorthand: fragments joined by semicolons, and phrases such
as "before the enter key" that only make sense to someone who was in the sprint. The second paragraph is a list of
what was removed, which is history. Some names no longer exist: `cleartexts` has no hits in `src/`.

**Recommendation.** First decide whether the file is still the interface spec or a record of the November design.
If it is a record, move it to the thread's `winboard/` folder and delete it here; the doc blocks and
`notes/answer-contract.md` now carry the contract. If it stays, drop the "Gone from the interface" paragraph and most
of the emoji legend (keep the four or five the tables really use), and write each *note* cell as one or two plain
sentences. Rough size after: about 150 lines and 2,500 words, or nothing.

### `notes/design-proof.md` -- slop + long

> "A cached lease is never shrugged off when it clearly must not stand."
> "`fail` refuses `camped` with the corpse (`dbhas`, the request)"
> "It shouts: a refused scan is bad news, and a lock whose forget is refused panics"
> "Eyebrow raisers from the Coach's replies in the sprint's Closer Look"

**The fault.** The call trees at the top are clear. *Notable Changes (that may be inconsistent)* and *Required of the
parts not yet drawn* are bullet fragments in a private register, with figures of speech ("shrugged off", "the
corpse", "it shouts") standing in for statements. Some of it is now wrong: it says the deviceDB has `cache`, `peek`
and `vacate`, where VOCABULARY.md says `stow`, `peek` and `forget`. It opens with a quote saying the v6bank PRs "are
likely to be thrown out", which is history. *Areas of Concern* is a list of open questions, and belongs in the
whiteboard.

**Recommendation.** Keep the call trees, checked against the code. Rewrite *Notable Changes* as a short list of
design rules, each a full sentence, and drop the ones that are now false. Move *Areas of Concern* and *To fix* to the
whiteboard or `human/`. Drop the opening history. Rough size after: about 250 lines and 2,000 words.

### `notes/guarantees.md` -- slop + long

> "Three host functions hear it: the dialog that collects it"
> "Only a refusal the user can correct, `wrong_passkey` among them, past the derivation too, short of the last attempt, leaves them unspent"
> "It is the host's decision, which a host would otherwise make for itself without the guard."
> "Last verified against the code 2026-10-27, on `main` after #302, with [#305] applied"

**The fault.** CLAUDE.md requires agents to read *The guarantees* before changing any of eleven files, so this file's
length is paid often. Each guarantee is a paragraph that walks the call chain function by function (which reads the
code aloud), with clauses stacked in long sentences, and "hears", "keeps" and "answers" for "receives", "stores" and
"returns". The opening has a five-line history of verification dates and PR numbers. The *Open items* entry on the
exposed whisper is one 15-line paragraph.

**Recommendation.** Open each guarantee with a sentence of one or two lines that states the guarantee. Put the call
chain under *Kept by* as a list of files and functions, not prose. Keep *Checked by* as it is. Reduce the history to
one line: "Last checked against the code on <date>, at <sha>." Split the long open item into separate points. Rough
size after: about 280 lines and 3,500 words, with each guarantee's opening sentence readable on its own.

### `VOCABULARY.md` -- slop + long

> "`bank.ensureVault({ vaultlabel })` answers the Vault object the bank lists for that scope."
> "A Vault object stands for an absent vault only as a deleted one."
> "Said of a thing whose record in hand was refreshed recently enough to trust"
> "**dbhas** is the row the call found in its way, null where none stood."

**The fault.** This file does two jobs. It is the glossary, which is good, and it is also a behaviour reference: the
*vault*, *bank*, *lease*, *gating*, *damaged*, *sidecar* and *mask* entries are each 100 to 200 words describing what
calls do, which belongs in doc blocks and the core README. Those long entries are where most of the slop is: "answers"
for returns appears twelve times, and the file is the one every agent consults, so the habit spreads from here. The
file also lists "hold" as a word to avoid while using "stands", "in hand" and "answers". The *cleartext* entry keeps a
ruling's date ("the Coach, 2026-10-24"), and *Stamp* and *Shapes* repeat material that STYLE.md also has.

**Recommendation.** Cut each entry to what the thing is, in two or three sentences, and link to the doc block or
README section for what it does. Replace "answers" with "returns" throughout, and "stands"/"in hand" with plain
words. Keep *The stamp* here and have STYLE.md link to it rather than restate it. Rough size after: about 200 lines and
4,000 words.

### `TODO.md` -- slop + long

> "MAke it BoxScope and BoxScopepath everywhere (also any zod checkers or var names)"
> "What is the difference between refusals and errors"
> "find no vault, and stand the new one down; the unlock then refuses `vault_locked`, though the vault it made is stored, and the next read takes it up"
> "this handle's own bell refresh can read the new vault props before `reviseWayins` sets it"

**The fault.** The top of the file and the *Loud* section contain loose, unformatted notes between the shelf
descriptions. Many *Soonish* entries describe the old design: twelve hits for `vault props`, `reviseWayins`,
`grantLease`, `Vault.make`, `vault_closed`, `putWayin` or `tidy`. Nearly every entry opens with its origin ("From
thread 4 ([#132], `thread-4-refusals_and_catchup.md`, *A pre-existing race*)"), 76 such markers in all. The
*RAGEBAIT* heading at the end only points to NOTYET.md.

**Recommendation.** Turn the loose notes at the top into entries on the right shelf, or delete them. Go through
*Soonish* and delete or rewrite each entry that names code the new core does not have. Reduce each entry's origin to
a link at its end. Delete the empty *RAGEBAIT* heading. Rough size after: about 300 lines and 3,000 words.

### `notes/reference-timings.md` -- slop + long

> "A birth past the enter key finishes and caches its lease after `bank.vacate`; this keeps a lease that should drop"
> "Copied from `unrace-progress.md` at the sprint's end; names as they stood when raised"
> "lands `ready` on the emptied listing, which reopens the false prompt, by reading"

**The fault.** The timing table at the top is useful and clear. More than half the file is *Crossings the sprint's
threads raised*: a list copied from a sprint's progress file, under names the file admits are outdated
(`demandReadyToAttach`, `tidy`, `cacheAsCacheCan`), written in fragments ("by reading", "past the enter key").

**Recommendation.** Keep the table and *How far to trust these*. Move the sprint's list to that sprint's `winboard/`
folder. Keep *A gate change rejecting after its record is stored* only after checking its names against the code.
Rough size after: about 45 lines and 600 words.

### `packages/safebyok/README.md` -- slop

> "It answers an Outcome: on success, what each step found and when"
> "While it will not show, `box.whisper` answers a frozen bag with no fields"
> "`lease_revoke_failed` for a cached lease that outlived its forget"
> "Its nouns still stand, but some calls it names are the old design's (`putWayin`, `getWhisper`)"

**The fault.** This is the first file a customer reads. The host example and *What a host relies on* are good. The
*Easy to get wrong* list grows into a reference for `vacate`, `onLifecycle` and `onBadNews`, with long sentences
joined by semicolons. *Showing a whisper* is one dense paragraph of eight facts. "Answers" is used for "returns", and
there are phrases like "outlived its forget" and "trials the whole path once". The caveat about VOCABULARY.md naming old
calls is out of date: VOCABULARY.md no longer names `putWayin` or `getWhisper`.

**Recommendation.** Delete the VOCABULARY caveat. Rewrite *Showing a whisper* as a short list. Keep *Easy to get
wrong* to one line each, and move the handler details (`onLifecycle`, `onBadNews`, `tellBadNewsTo`) to their doc
blocks or a short *Handlers* section. Replace "answers" with "returns". Rough size after: about 170 lines and 1,400
words.

### `notes/design-vaultdb.md` -- slop

> "This shorthands the items that must be consistent and limit queries"
> "a few allow extra fields: dbhas where that's useful and different from what's sent"
> "Eyebrow raisers from the Coach's replies in the sprint's Closer Look"

**The fault.** Notes-to-self: half sentences, and postcondition tables with row ids that repeat (three `VPA7` rows,
two `VPA2`). Several refusal kinds in its table do not exist in `src/` (`storage_error`, `not_permitted`,
`invalid_input`). *Areas of Concern* is a list of open questions.

**Recommendation.** Check whether `notes/answer-contract.md` (on the base checkout's branch) replaces it. If it does,
move this file to `winboard/`. If not, fix the refusal names, number the rows uniquely, write the preconditions as
sentences, and move *Areas of Concern* to the whiteboard. Rough size after: about 100 lines, or nothing.

### `README.md` (root) -- slop

> "the app interface is to call  non-async At the app level, whisper is anything JSONable."
> "for concreteness of discussion, assume a postgres backing database,"
> "The old design's sketch. The new design's calls are in [its README]"

**The fault.** The first half (what the project is, its packages) is good. *Basic e2ee architecture* is an old sketch:
broken sentences, a trailing comma, seven zero-width spaces, and calls the code no longer has (`putWayin`,
`getWhisper`, `ensureVault ... (fetch or create...)`). It is the first thing a GitHub visitor sees after the package
list.

**Recommendation.** Delete *Basic e2ee architecture* and its subsections. Rough size after: about 30 lines and 300
words.

### `packages/safebyok-graphql/README.md` -- slop

> "and answers what that verb answers, for the signed-in user's bank alone"
> "anything else answers refused as `identity_revoked`"
> "sends no closing result, so its end goes untold"
> "Every name the schema adds begins `safebyok` or `Safebyok`, to sit beside your own."

**The fault.** The recipe is clear. The prose around it uses "answers" for "returns" and "responds" five times,
"is told" for "is reported", and in *The recipe* one 90-word paragraph covers three separate facts about stream
endings.

**Recommendation.** Rewrite the paragraph after the browser example and *Who reaches which bank* in plain verbs, and
split the stream-ending paragraph into a short list. Rough size after: about 130 lines and 1,100 words.

### `packages/safebyok/CUSTOMIZATION.md` -- slop

> "It still names the old design's calls (`putWayin`), which this package does not have yet."
> "a bank that cannot judge a new passphrase births no vault"
> "That is the contract at its plainest"

**The fault.** Mostly clear, but out of date: it names `vault.putWayin()` and a bank stage `refused`, neither of which
the core has. A few house verbs ("births", "hears the passphrase") and figures ("the contract at its plainest").

**Recommendation.** Replace `putWayin` with the current call (`replacePassphrasePrompt`), fix the stage name, drop
the opening caveat, and use plain verbs. Rough size after: about the same, 140 lines.

### `packages/safebyok-fastkey/README.md` -- slop

> "Argon2id at the supplied `Argon2idWebV1` spec, wearing its label"
> "The vault, having handed the deriver a passphrase, keeps nothing of what it threw"
> "through the vault, it too arrives as `unexpected_error`, what was thrown kept nowhere"

**The fault.** A figure of speech ("wearing its label", twice), participle pile-ups, and *Errors* repeats the last
paragraph of *Where it runs*.

**Recommendation.** Say "with the label `argon2id_web_v1`". Rewrite the last paragraph of *Where it runs* plainly and
let *Errors* carry the refusal details once. Rough size after: about 75 lines and 550 words.

### `notes/simplicity-means-safety.md` -- slop

> "documenting it as nonuniformly uniform"
> "Mitigation -- recovery, retry, reconciliation -- are left to higher level constructs"

**The fault.** Short and mostly clear, but "nonuniformly uniform" is an invented phrase, and the file has no title.

**Recommendation.** Add a heading. Replace the second sub-bullet's lead with what it means ("each case behaves the
same way every time, even if different cases behave differently"). Same size.

### `STYLE.md` -- long

> "(the Coach, 2026-10-27: \"it makes it less confusing\")"
> "idb.ts's and string-store.ts's `listenerShape` sits beside the `listener` it checks"
> "Holding a scopepath and needing a related one, work on the text"
> "`rg` the door for the part that holds a helper"

**The fault.** The prose is mostly clear and specific: it is not a slop file. It is long for three reasons. Fifteen
rulings are quoted inline with dates, which is history inside a reference. Several rules are exceptions about named
files (the validator-suffix rule names `shapes/host-code.ts`, `idb.ts`, `string-store.ts` and `phrases.ts` in one
paragraph). And some content repeats elsewhere: *Shapes and duck typing* repeats VOCABULARY.md's *Shapes*; the stamp
is defined in both; `ckey` and scopepath are defined three times inside STYLE.md alone (*Naming*, *Tags*,
*Scopepaths*); the Goofus/Gallant pair at the end of *Comments and doc blocks* repeats `notes/gallant-docblocks.md`;
*Tree-shaking* is a measurement record whose conclusion is one sentence. There is also a contradiction: STYLE.md says
"A boolean is `isFoo`", while the comment beside `unicorn/consistent-boolean-name` in every eslint config says "an
is- prefix on every binding of one would be a translation layer".

**Recommendation.** Drop the dated quotes and keep each rule. Define `ckey`, scopepath and the stamp once, and link to
them. Replace *Shapes and duck typing*'s list of shapes with a link to VOCABULARY.md. Cut *Tree-shaking* to its
conclusion. Move the file-specific exceptions to the files' own headers. Fix the eslint comment, or the rule. Rough
size after: about 750 lines and 8,000 words.

### `notes/gallant-docblocks.md` -- long

> "The principle names the species, to hunt in the blocks this file doesn't cover."
> "\"A host may repeat\" is a caller list in disguise."
> "Say what the caller holds when it resolves, and any case that bends it."

**The fault.** The specimen pairs are the point and are good. The file is long because several principles have three
or four pairs where one or two would teach the lesson, and some principles are split between this file and
`notes/gallant.md` *Words* ("second specimen" headings). The prose that introduces the pairs has a little of the
register it is trying to remove.

**Recommendation.** Keep one or two pairs per principle. Bring the *Words* pairs from `notes/gallant.md` here so each
principle lives in one place, and rewrite the few introductory sentences quoted above. Rough size after: about 500
lines and 3,000 words.

### `notes/gallant.md` -- long

> "*Fixed* is merged or on #470. *Planned* is ruled or proposed for a later thread in `whiteboard/20261104-newput/newput-plan.md`"
> "## A doc block has no past `#purpose-not-path`" (also in `notes/gallant-docblocks.md` and STYLE.md)

**The fault.** The prose is plain. The Coach has ruled that this file stays whole, for review, so I recommend little.
Its *Words* section (lines 943 to 1104) duplicates `notes/gallant-docblocks.md`, and the status key points at a PR
and a whiteboard plan that will date.

**Recommendation.** Move *Words* to `notes/gallant-docblocks.md` and leave a pointer, if the Coach agrees that this
keeps the file whole in spirit. Rough size after: about 980 lines.

### `notes/wontfix.md` -- long

> "**This file is in flux (November 2026).** The vault is being redesigned, and many entries describe the design as it stood in late October."
> "a different `leaseHours`, `maxWhisperBytes`, `maxBoxes`, `validators` or `keyDeriver`"

**The fault.** The register is fine; this is a dated log of rulings, so the dates belong. But the file says itself that
many entries describe the old design, and several name options and concepts the core no longer has (`leaseHours`,
"handles", "device mark").

**Recommendation.** Go through the entries against the new core: delete the ones that no longer apply and update the
rest, then remove the "in flux" warning. Rough size after: about 90 lines and 1,500 words.

### `notes/reference-sizes.md` -- long

> "## The Coach's Postgres payload shapes"
> "These are the notice shapes as built: safebyok-postgres at `byok-port_postgres` 229ae95d4"

**The fault.** Clear and well sourced. It does three jobs: record sizes against limits (its purpose), a description of
the Postgres notice encoding (which belongs in the adapter's README or code), and a costing of a bank hello on Convex
(which belongs to the query-efficiency plan TODO.md points to).

**Recommendation.** Move *The Coach's Postgres payload shapes* to `safebyok-postgres` (its README's *Hearing other
writes*, or a comment by `noticeTextOf`), and move *A bank hello on Convex* to the query-efficiency plan. Rough size
after: about 330 lines and 4,500 words.

### `notes/old_vocabulary.md` -- long

> "`packages/safebyok-old` used them until it was removed on 2026-11-10."

**The fault.** A lookup table for reading old records; history is its job, so the dates are fine. The second table
(*The old design's names the new core does not have*) served `packages/safebyok-old`, which is now gone.

**Recommendation.** Delete the second table, or keep it only as long as winboard reading needs it. Rough size after:
about 170 lines.

### `.claude/skills/sprint/DESIGN.md` -- long

> "Until 2026-10-17 the orchestrator mirrored every file in the sprint directory into a tab, whole."
> "(Guessing the transcript written last named the wrong agent twice in sprint v6bank: a worker just compacted, at 64k, ...)"

**The fault.** A rationale file, so reasons belong. But several bullets tell the story of an incident rather than
state the reason (the v6bank compaction guesses, the mirroring before 2026-10-17, the 2026-10-28 probe).

**Recommendation.** Keep each bullet's bold lead and its one-sentence reason; cut the incident narration in
parentheses. Rough size after: about 100 lines and 1,300 words.

### `notes/configuration.md` -- long

> "The README is the tour; this page is the reference a refusal points at."
> "refuse with `Phrases.NoStrengthChecker`"

**The fault.** A start on an options reference that covers one option, the strength checker, which CUSTOMIZATION.md
covers in full. Nothing points to it, though it says a refusal does. `Phrases.NoStrengthChecker` and
`vault.replacePassphrase` do not exist in `src/`.

**Recommendation.** Delete it, or merge anything new into CUSTOMIZATION.md. Size after: nothing.

### Fine, with small fixes

These read well; each has one thing to correct.

* **CLAUDE.md.** Two sentences are unclear: "Any change of position names the argument that moved it, and so does a
  return" ("a return" means the agent's report) and "A data-integrity failure met in a consistent state is reported
  by throwing".
* **NOTYET.md.** One sentence is opaque: "A host may one day want the say on a box too damaged to name its epoch,
  meeting a healthy store."
* **`notes/housekeeping.md`.** *CLAUDE.md's long-file list* describes a list CLAUDE.md no longer has (it now says "a
  file past about 800 lines is searched", and the script uses 700).
* **`notes/release-checklist.md`.** Points to the core README's *Fingerprint unlock*, a section that does not exist.
* **`notes/expose_improves_security.md`.** Says "#505, which is still open"; #505 has merged.
* **`packages/safebyok/eslint.config.mjs` and the nine copies.** The comment on `unicorn/consistent-boolean-name`
  contradicts STYLE.md's `isFoo` rule (see STYLE.md above).
* **`.mergify.yml`.** A commented-out `scopes:` block at the end; its header repeats PROCESS.md, *The history we
  keep*, which is acceptable for a config.
* **`.github/workflows/release.yml`.** Its 30-line header restates `notes/releasing.md`. Acceptable beside the code,
  but one of the two could point to the other.
* **`.claude/skills/sprint/wrapup.md`.** Step 1 describes restacking by hand, while `/restacker` exists for exactly
  that and PROCESS.md names it.
* **`demos/safebyok-demo-react/README.md`.** One sentence is gapped: "The machinery's (auth scaffold, ...) run under
  node; each component's renders it under jsdom".

## 3. Patterns that recur

1. **"Answers" for "returns", and other house verbs.** "Answers" (for returns or responds) appears in at least 12
   files, most in VOCABULARY.md (12), `notes/guarantees.md` (9), `notes/gallant.md` (9) and the design notes. "Hears",
   "stands", "born"/"birth" and "in hand" cluster in the same files: `notes/design-proof.md` (22), `notes/design-models.md`
   (20), `notes/guarantees.md` (13). VOCABULARY.md is the likely source, since every agent reads it and copies its
   phrasing.
2. **Glossary entries that describe behaviour.** VOCABULARY.md's long entries are where its slop is, and they repeat
   what the README and doc blocks say. A definition stays plain; a description of what a call does in every case
   does not.
3. **History inside reference documents.** Dated rulings, thread numbers and PR numbers: TODO.md (76 markers),
   `notes/reference-timings.md` (26), NOTYET.md (17), STYLE.md (15), `notes/wontfix.md` (12). In NOTYET.md and
   `wontfix.md` the dates are the point; in STYLE.md and TODO.md they push the rule further from the reader.
4. **Old-design leftovers.** The core was rewritten, and several documents still name what it replaced: `putWayin`
   (root README, core README, CUSTOMIZATION.md), `vault props` and `reviseWayins` (TODO.md), `leaseHours`
   (`wontfix.md`), refusal kinds that no longer exist (`design-vaultdb.md`), and the whole of `notes/configuration.md`.
   Two files warn the reader that they are out of date instead of being updated.
5. **Design notes left as reference.** `design-models.md`, `design-proof.md`, `design-vaultdb.md` and
   `reference-timings.md` were written as working shorthand during a sprint (emoji tables, fragments, "Eyebrow
   raisers") and stayed in `notes/` after the design moved on. They are the densest slop in the repository.
6. **One rule in several places.** The stamp and the shapes (VOCABULARY.md and STYLE.md); `ckey` and scopepath
   (three times in STYLE.md, once in VOCABULARY.md); the doc-block lessons (STYLE.md, `gallant.md` *Words*,
   `gallant-docblocks.md`); the strength checker (CUSTOMIZATION.md, `configuration.md`, VOCABULARY.md, the core
   README); the release process (`release.yml`, `notes/releasing.md`, PROCESS.md).
7. **Participle pile-ups in the READMEs.** "its cause the driver's message", "what was thrown kept nowhere", "an edit
   having been read back into the `Box` first". Each is easy to fix with a second sentence.
8. **A possible source.** `/tighten-guidance` step 4 says "Say each remaining line with fewer tokens". Asking for
   fewer tokens, without also asking for plain sentences, rewards exactly the compression this survey is about. It
   may be worth adding "in sentences a newcomer would say aloud" to that step.

**What is fine.** The agent and skill files are written in clear, direct instructions. PROCESS.md, CONTRIBUTING.md,
SECURITY.md, the Convex, Postgres, IndexedDB and React READMEs, the e2e and demo READMEs, the CI and release notes,
and the config comments are plain English. Their length matches their job.
