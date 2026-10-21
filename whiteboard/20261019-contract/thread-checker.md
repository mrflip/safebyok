# Thread checker: the strength checker held to its contract in one place (2026-10-21)

Branch `20261021-checker`, PR #PR, stacked on [#215](https://github.com/mrflip/safebyok/pull/215),
in the line main → #213 → #212 → #214 → #215 → this. Justify: green. Core 2668 passed, 35
skipped; react 284; convex 279 (8 skipped); postgres 276 (14 skipped); graphql 271 (14 skipped);
indexeddb 148 (10 skipped); fastkey 49; demo 207 (16 skipped); e2e 93 (100 skipped); root 265.

* **Built**:
  - *The guard* (`guardStrengthChecker`, `src/passphrase-strength.ts`): the only caller of a
    host's checker. Vault.make wraps the checker once and keeps the guarded one as
    `vault.strengthChecker` (exported type `GuardedStrengthChecker`). `PassphraseProof.checkStrongEnough()`
    and safebyok-react's `adviceFrom` both ask it. `checkStrongEnough` (the free function) and
    `parseStrengthChecker` are gone.
  - *The schema*: `makeVaultOptsShape` reads `strengthChecker` as `Z._default(Z.optional(strengthChecker), () => DefaultStrengthChecker)`;
    `checkKnownOpts` became `checkMakeVaultOpts`, returning the parsed bag. Unknown keys keep
    their message; any other issue reads `Vault.make's strengthChecker: expected a function ...`.
  - *The load*: `StrengthChecker` may carry `load`; `#greet` runs `this.#strengthChecker.load()`
    first, before any read. `zxcvbnStrengthChecker` is `Object.assign(check, { load })`; its
    `Unloaded` "weak, try again" verdict is gone.
  - *Options in Zod's English* (`src/options.ts`): `InEnglish` (zod/mini's `en` locale, per
    parse) and `issuesText` (each issue, path first, via `Z.core.toDotPath`). `optionsCheck`
    refuses with `<what Zod found>. <said>[ <notBagHint>]`; hello/ensureLease each go through one
    `optionsCheck` with the event hint (`checkBagOrNone` is gone).
  - *Lint*: `no-misused-promises` at its default in all ten configs (the revert of fc47bb1c).
  - *TODO.md*: "Add "sensitive" and "host" flags to refusals" under *Soonish*.
* **The checker's contract, as built** (for the Contract's rewrite):
  - A `StrengthChecker` is `(passphrase, scope) => verdict | Promise<verdict>`, verdict
    `{ strong: true } | { strong: false, reason }`, plus an optional idempotent `load()`.
  - `Vault.make`: `bad_option` for a non-function, or a `load` that is not a function. Left out:
    `DefaultStrengthChecker` (weak for all, no load, logs nothing).
  - `vault.strengthChecker(passphrase, scope)` (the guard) resolves a verdict: weak with "can't be
    empty" for a blank passphrase, unheard; `StrongVerdict` or the host's weak verdict. It
    rejects `bad_option` for a verdict that breaks the contract, `unexpected_error` carrying
    nothing (no kind, meta, cause) for a throw, or a verdict getter that throws.
  - `vault.strengthChecker.load()` runs the host's load; a throw is `unexpected_error`, the throw
    its `cause` (it heard no passphrase).
  - `hello()` runs the load before reading storage, at every hello that reads (not one within
    `staleMinutes`). A failed load refuses the hello, nothing is read, the state stays `opening`,
    and the next hello loads again. A call that waits on a first hello refuses the same.
  - A new passphrase the guard finds weak is `weak_passphrase`, the reason its message
    (create, `putWayin`).
* **Decisions taken**:
  - The guard wraps at make and replaces what `vault.strengthChecker` returns, rather than a free
    function each caller passes the raw checker to: nothing in our code holds the raw checker
    after make, so "the only caller" is structural, and React needs no export.
  - A failed load is `unexpected_error` (misuse, loud: React's provider throws it to the error
    boundary). Its throw rides as `cause`.
  - Load first, then storage, sequentially (simple control flow); a parallel load is a UX
    nicety for later.
  - The blank-passphrase rule moved into the guard, so the dialog's advice says it too.
  - `optionsCheck`'s detailed message applies to every bag (putBox, Box.seal, validators,
    VaultDB call opts), not only hello/ensureLease: one mechanism, uniform messages. It now names
    an unknown option's field (the host's code); it still never quotes a value.
* **Deviations**:
  - The handoff expected checksVoidReturn off in react and the demo; nothing there trips it.
    Four core tests do, each now with `eslint-disable-next-line`: the two vault-db listeners
    (async on purpose) and two that follow the doc's own `() => vault.tryHello()` /
    `() => vault.tryEnsureLease()` wraps (`vault-twins.test.ts`, `vault-lease.test.ts`).
  - PassphraseModal's `adviceFailed` passes a VaultError through as it came (anything else is
    still sanitized), so a broken checker is reported as the vault's own refusal, not as
    "passphraseAdvice threw".
  - STYLE.md *Validation* gains a bullet on `InEnglish`/`issuesText`.
  - Size budgets: Vault 37 → 38 kB, everything 44 → 45 kB (rule-set); the `en` locale is ~1.2 kB.
* **Discoveries**:
  - zod/mini says only "Invalid input" without a locale; `Z.config` would change the host's Zod.
  - `Z.function()` wraps a function (identity and `load` lost), so the schema uses `Z.custom`;
    `Z._default` calls a function default, hence `() => DefaultStrengthChecker`.
  - A zod strictObject admits a class instance with no own keys; an Event has own keys (jsdom
    lists many), so it is still refused, with a long key list.
  - A wrapper of `zxcvbnStrengthChecker` that drops `load` still works, loading at the first
    check; CUSTOMIZATION.md shows carrying `load` along.
* **For the Coach**:
  - **Load failure's kind**: `unexpected_error`, loud. A new condition kind
    (`checker_unavailable`, retry offered by the provider) is the alternative.
  - **The doc's wrap trips the default rule**: `() => vault.tryHello()` returns a promise where
    a void listener is typed; hosts on typescript-eslint's default will see it. Recommend leaving
    it (their lint, their call), or the message could suggest `() => { void vault.tryHello() }`.
  - **Modal passes VaultErrors through**: a host that constructs a VaultError quoting the
    passphrase in its own `passphraseAdvice` would have it reported. Recommend accepting.
  - **Vault.make's other function options** (`getProof`, `onBadNews`, `clock`) still use
    hand-written parsers; they could move into the schema the same way. Recommend a later pass.
