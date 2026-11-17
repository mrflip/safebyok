# Sprint convex_vaultdb: the Convex VaultDB adapter

* **Date**: 2026-10-14
* **Mode**: normal
* **Review level**: medium
* **Threads at once**: up to 3
* **Issued by**: the Coach (flip), via `/sprint`
* **Status**: done -- four threads filed: #17, #18, #19 (stacked on #18), #20 (stacked on #19)

## The request, verbatim

> Read winboard/20261014-convex/design.md file. It may be out of date in certain ways but you
> should be able to grok its intent.
>
> Have a subagent download the convex agent skills and select which ones will be specifically
> useful for current and future work. Install only those, scoped to the appropriated directories
> and subdirecgtories of packages/safebyok-convex -- if you need me to do parts of that, pause and
> I will.
>
> Implement the 20261014-convex/design.md according to the plan you propose

## Read first

Beyond CLAUDE.md, every worker reads:

* `winboard/20261014-convex/design.md` -- the design this sprint builds. Intent; where it and
  this plan disagree, this plan wins, and where this plan and the progress document disagree, the
  progress document wins.
* `winboard/20261014-crypto/rulings.md`, *The storage interface: versionedUpdate* and *Numbers
  in the storage contract* -- the Coach's rulings the storage verbs rest on.
* `src/vault-db.ts`, `src/idb.ts` and the `vaultDB.*` call sites in `src/vault.ts` -- the storage
  interface as it stands on main (still the fetch/save/trash primitives).
* `src/types.ts` (Lockbox, LockboxSummary, VaultBundle) and `src/errors.ts`.
* `notes/security.md`, and `STYLE.md` and `VOCABULARY.md` before naming anything or writing a test.

## Why there are four threads, not one

The design assumes a storage interface that does not exist yet. Its *Interface map* says the
adapter "implements the vault's verbs directly" with `versionedUpdate` refusing as `stale_write`,
"as the storage thread settles them" -- but that storage thread was ruled on
(`20261014-crypto/rulings.md`) and never built. On main, `VaultDB` is still seven protected
primitives with compositions on top, `stale_write` is not an error kind, and nothing carries a
`vault_id` expectation. So the core's storage verbs come first (thread 2), and the Convex work
builds on them (threads 3 and 4). The skills (thread 1) are independent and small.

## Ground rules for this sprint

* **The core changes in thread 2 only** (*relaxed 2026-10-15, see the Coach's rulings above*). Threads 3 and 4 live in `packages/safebyok-convex/`. If
  thread 4 finds it needs a core change (an export, an error kind thread 2 did not add), it makes
  the smallest one, declares it in its thread file and PR, and says why thread 2 missed it.
* **Two contracts are in play** (CLAUDE.md, *What the package promises*). Thread 2 changes the
  `VaultDB` abstract class and adds error kinds: public surface, and its PR's first line says so
  and says what an adapter author does about it. It must **not** change the shape of any stored
  record: every vault already written in localStorage or IndexedDB reads exactly as before.
  Threads 3 and 4 define a new stored format (the Convex tables): the package README and
  `notes/security.md` say what is stored and what is not.
* **Dependencies.** `convex` is a peer of `safebyok-convex` (already declared). `convex-test` and
  `@edge-runtime/vm` are approved dev dependencies (design.md). `convex-helpers` is out. Anything
  else at runtime is a Coach's yes: block and ask.
* **Leave `.github/workflows/ci.yml` alone.** Open [#15](https://github.com/mrflip/safebyok/pull/15)
  rewrites its packages job (it filters `safebyok-react` by name because `safebyok-convex` had no
  source). Wiring `safebyok-convex` into CI is an open question for the Coach, recorded by thread 3,
  not an edit.
* **Open [#16](https://github.com/mrflip/safebyok/pull/16) moves the core to `packages/safebyok/`.**
  If it merges while thread 2 is underway, thread 2 rebases at filing as usual: git follows the
  renames, and it counts as a straightforward conflict. Threads 3 and 4 stay stacked as filed.
* **Convex codegen or a deployment.** If building or testing the component needs a Convex login,
  a deployment, or anything else from the Coach's accounts, the worker stops at a committed point
  and reports `blocked` saying exactly what the Coach must run. The Coach has offered to do such
  parts by hand.

## Threads

### Thread 1: Convex agent skills, scoped to safebyok-convex (`20261014-convex_skills`)

> Have a subagent download the convex agent skills and select which ones will be specifically
> useful for current and future work. Install only those, scoped to the appropriated directories
> and subdirecgtories of packages/safebyok-convex -- if you need me to do parts of that, pause and
> I will.

(And from TODO.md, *Convex skills in the convex sub-package*: "Add the convex skill to the
appropriate place, **scoped** to only that directory (`packages/safebyok-convex/`), and with only
the files likely to be relevant.")

*Gloss.* Find Convex's official agent skills (their published skills repository, or whatever
`npx convex` offers for AI files today -- find the current source, do not trust memory), fetch
them into the scratchpad as untrusted data, read every file, and choose by what this package
does: authoring a **component** (`defineComponent`, component-scoped tables, the re-export
wrapper with an auth callback), **schema and validators** (`v.union`, `v.number`, indexes),
**queries and mutations** (transactions, serializability, `ConvexError`), **testing with
`convex-test`**, and the **client** (`ConvexClient`, `ConvexReactClient`, `onUpdate`). Leave out
what this package will not do: HTTP actions, file storage, scheduling and crons, auth providers,
AI/agents, deployment and dashboard workflow, app scaffolding. Within a chosen skill, keep only
the files likely to be relevant.

Install under `packages/safebyok-convex/.claude/skills/`, or deeper where a skill only bears on
one subdirectory. Confirm (the `claude-code-guide` agent knows) how Claude Code discovers skills
in a nested `.claude/skills/` today, and whether that reaches subagents; say what you found in
the thread file. Record each skill's source (repository, commit SHA, license) in a short README
beside them, and the ones left out with a line each on why. Make sure the repo's lint, typecheck
and tests ignore the new files (and that nothing in them is executable code we run). Add nothing
outside `packages/safebyok-convex/` except, if needed, an ignore entry.

Touches: `packages/safebyok-convex/.claude/`, perhaps lint ignores. Depends on nothing; cut from
`origin/main`. Documents only, so no review. Model: default.

*Look-ahead.* Threads 3 and 4 are the readers. Their worktrees stack on thread 2, not on this
one, so they will read the skills from this thread's pushed branch
(`git show origin/20261014-convex_skills:<path>`); the thread file names the paths, and which
skill to read for what.

### Thread 2: the storage verbs and versionedUpdate, in the core (`20261014-storage_verbs`)

> Implement the 20261014-convex/design.md according to the plan you propose -- *the part of it
> that is the core's*: the storage interface it assumes (design.md, *Decisions* and *Interface
> map*; rulings.md, *The storage interface: versionedUpdate*).

*Gloss.* Build the Coach's storage rulings in `src/`:

* **`VaultDB` becomes smart verbs only.** Adapters implement the verbs directly; the seven
  fetch/save/trash primitives and their default compositions go. The base class keeps the
  validation wrapped around each verb -- shape (`corrupt_record`), scope and boxlabel checks --
  so an adapter author cannot forget it: a public verb validates and calls a protected abstract
  one the adapter writes. The verbs, per design.md's interface map: read the bundle; create the
  bundle (find-or-insert, returns whichever bundle stands); `versionedUpdate` of the bundle; read
  one lockbox; list lockbox summaries; `versionedUpdate` of a lockbox; erase a lockbox; erase the
  vault; subscribe. Name them in the `versionedUpdate` family the rulings fix, and settle the
  exact method names here: thread 3's Convex functions map onto them one to one.
* **The expectations.** A bundle update carries the `vault_id` and `passphrase_epoch` it was
  proven against, and lands only if the standing bundle still has both. A lockbox update carries
  the `vault_id` of the vault it was written for and the `revision_id` it read (or none, for a new
  box), and lands only if the scope's standing bundle has that `vault_id` **and** the standing
  lockbox has that `revision_id` (or there is none). A scope with no bundle refuses. This folds
  `vault_id` into `versionedUpdate`, closing the "huge hole" design.md and the rulings name; the
  look-before-write interim in `vault.ts` can then go, if the tests show the expectation covers it.
* **`stale_write`** is a new error kind: a failed expectation. `store()` surfaces it on first
  failure (ruled); no retry. **Erase wins**: erases carry no expectation.
* **Storage-trouble kinds for adapters.** Add the kinds a real backend needs to report calmly,
  so thread 4 does not reach back into the core: likely `not_permitted` (the backend refused this
  user) and `storage_unavailable` (it could not be reached, or failed). Decide the names against
  VOCABULARY.md and TODO.md's *Error families* note, and document when an adapter throws each.
* **Both in-tree adapters** (`localVaultDB` over a StringStore, `idbVaultDB`) implement the new
  verbs. Check-then-save within one synchronous step is atomic enough for them (ruled); the
  IndexedDB adapter's window stays and `notes/security.md` says so (rulings, *TODO(not yet)*).
* **`vault.ts`** calls the new verbs; every `writeBundle`/`writeBox` becomes a versioned update.
* **Tests.** The behaviour every adapter owes -- each verb, each expectation holding and failing,
  erase winning, a scope with no bundle refusing, a box for a reborn vault refusing -- written
  once as a suite parameterized by a VaultDB factory, run against both in-tree adapters. Thread 4
  wants to run the same suite against `convexVaultDB`: make it reachable from
  `packages/safebyok-convex/tests/` without making it public surface (a relative import from the
  workspace is acceptable; an exported `safebyok/testing` entry is a public-surface call to raise,
  not take).

Touches: `src/vault-db.ts`, `src/idb.ts`, `src/vault.ts`, `src/errors.ts`, `src/index.ts`
perhaps, their tests, `notes/security.md`, README if it documents the adapter interface. Depends
on nothing; cut from `origin/main`. Runs beside thread 1. Model: default.

*Look-ahead.* Thread 3 builds Convex functions one-to-one with these verbs, and thread 4 an
adapter class extending this `VaultDB`. So: keep each verb's arguments plain JSON (records,
scopes, labels, expectations), since they cross the Convex wire as-is; make the expectation a
small named type each verb takes, not positional arguments; and let list return summaries that
keep `format`, so a backend that projects server-side (Convex) still hands back something the
base class can validate (design.md, `listBoxSummaries`). `whisper_schema_version` is ruled but not
built; it is **not** this thread's, but when it lands the Convex schema widens with it.

### Thread 3: the Convex component (`20261014-convex_component`)

> Implement the 20261014-convex/design.md according to the plan you propose -- *the component*:
> design.md's *Decisions* on the component, *Tables*, and the server side of the *Interface map*.

*Gloss.* In `packages/safebyok-convex/`:

* **The component**: `convex.config` (`defineComponent`) with its own isolated tables,
  `safebyok_bundles` and `safebyok_lockboxes`, typed columns mirroring the Zod records field for
  field (design.md, *Tables*), ciphered fields nested under one shared `ciphered` validator,
  `format` as a `v.union` of literals so a new record format widens it, numbers as `v.number()`,
  `note` omitted rather than written `undefined`. Indexes `by_scope` and `by_box`, `user_id`
  leading.
* **The functions**, one per verb of thread 2's `VaultDB`, named as design.md's map names them
  (`getBundle`, `createBundle`, `updateBundle`, `getBox`, `listBoxSummaries`, `updateBox`,
  `eraseBox`, `eraseVault`, `watchVault`), each checking its expectations inside the mutation's
  own transaction and refusing with a `ConvexError` whose data carries a `kind` the client maps to
  a `VaultError` (`stale_write`, `not_permitted`, ...). Nothing secret in an error's data.
* **The server class**, whose `.api({ getUserId })` returns the functions the host re-exports
  from its own `convex/` directory; every function resolves `getUserId(ctx)` first: null refuses
  as unauthenticated, a `user_id` argument that differs refuses as forbidden.
* **Packaging**: how a host app installs the component (`app.use(...)` in its
  `convex/convex.config.ts`), the `convex.config` export and generated types in the package
  build (design.md, *Open*). Follow Convex's current component-authoring guidance (thread 1's
  skills; the Convex docs) rather than memory.
* **Tests** with `convex-test` under `@edge-runtime/vm`: each function, each refusal, the
  creation race closed, auth refusals, a real Lockbox and VaultBundle (made by the core's own
  code, with generated test values) round-tripping exactly, and a check that the Convex
  validators accept exactly what the Zod records accept.
* **README** for the package: what the host adds to its `convex/` directory, what is stored.

Touches: `packages/safebyok-convex/` only. Depends on thread 2 (its verbs and error kinds);
stacked on thread 2's branch once that is filed. Reads thread 1's skills from its pushed branch.
Model: default.

*Look-ahead.* Thread 4's client calls these functions through the `api` the host re-exports, so
fix the argument and return shapes with the client in mind: the client does the Zod validation
(through the base class), the component does Convex's. `watchVault` returns the small change
signature design.md names, not records.

### Thread 4: the Convex client adapter (`20261014-convex_client`)

> Implement the 20261014-convex/design.md according to the plan you propose -- *the client*:
> `convexVaultDB(client, api)`, the client side of the *Interface map*.

*Gloss.* In `packages/safebyok-convex/`: `convexVaultDB(client, api)`, a `VaultDB` (thread 2's
class) over a `ConvexClient` or a `ConvexReactClient` (one socket for a React app), each verb one
query or mutation; `ConvexError` kinds mapped to `VaultError`s, and transport failures to the
storage-trouble kind, without ever quoting a record; `maxRecordBytes` 1 MiB; `subscribe` through
`onUpdate` on `watchVault`, skipping the first emit. Tests: thread 2's adapter suite run against
`convexVaultDB` over `convex-test` (or the closest faithful stand-in for a client, if
`convex-test` cannot host one: say what was used), and one whole vault -- `openVault`, store,
read, change the passphrase, a second device seeing the write -- over the adapter. Entry points
and the README's client section; `notes/security.md` for anything a reviewer should see.

Touches: `packages/safebyok-convex/`. Depends on threads 2 and 3; stacked on thread 3's branch
once that is filed. Model: default.

*Look-ahead.* None within this sprint. Beyond it: a demo over Convex, and CI for the package,
are follow-ups for the Coach to call.

## Order

Threads 1 and 2 start together from `origin/main`. Thread 3 is cut from thread 2's tip once
thread 2 files; thread 4 from thread 3's tip once thread 3 files. The Coach merges
1 and 2 (either order), then 3, then 4.

## Coach's rulings during the sprint

* 2026-10-15: **`eraseBox` carries a `vault_id`-only expectation** -- "it's the most likely cause of a vault
  replacing another one" -- and, asked, **`eraseVault` too**. Built in thread 2 (#18), mirrored in thread 3.
* 2026-10-15: **Generic kinds live in the core** ("put things as generic as stale_write, not_permitted,
  storage_unavailable in the core"), and **the Convex threads may influence the core's architecture**, since
  they are proving it out. This relaxes the ground rule below: threads 3 and 4 may change `src/` where the
  adapter shows the core is wrong or missing something generic. Each such change is a separate commit with
  the core's prefix, declared in the thread file and the PR, and must keep every stored record readable.
  Anything Convex-specific stays in `packages/safebyok-convex/`.

## For the Coach

* **The storage-verbs thread (2) was not in your words**, but the design rests on it and your
  rulings settle it; I have planned it rather than ask. It changes `VaultDB`'s public surface:
  any adapter written against the primitives must move to the verbs.
* **#16 and this sprint touch the same files** (`src/vault-db.ts` and friends, moving). Merging
  #16 first means thread 2 rebases across the move at filing; merging thread 2 first means #16
  rebases. Either is mechanical.
* **CI does not run `safebyok-convex`** yet, and #15 owns that job; wiring it is yours to call
  once #15 lands.
* **Convex accounts**: if component codegen needs a login or a deployment, thread 3 will pause
  for you to run one command.
