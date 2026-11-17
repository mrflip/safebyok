# Thread 9: unlock_fixes (2026-10-15)

Branch `20261015-unlock_fixes`, PR [#88](https://github.com/mrflip/safebyok/pull/88), stacked on
#77 (`12fc4d0`), in the line #71 → #76 → #73 → #78 → #74 → #77 → amendments; restacked onto thread
8 at assembly. Justify: green, 1,936 tests (root 123, safebyok 917, indexeddb 104, react 71,
postgres 134, convex 275, demo 124, argon2-wasm 44, graphql 144); `pnpm size` green after one
budget rise (below).

* **Built**:
  - **`vault.addPasskey(proof, makePasskey, { unlocklabel })`** (`packages/safebyok/src/vault.ts`).
    The second argument is now a function, `() => Promise<PasskeyProof | null>`, that the vault
    calls only after the label and room checks and the proof's derivation have passed. A refused
    proof never reaches the authenticator. Resolves the `unlock_id`, or null when the maker resolved
    null (dismissed), writing nothing. A non-function is `bad_option`; what the maker throws is
    thrown as is. `reviseUnlocks`'s `revise` may now resolve null to abandon the change once proven
    (it then resolves false, writing nothing); `addPasskey`'s `revise` calls the maker. Docs, READMEs (core, react), `createPasskey`'s
    doc, the demo's `WaysIn` and the tests follow. The demo's own blank-passphrase guard is gone:
    the core now refuses a blank proof before asking.
  - **`safebyok-indexeddb`'s bell** (`src/bell.ts`) `unref`s its BroadcastChannel where the
    platform's has `unref` (Node, Bun), and catches what a listener throws. Tests: a stubbed channel
    sees `unref`, and a real Node child process that rings the bell with a throwing listener exits
    0 with nothing on stderr. Before each fix it hung until SIGTERM, then exited 1. The README says
    so for hosts and for adapter authors.
  - **A passkey envelope through `safebyok-graphql`**: a bundle holding `TH.passkeyEnvelopeOf`
    reads back deep-equal, and a real vault adds a passkey over the wire (an `updateBundle`) that
    another device then lists while locked and unlocks with alone. No change to the package.
* **Decisions taken**:
  - **A maker callback, not a separate proof check.** The core never calls WebAuthn, so "check the
    proof, then make the passkey" means the vault must call back into the host. A
    `vault.checkProof()` first would cost a second Argon2id (~0.6 s) and leave the order to every
    host. The callback costs one derivation and enforces the order in the API. Passing a
    `PasskeyProof` directly is refused rather than kept as an alternative: keeping it would keep the
    footgun, and nothing binds backward before 1.0.
  - **A throwing bell listener's error is dropped, not reported.** The bell has no logger and the
    orchestrator ruled out any channel but the vault's logger. The vault's own listener never throws
    (it logs a failed refresh itself), so only a host's direct `vaultDB.subscribe` listener can, and
    reporting is that listener's job.
  - **openVault's size budget 19 → 19.5 kB** (`.size-limit.json`): the change adds about 70 B
    (18.95 → 19.02 kB) even after the new error message was shortened.
  - **`notes/security.md`** (at review): the proven vaultKey's extractable transient handle is now
    held across the WebAuthn prompt, human time; the entry says why that is acceptable and what
    bounds it (the prompt's `timeout`, a dismissal).
* **Deviations**: none from the plan. The review asked for the `made` holder and its `!` to go,
  with `proceed` handing its passkey to `revise`. Any version that passes a value to `revise`
  changes the line beside thread 7's renamed epoch line. The simplest is no `proceed` at all:
  `revise` calls the maker and resolves null to abandon. That costs **one known conflict with
  thread 7** in `reviseUnlocks`, checked with `git merge-file` against
  `origin/20261015-epoch_rename`. Resolve it as `unlock_epoch:     standing.unlock_epoch + 1,` then
  `unlocks,`. The rest merges cleanly. The new GraphQL tests name no epoch.
* **Discoveries**:
  - **The passkey prompt now follows async work**: a storage read and a key derivation run between
    the click and `navigator.credentials.create`. Current browsers allow it. Older Safari wanted
    WebAuthn called straight from a user gesture, and `createPasskey` would report that refusal as
    a dismissal (null). The react README says so. Untested on a real authenticator.
  - **A `stale_write` during the prompt still orphans a passkey**: another device changing the ways
    in while the user touches the authenticator. It is rare, documented, and tested.
  - **The core's own memory bell** (`string-store.ts`) calls listeners synchronously, so a throwing
    listener there throws out of the write that rang it, after the write has landed. It is the same
    family as the IndexedDB fix but outside this thread's scope. Catching once, in `VaultDB`'s base
    `subscribe`, would cover every adapter.
* **For the Coach**:
  - `addPasskey`'s signature changed (`safebyok` minor in the changeset). Confirm the callback
    shape, and try it with a real authenticator on Safari when you test #76.
  - Left at review, minor: a `lock()` during the prompt still lands the passkey (the vault stays
    locked, as for every change to the ways in); there is no retry on `stale_write`; and on a slow
    device the click's user activation may run out before the prompt.
