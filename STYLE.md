# Style Guide

Conventions for the `.ts` files in this package, for a human or an AI session working in it.
CLAUDE.md's *Naming at a glance* carries the few rules that shape code too deeply to fix in
review; everything else is here. Read the section you need when naming an export, a module, a
stored field or a new tag, or when writing a doc block, a test, a validator, a type's shapes, or
a class that holds state. The naming vocabulary below is specific, and not guessable from general
TypeScript habit.

The core's `eslint.config.mjs` (`packages/safebyok/`) is the source of truth for anything
mechanically enforceable; where it and this document disagree, the linter wins and this document
is a bug.

## Imports

* Import paths carry no extension (`./key-deriver-spec`, not `./key-deriver-spec.ts`): the bundler resolves
  them, as the wider ecosystem does.
* No barrel files beyond the package's entry points: import from the file that defines the thing.
* **A module of related functions around one concern is imported whole**, under its Startcase
  name, where the namespace makes the call site clear: `import * as Scopepath from './scopepath'`,
  then `Scopepath.vault(scope)`. Its exports take bare names, vigorous verbs or the noun they
  make: `check`, not `namesCheck`; `vault`, not `vaultScopepath`.
* **A module with one primary noun** is imported by name, its friends riding along:
  `import { Box, BoxKinds } from './box'`.
* **A validator is reached through a namespace, never imported by name** (the Coach,
  2026-10-28: "files are not supposed to naked-import validators"), in every file of every
  package, tests included. A shapes module (`src/shapes/`) is star-imported under one short name
  ending in `X`, the same in every file, as a module of types is under one ending in `T`; its
  types are still imported by name. Or a `Validator` call takes the module as a source and its
  builder names what it uses, as a record names the field validators it is made of:

  ```ts
  import * as CX from './shapes/scopes'
  import * as FX from './shapes/fields'
  import type { VaultScope } from './shapes/scopes'

  const { applabel, user_id } = CX.bankScope.parse(opts)
  export const { boxCiphered } = Validator('bad_record', ({ obj, box_key_wrapped, whisper_ciphered }) => ({
    boxCiphered: obj({ box_key_wrapped, whisper_ciphered }),
  }), [FX])
  ```

  The names: `PX` primitives, `FX` fields, `CX` scopes, `BX` box, `DX` device, `VX` vault,
  `VDX` vault-db, `OX` bank-opts, `KX` key-deriver-spec, `MX` mask; outside the core,
  `Validators` from `safebyok`, and `CVX` for safebyok-convex's own Convex validators. Not the
  Startcase name above, which would collide with `Box`, `Vault` and `KeyDeriverSpec`. With the
  validator out of the file's scope, a local or parameter keeps its VOCABULARY.md name:
  `Box.seal(vault, props, whisper)`, a mock's `vaultRecord`.
* When a list of type imports grows cumbersome, import the types whole under a short name ending
  in `T`: `import type * as VT from './vault-types'`.
* **Zod's builders reach a validator under the `Validator` kit's short names** (*Validation*), and
  its types come in under `Z`: `import type * as Z from 'zod'`. A module that builds outside a
  `Validator` call (the kit's own primitives) imports the builders under the same short names.
* Tree-shaking is no reason to choose either: named and star imports shake identically (esbuild
  0.27, rolldown 1.2).
* **Picking named fields needs no library**: destructure them from the parsed output. No
  `es-toolkit/compat` in this library. Where a pick by a list of names is truly needed, write
  `fieldnames.map((fieldname) => scope[fieldname])`: es-toolkit's core `pick` returns an object,
  whose key order *Order comes from an explicit list* rules out.

The test for a module between these rules: does the import put *one well-named noun* in scope,
or several loose verbs? One noun is the goal.

## Naming

**No single-letter names.** Use `row`, `col`, `thing`. The sanctioned short names are `ii`, `jj`
for the ii'th time through a block: a `for` loop's own counter, or the index a `map` callback is
handed. An index that arrives from outside, as a parameter or a field, is an `idx` or a `fooIdx`.

**Never bare `name`, `value`, `node`, `error` or `query` as a variable name.** There is almost
always a salient prefix: `vaultlabel`, `profilename`. The linter refuses these, and `key`, as a
variable, parameter or destructured name; a property spelled that way (`{ name: 'AES-GCM' }`)
is someone else's interface, and fine.

**The cast is named in VOCABULARY.md** -- whisper, box, vault, passphrase, each key and its
encrypted form -- and those names are used as written, never a synonym. Never `data`, `contents`
or `payload` for a variable or field we control: it is a whisper, or a whisperCiphered.

**Never bare `key`.** In this package a key is cryptographic until proven otherwise, so:

* a **cryptographic key** is named for its role, as VOCABULARY.md has it: `passphraseKey`,
  `vaultKey`, `boxKey`, `leaseKey`. Not `kek` or `dek`. A WebCrypto `CryptoKey` and its
  raw bytes are told apart by a tag: `boxKey` is the `CryptoKey`, `boxKeyBytes` the
  `Uint8Array`.
* a **map key** is a `ckey` (see *Tags*).

**Smush the tags `name`, `kind`, `label`, `path` and `bag` into one word**: `vaultlabel`,
`boxlabel`, `woodkind`, `scopepath`, `scopepathkind`, `ScopepathDelimiter`, `Fieldname` -- but not
`fooCount` or `fooIter`.

**`Boxscope` is the one named exception** that smushes a noun into `scope`, there to show the
rule. `VaultScope` and `BankScope` keep their two words. The exception stops at the scope: a box's
scopepath is a `boxScopepath` (`BoxScopepath`), like every other `fooScopepath`.

**Never `type` to mean "kind"**, not even inside an identifier. `type` is reserved for a datatype;
a menu choice is a `kind` (`scopepathkind`) or a `flavor`. **`state` names nothing public**: a
React app already means its own component state by it. Name a status for what it is about: a
thing's stage in its life is its `lifecycle`.

**`isFoo` is a boolean. A function returning a predicate ends in `Pred`**:
`withinVaultScopepathPred(scope)`.

**A validator is named after the parameter it checks**, in that parameter's case (`user_id`,
`vaultScopepath`, `salt_bytes`), **or, for a function's whole input, after the function with
`Input` appended** (`dragForceInput`). A shape's validator checks no one parameter, and takes its
type's name with the first letter lowered: lowerCamelCase beside its ModuleCase type (the Coach,
2026-10-27: "it makes it less confusing"), `export const { boxSparse } = ...`, `export type
BoxSparse = Z.infer<typeof boxSparse>`. A host writes `import { boxSparse, type BoxSparse } from
'safebyok'` and calls `boxSparse.parse(row)`.

**Enumerations lead with their values, then the validator, then the type**, and a wider one
spreads a narrower: `export const wayinKindVals = [...] as const`,
`wayinkind = oneof(wayinKindVals)`, `export type WayinKind = typeof wayinKindVals[number]`. The
list of values is `fooThingVals`, lowerCamelCase as its checker is: `VX.wayinkind`,
`VX.wayinKindVals`, `type WayinKind`.

**A thing's shapes are named for their purpose, prefixed with the type**, from the fixed set in
*Shapes and duck typing*: `VaultRecord`, `VaultSparse`, `VaultStamp`, `VaultScope`,
`VaultTombstone`, `VaultSnapshot`; never a bare `Stamp`. A sparse thing is `-Sparse`
(`BoxSparse`), never `-Listing`, which reads as the list or what holds it, nor `-Listed`: a sparse
shape turns up well beyond listings. What an adapter hands up unchecked is `Stored-` and what it
holds (`StoredVault`, `StoredBox`): named for what storage holds, not for the call that read it.
The prefix names what storage holds, checked or not, so a validator of it keeps it
(`StoredVaultTok`, `StoredRevision`).

**The stamp is the bound fields.** Say *stamp* for the fields a thing's cryptography is bound to,
where you would write "the bound fields", "what the tag authenticates" or "the binding".
`cipherCtx` keeps its name for the byte string AES-GCM and HKDF are given, which is the stamp, a
purpose and a header: `cipherCtx(stamp, purpose, header)`.

**A name is the doc block's first line, compressed.** Write that line (*Comments and doc
blocks*), then read the name against it: the verb promises what the line says, in the vocabulary
of the verbs below and of CLAUDE.md's *name the operation*. A method that does its work by
calling `getBox` keeps that verb (`getBoxOrThrow`), never `readBox`; one that creates a vault on
every call is `createVault`, never `ensureVault`, because `ensure` promises idempotence; one that
"puts the box stored into the vault's listing" is `updateBoxListingOf`, not `takeStoredBox`. A
name that promises more or less than its first line is a bug in the name, and the line is the one
to trust.

**The receiver is part of the name; nothing else is.** Read a name where it is called:
`box.put()` and `vault.putBox(box)` both say "put the box", and both are good. A verb leaves its
object to the receiver only when the receiver *is* the object: `gating.settle()` settles the
gating, and one that settles the user's prompt is `settlePrompt()`. Being private, or the only
method of its kind, earns no shortcut: neither shows at the call site or in a grep, and a second
method ends it. Never `putSelf`: the receiver already says it.

**The verbs, at a glance.** Each promises this much and no more; the paragraphs below say more.
A function named for what it returns (`fooOf`, `fooRefusal`) has no side effects: one that acts
is named for the act.

| Name | Promises |
| --- | --- |
| `getFoo` | Reads foo, resolving it or null for none; one with no null form refuses instead, as `getWhisper` does. Changes nothing. |
| `putFoo` | Stores foo, resolving it as stored. |
| `delFoo` | Deletes foo. |
| `ensureFoo` | Has foo or makes it so, idempotently, and hands it back. |
| `makeFoo`, `Foo.make` | Builds foo in memory. Stores nothing. |
| `checkFoo` | Refuses a bad foo. Returns nothing. |
| `checkedFoo` | Refuses a bad foo, else returns it, typed. What `optionsCheck` makes. |
| `parseFoo` | Refuses a bad foo, else returns it cleaned or converted (*Validation*). |
| `demandFoo` | Synchronous: throws unless foo holds. |
| `isFoo`, or the condition (`consistentWith`) | Synchronous yes or no. Never throws. |
| `fooOf(thing)` | Pure: the foo derived from `thing`. |
| `tryFoo` | `foo`, resolving an `Outcome` instead of throwing. |

**`ensure` acquires or constructs, idempotently.** `bank.ensureVault({ vaultlabel })`,
`vault.ensureUnlocked()`: have one, or make it so, and hand it back, so a second call costs
nothing. A function that only checks and refuses is not an `ensure`: it is a `check`
(`checkBoxlabel(label)`, `checkStrength(passphrase)`), a `demand` (below), or a `parse` when it
also hands back the cleaned value (*Validation*). Reviewers: an `ensure` that returns nothing is
misnamed.

**Every public method is a try pair** (the Coach, 2026-10-22): `putBox()` resolves its value or
throws its refusal, carrying its `refusalkind`; `tryPutBox()` resolves an `Outcome` and never
throws. A method named `try` always resolves an `Outcome`; one whose result makes no sense as an
outcome is renamed. The doc block lives on the throwing half, and the `try` half's one line points
to it. The implementation lives on whichever half is easier to write, and `valOf` or one
try/catch derives the other, never a second implementation; a method whose `Outcome` carries
`meta` is implemented on the `try` side. A VaultDB's and a DeviceDB's public verbs are try pairs too
(`getBox` and `tryGetBox`); the `do*` hooks an adapter implements throw, and have one form.

**A check is a triplet, not a pair** (the Coach, 2026-10-22): "an ensureConsistent() and get
consistent() triplet ... get foo(), demandFoo() and sometimes ensureFoo()". A synchronous yes/no
query, named for the condition (`vault.consistentWith(thing)`); a synchronous `demandFoo` that
throws when it does not hold (`vault.demandConsistentWith(thing)`); and, only where a caller needs
it, an async `ensureFoo` that makes it so (`vault.ensureUnlocked()`, for the lease that
`demandConsistentWith(thing, { leaseBound: true })` asks for). There is no `tryDemandFoo`: the
query is the non-throwing form.

**`put` resolves what is stored.** On success, `putFoo` resolves the foo as storage now holds it
(the Coach, 2026-10-21): "putFoo should return the foo object as it is in the database (not what
was sent)". Not the argument it was handed, not `this`, not a boolean. Where the stored foo holds
key material, a model's verb resolves its summary: `vault.putWayin()` resolves the vault, whose
`vault.snapshot.gate` then shows the way in as stored; `VaultDB.putBox()` resolves the record.

**Stored fields are underbar_case** (`salt_bytes`, `memory_kib`): they are written to someone
else's database, and stay one spelling from the wire to the code. **One name for one thing,
everywhere**: a field holding a stored value keeps its stored spelling wherever it goes, in the
facades a record passes through, a host's options and a snapshot alike. A key deriver's
`key_deriver_label` is written into a wayin as it is, and `user_id` is never `userId`. Other
names are camelCase: a field with no stored counterpart (a snapshot's `damagedBoxes`), a verb
(`getUserId`), a concept (`keyDeriverLabel`, "the label of the key deriver").
The tag smushing above is for a label that names a thing (`boxlabel`).

**A time is UTC epoch milliseconds, an integer** (`registered_at: 1760000000000`), in a stored
record, a snapshot, a test fixture and the demo alike: never an ISO string, never a `Date`. The
clock seam (`Clock.now()`) already yields it, every index sorts it, and one convention means no
parsing at any boundary. A field named `*_at` holds one, checked by `epochMillis`.

Specificity is a virtue (`saltBytes` says it is bytes), but don't tag the obvious: `title`, not
`titleStr`. When genericity is exactly the point, use the tag bare: `encode(bytes)`.

### Tags

* `ckey` -- a collection key: a string for a map, an index for an array. `ckeys` for several.
  Never a storage address, which is a scopepath.
* `scopepath` -- where a store files a scope's record (*Scopepaths*); `vaultScopepath`,
  `boxScopepath` for a particular kind.
* `idx` -- an array index, known to be an integer.
* `val` -- a truly generic value. `vv` and `kk` are second choices inside a lambda.
* `kind`, `flavor` -- an identifier picked from a fixed menu. `label`, `handle` -- an identifier
  freely chosen, usually by a user (`vaultlabel`, `boxlabel`). All four are strict: `\w` only,
  starting with a letter, ending with a letter or digit, two or more characters.
* `_id`, `_tok` -- a stored `_id` is a hard identifier a record is found by (`device_id`); a
  random token that is only ever compared is a `_tok` (`revision_tok`, `vault_tok`). VOCABULARY.md
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

* `const` by default; `let` only where the value really is reassigned, which should be rare.
  Never `var`.
* Functional style is strongly preferred: `map`, `filter`, `reduce` over index loops.
* Arrow functions for inline lambdas; their params always parenthesized: `(val) => val.label`.
* Don't write to objects you don't own (`no-param-reassign`). Where it is right, disable the rule
  on that line and say why.
* `return await` inside a `try` or `catch`, nowhere else -- unless you want the current function
  kept in the stack trace.

## Build for maintenance

* **Build for ease of maintenance, not ease of implementation.** A module's customer uses one
  method; that method should read whole on its own, without tracing into a generic.
* **Don't DRY short bodies through a generic.** Spelled out, a maker and its inverse read as
  mirror images, each clear at a glance (`CX` is the core's scope checks, `shapes/scopes.ts`):

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
* **Name what you ignore.** A binding left unused on purpose gets a name starting with `_` that
  says what it is (`_scopepathkind`), never a hole (`[, applabel]`) and never a bare `_`. The name
  records that the part exists, where it sits, and that skipping it is deliberate. The linter
  passes only a named ignore: `_` and a letter or digit.
* **Write the crucial detail where it shows.** A prefix of every box in a vault ends in the
  delimiter; say so with `+ ScopepathDelimiter`, not with an empty last part that `join` turns
  into one.
* **Don't unwind what you will only rewind.** Holding a scopepath and needing a related one, work
  on the text; don't parse it into a scope to join it again.
* **Take one form of input.** A function taking a scope *or* its scopepath branches on its
  argument and trusts one branch; take the scope.
* **Constants shared across modules** (`ScopepathDelimiter`) live in `consts.ts`, which
  imports nothing, so any module can name them without a cycle.
* **Familiar over cute.** When a function already spans lines, a named target and `===` beats an
  equality-predicate factory: `const target = Scopepath.vault(thing)`, then
  `scopepaths.some((scopepath) => scopepath === target)`.
* **A predicate factory earns its place where it hides a detail that is easy to get wrong.** A
  prefix test against a scopepath must end in the delimiter, or `vault^acme^u1^main` matches
  `main2`'s rows. Never hand-write `.startsWith` against a scopepath: use the module's predicate.
  The factory assesses its argument once, so the predicate itself only compares text.

## Braces and layout

* Opening braces at the end of the line. Cuddle `} else if (...) {` and `} catch (err) {`.
* Always brace a block, even one statement: `if (nope) { return }`.
* A short guard read in passing stays on one line, still braced. One that deserves attention
  is expanded.
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
  literal, rows of an example table. Where one line takes fields out and the next puts the same
  fields back, pad so the field lists start in the same column (the example in *Build for
  maintenance*): what was extracted and what is injected is obvious at a glance, and a field
  dropped or swapped stands out.

## Strings

`'` by default. `"` for a string likely to hold an apostrophe -- prose, an error message, and
every `describe` and `it` title -- so it reads without a backslash: `"That passphrase didn't
unlock the vault"`. When forced to quote a key, `"`. In a table of examples, switching quotes
between columns lets the editor align them (see *Tests*).

## Validation

A function's input rules are declared once, as a Zod schema, with a specific check beside it where
one is warranted, and its TypeScript types come from that schema (`Z.infer`), so the signature and
the checks cannot drift apart.

**Always at a boundary**: what comes off the wire; records read back from storage, which is
someone else's database and may hold a vault another version of this package wrote; a published
package's exports; `Class.make` and any constructor taking outside input; a host's options; what a
host's callback returns (a strength checker's verdict, a key deriver's output). A failure there is
a refusal with a `kind` the caller can branch on.

**For preconditions, one line is the norm.** A function pulls what it needs out of what it was
handed, and checks it, in one parse: `const { applabel, user_id } = CX.bankScope.parse(thing)`,
`dragForceInput.parse({ thing, vel })` (the Coach, 2026-10-27: "validators [are] the principal
means of, in one line, extracting and validating local data"). Never a hand-pick
(`{ applabel: x.applabel, ... }`) where a schema exists, and never an if-then precondition, or a
`safeParse` followed by a sentence of its own, where a parse says the same: the refusal a
`Validator` makes names the failing field, which is what a developer who hits it needs. A
module-local variation is welcome, made in a `Validator` call at module level, never in a call per
function call. Add a specific check beside the parse only for a rule Zod does not express
naturally, or a comparison with what the callee holds.

* **A module's entrypoints are its exports.** An export assesses what its types cannot carry and
  its sources have not already checked; a private helper trusts its exported caller. Past the
  entrypoint, write confident code: no ambiguity and no undefined-checking paranoia.
* **A boundary belongs to the export, not the caller.** `Scopepath.vault` is public, so it checks
  its scope every time, and an internal caller holding a checked scope pays for a second check.
  That cost is small, and one function with one behaviour beats a checked public twin and an
  unchecked private one. Inside the package, don't re-check what was checked where it entered.
* **An entrypoint is generous**: it accepts what a caller plausibly hands it and fills in
  defaults. A Zod schema is the first choice for defaults, limits and collapsing unions.
* **Clear intent at the door, clean data inside.** An entrypoint may take a host's plain way of
  saying something -- `leaseHours: Infinity` for "never" -- and turns it into the bounded form the
  code keeps, at the parse: `Infinity` hours becomes the longest finite window. Past the
  entrypoint, and in every stored field, nothing is infinite.
* **Not Zod's job**: rules about state ("the vault is locked"), which are control flow; rules
  needing async I/O; properties Zod cannot see (whether a CryptoKey is usable). A rule relating
  several arguments does fit: check one object built from them, with `.refine` across its fields.

**Validators are made inside a `Validator(kind, kit => { ... }, sources?)` call**
(`checks/validator.ts`), never in plain Zod. It hands the builder Zod's makers under short names
(`obj`, `arr`, `tuple`, `oneof`, `union`, `discrim`, `lit`, `lazy`, `custom`), its scalars
ready made (`str`, `num`, `int`, `uint`, `bool`, `unk`), and the shared primitives (`label`,
`user_id`, `epochMillis`, ...); and it wraps each schema it returns, so a failed `parse` throws a
`VaultError` of the call's one `kind`, its message from `Phrases`. A maker the kit lacks comes in
by a named import from `zod` beside the call, never the whole of Zod, which would carry every
locale it ships into each host's bundle. It has no record maker, on purpose: a refusal names a
failing field by its path, and a record's keys in that path are the input's own. A value checked
whole, as a CryptoKey or bytes of one length are, takes `custom`.

```ts
export const { vaultScope, boxscope } = Validator('bad_scope', ({ obj, applabel, user_id, vaultlabel, boxlabel }) => {
  const vaultScope = obj({ applabel, user_id, vaultlabel })
  const boxscope   = vaultScope.extend({ boxlabel })
  return { vaultScope, boxscope }
})
```

* **Writing one is strictly easier than Zod alone**: the body is plain Zod with shorter names, one
  schema a line, and nothing added per line, neither a wrapper call nor an annotation.
* Modules of validators in `sources` (star imports, `[FX]`) are spread into the kit
  beneath it, so a kit name wins. A file makes its own in-file validators the same way, without
  bringing names into scope.
* The primitives the kit hands out (`shapes/primitives.ts`) are plain Zod, and so is a variation
  made directly from a validator (`VX.vaultSparse.pick(...)`): its `parse` throws a `ZodError`, so
  use it with `safeParse`, or make it in a module-level `Validator` call where it should refuse.
* **One input, one validator.** A function checks what it is handed with one validator, never a
  cascade of validators each taking a part of the input and refusing with its own kind. Checks
  after the parse are fine: one Zod does not express, or a comparison with what the callee holds
  (a record's scope against the one asked, a bag's `user_id` against the bank's). The scope
  validators (`bankScope`, `vaultScope`, `boxscope`) are made in a `bad_scope` call, and anything
  taking a scope's duck may parse it with one; a record's validator refuses with its own call's
  kind, a bad name in it included.
* **A method deep in a call leaves the kind to whoever knows.** It asserts with a schema, whose
  refusal carries its `Validator` call's kind, and any check written beside it throws with a
  sentence from `Phrases`. A public call that knows more about what the caller was doing re-throws
  with the better kind: a name failing a check may be the host's typo (`bad_scope`), a damaged row
  read back, or our own bug. No `ZodError` escapes the public call.
* **Catch and re-throw as the more specific, or less leaky, refusal** where the caller knows more
  than the schema did: a record read back from storage fails its `bad_record` schema, and the
  read-back helper re-throws it as `damaged_*`.
* **Assess once, then close over the result**: on a hot path (a predicate run per row, a lookup
  per render), the factory assesses and the closure compares.

**What a refusal says.**

* **Every sentence a check says lives in `phrases.ts`**, star-imported as `Phrases`, so
  wording, tone and the rule that none quotes its input are reviewed in one place.
* **A refusal of a host's bag of options says what Zod found, in Zod's English**: a validator
  made in a `Validator` call does (`src/checks/validator.ts`), and a check of options names the
  call and says what to do in the parse's own story, `parse(opts, { where, advice })`, never in a
  catch that rethrows (`optionsCheck`, `readBankOpts`). Never `Z.config`, which is the host's
  Zod too. Zod's English names a refused value's type, never the value.
* **A refusal never repeats a value from its input** (the Coach, 2026-10-26). It may name the
  fields involved, in its message and `meta.fieldnames`: a field that failed its check, or that
  disagrees with another bag (the Coach, 2026-10-27, loosening "no key" until the package is more
  mature). A field an object does not take is still counted, not named, and the refusal lists the
  fields it takes. No handler sifts broken input to explain it: a catch only aligns the kind and
  attaches context.

**To sanitize shape.** Destructure the fields you need from the parsed output: `obj` strips the
rest, so a vault record, a Vault object or a bank's listing handed in as a scope comes out as just
the scope.

* **Accept whatever is legitimately offered.** A shape taken out of whatever carries it, a scope, a
  stamp or a sparse shape, strips: a Vault object, its record or its snapshot passes as any of
  them. A strict check is the exception, and says beside it why that site needs it.
* A bag of options a person typed gets `obj({ ... }).strict()`: stripping would quietly drop a
  misspelt option. So does a stored record: a field this version does not know is damage, or a
  newer `format`. So does a box's stamp, as a field beside its own would be shown but not bound.
* **No transform that changes a name's value** (trim, lowercase, coerce, normalize): a name is
  bound into storage and crypto, so refuse instead. A structural transform is fine: a scopepath's
  validator splits it into its parts before checking them.
* A validator that hands out a scope others will hold freezes it: `obj({ ... }).readonly()` (zod
  4.6.7: the output is frozen at runtime and typed `Readonly`).

## Shapes and duck typing

* **Duck typing is the design.** A thing that has a scope *is* one: it carries `applabel`,
  `user_id` and `vaultlabel` as its own fields, never a nested `.scope`. A nested copy raises the
  question of whether the thing and its scope agree; a duck-typed thing has one copy of each name,
  and a function taking a scope takes the thing itself. The more things duck type, the more a
  one-off case is plain `Pick`, `&` and `Omit` surgery.
* **The shapes are there to cut the number of types, not to straiten what a function takes.**
  Where a broader duck is harmless, a parameter accepts it, and one that reads a few fields says
  so with an ad hoc `Pick` or `Partial` where it is declared. A function's behaviour never changes
  to fit a named shape.
* **A field a thing ducks as is frozen, or fixed for the thing's life.**
* **Each main type (vault, box, lease, ...) has a small, fixed set of shapes**, each named for its
  purpose and prefixed with the type (*Naming*; VOCABULARY.md, *Shapes*):
  - *record*: the fields stored and sent over a wire, as one object schema;
  - *sparse*: a subset of the record's own fields, minus the heavy and sensitive ones, as a list
    or a log shows it, and the shape to reach for wherever the whole record is not needed. An
    associate (a vault's gate, its boxes) is never in it: a shape that wants one adds it beside;
  - *stamp*: the fields fixed for the record's life, which are exactly the fields bound into its
    cryptography;
  - *scope*: the composite id, the names its scopepath is made of;
  - *dna*: what a caller sends to `make` or `ensureVault`, partial in fields with defaults, and
    without any field that must stay under our control (for a vault, its scope);
  - *tombstone*: what a deletion leaves;
  - *snapshot*, for a stateful thing: its sparse shape and what changes beside it (*Stateful
    objects and snapshots*).
* **Each shape's validator is built from the record's** with `pick`, `omit`, `partial` and
  `extend`, and its type is `Z.infer` of that, rather than a hand-written parallel type: a reader
  learns one record and a handful of named subtractions. A record is one object schema, not a
  union of variants (`pick` throws on a union, zod 4.6.7): an optional part is a nullable field.
* **Use each shape's name for what it means, even where two are one type.** `LeaseSparse =
  LeaseStamp` is fine; a log line or a listing takes a `LeaseSparse`, and a ctx a `LeaseStamp`.
* **A part's shapes nest as the part does.** A record holding parts holds them in every shape: the
  gate's sparse shape holds each wayin's sparse shape, never a flat pick of their fields.
* **A class names the shapes it passes for**: `class Vault implements VaultStamp`, `class Box
  implements Boxscope, BoxSparse`. The compiler then holds the class to its duck typing.
  `implements` checks only that the fields exist with their types; the constructor and
  `Object.freeze(this)` make them own and frozen.
* **Freeze what we can**: each record handed out, each object's own fields, each snapshot.
* **Name each outcome a reader must tell apart, even where the types overlap.**
  `VaultRecord | VaultTombstone | DamagedVaultRecord | null` says present, dead, broken, missing;
  `DamagedVaultRecord` is `VaultRecord` to the compiler and a different thing to the reader.
* **A type is `Z.infer` of its validator, beside the concern that checks it.** What has no
  validator yet waits in `types/type-aliases.ts`, and leaves it when one is written.
* **A shape and its type follow one rule** (the Coach, 2026-10-28): "It's an easy rule, unless
  there's a good reason: use Z.infer (eg recursive types); put in the common checks folder (weird
  and module-local and good idea to put it near where used); use Validator; namespace it, using
  Validator or a star-import." The type is `Z.infer` of the shape, never a parallel written by
  hand. The shape lives in the shared folders (`src/checks/`, `src/shapes/`) unless it is odd and
  local to one module, which keeps it beside its use. It is made in a `Validator` call. It is
  namespaced as the object a `Validator` call returns (`Checks.StoryShape`), or through its
  module's star import, conventionally `CX` (`import * as CX from './shapes/scopes'`, then
  `CX.vaultScope`). A good reason for an exception is said beside it. A type its own validator's
  type names (`Story`, which `Refusing` names and a `Refusing` makes) is an `interface` extending
  the `Z.infer`, whose members TypeScript resolves on demand.
* **Name the important primitives.** A value a host writes by hand gets a plain alias
  (`Boxlabel`); one it never writes is branded by its validator (`PassphraseSalt`, `PrfSalt`,
  `PassphraseCleartext`), so it exists only once parsed and two of a kind never trade places.
* **A facet a type gains is a generic named for the facet**: `Lifecycled<OT>`, `Refused<OT>`,
  `ConsistencyWith<OT>`, where the alternative is a slice named for its one consumer.
* **One name for one thing, everywhere** (*Naming*): a host-facing field takes its stored
  spelling.

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
  `gate_epoch`, so its stamp holds it.
* **A reference to another thing's part keeps a flat field, named as in the owner**: a lease's
  `gate_epoch` names the gate it was granted under, as a foreign key would.
* **What one atomic step reads travels together**, its halves apart until checked, so damaged
  data cannot collide with its own fields: `{ vault, boxes }` (`StoredVault`). Checked, it
  is the thing it describes, written out where it is used: a vault's record and its box listing
  are a vault, `VaultRecord & { boxes: readonly BoxSparse[] }`.

**Interfaces a host implements.**

* **An interface a host implements is typed as what belongs there**, never `unknown`, with its doc
  block saying what is checked and by whom. The check keeps damage out, not the type.
* **A browser checks what a server relays.** A server is not trusted, so a browser checks each
  record it is sent that it will use. A server's word that a record is damaged it may take: the
  worst a lying server does with that is offer to delete what it could delete anyway. It still
  parses the word itself (a damaged box's label, its kind of damage, its token).
* **A wire sharpens an interface.** A VaultDB's half has the shape its GraphQL relay carries, so a
  browser's adapter passes the server's answer through. Where the two would differ, change the
  VaultDB.

## Crossings, spreading and logging

* **Take a part out by parsing or destructuring, never by spreading the thing.** A spread copies
  only own enumerable fields: a getter on the prototype is lost while TypeScript types it as
  present, and every other own field comes along. The linter refuses a spread of a class instance
  (`no-misused-spread`); where a caller wants a thing's fields as plain data, a getter hands out a
  frozen shallow copy of its fields (`vault.stamp`).
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
* **A snapshot is the one exception to "spreading is harmless"**: it is render state by contract,
  and may hold an error object or a list.

## Order comes from an explicit list

Anything stored, hashed or bound into a ctx takes its order from an explicit list (the array a
maker joins, the tuple its inverse checks) or from a canonical encoding that sorts keys
(`stableJsonify`, as `cipherCtx` uses), not from an object's key order as it happens to fall. Zod
4.6.7 builds its output in schema order, but that is undocumented, and JavaScript puts
integer-like keys first.

## Scopepaths

A **scopepath** is where a store files a scope's record (VOCABULARY.md): the kind first, then the
scope's names in order, joined on `ScopepathDelimiter` (`^`, from `consts.ts`), such as
`box^acme^u1^main^openai`. `Scopepath` is a public module: a host's own key-value adapter files
rows with it.

* The kind goes first: a kind suffix sorts each scope before its children only while every segment
  is a lowercase label, and a user_id is not one.
* **`ckey` is a generic map key**; a storage address is a scopepath.
* **Lookups go by key** (`Map.get`, a store's read, an IndexedDB range), never by scanning. A
  listing is for showing; a lookup goes through a keyed map beside it.
* A prefix test goes through the module's predicate, never a hand-written `.startsWith` (*Build
  for maintenance*).

## Control flow and refusals

* **Prioritize simple, analyzable control flow over UX niceties until the control flow is
  mature** (the Coach, 2026-10-19). "We must not allow complicated interactions in the critical
  path. If that leads to a horrible user experience, we'll use that as evidence for a flawed
  design, outside the scope of current work; until then the code is safe and users will have to
  deal." Add no retry, refresh, re-read or "if X then try Y" to the core: it is hello, then
  unlock, then the operation.
* **Generate refusal and logging statements that are safe, specific, actionable, empathetic to
  the customer (failures) or the user (conditions)** (the Coach, 2026-10-19). Safe: no secret
  material, in the message, a `cause` or `meta` (*Validation*). Specific: what went wrong, and a
  `refusalkind` to branch on. Actionable: what to do next. Empathetic: a failure (misuse, bad
  news) speaks to the developer integrating the package; a condition speaks, calmly, to the user
  who will see it.

## Comments and doc blocks

* `/** */` for doc blocks, `//` for a running clarification or commented-out code.
* Bulleted lists use `*` at the top level and `-` below, indented two spaces per level.
* **Every exported function, class, constant and type gets a doc block**, written for its caller:
  a developer, or their agent, *using* it, who is no expert in security, distributed systems or
  backends. For a private member, the reader is the code that calls it. Never how it came to be,
  what's next, or how it works inside: a caveat for maintainers is a running comment by the code
  it concerns, and an invariant they keep ("every lock goes through here") one on the line above
  the member's doc block.
* **The purpose goes on the `/**` line**, a sentence that stands alone when the block is folded
  in an editor: `/** Brief statement */` alone, or `/** Brief statement.` with the rest on the
  lines below. Never `/**` alone on its line.
* **Lead with what the thing *is*, or with what it *does***. A type, a constant or a pure
  function leads with what it is or returns: `/** The fields written to storage: the visible
  ones, the ciphered whisper and the wrapped boxKey. */`, not `/** Creates a bag of the fields
  that will be written to the database */`. A function that reads storage, decrypts, asks the
  user or writes leads with that verb: `/** Get and open the box stored under boxlabel, ...`.
  "Get" here is a storage read: a lookup in memory leads with what it returns. Never open on "What
  a ..." or "What ... does": name the thing, or say the act.
* **Read the member's name against that first line** (*Naming*).
* **Name the shape and say *stamp*.** A block says which shape it takes or hands back
  (`VaultSparse`, `BoxStamp`) by its name, and calls the fields a ciphertext is bound to the
  stamp (*Naming*). An interface a host implements says what is checked, and by whom.
* **Each sentence tells the caller something they would otherwise get wrong**, given the
  signature, the names, what a capable developer already knows, and what is said once elsewhere.
  Leave out a parameter's type, what it is when its name says so, the return type, and a default
  that is an option of the same name elsewhere.
* **Say a thing once.** What holds for every member of a class, module or interface goes in its
  doc, one sentence each; a member that is an exception says so. Another function's doc is
  linked on first mention, never restated. A condition every member meets alike (a lock landing
  mid-call, the object gone) is said once, in the class doc or on the call that causes it
  (`lock()`); a member names it only where what it leaves behind differs. A `try` twin is one
  line: `/** The whisper in
  `boxlabel`, as an {@link Outcome}: the non-throwing form of {@link getBox}. */`. A storage
  adapter's members say only where they differ from `VaultDB`'s contract.
* **A block is as long as its contract, not its code.** A patently obvious member needs its
  first line and nothing more. A guard, or an entrypoint other calls go through, states its
  contract even when it is simple: what holds once it succeeds. Beyond that, only what the
  signature cannot give: the state the call leaves behind, side effects, when it may be called,
  and any security fact a caller could get wrong ("replacing is not revoking"). Most public
  methods take 5 to 15 lines of prose; one whose contract has many conditions may run longer, in
  short paragraphs of one theme each (limits, races, locks).
* **Name every reach across a seam**: storage, a decryption, the user, a timer, an injected
  interface, a public call it goes through. One sentence with `{@link}`s: `Reads {@link
  DeviceDB.getDeviceRecord}, then {@link DeviceDB.getLease}.` Private members too, down to the
  private call that holds the reach, named in backticks (`Gets the box through #getBox`).
  Never the order of steps.
* **Say what a member does and when to call it, never who calls it.** A list of callers, or of
  what each does with the result, belongs to those callers and goes stale. A rule its callers
  must keep stays, as an instruction: "Ask it first in every call." A caller list that is the
  only word on what a parameter means becomes that `@param`: what to pass, and why.
* **Never tour the fields.** A type's doc says what the whole is and what holds of every field.
  Each field's own facts go on that field, inline object types included. Where a field, a
  parameter or a return value has a documented type, link it rather than list its fields.
* **Name the refusals that are common and not obvious.** `RefusalKind` in `errors.ts` sorts them:
  - *Misuse* (`bad_option`, `bad_scope`, `insecure_context`, ...) is said once, in the class
    or module doc.
  - *Conditions* a caller meets in normal use are named: a wrong proof, a weak passphrase, a race
    with another device or tab (`stale_write`, `created_elsewhere`), a lock landing mid-call, a
    limit reached.
  - *Bad news* is named on the call where a host first meets it, as `hello` names
    `damaged_vault`.
  - Not what passes through from storage or another public call, and not what only a bug or a
    record breaking the package's own invariants brings about. A refusal from beneath that the
    member turns into another kind is its own, and named, with what it leaves behind.
  - The kind goes unexplained. A clause only for a meaning or an aftermath this member gives it;
    a remedy only when it is another call (`delDamagedVault` clears them). The user's next step
    is the message's job.
* **Plain sentences**: subject, verb, object, in that order; one fact to a sentence; under 25
  words.
* **Facts come from the code**, not from the old prose, which is sometimes wrong. Where they
  disagree, write what the code does and raise the disagreement; the doc never changes behaviour.
  Timing words ("at once", "before", "never") are facts too: check each against the awaits.
* Don't be stingy with `@example`s. A short example on one line; a long one on following lines,
  indented two spaces. Each has a test whose title points back to it (*Tests*). What is best said
  beside an example goes in its `//` comment.
* `@param` and `@returns` only for what the name and type can't say: a unit or range, what `null`
  or leaving an optional parameter out means, a return the first line doesn't cover. A `@param`
  is the parameter's role, an entry in the playbill: `@param boxlabel - Box to open, as its owner
  named it.`
* Each `{@link}` names something in scope in its file; anything else is plain code, in
  backticks, never a type-only import made for the link, which `no-unused-vars` refuses. A
  private member is always plain code, in backticks: never a `{@link}`.
* **A file past about 40 KB is sectioned.** `// == [Mark]: heedMark, markSeeing, others` opens a
  section (its name, then the names a reader would grep for), `// --` closes it, both at the
  section's indentation; sections are flat, never nested. `grep -n '// == '` is the file's table
  of contents. A banner groups declarations; it does not excuse a file that should be split, and
  it moves with the code it names.

A doc block before and after, its examples left out. Before, 41 lines opening:

```ts
/**
 * Read storage and settle the vault: one read of the vault props, their ways in and the box
 * listing, then this device's lease, taken up when it still fits and still opens, and the vault
 * settled from those into `absent`, `locked` or `unlocked`, its snapshot published -- never
 * prompting: asking for a passphrase is the host's job, and only when a whisper is actually
```

After:

```ts
/** Read storage and settle the vault as `novel`, `locked` or `unlocked`, resolving the vault.
 * Never prompts. Within `staleMinutes` of the last read it re-settles without reading.
 * Reads {@link DeviceDB.getDeviceRecord}, then `VaultDB.getVault` beside {@link DeviceDB.getLease}.
 *
 * A refused hello leaves the vault as it last settled. Stored vault props it cannot use refuse
 * with 'damaged_vault' (`delDamagedVault` clears them), 'newer_format' or 'vault_behind'.
 */
```

A private helper whose block toured its return value and hid its reach. Before:

```ts
/** What a `putBox()` leaving out the sidecar or the whisper seals: the box read from storage and opened, its sidecar and whisper kept where not given, its revision the base.
```

After, and renamed from `#storedBase`, as the line showed the name was wrong:

```ts
/** Get and open the box stored under `boxlabel`, filling in the sidecar or whisper a partial `putBox()` left out.
 * Gets through `#getBox`, and decrypts the whisper under the lease in hand. The put then
 * lands only over the revision read.
 */
async #fillFromStored(boxlabel: string, ...)
```

Well-named, short functions rarely need running comments. A comment that narrates the code, makes
up for a poor name, or marks off a stanza that should be its own function is a sign to rewrite.

## Tests

Vitest, in each package's `tests/`, path for path with its `src/`: `src/foo/bar.ts` is tested in
`tests/foo/bar.test.ts`. A test file that passes about 1,500 lines becomes a folder named for its
module, `tests/foo/bar/`, of `bar-<theme>.test.ts` files whose themes are what a reader would look
for (`bar-races`, `bar-refusals`), with the helpers two or more of them share in a `world.ts`
beside them; no `bar.test.ts` stays outside the folder, and no `describe` title changes for the
move. A module reached only through another's public verb (`vault-opts.ts` through `Bank.make`)
is tested beside that verb. Test and build artifacts never land in `src/`.

* **Test helpers are reached through one module, `tests/test-helpers.ts`, star-imported as `TH`**:
  `import * as TH from './test-helpers'`, then `TH.scopeOf('u1')`. It exports everything, and
  may re-export, by name, a folder of parts beside it (`tests/test-helpers/`: grep the door for the
  part that holds a helper, then read that part). A new helper goes in its part and in the door. The
  core's is also published as `safebyok/testing`, so another package's tests reach the same
  helpers; a package with helpers of its own keeps them in its own `tests/test-helpers.ts`, which
  re-exports `safebyok/testing` beside them, so each test still has one `TH`.

* **Assertions are chai-style**: `expect(foo).to.eq(bar)`, `to.deep.equal` (`to.equal` is `===`;
  an object or array wants `deep`), `to.have.lengthOf`, `to.throw`, `to.have.members`. `true`,
  `false`, `null` and `undefined` in chai's property form: `to.be.null`, never `to.eq(null)`.
  Never `toBe`, `toEqual` or `toHaveLength`. Two Vitest forms have no chai spelling and are
  allowed: `await expect(promise).rejects.toThrow(...)` and `toMatchSnapshot()`.
* `eslint-plugin-chai-expect` catches a bare `expect(x)` or a method left uncalled. It knows only
  the methods in `ChaiMethods` (the core's `eslint.config.mjs`): a new one goes on that list.
* **A helper named `expect...` must assert.** The linter (`vitest/expect-expect`) counts a call to
  any function named `expect...` as an assertion, so a test whose only check is such a helper
  passes. Name it for what it does: if the helper should not assert, give it a different name
  (`check...`, `read...`); if it should, make it assert and keep the name. Never add an assertion
  to a helper merely to make the rule happy.
* **Every use case of an exported function has a test, and every `@example` has one whose
  title points back to it**: `"refuses a misspelt field as 'bad_option', as its second example
  shows"`, so a reviewer, or whoever changes the example, finds its test by the title.
* **Each example ties to a plausible failure mode.** Ask what null, undefined and a missing value
  mean; what an absurd type does (`seal(42)`); what a not-quite-absurd one does (a salt one byte
  short, a passphrase of only whitespace, a vault written by a newer version).
* **For anything that holds a secret, test what must not happen**: that the wrong passphrase is
  refused, that tampered ciphertext is refused, that an error does not carry the secret, that
  locking forgets the key.
* **Never a real secret in a test, fixture or example**: generate one, or use an obvious fake
  that validates. Credentials for anything (npm, GitHub) come from the environment, not a file.
* Test an entrypoint with generous, sloppy input: that is its job. Code past the validation
  boundary is entitled to clean data; don't feed it garbage it will never see.
* Once tests start to look alike, switch to a bulk example list, grouped by comments, with `"`
  for inputs and expected values and `'` for the description, so the columns align:

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

  The third slot is a sentence about the case, not a restatement of its inputs: it becomes the
  test's title.

## Tree-shaking

What a host's bundler can drop, measured on 30 validators of which 5 are used, with esbuild and
rolldown, classic Zod and `zod/mini` alike (measured when the choice was open; the core and the
packages that use Zod are on classic Zod, as one host bundle holds one flavour):

* An unannotated top-level validator is never dropped.
* One `/* @__PURE__ */` before a chain is not enough. Annotate **every** call in the chain, or wrap
  the whole expression once: `/* @__PURE__ */ (() => str().min(1).max(9))()`.
* `sideEffects: false` drops a module nothing imports from; nothing inside an imported one.
* The library is the real cost: the same five validators bundle to 24-27 KB gzipped with classic
  and 6.7-6.9 KB with mini. The 25 unused validators cost 130-170 bytes.

A `Validator` call keeps every schema it makes, used or not, and the Coach accepts that: the
advice above is moot for validators, and holds for everything else.

## Mechanically enforced, and deliberately not

The core's `eslint.config.mjs` is strict. These are **off on purpose**, so don't "fix" code for
them: `camelcase` (`vaultlabel` is right), `no-use-before-define` (define helpers below their callers
when that reads better), `@stylistic/quotes` (the convention above is kept by hand),
`@stylistic/space-unary-ops` (it mistakes the non-null `arr[0]!` for a negation, so `(! foo)` is
kept by hand), `@stylistic/no-multi-spaces` (parallel construction is padded into columns, *Build
for maintenance*), `no-underscore-dangle`, `no-continue`, `no-await-in-loop`.

**`@typescript-eslint/no-unused-vars` passes only a named ignore**: its ignore patterns are
`^_[a-zA-Z0-9]`, so `_scopepathkind` passes and a bare `_` does not (*Build for maintenance*).

**Safety hatches** -- `@ts-expect-error`, `any`, the non-null `!` -- are allowed, because
forbidding them sends a fix into a tailspin when the problem is elsewhere. Use them with care,
and **always report each one** in chat or in the PR's open questions.
