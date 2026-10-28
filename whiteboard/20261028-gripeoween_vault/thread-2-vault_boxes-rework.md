# Thread 2 rework: why the landing check, and the extra probes (2026-10-28)

For the reviewer of d53be040 and for thread 3, which reshapes the gating tools. The thread file
`thread-2-vault_boxes.md` says what was built.

* **Decisions taken**:
  * **The follow-up alone does not fix the probe.** The put's own ring starts a read before the
    put lands, and that read is served after the store applied the put. Then the delete lands
    during it. Only a check that knows about own landings tells this read from a stale one. With
    the follow-up but no landing check, the probe, both race tests and "checks the limit on a new
    box only" fail. That last fails as `vault_full`, because a stale listing brought a deleted box
    back.
  * **A landing check, not a counter.** Ignoring every read a landing overlapped also dropped the
    fresh read rung by the write itself. `refresh()` joined it, so "clears the trouble once a read
    finds nothing amiss" failed. Re-reading until no landing overlaps doubled the reads per box
    write. Comparing the listing with what landed ignores only a read that contradicts the write.
  * **Hellos keep sharing.** Contract row *vault.hello, Does 1* ("hellos called while one is under
    way share its one read"), along with four more tests, pins that. So only rings follow up.
  * No dependency owns "run once more if called while running". es-toolkit's `debounce`,
    `throttle` and `Mutex` are timed or queue every call. `oneAtATime` already existed; its one
    caller is the vault.
* **Discoveries** (the extra probes, scratch only):
  * A put over a box written elsewhere, at once and with the watch's read held across the put: it
    lands over theirs (a partial put reads the stored base). The snapshot shows the stored revision
    at once and after.
  * `putWayin` here, then `getWhisper`, `putBox`, `delBox`: all land, and the listing is right at
    once and after. `there` locks: the gate moved. A `putWayin` elsewhere followed by a `putBox`
    here: 'vault_locked', listing unchanged. Wayin writes raise epochs, so `isOlderPicture` already
    covers them.
  * The order matters in one edge. Suppose storage applies this put and then another device's
    write. That device's ring starts a read, and this put's answer lands during it. The read
    shows theirs, disagrees with the landing, and is ignored. So the snapshot shows this put until
    the next ring or stale hello. That needs a network store whose answer is slower than a whole
    other write and its ring.
  * `TH.readAfresh` (two `refresh()` calls) is still needed: `refresh()` joins.
  * gating.ts's doc says "through the refresh join"; it still joins. Left for thread 3.
