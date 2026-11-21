# Thread 3: giver_slot (2026-11-21)

Branch `20261121-giver_slot`, PR #799, stacked on #798. Proved: `pnpm justify` green after the catch-up onto #798 at 209a9a11d (`safebyok-react-lean` 107 tests in 5 files; `safebyok` 1338; e2e 576).

* **Built** (all in `packages/safebyok-react-lean/src/giver/`)
  - `react-giver.tsx`: `reactGiver(config)` returns `{ Provider, useStrengthVerdict, bank }`. `SOK.bank('acme')` (other banklabels refuse `bad_scope`) gives `useBank(select?)`, `useBoxRecord(labelpath, opts?)`, `withWhisper(labelpath, fn)`, `lock()`, `dismissUnlock()`, and the form hooks `useBirth`, `useUnlock`, `useReplacePassphrase`, `useAddPasskey`, `useRevokePasskey`, each a `useMutation` with a synchronous `.gating(cleartexts)`. Exported from the package's `.` entry with its types, `GiverConfig`, `GiverBanks`, `GiverSlotSnapshot`, `SignedOutBank`.
  - `giver-slot.ts`: `GiverSlot`, the giver's one slot. `start(userid, { client, vaultDB?, keyDeriver? })` makes the device (`Device.make`), bridges its minder to the host's QueryClient, subscribes to its snapshot, and calls `device.hello()`; it does nothing once the slot has a device. `demandDevice()`, `demandBank()`, `demandVault()` refuse `absent_vault` (nobody signed in; bank unborn; not brought up or failed). Its snapshot is `{ userid, bank }`, `bank` being the device's bank snapshot or `SignedOutBank`.
  - `react-bridge.ts`: `bridgeMinder(client, minder)`, the old `deliverEvent` over `minder.listen`, no catch-up invalidation and no reset (nothing ends).
  - `giver-defaults.ts`: the query and form-mutation defaults and the keys, moved out of the old giver so both use them. `phrases-giver.ts`: the giver's refusal messages.
  - Tests: `tests/giver/react-giver.test.tsx` (51) over a new provider world, `tests/test-helpers/provider-world.ts` (the real giver, `MemoryVaultDB`, a held key deriver and strength checker) and `tests/test-helpers-react.tsx` (`providerTreeOf`). `knock-knock.test.tsx` ported to it (6): unborn, create with the strength meter, a key stored by another device, Lock, `withWhisper` waits, the dialog unlocks, it resumes, with no passphrase in the rendered snapshots, the tree, or either cache.

* **For threads 4 and 5: how a hook reaches things**
  - **The vault, the bank, the minder**: every hook and call closes over the giver's `slot` and reads it when called: `slot.device` (null while signed out), `slot.demandVault()`, `slot.demandBank()`, `slot.device.minder`. Nothing keeps a device or vault. `makeBankGiver(slot, useShownSnapshot)` is where a new bank hook goes.
  - **In render**, read the slot through `useShownSnapshot(pick)`: it composes the provider's userid prop (a context per giver) with the slot, showing `{ userid: null, bank: PendingBank }` while the slot's device is not the prop's user's. `useBoxRecord` keys on that userid and uses `skipToken` while it is null.
  - **The bridge** is made in `slot.start`, before `hello`, with the QueryClient the provider read by `useQueryClient()`. It is never stopped.
  - **"An unlock is wanted"**: `Knock.useBank((bank) => bank.isUnlockWanted)`, the core bank snapshot's own flag, true while a `withWhisper` waits in `bank.ensureUnlocked`. `Knock.dismissUnlock()` rejects those waits `dismissed`.
  - **Labelpaths are flat**: `withWhisper('jokes')` and `useBoxRecord('jokes')` mean the core's `box/jokes` (`boxLabelpathOf`).

* **Ownership choices and cheats** (rule 6)
  - The slot makes the device; the device makes the minder and vault (thread 2); the slot makes the bridge. Nothing here depends on when the minder is made except that the bridge listens to `device.minder` right after `Device.make`, before any get: a minder made later would need the bridge started then.
  - `// Cheat (react_life)` in `giver-slot.ts` `start`: a fresh `device_tok` per device (`crypto.randomUUID()`).
  - `withWhisper` and `useBoxRecord`'s fetch `await device.hello()` before they use the minder or vault, so neither depends on hello having finished.

* **Decisions made**
  - The provider's effect lists `[userid, client, vaultDB, keyDeriver]`, not `[userid]`: `start` ignores repeats, so the extra deps only rerun a no-op, and the lint needs no disable. A host's inline `vaultDB={new MemoryVaultDB()}` (the dream's test example) is safe for that reason: only the first start reads it.
  - One context per giver for the provider's userid, not one module-wide.
  - Form mutation keys are `['sok', banklabel, verb]`, without the userid, so a hook has a key while signed out.
  - `withWhisper`'s callback gets `(whisper, box)`, the dream's `({ apiKey }) => …` shape, with the whole unsealed box second.
  - `.gating` at the wrong stage throws `absent_vault` synchronously, inside the host's form action. Shown only at its own stage, a form never meets it.
  - `useStrengthVerdict` judges through the signed-in device; while nobody is signed in, `judge` lands `absent_vault` in `lastErr`.

* **Deviations**
  - **The old giver stays, renamed.** `old-giver.ts` (`makeReactGiver`), `minder-bank.ts`, the `GiverDevice`/`GiverBank` types in `shapes-giver.ts`, `fake-giver-world.ts` and `minder-giver-world.ts` stay, unexported, because `react-bridge.test` (11), `minder-giver.test` (22) and `old-giver.test` (17: its `useBoxRecord`, `boxRecordQueryOptions` and checks cases) still run on them, and the plan gives porting those to thread 4. Thread 4 deletes them once ported. `knock-knock-world.ts` is gone.
  - **Retired, not ported**: `makeReactGiver`'s fake-world cases for `useBankSnapshot`, the form verbs, `dismissUnlock` and `useStrengthVerdict`; each has a real-core counterpart in `react-giver.test.tsx`.
  - **Dropped from the bank's surface**: the standalone `birthGating`… and `…MutationOptions()` the old giver had; the hook's `.gating` is the one gating maker. Easy to add back if a kit form wants options without the hook.
  - **`useBoxRecord` is carried** as the stand-in for thread 4's `useBox`, so the knock-knock app can show "Key stored" and the bridge has a test; its `select` defaults to the old `shownRecordOf`.
  - **A second userid does nothing.** Out of bounds; under it the provider's children show `starting` (tested) until the page reloads.

* **Discoveries**
  - The bridge's `deliverEvent` invalidates the host's item from inside the minder's cache subscriber, which refetches it. The refetch's `minder.get` now runs after an `await device.hello()`, a microtask later, so it no longer dispatches to the minder's cache from inside that cache's notification. Thread 4 porting the bridge should keep it so (rule 7).
  - With the giver's types now naming `DeviceOpts` and the like, tsdown followed safebyok's declarations into safebyok-big's, "detected" idb-keyval as bundled (nothing of it is), and wrote `inlinedDependencies` into the package's `package.json` at every build. `tsdown.config.ts` now keeps `safebyok-big` external; the built output is unchanged.
  - The provider must be inside a `QueryClientProvider`; `useQueryClient()` throws otherwise (tested). The dream's "where a host has none, the giver makes one" is not built.

* **Looked up**: the plan's ground rules and threads 3 to 7, and the progress document.
