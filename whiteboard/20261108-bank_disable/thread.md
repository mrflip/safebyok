# Thread 1: Bank gets a one-way `isEnabled`, and a disabled bank calls no host handler (2026-11-08)

Branch `20261108-bank_disable`, cut from `d268287a0` (the Coach's unpushed wip on
`20261108-handler_defaults`). Local only: not pushed, no PR, by the Coach's word. Justify: every
package's tests, typecheck, build and size pass (core 2492). The one red item is `safebyok-react`
lint, whose 4 errors were already in the base wip.

* **Built**, in `packages/safebyok` (`src/models/bank.ts` unless named):
  * **One-way end.** `#isEnabled`, `get isEnabled()` and `demandEnabled()` refuse
    `bankDisabled()` (`'disabled'`, `BankLetGo`). A sweep or a vacate sets `#endCause` at once
    (`#letGo`), so `hello`, `ensureVault` and `vaultAt` refuse from the call on. `#isEnabled`
    clears on a sweep at once, and on a vacate after its scrub.
  * **The vacate scrubs, then disables** (ruling A). `vacate(cause?)` lets the listing go,
    erases every cached lease row of this bank with the host's handlers live, then clears
    `#isEnabled`. It answers a promise memoized in `#vacating`: a repeat answers the first. A
    vacate after a sweep still erases.
  * **Handlers are chosen per call.** `panic`, `askUser` and `#hearBadNews` call the host's
    functions while `#isEnabled`, and after that `DefaultPanic`, `true` (the gating settles
    `declined`) and `DefaultOnBadNews`.
  * **A hello crossed by a sweep or a vacate** refuses `BankLetGo`, unless it refused on its
    own, and leaves the snapshot alone.
  * **A revoked identity is a panic** (rulings 1-7). `listing.ts` `tellIfRevoked` became
    `panicIfRevoked`, calling `world.panic({ refusal })`. It is a rename only at its call in
    `deliver`. The caller still gets the refusal. `ListingWorld` gains `panic`. `Vault` relays its
    boxes' panic. `Panic` gains `bank`, and the exported `BankPanic` is how a vault or a listing
    panics through the bank. `#hearBadNews` no longer vacates. `DefaultOnPanic` vacates the bank
    on `identity_revoked`, and still reports to the platform.
  * **The snapshot** reads `refused` with `#endCause` from the end on: `disabled`, or the
    revocation. `#lastHello` holds only real outcomes, and the fabricated
    `bad(bankDisabled())` is gone.
  * **Docs:**
    * README: "`onPanic` hears what you must act on for safety", with the
      `DefaultOnPanic(panic)` pattern.
    * Changeset: `.changeset/20261108-bank_disable.md`, minor.
    * VOCABULARY: the stage entry.
    * `notes/security.md`: an entry and its amendment, both from sonnet subagents.
  * **React:** the three-line patch to `safebyok-react/tests/bank-provider.test.tsx`.
  * **Tests:**
    * `bank.test.ts`: the panic describe, a host `onPanic` with and without the default, a
      burst;
    * `bank-ending.test.ts`: the scrub, a hello crossed at its last step;
    * `listing.test.ts`: a box listing panics.
    * The fake worlds gain `panic`.

* **Decisions taken**:
  * **Liveness is `#endCause === null`.** I dropped the `Listing.isEnabled` getter that the
    first build added.
  * **`DefaultOnPanic` does not await the bank's vacate.** A panic from the scrub's own erase
    would otherwise wait on itself.
  * **`Vault.panic` relays without naming the vault.** A revocation concerns the bank.
  * **`vacate(cause?)` is public and checked** (`VX.vacateCause`), because `DefaultOnPanic`
    needs it.

* **Set aside, with the reason**:
  * Disabling before the scrub. That was the first build, and ruling A reversed it.
  * **Dropping the IndexedDB deviceDB on vacate.** Both databases (`<dbName>:device-vN`,
    `<dbName>:bank-vN`) are shared by every app and user on the origin.
    * `deleteDatabase` is blocked by any open connection, this tab's own included: idb-keyval
      caches its connection and offers no close. Sign-out could hang.
    * The deviceDB is host-pluggable.
    * Erasing this bank's lease rows is the closest simple option to a fresh device.
  * **Forgetting the bank row (`device_id`).** It needs a new DeviceDB verb in memory, in IDB and
    in the battery, and the provider would have to stop caching it. Follow-up.

* **Path to a PR** (dry runs only):
  * `d268287a0` is one commit on `origin/main` (unmoved). It has a core half (handler
    defaults, about 80 lines) and a react half (`bank-provider.tsx`, about 190 lines, still
    "unchecked").
  * **Rebase onto main:** 6 files conflict, so the whole core half comes along. Main's
    provider then needs about 10 lines of bridge: it throws the `Panic` object, and it always
    passes a handler, so the defaults never vacate.
  * **The wip first, as is:** this branch applies with no conflict, onto `d268287a0` and onto the
    Coach's newer `c8ae21155`. But it waits on the react half.
  * **Recommended:** split the wip's core half into a PR of its own, and stack this one on it.

* **Discoveries**:
  * **Panics during the scrub reach the host's `onPanic`.** Only panics after it fall back. A
    host `onPanic` calling the default may run twice in a burst, and the repeat vacate does
    nothing.
  * **The provider will need:**
    * to remake only on new props: remaking on `identity_revoked` loops make, panic, vacate;
    * to await `vacate()`;
    * to delete `makeBank`'s `isEnabled` wrap;
    * to fix `useVault`, which waits forever on a disabled bank.

* **Races (rows)**:
  * An unlock in flight across a vacate can cache its lease after the scrub.
  * A vault's erase panic may land after the disable, and go to the default.

* **For the Coach**:
  * The security.md autolock entry still calls clearing unlisted rows "not yet designed".
  * `device_id` forget, as above.
  * `isEnabled` stays true during the scrub, while `demandEnabled` already refuses.
  * A host `onPanic` that swallows a revocation leaves the user's leases cached. That is by design.
