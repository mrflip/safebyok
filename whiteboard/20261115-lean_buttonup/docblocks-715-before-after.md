# #715 doc blocks, before and after

Every doc-block hunk of the documentarian's pass on PR #715 (branch `20261117-core_box`), then the three hunks I fixed
afterwards. "Before" is what the T3a workers (opus) wrote in the seal-path and review rounds; "After" is the new text.
Each hunk is shown with two lines of context, so a signature or a neighbouring block may appear in both.

* Documentarian (opus): `6a2cddfac..f5260343f` (commits `89c0d7847`, `f5260343f`).
* Claude, the orchestrator: `f5260343f..6e567d5e7` (commit `6e567d5e7`).

## Possible sources in the brief

My brief to the documentarian gave it these lines, and two of them read like sources of the "Seal and return..."
first lines and the "so pass `donorProps` as you have it" sentence:

> - `Lease.seal` and `Bank.sealBox` describe their mechanism (the approvelist, then the banlist, and the steps). A
>   caller needs to know what they get and what refuses. The seal's promise to its caller is that its input and output
>   are both checked strictly ("bulletproof on the way in and the way out"), so a caller doesn't have to pre-clean what
>   it passes.

It also told it to read STYLE.md's *Writing*, *Comments and doc blocks* and *Naming*, and `notes/gallant-docblocks.md`,
whole, from the base checkout.

## The documentarian's pass

### `packages/safebyok/src/models/bank.ts`

Before:

```ts
export type { BankRecord, WorldRecord } from '../storage/shapes-thing'

/** The record {@link Bank.make} and {@link Bank.birth} take: the bank's Thing, with its main gate's Thing as `maingate` and its root box as `rootBox`, whole, or its shell before the birth. */
export type BankMakeRecord = WorldRecord & Readonly<{ rootBox: BoxRecord | BoxShell }>
```

After:

```ts
export type { BankRecord, WorldRecord } from '../storage/shapes-thing'

/** The record {@link Bank.make} and {@link Bank.birth} take: the bank's Thing, with its main gate's Thing at `maingate` and its root box at `rootBox`.
 * The root box is whole, or its shell before the bank is born.
 */
export type BankMakeRecord = WorldRecord & Readonly<{ rootBox: BoxRecord | BoxShell }>
```

### `packages/safebyok/src/models/bank.ts`

Before:

```ts

  // Set once more, where the bank's birth lands: from the shell to the root box stored.
  /** The root box's Thing fields. */
  #rootBox: BoxRecord | BoxShell
```

After:

```ts

  // Set once more, where the bank's birth lands: from the shell to the root box stored.
  /** The root box: its shell until the bank is born, then its stored record. */
  #rootBox: BoxRecord | BoxShell
```

### `packages/safebyok/src/models/bank.ts`

Before:

```ts
  get maingate(): Gate { return this.#maingate }

  /** The root box's Thing fields: its shell until the bank is born. Every box of this bank is under it. */
  get rootBox(): BoxRecord | BoxShell { return this.#rootBox }
```

After:

```ts
  get maingate(): Gate { return this.#maingate }

  /** The root box: its shell until the bank is born, then its stored record. Every box of this bank is under it. */
  get rootBox(): BoxRecord | BoxShell { return this.#rootBox }
```

### `packages/safebyok/src/models/bank.ts`

Before:

```ts
  // == [Boxes]: sealBox, tombstoneBox, unsealBox

  /** Seal the box next after `donorProps`, with `publicProps` over it and the whisper of `secretProps`. Needs the bank unlocked.
   * With `publicProps` of `{ am: 'x' }`, it is the tombstone of the live `donorProps` ({@link tombstoneBox}), written at `publicProps.written_at` or now;
   * a sidecar or `secretProps` given refuses `bad_option`.
   * Over a tombstone or the shell, it is the first revision of the next life. Its sidecar is `publicProps.sidecar`, or else `donorProps`'s.
   * `donorProps` may be a whole box, sealed or unsealed: only its Thing fields and sidecar are read.
   * @example
   *   await bank.sealBox(box, { sidecar: { account: 'work' } }, { whisper })
```

After:

```ts
  // == [Boxes]: sealBox, tombstoneBox, unsealBox

  /** Seal and return the next revision of the box `donorProps`, with `publicProps` applied and the whisper of `secretProps` encrypted. Needs the bank unlocked.
   * The seal checks its arguments and the box it returns, so pass `donorProps` as you have it: whole, sealed or unsealed, a tombstone or the shell. It must be a box of this bank.
   * After a tombstone or the shell, the revision begins the box's next life. Its sidecar is `publicProps.sidecar`, or else the sidecar of `donorProps`.
   * Given `am: 'x'` in `publicProps`, it seals the tombstone of the live box instead ({@link tombstoneBox}), and refuses a sidecar or `secretProps`.
   * Its `written_at` is `publicProps.written_at`, or now.
   * @example
   *   await bank.sealBox(box, { sidecar: { account: 'work' } }, { whisper })
```

### `packages/safebyok/src/models/bank.ts`

Before:

```ts
  }

  /** Seal a tombstone for the live box `donorProps`, signed by an empty whisper ciphered under a fresh boxKey. Needs the bank unlocked.
   * It is written at `publicProps.written_at`, or now.
   */
  tombstoneBox(donorProps: Sealable<BoxRecord>, publicProps: Partial<TombstonePublicProps> = {}): Promise<BoxTombstone> {
```

After:

```ts
  }

  /** Seal the tombstone of the live box `donorProps`. Needs the bank unlocked.
   * Its sealed empty whisper authenticates it. Its `written_at` is `publicProps.written_at`, or now.
   */
  tombstoneBox(donorProps: Sealable<BoxRecord>, publicProps: Partial<TombstonePublicProps> = {}): Promise<BoxTombstone> {
```

### `packages/safebyok/src/models/bank.ts`

Before:

```ts
  }

  /** Demand that `box` is a box of this bank's scope, under its root box: `record_conflict` if not, `bad_option` if it is no box. */
  #demandOwnBox(box: unknown): void {
    const { lifepath } = Checks.boxSealable.parseConsistent(box, this.scope, { kind: 'record_conflict' })
```

After:

```ts
  }

  /** Demand that `box` is a box of this bank, under its current root box. */
  #demandOwnBox(box: unknown): void {
    const { lifepath } = Checks.boxSealable.parseConsistent(box, this.scope, { kind: 'record_conflict' })
```

### `packages/safebyok/src/models/core-box.ts`

Before:

```ts
const BoxTags: SealTags = Object.freeze({ codectag: 'json_v1', schematag: 'whisper_v1' })

/** The checks of what a box's next revision is made from, of what its seal takes, of a box sealed, and of what it seals. */
const Checks = Validator.Checkers('bad_option', ({ obj, oneof, epochMillis }) => ({
  boxSealable,
```

After:

```ts
const BoxTags: SealTags = Object.freeze({ codectag: 'json_v1', schematag: 'whisper_v1' })

/** The checks of a box's sealable, live or any, of its public and secret props, and of its stored record. */
const Checks = Validator.Checkers('bad_option', ({ obj, oneof, epochMillis }) => ({
  boxSealable,
```

### `packages/safebyok/src/models/core-box.ts`

Before:

```ts

// A sealer is handed to a lease as the class itself, so the class has statics alone.
/** The sealer of a box's whisper, bound to its Thing fields and its tags; its sidecar stays in the clear. Hand the class itself to a lease.
 * It also makes the revisions a lease seals: {@link CoreBox.nextRevisionOf} and {@link CoreBox.tombstoneOf}.
 */
export class CoreBox { // eslint-disable-line @typescript-eslint/no-extraneous-class
  // == [What a seal takes]: donorPropsOf, publicPropsOf, secretPropsOf, tombstoneSecrets

  /** The Thing fields and sidecar of `donorProps`, a box live, a tombstone or the shell; the rest, its whisper sealed or not among them, is dropped. */
  static donorPropsOf(donorProps: Sealable<BoxRecord>): Sealable<BoxRecord> { return Checks.boxSealable.parse(donorProps) }

  /** The sidecar, `am` and `written_at` of `publicProps`; the rest is dropped. */
  static publicPropsOf(publicProps: BoxPublicProps): BoxPublicProps { return Checks.boxPublicProps.parse(publicProps) }

  /** The whisper of `secretProps`; the rest is dropped. */
  static secretPropsOf(secretProps: BoxCleartexts): BoxCleartexts { return Checks.boxCleartexts.parse(secretProps) }
```

After:

```ts

// A sealer is handed to a lease as the class itself, so the class has statics alone.
/** The {@link Sealer} for a box's whisper. Pass the class itself to a lease's `seal` or `unseal`.
 * The whisper unseals only within the revision it was sealed in. The sidecar is unencrypted and outside the seal: storage can change it, and the box still unseals.
 */
export class CoreBox { // eslint-disable-line @typescript-eslint/no-extraneous-class
  // == [What a seal takes]: donorPropsOf, publicPropsOf, secretPropsOf, tombstoneSecrets

  /** The Thing fields and sidecar of `donorProps`, which may be a live box, a tombstone or the shell.
   * Every other field is dropped, including a whisper, sealed or not.
   */
  static donorPropsOf(donorProps: Sealable<BoxRecord>): Sealable<BoxRecord> { return Checks.boxSealable.parse(donorProps) }

  /** The sidecar, `am` and `written_at` of `publicProps`. Any other field is dropped. */
  static publicPropsOf(publicProps: BoxPublicProps): BoxPublicProps { return Checks.boxPublicProps.parse(publicProps) }

  /** The whisper of `secretProps`. Any other field is dropped. */
  static secretPropsOf(secretProps: BoxCleartexts): BoxCleartexts { return Checks.boxCleartexts.parse(secretProps) }
```

### `packages/safebyok/src/models/core-box.ts`

Before:

```ts
  // == [Revisions]: nextRevisionOf, tombstoneOf

  /** The live box next after `donorProps`, without its sealed whisper. Over a tombstone or the shell, it is the first revision of the next life.
   * Its sidecar is `publicProps.sidecar`, or else `donorProps`'s: one of them must have one. It is written at `publicProps.written_at`, or now.
   */
  static nextRevisionOf(donorProps: Sealable<BoxRecord>, publicProps: BoxPublicProps = {}): RevisionOf<BoxRecord, BoxCleartexts> {
```

After:

```ts
  // == [Revisions]: nextRevisionOf, tombstoneOf

  /** The next live revision after `donorProps`, without its sealed whisper.
   * After a tombstone or the shell, it begins the box's next life.
   * Its sidecar is `publicProps.sidecar`, or else the sidecar of `donorProps`. One of the two must have one.
   * Its `written_at` is `publicProps.written_at`, or now.
   */
  static nextRevisionOf(donorProps: Sealable<BoxRecord>, publicProps: BoxPublicProps = {}): RevisionOf<BoxRecord, BoxCleartexts> {
```

### `packages/safebyok/src/models/core-box.ts`

Before:

```ts
  }

  /** The tombstone of the live box `donorProps`, without its sealed whisper or its sidecar. Refuses a tombstone or the shell.
   * It is written at `publicProps.written_at`, or now. A sidecar in `publicProps` refuses, as a tombstone has none.
   */
  static tombstoneOf(donorProps: Sealable<BoxRecord>, publicProps: BoxPublicProps = {}): RevisionOf<BoxTombstone, BoxCleartexts> {
```

After:

```ts
  }

  /** The tombstone of the live box `donorProps`, without its sealed whisper.
   * Its `written_at` is `publicProps.written_at`, or now.
   * A tombstone has no sidecar: the sidecar of `donorProps` is dropped, and a sidecar given in `publicProps` refuses.
   */
  static tombstoneOf(donorProps: Sealable<BoxRecord>, publicProps: BoxPublicProps = {}): RevisionOf<BoxTombstone, BoxCleartexts> {
```

### `packages/safebyok/src/models/core-box.ts`

Before:

```ts
  static readonly tags: SealTags = BoxTags

  /** The ctx purposes of its wrapped boxKey and of its ciphertext. */
  static readonly purposes = Object.freeze({ key: 'whisper_sealed.key_wrapped', cipher: 'whisper_sealed.ciphered' })

  /** The box's {@link BoxStamp}: its Thing fields, without its sidecar or its sealed whisper. Refuses the shell. */
  static stampOf(record: RevisionOf<BoxThing, BoxCleartexts>): BoxStamp { return boxStamp.parse(record) }

  /** The whisper as stable JSON, its keys sorted. */
  static encode(cleartexts: BoxCleartexts): string { return StableJsonify.stableJsonify(Checks.boxCleartexts.parse(cleartexts).whisper) }

  /** The whisper in the JSON `text`; refuses `damaged_whisper`, quoting none of it. */
  static decode(text: string): BoxCleartexts { return { whisper: deserializeWhisper(text) } }

  /** The sealed whisper of `record`; refuses `damaged_whisper` when its tags are not a box's. */
  static sealedOf(record: BoxThing): Sealed {
    const { whisper_sealed } = Checks.boxThing.parse(record)
```

After:

```ts
  static readonly tags: SealTags = BoxTags

  /** The ctx purposes of the whisper's wrapped boxKey and of its ciphertext. */
  static readonly purposes = Object.freeze({ key: 'whisper_sealed.key_wrapped', cipher: 'whisper_sealed.ciphered' })

  /** The {@link BoxStamp} of `record`. Refuses the shell, which has no revision to seal. */
  static stampOf(record: RevisionOf<BoxThing, BoxCleartexts>): BoxStamp { return boxStamp.parse(record) }

  /** The whisper of `cleartexts` as stable JSON, with its keys sorted. */
  static encode(cleartexts: BoxCleartexts): string { return StableJsonify.stableJsonify(Checks.boxCleartexts.parse(cleartexts).whisper) }

  /** The whisper in the JSON `text`. A refusal never quotes the text. */
  static decode(text: string): BoxCleartexts { return { whisper: deserializeWhisper(text) } }

  /** The sealed whisper of `record`, which must carry a box's tags. */
  static sealedOf(record: BoxThing): Sealed {
    const { whisper_sealed } = Checks.boxThing.parse(record)
```

### `packages/safebyok/src/models/core-box.ts`

Before:

```ts
  }

  /** `next` with its sealed whisper, checked as a stored box, and frozen. */
  static recordOf(next: RevisionOf<BoxThing, BoxCleartexts>, whisper_sealed: Sealed): BoxThing {
    return Object.freeze(Checks.boxThing.parse({ ...next, whisper_sealed }))
```

After:

```ts
  }

  /** `next` with `whisper_sealed` added, checked as a stored box, and frozen. */
  static recordOf(next: RevisionOf<BoxThing, BoxCleartexts>, whisper_sealed: Sealed): BoxThing {
    return Object.freeze(Checks.boxThing.parse({ ...next, whisper_sealed }))
```

### `packages/safebyok/src/models/core-box.ts`

Before:

```ts
// == [Helpers]: nextLifeOf, deserializeWhisper

/** The lifeseq and lifepath of the life after `box`'s */
function nextLifeOf({ lifeseq, lifepath }: Pick<BoxThing, 'lifeseq' | 'lifepath'>): Pick<BoxThing, 'lifeseq' | 'lifepath'> {
  const nextLifeseq = lifeseqOfLifenum(lifenumOfLifeseq(lifeseq) + 1)
```

After:

```ts
// == [Helpers]: nextLifeOf, deserializeWhisper

/** The lifeseq and lifepath of the life after the given box's */
function nextLifeOf({ lifeseq, lifepath }: Pick<BoxThing, 'lifeseq' | 'lifepath'>): Pick<BoxThing, 'lifeseq' | 'lifepath'> {
  const nextLifeseq = lifeseqOfLifenum(lifenumOfLifeseq(lifeseq) + 1)
```

### `packages/safebyok/src/models/lease.ts`

Before:

```ts
export type LeaseBank = Pick<Bank, 'stamp' | 'lock' | 'isEnabled' | 'demandEnabled'>

/** Any sealer, as a lease takes it: the lease is generic over what it seals. */
type AnySealer = Sealers.Sealer<never, never>
```

After:

```ts
export type LeaseBank = Pick<Bank, 'stamp' | 'lock' | 'isEnabled' | 'demandEnabled'>

/** Any sealer, whatever it seals. */
type AnySealer = Sealers.Sealer<never, never>
```

### `packages/safebyok/src/models/lease.ts`

Before:

```ts
export type SecretFieldname = 'whisper' | `${string}_sealed`

/** The names of the cleartexts a sealer seals, which a sealable never carries into a revision. */
const CleartextFieldnames: ReadonlySet<string> = new Set(['whisper'])
```

After:

```ts
export type SecretFieldname = 'whisper' | `${string}_sealed`

/** The fieldnames that hold a cleartext. */
const CleartextFieldnames: ReadonlySet<string> = new Set(['whisper'])
```

### `packages/safebyok/src/models/lease.ts`

Before:

```ts
/** A grant that lets this device seal and unseal under its bank's key without asking the user, for one revision of the bank's gate.
 * The bankKey stays wrapped under a non-extractable leaseKey: each seal or unseal unwraps it for that call alone, and nothing hands it out.
 * The lease knows which field names hold secrets, and nothing else of a record: the sealer it is handed, such as `CoreBox`, decides what is sealed and how.
 * A bankKey that will not unwrap locks the bank, and refuses `damaged_lease`.
 * Once evicted, or once its device is swept, it refuses every seal and unseal, even one in flight.
```

After:

```ts
/** A grant that lets this device seal and unseal under its bank's key without asking the user, for one revision of the bank's gate.
 * The bankKey stays wrapped under a non-extractable leaseKey: each seal or unseal unwraps it for that call alone, and nothing hands it out.
 * The sealer passed to each call, such as `CoreBox`, decides what is sealed and how. The lease itself knows only which fieldnames hold secrets.
 * A bankKey that will not unwrap locks the bank, and refuses `damaged_lease`.
 * Once evicted, or once its device is swept, it refuses every seal and unseal, even one in flight.
```

### `packages/safebyok/src/models/lease.ts`

Before:

```ts
  // == [Sealing under the bankKey]: seal, unseal, sealText, openSealed, ctxOf, bankKey

  /** Seal the revision next after `donorProps`, as `sealer` makes it: with `publicProps` over it and `secretProps` sealed.
   * With `publicProps` of `{ am: 'x' }`, it is the tombstone of the live `donorProps`, sealing the sealer's empty cleartexts: `secretProps` given refuses `bad_option`, and so does a body in `publicProps` where the sealer refuses it, as `CoreBox` does.
   * `donorProps` may be a whole record, sealed or unsealed: only its Thing fields and body are read, and no cleartext or sealed part reaches the revision.
   * The seal is bound to the bank's stamp, the revision's stamp and the part's tags. The cleartext's bytes are zeroed afterwards.
   * @example
   *   await lease.seal(CoreBox, box, { sidecar: { account: 'work' } }, { whisper })  // its next revision
```

After:

```ts
  // == [Sealing under the bankKey]: seal, unseal, sealText, openSealed, ctxOf, bankKey

  /** Seal and return the next revision after `donorProps`, with `publicProps` applied and `secretProps` encrypted.
   * The seal checks its arguments and the record it returns, so pass `donorProps` as you have it: whole, sparse, sealed or unsealed. None of its secrets reaches the revision.
   * Given `am: 'x'` in `publicProps`, it seals the tombstone of the live `donorProps` instead, and refuses any `secretProps`. The sealer may refuse body fields there too: `CoreBox` refuses a sidecar.
   * The seal is bound to the bank's stamp, the revision's stamp and the sealer's tags. The cleartext's bytes are zeroed afterwards.
   * @example
   *   await lease.seal(CoreBox, box, { sidecar: { account: 'work' } }, { whisper })  // its next revision
```

### `packages/safebyok/src/models/lease.ts`

Before:

```ts
  }

  /** `record` unsealed: the part `sealer` seals, opened, in place of its sealed form.
   * Unsealing authenticates the ciphertexts, stamp and tags together: a change to any of them refuses as damaged.
   */
  async unseal<RecordT extends ThingRecord, CleartextsT>(sealer: Sealers.Sealer<RecordT, CleartextsT>, record: RecordT): Promise<Sealers.UnsealedOf<RecordT, CleartextsT>> {
```

After:

```ts
  }

  /** Unseal `record`, returning it with the part `sealer` seals in cleartext, in place of its sealed form.
   * The answer is a new, frozen record built from `record` as checked, not `record` itself.
   * Unsealing authenticates the ciphertexts, the stamp and the tags together: a change to any of them refuses as damaged.
   */
  async unseal<RecordT extends ThingRecord, CleartextsT>(sealer: Sealers.Sealer<RecordT, CleartextsT>, record: RecordT): Promise<Sealers.UnsealedOf<RecordT, CleartextsT>> {
```

### `packages/safebyok/src/models/lease.ts`

Before:

```ts
  }

  /** The {@link Sealers.Sealed} form of `cleartext`, for `sealer` to add to `revision`: ciphered under a fresh key that is wrapped under the bankKey, with the sealer's tags. */
  async #sealText(sealer: Pick<AnySealer, 'stampOf' | 'purposes' | 'tags'>, revision: unknown, cleartext: string): Promise<Sealers.Sealed> {
    const { purposes, tags } = sealer
```

After:

```ts
  }

  /** Encrypt `cleartext` for `revision` under a fresh key wrapped under the bankKey, as a {@link Sealers.Sealed} with the sealer's tags. */
  async #sealText(sealer: Pick<AnySealer, 'stampOf' | 'purposes' | 'tags'>, revision: unknown, cleartext: string): Promise<Sealers.Sealed> {
    const { purposes, tags } = sealer
```

### `packages/safebyok/src/models/lease.ts`

Before:

```ts
// == [Helpers]: withoutSecrets, sealerMembersOf

/** `bag` without its secrets: each cleartext, such as `whisper`, and each sealed part, at a name ending `_sealed`. */
export function withoutSecrets<BagT extends object>(bag: BagT): Omit<BagT, keyof BagT & SecretFieldname> {
  const secretFieldnames = Object.keys(bag).filter((fieldname) => fieldname.endsWith('_sealed') || CleartextFieldnames.has(fieldname))
```

After:

```ts
// == [Helpers]: withoutSecrets, sealerMembersOf

/** A copy of `bag` without its secret fields: `whisper`, and every field whose name ends in `_sealed`.
 * It checks nothing else of `bag`.
 */
export function withoutSecrets<BagT extends object>(bag: BagT): Omit<BagT, keyof BagT & SecretFieldname> {
  const secretFieldnames = Object.keys(bag).filter((fieldname) => fieldname.endsWith('_sealed') || CleartextFieldnames.has(fieldname))
```

### `packages/safebyok/src/models/lease.ts`

Before:

```ts

// A class's static methods are its own but not enumerable, so a spread would miss them: each member is read by name.
/** The members of a sealer read off `val`, an object or a class; null for anything else */
function sealerMembersOf(val: unknown): Partial<Record<keyof AnySealer, unknown>> | null {
  if ((val === null) || ((typeof val !== 'object') && (typeof val !== 'function'))) { return null }
```

After:

```ts

// A class's static methods are its own but not enumerable, so a spread would miss them: each member is read by name.
/** The sealer members of `val`, an object or a class, or null for anything else */
function sealerMembersOf(val: unknown): Partial<Record<keyof AnySealer, unknown>> | null {
  if ((val === null) || ((typeof val !== 'object') && (typeof val !== 'function'))) { return null }
```

### `packages/safebyok/src/models/proving.ts`

Before:

```ts
// Defined here, not with the shapes: they name a model class.
// The builders' checks are big's, over the lean core's stamps.
/** The checks of a gate revision, of {@link Proving.buildWayin}'s `source`, of {@link Proving.buildLease}'s arguments, and of the static builders' arguments. */
const Checks = Validator.Checkers('bad_option', ({ obj, fn, bool, custom }) => {
  // A gate's stamp is fixed for its life; the lease pins one revision of the gate too.
```

After:

```ts
// Defined here, not with the shapes: they name a model class.
// The builders' checks are big's, over the lean core's stamps.
/** The checks of a {@link GateRevisionedStamp}, of {@link Proving.buildWayin}'s `source`, of {@link Proving.buildLease}'s arguments, and of the static builders' arguments. */
const Checks = Validator.Checkers('bad_option', ({ obj, fn, bool, custom }) => {
  // A gate's stamp is fixed for its life; the lease pins one revision of the gate too.
```

### `packages/safebyok/src/models/proving.ts`

Before:

```ts
})

/** A gate's stamp and its revision's `revtok`: the gate revision a lease is granted for. @see {@link Stamps.gateStamp} */
export type GateRevisionedStamp = Z.infer<typeof Checks.gateRevisionedStamp>
// --
```

After:

```ts
})

/** A {@link GateStamp} with the `revtok` of one revision of the gate: the revision a lease is granted under. */
export type GateRevisionedStamp = Z.infer<typeof Checks.gateRevisionedStamp>
// --
```

### `packages/safebyok/src/models/sealers.ts`

Before:

```ts
// == [A record's forms]: SealedPartsOf, SealedOf, UnsealedOf, LiveOf, TombstoneOf, RevisionOf, BodyOf, Sealable, PublicPropsOf, LivePublicPropsOf, TombstonePublicProps

/** Each part `CleartextsT` names, sealed, at `<part>_sealed`. */
export type SealedPartsOf<CleartextsT> = { readonly [PartT in keyof CleartextsT & string as `${PartT}_sealed`]: Sealed }

/** `RecordT` with each part `CleartextsT` names sealed, at `<part>_sealed`. A union is mapped member by member. */
export type SealedOf<RecordT, CleartextsT> = RecordT extends unknown ? Omit<RecordT, keyof CleartextsT> & SealedPartsOf<CleartextsT> : never

/** `RecordT` with each `<part>_sealed` that `CleartextsT` names unsealed, at `<part>`. A union is mapped member by member. */
export type UnsealedOf<RecordT, CleartextsT> = RecordT extends unknown
  ? Omit<RecordT, `${keyof CleartextsT & string}_sealed`> & CleartextsT
```

After:

```ts
// == [A record's forms]: SealedPartsOf, SealedOf, UnsealedOf, LiveOf, TombstoneOf, RevisionOf, BodyOf, Sealable, PublicPropsOf, LivePublicPropsOf, TombstonePublicProps

/** A {@link Sealed} field at `<part>_sealed` for each part that `CleartextsT` names. */
export type SealedPartsOf<CleartextsT> = { readonly [PartT in keyof CleartextsT & string as `${PartT}_sealed`]: Sealed }

/** `RecordT` with each part that `CleartextsT` names replaced by its sealed form, at `<part>_sealed`. A union is mapped member by member. */
export type SealedOf<RecordT, CleartextsT> = RecordT extends unknown ? Omit<RecordT, keyof CleartextsT> & SealedPartsOf<CleartextsT> : never

/** `RecordT` with each `<part>_sealed` that `CleartextsT` names replaced by its cleartext, at `<part>`. A union is mapped member by member. */
export type UnsealedOf<RecordT, CleartextsT> = RecordT extends unknown
  ? Omit<RecordT, `${keyof CleartextsT & string}_sealed`> & CleartextsT
```

### `packages/safebyok/src/models/sealers.ts`

Before:

```ts
export type TombstoneOf<RecordT> = Extract<RecordT, { am: 'x' }>

/** A revision of `RecordT` before its seal: without the sealed parts `CleartextsT` names. A union is mapped member by member. */
export type RevisionOf<RecordT, CleartextsT> = RecordT extends unknown ? Omit<RecordT, keyof SealedPartsOf<CleartextsT>> : never
```

After:

```ts
export type TombstoneOf<RecordT> = Extract<RecordT, { am: 'x' }>

/** A revision of `RecordT` before it is sealed, without the sealed parts that `CleartextsT` names. A union is mapped member by member. */
export type RevisionOf<RecordT, CleartextsT> = RecordT extends unknown ? Omit<RecordT, keyof SealedPartsOf<CleartextsT>> : never
```

### `packages/safebyok/src/models/sealers.ts`

Before:

```ts
export type BodyOf<RecordT, CleartextsT> = Omit<LiveOf<RecordT>, keyof ThingRecord | keyof SealedPartsOf<CleartextsT>>

/** What a seal takes the next revision's fields from: a record of `RecordT`'s kind, whole, sparse or unsealed, a tombstone or the shell.
 * The seal keeps its Thing fields and its body, and never its secrets.
 */
export type Sealable<RecordT extends ThingRecord> = Omit<Sparse<RecordT>, 'am'> & Readonly<{ am: ThingRecord['am'] }> & Partial<Omit<LiveOf<RecordT>, keyof ThingRecord>>

/** What a seal takes in the clear: any of the body, which wins over the donor's; `am`; and `written_at`, now when left out. */
export type PublicPropsOf<RecordT, CleartextsT> = Partial<BodyOf<RecordT, CleartextsT>> & Readonly<{ am?: 'a' | 'x', written_at?: number }>

/** What the seal of a live revision takes in the clear: {@link PublicPropsOf}, with `am` live or left out. */
export type LivePublicPropsOf<RecordT, CleartextsT> = Partial<BodyOf<RecordT, CleartextsT>> & Readonly<{ am?: 'a', written_at?: number }>

/** What the seal of a tombstone takes in the clear: `am: 'x'`, and `written_at`, now when left out. */
export type TombstonePublicProps = Readonly<{ am: 'x', written_at?: number }>
// --
```

After:

```ts
export type BodyOf<RecordT, CleartextsT> = Omit<LiveOf<RecordT>, keyof ThingRecord | keyof SealedPartsOf<CleartextsT>>

/** The record of `RecordT`'s kind that a seal makes the next revision from: whole, sparse or unsealed, live, a tombstone or the shell.
 * The seal keeps its Thing fields and its body, and never its secrets.
 */
export type Sealable<RecordT extends ThingRecord> = Omit<Sparse<RecordT>, 'am'> & Readonly<{ am: ThingRecord['am'] }> & Partial<Omit<LiveOf<RecordT>, keyof ThingRecord>>

/** A seal's public props: the fields it is given that are not secret, each optional.
 * - the body's fields -- replace those of the sealable
 * - `am`              -- `'a'` for a live revision (default), or `'x'` for a tombstone
 * - `written_at`      -- the revision's time (default: now)
 */
export type PublicPropsOf<RecordT, CleartextsT> = Partial<BodyOf<RecordT, CleartextsT>> & Readonly<{ am?: 'a' | 'x', written_at?: number }>

/** {@link PublicPropsOf} for a live revision: `am` is `'a'` or left out. */
export type LivePublicPropsOf<RecordT, CleartextsT> = Partial<BodyOf<RecordT, CleartextsT>> & Readonly<{ am?: 'a', written_at?: number }>

/** The public props of a tombstone's seal: `am: 'x'`, and `written_at` (default: now). */
export type TombstonePublicProps = Readonly<{ am: 'x', written_at?: number }>
// --
```

### `packages/safebyok/src/models/sealers.ts`

Before:

```ts
// == [The Sealer]: SealTags, SealPurposes, Sealer

/** The tags a sealed part carries in the clear, which its seal binds. */
export type SealTags = Pick<Sealed, 'codectag' | 'schematag'>
```

After:

```ts
// == [The Sealer]: SealTags, SealPurposes, Sealer

/** The tags of a sealed part, stored unencrypted and bound into its seal. */
export type SealTags = Pick<Sealed, 'codectag' | 'schematag'>
```

### `packages/safebyok/src/models/sealers.ts`

Before:

```ts
}

/** The interface a lease seals one part of a record through, so the lease itself knows nothing of the record.
 * `RecordT` is the record as stored, its part sealed; `CleartextsT` is what that part seals. Each member checks what it is given.
 */
export interface Sealer<RecordT extends ThingRecord, CleartextsT> {
  /** The Thing fields and body of `donorProps`, its other fields dropped. Refuses what is not a record of this kind or its shell. */
  donorPropsOf(donorProps: unknown): Sealable<RecordT>
  /** The body, `am` and `written_at` of `publicProps`, its other fields dropped. */
  publicPropsOf(publicProps: unknown): PublicPropsOf<RecordT, CleartextsT>
  /** The cleartexts in `secretProps`, its other fields dropped. */
  secretPropsOf(secretProps: unknown): CleartextsT
  /** The live revision next after `donorProps`, without its sealed part, with `publicProps` laid over it. */
  nextRevisionOf(donorProps: unknown, publicProps: unknown): RevisionOf<LiveOf<RecordT>, CleartextsT>
  /** The tombstone of the live `donorProps`, without its sealed part, written at `publicProps.written_at`. Refuses a tombstone or the shell. */
  tombstoneOf(donorProps: unknown, publicProps: unknown): RevisionOf<TombstoneOf<RecordT>, CleartextsT>
  /** The empty cleartexts a tombstone seals, which sign it. */
  readonly tombstoneSecrets: CleartextsT
  /** The stamp the seal of `record` is bound to, after the bank's. A change to it refuses the unseal. */
  stampOf(record: unknown): Crypto.CipherCtxRecord
  /** The tags each seal carries. */
```

After:

```ts
}

/** The interface through which a lease seals and unseals one part of a record.
 * `RecordT` is the record as stored, with its part sealed. `CleartextsT` is the part's cleartexts.
 * Each member must check what it is given: the lease passes its caller's arguments on unchecked.
 */
export interface Sealer<RecordT extends ThingRecord, CleartextsT> {
  /** The Thing fields and body of `donorProps`, with every other field dropped. Refuses anything but a record of this kind or its shell. */
  donorPropsOf(donorProps: unknown): Sealable<RecordT>
  /** The body, `am` and `written_at` of `publicProps`, with every other field dropped. */
  publicPropsOf(publicProps: unknown): PublicPropsOf<RecordT, CleartextsT>
  /** The cleartexts in `secretProps`, with every other field dropped. */
  secretPropsOf(secretProps: unknown): CleartextsT
  /** The next live revision after `donorProps`, updated by `publicProps`, without its sealed part. */
  nextRevisionOf(donorProps: unknown, publicProps: unknown): RevisionOf<LiveOf<RecordT>, CleartextsT>
  /** The tombstone of the live `donorProps`, without its sealed part. Refuses a tombstone or the shell.
   * Its `written_at` is `publicProps.written_at`, or now.
   */
  tombstoneOf(donorProps: unknown, publicProps: unknown): RevisionOf<TombstoneOf<RecordT>, CleartextsT>
  /** The empty cleartexts a tombstone seals. Their seal authenticates the tombstone. */
  readonly tombstoneSecrets: CleartextsT
  /** The stamp of `record` that its seal is bound to, after the bank's. Any change to it makes the unseal refuse. */
  stampOf(record: unknown): Crypto.CipherCtxRecord
  /** The tags each seal carries. */
```

### `packages/safebyok/src/models/sealers.ts`

Before:

```ts
  /** `cleartexts` as the text to cipher. */
  encode(cleartexts: CleartextsT): string
  /** The cleartexts in `text`, refusing as damaged when it will not parse or check. */
  decode(text: string): CleartextsT
  /** The sealed part of `record`, refusing as damaged when its tags are not this sealer's. */
  sealedOf(record: RecordT): Sealed
  /** `next` with `sealed` added, checked as a stored record. */
```

After:

```ts
  /** `cleartexts` as the text to cipher. */
  encode(cleartexts: CleartextsT): string
  /** The cleartexts in `text`. Refuses as damaged when the text does not parse or check. */
  decode(text: string): CleartextsT
  /** The sealed part of `record`. Refuses as damaged when its tags are not this sealer's. */
  sealedOf(record: RecordT): Sealed
  /** `next` with `sealed` added, checked as a stored record. */
```

### `packages/safebyok/src/models/sealers.ts`

Before:

```ts
}

/** What a box's seal takes in the clear: its sidecar, `am` and `written_at`, each optional. */
export type BoxPublicProps = PublicPropsOf<BoxThing, BoxCleartexts>
// --
```

After:

```ts
}

/** The public props of a box's seal ({@link PublicPropsOf}): its sidecar, `am` and `written_at`, each optional. */
export type BoxPublicProps = PublicPropsOf<BoxThing, BoxCleartexts>
// --
```

### `packages/safebyok/src/models/stamps.ts`

Before:

```ts
/** A gate's stamp, its bank's stamp, and its wayins: what a proving of a stored wayin takes. */
export type StampedGate = Z.infer<typeof stampedGate>
/** A box's stamp: its Thing fields, without its sidecar or its sealed whisper. The seal of its whisper is bound to it. */
export type BoxStamp    = Z.infer<typeof boxStamp>
// --
```

After:

```ts
/** A gate's stamp, its bank's stamp, and its wayins: what a proving of a stored wayin takes. */
export type StampedGate = Z.infer<typeof stampedGate>
/** A box's stamp: its Thing fields, not its sidecar or its sealed whisper.
 * Its whisper's seal is bound to it: the whisper unseals only within the revision it was sealed in.
 */
export type BoxStamp    = Z.infer<typeof boxStamp>
// --
```

### `packages/safebyok/src/phrases.ts`

Before:

```ts
export const CitedHalfShell = "What a write cites is the shell, at revseq -1, a lifepath ending in '-000000001' and the void revtok, in all three or in none."

/** A box a revision is made from that is half the shell. */
export const DonorHalfShell = "A box a revision is made from is the shell, at revseq -1, a lifeseq of '-000000001' and the void revtok, in all three or in none."
```

After:

```ts
export const CitedHalfShell = "What a write cites is the shell, at revseq -1, a lifepath ending in '-000000001' and the void revtok, in all three or in none."

/** A sealable box that is half the shell. */
export const DonorHalfShell = "A box a revision is made from is the shell, at revseq -1, a lifeseq of '-000000001' and the void revtok, in all three or in none."
```


## My fixes afterwards

### `packages/safebyok/src/models/core-box.ts`

Before:

```ts
const BoxTags: SealTags = Object.freeze({ codectag: 'json_v1', schematag: 'whisper_v1' })

/** The checks of a box's sealable, live or any, of its public and secret props, and of its stored record. */
const Checks = Validator.Checkers('bad_option', ({ obj, oneof, epochMillis }) => ({
  boxSealable,
```

After:

```ts
const BoxTags: SealTags = Object.freeze({ codectag: 'json_v1', schematag: 'whisper_v1' })

/** Checks for what a box's seal takes and makes: the sealable, a live sealable for a tombstone, the public and secret props, and the stored record. */
const Checks = Validator.Checkers('bad_option', ({ obj, oneof, epochMillis }) => ({
  boxSealable,
```

### `packages/safebyok/src/phrases.ts`

Before:

```ts
export const CitedHalfShell = "What a write cites is the shell, at revseq -1, a lifepath ending in '-000000001' and the void revtok, in all three or in none."

/** A sealable box that is half the shell. */
export const DonorHalfShell = "A box a revision is made from is the shell, at revseq -1, a lifeseq of '-000000001' and the void revtok, in all three or in none."
```

After:

```ts
export const CitedHalfShell = "What a write cites is the shell, at revseq -1, a lifepath ending in '-000000001' and the void revtok, in all three or in none."

/** A sealable box that matches the shell in some of its revseq, lifeseq and revtok, but not all three. */
export const DonorHalfShell = "A box a revision is made from is the shell, at revseq -1, a lifeseq of '-000000001' and the void revtok, in all three or in none."
```

### `packages/safebyok/src/storage/shapes-thing.ts`

Before:

```ts
    .refine(isParityRight,  Phrases.LifeseqParity)

  // What a box's seal takes its next revision's fields from strips: what it keeps is its Thing fields and sidecar, so a
  // sealed or an unsealed whisper given with it is dropped. The shell has no record, so its revseq, lifeseq and lifepath may be its -1.
  const boxSealable  = obj({
    ...thingRecord.shape,
```

After:

```ts
    .refine(isParityRight,  Phrases.LifeseqParity)

  // A box's sealable keeps only its Thing fields and sidecar, so a whisper given with it, sealed or not, is dropped. The
  // shell has no stored row, so its revseq, lifeseq and lifepath may be the shell's.
  const boxSealable  = obj({
    ...thingRecord.shape,
```

