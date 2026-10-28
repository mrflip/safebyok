---
"safebyok": patch
---

A validator's parse takes a story, `parse(val, { where, advice })`, framing its refusal with where the input was judged and what to do; the nine checks that caught a refusal to rethrow it re-framed (the bag naming a vault, Bank.make's and bank.ensureVault's options, optionsCheck, hello's staleMinutes, ensureUnlocked's renewMinutes, localVaultDB's options, the IndexedDB adapters' dbName) now say so in their one parse. Every message a host sees reads as before. A Zod parse context handed to a validator's `parse` as its second argument, which it ignored before, now refuses 'bad_option': that argument is the story.
