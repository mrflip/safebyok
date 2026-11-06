# Sprint reform: the plan

**Date:** 2026-11-06. **Mode:** normal. **Issued by:** the Coach, in chat on 2026-11-06, approving the threads the
types-and-checks inventory and the November reform rounds proposed ("agree: clock, then the worlds as Picks, then the
host-function branding; the VOCABULARY sweep; the guarantees pass for G8's stale names; boxListing.hello's listed argument
going internal; the pointer pass for fourteen kept examples; a stale isVaultError example"; "Launch the first pass reform of
the checkers+types when it's convenient, and go ahead on the others"; "yes if it's refusalkind it's Refusalkind,
RefusalkindVals, etc.").

**Default levels:** review `medium`; worker and reviewer on their agents' own model and effort; style pass on
`style-reviewer`'s pin. **Threads at once:** 3.

**Status:** 2026-11-06, later: thread 1 (#518) filed; thread 2 (#517) reworked, in its second review; thread 3 (#522)
ready and in review; thread 4 building, stacked on #513 (the Coach: proceed without the merges where possible); threads 5 to 10 wait for PRs #511 and #513 to
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

### 4. `hello_listed`

**The Coach:** "boxListing.hello's listed argument going internal".

*Gloss:* `vault.hello` parses the listing it fetched and hands it to `boxListing.hello(listed)`, which parses it again
because `hello` is a public method on a class the README names. Take `listed` off the public signature: `hello()` takes
nothing, and the listing receives the boxes by a non-public path (a `#`-private or a method the vault listing calls with
a name that says it is not for hosts). Then the second parse goes. The test "refuses a boxListing.hello given a list that
fails its check" goes with the argument, or moves to the vault's hello. Minor changeset: a public signature changed.
**Levels:** worker `sonnet`; review `low`. **Depends on:** #513 merged; cut stacked on #513's tip instead (the Coach,
2026-11-06: "Proceed as well you can without it"). **Size:** small.

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

## For the Coach

* PRs #511, #513 and #514 gate threads 3 to 10. #505 (draft, rework) and #515 (`box_showing`) are not part of this
  sprint; thread 6 and 7 may meet #515's lines in `box.ts` at the restack.
* Thread 2 will surface claims in guarantees.md the code no longer bears; those are rulings, not edits.
