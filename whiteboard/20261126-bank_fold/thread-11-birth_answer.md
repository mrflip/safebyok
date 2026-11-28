# Thread 11: birth_answer (2026-11-27)

Branch `20261127-birth_answer`, cut at `66c21dd28` (the line's tip); no PR of its own (the line is PR #949). Proved:
`pnpm justify` green over the whole repository, run with nothing else building: 9,415 tests
(safebyok 2,503, graphql 317, postgres 191, convex 242, indexeddb 141).

* **Built**:
  - **A refused birth's `dbhas` is both roots** as the step read them, `ActualRoots` (`{ gate, root }`, each a record, a
    tombstone or the shell), the shape `tryGetBank`'s `val` has. Where the verb threw, `dbhas` is null.
    `BirthBankAnswer` is `GoodAnswer<BankRoots, 'born' | 'passed'> | BadAnswer<ActualRoots | null>`
    (`shapes-answers.ts`); `birthAnswerOf` strips the manifest to `actualRootsOf(ask, manifest.actual)`; the three-way
    check expects the same; `AdapterVaultDB.tryBirthBank`'s catch sets `dbhas: null`, as `tryListThings`' does.
  - `ScribedBirthManifest`'s refused arm lost `refusedrootckey`: `scribeBirthAct` takes the first refused act, gate then
    root, as it did.
  - The VaultMinder's `bornRecordsOf` tells both roots of a refused birth, as it tells both of a good one.
  - **GraphQL**: the second request (a get of the bank, on the refused path) and `namedRootOf` are gone.
    `doBirthBank` reads the roots from `val` or `dbhas` of the one answer, as `doWriteThing` does. The schema types
    `SafebyokRootsAnswer.dbhas` as `SafebyokRoots`; `answerFields` no longer carries `dbhas`, so each answer type
    declares its own (`SafebyokJson` for a Thing, a listing and stats). `VaultOperations.birthBank` and `getBank`
    select `dbhas { gate root }`; `rootsAnswerDrop` drops a `__typename` from it.
  - Tests: every refused-birth case of the battery expects both roots (all four adapters, and GraphQL over memory and
    Postgres); a thrown birth's `dbhas` is null; GraphQL answers a refused birth in one request (`counts.sent`), over
    the shell and over a gate tombstone a rebirth cites; GraphQL's misfit refusals (a lone Thing, null, one root, the
    shells, a live gate without its root box, a root of another user).
  - **B1** (`gate-forms.test.ts`, "a bank's gate across devices of other devicetoks"): a bank born on a device of
    `TH.Devicetok` unlocks on one of `OtherDevicetok` by passphrase and passkey, and the second unseals a box the first
    sealed; the second replaces the passphrase, the stored `main` records its devicetok, and the first unlocks by it and
    unseals; the second adds a passkey, `passkey0` records its devicetok, `main` still the first's, and the first unlocks
    by the passkey. All passed first time.
  - **B2** (`gating.test.ts`): a birth beside a live root box and no gate stored, or the gate's tombstone, refuses
    `camped`, writes nothing, makes no bank, and the vaultDB answers both roots.
  - **B3** (`postgres-vault-db.test.ts`): a gate tombstone keeping a wayin in `main` or in `passkey0`, planted
    straight into the table, is refused `23514`.

* **Decisions made** (design gaps, under the Coach's grant):
  - **Which root refused is not named in the answer.** The act says why; the rule (the gate's put's refusal, else the
    root box's) is in `BirthBankAnswer`'s doc block; no caller needs more (`gating.ts` throws `answer.err`, the
    VaultMinder tells both). Set aside: a `refusedrootckey` on the answer (a field no caller reads).
  - **GraphQL types `dbhas` on the roots answer** as `SafebyokRoots`, parallel to `val`, where it could have stayed
    `SafebyokJson`: a schema reader sees the shape, and the client selects exactly the two fields. It moves `dbhas` out
    of the shared `answerFields` into each answer type.
  - **No security-note entry**: no new gate material reaches an error or log (below).

* **Secret material**: a refused birth's `err` is `actRefused('vault', act, { oplabel, ask })`, the ask loggable
  (scope, flags, each root's cited fields, never wayins), and no `rows`: no gate rides on it, before or after. The
  answer's `dbhas` carries a live gate whole, wayins included, only under `retcon` (the gate the ask itself wrote, the
  gate `val` would carry), before and after; the new gate content in `dbhas` is a tombstone (no wayin) or the shell.
  The VaultMinder's told-record refusals carry no record.

* **Discoveries**:
  - Adapters' vitest reads `safebyok` and `safebyok-postgres` from their built dist: rebuild both before running
    GraphQL's tests.

* **For the Coach**:
  - Nothing blocking. Files the scope thread will likely touch too: `shapes-answers.ts`, `manifest-acts.ts`,
    `three-way.ts`, `adapter-vault-db.ts`, `vault-minder.ts`, the GraphQL client, schema and operations, the battery's
    births, `gate-forms.test.ts` and `gating.test.ts` (each change here is local: an appended `describe` or `it`, or a
    line in a birth function).
