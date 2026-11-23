# Thread 1: dojo (2026-11-23)

Branch `20261123-dojo`, PR #858, cut from `20261123-one_client` (#857), caught up onto main at 683175bef. Proved: `pnpm justify`
green after the catch-up (the dojo's 12 tests among them).

The findings, the readout table and the awkward list, are in [dojo-findings.md](dojo-findings.md): the Coach's read.

* **Built**: `demos/safebyok-demo-dojo`, a Vite + React 19 app copied in setup from knockknock.
  * `src/lib/dojo.ts`: the giver over a `RefusingVaultDB` (an `IdbVaultDB` subclass that refuses its next write on
    demand), a switchable strength checker (zxcvbn, or always weak), `IdbPersister`s for both caches (`throttleMs: 0`),
    and real Argon2id at cheap settings (`dojo_light`, 1 MiB, one pass).
  * `src/lib/stores.ts`: the dojo's own idb-keyval connections to both databases: read every row, load the fixture,
    plant rows. `src/lib/session.ts`: the userid in localStorage; every change reloads; Reset sets a flag that the next
    page acts on in `readyStores()` before `main.tsx` renders.
  * `src/lib/scenarios.ts`: what each button arranges (`nothing`, `weak`, `stored`, `refused`, `locked`), and `disarm`.
  * Components: `Header` (stage, Lock/Unlock with the kit's `UnlockForm` in `ModalDialog`, Sign out, Reset, three users
    with passphrases), `LoginTab`, `NewBoxTab`, `InspectTab`, and `Readout`, which reads, in a layout effect after each
    outcome commits, each field's `value.length > 0` and the form's `role="alert"` text and `data-refusalkind`.
  * `scripts/make-fixture.ts` (`pnpm fixture`): Node over fake-indexeddb, through the library, writes
    `src/fixture/fixture.json`: users, vault rows, Hero's two cache snapshots, and planted rows (Nolo's bank; a box at
    `login` for Hero and Thierry).
  * Tests: one per button per form tab (10), Reset (1), the fixture unlocks (1).
* **Decisions made**:
  * **Switching users and Reset reload the page**, never a `key` remount: a remounted provider leaves the old device's
    watch and persister writing; a reload ends them. Reset loads the fixture on the *next* page, before it makes a
    device, so this page's persister cannot write over it. Not a guard: just the order a reload gives.
  * **The fixture is the raw IndexedDB rows**, dumped by the script and written back raw, so Reset never goes through
    the app's device. A planted row is a diff of rows before and after one more write.
  * **Exists for a box needs the minder to have heard "none"**: `NewBoxTab` observes `useBox('login')`, so the planted
    box is unknown to it and the put cites a shell (`stale_write`). Without the observation, `putBoxOnce` would fetch
    first and overwrite the planted box.
  * **New Box is `putBoxAction`**, the add-a-box path both demos use, not `useDraft`: so Dismiss has no prompt
    counterpart, and the table says so. `useDraft.put` would have one (it waits for the unlock form).
  * **Login's buttons are never disabled** until strong, against the kit's advice, so Weak can be pressed; the birth's
    own re-judge is the real check. Login's Dismiss is a form reset, there being no library back-out for a birth.
  * **The host's own checks**: both forms refuse mismatched confirmations; New Box refuses a password whose shown
    verdict is not strong.
  * **No kit form would have served**: `CreateVaultForm` has one submit, disabled until strong.
* **Deviations**:
  * The copied `eslint.config.mjs` allows devDependencies in `scripts/**` too (one line).
  * A third tsconfig project, `tsconfig.scripts.json`, for the script: Node's types and the DOM's.
  * Dependencies: `idb-keyval` (runtime; already idb-lean's) and `fake-indexeddb` (dev; already idb-lean's).
  * No onBadNews of the dojo's own: the device's default warns on its logger; the persisters' failures go unheard.
* **Discoveries**: see dojo-findings.md. The surprises: every Login refusal loses the username; Exists on Login
  leaves the stage `unborn`; `stale_write`'s message is its kind.
* **For the Coach**:
  * **"New Bank" read as "New Box"**, as the orchestrator directed: the tab is labelled New Box.
  * **"DeviceDB"**: the new core has none; Inspect shows the persisted cache in its place.
  * **Not looked at in a real browser**: no headless browser here. The dev server starts and serves every module
    transformed (curl), and the build passes.
