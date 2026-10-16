# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

**safebyok** is a standalone npm package, written in TypeScript: an end-to-end encrypted vault for
API keys and other small secrets that users bring to a browser app. Secrets are encrypted on the
user's device under keys that never leave it, and are synchronized between devices through a
storage layer the host application plugs in. The backend only ever holds ciphertext.

It is at the very start: the toolchain is in place, and the interface is being designed in
`whiteboard/`. Treat what is there as intent, not as settled design.

Project instructions, loaded at the start of every session. Keep this file short and true:
everything here costs context on every task, whether or not the task needs it.

## Working Relationship

This project follows an Agent-Coach approach. Experienced human architects are the Coaches, with
you (the AI agent) developing the code: two equally important roles. Coaches want pushback where
warranted, and encourage you to think independently, governed by the guardrails outlined here
and in the linked documents.

If a guardrail looks wrong for the case at hand, say so and propose the alternative. Do not
quietly route around it, and do not treat a convention you find inconvenient as optional.

When you report on a PR, branch or commit in chat or in `human/`, link it in full the first time
each message names it (`[#12](https://github.com/mrflip/safebyok/pull/12)`): the Coach often reads
from a phone, where a bare `#12` goes nowhere.

## Philosophy and Values

The top three values while writing code are **empathy, safety and readability**. Empathy here
means three audiences: the developer integrating the package, the end user typing a passphrase,
and the security reviewer reading the code.

* **Never invent cryptography.** Primitives come from WebCrypto or an audited, widely used
  library; constructions follow the design in `whiteboard/` or a published standard. No
  home-made ciphers, padding, key stretching, comparisons or randomness. If the design seems to
  need something new, stop and raise it.
* **Prefer the toolkit to the home brew** (see Library-first, below). If you are banging rocks
  together, we have probably misdirected you or we are solving the wrong problem. Say so.
* **Maintainability and legibility beat performance** unless we have demonstrated that something
  is slow. Cleverness is rarely called for -- but if it seems to be, propose it.

## What the package promises

* **Framework-agnostic, React-friendly.** No React import, ever. State is exposed the way
  `useSyncExternalStore` wants it: `subscribe(listener)` returning an unsubscribe, and a
  `getSnapshot()` whose result is immutable and keeps its identity until something changes. A
  React binding, if there is one, is a thin separate entry point.
* **Pluggable storage.** The core speaks only to storage interfaces. An adapter for a particular
  database lives in its own entry point, and its dependency is an optional peer: an app that
  does not use Convex never installs it.
* **Few runtime dependencies.** Each is a supply-chain decision for every app that installs us.
  Adding one needs a Coach's yes; prefer a peer dependency for anything the host app likely
  already has. Validation is plain Zod, no kit on top of it.
* **Runs everywhere the host app does**: browsers, Node, Bun, and the frameworks on
  them (PROCESS.md, *Dependencies*). No Node built-ins in `src/`. The tests run under Node, where
  WebCrypto is the same global as in a browser.
* **Security First**: if the stronger security measure (eg Argon) is not available on every platform,
  we nonetheless implement it first, and make it pluggable second
* **What is exported is a contract.** Each published package's `src/index.ts` (and each entry
  point beside it) is its public surface, versioned by semver. **A stored vault is a contract
  too**: a change to the shape of what is written to storage must still read every vault already
  written, and says how. **Until 1.0.0, neither binds backward**: no compatibility shims, no
  migrations, no reading of older stored shapes. An old record that fails today's validation
  fails safe (it reads as absent or corrupt), and the changeset says what a host will see.

## Non-Negotiables

* **Library first. Hand-rolling is a decision, not a default.** For any mechanism a library could
  own, look for an existing dependency, then a boring, widely used one (PROCESS.md,
  *Dependencies*), and only then our own code, with a Coach's yes. The pull to hand-roll is
  strongest exactly where it should be weakest: the small, done-a-thousand-times utility (a
  stable stringify, a deep-equal, a debounce). "Twelve lines, cheap to read" is the trap, not
  the justification -- those twelve lines have a proven npm package, and the search for it comes
  before writing them, every time. The Coach's yes comes before the hand-rolled version exists,
  not after.
* **Secret material never leaves through a side door.** Not into an error message, a thrown
  value's properties, a log line, a `toString`, or a validation error quoting its input. `src/`
  writes nothing to the console but through the fallback logger, `src/console-logger.ts`, used
  when a host passes no logger (the linter enforces it everywhere else). An error says what went wrong and what
  to do, calmly, and carries a `kind` a caller can branch on.
* Every new piece of code gets a proportional doc block and test suite: at least one test per use
  case, and one per `@example` (STYLE.md, *Tests*).
* Validate at module entrypoints; write confident, paranoia-free code past that boundary.
* Progress notes, development caveats and open questions go in `human/` or `whiteboard/` --
  never in doc blocks or code comments.
* The core's `eslint.config.mjs` (`packages/safebyok/`) is the final authority on formatting.
  Run the linter; however, if it conflicts with the higher guidelines of legibility and
  productivity, you are approved for `eslint-disable-line` (`no-param-reassign`,
  `no-explicit-any`) or `@ts-expect-error` if they are the correct compromise -- apply them but
  **report it** in chat, or in the PR's open questions.
* Never handle a real secret in a test, fixture or example: generate one, or use an obvious fake.
  Credentials for anything (npm, GitHub) come from the environment, never from a file in the repo.

## Commands

```sh
pnpm install
pnpm justify         # lint, typecheck, test, build, every package: green before every commit
pnpm test            # vitest, every package; pnpm test:coverage likewise
pnpm lint            # eslint, every package
pnpm typecheck       # tsc --noEmit, every package
pnpm build           # tsdown: ESM + CJS + declarations into each dist/, checked by publint and attw
pnpm size            # the tree-shaking budget: size-limit over the built packages, per import
                     # shape (.size-limit.json); CI runs it after the build
pnpm --filter safebyok test        # one package, any script (or `pnpm test` in its directory);
                                   # it builds the packages it depends on first
pnpm --filter safebyok add <dep>   # a package's dependency; `pnpm add -w` is for root tooling only
pnpm changeset                     # a PR's release note; `--empty` when it needs none (PROCESS.md)
```

## Layout

* `packages/` -- the workspace packages: `safebyok` (the core), `safebyok-react` (the React
  binding), `safebyok-fastkey` (a WebAssembly key deriver), and the storage adapters
  `safebyok-convex`, `safebyok-indexeddb`, `safebyok-postgres` and `safebyok-graphql`. A new one
  is named for what it plugs in: `safebyok-<store>` for a storage adapter, `safebyok-<framework>`
  for a binding. Each has its own `package.json`, configs, `src/` and `tests/`, and runs its own
  `pnpm justify`; the root's runs them all.
* In a package, `src/index.ts` is the entry point; nothing else is importable by a consumer unless
  it is its own entry in that package's `tsdown.config.ts` (in `safebyok-convex`, its
  hand-written `exports`, which follow Convex's component layout).
* `tests/` mirrors `src/` path for path: `src/foo/bar.ts` is tested in `tests/foo/bar.test.ts`.
  `fixtures/` holds sample data, when there is some.
* `demos/` -- private playground apps exercising the packages; never published.
* `e2e/` -- the private `safebyok-e2e` package: the adapter-by-framework checks (Convex with
  `ConvexReactClient`; later Vue) and any heavyweight browser spec, so no adapter's `package.json`
  lists a framework. An adapter's own tests stay in its package. Never published; its README says
  where a new pairing goes.
* The root is a private workspace, never published: its own `scripts/` (tested in `tests/scripts/`)
  and the configs that check them.
* `dist/` is built, never committed.
* `whiteboard/` -- work threads in progress, under a `YYYYMMDD-threadname` directory.
* `winboard/` -- finished threads, moved from `whiteboard/` once addressed, each with the
  `human/` reports that went with it (`*-human.md`) and a `*-resolution.md` of its gripes.
  **Historical files**: what they say may be outdated or no longer relevant. Check the code and
  current docs before acting on anything there.
* `human/` -- **from agents, to Coaches.** A scratchpad, not a record: write to it, don't read it
  as input. `human/README.md` has the rules.
* `notes/` -- durable notes. `notes/security.md` lists decisions a security reviewer should look
  at: **add one whenever you make such a decision.** `notes/wontfix.md` lists behaviour left
  undefined on purpose.

## Notable files

* `PROCESS.md` -- threads, branches, commits, PRs, releases, dependencies. **Read before any git
  operation beyond a commit, and before adding a dependency.**
* `VOCABULARY.md` -- the cast: whisper, lockbox, vault, passphrase, each key by role, and their
  encrypted forms. Its names are the only names for those things, in code, docs and stored fields.
* `STYLE.md` -- the naming vocabulary (`val`, `ckey`, `bag`, `kind`, and what `key` means here),
  braces, quotes, doc blocks, and how tests are written. These conventions are specific and
  unguessable. **Read before naming anything new or writing a test.**
* `packages/safebyok/eslint.config.mjs` -- mechanically enforced style; the other packages' and
  the root's configs are cut from it. Where it and a prose document disagree, it is a bug -- flag
  it.
* `tsconfig.base.json` -- every compiler strictness flag, extended by every tsconfig, which adds
  only its runtime (lib, types, jsx). Its `@safebyok/source` condition has tsc, the editor and
  lint read a sibling package's `src/`, never a stale `dist/`.

## Conventions At A Glance

Enough to keep you out of trouble on a small edit. STYLE.md is the real source.

* Semicolonless. Two-space indents, no tabs.
* Always brace blocks, even single-statement ones: `if (nope) { return }`
* Opening brace at end of line; cuddle `} else if (...) {` and `} catch (err) {`.
* No single-letter names. Never bare `name`, `value`, `node`, `query`. Use `err`, never `error`.
  `type` only for an actual datatype; for "variety of", `kind` or `flavor`.
* Never a bare `key`: a cryptographic key is named for its role (`vaultKey`, `lockboxKey`); a
  map key is a `ckey`. The linter refuses `key`, `name`, `value`, `node`, `error` and `query` as
  a variable or parameter.
* `const` by default; when necessary, `let`; never `var`. Functional style is strongly preferred.
* Parenthesize and space every negation: `if (! approved) { ... }`
* Stored fields are underbar_case (`salt_bytes`); everything else camelCase.
