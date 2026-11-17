# 2026-10-15: big_feats -- your rulings, the open questions explained, and the restack

You read the done note and answered most of its questions. This note records those answers and
explains the questions still open, each with a recommendation. It also covers the restack you
asked for: one linear stack, where merging the top PR merges everything below it. Follow-up
work lands in amendment PRs on top of that stack.

## Your rulings

- **Any way in proves any change: yes.** With a fingerprint you can change the passphrase, add or
  remove a passkey, or do several of those at once. A vault still keeps at least one passphrase.
- **What another device sees: your reading is right.** Any change to a vault's ways in moves its
  epoch. That includes adding or removing a passkey, not only a new passphrase. Each other
  device's remembered unlock lapses at its next refresh, and that device locks. Any way in that
  still exists unlocks it there: the fingerprint you didn't change, or the new passphrase. The old
  passphrase no longer works. The device that made the change stays unlocked. A platform passkey
  belongs to its own device, or its own passkey sync, while a security key goes wherever you take it.
- **hash-wasm has no published audit:** noted in `notes/security.md`.
- **Rename `passphrase_epoch` to `unlock_epoch`**, in the core and all five adapters.
- **Real authenticators:** you'll try Chrome, Safari and a security key once #76 merges.
- **A vault cap on Postgres:** each store sets its own limit, and the core offers no constant for
  it. I read that as follows; correct me if it's wrong:
  - Every VaultDB declares a `maxLockboxes`, beside its `maxRecordBytes`.
  - A store with no limit of its own declares a very large one: Infinity where the number stays
    in memory, `1_200_300_400_500_600` where it crosses a wire or is stored.
  - `openVault` refuses a `maxLockboxes` larger than its store's.
  - Postgres enforces its limit inside the insert itself and refuses with `vault_full`, as the
    Convex component does.
- **`TH.perUser` moves into `safebyok/testing`.** Helpers the core's own tests don't use are fine
  there, as long as they need no new dependency.
- **Package names:** `safebyok-postgres`, `safebyok-graphql`, `safebyok-indexeddb`,
  `safebyok-fastkey`, and CLAUDE.md and the guidance docs updated to match.
- **No backward compatibility:** every published version is deprecated. `safebyok/idb` loses its
  exports with no re-export, and the changeset says so.

## Still open, explained

**The passkey's HKDF `info` leaves out `vault_id` and the scope.** This is the chain today:
1. The authenticator's PRF output comes from the passkey and a random salt that belongs to this
   envelope alone.
2. HKDF turns that output into a wrapping key. Its `info` names the format, the purpose and the
   credential.
3. AES-GCM wraps the vaultKey under that key. Its additional data binds the app, the user, the
   vault label, `vault_id`, the purpose and the envelope's whole header.

So the wrap is already tied to its vault, and the random salt already makes every envelope's key
unique.
- *For adding them to `info`:* this is what RFC 5869 meant `info` for. It ties the key to its
  context as well as the ciphertext, so a later construction that forgot the additional data
  would still be safe. It costs nothing, and before 1.0 changing the stored format is free.
- *For leaving them out:* they would then be kept in step in two places, and nothing is broken
  today.
- **Recommendation: add them.** It's standard practice, it costs nothing, and after 1.0 it would
  no longer be free.

**The epoch is out of the envelope binding.** Each envelope wraps the vaultKey under a key that
only its own way in can make.
- *Why it's out:* if the epoch were bound into every envelope, changing one envelope would mean
  re-wrapping all the others under the new epoch. The device making the change can't do that: it
  doesn't hold the other passphrases or passkeys. Every change would need every way in at once.
- *What it costs:* a hostile backend could put an envelope you removed back into the current
  bundle. But that backend already keeps old bundles, and every one of them wraps the same
  vaultKey. A removed passphrase that leaked stays dangerous whatever the binding, and only
  rotating the vaultKey would end that.
- **Recommendation: leave it out,** and add a note in `notes/security.md` that removing an
  envelope doesn't revoke it against a backend that kept the old bundle. Rotating the vaultKey is
  the real revocation, and that's its own TODO.

**`listBoxRecords`, a second verb.** `VaultDB` is an abstract class. Each store is a subclass that
fills in protected `doX` methods (`doReadBundle`, `doListBoxes` and so on), and the base class's
public methods check what comes back. There are no star-imported modules. `listBoxes` returns
summaries: the shape a vault shows, already checked. A served store, Postgres behind GraphQL,
must send the browser stored records instead, which the browser's own VaultDB then checks in its
`doListBoxes`. `doListBoxes` is protected, so #73 added a public `listBoxRecords`. Efficiency
isn't the reason for two verbs: both read the same rows, with the ciphered columns left out.
- (a) As now: each served store writes `listBoxRecords`. Only Postgres does today.
- (b) The core's listing check accepts a summary, so a server just forwards `listBoxes`.
- (c) Move `listBoxRecords` into the base class. Every store has it, checked in one place, and no
  store writes it.
- **Recommendation: (c).** It's one implementation that every store has, at the cost of one more
  public method on `VaultDB`.

**Failures that are swallowed.** Each store can tell the vault "something changed": Postgres
through `LISTEN` on the server, GraphQL through a subscription in the browser, Convex through its
watch. That's how a change on your phone shows up on your laptop without a reload. Today, if that
channel fails to start or drops later, nobody is told. The vault keeps working and its own writes
still land, but other devices' changes stop arriving until a reload or the vault's next write.
The developer gets no sign of it. This isn't a security problem, but it makes failures hard to
see and debug.
- **Recommendation:** the vault gives each store's `subscribe` a way to report a failure, and
  sends it to the vault's logger (#65) as a warning that names the error kind and never a
  record's content.
- Optionally, a `live: false` in the snapshot as well, so an app can show "not syncing". That one
  is only worth it if you want it in the UI.

**Smaller ones:**
- *An un-aimed wrong passphrase takes about 4.8 s at 8 passphrases.* When the vault doesn't know
  which passphrase is meant, it tries each one's Argon2id in turn, about 0.6 s each. An unlock
  aimed at one (picked by label) costs one derivation. **Leave it.** A dialog aims whenever the
  user picks.
- *New public surface* (`parseKeyDeriverSpec`, the passkey types, `toB64`/`fromB64`, two error
  kinds, four React exports): each is a contract once released. **Keep them.** Each one serves a
  host that builds its own UI.
- *`graphql` as an optional peer of the server half:* the host's server already has `graphql`,
  and two copies break the schema. It's optional so the browser half never needs it. **Keep it.**
- *Two dev dependencies only days old* (`graphql-yoga` 5.24.5, `@graphql-tools/schema` 10.1.4):
  they're used only in tests. **Pin each to the newest release at least two weeks old.**
- *The `openVault` size budget went from 16.5 to 18.5 kB*, for the envelope list and passkeys. #68
  and #70 each add to it too, so the restack sets the final number.
- *A taken `unlocklabel` is refused as `bad_label`:* that's caller misuse, since the snapshot
  lists the labels already taken. **Leave it.**
- *`addPasskey` creates the passkey before it checks the proof,* so a wrong passphrase leaves a
  passkey on the authenticator that opens nothing. **Fix it in an amendment:** check the proof
  first, then make the passkey.
- *IndexedDB's BroadcastChannel keeps a Node or Bun process alive, and a listener that throws
  crashes it.* **Fix it in an amendment:** let the channel stop holding the process open where
  the platform allows, and catch errors from listeners.

## The restack

You want one line. Four of the PRs need nothing outside big_feats, so they go first:
main → [#71] → [#76] → [#73] → [#78]. The other two stand on gripe_fixes:
- [#74] needs [#68], for the key deriver spec.
- [#77] needs [#70], for checking every VaultDB write.

#68 and #70 are siblings, both cut from #66, so nothing yet holds both. gripe_fixes' orchestrator
will put its PRs in one line if you tell it to, and big_feats then goes on top of that line. It
warns that #68 and #70 together will likely go over `openVault`'s size budget.

[#68]: https://github.com/mrflip/safebyok/pull/68
[#70]: https://github.com/mrflip/safebyok/pull/70
[#71]: https://github.com/mrflip/safebyok/pull/71
[#73]: https://github.com/mrflip/safebyok/pull/73
[#74]: https://github.com/mrflip/safebyok/pull/74
[#76]: https://github.com/mrflip/safebyok/pull/76
[#77]: https://github.com/mrflip/safebyok/pull/77
[#78]: https://github.com/mrflip/safebyok/pull/78
