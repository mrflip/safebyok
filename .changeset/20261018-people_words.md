---
"safebyok": patch
"safebyok-react": patch
---

What an end user reads for discarding a vault now says remove: safebyok-react's start-over dialog asks "Remove this vault and start a new one?" and confirms with "Remove and start over" (`Messages.startOverQuestion`, `Messages.startOverConfirm`), and the README's sample confirm() says the same. A host matching on the old "Erase" text, as a test might, matches on "Remove" now. The vault's warning for a lease it could not read or open now says the lease was discarded, not revoked: a lease is revoked only by a lock.
