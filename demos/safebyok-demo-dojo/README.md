# safebyok-demo-dojo

The dojo: a page for producing, on demand, each outcome of the forms around a vault, and looking at what the form and the
stores behind it hold afterwards. It runs on the new core (`safebyok`), its React layer (`safebyok-react-lean`) and its
IndexedDB storage (`safebyok-idb-lean`). It shows what the library does today; it decides nothing. Never published.

```sh
pnpm --filter safebyok-demo-dojo build:deps  # builds what the dojo needs
pnpm --filter safebyok-demo-dojo dev         # starts Vite
pnpm --filter safebyok-demo-dojo fixture     # writes src/fixture/fixture.json again, after the library changes what it stores
```

## The page

* **The header**: who is signed in and the bank's stage; Lock or Unlock (the kit's `UnlockForm` in a `ModalDialog`);
  Sign out; Reset; and Hero, Thierry and Nolo, each with its passphrase printed beside it.
  * **Hero** has a bank stored there, and its caches kept here: it comes up `locked` from the cache.
  * **Thierry** has a bank stored there, and nothing here.
  * **Nolo** has nothing anywhere: its bank is `unborn`.
* **Login**: one form that creates the signed-in user's vault: a username, a new passphrase and its confirmation, the
  strength verdict beside them (`useNewPassphrase`), and five buttons. Sign in as Nolo.
* **New Box**: the same form adding a box at the labelpath `login` (`putBoxAction` under `useActionState`): the username
  in its sidecar, the password in its whisper. Sign in as Hero or Thierry and unlock.
* **Inspect**: the vault database's rows (there), the persisted caches' rows (here, where the old core had a DeviceDB),
  the device's QueryClient, and the host's mutations. Each is grouped by modelkind with a count, ciphertext cut short,
  nothing decrypted.

Under each form, the **readout** shows, after each press, whether each field still has text and the message the form
shows. It reads `value.length > 0` and nothing else of a field.

## What each button arranges

Each button but Login's Dismiss arranges its outcome through what the dojo hands the library as a host would, then
submits the one form. Each arrangement lasts until that outcome lands.

| Button | Arranges |
| --- | --- |
| Sign In, Save | nothing |
| Weak | the strength checker judges every passphrase weak (`src/lib/switchable-checker.ts`); New Box also judges the password again, so its own check sees the verdict |
| Exists | the fixture's planted rows written into the vault database behind the device's back: Nolo's bank, or a box at `login` in Hero's and Thierry's. They are written as the fixture made them, over whatever is stored: after a Save, Reset first, or the put meets an older box and refuses `record_conflict` |
| Failed | the vaultDB refuses its next write (`src/lib/refusing-vault-db.ts`) |
| Dismiss | Login: the form is reset, as a Cancel button would, and nothing reaches the library. New Box: the bank is locked before the submit |

## The stores

* **There**: an `IdbVaultDB` in the database `safebyok-dojo:vault-v001-001-001`, standing in for a backend.
* **Here**: the device's two caches, each an `IdbPersister` record in `safebyok-dojo:persist-v001-001-001`.
* **Reset** signs out and reloads the page, which empties both databases and writes the fixture's rows into them before
  it makes a device (`src/lib/session.ts`, `src/lib/stores.ts`). The first visit to a browser loads the fixture too.
* **Switching users** reloads the page: a device serves its first user for its life.

The fixture is made by `scripts/make-fixture.ts`, through the library, under Node over fake-indexeddb.
`tests/lib/fixture.test.ts` fails when the library can no longer unlock it.

## Demo scaffolding

* **The key deriver is real Argon2id at cheap settings** (`dojo_light`: 1 MiB, one pass), so the fixture's banks unlock
  in milliseconds. These settings are for the dojo alone, whose passphrases are printed on the page: they protect
  nothing, and a host keeps the library's own (`Argon2idWebV1`).
* **Signing in is fake**: the userid is kept in localStorage.
