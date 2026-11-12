# bank_world: one gate per bank, the assessment and the rulings

Status: assessment and proposed plan, 2026-11-12. Nothing is built. Ten rulings are asked for
below (R1 to R10). **All ten are ruled, 2026-11-12**, and an eleventh added: R3, R5 and R11 in the
Coach's own words, recorded under each; R7 revised on the Coach's question; the rest "lgtm". The
design that follows from them is `design.md`, beside this file, and the threads are `threads.md`.
The ordering of startup, and whether a wayin change makes other devices prove again, are put off
by the Coach, the second to the end of the sprint.

## The change, as I read it

* A bank has one gate: one passphrase wayin, at most one passkey wayin, one lease, one lock. A
  host that wants a second passphrase for the same user makes a second bank under another label.
* The scope is `user_id / banklabel / vaultlabel / boxlabel`. `applabel` becomes `banklabel`, and
  `user_id` goes first. (Your message ends the scope with `applabel`; I have read that as
  `boxlabel`.)
* `world`, as a word in the models, is the bank. A listing and a thing are handed the bank, and ask
  it `isEnabled` and `isLocked`. No thing and no listing has an enabled flag of its own.
* The gate is a row of its own in storage, in a gate table, and the gate verbs are calls against
  that table. A vault row has no gate.
* The bank's options, its storage database and its deviceDB are fixed at `Bank.make`.

## Target shape

```text
scope     user_id / banklabel / vaultlabel / boxlabel
lives     bank_tok / vault_tok / box_tok            each row carries the life tok of the row above it

storage   bank row    user_id, banklabel                          bank_tok                     (R11; nothing encrypted)
          gate row    user_id, banklabel, gatelabel               bank_tok, gate_tok, wayins by wayinlabel
          vault row   user_id, banklabel, vaultlabel              bank_tok, vault_tok          (no gate, nothing encrypted)
          box row     user_id, banklabel, vaultlabel, boxlabel    vault_tok, box_tok, sidecar, box_key_wrapped, whisper_ciphered
device    device row  user_id, banklabel                          device_tok                   (R12)
          lease row   user_id, banklabel                          bank_tok, gate_tok, proved_at, lease_key, bank_key_lease_wrapped

keys      wayinKey wraps bankKey      (was vaultKey)   one per wayin
          leaseKey wraps bankKey                       this device only
          bankKey  wraps boxKey                        one per box
          boxKey   ciphers whisper

Bank      gate, lease, the one open gating, isEnabled, isLocked, lock, sweep, vacate, autolock
          ensureUnlocked, unlock, the gate prompts, hello, ensureVault
 Vault    a storable with no secrets: hello, getBox, putBox, delBox, del
  Box     a storable: as today, sealing through the bank's lease
```

Each row is checked against the row above it, and each answer carries the row above it: a gate or
vault verb checks the bank row's `bank_tok` the way a box verb checks the vault row's `vault_tok` today.
That is the one pattern, used twice, and it is what makes a vault and a box alike in storage.

## Assessment

### What gets simpler, by where it is today

* **`Vault` loses about half of itself** (`models/vault.ts`, 419 lines). The sections
  *Changing the gate*, *Unlocking*, *The lease*, *The gating's unlock* and *The lease's friend* move
  to the bank; `#lease`, `#gate`, `#vaultFriend` and `#bankFriend` go with them. What is left is
  *Box verbs*, the guards and `makeSnapshot`.
* **`VaultListing` loses about half too** (`models/vault-listing.ts`, 237 lines): *The gate verbs*,
  *A birth's forms*, *The one gating open* and its `sweep`/`vacate` overrides. What is left is the
  block *Defined by the vault listing*, which mirrors `BoxListing`'s line for line.
* **The worlds go.** `ListingWorld`, `VaultWorld`, `BoxWorld`, `BankFriend`, `LeaseFriend` as a
  closure bag built by the vault, and the three stubs on the bank that exist only so it can pass as
  a world (`get isLocked(): boolean { return false }`, `ensureTimely()` resolving at once,
  `receiveWorld()` doing nothing). 60 references to the friend types in 8 core files.
* **Per-thing lifecycle goes.** `Storable.#isEnabled`, `Listing.#isEnabled`, `sweep`, `vacate`,
  `#disable`, `sweepContents`, `vacateContents`, and the two `disabled` throwers
  (`instanceDisabled`, `bankDisabled`) become one check, `bank.demandEnabled()`. Sweep and vacate
  differ only in what becomes of the cached lease, and the lease is now the bank's, so a thing needs
  one duty only: drop what it has of secrets at a lock (a box's exposed whisper).
* **One life per instance goes** (R6). The Vault object was one life of its vault because it had
  the lease and the gate, both fixed to that life. Without them it can stand for its scope through
  its lives, as a Box does. That removes `isOneLifePerInstance`, the `remake` making in
  `#recordDeliveringOf` and `#doDeliverRecord`, and the vacate of the instance replaced.
* **The gate verbs stop being puts of the vault record in disguise.** `gateAskOf`, the `gateVerb`
  tag on a `VaultPutAsk` and `liveVaultOf` go. The per-verb checks (`GateActOfForVerb`) stay, on a
  gate row (R3).
* **`bank.autolock` and the vacate stop listing leases.** A bank has one lease row at its own
  scope: `peek` it, `forget` it.
* **`del_vault` stops being a gating** (R5), and `ensureVault` stops asking the user.
* **Several TODO.md entries are about a gate or lease per vault** and want judging again once this
  lands: *Flush and remake every instance of a vault made anew*, *A cached lease newer than the vault
  in hand refreshes the vault*, *An extended key structure for the deviceDB*, *A wayin change racing
  this handle's own refresh*, *Changing a vault's scope means a new vault*.

### What does not go away

* **A thing still has a row above it.** `world` did two jobs: the authority (lock, enabled, the
  host's functions) and the parent row (life tok, timeliness, receiving the row an answer carries).
  The first job is the bank's, entirely. The second stays, in a uniform form: a vault lies under
  the bank's gate row, a box under its vault's row. So a box listing is handed the bank and its
  vault, and `deliverAnswer` still delivers the row above before its own.
* **A lock still visits every box**, to drop exposed whispers. It starts at the bank now.
* **An instance of an ended life still has to refuse**: a Box the host kept after its vault was made
  anew. That becomes a comparison of life toks with the row above (`box.vault_tok` against
  `vault.vault_tok`), not a flag. Storage refuses it anyway (`vault_reborn`); the local check only
  refuses sooner.
* **Two thin listing classes, probably.** After the move each concrete listing is its thirteen small
  members and little else. I would keep them as two parallel classes and judge a merge into one
  configured `Listing` when both are in front of us: by the debug test, a `doTryPut` that names
  `tryPutBox` reads better than one that looks a verb up in a spec.

### What it costs

* **Size.** Core `src/` is 9,900 lines and its tests 18,300. The tests built around a gate per
  vault (`vault-gate`, `vault-unlock`, `vault-lease`, `vault-life`, `vault-listing`, `gating`,
  `bank`, `bank-ending`) are about 4,500 lines and are mostly rewritten. Four storage adapters
  (3,500 lines, 3,300 of tests), `safebyok-react` (2,100, 2,900 of tests), the demo and e2e follow.
* **The rename alone** touches about 480 references to `applabel` in 90 files, the SQL columns and
  primary keys, the Convex indexes, the GraphQL schema and every scopepath.
* **Every stored shape changes**: all three record formats, both device rows, both Postgres tables
  plus a third. Before 1.0.0 nothing binds backward: an old row reads as damaged or absent, and
  the changesets say so. A host with data must wipe it or move it by hand.
* **Eight of the eleven files `notes/guarantees.md` names change**: the two shapes files and the
  six models (`proving.ts`, `gating.ts`, `lease.ts`, `gate.ts`, `box.ts`, `vault.ts`). `bank.ts`
  joins the table as the keeper of the lease, and `vault.ts` may leave it. G1, G3, G4 and G9 are
  restated. `notes/security.md` gets an entry (through its subagent).

### Risks

* **The security posture changes in two ways a reviewer should see.** One unlock on a device
  unlocks every vault of the bank. And deleting a vault no longer removes a wrapped key from
  storage; only deleting the bank does. I think neither loses anything real (a copy of the database
  old enough to have the deleted vault's boxes has its gate too), but both belong in SECURITY.md
  rather than being found.
* **The storage contract is settled before a real database proves it.** The models prove it first
  (the `bank_gate` thread), and the server adapters are written to it after (R7, as revised).
* **Open work.** This checkout's branch, `20261111-pushto100`, is 18 commits ahead of main and
  rewrites the delivery half of `listing.ts`; PR #654 (the sidecar no longer sealed with its
  whisper) is open. The line is cut once both have merged. Thread 1 touches every file, so it lands when nothing else is open.

## Rulings asked for

Each has my recommendation first.

**R1. The key hierarchy (cryptography: yours to rule).** Recommended: the bank has the one random
master key, `bankKey`, and it wraps each boxKey directly. This is today's construction with the
vaultKey belonging to the bank. Same primitives, same wraps, the same two-stamp ctx for a box
(`[vaultStamp, boxStamp]`), a wayin (`[bankStamp]` and the header) and a lease
(`[bankStamp, leaseStamp]`). What changes is the fields inside the stamps: `applabel` becomes
`banklabel`, a `BankStamp` (`user_id`, `banklabel`, `bank_tok`, `registered_at`) stands where the
vault's stood for a wayin and a lease, and the vault's stamp gains `bank_tok`.
`tests/models/ctx-bytes.test.ts` is updated on purpose. The alternative is a vaultKey per vault,
wrapped under the bankKey: a third level of wrapping, a new stored form, two unwraps per seal, and
a vault record with a sparse and a full form again. It would buy a per-vault erase and a per-vault
rotation later. I would not do it now.

**R2. Names.** `banklabel`, `bank_tok`, `BankStamp`, `bankKey`, `bank_key_wayin_wrapped`,
`bank_key_lease_wrapped`; the gate row is a `GateRecord` (with `GateTombstone`, `GateRow`); the
gatingkinds are `build_bank`, `unlock_bank`, `replace_passphrase`, `add_passkey`, `revoke_passkey`
and `del_bank`; the refusal `vault_locked` becomes `bank_locked`. **`gate_epoch` becomes `gate_tok`**
(the Coach, 2026-11-12): the life token of a gate, beside `bank_tok` for the life of the bank and
the row's own revision, all three compared and never ordered. I had kept the counter; nothing in
the code orders it, so nothing is lost. Whether a gate verb mints a new `gate_tok`, and what a
lease cites, is `design.md`'s Q2.

**R3. The gate verbs. Ruled, 2026-11-12, against my recommendation.** I had proposed `getGate`,
`putGate` and `delGate` alone, with replace, add and revoke as what the device lays on the record.
The Coach: the gate verbs are at the bottom because they make extra checks inside the datastore;
the user's device and the database bastion are the two best-defended places, and the same
validations made at each end, always, is a security win. My proposal left the checks that only one
wayin moved, `camped` and `passed` at the device alone. So:

* `replacePassphrase`, `addPasskey` and `revokePasskey` stay named verbs of the storage interface,
  each checked where the row is stored, in the step that puts it. They are calls against the gate
  row, no longer puts of a vault record under a tag.
* The same checks run on the device before the call: **shared policy, not shared code.** At the
  datastore they are best inside the database itself, as a Postgres or Convex stored procedure, and
  may look quite unlike the device's. `design.md` states the policy once, as a table, and each end
  answers to it.
* In the models the gate verbs are issued against the gate, not the bank. The bank's field is
  `bank.maingate`. A second kind of gate (a revocable token, for the doppler-lite case) is
  imaginable later, the Coach's case being a shell script with a session token, which the main gate
  can delete: **no feature is built toward it.** The accommodations are all in the stored row, to
  spare migrations: a gate row has `gatelabel: lit('main')`; its wayins are stored as a bag by
  `wayinlabel`, `main` for the one passphrase wayin and `passkey0` for the one passkey wayin; and
  the gate row has three bags, `auth`, `sigs` and `meta`, each checked as empty and none bound into
  any ctx (the Coach's second word on them: no `crypt`, and nothing more on a wayin).
  `bank.maingate` renders as `Record<'main' | 'passkey0', wayin>`.
* `bank.maingate` arrives on `ensureBank`'s answer and is changed by calling the gate verbs. The
  Gate is a `Storable` from the start, and so is the Bank (R11). **Each has a stub listing class, because
  `Storable` wants one; they use what `Listing` gives, and nothing in the design extends either:
  no `bank.gates`, no `device.banks`.** (The Coach first put this as "ignore" them, then walked
  the stridency back.) The fallback if they give trouble is a subclass `Listable` of `Storable`,
  for `Vault` and `Box`.
* Building a bank and deleting one each need a gating (`build_bank`, `del_bank`).
* No verb is added that is not needed. There is no `getGate`: the storage verb `ensureBank` answers
  the bank's `maingate` with its vaults, and its ask requires `gates: ['main']`, exactly that.
  `bank.hello()` is `ensureBank` or die, then the vault watch. A vault's box watch starts at
  `vault.beginWatch()`.
* My reading of the split, to be corrected: the three wayin changes are the gate's
  (`bank.maingate.replacePassphrasePrompt()` and its two siblings); build, delete, unlock, lock and
  the lease are the bank's, the unlock proving against `maingate`.

**R4. Ruled: ok, 2026-11-12.** Every put and del under a bank needs it unlocked; a get or a list does not. One rule for
vault and box. `bank.ensureVault({ vaultlabel })` is `putVault` with `ifAbsent: 'add'` and
`ifPresent: 'get'`, asks nobody, and refuses `bank_locked` on a locked bank where it would have to
put. Building the gate is its own call, never a side effect of `ensureUnlocked`: today's rule that
pressing Unlock never creates anything is kept one level up.

**R5. Ruled, 2026-11-12: "right now if you're logged in you're logged in."** `del_vault` is no longer a gating. `vault.del()` is a del like a box's, under an unlocked
bank; storage deletes that life's boxes in the same step, as now. `del_bank` asks for the
passphrase, and storage deletes the bank's vault and box rows in the step that tombstones the gate.

**R6. A Vault object stands for its scope through its lives**, as a Box does. A record of a new
life is received into it, and its box listing starts over under the new `vault_tok`. VOCABULARY's
"one life of the vault in this tab" is rewritten.

**R7. The storage interface is renamed `BankDB` now, and built beside `VaultDB` in the core; the
server adapters move after the switch, in place.** Revised 2026-11-12, on the Coach's question
whether the adapters could wait. They can. I had the four adapters built before the model switch,
on the premise that e2e and the adapters' own tests pair an adapter with the models. They do not:
e2e and the Postgres, Convex and GraphQL tests call the storage verbs alone, and only the demo
pairs an adapter (`IdbVaultDB`, 181 lines) with a `Bank`. So while the core still exports `VaultDB`,
`AdapterVaultDB` and the old shapes, those three packages and e2e stay green untouched through the
switch. The core does have both contracts for the length of the line, which is what lets the
adapters wait; each new core file starts as a verbatim copy in a commit of its own, so the next
commit's diff shows what changed. Waiting buys three things: the models prove the contract before
three adapters are written to it, each adapter is edited in place with a diff a reviewer can read,
and the four additive threads are gone. It costs one thing: a flaw only a real database shows (the
bank delete's cascade in one Convex mutation, the gate, vault and box rows fetched in one SQL step)
is found after the models are built. `design.md` works both through per backend to cover that.
No release is cut between the switch and the last adapter.

**R8. The lock leaves the Vault's surface.** `vault.ensureUnlocked()`, `vault.unlock()`,
`vault.lock()`, `vault.isLocked` and the four prompts are the bank's alone. For the length of the
line they stay on `Vault` as one-line calls of the bank's, so that `safebyok-react` moves in its own
thread, which deletes them. If you would rather keep them as sugar, say so and that thread leaves
them.

**R9. An answer's `world` field is renamed `parent`.** It still has a job, the row above the one
acted on: the gate row on a vault answer, the vault row on a box answer. `world` as a model word is
gone, so the field wants a name that says what it carries. `above` is the other candidate.

**R11. The bank has a row in storage. Ruled, 2026-11-12, against my recommendation.** I had the
bank's life recorded on its maingate row, with no row of its own, to avoid a fourth table and a
second absent state (a bank row with no gate yet). The Coach: the bank has a life token and a
scope, and a number of things that want joining on it in one transaction and deleting with it.
That moves me, with two things the day's other rulings added. A second gate is now a named case,
and it and every vault would otherwise be checked against a sibling row, the main gate's, which is
where the bank's life would be. And the second absent state need not exist: `buildBank` puts the
bank row and its `main` gate row in one step and nothing but `delBank` removes either, so a bank
row with no main gate is damage, not a state. It also gives the bank a `registered_at` of its own
for its stamp, where the gate row's had to stand in, and gives a vault verb a smaller row to fetch
above its own. The costs stand: a fourth table, two rows fetched by a gate verb, and a second verb
(beside `delVault`) that changes more than one row in its step. The Bank is then a `Storable` of
that row.

**R10. What the end user is told they are unlocking.** VOCABULARY has "Vault unlocker" for the
passphrase and passkey together. A user who has never seen the word bank now unlocks one.
Recommended: user-facing text keeps saying vault ("Unlock your vaults", "Vault unlocker"), and
`bank` stays a word of the code and the host.

## The line

The threads, their order and what each depends on are in `threads.md`, which is what a sprint is
run from. It replaces the table that stood here.

**R12. The Device. Ruled, 2026-11-12.** The time before there is a bank is owned by a `Device`,
which the host makes and keeps to sign-out; its one nullable field is `bank`, and a Bank is made
only from a bank record and its main gate record. I suggested it as `World`; the Coach named it
`Device`, and had the Device ensure its own row in the deviceDB, with `device_id` becoming
`device_tok`. `design.md`, *The startup gap*.

## Noticed along the way

* **`ensureVault` returns an unlocked vault today and will not.** The host's sequence becomes
  `bank.hello()`, `bank.ensureUnlocked()`, `bank.ensureVault(...)`. The README's first example
  changes shape, which is worth seeing before the switch rather than after.
* **Two banks can each have a gating open.** One open gating per bank is still the rule, but a host
  with two banks may be asked twice at once. `safebyok-react`'s provider and its one modal assume one
  bank; the `react_bank` thread says what nesting two providers does.
* **`passkey_wayin` is one slot, and it is now one passkey for everything the user has.** A
  passkey that never leaves its device (a security key, a platform passkey that does not sync) then
  serves one device only. The `wayinlabel` of R3 covers this: a second passkey would be a wayin
  labelled `passkey1` in the same gate. Nothing is built for it.
* **`needUnlocked()` and `unlockFirst()`** both throw `vault_locked`, with different sentences.
  With one lock they become one thrower.
* **`tidyGone`** gains the vault rows of an ended bank life.
* **`BankOpts`**: `vaultDB` becomes `bankDB`; `vaultRefreshMinutes` and `boxRefreshMinutes` may want
  to be one horizon now that a vault row changes only at its birth and its delete.
