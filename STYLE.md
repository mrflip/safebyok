# Style Guide

Conventions for the `.ts` files in this package, for a human or an AI session working in it.
CLAUDE.md's *Naming at a glance* carries the few rules that shape code too deeply to fix in
review; everything else is here. Read the section you need when naming an export, a module, a
stored field or a new tag, or when writing a doc block, a test, or an entrypoint that takes a
caller's input. The naming vocabulary below is specific, and not guessable from general
TypeScript habit.

The core's `eslint.config.mjs` (`packages/safebyok/`) is the source of truth for anything
mechanically enforceable; where it and this document disagree, the linter wins and this document
is a bug.

## Imports

* Import paths carry no extension (`./key-deriver-spec`, not `./key-deriver-spec.ts`): the bundler resolves
  them, as the wider ecosystem does.
* No barrel files beyond the package's entry points: import from the file that defines the thing.
* **A module of related functions around one concern is imported whole**, under its Startcase
  name: `import * as Names from './names'`, then `Names.check(...)`. Its functions are
  vigorous verbs: `check`, not `namesCheck`.
* **A module with one primary noun** is imported by name, its friends riding along:
  `import { Box, BoxKinds } from './box'`.
* When a list of type imports grows cumbersome, import the types whole under a short name ending
  in `T`: `import type * as VT from './vault-types'`.
* Follow a library's own import conventions where it has one: `import * as Z from 'zod/mini'` is ours
  (see *Validation*).

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
`boxlabel`, `woodkind` -- but not `fooCount` or `fooIter`.

**Never `type` to mean "kind"**, not even inside an identifier. `type` is reserved for a datatype;
a menu choice is a `kind` or a `flavor`.

**A name is the doc block's first line, compressed.** Write that line (*Comments and doc
blocks*), then read the name against it: the verb promises what the line says, in the vocabulary
of the verbs below and of CLAUDE.md's *name the operation*. A method that does its work by
calling `getBox` keeps that verb (`getBoxOrThrow`), never `readBox`; one that creates a vault on
every call is `createVault`, never `ensureVault`, because `ensure` promises idempotence; one that
"puts the box stored into the vault's listing" is `updateBoxListingOf`, not `takeStoredBox`. A
name that promises more or less than its first line is a bug in the name, and the line is the one
to trust.

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
`meta` is implemented on the `try` side. A VaultDB adapter's verbs resolve `Outcome`s alone.

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
else's database, and stay one spelling from the wire to the code. Everything else is camelCase.
That holds wherever the object is the stored record, the facades a record passes through
included: a key deriver's `key_deriver_label` is written into a wayin as it is. The tag
smushing below is for a label that names a thing (`boxlabel`); `keyDeriverLabel` is the concept
"the label of the key deriver", and stays camelCase.

**A time is UTC epoch milliseconds, an integer** (`registered_at: 1760000000000`,
`askPassphraseAt`), in a stored record, a snapshot, a test fixture and the demo alike: never an
ISO string, never a `Date`. The clock seam (`Clock.now()`) already yields it, every index sorts
it, and one convention means no parsing at any boundary. A field named `*_at` holds one, checked
by `EpochMillis`.

Specificity is a virtue (`saltBytes` says it is bytes), but don't tag the obvious: `title`, not
`titleStr`. When genericity is exactly the point, use the tag bare: `encode(bytes)`.

### Tags

* `ckey` -- a collection key: a string for a map, an index for an array. `ckeys` for several.
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

* Align parallel construction into columns: values in an object literal, rows of an example
  table.

## Strings

`'` by default. `"` for a string likely to hold an apostrophe -- prose, an error message, and
every `describe` and `it` title -- so it reads without a backslash: `"That passphrase didn't
unlock the vault"`. When forced to quote a key, `"`. In a table of examples, switching quotes
between columns lets the editor align them (see *Tests*).

## Validation

* **Validate at the module entrypoint, with Zod**, then write confident code past it. An
  entrypoint is generous: it accepts what a caller plausibly hands it and fills in defaults.
  After it, no ambiguity and no undefined-checking paranoia.
* A Zod schema is the first choice for defaults, coercion, limits and collapsing unions: one
  schema, one message per limit, never a hand-written `if (n > 99) throw` beside it.
* **Clear intent at the door, clean data inside.** An entrypoint may take a host's plain way of
  saying something -- `leaseHours: Infinity` for "never" -- and turns it into
  the bounded form the code keeps, at the parse: `Infinity` hours becomes the longest finite
  window. Past the entrypoint, and in every stored field, nothing is infinite.
* **`src/` uses `zod/mini`**, never classic `zod` (the linter refuses it): mini's builders
  tree-shake, so a host pays only for the validators its imports reach. Its schemas are plain
  functions, its limits checks: `Z.optional(Z.string().check(Z.maxLength(256)))` where classic
  reads `z.string().max(256).optional()`. A test playing a host may import classic, as a host
  would.
* Enumerations lead with their values, then the type: `export const BoxKindVals = [...] as
  const`, `export type BoxKind = typeof BoxKindVals[number]`.
* Name a schema after what it checks, in the same case: the field `salt_bytes` has the validator
  `salt_bytes`.
* **A refusal of a host's bag of options says what Zod found, in Zod's English**: parse with
  `InEnglish` and say `issuesText(err)` first (`src/options.ts`; `optionsCheck` does both), then
  what to do. zod/mini alone says only "Invalid input"; never `Z.config`, which is the host's Zod
  too. Zod's English names a refused value's type, never the value.
* **A validation error must never quote a secret.** Zod's issues can carry the input they
  refused: a schema that sees secret material reports without it.
* Records read back from storage are validated too: storage is someone else's database, and a
  vault may have been written by another version of this package.

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
  what it is and how to use it, never how it came to be, what's next, or how it works inside. A
  caveat for future authors is a running comment by the code it concerns.
* **The purpose goes on the `/**` line**, a sentence that stands alone when the block is folded
  in an editor: `/** Brief statement */` alone, or `/** Brief statement.` with the rest on the
  lines below. Never `/**` alone on its line.
* Lead with what the thing *is* or *returns*: `/** The fields written to storage: the visible
  ones, the ciphered whisper and the wrapped boxKey. */`, not `/** Creates a bag of the fields
  that will be written to the database */`.
* **Once that first line is written, read the member's name against it** (*Naming*): the verb
  promises exactly what the line says.
* **Each sentence tells the caller something they would otherwise get wrong**, given the
  signature, the names, what a capable developer already knows, and what is said once elsewhere
  (a class's own doc, `errors.ts`). Leave out what those already say.
* **A block is as long as its contract, not its code.** A patently obvious export needs its
  first line and nothing more. A guard, or an entrypoint other calls go through, states its
  contract even when it is simple: what holds once it succeeds. Most public methods take 5 to
  15 lines of prose.
* **Name the refusals that are common and not obvious**: those a caller will meet in normal use
  and should branch on. Not those passed through from another call, and not those only a bug or
  a record that breaks the package's own invariants brings about.
* **Plain sentences**: subject, verb, object, in that order; one fact to a sentence; under 25
  words.
* Don't be stingy with `@example`s. A short example on one line; a long one on following lines,
  indented two spaces.
* `@param` and `@returns` only for what the name and type can't say. A `@param` is the
  parameter's role, an entry in the playbill: `@param boxlabel - Box to open, as its owner named
  it.`
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
 * Never prompts. Within `opts.staleMinutes` of the last read it re-settles without reading.
 * Reads {@link DeviceDB.getDeviceRecord}, then `VaultDB.getVault` beside {@link DeviceDB.getLease}.
 *
 * A refused hello leaves the vault as it last settled. Stored vault props it cannot use refuse
 * with 'damaged_vault' (`delDamagedVault` clears them), 'newer_format' or 'vault_behind'.
 */
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

## Mechanically enforced, and deliberately not

The core's `eslint.config.mjs` is strict. These are **off on purpose**, so don't "fix" code for
them: `camelcase` (`vaultlabel` is right), `no-use-before-define` (define helpers below their callers
when that reads better), `@stylistic/quotes` (the convention above is kept by hand),
`@stylistic/space-unary-ops` (it mistakes the non-null `arr[0]!` for a negation, so `(! foo)` is
kept by hand), `no-underscore-dangle`, `no-continue`, `no-await-in-loop`.

**Safety hatches** -- `@ts-expect-error`, `any`, the non-null `!` -- are allowed, because
forbidding them sends a fix into a tailspin when the problem is elsewhere. Use them with care,
and **always report each one** in chat or in the PR's open questions.
