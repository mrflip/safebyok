# Thread a_sec: phase A's security fix-up (2026-10-19)

Branch `20261019-a_sec`, [PR #203](https://github.com/mrflip/safebyok/pull/203), stacked on
[#195](https://github.com/mrflip/safebyok/pull/195) (`20261019-outcome_adapters`; to be restacked
onto B1). Justify: green; core 2392 (35 skipped), react 274, demo 215 (16 skipped), 0 failed.

The findings are phase A's pass-2 security review (posted on the sprint PR #192): F1-F4, and
three items queued from A6's review. Each fix has a regression test that fails without it
(checked by stashing the fix and running the suite).

* **Built**:
  * **F1, an answered ask stands its attempts down** (`packages/safebyok/src/ask.ts`). `Ask` keeps a
    second `AbortController`, `#over`, beside `#landed`. `#landed` is aborted only by a lock landing
    and still settles `lockLanded` (its meaning unchanged). `#over` is aborted by a lock landing
    *and* by the ask's answer settling, whatever the answer, before any waiter hears it; it is the
    signal the attempter gets. So every attempt in flight belongs to an ask that is either still up
    (reached by `#landLock`) or answered (already stood down): a lock reaches every attempt, with
    nothing tracked past the prompt. `ask.attempt` after the answer refuses `vault_locked` at once.
    `#unlockWith`'s overtaken message now says "a lock landed, or it was answered".
  * **F2, a take-up outrun by new vault props** (`vault.ts`, `#takeUpLease`). It reads `standing`
    (the vault props) as it begins, fits the lease against those, and asks
    `overtaken.aborted || #outrun(standing)` after each wait: after the unwrap it takes nothing up
    if the `vault_id` or `unlock_epoch` moved (or the handle closed). The lease is left for the next
    hello to judge against the props then standing (the test shows it is discarded then).
  * **F3, the provider's gates** (`vault-provider.tsx`). `badNewsRef` and `hostAskerRef` now move
    in passive effects, not layout effects. React runs every passive cleanup before any passive
    effect, so the open effect's cleanup (`kept.held = false`, `close()`) has run before the next
    user's handlers are in the refs. Between the commit and the passive flush the old vault still
    reaches the old user's handlers, which is right: it is still that user's vault.
  * **F4 and F5, one mechanism** (`boundary.tsx`, `forBoundary(err)`). Everything the dialog and
    the passkey button throw in render for their boundary goes through it: a VaultError keeps
    kind, message and meta but loses its `cause` (one with no cause is thrown as itself, so the
    "very error" tests for those still hold); anything else becomes a fixed `unexpected_error`
    (`Sanitizer.refusalFor`). A host `passphraseAdvice` throw is replaced at its source with a
    fixed refusal naming `passphraseAdvice` (it heard every keystroke), so even a VaultError it
    threw carries nothing on.
  * **F6, the trouble notice follows the ask** (`passphrase-modal.tsx`). `PassphraseModal` renders
    `AnsweringOnce` (keyed by the ask's round), which holds `useAnswerOnce` above the boundary and
    hands its `done` to both the form and `DialogTrouble`: a lock landing closes the notice with
    `declined`, a vault unlocked under it answers `unlocked`, and a later Close says nothing more.
  * **Docs**: core README (*Asking for a proof*: an answered ask's attempts), react README (what
    `onCaughtError` receives), doc blocks of `Ask.attempt`, `PassphraseModal`,
    `PasskeyUnlockButton`, `Boundary`. `notes/security.md` through a sonnet subagent.
* **Decisions taken**:
  * **Any answer stands the attempts down, `unlocked` included**, not only "anything but
    `unlocked`" as the finding offered. The shipped dialog does not disable Unlock while an
    attempt runs, so Enter twice makes two attempts: the first unlocks and answers, the second was
    beyond every lock's reach, F1 again. With any answer ending the prompt, no tracking of answered
    asks is needed (the finding's other option, "a lock reaches every attempt, tracked or not").
  * **F3 by moving the refs, not by tagging them or a second layout effect**: two lines, no
    duplicated dependency list, and it relies on a React guarantee (passive unmounts before
    passive mounts) rather than on effect order within the component.
* **How it sits with the lock-timing policy**: no counters, no second lock kind. `#takeUp` (A3)
  is the take-up's controller, aborted by `#dropKey`/`#grantLease`; F2 adds no controller, only a
  check of the vault props the take-up began with, as `#grantLease` already does with
  `#outrun(standing)`. The ask's controller (A6) stays the one `lockLanded` reads; `#over` is the
  attempts' signal, aborted by the same lock plus the answer. Nothing else about lock timing is
  pinned: `unlock()` outside a prompt racing `lock()` (TODO scenario 1) and the relocks that do not
  land as locks (`identity_revoked`, `rolled_back`) are untouched.
* **Rework after review** (on the reviewer's `4f342f43`): F2 now wins by construction in
  `#takeStorage` (a read records outrunning props and drops the key before its next await), the
  make and revise paths no longer write older props over them, and a key deriver's or strength
  test's own misuse becomes `unexpected_error`. Details and counts, for the second reviewer and
  whoever restacks: [thread-a_sec-rework.md](thread-a_sec-rework.md).
* **Deviations**:
  * **A condition from a deriver or strength test still passes through as it came** (the directive
    said any throw, a VaultError included). Wrapping those would turn zxcvbn's `storage_unavailable`
    (its word list failed to load: "try again shortly") and safebyok-fastkey's `wrong_passphrase`
    for an empty passphrase into a trouble notice, and break the dialog's retry. Conditions never
    reach `onCaughtError` (the dialog shows them in place or closes), so the README's "carries
    nothing the user typed" holds. Another copy's VaultError (an ESM and a CJS build side by side)
    is recognized as `outcomeOf` recognizes it. Open Matter below.
* **Discoveries**:
  * **A dialog test pinned the old behaviour**: "lets an attempt finishing after Cancel unlock
    the vault, which answers a newer dialog too" is now "stands an attempt down when the user
    cancels during it: a newer dialog stays asking, and the vault stays locked". Three react tests
    that expected the boundary to see `cause` (or the advice's very throw) now expect it stripped.
  * **An answer landing exactly while an attempt writes its lease** erases the lease it just
    wrote (as an overtaken attempt does), and with it the lease it overwrote. Under
    `lease_ending`, and under `locked` with a double submit (the first attempt unlocks and answers;
    the second, mid-write, erases the first's lease), the key in memory stays until its deadline
    and the next reload asks. Both fail safe; kept as is.

* **Test counts** (vitest totals including skipped), base `19c0cc87` to tip: core 2378 (35) to
  2384 (35): `tests/vault/vault-lease.test.ts` 130 to 134 (F1), `vault-hello.test.ts` 92 to 94
  (F2, epoch and remade vault). React 263 to 268: `passphrase-modal.test.tsx` 98 to 101 (F5 meta
  and cause, F6 lock and unlock under the notice; F4's and a cause test rewritten),
  `vault-provider-hooks` 12 to 13 and `vault-provider-dialog` 26 to 27 (F3; one dialog test
  rewritten for F1), `passkey-unlock-button.test.tsx` 18 unchanged (one rewritten). Every new
  test was run against the unfixed source and failed. Every other workspace unchanged.
* **Size**: `pnpm size:budget --write`: `everything` 41 to 42 kB, `VaultProvider` 8.3 to 8.5,
  `reactEverything` 8.7 to 9.
* **Security notes**: six facts folded into four existing entries (A6 `lockLanded`, the A3
  take-up amendment, A6 `getProof`'s gating, the 2026-10-15 boundary entry). The A5 entry still
  says the provider's ref is "updated in a layout effect"; the new text says it replaces that.
  The rework's two facts folded into the A3 take-up amendment and the A4 host-throw paragraph.

* **For the Coach** (Open Matters):
  * **Cancel now means cancel**: an attempt still running when the user cancels unlocks nothing
    (A6 had it "may unlock the vault afterwards"). Recommend: keep; the finding's fix, and the
    only one that keeps a later `lock()` effective.
  * **A host advice throw is reported as a fixed refusal**, not swallowed as the default
    `adviceFrom` swallows a strength test's throw. Recommend: keep reporting (a broken advice
    function is a bug the developer should see), with nothing of it quoted.
  * **Conditions from a deriver or strength test pass through** (see *Deviations*). Recommend:
    keep; the alternative breaks zxcvbn's retry and fastkey's empty-passphrase gripe.
