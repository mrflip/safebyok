# TODO

The backlog of the new core, `packages/safebyok`. `TODO-big.md` is the backlog of `safebyok-big`.

* **Reevaluate keeping void and gone separate in the minder.** For a host they differ only in act names, and the
  cache decides nothing differently between them; only a birth's cited record differs, and the writer builds that from
  the parent it holds. The minder makes up a shell for a void answer (`#shellAt`, `RootNotCached`, the `void` car) so
  that a car's `newest` is always a record. Consider a void car that holds no record, or folding void into gone, and
  making the shell only where a birth cites it.
* **Give fine-grained invalidation in the minder's `get`, its fetch and `isStaleAt`.** A get has one `staleTime`
  today. Let it say a sparse record is acceptable (`sparseOk`) apart from how old a record may be, and let invalidation
  and a refused get count as stale, as TanStack counts them; and decide whether `'static'` has any use for a car, whose
  newest the vaultDB can always replace (whiteboard/20261115-lean_buttonup, the staleTime table, 2026-11-18).
* **The vaultDB should not return sparse tombstones.** A list sends each tombstone, and a gone parent, sparse
  (`classifyListThings`' `sparseOf`), and its types and docs promise them (`vault-db.ts`); a get's tombstone is always
  whole. Send every tombstone whole, so that "sparse" means live and not whole, and the minder's `gotgone` answers a
  whole tombstone as the vaultDB's does.
* **Redo `bestCarOf` for titles and sparse tombstones.** The vaultDB is to send only whole tombstones, and the void
  sentinel counts as a tombstone, not gone (the Coach, 2026-11-18). `bestCarOf`, `carOf`, the car's checks and
  `isTombstone` are written for sparse tombstones and for a tombstone that excludes the void sentinel; rename them for
  what they test, and drop what a sparse tombstone needed.
* **`cleartext` names two things.** VOCABULARY.md's cleartext is the passphrase or passkey answer a gating accepts.
  `BoxCleartexts`, in `shapes/shapes-sealers.ts`, uses it for what a seal ciphers: a box's whisper. One of them needs
  another name. Every other name tried so far has been worse.
* **A bank's lives can share a lifeseq.** The bank's stamp binds its lifeseq, and every ctx binds the stamp. Where
  storage loses the bank row and a bank is born again at the same lifeseq, a wrap of the earlier life unwraps in the new
  one: only to the earlier bankKey, but it unwraps. Big's random `bank_tok` ruled that out. Whatever closes it should not
  be one more check in the box.
* **A box birth does not check that its parent is live.** Neither store looks at the root box when a box under it is
  born, so a box can be born under a deleted root box. Whatever checks it belongs in the store's write, beside the other
  preconditions, not in a check before it.

* **A sealed part is not branded.** `seal`'s exit check (`recordOf`'s strict parse) checks a record's shape, not where it
  came from, so nothing in the types tells a record the lease sealed from one assembled by hand. A brand would have to be
  set by the store's parse on read as well. Held while the seal path is in flux (the Coach, 2026-11-17).

* If a request has any kind of `world` error it must not return anything in `val` or `dbhas`

* **Hash the userid that keys what a browser keeps before sign-in.** Under `keepOnDevice: 'userids'`, each user's
  stamp and wayin headers are kept on the device, keyed by userid, so whoever uses the browser next can read who used it
  before. Key them instead on HMAC-SHA-256 of the userid under one random salt per browser, made at the first `hello()`,
  and keep no userid in the value, since the bank's stamp carries one. `@noble/hashes` keeps it synchronous, which the
  first read needs; WebCrypto's HMAC is async. It hides the list from a look through storage, not from a test of a
  guessed userid, since the salt is on the device; and it gives up a list of past users to pick from. An entry in
  `notes/security.md` once built (`whiteboard/20261116-react_backwards/internals.md`, open matter 13).
* **Confirm a bankKey against the gate.** Nothing proves that the bankKey a kept lease or a wayin yields is this bank's:
  a lease records the gate revision it was granted under, and nothing compares it with the gate fetched; a wayin is
  checked only by unwrapping it. Give each gate row one part sealed under the bankKey, through the lease's `seal` with a
  sealer of its own, its ctx binding the bank's stamp and the gate's, wayin headers included, rewritten by each gate verb
  as it writes the gate. A kept lease that unseals it is the bank's, and the gate revision was written by someone holding
  the bankKey; an unlock checked the same way refuses a wayin storage swapped in, before anything is sealed under the
  wrong key. Agreed in principle (the Coach, 2026-11-17); an entry in `notes/security.md` once built
  (`whiteboard/20261116-react_backwards/internals.md`, F15).
