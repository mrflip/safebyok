# Refusal kinds in the core: who throws them, and do they earn them

## Rules

The Coach's rules, copied from `refusal-kinds-plan.md`, which also holds the plan the recommendations below come from.

* **A kind earns its place** one of three ways: the core or a host routes on it; it gives a material head start in
  debugging (this is a package bug for sure; the vault was not tombstoned but *disappeared*; a consistency check that should
  be impossible failed); or it groups throwers that tell one story. Guessing whether a strict object check means a box was
  passed where a vault should be is no head start.
* **The stronger rule is "don't make me read"**: turning one kind into a finer guess has to be worth the reading it costs.
* **Throwers everywhere, no inlined messages.** Every throw site uses a thrower from `refusals/throwers.ts`, with a phrase
  from `helpers/phrases.ts`, so the refusals are auditable and reviewable in one place. No strong pressure to reuse one: make
  a thrower, add the phrase; a later pass merges.
* **The names agree.** The thrower's name, its refusal kind and its phrase's property name agree; the phrase text is of a
  piece with the kind (mirrors, contains or elides its words); all of them read naturally at the call site.
* **Callers pass what they have on hand** and trust the thrower to sanitize and cherry-pick (an allow-list tool for that,
  bulletproofed by try/catch, is a later pass).
* **No "error" or "refusal" in a thrower's name**, and no namespace pollution; at a loss, append `issue`. The name is
  empathetic and frank to the person who trusted us with their data, and readable to the coder. Templated phrases encouraged.
* **Each thrower will carry a `refusal_label` matching its name**, the kind being the tag that groups them (a wrapped checker
  can do this from the key in its return bag). Later pass: not this one.
* **Later passes**, not this one: story metadata; the `outcomeOf` audit (where it wraps a body then unwinds with `valOf`, a
  try/catch is plainer); a gallant pass on the phrases and the labels; `bank.doctor()`.

## What was counted

The core is `packages/safebyok/src/`, the new design, with `tests/test-helpers*`. Counted on
2026-11-05 at `b7bacb68`, with the TypeScript checker resolving each call to its declaration, so
a thrower imported under `Refuse.` counts the same as one imported by name.

The kinds table's `Calls` cell reads `total: explicit/parses:declared (t:tests)`. The total is
explicit sites plus validator parses. What each part counts:

* **Explicit sites**: a call of a factory from `refusals/throwers.ts`, an inline `new VaultError`,
  a `verifyConsistent` or `parseConsistent` call, and a `HostErrorSanitizer.refusalFor`. Three
  factories are passed rather than called (`wrongPassphrase`, `wrongPasskey`, `damagedLease`), and
  count where they are passed. The generic machinery (`validator.ts:224`, `:261`,
  `host-error-sanitizer.ts:28`) takes its kind from its caller and is left out. The test-helper
  sites are listed in section 2 but not counted here.
* **Validator parses**: each `.parse(...)` of a validator made in a `Checkers`, `Checker` or
  `objCheck` call, attributed to the kind that call declared. After the colon, the validators
  declared with that kind. A validator nested inside another refuses with the outer one's kind.
* **Test assertions** (`t:`): an `expectRefusal`, `expectBad`, `expectSyncRefusal` or `isVaultError`
  naming the kind, or a `refusalkind: '...'` property, in `tests/` outside the helpers.
* **Routed** (the old *branched on* column; a verdict opens with `routed:` where it applies): a
  caller in `src/` that tests the kind, or a host doc (README, CUSTOMIZATION) that tells the host
  to handle it. `vault-db-new.ts:41` copies every kind into an answer's `act` and is not counted.

Not counted as sites: the 38 `outcomeOf(thunk)` calls in `src/` with no second argument. Each
turns any foreign throw into `unexpected_error`, through its default `unexpectedError`.

## 1. The kinds

53 kinds. 17 have no site in the core at all.

The `👪` column is the family: 🧨 for `misuse` and `bad_news`, ⚠️ for `condition`. Swap the assignment here if it reads wrong.

Each verdict opens with the plan's recommendation in bold, then the plan's note, then `routed:` where something routes
on the kind, then the old verdict as it was, then the Coach's comment after ` // `. The rows run in triage order, one
sub-table per group, each under a one-line heading: unsure, big tents, merges and renames, culls, and kept as earned.
Within a group the rows run by calls, most first; the big tents run in a fixed order.

**Unsure (4)**: the plan leaves these untouched; they wait on the Coach.

| kind | 👪 | Calls | verdict |
| --- | --- | --- | --- |
| locked_while_asking | ⚠️ | 1: 1/0:0 (t:6) | **unsure**. Untouched. unsure: to the UI it reads as declined |
| already_asking | ⚠️ | 1: 1/0:0 (t:3) | **unsure**. Untouched. unsure: one dialog at a time; nobody branches |
| gating_landed | ⚠️ | 1: 1/0:0 (t:3) | **unsure**. Untouched. unsure: a UI bug guard, like attempt_in_flight |
| attempt_in_flight | ⚠️ | 1: 1/0:0 (t:1) | **unsure**. Untouched. unsure: a UI bug guard; could share a kind with gating_landed |

**Big tents (7)**: the catch-alls and the merge targets with the most calls.

| kind | 👪 | Calls | verdict |
| --- | --- | --- | --- |
| bad_option | 🧨 | 78: 21/57:67 (t:155) | **keep**. The misuse catch-all, on the way in. Gains invalid_input, bad_record on the way in, `proofMissing` and `noProofToUnlock`; gives five package-bug guards to unexpected_error. routed: CUSTOMIZATION names it. earned as the misuse catch-all: the kind the relabels collapse into |
| unexpected_error | 🧨 | 14: 14/0:6 (t:41) | **keep**. The package-bug kind. Gains five guards from bad_option; gives `otherVaultTok` and `otherVaultTokAtBirth` to vault_remade, `putAnsweredNothing` to record_conflict, `proofMissing` to bad_option. The 38 `outcomeOf` defaults are untouched, audited later. routed: CUSTOMIZATION names it. mitzvah: 38 outcomeOf defaults and the host-function catches (G1, G8). But 7 sites are package-bug guards // we should triage the mystery-meat ones to see whether it's truly a bitbucket |
| bad_record | 🧨 | 26: 3/23:43 (t:49) | **merge → bad_option or damaged_row, by direction**. A record the caller handed in is bad_option; a record storage answered is damaged_row; `#demandRecordOfScope` goes to record_conflict. Report a site that cannot be decided without a branch. hairsplitting: 12 refusingAs lines relabel invalid_input schemas to it; two sites mean corrupt_record. // would like to distinguish bad-on-the-way-in and damaged-on-the-way-out |
| invalid_input | 🧨 | 22: 1/21:31 (t:3) | **merge → bad_option**. Except a VaultDB parse of what the adapter answered, which is damaged_row: report a validator serving both directions. hairsplitting: VaultDB's own name for bad_option // agree if it's the metadata |
| bad_scope | 🧨 | 9: 3/6:6 (t:40) | **keep**. As the kind of a `parseConsistent` consistency failure. A plain shape failure at bad_scope becomes bad_option: report the list. hairsplitting: misuse, nobody branches; the message names the field. bad_option serves |
| record_conflict | ⚠️ | 4: 4/0:0 (t:13) | **keep**. The home of the impossible. Gains corrupt_record, `putAnsweredNothing` and `#demandRecordOfScope`. unsure: nobody branches; "fetch again once" is stale_write's remedy // the way this either costs, or pays, its weight it this: we have "impossible" errors, like asking for the record with id "x" and it having id "y", but more subtle. Agents will kvell absent a check of that. Any check of that needs a refusal. grouping those neuroses may help. |
| gate_issue | 🧨 | 4: 4/0:0 (t:0) | **keep**. VaultDB's integrity checks on a gate change. Report which of its four sites are parameter validation. hairsplitting: VaultDB gate params, an invalid_input by another name // vaultdb is (or should be, TODO) doing extra integrity checks (gate epoch increments by one, others). for certain adapters deployed to a back end (anything behind graphQL, convex) this is a gain |

**Merges and renames (5)**: each folds into, or becomes, the kind named.

| kind | 👪 | Calls | verdict |
| --- | --- | --- | --- |
| damaged_record | 🧨 | 3: 3/0:0 (t:6) | **rename → damaged_row**. On the way out. mitzvah: a row read from storage fails its checks; bad news // rename damaged_row |
| storage_error | ⚠️ | 1: 1/0:0 (t:5) | **merge → storage_unavailable**. One store failure, one kind: VaultDB's `adapted` and DeviceDB's agree. mitzvah, but a twin of storage_unavailable: collapse |
| vault_mismatch | ⚠️ | 1: 1/0:0 (t:2) | **merge → vault_remade**. "A live vault stands here under another vault_tok" is the remade story. unsure: same remedy, word for word, as vault_empty |
| unknown_key_deriver | 🧨 | 1: 1/0:0 (t:1) | **merge → newer_format**. unsure: same remedy as newer_format ("update safebyok") // yes |
| corrupt_record | 🧨 | 0: 0/0:0 (t:1) | **merge → record_conflict**. No site; the plan also counts it among the culls. unsure: no site in core, though its own definition fits listing.ts:171 and :326 |

**Culls (14)**: no site in the core.

| kind | 👪 | Calls | verdict |
| --- | --- | --- | --- |
| storage_blocked | ⚠️ | 0: 0/0:0 (t:3) | **cull**. No site in the core. dead in core: no site |
| crypto_failed | ⚠️ | 0: 0/0:0 (t:1) | **cull**. No site in the core. The `bank.doctor()` idea is noted for later. dead in core: WebCrypto failures land as wrong_*, damaged_* or unexpected_error // I have the idea for a bank.doctor() function that will exercise the late-accessed functions (and perform other checks) |
| bad_whisper | 🧨 | 0: 0/0:2 (t:0) | **cull**. No site in the core. hairsplitting, and dead: its two validators are only nested inside bad_option ones, so never thrown |
| damaged_vault | 🧨 | 0: 0/0:0 (t:0) | **cull**. No site in the core. dead in core: damaged_record replaced it |
| damaged_wayin | 🧨 | 0: 0/0:0 (t:0) | **cull**. No site in the core. dead in core: no site |
| gate_made_elsewhere | ⚠️ | 0: 0/0:0 (t:0) | **cull**. No site in the core; safebyok-react re-adds it when it moves. unsure: no site in core; safebyok-react names it, on the old design |
| gate_moved | ⚠️ | 0: 0/0:0 (t:0) | **cull**. No site in the core. dead in core: no site |
| invalid_box | 🧨 | 0: 0/0:0 (t:0) | **cull**. No site in the core. dead in core: no site (old design) |
| no_whisper | ⚠️ | 0: 0/0:0 (t:0) | **cull**. No site in the core. dead in core: no site |
| not_permitted | ⚠️ | 0: 0/0:0 (t:0) | **cull**. No site in the core; the convex adapter re-adds it when it moves. unsure: no site in core; the convex adapter throws it |
| passkey_unavailable | ⚠️ | 0: 0/0:0 (t:0) | **cull**. No site in the core; safebyok-react re-adds it when it moves. unsure: no site in core; safebyok-react throws it |
| passphrase_required | 🧨 | 0: 0/0:0 (t:0) | **cull**. No site in the core. dead in core: no site |
| vault_behind | 🧨 | 0: 0/0:0 (t:0) | **cull**. No site in the core. dead in core: no site |
| whisper_too_large | ⚠️ | 0: 0/0:0 (t:0) | **cull**. No site in the core. dead in core: no site |

**Kept as earned (23)**: routed on, a head start in debugging, or one story told by several throwers.

| kind | 👪 | Calls | verdict |
| --- | --- | --- | --- |
| stale_write | ⚠️ | 6: 6/0:0 (t:37) | **keep**. Gives `delOfOtherLife` to vault_remade. earned: read again and retry. delOfOtherLife borrows it for a remade vault |
| absent_box | ⚠️ | 6: 6/0:0 (t:19) | **keep**. earned: the user asked for a box that is not there. Four throwers in models, one in VaultDB |
| vault_locked | ⚠️ | 4: 4/0:0 (t:49) | **keep**. Gives `noProofToUnlock` to bad_option. earned: the host answers it with ensureUnlocked. Four throwers for one refusal, one misfiled (noProofToUnlock) |
| vault_gone | ⚠️ | 4: 4/0:0 (t:19) | **keep**. earned: the vault was deleted; the user is told |
| camped | ⚠️ | 3: 3/0:0 (t:8) | **keep**. earned: the caller asked ifPresent 'fail' and must hear it |
| wrong_passkey | ⚠️ | 3: 3/0:0 (t:1) | **keep**. routed: gating.ts:218 (correctable). earned: correctable. Three throwers, two of them (otherPasskey, otherPrfSalt) caught before the unwrap |
| vault_empty | ⚠️ | 3: 3/0:0 (t:0) | **keep**. unsure: same remedy as vault_mismatch // earned, if the vault was there and now no row is that's impossible |
| disabled | 🧨 | 2: 2/0:0 (t:40) | **keep**. earned: "ask the bank for the vault again" is its own next step; nobody branches |
| declined | ⚠️ | 2: 2/0:0 (t:10) | **keep**. earned: the UI must tell a cancel from a failure |
| storage_unavailable | ⚠️ | 2: 2/0:0 (t:9) | **keep**. Gains storage_error. mitzvah: DeviceDB wraps its store's throw, keeping only the name |
| damaged_box | 🧨 | 2: 2/0:0 (t:7) | **keep**. earned: bad news; the user removes the box |
| damaged_lease | 🧨 | 2: 2/0:0 (t:5) | **keep**. earned and a mitzvah: wraps the unwrap failure; "unlock again" |
| wrong_passphrase | ⚠️ | 1: 1/0:0 (t:14) | **keep**. routed: gating.ts:218 (correctable). earned: the gating keeps the prompt open on it. Also a mitzvah: wraps the WebCrypto unwrap failure |
| absent_wayin | ⚠️ | 1: 1/0:0 (t:5) | **keep**. earned: "unlock with the passphrase" is a different next step |
| weak_passphrase | ⚠️ | 1: 1/0:0 (t:3) | **keep**. routed: gating.ts:218 (correctable); README, CUSTOMIZATION. earned: the gating keeps the prompt open; the reason is the user's message |
| same_passphrase | ⚠️ | 1: 1/0:0 (t:1) | **keep**. routed: gating.ts:218 (correctable). earned: correctable |
| vault_full | ⚠️ | 1: 1/0:0 (t:1) | **keep**. earned: the user must free a slot |
| absent_vault | ⚠️ | 1: 1/0:0 (t:0) | **keep**. earned: tells fetch from ensureVault |
| box_too_large | ⚠️ | 1: 1/0:0 (t:0) | **keep**. earned: the user must shrink the box |
| insecure_context | 🧨 | 1: 1/0:0 (t:0) | **keep**. It means the page is not a secure context, so WebCrypto's `subtle` is absent; not broken libraries. unsure: misuse, nobody branches; the message carries the remedy // does this mean "your libraries are broken"? |
| newer_format | 🧨 | 1: 1/0:0 (t:0) | **keep**. Gains unknown_key_deriver. mitzvah: a stored row this version cannot read; "update safebyok" |
| identity_revoked | 🧨 | 0: 0/0:0 (t:5) | **keep**. The core branches on it. routed: bank.ts:258, listing.ts:312. earned: two branches, but core never throws it; adapters do |
| vault_remade | ⚠️ | 0: 0/0:0 (t:0) | **keep**. And gets used: gains vault_mismatch, `delOfOtherLife`, `otherVaultTok` and `otherVaultTokAtBirth`. dead in core, though otherVaultTok and delOfOtherLife describe it |

I wish I had something less computery than 'invalid' 'malformed' or 'error' (overloaded) and less judgemental than 'bad' or 'corrupt' and less horrifying than 'damaged', 'bad', 'broken', 'inconsistent', 'insane' and less don't-ask-me-I-just-work-here than 'unexpected'. faulty?

## 2. The throw sites

One row per explicit site; paths under `src/` drop the prefix. The rows form a tree. They are grouped by
`refusal_kind`, the kind the site throws once the plan lands; then by `refusal_label`, the thrower's name; then by site.
The kind groups run in the kinds table's order, and each heading counts its sites and labels. `(inline)` marks a site
with no thrower. Its recommendation names the thrower to make, or says the plan leaves it. "Not thrown here" marks a
factory whose refusal is handed on: to `tellBadNews`, to a gating's end, or returned for a caller to throw.

`recommendation` is the plan's: a re-kind, a new thrower, or `as is`. `message → phrases.ts` marks a thrower whose
message is still a literal in throwers.ts. `report:` marks what the plan says to report, not adjust. "Converge" carries
the old column's text where the recommendation does not already say it, and drops a bare "agree". The old *phrase*
column is gone; the throwers keep it.

**locked_while_asking**: 1 site, 1 label.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| models/gating.ts:140 | Gating.declineAtDiscard | locked_while_asking | `lockedWhileAsking` (not thrown here) | as is. Converge: thrower `lockedWhileAsking`, function `declineAtDiscard`: discard or lock, pick one |

**already_asking**: 1 site, 1 label.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| models/vault-listing.ts:122 | VaultListing.holdGating | already_asking | `alreadyAsking` | as is |

**gating_landed**: 1 site, 1 label.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| models/gating.ts:112 | Gating.#refusalOfAttempt | gating_landed | `gatingSettled` (not thrown here) | as is. Converge: three names: settled, landed, GatingSettled. Kind toward `gating_settled`, or thrower toward `gatingLanded` |

**attempt_in_flight**: 1 site, 1 label.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| models/gating.ts:113 | Gating.#refusalOfAttempt | attempt_in_flight | `attemptInFlight` (not thrown here) | as is |

**bad_option**: 21 sites, 16 labels.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| models/box-listing.ts:42 | BoxListing.recordOf | bad_option | (inline) | re-kind → bad_option, in the `boxRecord` relabel: `Listing.put` hands it the caller's record, the way in. report: `boxRecord` also parses the package's own build at box.ts:187. Converge: same as vault-listing.ts:55, which says otherScope |
| models/box.ts:129 | Box.demandPuttable | bad_option | (inline) | as is: refusal options to a consistency check, which the plan leaves |
| models/vault-listing.ts:55 | VaultListing.recordOf | bad_option | (inline) | re-kind → bad_option, in the `vaultRecord` relabel: `Listing.put` hands it the caller's record, the way in |
| models/vault.ts:83 | Vault.launchBirth | bad_option | `alreadyHeldError` | as is. Converge: drop the `Error` suffix |
| models/bank.ts:293 | Bank.#demandReady | bad_option | `helloFirst` | as is. Converge: three words for one state: ready, hello first, hello. `#demandHelloed` or phrase `BankNotReady` |
| models/vault.ts:186 | Vault.unlock | bad_option | `noProofToUnlock` | re-kind → bad_option: the same missing `requestCleartext` that `noRequestCleartext` refuses one call later |
| models/gating.ts:75 | Gating.launch | bad_option | `noRequestCleartext` | as is. Converge: agree; vault.ts:186 refuses the same lack first, as vault_locked |
| models/proving.ts:70 | Proving.checkStrength | bad_option | `notAVerdict` | as is. Converge: agree; twin at passphrase-strength.ts:88 |
| models/proving.ts:222 | passphraseKeyOf | bad_option | `notKeyBytes` | as is |
| models/proving.ts:225 | passphraseKeyOf | bad_option | `notKeyBytes` | as is |
| models/storable.ts:334 | Storable.demandFull | bad_option | `partialLoadError` | as is. Converge: three words: full, whole, partial. Thrower and phrase toward the guard: `notFull`, `Phrases.NotFull` |
| models/storable.ts:336 | Storable.demandWhole | bad_option | `partialLoadError` | as is. Converge: as :334; `demandWhole` and `demandFull` throw the same |
| models/storable.ts:341 | Storable.demandFullProps | bad_option | `partialLoadError` | as is. Converge: as :334 |
| models/gate.ts:60 | Gate.demandPasskeyAddable | bad_option | `passkeyHeldAlready` | as is |
| models/gating.ts:176 | unlock_vault | bad_option | `proofMissing` | re-kind → bad_option: a host attempt holding neither proof is the host's misuse |
| models/box.ts:130 | Box.demandPuttable | bad_option | `recordForNewBox` | as is. Converge: thrower and phrase agree (the Coach's example). The guard name is the rule (STYLE). The check relates patch and opts: a `.refine` on one parse |
| deriver/basederiver.ts:28 | checkSuppliedSpecKept | bad_option | `reservedLabel` | as is. Converge: thrower toward phrase: `reservedDeriverLabel` |
| deriver/basederiver.ts:37 | checkSaltFits | bad_option | `saltDoesNotFit` | as is |
| storage/vault-db-new.ts:402 | demandNextSeq | bad_option | `seqNotNext` | re-kind → bad_option, in `seqNotNext`; message → phrases.ts |
| helpers/passphrase-strength.ts:88 | check | bad_option | `strengthCheckerMisanswered` | as is; message → phrases.ts. Converge: dead twin of proving.ts:70: `strengthCheckerMisanswered` and `notAVerdict`, one phrase twice |
| deriver/basederiver.ts:33 | checkSuppliedSpecKept | bad_option | `suppliedSpecChanged` | as is. Converge: agree (kept / changed) |

**unexpected_error**: 15 sites, 12 labels.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| helpers/passphrase-strength.ts:85 | check | unexpected_error | (inline) | thrower: `strengthCheckerThrew`, as at proving.ts:201; its message is that phrase's story. Converge: dead twin of proving.ts:201 (guardStrengthChecker has no src caller): delete |
| models/proving.ts:78 | Proving.buildWayin | unexpected_error | (inline) | re-kind → unexpected_error, in the consistency check's refusal options: a package-bug guard |
| models/proving.ts:86 | Proving.buildLease | unexpected_error | (inline) | re-kind → unexpected_error, in the consistency check's refusal options: a package-bug guard |
| models/vault.ts:396 | Vault.#demandLease | unexpected_error | (inline) | re-kind → unexpected_error, in the consistency check's refusal options: a package-bug guard |
| models/gating.ts:214 | checkedClears | unexpected_error | `clearsThrew` (not thrown here) | as is |
| models/proving.ts:209 | deriveKeyBytes | unexpected_error | `keyDeriverThrew` | as is |
| models/vault.ts:79 | Vault.launchBirth | unexpected_error | `listingExpected` | re-kind → unexpected_error: a package-bug guard |
| models/gating.ts:87 | Gating.#askHost | unexpected_error | `requestCleartextThrew` (not thrown here) | as is |
| models/storable.ts:215 | Storable.reconcileCentral | unexpected_error | `shapeUnreconciled` | as is |
| helpers/passphrase-strength.ts:104 | loadStrengthChecker | unexpected_error | `strengthCheckerLoadFailed` | as is; message → phrases.ts. Converge: agree; reached only through guardStrengthChecker |
| models/proving.ts:201 | invokeStrengthChecker | unexpected_error | `strengthCheckerThrew` | as is |
| helpers/crypto.ts:76 | cipherCtx | unexpected_error | `unboundCipherCtx` | re-kind → unexpected_error: a package-bug guard; message → phrases.ts |
| refusals/outcome.ts:81 | refusalOf | unexpected_error | `unexpectedError` (not thrown here) | as is; message → phrases.ts |
| models/proving.ts:76 | Proving.buildWayin | unexpected_error | `wayinMadeAlready` | as is |
| models/proving.ts:107 | Proving.#demandWayin | unexpected_error | `wayinNotMadeYet` | as is |

**bad_scope**: 3 sites, 1 label.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| models/bank.ts:115 | Bank.vaultScopeOf | bad_scope | (inline) | as is: refusal options to a consistency check, which the plan leaves. report: its inner `vaultBag.parse` is a plain shape failure at bad_scope |
| models/box-listing.ts:38 | BoxListing.scopeOf | bad_scope | (inline) | as is: refusal options to a consistency check, which the plan leaves. Converge: same check as vault-listing.ts:51, which says Phrases.otherScope; this one says the default |
| models/vault-listing.ts:51 | VaultListing.scopeOf | bad_scope | (inline) | as is: refusal options to a consistency check, which the plan leaves |

**record_conflict**: 6 sites, 5 labels.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| models/listing.ts:326 | Listing.#demandRecordOfScope | record_conflict | (inline) | new thrower `recordOfOtherScope` (phrase `RecordOfOtherScope`), kind record_conflict |
| models/storable.ts:205 | Storable.reconcileCentral | record_conflict | `oneRevisionTwoFates` | as is |
| models/storable.ts:206 | Storable.reconcileCentral | record_conflict | `oneRevisionTwoFates` | as is |
| models/storable.ts:201 | Storable.reconcileCentral | record_conflict | `oneRevisionTwoLives` | as is |
| models/storable.ts:18 | cmpRevisions | record_conflict | `oneRevisionTwoToks` | as is |
| models/listing.ts:171 | Listing.put | record_conflict | `putAnsweredNothing` | re-kind → record_conflict: storage answered nothing to a put |

**gate_issue**: 4 sites, 1 label.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| storage/vault-db-new.ts:203 | VaultDB.replacePassphrase | gate_issue | `gateIssue` | as is; message → phrases.ts. report: parameter validation (the caller handed a wayin the verb does not take), not an integrity check |
| storage/vault-db-new.ts:216 | VaultDB.addPasskey | gate_issue | `gateIssue` | as is; message → phrases.ts. report: parameter validation (the caller handed a wayin the verb does not take), not an integrity check |
| storage/vault-db-new.ts:230 | VaultDB.revokePasskey | gate_issue | `gateIssue` | as is; message → phrases.ts. report: parameter validation (the caller handed a wayin the verb does not take), not an integrity check |
| storage/vault-db-new.ts:243 | VaultDB.#moveGate | gate_issue | `gateIssue` | as is; message → phrases.ts. An integrity check: `registered_at` is not the stored one |

**damaged_row** (was damaged_record): 3 sites, 3 labels.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| storage/vault-db-new.ts:368 | unreadableRowOf | damaged_row | `damagedRecord` (not thrown here) | re-kind → damaged_row (the rename); message → phrases.ts |
| models/bank.ts:155 | Bank.#cacheDeviceRecord | damaged_row | `deviceRecordRewritten` (not thrown here) | re-kind → damaged_row (the rename) |
| models/vault-listing.ts:69 | VaultListing.fetchBank | damaged_row | `vaultStoredDamaged` (not thrown here) | re-kind → damaged_row (the rename) |

**stale_write**: 6 sites, 2 labels.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| storage/vault-db-new.ts:176 | VaultDB.putBox | stale_write | `staleWrite` | as is; message → phrases.ts |
| storage/vault-db-new.ts:192 | VaultDB.#landVault | stale_write | `staleWrite` | as is; message → phrases.ts |
| storage/vault-db-new.ts:242 | VaultDB.#moveGate | stale_write | `staleWrite` | as is; message → phrases.ts |
| storage/vault-db-new.ts:270 | VaultDB.delBox | stale_write | `staleWrite` | as is; message → phrases.ts |
| storage/vault-db-new.ts:290 | VaultDB.delVault | stale_write | `staleWrite` | as is; message → phrases.ts |
| tests/test-helpers/models-world.ts:375 | staleWriteOf | stale_write | `staleWrite` (not thrown here) | as is; message → phrases.ts |

**absent_box**: 6 sites, 5 labels.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| storage/vault-db-new.ts:136 | VaultDB.getBox | absent_box | `absentBox` | as is; message → phrases.ts. report: it branches on `dbhas` to choose `meta.act` |
| storage/vault-db-new.ts:174 | VaultDB.putBox | absent_box | `absentBox` | as is; message → phrases.ts. report: it branches on `dbhas` to choose `meta.act` |
| models/box.ts:141 | Box.demandPresent | absent_box | `absentBoxError` | as is. Converge: two factories for absent_box (`absentBoxError`, `absentBox`): one |
| models/box-listing.ts:115 | BoxListing.nothingStoredError | absent_box | `absentBoxError` (not thrown here) | as is. Converge: factory toward VaultDB's `absentBox`; drop the `Error` suffix |
| models/vault.ts:375 | Vault.tryDelDamagedBox | absent_box | `absentDamagedBoxError` | as is. Converge: phrase says "no damaged box listed", thrown for a healthy box too; agree enough |
| models/box-listing.ts:86 | BoxListing.puttable | absent_box | `notListedBoxError` | as is |

**vault_locked**: 5 sites, 4 labels.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| tests/test-helpers/models-world.ts:301 | demandFakeUnlocked | vault_locked | (inline) | thrower: `Refuse.unlockFirst` |
| tests/test-helpers/models-world.ts:309 | demandUnlocked | vault_locked | (inline) | thrower: `Refuse.lockedError` |
| models/lease.ts:190 | Lease.#demandRecord | vault_locked | `leaseNotInForce` | as is. Converge: function toward thrower: `#demandInForce` (the getter is `isInForce`) |
| models/storable.ts:327 | Storable.demandUnlocked | vault_locked | `lockedError` | as is. Converge: four names: `lockedError`/VaultLocked here, `unlockFirst`/UnlockFirst at vault.ts:397, one phrase nearly verbatim. One `vaultLocked()` |
| models/vault.ts:397 | Vault.#demandLease | vault_locked | `unlockFirst` | as is. Converge: as storable.ts:327 |

**vault_gone**: 4 sites, 3 labels.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| models/vault.ts:411 | Vault.demandPresent | vault_gone | `deletedVaultError` | as is. Converge: thrower toward VaultDB's `vaultGone`: two factories for vault_gone |
| storage/vault-db-new.ts:118 | VaultDB.getVault | vault_gone | `vaultGone` | as is; message → phrases.ts |
| storage/vault-db-new.ts:397 | checkedVaultLife | vault_gone | `vaultGone` | as is; message → phrases.ts |
| storage/vault-db-new.ts:190 | VaultDB.#landVault | vault_gone | `vaultGone` (not thrown here) | as is; message → phrases.ts |

**camped**: 3 sites, 1 label.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| storage/vault-db-new.ts:171 | VaultDB.putBox | camped | `camped` | as is; message → phrases.ts |
| storage/vault-db-new.ts:187 | VaultDB.#landVault | camped | `camped` | as is; message → phrases.ts |
| storage/vault-db-new.ts:217 | VaultDB.addPasskey | camped | `camped` | as is; message → phrases.ts |

**wrong_passkey**: 3 sites, 3 labels.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| models/proving.ts:165 | PasskeyProving.buildStored | wrong_passkey | `otherPasskey` | as is |
| models/proving.ts:166 | PasskeyProving.buildStored | wrong_passkey | `otherPrfSalt` | as is |
| models/proving.ts:169 | PasskeyProving.buildStored | wrong_passkey | `wrongPasskey` (passed) | as is |

**vault_empty**: 3 sites, 2 labels.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| storage/vault-db-new.ts:114 | VaultDB.getVault | vault_empty | `vaultEmpty` | as is; message → phrases.ts |
| storage/vault-db-new.ts:396 | checkedVaultLife | vault_empty | `vaultEmpty` | as is; message → phrases.ts |
| storage/vault-db-new.ts:190 | VaultDB.#landVault | vault_empty | `vaultEmpty` (not thrown here) | as is; message → phrases.ts |

**disabled**: 2 sites, 1 label.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| models/listing.ts:320 | Listing.demandEnabled | disabled | `disabledError` | as is. Converge: three names: enabled, disabled, let go. Phrase toward kind: `Phrases.Disabled`; thrower `disabled()` // don't camp the namespace, call it `boxBecameDisabled` |
| models/storable.ts:332 | Storable.#demandInstanceEnabled | disabled | `disabledError` | as is. Converge: as listing.ts:320 |

**declined**: 2 sites, 1 label.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| models/gating.ts:85 | Gating.#askHost | declined | `gatingDeclined` (not thrown here) | as is |
| models/gating.ts:132 | Gating.decline | declined | `gatingDeclined` (not thrown here) | as is |

**storage_unavailable**: 3 sites, 3 labels.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| storage/vault-db-new.ts:365 | adapted | storage_unavailable | `storageError` (not thrown here) | re-kind → storage_unavailable, in `storageError`; message → phrases.ts. Converge: kind toward storage_unavailable, through `storageTroubleOf`; drop storage_error |
| refusals/outcome.ts:63 | storageTroubleOf | storage_unavailable | `storageUnavailable` (not thrown here) | as is; its default message `StorageTroubleMessage` → phrases.ts. Converge: `storageTroubleOf`: its doc says every VaultDB verb uses it; none in src does (see vault-db-new.ts:365) |
| storage/device-db-new.ts:87 | adapted | storage_unavailable | `storeFailed` (not thrown here) | as is; message → phrases.ts, templated. report: it branches on the thrown name to choose the phrase's tail. Converge: `storeFailed` here, `storageError` at vault-db-new.ts:365, `storageUnavailable` in outcome.ts: one failure, three throwers, two kinds |

**damaged_box**: 3 sites, 3 labels.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| tests/test-helpers/models-world.ts:320 | unsealStampedString | damaged_box | (inline) | thrower: `Refuse.unopenedWhisper` |
| models/box.ts:87 | Box.#unseal | damaged_box | `undecodedWhisper` | as is. Converge: thrower and phrase agree; `undecoded` vs lease.ts's `unopened`, both damaged_box |
| models/lease.ts:159 | Lease.#opened | damaged_box | `unopenedWhisper` | as is. Converge: `unopenedWhisper` vs box.ts:87 `undecodedWhisper`: fine, two failures |

**damaged_lease**: 2 sites, 2 labels.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| models/lease.ts:66 | Lease.buildFromCache | damaged_lease | `damagedLease` (not thrown here) | as is |
| models/lease.ts:172 | Lease.#vaultKey | damaged_lease | `damagedLease` (passed) | as is |

**wrong_passphrase**: 1 site, 1 label.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| models/proving.ts:143 | PassphraseProving.buildStored | wrong_passphrase | `wrongPassphrase` (passed) | as is |

**absent_wayin**: 1 site, 1 label.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| models/proving.ts:163 | PasskeyProving.buildStored | absent_wayin | `noPasskeyWayin` | as is. Converge: thrower toward kind: `absentWayin` |

**weak_passphrase**: 1 site, 1 label.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| models/proving.ts:130 | PassphraseProving.buildNovel | weak_passphrase | `weakPassphrase` | as is |

**same_passphrase**: 1 site, 1 label.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| models/gating.ts:181 | replace_passphrase | same_passphrase | `samePassphrase` | as is |

**vault_full**: 1 site, 1 label.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| storage/memory-vault-db.ts:75 | MemoryVaultDB.#demandRoom | vault_full | `vaultFull` | as is; message → phrases.ts |

**absent_vault**: 1 site, 1 label.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| models/vault-listing.ts:172 | VaultListing.nothingStoredError | absent_vault | `absentVaultError` (not thrown here) | as is. Converge: drop the `Error` suffix: `absentVault` |

**box_too_large**: 1 site, 1 label.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| storage/vault-db-new.ts:165 | VaultDB.putBox | box_too_large | `boxTooLarge` | as is; message → phrases.ts |

**insecure_context**: 1 site, 1 label.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| models/bank.ts:309 | checkSecureContext | insecure_context | `insecureContext` | as is |

**newer_format**: 2 sites, 2 labels.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| storage/vault-db-new.ts:368 | unreadableRowOf | newer_format | `newerFormat` (not thrown here) | as is; message → phrases.ts |
| models/proving.ts:140 | PassphraseProving.buildStored | newer_format | `unknownKeyDeriver` | re-kind → newer_format: same remedy, "update safebyok" |

**vault_remade**: 4 sites, 4 labels.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| models/vault-listing.ts:113 | VaultListing.del | vault_remade | `delOfOtherLife` | re-kind → vault_remade: "deleted and made anew". Converge: kind toward phrase: "deleted and made anew" is vault_remade, not stale_write unless it requires hard work |
| models/storable.ts:198 | Storable.reconcileCentral | vault_remade | `otherVaultTok` | re-kind → vault_remade: "deleted and made anew". Converge: kind toward phrase: "deleted and made anew" is vault_remade; or record_conflict like :201-:206 record conflict |
| models/listing.ts:253 | Listing.#makeThingOf | vault_remade | `otherVaultTokAtBirth` | re-kind → vault_remade: "deleted and made anew". Converge: twin of storable.ts:198 `otherVaultTok`: one factory |
| storage/vault-db-new.ts:395 | checkedVaultLife | vault_remade | `vaultMismatch` | re-kind → vault_remade, in `vaultMismatch`; message → phrases.ts |

**(the test's choice)**: 1 site, 1 label.

| site | method name | refusal_kind | refusal_label | recommendation |
| --- | --- | --- | --- | --- |
| tests/test-helpers/bank-world.ts:45 | RefusingVaultDB.#demandAnswering | (the test's choice) | (inline) | report: the kind is the test's to choose, and no thrower takes one |

### The validator kinds

107 validator parses in `src/` fell under six kinds. None is branched on. Under the plan's targets they fall under four:
`bad_option`, `damaged_row`, `bad_scope` and `unexpected_error`. The kind changes in a validator's declaration, not at
its parse sites.

| kind | parses | validators declared | where |
| --- | --- | --- | --- |
| bad_option | 57 | 67 | host options and arguments across models; `gating.ts:212` is generic over the clears checkers |
| bad_option or damaged_row, by direction (was bad_record) | 23 | 43 | lease, wayin, gate and box records; 12 of the 43 are `refusingAs('bad_record')` relabels. report: direction, from a quick read. On the way in: `boxRecord` and `vaultRecord` in `Listing.put` (`box-listing.ts:42`, `vault-listing.ts:55`). On the way out: `vaultRow` at `vault.ts:309`, a box answer's world. The package's own build: `boxRecord` at `box.ts:187`, the wayin records at `vault.ts:112` and `:127`. Not told without reading the callers: `boxSparse` at `box.ts:84` and `:184` |
| bad_option (was invalid_input) | 21 | 31 | every VaultDB verb's arguments (`shapes-storage.ts`). report: `SX.boxSparse` at `vault-db-new.ts:388` parses what the adapter answered, the way out, after `SX.boxRow` passed it |
| bad_scope | 6 | 6 | scopes and bags (`shapes-core.ts`), `leaseQuery`. report: all six are plain shape parses, which the plan sends to bad_option: `passphrase-strength.ts:75`, `proving.ts:129`, `bank.ts:89`, `bank.ts:115` (inside the consistency check), `device-db-new.ts:29` and `:39` |
| bad_option (was bad_whisper, culled) | 0 | 2 | `whisper`, `whisperBag`, only ever nested inside `sidecar` and `boxPatch` (bad_option) |
| unexpected_error | 0 | 6 | `recordShape`, `age`, `centralPolicy`, `reconciled`, `settled`, `lockState`: none parsed directly |

The relabels: `shapes-vaultish.ts:34`-`38` (`am`, `revision`, `times`, `vaulted`, `sparseBase`),
`:240`-`241` (`boxRecord`, `boxSparse`), `:338`-`340` (`vaultRecord`, `vaultSparse`, `vaultRow`),
`shapes-gateish.ts:36`-`37` (`passphraseWayinRecord`, `passkeyWayinRecord`). Each takes an
`invalid_input` schema from `shapes-storage.ts` and changes only its kind. A scope has three:
`CX.vaultScope` refuses bad_scope, `SX.vaultScope` invalid_input, and `leaseQuery` bad_scope again.

## 3. Findings

* **Five kinds do work a caller can see.** `gating.ts:218` keeps the prompt open on the four
  `correctableKindVals`: `wrong_passphrase`, `wrong_passkey`, `weak_passphrase`, `same_passphrase`.
  `bank.ts:258` and `listing.ts:312` act on `identity_revoked`, which the core never throws (the
  adapters do). Nothing else in `src/` branches on a kind, and the README branches on none.
  Beyond those, kinds are told apart only by tests and by the family they sit in.
* **17 of 53 kinds have no site in the core.** `damaged_vault`, `damaged_wayin`, `invalid_box`,
  `corrupt_record`, `crypto_failed`, `vault_behind`, `vault_remade`, `gate_moved`, `no_whisper`,
  `passphrase_required`, `whisper_too_large`, `storage_blocked` belong to the old design or to
  nothing. `gate_made_elsewhere`, `passkey_unavailable`, `not_permitted` and `identity_revoked`
  are thrown by `safebyok-react` and the adapters, which still run on `safebyok-old`.
  `bad_whisper` is declared on two validators but never thrown: both are nested inside bad_option
  validators, and the outer kind wins.
* **The Coach's hunch is right about validation.** The misuse refusals made by validation spread
  over `bad_option` (57 parses, 21 explicit sites), `bad_record` (23, 3), `invalid_input` (21, 1),
  `bad_scope` (6, 3) and `gate_issue` (0, 4). No caller branches on any of them, all share the
  misuse family, and each message already names the failing field in `meta.fieldnames`. The 12
  `refusingAs('bad_record')` lines exist only to change a kind. Collapse `invalid_input`,
  `gate_issue`, `bad_scope` and `bad_record` into `bad_option`, keeping `corrupt_record` apart for
  what an adapter answers wrongly (next bullets).
* **The mitzvahs are real, and two of them disagree.** `outcomeOf`'s default (38 calls), the
  host-function catches (`keyDeriverThrew`, `strengthCheckerThrew`, `requestCleartextThrew`,
  `clearsThrew`, which keep the passphrase out under G1 and G8), `unreadableRowOf`'s
  `damaged_record` and `newer_format`, and the unwrap failures that become `wrong_passphrase`,
  `wrong_passkey` and `damaged_lease` all replace a foreign error with ours. But a store's throw
  is `storage_error` in VaultDB's `adapted` (`vault-db-new.ts:365`) and `storage_unavailable` in
  DeviceDB's (`device-db-new.ts:87`). `storageTroubleOf` in `outcome.ts` says it is "the line
  every VaultDB verb applies", and nothing in `src/` calls it. Converge on `storage_unavailable`
  through `storageTroubleOf`, and drop `storage_error`.
  * // audit the outcomeOf sites for where they  are wrapping a function body that is then unwound with valOf -- it's meant to be a one-liner around a throwing function, and in select cases, but it has often been used where try-catch is plainer
* **Five sites throw a kind their own phrase contradicts.** `delOfOtherLife` (`vault-listing.ts:113`) is
  `stale_write`, and its phrase says the vault was "deleted and made anew": `vault_remade`, a kind
  with no site. `otherVaultTok` (`storable.ts:198`) and its twin `otherVaultTokAtBirth`
  (`listing.ts:253`) are `unexpected_error` with the same story. `putAnsweredNothing`
  (`listing.ts:171`, `unexpected_error`) and `#demandRecordOfScope` (`listing.ts:326`,
  `bad_record`) both blame the storage adapter, which errors.ts defines as `corrupt_record`. // fix these
* **One lack, two kinds, on one path.** `Vault.unlock` refuses a bank with no `requestCleartext`
  as `vault_locked` (`noProofToUnlock`, `vault.ts:186`); `Gating.launch`, which it calls next,
  refuses the same lack as `bad_option` (`noRequestCleartext`, `gating.ts:75`). The first is
  redundant. And `proofMissing` (`gating.ts:176`) calls a host attempt that holds neither proof
  `unexpected_error`, where it is `bad_option`// fix these.
* **Package-bug guards split across two kinds.** `bad_option` at `vault.ts:79`, `vault.ts:396`,
  `proving.ts:78`, `proving.ts:86` and `crypto.ts:76`, whose phrases say "a bug in the package"
  or come from internal callers; `unexpected_error` at `proving.ts:76` and `:107` and
  `storable.ts:215` for the same sort of guard. errors.ts defines a bug as `unexpected_error`:
  move the five. // do they pass the "head start" test?
* **Names to converge.** `vault_locked` has `lockedError` with `VaultLocked` and `unlockFirst` with
  `UnlockFirst`, two phrases nearly word for word: one `vaultLocked()`. `partialLoadError` and
  `PartialLoad` guard `demandFull`, `demandWhole` and `demandFullProps`: full, whole and partial
  for one idea. `disabledError` says `LetGoInstance` from `demandEnabled`. `vault_gone` has
  `deletedVaultError` and `vaultGone`; `absent_box` has `absentBoxError` and `absentBox`. Nine
  factories carry an `Error` suffix and 66 do not. The kind `gating_landed` is thrown by
  `gatingSettled` with `GatingSettled`.
* **Dead twins.** `guardStrengthChecker` (`passphrase-strength.ts`) has no caller in `src/`, only
  tests. Its throwers duplicate `proving.ts`: an inline `refusalFor` against
  `strengthCheckerThrew`, and `strengthCheckerMisanswered` against `notAVerdict`, one phrase twice.
* **Where the hunch needs care.** The VaultDB kinds (`vault_empty`, `vault_mismatch`, `vault_gone`,
  `stale_write`, `camped`) are not relabels: each reports what the stored row shows, and the
  adapter contract tests them. Still, `Listing.deliver` rethrows them all alike, so nothing in core
  needs the split. `vault_empty` and `vault_mismatch` give the same advice word for word, and could
  be one. In the gating kinds, `declined` is earned; `locked_while_asking` reads as `declined` to
  the UI, and `gating_landed` and `attempt_in_flight` are both UI-bug guards. `recordForNewBox`,
  the Coach's example, is fine by name: thrower and phrase agree, and `demandPuttable` is a guard
  named for what it asks (STYLE, *Control flow and refusals*). Its real fault is that it relates
  `patch` and `opts` in an if-then, where STYLE (*Validation*) wants a `.refine` on one parse. // fix wording on vault_empty

## 4. Counts you can rerun

From `/workspace/byok`. The per-site tables came from a TypeScript-checker script (it resolves
`Refuse.foo()` and `CX.vaultScope.parse()` to their declarations); these `rg` lines reproduce
the totals that matter.

```sh
# 53 kinds, and the families
rg -c "^  '\w+',\s+//" packages/safebyok/src/refusals/errors.ts

# 75 thrower factories, and each one's kind
rg "^export const \w+\s*=" packages/safebyok/src/refusals/throwers.ts | rg -c VaultError
rg -o "^export const \w+|new VaultError\('\w+'" packages/safebyok/src/refusals/throwers.ts

# the call sites of one factory, or of all thrower imports
rg -n "\b(lockedError|unlockFirst)\b" packages/safebyok/src
rg -n "throwers'" packages/safebyok/src packages/safebyok/tests/test-helpers*

# inline refusals and consistency checks with an explicit kind
rg -n "new VaultError\(" packages/safebyok/src packages/safebyok/tests/test-helpers* | rg -v throwers.ts
rg -n "kind: '" packages/safebyok/src/models

# validator kinds, and the 12 relabels
rg -n "(Checkers|Checker|objCheck)\(|refusingAs\(" packages/safebyok/src
rg -n "refusingAs\('bad_record'\)" packages/safebyok/src/shapes

# who branches on a kind: 6 lines
rg -n "isVaultError\([^,)]+, '|refusalkind\s*[!=]==|correctableKindVals as" packages/safebyok/src packages/safebyok/README.md packages/safebyok/CUSTOMIZATION.md
rg -n "weak_passphrase|unexpected_error|bad_option" packages/safebyok/README.md packages/safebyok/CUSTOMIZATION.md

# the kinds with no site in core (prints 0 for each of the 17)
for k in gate_made_elsewhere passkey_unavailable bad_whisper whisper_too_large invalid_box corrupt_record damaged_vault damaged_wayin crypto_failed vault_behind not_permitted identity_revoked storage_blocked vault_remade gate_moved no_whisper passphrase_required; do
  echo "$k $(rg "'$k'" packages/safebyok/src --glob '!**/refusals/errors.ts' -c | awk -F: '{s+=$2} END {print s+0}')"
done

# lines in tests naming a kind (a looser count than the assertions column)
rg -c "'stale_write'" packages/safebyok/tests --glob '!tests/test-helpers*'

# the outcomeOf calls that relabel by default (38 with one argument; two pass a factory)
rg -n "outcomeOf\(" packages/safebyok/src --glob '!**/refusals/**'
rg -n "outcomeOf\(.*, (damagedLease|wrongProof)\)" packages/safebyok/src

# guardStrengthChecker has no caller in src
rg -n "guardStrengthChecker" packages/safebyok/src
```

## Notes for the orchestrator

* The Coach's comments number sixteen, not fourteen: ten in the kinds table, one in the throw sites, and five in the
  findings. The one easy to miss is glued to its word, "`bad_option`// fix these.", in the *One lack, two kinds* finding.
  All sixteen are kept verbatim.
* The Coach edited the file during this pass (saved 19:45 UTC). Three throw-site cells changed. `listing.ts:320` gained
  the comment "don't camp the namespace, call it `boxBecameDisabled`" (after a no-break space, made a plain one here).
  Two gained words with no `//`, kept verbatim in their converge text. `storable.ts:198` now ends "or record_conflict like
  :201-:206 record conflict", which may pick record_conflict over the plan's vault_remade. `vault-listing.ts:113` now ends
  "not stale_write unless it requires hard work". The recommendations still follow the plan; the Coach should confirm
  `otherVaultTok`.
* `corrupt_record` is both among the plan's fifteen culls and in its merge table. It is filed here as
  **merge → record_conflict**, so the culls group holds fourteen.
* The plan leaves a validator's refusal options (a `Checkers` call, `parseConsistent`) alone, but names no rule for
  `verifyConsistent`, and gives `listing.ts:326`, a `verifyConsistent` site, a thrower. The other consistency-check
  sites are marked as left, which sits uneasily with "every throw site uses a thrower".
* The plan sends the 12 `refusingAs('bad_record')` relabels "where the base kind is already the target". Each base is an
  `invalid_input` schema, whose target is `bad_option`, but `vaultRow` is parsed on the way out (`vault.ts:309`), where
  the target is `damaged_row`. The direction list in *The validator kinds* is from a quick read.
* Re-kinding without renaming breaks "the names agree" for `unknownKeyDeriver` (newer_format), `vaultMismatch`
  (vault_remade), `storageError` (storage_unavailable) and `damagedRecord` (damaged_row). The plan defers renames to the
  gallant pass.
* Culling `bad_whisper` leaves its two validators needing a kind. They show as `bad_option` here, the kind their outer
  validators already refuse with. The plan does not say.
* `passphrase-strength.ts:85` is a dead twin the plan does not mention. The recommendation reuses `strengthCheckerThrew`,
  and the old converge text, delete `guardStrengthChecker`, stays beside it.
* "Throwers everywhere, outside `refusals/`" is applied to the test helpers too. `bank-world.ts:45` takes its kind from
  the test, so it is reported, not given a thrower.
* `gate_issue`: three of its four sites (`vault-db-new.ts:203`, `:216`, `:230`) are parameter validation; `:243` is an
  integrity check.
* The kinds table's explicit counts leave out the test-helper sites, so `vault_locked` shows 4 there and 5 rows in
  section 2 (one moves to bad_option), and `damaged_box` shows 2 there and 3 rows.
* Both the bold recommendation and `routed:` were asked to open a verdict. The bold recommendation comes first.
