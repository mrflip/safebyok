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

# Thread 2: vacate disables first, its scrub alone holding the host's handlers (2026-11-08)

Branch `20261108-vacate_first`, cut from `3ad242978` on `20261108-handler_defaults`. Local only.
The Coach rejected ruling A's order ("isEnabled should be one of the first things to come down";
"I do not like the idea of bank itself having a janky lifecycle"): the window where `isEnabled`
read true while every call refused is gone.

* **Built**, in `packages/safebyok/src/models/bank.ts` unless named:
  * **`vacate(story?: VacateStory)`**, `{ cause?: VaultError }`, checked by `VX.vacateStory`
    (an `objCheck`, strict, `bad_option`). `VacateStory` is exported from the main entry.
    `DefaultOnPanic` calls `void bank.vacate({ cause: refusal })`.
  * **Disable first.** `vacate` lets go at once (`#letGo`): `isEnabled` false, every call refusing,
    the snapshot `refused` with the cause. Then it starts the scrub and answers its promise.
  * **One field for the end.** `#isEnabled` and `#isLive` are gone: `isEnabled` is
    `#endCause === null`, so a sweep and a vacate both disable in the one assignment.
  * **The host's handlers are a pair** (`#hostHandlers`: the guarded `onPanic`, the raw
    `onBadNews`). `get #handlers()` answers them while enabled, else `DefaultHandlers`. `panic`,
    `tellBadNews` and `autolock`'s listing go through `#handlers`; `vacate` hands
    `#hostHandlers` to `#eraseOwnLeases`, the one exception. `askUser` keeps its own switch.
  * **`#vacating`** is the only lifecycle state vacate adds: a repeat answers the first promise,
    and the guard is "vacated", not "disabled", so a vacate after a sweep still scrubs.
  * **Docs:** `onPanic` and `onBadNews` in `BankOpts`, the README's two bullets, the changeset,
    and the `notes/security.md` entry (amended by a sonnet subagent, marked `vacate_first`).
  * **Tests** (`bank-ending.test.ts` unless named): disabled at once with calls refusing and the
    cause in the snapshot; nothing past the disable reaches the host but the scrub's refused
    `tryForget`; a refused `tryListLeases` reaches the host's `onBadNews`; a repeat answers the
    same promise and lists once; a bad story refuses `bad_option`; `bank.test.ts`: `DefaultOnPanic`
    passes `{ cause }`, and a burst now reaches the host once.

* **Decisions taken**:
  * **No `.catch(...)` on the scrub**, though the Coach's sketch had one: lint refuses promise
    chaining (`unicorn/prefer-await`), and nothing in it can reject (`tryListLeases`, `tryForget`
    answer Outcomes, the guarded `onPanic` reports its own throws, bad news is not awaited). No
    `eslint-disable`.
  * **`askUser` stays out of the pair:** the scrub never asks the user.

* **Discoveries**:
  * **A vault's own lease erase now falls to the default** (item 4). `#vaultListing.vacate()`
    vacates each vault, whose `#vacateLease` panics through `bank.panic`, already disabled, so a
    refused erase goes to `DefaultOnPanic` (the platform; its `vault.vacate()` is a no-op). The
    scrub covers that row: the vault's `tryForget` is called before the scrub's `tryListLeases`,
    so a row it failed to erase is listed and retried, and a second refusal reaches the host's
    `onPanic`. If the listing is refused, the host hears that through `onBadNews` instead. No
    second exception added.
  * **A host `onPanic` that calls `DefaultOnPanic` hears a burst once**: the first call disables
    the bank synchronously, so the rest go to the default.

* **Races (rows)**:
  * An unlock in flight across a vacate can cache its lease after the scrub (unchanged).
  * A vault's erase and the scrub may forget the same row at once; a forget of a row gone is
    harmless, and a refusal of either is told (the vault's to the platform, the scrub's to the host).
  * The scrub's `tryListLeases` may answer before a vault's own `tryForget` lands: the row is listed
    and forgotten twice, harmlessly.

# Review fixes (2026-11-08)

Branch `20261108-review_fixes`, cut from `4bdf559a8`. Local only. Fixes from a review of `origin/main..4bdf559a8`.

* **Held, not built: the swept-bank scrub (review item 1).** The Coach doubts the race. A swept bank's late
  `identity_revoked` would reach `DefaultOnPanic`, whose `bank.vacate` scrub holds the host's handlers. The rule
  ("host handlers only if enabled when the vacate began") was built, then reverted before any commit. Traced:
  * `Listing.deliver` opens with `demandEnabled()`, so a fetch, put or delete answered after a sweep refuses
    before `panicIfRevoked`.
  * `VaultListing.list` and `BoxListing.list` check `demandEnabled()` only before their await. A
    `tryListVaults` (from `bank.hello`) or `tryListBoxes` (from `vault.hello`) in flight across a sweep that
    answers `identity_revoked` still calls `panicIfRevoked` on the disabled listing. That is the one path found.
* **Built**, in `packages/safebyok`:
  * **`vacate` is `async`**, so a bad story rejects. It still disables before its first await. A repeat
    settles with the first scrub, but is no longer the same promise.
  * **A hello crossed by a sweep or a vacate refuses with `#endCause`**, so the caller and `snapshot.err`
    agree: the vacate's `cause`, or `disabled`.
  * **`bank.panic` and `vault.panic` check their bag** (`VX.bankPanicArgs`, `VX.vaultPanicArgs`, `bad_option`,
    and the new `Phrases.VaultExpected`). Both stay public: `ListingWorld` and `VaultWorld` are `Pick`s of
    the public `Bank` and `Vault`, and hiding either would take a friend handle threaded through both
    listings, `Vault`'s world and the fakes.
  * **`vault.panic` names its vault.** It takes `{ refusal }` and forwards `vault: this`. This reverses
    thread 1's "relays without naming the vault": `Panic`'s doc promises the vault.
  * **Docs:**
    * the `disabled` comment in `refusals/errors.ts`;
    * `notes/guarantees.md` on the `askUser` and `onPanic` wraps, wording only: no guarantee found broken;
    * the two changesets, now telling one `Panic` story: handler_defaults carries the type's change of
    meaning, and bank_disable no longer says it "gains bank".
* **Tests:**
  * `bank-ending.test.ts`: a repeat vacate waits on the held scrub; a bad story rejects; a hello crossed
    by a vacate with a cause throws that cause.
  * `bank.test.ts`: a malformed panic is rejected; a box listing's revocation names its vault.
* **Races (rows)**:
  * A vault or box listing in flight across a sweep can still panic, as traced above, now waiting on the
    Coach.
