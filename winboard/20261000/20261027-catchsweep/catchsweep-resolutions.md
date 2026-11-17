# Sprint catchsweep: resolutions

Sprint catchsweep ran from 2026-10-27 to 2026-10-28. This file carries back, once, what the sprint
doc's *Resolved* tab recorded: the Coach's rulings on the matters raised during the sprint, newest
batch first, each with the matter as the row put it, the Coach's answer word for word, the date,
where it was raised and where the work went. It then lists the orchestrator's own calls, made on
rows without a ruling, from the doc's *Cleanup* tab (*Your calls*), each with where it lands.

## Rulings

- **TOP aead_narrow: a failing cipher step now refuses before the post-wait demand.** Thread 2 made
  the catch at the end of Lease.cipheredWith the one unexpected_error mapping for wrapKeyUnder and
  cipherBytes, so a WebCrypto failure while ciphering throws at once, where before the demand after
  the await ran first. Rec: accept. Coach (2026-10-28): "a WebCrypto failure seems like it deserves
  its own refusal type, unless that's leakage -- but since we set refusals on pretty much anything I
  don't think we'd fool anybody". Raised #325 (thread 2). Work: the ordering stands; thread 2's
  worker gives a WebCrypto throw its own refusal kind, within G8.
- **aead_narrow: a bad vault stamp is bad_record, not damaged_lease.** With the catch narrowed to
  the one WebCrypto call, a stamp failing its shape check refuses bad_record and the vault stays.
  Rec: accept. Coach (2026-10-28): "it;s imporssible to tell which it is, go with what's natural".
  Raised #325 (thread 2). Work: as built.
- **aead_narrow: nothing of the device store's error is kept.** deviceTrouble dropped the store's
  throw as cause; the worker kept nothing, not even the error's name. Rec: keep nothing. Coach
  (2026-10-28): "keep the error name. We will at some soon point add redact". Raised #325 (thread
  2). Work: thread 2's worker keeps the error's name (DOMException, QuotaExceededError) in the
  message or meta, nothing else of it.
- **aead_narrow: the device-store refusal's message tail.** The storage_blocked and
  storage_unavailable messages ended "The device store's own error is not kept, as it may quote the
  record it was handed." Rec: drop the sentence. Coach (2026-10-28): (empty: took the Rec). Raised
  #325 (review, thread 2). Work: thread 2's worker.
- **saying_story: does Story join VOCABULARY.md?** Rec: one line under the cast's Shapes table if a
  host-facing type counts as cast. Coach (2026-10-28): "yes vocabulary. it's "a controlled record of
  what is happening, suitable for logs or refusals"". Raised #331 (review). Work: thread 9's worker
  adds the entry with that definition.
- **store_trynames: the Vault's rewraps of heeded VaultDB verbs.** Explained: the Vault holds only
  the heeded throwing verbs, so it cannot call the try forms today; the clean fix is for `heed` to
  hand through heeded try forms, a small thread of its own. Coach (2026-10-28): "I'm having another
  worker look at heed with me. Do what comes naturally". Raised #321 (thread 6). Work: nothing in
  this sprint; the rewraps stay as built, and `heed` is another session's.
- **one_sanitizer: what is sanitizer.ts.** Explained: the one module that turns what a host function
  threw into a refusal without carrying its message. Coach (2026-10-28): "let's call it
  hostErrorSanitizer, there's all sorts of things need sanitizing". Raised #324 (thread 5). Work:
  thread 10 host_error_sanitizer, cut from the top of the line, renames the module and its exported
  names.
- **db_hooks: asStorageTrouble or storageTroubleOf.** A pure function returning a VaultError, which
  STYLE.md's verb table would call `storageTroubleOf`. Rec: `storageTroubleOf`. Coach (2026-10-28):
  (empty: took the Rec). Raised #330 (review). Work: thread 10 renames it on top of the line and
  amends #330's release note to the new name.
- **db_hooks: STYLE.md's Stored- prefix.** STYLE.md reserves `Stored-` for what an adapter hands up
  unchecked, yet checked validators wear it. Rec: one clause saying the prefix names what storage
  holds, checked or not. Coach (2026-10-28): (empty: took the Rec). Raised #330 (review). Work:
  thread 9's worker, with its other STYLE.md edits.
- **read_names: STYLE.md's "Read and open the box" lead verb.** l.596's rule and l.699's example
  lead with Read. Rec: both say Get. Coach (2026-10-28): (empty: took the Rec). Raised #328
  (review). Work: thread 9's worker, with its other STYLE.md edits.
- **saying_story: Story and ConsistencyRefusal as interfaces, not type aliases.** The alias form
  cannot compile (TS2456/TS2615); the interface resolves on demand, the rule's "recursive types"
  exception. Rec: accept as built. Coach (2026-10-28): (empty: took the Rec). Raised #331 (thread
  9). Work: none.
- **saying_story: export ConsistencyRefusal too.** Refusing.parseConsistent's signature names it.
  Rec: export it type-only beside Story and Refusing. Coach (2026-10-28): "Don't be chary with the
  exports. It's really frustrating for a lib contributor to be denied things at arms reach. It's a
  lil baby tiny library right now, we can be forgiven churn but not surliness". Raised #331 (thread
  9, review). Work: thread 9's worker exports it and every type an exported signature names; the
  sprint's ground rules and a memory carry the words.
- **saying_story: how STYLE.md glosses the shapes rule.** The bullet read "namespace it" as a
  Validator call's object or a star import, and "the common checks folder" as src/checks/ and
  src/shapes/. Coach (2026-10-28): "I intended story to replace 'saying'. Validators is usually
  imported as CX." Raised #331 (thread 9). Work: thread 9's worker makes "story" replace "saying"
  everywhere and writes the star-import gloss as the `CX` convention.
- **db_hooks: which refusals from the host's vaultDBFor cross to the GraphQL client.** Thread 3 kept
  today's pass-through of two kinds (not_permitted, identity_revoked) and made everything else
  unexpected_error with the cause kept server-side; the alternative was every error from vaultDBFor
  crossing as itself. Rec was: keep the two. Coach (2026-10-28): "I think I'd figure out pretty
  quick what was happening if my graphql server gave me a postgres arror. Much more slowly if you
  flush all my lovely diagnostics down the can. Pass errors through". Raised #330 (thread 3). Work:
  thread 3's branch reopened; a worker reworks vaultDBOf so every VaultError crosses as itself and a
  non-VaultError crosses as unexpected_error carrying the thrown error's message, then a second
  review and filing; the ruling is on #330.
- **Coach note: the memory directory.** Coach (2026-10-28): "I cleared the memory on purpose, thanks
  for checking." Nothing to rebuild; the one recreated memory (be-specific-about-names) stays.
- **read_names: Convex GetBoxAnswer.read.** The component answers a box get with { read: true,
  box_stored } or { read: false, refusalkind }. Rec: rename it got, mirroring landed in
  PutBoxAnswer, in lockstep. Coach: (empty: took the Rec) (proceed, 2026-10-28). Raised on #328,
  thread 8. Work: thread 8's worker on resume after its review.
- **read_names: the DeviceDB hook doDelUnreadable.** Rec: doDelUnparsed(scopepath, isSound), in the
  minor changeset. Coach: (empty: took the Rec) (proceed, 2026-10-28). Raised on #328, thread 8.
  Work: thread 8's worker on resume after its review.
- **optionsRefusal retired in thread 4's catch-up.** The filing worker converted the helper's three
  further callers to one parse with a saying and deleted it, since the STYLE.md paragraph the thread
  writes says a check of options never rethrows from a catch. Rec: accept as filed. Coach: (empty:
  took the Rec) (proceed, 2026-10-28). Raised on #317, thread 4. Work: none; as filed.
- **DeviceDB throwing forms map their refusals.** Thread 6 built deviceDB.getLease() so it rejected
  with the store's raw error while tryGetLease resolved storage_blocked or storage_unavailable; the
  orchestrator sent the worker back to put the mapping in the throwing body, one catch around each
  store call, by the standing ruling. Rec: confirm. Coach: (empty: took the Rec) (proceed,
  2026-10-28). Raised on #321, thread 6. Work: done in #321 (storeAnswer).
- **Patch changesets for packages whose tests alone changed.** safebyok-indexeddb, convex and react
  had only tests follow thread 6's renames yet each got a patch changeset. Rec: keep. Coach: (empty:
  took the Rec) (proceed, 2026-10-28). Raised on #321, thread 6. Work: none.
- **read_names: the stored field written_at.** Rename to put_at (a format bump) or keep. Rec: keep.
  Coach: ""read" and "write" are reserved exactly for "any operation that views: get, ensure, find,
  list, etc"; sim., write for "put, replace, patch, delete, etc"." (proceed, 2026-10-28). Raised on
  #328, thread 8. Work: none; written_at stays, and the rule is recorded in the plan's ground rules
  and memory.
- **read_names: the refusal kind 'stale_write'.** The row said only a deletion raises it; that was
  wrong: staleBox, staleVaultRecord and the deletion's builder all make 'stale_write', so renaming
  the deletion's to 'stale_del' would split one kind into two (more code). Rec as written:
  'stale_del'. Coach: "as long as it doesn't mean more code, but see prev note on read and write"
  (proceed, 2026-10-28). Resolution by the Coach's two conditions: the kind stays 'stale_write', the
  category word for a stale mutation of any sort; only the builder is renamed staleDel (done in
  #328). Raised on #328, thread 8.
- **Export the Saying type.** Validators' parse takes a saying but the type is reachable only
  through Validator's declaration. Rec: export type Saying and Refusing from src/index.ts, minor
  changeset. Coach: "yes export" (proceed, 2026-10-28). Raised on #317's review, thread 4. Work:
  thread 9 (saying_story).
- **Saying as a name.** Rec: leave; say Framing if preferred. Coach: "May we use 'Story'?" (proceed,
  2026-10-28). Raised on #317's review, thread 4. Work: thread 9 renames Saying to Story (and
  SayingShape to StoryShape).
- **Hand-written types beside their shapes.** Saying beside SayingShape and ConsistencyRefusal
  beside its shape are written by hand where STYLE.md prefers Z.infer. Rec: leave until ruled.
  Coach: "It's an easy rule, unless there's a good reason: - use Z.infer (eg recursive types) - put
  in the common checks folder (weird and module-local and good idea to put it near where used) - use
  Validator - namespace it, using Validator or a star-import" (proceed, 2026-10-28). Raised on
  #317's review, thread 4. Work: thread 9 applies it to Story and ConsistencyRefusal; the rule goes
  to STYLE.md *Shapes* in a documents PR of its own.
- **For coach: drop stash@{0}.** Its parse_consistent draft was carried to #309, now merged; by a
  line check its 38 absent lines are earlier spellings since renamed, not lost work. Rec: `git stash
  drop 'stash@{0}'` in the base checkout, your hand not mine. Coach: "done" (proceed, 2026-10-28).
  Raised in chat, 2026-10-27. Work: none; the Coach dropped it.
- **A Zod ParseContext handed to a validator's parse is now refused.** Validators' parse now takes a
  saying, parse(val, { where, advice }), so the seven same-kind rewraps are each one parse; a Zod
  ParseContext in that slot refuses 'bad_option' where it was quietly ignored before. Nothing in the
  repo passes one, and the type never promised Zod's context was honoured. Rec: keep it. Coach:
  (empty: took the Rec) (proceed, 2026-10-28). Raised on #317, thread 4. Work: none; the ruling is
  noted on #317.
- **Flip the vault.ts and bank.ts try pairs too?** (matter: the 18 Vault and 5 Bank pairs keep the
  body in `tryX` with a hand catch whose `#badOutcome` tells listeners bad news; Rec was to leave
  them this sprint.) Coach, 2026-10-28, proceed: "I'm happier with the throwing body doing a try
  catch to fix its refusals -- that's most of its job, it belongs there; then having the try version
  wrap as usual". Raised #316, thread 1. Work: thread 7 `vault_bank_flip`, stacked on thread 6.
- **Raw non-VaultError from Lease and Box throwing forms** (matter: after thread 1 the throwing
  forms let a bug's TypeError through raw; Rec was accept.) Ruled by the answer above, 2026-10-28:
  the throwing body catches and maps its refusals, the try form wraps. Raised #316, thread 1. Work:
  thread 2 `aead_narrow`, in the same methods.
- **Keep the passkey SecurityError branch** (matter: the audit called `askAuthenticator`'s
  `SecurityError` to `bad_option` a guess; I read it as the spec'd WebAuthn error.) Coach,
  2026-10-28, proceed (empty: took the Rec). Raised by the audit. Work: none; out of the sprint.

## Orchestrator's calls

- **G8's wording says a cause is kept "only where the thrower heard no secret ... a bug met inside a
  Lease or Box method", which a reviewer can falsify by reading cipheredWith's catch (the bodies
  hold the whisper and the vaultKey) (#325 review).** Call: restate the clause as the checkable
  invariant: what is kept quotes no secret, being WebCrypto's error, a validator's refusal over
  visible fields or the vault's demand, never a host function's or the device store's throw. Lands
  in: thread 2's worker, when resumed with your rulings on #325.
- **The new Lease and Box class docs say a bug "in any method here" arrives as unexpected_error,
  never raw, but Box.seal and cipheredWith run their argument parses before the try (so the finally
  can zero the bytes), and Lease.make/endsBy are not wrapped (#325 review).** Call: narrow the two
  doc claims to "past its argument checks"; the parses stay where they are. Thread 7 copies no such
  split: the Vault and Bank bodies go whole inside the try, as today's tryX bodies are. Lands in:
  thread 2's worker on resume; thread 7's handoff.
- **zxcvbn's PlainSaying / SayingForWarning / saying names (a weak passphrase's reason sentence)
  kept their word when story replaced saying (thread 9).** Call: left: they name a reason sentence
  shown to the user, not a Story; the Coach's "story replaces saying" was about the validator's
  record. Say so if the word should go from the codebase entirely. Lands in: nowhere, unless asked.
- **crypto_failed on the decipher side: a WebCrypto throw from unwrapKeyUnder / decipherBytes cannot
  be told from a wrong key or an altered record (thread 2).** Call: cipher side only, as the worker
  read it: deciphering keeps damaged_box / damaged_lease / wrong proof. Say so if a platform fault
  while deciphering should also say crypto_failed. Lands in: #325 as built.
- **leaseBound after crypto_failed: sealProps and Box.seal pass leaseBound: ciphered.ok, so a lock
  landing during the failing cipher is not told over the crypto_failed refusal (thread 2, round
  2).** Call: leave as ruled: the Coach accepted the cipher refusal before the post-wait demand. The
  comment beside it, which explains damaged_lease alone, is widened when the code is next touched.
  Lands in: #325 as built; Finally.
