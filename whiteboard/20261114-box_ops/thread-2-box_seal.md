# Thread 2: box_seal (2026-11-15)

Branch `20261115-box_seal`, PR #TBD, stacked on #701 (`20261115-box_store`). Proved: `pnpm --filter safebyok` lint,
typecheck and test, 641 tests green; `pnpm justify` at ready.

* **Built**
  * `Sealed` (`storage/shapes-thing.ts`), `{ key_wrapped, ciphered, codectag, schematag }` at `<part>_sealed`. It is
    defined once, as the `sealed` check's type, and that check is strict, with both tags checked as `label`s.
  * `boxSparse` (storage) checks a box's Thing fields, stripping the body. It accepts the shell (revseq -1, lifeseq
    `'-1'`, the void revtok, all three or none).
  * `models/sealers.ts`:
    * `SealedOf` and `UnsealedOf`.
    * `Sealer<PriorT, NextT, RecordT, CleartextsT>`, which gains `tags`.
    * `BoxWhisper`, which reads and writes `whisper_sealed`, binds the Thing fields, and starts a new life at the next
      lifeseq.
    * `BoxTombstone = { ...BoxWhisper, nextRevisionOf: boxTombstoneOf }`.
  * `lease.ts`: the ctx is `[bankStamp, ...stamps, purpose, { codectag, schematag }]`. `seal` writes the tags into the
    `Sealed`, and `unseal` reads them back from it.
  * `bank.ts`: `sealBox(prior, cleartexts)`, `tombstoneBox(prior)`, `unsealBox(box)` (a live box or a tombstone), and
    `#demandBox(box, check)`.
  * Tests: `boxShellOf` in `models-world.ts`; sealers, lease, bank, ctx-bytes and `boxSparse` cases.

* **Decisions taken**
  * **Who binds the tags.** The lease binds them, as cipherCtx's visible header after the purpose, the house
    construction a wayin uses. The lease writes the `Sealed`, so it binds what it writes. `sealedOf` pins the stored
    tags to the sealer's, so a seal under another codec refuses `damaged_whisper` before any WebCrypto call.
  * **The tag values.** `codectag: 'json_v1'` and `schematag: 'whisper_v1'`, both constants. No signature accepts a
    customer's schematag yet (see *For the Coach*).
  * **What `#demandBox` parses with.** It takes the check as an argument: `boxSparse` for a prior (so the shell passes),
    `boxThing` for an unseal. Either parse refuses `bad_option`, and then the scope check refuses `record_conflict`.
  * **Tombstones.**
    * A tombstone keeps `born_at`, as big's kept `registered_at`. It takes the next revseq, the next lifeseq, and no
      sidecar.
    * revseq counts up across lives.
    * A tombstone or the shell as the prior refuses `bad_option`, with `Phrases.TombstoneOfLiveOnly`.
  * **How `UnsealedOf` and `SealedOf` read a union.** They are distributive, so `BoxUnsealed = UnsealedOf<BoxRecord |
    BoxTombstone, BoxCleartexts>` covers a tombstone. The doc's table names `UnsealedOf<BoxRecord, …>` alone.
  * **The test shell.** It has no record, so `boxShellOf` gives it `born_at` and `written_at` of T0.
    `bank.tryGetBox({ ifAbsent: 'shell' })` (thread 3) must fill these two too.

* **Deviations**
  * **The tags are not in `stampsOf`.** The doc says `stampsOf` "binds the box's Thing fields and the two tags". Here
    `stampsOf` gives the Thing fields alone, and the lease binds the tags as the header. The bytes bound are the same
    set, in a different place in the ctx.
  * **The purposes changed** to `whisper_sealed.key_wrapped` and `whisper_sealed.ciphered`, since cipherCtx's purpose
    names the field. This is a fourth change to BoxWhisper; the doc lists three.
  * **Two storage touches.** Both tags are now `label`s, which bounds them; they were `str`. `boxSparse` is new in
    storage, because the refine helpers it needs are private there, and a copy would split the Thing's rules.
  * **Kept from the Coach's sketch:** `#demandBox` parses, returns the box, and refuses `record_conflict`. **Dropped:**
    his `Sealed` placeholder (the doc's names supersede it), `queryCacheOpts`, and the `thing-minder` changes (another
    thread's).

* **Guarantees loosened or changed**
  * **A box of another life of the bank is not caught.** A Thing box carries no `bank_tok`, and the bank's stamp still
    has `bank_tok`, so a box sealed under an earlier life now refuses only as `damaged_whisper`, if its bankKey
    differs. Thread 3 brings back big's check (#4) through the root lifeseq in `#demandBox`.
  * **A delete needs the bank unlocked**, because a tombstone is sealed.
  * **Old boxes fail safe.** A box in big's shape fails the box check (`bad_option`). A box sealed under the old ctx
    refuses `damaged_whisper`.

* **For thread 3**
  * **The root-lifeseq check in `#demandBox`.** Today a changed leading lifeseq of a box's lifepath refuses
    `damaged_whisper` at the unseal (a test in `bank.test.ts`, "its lifepath's root lifeseq"). With the check, it
    refuses `record_conflict` first, and that test moves.
  * **The bank's stamp moves from `bank_tok` to `lifeseq`.** `ctx-bytes.test.ts` pins the bank-stamp bytes.

* **Discoveries**
  * Zod 4: `.extend` on a refined object can throw, so the prior check is `boxSparse.and(obj({ sidecar }))`. `Omit` over
    a union does not distribute, hence the conditional types.
  * **TODO.md's "Seal must reject anything with revision < 0"** falls out for boxes. `recordOf` parses the sealed
    record with `boxThing`, whose revseq is a uint, and a prior's revseq below -1 refuses at `boxSparse`. The line can
    be struck.

* **For the Coach**
  * **Why `boxOfBank` was different from `boxRecord`** (your note in `bank.ts`). `boxOfBank` picked out big's bank
    fields of a box (`user_id`, `banklabel`, `bank_tok`) to compare with the bank's stamp. `boxRecord` checked the
    box's whole shape. `#demandBox` now does both in turn: it parses by the box's own shape, then compares its
    `userid` and `banklabel` with the bank's.
  * **The schematag is "the customer's tag"** in the doc, but no API accepts one, so it is the constant
    `whisper_v1`. Recommendation: leave it constant until a host asks.
  * **A tombstone whose sealed whisper is not empty** unseals. Only a holder of the bankKey can make one, so it forges
    nothing. Recommendation: leave it as it is.
  * **Same name, two meanings.** The type `BoxTombstone` (a stored tombstone) and the const `BoxTombstone` (its sealer)
    share a name in `sealers.ts`, as the doc names both. Lint passes. Rename the type if it confuses.
