# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## Project status

**safebyok** is a TypeScript npm package: an end-to-end encrypted vault for API keys and other
small secrets a user brings to a browser app. Secrets are encrypted on the device under keys that
never leave it, and synchronized between devices through a storage layer the host application
plugs in; the backend only ever holds ciphertext. Not yet used outside the project that motivated
it, but close to a wider release.

## Working relationship

This project follows an Agent-Coach approach: experienced human architects are the Coaches, you
(the AI agent) develop the code, two equally important roles. Coaches want pushback where
warranted. If a guardrail looks wrong for the case at hand, say so and propose the alternative;
never route around it quietly, or treat an inconvenient convention as optional.

Name the operation. `read` and `write` mean a generic storage read or mutation, and are right only
when any of them is meant; otherwise say which call: `ensureVault`, `vault.refresh`, `putBox`,
`lock()`. In chat, plans, doc blocks and names alike: "a read in flight" hides which read, and whose.

## Values

**Empathy, safety and readability.** Empathy has three audiences: the end user typing a
passphrase, the customer integrating the package, and the security reviewer reading the code.

* **Never invent cryptography.** No home-made ciphers, padding, key stretching, comparisons or
  randomness. Primitives come from WebCrypto or an audited, widely used library; constructions
  follow those already in `src/` or a published standard. If a task seems to need something new,
  stop and raise it.
* **Library first. Hand-rolling is a decision, not a default.** For any mechanism a library could
  own: an existing dependency, then a boring, widely used one (PROCESS.md, *Dependencies*), and
  only then our own code, with a Coach's yes before it exists. The pull to hand-roll is strongest
  exactly where it should be weakest: the small, done-a-thousand-times utility (a stable
  stringify, a deep-equal, a debounce). "Twelve lines, cheap to read" is the trap: those twelve
  lines have a proven npm package, and the search for it comes first. Each dependency is a
  supply-chain decision for every app that installs us, so prefer a peer dependency for what the
  host app likely already has. If you are banging rocks together, we have probably misdirected
  you: say so.
* **Maintainability and legibility beat performance** unless it is shown to be slow where it
  matters. Cleverness is rarely called for; if it seems to be, propose it.
* **Validate at module entrypoints**, then write confident, paranoia-free code past that boundary.
* **Security first.** Where the stronger measure (Argon2id, say) is not available on every
  platform, implement it first anyway, and make it pluggable second.

## What the package promises

The core README states the promises a host relies on: framework-agnostic state exposed the way
`useSyncExternalStore` wants it, a core that speaks only to interfaces with each adapter in its
own package, and a `src/` that runs wherever the host does (no Node built-ins). Two of them
govern how code is changed:

* **What is exported is a contract**, versioned by semver: each published package's `src/index.ts`
  and the entry points beside it. **A stored vault is a contract too**: a change to the shape of
  what is written to storage must still read every vault already written, and says how. **Until
  1.0.0, neither binds backward**: no compatibility shims, no migrations, no reading of older
  stored shapes. An old record that fails today's validation fails safe (it reads as absent or
  corrupt), and the changeset says what a host will see.
* **The vaultDB is the ground truth; what the vault holds is a cache.** A fundamentally
  inconsistent state (a `vault_tok` drifted from its scope, props and boxes naming different
  vaults, an epoch gone backwards) means a reload of the vault from storage: never a repair, a
  refusal to handle, or a check added to catch it earlier. A data-integrity failure met in a
  consistent state (a record known to be irrecoverable) is a different thing, and is reported.

## Non-negotiables

* **Secret material never leaves through a side door**: not an error message, a thrown value's
  properties, a log line, a `toString`, or a validation error quoting its input. Log through the
  host's logger, never `console`.
* Never handle a real secret in a test, fixture or example: generate one, or use an obvious fake
  that validates. Credentials for anything (npm, GitHub) come from the environment, not a file.

## Commands

```sh
pnpm install
pnpm justify         # lint, typecheck, test, build, size budget, every package: green before every commit
pnpm --filter safebyok <task>      # lint, typecheck, test, build in one package, its dependencies built first
pnpm --filter safebyok add <dep>   # a package's dependency; `pnpm add -w` is for root tooling only
pnpm changeset                     # a PR's release note; `--empty` when it needs none (PROCESS.md)
```

## Layout

* `packages/` -- the published packages, each with its own `package.json`, configs, `src/`,
  `tests/` (mirroring `src/` path for path; `fixtures/` holds sample data) and `pnpm justify`:
  `safebyok` (the core), `safebyok-react`, `safebyok-fastkey` (WASM key deriver), and the storage
  adapters (convex, indexeddb, postgres, graphql). A consumer imports only `src/index.ts` and the
  other entries in the package's `tsdown.config.ts` (`safebyok-convex`: its hand-written `exports`).
* Private, never published: the root (`scripts/`, tested in `tests/scripts/`), `demos/`, and
  `e2e/` (adapter-by-framework checks, so no adapter lists a framework; its README says where a
  new pairing goes).
* `whiteboard/` and `winboard/` -- thread and session folders, `YYYYMMDD-<label>/`, open and
  done. They swamp a repo-wide search: search `packages/` and the root's docs, or pass
  `--exclude-dir={whiteboard,winboard}`. Read only the folder of the thread you are working in or
  your task names; where it disagrees with the code, the code wins.
* `human/` -- from agents to Coaches. Progress notes, caveats and open questions go here or in the
  thread's whiteboard, never in doc blocks or comments. Write to it, never read it
  (`human/README.md`).
* `notes/` -- durable notes. A decision a security reviewer should see goes into
  `notes/security.md` through a `sonnet` subagent (the file's header says how); don't read it
  yourself. `notes/wontfix.md`: behaviour left undefined on purpose. `notes/old_vocabulary.md`:
  the names the Oct 2026 reform retired, for reading older code and records; nothing current
  uses them.

## Reading

What you read stays in your context and is paid for on every later turn: read for the task at
hand, and never twice. Find with `grep -n`, then read the lines you need; read a file whole only
when you will change it or need most of it. A file past about 800 lines is searched,
never read through (a test folder keeps a theme per file: grep it, read the one file). The README
is searched by its headings; a code file's section banners are its table of contents:
`grep -n '// == '` (`// == [Name]: key names` opens a section, `// --` closes it), then read the
range. The documents below are looked up by section.

## Notable files

* `PROCESS.md` -- threads, branches, commits, PRs, changesets, dependencies. **Read the section
  you need before any git operation beyond a commit, and before adding a dependency.** The main
  checkout is shared: a thread is built in a worktree of its own, cut by `scripts/cut-thread`
  (*A worktree per thread*).
* `VOCABULARY.md` -- the cast: whisper, box, vault, passphrase, each key by role, and their
  encrypted forms. Its names are the only names for those things, in code, docs and stored
  fields. **Look up a term you do not recognize**, and look before naming a new thing in the cast.
* `STYLE.md` -- naming (`val`, `ckey`, `bag`, `kind`, what `key` means here), layout, doc blocks,
  validation and tests: specific, unguessable, and only partly linted. **Read *Naming* before
  naming an export, a module, a stored field or a new tag; *Comments and doc blocks*, *Tests* or
  *Validation* before writing a doc block, a test, or an entrypoint that takes a caller's input.**
  Every export has a doc block written for its caller and tests in proportion.
* `packages/safebyok/eslint.config.mjs` -- the final authority on formatting; the other configs
  are cut from it. Where it and a prose document disagree, flag the bug. `@ts-expect-error` and
  `eslint-disable-line` are allowed as the correct compromise; **always report each one** in chat
  and in the PR's open questions.
* `tsconfig.base.json` -- every strictness flag, extended by every tsconfig; its comments say why.
* **Claude Docs** (a `claude.ai/.../artifact/<id>` link). To read one, spawn the `doc-tab-reader`
  agent with the URL and follow its description; to edit one, load the docs skill.

## Naming at a glance

STYLE.md *Naming* is the source; these few shape code too deeply to fix in review.

* The cast keeps VOCABULARY.md's names (whisper, box, vault), never `data` or `payload`. A
  cryptographic key is named for its role (`vaultKey`, `boxKey`); a map key is a `ckey`.
* Smush the tags `name`, `kind`, `label`, `path` and `bag` into one word: `vaultlabel`,
  `woodkind`. `type` is only a datatype; a menu choice is a `kind` or a `flavor`.
* Stored fields are underbar_case (`salt_bytes`), everything else camelCase. Times are integer
  UTC epoch milliseconds, never strings or `Date`s.
