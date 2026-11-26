# Thread 7: incompatible_row (2026-11-26)

Branch `20261126-incompatible_row`, PR #TBD, stacked on #944. Proved: `safebyok` typecheck, lint and 2,425 tests green; `safebyok-big` 2,952 tests green; see the PR for `pnpm justify`.

* **Built**
  * **The kind.** `incompatible_row` is in `safebyok-big`'s `refusalkindVals` (beside `damaged_row`) and `RefusalFamilyForKind` (`bad_news`), with a row in `errors.test.ts`'s family table. Big's own throwers and classifier still throw `damaged_row`. This is the "new refusal kind" broadening `notes/transition.md` allows, and it changes nothing big does.
  * **The new core.** Every `damaged_row` in `packages/safebyok` and the adapters' tests is `incompatible_row`; `damaged_rows` is `incompatible_rows`; `DamagedThing` is `IncompatibleThing`; the thrower `childrenStoredDamaged` is `childrenIncompatible` and its phrase `ChildrenIncompatible` (the sentence now says "incompatible"). `CustomerKinds` in the core's eslint config names the new kind. The prose of rows read "damaged" says "incompatible" (doc blocks and tests, the word only, for thread 10).
  * **Docs.** VOCABULARY.md's new-core `damaged` row is **incompatible**, and the `am` row's `d` says incompatible; `notes/wontfix.md`, `notes/vault-adapter-contract.md` and STYLE.md's two examples follow.
  * **Changeset.** Empty (`20261126-incompatible_row.md`): safebyok and safebyok-big are private, and the public adapters changed a test and a comment only.
* **Decisions made**
  * **Left alone, on purpose.** `damaged_whisper`, `damaged_lease` and `damagedLease` (damage, not incompatibility); big's `damaged_row`, `damaged_vault`, `DamagedBox`, `damagedBoxes`; `safebyok-react`'s tests and the `*-big` packages (they run on big); notes that describe big (`answer-contract.md`, `old_vocabulary.md`, the design files, `guarantees-*.md`); VOCABULARY.md's big entries (line 374, `bank row`, `autolockMinutes`); the Coach's quoted ruling in `wontfix.md` ("damaged_rows are mostly impossible hallucinations").
  * **The stored letter `am: 'd'` stays.** It is a stored tag shared with big, and renaming it is a format change. VOCABULARY.md now says `d` is for incompatible.
  * **VOCABULARY.md's "never indicates format drift" is dropped.** The Coach's gloss ("another format, or a test's plant") says an incompatible row may be another format, which the old sentence denied. The new row says what the Coach said.
  * **`damaged` of a lease, a seal or a whisper stays**, in doc blocks and tests.
* **Deviations**: none from the handoff.
* **Discoveries**: `notes/security.md` got no entry: a rename of a refusal kind is no finding, so no sonnet subagent ran.
* **For the Coach**: confirm `am: 'd'` keeps its letter, and that "another format" is now allowed to be an incompatible row.
