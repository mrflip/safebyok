# Thread 13: rotation_design (2026-10-16)

Branch `20261016-rotation_design`, PR [#105](https://github.com/mrflip/safebyok/pull/105), cut
from main at `b60e516`, then stacked on #97 (the line main → #96 → #99 → #98 → #97) at filing. Documents only. Justify: green; every package's suite passes (core 1132, convex
282, postgres 162, graphql 159, demo 131, root 123, indexeddb 108, react 73, argon2-wasm 44).

* **Built**:
  * `whiteboard/20261016-rotation/rotation-design.md`, the design for vault-key rotation (the
    Coach's "(a)") and the NOTYET of per-device lockout. Sections:
    * what rotation promises, and its limits;
    * the decision in section 2;
    * the stored shapes;
    * a one-commit, resumable protocol;
    * what it needs from the `VaultDB` contract;
    * reads mid-walk;
    * a table of cases;
    * the rollback check;
    * an API sketch;
    * the NOTYET with the platform rules;
    * the thread breakdown (threads 14 and 18 to 20, as the orchestrator numbered them);
    * the security notes the build owes;
    * open questions.
  * `TODO.md`:
    * a NOT YET entry, *Lock out a device*;
    * the first-emit deviation struck as ruled (pulled forward by the orchestrator).
  * An empty changeset.
* **Decisions taken**:
  * **Rotation keeps only the ways in proven during it, and removes the rest.** The matter's
    "re-wrap the remaining envelopes" can't be done with symmetric keys: each envelope's key comes
    from a passphrase or a passkey touch the vault never keeps, and every shortcut (the new key
    under the old, escrowed envelope keys) hands the new key to the removed way in. The
    alternative, a key pair per way in (HPKE), is a new construction, so it is open question 1 for
    the Coach rather than built.
  * **One atomic step.** The bundle's versioned update is the commit: new envelopes, the vaultKey
    epoch bumped, and the prior vaultKey wrapped under the new one. After it, lockboxes are walked
    one conditional write at a time, and any unlocked device resumes the walk. So rotation needs
    no transactions. The prior key's wrap is never cleared (it is harmless), so finishing a walk
    needs no second bundle write, which would otherwise log every device out again.
  * **A new `VaultDB` expectation**: a lockbox write lands only under the standing
    `vault_key_epoch`. Without it, a device that hasn't looked at the bundle since the commit seals
    new whispers under the revoked key.
  * **A per-vault random `device_id`**, never a per-install id, so the backend can't link a
    user's vaults, or several users' vaults on a shared device, to one device.
  * **`rotateVaultKey` stays separate from `removeUnlock`**, which stays the cheap,
    non-revoking removal (open question 2).
* **Deviations**: the plan put the design in `whiteboard/20261016-rotation/`, and it is there.
  The thread file is here, beside the sprint's others. `notes/security.md` is not edited: its
  entries describe code, and section 12 of the design lists those the build threads owe.
* **Discoveries**:
  * **No rollback check exists.** `refresh()` takes up any bundle whose epoch changed, so a
    restored older bundle brings back a removed way in. Thread 14 adds a device mark (a highest
    epoch seen, kept through locks) and a `rolled_back` refusal.
  * **Rotation signs every other device out**: their remembered unlocks wrap the old key. Only
    per-device key pairs (open question 1) would avoid that.
  * **Thread 11's contract PR was not up** when this was written. Section 5 names the three lines
    rotation relies on, one of them new.
  * **Thread 10's [#106](https://github.com/mrflip/safebyok/pull/106)** has
    `whenIdentityRevoked: 'lock' | 'stay'`. Section 7 covers both.
  * The orchestrator's item "a failed `openVault` leaks its subscription" **is not in `TODO.md`**,
    on main or in #99: its only mention is `winboard/20261014-convex_vaultdb/20261015-sprint_convex_vaultdb_done-human.md`, which
    agents don't edit. Nothing was struck.
  * The first-emit ruling's design.md is `winboard/20261014-convex/design.md`, not under
    `packages/safebyok-convex`.
  * [#99](https://github.com/mrflip/safebyok/pull/99)'s *Revocation and server signing* bullet in
    TODO's *Open from big_feats* now points at this design (a `plan:` commit at filing, once
    stacked on it).
* **For the Coach**:
  * the design's open questions 1 (keep only the proven ways in, or a key pair per way in; it
    goes to the Coach as an Open Matters row and gates thread 19, not this PR) and 7
    (the reading of Apple's and Google's identifier rules);
  * the new names (5) and the `rolled_back` kind (3).
