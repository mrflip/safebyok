# Thread 1: vocab_sweep (2026-11-06)

Branch `20261106-vocab_sweep`, PR [#518](https://github.com/mrflip/safebyok/pull/518), off main 57f33ee9. Justify: green (core 1827 tests,
safebyok-old 3537, every package passing; size budgets met).

* **Built**: VOCABULARY.md rewritten against the core on main (`packages/safebyok/src`), row by
  row. Every sentence in a "What it is" cell now has a subject and a finite verb and says one
  thing. The semicolon chains (wayin, lease, gating, stage, damaged and the rest) are split. The
  stand-in "one" is gone. *Encrypted forms* now defines **seal** and **unseal** beside wrap,
  cipher and extract: a box is sealed (`lease.sealWith`: a fresh boxKey ciphers the whisper, the
  vaultKey wraps the boxKey, both bound to the box's and its vault's stamps). Unsealing is the
  reverse. *Words safebyok does not use* rules out **open** as a verb on a key, a whisper or a
  box, naming `unwrap`, `decipher`, `unseal` and `extract`, and keeps it for user-facing
  sentences. The diagram is "Which key wraps or ciphers which". `notes/old_vocabulary.md` gains a
  second table, "The old design's names the new core does not have": every fact this sweep took
  out of VOCABULARY stands there, the old-only rows whole (mask, vaultEpoch, behind, Made under,
  device record, novel, freshness, the listing's vault stage, BankVault, change bell,
  ask_passphrase_at, leaseHours, format strings, zxcvbn and browserOpts).
* **Decisions taken**:
  - A row's opening noun-phrase gloss ("The secret you store: ...") stays as a dictionary head.
    Every sentence after it has a verb.
  - A fact the core contradicts is corrected to the core, and the old fact moves to
    old_vocabulary.md, not dropped. Examples: `replacePassphrase` now leaves the passkey wayin;
    `addPasskey` refuses `camped` while one is held; one gating is open per bank, not per vault;
    the device record and `device_id` are per bank scope; every stored vault has a gate.
  - Four rows took the core's existing name where the old name had no counterpart: **lockState**
    (was novel), **timely** (was freshness), **proved_at** (was ask_passphrase_at),
    **autolockMinutes** (was leaseHours); **format** became **fmt**. None is coined: each is a
    member on main. The "lease, as kept" row is "lease, as cached" (the Coach's ban on Kept).
  - Thread 10's spellings are written now: `Wayinkind`, `Gatingkind`. VOCABULARY names no
    `RefusalKind` or `*KindVals`.
  - `damaged_rows` is written for the listing field, as the sprint's facts say (#511). Main still
    spells it `damaged_records`. Expect a one-line conflict on the `am` row when #511 lands: keep
    this branch's row.
  - Adapter-owned names stay with a note that they run on the old design: `convexVaultDB`,
    `safebyok-react`'s `createPasskey` and `askPasskey`.
* **Deviations**: none from the gloss. Two old facts could not be verified and were not kept in
  VOCABULARY: that `putBox()` writes over a damaged box, and that a test keeps each format's
  schema. Both sit in old_vocabulary.md. The claim that a box under a refused name "lists and
  reads as any other" is false on main: it lists among the damaged rows.
* **Discoveries** (for later threads, none fixed here: docs-only):
  - The core still says "proof", "prove" and `Prove` (`vault.unlock`'s doc: "Ask the user for
    proof"), though VOCABULARY rules out "proof".
  - `helpers/consts.ts` doc comments still name `ask_passphrase_at`. `helpers/phrases.ts` still
    names `maxWhisperBytes` and `staleMinutes` (`HelloOptionsAdvice`), neither an option on main.
  - `Ciphered` is not exported from `index.ts`, though VOCABULARY used to say safebyok exports it.
    The row now says "the core names".
  - `tests/loosened/loosened.test.ts` titles cite `VOCABULARY.md:153` and `:155`. Those line
    numbers were already stale, and are again.
  - STYLE.md's `#one-verb-one-fact` exists. `notes/gallant-docblocks.md` has no "One verb, one
    fact" section on main; its nearest is `#one-sentence-headline`.
* **For the Coach**:
  - Whether VOCABULARY should now describe the new core alone. This sweep did so, and moved the
    old design's members to old_vocabulary.md, though `safebyok-old`, the adapters and the demo
    still use them.
  - The four rows named for core members (lockState, timely, proved_at, autolockMinutes): keep, or
    fold into other rows.
  - The deviceId row's privacy sentence was reworded for a per-bank id: "It is minted per bank
    scope, which the `user_id` already names, so it links nothing new." It is a security claim:
    confirm it.
  - `mask` and the change bell are rows of things the core lacks, not retired names. They sit in
    old_vocabulary.md as "none yet"; say if they belong in VOCABULARY until they move.
