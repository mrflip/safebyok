# Release checklist

The passes only a person can make, before the Coach marks a Version PR ready
(`notes/releasing.md`). CI cannot run them: the tests use a fake `navigator.credentials`,
jsdom, a fake
IndexedDB and in-process stores, and a fake Convex deployment. The same pass each time, so that
what was checked last release is what is checked this one. Whatever a container can run is
automated instead, so it is not here; what is below stays by hand.

Tick each against the release candidate: `pnpm install && pnpm build` at the Version PR's head,
and the demo (`pnpm demo:react`) over the candidate's built packages. Note anything that fails in
the PR, and do not mark it ready.

## Real authenticators

On each, create a vault, add a passkey, lock, unlock with it, remove it
(`packages/safebyok/README.md`, *Fingerprint unlock*; the demo shows the prompts).

* [ ] A platform authenticator with PRF: Touch ID or Face ID on a current Mac or iPhone (Safari
  and Chrome), Windows Hello (Edge or Chrome), Android's fingerprint in Chrome.
* [ ] A security key with PRF (a YubiKey 5 series), over USB and over NFC where the key has it.
* [ ] An authenticator without PRF: the vault refuses `passkey_unavailable`, and the passphrase
  still opens it.
* [ ] A passkey synced to a second device (iCloud Keychain or Google Password Manager): unlock
  there with it.
* [ ] A dismissed prompt returns `null`, and leaves the vault as it was.

## Real browsers

The core's browser paths run in jsdom and a fake IndexedDB in CI; this is where they meet the
real thing. Chrome, Firefox and Safari, a current release of each, on a desktop, and Safari on an
iPhone.

* [ ] Create a vault, store a lockbox, reload: the vault is locked, then unlocks with the
  passphrase, and the lockbox reads back (IndexedDB device store and vault store, `argon2idWebV1Deriver`).
* [ ] The device remembers the unlock for its window and forgets it after: lock it, reload.
* [ ] A second tab: unlock in one, the other follows; sign out in one, both lock (the device
  shelf's cross-tab erase).
* [ ] A private window: the vault opens, or refuses calmly, with no stray console output.
* [ ] `safebyok-fastkey` where WebAssembly runs; under a Content-Security-Policy without
  `'wasm-unsafe-eval'` it refuses with `bad_option`, naming why.
* [ ] The passphrase dialog in each browser's own password manager and autofill: it neither fills
  nor offers to save the whisper.

## The Convex README walk

In a fresh Convex project, follow `packages/safebyok-convex/README.md` as written, line by line,
with the packages installed from the Version PR's packed tarballs (`pnpm pack`), not the
workspace.

* [ ] *What your app adds to its `convex/` directory*: `convex.config.ts`, the functions, and the
  auth setup, each as the README gives it; `npx convex dev` accepts them.
* [ ] *What your app does on the client*: `convexVaultDB` with `ConvexReactClient` and with
  `ConvexClient`; a vault created, stored into, read from another browser signed in as the same
  user, and refused for another user.
* [ ] A write refused by the deployment's validators carries no record text in what the browser
  sees (a dev deployment's own error quotes arguments: `notes/security.md`).
* [ ] Anything in the README that no longer matches what the commands print is fixed in the
  release, not noted.

## Supabase

`safebyok-postgres`'s README says it has not been run against Supabase. Until it has:

* [ ] In a Supabase project: put `vault-tables.sql` and `vault-notify.sql` in a migration, run
  `postgresVaultDB` from a server route and from an Edge Function over the project's connection
  string, and run the battery against it.
* [ ] The Data API reaches nothing in the tables as `anon` or `authenticated`.
* [ ] LISTEN over a direct or session-mode connection hears another device's write; over the
  transaction-mode pooler it refuses or degrades as the README says.
* [ ] When all of it passes, take the *Untested on Supabase* paragraph out of the README.

## After the Coach approves the staged versions

* [ ] `npm view safebyok version` and each companion's: the new version, under `latest`
  (or `next` for a prerelease).
* [ ] A fresh project: `pnpm add safebyok safebyok-indexeddb safebyok-react`, the README's
  quickstart runs.
