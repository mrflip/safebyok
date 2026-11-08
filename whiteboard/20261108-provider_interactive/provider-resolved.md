# Resolved: bank-provider.tsx interactive session

Items from hanging.md that are settled, with how. Newest last.

* `hasUserGesture` doc block after the comment pass reads "…still in hand, true where the browser does not say": the comma is awkward ("or true where…"?). [agent] Settled by the Opus pass (applied 2026-11-08): reworded, and each item ruled on.
* The comment pass's "couldn't tell" list (Sonnet, commit 7ea88e982). [agent]
  * The `onDone` props in six dialog files ("'unlocked' once …, 'declined' otherwise"): `#option-values-get-a-list`?
  * Possibly `#one-verb-one-fact`: `ask` in `useGatingDialog`, `ModalFormProps.gripeId`, `passkeyGripe`, `useBoxIsShowing`.
  * Possibly purpose tails: `jsonOf` and `timeOf` ("for the panel to show whole"), and `useRoundFor`.
  * Possibly `#purpose-not-machinery`: `holdsFocus` and `callThenRelist`.
* Under StrictMode's double effect, the provider makes two banks in dev (the first swept at once), so a test key deriver's `TestDeriverNotice` warning logs twice, and `ensureBank` runs twice. That's React's connect-disconnect-connect, by design. [agent] Settled 2026-11-08: the bank effect waits for the device_id, so StrictMode's mount-time double run makes nothing, and one bank is made.
* Signing in remounts the host's children: the `Bankless` branch and the keyed `UserBankProvider` are different elements. Since `device_id` moved up into `BankProvider`, that remount comes after the IDB call, not at the sign-in render; children render under `Bankless` meanwhile. Must a sign-in from nobody remount at all? (A user switch should, so nothing leaks between users.) [agent] Settled 2026-11-08: a regression (a signed-in page load mounted the host's app twice), caught by the react tests. UserBankProvider is now keyed by user only and always rendered, and the bank effect waits for the device_id.
* `useDeviceId` reads the live `deviceDB` while the bank reads the frozen one. [agent] Settled 2026-11-08: a fresh deviceDB each render isn't part of the contract. The ignored-props warning does cover it, since `deviceDB` is among the frozen options, and an IndexedDB store answers the same `device_id` from any instance. No change.
* Tests and other changes, held off during this session. [Coach]
  * tests/test-helpers.ts and tests/bank-provider.test.tsx import `BankProviderProps` from `../src/bank-provider`; it now lives in `src/shapes/shapes-provider.ts`.
  * `@typescript-eslint/require-await` on `requestCleartext` at tests/bank-provider.test.tsx:359 and tests/vault-controls.test.tsx:71. These were there before this session.
  * Settled 2026-11-08: the react tests are green (253), the imports fixed, the `require-await`s gone.
* Finish removing autolock from the provider (not from the core): from any docs or notes that say the provider runs it, then enter it in the todo and security notes, etc. [Coach]
  * The provider's timer was removed 2026-11-08. The core keeps `Bank.autolock()` and `autolockMinutes`. The right timescale is hours or days, which a page timer can't serve.
  * Settled 2026-11-08: the timer is gone, the changeset tells hosts to call `bank.autolock()` themselves, and guarantees.md and design-models.md already say only the host calls it. Unchecked: notes/security.md, which only a Sonnet may read.
* Handlers take a winding road [Coach, parked]: they come off the props into a `handlers` bag, then into `panicked` (and kin) by `useEffectEvent`, then are remixed into handlers on the fly in the `Bank.make` call, and for all we know the bank wraps them again (it does: `guardOnPanic`, and its own `DefaultOnPanic` / `DefaultOnBadNews` defaults). React is needed to call `useEffectEvent`, but the bank can provide the default handler itself, if that doesn't affect the lifecycle.
  * Settled 2026-11-08: one `useEffectEvent` hands the bank the latest handlers, the core holds the defaults and the disabled switch, and `makeBank` is gone.
* `bank.isEnabled` doesn't exist in the core yet: true from `Bank.make` until `sweep()`, then false forever, and `vacate()` must not clear it (its own `identity_revoked` news goes out after). The three uses in `makeBank` are the file's only tsc errors. [agent]
  * Settled 2026-11-08: it exists, and is superseded: vacate disables first (20261108-bank_disable, vacate_first).
* After `identity_revoked` the bank is disabled for good (20261108-bank_disable), and the provider must make a new one: today the same user keeps the dead bank until `user_id` passes through null. [agent, from the worker and the review]
  * Folded into the remake-loop item, still open.
* Once 20261108-bank_disable lands, `makeBank`'s `isEnabled` wrap duplicates the core: delete `makeBank`, and call `Bank.make` in the effect. [agent]
  * Settled 2026-11-08: `makeBank` deleted; the effect calls `Bank.make`.
* `#lastHello` in bank.ts holds a made-up `bad(bankDisabled())` outcome that no hello produced, and one error instance is rethrown to every later caller (with the sweep's stack). Investigate: branch on `#isEnabled` instead? Left for now. [review of 20261108-bank_disable]
  * Settled 2026-11-08 (vacate_first): `#lastHello` holds only real hello outcomes; the end is `#endCause`.
* bank-provider.tsx: "A swept bank's panic goes to the platform, as a handler's throw does." Unverified against the core's handling of a throw from `onPanic`. [agent, Opus pass]
  * Settled 2026-11-08: the comment went with `makeBank`.
* Are we telling the bank to vacate on the right cycle? [Coach] Decided 2026-11-08: a signed-out user's bank is vacated by default.
  * Settled 2026-11-08 (pr_squash): `BankProvider` keeps one note, the last bank made, which the keyed `UserBankProvider` hands up tagged with its `[applabel, user_id]`. Its effect, rerun only when that user changes, vacates the noted bank when the tag differs (`void lastBank.vacate()`); a plain unmount, a hot reload, StrictMode or a hidden `<Activity>` never reruns it with a new user, so they only sweep. The child still sweeps in cleanup, and the core scrubs on a vacate after a sweep. About 15 net lines of src, no disables. Tests: sign-out erases the leases; a switch vacates the old bank and not the new; an unmount and StrictMode leave the leases.
  * The scrub of that vacate still tells the last user's `onPanic` of a lease it cannot erase (its handlers as last rendered), never the next user's: the test "tells the next user's onPanic nothing of the bank it let go" now expects that.
