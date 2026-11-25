# Sprint lease_shelf: done (2026-11-25)

The lease_shelf sprint gave the new core one lease per device, shared across tabs and reloads. The lease is a Thing-shaped record in a device database, filed at its own `lease/<label>`. A softlock caps the lease on a gate change. A janitor runs from sign-in to disable: it autolocks, retries a stopped watch, and re-reads a stale gate. `connect`/`disconnect` replace `sweep`. Lifecycle announcements, with `#setStage`, log each stage crossing. One tab holds the watch, and a lost watch lock is asked for again. A devicetok lasts, one per user. `world.stats()` and a self-test probe were added. Postgres mints `read_tc`, and a ThingCar's `read_at` is the one read time. Fourteen threads; YOLO mode.

## What merged, and the closing PR

Merged on 2026-11-25, in order: #904 (the 899 agent's), #900, #902, #903, #907, #908, #909, #912, #915, #910, #906, #905, #911, #924, then the last line: #927 `lease_names`, #926 `watch_recovery`, #925 `set_stage`, #928 (guidance and TODO entries) and #901 (this sprint's whiteboard and this note).

The closing PR, against main: [#929](https://github.com/mrflip/safebyok/pull/929) `watch_ended`. A watch that ends of itself is announced to `onLifecycle` as `watch_ended`, which the default handler logs (the Coach: "great idea. Also lifecycle announce"). It carries these notes' last update too.

## YOLO decisions

- **The stored lease's label-to-gate check, restored** (#927). Thread 11 dropped it; its review showed that a damaged record would then be quietly taken up as a lock in every tab, rather than reported. The check now reads `LeaseLabelpath.of`, a lease's `gate_labelpath` must be a gate's, and the refine runs only once every field has passed (zod 4 `when`).
- **`DefaultOnLifecycle` names the fields it logs** (#925), so a field added to an announcement later is logged only by a decision.
- **Per-bank devicetok rows an earlier build left in IndexedDB stay**: no migrations before 1.0, and nothing reads them.
- **The guidance commits got a PR of their own** (#928), so the sprint PR carries only its whiteboard and this note.

## Still open, for the Coach

Nothing: Open Matters is empty. The last three rows (`onEnded`, the watch lock's name, the restored lease check) were all kept as built; see the resolutions file.

## Still open, for later work

- A documentarian pass over the sprint's doc blocks (Cleanup *Finally*): those from threads 1b, 8, 5 and 7, `StoreQuotaTooSmall`, `ProbePutNotGot`, `StoreLimitLeastBoxes`'s wording, and `MaxTimerMillis`'s doc.
- Fold idb-lean's `Filed` into `FiledRaw`.
- TODO.md's new entries (in #928).

What the Coach ruled is in `whiteboard/20261125-lease_shelf/lease_shelf-resolutions.md`. The Closer Look is exported to `lease_shelf-closerlook.md`, with one caveat: the markdown export may not carry answers you wrote as highlights there. Your rulings on E1, E3 and E9 are in the resolutions file.
