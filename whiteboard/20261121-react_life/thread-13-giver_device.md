# Thread 13: giver_device (2026-11-21)

Branch `20261121-giver_device`, PR #TBD, stacked on #808. Proved: `pnpm --filter safebyok-react-lean test` 243 passed, typecheck and lint clean; knockknock demo typecheck, lint, 26 tests.

* **Built**:
  * `GiverSlot` is gone (`src/giver/giver-slot.ts` deleted). `reactGiver`'s closure holds `let device` and plain functions: `deviceOf`, `demandDevice`, `demandBank`, `demandVault`, each refusal unchanged. `SlotMount` became `GiverMount`; the config's parsing (`ConfigChecks.giverConfig`, `isOneBank`) moved to `shapes-giver.ts`. The second store is gone.
  * A per-giver `ShownContext` carries `Shown`: `{device, bank: null}` once the provider's user has a device, else `{device: null, bank}` with `SignedOutBank` or `PendingBank`. Hooks branch once on `device === null`; query functions close over a non-null device. Calls a host may make outside the provider (`lock`, `dismissUnlock`, `keys.*`, `boxQuery`, the `fooMutationOptions`) read `signedIn()`, the closure's device.
  * `Knock.useGate(opts)`: a `useQuery` over `minder.get` of the MainGate, shaped like `useBox` (`recordQueryDefaults`, `isBehindAt`, `skipToken` with no device, `await device.hello()` first). `keys.gate()`. `data` is the gate, null at unborn, undefined while pending or signed out. Default `select` is `liveGateOf` (exported).
  * `gateShownOf` (`giver-defaults.ts`): the gate with each wayin by its header, no `bank_key_wayin_wrapped`. Used by both the query function and the bridge, which now forwards gate item events (`react-bridge.ts`) as well as box ones.
  * `usePasskeyHeader` removed; the kit's `PasskeyUnlockButton` and the demo's `WaysIn.tsx` read `useGate`'s `wayins.passkey0`.
  * Tests: `useGate` (signed out fetches nothing; null at unborn; `keys.gate()`; passkey added then revoked with no reload; same header across renders; rule-2 search of QueryClient and React tree for every stored wrapped bankKey ciphertext and the passphrase, checked to fail without the stripping). Bridge: a passkey another device adds shows with no `minder.get` by the giver's device, and no wrapped bankKey in the cache or tree.
  * `notes/security.md` entry (via a sonnet subagent) for the gate headers in the host's cache.

* **Decisions made**:
  * **The device is not folded into `GiverContext`.** `GiverContext` is shared by every giver ("under two providers, the nearer wins"), so a hook of giver A under B's provider would read B's device. A context per giver, made in `reactGiver`, cannot cross.
  * **The device is made during the provider's render** (`deviceOf`), and `hello()` runs in an effect. Made in an effect, the device arrived as a context change, and every context consumer re-rendered, breaking the contract test "given a selector, re-renders only when what it selects changes". `deviceOf` is idempotent (answers the one device), so StrictMode's double render or a discarded render makes no second device; `Device.make` and the bridge's subscribe touch nothing outside objects the giver owns; `hello`, which reads the vaultDB, waits for the effect. This also removed the provider's `useState` + setState-in-effect.
  * **`liveGateOf`, not `liveOf`, for the gate.** A headered gate fails the core's whole-gate check (it wants the wrapped bankKeys), so `liveOf` reads it as a shell and answers undefined. `liveGateOf` answers null for the tombstone (the unborn shell, the only gate tombstone) and the gate otherwise.
  * `useGate` takes `BoxQueryOpts<GateShown, SelT>`, the box query's option type, so the bank record can follow the same shape later.
  * The header now carries `wayinlabel`, as `Wayin.toJSON` did.
  * **`_cheat_device` stays.** The per-giver context is closed inside `reactGiver`, so a test cannot reach it; the `Device.make` spy remains the only seam.

* **Deviations**:
  * "A hook under the provider reads a non-null device" holds only once the user has one: at `signed_out` and `starting` there is no device (a Device needs a userid), so hooks branch once on `device === null`, with no `?.` chains.
  * Loosening: outside every provider, hooks now show `signed_out` (the context's default), where before they read the slot. No test covered it.
  * `GiverSlotSnapshot` (exported type) removed; `liveGateOf`, `GateShown`, `HeaderedGate`, `GateSelected` added. Changeset says so.

* **Discoveries**:
  * `ThingMinder` instances are frozen: spy on `ThingMinder.prototype` and filter `mock.contexts`.
  * `expectTextUnheld` with a non-string passes silently (`holdsText` only matches strings); search the `ciphertext_b64`.

* **For the Coach**: lines of `react_life-design.md` and `dream_interface.md` that now read wrong (not edited, per the brief):
  * design l.33: "the giver: static config ... and one mutable slot, the current device" (now the closure's `device`, no slot).
  * design l.38: "Everything a hook reads goes through its slot." (through the provider's per-giver context).
  * design l.61-63: "It fills the giver's slot ... Functions outside render read the slot when called." (makes the giver's device; read the closure's device).
  * design l.88-90: "`signed_out`, `starting` and `failed` are states of a slot ... `unborn` is a state of the slot too" (states of the provider's `Shown`, or the device's snapshot).
  * dream l.31: "Static config and one slot, the current device".
  * Other "slot" hits left alone: the demos' "knock-knock slots" test names, and the CSS class `api-key-slot` in demo-react (on big).

* **Ownership choices (GR6)**: the giver owns the one device for the page (never ended; the bridge never stopped). The `device_tok` cheat (`// Cheat (react_life): a fresh device_tok for each device`) is carried over unchanged.

* **Set aside**: folding the device into `GiverContext` (crosses givers); keeping the device in `useState` set by an effect (an extra render for every consumer at sign-in); `liveOf` for the gate (reads it as sparse); a context reachable from tests to retire `_cheat_device` (would export test-only surface).
