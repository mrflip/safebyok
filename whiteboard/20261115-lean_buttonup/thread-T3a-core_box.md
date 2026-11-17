# Thread T3a: core_box (2026-11-17)

Branch `20261117-core_box`, PR #TBD, on main (cut at `b70f340e6`). Proved: `safebyok` 829 tests, typecheck and lint
clean, at the item 2 commit. Not yet `pnpm justify` or the catch-up: item 3 waits on a ruling (below).

* **Built**:
  - **Item 1, the stamp pair** (`31ceea800`). A third party names the pair `bankStamp` / `gateStamp`: `ProvingParts`,
    `buildNovel(device, bankStamp, gateStamp, cleartext)` (both builders), the novel-args checks, `wayinCtxOf(bankStamp,
    gateStamp, header)`, buildLease's local, `_cheat_bankKeyBytesOf`. A thing's own stamp stays `stamp`
    (`StampedGate { bankStamp, stamp, wayins }`). The lease stamp's flat fields are not renamed; no ctx byte moved.
  - **Item 2, `CoreBox`** (`7c74cc4aa`). `src/models/core-box.ts`: a frozen class of statics, `nextRevisionOf` (was
    `boxWhisperOf`), `tombstoneOf` (was `boxTombstoneOf`), and the sealer members moved verbatim (`tags`, `purposes`,
    `stampsOf`, `encode`, `decode`, `sealedOf`, `recordOf`), with `nextLifeOf`, `deserializeWhisper` and the box checks.
    Checked by `Object.freeze(CoreBox satisfies Sealer<BoxSparse, BoxThing, BoxCleartexts>)`. Exported from
    `src/core.ts` only.
  - `sealers.ts` keeps the `Sealer` interface (now `Sealer<NextT, RecordT, CleartextsT>`, no `PriorT`, no
    `nextRevisionOf`; `recordOf<SubT extends NextT>` keeps the revision's type) and the record types. New:
    `SealedPartsOf<CleartextsT>`, which `SealedOf` is now built from.
  - The lease: `seal(sealer, nextRevision, cleartexts): Promise<SubT & SealedPartsOf<CleartextsT>>` and
    `unseal(sealer, record): Promise<CleartextsT>`. Both parse `Checks.sealer` first: a duck check that picks the seven
    members off the value by name (statics are not enumerable) and checks them with zod, refusing `bad_option` with
    `Phrases.SealerExpected`. Never `=== CoreBox`. `#sealText` and `#openSealed` changed only their type annotations.
  - The bank: `lease.seal(CoreBox, CoreBox.nextRevisionOf(prior), cleartexts)`, `lease.seal(CoreBox,
    CoreBox.tombstoneOf(prior), { whisper: {} })`, and one `lease.unseal(CoreBox, parsed)` in place of the `am` branch.
    `sealBox` still answers `BoxRecord` and `tombstoneBox` `BoxTombstone`, with no cast.
  - Deleted: `sealerkindVals`, `Sealerkind`, `SealerKinds`, the `BoxWhisper` / `BoxTombstone` sealer objects,
    `sealerOf` and its `eslint-disable-line import-x/namespace` and `as` cast, the lease's `PriorOf`, `NextOf`,
    `RecordOf`, `CleartextsOf` and `Checks.sealerkind`, their core.ts exports, `'sealerkindVals'` in index.test.ts
    (now `'CoreBox'`: it must not reach the front door).
  - Tests: `sealers.test.ts` is `core-box.test.ts` (git mv; identifiers changed, plus a `CoreBox` frozen/tags/purposes
    test in place of the two kind tests). lease.test.ts: a plain-object sealer (`BoxSealerBag`, the statics bound) is
    taken as the class is; 13 cases refuse `bad_option` at seal and unseal (each of the seven members missing, bad
    tags, a non-string purpose, a non-function encode, a bare function, a sealer's name, null).
  - `notes/security.md`: an `amended 2026-11-17 (core_box)` line on the 2026-11-14 lean_gate entry about the sealerkind
    lookup (its header says to amend the entry that covers the mechanism). It argues the lease gains no capability.
  - The empty changeset, `.changeset/20261117-core_box.md`.
* **Decisions made**:
  - In `buildLease`, `cited` keeps its name: it is a `CitedGate` (a gate stamp and revtok), not the gate stamp, and
    `citedGate` would collide with the imported checker.
  - wayin.ts imports `* as Stamps`, so the parameters `bankStamp` / `gateStamp` do not shadow the checkers its body
    needs. Elsewhere (buildNovel's parameters) the shadowing is harmless and left.
  - The sealer duck check lives in lease.ts's `Checks` (the lease is the entrypoint that validates), not as an
    exported `isSealer` in sealers.ts. Exporting one later is a one-line move.
  - `Lease.seal`'s type parameters `<NextT, RecordT, CleartextsT, SubT extends NextT>` infer from `typeof CoreBox`
    without help; the interim `NextT` on the Sealer goes in item 3.
  - Item 1's novel-args checks are `GX.passphraseNovelArgs.omit({ bank: true, gate: true }).extend({ bankStamp,
    gateStamp })`: big's shapes carry `bank` / `gate`, and big is frozen.
* **Deviations**:
  - The three proofs pass with identifiers changed, but the two lease proofs' calls also change shape as item 2's
    ruled signature demands: `lease.seal('BoxWhisper', TH.boxShellOf(), Cleartexts)` became `lease.seal(CoreBox,
    liveNext(), Cleartexts)`, where `liveNext()` is `CoreBox.nextRevisionOf(TH.boxShellOf())`. No assertion changed.
    ctx-bytes.test.ts's byte literals and core-box.test.ts's "quoting none of it" changed identifiers only.
* **Safety hatches**: removed `eslint-disable-line import-x/namespace` and its `as` cast (`sealerOf`). Added
  `eslint-disable-line @typescript-eslint/no-extraneous-class` on `CoreBox` (a class of statics was ruled; the reason
  is a `//` line above its block), and one `as` in lease.ts's `sealerMembersOf` (`val as Partial<Record<keyof
  AnySealer, unknown>>`, after narrowing to an object or function), to read the members off an unknown value.
* **Discoveries**: zod's `obj` refuses a function, and a class is one; its static methods are not enumerable, so the
  duck check reads each member by name into a plain object first. `@typescript-eslint/unbound-method` flags pulling
  the statics off the class; the test binds them.
* **For the Coach**: item 3's spelling is held: `Sealer<RecordT, CleartextsT>` (two parameters) or `Sealer<RecordT>`
  with the cleartexts from a lookup by modelkind, `{ box: BoxCleartexts }`. Item 3 is not built.
