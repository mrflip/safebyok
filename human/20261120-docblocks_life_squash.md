# 2026-11-20: Doc blocks of the gating and life PRs (#791, #792), and VOCABULARY's entries on what they changed

The target was the doc blocks that `git diff origin/20261120-logical_core...HEAD` changes in thirteen files under
`packages/safebyok/src` and `packages/safebyok-react/src/giver`, plus VOCABULARY.md. The Coach widened VOCABULARY mid-run to
every entry naming something this line changed. Only doc blocks changed in code. One `//` comment, above gating.ts's
`Checks`, took the reason that left its doc block. Commits sit on `20261120-life_squash` (PR #792). No PR was opened.

## Member by member

**models/gating.ts.** `birthBank`: "write it, and unlock it" became "Store a new bank ... and resolve it unlocked". `addPasskey`,
`revokePasskey`: the second fact now sits on its own line. `provingOf`: "the way in of `gate` that `proof` is for" became
"built against `gate`'s passphrase wayin or its passkey wayin, whichever `proof` is for". `nextGateAsk`: shorter.
`Checks`: "the one argument a bank's birth has no bank to vouch for" moved to the `//` comment above, in plain words. I left
the invariants block, the other `//` comments and `oneProofOf` alone.

**helpers/cloak.ts.** The module line: "walks an object" became "spreads an object". `cloak()`: "Adopt ... into" became "Wrap ... in",
and the second line now says the cloak keeps the only copy of the PRF bytes because those in the answer passed are zeroed (G2
only, and nothing else of the host's object). `Cloak`: "It has no enumerable field" became "A spread copies none of them". The
getters now say "a fresh copy". In `copiedAnswerOf` and `adoptedAnswerOf`, semicolons became sentences.

**models/bank.ts.** `birth`, `replacePassphrase`: they say what to do about `weak_passphrase` (show `Device.judgeStrength`'s
verdict). `unlock`: it names `wrong_passphrase` and `wrong_passkey`. `addPasskey`: "revoke that one first". Every form verb:
"under a lease citing the gate written" became "leave the bank unlocked". `ensureUnlocked`, `dismissUnlock`: plainer, and
dismissUnlock uses VOCABULARY's "awaited unlock". `#birthByProving`: a phrase, with its refusal left to `birth`. `#attachLease`:
two lines. `sweep`: what it ends, and that its device's snapshot goes back to `PendingBank` if it showed this bank. `#end`:
shorter. `hostVault`: no longer names its caller. `mintStamps`: two lines.

**models/device.ts.** The class: "leaves the device to make another" became "the device stays usable for the next".
`#thisIsTemporaryBank`: two lines, and the stray `*/` line was fixed. `cheatHoldBank`: "Making a bank sweeps no other" became
"The bank held before stays as it was". `sweep`: two lines.

**models/vault.ts.** `make`: tighter. `sweep`: no longer names its caller.

**shapes/shapes-bankish.ts.** `BirthOpts`, `unlockWanted`: tighter. `DeviceSnapshot.bank`: "before one is made" became "while it
holds none". That block is older than this line, but the line made it untrue: a swept bank's device shows `PendingBank` again.

**shapes/shapes-gateish.ts.** `BirthGatingFriend`, `BankGatingFriend` only. I wrote rewrites of the cleartexts section
(`CleartextChecks` through `ProvedCleartexts`) and then reverted them, because the coordinator is changing the code around
`oneProofOf` there. Proposed, for after:
- `CleartextChecks`: "The checks of the cleartexts each form verb takes ({@link Bank.birth}, {@link Bank.unlock} and the
  rest), and of what {@link cloak} takes. / Only a form verb's gating judges a cleartext's value." (The second line of the
  current block repeats the `//` above `cloakArgs`.)
- Each `…Cleartexts` type: "The cleartexts {@link Bank.unlock} takes: ..." in place of "What {@link Bank.unlock} is handed: ..."
  (gallant-docblocks *Slop tropes*: a headline that opens on "What").
- `ProvedCleartexts`: "A checked proof for one of a gate's wayins: the passphrase or the passkey's answer, never both."

**safebyok-react giver.** `FormMutationDefaults`, `StrengthVerdictResult`, `BankGiver`, `Unjudged`, `birthMutationOptions`,
`addPasskeyMutationOptions`: plainer or split. `dismissUnlock`, in react-giver.ts and shapes-giver.ts: "Close the unlock form"
became "Dismiss the awaited unlock", because the call closes no form. `giverBankOfVault`: its `birth` makes another Bank
object on the same device (see the open questions).

core.ts, phrases.ts and throwers.ts: nothing to change. core.ts's diff is `//` and exports only.

## Dropped facts

- Bank's form verbs: "under a lease citing its main gate / the gate written". In the new core, which caches no lease, it
  promises nothing to a caller yet. Once leases are cached, the guarantee to restore is that a gate change makes every
  other device prove again.
- `birth`, `replacePassphrase`: "before any key is derived", on `weak_passphrase`.
- `#birthByProving`: "Refuses `gate_made_elsewhere` if another bank is already stored at its scope" (`birth` says it).
- `Bank.sweep`: "On an ended device, its `endCause` is the device's". No device ends yet (device.ts: "Nothing ends a device yet").
- `hostVault`, `Vault.sweep`: who calls them.
- VOCABULARY, safebyok-big's side, shortened to one sentence per entry. Dropped: in *vault*, big's `beginWatch`, `putBox` and
  `vault_gone` refusals, and the Vault object staying enabled over a tombstone. In *bank*, "A Bank object stands for one
  life of its bank ... Once the bank is deleted, or built again on another device, the Bank object is disabled", and
  `bank.ensureVault`. In *device*, "`Device.make(opts)` checks its options and does nothing else", and what
  `device.ensureBank()` loads. In *gate*, "as a Vault does for its row", "its prompts", and "A gating's chain". In *conclude*,
  only the new-core sentence was added.

## Proposed renames

- `BankSnapshot.unlockWanted` → `isUnlockWanted` (STYLE.md *Naming*: a boolean is `isFoo`, in a snapshot too).
- `#thisIsTemporaryBank` → `#heldBank`, unless the oddity is meant as a flag (it reads as a stand-in on purpose).

## Open questions

1. **giverBankOfVault's `birth`** calls `Bank.birth(bank.device, ...)`, which makes a new Bank object. The giver's bank
   keeps the old one, the vault's, so after a birth its `unlock` and the gate changes act on a Bank object that was never
   stored. `GiverBank.birth`'s block says "Birth this bank, unborn until now". It describes the interface, but this
   implementation does not honour it. The doc now says what the code does.
2. **cloak.ts `//` above `Cloak`** says the copy-out getter "leaves the cloak's own for a retry". The form mutations never
   retry (`retry: false`), and the cloak is vacated once the mutation settles, so nothing reuses it. It is a running
   comment, so I left it.
3. **gating.ts `//` above `nextGateAsk`** documents a crossing as a promise: "a gate change landed meanwhile is refused as
   stale, and the proof unlocks nothing". It is a gate change crossing a gating, not one of the lifecycle crossings the
   ruling names, and it is a running comment, so I left it.
4. **`BankStage`** names `signed_out`, `unborn` and `failed`, which nothing in the new core sets. VOCABULARY's *stage* now
   says so. The type's list still describes them as reachable.
5. VOCABULARY *gate* says "Each builds the next gate's wayins ... and writes that revision". `revokePasskey` on a gate with
   no passkey writes nothing, as the gating invariants allow.

## Doc-block lines, before and after (lines inside `/** */`)

| File | Before | After |
| --- | --- | --- |
| safebyok/src/models/gating.ts | 16 | 20 |
| safebyok/src/helpers/cloak.ts | 24 | 24 |
| safebyok/src/models/bank.ts | 105 | 111 |
| safebyok/src/models/device.ts | 51 | 54 |
| safebyok/src/models/vault.ts | 37 | 37 |
| safebyok/src/shapes/shapes-bankish.ts | 52 | 52 |
| safebyok/src/shapes/shapes-gateish.ts | 59 | 59 |
| safebyok-react/src/giver/react-giver.ts | 86 | 91 |
| safebyok-react/src/giver/shapes-giver.ts | 23 | 23 |
| safebyok-react/src/giver/minder-bank.ts | 7 | 7 |

The counts rose where a one-line block packed two facts and now gives the second its own line. The blocks themselves
are shorter in words.

## VOCABULARY, before and after (diff, `<` before, `>` after)

```diff
13,20c13,20
< | **vault**      | One user's set of boxes, named by the signed-in user's `user_id`, your app's `banklabel` and its own `vaultlabel`. The **Vault object** (`Vault`) stands for the vault's scope in this tab, through each of its lives, for as long as the bank has it enlisted: a vault deleted and made again keeps its Vault object, whose `vault_tok` then names the new life. `bank.ensureVault({ vaultlabel })` returns the Vault object the bank lists for that scope. If no vault is stored, it puts one, asking nobody, even in a locked bank. `vault.beginWatch()` lists the vault's boxes and starts watching them. The only absent vault a Vault object can represent is a deleted one: it adopts the tombstone, keeps its slot in the bank's listing, and stays enabled: its calls go to storage and answer what storage has, until a newer life of that scope arrives, which it adopts. Its `beginWatch` and `putBox` refuse `vault_gone`, and so does a `get` that does not take an absent vault. A sweep or a vacate disables it for good, and it refuses every later call; so does the end of its bank's life, when the whole Bank object is let go. That is safebyok-big's Vault. In the new core (`packages/safebyok`), a `Vault` stands for one bank's boxes in this tab, with no vaultlabel yet: `Vault.make(bank)` makes it with the ThingMinder that caches them, and `vault.tryPutBoxOnce` and `vault.tryDelBoxOnce` write a box once each, sealed under the bank's lease, and answer an outcome; `putBoxOnce` and `delBoxOnce` throw the refusal instead. |
< | **bank**       | The signed-in user's vaults in the app, one Vault object per scope, and what they share (`Bank`). They share the key deriver, the strength checker, the bankDB and deviceDB, the limits, `requestCleartext` and `onBadNews`. There is one bank per signed-in user, and its scope is `{ user_id, banklabel }` (`BankScope`). Its device makes it at `device.ensureBank()`, which lists the vaults stored for the bank, and lets it go at a sweep or a vacate. A Bank object stands for one life of its bank, and holds its one gate (`bank.maingate`), its one lease and its one lock, which every vault in it shares. Once the bank is deleted, or built again on another device, the Bank object is disabled, and `device.ensureBank()` returns another. `bank.ensureVault({ vaultlabel })` returns the vault the bank lists for that scope, or builds one. |
< | **device**     | The signed-in user's presence on this browser for one bank scope (`Device`). It holds the host's options and functions, the one gating open, and the lifecycle and its end. `Device.make(opts)` checks its options and does nothing else. `device.ensureBank()` asks the deviceDB for this device's row, loads the libraries the vaults share, and brings up its bank. `device.sweep()` ends it while the page lives, and `device.vacate()` ends it at sign-out, forgetting this bank scope's cached leases and device row. A device that has ended is disabled for good. |
< | **passphrase** | The secret the user types to unlock their bank. It is not their login password. safebyok never writes it or sends it anywhere. A bank has exactly one, its passphrase wayin, for all its vaults. A `replace_passphrase` gating replaces it, and leaves the passkey wayin as it was. |
< | **passkey**    | The credential the user unlocks with instead of typing, using a fingerprint, a face, a phone or a security key. It is a WebAuthn credential, and its authenticator produces the secret bytes for the bank through the PRF extension. safebyok never has the passkey's own secret. The authenticator has it, and responds only after the user's fingerprint, face or PIN. A bank has at most one, its passkey wayin, which always exists alongside the passphrase wayin it was added under. An `add_passkey` gating adds it. `addPasskeyPrompt()` refuses while the bank's gate already has one. A `revoke_passkey` gating removes it. |
< | **wayin**      | One way into a bank: its passphrase or its passkey, as the bank's gate records it (`Wayin`). Each has a `wayinkind` (`passphrase` or `passkey`; `Wayinkind`). Each also has its `registered_at`, and the `device_tok` of the device that built it. A passkey's wayin also has the `credential_id` and `prf_salt_b64` needed to ask the passkey. A bank has exactly one passphrase wayin and at most one passkey wayin. They are kept in its gate row, under `main` and `passkey0`. A wayin's **header** (`WayinHeader`) is every field of it except its bankKeyWayinWrapped. Every change to the wayins requires the current passphrase. *Encrypted forms* describes how a wayin is stored. |
< | **cleartext**  | Any data, text or object, that is secret or contains a secret: a passphrase as typed, a passkey answer (`PasskeyAnswer`), an unsealed whisper (`BoxCleartexts`). A name holding one says so (`cleartext`, `passphraseCleartext`, `cleartexts`), never `clear`. The cleartext a gating asks for proves that a wayin is the user's: only a gating's attempt and, in the new core, a bank's form verbs accept it, and no vault call does. It can unlock as much as the wayin it belongs to, so the attempt turns it into a proving, discards it, and zeroes a passkey answer's bytes. In text the user sees, the passphrase and passkey together are called "Vault unlocker" (the Coach, 2026-10-24); the code keeps `cleartext`. |
< | **gating**     | One pass through the gate: a proof of cleartexts, perhaps with a change to the ways into a bank, ending with the bank unlocked. A form verb runs it, as a function of `models/gating.ts` (`Gatings`). It proves its cleartexts and makes its change through the bank's private verbs, or refuses and changes nothing, and it vacates its cleartexts whatever the outcome. In safebyok-big a `Gating` is another thing: a request for cleartext, with an attempt. |
---
> | **vault**      | In the new core (`packages/safebyok`), one bank's boxes in this tab (`Vault`), with no `vaultlabel` yet. `Vault.make(bank)` makes it with the ThingMinder that caches them. `vault.tryPutBoxOnce` and `vault.tryDelBoxOnce` write a box once each, sealed under the bank's lease, and resolve an outcome; `putBoxOnce` and `delBoxOnce` throw the refusal instead. `vault.withWhisper(labelpath, fn)` hands `fn` the box unsealed, first waiting for an unlock if the bank is locked. The bank's sweep sweeps each vault made on it, which stops its minder. In safebyok-big, a vault is one user's set of boxes under its own `vaultlabel`, and its **Vault object** stands for that scope through each of its lives while the bank keeps it listed: `bank.ensureVault({ vaultlabel })` returns it, putting the vault if none is stored, and a deleted vault keeps its Vault object, which takes the tombstone and then the next life. A sweep, a vacate or the end of its bank disables it for good. |
> | **bank**       | The signed-in user's secrets in your app under one scope, `{ userid, banklabel }` (`BankScope`), and what guards them (`Bank`). A Bank object stands for one life of the bank on this device: it holds its main gate (`bank.maingate`), its root box, which every box is kept under, and its lease while unlocked. Its boxes are sealed and unsealed under that lease, and stored through its vaultDB. The bank's form verbs birth it, unlock it and change its gate (`Bank.birth`, `bank.unlock` and the rest). `bank.lock()` drops its lease, and `bank.sweep()` ends the Bank object for good, with every vault made on it. In safebyok-big, a bank is the user's vaults, one Vault object per `vaultlabel`, sharing the key deriver, the strength checker, the bankDB and deviceDB, the limits, `requestCleartext` and `onBadNews`; its device brings it up at `device.ensureBank()`, and a sweep or a vacate lets it go. |
> | **device**     | The signed-in user's presence in this browser for one bank scope (`Device`). It holds the host's functions, guarded (the key deriver, the strength checker, the logger and `onBadNews`), the vaultDB, the autolock time and its `device_tok`. `Device.make(record, opts)` checks them, and fetches nothing. `device.judgeStrength(typed)` asks the strength checker about a new passphrase. The device keeps every Bank object made on it: `device.lock()` and `device.sweep()` reach each one, and its snapshot shows the last one made, or `PendingBank` while it holds none. A sweep leaves the device usable, and a bank may be made on it again. In safebyok-big, the device brings up its own bank at `device.ensureBank()`, holds the one open gating, and ends for good at `device.sweep()`, or at sign-out at `device.vacate()`, which also forgets the scope's cached leases and device row. |
> | **passphrase** | The secret the user types to unlock their bank. It is not their login password. safebyok never writes it or sends it anywhere. A bank has exactly one, its passphrase wayin. `bank.replacePassphrase` replaces it, proved by the current passphrase or the passkey, and leaves the passkey wayin as it was; the strength checker must judge the new one strong. In safebyok-big, a `replace_passphrase` gating replaces it. |
> | **passkey**    | The credential the user unlocks with instead of typing, using a fingerprint, a face, a phone or a security key. It is a WebAuthn credential, and its authenticator produces the secret bytes for the bank through the PRF extension. safebyok never has the passkey's own secret. The authenticator has it, and responds only after the user's fingerprint, face or PIN. A bank has at most one, its passkey wayin, which always exists alongside the passphrase wayin it was added under. `bank.addPasskey` adds it, proved by the passphrase, and refuses while the gate already has one. `bank.revokePasskey` removes it, proved by the passphrase or the passkey itself. In safebyok-big, the `add_passkey` and `revoke_passkey` gatings do these. |
> | **wayin**      | One way into a bank: its passphrase or its passkey, as the bank's gate records it (`Wayin`). Each has a `wayinkind` (`passphrase` or `passkey`; `Wayinkind`). Each also has its `registered_at`, and the `device_tok` of the device that built it. A passkey's wayin also has the `credential_id` and `prf_salt_b64` needed to ask the passkey. A bank has exactly one passphrase wayin and at most one passkey wayin. They are kept in its gate row, under `main` and `passkey0`. A wayin's **header** (`WayinHeader`) is every field of it except its bankKeyWayinWrapped. Adding a passkey requires the passphrase; replacing the passphrase or revoking the passkey takes either wayin's proof (in safebyok-big, every change requires the current passphrase). *Encrypted forms* describes how a wayin is stored. |
> | **cleartext**  | Any data, text or object, that is secret or contains a secret: a passphrase as typed, a passkey answer (`PasskeyAnswer`), an unsealed whisper (`BoxCleartexts`). A name holding one says so (`cleartext`, `passphraseCleartext`, `cleartexts`), never `clear`. The cleartexts that prove a wayin is the user's go only to a bank's form verbs, which hand them to their gating; no vault call takes them. A host using the giver hands them over in a **cloak**. A cleartext can unlock as much as the wayin it belongs to, so the gating turns it into a proving, keeps nothing of it, and zeroes a passkey answer's PRF bytes whatever the outcome. In safebyok-big, only a gating's attempt takes them. In text the user sees, the passphrase and passkey together are called "Vault unlocker" (the Coach, 2026-10-24); the code keeps `cleartext`. |
> | **gating**     | One pass through a bank's gate: the user's cleartexts are proved against its wayins (or, at a birth, become them), a wayin may be added, replaced or removed, and the bank ends up unlocked. Each form verb runs one, a function of `models/gating.ts` (imported as `Gatings`). A gating either proves its cleartexts and makes its change, through the bank's private verbs, or refuses and changes nothing. Whatever the outcome, it zeroes the PRF bytes of each passkey answer it was handed. In safebyok-big a `Gating` is another thing: a request for cleartext, with an attempt. |
22,24c22,24
< | **gate**       | A bank's wayins, as one revision of its gate row: its passphrase wayin (`main`) and its passkey wayin (`passkey0`) if it has one (`Gate`). A `Gate` stands for the bank's gate row through its revisions and lives, as a Vault does for its row; a host reaches it as `bank.maingate`, and changes it only through its prompts. A gating's chain builds the next gate's wayins from the current one, and one conditional gate verb of the bankDB puts it. A gate verb changes the row's revision and nothing else of its stamp: its `gate_tok` stays. The first gate is put with its bank by `buildBank` (`Gate.recordOfBirth`). Every live bank has its gate. |
< | **passkey answer** | The response a passkey gives when it is asked for its bank (`PasskeyAnswer`, kept as a `passkeyClear`): the credential's id, the salt it was asked with, and 32 secret bytes. The host gets one from `safebyok-react`'s `createPasskey` or `askPasskey`, and passes it to a gating's attempt. The attempt turns it into a passkey **proving** (`PasskeyProving`) and zeroes its bytes. |
< | **cloak**      | What a host wraps a form's cleartexts in before handing them to a giver's form mutation (`Cloak`, made by `cloak({ passphraseClear })`), in the new core only. It keeps each cleartext private and hands it out through its getter, a passkey answer as a fresh copy; it serializes, prints and spreads as nothing (`'[cloaked]'`), so React Query's mutation cache and devtools hold none of them. Adopting a passkey answer copies its bytes in and zeroes the host's. `cloak.vacate()` zeroes its bytes and drops its passphrases; the giver's mutation vacates it once it settles. |
---
> | **gate**       | A bank's wayins, as one revision of its gate: its passphrase wayin (`main`) and its passkey wayin (`passkey0`) if it has one (`Gate`). A host reads it as `bank.maingate`, and changes it only through the form verbs `bank.replacePassphrase`, `bank.addPasskey` and `bank.revokePasskey`. Each builds the next gate's wayins from the current one, and writes that revision over the one it proved against, in one conditional write; the bankKey does not change. The first gate is written with its bank by `Bank.birth`. Every live bank has its gate. In safebyok-big, the gate is a gate row, which a gate verb of the bankDB changes, keeping its `gate_tok`, and `buildBank` puts the first (`Gate.recordOfBirth`). |
> | **passkey answer** | The response a passkey gives when it is asked for its bank (`PasskeyAnswer`): the credential's id, the salt it was asked with, and 32 secret bytes. The host gets one from `safebyok-react`'s `createPasskey` or `askPasskey`, and hands it to a form verb as `passkeyClear`, or as `nextPasskeyClear` for a passkey being added, through the giver in a cloak. The verb's gating turns it into a passkey **proving** (`PasskeyProving`), and zeroes its PRF bytes whatever the outcome; a zeroed answer is refused, so ask the passkey again for the next call. In safebyok-big, a gating's attempt takes it. |
> | **cloak**      | In the new core only: what a host wraps a form's cleartexts in before handing them to a giver's form mutation (`Cloak`, made by `cloak({ passphraseClear })`). Each cleartext is private, read through its getter, and a passkey answer comes out as a fresh copy. JSON and printing show only `'[cloaked]'`, and a spread copies nothing, so React Query's mutation cache and devtools hold no cleartext. Wrapping a passkey answer copies its PRF bytes into the cloak and zeroes those in the answer the host passed. `cloak.vacate()` zeroes the cloak's copies and drops its passphrases; the giver's mutation vacates the cloak once it settles. |
166c166
< | **locked**                      | Said of a Bank object with no lease granted (`bank.isLocked`, and its snapshot's `isLocked`); **unlocked**, of one with a lease granted. Its vaults and their boxes are locked and unlocked with it. A bank not yet stored has no Bank object, and its first gating is `build_bank`. |
---
> | **locked**                      | Said of a Bank object with no lease granted (`bank.isLocked`, and its snapshot's `isLocked`); **unlocked**, of one with a lease granted. Its vaults and their boxes are locked and unlocked with it. A bank not yet stored has no Bank object until `Bank.birth` makes it, unlocked (in safebyok-big, a `build_bank` gating). |
168c168
< | **stage**                       | The device's point in its lifecycle, shown as its snapshot's `stage` (`DeviceStage`). It is `made` until a `device.ensureBank()` succeeds. It is `ready` once `ensureBank()` has loaded the libraries its vaults share and brought up its bank. It is `disabled` after a sweep or a vacate, and the snapshot's `err` says why: `disabled`, or the `identity_revoked` that vacated it. In the new core the stage is the bank's alone (`BankStage`, on `bank.getSnapshot()`): `signed_out`, `starting`, `unborn`, `locked`, `unlocked`, `swept` or `failed`; the device's snapshot carries its bank's. |
---
> | **stage**                       | Where the user stands with their bank, as the bank's snapshot shows it (`BankStage`, on `bank.getSnapshot()`); the device's snapshot carries its bank's. A Bank object is `locked` or `unlocked`, and `swept` once it ends. The device shows `starting` while it holds no bank (`PendingBank`). The type also names `signed_out`, `unborn` and `failed`, which nothing sets yet. In safebyok-big, the stage is the device's (`DeviceStage`): `made` until `device.ensureBank()` succeeds, `ready` after, and `disabled` after a sweep or a vacate, with the snapshot's `err` saying why. |
178,179c178,179
< | **conclude**                    | A gating concludes once: it reports its final outcome, success or refusal, and does not change afterwards (`whenConcluded`). |
< | **form verb**, **awaited unlock** | In the new core (`packages/safebyok`), the Bank's verbs that take cleartexts. A **form verb** is a form's submit: `Bank.birth`, `bank.unlock`, `bank.replacePassphrase`, `bank.addPasskey` and `bank.revokePasskey`, each beside its `try` twin, which resolves an `Outcome` where the plain verb throws. Each proves its cleartexts in its gating (`models/gating.ts`) and makes its change, or refuses and changes nothing; a gate change's proof also unlocks the bank. The **awaited unlock** is `bank.ensureUnlocked()`, for code that needs an unlock but cannot ask anyone: it sets the snapshot's `unlockWanted`, so the host renders its unlock form, and waits for any unlock to land. `bank.dismissUnlock()` rejects the wait `dismissed`. |
---
> | **conclude**                    | In safebyok-big, a gating concludes once: it reports its final outcome, success or refusal, and does not change afterwards (`whenConcluded`). The new core's gatings are plain async functions, and resolve or reject like any call. |
> | **form verb**, **awaited unlock** | In the new core (`packages/safebyok`). A **form verb** is a Bank verb that takes the cleartexts a form collected, and is that form's submit: `Bank.birth`, `bank.unlock`, `bank.replacePassphrase`, `bank.addPasskey` and `bank.revokePasskey`. Each has a `try` twin, which resolves an `Outcome` instead of throwing. Each runs a gating, which makes its change or refuses and changes nothing, and each leaves the bank unlocked when it succeeds. The **awaited unlock** is `bank.ensureUnlocked()`, for code that needs the bank unlocked but has no form of its own: it sets the snapshot's `unlockWanted`, so the host shows its unlock form, and resolves once any unlock lands. `bank.dismissUnlock()` rejects it with `dismissed`. |
317,320c317,322
< * **unlock, as a noun.** A way in is a wayin. A device caches a lease. `ensureUnlocked()`
<   is the verb, and `unlock_bank` the gating.
< * **proof; ask, for the request for cleartext.** The user hands in cleartext. Made into a key,
<   it is a proving. The request for it is a gating. An ask is what a bankDB verb is asked.
---
> * **unlock, as a noun for a way in or a cached lease.** A way in is a wayin. A device caches a
>   lease. As an act, an unlock is fine: `bank.unlock()` makes one, and `bank.ensureUnlocked()`
>   waits for one (the **awaited unlock**).
> * **proof or ask, for the request for cleartext.** The user hands in cleartext through the
>   host's form, and a proof is that cleartext (`ProvedCleartexts`), never the request. Made into a
>   key, it is a proving. An ask is what a storage verb is asked.
```
