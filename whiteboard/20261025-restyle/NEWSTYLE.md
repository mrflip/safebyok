# NEWSTYLE: the guidance agreed in the 2026-10-25 restyle session

What the Coach and the agent agreed, to fold into STYLE.md, CLAUDE.md and VOCABULARY.md when the
guidance reform lands. The worked example is `good/` in this folder, a playground that has done
its job and may be cited freely: `checks/validator.ts` (the `Validator` factory and its kit),
`checks/primitives.ts`, `checks/core-checks.ts`, `scopepath.ts`, `utils/phrases.ts`,
`utils/consts.ts`, and `try.ts` with its `tsconfig.json` to typecheck and run them. Where this disagrees with the code
in `src/`, this is the newer word; nothing in `src/` has changed yet. The changes to `src/`
it implies are in `shapes-preplan.md`; what is still open is in `unsettled.md`.

## 1. Build for maintenance

* **Build for ease of maintenance, not ease of implementation.** A module's customer uses one
  method; that method should read whole on its own, without tracing into a generic.
* **Don't DRY short bodies through a generic.** Spelled out, a maker and its inverse read as
  mirror images, each clear at a glance:

  ```ts
  export const box = (scope: Boxscope): BoxScopepath => {
    const        { applabel, user_id, vaultlabel, boxlabel } = CX.boxscope.parse(scope)
    return ['box', applabel, user_id, vaultlabel, boxlabel].join(ScopepathDelimiter)
  }

  export const boxscope = (boxScopepath: BoxScopepath): Boxscope => {
    const [_scopepathkind, applabel, user_id, vaultlabel, boxlabel] = CX.boxScopepath.parse(boxScopepath)
    return               { applabel, user_id, vaultlabel, boxlabel }
  }
  ```

  A field destructured but left out of the array is an unused name, which the linter flags; a
  field-list helper gives no such check. A generic helper earns its place only when it is boring
  and longer than the bodies it serves.
* **Parallel construction shows in the whitespace.** Where one line takes fields out and the next
  puts the same fields back, pad so the field lists start in the same column, as above: what was
  extracted and what is injected is obvious at a glance, and a field dropped or swapped stands
  out. (The linter's `no-multi-spaces` is off for this.)
* **Name what you ignore.** A binding left unused on purpose gets a name starting with `_` that
  says what it is (`_scopepathkind`), never a hole (`[, applabel]`) and never a bare `_`. The name
  records that the part exists, where it sits, and that skipping it is deliberate.
* **Write the crucial detail where it shows.** A prefix of every box in a vault ends in the
  delimiter; say so with `+ ScopepathDelimiter`, not with an empty last part that `join` turns
  into one.
* **Don't unwind what you will only rewind.** Holding a scopepath and needing a related one, work
  on the text; don't parse it into a scope to join it again.
* **Take one form of input.** A function taking a scope *or* its scopepath branches on its
  argument and trusts one branch; take the scope.
* **Every sentence a check says lives in `utils/phrases.ts`**, star-imported as `Phrases`, so
  wording, tone and the rule that none quotes its input are reviewed in one place. Constants
  shared across modules (`ScopepathDelimiter`) live in `utils/consts.ts`, which imports nothing,
  so phrases can name them without a cycle.
* **Familiar over cute.** When a function already spans lines, a named target and `===` beats an
  equality-predicate factory: `const target = Scopepath.vault(thing); scopepaths.some((scopepath) => scopepath === target)`.
* **A predicate factory earns its place where it hides a detail that is easy to get wrong.** A
  prefix test against a scopepath must end in the delimiter, or `vault^acme^u1^main` matches
  `main2`'s rows. Never hand-write `.startsWith` against a scopepath: use the module's predicate.
  The factory assesses its argument once, so the predicate itself only compares text.

## 2. Validate with Zod

A function's input rules are declared once, as a schema, with a specific check beside it where
one is warranted, and its TypeScript types come from that schema (`Z.infer`), so the signature and the checks cannot drift apart.

**(a) Always at a boundary**: off the wire; records read back from storage; a published package's
exports; `Class.make` and any constructor taking outside input; a host's options; what a host's
callback returns (a strength checker's verdict, a key deriver's output). A failure there is a
refusal with a `kind` the caller can branch on.

**(b) For preconditions.** Check a function's input with Zod in general,
`dragForceInput.parse({ thing, vel })`, above all where a validator is already written. A
module-local variation is welcome, made directly or in a `Validator` call at module level, never
in a call per function call. Where it is warranted (a rule Zod does not express naturally, a
refusal that needs its own message), add a specific check or checks, inline or in a helper, and
keep the Zod parse beside them wherever it still does useful work.

* A module's entrypoints are its exports. An export assesses what its types cannot carry and its
  sources have not already checked; a private helper trusts its exported caller.
* **A boundary belongs to the export, not the caller.** `Scopepath.vault` is public, so it checks
  its scope every time, and an internal caller holding a checked scope pays for a second check.
  That cost is small, and one function with one behaviour beats a checked public twin and an
  unchecked private one. Inside the package, don't re-check what was checked where it entered.
* **A method deep in a call leaves the kind to whoever knows.** It asserts with a schema, whose
  refusal carries its `Validator` call's kind, and any check written beside it throws with a
  sentence from `Phrases`. A public call that knows more about what the caller was doing re-throws
  with the better kind (below): a name failing a check may be the host's typo (`bad_scope`), a
  damaged row read back, or our own bug. No `ZodError` escapes the public call.
* **One input, one validator.** A function checks what it is handed with one validator, never a
  cascade of validators each taking a part of the input and refusing with its own kind. Checks
  after the parse are fine: one Zod does not express, or a comparison with what the callee holds
  (a record's scope against the one asked, a bag's `user_id` against the bank's). The scope
  validators (`bankScope`, `vaultScope`, `boxscope`) are made in a `bad_scope` call, and anything
  taking a scope's duck may parse it with one; a record's validator refuses with its own call's
  kind, a bad name in it included.
* **Validators are made inside a `Validator(kind, kit => { ... }, sources?)` call**, which
  hands the builder Zod's makers under short names (`obj`, `arr`, `tuple`, `rec`, `oneof`,
  `union`, `discrim`, `lit`), its scalars ready made (`str`, `num`, `int`, `uint`, `bool`,
  `unk`), the whole of Zod as `zod` for the rare rest, and the shared primitives (`label`,
  `user_id`, ...); and wraps each schema it returns so a failed `parse` throws a `VaultError` of
  the call's one `kind`, its message from `Phrases`. Modules of validators in `sources` (star
  imports, `[FooValidators]`) are spread into the kit beneath it, so a kit name wins. A file makes
  its own in-file validators the same way, without bringing names into scope. **Writing one is
  strictly easier than Zod alone**: the body is plain Zod with shorter names, one schema a line,
  and nothing added per line, neither a wrapper call nor an annotation. The primitives the kit
  hands out (`good/checks/primitives.ts`) are plain Zod, and so is a variation made directly from
  a validator (`vaultRecord.pick(...)`): its `parse` throws a `ZodError`, so use it with
  `safeParse`, or make it in a module-level `Validator` call where it should refuse.
* **Catch and re-throw as the more specific, or less leaky, refusal** where the caller knows more
  than the schema did: a record read back from storage fails its `bad_record` schema, and the
  read-back helper re-throws it as `damaged_*`.
* Assess once, then close over the result: on a hot path (a predicate run per row, a lookup per
  render), the factory assesses and the closure compares.
* Not Zod's job: rules about state ("the vault is locked"), which are control flow; rules needing
  async I/O; properties Zod cannot see (whether a CryptoKey is usable). A rule relating several
  arguments does fit: check one object built from them, with `.refine` across its fields.
* **A refusal is as informative as it can be without leaking**: every failing field, each with
  where and what (`applabel: A label is ...; written_at: Too small: ...`), and the paths in
  `meta.fieldnames`. A key repeats only when shaped as one of our field names; any other could
  be the caller's data (`good/checks/validator.ts`, `sayable`).
* Messages never carry the input. Never pass `reportInput`; never interpolate the input into a
  custom message. Zod's own English names a refused value's type, never the value (zod 4.6.7: an
  issue carries `input` only under `reportInput: true`).

**(c) To sanitize shape.** Destructure the fields you need from the parsed output: `obj` strips
the rest, so a vault record, a Vault object or a bank's listing handed in as a scope comes out as
just the scope.

* A bag a person typed gets `strictObject`: stripping would quietly drop a misspelt option. So does
  a stored record (`.strict()`): a field this version does not know is damage, or a newer
  `format`. A scope, taken out of whatever carries it, strips (`.strip()`).
* No transform that changes a name's value (trim, lowercase, coerce, normalize): a name is bound
  into storage and crypto, so refuse instead. A structural transform is fine: a scopepath's
  validator splits it into its parts before checking them.
* A validator that hands out a scope others will hold freezes it: `obj({ ... }).readonly()` (zod
  4.6.7: the output is frozen at runtime and typed `Readonly`).

## 3. Duck typing and a type's shapes

* **Duck typing is the design.** A thing that has a scope *is* one: it carries `applabel`,
  `user_id` and `vaultlabel` as its own fields, never a nested `.scope`. A nested copy raises the
  question of whether the thing and its scope agree; a duck-typed thing has one copy of each name,
  and a function taking a scope takes the thing itself. The more things duck type, the more a
  one-off case is plain `Pick`, `&` and `Omit` surgery.
* **The shapes are there to cut the number of types, not to straiten what a function takes.** Where
  a broader duck is harmless, a parameter accepts it, and one that reads a few fields says so with
  an ad hoc `Pick`/`Partial` where it is declared. A function's behaviour never changes to fit a
  named shape.
* **A field a thing ducks as is frozen, or fixed for the thing's life.**
* **Each main type (vault, box, lease, ...) has a small, fixed set of shapes**, each named for its
  purpose and prefixed with the type (`VaultStamp`, `VaultTombstone`; never a bare `Stamp`):
  * *record*: the fields stored and sent over a wire, as one object schema;
  * *sparse*: a subset of the record's own fields, minus the heavy and sensitive ones, as a list or
    a log shows it, and the shape to reach for wherever the whole record is not needed. An
    associate (a vault's gate, its boxes) is never in it: a shape that wants one adds it beside;
  * *stamp*: the fields fixed for the record's life, which are exactly the fields bound into its
    cryptography;
  * *scope*: the composite id, the names its scopepath is made of;
  * *dna*: what a caller sends to `make` or `ensureVault`, partial in fields with defaults, and
    without any field that must stay under our control (for a vault, its scope);
  * *tombstone*: what a deletion leaves;
  * *snapshot*, for a stateful thing: its sparse shape and what changes beside it (section 5).
* **Each shape's validator is built from the record's** with `pick`, `omit`, `partial` and
  `extend`, and its type is `Z.infer` of that, rather than a hand-written parallel type: a reader
  learns one record and a handful of named subtractions. A record is one object schema, not a union of
  variants (`pick` throws on a union, zod 4.6.7): an optional part is a nullable field.
* **Use each shape's name for what it means, even where two are one type.** `LeaseSparse =
  LeaseStamp` is fine; a log line or a listing takes a `LeaseSparse`, and a ctx a `LeaseStamp`.
* **A class names the shapes it passes for**: `class Vault implements VaultStamp`, `class Box
  implements Boxscope, BoxSparse`. The compiler then holds the class to its duck typing.
  `implements` checks only that the fields exist with their types; the constructor and
  `Object.freeze(this)` make them own and frozen.
* **Freeze what we can**: each record handed out, each object's own fields, each snapshot.
* **Name each outcome a reader must tell apart, even where the types overlap.**
  `VaultRecord | VaultTombstone | DamagedVaultRecord | null` says present, dead, broken, missing;
  `DamagedVaultRecord` is `VaultRecord` to the compiler and a different thing to the reader.
* **A type is `Z.infer` of its validator, beside the concern that checks it.** What has no
  validator yet waits in `types/types.ts`, and leaves it when one is written.
* **Name the important primitives.** A value a host writes by hand gets a plain alias
  (`Boxlabel`); one it never writes is branded by its validator (`PassphraseSalt`, `PrfSalt`,
  `PassphraseCleartext`), so it exists only once parsed and two of a kind never trade places.
* **A facet a type gains is a generic named for the facet**: `Lifecycled<OT>`, `Refused<OT>`,
  `ConsistencyWith<OT>`, where the alternative is a slice named for its one consumer
  (`LeaseVault`).
* **Prescribe the logical record and the atomic unit, never the physical row.** What is read in one
  step and written in one compare-and-write is the contract; how an adapter lays it out (columns,
  jsonb, documents) is its own.
* **Bind whatever is fixed for the thing's life**, and the stamps of what it lives in: a box binds
  the vault's stamp and its own.
* **A part's shapes nest as the part does.** A record holding parts holds them in every shape: the
  gate's sparse shape holds each wayin's sparse shape, never a flat pick of their fields.
* **Bind what is fixed; never bind what counts.** The stamp is bound into every ciphertext the
  record owns; a counter that moves within the record's life (an epoch) is never bound into
  long-lived ciphertext, which would have to be resealed at every move. A short-lived thing made
  under one value of a counter has that value in its own stamp: a lease is granted under one
  `gate_epoch`, so its stamp holds it.
* **A reference to another thing's part keeps a flat field, named as in the owner**:
  a lease's `gate_epoch` names the gate it was granted under, as a foreign key would.
* **One name for one thing, everywhere.** `user_id` in a host's options, a snapshot and storage
  alike; never `userId` for the same value. A host-facing field takes its stored spelling.
* **What one atomic step reads travels together**, its halves apart until checked, so damaged
  data cannot collide with its own fields: `{ vault, boxes }` (`VaultReadResponse`). Checked, it
  is the thing it describes, written out where it is used: a vault's record and its box listing
  are a vault, `VaultRecord & { boxes: readonly BoxSparse[] }`.
* **An interface a host implements is typed as what belongs there**, never `unknown`, with its doc
  block saying what is checked and by whom. The check keeps damage out, not the type.
* **A browser checks what a server relays.** A server is not trusted, so a browser checks each
  record it is sent that it will use. A server's word that a record is damaged it may take: the
  worst a lying server does with that is offer to delete what it could delete anyway. It still
  parses the word itself (a damaged box's label, its kind of damage, its token).
* **A wire sharpens an interface.** A VaultDB's half has the shape its GraphQL relay carries, so a
  browser's adapter passes the server's answer through. Where the two would differ, change the
  VaultDB.

## 4. Crossings, spreading and logging

* **Take a part out by parsing or destructuring, never by spreading the thing.** A spread copies
  only own enumerable fields: a getter on the prototype is lost (`{ ...vault }` drops it while
  TypeScript types it as present), and every other own field comes along.
* **Strip before crossing into host code.** A host's store, callback or checker gets plain data
  picked by its validator, never the thing: `deviceDB.getLease(vault)` would hand the host's store
  the Vault object, `lock()` and all. Nothing that crosses needs a method.
* **Build a stored record from a parsed part**, `{ format, ...CX.vaultScope.parse(thing), ... }`,
  never from a spread of a holder, which would store its other fields.
* **Spreading a thing is harmless.** Its own enumerable fields are what a log line, a spread or
  `JSON.stringify` sees, so they hold nothing sensitive and nothing that garbages a log (large
  values, or objects with behaviour). Where reasonable, they are a strict subset of its record.
* **What a log should not see is private, elsewhere, or non-enumerable**: a `#field`, a separate
  object reached by a method or accessor, or a getter on the prototype.

## 5. Stateful objects and snapshots

* **A stateful object's own fields are its stamp**: enumerable, assigned in the constructor, and
  `Object.freeze(this)` as the constructor's last line. Private `#fields` stay writable under a
  freeze (checked in Node), so every changing value lives in one. A frozen instance cannot be
  spied on; a test spies on a collaborator instead.
* **A method handed out unbound is a getter on the prototype returning a private arrow**:
  `get subscribe() { return this.#subscribe }`. It stays bound, keeps one identity (as
  `useSyncExternalStore(vault.subscribe, vault.getSnapshot)` wants), and no spread sees it.
* **What changes is read through one snapshot accessor**, never through a per-field getter that
  duplicates it: two ways to read one value is a split personality, and per-field reads across an
  await can mix two snapshots.
* **A collaborator gets what it needs when it is made**, not through a public getter on the
  object it serves.
* **A snapshot is frozen plain data**, the same object until something changes
  (`useSyncExternalStore`'s contract). No methods that act (a stale snapshot would act on the live
  object); no cycles (its change check stringifies it).
* **A snapshot carries what a host renders, and nothing it has no use for**, above all nothing we
  would rather not share: a vault's snapshot has its scope, `format` and `vault_tok`, not its
  epochs or a passphrase's salt. Its scope sits flat, so it duck-types as one. **Changing structured parts are slices** that keep their own identity until they change, so a
  memoized component or a selector given one slice skips the others' changes.
* **No derived field the snapshot already implies.** A three-way status computed from two fields
  present is a second copy that must agree with them.
* **A snapshot is the one exception to "spreading is harmless"**: it is render state by contract,
  and may hold an error object or a list.

## 6. Order comes from an explicit list

Anything stored, hashed or bound into a ctx takes its order from an explicit list (the array a
maker joins, the tuple its inverse checks) or from a canonical encoding that sorts keys
(`stableJsonify`, as `cipherCtx` uses), not from an object's key order as it happens to fall. Zod 4.6.7 builds its
output in schema order, but that is undocumented, and JavaScript puts integer-like keys first.

## 7. Scopepaths

* A **scopepath** is where a store files a scope's record: the kind first, then the scope's names
  in order, joined on `ScopepathDelimiter` (`^`), defined once in `utils/consts.ts`:
  `bank^acme^u1`, `vault^acme^u1^main`, `lease^acme^u1^main`, `device^acme^u1^main`,
  `box^acme^u1^main^openai`.
* The kind goes first: a kind suffix sorts each scope before its children only while every segment
  is a lowercase label, and a user_id is not one.
* `Scopepath` is a public module: a host's own key-value adapter files rows with it.
* **`ckey` is a generic map key** again; storage addresses are scopepaths.
* Lookups go by key (`Map.get`, a store's read, an IndexedDB range), never by scanning. A listing
  is for showing; a lookup goes through a keyed map beside it.

## 8. Naming

* **Smush the tag `path` too**: `scopepath`, `Scopepath`, `ScopepathDelimiter`, `Fieldname`.
* **`Boxscope` is the named, illustrative exception** of smushing a noun into `scope`. `VaultScope`
  and `BankScope` keep their two words. The exception stops at the scope: a box's scopepath is
  `boxScopepath` (`BoxScopepath`), like every other `fooScopepath`.
* **`isFoo` is a boolean. A function returning a predicate ends in `Pred`**:
  `withinVaultScopepathPred(scope)`.
* **A validator is named after the parameter it checks**, in that parameter's case (`user_id`,
  `vaultScopepath`), **or, for a function's whole input, after the function with `Input`
  appended** (`dragForceInput`).
* **Enumerations** lead with their values, then the validator, then the type; a wider one spreads
  a narrower: `FooVals = [...] as const`, `foo = oneof(FooVals)`, `type Foo = typeof FooVals[number]`.
* A menu choice is a `kind` (`scopepathkind`); a lookup table is `FooForBar`.
* **`type` is for datatypes**, and `state` is for nothing public: a React app already means its own
  component state by it. Name a status for what it is about: a thing's stage in its life is its
  `lifecycle`.
* **The stamp is the bound fields.** "Bound", "authentics" and "binding" all say *stamp*.
  `cipherCtx` keeps its name for the byte string AES-GCM and HKDF are given, which is the stamp,
  a purpose and a header: `cipherCtx(stamp, purpose, header)`.
* **A sparse thing is `-Sparse`** (`BoxSparse`, `VaultSparse`), never `-Listing`, which reads as
  the list or what holds it, nor `-Listed`: a sparse shape turns up well beyond listings. A response
  is named for the operation's family, not a moment: `VaultReadResponse`.
* Zod's builders reach a validator under the `Validator` kit's short names (section 2); its types
  come in under `Z`, `import type * as Z from 'zod'`. A module that builds outside a `Validator`
  call (the kit's own primitives) imports the builders under the same names.

## 9. Modules and imports

* Star-import a module of related verbs under its Startcase name when the namespace makes the call
  site clear (`Scopepath.vault(scope)`), and give its exports bare names (`vault`, `box`).
* Tree-shaking is no reason either way: named and star imports shake identically (esbuild 0.27,
  rolldown 1.2).
* Picking named fields needs no library: destructure them from the parsed output.
* No `es-toolkit/compat` in this library. Where a pick by a list of names is truly needed, write
  `fieldnames.map((fieldname) => scope[fieldname])` (es-toolkit's core `pick` returns an object,
  whose key order section 6 rules out).

## 10. Tree-shaking facts

The `Validator` factory (section 2) keeps every schema a call makes, used or not; the Coach
accepts that, so the advice below is moot for validators and stays true for everything else.

Measured on 30 validators of which 5 are used, both bundlers, classic Zod and zod/mini alike:

* An unannotated top-level validator is never dropped.
* One `/* @__PURE__ */` before a chain is not enough. Annotate **every** call in the chain, or wrap
  the whole expression once: `/* @__PURE__ */ (() => str().min(1).max(9))()`.
* `sideEffects: false` drops a module nothing imports from; nothing inside an imported one.
* The library is the real cost: the same five validators bundle to 24-27 KB gzipped with classic
  and 6.7-6.9 KB with mini. The 25 unused validators cost 130-170 bytes.

## 11. Where today's guidance changes

* STYLE.md, *Validation*: "Zod's issues can carry the input they refused" holds only under
  `reportInput`; say "never pass `reportInput`, never interpolate input".
* STYLE.md, *Validation*: "never a hand-written `if (n > 99) throw` beside it" (STYLE.md:175)
  becomes section 2 (b): Zod in general, a specific check beside it where warranted, and the Zod
  parse kept wherever it still does useful work.
* STYLE.md and the core's `eslint.config.mjs`: "classic zod does not tree-shake" becomes section 10.
* `src/validators.ts`: `NameFloor` carries one outer `@__PURE__`, which esbuild did not honour.
* CLAUDE.md, *Non-Negotiables*: "validate at module entrypoints" names an entrypoint as each export
  of a file module (section 2b).
* VOCABULARY.md's `ckey` row and STYLE.md's naming list: `ckey` is a generic key; storage addresses
  are scopepaths. VOCABULARY gains *stamp*, *sparse*, *dna* and the shape names (section 3).
* STYLE.md, *Naming*: stored fields underbar_case, everything else camelCase, gains "a host-facing
  field that is a stored field takes its stored spelling" (section 3).
* The core's `eslint.config.mjs`, `@typescript-eslint/no-unused-vars`: `varsIgnorePattern`,
  `argsIgnorePattern` and `caughtErrorsIgnorePattern` go from `^_` to `^_[a-zA-Z0-9]`, so only a
  named ignore passes.
