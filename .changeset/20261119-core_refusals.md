---
---

Empty: the new `safebyok` is private, and nothing published reaches what changed. What a host of the new core will find:

- **A box sealed in a form this version does not read** still refuses `damaged_whisper`, now with a sentence of its own: the whisper was sealed in a form this version of safebyok does not read, most likely by another version, and was left as it is. It no longer advises removing the box or sealing over it.
- **A box that opens to JSON that is not a whisper** still refuses `damaged_whisper`, now by the whisper check: its message leads with "That box opened, but what was inside is not a whisper this package knows", then says what a whisper is. A box that opens to text that is not JSON refuses as before.
- **A store that reports a good act with no Thing** still refuses `storage_issue`, with a sentence of its own saying the store or its adapter needs looking at.
- **A vaultDB verb whose refused answer cannot be made** (a frozen error thrown, say) refuses `unexpected_error` with what the verb threw as its `cause`, and a sentence saying so, where it said only that this was a bug in safebyok.
- **`Lease.make` for a lease of another bank** refuses `unexpected_error`, a caller's mixup, where it refused `damaged_lease`.
- **A refusal of a malformed ask** keeps every sound field of the ask in `meta.ask`, dropping only the unsound ones, where one unsound field left `meta.ask` empty.
- **`Bank.birth` on a device swept while the birth is in flight** throws the device's refusal (`disabled`), where it resolved a locked bank. The bank is stored all the same.
- **A vaultDB's world** refuses `storage_issue` where the bank or main gate fetched beside the step is not an object, or is filed at another scope, and lets any failure that is not a refusal through; a bank or main gate that fails its checks still leaves the world null, and the step's answer stands. Before, every failure left the world null.
- **A watched Thing whose labelpath is unsound** refuses `damaged_row`, naming the field, where it refused `storage_issue`.
- **`PostgresVaultDB`'s watch** tells its `onBadNews` of a notice it cannot use, one whose carried world is not an object or whose fetch fails in a way a retry would not mend, and keeps listening, where it ended the watch. Ending it is the host's call. A carried world that is not an object used to escape as an unhandled rejection.

Nothing stored changes.
