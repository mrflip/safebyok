# 2026-10-15: Strict configs -- the IDE/tsc split was dist/, not strictness; three questions

Branch `20261015-strict_configs`, merged as #29; the follow-up is `20261015-testing_entry`, PR [#38](https://github.com/mrflip/safebyok/pull/38).

**What the Coach saw.** VSCode flagged a type-only `VaultBundle` import and untyped arrow
parameters that `tsc` and lint passed. Not a strictness gap: every package read `safebyok` through
its built `dist/`. `pnpm typecheck` built it first; the editor never did. With `dist/` missing,
`safebyok` was `any` (hence the untyped `(ckey) =>`, `(row) =>`); with it stale, the editor
checked an older API (hence `VaultBundle`, which is a value and a type, and imported correctly).

**What changed.** One `tsconfig.base.json` holds all the strictness; tsdown's `devExports` gives
the core and the binding a `@safebyok/source` condition that tsc, the editor and lint now resolve
through; every eslint config is cut from the core's. The PR body has the detail.

**Caught on the way.** `exactOptionalPropertyTypes` pointed at the core's `Lockbox.note`; the
obvious fix (`.exactOptional()`) would have refused every note-less lockbox already in a browser's
IndexedDB, which kept the `note: undefined` earlier versions wrote. Reverted; a test now holds the
schema to reading it, and the writer no longer writes it.

## Questions

1. ~~Keep the eslint configs in step mechanically?~~ Parked in TODO.md, *RAGEBAIT*: a generator
   script if drift ever causes an uncaught bug.
2. ~~Tests still run against `dist/`.~~ Decided: they stay on `dist/`.
3. ~~`pnpm publish` only.~~ Done: each public package's `prepublishOnly` runs
   `scripts/require-pnpm.ts` first, which refuses unless `npm_config_user_agent` starts `pnpm/`.
   Checked: `npm publish` from a directory runs `prepublishOnly`; `npm publish <tarball>`, as the
   release workflow stages, runs no script at all, so CI is untouched.

## Since

* **The lint shush** (a fake salt's `no-hardcoded-passwords`) approved; it now lives once, in the
  core's `bundleOf`.
* **`safebyok/testing`**, a new public entry point: `testDeriver`, `fakeCiphered`, `scopeOf`,
  `bundleOf`, `boxOf` and `describeVaultDB`. The binding and the Convex adapter import it
  instead of a copied deriver, copied fixtures, and relative paths into the core's `tests/`.
  vitest is an optional peer. Changeset: `safebyok` minor. `notes/security.md` records that the
  published package now exports a deliberately weak deriver.
