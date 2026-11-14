# The clock: inventory for thread 5 (module_clock)

*Orchestrator:* section 2 of the Coach's `whiteboard/20261102-newdesign/types-and-checks.md` (2026-11-06 02:35, untracked in the base checkout), copied here so thread 5 reads it from the sprint directory. Line numbers are as of that file's writing, before #511 and #513 merged: search by name.

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

