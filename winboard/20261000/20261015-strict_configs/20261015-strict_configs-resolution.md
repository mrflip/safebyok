# 20261015-strict_configs: resolution

The strict-configs thread: one `tsconfig.base.json`, eslint configs cut from the core's, and sibling packages type-checked from source, merged as [#29](https://github.com/mrflip/safebyok/pull/29); its follow-up, [#38](https://github.com/mrflip/safebyok/pull/38) (a `safebyok/testing` entry and a pnpm-only publish guard), was closed unmerged. Gripes from its whiteboard files, its -human reports and its PRs, as consolidated in `whiteboard/20261016-gripes_boogaloo/` (2026-10-16).

7 gripes: 1 unresolved, 6 resolved.

## Unresolved

- G502 A generator to keep the eslint configs cut from the core's in step — RAGEBAIT, until drift causes an uncaught bug — old_gripes, todo_gripes, humans_gripes *(deferred)*

## Resolved

- G362 Run tests against `dist/` or source? → Coach: tests stay on `dist/`; tsc and the editor read source via `@safebyok/source` (Coach ruling, PR#29)
- G363 Publish test helpers for adapter authors → `safebyok/testing` entry (PR#36, PR#38)
- G395 One strictness config; the IDE/tsc split; eslint configs cut from the core's → `tsconfig.base.json`, `@safebyok/source` (PR#29)
- G396 Report the `eslint-disable`s for fake salts → reported; approved once in `bundleOf` (PR#38)
- G420 `npm stage` would ship `workspace:` ranges; `pnpm pack` skips `prepublishOnly`; a hand-run publish could ship `@safebyok/source` → refused, rewritten, justified before pack, `require-pnpm` (PR#15, PR#22, PR#36)
- G472 Keep `exactOptionalPropertyTypes` from refusing note-less lockboxes already stored → reverted, with a test pinning note-less rows (PR#29)
