# Sprint vault_snapper: done (2026-11-20)

The sprint built the React giver backwards from what a React developer wants, onto the new `safebyok` core, then
rebuilt its gatings as plain form verbs.
- **The minder:** its feed moves only forward. Each event is TanStack's own, spread into ours, and each car carries a
  fixed-width `agerank` the host's cache shares by. Its gets and lists come in try/throw pairs, and
  `backgroundRefresh` is its one background get, swallowing every refusal.
- **The Vault:** `putBoxOnce` and `delBoxOnce` write boxes, and `withWhisper` lends a whisper, refreshing the box in
  the background before it unlocks.
- **The Bank's gatings, by forms:** `birth`, `unlock`, `replacePassphrase`, `addPasskey` and `revokePasskey`, each a
  try/throw pair (`models/gating.ts`, imported as `Gatings`). One proof by any way in counts as an unlock; a
  `stale_write` never does. `ensureUnlocked` waits on one shared unlock that a form's `unlock` settles and
  `dismissUnlock` rejects. The Gating class, the prompts, the re-entry verbs and the Device's open gating are gone.
- **The Cloak:** a form hands `cloak({ ... })` to the giver's mutation, which vacates it on settle. Nothing deletes
  fields from a host's object.
- **Lifecycle:** a bank's sweep, lock or delete sweeps its vaults and drops what it holds; the device stays, and
  sweeps and locks every bank made on it.
- **Snapshots:** the Bank and the Device offer `getSnapshot()` and `subscribe()`; the Device serves `PendingBank`
  until it holds a bank. The giver copies the minder's feed into the host's React Query under the minder's keys.
- **End to end:** a React 19 test unlocks a bank from a form, and proves the passphrase stays out of React's state,
  the snapshots and the caches.

Mode: YOLO, then a design session with you from thread 11 on. Plan, progress, the gating design
(`gating-forms.md`) and thread files: `whiteboard/20261119-vault_snapper/`. Your rulings, word for word, and the calls
left to me: `vault_snapper-resolutions.md` there. The Closer Look, as it stood: `vault_snapper-closerlook.md`.

## The line, in merge order

Merge the top, #767 (this sprint's plan PR), with a merge commit, and the whole line lands. Every PR's base is `main`.

1. #783 logical_core: everything but the gatings, re-sliced from #768 to #782 into logical commits with no
   take-backs. safebyok-postgres's vault tables change (`fmt` becomes `text`): a database built with the old column
   drops and recreates its vault tables.
2. #791 gating_squash: the gatings by forms, the awaited unlock, the Cloak and the giver's form mutations, as they end
   up; then the gating-word rename, your two gating invariants, and the double-submit doc line.
3. #792 life_squash: the lifecycle cascade, as it ends up; then the documentarian's pass over the line's doc blocks,
   `oneProofOf` taken from safebyok-big, your short VOCABULARY entries, and `isUnlockWanted`.
4. #767: this sprint's plan, progress, resolutions, design notes and this note.

Superseded, left as drafts for their history (the SHAs in the thread files point into them): #768 to #782 (the first
line), and #784 to #789 (the gating work as it was built, with its take-backs).

#787, the *Hours separate updates* rule (`#no-slop-crossings`) and security.md's amendment-line header, stands alone
on main.

## Still open

Yours, already scheduled:
- Unsetting references after a sweep, and what the Device's snapshot shows once the bank it shows is swept (your new
  session).
- Restarting the minder after a sweep (another session).
- The rest of the Closer Look.

Later, by your calls:
- The bank observes its own stored gate after a `stale_write`.
- Signing out other devices, through a watcher.
- A v1.1 could make "one proof counts as an unlock" the customer's choice.

Worth a sentence each:
- `#madeBanks` holds every Bank made on a device until the device sweeps. In practice that is one bank; that a host
  sweeps what it makes is written nowhere.
- The changesets written before the rebuild describe the threads as built, not the line as it ends up. Left as they
  are, per your "leave be".
