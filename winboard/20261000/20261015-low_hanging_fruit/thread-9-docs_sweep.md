# Thread 9: docs_sweep (2026-10-15)

Branch `20261015-docs_sweep`, PR [#33](https://github.com/mrflip/safebyok/pull/33), cut from `origin/main` and rebased onto it at filing. Justify: green (core 248 tests, convex 213, react 9, demo 28, root 72).

* **Built**: each stale line the canvass found, in four commits by prefix.
  - `docs:` doc blocks. `types.ts` `Label` no longer lists `userlabel` (and says `user_id` is the
    host's auth identity, deliberately not a Label). `vault-db.ts` (`localVaultDB`, its
    `maxRecordBytes` comment) and `string-store.ts` (the file header and `domStore`) lose "stub",
    "pretend" and "stand-in": `localVaultDB` is described as a real device-only store.
    `VOCABULARY.md`'s `revisionId` row now names `stale_write`.
  - `docs:` `packages/safebyok/README.md` gains two sections at its end: *Locking* (the
    `visibilitychange` -> `vault.lock()` recipe, Idle Detection as the only true screen-lock
    signal, `lockSoon()` named as the gentler callee once it lands) and *No recovery*.
    `notes/security.md`'s release bullet now describes the push-to-main workflow and the `pack`
    job's `pnpm justify`, not the release-published trigger and `prepublishOnly`.
  - `demo:` `src/lib/persist-storage.ts` (`keepStorage`, tested) is called from `main.tsx`, so the
    demo calls `navigator.storage.persist()` as `src/idb.ts`'s doc block says a host should.
  - `client:` the unlock dialog (the `locked` branch of `PassphraseModal`) now says a forgotten
    passphrase cannot be recovered; the create branch already did. New
    `tests/passphrase-modal.test.tsx`. Changeset `.changeset/20261015-docs_sweep.md`.

* **Decisions taken**:
  - Changeset is a real `safebyok-react` patch: the dialog's user-visible text changed. The
    lockstep group moves both packages; the README and doc-block edits ride with it.
  - The core README had no locking section (it is 15 lines); I added *Locking* and *No
    recovery* at the end of the file, so threads 1 and 2's README edits rebase mechanically.
  - The locked-state dialog sentence tells the user they would "start a new vault and re-enter
    your secrets", the proposed README's "annoying, not catastrophic" in the user's terms.
  - `notes/security.md`: only the release bullet changed; the `rememberForMs` wording stays
    until roadmap 3, and the 2026-10-14 "replacing the plaintext stub" bullet is dated history.

* **Deviations**: the demo's persist call needed a small module rather than a bare line, so it
  could carry a doc block and tests (STYLE.md); `main.tsx` stays a boot line.

* **Discoveries**:
  - `vault.ts` still says "pretending otherwise" (line ~130) and "pretending to be current"
    (~216); both are ordinary English about a design point, not the stub-era wording, so left.
  - `.devcontainer/devcontainer.json` volumes are still `byok-${devcontainerId}-claude` and
    `-node_modules`: not edited (the Coach's rebuild). Renaming them orphans the existing
    volumes, which is the cost the Coach should weigh at rebuild.
  - The dialog's unlock copy is covered only by the new modal test.

* **Review (fixed)**: 19a6e60 -- *Locking* now says `lock()` also erases this device's remembered
  unlock, so the recipe asks for the passphrase on each return; d82a25f -- `domStore`'s doc block.
  Then at filing: the recipe is a function returning its own unsubscribe and catching a `lock()`
  after `close()`; `notes/security.md` gains a 2026-10-15 bullet on the release App's private key
  and marks the release bullet "(revised 2026-10-15)".

* **For the Coach**: the `.devcontainer` volume names above. The *Locking* recipe is the host
  line the rulings asked for; the React `lockWhenHidden` prop stays ruled-but-not-yet.
  Two open questions: (1) **the ruled screen-lock recipe defeats the seven-day remembered
  unlock**: `lock()` erases the device's remembered unlock, so a host following the recipe asks for
  the passphrase every time the tab is hidden and shown. Is that the intent, or should the recipe
  wait for `lockSoon()` or a lock that keeps the remembered unlock? (2) **`unlock()` / `lock()`
  race in `vault.ts`**: a `lock()` landing while an `unlock()` is in flight can leave the vault
  unlocked after it; the recipe makes that likelier. Not fixed here.
