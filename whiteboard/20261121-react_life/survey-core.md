Read-only survey of `packages/safebyok` (src, tests) and the giver in `packages/safebyok-react`, against `react_life-design.md` and `dream_interface.md`. I read nothing in `safebyok-big` and ran no tests. Paths below are relative to `/workspace/byok/packages/`; `sb/` is `safebyok/src/`, `giver/` is `safebyok-react/src/giver/`.

## 1. Who makes what today

| Step | Definition | Needs at construction | Callers |
|---|---|---|---|
| `Device.make` | `sb/models/device.ts:90`; constructor `:92-105` | `{userid, banklabel, device_tok}` plus `{vaultDB, keyDeriver, strengthChecker?, logger?, autolockMinutes?, onBadNews?}`. No side effects. `deviceDB` is accepted and ignored (`:263`). | None in `src`. Tests only: `makeDevice` at `tests/test-helpers/models-world.ts:96`. |
| `Bank.birthGating` / `Bank.birth` | `bank.ts:189`, `:200` | A Device and cleartexts. `#birthByProving` (`:308`) calls `this.make` (`:310`), builds the lease, seals the root box, then `tryBirthBank`. | In `src`, only the giver form verb (`giver/minder-bank.ts:118`). Tests everywhere. |
| `Bank.make` | `bank.ts:106` | A `BankMakeRecord` (bank, `maingate`, and `rootBox` live or shell) plus `{device, vaultDB, queryCacheOpts?}`. The constructor calls `device.cheatHoldBank(this)` (`:120`). | In `src`, only `#birthByProving` (`:310`). Tests: 20 calls (`bank.test` 13, `device.test` 6, `bank-forms.test` 1) standing in for a stored bank. |
| `Gate.make` | `gate.ts:50` | A gate record and `{bank}` | The Bank constructor (`bank.ts:118`) and `#putGate` (`:337`). |
| `Lease.make` | `lease.ts:57` | A lease record and `{bank}` | Only `Proving.buildLease` (`proving.ts:106`), through a gating. Nothing loads or caches a lease. |
| `Vault.make(bank)` | `vault.ts:39` | A Bank only. The constructor does `ThingMinder.make({vaultDB: bank.vaultDB, queryCacheOpts}, bank)` (`:47`), then `bank.hostVault(vault)`. | None in `src`. Tests: `models-world.ts:152`, `vault.test` 10. |
| `ThingMinder.make` | `thing-minder.ts:97` | `{vaultDB, queryCacheOpts?}` plus a `MinderFriend`, which is `Pick<Bank,'scope'\|'rootBox'\|'makeGetAsk'\|'makeListAsk'\|'tellBadNews'>` (`shapes-minder.ts:94`). The constructor builds its own TSQ client (`#makeTSQ`, `:109`). | `Vault` only, plus test worlds. |
| `minder.hello` | `thing-minder.ts:142` | Nothing. | No `src` caller. `buildBornVault` calls it (`models-world.ts:153`). |

- **No bring-up path.** There is no `ensureBank` or "bring up the bank from stored records" anywhere in `safebyok/src`. `ensureBank` exists only as the giver's interface method (`giver/shapes-giver.ts:64`, check at `:83`, calls at `react-giver.ts:206,227,…315`). Only the three test worlds implement it.
- **Where a Bank gets its records.** Only from `Bank.makeRecord` at birth, or from a record a test hands in. A vaultDB answer carries `world`, which is bank plus `maingate` but no root box (`storage/vault-db.ts:12`, `WorldRecord`). The minder can `get` `'bank'` and `'gate'` paths (`thing-minder-lifecycle.test.ts:146-152` does `minder.get(TH.GateScope)`).
- **Minder before bank is blocked.** The minder needs a `MinderFriend` whose `makeGetAsk` uses `bank.track` (`bank.ts:152`) and whose `rootBox` comes from a Bank. So the design's "minder before bank" has a chicken-and-egg gap, and `Bank.make` needs a root box record the design does not list.
- **No `device_tok` source.** Nothing in `src` mints or persists `device_tok`; the caller must supply it.
- **Only tests perform** `Device.make`, `Vault.make`, `minder.hello` and `Bank.make` from stored records.

## 2. Cheats and stand-ins

| Name | Definition | Callers | src or tests |
|---|---|---|---|
| `Device.cheatHoldBank` | `device.ts:128` | `bank.ts:120` (Bank constructor) | src |
| `Device.cheatDropBank` | `device.ts:137` | `bank.ts:386` (`#end`) | src |
| `#thisIsTemporaryBank` | `device.ts:42`, used `:131,139,142,177` | internal | src |
| `PendingBank` | `shapes-bankish.ts:148` (stage `'starting'`) | `device.ts:177`; `giver/react-giver.ts:186` (server snapshot) | src; also imported by 3 test worlds and `react-giver.test` |
| `MemoryVaultDB._cheat_things` | `storage/memory-vault-db.ts:27` | tests only: about 25 uses in 9 files | tests |
| `_cheat_gatingOf`, `_cheat_grantedLease`, `_cheat_bankKeyBytesOf`, `_cheat_bankKeyOf` | `tests/test-helpers/models-world.ts:190,230,254,267` | `gating`, `lease`, `proving`, `ctx-bytes` tests, plus `fake-giver-world.ts:126` | tests |
| `cheatBox` | `tests/minding/thing-minder/world.ts:160` | 15 uses in 4 minder tests | tests |
| `_cheat_giverDeviceOf` | `knock-knock-world.ts:77` | `:71` | tests |
| `_cheat_birthBox`, `_cheat_replace` | `minder-giver-world.ts:31,33` | `minder-giver.test` (14 `_cheat_` uses) | tests |
| `_cheat_setBank`, `_hear`, `_hearBehind`, `_hearSoon`, `_hearRemoved`, `_endBank` | `fake-giver-world.ts:59-69` | `react-bridge.test` 11, `react-giver.test` 3 | tests |

`cheatHoldBank` and `cheatDropBank` are the only cheats in `src` that production code reaches. There is no `cheatHoldBank` or `cheatDropBank` use in tests; they run only through `Bank.make` and `sweep`. `PendingBank` is real exported API, not just a stand-in.

## 3. Lifecycle stages and endings

**Stages**
- `bankStageVals` (`shapes-bankish.ts:108`) lists `signed_out, starting, unborn, locked, unlocked, swept, failed`.
- Only `starting` (`PendingBank`), `locked`, `unlocked` (`bank.ts:421`) and `swept` (`:422`) are ever produced.
- `signed_out`, `unborn` and `failed` have no producer in `src`.
- `vacated` and `deleted` exist nowhere in `src`. Only the docblock prose mentions "vacated" (`:110`) and "deleted" (`:112`).
- `bank.test.ts:331` asserts the stage list, so stage removal touches that one case.

**Endings** (test cases are source `it(` blocks that mention an ending term, an upper bound, so some merely mention one)

| Item | Definition | src callers | Tests |
|---|---|---|---|
| `Device.sweep` | `device.ts:152` | none | within the counts below |
| `Bank.sweep` / `#end` | `bank.ts:369`, `:377` | `Device.sweep` | within the counts below |
| `hostVault` / `HostedVault` / `#vaults` | `bank.ts:392`; `shapes-bankish.ts:61` | `Vault.make` (`vault.ts:41`) | `bank.test` 4 lines |
| `Vault.sweep` | `vault.ts:55` | `#end` | in `vault.test` |
| `bankSwept` / `BankSwept` | `throwers.ts:20`; `phrases.ts:24` | `bank.ts:371` | in the counts below |
| `isEnded`, `endCause` in `BankSnapshot` | `shapes-bankish.ts:133-135`; `bank.ts:419` | snapshot only | `bank.test` 4 lines for `isEnded` |
| `isEnabled`, `endCause`, `demandEnabled` on Bank, Device and Lease | `bank.ts:479-495`; `device.ts:197-205`; `lease.ts:198-204` | gating bodies (`gating.ts:125-184`), `bank.ts:175,279,311,333,505`, `lease.ts:138,162,176`, `Device.tellBadNews` (`device.ts:190`) | `lease.test` 6 cases, `device.test` 8 lines |
| `MinderNotStarted` / `minderNotStarted` | `throwers.ts:107` | `#demandReady` (`thing-minder.ts:530`) | in the `'disabled'` count |
| `ThingMinder.goodbye` | `thing-minder.ts:155` | `Vault.sweep` | 7 files, 31 lines |

- **Sweep-family tests.** `bank.test` 15 of 75, `device.test` 15 of 43, `vault.test` 7 of 55, `lease.test` 6 of 40, `bank-forms.test` 5 of 42, so about 48 cases in 5 files. Nothing else in `tests/models` touches endings. About 48 `.sweep()` calls in total.
- **`'disabled'` refusals.** 39 lines in 8 files; many of them are minder-not-started and would survive.
- **`Device.#endCause` is never set** (`device.ts:47` says "Nothing ends a device yet"). `Device.isEnabled` is always true and `Device.endCause` always null.
- **The giver's own "vacate" is unrelated.** `gating.vacate()` zeroes cleartexts (`gating.ts:60`; `react-giver.ts:77`; about 12 giver cases). It is a different thing and survives.

**What survives if only "a different userid arrives" ends a device:**
- **Keep as is:** `Bank.lock` plus `Lease.evict` (lock path, `bank.ts:359`); `ThingMinder.goodbye` (stops the watch and clears the TSQ); `ensureUnlocked` and `dismissUnlock`; `#demandReady`'s `minderNotStarted`; `Gating.vacate`; `Bank.demandEnabled` as a no-op guard.
- **Dead weight:** `Device.sweep`, `Bank.sweep` and `#end`, `hostVault` and `HostedVault`, `Vault.sweep`, `bankSwept`, the `'swept'` stage, `isEnded` and `endCause` in the snapshot, and the whole `Device`-ends machinery.
- **One thing to replace:** `#end` is the only caller that rejects waiters with an end cause. Without it, a `withWhisper` waiting on unlock for the departing user hangs unless teardown calls `dismissUnlock`.
- **Bridge change needed:** the bridge currently resets our entries (`react-bridge.ts:168`, `resetQueries`) and the design wants them evicted.

## 4. Giver seams

- **Interfaces.** `GiverDevice` and `GiverBank` are at `giver/shapes-giver.ts:32-67`. Over the real core they are implemented only by `giverBankOfVault` and `giverBankOfMinder` in `giver/minder-bank.ts`. No `src` class implements `GiverDevice`.
- **`onBankStart`.** `react-giver.ts:123` registers at module scope and discards the stop function. `react-bridge.ts:157` registers too.

| World | How it wires | Tests riding on it |
|---|---|---|
| `fake-giver-world.ts` | Hand-built `GiverDevice` and `GiverBank`. `ensureBank` starts a bank lazily, and `_cheat_endBank` ends it. Snapshot is `PendingBank` until `_cheat_setBank`. No core classes. | `react-giver.test` 34 and `react-bridge.test` 11, so 45 |
| `minder-giver-world.ts` | A real `ThingMinder` with a fake `MinderFriend`, `hello()`ed, over a `MemoryVaultDB` born by `tryBirthBank`. `giverBankOfMinder` plus form verbs that refuse. Snapshot is a frozen `PendingBank`. | `minder-giver.test` 12 (two blocks are in loops) |
| `knock-knock-world.ts` | Real `Device`, then `buildBornVault` (`Device.make`, `Bank.birth`, `Vault.make`, `hello`), then `bank.lock()`. `giverBankOfVault(vault)` is the bank; the device's own snapshot and subscribe are exposed. `device.sweep()` runs on test finish (`:66`). | `knock-knock.test` 5 |

## 5. Boxes: what exists and what is missing

**Vault today** (`vault.ts`)
- `tryPutBoxOnce` and `putBoxOnce` take a labelpath or a record.
- `tryDelBoxOnce` and `delBoxOnce` take a labelpath only.
- `forceTimelyUnlocked` takes a labelpath. `withWhisper(labelpath, fn)` waits for unlock.
- The vault has no `get`, `list` or `listen`.

**Minder today**
- Reads: `at`, `soonAt`, `isBehindAt`, `listingAt`, `isListingBareAt`, `tryAt`, `get`, `list`, `isStaleAt`, `listen`, `invalidate`, `tryWrite`.
- Keys: `itemQueryKeyOf` and `bankQueryKeyOf` are static. `listQueryKey` is instance-only.

**Missing for the dream**
- **`putBox` with a revisor:** only the once variants exist, and they refuse `stale_write` rather than retry.
- **`delBox`:** only the once variants exist.
- **`useBoxList`:** the minder emits listing events, but `giverBankOfMinder` filters them out (`minder-bank.ts:137`). The bridge copies no listings, and the giver has no listing key.
- **`useBoxes`, `whisperQuery`, `useDraft`:** nothing exists.
- **Typed whispers:** no Standard Schema anywhere; whispers are an untyped bag.
- **Vault generosity:** the design wants a labelpath or a scoped object everywhere; today only put accepts a record.
- **Giver gaps:** it exposes no put, del, `withWhisper` or `lock`. The hook names differ: `useBoxRecord` and `useBankSnapshot` where the dream says `useBox` and `useBank`. There is no `isWatching` or `heardAt`.

## 6. Exports (`sb/`)

| File | Exports |
|---|---|
| `core.ts` | Device, Bank, Gate, Wayin, Lease, gating types, the `VaultDB` interface, the shapes and checkers. Its header says "no caching". |
| `storage.ts` | `MemoryVaultDB`, `AdapterVaultDB`, the asks and answers, and the classifier, for adapter authors. |
| `browser.ts` | `browserOpts` (argon2id deriver, `deviceDB`, zxcvbn checker), re-exported from big. |
| `index.ts` | `core` plus `storage` plus `ThingMinder`, `Vault`, `newerThingOf`, the minder shapes and strength checkers, and big's re-exports. |

- **A subset entry exists as `safebyok/core`.** `tests/index.test.ts:19` asserts core lacks `ThingMinder` and `Vault`.
- **Runtime graph is clean.** Only `minding/thing-minder.ts` imports `@tanstack/query-core` at runtime (`:10`). Everything else imports it as a type (`shapes-minder.ts:3`). A grep of `dist/` agrees.
- **What stands in the way:**
  - `cheatHoldBank` ties Device to Bank (`bank.ts:120`).
  - `BankOpts.queryCacheOpts` and `bank.ts:3` (a value import of `MinderChecks`) make the Bank know the minder.
  - `shapes-minder.ts` imports `type Bank` and `type ThingMinder`, and its `.d.ts` pulls TanStack types into core's type graph.
  - No stored-records bring-up path exists.
  - `Bank.makeGetAsk` needs a Bank, so even fetching the records needs a Bank.

## 7. Test weight

| Area | Files | Cases (source `it(`) |
|---|---|---|
| `safebyok/tests` | 29 | about 776 |
| of which `models` | 12 | 470 |
| of which `minding` | 10 | 195 |
| of which `shapes` | 2 | 59 |
| of which `storage` | 2 | 22 |
| giver tests (`safebyok-react/tests/giver`) | 4 | 62 |
| `secret-search.test.tsx` | 1 | 4 |

- Vault-DB battery helpers add 79 more `it`s, run per adapter.
- Loops multiply cases at run time.
- No per-package run time is documented in config or CI notes. The only figures: `pnpm justify` is "about a minute" for the whole repo (`CLAUDE.md`), and `notes/ci.md:41` says coverage runs about 3x slower than plain `vitest run`, with a guideline of 300 ms per CPU-bound test.

## Surprises and contradictions

- `vacated` and `deleted` do not exist in code. Only `swept` does; the design's removal list is partly aspirational.
- `Device` never ends, so the "device swept" tests are really bank-swept tests.
- The minder's `MinderFriend` (a Bank) conflicts with "minder before bank".
- The design's "bank and gate records" omit the root box, which `Bank.make` requires.
- The giver's `giverBankOfVault.birthGating` makes a second Bank on the device (`minder-bank.ts:118`). The existing Vault stays tied to the old bank object.
- `Vault.make` creates its own minder, while the design has the device owning it.
- `Device.make` has no `device_tok` source and ignores `deviceDB`.
- `dream_interface.md` is in `/workspace/byok/whiteboard/20261121-react_life/`, but the design file is in a separate worktree at `/workspace/byok-react_life/whiteboard/20261121-react_life/`.
- `dist/minding/thing-car.js` is stale; there is no such `src` file.
- A denied command (a search into `safebyok-big`, outside scope) cost one retry. No subagents were spawned.
