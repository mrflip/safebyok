# Thread 8: act_tables (2026-11-26)

Branch `20261126-act_tables`, PR #942, stacked on #940. Proved: `safebyok` 2,424 tests, lint and typecheck clean;
`safebyok-postgres` 168, `safebyok-convex` 232, `safebyok-indexeddb` 130, each typecheck clean. `pnpm justify`: pending.

* **Built**
  * **The act tables** (decomposition B), in `packages/safebyok/src/storage/manifest-acts.ts`, section `[Tables]`:
    `RevisionGrid` (revtok_cmp × revseq_cmp gives match, stale, retcon, clash, forked or ahead), `MatchActs` and
    `StaleActs` (op × presence × the flag that applies), `GetActs` (presence × ifAbsent) and `ListActs` (presence).
    `writeTableActOf` grades the revision, turns a `match` on `eq` across another life into `clash`, then looks up
    the flag. `refusaltagOf` replaces `brokenOf`: born_at first, then the first failing policy, then lifetok.
    The old `putActOf`, `delActOf`, `getActOf`, `listActOf`, `isLifeMismatch` and `isPolicied` are gone.
  * **The refusal builder.** A policied manifest is `{ ok: false, act: 'policied', actual, refusaltag }`
    (`ScribedWriteManifest`, `shapes-manifest.ts`). `Refusaltag` is `'BornAtNotStored' | 'LifetokNotStored' |
    PolicyTag`, a `PolicyTag` being a `PolicyPhrases` key. `Phrases.PhraseForRefusaltag` gives the message, and
    `RefusalkindForRefusaltag` (throwers.ts) the refusal kind. `Throwers.taggedRefusal(ask, manifest)` builds the
    error, replacing `gateIssue`, `bornAtNotStored`, `lifetokNotStored` and `policiedRefusalOf`.
  * **The written-tags check.** `ManifestTags.writtenTagsOf(ask)` copies Postgres's `written_tags_of` (the SQL
    comment above it now names the TypeScript). three-way's `demandTagsOfWritten` refuses `tagsOfOtherAsk`
    (`storage_issue`) unless a written write's tags equal it. Before this, live + revtok birth + written passed as
    `replaced`.
  * **Tests.** manifest-acts.test.ts gains get rows, the `=next` rows checked for every revseq, del rows over the
    del's own flags, and a describe for a policied write's refusal (kind, phrase, `dbhas`, meta, precedence).
    manifest-tags.test.ts checks `writtenTagsOf` against `writeTagsOf(ask, ante, true)` for five writes;
    three-way.test.ts adds two broken written cases.
  * `notes/vault-adapter-contract.md`: the policies row, the *Written* paragraph, and the three-way refusals row.
  * `notes/security.md`: a new entry, through a sonnet subagent.

* **Equivalence, run once before the old tree went.** A scratch test compared the tables with the old if-tree,
  answer for answer: act, ok, the answer's act and `dbhas`, and the error's refusalkind, message, meta and rows.
  It covered 984,960 write combinations: actual null or a live box, × 26 asks, × every tag combination with real
  `PolicyPhrases`. It also covered 12 get and list cases and 1,728 birth root-tag combinations. There were 0
  mismatches. The scratch copy (`equiv-scratch.test.ts`, `old-manifest-acts.ts`) is outside the repo and is not
  kept. The lasting test is manifest-acts.test.ts's rows, from `notes/answer-contract.md`.

* **Decisions made**
  * **Several tables, no single one**, as the Coach asked: the revision grid first, then the op × presence × flag
    lookup. `ListActs` is beyond the sketch, because `scribeListAct` had the same shape.
  * **Only a policied act carries a refusaltag.** The other refused acts (void, gone, stale, clash and the rest)
    still go through `actRefused`. "Other throwers stay as they are."
  * **A policy verdict's `message` is now checked as one of `PolicyPhrases`** (`policyVerdict`, `oneof`). Without
    that, `PolicyTagForPhrase` (the phrase back to its tag) is not total. This tightens the adapter contract, but
    only for a broken datastore: every datastore we ship already sends `PolicyPhrases`.
  * **`PolicyTagForPhrase = invert(PolicyPhrases)`** is marked "Scaffolding: until thread 9 (`policy_tags`)".
    Thread 9 has datastores send the tag, so the lookup goes.
  * `RefusalkindForRefusaltag` sits in throwers.ts beside the builder, and `PhraseForRefusaltag` in phrases.ts,
    per *Layout*.

* **Deviations**
  * **`demandTagsOfAsk` is removed.** Its policy-names check already holds in both branches' `isEqual` (written
    against `writtenTagsOf`, unwritten against `writeTagsOf`), and its birth-of-shell check is in `writtenTagsOf`.
  * **Two type casts:** `as FlagActs` on the partial tables (a validated ask's flag always has a row), and
    `as unknown as Errors.RefusalMeta`, carried over from the old `PoliciedMeta`, since big's meta.act has no
    `policied`. Neither suppresses a lint or type error.

* **Set aside**
  * **One table keyed `op-presence-revtok-revseq-flag`.** It has thousands of rows and hides the grid
    `answer-contract.md` draws.
  * **A refusaltag for every refused act.** That moves the other throwers onto the builder, which awaits a ruling.
  * **Keeping `demandTagsOfAsk` beside the new check.** It would test twice what `isEqual` already settles.

* **Discoveries**
  * The old manifest-acts test gave a del `ifAbsent: 'repl'`, which no checked ask allows. The del rows now keep the
    del's own flags.
  * A born_at `changed` written case reaches `writtenOfOtherAct` first, because the act becomes policied. The
    written-tags test uses `lifetok_cmp: 'same'` on a gate instead.
  * Running a package's tests in a fresh worktree needs `pnpm --filter <pkg> test` (it builds dependencies first),
    not a bare `vitest run`.

* **For thread 9 (`policy_tags`)**: change `policyVerdict`'s message to a `PolicyTag`, make `refusaltagOf` read the
  tag directly, and drop `PolicyTagForPhrase`. `taggedRefusal` already takes the tag.

* **For the Coach**
  * **Verdict message tightened** to `PolicyPhrases`, for broken datastores only. Recommend: keep, since thread 9
    replaces it with tags.
