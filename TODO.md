# TODO

The backlog of the new core, `packages/safebyok`. `TODO-big.md` is the backlog of `safebyok-big`.

* **Reevaluate keeping void and gone separate in the minder.** For a host they differ only in act names, and the
  cache decides nothing differently between them; only a birth's cited record differs, and the writer builds that from
  the parent it holds. The minder makes up a shell for a void answer (`#shellAt`, `RootNotCached`) so that an item
  always has a record. Consider an item that has no record for void, or folding void into gone, and
  making the shell only where a birth cites it.
* **Give fine-grained invalidation in the vault TSQ's `getOnce`.** A get has one `staleTime`
  today. Let it say a sparse record is acceptable (`sparseOk`) apart from how old a record may be
  (whiteboard/20261115-lean_buttonup, the staleTime table, 2026-11-18).
* **`vault.editBoxRecord(labelpath, fn)`, the second kind of orchestrating method.** Read the box unsealed, as
  `withWhisper` does, and seal what `fn` returns into a put ask citing the revision read. Its snapshot check, a
  `#demandPuttableThing`, refuses `stale_write` where the item is behind at all, where `withWhisper`'s
  `#demandReadableBox` answers an item behind within its life (the Coach, 2026-11-20, soon_item rework 5).
* **Items go stale only on evidence.** An item is fresh for good while its Thing is `here`, so where the vaultDB has no
  watch, or its watch lapses (the watch contract has no signal for a drop or a resume), TanStack's focus and reconnect
  refetch nothing. Revisit: "No timers at this moment" (the Coach; lapse re-checks, 2026-11-19).
* **A query key whose subtree is one prefix.** Interleave the labelpath's segments with `'/'`, and end the key with
  `'.'` for the Thing's own item or `'L'` for its listing: `[…, 'box', '/', 'engineering', '.']`, `[…, 'box', '/',
  'engineering', 'L']`. No label can be `'.'`, `'/'` or `'L'`. Then `[…, 'engineering', '/']` matches every item and
  listing under the Thing and neither of its own; a listing is beside its Thing's item, and nowhere else (the Coach,
  2026-11-19).
* **A small list answer.** The vaultDB's list answers a sparse record for each child, as its `deltas`. Make it small:
  the parent's scope and life once, then for each child its label, revseq, revtok, lifeseq and `written_at`. Re-listing after a lapse then costs one small request per
  listing, where re-getting would cost one per box. Not for the giver_needs sprint: no proposal, no adapter change yet
  (the Coach, 2026-11-19).
* **Drop a gone parent's subtree.** When a Thing is tombstoned, or a newer life of it is heard of (a lapse can hide the
  tombstone between), the vault TSQ resets its own listing and leaves every item and listing below it as it was. Reset
  every query under its subtree; a get of a child under way then rejects with the library's `CancelledError`, as
  notes/wontfix.md has it for one item (the Coach, 2026-11-19).
* **A pouch: display data in each box's sparse record, so every listing carries it** (internals.md F6, open matter 14).
  It changes what "sparse" means: a sparse record would carry data where a row now shows null (the Coach, 2026-11-19).
* **`cleartext` names two things.** VOCABULARY.md's cleartext is the passphrase or passkey answer a gating accepts.
  `BoxCleartexts`, in `shapes/shapes-sealers.ts`, uses it for what a seal ciphers: a box's whisper. One of them needs
  another name. Every other name tried so far has been worse.
* **A box birth does not check that its parent is live.** Neither store looks at the root box when a box under it is
  born, so a box can be born under a deleted root box. Whatever checks it belongs in the store's write, beside the other
  preconditions, not in a check before it.

* **A sealed part is not branded.** `seal`'s exit check (`recordOf`'s strict parse) checks a record's shape, not where it
  came from, so nothing in the types tells a record the lease sealed from one assembled by hand. A brand would have to be
  set by the store's parse on read as well. Held while the seal path is in flux (the Coach, 2026-11-17).

* **Hash the userid that keys what a browser keeps before sign-in.** On a host's `rootShelf`, each user's bank, main
  gate and root box are kept on the device, keyed by userid (`shelfCkeyOf`), so whoever uses the browser next can read
  who used it before. Key them instead on HMAC-SHA-256 of the userid under one random salt per browser, made at the first `hello()`,
  and keep no userid in the value, since the bank's stamp carries one. `@noble/hashes` keeps it synchronous, which the
  first read needs; WebCrypto's HMAC is async. It hides the list from a look through storage, not from a test of a
  guessed userid, since the salt is on the device; and it gives up a list of past users to pick from. An entry in
  `notes/security.md` once built (`whiteboard/20261116-react_backwards/internals.md`, open matter 13). Waits until the
  timing of the packet's first reads is worked out (the Coach, 2026-11-19).
* **Confirm a bankKey against the gate.** Nothing proves that the bankKey a kept lease or a wayin yields is this bank's:
  a lease records the gate revision it was granted under, and nothing compares it with the gate fetched; a wayin is
  checked only by unwrapping it. Give each gate row one part sealed under the bankKey, through the lease's `seal` with a
  sealer of its own, its ctx binding the bank's stamp and the gate's, wayin headers included, rewritten by each gate verb
  as it writes the gate. A kept lease that unseals it is the bank's, and the gate revision was written by someone holding
  the bankKey; an unlock checked the same way refuses a wayin storage swapped in, before anything is sealed under the
  wrong key. Agreed in principle (the Coach, 2026-11-17); an entry in `notes/security.md` once built
  (`whiteboard/20261116-react_backwards/internals.md`, F15).
* **Consider one module for the duck checks of host interfaces.** `vaultDBShape` (in `ThingChecks`) and the like check
  that a host's object is a `VaultDB`, a root shelf or a query client by sampling its member names. Gathered in one
  module they would leave the files that hold them now, if the imports allow it without a cycle. Optional: one sitting
  alone in `ThingChecks` is fine (the Coach, 2026-11-18).
* **Have `vaultDB.vacate` clear what an adapter's own client caches.** A vaultDB whose transport has a client cache
  of its own (Apollo's and Convex's clients can) is one more place that holds a user's records on the device, and a
  discard that ends at the minder's cache and the host's React Query does not reach it. Not yet checked against any
  adapter: for each, find whether its client caches what it fetches, and have its `vacate` clear that
  (the Coach, 2026-11-21, `whiteboard/20261121-react_life/`).
* **A smarter policy in `mask` for a caller's tail.** `mask(text, { tail })` takes the caller's tail at every length,
  so the demos' live reveal, `mask(val, { tail: 4 })`, shows four characters of a value of 12 or fewer, and all of a
  four-character one, where the schedule shows none of short text. The flaw is in `mask`, not its callers: "make mask
  have smarter policy for a locked/stored [use] case" (the Coach, 2026-11-21, react_life #808). `mask` is
  safebyok-big's helper, re-exported by the core; broaden it there.
* **A marker on the parts for session-replay tools.** A revealed secret is plain text in the DOM, and a replay tool
  records it. Give `WhisperText`, `WhisperInput` and `PassphraseInput` a stable attribute a host can tell its replay
  tool to mask (docs/threat-model.md, *Not built yet*; the Coach, 2026-11-23).
* **`MaskingPolicy`: one name for where and when text is masked.** "To define the space-time extent of masked text"
  (the Coach, 2026-11-23). Its space half is today's `MaskSchedule`, the map from a text's length to how many stars show
  and how many characters from each end; rename it when `mask` is ported out of `safebyok-big`. Its time half is not
  built: a revealed field masks again when the tab is hidden, or on a timer ("Masking a field at the tab-sleep
  notification or a timer is quite reasonable").
* **A freshness bound on the gate.** A lease stands until this device hears of a newer gate revision, however long
  that takes. Let a host set a period within which the gate must be confirmed from the vaultDB for the lease to stand.
  Void against whoever controls the clock (the Coach, 2026-11-23).
* **A second lease clock, for idleness, as a host's option.** "Only after we have things working." The common case has
  lock times of days or never: a password manager is one thing, a price-capped token typed once and put in a header is
  another. Today nothing locks a bank when its lease ends: the snapshot only reports `leaseEndsAt` (the Coach,
  2026-11-23).
* **Pad a whisper's text before it is sealed, so the ciphertext's length says little.** A sealed whisper is as long as
  its text, and an API key's length often says whose it is; the backend sees that length today. The whisper is sealed as
  JSON, which reads the same with spaces after it, so pad the text to a length chosen by Padmé (Nikitin et al., "Reducing
  Metadata Leakage from Encrypted Files and Communication with PURBs", PETS 2019), which leaks O(log log n) bits of the
  length for at most about 12% more bytes. A record sealed before the change still unseals. "A customer can pad too"
  (the Coach, 2026-11-23).
* **A lease's own fields are its loggable.** STYLE.md says a stateful object's own fields are its loggable fields, but a
  lease's own enumerable fields are still its stamp: whole tokens, and no `isEvicted`, so `{ ...lease }` differs from
  `lease.loggable`. Make them agree, keep the stamp as a getter for what a ctx binds, and retire `LeaseSparse`, which
  nothing answers since `toJSON` answers the loggable (the Coach, 2026-11-23, dojo_backdoor's second review).
  "`LeaseStamp` should be the stamp, lease sparse doesn't sound useful as a type" (the Coach, 2026-11-23).
* **Wayin and Proving break the spread rule.** `{ ...wayin }` shows its whole record, the wrapped bankKey included, and
  `{ ...proving }` its header's salts and credential id. STYLE.md's rule is that a spread shows only what belongs in a
  log. Device, Bank, Gate, Vault and Gating keep it; fix these two (the Coach, 2026-11-23).
* **Whether a box's record keeps the spread rule.** A host is handed a box as its `BoxRecord`, not its `Box`, and the
  record's spread shows `whisper_sealed`, so Thing's promise about its spread does not reach it. Decide it with the form
  verbs, which settle what a host is handed (the Coach, 2026-11-23).
* **`Knock.queryClient()` becomes `Knock.vaultTsqClient()`,** in a later pass: it is the vault TSQ, as
  `device.vaultTsqClient` already says (the Coach, 2026-11-23).
* **Remove the core's older gate verbs** (`gate.unlock({…})` and its siblings) once their tests, about 75 call
  sites, are moved onto the form verbs (`gate.gatingUnlockAttempt` and its siblings). `popField` and the makers'
  `isInCleartextNames` bridge go with them (the Coach, 2026-11-23).
* **One refusal kind for nothing live where a call needs it.** A write or get with `ifAbsent: 'fail'` over nothing
  refuses `absent_vault` (big's act table), where a list of a parent that is not live refuses `absent_thing`.
* **`cited` as the Thing fields alone.** Its body fields are optional only because the `replace_passphrase` check reads
  `ask.cited.wayins?.main` (`checkWriteInvariants`, `policies.ts`): carry that testimony elsewhere in the ask.
* **A host's query defaults can override the vault TSQ's.** TanStack merges defaults in registration order, so a host's
  `setQueryDefaults(['sok'], …)` made after the device wins over the items' `queryFn`, `staleTime` and `retry: false`.
* **Pass-throughs to drop?** Gate's and Bank's to the world; `Bank.hostVault`, no caller; `Device.#endCause`, never set.
* **A bare-record form of `make`.** `ThingCar.make`, `world.makeThing` and each kind's `make` take a Thing, a shell or
  an item event, so that no read time is invented for a record. Let them take a bare record too, `Thing.make(record, {
  world })`: the "constructor does not assume this weird way of doing it". Open: a bare record has no `read_tc`, and the
  car's `VacantReadTc`, which sorts below every read, is the honest one for it (the Coach, 2026-11-25, who builds it).

* **A store for which measuring each record's size is costly records it at write time.** `stats()` sums each stored
  record's weight; where the datastore cannot measure that cheaply, it stores the size in a field of its own, written
  with the record. A Thing record's size can be worked out once the labelpath's and the body's sizes are known: every
  other field has a fixed or bounded width (the Coach, 2026-11-25, on thread 2).
