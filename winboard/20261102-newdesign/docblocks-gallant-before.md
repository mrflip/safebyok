
## models/bank.ts

```ts
/** A forced reset a host may repeat: lists what the vaultDB holds, tidies old leases, and starts the watch.
 * Refused, the bank is not ready; one a sweep crossed refuses only its own caller. */
async hello(): Promise<void>
```

```ts
/** Get-ready tasks: load packages, hydrate the vault listing, start watches */
async hello(): Promise<void>
```


```ts
/** The vault listed for `bag`, a tombstone among them, or null. Refuses before ready. */
vaultOf(bag: VaultBag): Vault | null
```

```ts
/** Vault **or tombstone** listed at `scope`, null if absent.
 * Precede with await bank.vaults.hydrate() to make timely or .refresh() to force a refresh
 */
vaultAt(scope: VaultScope): Vault | null
```

```ts
/** The vault listed for `bag`, nobody asked, locked unless the host unlocks it; else one built by asking the user through a build_vault gating, or another's that won the slot, locked. Refuses before ready, and 'already_asking' while a gating is open. */
async ensureVault(bag: VaultBag): Promise<Vault>
```

```ts
/** Fetch the scoped vault, creating it if absent (tombstoned or void) */
async ensureVault(bag: VaultBag): Promise<Vault>
```


## models/box-listing.ts

```ts
/** The vault, as far as its boxes need it: a {@link ListingWorld}, the vault's scope and token, and its seal verbs, which refuse 'vault_locked' while the vault is locked. */
export type BoxWorld
```

```ts
/** The dna of a box, with the whisper, as its {@link WhisperHolder} `{ val }`, and the sidecar `create` seals, both required: what a caller hands `create`, which holds it to {@link boxDna}. It carries no sealed parts, which only the seal makes. */
export type BoxDna
```

```ts
/** A box listing in `opts.world`, whose vault's scope and `vault_tok` are held to `boxListingOpts`, the rest to the base's check; each refuses 'bad_option'. */
constructor(opts: BoxListingOpts)
```

```ts
/** Seal the box of `input`, under a `box_tok` fresh from {@link makeLifeTok}, and store it over no record; resolves the instance held once it lands. Refuses 'bad_option', naming the field, a dna that fails {@link boxDna}; 'vault_locked' while the vault is locked, the seal's end included; 'bad_option' a scope already held; and 'stale_write' where storage holds a record, delivered first, or what `opts.ifPresent` says of a live one. */
async create(input: BoxDna, opts: PutListingOpts = {}): Promise<Box>
```

```ts
/** Create a new box for whisper (encrypted) and sidecar (readable), sealed against the box metadata
 * @see {@link seal} for what "encrypted" and "sealed" imply
 * - `ifPresent:fail` (default): replace a void/tombstoned box, else fail
 * - `ifPresent:repl` replaces (if in correct sequence);
 * - `ifPresent:get`  returns an existing value (as `ensure` does)
 */
async create(input: BoxDna, opts: PutListingOpts = {}): Promise<Box>
```


```ts
/** Refuse 'vault_locked' while the vault is locked, as a box's `demandUnlocked` does. */
#demandUnlocked(): void
```

```ts
/** refuse if 'vault_locked', else no-op */
#demandUnlocked(): void
```


## models/box.ts

```ts
/** Throws unless unlocked with a full, healthy record: refuses 'vault_locked', 'absent_box' for a box gone, or 'bad_option' for a sparse record not yet filled, which `ensureReadyToUnsealWhisper` fetches first. */
demandReadyToUnsealWhisper(): this
```

```ts
/** throw unless {@link isUnlocked}, {@link isEnabled} */
demandReadyToUnsealWhisper(): this
```

```ts
/** The exposed whisper: `{ val }`, while unlocked, {@link LOCKED} while the vault is locked. (NOTE: @see {@link expose} for why this is a bad idea blah blah) `null` if never exposed.
 * Locking does **not** remove the whisper.
 * Nothing is saved or sealed until you {@link put} the box
 * unsealing the whisper returns the value certified by the database, ignoring this value; {@link expose} will replace it, integrating no changes.
 * Use {@link veil} to discard the whisper and any changes made.
 */
get whisper(): WhisperHolder | LockedBag | null
```


```ts
/** Extract `box.whisper`, durably attaching its value to the object, readable by any script in browser scope while unlocked
 * This, obviously, greatly reduces the security promises of this library
 * @see {@link whisper}
 * Use {@link veil} to discard the whisper and any changes made.
 */
async expose(opts: TimelyOpts = {}): Promise<this>
```

```ts
/** The timely stored whisper, as its frozen {@link WhisperHolder} `{ val }`, keeping nothing on the instance. Refuses as `demandReadyToUnsealWhisper` does. */
async extractWhisper(opts: TimelyOpts = {}): Promise<WhisperHolder>
```
```ts
/** The timely stored whisper object. Extracting the whisper authenticates that (apart from sidecar) the object has not been modified since it was {@link seal}ed */
async extractWhisper(opts: TimelyOpts = {}): Promise<Whisper>
```

```ts
/** The whisper of `record`, opened through the vault's seal verbs and held to {@link whisperHolder}; one that opens to anything else refuses 'damaged_box'. */
async #unseal(record: BoxRecord): Promise<WhisperHolder>
```
```ts
/** The whisper of `record` */
async #unseal(record: BoxRecord): Promise<WhisperHolder>
```

```ts
/** Seal `patch` over the record in hand and put it over that record's revision, resolving once storage's answer is received; a snapshot shows the change only then. A half the patch leaves out is kept: the sidecar is read off the record, and the whisper unsealed and resealed, as the stamp binds the sidecar. Refuses 'bad_option', naming the field, `opts` or a patch that fails {@link MSX.boxPatch}, before any guard; 'vault_locked', at the seal's end too, storing nothing; and 'stale_write' where the record moved, the record stored delivered first. On a box gone, this is its rebirth, its sidecar `{}` where left out, and a whisper left out refuses 'no_whisper'. A refusal leaves nothing behind.
 * Over a live record, storage decides by {@link MSX.ifPresentVals}; under `get`, the put resolves with the box holding what storage holds, `patch` discarded.
 */
async put(patch: BoxPatch, opts: SendOpts = {}): Promise<this>
```

```ts
/** Create or update the whisper and sidecar, encrypting whisper and sealing the box metadata
 * See {@link seal} for what "encrypting ... and sealing" mean
 * - `ifPresent:fail` (default): replace a void/tombstoned box, else fail
 * - `ifPresent:repl` replaces (if in correct sequence);
 * - `ifPresent:get`  returns an existing value (as `ensure` does)

 */
async put(patch: BoxPatch, opts: SendOpts = {}): Promise<this>
```