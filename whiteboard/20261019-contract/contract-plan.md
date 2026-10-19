# 2026-10-19: contract -- the sprint plan

**No back-compat layer, no migrations, no catering to vestigial names or methods.** This is
pre-pre-alpha: a placeholder npm publish and nothing else. An old stored record fails safe (reads
as absent or damaged) and the changeset says so. Every phase and every thread below opens with
this line.

* **Date:** 2026-10-19. **Issued by:** the Coach (flip), `/sprint contract`, with the preplan
  [`20261019-contract-preplan.md`](20261019-contract-preplan.md) beside this file.
* **Mode:** YOLO. **Review:** `medium` unless a thread names its own level (the preplan's
  `*Review:*` lines win over this header). **At once:** 3.
* **The spec:** the design doc's **Contract** tab,
  https://claude.ai/code/artifact/8ac26722-33ee-4082-a76f-f4c9b6722b70 (tab id `7474ec29-37d9`).
  A markdown export of rev 2015 sits at
  `/tmp/claude-1000/-workspace-byok/23ac0f81-dcca-476b-9702-e252de19ef92/scratchpad/contract/contract.md`
  (56 kB; `grep -n '^#'` is its outline). The handoff says when a ruling has changed it since.
* **Sprint doc:** https://claude.ai/code/artifact/362ec68d-5bf3-46aa-a379-59a9c8bfb548
  (*Open Matters*, *Resolved*, *Progress*).
* **Status:** 0, A1, A1b, A2, A3, A4 filed (#193-#198); A5 building.

## How this plan relates to the preplan

The preplan is the Coach's issue, written by Fable with the Coach. **Each thread's text is its
section of the preplan, verbatim**: the handoff quotes it whole. This plan does not copy it; it
adds the orchestrator's gloss per thread (base, model, review, look-ahead changes) and records
what the threads teach. Where this plan and the preplan disagree, this plan is newer.

The preplan's *Rulings these rest on*, *Ground rules for every thread*, *Where each method lives:
first guesses* and *Note to the orchestrator* hold for every thread and are not repeated here.

## Read first (every worker)

* The preplan: *Rulings these rest on*, *Ground rules for every thread*, and the worker's own
  thread section; *Where each method lives* for phase B and the `ensureLease` work.
* The Contract tab: the sections the thread builds, and *Shapes* and *Refusals*. Read the
  scratchpad export with `grep -n` and read only the lines needed; never `read` the doc itself.
* STYLE.md *Naming* (and its new *ensure* paragraph once thread 0 lands), *Validation*, *Tests*.
* PROCESS.md *Threads* and the changeset section, before the first commit.
* `progress.md` beside this file, looked up for the threads the handoff names.

## Ground rules particular to this sprint

* The Coach (2026-10-19, at the invocation): "think flexibly, especially for this sprint as we are
  changing so many things." Where the preplan reads wrong against the code as built, say so in the
  thread file and the report, propose the better course, and take it if it is a two-way door.
* The Coach's grant: workers and their agents may edit `STYLE.md`, `VOCABULARY.md` and
  `notes/security.md` **to rename items and correct contracts**. `notes/security.md` still goes
  through a `sonnet` subagent (its header says how); a rename there may be scripted with the rest.
* Contract drift goes to the thread file and the report's *Open matters*; the orchestrator files
  the row and carries rulings into the Contract tab. Workers do not edit the design doc.
* Phase boundaries are not pauses: phase B cuts from A's restacked tip as soon as A6 files.

## Threads

Bases follow the sprint skill: from `origin/main`, or from the filed tip of the one thread a thread
stands on, or from the top of a restacked line where it stands on two.

### 0. `rename_pass` -- stage 0, run by the sprint

*Text:* the preplan's *Stage 0*, and the whole of `whiteboard/20261019-rename_pass/rename_pass-plan.md`
(the Coach's staged version, carried into the thread's branch).
*Gloss (Orchestrator):* the preplan has the Coach run this as a session before the sprint cuts.
When the sprint was called it had not landed (`main` still has `src/lockbox.ts`), and no session
was running it, so the sprint runs it first, alone, on a quiet tree: nothing else is cut until it
files. It also carries the Coach's staged *ensure* paragraph for STYLE.md, which the rename's
`check` verbs rest on. Base: `origin/main`. Model: default. Review: `none` (the preplan: greps and
counts); the orchestrator checks the acceptance greps, the per-package test counts and that
`pnpm justify` ran. Size: large, mechanical; the `everything` and `Vault` lines may move a little.
Filed as an *Open Matters* row so the Coach can close the PR and run it by hand instead.

### Phase A: `shapes`

| # | Label | Base | Model | Review | Gloss |
|---|---|---|---|---|---|
| A1 | `outcome` | 0 | opus | medium | `Outcome`, `VaultError.family`/`meta`, every VaultDB verb returns an `Outcome`; vault unwraps (interim shim, named). `everything` and `Vault` budgets move. |
| A1b | `outcome-adapters` | A1 | default | medium + battery per adapter | Postgres needs the container; if Docker is unavailable, say so and run what can run. Notes how each backend does C1's one-statement write. |
| A2 | `vault-class` | A1 | opus | low (preplan's checklist) | Runs beside A1b. Pure move; per-file test count unchanged; banners kept as B's seams. |
| A3 | `fields-and-make` | A2 | opus | medium | `make` inert, first `hello()` reads, `settle()`, `onBadNews`, `staleMinutes`. |
| A4 | `try-twins` | A3 | default (was sonnet: it now carries five small decisions) | low (preplan's checklist) | Every public call as `tryX`/`X`; thread file lists the pairs and which bodies still throw. *Orchestrator:* A3's `#tellingBadNews` wrapper is the seam to build the pairs on. Also: export `valOf` (or its successor) and drop the demo's `answered` shim; decide what `outcomeOf` does with a bug at the VaultDB base and the vault's boundary; a runtime guard refusing an Outcome-shaped record from a `do*` hook; `subscribe`'s synchronous throws; `hello` ignoring a non-options first argument (bare event handler). Each pending its Open Matters row. |
| A5 | `react-over-class` | A4 | default | medium + StrictMode | Provider makes the vault from props and owns the first `hello()`. *Orchestrator:* StrictMode still opens two vaults in development, each reading once (A3 review): defer the provider's first hello past StrictMode's cleanup. Hold `onBadNews` in a ref so an inline handler does not remake the vault each render. `openError` now comes from the provider's own hello (`helloRefusal`), since `trouble` is bad news only. |
| A6 | `getproof` | A5 | opus | high | `ensureLease`, `Ask` class, `attempt`, `lockLanded`; react modal as `getProof`. |

*Orchestrator:* A1b does not hold up A3 to A6; it joins the line at the restack before phase B.

*Review (A1, #194, `fixed`):* six test spies still rejecting from `getVaultProps` now resolve
`bad(...)`; doc blocks rewrapped; `VaultDB`'s doc block tells a wrapping `do*` to unwrap. Test
counts did not fall (the worker reported passed-only). Left: the demo's
`VaultDashboard.test.tsx:55,89` mocks still reject (to A1b); `expectBad`'s unreported `!`;
`outcomeOf` in the base maps a bug to `storage_unavailable` (an Open Matters row, A4);
`RefusalMeta` fields unfilled until C1; unused `settledKind` in e2e; the battery's "never a
rejection" covers only the base's refusals. Live-backend e2e (96) not run: A1b's reviewer runs them.

*Review (A1b, #195, `clean`):* battery green over PGlite, Convex's fake deployment and GraphQL with
PGlite; e2e Postgres (88) not run, no Docker. Side doors checked: driver `cause` stays server-side.
Left (minor): in-process GraphQL `cause` chain reaches the driver error (Open Matters row); a lost
GRANT reads `not_permitted` (row); VAULTDB.md 5.6's RLS wording broader than the behaviour; the
`not_permitted` wording restated in two adapters; new error strings use `'` like their neighbours.

*Review (A2, #196, `fixed`):* the vault read `this.leaseMillis` and called `this.hello()` internally,
both writable by a host on the handle; now `#leaseMillis` and `#hello()`. Regression test carried
into A3.

*Review (A3, #197, `flagged`):* fixed a recursion over an adapter that rings as it is subscribed
to, an alignment, and the make_hello entry in `notes/security.md` (in place, under the Coach's
grant). **Flagged:** a stale `hello()` re-running `#fetchLease` can undo a `lock()` landing during
the lease read. YOLO: the worker is resumed to make any key change cancel a take-up in flight (no
counter); a second review covers only the new commits. Minors: `trouble` sticks while a damaged
box stands; bare `vault.hello` as an event handler (to A4); handler told before the snapshot moves
and thenables unhandled (to the rework, if small); shallow freeze of `sidecar`; StrictMode's two
vaults (to A5); capacity reckoned twice. *Second review (rework only, `fixed`):* the abort holds on every
path; `#grantLease` now stands the take-up down before writing its lease (else a take-up could
discard the fresh one); `notes/security.md` corrected in place in two entries. Left: a lease delete
already sent is not called back on an unordered device store (fails safe; to the policy session);
inside `onBadNews`, `vault.trouble` is one step behind. One `unicorn/no-thenable` suppression in a
test, judged right.

*Review (A4, #198, `fixed`, at medium):* the wrapped-answer guard now proven for `delVault` too.
Left: another copy's VaultError kept only half the way (to `a-fixes`); `hello`'s handler example
should use `tryHello` (to `a-fixes`); `asHelloOpts` ignores any non-plain object; a stored record
shaped like an Outcome reads `bad_option` not damaged; `delDamagedVault` has no `try` form (C5).

**Closing phase A:** passes 1 and 2 (opus, `high`, worktree-isolated agents, one lens each) over
`origin/main...<A's tip>` while B1 and B3 build; findings filed as a comment on the sprint PR and
fixed in a small thread `a-fixes` (on B's line, after B4), with the `a-shims` grep folded in.
*Orchestrator:* `a-fixes` already holds, from A4's review: one shared `isVaultError` that knows a
refusal from another copy of safebyok, used at every `instanceof` site (`asStorageTrouble`,
`#hearBadNews`, `RefusalPolicy`, react's `isVaultCondition`), and the changeset and
`notes/security.md` narrowed to match; `hello`'s handler example as `vault.tryHello`; the A4
thread file's "Throwing alone" list gains `delDamagedVault` (its `try` form is phase C's, C5).

### Phase B: `models`

| # | Label | Base | Model | Review | Gloss |
|---|---|---|---|---|---|
| B1 | `proof-wayin` | A's line (A1b restacked in) | opus | high | Adds `adorn`/`decorate` to `utils.ts` first. *Orchestrator:* A3 left `props` unbuilt and `damaged_wayin` news from a listing unbuilt (summaries flag no damaged wayin yet); both are B1's. |
| B3 | `box` | A's line | opus | high | Beside B1. |
| B2 | `lease` | B1 | opus | high | |
| B4 | `put-wayin` | B2 | opus | medium | Writes its Contract section to the thread file first; YOLO builds to the brief. |
| B5 | `placement` | B3 + B4 restacked | opus | low | *Orchestrator:* the preplan stacks B5 on B4 only, but B5 reads all four model classes, so B3 joins the line first. |

**Closing phase B:** passes 1 and 2 again, as C1 builds; fixes in `b-fixes`.

### Phase C: `calls`

| # | Label | Base | Model | Review | Gloss |
|---|---|---|---|---|---|
| C1 | `putbox-store` | B's line | opus | high | One atomic conditional write per adapter; battery's races. |
| C2 | `putbox-vault` | C1 | default | medium | |
| C7 | `vault-props-verbs` | C1 | default | medium | Beside C2, as the preplan allows. |
| C3 | `delbox-tombstones` | C2 + C7 restacked | opus | high | *Orchestrator:* C3 and C7 both rewrite every adapter and the battery, so C3 waits for C7 in the line rather than conflicting at the restack. Proposes `delIfIncoherent`'s fate. Writes the line under each `del` doc block that a tombstone stands (thread 0's row, ruled). |
| C4 | `getbox` | C2 + C7 line | default | medium | Beside C3. Writes `getBox`/`openBox` nesting first. |
| C5 | `lock-close-del` | C3 + C4 restacked | opus | medium | Rewrites the Contract's first guess; files the rewrite as an *Open Matters* row. |
| C6 | `subscriptions` | C5 | default | medium | |

**Closing phase C:** passes 1, 2 and 5; fixes in `c-fixes`.

### The policy session

Not on the runner's path (preplan). Nothing waits for it.

### Phase D: `batteries`

| # | Label | Base | Model | Review | Gloss |
|---|---|---|---|---|---|
| D1 | `batteries-core` | C's line | default | medium | `p-retry` as optional peer: the Coach ruled it (dependency yes). |
| D3 | `customer-docs` | C's line | opus | none (pass 4) | Beside D1. |
| D2 | `batteries-react` | D1 | default | medium | |
| D4 | `demo-and-e2e` | D2 | sonnet | low | |
| D5 | `sweep` | D4 + D3 line | sonnet | low | Lowers every size line to the rule. Writes a TODO entry: `StringStore`'s `read`/`write`/`erase` to the trio, a quiet-tree rename after the sprint (thread 0's row, ruled). |

**Closing phase D:** passes 1 to 5.

## For the Coach

* The main checkout has staged, uncommitted work on `20261018-reformx` (upstream gone): the
  preplan, the rename plan, STYLE.md's *ensure* paragraph, the sprint skill's per-thread review
  levels, and the unpushed commit `0e2df3be` (CLAUDE.md's *read as markdown*, a TODO line). The
  sprint carries the preplan (this PR) and the rename plan and *ensure* paragraph (thread 0's PR);
  the rest is left to you.
