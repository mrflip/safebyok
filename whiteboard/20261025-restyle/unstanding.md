# Next thread: `retire_standing`

Retire "standing" as a term of art. Each of its five meanings gets its own name.

**Why.** "Standing" means both the stored row (the ground truth) and the vault record in hand (the
cache). The consistency model depends on that distinction more than any other. A reviewer reading
`sealLeaseRecord(standing, …)` would take it as bound to storage, but it's bound to the record in
hand. Backend engineers say *stored* for a compare-and-swap's current row, and the refusals already
say it: `meta.vault_stored` and `meta.box_stored`.

## The renames, one per meaning

| Meaning | Today | Becomes |
|---|---|---|
| 1. The row in storage when a VaultDB call compares or reads | "the standing vault record", "the box standing", "none stands", "whatever revision stands"; `standingVaultRecord`, `standingBox`, `standingRevision`, `standingRow`, `standingText`, `standingBytes`, `StandingBoxSql`; the `standing` parameters in `packages/safebyok/src/expectations.ts` and `Refusals.staleBox(standing)` / `staleVaultRecord(standing)` | "the **stored** vault record", "no box is stored", "whatever revision is stored"; `storedVaultRecord`, `storedBox`, `storedRevision`, `storedRow`, … `StoredBoxSql`. The Postgres CTE `WITH standing AS` becomes `prior`, because `stored` is already a CTE name (`packages/safebyok-postgres/src/postgres-vault-db.ts:162`). Rename the `stands` column alias to match, e.g. `found`. |
| 2. The vault record in hand (the cache) | `standing` at `proving.ts:212`, in `sealLeaseRecord` (`lease.ts:287-307`), `#wayinsOf` / `#wayinListOf` (`vault.ts:901-916`), `fitsLease` (`vault.ts:1936`) | `held` in identifiers; "the vault record in hand" in prose. **Do these first.** They matter most to a reviewer. |
| 3a. A gating not yet settled | "the gating standing", local `standing = this.#gating` in `vault.ts` and `gating.ts` | "the **pending** gating"; local `pending` |
| 3b. A lease not yet expired | "a lease standing", in `vault.ts` and VOCABULARY.md *novel* | "a lease **in force**". Not "live": `liveRecordOf` already means "not a tombstone". |
| 4. This Vault object is not gone | `#checkStanding()` (`vault.ts:1095`), 24 calls, plus the `// == [Demand]` banner | `#demandNotGone()` |
| 5. A gating that never lands (tests only) | `StandingGating` (`proving.ts:38`) | `OutsideGating`; its doc block already says "a proving made outside any gating" |
| 3b, as identifiers | `#unlockStands(now)` (`vault.ts:894`) and the local `leaseStands` in `consistentWith` (`vault.ts:390`); `#leaseStandsPast(renewMillis)` (`vault.ts:1219`); `standsBeside(kept, held)` (`vault.ts:1943`) | `#unlockStands` and `leaseStands` become `#leaseInForce`, unless `whiteboard/20260925-fixup/fixup-preplan.md` item 8b has already merged them into one worker. `#leaseLastsPast`; `leavesInForce`. |
| Tests | `boxesStanding` (e2e postgres helpers), `inStanding` (vault-db conformance), `badStanding` (`lease.test.ts`) | Rename by the same table: `boxesStored`, `expectedVault`, `badHeld` |
| VOCABULARY.md *wayin* | "Only the standing passphrase proves a change" | "Only the current passphrase …" |

Line numbers are as of `da294a43`.

**Keep:** ordinary English, such as "standing in for", "what it did stands", "notwithstanding",
"outstanding", "understanding". Where a sentence uses "stands" or "standing" in sense 1 or 3,
reword it. Don't just swap the word: "none stands" becomes "none is stored", not "none stored".

## Scope

Every package's `src/` and `tests/`, `packages/safebyok/VAULTDB.md`, the package READMEs, `e2e/`,
`demos/`, VOCABULARY.md, and TODO.md (around line 330). Add a row for `standing` to
`notes/old_vocabulary.md`, the way the October reform's retired names are recorded.

**Out of scope:** CHANGELOGs, existing `.changeset/` files, `whiteboard/`, `winboard/`, `human/`,
LICENSEs, the generated Convex `_generated/`, and `notes/security.md`. Don't read or edit
security.md. It has about 40 uses, so list it in the PR's open questions for a Coach-approved pass
by a `sonnet` subagent. Change no behaviour, no stored field and no export. `StandingGating` is not
in any `src/index.ts`: confirm that before renaming.

## Done when

* `grep -rnE --exclude-dir={whiteboard,winboard,human,node_modules,dist,.git,_generated} '\w*[Ss]tand(s|ing)\w*|\b[Ss]tand\b' packages e2e demos VOCABULARY.md TODO.md`
  leaves only the kept idioms and the out-of-scope files. This pattern also catches camelCase
  identifiers such as `#unlockStands`, which a word-bounded `stands?` misses. Paste what's left
  into the PR body.
* `pnpm justify` is green.
* The changeset follows PROCESS.md *Changesets*. It's `--empty` unless the VAULTDB.md wording
  counts as a change adapter authors are told about.

## Open questions for the PR

Raise them, don't act on them:

* Whether `OutsideGating` should move to the test helpers, since only tests use it.
* Any spot where meanings 1 and 2 were hard to tell apart.

## Placement

This rename touches `vault.ts`, `vault-db.ts`, `expectations.ts` and every adapter. The
orchestrator should run it after the sprint's other threads that edit those files, not alongside
them.
