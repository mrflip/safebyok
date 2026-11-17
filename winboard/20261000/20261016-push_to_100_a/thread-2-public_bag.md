# Thread 2: public_bag (2026-10-16)

Branch `20261016-public_bag`, PR [#133](https://github.com/mrflip/safebyok/pull/133), stacked on
[#128](https://github.com/mrflip/safebyok/pull/128). Justify: green (core 1692 passed, 33
skipped; every package and the demo green). `pnpm size`: every line under budget,
`DefaultValidators` 3.44 kB of 4 kB (was 3,844 B); `idbDeviceDB` 11.92 kB of 15 and
`browserOpts` 16.79 kB of 20, each about 2 kB more since `types.ts` now imports `stableJsonify`
for the bag's check.

* **Built**:
  - **Format snapshots** (G482), the first commit: `packages/safebyok/tests/types.test.ts`,
    *Stored record formats*, renders `VaultBundle`, `Lockbox`, `DeviceUnlock` and `DeviceMark`
    with Zod's `toJSONSchema` and keeps each as a snapshot (`tests/.snapshots/types.test.ts.snap`)
    under its own `format` literal, read from the schema. A change without a bump fails, saying
    "bump format"; a bump writes the new format's snapshot (`vitest -u`) and drops the old.
    Shown working: it failed at `-v2` with the new fields, and passed at `-v3`.
  - **The public bag** (G023): `store(boxlabel, whisper, { public })`, any JSON (`PublicBag`,
    exported), stored as `public_json`, its stable-serialized JSON text, always written, shown
    parsed as `box.public` in `LockboxSummary` and the snapshot. `maxWhisperBytes` counts whisper
    and bag together. A bag JSON cannot carry is `bad_option`, quoting nothing.
  - **Reserved** (G025): `whisper_codec: 'json_v1'` and `whisper_schema_version: 1`, literals in
    the record, bound, not in the summary, not settable.
  - **Binding** (G040): `LockboxFormat` leads the binding and is gone from the header (bound once);
    `CipherBindingPart` records hold no `undefined` (type) and `cipherBinding` refuses one at
    run time as `bad_option`.
  - Format `safebyok-lockbox-v3`. The note goes: `LockboxNote`, `MaxNoteChars`, `NoteFloor`,
    `NoteFloorBytes`, the `note` validator slot, `Names`' note kind, `VaultProvider`'s note check.
  - Adapters: Convex validators (and `toConvexLockbox`, now needless, removed); Postgres columns
    and DDL (`public_json text`, never `jsonb`); GraphQL SDL and fields; the battery's `boxOf`
    and a new `publicJsonOf`; the battery's text round trip now checks the bag's text byte for byte.
  - Demo: the note lives in `public.note`; a blank note leaves the bag out, so it stands (G357's
    last bullet). KnockKnock and the e2e Convex test moved too.
  - Docs: VOCABULARY, the READMEs, VAULTDB, `notes/security.md`, the changeset.

* **Decisions taken**:
  - **Stored as `public_json`, JSON text**, not an object under `public`: the bound bytes are the
    stored text itself, so no store can re-serialize them away. Convex refuses `$`-led and
    non-ASCII field names in objects, Postgres `jsonb` rewrites keys and spacing, GraphQL has no
    JSON scalar; a string survives all three. The API and snapshot say `public`.
  - **Left out, a store keeps the bag the lockbox has**; a new lockbox gets `{}`, and `{}`
    empties it. That is the note's old rule, and G357's fix needs it. Both `{}` and an omitted
    bag on a new lockbox write `'{}'`, so they bind alike (tested). *Open matter 1.*
  - **Any JSON**, `null`, strings and arrays included (the ruling's words), checked with the
    whisper's own JSON schema (`PublicBag` is `WhisperJson`).
  - **The bag rides in the whisper's room when weighed**: `lockboxWeight` drops the note term. A
    bag's text, escaped inside its record, is at most twice its JSON, a ciphered whisper 4/3 of
    its own, so twice `maxWhisperBytes` still bounds both (tested with a bag of quotes). So the
    vault's own `vault_full` never refuses a replacement now.
  - The empty bag's two bytes count: a whisper of exactly `maxWhisperBytes` no longer fits.
    *Open matter 2.*
  - `LockboxFieldsBytes` stays 2048, though the fields now need under 1000. *Open matter 3.*

* **Review fixes** (the orchestrator's YOLO calls on the review, built after it; the reviewer's
  own `67244e8d` fixed `store()`'s doc on a kept bag and `whisper_too_large`):
  - **A store no longer launders a tampered record.** `store()` carries the standing bag and
    `registered_at` forward only from a record that deciphers (`openedWhisperOf`, which replaced
    `holdsWhisper` at no extra cost); over one that will not, the bag is `{}` unless given and
    `registered_at` is now. Tests: a planted `{"note":"INJECTED"}` and a moved `registered_at`.
  - **A stored bag must be the vault's own serialization.** `Lockbox.public_json` requires
    `stableJsonify(JSON.parse(text)) === text`, in a try, so a bag nested too deep (once a bare
    `RangeError` from the snapshot's comparison, the vault unable to open), respaced or reordered
    lists as damaged. Tests: a 200,000-deep bag (fails without the fix), respaced and reordered
    bags; the battery's byte-for-byte test passes unchanged. Residual: a bag tuned just under the
    check's stack depth could still overflow the snapshot's comparison deeper in the stack; no
    depth cap was ruled, so none was added.
  - **Left as rows for the Coach** (open matters 4 and 5 below).
  - **Second review** (`67244e8d...b35aac3a`, `flagged`, no changes): both fixes hold; the
    canonical check refuses nothing the vault writes. Filed as it stands (the orchestrator's YOLO
    call); its one open finding is open matter 6. **For the rotation thread**: a lockbox under an
    older epoch does not decipher, so a store over it drops its bag; `openedWhisperOf` follows
    once `unwrappingKeyFor` learns the prior key.

* **Deviations**: none from the plan. Thread 7's demo edits will meet `VaultDashboard.tsx` at the
  restack; this thread touched only the note's move and the blank-entry fix there.

* **Discoveries**:
  - `toJSONSchema` renders no refinement: the floor's character rules, `priorFits`, the
    `public_json` JSON check. A change only there passes the snapshot test, and still needs a
    bump by hand. The test's comment says so.
  - In CI a bumped format whose snapshot was not committed fails as "mismatched" (with the bump
    message): commit the snapshot with the bump.
  - **Threads 3 and 4, at the restack**: thread 3's `safebyok-mark-v2` needs `pnpm --filter
    safebyok exec vitest run tests/types.test.ts -u` once, to write its snapshot and drop
    `safebyok-mark-v1`'s. Any other shape change does the same.
  - The snapshot's `box.public` is a fresh parsed object each listing, not frozen.

* **Gripes** (for the sweep):
  - **G023**: closed. Code: `types.ts` (`PublicBag`, `Lockbox.public_json`), `vault.ts`
    (`store`); docs: VOCABULARY, README, `notes/security.md`.
  - **G025**: closed. `Lockbox.whisper_codec` and `whisper_schema_version`, bound.
  - **G040**: closed. `crypto.ts` (`cipherBinding` refuses `undefined`), `vault.ts` (`boxBinding`
    binds the format once).
  - **G482**: closed. `tests/types.test.ts`, *Stored record formats*.
  - **G177** (the note half): closed: the note and its rule are gone; the bag is the host's to
    check (`notes/security.md`, the 2026-10-16 bag entry).
  - **G357**: its last bullet (a blank note clearing a box's note) closed in the demo; the row's
    other points are not this thread's.

* **For the Coach** (open matters, each built to the recommendation):
  1. **An omitted bag keeps the standing one.** Recommend keep: a host replacing a key need not
     re-send its metadata, and the demo's blank field relies on it. The alternative (omitted means
     `{}`) is one line in `store()`.
     - → *Coach (2026-10-16):* Keep for now; filed under RAGEBAIT.
  2. **The empty bag counts toward `maxWhisperBytes`.** Recommend keep, as ruled: a whisper at
     exactly the limit now needs two bytes more.
     - → *Coach (2026-10-16):* Yes, keep.
  3. **`LockboxFieldsBytes` could fall from 2048 to 1024.** Recommend leave it to thread 9 or
     later: lowering it lets `openVault` admit more lockboxes per backend, a behaviour change of
     its own.
     - → *Coach (2026-10-16):* Lower to 1,024 in thread 9, without letting many more lockboxes in.
  4. **Refuse unknown keys in `store()`'s options** (a leftover `note` is now silently ignored).
     From the review; not built. Recommend yes, as `bad_option`, as `validators` already refuses
     a field it does not know.
     - → *Coach (2026-10-16):* Refuse them in thread 9, through one helper shared with validators if possible.
  5. **Extend `cipherBinding`'s `undefined` guard to top-level parts and `null`.** From the
     review; not built. Recommend yes: the type already forbids both, and the guard is one line.
     - → *Coach (2026-10-16):* Yes, thread 9.
  6. **depth-band** (first in the PR): the record check passes bags ~4,700-6,100 deep on Node,
     `PublicBag` only ~3,000, so a planted bag between lists as sound, and `lockSoon(grace)`
     threw a bare `RangeError` at 5,800 under ~800 host frames before erasing the remembered
     unlock; a `store()` of a bag or whisper deeper than ~3,000 throws a bare `RangeError`.
     The reviewer recommends a stack-independent depth cap (~64), `bad_option` at `store()` and
     damaged in the record check; thread 9 builds it on a yes. Not built.
  7. **locksoon-order**: `lockSoon` calls `bump()` before `eraseUnlock`, so a throwing subscriber
     keeps the remembered unlock (older than this thread; `lock()` erases first).
  8. **lockbox-module**: the ~2 kB in `idbDeviceDB` and `browserOpts` is safe-stable-stringify,
     kept by `Lockbox`'s refine; `Lockbox` in a module of its own would let them drop it.
     - → *Coach (2026-10-16):* Yes, a file of its own, thread 9.
  9. **proto-key**: `__proto__` keys are silently dropped from bags and whispers.
     - → *Coach (2026-10-16):* No refusal: WONTFIX, undefined behaviour (thread 9 writes it).
