# Thread 15: deriver_shim (2026-10-16)

Branch `20261016-deriver_shim`, PR [#138](https://github.com/mrflip/safebyok/pull/138), stacked on
#126 (thread 6, `adc94772`). Justify: green (core 1692, from 1664 at the base; fastkey 49; react 111;
the rest unchanged). `pnpm size`: three lines over main's budgets (*Discoveries*).

## Closes

No `G###` list of its own. It settles the Coach's ruling on #126's union ("yes, shim ... an
abstract class presenting a facade"): **closed**, in code (`src/key-deriver.ts`). G031's shape
(thread 6) is replaced by it. Thread 6's review leftover "`ensureSuppliedSpecKept` runs twice":
**closed** (the base's floor checks reserved labels once).

## The design (sketched before building; built as sketched)

```text
KeyDeriver<Spec extends KeyDeriverSpec>        abstract, core (key-deriver.ts)
  constructor(spec)                             the floor: ensureKeyDeriverSpec -- algorithm and
                                                  label non-empty text, salt_bytes 1..65536, the
                                                  reserved argon2id_web_ labels -- and 'argon2id'
                                                  only inside the Argon2id family; spec frozen
  readonly spec, key_deriver_label, salt_bytes, algorithm
  passphraseKeyOf(passphrase, saltBytes)        THE ONE METHOD THE CORE CALLS: deriveKeyBytes,
    -> Promise<CryptoKey>                         import as the wrapping key, wipe (finally)
  deriveKeyBytes(passphrase, saltBytes)         checked bytes: salt of the spec's length, then
    -> Promise<Uint8Array>                        the runner, then a view, not shared, 32 bytes
                                                  (wiped when refused). Public, to test one
                                                  deriver against another; never overridden
  protected abstract doDeriveKeyBytes(...)      THE RUNNER, all a subclass supplies
  ├─ Argon2idKeyDeriver (abstract, core)        constructor runs parseArgon2idSpec before super
  │  ├─ NobleArgon2idDeriver (core, private)    argon2idDeriver(spec), argon2idWebV1Deriver
  │  └─ WasmArgon2idDeriver (fastkey, private)  argon2idWasmDeriver(spec), argon2idWasmWebV1Deriver
  ├─ TestDeriver (safebyok/testing)             one SHA-256; any spec change and runner
  └─ a host's scrypt, native Argon2id, ...      another subclass, its own spec and check
```

**Thread 10's all-zero refusal** (`isAllZero`, in `envelope.ts`'s `passphraseKeyOf` on #136)
goes in `KeyDeriver.deriveKeyBytes`, straight after the length check: the one place every
deriver's output passes after its runner returns, on the vault's path and a host's alike. Not
added here; the restack moves it.

## Built

* `src/key-deriver.ts`: `KeyDeriver`, `Argon2idKeyDeriver`, the private noble subclass, the two
  factories (frozen instances). `passphraseKeyOf`, the output checks and the wipe moved here
  from `envelope.ts`, which now calls `keyDeriver.passphraseKeyOf(...)`.
* `src/key-deriver-spec.ts`: `KeyDeriverSpec` (algorithm, label, salt length), `Argon2idSpec`
  (what `KeyDeriverSpec` was), `ensureKeyDeriverSpec` (the floor), `parseArgon2idSpec` (was
  `parseKeyDeriverSpec`).
* `vault.ts`: `parseKeyDeriver` is `instanceof KeyDeriver` plus the `test_` warning; its Zod shape
  and Argon2id check are gone.
* `safebyok-fastkey`: `WasmArgon2idDeriver extends Argon2idKeyDeriver`, a runner only.
* `safebyok/testing`: `TestDeriver(spec?, derivation?)`, `digestDerivation`, `TestDeriverSpec`;
  `testDeriver` a frozen `TestDeriver`.
* Tests: `key-deriver.test.ts` (rewritten around the class: floor, reserved labels, the
  `argon2id` claim, salt and output checks, wiping, both @example subclasses),
  `key-deriver-spec.test.ts`, `vault.test.ts`'s seam (only a KeyDeriver is taken, old plain
  objects and lookalikes refused), `index.test.ts` (exports; `Argon2idKeyDeriver` alone brings no
  Argon2id implementation), React's provider tests, fastkey's.
* README, fastkey README, VOCABULARY.md, `notes/security.md` (one entry appended, two of thread
  6's corrected in place), changeset `20261016-deriver_shim.md` (minor, core and fastkey).

## Decisions taken

* **Runner named `doDeriveKeyBytes`**, after `VaultDB`'s `do*` methods: same pattern, public
  verbs wrapping protected ones a subclass implements.
* **`deriveKeyBytes` stays public**, checked: the README tells a host to test a stand-in byte for
  byte, and our JS-vs-WASM tests need it. The vault never calls it directly.
* **Floors at construction**, not at `openVault`, per the ruling ("the core's checks for
  Argon2id's floors live in the Argon2id family"). A bad spec now fails where the deriver is made.
* **`openVault` checks `instanceof`**, not shape (as `parseVaultDB` does): a structural check
  would let a lookalike skip the class's checks and the wipe.
* **`algorithm` is required** of every spec, and `'argon2id'` (any case) only on an
  `Argon2idKeyDeriver`, so a deriver cannot claim Argon2id and dodge its floors.
* **Argon2id parameters live on `deriver.spec`**; `key_deriver_label`, `salt_bytes`, `algorithm`
  stay on the deriver (thread 6's look-ahead: 5 and 10 read those names).
* **Unexported** `CustomKeyDeriver`, `ensureSaltFits`, `parseKeyDeriverSpec`: the class makes
  both checks for every subclass.

## Deviations

* **Thread 6's changeset edited**: it described the union, which this release replaces; it now
  lists the checks and points at the class entry.
* Four byte-handling tests moved from `envelope.test.ts` to `key-deriver.test.ts`, where the
  code now is; two stay in `envelope.test.ts` to hold it to calling `passphraseKeyOf`.

## Discoveries

* **Size** (`pnpm size` against main's lines; thread 1 raises only `openVault` and
  `argon2idWebV1Deriver`): `argon2idWebV1Deriver` 11.45 kB (limit 8.1; thread 1's 9),
  `argon2idWasmWebV1Deriver` 15.73 kB (13), `openVault` 23.04 kB (23; thread 1's 30).
  `argon2idWasmDeriver` 15.76 kB (19). The rise is Zod: a deriver now checks its spec as it is
  made, so even the supplied one carries the schema. An app imports `openVault` too, which
  already carries Zod: `openVault` and `argon2idWebV1Deriver` together measure 27.74 kB at the base
  and 27.98 kB here (rolldown, minified, brotli), +0.24 kB. `.size-limit.json` untouched.
* **At the restack**, test derivers written as spreads (`{ ...TH.testDeriver, deriveKeyBytes }`)
  no longer type-check: write `new TH.TestDeriver({}, derivation)`; a relabel is
  `new TH.TestDeriver({ key_deriver_label })`. Thread 10's all-zero tests, 7's and 14's provider
  tests, and 14's demo deriver will meet this.

## For the Coach

* The shape above is the ruling as I read it: please confirm, especially the public
  `deriveKeyBytes` and the floors moving from `openVault` to the constructor.

## Open matters

* **Plain-object derivers.** Accept `{ key_deriver_label, salt_bytes, deriveKeyBytes }` again,
  wrapped in a class by the core? Rec: no. Tests have `TestDeriver`; a host's subclass is five
  lines, and a wrapped plain object would be the union's second route back.
* **The deriver's size line.** `argon2idWebV1Deriver` measured alone now carries Zod. Rec: thread 9
  re-derives it (and fastkey's `argon2idWasmWebV1Deriver`) by the rule, or measures it beside
  `openVault`, as a host ships it.
* **`instanceof` and two copies of safebyok** (an ESM and a CJS build both loaded): the deriver is
  refused `bad_option`, never trusted unchecked. Rec: keep; a `Symbol.for` brand only if a host
  meets it.
