# Goofus and Gallant

Representative bad code from the models, what we did about it, and the principle it teaches. Each principle has a
hashtag to refer to in a review. The examples come from the `newput` work of November 2026, trimmed for reading: real code,
except where one says it was only proposed.

This file is for code review. Agents writing code learn these from the code around them, so the way to teach them is to fix
the code. Reviewing against it:

* Skip anything marked *Planned*, unless you're reviewing that thread.
* Check a proposed fix against the plan before you offer it. This file teaches the faults, not the rulings, so a fix that follows
  the wording here can still undo something ruled.

**Status** covers the sites named, not the whole codebase, so a fault marked *Fixed* can still live elsewhere. *Fixed* is
merged or on #470. *Planned* is ruled or proposed for a later thread in `whiteboard/20261102-newdesign/newput-plan.md`, not
built. *Open* is a live case that has no thread and needs a ruling.

Contents:

* **Call chains:** `#straight-chute`, `#sugar-holds-no-logic`, `#no-bouncing`, `#own-your-form`, `#no-call-for-side-effects`
* **Guards and awaits:** `#ensure-works-demand-refuses`, `#guard-at-the-entrypoint`, `#no-second-ensure`
* **Letting things fail:** `#the-backend-judges`, `#impossible-is-a-crash`, `#host-choices-cost-the-host`, `#edge-cases-dont-drive`
* **Reuse:** `#use-the-helper`, `#one-test-one-place`, `#use-what-you-parse`
* **Shapes and state:** `#no-fake-values`, `#stable-sentinels`, `#ask-the-host`, `#no-wrapper-without-a-job`, `#say-the-positive`
* **Words:** `#purpose-not-process`
* **Reading the Coach:** `#a-fact-is-not-a-ruling`, `#dont-overstretch-a-request`

---

# Call chains

## One way in `#straight-chute`

Each operation has one route from its entry point to storage. A method that branches on how the caller got there is
doing someone else's job. The state the object already holds should make the branch unnecessary.

**Goofus:** birth and update are two paths, each minting a `box_tok`, setting `registered_at` and sealing.

```ts
// BoxListing
async create(input, opts = {}) {
  const dna = boxDna.parse(input)
  await this.#ensureCreatable(); this.#demandCreatable()
  this.demandNotHeld(dna)
  const { whisper, sidecar, ...sparse } = this.stampDna(dna)
  const draft = await sealedRecordOf(this.world, { ...sparse, fmt: BoxFormat, am: 'a', vault_tok: this.world.vault_tok, box_tok: makeLifeTok() }, sidecar, whisper)
  await this.#ensureCreatable(); this.#demandCreatable()
  return this.putDraft(draft, null, opts)
}
```

**Gallant:** a void instance at revision -1 makes seq 0 an ordinary next revision, so a birth is a put.

```ts
async create(input, opts = {}) {
  const filled = MSX.boxCreateOpts.parse(opts)
  const dna = boxDna.parse(input)
  return this.puttable(input, filled).put(dna, filled)
}
```

*Status: Fixed.*

## Sugar holds no logic `#sugar-holds-no-logic`

A convenience method on a parent forwards to the real verb. If it has branches, the real verb is missing, or it lives in
the wrong place. Moving the body down a layer intact doesn't fix it: that only moves the slop.

**Goofus:**

```ts
// Vault
async getBox(boxlabel, opts = {}) {
  const { ifAbsent = 'fail', ...timely } = MSX.fetchOpts.parse(opts)
  const scope = this.#boxscopeOf(boxlabel)
  await this.#ensureGreeted(); this.demandBoxesUsable()
  const boxes = this.boxListing
  const box = await (boxes.at(scope)?.hydrate(timely) ?? boxes.fetch(scope, { ifAbsent: 'nil', maxWorldMillis: timely.maxWorldMillis }))
  await this.#ensureGreeted(); this.demandBoxesUsable()
  if (box?.isPresent === true) { return box }
  if (ifAbsent === 'nil') { return null }
  throw absentBoxError(scope)
}
```

**Gallant:**

```ts
// Vault
async getBox(boxlabel, opts = {}) { return this.boxListing.get({ ...this.scope, boxlabel }, opts) }

// BoxListing
async get(scoped, opts = {}) {
  const held = this.at(scoped)
  if (held === null) { return this.fetch(scoped, opts) }
  const { ifAbsent = 'fail', ...timely } = MSX.fetchOpts.parse(opts)
  return this.handleIfAbsent(await held.hydrate(timely), scoped, ifAbsent)
}
```

**Goofus still:** `delBox` has the shape `getBox` had: a held branch, its own ensure and demand, and a sentinel, because
`BoxListing` has no `del` to forward to.

```ts
async delBox(boxlabel, opts = {}) {
  const timely = MSX.timelyOpts.parse(opts)
  const boxes = this.boxListing
  const scope = boxes.scopeOf({ ...this.scope, boxlabel })
  this.demandBoxesUsable()
  const held = boxes.at(scope)
  if (held !== null) { return held.del(timely) }
  await this.ensureTimely(timely.maxWorldMillis); this.demandBoxesUsable()
  return boxes.del(boxes.damagedAt(scope) ?? VS.sentinelBoxOf(scope, this.vault_tok))
}
```

*Status: `getBox`, `putBox`, Fixed. `delBox`, Planned, Thread 3.*

## Don't bounce between classes `#no-bouncing`

If a call goes A to B to A to B, one of them wants the other's data. Give the work to whoever uses the result, and let the
data arrive the way it already arrives.

**Goofus:** the vault asks its listing to fetch a list the listing doesn't use, carries it across, and hands it to a child
that the same listing had to construct.

```ts
// Vault
async hello() {
  const listed = await this.listing.fetchListed(this)      // VaultListing fetches, delivers back to this vault
  this.demandUsable()
  await this.boxListing.hello(listed)                      // made by this.listing.boxListingOf(this)
  return this
}
```

**Gallant:** the box listing gets its own list, and the vault's row arrives as `world`, as on every other box answer.

```ts
// Vault
hello() { return this.boxes.hello() }                      // BoxListing: the watch, then refresh()
```

*Status: Planned, Thread 2.*

## Whoever owns the form builds it `#own-your-form`

Don't have a middleman assemble another class's record, and don't let it overrule what the caller said. It's only there
to route.

**Goofus:** the listing assembles a tombstone inline, and swaps the revision the caller named for the one it holds, so a
stale caller deletes over whatever is current.

```ts
// Listing
async del(duck) {
  const held = (duck.am === 'd') ? null : this.at(scope)
  return this.delOver(held?.sparse ?? this.sparseOf(duck))
}
protected async delOver(sparse) {
  const prior = VS.revisionOf(sparse)
  const tombstone = { ...sparse, ...VS.nextRevisionOf(prior, this.clock.now()), am: 'x' as const }
  return this.deliver(await this.tryDelRow(tombstone, { prior }))
}
```

**Gallant:** nothing upstream writes a next revision or an `am`. A tombstone has no seal, so nothing has to be chosen before
it reaches the vaultDB. The duck's revision is the prior, and any duck will do.

```ts
vaultDB.delBox(duck)   // an instance, a record, or { ...scope, vault_tok, ...revision }
```

`put` can't do this: the stamp binds the revision to the ciphertext, so the sealer has to choose the next revision itself.

*Status: Planned, Thread 3.*

## Don't call a method for its side effect `#no-call-for-side-effects`

If you throw away the return value, you wanted something else. Name it, or put it where it belongs.

**Goofus:** `puttable` finds or makes an instance. `box.put` calls it and discards the answer, only for two throws. It runs
before the refresh, so those throws judge a stale record, and it can plant a shell by accident.

```ts
async put(patch, opts = {}) {
  const { ifAbsent = 'add', ifPresent = 'repl', ...timely } = MSX.boxPutOpts.parse(opts)
  this.listing.puttable({ ...patch, ...this.scope }, { ifAbsent, ifPresent })
  await this.ensurePuttable(timely); const given = this.demandPuttable(patch)
```

**Goofus again:** `valOf` here runs only so that it throws.

```ts
const hello = await outcomeOf(() => this.#bringUp(listing))
if (listing === this.#vaultListing) { this.#lastHello = hello }
this.#remakeSnapshot()
valOf(hello)
```

**Goofus again:** `build` parses a record for the refusal alone, and `#makeThingOf` parses the same record again.

```ts
async build(record) {
  this.demandEnabled()
  this.sparseOf(record)
  return this.buildOrReceive(record)
}
```

**Gallant:** the preconditions go in the guard, after the refresh.

```ts
async put(patch, opts = {}) {
  const { ifAbsent = 'add', ifPresent = 'repl', ...timely } = MSX.boxPutOpts.parse(opts)
  await this.ensurePuttable(timely)
  const given = this.demandPuttable(patch, { ifPresent })
```

**Gallant again:** the one parse sits where its result is used, so every route gets it and `build` has nothing left to do.

```ts
protected buildOrReceive(record) {
  this.demandEnabled()
  const sparse = this.sparseOf(record)
  const held = this.at(this.scopeOf(sparse))
```

*Status: `box.put`, `listing.build`, Fixed. `bank.hello`, Planned, Thread 2.*

---

# Guards and awaits

## Ensure does the work, demand refuses `#ensure-works-demand-refuses`

`ensureFoo` does the work if it's needed, and refuses nothing of its own. The caller demands, synchronously, with no `await`
before the critical call. When an awaited promise resolves, other waiters can run first, a `lock()` among them, so a demand
inside the `ensure` is stale by the time the caller resumes.

**Goofus:** a probe stepping `lock()` through the microtask ticks found the delete reaching the vaultDB after the lock, at
tick 3.

```ts
async ensureReadyToDel(opts = {}) {
  await this.hydrate(opts)
  return this.demandReadyToDel()
}
async del(opts = {}) {
  await this.ensureReadyToDel(MSX.timelyOpts.parse(opts))
  await this.listing.del(this)
}
```

**Gallant:**

```ts
async del(opts = {}) {
  await this.ensureDeletable(MSX.timelyOpts.parse(opts)); this.demandDeletable()
  await this.listing.del(this)
}
```

*Status: Fixed, in #469.*

## A guard lives in what an entrypoint calls `#guard-at-the-entrypoint`

A public entrypoint's `demandFooable` carries `demandEnabled` and whatever else that entrypoint needs. A primitive, a private
helper, or a method that only prepares another carries none. Demand again only at a critical seam, synchronously before the
critical call. STYLE.md, *Control flow and refusals*, has the rule.

**Goofus:** `puttable` only prepares `box.put`, which has the side effects, yet it carried the guards.

```ts
puttable(scoped, opts = {}) {
  const { ifAbsent, ifPresent } = MSX.boxPutOpts.parse(opts)
  const scope = this.scopeOf(scoped)
  this.demandUsable()                       // and 25 `demandEnabled()` sites like it, before #469
```

**Gallant:** the guards move to `box.put`'s `demandPuttable`. `puttable` keeps only the refusal it alone can make, an empty slot
under `ifAbsent: 'fail'`, as the plan rules.

```ts
puttable(scoped, opts = {}) {
  const { ifAbsent } = MSX.boxPutOpts.parse(opts)
  const scope = this.scopeOf(scoped)
  const held = this.at(scope)
  if ((held === null) && (ifAbsent === 'fail')) { throw notListedBoxError(scope) }
  return held ?? this.#shellFor(scope)
}

demandPuttable(patch, choices) { /* parses the patch, then demands enabled, vault usable, whole */ }
```

**Enabled is a special guard:** one monkeywrench is enough. The code that ends a listing is synchronous: it disables the listing,
disables every thing in it, and removes them, so nothing crosses it halfway. The one check after a store's answer is at the top of
`deliver`, before it takes the answer's world.

```ts
protected async deliver(answer) {
  this.demandEnabled()
  if (answer.world !== null) { this.world.takeWorld(answer.world) }
```

**Not this fault:** guards and ensures with the same body. `ensurePuttable`, `ensureUnsealable` and `ensureDeletable` all call
`hydrate`, and `demandExposable` and `demandDeletable` match. Each is named for its call site, and they stay, by the Coach's decision.

*Status: `puttable`, `deliver`, Fixed. `#receiveNothing` and `buildOrReceive` still carry a demand, Planned, Thread 4, with `fate`.*

## An ensure is for when you want a refresh `#no-second-ensure`

A demand after an `await` needs no `ensure`. A second `hydrate` can only fetch, move `central` after the prior was
captured, and lose to `stale_write` anyway.

**Goofus:**

```ts
const { record, prior } = await this.#edit(given)
await this.ensureSendable(); this.demandSendable()
```

**Gallant:**

```ts
const { record, prior } = await this.#edit(given)
this.demandPuttable(patch, choices)
```

**Not this fault:** `fetch` and `hydrate` check the world again at each step, on the way to storage. A check that is timely costs
nothing, and the one cost is that a caller's looser `maxWorldMillis` can still earn a refresh. We leave them.

*Status: Fixed.*

---

# Letting things fail

## The backend judges `#the-backend-judges`

In a revisioned CAS model the vaultDB is the ground truth. A local check that repeats its judgment adds a second, staler
opinion, with a refusal that doesn't carry the frontier.

**Goofus:**

```ts
protected demandNotHeld(scope) {
  if (this.at(scope) !== null) { throw alreadyHeldError() }
}
```

**Gallant:** delete it. A `create` over a live box refuses `camped`, and over a stored, unlisted box `stale_write`, each with
the row that was in the way.

**Goofus again:** `demandPuttable` refused a held tombstone under `ifAbsent: 'fail'`, though the vaultDB is told `ifAbsent` too. Over a box
reborn elsewhere, the local check said absent, where the vaultDB's `stale_write` delivers the frontier.

```ts
if (ifAbsent === 'fail') { this.demandPresent() }
```

**Gallant again:** delete it, and the vaultDB's `absent_box` or `stale_write` answers.

**Not this fault:** a birth's refusal of a vault held. No backend is asked yet: it spares the user a passphrase dialog and a KDF that
could only fail.

*Status: Fixed.*

## The impossible is one line `#impossible-is-a-crash`

A branch the types force and only a broken system reaches is one line: `throw`. If it wants a second line, stop and raise it.
Never `!` or a cast, which is what a host's own vaultDB adapter gets to crash through. No row, no FIXME, and no reviewer asking
for more. What makes this safe is failing closed before anything changes, not proving the branch never runs. The test: if you
can name a *correct* system that reaches the state, it isn't this case.

**Goofus:** `putDraft` exists to narrow `ThingT | null`, with a refusal that claims nothing is stored.

```ts
protected async putDraft(draft, ante = null, opts = {}) {
  const thing = await this.put(draft, ante, opts)
  if (thing === null) { throw this.nothingStoredError(this.scopeOf(draft)) }
  return thing
}
```

**Gallant:**

```ts
const thing = await this.deliver(await this.tryPutRow(checked, { prior, ifAbsent, ifPresent }))
if (thing === null) { throw new VaultError('unexpected_error', Phrases.PutAnsweredNothing) }
```

**Goofus again:** the checker's refine guarantees one proof, and the type doesn't know it.

```ts
const proved = (passphraseClear === undefined) ? await PasskeyProving.buildStored(gate, passkeyClear!) : await PassphraseProving.buildStored(gate, passphraseClear, world)
return { proved }
```

**Gallant again:**

```ts
if (passphraseClear !== undefined) { return { proved: await PassphraseProving.buildStored(gate, passphraseClear, world) } }
if (! passkeyClear) { throw new VaultError('unexpected_error', Phrases.ProofMissing) }
return { proved: await PasskeyProving.buildStored(gate, passkeyClear) }
```

*Status: Fixed.*

## A host's choice costs the host `#host-choices-cost-the-host`

A host that skips an optional step gets an honest refusal. It doesn't get machinery at the bottom of the library to spare it
that, or a flag that makes every other step depend on the optional one.

**Goofus:** every box verb runs or checks `hello`, though nothing in the listing needs it.

```ts
await this.#ensureGreeted(); this.demandBoxesUsable()
```

**Goofus again, proposed and dropped:** a `delBox` that fetches first, so a host that skipped `hello` never meets a `stale_write`.

**Gallant:** no `#isGreeted`. A host that skips `vault.hello` has no list and no pushes, and `vault.delBox` on a box it doesn't
hold fails stale, with the frontier delivered. The host chose that.

*Status: Fixed.*

## Edge cases don't drive the bus `#edge-cases-dont-drive`

Before fixing an edge case, trace who actually reaches it, and what the fix costs everyone else. A special case that names a
sentinel is a smell. So is a fix that changes behaviour for cases the bug never touched.

**Goofus:** a shell left by a refused put made `get` answer absent, so a reviewer taught `get` about void revisions.

```ts
const isHeard = (held !== null) && (held.revision_seq !== VS.VoidRevisionSeq)
const box = await (isHeard ? held.hydrate(timely) : this.fetch(scope, { ifAbsent: 'nil', maxWorldMillis: timely.maxWorldMillis }))
```

**Goofus again:** the next fix fetched every tombstone, to cover that one case.

```ts
const box = await ((held?.isPresent === true) ? held.hydrate(timely) : this.fetch(/* ... */))
```

**Gallant:** the plain two branches. A tombstone within its horizon is timely, and `hydrate` already handles the rest. After a
refused put on a box stored but not listed, `get` can say absent until the horizon passes, and we accept that.

```ts
const held = this.at(scoped)
if (held === null) { return this.fetch(scoped, opts) }
```

*Status: Fixed.*

---

# Reuse

## Look before you write `#use-the-helper`

Search `src/checks/validator.ts` and the module's helpers before writing anything small. The pull to write it again is
strongest where the helper is one grep away.

**Goofus:**

```ts
verifyConsistent(MSX.boxPatch.parse(patch, { advice: Phrases.BoxPatchAdvice }), this.scope, { kind: 'bad_option', message: Phrases.patchOfOtherScope })
```

**Gallant:**

```ts
MSX.boxPatch.parseConsistent(patch, this.scope, { kind: 'bad_option', message: Phrases.patchOfOtherScope, advice: Phrases.BoxPatchAdvice })
```

**Goofus:** `deliver` asks whether a refusal's `dbhas` belongs to this listing by listing refusal kinds. Each new case adds an
override.

```ts
protected isRefusalOfRow({ refusalkind }) { return (refusalkind === 'stale_write') || (refusalkind === 'camped') }
// VaultListing adds 'vault_gone' and 'vault_mismatch'; BoxListing adds 'absent_box'
```

**Gallant:** `isOwnRow` already answers exactly that question, about the row itself.

```ts
if ((stored !== null) && this.isOwnRow(stored)) { /* deliver it */ }
```

**Goofus:** the same object spelled out, in the file that has the helper for it.

```ts
const asked = { ...this.scope, vault_tok: this.vault_tok }
```

**Gallant:**

```ts
const asked = this.#stampOfLife()
```

**Goofus:** `#edit` writes out the next revision by hand, though `VS.nextRevisionOf` makes it. See `#one-test-one-place`.

*Status: Fixed.*

## One test, one place `#one-test-one-place`

When the same question is answered in several places, one of them will drift. A parameter threaded through a pipeline only to
reach a final `if` is usually that test in the wrong place.

**Goofus:** the `ifAbsent` test appears in `#deliverGood`, in `Storable.fetch` and in `BoxListing.get`, and `deliver` takes a
parameter only to serve it.

```ts
if (ifAbsent === 'fail') {
  if (thing === null) { throw this.nothingStoredError(scope) }
  thing.demandPresent()
}
return (ifAbsent === 'nil' && thing?.isPresent !== true) ? null : thing
```

**Gallant:** one `handleIfAbsent`, called by whoever is asking. `deliver` and `hydrate` take no `ifAbsent`.

```ts
return this.handleIfAbsent(await held.hydrate(timely), scoped, ifAbsent)
```

**Goofus again:** `receive` asks whether the answer is older, right after `reconcileCentral` compared the same two revisions and said.

```ts
const { central } = this.reconcileCentral(answer, this.classifyRecordShape(answer))
const older = cmpRevisions(this.#central, answer) === 'older'
```

**Gallant again:**

```ts
const { central, policy } = this.reconcileCentral(answer, this.classifyRecordShape(answer))
```

**Goofus a third time:** `#edit` asks whether this is a birthday four times in one record.

```ts
const isBirthday = this.isTombstoneRecord(prior)
const sidecarGiven = sidecar ?? (isBirthday ? {} : this.demandFullProps().sidecar)
const whisperGiven = whisper ?? (isBirthday ? { val: {} } : await this.#keptWhisper())
const written_at = this.world.clock.now()
const record = await sealedRecordOf(this.world, {
  ...prior,
  revision_tok:  randomId(),
  revision_seq:  prior.revision_seq + 1,
  registered_at: isBirthday ? written_at : prior.registered_at,
  written_at,
  box_tok:       isBirthday ? makeLifeTok() : prior.box_tok,
  am:            'a',
}, sidecarGiven, whisperGiven)
```

**Gallant a third time:** one test, and each arm says all it means. The test stays in `#edit`, not `puttable`: `box.put` can be called
on a box directly, and only `#edit` runs after the refresh, so only it knows what the put goes over.

```ts
const next = { ...prior, ...VS.nextRevisionOf(prior, written_at), am: 'a' as const }
const record = this.isTombstoneRecord(prior)
  ? await sealedRecordOf(this.world, { ...next, registered_at: written_at, box_tok: makeLifeTok() }, sidecar ?? {}, whisper ?? { val: {} })
  : await sealedRecordOf(this.world, next, sidecar ?? this.demandFullProps().sidecar, whisper ?? await this.#keptWhisper())
```

**Not this fault:** `Storable.fetch` keeps its own `ifAbsent` test, as it answers the thing rather than found-or-null.

*Status: `deliver`, `BoxListing.get`, `receive`, `#edit`, Fixed.*

## Use what you parsed `#use-what-you-parse`

A parse whose result is discarded means either the check is in the wrong place, or the checker gives you something you can't
use. Either way, fix that rather than parse and ignore.

**Goofus:** the constructor parses, ignores the result, and applies defaults by hand. It has to: a zod `obj` hands back a *copy*
of each duck, and a class instance's copy has lost its methods.

```ts
MSX.bankOpts.parse(opts)
const { applabel, user_id, device_id = randomId(), vaultDB, deviceDB, keyDeriver, clock = wallClock, logger = DefaultLogger /* ... */ } = opts
```

The listings' constructors do the same with `MSX.listingOpts`, `MSX.vaultListingOpts` and `MSX.boxListingOpts`.

**Gallant:** ducks are checked by identity, as `VX.strengthChecker`'s `custom` already is. Defaults live in the checker, and the
constructor reads the result.

**Goofus again:** parsed and discarded, then checked again by the two calls below it.

```ts
MSX.boxPut.parse(patch, { advice: Phrases.BoxPatchAdvice })
return this.boxListing.puttable({ ...patch, ...this.scope }, opts).put(patch, opts)
```

*Status: `boxPut`, Fixed. `bankOpts` and the listings' opts, Planned, Thread 2.*

---

# Shapes and state

## Never hold a value you made up `#no-fake-values`

A placeholder that looks real gets read as real. If you don't have the value yet, get it first, or ask for it.

**Goofus:** `bank.device_id` and the snapshot show a random id that was never stored, then change once `hello` lands. A second
page's id is thrown away, and a host's own id silently loses to a stored one.

```ts
const { device_id = randomId() /* ... */ } = opts
// later, in hello:
const { act, record } = await this.deviceDB.cacheDeviceRecord({ ...this.scope, device_id: this.#device_id })
this.#device_id = record.device_id
```

**Gallant:** see `#ask-the-host`.

*Status: Planned, Thread 2.*

## A sentinel is one stable value `#stable-sentinels`

A "nothing here" value should be the same every time, and say so on sight. A random one makes every comparison a special case.

**Goofus:** each new instance gets a random tok at seq -1, so `build(sentinel)` throws one-revision-two-toks, and `priorOf` has to
translate it back before any verb can use it.

```ts
#neverStoredOf(sparse) { return { ...sparse, revision_tok: randomId(), revision_seq: NeverStoredSeq, am: 'x' } }
const priorOf = (ante) => ((ante === null || ante.revision_seq === NeverStoredSeq) ? VS.NeverStored : VS.revisionOf(ante))
```

**Gallant:**

```ts
export const VoidRevisionTok = '00000000-0000-0000-0000-000000000000'
export const VoidRevisionSeq = -1
export const VoidTime = 1_218_182_888_777   // 2008-08-08T08:08:08.777Z
```

*Status: Fixed.*

## If it's the host's, ask the host `#ask-the-host`

Before building machinery to work out a value, ask whether the caller can simply be asked for it. Count what that machinery
actually costs: here, a store, a row kind, an async factory and a bad-news path, for a value nothing reads back.

**Goofus:** a candidate minted in the constructor and a first-wins row in the deviceDB, in the code. Then, proposed and dropped, a
pull when a wayin is minted, and this async `Bank.build`.

```ts
static async build(opts) {
  MSX.bankBuildOpts.parse(opts)
  const { act, record } = await opts.deviceDB.cacheBank(opts)
  const bank = Bank.make({ ...opts, device_id: record.device_id })
  if (act === 'rewrote') { bank.vaults.tellBadNews([bankRowRewritten()]) }
  return bank
}
```

**Gallant:** `device_id` is a required option of a synchronous `Bank.make`, and the deviceDB serves leases alone. The option's doc
block carries what the mint used to guarantee: a random id, never drawn from anything about the device or the user, as it sits in
the clear on every wayin.

*Status: Planned, Thread 2.*

## A wrapper needs a job `#no-wrapper-without-a-job`

When a rule changes, go looking for what existed only to serve the old rule. A wrapper every caller must construct and unwrap
needs a reason.

**Goofus:** whispers were any JSON value, so each sits in a `{ val }` holder, which every caller writes and the ciphertext stores.

```ts
box.put({ whisper: { val: { a: 7 } } })   // seals '{"val":{"a":7}}'
box.put({ whisper: { val: 7 } })          // accepted
box.put({ whisper: { a: 7 } })            // refused
```

**Gallant:** a whisper is a plain object, as a sidecar is, and a patch names its fields.

```ts
box.put({ whisper: { a: 7 } })            // seals '{"a":7}'
box.put({ whisper: 7 })                   // refused 'bad_option'
```

**Goofus again:** `Settled` promises refusals for the host, and nothing ever puts one in it. Every `receive` and `settle` answers an
empty `badnews`, and every caller still reads it.

```ts
settle() {
  this.#replaceSnapshot()
  return { badnews: [] }
}
```

**Gallant again:** `settle` and `receive` answer nothing, and `Settled.badnews` goes.

**Goofus a third time:** a one-line precondition spread across three methods and a listing verb with a birth-only name.

```ts
// Vault.launchBirth
const prior = listing.demandBirthSlot(checked) ?? VS.VoidRevision

// VaultListing
demandBirthSlot(scope) {
  this.demandEnabled()
  const held = this.at(scope)
  if (held?.isPresent === true) { throw alreadyHeldError() }
  return held
}
ensureVault(record, prior) { return this.put(record, { prior, ifAbsent: 'add', ifPresent: 'get' }) }
```

**Gallant a third time:** the precondition sits where the birth starts, and the birth calls `put`.

```ts
// Vault.launchBirth
listing.demandEnabled()
const held = listing.at(checked)
if (held?.isPresent === true) { throw alreadyHeldError() }
const prior = VS.revisionOf(held ?? VS.VoidRevision)
```

*Status: the whisper, Planned, Thread 1b. `Settled.badnews`, Planned, Thread 4. `demandBirthSlot`, Fixed.*

## A boolean says the positive `#say-the-positive`

Every read of a negative boolean is a double negative, and guards read worst of all: `selfDestructPreventionDisabled`. A name that says
what a guard doesn't check misleads too: when the vault's check is widened, widen `demandEnabled`, rather than add `demandUsable` beside it.

**Goofus:**

```ts
#isDisabled = false
if (! this.#isDisabled) { this.settle() }

demandUsable(): this { return this.demandEnabled().demandPresent() }
demandBoxesUsable(): this { return this.demandUsable().demandUnlocked() }     // the vault, holding logic about boxes
```

**Gallant:**

```ts
#isEnabled = true
if (this.#isEnabled) { this.settle() }

override demandEnabled(): this {
  super.demandEnabled()
  return this.demandPresent()
}
```

*Status: Fixed.*

---

# Words

## A doc block says purpose, not process `#purpose-not-process`

One or two 120-character lines: what it is or does, for its caller. Never how it works, why it's built that way, what it replaced,
or what a later line relies on. "As", "so", "once", "since", "no longer", "still" and "rather than" usually mark a failure.
A method that won't describe in a line is a smell: report it. STYLE.md, *Comments and doc blocks*, has the rule.

| Goofus | Gallant |
|---|---|
| A void box held under `scope`, timely as it received its own void revision, so a put on it fetches nothing. | A timely tombstoned box listed at `scope`. |
| The instance held under `scope`, once it hears that storage holds nothing there; null where none is held, as nothing is made of an absence. | Handle an impossible situation: VaultDB reports an empty row whereas we have an instance at `scope`.\nPass the null to held.receive, share the bad news and settle |
| The next record `patch` makes of the record in hand on entry, sealed and not yet stored, with that revision it was sealed over. | A sealed uncommitted record for the `patch`, with the `prior` revision bag proving it is next in sequence. |
| Fetch this vault with what its get lists: a timely vault, its boxes held sparse, its damaged rows set aside, and the box listing's watch started. No box verb needs it; the host runs it for the list and the pushes. | List this vault's boxes and start its watch. |
| The lock first, as it is synchronous and safe: no box opens under a lease while the tombstone goes out. The tombstone's answer, delivered, vacates the boxes. | Lock this vault and store its tombstone; the answer delivered vacates its boxes. |

A reason worth keeping goes in a `//` comment above the doc block: `// The lock first: no box opens under a lease while the tombstone goes out.`

*Status: Fixed on the blocks #470 changed and the ones its review named. The rest of `models/` hasn't had a pass.*

---

# Reading the Coach

These two came from agents, not from the code, and each produced bad code that took several rounds to remove.

## A fact is not a ruling `#a-fact-is-not-a-ruling`

Don't promote something the Coach told you into a rule the Coach didn't make. Check the Coach's words before writing "ruled".

**Goofus:** "The change rate for the data is on the order of months to nevers" went into a plan as "Don't fetch to avoid a rare
refusal", and a worker built to it. Then the over-correction unmarked the void shell, which was wrong too.

**Gallant:** the actual ruling is narrower. A put demands timeliness as anything does, so a record past its horizon or only sparse
forces a refresh. A void shell is whole and timely, and its put fails stale if the slot isn't vacant.

## Don't overstretch a request `#dont-overstretch-a-request`

Do what was asked at the size it was asked. If a request reads as a universal rule, ask before applying it everywhere.

**Goofus:** the Coach asked for an adjacent `await ensureFoo(); demandFoo()` to sit on one line. An agent read it as "every demand
has an ensure", and added refreshes where a plain demand stood.

```ts
const exposed = await this.extractWhisper(opts)
await this.ensureExposable(); this.demandExposable()
```

**Gallant:**

```ts
const exposed = await this.extractWhisper(opts)
this.demandExposable()
```

*Status: Fixed.*
