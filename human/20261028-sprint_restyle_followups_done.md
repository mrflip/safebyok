# restyle follow-ups: done (2026-10-28)

After the restyle sprint closed on 2026-10-27, the Coach approved nine follow-up threads (21 to 29),
run in YOLO mode from the same sprint doc. They carried thread 22's validator rename onto the new
main (validators lowerCamelCase beside their types, exported by name, no `Validators` namespace),
moved bank.ts's and vault.ts's refusal sentences into phrases.ts, put the core's slowest timing
check on a fake clock, made safebyok-react's dialogs wait while an `<Activity>` hides them, bumped
convex-helpers, and tidied what the rename left.

**Merged:** #318 (thread 23), #319 (21), #320 (24), #322 (22), #348 (main red, not this sprint's),
#349 (25).

**Open, each standing alone on main** (Mergify's queue rebases each as it merges; no restack):

- #350 (thread 26, activity_mount): filed and green; a wrap-up pass bodged in its review's leftovers.
- #352 (thread 29, vault_phrases): filed at 3162011e. Merges cleanly with #353 either way.
- #353 (thread 27, restyle_tidy): filed at 3d420892.
- #354 (thread 28, helpers_range): a draft, red until 23:14 UTC tonight, when
  `winboard/20261025-restyle/thread-28-finish.sh` (on its branch) re-locks and files it.
- This PR: the todo file, the resolutions swept from the doc, and this note.

Suggested order: #350, #352, #353 in any order, then #354 once the script has run, this one last.
#340 (gripeoween_vault) rebases over #352: its sentences moved word for word, and its
`Validators.x` uses need the recase recipe (`thread-22-recase.cjs`, run `--dry` first).

**YOLO calls** are rows in `winboard/20261025-restyle/restyle-resolutions.md` and, where the Rec
stood without a flip, section E of `restyle-todo.md`.

**Still open**: everything is in `winboard/20261025-restyle/restyle-todo.md`, by readiness:
thread 28's finish, four small tidies, two items that go with #340, two for the documentarian,
the Recs kept as built, and two Coach notes on the doc that were not taken up.
