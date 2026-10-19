# Thread 9: created_elsewhere (2026-10-18)

Branch `20261018-created_elsewhere`, PR [#167](https://github.com/mrflip/safebyok/pull/167), stacked on #166 (line main → #159 →
#160 → #161 → #162 → #163 → #164 → #165 → #166 → #167). Justify: green -- core 2161 passed | 35
skipped; react 224; indexeddb 135 | 10; convex 258 | 8; postgres 246 | 14; graphql 239 | 14;
fastkey 49; demo 191 | 16; e2e 81 | 89.

* **Built**: the refusal kind `created_elsewhere` (a condition) in `VaultErrorKindVals` and
  `VaultErrorFamilyForKind` (`errors.ts`, doc block added). In `settleUnlock`'s create branch,
  when `fetchOrCreateVaultProps` hands back a `vault_id` other than the one drafted and the
  passphrase does not open it (`wrong_passphrase`), `refuseCreatedElsewhere` catches the snapshot
  up with storage (`refresh()`, so the lockboxes come in) and throws `created_elsewhere`, the
  `wrong_passphrase` its cause. The vault settles `locked` on the standing props. A passphrase
  that opens the standing vault unlocks as before. README's conditions table has the row;
  `Vault.unlock`'s doc has a paragraph and a third example. React `PassphraseModal` renders it in
  the `quiet` class (advice) rather than `gripe`, in the same live region; the dialog stays open,
  the passphrase field is emptied and focused, and the advice stays through typing until the next
  submit (as a passkey's gripe does), which replaces it with its own outcome.
  Changeset `minor`, `safebyok` and `safebyok-react`.
* **Decisions taken**:
  * **The catch-up is a full `refresh()`**, not just the props already taken up: the snapshot then
    shows A's lockboxes too. A failed catch-up is warned of through the logger (snapshot
    `syncing: false`) and the refusal is still `created_elsewhere`, except for a refusal as
    untrusted storage, which is thrown as it came (as `catchUp` does for a stale write).
  * **Only `wrong_passphrase` converts**: a `damaged_wayin` or any other refusal from the standing
    vault is thrown as it came.
  * **Message**: "A vault was just created for this label on another device, with a different
    passphrase than the one you entered. Nothing was created on this device. Enter the passphrase
    you chose there to unlock it."
  * **The field is emptied** (the field stays mounted; its value is set to '' and focused) because the passphrase typed was just shown not to open the vault, and the advice is kept through typing so that clearing the field does not wipe the one line saying what to type (the review's finding). The placeholder is the same while unlocking; `autocomplete` follows the snapshot to `current-password`.
  * **The modal's advice is `quiet` styling** on the same `<p>` in the same `role="alert"` region
    (`Gripe.asAdvice`), since the host's stylesheet already styles `quiet` and `gripe`.
  * **No `notes/security.md` entry**: telling the two apart says only that a vault with another id
    stands, which the snapshot shows once settled.
* **Discoveries**: the race is narrow. `unlock()` refreshes before `settleUnlock`, so a vault
  created on another device *before* the unlock looks is simply a standing vault, and a wrong
  passphrase is `wrong_passphrase` (a test says so). `created_elsewhere` arises only when the other
  device's create lands between that look and `fetchOrCreateVaultProps`. The sprint's first test
  case ("A creates, then B's first unlock with P2") is therefore the race too; the tests drive it
  with `TH.beforeNextCall(vaultDB, 'fetchOrCreateVaultProps', ...)` over a bell-deaf vaultDB for B.
  The helper `raceLostToPwOne` is module-level in `vault.test.ts` for the linter.
