# Thread 1: Convex agent skills, scoped to safebyok-convex (2026-10-15)

Branch `20261014-convex_skills`, PR [#17](https://github.com/mrflip/safebyok/pull/17), cut from origin/main (`7f84c7b`). Justify:
root green (12 files, 174 tests, build, attw, publint). The package's own `pnpm justify` fails
at lint ("all of the files matching the glob pattern '.' are ignored") because the package has
no JS or TS yet. That failure is the same on main, and thread 3's sources end it.

* **Built**: six of Convex's official agent skills in `packages/safebyok-convex/.claude/skills/`.
  They come from [get-convex/agent-skills](https://github.com/get-convex/agent-skills) at
  `191a5c33a7e7a22ec9d5ff13930f84748bbcf8f8` (Apache-2.0). Beside them sit their license
  (`LICENSE-convex-agent-skills`) and a `README.md` giving the source, what each skill is for,
  every local change, and a line for each skill left out. Commit `96c7a91` holds the verbatim
  copy, and `2343f0e` and `9af2ddd` the local edits, so
  `git diff 96c7a91 9af2ddd -- packages/safebyok-convex/.claude` shows every one. TODO's entry
  is struck.

## For threads 3 and 4: what to read, and for what

Read from the pushed branch with
`git show origin/20261014-convex_skills:packages/safebyok-convex/.claude/skills/<path>`.
Once this merges, they load by themselves the first time an agent reads or edits a file under
`packages/safebyok-convex/` (see *Discoveries*).

| Path under `.claude/skills/` | Read it for |
| --- | --- |
| `convex-create-component/SKILL.md` | **Component authoring**: `defineComponent`, component-owned tables, the boundary rules (no `ctx.auth` or `process.env` inside a component; host IDs cross as `v.string()`; the host re-exports through its own wrappers), and codegen order |
| `convex-create-component/references/packaged-components.md` | The packaged layout: exports (root, `./convex.config.js`, `./_generated/component.js`, `./test`), build order, testing |
| `convex-create-component/references/advanced-patterns.md` | **Class-based wrappers** (the shape of `.api({ getUserId })`), validators derived from the schema |
| `convex-expert/SKILL.md` | **Schema and validators, queries and mutations**: object form, `args` and `returns` everywhere, `v.union` of `v.literal`, `withIndex` not `.filter`, bounded reads, `null` not `undefined` |
| `convex-test/SKILL.md` | **convex-test** basics: `convexTest(schema)`, `t.run`, `t.query` and `t.mutation` |
| `convex-verify/SKILL.md` | **convex-test setup**: `environment: "edge-runtime"` and `server.deps.inline: ["convex-test"]` in vitest (without them, `import.meta.glob is not a function`); negative tests for the wrong user, no user, and data scope |
| `convex-reviewer/SKILL.md` | A review pass over the component's functions |
| `convex-docs/SKILL.md` | Checking the installed `convex` (1.46.0) `.d.ts` before trusting memory |

**No Convex skill covers the client** (`ConvexClient`, `ConvexReactClient`, `onUpdate`) or
**`ConvexError` with `data`**. Thread 4, and thread 3 for the errors, should read the sources
the README lists under *Not covered by any Convex skill*:
* the JavaScript client and API class pages on docs.convex.dev;
* `node_modules/convex/dist/esm-types/browser/simple_client.d.ts` (`ConvexClient.onUpdate`);
* `.../react/client.d.ts` (`ConvexReactClient.watchQuery(...).onUpdate`);
* `.../values/errors.d.ts`;
* the *Application Errors* and *OCC and Atomicity* pages;
* `node_modules/convex-test/README.md`.

## Decisions taken

* **Source A only** (`get-convex/agent-skills`). The docs and the `convex` CLI both name it,
  and `version.convex.dev` reports its HEAD as current. Convex's Claude Code plugin
  (`get-convex/convex-backend-skill`), its Cursor and Codex plugins, and `npx convex ai-files
  install` were not used. The plugins add session hooks that run code, telemetry on by
  default, a remote freshness check, log monitors and an MCP server. `ai-files` runs
  `npx skills@latest` and writes into `CLAUDE.md`. The files were copied by hand from a
  clone, and nothing from the download was run.
* **Which skills, and which files.** Kept `convex-create-component` (`SKILL.md` plus the
  packaged and advanced references), `convex-expert`, `convex-test`, `convex-verify`,
  `convex-reviewer` and `convex-docs`. `convex-test` is thin, but `convex-verify` composes with
  it by name. The other 27 are listed in the README, each with its reason.
* **Everything sits at package level**, not deeper. The package has no subdirectories yet, and
  a deeper skill would load only once an agent touched that subtree.
* **Convex's `guidelines.md` is not vendored.** It is the densest single reference, but it
  carries no license. The README points at its URL instead.

## Deviations

* **The vendored text is edited, not just installed.** Left as-is, `convex-expert` and
  `convex-create-component` tell an agent to run `npx convex dev` and push to a deployment.
  The expert skill can even set `CONVEX_AGENT_MODE=anonymous`, which rebinds `.env.local`.
  That runs into the plan's rule that a deployment is the Coach's to set up. Those rules now
  say: run codegen and `pnpm justify`, and stop and ask the Coach at a login or a deployment.
* The other edits:
  * narrow the component skill to the packaged shape;
  * remove hand-offs to skills and files that are not installed;
  * qualify three `convex-expert` rules that read wrongly inside a component (`v.id`,
    internal-by-default, "only in `convex/`");
  * fix a missing `args` in one example.
* Each changed file opens with a note saying so (Apache-2.0 §4(b)), and the README lists every
  change.

## Discoveries

* **Nested skills load lazily.** This comes from code.claude.com/docs/en/skills.md, read
  through a summarizing fetch by a `claude-code-guide` agent. A `.claude/skills/` below the
  launch directory is not loaded at startup. It loads the first time Claude reads or edits a
  file in that subdirectory, then stays for the whole session (it does not stay scoped to the
  subtree). `/add-dir packages/safebyok-convex` loads it sooner (v2.1.257+). No setting is
  needed. A skill that shares a name with one at the root becomes directory-qualified
  (`packages/safebyok-convex:<name>`); none of these clash.
* **Subagents are not documented.** The docs do not say whether a subagent sees a nested skill
  its parent loaded, or whether a subagent's own reads trigger the load. A subagent can call
  project skills through the Skill tool. The safe instruction for a worker is to read the
  `SKILL.md` it needs directly, which works either way.
* **Worktrees** search only up to their own root, and the docs' fallback to the main
  checkout's skills covers root `.claude/skills` only. The nested skills reach a worktree
  because they are committed: a gitignored copy would not.
* `SKILL.md` frontmatter supports a `paths:` glob field, but the docs describe it as loading
  automatically, not hiding. It is not used here.
* **A flaky core test, 1 run in 64**: `tests/crypto.test.ts`, "refuses altered ciphertext and
  the wrong key alike", alters the ciphertext by setting its first base64url character to `A`.
  When that character already is `A`, nothing is altered and decryption rightly succeeds. It
  failed once during this thread's justify and passed on rerun. It is a defect in the test, not
  in the crypto, and the fix (flip a byte rather than overwrite a character) belongs to a core
  thread.
* If `safebyok-convex` is ever published, its `package.json` `files` should leave out
  `.claude/`.

## For the Coach

* **TODO.md**: the main checkout holds an uncommitted rewrite of TODO.md, which moves this
  entry under *Convex skills in the convex sub-package* with "stays here until it lands". This
  branch removes the original two lines from main's version, so whichever lands second
  resolves a two-line conflict by dropping the entry.
* Convex's docs recommend `/plugin install convex@claude-plugins-official` for Claude Code. It
  was deliberately not taken, for the hooks and default-on telemetry above. Your call if you
  want it in your own user settings; nothing here depends on it.
