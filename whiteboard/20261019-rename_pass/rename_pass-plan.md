# rename_pass: the names of the store reform, moved first, so git can follow

**No back-compat layer, no migrations, no catering to vestigial names or methods.** This is
pre-pre-alpha: a placeholder npm publish and nothing else. An old stored record fails safe (reads
as absent or damaged) and the changeset says so. Every plan and every stage of the reform opens
with this line.

A session, not a sprint: the Coach runs it directly. Branch `20261019-rename_pass`, cut from `main`
after softlock_gone lands. Runs before the store reform itself, so that every file the reform
rewrites is already under its final name and git's rename detection is never asked to see through
a rename and a rewrite in one commit.

Rulings of 2026-10-19 (the Contract tab of the design doc, *Shapes*, *The verbs*, *Classes*):

* The verbs are the key-value trio `get`, `put`, `del` on every layer: the vault, the VaultDB,
  and the device store. `read` and `write` are umbrella words (`stale_write`, `written_at`), never
  verbs. `ensure` is the get-or-create verb, as `ensureLease` already is, and nothing else is an
  `ensure` (STYLE.md, *Naming*): a function that only checks is a `check`.
* **Box everywhere.** The cast's word for the thing is now box, in code, prose and storage: `Box`,
  `boxKey`, `boxKeyWrapped`, `box_key_wrapped`, `safebyok_boxes`, `safebyok-box-v6`. The Coach
  (2026-10-19): "I'll miss lockbox but it's going to be confusing." Lockbox goes to
  `notes/old_vocabulary.md`.
* `del` means gone. What stands under a deleted label is a tombstone of label and revision only.
  No recycle bin, and the docs under each `del` say so.

This pass renames. It changes no behaviour and no signature shape: the `Outcome` shape, the `try`
twins, the classes, `openBox`, `getWhisper`, `over`, and `putWayin` are the reform's, not this
pass's. A method that threw before still throws after, under its new name. It does change stored
bytes: a field and three format literals are renamed, so a vault written before it reads as
damaged or absent afterwards, which is what no-back-compat means.

## What is renamed

### Files (commit 1, `git mv` and import paths only)

| from | to |
|---|---|
| `packages/safebyok/src/lockbox.ts` | `src/box.ts` |
| `packages/safebyok/tests/lockbox.test.ts` | `tests/box.test.ts` |
| `packages/safebyok/tests/vault/vault-lockboxes.test.ts` | `tests/vault/vault-boxes.test.ts` |
| `packages/safebyok/src/retire-damaged-vault.ts` | `src/del-damaged-vault.ts` |
| `packages/safebyok/tests/retire-damaged-vault.test.ts` | `tests/del-damaged-vault.test.ts` |
| `packages/safebyok/tests/vault/vault-retire.test.ts` | `tests/vault/vault-del.test.ts` |

`string-store.ts` and the demo's `stores.ts` and `StoreTable.tsx` keep their names: "store" there
means the datastore, which is what the word is now for. Check `tsdown.config.ts` and each
package's `exports` for an entry that names a moved file (none expected: `lockbox.ts` and
`retire-damaged-vault.ts` are reached through `index.ts`).

### Identifiers (commit 2, by script, every package, `demos/` and `e2e/` included)

Today's counts across `packages/` (src, tests, docs, sql, json) say how wide each is.

| from | to | count | note |
|---|---|---|---|
| `storeBox` | `putBox` | 383 | vault |
| `updateBox` | `putBox` | 336 | VaultDB; the two layers now share the name |
| `readBox` | `getBox` | 327 | both layers; the vault's still returns a whisper until the reform |
| `retireBox` | `delBox` | 227 | both layers |
| `retireWayin` | `delWayin` | 37 | |
| `retireVault` | `delVault` | 82 | VaultDB |
| `retireDamagedVault` | `delDamagedVault` | 106 | |
| `retireIfIncoherent` | `delIfIncoherent` | | vault |
| `vault.retire()` | `vault.del()` | | the `Vault` type's method and every call site; count by hand, `retire` is 191 hits of prose and code together |
| `fetchOrCreateVaultProps` | `ensureVaultProps` | 218 | VaultDB |
| `readVaultProps` | `getVaultProps` | 236 | VaultDB |
| `updateVaultProps` | `putVaultProps` | 86 | VaultDB |
| `readLease`, `writeLease`, `eraseLease` | `getLease`, `putLease`, `delLease` | | DeviceDB; the trio on the third layer |
| `readMark`, `writeMark`, `eraseMark`, `eraseAll` | `getMark`, `putMark`, `delMark`, `delAll` | | DeviceDB |
| `Lockbox` | `Box` | 131 | the type; also `StoredLockbox` in convex |
| `LockboxSummary` | `BoxSummary` | 45 | |
| `DamagedLockbox` | `DamagedBox` | 23 | |
| `LockboxExpectation` | `BoxExpectation` | 49 | |
| `LockboxRetireExpectation` | `BoxDelExpectation` | 46 | |
| `LockboxRetirement` | `BoxDeletion` | 25 | the VaultDB `delBox` answer; its `outcome` literals `retired`, `retired_other` become `deleted`, `deleted_other` |
| `RetireExpectation` | `VaultDelExpectation` | | VaultDB `delVault` |
| `damaged_lockbox` | `damaged_box` | 58 | a refusal kind: `VaultErrorKindVals` and `VaultErrorFamilyForKind` |
| `lockbox_too_large` | `box_too_large` | 21 | likewise |
| `lockboxes` (identifier) | `boxes` | 219 | the capacity field, locals, helpers |
| `maxLockboxes` | `maxBoxes` | | a `Vault.make` option |
| `lockboxKey`, `lockboxKeyWrapped`, `lockboxKeyBytes` | `boxKey`, `boxKeyWrapped`, `boxKeyBytes` | | the cast's key names, VOCABULARY's rows with them |
| `lockbox_key_wrapped` | `box_key_wrapped` | | **a stored field**: the box record's schema and its ctx purpose literal |
| `LockboxFormat`, `LockboxFieldsBytes`, `LockboxFixedBytes`, `LockboxHeader` | `BoxFormat`, `BoxFieldsBytes`, `BoxFixedBytes`, `BoxHeader` | | exported constants; `size:budget` names may follow |
| `safebyok-lockbox-v5` | `safebyok-box-v6` | | **the format literal**, bumped because the record's field names changed; `safebyok-vault-v4` stays (no field of it renames) |
| `safebyok_lockboxes` | `safebyok_boxes` | | **the table name**: Postgres `vault-tables.sql` and `src/vault-tables.ts`, Convex `src/component/schema.ts` |
| `SafebyokLockbox`, `SafebyokListedLockbox`, `SafebyokLockboxRetirement` | `SafebyokBox`, `SafebyokListedBox`, `SafebyokBoxDeletion` | | GraphQL schema types, `vault-schema.ts`; their field names with them |
| `ensureOpen`, `ensureUnlocked` | `checkOpen`, `checkUnlocked` | 10, 11 | vault guards: they refuse, acquire nothing |
| `ensureKnownOpts`, `ensureLimitsFit`, `ensureSaltFits`, `ensureSuppliedSpecKept`, `ensureSecureContext` | `checkKnownOpts`, `checkLimitsFit`, `checkSaltFits`, `checkSuppliedSpecKept`, `checkSecureContext` | | vault-opts, key-deriver, browser |
| `ensureRoomFor`, `ensureRoomForWayin`, `ensureWhisperFits`, `ensureNewCredential` | `checkRoomFor`, `checkRoomForWayin`, `checkWhisperFits`, `checkNewCredential` | | vault |
| `ensureStrongEnough` | `checkStrongEnough` | 5 | passphrase-strength; the reform reshapes it to `strengthChecker.check(passphrase)` |

Script it: one `sed` pass with word boundaries, longest names first (`LockboxRetireExpectation`
before `Lockbox`, `retireDamagedVault` before `retire`, `lockboxKeyWrapped` before `lockboxKey`),
over `--include` of `*.ts *.tsx *.md *.mdx *.json *.mjs *.sql`, excluding `node_modules`, `dist`,
`whiteboard`, `winboard`, `CHANGELOG.md` and `notes/old_vocabulary.md`. Then read the diff for
the places a word boundary is not a name boundary: a `boxlabel` is already right; a prose
"lockbox" in a doc block is commit 3's, but the script may take it (see below).

### Prose (commit 3, by hand)

* "lockbox" becomes "box" everywhere: README, doc blocks, VOCABULARY, the demo's copy. The
  script's `lockbox` to `box` over `*.md` and doc blocks does most of it; read for a sentence
  that needs "a box" where it said "a lockbox" ("an" to "a").
* Doc blocks and README: "retire a box" becomes "delete a box", "retired" becomes "deleted", where
  the sentence is about the verb. The line under each `del` doc block: *gone; a tombstone of label
  and revision stands, no ciphertext, so a put from a device that never saw the delete is refused
  stale.*
* VOCABULARY.md: the **lockbox** row becomes **box**; **lockboxKey** and **lockboxKeyWrapped**
  become **boxKey** and **boxKeyWrapped**; the verb list gains the trio and `ensure`; `retire` is
  struck from current use.
* `notes/old_vocabulary.md`: the retired names, one line each, as the Oct 2026 reform recorded its
  own: lockbox and its compounds, `storeBox`, `readBox`, `retireBox`, `retireWayin`, `retire()`,
  `updateBox`, `fetchOrCreateVaultProps`, `readVaultProps`, `updateVaultProps`, `retireVault`,
  `retireDamagedVault`, `Lockbox*`, `damaged_lockbox`, `lockbox_too_large`, the `ensure` checks,
  the DeviceDB read/write/erase verbs.
* TODO.md: `retire()`'s edge cases section is retitled for `del()`; its text is updated, not
  rewritten. `NOTYET.md` and `notes/security.md` by grep: the security notes go through the sonnet
  subagent as the file's header says.
* `CLAUDE.md` Reading list and `PROCESS.md`: by grep, probably nothing.

## What is not renamed

* `safebyok-vault-v4`, `safebyok-lease-v1`, `safebyok-mark-v4`: no field of those records
  changes name in this pass.
* `addPassphrase`, `changePassphrase`, `addPasskey`: the reform folds them into `putWayin`
  (Contract, *Classes*); a rename of three verbs to one is a reshaping, not a rename.
* `passphraseStrengthTest` and `ensureStrongEnough`'s shape: the reform's `strengthChecker`.

## Order of work

1. Cut `20261019-rename_pass` from `main` after softlock_gone is merged. Baseline: `pnpm justify`
   green; record `numTotalTests` per package and the export names of each `dist/index.d.ts`.
2. Commit 1: the file moves with `git mv`, imports and test paths updated, nothing else.
   `pnpm justify` green. `git log --follow` on each moved file shows its history.
3. Commit 2: the identifier script, then the by-hand pass over its diff. `pnpm justify` green;
   `numTotalTests` unchanged per package; `git diff --stat` touches no file under `whiteboard/`,
   `winboard/`, `CHANGELOG.md`, `notes/old_vocabulary.md`. The format snapshot test, if it exists
   by then, fails on `safebyok-box-v6` and is re-keyed: that is the one expected test change.
4. Commit 3: prose, VOCABULARY, old_vocabulary, TODO, security notes via subagent.
5. `pnpm size:budget`: the budget names any renamed export constant. Changeset: **major** for
   `safebyok`, `safebyok-react`, `safebyok-convex`, `safebyok-postgres`, `safebyok-graphql`,
   `safebyok-indexeddb` (every public verb and type is renamed; pre-1.0, a minor bump is what
   changesets does with it; the note lists old name to new name as a table, and says a vault
   written under `safebyok-lockbox-v5` or into `safebyok_lockboxes` is not read: a host drops the
   table or renames it, and the boxes in it are damaged).
6. One PR. Its description links the design doc's Contract tab and says: a rename, no behaviour;
   stored names changed, no migration; the reform follows.

## Acceptance

* `grep -rniE "lockbox" packages demos e2e --include='*.ts' --include='*.tsx' --include='*.md' --include='*.sql' --exclude-dir=node_modules --exclude-dir=dist`
  finds nothing.
* `grep -rnE "\b(storeBox|updateBox|readBox|retireBox|retireWayin|retireVault|retireDamagedVault|retireIfIncoherent|fetchOrCreateVaultProps|readVaultProps|updateVaultProps|readLease|writeLease|eraseLease|readMark|writeMark|eraseMark|damaged_lockbox|lockbox_too_large)\b" packages demos e2e --include='*.ts' --include='*.tsx' --include='*.md' --exclude-dir=node_modules --exclude-dir=dist`
  finds nothing.
* `grep -rnE "\bensure[A-Z]" packages/safebyok/src` finds only `ensureLease` and
  `ensureVaultProps`.
* `grep -rnw "retire" packages/safebyok/src` finds nothing; `retired` only where the prose is
  about a wayin or vault that no longer exists, if any sentence still needs the word.
* `pnpm justify` green in every package; test counts equal to baseline; `git log --follow` works
  for each moved file.

## Out of scope

* Everything the Contract tab adds: `Outcome`, `try` twins, the classes (Proof, Wayin, Lease, Box,
  Pantry, Vault), `openBox`, `getWhisper`, `over`, `putWayin`, `onBadNews`, `staleMinutes`. The
  reform's.
* The one-passphrase policy (Contract, *Classes*): behaviour, the reform's.
* The softlock_gone removals, which land before this.
