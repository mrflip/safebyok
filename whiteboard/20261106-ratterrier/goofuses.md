# Goofuses in `packages/safebyok/src/models/`

Read on `origin/main` at `a19292549`, after `git fetch`. Rules from `STYLE.md`, `notes/gallant.md`,
`notes/gallant-docblocks.md` and `notes/gallant-test_titles.md`. Paths are under `packages/safebyok/src/`. Nothing was
edited.

A tag is the gallant hashtag where one exists. Otherwise it names the STYLE.md section. **Maybe:** marks a finding that a
ruling could overturn, or one where I could not tell intent from the code. Several sites with one fault share a row; the
location column lists them all, and the representative line comes from the first.

## Before the table

* **`notes/gallant-docblocks.md` has unresolved merge-conflict markers on `origin/main`**: `<<<<<<< HEAD` / `=======` /
  `>>>>>>> 32d3abf71` at lines 17-23, and again at 188-189 and 753. Everything from line 189 to 753, the whole *From the old
  tree* half, sits inside the conflict.
* **The rule docs have drifted from the code** (these are not code goofuses):
  * STYLE *Imports* names `lease.ts's leaseSealProps` and `vault.ts's putBoxProps`. The code has `GX.leaseSealArgs`, and
    no `putBoxProps`.
  * STYLE *Scopepaths* calls `Scopepath` a public module. The new core has none.
  * gallant.md's examples say `MSX.`, and the code says `VX.`.
* The Planned sites, which gallant.md says to skip, have a table of their own at the end. The main table leaves them out.

## Safety hatches, as CLAUDE.md asks to report

| Location | Hatch |
|---|---|
| `models/storable.ts:201` | `` eslint-disable-line sonarjs/cognitive-complexity` on `reconcileCentral `` |
| `models/listing.ts:68`, `:108` | `` eslint-disable-line @typescript-eslint/require-await` on `build`, `hello `` |
| `models/proving.ts:217` | `@ts-expect-error` in `isSafelyAllZero`. The Gallant in gallant-docblocks.md writes `bytes[ii] ?? 0` instead |
| `models/listing.ts:199`, `:344` | casts: `as VaultRow \| BoxRow \| null`, `as Fetched<RecordT, SparseT> \| null \| undefined` |
| `models/vault-listing.ts:182` | cast: `opts as PutVaultOpts` |
| `models/gating.ts:78`, `:85` | cast: `as unknown as AnyGating`, twice |
| `models/gating.ts:263`, `:269` | casts: `as readonly string[]`, `clears as { passkeyClear?: … }` |
| `models/bank.ts:307` | cast: `globalThis as { isSecureContext?: unknown }` |

## storable.ts

| Location | Tag | Comment | Representative line |
|---|---|---|---|
| `models/storable.ts:26`, `:76`, `:89`, `:91`, `:296`, `:327-336`, `:344`, `:360` | STYLE *Comments and doc blocks* (every export gets a doc block) | The exported abstract class has no doc block. Neither do the public `scope`, `am`, `toJSON`, `isLocked`, `demandUnlocked`, `demandEnabled`, `demandFull`, `demandWhole`, `ensureDeletable` or `demandPresent`. | `export abstract class Storable<ScopeT extends object, RecordT extends SparseT, …> {` |
| `models/storable.ts:29` | #purpose-not-machinery | Says how `world` is attached, not what it is. `listing`, beside it, has no doc at all. | `/** Adorned in the constructor: readable, left out of enumeration and JSON. */` |
| `models/storable.ts:33`, `:35` | #purpose-not-machinery | Names the helpers that assign the props, and when they run. One block covers four fields. | `` /** The revision and times of the record in hand, as plain own props, assigned before the seal by `assignInitialProps` and again by `assign` at each adopt: … */ `` |
| `models/storable.ts:36-39`, `:121` | STYLE *Stateful objects and snapshots* | `revision_tok`, `revision_seq`, `registered_at` and `written_at` are mutable own enumerable fields, and the constructor ends in `Object.seal(this)`, not `freeze`. STYLE wants the own fields frozen as the stamp, with each changing value in a `#field`, read through the snapshot. These four are a second way to read what `snapshot` carries. | `declare revision_tok:  string` |
| `models/storable.ts:41` | #a-helper-gets-a-phrase, #three-questions | A private field's doc says who uses it ("the listing keys and watches by it") and how the duck is built. | `/** The scope, held once and frozen: the listing keys and watches by it, and the verbs name it. Its props are also tattooed on, … */` |
| `models/storable.ts:44`, `models/listing.ts:35` | #facts-from-the-code, #say-the-positive | `#isEnabled` starts `true`, and a sweep *clears* it. "Set by a sweep" reads as the old `#isDisabled`. | `/** Set by a sweep or a vacate, and never cleared. */` |
| `models/storable.ts:70-71` | #its-name-is-its-doc, #no-wrapper-without-a-job | `isFUBag`: no vocabulary has "FU", and the name says nothing of the `Whispered` mark. The static only forwards to consts.ts's `isWhisperedBag`. | `static isFUBag(val: unknown): val is WhisperedBag { return isWhisperedBag(val) }` |
| `models/storable.ts:93-103`, `models/box.ts:77` | #lead-with-the-job, #customer-first | "Direct public access to …" and "Public access to the unbound … callback" describe how the member is reached, not what it gives. "hand over yer snapshot" is slang. | `/** Public access to the unbound "hand over yer snapshot" callback */` |
| `models/storable.ts:100` | STYLE *Braces and layout* (parallel construction) | Column padding with no column to line up with. | `get       getSnapshot(): () => SnapshotT { return this.#getSnapshot }` |
| `models/storable.ts:105` | #no-sibling-comparisons | Opens "As {@link subscribe}". Here both getters return the same `#subscribe`. | `` /** As {@link subscribe}, for this thing's own changes alone, where a subclass widens `subscribe`. */ `` |
| `models/storable.ts:111` | #reason-goes-above, #one-verb-one-fact | The constructor's doc is a maintainer's note to subclass authors, with two facts joined by a semicolon. | `` /** A concrete class inscribes its own props in `assignInitialProps`; it needs no constructor. */ `` |
| `models/storable.ts:113-118`, `:353` | #use-what-you-parse; STYLE *Variables and functions* (don't write to objects you don't own) | The parse of `{ world, listing, central, opts }` is used only for `opts`. The raw `central` is frozen in place, which freezes the caller's object, and then held. `adopt` freezes its argument the same way. | `this.#central = Object.freeze(central)` |
| `models/storable.ts:124` | #facts-from-the-code; STYLE *Stateful objects and snapshots* | The doc tells subclasses to add their props "never as #fields". STYLE puts every changing value in a `#field`. | `/** SLOPDOC: Inscribes the own props before the seal; a subclass adds its own the same way, never as #fields. */` |
| `models/storable.ts:145`, `models/listing.ts:144`, `:165`, `models/box.ts:151`, `models/box-listing.ts:80` | STYLE *Validation* (a Zod schema is the first choice for defaults); #use-what-you-parse | Defaults are set in the destructure after the parse, not in the checker. **Maybe:** the gallant Gallants write it the same way. | `const { ifAbsent = 'fail', maxWorldMillis } = VX.fetchOpts.parse(opts)` |
| `models/storable.ts:154-156`, `:166`, `:175`, `models/listing.ts:151`, `:172`, `:181`, `models/vault.ts:94`, `:104`, `:114`, `:123`, `:149`, `:158`, `:300`, `:338`, `models/bank.ts:132`, `models/box.ts:95`, `:160`, `:169`, `models/box-listing.ts:84`, `:102`, `models/vault-listing.ts:44`, `models/lease.ts:97`, `:115`, `:122` | STYLE *Naming* (try pair: the `try` half's one line points to the thrower) | None of these try halves has a pointer line. vault.ts:307, 313 and 322 do it right: "Non-throwing form of {@link getBox}". `tryFetch` alone spans three lines. | `tryHydrate(opts: TimelyOpts = {}): Promise<Outcome<this>> { return outcomeOf(() => this.hydrate(opts)) }` |
| `models/storable.ts:158` | #one-verb-one-fact, #name-the-act | Participial absolutes with no finite verb. An act (a refresh) is described as a noun. | `` /** This thing, its world timely and its record fetched unless timely within `opts.maxMillisSinceRefresh`. */ `` |
| `models/storable.ts:244` | #one-verb-one-fact, #purpose-not-machinery | A "so that" clause, then a colon clause on the machinery. | `/** Make the snapshot now, if not yet made, so that each change from here on notifies the subscribers: until then there is none to replace. */` |
| `models/storable.ts:250` | #a-helper-gets-a-phrase | A private helper's doc has a second sentence on the machinery. | `` /** Replace the snapshot with a new one, and notify all listeners. Until `snapshot` is first asked for there is none to replace: that ask makes it. */ `` |
| `models/storable.ts:277` | #no-sibling-comparisons | Opens "As `sweep`". | `` /** As `sweep`, and what this device has cached of it goes too. Storage is untouched. … */ `` |
| `models/storable.ts:308` | #one-verb-one-fact | A semicolon and an "as" clause. | `/** True where the record in hand has every field filled; false for a sparse view, as a listing's query hands back, or for a tombstone. */` |
| `models/storable.ts:338-342` | STYLE *Naming* (verbs table; `make…Props` is field values) | `demandFullProps` hands back the full record. A `demand` throws and gives nothing back, or `this`, and `Props` means field values, not a record. It is the `full` getter (82) plus a throw. | `protected demandFullProps(): RecordT {` |
| `models/storable.ts:350` | #facts-from-the-code, #purpose-not-machinery | "judged against the central held until now": `adopt` judges nothing, because `reconcileCentral` already did. | `` /** Assign the props of `central`, judged against the central held until now, then hold it, frozen; the snapshot waits for `settle`. */ `` |

## listing.ts

| Location | Tag | Comment | Representative line |
|---|---|---|---|
| `models/listing.ts:28` | #three-questions | Names who checks the tag, not what it is for. | `/** The tag a storable's constructor checks for. */` |
| `models/listing.ts:48`, `:53`, `:55`, `:75` | STYLE *Comments and doc blocks* (every export gets a doc block) | `things`, `getSnapshot`, `subscribe` and `lockState` have no doc. | `get things(): readonly ThingT[] { return [...this.#things.values()] }` |
| `models/listing.ts:78`, `models/bank.ts:116` | STYLE *Naming* (an `ensure` that returns nothing is misnamed) | `ensureTimelyWorld` and `Bank.ensureTimely` resolve `void`. **Maybe:** the world interface fixes the bank's name. | `async ensureTimelyWorld(maxMillis?: number): Promise<void> { … }` |
| `models/listing.ts:84`, `:320-324`, `models/box-listing.ts:38-42`, `:87`, `models/vault-listing.ts:53-57` | STYLE *Shapes and duck typing* (a parameter accepts a duck of the shape it reads, typed as an ad hoc `Pick`) | `duck: unknown` on the public `at`, `scopeOf`, `sparseOf`, `recordOf` and `puttable`. The type says nothing of the shape each reads. **Maybe:** each one parses, so `unknown` may be on purpose. | `at(duck: unknown): ThingT \| null {` |
| `models/listing.ts:88` | #three-questions | "as its own discard asks" names the caller. | `` /** Stop holding `thing`, as its own discard asks: the slot empties only for this very instance. */ `` |
| `models/listing.ts:215-216` | #one-test-one-place | Tests `record !== null`, then `record === null` on the next line. | `return (record === null) ? this.#receiveNothing(scope) : this.buildOrReceive(record)` |
| `models/listing.ts:235-237` | STYLE *Build for maintenance* (familiar over cute) | A null `held` is encoded as fate `'replace'`, then decoded back through `?? this.#makeThingOf`. **Maybe:** this is fate code, which is fenced. | `const thing = ((fate === 'replace') ? null : held) ?? this.#makeThingOf(sparse)` |
| `models/listing.ts:259` | STYLE *Tags* (`val` is a truly generic value) | The notice's row is destructured as `val` and then handed on as a row. **Maybe:** `val` is the Notice interface's own field name. | `const { val, world } = notice` |
| `models/listing.ts:276` | STYLE *Naming* (`ii` for the index a callback is handed) | The `every` callback's index is named `idx`. | `next.every((snapshot, idx) => snapshot === this.#snapshot[idx])` |
| `models/listing.ts:291` | #name-the-act, #purpose-not-machinery | `tellIfRevoked` acts, but its doc opens with a noun phrase and narrates the order of hearing. | `/** A refusal of the vaultDB's on its way to a caller: 'identity_revoked' is news to the bank as well, heard before the caller hears it. */` |
| `models/listing.ts:307` | #use-the-helper | `verifyConsistent` over a `scopeOf` result, where a validator's `parseConsistent` does both (box-listing.ts:38 uses it). **Maybe.** | `verifyConsistent(this.scopeOf(record), scope, { kind: 'record_conflict', message: Phrases.RecordOfOtherScope })` |
| `models/listing.ts:316` | #one-verb-one-fact | "being the vault's own", then "as a vault's do". | `` /** The `vault_tok` every record of this listing lies under, being the vault's own; null for a listing whose records make their own, as a vault's do. */ `` |
| `models/listing.ts:321` | STYLE *Naming* (never `data`, `contents` or `payload`) | "payload" stands where VOCABULARY.md names the whisper and the sealed parts. | `` /** The sparse form of `duck`, … as a plain copy with the payload left out. */ `` |
| `models/listing.ts:334` | #reason-goes-above | The second clause is a reason. | `/** True for a row this listing holds: the vaultDB's watch tells of a vault's rows and its boxes' alike. */` |
| `models/listing.ts:341` | #a-helper-gets-a-phrase, #one-verb-one-fact | A private helper gets a paragraph, with "as … whose". | `` /** The record a good answer delivers: its `val`, or the tombstone in `dbhas` where it answers null; null for nothing stored, as a del's `void` is, whose `val` is a sentinel. */ `` |

## vault.ts

| Location | Tag | Comment | Representative line |
|---|---|---|---|
| `models/vault.ts:33`, `models/box.ts:21` | #facts-from-the-code, #purpose-not-machinery | The scope props are tattooed by `assignInitialProps`, not the constructor. The doc says how they got there, not what they are. | `/** The scope, tattooed on by Storable's constructor. */` |
| `models/vault.ts:52`, `:163`, `:360`, `:384`, `:389` | STYLE *Comments and doc blocks* (every export gets a doc block) | `fmt`, `lockState`, `isUnlocked`, `demandPresent` and `ensureAttachable` have no doc. | `get fmt(): number { return this.central.fmt }` |
| `models/vault.ts:54` | #three-questions | Names a user ("what a gate change spreads into its params"). | `/** The full record in hand, what a gate change spreads into its params. */` |
| `models/vault.ts:58` | #one-verb-one-fact, #purpose-not-machinery | A "so" clause about memoization. | `` /** The Gate of the record in hand, the same while the record's `gate` is the same object, so a record received remakes it. */ `` |
| `models/vault.ts:75`, `models/vault-listing.ts:41-42` | STYLE *Naming* (verbs table: `build` stores nothing; "one that creates a vault on every call is `createVault`") | `VaultListing.buildVault` and `Vault.launchBirth` store a new vault through a gating. | `buildVault(scope: VaultScope): Promise<Vault> { return Vault.launchBirth(this, scope) }` |
| `models/vault.ts:106` | #one-verb-one-fact | "nobody asked" is a fragment. It is the register gallant-test_titles.md's `#outcome-not-action` rewrites. | `/** … With none held it answers at once, nobody asked. … */` |
| `models/vault.ts:129` | #facts-from-the-code | "attach a lease" is unconditional, but `#renewLease` returns at once when no lease was held (217). | `/** Run the commit, then attach a lease under the epoch it landed. */` |
| `models/vault.ts:130`, `models/vault-listing.ts:92`, `:98`, `:104`, `:110` | STYLE *Imports* (types imported by name) | `SX.VaultRecord` sits beside the `VaultRecord` imported by name from shapes-vaultish (vault.ts:12, vault-listing.ts:13). That is two spellings, and maybe two types, of one record. | `async #landGate(proved: Proving, commit: () => Promise<SX.VaultRecord>): Promise<this> {` |
| `models/vault.ts:140` | #outcome-not-branches | Walks through the branches ("as it stands, else …, else …"). | `/** This vault timely and unlocked: as it stands, else by the lease cached on this device, else by {@link unlock}. */` |
| `models/vault.ts:200` | #name-the-act, #reason-goes-above | The act (attach a lease) opens as a noun phrase. The second sentence is a reason. | `` /** The lease `proved` earns, attached. A lock landing during the unlock does not hold: the proof says this user may have the vault unlocked. */ `` |
| `models/vault.ts:229`, `models/gating.ts:254`, `:265`, `models/proving.ts:113` | #purpose-not-path (citations) | Gate codes "(G9)", "(G8)", "(G2)" and "(guarantees.md, G3)" sit in doc blocks. vault.ts:229 also gives its reason with "as". | `/** The private verbs a gating's run calls past the enter key, as no public method of a vault takes a proving (G9). */` |
| `models/vault.ts:265` | STYLE *Shapes and duck typing* (no type literal; name the shape) | Uses an ad hoc `VaultScope & { vault_tok: string }`. **Maybe:** no named shape may fit. | `#stampOfLife(): VaultScope & { vault_tok: string } { … }` |
| `models/vault.ts:270`, `:276`, `models/lease.ts:130`, `:146` | #name-the-act, #say-the-guarantee | The seal docs open with a participle phrase, like the `wrappedWith` Goofus. The unseal docs never say that unsealing authenticates. | `` /** `whisperText` sealed under a fresh boxKey under this vault's key, both bound to `stamp`. */ `` |
| `models/vault.ts:272`, `models/lease.ts:132`, `:148`, `models/storable.ts:113`, `models/gate.ts:10`, `models/proving.ts:69`, `:84`, `:127`, `:137` | STYLE *Naming* (a function's whole input is checked by `fooInput`) | `leaseSealArgs`, `storableArgs`, `gateMakeArgs`, `strengthArgs`, `provingLeaseArgs` and `passphraseNovelArgs` are all `*Args`. **Maybe:** STYLE's own *Imports* example says `leaseSealProps`. | `const checked = GX.leaseSealArgs.parse({ whisperText, stamp })` |
| `models/vault.ts:282-284` | #reason-goes-above, #name-the-act, #one-verb-one-fact | The `//` reason sits *between* the doc block and the member, not above the block. The doc opens with a noun phrase and an "so" clause. | `` // `receive` refuses `otherVaultTok` for a row of another life: the one consistency guard on this path. `` |
| `models/vault.ts:302` | #option-values-get-a-list | The option values are told in a sentence, after an "(i.e. …)". | `` /** Hydrate and return the box listed at `boxlabel` (i.e. fetch if stale). A missing box is null for `ifAbsent: 'nil'`, or refused for `ifAbsent: 'fail'`. */ `` |
| `models/vault.ts:310` | #no-sibling-comparisons, #one-verb-one-fact | Defined as a sibling, plus a participial absolute. | `/** {@link getBox}, the box's record fetched whatever its age. */` |
| `models/vault.ts:357-360`, `:163`, `models/box.ts:84` | STYLE *Stateful objects and snapshots* (two ways to read one value is a split personality) | `isLocked`, `isUnlocked`, `lockState()` and `box.lockState()` are four public readings of whether a lease is held. | `get isUnlocked(): boolean { return this.#lease !== null }` |
| `models/vault.ts:163`, `:438` | STYLE *Naming* (`state` names nothing public) | `lockState()` and the snapshot's `lockState` field. **Maybe:** the rule may mean only a bare `state`. | `lockState(): LockState { return this.#lease === null ? 'locked' : 'unlocked' }` |
| `models/vault.ts:391` | #outcome-not-branches | Branches again ("as it stands … otherwise fetched"). | `` /** This vault, refreshed within `maxMillis`, by default its horizon: as it stands where it is recent, otherwise fetched. */ `` |
| `models/vault.ts:397` | #purpose-not-machinery | Narrates the steps, with a participial absolute ("the vault keeping its slot"). | `` /** Take in `central`. A tombstone locks the vault, erases the cached row and vacates the boxes, the vault keeping its slot. `` |
| `models/vault.ts:406`, `:414` | #purpose-not-machinery, #facts-from-the-code | Participial absolutes ("its expiry armed" register). Both leave out `declineGatingAtDiscard`, which the bodies call. | `/** The lease dropped, the row cached left for the next session, and the boxes swept. */` |

## box.ts

| Location | Tag | Comment | Representative line |
|---|---|---|---|
| `models/box.ts:31` | #a-helper-gets-a-phrase | A private field gets a sentence covering four facts. | `/** The whisper the host asked to keep open on the instance, a plain object it may edit: hidden while the vault is locked, kept until … */` |
| `models/box.ts:50`, `:205`, `:210`, `:212` | STYLE *Comments and doc blocks* (every export gets a doc block) | `fmt`, `demandPresent`, `ensureUnsealable` and `ensurePuttable` have no doc. | `get fmt(): number { return this.central.fmt }` |
| `models/box.ts:53-62` | STYLE *Stateful objects and snapshots* (no per-field getter of what changes); STYLE *Shapes* | These are per-field getters of the changing `central`. Lines 60-61 spell out literal types where 59 and 62 index `BoxRecord`. | `get whisper_codec():          'json_v1' \| null                     { return this.full?.whisper_codec ?? null }` |
| `models/box.ts:55` | #point-dont-redefine, #one-verb-one-fact | Redefines the sidecar ("holds nothing secret"), which `Sidecar` already defines. Also a semicolon, then a "so". | `/** The sidecar of the record in hand, which only the full record carries; null otherwise. It holds nothing secret, so it shows whether the vault is locked or not. */` |
| `models/box.ts:83` | #facts-from-the-code, #no-sibling-comparisons | "Whether" for something that returns an enum, then "as `vault.lockState()` is". | `` /** Whether the vault is locked, read live, as `vault.lockState()` is. */ `` |
| `models/box.ts:97` | #one-verb-one-fact | "showing," dangles. | `` /** Open the stored whisper and hold it on the instance, showing, where `box.whisper` offers it until {@link unexpose}. `` |
| `models/box.ts:100`, `:126`, `models/bank.ts:148`, `models/box-listing.ts:48`, `models/vault-listing.ts:76` | STYLE *Naming* (every public method is a try pair) | `expose`, `unveil`, `autolock` and both `list`s have no `try` half. **Maybe:** a ruling may exempt some. | `async expose(opts: TimelyOpts = {}): Promise<this> {` |
| `models/box.ts:138` | STYLE *Naming* (one name for one thing) | `held` names a `safeParse` result here. Everywhere else it is the instance held. | `const held = CX.whisper.safeParse(parseJsonOrNull(whisperText))` |
| `models/box.ts:146` | #one-sentence-headline | Glues "; a deleted box is reborn" onto the Coach's headline. That is a second fact on the first line. | `` /** Seals `patch` over the record in hand and stores it, answering this box; a deleted box is reborn. `` |
| `models/box.ts:195` | #use-what-you-parse | Tests the raw `patch` after `given` was parsed from it on the line above. **Maybe:** a strict `boxPatch` already refuses the field, so the test may be dead. | `if ((ifPresent === 'fail') && ('whisper_ciphered' in patch)) { throw recordForNewBox() }` |
| `models/box.ts:254` | #say-the-guarantee, #one-verb-one-fact | `create` and `put` point here for what "encrypted" and "sealed" mean, yet the doc is participial machinery and carries no guarantee. | `` /** The full record of `base` with `sidecar`, `whisper` sealed through `world`: as json_v1, bound with its key to the box's stamp. … */ `` |
| `models/box.ts:258`, `:263` | #impossible-is-a-crash, #no-fake-values | When the whisper or sidecar will not stringify, `?? ''` seals an empty string and binds it. That is a made-up value where there should be a one-line throw. | `const { box_key_wrapped, whisper_ciphered } = await world.sealStampedString(stableJsonify(whisper) ?? '', stamp)` |
| `models/box.ts:265` | #reason-goes-above | The second clause is a reason. | `` /** `text` parsed as JSON, or null where it is none: a SyntaxError can quote what it failed on. */ `` |

## box-listing.ts and vault-listing.ts

| Location | Tag | Comment | Representative line |
|---|---|---|---|
| `models/box-listing.ts:6`, `:10`, `models/vault-listing.ts:8`, `:11`, `:13`, `models/bank.ts:12`, `models/gate.ts:4`, `models/wayin.ts:5`, `models/lease.ts:8`, `models/proving.ts:12` | STYLE *Imports* (our files reach validators through a namespace) | Validators are imported by name: `boxscope`, `boxDna`, `boxRecord`, `boxSparse`, `vaultScope`, `vaultStamp`, `vaultRecord`, `vaultSparse`, `bankScope`, `gateProps`, `leaseRecord`, `passphraseNovelArgs`, and more. Several files also star-import the same module as `VX` or `GX`. | `import { type Boxscope, boxscope } from '../shapes/shapes-core'` |
| `models/box-listing.ts:30` | #purpose-not-machinery | Says which validator checks which part. | `` /** A box listing in `opts.world`, whose vault's scope and `vault_tok` are held to `boxListingOpts`, the rest to the base's check. */ `` |
| `models/box-listing.ts:50`, `:122` | #use-the-helper | `{ ...scope, vault_tok }` is spelled out twice. It is gallant's `#use-the-helper` Goofus. **Maybe:** no helper is reachable from the box listing. | `const answer = await this.vaultDB.tryListBoxes({ ...this.world.scope, vault_tok: this.world.vault_tok })` |
| `models/box-listing.ts:48-60`, `models/vault-listing.ts:76-86` | #straight-chute, #guard-at-the-entrypoint | Each `list()` handles its own answer: it takes the world, tells of a revocation and throws, which is `deliver`'s job. Doing that skips `deliver`'s `demandEnabled` after the await, "the one check after a store's answer". | `if (answer.world !== null) { this.world.takeWorld(answer.world) }` |
| `models/box-listing.ts:58`, `:65`, `:72` | STYLE *Scopepaths* (lookups go by key, never by scanning) | Finds things by boxlabel by scanning `things` and `#damagedRows`, though `this.at(…)` exists for things. | `for (const { boxlabel } of damaged_rows) { this.things.find((held) => held.boxlabel === boxlabel)?.vacate() }` |
| `models/box-listing.ts:113`, `models/vault-listing.ts:170` | STYLE *Build for maintenance* (constants shared across modules live in `consts.ts`) | Both scopepaths are joined on a literal `'^'`, not `ScopepathDelimiter`. | `return ['box', scope.applabel, scope.user_id, scope.vaultlabel, scope.boxlabel].join('^')` |
| `models/vault-listing.ts:28-30`, `:150` | STYLE *Comments and doc blocks* (every export gets a doc block) | `openGating` and `vacate` have no doc. | `get openGating(): AnyGating \| null { return this.#openGating }` |
| `models/vault-listing.ts:35-37` | STYLE *Validation* (a constructor validates its arguments, in a parse as its first line) | Parses after `super(opts)`. box-listing.ts:32 parses first. The discarded result is in the Planned table. | `VX.vaultListingOpts.parse(opts)` (line 37, after `super(opts)` on 36) |
| `models/vault-listing.ts:62-70` | STYLE *Naming* (`fooOf` is pure) | `stampOfBirth` mints a random tok and reads the clock. `recordOfBirth` reads the clock. | `return vaultStamp.parse({ ...scope, vault_tok: makeLifeTok(), registered_at: nowMillis() })` |
| `models/vault-listing.ts:68-70` | #own-your-form | The listing, a middleman, assembles the vault's record. **Maybe:** the birth may have been ruled to sit here. | `return { ...gate.stamp, fmt: VX.VaultFormat, am: 'a', ...SX.nextRevisionOf(prior, nowMillis()), gate: gate.pickle() }` |
| `models/vault-listing.ts:75` | #purpose-not-machinery, #no-sibling-comparisons | Three sentences of mechanism, one of them "as a fetch's answer would". | `/** Every vault and tombstone the vaultDB holds for this bank, delivered: each meets its slot as a fetch's answer would. … */` |
| `models/vault-listing.ts:109-112` | #no-call-for-side-effects | Discards `deliver`'s answer and returns `valOf` of the raw answer. **Maybe.** | `await this.deliver(answer)` |
| `models/vault-listing.ts:116` | STYLE *Tags* (`ante`/`post` are before and after a step) | `ante` names the vault to delete. **Maybe.** | `override async del(ante: VaultSparse \| Vault): Promise<Vault \| null> {` |
| `models/vault-listing.ts:131-141` | #name-the-act | The docs open on events ("has settled", "hears a lock", "is going away"), not on the acts. | `/** The open gating has settled. */` |
| `models/vault-listing.ts:181` | #reason-goes-above | The doc is a reason for the cast below it. | `` /** The vaultDB refuses `repl` on a vault: a record moves only by a gate verb. */ `` |

## bank.ts

| Location | Tag | Comment | Representative line |
|---|---|---|---|
| `models/bank.ts:19`, `:24`, `models/vault.ts:26` | STYLE *Build for maintenance* (constants shared across modules live in `consts.ts`); every export gets a doc block | `DefaultLeaseMillis` is exported from vault.ts and imported by bank.ts. `DefaultRefreshMillis` has no doc. | `export const DefaultRefreshMillis = 5 * MinuteMillis` |
| `models/bank.ts:27`, `:30-41`, `:61-71`, `:76`, `:106`, `:114-118` | STYLE *Comments and doc blocks* (every export gets a doc block) | The host's main class has no doc. Nor do `Bank.make`, its public fields, its getters, `vaultScopeOf` or its world verbs. | `static make(opts: BankOpts): Bank { return new Bank(opts) }` |
| `models/bank.ts:32`, `:83` | STYLE *Shapes and duck typing* (never a nested `.scope`) | An own enumerable `scope` sits beside the tattooed copy of its fields. | `readonly scope:            BankScope` |
| `models/bank.ts:40`, `:44`, `:212`, `:257`, `models/proving.ts:70`, `:196` | STYLE *Interfaces a host implements* (a host's function is wrapped once, at Bank's constructor) | `onPanic` and `onBadNews` are stored and called bare. `strengthChecker` is wrapped per call by `invokeStrengthChecker`, and the key deriver per call by `deriveKeyBytes`. **Maybe:** some of this may belong to Thread 2 with `bankOpts`. | `readonly onPanic:          ((refusal: VaultError) => unknown) \| undefined` |
| `models/bank.ts:63` | STYLE *Stateful objects and snapshots* (two ways to read one value) | `autolockMinutes` is `leaseMillis` read again in other units. **Maybe.** | `get autolockMinutes(): number { return this.leaseMillis / MinuteMillis }` |
| `models/bank.ts:80-94` | STYLE *Validation* (one input, one validator) | `bankOpts.parse`, then `bankScope.parse` on two of its fields, then `parseLogger(opts.logger)`, with defaults by hand through `millisOf`. The discarded `bankOpts` result is in the Planned table. This row is the cascade. | `this.scope = bankScope.parse({ applabel, user_id })` |
| `models/bank.ts:134` | #lead-with-the-job, #a-helper-gets-a-phrase | Says what a sweep does to `#bringUp`, not what `#bringUp` does. | `` /** A sweep crossing it leaves `listing` disabled, which refuses. */ `` |
| `models/bank.ts:146` | #purpose-not-machinery | The second line explains how leases are found. | `` * A best-effort reminder, not a guarantee: it finds leases only by row, and `Lease.buildFromCache` leaves such a row for it. `` |
| `models/bank.ts:157`, `:163`, `:173` | #name-the-act, #purpose-not-machinery, #one-verb-one-fact | Acts written as participial absolutes. Line 163 runs six facts into one sentence. | `/** Every listed vault vacated, the open gating declined, a birth's too, and every lease of this bank cached on this device erased, the vaultDB untouched. … */` |
| `models/bank.ts:164-167` | #no-bouncing, #use-the-helper | `Bank.vacate` reaches into the listing's `openGating` and `things`, and so does by hand what `VaultListing.vacate` does. | `this.#vaultListing.openGating?.declineAtDiscard()` |
| `models/bank.ts:192-194` | #name-the-act, #three-questions | Opens with a noun phrase, names its caller ("A vacate's"), and gives an "as" reason. | `` /** A vacate's erase of every row of this bank, listed or not, as a fresh page told 'identity_revoked' has listed `` |
| `models/bank.ts:205` | #name-the-act, #no-sibling-comparisons | Opens with a noun phrase for an act, then "as a vault's own panic tells it". | `/** A cached lease that survived its erase, as a vault's own panic tells it, with no vault to vacate. */` |
| `models/bank.ts:240` | #one-verb-one-fact, #three-questions | A participial absolute that names who calls it. | `/** Tell bad news no caller waits on to the host, its every listing and box coming straight here. … */` |
| `models/bank.ts:265` | #reason-goes-above | "Bound, as each listing calls it." is a reason. | `/** Make the snapshot again, and tell every listener where it differs. Bound, as each listing calls it. */` |
| `models/bank.ts:282` | STYLE *Braces and layout* (parallel construction in columns) | The snapshot is crammed onto one line. vault.ts and box.ts align theirs. | `return Object.freeze({ ...this.scope, stage: stageOf(hello), err: hello?.err ?? null, device_id: this.device_id, vaults: … })` |
| `models/bank.ts:292`, `models/proving.ts:117` | #no-call-for-side-effects | `valOf` runs only so that it throws, which is gallant's `bank.hello` Goofus. In proving.ts the result discarded is a CryptoKey, which may be deliberate there. | `valOf(this.#lastHello)` |

## gating.ts

| Location | Tag | Comment | Representative line |
|---|---|---|---|
| `models/gating.ts:21-25`, `:42` | STYLE *Comments and doc blocks* (every export gets a doc block) | The public fields, and `isOpen`, have no doc. | `get isOpen(): boolean { return this.#outcome === null }` |
| `models/gating.ts:34` | #no-fake-values | A placeholder function that the constructor overwrites. **Maybe:** this is the usual deferred-promise idiom. | `#settle:        (outcome: Outcome<Vault>) => void = () => undefined` |
| `models/gating.ts:44` | #reason-goes-above | The "as" clause is a reason. | `/** The outcome once settled, a promise that never rejects: a dialog closes on it, as the package cannot close a host's dialog. */` |
| `models/gating.ts:47-50` | STYLE *Validation* (never a hand-pick where a schema exists) | Rebuilds the scope by hand from `this`. **Maybe.** | `return { applabel, user_id, vaultlabel }` |
| `models/gating.ts:60`, `models/proving.ts:54` | STYLE *Validation* (a constructor validates its arguments, in a parse as its first line, even when `make` parsed them) | The private and protected constructors do not parse. lease.ts:44 does. | `private constructor(gatingkind: KindT, launchArgs: LaunchArgs<KindT>) {` |
| `models/gating.ts:75-77` | #use-what-you-parse; STYLE *Validation* (one input, one validator) | Parses three of the args (`gatingkind`, `scope`, `friend`). `listing`, `vault` and `prior` pass unchecked in the spread. **Maybe.** | `const { scope } = GX.gatingLaunchArgs.parse({ gatingkind, scope: args.scope, friend: args.friend })` |
| `models/gating.ts:96`, `models/proving.ts:67-68` | STYLE *Naming* (`checkFoo` refuses and returns nothing; STYLE cites `checkStrength(passphrase)` as such a check) | Both `checkStrength`s return a verdict. | `async checkStrength(passphraseClear: string): Promise<GX.PassphraseVerdict> {` |
| `models/gating.ts:101` | STYLE *Naming* (try pair) | Resolves an `Outcome` with no `try` in its name. **Maybe:** it may be ruled as the gating's one door. | `attempt(clears: ClearsForGatingkind[GatingKind]): Promise<Outcome<Vault>> {` |
| `models/gating.ts:132-141` | #name-the-act, #outcome-not-branches, #no-sibling-comparisons | Opens on events ("The user said no.", "A lock on the vault…"), walks the branches, and ends "as {@link declineAtLock} has it". | `/** What it asks of is going away, whatever its kind: it settles as {@link declineAtLock} has it. */` |
| `models/gating.ts:182`, `:188` | STYLE *Validation* (inside the package, don't re-check what was checked where it entered) | Re-parses what `Wayin` parsed in its constructor. **Maybe:** the parse may be there to narrow the union. | `const passphrase_wayin = GX.passphraseWayinRecord.parse(nextWayin.pickle())` |
| `models/gating.ts:249`, `:255` | STYLE *Shapes and duck typing* (never a type literal written out for a parameter) | `{ passphraseClear: GX.PassphraseCleartext }` and `{ parse: (clears: unknown) => ClearsT }`. | `const provePassphrase = async (vault: Vault, { passphraseClear }: { passphraseClear: GX.PassphraseCleartext }, world: VaultWorld) …` |
| `models/gating.ts:265` | #one-verb-one-fact | A long run of qualifiers, ending in an "as" clause and a citation. | `` /** Zero a passkey answer's PRF bytes wherever `clears` carries them, checked or not and of any realm, a bare ArrayBuffer too, as WebAuthn hands one: … (G2). */ `` |

## gate.ts, wayin.ts, lease.ts, proving.ts

| Location | Tag | Comment | Representative line |
|---|---|---|---|
| `models/gate.ts:7`, `models/proving.ts:28` | #reason-goes-above | The doc block holds only a reason. | `/** Stays here: it names the class. */` |
| `models/gate.ts:9`, `models/proving.ts:30`, `models/lease.ts:211` | STYLE *What a refusal says* (every sentence a check says lives in `phrases.ts`) | Messages are inline literals. lease.ts:211 is a log line, and bank.ts:102 draws its warning from `Phrases`. | `const wayin = custom<Wayin>((val) => val instanceof Wayin, 'Expected a Wayin')` |
| `models/gate.ts:17-22`, `:46`, `:51`, `models/wayin.ts:9`, `:14`, `:20`, `:23-30`, `:48`, `:50`, `models/lease.ts:14-22`, `models/proving.ts:38-39`, `:122`, `:148` | STYLE *Comments and doc blocks* (every export gets a doc block) | `Wayin`, `PassphraseProving`, `PasskeyProving`, `PurposeForWayinkind`, `wayinCtxOf`, `pickle`, `toJSON` and the declared fields have no doc. | `export class Wayin {` |
| `models/wayin.ts:14` | #say-the-guarantee, #customer-first | `wayinCtxOf` builds what a wrap is bound to, and carries no doc at all. The `wayinCtx` pair in gallant-docblocks.md is the model. | `export const wayinCtxOf = (stamp: VaultStamp, header: WayinHeader): Uint8Array => {` |
| `models/gate.ts:20-21` | STYLE *Naming* (specificity; VOCABULARY names); STYLE *Stateful objects and snapshots* | `ppWayin` and `pkWayin` are abbreviations. Each wayin is held twice, once as a record and once as an instance. | `declare readonly ppWayin:          Wayin` |
| `models/gate.ts:46`, `models/wayin.ts:48` | #its-name-is-its-doc | `pickle()` hands out a frozen plain record. STYLE hands out a frozen copy through a getter (`vault.stamp`), and the old tree's Gallant is `get record(): GateRecord`. **Maybe.** | `pickle(): GateProps {` |
| `models/gate.ts:51`, `models/proving.ts:48` | STYLE *Shapes and duck typing* (name each shape; no type literal) | The `toJSON` return types are written out as literals. | `toJSON(): { gate_epoch: number, passphrase_wayin: WayinHeader, passkey_wayin: WayinHeader \| null } {` |
| `models/gate.ts:58` | #three-questions, #one-verb-one-fact | Says where the check sits among the calls, and uses "one" as a stand-in. | `/** Demands that this gate hold no passkey: the one check before anyone is asked for one. */` |
| `models/wayin.ts:4` | STYLE *Imports* (a shapes module's types are imported by name) | A type-only star import under `CX`, the name of the validators' namespace. | `import type * as CX from '../shapes/shapes-core'` |
| `models/lease.ts:36` | STYLE *Validation* (assess once; don't re-check inside the package) | The getter re-parses `this` on every read: in `toJSON`, and in every `#vaultKey`. | `get #leaseStamp(): LeaseStamp { return leaseStamp.parse(this) }` |
| `models/lease.ts:52-55` | #outcome-not-branches, #purpose-not-machinery | Three lines walk each row case and the state each one leaves. | `` /** The lease cached for `gate_epoch`, or null so the vault asks for a proof. A row of another epoch or stamp is uncached; `` |
| `models/lease.ts:84`, `:179` | #one-test-one-place, #say-the-guarantee | The lease ctx is built inline twice. There is no `leaseCtxOf` to carry the guarantee gallant-docblocks.md writes for it. **Maybe.** | `cipherCtx([held, granted], 'vault_key_lease_wrapped')` |
| `models/lease.ts:99-100` | STYLE *Build for maintenance* (familiar over cute) | `cacheAsCacheCan` is a cute name, and its doc repeats `cache`'s second sentence. **Maybe.** | `async cacheAsCacheCan(): Promise<void> {` |
| `models/lease.ts:159` | STYLE *Naming* (a name for what it returns has no side effects; one that acts is named for the act) | `#opened` unwraps and decrypts under a participle name. **Maybe.** | `async #opened(vaultKey: CryptoKey, sealed: SealedWhisper, stamp: CipherCtxRecord): Promise<Uint8Array> {` |
| `models/lease.ts:192`, `:205` | #no-sibling-comparisons; STYLE *Naming* (one name for one thing) | `Lease.isPresent` means "in force". `Storable.isPresent` means "not a tombstone". The docs explain by "as `Storable.isPresent` says" and "as `bank.autolock` judges it". | `` /** The lease still holds its record, as `Storable.isPresent` says of a thing not gone. */ `` |
| `models/proving.ts:73` | #name-the-act | Opens with a noun phrase and a participle for an act that wraps the vaultKey. | `` /** The wayin this proving holds, made under a vaultKey new (`NOVEL`) or held by the `source` proving of the same vault. … */ `` |
| `models/proving.ts:77`, `:225`, `models/lease.ts:70` | STYLE *Braces and layout* (parenthesize and space every negation) | A `! foo` inside a compound condition has no parentheses of its own. | `if ((checked !== NOVEL) && ! consistent(checked.stamp, this.stamp)) { throw provingOfOtherVault() }` |
| `models/proving.ts:131`, `:223` | STYLE *Naming* (`fooOf` is pure) | `passphraseKeyOf` calls the host's key deriver. **Maybe.** | `const passphraseKeyOf = async (keyDeriver: ProvingWorld['keyDeriver'], passphrase: …, saltBytes: Uint8Array): Promise<CryptoKey> => {` |
| `models/proving.ts:176`, `:184` | STYLE *Naming* (the verbs table) | `mint…Header` uses a verb outside the table, where `make…` would do. **Maybe.** | `const mintPassphraseHeader = ({ keyDeriver, device_id }: ProvingWorld): PassphraseWayinHeader => …` |

## Planned in gallant.md, or the documentarian run's (left out above)

| Location | Tag | Comment | Representative line |
|---|---|---|---|
| `models/storable.ts:124`, `:131`, `:143`, `:180`, `:200`, `:238`; `models/listing.ts:19`, `:142`, `:174`, `:194`, `:247`, `:257`; `models/vault.ts:29`, `:74`, `:87`, `:116`, `:174`; `models/vault-listing.ts:41`, `:115`; `models/bank.ts:123`, `:227`; `models/gating.ts:73`, `:100`; `models/proving.ts:82` | #purpose-not-path | 25 `SLOPDOC:` markers, which are progress notes inside doc blocks. Documentarian run. | `/** SLOPDOC: The pipeline every storage answer takes, … */` |
| `models/listing.ts:60-65`, `models/box-listing.ts:32`, `models/vault-listing.ts:37`, `models/bank.ts:80-81` | #use-what-you-parse | The parse result is discarded and the raw opts are read. Thread 2. | `VX.listingOpts.parse(opts)` |
| `models/bank.ts:126-129` | #no-call-for-side-effects | `valOf(hello)` runs only to throw. Thread 2. | `valOf(hello)` |
| `models/listing.ts:174-189` | #own-your-form | The listing builds the tombstone and swaps the caller's revision for the one it holds. Thread 3. | `const held = (duck.am === 'd') ? null : this.at(scope)` |
| `models/vault.ts:327-336` | #sugar-holds-no-logic | `delBox` has its own branch, guards and sentinel. Thread 3. | `return boxes.del(SX.sentinelBoxOf(scope, this.vault_tok))` |
| `models/listing.ts:221`, `:232` | #guard-at-the-entrypoint | `#receiveNothing` and `buildOrReceive` still carry a demand. Thread 4. | `this.demandEnabled()` |
| `models/storable.ts:181-188`, `:239-242`, `models/listing.ts:224`, `:238` | #no-wrapper-without-a-job | `Settled.badnews` is always empty and still read. Thread 4. | `return { badnews: [] }` |
| `models/box.ts:89` | #say-the-guarantee | Never says that extracting authenticates. Documentarian run. | `/** The timely stored whisper, keeping nothing on the instance. */` |
| `models/box.ts:133` | #a-helper-gets-a-phrase | The Goofus, minus its last clause. Documentarian run. | `` /** The whisper of `record`, opened through the vault's seal verbs and held to `CX.whisper`. */ `` |
| `models/bank.ts:221` | #say-what-to-do | Still reads as the Goofus. Documentarian run. | `` /** The vault listed for `scope`, a tombstone among them, or null. */ `` |

## Considered, not flagged

* The listener, `subscribe` and `getSnapshot` machinery is written three times, almost word for word: storable.ts:57-68
  and 250-263, listing.ts:32-43 and 274-286, bank.ts:45-56 and 266-278. No helper exists in `helpers/`, and *Don't DRY short
  bodies* pulls against making one. A Coach's call, not a goofus.
* The same-bodied `ensure*` and `demand*` pairs (`ensureDeletable`, `ensurePuttable`, `ensureUnsealable`,
  `demandAttachable`) stand by the Coach's decision.
* `am: 'd'` and `fmt` are VOCABULARY.md's names.
* `Storable.fetch`'s own `ifAbsent` test is a "Not this fault" in gallant.md.
* `box.put`'s second `demandPuttable` after `#edit` matches gallant.md's Gallant.
