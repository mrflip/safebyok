# Guarantees: drift in the new core

`notes/guarantees-big.md` states where secret material lives in `safebyok-big`, as numbered guarantees, and is not
edited. The new core (`packages/safebyok`) may cite a guarantee by number where it keeps it in substance. Where it
drops, loosens, changes or adds one, the change is written here, one entry each, until the guarantees are rebuilt for
the new core.

An entry gives the date, the thread or PR, the guarantee's number (or *new*), the files of the new core concerned, and
what differs from big, in a sentence or two.

## Added

* 2026-11-15 (lean_buttonup), *new*: **No remote subscription protocol.** The design never depends on change
  notices that arrive over a protocol of their own, apart from the store's answers. A store with a watch of its own
  (memory, Postgres) notifies from the device's side, and a hosted vaultDB, such as GraphQL's, turns that off and
  notifies by itself.

## Drifted

* 2026-11-20 (cloak), G1, G2 and G9: **A cloak keeps a form's cleartexts for its mutation's life.** `cloak()`
  (`packages/safebyok/src/helpers/cloak.ts`) adopts a form's passphrases and passkey answers into a `Cloak`'s private
  fields, and safebyok-react's giver hands each form mutation one, vacating it once the mutation settles. So a
  passphrase is held in a field (G1: in big, only ever an argument or a local), and a copy of a passkey answer's PRF
  bytes outlives each attempt, for all the mutation's retries (G2: in big an answer is single-use; G9: in big only
  `Gating`, `Proving` and `Lease` hold a pre-image). The host's PRF bytes are zeroed at adoption, each attempt still
  zeroes the copy it is handed, and `vacate()` zeroes the cloak's own. A host's `onSettled` in a form mutation's options
  replaces the vacate, and the cloak then keeps its cleartexts until it is let go.
  amended 2026-11-21 (gating_instance): the cloak is gone. A form verb's gating is an instance, `Gating`
  (`packages/safebyok/src/models/gating.ts`), which a bank's maker (`bank.unlockGating` and its siblings) makes over the
  form's cleartexts, adopting them as the cloak did; the host hands it to the form mutation, which attempts it once and
  vacates it. A passphrase is still held in a private field until the gating is attempted or vacated (G1), and the copy
  of a passkey answer's PRF bytes is the gating's, which G9's "only `Gating`, `Proving` and `Lease`" covers again. The
  host's PRF bytes are zeroed at adoption, before the cleartexts' fields are checked, and the gating's copy in its
  attempt's `finally`. The gating has no getter: its cleartexts leave it only to its verb's body.

* 2026-11-20 (form_verbs), G2: **A passkey answer is vacated after every attempt.** In big an attempt refused with a
  correctable refusal, short of its gating's last, left the answer's PRF bytes un-zeroed for the host to hand in again.
  The new core has no gating to try again in: each attempt (`packages/safebyok/src/models/gating.ts`) zeroes every
  passkey answer it is handed, the proof's (`passkeyClear`) and a new passkey's (`nextPasskeyClear`), in a `finally`,
  whatever its outcome. G2 is tightened: the caveat that leaves the zeroing to the host no longer applies.
  amended 2026-11-21 (gating_instance): the host's answers are zeroed when the gating is made, the cleartexts refused or
  not, and the gating's own copies when its single attempt ends, whatever its outcome, or at `gating.vacate()`.
  amended 2026-11-21 (birth_verb): a refusal made before any gating exists zeroes nothing, and leaves the answer to the
  host: `Bank.birth` handed no `Device`, and `Bank.birthGating` handed an `attachBank` that is not a function
  (`packages/safebyok/src/models/bank.ts`). The giver's makers already refused so before reaching a bank.

* 2026-11-19 (bank_gatings), the leaseKey's access chain: **A device's sweep evicts no lease.** In big, the device's
  sweep reaches `bank.lock()`, which evicts the lease. The new core's `Device` holds no handle to its banks, so
  `device.sweep()` reaches none: a bank of a swept device refuses every call (its `isEnabled` reads its device's), and
  its lease refuses every seal and unseal, but the lease keeps its leaseKey until the `Bank` is let go.
  `bank.sweep()` (`packages/safebyok/src/models/bank.ts`) evicts it through `lease.sweep()`; nothing calls it from the
  device yet.
  amended 2026-11-20 (snapshots, #773): `device.sweep()` now reaches the last `Bank` made on the device, through
  `device.cheatHoldBank`, and sweeps its lease; a `Bank` made earlier on the same device still keeps its leaseKey.
  amended 2026-11-20 (life_cascade): `device.sweep()` no longer ends the device. It sweeps the bank it holds (whose
  `lease.sweep()` evicts the leaseKey, as before), lets that bank go, and stays usable, so a bank made after it is a
  fresh one with no lease until it is unlocked. A bank made earlier was still not reached, and stayed enabled too:
  its lease sealed and unsealed until it expired or that bank was locked or swept.
  amended 2026-11-20 (life_cascade, review): that drift is gone. The device keeps each `Bank` made on it
  (`device.cheatHoldBank`) until it is swept, and `device.sweep()` sweeps every one, so every lease is evicted and every
  bank refuses `disabled`; making a bank sweeps no other. One drift remained: `device.lock()` locked only the last bank
  made, and an earlier one kept its lease until it expired or was locked or swept.
  amended 2026-11-20 (life_cascade, review): that remaining drift is gone: `device.lock()` locks every bank made on the
  device, so no lease outlives a device's lock or sweep.
* 2026-11-20 (bank_gatings, #772), G1 and G9: **The Bank takes cleartexts, unread.** In big no `Bank` method ever
  received a passphrase or PRF bytes (G1's chain; G9's "only Gating, Proving and Lease"). In the new core the Bank's
  four re-entry points, `attemptUnlock`, `attemptReplacePassphrase`, `attemptAddPasskey` and `attemptRevokePasskey`
  (`packages/safebyok/src/models/bank.ts`), take the cleartexts a form collected and pass them unread to `gating.ts`
  (the open gating, or `attemptWithoutGating`), so G1 and G9 hold in substance.
  amended 2026-11-20 (vault_try): the four are now `tryAttemptUnlock`, `tryAttemptReplacePassphrase`,
  `tryAttemptAddPasskey` and `tryAttemptRevokePasskey`, each answering an outcome, with throwing twins under the old names
  that call them; neither reads the cleartexts, so G1 and G9 still hold in substance.
  amended 2026-11-20 (form_verbs): the re-entry points and the `Gating` class are gone. The Bank's form verbs,
  `Bank.birth`, `unlock`, `replacePassphrase`, `addPasskey` and `revokePasskey` and their `try` twins
  (`packages/safebyok/src/models/bank.ts`), take the cleartexts a form collected and pass them unread to the attempt
  functions of `packages/safebyok/src/models/gating.ts`, which check them, build and spend the provings, and reach the
  bank's private `#putGate`, `#unlockByProving` and `#birthByProving` through a friend. So G9's "only `Gating`,
  `Proving` and `Lease`" reads, in the new core, "only `gating.ts`'s attempts, `Proving` and `Lease`"; no public method
  accepts a proving, and G1 and G9 hold in substance.
  amended 2026-11-21 (gating_instance): the Bank's makers (`Bank.birthGating`, `bank.unlockGating` and its siblings)
  hand the cleartexts, unread, to a `Gating` subclass's constructor with the friend; its `attempt` runs the body that
  was the attempt function. The entry points export the gating classes as types only, as big exports `Gating`, so the
  published surface has no constructor a host could hand a friend of its own.
  amended 2026-11-21 (gate_holds, #815): the makers and the private verbs they befriend are the `Gate`'s
  (`gate.unlockGating` and its siblings, static `Gate.birthGating`, `#unlockByProving`, `#putGate`, in
  `packages/safebyok/src/models/gate.ts`), and so is the one `Lease`, kept private in the gate's `#lease`: G9's "the
  Bank keeps its one `Lease` private" reads "the Gate keeps it". A lease is granted to a `LeaseGate` and binds the
  bank's stamp as before. No public method accepts a proving, and G1 and G9 hold in substance.

* 2026-11-22 (core_first thread 2, bank_minder), G3: **The main gate's record is cached in a BankMinder world that
  outlives the bank.** The device's one `BankMinder` (`packages/safebyok/src/minding/bank-minder.ts`) caches each bank's
  world, the main gate's record with its `bank_key_wayin_wrapped` among it, for any number of users, and nothing removes
  a world: a VaultMinder's `goodbye`, a bank's sweep and a device's vacate leave it. Before, the gate was an item in the
  minder's cache, which `goodbye` emptied. G3 holds in substance: the wayins are the ciphertext the bankDB stores, and
  no naked bankKey or handle to one is cached. What drifts is how long that ciphertext stays in memory once the bank is
  swept, which the ends (vacate, delete, goodbye) are to settle.
