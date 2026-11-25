# Convex agent skills for safebyok-convex

Six of Convex's official agent skills, chosen for what this package does: author a packaged
Convex **component**, write its **schema and validators**, its **queries and mutations**, test
them with **`convex-test`**, and review them. They are scoped to `packages/safebyok-convex/`:
Claude Code loads a nested `.claude/skills/` the first time it reads or edits a file below this
package (or sooner, with `/add-dir packages/safebyok-convex`), and not before.

Nothing here is executable: every file is Markdown, outside every lint, typecheck and test glob.

## Source

| | |
| --- | --- |
| Repository | [get-convex/agent-skills](https://github.com/get-convex/agent-skills), the source [docs.convex.dev/ai/agent-skills](https://docs.convex.dev/ai/agent-skills) names and `npx convex ai-files install` installs from |
| Commit | `191a5c33a7e7a22ec9d5ff13930f84748bbcf8f8` (2026-10-13, "Sync from convex-agents@cfccf3e"); retrieved 2026-10-14 |
| License | Apache-2.0, copied beside this file as `LICENSE-convex-agent-skills` |

Copied by hand from a clone, not by `npx skills add` or `npx convex ai-files install`: both run
code fetched at install time, and the latter also writes into a `convex/` directory and the
repo's `CLAUDE.md`. To update, clone the repository at a newer commit, diff each kept file
against it, and carry the local changes below across.

## What is here, and what to read it for

| Skill | Files | Read it for |
| --- | --- | --- |
| `convex-create-component` | `SKILL.md`, `references/packaged-components.md`, `references/advanced-patterns.md` | Authoring the component: `defineComponent`, component-owned tables, the boundary rules (no `ctx.auth` or `process.env` inside, host IDs as strings, the host's re-export wrappers), package exports and build order, class-based wrappers like `.api({ getUserId })` |
| `convex-expert` | `SKILL.md` | Schema, validators and functions: object form, `args` and `returns` on everything, `v.union` of `v.literal`, indexes over `.filter`, bounded reads, the import table, `null` not `undefined` |
| `convex-test` | `SKILL.md` | The `convex-test` recipe: `convexTest(schema)`, `t.run`, `t.query` and `t.mutation` |
| `convex-verify` | `SKILL.md` | The `edge-runtime` vitest configuration `convex-test` needs, and proving refusals: the wrong user, no user, data scoped to its owner |
| `convex-reviewer` | `SKILL.md` | A review pass over component functions: auth on every function, indexes, validators |
| `convex-docs` | `SKILL.md` | Pinning the installed `convex` version and checking its `.d.ts` before trusting memory or a doc page |

Not covered by any Convex skill, so read the sources instead:

* **The client** (`ConvexClient`, `ConvexReactClient`, `onUpdate`, `watchQuery`):
  [JavaScript clients](https://docs.convex.dev/client/javascript/overview.md),
  [ConvexClient](https://docs.convex.dev/api/classes/browser.ConvexClient.md),
  [ConvexReactClient](https://docs.convex.dev/api/classes/react.ConvexReactClient.md), and the
  installed types, `node_modules/convex/dist/esm-types/browser/simple_client.d.ts` and
  `.../react/client.d.ts`.
* **`ConvexError` and its `data`**: [Application Errors](https://docs.convex.dev/functions/error-handling/application-errors.md)
  and `node_modules/convex/dist/esm-types/values/errors.d.ts`.
* **Transactions and serializability**: [OCC and Atomicity](https://docs.convex.dev/database/advanced/occ.md).
* **Components and testing them**: [Authoring Components](https://docs.convex.dev/components/authoring.md),
  [convex-test](https://docs.convex.dev/testing/convex-test.md), and `node_modules/convex-test/README.md`.
* Convex's own **guidelines** (`https://version.convex.dev/v1/guidelines`, what `ai-files`
  installs) are dense and current, but carry no license, so they are not copied here.

## Local changes

Apache-2.0 asks that changed files say so: each changed file opens with a note pointing here.

* `convex-create-component/SKILL.md`: the shape is settled as packaged, so the "ask the user"
  step, the local and hybrid rows and references, and the local default are gone; `npx convex
  dev` is replaced by codegen and `pnpm justify` (validation step, checklist), with "stop and ask
  the Coach" for a login or a deployment; `convex-helpers` is marked as needing the Coach's yes.
* `convex-create-component/references/advanced-patterns.md`: a handler that used `args` without
  taking it now takes it; a note says the example's read of an app-owned table is illustration only.
* `convex-create-component/references/packaged-components.md`: the scaffolder (`npx
  create-convex@latest --component`) and the build flow's `npx convex dev
  --typecheck-components` are gone, with a note that that step is the Coach's.
* `convex-expert/SKILL.md`: the self-verify rule that pushed to a deployment (and could set
  `CONVEX_AGENT_MODE=anonymous`, rebinding `.env.local`) is replaced by codegen and `pnpm
  justify`; the step steering LLM features to `@convex-dev/agent` and `@convex-dev/workflow` is
  gone; the `v.id` rule, the internal-by-default rule and the `convex/`-directory rule say how
  they read inside a component.
* `convex-verify/SKILL.md`: the steps that emitted findings to a "bus" whose schema is not in the
  repository, and the hand-offs to skills not installed here, are gone; a note says how
  identities reach a component (the host's `getUserId`) and that tests follow `STYLE.md`.
* `convex-reviewer/SKILL.md`: a note maps its `ctx.auth` check onto this package's `getUserId`.

`convex-test/SKILL.md` and `convex-docs/SKILL.md` are unchanged.

## Left out

From `convex-create-component`: `references/local-components.md` and
`references/hybrid-components.md` (this is a packaged component), `agents/openai.yaml` (Codex
metadata), `assets/icon.svg` (an icon).

The other 27 skills at this commit:

* `convex`: a router and product pitch; it has the agent fetch and follow instructions served from a Convex site.
* `convex-add`: adds capabilities to an app from a remote catalog, installing as it goes.
* `convex-advisor`: performance findings from a live deployment's insights.
* `convex-agent`: AI agents and RAG.
* `convex-auth`: auth providers; generates keys and sets deployment env vars.
* `convex-authz`: rewrites an app's authorization around its users table; this package has neither.
* `convex-backup`: deployment backups and restores.
* `convex-billing`: Stripe billing over HTTP actions.
* `convex-cost`: spend analysis of a live deployment.
* `convex-crons`: scheduled jobs.
* `convex-deploy-guard`: deployment targeting.
* `convex-design`: a product pitch and app scaffolding, with the same push-to-deploy rule.
* `convex-domains`: DNS and custom domains.
* `convex-env`: deployment env vars.
* `convex-explain-app`: explains an existing app.
* `convex-improve-convex-plugin`: pipes a remote script into a shell and uploads the session transcript.
* `convex-insights`: logs and health of a live deployment.
* `convex-launch-readiness`: an aggregate of audits left out here.
* `convex-migrate`: app data migrations.
* `convex-migrate-rehearse`: production migration rehearsals.
* `convex-monitor`: watches a live deployment, through a tool that does not exist here.
* `convex-optimize`: an app audit and upgrade workflow.
* `convex-quickstart`: app scaffolding.
* `convex-seed`: seeds a deployment's data.
* `convex-self-heal`: production error triage into PRs.
* `convex-sentinel`: production error capture.
* `convex-suggest`: suggests `@convex-dev` components, through a detector not in the repository.

Also left out: Convex's plugins for Claude Code
([get-convex/convex-backend-skill](https://github.com/get-convex/convex-backend-skill)), Cursor
and Codex. Their skills are the same generated text, and they add session hooks that run code,
telemetry on by default, a remote freshness check, background log monitors and an MCP server.
