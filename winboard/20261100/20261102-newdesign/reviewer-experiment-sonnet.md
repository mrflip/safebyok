# Reviewer experiment: detect and tag, no rewrite (sonnet)

**Role**: style-reviewer under a proposed split of duties. It DETECTS and TAGS doc-block faults against the tagged rule list
(`notes/gallant-docblocks.md`, `notes/gallant.md` *Words*, `docblock-reform.md` *Comments and doc blocks* and 3h), and does not rewrite.
**Files reviewed**: `packages/safebyok/src/models/box.ts` (21 doc blocks), `packages/safebyok/src/models/vault.ts` (49 doc blocks).
**Commit**: `b7bacb68`. Line numbers are from that checkout. Form: `file:line` first line (cut to 100 chars) | tags | fault.
A finding is listed once, under its first tag, which is the one I judge primary. Counts below count every tag on a finding.

## Findings

**#purpose-not-machinery** (primary on 9)
- `box.ts:13` "A box as this device holds it: a storable that ducks as its record, with its whisper openable while " | #purpose-not-machinery | class blurb narrates inheritance ("ducks as"); low confidence
- `box.ts:17` "The scope, tattooed on by Storable's constructor." | #purpose-not-machinery | says who sets the fields, not what they are
- `box.ts:35` "The life of the box under its boxlabel, as the record in hand has it: minted at its birth, and kept " | #purpose-not-machinery | narrates minting and keeping; "as" clause
- `box.ts:106` "The next record `patch` makes, sealed and not stored, and the revision it goes over." | #purpose-not-machinery #a-helper-gets-a-phrase | the known Goofus for #purpose-not-machinery; private helper
- `vault.ts:34` "The scope, tattooed on by Storable's constructor." | #purpose-not-machinery | same as box.ts:17; says who sets the fields
- `vault.ts:61` "The Gate of the record in hand, the same while the record's `gate` is the same object, so a record r" | #purpose-not-machinery #one-verb-one-fact | narrates memoization; "so" clause
- `vault.ts:198` "Lock the vault and its boxes before returning, and erase the row cached on this device." | #purpose-not-machinery #one-verb-one-fact | panic-versus-throw refusal behaviour; fragment "A no-op on a vault discarded"
- `vault.ts:340` "Returns box after applying `patch`, sealing the new revision, and storing it. See {@link BoxListing." | #purpose-not-machinery #name-the-act | participle pile (applying, sealing, storing); "Returns box" not the act
- `vault.ts:423` "Take in `central`. A tombstone locks the vault, erases the cached row and vacates the boxes, the vau" | #purpose-not-machinery #one-verb-one-fact | reads the body aloud; absolute participle; refusal aftermath

**#a-helper-gets-a-phrase** (primary on 9)
- `box.ts:27` "The frozen {@link WhisperHolder} the host asked to keep open on the instance, until the host sets it" | #a-helper-gets-a-phrase #three-questions | private field not a phrase; says who sets and clears it
- `box.ts:81` "The whisper of `record`, opened through the vault's seal verbs and held to {@link whisperHolder}." | #a-helper-gets-a-phrase #purpose-not-machinery | private helper; narrates seal verbs and holder check
- `box.ts:182` "The full record of `base` with `sidecar`, `whisper` sealed through `world`: its {@link WhisperHolder" | #a-helper-gets-a-phrase #purpose-not-machinery #one-breath-contract | private helper; mechanism, json_v1 and key binding in one paragraph
- `box.ts:190` "The box's stamp, which the lease binds both sealed parts to: every sparse field of the record, and i" | #a-helper-gets-a-phrase #purpose-not-machinery #one-verb-one-fact | private; lists fields, "which" clause
- `vault.ts:41` "The lease this device holds, and null is what locked means." | #a-helper-gets-a-phrase | private field; two facts, the invariant wants a // comment
- `vault.ts:161` "Run the commit, then attach a lease under the epoch it landed." | #a-helper-gets-a-phrase #purpose-not-machinery | private helper; steps in order ("then")
- `vault.ts:217` "Tell `onPanic` that a cached lease survived a lock; with none, tell the platform and vacate this vau" | #a-helper-gets-a-phrase #purpose-not-machinery #one-verb-one-fact | private helper; branch tour; gapped "with none"
- `vault.ts:252` "Attach a new lease under `gate_epoch` where `heldLease` is in force. A lock crossing the change wins" | #a-helper-gets-a-phrase #reason-goes-above | private; second sentence is a race rationale, wants // comment
- `vault.ts:471` "The record of a birth, at the revision after `prior`, carrying `gate` and the stamp it was made unde" | #a-helper-gets-a-phrase | private helper; participle clause and relative clause, not a phrase

**#name-the-act** (primary on 6)
- `vault.ts:295` "`whisperText` sealed under a fresh boxKey under this vault's key, both bound to `stamp`." | #name-the-act #purpose-not-machinery | noun phrase for a seal; narrates key layering
- `vault.ts:301` "The text `sealed` holds, bound to `stamp`." | #name-the-act | noun phrase for a decrypt that authenticates; guarantee left implicit
- `vault.ts:307` "The vault row a box's answer carries, received whole, so a gate moved elsewhere arrives with it." | #name-the-act #one-verb-one-fact #three-questions | noun phrase for a void method; "so" clause; says who calls
- `vault.ts:334` "{@link getBox}, the box's record fetched whatever its age." | #name-the-act #no-sibling-comparisons | opens with a link, not the act; defined by its sibling
- `vault.ts:349` "Return the (tombstoned) box listed at `boxlabel` -- see {@link BoxListing.del} for important details" | #name-the-act #one-verb-one-fact | first line is not a sentence; names "return", not the delete
- `vault.ts:383` "The vault's own lock, not its world's: the bank has none." | #name-the-act #no-sibling-comparisons | defined by contrast with another class; never says what it answers

**#guard-names-its-predicates** (primary on 6)
- `box.ts:124` "Demands that the box be enabled and present, with a full record, and the vault unlocked." | #guard-names-its-predicates | predicates in prose, not linked; Gallant form exists
- `box.ts:127` "The parsed `patch`, refused unless a put of it under `opts` may go ahead now." | #guard-names-its-predicates #name-the-act | guard opens with a noun; predicates unnamed, unlinked
- `box.ts:137` "Holding a whisper on the instance needs the box enabled and the vault unlocked." | #guard-names-its-predicates #name-the-act | guard opens with a condition, not "throw unless"; unlinked
- `vault.ts:388` "Refuses unless the vault is enabled, present and unlocked." | #guard-names-its-predicates | predicates named in prose, not linked
- `vault.ts:401` "An attach needs the vault enabled and present." | #guard-names-its-predicates #name-the-act | guard opens with a condition; predicates unlinked
- `vault.ts:404` "Refuses unless the vault is enabled and present." | #guard-names-its-predicates | predicates named in prose, not linked

**#one-verb-one-fact** (primary on 4)
- `box.ts:38` "The sidecar of the record in hand, which only the full record carries; null otherwise. It holds noth" | #one-verb-one-fact | "which" and "so" clauses; semicolon joins facts
- `vault.ts:432` "The lease dropped, the row cached left for the next session, and the boxes swept." | #one-verb-one-fact #name-the-act #purpose-not-machinery | absolute-participle list with no finite verb; lists body steps
- `vault.ts:439` "Locked, the row cached erased, and the boxes vacated." | #one-verb-one-fact #name-the-act #purpose-not-machinery | absolute-participle list with no finite verb; lists body steps
- `vault.ts:446` "A full vault record is one alive that carries its `gate`; a sparse one or a tombstone is not." | #one-verb-one-fact | "one" for a noun; semicolon; gapped "is not"

**#outcome-not-branches** (primary on 3)
- `vault.ts:130` "Revoke the passkey through a revoke_passkey gating. With none held it answers at once, nobody asked." | #outcome-not-branches #one-verb-one-fact | branch (none held) as a sentence; absolute "nobody asked"
- `vault.ts:172` "This vault timely and unlocked: as it stands, else by the lease cached on this device, else by {@lin" | #outcome-not-branches #name-the-act #one-verb-one-fact | branch tour; noun phrase opens an ensure; gapped "else by"
- `vault.ts:417` "This vault, refreshed within `maxMillis`, by default its horizon: as it stands where it is recent, o" | #outcome-not-branches #name-the-act #one-verb-one-fact | branch tour; noun phrase opens an ensure; gapped "by default its horizon"

**#reason-goes-above** (primary on 2)
- `box.ts:193` "`text` parsed as JSON, or null where it is none: a SyntaxError can quote what it failed on." | #reason-goes-above | the reason after the colon belongs in a // comment above
- `vault.ts:237` "Past the enter key: a lock crossing this is answered by the next `lock()`, as the proof says this us" | #reason-goes-above #a-helper-gets-a-phrase #name-the-act | rationale ("as the proof says") in the block; opens with a place, not the act

**#option-values-get-a-list** (primary on 2)
- `box.ts:94` "Seals `patch` over the record in hand and stores it, answering the box listed; a deleted box is rebo" | #option-values-get-a-list #purpose-not-machinery #point-dont-redefine #one-verb-one-fact | ifPresent/ifAbsent values unlisted; "seals" unpointed; semicolon
- `vault.ts:326` "Hydrate and return the box listed at `boxlabel` (i.e. fetch if stale). A missing box is null for `if" | #option-values-get-a-list #one-verb-one-fact | ifAbsent values in prose, gapped "or refused for", not a list

**#no-sibling-comparisons** (primary on 1)
- `vault.ts:157` "Delete this vault by {@link delVault}, which takes the passphrase's proof." | #no-sibling-comparisons #one-verb-one-fact | defined by its sibling; "which" clause

**#three-questions** (primary on 1)
- `vault.ts:57` "The full record in hand, what a gate change spreads into its params." | #three-questions | says who uses it, not what it does for the caller

**#say-the-guarantee** (primary on 1)
- `box.ts:64` "The timely stored whisper, as its frozen {@link WhisperHolder} `{ val }`, keeping nothing on the ins" | #say-the-guarantee #name-the-act #purpose-not-machinery | noun phrase for an extract; holder shape instead of the guarantee

**#no-refusal-catalog** (primary on 1)
- `vault.ts:366` "Delete the damaged box listed at `boxlabel`, the only verb that does. Refuses 'absent_box' for a hea" | #no-refusal-catalog #no-sibling-comparisons #one-verb-one-fact | names a refusal kind; "only verb that does" compares siblings

## SLOPDOC-marked blocks

- `box.ts:47` "SLOPDOC: The whisper exposed on this instance, LOCKED while the vault is; set it to expose or forget" | #one-verb-one-fact | semicolon; gapped "while the vault is"
- `box.ts:72` "SLOPDOC: Opens the stored whisper and holds it on the instance, where `box.whisper` offers it until " | #one-verb-one-fact #three-questions | "where" clause; never says when to call it
- `vault.ts:30` "SLOPDOC: A vault as this device holds it: a storable that ducks as its record, and the world its box" | #purpose-not-machinery | narrates inheritance ("ducks as"); no finite verb
- `vault.ts:77` "SLOPDOC: Builds a vault under `scope` through a build_vault gating, over the slot's tombstone if it " | #purpose-not-machinery #three-questions | names the gating mechanism; no pointer to when or how to call
- `vault.ts:88` "SLOPDOC: Stores the birth record, and unlocks under its passphrase's lease if the vault stored is it" | #a-helper-gets-a-phrase #outcome-not-branches | private helper; branch (if the vault stored is its own)
- `vault.ts:101` "SLOPDOC: Replaces the passphrase through a gating; the passkey stays and no other device is locked." | #one-verb-one-fact #purpose-not-machinery | semicolon joins two facts; "through a gating" is mechanism
- `vault.ts:140` "SLOPDOC: Deletes this vault through a gating, leaving a tombstone in its slot and nothing of it on t" | #one-verb-one-fact | absolute participle carries a second fact
- `vault.ts:207` "SLOPDOC: Drops any lease held and erases the row cached on this device." | #a-helper-gets-a-phrase #purpose-not-machinery | private helper; reads the body aloud

## Good blocks

`box.ts:41`, `box.ts:118`, `box.ts:156`, `box.ts:161`, `vault.ts:26`, `vault.ts:68`, `vault.ts:115`, `vault.ts:150`, `vault.ts:183`, `vault.ts:244`, `vault.ts:266`, `vault.ts:289`, `vault.ts:316`, `vault.ts:331`, `vault.ts:337`, `vault.ts:346`, `vault.ts:451`

## Counts

- Blocks reviewed: 70 (box.ts 21, vault.ts 49); SLOPDOC-marked: 8; findings (not marked): 45; good: 17. (45+8+17=70)
- Tag occurrences on findings (all tags on each, not SLOPDOC): #purpose-not-machinery 19, #one-verb-one-fact 18, #name-the-act 16, #a-helper-gets-a-phrase 11, #guard-names-its-predicates 6, #no-sibling-comparisons 4, #three-questions 3, #reason-goes-above 3, #outcome-not-branches 3, #option-values-get-a-list 2, #say-the-guarantee 1, #point-dont-redefine 1, #one-breath-contract 1, #no-refusal-catalog 1
- Tag occurrences on SLOPDOC blocks: #one-verb-one-fact 4, #purpose-not-machinery 4, #three-questions 2, #a-helper-gets-a-phrase 2, #outcome-not-branches 1
## Notes on the role

* Easy from the block alone: #name-the-act (opening word vs the signature's verb), #one-verb-one-fact (semicolons, "which", "so", "as", gapped lists, absolute participles),
  #a-helper-gets-a-phrase (private or unexported plus length), #guard-names-its-predicates, #no-refusal-catalog, #no-sibling-comparisons, #option-values-get-a-list.
* Needed the code and I could not fully judge: #facts-from-the-code (never applied; I did not check any block against its body), #say-the-guarantee (what a call proves
  lives in the body and the seal path), #three-questions (a caller's "when do I call it" is mostly absent from the blocks, but I could not tell which are required).
* Unsure: box.ts:13 and vault.ts:30 (class blurbs, "ducks as its record": jargon or fair?); box.ts:182 (unexported, but the Gallant names it the home of "sealed", so a
  fuller block may be right); vault.ts:198 (the "panics, does not throw" line may be the guarantee a caller needs, not machinery); vault.ts:68 and :266 ("made once"
  is arguably a caller-visible identity guarantee, so I passed them); vault.ts:157 (the sibling pointer may be a legitimate #point-dont-redefine).
* The rules overlap: #purpose-not-machinery, #one-verb-one-fact and #name-the-act fire together on the same block, so tag counts are inflated against block counts.
  I listed each finding under one primary tag and counted all of them in Counts.
* No rule says whether a one-line noun-phrase block for a getter (box.ts:41) is a #name-the-act fault; I passed those. `@param`/`@returns` and `@example` rules were never in play.
* Doc blocks outside the two files (Storable, BoxListing) are what `{@link}` and "see" pointers lead to; I did not open them, so I did not check that links resolve.
* Text read: all of box.ts (201 lines) and vault.ts (475 lines), whole, plus the three rule sources (about 450 lines); the decision per block took the block and signature and, for
  perhaps a fifth of the blocks, a glance at the body to tell guard from lookup or private from exported. The whole 676 lines were read, but the block text is a small share of them (a fifth, by eye); the signature line was enough for most calls.
