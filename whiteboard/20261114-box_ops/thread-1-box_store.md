# Thread 1: box_store (2026-11-15)

Branch `20261115-box_store`, PR [#701](https://github.com/mrflip/safebyok/pull/701), base `main` (the box_ops plan commits ride in it). Proved: `pnpm justify`
green after the catch-up (lint, typecheck, build; tests 5,839 passed, 607 of them in `safebyok`).

* **Built** (`packages/safebyok/src/storage/`, design-boxops.md *Building it* item 1):
  * Roots: the bank at `bank`, the main gate at `gate`, the root box at `box`; further gates at
    `gate/<label>`; boxes at any depth. Lifepaths have no leading `/` and one lifeseq per labelpath
    segment; `ShellCited.lifepath` is `-1`, and `shellCitedUnder(p)` gives `p/-1`.
  * Kinds and their checks in `shapes-thing.ts`: bank (3101, no body), gate (4101), box (5103: live
    is `sidecar` + `whisper_sealed`, a tombstone `whisper_sealed` with no sidecar). Each kind names
    its policies; the main gate's tombstone is refused.
  * Asks: get, list, put, del, each with a `modelkind` that must be its labelpath's. A del's
    `ifAbsent: 'fail'` and `ifPresent: 'repl'` are fixed. The vaultDB's builders `getAsk`, `listAsk`,
    `putAsk`, `delAsk` (over `getAskOf` and the rest in `shapes-thing.ts`) are the one place defaults
    are filled.
  * `tryListThings` (direct children only, under the parent's current lifepath; `parent` and
    `damaged_rows` on every answer; dbhas `[]` under void and gone, null under any other refusal).
  * `tryBirthBank`: the bank, main gate and root box in one step, with a notice for each.
  * `MemoryVaultDB` builds both; `AdapterVaultDB` wraps them (a thrown store answers as the others do).
  * Tests: `tests/storage/shapes-thing.test.ts`, `memory-vault-db.test.ts`, `adapter-vault-db.test.ts`,
    helpers in `tests/test-helpers/vaultdb-world.ts`.
  * design-vaultdb.md's labelpaths, lifepaths, invariants, gate CHECKs and asks brought up to date.
* **Decisions taken**:
  * Builders throw synchronously, `bad_option` or `bad_record`, as the ask checks would.
  * get/list builders strip fields they do not take; put/del arguments are strict.
  * `tryBirthBank` answers `passed` only when all three roots are stored (live or not); any other
    mix is `storage_issue`. A bank tombstone answers `stale` and writes nothing.
  * A listing reports damaged children whatever the parent's life.
  * `tryListThings` is not generic over the kind; a sealed whisper's `codectag`/`schematag` are plain
    strings, checked by shape only.
* **Deviations**:
  * Each kind's check names its policies; the gate's policy functions stay in `thing-classifier.ts`,
    to avoid a circular import with `shapes-thing.ts`.
  * A del refuses any `options` as well as changed flags (`DelFlagsFixed`): a del has no policies.
  * `phrases.ts` was edited for the new refusals, though the handoff did not list it.
  * `ThingkindNotStored` and `LifepathNotOwn` gave way to per-kind and lifepath-depth checks.
  * The changeset is empty with a body: `safebyok` is private, as for vault_db and lean_gate.
  * Exports added beyond the design: `shellCitedUnder`, `modelkindOf`, `isKindLabelpath`, `CitedOf`,
    `sparseOf`, `sealed` (a check; no `Sealed` TS type yet).
* **Approaches set aside**: a listing that walks the whole subtree (the Coach ruled children only);
  the parentage check on a write ("Ensuring parentage", TODO in design-boxops.md, not built).
* **Discoveries**:
  * `dubdel` is unreachable: a del citing a tombstone is refused first, as a tombstone over a
    tombstone (`bad_record`).
  * A birth over an identical stored record answers `retcon`, not `stale`.
  * A void vault's refusal kind is `absent_vault`.
  * `MemoryVaultDB.#thingsOf` creates an empty bank map on a read: harmless, left alone.
  * Labels are 2+ characters, so test paths use `box/aa/bb/cc`.
* **For the Coach**:
  * Stored gate Things at `gate/main` with a `/`-led lifepath now fail safe: the main gate at `gate`
    reads as absent, and the old row refuses as `damaged_row` in a listing.
  * Whether `dubdel` should stay in the act table, given it cannot be reached.
