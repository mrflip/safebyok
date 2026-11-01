# Thread 11: refusal rulings (2026-10-19)

Branch `20261019-refusal_rulings`, PR [#185](https://github.com/mrflip/safebyok/pull/185), stacked on [#184](https://github.com/mrflip/safebyok/pull/184). Justify: green (core 2230 passed,
35 skipped; graphql 252/14; postgres 260/14; convex 267/8; indexeddb 142/10; react 230; fastkey
49; demo 196/16; e2e 86/94; scripts 265). Size budgets unmoved.

* **Built**:
  - *"Nothing was removed"* (ruling 1): `checkOutgoing` in `packages/safebyok/src/vault-db.ts`
    takes what a refusal spares, `written` or `removed`; `retireBox` and `retireVault` pass
    `removed`. The `bad_record` message now leads with it: "Nothing was removed: that retire
    expectation is not one this package builds. Hand a VaultDB only the records and expectations a
    vault builds." Writes lead "Nothing was written: ...", for parallel reading.
  - *bad_record for a record its label spoils* (ruling 2): `fetchOrCreateVaultProps`,
    `updateVaultProps` and `updateBox` run `checkOutgoing` on the record before `heldScope` /
    `heldBoxlabel`, which now see only names that passed the floor and check the backend's
    `maxNameBytes`. `LabelledBox` (the boxlabel-first pre-check) is gone. So no lockbox at all, a
    lockbox whose boxlabel is below the floor, and vault props whose applabel, user_id or
    vaultlabel is below it, are `bad_record`. The README's `bad_record` row, `VAULTDB.md` *Names*
    and the `validators.ts` table say so.
  - *GraphQL* (ruling 3): `graphqlVaultDB` refuses as `bad_record`, before sending, a record or
    expectation whose `Int!` field (`unlock_epoch`, `vault_key_epoch`, `whisper_schema_version`)
    is past GraphQL's 32-bit `Int`, which the core's safe-integer check admits (`checkInts`, from
    the review). Otherwise no change of kind; the doc block, a running comment, the README and
    tests show that a record at fault is `bad_record` (refused before it is sent, or crossing from
    the server by its kind). See *Decisions*.
  - *notes/security.md* (item 4): "a new public field" is "a new snapshot field", by a `sonnet`
    subagent, its own `docs:` commit.
* **Decisions taken**:
  - *What stays `bad_label`*: a name a verb is handed on its own (a boxlabel to `readBox` or
    `retireBox`) or as a scope argument (every verb's `scope`, `updateBox`'s included), since
    those checks validate only labels; `storeBox()`'s boxlabel (a label, checked by the vault's
    validators); `Ckeys` joining a name holding `^` (memory/IndexedDB DeviceDB, a check of names
    only, and unreachable from a vault, whose floor forbids `^`).
  - *A name over `maxNameBytes` stays `bad_label`, even inside a record.* It is a fact of the
    backend, not a fault of the record: a vault builds such a lockbox when its validators admit a
    boxlabel longer than, say, Postgres's 640 bytes, and `storeBox()` meets it only at `updateBox`.
    `bad_record` would tell the host "a bug in a hand-built record", and lose the message's
    "choose a shorter boxlabel". The `validators.ts` table already filed it under the storage's own
    limits, as `bad_label`.
  - *GraphQL keeps `bad_option` for `BAD_USER_INPUT`.* The client could tell which variable was
    refused (graphql-js puts `Variable "$lockbox"` in the message, and a location in the
    document), but the record is never at fault there: `graphqlVaultDB` is a `VaultDB`, so every
    variable has passed the base class's checks and `checkInts` before it is sent, and those are
    the checks the server's own VaultDB makes, which refuse as `bad_record` and cross by kind. A validation error
    therefore means the server serves another schema version, `bad_option`'s case.
* **Discoveries**:
  - Through a vault, none of this is reachable: the vault checks every name at its entry and
    builds only sound records. The kind change reaches a host calling a VaultDB directly, which
    is mostly a server (the GraphQL resolvers, a Postgres route).
  - The `describeVaultDB` battery's floor tests (`tests/test-helpers.ts`, lines 4.x and 5.1) now
    expect `bad_record` for a record and `bad_label` for a name; every adapter passes.
* **For the Coach**: the two decisions above (byte limit in a record; GraphQL) are the Open
  matters in the PR.
