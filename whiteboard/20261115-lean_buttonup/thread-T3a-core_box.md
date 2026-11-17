# Thread T3a: core_box (2026-11-17)

Branch `20261117-core_box`, PR #715, on main (cut at `b70f340e6`). Proved, after the review round: `safebyok` 868
tests, typecheck and lint clean; `pnpm justify` after the catch-up (see the PR's **Tests:** line).
The build is below; the review round, which supersedes it where they differ, is under *Review round*.

* **Built**:
  - **Item 1, the stamp pair** (`31ceea800`): a third party names them `bankStamp` / `gateStamp`. No ctx byte moved.
  - **Item 2, `CoreBox`** (`7c74cc4aa`): a frozen class of statics in `src/models/core-box.ts`, handed to the lease
    as the sealer itself and duck-checked (`Checks.sealer`, `bad_option`).
  - **Item 3, the seal path** (`6017225b6`), as the Coach's directives in t3-plan.md "The seal path" lay it out:
    - `Sealer<RecordT, CleartextsT>` (`sealers.ts`), its forms from `SealedOf` / `UnsealedOf` / `SealedPartsOf`, plus
      `LiveOf`, `TombstoneOf`, `RevisionOf`, `BodyOf`, `DonorOf`, `PublicPropsOf`, `LivePublicPropsOf`,
      `TombstonePublicProps`. Thirteen members: `donorPropsOf`, `publicPropsOf`, `secretPropsOf`, `nextRevisionOf`,
      `tombstoneOf`, `tombstoneSecrets`, `stampOf`, `tags`, `purposes`, `encode`, `decode`, `sealedOf`, `recordOf`.
    - `lease.seal(sealer, donor, publicProps, secretProps)`: the donor passes `sealer.donorPropsOf` (approvelist,
      stripping), then `withoutSecrets` (the lease's banlist: `whisper` and `*_sealed`, by pattern, on es-toolkit
      `omit`); `{ am: 'x' }` picks `tombstoneOf` and `tombstoneSecrets`, else `nextRevisionOf` and `secretPropsOf`.
      `lease.unseal` answers `UnsealedOf<RecordT, CleartextsT>`, frozen (Bank.unsealBox's spread moved in).
    - The ctx is `[bankStamp.parse(bank.stamp), sealer.stampOf(record)]`; `CoreBox.stampOf` is the new `boxStamp`
      (today's sparse fields, refuses the shell). Box ctx bytes unchanged. `#bankKey` binds the parsed bank stamp too.
    - `gatelabelpath` → `gate_labelpath` (lease ctx moves; an old record refuses `bad_option` at `Lease.make`, a new
      MalformedCase). `CitedGate` / `citedGate` → `GateCited` / `gateCited` in stamps.ts; `buildLease` parses with it.
    - `Bank.sealBox(donor, publicProps, secretProps)`, `tombstoneBox(donor)` = `sealBox(donor, { am: 'x' })`,
      `#demandOwnBox` (scope and root, `record_conflict`, before any crypto). `BoxCheck` and `#demandBox` are gone.
    - `BoxSparse` retired. What replaced each: index.ts / core.ts export `BoxDonor`; storage.ts drops the type and
      exports `boxDonor` (for `boxSparse`); shapes-minder uses `boxDonor`; bank.ts types `rootBox` and
      `BankMakeRecord.rootBox` as `Sparse<BoxThing>` and checks with `boxDonor`; `BoxShell` is `Sparse<BoxTombstone>`;
      `BoxUnsealed` is `UnsealedOf<BoxThing, BoxCleartexts>`; the ctx uses `boxStamp`. Classifiers and ask builders
      untouched. `boxDonor` (shapes-thing, `bad_record`) strips and keeps an optional sidecar; `Phrases.SparseHalfShell`
      → `DonorHalfShell`, new `SidecarMissing`.
  - Tests: every `sealBox({ ...prior, sidecar }, { whisper })` is `sealBox(prior, { sidecar }, { whisper })`;
    `CoreBox.nextRevisionOf(TH.boxShellOf())` scaffolding replaced by `TH.boxShellOf(), { sidecar: TH.Sidecar }`.
    New: whole unsealed / sealed donor; no sidecar anywhere refuses (encode never called); given sidecar wins;
    written_at used and signed; tombstone of a tombstone or the shell refuses; a leaky `donorPropsOf`'s `whisper` and
    `notes_sealed` stripped; `withoutSecrets` describe; `stampOf` refuses the shell; the bank's stamp is the ctx's
    first part (two-stamp order swap refuses); a padded bank stamp binds nothing extra.
  - `notes/security.md`: four `amended 2026-11-17 (core_box)` lines on the two lean_gate entries (box seal ctx;
    lease takes a sealer). The changeset names what a host sees.
* **Review round** (2026-11-17, the Coach's directives in t3-plan.md "T3a review round"; `bad0ef42e`, `8c193ebf0`,
  `d9c2c7f31`):
  1. A tombstone takes a given `written_at`: `tombstoneOf(donor, publicProps)`, `bank.tombstoneBox(donorProps,
     { written_at })` through `sealBox`. Tested: carried, and moved refuses the unseal (lease, bank, CoreBox).
  2. The general overload stays. Per the Coach's mid-task ruling, secretProps with `{ am: 'x' }` refuse `bad_option`
     in `Lease.seal` (any sealer; `Phrases.TombstoneSecretsGiven`). By the directive's "no prop given silently
     dropped", a sidecar with `{ am: 'x' }` refuses too, in `CoreBox.tombstoneOf` (`TombstoneSidecarGiven`).
  3. The lease's gate revision is `GateRevisionedStamp`, checked by module-local `gateRevisionedStamp` in proving.ts
     (`gateStamp` + `revtok`); stamps.ts / core.ts drop `GateCited` / `gateCited`. `gate_revtok` keeps its schema.
  4. `BoxDonor` / `DonorOf` → `Sealable<RecordT>`; `boxDonor` → `boxSealable`. Params named `donorProps` on
     `Lease.seal`, `sealBox`, `tombstoneBox` (CoreBox's statics keep `donor`). The minder friend's `rootBox` checks
     with `boxRecordOrShell`.
  5. `bank.rootBox` / `BankMakeRecord.rootBox`: `BoxRecord | BoxShell`, kept whole. New shapes-thing checkers
     `boxRecord` (a live box, refined) and `boxRecordOrShell` (with a strict box shell), exported from storage.ts.
     Sparse-root callers found: thing-minder's seed (now `sparseOf(rootBox)`, keeping "sparse and stale"); the
     thing-minder test's fake bank (now whole); bank-flows' listing `parent` (compared to `sparseOf(bank.rootBox)`).
  6. `unseal` answers from `sealer.recordOf(record, sealer.sealedOf(record))`: no new sealer member.
  7. `withoutSecrets`: no change. 8. Lease doc block: "knows which field names hold secrets, and nothing else of a
     record". 9. `BoxPublicProps` declared once, in sealers.ts, exported from core.ts and index.ts.
  10. Security note: six `amended 2026-11-17 (core_box)` lines (a)-(f); the subagent added clauses naming the earlier
     sentence each corrects. 11. The changeset names each of the above.
* **Decisions made**:
  - Sealer parsing members take `unknown` in the interface; CoreBox's statics are typed and satisfy it (bivariance).
  - The general overload lets sealBox delegate without branching on `am`.
  - `bankStamp.parse` sits in `#ctxOf` as well as `#bankKey`, so every ctx binds the parsed stamp.
  - `TH.boxShellOf()` is the true shell (no sidecar); `TH.Sidecar` is the publicProps sidecar.
  - The root's shell checker is written out in shapes-thing, not `ShellChecks.shell`, whose `fmt: uint` is not a
    `BoxShell`; nor `boxSealable`, per directive 4.
* **Deviations**:
  - unseal's tests read `.deep.include(Cleartexts)` where they read `.deep.equal`: forced by unseal answering the record.
  - Item 12: bank.ts's `{ user_id: parsed.userid, banklabel }` renames `userid`, so no checker fits; it stays.
  - Review round: the `donorProps` param rename; the sidecar refusal (2); thing-minder.ts's seed line (5), out of
    the brief's `minding/` scope but needed to keep the minder's contract.
* **Safety hatches**: kept unseal's `as UnsealedOf<...>` and `withoutSecrets`'s key cast (lease.ts), CoreBox's
  `no-extraneous-class` disable and `sealerMembersOf`'s `as`. **Added** (review round): `as Sparse<Thing>` on
  thing-minder's root seed: `Sparse` is a `Pick`, and TypeScript compares `Pick<BoxRecord | BoxShell>` to
  `Pick<Thing>` by its argument, which the shell (no `whisper_sealed`) fails. A branch on `am` was the alternative.
* **Discoveries**:
  - `vi.spyOn(CoreBox, ...)` throws "Cannot redefine property" (CoreBox is frozen): spy on `{ ...BoxSealerBag }`.
  - `CoreBox.sealedOf` already parsed the record strictly, so a field beside it refused before directive 6 too.
* **Approaches set aside**: a modelkind lookup table for the cleartexts; `omit` from `es-toolkit/compat`; a banlist
  checker (ruled: a function); for directive 6, a new sealer member (reused `recordOf` instead); for the seed, a
  whole root (would change the minder's "sparse and stale" contract).
* **For the Coach**:
  - The sidecar refusal with `{ am: 'x' }` (directive 2's reading): keep, or ignore it as before?
  - Directive 6 reuses `recordOf` over `sealedOf` as the parse: a second strict parse per unseal.
  - "donor" survives in CoreBox's static param names and the Sealer interface's; `donorProps` on the public seals.
