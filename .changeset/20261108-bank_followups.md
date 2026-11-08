---
"safebyok": minor
---

**`DefaultOnPanic` also logs.** It tells the bank's logger of each panic at error, with the refusal's message, its `refusalkind` and `call: 'Bank.onPanic'`, as well as handing the refusal to the platform's `reportError`, so a panic in Node or during SSR, where there is no `reportError`, is no longer lost. A disabled bank's panics are logged the same way.
