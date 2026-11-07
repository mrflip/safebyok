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
* **Here, from the old tree** (`packages/safebyok-old/src` at `b7bacb68`; the Coach accepted or wrote each Gallant, 2026-11-05):
  `#three-questions`, `#name-the-act`, `#one-verb-one-fact`, `#option-values-get-a-list`, `#point-dont-redefine`,
  `#customer-first`, `#guard-names-its-predicates`, `#reason-goes-above`, `#facts-from-the-code`, and a second specimen each
  for `#a-helper-gets-a-phrase`, `#purpose-not-machinery`, `#no-refusal-catalog`, `#say-what-to-do`, `#say-the-guarantee`
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

---

# From the old tree

Specimens an agent nominated from `packages/safebyok-old/src` at `b7bacb68`, one to three per tag; the Gallant is the one the Coach accepted or wrote on 2026-11-05. The paths are the old tree's.

## Answer the caller's three questions `#three-questions`

When do I call it, what do I get, what would I otherwise get wrong. Never who calls it, nor who judges the answer.

**Goofus:**

```ts
// device-db.ts:45
  /** Read the lease of one vault, or null for none. The core reads it through `KeptLease.tryGet`, which checks it and holds it closed; the vault judges whether it still fits. */
  async getLease(scope: VaultScope): Promise<KeptLeaseRow | null> {
```

Says who calls it and who judges the answer, not what the caller gets.

**Gallant:**

```ts
/** Get the lease cached for `scope`, or null for none. */
```

**Goofus:**

```ts
// shapes/vault.ts:141
/** One wayin as stored, a {@link PassphraseWayinRecord} or a {@link PasskeyWayinRecord}, told apart by `wayinkind`; `Wayin.make` reads one. */
export type WayinRecord = Z.infer<typeof wayinRecord>
```

A semicolon tacks on who reads it.

**Gallant:**

```ts
/** A wayin as stored: a {@link PassphraseWayinRecord} or a {@link PasskeyWayinRecord}, told apart by `wayinkind`. */
```

**Goofus:**

```ts
// bank.ts:582
  /** Refuse 'vault_gone' once `entry` is no longer the one the bank holds for `vaultScopepath`: let go, or let go and asked for anew. What a birth asks after each wait. */
  #demandHeld(vaultScopepath: Scopepath.VaultScopepath, entry: HeldEntry) {
```

Ends on its caller: "What a birth asks after each wait."

**Gallant:**

```ts
/** Demand that `entry` is still the one the bank holds for `vaultScopepath`. */
```

## A private helper gets a phrase, second specimen `#a-helper-gets-a-phrase`

The first specimen is `#unseal` in `notes/gallant.md`.

**Goofus:**

```ts
// vault.ts:1592
  /** The revision the listing names for the box under `boxlabel`, sound or damaged; null for none listed, or a damaged record that holds none.
   * Storage arbitrates a write that names it, so a listing gone stale costs a refusal and a second
   * store, never a record.
   */
  #listedRevisionOf(boxlabel: string): string | null { return this.#listedOf(boxlabel)?.revision_tok ?? null }
```

A private one-liner gets three lines: two null cases, then a reason about storage arbitration.

**Gallant:**

```ts
/** The listed revision_tok of the box under `boxlabel`, or null. */
```

## Not the body aloud, second specimens `#purpose-not-machinery`

The first pairs are in `notes/gallant.md`. Here, the state left behind told as participial absolutes, and a wait narrated.

**Goofus:**

```ts
// proving.ts:66
  /** Hold `lease`, which this proving made of the record it just stored, as the vault's lease: its expiry armed, the snapshot replaced. */
  holdLease:   (lease: Lease) => Lease
```

The state left behind, as participial absolutes: "its expiry armed, the snapshot replaced".

**Gallant:**

```ts
/** Hold `lease` as the vault's own, unlocking it. */
```

**Goofus:**

```ts
// proving.ts:165
  /** Demand that the gate's current wayin at its slotlabel opens under this proving, keeping nothing: 'wrong_passphrase' or 'wrong_passkey' when it will not.
   * It demands on the proving before and after its one wait, so a gate that moved meanwhile refuses
   * as the demand does, never as a wrong proof.
   */
  async demandOpens(): Promise<void> {
```

Narrates when it demands relative to its one wait, with a "so" clause giving the reason.

**Gallant:**

```ts
/** Demand that this proving opens the gate's current wayin at its slotlabel: a wrong proof refuses. */
```

## Name the act `#name-the-act`

A function that stores, wraps or attaches opens with that verb. A past-tense event or a participle phrase is a lookup's opening, not an act's.

**Goofus:**

```ts
// gating.ts:222
  /** A `lock()` landed, or the vault went gone, while it was pending: every waiter refuses 'vault_locked', or `told` when the lock was storage's refusal, and `lockLanded` settles. */
  landLock(told?: VaultError): void {
```

The first sentence describes an event in the past tense, not the act the method performs.

**Gallant:**

```ts
/** End this pending gating for a lock landed or a vault gone: every waiter refuses, and `lockLanded` settles. */
```

**Goofus:**

```ts
// proving.ts:157
  /** `vaultKey` wrapped under the wayinKey, bound to `visible`, a wayin's header in this vault: the wrap a wayin stores. */
  async wrappedWith(vaultKey: CryptoKey, visible: WayinHeader): Promise<VaultKeyWayinWrapped> {
```

Wraps a key, but opens with a participle phrase.

**Gallant:**

```ts
/** Wrap `vaultKey` under the wayinKey, bound to `visible`: the wrap a wayin stores. */
```

**Goofus:**

```ts
// helpers.ts:45
/** `val`, once attached to `obj` as the enumerable own property `propname`: {@link tattoo} for one prop. */
export function tattooProp<VT>(obj: object, propname: string, val: VT, opts: TattooOpts = {}): VT {
```

Attaches a property, but leads with what it returns.

**Gallant:**

```ts
/** Attach `val` to `obj` as the enumerable own property `propname`, and answer it. */
```

## One verb, one fact `#one-verb-one-fact`

Every sentence has a subject and a finite verb. A verb gapped out of a list, a stand-in "one", a trailing absolute: each is the cue to write the second sentence.

**Goofus:**

```ts
// shapes/bank-opts.ts:72
  /** What this device keeps of each vault, unless its {@link BankVaultOpts} names another: in a browser, from `browserOpts()`; elsewhere, `memoryDeviceDB()`. */
  deviceDB:   DeviceDB
```

The verb is gapped out of a semicolon list.

**Gallant:**

```ts
/** What this device keeps of each vault. Defaults to `browserOpts()` in a browser and `memoryDeviceDB()` elsewhere, unless a {@link BankVaultOpts} names another. */
```

**Goofus:**

```ts
// vault.ts:1972
/** The box `putBox()` seals, as its caller names it: its boxlabel, and its sidecar, left out to keep the one it has. */
export type PutBoxProps = { boxlabel: string, sidecar?: Sidecar | undefined }
```

A stand-in "one" inside a participle.

**Gallant:**

```ts
/** What a `putBox()` names: the boxlabel, and a sidecar. Leave the sidecar out to keep the stored one. */
```

**Goofus:**

```ts
// checks/validator.ts:160
  /** `val`, parsed: the call's kind otherwise, its message framed as `story` asks; 'bad_option' for a story that is none, whatever `val`. */
  parse: (val: unknown, story?: Story) => Z.output<SchemaT>
```

A participle lead, gapped refusals joined by a semicolon, and a trailing absolute; no finite verb.

**Gallant:**

```ts
/** Parse `val`, or throw the call's kind with a message framed as `story` asks. */
```

## Refusals are not a catalog, second specimen `#no-refusal-catalog`

The first pairs (`create`, `demandUnsealable`) are in `notes/gallant.md`.

**Goofus:**

```ts
// vault-opts.ts:210
/** Bank.make's options, checked and read, before storage is touched.
 * Refuses 'insecure_context' first, in a page the browser says is not a secure context. Then
 * 'bad_option' for anything but a bag, or for an option it does not take, of the wrong type or out
 * of range, every one it finds named in one refusal led by "In Bank.make's options"; then
 * 'bad_scope' for an `applabel` that is not a label or a `user_id` that fails its check; then
 * 'bad_option' for a key deriver a vault does not keep, or a clock that throws or reads out of
 * bounds. The limits are held to the default `vaultDB`'s here, and to a vault's own at its birth.
 */
export const parseMakeBankOpts = (opts: MakeBankOpts): ParsedBankOpts => {
```

Every refusal kind in throw order, chained with "then" and semicolons.

**Gallant:**

```ts
/** Check and read Bank.make's options before storage is touched. Every bad option is named in one refusal. */
```

## Say what to do, the detailed specimen `#say-what-to-do`

The small specimen is `vaultAt` in `notes/gallant.md`. This one the Coach wrote long on purpose: a cap a host tunes calls for the recipe and the limits. The reason it is soft went above, as `#reason-goes-above` asks; "lowering it afterwards is undefined" is a `notes/wontfix.md` fact as well.

**Goofus:**

```ts
// shapes/bank-opts.ts:127
  /** The most boxes the vault holds. Default: the smaller of {@link MaxBoxes}, 100, and the vaultDB's own `maxBoxes`.
   * `putBox()` refuses a new box past it as 'vault_full'. Replacing a box already there is always
   * allowed, and lowering it strands nothing stored. It may not exceed the vaultDB's `maxBoxes`, and
   * with `maxWhisperBytes` it must fit the vaultDB's `maxVaultBytes`.
   */
  maxBoxes?: number | undefined
```

States the 'vault_full' a caller meets in normal use, and gives no recipe for it.

**Gallant:**

```ts
// Best effort, not a hard cap: exact at moderate write rates; a strict cap would need concurrency machinery in every adapter.
/** A soft cap on the boxes a vault holds. Default: the smaller of {@link MaxBoxes}, 100, and the `maxBoxes` the vaultDB adapter advises.
 * A box past it refuses 'vault_full': delete one first, or relaunch with a larger value. Replacing or reading a box is
 * always allowed, even over the limit. Lowering it afterwards is undefined. */
```

## Option values get a list `#option-values-get-a-list`

One value a line, the default marked. Values gapped into a sentence, or told as policy prose, hide the one the caller is looking for. The `PutVaultOpts` Gallant is checked against `storage/vault-db-new.ts` and `memory-vault-db.ts` on `main`: a write lands only where the row stands at `prior`, a rebirth over a tombstone included, and `putVault` takes no `'repl'`.

**Goofus:**

```ts
// checks/validator.ts:301
/** How an {@link objCheck} validator refuses: `refuseAs`, the kind, 'bad_record' unless given; and `extras`, 'strict' (the default) to refuse a field the object does not take, or 'strip' to drop it unread. */
export interface ObjCheckOpts extends Z.input<typeof Checks.objCheckOpts> {}
```

Two options and their values gapped into one sentence, the default in parentheses. (`refuseAs` is `refusalkind` since PR #510: `#its-name-is-its-doc`.)

**Gallant:**

```ts
/** How an {@link objCheck} validator refuses.
 * - `refusalkind`      -- the kind thrown (default: 'bad_record')
 * - `extras: 'strict'` -- refuse a field the object does not take (default)
 * - `extras: 'strip'`  -- drop it unread */
```

**Goofus:**

```ts
// storage/vault-db-shapes.ts:141
/** Why a row is in `damaged_records`: `format_mismatch`, written by a newer version of the app, so updating the app may read it; `damaged_record`, anything else. */
export type Damagekind = typeof damagekindVals[number]
```

The two values gapped behind a semicolon, each explained in a clause.

**Gallant:**

```ts
/** Why a row sits in `damaged_records`.
 * - `format_mismatch` -- written by a newer version of the app; updating may read it
 * - `damaged_record`  -- anything else */
```

**Goofus:**

```ts
// storage/vault-db-shapes.ts:147
/** A vault row is replaced only by a gate verb: `putVault` births one, or finds one in the way. */
export type PutVaultOpts = Readonly<Z.input<typeof putVaultOpts>>
```

The values told as policy prose: neither one named, the default not marked. Proposed for `shapes-storage.ts`'s `PutVaultOpts` on the documentarian run.

**Gallant:**

```ts
/** `putVault`'s options. The write lands only where the row stands at `prior`: void, or that exact revision.
 * - `prior`             -- the revision the row must stand at; the void revision for a first birth
 * - `ifPresent: 'fail'` -- a live row refuses 'camped' (default)
 * - `ifPresent: 'get'`  -- a live row is answered as it stands, act 'declined'; nothing is written
 * - `ifAbsent: 'add'`   -- a void or tombstoned row at `prior` is written over: a birth, or a rebirth (default)
 * - `ifAbsent: 'fail'`  -- a void row refuses 'vault_empty', a tombstone 'vault_gone'
 * A row not at `prior` refuses 'stale_write': a rebirth names the tombstone's revision, not the void one. */
```

## Point, don't redefine `#point-dont-redefine`

A term with a home gets one `{@link}` or a pointer, never a second definition.

**Goofus:**

```ts
// box.ts:73
  /** The app's own JSON beside the whisper, `{}` when none: stored in the clear, never encrypted. */
  readonly sidecar:                Sidecar
```

Redefines sidecar, which `Sidecar` in shapes/box.ts already defines.

**Gallant:**

```ts
/** The box's {@link Sidecar}. */
```

**Goofus:**

```ts
// expectations.ts:25
/** True when a stored row is a tombstone, the mark a deleted vault leaves in its place: judged by its `format` alone.
 * A tombstone too damaged to parse still reads as one, so it is never taken for a vault record.
 */
export const isTombstone = (stored: unknown): boolean => fieldOf(stored, 'format') === TombstoneFormat
```

A predicate redefines tombstone in an appositive.

**Gallant:**

```ts
/** True when `stored` is a tombstone ({@link TombstoneFormat}), judged by its `format` alone. */
```

**Goofus:**

```ts
// gate.ts:92
  /** The gate as the vault record holds it, its `gate`: each wayin's record, the passkey's or null. Its `gate_epoch` rides beside it in the record. */
  get record(): GateRecord {
```

Redefines the gate record, which `GateRecord` in shapes/vault.ts already defines.

**Gallant:**

```ts
/** A plain {@link GateRecord} object of this gate and its wayins. */
```

## Words all three audiences can read `#customer-first`

Use words a front-end developer (the customer) or a regular person (the user) knows, that a security reviewer understands without ambiguity. For the reviewer, "Additional Associated Data"; for the developer, "bag of props turned into bytes, mixed in but not stored"; the doc says it so both read it. The Coach's pair; the Coach's "will not unwrap" stands: the specific verb, not "open".

**Goofus:**

```ts
// wayin.ts:100
  /** The ctx this wayin's wrap is bound to: the stamp of the vault record it is one of, its purpose, and its whole header. */
  get wayinCtx(): Uint8Array
```

"Ctx", "wrap" and "bound to" are the code's words; none of the three audiences learns what the binding does for them.

**Gallant:**

```ts
/** Serialized name/value pairs bound into the wrapped value as cryptographic context.
 * The value cannot be unwrapped unless the same bytes, unchanged, are independently provided along with the wrapping
 * key. Any change to that associated data, another user_id or a forged registered_at, will not unwrap. */
```

## The guarantee, second specimen `#say-the-guarantee`

The small specimen is `extractWhisper` in `notes/gallant.md`. There is no `leaseCtxOf` in the new tree yet; the Gallant goes with the lease ctx when it is built.

**Goofus:**

```ts
// lease.ts:31
/** The ctx a lease's wrap is bound to: its vault's stamp but for the format, the lease's own {@link LeaseStamp}, and the purpose.
 * Each stamp may come whole, a Vault object or a lease record: only its stamp fields are taken.
 * It refuses 'bad_record' for one missing any of them.
 */
export const leaseCtxOf = (vaultStamp: VaultStampButFormat, leaseStamp: LeaseStamp): Uint8Array => (
```

Spent on how the ctx is made and a refusal; what the binding prevents goes unsaid.

**Gallant:**

```ts
/** The ctx a lease's wrap is bound to. The wrap unwraps only under the vault and lease stamps it was sealed with: a lease copied to another vault or epoch will not unwrap. */
```

## A guard names its predicates `#guard-names-its-predicates`

A guard says what it asks, linked where the predicate has a name; not the kinds it refuses, and not its callers.

**Goofus:**

```ts
// vault.ts:1200
  /** The lease in hand, for `call` about to use it, demanded consistent with the picture and in force: 'vault_locked' with none. */
  #demandLease(call: VaultCall): Lease {
```

A guard written as a noun phrase, its predicates given as participles rather than named.

**Gallant:**

```ts
/** The lease in force. Refuses one absent, or inconsistent with the picture. */
```

**Goofus:**

```ts
// vault.ts:1135
  /** Refuse once this Vault object is gone: 'vault_remade' for a vault made anew, else 'vault_gone'. Ask it first in every call, and again after a wait with no thing in hand to demand. */
  #demandNotGone() {
```

Names the kinds it refuses, not the predicate it asks, then says who calls it.

**Gallant:**

```ts
/** Demand that this Vault object is not gone. */
```

## The reason goes above `#reason-goes-above`

A maintainer's note, an invariant kept or a reason, is a `//` comment above the doc block; the doc block says what the member does. The `isAllZero` pair landed as PR #510.

**Goofus:**

```ts
// bank.ts:412
  /** Publish the snapshot the private state makes now, and tell every listener: the one place the snapshot is swapped. Call it only once something changed. */
  #publish() {
```

An invariant for maintainers inside the doc block.

**Gallant:**

```ts
// The one place the snapshot is swapped. Call it only once something changed.
/** Publish the snapshot and tell every listener. */
```

**Goofus:**

```ts
// proving.ts:462
/** True when every byte of `bytes` is zero, read with no early exit, as libsodium's `sodium_is_zero` does.
 * No JavaScript engine promises constant time, but nothing here branches on a byte: only the
 * verdict steers what follows, and the refusal of an all-zero output tells that anyway.
 */
const isAllZero = (bytes: Uint8Array): boolean => bytes.reduce((seen, byte) => seen | byte, 0) === 0
```

The reason fills the block; and the `reduce`, though branch-free, does not read as the idiom a reviewer knows.

**Gallant:**

```ts
// Reads every byte with no early exit and no branch on a byte, as libsodium's sodium_is_zero does: `every` would exit
// early and `for of` would allocate an iterator. No JavaScript engine promises constant time; only the verdict steers what
// follows, and the refusal of an all-zero key tells that anyway.
/** True when every byte of `bytes` is zero. */
const isSafelyAllZero = (bytes: Uint8Array): boolean => {
  let   seen = 0
  const len  = bytes.length
  for (let ii = 0; ii < len; ii++) { seen |= bytes[ii] ?? 0 }
  return seen === 0
}
```

**Goofus:**

```ts
// storage/vault-db-shapes.ts:201
/** The tombstone of a vault row nothing holds. A damaged listing's label comes from storage, and is not checked here: it is part of what is reported. */
export const sentinelVaultOf = ({ applabel, user_id, vaultlabel }: VaultScope, vault_tok: string = VoidLifeTok): VaultTombstone => ({
```

A maintainer's note on what is not checked here, and why.

**Gallant:**

```ts
// The damaged listing's label comes from storage unchecked: it is part of what is reported.
/** The tombstone of a vault row nothing holds. */
```

## Facts come from the code `#facts-from-the-code`

A doc states what the body does, never what the old prose or a test title claimed. Where they disagree, write the code and raise it.

**Goofus:**

```ts
// proving.ts:146
  /** True when `vaultRecord`'s wayin at this proving's slotlabel carries its header: the proving opens the gate it holds. */
  isCarriedBy(vaultRecord: Pick<VaultRecord, 'gate'>): boolean {
```

Says the proving "opens the gate it holds"; the body only compares visible header fields.

**Gallant:**

```ts
/** True when `vaultRecord`'s wayin at this proving's slotlabel carries this proving's header. */
```

