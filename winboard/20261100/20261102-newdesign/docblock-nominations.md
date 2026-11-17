# Doc-block nominations: old-tree Goofus specimens for each tag in docblock-reform.md *Comments and doc blocks*

**Status (2026-11-05):** merged. The accepted pairs are in `notes/gallant-docblocks.md` *From the old tree* and `#its-name-is-its-doc` in `notes/gallant.md`; the two code changes are PR #510. Dropped: `checkedPassphraseHeader` (the Coach: not a great example while the name is absurd). Corrected on merge: `PutVaultOpts` (no `'repl'`; a rebirth names the tombstone's revision), `maxBoxes` (the reason moved above), `isAllZero`'s comment (no claim of constant time).
Read at `b7bacb68`, from `packages/safebyok-old/src/`. Nominees best first. Each carries a **Gallant, proposed** by the agent from the Goofus text alone, without reading the old tree:
for the Coach to accept, edit or replace.

## a-helper-gets-a-phrase

```ts
// packages/safebyok-old/src/vault.ts:1592
  /** The revision the listing names for the box under `boxlabel`, sound or damaged; null for none listed, or a damaged record that holds none.
   * Storage arbitrates a write that names it, so a listing gone stale costs a refusal and a second
   * store, never a record.
   */
  #listedRevisionOf(boxlabel: string): string | null { return this.#listedOf(boxlabel)?.revision_tok ?? null }
```

A private one-liner gets three lines: two null cases, then a reason about storage arbitration.

**Gallant, proposed:**
```ts
/** The listed revision_tok of the box under `boxlabel`, or null. */
```

```ts
// packages/safebyok-old/src/bank.ts:435
  /** The scope of the vault `bag` names, frozen, once it holds only names that pass their checks and is of the bank's scope: 'bad_scope' otherwise, the comparison {@link Bank.demandConsistentWith} makes. */
  #vaultScopeOf(bag: VaultBag): VaultScope {
```

A private helper carries its refusal kind and names the exported comparison it makes.

**Gallant, proposed:**
```ts
/** The checked, frozen VaultScope of `bag`. */
```

```ts
// packages/safebyok-old/src/vault.ts:1610
  /** Get the box under `boxlabel` through `#getBox`, once `#ensureUnlocked` has the vault unlocked; null when there is none, and at once, asking nobody, when a locked vault's listing shows none. */
  async #getBoxUnlocked(boxlabel: string, call: VaultCall): Promise<Box | null> {
```

A private helper restates getBox's contract: the helpers it reaches, the null cases, the no-prompt path.

**Gallant, proposed:**
```ts
/** The box under `boxlabel`, the vault unlocked first; null for none. */
```

## three-questions

```ts
// packages/safebyok-old/src/device-db.ts:45
  /** Read the lease of one vault, or null for none. The core reads it through `KeptLease.tryGet`, which checks it and holds it closed; the vault judges whether it still fits.
   *
   * @example await deviceDB.getLease({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })  // null
   */
  async getLease(scope: VaultScope): Promise<KeptLeaseRow | null> {
```

Says who calls it (`KeptLease.tryGet`) and who judges the answer, not what the caller gets.

**Gallant, proposed:**
```ts
/** Get the lease cached for `scope`, or null for none. */
```

```ts
// packages/safebyok-old/src/shapes/vault.ts:141
/** One wayin as stored, a {@link PassphraseWayinRecord} or a {@link PasskeyWayinRecord}, told apart by `wayinkind`; `Wayin.make` reads one. */
export type WayinRecord = Z.infer<typeof wayinRecord>
```

A semicolon tacks on who reads it: "`Wayin.make` reads one".

**Gallant, proposed:**
```ts
/** A wayin as stored: a {@link PassphraseWayinRecord} or a {@link PasskeyWayinRecord}, told apart by `wayinkind`. */
```

```ts
// packages/safebyok-old/src/bank.ts:582
  /** Refuse 'vault_gone' once `entry` is no longer the one the bank holds for `vaultScopepath`: let go, or let go and asked for anew. What a birth asks after each wait. */
  #demandHeld(vaultScopepath: Scopepath.VaultScopepath, entry: HeldEntry) {
```

Ends on its caller: "What a birth asks after each wait."

**Gallant, proposed:**
```ts
/** Demand that `entry` is still the one the bank holds for `vaultScopepath`. */
```

## purpose-not-path

```ts
// packages/safebyok-old/src/passphrase-strength.ts:45
/** A verdict that admits, frozen so that a checker may share it. */
export const StrongVerdict: PassphraseVerdict = Object.freeze({ strong: true })
```

A design decision given as its reason: "frozen so that a checker may share it".

**Gallant, proposed:**
```ts
// Frozen: a checker may share it.
/** The verdict that admits a passphrase. */
```

```ts
// packages/safebyok-old/src/checks/validator.ts:1
/** `Checkers`, `Checker` and `objCheck`, where every validator is made, and the {@link Kit} its builders are handed; and `consistent`, `demandConsistent` and `verifyConsistent`, which hold one bag to another, as a validator's `parseConsistent` does. */
```

Echoes the project rule it answers ("where every validator is made") instead of saying what the module is.

**Gallant, proposed:**
```ts
/** The validator builders `Checkers`, `Checker` and `objCheck`, and the `consistent` family that holds one bag to another. */
```

```ts
// packages/safebyok-old/src/storage/vault-db-shapes.ts:78
    /** Which generation of the whisper's own shape this box holds: 1, the only one so far. */
    whisper_schema_version: lit(1),
```

Looks ahead in a field doc: "1, the only one so far".

**Gallant, proposed:**
```ts
/** Which generation of the whisper's own shape this box holds. */
```

## purpose-not-machinery

```ts
// packages/safebyok-old/src/gating.ts:201
  /** Run it, once the vault holds it as its pending gating: the pantry consult first when `renewMillis` is given, then the host's request. */
  run(renewMillis: number | null): void {
```

Reads out the body's steps in order: the pantry consult first, then the host's request.

**Gallant, proposed:**
```ts
/** Start this gating, now that the vault holds it as pending.
 * @param renewMillis - given, the pantry is tried before the host is asked
 */
```

```ts
// packages/safebyok-old/src/proving.ts:66
  /** Hold `lease`, which this proving made of the record it just stored, as the vault's lease: its expiry armed, the snapshot replaced. */
  holdLease:   (lease: Lease) => Lease
```

Gives the state left behind as participial absolutes: "its expiry armed, the snapshot replaced".

**Gallant, proposed:**
```ts
/** Hold `lease` as the vault's own, unlocking it. */
```

```ts
// packages/safebyok-old/src/proving.ts:165
  /** Demand that the gate's current wayin at its slotlabel opens under this proving, keeping nothing: 'wrong_passphrase' or 'wrong_passkey' when it will not.
   * It demands on the proving before and after its one wait, so a gate that moved meanwhile refuses
   * as the demand does, never as a wrong proof.
   *
   * @example await proving.demandOpens()   // a passphrase proven before the passkey goes
   */
  async demandOpens(): Promise<void> {
```

Narrates when it demands relative to its one wait, with a "so" clause giving the reason.

**Gallant, proposed:**
```ts
/** Demand that this proving opens the gate's current wayin at its slotlabel: a wrong proof refuses. */
```

## name-the-act

```ts
// packages/safebyok-old/src/gating.ts:222
  /** A `lock()` landed, or the vault went gone, while it was pending: every waiter refuses 'vault_locked', or `told` when the lock was storage's refusal, and `lockLanded` settles. */
  landLock(told?: VaultError): void {
```

The first sentence describes an event in the past tense, not the act the method performs.

**Gallant, proposed:**
```ts
/** End this pending gating for a lock landed or a vault gone: every waiter refuses, and `lockLanded` settles. */
```

```ts
// packages/safebyok-old/src/proving.ts:157
  /** `vaultKey` wrapped under the wayinKey, bound to `visible`, a wayin's header in this vault: the wrap a wayin stores.
   *
   * @example const wrapped = await proving.wrappedWith(vaultKey, proving.header)
   */
  async wrappedWith(vaultKey: CryptoKey, visible: WayinHeader): Promise<VaultKeyWayinWrapped> {
```

Wraps a key, but opens with a participle phrase: "`vaultKey` wrapped under the wayinKey".

**Gallant, proposed:**
```ts
/** Wrap `vaultKey` under the wayinKey, bound to `visible`: the wrap a wayin stores. */
```

```ts
// packages/safebyok-old/src/helpers.ts:45
/** `val`, once attached to `obj` as the enumerable own property `propname`: {@link tattoo} for one prop.
 *
 * @example tattooProp(this, 'vault_tok', vault_tok, { writable: false })   // => vault_tok; Object.keys(this) includes it
 */
export function tattooProp<VT>(obj: object, propname: string, val: VT, opts: TattooOpts = {}): VT {
```

Attaches a property, but leads with what it returns: "`val`, once attached to `obj`".

**Gallant, proposed:**
```ts
/** Attach `val` to `obj` as the enumerable own property `propname`, and answer it. */
```

## one-verb-one-fact

```ts
// packages/safebyok-old/src/shapes/bank-opts.ts:72
  /** What this device keeps of each vault, unless its {@link BankVaultOpts} names another: in a browser, from `browserOpts()`; elsewhere, `memoryDeviceDB()`. */
  deviceDB:   DeviceDB
```

The verb is gapped out of a semicolon list: "in a browser, from ...; elsewhere, ...".

**Gallant, proposed:**
```ts
/** What this device keeps of each vault. Defaults to `browserOpts()` in a browser and `memoryDeviceDB()` elsewhere, unless a {@link BankVaultOpts} names another. */
```

```ts
// packages/safebyok-old/src/vault.ts:1972
/** The box `putBox()` seals, as its caller names it: its boxlabel, and its sidecar, left out to keep the one it has. */
export type PutBoxProps = { boxlabel: string, sidecar?: Sidecar | undefined }
```

A stand-in "one" inside a participle: "left out to keep the one it has".

**Gallant, proposed:**
```ts
/** What a `putBox()` names: the boxlabel, and a sidecar. Leave the sidecar out to keep the stored one. */
```

```ts
// packages/safebyok-old/src/checks/validator.ts:160
  /** `val`, parsed: the call's kind otherwise, its message framed as `story` asks; 'bad_option' for a story that is none, whatever `val`. */
  parse: (val: unknown, story?: Story) => Z.output<SchemaT>
```

A participle lead, gapped refusals joined by a semicolon, and a trailing absolute; no finite verb.

**Gallant, proposed:**
```ts
/** Parse `val`, or throw the call's kind with a message framed as `story` asks. */
```

## no-refusal-catalog

```ts
// packages/safebyok-old/src/vault-opts.ts:210
/** Bank.make's options, checked and read, before storage is touched.
 * Refuses 'insecure_context' first, in a page the browser says is not a secure context. Then
 * 'bad_option' for anything but a bag, or for an option it does not take, of the wrong type or out
 * of range, every one it finds named in one refusal led by "In Bank.make's options"; then
 * 'bad_scope' for an `applabel` that is not a label or a `user_id` that fails its check; then
 * 'bad_option' for a key deriver a vault does not keep, or a clock that throws or reads out of
 * bounds. The limits are held to the default `vaultDB`'s here, and to a vault's own at its birth.
 *
 * @example const { applabel, user_id, leaseMillis } = parseMakeBankOpts(opts)
 */
export const parseMakeBankOpts = (opts: MakeBankOpts): ParsedBankOpts => {
```

Lists every refusal kind in throw order, chained with "then" and semicolons.

**Gallant, proposed:**
```ts
/** Check and read Bank.make's options before storage is touched. Every bad option is named in one refusal. */
```

```ts
// packages/safebyok-old/src/gating.ts:47
  /** Settles only when a `lock()` lands while the gating is pending, or the vault goes gone: close the dialog.
   * Every call waiting on it is then refused: 'vault_locked' for a lock, 'vault_gone' or
   * 'vault_remade' for a vault gone, and storage's own refusal for a lock that refusal made
   * ('identity_revoked', 'vault_behind'). A deletion whose write is sent is past its reach: it
   * settles only once storage refuses that write.
   */
  readonly lockLanded: Promise<void>
```

Lists the refusal each waiting call meets, case by case, in the doc of a promise member.

**Gallant, proposed:**
```ts
/** Settles when a `lock()` lands or the vault goes gone while the gating is pending: close the dialog. */
```

## say-what-to-do

```ts
// packages/safebyok-old/src/shapes/bank-opts.ts:127
  /** The most boxes the vault holds. Default: the smaller of {@link MaxBoxes}, 100, and the vaultDB's own `maxBoxes`.
   * `putBox()` refuses a new box past it as 'vault_full'. Replacing a box already there is always
   * allowed, and lowering it strands nothing stored. It may not exceed the vaultDB's `maxBoxes`, and
   * with `maxWhisperBytes` it must fit the vaultDB's `maxVaultBytes`.
   */
  maxBoxes?: number | undefined
```

States the 'vault_full' a caller meets in normal use, and gives no recipe for it.

**Gallant, proposed:**

Sorry: but we need another example, as this one really calls for detail

```ts
/** A soft cap on the number of boxes per vault
 * Default: the smaller of {@link MaxBoxes}, 100, and the `maxBoxes` forced by the specific `VaultDB` adapter (advised limits imposed by its backing store)
 *
 * Excess refuses 'vault_full': delete one first, or relaunch with a new value.
 * Replacing or reading a box is always allowed, even if over-limit.
 * Adjusting the limit is undefined behavior.
 * This is enforced as a best-effort target, not a hard cap. At moderate write
 * rate and volume it should be exact. For most adapters, a strict cap in all
 * conditions would require unjustifiable complexity and/or concurrency machinery.
 */
```

## option-values-get-a-list

```ts
// packages/safebyok-old/src/checks/validator.ts:301
/** How an {@link objCheck} validator refuses: `refuseAs`, the kind, 'bad_record' unless given; and `extras`, 'strict' (the default) to refuse a field the object does not take, or 'strip' to drop it unread. */
export interface ObjCheckOpts extends Z.input<typeof Checks.objCheckOpts> {}
```

Two options and their values gapped into one sentence, the default in parentheses.

**Gallant, proposed:**

// Code change: change the method using refuseAs to be refusalKind, and its doc to match
// Add a goofus/gallant for **its-name-is-its-doc**

> `refuseAs` -- the *[refusal]* kind thrown (default: 'bad_record')

The best name you can choose is one that serves as its own doc.

gallant:
> `refusalKind` -- (default: 'bad_record')


```ts
/** How an {@link objCheck} validator refuses.
 * - `refuseAs`         -- the kind thrown (default: 'bad_record')
 * - `extras: 'strict'` -- refuse a field the object does not take (default)
 * - `extras: 'strip'`  -- drop it unread
 */
```

```ts
// packages/safebyok-old/src/storage/vault-db-shapes.ts:141
/** Why a row is in `damaged_records`: `format_mismatch`, written by a newer version of the app, so updating the app may read it; `damaged_record`, anything else. */
export type Damagekind = typeof damagekindVals[number]
```

The two values gapped behind a semicolon, each explained in a clause.

**Gallant, proposed:**
```ts
/** Why a row sits in `damaged_records`.
 * - `format_mismatch` -- written by a newer version of the app; updating may read it
 * - `damaged_record`  -- anything else
 */
```

```ts
// packages/safebyok-old/src/storage/vault-db-shapes.ts:147
/** A vault row is replaced only by a gate verb: `putVault` births one, or finds one in the way. */
export type PutVaultOpts = Readonly<Z.input<typeof putVaultOpts>>
```

The `ifPresent` values told as policy prose: neither one named, the default not marked.

*This method might not exist, but here's how I'd write it; syndicate to places that need it?*
**Gallant, proposed:**
```ts
/** `putVault`'s options.   (values guessed from the prose; check the shape)
 * - `ifPresent: 'fail'` -- a birth: an existing row refuses. Revision sequence is enforced for the birth ('stale_write') but ignored for the fail.
 * - `ifPresent: 'repl'` -- overwrite, enforcing revision sequence 'stale_write'. (default)
 * - `ifPresent: 'get'`  -- returns the existing row. Changes nothing in the VaultDB, ignores the revision sequence
 * - `ifAbsent: 'fail'`  -- an update: refuses 'vault_gone'/'vault_void' if tombstoned/void
 * - `ifAbsent: 'add'`   -- an insert: add the row. *Revision sequence is not enforced, as long as the record is absent*: a write meant to create from scratch meeting a tombstone revision 73 will succeed.
 */
```

## point-dont-redefine

```ts
// packages/safebyok-old/src/box.ts:73
  /** The app's own JSON beside the whisper, `{}` when none: stored in the clear, never encrypted. */
  readonly sidecar:                Sidecar
```

Redefines sidecar, which `Sidecar` in shapes/box.ts already defines.

**Gallant, proposed:**
```ts
/** The box's {@link Sidecar}. */
```

```ts
// packages/safebyok-old/src/expectations.ts:25
/** True when a stored row is a tombstone, the mark a deleted vault leaves in its place: judged by its `format` alone.
 * A tombstone too damaged to parse still reads as one, so it is never taken for a vault record.
 *
 * @example Expectations.isTombstone({ format: 'safebyok-tombstone-v1', vault_epoch: 3 })  // true
 */
export const isTombstone = (stored: unknown): boolean => fieldOf(stored, 'format') === TombstoneFormat
```

A predicate redefines tombstone in an appositive: "the mark a deleted vault leaves in its place".

**Gallant, proposed:**
```ts
/** True when `stored` is a tombstone ({@link TombstoneFormat}), judged by its `format` alone. */
```

```ts
// packages/safebyok-old/src/gate.ts:92
  /** The gate as the vault record holds it, its `gate`: each wayin's record, the passkey's or null. Its `gate_epoch` rides beside it in the record. */
  get record(): GateRecord {
```

Redefines the gate record, which `GateRecord` in shapes/vault.ts already defines.

**Gallant, proposed:**
```ts
/** A plain {@link GateRecord} object of this gate and its wayins */
```

## customer-first

```ts
// packages/safebyok-old/src/wayin.ts:100
  /** The ctx this wayin's wrap is bound to: the stamp of the vault record it is one of, its purpose, and its whole header. */
  get wayinCtx(): Uint8Array
```

Use words familiar to a front-end developer (customer) or regular person (user) that a _security reviewer will understand without ambiguity_. ["Serialized name/value pairs", "bind with the wrapped value", "cryptographic context"] -- for the dev, ["bag of props turned into bytes", "mixed in but not stored, kinda like a SHA", "crypto stuff"]; for the expert, "Additional Associated Data, politely phrased".

**Gallant, proposed:**
```ts
/** Serialized name/value pairs to bind into the wrapped value as cryptographic context.
 * The value cannot be unwrapped unless the same bytes, unchanged, are independently
 * provided along with the wrapping key. Any change to that associated data --
 * another user_id, a forged registered_at -- will not unwrap.
 */
```

## say-the-guarantee

```ts
// packages/safebyok-old/src/lease.ts:31
/** The ctx a lease's wrap is bound to: its vault's stamp but for the format, the lease's own {@link LeaseStamp}, and the purpose.
 * Each stamp may come whole, a Vault object or a lease record: only its stamp fields are taken.
 * It refuses 'bad_record' for one missing any of them.
 *
 * @example await wrapKeyUnder(leaseKey, vaultKey, leaseCtxOf(vaultRecord, leaseRecord))
 */
export const leaseCtxOf = (vaultStamp: VaultStampButFormat, leaseStamp: LeaseStamp): Uint8Array => (
```

Spent on how the ctx is made and a refusal; what the binding prevents goes unsaid.

(can we find an example whose contract is smaller? Please adjust the above ^^^ and syndicate it )
**Gallant, proposed:**
```ts
/** The ctx a lease's wrap is bound to. The wrap opens only under the vault and lease stamps it was sealed with. A lease copied to another vault or epoch opens nothing. */
```

## guard-names-its-predicates

```ts
// packages/safebyok-old/src/vault.ts:1200
  /** The lease in hand, for `call` about to use it, demanded consistent with the picture and in force: 'vault_locked' with none. */
  #demandLease(call: VaultCall): Lease {
```

A guard written as a noun phrase, its predicates given as participles rather than named.

**Gallant, proposed:**
```ts
/** Return the lease in force. Refuses if lease is absent or inconsistent with `picture` */
```

```ts
// packages/safebyok-old/src/vault.ts:1135
  /** Refuse once this Vault object is gone: 'vault_remade' for a vault made anew, else 'vault_gone'. Ask it first in every call, and again after a wait with no thing in hand to demand. */
  #demandNotGone() {
```

Names the kinds it refuses, not the predicate it asks, then says who calls it.

**Gallant, proposed:**
```ts
/** Demand that this Vault object is not gone. */
```

```ts
// packages/safebyok-old/src/proving.ts:376
/** `baseHeader`, a current passphrase wayin's, once its deriver is the vault's and its salt one that deriver makes, and the passphrase is not blank. */
const checkedPassphraseHeader = (baseHeader: PassphraseWayinHeader, keyDeriver: KeyDeriver, passphrase: PassphraseCleartext): PassphraseWayinHeader => {
```

Its checks are a gapped "once" clause rather than named predicates.

// not a great example while the name (checkedPassphraseHeader) and its args (header) are absurd

**Gallant, proposed:**
```ts
/** `baseHeader` (an already-validated wayin); the vault's deriver object; and a passphrase that is not blank. */
```

## reason-goes-above

```ts
// packages/safebyok-old/src/bank.ts:412
  /** Publish the snapshot the private state makes now, and tell every listener: the one place the snapshot is swapped. Call it only once something changed. */
  #publish() {
```

An invariant for maintainers, "the one place the snapshot is swapped", inside the doc block.

**Gallant, proposed:**
```ts
// The one place the snapshot is swapped. Call it only once something changed.
/** Publish the snapshot and tell every listener. */
```

```ts
// packages/safebyok-old/src/proving.ts:462
/** True when every byte of `bytes` is zero, read with no early exit, as libsodium's `sodium_is_zero` does.
 * No JavaScript engine promises constant time, but nothing here branches on a byte: only the
 * verdict steers what follows, and the refusal of an all-zero output tells that anyway.
 */
const isAllZero = (bytes: Uint8Array): boolean => bytes.reduce((seen, byte) => seen | byte, 0) === 0
```

// would you review carefully and make this change -- if @eslint disabling is called for it's approved,
// if so use the /* @eslint-disable */ block form so it's not mixed into the code

**Gallant, proposed:**
```ts
// The below code does, yes, just mean `bytes.every((b) => b === 0)`.
// However, this code *does not exit early or branch* (avoids a timing attack)
// and *does not create an iterable* (`for byte of` would)
//
/** True when every byte of `bytes` is zero. */
const isSafelyAllZero = (bytes: Uint8Array): boolean => {
  let   seen = 0
  const len  = bytes.length
  for (let ii = 0; ii < len; ii++) { seen |= bytes[ii] }
  return seen === 0
}
```

```ts
// packages/safebyok-old/src/storage/vault-db-shapes.ts:201
/** The tombstone of a vault row nothing holds. A damaged listing's label comes from storage, and is not checked here: it is part of what is reported. */
export const sentinelVaultOf = ({ applabel, user_id, vaultlabel }: VaultScope, vault_tok: string = VoidLifeTok): VaultTombstone => ({
```

A maintainer's note on what is not checked here, and why.

**Gallant, proposed:**
```ts
// The damaged listing's label comes from storage unchecked: it is part of what is reported.
/** The tombstone of a vault row nothing holds. */
```

## facts-from-the-code

```ts
// packages/safebyok-old/src/proving.ts:146
  /** True when `vaultRecord`'s wayin at this proving's slotlabel carries its header: the proving opens the gate it holds.
   *
   * @example proving.isCarriedBy(vaultRecord)   // false once another device replaced the passphrase
   */
  isCarriedBy(vaultRecord: Pick<VaultRecord, 'gate'>): boolean {
```

Says the proving "opens the gate it holds"; the body only compares visible header fields.

**Gallant, proposed:**
```ts
/** True when `vaultRecord`'s wayin at this proving's slotlabel carries this proving's header. */
```

## Extreme, but fit no single tag

* `vault.ts:558`: putBox: 3.7 KB of mechanism, refusal catalog, rebirth rules, crypto faults, @params.
* `vault.ts:325`: ensureUnlocked: the whole gating state machine and its refusals, in prose.
* `bank.ts:235`: ensureVault: birth steps, holding rules, store identity, refusal catalog, five paragraphs.
* `phrases.ts:1`: One 350-character sentence: contents, a parenthetical exception, and the reason for review.
* `logger.ts:90`: "kept as guarded, its target being so": one absolute stacked on another.
* `vault.ts:1193`: "refuses, 'vault_locked', with no lease in force, dropping one ended": nearly unparseable.
* `gating.ts:244`: "The pantry consult, then the host's request.": a verbless lead on a private method.
* `bank.ts:540`: #bear: a birth told as a list of participles, then two refusal paths.
