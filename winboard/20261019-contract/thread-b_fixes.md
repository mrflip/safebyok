# Thread b_fixes: phase B's closing fixes (2026-10-21)

Branch `20261020-b_fixes`, PR [#212](https://github.com/mrflip/safebyok/pull/212), cut from #209's
tip (47ab50be, merged). Justify: green. Core 2603 passed, 35 skipped; react 280; convex 274 (8
skipped); postgres 268 (14 skipped); graphql 262 (14 skipped); indexeddb 144 (10 skipped);
fastkey 49; demo 203 (16 skipped); e2e 89 (96 skipped); root 265.

Resumed from a worker stopped mid-build. Its uncommitted work (S1 and S2 begun) was sound and is
kept: the checker's parse moved inside its guard, with two tests; `#movedOn` split from
`#outrun`, the grant erasing its lease once the props moved on, with two race tests. Changed from
it: the throwing-verdict helper moved to module scope (lint), the test titles reworded, the
refusal's message also names a verdict that threw as it was read, and the grant no longer writes
a lease it would at once erase (S2, below). Discarded: nothing.

* **Built**:
  * **S1** (`src/passphrase-strength.ts`): `checkStrongEnough` parses the verdict inside the
    `try`. A verdict whose `strong` or `reason` getter throws is now `unexpected_error`, carrying
    nothing. Both tests fail without the fix. React's `adviceFrom` already read the verdict inside
    its `try`.
  * **S2** (`src/vault.ts`, `#grantLease`): `isVoided` (overtaken, or the props moved on) is asked
    before the write, which is then skipped, and after it, which erases what was written. A close
    on its own still erases nothing. Both race tests (`vault-races.test.ts`: a `del()` landing
    while an unlock's or a `putWayin()`'s lease is written) fail without the fix.
  * **D1's test** (`vault-lease.test.ts`, "an unlock this device cannot keep a lease for"):
    pinned as built. An unlock whose `putLease` fails is refused `storage_blocked` (a quota) or
    `storage_unavailable`, and the vault stays locked. That holds for the first unlock too: the
    vault is created in storage and left locked here.
  * **M1**: the doc of `KeyDeriver.deriveKeyBytes` tells a host that a non-condition throw
    reaches the caller whole, as `cause`. `hostThrewRefusal`'s doc says the same, and no longer
    says another copy's condition passes through.
  * **M3**: `Wayin.toJSON()` gives `summary`, and `Lease.toJSON()` gives every field but
    `lease_key` and `vault_key_lease_wrapped`. Tests in `wayin.test.ts` and `lease.test.ts`.
  * **Refusals at the call that names them** (`vault-wayins.test.ts`, *Refusals at a change*):
    each of putWayin with a passphrase, putWayin with a passkey, and delWayin is refused
    `absent_vault`, `damaged_wayin`, `stale_write`, `storage_unavailable`, `unknown_key_deriver`,
    `unexpected_error` (the deriver), `damaged_vault`, `newer_format`, `rolled_back` and
    `identity_revoked`, and each leaves the stored props byte for byte. The checker's
    `bad_option` and `unexpected_error` are provoked at putWayin. These are provoked from real
    stored state where the vault itself decides the refusal, and from a mocked adapter answer
    only where the adapter would give it.
  * **Pass 1's minor lines**: a replaced passphrase or passkey still opens an older copy; putWayin
    logs no passphrase or answer; Does 1 refuses before any storage read; delWayin's fresh read
    and single derivation; no lease reaches the backend; the whisper's keys are sorted (opened
    in key order, `box.test.ts`).
  * **B5's leftovers**: `hello`'s third example, and its test, use `void vault.tryHello()`.
    React's dialog test narrows `getProof` with an `if` and no longer uses `!`.
  * **`notes/security.md`**, through a sonnet subagent: S1, S2 (with the other-handle limit), the
    lease's power (an extractable unwrap through `lease_key`), M3, `box_stored`'s two passages
    reconciled, the vault props' `registered_at` added to two ctx lists, M1, the retired names
    (`last_wayin`, `addPassphrase`, "the prior's", "rotates too", "a rotation committed
    after"), B4's three wordings (secure_floor, "one proof, one seal and one lease wrap", the
    putWayin history), and the blank-passphrase sentence.
* **Decisions taken**:
  * S2 erases the lease without first reading it back. Suppose another grant on this handle
    (say, the change that outran this one) writes between this grant's write and its erase.
    Then that lease is erased too. That fails safe: the next open asks for the passphrase. A
    check-then-erase would be the "if X then Y" the ground rules keep out of the core.
  * D1 stays as built, and the tests pin it (YOLO; the row stands with the Coach).
  * Box's `toJSON` still gives its record (ciphertext and the wrapped boxKey, neither a guessable
    secret): M3 named only Wayin and Lease.
* **Discoveries**:
  * S2's fix closes the race on one handle only. A `del()` through another handle (another tab)
    is not seen by this handle until it reads, so a grant racing it can still leave a lease. The
    notes record this; the fix is the cross-device mechanism the progress doc defers.
  * The proof-reference guarantee and `box.tryOpen`'s dropped boxKey stay untested. A dropped
    reference cannot be observed from a test.
  * A blank passphrase at create is `wrong_passphrase` (through `Proof.parse`), not
    `weak_passphrase`: this is B4's known "two kinds" row, unchanged.
* **For the Coach**: D1 (an unlock refuses when its lease can't be written, where the Contract
  says it stays unlocked) still needs its ruling; the tests pin today's behaviour, so either
  answer is a small change.
