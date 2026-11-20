# Sprint vault_snapper: done (2026-11-20)

The sprint built the React giver backwards from what a React developer wants, onto the new `safebyok` core.
- **The minder:** its feed moves only forward. Each event is TanStack's own, spread into ours, and each car carries a fixed-width `agerank` the host's cache shares by.
- **The Vault:** a new `Vault` writes boxes with `putBoxOnce` and `delBoxOnce`, and lends a whisper with `withWhisper`. Since your last ruling, `withWhisper` refreshes the box in the background before it unlocks.
- **The Bank:** its gatings join instead of refusing. Each verb's name says whether it is a prompt or a re-entry point (`attempt…`).
- **Snapshots:** the Bank and the Device offer `getSnapshot()` and `subscribe()`. The giver copies the minder's feed into the host's React Query under the minder's keys, with overridable defaults.
- **End to end:** a React 19 test unlocks a bank from a form action, and proves the passphrase stays out of React's state, the snapshots and the caches.

Mode: YOLO. Plan, progress and thread files: `whiteboard/20261119-vault_snapper/`. Your rulings, word for word,
and the calls left to me: `vault_snapper-resolutions.md` there.

## The line, in merge order

Merge the top, #767 (this sprint's plan PR), with a merge commit, and the whole line lands. Every PR's base is `main`.

1. #768 format_string: `ThingFormat` is `'a010501'`. Postgres's `TableVersion` is the same literal, held equal to it by a test.
2. #769 car_agerank: the invariant that a listener's run never goes back; `agerank`; `bhnd`; records deep-frozen in place; the fix so a get resuming after `goodbye` then `hello` caches nothing.
3. #771 minder_feed: the feed is TanStack's event spread into ours, with decorations; `listen(listener, ThingFormat)`; the `'sok'` key head; a list or write landing after `goodbye` then `hello` caches nothing.
4. #770 vault_writes: `Vault.make`; `putBoxOnce` and `delBoxOnce`; the bank's `try*Box` verbs removed.
5. #772 bank_gatings: prompts join an open gating; `ensureUnlocked`; the four `attempt…` re-entry points; `device.lock()`.
6. #773 snapshots: `getSnapshot` and `subscribe` on the Bank and the Device; `device.sweep()` sweeps its bank.
7. #774 with_whisper: `withWhisper`, plus your rulings:
   - an unlock waits out another kind of gating;
   - `attemptUnlock` does the same;
   - no `lastRefusal`;
   - `endCause` is the error;
   - W2 goes to won't-fix;
   - a sparse newest is fetched whole.
8. #775 giver_feed: your hand edits, swept in; the bridge; the query defaults; the hooks.
9. #776 knock_knock: the end-to-end React test; the FormData finding.
10. #777 whisper_refresh: `minder.refresh(…, { silenceErrors })`, and `withWhisper`'s early refresh.
11. #767: this sprint's plan, progress, resolutions and this note.

**One check to know about:** #771's "Require a changeset" job is red. Its run compared against the base the PR had before I retargeted it to main, and reruns reuse that base. Every other job on #771 is green, and `pnpm justify` passed at each tip. It clears on #771's next push. Merging the top doesn't depend on it.

## YOLO decisions, still open in Open Matters

Each is a `drafting` row with my recommendation. The ones that change a contract:
- **Absent box:** a box never stored, or deleted, refuses `absent_box` (Wh1).
- **Late `get`:** a get resuming after `goodbye` then `hello` refuses `disabled`.
- **Late list or write:** a list or write landing after `goodbye` then `hello` caches nothing, but still answers.
- **A sparse newest is fetched whole** before a write.
- **The Once writes throw** their refusal.
- **Re-entry points answer an Outcome** rather than throwing.

## Still open

From Open Matters (each row has my recommendation):
- **TOP:** the giver makes no QueryClient yet. Your thread text says it will.
- **TOP:** any unlock action the giver ships must delete the passphrase field from FormData before its first await.
- `listingAt` is typed to take a bare `{ labelpath }`, but refuses one.
- The giver no longer follows sign-in.
- A pending bank's stage is `starting`, not `signed_out`.
- Query options are typed from TanStack, not a checker.
- A removed car leaves the host's entry in place.
- A bare car is refetched, not copied.
- Study urql's doc style?
- A double Enter queues a second FormData.
- The giver's Device wiring is cheated in the test helpers.
- The feed's raw `state.error`.
- A list answered after `goodbye`.
- `carkind` and the listing's tag on events.
- A wrong feed version refuses `bad_record`.
- Revoking a passkey that isn't there.
- A gate change refuses while another kind is open.
- `LeaseFormat` is still a number.

From Cleanup's *Finally*, owed:
- **Documentarian passes:** the minder's feed, `agerank`, `putBoxOnce`, `sealBox`, `ThingFormat`, `withWhisper`, and the giver's doc blocks.
- **Lifecycle work:**
  - a direct test of `Revseq.padded`;
  - `Bank.sweep()` dismissing the open gating;
  - a lease-expiry watcher, with `isUnlocked` checking the expiry;
  - the sweep cascade reaching a vault's minder;
  - removing the Bank's per-field getters the snapshot duplicates;
  - the cheat's stale bank snapshots, which go with startup's bank registry.
- **Small fixes:**
  - `attemptUnlock` checking its cleartexts' shape on the path that resolves ok without using them;
  - one clause in the won't-fix overlap entry;
  - STYLE.md's `shapes-enums.ts` sentence, and its exception for `withWhisper`'s early refresh;
  - a VOCABULARY row for `labelpathed`;
  - the VOCABULARY *gating* row.
