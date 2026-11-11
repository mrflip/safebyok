# More style

What STYLE.md leaves out so a reviewer need not carry it: rules that earn a tag and a review finding but that most code
keeps without being told, the design of the interfaces a host implements, and the measurements behind a few of
STYLE.md's rules. The doc-block pairs are in `notes/gallant-docblocks.md`.

## Doc blocks

* **Option values get a list** `#option-values-get-a-list`, one value a line, the default marked (the Gallant `create` in
  `notes/gallant-docblocks.md`). A term with a home (`sealed`, `stamp`) gets one `{@link}` or a pointer, never a
  second definition `#point-dont-redefine`.
* **A guard names the predicates it asks** `#guard-names-its-predicates`, linked: `throw unless {@link isEnabled}, unlocked,
  {@link isPresent}, {@link isFull}`.
* **A maintainer's note is a `//` comment** `#reason-goes-above`, on the line above the doc block or by the code it concerns.
  It records an invariant kept (`// every lock goes through here`) or a reason (`// The lock first: no box opens under a
  lease while the tombstone goes out.`). STYLE.md's `#purpose-not-path` already sends a reason there. This rule gives the
  form the note takes.
* `@param` and `@returns` only for a unit, a range, or what `null` or leaving an optional out means. A `{@link}` names
  something in scope in its file; anything else is backticks, a private member always.
* **An `@example` earns its lines by showing what the first line and the signature do not** `#example-earns-its-lines`: a
  failure that reads several ways (a label `0__b_`), a shape the type hides, a call order that matters, an option value
  with a consequence. An enum validator, a getter or a one-call method gets none; where a test already shows the case, the
  test is the example. One line each where it can be, and each has a test (STYLE.md *Tests*).
* **A file past about 40 KB is sectioned.** `// == [Mark]: heedMark, markSeeing, others` opens a
  section (its name, then the names a reader would `rg` for), `// --` closes it, both at the
  section's indentation; sections are flat, never nested. `rg -n '// == ' <file>` is the file's
  table of contents. A banner groups declarations; it does not excuse a file that should be
  split, and it moves with the code it names.

## Interfaces a host implements

* **An interface a host implements is typed as what belongs there**, never `unknown`, with its doc
  block saying what is checked and by whom. The check keeps damage out, not the type.
* **A DB handed across the package boundary carries a brand, not a duck.** An AdapterVaultDB or
  DeviceDB extends our base class, and any VaultDB, a client too, is known by its `Symbol.for` brand:
  a duck check passes anything with the right method names, and `instanceof` fails the second copy
  of safebyok an adapter package may bundle.
* **A brand is a `Symbol.for('@safebyok/<name>')` key, never a `Symbol()`**, so every copy of the
  package shares it, and a host may wear one on purpose. It is attached by a class getter
  (`get [IsVaultError](): true`) or by `brand(obj, Brand, val)`, and read only through
  `brandOf(val, Brand)` or a guard built on it (`isVaultError`, `isGuarded`), never as `val[Brand]`.
  A host's docs point it to a guard or a getter, never a brand or a sentinel's identity: `isWhisperedBag`
  and `box.exposure`, not `Whispered` or `box.whisper === LOCKED`.
  A symbol key is UpperCamel (`IsGuarded`, `Whispered`); a sentinel is ALLCAP (`NOVEL`, `ENCRYPTED`).
  A model of a closed family is told by its string `modelkind`, a getter on the class
  (`hasModelkind(val, 'wayin')`), not by a brand or `instanceof`.
* **A host's function is wrapped once, on its way in.** Each function a host hands `Bank.make`
  (`requestCleartext`, the key deriver, the strength checker, `onLifecycle`, ...) is wrapped at `Bank`'s
  constructor into a checked, branded thing that checks what the function returns (STYLE.md *Validation*).
  Past it nothing calls the bare function; a parameter accepts the branded thing.
* **A browser checks what a server sends.** A server is not trusted, so a browser checks each
  record it is sent that it will use. It may accept a server's word that a record is damaged: the
  worst a lying server does with that is offer to delete what it could delete anyway. It still
  parses the word itself (a damaged box's label, its kind of damage, its token).
* **A wire sharpens an interface.** A VaultDB's client implements the same `VaultDB` as the
  adapter behind it, and each GraphQL operation returns what its verb's `try*` form returns, so a browser's
  adapter checks the server's answer with the core's answer checks and passes it on. Where the two
  would differ, change the VaultDB.

## Tree-shaking

What a host's bundler can drop, measured on 30 validators of which 5 are used, with esbuild and
rolldown, classic Zod and `zod/mini` alike (measured when the choice was open; the core and the
packages that use Zod are on classic Zod, since a host's bundle carries one flavour):

* An unannotated top-level validator is never dropped.
* One `/* @__PURE__ */` before a chain is not enough. Annotate **every** call in the chain, or wrap
  the whole expression once: `/* @__PURE__ */ (() => str().min(1).max(9))()`.
* `sideEffects: false` drops a module nothing imports from; nothing inside an imported one.
* The library is the real cost: the same five validators bundle to 24-27 KB gzipped with classic
  and 6.7-6.9 KB with mini. The 25 unused validators cost 130-170 bytes.

A `Checkers` call keeps every schema it makes, used or not, and the Coach accepts that: the
advice above is moot for validators, and applies to everything else.
