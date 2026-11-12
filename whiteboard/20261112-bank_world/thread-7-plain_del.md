# Thread 7: plain_del (2026-11-12)

Branch `20261112-plain_del`, PR [#662](https://github.com/mrflip/safebyok/pull/662), stacked on [#661](https://github.com/mrflip/safebyok/pull/661) (thread 6,
device_owner). Justify: green (core 3005, react 261, demo 98, e2e 504, the rest unchanged).

* **Built**:
  * **`vault.del(vault)` asks nobody** (ruling R5). It is `Storable.del` with no override: `demandDeletable` is the base
    `demandEnabled().demandUnlocked()`, so a locked vault refuses `vault_locked` through `needUnlocked`, the thrower a
    box put uses. `delVaultPrompt`, `tryDelVaultPrompt`, the vault's `demandDeletable` override, the `delVault` act in
    `models/gating.ts`, the `del_vault` gatingkind (`shapes-enums.ts`), `vaultDelCleartexts` and its entries in
    `CleartextsForGatingkind` / `VaultForGatingkind` (`shapes-gateish.ts`) are gone.
  * **`vault.hello()` is `vault.beginWatch()`**, `tryHello` is `tryBeginWatch`, and `demandHelloable` is
    `demandWatchable`. `listing.hello()` and the `helloed` event kind keep their names.
  * **React**: `DelVaultModal({ vault, onDone })` is a plain confirm with one `useActionState`: Delete calls
    `vault.tryDel(vault)`, a refusal shows as the gripe, success calls `onDone(true)`, Cancel/Escape `onDone(false)`.
    `GatingDialog` became `ModalDialog({ onCancel, ... })` and `ModalForm` takes `onCancel` in place of `gating`, so
    the four gating modals pass `onCancel={() => { gating.dismiss() }}`. `gating-modal.tsx` lost its `del_vault` entry;
    the context's `helloedVaults` is `watchedVaults`.
  * **Demo**: `AccountMenu` unlocks the vault (`tryEnsureUnlocked`), then mounts `DelVaultModal`; on `onDone(true)`
    it deletes the account. The no-vault path keeps `globalThis.confirm`.
  * **Tests**: `vault-gate.test.ts`'s `vault.del()` describe (asks nobody and forgets the lease; refuses `vault_locked`
    asking nobody and storing nothing; `stale_write`; a refused forget reaches onLifecycle; another session's delete).
    `delTyping` became `delUnlocked` (`test-helpers/vault-world.ts`). The modal's tests are rewritten.
  * **Docs**: VOCABULARY, both READMEs, root README, STYLE's example, guarantees' passphrase chain, design-proof's
    `del_vault` section (now `vault.del`), design-models, reference-timings (the del_vault lock race line is gone with
    the lock), wontfix (the "failed delete still locks" entry is marked superseded), old_vocabulary.
  * `src/` lines: safebyok +21 -51; safebyok-react +52 -64; demo +15 -8.
* **Decisions taken**:
  * **The modal is mounted by the host**, not by `BankProvider`: with no gating there is nothing for the provider to
    react to. It takes the vault and reports through `onDone`, so the host decides what follows (the demo deletes
    the account). No DialogBoundary, no ref, no passphrase field, no `useAttemptAction`.
  * **`ModalForm` generalized to `onCancel`** rather than DelVaultModal rendering its own `<dialog>`: one line in each
    gating modal, and the confirm reuses the kit's title/blurb/gripe/pending layout. Set aside: a bespoke dialog in
    `del-vault-modal.tsx` (duplicates the kit), and a fake gating object (a lie in the types).
  * **`VaultListing.tryDel`'s other-life guard (`vault_reborn`) kept**: a listing guard, carried over (rule 2).
  * **The demo unlocks before it confirms**, so the modal never meets a locked vault in normal use; a refusal that
    is not quiet shows as the menu's gripe.
  * **Tests call `vault.del(vault)`**: `Storable.del` takes what was asked; the spec's `vault.del()` has no argument.
* **Deviations**: none from the thread text. The demo was in scope as the del-vault modal's only host.
* **Discoveries**:
  * A tombstoned vault now refuses `vault.del` as `vault_locked` (the tombstone revoked the lease), where it refused
    as absent; and `vault.del(vault.scope)` can no longer repeat a delete over the tombstone. Rule 17 allows the kind.
  * `Phrases.VaultLocked` reads "The vault locked mid-operation", which misleads for a del on a vault already locked.
  * Nothing locks first now, so a box can be unsealed under the lease until the tombstone lands, as during `delBox`.
* **Ride-along (orchestrator's directive, thread 6's review)**: `.changeset/20261112-device_owner.md` says a second
  `device.ensureBank()` returns the bank in hand; `Bank.make`/`bank.hello` doc text fixed in
  `tests/test-helpers/logging.ts`, `tests/helpers/logger.test.ts`, `tests/refusals/errors.test.ts`,
  `tests/refusals/host-error-sanitizer.test.ts` and TODO.md (lines ~143, ~182). TODO's "`device.ensureBank()` checks
  that the DeviceDB responds" may now be done (`ensureCachedDevice` runs at bring-up); words only, left in.
* **For the Coach** (open matters):
  * **Cancel during a pending delete**: the dialog can be dismissed while `tryDel` is in flight, and `onDone(true)`
    still follows when it lands. Carried over; recommend leaving it.
  * **`vault_locked`'s phrase** on a del of an already-locked vault says "locked mid-operation". Recommend a
    one-line phrase change in a later thread, or accept.
  * **`vault.del` takes an argument** (`vault.del(vault)`); the spec writes `vault.del()`. Recommend keeping Storable's
    signature.
  * **The `helloed` event kind** keeps its name beside `beginWatch`. Recommend renaming with thread 8 or later, if at all.
  * **A deleted vault refuses `vault_locked`**, not absent, and cannot repeat its delete through the Vault.
    Recommend accepting (rule 17).
