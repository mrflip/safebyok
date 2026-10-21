# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

**safebyok** is a standalone npm package, written in TypeScript: an end-to-end encrypted vault for
API keys and other small secrets that users bring to a browser app. Secrets are encrypted on the
user's device under keys that never leave it, and are synchronized between devices through a
storage layer the host application plugs in. The backend only ever holds ciphertext.

It is not yet used outside of the project that motivated it, but we are close to a wider release.

## Working Relationship

This project follows an Agent-Coach approach. Experienced human architects are the Coaches, with
you (the AI agent) developing the code: two equally important roles. Coaches want pushback where
warranted, and encourage you to think independently, governed by this file and the linked documents.

If a guardrail looks wrong for the case at hand, say so and propose the alternative. Do not
quietly route around it, and do not treat a convention you find inconvenient as optional.

Link each PR, branch or commit on first mention (`[#12](https://github.com/mrflip/safebyok/pull/12)`).

## Philosophy and Values

The top three values while writing code are **empathy, safety and readability**. Empathy here
means three audiences: the end user typing a passphrase, the customer integrating the package,
and the security reviewer reading the code.

* **Never invent cryptography.** No home-made ciphers, padding, key stretching, comparisons or
  randomness. Primitives come from WebCrypto or an audited, widely used library; constructions
  follow those already in `src/` or a published standard. If your task seems to need something
  new, stop and raise it.
* **Prefer the toolkit to the home brew** (see Library-first, below). If you are banging rocks
  together, we have probably misdirected you or we are solving the wrong problem. Say so.
* **Maintainability and legibility beat performance** unless it is shown to be slow where it
  matters. Cleverness is rarely called for -- but if it seems to be, propose it.

## What the package promises

* **Security first.** Where the stronger measure (Argon2id, say) is not available on every
  platform, we implement it first anyway, and make it pluggable second.
* **Framework-agnostic, framework-friendly.** State is exposed the way `useSyncExternalStore`
  wants it: `subscribe(listener)` returning an unsubscribe, and an immutable `getSnapshot()`
  that keeps its identity until something changes.
* **Pluggable interfaces.** The core speaks only to interfaces. A concrete implementation lives
  in its own package or entry point, its dependencies optional peers: an app that does not use
  Postgres never installs it.
* **Few, tree-shakeable runtime dependencies.** We are library-first, but each dependency is a
  supply-chain decision for every app that installs us. Adding one needs a Coach's yes before
  a PR is merged. Prefer a peer dependency for anything the host app likely already has.
* **Runs everywhere the host app does**: browsers, Node, Bun, and the frameworks on
  them (PROCESS.md, *Dependencies*). No Node built-ins in `src/`.
* **What is exported is a contract.** Each published package's `src/index.ts` (and each entry
  point beside it) is its public surface, versioned by semver. **A stored vault is a contract
  too**: a change to the shape of what is written to storage must still read every vault already
  written, and says how. **Until 1.0.0, neither binds backward**: no compatibility shims, no
  migrations, no reading of older stored shapes. An old record that fails today's validation
  fails safe (it reads as absent or corrupt), and the changeset says what a host will see.
* **The vaultDB is the ground truth; what the vault holds is a cache.** A fundamentally
  inconsistent state (a `vault_id` drifted from its scope, props and boxes naming different
  vaults, an epoch gone backwards) means a reload of the vault from storage, never a repair, a
  refusal to handle, or a check added to catch it earlier. A data-integrity failure met in a
  consistent state (a record known to be irrecoverable) is a different thing, and is reported.

## Non-Negotiables

* **Library first. Hand-rolling is a decision, not a default.** For any mechanism a library could
  own, look for an existing dependency, then a boring, widely used one (PROCESS.md,
  *Dependencies*), and only then our own code, with a Coach's yes. The pull to hand-roll is
  strongest exactly where it should be weakest: the small, done-a-thousand-times utility (a
  stable stringify, a deep-equal, a debounce). "Twelve lines, cheap to read" is the trap, not
  the justification -- those twelve lines have a proven npm package, and the search for it comes
  before writing them. The Coach's yes comes before the hand-rolled version exists, not after.
* **Secret material never leaves through a side door.** Not into an error message, a thrown
  value's properties, a log line, a `toString`, or a validation error quoting its input.
  Log through the host's logger, never `console`. Errors must say what went wrong and what
  to do, calmly, for a non-expert, and carry a `kind` the caller can branch on.
* Every new piece of code gets a proportional doc block and test suite (STYLE.md, *Tests*).
* Validate at module entrypoints; write confident, paranoia-free code past that boundary.
* Progress notes, development caveats and open questions go in `human/` or `whiteboard/` --
  never in doc blocks or code comments.
* The core's `eslint.config.mjs` (`packages/safebyok/`) is the final authority on formatting.
  If the linter conflicts with the higher guidelines of legibility and productivity, you are
  approved for `@ts-expect-error` or `eslint-disable-line` (`no-param-reassign`,
  `no-explicit-any`) when they are the correct compromise. **Always report it** in chat and in
  the PR's open questions.
* Never handle a real secret in a test, fixture, or example: generate one or use an obvious
  fake that validates. Credentials for anything (npm, GitHub) come from the environment, not a file.

## Commands

```sh
pnpm install
pnpm justify         # lint, typecheck, test, build, treeshake budget for every package: green before every commit
pnpm test            # vitest, every package; pnpm test:coverage likewise
pnpm lint            # eslint, every package
pnpm typecheck       # tsc --noEmit, every package
pnpm build           # tsdown: ESM + CJS + declarations into each dist/, checked by publint and attw
pnpm --filter safebyok <task>      # runs within target package after building its dependencies; or run `pnpm <task>` in its directory
pnpm --filter safebyok add <dep>   # a package's dependency; `pnpm add -w` is for root tooling only
pnpm changeset                     # a PR's release note; `--empty` when it needs none (PROCESS.md)
```

## Layout

* `packages/` -- the published packages, each with its own `package.json`, configs, `src/`,
  `tests/` and `pnpm justify`: `safebyok` (the core), `safebyok-react`, `safebyok-fastkey` (WASM
  key deriver), and the storage adapters (convex, indexeddb, postgres, graphql).
* A consumer imports only `src/index.ts` and the other entries in the package's
  `tsdown.config.ts` (in `safebyok-convex`, its hand-written `exports`).
* `tests/` mirrors `src/` path for path; `fixtures/` holds sample data.
* Private, never published: the root (`scripts/`, tested in `tests/scripts/`), `demos/`, and
  `e2e/` (adapter-by-framework checks, so no adapter lists a framework; its README says where a
  new pairing goes).
* `whiteboard/` and `winboard/` -- thread and session folders, `YYYYMMDD-<label>/`: in
  `whiteboard/` while open, moved to `winboard/` when done. They swamp a repo-wide search:
  search `packages/` and the root's docs instead, or pass `--exclude-dir={whiteboard,winboard}`.
  Read the folder of the thread or session you are working in, or one
  your task names, and no other: you need none of the rest to build, and where it disagrees
  with the code, the code wins.
* `human/` -- from agents to Coaches: write to it, never read it as input (`human/README.md`).
* `notes/` -- durable notes. Each decision a security reviewer should see goes into
  `notes/security.md` through a `sonnet` subagent (the file's header says how); don't read it
  yourself. `notes/wontfix.md`: behaviour left undefined on purpose.
  `notes/old_vocabulary.md`: the names the Oct 2026 reform retired, to read older code and records by;
  nothing current uses them.

## Reading

What you read stays in your context and is paid for again on every later turn, so read for the
task at hand, and never read again what is already there. Find with `grep -n`, then read the
lines you need. Read a file whole when you will change it or need most of it.
These are long enough to search instead, reading only the lines you need: in
`packages/safebyok/`, `src/vault.ts`, `src/vault-db.ts`, `README.md`, `tests/vault-db.test.ts`,
`tests/test-helpers.test.ts`, `tests/test-helpers/vault-db-conformance.ts`, and the `tests/vault/`
folder taken together (a theme per file: grep it, read the one file);
`safebyok-react/tests/vault-provider/` taken together (a theme per file) and `passphrase-modal.test.tsx`;
`safebyok-postgres/tests/postgres-vault-db.test.ts`. The README is searched by its headings; each
code file here carries section banners: `grep -n '// == '` is its table of contents
(`// == [Name]: key names` opens a section, `// --` closes it), then read the range.
The documents below are looked up by section, not read through.

## Notable files

* `PROCESS.md` -- threads, branches, commits, PRs, changesets, dependencies. **Read the section
  you need before any git operation beyond a commit, and before adding a dependency.**
* `VOCABULARY.md` -- the cast: whisper, box, vault, passphrase, each key by role, and their
  encrypted forms. Its names are the only names for those things, in code, docs and stored fields.
  The code already speaks it: **look up a term you do not recognize**, or before naming a new
  thing in the cast.
* `STYLE.md` -- the naming vocabulary (`val`, `ckey`, `bag`, `kind`, and what `key` means here),
  braces, quotes, doc blocks, and how tests are written. These conventions are specific and
  unguessable, and the linter enforces only some of them. *Conventions At A Glance*, below,
  covers a local name and a small edit. **Read the section you need before naming an export, a
  module, a stored field or a new tag (*Naming*), and before writing a doc block, a test, or an
  entrypoint that takes a caller's input (*Validation*).**
* `packages/safebyok/eslint.config.mjs` -- mechanically enforced style; the other packages' and
  the root's configs are cut from it. Where it and a prose document disagree, it is a bug -- flag
  it.
* `tsconfig.base.json` -- every compiler strictness flag, extended by every tsconfig, which adds
  only its runtime (lib, types, jsx). Its `@safebyok/source` condition has tsc, the editor and
  lint read a sibling package's `src/`, never a stale `dist/`.
* **Claude Docs.** Editing or interacting with a doc: load the docs skill and the Docs guides
  `topic.index`, `topic.tabs`, and (if needed) `topic.editing`. Reading only (a
  `claude.ai/.../artifact/<id>#<tab>` link): spawn the `doc-tab-reader` agent (haiku) with the
  URL. It `export`s the tab as markdown into the scratchpad and returns the path, byte count and
  outline; you `grep -n` and read only the lines you need. For a read, skip the docs skill, don't
  `read` the doc (its XML costs far more), and don't `export` yourself (base64 you would have
  to retype). The markdown drops diagrams, charts, highlights and comment anchors: if the doc
  leans on one, say so. Keep questions about the content for yourself: haiku fetches reliably
  but misreads.

## Conventions At A Glance

The house conventions a writer gets wrong unless told: the linter does not catch these, or they
shape code too deeply to fix in review. The linter has semicolons, indents, `const` and the
banned names. STYLE.md is the real source.

* Always brace, opening brace at the end of the line, cuddled: `if (nope) { return }`,
  `} else if (...) {`, `} catch (err) {`. Parenthesize and space every negation: `if (! approved)`.
* `"` for prose, error messages, and `describe`/`it` titles. Otherwise use `'`.
* No single-letter names, even in a lambda: `(row) => row.label`. `ii`, `jj` for a loop counter.
* The cast keeps VOCABULARY.md's names -- whisper, box, vault -- never `data` or `payload`. A
  cryptographic key is named for its role (`vaultKey`, `boxKey`); a map key is a `ckey`.
* Smush the tags `name`, `kind`, `label`, `path` and `bag` into one word: `vaultlabel`,
  `woodkind`. `type` is only a datatype; a menu choice is a `kind` or a `flavor`.
* Stored fields are underbar_case (`salt_bytes`); everything else camelCase. Use integer
  UTC epoch milliseconds, not strings or `Date`s, for times.
* A module of related verbs is star-imported under its Startcase name: `Names.checkFloor(...)`.
* Every export has a doc block written for its caller. Each `@example` in it has a test whose
  title points back to it: `"refuses a misspelt field, as its second example shows"`.
* A doc block's purpose goes on its `/**` line, a sentence that stands alone when the block is
  folded: `/** Read storage and settle the vault.`, the rest on ` * ` lines below. Never `/**`
  alone on its line, whatever the blocks around you do (STYLE.md, *Comments and doc blocks*).
* Tests are chai-style (`expect(foo).to.eq(bar)`), their helpers star-imported as `TH`.
