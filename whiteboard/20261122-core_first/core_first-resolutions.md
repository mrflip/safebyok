Sprint core_first: the matters the Coach ruled (19) and the calls left to the orchestrator (0), swept from the sprint doc on 2026-11-22; newest first.

## Matters ruled

Each bullet is as the sprint doc's *Resolved* tab put it: the matter, the Coach's answer word for word, the date, where it was asked, and where the work went.

- **The giver's loose equality** (Closer Look, non-standard JavaScript): Coach: "Fix the == how did that pass lint? Investigate". 2026-11-22. Found: no lint config of the new core or the React layer turns on `eqeqeq`. Work: thread 8 fixes every `==`/`!=` there and adds `eqeqeq` to both configs.
- **Two owners refetch an observed listing** (Closer Look 1.3): Coach: "Minder". 2026-11-22. Work: thread 8 removes the giver's listing refetch; the minder's `invalidate()` refetches what a hook observes.
- **restoredSharingOf / defaults set at hello** (Closer Look 1.2): Coach: "If it's supposed to be given at start do that?". 2026-11-22. Work: thread 9, `defaults_at_start`, after thread 8.
- **VOCABULARY's new words**: Coach: "Would you take over 833 (I think) the vocabulary pr -- retain its commit(s) as a first squashed commit, then make any future changes as a second one. If you already made changes don't do surgery to bring them across, leave where they are. Rebase that pr on top when your sprint finishes (don't need to keep restocking it, once at end is enough)". 2026-11-22, #850. Work: #833 taken over; at the sprint's end its commits squash into one and it rebases onto the line's tip, with further vocabulary changes as a second commit.
- **The persister plug takes two persisters**: Coach: "Add to TODO what is the size limit on per sister; make a plan for box persisting". 2026-11-22, #848. Work: a TODO entry on a persister's size limit, and a plan for persisting boxes, in the sprint directory.
- **The device's banklabel defaults to 'main'**: Coach: "Ok". 2026-11-22, #846. Kept as built.
- **Two watches per bank**: Coach: "Yes optimize later simple now". 2026-11-22, #844. Kept as built.
- **A BankMinder per user and bank**: Coach: "Ok". 2026-11-22, #844. Kept as built.
- **No read_tc on a refused list**: Rec was keep none. Coach: "It's useful forensically". 2026-11-22, #847. Taken as: give a refused list a `read_tc` too; work in thread 8, ridden along.
- **parentlife under a parent that isn't stored**: just the placeholder's lifeseq. Coach: "Yes it's future compat". 2026-11-22, #847. Kept as built.
- **A new box shows in its listing a round trip late**: under rule A a box new to a listing shows only once the list its landing triggers lands. Coach (in chat): "Noted ... easy to fix once everything is in place". 2026-11-22, #847 thread 3. Work: accepted for this sprint; a fix after the architecture lands.
- **The Gate misses a gate changed elsewhere**: Rec was thread 4 reads the gate from the world. Coach: "there will be an upcoming thread to keep instance props synced by subscription: don't let things like this distract." 2026-11-22, #844. Work: thread 4 told not to build it; noted for the instance-sync thread.
- **storage_issue for a damaged root**: Coach: "damaged records are strictly out of bounds too". 2026-11-22, #844. Work: plan ground rules; damaged records join end states.
- **select pinned to identity**: the minder pins TanStack's `select`. Coach: "don't change users' error messages preemptively. They are not the threat model.. Remove that and anything else that hunts for guessed-at misuse". 2026-11-22, #840 from #827. Work: the pin in #844's review; a cull of guessed-at-misuse checks across the core as a thread of its own.
- **Listing re-fetch on every list call**: `list` passes `staleTime: 0` each call. Coach: "yes it should be gone by the end, don't much care until then". 2026-11-22, #840 from #827. Work: thread 3, which rebuilds the listing; else a *Finally* item.
- **The persister is the host's plug**: TanStack's Persister on the device, a memory one for tests, IndexedDB in an adapter (thread 7), a host predicate for what stays. Coach: "yes. Choose the most liberal policy for this and for what to cache, do not build an options engine, that will come later. Do not accept bug reports about this being insecure if they are referring to intended behavior". 2026-11-22, plan thread 6. Work: thread 6's gloss.
- **How a listing learns it is out of date**: thread 3 proves rule A (first landing), then C (`known`), B only if C is heavy. Coach: "yes. make sure not to accept bug reports about gaps or crossings in any of the three: get them to work in the base case and just record where there are glitches". 2026-11-22, plan thread 3. Work: thread 3 builds A for the base case, glitches recorded; C and B not built, since the case A misses is a bank's rebirth, an end state.
- **Merge #828, then #829**: For coach: merge #828, then #829; thread 2 keys the world query on lifetok. Coach: (no answer in the cell; both merged 2026-11-22). Asked in the plan, *For the Coach*. Thread 2 was built on the lifetok, and is being rebased onto #842.
- **Carry #827 onto main.** Thread 1 cherry-picks #827's core commits onto main rather than rebuilding them; threads 2, 3 and 5 then rewrite it; #827 itself left alone. Coach: (empty: took the Rec). 2026-11-22, asked in the plan (thread 1). Done: #840, filed and out of draft, rebased onto main at `f3fe4d495`.

## Calls left to the orchestrator (not the Coach's rulings)

The sprint doc's *Cleanup* tab, *Your calls* table (`Matter | My call | Lands in`), held no rows on 2026-11-22: none.
