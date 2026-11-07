# Thread 5: demo, managed fields (2026-11-07)

Branch `20261107-demo_fields`, PR #TBD, stacked on [#579](https://github.com/mrflip/safebyok/pull/579)
(thread 9, browser batteries). Justify: green; safebyok-react 194 passed, the demo 62 passed.

* **Built**:
  * **The page** (`demos/safebyok-demo-react/src/App.tsx`): the Knock-Knock Machine. A header
    (title, blurb, `SessionBar`), then `<div className="flows">`, an auto-fit grid where flow 3
    (`KnockKnockFields`) sits now and threads 6 and 7 drop `KnockKnockExposed` and
    `KnockKnockSealed` beside it; then `<aside className="dev-tools">`, *Behind the scenes*,
    holding the outage switch, the slot for thread 8's Dev*Inspector panels. `App` calls
    `useSession` once and hands the session to `Page` and `SessionBar`.
  * **`KnockKnockFields`**: `useBox('main', 'anthropic_api_key')`, `BoxWhisperField path="apiKey"`.
    *Add key*/*Edit key* runs `bank.ensureVault` -> `vault.ensureUnlocked()` -> `vault.putBox({
    boxlabel, whisper: {} }, { ifPresent: 'get', ifAbsent: 'add' })` -> `box.expose()` (skipped
    when already exposed). *Save* is `BoxFields.of(box).save()`; *Done* is `box.unexpose()`.
  * **`KnockForm`** (`src/components/KnockForm.tsx`): the shared knock half, "Who's there?",
    *Knock*, the punchline, handed `apiKeyOf: () => Promise<string | null>` and `isReady`. Threads
    6 and 7 should reuse it, each passing its own `apiKeyOf`.
  * **`AccountMenu`**: `VaultLockControl` (which carries Create vault), Sign out (locks, then signs
    out), Delete account, and `WaysIn` (passphrase, passkey, fingerprint button) under it.
  * **Storage** (`src/lib/stores.ts`): `{ ...browserOpts({ dbName: Applabel }), applabel,
    device_id: deviceIdOf(), vaultDB }`. `deviceIdOf` mints a `crypto.randomUUID()` once into
    localStorage (`safebyok-demo:device_id`). The MemoryDeviceDB and character-counting
    strength checker are gone.
  * **Outage switch** (`src/lib/outage-vault-db.ts`, `src/components/OutageSwitch.tsx`):
    `OutageVaultDB extends IdbVaultDB`, overriding the nine `do*` hooks but `doWatch` to throw
    `storageUnavailable(...)` while off; a `subscribe`/`getSnapshot` pair for the checkbox.
  * **Fake auth** over `src/lib/local-store.ts` (`localStore(prefix)`, a `StringStore`); the demo
    no longer imports or depends on `safebyok-old`.
  * `src/lib/refusals.ts`: `isQuietRefusal` (`declined`, `locked_while_asking`), used by every
    handler.
  * **Ride-alongs, `packages/safebyok-react`** (changeset, patch): `useRevealToggle(show, hide,
    isFieldShowing = true)` drops back to hidden in render when its field hides (never by
    remounting the input), and `BoxWhisperField` passes `box.isShowing`. `VaultLockControl`'s
    Unlock calls `vault.tryEnsureUnlocked()` on the vault in hand.
  * **Tests**: the demo's for each new piece (`KnockKnockFields`, including one under
    StrictMode; `AccountMenu`; `OutageVaultDB`; `localStore`; `deviceIdOf`/`bankOpts`; App's
    outage round trip); safebyok-react's for the reveal reset (lock, veil) and the Unlock.
* **Decisions taken**:
  * **A knock reads the saved whisper** through `vault.getBox(Boxlabel, { ifAbsent: 'nil' })`,
    exposing it if hidden, never `putBox`: a knock with no key builds no empty box, and an
    unsaved edit in the field is not what is sent. Exposing at a knock shows the field (masked).
  * **Knock is disabled until the bank is ready**: a knock before `bank.hello()` settled refused
    "This bank isn't ready".
  * **Delete account** confirms with `confirm()` only on the unborn path; for a present vault
    `vault.tryDelVaultPrompt()`'s dialog is the confirmation. A `waiting` vault gripes.
  * **The auth clock-range check is gone**: `newAccount` stamps `Math.floor(clock.now())` and
    the `BadClockCases` test went with it. It guarded a scaffold nobody ships.
  * **App.test's mock** overrides `browserOpts` (keyDeriver -> `testDeriver`): `browserOpts`
    reaches Argon2id by its own binding, so the old `argon2idWebV1Deriver` override did nothing.
* **Discoveries**:
  * Building a vault from `bank.ensureVault` asks for the passphrase *before* it reaches storage,
    so with the outage switch off, Add key shows the dialog and then the outage gripe.
  * The StrictMode first-Add race I feared (the field's ref detached between React's two mounts,
    unexposing) does not show: covered by a test.
  * `useRevealToggle` is not exported from safebyok-react's index, so its new argument is no
    surface change: patch.
* **For the Coach**:
  * No new dependencies; `safebyok-old` dropped from the demo's package.json.
  * No `eslint-disable` or `@ts-expect-error` added.
  * Whether *Behind the scenes* as an aside is the shape thread 8 wants for the inspectors.
