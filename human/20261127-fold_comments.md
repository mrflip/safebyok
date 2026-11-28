# 2026-11-27: fold_comments -- solecisms addressed in src comments; STYLE.md and VOCABULARY.md corrected; gallant notes reported, unchanged

A documentarian run for the Coach, in `/workspace/byok-fold_comments` (branch `20261127-fold_comments`,
from `6f2859b6b`). Three group spawns did the work: one for STYLE.md and VOCABULARY.md, one for
`models/` and the entry files, one for `minding/`, `shapes/`, `storage/`, `phrases.ts` and
`refusals/`. Comment lines, two phrase strings and the two documents changed; no identifier,
statement or test. The three gallant notes were read and are reported here, not changed.

## Changes, by file

### STYLE.md (70923f0c7)

* *Naming*, booleans (`A boolean says the positive, is named for`): the four boolean rules are now
  ranked, the positive first and true-when-unsafe last, after gallant `#say-the-positive`
  (`#isEnabled = true`). Before, true-when-unsafe came first and nothing ranked them.
* *Naming*, `-able` (`demandRootsLive`): `demandBoxesUsable` is no longer a good example, since
  gallant `#chain-guards` makes it a Goofus; it is replaced by `demandPasskeyAddable`,
  `demandRootsLive` and `demandEnabled`, which are real names in the code.
* *Naming*, `scope` (`**\`scope\` is not smushed**`): the exceptions are now `ThingScope`,
  `BankScope` and `LeaseScope`, and big's `Boxscope` is named as big's.
* *Validation*: the tag `#declare-what-they-hold` is renamed `#declare-what-callers-have`. No other
  file cites the old tag.
* "front door" and "door" (5 places) are now "entry point" or "module", after the gallant-docblocks
  slop trope.
* *Tags*: id and tok are `id` and `tok`, with examples `userid`, `credential_id`, `revtok`,
  `banktok`, `devicetok`. The tag charset now follows `Patterns.label`: lowercase letters, digits
  and single underscores, where before it read `\w`. `ante` now means before and after a step in
  general, as gating's `Ante` does; the storage sense is kept. `ckey` "never a storage address,
  which is a labelpath", as VOCABULARY.md has it.
* *Scopepaths*: reframed. In the new core a scopepath is an IndexedDB key, an array
  (`scopepathOf`, `LeaseScopepath`); the `^`-joined string is labelled as big's.
* Old names brought to the new core's: `user_id`, `vaultlabel`, `boxlabel`, `registered_at`,
  `scopepathkind`, `leaseHours`, `gate_epoch`, `{ world, boxes }`, `CX.*`, `HostChecks`,
  `_cheat_central`, `vault.putWayin`, and others. Examples that only big has are labelled as big's.
  "World is a Pick" now reads "A view of a class is a `Pick` of it".
* hold and keep were replaced where a precise verb fits: "only one module uses", "cached",
  "passes inward".

### VOCABULARY.md (5d56a7ee5)

* *bank*, *gate*, *lease*: the bank is "the one object its lease is attached to", the gate
  attaches the lease to its bank (`attachLease`), and the bank has the lease in a private field.
  Before, the gate held the lease, or the bank was "the one holder".
* *track*: its keys are `gate` and `root`. *ask*: seven ops, now including `getbank` and `stats`.
  The devicetok paragraph says one per user. *ring*: `IdbDeviceDB`.
* *key, alone*: a carve-out says TanStack's query key keeps its name.
* *ante*: the general before-and-after sense comes first; the storage sense is kept, as "A storage
  ante".
* A new row, **scopepath**, for the new core's IndexedDB key.
* hold and keep were replaced with caches, stows, "recorded in", has, "stored under" and is.

### packages/safebyok/src/models/ and the entry files (bd4cd18f2)

* bank.ts: `connect` and `disconnect` have short headlines. The refused-record onBadNews comment
  now reads `the vault TSQ's tells the device: this one tells nothing`. The seeding comment now
  reads `so that seeding does not put each root it peeked straight back`. In `bulletproofCallback`
  the appositive "one the core keeps for someone else" is dropped.
* bank.ts and vault.ts: "Needs no unlock" now reads "Works on a locked bank."
* device.ts: `hello` says it throws `insecure_context` synchronously, where it read "Refuses". The
  `disabled` comment reads "the device has ended". `vaultDB` says the user's one bank.
* gate.ts: the class doc's gating sentence is split. Four "as {@link unlock} does" comparisons are
  now plain "See" pointers. "write" is now put or cite.
* gating.ts: the cleartext-names comment matches `isInCleartextNames`.
* lease.ts: the `#bankKey` catch says the bank's attached lease is dropped, where it read that the
  gate drops it.
* vault.ts: `#demandReadableBox` is a guard headline, and its refusal catalog is dropped.
  `forceTimelyUnlocked` says when each refusal kind is thrown. The banner is now `[Putting and
  deleting boxes]`.
* thing.ts: `publish` reads "Call each subscriber." "a key" is now "a CryptoKey".

### minding/, shapes/, storage/, phrases.ts, refusals/ (9ed80af84, 9cb20bd5a, e3ad5be16)

* About 20 lines in storage/ and shapes/ say "a list's manifest" where they read "a listing's".
  VOCABULARY keeps "listing" for the vault TSQ's cached kids value, and vault-tsq.ts and the masked
  view keep it.
* shapes-bankish.ts: the bank stages are now described as `'signed_out'` "nobody has signed in on
  this device", and `'locked'`/`'unlocked'` "sealed or unsealed". `vaultDB` names the user's one
  bank.
* shapes-manifest.ts: `RevseqCmp 'stale'` gives only the comparison.
* shapes-gateish.ts: the five form-field dnas read "The form fields that unlock a gate", and so on.
* shapes-thingkinds.ts: GateChecks and BoxChecks are written as sentences.
* primitives.ts: `Labelpath.RootBox` no longer claims to be the track's key. `Devicetok` is per
  user.
* shapes-stamps.ts: `GateStamp` no longer says "yet".
* vault-minder.ts: the deletes read "Delete the Thing once" and the puts read "Put". A record with
  no listener "still reaches its Thing". The garbled make*Ask sentence is rewritten from the code.
  Some hold and keep in the doc blocks of `heldRoots`, `#heldAt` and `#bankFields` are reworded.
* phrases.ts: two phrases change. `VaultDBExpected` drops "its builders", since VaultDB has none.
  `DeviceDBExpected` adds `ensureDevicetok`, which `DeviceDBMembernames` checks. No test matches
  either phrase. The group spawn ran four test files with 234 passing (it built safebyok-big's dist
  first). Phrase doc blocks: "What a proving is made with" openings are gone, and the banner adds
  `GatingSpent`.
* vault-db.ts names the `*AskOf` builders. The vault-tsq.ts writer comment adds `#hearLife`.

## Dropped facts

* vault.ts `#demandReadableBox`: its two refusal kinds. `forceTimelyUnlocked` and
  `withUnlockedWhisper` still name them.
* bank.ts `bulletproofCallback`: that the callback is one the core calls on someone else's behalf.
* thing.ts `publish`: that `receive` calls it once a record is adopted. `receive`'s doc says so.
* shapes-manifest.ts `RevseqCmp 'stale'`: "a write has intervened", a guessed cause.
* thing-car.ts `#readTcAfter`: the case-by-case `//` tail, which the doc block below restates.
* STYLE.md: `vault-opts.ts`, which exists nowhere.

## Gallant notes: violations reported, nothing changed

| Kind | Examples (search text) | Count |
|---|---|---|
| hold and keep in a note's prose or a Gallant's prose (no identifier) | "Demand that the bank still holds `entry`"; "A soft cap on the boxes a vault holds"; "## Pass what you hold, whole" | about 15 |
| gallant-docblocks.md Gallants in big's vocabulary, with no note saying so | `act 'declined'`, `vault_empty`, `vault_tok`, `boxlabel`, `bankDB` | about 46 lines |
| Names the code no longer has, under a Fixed or merged status | "listen(listener: (answer: TSQAnswer)"; "#sealText(sealer, nextRevision, cleartext)"; "`Bank.sealBox(prior, cleartexts)` is the Gallant as built" | 7 |
| The same, under statuses now stale ("not yet merged") | "Bank.make({ ...record, maingate }, { device })"; "Lease.make(…, { bank })" | 4 |
| A Gallant that breaks its own section's rule | "Pass the null to thing.receive, share the bad news and settle"; "promised waiters are refused, notifications sent" | 2 |
| A banned word in a Gallant | "Payload of a `putBox()` operation" | 1 |
| "store" as a verb, which VOCABULARY *Verbs* says to avoid | "Seal and store a new box"; "store the ask's record if the classifier" | 11 |

The `held` locals in gallant.md are all under Goofus headings, and are not violations.

## Open questions

* Booleans: should "says the positive" outrank "true in the unsafe state"? STYLE.md now ranks them
  that way, on the strength of `#say-the-positive`.
* The storage address: VOCABULARY.md and STYLE.md both now say a labelpath. VOCABULARY's own
  *labelpath* says a labelpath names a Thing only within its scope, and the code addresses records
  by a ckey of the scope, or by a scopepath. Should the address be "a scope"?
* "store" as a verb: VOCABULARY avoids it, but the gallant notes use it for a write to storage.
  Should it be allowed for that?
* No word for what a list answers, beyond `Kids`.
* Should gallant-docblocks.md get a note that its Gallants are in big's names, as gallant.md has?
* `#declare-what-callers-have`: is this the tag you want, or should the old one stand until the
  hold/keep rule lands?
* "unlock" as a noun: VOCABULARY bans it, but its own lease row says "An unlock, a renewal or a
  softlock in one tab", and bank.ts says the same.
* STYLE.md and VOCABULARY *ensure* name `bank.demandUnlocked()`, which the new core does not have
  (it has `isUnlocked` and `ensureUnlocked`). Left as it is.
* STYLE.md says never to put a third interface beside a class, yet shapes-gateish.ts has
  `interface LeaseGate`.
* The validator-named-for-its-parameter rule: shapes-asks.ts checks `userid` with `user_id`.
* bank.ts, `its boxes refuse as of another root box`: the meaning is unclear. Left as it is.
* vault-tsq.ts, `from the giver`: no one in this core is the giver. Left as it is.
* shapes-vault-stats.ts, "The Coach: a store must allow…": "store" as a noun, but it may be a
  quotation. Left as it is.

## Proposed renames (not made)

* `Vault#sealedWriteOf` → `#sealedAskOf`
* `ThingCar#take` → `#adoptIfNewer`
* `ProposedPins` → `ProposedFields`
* `QueryKeyRoot = 'sok'`: proposed for a rename, with no target named.
