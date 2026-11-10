# 2026-11-10: Answer contract -- the note, a classifier and its tests; open questions

Thread `20261110-answer_contract`. The note `notes/answer-contract.md` is swept in from the base
checkout with the Coach's hand edits. `storage/classifier.ts` is new: `boxActOf` and `vaultActOf`
name the one act a get, put or del amounts to over the rows stored. Nothing calls it yet and no
entry point exports it.

Open questions, as in the PR:

1. **Scope.** "Write tests" needed something to test, so the classifier is in this PR, unwired.
   Say so if you wanted the tests alone, against something else.
2. **`bad_op` has no refusalkind.** An unknown op or policy refuses `bad_record`, with every other
   request flaw.
3. **A del that expects nothing keeps the void row's life tok.** C8 (a del keeps its row's life tok)
   and C13 (no proposed tok is the void row's) together would make that del unaskable, and the
   table answers it `box_void`. C13's life-tok rule is held to puts.
4. **C14 answers `box_clash` / `vault_clash`**: the same mechanism as a tok cited at another seq.
5. **A vault put with `repl` answers `replaced`**, as main's `putVault` allows. The note's vault
   table still says a vault put has no `repl`.
6. **A box row that fails its checks is `box_damaged` even where its `vault_tok` is another life's.**
   Leftover-before-damaged is unruled.
7. **`vault_full` is not classified**: the count is no input, as *Soft caps* says.
8. **The run test is exhaustive to five requests**, with no random source and no new dependency.
9. **Note, step 7.1** says "a current or future live row"; a later revision refuses `box_ahead`
   in the table, so "future" is probably "earlier".
10. **Note, the `=next` row of the comparison table** still contradicts the rows above it.
11. **Note, the housekeeping carve-out**: your sentence stopped at "designed to remediate an"; it
    now ends "a state the primitives cannot mend".
