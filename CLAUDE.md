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

* **Never invent cryptography.** Primitives from WebCrypto or an audited library; constructions
  from `src/` or a published standard; anything new, stop and raise it.
* **Library first. Hand-rolling is a decision, not a default.** For any mechanism a library could
  own: an existing dependency, then a boring, widely used one (PROCESS.md, *Dependencies*), and
  only then our own code, with a Coach's yes before it exists. The pull to hand-roll is strongest
  exactly where it should be weakest: the small, done-a-thousand-times utility (a stable
  stringify, a deep-equal, a debounce). If you are banging rocks together or confecting
  machinery because something straightforward is not working well, we have probably
  misdirected you: say so.
* **Maintainability and legibility beat performance** unless it is shown to be slow where it
  matters. Cleverness is rarely called for; if it seems to be, propose it.
* **Validate with Zod at each module entrypoint**, every export, then write confident,
  paranoia-free code past it: a private helper trusts its exported caller.
* **Take a part of a thing by parsing or destructuring, never by spreading it**: a spread drops
  its getters and copies every other field. Host code gets plain data, never the thing.
* **Security first.** Where the stronger measure (Argon2id, say) is not available on every
  platform, implement it first anyway, and make it pluggable second.
* **Secret material never leaves through a side door**: beware leakage via error objects or logging.

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

## Commands

```sh
pnpm justify                       # lint, typecheck, test, build, size budget, every package: green before every commit
pnpm --filter safebyok <task>      # lint, typecheck, test, build in one package, its dependencies built first
pnpm --filter safebyok add <dep>   # a package's dependency; `pnpm add -w` is for root tooling only
pnpm changeset                     # a PR's release note; `--empty` when it needs none (PROCESS.md)
```

## Layout

* `packages/` -- `safebyok` (the core) and `safebyok-*` (clients, adapters, plugins).
* Private, never published: the root (`scripts/`, tested in `tests/scripts/`), `demos/`, and
  `e2e/` (adapter-by-framework checks).
* `whiteboard/` and `winboard/` -- thread and session folders, `YYYYMMDD-<label>/`, open and
  done. Your own thread's folder is yours to read and search. Every other is a historic artifact:
  exclude them from searches (`--exclude-dir={whiteboard,winboard}`) and open one only when your
  task names it. Precedence: your instructions and plan, then your whiteboard, then the code.
* `human/` -- from agents to Coaches. Progress notes, caveats and open questions go here or in the
  thread's whiteboard, never in doc blocks or comments. Write to it, never read it
  (`human/README.md`).
* `notes/` -- durable notes. A decision a security reviewer should see goes into
  `notes/security.md` through a `sonnet` subagent (the file's header says how); don't read it
  yourself. `notes/wontfix.md`: behaviour left undefined on purpose.

## Reading

A file past about 800 lines is searched, never read through. Search .md files by headings.
A code file's section banners are its table of contents:
`grep -n '// == '` (`// == [Name]: key names` opens a section, `// --` closes it).

## Notable files

* `PROCESS.md` -- threads, branches, commits, PRs, changesets, dependencies. **Read the section
  you need before any git operation beyond a commit, and before adding a dependency.** The base
  checkout is shared: a thread is built in a worktree of its own, cut by `scripts/cut-thread`
  (*A worktree per thread*).
* `VOCABULARY.md` -- the cast: whisper, box, vault, passphrase, each key by role, and their
  encrypted forms. Its names are the only names for those things, in code, docs and stored
  fields. **Look up a term you do not recognize**, and look before naming a new thing in the cast.
* `STYLE.md` -- naming (`val`, `ckey`, `bag`, `kind`, what `key` means here), layout, doc blocks,
  validation, shapes and tests: specific, unguessable, and only partly linted. **Writing code,
  read *Naming* once; read *Comments and doc blocks*, *Tests*, *Validation* or *Shapes and duck
  typing* when you write a doc block, a test, a validator, or a type or class that holds state.**
  Every export has a doc block written for its caller and tests in proportion.
* `packages/safebyok/eslint.config.mjs` -- the final authority on formatting; the other configs
  are cut from it. Where it and a prose document disagree, flag the bug. `@ts-expect-error` and
  `eslint-disable-line` are allowed as the correct compromise; **always report each one** in chat
  and in the PR's open questions.
* `tsconfig.base.json` -- every strictness flag, extended by every tsconfig; its comments say why.
* **Claude Docs** (a `claude.ai/.../artifact/<id>` link). For a tab's text alone, spawn the
  `doc-tab-reader` agent with the URL and follow its description. To edit or comment, or for what
  markdown drops (diagrams, charts, highlights, comments), load the docs skill.

## Naming at a glance

STYLE.md *Naming* is the source; these few shape code too deeply to fix in review.

* The cast keeps VOCABULARY.md's names (whisper, box, vault), never `data` or `payload`. A
  cryptographic key is named for its role (`vaultKey`, `boxKey`); a map key is a `ckey`.
* Smush the tags `name`, `kind`, `label`, `path` and `bag` into one word: `vaultlabel`,
  `woodkind`. `type` is only a datatype; a menu choice is a `kind` or a `flavor`.
* Stored fields are underbar_case (`salt_bytes`), and so is a host-facing field holding one
  (`user_id`, never `userId`); everything else camelCase. Times are integer UTC epoch
  milliseconds, never strings or `Date`s.
