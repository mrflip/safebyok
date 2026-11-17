# Thread T3a: core_box (2026-11-17)

Branch `20261117-core_box`, PR #715, on main (cut at `b70f340e6`). Proved: `pnpm justify` green after the catch-up
(still as cut): `safebyok` 858 tests, every other package and e2e passing, typecheck and lint clean.

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
* **Decisions made**:
  - `rootBox` is `Sparse<BoxThing>`: the narrowest honest type covering the shell and a stored live root. The
    constructor stores `sparseOf(rootBox)`, so a sidecar `boxDonor` now keeps never reaches `bank.rootBox`.
  - Sealer parsing members take `unknown` in the interface; CoreBox's statics are typed and satisfy it (bivariance).
  - A third, general overload on `Lease.seal` and `Bank.sealBox` (`PublicPropsOf`, optional secretProps, answers
    `RecordT`), so sealBox delegates without branching on `am`.
  - `bankStamp.parse` sits in `#ctxOf` as well as `#bankKey`, so every ctx binds the parsed stamp.
  - `TH.boxShellOf()` is now the true shell (no sidecar); `TH.Sidecar` is the publicProps sidecar.
  - `sparseOf` takes any `ThingRecord`, so it serves a donor.
  - `unseal`'s spread is of the raw record, after `sealedOf`'s strict `boxThing` parse checked it.
* **Deviations**:
  - unseal's tests read `.deep.include(Cleartexts)` where they read `.deep.equal`, including lease.test's "zeroes the
    whisper's bytes": forced by the directed change (unseal answers the record). Its byte assertions are unchanged.
  - Item 12: the `{ user_id: parsed.userid, banklabel }` literal in bank.ts's constructor renames `userid`, so no
    checker fits and it stays. If the plan meant makeRecord's `shellOf({ userid, banklabel, labelpath })`, that is a
    one-line follow-up.
* **Safety hatches**: added two `as` in lease.ts: unseal's `as UnsealedOf<RecordT, CleartextsT>` (TypeScript cannot
  see a generic spread through the mapped type; removing it gives TS2322), and `withoutSecrets`'s cast of
  `Object.keys`'s strings to `(keyof BagT & SecretFieldname)[]`. Kept: CoreBox's `no-extraneous-class` disable and
  `sealerMembersOf`'s `as`.
* **Discoveries**:
  - `vi.spyOn(CoreBox, ...)` throws "Cannot redefine property" (CoreBox is frozen): spy on `{ ...BoxSealerBag }`.
  - shapes-thing.ts has its own `bad_record` `gateCited`, beside stamps.ts's `bad_option` one: same name, two
    checkers. Not renamed here.
* **Approaches set aside**: a modelkind lookup table for the cleartexts (ruled out); `omit` from `es-toolkit/compat`
  (ruled out); a banlist checker rather than a function (ruled: a function).
* **For the Coach**:
  - "donor" is a new term, not in VOCABULARY.md.
  - A tombstone's `written_at` is always now: a given `written_at` with `{ am: 'x' }` is dropped, as are secretProps.
  - The `gateCited` name collision above.
