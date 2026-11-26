# Thread 2: manifest_rest (2026-11-26)

Branch `20261126-manifest_rest`, PR [#937](https://github.com/mrflip/safebyok/pull/937), stacked on [#934](https://github.com/mrflip/safebyok/pull/934) (thread 1, filed at `56c5fda59`). Proved: `pnpm justify` after the catch-up rebase:
red only in `safebyok-indexeddb` (115 of 130 tests fail), `safebyok-postgres` (107 of 170) and `safebyok-convex` (149 of
231), each also red in lint and typecheck; threads 3, 4 and 5 port them. Green elsewhere: `safebyok` 2,412 tests,
`safebyok-react` 339, e2e 576, root 331, the demos (react 99, envman 24, knockknock 26), every `-big` package. Demo
`dojo` imports safebyok-indexeddb and does not typecheck until thread 3 (justify does not typecheck it).

* **Built**:
  - `AdapterVaultDB.tryListThings`, `tryBirthBank`, `tryGetWorld`, `tryStats` on thread 1's pipeline:
    `check*Observations` → `scribe*Act` (list, birth) → `*AnswerOf` → `ThreeWay.demand*Consistency` → frozen.
  - `MemoryDatastore.listThings`, `birthBank` (with `isBirthWritable`, Postgres's `birth_roots`: none of three stored),
    `getWorld`, `stats`; `MemoryVaultDB`'s `do*`s are one line each.
  - Manifests `ListManifest`, `RootRows`, `BirthManifest`, `WorldManifest`, `StatsManifest`, their `Checked*` and
    `Scribed*`; `BirthTags`/`RootTags`; `ManifestTags.birthTagsOf`.
  - `three-way.ts`: the per-verb demands call one `demandSharedConsistency` (answer copies manifest + banktok, tracked,
    read_tc → `unexpected_error`; each row, listed child, root and tracked row at its address → `storage_issue`).
    Thread 1's `demandGetConsistency`/`demandWriteConsistency` were refactored onto it.
  - `notes/vault-adapter-contract.md`: the new core's adapter contract, the three roles, every manifest field, the
    tags, the write and birth predicates, the watch, and what refuses. `notes/answer-contract.md`'s *Adapter contract*
    now says it is safebyok-big's and points there.
  - Removed thread 1's Scaffolding: `thing-classifier.ts`, `[Classifying]`, the Actual types and `ActualChecks`, the
    old MemoryDatastore functions. Demos' `doBirthBank` return a `BirthManifest`.
  - Thread 1's review, folded in (40e002744): `answerOfOtherManifest` is `unexpected_error`; m1 (`banktokMissing`,
    `banktokOrVoidOf`); m6 (`AnteWayins`, `TrackedRows` into `shapes-manifest.ts`); m8; m9 (manifests as interfaces).
  - Doc drift: `BadAct`'s doc block; AskChecks' banktok line; STYLE.md's namespace-import example; wontfix.md's banktok
    row (named the classifier). A `notes/security.md` entry, through a sonnet subagent.

* **Decisions made**:
  - Listing children are read whatever the parent (as Postgres does), checked only under a live parent; a child failing
    its kind's checks goes to `damaged_rows`; children of an earlier life are dropped; deltas sorted by labelpath.
  - A birth's puts cite the shell, so its root tags are `presence` and `revtok_cmp` alone. `'passed'` needs all three
    roots stored, else `bankRootsMissing`. Stored roots at the ask's own revtoks read as `'=next'`.
  - A listing child's address is checked in three-way, after its kind checks (the Coach: address checks live in
    three-way, widened to a listing's children). The ancestor alone stays checked whole when read, as ruled.
  - World and stats have no scribe step: there is no act to find.

* **Deviations**:
  - **m1, narrower than written.** The directive said a manifest with no banktok "(or not a string)" refuses
    `storage_issue`. I refuse only where the `banktok` key is absent. Taken literally, device.test's "shows the
    vaultDB's refusal as failed where its bank is stored damaged" answered `storage_issue` instead of `damaged_row`:
    `ManifestTags.banktokOf` of a damaged bank row is `undefined`, so a sound datastore would trip it. A banktok that is
    no lifetok reads as the void lifetok (notes/wontfix.md).
  - `TrackedRows` is exported top-level from `safebyok/storage`, no longer as `ManifestTags.TrackedRows` (m6).
  - The AskChecks doc leaves out the "banktok will hard-scope every record" line: aspirational, and a doc block
    describes what is.

* **Discoveries**:
  - Broken-state answers that changed (none in a working state): a listing's, birth's, world's or stats' banktok that
    is no lifetok answers the void lifetok (get and write already did); a manifest with no banktok refuses
    `storage_issue`; an answer that does not copy its manifest is `unexpected_error`; a listed child at another address
    refuses after its kind checks.
  - Threads 3–5: port to `notes/vault-adapter-contract.md`; `MemoryDatastore` is the TypeScript reference. Postgres's
    write predicate must keep `fmt` and `lifeseq_ok`, which `isWritable` copies.

* **Approaches set aside**:
  - One `demandThreeWayConsistency` over every verb: per-verb functions over a shared one, as the Coach ruled, read
    better for the reader debugging one verb.
  - Checking a listed child's address in `checkedChildrenOf`: against the ruling that address checks live in three-way.
  - Refusing a banktok that is no string (m1 literally): breaks the damaged-bank answer, above.

* **For the Coach**: confirm the m1 narrowing, and the broken-state changes under *Discoveries*.
