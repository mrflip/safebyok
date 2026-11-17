# Doc blocks: the hellmouth, and a reform

For the Coach, 2026-11-05. Counts are from PR #498's tree (`b8a28462`) and `tests/models/` on main. The proposal is
text to paste or to rule on, not a plan already applied: nothing in STYLE.md, the lint or the briefs has changed.

## 1. The grammar of the slop

Take the sentence you quoted:

> What the deviceDB stores and takes, and their checkers, imported as `DS`. A scope or query refuses 'bad_scope'; a row or
> record, 'bad_record'; a cutoff, 'bad_option'.

It is English with the function words removed. Five devices do all the work, and the same five recur in every Goofus:

* **The verbless lead.** A noun phrase stands as the sentence (`What the deviceDB stores and takes`; `The vault listed for
  `bag`, a tombstone among them, or null`), and the rest of the contract hangs off it as modifiers. The reader never gets a
  finite verb to anchor on.
* **Gapping.** The verb is said once and elided down a list: `a row or record, 'bad_record'; a cutoff, 'bad_option'`. One
  gap is English; three, joined by semicolons, is a table pretending to be a sentence.
* **Participial absolutes.** The state a call leaves behind, compressed to a participle: `delivered first`, `the seal's end
  included`, `storing nothing`, `its sidecar `{}` where left out`.
* **The stand-in "one".** `one a sweep crossed refuses only its own caller`; `one that opens to anything else`. The writer
  knows the referent, the reader must reconstruct it. This is prose written from inside the implementation.
* **The reason chain.** `as`, `so`, `once`, `since`, `which`: the why, forbidden by name and smuggled in as a subordinate
  clause.

The mechanism is compression. The agent holds a six-line contract (every refusal, every reach, the state left behind, the
security fact) and a two-line cap, and resolves the collision by keeping every content word and deleting the function words.
The glossolalia is what a contract looks like with its verbs taken out. The same compression under a different cap gives the
test titles.

## 2. Why agents land there

Your four hypotheses hold, and the evidence sharpens them.

**The constraints collide inside STYLE.md itself.** *Comments and doc blocks* opens with the interim note (one or two
lines, no refusal lists), then says: most public methods take 5 to 15 lines; name every reach across a seam, private members
too; name the refusals that are common and not obvious, in a five-bullet sort; state the contract, what holds once it
succeeds, the state the call leaves behind, side effects, when it may be called, any security fact. Its two worked examples
are a six-line `hello` with three quoted kinds and a reach sentence, and a three-line `#fillFromStored`. The documentarian
brief names those two as *the* worked examples. The note wins the agent's intent; the body and its examples win its
imitation.

**"For the caller" has no operational meaning.** Nothing says what a caller wants that isn't "everything true about the
call", so an agent writes everything true, then compresses. The Coach's rewrites answer three questions and no others: when
do I call it, what do I get, what would I get wrong.

**The test titles are the pre-image.** The Tests rule's own example is the template: `"refuses a misspelt field as
'bad_option', as its second example shows"`. Across `tests/models/`:

| titles | over 100 chars | quote a kind | contain " as " |
|---|---|---|---|
| 746 | 180 | 263 | 173 |

A title became a mini-contract. The next agent reads the tests as the spec, and the contract comes back out as a doc block in
the same register.

**The ambient code is the register.** What an agent imitates on #498:

| folder | blocks | with `;` | quote a kind | as/so/once/since/which | noun-phrase first line |
|---|---|---|---|---|---|
| models | 269 | 31 | 10 | 77 | 145 |
| shapes | 183 | 24 | 23 | 68 | 137 |
| helpers | 218 | 22 | 17 | 73 | 98 |
| storage | 55 | 10 | 2 | 15 | 28 |
| refusals | 40 | 2 | 9 | 24 | 30 |

(A noun-phrase first line is right for a lookup or a type; the share says how the rule is read.) `gallant.md`'s own premise,
that agents learn from the code around them, cuts both ways: until the sweep lands, every new block is written next to slop.

**Long context drifts.** Prose guidance decays over a session; a mechanical limit does not. Today nothing mechanical holds a
doc block to any shape: `@stylistic/max-len` is off, there is no JSDoc plugin, and `vitest/valid-title` is installed and
switched off. The 120-character line is a request.

## 3. The reform

Five pieces. The first two land together, in one PR; the rest follow.

### 3a. STYLE.md *Comments and doc blocks*: replace the section

Replace, don't annotate: the interim note's "where the rest disagrees, this note wins" is itself a collision. Draft:

---

## Comments and doc blocks

`/** */` for doc blocks, `//` for a running clarification or commented-out code. Bulleted lists use `*` at the top level and
`-` below, indented two spaces per level.

**A doc block is as short as its purpose, and says what the member does for the one reading its signature.** Its first
line is one whole sentence resting on the `/**`, however long, so it reads with the code folded; a member whose purpose will
not go in a sentence is a smell to report. For length, measure it against the doc of a method of like complexity and
flexibility in a library you trust from memory (the DOM, Node's `fs`, Zod): usually one line, rarely more than five. No
count holds the length: a reviewer does. The first line runs long only while it is one fact a caller must know before
calling `#one-sentence-headline`: `create` refusing a live box is that news and stays on the line; a put's stale-write
criteria are a description under a short headline (the pairs: `notes/gallant-docblocks.md`).

* **Every export gets a doc block; a private member gets a phrase** `#a-helper-gets-a-phrase` (`/** The whisper of
  `record` */`). Both answer the caller's three questions and no others `#three-questions`: when do I call it, what do I
  get, what would I otherwise get wrong. Never who calls it, nor what a sibling does.
* **A doc block has no past and no future** `#purpose-not-path`: nothing on how the code came to be, what it replaced,
  which thread or ruling shaped it, why it is built this way, or what is next. A reason worth keeping is a `//` comment
  above the block (below); a caveat, a progress note or an open question goes to `human/` or the whiteboard, never here.
* **A doc block does not read the body aloud** `#purpose-not-machinery`: not the steps or their order, the helpers it calls,
  the fields it touches, or the state a refusal leaves behind. The body is a line below, and a caller who needs it will open
  it. The test: cover the body and ask of each sentence whether the caller still needs it.
* **The first sentence names the act or the thing** `#name-the-act`. A function that stores, decrypts, asks the user or sends opens with that
  verb: `Create a new box for whisper (encrypted) and sidecar (readable), sealed against the box metadata`. A lookup, a type
  or a constant opens with what it is or hands back: `Vault **or tombstone** listed at `scope`, null if absent.` Read the
  member's name against that sentence (*Naming*). It carries one qualifier at most; anything more is a sentence of its own.
* **Every sentence has a subject and a finite verb, and says one thing** `#one-verb-one-fact`. The usual signs that one
  doesn't: a semicolon joining two facts, a list with its verb gapped out (`a row or record, 'bad_record'; a cutoff,
  'bad_option'`), a clause hung on "as", "so", "once", "since" or "which", and "one" standing in for a noun you cut. Each
  is a cue to write the second sentence, not a ban. A fact that will not go in a plain sentence is not a doc-block fact.
* **A member's block names no refusal catalog** `#no-refusal-catalog`. The thrower's doc and the `Outcome` type carry the
  kinds, and a class or module doc may say in one sentence what misuse refuses. The one kind worth naming is a condition the
  caller branches on in normal use: `stale_write` on a put, `wrong_passphrase` on an unlock. Before naming one, taste it
  against those two from memory: a kind of lesser salience goes unnamed. Where a caller meets a refusal in normal use, say
  what to do instead `#say-what-to-do`: `Precede with await bank.hello(), repeated to force a refresh`.
* **Option values get a list** `#option-values-get-a-list`, one value a line, the default marked (`create`, below). A
  term with a home (`sealed`, `stamp`) gets one `{@link}` or a pointer, never a second definition `#point-dont-redefine`.
* **The guarantee is the line worth writing** `#say-the-guarantee`. What the call proves, or what a caller could get wrong about a secret, goes
  in: `Extracting the whisper authenticates that (sidecar included) the object has not been modified since it was sealed`.
* **A guard names the predicates it asks** `#guard-names-its-predicates`, linked: `throw unless {@link isEnabled}, unlocked, {@link isPresent}, {@link isFull}`.
* **A maintainer's note is a `//` comment** `#reason-goes-above`, on the line above the doc block or by the code it concerns: an invariant kept
  (`// every lock goes through here`) or a reason (`// The lock first: no box opens under a lease while the tombstone goes out.`).
* `@param` and `@returns` only for a unit, a range, or what `null` or leaving an optional out means. A `{@link}` names
  something in scope in its file; anything else is backticks, a private member always.
* **`@example`s are welcome**, one line each where they can be, and each has a test (*Tests*).
* **Facts come from the code** `#facts-from-the-code`, never from the old prose or the test titles. Where they disagree, write what the code does
  and raise it; the doc never changes behaviour.
* **A file past about 40 KB is sectioned.** (the existing bullet, unchanged)

Goofus and Gallant, from `notes/gallant.md` *Words*, which has the rest. Each Goofus is named for its device, so you can
recognise your own.

The noun phrase carrying the contract, and a refusal where a recipe belongs:

```ts
/** The vault listed for `bag`, a tombstone among them, or null. Refuses before ready. */
vaultOf(bag: VaultBag): Vault | null
```

```ts
/** Vault **or tombstone** listed at `scope`, null if absent.
 * Precede with await bank.hello(), repeated to force a refresh; then .hydrate() on the vault answered makes it timely
 */
vaultAt(scope: BankedVaultScope): Vault | null
```

The gapped refusal list, the participial absolutes, and the option explained in a clause:

```ts
/** Seal the box of `input`, under a `box_tok` fresh from {@link makeLifeTok}, and store it over no record; resolves the instance held once it lands. Refuses 'bad_option', naming the field, a dna that fails {@link boxDna}; 'vault_locked' while the vault is locked, the seal's end included; 'bad_option' a scope already held; and 'stale_write' where storage holds a record, delivered first, or what `opts.ifPresent` says of a live one. */
async create(input: BoxDna, opts: PutListingOpts = {}): Promise<Box>
```

```ts
/** Create a new box for whisper (encrypted) and sidecar (readable), sealed against the box metadata
 * @see `sealedRecordOf` in models/box.ts for what "encrypted" and "sealed" imply
 * - `ifPresent:fail` (default): replace a void/tombstoned box, else fail
 * - `ifPresent:repl` replaces (if in correct sequence);
 * - `ifPresent:get`  returns an existing box
 */
async create(input: BoxDna, opts: BoxCreateOpts = {}): Promise<Box>
```

---

Tags: a bullet that names a solecism carries a hashtag, the same one `notes/gallant.md` and the bestiary use where they
cover it, so a review finding, a lint message and an `rg` for the solved pair all use one name. `#purpose-not-path` (how
the code came to be: the decisions, the request) and `#purpose-not-machinery` (how it works) replace gallant.md's
`#purpose-not-process`, which covered both; no tag covers both.

Dropped from the current section, on purpose: the 5-to-15-lines paragraph; *Name every reach across a seam*; the five-bullet
refusal sort; *Say a thing once* as a rule about class docs (the class-doc sentence above keeps its one use); *Say what a
member does and when to call it, never who calls it* and *Never tour the fields* (both folded into the first bullet); the
`hello` and `#fillFromStored` before-and-afters.

### 3b. STYLE.md *Tests*: the title rule

Replace the bullet *Every use case of an exported function has a test, and every `@example` has one whose title points back
to it* with:

> * **Every use case of an exported function has a test. A title is one plain clause naming the behaviour.** It quotes no refusal kind and chains no second outcome: the assertions carry those. `it("refuses a misspelt
>   field")`, never `"refuses a misspelt field as 'bad_option', as its second example shows"`. A test that covers an
>   `@example` says so on its first line, `// putBox @example 2`, which `rg` finds. The blurb slot of a bulk case list
>   follows the same rule. The linter (`vitest/valid-title`) refuses a quoted kind; the length is for review.

### 3c. Lint: only what removes content

A count cap is the vise that made the slop (section 1): an agent with a six-line contract and a two-line limit compresses,
and when it cannot compress it reaches for `eslint-disable`. So no cap on lines, no `max-len` on comments, no semicolon rule
(a banned `;` comes back as `, and` with the same gap). Three rules remain, each of which removes content or fixes the shape
without inviting cramming:

* every export has a doc block;
* the first line rests on the `/**` (never `/**` alone on its line), so a folded file reads;
* no two quoted refusal kinds in a member's description: a catalog, where one kind a caller branches on may stay. Class
  and module docs are exempt.

`eslint-plugin-jsdoc` (65.4.2, ESLint 10 flat config, loads without changes) was trialled in a throwaway worktree against
#498's src; `jsdoc-eval.md` beside this file has the ready-to-paste block, the per-rule table and the rejected rules. What
the trial corrected in this draft's guesses:

* `noZeroLineText` is the opposite of what was guessed: it refuses text on the `/**` line, is on by default, and would flag
  89 of our blocks. The bare-`/**` refusal is `jsdoc/no-restricted-syntax` with the selector
  `JsdocBlock[delimiterLineBreak="\n"]`: 0 hits on src, 28 in `tests/test-helpers*`.
* The catalog regex `'[a-z_]+'` had 3 hits, all option values (`'gone'`, `ifAbsent: 'fail'`). Requiring an underscore,
  `'[a-z]+_[a-z_]+'`, has 0 false hits and still catches a planted catalog; it misses the four one-word kinds.
* `publicOnly`, `contexts`, `mainDescription` and `message` exist as guessed, and the TS selectors work.

The recommended set is the three rules above plus `require-description`, `no-blank-blocks`, `informative-docs` (a block
that only restates the name), `no-undefined-types` (a dangling `{@link}`), `no-types`, `check-tag-names`,
`require-asterisk-prefix` and `check-alignment`. Run whole on src:

| hits | of which |
|---|---|
| 281, all true, no `eslint-disable` needed | 277 missing blocks (139 exported consts, 69 of them throwers; 92 public methods and getters; 35 types; 7 classes), 2 dangling links, 2 blocks closing on a text line |

The Coach's sample blocks all pass. The set adds about 0.44 s to a 3.5 s lint. Rejected, each for the constraints: every
line-count option; `require-param`, `require-returns` and `require-throws` (narrated parameters and a catalog in tag form);
`require-description-complete-sentence` (demands a final period); the type-nagging rules TypeScript covers; the layout
rules STYLE.md never ruled on, some of which refuse the nested bullets; `text-escaping` (bans backticks); every
`recommended` preset (874 hits).

For the tests block, `vitest/valid-title` needs `allowArguments: true` (the bulk case lists pass variables as titles; that
is why it is off today) and the underscore form of the kind regex: 203 hits on tests.

What this gives up: nothing mechanical stands against length or the gapped list, so the long-context drift is met by the
first-line-only rule for coding agents (3d) and by reviewers, not by the linter.

### 3d. Who writes a doc block

Your option, taken most of the way. Recommendation:

* **A coding agent writes the first line and nothing more.** The line is also its naming check (*Naming*, the style-reviewer's
  "name against the first line"), and a one-liner is cheap and hard to slop. Written before the body, it is the best
  name-chooser we have: a name that will not sit against its first line is wrong, and the agent sees that before the code
  exists. Going to zero loses that check and gives a
  reviewer nothing to read the name against.
* **Everything past the first line is the documentarian's**: class and module docs, option lists, `@example`s, the guarantee
  line. The role rule, not a count, is what keeps a long session from drifting into prose: a coding agent never writes the
  second line.
* **The documentarian is spawned fresh, one file per spawn**, with a brief under 40 lines. No context fatigue is possible
  in a run that size, and the run's own output is the only ambient prose it sees besides the examples.

### 3e. The documentarian brief

Cuts, not additions: a longer brief is more guidance for an agent that already has too much.

* Cut *Gather first* and its candidate list. The list is refusal-centric and written in the register it is meant to cure (`a
  malformed argument or option refuses 'bad_option' before anything is read, asked for or written, its message naming the
  field, never the value`).
* Replace "STYLE.md's two before-and-afters (`hello`, `#storedBase`) are the worked examples" with "STYLE.md's two pairs and
  `notes/gallant.md` *Words* are the worked examples; `notes/gallant-docblocks.md` is the bestiary".
* Replace "customer-first" and "token efficient" with the three questions, verbatim from STYLE.md.
* Add: read a test file only to find `@example`s; a test title is never a source. Add: one file per spawn.
* Replace "Keep every security-relevant statement unless the code shows it false" with "the guarantee stays; the mechanism
  goes". *Dropped facts are listed* stays: it is how you put back what matters.
* Add a final step: `pnpm --filter safebyok lint`, which refuses a quoted kind and a bare `/**`, then read each block aloud
  and ask whether every sentence has a verb.

### 3f. Order of operations

1. 3a and 3c in one PR, the lint rules at `warn`, with the `eslint-plugin-jsdoc` dependency.
2. The documentarian sweep: `models/`, `shapes/`, `storage/`, `refusals/`, `helpers/`, one spawn per file, each its own
   commit, one PR per folder. The sweep is what turns the lint to `error`, and what fixes the ambient register.
3. 3b and the title rule at `warn`, a focused agent's sweep of titles (titles only, assertions untouched), then `error`.
4. `notes/gallant.md` *Words* and `notes/gallant-docblocks.md` stay as review material. gallant.md's `#purpose-not-process`
   splits into `#purpose-not-path` and `#purpose-not-machinery`, each with its own pairs.

### 3g. Where each rule lives: three tiers and the code beneath them

The model you are coming around to, with what each tier has to carry for the others to work:

* **Tier 0, the code.** Writers imitate their neighbours before they read anything, so the sweep (3f, step 2) is part of
  the model, not a chore after it. Until it lands, tier 1 loses to the file the agent has open.
* **Tier 1, CLAUDE.md: the rules that shape prose too deeply to fix in review**, like *Naming at a glance*. For doc blocks
  that is three lines: the first line is one sentence on the `/**` that names the act for the caller; no refusal kinds; a
  reason or an invariant is a `//` comment above. No encouragement to read STYLE.md beyond the header search it already
  teaches.
* **Tier 2, STYLE.md: the medium document for reviewers**, the 3a draft. It is read by whoever reviews and by the
  documentarian, and consulted by a writer only when a finding sends them to a section.
* **Tier 3, the bestiary, indexed by tag.** A finding cites the tag; the agent fixing it runs `rg '#tag'` and reads one
  entry. It lives at `notes/gallant-docblocks.md`, beside `notes/gallant.md`, where `rg` looks.

Two gaps the model has today:

* **Who weedwhacks depends on who reads the code.** Recognition is easier than production. A reviewer on a weaker model
  than the writer's (sonnet or haiku against opus) can hold a block against the tagged list and name the tag, but rewriting
  a contract means knowing it, which means reading the code as the writer did. So the style-reviewer detects and tags,
  fixing only the mechanical (a bare `/**`, a stray kind), and the rewrite goes back to the writer as a finding for the
  rework round. A code reviewer that reads the code anyway (the thread-reviewer) gets the tagged list as its checklist and
  the license to rewrite. No dedicated doc-block reviewer: the checklist is the bestiary's contents line, which is the top
  ten.
  Tried on `box.ts` and `vault.ts` (`reviewer-experiments.md`): the sonnet role tagged 45 of 70 blocks for register and
  never applied `#facts-from-the-code`; the opus role found 7 blocks that disagree with the code and 8 missing guarantees,
  15 of its findings needing the code. The two tags that need the code come off the style-reviewer's list.
* **The documentarian is a sweep tool, not a tier.** Its brief becomes tier 1's three lines plus the pointer to STYLE.md and
  the bestiary (3e).

**Worked examples per entry: one pair, two when the solecism has two faces, never more than three.** An agent indexing by
tag needs a recognition cue (the Goofus, named for its device) and the shape to produce (the Gallant). A second pair adds
information only when its Gallant has a different shape, as a verb's refusal catalog and a guard's do under
`#no-refusal-catalog`; gallant.md's *Goofus again* is that case. A third pair serves your taste, not the agent's need, and
every lookup pays for it. Caring more about a lesson buys a sharper pair, not more pairs. An entry that seems to need four is
two lessons.

### 3h. Tier 1: the CLAUDE.md block

Modelled on *Naming at a glance*, and landing in the same PR as 3a. `#purpose-not-path` and `#purpose-not-machinery` sit
here because they are the biggest traps.

> ## Doc blocks at a glance
>
> STYLE.md *Comments and doc blocks* is the source; `notes/gallant-docblocks.md` has the pairs, by tag.
>
> * **Write the first line before the body**: one sentence on the `/**`, saying what the member does for its caller. A
>   name that will not sit against that line is the wrong name. Write nothing past the first line; a documentarian does.
> * **A doc block has no past** `#purpose-not-path`: not how the code came to be, what it replaced, the ruling or the request
>   behind it, or why it is built this way. A reason worth keeping is a `//` comment above it.
> * **A doc block does not read the body aloud** `#purpose-not-machinery`: not the steps, the helpers it calls, or what a
>   refusal leaves behind.
> * **No refusal catalog.** One kind a caller branches on in normal use (`stale_write`) may be named.

### 3i. The weedwhacking loop: harvest, gallant, fix

The procedure for any prose battery that rings (test titles first), and the way the bestiary grows. Three agents, two of
them cheap, and the Coach between them writing only Gallants.

1. **Harvest, stratified by device, not by badness.** An agent reads the rule and section 1 as vibes and brings back two or
   three specimens per device (the quoted kind, the "as" trailer, the outcome chain, the mechanism narration, the condition
   stack, the lost referent), varied across files, plus a few titles already good, as anchors. Worst-first harvesting
   returns six sins in one specimen, which teaches nothing. The harvester writes a nominations file, each nominee with its
   `file:line` and the device named in under twenty words.
2. **Gallant, one per device.** The Coach rewrites five to eight, not the whole harvest. The pairs go beside the rule in
   `notes/`, tagged.
3. **Fix, one folder per spawn, titles only.** A sonnet agent with the pairs as its brief rewrites across the suite. It never
   changes an assertion. Where a title carried a fact the assertions beneath it don't, it lists the title as left alone, so
   the Coach can decide. It migrates an "as its second example shows" trailer to the `// member @example 2` comment, and keeps
   titles unique within a `describe`.
4. **Measure** with the same counts before and after (titles quoting a kind, containing " as ", over 100 characters).

Why sonnet is enough here and not for doc blocks: a title's contract is in the assertions right below it, so the fix is
recognition plus a local rewrite. A doc block's contract is in the code, which is production. The split matches 3g.

## 4. For the Coach to rule on

* **The dependency**: `eslint-plugin-jsdoc` (3c), evaluated in `jsdoc-eval.md`. Its six open questions, with a lean on
  each: exempt `helpers/phrases.ts` from `require-jsdoc` (yes: the string is its own doc, 21 hits); keep getters in (yes:
  public API); leave protected members exempt (yes: not exports); the underscore form of the catalog regex over an
  alternation read from `refusalKindVals` (yes: the config should not depend on src); a first-sentence mood check (defer:
  a word list is the kind of rule agents obsess over, and 3a has not ruled imperative); apply the set to
  `tests/test-helpers*` (yes: it is the published `safebyok/testing` surface, 70 hits, part of the sweep).
* **The reviewer split** (3g): the style-reviewer detects and tags, the writer and the thread-reviewer rewrite. This loosens
  the style-reviewer brief's "name the member" to "name the member and the tag", and widens the thread-reviewer's.
* **The CLAUDE.md block** (3h): its wording, and whether four bullets is already too many for tier 1.
