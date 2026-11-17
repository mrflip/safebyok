# Thread 11: duck calibration (2026-11-06)

Branch `20261106-duck_calibration`, PR #525, base main. Justify: green, 7,701 tests passed and
113 skipped across every package; lint, typecheck, build and size budgets green. Docs only.

* **Built**: STYLE.md *Shapes and duck typing* calibrated against ground rule 6 and the thread 6
  to 8 rulings (Picks, brands, wraps), and two sentences in *Validation* that lean on it.
  - "Duck typing is the design." became "Duck typing is the design for data.", with a closing
    sentence naming the ducks (a bag between our modules, a test's fake, a world) and what is not
    one (a DB or a function a host hands in to be called).
  - "Where a broader duck is harmless, a parameter accepts it" became the rule "A parameter taking
    data accepts any duck of the shape it reads", narrowed by an ad hoc `Pick` or `Partial` of a
    named shape, never a type literal written out (it loses cmd-click and the doc blocks).
  - New: **A world is a `Pick` of its class** (thread 6's ruling).
  - New: **A shape's type is `Z.infer` of its validator, or an interface held to it: choose by the
    reader** (ground rule 6), replacing "A type is `Z.infer` of its validator"; the Coach's
    2026-10-28 rule keeps its quote and now names a host-facing contract as its "good reason".
    "Each shape's validator is built from the record's" no longer says its type is `Z.infer`.
  - New, under *Interfaces a host implements*: **A DB handed across the package boundary carries
    a brand, not a duck** (thread 8) and **A host's function is wrapped once, on its way in**
    (thread 7).
  - *Validation*: the opening paragraph allows a type held to its schema by an assertion; the
    constructor paragraph says a VaultDB or DeviceDB is checked by its brand.
* **Decisions taken**: the brand and wrap rules sit under *Interfaces a host implements*, the
  section's existing home for what a host hands in, rather than at the top; the top bullet points
  down to them. Examples that were no longer true were replaced: `class Vault implements
  VaultStamp` / `class Box implements Boxscope, BoxSparse` (Vault implements `BoxWorld`, Box
  extends `Storable<...>`) by `class Lease implements LeaseStamp`; the outcome union
  (`DamagedVaultRecord` does not exist) by `Fetched<RecordT, SparseT>`; the facet generics
  (`Lifecycled`, `Refused`, `ConsistencyWith` do not exist) by `Tombstone<SparseT>`,
  `Refusing<SchemaT>`; `./shapes/scopes` by `./shapes/shapes-core`; and the sentence on
  `types/type-aliases.ts`, a folder that no longer exists, was dropped.
* **Deviations**: the section grew from 94 to 111 lines: four new rules (world, interface,
  brand, wrap) at three to five lines each, offset by trimming the rule bullets around them.
* **Wording that binds later threads**:
  - Thread 9: "the checker is exported as `Z.ZodType<BankOpts>`, and an equality assertion of the
    two at the file's foot". `BankOpts` is an illustration of a host-facing contract, not a
    ruling that it gets one; thread 9 chooses per type.
  - Thread 6: a world is `Pick<Vault, ...>` / `Pick<Bank, ...>`, "never a third interface beside
    the class"; `ListingWorld`, `BoxWorld` and `VaultWorld` in `shapes-vaultish.ts` are what it
    replaces.
  - Thread 8: "extends our base class and is known by its `Symbol.for` brand"; the *Validation*
    constructor paragraph says the same.
  - Thread 7: "wrapped at `Bank`'s constructor into a checked, branded thing that checks what the
    function answers ... Past it nothing calls the bare function; a parameter takes the branded
    thing." It does not say what kind a wrapper refuses with.
* **Discoveries**:
  - A checker exported as `Z.ZodType<T>` has no `.pick`, `.extend` or `.shape`, which
    "Each shape's validator is built from the record's with `pick`, ..." relies on. A host-facing
    record that thread 9 gives an interface must keep its un-widened checker for deriving its
    shapes (module-local, or exported under the `Z.ZodType<T>` only at the package's index).
    Left for thread 9; STYLE.md does not settle it.
  - "Name the important primitives" cites `Boxlabel` as a plain alias; no such alias exists.
    Left as is: no true example to put in its place.
* **For the Coach** (also the PR's *Open questions*):
  - **Where a `Z.ZodType<T>` checker stops being widened**: recommend widening only where the
    package exports the checker, so the shapes are still derived from the record's checker inside
    the package (see Discoveries).
  - **`Boxlabel`**: recommend thread 9 adds the alias or replaces the example.
