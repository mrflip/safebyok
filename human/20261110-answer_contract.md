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

## Update, 2026-11-10, after the Coach's answers

Settled: the classifier stays in the PR; an unknown op or policy refuses `bad_record`; a vault put takes `repl` (main has it since #621) and the note's vault tables say so; `vault_full` is no act of the classifier, said in the note's *Soft caps* and by the act list; step 7 of the precedence is reworded.

Still open: a del that expects nothing (C8 against C13); a damaged box row of another vault life (damaged before leftover, as built); the `=next` row of the comparison table (a correction proposed in chat, not applied); C14 answering `*_clash`.

CI: the run test timed out at 5s under coverage (46,053 runs, each request classified twice). Now runs of four, classified once: 110 ms under coverage here.

## 2026-11-11: bare acts, damaged rows thrown, and the vault gate by the Coach's table

PR [#623](https://github.com/mrflip/safebyok/pull/623) was rewritten as five logical commits and force-pushed.

- **Acts over the row asked for are bare**, for a box and a vault alike: `void`, `gone`, `camped`, `dubdel`, `stale`, `retcon`, `clash`, `forked`, `ahead`. A box op's acts for its vault keep the prefix: `vault_void`, `vault_gone`, `vault_reborn`, `vault_full`.
- **A row that fails its checks is thrown**, and is no act: `damaged_row` for the row asked for, `damaged_vault` (a new refusal kind) for a box op's vault.
- **The vault gate follows the Coach's table**: any vault tombstone is `vault_gone`, and a live vault under another `vault_tok` is `vault_reborn`. `vault_mismatch` is no act of the classifier.

Open, for the wiring thread:

1. `vault_mismatch` is a wired refusal kind, named in 18 files. Wiring the classifier in either renames it `vault_reborn` or maps the act onto it.
2. The wired act lists (`gotActVals`, `putActVals`, `delActVals`) still have ok acts `gone` and `void`, which the classifier refuses with. They go with the wiring.
3. Requiring `ifAbsent` and `ifPresent` at the vaultDB's verbs is still unsettled (the PR's open question 4).
