# 2026-11-12: Documentarian run over bank_world's core files -- groups 1 (models/) and 2 (storage/, refusals/, browser.ts) done; Chute, guarantees and stale-prose questions

One PR for the core's share of the documentarian run the Coach asked for over the files sprint bank_world's line changed.
Group 1 is `packages/safebyok/src/models/`; groups 2 (storage, refusals, browser.ts) and 3 (helpers, shapes) extend this
entry. Group 1 split its fifteen files four ways, one opus documentarian each, all on this worktree; the lead
committed and harmonized the `modelkind` line across files.

Only comment lines changed (checked: `git diff -U0` has no added or removed line that is not a comment). Lint and
typecheck clean; the tests run with group 3. No safety hatch added.

## Doc-block lines and characters, before and after

| File | Lines before | Lines after | Chars before | Chars after |
|---|---|---|---|---|
| `bank-listing.ts` | 16 | 18 | 1387 | 1306 |
| `bank.ts` | 65 | 79 | 5294 | 5623 |
| `box-listing.ts` | 20 | 27 | 1522 | 1647 |
| `box.ts` | 68 | 87 | 5536 | 5556 |
| `device.ts` | 55 | 72 | 5269 | 5729 |
| `gate-listing.ts` | 24 | 28 | 1773 | 1786 |
| `gate.ts` | 30 | 40 | 2312 | 2426 |
| `gating.ts` | 25 | 44 | 2418 | 2947 |
| `lease.ts` | 28 | 38 | 2324 | 2772 |
| `listing.ts` | 104 | 115 | 8911 | 8388 |
| `proving.ts` | 23 | 45 | 2287 | 2940 |
| `storable.ts` | 69 | 80 | 5851 | 5281 |
| `vault-listing.ts` | 18 | 20 | 1452 | 1244 |
| `vault.ts` | 40 | 51 | 3045 | 2951 |
| `wayin.ts` | 9 | 15 | 713 | 975 |
| **total** | **594** | **759** | **50094** | **51571** |

Lines grew more than characters: run-on one-line blocks were split into a headline and a body, and `get`, `put`,
`create`, `getBox`, `exposure` and `shapeOf` got option lists. Some members with no block got one (four optional
`Wayin` fields, `Proving.#wayinKey`, `#unwrapBankKey`, `mintPassphraseHeader`, `passphraseKeyOf`, `Device.leaseMillis`,
the abstract `demandPresent`). If the counts should come down, the added lines are the first to cut: the `damaged_lease`
line on `Lease`, the zeroing sentence in `Lease.sealWith`, the "default handler hears" lines in `tellBadNews` and
`announce`, the `Device` class's second line, and the G-number citations in proving.ts.

## Changes, member by member

Every `modelkind` reads `Always '<kind>': marks this model for a {@link Modelkind} check.` Every `demandEnabled`
reads `Throw unless {@link isEnabled}.` "Tattooed on" and "inscribed once" scope and life notes became plain lines or
`//` comments. A `{@link}` to an inherited member became backticks (the linter cannot resolve it).

### listing.ts and the four listings

* **File header** (listing.ts): now names all four subclasses; it named only the box and vault listings.
* **`Listing`**: the instances of one kind under the thing above, one per scope, and every bankDB call for that kind.
  The "hub because it makes, lists and delists" reason is a `//` comment above.
* **`lock`**: "Realign each listed thing with the bank's lock: see Storable.alignLock. Locks nothing, and never throws."
* **`list`, `get`, `put`, `del`**: plain first lines; `get` and `put` list their options, defaults marked. `del` returns
  the instance "now tombstoned" (the SLOPDOC tag is gone).
* **`try*`**: "Non-throwing form of {@link x}: the bankDB's answer...", as BankDB's interface words it.
* **`deliverAnswer`, `deliverRecord`, `deliverListing`, `deliverNotice`**: imperative first lines; "writes nothing to
  storage" kept; the rules pointed at `notes/deliver-contract.md`.
* **`#answerDeliveringOf`, `#recordDeliveringOf`**: "The plan for ... Changes nothing." Their refusal catalogs dropped.
* **`demandOfWorld`, `scopeOf`, `sparseOf`, the other abstracts**: plain sentences; the `storage_issue` catalog dropped.
* **`BankListing.build`, `delBank`, `stampsOfBirth`, `recordOfBirth`**: what each puts or makes, and returns.
* **`BoxListing.create`**: the Gallant block from `notes/gallant.md` (first line, `sealedRecordOf` pointer, `ifPresent`
  list). `puttable`, `deletable`, `#shellFor`, `#queryOf`: plain phrases.
* **`GateListing.replacePassphrase`, `addPasskey`, `revokePasskey`**: what each stores and returns; "Locks nothing: the
  bankKey is unchanged" on the first.
* **`VaultListing.deliverEnsured`, `#listingOfEnsured`, `tryDel`, `boxListingOf`**: plain; `tryDel` says the boxes go
  with the vault.
* `Chute:` lines kept unchanged everywhere (open question 1).

### bank.ts, device.ts, lease.ts

* **`Bank`**: the user's bank on this device; get it from `device.ensureBank()`; one Bank object per life of the bank.
* **`lock`**: "Lock the bank, and forget the lease cached on this device." Snapshots show it before return; a failed
  forget is announced as `lease_revoke_failed`; a disabled bank's lock leaves the cached lease.
* **`autolock`**: keeps "best-effort reminder, not a guarantee"; says when to call it.
* **`ensureUnlocked`, `unlock`**: the branch tour became one line each; `unlock` asks the user even with a lease.
* **`ensureVault`, `vaultAt`**: the Gallant lines; `ensureVault` says to precede with `await bank.ensureUnlocked()`
  unless the vault is listed (open question 4).
* **`tryProbe`**: what it overwrites, that a locked bank asks the user, and that the report carries no secret.
* **`adopt`**: in three lines: what disables the bank, what is dropped, how a failed forget is told.
* **`sealWith`, `unsealWith`** (Bank and Lease): needs the bank unlocked; same stamps, same order; unsealing
  authenticates the sealed text and the stamps together; whisper bytes zeroed either way (G6).
* **`Device`**: VOCABULARY's wording; make it with `Device.make(opts)`, then `ensureBank`; `sweep()` or `vacate()` ends
  it. `ensureBank`, `vacate`, `sweep`, `tellBadNews`, `announce`, `attachGating` (names `already_asking`),
  `DefaultOnLifecycle` (a list, one event a line), `guardRequestCleartext`, `guardOnLifecycle`: plain, with what a
  caller would get wrong. `#revokeOwnLeases` and `#remakeSnapshot` reasons moved to `//` comments.
* **`Lease`**: a grant that lets this device seal and unseal whispers without asking, for one gate revision.
  `buildFromCache` says what each kind of cached row comes to. `revoke` no longer says the device is locked.
  `isPastAutolock`'s "as bank.autolock judges it" is a `//` comment.

### box.ts, vault.ts, storable.ts

* **`Box`, `Vault`**: "A box (vault) in this tab, with its record's fields as its own props." Old "vault locked" prose
  now says "bank" (the code reads `this.bank.isLocked`).
* **`Box.whisper`, `exposure`**: a placeholder while hidden, never to be inspected; `exposure` lists its four values.
* **`extractWhisper`**: the Gallant guarantee line. **`expose`**: the security-notes pointer is a `//` comment.
* **`put`**: first line, the two kept facts (a half left out keeps the stored one; a lock does not interrupt a begun
  write), the `ifPresent` and `ifAbsent` lists, and what to do on `stale_write`.
* **`sealedRecordOf`**: what is ciphered, what it is bound to, which fields are taken.
* **`alignLock`** (Box, Vault, Storable): "Realign with the bank's lock", dropping secrets once not `isEnabled`; Storable
  says it locks nothing and that a host calls `bank.lock()`.
* **`Vault.getBox`, `fetchBox`, `putBox`, `delBox`, `beginWatch`**: plain; `getBox` lists `ifAbsent`; `beginWatch` may
  be called again to list afresh.
* **Storable**: the three SLOPDOC blocks (`assignInitialProps`, `assign`, `align`) rewritten; `cmpRevisions` says it
  throws; `get`, `hydrate`, `del`, `shapeOf` plain with lists; `#scope` duck note is a `//` comment.

### gate.ts, gating.ts, proving.ts, wayin.ts

Checked against *The guarantees* (G1, G2, G3, G8, G9, G10): none contradicted.

* **`Gate`**: the wayins; change it with the `...Prompt` methods, each asking for the current passphrase.
  `addPasskeyPrompt` says a gate has one passkey at most. `revokePasskeyPrompt` says the bankKey does not change, so an
  unlocked device stays unlocked.
* **`Gating`**: a request to the user for a passphrase or passkey; one open per device; `attempt` as often as the user
  corrects; keeps no cleartext. `attempt` (was SLOPDOC): resolves an outcome, never throws; which refusals leave it
  open; when PRF bytes are zeroed (G2). `whenConcluded`: close the dialog when it resolves. `launchBirth`: names
  `gate_made_elsewhere`. `checkedCleartexts`: a foreign throw is replaced (G8).
* **`Proving`**: four lines: what it is, the two builders, only a proving has a wayinKey (G9), it keeps no cleartext.
  `buildWayin`, `buildLease`, `checkUnwraps`, the subclass builders: plain, each naming the one refusal a caller meets.
  The two usage constants' "dropped" invariants are `//` comments.
* **`wayinCtxOf`**: the bestiary's Gallant text, its broken last sentence fixed.

## Dropped facts that STYLE.md does not plainly cut

**listing.ts and the listings**
* `deliverAnswer`, `deliverNotice`: "the row above first, then its record" (order; deliver-contract.md step 1 has it).
* `#answerDeliveringOf`: throws `storage_issue` for a record of another scope or revision than `sent`, and
  `record_conflict` where storage is sure nothing is stored and a live instance is listed.
* `#recordDeliveringOf`: throws `storage_issue` for a record under another life of the thing above, and
  `record_conflict` where storage and the instance disagree on one revision's history.
* `demandOfWorld`: kind `storage_issue`, and the examples "a box of another vault life, a vault or a gate of another bank".
* abstract `isEnabled`: "for a box listing, its vault is still of the life it was made under" (BoxListing says it).
* `putAnswerOf`: throws `storage_issue` for a good answer with no row.
* `panicIfRevoked`: "before the caller hears the refusal" (the `//` above keeps it).
* `BankListing.delBank`: "or null where nothing was stored" (open question 5).
* `VaultListing.isOwnRow`: "the bank's watch also tells of its bank, gate and box rows".
* `VaultListing.#listingOfEnsured`: vault rows delivered after the bank and gate rows.
* `scopeOf` (four listings): "no listing answers for another's".

**bank.ts, device.ts, lease.ts**
* `Lease.revoke`: "so this device is locked" (contradicts `bank.lock()` as the one lock).
* `Lease.forget`: "one may stand from an earlier session" (why a row exists with no Lease object).
* `Bank` class: "kept in step with its row".
* `Bank.maingate`: "which each unlock proves against".
* `Bank.delPrompt`: "which asks for the passphrase" (not checked that `del_bank` takes only a passphrase).
* `Bank.adopt`: "the record stands" (a failed forget does not undo the adopt).
* `Bank` constructor: "with the host's dialog, and a listing for its gate and one for its vaults".
* `Device.#askUser`: "which each bank listing is handed".
* `Device.ensureBank`: "this device's row ensured in the deviceDB".
* `Device.#fetchBank`: "made from the rows ensureBank answers".
* `guardRequestCleartext`: "the one way a gating asks the user" (an invariant notes/guarantees.md also states).
* `guardOnLifecycle`: "the one way the core tells the host what happened in the device's life".
* `tellBadNewsTo`: "that reached `device`".

**box.ts, vault.ts, storable.ts**
* `Box.whisper`, `unveil`: the `notes/expose_improves_security.md` pointer (kept once, as a `//` above `expose`).
* `Box.extractWhisper`: "keeping nothing on the instance".
* `exposure`, `isShowing`, `isVeiled`, `isLocked`: "read live".
* `Box.box_tok`: "minted at its birth, kept by every later revision of that life" (VOCABULARY has it).
* `Box.sidecar`: "It has nothing secret".
* `putExposed`: "`patch` may name a sidecar, never a whisper" (its type says it).
* `isOfBothHalves`: "so that a put of it needs nothing from the record stored" (a `//` keeps it).
* `ensurePuttable`: "and its vault [timely]".
* `boxStampOf`: "which the lease binds both sealed parts to" (`sealedRecordOf` says it).
* `sealedRecordOf`: the codec name `json_v1`.
* `#unseal`: "opened through the vault's seal verbs and checked by `CX.whisper`".
* `Vault` class: "standing for its scope through its lives" (open question 8).
* `Vault.#boxListing`: "and again null once a record of another life is received".
* `Vault.#letBoxesGo`: "the next asking makes another".
* `Vault.putBox`: the pointer to `Box.put` for refusals (options still pointed at).
* `Storable` revision props: assigned before the seal and at each adopt; `registered_at` only at birth and for another life.
* `Storable.#scope`: "the listing keys and watches by it, and the verbs name it".
* `Storable.#central`: "void on a new instance" (unverifiable: the constructor takes any `central`).
* `Storable.#refreshedAt`: "with a record not older than central".
* `Storable.adopt`: "judged against the central adopted until now".
* `isHydratedWithin`: "what `hydrate` takes as it is". `isWholeRecord`: "as stored in BankDB".
* `cmpRevisions`: "two puts written as one revision".
* `assignInitialProps`: "never as #fields" (wrong as stated: Box keeps #fields; the line now says "before this instance
  is sealed"). `becomeNotifiable`: "until then there is none to replace".

**gate.ts, gating.ts, proving.ts, wayin.ts**
* `Gate` class: "the gate receives the row it puts".
* The three `...Prompt` methods: the gatingkind each launches.
* `demandPasskeyAddable`: "the one check before anyone is asked for one".
* `Gating` class: "concludes once: its launcher answers with that outcome".
* `whenConcluded`: "as the package cannot close a host's dialog".
* `Gating.judgeStrength`: "Nothing changes."
* `attempt`: "The one door for a cleartext" (not quite true: `judgeStrength` takes one too).
* `buildBank`: "each proved in `world`".
* `Proving` class: "a strong key from birth"; "the one thing that can unwrap the bankKey" (false: Lease unwraps it too).
* `bankStamp`, `gateStamp`: "as parsed", and their order in the ctx (first, second).
* `buildLease`: that `gate` must be a revision of the gate proved (`checkedConsistent` checks it).
* `buildStored` (both): "proved against the gate in hand".
* `guardKeyDeriver`: "the one way a proving asks it for key bytes".

## Proposed renames

* `Storable.demandFullProps()` to `checkedFullRecord()`: "The record in hand, throwing unless it is full." It returns a
  record, and a `demand` promises only a throw.
* `Storable.assign()` to `assignRevisionProps()` (optional): "Set the props that change with each revision from `record`."
* `BankListing.build` to `create`: "Put a new bank and its main gate over the bank row `expected`, and return the listed
  bank." A `build` puts nothing. The bankDB's `buildBank` has the same clash.
* `BankListing.stampsOfBirth` to `makeBirthStamps`, `VaultListing.recordOfBirth` to `makeBirthRecord`: each mints
  tokens or reads the clock, and a `fooOf` is pure.
* `VaultListing.#listingOfEnsured` to something like `#deliverAboveVaults`: it delivers two rows, and a `fooOf` acts not.
* `Bank`'s `listOwnLeases` to `tryListOwnLeases`: it resolves an `Outcome`.
* `Device.dismissGatingAtDiscard(bank)` to `dismissGatingFor(bank)`: "AtDiscard" names the caller's moment.
* `Device.#revokeOwnLeases` to `#forgetOwnLeases`: it only forgets rows; a Lease's revoke also drops keys.
* `lifeTokPathOf` to `lifeTokOf` (Storable and every subclass): it returns the token, not a path.
* `Lease.cacheAsCacheCan` to `cache` (hedged): "Cache this lease on this device, unless it came from there."
* `Gate.revokePasskeyPrompt` / `revoke_passkey` to `remove...` (question, not a proposal): G10 says removal is not
  revocation. A public rename.

## Open questions

1. **`Chute:` lines.** Commit 2268be74f added them on purpose ("each method of the delivery chute names its place in it
   in its doc block"); they name helpers, which `#purpose-not-machinery` cuts. Kept unchanged in listing.ts,
   gate-listing.ts, storable.ts and vault.ts. Keep, or move to `//` comments above the blocks? Groups 2 and 3 meet them too.
2. **notes/guarantees.md is stale since bank_world.** Its keeper row and G9 say vault.ts keeps the Lease in
   `Vault.#lease`, the friend is made in `Vault.#leaseFriend`, and name `Vault.#unlockVaultByProving`; gate.ts's row
   names a `buildVault` act. The lease is on Bank (`Bank.#lease`, `#leaseFriendOf`), vault.ts seals through
   `this.bank.sealWith(...)`, and the act is `buildBank` in gating.ts. CLAUDE.md says a sonnet subagent edits that note;
   not done here (doc blocks only).
3. **VOCABULARY.md drift.** *lease* says it "is granted to the Vault object" and that on `damaged_lease` "its vault then
   locks"; it is the bank now.
4. **`Bank.ensureVault` needs an unlock for any unlisted vault.** Old prose implied fetching a stored, unlisted vault needs
   none. Code: `if (listed?.isPresent === true) { return listed }` then `this.demandUnlocked()`. The block says what the
   code does. Intended?
5. **`del` / `delBank` / `delBox` never resolve null**, yet return `| null`. A del over a void row refuses (`void`),
   over a tombstone `dubdel`; a good del is always `deleted`, with a tombstone. Search: `SX.isRowAt(box, SX.VoidRevision) ? null : box`.
   Blocks say "now tombstoned". Narrow the types in a later thread?
6. **`Lease.revoke` after `evict()` forgets nothing** (`if (this.#record === null) { return }`), leaving the cached row.
   No path hits it today (`this.#bankFriend.lock()` runs before `this.evict()` in `#bankKey`). The block says "Does
   nothing once evicted."
7. **`Bank.unlock` always launches an `unlock_bank` gating**, even with a lease attached. Now said in the block. Intended?
8. **One Vault object across lives?** VOCABULARY *vault*: "The bank enlists a new Vault object for the next life". Code:
   `adopt` keeps the instance (`if (isOtherLife) { this.#letBoxesGo() }`). Left unsaid until one source is chosen.
9. **`Gating.#device`.** Old prose: "the proving world of its acts". `launchOn`'s acts use the bank as their world; the
   device is the world only for `judgeStrength` and `launchBirth`. Fixed in the block.
10. **`GuardedKeyDeriver`.** Old prose: "as a bank keeps it". The device keeps it (`this.keyDeriver = guardKeyDeriver(keyDeriver)`). Fixed.
11. **`Gate.ensureTimely`** implied the bank is refreshed within `maxMillis`; code uses the bank's own default
    (`this.listing.ensureTimelyWorld(maxWorldMillis)`). The block says only "made timely too".
12. **`Gate.bank_tok`** is fixed per instance while `gate_tok` follows the row across lives. Is a Gate ever handed a row
    of another bank life? Then `gate.bank_tok` goes stale.
13. **`veil()` / `unveil()` asymmetric.** `veil()` sets `#isVeiled` with nothing exposed (snapshot `isVeiled: true`,
    `exposure: 'unexposed'`); `unveil()` throws `notExposed()` in the same state. Intended?
14. **`patchWhisper` works while the bank is locked** (only `demandEnabled()`). Documented as "even while it is hidden". Intended?
15. **`Box.tryPut` resolves an `Answer`, not an `Outcome`**, against STYLE's `tryFoo` row. The name or the row?
16. **"Once delisted" vs `isEnabled`.** The ruling says alignLock drops secrets once delisted; code checks `isEnabled`
    (`listing.isEnabled && listing.isListed(this)`), so a disabled listing triggers it too. Blocks say "not `isEnabled`".
17. **`Box.#exposed` clearing.** Old prose: "until unexpose or a vault modification clears the box". Code drops it only on
    a tombstone and at `alignLock` when not enabled. Fixed.
18. **`cmpRevisions` throws** `record_conflict` on one `revision_seq` with two toks; old prose never said so. Now said.
19. **`#replaceSnapshot`** returns early when nothing changed; old prose said it always notifies. Fixed.
20. **`damaged_rows` change wakes `useSyncExternalStore` subscribers** while `getSnapshot` returns the same array
    (`deliverListing` calls `tellListeners()`). A behaviour note, not a doc one.
21. **List markers.** STYLE.md says bulleted lists use `*` at the top level; doc-block lists in src/ and the bestiary use
    ` * - `. Followed src/.
22. **G-number citations in doc blocks** (proving.ts: `#wayinKey`, `checkUnwraps`, `passphraseKeyOf`; lease.ts). Keep, or `//`?
23. **`dismissed` unmentioned** on the Prompt methods and `attempt`: judged below `stale_write` / `wrong_passphrase`.
24. **A doc block on `BoxListing.user_id` covering five fields** ("these five fields"): TypeScript attaches it to the
    first only. A `//` comment instead?
25. **Lint gap.** `jsdoc/no-undefined-types` cannot resolve a `{@link}` to an inherited member; backticks used, per
    notes/more_style.md.

# Group 2: storage/, refusals/, browser.ts

Ten files: `storage/` (`adapter-bank-db.ts`, `bank-classifier.ts`, `bank-db.ts`, `device-db.ts`, `idb-device-db.ts`,
`idb-shelf.ts`, `memory-bank-db.ts`), `refusals/` (`errors.ts`, `throwers.ts`) and `browser.ts`. One documentarian, two
code commits (storage; refusals and browser.ts). Only comment lines changed, with one allowed reformat: `RefusalRows`
spread over four lines so each field has its own doc block (checked: `git diff -U0` has no other added or removed line
that is not a comment or blank). Lint and typecheck clean; group 3 runs justify. No safety hatch added. No `Chute:` line
in these files. Checked against *The guarantees* G4 and G8 (`device-db.ts`, `idb-device-db.ts`, `throwers.ts`,
`errors.ts`): none contradicted; the G8 point that a device database's throw keeps only its `name` is now said on
`DeviceDB`, `deviceDBFailed` and `storageUnavailable`'s `cause`.

## Doc-block lines and characters, before and after

Counted as every line from a `/**` to its `*/`, characters trimmed.

| File | Lines before | Lines after | Chars before | Chars after |
|---|---|---|---|---|
| `storage/adapter-bank-db.ts` | 88 | 74 | 7121 | 5927 |
| `storage/bank-classifier.ts` | 117 | 121 | 9441 | 9220 |
| `storage/bank-db.ts` | 75 | 83 | 5836 | 6030 |
| `storage/device-db.ts` | 34 | 40 | 2384 | 2820 |
| `storage/idb-device-db.ts` | 11 | 13 | 768 | 842 |
| `storage/idb-shelf.ts` | 14 | 16 | 1226 | 1349 |
| `storage/memory-bank-db.ts` | 8 | 15 | 688 | 1147 |
| `refusals/errors.ts` | 96 | 94 | 6466 | 6056 |
| `refusals/throwers.ts` | 97 | 85 | 8659 | 7152 |
| `browser.ts` | 7 | 9 | 597 | 641 |
| **total** | **547** | **550** | **43186** | **41184** |

Lines held level while characters fell: AdapterBankDB's verbs shrank to headlines, the two file headers' maintainer
rules left the doc blocks, and lines went to members that had no block (`Presence`, `Refusalkind`, `RefusalFamily`,
`revtokCmpOf`, `revseqCmpOf`, `jsonSize`, `BoxLife`, `Listener`, `#boxRowsOf`, the four `#write*Row`, `RefusalRows`'
two fields). If the counts should come down, the memory-bank-db.ts phrases are the first to cut.

## Changes, member by member

### bank-db.ts

* **`GoodAnswer`, `BadAnswer`**: a short headline, then what the answer carries beside `val` or `err`.
* **`replacePassphrase`, `addPasskey`, `revokePasskey`**: the `gate_issue` clause dropped; "whose only change is" carries
  the contract. `addPasskey` keeps `camped`.
* **`getVault`, `getBox`**: the `ifAbsent: 'nil'` line reads "null where no row is stored, and the tombstone where one is".
* **`putVault`, `putBox`**: now name `stale_write`, and say what to do: get the row again and put over it.
* **`tidyGone`**: opens with the act ("Delete the vault and box rows of ended lives ..."); "Housekeeping for a host: no
  other verb depends on it" second.

### adapter-bank-db.ts

* **`AdapterBankDB`**: "The base class of a bankDB that keeps its rows in a datastore: a subclass writes the `do*`
  calls, each one atomic step", and that it checks asks and classifies by notes/answer-contract.md.
* **The 14 public verbs**: a short headline each, with `({@link BankDB.<verb>})`, as safebyok-graphql's `GraphQLBankDB`
  does: BankDB's blocks are no longer copied. Two adapter facts stay: `putBox` refuses `box_too_large` before the
  datastore is asked, and `watch` drops a changed row that fails its checks.
* **`[IsAdapterBankDB]`**: "a client bankDB such as GraphQL's lacks" for "a client of one lacks".
* **`classify*` (protected)**: the "`born`, `reborn`, `passed` and so on -- to route and shape its answer" tails cut.
* **`answerForRefusal`**: "Override it to tell one of your datastore's errors from another."
* **`refusalOf`**: one line on what it returns, one that its meta gains `oplabel` and the loggable ask (open question 34).
* **`jsonSize`**: a phrase. **`doPutGate`**: its second sentence on a second line. **`doWatch`**: "Left unwritten, for
  a datastore with no watch, it calls neither."

### bank-classifier.ts

* **Row helpers** (`bankRowOf`, `gateRowOf`, `vaultRowOf`, `boxRowOf`, `boxParentOf`, `listedRowOf`): the per-helper
  "Throws `damaged_row`/`damaged_vault`/`storage_issue`" cut, as the section comment above them says it once.
  `mainGateOf` keeps "Throws `damaged_row` where there is none". `listedRowOf`: "a damaged listed row is set aside, not
  thrown".
* **The five `*Stored` types**: `act` reads "what storage did, or why it refused" (was "directs how to route and handle
  the answer").
* **`classifyEnsureBank`, `classifyStoredBoxes`**: the read-order tour replaced by what happens to a damaged row of each
  kind. **`classifyStoredGate`, `classifyStoredVault`, `classifyDelBank`, `classifyBuildBank`**: the order tours cut,
  "Throws for a damaged row". **`classifyStoredBox`**: gains the `isWriteAct` line its siblings have.
* **`Presence`, `revtokCmpOf`, `revseqCmpOf`**: a phrase each. `BoxFetched.capacity`: "from an adapter that counts it".

### device-db.ts, idb-device-db.ts, idb-shelf.ts, memory-bank-db.ts

* **`DeviceDB`**: adds the G8 guarantee: anything but a refusal a subclass throws becomes `storage_unavailable`,
  keeping only the thrown `name`.
* **`stow`**: "replacing any lease stowed there". **`peek`**: a row of another `bank_tok` reads as none. **`forget`**: a
  row of another `bank_tok` stays. **`listLeases`**: "oldest proof first"; a damaged row is left out, and
  `listRawLeases` has it.
* **`ensureCachedDevice`**: "a fresh random `device_tok` when no sound one is stored" (was "on the first call": a stored
  row that fails its check is replaced too).
* **`listRawDevices`**: says anything not an object is left out.
* **`doEnsureCachedDevice`**: now says the row put has `made`'s `package_version` (open question 27).
* **`IdbDeviceDB`**: adds the G4 line: the leaseKey is stored as its `CryptoKey` handle by structured clone, never bytes.
  `leaseShelfOf`, `deviceRowShelfOf`, `idbDeviceDBOpts`: plain phrases.
* **`versionedShelfOf`**: adds that its first use starts deleting the older, unreadable-version and `oldnames`
  databases of its stem. `VersionedShelfSpec.dbstem`: `vaults` dropped from its examples (no such database now).
* **memory-bank-db.ts**: phrases for `BoxLife`, `Listener`, `#boxRowsOf` and the four `#write*Row`.

### errors.ts, throwers.ts, browser.ts

* **errors.ts header**: "`VaultError`, its refusalkinds and their families, and the guards that tell a refusal." The
  maintainer steps (where a new kind goes) became a `//` comment under it.
* **`refusalkindVals`**: the direction paragraph is one sentence of three kinds; the false and stale clauses cut (open
  question 30); the `wrong_passphrase`/`wrong_passkey` paragraph says an altered wayin, not "the stored vault".
* **`Refusalkind`, `RefusalFamily`**: a line each.
* **`RefusalMeta`**: "each field filled only by the refusals that learn it. It never holds secret material."
  `capacity` and `fieldnames` rewritten to what the code does (open questions 28, 29).
* **`RefusalRows`** (flagged in 16's review): headline "The rows a bankDB's refusal hands its answer, as read in the step
  that refused", and a doc block per field. **`VaultErrorOpts`** and the constructor's `@param opts` name `rows`.
* **`[IsVaultError]`**: "Always true: marks a VaultError for {@link isVaultError}, ...", as group 1's brands read.
* **`listedKindOf`, `thrownNameOf`**: short headlines, the reason on the second line.
* **throwers.ts header**: "The throwers: every refusal the core throws is made here, from a phrase in
  helpers/phrases.ts." The rules for a kind, a thrower's name and `meta` became `//` comments under it, word for word.
* **`sanitizeForeignError`**: "It trims nothing: an Error is kept whole, its message included."
* **`storageUnavailable`**: `@param cause` says to pass only a bankDB backend's throw, and to use `deviceDBFailed` for a
  device database's.
* **`rowOfOtherWorld`, `instanceDisabled`, `deliveredNotAsSent`, `refusalOfDelivering`, `deviceDBFailed`**: double
  colons and semicolons split into sentences. **`notExposed`**: now names its kind, like its siblings.
  **`weakPassphrase`**: "whose message is the strength checker's `reason`". **`boxTooLarge`**: "exceed" fixed.
* **`browserOpts`**: headline, then "The same `dbName` gets the same bag, so a React host may call it during render."

## Dropped facts that STYLE.md does not plainly cut (group 2)

* `BankDB.replacePassphrase`, `addPasskey`, `revokePasskey`: "Refuses `gate_issue` for any other change" (the
  classifier's `classifyStoredGate` still says it throws for such a record).
* `AdapterBankDB`'s verbs: their copies of BankDB's second lines (`damaged_rows`, null `val`, the `passed` act,
  `ifAbsent: 'nil'`, "refuses when the vault is not live under `bank_tok` and `vault_tok`", `camped`). Pointed at, not lost.
* `AdapterBankDB.classifyBuildBank`, `classifyStoredVault`, `classifyStoredBox`: the example acts and "to route and
  shape its answer".
* bank-classifier.ts row helpers: each one's kind (the section comment above them keeps all three). `mainGateOf`: "or
  for a row that fails its checks".
* `classifyEnsureBank`, `classifyStoredGate`, `classifyStoredVault`, `classifyStoredBoxes`: the order rows are judged in
  (the section comment "Each verb's row above is judged first" keeps the rule).
* `classifyStoredGate`: the kind `gate_issue`.
* `VersionedShelfSpec.dbstem`: `vaults` as an example stem.
* `refusalkindVals`: "Zod's own error its `cause` where a check failed" (false); "or a parent row failing its checks"
  as a `record_conflict` (no such path); "on the way out", "on the way in".
* `RefusalMeta`: "Records are as stored, ciphertext and visible fields" (meta holds no record now).
* `RefusalMeta.capacity`: "Always there on storage's own `vault_full`" and "Never on the vault's, which refuses from
  `vault.snapshot.capacity` before storage is asked" (both false today).
* `RefusalMeta.fieldnames`: "A step that may be the caller's data is not repeated" (false).
* `sanitizeForeignError`: "The header's rule on `meta` is advisory for the bag a thrower keeps".
* `storageUnavailable`: "It has only what the backend has: ciphertext and unencrypted fields"; "which read or write it
  was, say".
* `rowOfOtherWorld`: the examples "a vault or a gate of another bank" (the box example kept).

## Proposed renames (group 2)

* `BankDB.ensureBank` to `getBank` (or `fetchBank`): "Get the bank row, and for a live bank its `main` gate row and its
  vault rows." It stores nothing (`classifyEnsureBank` only reads), and `ensure` promises to make it so. A public
  rename across every adapter.
* `BankDB.buildBank` to `createBank`: group 1 named the clash beside `BankListing.build`. It puts a bank, and a `build`
  puts nothing.
* `AdapterBankDB`'s `refusalOf` and throwers.ts's `refusalOfDelivering`: a `fooOf` changes nothing, but both
  `Object.assign` new meta onto the VaultError they are handed. Rename, or make them copy (open question 34).

## Open questions (group 2)

26. **AdapterBankDB points at BankDB.** Its verbs are short headlines with `({@link BankDB.<verb>})`, as safebyok-graphql's
    `GraphQLBankDB` was done by the sibling run. Two adapter facts stay on it (`box_too_large` before the datastore is
    asked; a damaged noticed row dropped). Undo if copies were wanted.
27. **`doEnsureCachedDevice`'s contract left out `package_version`.** `ensureCachedDevice` promises "Its
    `package_version` is this safebyok's, whatever an earlier call stored", but the base does not set it: it parses what
    `doEnsureCachedDevice` returns. Both subclasses do it (`{ ...kept.data, package_version: made.package_version }`).
    The old block ("Return the device row stored ... if it passes its check, else put `made`") would have let a
    third-party subclass break the promise. The block now says it. Should the base set it instead?
28. **No vault-side `vault_full`.** `RefusalMeta.capacity` said the vault refuses from `vault.snapshot.capacity` before
    storage is asked: nothing in `models/` throws `vault_full`. And `storageFull()` (from `idb-transaction.ts`, a
    QuotaExceededError) is storage's own `vault_full` with no `capacity`. Rewritten to "On a `vault_full` from a bankDB
    that counted the vault's boxes".
29. **`fieldnames` names every step.** The old block said "A step that may be the caller's data is not repeated";
    `fieldnameOf` is `issue.path.map(String).join('.')`, and G8 says a host-chosen key may be named. Sentence cut.
30. **`refusalkindVals` prose.** `damaged_whisper` never has a Zod cause (`undecodedWhisper()` and
    `undecipheredWhisper()` take none). `record_conflict` for "a parent row failing its checks": the classifier throws
    `damaged_row` or `damaged_vault` for that. Both cut from the doc block; the inline `//` on `record_conflict` still
    lists "a parent row failing its checks" (running comments unchanged).
31. **"vault" where the bank is meant.** The inline `//` kinds (`wrong_passphrase` "did not unlock the vault",
    `damaged_lease` "the vault locked", `weak_passphrase` "the vault's strengthChecker", `gate_made_elsewhere`,
    `absent_wayin`) and several thrower blocks (`passkeyAlreadyAdded`, `wrongPassphrase`, `noPasskeyWayin`,
    `otherPrfSalt`, `unknownKeyDeriver`, `gateMadeElsewhere`, `undecipheredWhisper`) still say "vault" for what is now
    the bank or the gate. The phrases the user sees say "vault" too ("This vault has a passkey already"). Left as they
    are: is "vault" still the user's word for the bank? If not, a phrases-and-comments pass.
32. **`vault_empty` is never thrown.** It is in `refusalkindVals` and `RefusalFamilyForKind` and in
    `tests/refusals/errors.test.ts`, and nowhere in `src/`. Remove it?
33. **A stale plain comment in throwers.ts.** `/* The refusals of a bankDB, each read the same in an answer and an
    error: `meta` has the `parent` and `dbhas` the answer carries. */` contradicts the `//` below it ("No rows go on this
    error") and `RefusalMeta`, which has no `parent` or `dbhas`. Not a doc block, so left. Delete it?
34. **Two `fooOf`s that mutate.** `refusalOf` (adapter-bank-db.ts) and `refusalOfDelivering` (throwers.ts) do
    `Object.assign(refusal, { meta: { ...refusal.meta, oplabel, ... } })` on the VaultError they were handed. The
    blocks say "Its meta gains". Copy, or rename?
35. **`presenceVals` lives in bank-classifier.ts**, not `shapes/shapes-enums.ts` as STYLE.md's enumeration rule says.
36. **Two file headers moved to `//`.** errors.ts's and throwers.ts's headers were rules for maintainers (where a new kind
    goes; how a kind earns its place; a thrower's name; `meta`'s depth). Each is now a one-line doc block with the rules,
    word for word, as `//` under it. errors.ts's pointer "at the top of refusals/throwers.ts" still holds.
37. **notes/guarantees.md G8 names `storeFailed`** as the thrower in each `DeviceDB` verb's catch; the code's is
    `deviceDBFailed` (`storageFailed` is the backend one). One more for open question 2's sonnet pass.
38. **A device database's QuotaExceededError keeps its cause.** `idb-transaction.ts` (outside this target) makes it
    `storageFull(err)`, a refusal, which `DeviceDB`'s catch passes through unchanged, with the DOMException as `cause`.
    G8 says a device-database failure keeps only its `name`. A browser's IndexedDB error quotes no row, so likely
    harmless; flagged only.
39. **`AdapterBankDB.watch` drops a damaged noticed row silently**: no bad news is told
    (`if ((! val.success) || ...) { return }`). The block now says so. Intended, or should `onBadNews` hear it?
