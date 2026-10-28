# Memory to other homes

The rest of my auto-memory worth keeping, each under the home it would move to. None is applied.

## 1. PROCESS.md, *A worktree per thread*: the workspace's git traps

My `byok-workspace-quirks` memory. Most of it is already said: `--no-track`, a base of `main` with
"Stacked on #N", the push command and one merge line are in PROCESS.md; rerere and
`--no-update-refs` are in the restacker skill; a half-removed worktree is in
`notes/housekeeping.md` and `scripts/file-thread`. What is left, as a paragraph after the one that
ends "...not its own.":

> **Traps this workspace has sprung**, each of which cost a branch or a push:
>
> * Git has `rebase.updateRefs` on: a rebase quietly moves every other local branch stacked on
>   the same commits. Rebase with `--no-update-refs` unless that is what you want. git rerere's
>   cache is shared by every worktree and can replay a stale resolution: after a conflicted
>   rebase, diff each resolved file against the original commit.
> * Push with an explicit refspec, `git push origin <branch>:refs/heads/<branch>`, and check
>   `git ls-remote` after. `git checkout -B <branch> origin/<other>` makes the branch track
>   `<other>`, and a bare push then fast-forwards the other's PR, a lease notwithstanding (#185,
>   2026-10-19).
> * Make every git write `git -C <worktree>`, never a `cd` that a heredoc or a failed step can
>   leave in the main checkout: on 2026-10-15 one swept the Coach's uncommitted edits into a
>   commit.
> * A branch sweep can unregister a live worktree, leaving its files on disk and every git command
>   there failing with "not a git repository" (2026-10-16). Don't hand-write `.git`: `git worktree
>   add` a fresh path on the same branch, `diff -rq` the old directory against it (leaving out
>   `node_modules`, `dist`, `.eslintcache`), copy the changed files across, and carry on there.

## 2. `.claude/skills/tighten-guidance/SKILL.md`: norms over blocks

My `soft-norms-over-tool-blocks` memory, as a bullet beside *Stays*:

> * **Steer a costly habit with a norm, not a block.** When an agent habit costs (a worker
>   writing the sprint doc), write a calm norm phrased by its purpose ("the orchestrator keeps the
>   doc; send it what belongs there"), not a `disallowedTools` or a `permissions.deny`. The
>   Coach, 2026-10-16: "that's way too strident ... all else equal I'd want them to also have
>   access." A hard deny is for a tool with no use here (Vercel, the Google connectors).

## 3. `.claude/skills/turbochat/SKILL.md`: the bookmark rule

From `doc-check-cadence`: the one rule the skill's *When to read it* lacks. Appended to its
paragraph:

> The bookmark is the rev of your last read, never a write's ack: the Coach edits between your
> writes, and a `sinceRev` taken from an ack skips their flips (2026-10-24: three `proceed`s
> missed that way).

## 4. Beside the turbochat skill, `docs-cell-traps.md`: Claude Docs editing traps

From `claude-docs-cell-edits`, as a reference file the skill's step 3 points to:

> * A write's block target is the full id, `<session>.<clock>`. A read prints later ids of the
>   same session short (`.123`): the session is the nearest full id above. A short id is refused
>   as `relative_id`, and the whole batch with it.
> * Cell targets resolve in op order: a row `insert` earlier in a batch shifts every later cell
>   target's row, and the cells land on the wrong rows with no refusal. Put row inserts last, or
>   in a call of their own. After rows are deleted, a numbered `row` can be off by one; `row: -1`
>   hits the last row. Address new rows by the ids the ack gives, and check each ack.
> * A `find`-targeted `replace` whose range starts or ends beside an inline code mark puts the
>   whole replacement inside the mark: rewrite such a paragraph by id.
> * A new row with a chip is one `insert` `"as":"blocks"`: the chip is
>   `{"type":"dropdown","attrs":{"enum":"<enum id>","index":0}}` inside the cell's paragraph; an
>   empty cell is `{"type":"paragraph"}` (an empty text node is refused).
> * Deleting a row whose cells another session edited leaves their words behind as loose
>   paragraphs (the ack says `edited_since`): delete them after.

## 5. VOCABULARY.md, beside *KEK, DEK, KDF, AAD* (line 201): the bar for a name

From `compromise-names-bar`:

> **The bar for a name in the cast** (the Coach, 2026-10-18): a security reviewer can map it onto
> the standard term, and a senior backend engineer with no cryptography reads it on sight:
> `KeyDeriver`, not KDF; `whisper`, not cryptotextOfSerializedLockboxPayload. A half-descriptive
> name is worse than a plain one: drop any segment of the long form and it misleads somewhere.
> Prefer a plain placeholder word (pantry, wayin) to a half-technical one.

## 6. The test helpers' doc block, or PROCESS.md: vitest is silent in Claude's sandbox

From `vitest-silent-in-sandbox`:

> In Claude's sandbox, `pnpm vitest run` prints no `stdout |` / `stderr |` blocks, though CI does
> (cause not found: no `silent` in a config, no `VITEST` variable). Judging test noise there takes
> `pnpm vitest run --silent=false`, with ANSI stripped and `^std(out|err) |` grepped. A default
> run proves nothing quiet: on 2026-10-27 one showed none of CI's ~450 lines.

## 7. Past design docs (Claude Docs)

For the record. Their rulings are superseded by the code, STYLE.md and VOCABULARY.md:

* Vocabulary reform, "Design Space" tab, 2026-10-18:
  https://claude.ai/artifact/WLMv2sEsEE5dBmVRTj6FxP
* Sprint `reform` doc, 2026-10-18: https://claude.ai/code/artifact/b7fd117e-7a03-4f68-b2fa-b2c1e70e118b
* "Every path through store()" (Contract, Thunks tabs), 2026-10-19:
  https://claude.ai/code/artifact/8ac26722-33ee-4082-a76f-f4c9b6722b70
* Sprint streamline (Open Matters, Revised Outcomes tabs), 2026-10-22:
  https://claude.ai/artifact/XJsqP4CTaVdfwKMBGS1sQ4
