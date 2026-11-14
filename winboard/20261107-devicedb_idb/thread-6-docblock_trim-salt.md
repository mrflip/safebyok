# Thread 6, second rework: one passphrase salt length (2026-11-07)

Read this if you file or rework thread 6. Branch `20261107-docblock_trim`; **PR #580 was merged at
a0af95a9d (10:26) before the first rework's commits landed**, so the first rework's commits and these sit
on the branch unmerged, filed as [#592](https://github.com/mrflip/safebyok/pull/592) (see *For the Coach*). Justify green: safebyok 2417
tests, fastkey 43, every package passing; lint 0 errors, 376 warnings (378 before).

* **Built** (commits dd6b84301, 151484678 and the docs commit after them)
  - The Coach's ruling (Open Matters, 2026-11-07): "reverse my decision ... Make the key deriver
    force the exact length we use ... don't decode it just to count length, or catch and re-throw the
    errors." The length is 16 bytes (RFC 9106; the default spec's), 22 b64url characters. The 43-character
    salts are passkey PRF salts and are untouched.
  - `PassphraseSaltBytes = 16` (`helpers/consts.ts`) replaces `MinSaltBytes`/`MaxSaltBytes`.
  - `salt_b64` (`shapes/shapes-core.ts`): `str.length(PassphraseSaltChars)` + `Patterns.b64url`, no
    decode; `PassphraseSaltChars` is `Math.ceil(16 * 4 / 3)`, local to the file. Phrase
    `passphraseSaltShape(saltBytes, saltChars)`.
  - `keyDeriverSpec` (`deriver/shapes.ts`) and `keyDeriverShape` (`shapes-core.ts`) take
    `salt_bytes: lit(PassphraseSaltBytes)`; `KeyDeriver['salt_bytes']` is the type `typeof
    PassphraseSaltBytes` (16), as the shape's AssertEqual demands. The field is kept, pinned. Refusal
    reads `keyDeriver: salt_bytes: Invalid input: expected 16.` `KeyDeriverShape` and
    `KeyDeriverSpecShape` phrases name the 16.
  - Gone: `checkSaltFits` (`deriver/basederiver.ts`, and its export from `safebyok/browser`),
    `saltDoesNotFit` thrower and phrase, their calls in `argon2idDeriver` and in
    `safebyok-fastkey`'s `deriveWithWasm`, and their tests (core `browser.test.ts`, fastkey's
    salt-length refusals; fastkey's 32-byte-salt spec cases now 15 and 32 as refusals).
  - `deriveKeyBytes` (`models/proving.ts`) is back to `catch { throw keyDeriverThrew() }`, as before
    b3217ccf7. Test: a host deriver's `VaultError` quoting the passphrase in message, cause and meta
    arrives as `unexpected_error`, not itself, with no cause or meta and the passphrase nowhere in
    `thrownText`. The `TypeError` test stays.
  - `saltBytesOf` still refuses an undecodable salt as `bad_record`; its test keeps the one case a
    22-character salt can still hit (stray trailing bits); the 25- and 41-character cases went, as
    `salt_b64` now refuses them first.
  - Ride-along: the DeviceDB battery's raw-lease deletion test is two tests, one behaviour each,
    each deleting by the scopepath `listRawLeases` answered.
  - Changeset `20261107-docblock_trim.md`: the pass-through sentence replaced by what a host sees;
    `safebyok-fastkey: minor` added; *Stored format* now says a `salt_b64` of another length reads
    as damaged.

* **Decisions taken**
  - `lit(16)` and a literal type rather than `int.gte(16).lte(16)` under `number`: the compiler tells a
    TypeScript host, and the AssertEqual keeps the interface and the check one.
  - `notes/guarantees.md`: G8 and *Where the guarantees are kept* were not changed by this sprint and
    match the code again, so they stand. **G10's** sentence "checked by its interface ... not by its
    parameters" was now false, so it names the salt length (16, `PassphraseSaltBytes`) and says "not by
    its other parameters". The `guardKeyDeriver` comment in `proving.ts` says the same.
  - `notes/security.md`, by a `sonnet` subagent per its header: the 2026-10-26 *brands* entry
    amended (the 16-to-32 range no longer holds); the 2026-10-23 core_cleanups paragraph and the
    2026-10-16 label entry amended where they said a deriver's VaultError keeps its kind or the
    derivers check the salt per call. The header says an amendment changes no other entry; the
    subagent touched two non-primary entries because they now say false things. Kept.

* **Set aside**
  - Decoding to count bytes (the ruling forbids it); a `PassphraseSaltChars` export (nothing outside
    the shapes file needs it); dropping `salt_bytes` from `KeyDeriver` (the Coach may; not now).

* **For the Coach**
  - PR #580 is merged; the first rework's twelve commits and these are filed as #592, from this branch.
    The branch is 71 commits behind `origin/main`; main's `browser.ts` and `browser.test.ts` touch the
    lines this removes `checkSaltFits` from, so `file-thread` will likely stop at exit 3 (small
    conflicts, plain to resolve).
