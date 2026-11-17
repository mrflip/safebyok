---
"safebyok-convex": minor
"safebyok-fastkey": minor
"safebyok-graphql": minor
"safebyok-indexeddb": minor
"safebyok-postgres": minor
"safebyok-react": minor
---

The refusal kind `bad_option` is merged into `bad_record`. Every refusal that was `bad_option` is now `bad_record`: an option, an argument or a record handed in that fails its check. `Refusalkind` and `refusalkindVals` no longer have `'bad_option'`, so a host that matched on `bad_option` matches `bad_record`. Its family is `misuse`, as before. In `safebyok-graphql`, the schema's `refusalkind` enum loses `bad_option`. In `safebyok-convex`, a refusal inside the component that was `bad_option` did not cross to the client as a `ConvexError`, and now does, of kind `bad_record` and with the core's message. The stored format is unchanged.
