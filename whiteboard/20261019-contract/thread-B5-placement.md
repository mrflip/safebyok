# Thread B5: placement (2026-10-20)

Branch `20261020-placement`, PR #PRNUM, stacked on #208 (`put_wayin`). Justify: green. Per package: core 2554 passed, 35 skipped; react 280; convex 274 (8 skipped); postgres 268 (14 skipped); graphql 262 (14 skipped); indexeddb 144 (10 skipped); fastkey 49; demo 203 (16 skipped); e2e 89 (96 skipped); root 265.
Size budgets unmoved (`pnpm size:budget`: every line at the rule).

The table, re-done from the code, with the arguments row by row, is
[`thread-B5-placement-table.md`](thread-B5-placement-table.md): the Coach's coin flips read it,
and pass 3 repeats it over phase C's calls.

* **Built**:
  * **`adorn` and `decorate`** moved from `safebyok/utils` to an internal `src/adorn.ts`, and
    `adorn` is the Coach's triquet again, `adorn(obj, ckey, val)` handing back `val`, with
    `decorate` calling it per entry. Tests in `tests/adorn.test.ts`, the getter example among
    them.
  * **`PassphraseWayin` and `PasskeyWayin` constructors are private**; `Wayin.make` and
    `Wayin.seal` reach them through a static keyed by a module-private symbol, `madeFrom`. The
    classes stay exported (`instanceof`, types). A type-level test fails should either become
    newable from outside.
  * **`Ask.raise` is off the surface**: `Ask[raiseAsk]`, the symbol exported by `ask.ts` and by
    no entry point. React's dialog test that spied on `Ask.raise` now wraps the ask through a
    spy on `Vault.make`.
  * **`hello()` and `ensureLease()` refuse an event**, and anything else that is not a plain bag,
    `bad_option`, the message naming the wrap: `() => { void vault.tryHello() }`. A4's
    leniency (`AnEvent`, `asHelloOpts`) is gone; TypeScript now flags `addEventListener('focus',
    vault.hello)` too.
  * **A `Box` or a proof from a second copy of safebyok** is refused `bad_option`, naming the
    double load (`src/one-copy.ts`: `ModelMark`, `Symbol.for('safebyok.model')`, a static on
    `Box` and `Proof`; `checkOneCopy`), at `vault.openBox`, `Box.make`, `Box.seal`'s `over`,
    `Proof.parse` (so `unlock` and `attempt`), `wayin.tryOpen` and `Wayin.seal`. Tested with a
    real second copy (`vi.resetModules()`, then a dynamic import).
  * **`#makesStandDown`** is `#createsStandDown` (and `#standDownCreates`).
  * **The one move**: `Wayin.seal` builds a way in's ctx once, in its kind's keying, so a
    passkey's HKDF `info` and its wrap's ctx are one value (B4's review). Same bytes.
  * README's error table, TODO.md, `notes/security.md` (by a `sonnet` subagent), the changeset.

* **Decisions taken**: see *Open matters* (YOLO items).

* **Deviations**: the thread file links its table rather than holding it, to stay near 1,000
  words.

* **Discoveries** (the checks the preplan asked for):
  * **`ensureLease` is sequencing only**: eleven statements, no crypto, no storage of its own.
    What `attempt` sets off (`#unlockWith`, `#settleUnlock`, `#grantLease`) is about 150 lines
    of create, mark and race guards; the vault's one crypto call left is `makeVaultKey()` in
    `#draftVaultProps`.
  * **Every model reaches the key deriver and the clock through `vault`**: Proof and Wayin the
    key deriver; Lease and Box the clock. No model logs, and none holds a store, clock or logger
    of its own. Two times a model stamps come in from the vault instead (a way in's
    `registered_at` in its stamp, a lease's `ask_passphrase_at`): rows 3b and 5a.
  * **Secrets in fields**: beside `PassphraseProof.passphrase` and `PasskeyProof.prfBytes`, one:
    `Lease.lease_key` (and `props.lease_key`). It is non-extractable, but `unwrapKey` lets its
    caller choose the unwrapped key's extractability, so whoever holds a `Lease` can recover the
    vaultKey's bytes. That is the lease's documented tradeoff (anyone using the profile while it
    stands), and no public field of the vault reaches one (`#lease` is private); a host gets one
    only from its own device store. Not a secret but worth naming: a `Wayin`'s salt and wrap are
    what an offline guess needs, and the snapshot shows summaries only.
  * The vault reads a secret field in two places, both for the strength checker (row 4).
  * `putBox` does not call `Box.seal`; it calls its halves (row 7).

## Open matters

* **Placement: `Wayin.seal`, per-kind keying** (row 3): keep the `instanceof` dispatch to two
  keying helpers in wayin.ts, or a method on each proof kind. Recommend: keep.
* **Placement: `Wayin.seal`'s session handle** (row 3a): one extra unwrap per seal, kept by the
  creating unlock alone. Recommend: keep.
* **Placement: a way in's stamp** (row 3b): the vault builds it, or `Wayin.seal` reads
  `vault.clock` as `Box.seal` does. Recommend: keep with the vault.
* **Placement: `checkFreshSalt`** (row 3c): wayin.ts, or beside `PasskeyProof`. Recommend: move
  to proof.ts when the proof is next touched.
* **Placement: a new passphrase's strength** (row 4): the vault reads `proof.passphrase`, or
  `proof.checkStrongEnough(checker, scope)`, the vault keeping the log. Recommend: move to Proof.
* **Placement: a lease's deadline** (row 5a): the vault computes it, or `Lease.grant` from
  `vault.clock` and `leaseMillis`. Recommend: keep with the vault.
* **Placement: sealing a box** (row 7): `putBox` composes `planSeal` and `sealPlanned`, or calls
  `Box.seal` and weighs after. Recommend: C2 settles it.
* **Placement: the refresh when a box will not open** (row 9): out of the core. Recommend: C4.
* **Placement: the makers' argument order** (row 13). Recommend: `(vault, holder, ...what, key,
  opts)`, at C1/C2.
* **Another copy's other models**: `Wayin`, `Lease`, and a `VaultDB` (whose `instanceof` check
  in `Vault.make` also meets a second copy) are not checked. Recommend: the same mark and refusal,
  in the thread that settles another copy's refusals.
* **YOLO: private constructors by TypeScript**, reached through `[madeFrom]`; JavaScript can still
  `new` one, as for `Box`, `Lease` and `Proof`. Recommend: keep.
* **YOLO: `Ask[raiseAsk]`**, a symbol-keyed static, rather than a module function. Recommend: keep.
* **YOLO: `adorn` stays fixed** (non-configurable), as B3 made it, not B1's configurable.
  Recommend: keep.
* **YOLO: the wrap reads `() => { void vault.tryHello() }`**, not the ruled `() =>
  vault.tryHello()`: typescript-eslint's `no-misused-promises` refuses the bare arrow as a
  listener, in a host's lint as in ours. Recommend: keep.
* **YOLO: one message for every non-bag** (null, a number, an array), saying "an event, most
  likely". Recommend: keep.
* **YOLO: the double load is `bad_option`**, not a new kind. Recommend: keep; a kind of its own
  if hosts need to branch on it.
* **Contract drift: *vault.hello* and *vault.ensureLease* Refuses** gain "*Fix the code:*
  `bad_option`, for anything in place of `opts` that is no plain bag, an event above all: wrap
  it, `() => { void vault.tryHello() }`."
* **Contract drift: *Shapes*, Making and unmaking**: `adorn(obj, ckey, val)`, and both helpers
  internal. Add: "A `Box` or `Proof` made by another copy of safebyok is refused `bad_option`,
  naming the double load."
* **Contract drift: *Lease***: `tryOpen(holder)` and `grant(vault, holder, vaultKeyPair,
  askPassphraseAt)`, if B2's drift did not carry them.
