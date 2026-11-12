# Sprint bank_world: the threads

Issued by the Coach, 2026-11-12, for `/sprint`. Seventeen threads that move safebyok from a gate
per vault to one gate per bank. `sprint_name` is `bank_world`.

Three files, in `whiteboard/20261112-bank_world/` of the base checkout, uncommitted there:

* `threads.md`, this file: what each thread does.
* `design.md`: what they build to. A handoff quotes it by section.
* `rulings.md`: the Coach's twelve rulings and the argument behind each. Open it only to settle
  what a ruling meant.

Orchestrator: carry all three into the sprint's directory with your first `plan:` commit. From
then on the sprint branch's copies are the ones to read and to correct.

## Read first

* `design.md`, by section. Every thread: *Names*, *Scopes*. The storage threads (3, 4, 5, 13, 14,
  15): *Stored rows*, *BankDB*. The model threads (6, 8, 10): *The models*. A thread that touches
  a lease, a stamp or a ctx (8, 9): *Keys, stamps and each ctx*.
* `notes/answer-contract.md`, *Adapter contract*, for the storage threads.

## Ground rules

The first three are the Coach's own, and matter most.

1. **The finished code is no more complicated than what it replaces.** This line moves facilities
   that exist (a gate, a lease, a lock, a listing's delivery) from the vault to the bank. It adds
   none. Nothing in `design.md` calls for a concurrency device the code does not have today: no new
   counter, timer, abort controller, join, queue, lock or retry. While a facility is moving it may
   stand in both places for a thread or two; once the line is whole there is no net gain. If a
   piece seems to need more machinery than its counterpart has today, the design is probably wrong
   there: say so in your report, and build the plain version.
2. **Races and edge cases: report and move on.** Carry over the handling a race or an edge case
   has today, in the place that corresponds. Do not handle one that today's code does not handle.
   And where one that is handled today turns out harder to handle in its new place, do not solve
   it either. In both cases write it under your report's *Open matters* (what it is, where, and
   how it could come about) and carry on with the thread.
3. **Reviewers, the same.** Weigh a finding about a race or an edge case by how likely a real
   code path is to reach it. Where that is in doubt, it is an *Open matters* item to come back
   to: it is not fixed in the review, and it does not flag the thread. A finding whose fix would
   add machinery (rule 1) is an *Open matters* item however likely it is.
4. **`design.md` is pseudo code.** Where it cannot be built as written, or building it shows it
   wrong, build what is right and say so in the report; the orchestrator corrects `design.md`.
5. **Ctx and stamps are built to the table in `design.md`**, which the Coach ruled. If a row of it
   cannot be built as written, do not improvise a ctx: leave that piece, finish the rest of the
   thread, and report it.
6. **Read a failing lease or ctx test against `design.md`, *Which token changes when*, first.**
   There are three candidates for what a thing should cite: the gate's `gate_tok`, the gate row's
   `revision_tok`, and the bank row's `revision_tok`. If the fix is to cite a different one than
   the table says, make it and report it, with the test that asked for it.
7. **A second gate is not being built.** The stored row carries its label so that one could come
   later without a migration, and that is the whole accommodation: `gatelabel` and `gates` check as
   `main`, and a gate's wayins as `main` and an optional `passkey0`. There is no list of gates, no
   loop over them, and no call that adds one. `auth`, `sigs` and `meta` are checked as empty bags,
   and nothing reads them.
8. **A bank and a gate each get a stub listing class**, `BankListing` and `GateListing`, because
   `Storable` wants a listing. Use what `Listing` already gives them, its delivery of a row
   included. Nothing in the design contemplates extending either: a member `Listing` leaves for
   the concrete class is written as plainly as it can be, and there is no `bank.gates` and no
   `device.banks`. If a stub starts to want real work, that is worth a line in the report; the
   Coach's fallback is a subclass `Listable`, for `Vault` and `Box`.
9. **`life_tok` is watched, not built** (`design.md`, *Watched for, not built*). If a thread meets
   something for or against it, the report says so.
10. **Copy, then edit, where a new file is mostly an old one** (the adapter base, the in-memory
    adapter, the battery): the verbatim copy is a commit of its own, so the next commit's diff
    shows what changed. Say in the copy commit's message that it is one. Where little of the old
    file would survive, just write the new one.
11. **Scaffolds, and the thread that removes each.** These are meant to be there; a review need
    not raise them. A thread that leaves another says so in its report.
    * `VaultDB`, `AdapterVaultDB`, `MemoryVaultDB`, `IdbVaultDB` and their shapes stay exported
      beside `BankDB`'s from thread 3 until thread 16. The server adapters and e2e keep running on
      them until threads 13 to 15 move each.
    * `Vault`'s `isLocked`, `isUnlocked`, `lock`, `ensureUnlocked`, `unlock` and its three wayin
      prompts stay from thread 8 as one-line calls of the bank's or its `maingate`'s, with
      `VaultSnapshot.isLocked`, until thread 12.
    * A Vault object stays one life per instance, and things keep their own enabled flags, from
      thread 8 until thread 10.
12. **Stored shapes.** A changeset for a thread that changes one says what a host sees: an old row
    reads as damaged or absent, and a host with data wipes it or moves it by hand. A record's `fmt`
    moves once for the renames (thread 1) and once more where a later thread changes its shape.
13. **Names in the cast** (a stored field, an exported type or verb, a refusal, an act) are
    `design.md`'s, *Names*, and VOCABULARY.md gains or loses each in the thread that does. One the
    design lacks is chosen by the thread and reported. Say `gate` of the `Gate` class and its cast,
    not of the checks a call passes first.
14. **The ordering of startup is put off by the Coach.** `device.ensureBank()` is the one startup
    call. A fetch without a build, a hello sequence, and a policy for when to ask the user are not
    designed in this sprint.

## The threads

Levels are suggestions. *After* names what a thread depends on.

```text
1 ── 2 ──┬── 3 ── 4 ── 5 ──┐
         └── 6 ── 7 ───────┴── 8 ── 9 ── 10 ── 11 ── 12 ──┐
                                                          ├── 16 ── 17
                   4 ──┬── 13 ────────────────────────────┤
                       ├── 14 ────────────────────────────┤
                       └── 15 ────────────────────────────┘
```

The three server adapters (13, 14, 15) need only thread 4. The Coach, 2026-11-12: they "can be
done any time after bankDB is implemented if the supervisor has idle brain space". So they are
filler: start one when a slot is free and nothing on the main line is waiting for it. Two things
follow. A correction to the contract found by thread 8 is then also made in whichever adapters
have moved. And thread 9's rename reaches whichever have moved by then; one that moves after it
is written with the new names.

### Next thread: 1 `banklabel`

`applabel` becomes `banklabel`, and `user_id` goes before it. Behaviour is unchanged.

* The name: each package, the demo, e2e, stored fields, SQL columns, Convex fields, the GraphQL
  schema, React props, READMEs, VOCABULARY.md.
* The order: a scope is `user_id`, `banklabel`, then the rest. That is the field order of each
  scope shape, each scopepath (`vault^u1^acme^main`), the `LeaseScopepath` tuple, each SQL primary
  and foreign key, each Convex index, and each signature that takes the two side by side.
* `fmt`: box 5002, vault 6002, lease 7002.

After: `origin/main`. Suggested: `sonnet`, a `low` review. About 480 references in 90 files; the
order is the part a search does not find.

### Next thread: 2 `device_row`

Two renames on the device's side. Behaviour is unchanged.

* The deviceDB's "bank row" is the device row: `ensureCachedDevice`, `forgetDevice`,
  `listRawDevices`, `DeviceRow`, each `try*` and `do*` form, and the IndexedDB shelf that keeps it.
  Storage is about to have a bank row of its own, and the two should not share a name.
* `device_id` is `device_tok`, in options, props, the wayin's header, the device row and React
  (`useDeviceId`). It is in a wayin's ctx, so `tests/models/ctx-bytes.test.ts` changes on purpose.
* VOCABULARY.md: the *deviceId* and *device record* entries, and the paragraph on `_id` and `_tok`,
  where `device_id` stops being an example of an `_id`.

The host still hands `device_tok` to `Bank.make` here; thread 6 ends that.

After: thread 1. Suggested: `sonnet`, a `low` review. About 290 references.

### Next thread: 3 `bankdb_shapes`

The `BankDB` contract's shapes and classifier, in the core, beside `VaultDB`'s. Only tests call
them yet.

* The rows of `design.md`, *Stored rows*: a bank row; a gate row with `gatelabel`, `bank_tok`,
  `gate_tok`, a `wayins` bag keyed by `wayinlabel`, and the three empty bags; a vault row with
  `bank_tok` and no gate (`fmt` 6003). A box row is the one `VaultDB` has: reuse its shapes.
* An ask for each of the fourteen verbs of *BankDB*, and answers that carry the row above as
  `parent`.
* The classifier for bank, gate and vault asks: *The row above*, and *The gate verbs' policy* row
  by row, `buildBank`'s two rows and `delBank`'s cascade among them. Box asks are classified as now.
* `notes/answer-contract.md`: tables for the bank and the gate, and the row above.

A wayin keeps `vault_key_wayin_wrapped` until thread 9. These shapes have `gate_tok` and no
`gate_epoch`.

After: thread 2. Suggested: `opus`. Look-ahead: thread 4 builds the adapter base on these, and
threads 13 to 15 answer to the policy table from inside their databases, and may start as soon as
thread 4 files.

### Next thread: 4 `bankdb_adapter`

The `BankDB` interface, its adapter base and its in-memory adapter.

* `BankDB`, with each verb's `try*` form, its brand and its verbnames.
* `AdapterBankDB`: each public verb checked at its entry and classified, over `do*` calls a
  subclass writes, in the manner of `AdapterVaultDB`. Report the `do*` list you settled on: three
  adapters implement it later, and Postgres and Convex will want to run a gate verb's policy
  inside the database.
* `MemoryBankDB`.
* The battery an adapter runs to show it conforms, from `tests/test-helpers/vault-db-battery*`.
* The validators a client parses each answer with over a wire, and the exports.

After: thread 3. Suggested: `opus`.

### Next thread: 5 `bankdb_idb`

`IdbBankDB` in `safebyok-indexeddb`, beside `IdbVaultDB`, passing thread 4's battery. The demo
needs it at thread 8.

After: thread 4. Suggested: `sonnet`.

### Next thread: 6 `device_owner`

The `Device` of `design.md`, *The startup gap*, split out of today's `Bank`, on today's storage.
The bank still has no row, so nothing is built or fetched for it yet: this thread settles who owns
what, and the surface a host and `safebyok-react` see. It is a move of what `Bank` does today, not
a redesign of it.

* To the `Device`: the options and their check, the guards on the host's functions, the bad news
  and lifecycle calls, the panic, `isEnabled`, `sweep`, `vacate` with its forgetting of leases and
  of the device row, the one open gating (from the vault listing), and a snapshot with the bank's
  or null.
* `Device.make(opts)` checks its options and does no I/O, as `Bank.make` does today.
  `gates: ['main']` is a required option, not used until thread 8.
* `device.ensureBank()` ensures the device row (`deviceDB.ensureCachedDevice`), then makes the
  Bank and brings it up as `bank.hello()` does today. `device.bank` is null until then and after
  a sweep or a vacate. The `device_tok` option goes.
* The `Bank` keeps its scope, its vault listing, `ensureVault`, `vaultAt`, `lock`, `autolock` and
  the probe. A host no longer calls `Bank.make`: a Device makes its Bank.
* `safebyok-react`: the provider makes a Device; `useBank()` answers a Bank or null as now;
  `useDeviceId` goes; `BankProvider` fills in `gates`, so a host does not pass it. The demo and
  the READMEs' first example follow.
* `notes/guarantees.md`: the paragraph on the three host functions, now wrapped in `Device`'s
  constructor.

After: thread 2; beside threads 3 to 5. Suggested: `opus`, a `high` review.

### Next thread: 7 `plain_del`

Two small things on today's storage, before the switch.

* Deleting a vault asks nobody (R5: "if you're logged in you're logged in"). `vault.del()` is
  `Storable`'s, under an unlocked vault; `delVaultPrompt`, the `del_vault` gatingkind, its
  cleartexts and its act go; `safebyok-react`'s del-vault modal is a plain confirm.
* `vault.hello()` is `vault.beginWatch()`, with its `try*` form.

After: thread 6. Suggested: `opus`.

### Next thread: 8 `bank_gate`

The switch: the models move from `VaultDB` to `BankDB`, and the gate, the lease and the lock move
from the vault to the bank. It is the largest thread. I found no smaller cut that stays green; the
scaffolds of ground rule 11 are what keep it to one thread. Nearly all of it is today's code in a
new home: where a piece has a counterpart in `Vault`, `VaultListing` or `gating.ts`, move that
counterpart and change what it must, rather than writing the piece again.

What it contains, in an order that has worked on paper; take another if the code suggests one:

1. **The test helpers** of `tests/test-helpers/`, re-pointed, so the suites of unlocking, wayin
   changes and leases keep running, through the Vault's scaffold calls.
2. **`device.ensureBank()`** asks `bankDB.ensureBank` with `gates: ['main']`. Where no bank is
   stored it launches a `build_bank` gating, whose act proves the new passphrase (and passkey, if
   given), makes the bank record and its main gate record, and calls `buildBank`; rows answered
   that are another's refuse as `gateMadeElsewhere` does today. `bankDB` replaces `vaultDB` in the
   options.
3. **`Bank extends Storable`**, of the bank row, made from a bank record and its gate record, one
   life per object. It has `maingate`, the one lease, `lock`, `autolock`, `ensureUnlocked`,
   `unlock` (an `unlock_bank` gating) and `delPrompt` (a `del_bank` gating, then `delBank`). A
   tombstone delivered drops the lease and leaves `device.bank` null.
4. **`Gate extends Storable`**, of the gate row: its wayins as `main` and `passkey0`, the three
   prompts, the policy table checked before each call, and the row answered delivered to it. The
   bank and the gate each have their stub listing (ground rule 8).
5. **`Gating`**: the six kinds of `design.md`, *Names*; launched by the device, the bank or the
   gate; its outcome the bank's, its snapshot a `BankScope`.
6. **Stamps and ctx** as the table of *Keys, stamps and each ctx*. The lease is the bank's: its
   row keyed `[user_id, banklabel]`, `fmt` 7003, citing `gate_tok` and `gate_revision_tok`.
7. **`Vault`** loses its gate, lease, prompts and friend; its record is never partial.
   `bank.ensureVault` is `putVault` with `ifAbsent: 'add'` and `ifPresent: 'get'`, asks nobody, and
   refuses `bank_locked` where it would have to put (R4). The vault listing lists by `ensureBank`
   and delivers the bank row and the gate row before its own; a box listing delivers its vault's
   row as now; a box is sealed through the bank's lease.
8. **New tests for what is new**: building and deleting a bank, one lock over two vaults, a
   bank's tombstone delivered, `ensureVault` on a locked bank. `ctx-bytes.test.ts` changes on
   purpose.
9. **`notes/guarantees.md`** (the table of files, G1, G3, G4, G9) and VOCABULARY.md.

Left for other threads: renaming `vaultKey` and its stored fields (9); the lifecycle (10); React
beyond what compiles, the gatingkinds' names, the `bankDB` prop and `IdbBankDB` in the demo (12);
the server adapters (13 to 15), which no model test reaches whichever contract they are on.

After: threads 5 and 7, as one line. Suggested: `opus`, a `high` review. Orchestrator: if your
gloss finds a green cut in it, take it and say where.

### Next thread: 9 `bankkey_rename`

`vaultKey` is `bankKey`: the makers and privates in `crypto.ts`, `proving.ts` and `lease.ts`; the
stored fields `bank_key_wayin_wrapped` and `bank_key_lease_wrapped`; the purposes
`bank_key_passphrase_wrapped`, `bank_key_passkey_wrapped` and `bank_key_lease_wrapped`; each
adapter, schema and test that names one; `notes/guarantees.md` (G3); VOCABULARY.md's *Keys* and
*Encrypted forms*. A purpose is in a ctx, so `ctx-bytes.test.ts` changes on purpose. Behaviour is
unchanged.

After: thread 8. Suggested: `sonnet`, and a `medium` review that reads each purpose string.

### Next thread: 10 `one_enabled`

The lifecycle, now that the bank has the lease. This thread removes; what it adds should be
smaller than what it takes out.

* A thing and a listing lose their own enabled flag, `sweep` and `vacate`: the device's are the
  ones left. Where a call checks its own flag or its listing's today, it asks the bank instead;
  a call that checks nothing today gains no check. `lock()` stays, as the one duty a thing has at
  a discard, to drop what it has of secrets.
* A put or a del needs the bank unlocked, by one thrower (`needUnlocked` and `unlockFirst` are one).
* A Vault object stands for its scope through its lives (R6): `isOneLifePerInstance` and the
  `remake` making go, and its box listing is made again under the new `vault_tok`. A Box kept
  from an ended life is refused, as a vacated one is today, by comparing its `vault_tok` with its
  vault's.
* `ListingWorld`, `VaultWorld`, `BoxWorld` and `BankFriend` go. A listing and a thing are handed
  the bank; a box listing also its vault. `Storable`'s base prop `vault_tok` moves down to `Vault`
  and `Box`.
* The vault listing and the box listing are brought to the same members in the same order. They
  stay two classes.
* `notes/deliver-contract.md` loses its rows for one life per instance.

After: thread 9. Suggested: `opus`.

### Next thread: 11 `bank_level_tests`

The core's tests that reach the lock, the unlock and the wayin prompts through a Vault are
re-pointed at the bank and `bank.maingate`, helpers and file names with them
(`vault-unlock.test.ts`, `vault-lease.test.ts`, `vault-gate.test.ts`). No source change is
expected; a test that shows a real defect once re-pointed is fixed if the fix is small, and
reported otherwise.

After: thread 10. Suggested: `sonnet`, a `low` review.

### Next thread: 12 `react_bank`

`safebyok-react` at the bank's level, and the Vault's scaffold calls deleted.

* The lock is the bank's: in `useBankSnapshot`, in the controls, in each modal, which is handed a
  bank or its `maingate`. `VaultControls` becomes the bank's lock and the vault's boxes.
* `useVault`'s stages are judged again now that a bank can be unbuilt and a vault merely absent.
* The provider is judged again, with building and deleting a bank as gatings: the Coach expects
  it to get simpler. Say what two providers, for two banks, do with two gatings open.
* Then delete the scaffold calls on `Vault` and `VaultSnapshot.isLocked` (ground rule 11).

Decide the React as the React developer. In the report, say what each structural change cost:
state, effects and branches added and removed.

After: thread 11. Suggested: `opus`.

### Next thread: 13 `bankdb_postgres`

`safebyok-postgres` moves from `VaultDB` to `BankDB`, in place, with its e2e pairing.

* `safebyok_banks` and `safebyok_gates`; `safebyok_vaults` with `bank_tok` and no `gate`; foreign
  keys to the bank; `delBank`'s cascade in its one transaction.
* The gate verbs' policy inside the database where the adapter's functions can run it. It is the
  same policy as the classifier's, and need not be the same code.
* It passes thread 4's battery.

After: thread 4, whenever there is room. Suggested: `opus`.

### Next thread: 14 `bankdb_convex`

`safebyok-convex` moves from `VaultDB` to `BankDB`, in place, with its e2e pairing: the component's
schema and indexes, its functions, and the client. Say whether `delBank` can delete every row
under a large bank in one mutation; where it cannot, the rows left are unreachable and `tidyGone`
deletes them, as for a deleted vault's boxes today. It passes thread 4's battery.

After: thread 4, whenever there is room. Suggested: `opus`.

### Next thread: 15 `bankdb_graphql`

`safebyok-graphql` moves from `VaultDB` to `BankDB`, in place, with its e2e pairing: the schema,
the resolvers, the operations and the client. It passes thread 4's battery.

After: thread 4, whenever there is room. Suggested: `opus`.

### Next thread: 16 `vaultdb_out`

Delete what the line kept alive: `VaultDB`, `AdapterVaultDB`, `MemoryVaultDB`, `IdbVaultDB`, the
classifier's half for them, their shapes, asks and battery, and `world` as an answer's field. A
search for those names afterwards should find no live code and no current doc; changelogs,
changesets and `notes/old_vocabulary.md` keep theirs.

After: threads 12 to 15, as one line. Suggested: `sonnet`, a `low` review.

### Next thread: 17 `bank_docs`

* The READMEs, root and each package.
* SECURITY.md, with the two changes a reviewer should not have to find: one unlock on a device
  opens every vault of the bank, and deleting a vault no longer removes a wrapped key from storage.
* `notes/security.md`, through its `sonnet` subagent; `notes/design-models.md`,
  `notes/design-vaultdb.md`, `notes/old_vocabulary.md`.
* TODO.md: the entries about a gate or a lease per vault judged again, each kept, rewritten or
  removed with a line saying why.
* The changesets, read together as one release note.

After: thread 16. Suggested: `opus`.

## For the Coach

* **Put off to the end of this sprint, and owed to you then:** whether a wayin change goes on
  making other devices prove again. It is built to keep doing so (`gate_revision_tok`).
* **The files in the base checkout are uncommitted.** Once the sprint's first commit has them,
  the base copies are duplicates.
* **No release until the line is whole.**
