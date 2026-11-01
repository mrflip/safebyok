# Thread 5b: races of the "close that does not land" family (2026-11-01)

For the Coach, who suspected there were some, and for whoever next works on a bank's teardown. Each
was probed against the tip of #438 (a held store or deviceDB answer, one fresh bank); none is fixed
or pinned. The won't-fix itself is in `notes/wontfix.md`.

**Do not land**

1. **`closeVaults` during `ensureVault`'s fetch of a stored vault with a kept lease.** The vault is
   not held yet, so nothing closes it: it answers unlocked, held, the lease kept. `closeVault` lands
   here (locked, erased). Sign-out during a reload's first `ensureVault`.
2. **`closeVaults` during `hello`'s cache load.** The revived vault reads unlocked, held, the lease
   kept. `closeVault` lands here too.
3. **`goodbye` during `ensureVault`'s put, its fetch, or the build dialog.** The vault is held and
   unlocked after the goodbye, its lease in memory and its autolock timer armed; nothing lets it go.
   The kept lease stays, as a goodbye leaves any.
4. **`goodbye` during `hello`.** The same, and `Listing.hello` starts the vault watch after the
   goodbye; nothing ends it (one `watch`, no unwatch). `Vault.#helloBoxesOnce` guards exactly this
   for the box listing; the vault listing has no such guard. A StrictMode remount can reach it.
5. **A second `ensureVault` with no cleartexts after a close during the build dialog** joins the one
   in flight, and answers its unlocked vault. `closeVault` never declines a 'build_vault' gating.
6. **`clearCachedVault` during the first `ensureVault`'s fetch.** As the won't-fix: unlocked, lease
   kept. During the put: locked, lease gone (the second review noted its cached-copy erase is undone
   by the new vault's settle; ciphertext only, thread 8's).
7. **A stray `lock()` on an evicted Vault object** erases the kept lease while the live object stays
   unlocked in memory (the second review's; confirmed, fails safe).

**Land, but leave something behind**

8. **`closeVault` during `vault.getBox` of a held box.** The answer goes to the evicted vault's box
   listing, which holds a new Box again, its whisper a locked bag (no secret). A later box verb on
   that evicted object starts its box watch anew, which nothing ends (by reading `helloBoxes`).
9. **`closeVault` during `ensureVault`'s refetch of a held vault.** The evicted vault is gone, and
   the answer is a new instance, held, locked, the lease erased: the bank holds it after the close,
   as `closeVault`'s doc now says.

**Hold as promised:** `closeVault` during `hello`'s cache load, and during a fetch-born vault's look
for its kept lease (the evicted object answered, locked, nothing kept).
