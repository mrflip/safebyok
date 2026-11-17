# Preplan: the restyle's changes to `src/`

What the 2026-10-25 restyle intends to change, before it is cut into threads. The principles are
in `NEWSTYLE.md` (cited as §n); the open items are in `unsettled.md` (cited as U-n), and this plan
follows each recommendation there until the Coach rules otherwise. Every phase is its own PR,
green under `pnpm justify`, with doc blocks, tests and a changeset; until 1.0.0 no phase reads
older stored shapes, and its changeset says what a host sees (an old record reads as damaged).
**No phase removes a check today's code makes**: where a check moves (into a validator, a
helper, another layer), the PR says where it went.

## The outcome

### The vault, as one record and its shapes (§3)

```ts
vaultRecord = obj({
  format, applabel, user_id, vaultlabel, vault_tok, registered_at,   // the stamp: fixed for the life, and bound
  vault_epoch,                                                        // moves at every write of the record; never bound
  gate_epoch,                                                         // moves at every write of the gate; 0 while novel
  gate: nullable(gateRecord),                                         // null while novel
})
gateRecord = obj({ passphrase: passphraseWayinRecord, passkey: nullable(passkeyWayinRecord) })
```

| Shape | Built as | Used for |
|---|---|---|
| `VaultRecord` | the record | storage, and every wire (GraphQL, Convex) |
| `VaultSparse` | `omit` the gate: a subset of the record's own fields, the gate an associate as the boxes are, though the logical record holds it, since it is written in one compare-and-write with the rest | logs, a refusal's meta, what `demandConsistentWith` and `Box.make` take: wherever the gate is not needed |
| `VaultStamp` | `pick` the six stamp fields | the basis of every vault ctx; the Vault object's own fields |
| `VaultScope` | `pick` `applabel`, `user_id`, `vaultlabel` | the composite id: scopepaths, every VaultDB and DeviceDB call |
| `VaultSnapshot` | `VaultScope` and what a host renders beside it (below) | React |
| `VaultTombstone` | `format`, the scope, `vault_epoch` | what `delVault` leaves |
| `GateSparse` | the gate, each wayin as its sparse shape | the snapshot's `gate` |
| `PassphraseWayinSparse`, `PasskeyWayinSparse` | each wayin's record, `omit` `vault_key_wayin_wrapped`, and the passphrase's `salt_b64` and `key_deriver_label` (which tell a guesser the KDF and its salt; wayin.ts:57 keeps both from the host today) | inside `GateSparse`; `damaged_wayin`'s `meta.wayin_listed` |
| `BoxSparse` | the box record, `omit` its two ciphered fields | a vault's box listing: sound boxes only |

Each validator is built from `vaultRecord` with `pick`, `omit`, `partial` and `extend`; no
hand-written parallel types.

### The snapshot a React host renders (§5)

```ts
type VaultSnapshot = Readonly<VaultScope & Pick<VaultSparse, 'format' | 'vault_tok'> & {
  gate:              GateSparse | null,        // null while novel; same object until the gate changes
  boxes:             readonly BoxSparse[],     // sound boxes; same array until a box changes
  damagedBoxes:      readonly BoxDamaged[],    // { boxlabel, revision_tok, damage }
  capacity:          Readonly<Capacity>,       // same object until room changes
  ask_passphrase_at: number | null,            // this device's lease; null while locked
  freshness:         VaultFreshness,           // as today: whether the last read of storage failed
  trouble:           VaultError | null,        // bad news, as today; never a condition
}>
```

It duck-types as a `VaultScope`, so it may be thrown at any bank call, and carries the vault's
`vault_tok`, so `vault.demandConsistentWith(snapshot)` still judges it, and its `format`. It
carries what a host renders and nothing more: the vault's `registered_at` and epochs stay off it
(the Vault object hands its collaborators the epochs it reads from its own picture), as do the
passphrase's salt and key deriver label. A host chooses its screen from two fields: `gate === null`
(set a passphrase), `ask_passphrase_at === null` (unlock), otherwise the boxes. `askPasskey` takes
`snapshot.gate`. Gone: `state`, the `passphrase` and `passkey` summaries, `askPassphraseAt` (now
`ask_passphrase_at`).

A damaged box (a row filed under a box's scopepath whose record fails its check) is in
`damagedBoxes`, never `boxes`: it holds room, meets a `putBox` under its label, and tells the user
a secret is gone, but is offered only for `delBox` or a fresh `putBox` naming its `revision_tok`.
Its `damage` is `'damaged'`, or `'newer_format'` for a box a newer safebyok wrote, for which the
README has a host offer "update the app", not deletion.

### The Vault object (§5)

* `class Vault implements VaultStamp`: its own fields are `VaultStamp`, enumerable;
  `Object.freeze(this)` closes its constructor. A spread of it is a harmless stamp.
* Everything that changes is read through `vault.snapshot`; the per-field getters (`gate_epoch`,
  `passphrase`, `passkey`, `state`, `boxes`, `capacity`, `trouble`, `freshness`) go.
* `getSnapshot` and `subscribe`, own arrow fields today (vault.ts:225, bank.ts:95), become
  getters on the prototype returning private arrows, so they stay bound and stable for
  `useSyncExternalStore` and a spread of the object stays a stamp. The same on `Bank`. Nothing
  spies on, spreads or subclasses either class today (checked 2026-10-26).
* No public gate: the wrapped vaultKeys stay inside, with the `Gate` proving and wayin are handed.
* `logger` stays a public getter, a convenience for host code that logs about a vault (it is on
  the prototype, so no spread or log line sees it). `keyDeriver`, `leaseMillis` and the clock
  stop being public; each collaborator gets the ones it uses when it is made.

### Its collaborators

Today each declares a named `Pick<Vault, ...>`. Every one takes the scope and `now`, but
`BoxVault`, whose `stamp` holds the scope; beyond that:

| Today | Beyond the scope and `now` | Becomes |
|---|---|---|
| `WayinVault` | `keyDeriver` | `VaultStamp` |
| `GateVault` | `keyDeriver`, `vault_tok` | `VaultStamp` |
| `LeaseVault` | `leaseMillis`, `demandConsistentWith`, `tryLock` | `ConsistencyWith<VaultStamp & Pick<Vault, 'tryLock'>>` |
| `ProvingVault` | `vault_tok`, `stamp`, `keyDeriver`, `logger`, `leaseMillis`, `demandConsistentWith` | `ConsistencyWith<VaultStamp>` |
| `BoxVault` | `stamp`, `demandConsistentWith` (no scope) | `ConsistencyWith<VaultStamp>` |

What they read of the vault is always within its stamp, and what they call is at most two
methods (`ConsistencyWith<OT>` is `OT & Pick<Vault, 'demandConsistentWith'>`); `keyDeriver`,
`logger`, `leaseMillis` and `now` are handed in when each is made. Each parameter is written out
where it is declared, and the five names go. The epochs are no part of a stamp: the vault hands
each collaborator the ones it is made under, from its own picture, when it makes it (a proving
its `gate_epoch`, a Box its `vault_epoch` and `gate_epoch`), as it hands in `keyDeriver`.

### The bank: one per signed-in user (§3, §7)

* `Bank.make({ applabel, user_id, ... })`. A bank that outlives its user is a bug: sign-out drops
  the bank, and every Vault object with it. Its scope is `BankScope`, `{ applabel, user_id }`.
* `bank.ensureVault(bag, opts?)` and its siblings take a bag whose `vaultlabel` is required;
  `applabel` and `user_id` are optional and not stripped, so anything carrying a scope (a
  snapshot, a record, a Box) may be thrown at them as it is. Each first calls
  `bank.demandConsistentWith(bag)`, which compares the bag to `bank.scope`: an `applabel` or
  `user_id` the bag carries must equal the bank's, or it refuses `bad_scope`. A vault's own
  options (`BankVaultOpts`) go in a second, separate bag. `VaultChoice` goes; `VaultDraft`
  becomes `BankVaultOpts`.
* What is costly to load is made once, before any bank, and handed to each: the strength checker
  (through its existing optional `load()`, passphrase-strength.ts:36) and the key deriver, which
  gains the same optional, memoized `load()`. The core still calls `load()` on first use, so an
  early call is a warm-up; nothing registers itself on import.
* `bank.snapshot.vaults` is a sorted, frozen listing, as `vault.snapshot.boxes` is, with no
  Vault object inside: each element `Lifecycled`, its vault's scope once ready, which is
  what `VaultEntry` becomes. `bank.vaultOf(scope)` hands out the Vault object,
  from a map keyed by scopepath.
* safebyok-react's `BankProvider` makes a bank per `user_id`, and drops it when the `user_id`
  changes or goes.
* `VaultParts` carries the scope's names as its own fields (dropping the `_applabel` removal at
  vault-opts.ts:567), frozen.

### Reads (§3)

| Call | Resolves |
|---|---|
| `doGetVault`, `doEnsureVault`: an adapter's half | `VaultReadResponse`, `{ vault: VaultRecord \| VaultTombstone \| DamagedVaultRecord \| null, boxes: BoxSparse[], damagedBoxes: BoxDamaged[] }`: from one atomic step, its rows split by `splitStoredBoxes`, checked again by the base class |
| `getVaultRecords`, `ensureVaultRecords`: a server's, to relay | `VaultRecord & { boxes: BoxSparse[], damagedBoxes: BoxDamaged[] }`, or null for none: checked and split |
| `getVault`, `ensureVault` | `VaultRecord & { boxes: readonly BoxSparse[], damagedBoxes: readonly BoxDamaged[] }`, written out where it is used, unnamed: what the Vault object takes in at once (`#judgeRead`, vault.ts:1043) |

Every adapter answers the one shape the wire carries, `{ vault, boxes: BoxSparse[], damagedBoxes:
BoxDamaged[] }`. It splits its rows with one exported helper, `splitStoredBoxes(rows: StoredBox[])`,
so the judging of damage stays the package's and an adapter adds one line. `StoredBox` is `{
boxlabel, box: BoxRecord | DamagedBoxRecord }`, the helper's input only: `boxlabel` is the label the
row is filed under, from its scopepath, which an adapter always has. The record's own `boxlabel` is
what may be missing or wrong, and a record naming another label than its row's is damage the helper
finds. The base class still refuses a vault record naming another scope than the one asked
(vault-db.ts:960). It checks the sound boxes again, as it checks a server's, and takes the
server's word that the damaged ones are damaged, but parses each: its `boxlabel`, `damage` as one
of its values, and `revision_tok`. Over GraphQL (`safebyok-graphql`), where the server has split them:

```graphql
type SafebyokVault       { vault: SafebyokVaultRecord!, boxes: [SafebyokBoxSparse!]!, damagedBoxes: [SafebyokBoxDamaged!]! }
type SafebyokBoxDamaged  { boxlabel: String!, revision_tok: String, damage: String! }
type SafebyokGate        { passphrase: SafebyokWayin!, passkey: SafebyokWayin }
```

A browser's `doGetVault` passes the server's answer through. If record schemas are strict, it
still drops GraphQL's `__typename` before handing a record up.

### The vault types that remain

The public vault types become six: `Vault`, `VaultRecord`, `VaultSparse`, `VaultStamp`,
`VaultScope` and `VaultSnapshot`. The rest go this way:

* **Into `VaultRecord`**: `VaultProps`, `GatedVaultProps`, `GatelessVaultProps` (an
  `ensureVault` draft is `VaultRecord & { gate: null }`, written out).
* **Into `VaultSparse`**: today's `Stamp`: a record duck-types as a `VaultSparse`, which holds
  both epochs, so `Box.make` takes one. `demandConsistentWith` keeps its implementation and what
  it accepts today (a Box, a Lease, a snapshot, a record: anything with a `vault_tok`, each other
  field compared where present); only its parameter's name goes, today's `Stamped` written out as
  `Pick<VaultSparse, 'vault_tok'> & Partial<VaultSparse>`.
* **Into `VaultScope`**: `VaultChoice`; `VaultEntry` (a ready element of the bank's listing,
  `Lifecycled<VaultScope>`).
* **Written out where used**: the five collaborator slices; `ListedVault`; `VaultRecords`.
* **Kept beside them**: `VaultFreshness`, the snapshot's `freshness`.
* **Gone**: `VaultState`; `VaultDraft` becomes `BankVaultOpts`, a vault's own
  options where not the bank's: a `Partial<Pick<MakeBankOpts, 'vaultDB' | 'deviceDB'>>` today,
  and room for more (a lease's hours) as each is wanted.
* **Internal**: `VaultParts`, `Gate`, `GateWayins`.

Three stay named, because a host's adapter is written against them, and none is a shape of a
live vault: `VaultTombstone` (a different stored record), `VaultReadResponse` (the adapter's
answer) and the write expectations, one specific validator per write, each sliced from
`vaultRecord` in a `Validator` call: `VaultPropsExpectation`, renamed `VaultRecordExpectation`,
and `VaultDelExpectation`. `delDamagedVault` checks its `{ vault_tok }` with a module-local
slice, and still hands the adapter `gate_epoch: null`, meaning "check the `vault_tok` alone",
documented where it is. The record's check holds `gate_epoch` 0 exactly when `gate` is null.

### The box, the lease, the device record and the bank

Surveyed 2026-10-26; counts are references / files across every package's `src/`. Each rides the
phases above: stamps and ctx in 4, sparse and damaged shapes in 5, objects in 6, the bank in 3 and
8, aliases in 1a.

**Box.** The stored `BoxRecord` (79 / 19) is `format`, `boxlabel`, `revision_tok`, the two ciphered
fields, `whisper_codec`, `whisper_schema_version`, `sidecar`, `registered_at`, `written_at`. It does not
gain its scope: the call that files it names the scope, and a second copy in the record would need
a check that the two agree, on every server. The ctx binds the vault's scope and `vault_tok`, so a
box moved under another vault will not open. The filed label rides beside the record in a
`StoredBox`, `splitStoredBoxes`'s input, for a record too damaged to trust.

| Shape | Built as | Merges |
|---|---|---|
| `BoxRecord` | the record | |
| `BoxSparse` | `omit` the two ciphered fields | `BoxVisible` (11 / 2), `BoxView` (4 / 2), `ListedSummary` (12 / 5), `BoxSummary` (19 / 4), core's `ListedBox` |
| `BoxDamaged` | `{ boxlabel, revision_tok, damage }` | `DamagedBox` (36 / 7) |
| `BoxStamp` | `BoxSparse` and `vault_tok`: every field but the two ciphered ones | the box half of today's ctx |
| `Boxscope` | the vault's scope and `boxlabel` | |
| `PutBoxInput` | `{ boxlabel, sidecar? }` (its dna) | `PutBoxProps` (5 / 2) |

`BoxCiphered` (8 / 2) is `pick` of the two ciphered fields, written out where used; `BoxVault`
becomes `ConsistencyWith<VaultStamp>`; `BoxBase` and `SealBoxProps` stay internal to `Box.make`.
`DeletedBox` (what `vault.delBox` answers) and `BoxDeletion` (what an adapter answers) stay: a
box leaves no tombstone. `class Box implements Boxscope, BoxSparse`: the Box object is one
revision of one box, so every field it shows is fixed for its life: its own fields become
`Boxscope` (the vault's scope and the record's `boxlabel`), `vault_tok`, the `vault_epoch` and `gate_epoch` it was made under, and `BoxSparse`,
all frozen. The two epochs are its own fields rather than today's hidden getters:
`demandConsistentWith(box)` judges the box by them, and two numbers in a log line are harmless.

**Lease.** `LeaseRecord` (34 / 7), private to the device's store: `format`, the scope,
`vault_tok`, `gate_epoch`, `lease_key`, `vault_key_lease_wrapped`, `ask_passphrase_at`. A lease
is made once and never changed, so its stamp is the record minus its key material, and its sparse
shape is the same set of fields: `LeaseSparse = LeaseStamp`, two names for one type, each used for
what it means (NEWSTYLE §3), merging `LeaseView` (5 / 3); `class Lease implements LeaseSparse`,
its own fields frozen. `LeaseStanding` (`Pick<VaultProps, 'vault_tok' | 'gate_epoch'>`), what
`sealLeaseRecord` is made under, is written out where used as `Pick<VaultSparse, 'vault_tok' |
'gate_epoch'>`; it is no expectation. `LeaseVault` becomes
`ConsistencyWith<VaultStamp & Pick<Vault, 'tryLock'>>`.

**Device record.** `DeviceRecord` (23 / 6): `format`, the scope, `device_id`,
`highest_vault_epoch`. Nothing in it is ciphered, so it binds nothing; `device_id` is fixed for
its life, and `highest_vault_epoch` counts. It needs only its record and `VaultScope`; Phase 9
builds it from a parsed scope. A record has no object around it, so it carries its scope as own
fields already; its validator is `.readonly()`, so every device record handed out is frozen.

**Bank.** `Bank` (145 / 24), `BankSnapshot` (8 / 2), `BankStatus` (7 / 2), `EntryStatus`,
`VaultEntry` (11 / 3), `MakeBankOpts` (16 / 6), `ParsedBankOpts`. One bank per signed-in user.
Its snapshot becomes `(Lifecycled<BankScope, 'made' | 'starting' | 'ready'> | Refused<BankScope>)
& { vaults: readonly BankVault[] }`, the listing sorted where it is a map today. `BankStatus` and
`EntryStatus` become the `lifecycle` unions; `VaultEntry` becomes `BankVault`.

**Wayins.** `PassphraseWayin` and `PasskeyWayin` (classes), their records, `WayinRecord`,
`WayinKind`: kept. `WayinHeader`, `PassphraseWayinHeader`, `PasskeyWayinHeader` (10 / 2 each)
are the record minus its wrap, the same pick as the ctx's header; one generic `HeaderOf` stays,
and the three names go. The three `*WayinSummary` types become the wayins' sparse shapes. A
salt's length stays judged per wayin, as `isDamaged` does today (wayin.ts:151-154, 183-185), not
inside `vaultRecord`'s parse: a damaged way in is `damaged_wayin` news while the other still
opens the vault. The salts' brands (Phase 1a) check their shape in the record and their length
where each wayin is judged.

### Ctx (§3, §8)

`cipherCtx(stamp, purpose, header)`: the thing's stamp as one record, parsed by its stamp schema;
the purpose; the visible header. A vault's wayins bind `VaultStamp`, `registered_at` among it,
so the example at crypto.ts:65 becomes true. Whatever is fixed for a thing's life is bound: a box
binds the vault's stamp and its own (`BoxStamp`: every field it shows, as today's box ctx binds
them, `revision_tok`, `whisper_codec`, `whisper_schema_version`, `sidecar` and `written_at` among
them, since a box revision is never rewritten); a lease binds the vault's stamp and its own (`LeaseStamp`: its
`format`, `gate_epoch` and `ask_passphrase_at`). A box and a lease bind the vault's stamp without
its `format`, which would otherwise make every box unreadable at the next vault format. Where a
ctx binds two stamps it takes them as a list, `cipherCtx([vaultStamp, boxStamp], purpose,
header)`, so neither's fields are renamed to share one record. The encoding stays today's
(crypto.ts:67-78): each record part by `stableJsonify`, keys sorted (Postgres's jsonb reorders a
sidecar's), and an undefined or null part refused.

### Names (§3, §8)

* `user_id` everywhere: safebyok-react's `BankProvider` prop, the Postgres adapter's options,
  every check's `'userId'`.
* `credential_id` everywhere (the passkey answer, types.ts:258, proving.ts:308).
* `ask_passphrase_at` on the snapshot, as on the lease.
* `VaultRecord` for `VaultProps`; VOCABULARY retires "vault props" into
  `notes/old_vocabulary.md`. "Visible" stays VOCABULARY's word for a field stored unciphered, and
  names no shape.
* `-Sparse` for a sparse thing (`BoxSparse`, `VaultSparse`, `GateSparse`), never `-Listing`, which
  reads as the list or its holder. `BoxSparse` replaces `ListedSummary | DamagedBox` and
  `BoxSummary`, whose `vault_tok` no host needs.
* `trouble` for standing bad news, as today (vault.ts:100-107: a condition never lands there, and
  reaches its caller alone); `lifecycle` for the bank's and each listed vault's
  status, `ready` for `timely` in it; `err` stays for `Outcome.err` and a caught error.
* One name per limit, the option's, for the resolved number too: `maxBoxes`, `maxWhisperBytes`,
  `maxVaultBytes` (not `boxLimit` and the rest). `leaseHours`/`leaseMillis` and
  `staleMinutes`/`staleMillis` change units, and keep two names.
* "Stamp" for the bound fields in doc blocks and VOCABULARY, replacing "bound", "authentics" and
  "binding"; `cipherCtx` keeps its name.

## Phases

0. **Guidance.** Fold `NEWSTYLE.md` into STYLE.md, CLAUDE.md and VOCABULARY.md (§11); the core's
   eslint ignore patterns become `^_[a-zA-Z0-9]`. A documents-only PR.
1. **Checks, and the `Validator` factory.** `src/checks/` after
   `whiteboard/20261025-restyle/good/checks/core-checks.ts`, in classic Zod 4.6.7, a peer dependency
   at `^4.6.7` in the core and safebyok-indexeddb (the two that import it; both ask `^4.0.0` today), with `utils/phrases.ts` and
   `utils/consts.ts`. Every validator is made inside a `Validator` call, the Coach's form, with
   the call's one kind before the builder; a slice is its own named validator, made beside the
   record it slices:

   ```ts
   export const { vaultRecord, vaultScope, vaultRecordExpectation } = Validator('bad_record', ({ obj, uint, applabel, user_id, vaultlabel, gateRecord }) => {
     const vaultRecord            = obj({ applabel, user_id, vaultlabel, ..., gate_epoch: uint, gate: gateRecord.nullable() }).strict()
     const vaultScope             = vaultRecord.pick({ applabel: true, user_id: true, vaultlabel: true }).strip()
     const vaultRecordExpectation = vaultRecord.pick({ vault_tok: true, gate_epoch: true })
     return { vaultRecord, vaultScope, vaultRecordExpectation }
   }, [GateValidators])
   export type VaultRecord = Z.output<typeof vaultRecord>
   ```

   `Validator` hands the builder its kit, after triquet's (`lib/validator.ts`): Zod's makers
   under short names (`obj`, `arr`, `tuple`, `rec`, `oneof`, `union`, `discrim`, `lit`), its
   scalars ready made (`str`, `num`, `int`, `uint`, `bool`, `unk`), `zod` for the rest, and the
   shared primitives (`label`, `user_id`, `epochMillis`, ...). Modules of validators in the
   optional last slot are spread into the kit beneath it, a kit name winning. So a file imports
   nothing else to write one, and a file can make its own in-file validators without bringing
   names into scope. It wraps each schema it is
   handed back, so a failed `parse` throws a `VaultError` of the call's kind as informative as it
   can be without leaking: its message names every failing field (up to eight, counting the rest)
   with its check's sentence, and its `meta.fieldnames` lists the same paths, so a host can mark
   each form field. It quotes no value; a field name or key is repeated only when shaped as one of
   ours, since any other could be the caller's data. `safeParse` stays Zod's. Writing one is strictly easier than Zod alone: nothing is added per line. The
   working version is `good/checks/validator.ts` (`Object.create(schema)` with its own `parse`,
   so `.pick` and `safeParse` still work), and `good/checks/core-checks.ts` uses it. The few
   helpers that read a record back from storage (`checkVaultProps`, `checkStoredBox` and their
   kin) catch its `bad_record` and re-throw it as `damaged_*`. **Tree-shaking:** a bundler keeps or
   drops a `Validator` call whole, so importing one schema keeps every schema that call makes;
   the Coach accepts that. `/* @__PURE__ */` before a call lets a bundler drop one nothing
   imports from, and several calls by concern keep the granularity reasonable. Whether a record
   read back is parsed strict or stripped is the orchestrator's choice, strict both ways
   suggested (one schema; an unknown field reads as damage or a newer `format`). Tests
   are written against the factory from this phase on. The core's size budgets in the root
   `.size-limit.json` rise with classic Zod: today `Bank` is 38.9 kB and `everything` 46.4 kB
   (minified, brotlied, against limits of 42 and 50), and classic adds roughly 15 to 20 kB to
   each. **The host's `validators` option goes**, with `VaultValidators`, `DefaultValidators`,
   `AnyTextValidators` and `src/validators.ts`: the name rules are the package's. The README's
   *Names, and your own checks* becomes a paragraph: percent-encode (RFC 3986) a name outside the
   rules, and a pull request widening a rule is welcome where it keeps a name safe as a scopepath
   segment. Labels are strict, as in `good/`; a `user_id` is 1 to 100 of ASCII letters, digits
   and `-_.~:@+|%`, not only dots, opaque and compared byte for byte. A scope validator
   `.readonly()` replaces `Names.checkScope` and `ScopeShape`. The scope validators are made in a `bad_scope` call,
   which replaces `bad_label`; a record's validator refuses with its own call's kind (NEWSTYLE §2,
   *One input, one validator*).
1a. **Type aliases and brands.** Survey `src/` for the most common primitives (labels,
   `user_id`, tokens, times) and the most important (a passphrase's cleartext, the two salts,
   ciphertext, each wrapped key by role), and give each a name in `src/types/type-aliases.ts`:
   a plain alias where a host writes the value by hand, a brand from its validator's `.brand()`
   where it does not. An alias for each outcome a reader must tell apart even when its type
   overlaps another (`DamagedVaultRecord`); the facets `Lifecycled`, `Refused` and
   `ConsistencyWith`. `types.ts` moves into the folder as `types/types.ts`; as more types become
   `Z.infer` of their validators they move out of it to the concern that checks them, as each is
   touched, not in a sweep.
2. **Scopepath replaces Ckeys.** `Scopepath` goes public (`Scopepath.Delimiter`). It gains
   what Ckeys' callers use beyond the makers: the within-vault prefix as text, for an IndexedDB
   key range (`safebyok-indexeddb/src/ckeys.ts`), and kind tests for a device shelf
   (`isLease`, `isDeviceRecord` today). Callers: bank.ts, device-db.ts, idb.ts,
   local-vault-db.ts (`isBoxIn` at 123, 146, 172), validators.ts, vault-opts.ts, and the
   IndexedDB adapter. The strings are unchanged (`vault^…`, `box^…`, `lease^…`, `device^…`), so
   nothing stored moves. `ckey` returns to meaning any map key.
3. **Names and the bank.** Everything under *Names* above; the bank per signed-in user, its calls
   naming a `vaultlabel`, the `load()` hooks; safebyok-react's `BankProvider` making a bank per
   `user_id`. The adapters' wire arguments flatten with the rest, `{ applabel, user_id,
   vaultlabel, boxlabel, expected }` in place of `{ scope, boxlabel, expected }` (Convex's
   validators, GraphQL's inputs), in the same sweep, so no nested scope is left to find later.
   Each server's authorization moves with the field it reads: Convex's `mustBe(ctx,
   args.scope.user_id)` (safebyok-convex/src/server.ts:102-166) becomes `mustBe(ctx,
   args.user_id)`, on every function that has it today.
4. **The vault record and its ctx.** One object schema with the gate nested, and `gate_epoch` on
   the vault record beside it; the shapes built from it. The PR reports whether `gate_epoch` is
   better also in the gate, with the code in hand to judge by; it stays on the vault either way. `cipherCtx(stamp,
   purpose, header)` at wayin.ts:39, lease.ts:47 and lease.ts:256. Adapters: Postgres keeps
   `gate_epoch` a column and its SQL check, and the gate's two wayins jsonb; Convex's validators
   and GraphQL's schema take the nested gate. A note for `notes/security.md` through a `sonnet`
   subagent: what each ctx binds, the vault's stamp added to a box's and a lease's.
5. **Reads.** The responses above; `vaultProps` becomes `vault` in the adapters' half, typed as
   what belongs there; damaged boxes split from the listing, on the snapshot and in
   README *Damaged boxes*; GraphQL's schema as above, both kinds of box typed.
6. **The Vault object.** `implements` its shapes, as the Box and Lease objects do theirs; own
   frozen stamp fields; `Object.freeze(this)`; the per-field getters and the `keyDeriver` getter
   gone. Internal readers of the removed getters (bank.ts, box.ts, errors.ts, gating.ts,
   proving.ts, vault.ts) read the snapshot or are handed what they need.
7. **The snapshot.** The shape above; each slice reused while unchanged (today vault.ts:972
   rebuilds `boxes` and `capacity` on every snapshot); `state` gone, `freshness` kept. safebyok-react:
   the passphrase modal and the passkey button read `gate` and `ask_passphrase_at`, and
   `askPasskey` takes `snapshot.gate`. README sections on the snapshot.
8. **The bank's listing.** `bank.snapshot.vaults` as a sorted listing; `bank.vaultOf`;
   `VaultParts` flattened and frozen; `BankProvider` reads the listing and calls `vaultOf`.
9. **Records from parsed parts (§4).** `draftOf` (bank.ts:532) and each `raiseDeviceRecord`
   (vault.ts:1111, bank.ts:454, del-damaged-vault.ts:57) build from a parsed scope, never a
   spread; every DeviceDB call is handed a parsed scope.

Order: 0 stands alone. 1 before 1a, 1a before 2. 3 after 2. 4 before 5, 6 and 7; 6 before 7. 8 after 3 and 7.
9 rides with 4 or 8, whichever touches those lines first.

Not in this plan, and left as they are:

* A lease's lifetime. A passkey answer is to extend no lease, and a passphrase proof any; today
  every proof grants a full lease (`grantLease`, lease.ts:283).
* Capacity: the store's count as the truth, the Vault object's reckoning (vault.ts:1556) as an
  estimate. Until then capacity stays out of the read, and `getCapacity` as it is.
* A `meta` beside `val` and `err` on `Outcome`: added by the first change that needs it.
