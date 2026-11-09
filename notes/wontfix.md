# Won't fix

Behaviour the package leaves undefined on purpose: cases a host can reach, whose outcome we do not
promise, test or design for, each with the ruling that put it here and what happens today. A
reviewer reads `notes/security.md` for what we decided; this file is for what we decided not to
decide. Add an entry at the end of the list, dated, with the ruling or the row it came from.

**This file is in flux (November 2026).** The vault is being redesigned, and many entries describe the
design as it stood in late October. Read each one as what we expected to leave alone under that design,
not as a settled ruling, and check it against the current design before relying on it.

* 2026-10-16 (G129, the Coach: "make a file WONTFIX"): **one device, one setting.** Opening the
  same vault on one device with different settings -- a different `leaseHours`,
  `maxWhisperBytes`, `maxBoxes`, `validators` or `keyDeriver` -- is
  undefined behaviour, whether the handles are in one tab or in two. A device keeps one lease
  and one device mark per vault, shared by every handle on it, and each handle reads them by its
  own settings. Today, for the lease: an open with a shorter `leaseHours` than the lease was
  granted under discards it (see `fetchLease` in `packages/safebyok/src/vault.ts`), so a tab
  opened with the shorter setting discards the lease a tab with the longer one granted, and every
  tab on the device asks for the passphrase again.
  That is the safe direction, and it is all we say of it. A host that varies a setting by route
  passes the same one everywhere a vault opens on a device.
* 2026-10-16 (the Coach, thread 7, [#129](https://github.com/mrflip/safebyok/pull/129) and thread
  14, [#134](https://github.com/mrflip/safebyok/pull/134)): **Chrome ignores `autocomplete="off"` on
  a password-type field.** The whisper field may still be offered a saved password in Chrome.
  Avoiding it would take a text field masked by the non-standard `-webkit-text-security`, which not
  every browser honours. The Coach: "put as WONTFIX." We keep the password-type field, which
  every browser masks, and turn away what the attributes can turn away (autofill and generators).
* 2026-10-16 (the Coach, thread 2, [#133](https://github.com/mrflip/safebyok/pull/133)): **an own
  `__proto__` key in a sidecar or a whisper is undefined behaviour,** as `undefined` and
  functions are. A sidecar or a whisper with an own `__proto__` key loses it on the way in, because
  Zod's record assigns it as the prototype: nothing leaks, but the host gets back less than it
  stored, the way it already does for `undefined` and functions, which JSON does not serialize.
  The Coach: "we check for a crazy edge case used by people who know exactly what they're doing or
  have nfid what they're doing, so we can make them drop the weird field we would have dropped
  anyway." No refusal; a host that cares keeps such keys out of what it stores.
* 2026-10-22 (the Coach, primitives sprint, ruling against a turn queue): **no ordering among a
  vault's box calls.** `getBox`, `putBox` and `delBox` calls in flight together on one vault, for
  different boxes or the same `boxlabel`, settle in no promised order. The vault joins only its
  storage refresh (a `hello()` during one is in it, not behind it) and its gating (one prompt at a
  time); nothing queues the box calls. A store's expectation (`vault_tok`, `gate_epoch`, a box's
  `revision_tok`) prevents a lost update, not a reordering: a host that needs an order awaits each
  call before making the next.
* 2026-10-31 (the Coach, newvault sprint, thread 2): **a refused erase of a cached lease is not
  retried.** `Lease.buildFromCache` meeting a row of another epoch erases the deviceDB's record
  once (`tryForgetLease`); a refusal is warned of and left. The record is unusable either way, and
  the next grant writes over it. A `lock()`'s own refused erase is told as a panic (`vault.#panic`).
* 2026-10-31 (the Coach, newvault sprint, thread 2): **no autolock timer past the Trigger's cap.**
  A lease whose `autolock_at` lies more than `MaxTimerMillis` (about 24.5 days) away arms no
  timer, by design: it locks no vault on its own, but reads not in force, and refuses
  `vault_locked`, once the clock passes its `autolock_at`.
* 2026-10-31 (the Coach, newvault sprint): **a lease's `vacate()` whose device erase is refused
  is not retried.** `vacate()` drops the lease's keys and record, then erases the deviceDB's record
  once (`forgetLease`); a refusal is thrown from `vacate()`, and a second `vacate()` on the same
  lease erases nothing, as it already dropped its record. The entry on a refused erase of a cached
  lease covers the refused erase on `Lease.buildFromCache`; this one covers `vacate()` itself. The deviceDB is
  a cache, and the next session asks for the passphrase. Pinned by
  `packages/safebyok/tests/loosened/lease.test.ts` (its one test); the Coach, "yeah skip", on
  retrying a refused erase.
* 2026-11-02 (the Coach, unrace, `unrace-new_vault.md` at commit e135d0352, since deleted; not yet built):
  **a failed delete still locks the vault on this device.** `del_vault` locks first, as a lock is
  synchronous and safe, then removes the vault from the vaultDB and the deviceDB, then vacates. So a
  delete the vaultDB refuses still logs the user out of this device, and they log back in to try the
  delete again. That is unpleasant, and could leave them thinking the vault is gone from their other
  devices when it is not. The verb does refuse, so a host can say so. The Coach: "Still: WONTFIX."
* 2026-11-03 (unrace, `whiteboard/20261102-newdesign/newdesign-proof.md`, *The lease*): **a `lock()` during
  the cache's `Lease.buildFromCache` loses.** The vault reports unlocked on the lease built from the cache, the lock's erase
  stands, and the next session asks for a proof. The next `lock()` ends that session.
* 2026-11-03 (the Coach, unrace, `whiteboard/20261102-newdesign/newdesign-proof.md`, *Rows for `notes/wontfix.md`*,
  since moved here):
  **a `lock()` whose erase is refused can reopen with no proof.** The vault locks and the lock's erase of
  the deviceDB's cached lease is refused and told as a panic, so the record survives. The next `ensureUnlocked`
  gets it from `Lease.buildFromCache` and attaches it, asking nothing, so a vault the user locked reopens with no
  passphrase. With no `onPanic`, the panic's vacate stops that in the tab that locked; with one, stopping it is the
  host's. Either way the row can survive for other tabs and later sessions. The Coach, 2026-11-02: won't fix, but
  "one I worry about"; and, 2026-11-03: "This is why the panic button exists, there is no fix we can apply if the
  system somehow is operational enough to read leases, decrypt data and everything else but delete data."
* 2026-11-03 (the Coach, unrace): **a refused erase with no `onPanic` can bring a false prompt.** `Vault.#panic`
  delists the vault, so `ensureVault` then asks for a passphrase for a vault that exists. The Coach: "If the
  host has no on panic they've given their opinion, wontfix."
* 2026-11-03 (the Coach, unrace): **a delete whose erase is refused, with no `onPanic`, still lands.** The vault
  is tombstoned in the vaultDB and the delete is answered, whatever the erase of the cached lease did. The same
  ruling: a host with no `onPanic` has given its opinion.
* 2026-11-03 (the Coach, unrace): **a host's own getter that throws a `VaultError` quoting the passphrase passes
  the gating's check whole.** The gating replaces a foreign throw from a getter with `unexpected_error`, keeping nothing of it, but passes a
  `VaultError` as it came and does not inspect its text; one a host's getter throws with the passphrase in its
  message reaches the caller whole. The Coach: "Wontfix agreed".
* 2026-11-03 (the Coach, unrace, `whiteboard/20261102-newdesign/newdesign-proof.md`, *Changing the gate*, and *Rows for
  `notes/wontfix.md`*, since moved here): **a gate change leaves another device's session lease to run.** No device
  locks on it: another device's session keeps its lease to its `lock()` or next `bank.autolock`, and its cached lease, of the
  older `gate_epoch`, is forgotten at its next session.
* 2026-11-03 (the Coach, unrace, `whiteboard/20261102-newdesign/newdesign-proof.md`, *Rows for `notes/wontfix.md`*,
  since moved here): **cross-tab complications, all of them.** Tab A's `lock()` or
  vacate leaves tab B unlocked, and nothing tells it.
* 2026-11-03 (the Coach, unrace, `whiteboard/20261102-newdesign/newdesign-proof.md`, *Rows for `notes/wontfix.md`*,
  since moved here): **a put can land though its answer is lost.**
* 2026-11-04 (the Coach, on `Lease.buildFromCache` rejecting where a clock throws): **anything to do with a host clock.**
  The package reads the device's clock, `Date.now()`; a host has none to pass, and a test sets it with
  `_cheat_clock`. A device clock that jumps or runs backward is undefined behaviour.
* 2026-11-05 (the Coach, on `box.put` answering `this`): **a box discarded while its own `put` is in flight answers itself, not the instance listed.**
  A box listing never replaces a held box, so `put` answers the instance it was called on. Only a `box.vacate()` or `box.sweep()`, or a
  `boxListing.hello` naming the box damaged, landing inside the put's `tryPutRow` empties the slot, and the delivery then lists a new instance.
  The caller holds the discarded one, which refuses `disabled` from then on; the listing answers the new one.
* 2026-11-05 (the Coach's brief for `box.putExposed`: "a race gets a row"): **a `box.unexpose()` crossing a `box.putExposed()`.** `putExposed` takes
  the value exposed when it is called, before its hydrate, so an `unexpose` that lands inside the put's awaits changes nothing about what is sealed:
  the value taken at the call is stored, and the instance holds none.
* 2026-11-05 (the Coach's brief for the fields, now `BoxFields` in `safebyok/dom`: "a race gets a row"): **a `box.expose()` crossing the last unbind.** An `expose` in flight when the
  last field unbinds lands after the `unexpose`, so the whisper stays exposed with no field to tie it to, until the host unexposes or the box is swept,
  vacated or deleted. Also: **a `fields.save()` crossing an edit:** it reads the fields when called, so what is typed during the put's awaits is not
  in that put, and stays in the element for the next.
* 2026-11-06 (a review of #505, the Coach: "add the row"): **two copies of `safebyok/dom` in one page.** `BoxFields.of` keeps one `BoxFields` per box
  in a module-level map, one per copy of the module. A page that loads `safebyok/dom` both as ESM and as CommonJS gives a box two `BoxFields`,
  each with its own fields and its own last unbind, so the box unexposes when either copy's last field unbinds.
* 2026-11-07 (the Coach, vaultdb_cleanup, thread 7, the Convex field-name row): **Convex refuses a field name that starts with `$` or holds a
  non-ASCII character, at any depth of a record.** A sidecar or a record's own field named so is refused by Convex, and the call fails as
  `storage_unavailable`. Convex's docs add other names it will not take: empty, or starting with `_`; nesting past 16 levels; more than 1024
  entries in one object. The core does not check for any of these before the call.
* 2026-11-07 (the Coach, vaultdb_cleanup, thread 7, the GraphQL stream row): **the GraphQL stream stops on a best-effort basis.** The server's
  resolvers ask `userIdOf` again on each notice, so an idle stream stays open until its next change, and a `userIdOf` that does not look the
  session up live (a cached or decoded token) gives no stop at all.
* 2026-11-07 (the Coach, vaultdb_cleanup, thread 7, "A Convex vault full of tombstones needs a delVault": "publicize and accept"): **a Convex
  vault whose deleted boxes fill its cap refuses new box labels until the vault is deleted.** A deleted box leaves its tombstone, which counts
  toward the vault's box cap as a live box does; only a put under a label already held takes a tombstone's row back. The Convex README says so.
* 2026-11-07 (the Coach, devicedb_idb, on a damaged lease row outliving a vacate: "I predict trouble when multiple tabs have the
  same lease. Mark anything like this wontfix. We will in future have tabs notify but store independently, how I don't know."):
  **a lease row that fails its check is neither listed nor forgotten.** `DeviceDB.listLeases` leaves it out and `DeviceDB.forget`
  leaves it standing, as it holds no `vault_tok` to match, so a vacate or a `bank.autolock` never erases it; it stays until a later
  stow over its scope; `DeviceDB.listRawLeases` shows it beside its scopepath, and a host deletes it by that scopepath with `DeviceDB.delRawLease`. Also: **tabs sharing one device store's leases are undefined.** Every tab of an origin opens the same
  `IdbDeviceDB` database, so one tab's stow, forget or vacate lands under another's lease unannounced.
* 2026-11-07 (devicedb_idb, the device database's wipe): **a tab holding an old device database open keeps it.** `IdbDeviceDB`
  deletes the databases of an older version unread on its first call, and a tab of an older release still holding one open blocks
  that delete; the database goes once that tab closes and a later page load deletes it again.
* 2026-11-07 (the Coach, on a proposal to chain each revision to its prior): **storage that rolls a record back.** Nothing detects it beyond one session,
  and nothing chains a revision to its prior. The Coach: there is no certainty the device is right and the server wrong or vice versa; a device
  that writes on top saw a working state, storage saw one, and a record that deciphers was sealed under a working key. Today a fetch below
  the revision held is ignored as `older`; after a reload the older copy is taken as found.
* 2026-11-09 (the Coach, after designing it in `whiteboard/20261108-del_damaged/del_damaged-spec.md`: "I predict too many bug reports about
  non-bugs"; replaces the 2026-11-03 row that a damaged row stays until the customer names it): **the library does not delete a row that
  fails its check.** A damaged box row stays listed in `damaged_rows`, reads as `damaged_row`, and still counts toward `maxBoxes`; a damaged vault
  row is told as bad news and stops a `delVault` that meets it. The customer clears either with their own store's tools. The spec is the design
  to start from if that changes.
