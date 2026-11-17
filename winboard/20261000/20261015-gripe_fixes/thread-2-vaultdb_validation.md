# Thread 2: vaultdb_validation (2026-10-15)

Branch `20261015-vaultdb_validation`, PR #70, stacked on #66 (rebased onto its tip
`5fefc90`). Justify: green (root 105,
safebyok 768, safebyok-convex 267, safebyok-react 28, demo 62; publint, attw and `pnpm size`
clean).

The survey is in [`validation-survey.md`](validation-survey.md), beside this file: every
entrypoint, what was checked, and the disposition of each gap. Read it before adding a check.

* **Built**:
  - `VaultDB`'s write verbs (`vault-db.ts`) validate their record (`VaultBundle`, `Lockbox`)
    and their expectation before the adapter's half: `bad_option`, `bad_label` for a label,
    never quoting. `updateBundle` refuses a `vault_id` other than the expected one. The three
    expectation types are now inferred from private schemas, with the same shape.
    `VaultDB.subscribe` refuses a non-function `onChange`.
  - `src/idb-opts.ts` (private, not an entry): one parser for `dbName` (non-empty text, default
    `safebyok`) and `inspectIdb`'s `shelf`, used by `idbVaultDB`, `idbDeviceDB`, `inspectIdb`
    and `browserOpts`. `IdbOpts`/`IdbShelf` are re-exported from `idb.ts` as before.
  - `openVault` checks the bag, `userId` (non-empty text), and the shapes of `vaultDB` and
    `deviceDB`. `unlock`/`changePassphrase` refuse a non-text passphrase; `subscribe` and `use`
    a non-function. The remembered unlock compares the record's scope.
  - The size check's constants (`vault.ts`): `StoredBytesPerWhisperByte = 2`,
    `LockboxFieldsBytes = 2048`, exported from the module (not the package) for a test that
    builds the heaviest row with real ciphertext.
  - Tests: a bulk table of refused writes (`vault-db.test.ts`), one new case in
    `describeVaultDB`, `idb-opts.test.ts`, dbName tables, the openVault door, the scope rows of
    `SpoiledUnlocks`, the allowance proof for six whisper sizes.
  - Changeset `20261015-vaultdb_validation.md` (safebyok minor); one `notes/security.md` entry.

* **Decisions taken**:
  - **Write checks are at the boundary.** `VaultDB`'s verbs are public and exported, and the
    over-long-note brick showed that "vault.ts builds them" was not enough: never write what a
    read refuses. The adapter is handed the parsed record, so unknown fields are stripped.
  - **Kind `bad_option`**, not a new kind; the README row is broadened.
  - **`listBoxes` stays projected**: one damaged box must not fail the vault's open.
  - **Allowance reframed, not raised**: identical outcomes, honest constants (see the survey's
    last section for the arithmetic, and why raising it breaks the Convex defaults).
  - **`domStore`/`localVaultDB` unchecked**: a missing `localStorage` is a condition.

* **Deviations**:
  - The Convex test "never quotes a record the deployment refused" relied on Zod letting an
    unknown field through; the core now strips it, so the test adds the stray field on the wire
    with a wrapping client. Same assertion, same refusal. Thread 6 strengthens this test next:
    build on the wrapped client.

* **Discoveries**:
  - A lockbox whose stored shape is damaged can be neither stored over nor erased: both read it
    first and meet `corrupt_record`. Only `destroy()` clears it.
  - A listener that *throws* (as opposed to a non-function) still aborts a ring loop: in
    `idb.ts` and the string stores, after the write has landed, so the write rejects as
    `storage_unavailable`. Not validation; left.
  - The `openVault` size budget has 0.23 kB of headroom left (16.27 of 16.5 kB; base 15.9).
  - The plan's "256 characters of up to 4 UTF-8 bytes" overcounts: `LockboxNote` counts UTF-16
    code units, at most 3 UTF-8 bytes each (a 4-byte character takes two). The Convex fill test
    uses 256 four-byte characters, a note the core would refuse.

* **Review** (medium, `fixed`): the reviewer's 9ffb0d4 (now 9f88c6f) has `maxVaultBytes`'s doc and
  the security note say the 2 KiB holds for a `user_id` of up to 512 bytes, and what a longer one
  or an escaped note draws on. Its findings left are in the PR's open questions: `openVault`
  duck-types `vaultDB`, so a hand-written object skips the base class's write checks; `updateBox`
  with no lockbox reports `bad_label` (deliberate, pinned); small duplications (`checkOutgoing`
  and `checkRecord`, four listener checks, `isOfScope` and `checkBundle`'s scope comparison, a
  double parse per write); the two size constants exported from `vault.ts` for the test.

* **For the Coach**:
  - The allowance: is the reframing enough, or do you want a stricter accounting (an explicit
    base64 term and a smaller backend share)? That one changes the admitted capacities: at the
    defaults over Convex, 101 becomes 100, and 4092 tiny whispers become about 2900.
  - Should `erase()` tolerate a box that reads back `corrupt_record`, so a user can clear one
    damaged box without destroying the vault?
  - `SafebyokComponent.api({ getUserId })`: check `getUserId` at module load? It needs a plain
    `Error` or the core's `VaultError` in server code.
  - `user_id` has no length bound, so the 2 KiB covering it is an assumption (512 bytes); a
    bound is a stored-format and API call, with the allowance question above.
  - **`openVault`'s size budget**: #68 (thread 1) takes it to 16.19 kB, this thread to 16.27 kB,
    each from 15.9 against 16.5. Together they likely exceed it: whichever merges second needs a
    raised budget or a trim.
