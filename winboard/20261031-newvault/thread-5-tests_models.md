# Thread 5: tests_models (2026-10-31)

Branch `20261031-tests_models`, PR #411, stacked on #414 (`20261031-gate_ops`, a69bdef8), in
the line main → #408 → #410 → #412 → #413 → #414 → #411 (restacked from beside #408; see
*Restack*). Justify: green; core 4751 passed, 37 skipped.

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
  `WorldStamp`, `duckVaultOf` (a lease's vault; a proving or gate takes `WorldStamp`), `fakeDBFriendOf` (a slot `kept`, a spy per verb,
  `logged`; script refusals with `mockResolvedValueOnce(bad(err))`), `WeekMillis`,
  `grantedLeaseOf`, `sealStampsOf`, `TestPassphrase`, `DeviceId`, `provingWorldOf`,
  `passkeyAnswerOf`, `proofClosureOf`, `isZeroed`, and the backdoor `_cheat_vaultKeyBytesOf`
  (opens a wayin from outside, from the secret, its header and the vault's stamp).
* **Loosened pins**: 13 at the build; after the restack one stays, in `tests/loosened/lease.test.ts`
  (titled with its source and line, one file per model as the Coach asked). The rest were
  fixed by threads 1 to 3 and flipped into the models' tests, or dropped (*Restack*).

## Loosened pins, as built

The thirteen pins and their recommendations are in this file at 248735356. Every
recommendation but #5 was taken up by threads 1 to 3; *Restack* says where each pin went.

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
* **`Gate.build` makes no lease**: since thread 2 it answers `{ gate, proving }`, the proving granting the first lease (pinned through a real vault in `vault-unlock.test.ts`).
* A seam that would help: none needed. Every test runs through exports; `_cheat_vaultKeyBytesOf`
  rebuilds the wayin key from the same exported crypto helpers a later unlock would use.

## Restack (2026-10-31)

Rebased from 4ff14b4b onto a69bdef8 (#414's tip) with no conflicts; the adaptations are one
`tests:` commit on top. No `src/` change.

* **Stamp signatures** (thread 1): `Gate.build`, `new Gate`, `makeProvingPair`,
  `PassphraseProving.make`, `PasskeyProving.make` take `WorldStamp`; `makeLease(vault, friend,
  opts)` takes a `duckVaultOf()`. `asVault` is gone from `proving-world.ts` (nothing needs a
  `Vault` cast now; a `DuckVault` is a `LeaseVault`). Describe titles say `stamp`; the argument
  cases are "a stamp with no vault_tok", "... no epoch millis", "no stamp at all"; `gate.stamp`
  is pinned as the parsed `WorldStamp` where `gate.vault` was the vault handed.
* **`Gate.build` answers `{ gate, proving }`** (thread 2): `builtGate` destructures the gate.
* **The autolock** (thread 4): at `autolock_at` it locks the vault and lets go, erasing nothing
  itself (lock() erases by scope); the warning test now scripts `vault.lock()` to throw.
* **A tampered lease record** (threads 2, 4): its first seal or unseal locks the vault once,
  refuses `damaged_lease` and lets go, erasing nothing itself; the next refuses `vault_locked`.
* **Loosened pins, by build number**:
  - Flipped into `tests/models/lease.test.ts`: 1 (refuses `vault_locked` past `autolock_at`
    before the timer), 3 (`Lease.get` answers null and erases once). 4 (damaged) is absorbed by
    the tampered cases above and dropped.
  - Retitled as by design and moved to `lease.test.ts`'s autolock: 2, citing
    `notes/wontfix.md:44`; it now refuses `vault_locked` too.
  - Stays loosened: 5 (spec line now :73).
  - Dropped: 6, empty stamps (thread 3 refuses them; pinned in `vault-unlock.test.ts`).
  - Flipped into `tests/models/proving.test.ts`: 7 (spent answer refused), 8, 9, 10 (a refused
    world or a short salt refuses `bad_option` and zeroes the PRF bytes, the salt as
    freshPasskeyAnswer's second example shows), 11 (`PassphraseProving.make` refuses 42 before
    the keyDeriver), 12 (a source of another vault refused `bad_option`), 13 (a second
    `makeWayin` refused `unexpected_error`, and a later lease still opens what the first sealed).
    `tests/loosened/proving.test.ts` is deleted, empty.

## For the Coach

* Pin 5 stands: a forget whose erase is refused throws, and a second erases nothing.
