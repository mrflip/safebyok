# Defined once: inventory for thread 6 (worlds_picks)

*Orchestrator:* section 1 of the Coach's `types-and-checks.md` (2026-11-06 02:35), now beside this file in the sprint directory; copied so thread 6 reads one section, not the note whole. Line numbers predate #511, #513 and thread 5: search by name. Thread 5 has since removed `clock` from every world and left `VX.world` as an empty strip check and `World` as `object`.

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

