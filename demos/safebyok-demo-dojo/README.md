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
* **Forms**: one form with a secret in it, built ten ways, a row each (`src/components/forms/`), in two groups. The tab
  opens by asking for a tradeoff: the password cleared on save but kept for edit or retry on error, or cleared at once
  and typed again on a problem. A table under that question names each row to choose from, where the password is while
  the save runs and after an error, and why a host would choose it; the rows follow: a form Action through
  `putBoxAction` that cancels React's reset on a refusal (recommended), `onSubmit` awaiting `putBoxOnce`, a mutation that
  reads the form itself, and react-hook-form with the password left out of it (balanced), a form that empties the
  password before the save begins, and one that empties it too but puts it back on a refusal (hardened). Under a heading of their own,
  with a table naming each one's bad practice, come the rows that show what goes wrong: the form Action as its docs show
  it, a mutation from `putBoxMutationOptions` handed the form, controlled inputs, and react-hook-form holding the
  password. Each row saves a box of its own, the username in its sidecar and the password in
  its whisper. Its three buttons hold the save six seconds in the vaultDB (`holdNextWrite`), then **save** lands,
  **stale** meets a box a second device of the same user wrote during the hold (`src/lib/elsewhere.ts`), and **fail** is
  refused. Beside each row, the **mirror** shows the password's text where the DOM has it: the input's `value` and its
  `value` attribute. It is written by `src/lib/mirror.ts`, plain DOM code that index.html starts, outside React. Beside
  it, the **variables** cell shows what a row's mutation held in its variables as it went pending, written by a listener
  on the page's mutation cache (`src/components/forms/variables-mirror.ts`). This is the one tab that shows a secret's
  text: the dojo's are made up. Sign in as Hero or Thierry and unlock.
* **Practice**: the craft around a form with a secret in it, a card for each thing a careful form does
  (`src/components/practice/`), each with a working example to copy and, where there is one, the thing not to do beside
  it: hold the submit until zod passes, with each message by its field; disable the submit while the save is pending;
  why not to debounce a secret's check or its submit (es-toolkit's `debounce`, shown); invite a password manager to the
  passphrase (the kit's `UnlockForm`) and keep it from a stored key (`WhisperFieldAttributes`); a new passphrase's
  strength and its confirmation (`useNewPassphrase`); the typing helpers turned off on a field that can be revealed; paste
  allowed and the key trimmed where the whisper is made; focus and an alert after a refusal; a key tested on a button
  press; and `method="post"` on a form that submits from `onSubmit`. The key checker and the slow save of the debounce
  and test cards are made up (`src/lib/made-up-service.ts`): they call nothing. The cards that save write boxes of their
  own (`practice_…`): sign in as Hero or Thierry and unlock.
* **Inspect**: the vault database's rows (there), the persisted caches' rows (here, where the old core had a DeviceDB),
  the device's bank TSQ (its bank, main gate and root box) and vault TSQ (its boxes and their listings), through the
  library's back door, `SOK.maskedView()`, which cuts each ciphertext to its last 2 characters and its length, and its
  lease, by its loggable and when it ends (Lock and Unlock change it), and the host's mutations. Each is a table, grouped by modelkind: a group's first row names it,
  with its count, and the fields of its rows, in the order the rows have them. A Thing's scope (`userid`, `banklabel`,
  `labelpath`), `scope` and `modelkind` are left out: a row's first cell, its ckey, says them. Ciphertext is cut short, and nothing is decrypted. A
  `revtok`, `lifetok` or `read_tc` column shows its first ten characters and its last two, by `maskUuid` from
  `safebyok/utils`.
* **Scenarios**: two whole forms as a user would meet them (`src/components/scenarios/`), each with a checklist of the
  Coach's claims about it and what the dojo found today (`claims.ts`). **Envman** edits Hero's stored box `github` on
  `useDraft`: the username (sidecar) in a plain input, the password (whisper) masked, an eye that shows it, a double
  click or the quill that edits it, and Save, or a save whenever either field loses focus. **API key** writes a new box,
  `scenario_apikey`, from a form Action through `putBoxAction` with a `WhisperInput`, and shows the box stored beneath
  it by `WhisperMask`. Each form has the Forms tab's mirror. Two buttons arm the vaultDB to hold the next write six
  seconds or refuse it, and the app mounts the kit's `UnlockDialog`, which opens while a reveal or a draft's save waits
  for the passphrase. Sign in as Hero and unlock.

Under each form, the **readout** shows, after each press, whether each field still has text and the message the form
shows. It reads `value.length > 0` and nothing else of a field.

## What each button arranges

Each button but Login's Dismiss arranges its outcome through what the dojo hands the library as a host would, then
submits the one form. Each arrangement lasts until that outcome lands.

| Button | Arranges |
| --- | --- |
| Sign In, Save | nothing |
| Weak | the strength checker, which otherwise judges four characters or more strong, judges every passphrase weak (`src/lib/switchable-checker.ts`); New Box also judges the password again, so its own check sees the verdict |
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
* **The strength checker is the dojo's own**: four characters or more is strong (`src/lib/switchable-checker.ts`). It
  judges nothing a host should, and a host passes a real one, such as `zxcvbnStrengthChecker`.
