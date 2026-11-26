# Thread 12: policies_note (2026-11-26)

Branch `20261126-policies_note`, PR #TBD, stacked on #947. Proved: pending.

* **Built**: `notes/storage-policies.md` rewritten for the new core: the three gate policies' tables, row for row with
  `GatePolicies` (`packages/safebyok/src/storage/policies.ts`) and Postgres's `*_refusal` functions; where a policy is
  judged (the datastore, in its one atomic step, against the ante row; `ManifestTags.policiesOf`/`policyVerdictOf` for
  memory, IndexedDB and Convex; `policies_of`/`policy_verdict_of`/`policies_met` in Postgres; GraphQL remaking tags
  with `ManifestTags`); what `AdapterVaultDB` makes of the verdicts (three-way check, `policied`, `taggedRefusal`,
  `RefusalkindForRefusaltag`, `PhraseForRefusaltag`); what the policies do not check. It points to
  `notes/vault-adapter-contract.md` (*The tags*, *The write predicate*) for the contract. Big's description is gone.
* **Decisions made**: rows renumbered (RP1-2, AP1-3, RK1-3) without big's `registered_at` row, so each table matches the
  code exactly; the born_at check appears once, as "a write that also changes the gate's `born_at` is refused
  `bad_record` instead", which is what `refusaltagOf` does. The capacity-check line is dropped: the new core has no
  capacity policy. The entry refusals (a policy on a bank, box or del; `replace_passphrase` without a cited `main`) are
  named in the intro, since a reader of the note would otherwise look for them in the policies.
* **Deviations**: two code comments changed, comment only: `policies.ts`'s header and the SQL comment above the
  `*_refusal` functions in `vault-functions.ts` no longer say "less big's registered_at row", since the note's tables
  now have none. VOCABULARY's **options** row: a policy "decides whether a write may replace a live Thing", where it
  said "governs whether or how an operation may proceed" (no policy governs how).
* **Discoveries**: big's own comments (`packages/safebyok-big/src/helpers/policies.ts`,
  `packages/safebyok-postgres-big/src/bank-functions.ts`) still say their lines follow this note's tables "in the same
  order"; with big's registered_at row gone, that is no longer true of big. Left as is: big is frozen. Pointers to this
  note from the root README (big's `putGate`), `notes/answer-contract.md` and `notes/design-proof.md` describe big or
  older designs and were left alone.
