# Sprint restyle: paused at the Coach's request, 2026-10-26

Paused to save usage, not for a problem. Nothing is running: no worker, no reviewer, no timer.

**Where it stands.** Twelve of thirteen threads are filed, each reviewed (thread 1 excepted:
guidance prose only) and pushed, in one stacked line on the primitives line's top (#267):

main → #265 → #252 → #268 → #269 → #270 → #266 → #267 (primitives, unmerged)
→ #273 validator → #274 zod_classic → #275 brands → #276 scopepath → #277 names
→ #278 bank_per_user → #279 vault_record → #280 cipher_ctx (reviewed at high) → #281 reads
→ #282 vault_object → #283 snapshot → #271 (this sprint PR, draft, documents only)

#272 guidance stands on #267 beside the line.

**What waits.**
* Thread 13 (`bank_listing`, Preplan Phase 8) is not started. Its gloss in
  `whiteboard/20261025-restyle/restyle-plan.md` holds everything earlier threads handed it. To
  resume: cut it from `origin/20261026-snapshot` (`scripts/cut-thread bank_listing
  origin/20261026-snapshot`) and hand it to a thread-worker as the plan says.
* Then the wrap-up (`.claude/skills/sprint/wrapup.md`): restack onto main (or onto the
  primitives line if it has not merged), carrying VOCABULARY and STYLE.md edits from threads
  8, 9, 11 and 12 onto #272's text (listed in `restyle-progress.md`); the changeset clauses for
  #275 (passphrase refusal's `meta`, `FakeCiphered`); sweep Resolved; close the sprint PR.

**Needs the Coach.**
* #272, #273 and #274 are drafts: a worker's `gh pr ready` (and `gh pr edit`) was refused by the
  permission classifier. #273's finished body is at the scratchpad path in its Open Matters row;
  #272's base is `20261024-contract_tab` and should be `main`.
* The Open Matters tab of the sprint doc (https://claude.ai/artifact/4Hx2VL1fu4qUMQV9z6rJFz)
  holds every YOLO decision and open question, one row each, all `drafting`. Worth a look first:
  `registered_at` now bound (reversing a 2026-10-21 call), the device-record format rule, the
  `gate_epoch` report, `getBox` on a `newer_format` box, and what `demandConsistentWith(snapshot)`
  no longer catches.
