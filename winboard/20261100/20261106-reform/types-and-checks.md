# Types and checks: each thing defined once

An inventory of the core's types and checks in `packages/safebyok/src/` (models/, shapes/, storage/,
refusals/, helpers/), for the Coach's "We want each thing defined once." Read-only, on branch
`20261104-newdesign_plan` at d338712e9, 2026-11-06. Line numbers are that commit's.

Prefixes as the code imports them: `CX` shapes-core.ts, `SX` shapes-storage.ts, `GX`
shapes-gateish.ts, `VX` shapes-vaultish.ts.

## Headlines

* **Each world is defined three times**: a handrolled type, an inline `obj` in its listing's options
  check, and the class that plays it. The three disagree. `VaultWorld` (VX:361) has `scope` and
  `boxRefreshMillis`; `vaultListingOpts` (VX:356) checks neither. `BoxWorld` (VX:312) has
  `demandUnlocked`; `boxListingOpts` (VX:307) does not check it.
* **Cmd-click on `vault.world.scope` lands on `VaultWorld.scope` (VX:362)**, never on Bank. Measured
  with the TypeScript language service (section 4). `Pick<Bank, 'scope'>` lands on the class.
* **The scopes are defined twice**: `CX.bankScope`/`vaultScope`/`boxscope` (refusing 'bad_scope',
  readonly) and `SX.bankScope`/`vaultScope`/`boxscope` (refusing 'bad_option', not readonly). Both
  files export `BankScope`, `VaultScope` and `Boxscope` types.
* **Two different types are named `LeaseSparse`**: `SX.LeaseSparse` (scope, `vault_tok`,
  `proved_at`) and `GX.LeaseSparse = LeaseStamp` (fmt, the vault stamp, `gate_epoch`, `proved_at`,
  `wayinkind`).
* **There are two clocks**: Bank's and VaultDB's, each a host option. 13 `.now()` sites read them;
  7 checkers and 3 types carry them. Section 2 recommends a module-level clock with a
  `_cheat_clock` backdoor.
* **Of the six dangerous host functions, only the logger is branded on the way in** (`parseLogger`,
  once, at Bank's constructor). The strength checker is wrapped per call; `requestCleartext`,
  `onPanic` and the key deriver are held raw on public props of Bank and guarded at each call site;
  `onPanic`'s guard is written twice.
* **`Z.infer` carries prop docs.** Hovering `leaseFriend.leaseMillis` shows the `/** */` written in
  the `objCheck` builder, and cmd-click lands on that builder line. So option (A) of section 4
  works, and is the default.

## 1. Defined-once table

"Inferred" says whether the type is `Z.infer` of the checker. "Second definition" names any other
place the same thing is described. "Concrete class?" answers whether the model should take the
class, checked by a cheap instance check, instead of a structural duck.

### The worlds and the options a model is constructed with

| Shape | Checker | Type | Inferred | Played by | Second definition | Concrete class? |
|---|---|---|---|---|---|---|
| `World` | `VX.world` (VX:138), strip, `clock` only | `World` (VX:141) | yes | Bank, Vault, as Storable's `world` | `clock` again in `listingOpts.world` (VX:164), `provingWorld` (GX:169), `leaseFriend` (GX:240) | Goes with the clock (section 2). Storable's `world` becomes `Bank \| Vault` by a type parameter. |
| `ListingWorld` | inline `obj` in `listingOpts.world` (VX:164) | handrolled (VX:144) | no | Bank, Vault | the inline `obj` lists the same five members as the type | `Pick<Bank \| Vault, 'lockState' \| 'ensureTimely' \| 'takeWorld' \| 'tellBadNews'>`, or `Listing` takes a `WorldT extends Bank \| Vault`. |
| `ListingOpts` | `VX.listingOpts` (VX:163), strict | handrolled (VX:153) | no | built by Bank (bank.ts:101) and `VaultListing.boxListingOf` (vault-listing.ts:49) | `maxMillisSinceRefresh` again in `storableOpts` (VX:110) | n/a. One `objCheck`, its `world` naming the premade world checker, type `Z.infer`. |
| `BoxWorld` | inline `obj` in `boxListingOpts.world` (VX:308) | handrolled (VX:312) | no | Vault (`implements BoxWorld`, vault.ts:30) | the inline check re-makes the vault scope as `obj({ applabel, user_id, vaultlabel })` instead of naming `CX.vaultScope`; tests fake it whole (models-world.ts:298) | Now: `Pick<Vault, ...>`. Later, if box tests move to a real vault: `world: Vault`. |
| `BoxListingOpts` | `VX.boxListingOpts` (VX:307), strip, `world` only | `ListingOpts & { world: BoxWorld }` (VX:321) | no | `VaultListing.boxListingOf` | not derived from `listingOpts`; BoxListing parses both (box-listing.ts:32, then `super`) | `listingOpts.extend({ world: boxWorld })`, strict, parsed once. |
| `VaultWorld` | inline `obj` in `vaultListingOpts.world` (VX:357) | handrolled (VX:361) | no | Bank (`implements VaultWorld`, bank.ts:27) | `onPanic`, `requestCleartext`, `deviceDB`, `logger` are typed again in `BankOpts` (VX:403), with other docs; `leaseMillis` is optional in the type, always set by Bank, and defaulted again in `Vault.#makeFriend` (vault.ts:251) | Now: `Pick<Bank, ...>`. Later: `world: Bank`. |
| `VaultListingOpts` | `VX.vaultListingOpts` (VX:356), strip, `world` only | `ListingOpts & { world: VaultWorld }` (VX:374) | no | Bank's constructor | not derived from `listingOpts`; VaultListing parses both (vault-listing.ts:36-37). The name says options; it checks only the world. | `listingOpts.extend({ world: vaultWorld })`, strict. |
| `ProvingWorld` | `GX.provingWorld` (GX:168) | `ProvingWorld` (GX:172) | yes | Bank, through `listing.world` (gating.ts:97) | spread into `vaultListingOpts.world`; parsed again in every proving static (5 sites, proving.ts:68-160) | `Pick<Bank, 'keyDeriver' \| 'strengthChecker' \| 'device_id'>` once the clock leaves. The check stays structural: 6 test files build a plain proving world (proving-world.ts). |
| `LeaseFriend` | `GX.leaseFriend` (GX:238), strip | `LeaseFriend` (GX:254) | yes, docs on 5 of 9 props | the plain object `Vault.#makeFriend` makes (vault.ts:250) | `clock`, `logger`, `leaseMillis` again from VaultWorld; the stamp from `vaultStamp.shape` | No. A friend is a plain object on purpose: no key, a narrow surface. Keep it; drop `clock`. |
| `GatingFriend` | `GX.gatingFriend` (GX:300), strip | `GatingFriend` (GX:305) | yes | the static `Vault.#gatingFriend` (vault.ts:232) | none | No. The model to copy. |
| `StorableOpts` | `VX.storableOpts` (VX:110) | `StorableOpts` (VX:131) | yes, prop doc | `{ maxMillisSinceRefresh }` from both listings' `makeThing` (vault-listing.ts:184, box-listing.ts:112) | `ListingOpts.maxMillisSinceRefresh` and `listingOpts` (VX:166) | Delete it. Every storable is made by its listing with the listing's own horizon, so Storable can read `listing.maxMillisSinceRefresh`. |
| storable's constructor args | `VX.storableArgs` (VX:179) | none: the constructor types each parameter | n/a | Storable (storable.ts:111) | `world` and `opts` as above | The `listing` field is already checked by brand (`isListing`, consts.ts:72): the precedent for the rest. |
| `BankOpts` | `VX.bankOpts` (VX:385), strict | handrolled (VX:403), exported from index.ts | no | the host | four fields typed again in VaultWorld and on Bank's props | n/a. Section 4, option (A). |

### The ducks and the other things a model is handed

| Shape | Checker | Type | Inferred | Played by | Second definition | Concrete class? |
|---|---|---|---|---|---|---|
| vaultDB duck | `VX.vaultDBDuck` (VX:160), seven verbs | the abstract class `VaultDB` (vault-db-new.ts:71) | no | every adapter subclasses VaultDB; every test fake subclasses `MemoryVaultDB` | the duck lists verbs the class defines | Yes, by a `Symbol.for` brand on `VaultDB`, not `instanceof`: an adapter lives in its own package and may bring another copy of safebyok. Free: only two refusal tests hand a plain object. |
| deviceDB duck | `VX.deviceDBDuck` (VX:353), three verbs | the abstract class `DeviceDB` (device-db-new.ts:15) | no | `MemoryDeviceDB` and test subclasses | checked in `bankOpts` and again in `vaultListingOpts.world` | Yes, the same brand. |
| `Clock` | `CX.clockShape` (CX:191) | handrolled (CX:185) | no | `wallClock` (CX:188) | `vaultDBOpts.clock` (SX:161) | Delete (section 2). |
| key deriver | `CX.keyDeriverShape` (CX:197) | `KeyDeriver` interface (deriver/basederiver.ts:6) | no | `argon2idWebV1Deriver`, `testDeriver` | `keyDeriverSpec` (deriver/shapes.ts) describes `key_deriver_label` and `salt_bytes` a third time | n/a: a host's interface. Section 4, option (B). |
| logger | `CX.loggerShape` (CX:206) | `VaultLogger` (helpers/logger.ts:27) | no | any host logger; `parseLogger` wraps it | checked again in `vaultListingOpts.world` and `leaseFriend`, after `parseLogger` guarded it | Section 4, option (B). The later checks can ask the `guardedOnes` WeakSet instead. |
| strength checker | `GX.strengthChecker` (GX:136), `custom` | `StrengthChecker` (helpers/passphrase-strength.ts:37) | no, rightly: a function | the host's | checked in `bankOpts` and again in `provingWorld` | Section 3. |
| `VaultStamp` | `GX.vaultStamp` (GX:155), strip | `VaultStamp` (GX:163) | yes | Vault, records, the lease friend | relists the scope instead of `CX.vaultScope.extend`; `SX.leaseQuery` (SX:291) and `Vault.#stampOfLife`'s handrolled `VaultScope & { vault_tok: string }` (vault.ts:268) are it minus `registered_at` | n/a |
| scopes | `CX` (CX:143) and `SX` (SX:54) | both `Z.infer` | yes | everything | the whole set, twice | n/a. Keep CX's. SX's callers (vault-db-new.ts:92, 108, 244, 303) take `CX.*.refusingAs('bad_option')` if they need that kind. |
| `LeaseSparse` | `SX.leaseSparse` (SX:295) and `GX.leaseStamp` | `SX.LeaseSparse` (SX:302), `GX.LeaseSparse` (GX:224) | yes | a device row; a Lease's `toJSON` | two shapes, one name | Rename the device row's (`LeaseRowSparse`, or fold it into `leaseQuery.extend({ proved_at })`). |
| snapshots | none | `VaultSnapshot` (VX:338), `BoxSnapshot` (VX:228), `BankSnapshot` (VX:425), handrolled | no | the classes' `makeSnapshot` | each relists `revision_tok`, `revision_seq`, `registered_at`, `written_at` from the sparse shape | `Pick<VaultSparse, ...> & Readonly<{ present, lockState }>`, as STYLE's *snapshot* says. |
| put and fetch options | `VX.putListingOpts` (VX:170), `VX.fetchOpts` (VX:107) | `Z.infer` | yes | listing verbs | `SX.putOpts` and `SX.ifAbsentOpts` (SX:150) carry the defaults; the models repeat them in 5 destructures (section 5) | n/a |

### Why "now" is a `Pick` and "later" is the class

The class is the one definition. `Pick<Vault, ...>` reaches it today at no cost to the tests:
cmd-click on a picked member lands on the class (measured, section 4), and the fake worlds in
`tests/test-helpers/models-world.ts` (25 test files) and `vault-world.ts` (17 test files) still
type-check against it. The runtime check stays a structural duck, made once per world and named by
both its listing and its storable.

Taking the class itself (`constructor(opts: { world: Vault, ... })`, checked by `isVault`) makes
the check one line. It costs those two fake worlds: box tests would need a real, unlocked Vault,
and vault tests a real Bank. `vault.test.ts:67-77` tests refusals of a structural world, and would
become one test.

Where an instance check can live: shapes/ cannot import a model as a value (shapes, then models,
then shapes again). `listing.ts` cannot import `bank.ts` either: bank.ts imports vault-listing.ts,
whose `extends Listing` would meet `Listing` not yet defined. So the check lives in the model's own
module (proving.ts's `Checks.wayinSource`, "Stays here: it names the class") or as a symbol brand in
consts.ts (`IsListing`, consts.ts:69).

**Recommendation:** `Pick` of the class now, for BoxWorld, VaultWorld and ListingWorld. Brands now
for VaultDB and DeviceDB. The class itself for the worlds once the Coach rules the test rewrite
worth it.

## 2. The clock

### Where it enters

* `BankOpts.clock` (VX:412), public: `BankOpts` is exported from index.ts. Checked by
  `bankOpts.clock: CX.clockShape.optional()` (VX:394). Defaulted to `wallClock` in Bank's
  constructor (bank.ts:85), held as the public `Bank.clock` (bank.ts:33, 89).
* `VaultDBOpts.clock` (SX:161), and `MemoryVaultDBOpts` by spread (SX:162). Defaulted to
  `wallClock` and held as `VaultDB.#clock` (vault-db-new.ts:74, 81-82). **A second, independent
  clock**: a host can hand Bank and VaultDB different ones. Only the test helpers keep them in step
  (vault-world.ts:130, bank-world.ts:61).

### How it flows

* Bank is the `world` of its VaultListing (bank.ts:101): `Listing.clock` reads `world.clock`
  (listing.ts:48).
* Bank is each Vault's `world`: `Vault.clock` reads `world.clock` (vault.ts:54).
* A Vault is its BoxListing's and its boxes' `world` (vault-listing.ts:49): `Box` reads
  `this.world.clock` (box.ts:292).
* Bank is the provings' `ProvingWorld` (gating.ts:97, `provingWorld.clock`).
* `Vault.#makeFriend` copies `world.clock` into the `LeaseFriend` (vault.ts:251, 256), which each
  Lease reads.

### Who reads it: 13 `.now()` sites

| Site | Reads | For |
|---|---|---|
| storage/vault-db-new.ts:252 | `this.#clock` | a gate move's next revision |
| models/vault-listing.ts:64 | `this.clock` | a birth's `registered_at` |
| models/vault-listing.ts:69 | `this.clock` | a birth's `written_at` |
| models/listing.ts:189 | `this.clock` | a tombstone's revision |
| models/bank.ts:162 | `this.clock` | the autolock cutoff |
| models/box.ts:292 | `this.world.clock` | a put's `written_at` |
| models/storable.ts:186 | `this.world.clock` | `#refreshedAt` |
| models/storable.ts:193 | `this.world.clock` | a tombstone's `written_at` |
| models/storable.ts:309 | `this.world.clock` | timeliness |
| models/proving.ts:180 | `ProvingWorld.clock` | a passphrase wayin's `registered_at` |
| models/proving.ts:188 | `ProvingWorld.clock` | a passkey wayin's `registered_at` |
| models/lease.ts:81 | `LeaseFriend.clock` | a lease's `proved_at` |
| models/lease.ts:205 | `LeaseFriend.clock` | `isPastAutolock` |

Carriers that only pass it on: `Bank.clock` (2 lines), `Listing.clock`, `Vault.clock`,
`Vault.#makeFriend` (2 lines), `VaultDB.#clock` (3 lines). Checkers naming it: `clockShape`,
`VX.world`, `listingOpts.world`, `bankOpts`, `provingWorld`, `leaseFriend`, `vaultDBOpts` (7, and
`memoryVaultDBOpts` by spread). Types: `Clock`, `World`, `BankOpts.clock`, and `ProvingWorld` and
`LeaseFriend` by inference.

**Drift.** The `Clock` doc (CX:181-184) says `Bank.make` "reads it once, and refuses 'bad_option'
for a reading outside `FarPast` to `FarFuture`, or a throw". Bank's constructor (bank.ts:82-109)
reads no clock. "A fraction rounded down" happens only at bank.ts:162.

**Tests.** 15 test files name the clock. The helpers: models-world.ts (16 lines), vault-world.ts
(8), bank-world.ts (5), proving-world.ts (4), storage-world.ts (1). Two tests exist only for the
option: shapes-vaultish-listing.test.ts (8 lines on the clock checks) and lease.test.ts:164 ("throws
a clock that throws"). models-world.ts, proving-world.ts and lease.test.ts already move time with
vitest's fake timers, their clock reading `Date.now()`.

Outside the core, `safebyok-react`'s BankProvider passes a `clock` through (bank-provider.tsx:228,
307), but it runs on `safebyok-old` until it moves.

### The options

| Option | What it is | src touched | Tests touched | Headspace left |
|---|---|---|---|---|
| (a) module-level clock | `helpers/clock.ts`: `nowMillis()` reads `Date.now()` at each call, unless a test set `_cheat_clock(fn)`; `_cheat_clockReset()` puts it back. Not exported from `.`. | 13 readers become `nowMillis()`; 9 carrier lines and 7 checker sites go; `Clock`, `wallClock`, `clockShape`, `VX.world` and `World` go. One clock for Bank and VaultDB. | 5 helpers swap `{ now: () => now }` for `_cheat_clock(() => now)`, reset in `dispose`; 2 test files lose their clock cases. Fake timers keep working. | None in any signature, option or friend. |
| (b) protected constructor parameter | `protected constructor(opts, clock = wallClock)` on Bank and VaultDB; tests subclass to reach it; `Bank.make` stays the public door. | 2 option sites go (`bankOpts.clock`, `vaultDBOpts.clock`). Every carrier, reader, `world.clock`, `provingWorld.clock` and `leaseFriend.clock` stays. | 3 helpers subclass Bank or VaultDB. | Nearly all of today's. Two clocks remain. |
| (c) subclass | A `protected now()` on Bank and VaultDB, a `TestBank` overriding it. Readers reach it through the world chain: `this.world.now()`, `friend.now()`. | 13 readers change; the chain stays, as methods instead of a field. | Test subclasses per world. | As today, renamed. |
| (d) no seam | `wallClock` only, inlined as `Date.now()` or one `nowMillis()`; tests fake `Date` with `vi.useFakeTimers({ toFake: ['Date'] })` and `vi.setSystemTime`. | As (a), without the backdoor. | vault-world.ts and bank-world.ts move from a `now` variable to `setSystemTime`, keeping real timers by `toFake: ['Date']`. | None. |

**Recommendation: (a).** It deletes the most: every `world.clock`, both friends' and the proving
world's clock, the 7 checker sites, and the two-clock split. The backdoor is one loud line per test
helper, named by the house rule, and its default reads `Date.now()` at each call, so the helpers
that move time by fake timers need no change. `nowMillis()` floors its reading, so the doc's
"rounded down" becomes true at one site.

(d) is the same src change with no backdoor at all. It is the fallback if the Coach would rather
tests lean on vitest than on a module variable.

For the changeset: `bankOpts` is strict, so a host still passing `clock` is refused 'bad_option',
the refusal listing the options Bank.make takes. Whether `safebyok/testing` re-exports
`_cheat_clock` is the Coach's call; the Coach's ruling suggests not.

## 3. Dangerous host functions

"Branded on the way in" means wrapped once at the boundary, so later code holds a checked, named
thing and never the raw host function.

| Function | Enters | Checked at | Held as | Called at | Branded? |
|---|---|---|---|---|---|
| `requestCleartext` | `BankOpts` | `bankOpts` `fn()` (VX:392); again `vaultListingOpts.world` (VX:357) | raw, public `Bank.requestCleartext` (bank.ts:37, 94) | `Gating.#askHost` (gating.ts:83-90): a throw becomes `requestCleartextThrew()`, nothing of it kept | No. One guarded call site, but the raw function sits on a public prop. |
| strength checker | `BankOpts`, default `DefaultStrengthChecker` | `bankOpts` (VX:393); again in every `provingWorld` parse | raw, public `Bank.strengthChecker` (bank.ts:39) | `Proving.checkStrength` wraps it per call with `invokeStrengthChecker(host, scope)` (proving.ts:69); `load` by `loadStrengthChecker` in `Bank.#bringUp` (bank.ts:142) | Half. `GuardedStrengthChecker` exists (passphrase-strength.ts:45), but is made per call, as it binds a scope. |
| key deriver | `BankOpts` | `bankOpts` `keyDeriverShape` (VX:391); again in every `provingWorld` parse | raw, public `Bank.keyDeriver` (bank.ts:34) | `deriveKeyBytes` (proving.ts:195) replaces a throw; `passphraseKeyOf` checks the bytes; `load` called raw in `Bank.#bringUp` (bank.ts:141), its throw reaching `hello`'s outcome as an `unexpected_error` carrying it as cause | No. |
| `onPanic` | `BankOpts` | `bankOpts` `fn().optional()` (VX:400); again `vaultListingOpts.world` | raw, public `Bank.onPanic` (bank.ts:40) | `Bank.#panic` (bank.ts:219) and `Vault.#panic` (vault.ts:188): the same try, catch, `reportToPlatform`, written twice; they differ only in Vault vacating when no handler is given | No. Two guards. |
| `onBadNews` | `BankOpts` | `bankOpts` `fn().optional()` (VX:399) | private `Bank.#onBadNews` (bank.ts:44) | `Bank.#hearBadNews` (bank.ts:268), under `tellBadNews`'s catch, which reports a throw to the platform | In effect: private, one site, guarded. `Phrases.BadNewsHandlerThrew` (phrases.ts:273) is unused. |
| logger | `BankOpts`, and each adapter's options | `parseLogger` (logger.ts:59), once; again `vaultListingOpts.world` and `leaseFriend` by `loggerShape` | the guarded logger, `Bank.logger` | everywhere, through the guard | Yes. `guardedOnes` (a WeakSet) is the brand. |

**Recommendations.**

* **`requestCleartext`**: wrap once in Bank's constructor into an `askUser(gating)` that never
  throws, answering whether the dialog closed or threw. Hold it private. `Gating.#askHost` calls
  that. One site, as now, but no raw function on a public prop.
* **Strength checker**: wrap once in Bank's constructor. `GuardedStrengthChecker` takes the scope
  per call (`(passphrase, scope) => Promise<PassphraseVerdict>`, and `load`). `ProvingWorld` types
  it as the guarded form, and `provingWorld` checks the brand. `invokeStrengthChecker`'s scope
  binding moves into the call.
* **Key deriver**: wrap once in Bank's constructor into a guarded deriver: its label and
  `salt_bytes` read and checked once, `deriveKeyBytes` replacing a throw, and `load` refusing a
  failure as `loadStrengthChecker` does. proving.ts is a guarantees file (G1, G8): the move of the
  throw replacement out of it is checked against *The guarantees* before it is made.
* **`onPanic`**: one guarded `panic(refusal): Promise<boolean>` on Bank, answering whether a
  handler heard it. `Vault.#panic` calls it and vacates on false. One copy of the guard.
* **`onBadNews`**: keep. Delete `BadNewsHandlerThrew`, or use it in `tellBadNews`'s report.
* **Logger**: keep. Replace the later `loggerShape` checks with a check of the brand.
* **Name the handler types once**: `((refusal: VaultError) => unknown) | undefined` is written three
  times for `onPanic` (VX:367, VX:419, bank.ts:40) and twice for `onBadNews` (VX:417, bank.ts:44).

## 4. Handrolled versus inferred

### What hover and cmd-click show (measured)

A probe in the TypeScript language service (typescript 6.0.3, the package's tsconfig), asking for
the quick info and the definition of each member:

| Member | Cmd-click lands on | Hover shows the prop's doc |
|---|---|---|
| `LeaseFriend.leaseMillis` (inferred) | the builder's property, GX:243 | yes |
| `StorableOpts.maxMillisSinceRefresh` (inferred) | the builder's property, VX:112 | yes |
| `Revision.revision_seq` (inferred, re-exported) | the builder's property, SX:34 | yes |
| `TimelyOpts.maxWorldMillis` (inferred) | VX:106 | no: none written |
| `ProvingWorld.keyDeriver` (inferred) | GX:169 | no: none written |
| `Story.where` (interface extending `Z.infer`) | validator.ts:292, in the `Checks` builder | no: the docs sit in the type's own block |
| `VaultWorld.scope` (handrolled) | VX:362 | no |
| `vault.world.scope` | VX:362, the interface | no |
| `BankOpts.onPanic` (handrolled) | VX:419 | yes |
| `Pick<Vault, 'scope'>.scope` | storable.ts:75, the class | n/a |
| `Pick<Vault, 'sealStampedString'>` | vault.ts:274, the class | yes |
| `Pick<Bank, 'onPanic'>.onPanic` | bank.ts:40, the class | yes, inherited from `VaultWorld` |

So a `/** */` on a property inside an `objCheck` builder reaches the reader through `Z.infer`, and
cmd-click lands on it. (A) costs nothing in navigation.

### The two forms

* **(A)** `objCheck` with a `/** */` on each prop, the type `Z.infer`. Cmd-click lands on the
  builder's property. One definition.
* **(B)** a handrolled interface with prop docs, the checker exported as `Z.ZodType<T>`, and a
  compile-time equality assertion between the checker's inferred type and the interface. Cmd-click
  lands on the interface. Right for an interface a host implements, which an adapter author reads
  and `implements`.

### Handrolled types beside a checker of the same shape

| Type | Checker | Recommendation | Cmd-click lands on, after |
|---|---|---|---|
| `ListingWorld`, `BoxWorld`, `VaultWorld` (VX:144, 312, 361) | inline in the options checks | neither: `Pick` of the class (section 1) | the class member |
| `ListingOpts`, `BoxListingOpts`, `VaultListingOpts` (VX:153, 321, 374) | `listingOpts`, `boxListingOpts`, `vaultListingOpts` | (A), the latter two by `extend` | the builder's property |
| `BankOpts` (VX:403), public | `bankOpts` | (A), with three repairs so the inferred type is right: `fn<RequestCleartext>()` and the like for each callback (bare `fn()` infers `(...args: never[]) => unknown`), `custom<VaultDB>(isVaultDB)` for each store (the duck infers a bag of functions), and `Z.input` for the host's side. Only `onPanic` has a prop doc today. | the builder's property in VX |
| `Clock` (CX:185) | `clockShape` | delete (section 2) | n/a |
| `KeyDeriver` (basederiver.ts:6) | `keyDeriverShape` (CX:197), already typed from it by `fn<KeyDeriver['deriveKeyBytes']>()` | (B): a host implements it; add prop docs and the assertion | the interface |
| `VaultLogger` (logger.ts:27) | `loggerShape` (CX:206) | (B), the same reason | the interface |
| `StrengthChecker` (passphrase-strength.ts:37) | `custom<StrengthChecker>` (GX:136) | already (B)'s shape, rightly: a function with a `load` | the type |
| `VaultSnapshot`, `BoxSnapshot`, `BankSnapshot` | none | no checker needed: `Pick` of the sparse type and the fields beside it | the sparse shape's builder |
| `RequestCleartext` (GX:323) | `fn()` in two checks | keep the type; check it as `fn<RequestCleartext>()` | the type |

### Inferred types whose props want docs

| Type | Docs today | Recommendation |
|---|---|---|
| `ProvingWorld` | none | (A): a doc on each of the three props that stay |
| `TimelyOpts`, `FetchOpts`, `BoxPutOpts`, `BoxCreateOpts` | on the type alias only | (A): move each prop's sentence into the builder; host-facing through `box.put` and `vault.putBox` |
| `LeaseFriend` | 5 of 9 | (A): `clock` goes; `logger` and the stamp's fields are self-evident |
| `VaultDBOpts`, `MemoryVaultDBOpts` | none | (A): `maxRecordBytes`, `maxBoxes`; adapter authors read them |
| `Story`, `ConsistencyRefusal`, `ObjCheckOpts` (validator.ts:302-311) | as lists in the type's block | (A): into the builder. They stay interfaces extending `Z.infer`, as `Refusing` names them (the reason is written beside them). |

## 5. Checkers not derived from an accessible one, or remade

Inline shapes that repeat an exported checker's fields:

* `listingOpts.world` (VX:164) re-makes `VX.world`'s `clock` and lists `ListingWorld`'s four verbs,
  rather than `world.extend({ ... })` or a named `listingWorld`.
* `boxListingOpts.world.scope` (VX:308) is `obj({ applabel, user_id, vaultlabel })`: `CX.vaultScope`
  re-made.
* `vaultListingOpts.world` (VX:357) re-checks `logger`, `deviceDB`, `onPanic` and
  `requestCleartext`, which `bankOpts` checked. It does derive from `GX.provingWorld.shape`.
* `GX.vaultStamp` (GX:155) lists `applabel, user_id, vaultlabel` rather than
  `CX.vaultScope.extend({ vault_tok, registered_at })`.
* `SX.leaseQuery` (SX:291) is `vaultScope.extend({ vault_tok })`, made from scratch.
  `SX.leaseSparse` (SX:295) is that plus `proved_at`, made from scratch again.
* `SX.reqParams` (SX:157) lists every scope field again.

Shapes one file rebuilds that another exports:

* `SX.bankScope`, `SX.vaultScope`, `SX.boxscope` (SX:54) rebuild `CX`'s (CX:143), in another kind
  and without `readonly`.
* `SX.LeaseSparse` and `GX.LeaseSparse`: one name, two shapes.
* `VX.putListingOpts` (VX:170) beside `SX.putOpts` (SX:153), and a second `putIfAbsent` in each
  file (VX:103, SX:152). The defaults live in SX's schema and again in the models' destructures:
  `ifAbsent = 'fail'` (listing.ts:146, storable.ts:144, box-listing.ts:75) and `ifAbsent = 'add',
  ifPresent = 'repl'` (listing.ts:167, box.ts:269). STYLE puts defaults in the schema.
* Four durations, each `union([number, lit(Infinity)])`: `VX.horizonMillis` (VX:104),
  `VX.positiveMinutes` and `VX.refreshMinutes` (VX:380), `GX.leaseMillis` (GX:235). The two
  millisecond ones accept `Infinity` past the entrypoint, where STYLE says "nothing is infinite".
* `maxMillisSinceRefresh` is checked in `listingOpts` and again in `storableOpts`.
* `leaseMillis` is defaulted twice: Bank (`millisOf(autolockMinutes, DefaultLeaseMillis)`,
  bank.ts:96) and `Vault.#makeFriend` (`leaseMillis = DefaultLeaseMillis`, vault.ts:251).

Each model constructor parses twice: `BoxListing` (`boxListingOpts`, then `super`'s
`listingOpts`), `VaultListing` (`super`'s, then `vaultListingOpts`).

## 6. Counts, as run

From `packages/safebyok/src/` unless named.

```sh
# validator definitions per file (code lines; validator.ts's include its doc examples)
rg -c '(=|=>)\s*(Checkers|Checker|objCheck)\(' .
#   shapes-gateish 20, shapes-vaultish 20, shapes-storage 14, shapes-core 10, validator 8,
#   deriver/shapes 1, models/gate 1, models/proving 1

# exported types, Z.infer/input/output against all, per shapes file
for f in shapes/*.ts; do rg -c '^export (type|interface) \w+.*(Z\.(infer|input|output))' $f; rg -c '^export (type|interface) ' $f; done
#   shapes-vaultish 16 of 47, shapes-gateish 19 of 37, shapes-storage 29 of 33, shapes-core 12 of 15, shapes-enums 0 of 12

# clock readers, and code lines naming the clock
rg -n '\.now\(\)' . | rg -v 'Date\.now'                                          # 13
rg -n '\bclock\b' . | rg -v '^\S+:\d+:\s*(\*|//|/\*\*)' | wc -l                  # 32
rg -l 'clock' ../tests | wc -l                                                     # 15

# inline world checks
rg -n 'world: obj\(' shapes                                                        # VX:308, VX:357 (and VX:164)

# scope fields listed by hand
rg -n 'applabel, user_id, vaultlabel' shapes models storage

# defaults written in destructures
rg -n "ifAbsent = '|ifPresent = '" models storage                                  # 5

# test files leaning on each fake world (from packages/safebyok/tests)
rg -l 'makeModelsWorld|models-world' . | wc -l                                     # 25
rg -l 'vault-world' . | wc -l                                                      # 17
rg -l 'proving-world' . | wc -l                                                    # 6
rg -l 'bank-world' . | wc -l                                                       # 4

# test fakes of a store that are not subclasses
rg -n '(vaultDB|deviceDB):\s*\{' ../tests                                          # 2, both refusal tests
```

Hover and cmd-click: a script in the session's scratchpad ran `ts.createLanguageService` over the
package's tsconfig with a virtual probe file in `src/`, calling `getQuickInfoAtPosition` and
`getDefinitionAtPosition` on each member in section 4's table. Nothing was written to the repo.
