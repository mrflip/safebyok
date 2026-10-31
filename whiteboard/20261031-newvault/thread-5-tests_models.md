# Thread 5: tests_models (2026-10-31)

Branch `20261031-tests_models`, PR #411, stacked on #408 (`20261031-newvault_models`; rebased
onto its 4ff14b4b mid-thread, at the orchestrator's word, recorded as
`branch.20261031-tests_models.sprintbase`). Justify: green; core 4691 passed, 37 skipped.

* **Built**: tests from outside for the models' cryptography, in `packages/safebyok/tests/models/`:
  * `lease.test.ts` (63): grant and its kept record; get/tryGet, a kept lease of another vault
    or a malformed record reading as none with a warning that quotes no record; forget;
    isInForce; the autolock under fake timers; the stamp-bound sealWith/unsealWith (wrong stamp,
    swapped stamps, another vault, tampered ciphertext all `damaged_box`; malformed stamp
    `bad_option` with the whisper bytes still zeroed); tampered records (`damaged_lease`,
    `vault.lock()` called); what a lease shows.
  * `proving.test.ts` (54): makeProvingPair's arguments (a refused world never invokes the
    closure) and closure answers (PRF bytes zeroed on every refusal); the keyDeriver's answers
    (throws, wrong length, all zero, shared memory, not a view; its bytes zeroed); headers;
    makeWayin (both wayins open to one vaultKey); makeLease (what one proving's lease seals,
    the other's opens); what a proving shows.
  * `wayin.test.ts` (22), `gate.test.ts` (20): record checks, pickle, toJSON, props by kind.
* **Shared fakes, for thread 6**: `packages/safebyok/tests/test-helpers/proving-world.ts`,
  imported directly (not through `TH`, as `src/models/` is not exported): `useFakeClock`,
  `WorldStamp`, `duckVaultOf`/`asVault`, `fakeDBFriendOf` (a slot `kept`, a spy per verb,
  `logged`; script refusals with `mockResolvedValueOnce(bad(err))`), `WeekMillis`,
  `grantedLeaseOf`, `sealStampsOf`, `TestPassphrase`, `DeviceId`, `provingWorldOf`,
  `passkeyAnswerOf`, `proofClosureOf`, `isZeroed`, and the backdoor `_cheat_vaultKeyBytesOf`
  (opens a wayin from outside, from the secret, its header and the vault's stamp).
* **Loosened pins** (13), in `tests/loosened/lease.test.ts` and `tests/loosened/proving.test.ts`,
  each titled with its source and line. Split from `loosened.test.ts` by file, as the Coach
  asked for `/loosened/<testfilename>`.

## Loosened pins

Lease:
1. **Past autolock_at, before the timer fires**: not in force, still seals and opens
   (guarantees.md:230). Recommend sealWith/unsealWith refuse `vault_locked` when not in force.
2. **A lease longer than MaxTimerMillis (24.5 days) arms no timer and never autolocks**: it
   still seals a day past its autolock_at, and nothing calls the launch (spec:67). The sharpest
   finding: with pin 1 it means a 30-day lease never ends. Recommend #1, which fixes both.
3. **Lease.get hands back a lease already past its autolock_at**; it seals until the timer turn
   (guarantees.md:230). Recommend reading it as none, and forgetting it.
4. **A damaged lease** calls `vault.lock()` and keeps its record, in force, locking again at
   each call (guarantees.md:230, "dropped when it proves damaged"). With the real Vault the
   lock queues forget, so this may be fine; recommend the lease drop its own record too.
5. **A forget whose tryDelLease is refused** throws with the lease already forgotten; a second
   forget erases nothing, so the record lies on (spec:66). Recommend accept; note it.
6. **Empty stamps `{}` pass `ctxStamp`** (models-shapes.ts:644). Recommend requiring one field.

Provings:
7. **`PasskeyProving.make` takes a spent answer** (all-zero PRF bytes) (guarantees.md:201).
8, 9. **`PasskeyProving.make` refused before its try** (a bad world, a short salt) leaves the
   PRF bytes unzeroed (spec:52, "whatever happens"). Through makeProvingPair, `spendAnswer`
   covers both; only a direct caller sees it. Recommend parsing the answer inside `make`'s try.
10. **A short salt handed to `PasskeyProving.make` refuses `bad_record`**, not `bad_option`
    (vault.ts:353): the header mint's check speaks for an argument.
11. **`PassphraseProving.make` hands the keyDeriver an unchecked passphrase** (42) (CLAUDE.md:43).
12. **`makeWayin` takes a proving of another vault**, wrapping that vault's vaultKey into this
    vault's wayin (spec:53). Recommend refusing a source of another vault stamp.
13. **A second `makeWayin(NOVEL)` on one proving** fabricates another vaultKey; leases made
    after hold only the newer, so what an earlier lease sealed will not open (spec:53).
    Recommend refusing a second NOVEL, or say it is undefined in `notes/wontfix.md`.

## Decisions taken

* **Fake timers throughout** (`useFakeClock`): WebCrypto's promises do not wait on timers, so
  `vi.advanceTimersByTimeAsync` drives the autolock with no real waiting.
* **Both wayins open to one vaultKey** is shown two ways: by the backdoor's raw bytes, and from
  outside by a lease of each proving opening what the other sealed.
* **`TH.testDeriver`** is the fast deriver; no new one was made.

## Deviations

* The handoff placed `models-world.ts` in `tests/models/`; it is in `tests/test-helpers/`, and
  the new fakes sit beside it.
* Doc lines that only restated parameters were stripped from the fakes, per the Coach's ruling.

## Discoveries

* **The Lease has no snapshot**; `Object.keys`, `JSON.stringify` and `toJSON` are what show.
* **`Gate.build` makes no lease yet** (the code says "not yet"); the gate tests do not look for one.
* A seam that would help: none needed. Every test runs through exports; `_cheat_vaultKeyBytesOf`
  rebuilds the wayin key from the same exported crypto helpers a later unlock would use.

## For the Coach

* Rule on pins 1-2 together: a long lease never autolocking is the one I would fix first.
