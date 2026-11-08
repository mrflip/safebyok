# Thread 1: Bank gets a one-way `isEnabled`, and a disabled bank calls no host handler (2026-11-08)

Branch `20261108-bank_disable`, cut from `d268287a0` (the Coach's unpushed wip on
`20261108-handler_defaults`). Local only: not pushed, no PR, by the Coach's word. Justify: core
2484 tests pass, along with every other package except `safebyok-react`. Its lint has 4 errors
that were already in the base wip. Its `bank-provider.test.tsx` has 3 failing tests, and this
thread causes them (see *For the Coach*).

* **Built**, in `packages/safebyok`:
  * `Bank` (`src/models/bank.ts`) gets `#isEnabled`, a public `get isEnabled()` and a public
    `demandEnabled()`. These follow the listing's pattern and refuse with
    `bankDisabled()` (`'disabled'`, `Phrases.BankLetGo`).
  * The constructor now builds the one `#vaultListing`, and `#makeListing` is gone.
  * `sweep()` and `vacate()` both go through `#disable(discard)`, which is one-way. A repeat is a
    no-op, except that `vacate` always erases the bank's own cached leases.
  * `hello` calls `demandEnabled` first. If a sweep or a vacate crosses a hello, the hello does
    not overwrite the disabled bank's snapshot.
  * Through `isEnabled`, the bank chooses its handlers. `panic`, `askUser` and `#hearBadNews`
    call the host's `onPanic`, `requestCleartext` and `onBadNews` only while the bank is
    enabled. After that they fall back to the core's defaults:
    * `DefaultPanic` is `guardOnPanic(DefaultOnPanic)`, which reports to the platform;
    * `askUser` resolves `true`, as if the dialog closed unshown, so the gating settles
      `declined`;
    * bad news goes to `DefaultOnBadNews`, which hands it to the bank's logger.
  * `BankStage` and `BankSnapshot.err` doc blocks now cover the disabled bank. The README has a
    new bullet, "A bank swept or vacated is spent". The changeset is
    `.changeset/20261108-bank_disable.md` (minor).
  * Tests:
    * `bank.test.ts`: handlers after a sweep and after a vacate; news after a revocation goes to
      the logger.
    * `bank-ending.test.ts`:
      * the `bank.isEnabled` describe;
      * vacate after sweep still erases;
      * a box put that a vacate crosses refuses `disabled`;
      * a vacate panic goes to the platform, not `onPanic`.
    * `proof.test.ts`: sign-out followed by a next bank; one StrictMode test where a fresh bank
      picks up the cached lease.
    * The sweep-then-hello tests are deleted.

* **Lifecycle, as verified**:
  * **`identity_revoked` still reaches the host.** `#hearBadNews` chooses `onBadNews` before it
    vacates, so the revocation is the last news the host hears. Later news goes to the logger.
  * **Vacate is terminal.** This matches the README's existing "vacate, then `Bank.make`".
  * **In-flight work refuses.** The listing's `deliver`, `buildOrReceive`, `fetch`, `put` and
    `delOver` already call `demandEnabled`. Work that a vacate crosses therefore refuses
    `disabled` ("expire in flames"), with no new reporting.
  * A bank has no delete, so "deleted" does not apply to it.

* **Decisions taken** (the simplest option each time):
  * **Handler choice happens when the call is made.** A disabled bank never calls a host
    function, even one wrapped before the disable. I rejected swapping the stored handlers,
    because the wraps are branded `Guarded` and the vault world holds them.
  * **A disabled bank's snapshot is stage `refused` with err `disabled`.** Before, a swept bank
    reverted to `made`. `refused` with the reason is truthful, and it needs no new stage.
  * **`ensureVault` and `vaultAt` refuse `disabled`** (`BankLetGo`) through the unchanged
    `#demandReady`, because `#lastHello` holds the bank's refusal.
  * **A vacate on a bank already swept still erases its cached leases.** A sign-out that runs
    after React's cleanup must still erase.

* **Deviations**:
  * A lease that the vacate fails to erase is now reported to the platform (`DefaultOnPanic`),
    never to the host's `onPanic`. This applies both to the bank's own erase and to a vault's
    vacate erase, because the bank is already disabled when they run. I set aside the
    alternative of handing those erases the host's `onPanic`: it would have needed a second
    path around the rule.

* **Discoveries**:
  * **The React provider needs a follow-up** (out of this thread's scope). Three assertions in
    `packages/safebyok-react/tests/bank-provider.test.tsx` (lines 41, 51 and 72) expect a swept
    bank to read `made`. The fix is to replace each `?.snapshot.stage).to.eq('made')` with
    `?.isEnabled).to.eq(false)`. With that change all 31 tests pass. I tried it and then
    restored the file, so the branch does not touch the react package.
  * **The provider is keyed on applabel and `user_id`.** After an `identity_revoked`, the same
    user signing in again would keep a dead bank. The provider has to remake the bank when
    `isEnabled` turns false.

* **Race (a row, not a fix)**: an unlock already in flight when a vacate runs can store its lease
  in the deviceDB after the vacate's erase. The lease outlives the sign-out until the next
  vacate.

* **For the Coach**:
  * **Vacate erase panics go to the platform.** I recommend keeping this: the host may already
    belong to the next user.
  * **Disabled snapshot reads `refused/disabled`**, not `made`. I recommend keeping it.
  * **Vacate after sweep still erases.** I recommend keeping it.
  * **The react tests and the provider remake belong to the provider thread.** Apply the
    three-line test patch above with this thread, or on the provider thread.
  * **In-flight unlock lease race**: recorded only.
