---
"safebyok-big": minor
---

**A box's sidecar is no longer sealed with its whisper.** Storage, or anyone who can write it, may change a sidecar and the box still opens: the sidecar is readable and writable on the server, and not authenticated. The whisper and the box's other stored fields are bound as before. A field the server should read but must not change unnoticed goes in both the whisper and the sidecar, and the app compares the two once the box is unsealed.

Every box written before this release was sealed with its sidecar, so its whisper no longer opens: it refuses as `damaged_whisper`. Its sidecar and the rest of its record still read. Put the box again with its whisper to reseal it.
