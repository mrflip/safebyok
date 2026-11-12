# Goofus and Gallant: doc blocks

This file collects doc blocks in pairs, each under the principle it shows: Goofus is the slop, and Gallant is the block
that replaces it. Each principle has a hashtag to cite in a review, and `rg '#tag' notes/` finds its pair. A principle names
a kind of fault: hunt for it in the blocks this file does not show. Some principles have their first pair in
`notes/gallant.md`, under *Words*.

---

# Words

## Lead with the job `#lead-with-the-job`

The first line says what the call does, in the words the caller would use for the task. When a host calls it, and what a
refusal leaves behind, belong in the class's doc block, said once there or not at all. "A host may repeat" is a list of
callers in disguise.

**Goofus:**

```ts
/** A forced reset a host may repeat: lists what the vaultDB holds, tidies old leases, and starts the watch.
 * Refused, the bank is not ready; one a sweep crossed refuses only its own caller.
 */
async hello(): Promise<void>
```

**Gallant:**

```ts
/** Get-ready tasks: load packages, fetch the vault listing, start its watch */
async hello(): Promise<void>
```

A second specimen, on a pure function. Its second line describes the adapter's job, not this function's: `boxActOf` beside
it carried the same sentence, and `notes/answer-contract.md` already says it once.

**Goofus:**

```ts
// storage/classifier.ts
/** The act a vault's get, put or del amounts to over `vaultRaw`, the row stored at its scope or null for none.
 * Nothing is stored here: where {@link isWriteAct} holds of the act, the caller stores the request's record, in the atomic unit it fetched the row in.
 */
export function vaultActOf(request: VaultRequest, vaultRaw: unknown): VaultAct {
```

**Gallant:**

```ts
/** Classify a vault request's outcome, based on the stored row. */
```

## The outcome, not the branch tour `#outcome-not-branches`

A block that walks each path the method can take, with the state each leaves, is its control flow in prose. Say what the
caller has when it resolves, and any case that is an exception.

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

"As X does" sends the reader to another method to learn what this one does, and goes stale the day X changes. Say the condition.

**Goofus:**

```ts
/** Refuse 'vault_locked' while the vault is locked, as a box's `demandUnlocked` does. */
#demandUnlocked(): void
```

**Gallant:**

```ts
/** refuse `'vault_locked'` if locked, else no-op */
#demandUnlocked(): void
```

## The whole contract in one breath `#one-breath-contract`

When every clause is true and the block is still wrong, the fault is its shape. This Goofus packs the mechanism, the halves a
patch keeps, a refusal catalog, the rebirth case and the option semantics into one paragraph. The caller wants a first line, a
pointer to where the terms are defined, and a list of the option values, as `#no-refusal-catalog` shows on `create`.

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
 * - `prior`         -- the expected stored revision (or the sentinel void revision for a birth)
 * - `ifPresent`     -- how to handle a live row:
 *   - `'fail'`         -- refuse `'camped'`
 *   - `'get'`          -- return the existing stored record; act `'declined'`, ok `true`, nothing written
 *   - `'repl'`         -- overwrite and return the newly-stored record; act `'replaced'` (default)
 * - `ifAbsent`      -- how to handle a void / tombstoned row:
 *   - `'add'`          -- overwrite and return the newly-stored record; act `'born'` / `'reborn'` (default)
 *   - `'fail'`         -- refuse `'absent_box'`
 */
async put(patch: BoxPatch, opts: BoxPutOpts = {}): Promise<this>
```

## The first line is short; a surprise may lengthen it `#one-sentence-headline`

The first line starts on the `/**` and runs from a few words to a full line, so the essentials can be read with the code
folded. A second fact goes on a line below the short headline. The test: read the line aloud. Where you take a breath at
"so", "as" or a semicolon, the second line begins.

**A refusal the caller meets in normal use goes right under the headline.** A caller checks for a live box before calling
`create`, so that refusal goes on the line below the headline, not glued onto it.

**Goofus:**

```ts
/** Seal a new box and store it if no live box has its scope, refusing `'camped'` if one does; answers the box listed. */
async create(input: BoxDna, opts: BoxCreateOpts = {}): Promise<Box>
```

**Gallant:**

```ts
/** Seal and store a new box, returning the listed instance.
 * @see {@link put} for options; create defaults to `ifPresent: 'fail'`,
 * throwing `camped` if a record is already present
 */
async create(input: BoxDna, opts: BoxCreateOpts = {}): Promise<Box>
```

**The headline stays short: criteria are a description, not a headline.** `putVault` throws a put's refusals, so its block
lists them (`#no-refusal-catalog` exempts the thrower). Crammed into the first line, they make a sentence nobody can follow.
Under a one-line headline, they make a list a caller can scan.

**Goofus:**

```ts
/** Store `record` over the vault row standing at `prior`, landing where the row's revision_tok is `prior`'s or the row is void, else refusing `camped` under `ifPresent: 'fail'` over a live row, answering it `declined` under `'get'`, `vault_empty` or `vault_gone` under `ifAbsent: 'fail'` over a void or tombstoned row, and `stale_write` otherwise. */
async putVault(record: VaultRecord, opts: PutOpts): Promise<GoodAnswer<VaultRow, PutAct>>
```

**Gallant:**

```ts
/** Store `record` over the vault row at revision `prior`, as one conditional write.
 * See docs for PutOpts, but briefly:
 * - live, under `ifPresent: 'fail'`: refused as `'camped'`; under `'get'`: answered with the stored row, act `'declined'`
 * - void or a tombstone, under `ifAbsent: 'fail'`: refused as `'vault_empty'` or `'vault_gone'`
 * - anything else: refused as `'stale_write'`; read the vault again and edit from the revision it answers.
 */
async putVault(record: VaultRecord, opts: PutOpts): Promise<GoodAnswer<VaultRow, PutAct>>
```

**The tell: two facts glued together.** A long first line is not wrong for being long. It is wrong when a "so" or an "as"
joins the act to a guarantee or a condition that is a fact of its own. The guarantee is the line worth writing (`#say-the-guarantee`),
and it gets its own line.

**Goofus:**

```ts
/** Seal `patch` over the record in hand as the next revision and store it, so a lock landing once the write has begun neither interrupts nor reverses it, a sparse box being fetched first as a patch missing a half keeps the half stored. */
async put(patch: BoxPatch, opts: BoxPutOpts = {}): Promise<Box>
```

**Gallant:**

```ts
/** Merge `patch` over the record, seal it with the next revision, and store it, returning the listed box instance.
 *
 * A lock will not interrupt or reverse a put once its write has begun.
 * A patch that omits the whisper or the sidecar will not alter
 * that field, but may force an early refresh to get the prior value.
 * An empty patch will still be sent, updating the revision and so forth.
 */
async put(patch: BoxPatch, opts: BoxPutOpts = {}): Promise<Box>
```

## Answer the caller's three questions `#three-questions`

What do I get? How and when do I call it? What would I otherwise get wrong?
A well-chosen function name and signature often does most of the work
for you, so attend to that first: explain only what remains.

**Goofus:**

```ts
// device-db.ts
  /** Read the lease of one vault, or null for none. The core reads it through `KeptLease.tryPeek`, which checks it and holds it closed; the vault judges whether it still fits. */
  async peekLease(scope: VaultScope): Promise<KeptLeaseRow | null> {
```

From the signature: You get a lease; matching your scope; but sometimes null.
Left for the doc block to clarify: the source of the lease (cache, not vaultdb
or elsewhere) and the paths to each return (null when not found -- don't get
that wrong!)

**Gallant:**

```ts
/** The cached lease, or null for none. */
```

**Goofus:**

```ts
// shapes/vault.ts
/** One wayin as stored, a {@link PassphraseWayinRecord} or a {@link PasskeyWayinRecord}, told apart by `wayinkind`; `Wayin.make` reads one. */
export type WayinRecord = Z.infer<typeof wayinRecord>
```

"What do I get?" -- a stored wayin, details delegated to the two alternatives; "how do I use it?" -- selects on the `wayinkind`

**Gallant:**

```ts
/** A stored wayin: a tagged union on `wayinkind` of {@link PassphraseWayinRecord} and {@link PasskeyWayinRecord}. */
```

**Goofus:**

```ts
// bank.ts
  /** Refuse 'vault_gone' once `entry` is no longer the one the bank holds for `vaultScopepath`: let go, or let go and asked for anew. What a birth asks after each wait. */
  #demandHeld(vaultScopepath: Scopepath.VaultScopepath, entry: HeldEntry) {
```

Don't hypothesize a caller ("What a birth asks after each wait."): what does this method do for the caller?

**Gallant:**

```ts
/** Demand that the bank still holds `entry` at `vaultScopepath`. */
```

## A private helper gets a phrase, second specimen `#a-helper-gets-a-phrase`

The first specimen is `#unseal` in `notes/gallant.md`.

**Goofus:**

```ts
// vault.ts
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

The first pairs are in `notes/gallant.md`. These two tell the state left behind as participial absolutes, and narrate a wait.

**Goofus:**

```ts
// proving.ts
  /** Hold `lease`, which this proving made of the record it just stored, as the vault's lease: its expiry armed, the snapshot replaced. */
  holdLease:   (lease: Lease) => Lease
```

The state left behind, as participial absolutes: "its expiry armed, the snapshot replaced".

**Gallant:**

```ts
/** Attach `lease` to the vault and attend to any consequences (snapshot, expiry, notifications). */
  attachLease:   (lease: Lease) => Lease
```

**Goofus:**

```ts
// proving.ts
  /** Demand that the gate's current wayin at its slotlabel opens under this proving, keeping nothing: 'wrong_passphrase' or 'wrong_passkey' when it will not.
   * It demands on the proving before and after its one wait, so a gate that moved meanwhile refuses
   * as the demand does, never as a wrong proof.
   */
  async demandOpens(): Promise<void> {
```

Narrates when it demands relative to its one wait, with a "so" clause giving the reason.

**Gallant:**

```ts
/** Demand that this proving opens the gate's current wayin at its slotlabel. */
```

## Name the act `#name-the-act`

A function that stores, wraps or attaches opens with that verb. A past-tense event or a participle phrase may open a lookup's block, never an act's.

**Goofus:**

```ts
// gating.ts
  /** A `lock()` landed, or the vault went gone, while it was pending: every waiter refuses 'vault_locked', or `told` when the lock was storage's refusal, and `lockLanded` settles. */
  landLock(told?: VaultError): void {
```

The first sentence describes an event in the past tense, not the act the method performs.

**Gallant:**

```ts
/** End this pending gating (because vault `lock()`ed, or is gone, etc):
 * promised waiters are refused, notifications sent, other cleanup.
 */
```

**Goofus:**

```ts
// proving.ts
  /** `bankKey` wrapped under the wayinKey, bound to `visible`, a wayin's header in this vault: the wrap a wayin stores. */
  async wrappedWith(bankKey: CryptoKey, visible: WayinHeader): Promise<BankKeyWayinWrapped> {
```

Wraps a key, but opens with a participle phrase.

**Gallant:**

```ts
/** Wrap `bankKey` under the wayinKey, bound to `visible`: the wrap a wayin stores. */
```

**Goofus:**

```ts
// helpers.ts
/** `val`, once attached to `obj` as the enumerable own property `propname`: {@link tattoo} for one prop. */
export function tattooProp<VT>(obj: object, propname: string, val: VT, opts: TattooOpts = {}): VT {
```

Attaches a property, but leads with what it returns.

**Gallant:**

```ts
/** Attach `val` to `obj` as the enumerable own property `propname`, then return the `val`. */
```

## Replace multiple fragments with sentences `#use-sentences`

The usual signs are a semicolon joining two facts, a list with its verb gapped out, a stand-in "one", and a trailing absolute. Each is a cue to rewrite as a sentence, not a ban.

**Goofus:**

```ts
// shapes/bank-opts.ts
  /** What this device keeps of each vault, unless its {@link BankVaultOpts} names another: in a browser, from `browserOpts()`; elsewhere, `memoryDeviceDB()`. */
  deviceDB:   DeviceDB
```

The verb is gapped out of a semicolon list.

**Gallant:**

```ts
/** On-device cache interface -- selected from {@link BankVaultOpts}, or falls back to `browserOpts()` (in a browser) / `memoryDeviceDB()` (elsewhere). */
```

**Goofus:**

```ts
// vault.ts
/** The box `putBox()` seals, as its caller names it: its boxlabel, and its sidecar, left out to keep the one it has. */
export type PutBoxProps = { boxlabel: string, sidecar?: Sidecar | undefined }
```

A stand-in "one" inside a participle.

**Gallant:**

```ts
/** Payload of a `putBox()` operation: its boxlabel and replacement sidecar. Omitted fields will not be altered. */
```

**Goofus:**

```ts
// checks/validator.ts
  /** `val`, parsed: the call's kind otherwise, its message framed as `story` asks; 'bad_option' for a story that is none, whatever `val`. */
  parse: (val: unknown, story?: Story) => Z.output<SchemaT>
```

It opens with a participle, joins gapped refusals with a semicolon, and ends on a trailing absolute. It has no finite verb.

**Gallant:**

```ts
/** Parse `val`, or throw the call's kind with a message (templated using `story`). */
```

## Refusals are not a catalog, second specimen `#no-refusal-catalog`

The first pairs (`create`, `demandUnsealable`) are in `notes/gallant.md`.

**Goofus:**

```ts
// vault-opts.ts
/** Bank.make's options, checked and read, before storage is touched.
 * Refuses 'insecure_context' first, in a page the browser says is not a secure context. Then
 * 'bad_option' for anything but a bag, or for an option it does not take, of the wrong type or out
 * of range, every one it finds named in one refusal led by "In Bank.make's options"; then
 * 'bad_scope' for a `user_id` that fails its check or a `banklabel` that is not a label; then
 * 'bad_option' for a key deriver a vault does not keep, or a clock that throws or reads out of
 * bounds. The limits are held to the default `vaultDB`'s here, and to a vault's own at its birth.
 */
export function parseMakeBankOpts(opts: MakeBankOpts): ParsedBankOpts {
```

Every refusal kind in throw order, chained with "then" and semicolons.

**Gallant:**

```ts
/** Check and read Bank.make's options before storage is touched. Every bad option is named in one refusal. */
```

## Say what to do, the detailed specimen `#say-what-to-do`

A doc block may run long if it serves a purpose: a cap a host tunes calls for the recipe and the limits. We need the reason (`#reason-goes-above`); we need the refusals that the customer will act on (vault full); we need to establish a firm contract (promised: writes can be read. Not promised: the exact cap, or the ability to vary it).

**Goofus:**

```ts
// shapes/bank-opts.ts
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
 * A box past it refuses `'vault_full'`: delete one first, or relaunch with a larger value. Replacing or reading a box is
 * always allowed, even over the limit. Lowering it against a live datastore is unspecified behavior.
 */
```

## Option values get a list `#option-values-get-a-list`

List one value a line, and mark the default. Values gapped into a sentence, or told as policy prose, hide the value the caller is looking for.

**Goofus:**

```ts
// checks/validator.ts
/** How an {@link objCheck} validator refuses: `refuseAs`, the kind, 'bad_record' unless given; and `extras`, 'strict' (the default) to refuse a field the object does not take, or 'strip' to drop it unread. */
export interface ObjCheckOpts extends Z.input<typeof Checks.objCheckOpts> {}
```

Two options and their values gapped into one sentence, with the default in parentheses.

**Gallant:**

```ts
/** {@link objCheck} options:
 * - `refusalkind`      -- the kind thrown (default: `'bad_record'`)
 * - `extras: 'strict'` -- refuse a field the object does not take (default)
 * - `extras: 'strip'`  -- drop it unread
 */
```

**Goofus:**

```ts
// storage/vault-db-shapes.ts
/** A vault row is replaced only by a gate verb: `putVault` births one, or finds one in the way. */
export type PutOpts = Readonly<Z.input<typeof putOpts>>
```

The values told as policy prose.

**Gallant:**

```ts
/** `putVault`'s options enforce sequential writes (our edit never overwrites an edit made in between)
 * - `prior`         -- the expected stored revision (or the sentinel void revision for a birth)
 * - `ifPresent`     -- how to handle a live row:
 *   - `'fail'`         -- refuse `'camped'`
 *   - `'get'`          -- return the existing stored record; act `'declined'`, ok `true`, nothing written
 *   - `'repl'`         -- overwrite and return the newly-stored record; act `'replaced'` (default)
 * - `ifAbsent`      -- how to handle a void / tombstoned row:
 *   - `'add'`          -- overwrite and return the newly-stored record; act `'born'` / `'reborn'` (default)
 *   - `'fail'`         -- refuse `'vault_empty'` / `'vault_gone'`
 *
 * Refuses `'stale_write'` if the expected `prior` revision is not identical to the existing row's.
 */
```

## Point, don't redefine `#point-dont-redefine`

A term with a home gets one `{@link}` or a pointer, never a second definition.

**Goofus:**

```ts
// box.ts
  /** The app's own JSON beside the whisper, `{}` when none: stored in the clear, never encrypted. */
  readonly sidecar:                Sidecar
```

Redefines sidecar, which `Sidecar` in shapes/shapes-core.ts already defines.

**Gallant:**

```ts
/** The box's {@link Sidecar}. */
```

**Goofus:**

```ts
// expectations.ts
/** True when a stored row is a tombstone, the mark a deleted vault leaves in its place: judged by its `format` alone.
 * A tombstone too damaged to parse still reads as one, so it is never taken for a vault record.
 */
export function isTombstone(stored: unknown): boolean { return fieldOf(stored, 'format') === TombstoneFormat }
```

A predicate redefines tombstone in an appositive.

**Gallant:**

```ts
/** True when `stored` is a tombstone ({@link TombstoneFormat}), judged by its `format` alone. */
```

**Goofus:**

```ts
// gate.ts
  /** The gate as the vault record holds it, its `gate`: each wayin's record, the passkey's or null. Its `gate_epoch` rides beside it in the record. */
  get record(): GateRecord {
```

Redefines the gate record, which `GateRecord` in shapes/vault.ts already defines.

**Gallant:**

```ts
/** A plain {@link GateRecord} object of this gate and its wayins. */
```

## Words all three audiences can read `#customer-first`

Use words that a front-end developer (the customer) or a regular person (the user) knows, and that a security reviewer
understands without ambiguity. A security reviewer reads "additional associated data". A developer reads "a bag of props
turned into bytes, mixed in but not stored". Word it so both can read it: use none of our abbreviations, and no "it is one
... header" slop.

**Goofus:**

```ts
// wayin.ts
  /** The ctx this wayin's wrap is bound to: the stamp of the vault record it is one of, its purpose, and its whole header. */
  get wayinCtx(): Uint8Array
```

"Ctx", "wrap" and "bound to" are the code's words; none of the three audiences learns what the binding does for them.

**Gallant:**

```ts
/** Serialized name/value pairs bound into the wrapped value as cryptographic context.
 * The value cannot be unwrapped unless the same bytes, unchanged, are independently provided along with the wrapping
 * key. With any change to that associated data, such as another `user_id` or a forged `registered_at`, it will not unwrap.
 */
```

## Plain English `#plain-english`

Every word can be ordinary and the sentence still be one nobody would say. Say the line to someone who has not opened the
file: if they would ask "meaning what?", write the answer to that question. `#customer-first` is about our jargon. This one is
about plain words in a private phrasing. The gallant line is usually shorter than the signature under it.

**Goofus:**

```ts
// storage/classifier.ts
/** The classifier of the answer contract: the one act a get, put or del amounts to over the rows stored. Its tables are `notes/answer-contract.md`. */
```

Two prepositions in a row ("amounts to over"), and "the one act" where "an act" was meant.

**Gallant:**

```ts
/** Classify a get, put or del against the stored rows, per the tables in `notes/answer-contract.md`. */
```

**Goofus:**

```ts
// storage/classifier.ts
/** What a classification finds, bare of its level: an act that stores or answers, or what a refusal is over. */
type Verdict = WriteAct | FoundAct | 'damaged' | 'void' | 'gone' | 'camped' | 'dubdel' | 'stale' | 'retcon' | 'clash' | 'forked' | 'ahead'
```

Invented figures of speech: "bare of its level", "what a refusal is over". Nothing says "level" means box or vault.

**Gallant:**

```ts
/** A classification's outcome, before it is named for box or vault: store, answer, or a refusal's reason. */
```

**Goofus:**

```ts
// storage/classifier.ts
/** How a box request citing `vault_tok` finds `vault`, its vault's row. */
function gateOf(vault: Found<VaultRow>, vault_tok: string): Exclude<Gate, 'full'> {
```

A "How a foo verbs" opening, its verb a metaphor: "finds" stands for "the state it is in".

**Gallant:**

```ts
/** Classify the state of a box request's vault from its stored row. */
```

## The guarantee `#say-the-guarantee`

**Goofus:**

```ts
// lease.ts
/** The ctx a lease's wrap is bound to: its vault's stamp but for the format, the lease's own {@link LeaseStamp}, and the purpose.
 * Each stamp may come whole, a Vault object or a lease record: only its stamp fields are taken.
 * It refuses 'bad_record' for one missing any of them.
 */
export function leaseCtxOf(vaultStamp: VaultStampButFormat, leaseStamp: LeaseStamp): Uint8Array {
```

The block spends its words on how the ctx is made and on a refusal, and never says what the binding is for.

**Gallant:**

```ts
/** The metadata a lease's wrapped key is bound to.
 * The key unwraps only if given the same vault and lease stamps
 * that were sealed alongside it -- any drift (vault epoch, device)
 * prevents unwrap.
 */
```

## A guard names its predicates `#guard-names-its-predicates`

A guard says what it asks, with a link where the predicate has a name. It does not list the kinds it refuses, or its callers.

**Goofus:**

```ts
// vault.ts
  /** The lease in hand, for `call` about to use it, demanded consistent with the picture and in force: 'vault_locked' with none. */
  #demandLease(call: VaultCall): Lease {
```

A guard written as a noun phrase, with its predicates given as participles rather than named.

**Gallant:**

```ts
/** The lease in force. Refuses if absent or inconsistent with the given props. */
```

**Goofus:**

```ts
// vault.ts
  /** Refuse once this Vault object is gone: 'vault_remade' for a vault made anew, else 'vault_gone'. Ask it first in every call, and again after a wait with no thing in hand to demand. */
  #demandNotGone() {
```

Names the kinds it refuses, not the predicate it asks, then says who calls it.

**Gallant:**

```ts
/** Demand that this Vault object is not gone. */
```

## The reason goes above `#reason-goes-above`

A maintainer's note, such as an invariant kept or a reason, is a `//` comment above the doc block. The doc block says what the member does.

**Goofus:**

```ts
// bank.ts
  /** Publish the snapshot the private state makes now, and tell every listener: the one place the snapshot is swapped. Call it only once something changed. */
  #publish() {
```

An invariant for maintainers inside the doc block.

**Gallant:**

```ts
// Nothing else swaps the snapshot. Call it only once something changed.
/** Publish the snapshot and tell every listener. */
```

**Goofus:**

```ts
// proving.ts
/** True when every byte of `bytes` is zero, read with no early exit, as libsodium's `sodium_is_zero` does.
 * No JavaScript engine promises constant time, but nothing here branches on a byte: only the
 * verdict steers what follows, and the refusal of an all-zero output tells that anyway.
 */
function isAllZero(bytes: Uint8Array): boolean { return bytes.reduce((seen, byte) => seen | byte, 0) === 0 }
```

The reason fills the block. And the `reduce`, though branch-free, does not read as the idiom a reviewer knows.

**Gallant:**

```ts
// Reads every byte with no early exit and no branch on a byte, as libsodium's sodium_is_zero does: `every` would exit
// early and `for of` would allocate an iterator. No JavaScript engine promises constant time; only the verdict steers what
// follows, and the refusal of an all-zero key tells that anyway.
/** True when every byte of `bytes` is zero. */
function isSafelyAllZero(bytes: Uint8Array): boolean {
  let   seen = 0
  const len  = bytes.length
  for (let ii = 0; ii < len; ii++) { seen |= bytes[ii] ?? 0 }
  return seen === 0
}
```

**Goofus:**

```ts
// storage/vault-db-shapes.ts
/** The tombstone of a vault row nothing holds. A damaged listing's label comes from storage, and is not checked here: it is part of what is reported. */
export function sentinelVaultOf({ user_id, banklabel, vaultlabel }: VaultScope, vault_tok: string = VoidLifeTok): VaultTombstone {
```

A maintainer's note on what is not checked here, and why.

**Gallant:**

```ts
// The damaged listing's label comes from storage unchecked: it is part of what is reported.
/** A synthetic sentinel tombstone representing an absent ('void') row. */
```

## Facts come from the code `#facts-from-the-code`

A doc states what the body does, never what the old prose or a test title claimed. Where they disagree, write what the code does, and flag the disagreement.

**Goofus:**

```ts
// proving.ts
  /** True when `vaultRecord`'s wayin at this proving's slotlabel carries its header: the proving opens the gate it holds. */
  isCarriedBy(vaultRecord: Pick<VaultRecord, 'gate'>): boolean {
```

It says the proving "opens the gate it holds", but the body only compares visible header fields.

**Gallant:**

```ts
/** True when `vaultRecord`'s wayin at this proving's slotlabel carries this proving's header. */
```

## Slop tropes

These phrases are not the house style: they are glossolallia from agents, and unclear.

```
Goofus: Among other issues, the specific slop tell is "as stored"
    /** Puts `record`, the vault row at `opts.prior` with no passkey wayin and its `gate_epoch` one up; a row with none answers as stored. */
Gallant: 'answers with' might be acceptable (it returns an `Answer`); but the jsdoc convention here wins:
    /** Puts the properly revisioned `record`, demanding a new `gate_epoch` and that the passkey is absent.
     * @returns an answer with the stored row: @see {@link putVault}
     */

Goofus: "where it is", "as a"; use specific terms ('names'), lead with a verb, look to the name
    /** `stored` where it is a vault row live in the life `asked` names; else throws as a box's call refuses for its vault. */
Gallant:
    /** Return the given `stored` vault, if live at the asked-for `vault_tok`. Otherwise throw
     * the appropriate refusal: `absent_vault` for a void or tombstoned vault, `vault_reborn` for another life.
     */

Goofus: "the policy that speaks": a policy doesn't speak; say which one applies
    // The policy that speaks: `ifPresent` over a live row, `ifAbsent` over a tombstone or none.
Gallant:
    // The policy that applies: `ifPresent` over a live row, `ifAbsent` over a tombstone or void row.

Goofus: "the vault's room", "gauged": a private figure for a type that has a name (`Capacity`)
/** The rows an adapter fetched for a box's ask, as stored and unchecked: its vault row as `world` and the box row, each null for none, and the vault's room where the adapter gauged it. */
Gallant:
    /** The rows an adapter fetched for a box request, unchecked:
     * - `box`      -- the stored box row, as fetched before any write (null for none)
     * - `world`    -- the vault row, fetched in the same step (null for none)
     * - `capacity` -- the vault's {@link Capacity} stats, for adapters that return it
     */

Goofus: "what the ask comes to", "names a write": the verb is classify, and a classifier finds
    // it checks its ask with the core's own checker, reads the rows, has the core's classifier name what the ask comes to, and stores the ask's record where that is a write.
Gallant:
    // * check its ask with the core's checker,
    // * read the stored rows,
    // * classify the ask with the core's classifier, then
    // * store the ask's record if the classifier instructs it to write

Goofus: "What a vault's ask comes to over the row stored": the same figure, as a type's headline
    /** What a vault's ask comes to over the row stored. `ok` is true for a good answer and false for a refusal, and `act` says which. */
Gallant:
    /** A vault request, classified against the stored row.
     * - `ok`  -- true for a good answer, false for a refusal
     * - `act` -- directs how to route and handle the answer
     */

Goofus: "as storage hands it up": hands up to whom? say where it came from and that it is unchecked. "under": not a precise term
    /** A vault row as storage hands it up, unchecked, under its vaultlabel. */
Gallant:
    /** A vault row from storage, unchecked, with its vaultlabel. */

Goofus: "the refusals that cross": cross what? name the sender, the carrier and the receiver
    /** The kinds of refusal that cross: the wrapper's `identity_revoked`, and those the core throws inside the component for an ask or a row stored. */
Gallant: essentials on the first line, continues to the details
    /** The refusal kinds a `ConvexError` from the host's safebyok functions may carry:
     * `identity_revoked` from the wrapper, and the kinds the core throws inside the component.
     */

Goofus: "with one laid on and its `gate_epoch` one up": the same figure, plus a count told as a direction
    /** Puts `record`, the vault row at `opts.prior`, which has no passkey wayin, with one laid on and its `gate_epoch` one up. */
Gallant: A long line is appropriate here
    /** Put the properly revisioned `record`, demanding a new `gate_epoch` and that its only change is to add a passkey wayin.
     * Refuses `camped` when a passkey wayin is already stored.
     */

Goofus: "the front door", "name one door": an entry point is an entry point
    // Kept off the front door (`safebyok`) so a host's autocomplete never meets the adapter's contract, and an adapter's imports name one door.
Gallant:
    // Kept out of the main entry (`safebyok`), so a host's autocomplete never shows the adapter contract, and an adapter imports from one place.

Goofus: "the row in hand it goes over": in whose hand? say which row and what is done with it
    /** The next record `patch` makes, sealed and not put, and the row in hand it goes over. */
Gallant:
    /** The next record for `patch`, sealed but not yet put, with the row it is put over. */

Goofus: "the vault above a box": rows have no height; say whose row it is
    /** The vault row above a box's ask, as stored at its scope: the sentinel row for none. Throws `damaged_vault` for a row that fails its checks. */
Gallant: only the essentials go on the first line.
    /** The stored vault row of a box request, or the sentinel row for none.
     * Throws `damaged_vault` for a row that fails its checks.
     */

Goofus: "for the vaultDB's handler to tell of": which handler, telling whom? name the class and what it does
    // A row that fails its checks is thrown, for the vaultDB's handler to tell of.
Gallant:
    // A row that fails its checks throws, and `AdapterVaultDB` turns the throw into a refused answer.

Goofus: "Damaged is a judgment of the row taken alone", "the words of the check that found it": define the term plainly
    // Both faults of a row are thrown, each with the words of the check that found it. Damaged is a judgment of the row taken alone: it fails its own checks.
Gallant:
    // A faulty row throws, with the message of the check that failed. A row is damaged when it fails its own checks.

Goofus: "the brand a model knows a vaultDB by": say what the value is for
    /** True: the brand a model knows a vaultDB by, from whichever copy of safebyok. */
Gallant:
    // Brands are implemented this way to avoid various flaws that branding by string props, private symbols, weak maps, or instanceof present
    /** Always true: marks a vaultDB for safe branding. */

Goofus: "rides along in a spread": a spread copies. (Also: don't document what the declaration already says)
    // A getter on the class, never an own field, so the brand neither serializes nor rides along in a spread.
Gallant:
    // A getter ensures the brand is neither serialized nor copied by a spread.

Goofus: "only the scope is pinned": pinned means checked
    // A passed put answers what storage has, whose revision no one sent: only the scope is pinned.
Gallant:
    // An `act: 'passed'` put returns the stored row. Its revision does not match the one sent, so only its scope is checked.

Goofus: "a gate moved elsewhere arrives with it", "takes it": a gate is changed, on another device; a listing receives
    // The vault listing takes it as it takes any vault row: a gate moved elsewhere arrives with it, and a newer row of another life replaces this Vault there.
Gallant:
    // The vault listing receives the `world` as it would a row from any vault request:
    // a gate changed on another device comes with it, and a newer row from another life
    // replaces this Vault in the listing.

Goofus: "hears on a later tick", "the transaction that told it": a listener is called, on a microtask
    // Each heeder hears on a later tick, so that nothing it does touches the transaction that told it.
Gallant:
    // Each listener is called on a later microtask, so nothing it does runs inside the write that notified it.

Goofus: "keeps its delete waiting": the delete is blocked
    // The old databases are deleted unread and never awaited: a tab still keeping one open keeps its delete waiting (notes/wontfix.md).
Gallant:
    // The old databases are deleted unread and never awaited: a tab that still has one open blocks its delete (notes/wontfix.md).

Goofus: "The wipe is hygiene": housekeeping is the word the reader knows
    // The wipe is hygiene, so a browser that cannot list them keeps its older versioned ones rather than failing the vault.
Gallant:
    // The wipe is housekeeping: a browser that cannot list them keeps its older versioned ones rather than failing the vault.

Goofus: "what to answer over none": name the option, and the case it covers
    /** What `getBox` is asked: the box's address, the row its caller holds or the sentinel for none, and what to answer over none. */
Gallant:
    /** A `getBox` request: the box's address, the expected row (or sentinel), and the `ifAbsent` option (see `VaultDB.getBox`). */

Goofus: "`passed` for the live row taken up": taken up by whom? say what is stored and what is returned
    /** What a put's answer says happened: `born` over nothing, `reborn` over a tombstone, `replaced` a live row, or `passed` for the live row taken up. */
Gallant:
    /** A put's act:
     * - `born`     -- stored where no row was
     * - `reborn`   -- stored over a tombstone
     * - `replaced` -- stored over a live row
     * - `passed`   -- (for `ifPresent: 'get'`) nothing stored, the answer's `val` is the live row found
     */

Goofus: "null tallies nothing": null is a value, not an actor
    /** The tally of `boxDoc` alone; null tallies nothing. */
Gallant:
    /** The tally of `boxDoc` alone, or an empty tally for null. */

Goofus: "the rows the notice had room for": say what decides it: whether they fit
    /** A parsed notice: the address of the row stored, plus the rows the notice had room for. */
Gallant:
    /** A parsed notice: the stored row's address, and the rows that fit the byte-size limit. */

Goofus: "Unheard, ...; heard, ...": a handler is attached or not
    // Unheard, a dropped connection crashes the process; heard, every watch goes quiet until you listen again.
Gallant:
    // Without this handler, a dropped connection crashes the process. With it, every watch goes quiet until you listen again.

Goofus: "behind the same gate": the sign-in check is not the Gate; gate means `Gate` and `vault.gate` only
    the rest, behind the same gate: a host calls `tidyGone({ user_id, banklabel })` on its
Gallant:
    the rest, behind the same sign-in check: a host calls `tidyGone({ user_id, banklabel })` on its

```
