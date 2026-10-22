# Security: decisions to look at

Describe decisions here that, in your judgement, could merit closer security review, or could
interact with later decisions to create a security issue. Do not justify why they are, or are not,
concerning; do not predict what might heighten concerns. Instead, in a sentence or so, brief a
security expert who knows what questions to ask.

**Adding an entry.** The agent that made the decision hands it to a `sonnet` subagent with this
file's path, the caution in a sentence or two, the date, and the PR or branch, and commits what
the subagent wrote. The subagent searches the entries for the same mechanism (`grep -n` for its
names), reading only the ones it finds. Where one already says it, the subagent amends that
entry in place (below) and changes no other entry. Otherwise it writes a new dated entry at the top
of *Of Interest*. Either way it keeps the voice above, and returns the lines it changed.

**Amending an entry.** An entry that later work changes is amended in place, never superseded by a
new entry elsewhere. The amendment is marked inline, `amended YYYY-MM-DD (thread)`, for example
`amended 2026-10-21 (b_simplify)`, so a reader sees what stood and what stands now in one place.

**A one-time rename (2026-10-18; extended 2026-10-18, 2026-10-19).** With the Coach's approval, the entries
below had their retired words changed to the reform's cast in one mechanical pass (VOCABULARY.md;
the retired names are in `notes/old_vocabulary.md`), so that a search for a current name finds
the entries that discuss it. Only names moved. A second pass, on the Coach's word "use the modern
terms everywhere; security.md is not history, it's a current advisory for a security reviewer",
finished it: the box's "note" and "public bag" became the sidecar wherever an entry describes
today's box, "erase" of a vault or box became retire, "way in" became wayin, and the
"window" of a lease became the lease. Where an entry once said the vault checks a box's note
(a floor, the host's validators), it now says the sidecar is never checked by the vault, which is
what the code does; the sidecar entry says why. Left as they were: the literal format tags and
stored-key strings that describe what an older version wrote (`safebyok-vault-v2`,
`safebyok-unlock-v1`, `unlock^`), each now marked as an older version's where it could be read as
today's, and the entries that narrate the renaming itself. Old records are not read, and no
entry here promises that they will be. Four statements that `putBox()` retried were corrected,
each marked "amended 2026-10-18". A third pass, 2026-10-19 (the rename pass), moved the names again:
lockbox became box, in stored names too; the store verbs became get, put and del on every layer; retire
became delete; and `VaultError.kind` became `refusalkind`. A fourth, 2026-10-19 (put_wayin): `changePassphrase` and
`addPasskey` became `putWayin`, and the strength test became the strength checker, with the sentences
the renames falsified amended in place, each marked. This leaves the rule above as it was: from here on, an entry is
added or folded into through the subagent, and no other entry changes.

**Names (2026-10-21).** The stored field `vault_id` became `vault_tok` and `unlock_epoch` became `gate_epoch` (`notes/old_vocabulary.md` lists the retired names); the dated entries below keep the names they were written with.

## Of Interest

* 2026-10-22 (thread wire_meta, branch 20261022-wire_meta, commit 43746aff): **over GraphQL, what a refused write learned
  travels in the mutation's response `data`, and a GraphQL error carries `extensions.kind` alone, never a record.**
  Before, a `stale_write` put the winning vault props (both wayins' salts and wrapped vaultKeys: offline-guessing
  material) and the winning box (`box_stored`), and a full vault its `capacity`, in `extensions.meta`, which GraphQL
  servers, gateways and APM tools commonly log. The Coach ruled: move meta out of the error and into the body,
  available on success or failure. `safebyokPutVaultProps` and `safebyokPutBox` now resolve answer types
  (`SafebyokPutVaultPropsAnswer`, `SafebyokPutBoxAnswer`) with `landed`; on a `stale_write` (or a box write's
  `vault_full`) `landed` is false with `refusalkind`, `message`, and `vault_props_stored`, `box_stored` or
  `capacity`. A stored record, sound or damaged, travels as the `SafebyokStoredRecord` JSON scalar, which GraphQL
  does not check; `graphqlVaultDB` reads the body and throws the same VaultError with the same
  `meta`, so the VaultDB layer's `err.meta` is unchanged. Every other refusal still crosses as an error with kind
  only; tests pin that no error's `extensions` carries a record
  (`packages/safebyok-graphql/tests/vault-resolvers.test.ts`, "a write's answer in the body"). Residual: the records
  are now in the response `data`, which a host's response logging can still write down; the README says so.
  The Postgres route recipe and Convex already answer with the record in a body, not an error.

* 2026-10-22 (thread get_vault, PR [#244](https://github.com/mrflip/safebyok/pull/244)): **the vault props record has two shapes,
  and `getVault` reads props and box listing in one atomic step.** (1) `VaultProps` (format
  `safebyok-vault-v6`, unchanged) is checked by the core's Zod schema at every read and write as one of
  two shapes: *gated* (`gate_epoch` 1 or more, a passphrase wayin, a passkey wayin or null) or *gateless*
  (`gate_epoch` 0, `passphrase` and `passkey` both null). A record at a gated epoch with no passphrase
  matches neither, and is refused `damaged_vault` on read and `bad_record` on write. A gateless record
  holds no wrapped vaultKey, so nothing in it can be tried or opened. `VaultDB.ensureVault` first stores
  a vault gateless and refuses any draft that is not; the first gate is written over it by
  `putVaultProps` at `gate_epoch` 1 expecting 0, so of two devices setting the first passphrase at once
  exactly one lands (the conditional write) and the other is refused. The Postgres and Convex adapters
  still refuse any update that does not keep the `vault_tok` and move `gate_epoch` forward. (2)
  `VaultDB.getVault` and `ensureVault` read the vault props and the box listing in one atomic step (one
  Postgres statement, one Convex query or mutation, one IndexedDB transaction), so the two never name
  different vaults as handed back; nothing (the base class, the vault, or an adapter) compares or
  repairs the two afterwards. One narrow case: Postgres's `ensureVault`, when another device's vault
  props land after its statement's snapshot began, returns those props with the listing as of the
  snapshot filtered to their `vault_tok`, so the listing may lag but never names another vault. (3) A
  `putVaultProps` refused `stale_write` carries the vault props standing in `err.meta.vault_props_stored`
  (null for none), read in the same atomic step and checked as a read checks them. That meta holds only
  what a read by the same user would return: ciphertext and visible fields, never secret material.

* 2026-10-21 (thread trust_lines, branch 20261021-trust_lines, PR [#239](https://github.com/mrflip/safebyok/pull/239); amended 2026-10-21 (trust_lines): rebased on main, once stacked on [#225](https://github.com/mrflip/safebyok/pull/225)):
  **threat model, by party.** Storage and the backend are treated as hostile and defended by
  cryptography alone (AES-GCM, with the context bound as additional data). The host app is trusted but
  fallible: its inputs are checked once at the public entry and refused as misuse, and code past that
  boundary does not defend against it, since it shares the JS realm. Other tabs and devices are
  concurrent, not hostile, and are met by conflict detection (revision tokens, `stale_write`,
  `vault_mismatch`). The clock, `Box`, `Wayin`, `Lease` and boxlabel decisions of this thread are
  amended in place in the entries on each. Amended 2026-10-21 (trust_lines, second round): `Box`,
  `Wayin` and `Lease` hold a reference to their Vault and read scope, key deriver, lease length and
  time (the public `vault.now()`) from it, inside that same trust of the host's realm; the opened
  vaultKey is held only in a private field of an opened `Lease`; `vault_key_epoch` is removed from
  every stored record; a box's sidecar is a JSON object (`{}` for none; amended 2026-10-21 (trust_lines), third round: once any JSON value), bound by its key-sorted JSON.

* 2026-10-21 (thread checker, branch 20261021-checker): **one guard is the only caller of a host's
  strength checker, and a checker's `load` runs at every `hello()`.** (1) `guardStrengthChecker`
  (`packages/safebyok/src/passphrase-strength.ts`) is the only code that calls the host's checker.
  `Vault.make` wraps the host's checker once, bound to the vault's own scope. Amended 2026-10-21
  (checker2): the guarded check is the method `vault.checkPassphrase(typed)` (before, the getter
  `vault.strengthChecker`, type `GuardedStrengthChecker`, both gone); it validates its argument (a
  non-string is refused `bad_option`) and resolves `{ strong: true }` or `{ strong: false, reason }`.
  `PassphraseProof.checkStrongEnough()` and `safebyok-react`'s dialog advice both ask it. The guard
  finds a blank passphrase (empty, or only spaces) weak before the host's checker hears it; hands the
  checker a frozen copy of the scope, frozen once at `Vault.make`; and throws a verdict that breaks
  the contract as `bad_option`, and a checker's throw, or a verdict getter's, as `unexpected_error`
  (amended 2026-10-21 (checker2): both were thrown as a `ThrownMistake`, an internal subclass of
  `VaultError`, never resolved as a refusal result, even from the `try` forms; amended 2026-10-21
  (try_forms): `ThrownMistake` is removed, and each is an ordinary `VaultError`, refused like any
  call: the `try` forms (`tryUnlock`, `tryPutWayin`, `tryEnsureLease` by way of `getProof`) resolve
  it as a bad Outcome, `ask.attempt` resolves it, the throwing forms throw it, and `safebyok-react`'s
  dialog meets it with its calm "Something went wrong" notice and reports it to React as it does any
  misuse), carrying nothing (no kind of the host's, `meta`, `cause` or text), because the checker
  heard the passphrase. Misuse family, it is never told to `onBadNews`. (2) A checker may carry an idempotent `load`; every `hello()` runs it,
  through the guard, beside the storage read (amended 2026-10-21 (checker2): `Promise.allSettled` of
  both; before, ahead of it). A load that fails fails the `hello()` as `unexpected_error` with the
  load's throw as `cause`: the load hears no passphrase, so its error may ride. No lease is taken
  up then, but the storage read may have landed in the snapshot, so state may show absent or locked
  rather than opening. Amended 2026-10-21 (checker2): when the read also met bad news
  (`damaged_vault`, `rolled_back`, `identity_revoked`), `onBadNews` is still told it before the
  `hello()` refuses with the load's failure; the first version of the beside-the-read run dropped it
  unheard while the load kept failing. Bad news is never dropped for a failed load, and nothing the
  checker heard reaches the refusal, a log or a `cause`. `zxcvbnStrengthChecker`'s
  load fetches its dictionary chunk, and no longer answers "weak, try again" when the chunk will not
  load; a check whose load fails now throws, which the guard refuses carrying nothing. The Coach: "Late
  checks are dangerous: you want a fundamental thing to break loud and clear."

* 2026-10-21 (thread wayin_rules, branch 20261021-wayin_rules, stacked on [#214](https://github.com/mrflip/safebyok/pull/214)): **the key a create keeps comes out
  of a stored way in, under a proof, as every unlock's does.** Before, `Wayin.seal` unwrapped a
  non-extractable session handle from the way in it had just wrapped, the creating unlock kept that
  handle and used its own freshly generated, extractable vaultKey as the transient for the lease wrap,
  and `putWayin` threw the handle away. Now `Wayin.seal(vault, holder, proof, deviceId, vaultKey)` seals
  and returns only the way in. The creating unlock (`#settleUnlock`, `packages/safebyok/src/vault.ts`)
  writes the drafted vault props, then proves the passphrase against the vault props storage settled
  on, its own or another device's, through the ordinary `wayin.tryOpen(proof)`, which unwraps the
  extractable transient (for the lease wrap, then dropped) and the non-extractable session handle the
  vault keeps. The generated extractable vaultKey is used only to seal the way in, then dropped. So the
  handle the vault keeps is never the extractable one it generated, and one control path serves a create and
  the created-elsewhere race: a `wrong_passphrase` against another device's vault is still refused
  `created_elsewhere`. The cost is two key derivations to create a vault, one to seal and one to open
  as stored. A test pins that after a create the kept key (the wrapping key a new boxKey is wrapped
  under) is non-extractable, and that a create unwraps exactly one extractable transient. Amended 2026-10-21 (trust_lines): the
  non-extractable session handle the create keeps is held in the opened `Lease`'s private field, not by
  the vault (the B2 `lease` entry).

* 2026-10-20 (thread B5, placement, branch 20261019-placement): **a second copy of safebyok loaded
  beside this one (amended 2026-10-21 (b_simplify): no longer refused as such; see (1)), and a handler passed bare is refused rather than ignored.**
  (1) *Amended 2026-10-21 (b_simplify): the special check and its marks are gone (the Coach: "If you
  can't reduce the second loaded copy check to a single one once in the process lifecycle remove it
  altogether"). Nothing is refused with a message about a double load any more, and there is no
  `checkOneCopy`, `one-copy.ts` or `Symbol.for('safebyok.model')` mark. A `Box` or a `Proof` made by
  another copy of safebyok (two versions, or the ESM and CommonJS builds side by side) is refused as
  any foreign object is, by the `instanceof` or schema check that already followed: `Box.make` and
  `vault.openBox` refuse it `bad_record` (a Box is no box record), `Box.seal`'s `over` refuses it
  `bad_option`, and `Proof.parse` (so every unlock) refuses a foreign proof `bad_option` as an answer
  of the wrong shape. The exception: a foreign `PasskeyProof` whose fields read as a passkey answer is
  taken as one, which is harmless, for it is the same answer the host handed in. The vault's private
  sentinel for unread vault props is now a plain module `Symbol`, no longer `Symbol.for`.* What stood
  until then: a `Box` or a `Proof` made by another copy was refused `bad_option`, naming the double
  load and telling the developer to load safebyok once, at `vault.openBox`, `Box.make`, `Box.seal`'s
  `over`, `Proof.parse` (so at `unlock`), `wayin.tryOpen` and `Wayin.seal`. Each class carried a static
  mark keyed by `Symbol.for('safebyok.model')`, the same symbol in every copy, and `checkOneCopy`
  (`packages/safebyok/src/one-copy.ts`) refused an object whose constructor carried the mark but which
  failed `instanceof`. The refusal quoted nothing of what it was handed. Before, such a box read as
  `bad_record` and such a proof as the wrong kind of proof. The Coach's rule then: anything revealing a second
  safebyok should crash the app (the misuse family). This differs from a `VaultError` of another copy,
  which is still a foreign throw (the a_fixes entry below): there the mark was removed; here the mark
  is used only to refuse, never to accept. (2) `vault.hello()` and `vault.ensureLease()` refuse, as
  `bad_option`, anything in place of their options that is not a plain object, an event above all, as
  when the method itself is passed to `addEventListener` or `onClick`; the message names the fix,
  `() => { void vault.tryHello() }`. Before, an event was silently ignored and a handler passed bare
  would reject unheard.
* 2026-10-19 (thread put_wayin, B4, branch 20261019-put_wayin, PR [#208](https://github.com/mrflip/safebyok/pull/208); the sprint contract): **one verb, `putWayin(passphrase, newProof)`, replaces
  `changePassphrase` and `addPasskey`; the host makes a passkey before the call, and the strength
  checker is a contract to answer.** (1) `putWayin` proves with the standing passphrase only (a passkey's
  answer as the proof is refused `bad_option`), as `changePassphrase` and `addPasskey` did. A new
  passphrase as text replaces the passphrase (amended 2026-10-21 (wayin_rules): and removes the
  passkey, writing vault props with `passkey: null`, so a passkey added under the old passphrase no
  longer opens the current vault props; the user adds a passkey again by proving the new passphrase;
  removal, not revocation: a copy of older vault props still opens with it, as before); a passkey's
  answer (`PasskeyAnswer`) puts the passkey, replacing any. The passkey is now made by the host before the call and its answer handed in, so a
  passphrase the vault then refuses leaves a fresh passkey on the authenticator that opens nothing
  (no wrap under it is ever written). The trade: the core holds no UI and calls no host code inside
  the change. A new passkey's salt is checked at the call's door, before any key derivation
  (amended 2026-10-21 (wayin_rules): `checkFreshSalt` in `wayin.ts` is now `checkSaltShape` in `proof.ts`, called once, in
  `newProofOf`; the repeat inside `Wayin.seal`'s passkey keying is gone, so `Wayin.seal` called
  directly no longer refuses a misshapen salt, and such a way in would read as damaged at every later
  unlock. It checks shape only: a `prfSaltB64` that is base64url of exactly 32 bytes, `bad_option`
  otherwise. There is no list of salts and nothing checks freshness; the host mints the salt.) (2) A
  blank new passphrase (empty, or only whitespace) is refused `weak_passphrase` before the host's
  strength checker or any derivation (amended 2026-10-21 (wayin_rules): by `PassphraseProof.checkStrongEnough()`, which
  puts the passphrase to the vault's `strengthChecker`, a public getter on `Vault` (amended 2026-10-21
  (checker2): now the method `vault.checkPassphrase(typed)`; the getter is gone), with a frozen copy
  of the vault's scope; the vault no longer reads `proof.passphrase`). (3) The strength
  checker (`strengthChecker`, type `StrengthChecker`; `src/passphrase-strength.ts`): its contract is
  to answer a verdict (amended 2026-10-21 (checker): the host's checker is called only through
  `guardStrengthChecker`; see the checker entry). A throw from it is refused `unexpected_error` with no `cause`, `meta` or kind
  of what it threw, as it heard the passphrase (amended 2026-10-21 (checker2): thrown as a
  `ThrownMistake`, never resolved as a refusal result; amended 2026-10-21 (try_forms): `ThrownMistake`
  is removed, an ordinary refusal again, resolved by the `try` forms; see the checker entry); a
  checker that answers no verdict is `bad_option`, likewise quoting nothing of what it heard; so is a throw as its verdict is read (a `strong` or
  `reason` getter: amended 2026-10-21, the read now being inside the guard); before, a thrown
  condition passed through as itself, and a non-condition was carried as `cause`. Left out, the default
  `UnchosenStrengthChecker` (amended 2026-10-21 (wayin_rules): now `DefaultStrengthChecker`, an ordinary checker answering
  weak, its reason, shown to the user and the refusal's message, telling the app's makers to choose a
  `strengthChecker`) refuses every passphrase as too weak, and the vault logs once per
  handle, at error level, that a checker must be chosen, the log quoting no passphrase (amended 2026-10-21 (wayin_rules): the
  vault's identity comparison against the default and its once-per-handle log are gone; nothing logs; before,
  `Vault.make` refused a missing one `bad_option`). `zxcvbnStrengthChecker` now answers weak (a
  reason saying to try again) when its dictionary chunk fails to load, instead of rejecting
  `storage_unavailable`: without the dictionary it cannot judge, so it never admits (amended 2026-10-21
  (checker): no longer; its `load` runs at `hello()`, and a failed load fails the `hello()` or, in a
  check, throws and is refused `unexpected_error` carrying nothing; see the checker entry). (4)
  `Wayin.seal(vault, proof, holder, stamp, vaultKey)`, one function where `sealPassphrase`,
  `sealFirstPassphrase` and `sealPasskey` were three, hands back for every seal `{ wayin, sessionKey }`:
  a non-extractable session handle on the vaultKey, one more AES-KW unwrap under the just-made
  wayinKey. Only the creating unlock keeps it; `putWayin` drops it. (amended 2026-10-21 (wayin_rules): `Wayin.seal(vault,
  holder, proof, deviceId, vaultKey)` returns only the way in and unwraps nothing, so no session
  handle comes out of a seal; and it stamps itself: `registered_at`
  from `vault.clock.now()`, the vault's checked clock (amended 2026-10-21 (trust_lines): from
  `vault.now()`, the public method, the wayin holding a reference to its Vault and reading the time,
  scope and key deriver off it; the clock is checked only at `Vault.make`; and it stamps no
  `vault_key_epoch`, the field being removed), and the `device_id` it is handed; the vault's
  `#newStamp` is gone. See the 2026-10-21 (wayin_rules) entry on the key a create keeps.) (5) `putWayin` and `delWayin`
  resolve the vault (they resolved nothing, or a boolean).
* 2026-10-19 (thread slots, B4a, branch 20261019-slots; the Coach's ruling): **the ways in are two slots,
  and only the passphrase proves a change to them.** (1) Stored: vault props hold `passphrase` (a
  passphrase wayin, required) and `passkey` (a passkey wayin, or null) where they held a list of one to
  `MaxUnlocks` (8) wayins, each with a `wayin_id` and a `wayinlabel`. Format `safebyok-vault-v5`; v4 joins
  the older formats, so every stored vault reads `damaged_vault` (no migration before 1.0.0; amended
  2026-10-21 (trust_lines): `safebyok-vault-v6` now, v5 joining the older formats the same way).
  `MaxUnlocks`, `wayin_id`, `wayinlabel`, its validator and the refusals `last_wayin` and
  `too_many_wayins` are gone. (2) Each wrap's ctx is built as before (`cipherCtx(format, scope...,
  vault_id, registered_at, purpose, header)`; amended 2026-10-21 (trust_lines): no longer the vault props' `registered_at`, only the scope and `vault_id` of the vault), its first part now `safebyok-vault-v5`; the header (every
  field but the wrap, keys sorted) is `wayinkind`, `key_deriver_label` and `salt_b64` or `credential_id`
  and `prf_salt_b64`, `vault_key_epoch` (amended 2026-10-21 (trust_lines): no longer in the header), `device_id`, `registered_at`. The passkey's HKDF info is that
  same ctx. The purpose (`vault_key_passphrase_wrapped`, `vault_key_passkey_wrapped`) keeps one slot's
  record from opening as the other's; which records fill the slots, and the `unlock_epoch`, are bound
  into no ctx, as for the list, so storage can put an older record of the same vault in a slot. (3)
  Opening: the vault picks the slot by the proof's kind and calls `wayin.tryOpen(proof)`, so a
  passphrase costs exactly one key derivation (`Wayin.tryOpenAmong`, `openWithPassphrase`,
  `openWithPasskey` and `Wayin.listOf` are gone, and with them the walk over up to eight). A passkey's
  answer to a vault with no passkey refuses `absent_wayin`; one from another credential than the vault's
  refuses `wrong_passkey` (it was `absent_wayin`). (4) Proving: `putWayin(passphrase,
  newProof)` and `delWayin(passphrase)` take the standing
  passphrase only; a passkey's answer handed as the proof is refused `bad_option` before anything is
  read or derived. Before, any wayin proved any change, so a passkey holder could reset the passphrase;
  now a passkey opens the vault but cannot change who may. `addPassphrase` is gone. Consequence: a
  forgotten passphrase can no longer be reset with the passkey, and a passphrase stored damaged cannot
  be replaced. (5) A vault holds at most one passkey: `putWayin` of a passkey's answer replaces the standing one (amended 2026-10-21 (wayin_rules): so does `putWayin` of a new passphrase, which removes it; the old
  credential no longer opens; the same credential again mends a damaged one, with a fresh wrap), and
  `delWayin(passphrase)` removes the passkey, refusing `absent_wayin` when there is none; the passphrase
  can never be removed. Removal is still not revocation. Every change still moves `unlock_epoch`,
  relocking other devices, and is written conditionally on `vault_id` and `unlock_epoch`. (6) Every
  change is proven by the passphrase, so each starts the lease again from now (`#deadlineFromNow()`;
  before, a passkey-proven change kept the standing deadline; amended 2026-10-21 (b_simplify): `#deadlineFromNow()` is removed, and each proof's grant starts the lease again from now inside `Lease.grant`). (7) `snapshot.wayins` is replaced by
  `snapshot.passphrase` and `snapshot.passkey` (summaries: wayinkind, device_id, registered_at, and for
  the passkey credential_id and prf_salt_b64; amended 2026-10-21 (trust_lines): each also carries `vault_id`); still no passphrase salt and no wrap reaches a host.
  (8) `mayBeNewer` tells newer from damaged by `format` alone (it looked at unknown wayinkinds and
  more wayins than `MaxUnlocks`); any change to a stored record bumps `format`. (9) The Convex
  validators, Postgres (`passphrase jsonb NOT NULL`, `passkey jsonb` nullable) and GraphQL
  (`passphrase: SafebyokWayin!`, `passkey: SafebyokWayin`) follow. Postgres and GraphQL used to drop a
  null field on read; they now keep a null cell as a null field, else every vault without a passkey
  would read damaged.
* 2026-10-19 (thread a_sec2, PR [#206](https://github.com/mrflip/safebyok/pull/206)): **the create
  window closed.** A first unlock that creates the vault (`#settleUnlock`'s make path,
  `packages/safebyok/src/vault.ts`) while another device deletes it could leave this device unlocked
  on the deleted vault, holding a lease, until its next read (found in #203's second review). Now
  the make captures a stand-down signal (`#createsStandDown`; amended 2026-10-20 (placement): once `#makesStandDown`, and the signal that stands it down, now `#standDownCreates`, was `#standDownMakes`; behaviour unchanged) just before it writes its vault props; a
  read that finds the vault props in hand deleted or replaced (`#heedRevocation`) aborts it, and an
  aborted make puts no vault props back, so the grant (`#grantLease`) finds its props outrun, takes
  nothing up and writes no lease (or, outrun only during its write, erases the lease it wrote:
  amended 2026-10-21, thread b_fixes); the unlock refuses `vault_locked`. A race test in
  `packages/safebyok/tests/vault/vault-races.test.ts` fails without the fix. Known residue, failing
  safe: a make stood down by the deletion of *another* device's vault refuses although its own vault
  stands (the next read takes it up, the next unlock opens it). Cross-device invalidation in general
  (a device learning of a deletion before its next read) is left to a coming mechanism, a token each
  device authenticates when it joins or creates a vault (TODO.md); until then, a device learns at
  its next read and fails safe there. Also 2026-10-19 (a_sec2): **an older read never rolls the
  vault props back.** A read that began before this device's own change to the ways in landed could
  hand back the older copy and put it over the change's, which the vault then took as a revocation
  and locked. Now a read whose vault props are the same vault at a lower `unlock_epoch` or
  `vault_key_epoch` (amended 2026-10-21 (trust_lines): `unlock_epoch` alone) than those in hand (`isNewerCopy`) neither revokes nor replaces them: storage
  never takes a vault's epochs back (the device mark refuses as `rolled_back` a store that does), so
  such a read is stale by construction.
* 2026-10-19 (thread a_sec2, #206): **no salt or wrapped key in the snapshot.** Since thread B1,
  `snapshot.props`, `vault.props` and `vault.wayins` (as `Wayin` models) carried each passphrase's
  salt and every wrapped vaultKey: everything an offline guess at a passphrase needs, into React
  state, devtools and error reporters. Now `VaultSnapshot.props` and `vault.props` are gone, and
  the snapshot carries summaries of the wayins: `snapshot.passphrase` and `snapshot.passkey` (amended
  2026-10-19, slots: once a `wayins` list of `WayinSummary`) -- `wayinkind`, `device_id`,
  `registered_at`, and for a passkey also `credential_id` and `prf_salt_b64` (amended 2026-10-21 (trust_lines): each summary also carries
  `vault_id`, the wayin's own visible field), which an
  authenticator needs and which open nothing without the passkey. The vault and its models keep the
  full records privately. Tests check that the snapshot's JSON holds no stored salt or wrap. The
  Coach: "yes good call". Amended 2026-10-21 (thread b_fixes): the same holds of a `Wayin` and a
  `Lease` themselves, in any log line or `JSON.stringify`: `Wayin.toJSON()` gives the wayin's
  `summary` (no wrap and no passphrase's salt; a passkey's `prf_salt_b64` stays, as above), and `Lease.toJSON()` every field but `lease_key` and
  `vault_key_lease_wrapped`; each gave its full stored record before. Amended 2026-10-21
  (trust_lines): `Box`, `Wayin` and `Lease` keep their stored record once, privately, behind a
  `record` getter; their own enumerable fields are the visible ones only, and `toJSON()` is those
  fields. Ciphertext, wrapped keys, a passphrase wayin's salt and the leaseKey are on no own field
  and in no JSON or log output, nor is the vaultKey an opened `Lease` holds.
* 2026-10-19 (thread a_sec2, #206): **no proof is kept after an unlock, and this is not tested.**
  The vault keeps no reference to a proof (a `PassphraseProof` or `PasskeyProof`) once an unlock or
  a change to the ways in settles: the proof lives in the call's locals only, and no field of the
  vault or its ask holds one. No test could observe this without depending on garbage collection,
  which would be flaky; the Coach's ruling: "note it in security md, don't write a test we can't
  write".
* 2026-10-19 (thread a_sec2, #206): **`Lease.grant` validates its input.** `Lease.grant(vault,
  holder, vaultKeyPair, askPassphraseAt)` parses `holder`'s `vault_id` and `unlock_epoch` and
  `askPassphraseAt` with `LeaseRecord`'s own Zod checks at entry and lets a bad input throw as
  misuse (the Coach: "run a good zod validator but don't catch"). A deadline that is no number used
  to grant a lease that never opened. Amended 2026-10-21 (b_simplify): `Lease.grant(vault, holder,
  vaultKeyPair)` takes no deadline; it computes its own, `vault.clock.now() + vault.leaseMillis`,
  floored and capped at `FarFuture`, read through the vault's accessors, and still parses `holder`
  with `LeaseRecord`'s checks and throws a Zod error as misuse. It also parses the deadline it
  computes against `LeaseRecord.shape.ask_passphrase_at`, throwing as misuse on a NaN or an
  out-of-range value, so a deadline that is no number is never bound into a lease's wrap or written. The lease reads the handle's public
  `leaseMillis` getter, so a host that `Object.defineProperty`s over the handle's `leaseMillis`
  changes its own lease length, as one overwriting the handle's `clock` already changed every model's
  clock; the vault handle is not frozen. Amended 2026-10-21 (trust_lines): `Lease.grant(vault, standing, vaultKeyPair)`
  takes the Vault object (no `LeaseVaultProps`) and reads scope, `leaseMillis` and the time,
  `vault.now()`, off it, `Math.min(now + leaseMillis, FarFuture)`, so the sentences above on
  `leaseMillis` being overwritable on the handle hold for the lease, the vault not being frozen; its
  deadline rests on the host's clock as read after construction (see the clock entry, amended). The
  granted lease keeps the vaultKey's session handle in a private field (see the B2 `lease` entry).
* 2026-10-19 (thread B2 `lease`, branch 20261019-lease): **the lease is a class, `Lease`, and its
  crypto lives apart from the vault's decisions.** `Lease` (`packages/safebyok/src/lease.ts`) holds
  the lease's fields and its wrap and unwrap; when to grant, when to ask, and every write to the
  device store stay in the vault (`#grantLease`, `#takeUpLease` in `vault.ts`). `Lease.grant(vault,
  holder, vaultKeyPair, askPassphraseAt)` (amended 2026-10-21 (b_simplify): it takes no `askPassphraseAt` now and computes the deadline itself; see the a_sec2 entry above) makes a fresh AES-GCM 256 leaseKey, `extractable: false`,
  usages wrapKey and unwrapKey only, and wraps the vaultKey's extractable transient handle under it,
  bound to leaseCtx; it keeps no reference to either handle of the pair (a test checks that nothing on
  the lease or its record is that key; amended 2026-10-21 (trust_lines): a granted or opened lease
  keeps the pair's non-extractable session handle, the vaultKey, in an ES private field, and none of
  the extractable transient), and writes nothing: the vault puts `lease.record` (once `lease.props`)
  through `deviceDB.putLease`. leaseCtx is unchanged byte for byte (`cipherCtx('safebyok-lease-v1',
  applabel, user_id, vaultlabel, vault_id, unlock_epoch, ask_passphrase_at,
  'vault_key_lease_wrapped')`, pinned by `tests/ctx-bytes.test.ts`), so leases already on a device
  still open. `Lease.make(vault, record)` checks a record through the `LeaseRecord` Zod schema
  (renamed from `Lease`) and refuses one this package does not write, or one naming another app,
  user or vault than its vault's, as `corrupt_record`, quoting nothing of it. `lease.tryOpen(holder)`
  refuses `vault_locked` before any unwrap when the holder's `vault_id` or `unlock_epoch` differ from
  the lease's, or the vault's clock is at or past `ask_passphrase_at`; it then unwraps under a ctx
  rebuilt from the vault's own scope and the holder's `vault_id` and `unlock_epoch` (what the vault
  expects, not the record's own fields), into a non-extractable handle (wrapKey, unwrapKey) (amended
  2026-10-21 (trust_lines): the call is `lease.tryOpen(standing)`, the time read off the lease's Vault
  with `vault.now()`, and it returns a new opened `Lease` holding that handle in its private field). An
  unwrap that fails (a tampered wrap, a moved deadline, a swapped leaseKey) is `corrupt_record`, with
  no cause attached. The vault erases the lease on either refusal, and warns through the logger only
  for `corrupt_record`, as before. The `leaseHours` fit check (a lease ending further off than this
  handle's `leaseHours` allows is discarded) stays in the vault, as `! lease.endsWithin(leaseMillis)`
  before `tryOpen`; `ensureLease`'s renew threshold is `lease.endsWithin(renewMillis)` (amended 2026-10-21
  (trust_lines): `endsWithin(millis)` is now `endsBy(instant)`); the vault holds
  the `Lease` beside the vaultKey in place of a bare `askPassphraseAt` (amended 2026-10-21
  (trust_lines): the vault keeps only its lease, and locking drops it; the opened vaultKey lives
  only in the opened lease's private field and never leaves it: a box wraps and unwraps its boxKeys
  through `lease.wrapBoxKey` and `lease.unwrapBoxKey`, which refuse a lease not opened, or ended, as
  `vault_locked`). **`DeviceDB`'s verbs
  (`getLease`, `putLease`, `delLease`, `getMark`, `putMark`, `delMark`, `delAll`) now resolve an
  `Outcome` and never reject.** `deviceOutcomeOf(verb, body)` (`src/device-db.ts`) turns an adapter's
  failure into `storage_blocked` or `storage_unavailable`, the store's error as `cause`, the message
  naming no scope and quoting no record. `deviceTroubleAsConditions`, moved there from
  `del-damaged-vault.ts`, is the vault's guard on a host's own `DeviceDB`: a throw, or a bad Outcome
  whose `err` is no `VaultError`, is said the same way, and an answer that is no Outcome is refused
  `bad_option`. Unchanged: every abort and outrun check from `a_sec` around the take-up and the grant
  (the take-up's AbortController, the grant standing a take-up down before it writes, an overtaken
  grant erasing its own lease) is where it was, in the vault. Amended 2026-10-21 (thread b_fixes):
  `#grantLease` erases the lease it just wrote not only when an ask's prompt ended during the write
  but also when the vault props it was granted under no longer stand after it (deleted by `del()`,
  made anew, or their ways in changed: a new `unlock_epoch`), and skips the write when that is so
  already; before, a lease written by an unlock or a `putWayin()` racing this same handle's `del()`
  survived the delete until `ask_passphrase_at` (168 h by default). A close alone erases nothing.
  Limit: a `del()` made through *another* handle (another tab) is not seen by this one until it reads
  storage, so this handle's grant racing it can still leave a lease; cross-device and cross-handle
  invalidation awaits a mechanism of its own (each device authenticating a token when it joins or
  creates a vault).
* 2026-10-19 (thread a_fixes); amended 2026-10-19 (a_sec2, #206): **one test for a refusal, and a
  refusal from another copy of safebyok is a foreign throw.** `isVaultError(err, refusalkind?)`
  (`packages/safebyok/src/errors.ts`) is `err instanceof VaultError` plus the kind check, the one
  declared test for a refusal. Every site that branches on a refusal uses it: `outcomeOf`
  (`src/outcome.ts`), the `VaultDB` base's `asStorageTrouble` (`src/vault-db.ts`), the vault's
  bad-news hearing (`#hearBadNews`), `RefusalPolicy.decide` (`identity_revoked` and `rolled_back`
  lock), `isCondition`, and `safebyok-graphql`'s resolvers (`vaultDBOf` and `crossing`). a_fixes
  made it also recognize a `VaultError` of another copy of safebyok loaded beside this one (an ESM
  and a CJS build side by side, each with its own class), by a symbol-keyed mark,
  `Symbol.for('safebyok.VaultError')`, that every constructor set, and an `isMarked` check; that
  mark is gone (a_sec2, #206). The Coach's ruling, 2026-10-19: "Whatever leads to the least amount
  of logic I'm for. It's a weird dangerous situation that should be dealt with brutally." A refusal
  from another copy is now a foreign throw, met as any foreign throw is where it lands: from a
  storage adapter's `do*` hook it becomes `storage_unavailable`, elsewhere `unexpected_error`, its
  message safebyok's own, the throw its `cause`. So it is not told to `onBadNews`, and a foreign
  `identity_revoked` does not lock the vault. An Error that only names itself `VaultError`, as a
  GraphQL or fetch client rebuilds one from a server's JSON, is no refusal either (nor is JSON, a
  `structuredClone` or a plain object), so a backend cannot choose a refusal's kind or the message
  the app shows the user through one; before a_fixes such an error was kept "as it came". safebyok's
  own clients, `safebyok-graphql`'s `graphqlVaultDB` and `safebyok-convex`'s `convexVaultDB`,
  deliberately rebuild a real `VaultError` from their server's kind and message (`new
  VaultError(kind, message, { cause })`), so through them the server (the package's own server code:
  `vaultResolvers`, the Convex component) still chooses both the kind and the message. Tests:
  `packages/safebyok/tests/errors.test.ts` ("isVaultError": false for a `VaultError` of a fresh copy
  of the module made with `vi.resetModules`, and for impostors: a lookalike `Error`, JSON,
  `structuredClone`, plain objects), and the tests of each site above.
  2026-10-19 (thread a_fixes); amended 2026-10-19 (a_sec2, #206): **a call that cannot land never
  prompts.** On a locked vault, `getBox`, `getWhisper`, `useBox` and `delBox`
  (`packages/safebyok/src/vault.ts`, `#openBox`, `#tryDelBox`, `#checkListed`, and a `beforeAsking`
  callback on `#ensureLease`) now refuse `bad_label` (the name's floor, and the vault's own
  `boxlabel` check when nothing is listed under it) and `absent_box` from the box listing in hand,
  after the hello and before `getProof` is asked;
  `putBox` already checked label, sidecar and whisper first. The check runs only when the vault must
  ask; an unlocked vault reads storage for the box as before. The listing (boxlabels, visible
  metadata) is already shown while locked, so refusing `absent_box` without a prompt discloses
  nothing new. Amended 2026-10-19 (a_sec2, #206): the listing in hand is the last word. `#checkListed`
  is now synchronous and refuses `absent_box` from that listing alone, reading nothing (it was async,
  read storage once more with `#refresh()` on a miss, and refused only if that read also showed
  nothing; `ensureLease`'s `beforeAsking` was async too and is now a plain callback). The listing is
  as fresh as the host's `staleMinutes` keeps it, so a box another device stored since the last read
  is refused `absent_box` until the next read. Tests: `tests/vault/vault-lease.test.ts`, "every data
  call, through `ensureLease`", and its test that the vault "refuses absent_box from the listing in
  hand, reading nothing more, though another device stored the box meanwhile ...".
  Amended 2026-10-21 (trust_lines): `bad_label` here is now only the floor every name is held to; the
  host's boxlabel validators gate writes only, so reads and deletes check no more than the floor, and
  an absent name is `absent_box`, not `bad_label`.
* 2026-10-19 (thread B3 rework, box holder): **a box takes the vault props it lies under explicitly,
  as `holder`, and no longer reads `vault_id` and the vaultKey epoch off the vault's published
  snapshot; sealing is split so a store too large is refused before any key is made.** This replaces
  part (5) of the entry above (thread B3, box), whose snapshot-lag reasoning no longer applies.
  (1) `BoxHolder = Pick<VaultProps, 'vault_id' | 'vault_key_epoch'>` (`packages/safebyok/src/box.ts`):
  `Box.make(vault, record, holder)` and `Box.seal(vault, boxlabel, whisper, holder, vaultKey, opts)`.
  The vault passes its private `#vaultProps` at each call, and in `putBox` the same object, read
  once, supplies both the seal's `holder` and the write's expectation (`vault_id`,
  `vault_key_epoch`), so the ctx a box is sealed under and the vault its write is aimed at agree by
  construction, not by timing. `BoxVault` is now only the scope (`applabel`, `user_id`, `vaultlabel`,
  fixed for the handle's life) and the clock. `holder` is copied, frozen, and attached
  non-enumerable like `vault`; a holder missing either field is `bad_option`. (2) Vouching for the
  box being replaced (`over`) opens it under the seal's own `holder`, not the one `over` was made
  under, so the carry-forward of `registered_at` and the sidecar is vouched by the same vault props
  the new box is sealed under. (3) Internally, sealing is `planSeal` and `sealPlanned`. `planSeal`
  (the caller has done the checks) vouches for `over` and settles the sidecar JSON and
  `registered_at`; it makes no key and ciphers nothing. `sealPlanned` makes the fresh boxKey and
  fresh revision, then wraps and ciphers under the rebuilt ctx. Between the two, `putBox` checks the
  whisper plus the kept sidecar against `maxWhisperBytes`, so a store that is too large is refused
  before any key is generated or anything enciphered (a test spies `generateKey` and `encrypt` to
  show neither runs). The whisper is serialized once per put (`whisperBytesOf`). The plan holds the
  whisper's bytes: it is internal, frozen and short-lived, and is never logged, stored or exported
  from the package. (4) `vault.openBox(box)` checks the record first (`bad_record`), then the key in
  hand (`vault_locked`), then re-makes the box under the vault's own props (amended 2026-10-21 (trust_lines): now `vault.decryptWhisper(box)`
  takes the lease first, so a locked vault always refuses `vault_locked`, a malformed record and a call before `hello()` included,
  and only then checks what it was handed (amended 2026-10-21 (fault_kinds): a well-formed record the host hands in that will not decrypt stays `damaged_box`, since storage's damage and the host's cannot be told apart there; a shape failure stays `bad_record`); a record is opened under the lease's `vault_id`, and the earlier `absent_vault`
  refusal of a record handed to a vault not yet made is gone); `box.tryOpen` has no
  `absent_vault` path any more, since a box cannot be made without vault props. (5) A box read from
  storage (in `getBox`, `putBox` and `delBox`) is made only while the vaultKey is in hand: the key is
  checked first, so a call whose storage read answers after a refresh found the vault deleted
  elsewhere refuses `vault_locked`, never `absent_vault` (the fix in commit 96f64d61 of the second
  review). (6) Restacked on thread B1 (proof_wayin, [#201](https://github.com/mrflip/safebyok/pull/201)):
  the vault freezes every vault props record as it takes it up (`frozenVaultProps` in
  `packages/safebyok/src/vault.ts`: a copy, its `passphrase` and `passkey` wayin records and each
  `vault_key_wayin_wrapped` frozen; amended 2026-10-19, slots: once a `wayins` array) at each of the three places it does so (a read in refresh, the
  unlock that creates the vault, a change to the ways in). So the record the vault works from, each
  wayin's `holder` and the `holder` each box is made or sealed under are one frozen object. Amended
  2026-10-19 (a_sec2, #206): `snapshot.props` is gone and the host no longer receives the record at
  all (see the a_sec2 entry at the top of *Of Interest*); a box's `holder` is itself reduced to
  `vault_id` and `vault_key_epoch`, kept as its own frozen copy in each `Box`. Amended 2026-10-21
  (trust_lines): `BoxHolder` is gone, and with it the `holder` and the epoch: a box is made over its
  Vault object and sealed under the `vault_id` of the lease that holds the key (`Box.seal(vault,
  lease, ...)`). `Box`, `Wayin` and `Lease` hold a reference to their Vault and read scope, key
  deriver, lease length and time (`vault.now()`, public) from it; no `BoxVaultProps`, `WayinVaultProps`
  or `LeaseVaultProps` value stands in for it. They remain public exports and check what they are
  handed at their entry.
* 2026-10-19 (thread B3, box); 2026-10-20 (placement): **the stored box is a model class, `Box`, holding a back-reference to
  its vault; sealing and opening moved into it, and a box's enumerable fields are exactly its stored
  ones.** (1) The class (`packages/safebyok/src/box.ts`): the Zod schema once exported as `Box` is
  now `BoxRecord`, the stored contract, unchanged (`safebyok-box-v6`; amended 2026-10-21 (trust_lines): `safebyok-box-v8`). `Box.make(vault, record)`
  validates through `BoxRecord` and refuses `bad_record`, quoting nothing and carrying no cause. The
  record is kept as `box.props`: a copy, frozen, its two `Ciphered` objects frozen too, so a caller's
  later change to its own record reaches nothing in the box; the instance is frozen. `box.sidecar` is
  the parse of `sidecar_json` with a reviver that freezes every object and array as it builds them
  (amended 2026-10-21 (trust_lines): the record holds the sidecar as a JSON object, not text, and a box's record and its
  listing's sidecar are deep-frozen with es-toolkit's `deepFreeze`, now a runtime dependency of safebyok; the hand-rolled
  recursive freeze is gone, and nothing is parsed).
  `vault`, `props` and `summary` are attached by `decorate` (amended 2026-10-20 (placement): in `src/adorn.ts`, once `utils.ts`; it calls `adorn(obj, ckey, val)` per entry, `Object.defineProperty`,
  non-enumerable, non-writable, non-configurable; amended 2026-10-21 (b_simplify): they attach a hidden
  (non-enumerable) property that is writable and configurable, the Coach: "adorn and decorate should be
  writeable and configurable", and every model freezes itself after its constructor attaches them, so
  on a model they are still fixed), so a spread, `Object.keys`, a log line or
  `JSON.stringify` never reaches the vault; `toJSON()` returns `props` (amended 2026-10-21 (trust_lines): the record is kept privately behind a
  `record` getter and `props` is gone; the box's own enumerable fields are the visible ones, and
  `toJSON()` is those fields). 2026-10-20 (placement): `adorn` and `decorate` left the public
  `safebyok/utils` entry point for that internal module, so a host cannot import them; `adorn` hands back
  `val`, and the same pair attaches each model's `vault` and `props` and a proof's secret field. What
  they attach did not change. (2) What a log line of a box
  shows: the visible fields and the two ciphered ones (`box_key_wrapped`, `whisper_ciphered`;
  amended 2026-10-21 (trust_lines): the visible fields only, the ciphertext and wrapped boxKey being on
  no own field). The
  record holds no secret: the whisper is ciphered under a boxKey, the boxKey wrapped under the
  vaultKey, and neither key is in it; it is what the backend already holds. The vault never logs a
  box, and a refusal from opening carries no cause and no meta, and names nothing of the box (no
  label, revision, sidecar or ciphertext). (3) `Box.seal(vault, boxlabel, whisper, vaultKey, {
  sidecar, over })` is the sealing that sat in the vault's `putBox`, the construction unchanged: a
  fresh boxKey from WebCrypto `generateKey` per seal (a test spies `generateKey` and `wrapKey` to
  show one fresh key per seal, wrapped under the vaultKey), a fresh `revision_tok`
  (`crypto.randomUUID`), the whisper's stable JSON ciphered under the boxKey and the boxKey wrapped
  under the vaultKey, both bound to `boxCtx`: the format, the scope (applabel, user_id, vaultlabel),
  the vault's `vault_id`, the purpose, and every visible header field, rebuilt on every seal and open
  and never stored. `registered_at` and the sidecar carry forward from `over` only when `over` opens
  under the vaultKey, so a sidecar planted in storage is never sealed into a revision that reads
  clean. Inputs are checked at the door (`bad_whisper`, `bad_option`, `bad_label`, `absent_vault`),
  quoting nothing; the seal ends in `Box.make`, so what it returns has passed the record schema, and
  it writes nothing. (4) `box.tryOpen(vaultKey)` (an Outcome; `open` throws) is the old
  `decipherBox`: a vaultKey that is no CryptoKey is `bad_option`; a box whose `vault_key_epoch` is
  not the vault's is `damaged_box`; the boxKey is unwrapped non-extractable and decrypt-only under
  the rebuilt ctx; WebCrypto's own failure is dropped, with no cause, and said as `damaged_box`; the
  plaintext is parsed and validated as a whisper, else `damaged_box`. Nothing partial is returned.
  Amended 2026-10-21 (trust_lines): the key is no longer handed to a box. `Box.seal(vault, lease, ...)` and
  `box.open(lease)` wrap and unwrap the boxKey through `lease.wrapBoxKey` and `lease.unwrapBoxKey`,
  which refuse a lease not opened, or ended, as `vault_locked`; `box.open(lease)` also refuses
  `vault_locked` when the box's `vault_id` and the lease's differ, and `Box.seal` when `over` is of
  another vault. There is no epoch on a box, so the epoch refusal above is gone. A
  box re-made for another scope, another `vault_id` (a vault made anew) or another label, or with any
  visible field altered, refuses; a test goes field by field. (5) What a box reads off its vault is
  `BoxVault = Pick<Vault, 'applabel' | 'user_id' | 'vaultlabel' | 'vault_id' | 'vault_key_epoch' |
  'clock'>` (amended 2026-10-21 (trust_lines): `BoxVault` is a slice of the Vault object itself, its
  scope and `now()`, with `vault_id` taken from the lease that holds the key, so the snapshot-getter
  sentences below no longer apply). The vault gains read-only getters `logger`, `clock` and `keyDeriver`; `vault.clock` is
  the vault's checked clock, so a box's reading that fails drops the vaultKey as the vault's own
  readings do (amended 2026-10-21 (trust_lines): `vault.clock` is no longer exposed, a box reads the time with the
  public `vault.now()`, and a later bad reading drops nothing; see the clock entry). `vault_id` and `vault_key_epoch` come off the vault's snapshot getters, which can lag
  the vault's private vault props only inside a first unlock's awaits, before any key is in hand;
  `putBox`'s expectation and the seal read them in one synchronous run. A stale read can only make a
  box fail to open. (6) `vault.openBox(box)` and `tryOpenBox` take a `Box` or a `BoxRecord` and
  re-make it under this vault (`Box.make(this, props)`), so it opens under this vault's scope and id
  whatever vault the box was made for; they need the key in hand (`vault_locked` otherwise), ask for
  no proof and read no storage, re-check the key after the open, and tell `onBadNews` of
  `damaged_box`. (7) `vault.boxes` entries are copies, frozen through (the sidecar re-parsed with the
  freezing reviver; amended 2026-10-21 (trust_lines): deep-frozen with es-toolkit's `deepFreeze`, not re-parsed) when the vault takes a listing up, so nothing a host is handed shares an object
  with what the vault holds. This closes the note, in the entry on the vault's private fields below,
  that a summary's sidecar was not deep-frozen, and the A3 review's note that summaries' sidecars
  were shared with the vault's private listing.
* 2026-10-19 (branch 20261019-proof_wayin, [#201](https://github.com/mrflip/safebyok/pull/201)); 2026-10-20 (placement): **what a host hands in to prove itself is
  checked at the vault's door into a `Proof`, and a wayin opens only under one.** (1) `Proof.parse`
  (`packages/safebyok/src/proof.ts`) turns a passphrase string, or a passkey's answer `{ credentialId,
  prfSaltB64, prfBytes }` (typed `PasskeyAnswer`), into a `PassphraseProof` or `PasskeyProof`. The secret
  (the passphrase; the 32 PRF bytes) is a non-enumerable, non-writable, non-configurable property of a
  frozen instance (amended 2026-10-21 (b_simplify): `adorn` attaches it writable and configurable, and the proof's constructor then freezes the instance, so it is still fixed), and `toJSON()` returns `{ kind }` only, so JSON, `Object.keys`, a spread and Node's
  inspect do not show it. The passkey's PRF bytes are held by reference to the host's `Uint8Array`, not
  copied. The vault itself still reads `proof.passphrase` to give a new passphrase to the host's strength
  test (amended 2026-10-21 (wayin_rules): it does not; `PassphraseProof.checkStrongEnough()` does it). (2) `proof.wayinKeyFor(wayin)` derives the wayinKey, reading only the wayin's `salt_b64`
  (passphrase) or `wayinCtx` (passkey). (3) A `Wayin` (`PassphraseWayin`, `PasskeyWayin`) is made by
  `Wayin.make(vault, record, holder)` (amended 2026-10-21 (trust_lines): `Wayin.make(vault, vaultId, record)`), which re-validates the stored record through its Zod schema
  (refusing `damaged_wayin`), freezes a copy as `props`, and is itself frozen (amended 2026-10-21 (trust_lines): the copy is kept
  privately behind a `record` getter, on no own field). Its wayinCtx binds the
  vault's scope (the vault's public applabel, user_id and vaultlabel getters) and the `vault_id` and
  `registered_at` of the `holder`, the vault props record it was made from, passed explicitly because the
  vault's public fields lag its private state until it publishes (amended 2026-10-21 (trust_lines): the scope and the `vault_id` alone, the
  wayin holding that `vault_id` as a visible field of its own; the vault props' `registered_at` is no longer bound, so an
  altered one no longer stops a wayin opening, and `VaultIdentity` and the `holder` are gone). 2026-10-20 (placement): the
  constructors of `PassphraseWayin` and `PasskeyWayin` are private; a wayin is made only by `Wayin.make`
  or `Wayin.seal`, which reach them through a static keyed by a module-private symbol (`madeFrom`), so
  no exported name builds a wayin from a record the Zod schema has not checked. This is TypeScript
  privacy only: JavaScript can still call `new`, as for `Box`, `Lease` and `Proof`. (Amended 2026-10-21
  (b_simplify): the constructors are ordinary public constructors that take a record already checked,
  and `madeFrom` is gone; `Wayin.make`, which checks a stored record against its schema, and
  `Wayin.seal` remain the documented ways to get one. The Coach: "This is paranoia. No, just write
  normal code.") `isDamaged()` (another vaultKey epoch
  than the holder's, or a salt of a length its kind never writes; amended 2026-10-21 (trust_lines): the
  epoch is gone with the field, and a salt of the wrong length alone) is checked before any derivation.
  (4) `wayin.tryOpen(proof)` returns an Outcome and never throws: a proof of the wrong kind is
  `bad_option`; a passphrase wayin made by another key deriver is `unknown_key_deriver`, and a damaged one
  `damaged_wayin`, each before deriving; a key deriver that throws anything but a VaultError becomes
  `unexpected_error` with the throw as `cause`, and nothing is logged. (Amended 2026-10-19, slots:
  `Wayin.tryOpenAmong`, a search across a list of wayins, is gone; the vault picks the slot by the
  proof's kind and calls `wayin.tryOpen(proof)`.)
* 2026-10-19 (branch 20261019-outcome_adapters): **a refusal whose source cannot have quoted a record now
  carries that source as its `cause`, and `not_permitted` can come from the host and the driver.**
  (1) `convexVaultDB` (`refusing`, `safebyok-convex/src/convex-vault-db.ts`): a `ConvexError` whose
  `data` is `{ kind, message }` with kind `identity_revoked`, `not_permitted` or `vault_full`
  (amended 2026-10-21 (store_rulings, #217): no longer `vault_full`, see the Convex component entry
  below) becomes a VaultError of that kind and message with the `ConvexError` as `cause` (before: nothing of
  it, through `Sanitizer.refusalFor`). Its text is `[CONVEX M(<function>)] <message> Called by client`
  and its data was written by safebyok's server or the host's `getUserId`: function name, request id
  and that data, never the call's arguments. Every other Convex failure (`storage_unavailable`)
  still carries nothing of Convex's error, since a dev deployment's validator error quotes the
  arguments. Residual: a host that puts something sensitive in its own `ConvexError` data sees it
  ride as the cause. `SafebyokErrorKindVals` gains `not_permitted`: `getUserId` may throw
  `ConvexError({ kind: 'not_permitted', message })` to refuse a signed-in user (locks nothing) or
  `identity_revoked` (locks the vault). (2) `graphqlVaultDB` (`refusalOf`, `safebyok-graphql/src/graphql-vault-db.ts`):
  a server refusal with `extensions.kind` becomes the VaultError with the client-side GraphQL error
  as `cause` (before: none); it holds the calm message, `kind`, path and locations, what the
  server's `crossing` already limits the wire to. A GraphQL error with `extensions.code`
  `FORBIDDEN` (a host's auth layer) is now `not_permitted` with a fixed message and that error as
  cause; `UNAUTHENTICATED` stays `storage_unavailable` on purpose (VAULTDB.md 5.5: a token expired
  mid-refresh is a passing fault, and `identity_revoked` would lock the vault). (3) `vaultResolvers`
  (`vaultDBOf`, `vault-resolvers.ts`): a VaultError thrown by the host's `vaultDBFor` of kind
  `not_permitted` or `identity_revoked` now crosses to the browser as it is, kind and message (the
  host chose the message); any other throw, VaultErrors of other kinds included (`postgresVaultDB`'s
  `bad_option` naming its setup), still crosses as a generic `bad_option`, its own message kept on
  the server as cause. (4) `postgresVaultDB` (`sent`, `safebyok-postgres/src/postgres-vault-db.ts`):
  a driver error with code `42501` (insufficient privilege, or a row-level security WITH CHECK
  violation) is now `not_permitted` with the driver's error as cause, not `storage_unavailable`.
  That cause may quote the statement's parameters (`query`/`params` on a PGlite or pg error) as
  before, and stays on the server: the README route recipe and the resolvers send only kind and
  message (amended 2026-10-21 (store_rulings, #217): the route recipe now sends a refusal's `meta`
  whole as well, only `box_stored` or `capacity` from a `VaultDB` verb; the `cause` still stays). An RLS policy that hides rows (USING) refuses nothing: Postgres filters them, so a vault
  reads as absent and a write over a hidden row as `stale_write`; only a refused insert or a
  missing privilege becomes `not_permitted`.
* 2026-10-19 (thread A6, getproof); 2026-10-19 (a_sec, #203): **`lockLanded`: a `lock()`, `close()` or `del()` landing while a
  prompt is up aborts the ask's `AbortController`, and the lock wins over an `attempt()` under way.**
  Every waiter on the ask is refused `vault_locked` at once and `ask.lockLanded` settles, so the
  dialog closes; an `attempt()` after that refuses `vault_locked` without reading storage or deriving
  a key. An attempt already under way is stood down in `#grantLease`, which asks the signal after the
  vault props are checked, again after the vaultKey is wrapped under the new leaseKey, and again
  after `putLease`: before the write it installs no key and writes no lease; if the abort came during
  the write it erases the lease it just wrote (`delLease`), so the lock holds across a reload; either
  way `#vaultKey` is not set (amended 2026-10-21 (trust_lines): there is no `#vaultKey` field; the
  vault takes up no opened lease). The grant erases a lease it wrote in the same way when, after the
  write, the vault props it was granted under no longer stand (amended 2026-10-21, thread b_fixes;
  the B2 `lease` entry above has it). This follows thread A3's take-up `AbortController` pattern (no
  counters). The signal covers only `lock()`, `close()` and `del()`: other relocks
  (`identity_revoked`, `rolled_back`, a moved `unlock_epoch`, the lease expiring) do not land on the
  prompt, and `unlock()` outside a prompt keeps its earlier behaviour (a lock during it does not stop
  it; TODO.md's lock-timing scenario 1, for the policy session). Starting over from the dialog
  (`vault.del()`) lands as a lock and closes the dialog.
  Amended 2026-10-19 (a_sec, #203; replacing the earlier statement that an attempt under way after
  Cancel may unlock the vault afterwards): an ask's answer, whatever it is, now stands down every
  attempt still under way on that ask. `Ask` holds a second `AbortController` (`#over`), aborted by a
  lock landing and by the answer settling (before any waiter hears the answer), and that is the
  signal the attempt's unlock checks before the lease wrap, before the lease write and after it. So an
  attempt still running after Cancel, or a second submit's attempt still running after the first
  answered `unlocked`, unlocks nothing, and a later `lock()` is never undone by it. `lockLanded` is
  still settled only by a lock (the first controller). An attempt after the answer refuses
  `vault_locked` without trying. Before, once answered, the ask was no longer tracked, so a `lock()`
  after a Cancel could be followed by the attempt finishing and leaving the vault unlocked with a
  lease. Edge: an answer landing exactly while an attempt is writing its lease under `lease_ending`
  erases that lease (and so the one it overwrote), while the key already held in memory stays until
  its deadline. An overtaken attempt stands down any lease take-up (`#standDownTakeUp`) as it erases
  the lease it wrote, so a hello that read that lease in between takes nothing up.
* 2026-10-19 (thread A6, getproof); 2026-10-20 (placement): **`Ask`: one per prompt, with one shared answer, and its
  `attempt(proof)` runs the same unlock body as `unlock()`** (amended 2026-10-19, slots: it once took
  `{ wayinId? }`, an aim at one wayin, and `unlock()` likewise). `Ask`
  (`packages/safebyok/src/ask.ts`; `Ask.raise`, the static that makes an `Ask` and hands it to the host's
  `getProof`, is off the public surface since 2026-10-20 (placement): it is keyed by a symbol
  (`raiseAsk`) that no entry point exports, so only the vault raises a prompt and a host only answers
  the `Ask` it is handed) owns `why`, the vault handle,
  `attempt`, `lockLanded` and the one answer: every call that needs the vault while a prompt is up
  awaits that same answer, so there is never more than one prompt. `attempt` proves against the vault
  props as storage holds them now (a refresh first); a wrong passphrase is learned from the wayin's
  decrypt failing, never a comparison. The ask hands the dialog the live vault handle (`ask.vault`),
  whose public surface is the host's anyway. In `safebyok-react`, the dialog groups `attempt`'s
  refusals as the Contract does (`attempt-refusals.ts`): wrong passphrase or passkey, weak passphrase
  and wayin problems are shown in place; `created_elsewhere` as advice; `vault_locked`,
  `storage_unavailable` and any refusal not named close the dialog, answering `declined`; misuse and
  anything that is no `VaultError` go to the dialog's error boundary (reported through React's
  `onCaughtError`, the page untouched), whose Close answers `declined`.
* 2026-10-19 (thread A6, getproof): **`Vault.make` takes `getProof`, the host's method that asks the
  user for a proof, and every data call now goes through `ensureLease()` to it.** `putBox`, `getBox`,
  `useBox` and `delBox` call `#ensureLease()`, which, when the vault is locked, absent or its lease
  ending, hands an `Ask` to `getProof` and waits. The host's `getProof`, and the dialog it shows,
  handle the passphrase. (1) Whatever `getProof` throws, or its promise rejects with, becomes kind
  `unexpected_error` (misuse) with the throw as `cause`; it is never logged, never told to
  `onBadNews`, never put in a message. (2) An answer that is not one of `'unlocked'`, `'declined'` or
  `'carry_on'` is refused `bad_option` without quoting the answer (a buggy `getProof` could hand back
  the passphrase); `'carry_on'` is accepted only when the ask's `why` is `lease_ending`. (3) With no
  `getProof` every ask is `declined` and the call refuses `vault_locked`, as before. (4) After
  `'unlocked'` or `'carry_on'` the vault still checks that a lease stands (`#checkUnlocked`), so a
  `getProof` that lies, or a lease that ended while the prompt was up, still refuses `vault_locked`.
  (5) `putBox` validates its whisper, boxlabel and sidecar before it asks, so a call that cannot land
  never prompts. (6) In `safebyok-react`, `VaultProvider` is the default `getProof` (its
  `PassphraseModal`), held by a ref as `onBadNews` is, and gated per vault so a vault the provider
  let go asks no one. It shows the dialog only while `navigator.userActivation.isActive` is not
  `false` (true where the browser does not say), so a timer's or background call is answered
  `declined` unasked, or `carry_on` under a lease ending, rather than popping a dialog the user did
  not ask for. Amended 2026-10-19 (a_sec, #203): a vault the provider has let go tells no handler and
  asks no one. The provider's refs to the host's `onBadNews` and `getProof` now move in passive
  effects, not layout effects (replacing "layout effect" in the next entry); since React runs every
  passive cleanup before any passive effect, the effect cleanup that closes the old vault's gate
  always runs before the next user's handlers are installed, closing a sub-frame window in which the
  last user's news (with a boxlabel in `meta.box_listed`) or ask could reach the next user's handler.
* 2026-10-19 (thread A5, react_over_class): **`VaultProvider` holds `onBadNews` in a ref, defers its
  first `hello()` a microtask, and throws `Vault.make`'s refusal from the effect.** (1) The provider
  hands `Vault.make` one stable teller that calls whichever handler the last committed render passed
  (updated in a layout effect), so a handler written inline makes no new vault. Bad news (a
  `VaultError`, never secret material) may therefore reach a handler from a later render than the one
  that made the vault; with no handler the teller does nothing, as `Vault.make`'s own default (null)
  does; the vault still keeps a handler's throw as `trouble`, as before. A handler that is anything
  but a function (or none) is passed to `Vault.make` as it came, which refuses it `bad_option`.
  (2) The provider's first `hello()` runs one microtask after the effect that makes the vault, and is
  skipped if the provider has let that vault go by then. StrictMode's development rehearsal makes a
  vault and closes it in the same task, so the rehearsed vault never subscribes or reads storage (a
  test counts `subscribe`, `getVaultProps` and `getMark`: one each); `Vault.make` is inert, so the
  rehearsed handle holds nothing. (3) `Vault.make`'s throw (misuse, `bad_option`) is thrown from the
  effect itself, which React delivers to the nearest error boundary as the very `VaultError`, rather
  than held in state and rethrown in render; a `hello()` refused as misuse, or with a value that is no
  `VaultError`, is still held and thrown in render. (4) `useOpenError().openError` is what the
  provider's own `hello()` was refused with while the vault is still `opening` (a condition or bad
  news), cleared once it opens; the snapshot's `trouble` is the latest bad news on any read, never a
  condition; a damaged record is both, the very same error object. `retryOpen()` and the re-hello
  after `delDamagedVault()` call `vault.tryHello({ staleMinutes: 0 })`, a fresh read of storage.
* 2026-10-19 (branch 20261019-fields_and_make); 2026-10-19 (branch 20261019-proof_wayin, #201): **`Vault.make` takes a host function, `onBadNews(news)`,
  called with every `bad_news` refusal.** The family (`damaged_vault`, `rolled_back`,
  `identity_revoked`, `newer_format`, `damaged_box`, `damaged_wayin`) is told synchronously, before
  the public call's promise settles, for each refusal a public vault call meets; also for bad news a
  background storage read or a write's catch-up meets (which has no caller), and once per box a
  listing newly shows damaged (a `damaged_box` `VaultError` carrying `meta.box_listed`, the
  DamagedBox: its boxlabel and `revision_tok`). Each error object is told once (a `WeakSet`). The
  handler is never awaited; what it throws, or its promise rejects with, becomes the vault's
  `trouble` (a `bad_option` `VaultError` whose `cause` is the host's thrown value) and goes to the
  vault's logger (`error`) and the platform's `reportError`. It cannot change what the caller gets.
  The news carries no secret material; `meta.box_listed` carries a boxlabel, which the vault never
  quotes in a message (a host's validators may admit any text) but does carry in meta, as
  `meta.box_stored` does (see the 2026-10-19 (returning) entry). 2026-10-19 (#201): a read of the vault props that finds a wayin
  `isDamaged()` tells `onBadNews` a `damaged_wayin` news whose `meta.wayin_listed` is that wayin's
  summary (no salt of a passphrase, no wrap), once per distinct stored record; the read still succeeds
  and the other slot's wayin opens as before.
* 2026-10-19 (branch 20261019-vault_class); 2026-10-19 (branch 20261019-fields_and_make): **the vault's in-memory state, the vaultKey among it,
  lives in ES private fields.** `Vault` (`packages/safebyok/src/vault.ts`) is now a class, and
  `Vault.make(opts)` returns an instance; its state used to live in the closure of `make`. Every
  piece of it -- the vaultKey in hand, the vault props, the device mark, the stores, the logger,
  the clock, the expiry timer -- is an ES private field (`#vaultKey` and so on), not a TypeScript
  `private` one, which is an ordinary property at runtime: `vault['vaultKey']`, `Object.keys(vault)`,
  `JSON.stringify(vault)` and a host's logging of the handle would all reach it. An ES private field
  is reachable only from code inside the class body, as the closure's variables were, so nothing
  outside the class, a host's script included, can read the key off the handle. The public methods
  are arrow-function fields bound to the instance (so `useSyncExternalStore(vault.subscribe,
  vault.getSnapshot)` and handing a method on alone work); they hold no secret and reach the state
  only through the class body. The constructor is private: `Vault.make` is the only way to make
  one, and it parses every option (`parseMakeVaultOpts`, `packages/safebyok/src/vault-opts.ts`)
  before anything else runs. Where to look: that no field holding key material is declared without
  `#`, and that later threads, which pull methods out into model classes holding a `vault`
  back-reference, do not widen the state into public fields to reach it. 2026-10-19
  (20261019-fields_and_make): the public fields (`state`, `boxes`, `passphrase`, `passkey`, `capacity`,
  `askPassphraseAt`, `trouble`, `vault_id`, `unlock_epoch` and the rest) are getters with no setter,
  each reading the frozen snapshot that one private `#settle()` publishes; the snapshot, its arrays,
  their entries and `capacity` are `Object.freeze`d (a box's sidecar JSON inside a summary is not
  deep-frozen; amended 2026-10-21 (trust_lines): it is, by es-toolkit's `deepFreeze`, as the box entry says). The vault never reads its own state back through a public property, only through
  `#` fields, so a host writing over a handle's property (`hello`, or shadowing `leaseMillis` with
  `Object.defineProperty`) changes nothing inside the vault; a test pins this. 2026-10-19
  (20261019-proof_wayin, #201); amended 2026-10-19 (a_sec2, #206): `vault.props` and `vault.wayins` exposed the stored
  vault props (frozen) and the `Wayin` instances to the host, wraps included. Now `vault.props` and
  `VaultSnapshot.props` are gone, and the snapshot's `passphrase` and `passkey` are summaries (2026-10-19,
  slots; once a `wayins` list of `WayinSummary`): no passphrase salt and no wrapped vaultKey (a
  passkey's summary carries its `credential_id` and `prf_salt_b64`); see the a_sec2 entry at the top of *Of Interest*. The vault also exposes
  `keyDeriver`, `logger` and a checked `clock` as read-only getters, which the wayin models read.
  Amended 2026-10-21 (trust_lines): the vault has no `#vaultKey`. The opened vaultKey is held only in a
  private field of an opened in-memory `Lease`, and the vault keeps only its lease, so locking drops
  it; the key never leaves the lease (the B2 `lease` entry). "Where to look" becomes: no key material
  is held outside that field. `Box`, `Wayin` and `Lease` read scope, key deriver, lease length and the
  time off the Vault object, the time through the public `vault.now()`, `clock` being no longer exposed.
* 2026-10-19 (branch 20261019-softlock_gone, on PR #189): **the rotation schema is removed; no
  `rotateVaultKey` was ever built.** The vault props' `prior_vault_key` (the previous vaultKey wrapped
  under the current one), its `PriorVaultKey` schema and the `priorFits` refinement (a prior exactly
  one epoch below from epoch 2 on, none at epoch 1) are gone from the core and the Convex, Postgres
  and GraphQL adapters' schemas, and the vault props moved to `safebyok-vault-v4` (2026-10-19, slots: and on to `-v5`). That tag opens
  every wayin's wrap ctx, so v3 wayins no longer open; a stored v3 record reads as `damaged_vault`
  (never `newer_format`), `delDamagedVault` clears it, and nothing migrates. `vault_key_epoch`
  stays on every record, reserved at 1 and never written otherwise by safebyok, but the schema still
  admits any positive epoch on vault props and checks none against a prior. It remains bound into each
  wayin's HKDF info / wrap ctx and held equal to the vault props', so storage cannot raise it and
  still have a wayin open, and the rollback check still refuses vault props at a lower
  `vault_key_epoch` than the device has seen. A box lists as under the held key only when its
  epoch equals the vault props'; any other lists as damaged. Amended 2026-10-21 (trust_lines):
  `vault_key_epoch` is removed from every stored record, write expectation and encryption ctx, with
  every check on it (the rollback check, the wayin and box epoch checks, the `putBox` expectation);
  the formats are `safebyok-vault-v6`, `safebyok-box-v8` and `safebyok-mark-v5`, and an older vault
  reads as `damaged_vault`, never `newer_format`. The vaultKey never changes today, and a vault made
  anew has a new `vault_id`, bound into every box. A rotation will need to add an epoch back, with its
  checks.
* 2026-10-19 (branch 20261019-delete_revision, on PR #177); 2026-10-19 (branch 20261019-no_clear): **`VaultDB.delBox` now takes the
  revision the device read, and storage reports what it removed; the base class takes that report
  as untrusted storage input.** The expectation is `{ vault_id, revision_tok }` (null for a
  box listed as damaged with no readable revision); `delVault` and `delDamagedVault`
  keep the vault-only expectation. The arbitration is unchanged: the adapter compares only
  `vault_id` and removes whatever box stands under the boxlabel, in one atomic step, so a
  deletion within the right vault still wins over any write; the revision never refuses. It only
  lets the adapter answer `deleted` (the revision named; for null, a record holding none that
  reads as one, compared as the listing reads it), `deleted_other` (another record, for instance
  one written over the box meanwhile) or `absent`; a vault mismatch is `null`, thrown as
  `stale_write`. Each adapter reads that answer from the same atomic step as the delete (Postgres
  `DELETE ... RETURNING`, one Convex mutation, one IndexedDB transaction, one synchronous turn in
  `localVaultDB`, the GraphQL server's reply), never a second storage call. The base class keeps
  only the `outcome` field, through the same `writtenBack` step `putBox` uses, and refuses
  anything else as `corrupt_record`, saying the deletion may have landed and quoting nothing.
  The vault's `delBox()` honors `deleted_other` and warns through the host's logger, naming
  neither revision nor boxlabel; the result stays void. Honoring and warning, rather than refusing
  as stale, awaits a Coach's confirmation. Amended 2026-10-19 (20261019-no_clear): `putBox()` no
  longer deletes first and logs no `deleted_other` of its own; a store is always one conditional
  `putBox`. A box listed damaged that names a revision is written over in that one write; one
  that names no revision is refused as `damaged_box`, writing nothing, its message telling the
  user to `delBox()` it first. This closes the race inside `putBox()` (A deletes and writes;
  B deletes A's write and writes; neither throws), and the gap between the two calls in which a
  refused write could say nothing was written after the delete had removed a record. The race
  still runs through an explicit `delBox()`: both devices list the box damaged with
  `revision_tok` null; A calls `delBox()` and then `putBox()`; B, its listing still stale,
  calls `delBox()` naming null and removes A's fresh write. B is warned only through the host's
  logger, as `deleted_other` with `damaged: true`, because a deletion within the vault wins over
  any revision. That stays the stated residual until the tombstone rework. Nothing stored
  changes.
* 2026-10-19 (returning); 2026-10-21 (thread C1, putbox_store): **`VaultDB.putBox` now resolves the box as storage holds it after
  the write lands, and the base class takes that answer as untrusted storage input.** Each
  adapter's `doPutBox` hands the box back from the same atomic step as the conditional
  write (Postgres `RETURNING`, the Convex mutation's return value, a read inside the same
  IndexedDB transaction or `localVaultDB` synchronous turn, the GraphQL mutation payload), never a
  second storage call, so the compare-and-write stays one event. The base class holds the answer
  to the check `getBox` makes (the Box schema, and the boxlabel matching the one written)
  and refuses a malformed one as `corrupt_record`; its message says the write may have landed and
  quotes nothing of the record, and its cause is the inner `corrupt_record` refusal, which quotes
  nothing either. No stored shape changed, and the vault does not yet use the returned value;
  `putBox` still refreshes after its write.
  2026-10-21 (C1): a refused write now answers from that same atomic step too, and the
  refusal carries what stands. `putBox(scope, expected, box)` (amended 2026-10-21 (store_rulings, #217): it took `opts?`) is one conditional write per
  adapter (Postgres: one statement, an UPDATE whose SET is `CASE WHEN revision_tok = $read THEN
  new ELSE own`, or an INSERT ... ON CONFLICT DO UPDATE no-op, each `RETURNING` the row that
  stands, so the winner reported is the latest committed, locked row and not the statement's
  snapshot; Convex: one mutation; IndexedDB and `localVaultDB`: one transaction or synchronous
  step; GraphQL: the server's VaultDB). When the standing box is not the one expected, the write
  is `stale_write` and `err.meta.box_stored` is the whole stored box record, its wrapped boxKey
  (`box_key_wrapped`) and ciphered whisper (`whisper_ciphered`) included, held by the base class to
  the check `getBox` makes: a record that fails becomes a `DamagedBox` (`{ boxlabel, damaged: true,
  revision_tok }`), and nothing standing is `null`. The Coach's intent: it comes in as a read, so
  the host can choose (open it and merge, or overwrite naming its revision) with no second round
  trip. The ciphertext and wrapped boxKey are under the vault's random vaultKey, not a passphrase-derived
  key, so neither is offline-guessable, and it is what a `getBox` by the same signed-in user
  returns. What it changes: this is a refusal's `meta` now holding ciphertext of the winning box
  (never plaintext, never key material in the clear), and it crosses wires: GraphQL's
  `extensions.meta.box_stored` (amended 2026-10-22 (wire_meta): no longer; over GraphQL it is the `box_stored` of
  `safebyokPutBox`'s answer in the response `data`, see the 2026-10-22 wire_meta entry) and the Postgres route recipe's
  `refusal.box_stored`; the error's
  `cause` still never crosses. A host that logs or reports a whole `VaultError` including `meta`
  now logs that ciphertext. An audit of where refusal meta can leak (logs, error reporters, a host
  serializing errors) is the Coach's, later. (An earlier line here said a refused write
  carries no record; it did until this change.) Two refusals split off what was `stale_write`.
  `vault_mismatch` (condition) is a box write whose vault props (`vault_id`, `vault_key_epoch`; amended 2026-10-21 (trust_lines): `vault_id` alone) no
  longer stand; it carries no meta, since vault props (salts, wrapped vaultKey) never ride on a
  refusal (the a_sec2 ruling). `invalid_box` (misuse) is a box the base class would not build,
  refused before storage sees it, which the vault relabels `bad_record`; neither message quotes the
  box. `putBox` also took `opts.signal`: an abort before storage answers resolved
  `storage_unavailable` with the signal's reason as `cause`, and a write already sent might still
  land (the base stopped waiting; the adapter's write was not cancelled), so a later read showed
  whether. Superseded, amended 2026-10-21 (store_rulings, #217): `VaultDB.putBox(scope, expected,
  box)` takes no signal any more (the Coach: "Rip it out"), so there is no abandon ->
  `storage_unavailable` path and no "may have landed" from a caller's abort. No storage call can be
  abandoned midway by the caller; timeouts are a later thread's (D1).
  Amended 2026-10-21 (store_rulings, #217): **Postgres box writes lock, and "landed" is the write's
  own condition.** Each box write locks the vault row `FOR SHARE`, then the box standing under the
  boxlabel `FOR UPDATE` (the same lock order as a vault deletion, vault row first), writing nothing
  to that box row by the lock; the write is conditioned on that row. A write has landed when its own
  condition passed: a row back from the UPDATE, or the INSERT's own new row, told from an
  `ON CONFLICT` no-op update by `xmax = 0`; never because the standing revision equals the one sent.
  So on every adapter a box write sent again after it landed refuses as `stale_write`, naming that
  box (the whole stored record, as the C1 ruling above already allows in `meta.box_stored`). The
  `xmax = 0` test is a Postgres implementation detail; if it misread, a rival's box would come back
  "landed" at another revision, which the base class already refuses as `corrupt_record`.
* 2026-10-18 (sprint reform): **three stored-format tags changed in the renaming, none with a
  migration.** Against the last release (0.3.0), the vault props format `safebyok-vault-v2` became
  `safebyok-vault-v3` (the unlock envelope became the "wayin", with the field renames that follow;
  vault props never carried a `revision_id`); the box format `safebyok-lockbox-v2` became
  `safebyok-lockbox-v5` (`note` became the sidecar, `sidecar_json`, beside the new `whisper_codec`
  and `whisper_schema_version`; `changed_at` became `written_at`; `revision_id` became
  `revision_tok`; `-v3` and `-v4` were only ever on `main`, never released); the device lease
  format `safebyok-unlock-v1` became `safebyok-lease-v1`. A 0.3.0 device store holds JSON-tuple
  rows (`["unlock",...]`, `["mark",...]`); today's ckeys are `lease^` and `mark^`. Each record's
  ctx (the associated data its ciphertext is bound to) follows that record's fields and tag; the
  construction is unchanged, and only field names, the tag and the purpose strings moved. The
  package is before 1.0.0, where stored shapes do not bind backward. An old record fails safe: a
  v2 vault reads as damaged (`damaged_vault`, never `newer_format`, since `safebyok-vault-v2` is
  listed among the older formats), and any older box lists as damaged. An old lease is never
  read as a lease: `idbDeviceDB` sweeps the old rows itself, silently, at the next lease read or
  erase (`src/idb.ts`), the 0.3.0 device mark along with the lease; a host's own DeviceDB that
  hands back an old `safebyok-mark-v1` mark sees it read as none, with the vault's one logger
  warning. So the device mark is not kept from 0.3.0: rollback-check state starts afresh. Nothing
  old is ever decrypted by the new code, and nothing is rewritten in place. A Convex deployment
  refuses the new schema until its tables are cleared; Postgres hosts must run the summary
  changeset's Postgres steps before the new table SQL.
* 2026-10-18 (make_hello); 2026-10-19 (20261019-softlock_gone, amending points 1 and 2); 2026-10-19 (20261019-fields_and_make, amending the opening and points 1 and 4): **`openVault` is split into `Vault.make`, which returns a handle at
  once, and `vault.hello()`, which reads storage and the lease.** `Vault.make(opts)` is synchronous:
  it validates every option and returns the handle in state `opening`, reading no storage and starting
  no timer or watch; the first `hello()` reads (see the 2026-10-19 amendment below). `hello()` reads
  the vault props and this device's lease and settles the snapshot from `opening` into `absent`,
  `locked` or `unlocked`.
  Every method but `lock()` and `close()` awaits it first (amended 2026-10-19: `lockSoon()` is gone) (after its synchronous
  argument checks), so a call made before storage answers waits; a call that touches a whisper
  still needs the vault unlocked once `hello()` settles. Nothing that failed closed proceeds. No
  construction, ctx, stored format or key handling changed. Five points to look at:
  (1) **A lock does not wait for `hello()`.** `lock()` acts at once, storage reachable or not.
  Amended 2026-10-19 (20261019-softlock_gone): `lockSoon()` and the counter `revokesSoFar` are
  gone. Corrected 2026-10-19 (20261019-fields_and_make, PR #197): a `lock()` landing while
  `hello()` takes up the lease still wins, by another mechanism (each take-up is aborted by
  whatever drops or replaces the key; see this entry's 2026-10-19 fields_and_make amendment
  below), and the policy for lock timing versus other work in flight is still owed before 1.0
  (TODO.md, *Lock timing vs. work in flight*). Until then, a `hello()` taking up
  the lease while a lock landed took nothing up:
  `fetchLease` returned at once unless the counter `revokesSoFar` (raised by every hard lock --
  `lock()`, `del()`, a lock for untrusted storage -- and every `lockSoon()`) was 0 when that
  hello started, and it took nothing up if the counter had moved by the time the lease opened or
  the handle had closed. Tests held the lease read open while each lock landed.
  (2) **`hello()` is memoised.** Amended 2026-10-19 (20261019-softlock_gone): a lock is no longer
  kept from being undone on its handle by a later `hello()`; with the counter gone, a lease that a
  lock failed to erase (the device store threw) is taken up by the next `hello()` that reads afresh
  on the same handle, not only at the next page load. What the rest of this point says of the
  counter, and of a lock staying locked on its handle, describes what stood until then.
  Callers share one in-flight promise; a rejected one clears at once; a resolved one stands until a
  read of storage fails, storage the vault cannot trust refuses it (`identity_revoked`,
  `rolled_back`, `newer_format`, from any call, read or write), or the vault is deleted. The next
  call then reads storage and the lease again, but a handle on which a lock has revoked a lease (the counter
  above is not 0) takes up no lease: so a lock, hard, soft or for untrusted storage, stays locked
  on that handle even when the device store failed to erase the lease, and whispers stay refused as
  `vault_locked` until a proof unlocks it. A lease the lock could not erase is left for the next
  handle made (the next page load), as before. A handle whose first `hello()` was refused for
  untrusted storage has locked, so it takes up none; one whose first `hello()` failed otherwise
  (storage unreachable, say) has revoked nothing, so it still takes its lease up once a `hello()`
  (or a storage change bell) succeeds; an unlocked handle holds its key and loses nothing. If storage still refuses, the call meets the
  refusal again and the vault stays locked. A plain `lock()` does not reset the memo and erases the
  lease in any case. Regression tests then covered `lock()`, `lockSoon()` and the untrusted-storage case.
  (3) **`Vault.make` refuses any option it does not take**, `bad_option`, by a strict Zod object
  over the option names. Before, unknown keys were ignored, so a host still passing the retired
  `forcePassphraseReentryHours` (now `leaseHours`) got the 7-day default lease: a longer unlock.
  The refusal names the unknown keys (the host's own field names, never a value) and, from a small
  table, the new name of a retired one. React's `VaultProvider` forwards the names of props it does
  not know to `Vault.make`, so those reach the error boundary rather than being dropped.
  (4) **A refused `hello()` no longer closes the handle.** The handle stands, its storage watch
  live, until the host closes it; the snapshot carries the refusal in a new snapshot field,
  `trouble: VaultError | null` (cleared by the next successful read), and the vault's logger warns
  of it. A `VaultError` carries no secret material, as before. While no `hello()` has succeeded, a
  storage change bell runs `hello()` (lease take-up included) rather than a bare refresh.
  (5) **A read of storage takes up the vault props, the device mark and the box listing
  together, only once the listing has been read**, so a read failing partway never leaves the vault
  props of one read beside the boxes of another. When the fresh vault props show the vault
  changed elsewhere, the vaultKey is still dropped and the lease, outdated by the change, discarded before the listing is read,
  as before.
  Amended 2026-10-19 (20261019-fields_and_make): **`Vault.make` touches nothing; the first `hello()`
  reads.** Make reads no storage and no device store and starts no timer and no watch (it still reads
  the host's clock once, to check it); it no longer starts `hello()` itself. The first `hello()` --
  the host's, or the one any call but `lock()` and `close()` starts -- reads storage, starts the
  storage watch and settles. `hello({ staleMinutes })` (default from `Vault.make`'s `staleMinutes`,
  5 minutes; `Infinity` accepted) reads nothing when the last successful storage read began within
  that many minutes by the vault's clock, and only re-settles the picture (a lease past its deadline
  shows locked); it always reads afresh after a failed read, after untrusted storage
  (`identity_revoked`, `rolled_back`, `newer_format`) or after `del()`. Data calls keep their own
  reads before writes; the window affects only what a host's `hello()` shows. The clock read that
  stamps each read is the vault's checked clock: a clock gone wrong now refuses a storage refresh
  too, dropping the vaultKey first (amended 2026-10-21 (trust_lines): there is no checked clock after
  `Vault.make`, and a clock gone wrong no longer refuses a refresh or drops the vaultKey; a clock that
  throws fails that call as `unexpected_error`). Point 4: `trouble` no longer carries storage conditions. It is
  the latest bad news (or the `onBadNews` handler's throw), cleared when a storage read finds no
  damaged box; a condition such as `storage_unavailable` reaches only its caller (a refused
  `hello()` rejects to whoever called it) and the snapshot's `syncing: false`, so a background
  read's failure shows in the snapshot only as `syncing: false` (and the logger's warning).
  Amended 2026-10-19 (20261019-fields_and_make, PR #197; amending point 1): **a `lock()` landing
  while a `hello()` takes up this device's lease is no longer undone.** A take-up (`#fetchLease`)
  reads the lease record, checks it fits, unwraps the vaultKey under the leaseKey, then installs the
  key and deadline; as the default five-minute `staleMinutes` makes a routine `hello()` re-run it, a
  `lock()` between the read and the install could be reversed (unlocked in memory, lease deleted),
  and an older lease could overwrite a fresher `unlock()`. Each take-up now holds an
  `AbortController`; whatever drops or replaces the key (`#dropKey`, called by lock, close, del, the
  expiry timer and relocks; and `#grantLease`, as an unlock or wayin change begins writing its
  lease, before the write, so a take-up that read an older lease cannot erase the fresh one by
  discarding the older) aborts it. An aborted take-up installs nothing and discards no lease
  record (the lease standing may be the overtaking change's own). Nothing else about lock timing
  versus work in flight changed: the policy owed before 1.0 (TODO.md, *Lock timing vs. work in
  flight*) is still open.
  Amended 2026-10-19 (a_sec, #203): a hello's lease take-up also takes nothing up when the vault
  props it fitted the lease against are outrun during its waits (`#outrun(standing)`: `vault_id` or
  `unlock_epoch` moved, or the handle closed), even though no key is held for the "outlived" relock
  to drop. Before, a passphrase change or wayin removal on another device (new `unlock_epoch`), or the
  vault deleted and made anew elsewhere (new `vault_id`), landing during the unwrap left this device
  unlocked under the new props with the old key, indefinitely, defeating the epoch's revocation. The
  lease is left for the next hello, which discards it as not fitting. Also 2026-10-19 (a_sec, #203):
  a storage read (`#takeStorage`) that finds the vault props changed from those held (a new
  `unlock_epoch` or `vault_id`, or the vault gone) now takes them up at once, together with the mark,
  before any further await: it drops the key, stands down any take-up, and (for a different
  `vault_id`) empties the box listing; only then does it erase the lease and list the boxes. Before,
  it decided "outlived" first and assigned the new props only after awaiting `delLease` and
  `listBoxes`, so a take-up or an unlock's lease grant that finished inside those waits still saw the
  old props through `#outrun`, installed a key fitted to them, and was never relocked. A revocation
  now wins by construction, not by timing. Two other writes of vault props no longer write older
  props over newer ones a read took up meanwhile: an unlock that creates the vault (`#settleUnlock`)
  and a change to the wayins (`#reviseWayins`); in both, the lease grant that follows finds its props
  outrun and takes nothing up.

* 2026-10-18: **the context bytes of every wayin changed spelling, not construction, with the
  rename to "wayin".** A wayin's wrap is bound to a context of the record's format tag, then its
  whole stored header, as key-sorted JSON (a passkey wayin's HKDF `info` is the same bytes); it now
  spells the renamed fields and begins `safebyok-vault-v3` (since 2026-10-19, `safebyok-vault-v5`, so v3 and v4 wayins no longer open, and with a header that holds no `wayin_id` or `wayinlabel`: see the slots entry at the top; since 2026-10-21
  (trust_lines) `safebyok-vault-v6`, the header holding no `vault_key_epoch` either, so a v5 wayin no longer opens). The construction and the purpose
  strings are unchanged. A `safebyok-vault-v2` record reads as `damaged_vault` on adapters that read
  it (a Convex deployment refuses the new schema until its tables are cleared), with no migration,
  so no old ciphertext has to open under the new bytes. Rejected: a translation back to the old
  spellings under the v2 tag, which puts a name table in the crypto path for records nobody reads.
* 2026-10-16: `describeVaultDB` now races every compare-and-write line (VAULTDB.md, 3.1 to 3.5, 3.7,
  4.5) from two devices, holding one before each of its round trips while the other moves
  (`raceEveryWay`, a turnstile the adapter's test factory wires into its client). What it shows: no
  check is split from its write across round trips or awaits, and no in-process lock or queue
  makes the devices take turns. What it cannot: split one round trip. Every in-tree backend under
  test runs one call at a time, which is the real promise of Convex's mutations and of IndexedDB's
  readwrite transactions, but not of Postgres at READ COMMITTED, whose statements run at once: the
  atomicity of `postgresVaultDB`'s one-statement writes under concurrent connections is reasoned
  (thread 11's verdict), not tested. The self-tests that prove the races catch a broken adapter
  run over an in-memory backend, not over each real one. Separately, `postgresVaultDB` now calls a
  subscriber once as its listen begins (6.1), so a vault reads a write that landed while its watch
  was starting, which it missed before.
* 2026-10-16; 2026-10-19: **the `vault_key_epoch` expectation** (`VAULTDB.md` line 3.8). Amended 2026-10-21 (trust_lines):
  removed; `vault_key_epoch` is gone from boxes, from `putBox`'s expectation and from every adapter's
  comparison, which compare `vault_id` and `revision_tok`. A vault made anew has a new `vault_id`,
  bound into every box, and a write aimed at the old one is refused; a rotation will need to add an
  epoch back, and this expectation with it. What stood: Every box carries
  the `vault_key_epoch` of the vaultKey its boxKey is wrapped under (bound into both its
  encryptions with the rest of its header), and `putBox` lands only while the scope's standing
  vault props have that epoch, compared by the adapter in the same atomic step as `vault_id` and
  `revision_tok`; the base class refuses a box whose own epoch is not the expected one. This is
  the only thing that stops a device still holding a replaced vaultKey, which has not looked at
  the vault props since, from sealing a new whisper under it: `putBox()` does not read the vault props first.
  An adapter that skips the comparison lets that device write a box the replaced vaultKey
  opens. `localVaultDB` compares it now; IndexedDB, Convex, Postgres (and GraphQL through it) do
  not yet, and the battery holds them to it as a pending test until they do. Every vault is at
  epoch 1 today: nothing replaces a vaultKey yet (2026-10-19: the rotation schema is gone, so the
  comparison now guards a box built wrong, and stays so a later rotation needs no new
  contract). Deletions name no epoch. A box whose epoch is
  not the vault props' reads as `damaged_box`, its key never tried.
* 2026-10-16; 2026-10-19 (a_sec2, #206): **the rollback check.** Amended 2026-10-21 (trust_lines): the mark keeps `vault_id` and the highest
  `unlock_epoch` only (`safebyok-mark-v5`); `vault_key_epoch` is removed, so the refusal of a lower one,
  the wayin check on it and the rotation case below no longer exist, and older vault props of the same
  `vault_id` under a forged higher `unlock_epoch` pass, bringing back at most a wayin since put or
  removed, as nothing replaces the vaultKey; a rotation will need an epoch and this check on it. What
  stood: Each device keeps a device mark per scope in its deviceDB:
  the vault's `vault_id` and the highest `unlock_epoch` and `vault_key_epoch` it has seen the
  vault props at, raised on every read of newer vault props and after its own writes. Vault props of the same
  `vault_id` at a lower `unlock_epoch`, or a lower `vault_key_epoch`, are refused as `rolled_back`
  at open, unlock, every change to the wayins, and
  every refresh, before anything is taken from it; a vault unlocked when it meets one stays as it
  stood. Its reach: only a device that saw the newer vault props, and only while its local storage
  lasts (clearing site data, a damaged mark, or another `vault_id` -- a vault made anew -- starts
  a new mark). Its blind spot: vault props cannot be ordered across `vault_id`s, so storage serving an
  old, deleted vault in place of the current one is not caught, nor is anything on a device
  that never saw the newer vault props. A mark holds one vault per scope, so storage that hands back
  another vault's vault props even once moves the mark to that vault, and an older copy of the first is
  then taken as it stands. `unlock_epoch` is bound into no encryption, so storage can serve an
  older vault props under a raised `unlock_epoch`; but `vault_key_epoch` is bound into every wayin
  and held equal to the vault props', so storage cannot raise it on older vault props and still have a
  wayin open, and the mark refuses one at a lower `vault_key_epoch` whatever its `unlock_epoch`:
  vault props from before a rotation, and with it the vaultKey the rotation replaced, are caught even
  so. What still passes is older vault props at the same `vault_key_epoch` under a forged higher
  `unlock_epoch`: it can bring back only a passkey `delWayin` dropped or `putWayin` replaced (amended 2026-10-21 (wayin_rules): or removed by a new passphrase), or a passphrase
  `putWayin` replaced, which still opens only the vaultKey the vault stands under, never a
  replaced one. (A device that opens such vault props through its lease opens no wayin:
  it takes the vaultKey it already held, and shows the older copy's wayin summaries.) The way out of a
  refusal is the host's: it erases the device's mark (`valOf(await deviceDB.delMark(scope))`;
  amended 2026-10-19: once a bare `deviceDB.delMark(scope)`, before every DeviceDB verb resolved an
  `Outcome`) and opens again,
  taking the older copy as it stands, the core README's recipe. Amended 2026-10-19 (a_sec2, #206): a
  handle that locks as `rolled_back` now also forgets the vault props it holds (its state reads
  `opening`), so the recipe works on the very handle that refused. It used to keep the newer vault
  props, and a later read's older copy was then taken for a stale read and declined; the handle kept
  the newer epoch, and every change to the wayins refused `stale_write`. A test runs the recipe on
  one open handle. A known corner, with no mechanism added: suppose this device's own write of its
  mark failed after a change to the wayins (logged by `#raiseMarkAfter`), and storage was then
  restored; the handle may go on refusing `stale_write`. The class doc tells the host to close the
  handle and open a new one. The README has the host decide that
  from its own knowledge of a restore, never from the user's answer: storage that rolls back on its
  own would ask the user the same, and the user cannot tell the two apart. `del()` and
  `delDamagedVault` erase the mark. Two tabs of one device
  each read and write the mark without a lock, so a tab that read older vault props before the
  other tab's newer one can write the mark back down: the check weakens to the older epoch. The
  mark is read before the vault props are, so newer vault props that another tab,
  or this one, landed while it was being read never pass for a rollback: against storage whose
  reads see every write landed before them, the check never refuses wrongly. Within the vault props,
  a wayin whose `vault_key_epoch` is not the vault props' is passed over as damaged
  (`damaged_wayin`), so a wayin spliced in from older vault props never hands over its vaultKey
  as the current one.
* 2026-10-16: **`device_id`.** Every wayin carries the `device_id` of the device that
  added it, and its `registered_at`, both in its header and so bound into its wrap (and, for a
  passkey, its HKDF `info`), and kept when the wayin is sealed anew. The id is a random UUID
  (`crypto.randomUUID`) a device mints for one vault the first time it reads or makes it, kept
  only in its device mark: never derived from the device (no fingerprinting, hardware or
  advertising identifier, no user-agent label), and one per vault per device, so the server learns
  which wayins one device added to one vault and nothing more -- no link between a user's
  vaults, or between users on one device. It is visible to the server in the clear. No
  user-chosen device label is stored. Clearing site data mints a new id; wayins keep the old.
* 2026-10-16: the record formats moved on with these fields (to `safebyok-vault-v2`,
  `safebyok-lockbox-v2` and `safebyok-mark-v1`, since moved on again to `safebyok-vault-v3`,
  `safebyok-box-v6` and `safebyok-mark-v3` (amended 2026-10-19 (put_wayin): this said "today's" of `safebyok-vault-v3`; the vault props' format is now `safebyok-vault-v5`, as follows); the mark moved to `safebyok-mark-v4` on 2026-10-19, and the vault props to `safebyok-vault-v4` the same day and on to `safebyok-vault-v5` (slots), so a stored `safebyok-vault-v3` or `-v4` record reads as `damaged_vault`, listed among the older formats), and each ctx's first part with
  them. No vault written before reads: its vault props are `damaged_vault`, and `delDamagedVault`
  recognizes `safebyok-vault-v1` as an older format, not a possibly newer one, so it clears such a
  vault rather than asking the user to update the app.
* 2026-10-16: the VaultDB contract (`packages/safebyok/VAULTDB.md`, line 4.2) makes a storage
  adapter's box limit a best effort: writes made one after another never pass it, but writers
  racing for the last places may take a vault a few past it, and a client that bypasses the
  library (a modified browser) is the host's to meter, as an abuse quota, not the adapter's to
  stop. An adapter may offer a hard limit only as an opt-in. The vault's own `maxBoxes` is
  enforced in the client alone. Postgres today holds a hard limit on the server (#89); the next
  thread replaces it with this best effort.
* 2026-10-15: a box row that fails the listing's check (not JSON, a malformed sidecar or time, a
  record naming another boxlabel than the ckey it sits under, an unknown `format`) is listed as
  `{ boxlabel, damaged: true }` instead of making `listBoxes` -- so every `refresh()` and
  `hello()` -- refuse `corrupt_record` (amended 2026-10-21 (fault_kinds): `getBox` on such a row
  refuses `damaged_box` at the `VaultDB` layer, a record naming another boxlabel included). The boxlabel comes from where the row is stored (a
  `VaultDB`'s `doListBoxes` now hands up `{ boxlabel, box }` pairs; the in-tree adapters read
  it from the ckey, Convex from its column), never from the damaged record, and nothing else of
  the record reaches the snapshot. A row whose boxlabel the vault's `validators` refuse --
  stored under other checks, before a host narrowed them -- lists as damaged too, and `delBox()`
  reaches it by its stored name: for a box that already stands, `delBox` checks the boxlabel only as
  text (the ckey it rebuilds is still this scope's own). So the snapshot carries a damaged box's
  boxlabel as stored, text the host's check refuses: one who can write storage can put any text
  there, as a name a host renders. `putBox()` checks every boxlabel against
  the host's check, so it refuses a refused name (`bad_label`, writing nothing) even over a box
  standing under it. `putBox()` over a
  box whose record fails validation (any listed as damaged, and one whose ciphered fields are
  missing or malformed) now deletes it (`delBox`, expecting only the `vault_id`) and then writes
  a fresh box expecting no revision, carrying neither its sidecar nor its `registered_at`; two
  steps, so a failure between them leaves the box deleted. Since that deletion names no revision, it
  also removes a sound box another device stored under the boxlabel after this store read the
  damaged one (this store's write then stands in its place, but should the write fail, neither stands;
  amended 2026-10-18: this once said "as a retried store's would", before `putBox()` stopped retrying), and a deletion of the damaged box elsewhere does not stop this
  store. What one who can write storage could already do -- delete or replace any row -- is
  unchanged; what is new is that planting junk under a boxlabel shows the user a damaged box where
  a refused open used to show, and that the user's next `putBox()` to that boxlabel clears the junk
  rather than refusing. `getBox()` and `useBox()` still refuse a damaged box. (Amended
  2026-10-19, 20261019-no_clear: the delete-first is gone. `putBox()` is one conditional
  `putBox`; a damaged box naming a revision is written over in it, carrying nothing forward,
  and one naming no revision is refused as `damaged_box`, writing nothing, until the user calls
  `delBox()`; the two-step and removal behaviors described here no longer exist.) Amended 2026-10-21
  (trust_lines): the boxlabel stays bound into each box's encryption context. A plain check that a
  stored record's boxlabel matches the label it is stored under remains in `getBox` and the listing; it
  catches a misfiling adapter, but a hostile server can rewrite both, and the listing shown while locked
  is unauthenticated. The host's validators gate writes only (`putBox`); reads and deletes check the
  floor alone.

* 2026-10-15: `delBox(boxlabel)` removes a box whose stored record fails validation or
  verification (`corrupt_record`; amended 2026-10-21 (fault_kinds): `damaged_box`), rather than refusing it: it reads the record only to tell an
  absent box (`absent_box`) from a present one, and a damaged record counts as present. It still
  needs the vault unlocked, still names the boxlabel the caller gave, and still lands only in the
  vault this device holds keys for (its `vault_id` expectation). `getBox()`, `useBox()` and the
  background refresh still leave a damaged record in place; only an explicit deletion of that
  boxlabel deletes it. Amended 2026-10-21 (trust_lines): `delBox` no longer reads the box before
  deleting; storage's own `absent` answer is reported as `absent_box`.
* 2026-10-15: a scope's `user_id` is text of 1 to 100 characters (`UserId`), checked at
  `Vault.make`, by every `VaultDB` verb, and in every stored record that names a scope; a refusal
  names the bound and never quotes the id. The Convex component's validators and its `getUserId`
  check do not bound it themselves: the client's `VaultDB` refuses a longer one before a call is made.
* 2026-10-15: `pnpm-workspace.yaml` sets `minimumReleaseAge: 10080` (seven days, in minutes) and
  `minimumReleaseAgeStrict: true`: pnpm resolves and installs nothing, transitive dependencies
  included, younger than that, and fails rather than fall back; the frozen-lockfile install in CI
  verifies the lockfile against it too. Its exceptions are `minimumReleaseAgeExclude` entries,
  each by name and exact version, each listed here until removed (PROCESS.md, *Dependencies*).
  Adding the rule re-resolved the whole lockfile (the old one held 51 entries under seven days
  old) and lowered the floor of nine direct dependencies' ranges to releases that had aged (the two hand
  pins on `graphql-yoga` and `@graphql-tools/schema` became ranges again: the rule now does what
  they did). Dependabot's `cooldown` is 7 days to match.
* 2026-10-15: `mask` (`safebyok/utils`) takes a whisper and returns text meant for display: its
  first and last few characters (two and four by default, at the caller's choice) and, up to
  `maxLen` (15 by default), its length. Beyond `maxLen` the result is fixed-width
  (`head***...***tail`), or `maxLen` stars when even that does not fit, so the length stops showing;
  a `head` and `tail` large enough to cover a short whisper show it nearly whole, and `minStars: 0`
  shows a short one entirely. It makes the whisper safe to butcher (normalize and strip the whole
  input), butchers it, and then checks the result is safe by passing it through the same stripping,
  so every result, even the stars, is free of combining marks, control, format, surrogate,
  private-use and unassigned code points, spaces, ignorable code points, bidirectional controls and
  direction marks, and the symbols drawn blank or as a box (U+2800, U+1D159, U+FFFC); it is one
  plain line that cannot hide or overwrite anything. Right-to-left letters and numbers are kept (the
  Coach's ruling: strip the direction markers, not the scripts), so a mask may reorder neighbouring
  neutral characters, such as stars and punctuation, in a display; with no controls in it, it cannot
  do worse. `mask` is meant for plain text, and arbitrary blobs may give unusual behavior. `head`,
  `tail` and `minStars` are capped at 1000, so no option makes it build an unbounded string. It
  throws `bad_option` or `bad_whisper` without quoting its input.
* 2026-10-14 (revised 2026-10-15 for the push-to-main workflow): the package is staged on npm by
  `.github/workflows/release.yml`, run on every push to main (when the Coach has merged the Version
  PR, and a version npm lacks is waiting), authenticating by npm's trusted publishing (OIDC, no
  stored token) from the `npm` environment, with provenance. The `pack` job runs `pnpm justify`
  (lint, typecheck, tests and the build) before `publish`, which runs no package's scripts. A
  maintainer's 2FA approval makes the staged version public; CI cannot give it.
* 2026-10-14: the npm trusted publisher allows `npm stage publish` and `npm dist-tag`, and not
  `npm publish`. A run of the release workflow can therefore repoint a dist-tag (`latest`,
  `next`) at any version already public, with no 2FA approval; the workflow does not run
  `npm dist-tag` today.
* 2026-10-14: `pnpm-workspace.yaml` allows one dependency's install script to run:
  `unrs-resolver` (a native module resolver, pulled in by `eslint-import-resolver-typescript`, a
  development dependency only).
* 2026-10-14: every action in `.github/workflows/` is pinned to a full commit SHA, with the
  release it was resolved from in a trailing comment (`@3d3c42e... # v7.0.1`). Dependabot's weekly
  `github-actions` group proposes new SHAs, and rewrites the comment with them.
* 2026-10-14: the cryptography landed, replacing the plaintext stub. The stub's stored formats
  (`byok-stub-vault-v0`, `byok-stub-unlock-v0`) are not read by the new code: they existed only
  in the demo and were never published.
* 2026-10-14: Argon2id (the pinned `argon2id_web_v1` spec) runs through `@noble/hashes` -- pure
  JS, no WASM; the library's one audit (Cure53, January 2022, at 1.0.0) left its `argon2` out of
  scope, as its README says, so the Argon2id itself is unaudited -- at about half a second per
  derivation in V8. AES-256-GCM encryption, key wrapping and randomness come from WebCrypto
  (`crypto.subtle`, `crypto.getRandomValues`).
* 2026-10-14: the key deriver is a seam (`MakeVaultOpts.keyDeriver`): the pinned Argon2id deriver
  was the default until 2026-10-15 (below), tests substitute a cheap SHA-256 deriver, and a
  stored vault records its deriver's label and refuses to unlock under any other.
* 2026-10-15: `Vault.make` has no default key deriver: `keyDeriver` is required, and
  `browserOpts()` (the `safebyok/browser` entry) supplies the pinned Argon2id one. An app that
  passes none is refused with `bad_option`, never quietly given one. `Vault.make` imports no
  Argon2id and the main entry nothing from `safebyok/browser`, but the main entry still
  re-exports `argon2idWebV1Deriver`: Argon2id stays out of an app only where a bundler
  tree-shakes it (the package is `sideEffects: false`), not under a plain `require('safebyok')`
  or an unbundled import. Substituting a deriver still commits every vault made under it to its
  label, as above.
* 2026-10-14: every encryption binds its context as AES-GCM additional data
  (`cipherCtx`): format, applabel, user_id, vaultlabel, vaultId, plus unlockEpoch
  for key wraps (since 2026-10-15, the lease's only: a wayin binds its own
  header instead, below) and boxlabel + revisionTok for boxes, encoded as a JSON array. Ciphertext
  moved between users, vaults, boxes or revisions refuses to open. (Widened 2026-10-15 to every
  field each record writes: the sweep entry below.)
* 2026-10-14: a wrong passphrase is learned from the vaultKey wayin's AEAD failure, never a
  comparison; there is no separate passphrase verifier field.
* 2026-10-14: the leaseKey is a non-extractable WebCrypto key persisted only by structured
  clone (IndexedDB, `safebyok/idb`); the vaultKey handle a vault holds between operations is also
  non-extractable (amended 2026-10-21 (trust_lines): held by the opened lease, not the vault). The operations that must wrap the vaultKey (granting a lease at unlock, the
  re-wrap in putWayin) unwrap a separate extractable transient from the same wayin and
  drop it on return; the lease path makes no extractable handle at all. Amended 2026-10-21: the
  leaseKey's usages are wrapKey and unwrapKey, so whoever can use the lease record in this browser
  profile (page script, an extension, a person at the unlocked device) can call WebCrypto
  `unwrapKey` with it, asking for an extractable result, and so recover the vaultKey's bytes; the
  non-extractable flag keeps the leaseKey, not the vaultKey, from being carried off. This is the
  power a lease grants, until `ask_passphrase_at` (see the 2026-10-17 entry on the non-extractable
  vaultKey).
* 2026-10-14: a stored record that fails validation or AEAD verification is refused with kind
  `corrupt_record` and left in place -- remote data is never auto-deleted. A device-local
  lease that fails is the one exception: it is dropped, and the user asks again. Amended 2026-10-21
  (fault_kinds, PR [#240](https://github.com/mrflip/safebyok/pull/240)): a record read from storage
  that fails its checks is refused `damaged_box` (a box, one naming another boxlabel included) or
  `damaged_vault` (vault props, one naming another scope included), at the `VaultDB` layer as at the
  vault's, still left in place; Zod's error is the refusal's `cause`, and `corrupt_record` now means
  only an adapter answering in the wrong shape (a write echo, a stale or full refusal missing its
  meta, a deletion report, capacity), its family moved from condition to misuse. A lease read from
  this device's own store still fails as `corrupt_record` internally, never surfaced (the vault asks
  for a proof). `localVaultDB` hands a row that is not JSON up as text, so it reads as
  `damaged_box` or `damaged_vault`, not as the adapter throwing `corrupt_record`.
* 2026-10-14: the demo app calls Anthropic directly from the browser with the user's own key
  (`dangerouslyAllowBrowser: true` on the SDK client), by design: the key is decrypted on-device
  inside `vault.useBox(...)` and sent only to `api.anthropic.com`.
* 2026-10-14: `safe-stable-stringify` is a runtime dependency: `stableJsonify`
  (`src/stable-jsonify.ts`) is a thin alias of it, backing snapshot change detection and the
  comparison that once decided whether a box's `changed_at` moved (superseded 2026-10-17: that
  field is now `written_at`, stamped on every write; see the `written_at` entry below).
* 2026-10-14: `zod` moved from a regular dependency to a peer dependency (`^4.0.0`): the host app
  supplies it, so safebyok validates with whatever zod instance that app ships.
* 2026-10-15: storage writes are versioned updates (`VaultDB.putVaultProps`, `putBox`). A
  vault props update carries the `vault_id` and `unlock_epoch` it was proven against, and lands
  only while the standing vault props have both. A box update carries the `vault_id` its whisper
  was sealed for and the `revision_tok` it read (or null for none), and lands only while the
  scope's standing vault props have that `vault_id` and the standing box that `revision_tok` (or
  there is none); a scope with no vault props refuse. A failed expectation refuses with kind
  `stale_write` (amended 2026-10-21, C1: for a box write whose vault props no longer stand, now
  `vault_mismatch`, see the 2026-10-19 (returning) entry), writes nothing, and `putBox()` /
  `putWayin()` / `delBox()` / `del()`
  surface it on the first failure, with no retry. Deletions (`delBox`, `delVault`) carry a
  `vault_id`-only expectation (the Coach's ruling): they land only while the scope's standing
  vault props have that `vault_id`, refuse where no vault props stand, and expect no revision, so within
  its vault a deletion wins over a concurrent update; deleting an absent box is quiet. The
  atomicity of check-and-write is each adapter's: `localVaultDB` checks and saves in one
  synchronous step; the Convex component checks inside the transaction of the mutation that
  writes (below).
* 2026-10-15: `idbVaultDB` performs its versioned updates, its deletions and `ensureVaultProps` as a
  read, then a separate write, in separate IndexedDB transactions: another tab writing in
  between can still be buried, two tabs can each create vault props, and a vault another tab
  deletes and makes anew in between can still lose a box (`delBox`) or be deleted whole
  (`delVault`). Its `delVault` also lists the vault's rows in one transaction and deletes
  them in another: a box another tab writes in between survives the deletion, orphaned without
  vault props. Doing these inside one IndexedDB transaction is a ruled TODO, not yet built. (Built
  when the store moved to `safebyok-indexeddb`: see the entry on it below.)
* 2026-10-14: a box's ciphertext length reveals its whisper's length to the backend: there is
  no padding yet (TODO). `putBox()` refuses a whisper over `maxWhisperBytes` of JSON, an
  `Vault.make` option defaulting to `MaxWhisperBytes` (40444), checked on write only.
* 2026-10-14: `putWayin` of a new passphrase re-wraps the vaultKey under it but does not
  rotate it, so a superseded vault props plus its old passphrase still yields the current vaultKey,
  with no expiry. The Convex adapter (`packages/safebyok-convex`) keeps no vault props history, but
  Convex's own backups and snapshot exports retain superseded vault props for as long as they are
  kept.
* 2026-10-14: `pnpm-workspace.yaml` denies `esbuild`'s install script (`esbuild: false`); esbuild
  arrives with `convex` and vite, and runs from its platform binary package without it.
* 2026-10-15: a session holding keys for a vault since deleted or recreated elsewhere cannot
  write a box into the successor, delete one of its boxes, or delete it: `putBox()`,
  `delBox()` and `del()` no longer look at the vault props first, and rely on the `vault_id`
  expectation, checked by the backend, to refuse. A refused `del()` has already revoked
  this device's lease; a second `del()`, now holding the successor's `vault_id`,
  deletes the successor. On a vault the handle has never seen created, `del()` removes only
  the device-local record: boxes orphaned without vault props are not reached.
  `putWayin()` and `unlock()` re-read the vault props first, as they must to prove the
  passphrase against it. A change to the wayins elsewhere (the passphrase changed, or the passkey added, replaced or removed) does not stop a stale session's
  `putBox()` or `delBox()` (their expectations carry no epoch); the session relocks on its next
  look at the vault props.
* 2026-10-14 (the option was named `rememberForMs` until its rename on 2026-10-15): the lease
  length (`leaseHours`) is chosen by the app at each `Vault.make`, so two devices on
  one vault may hold different lengths. It is client-side politeness, not a vault-wide synced
  policy: nothing stored enforces it across devices, and a modified client could choose any length
  it likes. The real bounds stay the passphrase and the device-bound leaseKey.
* 2026-10-15 (revised the same day by clean_times; the cap and the timer since 2026-10-16, by
  locks_and_expiry, below): a host may let a device stay unlocked
  indefinitely, by passing `leaseHours: Infinity` (or any huge number); that is the
  host's choice, with no upper cap. `Vault.make` turns it, as it parses the option, into a finite
  span of `FarFuture - FarPast` ms, so the deadline it sets from any in-bounds clock reading is
  `FarFuture` (see the next entry), and the stored `ask_passphrase_at` is a finite number; no schema
  past that parse, and no stored field, accepts `Infinity`. What still ends such a lease: `lock()`
  (memory and lease), a change to the wayins on another device (the next look at the vault props
  sees a new epoch), and the vault being deleted or made anew (a new `vault_id`). Nothing else
  does: no timer, and no idle detection. Two consequences: an open handle sees that new epoch only
  when it next reads the vault props (an unlock, a write, or a change the vaultDB pushes), so a handle
  that only reads whispers, on storage that pushes nothing, keeps its vaultKey in memory until then;
  and lowering the option later ends a lease a device already holds only at its next open (see
  the entry below).
* 2026-10-15 (revised the same day by clean_times); 2026-10-19 (20261019-softlock_gone): every time the package stores is an
  `EpochMillis`: epoch ms from `FarPast` (1981-01-01T00:00:00Z) to `FarFuture`, the microsecond
  epochalypse (`Math.floor(Number.MAX_SAFE_INTEGER / 1000)`, 2255-06-05T23:47:34.740Z) -- the
  lease's `ask_passphrase_at` (named `expires_at` until then), and the box's and
  vault props' `registered_at` and the box's `written_at`: whole ms, so a stored record with a
  fraction of a millisecond fails its schema as one out of bounds does. A lease that
  fails the schema reads as "no lease", and is erased; it is not clamped on read. That
  includes records written by 0.1.0 and 0.2.0 under a lease length above about two million hours (some
  229 years), which capped the length only at `MAX_SAFE_INTEGER` ms and stored `now + length`
  unclamped. **The host's `Clock` is checked**: `Vault.make` reads it once and refuses a reading
  outside those bounds (seconds, microseconds, `NaN`, `Infinity`, a non-number), or a `now()` that
  throws (its error kept as the cause, unquoted), as `bad_option`, before touching storage. Every
  later reading is checked the same way and floored to whole ms (a fraction is fine in a
  reading), and one that fails **fails closed**: the vaultKey is dropped before the call throws
  `bad_option`, so a clock gone wrong never mints a deadline or a stored time, and leaves the vault
  locked in memory (the lease stays). A lock never waits on the clock: `lock()` reads
  none. (Amended 2026-10-19: `lockSoon()`, which locked at once on a clock it could not read,
  with a warning to the vault's logger, is gone.) A clock that goes wrong in the middle of a `putBox()`,
  `delBox()` or `putWayin()` lets the write land, then throws `bad_option` from the refresh
  after it. A clock in bounds but wrong (set a year ahead, say) is not detected.
  Amended 2026-10-21 (trust_lines): the host's clock is checked once, at `Vault.make` (one reading
  must be epoch milliseconds between 1981 and 2255). After that its readings are floored and used
  unchecked, and a later bad or throwing reading no longer drops the vaultKey; the "checked on every
  later reading", "fails closed" and mid-`putBox()` sentences above no longer hold. Lease deadlines
  and stored timestamps after construction therefore rest on the host's clock. `vault.clock` is no
  longer exposed; the models read the time through the public `vault.now()`.
* 2026-10-15; 2026-10-19 (20261019-softlock_gone): `Vault.make` takes a host's `logger` (`log`, `warn`, `error`, each
  `(message?, story?, err?)`), checked at the door (`bad_option`) and wrapped so that whatever it
  throws or rejects with is dropped. The vault calls it in three places (amended 2026-10-19: a fourth, `lockSoon()` locking
  without its grace on a bad clock, went with `lockSoon()`): a lease that fails its schema or will not unwrap,
  erased; a background refresh that fails; and an adapter's unsubscribe throwing while a failed
  open cleans up. Messages are fixed text; a story is `{ call }` alone, naming the vault call, so
  no scope, label, `userId` or other option value goes to the logger; an `err` is the
  `VaultError` the vault would otherwise have thrown (its `cause` the host's own clock or adapter
  error, as `VaultError` already carries it) or the adapter's own error, never a record or a
  validator's issues. A host's own error goes as the host made it, unread and unscrubbed, and the
  default console logger prints it, though a storage client's error may quote the request it
  failed. A test sweeps every call for the fake passphrase, whisper, sidecar, stored
  ciphertexts and salts, down through each error's causes.
* 2026-10-15: with no `logger`, the vault logs to the console: `src/console-logger.ts` is the one
  module in `src/` that touches it, under a file-wide `eslint-disable no-console` (the Coach's
  approval: "yes with no logger console is the fallback"); the lint rule itself is unchanged
  everywhere else. A host silences it by passing a logger whose calls do nothing.
* 2026-10-15 (superseded 2026-10-17: `changed_at` is now `written_at`, stamped on every write
  without comparing whispers; see the `written_at` entry below): a box kept two times,
  `registered_at` (first stored, carried forward) and
  `changed_at`, which moves only when the whisper's serialized form (`stableJsonify`) differs from
  the one it replaces. To know, `putBox()` deciphers the previous record it already reads and
  compares the two serialized whispers with plain string equality, in memory on the client; the
  comparison is not constant-time. A previous record that will not open counts as changed and is
  written over, as before. The backend learns one bit it did not before: a `changed_at` that
  stands still across a new `revision_tok` says the host stored the same whisper again. The vault props
  keep `registered_at`; `created_at` and `updated_at` are gone from both records. None of the
  times is in the cipherCtx (the ctx is still the positional list), so a backend
  can alter them undetected; binding the whole header is TODO.md's roadmap 3, not yet built.
  (Built since: the sweep entry below binds both times and the sidecar.)
* 2026-10-15: until 1.0.0 a stored-shape change carries no migration (the Coach's ruling). A
  box or vault props written with `created_at`/`updated_at`, or a lease with
  `expires_at`, fails its schema: the vault refuses it as `corrupt_record` (amended 2026-10-21
  (fault_kinds): `damaged_box` or `damaged_vault`) and leaves it as it
  is (a lease is discarded, and the user enters the passphrase again). A Convex deployment
  holding such rows refuses the new component schema at deploy until those rows are deleted.
* 2026-10-15: lowering `leaseHours` reaches leases already granted. At each
  open, a lease whose deadline lies past now plus that open's setting was granted
  under a longer one, and is treated as a record that does not fit: discarded, and the vault opens
  locked. Raising the option lengthens no lease; an unchanged setting never trips it
  (the deadline set at unlock is always within now plus the setting), so it fires only when the
  host lowered the setting, or the clock went backward. There is deliberately no write-back of a
  shortened deadline: a blind write of the record read at the start of the open would bring back
  a lease that another tab's `lock()` revoked in between, and later opens would come
  up unlocked against the user's last act. Doing it safely would need an atomic "shorten if still
  present" on `DeviceDB`, an interface hosts implement. An erase cannot resurrect anything and
  cannot slide; racing another tab's fresh unlock, it only makes that device ask again. A stored
  deadline past `FarFuture` never reaches this check: it fails the record's `EpochMillis` bounds
  and is erased first (the entry above). A handle already open keeps the deadline it opened
  with: the option is read at `Vault.make`.
* 2026-10-14: the package was renamed `byok` → `safebyok` before any release, and its stored
  format tags with it (`safebyok-vault-v1`, `safebyok-lockbox-v1`, `safebyok-unlock-v1`). The
  tags are also the first element of every encryption's additional data, so a record written
  under a `byok-*-v1` tag would neither validate nor decrypt. No reader for the old tags is
  kept: they existed only in development and demo storage, never in a published version.
* 2026-10-15; 2026-10-19 (thread A1 `outcome`, sprint contract, branch 20261019-outcome); 2026-10-19 (thread A4, sprint
  contract, branch 20261019-try_twins); 2026-10-19 (a_sec, #203); 2026-10-19 (a_sec2, #206):
  `VaultDB`'s public verbs turn any failure from an adapter that is not already a
  `VaultError` into kind `storage_unavailable`, with the adapter's own error attached as the
  standard `cause`. Adapters see only ciphertext and unencrypted record fields, but that cause is
  whatever the backend's client threw, unfiltered. As of 2026-10-19 every public verb
  (`getVaultProps`, `ensureVaultProps`, `putVaultProps`, `delVault`, `delDamagedVault`,
  `listBoxes`, `listBoxRecords`, `getBox`, `putBox`, `delBox`) resolves an `Outcome`
  (`{ ok: true, val }` or `{ ok: false, err }`) and never rejects; the adapter's `do*` hooks still
  throw, and the one catch is `outcomeOf` (`src/outcome.ts`), which makes the same
  `storage_unavailable`-with-`cause` conversion. `outcomeOf` is exported for an app wrapping its
  own calls: whatever such a body throws that is not a `VaultError` is kept, as it came, as the
  `cause`, so an app must not throw secret material from a body it wraps. `VaultError` gains
  `family` (`misuse`, `condition`, `bad_news`), read from `refusalkind` through one table and never
  set by a caller; `bad_news` (`damaged_vault`, `damaged_wayin`, `damaged_box`, `newer_format`,
  `rolled_back`, `identity_revoked`) was `condition`, and `isCondition` is true for both (amended
  2026-10-21 (fault_kinds): `corrupt_record` is in the `misuse` family, no longer `condition`). It
  also gains `meta?` (`box_stored`, `capacity`; amended 2026-10-19, a_sec2, #206: `vault_props_stored`
  is removed, see below): stored records as storage holds them (ciphertext and visible fields) and
  counts only, never secret material; amended 2026-10-21 (C1): a refused `putBox` that finds a
  different box standing now fills `box_stored` with the whole stored record, ciphertext and
  wrapped boxKey included (see the 2026-10-19 (returning) entry; an earlier amendment of
  2026-10-19, a_sec2, #206, which said it was filled, was mistaken at the time); amended
  2026-10-21 (store_rulings, #217): **capacity.** Every `VaultDB` answers `getCapacity(scope)` ->
  `{ boxes: { used, max }, bytes: { used, max } }`, and storage's `vault_full` carries the same as
  `err.meta.capacity`. Numbers only: no names, records or ciphertext. They reveal a vault's box
  count and approximate size to the caller already authorized for that vault (the listing already
  shows the count). The base class validates the capacity (whole numbers; `Infinity` becomes
  `Number.MAX_SAFE_INTEGER`) and refuses a `vault_full` without a sound one as `corrupt_record`.
  It crosses the GraphQL wire as `extensions.meta.capacity` (amended 2026-10-22 (wire_meta): no longer; it is the `capacity`
  of `safebyokPutBox`'s answer in the response `data`); the Postgres route recipe in the
  README now sends a refusal's `meta` whole, which from a `VaultDB` verb is only `box_stored` (stale
  write) or `capacity` (`vault_full`). The vault still locks
  on `identity_revoked` and `rolled_back` from storage: `RefusalPolicy.heed` unwraps each Outcome,
  hands every bad `err` to the vault's refusal handler and awaits it, then throws it, as before --
  an interim shim until the vault's own calls are Outcome-shaped.
  2026-10-19 (a_sec2, #206): `vault_props_stored` is removed from `RefusalMeta`. Nothing ever
  filled it. Filled, it would have put every passphrase's salt and every wrapped vaultKey into a
  refusal's `meta`, and from there into `snapshot.trouble`, logs and error reporters; the Coach has
  ruled those out of the snapshot. A later refusal that wants to name the vault props storage holds
  must carry a summary instead: `vault_id`, `unlock_epoch` and the passphrase and passkey summaries.
  Amended 2026-10-22 (get_vault): `RefusalMeta.vault_props_stored` returns, carried by a
  `putVaultProps` `stale_write` as the standing vault props, checked as a read checks them (see the
  2026-10-22 entry).
  2026-10-19 (A4): every public vault call (`packages/safebyok/src/vault.ts`) now has a `tryX` form
  resolving an `Outcome` and an `X` form throwing the same `err` (`#trying`, `#throwing`). A throw
  inside a vault call that is not a `VaultError` -- a bug in safebyok, or a throw from a host
  function such as the strength checker or the key deriver,
  several of which are handed the passphrase -- becomes a `VaultError` of kind `unexpected_error`
  (family `misuse`) carrying the thrown value as `cause` (amended 2026-10-19 (put_wayin): a throw from the strength
  checker is the exception, refused `unexpected_error` with no `cause`, `meta` or kind of what it threw,
  a throw as it reads the verdict's fields included; see the put_wayin entry); it is deliberately never logged and never
  reported to the platform, since the thrown value may quote secret material, and the cause still
  reaches the caller (before, the raw throw propagated). In the `VaultDB` base
  (`src/vault-db.ts`), a non-`VaultError` throw from the adapter's `do*` hook stays
  `storage_unavailable` (retryable), while a throw from the base's own checks becomes
  `unexpected_error` (not retryable). A `do*` hook that returns an `Outcome`-shaped value (a wrapper
  `VaultDB` that forgot to unwrap another's answer, `valOf`) is refused as `bad_option`; before, a
  wrapped refusal from `doPutVaultProps` or `doDelVault` was a truthy object and read as "landed".
  `outcomeOf` kept a `VaultError` of another copy of safebyok as it came; how a foreign
  `VaultError` is now told, and where, is in the 2026-10-19 (thread a_fixes) entry.
  Amended 2026-10-19 (a_sec, #203; corrected 2026-10-19, a_sec2, #206): what a key deriver
  (`deriveKeyBytes`) or a passphrase strength test throws, both handed the passphrase, goes through
  `hostThrewRefusal` (`src/outcome.ts`), applied in `passphraseKeyOf` (`src/proof.ts`) (amended
  2026-10-19 (put_wayin), 2026-10-21: now only the key deriver's, not the strength checker's throw, which `checkStrongEnough`
  (`src/passphrase-strength.ts`; amended 2026-10-21 (wayin_rules): now `PassphraseProof.checkStrongEnough()`, `src/proof.ts`; amended 2026-10-21 (checker): through `guardStrengthChecker`; amended 2026-10-21 (checker2): thrown as a `ThrownMistake`, not
  resolved as a refusal, even from the `try` forms; amended 2026-10-21 (try_forms): `ThrownMistake` is removed, and the `try` forms resolve it as a refusal) refuses as `unexpected_error` with no `cause`, `meta` or kind
  of what it threw; see the put_wayin entry). Only a
  `VaultError` of the `condition` family, of this copy of safebyok, passes through as itself: a key
  deriver's, say. Everything else becomes `unexpected_error` with the throw as its `cause` (amended
  2026-10-21: unlike the strength checker's, a key deriver's throw rides whole, and a row stands with
  the Coach on whether the deriver should match), the treatment A6 gave `getProof`: a `VaultError` of misuse (`bad_option`, say),
  bad news, a refusal of another loaded copy of safebyok (a foreign throw, see the a_fixes entry
  above), and any non-`VaultError`. So the throw's own message is never the refusal's, and
  `safebyok-react`'s `forBoundary` then strips the cause before React's `onCaughtError`. Bad news
  from a host function is never told to `onBadNews` or put in `snapshot.trouble`. A condition's
  message, if a host deriver or test wrote one quoting the passphrase, can reach the caller, and the
  dialog shows it in place; it never reaches `onCaughtError`. On unlock, `wayin.tryOpen`
  (`src/wayin.ts`; amended 2026-10-19, slots: once `openWithPassphrase`, a walk over several passphrases) turns any `wrong_passphrase` from a way in into the vault's own
  `wrong_passphrase` (kind kept, message replaced), so a deriver's message, such as
  safebyok-fastkey's for an empty passphrase, never reaches the caller there; on the sealing paths
  (creating the vault, a new passphrase) a deriver's condition passes through as itself. The vault
  refuses a blank passphrase (empty, or only spaces) before any deriver sees it anyway (amended
  2026-10-21; amended 2026-10-21 (wayin_rules): two refusals, and `PassphraseProof.parse` refuses
  neither): as a proof, `wrong_passphrase`, whether it opens a vault that stands (`unlock()`) or
  proves a change (`standingPassphraseOf`, `src/vault.ts`: `putWayin`, `delWayin`), refused by
  `PassphraseWayin.tryOpen` (`proof.isBlank`) before any key derivation, so after the vault has read
  storage rather than at the door; as a new passphrase, `weak_passphrase`, from
  `PassphraseProof.checkStrongEnough()`, whether the first at create or `putWayin`'s new one (before,
  a blank passphrase at create was `wrong_passphrase` at the door). Before, `checkStrongEnough` rethrew
  whatever the test threw, and any `VaultError` from a deriver passed through with its message.
* 2026-10-15: `localVaultDB` and `idbVaultDB` key rows by `applabel:user_id:vaultlabel`, and
  `user_id` may hold a colon, so one user's rows can share another scope's ckey prefix. Listing
  and deleting a vault now take only ckeys whose remainder after the prefix is a bare boxlabel
  (no colon); before, a prefix match alone listed a colon-holding user's boxes in another
  user's vault. Exact ckeys cannot collide.
* 2026-10-15: the string-keyed adapters (`localVaultDB`, `idbVaultDB`, `idbDeviceDB`,
  `memoryDeviceDB`) file rows under the JSON text of a tuple -- the row's kind, the applabel,
  `user_id` and vaultlabel, and a box's boxlabel -- from one module, `Ckeys`, now exported for
  adapter authors. This replaces the colon-joined ckeys of the entry above. `JSON.stringify`
  quotes and escapes every string, so two different tuples never share a ckey whatever their
  names hold, and a vault's box prefix (its tuple's JSON up to the comma before the boxlabel)
  begins no other vault's ckeys; tests cover every split of a string of separators into four names.
  A name is encoded as given, never normalized: two Unicode spellings of one name are two vaults,
  as they are two cipher ctxs. Rows under the old ckeys are never read or moved: a vault
  stored before reads as absent, and its rows, ciphertext only, stay in storage. An old lease (a leaseKey and the vaultKey wrapped under it) would otherwise linger in IndexedDB
  beyond the reach of `lock()` and of any expiry, so `idbDeviceDB` sweeps it: `getLease` and
  `delLease` list the device shelf's ckeys and delete, unread, every one that is not a lease
  tuple (`Ckeys.isLease`). An open that finds the vault does it, and so does every lock; under
  `idbVaultDB` or `localVaultDB`, whose first open after an upgrade finds no vault (so reads no
  lease), the old row waits for the first lock or the next open after an unlock. A test proves
  no old value is fetched. `delAll()` clears the whole shelf. `memoryDeviceDB` keeps nothing past the
  page, so it needs no sweep.
* 2026-10-15: the Convex component (`packages/safebyok-convex`) authenticates in the host app,
  not inside the component (where `ctx.auth` does not exist): `SafebyokComponent.api({ getUserId })`
  builds the nine public functions the host re-exports, and each refuses unless the host's
  `getUserId(ctx)` returns a non-empty id equal to the scope's or vault props' `user_id`. The
  component's own functions check no caller and trust their `user_id` argument; Convex lets only
  the host app call them, so a host that wraps them itself, without this check, exposes every
  user's rows.
* 2026-10-15: the Convex component validates records structurally only (fields, types,
  optionality, the `format` literal); the label grammar, non-empty ids, a positive whole
  `unlock_epoch` and a sidecar's length are checked by the client's Zod records, not on the
  server. A signed-in user can therefore store malformed rows in their own vaults, which their
  own clients then refuse as `corrupt_record` (amended 2026-10-21 (fault_kinds): `damaged_box` or
  `damaged_vault`).
* 2026-10-15: the Convex component checks each update's and deletion's expectation by reading the
  standing rows inside the same mutation that writes, relying on Convex's serializable
  transactions; a failed expectation resolves `false` rather than throwing. `ensureVaultProps` is a
  find-or-insert in one mutation; the indexes are not unique, and a second vault props row for one
  scope would make every later call on that vault fail (`.unique()` throws) rather than pick one.
* 2026-10-15: the Convex component's refusals carry `ConvexError` data of a fixed `kind`
  (`not_permitted`, `vault_full`) and a fixed message; neither names the user or quotes a record.
  Its functions log nothing. Amended 2026-10-21 (store_rulings, #217): the component now answers
  `vault_full` inside `putBox`'s result rather than throwing a `ConvexError`, with the vault's
  capacity numbers beside it, so the only `ConvexError` kinds are `identity_revoked` and
  `not_permitted`.
* 2026-10-15: Convex's own argument and return validation errors quote the value they refused.
  A malformed call to one of the Convex component's functions therefore writes its arguments --
  `user_id`, scope, sidecars, ciphertext, never plaintext or keys -- into the host's Convex logs,
  and on a dev deployment back to the calling client as well. safebyok's own refusals
  (`not_permitted`; amended 2026-10-21 (store_rulings, #217): `vault_full` is no longer thrown) quote nothing.
* 2026-10-15: `convexVaultDB`, the Convex client adapter, turns a `ConvexError` whose data has a
  safebyok `kind` and a string `message` into a `VaultError` of that kind carrying that message as
  sent by the server (the component's own are fixed text). Any other error becomes
  `storage_unavailable` with Convex's error as `cause`; on a dev deployment that error's message
  may quote the arguments Convex refused (scope, sidecars, ciphertext; never plaintext or keys).
  Amended 2026-10-21 (store_rulings, #217): the client checks a box write's answer shape before
  reading it. An unknown shape (`null`, or an older component's answer) is refused as
  `corrupt_record`, saying the deployed component is out of date, never a raw `TypeError`; the
  refusal quotes nothing of the answer.
* 2026-10-15: `convexVaultDB` sets no timeout. Offline, a Convex query or mutation waits for the
  socket, and Convex resends an unacknowledged mutation on reconnect, so a write can land after
  its caller stopped waiting; a vault call waits as long as the connection is down.
* 2026-10-15: signing out of Convex does not lock a vault opened over `convexVaultDB`: its calls
  are refused `not_permitted` from then on, and its failing `watchVault` subscription is ignored,
  but the unlocked vaultKey stays in memory until the vault locks, expires or is closed. The
  README tells apps to close the vault on sign-out; nothing enforces it. *Superseded 2026-10-16*: a sign-out now locks the vault
  (`identity_revoked`, below).
* 2026-10-15: a vault's box count is capped on the client (`maxBoxes`, `putBox()`
  refusing `vault_full`), counted from the handle's last look at storage, so stores of new
  boxes running at once -- on several devices, or on one handle, since nothing serializes
  them -- can overshoot it. Neither local backend (`idbVaultDB`, `localVaultDB`) enforces a count
  or a size per vault; the Convex component does (next entry).
* 2026-10-15: the Convex component holds every vault to 8,000 boxes and 7 MiB less 1 KiB of
  box rows (as `getDocumentSize` from `convex/values` weighs them), constants in
  `src/component/tallies.ts` derived from Convex's per-transaction limits so that `delVault`
  (reading every row twice, beside vault props of up to one 1 MiB document) always fits; neither the
  client nor the host can change them. `putBox` checks them against a per-vault tally row
  (`safebyok_vault_tallies`, keyed by the vault props' row `_id`) updated in the same transaction as
  each box write and deletion, and refuses, writing nothing, a write that leaves the vault over a
  limit and larger than before, with `ConvexError` kind `vault_full` and fixed text (amended
  2026-10-21 (store_rulings, #217): answered inside the mutation's result, with the capacity numbers,
  not thrown). Replacements
  no heavier and all deletions are never refused. A vault with no tally (written before tallies) is
  counted at its next `putBox`, reading its rows only until a limit is passed; an over-limit
  vault keeps no tally and refuses all growth until deletions bring it back. The tally is trusted as
  kept: a rollback to a component version without tallies, followed by a roll forward, leaves
  tallies stale for vaults written meanwhile (deleting the table's rows makes every vault
  recount). Before this, a vault grown past the client's cap (by a modified client, or many
  overshoots) could become impossible to delete whole: the vault half of deleting an account.
* 2026-10-15: records crossing into the core are checked where they cross, and trusted past it.
  A host's `putBox()` sidecar is checked against the stored box's own schema before anything is
  written (an unchecked over-long sidecar once made every later `hello()` refuse the vault as
  `corrupt_record`). Whatever a `DeviceDB` hands back -- the host may supply its own -- is checked
  against `LeaseRecord` by the vault (through `Lease.make`, amended 2026-10-19), and one that does not pass is erased and reads as no
  lease. `VaultDB`'s write verbs check labels and scope only, not the records the
  vault builds. A lease's `ask_passphrase_at` is not bound into its encryption, so
  whoever can write this device's IndexedDB can extend it (to any finite number of milliseconds).
  (Bound since: the sweep entry below.)
* 2026-10-14: releases run from `.github/workflows/release.yml` on every push to main, in jobs
  that each hold only what they need. Only `publish` (in the `npm` environment) may mint an npm
  OIDC token, and it runs no package's scripts (`pnpm install --ignore-scripts`): it stages the
  tarballs the `pack` job built, linted and tested without that token. The trusted publisher
  allows `npm stage publish` only, so every version still waits for the Coach's 2FA approval.
  `scripts/release.ts` refuses a tarball whose `package.json` still holds a `workspace:` range,
  and quotes only npm's error code and summary, never the rest of what npm printed. No release
  job caches dependencies or persists git credentials.
* 2026-10-15: the release workflow's `version` job opens and updates the Version PR with an
  installation token from a GitHub App, minted by `actions/create-github-app-token` from a
  private key held as a secret of the `releasing` environment, which only `main` may deploy to.
  The token is narrowed to contents and pull requests (write) on this repository; the job's own
  GITHUB_TOKEN reads only. Its commits go through the GitHub API, signed by GitHub and attributed
  to the App.
* 2026-10-15: the GitHub App's private key (`RELEASE_APP_PRIVATE_KEY`, with `RELEASE_APP_ID` as a
  variable) is a secret of the `releasing` environment, which only `main` may use
  (#27, eed83f0). Whoever holds the key can mint installation tokens for the App with every
  permission the App was granted, however narrowly `release.yml` asks for its own; the key never
  expires, and revoking it means generating a new one in the App's settings. In the workflow only
  the `create-github-app-token` step receives the key. The token it mints (contents and pull
  requests write on this repository, short-lived) goes to the changesets action, which also runs
  `pnpm release:version`, repository code from main's tip, in the same job: so what merges to main
  can use that token when it next runs. The token can create branches and tags and open, edit and
  close pull requests; whether it can also push to or merge into `main` depends on the branch
  protection's allowances for the App, which this repository's files do not record.
* 2026-10-15: the `publish` job, the only one that can mint an npm token, installs npm 12.2.0
  from a tarball checked against the sha512 `dist.integrity` recorded in `release.yml`, offline
  (npm bundles its dependencies), so a changed tarball on the registry stops the job instead of
  running beside the token. Moving npm means recording the new version's integrity by hand.
* 2026-10-15; 2026-10-18 (reform, thread 2, `20261018-no_retry`): `putBox()` makes one attempt and
  no longer retries a write storage refused as stale. It reads the box, seals, and writes under the
  versioned expectation (same `vault_id`, same `revision_tok` or none; amended 2026-10-21 (trust_lines): it once also had the
  same `vault_key_epoch`, a field now removed). On a
  `stale_write` refusal it catches up with storage once and throws `stale_write` (nothing written;
  the adapter's refusal is the `cause`); a catch-up that relocks the device (vault reborn, or its
  wayins changed) throws `vault_locked` with nothing written, and one that fails throws as it came
  (`stale_write` with the failure as cause, `identity_revoked`, `rolled_back`, `newer_format`). A
  box deleted elsewhere is now just a stale write. So no whisper is sealed over what another device
  wrote without the caller's say, and no jittered wait or `crypto.getRandomValues` draw remains in
  the path. Until 2026-10-18 a refused store tried up to three times (waits of 1-2 s, then 2-4 s,
  jittered), each attempt sealing anew under its own boxKey and `revision_tok`, and overwrote
  the other device's box (last writer wins) unless it found the box deleted (a deletion wins). Still
  load-bearing: the versioned write (a stale tab cannot resurrect a deleted box, and a
  box sealed under a deleted vaultKey never lands) and the damaged-box handling below; `delBox()` is
  never retried.
* 2026-10-15: the published package has a `safebyok/testing` entry point of test helpers
  (the `TH` namespace of its tests), among them `testDeriver`, a KeyDeriver that is one SHA-256
  of passphrase and salt, labelled `test_digest_v0`. `Vault.make` accepts any KeyDeriver, so
  nothing stops a host passing it to a real vault; vault props record the label of the deriver that
  sealed it. The entry imports vitest, an optional peer, and is not imported by `safebyok`,
  `safebyok/browser`, `safebyok/idb` or `safebyok/utils`.
* 2026-10-15: the public packages' `exports` carry a `@safebyok/source` condition pointing at
  `src/`, for the workspace's own tooling; `pnpm pack` ships `publishConfig.exports` (dist only)
  instead. `scripts/release.ts` refuses a tarball that still carries the condition, and each
  public package's `prepublishOnly` refuses a publish not run by pnpm.
* 2026-10-15 (across tabs and on `close()`, revised 2026-10-16 by locks_and_expiry, below); 2026-10-19
  (20261019-softlock_gone: **the per-handle lock counter described here is gone, and a lock no longer
  defeats an `unlock()` or `putWayin()` under way, in this tab or another; last writer wins,
  see "one kind of lock" below; an unlock still takes up nothing when the handle has closed or the vault
  props it proved against no longer stand; the rest describes what stood until then**): a
  `lock()` (or `del()`) called while an `unlock()` or `putWayin()` is
  still under way wins. Each lock moves a per-handle counter; the unlock reads it at its start
  and again after each wait (the vault props read, the key derivation, the lease's write),
  and on finding it moved takes up no vaultKey, erases a lease it had already written,
  and throws `vault_locked`. A vault that unlock was creating stays created, locked. A passphrase
  change still lands in storage (its proof is the old passphrase, not the unlock), and only its
  unlock is dropped. The counter is per handle: a lock in one tab does not reach an unlock under
  way in another, beyond both writing the one lease. The undoing erase is
  unconditional, so it can also erase a record written by a second unlock begun after the lock
  on the same handle; that device then asks for the passphrase at its next open. An unlock (or
  the unlock after a passphrase change) also takes up nothing, and throws `vault_locked`, when the
  vault props standing at its end are not the ones its passphrase was proven against, by `vault_id` and
  `unlock_epoch`: a vault deleted, remade, or re-keyed elsewhere while the passphrase was
  being checked. Without that, the old vault's vaultKey was taken up against the new vault props, and a
  `putBox()` sealed boxes into the new vault that its owner could never open.
* 2026-10-15 (`close()` and the timer revised 2026-10-16 by locks_and_expiry, below); 2026-10-19
  (20261019-softlock_gone: **`lockSoon()`, its grace and the shut counter are gone**; the one lock
  drops the key at once, and an unlock under way on a closed handle still takes up nothing; the
  rest describes what stood until then):
  `lockSoon(graceSeconds = 5)`, at most 60 seconds, closes the entry gate at once
  (`askPassphraseAt` cleared, so the snapshot reads `locked` and every operation started
  afterwards throws `vault_locked`; cleared rather than set to now, which a wall clock stepped
  back would reopen), revokes the lease at once, and moves the shut counter
  (an unlock under way loses); a `setTimeout` drops the in-memory vaultKey after the grace. In the
  grace, `delBox()`'s second look checks only that the key is still held, not `askPassphraseAt` (amended
  2026-10-18: this once named `putBox()`'s retries too; it now makes one attempt), so an operation begun before the gate closed finishes; under natural
  expiry too, an operation begun before `askPassphraseAt` now finishes past it. An `unlock()`
  that lands in the grace cancels the timer, including one begun in the grace and still deriving
  when it would have fired: the timer does not move the counter. A second `lockSoon()` never
  lengthens a grace, only shortens it. `close()` now moves the counter and drops the key from
  memory (clearing the timer) but leaves the lease: an unlock under way on a closed
  handle writes no record (erasing one it already wrote) and throws `vault_closed`. The timer is
  per handle and per tab, like the counter.
* 2026-10-15: `VaultProvider` hands a stored record that fails verification at open
  (`corrupt_record`; since 2026-10-16, `damaged_vault`) to the app in place, as `openError`, rather than throwing it to the error
  boundary: it is a condition, as are `storage_unavailable` and `not_permitted`. A tampered or
  damaged vault props therefore reaches the app's own UI, beside a `retryOpen` that cannot mend it; the
  React README tells hosts to branch on `openError.refusalkind`, and the error's message carries no
  secret material. Misuse still goes to the boundary.
* 2026-10-15: every validator in the core is `zod/mini` (`import * as Z from 'zod/mini'`; the
  core's lint refuses classic `zod` in `src/`). Same checks, limits and messages as before; mini
  shares classic's parsing core, and the test suite passes against zod 4.0.0, the peer range's
  floor, as against the current 4.6. Mini loads no locale, so a zod issue's default message is
  generic, but no zod message reaches a caller of the vault or its VaultDB: every refusal there
  is a VaultError of our own wording (amended 2026-10-21 (checker): the options-bag refusals now carry
  Zod's English message; see the `putBox()` unknown-keys entry). A host calling an exported schema's `.safeParse` itself
  gets zod's issues, which name paths and limits but carry no input (zod's `reportInput` is
  off). The build keeps each module its own file in `dist/` (`unbundle`), so a host's bundle
  carries only the modules its imports reach. Amended 2026-10-21 (fault_kinds): a `damaged_box` or
  `damaged_vault` refusal for a stored record that failed its schema now carries Zod's error as its
  `cause`, so a Zod message does reach a caller there. `reportInput` stays off: an issue's path can
  name a stored sidecar's keys, never its values. A test checks that each damaged refusal's message,
  stack, `cause` and JSON hold no ciphertext and no sidecar text.
* 2026-10-15: every `VaultDB` write verb validates its record and its expectation against the
  schemas its reads use, before the adapter's half sees them, so the core never writes a record
  its own read would refuse (an over-long sidecar once did, and the vault could not be opened again);
  Zod strips a field it does not know, so none reaches storage. `putVaultProps` refuses vault props
  whose `vault_id` differs from the expected one. Listing still validates only what a listing
  shows: a box whose ciphered fields are damaged lists, and is refused at `getBox()`, so one
  damaged box never makes the vault fail to open; such a box cannot be stored over or deleted
  either (both read it first), only deleted along with its vault. A lease naming another
  scope is discarded before any unwrap; its `vault_key_lease_wrapped` ctx would refuse it
  anyway. The vault-size check counts each box at twice `maxWhisperBytes` plus 2 KiB for its
  other fields against the adapter's whole `maxVaultBytes`: the same outcomes as half the limit
  with 1 KiB, with the fields' allowance now covering them (a test builds the heaviest row) while
  `user_id`, which nothing bounds, is at most 512 bytes; a longer one, or a sidecar a JSON-text
  backend escapes, eats into the room the doubled whisper leaves.
* 2026-10-15: a host may choose its key derivation. `argon2idDeriver(spec)` takes a whole
  Argon2id parameter set and a label of the host's own, and runs it through `@noble/hashes` as
  the supplied deriver does: parameters, not a new construction. `Argon2idWebV1` stays the one
  supplied spec and what `browserOpts()` uses; no other was added (RFC 9106's first recommended
  option needs 2 GiB, past what `@noble/hashes` allocates; its second differs from ours only in
  four lanes, which a single-threaded JavaScript deriver runs one after another; OWASP's figures
  are server minimums, below ours). **Refused** (`bad_option`), as what cannot run: a salt under
  8 bytes (`@noble/hashes` and Argon2's reference code refuse it, so a 1-byte salt is refused
  here) or over 65536 (`getRandomValues`' most), memory under 8 KiB a lane or over 1 GiB, no
  passes or lanes, a key other than 32 bytes. **Allowed**, as foolish but workable: anything
  weaker within those bounds -- 8 KiB of memory, one pass. Any `keyDeriver` `Vault.make` takes needs
  a `salt_bytes` from 1 to 65536 (a non-Argon2 deriver, such as `testDeriver`, may take a 1-byte
  salt), and the vault refuses a `deriveKeyBytes` that hands back anything but 32 bytes, before
  wrapping anything: WebCrypto would otherwise accept 16 or 24 as a weaker AES key. **Enforced**:
  a deriver now carries its spec's fields beside its function, and `Vault.make` and
  `argon2idDeriver` refuse one wearing a supplied spec's label (`argon2id_web_v1`) without
  carrying exactly that spec's parameters, so a WebAssembly or native stand-in cannot quietly
  derive under others and strand vaults across devices. This checks what a deriver declares, not
  the bytes it derives: a stand-in is the host's to test against `argon2idWebV1Deriver`. A host's
  own label is not checked against anything, since a vault stores only the label; the host must
  never change a label's parameters. The stored format is unchanged.
* 2026-10-15; 2026-10-19 (slots): vault props hold two slots, `passphrase` (required) and `passkey` (or null), each
  the one vaultKey wrapped under its own key (until slots, a list of one to `MaxUnlocks` (8), each with a
  `wayin_id` and a `wayinlabel`). The passphrase wayin has its own random `salt_b64`, and its wrap's
  additional data is the format, scope, `vault_id`, the vault props' `registered_at` (amended 2026-10-21 (trust_lines): no longer bound), a purpose per wayinkind
  (`vault_key_passphrase_wrapped`), and the wayin's whole visible header (`wayinkind`,
  `key_deriver_label`, `salt_b64`, `vault_key_epoch` (amended 2026-10-21 (trust_lines): no longer in the header), `device_id`, `registered_at`) as key-sorted
  JSON. The
  `unlock_epoch` is not in it, since a change to one wayin bumps the epoch and the
  other, whose key the device does not hold, must still open: a backend can therefore
  splice a wayin from older vault props of the same vault (a replaced passphrase's, or a removed
  passkey's) into the current one, and that old passphrase opens the vault again, as it
  always opens the older vault props themselves. The purpose keeps one slot's record from opening as the
  other's; which record fills a slot, and the vault props' other fields, are not bound.
* 2026-10-15; 2026-10-19 (slots): removing a wayin (`delWayin`, which since slots removes the passkey,
  refusing `absent_wayin` where there is none; the passphrase can never be removed) is not revocation. Whoever knew the
  removed passphrase and kept any earlier vault props holds the vaultKey, which never rotates; the
  removal bumps `unlock_epoch`, so devices unlocked under it lock at their next look, and no
  removal can leave the vault with no way in, for the passphrase stays (amended 2026-10-21: this
  once named a `last_wayin` refusal, which no longer exists). Every change to the wayins
  (`putWayin`, `delWayin`) asks for the standing passphrase (see the slots entry),
  even on an unlocked vault: the session's vaultKey handle is non-extractable, so wrapping it
  anew needs the extractable transient that a proof unwraps.
* 2026-10-15; 2026-10-19 (slots): a passphrase costs exactly one key derivation to try. Until slots, an
  `unlock()` or a proof not aimed at one wayin (`wayinId`) tried each passphrase wayin in the vault
  props' order, one derivation apiece, a wrong passphrase costing as many as there were wayins, at most
  `MaxUnlocks` (8, about 4.8 s with the noble deriver in Node 24), a bound enforced on read, so a
  backend could not make one unlock derive more, and how long the unlock took showed, on the device
  only, which wayin opened. Now the vault picks the slot by the proof's kind and the one passphrase
  wayin is tried; stored data cannot multiply the cost. A passphrase wayin made by a key deriver the
  vault was not opened with refuses `unknown_key_deriver`.
* 2026-10-15: a wayin may be a passkey (WebAuthn PRF extension; a security key's `hmac-secret`).
  Its wayin holds `credential_id` and `prf_salt_b64` (32 random bytes, minted by the React
  binding's `createPasskey` with `crypto.getRandomValues`, checked for length by the core). The
  passkeyKey is HKDF-SHA256 over the 32-byte PRF answer, with an empty salt and `info` =
  `["safebyok-vault-v1", "vault_key_passkey_wrapped", credential_id]` as JSON when first written, under the older tag `safebyok-vault-v1` (since the sweep
  entry below, the wrap's whole additional data); the wrap's additional
  data is the format, scope, `vault_id`, the vault props' `registered_at` (amended 2026-10-21 (trust_lines): no longer bound), purpose `vault_key_passkey_wrapped` and the wayin's
  visible header, as for a passphrase wayin. A stored salt that is not base64url of 32 bytes
  refuses as `corrupt_record` (since 2026-10-16, `damaged_wayin`: see that entry), checked at unlock rather than in the schema (the size budget, as for
  passphrase salts). The core never calls WebAuthn and never stores the answer; the answer passes
  through host JavaScript as a `Uint8Array` the vault does not wipe.
* 2026-10-15: what a passkey wayin rests on. The PRF answer is a long-term secret as strong as a
  passphrase for that vault, and needs no key derivation to try, so a captured answer opens the
  vault (and every copy of its vault props) for good. The authenticator gives it only after user
  verification (`userVerification: 'required'` on every call, which also keeps the answer stable:
  hmac-secret answers differently with and without UV). A platform passkey synced by iCloud
  Keychain or Google Password Manager answers on any device signed in to that account, so the vault
  then rests on that account's security too. Any script running on a page under the passkey's RP
  ID can ask the authenticator for the answer (with the user's touch), as it could read a typed
  passphrase. The credential's challenge is random and never verified, and no attestation is
  checked: the authenticator is the user's to trust.
* 2026-10-15; 2026-10-18; 2026-10-19; 2026-10-20: **every field a record writes is bound, unless a reason below says not** (the
  Coach: "make everything verifiable unless there's a good reason not to"). A passkey wayin's
  HKDF `info` is now its wrap's whole additional data -- format, scope, `vault_id`, the vault props'
  `registered_at` (amended 2026-10-21 (trust_lines): no longer bound), purpose, and the wayin's visible header (`wayinkind`, `credential_id`,
  `prf_salt_b64`, `vault_key_epoch` (amended 2026-10-21 (trust_lines): no longer in the header), `device_id`, `registered_at`; until slots also `wayin_id` and
  `wayinlabel`) -- so the passkeyKey itself, not only the wrap, belongs to one vault
  and one wayin; HKDF info and AES-GCM additional data are the same bytes, fed to different
  primitives. (2026-10-20, placement: `Wayin.seal` now builds a wayin's ctx once, in its kind's keying
  helper, and uses that one value both as a passkey's HKDF `info` and as the wrap's ctx; it was built
  twice from the same inputs. No bytes changed; the key derivation and the wrap are bound to the same ctx
  by construction, not by two calls agreeing.) (2026-10-19, #201: `PasskeyProof.wayinKeyFor(wayin)` runs that HKDF over the PRF bytes with
  the wayin's whole wayinCtx as `info`.) Every wayin's wrap binds the vault props' `registered_at` (amended 2026-10-21 (trust_lines): it binds the vault's scope and `vault_id`, not the vault props' `registered_at`, which a backend can alter without stopping a wayin opening; the wayin's own `registered_at` stays in its header, bound). A box's two
  encryptions bind its whole visible header (`format`, `boxlabel`, `revision_tok`, `sidecar_json`
  (amended 2026-10-21 (trust_lines): `sidecar`, bound as its key-sorted JSON),
  `registered_at`, `written_at`: every field but the two ciphered ones, as Zod's parse leaves the
  record), so a backend that alters a sidecar or a time
  makes `getBox()` refuse `corrupt_record` (amended 2026-10-21 (fault_kinds): `damaged_box`); a future field is bound the day it is added to the
  schema. While the vault is locked, the listing still shows these fields unverified: nothing
  checks them before a box is opened. The lease binds `ask_passphrase_at`, under its own
  format tag (`safebyok-lease-v1`; `safebyok-unlock-v1` was 0.3.0's tag, formerly the vault props', and a
  record under it is not read); a deadline moved on the device now
  fails to open and is discarded, so the discarding is logged. No compatibility: every passkey
  wayin, box and lease written before refuses to open (`wrong_passkey`,
  `corrupt_record`, a fresh passphrase prompt), and a passphrase wayin refuses its passphrase.
  **Left unbound, and why**: the vault props' `unlock_epoch` and which records fill the two slots
  (until slots, the list's order, length and membership), because each wayin's key is held only by
  its own wayin, and a change to one must not rewrap the other (the 2026-10-15 wayin entry above:
  an old wayin can be spliced back); the passphraseKey's derivation, which takes no context: its salt is fresh for every
  wayin and bound in the wrap, so the key wraps exactly one thing, and binding it further would
  put Argon2's associated data into the host-pluggable `KeyDeriver` seam and every stand-in
  behind a label, for no added check; the PRF salt, which is random and already bound; and the
  stored ciphertexts and IVs, which the AEAD tag covers. An adapter's own columns are never in a
  record, so never bound. Were an Argon2 setting ever to go in, it would be as a difficulty
  measure -- a floor on the cost a vault accepts from its stored deriver label -- not as part of
  the ctx (the Coach, 2026-10-16).
  (2026-10-18, with the rename of the device record to the "lease": the device record's context
  changed spelling, not construction. Its first part, the format, is now `safebyok-lease-v1`, and
  its last, the purpose, `vault_key_lease_wrapped`; the parts between and their order are as
  before, joined by the same `cipherCtx`, and the box and wayin contexts did not move.
  `tests/ctx-bytes.test.ts` pins the new bytes. A `safebyok-unlock-v1` record is not read: it fails
  validation and is erased, and the IndexedDB device store, which now files leases under `lease^`
  rather than `unlock^`, deletes the old row unread at its next lease read or erase. The user
  proves once more on each device; there is no migration. The device mark (lock generation and
  seen-vault record) is untouched. Amended 2026-10-19: the lock generation is gone; the mark
  holds only the seen vault.)
* 2026-10-15; 2026-10-19 (slots, the Coach's ruling): **only the standing passphrase proves a change to
  the ways in.** Until slots, any wayin proved any change: a passkey's answer was accepted by
  the calls that set a new passphrase, put a passkey or remove a wayin (`putWayin`, once `addPasskey`,
  `changePassphrase` and `addPassphrase`, and `delWayin`), so whoever held one passkey could set a
  new passphrase and remove the user's others, and the vault was as strong as its weakest wayin. Now
  `putWayin(passphrase, ...)` and `delWayin(passphrase)` take the
  passphrase, and a passkey's answer handed as the proof is refused `bad_option` before anything is read or
  derived. A passkey opens and reads the vault but cannot change who may. A vault always keeps its
  passphrase wayin (it can never be removed), and is created with one. `createPasskey` registers each passkey under a random user handle, so it cannot replace
  a sign-in passkey on the same RP; removing a passkey from the vault does not delete it from the
  authenticator, and (as for passphrases) is not revocation.
* 2026-10-15; 2026-10-19 (put_wayin): the proven vaultKey's extractable transient handle
  (`wrapKey` usage only) is held from the proof until the new wayin is sealed and the lease wrapped
  (amended 2026-10-21: the lease wrap, `#grantLease`, comes after the seal). It was held across a
  WebAuthn prompt, human time, bounded by the prompt's `timeout`: `addPasskey` proved first and asked
  the authenticator after, so a refused proof left no orphaned passkey. That prompt is gone:
  `putWayin` takes the passkey's answer, made by the host before the call, and calls no host code
  mid-flight, so the handle lives for one proof, one seal and one lease wrap (not human time, and no host timeout
  bounds it). Acceptable because the handle lives only in a closure inside `reviseWayins`, never in
  the snapshot, a field or an error, so no host script can reach it, and a script able to hook
  SubtleCrypto already sees every unwrap; while unlocked the session's non-extractable handle opens
  every box anyway, and extractability adds only the export of the raw bytes. The cost of the
  change is the orphan (see the put_wayin entry). Amended 2026-10-19 (put_wayin): this entry said a
  `lock()` during the prompt does not cut the change short, "the passkey still lands and the vault
  stays locked". The vault never stayed locked: `reviseWayins` grants this device's lease once the
  write has landed, whatever a `lock()` did meanwhile. A `lock()` landing while a `putWayin` or a
  `delWayin` is under way does not stop it: the change lands, and this device ends unlocked with a
  fresh lease. Lock timing against work in flight is left to a later policy session (the Contract
  says "Not yet promised. Until the policy is settled, the last writer wins").
* 2026-10-15: `safebyok-postgres` authorizes on the server, per request: `postgresVaultDB` is
  made with the `userId` the host's auth verified, and refuses (`not_permitted`) any other user's
  scope, or any while signed out, before querying; that check is the whole of the authorization.
  Row-level security is on with no policy (the owner role bypasses it; every other role,
  Supabase's Data API roles among them, reaches no row). The NOTIFY payload is the scope, which
  any role able to connect may LISTEN for. The server holds a vault to a box count of its own
  (see the `maxBoxes` entry below), and to no size in bytes. Past
  scope and boxlabel, a route's vault props, boxes and expectations are validated only as the
  core's VaultDB validates them. A driver's error rides as `cause` and may quote key columns, or
  (a malformed record refused by a NOT NULL) the whole failing row, its ciphertext included; the
  README's route recipe sends the browser only a refusal's kind and message (amended 2026-10-21
  (store_rulings, #217): and its `meta`, whole: only `box_stored` or `capacity` from a `VaultDB` verb).
* 2026-10-15: `safebyok-graphql` carries the verbs over GraphQL and authorizes nothing itself:
  each resolver calls the VaultDB `vaultDBFor(context)` makes for the request, so the rule is
  `postgresVaultDB`'s (or the host's own ServedVaultDB's), fed the user the host's auth verified.
  A refusal crosses as a fresh GraphQLError holding only the VaultError's message and
  `extensions.kind`; the VaultError (and through it the driver's error) is kept as that error's
  unenumerable `cause`, set after construction, never as its `originalError`: Yoga masks an error
  whose original is not a GraphQLError, and in development mode sends the original's message,
  stack and `cause` to the browser. Anything a VaultDB throws that is not a VaultError crosses as
  `storage_unavailable`. Wayins cross as opaque JSON that GraphQL does not check; only
  the core's VaultDB validation does, so a user can write a malformed wayin into their own
  vault and no one else's. The browser's urql Client may keep vault records (ciphertext and unencrypted
  fields) in its document cache, though every vault query is `network-only` and never answered
  from it. A subscription's user is fixed when it starts (over a websocket, when the connection
  opened), so a session revoked meanwhile keeps hearing the vault's scope -- never a record --
  until the subscription ends.
* 2026-10-15: **a second implementation behind one label.** `safebyok-fastkey` runs Argon2id
  through `hash-wasm` (4.12.0, MIT, no dependencies; its Argon2 is C written for it after Go's
  `x/crypto/argon2`, compiled to WebAssembly and embedded in its JavaScript; widely used, but
  with no published audit, as the core's `@noble/hashes` Argon2id has none: its README says its
  one audit left `argon2` out of scope), under the same specs and
  labels as the core's `@noble/hashes` deriver, `argon2id_web_v1` included. It checks a spec with
  the core's own `parseKeyDeriverSpec`, so its bounds are the core's by construction; hash-wasm's
  own limits (a salt of at least 8 bytes, memory of at least 8 KiB a lane, below 4 GiB) are no
  narrower. That the two derive the same bytes is a test, not a claim: both are held to Argon2id's
  reference test vector, and to each other byte for byte across the supplied spec and cheap specs
  that press on lane counts, memory not divisible into segments, the shortest and longest salts,
  and non-ASCII passphrases; a vault made under each opens under the other. A difference would
  strand vaults across devices rather than weaken them. Its derivation runs in one synchronous
  WebAssembly call (about 130 ms at `argon2id_web_v1` in Node, against the core's 580 ms), so it
  holds the thread rather than yielding as the core's does. It needs `'wasm-unsafe-eval'` in a
  page's Content-Security-Policy, and refuses (`bad_option`) where WebAssembly will not compile
  or is missing (Hermes): it never falls back to another deriver on its own. Unlike
  `@noble/hashes`, which zeroes its Argon2 blocks and H0 when a derivation ends, hash-wasm leaves
  its working memory (the spec's whole memory_kib, in a fresh WebAssembly instance, and in Node
  the passphrase's UTF-8 bytes in a pooled Buffer) as it is, for the garbage collector: material
  from which the passphraseKey follows stays in the heap until then.
* 2026-10-15: **Dependencies: hash-wasm has no published audit.** `safebyok-fastkey`'s one
  runtime dependency, `hash-wasm`, derives the passphraseKey for every vault made or opened
  through it, and no audit of it, or of the C its WebAssembly is compiled from, has been
  published. Nor has one of the core's Argon2id: `@noble/hashes`'s one audit (Cure53, January
  2022, at 1.0.0) left its `argon2` out of scope. hash-wasm's working memory is never zeroed
  (the entry above).
* 2026-10-15: the IndexedDB vault store moved to a package of its own, `safebyok-indexeddb`, and
  each of its write verbs (`ensureVaultProps`, `putVaultProps`, `putBox`, `delBox`, `delVault`)
  is now one readwrite IndexedDB transaction, which reads the standing rows, compares them with
  the expectation, and writes; a failure anywhere in it aborts it, writing nothing. IndexedDB runs
  readwrite transactions over one store one after another, across the origin's tabs, so the
  windows the `idbVaultDB` entry above records are closed: no write lands over a row another tab
  changed meanwhile, two tabs creating a vault settle on one, and no box outlives a deleted
  vault. The guarantee rests on the work inside awaiting only IndexedDB's own requests (awaiting
  anything else lets the browser commit the transaction early, and the next request throws);
  `src/shelf.ts`'s `inOneTransaction` says so. Its rows, ckeys and database name are unchanged,
  and its change bell, a BroadcastChannel per database, still carries no scope and no record.
* 2026-10-15: every `VaultDB` declares a `maxBoxes`, the most boxes its backend holds in
  one vault (`Infinity` for none), and `Vault.make` refuses (`bad_option`) a `maxBoxes` above
  it, defaulting to the smaller of it and `MaxBoxes`. The core offers no "unlimited" constant:
  each store sets its own. `localVaultDB` and `idbVaultDB` declare `Infinity` and enforce nothing;
  `convexVaultDB` declares the component's 8,000; `graphqlVaultDB` declares what its host says the
  server enforces (default 1000), which only moves `Vault.make`'s check: the server's own refusal
  is the limit. `postgresVaultDB` enforces its `maxBoxes` (default 1000; a host wanting none
  passes a large safe integer) as a best effort, inside the one statement that inserts a new
  box (see the 2026-10-16 entry below, which replaced a counter column and a row lock). The
  refusal's message names the limit, never a boxlabel or a record.
* 2026-10-15: a host's own checks replace ours for every name
  (`Vault.make({ validators })`, any Zod 4 schema), with no floor beneath them, since the ckeys
  (JSON tuples) and the cipher ctx (a JSON array) take any text. What holds: **a check only
  checks** -- what the host passed is what is stored and bound, never the schema's output, so a
  trimming or lowercasing schema cannot move a user to another vault or strand ciphertext; **the
  refusal is ours**, `bad_label` or `bad_option`, naming the field and never quoting the name or
  the schema's issues; a schema that is async or throws is refused as misuse, never taken as a
  pass, and the refusal carries nothing of what it threw (no `cause`), as a refine that throws
  may quote the name, and any text, a pasted key among it, may now be one.
  **Every name is checked everywhere**: the vault and every `VaultDB` verb check with the same
  bag, records read back included, so a stored row whose name the vault's checks refuse
  is `corrupt_record` (amended 2026-10-21 (fault_kinds): `damaged_box` or `damaged_vault`), not trusted; the bag never reaches storage or the Convex server, which take
  any text. The stored records (`Box`, `VaultProps`, `LeaseRecord`, `VaultScope`) now check
  names only as text. (Until slots, so did a wayin's `wayinlabel`; wayins no longer carry one.) A host's schema runs on names only, never on a whisper, a sidecar or a
  passphrase. A host that admits any text (`AnyTextValidators`) shows its users labels that may
  carry bidirectional or invisible characters, a spoofing risk in its UI that is the host's to
  mind. **Sizes**: with names unbounded, the static 2 KiB allowance no longer bounds a
  box's other fields. It stays only as `Vault.make`'s plan for `maxBoxes` at the default
  checks; `putBox` now weighs each box with its scope as the UTF-8 bytes of its JSON and
  refuses one over the adapter's `maxRecordBytes` (`box_too_large`), and each `putBox()`
  refuses a box heavier than the one it replaces when the vault, each box counted at twice
  `maxWhisperBytes`, 512 bytes for its fixed-size fields and its measured names and sidecar, would
  pass `maxVaultBytes` (`vault_full`). The vault's total is reckoned from the snapshot's listing,
  so a vault another device filled meanwhile is caught by the backend's own limit, as before.
* 2026-10-15; 2026-10-19 (a_sec, #203): `PassphraseModal` and `PasskeyUnlockButton` (`safebyok-react`) catch, in an error
  boundary of their own, every failure that is not a condition (misuse, or anything that is no
  `VaultError`, whatever its value), and show the user fixed copy, never the error's message. React
  hands the very thrown value to the host root's `onCaughtError` (the console by default), as it
  would any error a boundary catches; before, it went to the host's boundary instead. The dialog's
  form, and the passphrase typed into its state, unmount with the failure.
  Amended 2026-10-19 (a_sec, #203): everything rethrown now passes `forBoundary`
  (`packages/safebyok-react/src/boundary.tsx`): a `VaultError` keeps kind, message and meta but never
  its `cause` (which for `unexpected_error` can be a host key deriver's throw, handed the passphrase;
  a strength checker's throw carries nothing, amended 2026-10-21), and anything that is not a `VaultError` becomes a fixed `unexpected_error`
  quoting nothing of it, so "the very thrown value" above no longer reaches `onCaughtError`. A host
  `passphraseAdvice` that throws (it is handed every keystroke of a new passphrase) is replaced at its
  source with a fixed refusal, so even a `VaultError` it threw carries nothing on. Amended 2026-10-21
  (checker): a `passphraseAdvice` that throws a `VaultError` had that `VaultError` reported as it
  came. Amended 2026-10-21 (checker2): no longer. A host's own `passphraseAdvice` that throws is
  always reported as a fixed `unexpected_error` quoting nothing of it, so a host `VaultError` quoting
  the passphrase is not reported as it came. With no `passphraseAdvice` the dialog asks
  `vault.checkPassphrase`, and what that throws, and what `ask.attempt` throws, goes on through
  `forBoundary` (which strips any `cause`) to the app's error boundary above the dialog's own; the
  vault's own check's thrown error goes on as itself, since it quotes nothing. Amended 2026-10-21
  (checker2): as the boundary takes the dialog away on such a throw, the dialog answers `declined`
  to the ask it was showing, so the call that asked is refused `vault_locked` and no unlock waits
  forever (before, it never answered, which under a host's own `getProof` held every later prompt
  behind it). A dialog a thrown mistake tears down always answers. Amended 2026-10-21 (try_forms):
  a host strength checker that throws or answers no verdict no longer reaches the app's boundary from
  the dialog: `ThrownMistake` is removed, `ask.attempt` resolves the refusal (`unexpected_error`
  carrying nothing, or `bad_option`), and the dialog shows its calm "Something went wrong" notice
  and reports the refusal to React as it does any other misuse (through `forBoundary`, as above).
  The report names
  its component (`PassphraseModal` or `PasskeyUnlockButton`) and, for a `VaultError` whose cause was
  stripped, says in its message that the cause was left out. `meta` is passed through as is. The
  dialog's fallback notice once misuse trips it ("Something went wrong") now shares
  the dialog's one answer: a lock landing closes it answering `declined`, and a vault unlocked under
  it answers `unlocked`; its Close no longer answers `declined` over a vault that has since unlocked.
* 2026-10-16 (revised the same day by refusals_and_catchup, below: `whenIdentityRevoked` is gone, and `rolled_back` locks too): **a sign-out locks the vault.** An adapter whose backend knows who is signed in
  refuses a vault whose `user_id` is not that user -- signed out, or another user signed in --
  with kind `identity_revoked`, distinct from `not_permitted` (the vault's own user refused one
  call). Convex, Postgres (and so GraphQL over it) refuse both of their old `not_permitted` cases
  this way now; IndexedDB and `localVaultDB` never do. Every storage verb's refusal passes through
  one policy (`src/refusal-policy.ts`) on its way out of the vault, whichever call made it,
  a background refresh's included; for `identity_revoked` it locks at once, as `lock()` does:
  the vaultKey dropped, the lease revoked (amended 2026-10-19: `lockSoon()`'s grace and the defeat
  of an unlock under way are gone, see "one kind of lock" below). It never deletes the vault or a box. `convexVaultDB`'s `ConvexClient`
  watch now calls `onChange` on a failed `watchVault` (as a `ConvexReactClient`'s watch already
  did), so an idle vault locks on a sign-out in another tab. **For review**: (1) the default is
  `'lock'`, but `Vault.make`'s `whenIdentityRevoked: 'stay'` lets a host keep the vault unlocked
  after a sign-out, as before; (2) the mismatched-user case is also `identity_revoked`, since a
  server cannot tell "the user changed" from "a host opened the wrong user's vault", and locking
  is the safe answer to both; (3) a vault opened before its backend's auth is ready meets
  `identity_revoked` and revokes its lease -- safe, but a host that races its auth
  makes its users retype the passphrase (the READMEs say to open only once signed in);
  (4) an adapter that says `identity_revoked` for a passing fault locks the vault needlessly --
  the `VaultDB` contract says to use `storage_unavailable` for those.
* 2026-10-16: **a damaged vault is said only as far as the vault can know it** (the Coach:
  "fine-grained error messages"). AES-GCM fails alike for a wrong key and for altered
  additional data or ciphertext, so a passphrase that opens no wayin is still
  `wrong_passphrase`, and a passkey's answer for its wayin's own salt that does not open it is
  still `wrong_passkey`, even when the vault props were altered in storage: each message now says the
  stored vault may be damaged, and claims no tampering. Told apart, each its own kind: vault props
  that fail their schema or names another scope (`damaged_vault`; amended 2026-10-21 (fault_kinds):
  `VaultDB` says `damaged_vault` itself, Zod's error as `cause`, no longer mapped by the vault from
  `corrupt_record`); a wayin
  whose salt its deriver could not have made (`damaged_wayin`); and a box that fails its
  schema, or will not open under the vault's vaultKey, or opens to no whisper (`damaged_box`)
  -- knowable because that vaultKey was proven by the wayin that gave it. **A damaged wayin
  is passed over, no longer refused for the whole vault**: the other slot's wayin opens as ever (no
  derivation is spent on the damaged one; until slots, the others in a list were tried), and
  `safebyok-react`'s `askPasskey` likewise offers only a passkey it can ask. Considered and
  refused: telling a wrong passphrase from an altered wayin by re-encrypting a held vaultKey
  under the derived key with the stored IV and comparing ciphertexts -- it works only against
  GCM's structure, needs the vaultKey's bytes, and is a construction of our own. Vault props that
  fails its checks cannot be deleted through a vault handle (`hello()` refuses it, and `del()`
  needs a handle); it is left in place, as every damaged remote record is, until the host calls
  `delDamagedVault` (the entry below).
* 2026-10-16: `postgresVaultDB`'s box limit is a best effort (VaultDB contract, lines 4.2 to
  4.5), not a guarantee: the insert counts the vault's boxes in a `count(*)` over its own
  statement's snapshot, with no lock and no counter, so writers racing for the last places under
  READ COMMITTED may each find room and all land, by at most one less than the number of racers.
  A client that bypasses the library can add boxes without bound, which makes the limit an
  alarm bell and a guard against a runaway loop, not an abuse quota: the host meters that, like
  its request rates, and the README offers a trigger for a host that wants a hard cap. This
  replaced the `box_count` column, its trigger and a `FOR UPDATE` row lock, reasoned about
  in `whiteboard/20261015-matters/thread-11-postgres_verdict.md`; what to check: that a refused
  write inserted nothing (the `WHERE` of one atomic statement), that no box lands in a vault
  but its own (the foreign key, re-read against the vault props that stand now, whose violation
  `23503` is mapped to `stale_write`; amended 2026-10-21, C1: `vault_mismatch` for a box write), and that every box that landed stays readable and
  erasable. Above READ COMMITTED some races fail with `40001`, refused as `storage_unavailable`.
  The notify trigger is no longer installed by `VaultTablesSql`: a host opts in with
  `VaultNotifySql`, and without it nothing is pushed (the vault refreshes after its own writes).
  Not run against concurrent connections: the tests are on PGlite, one statement at a time.
* 2026-10-16 (revised the same day by refusals_and_catchup, below: a vault that may be newer is `newer_format`): **`delDamagedVault`, the one way to delete a vault without a handle** (the Coach:
  "yes"). `del()` deliberately needs no unlock ("owning the account is enough"), but needs a
  handle the vault's own reading made; vault props that fail their checks gave none. The new call
  deletes a vault `hello()` refuses as `damaged_vault` and no other: it refuses (`bad_option`,
  nothing deleted) vault props that read back sound, so it cannot become a way round `del()`'s
  care, and it deletes through `VaultDB.delDamagedVault`, which reads the record as stored,
  takes its `vault_id`, and aims the adapter's `doDelVault` at that one vault, so a vault made
  anew meanwhile survives as `stale_write`. Like `del()` it needs no passphrase, and it is as
  strong as the backend's own authorization of who may delete that user's rows (the contract's
  5.4): a user can already delete their own vault by `del()`, so it widens nothing for them,
  and widens nothing for anyone else. It also erases the lease, on this device only.
  **For review**: (1) the deletion's expectation is the `vault_id` read from a record that is, by
  definition, untrusted; it can only aim the deletion at the row it read, in the caller's own
  scope, so a forged `vault_id` in a damaged row deletes that row and nothing else; (2) `localVaultDB`
  and `idbVaultDB` now delete a whole vault on the `vault_id` alone (the contract's line 3.5 always
  said so), where they had also required a readable `unlock_epoch`, which kept exactly the
  damaged vaults from being deleted; box writes and `delBox` still need the epoch.
  **Newer is not damaged** (review of the above): vault props that fail this build's checks may be
  ones a *later* build writes and opens, and offering "delete" for it would delete, from a device
  on an old build, a vault every up-to-date device opens. So the hatch refuses (kind
  `damaged_vault`, a message to update the app, nothing deleted) a record with a `format` this
  build does not know (of any type), and deletes only what fails otherwise (until slots, it also
  refused a wayin `wayinkind` it did not know, or more wayins than `MaxUnlocks`; now `format` alone
  tells newer from damaged). **The rule this rests on, which the Coach
  has ruled (2026-10-16): any change to what a stored record may hold -- a field, a shape, or a
  range a check accepts -- bumps `format`**, so that an older build can tell newer from damaged. Where it cannot tell, it refuses: the hatch fails safe. Not routed through
  `RefusalPolicy.heed`: there is no handle to lock and no key in memory, so `whenIdentityRevoked`
  has nothing to act on, and the hatch's own last step is erasing the lease.
* 2026-10-16: **the checks tightened, and a forgotten bag made harmless.** Every default check,
  `AnyTextValidators` included, refuses text that is not well-formed Unicode (a lone surrogate); a host's own schema
  is untouched. A refusal by one of our checks now passes on that check's message, which quotes
  nothing; a host schema's issues are still never passed on. **A `VaultDB` verb handed no
  validators now admits any well-formed text** (`AnyTextValidators`), where it used to apply the
  defaults: a wrapper that forgets to forward the vault's bag can no longer refuse a well-formed
  name the vault's own checks passed. The vault passes its bag to every verb (a test spies each
  one); it had left it off `putVaultProps`, so a host with a wider `userId` check could not change
  a passphrase. Before the change, a server calling the verbs bare got the default checks; it now
  gets text-only checks, which is what the shipped server recipes already passed. The same holds
  for `delDamagedVault` and its verb. A `damaged_box` refusal no longer quotes the boxlabel,
  as `absent_box` already did not.
* 2026-10-16: **a foreign error that may quote stays behind.** `Sanitizer.refusalFor`
  (`src/sanitizer.ts`, exported as `Sanitizer`) is the one place that decides what of a foreign
  error rides along on the refusal thrown in its place: today, nothing -- no `cause`, no text, no
  property. Two callers: a host's schema that throws (`bad_option`, as since #95), and
  `convexVaultDB`, which now throws every Convex failure that is not one of safebyok's own
  refusals as `storage_unavailable` carrying nothing of Convex's error. That error is a plain
  `Error` whose text, on a dev deployment, quotes the call's arguments (scope, names, sidecars,
  ciphertext; never plaintext or keys), and the client cannot tell a validator's refusal from any
  other server error but by its text, so all of them are dropped. The cost is debugging: the
  deployment's logs keep the full error. The other adapters still carry their client's error as
  `cause`, as above.
* 2026-10-16; 2026-10-19 (slots): **`validators.wayinlabel` is gone**, with the `wayinlabel` it checked. It
  was a sixth slot that checked the label of each wayin a host added, `Label` by default, refused as
  `bad_label` without quoting it, and only there: a stored wayin's `wayinlabel` was read as plain text,
  since refusing it on read would have made the vault props `corrupt_record` and locked the user out of
  their own vault. Wayins no longer carry a label, so no name enters the vault through a way in.
* 2026-10-16: **ckeys are joined on `^`, and a name holding it is refused** (push_to_100_a, thread
  1). The key-value stores (`localVaultDB`, `idbVaultDB`, `idbDeviceDB`, `memoryDeviceDB`) file
  rows under `kind^applabel^user_id^vaultlabel[^boxlabel]` (`Ckeys`), replacing the JSON-tuple
  ckeys of the entry above. The join is injective only because no part holds `^`, so that is
  enforced twice and cannot be turned off: `^` is in the name floor (`NameFloor`), which every
  `VaultDB` verb, every record schema and the vault's entry hold every name to, whatever the
  host's validators and whatever the store; and `Ckeys` itself refuses one as it composes, which
  also guards the device shelves, which have no base class. Were either missing, `a^b` + `c` and
  `a` + `b^c` would share a ckey: one user's box under another's scope. The delimiter is fixed:
  no host sets another (the Coach's ruling), and every store refuses `^` alike, so a host
  never meets a refusal from one store (the browser's device shelf, say) that its vault store
  never raised. A hash was not chosen:
  it hides nothing (each name is plaintext in the row, and an indexed column in Convex and
  Postgres) and loses the name of a damaged row, which the listing needs to offer `delBox()`. Rows
  under the JSON ckeys read as absent; the device shelf sweeps them as strays.
* 2026-10-16: **a floor beneath every name, and the host's validators at entry only**
  (thread 1). `NameFloor` (well-formed Unicode, NFC, no control character, 1 KiB a name) now
  runs beneath whatever schema a host passes, at the vault's entry, in every `VaultDB` verb, and
  in every record schema, so a stored name below it reads back as damaged and never reaches
  `snapshot.boxes` unchecked (a row stored under a name below it is not listed at all). A
  box's sidecar has no floor of its own: it is the host's, checked by the host. This bounds what storage can put in front
  of a host's UI whatever its validators: no control characters, no 1 MB label. The host's
  `validators`, by contrast, now run only where a name enters the vault (`Vault.make`, `putBox`) and never on a record read back: a box stored under a name
  they refuse lists, reads and deletes as sound (as a wayin's label did, until slots removed it). They are an
  alarm for the host's own use, not a promise about storage, which a server serving several
  clients cannot keep. `VaultDB` verbs no longer take a validators bag at all, so no server or
  wrapper can be handed the wrong one. Each adapter declares `maxNameBytes` (Postgres: 640, so a
  box's four-name primary key fits a btree entry) and the base class refuses a longer name.
* 2026-10-16; 2026-10-18; 2026-10-19: **a box's sidecar is any JSON, bound; its whisper's codec
  and schema version are reserved, bound too** (push_to_100_a, thread 2; G023, G025, G040). Amended 2026-10-21 (trust_lines): the sidecar
  is stored as the JSON value itself, in the field `sidecar` (once the text `sidecar_json`), box
  format `safebyok-box-v8`: Postgres `jsonb NOT NULL DEFAULT '{}'`, Convex a record, GraphQL a non-null
  `SafebyokSidecar`; always a JSON object (`{}` for none), and `putBox` refuses any other as `bad_option`
  (third round: it was any JSON value, `jsonb` nullable and Convex `v.any()`). The box ctx binds `stableJsonify(sidecar)` (keys sorted), computed at seal and at open, so a
  backend that normalizes JSON does not break opening; the sentences below on the stored text kept
  byte for byte, on Postgres `text` and never `jsonb`, and on the record being its own stable
  re-serialization no longer hold. There is no validator for Postgres's limits: a sidecar Postgres
  refuses (`\u0000`, say) surfaces as `storage_unavailable` with Postgres's error as cause. A stored sidecar
  nested too deep for the schema check fails its call as `unexpected_error`, not as a damaged box: no check
  of nesting depth is made, and availability against a hostile backend is not defended. The
  box (`safebyok-box-v6`) holds `sidecar_json`, the host's sidecar as stable-serialized JSON
  text, always written (`{}` when the host gave none, so an absent sidecar and an empty one are one
  record and one ctx), and `whisper_codec` (`json_v1`) and `whisper_schema_version` (`1`).
  All three join the header both of the box's encryptions bind, so a sidecar swapped between
  boxes, emptied, or merely respaced in storage makes `getBox()` refuse it (`damaged_box`);
  the bound value is the stored text itself, never a re-serialization, so a store must keep it
  byte for byte (Postgres keeps it as `text`, never `jsonb`). The record's check also requires
  that text to be its own stable re-serialization, inside a try: a sidecar respaced, reordered, or
  nested too deep to serialize (which once overflowed the stack in the snapshot's comparison and
  stopped the vault opening with a bare `RangeError`; amended 2026-10-21 (trust_lines): the depth check is removed, and a sidecar too deep for the schema check fails its call as `unexpected_error`) lists as damaged and reads as
  `damaged_box`, so one bad record never hides the rest. A `putBox()` carries the standing
  sidecar and `registered_at` forward only from a record that deciphers: over one that will not, its
  sidecar becomes `{}` unless one is given, and its `registered_at` is now, so a sidecar planted in
  storage is never sealed into a fresh revision that reads clean (found in review). What the sidecar reveals: everything in
  it, in the clear, to anyone who reads storage, and its size; the vault never interprets it,
  checks only that it is a JSON object (amended 2026-10-21 (trust_lines), third round: once any JSON), and the snapshot shows it unverified until the box is opened, as
  every visible field is. Its size is capped only with the whisper's (`maxWhisperBytes` counts
  both), so a host cannot put a sidecar of megabytes in front of the listing through the vault.
  Reserving the codec fields now means a later codec (padding, G026) or a whisper shape version
  changes no bound field set and re-encrypts nothing. Two ctx fixes ride along: the box's
  format is bound once, as the leading tag (it was also in the header), and `cipherCtx`
  refuses a record part holding a field set to `undefined` (`bad_option`) instead of dropping it
  as JSON would, so a field gone missing by mistake can never bind as if it were absent. The
  sidecar has no control-character floor of its own (G177): it is the host's, and a host
  that shows it checks what it shows. 2026-10-18 (branch `20261018-sidecar`, thread 5 of sprint
  reform): the host's field, first the box's "note" and then its "public bag", was renamed the
  "sidecar", `public_json` became `sidecar_json`, and the format
  tag moved from `safebyok-lockbox-v4` to `safebyok-lockbox-v5`. Both of a box's encryptions
  (the boxKey wrap and the whisper cipher) bind a context (`boxCtx`) of the format tag, the
  vault's scope and `vault_id`, the purpose string, and the whole stored header as key-sorted JSON,
  so those bytes follow the renamed field and the v5 tag, and the header now spells `sidecar_json`
  after `revision_id` rather than after `boxlabel`. The construction is unchanged: same parts,
  same order, same purpose strings, the sidecar in the header where `public_json` was. A v4 box
  lists as damaged and reads as `damaged_box` on every adapter that reads it (a Convex
  deployment refuses the new component schema until its tables are cleared), with no migration,
  so no old ciphertext has to open under the new bytes. Also 2026-10-18 (branch
  `20261018-vaultprops`): the box's stored field `revision_id` is renamed `revision_tok` (a
  `_tok` names a value that changes on every write), and `boxCtx` follows it, so the field name in
  the bound header changes; the construction is unchanged, the same parts in the same order, and
  `revision_tok` sorts where `revision_id` did. It rides the format bump to `safebyok-lockbox-v5`
  already in this release, so there is no second bump, and a box in an older format lists as
  damaged, as before, with no migration. The wayin's and the lease's contexts bind no field the
  rename touches, so their bytes do not move. `tests/ctx-bytes.test.ts` pins the box's bytes. 2026-10-19 (branch 20261019-rename_pass, on
  [PR #193](https://github.com/mrflip/safebyok/pull/193)): the box record's format tag, which leads its ctx, moved
  from `safebyok-lockbox-v5` to `safebyok-box-v6`, and the purpose string that binds a wrapped boxKey
  moved from `lockbox_key_wrapped` to `box_key_wrapped`. Both are still distinct from every other format
  tag and purpose string. A box stored under the old names fails schema validation before any
  decryption is tried, and is listed as damaged.
* 2026-10-16 (locks_and_expiry); 2026-10-19 (20261019-softlock_gone): **the lease has a hard edge, and a timer.** The
  threshold is the truth: every call that starts work checks `askPassphraseAt` against the host's
  clock, and past it throws `vault_locked`. A `setTimeout` enforces it: armed at each take-up of a
  key (an unlock, a lease at open, a change to the wayins), it rings at
  `askPassphraseAt`, the one timer, and drops the vaultKey with no call made (amended 2026-10-19:
  it once rang at `askPassphraseAt` to close the gate, and again 60 s later, the grace work in hand
  got, to drop the key; the minute is gone). Every look at the key
  (`checkUnlocked`, and the second look of work in hand) also drops it once that shut time has
  passed by the clock, so a timer that runs late, on a device asleep, is not depended on. (Amended 2026-10-21 (trust_lines): an
  opened `Lease` also holds this edge itself: past its `ask_passphrase_at` by `vault.now()`, it
  refuses `wrapBoxKey` and `unwrapBoxKey` as `vault_locked`.) (Amended 2026-10-19:
  `lockSoon()`, which took the lesser of its grace and what the lease had left, is gone; a key
  past `askPassphraseAt` whose timer ran late is dropped at the next call that looks.) To make one timer always reach,
  `leaseHours` is now at most 588 hours (24.5 days; 588 h + 60 s is under
  `setTimeout`'s 2^31 - 1 ms) or `Infinity`, which arms no timer; a finite number past 588 is
  refused (`bad_option`), where it used to be clamped to "forever" -- a host that meant "very
  long" now says `Infinity` and means it. The timer is `unref`'d where the platform has it
  (Node, Bun), so an open vault never holds a process alive; that costs nothing, since a process
  that exits drops the key with it. **The lease renews only on a typed passphrase that proves**
  (the Coach, 2026-10-16: "if I type in a password for any reason and prove I am mrflip, ... no
  need to type that password again for seven days"): `unlock()`, `putWayin()`, and any
  change to the wayins, each proved by the passphrase. An `unlock()` by passkey also sets it, as it did.
  Amended 2026-10-19 (slots): since only the passphrase proves a change, every change starts the lease
  again from now; before, a passkey-proven change on an unlocked vault kept the standing deadline.
  Reads, stores, deletions and refreshes never move it.
  One place decides (`#deadlineFromNow` in `vault.ts`; once `deadlineFor(proof, call)`; amended 2026-10-21 (b_simplify): `#deadlineFromNow` is removed, and the one place is now `Lease.grant`, which every proof's grant passes through (`#grantLease` calls it), the vault arming its expiry from the lease's `ask_passphrase_at`; nothing else, a read, a store or a refresh, moves the deadline, as before), so a new kind of proof cannot slip past it.
  Expiry was a soft lock (the strawman's two locks); amended 2026-10-19: there is one kind of
  lock, which drops the key at once, and no lock, expiry included, defeats an `unlock()` or
  `putWayin()` under way (see "one kind of lock" below). (The question G530 asked, whether a passkey's proof should only keep the
  deadline, no longer arises: no passkey proves a change.)
* 2026-10-16 (locks_and_expiry; revised the same day by refusals_and_catchup, below: `lockSoon()` raises nothing, and the generation outlives a `del()`; 2026-10-19, 20261019-softlock_gone: **the lock generation, `DeviceDB.putLease`'s expectation and this versioned erase are gone**, a lock reaches no unlock under way, and what follows describes what stood until then): **a lock reaches every tab's unlock under way: the versioned
  erase.** The device mark gains `lock_generation` (format `safebyok-mark-v2` then; today's tag is `safebyok-mark-v3`). Every lock that
  revokes the lease -- `lock()`, `lockSoon()`, a sign-out's lock, `del()`'s --
  raises it before erasing the record. An unlock (or a change to the wayins) reads it as it
  starts, and `DeviceDB.putLease(lease, expected)` writes the lease only while
  the mark still stands at that generation, comparing and writing in one step (one IndexedDB
  transaction in `idbDeviceDB`), else refusing `stale_write`, which the vault takes as "a lock
  won": it takes nothing up and throws `vault_locked`. A record written before the raise is
  erased by the lock's own erase, which follows it. `putMark` never lowers the generation (the
  higher of the mark written and the mark replaced is kept, in the same step), so a mark written
  from an older read -- a rollback mark raised by another tab -- cannot undo a lock. Limits: a
  host's own `DeviceDB` that ignores the expectation is back to per-handle locking (the
  `describeDeviceDB` battery checks it); a lock on a device with no mark for the vault (one that
  never read it, or whose mark would not read) has nothing to raise; and `del()` erases the
  mark, so its generation starts again from 0, and an unlock under way in another tab that began
  at 0 may write a record of the deleted vault, which opens nothing and is erased at the next
  open of a vault under the scope. `close()` is no lock: it erases nothing, raises nothing, and a
  record an unlock under way wrote before the close stays (G126). The undoing erase of a losing
  unlock now runs only for a lock in its own handle (which may have erased before the record
  landed); a record of vault props no longer standing is left, since its wrap is bound to that
  vault props' `vault_id` and `unlock_epoch` and opens nothing. **For review**: a mark written before
  this reads as none (the format moved), so on its first open after upgrading a device restarts
  its rollback check from the copy storage holds then, once; before 1.0 that is the stated cost
  of a format change.
* 2026-10-16 (refusals_and_catchup; the Coach: "lockSoon is a soft lock"); 2026-10-19
  (20261019-softlock_gone, on PR #189): **one kind of lock, and nothing decides who wins when a
  lock lands with work in flight; formerly two locks, hard and soft.** The soft lock is gone:
  `lockSoon()` and its grace no longer exist, nor the minute past `askPassphraseAt` during which
  work in hand kept the vaultKey. There is one kind of lock, and it drops the key at once; the
  lease's expiry is one timer at `askPassphraseAt` that drops the key, and a key past its deadline
  whose timer ran late is dropped at the next call that looks. The three in-handle lock counters
  (`shutsSoFar`, `hardLocksSoFar`, `revokesSoFar`) and the device mark's `lock_generation` (with
  `DeviceDB.putLease`'s expectation) are gone: they decided who wins when a lock lands while
  something is in flight, and now nothing decides; last writer wins. So a `lock()` landing during
  an unlock (this tab or another tab on the device) no longer stops it: the unlock finishes, the
  vault ends unlocked, and a lease is written. A `lock()` landing while `hello()` takes up the
  lease is the exception (corrected 2026-10-19, 20261019-fields_and_make, PR #197): any key change
  landing then aborts the take-up, which installs nothing (see the `make_hello` entry). A lease that a lock
  failed to erase (the device store threw) is taken up by the next `hello()` that reads afresh on
  the same handle, not only at the next page load. A `getBox()` or `useBox()` still hands back
  nothing if no key is in hand when storage answers or when the whisper has been deciphered, unless
  another unlock put a key back in hand meanwhile. An unlock still takes nothing up when the handle
  has closed or the vault props it proved against no longer stand (deleted, remade, wayins changed).
  **For review**: the Coach's ruling is that these are accepted as user annoyances until the store
  reform is done; a policy is owed before 1.0, recorded in TODO.md under *Lock timing vs. work in
  flight* with seven scenarios. The device mark (format now `safebyok-mark-v4`) holds only the seen vault (rollback
  detection), never null, and `del()` erases it rather than writing a blank one; a
  `safebyok-mark-v3` record reads as no mark, so the device re-checks the vault from what storage
  holds now. What stood until 2026-10-19: `lock()`, `del()` and a lock for untrusted storage are hard: the key goes at once,
  the device mark's lock generation rises, an unlock or change under way anywhere on the device
  takes nothing up, and a `getBox()` or `useBox()` under way refuses `vault_locked` after its last
  await, dropping the whisper it deciphered (one monotonic compare of the handle's shut count,
  which can only turn a success into a refusal). `lockSoon()` and expiry are soft: the door closes
  at once and the lease is revoked (by `lockSoon()`) or has expired, but work in hand finishes -- an unlock or change
  under way, in any tab, completes and leaves the vault unlocked -- and the generation is not
  raised. **For review**: a soft lock no longer stops another tab's unlock; a host wanting that
  calls `lock()`.
* 2026-10-16 (refusals_and_catchup; the Coach on G119 and G516): **one rule for storage the vault
  cannot trust.** `identity_revoked` and `rolled_back` both lock the vault at once (amended 2026-10-19: once called hard, before there was one kind of lock), wherever they are
  met -- a call, a catch-up, a background refresh, the open itself (which revokes the lease) -- decided in `refusal-policy.ts`'s `decide`, with no host option: `whenIdentityRevoked`
  and its `'stay'` are gone. An adapter that says `identity_revoked` for a passing fault breaks
  VAULTDB.md 5.5. After a deliberate restore, the README's `delMark` recipe stays the only way
  out (G513): no verb puts forgetting the newer copy one call away. **For review**: a storage
  replica that briefly serves an older copy now makes every device that saw the newer one ask for
  the passphrase again.
* 2026-10-16 (refusals_and_catchup); 2026-10-19 (20261019-softlock_gone: **the generation is gone, and `del()` erases the mark again; the mark, now `safebyok-mark-v4`, holds only the seen vault, never null**; the rest describes what stood until then): **the lock generation outlives `del()`, and a lock with
  no mark still counts.** The device mark (then `safebyok-mark-v3`) holds what it has `seen` of the
  scope's vault, or null; `del()` writes it with nothing seen at its raised generation, rather
  than erasing it, and a lock on a scope with no readable mark writes one at generation 1. So an
  unlock under way elsewhere at generation 0 loses to a `del()`, and a vault-creating first unlock
  loses to another tab's lock. `delMark` (the restore recipe, `delDamagedVault`) still resets
  the generation; neither runs with a handle that could be unlocking that vault.
* 2026-10-16 (refusals_and_catchup): **one catch-up before a kind is named.** A write storage
  refuses as stale, or a box that will not open, gets one refresh before the vault names it: a
  vault deleted and made anew, or its wayins changed, elsewhere relocks the device (P4: never on
  no evidence), so a successor vault's box reads as `vault_locked`, not `damaged_box`. Amended
  2026-10-21 (fault_kinds): a box that will not open under the lease in hand is `damaged_box` at
  once, with no re-read first, its message saying to read again with `hello({ staleMinutes: 0 })` in
  case the vault was made anew on another device; such a vault shows first as `damaged_box`, then
  relocks on a fresh `hello()`. The catch-up after a `stale_write` write is unchanged. A
  catch-up that fails is thrown as `stale_write` with the failure as cause, never retried blind,
  and the snapshot says `syncing: false`. Refreshes are serialized per handle (one in flight, one
  queued), so two reads never interleave their snapshot updates. None retries: `putBox()`, a change
  to the wayins, `delBox()` and `del()` each refuse once (amended 2026-10-18: this said only `putBox()` retries, until [#160](https://github.com/mrflip/safebyok/pull/160) removed that retry; see the 2026-10-15; 2026-10-18 entry above). There is no conflict hook: a deletion wins.
* 2026-10-16 (refusals_and_catchup, G498): **a damaged box is replaced in one conditional
  write.** The listing keeps a damaged record's `revision_tok` when it holds one as text, and
  `putBox()` writes over that revision under contract line 3.3, so a sound box another device
  wrote meanwhile refuses the write and is never deleted, and the refusal is thrown as `stale_write`
  after one catch-up (amended 2026-10-18: the store once retried over it, last writer wins, until [#160](https://github.com/mrflip/safebyok/pull/160) removed the retry). The revision is untrusted text used only as an expectation storage compares. Only
  a record naming no revision is deleted first, which leaves a gap P6 accepts (amended 2026-10-19,
  20261019-no_clear: the delete-first is gone; `putBox()` refuses a damaged box naming no
  revision as `damaged_box`, writing nothing, and the gap with it). A box under a
  vaultKey epoch other than the vault props' lists as damaged from its epoch alone (G063; amended
  2026-10-21: it once also named a prior vaultKey's epoch, which the vault no longer keeps; amended
  2026-10-21 (trust_lines): no longer, there being no epoch; a box sealed under another `vault_id` is
  refused `vault_locked` when opened with a lease of this vault);
  the listing still never opens ciphertext (G121).
* 2026-10-16 (refusals_and_catchup): **`Vault.make` takes only a `VaultDB`** (G122): a duck-typed
  object would skip the base class's checks of every record and expectation. `instanceof` holds
  within one copy of the package, as `VaultError`'s does; the peer dependency keeps it one. And a
  vault a newer safebyok may have written is `newer_format`, never `damaged_vault`, so no UI
  offers to delete it (G120).
* 2026-10-16 (epoch_expectation, G065, G138): **every in-tree adapter now compares the
  `vault_key_epoch` expectation** (line 3.8; amended 2026-10-21 (trust_lines): removed, see the entry on the
  expectation), and the battery holds every adapter to it, with no
  opt-out (`describeVaultDB` no longer takes `comparesVaultKeyEpoch`). IndexedDB compares in the
  write's transaction; the Convex component in `putBox`'s mutation; Postgres in the write's one
  statement, reading the vault props row `FOR SHARE` -- without the lock, READ COMMITTED would compare
  the epoch in the statement's snapshot, and a change to the vault props committed after it would go
  unseen (amended 2026-10-21: a `del()` and remake that moves `vault_id`, or a change to the ways in,
  `putWayin` or `delWayin`, that moves `unlock_epoch`; `vault_key_epoch` itself is 1 for every
  vault today, no rotation being built); GraphQL
  passes the expectation whole to the VaultDB it serves. So "no look before writing" (G138) holds:
  storage alone refuses a stale vaultKey's write, atomically. The `FOR SHARE` lock is new: vault props
  update now waits for box writes in flight, and the README's hard-cap trigger takes a
  per-vault advisory lock rather than `FOR UPDATE` on the vault props, which would deadlock two writers
  each holding the shared lock. The real-Postgres race that proves the lock waits on thread 11's
  container suite (amended 2026-10-21 (store_rulings, #217): a Postgres box write now also locks the box
  standing under its boxlabel `FOR UPDATE` after the vault row `FOR SHARE`, the same order as a vault
  deletion, vault row first; see the 2026-10-19 (returning) entry). The 2026-10-16 entry above that says IndexedDB, Convex and Postgres "do not yet"
  is superseded.
* 2026-10-16 (epoch_expectation, the Coach's ruling on thread 4's review); 2026-10-19 (20261019-softlock_gone: **the counts are gone**: a `getBox()` or `useBox()` hands back nothing if no key is in hand when storage answers or when the whisper has been deciphered, unless another unlock put a key back in hand meanwhile; the rest describes what stood until then): **`close()` and a key
  outlived by a refresh are hard locks for a read in flight.** A `getBox()` or `useBox()` notes a
  per-handle count of hard locks when it starts (every shut, a `close()`, a refresh that drops the
  key because the wayins changed or the vault went) and hands back nothing if it moved meanwhile:
  the deciphered whisper is dropped, never returned. It is a separate count from the one unlocks
  race against, so a refresh an `unlock()` makes for itself does not defeat that unlock. Not hard
  locks, by design: a `lockSoon()` grace running out, and a clock that cannot be read.
* 2026-10-16 (secure_floor, G032); 2026-10-19: **an all-zero passphraseKey is refused.** `passphraseKeyOf`
  (`wayin.ts`; since 2026-10-19, #201, `proof.ts`), the one place the core receives any key deriver's output, refuses 32 zero
  bytes as `bad_option`, at create, unlock and every change to the wayins alike. No derivation
  makes them; a host deriver that kept its output and handed back bytes since wiped would, and
  the vault would seal under a key anyone can rebuild. The check reads every byte, OR-ing them
  together as libsodium's `sodium_is_zero` does, with no early exit; no JavaScript engine promises
  constant time, but nothing in it branches on a byte: only the verdict steers what follows, and
  the refusal of an all-zero output tells that anyway. No dependency offers the check, and `@noble/ciphers`' `equalBytes` would be a new one for one line.
* 2026-10-16 (secure_floor): **`Vault.make` refuses an insecure context** (`isSecureContext ===
  false`) first of all, as `insecure_context` (misuse): a browser withholds WebCrypto from plain
  http, which otherwise failed later as a `TypeError` with no kind. A runtime with no notion of
  one (Node, Bun, React Native: the global is absent) passes.
* 2026-10-16 (secure_floor): **a new passphrase must pass `strengthChecker`** before any key
  derivation: the one a vault is created with, and each one `putWayin`
  sets; never at `unlock`, so no user is locked out of a vault that stands by a test made
  stricter later. The core sets no floor of its own, and amended 2026-10-21 there is no core default
  of 12 code points: a vault made with no `strengthChecker` has `UnchosenStrengthChecker` (amended 2026-10-21 (wayin_rules): now `DefaultStrengthChecker`), which
  refuses every passphrase. The floor is the browser entry's `zxcvbnStrengthChecker`
  (`browserOpts()`), NIST SP 800-63B's length and no composition rules, at 12 code points
  (`MinPassphraseChars`, the Coach's floor; SP 800-63B rev. 4 asks 15 of a password that is the only
  factor, which a vault passphrase is). The refusal's message is the host test's own reason, a host
  string: the doc tells hosts never to quote the passphrase in it, and the core cannot check.
  `safebyok/browser` offers `zxcvbnStrengthChecker` on `@zxcvbn-ts/core` and
  `@zxcvbn-ts/language-common` (runtime dependencies at the Coach's yes): the length floor, then a
  zxcvbn score of at least 3, which is its blocklist of common passwords (NIST's other ask) and its
  pattern matchers. It keeps nothing of a passphrase between calls.
* 2026-10-16; 2026-10-19: **a key deriver's bytes are zeroed once imported.** `passphraseKeyOf`
  (`src/wayin.ts`; since 2026-10-19, #201, in `src/proof.ts`, called by `PassphraseProof.wayinKeyFor`, logic unchanged) `fill(0)`s the 32 bytes a `KeyDeriver` hands back as soon as
  `importWrappingKeyBytes` has made the non-extractable passphraseKey of them, whether or not the
  import succeeded, on every path that derives (sealing, and an unlock);
  a result of another length than 32, refused (`bad_option`), is zeroed likewise.
  Best effort, as it is in any JavaScript crypto: the deriver's own working memory (hash-wasm's
  and `@noble/hashes`' internals), the engine's copies and the passphrase string are not reached.
  The bytes are the vault's the moment they are returned, so a deriver that returns a buffer it
  keeps (a cache, a constant) would see it zeroed under it; the `KeyDeriver` doc and the README
  say to hand back a fresh array. A result over a `SharedArrayBuffer` is refused (`bad_option`)
  before it is touched: another thread could read it, and WebCrypto will not import it.
* 2026-10-16: **the deriver's label is checked three ways before a vault trusts it.** `Vault.make`
  refuses a label beginning `argon2id_web_` (any case) that is not a spec safebyok supplies,
  or is one without exactly its parameters, so a spec added later (`argon2id_web_v2`) cannot
  collide with a label a host stored vaults under. It runs the Argon2id spec check
  (`parseKeyDeriverSpec`) on any deriver declaring `algorithm: 'argon2id'`, so a spec Argon2id
  cannot run fails at open with a kind, not at the first unlock as a library's plain Error. The
  supplied derivers (the core's and `safebyok-fastkey`'s) refuse a salt of another length than the
  spec's before deriving (`bad_option`, never quoting the salt): the stored-vault half of that
  was already so, a wayin with a salt of the wrong length being passed over as damaged.
* 2026-10-16: **a `test_` label is warned of, never refused.** `Vault.make` says through the
  logger, once per open, that a key deriver whose label begins `test_` (the published
  `safebyok/testing` deriver is `test_digest_v0`: one SHA-256 of passphrase and salt) gives a
  passphrase next to no protection against guessing. It does not refuse: no option, no flag, so a
  host that meant it reads one line and one that did not has a chance to see it. The warning is a
  best-effort signal, not a gate: a host that passes a `logger` doing nothing hears nothing, and a
  deriver as weak under another label is not noticed. The vault's records still name the label
  that sealed them.
* 2026-10-16; 2026-10-19 (slots, the Coach's ruling): **`putWayin` is proved by the standing
  passphrase only; a passkey's answer is refused `bad_option`.** Until slots, any wayin proved a change to
  the ways in, a passkey's answer included: whoever held the authenticator and passed its user
  verification could set a new passphrase, in one write at one unlockEpoch. A passkey cannot now, so a forgotten passphrase can no longer be reset with the
  passkey (which still opens and reads the vault), and a passphrase stored damaged cannot be replaced
  either. The vaultKey is untouched, so what the replaced passphrase's holder kept of earlier vault props still
  opens that copy, as for any removal.
* 2026-10-16; amended 2026-10-21: **`delWayin` is a removal, not a revocation, and the package has no
  vaultKey rotation.** The rotation design, since withdrawn, kept the two as separate verbs;
  `delWayin` is the cheap removal. Removing a wayin (since slots, only the passkey)
  stops it opening the vault from here on and cannot take back what it opened; folding a rotation
  into every removal would have rewritten every box for what is usually housekeeping. No rotation
  verb is built, so a host that removes a wayin because it was compromised has nothing yet to call
  to replace the vaultKey.
* 2026-10-16; 2026-10-19 (slots): **the wayin summaries (`PassphraseWayinSummary`, `PasskeyWayinSummary`;
  once one `WayinSummary` list) show `device_id` and `registered_at`.** The snapshot of a locked
  vault already summarised each wayin; it now says too when it was added and by which device, so a
  user can spot a wayin they did not make. Both are visible fields of the wayin, bound into its
  wrap (amended 2026-10-21 (trust_lines): a summary also shows the wayin's `vault_id`, bound into its wrap as before), and `device_id` is one random id per device per vault (the mark's `device_id`), so it
  links nothing the vault does not already link: not across vaults, not to the hardware.


* 2026-10-16: **The whisper field** (`WhisperFieldAttributes` in `safebyok/utils`, spread by
  `safebyok-react`'s `WhisperField`) asks each major password manager to ignore the field, sets
  `autocomplete="off"` (since 2026-10-16, thread 14; it was `new-password`, which invites Chrome's
  password generator), and turns off capitalizing, autocorrect and spell-check: a
  browser's enhanced spell-check sends the field's text to its maker's servers, and with the
  whisper shown (`type="text"`) nothing else stops it. The field is named `whisper_text`, never
  `key`, `password` or `token`. Each manager honors only its own flag; a browser's built-in
  manager may honor none, and Chrome ignores `off` on a `type="password"` field, so it may still
  offer a saved password there.
* 2026-10-16: **Starting over from the passphrase dialog** (`allowStartOver` on `VaultProvider`
  and `PassphraseModal`, off by default) deletes the vault on every device through
  `vault.del()`, which by design needs no passphrase. It asks first, in the dialog, and focus
  lands on "Keep it". Anyone at an unlocked session could already do the same through the handle;
  the option only puts it in the user's reach.
* 2026-10-16: **`withUnlockedVault` answers a refusal only over the vault the action ran
  against**: an action whose `vault_locked` lands after its vault was closed (another user, a
  reopen) resolves null, so a passphrase is never asked over, nor an action rerun against, a
  vault the action did not touch. `PassphraseModal` and `PasskeyUnlockButton` start afresh when
  handed another vault, so nothing typed for one vault is submitted to the next.
* 2026-10-16: **A whisper typed into `WhisperField` is in the page's markup.** The field is a
  controlled input, and React 19 copies a controlled input's value into its `value` attribute,
  so what the user typed sits in `outerHTML` -- readable by a CSS attribute selector
  (`input[value^="sk-"]`, an old exfiltration trick), a browser extension, or a session-replay
  tool that records the DOM -- whether the field shows it or hides it. The README's *Revealing a
  whisper* says so. Since 2026-10-16 (thread 14) the field is uncontrolled, and the entry below
  says what holds now.
* 2026-10-16: **`WhisperField` and the passphrase dialog's field are uncontrolled.** The browser
  holds what is typed; React writes neither a whisper nor a passphrase into a `value` attribute,
  so neither is in `outerHTML` for a CSS attribute selector, an extension or a session recorder
  to read. `WhisperField` takes no `value` or `defaultValue`, and sets both undefined after the
  host's props, so a value slipped past the types cannot make it controlled. The reveal toggle
  flips only the input's `type`. What a host keeps from `onChange` is in its own state, in memory,
  as before.
* 2026-10-16: **The passphrase field invites password managers** (`PassphraseModal`, thread 14):
  `autocomplete="new-password"` while creating, `current-password` while unlocking, in a real
  form, beside a hidden `autocomplete="username"` field (`passphraseUsername`, default
  `<user_id> (<vaultlabel> vault)`). A manager then holds the vault passphrase, which is the
  point: a long, generated passphrase the user need not remember beats one they can. The
  username defaults to something no sign-in form uses, so a manager never takes the passphrase
  for the user's sign-in password (and offers to overwrite it); a host naming its own is told not
  to use the sign-in name alone. `passphraseAdvice`, the host's advice shown beside the field, is
  only advice: nothing refuses a passphrase in the dialog, and composition rules are discouraged
  (NIST SP 800-63B). It is also host code that hears the passphrase in plain text at every change
  while the user chooses one; its doc block and the README tell the host to keep it on the device
  (no server, no log, no error tracker), which nothing here can enforce.
* 2026-10-16: **a workflow with the release App's key runs on Dependabot's pull requests**
  (`.github/workflows/dependabot-changeset.yml`). It writes the changeset a Dependabot branch
  needs and pushes it as the App, so CI runs again (a GITHUB_TOKEN push would not). It runs on
  `pull_request_target`, so it is main's copy of the file, with the `releasing` environment's
  secrets, whatever the pull request holds; what keeps that safe is that it never runs anything the
  pull request wrote: no install, no package script, only main's `scripts/dependabot.ts` reading the
  branch's `package.json` files out of git as data, and writing names and ranges into the changeset
  only after replacing everything but plain text. It writes only when every commit on the branch is
  Dependabot's, by its author email, and its own commit then ends that. The App's token is cut to
  `contents: write`. Unproven until the first Dependabot runtime-dependency pull request after
  merge: whether the environment's secret reaches a run Dependabot started (if not, the key is
  added as a Dependabot secret too), and that the push re-runs CI.
* 2026-10-16: **the Version PR is no longer put back in draft** (`pr-draft: create`, the Coach's
  ruling). A push to main rebuilds a Version PR the Coach has marked ready and leaves it ready, so
  new changesets can join a PR already read: the Coach rereads it before merging
  (PROCESS.md, *Releases*).
* 2026-10-16: **the changeset skip trusts the release App by login.** CI skips *Require a
  changeset* only for a pull request on a `changeset-release/` branch opened by `safebyok[bot]`;
  the same branch name from anyone else is asked for a changeset like any other. The login is the
  App's today (read from the Version PR's author); renaming the App would have CI ask the Version PR
  for a changeset until the workflow names the new login.
* 2026-10-16: **actionlint runs in CI from a release tarball checked against its recorded sha256**
  (v1.7.12, over seven days old), the way `release.yml` checks npm: fetched, compared to the
  hash written in `ci.yml`, and only then unpacked and run. A new version is a deliberate edit of
  both the version and the hash.
* 2026-10-16: **The e2e Postgres container runs with no password** (`POSTGRES_HOST_AUTH_METHOD:
  trust`, `e2e/compose.yaml` and the `postgres` job of `ci.yml`). It holds only ciphertext the
  tests make, in databases the tests create and drop, and is reachable on the contributor's
  loopback (`127.0.0.1`) or the CI runner alone; so there is no credential in the repository to
  leak or rotate, and none to mistake for a pattern to copy into a deployment. The image is
  pinned by digest (`postgres:17@sha256:...`), the digest written in both files; Dependabot
  moves the compose file's, and the workflow's is moved by hand with it. `pg` (8.23) is a
  dev dependency of the private `safebyok-e2e` package, never a dependency of what we publish.
* 2026-10-17 (thread 5b, store_base, [PR #139](https://github.com/mrflip/safebyok/pull/139); revised
  on branch 20261017-logger_contract): **host listener errors go to the platform's `reportError`
  as they are, and to a logger.** The `VaultDB` base class (`vault-db.ts`, `subscribe`, which
  already did both), `ChangeBell` (`change-bell.ts`) and the string stores (`string-store.ts`,
  listener bookkeeping) call each host listener so that what it throws, or a promise it returns
  that rejects, never escapes: it goes to a logger as an error and to `globalThis.reportError`
  where the platform has one (`report-error.ts`, looked up at call time). The base class says it
  through the VaultDB's own `logger`. `ChangeBell.listen(bellname, listener)`, `memoryStore()`,
  `domStore(webStorage, prefix)`, `inspectIdbDeviceDB({ dbName })` and
  `inspectIdbVaultDB({ dbName })` take no logger, and say it through `DefaultLogger`, the
  page-wide default (next entry). `idbVaultDB`'s own watch passes the bell none: its listener is
  the base class's guarded one, which never throws. A listener that throws goes to
  `DefaultLogger.error(message, { call: 'ChangeBell' }, asError(err))` (`'StringStore'` for the
  stores) and then to `reportToPlatform(err)`. `asError` passes an `Error` as itself and anything
  else as `null`, so a logger only ever sees an `Error` or `null`, while `reportError` sees the raw
  thrown value exactly as thrown. The error is the host's own and passed unredacted: safebyok put
  nothing secret in it, and a host listener that puts a secret in its own error has chosen to. Every
  logger is guarded, so a logger that throws cannot turn a listener failure in the bell's
  `queueMicrotask` into an uncaught error. Until a host calls `setDefaultLogger` the default is the
  console, so on Node and Bun a throwing listener is now printed to stderr (before, with no
  `reportError` there, nobody heard it). In a browser such an error is reported twice, to the logger
  and to `reportError`, as designed.
* 2026-10-17 (thread 5b, store_base; revised on branch 20261017-logger_contract): **an adapter's
  logger is fixed when it is made; `Vault.make`'s is not handed to it; the default logger is one
  page-wide object, which any code on the page can redirect.** A `VaultDB` is made with a logger
  and keeps it from then on: every adapter hands the host's `VaultDBOpts` to `super(opts)`, and the
  base-class constructor runs `parseLogger(opts?.logger)` once, which answers `DefaultLogger` when
  the host gave none (`undefined`, `null` meaning "none", an options bag without one, or, from a
  JavaScript subclass, no argument at all) and refuses a non-logger as `bad_option`. The base class
  keeps it in the ES private field `#logger`, set once in the constructor, and shows it through the
  read-only getter `vaultDB.logger`. It is not an own property, so a VaultDB that is logged, spread
  or JSON-stringified does not show or copy a host's logger, and assignment does not take (in strict
  mode it throws a TypeError). A host's own VaultDB subclass could still override the getter, which
  is why `Vault.make` still runs
  `parseLogger` on `vaultDB.logger`. `Vault.make`'s `logger` is the vault's alone and is not handed
  to the storage adapter: an adapter made with its own logger keeps it, and one made with none
  uses `DefaultLogger`, whatever `Vault.make` is given. A vault opened with no `logger` of its own
  uses its storage adapter's, so a logger a host gave only the adapter hears the vault's messages
  too; a host that wants the vault on the default whatever the adapter was given passes
  `DefaultLogger` to `Vault.make` or `VaultProvider`. `Vault.make` (`vault.ts`) runs
  `parseLogger(opts.logger ?? givenVaultDB.logger)` inline, so a non-logger in either place is
  refused `bad_option` at open, before storage is read, while `logger: null` passed to `Vault.make`
  is "none" and the vaultDB's logger is used. `VaultProvider`
  (`safebyok-react/src/vault-provider.tsx`, `settleLogger`, `parseLogger(logger ??
  vaultDB.logger)`) settles one guarded logger per `logger` prop and `vaultDB`; its own warnings
  and the vault it opens use that same object. If the logger or the vaultDB is malformed it warns
  nowhere and passes the raw prop on, so `Vault.make` refuses it to the error boundary. A host that
  wants one logger to hear both passes it to both; one that wants an adapter's messages apart
  passes that adapter its own. Every logger call is guarded, so a throwing logger never breaks a
  verb, and no host can opt a logger out of the guard. `parseLogger` keeps a module-private
  `WeakSet` (`guardedOnes`) of every logger it has guarded, and a module-private `WeakMap`
  (`guardedFor`) from each host logger to its guarded form: a logger in the set comes back as
  itself, and the same host logger always comes back as the same guarded object. There is no mark
  on the logger to read, so a property a logger carries, or inherits through `Object.create` of a
  guarded logger, means nothing to it.
  The default (`logger.ts`): `DefaultLogger` is one object, in `guardedOnes`, whose three calls
  forward at call time to a module-private target (`defaults.target`): the guarded console logger
  (`GuardedConsole`, each line tagged `safebyok:`) until a host calls `setDefaultLogger(logger)`.
  That runs `parseLogger` on what it is given, so the target is always guarded, and a non-logger
  is refused as `bad_option` with the previous target kept; `undefined` or `null` puts the console
  back, and so does `setDefaultLogger(DefaultLogger)`, so the forwarder can never forward to
  itself. `parseLogger(undefined | null)` answers `DefaultLogger`, so every fallback in every
  adapter factory, `Vault.make` and `VaultProvider` holds the same forwarding object and follows a
  later `setDefaultLogger`. It is page-wide mutable state: any code on the page that imports the
  same copy of safebyok can call `setDefaultLogger` and receive what safebyok logs where no logger
  was given. What safebyok logs carries no secret material by the `VaultLogger` contract, and a
  host's own errors pass as the host made them, so this widens who can read log lines, not what
  they contain. Two copies of safebyok in one bundle each have their own default.
* 2026-10-17 (thread 5b, store_base; amended 2026-10-19: only `storage_unavailable` carries no cause now,
  see the outcome_adapters entry at the top): **Convex carries no cause on any refusal.** `convexVaultDB`
  (`safebyok-convex/src/convex-vault-db.ts`) refuses with no `cause` at all -- `identity_revoked`,
  `vault_full` and `storage_unavailable` alike (amended 2026-10-21 (store_rulings, #217): `vault_full`
  is now an answer in `putBox`'s result, not a thrown error) -- because a Convex error on a dev deployment may
  quote the call's arguments (names, sidecars, ciphertext). Its refusals are made through
  `Sanitizer.refusalFor`, and the message points the developer to the deployment's logs and the
  browser console instead.
* 2026-10-17 (thread 5b, store_base, G304): **GraphQL errors cross with no server text where they
  might quote.** In the browser, `graphqlVaultDB` (`safebyok-graphql/src/graphql-vault-db.ts`)
  refuses a server's `BAD_USER_INPUT` or `GRAPHQL_VALIDATION_FAILED` as `bad_option` with a fixed
  message and no cause, since such errors may quote the variables, which are records. On the
  server, `vaultResolvers` (`vault-resolvers.ts`) sends a `vaultDBFor` that throws as `bad_option`
  (amended 2026-10-19: except a VaultError of kind `not_permitted` or `identity_revoked`, which crosses as it is)
  with a generic "the server's setup is wrong" message; its own message, which may name the host's
  setup or the env var names of secrets, is kept only server-side, as the non-enumerable `cause`
  of the GraphQL error.
* 2026-10-17 (thread 5b, store_base, G247): **the Convex component checks vault props update's
  `vault_id` and epoch.** The component's `putVaultProps` (`safebyok-convex/src/component/vaults.ts`)
  writes only when the new vault props keep the standing `vault_id` and its `unlock_epoch` is greater
  than the standing one; otherwise it resolves `false`, which the client reads as `stale_write`.
  This now holds even against a modified client; the core client already never sends otherwise.
* 2026-10-17 (thread 5b, store_base): **a null IndexedDB failure becomes an Error at the base
  class.** `safebyok-indexeddb`'s `settle` (`shelf.ts`) no longer replaces a null rejection
  itself; the base class's `Refusals.storageUnavailable` (`refusals.ts`) turns a null or
  undefined cause into an Error saying the backend gave none, so no refusal ever carries a null
  cause.
* 2026-10-17 (thread 5b, store_base, G285): **Postgres sets no box limit unless told.**
  `postgresVaultDB`'s `maxBoxes` (`safebyok-postgres/src/postgres-vault-db.ts`) defaults to
  `Infinity`, where it was 1000: it is sent as SQL null, and the insert counts nothing. A host
  that passes no limit lets one signed-in user, through a modified browser, grow their own vault
  without bound, and Postgres sets no limit on a vault's bytes either; bounding that is the host's,
  by `maxBoxes` or its own quotas. `graphqlVaultDB` declares `Infinity` to match, so a browser
  learns a server's limit only when the host declares it there too.
* 2026-10-17 (thread 16, strength_principles, [PR #142](https://github.com/mrflip/safebyok/pull/142)):
  **the core has no strength test of its own.** `Vault.make`'s
  `strengthChecker` that is not a function is refused
  as `bad_option` before the vault opens (`parseStrengthChecker`, `passphrase-strength.ts`, called
  from `vault.ts`, and exported from `safebyok` beside `checkValidators`). Amended 2026-10-19
  (put_wayin): one left out was refused `bad_option` too; it now becomes `UnchosenStrengthChecker` (amended 2026-10-21 (wayin_rules): now `DefaultStrengthChecker`),
  which refuses every passphrase as too weak (see the put_wayin entry). Amended 2026-10-21 (checker):
  `parseStrengthChecker` no longer exists. `Vault.make`'s options schema checks `strengthChecker` (a
  function, whose `load`, if any, is a function too; refused `bad_option` otherwise, in the schema's
  words) and defaults one left out to `DefaultStrengthChecker` (weak for every passphrase, logs
  nothing); `Vault.make` then wraps it with `guardStrengthChecker` and keeps the guarded one for the
  vault's life (amended 2026-10-21 (checker2): behind the method `vault.checkPassphrase`, not a
  `vault.strengthChecker` getter; see the checker entry). The length-only
  `passphraseLengthTest` is no longer exported; it passed `'a'` plus eleven spaces.
* 2026-10-17 (thread 16, strength_principles): **the browser default is zxcvbn, loaded on
  demand.** `browserOpts()` (`browser.ts`) supplies `zxcvbnStrengthChecker`
  (`zxcvbn-strength-checker.ts`): at least 12 code points, then a zxcvbn score of at least 3 of
  4. zxcvbn and its dictionary come in by a dynamic `import()` at the test's first call, which a
  bundler splits into a chunk served from the host's own origin and bundle; no third-party fetch
  is made. If that load fails the call rejects, so the vault refuses the new passphrase (no
  passphrase is admitted untested); the failed load is forgotten and the next call tries again
  (amended 2026-10-19 (put_wayin): it answers weak rather than rejecting; see the put_wayin entry;
  amended 2026-10-21 (checker): the import is the checker's `load`, run at `hello()`, and a failed load
  fails the `hello()`; see the checker entry).
  `@zxcvbn-ts/core` and `@zxcvbn-ts/language-common` are ordinary dependencies, not optional
  peers, because `browserOpts()` imports them: about 1.3 MB installed, about 214 kB shipped on
  demand.
* 2026-10-17 (thread 16, strength_principles): **the strength test is handed the passphrase and
  the vault's scope.** It is called as `test(passphrase, scope)`, `scope` being `{ applabel,
  user_id, vaultlabel }`. `zxcvbnStrengthChecker` passes each of the three, whole and split into
  runs of letters and digits, to zxcvbn as user inputs (`check(passphrase, userInputs)`). It
  keeps nothing between calls and sends nothing anywhere. The `user_id` is the host's opaque id,
  already in every stored record. Amended 2026-10-21 (checker): the guard hands the checker a frozen
  copy of the scope on every call.
* 2026-10-17 (thread 16, strength_principles): **in the dialog, the strength test runs on every
  keystroke by default.** In `VaultProvider` (`safebyok-react/src/vault-provider.tsx`), with no
  host `passphraseAdvice`, the passphrase dialog's advice is the strength test's reason, so the
  host's `strengthChecker` is called with each partial passphrase as the user types while
  creating a vault, never while unlocking (amended 2026-10-21 (checker): through the vault's guarded
  `strengthChecker`, so a blank partial passphrase never reaches the host's checker; amended 2026-10-21
  (checker2): through `vault.checkPassphrase`, and the provider no longer supplies an `adviceFrom`,
  the dialog asking the vault itself). A host test that does anything off the device (a
  breach-check API call, logging) does it per keystroke, on prefixes of the passphrase in plain
  text. The doc blocks and READMEs say the test hears the passphrase in plain text, must stay on
  the device, keep nothing and send nothing. A host's own `passphraseAdvice` replaces this
  default, and the test is then asked only at submit.
* 2026-10-17 (thread 16, strength_principles): **the vault holds its strength test for its whole
  life.** Thread 10's ref wrapper is gone: the vault keeps the test it was opened with, unchanged.
  `VaultProvider` checks the test at render with `parseStrengthChecker` (not a function goes to
  the error boundary as `bad_option`; missing, it is the unchosen checker, as in `Vault.make`), and a test with a new identity reopens the vault,
  warned of once. The test that gates a passphrase is the one validated at open; none is swapped
  in later through a ref. Amended 2026-10-21 (checker): `VaultProvider` no longer parses the checker
  at render; `Vault.make` refuses a bad one (to the error boundary), and the vault keeps the guarded
  checker for its life (amended 2026-10-21 (checker2): as `vault.checkPassphrase`). The dialog's advice asks
  `vault.checkPassphrase` of the vault the ask came from.
* 2026-10-17 (thread 16, strength_principles): **`withUnlockedVault` resolves null when the
  provider's own close cuts an action short.** An action, or its run again after an unlock, still
  under way when the provider closes the handle (unmount, sign-out, user switch, reopen) used to
  reject `vault_closed` to a fire-and-forget caller; it now resolves null, as a dialog the
  provider ends does. A `vault_closed` on a handle the provider still holds still rejects. Null
  from `withUnlockedVault` now also means that the vault went away under the action; the vault
  was already closed and its key dropped.
* 2026-10-17 (thread 17, written_at, [#141](https://github.com/mrflip/safebyok/pull/141)): **`putBox()`
  no longer deciphers the old box to compare whispers; `changed_at` is now `written_at`.**
  `putBox()` (`packages/safebyok/src/vault.ts`) used to open the box it replaced and compare the
  stable-serialized whispers, so storing the same whisper again left `changed_at` standing. Every
  store now stamps `written_at` with the time of the write and the field claims nothing about
  whether the whisper changed, so storage can no longer tell from a standing timestamp that the
  same whisper was stored again. The field is bound into both of the box's encryptions with the
  rest of its header, and the stored format moves from `safebyok-lockbox-v3` to `-v4` (today's is `safebyok-box-v6`)
  (`Box` and `BoxSummary`, `types.ts`); v3 records fail validation and list as damaged,
  with no migration.
* 2026-10-17 (thread 17, written_at, [#141](https://github.com/mrflip/safebyok/pull/141)): **`putBox()`
  still deciphers the old record before carrying its visible fields forward.** A store that leaves
  out the sidecar carries the old record's `sidecar_json` (amended 2026-10-21 (trust_lines): `sidecar`) and
  `registered_at` forward only from a record that opens under the vault's key (amended 2026-10-21
  (trust_lines): the lease holding it; `Box.seal` refuses an `over` of another vault, `vault_locked`) (`recordOpens`, `vault.ts`, formerly
  `openedWhisperOf`), so a sidecar or time planted in storage is not sealed into a fresh revision that
  reads clean; the function returns only a boolean and the deciphered whisper is dropped unread.
  Not taken: unwrapping only the old boxKey, whose AES-GCM additional data binds the whole
  header, would vouch for the header without deciphering the whisper, but a record with only its
  whisper ciphertext altered would then carry its sidecar forward.
* 2026-10-17 (thread 17, written_at, [#141](https://github.com/mrflip/safebyok/pull/141)): **a write's
  catch-up passes `identity_revoked`, `rolled_back` and `newer_format` through unchanged.** When
  storage refuses a write as stale, the vault refreshes once; if that refresh fails with one of
  these three kinds, the same error object is now thrown as it came, where it was wrapped as
  `stale_write` with the failure as `cause` (`catchUp`, `CatchUpPassesThrough`, `vault.ts`). The
  vault's locking on `identity_revoked` and `rolled_back` still happens in the refresh; other
  catch-up failures are still wrapped.
* 2026-10-17 (thread 17, written_at, [#141](https://github.com/mrflip/safebyok/pull/141)): **`delBox()`
  into a vault reborn elsewhere keeps kind `stale_write` and says why, quoting no boxlabel.** The
  message says the box's contents could not be deleted because the vault it was in is gone
  (deleted, or deleted and made anew, on another device), and the adapter's refusal is its
  `cause`. It names no boxlabel, since a host's boxlabel check may admit any text. It is said only
  after a successful catch-up; a failed catch-up keeps its own message.
* 2026-10-17 (thread 17, written_at, [#141](https://github.com/mrflip/safebyok/pull/141)): **new
  kind `storage_blocked`, told from `storage_unavailable` by the browser error's `name`.** The
  device-store wrapper (`deviceOutcomeOf` and `deviceTroubleAsConditions`, `device-db.ts`; amended 2026-10-19: they were in `vault.ts`, then `del-damaged-vault.ts`) says a failure
  named `SecurityError`, `QuotaExceededError` or `NotSupportedError` as `storage_blocked` (no
  retry mends it) and every other non-VaultError failure as `storage_unavailable`. The check is
  duck-typed on `name`, not `instanceof`, so a DOMException from another frame is told alike; it
  decides only the kind and the retry advice, never whether anything is written or unlocked. The
  messages name the verb that failed and quote no scope, record or key, and the browser's error
  is the `cause`. `InvalidStateError` stays `storage_unavailable`. `idbDeviceDB` (`idb.ts`) now
  throws a `NotSupportedError` DOMException at first use where the context has no `indexedDB`.
* 2026-10-17 (thread 9b, core_tidy, [#144](https://github.com/mrflip/safebyok/pull/144)):
  **`cipherCtx` refuses a top-level `undefined` or `null` part.** `cipherCtx` and its guard
  `isUnbound` (`packages/safebyok/src/crypto.ts`) refuse both as `bad_option`, before anything is
  encrypted or opened. Before, a record part holding an `undefined` field was refused, but a
  top-level `undefined` part bound as `null` (safe-stable-stringify writes it so) and a `null`
  part threw a bare `TypeError`. The types already excluded both and every caller is internal, so
  no stored vault or ciphertext changes. Left as it was: a non-finite number part (`NaN`,
  `Infinity`), which the JSON encoding also writes as `null`; every caller passes validated
  integers (epochs, `EpochMillis`), so it is noted, not guarded.
* 2026-10-17 (thread 9b, core_tidy, [#144](https://github.com/mrflip/safebyok/pull/144)):
  **Postgres refuses vault props update that does not move `unlock_epoch` forward.**
  `PutVaultPropsSql` (`packages/safebyok-postgres/src/postgres-vault-db.ts`) now carries `AND
  unlock_epoch < $new::bigint`; vault props update at the same or a lower epoch is refused as
  `stale_write` and writes nothing, as the Convex component's `putVaultProps` already did (G247).
  Before, a modified or older client reaching the server could write vault props (its wayins) back
  over the one it read at the same or a lower epoch. The core always sends the standing epoch plus
  one. VAULTDB.md line 3.2 now says a server-side adapter enforces it; client-side adapters
  (`localVaultDB`, `idbVaultDB`) are not required to.
* 2026-10-17 (thread 9b, core_tidy, [#144](https://github.com/mrflip/safebyok/pull/144)):
  **`zxcvbnStrengthChecker`'s failed load is a `VaultError` of kind `storage_unavailable`.**
  `loadEstimator` (`packages/safebyok/src/zxcvbn-strength-checker.ts`) keeps the dynamic import's
  own error as `cause`; that import never saw the passphrase, and the message names none. No new
  error kind was added; `storage_unavailable` is the nearest existing kind meaning a retry may
  mend it. A failed load never admits a passphrase untested: the vault still refuses to create,
  or to set, a passphrase it could not test. Amended 2026-10-19 (put_wayin): a failed load is no
  longer a `VaultError`: `loadEstimator` forgets the failure and answers null, and the checker
  answers weak, with a reason saying to try again, so no error and no `cause` are carried (see the
  put_wayin entry). Amended 2026-10-21 (checker): the load is now the checker's `load`, run at every
  `hello()`; a failed load fails the `hello()` as `unexpected_error` with the throw as `cause`, and a
  check that throws is refused carrying nothing (see the checker entry). Also, `VaultProvider`'s default passphrase advice
  (`adviceFrom`, `packages/safebyok-react/src/vault-provider.tsx`) now treats a strength test that
  rejects as nothing to say (no advice shown) rather than ending the dialog at the error
  boundary (amended 2026-10-21 (checker2): `adviceFrom` is gone, and a check that throws goes on to
  the app's error boundary again, see the 2026-10-19 (a_sec) react entry); the gate at Create is unchanged, since the vault runs the test again there.
* 2026-10-17 (thread 9b, core_tidy, [#144](https://github.com/mrflip/safebyok/pull/144)):
  **the vault-size allowance per box is 1 KiB, down from 2 KiB.** `BoxFieldsBytes`
  (`packages/safebyok/src/vault.ts`) is the allowance for the fields beside the whisper and sidecar.
  `Vault.make` refuses a `maxBoxes` whose boxes, each counted at twice `maxWhisperBytes`
  plus this allowance, might not fit the adapter's `maxVaultBytes` (the bound that keeps a vault
  erasable whole in one Convex transaction). Those fields measure under 1,000 bytes at the default
  validators' longest names (a test proves it), and each `putBox()` still weighs its box's real
  names against the limit. On Convex's 8 MiB: 102 boxes of the default 40,444-byte whisper fit
  (was 101), 1,638 of 2 KiB whispers (was 1,365). The Convex component's own server-side limits
  (8,000 boxes, 7 MiB less 1 KiB) are unchanged. This supersedes the 2 KiB allowance named in
  earlier entries.
* 2026-10-17 (thread 9b, core_tidy, [#144](https://github.com/mrflip/safebyok/pull/144)):
  **the vault's checked scope is frozen.** `checkScope` (`packages/safebyok/src/names.ts`) returns
  `Object.freeze(...)`. The same object is handed to the host's `strengthChecker` and held
  in `getSnapshot().scope`, and the vault keys storage and the cipher ctx by it; frozen, none
  of the three can change it for the others. Amended 2026-10-21 (checker): the host's checker is handed
  a frozen copy of it by the guard, not this object (amended 2026-10-21 (checker2): the copy is made
  once at `Vault.make`).
* 2026-10-17 (thread 9b, core_tidy, [#144](https://github.com/mrflip/safebyok/pull/144)):
  **`putBox()` refuses unknown option keys with `bad_option`.** `optionsCheck`
  (`packages/safebyok/src/options.ts`, shared with the strict check of `Vault.make`'s `validators`)
  refuses a key it does not know. A caller still passing the retired `{ note }`, beside or instead
  of `{ sidecar }`, is told at once rather than silently storing no sidecar. The refusal never
  quotes the options. Amended 2026-10-21 (checker): every options-bag check (`optionsCheck`: `hello`,
  `ensureLease`, `putBox`, `Box.seal`, the validators, a VaultDB call's opts) and `Vault.make`'s options
  schema now report Zod's own English message, `zod/mini`'s `en` locale passed per parse and never by
  `Z.config`, so the host's Zod is untouched. Zod's English names the type of a refused value, never
  the value; it does quote the options bag's field names (the host's code), where `optionsCheck`
  formerly quoted nothing. No secret material reaches these bags.
* 2026-10-17 (PR [#6](https://github.com/mrflip/safebyok/pull/6)): **the non-extractable vaultKey
  is not a defence against code running in the page while the vault is unlocked.** The session's
  vaultKey handle is a non-extractable WebCrypto `CryptoKey`, so page code cannot export its raw
  bytes. That keeps a passing compromise (an XSS, a malicious extension, a stolen unlocked device)
  from carrying the key away for use after `lock()`. It does not stop injected code, while the
  vault is unlocked, from calling WebCrypto with the handle to decrypt every box, or from
  reading whispers through the vault's own API (`getBox()`, `useBox()`), which no design prevents. The
  `putWayin` entry of 2026-10-15 mentions this in passing; this entry states it on its own. A
  host can keep the lease short, call `lock()` on sign-out and on screen lock, serve the
  page under a strict Content-Security-Policy, and never load third-party script into a page that
  holds an unlocked vault. Amended 2026-10-21: the same holds while a lease stands on the device, the vault open or not:
  anyone who can use this browser profile can open the vault with the lease's leaseKey, and
  `unwrapKey` can hand back the vaultKey extractable (the 2026-10-14 leaseKey entry above).
* 2026-10-17 (thread sweep_small, [#143](https://github.com/mrflip/safebyok/pull/143)): **the Postgres README no longer ships a hard-cap trigger
  recipe.** The `safebyok-postgres` README used to carry SQL for a `BEFORE INSERT` trigger on
  `safebyok_boxes` that refused a box past a hard limit, taking a transaction-scoped
  advisory lock per vault; under REPEATABLE READ it counts from its snapshot, so racers may
  overshoot. The repository ran that SQL against a real Postgres in
  `e2e/tests/postgres/hard-cap.test.ts`. The recipe, that test, and the PGlite test that read the
  README's SQL are deleted; the README now gives a short prompt a host pastes to its coding agent,
  which reads the library and writes the trigger, explaining the trade-offs. The package's own
  box limit (`maxBoxes`, one counting insert) remains a best effort that racing writers
  may overshoot by up to N-1 places, and is documented as such. A host that needs a hard cap now
  owns a trigger the package no longer tests, so its isolation level, its lock and its refusal
  (surfaced as `storage_unavailable`, not `vault_full`) are the host's to verify. The limit exists
  to stop a runaway loop and keep a vault listable and erasable; it is not a quota against a
  determined client.
