# 2026-10-21: vault.ts doc blocks rewritten -- eight open questions

[#227](https://github.com/mrflip/safebyok/pull/227) rewrites every doc block in
`packages/safebyok/src/vault.ts`: 1005 doc-block lines become 664. The PR body lists the facts
that were dropped, for you to put back where they matter.

Open questions:

1. **`checkPassphrase` is bound.** It is an arrow-function field, like `subscribe` and
   `getSnapshot`, but the class doc said only those two were bound. The doc now says all three
   are. Is the binding meant?
2. **Calls that await no hello.** `checkPassphrase()` and `decryptWhisper()` await no first
   hello, though the doc said every call but `lock()` and `close()` does. It now says "every call
   that reads storage".
3. **`checkPassphrase` has no `try` form.** It is now listed among the throwing-only calls.
4. **Calls that work after `close()`.** `subscribe`, `getSnapshot` and `checkPassphrase` do not
   refuse `vault_closed`. Is that intended for `checkPassphrase`?
5. **`useWhisper`'s message uses the old name.** Its `bad_option` message says "use needs a
   callback function". That is behaviour, so it was left.
6. **`closedError`'s message says "handle".** It reads "This vault handle was closed". Also
   behaviour, left.
7. **Real links need a lint fix.** A link-only type import warns under `no-unused-vars`, so
   `VaultDB.putBox` and other names not already imported are plain code. Should the lint learn
   TSDoc links?
8. **Empty changeset?** I used an empty one, treating doc blocks like a README change, though
   they ship in the `.d.ts` files.
