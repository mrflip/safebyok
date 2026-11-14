# Sprint reform: resolutions

The Coach's rulings on the sprint's Open Matters, swept from the sprint doc at the end, newest batch first.

## 2026-11-06 (sweep at wrap-up)

### Rulings

- **Whisper examples kept.** #514 kept the `Whisper` type's two literals and `whisper`'s examples 1 and 2, which since
  #499 show what `Record<string, any>` hides and a bare string refused with its remedy; Rec: keep them. Coach: "Is this
  just saying 'I thought there were two useless @examples but they're actually OK, let's keep them'? if so lgtm"
  (proceed, 2026-11-06). Raised on #514; nothing to do, the ruling noted on #514.
- **Two parses of one lease record.** `Lease`'s constructor parses the record `buildGranted` just built; STYLE's
  constructor rule keeps the first and the second mints a brand; Rec: leave both unless a private constructor is not an
  entry point. Coach: "even if a private constructor counts as a private method the cope rule and boundary rules both
  apply" (proceed, 2026-11-06). Raised on #513; both parses stay, the ruling noted on #513.
- **Types A or B per export.** Thread 9 chooses inferred or a handrolled interface per type by ground rule 6; Rec: no
  ruling needed now, the thread file lists each choice for review. Coach: "No need for review, it's very easy to switch
  and it's going to be awesome either way" (proceed, 2026-11-06). Raised in the plan; thread 9's gloss now says its
  choices need no Coach review.
- **VOCABULARY describes the new core alone.** The old design's members moved whole to notes/old_vocabulary.md, though
  safebyok-old, the adapters and the demo still use them. Rec: keep it that way. Coach: (empty: took the Rec).
  2026-11-06, raised on #518. Nothing to do; #518 stands.
- **Rows renamed for core members.** lockState, timely, proved_at, autolockMinutes and fmt: each is the core's name.
  Rec: keep them. Coach: (empty: took the Rec). 2026-11-06, raised on #518. Nothing to do.
- **mask and the change bell.** Listed in old_vocabulary.md as "none yet". Rec: leave them there until the core has
  them. Coach: (empty: took the Rec). 2026-11-06, raised on #518. Nothing to do.
- **"ask" as a verb.** VOCABULARY bans "proof, ask" but its gloss replaces nouns only; the verb appears about eight
  times. Rec: narrow the ban line to "ask, as a noun". Coach: "yes". 2026-11-06, raised by #518's review. A commit on
  #518 narrows the line; the ruling is in #518's body.
- **G2's test citation.** G2 cites tests/wayin.test.ts, which the core lacks; the rework left it verbatim as finding
  F12. Rec: cite proving.test.ts's case, or port the old test. Coach: "make it be well tested and refer to that. I think
  there's an overstrong always/never in the subagent's instructions somewhere -- either I don't understand, or this has
  an obvious answer." 2026-11-06, raised on #517 (F12). A worker adds or finds the core test and cites it on #517; the
  plan's rule for thread 2 is softened: a stale test citation gets its test, only a behaviour claim the code no longer
  bears is a finding.
- **Coach note: calibrate *Shapes and duck typing*.** "*Shapes and duck typing* opens with 'Duck typing is the design'.
  It also says a parameter accepts a broader duck where that's harmless. Would you please calibrate that against our new
  handroll vs instance vs inferred decision tree?" 2026-11-06. A thread of its own, 11 `duck_calibration` (STYLE.md
  only, cut from main), ahead of thread 9, which then follows the recalibrated section.
- **refusalOf's fate.** refusals/outcome.ts exports refusalOf, whose doc block calls it "the one catch that ends a
  throwing form", yet nothing calls it: the try* forms use outcomeOf, and the throwing forms let a WebCrypto
  DOMException reach the host raw, as G8 now says. Rec: delete it in thread 7. Coach: "I'm quite happy to hear that
  nobody is using it, remove". 2026-11-06, raised by #517's second review. A thread of its own, 12 `refusalof_removed`,
  cut from main; the ruling is on #517's body.
- **TOP Old-core clauses in guarantees.md (F1).** G1, G2, G4, G6, G9, the secret-values table, the access chains, the
  minimal-path paragraph and open item 1 name sites that live only in safebyok-old. Rec: a follow-up thread strikes them
  and writes the models' versions from the code. Coach: (empty: took the Rec). 2026-11-06, raised on #517. Thread 13
  `guarantees_models`, stacked on #517.
- **Host guards and refusalFor (F2).** Only the strength checker's throw goes through refusalFor today. Rec: rewrite
  after thread 7 wraps all three once in Bank's constructor. Coach: (empty: took the Rec). 2026-11-06, raised on #517.
  Thread 7's gloss already says so.
- **TOP Validator sweep test, G8 (F3).** The sweep exists only in safebyok-old and the claim is false as written for
  keys. Rec: narrow G8 to values, add a values sweep to the core's validator.test.ts, cite it. Coach: (empty: took the
  Rec). 2026-11-06, raised on #517. Thread 13.
- **Where the supplied-label check lives (F8).** checkSuppliedSpecKept is reached only through argon2idDeriver, so a
  host's own deriver under a supplied label is not checked. Rec: say where it lives, and decide whether a host's own
  deriver should be checked too. Coach: "this sounds like someone else left you behind a big overreach:
  #the-host-is-not-our-threat-model. if they want to choose stupid parameters or _.identity they'll figure out a way to
  do so. What's the interface for key deriver? Validate that." 2026-11-06, raised on #517. Thread 7 validates the key
  deriver's interface and nothing about its parameters; thread 13 says where the check lives; the tag is a ground rule.
- **Randomness in G10 (F9).** randomId uses crypto.randomUUID, which G10 does not list. Rec: add it. Coach: "add".
  2026-11-06, raised on #517. Thread 13.
- **TOP The deviceId privacy sentence.** Rec: confirm the wording with a clause for a host-given device_id, or give the
  one you want. Coach: "replace the phrasing: 'The device_id and user_id are provided in the options. If those contain
  sensitive data please <40 characters or less code snippet>'. What validation do we apply to device_id? Let's make it
  `label` and cater to the first complaint". 2026-11-06, raised on #518. A commit on #518 for the sentence; thread 14
  `deviceid_label` for the validation.
- **_takeListed as the name.** Rec: keep one method and name it adoptListed. Coach: "> vault row that
  VaultListing.fetchListed fetches. no, that should fetch vaults, but not try to get every vault complete with every
  box. I thought we'd beaten that back, and had vaultDB calls to list vaults (returning { vaults}}) and boxes (returning
  { boxes } and maybe some vault props spread on it, but world is where the vault is updated from). Could I ask you
  (orchestrator) to reflect on the class relationships and recommend what calls, function names, and responsibilities
  each of the facilities involved should be?" 2026-11-06, raised on #523. The orchestrator's recommendation goes to a
  tab of this doc and whiteboard/20261106-reform/listing-responsibilities.md; the rename waits on it.
- **"world" has two senses.** Rec: a VOCABULARY line for the listing's sense under the same word. Coach: "world is as
  listing has it: bank for vaults, vault for boxes". 2026-11-06, raised by #525's review. A commit on #518 puts the line
  in VOCABULARY.
- **Coach note: brand as a getter.** "For the branding -- an instance variable (readonly modelkind = 'bank') will
  serialize; may we use a getter instead?" 2026-11-06. Yes: a ground rule for threads 7 and 8; the brand is a getter (or
  a `Symbol.for`-keyed getter), never an own enumerable field.
- **Coach note: a closer look.** "would you do a closer look? (see your sprint skill)" 2026-11-06. Done per
  `.claude/skills/sprint/closer-look.md`; the result is in chat and the sprint docs.
- **Coach note: the refusalOf two-liner.** "I thought we were talking about a two-liner because nobody was using it --
  you mentioned a thread." 2026-11-06. Agreed: ground rule 13 (a two-liner rides as a directive on the thread in those
  files) and a memory; #526 stands as filed.
- **Coach note: listing responsibilities.** "Go ahead Recommendation B -- see my highlighted comments in the tab." In
  the tab: "No, please" (on forwarding an other-life world to fateOver); "The 'that needs care' is because of the
  monstrous complexity of fateOver, which is overpromising and tripping on its own feet. So don't take too much care
  please. The crossing here is microscopic in practice, and the thinking pattern described here has led to catastrophe
  before. A world with a different vault tok should never reach BoxListing, because it is embedded in every request.";
  "should this method [takeWorld] be on boxListing; would that help with the other life problem?" 2026-11-06. Thread 15
  `list_boxes`, cut from #523's tip, builds B with no forward and no fate logic; the takeWorld answer is in the tab
  under *Triage and answers*.
- **A hash helper for hosts.** Rec: export it from the main entry, or birth a `./utils` entry. Coach (chat and a Coach
  note): "Yes, we're already dispensing similar kindnesses in safebyok/utils, call it `mash`." 2026-11-06, raised on
  #518. The old core has `safebyok/utils` (`mask`, `WhisperFieldAttributes`); the new core gets its `./utils` entry with
  `mash` in thread 16 `utils_mash`, stacked on #518, whose VOCABULARY snippet becomes `user_id: await mash(email)`.
- **TOP A deleted vault's Vault object.** The kept slot costs about 45 lines; the listing never revives an object;
  takeWorld could through reconcileCentral. Rec: no change now; a subtraction-only thread later if wanted. Coach:
  "vault's reconcileCentral should refuse a live row over a tombstone -- it should also never get there, as its .enabled
  getter should be serving false if it's a tombstone. do not make any changes here, it is much too complex to be
  analyzed, most of it is not necessary. Its own complexity is inviting agents to add complexity." 2026-11-06, raised by
  #518's review. No change; ground rule 14; the VOCABULARY wording stands.
- **Underbar methods and entry validation.** Only the `_cheat_` methods exist, all justified; `_takeListed` is the odd
  one out. Rec: no STYLE sentence yet. Coach: "> ignored bindings (_scope, _hear, _held, _record, _foreign). what are
  those? carry on, otherwise". 2026-11-06, raised by #523's review. Answer: parameter names a function must accept but
  does not read (a hook's `_scope`, a listener's `_hear`), prefixed so the lint knows they are ignored on purpose; not
  members. Carrying on: no STYLE sentence; `_takeListed` goes with thread 15.
- **Coach note: a consistency guard in takeWorld.** On "takeWorld just parses and receives, its vault_tok branch goes,
  and the disabled guard is the only guard": "Add a consistency guard here to assuage agents". 2026-11-06. A rework
  directive to thread 15 after its review: one line in `Vault.takeWorld` that demands the row's `vault_tok` is this
  vault's, throwing a package-bug refusal; nothing else.
- **Coach note: "halt if anything grows" restated.** "This is a bit overstated: obviously if an agent moves a method
  from one file to another it will grow. Halt if anything grows: branch logic to handle edge cases, new and non-trivial
  methods not implied in the brief." 2026-11-06. Ground rule 14's halt clause now reads so.
- **No whisper size check in the core.** Rec: leave it out and keep the sentence saying there is none. Coach: "don;t
  check whisper size just box size". 2026-11-06, raised on #528. The code already does that: the vaultDB refuses
  `box_too_large` when a box record is over `maxRecordBytes` (vault-db-new.ts:178) and `vault_full` by `capacity`; no
  whisper check. Nothing to build; the stale phrases `whisperTooLarge` and `noRoomForBox` (helpers/phrases.ts, naming
  `maxWhisperBytes` and `maxVaultBytes`, options the core lacks) go with thread 5 if unused (Cleanup).
- **The Argon2id deriver is not exported.** Rec: export the deriver a host plugs in, with a test. Coach: "It should be
  being exported under an alternate export -- did that change when the packages were split? It must not be exported
  through the front door, as most people will not want to use it, preferring the wasm one instead". 2026-11-06, raised
  on #528. Yes: the old core exports `safebyok/browser` (`browserOpts` with `argon2idWebV1Deriver`, `idbDeviceDB`,
  `zxcvbnStrengthChecker`); the split left the new core without it. Thread 17 `browser_entry`, stacked on #529, births
  the new core's `./browser` with the deriver, never the front door.
- **Box's route to the lease (F5).** Box holds no lease and no key; a module-private route would add no security
  property. Rec: G9 says a Box never holds a lease or a key and reaches the vault's seal pair, which takes and returns
  text and ciphertext only. Coach: "sounds good, thanks for explaining". 2026-11-06, raised on #517. Thread 13 (#528)
  restated G9; verified on its branch.
- **TOP device_id: required, minted, or cached?** Main defaults it and caches a device record where the first id wins.
  Rec: confirm that the default, the first-cached-wins step and the device record all go, with device_id required.
  Coach: "yes, remove. It's very easy to have the Provider source the string in time and hand it down, it's very tricky
  for Bank to do it." 2026-11-06, raised on #527. Thread 18 `deviceid_required`, stacked on #527.
- **TOP The guarded-file list.** Three more files touch a secret. Rec: add them and keep "every line". Coach: "Yes keep
  the absolute claim, and report each of the files. Is it necessary to name all of them in CLAUDE.md?" 2026-11-06,
  raised on #528. A commit on #528 adds the rows; CLAUDE.md names the list once by pointer to the note's section instead
  of repeating it (my answer to the question: no).
- **Box verbs after a vault_gone hello refuse disabled** (and the Coach note on it). Coach: "It doesn't matter what it
  throws, it's an impossible situation. Remove anything implying a contract on the refusal kind". 2026-11-06, raised on
  #530. Thread 20 `kind_promises` strips the kind from VOCABULARY's vault row and wherever else an impossible situation
  promises one.
- **Coach note: serve the other safebyok/ exports.** "Go ahead with work to also serve the other safebyok/exports from
  the new codebase; don't modify the old code of course. Bring anything copied over up to our standards". 2026-11-06.
  Thread 19 `utils_port` (mask, the b64 codec, WhisperFieldAttributes into safebyok/utils) now; the zxcvbn checker with
  browserOpts and the IndexedDB device DB after thread 18 settles the device record.
- **Coach note: strip refusal-kind promises.** "we did a survey and decided when to pin a refusal kind and when not,
  would you detail a worker to inventory those promises and strip them out? Just to be clear, if there is a test now
  that 'when the moon waxes Gemini, box.foo fails bad_record', the test should remain but without promising the kind.
  This also does not intend ripping out code to satisfy a promise. Just remove the words that an agent m[ight take as a
  contract]". 2026-11-06. Thread 20 `kind_promises`, cut from the top of the sprint's line stack.
- **Refusal-kind promises** (Coach note, proceed, 2026-11-06): "we did a survey and decided when to pin a refusal kind
  and when not, would you detail a worker to inventory those promises and strip them out? Just to be clear, if there is
  a test now that 'when the moon waxes Geminii, box.foo fails `bad_record`', the test should remain but without
  promising the kind. This also does not intend ripping out code to satisfy a promise. Just remove the words that an
  agent might die trying to live up to." Became thread 20 `kind_promises`: the inventory and the VOCABULARY and
  CUSTOMIZATION strips on #533; the doc-block and test strips proposed as three follow-on threads (Open Matters).
- **hello under a vault reborn elsewhere** (proceed, 2026-11-06 09:30): vault.hello on a vault made anew on another
  device refuses vault_mismatch; the old Vault object stays until the vault listing's watch delivers the rebirth. Rec:
  accept. Coach: (empty: took the Rec). Raised on #530 (review). Nothing to build; the behaviour stands as merged.
- **TOP kind_promises is three more threads** (proceed, 2026-11-06 09:30): the inventory's 32 doc-block sites and ~569
  test sites, proposed as three threads. Coach: "these seem like much smaller threads than I've seen other orchestrators
  run, are three warranted? -- #earnest-question. proceed with the shape and number your good sense dictates". Raised by
  thread 20 (#533). Went to two threads cut from main beside thread 6: 21 `kind_docblocks` (the src doc-block sites,
  with the bad-news logic report) and 22 `kind_tests` (the optional-kind matcher, then every test site), the second with
  a split hatch by directory.
- **Bad-news kinds stay promised** (proceed, 2026-11-06 09:30): damaged_box, damaged_lease, damaged_row and newer_format
  stay contract. Coach: "report on any that have complicated logic (more than a try-catch-throw)". Raised by thread 20.
  Kept; the report rides on thread 21's thread file.
- **Three kinds the inventory left unsure** (proceed, 2026-11-06 09:30): already_asking, locked_while_asking, vault_gone
  outside the deleted-vault case. Coach: "strip all three". Raised by thread 20. Threads 21 and 22 strip them.
- **Definitional kinds stay** (proceed, 2026-11-06 09:30): where the kind is the subject of the code, the word stays.
  Coach: (empty: took the Rec). Raised by thread 20. Threads 21 and 22 keep them as the inventory marks them.
- **deviceId's privacy line is now advice** (proceed, 2026-11-06 09:30): keep the sentence in VOCABULARY's deviceId row,
  worded as advice. Coach: (empty: took the Rec). Raised by thread 18 (#532). Landed on #534's VOCABULARY commit,
  merged.
- **A raw UUID is not a label** (proceed, 2026-11-06 09:30): crypto.randomUUID() is refused by the label rule; Rec was
  to document it and export no minter. Coach: "a uuid is probably a better choice". Raised on #532 (review). Read as:
  device_id is a UUID, not a label; a directive to thread 7, which is in bankOpts and Bank's constructor (the check, the
  test worlds' ids, the deviceId row, a minor changeset).
- **Two bad-news throw sites do more than try-catch-throw** (proceed, 2026-11-06 10:05): `unreadableRowOf`'s second
  parse to choose `newer_format` over `damaged_row`, and `Lease.#vaultKey`'s lock and evict before `damaged_lease`. Rec:
  leave both. Coach: "thanks! agree, leave them". Raised by thread 21 (#548). Nothing to build.
- **TOP No device store in the published surface** (proceed, 2026-11-06 12:05): neither entry exports `DeviceDB` or
  `MemoryDeviceDB`, so a host cannot build the `deviceDB` that `Bank.make` requires. Rec: a thread that exports them
  from the main entry. Coach: "yes thanks". Raised by thread 7 (#552). Went to thread 9 as a directive (it is already in
  `src/index.ts` exporting types), with leave to spill into 9b.
- **CUSTOMIZATION.md lost its zxcvbn section** (proceed, 2026-11-06 12:05): thread 7 removed "The one safebyok ships",
  since the new core ships no checker. Rec: accept; the later zxcvbn-checker thread restores it. Coach: (empty: took the
  Rec). Raised by thread 7 (#552). Nothing to build.
- **A host deriver's load() that throws a VaultError is relabelled** (proceed, 2026-11-06 12:05): `keyDeriverLoadFailed`
  and `strengthCheckerLoadFailed` turn any throw into `unexpected_error` with the throw as cause. Rec was parity now.
  Coach: "yeah pass a vaultError as it is". Raised on #552 (review). Went to thread 9 as a directive: both load guards
  rethrow a `VaultError` unchanged, anything else still `unexpected_error` with cause; guarantees and changeset follow.

### Orchestrator's calls

- `boxListing.hello`'s second parse of the listing: keep it until the argument goes internal (lands in thread 4)
- Threads 6 and 7 may meet #515 (`box_showing`) in `box.ts`: restack at the end and rerun `pnpm size:budget --write`
  there (lands in wrap-up)
- G8 names refusalOf as the catch that ends the Lease and Box throwing forms; it has no caller (#517, F4): name
  outcomeOf instead (lands in a commit on #517 after its review)
- G9 says Lease and Proving are exported; index.ts exports neither (#517, F6): say "exports neither" (lands in a commit
  on #517 after its review)
- Open item 2 says the models are not yet exported; index.ts exports them (#517, F7): strike "not yet exported" (lands
  in a commit on #517 after its review)
- The ctx row says "for a wayin its format"; no wayin field is a format (#517, F10): drop the clause (lands in a commit
  on #517 after its review)
- #511's G8 sentence no longer counts the cipher step of Lease.sealWith as caught (#517, F11): correct the sentence in
  #511 first: the seal path has no outcomeOf (putBox, box.put and putExposed throw a DOMException raw; only the try*
  forms wrap it), then carry the same text into #517 (lands in #511, then a commit on #517 after its review)
- Thread 13 struck the four safebyok-old rows from the guarantees' files table and restated the count, beyond the
  host-function lines thread 7 owns (#528): accept: name fixes only; thread 7 rebases over it (lands in #528)
- KX (deriver/shapes.ts) is not in STYLE.md's Imports alias table, and the file sits outside src/shapes/ (#528): add the
  row; the file stays where the deriver is (lands in thread 8)
- The guarantees' files table lists deriver/argon2id-webv1.ts as a core file that hears the passphrase, while the
  host-function paragraph lists keyDeriver.deriveKeyBytes as a host function (#528, amend): both are true, since a host
  may plug in its own deriver; leave as is (lands in #528)
- VOCABULARY's mask row, back from the old vocabulary, keeps redact as its Standard term (#534): keep redact; it is the
  word the outside world uses for the same thing (lands in #534)
- #518's deviceId row tells a host to hash a sensitive device_id or user_id with sha256Hex; a 64-hex digest exceeds the
  40-character label and may start with a digit (#532, review): limit the hashing example to user_id when thread 18's
  rows are carried onto #518 (lands in a plain push on #518)
- #527's changeset says the core mints a d + hex device_id; #532's, in the same release, says it mints none (#532,
  review): drop the minting sentence from #527's changeset (lands in a plain push on #527, with the #518 rows)
- mask and mash refuse a non-string argument as bad_option, the option-bag kind, since the core has no kind for a bad
  primary argument (#534, review): leave it; both change together if the catalog ever gains such a kind (lands in
  nowhere now)
- STYLE.md's shapes-namespace table has no UX row for shapes/shapes-utils.ts, which the code now imports as UX (#534,
  review): add the row (lands in a plain push on #534, with the other two-liners)
- safebyok/testing publishes _cheat_clock and _cheat_clockReset, the only public path to the clock backdoor (#535):
  keep; the loud names mark them, and a host's test suite needs them as ours does (lands in #535)
- The clock is reset once after every test by a vitest setupFiles hook, not by each helper's teardown (#535): keep the
  one global reset; a helper that forgets cannot leak a frozen clock into the next file (lands in #535)
- buildLease hands the raw friend on to Lease.buildGranted, which parses it again; a getter that changed its answer
  between reads could pass the consistency check (#535, review): leave it: the friend comes only from
  Vault.#leaseFriend(), internal code, and the host is not our threat model (lands in nowhere)
- helpers/validator.test.ts: the inventory marked 106 sites strip; thread 22 kept the file whole as definitional (a
  validator throws the kind it is made with), stripping only its guards' own refusals (#549): keep it whole; the kind is
  the subject there, which is the definitional rule you accepted (lands in #549, as built)
- Under BoxWorld = Pick<Vault, ...>, the models-world fake's demandUnlocked and ensureTimely must answer a Vault, so the
  plain-object fake returns world as unknown as Vault; nothing reads that answer (#550): keep the cast in the test
  helper; hand-writing the member as unknown would cost cmd-click on it, which you asked for (lands in #550, as built;
  the reviewer judges it too)
- The two-worlds clock directive offered share-one-now or build-the-models-world-first; thread 6 instead dropped the
  models world from sealWorld() and makeVaultWithBox(), which used nothing of it (#550): accept; the smaller change, and
  the only one that works in vault-life, where the vault is a promise (lands in #550, db09eb17c)
- checkSuppliedSpecKept (helpers/basederiver.ts) stays or goes under the host-is-not-our-threat-model rule (#552):
  stays: it checks only our own argon2id_web_ labels inside our own factory, never a host's deriver (lands in #552, as
  built)
- The worlds still check the logger by loggerShape, where the wraps are checked by their IsGuarded brand (#552): replace
  loggerShape in the worlds with the logger's WeakSet brand (lands in thread 8, a directive)
- The VaultDB and DeviceDB brand getters carry eslint-disable-line @typescript-eslint/class-literal-property-style: the
  lint wants a readonly field, which would serialize (#553): keep both disables; a brand is a getter by your ruling, and
  the two are reported here, in the PR and in chat (lands in #553, as built)
- A host's Infinity for autolockMinutes or a refresh horizon is kept inside as ForeverMillis, so bank.autolockMinutes
  reads back a large finite number, not Infinity (#553): keep; STYLE says nothing is infinite past the entrypoint, and
  the changeset states the read-back (lands in #553, as built; the reviewer checks ForeverMillis against the autolock
  arithmetic)
- The deviceDB's dated lease (a lease query plus proved_at) is named LeaseDated, so LeaseSparse names only the lease's
  sparse shape; VOCABULARY had no name for it (#553): keep LeaseDated and let thread 9, which types the shapes, add the
  VOCABULARY row if the name survives it (lands in #553; a VOCABULARY row with thread 9)
- Thread 8's changeset is minor though no export was renamed: a host sees the Infinity read-back and refusal messages
  that now end in a period (#553): keep minor; ground rule 7's examples were not exhaustive, and a visible change is
  what minor is for (lands in #553, as built)
- listing.put now takes SX.putOpts, a plain obj that strips an unknown field where the deleted VX.putListingOpts
  (objCheck, strict) refused it; every caller is internal and passes a literal (#553, review): leave; an internal call
  with a literal cannot misspell a field unnoticed, and a second strict checker would be the duplicate thread 8 removed
  (lands in #553, as built)
- Thread 9 kept each (B) checker un-widened, with the interface held equal by a compile-time assertion, rather than
  annotating the checker Z.ZodType<T> as the gloss said; widening loses .shape and .extend (#557): keep; the assertion
  binds both ways and the gloss's point was the interface, not the annotation (lands in #557, as built)
- LeaseFriend, GatingFriend and ProvingWorld stay inferred (A) with prop docs, though the gloss listed the friends among
  host contracts; only the models pass them to each other (#557): keep; a host never implements a friend, and you said
  the choice is easy to switch (lands in #557, as built)
- With one definition of the record forms, the sparse box and vault forms refuse bad_option where shapes-vaultish had
  relabelled them bad_record; listing.build(dna) changed with them (#557): keep; the kind is incidental there and the
  duplicate was the thing to remove (lands in #557, as built)
- Thread 9's changeset says listing.build now refuses bad_option for a sparse record that fails its check, but
  buildOrReceive does so on every path in (refresh, list, watch) (#557, review): leave the changeset; a row reaching the
  listing has passed the vaultDB's own checks, and the kind is incidental there (lands in #557, as built)
