# Thread 19: tsdown_move (2026-10-17)

Branch `20261017-tsdown_move`, PR [#157](https://github.com/mrflip/safebyok/pull/157), on main (479f8ded). Justify: green (lint clean, typecheck, build with publint and attw, size; tests: root 212, safebyok 2089 + 35 skipped, -convex 258 + 8, -react 217, -fastkey 49, -graphql 239 + 14, -indexeddb 135 + 10, -postgres 246 + 14, demo 189 + 16, e2e 81 + 89).

* **Built**: every package's `tsdown` devDependency floor is `^0.23.1` (safebyok, -react, -convex,
  -fastkey, -postgres, -graphql, -indexeddb). rolldown-plugin-dts is declared nowhere; it moved
  0.28.6 -> 0.28.7 through the lockfile, as tsdown 0.23.1 asks (`^0.28.7`). With it, also
  through the lockfile: `yuku-ast`, `yuku-parser`, `yuku-codegen` and `@yuku-toolchain/types`
  0.10.2 -> 0.18.1, the new `yuku-core` 0.18.1 (and its `@yuku-core/binding-*`) in place of the
  per-package `@yuku-codegen/binding-*` and `@yuku-parser/binding-*`, and `verkit` 0.4.1 -> 0.5.0.
  Every version checked with `npm view <pkg> time`: tsdown 0.23.1 (2026-10-10T16:00Z),
  rolldown-plugin-dts 0.28.7 (15:25Z), yuku 0.18.1 (2026-10-09), verkit 0.5.0 (2026-09-18) have
  all aged; strict `pnpm install` resolved them without complaint at 19:46Z.
* **Install warnings, before and after**: the base lockfile carried 24 `deprecated:` entries,
  all `@yuku-codegen/binding-*` ("pure JavaScript since 0.14") and `@yuku-parser/binding-*`
  ("runs on yuku-core since 0.14"), every one pulled in by rolldown-plugin-dts 0.28.6's
  `yuku-* ^0.10`. After: **none** (`grep -c deprecated: pnpm-lock.yaml` is 0). The one warning
  `pnpm install` still prints, "Issues with peer dependencies found", is older than this thread
  and untouched by it: `eslint-plugin-react@7.37.5` and `eslint-plugin-jsx-a11y@6.10.2` want
  `eslint` up to 9, and we run 10.12.0 (the main checkout reports the same).
* **`dist/` before and after** (`pnpm build` on the base, snapshot, the move, `pnpm build`,
  `diff -r`; a second base build first proved the build deterministic):

  | package | files | result |
  | --- | --- | --- |
  | safebyok | 196 | 2 differ: `key-deriver.d.ts`, `key-deriver.d.cts` |
  | safebyok-convex | 40 | 2 differ: `component-api.d.ts`, `component/_generated/server.d.ts` |
  | safebyok-react, -fastkey, -postgres, -graphql, -indexeddb | 6-16 | byte-identical |

  Every JavaScript file and every source map is byte-identical. The four declaration files each
  gain one line, `export {};`, before the `sourceMappingURL` comment. That is rolldown-plugin-dts
  0.28.7's one fix ("Prevent implicit exports of private declarations", sxzz/rolldown-plugin-dts
  004032f). In a declaration file with no export list, TypeScript treats every top-level
  declaration as exported; `export {};` stops that. The four are exactly the files that mix
  `export`-modified declarations with a private one: `KeyDeriverBase` (key-deriver), `ForComponent`
  (component-api), `Env` (the Convex component's generated server). Checked with tsc against both
  snapshots: before, `import type { ForComponent } from './component-api.js'` and the same for
  `KeyDeriverBase` compile; after, TS2459/TS2724. **This changes types a host can load**:
  `ForComponent` was importable through the public `safebyok-convex/_generated/component.js`
  entry; the other two only by a deep path that the `exports` map closes. No exported name or
  type changed. Hence a `patch` changeset for safebyok and safebyok-convex (the release group is
  fixed, so the numbers move together anyway).
* **Size**: all 15 lines unchanged to the byte (`npx size-limit --json` before and after; the JavaScript is identical), inside every budget.
* **Decisions taken**: no other devDependency floor moved: `pnpm outdated -r` lists only majors
  (typescript 7.0.2, @types/node 26.6.5) and the demo's runtime `@anthropic-ai/sdk`, and
  `@types/node` is already at the newest 24.x (24.19.2). rolldown-plugin-dts 0.28.8 (2026-10-11)
  has not aged; tsdown's `^0.28.7` lets it in when it does.
* **Closed / not closed**:
  * G403: **closed**. tsdown `^0.23.1` everywhere, rolldown-plugin-dts 0.28.7 in the lockfile,
    and no deprecated subdependency left.
  * G415: **closed**. Not byte-identical, but every difference is read and explained above: one
    upstream fix, in types only, that unexports three private helper types.
* **For the Coach**: the patch changeset names `ForComponent` going private on
  `safebyok-convex/_generated/component.js`; if you would rather it ship empty (nothing of ours
  meant it public), that is a one-line change. The majors (typescript 7, @types/node 26,
  convex 3) stay open rows.
