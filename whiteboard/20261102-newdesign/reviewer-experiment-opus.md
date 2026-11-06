# Reviewer experiment: models doc blocks (Opus)

* **Role:** thread-reviewer under the proposed split of duties: reads the code, and is licensed to rewrite doc blocks to
  the rules, citing a tag. Read-only here: the rewrites are below, nothing in `src` changed.
* **Files:** `packages/safebyok/src/models/box.ts` and `packages/safebyok/src/models/vault.ts`, base checkout, at commit
  `b7bacb68`.
* **Rules:** `notes/gallant.md`, `notes/gallant-docblocks.md`, and from `docblock-reform.md` the draft STYLE.md section,
  3h and section 1.

## Disagreements with the code `#facts-from-the-code`

1. **vault.ts:340 `putBox`**: "See {@link BoxListing.put} for important details on refusals and options". `BoxListing`
   has no `put`. The inherited `Listing.put` (listing.ts:162) stores a *record* and documents neither. The patch options
   are on `Box.put` (box.ts:96).
2. **vault.ts:349 `delBox`**: "see {@link BoxListing.del} for important details on refusals and options".
   `BoxListing.del` (box-listing.ts:62) is one line on damaged rows and takes no options.
3. **vault.ts:161 `#landGate`**: "then attach a lease under the epoch it landed". vault.ts:254
   `if (heldLease === null) { return }`, and 256-258 evict if the lease was forgotten. A locked vault stays locked.
4. **box.ts:27 `#exposed`**: "until the host sets it null". Sweep and vacate (box.ts:152, 154) null it too, and setting
   `LOCKED` forgets it (box.ts:54).
5. **vault.ts:198 `lock`**: "Lock ... before returning, and erase the row cached" reads as if the erase is done on
   return. vault.ts:202 `void this.#vacateLease()`: the erase finishes later. Ambiguous, not false.
6. **vault.ts:417 `ensureTimely`**: "as it stands where it is recent". `hydrate` also needs the record whole
   (`this.#isWhole && ...`), so a recent sparse vault is fetched. Minor.
7. **box.ts:41** "The sealed parts" heads `whisper_codec` and `whisper_schema_version`, which are clear sparse fields
   (shapes-storage.ts:108-110). Minor.
8. *(SLOPDOC)* **vault.ts:140 `delVault`**: "nothing of it on this device". `adopt` (vault.ts:427-429) keeps the instance
   as a tombstone, and its own block says "the vault keeping its slot".
9. *(SLOPDOC)* **box.ts:47 `whisper`**: "set it to expose". The setter holds the host's own value (box.ts:55) and opens
   nothing stored, so `box.whisper` can then differ from storage.

## Missing guarantees `#say-the-guarantee`

* **box.ts:27 `#exposed`** (and the SLOPDOC `whisper`): the cleartext whisper stays in memory across `lock()`, hidden
  behind `LOCKED`, until set null, swept or vacated. `Box` has no `lock` override, and `Storable.lock` only settles.
* **box.ts:38 `sidecar`**: the sidecar shown (like every sparse field) is unauthenticated until a whisper is opened
  against the stamp.
* **box.ts:64 `extractWhisper`**: opening authenticates the whisper, the sidecar and every sparse field against the seal.
* **box.ts:182 `sealedRecordOf`**, which put and create point to for "sealed": the whisper is ciphered under a fresh
  boxKey that the vaultKey wraps, both bound to every sparse field, the sidecar and the vault's stamp (lease.ts:164).
  Changing any of these makes the open fail.
* **vault.ts:301 `unsealStampedString`**: refuses 'damaged_box' if `sealed` or `stamp` was altered (lease.ts:157).
* **vault.ts:295 `sealStampedString`**: refuses a stamp of another vault or another life of this one (vault.ts:396).
* **vault.ts:130 `revokePasskey`** (and the SLOPDOC `replacePassphrase`): every gate change moves `gate_epoch`
  (vault-db-new.ts:249). Another device keeps its key until it locks, then must prove again: its cached lease is dropped
  at its next load (lease.ts:69).
* **vault.ts:237 `#unlockByProof`**: a `lock()` landing mid-unlock does not hold, and the vault ends unlocked. In
  `#renewLease` the lock wins. The block gives this only as a riddle.

## Findings

Most-common tag first. Each line gives `file:line`, the block's first line, the tags, then what is wrong.

* box.ts:35 `The life of the box under its boxlabel, as the record in hand has it: minted at its birth, and kept by eve` `#one-verb-one-fact` `#point-dont-redefine`: repeats shapes-storage.ts:105's field doc
* box.ts:38 `The sidecar of the record in hand, which only the full record carries; null otherwise. It holds nothing s` `#one-verb-one-fact` `#say-the-guarantee`: "so it shows whether the vault is locked" misreads; no authentication caveat
* box.ts:182 `The full record of \`base\` with \`sidecar\`, \`whisper\` sealed through \`world\`: its {@link WhisperHolder}` `#one-verb-one-fact` `#purpose-not-machinery` `#say-the-guarantee`: verbless; gives the codec, not the proof
* vault.ts:61 `The Gate of the record in hand, the same while the record's \`gate\` is the same object, so a record rec` `#one-verb-one-fact` `#purpose-not-machinery`: caching mechanics on a "so" clause
* vault.ts:130 `Revoke the passkey through a revoke_passkey gating. With none held it answers at once, nobody asked. Th` `#one-verb-one-fact` `#say-the-guarantee`: "nobody asked" stand-in; re-proof next session unsaid
* vault.ts:349 `Return the (tombstoned) box listed at \`boxlabel\` -- see {@link BoxListing.del} for important details o` `#facts-from-the-code` `#name-the-act` `#one-verb-one-fact`: opens with Return; dead pointer; deletes unlisted boxes too
* vault.ts:432 `The lease dropped, the row cached left for the next session, and the boxes swept.` `#one-verb-one-fact`: participial absolutes; omits the declined gating
* vault.ts:439 `Locked, the row cached erased, and the boxes vacated.` `#one-verb-one-fact`: participial absolutes; omits the declined gating
* vault.ts:446 `A full vault record is one alive that carries its \`gate\`; a sparse one or a tombstone is not.` `#one-verb-one-fact`: "one" stands in for "record". Minor
* box.ts:27 `The frozen {@link WhisperHolder} the host asked to keep open on the instance, until the host sets it null.` `#facts-from-the-code` `#say-the-guarantee`: other clearers omitted; outliving a lock unsaid
* box.ts:64 `The timely stored whisper, as its frozen {@link WhisperHolder} \`{ val }\`, keeping nothing on the instance.` `#say-the-guarantee` `#purpose-not-machinery`: gallant.md's Goofus verbatim
* vault.ts:237 `Past the enter key: a lock crossing this is answered by the next \`lock()\`, as the proof says this user ` `#say-the-guarantee` `#purpose-not-path` `#a-helper-gets-a-phrase`: reason as riddle; the lost lock unsaid
* vault.ts:295 `\`whisperText\` sealed under a fresh boxKey under this vault's key, both bound to \`stamp\`.` `#say-the-guarantee`: omits refusing another vault's stamp
* vault.ts:301 `The text \`sealed\` holds, bound to \`stamp\`.` `#say-the-guarantee`: omits that tampering refuses
* vault.ts:340 `Returns box after applying \`patch\`, sealing the new revision, and storing it. See {@link BoxListing.pu` `#facts-from-the-code` `#name-the-act`: dead pointer; leads with Returns
* vault.ts:161 `Run the commit, then attach a lease under the epoch it landed.` `#facts-from-the-code`: attaches only if a lease was held throughout
* vault.ts:198 `Lock the vault and its boxes before returning, and erase the row cached on this device.` `#facts-from-the-code`: the erase completes after return
* vault.ts:417 `This vault, refreshed within \`maxMillis\`, by default its horizon: as it stands where it is recent, other` `#facts-from-the-code` `#outcome-not-branches`: a branch tour that misses sparse records
* box.ts:41 `The sealed parts of the record in hand; null where it is not full.` `#facts-from-the-code`: codec and version are not sealed
* box.ts:17 `The scope, tattooed on by Storable's constructor.` `#purpose-not-machinery`: how the props arrive; attaches to `applabel` alone
* vault.ts:34 `The scope, tattooed on by Storable's constructor.` `#purpose-not-machinery`: same as box.ts:17
* vault.ts:68 `The listing of this vault's boxes, made once, on first asking.` `#purpose-not-machinery`: lazy construction. Minor
* vault.ts:423 `Take in \`central\`. A tombstone locks the vault, erases the cached row and vacates the boxes, the vault ` `#purpose-not-machinery` `#a-helper-gets-a-phrase`: a protected hook narrating steps and what a refusal leaves
* vault.ts:172 `This vault timely and unlocked: as it stands, else by the lease cached on this device, else by {@link un` `#name-the-act` `#outcome-not-branches`: may ask the user, yet opens with a noun-phrase branch tour
* vault.ts:307 `The vault row a box's answer carries, received whole, so a gate moved elsewhere arrives with it.` `#name-the-act` `#purpose-not-path`: no verb; a "so" reason; omits the vault_tok filter
* vault.ts:334 `{@link getBox}, the box's record fetched whatever its age.` `#name-the-act`: no act
* box.ts:137 `Holding a whisper on the instance needs the box enabled and the vault unlocked.` `#name-the-act` `#guard-names-its-predicates`: states a rule, not a throw
* vault.ts:401 `An attach needs the vault enabled and present.` `#name-the-act` `#guard-names-its-predicates`: same shape; it guards `unlock`
* box.ts:124 `Demands that the box be enabled and present, with a full record, and the vault unlocked.` `#guard-names-its-predicates`: gallant.md has the Gallant
* box.ts:127 `The parsed \`patch\`, refused unless a put of it under \`opts\` may go ahead now.` `#guard-names-its-predicates`: "may go ahead" names no predicate
* vault.ts:388 `Refuses unless the vault is enabled, present and unlocked.` `#guard-names-its-predicates`: right predicates, unlinked
* vault.ts:404 `Refuses unless the vault is enabled and present.` `#guard-names-its-predicates`: right predicates, unlinked
* vault.ts:383 `The vault's own lock, not its world's: the bank has none.` `#purpose-not-path` `#no-sibling-comparisons`: why it overrides, never what is true
* box.ts:81 `The whisper of \`record\`, opened through the vault's seal verbs and held to {@link whisperHolder}.` `#a-helper-gets-a-phrase`: gallant.md's Goofus, last clause cut
* box.ts:94 `Seals \`patch\` over the record in hand and stores it, answering the box listed; a deleted box is reborn.` `#option-values-get-a-list` `#point-dont-redefine`: no options, no `ifPresent: 'get'`, no "seal" pointer
* vault.ts:326 `Hydrate and return the box listed at \`boxlabel\` (i.e. fetch if stale). A missing box is null for \`ifAb` `#option-values-get-a-list`: values in prose, default unmarked
* box.ts:193 `\`text\` parsed as JSON, or null where it is none: a SyntaxError can quote what it failed on.` `#reason-goes-above`: the security reason belongs in a `//`
* vault.ts:57 `The full record in hand, what a gate change spreads into its params.` `#three-questions`: names its caller; omits throwing while sparse

## Eight rewrites

**1. box.ts:27** `#say-the-guarantee` `#facts-from-the-code`. Old: `The frozen {@link WhisperHolder} the host asked to keep open on the instance, until the host sets it null.`

```ts
/** The cleartext whisper held open here, or null. A lock hides it behind LOCKED but keeps it, until set null, swept or vacated. */
#exposed: WhisperHolder | null = null
```

**2. box.ts:38** `#say-the-guarantee`. Old: `The sidecar of the record in hand, which only the full record carries; null otherwise. It holds nothing secret, so it shows whether the vault is locked or not.`

```ts
/** The sidecar of the full record in hand, else null, readable while locked. It is unauthenticated until {@link extractWhisper} opens the seal. */
get sidecar(): Sidecar | null
```

**3. box.ts:182** `#say-the-guarantee` `#purpose-not-machinery`. Old: `The full record of \`base\` with \`sidecar\`, \`whisper\` sealed through \`world\`: its {@link WhisperHolder} \`{ val }\` as json_v1, bound with its key to the box's stamp. Of \`base\`, only its sparse fields are taken.`

```ts
/** Seal `whisper` into a full record, ciphered under a fresh boxKey that the vaultKey wraps.
 * Both are bound to {@link boxStampOf}, so a change to any sparse field or to the sidecar fails the open. */
const sealedRecordOf = async (world: Pick<BoxWorld, 'sealStampedString'>, base: BoxSparse, sidecar: Sidecar, whisper: WhisperHolder): Promise<BoxRecord>
```

**4. vault.ts:340** `#facts-from-the-code` `#name-the-act`. Old: `Returns box after applying \`patch\`, sealing the new revision, and storing it. See {@link BoxListing.put} for important details on refusals and options`

```ts
/** Seal and store `patch` in the box it names, creating the box unless `ifAbsent: 'fail'`. The options are {@link Box.put}'s.
 * After a 'stale_write' the box holds the stored record: apply `patch` again to retry. */
async putBox(patch: BoxPut, opts: BoxPutOpts = {}): Promise<Box>
```

**5. vault.ts:130** `#say-the-guarantee` `#one-verb-one-fact`. Old: `Revoke the passkey through a revoke_passkey gating. With none held it answers at once, nobody asked. The vaultKey does not change: a device that has it keeps it to its lock.`

```ts
/** Revoke the passkey through a revoke_passkey gating; with none held, a no-op. The vaultKey stays.
 * Another device keeps its key until it locks, and its cached lease stops loading, so it must prove again next session. */
async revokePasskey(): Promise<this>
```

**6. vault.ts:161** `#facts-from-the-code`. Old: `Run the commit, then attach a lease under the epoch it landed.`

```ts
/** Run the commit, and renew a lease held throughout under the epoch it landed. */
async #landGate(proved: Proving, commit: () => Promise<SX.VaultRecord>): Promise<this>
```

**7. vault.ts:237** `#purpose-not-path` `#reason-goes-above` `#a-helper-gets-a-phrase`. Old: `Past the enter key: a lock crossing this is answered by the next \`lock()\`, as the proof says this user may have the vault unlocked.`

```ts
// Past the enter key nothing turns back: a lock() landing while this awaits does not hold; the vault ends unlocked.
/** Unlock by `proved`'s lease. */
async #unlockByProof(proved: Proving): Promise<this>
```

**8. box.ts:193** `#reason-goes-above`. Old: `\`text\` parsed as JSON, or null where it is none: a SyntaxError can quote what it failed on.`

```ts
// Never let the SyntaxError out: its message can quote the cleartext it failed on.
/** `text` parsed as JSON, or null if it is not JSON. */
const parseJsonOrNull = (text: string): unknown
```

## SLOPDOC-marked blocks

* box.ts:47 `whisper` get/set `#one-verb-one-fact` `#say-the-guarantee` `#facts-from-the-code`: the setter opens nothing; outliving a lock unsaid
* box.ts:72 `expose` `#purpose-not-machinery`: narrates `box.whisper`; outliving a lock unsaid
* vault.ts:30 `Vault` class `#purpose-not-machinery`: "a storable that ducks as its record"
* vault.ts:77 `launchBirth` `#outcome-not-branches`: omits answering another device's vault, locked (vault.ts:93-94, `ifPresent: 'get'`)
* vault.ts:88 `#runBirth` `#a-helper-gets-a-phrase`: facts right
* vault.ts:101 `replacePassphrase` `#say-the-guarantee`: "no other device is locked" holds only until each device's next session
* vault.ts:140 `delVault` `#facts-from-the-code`: "nothing of it on this device"; the instance stays as a tombstone
* vault.ts:207 `#vacateLease` `#a-helper-gets-a-phrase`: facts right

## Counts

* **Blocks reviewed:** 70 (box.ts 21, vault.ts 49), 8 of them SLOPDOC. Of the 62 others, 38 have findings and 24 are clean.
* **Findings by tag**, outside SLOPDOC: `#one-verb-one-fact` 9, `#say-the-guarantee` 8, `#facts-from-the-code` 7,
  `#purpose-not-machinery` 7, `#name-the-act` 7, `#guard-names-its-predicates` 6, `#purpose-not-path` 3,
  `#a-helper-gets-a-phrase` 3, `#option-values-get-a-list` 2, `#point-dont-redefine` 2, `#outcome-not-branches` 2,
  `#reason-goes-above` 1, `#three-questions` 1, `#no-sibling-comparisons` 1.
* **Needed the code to judge:** 15 of the 38, plus 4 of the 8 SLOPDOC. That covers every disagreement and every missing
  guarantee except `extractWhisper`'s, plus box_tok's repeated definition. The other 23 came from the block alone.
* **Exported members with no block** (the rule "every export gets a doc block"): most try forms (`tryPut`,
  `tryExtractWhisper`, `tryDelBox`, `tryUnlock`...) where `tryGetBox` has one; also `lockState`, `isUnlocked`,
  `demandPresent`, `ensureAttachable`, `ensureUnsealable`, `ensurePuttable`, `fmt` and `clock`. Not counted above.

## Notes on the role

* **Only the code gave:** both dead pointers; `#landGate` attaching only under a held lease; the whisper outliving a lock;
  the sidecar being unauthenticated until an unseal; re-proof after a gate change (vault-db-new.ts and lease.ts, two hops
  from the block); and the lost lock in `#unlockByProof`.
* **The block alone gave:** every `#one-verb-one-fact`, `#name-the-act`, `#guard-names-its-predicates` and
  `#purpose-not-path` finding, and the three gallant.md Goofuses still verbatim (`extractWhisper`, `#unseal`,
  `demandUnsealable`).
* **gallant.md:** used *Words* throughout, plus `#ensure-works-demand-refuses` and `#guard-at-the-entrypoint` to read
  the guards. *Call chains*, *Letting things fail* and *Reuse* went unused: they teach faults in code, not in blocks.
  *Reading the Coach* kept me from calling "whisper survives a lock" a fault: the behaviour is ruled, and only the doc's
  silence about it is a finding.
* **Ambiguous:** `#say-the-guarantee` against `#a-helper-gets-a-phrase`. A private member (`#exposed`, `#unlockByProof`)
  may carry the security fact a reviewer needs. I put a race in a `//` and a guarantee in the block, but the rules do
  not say which goes where. Nothing covers a block that heads a group of getters or props (box.ts:41, the scope blocks).
  `#guard-names-its-predicates` does not say whether a guard that returns a parsed value (`demandPuttable`) counts.
