# Doc blocks needed

## models/bank.ts

```ts
readonly #makeListing: () => VaultListing
```

```ts
readonly #getSnapshot = (): BankSnapshot =>
```

```ts
readonly #subscribe = (listener: () => void): (() => void) =>
```

```ts
/** The first `device_id` cached for this bank on this device, once a `hello` has cached it. */
get device_id(): string
```

```ts
get vaultListing(): VaultListing
```

```ts
get autolockMinutes(): number
```

```ts
get snapshot(): BankSnapshot
```

```ts
get getSnapshot(): () => BankSnapshot
```

```ts
get subscribe(): (listener: () => void) => (() => void)
```

```ts
toJSON(): BankSnapshot
```

```ts
static make(opts: BankOpts): Bank
```

```ts
constructor(opts: BankOpts)
```

```ts
vaultScopeOf(bag: VaultBag): VaultScope
```

```ts
lockState(): LockState
```

```ts
ensureTimely(): Promise<void>
```

```ts
takeWorld(): void
```

```ts
tryHello(): Promise<Outcome<void>>
```

```ts
/** A sweep crossing it leaves `listing` disabled, which refuses. */
async #bringUp(listing: VaultListing): Promise<void>
```

```ts
/** The first `device_id` cached for this scope wins, and is the bank's. A damaged record written over is bad news. */
async #cacheDeviceRecord(): Promise<void>
```

```ts
/** Lock each listed vault with a cached lease past autolock, erasing it. Call it after `hello` and on your own timer.
 * A best-effort reminder, not a guarantee: it finds leases only by row, and `Lease.buildFromCache` leaves such a row for it.
 */
async autolock(): Promise<void>
```

```ts
/** Every listed vault locked; the bank stays ready. Never throws. */
lock(): this
```

```ts
/** Every listed vault vacated, the open gating declined, a birth's too, and every lease of this bank cached on this device erased, the vaultDB untouched. Not ready until the next `hello`, which lists them afresh. Never throws. */
vacate(): this
```

```ts
/** Cleanup while the page lives: the watch ended and each vault swept, its cached lease left for the next session. Not ready until the next `hello`, which starts a fresh listing. Never throws. */
sweep(): this
```

```ts
/** This bank's rows among the cached leases proved before `cutoff`; a refused scan is bad news, and finds none. */
async #scanOwnLeasesProvedBefore(cutoff: number): Promise<LeaseSparse[]>
```

```ts
/** A vacate's erase of every row of this bank, listed or not, as a fresh page told 'identity_revoked' has listed
 * none.
 */
async #eraseOwnLeases(): Promise<void>
```

```ts
async #eraseLease(row: LeaseSparse): Promise<void>
```

```ts
/** A cached lease that survived its erase, as a vault's own panic tells it, with no vault to vacate. */
async #panic(refusal: VaultError): Promise<void>
```

```ts
tryEnsureVault(bag: VaultBag): Promise<Outcome<Vault>>
```

```ts
/** Tell bad news no caller waits on to the host, its every listing and box coming straight here. A handler's failure reaches only the platform. */
tellBadNews(badnews: readonly VaultError[]): void
```

```ts
/** Every news goes to the host's `onBadNews`, else the logger; 'identity_revoked' vacates the bank first. */
#hearBadNews(news: VaultError): unknown
```

```ts
/** Make the snapshot again, and tell every listener where it differs. Bound, as each listing calls it. */
readonly #remakeSnapshot = (): void =>
```

```ts
#makeSnapshot(): BankSnapshot
```

```ts
#isOwnLease({ applabel, user_id }: LeaseSparse): boolean
```

```ts
#demandReady(): void
```

## models/box-listing.ts

```ts
/** The rows of this vault found damaged, set aside until `del` names one. */
get damaged_records(): readonly DamagedBox[]
```

```ts
/** A box listing in `opts.world`, whose vault's scope and `vault_tok` are held to `boxListingOpts`, the rest to the base's check. */
constructor(opts: BoxListingOpts)
```

```ts
/** The scope of `duck`, held to this vault: no listing answers for another's. */
scopeOf(duck: unknown):  Boxscope
```

```ts
sparseOf(duck: unknown): BoxSparse
```

```ts
recordOf(duck: unknown): BoxRecord
```

```ts
/** Start the watch and take what the vault's get listed, if given: its boxes held sparse, its damaged rows set aside. */
override async hello(listed?: BoxesListed): Promise<void>
```

```ts
/** The entry of {@link damaged_records} under `scope`, or null. */
damagedAt(scope: Boxscope): DamagedBox | null
```

```ts
/** Delete the box `duck` names, and stop setting its row aside as damaged. */
override async del(duck: BoxSparse | Box): Promise<Box | null>
```

```ts
/** The box under `scoped`, no older than `opts` allows, or null under `ifAbsent: 'nil'`. */
async get(scoped: Boxscope, opts: FetchOpts = {}): Promise<Box | null>
```

```ts
tryGet(scoped: Boxscope, opts: FetchOpts = {}): Promise<Outcome<Box | null>>
```

```ts
/** The box a put of `scoped` goes through: the one held, or a void one made for an empty slot. */
puttable(scoped: unknown, opts: BoxPutOpts = {}): Box
```

```ts
tryCreate(input: BoxDna, opts: BoxCreateOpts = {}): Promise<Outcome<Box>>
```

```ts
/** A void box held under `scope`. */
#shellFor(scope: Boxscope): Box
```

```ts
protected vaultTokOfWorld(): string
```

```ts
protected scopepathOf(scope: Boxscope): string
```

```ts
protected makeThing(central: Fetched<BoxRecord, BoxSparse>): Box
```

```ts
protected nothingStoredError(scope: Boxscope): VaultError
```

```ts
protected tryGetRow(scope: Boxscope)
```

```ts
protected tryPutRow(record: BoxRecord, opts: PutOpts)
```

```ts
protected tryDelRow(tombstone: DelTombstone<BoxSparse>, opts: DelOpts)
```

```ts
protected watchRows(onNotice: (notice: Notice) => void): () => void
```

```ts
/** A box row of this life of the vault: one under another `vault_tok` is no row. */
protected isOwnRow(row: VaultRow | BoxRow): row is BoxRow
```

## models/box.ts

```ts
get fmt(): number
```

```ts
/** The life of the box under its boxlabel, as the record in hand has it: minted at its birth, and kept by every later revision of that life. */
get box_tok(): string
```

```ts
/** The sidecar of the record in hand, which only the full record carries; null otherwise. It holds nothing secret, so it shows whether the vault is locked or not. */
get sidecar(): Sidecar | null
```

```ts
/** The sealed parts of the record in hand; null where it is not full. */
get box_key_wrapped():        BoxRecord['box_key_wrapped'] | null
```

```ts
get whisper_codec():          'json_v1' | null
```

```ts
get whisper_schema_version(): 1 | null
```

```ts
get whisper_ciphered():       BoxRecord['whisper_ciphered'] | null
```

```ts
tryExtractWhisper(opts: TimelyOpts = {}): Promise<Outcome<WhisperHolder>>
```

```ts
tryPut(patch: BoxPatch, opts: BoxPutOpts = {}): Promise<Outcome<Box>>
```

```ts
/** The next record `patch` makes, sealed and not stored, and the revision it goes over. */
async #edit({ whisper, sidecar }: BoxPatchGiven): Promise<{ record: BoxRecord, prior: SX.Revision }>
```

```ts
/** The whisper a patch left out, opened from the record in hand. */
#keptWhisper(): Promise<WhisperHolder>
```

```ts
/** The parsed `patch`, refused unless a put of it under `opts` may go ahead now. */
demandPuttable(patch: BoxPatch, { ifPresent }: BoxPutOpts = {}): BoxPatchGiven
```

```ts
/** Holding a whisper on the instance needs the box enabled and the vault unlocked. */
demandExposable(): this
```

```ts
demandPresent(): this
```

```ts
ensureUnsealable(opts: TimelyOpts = {}): Promise<this>
```

```ts
ensurePuttable(opts: TimelyOpts = {}): Promise<this>
```

```ts
protected override sweepContents(): void
```

```ts
protected override vacateContents(): void
```

```ts
/** A box record alive that carries its sealed whisper. */
protected isFullRecord(fetched: BoxSparse): fetched is BoxRecord
```

```ts
/** A box's life is its vault's and its own: `vault_tok-box_tok`. */
protected lifeTokPathOf({ vault_tok, box_tok }: Fetched<BoxRecord, BoxSparse>): string
```

```ts
protected makeSnapshot(): BoxSnapshot
```
