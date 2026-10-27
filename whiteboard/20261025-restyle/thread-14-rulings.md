# Thread 14: Refusals say less; validators go public (2026-10-27)

Branch `20261027-rulings`, PR [#287](https://github.com/mrflip/safebyok/pull/287), stacked on
[#286](https://github.com/mrflip/safebyok/pull/286). Justify: green (core 3414 tests, every
package and the e2e suite).

* **Built**:
  * **Refusals repeat no key or value** (`packages/safebyok/src/checks/validator.ts`,
    `phrases.ts`). A field an object does not take is counted, never named, and the refusal lists
    the fields the object takes, read from the schema in the parse's error map (`issue.inst`),
    never from the input. `refusalOf` joins the first eight issues' sentences, each after its path.
    Gone: `isSayable`, its regexes, `MaxSayableChars`, `sayable`, `UnsaidName`, `FailedItsCheck`,
    `storesInBag`; `Bank.make`'s pre-scan and `RenamedMakeBankOpts`; `checkNoStoresIn` (the vault
    bag keeps its scope and ignores the rest); `optionsCheck`'s `notBagHint` (hello and
    ensureUnlocked say how to wrap them as a handler in their fixed text); `SpecLimitForField`
    (`parseKeyDeriverSpec` refuses in one fixed sentence); `damagedWayinUnless` (`Wayin.make`
    refuses its schema's own `bad_record`). The six catch blocks stay, each aligning only.
  * **Validators public.** `src/validators.ts` re-exports every validator (about 95); the main
    entry exports it as the `Validators` namespace, beside `Validator`, `Kit` and `KitWith`.
    `keyDeriverSpec` moved to `src/checks/key-deriver-spec-checks.ts` (and `MaxSaltBytes`,
    `PassphraseKeyBytes` to `consts.ts`), so `argon2idWebV1Deriver` still drops Zod (5.5 kB).
    The `VaultDraft` check sits beside its type in `vault-record.ts`.
  * `tests/validators.test.ts`: every exported validator, and `Bank.make`, `bank.ensureVault`,
    `optionsCheck`, `hello`, `putBox` and `parseKeyDeriverSpec`, handed a marker as keys and
    values at two depths; no refusal's text, stack or meta holds it.
  * **safebyok-indexeddb** checks its options with the core's `Validator`, strictly (`dbName`,
    `logger`), and drops `zod` as a peer and dev dependency.
  * **Unbranded rows**: `StoredBox.box` is `unknown`; local, IndexedDB and Postgres drop their casts.
  * **Convex imports the core**: the component's write comparisons are the core's `Expectations`;
    its formats are the core's constants (`BoxFormat` newly exported). `vaultRecordPutOf` and
    `newLifeOf` are generic over the record's type, so a Convex-typed record passes.
  * `notes/security.md` amended (a sonnet subagent); STYLE.md's refusal bullets brought up to date.
* **Decisions taken**:
  * **A refusal still names a failing field by its path** (`vaultlabel: A label is ...`,
    `meta.fieldnames`). Paths come from our fixed shapes; the one schema that put input keys in a
    path was the whisper bag's `record`. The kit no longer hands out `rec`, and `whisperBag` is a
    `custom` check judging the object whole. (`Whisper` never leaked, its union failing at the
    root; `Sidecar` did, one level deep.) The box format's JSON Schema snapshot changed with it:
    the sidecar renders as `{}`. Same stored shape, so no format bump.
  * **One namespace**, `Validators`: the entry would otherwise grow by about 80 names. Every
    validator in `src/`, `maskOpts` and `idbOpts` (other entries' modules) included.
  * **`StoredBox.box` is `unknown`**, not `Z.input<BoxRecord> | Z.input<BoxSparse>`: three of the
    four adapters read rows as `unknown` (IndexedDB, local, Postgres's `Columns.recordOf`), so only
    `unknown` lets no adapter cast. The doc said the types keep nothing out; now they say so.
  * **Convex's validators stay Convex's.** Convex takes only `v.*` validators for args, returns and
    schema. Deriving them from the core's Zod needs `convex-helpers`' `zodToConvex` (a new runtime
    dependency) or a converter of our own (the parity test's `zodShape` is most of one): both need
    the Coach's yes. Bundling is no obstacle: an esbuild bundle of `dist/component/` as Convex's
    CLI makes one resolves `safebyok`, with no Node built-ins (about 600 kB unminified), and
    convex-test runs it.
  * `putVaultRecord` keeps its own forward check (same `vault_tok`, `gate_epoch` up) on top of
    `Expectations.vaultRecordMeets`: a server's defence the core's helper does not make.
* **Discoveries**: `VaultReadResponse.vault` is still cast by IndexedDB and local
  (`as VaultReadResponse['vault']`), the same pattern as the box rows; left, outside the thread.
  STYLE.md's *Validation* still speaks of `zod/mini` (lines 26, 190): thread 1's to fold.
* **For the Coach** (the PR's open questions):
  * Derive Convex's validators from the core's Zod: `convex-helpers` (a dependency) or a converter
    of our own? Recommend our own, as its own thread.
  * `StoredBox.box: unknown` over the unbranded input type: recommend keep.
  * A store in the first bag is now silently the bank's (your ruling: "a hard-to-miss error").
  * `Validators` holds internals too (`LeaseGrant`, `BaseShape`, `ReadAnswer`): all semver surface now.
