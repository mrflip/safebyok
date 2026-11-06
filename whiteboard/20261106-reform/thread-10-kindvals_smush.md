# Thread 10: kindvals_smush (2026-11-06)

Branch `20261106-kindvals_smush`, PR #TBD, stacked on #557 (`20261106-types_ab`). Justify: green (every package; no size line moved).

* **Built**: the `kind` tag smushed in the core's exported and shared names, by sed over `packages/safebyok` and the one doc that quotes the pattern: `RefusalKind` to `Refusalkind`, `refusalKindVals` to `refusalkindVals`, `wayinKindVals` to `wayinkindVals`, `gatingKindVals` to `gatingkindVals`, `correctableKindVals` to `correctablekindVals`, `WayinKind` to `Wayinkind`, `GatingKind` to `Gatingkind`. 88 lines in 20 files (src, tests, `src/index.ts`) plus STYLE.md. Changeset `.changeset/20261106-kindvals_smush.md`, minor: only `Refusalkind` is public (`src/index.ts`; `src/browser.ts` exports none of these).
* **Decisions taken**:
  * STYLE.md *Shapes* (lines 151-154) quotes `wayinKindVals` / `WayinKind` as the pattern's example; it carries the rename too, so it does not teach the old spelling. Nothing else in it changed.
  * Left unsmushed on purpose, because `kind` there is a plain word in a phrase, not a tag on a thing, and none is a type or a `...KindVals`: `RefusalFamilyForKind` (a const map), `listedKindOf` (a function), the test helpers `namedKinds`, `familyKinds`, `WrongKindCases`, the parameter `asKind` in validator.ts, and `QuotedKind` in eslint.config.mjs. If the Coach reads `RefusalFamilyForKind` as `RefusalFamilyForkind`, it is a one-line sed.
  * `notes/gallant-test_titles.md` and `notes/old_vocabulary.md` mention the old names; left alone (durable notes, not in the gloss).
* **Deviations**: none. No alias, shim or re-export of the old names. The core has no CUSTOMIZATION.md at the repo root; `packages/safebyok/CUSTOMIZATION.md` and the READMEs had no hits.
* **Discoveries**: the adapters (`safebyok-react`, `-convex`, `-graphql`, `-postgres`) mention `RefusalKind` but run on safebyok-old; untouched. #555's files (errors.ts, throwers.ts, phrases.ts, shapes-storage.ts, memory-vault-db.ts, vault-db-new.ts) were touched only on the renamed lines (`errors.ts` and `shapes-*` carry the renames).
