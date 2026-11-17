# Thread A4: Contract drift

For the orchestrator and the Coach, carrying rulings into the Contract tab: where [thread A4](thread-A4-try_twins.md) found the tab silent, or saying less than the code now does. Built to the Contract as written, or to the handoff's Recs where it was silent.

1. **`tryClose()` answers at once.** *Shapes*, "Two forms of every call", says `tryX` resolves.
   Propose, in the `Vault` block: `tryClose(): Outcome<void> // at once, never refused; close()
   likewise returns nothing`.
2. **A throw that is no refusal.** *Shapes* says nothing is thrown past the boundary but not what a
   bug becomes. Propose, after the `VaultError` block: "A throw that is no `VaultError` becomes
   one. Where your storage adapter's own code threw, it is `storage_unavailable`, the throw its
   `cause`: a driver's failure and an adapter's bug look alike. Anywhere else -- safebyok's own
   code, or a function you handed it, such as a key deriver, a strength checker or a passkey maker
   -- it is `unexpected_error`, family `misuse`, the throw its `cause`, never logged: fix the code,
   never retry." And a row in the *Refusals* table: `unexpected_error | misuse | a bug, in
   safebyok or in a function you handed it`.
3. **`outcomeOf(thunk, otherwise?)`.** Propose, in *Making and unmaking*: "`outcomeOf(thunk,
   otherwise?)` ... a throw that is no VaultError becomes `storage_unavailable`, or what
   `otherwise` makes of it (`unexpectedError`, for a body that calls nothing a retry could mend).
   `valOf(outcome)` is its inverse: `val`, or `throw err`, as a VaultDB wrapping another must hand
   on each answer."
4. **A wrapped answer from a `do*` hook.** VaultDB block: "A `do*` method that answers with an
   `Outcome` still wrapped is refused as `bad_option`: unwrap with `valOf`."
5. **`subscribe` throws.** Vault block: `subscribe(listener): () => void // throws bad_option at
   once for a listener that is no function: no try form`. VaultDB block likewise, with
   `identity_revoked` or `storage_unavailable` from a watch that will not start.
6. **`hello` as a handler.** *vault.hello*: "An event in place of `opts` -- `hello` itself the
   handler, `addEventListener('focus', vault.hello)` -- is ignored."
7. **`getWhisper` and `useBox`.** The `Vault` block has no `useBox`; the code keeps it, throwing
   alone, its callback's throw passed through as it came. Propose either a line for it or its
   removal at C4, where `getWhisper` covers it.
8. **Bad news told once, whichever form.** *Guarantees*, "Bad news is told once": add "whether
   the call was made as `tryX` or `X`".
