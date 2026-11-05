# Goofus and Gallant: doc blocks

The Coach's rewrites of doc blocks the `unrace` sprint stripped, each beside the block it replaces, and the slop the pair shows.
Each principle has a hashtag to refer to in a review. Code on #498 (`b8a28462`); the signatures are as the Coach wrote them.

This file is for a documentarian. A block marked **Gallant** is the Coach's, and goes into `src` as written. The principle
names the species, to hunt in the blocks this file doesn't cover. Four pairs that teach a lesson `notes/gallant.md` lacked
live there, under *Words*, and are listed below so the bestiary stays whole. A review finding cites a tag; `rg '#tag' notes/`
finds the pair.

**Status**, every pair here: Planned, the documentarian run on `models/`. None of the Coach's blocks is in `src`; on #498
each method carries a stripped one-liner, some marked `SLOPDOC:`.

Contents:

* **Here:** `#lead-with-the-job`, `#outcome-not-branches`, `#no-sibling-comparisons`, `#one-breath-contract`, `#one-sentence-headline`
* **In `notes/gallant.md`, *Words*:** `#purpose-not-path`, `#purpose-not-machinery`; `#no-refusal-catalog` (`create`, `demandUnsealable`);
  `#say-what-to-do` (`vaultAt`); `#say-the-guarantee` (`extractWhisper`); `#a-helper-gets-a-phrase` (`#unseal`)

---

# Words

## Lead with the job `#lead-with-the-job`

The first line says what the call does, in the words of the caller's own checklist. When a host calls it, and what a refusal
leaves behind, are the class's story, said once there or not at all. "A host may repeat" is a caller list in disguise.

**Goofus:**

```ts
/** A forced reset a host may repeat: lists what the vaultDB holds, tidies old leases, and starts the watch.
 * Refused, the bank is not ready; one a sweep crossed refuses only its own caller. */
async hello(): Promise<void>
```

**Gallant:**

```ts
/** Get-ready tasks: load packages, fetch the vault listing, start its watch */
async hello(): Promise<void>
```

## The outcome, not the branch tour `#outcome-not-branches`

A block that walks each path the method can take, with the state each leaves, is its control flow in prose. Say what the
caller holds when it resolves, and the one case that bends it.

**Goofus:**

```ts
/** The vault listed for `bag`, nobody asked, locked unless the host unlocks it; else one built by asking the user through a build_vault gating, or another's that won the slot, locked. Refuses before ready, and 'already_asking' while a gating is open. */
async ensureVault(bag: VaultBag): Promise<Vault>
```

**Gallant:**

```ts
/** The scoped vault as listed, creating it if absent (tombstoned or void) */
async ensureVault(scope: BankedVaultScope): Promise<Vault>
```

## No sibling comparisons `#no-sibling-comparisons`

"As X does" sends the reader to another method to learn what this one does, and goes stale the day X changes. Say the
condition. `BoxListing` has no `#demandUnlocked` on #498 (a box calls `Storable.demandUnlocked` and its `BoxWorld`'s); the pair
stands for the pattern.

**Goofus:**

```ts
/** Refuse 'vault_locked' while the vault is locked, as a box's `demandUnlocked` does. */
#demandUnlocked(): void
```

**Gallant:**

```ts
/** refuse if 'vault_locked', else no-op */
#demandUnlocked(): void
```

## The whole contract in one breath `#one-breath-contract`

When every clause is true and the block is still wrong, the fault is the shape: mechanism, the halves a patch keeps, a refusal
catalog, the rebirth case and the option semantics in one paragraph. The caller wants a first line, a pointer for the terms and
a list for the option values, as `#no-refusal-catalog` shows on `create`.

**Goofus:**

```ts
/** Seal `patch` over the record in hand and put it over that record's revision, resolving once storage's answer is received; a snapshot shows the change only then. A half the patch leaves out is kept: the sidecar is read off the record, and the whisper unsealed and resealed, as the stamp binds the sidecar. Refuses 'bad_option', naming the field, `opts` or a patch that fails {@link MSX.boxPatch}, before any guard; 'vault_locked', at the seal's end too, storing nothing; and 'stale_write' where the record moved, the record stored delivered first. On a box gone, this is its rebirth, its sidecar `{}` where left out, and a whisper left out refuses 'no_whisper'. A refusal leaves nothing behind.
 * Over a live record, storage decides by {@link MSX.ifPresentVals}; under `get`, the put resolves with the box holding what storage holds, `patch` discarded.
 */
async put(patch: BoxPatch, opts: SendOpts = {}): Promise<this>
```

**Gallant:**

```ts
/** Create or update the whisper and sidecar, encrypting whisper and sealing the box metadata
 * See {@link sealedRecordOf} for what "encrypting ... and sealing" mean
 * - `ifPresent:repl` (default): replaces (if in correct sequence);
 * - `ifPresent:fail` replace a void/tombstoned box, else fail
 * - `ifPresent:get`  returns an existing box
 */
async put(patch: BoxPatch, opts: BoxPutOpts = {}): Promise<this>
```

## The first line is one sentence, as long as its one fact `#one-sentence-headline`

The first line rests on the `/**` and is one whole sentence, so it reads with the code folded. It runs long only while it is
still one fact a caller must know before calling; a second fact goes on a line below, under a short headline. The test:
read the line aloud; a breath taken at "so", "as" or a semicolon marks where the second line begins. Three pairs, from
`models/box-listing.ts`, `storage/vault-db-new.ts` and `models/box.ts` on `main` at `fa7ff8e5`; the Gallant column is
proposed.

**Goes long: a refusal the caller meets in normal use is headline news.** `create` refusing a live box is the one thing a
caller checks before calling it, and with the file folded the first line is all they see.

**Goofus:**

```ts
/** Seals a new box and stores it.
 *
 * Refuses where a live box already stands under the scope, as `camped`. Answers the box listed. */
async create(input: BoxDna, opts: BoxCreateOpts = {}): Promise<Box>
```

**Gallant:**

```ts
/** Seals a new box and stores it where no live box stands, refusing one that does as `camped`; answers the box listed. */
async create(input: BoxDna, opts: BoxCreateOpts = {}): Promise<Box>
```

**Stays short: criteria are a description, not a headline.** `putVault` is the thrower of a put's refusals, so its block
carries them (`#no-refusal-catalog` exempts the thrower). Crammed into the first line they are a sentence nobody can hold;
under a one-line headline they are a list a caller can scan.

**Goofus:**

```ts
/** Stores `record` over the vault row standing at `prior`, landing where the row's revision_tok is `prior`'s or the row is void, else refusing `camped` under `ifPresent: 'fail'` over a live row, answering it `declined` under `'get'`, `vault_empty` or `vault_gone` under `ifAbsent: 'fail'` over a void or tombstoned row, and `stale_write` otherwise. */
async putVault(record: VaultRecord, opts: PutVaultOpts): Promise<GoodAnswer<VaultRow, PutAct>>
```

**Gallant:**

```ts
/** Stores `record` over the vault row standing at `prior`, as one conditional write.
 *
 * The write lands when the row stands where `prior` says: void, or at `prior`'s revision_tok. Where it does not, the row as
 * found decides:
 * * live, under `ifPresent: 'fail'`: refused as `camped`; under `'get'`: answered as it stands, act `declined`
 * * void or a tombstone, under `ifAbsent: 'fail'`: refused as `vault_empty` or `vault_gone`
 * * anything else: refused as `stale_write`; read the vault again and edit from the revision it answers. */
async putVault(record: VaultRecord, opts: PutVaultOpts): Promise<GoodAnswer<VaultRow, PutAct>>
```

**The tell: two facts glued.** A long first line is not wrong for being long; it is wrong when a "so" or an "as" joins the
act to a guarantee or a condition that is a fact of its own. The guarantee is the line worth writing (`#say-the-guarantee`),
and it gets its own line.

**Goofus:**

```ts
/** Seals `patch` over the record in hand as the next revision and stores it, so a lock landing once the write has begun neither interrupts nor reverses it, a sparse box being fetched first as a patch missing a half keeps the half stored. */
async put(patch: BoxPatch, opts: BoxPutOpts = {}): Promise<Box>
```

**Gallant:**

```ts
/** Seals `patch` over the record in hand as the next revision and stores it, answering the box.
 *
 * A lock does not interrupt or reverse a put once its write has begun. A patch leaving out the whisper or the sidecar keeps
 * the one stored, so a box held sparse is fetched first. */
async put(patch: BoxPatch, opts: BoxPutOpts = {}): Promise<Box>
```
