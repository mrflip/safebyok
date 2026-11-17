# Thread 7: pluggable_logger (2026-10-15)

Branch `20261015-pluggable_logger`, PR [#65](https://github.com/mrflip/safebyok/pull/65), stacked on [#64](https://github.com/mrflip/safebyok/pull/64)
(thread 6, the top of the merge stack, `c186978`). Justify green: core 705, convex 265, react 28,
demo 61, root 105. `pnpm size` within every limit, none raised (everything 22.45 -> 22.85 kB,
openVault 15.43 -> 15.90 kB of 16.5; stableJsonify unchanged at 2.32 kB).

* **Built**:
  - `packages/safebyok/src/logger.ts`: the exported `VaultLogger` type (`log`, `warn`, `error`,
    each `(message?: string, story?: Record<string, unknown>, err?: Error | null) => void`) and
    `parseLogger`: `undefined` is the console fallback; anything not an object carrying three
    functions is `bad_option`; what it hands back is the host's logger wrapped so each call is
    made as a method (a class's `this` kept), a throw is dropped, and a returned promise's
    rejection is dropped too (never left unhandled).
  - `packages/safebyok/src/console-logger.ts`: the fallback, the one module in `src/` that touches
    the console, under a file-wide `/* eslint-disable no-console */`. It tags each message
    `safebyok:` and passes the story and error only when present.
  - `openVault`'s `logger` option (parsed after the labels and window, before the clock).
    `VaultLogger` exported from the main entry. `safebyok-react`'s `VaultProvider` passes it
    through (its `satisfies` forced it) and lists it in the open effect's dependencies.
  - Four call sites in `vault.ts`, each story `{ call }` alone:
    - `warn`, `{ call: 'lockSoon' }`, the clock's `bad_option` VaultError as `err`: lockSoon()
      locked at once on a bad clock (thread 6's `console.warn` and its suppression are gone).
    - `warn`, `{ call: 'openVault' }`, no `err`: a remembered unlock that fails its schema or will
      not unwrap, erased. Expired, outdated-by-epoch and lowered-setting records stay silent.
    - `warn`, `{ call: 'refresh' }`, the refresh's error: `quietRefresh` (a watch-rung refresh, or
      the catch-up after a stale write) failed.
    - `error`, `{ call: 'openVault' }`, the adapter's error: a failed open's `close()` threw
      (the adapter's unsubscribe).
  - `safebyok/testing` (`tests/test-helpers.ts`): `spyLogger()` (`{ logger, calls }`) and
    `loggedText(calls)` (messages, stories as JSON, errors with stack, own properties and every
    cause). The core's vault suite's `makeWorld` now opens with a spy logger, so the suite is
    quiet and `world.logged` is there to assert on.
  - Tests: `tests/logger.test.ts`, `tests/console-logger.test.ts`, a "the logger" suite in
    `tests/vault.test.ts` (each call site, the silent routine cases, a vault going about its
    business logging nothing, a throwing logger breaking nothing, and **the sweep**: every call
    site fired with a fake passphrase, whisper and note, every stored ciphertext and salt
    collected, none found in `loggedText`; checked by planting the device record in a story,
    which it caught), helper tests, and a React test that the provider's logger hears lockSoon.
  - Docs: core README *Logging* section (and the `safebyok/testing` line), React README (define a
    `logger` or `clock` once, outside the component: a new identity reopens the vault),
    `notes/security.md` (two entries replace thread 6's console note), changeset (minor, core and
    react), and thread 6's changeset now says the bad-clock warning goes "through the vault's
    `logger` (the console by default)".
  - **After review** (reviewed `fixed`, five reviewer commits kept): the guard settles any
    thenable a logger returns, not only a same-realm `Promise`; the unreadable-unlock warning
    follows the erase; the docs say `logger: console` prints a missing story or error as
    `undefined`/`null`, and that the vault adds no secret to what it logs while a host's own
    clock or adapter error is the host's to keep clean. Then, at the orchestrator's word:
    `loggedText` never throws (a cause cycle ends at `[cause seen above]`, what JSON cannot
    write becomes `[not JSON]`), and the sweep breaks the host clock under `lockSoon`, so one
    logged error carries a `cause` and the sweep proves it walked down to it.
* **Decisions taken**:
  - `story` is typed `Record<string, unknown>`, not `any`: a host logger typed with `any` (the
    Coach's signature) and `Console` both fit, a type test proves it.
  - The logger is `openVault`'s option alone, passed through by the React provider. The Convex
    adapter takes none: its one swallowed failure (`ignoreTrouble` on a failing `onUpdate` watch)
    would need a logger handed to `convexVaultDB` separately, or a trouble callback on
    `VaultDB.subscribe`, which changes the interface adapters implement. Left as a follow-up.
  - No scope, label or `userId` in any story ("no option value"): a host with several vaults
    gives each its own logger with its own context. Messages are fixed text.
  - `log` has no call site yet; the routine cases (an unlock that ran out, a lowered setting)
    stay silent, to keep the call sites few.
  - The console fallback is wrapped like a host's logger, so it can never throw into a lock.
  - Not exported: the console fallback itself (a host passes `console` to get the same, untagged).
* **Deviations**: none from the plan. Pulled in: the versioned-updates suite's `afterEach`
  restored the real timers before its `setTimeout` spy, which put the fake timer back for every
  suite after it; reordered (mocks first), since the new suite after it waits on a real tick.
* **Suppressions**: one file-wide `/* eslint-disable no-console */`, `src/console-logger.ts`,
  replacing thread 6's line in `vault.ts`. None other.
* **Discoveries**:
  - CLAUDE.md still says "`src/` writes nothing to the console (the linter enforces it)", and the
    core's `eslint.config.mjs` comment says the same; both are now true but for the fallback
    module. Left for the Coach (agents do not edit CLAUDE.md on their own word).
  - A watch-rung refresh against storage that stays broken warns once per change event, with no
    rate limit.
  - Left open by the review: a failed catch-up after a stale write is logged as "a background
    refresh" beside the thrown `stale_write`; an inline JSX `logger` reopens the vault each render
    (the provider's recorded design, warned of in the README); `log` is required though nothing
    calls it yet (the agreed signature).
* **For the Coach**:
  - Confirm the file-wide `no-console` disable in `src/console-logger.ts`, as relayed: "yes with
    no logger console is the fallback".
  - CLAUDE.md's side-door bullet could read "`src/` writes nothing to the console but through the
    fallback logger (`src/console-logger.ts`)": a one-line edit for the Coach to approve.
  - Follow-up: give `VaultDB.subscribe` (or `convexVaultDB`) a way to report a failing watch to
    the vault's logger.
