# Sprint reform: the plan

**Date:** 2026-11-06. **Mode:** normal. **Issued by:** the Coach, in chat on 2026-11-06, approving the threads the
types-and-checks inventory and the November reform rounds proposed ("agree: clock, then the worlds as Picks, then the
host-function branding; the VOCABULARY sweep; the guarantees pass for G8's stale names; boxListing.hello's listed argument
going internal; the pointer pass for fourteen kept examples; a stale isVaultError example"; "Launch the first pass reform of
the checkers+types when it's convenient, and go ahead on the others"; "yes if it's refusalkind it's Refusalkind,
RefusalkindVals, etc.").

**Default levels:** review `medium`; worker and reviewer on their agents' own model and effort; style pass on
`style-reviewer`'s pin. **Threads at once:** 3.

**Status:** 2026-11-06, 05:15, **paused**: threads 1 (#518), 2 (#517) and 3 (#522) filed and in the Coach's merge line; thread 4
(#523) filed on #513's tip; thread 11 (#525) filed on main; thread 12 (#526) and 14 (#527) filed on main; thread 13 (#528) filed on main; thread 15 (#530, `list_boxes`) filed on #523; thread 16 (#529, `utils_mash`) filed on #518; thread 17 (#531, `browser_entry`) filed on #529; threads 18 (`deviceid_required`, on #527), 19 (`utils_port`, on #531) and 20 (`kind_promises`, on #531) building; #528 amended (adf4ea68b) with the guarded files; thread 18 (#532, `deviceid_required`) built, in review; the Closer Look
tab awaits the Coach's triage; #513 and #517 merged 05:10; threads 5 to 10 wait on
#511 reaching main
(`human/20261106-sprint_reform_paused.md`); threads 5 to 10 wait for PRs #511 and #513 to
merge, since they rewrite the same shapes and model files (see *Ground rules*).

## Read first

* CLAUDE.md whole (every worker has it), then its `#earnest-question` paragraph once more: a question in a handoff or a
  review is answered, with a recommendation, before anything is built on it.
* STYLE.md *Validation* and *Shapes and duck typing*, for threads 5 to 10. *Comments and doc blocks* for any thread writing
  a doc block (every code thread). *Tests* for any thread writing a test title.
* `packages/safebyok/src/refusals/throwers.ts`, the module doc at its head: the rules for a refusal, its thrower and its
  phrase (threads 5 to 10).
* `notes/guarantees.md` *The guarantees*, before changing `crypto.ts`, `proving.ts`, `lease.ts`, `gating.ts` or
  `types/types.ts` (threads 5, 7, 8, 9).
* `whiteboard/20261102-newdesign/types-and-checks.md` in the base checkout `/workspace/byok` (committed on its plan branch;
  copied into this sprint directory as `types-and-checks.md`): the inventory behind threads 5 to 9, by section.

## Ground rules

1. **Wait for the merges.** PRs #511 (refusal follow-ups, `refusalkind`), #513 (parse collapse) and #514 (`@example`
   rebalance) are the Coach's to merge today. Threads 3 to 10 are cut only once `origin/main` holds them (`git grep
   refusalkind origin/main -- packages/safebyok/src/helpers/validator.ts` finds a hit; `git log origin/main --oneline |
   rg 'parse_collapse|example_rebalance'`). Threads 1 and 2 are docs and start now.
2. **Add no machinery.** A thread changes what it is for. No retry, abort or fallback logic; no new helper where a line
   serves. A validation stays where it is a boundary, a pick of fields, a filler of defaults, a replacement for an
   `if (x == null)` precondition, or a cope cage; a private method's check of arguments it has no cause to suspect goes.
3. **Fenced off by the Coach, untouched by every thread:** the `absentBox` throwers (both of them) and their callers, and
   `storeFailed`. `weakPassphrase` stays as it is.
4. **Names.** `refusalkind`, `refusaltag`, and every `kind` or `label` tag smushed (STYLE.md *Naming*); test backdoors
   carry loud `_cheat_` names (`_cheat_clock`), never a coined verb. VOCABULARY.md's names are the only names.
5. **Doc blocks.** The first line is one sentence on the `/**`, no past, no machinery, no refusal catalog (CLAUDE.md *Doc
   blocks at a glance*). An `@example` earns its lines or is not written. A reason goes in a `//` above.
6. **Types.** Where a thread chooses between an inferred type (`objCheck` with `/** */` on each prop, `Z.infer`) and a
   handrolled interface beside the checker (the checker exported as `Z.ZodType<T>`, an equality assertion between the
   checker's inferred type and the interface at the file's foot), the Coach has no preference: choose by the reader. A
   host-facing contract whose `.d.ts` is the product gets the interface; an in-repo bag stays inferred. Say which in the
   thread file.
7. **Changesets.** A renamed export, a renamed stored value or a dropped option is `minor` with a sentence on what a host
   sees; docs are `--empty`.
8. **One worktree, one PR, base `main`**, a stacked PR saying "Stacked on #N" (PROCESS.md *Pull requests*). Never run
   justify under `rebase --exec`.
9. **The Coach's merge line** (from 04:31): `main -> #513 -> #517 -> #521 -> #522 -> #512 -> #518 -> #519 -> #520 -> #511`,
   written as "Stacked as main -> ..." in each body. A PR in it takes plain pushes on top only: no `file-thread`, no rebase,
   no force-push. A thread stacked on a line PR files by rebasing onto that PR's current origin tip, not onto main.
10. **A stale test citation gets its test** (the Coach on F12, 2026-11-06): where a guarantee or doc cites a test the core
   lacks, write or find the core's test and cite it; only a claim about behaviour the code no longer bears is a finding.
   Thread 2's "verbatim" rule was overstrong there.
11. **`#the-host-is-not-our-threat-model`** (the Coach, 2026-11-06, on F8): a host's function is validated by its interface,
   never by the wisdom of its parameters; "if they want to choose stupid parameters or _.identity they'll figure out a way
   to do so." No thread adds a check that only second-guesses the host.
12. **A brand is a getter** (the Coach, 2026-11-06): `readonly modelkind = 'bank'` as an instance field would serialize;
   threads 7 and 8 brand with a getter (or a `Symbol.for`-keyed getter), never an own enumerable field.
13. **A two-liner is not a thread.** Thread 12 spent a worker and a reviewer on a nine-line removal. A fix that small
   rides as a directive on the thread underway in those files, or waits for the next one; a thread of its own only when
   nothing in those files is coming.

## Threads

### 1. `vocab_sweep`

**The Coach:** "the VOCABULARY sweep". From chat: `seal`/`unseal` are used everywhere in the models and never defined in
*Encrypted forms*; `open` is the loose word the file leans on eleven times and should be ruled out of code and docs,
kept only for a user-facing sentence; the wayin and lease rows are semicolon chains of eight and nine clauses; "one never
made is born `novel`" is the stand-in "one"; the damaged row gaps its verbs; old-design members are still named
(`putVaultRecord`, `getWhisper`, `KeptLease`, `putWayin`, the bank's `stage`); kinds that no longer exist were already
dropped by #509's follow-up.

*Gloss:* VOCABULARY.md only, plus `notes/old_vocabulary.md` for any retired name it moves there. Add `seal` and `unseal`
to *Encrypted forms* (a box is sealed: its whisper ciphered and its boxKey wrapped under its stamp; unsealed is the
reverse), rule `open` out under *Words safebyok does not use* with the verb to use instead (`unwrap`, `decipher`,
`unseal`, `extract`), rewrite the rows that read as chains into sentences with a verb each, replace or retire the
old-design members against the code on `main` (`rg` each name in `packages/safebyok/src`), and keep every fact: the
Coach reads this file as the cast. No new names without a `human/` question. **Levels:** worker `opus`; review `none`
(no code), the worker reads its own rows aloud; style pass `opus` on the vocabulary. **Depends on:** nothing. **Size:**
one context.

*Review (high, raised from none; opus style pass):* `flagged`. Kept six fixes (one verb per sentence in five rows; `ckeys`;
a wayin's own `registered_at`; `DeviceRecord` named again; the *Standard term* pointer; old_vocabulary's header). Four facts
the code contradicts go to a rework worker: the passkey row's `camped` (it is `bad_option` at the vault, `camped` at the
vaultDB); a deleted vault's object keeps its slot and refuses `vault_gone`, not `disabled`; `damaged_box` is only an
unsealable or undecodable whisper, a bad row is `damaged_row` or `newer_format`; a `revision_tok` moves on put or del.
Left as minor: names ahead of thread 10 and #511; undefined `added`/`revoked`/`tidied`; two dropped clauses; "ask" as a
verb (Open Matters); the deviceId sentence for a host-given `device_id` (Open Matters).
*Second review (high):* `fixed`; the five corrections hold against the code; one fix (a box, not a whisper, is what
will not unseal). Left: the vault row's "next life" sentence is loose for a vacate, and names no sweep (Open Matters,
with the lifecycle wording). Outside scope: stale comments in `storable.ts` and `errors.ts` (Cleanup, to thread 5).
**Filed** at e9b58da04, rebased onto main at #515's merge.

### 2. `guarantees_pass`

**The Coach:** "the guarantees pass for G8's stale names".

*Gloss:* `notes/guarantees.md` only. G8 names old-design sites (`HostErrorSanitizer.refusalFor`,
`deriverThrewRefusal`, `guardStrengthChecker`, `Proving.#unwrap`, `Lease.#vaultKeyOrNull`, `Lease.#openedOrNull`,
`Lease.cipheredWith`, `deviceTrouble`, `tests/validators.test.ts`); the follow-up on #511 repaired one sentence and left
the rest. Walk every guarantee G1 to the last, and *Access points, value by value*: for each site, function and test it
cites, find the current name on `main` or say the claim no longer has a site; **change no guarantee's meaning**. A claim
the code no longer bears is not rewritten: it goes in the PR's *Open questions* and the thread file as a finding for the
Coach, with the code that contradicts it. Each other correction is a name or a path. **Levels:** worker `opus`; review
`high`, a code-reader checking every changed citation against the code (this is the one docs thread that gets a
reviewer: it states security claims). **Depends on:** nothing; rebase onto #511 once merged, which touched G8. **Size:**
one context.

*Review (high; sonnet style pass):* `flagged`. Kept two fixes (the amendment paragraph in five sentences; "#517's open
questions"). Every changed citation checked against main; F1 to F11 confirmed. Significant, to a rework worker: G8's
adopted route sentence (from #511) says a seal failure reaches `outcomeOf`; `putBox`, `box.put` and `putExposed` reach
`Lease.sealWith` with none, so the DOMException reaches the host raw; only the `try*` forms wrap it. Corrected in #511
first, then carried here. Minor, to the same worker: the passkey chain's `isSafelyAllZero` (it is an inline `reduce` in
`passkeyAnswer`); F1 gains `Lease.cipheredWith`, `grantLease`, `DeviceDB.getLease`, `guardStrengthChecker` and the
*Bytes* IndexedDB bullet; G2's wayin test citation becomes a finding (Open Matters); G1's half-renamed sentence. F10 and F6
are stronger than stated.
*Second review (high):* `clean`; G8's route verified at every site and byte-identical to #511's; `refusalOf` has no caller
(Open Matters: its fate); G8's seal list leaves out `boxListing.create` and `sealStampedString` (widen at the restack);
open item 2's "the core's `Box`", G1's uncited core comparison, G9's friend sentence and two G8 leftovers go to F1's
follow-up. **Filed** at 21cb34821; the Coach's line then rebased it onto #513. A commit for G2's core test follows the
Coach's ruling (ground rule 10).

### 3. `example_pointers`

**The Coach:** "the pointer pass for fourteen kept examples; a stale isVaultError example that calls a getWhisper the
core lacks".

*Gloss:* From #514's report: these kept `@example`s have no `// member @example N` pointer in a test: `FarFuture` 1,
`ForeverMillis` 1, `deriveWrappingKey`, `VaultLogger` 2 and 3, `DefaultLogger`, both of `StrengthChecker`,
`stableJsonify` 1, `storageUnavailable` 1, `VaultBag` (now `BankedVaultScope`), `PasskeyAnswer`, `capacity`. STYLE.md
*Tests*: each example has a test. Add the pointer where a test already shows the case; write the test where none does;
drop the example where no test is worth writing, saying so. Fix `isVaultError`'s example in `refusals/errors.ts`: it
calls `vault.getWhisper('ANTHROPIC_API_KEY')`, which the core lacks, and the label fails `label`; use a real call and a
label that passes. **Levels:** worker `sonnet`; review `low`. **Depends on:** #514 merged. **Size:** small.

*Built (PR #522):* thirteen lacked a pointer, not fourteen (`VaultLogger`'s are 1 and 2). Eight pointers on existing
tests, five new tests (`capacity` had none), two examples dropped (`FarFuture`, `ForeverMillis`: they read options the
core lacks; patch changeset), `isVaultError`'s example on `box.extractWhisper()`, and `PasskeyAnswer`'s stale example and
sentence corrected. Its leftovers went to Cleanup *Finally* as directives for thread 5.
*Review (low, sonnet):* `fixed`; two fixes (a bulk case's quotes; `PasskeyAnswer`'s body: in `unlock_vault` the passkey is
taken in place of the passphrase, not beside it); five minor left (an undefined `passkey` in the example; three chained
test titles; a long one-liner; the react example; #511's stale `VaultError` example, for thread 5). **Filed**: the Coach's
line took the worker's tip; the two review fixes were cherry-picked on top and plain-pushed, tip 51741eb57.

### 4. `hello_listed`

**The Coach:** "boxListing.hello's listed argument going internal".

*Gloss:* `vault.hello` parses the listing it fetched and hands it to `boxListing.hello(listed)`, which parses it again
because `hello` is a public method on a class the README names. Take `listed` off the public signature: `hello()` takes
nothing, and the listing receives the boxes by a non-public path (a `#`-private or a method the vault listing calls with
a name that says it is not for hosts). Then the second parse goes. The test "refuses a boxListing.hello given a list that
fails its check" goes with the argument, or moves to the vault's hello. Minor changeset: a public signature changed.
**Levels:** worker `sonnet`; review `low`. **Depends on:** #513 merged; cut stacked on #513's tip instead (the Coach,
2026-11-06: "Proceed as well you can without it"). **Size:** small.

*Built (PR #523, "Stacked on #513"):* `boxListing.hello()` takes nothing; `vault.hello` hands the boxes over by
`boxListing._takeListed(listed)`, a public method whose underbar says not for hosts, with the one `eslint-disable-line
unicorn/prefer-private-class-fields` the `_cheat_` methods carry (reported in the PR); the second parse is gone; the test
moved to `vault.hello`; minor changeset. The name is an Open Matters row.
*Review (low, sonnet):* `fixed`; one fix (the moved test's title names `vault.hello`, one clause); left: the `_takeListed`
name and whether an underbar method is exempt from entry validation (both Open Matters), the doc block's "and" (a
documentarian's), the changeset not naming `_takeListed`; hatches reported: the `eslint-disable-line`, `answer.val!` and
`as never` in the test. **Filed** at 895949623, rebased onto #513's current tip 7828cb089 (not onto main: ground rule 9).

### 5. `module_clock`

**The Coach:** "can we do something to make it more apparent to agents that passing in a clock is only a test hook?
... Nobody wants this feature, it's dangerous and it occupies far too much headspace for agents." Approved: "agree:
clock" first.

*Gloss:* From `types-and-checks.md` *The clock*: two independent clocks, `BankOpts.clock` and `VaultDBOpts.clock`
(`VaultDB.#clock`), kept in step only by the test helpers; 13 `.now()` sites, 9 pass-along lines, 7 checkers naming it,
15 test files; the `Clock` doc claims `Bank.make` reads it once and refuses an out-of-range reading, which no code does.
Build `helpers/clock.ts`: `nowMillis()` reading `Date.now()` on each call, and the backdoors `_cheat_clock(fn)` and
`_cheat_clockReset()`, exported from the module and from the test-helpers path, **not** from the package entry point.
Remove `clock` from `bankOpts`, `vaultDBOpts`, every world and friend shape, the proving world and the seven checkers;
`VaultDB.#clock` goes. Tests already on vitest fake timers need nothing; the test helpers (`models-world.ts`,
`vault-world.ts`, `storage-world.ts` and the two others the inventory names) swap one line each to the backdoor. A host
still passing `clock` meets `bad_option` since `bankOpts` is strict: the changeset (minor) says so and names
`_cheat_clock` as the test hook. Delete the stale `Clock` doc claim, and rewrite G4's "Both go by the host's clock" in notes/guarantees.md (thread 2's finding) to what is true once the clock is the module's. **Levels:** worker `opus`; review `high` (it edits
`proving.ts` and `lease.ts`, guarantees files). **Depends on:** #511 and #513 merged (they touch the same shapes and
`proving.ts`). **Look-ahead:** thread 6 removes `world.clock` from the world types for good; leave the world shapes
otherwise alone. **Size:** one context, but it is wide; if the first justify is not reached in one context, the backdoor
and `VaultDB.#clock` are the split.

### 6. `worlds_picks`

**The Coach:** "the worlds as Picks". And on `VaultListing`: the constructor should be `(world: Vault, opts:
ListingOpts)` with the world validated cheaply; "make sure cmd-click works because I need that for review; and if type
niceties take away doc blocks I'm against it."

*Gloss:* From `types-and-checks.md` *Defined-once table*: each world is defined three times (handrolled type, inline
`obj` in its listing's options check, the class). `VaultWorld` has `scope` and `boxRefreshMillis` that
`vaultListingOpts` never checks; `BoxWorld` has `demandUnlocked` that `boxListingOpts` never checks and that check
rebuilds the vault scope by hand instead of naming `CX.vaultScope`; neither options check extends `listingOpts`.
Cmd-click on `vault.world.scope` lands on the interface; over a `Pick<Bank, ...>` it lands on the class. Do:
`ListingOpts` loses `world` (keeps `vaultDB` and the horizon); `Listing`'s constructor is `(world: ListingWorld, opts:
ListingOpts)`; `VaultListing`'s is `(world: VaultWorld, opts)` with `VaultWorld = Pick<Bank, ...>` and `declare readonly
world: VaultWorld`; `BoxListing`'s the same over `Pick<Vault, ...>`; the inline world `obj`s go and the options checks
become `listingOpts` extended by what each adds; `StorableOpts` goes, each storable reading its horizon from its listing.
The fake worlds in `models-world.ts` and `vault-world.ts` stay structural and keep working, which is why Picks and not
the classes now. Doc blocks stay on the interfaces' members and on the classes. **Levels:** worker `opus`; review
`medium`. **Depends on:** thread 5 (stacked). **Look-ahead:** thread 7 wraps host functions in Bank's constructor; leave
Bank's constructor shape readable for it. **Size:** one context.

### 7. `host_branding`

**The Coach:** "dangermouse functions like requestCleartext are worth branding on the way out"; approved "then the
host-function branding".

*Gloss:* From `types-and-checks.md` *Dangerous host functions*: only the logger is wrapped once on the way in
(`parseLogger`); `requestCleartext`, the key deriver and `onPanic` sit raw on public Bank props; the `onPanic` guard is
written twice (`Bank.#panic`, `Vault.#panic`); the strength checker is wrapped on every call; `keyDeriver.load` has no
guard; `Phrases.BadNewsHandlerThrew` is dead. Wrap each host function once in Bank's constructor into a checked, named
thing (the existing `*Threw` throwers keep the passphrase out: G1 and G8), so later code holds the branded function and
never the host's; write each guard once; delete the dead phrase. The key deriver's wrap touches `proving.ts`: check it
against *The guarantees* first and say so in the thread file. Thread 2 found (F2) that G8's claim "the three host functions
that hear the passphrase have their throws replaced by `refusalFor`" holds only for the strength checker today; rewrite G8's
sentence and *Where the guarantees are kept* to name the wraps this thread builds, once, in Bank's constructor. No behaviour change a test can see except where a host
function that throws was previously unguarded (`keyDeriver.load`): that becomes the refusal the neighbours give.
The Coach (2026-11-06, F8): "What's the interface for key deriver? Validate that." The wrap checks the deriver's interface
(ground rule 11) and nothing about its parameters; `checkSuppliedSpecKept` (`helpers/basederiver.ts`) stays only as far as it
checks our own argon2id deriver against its published spec; if it polices a host's choice, it goes, and the thread file says
which. F2 (proceed): rewrite G8's host-guard sentences and *Where the guarantees are kept* here, after thread 13 has
rewritten the rest of guarantees.md (rebase onto it or onto main once it merges). Brands are getters (ground rule 12).
**Levels:** worker `opus`; review `high`. **Depends on:** thread 6 (stacked). **Size:** one context.

### 8. `checkers_once`

**The Coach:** "Launch the first pass reform of the checkers+types when it's convenient"; "proceed with what's not
controversial and then do another survey"; "We want each thing defined once."

*Gloss:* The non-controversial rows of `types-and-checks.md` *Defined-once table* and *Checkers not derived*: the bank,
vault and box scopes defined in both `shapes-core` and `shapes-storage` under different kinds, both files exporting the
same three names (one home, the other imports it); two different types named `LeaseSparse` (rename the one that is not
the lease's sparse shape, by VOCABULARY's *sparse*); the five places models repeat a schema's defaults in a destructure
(the schema's default is the one source); inline `obj({...})` shapes that duplicate an exported checker's fields. The
VaultDB and DeviceDB ducks become a `Symbol.for` brand on the base class (an adapter package may carry a second copy of
safebyok, so no `instanceof`), the two refusal tests that do not subclass adjusted. Changeset minor if an exported name
moves. **Levels:** worker `opus`; review `medium`. **Depends on:** thread 7 (stacked; the shapes files move under each).
**Look-ahead:** thread 9 decides inferred versus handrolled per type; do not re-type anything here. **Size:** one
context.

### 9. `types_ab`

**The Coach:** on A (inferred with prop docs) versus B (handrolled interface, checker as `Z.ZodType<T>`, equality
assertion): "I have no objection to A or B as you choose; the age of DRY is dead because agents don't screw up keeping
things in sync and we can test in any case. The extra type for B costs tokens but it's worthwhile."

*Gloss:* `types-and-checks.md` section 4 lists each exported type that is handrolled beside a checker of the same shape,
and each inferred one whose props want docs. Apply ground rule 6 per type: host-facing contracts (`VaultFriend`,
`LeaseFriend`, `GatingFriend`, the bank options, the DB interfaces, the snapshots, `RequestCleartext`) get the interface
with a doc on each prop, the checker annotated `: Z.ZodType<T>` (annotated, not cast) and the equality assertion; in-repo
bags get `/** */` on each prop in the builder and `Z.infer`. Where a bag with defaults has distinct input and output
shapes, say which the interface describes and why. The `Refusing` wrapper type may need a form that takes an interface:
build the smallest one. The Coach (2026-11-06): the per-type choices need no review of theirs, "it's very easy to switch and
it's going to be awesome either way"; the thread file still lists them. **Levels:** worker `opus`; review `medium`. **Depends
on:** thread 8 (stacked). **Size:** one context; split by file if the list runs past about eight types.

### 10. `kindvals_smush`

**The Coach:** "yes if it's refusalkind it's Refusalkind, RefusalkindVals, etc."

*Gloss:* `RefusalKind` to `Refusalkind`, `refusalKindVals` to `refusalkindVals`, `wayinKindVals`, `gatingKindVals`,
`correctableKindVals` and their types (`WayinKind`, `GatingKind`) likewise, `damagekindVals` already conforming; every
import in the core, its tests, the README and CUSTOMIZATION.md; the adapters and safebyok-old are untouched (they run on
safebyok-old). `RefusalKind` is the public type a host switches over: minor changeset saying the new name. Mechanical,
and wide, so it runs **last**, cut from the top of the line, where nothing else is rewriting those lines. **Levels:**
worker `sonnet`; review `low`. **Depends on:** threads 5 to 9 filed, and #511 merged. **Size:** small.

### 11. `duck_calibration`

**The Coach** (a Coach note, 2026-11-06, flipped to proceed): "*Shapes and duck typing* opens with 'Duck typing is the
design'. It also says a parameter accepts a broader duck where that's harmless. Would you please calibrate that against
our new handroll vs instance vs inferred decision tree?"

*Gloss:* STYLE.md *Shapes and duck typing* only, rewritten to the strength ground rule 6 and threads 6 to 8 support: a
duck for in-repo bags, test fakes and structural worlds; a `Pick` of the class for a world; a `Symbol.for` brand for a DB
across a package boundary and for a host function on its way in; the handrolled interface for host-facing contracts.
Keeps the examples still true. **Levels:** worker `opus`; review `medium`. **Depends on:** nothing (cut from main at
374098121). **Look-ahead:** thread 9 reads the recalibrated section before choosing per type; threads 6 to 8 build what it
describes. **Size:** small.

*Built (PR #525):* the section says duck typing is the design for data; a world is a `Pick` of its class; a shape's type is
`Z.infer` or an interface held to it, by the reader; a DB across the package boundary carries a brand; a host's function is
wrapped once on its way in; stale examples replaced; 94 to 111 lines. **For thread 9:** a checker typed `Z.ZodType<T>`
loses `.pick`/`.extend`/`.shape`, so widen only what the package exports and derive shapes from the un-widened one; the
`Boxlabel` alias the section cites does not exist.
*Review (medium, opus):* `fixed`; three docs fixes (a rewrap; `Z.ZodType<BankOpts>` made an illustration, not a ruling on
one type; the wrap rule's list of host functions made open-ended, `onBadNews` being one too). Left: `Boxlabel` and the
`Z.ZodType<T>` derivation question (thread 9); "never a type literal written out" is a new rule with instances in the code
today (gating.ts:249); `ListingWorld` has no single class and thread 6 keeps it; "world" has two senses (Open Matters).
**Filed** at 781f7e625, as cut, on main.

### 12. `refusalof_removed`

**The Coach** (2026-11-06, on #517's second-review finding that `refusalOf` has no caller): "I'm quite happy to hear that
nobody is using it, remove".

*Gloss:* `refusals/outcome.ts` loses `refusalOf` and its doc block; the module-private `refusalOf` in `helpers/validator.ts`
and the test helper of that name stay; `notes/guarantees.md`'s mention is already rewritten by #517. Not on the public
surface, so an empty changeset unless the entry points reach it. **Levels:** worker `sonnet`; review `low`. **Depends on:**
nothing (cut from main at 374098121). **Size:** tiny.

*Review (low, sonnet):* `clean`; justify green, run unmasked by the reviewer. **Filed** at 255d2c5d7, as cut, on main (PR
#526). Merge with or after #517, which rewrites guarantees.md's one mention of `refusalOf`. *In hindsight:* a two-liner
that should have ridden on thread 7 (ground rule 13).

### 13. `guarantees_models`

**The Coach** (2026-11-06, Open Matters F1, F3, F9, F8, all proceed): F1 and F3 took the Rec; F9 "add"; F8 "this sounds like
someone else left you behind a big overreach: #the-host-is-not-our-threat-model ... What's the interface for key deriver?
Validate that."

*Gloss:* `notes/guarantees.md` plus one test file. Strike every old-core clause thread 2 listed (F1 and the second review's
additions) and write the models' version from the code, citing the current site and test; narrow G8's validator claim to
values and add the values sweep to `tests/helpers/validator.test.ts`; add `crypto.randomUUID` to G10; G10 says where
`checkSuppliedSpecKept` lives and that a host's deriver is checked by its interface only; tidy the second review's
leftovers (open item 2, G9's friend sentence, G8's two leftovers, the seal list widened to `boxListing.create` and
`sealStampedString`); F5's G9 wording once the Coach confirms it. Leaves G8's host-guard sentences to thread 7. **Levels:**
worker `opus`; review `high`. **Depends on:** #517 (merged 05:10; cut from its tip, rebased onto main). **Size:** one context;
split F1 off if the first justify is not reached.

*Built (PR #528):* G1, G2, G4, G6, G9, the secret-values table, the access chains, the minimal path, the IndexedDB bullet,
the files table, open item 1 and the header rewritten from the core; "no counterpart" sentences for `vaultRecordHeldBy`,
a whisper's sizing copy, `mask`, an IndexedDB DeviceDB; the values sweep *every checker a shapes module exports*; G8
narrowed to values; F8 and F9 in G10; the second review's tidies. Deviations: the four safebyok-old rows struck from the
files table (accepted, Cleanup); G8's host-guard sentence lost "(kind only, logged)" since the core logs neither. **For
thread 7:** only `invokeStrengthChecker` reaches `HostErrorSanitizer.refusalFor`; the host-function paragraph still says
all three. Open Matters: no whisper size check in the core; the Argon2id deriver is not exported. Cleanup: a whisper
zeroing test (thread 5); `passkeyAnswer`'s stale doc block.
*Review (high, opus):* `fixed`; every rewritten clause checked against the core, same claim in the core's names; four
fixes (the values sweep now reaches nested, piped and later fields, shown by breaking two checkers; G10's prefix check
scoped to our deriver; G4 names the tombstone; the passphrase chain names four more clears). Left: the guarded-file list
omits `vault.ts`, `deriver/argon2id-webv1.ts` and `passphrase-strength.ts` (Open Matters, TOP); the host-function
paragraph contradicts G8 until thread 7; `ShapeModules` hand-kept and `KX` unlisted (Cleanup). **Filed** at 0b9afd51a, as
cut, on main.
*Amended (adf4ea68b, plain push):* *Where the guarantees are kept* names eleven files, with rows for `models/vault.ts`,
`deriver/argon2id-webv1.ts` and `helpers/passphrase-strength.ts`; CLAUDE.md's *Layout* bullet points at that list instead
of naming files, and drops `types/types.ts`, which is gone. Justify ran to its end (docs only).

### 14. `deviceid_label`

**The Coach** (2026-11-06): "What validation do we apply to device_id? Let's make it `label` and cater to the first
complaint".

*Gloss:* `device_id` passes the `label` checker wherever it is checked (bank options, device record, stored shapes); the
minted id must pass it too (a finding if not); tests updated, the refusal case added; `minor` changeset naming the rule and
"cater to the first complaint". The VOCABULARY sentence the Coach gave is a commit on #518. **Levels:** worker `sonnet`;
review `low`. **Depends on:** nothing (cut from main at 4e63ae760). **Size:** small.

*Built (PR #527):* `device_id` is the kit's `label` in the one checker (shapes-core.ts:37), reaching bank options, the
proving world, both wayins and the device record; `Bank` mints its default as `d` plus the UUID's 32 hex (the
orchestrator's call, an Open Matters row); fixtures renamed; refusal cases and a minted-id test added; minor changeset
saying an old non-label record reads as damaged or absent. *Review (low, sonnet):* `fixed`; two style fixes in
bank.test.ts; left: a bulk list's `[blurb, input]` shape, VOCABULARY's deviceId row not yet saying "a label". **Filed**
at 846f0d285, as cut, on main.

### 15. `list_boxes`

**The Coach** (2026-11-06): "Go ahead Recommendation B -- see my highlighted comments in the tab." In the tab: "No, please"
(on forwarding an other-life world to `fateOver`); "The 'that needs care' is because of the monstrous complexity of
fateOver, which is overpromising and tripping on its own feet. So don't take too much care please. The crossing here is
microscopic in practice, and the thinking pattern described here has led to catastrophe before. A world with a different
vault tok should never reach BoxListing, because it is embedded in every request."

*Gloss:* `listing-responsibilities.md`'s B with the two amendments: `listBoxes(vaultScope + vault_tok)` answers
`{ boxes, damaged_records }` with the vault row as `world`, refusing `vault_mismatch` by `checkedVaultLife` as the box
verbs do; `getVault` the row alone; `getBank` to `listVaults`; `VaultListing.list()`, `BoxListing.list()`, `_takeListed`
gone, `fetchListed`/`vaultRowOf`/`VX.boxesListed` gone; `takeWorld` stays on Vault, parses and receives, its `vault_tok` branch
deleted (the Coach: a mismatched world "would be after BoxListing had been disabled"), no thrower, no forward, no fate
logic; the Coach: "There is no respect in which it's acceptable for any part of the code to get more complex while
performing this refactor, so please halt if it appears so"; VOCABULARY's `getVault` row in its own commit (it meets #518); minor
changeset. **Levels:** worker `opus`; review `high`. **Depends on:** #523 (stacked). **Look-ahead:** thread 6 keeps
`takeWorld` on the `BoxWorld` Pick; thread 8 brands the VaultDB. **Size:** one context.

*Built (PR #530, "Stacked on #523"):* as the gloss, src 13 lines shorter; `listing.ts` and `storable.ts` untouched;
`takeWorld` lost its tok branch; a new `SX.vaultQuery` checker (+2). Deviations for the reviewer: `Refuse.vaultMismatch`
answers `world: null` with the row in `dbhas`; #523's hello parse test removed with the parse; `getBox` after a
`vault_gone` hello answers `disabled` (the vacated listing). Conflicts with #511 in five files, each "take #530's side,
rename `damaged_records` to `damaged_rows`".
*Review (high, opus):* `fixed`; ground rule 14 held (`listing.ts`, `storable.ts` untouched; `takeWorld` deletions only);
decision points down from about four to three; `world: null` on `vault_mismatch` is the smallest change (`deliver` calls
`takeWorld` before it checks `ok`), `dbhas` keeps the row; three fixes (spies' whitespace, two titles, the changeset
telling a host what `vault.hello` now refuses). Left: after a `vault_gone` hello the box verbs refuse `disabled` (new on
the hello path; Open Matters); a reborn vault is not swapped in by hello, the watch heals it (Open Matters, Rec accept);
the two `list()` tails repeat; new exports without doc blocks; `BankListed` to `VaultsListed` later. *Rework:* the
Coach's consistency guard; `Storable.receive` already throws `otherVaultTok` one call down, so a `//` line in `takeWorld`
names it rather than duplicating it. **Filed** at 344b10025 (a plain push on #523's stack; no `file-thread`, its base
being unmerged).

### 16. `utils_mash`

**The Coach** (2026-11-06): "Yes, we're already dispensing similar kindnesses in safebyok/utils, call it `mash`."

*Gloss:* the old core has `safebyok/utils` (`mask`, the b64 codec, `WhisperFieldAttributes`); the new core gets its
`./utils` entry with `mash(text): Promise<string>`, SHA-256 of the text as lowercase hex, checked at entry, tested; the
package.json export, the build entry and a size-budget line; VOCABULARY's deviceId snippet becomes
`user_id: await mash(email)` and a **mash** row is added. Minor changeset. **Levels:** worker `sonnet`; review `low`.
**Depends on:** #518 (stacked, in the Coach's line; plain pushes only). **Size:** small.

### 17. `browser_entry`

**The Coach** (2026-11-06, on the Argon2id deriver not being exported): "It should be being exported under an alternate
export -- did that change when the packages were split? It must not be exported through the front door, as most people
will not want to use it, preferring the wasm one instead."

*Gloss:* the old core's `safebyok/browser` entry (`browserOpts`: `argon2idWebV1Deriver`, `idbDeviceDB`,
`zxcvbnStrengthChecker`) did not come across in the split. The new core gets its `./browser` entry exporting the Argon2id
deriver(s) from `deriver/`, and the strength checker if the new core has one, never from `src/index.ts`; the wiring as
`./utils` got it in thread 16 (package.json exports, tsdown entry); a test that imports the entry and derives once;
`TestDeriverNotice` reworded if it names the import. No `browserOpts` bag unless it ports in a few lines (the IndexedDB
device DB is an adapter package on the old core). Minor changeset. **Levels:** worker `sonnet`; review `low`. **Depends
on:** #529 (stacked; in the line's territory, plain pushes only). **Size:** small.

*Built (PR #531):* `src/browser.ts` exports `argon2idDeriver`, `argon2idWebV1Deriver` and the `KeyDeriver` types, wired
as `./utils`; three tests, one that neither deriver is on the front door; `TestDeriverNotice` names `safebyok/browser`;
no `browserOpts` (no zxcvbn checker in the new core; the IndexedDB device DB is an adapter). The split never had the
deriver on the front door. *Review (low, sonnet):* `fixed`; three fixes (a `lengthOf` assertion; the doc block's reason
moved to a `//`; a two-outcome title split). Left: three refusal phrases still point a host at a `browserOpts()` the new
core lacks (Cleanup, thread 7); the derivers' doc blocks (documentarian). **Filed** at c74195a12, a plain push on #529.

### 18. `deviceid_required`

**The Coach** (2026-11-06): "yes, remove. It's very easy to have the Provider source the string in time and hand it down,
it's very tricky for Bank to do it." (On main minting a default `device_id` and caching a device record where the first id
wins; earlier: "device_id is required. It has to be that way because of timing issues uncaching it.")

*Gloss:* `device_id` required in `bankOpts` (still a `label`); the default mint, `Bank.#cacheDeviceRecord` and its
first-cached-wins step, and the device record itself (`DeviceDB.cacheDeviceRecord`, the `deviceRecord` shape,
`MemoryDeviceDB`'s rows, `_cheat_deviceRows`, their tests and helpers) all go; the DeviceDB keeps leases only; guarantees.md
and VOCABULARY (a plain commit on #518) say so; minor changeset. **Levels:** worker `opus`; review `high`. **Depends on:**
#527 (stacked). **Look-ahead:** the IndexedDB device DB port builds on a leases-only DeviceDB. **Size:** one context.
*Built (PR #532, on #527):* `device_id` required in `bankOpts`, `Bank.device_id` a plain `readonly` prop, no mint;
`#cacheDeviceRecord`, `DeviceDB.cacheDeviceRecord` and its `try`/`do` pair, `DeviceCached`, the `deviceRecord` shape,
`MemoryDeviceDB.#devicerows` and `_cheat_deviceRows` (one `eslint-disable-line` fewer), `deviceRecordRewritten` and the dead
`Phrases.DeviceScopepathShape` all gone; the DeviceDB keeps leases only; minor changeset. No guarantees.md edit (it names
no device record). The VOCABULARY rows (**deviceId**, **device record**, a trim to **deviceDB**) sit in the thread file for
the orchestrator to carry onto #518. Meets #511 in `throwers.ts`, `phrases.ts` and `bank-world.ts` (keep both sides). In
review (`opus`, high).

### 19. `utils_port`

**The Coach** (2026-11-06): "Go ahead with work to also serve the other safebyok/exports from the new codebase; don't
modify the old code of course. Bring anything copied over up to our standards."

*Gloss:* `mask`/`MaskOpts` (its validator as a checker in shapes), `fromB64`/`toB64` (re-export the new core's codec if
it has one) and `WhisperFieldAttributes` into the new core's `safebyok/utils`, with the old tests ported to STYLE; the
**mask** row back into VOCABULARY; minor changeset. The zxcvbn checker with `browserOpts`, and the IndexedDB device DB,
follow in later threads once thread 18 settles the device record. **Levels:** worker `sonnet`; review `medium`. **Depends
on:** #531 (stacked). **Size:** small.

### 20. `kind_promises`

**The Coach** (2026-11-06): "we did a survey and decided when to pin a refusal kind and when not, would you detail a
worker to inventory those promises and strip them out? Just to be clear, if there is a test now that 'when the moon
waxes Gemini, box.foo fails bad_record', the test should remain but without promising the kind. This also does not
intend ripping out code to satisfy a promise. Just remove the words that an agent might take as a contract." And on a
box verb after a `vault_gone` hello: "It doesn't matter what it throws, it's an impossible situation. Remove anything
implying a contract on the refusal kind".

*Gloss:* an inventory file of every stated kind (doc blocks, VOCABULARY, READMEs, guarantees.md listed only, tests),
each marked contract (a host branches on it in normal use) or incidental; then the strips: doc blocks and VOCABULARY say
only that the call refuses, tests keep their behaviour and assert a refusal without the kind (one kind-less matcher in the
helpers if none exists); no `src/` change, no test deleted, `errors.ts`'s kinds and `throwers.ts` untouched; the unsure
list reported. Empty changeset. **Levels:** worker `opus`; review `medium`. **Depends on:** #531 (stacked, for VOCABULARY).
**Size:** one context; split at sixty sites.

## For the Coach

* PRs #511, #513 and #514 gate threads 3 to 10. #505 (draft, rework) and #515 (`box_showing`) are not part of this
  sprint; thread 6 and 7 may meet #515's lines in `box.ts` at the restack.
* Thread 2 will surface claims in guarantees.md the code no longer bears; those are rulings, not edits.
