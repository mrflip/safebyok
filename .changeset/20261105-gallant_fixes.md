---
"safebyok": minor
---

**A strength checker that misbehaves is refused one way.** A blank passphrase is now weak before the host's checker hears it. A checker that throws refuses `unexpected_error`, and one that answers no verdict refuses `bad_option`, as before, with reworded messages; a bank with no checker answers the default verdict's reason. A `Bank`'s logger is guarded, so one that throws breaks no call. **`RefusalMeta`** loses `stored_revision` and `staged_revision`, which nothing set. **Stored format:** unchanged.
