# Thread 2: explicit_options (2026-10-15)

Branch `20261015-explicit_options`, PR [#40](https://github.com/mrflip/safebyok/pull/40), stacked
on [#34](https://github.com/mrflip/safebyok/pull/34) at dd8c7ca. Reviewed: one fix, f0cb46e (the
security note and changeset say noble drops out only under a tree-shaking bundler). Justify: green (safebyok 283, safebyok-convex
217, safebyok-react 8, demo 24, root 72).

* **Built**:
  - `OpenVaultOpts.keyDeriver` is required. `openVault` no longer imports
    `argon2idWebV1Deriver`; `parseKeyDeriver` (beside thread 1's option parsers in `vault.ts`)
    refuses a missing one as `bad_option`, pointing at `safebyok/browser`, and a malformed one
    (no label, `salt_bytes` not a positive integer, no `deriveKeyBytes` function) likewise. It
    checks the shape with Zod but keeps the deriver it was handed, so a class instance with a
    prototype method and private fields works.
  - `safebyok/browser` (`src/browser.ts`): `browserOpts({ dbName }?)` returns a frozen
    `BrowserOpts` bag, `{ keyDeriver: argon2idWebV1Deriver, deviceDB: idbDeviceDB({ dbName }) }`.
    It has its own line in `tsdown.config.ts`, `exports` (with its `@safebyok/source` condition,
    which tsdown writes) and a hand-added `typesVersions` entry (thread 5's discovery: attw's
    node10 check needs it).
  - Renames: snapshot `expiresAt` is now `askPassphraseAt`; `rememberForMs` is now
    `forcePassphraseReentryHours`; exported `SevenDaysMs` is replaced by
    `ForcePassphraseReentryHours = 168`, the default (named the way `MaxWhisperBytes` and
    `MaxLockboxes` are). The stored device field `expires_at` is unchanged (roadmap 3 renames it).
  - `VaultProvider`: `keyDeriver` is required through `Omit<OpenVaultOpts, 'userId'>`, the renamed
    prop flows through its destructure, `openOpts` and deps, and its doc example spreads
    `browserOpts()`. The demo spreads `browserOpts({ dbName: Applabel })` into the provider and
    drops its own `deviceDB`.
  - Docs: core README gains *Quickstart* (imports from `safebyok/browser`) and *Entry points, and
    why the main one asks for everything*. The React README gains *Use*; the Convex README
    snippet and the `idb.ts` and `convex-vault-db.ts` examples spread `browserOpts()`.
    `notes/security.md` gains a dated bullet (no default deriver) and the unlock-window bullet
    names the new option.
  - Tests: `vault.test.ts` checks that `keyDeriver` is required (an `expectTypeOf`), the missing
    and malformed refusals, the prototype deriver, and the reentry window (custom, fractional,
    refused). `browser.test.ts` covers the bag. `index.test.ts` gets *the main entry's
    tree-shaking*: it bundles `export { openVault } from src/index.ts` through tsdown's own
    `Rolldown.build` (minified, in memory) and finds no `argon2`. A control test bundling
    `argon2idWebV1Deriver` does find it. With the old `??` fallback put back, the first test fails.
  - Changeset `.changeset/20261015-explicit_options.md` (minor, both public packages).

* **Decisions taken**:
  - **Fractional hours are accepted.** Any number above zero. Inside, it is
    `Math.round(hours * 3_600_000)`, piped through `int().min(1)`, so a value that rounds to 0 ms
    (`1e-12`) is refused. Short windows (0.25 h) suit tests and kiosk-style hosts. There is no
    upper cap: nothing in the rulings sets one.
  - **`browserOpts` gives back the same frozen bag for the same `dbName`.** Without that,
    `<VaultProvider {...browserOpts()} />` written inline makes a new `deviceDB` on every render.
    The provider's effect depends on it, so the vault would reopen again and again. One `Map` by
    `dbName`, like `idb.ts`'s own `shelfStores`.
  - **`ForcePassphraseReentryHours` replaces `SevenDaysMs`**, which was public, rather than living
    beside it. One constant for one default; removing it is free before `0.1.0`.
  - **The bundle test lives in `tests/index.test.ts`**: it tests the main entry. It uses
    `Rolldown` re-exported from `tsdown` (a direct dev dependency), so there is no phantom
    dependency and no new one. It bundles from `src/`, because justify runs tests before the
    build. It minifies so that doc comments (`types.ts` mentions `argon2id_web_v1`) do not count.
    Thread 8 may retire it in favour of its budget.
  - **The `bad_option` message names `safebyok/browser`, not `argon2idWebV1Deriver`**, so the
    message itself puts no `argon2` text into a bare `openVault` bundle.

* **Deviations**: none from the thread's text. The React README section and the Convex and `idb`
  examples go beyond the touch list, because they would have shown an `openVault` that no longer
  compiles.

* **Discoveries**:
  - zod is most of a bare `openVault` bundle: about 120 kB minified with noble out, 135 kB with
    it in (rolldown, minified). For thread 8, the line to watch is zod, not noble.
  - The React passphrase dialog says "Stays unlocked on this device for seven days" whatever
    `forcePassphraseReentryHours` is. The expiry thread (roadmap 5) should derive that text or
    take it as a prop.
  - [#33](https://github.com/mrflip/safebyok/pull/33)'s new *Locking* section in the core README
    says `rememberForMs`. Whichever of #33 and this lands second should rename it to
    `forcePassphraseReentryHours`.
  - Under `exactOptionalPropertyTypes`, a test that leaves out a required option needs a cast
    (`withoutDeriver as OpenVaultOpts`). No `ts-expect-error` was used.

* **For the Coach**:
  - Confirm the entry name `safebyok/browser` (your word was `safebyok/basic`). It names the
    assumptions: IndexedDB, and noble's pure-JS Argon2id.
  - Confirm that fractional hours are accepted. Decide on an upper bound for
    `forcePassphraseReentryHours` (review): with none, an absurd value pushes `askPassphraseAt`
    and the stored `expires_at` past `Number.MAX_SAFE_INTEGER` and `Date`'s range. A year, say?
  - `browserOpts` keeps one bag per `dbName` for the life of the page: a little module state, the
    same as `idb.ts` already keeps.
