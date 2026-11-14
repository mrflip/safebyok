---
"safebyok-big": minor
"safebyok-react": minor
"safebyok-convex": minor
"safebyok-postgres": minor
"safebyok-graphql": minor
"safebyok-fastkey": minor
"safebyok-indexeddb": minor
---

The core moves to `safebyok-big`, which is private while a new `safebyok` is built: import from `safebyok-big`, `safebyok-big/browser`, `safebyok-big/storage`, `safebyok-big/dom`, `safebyok-big/utils` and `safebyok-big/testing` where you imported from `safebyok`. The adapters and `safebyok-react` take `safebyok-big` as their peer dependency, which npm does not have, so hold releases until the new core ships.
