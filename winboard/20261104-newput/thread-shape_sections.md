# Thread shape_sections: shapes grouped by section, tests to match (2026-11-05)

Branch `20261105-shape_sections`, stacked on #488 (tip `f62e967a`); no PR yet, nothing pushed. Justify: see the report (run last).

* **Built**:
  * `src/shapes/*.ts` regrouped under `// == [Name]: key names` banners, each check beside its types; no renames, no behaviour change (the same lines, reordered, the one exception below).
    * core: Ciphered, Record fields, Whisper and sidecar, Scopes, Clock, Key deriver and logger.
    * storage: its one `Checkers` call split into Record bases, Scopes, Wayins and gate, Vault forms, Box forms, Gate verbs' params, Options, Capacity, Row helpers, The deviceDB.
    * gateish: wayin kinds, wayin forms, gate forms, proofs, strength, stamp, what a proving / lease / gating is handed, lease forms.
    * vaultish: Record forms, Reconciling, Options, the locked bag, the listing's world, Making a storable, Given to a listing, the box's forms, What a box is handed, the box's world, the vault's forms and world, the bank.
  * Tests: `tests/shapes/shapes-{core,enums,gateish,storage}.test.ts` and `shapes-vaultish-{records,listing,box}.test.ts`, each in its source's section order; `tests/test-helpers/cases.ts` holds `holdsCases`, `checkSet`, `Case`.
  * `refusingAs(kind)` on every `Refusing` (`helpers/validator.ts`), with a test, a doc line, a STYLE.md line.
* **Decisions taken**:
  * `refusingAs` earns its place: 12 pure rewraps (10 in vaultish, 2 in gateish) became `VS.x.refusingAs('bad_record')`. Not applied: the scopes (core's are `.readonly()` and frozen; storage's are not), `gateProps` vs `VS.gate` (`gateEpoch` is `int.positive()`, storage's is `uint.positive()`, so a refusal message could differ), `liveness`/`tombstone` (new shapes).
  * VX types `Revision`, `Times`, `BoxRecord`, `BoxSparse`, `VaultRecord`, `VaultSparse` are now the VS ones (Readonly); tsc agreed. `Vaulted` has no VS twin.
  * Test files: three vaultish files, `-listing` holding Options and the listing's world (`vaultish` Options feed listings); `-box` holding the vault's forms after the box's.
* **Deviations**: `clockShape` and `keyDeriverShape` are now two `Checker` calls (one doc block each) so each sits beside its type. Duplicate rows removed: 4 (listed in the report).
* **Discoveries**:
  * Never tested directly: `whisper.parse` refusing `bad_whisper` (tests use `safeParse`), `sidecar`'s `bad_option`, `boxesListed`, the storage tier's `invalid_input` kind.
  * `LOCKED`, `IsListing`, `isListing` are runtime values in a file of shapes; they could go to a models-side file.
* **For the Coach**: nothing blocking.
