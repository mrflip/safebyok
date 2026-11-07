---
"safebyok-graphql": patch
---

**A revoked session stops hearing its bank.** The `safebyokHeard` subscription asks `userIdOf(context)` again at each change it would send, and ends, its watch released, once the answer is no longer the user it subscribed as; a `userIdOf` that throws then ends it with `unexpected_error`. Revocation reaches an open stream only through a `userIdOf` that looks the session up live, and an idle stream stays open until its next change.
