# 2026-10-27: Doc blocks of the core's storage and refusal files -- two disagreements, four renames proposed

Documentarian run 5b of the fixup sprint, on `packages/safebyok/src/`: `vault-db.ts`,
`local-vault-db.ts`, `expectations.ts`, `device-db.ts`, `idb.ts`, `idb-opts.ts`, `refusals.ts`,
`errors.ts`, `outcome.ts`. Doc blocks only: no behaviour, name, `@example` code or running comment
changed. No `@ts-expect-error` or `eslint-disable-line` added. One test line changed (open
question 5).

## Doc-block lines, before and after

| File | Before | After |
| --- | ---: | ---: |
| `vault-db.ts` | 504 | 454 |
| `local-vault-db.ts` | 33 | 31 |
| `expectations.ts` | 79 | 79 |
| `device-db.ts` | 114 | 97 |
| `idb.ts` | 41 | 36 |
| `idb-opts.ts` | 12 | 12 |
| `refusals.ts` | 108 | 108 |
| `errors.ts` | 164 | 103 |
| `outcome.ts` | 40 | 40 |
| **Total** | 1095 | 960 |

`vault-db.ts` gained three lines of inline field docs on `VaultReadResponse`, where the type's doc
had toured its fields.

## Changes, member by member

### vault-db.ts

* **VaultDB (class)**: what every public verb shares is said once. Misuse goes before the call
  ('bad_scope', and 'bad_record'/'invalid_box' naming each failing field, never its value). After
  the call: an adapter's VaultError passes as it came, anything else is 'storage_unavailable',
  damage is 'damaged_vault'/'damaged_box', a wrong-shaped answer is 'corrupt_record' (pointing to
  VAULTDB.md line 5.1), and a base-class throw is 'unexpected_error'. The six adapter rules stay,
  the identity_revoked/not_permitted one whole.
* **VaultRecordExpectation, BoxGetExpectation, BoxExpectation, VaultDelExpectation,
  BoxDelExpectation**: each says what it names and links the verb that compares it. The refusals
  and their cases moved to the verbs (`getBox`, `putBox`, `delVault`, `delBox`), which already
  carried most of them.
* **BoxDeletion**: now leads with what it is ("The report of ...").
* **The expectation validators**: say the `parse` refuses 'bad_record', and drop "which a verb
  re-throws as its own refusal".
* **StoredBox**: tightened; the `unknown` typing note is gone.
* **VaultReadResponse**: the tour of `vault`, `boxes` and `damagedBoxes` moved onto the fields as
  inline doc blocks.
* **VaultDBOpts, its `logger`**: tightened.
* **maxRecordBytes**: the `box_too_large` detail moved to `putBox`.
* **maxVaultBytes**: the estimate is said in one sentence, without the exact sums.
* **maxBoxes**: the best-effort detail is left to VAULTDB.md lines 4.1 to 4.6.
* **logger (getter)**: the sentence on who uses it is dropped.
* **getVault, ensureVault, getVaultRecords, ensureVaultRecords, getBox, getCapacity**: each opens
  on its verb ("Read ...", "Ensure ..."). Each says only what is its own. `getBox` now holds the
  security sentence from BoxGetExpectation: a box from another life of the scope never reaches a
  reader holding this one's key.
* **putVaultRecord**: the success half and the miss half are split into two paragraphs. The
  'bad_record' for a changed `vault_tok` stays.
* **putBox**: the `invalid_box` bullet is gone (it is said in the class doc). The retry-after-landing
  case folds into the `stale_write` bullet, and the sidecar/long-names note from `maxRecordBytes`
  joins `box_too_large`.
* **delBox, delVault**: tightened; the "old passphrase in a stale tab" sentence stays on
  `delVault`.
* **delDamagedVault**: names its reach (`doGetVault`), and otherwise is mostly unchanged.
* **subscribe**: its 'bad_option' moved up beside the "one verb that throws" sentence.
* **readVault, ensuredVault, deletedVault (private)**: each opens on its act and names the hook it
  goes through.
* **doGetVault, doEnsureVault, doPutVaultRecord, doGetBox, doPutBox, doGetCapacity, doDelBox,
  doDelVault**: each says what it owes. The cases already spelled out on BoxDeletion, StoredBox and
  `Expectations` are not repeated.
* **WatchTrouble, startedWatch, splitStoredBoxes, checkedListing, the listing validators,
  asStorageTrouble, adapterAnswer, withMissChecked, withStaleVaultRecordChecked, boxStoredOf,
  newerVaultRecord, readStoredVault, NameFacts, jsonBytes**: each leads with what it is or does.
  None now opens on "What ...", and the listing validators' one long first line is broken up.

### device-db.ts

* **DeviceDB (class)**: said once. The verbs' shared behaviour is one paragraph: Outcome, never
  rejects, 'bad_scope' before your code, VaultError passes, else 'storage_blocked'/'storage_unavailable'
  naming no scope, an unreadable record reads as null and is discarded. The three constraints for a
  subclass author are each stated once. Call order is in the class doc. The read-modify-write is on
  `doRaiseDeviceRecord`. The conditional, atomic discard is on `doDelUnreadable`. The class doc
  points to both, and to the README's *Your own storage adapter* and `describeDeviceDB`.
* **getLease, getDeviceRecord**: "Read ..."; the discard is left to the class doc.
* **putLease, delLease, delDeviceRecord, delAll**: one line each, and no line says who calls them.
* **raiseDeviceRecord**: the merging rule is left to `raisedDeviceRecord`, linked.
* **#readableOf**: names `doDelUnreadable`.
* **doGetLease, doGetDeviceRecord, doDelAll**: "The base class checks it" is dropped (class doc).
* **doRaiseDeviceRecord**: "as one read-modify-write", why, the rerun note, the abort note.
* **doDelUnreadable**: tightened, with the never-discard-a-good-record guarantee kept.
* **memoryDeviceDB**: the restated class-doc facts are dropped.
* **raisedDeviceRecord**: the sentence on who calls it is dropped.
* **deviceRecordFor**: turned into the instruction "Read every device record through it", with the
  misfiled-record security fact kept.
* **DeviceTroubleSaid**: now leads with what it is.

### idb.ts, idb-opts.ts

* **Module doc (idb.ts)**: now holds the makers' 'bad_option', said once.
* **idbDeviceDB**: keeps the structured clone, the change bell, the stray-row sweep and
  'storage_blocked' with no IndexedDB. Drops what DeviceDB says.
* **inspectIdbDeviceDB**: the misuse moved to the module doc and to `subscribe`'s own line.
* **idbOpts**: "The check of IdbOpts ...".

### local-vault-db.ts

* **localVaultDB**: the purpose now sits on the `/**` line. `@param opts`/`@returns` became one
  "Throws 'bad_option'" line.
* **LocalVaultDBOpts, localVaultDBOptsShape, jsonOrText**: each leads with what it is.

### expectations.ts

* **Module doc**: now leads with what the module is.
* **vaultRecordMeets, vaultMeets, vaultRecordPutOf**: tightened.
* **boxRefusalOf, deletionOf**: the dangling "that" and "none that reads as one" now name
  `expected.revision_tok`.

### refusals.ts, errors.ts, outcome.ts

* **The message constants** (StorageTroubleMessage, StaleWriteSaid, StaleBoxMessage,
  StaleVaultRecordMessage, VaultMismatchMessage, StorageBlockedMessage, NoErrorGiven): "The message
  of ...".
* **staleWrite**: says the base class throws it on a deletion that answers null (see open question
  1).
* **RefusalKindVals**: 92 lines down to 30. It keeps the three families, each with how it is
  handled and its kinds (`tests/errors.test.ts` holds those lists to the README's tables). It also
  keeps the rule naming a record that fails its checks for who is at fault, and the security fact
  that `wrong_passphrase`/`wrong_passkey` are all a vault can tell of an altered vault. The
  20-entry "These need more" list is gone: the README's *Errors* section, already linked, covers
  it.
* **RefusalMeta, VaultErrorOpts, VaultError's fields, `vault_stored`**: now lead with what they
  are; "They are" became "It is".
* **Outcome, GoodOutcome, BadOutcome**: lead with what they are. The type-restating halves are
  dropped.
* **valOf**: "the inverse of outcomeOf"; who uses it is left to VaultDB's class doc.

## Dropped facts

Facts that STYLE.md does not plainly cut, for a Coach to put back. Facts that moved to another
member are not listed.

### vault-db.ts

* BoxDelExpectation: "within the right vault, a deletion wins over any write" (`delBox`'s
  "whatever revision is stored" and VAULTDB.md 3.4 carry it).
* VaultReadResponse: the detail of the base class's recheck, "the vault record as a read of it,
  each sound box as the split judges one, and each damaged box's boxlabel, revision and damage".
* VaultDBOpts.logger: "Fixed when the VaultDB is made."
* Class doc: the list of wrong-shaped answers ("a box write's echo, a stale or full refusal missing
  what it must carry, a deletion's report, a capacity"), now a pointer to VAULTDB.md 5.1. Also
  dropped: "A server hands a browser's VaultDB what `getVaultRecords` and `ensureVaultRecords`
  resolve", which those verbs say.
* maxVaultBytes: the exact estimate. `Bank.make` counts each box at twice `maxWhisperBytes` plus
  1 KiB; the vault's `putBox()` counts twice `maxWhisperBytes`, plus scope and boxlabel as UTF-8
  JSON, plus a little for fixed-size fields. vault-opts.ts holds these.
* maxBoxes: "writes one after another never pass it, while writers racing for the last places may
  take a vault a few past" (VAULTDB.md 4.2).
* logger getter: "`Bank.make` and `BankProvider` use it when given no logger of their own."
* getVault: "No write lands between the reads, so the record and the boxes agree as they are
  handed back", and "never among the sound".
* ensureVault: "gated or not". Also that a new life over a tombstone takes the draft's `vault_tok`.
* getVaultRecords: "the browser's VaultDB passes them through to its own base class".
* putVaultRecord: "so what is resolved is the vault as it is now stored".
* delVault: "This is the backend's part of deleting a vault", and "the vault is gone all the same".
* delDamagedVault: "in a `format` this one does not know".
* doGetVault: "(one row to a scope)", and "the base class reads it as none". Projection without
  `box_key_wrapped` and `whisper_ciphered` is left to StoredBox.
* doEnsureVault: "Two devices ensuring one scope at once settle on one vault" (on `ensureVault`),
  "exactly as stored", and "Over a tombstone the scope counts as holding no vault".
* doPutVaultRecord: "its gate with it".
* doGetBox: the cases of a miss, "no vault record is stored, only a tombstone, or another vault's".
* doDelBox: what `deleted`, `deleted_other` and `absent` mean, and the null-revision rule (both on
  BoxDeletion and `Expectations.deletionOf`).

### device-db.ts

* Class doc: "a lost lease asks for the passphrase again, and a lost device record checks the
  vault afresh".
* Class doc: "The vault checks whatever `getLease` hands back, and the bank and the vault whatever
  `getDeviceRecord` and `raiseDeviceRecord` do: a record of another scope reads as none". The
  misfiled-record fact stays on `deviceRecordFor`.
* Class doc: the ordering examples, "a `putLease` followed by a `delLease` leaves no lease, and a
  `delLease` followed by a `putLease` leaves the one written".
* Class doc: "(a browser's `SecurityError`, `QuotaExceededError` or `NotSupportedError`)", which
  `isStorageBlocked` says.
* delLease: "how a lock revokes it, and how a lease that no longer fits is discarded". The class
  doc keeps "a lock's `delLease` ... must erase it".
* delDeviceRecord: "as `bank.clearCachedVault` does". delAll: "the device's part of a full reset".
* raisedDeviceRecord: "The base class hands it to the store's `doRaiseDeviceRecord`, which calls it
  inside the one transaction that reads and writes the row."
* deviceRecordFor: "as they read a lease through `Lease.make`", and "the raise that follows starts
  the record again under its own scope".

### local-vault-db.ts

* "names joined on `^`", and "@returns The VaultDB, to hand `Bank.make`".

### errors.ts (the "These need more" list)

The README's *Errors* section covers every entry except these:

* `storage_unavailable` includes "a browser error naming no lasting cause (`InvalidStateError`,
  `UnknownError`)".
* `storage_blocked`: "A private window with room is no block."
* "This device's own lease read back damaged is refused so too, inside the vault, which never
  surfaces it: it asks for a proof instead."
* `invalid_box`: "It is refused before storage sees it" (VaultDB's class doc keeps it).
* `newer_format`: "nothing deletes it".
* `whisper_too_large`: "the whisper with its sidecar over `maxWhisperBytes`". The inline comment
  keeps it; the README row says only the whisper (open question 3).
* `vault_gone`, `vault_remade`, `gate_moved`: "(see `Vault.demandConsistentWith`)".

### outcome.ts

* valOf: "how a VaultDB that hands each call on to another unwraps each answer" (VaultDB's class
  doc says it).

## Proposed renames

* `DeviceDB.#readableOf` → `#checkedOrDiscarded`. A `fooOf` promises a pure function, and this one
  deletes through `doDelUnreadable`.
* `VaultDB.deletedVault` (private) → `delVaultChecked`. It deletes, and reads as a noun.
* `VaultDB.ensuredVault` (private) → `ensureVaultChecked`, likewise.
* `VaultDB.readVault` (private) → `getVaultChecked`. It works through `doGetVault` and implements
  `getVault`, so it should keep that verb (STYLE.md, *Naming*).

## Open questions

1. **A deletion's stale answer: `false` or null?** The old `staleWrite` doc said the base class
   refuses `stale_write` "when an adapter's deletion answers `false`, or `null` for a box", and
   VAULTDB.md's *Who does what* says it "turns a `false` from you (from a box deletion, a `null`)
   into `stale_write`". In the code, `deletedVault` refuses stale only on null or undefined. A
   `false` from `doDelVault` fails the VaultTombstone check and refuses `corrupt_record`. The doc
   now says null, as the code does. VAULTDB.md is unchanged (not mine to edit). Should VAULTDB.md
   say null, or should the code take `false`? VAULTDB.md's "a write whose expectation failed
   resolves `false` (a box write or deletion, `null`)" is also out of date: a box write throws
   `Refusals.staleBox`.
2. **localVaultDB and a full quota.** `localVaultDB` reports a `QuotaExceededError` as
   `storage_unavailable`: the base class wraps every non-VaultError so, and its own doc says the
   same. But the README's `storage_blocked` row, and the old RefusalKindVals doc, say a vault kept
   on the device refuses `storage_blocked` for no room. Is `localVaultDB` meant to map through
   `Refusals.isStorageBlocked`, as the device store does?
3. **`whisper_too_large` and the sidecar.** The README row says "a whisper over the vault's
   `maxWhisperBytes`". RefusalKindVals's comment says the whisper with its box's sidecar. One of
   them is out of date.
4. **`raiseDeviceRecord` and `putLease` don't check `record`** beyond its scope names, and a
   `record` with a bad `highest_vault_epoch` is stored as it came where nothing is stored.
   `raisedDeviceRecord`'s doc says only a host's own call can hand one. I am flagging this against
   CLAUDE.md's "validate at each module entrypoint", not proposing a change.
5. **A test edit in a doc-blocks-only pass.** `tests/errors.test.ts` ("puts the same kinds in each
   family as the doc block in errors.ts does") ended its bad-news slice at the
   `` * `vault_full` means `` entry, which this pass drops. It now ends at the blank doc line after the
   family list (`'\n *\n'`). That is one line, with the same assertion. The alternative was keeping
   the `vault_full` entry as a marker. Is the edit acceptable?
