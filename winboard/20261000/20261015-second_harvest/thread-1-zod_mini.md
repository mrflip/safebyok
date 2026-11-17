# Thread 1: zod_mini (2026-10-15)

Branch `20261015-zod_mini`, PR [#62](https://github.com/mrflip/safebyok/pull/62), stacked on [#51](https://github.com/mrflip/safebyok/pull/51) (the top of
the merge stack, `origin/20261015-low_hanging_fruit` at `d9dfa94`). Justify: green (root 105 tests;
core 628, convex 259, react 27, demo 61; `pnpm size` passes at the lowered limits).

* **Built**: every validator in the core is `zod/mini` (`types.ts`, `crypto.ts`, `vault-db.ts`,
  `vault.ts`, and from the stack below: `mask.ts`'s options, `EpochMillis` with its messages in
  their order, `lockSoon`'s `graceSeconds`; the React binding and the Convex adapter's `src/`
  use no zod). The core builds
  `unbundle`d (`tsdown.config.ts`): one dist file per source module, so `sideEffects: false`
  lets a host's bundler drop whole modules. `.size-limit.json` limits lowered. The core's lint
  refuses classic `zod` in `src/` (`safebyok/tree-shaking` block). A test that the exported
  schemas compose inside a host's classic Zod (`tests/types.test.ts`). STYLE.md's *Imports* and
  *Validation* name `zod/mini`; a `notes/security.md` entry; a minor changeset; TODO roadmap 7
  marked built.

* **Measured** (`pnpm size`: rolldown, minified, brotlied, zod included; kB). First built on
  main `23e38a2`, then rebased onto the merge stack's top, `d9dfa94`, and remeasured there:

  | entry                | main before | main after | stack before | **stack after** | **limit** (was) |
  | -------------------- | ----------: | ---------: | -----------: | --------------: | --------------: |
  | everything           |       35.83 |      21.26 |        36.73 |       **22.13** |     **24** (38) |
  | openVault            |       29.49 |      14.44 |        30.18 |       **15.11** |   **16.5** (31.5) |
  | stableJsonify        |       25.16 |       2.32 |        25.27 |        **2.32** |    **2.5** (27) |
  | argon2idWebV1Deriver |        5.01 |       5.01 |         5.01 |        **5.01** |   **5.5** (5.5) |
  | idbDeviceDB          |       25.71 |       8.00 |        25.86 |        **8.16** |   **9** (27.5) |
  | browserOpts          |       30.55 |      12.90 |        30.68 |       **13.02** |     **14** (33) |
  | mask                 |           - |          - |        18.35 |        **5.75** |  **6.5** (19.5) |

  On main, the two levers measured apart: classic zod unbundled gave everything 35.78,
  stableJsonify 2.32, idbDeviceDB 23.67; mini still bundled gave 21.32, 8.33, 10.11. Mini
  shrinks every entry that validates by about 14-15 kB; unbundling is what takes zod out of a
  bare `stableJsonify`. Zod's share fell from about 22 kB to about 7.5 kB, a two-thirds cut.
  Limits keep about 7-8% headroom, rounded up to half a kilobyte (`mask` a little more).

* **Decisions taken**:
  - **Unbundled build, not `/* @__PURE__ */` annotations.** Mini's builders are marked
    `@__NO_SIDE_EFFECTS__`, but a `.check(...)` is a method call a bundler must keep, and one
    inside an `object({...})` keeps the whole object. Annotating every schema would be noise in
    every file; unbundling makes `sideEffects: false` drop the unreached modules, with no
    change to the source. Cost: dist/ is a file per module (plus rolldown's CJS runtime helper);
    publint, attw, the CJS `require` and the demo's Vite build are all fine.
  - **A minor changeset.** The exported schemas (`Label`, `VaultScope`, `Lockbox`,
    `LockboxSummary`, `VaultBundle`, `Ciphered`, `Whisper`) are mini schemas now: `.parse` and
    `.safeParse` are unchanged, and they still nest in classic Zod, but classic's chained
    methods (`.optional()`, `.omit()`) are gone. Breaking at 0.x is a minor bump (PROCESS.md,
    *Releases*); the changeset says how to rewrite.
  - **zod joins safebyok-convex's dev dependencies** (`^4.6.7`, already in the lockfile): its
    validator test did `Records.Lockbox.omit(...)`, which is exactly the break above; it now
    uses `Z.omit` from `zod/mini`, as the core's own `ListedLockbox` does. Dev only, nothing a
    host installs.
  - **The peer range stays `^4.0.0`.** `zod/mini` is in 4.0.0's exports with every builder and
    check used here; the core's typecheck and all its tests (628, after the rebase) passed with
    zod pinned to 4.0.0 (tried by hand, twice, reverted).
  - **`EpochMillis` keeps its check order**: `Z.number().check(Z.gte(...), Z.lte(...),
    Z.int(...))`, each with its message, so the messages #57's review relied on are unchanged
    (a mini `Z.int()` serves as a check, as classic's `.int()` does underneath).

* **Deviations**: two additions not asked for -- the lint rule (so classic cannot creep back
  and undo this) and the classic-interop test (the use case the changeset promises).

* **Authoring clarity** (the report the plan asks for): a modest cost, worth the bytes.
  - `Z.string().min(1)` becomes `Z.string().check(Z.minLength(1))`; `.int().positive()` becomes
    `Z.int().check(Z.positive())`. Longer, but the aligned field tables still read as tables.
  - Wrappers turn inside out: `X.nullable().optional()` is `Z.optional(Z.nullable(X))`, read
    from the outside in; `.default(v)` is `Z._default(X, v)`, the underscore a wart.
  - `LockboxSummary` (`Z.extend(Z.omit(Lockbox, ...), {...})`) is a little harder to scan.
  - The one real loss: `forcePassphraseReentryHours`, a default-transform-pipe chain, nested
    past the linter's limit; it now reads as three named steps and a pipe, arguably clearer.
  - Messages per check are the same strings in the same places.

* **Discoveries**:
  - `idbDeviceDB` still carries all of `types.js` (every schema, about 0.5 kB brotlied), since
    within a module the `.check()` calls keep each schema. PURE annotations would shave it; not
    worth the noise today.
  - Zod's own core (`v4/core/schemas.js`, about 13 kB minified) is the floor for any entry that
    validates at all; nothing in our code lowers it further.
  - Mini loads no locale, so a zod issue's default message is "Invalid input". No zod message
    reaches a caller (every refusal is our own VaultError), so nothing changes for users.
  - A host-supplied label policy (TODO, *Pluggable label validator*) should be typed
    `Z.core.$ZodType`, so a host's classic schema and a mini one both fit.
  - **The rebase** onto the stack met [#37](https://github.com/mrflip/safebyok/pull/37) in
    `.size-limit.json` (its `mask` entry kept, limit lowered) and the stack's `vault.ts`
    (`FarFuture`, `lockSoon`, and `forcePassphraseReentryHours` now taking `Infinity`, all
    converted), `types.test.ts` and `notes/security.md` (both sides kept).

* **For the Coach**: the minor bump stands under the standing rule (no backward compatibility
  until 1.0.0), and the `$ZodError` change needs no shim. A later thread (6) drops `.int()` from
  `EpochMillis` and validates the host clock, building on this, in mini.
