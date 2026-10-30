# Thread 14: Build seals what it stages (2026-10-30)

Branch `20261030-build_seals`, PR #384, stacked on #383 (thread 10). Justify green: safebyok 4266
passed, 37 skipped, 1 todo; every other package green; build and size budgets unmoved. Changeset:
empty. No `eslint-disable`, no `ts-expect-error`.

## Built

All in `packages/safebyok/src/models/`, tests beside each.

1. **A stub seal**, `stub-seal.ts`. `stubSeal(staged, whisper)` returns `boxRecord.parse` of `staged`
   with `box_key_wrapped: StubBoxKeyWrapped` and `whisper_ciphered: StubWhisperCiphered`. Both are
   frozen constants (`{ cipher_iv_b64: 'stub', ciphertext_b64: 'stub-…' }`). The whisper is taken
   whole (`Whisper | null`) and never looked at. The doc block names what replaces the stub.
2. **`build(dna)` seals at birth.** `BoxListing.draftOf` takes the whisper out of the dna and
   returns `stubSeal(draft, whisper ?? null)`. `Listing.draftOf` is now async (`Promise<RecordT>`),
   and `Listing.build` awaits it. `#makeThingFor` stages the full draft over a never-stored shim
   made from `sparseOf(draft)`. `BoxListing.build` refuses `vault_locked` before checking the dna
   against `boxDna`.
3. **`boxDna` drops the sealed parts**, `models-shapes.ts`. A dna carrying either refuses
   `bad_option`, and a new `@example` shows it. The `BoxDna` type omits both.
4. **Timeliness asks of the record in hand alone**, `storable.ts`: `#holdsWhole` is
   `isWholeRecord(this.combined)`. The TODO.md entry "Making a box seals it, so a box is never
   sparse" is removed.

`Box.makeStaged` with a whisper seals through the same stub. Its sidecar is the patch's, else the
base's when the base is full, else `{}`.

## What a built box now holds (for thread 6)

* **Staged:** a full `BoxRecord` at revision 0, alive, in this vault, with the sidecar given or
  `{}`. Its `box_key_wrapped` and `whisper_ciphered` are the two constant placeholders.
* **Central:** a never-stored shim, a tombstone at `NeverStoredSeq` and the sparse form of the
  draft. It holds no sealed parts.
* **The whisper:** in no record, field, snapshot, cache entry, error or log. It goes from the dna
  to `stubSeal`, which drops it unread. Tests check that whatever whisper is given, the record
  carries no secret string, and that a refusal quotes none.
* **What it opens to:** nothing. Unsealing is not written, and `#unseal` still rejects. No key is
  made, wrapped or held anywhere on this path.

## Decisions taken

* **Seal in `draftOf`, before any instance exists.** A seal failure then holds nothing, and build
  stays free of `edit`'s hydrate and fetch.
* **Build refuses `vault_locked` while locked.** The real seal needs the vaultKey through the
  lease. The lint rule `no-declarations-before-early-exit` puts the lock check before `boxDna.parse`.
* **A whisperless dna is sealed with `null`.** The brief's "if it carries one" rules out refusing
  it. A whisperless box is still full.
* **Builds through `fakeSealBoxListingOf` now get the stub's placeholders.** The fake still covers
  `edit`, and its doc says so.

## Approaches set aside

* **Building, then calling `box.edit` / `box.seal`** (the old path). A failed seal held a sparse
  box, and it hydrated, so a build fetched.
* **A seal hook in the base `Listing`.** Only boxes seal, and the async `draftOf` already serves
  both kinds; a vault's draft is `Promise.resolve`d.
* **Refusing a whisperless build.** Against the brief, and it would churn every test building a
  bare box.

## Restated tests

These earlier tests changed what they assert. Each was restated in place:

* `box-listing.test.ts`:
  * "fills the draft's defaults …" now expects a full draft with sidecar `{}`.
  * "seals the whisper in at birth …" replaces the test that expected `unexpected_error` from the
    unwritten seal.
  * The snapshot test now expects `full: true`.
* `box.test.ts`: "born from a dna …" now expects full, sidecar `{}`.
* `listing.test.ts`: "refuses a box not full as 'bad_record'" builds from `sparseBoxRecord()`,
  since a dna no longer makes a sparse box.
* `models-shapes.test.ts` (`boxDna`):
  * "passes the sealed parts of a full record" is removed.
  * The whisper_ciphered shape case became two `bad_option` refusals.
  * "keeps the sidecar and the sealed parts given" became "keeps the sidecar given".
* `storable.test.ts`: "never fetches a draft for want of the whisperCiphered: a draft is staged
  full".

New describes are appended at the end of `box-listing.test.ts`, `box.test.ts` and
`storable.test.ts`, and `stub-seal.test.ts` is new.

## Discoveries

* `Promise.resolve(boxRecord.parse(…))` lets a bug-only bad `staged` throw synchronously. The lint
  rules rule out both `.then` and an `async` arrow without an await. The test wraps the call, so it
  pins neither sync nor async.
* Words fixed in `models-shapes.ts` doc blocks, the files touched: three "What …" openings; "write"
  became "put and del"; "reads" became "heeds".

## For the Coach

* **Whisperless build:** the real seal must say what it ciphers for no whisper and what unseal
  answers. Recommendation: an explicit empty whisper, unsealing to `null`.
* **Locked before malformed:** a malformed dna built while locked refuses `vault_locked`.
* **Sidecar over a sparse base in `edit`:** `{}` may drop a stored sidecar. The real seal should
  hydrate first.
