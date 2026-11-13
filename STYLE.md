# Style Guide

How the `.ts` files in this repository read: the conventions a reviewer checks and the linter
does not. Read the section you need; a reviewer is handed it whole. The lower-yield rules and the
measurements behind a few of these are in `notes/more_style.md`.

The core's `eslint.config.mjs` (`packages/safebyok/`) is the source of truth for anything
mechanically enforceable; where it and this document disagree, the linter wins and this document
is a bug. These are defaults with reasons. Where one makes a piece of code worse, say so and
propose the exception.

## Imports

* No barrel files beyond the package's entry points: import from the file that defines the thing.
* **A module of related functions around one concern is imported whole**, under its Startcase
  name: `import * as Scopepath from './scopepath'`, then `Scopepath.vault(scope)`. Its exports
  have bare names, either vigorous verbs or the noun they make: `check`, not `namesCheck`, and
  `vault`, not `vaultScopepath`.
* **A module with one primary noun** is imported by name, along with its companions:
  `import { Box, BoxKinds } from './box'`.
* **Validators are reached through a namespace**, tests included: a `src/shapes/` module is
  star-imported under the short name its header gives (`import * as CX from
  '../shapes/shapes-core'`, then `CX.bankScope.parse(opts)`), and its types are imported by name.
  A file that imports many validators by name grows a list that churns, and takes names its locals
  want (`vaultRecord`, `whisper`); one that needs one or two may name them. Outside the core, a
  file that reaches many star-imports `safebyok` as `Safebyok`, and an adapter star-imports
  `safebyok/storage` as `DB` (`DB.vaultRow`).
* **The core's `src/shapes/` holds the validators a module exports**, and no other module exports
  one. A validator a module keeps to itself stays beside its only user, made in a `Checkers` call
  at module level (`helpers/validator.ts`'s and `gate.ts`'s `Checks`, `device.ts`'s `HostChecks`).
* **Pick fields by destructuring the parsed output.** Where a pick by a list of names is truly
  needed, write `fieldnames.map((fieldname) => scope[fieldname])`: a pick helper returns an
  object, whose key order *Order comes from an explicit list* rules out.

The test for a module between these rules: does the import put *one well-named noun* in scope,
or several loose verbs? One noun is the goal.

## Naming

**No single-letter names** (the linter refuses them). The sanctioned short names are `ii` and `jj`,
for a `for` loop's own counter or the index a `map` callback is handed. An index that arrives from
outside, as a parameter or a field, is an `idx` or a `fooIdx`.

**Never bare `name`, `value`, `node`, `error` or `query` as a variable name.** There is almost
always a salient prefix: `vaultlabel`, `profilename`. The linter refuses these, and `key`, as a
variable, parameter or destructured name; a property spelled that way (`{ name: 'AES-GCM' }`)
is someone else's interface, and fine.

**The cast is named in VOCABULARY.md** -- whisper, box, vault, passphrase, each key and its
encrypted form -- and those names are used as written, never a synonym. Never `data`, `contents`
or `payload` for a variable or field we control: it is a whisper, or a whisperCiphered.

**Never bare `key`.** In this package a key is cryptographic until proven otherwise, so:

* a **cryptographic key** is named for its role, as VOCABULARY.md has it: `passphraseKey`,
  `bankKey`, `boxKey`, `leaseKey`. Not `kek` or `dek`. A WebCrypto `CryptoKey` and its
  raw bytes are told apart by a tag: `boxKey` is the `CryptoKey`, `boxKeyBytes` the
  `Uint8Array`.
* a **map key** is a `ckey` (see *Tags*).

**Smush the tags `name`, `kind`, `label`, `path` and `bag` into one word**: `vaultlabel`,
`boxlabel`, `woodkind`, `scopepath`, `scopepathkind`, `ScopepathDelimiter`, `Fieldname` -- but not
`fooCount` or `fooIter`.

**`Boxscope` is the only named exception** that smushes a noun into `scope`, there to show the
rule. `VaultScope` and `BankScope` keep their two words. The exception stops at the scope: a box's
scopepath is a `boxScopepath` (`BoxScopepath`), like every other `fooScopepath`.

**Never `type` to mean "kind"**, not even inside an identifier. `type` is reserved for a datatype;
a menu choice is a `kind` (`scopepathkind`) or a `flavor`.

**A boolean is `isFoo`, an enumeration a plain noun, and `state` is a smell.** A boolean is `isFoo` on an
instance and in a snapshot alike: `box.isVeiled` and the snapshot's `isVeiled`, never a bare
adjective (`veiled`). An enumeration is named for what it tells, a plain noun: `box.exposure`,
typed `BoxExposure`. **A two-valued enumeration is a boolean**: `isLocked`, never a `lockState` of
`'locked' | 'unlocked'`. **`state` names nothing public**: a React app already means its own
component state by it, and the word says only that something changes. Name a status for what it is
about: a thing's stage in its life is its `stage`. A stored field keeps its stored spelling
(below).

**A function returning a predicate ends in `Pred`**: `withinVaultScopepathPred(scope)`.

**A boolean says the positive**: `isEnabled`, not `isDisabled`, whose every negation reads as a
double negative.

**A validator is named for the parameter it checks**, in that parameter's case (`user_id`,
`salt_size`); for a function's whole input, `fooArgs` (`leaseSealArgs`); for a shape, its type's
name lowerCamelCased (`boxSparse` checks a `BoxSparse`). No `Shape` suffix, except where a local
or option wants the plain name (`keyDeriverShape`, `loggerShape`).

**An enumeration's values are a `fooVals` list in `shapes/shapes-enums.ts`**, its type
`typeof fooVals[number]`; its validator, `oneof(EX.fooVals)`, sits with the shapes that use it.

**A thing's shapes are named for their purpose, prefixed with the type**, from the set in
VOCABULARY.md *Shapes*: `VaultRecord`, `VaultSparse`, `VaultStamp`; never a bare `Stamp`.

**A name is the doc block's first line, compressed.** Write that line (*Comments and doc
blocks*), then read the name against it: the verb promises what the line says, in the vocabulary
of the verbs below. A method that does its work by calling `getBox` keeps that verb
(`getBoxOrThrow`), not `readBox`; one that creates a vault on every call is `createVault`, not
`ensureVault`, because `ensure` promises idempotence. A name that promises more or less than its
first line is a bug in the name.

**The receiver is part of the name; nothing else is.** Read a name where it is called:
`box.put()` and `vault.putBox(box)` both say "put the box", and both are good. A verb leaves its
object to the receiver only when the receiver *is* the object: `gating.conclude()` concludes the
gating, and one that concludes the user's prompt is `concludePrompt()`. Being private, or the only
method of its kind, earns no shortcut: neither shows at the call site or in an `rg`, and a second
method ends it. Never `putSelf`: the receiver already says it.

**The verbs, at a glance.** Each promises this much and no more; the paragraphs below say more.
A function named for what it returns (`fooOf`, `fooRefusal`) has no side effects: one that acts
is named for the act.

| Name | Promises |
| --- | --- |
| `getFoo` | Reads foo by its unique key (a composite one is fine), resolving it or null for none; one with no null form refuses instead, as `getWhisper` does. Changes nothing. |
| `findFoo` | Reads the first foo that meets a criterion, or null for none. Changes nothing. |
| `putFoo` | Puts foo to storage, resolving it as stored. |
| `delFoo` | Deletes foo. |
| `ensureFoo` | Has foo or makes it so, idempotently, and returns it. |
| `makeThing`, `Thing.make` | Synchronous: gives the thing, in memory. Puts nothing. Where a `build` exists too, `make` is what it calls, and `make` calls `new`. |
| `buildThing`, `Thing.build` | The same, asynchronous. Where a `make` exists too, it goes `build`, then `make`, then `new`. |
| `checkFoo` | Refuses a bad foo. Returns nothing. |
| `checkedFoo` | Refuses a bad foo, else returns it, typed. |
| `parseFoo` | Refuses a bad foo, else returns it cleaned or converted (*Validation*). |
| `demandFoo` | Synchronous: throws unless foo is true. |
| `isFoo`, or the condition (`isUnlocked`) | Synchronous yes or no. Never throws. |
| `fooOf(thing)` | Pure: the foo derived from `thing`. |
| `tryFoo` | `foo`, resolving an `Outcome` instead of throwing. |

**`make` and `build` say whether to await; the suffix says what comes back.** With no suffix, the name is the thing itself; a suffix says you get something else:

| Name | Gives you |
| --- | --- |
| `makeVault`, `buildVault` | The vault is the thing: a `Vault` instance. |
| `makeVaultRecord` | A database row, as a plain object. |
| `makeVaultDna` | A dna: it has no controlled fields. |
| `makeVaultProps` | Field values: strictly, neither a record nor a dna. |

**A function that only checks and refuses is not an `ensure`**: it is a `check`
(`checkUnwraps(wrongCleartext)`), a `demand` (below), or a `parse` when it also returns the
cleaned value. An `ensure` that returns nothing is misnamed.

**A condition gets up to three members**: a synchronous yes/no query named for it
(`bank.isUnlocked`); a synchronous `demandFoo` that throws when it does not hold
(`bank.demandUnlocked()`); and, only where a caller needs it, an async `ensureFoo` that makes it
so (`bank.ensureUnlocked()`). The query is the non-throwing form, so there is no `tryDemandFoo`.

**A guard that asks several things is named for what it asks, with `-able` where that reads
well**: `demandDeletable`, `demandUnsealable`, not `demandReadyToDelete`; a plain phrase where
`-able` reads badly (`demandBoxesUsable`). Its `ensure` takes the same name. A guard that asks one
thing states that fact: `demandUnlocked`, `demandPresent`.

**`put` resolves what is stored.** On success, `putFoo` resolves the foo as storage now has it,
not what was sent: not the argument it was handed, not `this`, not a boolean. Where the stored foo has
key material, a model's verb resolves its summary: `vault.putWayin()` resolves the vault, whose
`vault.snapshot.gate` then shows the way in as stored; `VaultDB.putBox()` resolves the record.

**Stored fields are underbar_case** (`salt_b64`, `written_at`): they are written to someone
else's database, and stay one spelling from the wire to the code. **One name for one thing,
everywhere**: a field with a stored value keeps its stored spelling wherever it goes, in the
facades a record passes through, a host's options and a snapshot alike. A key deriver's
`key_deriver_label` is written into a wayin as it is, and `user_id` is never `userId`. Other
names are camelCase: a field with no stored counterpart (a snapshot's `damagedBoxes`), a verb
(`getUserId`), a concept (`keyDeriverLabel`, "the label of the key deriver").
The tag smushing above is for a label that names a thing (`boxlabel`).

**A time is UTC epoch milliseconds, an integer** (`registered_at: 1760000000000`), in a stored
record, a snapshot, a test fixture and the demo alike: not an ISO string or a `Date`. `nowMillis()`
yields one, and a field named `*_at` is one, checked by `epochMillis`.

Specificity is a virtue (`saltBytes` says it is bytes), but don't tag the obvious: `title`, not
`titleStr`. When genericity is exactly the point, use the tag bare: `encode(bytes)`.

### Tags

* `ckey` -- a collection key: a string for a map, an index for an array. `ckeys` for several.
  Never a storage address, which is a scopepath.
* `scopepath` -- where storage files a scope's record (*Scopepaths*); `vaultScopepath`,
  `boxScopepath` for a particular kind.
* `idx` -- an array index, known to be an integer.
* `val` -- a truly generic value. `vv` and `kk` are second choices inside a lambda.
* `kind`, `flavor` -- an identifier picked from a fixed menu. `label`, `handle` -- an identifier
  freely chosen, usually by a user (`vaultlabel`, `boxlabel`). All four are strict: `\w` only,
  starting with a letter, ending with a letter or digit, two or more characters.
* `_id`, `_tok` -- a stored `_id` is a hard identifier a record is found by (`credential_id`); a
  random token that is only ever compared is a `_tok` (`revision_tok`, `vault_tok`, `device_tok`). VOCABULARY.md
  has the rule.
* `bytes` -- a `Uint8Array`; `fooBytes` for a particular one. `b64` -- base64url text of bytes;
  `fooB64`.
* `bag`, `foobag` -- a generic key-value map; `foos` for a map of foos keyed by something obvious.
  `FooForBar` for a lookup table.
* `arr`, `foos`, `foolist` -- arrays, as taste informs: is the foo-ness or the list-ness salient?
* `str`, `num`, `obj` -- a generic string, number, or something specifically object-like.
* `err` -- an error. **Never** `error`.
* `count` -- a reported quantity; `qty` or `nFoos` -- a requested one.
* `beg`/`end` for a range, `prev`/`curr`/`next` for a chain, `ante`/`post` for before and after
  a step.
* `name` -- an identifier exactly isomorphic with what it names. Prefer `title`, `kind`, `label`
  or `handle` when one fits better. `title` is human-readable, never an identifier.

## Variables and functions

**Arrows for closures, `function` for functions.** A function made to be passed as a value -- a
callback, what `map` or `filter` is handed, a `Checkers` builder, a handler given to a host -- is
an arrow. Every other named function is a `function` declaration, module-level or nested, and so
is one that needs `function`'s own binding of `this`. The linter's `func-style` cannot tell the
two apart, so this is kept by hand.

## Build for maintenance

* **Build for ease of maintenance, not ease of implementation.** A module's customer uses one
  method; that method should read whole on its own, without tracing into a generic.
* **Don't DRY short bodies through a generic.** Spelled out, a maker and its inverse read as
  mirror images, each clear at a glance (`CX` is the core's scope checks, `shapes/shapes-core.ts`):

  ```ts
  export function box(scope: Boxscope): BoxScopepath {
    const        { user_id, banklabel, vaultlabel, boxlabel } = CX.boxscope.parse(scope)
    return ['box', user_id, banklabel, vaultlabel, boxlabel].join(ScopepathDelimiter)
  }

  export function boxscope(boxScopepath: BoxScopepath): Boxscope {
    const [_scopepathkind, user_id, banklabel, vaultlabel, boxlabel] = CX.boxScopepath.parse(boxScopepath)
    return               { user_id, banklabel, vaultlabel, boxlabel }
  }
  ```

  A field destructured but left out of the array is an unused name, which the linter flags; a
  field-list helper gives no such check. A generic helper earns its place only when it is boring
  and longer than the bodies it serves.
* **Name what you ignore.** A binding left unused on purpose gets a name starting with `_` that
  says what it is (`_scopepathkind`), never a hole (`[, banklabel]`) and never a bare `_`. The name
  records that the part exists, where it sits, and that skipping it is deliberate. The linter
  passes only a named ignore: `_` and a letter or digit.
* **Write the crucial detail where it shows.** A prefix of every box in a vault ends in the
  delimiter; say so with `+ ScopepathDelimiter`, not with an empty last part that `join` turns
  into one.
* **Don't unwind what you will only rewind.** When you have a scopepath and need a related one,
  work on the text. Don't parse it into a scope to join it again.
* **Accept one form of input.** A function accepting a scope *or* its scopepath branches on its
  argument and trusts one branch; accept the scope.
* **Constants shared across modules** (`ScopepathDelimiter`) live in `consts.ts`, which
  imports no runtime value, so any module can name them without a cycle.
* **Familiar over cute.** A named target and `===` beats an equality-predicate factory:
  `const target = Scopepath.vault(thing)`, then `scopepaths.some((scopepath) => scopepath === target)`.
  A predicate factory earns its place where it hides a detail that is easy to get wrong, as the
  scopepath prefix test does (*Scopepaths*).

## Braces and layout

* A short guard read in passing stays on one line, braced: `if (nope) { return }`. One that
  deserves attention is expanded.
* Parenthesize and space every negation: `if (! unlocked) { ... }`, so it has the visual weight
  of what it does.
* **Visual weight is didactic weight.** A routine check reads as one quiet line; a check that
  guards something that matters is spread out to be noticed:

  ```ts
  if (! opts.vaultlabel) { throw new VaultError('missing_label', 'A vault needs a label.') }
  //
  if (stored.key_deriver_label !== Argon2idWebV1.key_deriver_label) {
    throw new VaultError('unknown_key_deriver', 'This vault was written by a newer version of safebyok: update the package to open it.')
  }
  ```

* **Parallel construction shows in the whitespace.** Align it into columns: values in an object
  literal, rows of an example table. When one line takes fields out and the next puts the same
  fields back, pad so the field lists start in the same column (the example in *Build for
  maintenance*): what was extracted and what is injected is obvious at a glance, and a field
  dropped or swapped stands out.

## Strings

`'` by default. `"` for a string likely to contain an apostrophe -- prose, an error message, and
every `describe` and `it` title -- so it reads without a backslash: `"That passphrase didn't
unlock the vault"`. When forced to quote a key, `"`. In a table of examples, switching quotes
between columns lets the editor align them (see *Tests*).

## Validation

A function's input rules are declared once, in a validator, and its TypeScript types come from it
(`Z.infer`) or are checked against it by an assertion (*Shapes and duck typing*), so the signature and the
checks cannot drift apart. Validators are made with `helpers/validator.ts`'s kit (`Checkers`,
`Checker`, `objCheck`, `objStrict`, `objStrip`), whose doc blocks are its manual. A check of an
object whole (`.refine()`, `.readonly()`) goes inside the builder: chained onto the validator the
kit returns, it would refuse as plain Zod does.

**Always at a boundary**: what comes off the wire; records read back from storage, which is
someone else's database and may hold a vault another version of this package wrote; a published
package's exports; `Class.make` and any constructor accepting outside input; a host's options; what
a host's callback returns (a strength checker's verdict, a key deriver's output). A failure there
is a refusal with a `kind` the caller can branch on.

**A constructor validates its arguments**, in a parse as its first line, even when the `make` or
`build` that calls it parsed them already: it is an entry point of its own.

**For preconditions, one line is the norm.** A function pulls what it needs out of what it was
handed, and checks it, in one parse: `const { user_id, banklabel } = CX.bankScope.parse(thing)`.
Where a validator exists, prefer that parse to a hand-pick (`{ banklabel: x.banklabel, ... }`), an
if-then precondition, or a `safeParse` followed by a sentence of its own: the kit's refusal names
the failing field. A module-local variation is made at module level, not per call. Add a check
beside the parse for a rule Zod does not express naturally, or a comparison with what the callee
has.

* **A boundary belongs to the export, not the caller.** An export checks every time, an internal
  caller included; one function with one behaviour beats a checked public twin and an unchecked
  private one. Inside the package, don't re-check what was checked where it entered.
* **Clear intent at the door, clean data inside.** An entrypoint accepts a host's plain way of
  saying a thing and fills in defaults in the schema. What it keeps, and every stored field, is
  bounded: `leaseHours: Infinity` becomes the longest finite window.
* **Not Zod's job**: rules about state ("the vault is locked"), which are control flow; rules
  needing async I/O; properties Zod cannot see (whether a CryptoKey is usable). A rule relating
  several arguments does fit: check one object built from them, with `.refine` across its fields.
* **One input, one validator.** A function checks what it is handed with one validator, not a
  cascade of validators each accepting a part and refusing with its own kind.
* **Deep code leaves the kind to whoever knows.** A method deep in a call asserts with a schema
  and leaves its kind be; the public call that knows what the caller was doing re-throws with the
  better kind (a name that fails may be the host's typo, `bad_scope`, or a damaged row read back,
  `damaged_*`). No `ZodError` escapes a public call.

**What a refusal says.**

* **Every sentence a check says lives in `phrases.ts`**, star-imported as `Phrases`, so wording,
  tone and quoting nothing are reviewed in one place.
* **A refusal never repeats a value from its input.** It may name the fields involved. No handler
  sifts broken input to explain it: a catch only aligns the kind and attaches context.
* **Frame a refusal of a host's options in the parse**, `parse(opts, { where, advice })`, not in a
  catch that rethrows. Never `Z.config`: it is the host's Zod too.

**Strict or strip.** A shape taken out of whatever carries it (a scope, a stamp, a sparse shape)
strips, so a Vault object, its record or its snapshot passes as any of them, and destructuring the
parsed output sanitizes it. Three things are strict: a bag of options a person typed, where
stripping would quietly drop a misspelt option; a stored record, where a field this version does
not know is damage or a newer format; and a box's stamp, where a field beside its own would be
shown but not bound. Say why beside any other strict site.

**No transform that changes a name's value** (trim, lowercase, coerce, normalize): a name is bound
into storage and crypto, so refuse instead. A structural transform is fine: a scopepath's
validator splits it into its parts before checking them.

## Shapes and duck typing

* **Duck typing is the design for data.** A thing that has a scope *is* one: it carries
  `user_id`, `banklabel` and `vaultlabel` as its own fields, never a nested `.scope`. A nested copy
  poses the question of whether the thing and its scope agree; a duck-typed thing has one copy of
  each name, and a function accepting a scope accepts the thing itself. The more things duck type, the
  more a one-off case is plain `Pick`, `&` and `Omit` surgery. A bag between our modules, a test's
  fake and a world are ducks; a DB or a function a host hands in to be called is not (below).
* **A parameter for data accepts any duck of the shape it reads.** The shapes are there to cut
  the number of types, not to narrow what a function accepts: one that reads a few fields says so
  with an ad hoc `Pick` or `Partial` of a named shape where it is declared, never a type literal
  written out, which loses cmd-click and the shape's doc blocks. A function's behaviour never
  changes to fit a named shape.
* **A world is a `Pick` of its class.** What a listing reaches back into is
  `Pick<Vault, 'clock' | 'sealStampedString' | ...>` or `Pick<Bank, ...>`, never a third interface
  beside the class: cmd-click goes to the class's member and its doc block, and a test's fake
  world still passes.
* **A field a thing ducks as is frozen, or fixed for the thing's life.**
* **Each main type (vault, box, lease, ...) has a small, fixed set of shapes**, VOCABULARY.md
  *Shapes* names them: record, sparse, stamp, scope, dna, tombstone, snapshot. They are one family,
  built from each other with `pick`, `omit`, `partial` and `extend`, never written twice. A record
  is one object schema, not a union of variants: an optional part is a nullable field.
* **Use each shape's name for what it means, even where two are one type.** `LeaseSparse =
  LeaseStamp` is fine; a log line or a listing takes a `LeaseSparse`, and a ctx a `LeaseStamp`.
* **A part's shapes nest as the part does.** A record that has parts has them in every shape: the
  gate's sparse shape contains each wayin's sparse shape, never a flat pick of their fields.
* **A class names the shapes it passes for**: `class Lease implements LeaseStamp`. The compiler
  then enforces the class's duck typing. `implements` checks only that the fields exist with
  their types; the constructor and `Object.freeze(this)` make them own and frozen.
* **Freeze what we can**: each record handed out, each object's own fields, each snapshot.
* **Name each outcome a reader must tell apart, even where the types overlap**: `Fetched` says
  whole, sparse or dead, though every record is a sparse to the compiler.
* **A shape's type is `Z.infer` of its validator, or an interface checked against it: choose by
  the reader.** An in-repo bag's is `Z.infer`, with a `/** */` on each prop. A host-facing contract,
  whose `.d.ts` is the product, gets an `interface` with a doc block on each member, and an
  equality assertion beside its checker keeps the two from drifting (`DeviceOpts`).
* **Name the important primitives.** A value a host writes by hand gets a plain alias
  (`Boxlabel`); one it never writes is branded by its validator (`PassphraseSalt`, `PrfSalt`,
  `PassphraseCleartext`), so it exists only once parsed and two of a kind never trade places.
* **A facet a type gains is a generic named for the facet**: `Tombstone<SparseT>`,
  `Refusing<SchemaT>`, not a slice named for its only consumer.

**Records, stamps and what is bound.**

* **Prescribe the logical record and the atomic unit, never the physical row.** What is read in
  one step and written in one compare-and-write is the contract; how an adapter lays it out
  (columns, jsonb, documents) is its own.
* **Bind whatever is fixed for the thing's life**, and the stamps of what it lives in: a box binds
  the vault's stamp and its own.
* **Bind what is fixed; never bind what counts.** The stamp is bound into every ciphertext the
  record owns; a counter that moves within the record's life (an epoch) is never bound into
  long-lived ciphertext, which would have to be resealed at every move. A short-lived thing made
  under one value of a counter has that value in its own stamp: a lease is granted under one
  `gate_epoch`, so its stamp has it.
* **A reference to another thing's part keeps a flat field, named as in the owner**: a lease's
  `gate_epoch` names the gate it was granted under, as a foreign key would.
* **What one atomic step reads travels together**, its halves apart until checked, so damaged
  data cannot collide with its own fields: `{ world, boxes }` (`BoxesFetched`). Checked, it
  is the thing it describes, written out where it is used: a vault's record and its box listing
  are a vault, `VaultRecord & { boxes: readonly BoxSparse[] }`.

**Interfaces a host implements** (brands, a host's function wrapped once, what a browser checks of
a server) are designed in `notes/more_style.md` *Interfaces a host implements*.

## Crossings, spreading and logging

* **Take a part out by parsing or destructuring, never by spreading the thing.** A spread copies
  only own enumerable fields: a getter on the prototype is lost while TypeScript types it as
  present, and every other own field comes along. The linter refuses a spread of a class instance
  (`no-misused-spread`). When a caller wants a thing's fields as plain data, a getter returns a
  frozen shallow copy of its fields (`vault.stamp`).
* **Strip before crossing into host code.** A host's storage, callback or checker gets plain data
  picked by its validator, never the thing: `deviceDB.getLease(vault)` would hand the host's DeviceDB
  the Vault object, `lock()` and all. Nothing that crosses needs a method.
* **Build a stored record from a parsed part**, `{ format, ...CX.vaultScope.parse(thing), ... }`,
  never from a spread of the object that has it, which would put its other fields into the record too.
* **Spreading a thing is harmless.** Its own enumerable fields are what a log line, a spread or
  `JSON.stringify` sees, so they have nothing sensitive and nothing that clutters a log (large
  values, or objects with behaviour). Where reasonable, they are a strict subset of its record.
* **What a log should not see is private, elsewhere, or non-enumerable**: a `#field`, a separate
  object reached by a method or accessor, or a getter on the prototype.

## Stateful objects and snapshots

* **A stateful object's own fields are its stamp**: enumerable, assigned in the constructor, and
  `Object.freeze(this)` as the constructor's last line. Private `#fields` stay writable under a
  freeze, so every changing value lives in one. A frozen instance cannot be spied on; a test spies
  on a collaborator instead.
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
  epochs or a passphrase's salt. Its scope sits flat, so it duck-types as one.
* **Changing structured parts are slices** that keep their own identity until they change, so a
  memoized component or a selector given one slice skips the others' changes.
* **No derived field the snapshot already implies.** A three-way status computed from two fields
  present is a second copy that must agree with them.
* **A snapshot is the only exception to "spreading is harmless"**: it is render state by contract,
  and may contain an error object or a list.

## Order comes from an explicit list

Anything stored, hashed or bound into a ctx takes its order from an explicit list (the array a
maker joins, the tuple its inverse checks) or from a canonical encoding that sorts keys
(`stableJsonify`, as `cipherCtx` uses), not from an object's key order as it happens to fall:
Zod's output order is undocumented, and JavaScript puts integer-like keys first.

## Scopepaths

A **scopepath** is where a storage files a scope's record (VOCABULARY.md): the kind first, then the
scope's names in order, joined on `ScopepathDelimiter` (`^`, from `consts.ts`), such as
`box^u1^acme^main^openai`. `Scopepath` is a public module: a host's own key-value adapter files
rows with it.

* The kind goes first: a kind suffix sorts each scope before its children only while every segment
  is a lowercase label, and a user_id is not one.
* **Lookups go by key** (`Map.get`, a storage's get, an IndexedDB range), never by scanning. A
  listing is for showing; a lookup goes through a keyed map beside it.
* **A prefix test goes through the module's predicate**, not a hand-written `.startsWith`: the
  prefix must end in the delimiter, or `vault^u1^acme^main` matches `main2`'s rows.

## Control flow and refusals

* **Simple, analyzable control flow comes before UX niceties** while the control flow matures. Add
  no retry, refresh, re-read or "if X then try Y" to the core: it is hello, then unlock, then the
  operation. If that makes for a poor experience, that is evidence of a design to fix outside the
  current work.
* **A refusal or a log line is safe, specific, actionable and empathetic.** Safe: no secret
  material in the message, a `cause` or `meta`. Specific: what went wrong, and a `refusalkind` to
  branch on. Actionable: what to do next. Empathetic: a failure (misuse, bad news) speaks to the
  developer integrating the package; a condition speaks, calmly, to the user who will see it.
* **A guard lives in what an entrypoint calls.** A public entrypoint's `demandFooable` includes
  `demandEnabled` and whatever else that entrypoint needs. A primitive, a private helper or a
  method that only prepares another includes none. Demand again only at a critical seam,
  synchronously before the critical call (an unseal, a put). A guard upstream of one already on
  the path is noise.

## Comments and doc blocks

**WRITE PLAIN ENGLISH** `#plain-english`. Sometimes a sentence fragment is enough. Usually a doc block is one line of readable prose describing the essentials, and when warranted, important details follow on the next lines.

`/** */` for doc blocks, `//` for a running clarification or commented-out code. Bulleted lists use `*` at the top level and
`-` below, indented two spaces per level.

**A doc block is as short as its purpose, and together with its signature says what the contract delivers.** Its first
line rests on the `/**`: a few words to a full line, so the essentials may be read with the code folded. Gauge its length and register against the doc of a method with similar complexity and flexibility from your memory or training: usually one line, rarely more than a few (library entrypoints excepted).
The first line may run long to accommodate surprising behavior `#one-sentence-headline`, but it's rare for a function's line to be longer than its signature.
A member that will not describe in a line is a smell: report it.

* **Every export gets a doc block; a private member gets a phrase** `#a-helper-gets-a-phrase` (``/** The whisper of `record` */``). Both answer the caller's three questions and no others `#three-questions`: when
  do I call it, what do I get, what would I otherwise get wrong. Never who calls it, nor what a sibling does.
* **A doc block has no past and no future** `#purpose-not-path`: nothing on how the code came to be, what it replaced,
  which thread or ruling shaped it, why it is built this way, or what is next. A reason worth keeping is a `//` comment
  above the block (below); a caveat, a progress note or an open question goes to `human/` or the whiteboard, never here.
* **A doc block does not read the body aloud** `#purpose-not-machinery`: not the steps or their order, the helpers it calls,
  the fields it touches, or the state a refusal leaves behind. The body is a line below, and a caller who needs it will open
  it. The test: cover the body and ask of each sentence whether the caller still needs it.
* **The first sentence names the act or the thing** `#name-the-act`. A function that puts, decrypts, asks the user or sends opens with that
  verb: `Create a new box for whisper (encrypted) and sidecar (readable), sealed against the box metadata`. A lookup, a type
  or a constant opens with what it is or returns: ``Vault **or tombstone** listed at `scope`, null if absent.`` When that
  noun needs a clause to describe it, open with the verb instead: `Classify a vault request's outcome, based on the stored row`. Read the
  member's name against that sentence (*Naming*). It carries one qualifier at most; anything more is a sentence of its own.
* **Replace multiple fragments with a sentence** `#use-sentences`. The usual signs: a semicolon joining two facts, a list with its verb gapped out (`a row or record, 'bad_record'; a cutoff,
  'bad_option'`), a clause hung on "as", "so", "once", "since" or "which", and "one" standing in for a noun you cut. Each
  is a cue to rewrite as a sentence, not a ban.
* **A member's block names no refusal catalog** `#no-refusal-catalog`. The thrower's doc and the `Outcome` type carry the
  kinds, and a class or module doc may say in one sentence what misuse refuses. The only kind worth naming is a condition the
  caller branches on in normal use: `stale_write` on a put, `wrong_passphrase` on an unlock. Before naming one, taste it
  against those two from memory: a kind of lesser salience goes unnamed. Where a caller meets a refusal in normal use, say
  what to do instead `#say-what-to-do`: `Precede with await vault.beginWatch(), repeated to force a refresh`.
* **The guarantee is the line worth writing** `#say-the-guarantee`. What the call proves, or what a caller could get wrong about a secret, goes
  in: `Extracting the whisper authenticates that the object, all but its sidecar, has not been modified since it was sealed`.
* **The lower-yield rules** (option lists, guards' predicates, the reason above, pointing instead of redefining,
  `@param`, `@example`, sectioning a long file) are in `notes/more_style.md`, with their tags; a review may still cite one.
* **Facts come from the code** `#facts-from-the-code`, never from the old prose or the test titles. Where they disagree, write what the code does
  and report it; the doc never changes behaviour.
`notes/gallant-docblocks.md` has a Goofus and Gallant pair for each of these rules, by tag.

Well-named, short functions rarely need running comments. A comment that narrates the code, makes
up for a poor name, or marks off a stanza that should be its own function is a sign to rewrite.

## Tests

Vitest, in each package's `tests/`, path for path with its `src/`: `src/foo/bar.ts` is tested in
`tests/foo/bar.test.ts`. A test file past about 1,500 lines becomes a folder, `tests/foo/bar/`, of
`bar-<theme>.test.ts` files named for what a reader would look for (`bar-races`, `bar-refusals`),
with the helpers they share in a `world.ts` beside them. A module reached only through another's
public verb (`vault-opts.ts` through `Device.make`) is tested beside that verb. Every export is
tested, in proportion to what it does and what a caller could get wrong.

* **Test helpers come through one door, `tests/test-helpers.ts`, star-imported as `TH`**
  (`TH.scopeOf('u1')`). A new helper goes in its part under `tests/test-helpers/` and is
  re-exported from the door. The core's door is published as `safebyok/testing`, and another
  package's door re-exports it, so each test has one `TH`. A helper that builds JSX lives in
  `tests/test-helpers-react.tsx`, which the door re-exports.
* **Assertions are chai-style**: `expect(foo).to.eq(bar)`, `to.deep.equal` for an object or
  array, `to.have.lengthOf`, `to.throw`, `to.have.members`, and `to.be.null` rather than
  `to.eq(null)`; not Vitest's `toBe`, `toEqual` or `toHaveLength`. Two Vitest forms have no chai
  spelling and are fine: `await expect(promise).rejects.toThrow(...)` and `toMatchSnapshot()`.
* **A helper named `expect...` must assert**: the linter counts a call to one as the test's
  assertion. A helper that doesn't assert gets another name (`check...`, `read...`).
* **A title is one plain clause naming the behaviour**: `it("refuses a misspelt field")`, not
  `"refuses a misspelt field as 'bad_option', as its second example shows"`. It quotes a refusal
  kind only where a customer checks for it (`stale_write` is API, `bad_record` is not); the linter
  holds that list. A test that covers an `@example` says so on its first line,
  `// putBox @example 2`. `notes/gallant-test_titles.md` has the pairs.
* **Each case ties to a plausible failure**: what null, undefined or a missing value mean; an
  absurd type (`seal(42)`); a not-quite-absurd one (a salt one byte short, a passphrase of only
  whitespace, a vault written by a newer version).
* **For anything that holds a secret, test what must not happen**: the wrong passphrase is
  refused, tampered ciphertext is refused, an error does not carry the secret, locking forgets
  the key.
* **No real secret in a test, fixture or example**: generate one, or use an obvious fake that
  validates.
* **Test an entrypoint with sloppy input**: that is its job. Code past the validation boundary is
  entitled to clean data.
* **A test's way past the API has a loud `_cheat_` name**, for what it returns (`_cheat_central`,
  `_cheat_clock`), on a test-world subclass or a test-facing adapter such as the memory DBs, never
  a coined verb that could pass for the API (`keptOf`). On a class that holds keys, prefer a
  constructor seam: an optional callback handed a typed cheater object, so nothing sits on the
  instance.
* **Cases that look alike become a table**, grouped by comments, with `"` for inputs and expected
  values and `'` for the blurb, so the columns align. The blurb says something about the case, not
  its inputs again: it becomes the title.

  ```ts
  const LabelCases = [
    // regular usage:
    ["anthropic",      true,   'a plain lowercase word'],
    ["openai_dev",     true,   'underscores join words'],
    // edge cases:
    ["a",              false,  'one character is too short'],
    ["dev-",           false,  'may not end in punctuation'],
  ] as const

  describe("Labels.valid", () => {
    for (const [label, expected, blurb] of LabelCases) {
      it(blurb, () => { expect(Labels.valid(label)).to.eq(expected) })
    }
  })
  ```

## Mechanically enforced, and deliberately not

The core's `eslint.config.mjs` is strict. These are **off on purpose**, so don't "fix" code for
them: `camelcase` (`vaultlabel` is right), `no-use-before-define` (define helpers below their callers
when that reads better), `@stylistic/quotes` (the convention above is kept by hand),
`@stylistic/space-unary-ops` (it mistakes the non-null `arr[0]!` for a negation, so `(! foo)` is
kept by hand), `@stylistic/no-multi-spaces` (parallel construction is padded into columns, *Braces
and layout*), `no-underscore-dangle`, `no-continue`, `no-await-in-loop`.

**Safety hatches** -- `@ts-expect-error`, `eslint-disable-line`, `any`, the non-null `!` -- are
allowed, because forbidding them sends a fix into a tailspin when the problem is elsewhere. Use
them with care, and **report each one you add**, in chat.
