# Release checklist

The checks only a person can make, before the Coach marks a Version PR ready (`notes/releasing.md`).
CI cannot run them: the tests use a fake `navigator.credentials`, jsdom, a fake IndexedDB, in-process
storage and a fake Convex deployment. Make the same pass each time, so that what was checked for the
last release is what is checked for this one. Anything a container can run is automated instead, and
is not listed here. What is below stays by hand.

Tick each item against the release candidate: `pnpm install && pnpm build` at the Version PR's head,
and the demo (`pnpm demo:react`) over the candidate's built packages. Note anything that fails in the
PR, and do not mark it ready.

## Real authenticators

On each authenticator, create a vault, add a passkey, lock, unlock with the passkey, and remove it
(`packages/safebyok/README.md`, *A host*; the demo shows the prompts).

* [ ] A platform authenticator with PRF: Touch ID or Face ID on a current Mac or iPhone (Safari
  and Chrome), Windows Hello (Edge or Chrome), and Android's fingerprint in Chrome.
* [ ] A security key with PRF (a YubiKey 5 series), over USB, and over NFC if the key supports it.
* [ ] An authenticator without PRF: the vault refuses with `passkey_unavailable`, and the passphrase
  still unlocks it.
* [ ] A passkey synced to a second device (iCloud Keychain or Google Password Manager): unlock with it
  on that device.
* [ ] A dismissed prompt returns `null`, and leaves the vault as it was.

## Real browsers

In CI, the core's browser paths run in jsdom against a fake IndexedDB. This is where they meet the
real thing: a current release of Chrome, Firefox and Safari on a desktop, and Safari on an iPhone.

* [ ] Create a vault, put a box, and reload: the vault is locked, unlocks with the passphrase, and the
  box reads back (IndexedDB DeviceDB and BankDB, `argon2idWebV1Deriver`).
* [ ] The device remembers the unlock for its window and forgets it after: lock it, reload.
* [ ] A second tab: unlock in one, and the other follows; sign out in one, and both lock (the device
  shelf's cross-tab forget).
* [ ] A private window: the vault opens, or refuses calmly, with no stray console output.
* [ ] `safebyok-fastkey` where WebAssembly runs. Under a Content-Security-Policy without
  `'wasm-unsafe-eval'`, it refuses with `bad_option`, and the message says why.
* [ ] The passphrase dialog with each browser's own password manager and autofill: it neither fills
  nor offers to save the whisper.

## The Convex README walk

In a fresh Convex project, follow `packages/safebyok-convex/README.md` as written, line by line, with
the packages installed from the Version PR's packed tarballs (`pnpm pack`), not from the workspace.

* [ ] *Install the component* and *Serve its functions*: `convex.config.ts`, the functions and the
  auth setup, each as the README gives it. `npx convex dev` accepts them.
* [ ] *Use*: `ConvexBankDB` with `ConvexReactClient` and with `ConvexClient`. Create a vault, put a
  box, read it from another browser signed in as the same user, and check that another user is
  refused.
* [ ] A write refused by the deployment's validators shows no record text in what the browser sees
  (a dev deployment's own error quotes arguments: `notes/security.md`).
* [ ] Anything in the README that no longer matches what the commands print is fixed in the release,
  not noted.

## Supabase

`safebyok-postgres`'s README says it has not been run against Supabase. Until it has:

* [ ] In a Supabase project, put `bank-tables.sql` and `bank-functions.sql` in a migration. Run
  `PostgresBankDB` from a server route and from an Edge Function over the project's connection
  string, and run the bankDB battery against it.
* [ ] The Data API reaches nothing in the tables as `anon` or `authenticated`.
* [ ] LISTEN over a direct or session-mode connection receives another device's write. Over the
  transaction-mode pooler, it refuses or degrades as the README says.
* [ ] When all of it passes, remove the sentence in the README's *On Supabase* section that says the
  package has not been run against Supabase.

## After the Coach approves the staged versions

* [ ] `npm view safebyok version`, and the same for each companion package, shows the new version
  under `latest` (or `next` for a prerelease).
* [ ] In a fresh project, `pnpm add safebyok safebyok-indexeddb safebyok-react`, and the README's
  quickstart runs.
