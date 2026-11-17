# Thread A2: vault_class (2026-10-19)

Branch `20261019-vault_class`, [PR #196](https://github.com/mrflip/safebyok/pull/196), stacked on [#194](https://github.com/mrflip/safebyok/pull/194) (`20261019-outcome`). Justify: green; 4142 tests, 3949 passed, 193 skipped (live backends), 0 failed.

* **Built**:
  * `packages/safebyok/src/vault.ts`: `export class Vault`. `Vault.make(opts)` is `static make`,
    returning `new Vault(opts)` through a `private constructor`. The `Vault` type, the `vault`
    object literal and `export const Vault = { make }` are gone. Each public method's doc block
    stays where the type had it, and its body (from the literal) now sits under it, so the six
    `[Vault: ...]` sections hold the public surface, doc and code together; `[The handle]` and
    `[The Vault value]` are gone. Every private section keeps its banner and its order: B1 to B3's
    seams.
  * Every closure `let`/`const` is a private field (`#vaultProps`, `#vaultKey`, ...), every
    closure function a private method (`#refresh` stays a field: it is `oneAtATime(...)`). The
    constructor assigns the parsed options, builds the first snapshot, subscribes to the VaultDB
    and calls `#sayFirstHello()` (the old tail of `make`, now under `[Catching up]`).
  * `vault-opts.ts`: `parseMakeVaultOpts(opts)` and its `ParsedVaultOpts`, the setup lines of
    `make` moved whole (secure context, the bag, known options, scope, stores, lease, logger,
    clock, deriver, strength test, limits), so the parse is the constructor's first line, as the
    preplan says. `checkSecureContext` moved with it. Two things stay in the constructor: the
    `RefusalPolicy.heed` wrapper (it calls back into the instance) and
    `deviceTroubleAsConditions` (from `del-damaged-vault.ts`, which imports `vault-opts.ts`: a
    cycle otherwise).
  * `RefusalPolicy.heed` is untouched (A1's interim shim, for A4 and phase C).
  * One new test, `tests/vault/vault-make.test.ts`: "hands on every method alone, bound to its
    vault, as its examples show", for the class doc's new examples.
* **Decisions taken**:
  * **Public methods are arrow-function fields, private ones are `#methods`.** The promise is
    "methods are bound" (the Contract: `onClick={vault.lock}` works). An arrow field is bound by
    construction, declared once, with no list of `bind` calls in the constructor to keep in step
    as A4 doubles the surface with `tryX`. Private methods are never handed out, so they are plain
    prototype methods; the one that was (`dropNow`, to `setTimeout`) is wrapped in an arrow at
    the call. Two-way door.
  * **ES `#private`, not TypeScript `private`.** A TS `private` field is a plain property at
    runtime: `vault['vaultKey']`, `Object.keys(vault)` and a host logging the handle would reach
    it. `#` keeps the state as unreachable as the closure kept it. A `notes/security.md` entry says
    so (`notes/security.md`, *Of Interest*). Consequence for B1 to B3: a model class holding `vault` reaches its scope, clock, logger and
    deriver through accessors the vault grants, not by reading `#` fields.
  * **Layout kept as today's file order**: public sections first, then `[Options and setup]`
    (fields, `make`, constructor, `#clockNow`), then the private sections in their old order. Fields
    sit in the section they sat in (`[State and snapshot]`, `#unsubscribeDB` in `[Catching up]`)
    rather than gathered at the top, so the diff stays a move; A3 adds its first-class fields.
  * **The rewrite was scripted**: the TypeScript checker found every reference to a closure name
    and rewrote it to `this.#name` (`this.hello`, `this.leaseMillis` for the public two;
    `applabel`/`vaultlabel` to `this.#scope.applabel`/`.vaultlabel`), and turned each arrow
    `const` into a method head, bodies untouched; a second script moved each member of the
    literal under its doc block. Hand edits: the setup section, the snapshot's first value,
    `#sayFirstHello`, the `dropNow` callback, two re-indents.
* **Deviations**:
  * **Test count +1** in `vault-make.test.ts` (the binding test above); every other file's count
    is unchanged. The tables are below.
  * **Two react test files changed** (no count change), for the types: `stubVault`'s
    `{ ...stub, unlock }` spread a value typed `Vault`, which `no-misused-spread` now refuses on a
    class (rebuilt with `stubVault({ wayins, unlock })`); and `vaultUnlockingWith` handed a
    `(passphrase: string) => ...` to `Vault['unlock']`, which method bivariance allowed on the old
    type and a property type does not (it now refuses a passkey's answer as `wrong_passkey`).
    `safebyok-react`'s `src/` needed nothing.
* **Discoveries**:
  * **Reading the diff.** `this.#` touches most body lines, so `git diff --color-moved` alone shows
    about a third as moved. Strip the prefix and the move shows: `git show HEAD~1:packages/safebyok/src/vault.ts > old.ts; sed -E 's/this\.#?//g; s/#([a-zA-Z])/\1/g' packages/safebyok/src/vault.ts > new.ts; git diff --no-index --color-moved=zebra --color-moved-ws=allow-indentation-change old.ts new.ts`.
    What is left is method heads, public signatures become field heads, the setup, and the
    imports.
  * **Types a host sees change** (the changeset says so): `#` fields make `Vault` nominal, so an
    object literal no longer passes for one; methods typed as properties check their parameters
    strictly.
* **Size**: `Vault` measures 28.39 kB, `everything` 35.54 kB; `pnpm size:budget` gives every
  budget as it stands (`Vault` 32 kB), so none moved and `--write` was not needed.
* **Test counts** (vitest JSON reporter, every workspace; *total* includes skipped). Per file, all
  118 files: [thread-A2-vault_class-counts.md](thread-A2-vault_class-counts.md), for the reviewer.
  The one row that moved is `packages/safebyok/tests/vault/vault-make.test.ts`, 123 to 124.

  | Workspace | Base total (skipped) | Tip total (skipped) |
  | --- | ---: | ---: |
  | root | 265 (0) | 265 (0) |
  | safebyok | 2218 (35) | 2219 (35) |
  | safebyok-convex | 277 (8) | 277 (8) |
  | safebyok-fastkey | 49 (0) | 49 (0) |
  | safebyok-graphql | 271 (14) | 271 (14) |
  | safebyok-indexeddb | 154 (10) | 154 (10) |
  | safebyok-postgres | 278 (14) | 278 (14) |
  | safebyok-react | 230 (0) | 230 (0) |
  | demo-react | 215 (16) | 215 (16) |
  | e2e | 184 (96) | 184 (96) |
  | **all** | **4141 (193)** | **4142 (193)** |
* **For the Coach**:
  * **Bound arrow fields for the public methods**, not `bind` calls in the constructor as the
    preplan wrote: the same promise, nothing to keep in step. Recommend: keep.
  * **One test added** against "the test count per file is unchanged": the binding is the one
    behaviour a class could lose that a closure could not. Recommend: keep.
  * **Stricter types for a host**: a fake `Vault` needs a cast, and a narrower function no longer
    passes for `vault.unlock`. Pre-1.0 and said in the changeset. Recommend: accept.
