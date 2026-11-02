# Race survey: where we panicked, and whether it is still a worry

For the Coach, 2026-11-02. Judged against `origin/main` (`bac1d45b`), chiefly `models/`, plus
`unrace-new_vault.md`, plus no staged edit. Weighed by `notes/simplicity-means-safety.md`. Every
interleaving here was reasoned through the code and the spec, not run.

**Counts:** 11 still a worry, 27 accepted, 16 gone, 8 never real.

**Citations.** `models/x.ts:N` is `packages/safebyok/src/models/` on main. `tip:x.ts:N` is the same
path on PR #442's tip (`origin/20261101-vault_guards`, `48b16571`). `old:x.ts:N` is
`packages/safebyok/src/` outside `models/`, used only as evidence of the fear;
`vault-races.test.ts` is `packages/safebyok/tests/vault/vault-races.test.ts`, the same. `spec:N` is
`unrace-new_vault.md`. `sec:N` is `notes/security.md`. `wontfix YYYY-MM-DD` is the dated entry in
`notes/wontfix.md`; those marked (tip) exist only on the tip. `TODO *X*` is a section of `TODO.md`.

---

## Still a worry

Most serious first. S1 is a lockout; S2 to S6 mislead a user or break a claim the spec leans on; S7
to S11 are narrow.

### S1. A record of another life with no tombstone heard wedges the device

* **Where.** `models/storable.ts:446-449,487`; `models/listing.ts:71-89,217-222`; TODO *Flush and
  remake every instance of a vault made anew*; spec:44-45,504; sec:466-469 ("same scope, other
  vault_tok is a new life: reload"); old:vault.ts:1028-1032 (`#becomeGone`).
* **Interleaving.** This device holds Vault X and is offline, or its watch coalesces (the tip's
  store-front sweep pushes only what changed since the last sweep, `tip:store-front.ts:245-256`).
  Another device runs `del_vault`, then `bank.ensureVault` makes Y. Here, `bank.hello`'s `hydrateAll`
  or a Trigger's `tryFetch` gets Y. `Vault.receive(Y)` throws 'unexpected_error' in
  `reconcileCentral`: told as bad news, or thrown to `bank.ensureVault`.
* **Consequence.** A lockout of that vault on this device. The Vault stays X, every `bank.ensureVault`
  rejects, and a reload revives X from the vault cache and meets the same throw, so the old advice
  ("reload") does not help. X's old passphrase still opens a session here, and storage refuses its
  box calls `vault_gone`, so no data is at risk. The spec draws a Vault going only on a tombstone.
  A host that knows to call `vault.vacate()` gets out; nothing tells it to.
* **Plainest.** A record under another `vault_tok` takes the tombstone's path: the Vault vacates, and
  the next `bank.ensureVault` makes a new one.

### S2. `takeWorld` makes a sparse vault, which the spec says cannot exist

* **Where.** `models/vault.ts:99-101` (still `tip:vault.ts:168-170`); `models/storable.ts:474`
  (newer sparse: 'adopt'); `models/listing.ts:190`; spec:17-18,366; the panic at `tip:vault.ts:368`
  ("a sparse record received while it waited would leave the gating no gate to read").
* **Interleaving.** Another device runs `vault.replacePassphrase`. Here, a `box.fetch` or `box.send`
  answer arrives first, with `world` at the newer revision. `Vault.takeWorld` strips it through
  `listing.sparseOf` and `receive` adopts it: central has no gate. The user hits enter; `gate =
  vault.gate` refuses 'bad_option', which is not correctable, so the gating settles.
* **Consequence.** A user misled: a correct passphrase gets a dead dialog and a misuse error. No gated
  verb fetches, so only the Trigger or the next box verb's `hydrate` repairs it. `vault.send({})`
  refuses the same way.
* **Plainest.** `takeWorld` does not adopt a sparse newer record over a full one; it marks the Trigger
  due, or the box answer carries the vault whole.

### S3. One refused background fetch ends the Trigger, so "the window" is not a window

* **Where.** `packages/safebyok/src/helpers/trigger.ts:46,147-151`; spec:19-22,75-78,561.
* **Interleaving.** A laptop wakes. The Trigger's timer fires before the network is back. `tryFetch`
  refuses, `#launchAlone` calls `taskCompleted(outcome)`, which "changes nothing else", and no next
  launch is scheduled. The watch may be down too. No gated verb fetches and `send` does not hydrate,
  so only a box verb's `hydrate` or a reload restarts it, and a vault sitting at an unlock dialog has
  neither.
* **Consequence.** The held gate freezes. A wayin revoked elsewhere keeps unlocking here (A4) past the
  stated bound, and S4 lasts until reload. The spec's row, "holds only while refreshes are working",
  hedges this, but reads as an outage, not as one blip ending refreshes for good.
* **Plainest.** A refused launch still schedules the next. Failing that, say so in the row.

### S4. The right new passphrase is refused as wrong on a stale gate

* **Where.** spec:19-22,75-78,367-369; spec:402-404 covers gate changes only; sec:385-388 ("each
  attempt reads storage afresh first"), `tip:vault.ts:516-523` (`await this.fetch()`).
* **Interleaving.** The user runs `replacePassphrase` on a phone, then goes to a laptop tab whose vault
  has not heard. `ensureUnlocked` launches. `gating.attempt({ passphraseClear })` reads `vault.gate`,
  the old one; `buildStored` answers 'wrong_passphrase', correctable. The re-entry reads the same
  gate. A `passkeyClear` for a passkey added elsewhere gets 'absent_wayin', which settles.
* **Consequence.** A user misled, and locked out for up to the window (see S3). They are told their
  correct new passphrase is wrong, while the old one works (A4). This is the commonest moment for a
  stale gate, right after a change, and the spec draws only the stale-gate case that ends in
  `stale_write`.
* **Plainest.** A row in `notes/wontfix.md` stating it with its bound, beside the revoked-wayin row.

### S5. A decline or a dialog closing across an attempt is undrawn, and the queue that handled it goes

* **Where.** `models/gating.ts:115` (a dialog closing waits for `#attempting`), `:135-137` (`decline`
  settles at once); `tip:gating.ts:148-151,189-198` (`#inTurn`), which spec:31-32 removes;
  `safebyok-react/src/modal.tsx:66,91` and `bank-provider.tsx:257` (Cancel and Escape answer 'declined',
  which closes the dialog and resolves its request); sec:536-540,1228-1240. The spec never mentions
  `decline`, and spec:342 draws a dialog closing only after `run` has returned.
* **Interleaving.** `gating.attempt` is deriving. The user presses Cancel or Escape, so the host's
  dialog closes, or the host calls `gating.decline()`. If either settles the gating 'declined', the
  verb refuses and `run` carries on: `vault.send({ gate: nextGate })` lands, or `attachLease` unlocks and
  caches. Main already does this through `decline()`, and guards the dialog-close door only.
* **Consequence.** A user misled: told cancelled, while the passphrase changed, or the vault unlocked.
  spec:32 has the dialog disable "its button"; Cancel and Escape are not drawn.
* **Plainest.** The enter-key rule says it in a line, as `goodbye` already does: a decline past the
  enter key settles once the attempt has run, or does nothing.

### S6. Work in flight at `bank.goodbye` makes new things past it

* **Where.** spec:255-256,267-268,303; `models/listing.ts:87,92-95`; `models/vault-listing.ts:69-72`;
  `tip:vault.ts:242-252` (`#boxesGoodbyes`, the same panic one level down); old:bank.ts:505-549
  (`#demandHeld`); sec:1297.
* **Interleavings.** The one-way state is per Vault, and `bank.goodbye` reaches only Vaults held then.
  * (a) `bank.hello` is awaiting `cache.load`; sign-out calls `bank.goodbye`; hello goes on, revives
    instances, `#unwatch ??=` opens a watch, `hydrateAll` arms Triggers.
  * (b) A birth's `store.put` is in flight; `bank.goodbye`; `new Vault` was never told, so
    `attachLease` passes: unlocked, autolock and Trigger armed.
  * (c) `ensureUnlocked` is past `#fetchLease`, or `bank.ensureVault` past its fetch; `bank.goodbye`;
    the launch calls `requestCleartext` for the signed-out user's vault.
  * (d) `bank.goodbye` then `bank.hello` on one Bank: held Vaults refuse every `attachLease` after the
    user has typed, and spec:44 says an instance is replaced only when deleted.
* **Consequence.** (a) a leak and noise: a dropped bank fetches as nobody. (b) an unlocked Vault in an
  abandoned bank. (c) the next user sees the last user's dialog, in a host other than `BankProvider`,
  which gates its handlers per bank. Goodbye's row, "no timer armed, no watch open", cannot be
  checked, which spec:295 says marks an invariant that is not one.
* **Plainest.** One flag on the Bank, read before a launch, a hold and a watch, with `hello` refusing
  past it. Or a row, and goodbye's row weakened to what it can state.

### S7. A ghost Vault: `#buildOrReceive` builds from any answer once the instance is removed

* **Where.** `models/listing.ts:214-226,250-253`; spec:44-45,273-274,496,504,304 ("nothing of it on
  this device").
* **Interleaving, common.** On a store that rings on its own writes, during `del_vault`'s `run`: the
  watch delivers the tombstone, `vault.vacate()` removes the Vault; then `vaultListing.del`'s answer,
  the same tombstone, reaches `#deliver`, finds nothing held, and makes and holds `new Vault(tombstone)`.
* **Interleaving, rarer.** A Trigger fetch in flight at `vacate` answers the old live record, which
  makes a live instance and saves its copy to the cache after `vacate` cleared it; or a second `hello`
  revives a cached copy.
* **Consequence.** A held Vault with no gate, against "always full". Then a rebirth on this device
  delivers Y to the ghost, which throws 'unexpected_error' (S1) unless `vaultListing.ensureVault`
  bypasses the path. The live-record ghost reads as a vault back from deletion until the next fetch,
  and fails safe at any put.
* **Plainest.** The listing makes no instance from a tombstone. The live-record ghost is a row.

### S8. "Nothing stored", read before a birth, arrives after it

* **Where.** TODO *A storage read begun before a create can undo it*; sec:850-869;
  `models/storable.ts:358,466`; spec:569 (`adopt` covers older records, and null has no revision).
* **Interleaving.** `bank.ensureVault` A is at the put. `bank.ensureVault` B, a double mount, or a
  `box.hydrate` beside a first `box.send`, has a fetch out, served before the put landed. Its answer
  arrives after the Vault is held. `receive(null)` becomes a tombstone at the held revision, and
  `reconcileCentral` throws 'record_conflict' (`OneRevisionTwoFates`).
* **Consequence.** Noise, loud and narrow: caller B hears a data-integrity failure, or `onBadNews` does.
  No state moves, so the old harm, the new vault stood down, is gone. The same null on a row deleted by
  hand (spec:555) throws until `vault.vacate()`.
* **Plainest.** A row in `notes/wontfix.md`.

### S9. A `lock()` whose erase is refused does not stick

* **Where.** TODO *Lock timing vs. work in flight*, first bullet; spec:302; wontfix 2026-10-31 (twice),
  whose reasoning ("the next session asks") covers expired and forgotten leases, and is false here.
* **Interleaving.** Not a crossing. `lock()`; `tryDelLease` refused. The next `ensureUnlocked`, this
  session or the next, gets the lease from `#fetchLease` and attaches it, asking nothing.
* **Consequence.** A user misled: a vault they locked reopens without a passphrase. The host has had the
  bad news. Cheap to accept, but the current rows do not accept this case.
* **Plainest.** A row saying exactly this.

### S10. The lock on `identity_revoked` is gone, with no ruling

* **Where.** old:refusal-policy.ts; old:vault.ts:1417-1432 (`#onStorageRefusal`); sec:2136-2140,2296;
  `models/` names `identity_revoked` nowhere; the spec is silent.
* **Interleaving.** The host's auth signs out, and the bank is not told. A Trigger's fetch refuses
  `identity_revoked`. The Vault stays unlocked, its lease in memory and cached. A sign-in as someone
  else follows.
* **Consequence.** The last user's session stays open until the host acts on `onBadNews`. Storage serves
  nothing, so the exposure is what is held in memory and the cached lease. A security reviewer will
  read sec:2296 and assume the opposite. Leaving it to the host fits the simplicity note, but it wants
  saying.
* **Plainest.** A row, and an amendment to that `security.md` entry.

### S11. Leftover box rows are read, and block their boxlabel

* **Where.** spec:507-510,526-528,557-559 ("ciphertext that nothing reads"); keys today:
  `safebyok-postgres/src/vault-tables.ts:74` (no `vault_tok` in the box primary key),
  `safebyok-indexeddb/src/idb-vault-db.ts:166-178` (scopepath), `safebyok-convex/src/component/schema.ts:21`;
  `models/listing.ts:233-240`.
* **Interleaving.** On a backend with no transaction, a cascade stops short, or a `putBox` crosses the
  tombstone, leaving a row under X. `bank.ensureVault` makes Y. `box.send` of that boxlabel, over no
  row, finds X's row: 'stale_write', whose carried record throws 'unexpected_error'. `boxListing.fetch`
  throws too.
* **Consequence.** That boxlabel is refused in the new vault until the row is removed by hand, because
  the rebirth shares the key space. The in-tree adapters all have a transaction, so this needs a host's
  own adapter. It is a wrong statement in the spec more than a likely event.
* **Plainest.** A store reads a row under another `vault_tok` as no row, or the wontfix row says what it
  costs.

---

## Accepted

Each can still happen. "Spec" means the spec already accepts it; "row owed" means it belongs in
`notes/wontfix.md` and has no row yet.

| # | Worry, and where it shows up | Why accepted |
|---|---|---|
| A1 | **A `lock()` crossing an unlock or a birth is undone by the attempt.** sec:372-383,1211-1252,2400-2413; `tip:vault.ts` `#lockSeq`; `tip:vault-listing.ts` `#closeSeqs`; tip `tests/models/vault-lock.test.ts:90,104`, `bank-close.test.ts:133` | Spec:46-58,241-243. Traced: nothing half done. A host that signs out must call `goodbye`, or the lease stays cached; with it, `attachLease` refuses. The security.md amendment is owed (spec:541), as these entries say the opposite. |
| A2 | **A `lock()` during `#fetchLease`'s read.** sec:541-546,1593-1603; `models/vault.ts:222-241` | Spec:258-259; row owed by spec. |
| A3 | **A gate change elsewhere leaves this device's session lease to run.** sec:1607-1615 ("defeating the epoch's revocation"), TODO *Cross-device invalidation*; `tip:lease.ts:166-172` (`gate_moved`); `tip:vault.ts:660-665` (`isMovedElsewhere`); tip `vault-voiding.test.ts:111`; `vault-races.test.ts:148,477` | Spec:23-27,405. The vaultKey does not change, so the old revocation never was cryptographic. |
| A4 | **A wayin revoked elsewhere still unlocks here until heard.** sec:385-388; tip's fetch-per-attempt test | Spec:75-78,548. Bound subject to S3. |
| A5 | **A vault deleted elsewhere stays unlocked here until heard.** TODO *Cross-device invalidation*; sec:850-863,968-975,1985-1996; `vault-races.test.ts:170,188,716-847` | Spec:504: it vacates on hearing. Until then storage refuses `vault_gone`, and no box survives to open. |
| A6 | **Tabs: another tab's `lock()`, sign-out or delete does not reach this one; an autolock's erase by scope can take a tab's fresher lease; a lease put after another tab's delete is left orphaned.** TODO *Lock timing* (sign-out bullet); sec:534-535,974,2085-2088,2404-2406 | Spec:261,560. Each fails to asking again. An orphan lease is unusable under a new `vault_tok`. |
| A7 | **Two banks on one deviceDB order nothing between them.** wontfix 2026-11-01 (tip); TODO singleton (tip); `tip:vault-listing.ts:53-57` | Ruled. The row needs bringing to main. |
| A8 | **No ordering among box calls; concurrent `box.send`: one wins or none.** wontfix 2026-10-22; sec:1636-1647,2368-2382 | The simplicity note, in so many words. With the memo gone each `send` mints its own tok: storage takes one. The row's "joins its refresh and its gating" needs rewording. |
| A9 | **A `lock()` past a box verb's guard does not stop it: `box.send` lands, `box.unsealWhisper` answers the clear.** sec:478-487,1128-1132; old:vault.ts:171,1680; `vault-races.test.ts:96,108,122,134`; `models/storable.ts:326` | Row owed. Predictable: guard, then `demandLease`, then it runs through, every time. The whisper goes to the caller that asked before the lock. |
| A10 | **A put lands though its answer is lost.** sec:1415,1438; spec gate-change row | Spec:562. The user is told a gate change failed when it did not; the watch corrects the vault. |
| A11 | **A failed delete still locks here.** wontfix 2026-11-02; sec:580-581 says the opposite | Ruled. Amend the security entry. |
| A12 | **`box.expose` crossing a forget, a newer revision or a lock keeps the whisper.** `tip:box.ts:58-61,162-187` (`#exposedSeq`, `#revisedSeq`); `models/box.ts:112-116` | "Unsafe by design" (the Coach, 2026-10-31, `notes/guarantees.md`, open item 2). Same process, same host. Row owed if the counters go. |
| A13 | **A restored backup wedges a device: it holds revision 10, storage has 8.** TODO *What rollback means*; sec:515-530,585-592,1706-1716 | Every fetch reads 'older' and is ignored, and every put is `stale_write`, forever. Spec:569 and the Coach's ruling that rollback earns no new state; sec:585-592 tells a restoring server to wipe. This is the simplicity note's "refuse until the client handles it". Row owed, since `vault.vacate()` is the way out. |
| A14 | **A refused erase of an expired or damaged lease, or at `forget()`, is not retried.** wontfix 2026-10-31 (twice) | Ruled. See S9 for the case they do not cover. |
| A15 | **A lease past its time reads unlocked until something touches it: no timer past the cap, a throttled tab, a sleeping laptop.** wontfix 2026-10-31; spec:297 | It refuses `vault_locked` at use, so it fails safe. Spec:297 makes "reads unlocked" mean "holds a lease", not "in force". |
| A16 | **One device, one setting.** wontfix 2026-10-16 | Still stands. Its "today" is stale: `Lease.get` checks `autolock_at` alone now, so a shorter setting no longer discards. |
| A17 | **A `lock()` before launch is not seen: the verb goes on to ask.** wontfix 2026-11-01 (tip) "a close before ensure"; TODO *Lock timing*, third bullet; sec:1533 | The spec's variable starts at launch, the same every time. Harmless: the user is asked. |
| A18 | **`maxBoxes` overshoot by writers racing.** sec:1746,2299-2302; `postgres-vault-db.ts:63`; `e2e/tests/postgres/races.test.ts:22,43,60` | Stated and tested as bounds. Untouched by this design. |
| A19 | **A store's check and write must be one atomic step.** sec:1485-1494,1636-1647; `postgres-vault-db.ts:56-71,146-152`; `convex component/vaults.ts:16`; `idb-vault-db.ts:12`; TODO lines 49,73 (Postgres) | Spec:566 requires it. This machinery is correct and stays. The battery needs spec:513-518's four-row delete added. |
| A20 | **DeviceDB calls must land in the order made, and a late discard must not undo a newer put.** sec:478-481,607-621; `old:device-db.ts`; `models/vault.ts:68,291-298` | Spec:246-248,567 requires it. Traced: it replaces the chores and mutexes provided `lease.tryCache()` reaches the store before its first await. Keep `describeDeviceDB`'s race test, and the conditional discard if the new store sweeps. |
| A21 | **A passkey made for a refused `add_passkey` is an orphan on the authenticator.** TODO *A passkey made for a refused `putWayin`*; `gating-modal.tsx:30` | Spec keeps `passkeyClear` unspent over a typo. An orphan remains on 'stale_write' or a passkey added elsewhere. Clutter, not a way in. Row owed. |
| A22 | **A hung `store.put` or deviceDB call holds the bank's one gating; `lock()` cannot settle it and every other launch refuses `already_asking`.** CLAUDE.md, no whizbangs; spec:28-32,282-283 | Reload cures it. Row owed. |
| A23 | **`Lease.get` erases a lease under another epoch, a newer one from a tab that heard first included.** sec:370 ("never erased: it may be another tab's"), sec:560; `tip:lease.ts:66`; tip `vault-voiding.test.ts:207`; `tip guarantees.md` | Reverses an audit finding, safely: that device asks at its next session. Spec:25-26 says "forgets". Row owed, and whether a *newer* lease should be left is a one-word change worth a look. |
| A24 | **Two `ensureUnlocked` with a cached lease: both read, both attach, the first's answered lease is evicted.** `models/vault.ts:71-72,185-189` (`#keptLookup`); `tip:vault.ts:119` | No join, spec:28-30. Nothing keeps the answer in normal use: a box takes `demandLease` each call. A caller that does keep it refuses `vault_locked`. Row owed. |
| A25 | **Losing a birth race: the user typed a passphrase for nothing, and ends locked on another's vault.** sec:721-723,600; `vault-races.test.ts:246-316,352-415` | Spec:13-14,337. |
| A26 | **React's stale-answer care: `latest()` for advice, `useWhenShown`, `useAnswerOnce`, `showingRef`, the ref handoff.** `modal.tsx:25-44,121-130,378-412`; `when-shown.ts`; `passkey-unlock-button.tsx:16-22,67-69,105`; `bank-provider.tsx`; sec:1297 | Ordinary UI care, no vault race, and correct. Keep through the rework. `bank-provider.tsx`'s doc block promises waiting and replacing that `already_asking` ends. |
| A27 | **A refused write is not retried or repaired.** sec:454-458,2368-2382; `vault-races.test.ts:928` | Spec:63-64,402-404. |

---

## Gone

Each was checked against the spec's drawing.

| # | Worry, and where it shows up | What removed it, and the check |
|---|---|---|
| G1 | **A staged edit overtaken while sealing or sending; a staged record dropped, carried or revived.** `models/storable.ts:56-59,299-313,326,363-364,411-417,437-438,517-523`; TODO *An edit is never saved to the device cache*; `helpers/throwers` `movedUnderEditError` | Spec:198-212. `#edit`'s record is a local, the put goes over ante's revision, and a refusal leaves nothing. The comment at `storable.ts:326` loses its reason. |
| G2 | **A gate change laid over a record that moved.** `models/vault.ts:33-42,338` (`GateStaging`, `gateMovedUnderChange`); sec:1623-1625; `vault-races.test.ts:565-583` | Spec:397-401. One gate through the attempt, put over that gate's revision. Traced against a watch delivery mid-attempt and against `vault.send({})` by a host: both refuse. |
| G3 | **An older read rolling back a newer record.** sec:864-869,515-516; old:vault.ts:1054,1072-1092; old:bank.ts:559; `vault-races.test.ts:538` | `cmpRevisions`, `models/storable.ts:17-24,494`, already on main. Only the null answer is left (S8). |
| G4 | **A refresh in flight re-locks the tab after its own unlock or gate change.** TODO *A wayin change racing this handle's own refresh*; sec:531-535; old:vault.ts:1073,1092 (`leavesInForce`, `#leasesHeld`); `tip:vault.ts:662-664` | Spec:23-27. `adopt` never locks on a move, and no refresh judges a lease. |
| G5 | **The gateless two-write first unlock; `gate_made_elsewhere`, `created_elsewhere`, stand-downs.** sec:594-601,721-723,850-858; old:vault.ts:1349; old:gating.ts:422,518; `vault-races.test.ts:226-415,525-526` | Spec:12,345-351. A birth is one put. Traced: a loser's passphrase is never tried against the winner's gate. |
| G6 | **A proof of an old gate or old life earning a lease; a box sealed into a vault made anew.** sec:454-461,472-476,2408-2413; `old:proving.ts:166,426-436`; old:vault.ts:1182-1189; `vault-races.test.ts:435-495,715-847` | One `vault_tok` per instance, `buildLease` refuses another stamp (spec:188), a proving carries its epoch (spec:41-43), and storage refuses a box of a dead `vault_tok` (spec:526). The demands at every step go. |
| G7 | **Second callers: joins and queues for hello, ensure, unlock, ask; another vault's gating replacing a dialog.** `tip:bank.ts:84,138-139,200-212` (`#helloing`, `#ensuring`); `tip:vault.ts:117-131,352-384,465-506` (`#askingMutex`, `#launches`, `#askInTurn`, `#joinUnlocking`, `#attemptThrough`); `tip:gating.ts:89,194-198` (`#turns`); `models/vault.ts:71-75`; sec:1545 | Spec:28-32,65. `already_asking` and `attempt_in_flight` refuse. `listing.hello` traced twice over: the check-and-hold in `#buildOrReceive` is synchronous and `#unwatch ??=` opens one watch. Two conditions: the check and the launch must share a turn, and a refused second attempt must spend its `passkeyClear` (G2). |
| G8 | **Lease write ordering and lock counters.** `models/vault.ts:68,291-298` (`#leaseChores`); `tip:vault-listing.ts:53-57,109-120` (`#leaseMutexes`); `tip:vault.ts:35,117,126,359-371,465-558` (`#lockSeq`, `BirthLockSeq`); sec:1211-1252 (`Ask`, the `AbortController`s), sec:1529-1537 (`revokesSoFar`), sec:2400-2430 (`lockSoon`, the shut counter) | Spec:46-58,216-253,567. Traced: `attachLease` is synchronous to the put, a listener's `lock()` follows it, and `#renewLease` reads `heldLease` after the crypto with no await before the attach. The `lock`, `attachLease` and gate-change rows of spec:300-311 hold for a lock crossing an unlock, a birth or a gate change. |
| G9 | **A cached lease taken up inside `hello` or `fetch`, crossing a lock or an unlock.** sec:366-371,1593-1603; `tip:vault-listing.ts:72-79`; `models/vault-listing.ts:63-66`; tip `bank-close.test.ts:147` | Spec:33-34. One door, `ensureUnlocked`. The residue is A2. |
| G10 | **The autolock of a lease declined or displaced locks the vault later.** `models/vault.ts:232-236,248` | Spec:233-235,225. Displaced, refused and crossed each evict. Traced each one: no lease is left armed. |
| G11 | **`del()`: success with nothing deleted; a retry deleting the rebirth; a stale tab's old passphrase deleting.** TODO *`del()`'s edge cases*; sec:575-581,1985-1996; `vault-races.test.ts:784-847` | Spec:492,513-518. Over a revision and a `vault_tok`, with a full vault always held. Traced all four rows. |
| G12 | **A box delete wiping a newer write (`deleted_other`).** sec:1405-1428 ("until the tombstone rework") | `listing.del` is conditional on the revision. |
| G13 | **A write missed while the watch starts; a cached copy overwriting a fresher instance.** sec:1645-1647; `models/listing.ts:68,87-88,217` | Already in order on main: the watch starts before `hydrateAll`, and a held instance beats a copy. |
| G14 | **The rollback watermark, and two tabs writing it down; false `vault_behind`.** sec:515-530,1706-1716; old:vault.ts:1054; old:bank.ts:556-560; `tip:models-shapes.ts:846-852` | No watermark in this design. What is left is A13. |
| G15 | **A deletion's special case in the gating: a lock landing as its write is sent.** old:gating.ts:178-180,224-226,235; old:vault.ts:716 | Spec:284,486. A `del_vault` gating ignores a lock, and locks first itself. |
| G16 | **A draft held after a birth loses its put.** `models/bank.ts:136`, GAP | Spec:347. Nothing is held before the put's answer. |

---

## Never real

| # | The panic | Why it did not matter |
|---|---|---|
| N1 | `#oneFetchAtATime`, and joined fetches, as a race guard. `models/storable.ts:64,272-283`; `old:one-at-a-time.ts` | `revision_seq` already discards an older answer, and the Trigger joins its own launches. It saves round trips and guards nothing. |
| N2 | Cache saves unawaited, landing out of order. `models/storable.ts:390-394` | The cache is a cache: `hello` hydrates over it, and a held instance beats it. |
| N3 | A lock in another tab in the same clock millisecond as a grant. sec:535 | Asks once more at most. |
| N4 | Which refusal to report when a lock and a device failure coincide. sec:377-383,403 (`gating_landed` before and after the write) | Labelling of a state already safe. The enter-key rule removes the question. |
| N5 | A damaged lease locking a newer lease's session. `old:lease.ts:275` | Needs a damaged lease displaced mid-unwrap, and fails safe by asking. |
| N6 | A Vault object gone within the microtasks of its birth, never handed out. old:bank.ts:505-509 | The caller's next call would refuse anyway. |
| N7 | A grant erasing the lease it wrote when outrun. sec:1238-1248,968-972 | Reversed by us on 2026-10-22: take-up checks made it unnecessary. |
| N8 | `damaged_lease` calling `lock()` recursing. TODO *Whether `damaged_lease` calls `lock()`* | `models/lease.ts:174` already calls it; `lock` calls nothing back in the lease but `evict`. |

---

## Where I think the spec is wrong or incomplete

S-numbered items are argued above.

1. spec:17-18, "no sparse vault exists": `takeWorld` makes one (S2).
2. spec:21,76, "at worst the window": one refused launch ends the Trigger (S3).
3. spec:402-404 draws a stale gate only for gate changes; the unlock case misleads the user (S4).
4. `decline` appears nowhere, once the in-turn queue goes (S5).
5. Goodbye's row cannot be checked at the Bank level, and a one-way goodbye plus spec:44 leaves `bank.hello` after it with Vaults that can never attach (S6).
6. spec:44 and :504 draw a Vault going only on a tombstone (S1), and removal of a Vault leaves the listing building one back (S7).
7. spec:528,558, "ciphertext that nothing reads": it blocks its boxlabel (S11).
8. spec:349-350, "with no listener yet to see it": `#hold` then `#remakeSnapshot` notifies `bank.subscribe`, so a bank listener sees the new Vault locked, and an `ensureUnlocked` it calls refuses `already_asking`. Flicker and noise, but the sentence is false.
9. spec:337,307, "another won": if what is stored is a tombstone, because another device made and deleted during the dialog, `new Vault(what is stored)` holds a Vault with no gate. The tip throws the 'stale_write' there (`tip:listing.ts:181-197`).
10. spec:305, "on `stale_write`, the stored record taken in": `models/vault-listing.ts:110-114` delivers only a full record, so a put refused over a tombstone leaves the Vault reading alive until the next fetch. Spec:403 relies on this.
11. spec:307, `ensureVault`'s throw column says "Nothing stored", without the gate-change row's "unless the answer was lost".
12. spec:185-187, `vaultFriend` lists no `lock`, though the autolock and a damaged lease must call `vault.lock()` (spec:278).
13. Undrawn with the staged draft gone: `Storable.del`, which stages a tombstone (`models/storable.ts:334-342`); a box's birth, a dna staged over a never-stored central (`models/listing.ts:113,252`); and the cache copy's `staged` (`models/storable.ts:392`). I judged G1 on `send` alone.

**Tried and found to hold.** A `lock()` before, during and after `#renewLease`; a listener's `lock()` in `attachLease`'s settle; `goodbye` or the autolock crossing a gate change; `vacate` crossing an unlock attempt; a delete's own tombstone arriving through the watch, as far as the `vacate` no-op (S7 starts after it); a repeated `vaultDB.del`; two `box.send` from one ante; a watch delivery ahead of a put's answer once the instance is held.

## What I did not get to

* `notes/security.md` was searched for race terms and the matching entries read; I did not read its 3717 lines through. `old:vault.ts` likewise. `notes/guarantees.md`: G1 to G4, the access points on leases, and the open items only.
* Tests were read by name, not body, apart from `vault-races.test.ts` and the tip's lock, close and voiding suites, which are by name too.
* The adapters were searched, not read: `safebyok-graphql`, `safebyok-convex` and `safebyok-postgres` matter only through A19 and S11, and the new `del` contract is undrawn for all of them. `demos/` and `e2e/` beyond `e2e/tests/postgres/races.test.ts` were not read.
* PRs #426 to #441 only as they stand at #442's tip.
* The pester, a vault's box listing (`tip:vault.ts` `ensureBox`, `helloBoxes`) and the new deviceDB are not drawn in the spec, so crossings through them are not judged, beyond S6's hello.
* Non-race entries in `notes/wontfix.md` (Chrome `autocomplete`, `__proto__`) were passed over as no panic of this kind.
