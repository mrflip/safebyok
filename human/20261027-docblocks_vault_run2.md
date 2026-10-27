# 2026-10-27: Documentarian run 2 on vault.ts -- class doc gathered, 12 open questions, 6 renames proposed

Run 2, independent of run 1, on `packages/safebyok/src/vault.ts` as the worktree had it (commit
`92afe6e0` on `20261027-docblocks_vault_run2`). Main has since merged another pass (#304), so this
commit won't land as it is. It is here to compare against, and for the guidance feedback
(at the end).

Doc-block lines: **732 before, 684 after** (155 blocks before, 163 after). The block count rose
because `BirthRead`, `PutBoxProps` and `DeletedBox` now document their fields on the fields
themselves, rather than in a tour in the type's doc. Lint, typecheck and tests are green.
No `@ts-expect-error` or `eslint-disable-line` was added.

## The class-wide rules, checked against every member

The class doc now lists what every call holds to, unless its own doc says otherwise. This is my
reading of the code, checked member by member:

* **'bad_option' before anything is read, asked for or written** ('bad_scope' for a boxlabel,
  'bad_whisper' for a whisper). `hello` (`checkHelloOpts`, `parseStaleMinutes`), `ensureUnlocked`
  (`checkEnsureUnlockedOpts`, `parseRenewMinutes`, `renewPastLease`), `demandConsistentWith` and
  `consistentWith` (`checkDemandOpts`, `checkedMadeUnder`), `checkStrength` (typeof),
  `putWayin`/`delWayin` (`checkSlotlabel`), `putBox` (`putBoxPropsOf`, `#checkedBoxlabel`,
  `checkedWhisper`), `getBox`/`getWhisper`/`delBox` (`#checkedBoxlabel`), `useWhisper` (callback
  typeof) and `subscribe` (listener typeof) all check before any await. `#checkStanding` runs
  first in most of them, so a gone Vault object refuses 'vault_gone' before 'bad_option'.
  `bad_whisper` was missing from the old rule: `checkedWhisper` in box.ts refuses with it.
* **A hello first** ("a call that reads or writes a box, a way in or the vault first runs
  `hello()`, within the vault's `staleMinutes`"):
  - `ensureUnlocked`, `putBox`, `getBox`, `getWhisper`, `useWhisper` and `delBox` go through
    `#ensureUnlocked`, which awaits `#helloWithin(#staleMillis)` first, even when the lease
    stands.
  - `putWayin`, `delWayin` and `del` await `#helloWithin(#staleMillis)` directly.
  - `hello` is the hello, and `refresh` is `#helloWithin(0)`.
  - `lock`, `checkStrength`, `demandConsistentWith`, `consistentWith`, `subscribe` and
    `getSnapshot` run none. The doc names `lock()` as the exception. The others neither read nor
    write storage.
* **Storage's refusals as they came.** These members say otherwise in their own docs:
  - `getBox`, `getWhisper`, `useWhisper`, and `putBox` when it reads the box first: a box read
    that storage refuses 'vault_mismatch' becomes 'vault_gone' (`#boxReadRefusal`).
  - `putBox`'s write: 'vault_mismatch' becomes 'stale_write', and 'invalid_box' becomes
    'bad_record' (`#writeOver`).
  - `putWayin`, `delWayin`, and `ensureUnlocked`'s `initialize_gate`: a stale gate write becomes
    'gate_made_elsewhere', 'vault_gone', 'vault_remade', or a 'stale_write' with no meta
    (`#gateWriteRefusal`).
  - `delBox`: storage's `absent` becomes 'absent_box'.
  - Everywhere, a vault that moved on during a wait refuses as the demand finds it, ahead of what
    storage said (`#demandAfterWait`).
* **Once gone.** Every public async call starts with `#checkStanding`, directly or through
  `#getBoxUnlocked`. The calls that still work: `subscribe`, `getSnapshot` and `checkStrength`,
  which never check standing, and `consistentWith`, which answers false because
  `#inconsistencyWith` returns the gone refusal. `demandConsistentWith` refuses as the gone
  refusal. 'vault_remade' is the refusal only when a call finds the vault made anew: a hello, a
  refresh or the watch (`#judgeRead`), or a gate write (`#gateWriteRefusal`). A box read refuses
  'vault_gone' either way (ruling 1), and every later call does too.
* **Two forms.** `subscribe`, `useWhisper` and `demandConsistentWith` have no `try` form (ruling
  2). `consistentWith` asks `demandConsistentWith`'s question without refusing.

## Changes, member by member

* **bear, letGo, goneBy**: each is now "The symbol of ...", not "The name of ...".
* **VaultSnapshot**: no longer opens on "What a host renders". Two things are now said once, in
  the type's doc: that the five scope and stamp fields are fixed for the Vault object's life, and
  that each slice keeps its identity until it changes. Each field had repeated them.
  - `format`: dropped the literal format string.
  - `damagedBoxes`: reworded "meets a `putBox()` under its boxlabel".
  - `ask_passphrase_at`: kept the FarFuture comparison and "until locked". The `Intl` advice is
    down to one clause.
  - `trouble`: trimmed.
* **Vault class doc**:
  - The rules above are now one list, with the "hello first" rule new.
  - The gone rule now says three things: when the Vault object goes, the box read's
    'vault_gone', and that `consistentWith` answers false.
  - The `vault_behind` paragraph and the race paragraph are tightened.
  - The two-forms paragraph names `demandConsistentWith` (ruling 2).
  - Gatings are raised for a change to the ways in and for `del()`, as well as for a whisper.
* **Stamp fields** (`format` ... `registered_at`): dropped "Fixed for the Vault object's life",
  which the class doc says once.
* **snapshot, getSnapshot, subscribe, logger**: shorter. Binding and identity are said once, in the
  class doc.
* **hello**: modelled on STYLE.md's worked example.
  - Added: it joins a read under way, and it raises the device record, a reach the old block
    didn't name.
  - Dropped: 'vault_gone'/'vault_remade', and the old-read-ignored rule. The class doc has both.
  - The `staleMinutes: 0` example's comment now says it may join a read already under way
    (ruling 5).
* **refresh**: "joins", and the watch is named as `VaultDB.subscribe`.
* **ensureUnlocked**: three paragraphs.
  1. When it resolves at once.
  2. Joins and raises, at most one gating of its own, and the pantry consult with
     `DeviceDB.getLease` named.
  3. Its refusals.

  'vault_gone' and the hello are left to the class doc. The joined-success re-check moved to the
  private `#ensureUnlocked`.
* **demandConsistentWith, consistentWith**: dropped 'vault_gone' and 'bad_option' (class doc). The
  first line is now "still fits the vault as it stands now".
* **lock**:
  - The per-call list (getWhisper/useWhisper, getBox, putBox's steps, delBox) became one rule: "A
    call waiting on a gating, or past its unlock, refuses 'vault_locked' at its next step, unless a
    gating has put a lease back in hand meanwhile."
  - Writes already sent are named.
  - Added that other tabs drop their lease at their next read (`#takePicture`'s revoked check).
* **checkStrength**: dropped the non-text 'bad_option' (class doc).
* **putWayin**:
  - Refusals regrouped. 'gate_made_elsewhere' added for a first passphrase another device set
    first.
  - "This device is left unlocked" became "unlocked afresh; a device store that will not keep the
    lease leaves it locked, and only the logger says so" (`gating.ts` `#grantAfterChange`).
* **delWayin**: points to `putWayin` for its waits, refusals and aftermath.
* **putBox**:
  - The sidecar facts moved to the `PutBoxProps.sidecar` field, and `@param props` links it.
  - Storage pass-throughs dropped: storage's own `vault_full`, and `box_too_large`.
  - "A vault deleted or made anew elsewhere refuses 'stale_write'" now notes that a box read
    first refuses 'vault_gone' instead.
  - The lock rule is down to "before the write is sent / once sent".
* **getBox**: the first line now leads with "Read".
  - The unlisted-box shortcut is limited to a locked vault (see the open questions).
  - The vault-gone sentences dropped: the class doc holds the box-read exception.
* **getWhisper, useWhisper**: lead with "Read and open". Each defers to the member before it.
* **delBox**: "Remove" became "Delete" (the verb its name promises). The unlisted shortcut is
  limited to a locked vault. Added that after 'stale_write' this Vault object still stands.
* **del**:
  - Reordered.
  - A new paragraph for ruling 6: once the write is sent, a deletion storage refuses after a lock,
    a decline or a let-go refuses "deliberately, as that landing would have": 'vault_locked',
    'vault_gone'/'vault_remade', or the storage refusal that locked the vault.
* **[letGo], [goneBy], [bear]**: dropped who calls them.
* **Private members**:
  - Lead with their verb ("Read ...", "Raise ...", "Land ...").
  - Name their reach (`VaultDB.getBox`, `VaultDB.subscribe`, `DeviceDB.raiseDeviceRecord`,
    `DeviceDB.delLease`, `DeviceDB.getLease`).
  - `{@link Vault.#judgeRead}` and `{@link Vault.#fitsTakeUp}` became plain code.
  - Moved to running comments: "Every lock goes through here" (`#lockNow`), "The one place the
    snapshot is swapped" (`#replaceSnapshot`), and `#fitsTakeUp`'s reason for its upper bound.
  - Caller lists cut from `#dropLease`, `#freshen` and `#takeUpFromPantry`.
  - `#storedBase` takes STYLE.md's after-text.
  - `#putGate` points to `#gateWriteRefusal` rather than repeating it.
  - "What a ..." openings rewritten in `#boxWeight`, `#listedBase`, `#damagedBase`,
    `#heedLateThrow`, `#handlerThrew`, `eventHint`, the `check*Opts` constants and
    `vaultMadeUnderShape`.
* **BirthRead, PutBoxProps, DeletedBox**: the inline object types now have field docs. This is the
  only code-shape change: three one-line types became multi-line.

## Dropped facts that STYLE.md doesn't plainly cut

These are the ones a Coach may want back. Minor rewordings aren't listed.

1. `VaultSnapshot.format`: the literal `safebyok-vault-v6`. It goes stale, and the type already
   carries it.
2. `ask_passphrase_at`: the `Intl.DateTimeFormat` and `Intl.RelativeTimeFormat` specifics, with
   their sample strings.
3. Class doc:
   - "never absent";
   - "the vault argues with none";
   - "A refusal a member's doc names comes as `err` from its `try` form";
   - "Each says how it refuses", of the host's functions;
   - "though the Vault object holds the newer copy", on 'vault_behind';
   - "which erases the record", on `bank.clearCachedVault`.
4. `hello`: "the vault's birth took up this device's [lease]", and "another tab's unlock or
   renewal leaves it standing until it ends".
5. `ensureUnlocked`: "on a button", and "Only then is the gating handed to `requestCleartext`,
   and the call waits for it to settle".
6. `lock`: the per-call breakdown, including "a `getBox()` refuses so too, handing back no box"
   and the `putBox()` steps (`VaultDB.getBox`, `box.extractWhisper()`, `Box.seal`).
7. `checkStrength`: "show a 'weak_passphrase' message beside the field". The example shows it.
8. `putWayin`:
   - "(the user adds a passkey again under the new passphrase)";
   - "never a passkey";
   - "The gate epoch moves";
   - the kind name 'damaged_wayin' for a way in stored damaged.
9. `putBox`:
   - storage's 'vault_full' for a replacement, and 'box_too_large' (storage pass-throughs);
   - "a vault made anew meanwhile refuses 'vault_remade' after the write landed";
   - "never interpreted by the vault", of the sidecar;
   - "in what storage holds of one vault", of `vault_full`.
10. `getBox`: "that listing is as fresh as `staleMinutes` keeps it", and its own vault-gone
    sentence with its remedy, "ask the bank for the vault again (`bank.ensureVault`)". The class
    doc says it generally.
11. `del`:
    - "Deleting a vault is proven like any change to it";
    - "this device raises its record of the vault to [the tombstone's epoch]";
    - "every call on it refuses 'vault_gone'".
12. `[goneBy]`: "the bank's look at a Vault object whose read found the vault deleted or made anew
    before its birth settled" (who calls it).
13. `#takeOwnWrite`: "then the grant that follows finds the vault moved on, and writes no lease",
    and "a grant that fails leaves the vault locked, as its snapshot then says" (what comes next,
    elsewhere).
14. `#readBox`: why the lease is demanded again ("cannot see a lock, which moves no
    `vault_tok`").
15. `#replaceSnapshot`: "and what spares React a render after a refresh that found nothing new".

## Proposed renames (names stay in this commit)

Each comes with the first line that shows the old name is wrong.

1. `checkHelloOpts`, `checkEnsureUnlockedOpts`, `checkDemandOpts` and `checkPutBoxProps` become
   `checked*`. "`hello()`'s options, once they hold nothing but `staleMinutes` ...: 'bad_option'
   otherwise." Each returns the bag (`optionsCheck` returns `candidate`), and `checkFoo` promises
   to return nothing.
2. `putBoxPropsOf` becomes `parsePutBoxProps`. "The boxlabel and sidecar a `putBox()` was handed,
   the sidecar checked ... Refuses 'bad_option' ...". `fooOf` promises pure; this refuses and
   converts.
3. `#storedBase` becomes `#fillFromStored`, as STYLE.md's own worked example has it. "Read and open
   the box stored under `boxlabel`, filling in the sidecar or whisper a partial `putBox()` left
   out."
4. `#raiseRecordAfter` becomes `#raiseDeviceRecord`. "Raise this device's record of the scope to
   `vaultEpoch` ...". The receiver isn't the record, so the object belongs in the name. "After"
   isn't in the line.
5. A question rather than a rename: `getWhisper`. "Read and open the whisper in `boxlabel`" ...
   "refuses 'absent_box' where `getBox()` resolves null". The `getFoo` row promises null for none.
6. A question: `#boxReadRefusal` and `#gateWriteRefusal` are nouns, but each makes the Vault
   object gone as a side effect. The name hides the most consequential thing it does.

## Open questions

1. **Disagreement, getBox/getWhisper/delBox.** The old prose said a box the snapshot doesn't list
   resolves null, or refuses 'absent_box', "at once, asking nobody". The code does that only while
   locked. Unlocked, `#ensureUnlocked` returns true before `shouldAsk` runs, so the call runs its
   hello and reads storage (`VaultDB.getBox` or `VaultDB.delBox`). It is never "at once": the
   hello comes first either way. I wrote what the code does.
2. **Disagreement, putBox.** The old prose said "A vault deleted or made anew elsewhere refuses
   'stale_write'". That is true of a whole store. A partial store reads first through `#readBox`,
   which refuses 'vault_gone' and makes the Vault object gone. Both are documented now.
3. **Asymmetry.** A box *read* finding the vault gone makes the Vault object gone. A box *write*
   (`putBox` whole, `delBox`) refuses 'stale_write' and leaves it standing. Is that intended?
4. **bad_whisper.** The old class rule said 'bad_option' ('bad_scope' for a name). A malformed
   whisper refuses 'bad_whisper'. I added it to the rule.
5. **del: a throwing requestCleartext after the write is sent.** `RaisedGating.#run`'s catch
   declines with `badOutcome(err).err`, so `#lateLanding` holds 'unexpected_error'. A deletion
   storage then refuses reaches `del()` as 'unexpected_error', not 'vault_locked'. The doc says
   "'vault_locked' for a lock or a decline". Is this edge worth a clause?
6. **lock during a call's opening hello.** A lock that lands while a `getBox()` or `putBox()` is
   still in its hello isn't refused. The call finds no lease and raises an `unlock_vault` gating,
   so it prompts. I wrote "A call waiting on a gating, or past its unlock, refuses ...". Is
   prompting there intended?
7. **lock, new fact.** "Other tabs on this device drop theirs at their next read of storage" comes
   from `#takePicture`'s revoked check. Is it wanted in the public doc?
8. **putWayin/delWayin, new fact.** A device store that won't keep the lease leaves this device
   locked after a change that landed, and only the logger says so. The old prose said "left
   unlocked".
9. **The class-wide "hello first" rule** is my reading of the code (see above). Is it worth
   stating, given that hello can refuse 'damaged_vault', 'vault_behind' and so on from any box
   call?
10. **getWhisper's name** (rename 5).
11. **The brief's candidate on `ensureLease`.** It names "what the class doc says of
    `ensureLease`", but vault.ts has no `ensureLease`, and its class doc says nothing of one.
    The candidate is stale.
12. **`#lockNow` and `#replaceSnapshot`.** Maintainers' invariants now sit as `//` lines *above*
    the doc block. Should they go between the doc block and the member instead? TS still
    attaches the doc block either way, as far as typecheck shows.

## Guidance feedback

It's in the report to the coordinator, in full. In short:

* Two rules pull against each other: *say once* and *name conditions per member* (the lock
  condition).
* STYLE.md files `vault_gone` under Misuse, where errors.ts has it as a condition.
* No rule says what to do with refusal *translations* from storage.
* "Reads through `#readBox`" and "a private member is always plain code" give no wording for a
  private member that reaches through another private one.
* The verb table is silent on refusal builders and on side-effecting noun names.
* The brief's candidate list is stale (`ensureLease`).
* The 5-to-15-lines guide is impossible for `putBox`.
