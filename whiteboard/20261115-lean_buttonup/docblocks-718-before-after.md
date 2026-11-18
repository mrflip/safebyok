# #718 doc blocks, before and after

Every doc-block hunk of the documentarian's pass on `minding/` in PR #718 (commit `adbb48d3d`). "Before" is what the thing_car workers wrote; "After" is the new text. Each hunk shows two lines of context.

This time the brief listed the reviewer's findings and the facts to keep true, and dictated no wording.

### `packages/safebyok/src/minding/shapes-minder.ts`

Before:

```ts
/** The TanStack Query options a host may choose for the cars a minder caches. */
export interface QueryCacheOpts {
  /** How long a full car stays timely, in milliseconds. A `behind` or `bare` car is never timely. */
  staleTime: number
  /** How long a car stays in the cache once no TanStack observer uses it, in milliseconds. `Infinity` keeps it until `goodbye`. */
```

After:

```ts
/** The TanStack Query options a host may choose for the cars a minder caches. */
export interface QueryCacheOpts {
  /** How long a car stays timely, in milliseconds. A `behind` or `bare` car is never timely. */
  staleTime: number
  /** How long a car stays in the cache once no TanStack observer uses it, in milliseconds. `Infinity` keeps it until `goodbye`. */
```

### `packages/safebyok/src/minding/shapes-minder.ts`

Before:

```ts
}

/** The default {@link QueryCacheOpts}: a full car stays timely an hour, and every car stays until `goodbye`. */
export const DefaultQueryCacheOpts: Readonly<QueryCacheOpts> = Object.freeze({ staleTime: 60 * 60 * 1000, gcTime: Infinity })

// Under TanStack's own networkMode, 'online', a get made while the browser reports itself offline waits, and so does its
// caller. A retry would put a whizbang in the critical path of a primitive operation (CLAUDE.md).
/** The TanStack Query options every minder sets, which no host can change: a get asks the vaultDB even offline, and is never retried. */
export const FixedQueryCacheOpts = Object.freeze({ networkMode: 'always', retry: false } as const)
```

After:

```ts
}

/** The default {@link QueryCacheOpts}: a car stays timely for an hour, and cached until `goodbye`. */
export const DefaultQueryCacheOpts: Readonly<QueryCacheOpts> = Object.freeze({ staleTime: 60 * 60 * 1000, gcTime: Infinity })

// Under TanStack's own networkMode, 'online', a get made while the browser reports itself offline waits, and so does its
// caller. A retry would put a whizbang in the critical path of a primitive operation (CLAUDE.md).
/** The TanStack Query options every minder sets, and no host can change: a get asks the vaultDB even offline, and is never retried. */
export const FixedQueryCacheOpts = Object.freeze({ networkMode: 'always', retry: false } as const)
```

### `packages/safebyok/src/minding/shapes-minder.ts`

Before:

```ts
// == [Checks]: queryCacheOpts, minderFriend, tsqClient, minderListener, minderScope, minderTrack, minderAskOpts, minderGetAskOpts

/** The checks of a {@link QueryCacheOpts}, of the parts of `ThingMinder.make`'s arguments that name no minder, of a listener, of a scope, of an ask's track, and of a read's options. */
export const { queryCacheOpts, minderFriend, tsqClient, minderListener, minderScope, minderTrack, minderAskOpts, minderGetAskOpts } = Validator.Checkers('bad_option', ({ obj, oneof, custom, fn, uint, lit, union, orDefault }) => {
  const gcTime           = union([uint.max(MaxGcTime, Phrases.GcTimeShape), lit(Infinity)])
```

After:

```ts
// == [Checks]: queryCacheOpts, minderFriend, tsqClient, minderListener, minderScope, minderTrack, minderAskOpts, minderGetAskOpts

/** The checks of a ThingMinder's arguments and options. */
export const { queryCacheOpts, minderFriend, tsqClient, minderListener, minderScope, minderTrack, minderAskOpts, minderGetAskOpts } = Validator.Checkers('bad_option', ({ obj, oneof, custom, fn, uint, lit, union, orDefault }) => {
  const gcTime           = union([uint.max(MaxGcTime, Phrases.GcTimeShape), lit(Infinity)])
```

### `packages/safebyok/src/minding/shapes-minder.ts`

Before:

```ts
})

/** A minder's get ask: the bank's get ask, `track` and `ifAbsent: 'nil'` included, which the minder sends to the vaultDB exactly as given. */
export type MinderGetAsk     = GetAsk & Readonly<{ ifAbsent: 'nil', track: Track }>
/** A get's options: `staleTime` overrides the minder's own. */
export type MinderGetAskOpts = Z.input<typeof minderGetAskOpts>
/** `tryAt`'s options:
 * - `staleTime`          -- overrides the minder's own
 * - `ifStale: 'get'`     -- read the cache alone (default)
 * - `ifStale: 'refresh'` -- also fetch a stale or vacant record in the background
 */
export type MinderAskOpts    = Z.input<typeof minderAskOpts>
/** Internal. What a minder reads of its bank: its scope, its get and list asks, and where trouble with no caller goes. */
export type MinderFriend     = Pick<Bank, 'scope' | 'makeGetAsk' | 'makeListAsk' | 'tellBadNews'>
/** The user, bank and modelkind a minder is tied to: every ask it takes must match them. */
```

After:

```ts
})

/** A get ask with `ifAbsent: 'nil'` and a `track`, which the minder sends to the vaultDB exactly as given. */
export type MinderGetAsk     = GetAsk & Readonly<{ ifAbsent: 'nil', track: Track }>
/** A get's options: `staleTime` overrides the minder's own. */
export type MinderGetAskOpts = Z.input<typeof minderGetAskOpts>
/** `tryAt`'s options:
 * * `staleTime`          -- overrides the minder's own
 * * `ifStale: 'get'`     -- read the cache alone (default)
 * * `ifStale: 'refresh'` -- also fetch a stale or missing car in the background
 */
export type MinderAskOpts    = Z.input<typeof minderAskOpts>
/** The parts of a {@link Bank} a minder uses: its scope, its ask builders, and where trouble no caller waits on goes. */
export type MinderFriend     = Pick<Bank, 'scope' | 'makeGetAsk' | 'makeListAsk' | 'tellBadNews'>
/** The user, bank and modelkind a minder is tied to: every ask it takes must match them. */
```

### `packages/safebyok/src/minding/thing-car.ts`

Before:

```ts

// The vaultDB holds a newer whole record when liveness is 'behind' or 'bare' (isVaultDBNewer).
/** Cache value for a ThingRecord: the newest revision heard of (which might be sparse), and the fullest record seen.
 * `fullest` is null when gone or void, and undefined when bare.
 */
```

After:

```ts

// The vaultDB holds a newer whole record when liveness is 'behind' or 'bare' (isVaultDBNewer).
/** A ThingMinder's frozen cache value for one scope: the newest revision heard of, perhaps sparse, and the fullest record seen.
 * `fullest` is null when gone or void, and undefined when bare.
 */
```

### `packages/safebyok/src/minding/thing-car.ts`

Before:

```ts
export type GateCar = ThingCar<GateThing>

/** A record on its way into a car: a Thing, whole or sparse, or the void sentinel for a scope where storage holds nothing. */
export type DeliverableThing = Thing | Sparse<Thing> | VoidSentinel
```

After:

```ts
export type GateCar = ThingCar<GateThing>

/** A record a car is made from: a Thing, whole or sparse, or the void sentinel. */
export type DeliverableThing = Thing | Sparse<Thing> | VoidSentinel
```

### `packages/safebyok/src/minding/thing-car.ts`

Before:

```ts
// == [Making and merging]: carOf, mergedCarOf, isThingCar, isVaultDBNewer, isWholeRecord, cmpRecords

/** The car of `record` alone: `full` for a whole live record, `bare` for a sparse one, `gone` for a tombstone and `void` for the void sentinel. */
export function carOf(record: DeliverableThing): ThingCar<Thing> {
  ArgChecks.deliverableThing.parse(record)
```

After:

```ts
// == [Making and merging]: carOf, mergedCarOf, isThingCar, isVaultDBNewer, isWholeRecord, cmpRecords

/** The car of `record` alone. A tombstone's car is `gone`, even when the tombstone is sparse. */
export function carOf(record: DeliverableThing): ThingCar<Thing> {
  ArgChecks.deliverableThing.parse(record)
```

### `packages/safebyok/src/minding/thing-car.ts`

Before:

```ts
}

/** The car the cache keeps when `landed` lands over `prior`, or over nothing: the newer revision of their newests, and the newer whole record of their fullests.
 * A tombstone newest leaves no fullest record, since a tombstone is whole. A whole record of an earlier life is not kept.
 * The prior car stays where `landed` adds nothing to it, and a car of another Thing replaces it.
 */
export function mergedCarOf(prior: ThingCar<Thing> | undefined, landed: ThingCar<Thing>): ThingCar<Thing> {
```

After:

```ts
}

/** The merge of `landed` over `prior`: the newer newest, with the newer fullest of the same life.
 * It is `prior` itself where `landed` adds nothing, and `landed` where `prior` is undefined or of another Thing.
 */
export function mergedCarOf(prior: ThingCar<Thing> | undefined, landed: ThingCar<Thing>): ThingCar<Thing> {
```

### `packages/safebyok/src/minding/thing-car.ts`

Before:

```ts
}

/** True when the vaultDB holds a whole record newer than `car`'s fullest: its liveness is `behind` or `bare`. */
export function isVaultDBNewer(car: Pick<ThingCar<Thing>, 'liveness'>): boolean {
  return (car.liveness === 'behind') || (car.liveness === 'bare')
}

/** True when `record` passes its kind's record check, so it has its body. A sparse record does not. */
export function isWholeRecord(record: Sparse<Thing>): record is Thing {
  return kindChecksOf(record.labelpath).record.safeParse(record).success
```

After:

```ts
}

/** True when the vaultDB holds a whole record newer than `car`'s fullest. */
export function isVaultDBNewer(car: Pick<ThingCar<Thing>, 'liveness'>): boolean {
  return (car.liveness === 'behind') || (car.liveness === 'bare')
}

/** True when `record` is whole, with its body, and not sparse. */
export function isWholeRecord(record: Sparse<Thing>): record is Thing {
  return kindChecksOf(record.labelpath).record.safeParse(record).success
```

### `packages/safebyok/src/minding/thing-car.ts`

Before:

```ts
// The lifepath decides first: a Thing born under a new life of its parent starts again at revseq 0. Lifeseqs are
// fixed-width base-32 digits, 0-9 then a-v, so lifepaths compare as strings; the shell's '-' sorts below them all.
/** Positive when `post` is later than `ante` (a later life, or a later revision of the same life), negative when earlier, zero for the same revision. */
export function cmpRecords(ante: Pick<DeliverableThing, 'lifepath' | 'revseq'>, post: Pick<DeliverableThing, 'lifepath' | 'revseq'>): number {
  if (ante.lifepath !== post.lifepath) { return (post.lifepath > ante.lifepath) ? 1 : -1 }
```

After:

```ts
// The lifepath decides first: a Thing born under a new life of its parent starts again at revseq 0. Lifeseqs are
// fixed-width base-32 digits, 0-9 then a-v, so lifepaths compare as strings; the shell's '-' sorts below them all.
/** Compare two revisions, life first: positive when `post` is later than `ante`, negative when earlier, zero when the same. */
export function cmpRecords(ante: Pick<DeliverableThing, 'lifepath' | 'revseq'>, post: Pick<DeliverableThing, 'lifepath' | 'revseq'>): number {
  if (ante.lifepath !== post.lifepath) { return (post.lifepath > ante.lifepath) ? 1 : -1 }
```

### `packages/safebyok/src/minding/thing-car.ts`

Before:

```ts
}

/** The car of `newest`, a live revision, and `fullest`, the newest whole record of its life, or undefined for none. */
function carOfParts(newest: Sparse<Thing>, fullest: Thing | undefined): ThingCar<Thing> {
  if (fullest === undefined)               { return Object.freeze({ liveness: 'bare',   newest, fullest }) }
```

After:

```ts
}

/** The car of live `newest`, with `fullest` the newest whole record of its life, or undefined for none. */
function carOfParts(newest: Sparse<Thing>, fullest: Thing | undefined): ThingCar<Thing> {
  if (fullest === undefined)               { return Object.freeze({ liveness: 'bare',   newest, fullest }) }
```

### `packages/safebyok/src/minding/thing-car.ts`

Before:

```ts
}

/** The newer of two whole records, either of which may be absent, or undefined where both are. On a tie, `ante`. */
function newerWholeOf(ante: Thing | null | undefined, post: Thing | null | undefined): Thing | undefined {
  if (! ante) { return post ?? undefined }
```

After:

```ts
}

/** The newer of two whole records, or undefined where both are absent. On a tie, `ante`. */
function newerWholeOf(ante: Thing | null | undefined, post: Thing | null | undefined): Thing | undefined {
  if (! ante) { return post ?? undefined }
```

### `packages/safebyok/src/minding/thing-car.ts`

Before:

```ts
function isLiveSparse(record: Sparse<Thing>): boolean { return (record.am === 'a') && (! isWholeRecord(record)) }

/** The check of {@link carOf}'s record: a Thing's scope and revision, as a whole record, a sparse one or the void sentinel has them. */
const ArgChecks = Validator.Checkers('bad_option', ({ obj }) => ({
  deliverableThing: obj({ ...thingScope.shape, ...thingCited.shape }),
}))

/** The check of a car's invariants, on the way out of {@link mergedCarOf}. A car that fails it is a bug in the minder. */
const Checks = Validator.Checkers('unexpected_error', ({ obj, lit, discrim, custom }) => {
  const citedShape = obj({ ...thingScope.shape, ...thingCited.shape })
```

After:

```ts
function isLiveSparse(record: Sparse<Thing>): boolean { return (record.am === 'a') && (! isWholeRecord(record)) }

/** The check of {@link carOf}'s record: a Thing's scope and revision. */
const ArgChecks = Validator.Checkers('bad_option', ({ obj }) => ({
  deliverableThing: obj({ ...thingScope.shape, ...thingCited.shape }),
}))

/** The check of a car's invariants. A car that fails it is a bug in the minder. */
const Checks = Validator.Checkers('unexpected_error', ({ obj, lit, discrim, custom }) => {
  const citedShape = obj({ ...thingScope.shape, ...thingCited.shape })
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts
// `val` is undefined under `vacant` and `untimely`, where the cache knows nothing timely; null under `gotvoid`, where storage holds nothing.
// A timely car is full, gone or void: a behind or bare car is never timely.
/** The cache's record for a scope, shaped like a get's answer. Act `vacant` means nothing is cached, and `untimely` means the cached car is older than asked, or lacks the newest record whole. */
type GotAnswer = (
  | GoodAnswer<Thing, 'gotlive'>
```

After:

```ts
// `val` is undefined under `vacant` and `untimely`, where the cache knows nothing timely; null under `gotvoid`, where storage holds nothing.
// A timely car is full, gone or void: a behind or bare car is never timely.
/** A get's answer, read from the cache. Beside a get's own acts:
 * * `vacant`   -- nothing is cached
 * * `untimely` -- the car is older than `staleTime`, is `behind` or `bare`, or its last get was refused
 */
type GotAnswer = (
  | GoodAnswer<Thing, 'gotlive'>
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts
) & { ask: GetAsk }

/** The car cached for a scope, however old, and how recent it is, and how its last get went. */
interface CarFreshness { car: ThingCar<Thing> | undefined, isTimely: boolean, refreshedAt: EpochMillis, isFetching: boolean, lastErr: Errors.VaultError | null }

/** The cache's record for a scope, shaped like a get's answer, with its car and the car's freshness (`car`, `isTimely`, `refreshedAt`, `isFetching`, `lastErr`). */
export type TSQGotAnswer = GotAnswer & CarFreshness

/** The cache's answer for a scope, read without waiting on the vaultDB: its {@link TSQGotAnswer}, or a refusal. */
export type TSQAnswer = TSQGotAnswer | BadAnswer
// --
```

After:

```ts
) & { ask: GetAsk }

/** The car cached for a scope, however old, and the state of its gets. */
interface CarFreshness {
  /** The cached car, or undefined for none. */
  car:         ThingCar<Thing> | undefined
  /** False where the act is `vacant` or `untimely`. */
  isTimely:    boolean
  /** When a record last landed in the car, or 0 for none. */
  refreshedAt: EpochMillis
  /** True while a get of the car is under way. */
  isFetching:  boolean
  /** The refusal of the car's last get, or null. */
  lastErr:     Errors.VaultError | null
}

/** A get's answer read from the cache, with the car and its {@link CarFreshness}. */
export type TSQGotAnswer = GotAnswer & CarFreshness

/** `tryAt`'s answer: a {@link TSQGotAnswer}, or a refusal. */
export type TSQAnswer = TSQGotAnswer | BadAnswer
// --
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts
// == [Arguments]: MinderOpts, Checks

/** The options of {@link ThingMinder.make}, beside its ties and its bank. */
export interface MinderOpts {
  /** Where the bank's Things are stored. */
```

After:

```ts
// == [Arguments]: MinderOpts, Checks

/** Options for {@link ThingMinder.make}. */
export interface MinderOpts {
  /** Where the bank's Things are stored. */
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts
  /** The TanStack Query client whose cache holds the cars. A host may share its own. */
  tsq:             TSQ.QueryClient
  /** How long a full car stays timely, and a car stays cached once no TanStack observer uses it. A missing field defaults from {@link DefaultQueryCacheOpts}. */
  queryCacheOpts?: Partial<QueryCacheOpts>
}
```

After:

```ts
  /** The TanStack Query client whose cache holds the cars. A host may share its own. */
  tsq:             TSQ.QueryClient
  /** The cache's timings ({@link QueryCacheOpts}). A field left out takes its value from {@link DefaultQueryCacheOpts}. */
  queryCacheOpts?: Partial<QueryCacheOpts>
}
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts
// --

/** Keeps one kind of Thing in one bank fresh in a TanStack Query cache, through a watch of the bank of its own.
 * A minder reads only its bank's scope and ask builders, so it may be made before the bank is born: a get or a list refuses until the bank is stored.
 */
export class ThingMinder {
```

After:

```ts
// --

/** Keeps one kind of Thing in one bank fresh in a TanStack Query cache, through its own watch of the bank.
 * Internal: the layers above the core build on it, and a host does not call it.
 * It reads only its bank's scope and ask builders, so it may be made before the bank's birth.
 * It answers `get`, `tryAt` and `list` only between `hello` and `goodbye`, and refuses `disabled` outside them.
 */
export class ThingMinder {
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts
  readonly #queryCacheOpts: Readonly<QueryCacheOpts>
  #unwatch: (() => void) | null = null
  /** True from `hello` until `goodbye`: cars are cached, and `tryAt`, `get` and `list` answer, only then. */
  #isReady = false
  // --
```

After:

```ts
  readonly #queryCacheOpts: Readonly<QueryCacheOpts>
  #unwatch: (() => void) | null = null
  /** True while minding: from `hello` until `goodbye`. */
  #isReady = false
  // --
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts
  // == [Construction]: make, constructor

  /** Make a minder of `ties.modelkind` in `bank`, asking `opts.vaultDB` and caching in `opts.tsq`. Call `hello` to start it. */
  static make(ties: Pick<ThingTies, 'modelkind'>, opts: MinderOpts, bank: MinderFriend): ThingMinder {
    const checked = Checks.minderMakeArgs.parse({ ties, opts, bank })
```

After:

```ts
  // == [Construction]: make, constructor

  /** Make a minder of one kind of Thing in `bank`. It does nothing until `hello`. */
  static make(ties: Pick<ThingTies, 'modelkind'>, opts: MinderOpts, bank: MinderFriend): ThingMinder {
    const checked = Checks.minderMakeArgs.parse({ ties, opts, bank })
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts
  // == [Starting and ending]: hello, #startVaultDBWatch, goodbye

  /** Start minding: set this minder's defaults on the cache, and watch the bank. A second call does nothing. */
  hello(): void {
    if (this.#isReady) { return }
```

After:

```ts
  // == [Starting and ending]: hello, #startVaultDBWatch, goodbye

  /** Start minding: until `goodbye`, answer gets, and cache each change the vaultDB tells of. A second call does nothing.
   * A TanStack observer of a minder's `queryKey` then fetches and merges cars too.
   */
  hello(): void {
    if (this.#isReady) { return }
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts
  }

  /** Watch the bank: each notice goes to `#receive`, and the watch's trouble to the bank's `tellBadNews`. */
  #startVaultDBWatch(): void {
    this.#unwatch = this.#vaultDB.watch(
```

After:

```ts
  }

  /** Start this minder's watch of the bank. */
  #startVaultDBWatch(): void {
    this.#unwatch = this.#vaultDB.watch(
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts
  }

  /** Stop minding, and remove this minder's cars and defaults from the cache. Reads refuse until `hello` is called again. */
  goodbye(): void {
    this.#isReady = false
```

After:

```ts
  }

  /** Stop minding, and remove this minder's cars from the cache. A get still waiting refuses `disabled`. */
  goodbye(): void {
    this.#isReady = false
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts
  }

  /** The cache's answer for `ask`'s scope, and whether it is timely. Never waits on the vaultDB.
   * - `staleTime`          -- a car older than this (milliseconds) is `untimely`, without its `val`; so is a `behind` or `bare` car
   * - `ifStale: 'get'`     -- read the cache alone (default)
   * - `ifStale: 'refresh'` -- also fetch a stale or vacant car in the background
   */
  tryAt(ask: MinderGetAsk, opts: MinderAskOpts = {}): TSQAnswer {
```

After:

```ts
  }

  /** The cache's answer for `ask`'s scope, without waiting on the vaultDB.
   * A car that is not timely answers `untimely`, with no `val`.
   * Under `ifStale: 'refresh'`, it also fetches a stale or missing car in the background ({@link MinderAskOpts}).
   */
  tryAt(ask: MinderGetAsk, opts: MinderAskOpts = {}): TSQAnswer {
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts
  }

  /** Get the car of the Thing `ask` names: the cached one if timely, else from the vaultDB. A get already under way is shared.
   * Refuses `stale_read` where storage answers older than the newest record cached when the get began. That car stays cached, and no longer counts as timely.
   * Refuses `disabled` where `goodbye` is called while it waits.
   */
  async get(ask: MinderGetAsk, opts: MinderGetAskOpts = {}): Promise<ThingCar<Thing>> {
```

After:

```ts
  }

  /** Get `ask`'s car: the cached one if timely, else from the vaultDB. A get already under way is shared.
   * Refuses `stale_read` when the vaultDB answers with a revision older than one cached when the get began. A later get asks again.
   * With no root car cached, a get of a box the vaultDB holds nothing for refuses: get the root box first.
   */
  async get(ask: MinderGetAsk, opts: MinderGetAskOpts = {}): Promise<ThingCar<Thing>> {
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts
  }

  /** List the Things one label under this minder's root, tombstones included, and resolve their labelpaths. A box minder lists the boxes under the root box.
   * Each lands in its car as a sparse record. A car left `behind` or `bare` is stale, so that the next get fetches the record whole.
   */
  async list(): Promise<Labelpath[]> {
```

After:

```ts
  }

  /** List the Things directly under this minder's root, in labelpath order, tombstones included.
   * A box minder's root is the root box. Each record is cached sparse. Where that leaves a car `behind` or `bare`, the
   * next get fetches it whole. A tombstone's car is `gone`, and answers from the cache.
   */
  async list(): Promise<Labelpath[]> {
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts
  }

  /** True when no cached car for `ask`'s scope is timely. `staleTime` overrides the minder's own. Never asks the vaultDB. */
  isStaleAt(ask: MinderGetAsk, opts: MinderGetAskOpts = {}): boolean {
    const { staleTime = this.#queryCacheOpts.staleTime } = minderGetAskOpts.parse(opts)
```

After:

```ts
  }

  /** True when `ask`'s car is missing or not timely. */
  isStaleAt(ask: MinderGetAsk, opts: MinderGetAskOpts = {}): boolean {
    const { staleTime = this.#queryCacheOpts.staleTime } = minderGetAskOpts.parse(opts)
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts
  }

  /** Call `listener` with the answer `tryAt` would give for a scope, under this minder's own `staleTime`, each time a record lands in its car, a get of it is refused, or the car is invalidated or removed.
   * A record that lands is told even when it changes nothing. A car that ages past `staleTime` is not told, and listening keeps nothing cached: a TanStack observer does both.
   * Returns the function that stops it. What the listener throws goes to the device's `onBadNews`, and stops nothing.
   */
  listen(listener: (answer: TSQGotAnswer) => void): () => void {
```

After:

```ts
  }

  /** Call `listener` each time a car changes, with the answer for its scope. Returns the function that stops it.
   * A car changes when a record lands in it (even one that changes nothing), a get of it is refused, or it is invalidated
   * or removed. The answer's `isTimely` uses the minder's own `staleTime`.
   * Nothing is called when a car ages past `staleTime`, and listening keeps no car cached: use a TanStack observer for either.
   * What `listener` throws goes to the bank's `tellBadNews`, and stops nothing.
   */
  listen(listener: (answer: TSQGotAnswer) => void): () => void {
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts

  // Its refusal lands beside the car, where the next tryAt finds it as `lastErr`.
  /** Initiate fetch of `ask`'s record, if its car is stale, without waiting for the result. If a fetch is under way, it will use its result (not starting a new one). */
  #backgroundRefresh(ask: GetAsk, staleTime: number): void {
    void this.#doGet(ask, staleTime).catch(noop)
  }

  /** The car for `ask`'s scope, from the cache if timely within `staleTime`, else from the vaultDB. */
  async #doGet(ask: GetAsk, staleTime: number): Promise<ThingCar<Thing>> {
    let fetched: ThingCar<Thing>
```

After:

```ts

  // Its refusal lands beside the car, where the next tryAt finds it as `lastErr`.
  /** Fetch `ask`'s car in the background, if it is stale. */
  #backgroundRefresh(ask: GetAsk, staleTime: number): void {
    void this.#doGet(ask, staleTime).catch(noop)
  }

  /** `ask`'s car: the cached one if timely within `staleTime`, else from the vaultDB. */
  async #doGet(ask: GetAsk, staleTime: number): Promise<ThingCar<Thing>> {
    let fetched: ThingCar<Thing>
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts
  }

  /** The cache's query for `scoped`, which holds its car, or undefined for none. */
  #tsqFind(scoped: ThingScope): TSQ.Query<ThingCar<Thing>> | undefined {
    return this.#tsq.getQueryCache().find<ThingCar<Thing>>({ queryKey: this.queryKey(scoped), exact: true })
```

After:

```ts
  }

  /** The cache's query holding `scoped`'s car, or undefined for none. */
  #tsqFind(scoped: ThingScope): TSQ.Query<ThingCar<Thing>> | undefined {
    return this.#tsq.getQueryCache().find<ThingCar<Thing>>({ queryKey: this.queryKey(scoped), exact: true })
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts
  // == [VaultDB->Minder Delivery]: #receive, #doDeliverRecord

  /** Cache the Thing a notice of the bank's watch carries, where it is of this minder's kind. */
  #receive(notice: ThingNotice): void {
    if (modelkindOf(notice.val.labelpath) === this.modelkind) { this.#doDeliverRecord(notice.val) }
  }

  /** Land the car of `record` in the cache, while this minder is minding. */
  #doDeliverRecord(record: DeliverableThing): void {
    if (! this.#isReady) { return }
```

After:

```ts
  // == [VaultDB->Minder Delivery]: #receive, #doDeliverRecord

  /** Cache `notice`'s Thing, if it is of this minder's kind. */
  #receive(notice: ThingNotice): void {
    if (modelkindOf(notice.val.labelpath) === this.modelkind) { this.#doDeliverRecord(notice.val) }
  }

  /** Merge `record` into its cached car, while minding. */
  #doDeliverRecord(record: DeliverableThing): void {
    if (! this.#isReady) { return }
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts
  // == [TSQ Asks]: keyPrefix, queryKey, #tsqGetAskOf, #fetchCar, #shellAt

  /** The key every one of this minder's cars is cached under starts with: its root's, without the final '.', selecting the root and everything under it. */
  get keyPrefix(): TSQ.QueryKey { return ['safebyok', this.userid, this.banklabel, this.modelkind] }
```

After:

```ts
  // == [TSQ Asks]: keyPrefix, queryKey, #tsqGetAskOf, #fetchCar, #shellAt

  /** The start of the key every one of this minder's cars is cached under. */
  get keyPrefix(): TSQ.QueryKey { return ['safebyok', this.userid, this.banklabel, this.modelkind] }
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts
  queryKey(scoped: ThingScope): TSQ.QueryKey { return ['safebyok', this.userid, this.banklabel, ...scoped.labelpath.split('/'), '.'] }

  /** TanStack's query options for a get of `ask`, the vaultDB's part of a minder's get ask. */
  #tsqGetAskOf(ask: GetAsk) {
    return { queryKey: this.queryKey(ask), queryFn: () => this.#fetchCar(ask) }
```

After:

```ts
  queryKey(scoped: ThingScope): TSQ.QueryKey { return ['safebyok', this.userid, this.banklabel, ...scoped.labelpath.split('/'), '.'] }

  /** TanStack's query options for a get of `ask`. */
  #tsqGetAskOf(ask: GetAsk) {
    return { queryKey: this.queryKey(ask), queryFn: () => this.#fetchCar(ask) }
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts

  // A host's observer keeps the default queryFn past goodbye, and would cache what it fetches.
  /** The car of `ask`'s record from the vaultDB, or of its shell where storage holds nothing. Refuses `stale_read` where it is older than the newest record cached when it began. */
  async #fetchCar(ask: GetAsk): Promise<ThingCar<Thing>> {
    this.#demandReady()
```

After:

```ts

  // A host's observer keeps the default queryFn past goodbye, and would cache what it fetches.
  /** Fetch `ask`'s car from the vaultDB, made of its shell where storage holds nothing.
   * Refuses `stale_read` for an answer older than the revision cached when it began.
   */
  async #fetchCar(ask: GetAsk): Promise<ThingCar<Thing>> {
    this.#demandReady()
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts

  // Boxes are the only Things under a root, for now: one label under the root box.
  /** The shell at `scoped`: a root's, or that of a Thing under the newest of its root's cached car. Refuses `bad_option` where no root is cached. */
  #shellAt(scoped: ThingScope): VoidSentinel {
    const { labelpath } = scoped
```

After:

```ts

  // Boxes are the only Things under a root, for now: one label under the root box.
  /** The shell at `scoped`. Below a root, it takes the life of its root's cached car, and refuses `bad_option` where none is cached. */
  #shellAt(scoped: ThingScope): VoidSentinel {
    const { labelpath } = scoped
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts
  // == [Checks]: scope, ties, #demandOwnAsk, #demandOwnScope, #demandReady, #scopeOfKey

  /** The bank this minder minds Things of. */
  get scope(): ThingWatchScope { return { userid: this.userid, banklabel: this.banklabel } }
```

After:

```ts
  // == [Checks]: scope, ties, #demandOwnAsk, #demandOwnScope, #demandReady, #scopeOfKey

  /** The scope of this minder's bank. */
  get scope(): ThingWatchScope { return { userid: this.userid, banklabel: this.banklabel } }
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts
  get ties(): ThingTies { return { userid: this.userid, banklabel: this.banklabel, modelkind: this.modelkind } }

  /** Demand that `ask` is a get ask with `ifAbsent: 'nil'` and a `track`, for this minder's bank and modelkind. Throws `bad_option`. */
  #demandOwnAsk(ask: MinderGetAsk): void {
    minderTrack.parse(ask)
```

After:

```ts
  get ties(): ThingTies { return { userid: this.userid, banklabel: this.banklabel, modelkind: this.modelkind } }

  /** Demand that `ask` is a get ask with `ifAbsent: 'nil'` and a `track`, for this minder's bank and modelkind. */
  #demandOwnAsk(ask: MinderGetAsk): void {
    minderTrack.parse(ask)
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts
  }

  /** Demand that `scoped` is a scope in this minder's bank, of its modelkind. Throws `bad_option`. */
  #demandOwnScope(scoped: ThingScope): void {
    const { labelpath, ...bankScope } = minderScope.parse(scoped)
```

After:

```ts
  }

  /** Demand that `scoped` is a scope in this minder's bank, of its modelkind. */
  #demandOwnScope(scoped: ThingScope): void {
    const { labelpath, ...bankScope } = minderScope.parse(scoped)
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts
}

/** The refusal of a get that storage answered older than the newest record cached when it began. */
function staleRead(ask: GetAsk): Errors.VaultError {
  return new Errors.VaultError('stale_read', Phrases.StaleRead, { meta: { ask: loggableAskOf(ask) } })
```

After:

```ts
}

/** The refusal of a get answered with a revision older than one cached when it began. */
function staleRead(ask: GetAsk): Errors.VaultError {
  return new Errors.VaultError('stale_read', Phrases.StaleRead, { meta: { ask: loggableAskOf(ask) } })
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts
}

/** A get's answer for `car`, the car cached at `ask`'s scope: act `vacant` for none, `untimely` unless `isTimely`, and otherwise its newest record. */
function gotAnswerOf(ask: GetAsk, car: ThingCar<Thing> | undefined, isTimely: boolean): GotAnswer {
  if (car === undefined)                         { return { ok: true, ask, act: 'vacant',   world: null, val: undefined } }
```

After:

```ts
}

/** The {@link GotAnswer} for `car`, the car cached at `ask`'s scope. */
function gotAnswerOf(ask: GetAsk, car: ThingCar<Thing> | undefined, isTimely: boolean): GotAnswer {
  if (car === undefined)                         { return { ok: true, ask, act: 'vacant',   world: null, val: undefined } }
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts

// A query under this minder's prefix holds a car this minder cached.
/** TanStack's staleTime for a car's query: `staleTime`, or 0 where the vaultDB holds a newer whole record, so that the next get fetches it. */
function staleTimeFnOf(staleTime: number): (carQuery: Readonly<{ state: Readonly<{ data: unknown }> }>) => number {
  return (carQuery) => {
```

After:

```ts

// A query under this minder's prefix holds a car this minder cached.
/** TanStack's staleTime for a car's query: `staleTime`, or 0 where {@link isVaultDBNewer}. */
function staleTimeFnOf(staleTime: number): (carQuery: Readonly<{ state: Readonly<{ data: unknown }> }>) => number {
  return (carQuery) => {
```

### `packages/safebyok/src/minding/thing-minder.ts`

Before:

```ts

// TanStack also calls it on an observer's selected and placeholder values, which may be anything.
/** The value TanStack keeps when `landed` lands over `prior`: their merged car where `landed` is a car, else what TanStack's default sharing keeps. */
function keptValOf(prior: unknown, landed: unknown): unknown {
  if (! isThingCar(landed)) { return TSQ.replaceEqualDeep(prior, landed) }
```

After:

```ts

// TanStack also calls it on an observer's selected and placeholder values, which may be anything.
/** The value TanStack keeps when `landed` lands over `prior`: the merged car ({@link mergedCarOf}) for a car, else TanStack's default sharing. */
function keptValOf(prior: unknown, landed: unknown): unknown {
  if (! isThingCar(landed)) { return TSQ.replaceEqualDeep(prior, landed) }
```

