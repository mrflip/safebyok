# Doc blocks removed by sprint unrace

The doc blocks as they stood before threads 17 and 14 stripped them, for reference. A block that survived unchanged isn't here. Code at `20f9fed9`; methods may have moved or changed since.



```ts
/** The record `patch` makes of `ante`, returned and held nowhere: under the revision after `ante`'s, written now, its whisper and sidecar sealed through the vault, and only those taken of it, each half left out being `ante`'s. Over a tombstone it is a birthday: registered now, under a `box_tok` fresh from {@link makeLifeTok}. */
async #edit(...)
```


## models/gate.ts

```ts
/** Refuses 'bad_option' where this gate holds a passkey: the one check before anyone is asked for one. */
demandPasskeyAddable(): void
```


## models/gating.ts

```ts
/** The dialog shown with a new gating, resolving what `run` answers once it settles. Refuses 'already_asking' a gating open on this bank, with no join; 'bad_option' a world with no dialog; 'declined' or 'locked_while_asking' an ask that ended with no attempt. */
static async launch<KindT extends GatingKind>(...)
```

```ts
/** The one door for a clear: what the user typed tried once, answered as an Outcome. Done, or refused for good, it settles the gating; a correctable refusal ({@link MSX.correctableKindVals}) leaves it open, and a passkey's answer unspent, to go again. Refuses 'attempt_in_flight' while one runs, and 'gating_landed' once settled, spending what it was handed. */
attempt(clears: ClearsForGatingkind[KindT]): Promise<Outcome<Vault>>
```

```ts
/** The attempt's one record and the gate it holds, read once, after its timeliness request: a vault found gone refuses here. */
const timelyAnte
```


## models/lease.ts

```ts
/** The lease this device has cached of the vault for `gate_epoch`, or null for none. One of another epoch or stamp is uncached and answers null, so the vault asks for a proof. The deviceDB answers none for a row of another `vault_tok`, or one failing its own check, and that row stands until the next lease is cached over it. A record that is no lease refuses 'damaged_lease', quoting nothing, and stays in place until the next lease is cached over it. */
static async peek(friend: LeaseFriend, gate_epoch: number): Promise<Lease | null>
```

```ts
/** Hold this lease as its vault's: the vault reads unlocked, and it is cached on this device. A vault past a sweep, a vacate or a delete refuses, the lease vacated. */
async attach(): Promise<void>
```

```ts
/** Drop the keys and uncache the record, so this device is locked. Nothing here has bytes to zero: the leaseKey is a non-extractable handle, and the wrap is ciphertext. A refused uncache leaves the lease out of force and the record cached. */
async vacate(): Promise<void>
```

```ts
/** `whisperText` sealed under a fresh boxKey, both bound to `stamp`. The lease going out of force meanwhile refuses 'vault_locked' and hands nothing back. */
async sealWith(whisperText: string, stamp: CipherCtxRecord): Promise<SealedWhisper>
```

```ts
/** The text `sealed` holds, bound to `stamp`: what `sealWith` sealed. It refuses 'damaged_box' where it will not open, and 'vault_locked', handing nothing back, where the lease went out of force meanwhile. */
async unsealWith(sealed: SealedWhisper, stamp: CipherCtxRecord): Promise<string>
```

```ts
/** The record, while the lease is in force: out of force refuses 'vault_locked'. */
#demandRecord(): LeaseRecord
```

```ts
/** The vaultKey for this one call, non-extractable, with the one usage. A lease out of force refuses 'vault_locked'; one that will not open locks its vault, is dropped, and refuses 'damaged_lease'. Nothing keeps the key between calls. */
async #vaultKey(usage: 'wrapKey' | 'unwrapKey'): Promise<CryptoKey>
```


## models/listing.ts

```ts
/** The live instances of one kind of thing, by scope, each made once and held, as its tombstone once gone.
 * `hello` starts the watch. Every answer storage gives to `fetch`, `put` or `del` goes through
 * `deliver`, and every instance is made and held through `#buildOrReceive`, a notice's too, so no
 * scope is built twice; the listing then makes its snapshot again. A call
 * is refused when it cannot give what it asked for: a refusal from storage, or a record its
 * instance's `receive` refuses. Bad news nobody asked about, a refusal met on a notice, is told to
 * `onBadNews`.
 */
export abstract class Listing<ScopeT extends object, RecordT extends SparseT, SparseT extends SparseBase<ScopeT>, SnapshotT, ThingT extends Storable<ScopeT, RecordT, SparseT, SnapshotT>> ...
```

```ts
/** Refuses past a sweep or a vacate. */
demandEnabled(): this
```

```ts
/** The instance held under `scope`, or null. Calls nothing. A scope that fails {@link scopeOf} refuses as it does. */
at(scope: ScopeT): ThingT | null
```

```ts
/** The instance of `record`, sparse, full or a tombstone, once it is delivered as a fetch's answer would be, and held; a thing already held under its scope receives it, and a refusal its `receive` throws is thrown. Stores nothing. */
async build(record: Fetched<RecordT, SparseT>): Promise<ThingT>
```

```ts
/** Refuses 'bad_option' a birth under a `scope` already held. A box's `send` brings one deleted back to life. */
protected demandNotHeld(scope: ScopeT): void
```

```ts
/** The instance under `scope` as storage now holds it, built where none was held, once storage's answer is delivered to it.
 * Where that leaves nothing present under `scope`, `opts.ifAbsent` says: 'fail', the default, throws {@link absentRefusal}; 'nil' resolves null.
 * A damaged row refuses 'damaged_record', holding what it held.
 */
async fetch(scope: ScopeT, opts: FetchOpts = {}): Promise<ThingT | null>
```

```ts
/** Put `duck` over `ante`'s revision, not whatever is held by then, and deliver the answer: `ante` is the record it was made from, null or one never stored for no record.
 * Over a live record, storage decides by {@link MSX.ifPresentVals}. A 'stale_write' or 'camped' refusal delivers the record storage holds before it is thrown. A `revision_seq` not one past `ante`'s refuses 'invalid_input'.
 */
async put(...)
```

```ts
/** Delete the thing `duck` names, a sparse record or a thing, over the revision of the instance held, or else `duck`'s own, and deliver the answer: its tombstone, or nothing for nothing stored. An entry of a `damaged_records`, `am` 'd', goes over its own revision: that is the customer naming that very row. A 'stale_write' refusal delivers as `put` does. */
async del(duck: SparseT | Thing<ScopeT, RecordT, SparseT>): Promise<ThingT | null>
```

```ts
/** The pipeline every answer takes. Take the world, where the answer has one; hand the record, or none stored, to `#buildOrReceive` under the scope its `req_params` name; a refusal answer is thrown, after the record a 'stale_write' or 'camped' carries is delivered.
 * The answer's own refusals are thrown: its world's, its `err`, or the absent refusal. A refusal `receive` throws is thrown too, as the instance cannot become what storage holds; but where the answer is itself a refusal, that one is thrown, and the carried record's is told to `onBadNews`.
 * Only to a fetch is an answer that leaves nothing present absent, once delivered: a `put` and a `del` have the instance back, a tombstone or not.
 */
protected async deliver(...)
```

```ts
/** The instance under `scope` once `record` meets it: the instance held, or, where none is or {@link fateOver} says 'replace', one born of `record` and held once it has taken it, the one it replaces vacated after. A refusal `receive` throws is thrown, nothing held. The listing then makes its snapshot again. Null for nothing stored and nothing held. A late answer past a sweep or a vacate refuses, building nothing. */
#buildOrReceive(...)
```

```ts
/** Refuse 'bad_record' a `record` whose scope is not `scope`, the one the answer that carries it names. */
#demandRecordOfScope(record: Fetched<RecordT, SparseT>, scope: ScopeT): void
```

```ts
/** A new instance for `record`, born over a central never stored, of the record's sparse form, so that `receive` adopts the record as it would any newer one; null for nothing stored. Refuses 'unexpected_error' a record under another `vault_tok` than the vault this listing lies in. */
#makeThingOf(record: Fetched<RecordT, SparseT> | null): ThingT | null
```

```ts
/** Deliver a notice of a row of this listing's kind as a good answer's record. Any refusal met on the way, the world's or one `receive` throws, is bad news, as nobody asked: told to `onBadNews`, never thrown into the vaultDB's watch. A world found gone ends the listing, which is no refusal. */
readonly #onNotice = (notice: VaultDBNotice): void =>
```

```ts
/** Tell each item of `badnews` to the host's `onBadNews`, where one was given, never awaited. A handler that throws, or whose promise rejects, is reported to the platform (`reportToPlatform`) and no more: the call that met the news goes on as it would have, and nothing is thrown into the vaultDB's watch. Call it for bad news no caller waits on. */
tellBadNews(badnews: readonly VaultError[]): void
```

```ts
/** The scope of `duck`, a record in any form or a thing ducking as one; refuses anything else. */
abstract scopeOf(...)
```

```ts
/** The sparse form of `duck`, a record in any form or a thing ducking as one, as a plain copy with the payload left out; refuses anything else. */
abstract sparseOf(duck: unknown): SparseT
/** The full record `duck` is, as a plain copy
```

```ts
/** The full record `duck` is, as a plain copy; refuses a duck that is not full. */
abstract recordOf(...)
```


## models/models-shapes.ts

```ts
/** The shapes the models share, imported as `MSX`: each section banner names the forms it holds.
 * A type generic over a model's record cannot come from its validator, so it stays a type, with
 * the validator beside it: each check judges what the base can know of a record, its revision,
 * its times, its `am` and its `vault_tok`, and leaves the concrete class's validator the rest.
 * A check of a bag reconciling passes refuses 'unexpected_error': a bag that fails one is a bug
 * in Storable, never a host's. Every other `parse` refuses as its doc says, quoting none of its input.
 */
import
```

```ts
/** The checks of what the base knows of any record, each refusing 'bad_record': `am`, one of {@link amVals}; `revision`, `times`, `liveness` and `vaulted`, a part each; and `sparseBase`, the four together, the least a sparse form carries beside its scope.
 * `tombstone` is a sparse base that is damaged or gone. Each takes its fields from whatever carries
 * them, a record, a storable or a snapshot, and strips the rest.
 *
 * @example sparseBase.parse(box)   // { revision_tok, revision_seq, registered_at, written_at, am, vault_tok }
 */
export const { am, revision, times, liveness, vaulted, sparseBase, tombstone }
```

```ts
/** The check of the revision `listing.put` lays a record over, refusing 'bad_option': a revision, or null for no record. */
export const putAnte
```

```ts
/** The sparse form of a thing damaged or gone: every sparse prop stays on it, for the record; nothing the user put in the thing does. {@link tombstone} checks what the base knows of one.
 * A row that fails its check is listed in `damaged_records` as a tombstone, `am` 'd', with sentinels for what cannot be read. It is never delivered: it leaves the vaultDB only when the customer names it to `del`. For a box, see {@link boxSparse}.
 */
export type Tombstone<SparseT>
```

```ts
/** The checks of what reconciling passes, each refusing 'unexpected_error': the kinds above, each by its list; `reconciled`, what `reconcileCentral` hands back; and `settled`, what `settle` and `receive` hand back. Checks only. */
export const { recordShape, age, centralPolicy, reconciled, settled }
```

```ts
/** The check of the object a box takes and gives its whisper in, `{ val }`, the whisper itself its `val`: what `send` and `create` take as `whisper`, and what `box.whisper` and `extractWhisper` give. Its `parse` refuses 'bad_option', naming the failing field and quoting none of it.
 * The `val` is a whisper as the old box keeps one, checked by the same check: any JSON value a
 * whisper can carry, never a bare null. The object takes no other field. {@link LOCKED}, which a
 * locked box answers for its whisper, refuses with a sentence that names it. A parse hands back a
 * copy frozen through, `val` and all, never the caller's own object, so the host's later changes
 * to theirs reach no box, and a box's to its own reach no host: set `box.whisper` anew to change
 * it.
 *
 * Its kind is 'bad_option', not the old box's 'bad_whisper': a whisper reaches a box inside a
 * dna or a patch, each checked whole by one check of one kind, so the setter, which takes the
 * whisper alone, refuses as they do.
 *
 * @example whisperHolder.parse({ val: 'sk-ant-...' })                 // a frozen { val: 'sk-ant-...' }, a copy
 * @example whisperHolder.parse({ val: { apiKey: 'sk-ant-...', orgId: null } })
 * @example whisperHolder.parse('sk-ant-...')                          // throws 'bad_option': a whisper is given as { val }
 * @example whisperHolder.parse({ val: null })                         // throws 'bad_option', naming val: emptying a box is del's job
 * @example whisperHolder.parse({ val: 'sk-ant-...', note: 'work' })   // throws 'bad_option': it takes no other field
 * @example whisperHolder.parse(LOCKED)                                // throws 'bad_option': LOCKED is not a whisper
 */
export const whisperHolder
```

```ts
/** The checks of a box's forms, each refusing 'bad_record', from a record or from a box ducking as one: `boxRecord`, the full record, strict, as a stored record is; `boxSparse`, a plain copy of every field but the sidecar and the sealed parts, the rest stripped. The scope alone is `boxscope` in shapes/scopes.
 * The sealed parts are the whisper ciphered under the boxKey, and that boxKey wrapped under the
 * vaultKey, each the {@link FX.ciphered} bag AES-GCM hands back, its iv and its ciphertext, as
 * the kit's `whisper_ciphered` and `box_key_wrapped` check them. The sidecar is the host's JSON
 * object, stored in the clear beside them but bound by the seal, so it rides only on the full record.
 * The sparse form keeps `whisper_codec` and `whisper_schema_version`, which say how a whisper is
 * sealed, so a sparse record can be sealed over as it is.
 */
export const { boxRecord, boxSparse }
```

```ts
/** The check of what a vault's get lists of its boxes, refusing 'bad_record': `boxes`, sparse, tombstones among them, and `damaged_records`, each row that failed its check, whose boxlabel is whatever storage has it under. */
export const boxesListed
```

```ts
/** The check of a boxlabel a box verb is handed, refusing 'bad_option'. */
export const boxlabelArg
```

```ts
/** The checks of what a caller hands to make or update a box, each a duckish refusing 'bad_option' and naming the failing field: `boxDna`, what `create` takes; `boxPatch`, what `send` takes; `boxPut`, what `vault.putBox` takes. A record is checked by `boxRecord` or `boxSparse`, never by these.
 * A whisper that fails {@link whisperHolder} refuses 'bad_option' here, as every field does, naming
 * `whisper` or `whisper.val`. The props the factory controls may be given, must pass their checks,
 * and are stripped. A field none takes refuses, as a bag a person typed would.
 *
 * `boxDna` requires `whisper`, the {@link WhisperHolder} sealed in, and `sidecar`: a birth has none
 * to keep.
 *
 * `boxDna` requires the scope too, and fills `whisper_codec` and `whisper_schema_version` with
 * their defaults where missing or undefined; the factory's props are `fmt`, `am`, `vault_tok`,
 * `box_tok`, `revision_tok` and the times. The sealed parts never come from a dna: `create` seals every box it
 * makes, so a dna carrying one refuses, as a field it does not take, and `revision_seq` among them:
 * input carrying one is a record, which goes to `build`.
 *
 * `boxPatch` names `whisper`, `sidecar` or both, the half left out being kept, and refuses a patch
 * naming neither. It takes the round trip of a box's record, `{ ...record, whisper, sidecar }`: every prop
 * of the record but the sidecar is the factory's, the scope, `revision_seq`, the whisper's codec and
 * the sealed parts among them. It hands back the whisper and the sidecar, and the scope's fields as
 * given, each undefined where left out, for the box to hold to its own scope.
 *
 * `boxPut` is `boxPatch` with the `boxlabel` required.
 *
 * @example boxDna.parse({ ...scope, whisper: { val: 'sk-ant-...' }, sidecar: {} })                                 // { ...scope, sidecar: {}, whisper_codec: 'json_v1', whisper_schema_version: 1, whisper: { val: 'sk-ant-...' } }
 * @example boxDna.parse({ ...scope, whisper: { val: 'sk-ant-...' }, sidecar: {}, am: 'x', vault_tok: 'tok-u1' })   // the scope, whisper, sidecar and defaults: am and vault_tok are the factory's
 * @example boxDna.parse({ ...scope, whisper: { val: 'sk-ant-...' } })                                              // throws 'bad_option', naming sidecar
 * @example boxDna.parse({ ...scope, revision_seq: 3 })                                                             // throws 'bad_option': a dna carries no revision_seq
 * @example boxDna.parse({ ...scope, whisper_ciphered: ciphered })                                                  // throws 'bad_option': the sealed parts are the seal's to make
 * @example boxPatch.parse({ ...record, whisper: { val: 'sk-ant-...' }, sidecar: {} })                              // { whisper: { val: 'sk-ant-...' }, sidecar: {}, ...scope }
 * @example boxPatch.parse({ sidecar: { note: 'work' } })                                                            // { sidecar: { note: 'work' } }, the whisper kept
 * @example boxPatch.parse({})                                                                                       // throws 'bad_option': it names neither half
 * @example boxPatch.parse({ whisper: LOCKED, sidecar: {} })                                                        // throws 'bad_option', naming whisper: LOCKED is not a whisper
 * @example boxPut.parse({ boxlabel: 'anthropic_api_key', whisper: { val: 'sk-ant-...' } })                          // { boxlabel, whisper, ... }
 */
export const { boxDna, boxPatch, boxPut }
```

```ts
/** The check of whether the world a listing lives in is unlocked or locked: one of {@link lockStateVals}. Its `parse` refuses 'unexpected_error', as a world that answers otherwise is a bug. */
export const lockState
```

```ts
/** The check of the world a listing lives in, the vault for boxes and the bank for vaults, as far as the base needs it: the one `clock`. Its `parse` takes the clock from whatever carries it, strips the rest, and refuses 'bad_option'. */
export const world
```

```ts
/** The checks of the options a storable and its verbs take, each refusing 'bad_option', naming the failing field.
 * `ifPresent` is optional, one of {@link ifPresentVals}; `ifAbsent` is one of {@link ifAbsentVals}. `horizonMillis`
 * is a span of milliseconds, 0 or more, or `Infinity` for never; `maxMillis` is one or none. `timelyOpts` says how fresh the
 * record in hand (`maxMillisSinceRefresh`) and the world (`maxWorldMillis`) must be before a verb
 * goes on; `fetchOpts` adds `ifAbsent`; `sendOpts` adds `ifPresent`; `storableOpts` is what a storable is made with. Each takes its fields from the bag given and
 * strips the rest. `listener` is what
 * `subscribe` enrolls, a function.
 */
export const { ifPresent, ifAbsent, horizonMillis, maxMillis, timelyOpts, fetchOpts, sendOpts, storableOpts, listener } ...
```

```ts
/** The check of a vaultDB as a model is handed one: the verbs the listings call. Its `parse` refuses 'bad_option'. Checks only. */
export const vaultDBDuck
```

```ts
/** The check of a listing's constructor arguments, as far as the base can tell. Its `parse` refuses 'bad_option'. Checks only. */
export const listingOpts
```

```ts
/** The check of what `listing.put` is told of a live record storage may hold, refusing 'bad_option': `ifPresent`, `repl` where left out. */
export const putListingOpts
```

```ts
/** The check of a box listing's options, beyond what {@link listingOpts} checks: its world names the vault's scope and its `vault_tok`, and answers the seal verbs. Its `parse` refuses 'bad_option'. Checks only. */
export const boxListingOpts
```

```ts
/** The check of a storable's constructor arguments, as far as the base can tell. Its `parse` refuses 'bad_option'. Checks only. */
export const storableArgs
```

```ts
/** The bag a storable answers in place of what the locked vault hides: `box.whisper` answers it while the vault is locked. A frozen singleton, branded by a symbol of the package's own.
 * Tell it apart with `Storable.isLockedFUBag(val)`, which is true for this one object alone: never
 * by `===` against a bag you built, nor by its look, as a copy of it is no LOCKED. Setting
 * `box.whisper = LOCKED` forgets the exposed whisper, as null does.
 */
export const LOCKED: LockedBag
```

```ts
/** The fields of a vault fixed for its life, which every ctx under it binds: the scope, `vault_tok` and `registered_at`. Its `parse` takes them from whatever carries them, a Vault included, strips the rest, and refuses 'bad_option'. */
export const vaultStamp
```

```ts
/** The checks of a vault's forms, each refusing 'bad_record', from a record or from a vault ducking as one: `vaultSparse`, a plain copy of the scope and the base's fields, the rest stripped; `vaultRecord`, those fields and the `gate`, its wayins as {@link gateProps} checks them, strict, as a stored record is. A vault record is never without its gate. The scope alone is `vaultScope` in shapes/scopes. */
export const { vaultRecord, vaultSparse }
```

```ts
/** The check of a vault listing's options past what {@link listingOpts} checks: that its world carries what a vault's gate and lease need. Its `parse` refuses 'bad_option'. Checks only. */
export const vaultListingOpts
```

```ts
/** The arguments of each lease verb. A stamp is the caller's own fields fixed for its record's life, flat; the lease binds it under the vault's stamp and each of its own purposes (`box_key_wrapped`, `whisper_ciphered`), so the purposes never leave it. */
export const { ctxStamp, leasePeekArgs, leaseGrantArgs, provingLeaseArgs, leaseSealArgs, leaseUnsealArgs } ...
```


## models/proving.ts

```ts
/** The strengthChecker's verdict. What it throws is replaced, as it heard the passphrase ('unexpected_error'); an answer that is no verdict refuses 'bad_option'. */
static async checkStrength(...)
```

```ts
/** The wayin this proving holds, made under a vaultKey new (`NOVEL`) or held by the `source` proving of the same vault. A proving holds one wayin: one that holds one already refuses. */
async buildWayin(source: Novel | Proving): Promise<Wayin>
```

```ts
/** A lease on `friend`'s vault under the vaultKey this proving's wayin holds, good for the epoch proved or the one passed, recording when and how it was proved. A friend whose stamp is not this proving's refuses 'bad_option', before any key is touched. It is neither held nor cached until {@link Lease.attach}. */
async buildLease(friend: LeaseFriend, gate_epoch: number = this.gate_epoch): Promise<Lease>
```

```ts
/** Unwrap the stored wayin's vaultKey and drop it, or refuse as `wrongProof`: the ctx is built before the catch, so a refusal means only that the key did not open the wrap (guarantees.md, G3). */
protected async checkOpens(wrongProof: () => VaultError): Promise<void>
```

```ts
/** A proving for a new wayin, of the first gate's epoch. A passphrase the world's strengthChecker finds weak refuses 'weak_passphrase', with its reason. */
static async buildNovel(...)
```

```ts
/** The proving of `gate`'s passphrase wayin, proved against the gate in hand: one made under another key deriver refuses 'unknown_key_deriver', and a passphrase that does not open it 'wrong_passphrase'. */
static async buildStored(...)
```

```ts
/** The proving of `gate`'s passkey wayin, proved against the gate in hand: a gate with none refuses 'absent_wayin', and an answer of another credential or salt, or one that does not open it, 'wrong_passkey'. */
static async buildStored(gate: StampedGate, passkeyClear: VX.PasskeyAnswer): Promise<PasskeyProving>
```


## models/storable.ts

```ts
/** How `post` compares to `ante`: the later `revision_seq` is newer. The same seq under another `revision_tok` is two puts landed as one revision, refused 'record_conflict'. */
export const cmpRevisions
```

```ts
/** The vault this thing lies in, inscribed once by `assignInitialProps` and never moved: a record under another `vault_tok` is refused, not taken. */
declare readonly vault_tok: string ...
```

```ts
/** Inscribe the own props, before the seal: the scope and `vault_tok`, tattooed immutably, and `registered_at`, here; through `assign`, the ones that follow the record in hand. A concrete class with props of its own overrides it, calls super first, and inscribes them the same way: as own props, assigned, tattooed or adorned, never as #fields, which do not exist while the base constructor runs. */
protected assignInitialProps(central: Fetched<RecordT, SparseT>): void
```

```ts
/** Assign the mutable own props from `record`, the record about to be in hand: for the base, its revision and `written_at` always, and its `registered_at`, which dates a life of the thing, only where `record` is of another life than the record in hand until now, as at a birthday made here or received. `adopt` calls it before it replaces central, so that is the record judged; `assignInitialProps` sets `registered_at` at birth itself. Never `vault_tok`, fixed at birth. A concrete class with mutable props of its own overrides it, calls super first, and takes them from `record` alone. */
protected assign(record: Fetched<RecordT, SparseT>): void
```

```ts
/** The full record in hand, or refuses 'bad_option' where it is sparse or a tombstone. */
protected demandFullProps(): RecordT
```

```ts
/** Get the record storage holds, through the listing, which delivers it to `receive`. A call made while a fetch is under way joins it, and settles as it settles.
 * Where nothing is stored, or a tombstone, each call's `opts.ifAbsent` says: 'fail', the default, throws the absent refusal; 'nil' resolves this thing, absent.
 * A thing the answer let go, a new instance in its slot, refuses 'disabled'.
 */
async fetch(opts: FetchOpts = {}): Promise<this>
```

```ts
/** Make the world timely, as its answer may lock the vault or take the thing away, and fetch the record unless it is timely within `opts.maxMillisSinceRefresh`, by default the thing's horizon.
 * A thing found absent is no refusal.
 */
async hydrate(opts: TimelyOpts = {}): Promise<this>
```

```ts
/** Take in what storage said about this thing: `rcvd`, or null for nothing stored, which reads as a tombstone at the
 * revision held. A record storage could not validate never arrives: it is set aside in `damaged_records`.
 * `reconcileCentral` judges it; on 'older' or 'same' central stays, and otherwise the record is adopted and the
 * thing settles. A record not older than central notes success where, once it is taken in, the record in hand is whole,
 * so a sparse one that only confirms the revision held counts; an older one notes nothing. Past a discard, it takes nothing.
 */
receive(rcvd: Fetched<RecordT, SparseT> | null): Settled
```

```ts
/** Bring the snapshot up to the state just adopted, notifying the subscribers where it changed. Calling it again changes nothing. The base answers no bad news. A subclass that overrides it calls super last, so that the snapshot sees what the subclass set. */
settle(): Settled
```

```ts
/** The central that results from `rcvd` meeting the central held, and the policy that names the row taken.
 *
 * Of the shapes, only a deletion against a living record, either way round, refuses 'record_conflict'; `cmpRevisions`
 * refuses another tok at the same seq before any row is weighed.
 *
 * NOTE, another life (the Coach, 2026-10-31). A record's life is its {@link lifeTokPathOf}, compared with central's by
 * `#sameLife`. A put lands at the stored row's `revision_seq` + 1, and seqs continue over tombstones, so revisions order
 * the records of every life of a scope alike. A record of another life is weighed by its age as any other, past two rows
 * of its own:
 * * Under another `vault_tok` than this thing's ('other vault'), it throws 'unexpected_error', whatever its age or shape,
 *   over a central never stored included: this thing's `vault_tok`, tattooed at birth, never moves. A vault's life is its
 *   `vault_tok`, so a record of another life of a vault takes this row where it reaches a held instance: the vault listing
 *   routes one past it, to a new instance.
 * * At the revision held, it throws 'record_conflict': one revision cannot begin a life and continue another.
 * Past those, a newer record of another life is the thing born anew elsewhere, after a deletion this device may not have
 * received: a birthday, taken by the newer rows like any other. An older one is a past life's, and is older.
 *
 * | life        | age   | rcvd   | central | policy                   | central after |
 * | ----------- | ----- | ------ | ------- | ------------------------ | ------------- |
 * | other vault | any   | any    | any     | throw 'unexpected_error' | -             |
 * | other       | same  | any    | any     | throw 'record_conflict'  | -             |
 * |             |       |        |         |                          |               |
 * | any         | older | any    | any     | 'older'                  | central       |
 * | any         | older | gone   | any     | 'older'                  | central       |
 * |             |       |        |         |                          |               |
 * | same        | same  | gone   | alive   | throw 'record_conflict'  | -             |
 * | same        | same  | alive  | gone    | throw 'record_conflict'  | -             |
 * | same        | same  | sparse | any     | 'same'                   | central       |
 * | same        | same  | gone   | gone    | 'same'                   | central       |
 * | same        | same  | full   | full    | 'same'                   | central       |
 * | same        | same  | full   | sparse  | 'fill'                   | rcvd          |
 * |             |       |        |         |                          |               |
 * | any         | newer | sparse | any     | 'adopt'                  | rcvd          |
 * | any         | newer | full   | any     | 'adopt'                  | rcvd          |
 * | any         | newer | gone   | any     | 'gone'                   | rcvd          |
 * |             |       |        |         |                          |               |
 *
 * The age is `cmpRevisions(central, rcvd)`, which refuses the same seq under another tok.
 */
protected reconcileCentral(...)
```


## models/vault-listing.ts

```ts
/** The bank, as far as its vaults need it: a {@link ListingWorld}, and what a vault's gate and lease need of it, as `vaultListingOpts` checks it. Each vault's lease friend binds its deviceDB's lease verbs. */
export type VaultWorld
```

```ts
/** The host's dialog. With none, a vault that needs asking for refuses. */
requestCleartext?: RequestCleartext | undefined ...
```

```ts
/** A new vault under `scope`, asked of the user through a gating, stored, held, and unlocked under its passphrase's lease; where another vault won the slot meanwhile, that one, locked. Refuses 'bad_option' a vault present in the slot, nobody asked. A refused put holds nothing; a lease refused past the put leaves the vault stored and held, locked. */
buildVault(scope: VaultScope): Promise<Vault>
```

```ts
/** Put `record`, a birth, over `prior`, the tombstone's revision or never stored, and resolve the vault held. Landed, a new vault of it replaces the slot's tombstone or void, locked. Where another vault stands stored, a vault of that one is held and answered, locked, a success: the caller tells by `vault_tok`. Refused, it stores nothing and holds nothing of `record`; a 'stale_write' delivers the record stored. */
ensureVault(record: VaultRecord, prior: Revision): Promise<Vault>
```

```ts
/** The tombstone a birth under `scope` goes over, or null over none held; refuses 'bad_option' a vault present in the slot. */
demandBirthSlot(scope: VaultScope): Vault | null
```

```ts
/** Every vault and tombstone the vaultDB holds for this bank, delivered: each meets its slot as a fetch's answer would. Boxes wait on their vault's listing. A damaged row is bad news; a refused get refuses, taking nothing in. */
async fetchBank(): Promise<void>
```

```ts
/** Lay a new passphrase wayin on the row, deliver what it stores to the vault held, and answer that record. A row moved since refuses 'stale_write', the row stored delivered first. Nothing locks: the vaultKey does not change. */
async replacePassphrase(params: ReplacePassphraseParams): Promise<VS.VaultRecord>
```

```ts
/** Lay a passkey wayin on the row, as {@link replacePassphrase} does; one held refuses 'camped'. */
async addPasskey(params: AddPasskeyParams): Promise<VS.VaultRecord>
```

```ts
/** Null the row's passkey wayin, as {@link replacePassphrase} does; with none held, nothing moves. */
async revokePasskey(params: RevokePasskeyParams): Promise<VS.VaultRecord>
```

```ts
/** Delete the vault `ante` names, over its own revision and not the slot's, its answer delivered; its boxes cascade in the vaultDB. A row moved since refuses 'stale_write', delivered first; `ante` of another life than the slot's refuses 'stale_write', nothing asked of the vaultDB. An entry of a `damaged_records` names that very row, whatever is held. */
override async del(ante: VaultSparse | Vault): Promise<Vault | null>
```

```ts
/** Claims the one gating this bank may have open; refuses 'already_asking' while one is. */
holdGating(gating: AnyGating): void
```

```ts
/** Deliver a get of `vault` as a fetch does, and answer the boxes it listed: none where it found no vault, as `vault` then tells by its own state. A damaged row refuses 'damaged_record'. */
async fetchListed(vault: Vault): Promise<BoxesListed>
```


## models/vault.ts

```ts
/** A vault as this device holds it: a storable that ducks as its record, and the world its boxes live in.
 * Its `vault_tok` is the life of the vault in its scope, fixed at birth: a birth's is minted
 * by the listing, a received record's is its own, and a record under another `vault_tok` throws
 * 'unexpected_error'. Its record carries its gate, the wayins, and nothing else stores them. Its
 * guards take no lock: its record holds no secret. A vault deleted is not sent back to life, as a
 * box is: a new life is a new `vault_tok`, so a new instance, created by the listing.
 */
export class Vault extends Storable<VaultScope, VaultRecord, VaultSparse, VaultSnapshot> implements BoxWorld ...
```

```ts
/** This vault, refreshed within `maxMillis`, by default its horizon: as it stands where it is recent, otherwise fetched. A vault found gone refuses 'vault_gone', and a row found damaged 'damaged_record'. */
async ensureTimely(maxMillis?: number): Promise<this>
```

```ts
/** The full record in hand, what a gate change spreads into its params. A vault held sparse, or a tombstone, refuses 'bad_option': hydrate first. */
get fullRecord(): VaultRecord
```

```ts
/** The Gate of the record in hand, the same while the record's `gate` is the same object, so a record received remakes it. A vault held sparse, or a tombstone, has none in hand and refuses 'bad_option': hydrate first. */
get gate(): Gate
```

```ts
/** Replace the passphrase through a replace_passphrase gating, answering as {@link Gating.launch}. The passkey stays. A lease held is renewed under the new epoch, unless a lock crossed it, and no other device is locked. A record moved since the attempt read it refuses 'stale_write', storing nothing. */
async replacePassphrase(): Promise<this>
```

```ts
/** Add a passkey through an add_passkey gating, as {@link replacePassphrase} does. A passkey held refuses 'bad_option', nobody asked; one added since the ask refuses 'camped' or 'stale_write'. */
async addPasskey(): Promise<this>
```

```ts
/** Revoke the passkey through a revoke_passkey gating, as {@link replacePassphrase} does. With none held it answers at once, nobody asked. The vaultKey does not change: a device that has it keeps it to its lock. */
async revokePasskey(): Promise<this>
```

```ts
/** Delete this vault through a del_vault gating, answering as {@link Gating.launch}: the vault locked, a tombstone stored, its boxes gone from the vaultDB, nothing of it on this device, and the Vault staying in its slot, tombstoned. A lock does not stop it. A record moved since the attempt read it refuses 'stale_write', the vault left locked. */
async delVault(): Promise<this>
```

```ts
/** Build a vault under `scope` through a gating, whose own proving alone is handed the friend.
 * A vault present in the slot refuses 'bad_option', nobody asked. */
static async launchBirth(listing: VaultListing, scope: VaultScope): Promise<Vault>
```

```ts
/** Past the enter key: the put is the commit, and a vault_tok not the record's is another's vault, left locked. */
static async #runBirth(...)
```

```ts
/** This vault, unlocked: as it stands, else by the lease this device has cached, else by asking the user through an unlock_vault gating, which answers as {@link Gating.launch}. With no dialog in the world, refuses 'vault_locked'. A refused look at the cache is told as bad news, and asks. */
async ensureUnlocked(): Promise<this>
```

```ts
/** Hold `lease` as the vault's, dropping any it displaces, and cache it. A lease of another holder refuses 'bad_option', left alone, as its row is another's; one out of force refuses 'vault_locked'; on a vault not ready, the lease is vacated and the refusal thrown. A refused cache costs the next session a proof, not this one its lease, so it is told as bad news. */
async #attachLease(lease: Lease): Promise<void>
```

```ts
/** Drop any lease held and erase the row cached. The lease goes first, so an erase that throws leaves none; the erase is called before the first await, so it lands in call order against any cache. Refused, `onRefused` hears it, by default a panic. */
async #vacateLease(...)
```

```ts
/** `whisperText` sealed under a fresh boxKey under this vault's key, both bound to `stamp`. A locked vault refuses 'vault_locked', as does a lock crossing it; a lease that will not open locks the vault and refuses 'damaged_lease'. */
async sealStampedString(whisperText: string, stamp: CipherCtxRecord): Promise<SealedWhisper>
```

```ts
/** The text `sealed` holds, bound to `stamp`. It refuses as `sealStampedString` does, and 'damaged_box' where `sealed` will not open. */
async unsealStampedString(sealed: SealedWhisper, stamp: CipherCtxRecord): Promise<string>
```

```ts
/** Fetch this vault with what its get lists: a timely vault, its boxes held sparse, its damaged rows set aside, and the box listing's watch started. The first box call runs it; a host may run it sooner. A vault found gone refuses 'vault_gone'. */
async hello(): Promise<this>
```

```ts
/** The timely full box under `boxlabel`. Where none is present, `opts.ifAbsent` says: 'fail', the default, refuses 'absent_box'; 'nil' resolves null. A damaged row refuses 'damaged_record'. A vault gone refuses 'vault_gone', and a vault locked, at the start or by the end, 'vault_locked'. */
async getBox(boxlabel: string, opts: FetchOpts = {}): Promise<Box | null>
```

```ts
/** Seal and store the box `patch` names. With a box listed, a tombstone included, this is its `send`. With none, it is a birth over no record, its sidecar `{}` where left out; a whisper left out fetches first, and refuses 'no_whisper' only where no box is stored. Over a live record, `opts.ifPresent` says, as `send` has it: `get` resolves the box as stored, `patch` discarded. Refuses as `send` does; a vault gone refuses 'vault_gone'. */
async putBox(patch: BoxPut, opts: SendOpts = {}): Promise<Box>
```

```ts
/** Delete the box under `boxlabel`, a damaged row set aside there included: the box in its tombstone, or null for nothing stored. Refuses 'stale_write' where the row moved, delivered first; a vault gone refuses 'vault_gone', and a vault locked 'vault_locked'. */
async delBox(boxlabel: string, opts: TimelyOpts = {}): Promise<Box | null>
```

```ts
/** The box listing, this vault having said hello, refusing as `demandReadyForBoxes` does at each end. */
async #ensureReadyForBoxes(): Promise<BoxListing>
```

```ts
/** The listing of this vault's boxes, made once, on first asking. A vault gone refuses 'vault_gone'. */
get boxListing(): BoxListing
```


## storage/device-db-new.ts

```ts
/** The base of a deviceDB. Each verb throws its refusal and returns its answer; each `try*` answers an Outcome.
 * **Calls land in the order they were made:** each verb calls its `do*` before awaiting anything, so
 * a store that starts each call's work in the order called keeps a `vacate` made after a `cache` erasing it.
 * No verb returns or logs a `lease_key`; the sparse answer of `leasesProvedBefore` holds none.
 */
export abstract class DeviceDB
```


## storage/device-db-shapes.ts

```ts
/** What the deviceDB stores and takes, and their checkers, imported as `DS`. A scope or query refuses 'bad_scope'; a row or record, 'bad_record'; a cutoff, 'bad_option'. */
import type * as Z from 'zod'
import
```


## storage/memory-vault-db.ts

```ts
/** A new live box in a vault already holding its `maxBoxes` refuses `vault_full`. */
#demandRoom(boxrows: Map<string, unknown>, ante: unknown): void
```


## storage/vault-db-new.ts

```ts
/** In one transaction: stops, writing nothing, at a live row under this `vault_tok` not at `prior`, or at any other row failing its checks. Otherwise writes `tombstone` over a live row of this life, and tombstones the box rows under this `vault_tok`, as {@link VS.boxTombstoneOf} does. */
protected abstract doDelVault(...)
```

```ts
/** The vault by scope alone, whatever its life, with its sparse boxes and `damaged_records`. Over a void or gone row, `ifAbsent: 'nil'` answers null and 'fail' refuses `vault_empty` or `vault_gone`. */
async getVault(...)
```

```ts
/** The box under this `vault_tok`, its vault row as `world`. Over a void or gone box row, `ifAbsent: 'nil'` answers null and 'fail' refuses `absent_box`; a vault row of no such life refuses `vault_mismatch`, `vault_empty` or `vault_gone`. */
async getBox(asked: BoxQuery, opts?: IfAbsentOpts): Promise<GoodAnswer<BoxRecord | null, GotAct>>
```

```ts
/** Stores `record` when the row stands at `prior`: `born` over void, `reborn` over a tombstone. Over a live row, at `prior` or not, `ifPresent: 'fail'`, the default, refuses `camped` and 'get' answers it as `declined`; a tombstone or void that is not `prior` refuses `stale_write`. A live row moves only by a gate verb. */
async putVault(record: VaultRecord, opts: PutVaultOpts): Promise<GoodAnswer<VaultRow, PutAct>>
```

```ts
/** Stores `record` under a vault live at its `vault_tok`, with the answers of {@link VaultDB.putVault}; a vault row of no such life refuses `vault_mismatch`, `vault_empty` or `vault_gone`, and an overweight box `box_too_large`. */
async putBox(record: BoxRecord, opts: PutOpts): Promise<GoodAnswer<BoxRow, PutAct>>
```

```ts
/** Lays the new passphrase wayin on the row at this revision, moving `gate_epoch` and the revision up; `passkey_wayin` is left as stored. A moved row refuses `stale_write`. */
async replacePassphrase(...)
```

```ts
/** Lays a passkey wayin on a row holding none, as {@link VaultDB.replacePassphrase} does; a passkey held refuses `camped`. */
async addPasskey(params: AddPasskeyParams): Promise<GoodAnswer<VaultRecord, 'added'>>
```

```ts
/** Nulls the row's passkey wayin, as {@link VaultDB.replacePassphrase} does. A row holding none answers `revoked` as stored, nothing moved. */
async revokePasskey(params: RevokePasskeyParams): Promise<GoodAnswer<VaultRecord, 'revoked'>>
```

```ts
/** Writes the tombstone over a live row at `prior`: `deleted`. A row already `gone` or `void` answers so, the request discarded. A row moved past `prior` refuses `stale_write`. A row failing its checks is deleted only as `damaged_records` lists it, sentinels and all; otherwise it refuses as a get does. */
async delBox(tombstone: BoxTombstone, opts: DelOpts): Promise<GoodAnswer<BoxTombstone, DelAct>>
```

```ts
/** Writes the tombstone over the live row at `prior` and tombstones this life's boxes in one transaction: `deleted`. A repeat writes no vault row, whatever its revision, still tombstones the boxes, and answers `gone`, or `void` for a row that is nothing of this life. A row moved past `prior` refuses `stale_write`, and tombstones nothing. A row failing its checks is deleted only as `damaged_records` lists it, sentinels and all; otherwise it refuses as a get does. */
async delVault(...)
```

```ts
/** The vault row when it is live in this life; otherwise refuses `vault_mismatch` for a live row of another, `vault_gone` for this life's tombstone, and `vault_empty` for nothing of this life. */
const checkedVaultLife
```


## storage/vault-db-shapes.ts

```ts
/** The one place each stored thing's shape is drawn: the vaultDB's records, its verbs' params and their checkers, imported as `VS`. Every `parse` refuses 'invalid_input', quoting none of it; a stored row is judged by `safeParse`. The models take these same shapes, refusing 'bad_record'. */
import type * as Z from 'zod'
import
```

```ts
/** True when `raw` passes a vault row's checks, live in the life `vault_tok`: a box write lands only under one, as the base refuses any other. */
export const isCheckedLiveVault
```
