# Sprint vault_manifest: done

The new core's vaultDB now answers from a datastore's observations. Each datastore (memory,
IndexedDB, Postgres, Convex) hands back a **manifest** of one atomic step: the rows as it holds
them at the step's last read, and the comparison tags. `AdapterVaultDB` checks the manifest,
decides the act by tables (`RevisionGrid`, `MatchActs`, `StaleActs`, `GetActs`, `ListActs`), makes
the answer from it, and checks ask, manifest and answer three ways. Policy verdicts come back as
refusaltags, and one builder makes every policied refusal. "Stored" is sorted into actual, ante and
stored, and `damaged_row` is `incompatible_row`. The line was restacked onto adapter_port's
(merged as #913). `GraphQLVaultDB` became a forwarding pipe: it implements `VaultDB`, checks each
answer's form and place, and delivers the server's answer. `notes/storage-policies.md` now
describes the new core.

Rulings: `whiteboard/20261126-vault_manifest/vault_manifest-resolutions.md`. Plan, progress and
thread files: the same directory. Closer Look: `vault_manifest-closerlook.md`.

## The line, in merge order

Every PR's base is `main`; merge the top, #933, with a merge commit, and the line lands.

1. #934 manifest_things: get and write on the manifest (red in idb, postgres, convex, graphql by plan)
2. #937 manifest_rest: list, birth, world, stats on the manifest (same red)
3. #939 idb_manifest: `IdbDatastore` (red in postgres, convex, graphql)
4. #941 convex_manifest: three typed tables (red in postgres, graphql)
5. #940 postgres_manifest: one statement, one manifest (red in graphql)
6. #942 act_tables: the act by tables; one refusal builder (red in graphql)
7. #943 policy_tags: policy verdicts as refusaltags (red in graphql)
8. #944 actual_words: "stored" sorted (red in graphql)
9. #945 incompatible_row: the refusal kind renamed (red in graphql)
10. #946 sprint_tidy: doc blocks, the battery's incompatible bank, words (red in graphql)
11. #947 graphql_manifest: `GraphQLVaultDB` a forwarding pipe; the line green from here
12. #948 policies_note: `notes/storage-policies.md` for the new core
13. #933 the sprint PR: this directory and this note

## Orchestrator's calls (YOLO)

`lifepath_eq`, `MemoryDatastore`, banktok rather than the bank row, `EX.StoragePolicy` keys; a
three-way check only our code can fail refuses `unexpected_error`; thread 6 split, its tidying
became thread 10; thread 11 redone in place rather than reverted by a thread on top. Every call
left to the orchestrator is in the resolutions file, *The orchestrator's calls*.

## Still open

* **Closer Look E1**: a write under a storage policy now lands over a gate whose wayins are
  incompatible (`passkey0 = 'garbage'`, then `revoke_passkey` answers `replaced`), where it refused.
  Is "a write over an incompatible row refuses" a guarantee of the new core? If yes, the write
  manifest needs something of the ante row; if no, a `notes/wontfix.md` row.
* **Closer Look E3–E10**, unanswered: how the stack-depth complaint is measured (E3); the copy
  check re-running the answer's own expressions (E4); `answerForThrown`'s branch for a
  `rows.dbhas` no source sets (E5); a missing banktok key against a bad one (E6); `isWritable`
  living in `memory-datastore.ts` (E7); the `tracked` void rule split (E8); minor duplicates and a
  thin test (E9, E10). E2 was ruled: stands.
* **`StoreLimits` → `DatastoreLimits`**: ruled for a later thread.
* **`checkChildOfKind`** in safebyok-graphql cannot fire behind the form check; kept to mirror the
  core's `isChildLabelpath`. Drop on a word.
* **Stale pointers to `notes/storage-policies.md`**: big's `policies.ts` and
  `safebyok-postgres-big`'s `bank-functions.ts` say they follow its tables in order; the root
  README, `notes/answer-contract.md` and `notes/design-proof.md` link it while describing big.
  Left for big's removal.
* **The base-sync agent**: it kept an earlier sprint's squash against its rule; offered a fix to
  `.claude/agents/base-sync.md` (drop only a squash of the same sprint directory). Unanswered.
