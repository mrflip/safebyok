# 2026-11-11: Prose repairs -- what the pass left alone, what looks stale, and the rewordings to check

The repair pass reworded eight files into plain English and changed nothing else: no heading, table row, term,
identifier or dated ruling was added, removed or moved. This entry lists what you will want when you tune them:
the sentences left as they were because their meaning was unclear, the statements that look stale or false, and the
rewordings where the meaning could have shifted. Each item has a string to search on. Strings marked *(new)* are the
reworded text; the rest are the original text, still in the file.

Also in this PR: `packages/safebyok/CUSTOMIZATION.md` is now `notes/configuration.md`. That takes it out of the
published package, which shipped it through `files`. The default strength checker's `reason` and
`Phrases.StrengthCheckerShape` now say "notes/configuration.md in safebyok's repository". If a host should still
find the file in `node_modules`, the alternative is to keep it in the package and link to it from `notes/`.
`notes/configuration.md` still says, on its fifth line, that it names the old design's `putWayin`; it does, at
`vault.putWayin()`.

## VOCABULARY.md

About 70 of the 110 rows and five paragraphs. *Words between Coach and agent*, *Verbs, by how precise they are* and
*Words safebyok does not use* are untouched.

Left, meaning unclear:

* `it is thrown by the vaultDB tied to the datastore` (damaged): what "it" is, and what the sentence rules out.
* `**granted** of the lease's life` (revoke): only the first half of the sentence is reworded.

Check the meaning:

* gate: "puts that gate over its base" is now `It stores that gate in place of the one it was built from`.
* `Bank.make(opts)`: "touches nothing" is now `does nothing else`.
* deviceId: "would link what the vault does not" is now `would link records that the vault itself does not link`.
* dbhas: now `the stored row the call found where it was acting, or null if there was none`.
* story: "before the failures it names ... after them" is now `goes before the failures`, read as the order in
  the message.
* dna: "The partial duck of a type's required and optional props" is now `A type's required and optional props, plus
  the props the factory controls, which are accepted and ignored`. "Partial duck" is gone.
* ensure: now `Return the thing if it is already there, or make it so and then return it`.
* passkey: "whose authenticator answers for the vault through the PRF extension" is now `its authenticator produces
  the secret bytes for the vault through the PRF extension`.
* pantry: "The rest of the vault asks them" now names the `Lease` or the proving.
* registered_at: the gloss ", its birthday" is dropped.

## notes/guarantees.md

About 95 sentences, in every section. Where a sentence's meaning was in doubt the code it names was read first.

Left, meaning unclear:

* `on its way to one` (G9): one of the three classes, or a key.
* `Nothing of either is ever stored` (*Bytes, handles*): the two kinds of bytes, or bytes and handle.
* ``Only `peek` and `listRawLeases`, which no Vault or Bank calls``: whether the clause covers `peek`, which a
  Vault-made friend does call.
* `It is the host's decision, which a host would otherwise make for itself without the guard` (*Open items*).

Looks stale or false, not fixed:

* `storeFailed` (G8): no such name in `src/`; each `DeviceDB` verb's catch calls `deviceDBFailed`.
* `which keeps nothing of it` (host functions, on `deviceDBFailed`): G8 says the `name` is kept.
* `on the old core until the package moves` (three places): both packages now depend on `safebyok`.
* ``made in `Vault.#makeFriend` `` against ``made in `Vault.#leaseFriend` `` (G9): two different steps are named.
* `a deviceDB whose store throws` (G8): no test has this title.

Check the meaning. These are the ones where a guarantee's condition was restated:

* G2, *(new)* `That holds even when a key was already derived from them`: my reading of "past the derivation too".
* G4, *(new)* `Two things enforce the autolock duration`: was "Two things answer to the autolock duration".
* G4, *(new)* `No lease is dropped by the passage of time alone`: was "No lease is dropped at a time".
* G4, *(new)* `makes an expired row that is still on disk usable again`: was "reopens an expired row still on disk".
* G9, *(new)* `kept private in `: "closed" became "private".
* G10, *(new)* `must carry exactly that label's supplied parameters`: read from the `superRefine` in
  `deriver/shapes.ts`.
* *(new)* `handle the passphrase`: "hear" became "handle" for the three host functions.
* *(new)* `catches mistakes in the core's own wiring and is not a security barrier`: was "a tripwire for the core's own
  wiring rather than a lock".
* *(new)* `refused before it starts`: was "refused at the door", twice.
* *(new)* `passed from one proving to another inside`: was "moved from proving to proving".
* *(new)* `a frozen bag marked `: the original did not say which call returns the bag.
* *(new)* `to show an outline of one`: "a whiff of one" became VOCABULARY's word for a mask, twice.

## notes/design-models.md and notes/design-vaultdb.md

About 150 sentences or cells in design-models, 40 in design-vaultdb. The emoji tables and lists keep their shape. Cells
were not re-padded, so some table pipes are ragged. Lines in your hand are untouched (`err=refused: oops`, the
`absent:` and `box timely:` notes, "we have no opinion on this crossing", "on its own dime").

Left, meaning unclear (design-models unless noted):

* `The goal: when lock is called, nothing crosses it.`
* `has only what its answer delivered` (two rows) and `has only what the answer delivered`: no subject.
* `wrapped as the leaseKey` (`proving.buildLease` row): reads as if the vaultKey becomes the leaseKey.
* `refuses hello; bank reads refused`.
* `so a fresh page needs no instance` (`bank.autolock` row).
* `called after every put called` (`vault.lock()` row).
* `settled` and `aligned` at the end of four Box rows.
* `kept to take the list apart from the row` (design-vaultdb).

Looks stale or false, not fixed:

* design-vaultdb names refusal kinds the source no longer has: `storage_error`, `not_permitted`, `damaged_record`,
  `invalid_input`. design-models names `unknown_key_deriver`.
* No match in `packages/safebyok/src`: `damaged_records`, `bank.#hearBadNews`, `vaultListing.fetchBank`,
  `bank.#cacheDeviceRecord`, `deviceDB.leasesProvedBefore`.
* design-vaultdb's last table has a column headed `VAULTDB.md`; there is no such file. It also reuses the ids `V10`,
  `V3`, `VPA2` and `VPA7` for different rows.

Check the meaning:

* "moved" became "changed" throughout (wayin, `gate_epoch`, `registered_at`).
* *(new)* `so the put is refused if a newer record has arrived since`: was "so a record delivered since refuses the put".
* *(new)* `even if a lock was called before or during the verb`: was "whatever lock came before or crossed".
* *(new)* `a patch missing the whisper or the sidecar`: was "a patch missing a half".
* *(new)* `only the scope is compared`: was "pin only the scope".
* *(new)* `is removed from the cache` (`Lease.peek`): was "a row of another is uncached".
* *(new)* `is still written`: was "still lands", for a bad `vault_key_wayin_wrapped`.

## notes/design-proof.md and notes/reference-timings.md

About 60 sentences in design-proof, twelve of them diagram annotations changed at line ends so the alignment holds;
about 30 in reference-timings. "birth", "forget", "stow", "peek", "spent" and "land" stay: the code uses them.

Left, meaning unclear:

* `` `maxMillis: 0` is the customer's to ask `` (design-proof).
* `` `fail` refuses `camped` with the corpse `` (design-proof; the whole `ifPresent` bullet is untouched).
* `In both cases the value is forensic` (design-proof): reads as your hand, and has the typo "delivere".
* The first four rows of design-proof's *End-of-method invariants* table are the discards diagram pasted in, and lack
  the table's columns.
* `with the same answer, made while the first` (reference-timings): whether "answer" is the passkey answer.

Looks stale or false, not fixed:

* design-proof says the models have "no public entry point yet"; the README lists `Bank`, `Vault`, `Box` and `Gating`.
* design-proof cites `whiteboard/20261102-newdesign/reference-timings.md`; the file is `notes/reference-timings.md`.

Check the meaning:

* *(new)* `A cached lease that clearly must be removed is never left in place quietly`: was "never shrugged off when it
  clearly must not stand".
* *(new)* `Because the vacated Vault's calls are disabled, it cannot be reopened in this tab`.
* A `lock()` that "loses" is now "has no effect" or "does not take effect", in both files.
* *(new)* `although the vault is by then deleted or swept`: was "over a vault now gone or let go".

## TODO.md

52 passages in about 45 of 70 items. Your lines at the top and in *Loud* are untouched.

Left, meaning unclear:

* `birth on this device takes it up` and `the next birth asks first`: the next Vault object, or the next creation.
* `becomes the gating's late landing`.
* `before any row` (*Flush and remake every instance*).
* `has no format version to read ahead of`.
* `` `useVault` never `` followed by "asks".
* `reads every box three times, and whole`: which call.
* `Write the lease transactionally`: probably `stow`.
* `must open the whisper and seal it again`: VOCABULARY.md bans "open" on a whisper.
* `bell refresh`, and the rest of *A wayin change racing this handle's own refresh*.

Looks stale or done, not changed. These names are in no package's `src/`:

* `putWayin`, `reviseWayins`, `grantLease`, `rotateVaultKey`, `prior_vault_key`, `damaged_wayin`, `getProof`.
* `lockLanded`, `setHeld`, `setVault`, `vault_closed`, `created_elsewhere`.
* `localVaultDB`, `ShelfVaultDB`, `StringStore`, `insertBox`, `InsertBoxOutcome`.
* `askPassphraseAt`, `passphraseDeadlineText`, `getWhisper`, `objStrict`, and "vault props" as a term.
* Two items disagree: one says "a key deriver's throw becomes its refusal's `cause`", a later one cites #264
  "dropping a key deriver's throw as its refusal's `cause`".

Check the meaning:

* *(new)* `drop the new vault's key as if the vault were gone`: was "stand the new one down". This one is inferred.
* *(new)* `The Postgres README should not offer a hand-written route server`: an item's title, was "points past a
  server nobody wants".
* *(new)* `A call is not refused when a lock lands during its opening hello`: an item's title.
* *(new)* `asked the authenticator only after the passphrase was proven`: was "only once the proof held".

## packages/safebyok/README.md

About 45 sentences. The examples are untouched.

Fixed: the caveat that VOCABULARY.md names old calls (`putWayin`, `getWhisper`). Neither name is in VOCABULARY.md or
`src/`. It now reads "Where it names a call that the types here do not have, trust the types."

Check the meaning:

* *(new)* `a copy of the old record can still be opened with the old passphrase or passkey`: the original said only
  "still opens".
* *(new)* `which can be passed on their own, the way`: was "detached".
* *(new)* `with the number of leases left behind`: was "counting them"; taken from `BankEvent`.
* *(new)* `Never replace the whisper object`: was "Never replace the prop".
* *(new)* `A veiled box stays veiled while its vault is locked`: checked against the getters in `box.ts`.
* *(new)* `A swept or vacated bank cannot be used again`: was "A bank swept or vacated is spent."
