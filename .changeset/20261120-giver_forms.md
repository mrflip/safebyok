---
---

Empty: the giver is on no published entry. In safebyok-react's giver, `useGating` is gone, and the forms come through React Query: each form verb of the bank (birth, unlock, replacePassphrase, addPasskey, revokePasskey) has a `…MutationOptions()` and a thin hook (`useUnlock()` and so on), `dismissUnlock()` closes the awaited unlock, and `useStrengthVerdict()` gives a live meter over the Device's strength checker. A host renders its unlock form while `useBankSnapshot((snap) => snap.unlockWanted)` is true. Each form mutation hands the verb the object given to `mutate`, as it came, and never retries (a form verb is the user's to repeat); React Query keeps that object, its cleartexts included, as the mutation's variables until the mutation is collected.
