# 2026-11-17: Doc blocks of #715 rewritten -- one disagreement, four questions

The doc blocks PR #715 adds or changes in `packages/safebyok/src/`, rewritten to STYLE.md's
*Writing* and *Comments and doc blocks*. Doc blocks only: no behaviour, name, `@example` or
running comment changed. Commits `89c0d7847` (models/) and `f5260343f` (phrases.ts).

## Doc-block lines per file, whole file, before and after

| File | Before | After |
| --- | --- | --- |
| models/core-box.ts | 24 | 29 |
| models/lease.ts | 42 | 45 |
| models/sealers.ts | 35 | 42 |
| models/bank.ts | 78 | 80 |
| models/proving.ts | 56 | 56 |
| models/stamps.ts | 17 | 19 |
| storage/shapes-thing.ts | 132 | 132 |
| phrases.ts | 44 | 44 |

The counts grew because each pair of facts joined by a semicolon became two sentences, often on
two lines, and `PublicPropsOf` became an option list.

## Changes, member by member

### models/core-box.ts

* `Checks`: names what it checks in the codebase's terms (a sealable, live or any, the public and
  secret props, the stored record).
* `CoreBox` (class): opens with what it is (the `Sealer` for a box's whisper) and how to use it
  (pass the class itself). Second line gives the guarantee: the whisper unseals only within the
  revision it was sealed in, and the sidecar is outside the seal, so storage can change it and the
  box still unseals.
* `donorPropsOf`, `publicPropsOf`, `secretPropsOf`: each semicolon became a second sentence.
* `nextRevisionOf`: four facts, a sentence each: what it returns, the next life after a tombstone
  or the shell, where the sidecar comes from (one of the two must have one), and `written_at`.
* `tombstoneOf`: what it returns, then `written_at`, then the sidecar rule: the donor's sidecar
  is dropped and a sidecar given in `publicProps` refuses.
* `purposes`: "its" now names the whisper.
* `stampOf`: points to `BoxStamp` rather than redefining it. It still says the shell refuses, and why.
* `encode`, `decode`, `sealedOf`, `recordOf`: semicolons became sentences. `decode` keeps the
  guarantee that a refusal never quotes the text.
* `nextLifeOf`: names the parameter correctly (there is no `box` parameter).

### models/sealers.ts

* `SealedPartsOf`, `SealedOf`, `UnsealedOf`, `RevisionOf`: "replaced by its sealed form" and
  "replaced by its cleartext" in place of "sealed" and "unsealed" used as bare adjectives.
* `Sealable`: no longer opens on "What". Names the record and the forms it may take.
* `PublicPropsOf`: a semicolon-gapped sentence became an option list with defaults.
* `LivePublicPropsOf`, `TombstonePublicProps`, `BoxPublicProps`: say "public props" and give
  defaults in the house form.
* `SealTags`: "stored unencrypted and bound into its seal", not "in the clear, which its seal binds".
* `Sealer` (interface): two sentences for the two type parameters. The member contract became a
  requirement on implementers, with its reason: "Each member must check what it is given: the
  lease passes its caller's arguments on unchecked."
* `Sealer` members: "its other fields dropped" became "with every other field dropped", and
  "refusing as damaged" became a sentence. `tombstoneOf` gives `written_at` a line of its own.
  `tombstoneSecrets` says the seal authenticates the tombstone.

### models/lease.ts

* `AnySealer`, `CleartextFieldnames`: a phrase each, with the reasons and the caller removed.
* `Lease` (class): its third line now says that the sealer decides, then what the lease knows.
* `seal`: now says what the caller gets and what refuses, and leaves out the approvelist and
  banlist steps. It keeps the promise: "The seal checks its arguments and the record it returns, so
  pass `donorProps` as you have it". The tombstone case says it refuses any `secretProps`, and
  that the sealer may refuse body fields (`CoreBox` refuses a sidecar).
* `unseal`: opens with the act. It says the answer is a new, frozen record built from `record` as
  checked, not `record` itself.
* `#sealText`: opens with the act ("Encrypt").
* `withoutSecrets`: says it returns a copy, names the fields it drops, and says "It checks
  nothing else of `bag`". It stays deliberately unvalidated, and this sentence makes that visible.
* `sealerMembersOf`: no semicolon.

### models/bank.ts

* `BankMakeRecord`: the root box's two states are now a sentence of their own.
* `#rootBox`, `rootBox`: said "Thing fields". They hold the whole stored record or the shell (see
  *Disagreements*).
* `sealBox`: what it returns, the checks promise, the next life, the sidecar, the tombstone case
  and its refusals, and `written_at`, a sentence each. It names no refusal kind.
* `tombstoneBox`: the mechanism ("ciphered under a fresh boxKey") became the guarantee ("Its
  sealed empty whisper authenticates it").
* `#demandOwnBox`: a guard phrase that names its predicate. The refusal catalog is gone.

### models/proving.ts, models/stamps.ts, phrases.ts

* `Checks` (proving): links `GateRevisionedStamp`.
* `GateRevisionedStamp`: "A `GateStamp` with the `revtok` of one revision of the gate", with the
  inline `@see` replaced by the link.
* `BoxStamp`: the guarantee on its own line: the whisper unseals only within the revision it was
  sealed in.
* `DonorHalfShell` (phrase's doc block): "A sealable box that is half the shell."

Left alone, as the PR does not change their doc blocks: shapes-thing.ts (only running comments and
a removed type changed), `buildNovel` ×2 (already rewritten in `b67f3a9f7`), `unsealBox`,
`unlockByProving`, `BoxShell`, `BoxUnsealed`, `#openSealed`, `#ctxOf`.

## Facts dropped

None of these is cut plainly by STYLE.md. A Coach may want some of them back.

1. `CoreBox` (class): "It also makes the revisions a lease seals: `nextRevisionOf` and
   `tombstoneOf`." Each member documents itself.
2. `CoreBox.decode`, `CoreBox.sealedOf`: the kind `damaged_whisper` (`#no-refusal-catalog`).
   `sealedOf` still says the record must carry a box's tags.
3. `CoreBox.tombstoneOf`: "Refuses a tombstone or the shell." "The live box" in its first line
   implies it, and the `Sealer` interface's `tombstoneOf` still says it.
4. `CoreBox.stampOf`: "its Thing fields, without its sidecar or its sealed whisper". `BoxStamp`
   says this.
5. `Lease.seal`: the tombstone "sealing the sealer's empty cleartexts". The kind `bad_option` for
   `secretProps` given to a tombstone: the refusal is kept, its kind dropped. "Only its Thing
   fields and body are read".
6. `Bank.sealBox`: the kind `bad_option`. "Only its Thing fields and sidecar are read". The
   promise "pass `donorProps` as you have it" now covers both.
7. `Bank.tombstoneBox`: "ciphered under a fresh boxKey" (mechanism).
8. `Bank.#demandOwnBox`: `record_conflict` if not this bank's, `bad_option` if not a box.
9. `CleartextFieldnames`: "which a sealable never carries into a revision" (who uses it).
10. `AnySealer`: "the lease is generic over what it seals".
11. `Sealer` (interface): "so the lease itself knows nothing of the record" (a reason). The
    `Lease` class block still says the lease knows only which fieldnames hold secrets.
12. `GateRevisionedStamp`: `@see {@link Stamps.gateStamp}`. It now links `GateStamp`.

## Disagreements between the code and the old prose

* `Bank.#rootBox` and `Bank.rootBox` said "The root box's Thing fields". The type is
  `BoxRecord | BoxShell`. Since `bad0ef42e`, the bank keeps the whole stored record once born.
  The blocks now say what the code does.

## Proposed renames

* `Sealer.nextRevisionOf` and `Sealer.tombstoneOf` (and `CoreBox`'s): STYLE.md promises that
  `fooOf` is pure, but each mints a random `revtok` and reads the clock. `makeNextRevision` and
  `makeTombstone` would keep that promise. They are low priority: the interface is new, and
  renaming touches the lease, the sealer check and the tests.
* `Phrases.DonorHalfShell`: VOCABULARY's term is *sealable*, so `SealableHalfShell` would fit
  better. Its message text ("A box a revision is made from ...") would change with it, which is
  behaviour, so I left both alone.

## Open questions

1. **"Checked strictly"**: the brief's wording for the seal's promise. I wrote "The seal checks its
   arguments and the record it returns", not "strictly". In this codebase "strict" means that
   unknown fields refuse, but the sealable, public and secret props checks drop unknown fields
   (Zod's default strip). Only the returned record is checked strictly. Is "checks" the right
   promise, or should the doc say that unknown fields are dropped?
2. **Should `Sealer.decode` require that a refusal never quotes the text?** `CoreBox.decode`
   promises this, and its doc says so. The interface asks nothing of another sealer, so a future
   sealer could leak cleartext through an error message. This is worth a sentence on the
   interface if the Coach agrees, and maybe a note in `notes/security.md`.
3. **`Lease.seal` names `CoreBox`** as the example of a sealer that refuses a sidecar on a
   tombstone. It reads as a sibling reference, but it is the only sealer, and it is the concrete
   case. Keep it or drop it?
4. **Out of scope, but noticed**: the running comment above `boxSealable` in
   `storage/shapes-thing.ts` ("What a box's seal takes its next revision's fields from strips:
   ...") does not parse. VOCABULARY's *sealable* entry tells the mechanism ("the sealer's
   approvelist, then the lease's banlist"), the same thing the reviewer flagged in `seal`. Both
   need a pass outside this brief.
