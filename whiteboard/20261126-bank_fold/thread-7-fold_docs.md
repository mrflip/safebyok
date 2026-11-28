# Thread 7: fold_docs (2026-11-26)

Branch `claude/bank-table-refactor-fr1ycq`, local only (no PR, by the handoff), on thread 6. Proved:
`pnpm lint` and `pnpm justify` (see the report); only .md files changed.

* **Built**:
  - `VOCABULARY.md`: a bank's two roots (gate and root box), the gate stored at the banklabel and
    carrying the `lifetok`, and `device.bank` always a `Bank`.
  - The new-core READMEs (core, postgres, convex, indexeddb, graphql, react, the new-core demos):
    `getBank`, `safebyokGetBank`, `useBank`, Convex's two tables, the gate and the root box.
  - `docs/` react guides (`useWorld` to `useBank`), `docs/threat-model.md`,
    `notes/vault-adapter-contract.md` (main gate to gate), and one example in STYLE.md ("The
    bank's three roots" to "The bank's two roots"). No CLAUDE.md or PROCESS.md edit.
  - `notes/wontfix.md`: the tracked/banktok row brought to the gate's row, and three new rows: a
    tombstoned gate shows `unborn` yet its birth refuses `stale`; it asks with the void banktok
    and is answered with the tombstone's lifetok; a lease's `gate_labelpath` is not checked
    against its banklabel. Each awaits the Coach.
  - `notes/guarantees-drift.md`: a gate's tombstone keeps its wayins, where big's bank delete
    removed them. No recommendation.
  - `.changeset/20261126-bank_fold.md`.
* **Decisions made**:
  - VOCABULARY says "roots" where it said "world"; my choice, unreviewed.
  - The changeset leaves out what I could not verify: whether `GetBankSql` is public (it is not
    in postgres's index), the stage an old orphan root box shows, and the key names of `Track`.
* **Deviations**:
  - `notes/security.md` (item 6) is not written: this session has no Agent tool, so the `sonnet`
    subagent its header requires cannot be spawned, and I may not read its entries. The brief is
    in the report, for the orchestrator to run.
  - The changeset was written by hand: `pnpm changeset` refuses this branch name ("not a thread
    branch") and refuses the private `safebyok` ("not a public package"). Its frontmatter names
    the five public packages, not the core; the core's changes are in its prose. An earlier
    changeset (`20261125-graphql_vault-core.md`) does name `"safebyok": minor`, and
    `.changeset/config.json` versions private packages. For the Coach.
  - The drift entry quotes "Only `BankDB.tryDelBank`, reached through the bank listing, deletes
    the gate row, and with it every wayin." from `notes/guarantees-big.md`, section *The
    construction*; the handoff named a section *The bankDB*, which does not exist, and the
    sentence carries no number.
* **Discoveries**:
  - VOCABULARY's "`devicetok`... one per bank scope" contradicts its devicetok entry. Not the
    fold's doing; left.
  - `Labelpath.gateOf` is exported and validates nothing (thread 6 flagged it too).
* **For the Coach**: the three new wontfix rows and the drift entry; the core's place in the
  changeset frontmatter; the security brief still to run.
