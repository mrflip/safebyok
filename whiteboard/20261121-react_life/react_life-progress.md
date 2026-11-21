# react_life: what the threads have taught

The orchestrator's alone. Newer than the plan wherever they disagree. Workers look things up here; each keeps its own
`thread-<N>-<label>.md` on its own branch.

## Before any thread (the design session, 2026-11-21)

* **The plan was prepared in one session and is orchestrated from another.** The design session's reasoning is in
  `react_life-design.md`; nothing else of it carries over.
* **Ruled by the Coach on 2026-11-21, after the plan's first draft:** the new React layer is a private package,
  `safebyok-react-lean`; the device owns the minder, with query-core a peer of `safebyok`; the giver makes the
  bridge, with React Query a peer of the new package; a demo persists through the memory vaultDB saved to
  localStorage; nothing ends a device in this sprint, and the teardown code that exists is left alone.
* **Ruled in *Open Matters* the same day:** the kit's form helper stays private until the demos show it earns a
  place on the hooks; `unborn` is a stand-in, faked or shimmed as needed; envman is a package in this repo; in
  envman "rename" edits the title and saving a new `val` stamps the last-rotated time; `useBoxes`, `putBox` with a
  revisor and an `editBox` are built if an app calls for them. Nothing is left open.
* **One survey claim was wrong:** fetching the bank's records does not need a Bank (`react_life-plan.md`, *Read
  first*).
* **Found in the code and out of bounds here:** a lease's expiry is reported and enforced nowhere, and `Device.make`
  ignores the deviceDB. The Coach has ruled that neither is touched or raised in this sprint.
* **Uncommitted in the base checkout when the sprint was planned:** the Coach's own edits to
  `whiteboard/20261116-react_backwards/app-side.md` and `human/PROMPTS.md`. They are not the sprint's.

## Thread 1, react_lean_pkg (#797, filed)

* `packages/safebyok-react-lean` holds the giver, its four test files (88 cases, not the plan's 62) and three test
  worlds; `tests/test-helpers.ts` re-exports `safebyok/testing`, the worlds and secret-search. `./parts` and `./kit`
  are `export {}` with `typesVersions` entries (attw needs them). `safebyok` takes query-core as a peer and a
  devDependency.

## Thread 2, device_bring_up (#798, ready)

* **The device's surface:** `Device.make(record, opts)` (`opts.queryCacheOpts`); `await device.hello()`, memoised,
  never rejects; stage via `device.getSnapshot().bank.stage`: `starting` → `locked` | `unborn` | `failed`
  (`lastErr`); `Bank.birth(device, …)` hands the born bank to the device, which makes and owns the vault
  (`device.vault`, null until a bank); `device.minder`, `device.bank`; `Vault.make(bank, minder)` public.
* **Cheats:** birth calls `device.adoptBornBank` from inside the bank; `hello` skips its fetch when a bank is already
  held (test helpers birth before hello).
* **Planning lesson:** the opus worker compacted six minutes in, on handoff plus reading. Larger threads go to
  `thread-worker-400k`.

## Rulings, 2026-11-21 (Open Matters and chat)

* **`safebyok/core` sanctity is waived** for now: "don't worry at all about /core sanctity". Core may carry the
  device's minder and TanStack Query.
* **Tests may touch ending events:** "it's quite reasonable to expect some tests may touch ending events". A thread
  that must adjust a sweep or lock test to fit what it builds does so and lists it; the teardown code itself still
  stays.
* **Birth's handover cheat stays** (`Bank.birthGating` calls `device.adoptBornBank`): the first place to look when
  ownership is re-apportioned.

## Thread 3, giver_slot (#799, ready)

* **How a hook reaches things:** every hook closes over the giver's `slot` and reads it when called
  (`slot.device`, `slot.demandVault()`, `slot.demandBank()`, `slot.device.minder`); in render through
  `useShownSnapshot(pick)`, which composes the provider's userid with the slot. New bank hooks go in `makeBankGiver`.
* **The bridge** is made in `slot.start` before `hello`, with the provider's QueryClient, never stopped. It
  invalidates the host's query from the minder's cache subscriber; the refetch's `minder.get` waits on
  `await device.hello()`. Under review against rule 7.
* **"An unlock is wanted"** is `Knock.useBank((bank) => bank.isUnlockWanted)`; `dismissUnlock()` rejects the waits.
* Form mutation keys `['sok', banklabel, verb]`; box keys carry the userid. Labelpaths flat.
* Cheat: a fresh `device_tok` per device (`crypto.randomUUID()`) in `slot.start`.
* The 400k worker built the whole thread in one context (about 290k tokens).

## Thread 5, parts_kit (#800, ready)

* Parts: `WhisperInput`, `PassphraseInput` (masked, uncontrolled, Show/Hide), `SubmitButton` (`useFormStatus`,
  `whilePending`), `WhisperText` (Show calls `withWhisper`, `flushSync` mounts an element, `textContent` through a
  ref). Kit: `UnlockForm`, `UnlockDialog` (modal while `isUnlockWanted`; Cancel or Escape calls `dismissUnlock`),
  `CreateVaultForm` (meter plus confirmation).
* Parts and kit take `bank={Knock}` (and `giver={SOK}`). `formActionOf(mutation, fieldnames, cleartextsOf)`,
  private in `src/kit/form-action.ts`, deletes every listed field before any await and resolves true or false.
* Thread 5's file, *How a kit form is assembled from parts*, is the recipe for any later kit form.
* Test helper `TH.expectTextUnheld` searches the tree and both caches.

## Thread 4, giver_boxes (#801, ready)

* **Reading:** `useBox`, `Knock.boxQuery`, `SOK.useQueryOptions()` share one factory, `boxQueryOf(userid, labelpath)`,
  `select` `nullifyThing` (exported). Signed out: key `['sok', null, banklabel, 'box/<lp>']`, fetch `skipToken`.
  `reactGiver` is generic over banklabels. `Knock.keys.box(lp)`, `Knock.keys.under(lp?)` (item keys only).
* **Writing:** `putBoxOnce`, `delBox`, `putBoxAction` try once, cite the newest revision the minder has heard of,
  and refuse `bank_locked` on a locked bank (no wait for the unlock form).
* **For thread 7:** `useActionState(Knock.putBoxAction('jokes', { whisperOf, sidecarOf }), null)`, the action made at
  module scope or under `useMemo`; it never rejects (`{ box, error: null }` or `{ box: null, error }`) and empties every
  FormData field before its first await.
* **For thread 8:** the minder's keys put the kind before the labels, so `keys.under` cannot cover listings: add a
  list key (or a predicate) under `keys`; leave the minder's key grammar alone. Labelpaths are flat.
* **For test writers:** React Query re-renders a hook only for the result fields read in render; read `data` in
  render or wait on it.
* The provider world gained `pauseGets`, `pauseAnswers`, `counts.gets` and `_cheat_device()`.
* The old giver is gone; `useBoxRecord` is now `useBox`.

## Thread 6, kit_ways_in (#802, ready)

* `safebyok-react-lean/kit` exports `ReplacePassphraseForm` (`giver={SOK} bank={Knock}`), `AddPasskeyForm`
  (`bank={Knock} passkeyOpts={{ rp: { name, id? }, user: { name, displayName }, timeout? }}`), `RevokePasskeyForm`
  (`bank={Knock}`, asks the passphrase), `PasskeyUnlockButton` (`bank={Knock} passkeyHeader askOpts={{ rpId?,
  timeout? }}`; `rpId` must match the `rp.id` the passkey was made under), and `passkeysAvailable`, `createPasskey`,
  `askPasskey`.
* **Gap for thread 7:** no hook gives the bank's passkey header; the forms' doc blocks name
  `Knock.usePasskeyHeader()`. Thread 7 adds it in `react-giver.tsx`, reading what the bank snapshot carries
  (`slot.device?.bank?.maingate.passkey0?.toJSON()` is the worker's sketch, in its thread file).
* `formActionOf`'s `cleartextsOf` may resolve null: nothing runs, the action resolves true (a dismissed prompt).
* Tests: `tests/test-helpers/fake-authenticator.ts` stubs `navigator.credentials`; `_cheat_passkeyHeaderOf(world)`.

## Thread 7, demo_knockknock (#803, ready): "once that's reached"

* The Knock-Knock app runs on the new core: `demos/safebyok-demo-knockknock`, `pnpm demo:knockknock`. An integration
  test (SDK stubbed by a fake `fetch`, the core's test deriver, a reload as `vi.resetModules()` and a fresh import)
  runs every flow of the plan, plus cancel, wrong passphrase, Show then Delete.
* **For envman:** thread 7's file, *For envman (thread 10): what to copy*, lists every file to `cp` and the
  `knockknock:` localStorage prefixes to change.
* **Lesson:** a stage switch with one component per stage unmounts work waiting on the unlock dialog; locked and
  unlocked render one component (`Opened`).
* `Knock.usePasskeyHeader()` (cheat: reads `slot.device?.bank?.maingate.passkey0` in render, re-renders on stage
  changes and successful form mutations via `useMutationState`). `safebyok-react-lean/testing` exports
  `expectTextUnheld`, `holdsText`, `reactTreeOf`, `installFakeAuthenticator`. `LocalStorageVaultDB` in the demo's
  `src/lib/` (cheat: `_cheat_things`).
* **Planning lesson:** a stalled worker shows as a stale ohai heartbeat; resume it by message, never relaunch.

## Rulings, 2026-11-21, second batch

* **Standalone gating makers and mutation options come back**, beside the hooks: "Both approaches are wanted".
* **The kit's bank prop is right for now, not in the end:** the provider's context serves it; thread 11.
* **Box-hook names follow STYLE.md:** `nullifyThing` → a `fooOf` name, `PutBoxActionResult.error` → `err`,
  `delBox` → `delBoxOnce`; thread 11, before envman.

## Thread 8, giver_box_list (#804, ready)

* `Knock.useBoxList()`: no arguments (labelpaths are flat). `data` is host labelpaths (`'jokes'`) in labelpath
  order, the same array until a box joins; **deleted boxes stay listed** and their `useBox` answers null, so a row
  renders nothing on null. Loading: `data` undefined, `isPending`. Signed out: `skipToken`, `fetchStatus` idle. No
  bank: `[]`. A locked bank lists as usual. A `putBoxOnce` joins the listing through the bridge.
* `Knock.keys.boxList()` is the minder's own listing key, via the new core static `ThingMinder.listQueryKeyOf(scope)`;
  `keys.under()` does not cover it.
* No opts, no `boxListQuery`, no `useQueryOptions().boxList` yet.
* **Form mutation keys carry the userid** (`['sok', userid, banklabel, verb]`): thread 11.
* **The sidecar mask is tuneable, one schedule for everyone**, default first 7 and last 4 characters; revealing a few
  is by design (which key, was it rotated). Thread 11 adds the helper; `notes/security.md` records it.

## Thread 9, use_draft (#805, ready)

* `Knock.useDraft(labelpath)` (`src/giver/use-draft.ts`): `isDirty`, `isWhisperDirty`, `isBehind`, `base`,
  `sidecar`, `setSidecar`, `whisperField(fieldname)`, `put(opts?)`, `discard`, `lastErr`. Types `Draft`,
  `DraftPutOpts`, `WhisperFieldProps` exported.
* **For envman:** spread `draft.whisperField('val')` onto a plain `<input>`. Stamp on Save:
  `draft.put({ sidecarOf: (_whisper, sidecar) => draft.isWhisperDirty ? { ...sidecar, last_rotated_at: Date.now() } : sidecar })`.
  The gear modal can `setSidecar` and leave Save to write it, or put through its own `sidecarOf`; `setSidecar` then
  `put` in one handler writes the old sidecar. A draft edits stored boxes only (`absent_box` otherwise): the add form
  uses `putBoxOnce` or `putBoxAction`.
* `put` cites the base (refuses `stale_write` when behind) and goes through `withWhisper` (waits for unlock).
* Expect a one-line conflict with #804 in `react-giver.test.tsx`'s list of bank-giver keys.

## Rulings, 2026-11-21, third batch

* **The stored sidecar mask carries no secret characters** (`tail: 0`). The `tail: 4` reveal is computed live from the
  unsealed whisper while unlocked, through `withLockableWhisper` (thread 12). Thread 11 was told; envman follows it.
* **A stage-change callback** beside `useBank`, and envman clearing its draft on lock with it, in the demo only, not
  the kit: thread 12, after envman.
