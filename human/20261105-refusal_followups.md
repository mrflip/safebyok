# Refusal follow-ups (2026-11-05)

Branch `20261105-refusal_followups`, stacked on #505. The Coach's rulings on the refusal-kinds
follow-ups, one commit each.

* **`ListingExpected` stays as a phrase.** The handoff said to drop it with the `listingExpected`
  thrower, but `storableArgs` (shapes-vaultish.ts) still checks a storable's listing with it, so
  only the thrower and its test went.
* **`NoErrorGiven` was reworded** to name no storage backend ("What failed threw nothing: null or
  undefined, not an Error."), since `unexpected_error` now uses it too; `NothingThrown` went.
* **G8 says more than the seal and grant paths.** Making a wayin or a lease from a proving
  (`Proving.buildWayin`, `Proving.buildLease`: `makeVaultKey`, the unwrap and wrap of a vaultKey
  already proved) also lets a WebCrypto error reach `unexpected_error`, so the rewritten sentence
  names those too. G8's later `refusalOf` sentence ("never WebCrypto's error ...") contradicted the
  new one and was brought in line.
* **notes/security.md keeps two `bad_whisper` mentions** in older entries (the `box.seal` entry,
  about line 1263, and the `mask` entry, about line 1989). Only the #499 entry's was in scope; if
  #509's cull reaches those entries' subjects, they want their own amendment.
