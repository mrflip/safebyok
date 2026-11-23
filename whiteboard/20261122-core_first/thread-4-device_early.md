# Thread 4: device_early, a device that exists before its user (2026-11-22)

Branch `20261122-device_early`, PR #846 (draft), stacked on #844 (cut from `20261122-bank_minder`).
Paused while the Coach reworked thread 2's design, then resumed on #844's rebuilt `Minder` (f5d6f9b3d) and rebased onto it.
Proved: `pnpm --filter safebyok test` 33 files, 1486 tests; `pnpm --filter safebyok-react-lean test` 23 files, 304 tests;
lint and typecheck clean in both. `pnpm justify` after the catch-up: see the PR's **Tests:** line.

* **Built**:
  * `Device.make(record, opts)` (`packages/safebyok/src/models/device.ts`) makes a device with nobody signed in. The record is
    `{ banklabel?, device_tok }`, the banklabel `'main'` when left out (`DefaultBanklabel`). Construction does no I/O, touches no
    browser global (the secure-context check moved to `hello` and `signIn`) and subscribes to nothing. It makes two clients,
    empty: the roots' client (`BankMinder.makeClient()`), kept apart so the gate's wrapped bankKeys stay out of what a host
    observes, and the vault cache's client (`device.queryClient`, `VaultMinder.makeClient()`).
  * `device.hello()` starts the device and resolves at once. It has a comment marking the place where thread 6's restore goes, before anything
    speaks to the vaultDB. `signIn` awaits it, so thread 6's restore orders itself ahead of the first fetch and watch.
  * `device.signIn(userid)` is the verb that tells the device who is signed in. It sets the user, makes that user's BankMinder
    on the roots' client and VaultMinder on the vault client, shows `'starting'`, says `hello` to both (a watch each), and
    brings up the bank: from `bankMinder.worldAt()` where a live world is cached (stage `'locked'` at once, unlock on the
    cached gate), then from `bankMinder.fetchWorld()`. A fetch that fails once the bank is up
    from the cache goes to `onBadNews`, and the bank stays usable. It resolves once the stage shows `'locked'`, `'unborn'` or `'failed'`,
    and never rejects. Every later call answers the first call's promise.
  * The stage reads `'signed_out'` (`SignedOutBank`, now exported by the core) until `signIn`. `device.scope` and
    `judgeStrength` refuse `absent_vault` (`Throwers.nobodySignedIn`) until then, and so does `device.bankMinder`.
    `birthGating` refuses `disabled`. `device.userid` and `device.minder` are null until then.
  * `Device.make`'s `queryClient` option is gone. `Minder.makeClient` stays: the device and the shared-client tests (#831's) use it.
  * The giver (`packages/safebyok-react-lean/src/giver/react-giver.tsx`) makes the device in a `useState` initializer at
    the provider's mount. Hooks observe `device.queryClient` from their first render. A mount effect calls `hello()`, and the
    `[userid]` effect calls `signIn(userid)` and sets the signed-in state that `shownOf` reads. `ProviderMount` and `makeProviderMount` are gone.
    The calls outside hooks read the mounted device, and refuse while nobody is signed in on it.
* **Decisions made**:
  * Verb name `signIn`: it pairs with the stage `'signed_out'` and with the `signOut()` in where-data-lives. VOCABULARY.md has no
    entry for it yet.
  * `device_tok` stays the host's, given at `Device.make`, per `DeviceTokShape` ("kept by the host for this device"). The giver
    mints it with `crypto.randomUUID()` in the mount initializer. That runs in render now, on the server too. Node has
    `crypto`. An http page, which has no `randomUUID`, now fails in render, where it used to fail in the effect.
  * `device.bankMinder` refuses before `signIn` where `device.minder` is null: a bank, its gate and their gatings exist only
    once someone is signed in, and read the BankMinder unchecked, as do the giver's gate hook on a shown device. The giver and
    the tests test `minder` for presence. A reviewer may prefer one shape for both.
  * The cached-world tests seed the roots' client as a restore would (`setQueryData` on `BankMinder.itemQueryKeyOf`), the client
    caught from a spy on `BankMinder.makeClient`: no getter for that client was added.
  * TH.makeDevice (`tests/test-helpers/models-world.ts`) signs in as WorldScope's user, unless handed `{ userid: null }`. Tests
    `await device.signIn(...)` where they awaited `hello()`.
* **Deviations**:
  * The banklabel is the record's, with `'main'` as the default, not fixed to `'main'`. The giver's config, its tests and the
    knock and envman demos name their bank (`'acme'`, `'knock'`). Fixing it to `'main'` is a change to the React layer and the
    demos. That is beyond this thread.
  * The provider's `vaultDB` and `keyDeriver` props are read at its mount, not at its first userid. The props' docs say so.
  * The React tests count devices *made* where they counted devices started. Under StrictMode, two are made and one signs in
    (two watches, one per minder). A server render makes one, and it signs nobody in.
  * Ruling 3 (the stage waits for the restore) is not built. `hello()` resolving is the seam for it.
* **Discoveries**:
  * A different user handed to `signIn` is answered as the first: no guard, per the end-state rule. The giver already shows
    `'starting'` under a userid other than its device's.
* **For the instance-sync thread** (the Coach, 2026-11-22): the Gate does not read its gate from the BankMinder's world, and the
  stage does not follow the world. Both are read where they were read before. Not built, per the directive.
* **Discoveries, for thread 6**: the restore lands in the two clients the device makes at construction, before `hello`
  resolves; a BankMinder made at `signIn` then reads it through `worldAt()`, since an item set in the client before the minder's
  `hello` is read as cached. VOCABULARY.md's **device** row ("Durable across a signed-in user's session") predates a device that
  exists before its user, and it has no row for `signIn`: drift to suggest, not edited here.
* **For the Coach**:
  * Security note written (`notes/security.md`, 2026-11-22, device_early): `signIn` brings the bank up, and unlocks, on a cached
    gate before the vaultDB confirms it.

End states, for the final report:
* A different userid handed to `signIn`, or to the provider, is a sign-out. The device answers the first call's promise and changes nothing.
* A fetched world of another life, or with no live bank, landing after the bank came up from the cache, is a bank delete or create elsewhere. The device keeps the bank it brought up.
