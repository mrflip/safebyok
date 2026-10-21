# Thread b_simplify: the mechanical half of the Coach's phase-B rulings (2026-10-21)

Branch `20261021-b_simplify`, PR [#214](https://github.com/mrflip/safebyok/pull/214), stacked on [#212](https://github.com/mrflip/safebyok/pull/212),
in the line main → #213 → #212 → this. Justify: green. Core 2643 passed, 35 skipped; react 280;
convex 279 (8 skipped); postgres 276 (14 skipped); graphql 271 (14 skipped); indexeddb 148 (10
skipped); fastkey 49; demo 207 (16 skipped); e2e 93 (100 skipped); root 265.

Items 3, 5, 6, 7, 8, 9, 10, 16 and 17 of the plan's `b_rulings`.

* **Built**:
  * **3, the lease sets its own deadline** (`src/lease.ts`): `Lease.grant(vault, holder,
    vaultKeyPair)` ends the lease `vault.leaseMillis` from `vault.clock.now()`, floored, capped at
    `FarFuture` (`deadlineAfter` moved here from `vault.ts`). `LeaseVault` gains `leaseMillis`. The
    vault's `#deadlineFromNow` is gone; `#grantLease` loses its `until` and arms the expiry from
    `lease.ask_passphrase_at`. The deadline-renewal doc moved to `#grantLease`.
  * **5, one argument order**: `Box.seal(vault, holder, boxlabel, whisper, vaultKey, opts)` and
    `Wayin.seal(vault, holder, proof, stamp, vaultKey)`. `Lease.grant` already had it. Reordered by a
    small argument-aware script. No spy assertion indexes these calls (grepped `mock.calls`).
  * **6, ordinary way-in constructors** (`src/wayin.ts`): `madeFrom` is gone. `PassphraseWayin`
    and `PasskeyWayin` have public constructors taking a checked record. The test that a
    constructor is private became one that a constructor makes what `Wayin.make` does.
  * **7, adorn is writable and configurable** (`src/adorn.ts`). Every model freezes itself after
    decorating, so on a model the props are still fixed; a test says so.
  * **8, `checksVoidReturn: false`** for `@typescript-eslint/no-misused-promises` in every
    `eslint.config.mjs` (core, the six packages cut from it, root, e2e, demo). Two
    `eslint-disable` lines in the core's tests went with it. The non-bag refusal and its docs
    suggest `() => vault.tryHello()`.
  * **9, the double-load check is gone**: `src/one-copy.ts`, its test file, the `ModelMark` statics
    on `Proof` and `Box`, every call site, and `checkedBoxRecord`'s `said` argument.
    `UnreadVaultProps` is a plain `Symbol`. A foreign Box or proof is refused as anything foreign
    is: `bad_record` from `Box.make` and `vault.openBox`, `bad_option` from `Box.seal`'s `over` and
    `Proof.parse`. Three short tests pin those (box, proof, vault-boxes). README's `bad_option` row
    loses its clause.
  * **10**: TODO.md has a `## Potential Optimizations` shelf (named in its intro), with the
    Coach's argument verbatim on the create race (#206).
  * **16**: `notes/security.md`, through a sonnet subagent. Its header now says entries are
    amended in place, marked `amended YYYY-MM-DD (thread)`. Amended in place: the B5
    double-load entry and its headline, the proof/way-in entry's private constructors, two
    adorn mentions, and three lease-deadline mentions (`#deadlineFromNow`).
  * **17**: `bad`'s `@example` reads `Refusals.staleWrite('vaultProps')`.
  * Changeset `.changeset/20261021-b_simplify.md`, minor.
* **Decisions taken**:
  * `Ask[raiseAsk]` is left as it is. It is a symbol-keyed static like `madeFrom`, but it keeps
    a vault-only verb off the host's surface rather than working around a private constructor, and
    its row is still with the Coach.
  * `planSeal`/`sealPlanned` keep `(vault, holder, vaultKey, plan)`. C2 merges them back into
    `Box.seal`.
  * The earlier changesets (`placement`, `lease`, `box`) are left as written. This changeset
    states the deltas, following the precedent of `put_wayin` over `proof_wayin`.
* **Discoveries**:
  * **The lease now reads the handle's public `leaseMillis`.** A host that `defineProperty`s over
    the handle's `leaseMillis` now changes its own lease length. Before, `#leaseMillis` was read
    privately. The `vault-make` test "keeps its own lease length and hello" now checks hello
    alone. The same exposure already existed for `clock` and the scope, which every model reads
    off the handle. Freezing the handle at the end of its constructor would close all of it (an
    Open matter).
  * After item 9, a foreign `PasskeyProof` whose fields read as an answer passes `Proof.parse`.
    That is harmless: it is the host's own answer.
* **For the Coach**:
  * **Lint rule (item 8)**: `no-misused-promises` now runs with `checksVoidReturn: false` in
    every config. This is reported as CLAUDE.md asks.
  * **Freeze the vault handle?** See the discovery above. The recommendation is yes, in a later
    thread.
