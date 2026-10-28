---
"safebyok": minor
"safebyok-postgres": minor
"safebyok-indexeddb": minor
---

**`StoredBox.box` is typed as what a row should hold.** The type an adapter hands `splitStoredBoxes` for each box row had `box: unknown`; it is now the input of a box record or a sparse box, so the type says what a row holds. A storage adapter's `doGetVault` and `doEnsureVault` cast the row once where they read it from storage (`box: row as StoredBox['box']`), and `splitStoredBoxes` still judges the row, listing one that is not a box as damaged. An adapter typed over `Infer<typeof BoxSparse>` or the like needs no cast. `StoredVault.vault` stays `unknown`. The packaged adapters (local, postgres, indexeddb) do this already.

**One bank refusal says less.** A bag naming another `applabel` or `user_id` than the bank's, or a thing handed to `bank.demandConsistentWith` that carries one, refuses `bad_scope` as before, its message now "This names another <fields> than the bank's, which serves one app and one signed-in user. Use the bank of the app and user it belongs to." A host branching on the kind or on `meta.fieldnames` sees no change. A bag that fails its own check refuses as before, its message led by where it was judged and ended by what that bag takes.

**Stored format:** unchanged.
