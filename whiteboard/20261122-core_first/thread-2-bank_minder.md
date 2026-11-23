# Thread 2: bank_minder (2026-11-22)

Branch `20261122-bank_minder`, PR [#844](https://github.com/mrflip/safebyok/pull/844), base main (sprintbase `774406ca9`, #842's tip, merged). Reworked after the Coach's ruling (2026-11-22) that the BankMinder is a subclass of one minder class, with no world entry. Proved: see the PR's **Tests:** line.

* **Built** (the rework):
  * `src/minding/minder.ts`: `Minder`, the abstract base (the old ThingMinder's code, `git mv`'d from `vault-minder.ts`): items, soons, listings, gets, lists, writes, the watch, `listen`, `invalidate`, #831's `makeClient`/`isClient`/landers. A subclass says only `mindsItemAt(labelpath)`, `mindsListingAt(labelpath)` and `get rootBox()`. `hello` seeds the root box's listing where the subclass minds it. Each subclass freezes itself in its own constructor (the base cannot: a subclass's private field is added after `super()`).
  * `src/minding/vault-minder.ts`: `VaultMinder extends Minder`: boxes under the root box, listings of the root box and boxes. Takes `opts.bankMinder`, and reads `rootBox` from it. The forwarding branch in `sendToTSQ` is gone: a record it does not mind lands nowhere.
  * `src/minding/bank-minder.ts`: `BankMinder extends Minder`: items of `bank`, `gate` (main gate) and `box` (root box), no listings. `worldAt()` reads the three items and returns `{ bank, gate, root }`, or undefined while any is missing or a shell; nothing keeps a copy (a new object each call, of the items' own records). `fetchWorld()` is a get of the root box (`staleTime: 0`) through the base's get; `null` where none is stored, `storage_issue` where a root is stored without the others. `subscribe(listener)` is `listen` filtered to item landings and removals. `tryBirthBank(ask)` lands the three roots through `sendToTSQ`. `tryWrite` is the base's.
  * **Every answer's `world` lands** (`#landWorld` in the base, on gets, lists and writes, refused or not): its bank and main gate go through `sendToTSQ`, and land where minded. That is how `fetchWorld` gets the bank and main gate: a plain get's notices carry no world, and the watch ignores it.
  * Device: `BankMinder.make({ vaultDB }, this)` at construction, in a client of its own (not `opts.queryClient`, which the host observes); bring-up says `hello` to both minders, then `fetchWorld()`. Bank, Gate, gating: `worldAt()`, `tryWrite(ask)`, `tryBirthBank(ask)` without the vaultDB/scope arguments.
  * `Throwers.boxesOnly` is now `notMinded` (phrase `NotMinded`), for either subclass. `MinderOpts` is the base's options; `VaultMinderOpts` adds `bankMinder`.
  * Separate commits: the `select` pin removed from `FixedQueryCacheOpts`; the `#minderEventOf` entrykind filter and its test removed (no host query lives in the query cache under a bank's key head now; `formMutationKeyOf` keys mutations, not queries).
  * Docs: VOCABULARY *minder*, *world*, *watch*, *item*, *soon*, *Void Sentinel*, *listen*, *minded*; both world rows struck from `notes/wontfix.md`; G3's drift and the `notes/security.md` amendment rewritten (through its sonnet subagent; only this branch's own lines).
* **Decisions made**:
  * **One BankMinder per user and bank, not one for all users.** The base is bound to one scope in four places: its watch (`vaultDB.watch(scope)`), its friend's asks (`makeGetAsk`, with the bank's `track`), its landers in a shared client (keyed by bank), and its delivered-record check. A single BankMinder over all users would need a watch per scope started on demand, asks built from query keys, and a multi-scope lander, which turns the shared code into a second, multi-scope design. Per bank reuses it whole. All users' rows can still sit in one client: BankMinders of several banks share one `BankMinder.makeClient()` (tested in `vault-minder-shared-client.test.ts`), which thread 4 can make at device construction, attaching a BankMinder when the user is known. Rows of users not signed in then come only from persistence (thread 6).
  * **Each minder has its own watch.** Two watches per bank (the provider tests now count 2 per device). Each notice reaches both; each drops what it does not mind. This replaces the forwarding branch, and needs no knowledge of the other minder.
  * **Thread 4's three calls changed signature, kept names and meanings:** `BankMinder.make(opts, friend)` (was `make()`), `worldAt()` (was `worldAt(scope)`), `fetchWorld()` (was `fetchWorld(vaultDB, scope)`). Also `tryWrite(ask)` and `tryBirthBank(ask)`.
  * **useGate unchanged** but for `worldAt()`: it reads `worldAt()?.gate` through `useSyncExternalStore` with `bankMinder.subscribe`. The gate record is the item's own, the same object until a newer one lands, so its WeakMap snapshot stays stable.
  * **Set aside:** a protected `landWorld` hook overridden by the BankMinder alone (landing in the base, dropped where not minded, needs no hook); a `fetchWorld` that tracks nothing so the watch brings bank and gate (a `track` must cite all three roots); a scope argument on `worldAt` kept for thread 4 (it could only be checked against the minder's own scope: a misuse hunt).
* **Deviations**:
  * **Removed: a test of a birth answer with a shell root.** `gating.test.ts` "sweeps its gate ... where the vaultDB answers a root box that is not live" spied a vaultDB answering a shell root after a good birth. The BankMinder's watch now lands the stored root too, so the birth succeeds. A damaged answer is out of bounds this sprint.
  * **A test stub fixed:** `record-hooks.test.tsx`'s refused list now carries `world: null`, which the `Answer` type requires and the base now reads.
  * **Loosened (unchanged from the first build): a damaged root.** A damaged bank or gate row beside a root box refuses `storage_issue` at bring-up (it was `damaged_row`). The stage is still `'failed'`.
  * **Not reactive: the stage.** It is read from the world at bring-up.
* **Discoveries**:
  * **The React tests run against `safebyok`'s `dist`.** Build it first.
  * **MemoryVaultDB notifies every write**, where the adapter notifies only tracked roots, dbhas and listed Things: a test isolating the "tracked stale gate" path must write the gate before the BankMinder exists, and not fetch first.
  * **The Gate object adopts no gate changed elsewhere**; the world has the newer one. Thread 4 should read the gate from the world.
* **For the Coach**: the open matters in the PR body.

## End states, for the final report

* The BankMinder's items stay through the VaultMinder's `goodbye`, a sweep and a vacate; only the BankMinder's own `goodbye` empties them, and nothing calls it.
* A bank reborn elsewhere: its three roots land item by item as heard of, so `worldAt()` may mix lives until all three have landed.
* A vaultDB answering a damaged birth (a shell root) beside a watch that tells the stored root: the bank is made from the stored root.

## For the instance-sync thread

* `Gate` keeps its own record and does not adopt a gate the BankMinder lands from elsewhere.

Looked up: at the build, `rg -n 'thread 2|bank_minder|BankMinder' core_first-plan.md`; at the rework, thread 4's (#846) device.ts on origin, for its calls to `BankMinder.make`, `worldAt` and `fetchWorld`.
