# Goofus and Gallant

This file shows representative bad code from the models, what we did about it, and the principle it teaches. Each
principle has a hashtag to refer to in a review. The examples come from the `newput` work of November 2026, trimmed for
reading. They are real code, except where a pair says it was only proposed.

This file is for code review. Agents writing code learn these principles from the code around them, so the way to teach
them is to fix the code. When you review against this file:

* Skip anything marked *Planned*, unless you're reviewing that thread.
* Check a proposed fix against the plan before you offer it. This file teaches the faults, not the rulings, so a fix that follows
  the wording here can still undo something ruled.

**Status** covers the sites named, not the whole codebase, so a fault marked *Fixed* can still live elsewhere. *Fixed*
means merged, or on #470. *Planned* means ruled or proposed for a later thread in
`whiteboard/20261104-newput/newput-plan.md`, and not built. *Open* means a live case that has no thread and needs a ruling.

Contents:

* **Call chains:** `#straight-chute`, `#sugar-holds-no-logic`, `#no-bouncing`, `#own-your-form`, `#no-call-for-side-effects`, `#one-body-per-pair`, `#outcome-for-its-consumer`, `#offer-the-form-they-want`, `#one-catch-routes-the-news`
* **Guards and awaits:** `#ensure-works-demand-refuses`, `#guard-at-the-entrypoint`, `#chain-guards`, `#no-second-ensure`
* **Letting things fail:** `#the-backend-judges`, `#impossible-is-a-crash`, `#host-choices-cost-the-host`, `#edge-cases-dont-drive`, `#no-repair-in-normal-ops`
* **Reuse:** `#use-the-helper`, `#one-test-one-place`, `#use-what-you-parse`
* **Shapes and state:** `#no-fake-values`, `#stable-sentinels`, `#ask-the-host`, `#no-wrapper-without-a-job`, `#say-the-positive`
* **Words:** `#purpose-not-path`, `#purpose-not-machinery`, `#no-refusal-catalog`, `#say-what-to-do`, `#say-the-guarantee`, `#a-helper-gets-a-phrase`, `#its-name-is-its-doc`
* **Reading the Coach:** `#a-fact-is-not-a-ruling`, `#dont-overstretch-a-request`

---

# Call chains

## One way in `#straight-chute`

Each operation has one route from its entry point to storage. A method that branches on how the caller got there is
doing someone else's job. The state the object already has should make the branch unnecessary.

**Goofus:** birth and update are two paths, each minting a `box_tok`, setting `registered_at` and sealing.

```ts
// BoxListing
async create(input, opts = {}) {
  const dna = boxDna.parse(input)
  await this.#ensureCreatable(); this.#demandCreatable()
  this.demandNotListed(dna)
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

**Goofus still:** `delBox` has the shape `getBox` had: a `held` branch, its own ensure and demand, and a sentinel, because
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
async beginWatch() {
  const listed = await this.listing.fetchListed(this)      // VaultListing fetches, delivers back to this vault
  this.demandUsable()
  await this.boxListing.hello(listed)                      // made by this.listing.boxListingOf(this)
  return this
}
```

**Gallant:** the box listing gets its own list, and the vault's row arrives as `parent`, as on every other box answer.

```ts
// Vault
beginWatch() { return this.boxes.hello() }                 // BoxListing: the watch, then refresh()
```

*Status: Planned, Thread 2.*

## Whoever owns the form builds it `#own-your-form`

Don't have a middleman assemble another class's record, and don't let it overrule what the caller said. It's only there
to route.

**Goofus:** the listing assembles a tombstone inline, and swaps the revision the caller named for the one it has, so a
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
it reaches the bankDB. The duck's revision is the prior, and any duck will do.

```ts
bankDB.delBox(duck)   // an instance, a record, or { ...scope, vault_tok, ...revision }
```

`put` can't do this: the stamp binds the revision to the ciphertext, so the sealer has to choose the next revision itself.

*Status: Planned, Thread 3.*

## Don't call a method for its side effect `#no-call-for-side-effects`

If you throw away the return value, you wanted something else. Name it, or put it where it belongs.

**Goofus:** `puttable` finds or makes an instance. `box.put` calls it only for its two throws, and discards the instance.
It runs before the refresh, so those throws judge a stale record, and it can plant a shell by accident.

```ts
async put(patch, opts = {}) {
  const { ifAbsent = 'add', ifPresent = 'repl', ...timely } = MSX.boxPutOpts.parse(opts)
  this.listing.puttable({ ...patch, ...this.scope }, { ifAbsent, ifPresent })
  await this.ensurePuttable(timely); const given = this.demandPuttable(patch)
```

**Goofus again:** `valOf` here runs only so that it throws. `demandGood(hello)` says so.

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

**Gallant again:** a single parse sits where its result is used, so every route gets it and `build` has nothing left to do.

```ts
protected buildOrReceive(record) {
  this.demandEnabled()
  const sparse = this.sparseOf(record)
  const held = this.at(this.scopeOf(sparse))
```

*Status: `box.put`, `listing.build`, Fixed. `device.ensureBank`, Planned, Thread 2.*

## A try pair has one body `#one-body-per-pair`

Work out which half is easier to write, the throwing form or the try form. That half has the body, and the other is one
line that wraps it. A method whose `Outcome` carries `meta` has its body on the try side.

**Goofus:** the throwing form unwraps an Outcome, the try form wraps it again, and the only caller takes it apart a third time.

```ts
async cache() {
  if (this.#isFromCache) { return }
  valOf(await this.#friend.tryCacheLease(this.#demandRecord()))
}
tryCache() { return outcomeOf(() => this.cache()) }
async cacheAsCacheCan() {
  const cached = await this.tryCache()
  if (! cached.ok) { this.#friend.tellBadNews([cached.err]) }
}
```

**Gallant:** one method, working directly. Where there are two forms, one has the body and the other wraps it.

```ts
async cacheAsCacheCan() {
  if (this.#isFromCache) { return }
  const cached = await this.#friend.tryCacheLease(this.#demandRecord())
  if (! cached.ok) { this.#friend.tellBadNews([cached.err]) }
}

async getBox(boxlabel, opts = {}) { return this.boxListing.get({ ...this.scope, boxlabel }, opts) }
tryGetBox(boxlabel, opts = {}) { return outcomeOf(() => this.getBox(boxlabel, opts)) }
```

## Make an outcome only for someone who wants one `#outcome-for-its-consumer`

`outcomeOf` is for a function that returns an `Outcome`, or whose immediate consumer needs one. An outcome made and unmade
on the spot, possibly across methods, is a try/catch in disguise: write the try/catch. `valOf` is for an outcome's value. To
throw a bad outcome and discard the answer, use `demandGood`.

**Goofus:** an outcome built only to be unbuilt, and a `valOf` whose value nobody takes.

```ts
valOf(await outcomeOf(() => unwrapKeyUnder(this.#wayinKey, wrapped, ctx, CheckUsage), wrongProof))

const hello = await outcomeOf(() => this.#bringUp())
this.#announce({ kind: 'helloed', outcome: hello })
valOf(hello)
```

**Gallant:** the catch says what it traps. The announce wants the outcome, so `outcomeOf` stays, and `demandGood` throws it.

```ts
try {
  await unwrapKeyUnder(this.#wayinKey, wrapped, ctx, CheckUsage)
} catch {
  throw wrongProof()
}

const hello = await outcomeOf(() => this.#bringUp())
this.#announce({ kind: 'helloed', outcome: hello })
demandGood(hello)
```

## Offer the form your callers want `#offer-the-form-they-want`

An interface of our own, a friend above all, has one form of each verb: the one its callers use. If every caller unwraps it,
it is the wrong form.

**Goofus:** each caller of the friend's verb turns its Outcome back into a throw.

```ts
tryForgetLease: () => deviceDB.tryForget(asked),   // the friend
valOf(await this.#friend.tryForgetLease())         // a caller, and every other
```

**Gallant:**

```ts
forgetLease: () => deviceDB.forget(asked),
await this.#friend.forgetLease()
```

## One catch routes the news `#one-catch-routes-the-news`

Several steps that each tell bad news and return bury the path that works. Throw from the steps, and route the refusal to
bad news in one catch. A throw that is no refusal is a bug, and goes on through. Say each condition on its own line, where
each has its own answer.

**Goofus:** two conditions with different answers share a branch, and every refusal has its own exit.

```ts
if (! peeked.ok) {
  friend.tellBadNews([peeked.err])
  return null
}
if (checked.data.gate_tok !== cited.gate_tok || ! consistent(bankStamp.parse(checked.data), bankStamp.parse(friend))) {
  await forgetOutdated(friend)
  return null
}
```

**Gallant:** an outdated row is ordinary and says nothing. A row of another stamp is news.

```ts
try {
  const peeked = await friend.peekLease()
  if (peeked === null) { return null }
  // ...
  if (checked.data.gate_tok !== cited.gate_tok) {
    await forgetOutdated(friend)
    return null
  }
  if (! consistent(bankStamp.parse(checked.data), bankStamp.parse(friend))) {
    await forgetOutdated(friend)
    throw damagedLease()
  }
  return new Lease(friend, checked.data, true)
} catch (err) {
  if (! isVaultError(err)) { throw err }
  friend.tellBadNews([err])
  return null
}
```

---

# Guards and awaits

## Ensure does the work, demand refuses `#ensure-works-demand-refuses`

`ensureFoo` does the work if it's needed, and refuses nothing of its own. The caller demands, synchronously, with no `await`
before the critical call. When an awaited promise resolves, other waiters can run first, a `lock()` among them, so a demand
inside the `ensure` is stale by the time the caller resumes.

**Goofus:** a probe stepping `lock()` through the microtask ticks found the delete reaching the bankDB after the lock, at
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

**Enabled is a special guard:** one check is enough. The code that ends a listing is synchronous: it disables the
listing, disables every thing in it, and removes them, so nothing crosses it halfway. The only check after storage answers is at
the top of `deliver`, before it takes the answer's parent.

```ts
protected async deliver(answer) {
  this.demandEnabled()
  if (answer.parent !== null) { this.receiveParent(answer.parent) }
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
nothing, and the only cost is that a caller's looser `maxWorldMillis` can still earn a refresh. We leave them.

*Status: Fixed.*

---

# Letting things fail

## The backend judges `#the-backend-judges`

In a revisioned CAS model the bankDB is the ground truth. A local check that repeats its judgment adds a second, staler
opinion, with a refusal that doesn't carry the frontier.

**Goofus:**

```ts
protected demandNotListed(scope) {
  if (this.at(scope) !== null) { throw alreadyListedError() }
}
```

**Gallant:** delete it. A `create` over a live box refuses `camped`, and over a stored, unlisted box `stale_write`, each with
the row that was in the way.

**Goofus again:** `demandPuttable` refused over a local tombstone under `ifAbsent: 'fail'`, though the bankDB is told `ifAbsent` too. Over a
box reborn elsewhere, the local check said absent, where the bankDB's `stale_write` delivers the frontier.

```ts
if (ifAbsent === 'fail') { this.demandPresent() }
```

**Gallant again:** delete it, and the bankDB's `absent_box` or `stale_write` answers.

**Not this fault:** a birth's refusal of a vault the bank already has. No backend has been asked yet, and the refusal spares the user a
passphrase dialog and a KDF that could only fail.

*Status: Fixed.*

## The impossible is one line `#impossible-is-a-crash`

A branch the types force and only a broken system reaches is one line: `throw`. If it wants a second line, stop and flag it.
Never `!` or a cast, which is what a host's own bankDB adapter gets to crash through. No row, no FIXME, and no reviewer asking
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

**Gallant:** no `#isGreeted`. A host that skips `vault.beginWatch` has no list and no pushes, and `vault.delBox` on a box it doesn't
have fails stale, with the frontier delivered. The host chose that.

*Status: Fixed.*

## Edge cases don't drive the bus `#edge-cases-dont-drive`

Before fixing an edge case, trace who actually reaches it, and what the fix costs everyone else. A special case that names a
sentinel is a smell. So is a fix that changes behaviour for cases the bug never touched.

**Goofus:** a shell left by a refused put made `get` return absent, so a reviewer taught `get` about void revisions.

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

## Normal operations don't do repairs `#no-repair-in-normal-ops`

Normal operations don't perform repairs or remediation when the system is in an incoherent state. A repair gets its own narrow
verb, which looks only at what's broken and refuses otherwise.

**Goofus:** `delBox` that also deletes a damaged row, if it finds one.

```ts
async delBox(boxlabel: string, opts: TimelyOpts = {}): Promise<Box | null> {
  const timely = MSX.timelyOpts.parse(opts)
  const boxes = this.boxListing
  const scope = boxes.scopeOf({ ...this.scope, boxlabel })
  this.demandUnlocked()
  const held = boxes.at(scope)
  if (held !== null) { return held.del(timely) }
  await this.ensureTimely(timely.maxWorldMillis); this.demandUnlocked()
  return boxes.del(boxes.damagedAt(scope) ?? VS.sentinelBoxOf(scope, this.vault_tok))
}
```

**Gallant:** `delBox` treats a damaged row as missing. `tryDelDamagedBox` looks only in the damaged rows, and refuses if the
box is healthy or not listed. It has only the try form, which says so.

```ts
async delBox(boxlabel: string, opts: TimelyOpts = {}): Promise<Box | null> {
  /* ... as above ... */
  return boxes.del(VS.sentinelBoxOf(scope, this.vault_tok))
}

tryDelDamagedBox(boxlabel: string, opts: TimelyOpts = {}): Promise<Outcome<Box | null>> {
  return outcomeOf(async () => { // this method does not offer a throwing (delDamagedBox) form
    const timely = MSX.timelyOpts.parse(opts)
    const boxes = this.boxListing
    const scope = boxes.scopeOf({ ...this.scope, boxlabel })
    this.demandUnlocked()
    await this.ensureTimely(timely.maxWorldMillis); this.demandUnlocked()
    const damaged = boxes.damagedAt(scope)
    if (damaged === null) { throw absentDamagedBoxError(scope) }
    return boxes.del(damaged)
  })
}
```

The two aren't DRYed: each is short, and they should be free to differ. A damaged row with no readable revision is the only
exception today: storage can't tell it from `delBox`'s sentinel. Thread 3 owns that case.

*Status: Fixed.*

---

# Reuse

## Look before you write `#use-the-helper`

Search `src/helpers/validator.ts` and the module's helpers before writing anything small. The pull to write it again is
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
// VaultListing adds 'vault_gone' and 'vault_reborn'; BoxListing adds 'absent_box'
```

**Gallant:** `isOwnRow` already decides exactly that question, about the row itself.

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

**Goofus again:** `receive` asks whether the answer is older, right after `reconcileCentral` compared the same two revisions.

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

**Not this fault:** `Storable.fetch` keeps its own `ifAbsent` test, because it returns the thing itself rather than found-or-null.

*Status: `deliver`, `BoxListing.get`, `receive`, `#edit`, Fixed.*

## Use what you parsed `#use-what-you-parse`

A parse whose result is discarded means either the check is in the wrong place, or the checker gives you something you can't
use. Either way, fix that rather than parse and ignore.

**Goofus:** the constructor parses, ignores the result, and applies defaults by hand. It has to: a zod `obj` hands back a *copy*
of each duck, and a class instance's copy has lost its methods.

```ts
MSX.bankOpts.parse(opts)
const { user_id, banklabel, device_tok = randomId(), bankDB, deviceDB, keyDeriver, clock = wallClock, logger = DefaultLogger /* ... */ } = opts
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

**Goofus:** `bank.device_tok` and the snapshot show a random id that was never stored, then change once `hello` resolves. A second
page's id is thrown away, and a host's own id silently loses to a stored one.

```ts
const { device_tok = randomId() /* ... */ } = opts
// later, in hello:
const { act, record } = await this.deviceDB.cacheDeviceRecord({ ...this.scope, device_tok: this.#device_tok })
this.#device_tok = record.device_tok
```

**Gallant:** see `#ask-the-host`.

*Status: Planned, Thread 2.*

## A sentinel is one stable value `#stable-sentinels`

A "nothing here" value should be the same every time, and say so on sight. A random one makes every comparison a special case.

**Goofus:** each new instance gets a random tok at seq -1, so `build(sentinel)` throws one-revision-two-toks, and `priorOf` has to
translate it back before any verb can use it.

```ts
#neverStoredOf(sparse) { return { ...sparse, revision_tok: randomId(), revision_seq: NeverStoredSeq, am: 'x' } }
function priorOf(ante) { return (ante === null || ante.revision_seq === NeverStoredSeq) ? VS.NeverStored : VS.revisionOf(ante) }
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
actually costs: here, a datastore, a row kind, an async factory and a bad-news path, for a value nothing reads back.

**Goofus:** in the code, a candidate minted in the constructor and a first-wins row in the deviceDB. Then, proposed and dropped, a
pull when a wayin is minted, and this async `Bank.build`.

```ts
static async build(opts) {
  MSX.bankBuildOpts.parse(opts)
  const { act, record } = await opts.deviceDB.cacheBank(opts)
  const bank = Bank.make({ ...opts, device_tok: record.device_tok })
  if (act === 'rewrote') { bank.vaults.tellBadNews([bankRowRewritten()]) }
  return bank
}
```

**Gallant:** `device_tok` is a required option of a synchronous `Bank.make`, and the deviceDB serves leases alone. The option's doc
block carries what the mint used to guarantee: a random id, never drawn from anything about the device or the user, because it is
stored unencrypted on every wayin.

*Status: Planned, Thread 2.*

## A wrapper needs a job `#no-wrapper-without-a-job`

When a rule changes, go looking for what existed only to serve the old rule. A wrapper every caller must construct and unwrap
needs a reason.

**Goofus:** whispers were any JSON value, so each sits in a `{ val }` wrapper, which every caller writes and the ciphertext stores.

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

**Goofus again:** `Aligned` promises refusals for the host, and nothing ever puts one in it. Every `receive` and `align` returns an
empty `badnews`, and every caller still reads it.

```ts
align() {
  this.#replaceSnapshot()
  return { badnews: [] }
}
```

**Gallant again:** `align` and `receive` return nothing, and `Aligned.badnews` goes.

**Goofus a third time:** a one-line precondition spread across three methods and a listing verb with a birth-only name.

```ts
// Vault.launchBirth
const prior = listing.demandBirthSlot(checked) ?? VS.VoidRevision

// VaultListing
demandBirthSlot(scope) {
  this.demandEnabled()
  const listed = this.at(scope)
  if (listed?.isPresent === true) { throw alreadyListedError() }
  return listed
}
ensureVault(record, prior) { return this.put(record, { prior, ifAbsent: 'add', ifPresent: 'get' }) }
```

**Gallant a third time:** the precondition sits where the birth starts, and the birth calls `put`.

```ts
// Vault.launchBirth
listing.demandEnabled()
const listed = listing.at(checked)
if (listed?.isPresent === true) { throw alreadyListedError() }
const prior = VS.revisionOf(listed ?? VS.VoidRevision)
```

*Status: the whisper, Planned, Thread 1b. `Aligned.badnews`, Planned, Thread 4. `demandBirthSlot`, Fixed.*

## A boolean says the positive `#say-the-positive`

Every read of a negative boolean is a double negative, and guards read worst of all: `selfDestructPreventionDisabled`.

**Goofus:**

```ts
#isDisabled = false
if (! this.#isDisabled) { this.align() }

demandEnabled(): this { if (this.#isDisabled) { throw disabledError() } return this }
```

**Gallant:**

```ts
#isEnabled = true
if (this.#isEnabled) { this.align() }

demandEnabled():    this { if (! this.#isEnabled) { throw disabledError() } return this }
```

## Guards chain to the caller or the receiver `#chain-guards`

A guard name should either match a direct attribute of the receiver or match (with +able) the step its callers share. The first tests one thing, and the second chains such tests.

**Goofus:**

```ts
demandUsable(): this { return this.demandEnabled().demandPresent() }          // usable for who knows what?
demandBoxesUsable(): this { return this.demandUsable().demandUnlocked() }     // the vault, holding logic about boxes
```

**Gallant:**

```ts
demandEnabled():    this { if (! this.#isEnabled) { throw disabledError() } return this } // one test, direct
demandPromptable(): this { return this.demandEnabled().demandPresent() }                  // one recipe, chained
// demandBoxesUsable -- moved to Box and renamed for its callers                          // belongs near callers, as per its name
```

---

# Words

## A doc block has no past `#purpose-not-path`

How the code came to be is not the caller's business: the decision behind a shape, the request that produced it, what it
replaced, which thread ruled. "As", "so", "since", "rather than", "no longer" and "still" usually mark it. A reason worth
keeping goes in a `//` comment above the doc block: `// The lock first: no box opens under a lease while the tombstone goes out.`

| Goofus | Gallant |
|---|---|
| The lock first, as it is synchronous and safe: no box opens under a lease while the tombstone goes out. The tombstone's answer, delivered, vacates the boxes. | Lock this vault and store its tombstone. Its boxes are vacated once storage answers. |
| Fetch this vault with what its get lists: a timely vault, its boxes held sparse, its damaged rows set aside, and the box listing's watch started. No box verb needs it; the host runs it for the list and the pushes. | List this vault's boxes and start its watch. |

These come from the old tree (`packages/safebyok-old/src`, removed 2026-11-10), and the Gallant column is proposed, not the Coach's. The
Goofuses show a decision given as its reason, the project rule the code follows echoed as its doc, and a look ahead.

| Goofus | Gallant, proposed |
|---|---|
| A verdict that admits, frozen so that a checker may share it. | A passing verdict. *(above it: `// Frozen: a checker may share it.`)* |
| `Checkers`, `Checker` and `objCheck`, where every validator is made, and the {@link Kit} its builders are handed; and `consistent`, `demandConsistent` and `verifyConsistent`, which hold one bag to another, as a validator's `parseConsistent` does. | The validator builders, `Checkers`, `Checker` and `objCheck`, and the `consistent` family, which checks one bag against another. |
| Which generation of the whisper's own shape this box holds: 1, the only one so far. | Which generation of the whisper's own shape this box holds. |

## A doc block does not read the body aloud `#purpose-not-machinery`

What it is or does, for its caller, never how it works: the steps, their order, what a later line relies on, what a refusal
leaves behind. "Once", "which" and a participle pile usually mark it. A method that won't describe in a line is a smell:
report it.

| Goofus | Gallant |
|---|---|
| A void box held under `scope`, timely as it received its own void revision, so a put on it fetches nothing. | A timely tombstoned box listed at `scope`. |
| The instance held under `scope`, once it hears that storage holds nothing there; null where none is held, as nothing is made of an absence. | Handle an impossible situation: BankDB reports an empty row whereas we have an instance at `scope`.\nPass the null to held.receive, share the bad news and settle |
| The next record `patch` makes of the record in hand on entry, sealed and not yet stored, with that revision it was sealed over. | A sealed uncommitted record for the `patch`, with the `prior` revision bag proving it is next in sequence. |

*Status, both: Fixed on the blocks #470 changed and the ones its review named. The rest of `models/` hasn't had a pass.*

## Refusals are not a catalog `#no-refusal-catalog`

A block that lists each refusal kind with its condition is the method's throw sites read aloud: long, stale by the next guard,
and no use to a caller, who gets the kind from the error. Say the job on the first line. An option's values get a list, one
line each, the default marked. A term defined elsewhere ("sealed", "encrypted") gets a pointer, not a second definition.

**Goofus:**

```ts
/** Seal the box of `input`, under a `box_tok` fresh from {@link makeLifeTok}, and store it over no record; resolves the instance held once it lands. Refuses 'bad_option', naming the field, a dna that fails {@link boxDna}; 'bank_locked' while the vault is locked, the seal's end included; 'bad_option' a scope already held; and 'stale_write' where storage holds a record, delivered first, or what `opts.ifPresent` says of a live one. */
async create(input: BoxDna, opts: PutListingOpts = {}): Promise<Box>
```

**Gallant:**

```ts
/** Create a new box for whisper (encrypted) and sidecar (readable), sealed against the box metadata
 * @see `sealedRecordOf` in models/box.ts for what "encrypted" and "sealed" imply
 * - `ifPresent:fail` (default): replace a void/tombstoned box, else fail
 * - `ifPresent:repl` replaces (if in correct sequence);
 * - `ifPresent:get`  returns an existing box
 */
async create(input: BoxDna, opts: BoxCreateOpts = {}): Promise<Box>
```

**Goofus again:** a guard as a catalog, with a pointer to the ensure that cures one entry.

```ts
/** Throws unless unlocked with a full, healthy record: refuses 'bank_locked', 'absent_box' for a box gone, or 'bad_option' for a sparse record not yet filled, which `ensureReadyToUnsealWhisper` fetches first. */
demandReadyToUnsealWhisper(): this
```

**Gallant again:** a guard names the predicates it asks, each linked. The kinds follow from them.

```ts
/** throw unless {@link isEnabled}, unlocked, {@link isPresent}, {@link isFull} */
demandUnsealable(): this
```

*Status: Planned, the documentarian run on `models/`. #498 carries a stripped one-liner on each.*

## Say what to do, not what gets refused `#say-what-to-do`

"Refuses before ready" hands the caller a state they can't act on. "Precede with `await device.ensureBank()`" hands them the call.
A block written for its caller names the call to make before and the call to make after, and bolds the word that would
surprise them.

**Goofus:**

```ts
/** The vault listed for `bag`, a tombstone among them, or null. Refuses before ready. */
vaultOf(bag: VaultBag): Vault | null
```

**Gallant:**

```ts
/** Vault **or tombstone** listed at `scope`, null if absent.
 * Precede with await device.ensureBank(), repeated to force a refresh; then .hydrate() on the vault answered makes it timely
 */
vaultAt(scope: BankedVaultScope): Vault | null
```

*Status: Planned, the documentarian run. The rename is on #498; the block there still reads as the Goofus's first sentence.*

## The line worth writing is the guarantee `#say-the-guarantee`

The signature can't tell a caller what the call proves, and a security reviewer opens the block for exactly that. A line spent
on the `WhisperHolder`'s shape, with the refusals pointed at another method, leaves it unsaid.

**Goofus:**

```ts
/** The timely stored whisper, as its frozen {@link WhisperHolder} `{ val }`, keeping nothing on the instance. Refuses as `demandReadyToUnsealWhisper` does. */
async extractWhisper(opts: TimelyOpts = {}): Promise<WhisperHolder>
```

**Gallant:**

```ts
/** The timely stored whisper object. Extracting the whisper authenticates that the object, all but its sidecar, has not been modified since it was sealed */
async extractWhisper(opts: TimelyOpts = {}): Promise<Whisper>
```

*Status: Planned, the documentarian run. #498 still carries the Goofus's first sentence; the `Whisper` return is #499's.*

## A private helper gets a phrase `#a-helper-gets-a-phrase`

A private helper trusts its exported caller, and its block does too: it says what the helper returns, in a phrase. The verbs it
calls and the refusals it can meet belong to the exported method that owns them, and are said there, once.

**Goofus:**

```ts
/** The whisper of `record`, opened through the vault's seal verbs and held to {@link whisperHolder}; one that opens to anything else refuses 'damaged_whisper'. */
async #unseal(record: BoxRecord): Promise<WhisperHolder>
```

**Gallant:**

```ts
/** The whisper of `record` */
async #unseal(record: BoxRecord): Promise<Whisper>
```

*Status: Planned, the documentarian run. #498 carries the Goofus minus its last clause.*

---

## The best name is its own doc `#its-name-is-its-doc`

A name that says what the thing is needs no doc line beside it. When the doc line is longer than the name, and the
name could have said it, rename. The Coach wrote this pair, on an option of `objCheck` (merged as PR #510).

**Goofus:**

```ts
> `refuseAs` -- the *[refusal]* kind thrown (default: 'bad_record')
```

**Gallant:**

```ts
> `refusalkind` -- (default: 'bad_record')
```

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
