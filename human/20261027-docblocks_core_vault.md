# 2026-10-27: vault.ts doc blocks rewritten -- eight open questions, five renames proposed

Documentarian run 5a of the fixup sprint, on `packages/safebyok/src/vault.ts` alone. Doc blocks
only: no behaviour, name or `@example` code changed. Two running comments were added, each a
maintainer's invariant moved out of a doc block, and three fields of inline object types
(`BirthRead`, `DeletedBox`) got doc blocks of their own.

Doc-block lines: 736 in 154 blocks before, 665 in 161 after.

## What I gathered into the class doc

The `Vault` doc now says once, for every call unless the call's doc says otherwise:

* a malformed argument or option refuses 'bad_option' ('bad_scope' for a boxlabel) before anything
  is read, asked for or written, its message naming the field, never the value (was already there;
  members no longer repeat it);
* a call refuses with what storage beneath it refuses, as it came;
* once the Vault object is gone, every call but `subscribe()`, `getSnapshot()`, `checkStrength()`
  and `consistentWith()` refuses 'vault_gone' or 'vault_remade' (`consistentWith()` is new to the
  list: it answers false);
* **new**: a lock landing mid-call refuses 'vault_locked' at the call's next step, writing nothing,
  unless a gating has unlocked the vault again meanwhile; a write already sent is past its reach.
  This was stated call by call in `lock()`, `putBox()`, `getBox()`, `getWhisper()`,
  `useWhisper()`, `delBox()` and `del()`;
* what a function that hears the passphrase throws is kept nowhere (kept, unchanged).

What it said of `ensureUnlocked`, the two forms, `onBadNews` and event handlers stays, tightened.
The device-record and `vault_behind` paragraph, and "storage alone settles a race", stay.

## Changes, member by member

* `bear`, `letGo`, `goneBy` (symbols): "The symbol of", not "The name of".
* `VaultSnapshot`: opens "A vault as a host renders it" (not "What a host renders"); "fixed for
  the Vault object's life" and "the same object until it changes" said once in the type doc,
  dropped from nine fields; `gate`, `boxes`, `damagedBoxes` link their shapes instead of touring
  them; `ask_passphrase_at`'s `Intl` advice cut to one sentence.
* `Vault` (class): as above.
* Stamp fields, `stamp`, `snapshot`, `getSnapshot`, `subscribe`, `logger`: "Fixed for the Vault
  object's life" and "bound, of one identity" said once in the class doc.
* `hello`: lease paragraph tightened; facts the class doc holds dropped; the sharing of a read
  under way corrected (open question 1).
* `refresh`: three sentences to two.
* `ensureUnlocked`: three paragraphs (when it resolves at once; gatings; refusals), the gone
  refusals left to the class doc; 'gate_made_elsewhere' named (open question 3).
* `demandConsistentWith`, `consistentWith`: the "what each call asks" clause and the misuse kind
  dropped from the demand; `consistentWith` says it throws for misuse, unlike a yes-or-no.
* `lock`: the per-call list of where a lock lands replaced by a pointer to the class doc; the
  `del()` case moved to `del()`.
* `checkStrength`: misuse and the UI hint dropped; the no-cause rule for a checker's throw kept.
* `putWayin`: "It awaits a hello first" added (the code does); `gate.passkey`, not `passkey`;
  'gate_made_elsewhere' named (open question 3); misuse dropped.
* `delWayin`: "Delete", not "Take away" (the verb is `del`); one sentence merged.
* `putBox`: 31 prose lines to 25; the lock paragraph to the class doc; misuse dropped.
* `getBox`: opens "Read the box stored under", as a `get` that reads storage; "while the vault is
  locked" added (open question 2).
* `getWhisper`, `useWhisper`: open "Read and open"; the lock and the unlisted-box clauses dropped.
* `delBox`: "Delete", not "Remove"; "goes through `ensureUnlocked`", not "asks for a proof";
  "while the vault is locked" added; the lock sentences to the class doc.
* `del`: the sent-write rule moved in from `lock()`; the hello first.
* `[letGo]`, `[goneBy]`: shorter; `goneBy` says when to ask it.
* `[bear]`: "as `bank.ensureVault` does" and "exported by no entry point" dropped.
* `#clockNow`, `#leaseInForce`, `#picture`: shorter; `#leaseInForce` now an instruction.
* `#replaceSnapshot`: "the one place the snapshot is swapped" became a running comment above it.
* `#refresh`, `#readStorage`, `#takeStorage`, `#helloWithin`, `#watchStorage`: each names its
  reach; `#takeStorage`'s read-order reason became a running comment at the read.
* `#judgeRead`, `#takePicture`: the explanations `isOlderPicture` and `leavesInForce` hold are
  linked, not restated; "the caller refuses it" dropped.
* `#raiseRecordAfter`: leads with the verb, names `DeviceDB.raiseDeviceRecord`.
* `#demandNotGone`: the caller list became "Ask it first in every call".
* `#demand`: "the one demand" became a running comment above it.
* `#demandAfterWait`, `#inconsistencyWith`, `#provingInconsistency`, `#leaseRefusal`,
  `#demandLease`: tightened; `#provingInconsistency` now says both conditions of `moved()`, as the
  code has them.
* `#ensureUnlocked` (private): links the public doc, keeps only `shouldAsk` and the return.
* `#gatingFor`, `#raiseGating`, `#landGating`, `#freshen`, `#delVault`, `#afterDel`: verbs first,
  reaches named; `#delVault`'s refusal said as the code does it.
* `#putGate`: refusals left to `#gateWriteRefusal`, linked.
* `#takeOwnWrite`: what the following grant does dropped.
* `#lockNow`: "every lock goes through here" and the ordering reason became a running comment.
* `#heedRefusal`: says the waiters hear the refusal and the reach (`DeviceDB.delLease`).
* `#letGo`, `#dropLease`: caller lists dropped.
* `#holdLease`: "returning", not "resolving" (it is synchronous).
* `#takeUpFromPantry`, `#takeUpAtBirth`, `#fitsTakeUp`: private members as plain code, not
  `{@link Vault.#...}`; "the one predicate" became a running comment; the caller list became an
  instruction.
* `#boxWeight`, `#checkRoomFor`: one block line each fewer.
* `#isListed`, `#getBoxUnlocked`, `#readBox`, `#boxReadRefusal`: reaches named; `#readBox`'s
  "the demand cannot see a lock" became a running comment at the second demand.
* `#sealAndPutBox`, `#listedBase`, `#storedBase` (STYLE.md's worked example, name kept),
  `#damagedBase` (its second line now says what it does), `#writeOver`, `#updateBoxListingOf`,
  `#dropBoxListingOf`: verbs and reaches first.
* `#badOutcome`, `#tellBadNews`, `#heedLateThrow`, `#handlerThrew`: verbs first.
* `BirthRead`, `DeletedBox`: field tours became field doc blocks.
* `checkHelloOpts`, `checkEnsureUnlockedOpts`, `checkDemandOpts`, `checkPutBoxProps`,
  `vaultMadeUnderShape`, `PutBoxProps`: no longer open on "What".

## Dropped facts

Each fact cut that STYLE.md does not plainly cut, for a Coach to put back.

* `VaultSnapshot.user_id`: "as `bank.ensureVault` was given it". `applabel`: "where the vault is
  found". `damagedBoxes`: "meets a `putBox()` under its boxlabel". `ask_passphrase_at`: "Null with
  a `gate` is the host's cue to offer an unlock" (the type doc's screen rule says it), and the
  sample renderings "Tue, Oct 27, 3:00 PM" and "in 2 days".
* `Vault`: of 'vault_behind', "though the Vault object holds the newer copy"; of an older read,
  "it takes nothing from them ... and keeps the newer" (now "is ignored, refusing nothing"); "Each
  says how it refuses" (of the key deriver, strengthChecker, requestCleartext); the `Outcome` shape
  `{ ok: true, val }` / `{ ok: false, err }`; "A refusal a member's doc names comes as `err` from
  its `try` form"; "call it on the vault".
* `hello`: "the vault's birth took up this device's [lease]"; "applies no partial read" (now
  "leaves the vault as its last read left it").
* `refresh`: "It refuses as `hello()` does" (the first line links hello).
* `ensureUnlocked`: "Every call that needs a whisper goes through it" (class doc); "-- a change to
  the ways in, a deletion --"; "Only then is the gating handed to `requestCleartext`, and the call
  waits for it to settle"; "through the gating's attempt".
* `demandConsistentWith`: "what each call asks before and after each wait"; "as its expiry drops
  it"; "It is synchronous".
* `consistentWith`: "It compares as the demand does, and with `opts.leaseBound` asks also for a
  lease in hand that has not ended".
* `lock`: "a stale `putBox()` refusing 'stale_write' as ever"; the per-call detail of which waits a
  lock lands in (putBox: "waits on a gating, reads and opens the box (`VaultDB.getBox`,
  `box.extractWhisper()`), or seals it (`Box.seal`)"; delBox: "waits on a gating"; getBox:
  "handing back no box").
* `checkStrength`: "show a 'weak_passphrase' message beside the field" (the third example shows it).
* `putWayin`: "(the user adds a passkey again under the new passphrase)".
* `putBox`: "the same whisper stored again included" (of `written_at`); "Every store stamps
  `written_at`"; "Once it lands, the listing takes the box as storage stored it"; "Replacing a box
  is never refused so by the vault's own limits" (now: 'vault_full' "for a new boxlabel"); "for a
  box heavier than one record holds" (of 'box_too_large').
* `getBox`: the first line's tour, "its visible fields, sidecar among them, and its ciphered
  whisper".
* `del`: "Deleting a vault is proven like any change to it."
* `[letGo]`: "as `bank.closeVault` says".
* `#clockNow`: "every time a record keeps is an integer".
* `#replaceSnapshot`: "useSyncExternalStore's contract, and what spares React a render after a
  refresh that found nothing new".
* `#judgeRead`: "though the picture in hand is the newer copy: the caller refuses it
  'vault_behind', taking nothing"; the parenthesis on why an older read is ignored
  (`isOlderPicture` says it).
* `#takePicture`: "A lease another tab's unlock or renewal wrote under the same gate leaves it in
  force" (`leavesInForce` says it).
* `#ensureUnlocked` (private): the restated join and wait-out rules (the public doc has them),
  "its refusal is this call's", "its success is checked again, since it may have taken up a lease
  ending within this call's `renewMillis`".
* `#delVault`: "within its gating's hold"; "It demands on the proving before the write".
* `#putGate`: "It demands on the gate before and after the write" (class doc).
* `#takeOwnWrite`: "then the grant that follows finds the vault moved on, and writes no lease";
  "the grant that follows holds the new one, and a grant that fails leaves the vault locked, as its
  snapshot then says".
* `#letGo`: the list of who calls it; `#dropLease`: "what the expiry, the vault going gone, a
  demand finding the lease ended, and a read finding it revoked do", and "The expiry passes `now`,
  its deadline, so the snapshot is reckoned without a read of the clock".
* `#readBox`: "A box another device wrote is what storage holds, not drift."
* `#boxReadRefusal`: "every later call refusing 'vault_gone', and the bank births the next when
  asked" (class doc).
* `#sealAndPutBox`: "one read ..., one seal, one write"; "It demands the lease first, and the box
  after its seal; what storage stored is taken into the listing after its own demand".
* `#takeUpFromPantry`: "A lock, a decline or the vault going while the store is read lands the
  gating" (now: a landed gating takes nothing up; the Vault object gone refuses, as the code does).

## Proposed renames

1. `#storedBase` to `#fillFromStored`: STYLE.md's worked example already shows the block under that
   name, as its first line ("Read and open the box stored ..., filling in ...") showed `storedBase`
   wrong.
2. `#picture` to `#snapshotAt`: it makes a snapshot, while "the picture" elsewhere in the file is
   the vault record and listing in hand (`#takePicture`, `isOlderPicture`).
3. `#raiseRecordAfter` to `#raiseDeviceRecord`: its line is "Raise this device's record"; "After"
   names a caller's moment.
4. `checkHelloOpts`, `checkEnsureUnlockedOpts`, `checkDemandOpts`, `checkPutBoxProps` to
   `checked...`: each returns the bag it checked, and a `check` returns nothing. `optionsCheck` in
   options.ts makes them; that file is another documentarian's.
5. `vaultMadeUnderShape` to `VaultMadeUnder`: a shape's validator takes its type's name, and the
   type is in vault-record.ts, so the validator would move there.
6. `getWhisper` resolves no null: it refuses 'absent_box' where the `get` verb promises null for
   none. Not a rename I would make without a ruling: see open question 6.

## Open questions

1. **hello's shared read (doc changed to the code).** The old doc said a hello made while a read is
   under way "shares that read, whatever its `staleMinutes`, and starts none of its own".
   `#helloWithin` checks `staleMinutes` before it joins `#refresh`, so a hello within its window
   re-settles at once and does not wait on the read under way. The doc now says "One that reads
   while a read is under way shares it."
2. **The listing short-circuit holds only while locked (doc changed to the code).** `getBox`,
   `getWhisper`, `useWhisper` and `delBox` said a box the snapshot does not list resolves null or
   refuses 'absent_box' "at once, asking nobody". `#ensureUnlocked` runs `shouldAsk` only when it
   must ask, so an unlocked vault reads storage, and finds a box written elsewhere and not yet
   listed (`delBox` sends `VaultDB.delBox`, and storage says 'absent'). Each doc now says "while the
   vault is locked". `putBox`'s 'no_whisper' already said "for a box a locked vault's listing does
   not show".
3. **'gate_made_elsewhere' was named on no public call (doc added).** `#putGate` and
   `#gateWriteRefusal` refuse it for a first passphrase racing another device's, and gating.ts's
   `initialize_gate` chain refuses it too. It is not among gating.ts's `CorrectableKindVals`, so it
   settles the gating and reaches `ensureUnlocked()` and `putWayin('passphrase')` on a novel vault:
   a race with another device, which STYLE.md has a call name. Both docs now name it. Check that it
   is meant to reach the caller rather than the dialog alone.
4. **The class doc's new lock bullet generalizes one call's rule.** "unless a gating has unlocked
   the vault again meanwhile" was said only of `getWhisper()`/`useWhisper()`. I checked
   `#sealAndPutBox` (`#demand(lease, { leaseBound: true })` asks for whatever lease is in force
   now) and `#readBox` (`#demandLease`): both pass under a lease granted meanwhile under the same
   gate. Confirm it holds as a class-wide promise.
5. **`#gateWriteRefusal`'s 'stale_write' message is wrong about one case.** It says "-- a vault
   unlocker was changed, or it was deleted or made anew, elsewhere --", but a vault deleted or made
   anew is refused 'vault_gone' or 'vault_remade' before that line. It is a message, not a doc
   block, so I left it.
6. **`getWhisper` and the `get` verb.** It refuses 'absent_box' where `getBox` resolves null, while
   STYLE.md's verb table promises `get` "resolving it or null for none". A ruling would say whether
   the doc, the name, or the verb table is right.
7. **`consistentWith` throws.** STYLE.md's verb table says a condition "never throws"; this one
   throws 'bad_option' for misuse. The doc says so now; is misuse the exception the table means to
   allow?
8. **`useWhisper`'s 'bad_option' message says "use needs a callback function"**, the method's old
   name. A message, not a doc block, so left.

Also: the brief's candidate list named `ensureLease`; vault.ts has none, so I took it as
`ensureUnlocked`. The private docs say "the picture" for the vault record and listing in hand,
where #300 settled "held" for the vault record in hand: I kept "picture", the name `#takePicture`
and `isOlderPicture` carry. No `@ts-expect-error` or `eslint-disable` was added.
