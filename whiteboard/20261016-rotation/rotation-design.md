# Vault-key rotation, and what per-device lockout will need

2026-10-16, sprint matters thread 13 (documents only). Written against main at `b60e516`: the
gripes line has landed (rows keyed by tuple ckeys, #92; damaged lockboxes, #93; host validators,
#95). Its thread breakdown (section 11) becomes threads 14 and 18 to 20 of sprint matters.

**Who reads this.** The builder of threads 14 and 18 to 20 should read all of it. The Coach can stop
after section 2, which holds the one decision this design takes that the matter row didn't
foresee. Thread 11's author (the `VaultDB` contract) needs section 5. Thread 10's author
(`identity_revoked`) needs the last two rows of the table in section 7.

The source is the Coach's revocation matter (`winboard/20261015-matters/matter-revocation.md`
in the sprint's worktree). The Coach: "Yes, do (a)" (rotate the vaultKey when a way in is
removed), and for later, "Do we have a way to invalidate other devices that is legit under
apple/google strict privacy matters -- to lock all entryways on a given device? ... it should be
a NOTYET, but let's make sure the data we need is in there".

No new cryptography. Rotation uses only what the vault already uses: `makeVaultKey`,
`wrapKeyUnder` and `unwrapKeyUnder` (AES-256-GCM key wrap, with a `cipherBinding` as additional
data), the envelope seals in `envelope.ts`, and the lockbox seal in `store()`.

## 1. What rotation promises

Rotation replaces the vaultKey. A removed way in still opens every copy of the bundle anyone kept
from before the removal, and so still yields the old vaultKey. But that key reads only lockboxes
as they were before the rotation, never one written after it.

* **It does:** once the new bundle lands (the *commit*, section 4), an honest server never again
  accepts a lockbox sealed under the old key. Every lockbox written from then on, and every
  lockbox the rotation re-encrypts, is sealed under a key the removed way in never saw.
* **It doesn't:** it doesn't unread what the old key already read. A whisper whose old record
  someone copied stays readable to them. If an API key's old ciphertext may have been copied, the
  user has to replace the key itself; no vault can fix that, and the docs must say so plainly.
* **Against a malicious server**, rotation alone is not enough. The server can keep serving the
  old bundle to a device that has never seen the new one, and that device will go on writing
  under the old key. The rollback check (section 8) protects every device that *has* seen the
  newer bundle. It cannot protect a device that never did. This is the limit of a client-only
  design without server signing, which the matter's recommendation already declined.

## 2. The catch: re-wrapping needs every way in that stays

The matter says "re-wrap the remaining envelopes". But a remaining envelope can't be re-wrapped
without its own key. Each envelope wraps the vaultKey under the key its method makes. For a
passphrase, that is Argon2id over the passphrase. For a passkey, it is HKDF over what the
authenticator answers when touched. The vault keeps neither of those, by design. That is exactly
why `changePassphrase` and `removeUnlock` never re-wrap the other envelopes
(`notes/security.md`, 2026-10-15).

The symmetric shortcuts all fail. Wrapping the new key under the old one hands it to the removed
way in. Escrowing each envelope's key under the vaultKey hands those to the removed way in as
well, through any old bundle.

**Decision (recommended, and what this design builds): rotation keeps the ways in that are proven
during it, and removes every other.** The user proves each way in they want to keep: they type
each passphrase, and they touch each passkey their device can reach. Every envelope not proven is
removed in the same commit. A vault always keeps a passphrase, so at least one passphrase proof is
required (`last_unlock` otherwise). A passkey on a device that can't be reached is added again
from that device later, with a passphrase as its proof, as any passkey is added today. A host
lists what will go before it asks.

This is honest, and it is also the very effect revocation wants. Proving a lost phone's passkey
from another device isn't possible, so that passkey is dropped without the user having to name it
(unless it is a synced passkey the other device can also reach; see section 10).

**The alternative, for the Coach (open question 1):** give each way in a key pair of its own, its
private half wrapped under that way in's key and its public half stored in the envelope. Rotation
then wraps the new vaultKey to every remaining envelope's public key, and nothing has to be
re-proven. That is the standard answer: HPKE (RFC 9180), or ECDH plus HKDF plus AES-GCM, with
P-256 or X25519 through WebCrypto. It is also the clean basis for per-device lockout (section 10).
But it is a construction this vault doesn't use today, and it brings public-key keys into a design
VOCABULARY.md calls "everything is symmetric". So it needs the Coach's yes, and it is not built
here. It can be added later as a new envelope field without undoing anything this design builds.

## 3. Stored shapes

These are pre-1.0 changes, so they come with no compatibility: a vault written before them reads
as corrupt (CLAUDE.md, *What the package promises*), and the changeset says so. Every new field in
an envelope's or a lockbox's header is bound by #97's whole-header binding as soon as it exists.
That needs no change to the binding code, provided #97 has landed first (this design stands on it in the stack).

| Record | New field | What it is |
| --- | --- | --- |
| `VaultBundle` | `vault_key_epoch` (int, from 1) | Which vaultKey the bundle's envelopes wrap. Goes up by one with each rotation. A rotation also bumps `unlock_epoch`, as every change to the envelopes does. |
| `VaultBundle` | `prior_vault_key` (optional) | `{ vault_key_epoch, vault_key_wrapped }`: the vaultKey before this one, wrapped under this one. It is absent until the first rotation, and replaced by the next one. |
| `PassphraseEnvelope`, `PasskeyEnvelope` | `vault_key_epoch` | The epoch of the vaultKey this envelope wraps. It is in the header, so it is bound, so an envelope spliced in from an older bundle refuses to open as current (section 8). |
| `PassphraseEnvelope`, `PasskeyEnvelope` | `device_id` | The device mark's id on the device that added this way in (section 10). It is kept when the envelope is re-sealed. |
| `PassphraseEnvelope`, `PasskeyEnvelope` | `registered_at` (recommended; open question 4) | When this way in was added, as an `EpochMillis`, so a host can say "added 3 October". |
| `Lockbox` | `vault_key_epoch` | Which vaultKey wraps this lockbox's lockboxKey. It is listed while the vault is locked, so the walk's progress shows without opening anything. |
| *new*, device-local: `DeviceMark` | `format` (`safebyok-mark-v1`), the scope, `device_id`, `vault_id`, `unlock_epoch`, `vault_key_epoch` | What a device keeps about a vault even while locked: its own id for that vault, and the newest bundle it has seen, by both epochs. It is not secret, and it survives `lock()`. `destroy()` erases it. |

The prior key's wrap is `wrapKeyUnder(newKey, oldKey, cipherBinding('safebyok-vault-v1',
applabel, user_id, vaultlabel, vault_id, registered_at, 'prior_vault_key_wrapped',
{ from: n - 1, to: n }))`. It has the same shape as every other wrap, with a purpose of its own. A
holder of the old key gains nothing from it: it opens only under the new key. Keeping it
indefinitely costs nothing, so finishing a rotation needs no second bundle write (section 4).

`LockboxExpectation` gains `vault_key_epoch` (section 5). `DeviceDB` gains `readMark`,
`writeMark` and `eraseMark`, beside its unlock verbs. That is a public interface, so a host's own
`DeviceDB` has to implement them too.

**Names for VOCABULARY.md** (thread 14 adds them): **vaultKeyEpoch** (standard term: key
generation), **prior vaultKey** (the previous vaultKey, wrapped under the current one),
**rotation** (replacing the vaultKey and re-encrypting every lockbox), **device mark**, and
**deviceId**. This is VOCABULARY's first new *key-related* term since passkeys, and the names are
open to the Coach (open question 5).

## 4. The protocol: one commit point, then a walk anyone can resume

A store has no transactions across records (thread 11's contract). The only atomic step is a
single record's conditional write. So rotation puts everything that must be atomic into **one
bundle write**, and after it everything is idempotent and safe to repeat.

1. **Prove.** Read the bundle afresh, as `reviseUnlocks` does. Open the envelope each proof is
   aimed at. The first proof gives the old vaultKey's extractable transient handle. If a proof
   opens no envelope, the rotation is refused and nothing is written. Then check that no lockbox
   is still behind (the listing shows each one's `vault_key_epoch`). If one is, finish that walk
   first (step 4, under the current key), and only then rotate. That way a bundle never needs more
   than one prior key.
2. **Seal.** Make the new vaultKey with `makeVaultKey()`. Re-seal one envelope per proof around it,
   keeping its `unlock_id`, `unlocklabel`, `device_id` and `registered_at`. A passphrase gets a
   fresh salt through `Envelope.sealPassphrase`, as `changePassphrase` does: two key derivations
   per passphrase kept. A passkey keeps its `prf_salt_b64`, and its proof's answer makes the same
   passkeyKey. Wrap the old key under the new one as `prior_vault_key`.
3. **Commit.** `updateBundle` with the expectation `{ vault_id, unlock_epoch }`. The new bundle has
   `unlock_epoch + 1`, `vault_key_epoch + 1`, the re-sealed envelopes (and only those), and the
   prior key. If it lands, the rotation is in force. If it fails (`stale_write`, storage down, a
   revoked identity), nothing was written and the rotation never happened. Take up the unlock
   under the new key, as `reviseUnlocks` does, and remember it on this device.
4. **Walk.** For each listed lockbox whose `vault_key_epoch` is behind the bundle's:
   * read it;
   * unwrap its lockboxKey under the prior key, which comes from unwrapping `prior_vault_key`
     under the session's new key (a non-extractable handle will do);
   * decipher its whisper;
   * seal it anew, as `store()` does: a fresh lockboxKey wrapped under the new key, a new
     `revision_id`, the new `vault_key_epoch`, and `registered_at` and `changed_at` carried
     forward, since the whisper didn't change;
   * write it with `updateBox`, expecting `{ vault_id, revision_id: as read, vault_key_epoch:
     new }`.

   A `stale_write` means someone else wrote or erased the box meanwhile. Read it again: if it is
   now current, or gone, skip it. A damaged box (listed as damaged, or one that won't open under
   its key) is skipped and stays damaged, since nothing in it can be carried forward. #93's
   `erase()` and `store()` deal with it as before.
5. **Resume.** The walk is the vault's own work, not the rotating device's. Any device that
   unlocks, or refreshes while unlocked, and finds a lockbox behind walks it in the background.
   Failures go to the logger, and the walk tries again at the next refresh. A walk that stops
   partway (a lock, a crash, the tab closing, storage failing) leaves the vault consistent: every
   box is readable, under the new key or the prior one.

`rotateVaultKey()` resolves once the commit has landed and its own walk has reached every box. If
the walk is cut short, it rejects with what cut it short, and the error says that the new key is
already in place and the re-encryption will finish at the next unlock.

**Why this order is atomic enough.** Before the commit, nothing is written. After it, every state
is valid. A lockbox is never sealed under a key the bundle doesn't stand for, because the commit
lands before any box is written and the expectation (section 5) refuses any other.

## 5. What rotation needs from the `VaultDB` contract (for thread 11)

Three things, one of them new. Thread 11's PR is not up as this is written: this section names
the contract lines rotation relies on, so thread 11 can carry them or thread 14 can add them.

1. **The bundle's versioned update is atomic.** This is already in the contract
   (`updateBundle`). It is the commit.
2. **New: a lockbox write lands only under the standing vaultKey.** `LockboxExpectation` becomes
   `{ vault_id, revision_id, vault_key_epoch }`. The write lands only while the scope's standing
   bundle has that `vault_id` and that `vault_key_epoch`, and the standing lockbox has that
   `revision_id`, all in the same atomic step as the write, as `vault_id` is checked today. This
   is what stops a device still holding the old key, which hasn't looked at the bundle since,
   from sealing a new whisper the removed way in can read. `store()` doesn't read the bundle
   first (`notes/security.md`, 2026-10-15), so only the store can catch it. Every adapter gains
   one comparison:
   * `localVaultDB`: `lockboxMeetsExpectation`.
   * IndexedDB: inside its transaction.
   * Convex: inside the mutation.
   * Postgres: one more term in the `WHERE`.
   * GraphQL: in the host's resolver recipe.
   The battery gets a test for it: a write with a superseded `vault_key_epoch` is `stale_write`
   and writes nothing.
3. **The listing hands up every public field.** It already does (`ListedLockbox` keeps every
   field but the two ciphered ones), so a lockbox's `vault_key_epoch` lists without any adapter
   change.

Rotation needs no multi-record transaction, no batch write and no lock. Erases keep their
`vault_id`-only expectation: an erase by a device holding the old key reveals nothing.

## 6. Reading while a walk is under way

The vault picks the key by the lockbox's `vault_key_epoch`:
* the bundle's epoch: the session's vaultKey;
* the prior key's epoch: the prior key, unwrapped from the bundle once per unlock and held as a
  non-extractable handle beside the session key, and dropped with it on every lock;
* anything else: `corrupt_record`, as for any lockbox that won't open. The listing can mark it
  damaged without a key, since its epoch is neither the bundle's nor the prior's (open
  question 6).

`read()`, `use()` and `store()`'s "has the whisper changed" check all go through this one choice.

## 7. Cases

| Case | What happens |
| --- | --- |
| A second device is unlocked, under the old key, when the commit lands | Its next look at the bundle sees a new `unlock_epoch` and relocks it (`refresh`, as today). Its remembered unlock no longer matches the epoch, so it is erased, and the user is asked again. A `store()` from it before that look is refused by the expectation, and the catch-up relocks it. |
| A second device unlocks after the commit | With a way in that was kept: it gets the new key, and helps walk. With one that was removed: `absent_unlock`, or for a passphrase `wrong_passphrase`, as for any removed way in. |
| Two devices rotate at once | The commits race on the bundle's expectation. One lands; the other gets `stale_write` and nothing it wrote survives, so it can re-prove against the new bundle if the user still wants a rotation. |
| A rotation starts while another's walk is unfinished | Step 1 finishes that walk first, so the new bundle's prior key is the current one, and no lockbox is left behind under a key nobody can reach. Between that check and the commit, no box can be written under an older key: the expectation refuses it. |
| Two devices walk at once | Their writes to the same box race on `revision_id`. The loser reads again, finds the box current, and skips it. |
| `store()` or `erase()` during a walk | A store from a device holding the new key writes at the new epoch, and the walk then skips that box. An erase wins, as always, and the walk skips the box it can't find. |
| The vault is destroyed or made anew during a walk | The walk's writes fail their `vault_id` and the walk stops. The vault now standing is another vault. |
| `lock()`, `lockSoon()` or `close()` during a walk | Before each box, the walk checks that the key is still in hand (`keyInHand`), and stops when it isn't. The keys go with the lock. The next unlock, on any device, resumes. |
| A lock between the proof and the commit | As `reviseUnlocks` does today: the commit still lands, the vault stays locked, and the walk waits for the next unlock. |
| Storage fails, or the tab dies, partway through the walk | The vault is consistent (section 4), and the next refresh while unlocked resumes. |
| The identity is revoked before the commit (thread 10) | The commit is refused as `identity_revoked`. Nothing was written, and `rotateVaultKey` rejects with that error. Whether the vault also locks is `whenIdentityRevoked`'s call. |
| The identity is revoked during the walk (thread 10) | A box write is refused as `identity_revoked`, and the walk stops. Under thread 10's default (`whenIdentityRevoked: 'lock'`, [#106](https://github.com/mrflip/safebyok/pull/106)) the vault locks and drops both keys. Under `'stay'` it keeps them, and the walk tries again at the next refresh, which goes through once the user signs back in. The device mark is local data, and a revocation never erases it. The same user unlocking after signing back in resumes the walk. A different user is a different scope, so nothing crosses over. |

## 8. The rollback check

The matter asked: "Check whether a device refuses a bundle whose `unlock_epoch` went backwards."
**It doesn't.** `refresh()` relocks on *any* change of epoch and takes the new bundle up as it
stands. A remembered unlock that doesn't match lapses, and then the user's passphrase opens
whatever bundle is served. So a server that restores an older bundle gets that bundle used: it can
bring back a removed envelope, or, after a rotation, make a device write under the old key again.

Thread 14 adds the check. Each device keeps a **device mark** per vault: its `vault_id` and the
highest `unlock_epoch` and `vault_key_epoch` it has seen, updated whenever it reads a newer
bundle. A bundle with the same `vault_id` and a lower `unlock_epoch`, or a lower
`vault_key_epoch`, is refused, at open and at every refresh, with a new kind, `rolled_back`.
Nothing is unlocked and nothing is written. The message says calmly that this device has already
seen a newer copy of the vault than storage offers now, and how a host accepts an older copy
restored on purpose: it erases the device's mark (`deviceDB.eraseMark(scope)`) and opens again,
on its own knowledge that the restore was meant, never on the user's answer (the core README's
recipe).

Why the mark holds both epochs: `unlock_epoch` is bound into nothing, so storage can serve an
older bundle under a raised `unlock_epoch` and pass a check on it alone. After a rotation that
would bring the replaced vaultKey back. `vault_key_epoch` is bound into every envelope and held
equal to the bundle's, so storage cannot raise it on a pre-rotation bundle and still have a way in
open: the mark's `vault_key_epoch` catches it whatever the `unlock_epoch`. What still passes is an
older bundle at the *same* `vault_key_epoch` under a forged higher `unlock_epoch`. That can bring
back only a way in `removeUnlock` dropped -- which is not revocation anyway -- never a replaced
vaultKey. Within a bundle, each envelope's
`vault_key_epoch` must equal the bundle's. An envelope with another epoch is refused as damaged
(thread 9's vocabulary), so an old envelope spliced into a current bundle can't hand a device the
old key as if it were current.

What the mark can't do: it protects only a device that saw the newer bundle, and only while its
local storage lasts. Clearing site data resets it. A `vault_id` it has never seen (a vault made
anew) starts a new mark. Bundles can't be ordered across vaults, so a server serving an old,
destroyed vault in place of the current one is not caught. That is a security.md entry, not a
fix.

## 9. API sketch (thread 19 settles the details)

```ts
/**
 * Replace the vaultKey: every way in proven in `keep` is re-sealed around a new one, every other
 * way in is removed, and every lockbox is re-encrypted under it. ...
 */
rotateVaultKey: (keep: readonly UnlockProof[] | readonly { proof: UnlockProof, unlockId: string }[]) => Promise<void>
```

* **Refusals:**
  * `last_unlock` when no passphrase is kept;
  * `wrong_passphrase`, `wrong_passkey` or `absent_unlock` for a proof that opens nothing (none
    of them writes anything);
  * `stale_write` when the ways in changed meanwhile;
  * `vault_locked` when a lock wins before the commit.
* **Aiming.** A proof can be aimed at an `unlockId`, so the same passphrase used for two
  envelopes keeps both, and each passphrase costs one derivation to prove.
* **`removeUnlock` stays as it is**, the cheap removal that is not revocation. The docs say which
  is which. A host's "remove and lock out" button calls `rotateVaultKey` with the proofs of
  everything else.
* **The snapshot gains no field.** Each box's `vault_key_epoch` is already in `snapshot.boxes`,
  so a host can show "re-encrypting, 12 of 40" if it wants to (open question 6).
* **`safebyok-react`** gains nothing in this sprint beyond what a demo button needs. The dialog
  that asks for each way in to keep is UX work for later, like the NOTYET below.

## 10. NOTYET: locking every way in a device added

The goal: from device Y, the user says "lock out my lost phone X". Every way in X added is
removed, X's remembered unlock stops working, and X's copy of the key reads nothing new.

**What rotation already gives.** Rotating from Y with the proofs Y can make drops X's own passkey,
which Y can't touch, and voids X's remembered unlock, since it wraps the old key at an old epoch.
After the commit, an honest server refuses X's writes, and nothing X still holds opens what is
written next. So lockout is possible as soon as rotation exists. The missing piece is the UX: Y
has to know which ways in were X's.

**What must be in the data now (the Coach: "make sure the data we need is in there"):**
* **`device_id` on every envelope**: the device that added it. This lets a host group the ways in
  by device ("added on this device", "added on another device on 3 October"), and lets a future
  "lock out device X" act without the user knowing labels.
* **The device mark**, which holds the device's own `device_id` per vault, where the envelopes'
  ids come from.
* **`registered_at` on every envelope** (recommended), so a device's ways in can be told apart by
  date as well as label.
* **Not needed now:** a device list in the bundle, with labels, created dates and perhaps public
  keys. It is bundle-level and unbound, so it can be added later without touching an envelope, and
  until there is UX for it, it would only be data nobody shows.

**What is legitimate under Apple's and Google's rules.** The id is **a random UUID that safebyok
mints (`randomId()`, `crypto.randomUUID`) the first time a device opens a vault, one per vault
per device, kept only in the deviceDB.** It is never derived from anything about the device.

* **Allowed, and recommended by the platforms:**
  * Google's guidance for non-ads uses: "Use a Firebase installation ID (FID) or a privately
    stored GUID whenever possible", to "use the most restrictive identifier that satisfies your
    app's use case", and to keep it in app-private storage
    (<https://developer.android.com/identity/user-data-ids>).
  * Apple's equivalent is an app-scoped identifier. Ours is narrower than Apple's IDFV: one vault,
    not one vendor.
  * On the web there is nothing else to use.
  * The id resets when site or app data is cleared. The device then shows up as a new device, and
    its old envelopes keep an id nobody holds, which can still be locked out by that id.
* **Forbidden, and never used:**
  * Fingerprinting, meaning anything derived from the device to identify it. Apple: "you may not
    derive data from a device for the purpose of uniquely identifying it", naming browser
    properties and configuration, the device, location and network
    (<https://developer.apple.com/app-store/user-privacy-and-data-use/>).
  * Hardware identifiers (IMEI, serial number, MAC address), which Google says to avoid and
    Android restricts.
  * The advertising identifiers (IDFA, Android's advertising ID), which are for ads alone and
    must never be tied to a persistent identifier.
  * A device label drawn from the user agent, which is fingerprinting by another name. A label,
    if one is ever added, is the user's own words.
* **Scoped to one vault, on purpose.** A per-install id would let the backend link a user's
  vaults, and other users' vaults on a shared device, to one device. A per-vault id links nothing
  the vault doesn't already link. The server sees which envelopes were added by the same device of
  the same vault, and nothing more.
* **What a host declares.** Apple's App Privacy details have a "Device ID" category ("the
  device's advertising identifier, or other device-level ID"), and our id may fall under it. A
  cautious host declares it as Device ID, linked to the user, for App Functionality, not
  tracking. That is the host's call, and the README should
  say so. It is not tracking under Apple's definition, since it is never joined with third-party
  data. (Not legal advice: open question 7 asks the Coach to confirm the reading.)

**Later, beyond the NOTYET UX itself:**
* **A device list in the bundle**, with user-chosen labels.
* **Per-device public keys**, which open question 1 would bring. With them, rotation could wrap
  the new key for every device that stays, so a lockout wouldn't sign every other device out.
* **A `lockOutDevice(deviceId, keep)` sugar** over `rotateVaultKey`.

## 11. Thread breakdown (threads 14 and 18 to 20)

Each thread is cut after the one before it files. All of them come after the gripes line (landed)
and after #97 (whole-header binding; this PR is stacked on it). Thread 14 also comes after thread 11 (the
contract).

* **14. rotation_shape (opus).** The core changes in section 3, plus the expectation in section 5,
  for the core and `localVaultDB`:
  * `vault_key_epoch` and `prior_vault_key` on the bundle;
  * `vault_key_epoch`, `device_id` and `registered_at` on the envelopes;
  * `vault_key_epoch` on the lockbox;
  * `LockboxExpectation.vault_key_epoch`;
  * the device mark in `DeviceDB` (`memoryDeviceDB`, `idbDeviceDB`);
  * the rollback check and its error kind;
  * the battery test for a superseded key's write.

  No rotation verb yet: every vault stays at epoch 1, but every field and check is in place. It
  also updates the VOCABULARY.md names, the security.md entries (section 12) and a changeset
  (stored shape: old vaults read as corrupt). `vault:` / `storage:` / `crypto:`.
* **18. rotation_adapters (sonnet).** Stacked on 14. The one comparison in section 5.2 in each of
  IndexedDB, Convex (in its component's mutations and schema), Postgres (its `WHERE`, any
  migration text) and GraphQL (its resolver recipe and README), with the battery green for each.
  Thread 14 can mark the new battery test `.todo` for these four while it stands alone, or the two
  threads file as one stack. Watch for thread 12 (Postgres soft cap) and wave 2 (threads 5 to 7)
  touching the same adapters. `storage:`.
* **19. rotation_verb (opus).** `rotateVaultKey` (section 9), the walk and its resumption on
  unlock and refresh, and reads through the prior key (section 6). Every row of section 7 gets a
  test, using a fault-injecting `VaultDB` for crashes partway, two handles over one store for the
  races, and a stale handle whose write must be refused. There is also a test that a removed
  passphrase, given the old bundle, opens no lockbox written or re-encrypted after the commit.
  `vault:` / `crypto:`.
* **20. rotation_docs (sonnet).** The core README gets *Rotating the vaultKey*: what it promises,
  what it doesn't (copied ciphertext; replace the API key itself), and that every other device
  asks again. Also: the adapter author's note on `vault_key_epoch`, a demo button ("remove and
  lock out") over the passphrase dialog, and the React README. `docs:` / `demo:`.

## 12. Entries `notes/security.md` will owe (written by the threads that build them)

* **Rotation:**
  * what it guarantees against an honest server, and not against a malicious one;
  * that copied ciphertext stays readable to its copier;
  * the prior key wrapped under the new one, and why that gives a holder of the old key nothing;
  * that the ways in not proven are removed.
* **The `vault_key_epoch` expectation**, checked by each adapter, and what an adapter that skips
  it allows.
* **The rollback check:** its reach (only devices that saw the newer bundle, only while their
  storage lasts) and its blind spot (across `vault_id`s).
* **`device_id`:** random, per vault, never derived from the device, visible to the server, and
  linking only the envelopes one device added to one vault.
* **The walk's window:** between the commit and the last box, lockboxes not yet walked are still
  sealed under the old key. They are no more readable than before, but the window lasts until
  some device unlocks.

## 13. Open questions

1. **(For the Coach, significant for thread 19.)** Should rotation keep only the ways in proven
   during it (recommended, and designed here), or should every way in carry a key pair, so that
   rotation re-wraps for all of them unasked (HPKE, a new construction, section 2)?
2. Should `removeUnlock` gain a `{ rotate: true }` option, or stay the cheap, non-revoking removal
   beside `rotateVaultKey`? Recommended: keep the two verbs apart, because rotating also removes
   every way in that wasn't proven, which a flag on "remove one" would hide.
3. New error kind for a rolled-back bundle: `rolled_back` is proposed. This is public surface.
4. Should `registered_at` go on each envelope now (recommended: cheap, bound, and the lockout UX
   wants it)?
5. Names: `vault_key_epoch`, `prior_vault_key`, the device mark (`DeviceMark`, `safebyok-mark-v1`)
   and `device_id`.
6. Should the listing mark as damaged a lockbox whose `vault_key_epoch` is neither the bundle's
   nor the prior's? And should the snapshot carry a count of the boxes still to be re-encrypted,
   or leave it to the host to compute from `boxes`?
7. Confirm the reading of the platform rules in section 10: is a random, per-vault id stored in
   the bundle acceptable to the Coach's privacy bar, and declared as "Device ID, App
   Functionality"?
