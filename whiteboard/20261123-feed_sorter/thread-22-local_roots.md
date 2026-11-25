# Thread 22: local_roots (2026-11-24)

Branch `20261124-local_roots`, PR [#888](https://github.com/mrflip/safebyok/pull/888), stacked on [#887](https://github.com/mrflip/safebyok/pull/887). Proved: see the
PR's **Tests:** line (`pnpm justify` in full).

Built by hand (no /sprint), two pieces, E first, each its own commits.

* **Built**:
  * **E**. The giver's four gate form verb makers call `demandBankOrVacate(params)`, beside `demandBank` in
    `react-giver.tsx`: where `demandBank()` refuses, `vacateHanded(params)` clears what the verb was handed, and the same
    refusal is thrown. One test (`demandBank`'s) decides both. `World.vacateUnlessAttemptable`, the friend's `deviceNow`,
    and the friend's `demandBank` (the bank's hooks no longer read it) are gone; `vacateHanded` is exported from the core.
    Added by the orchestrator mid-thread: the birth verb (`useBirth`'s maker, `gatingBirthAttempt`) calls
    `demandDeviceOrVacate(params)`, the same over `demandDevice`. `GatingChecks.anyGating` already reads the birth's names
    (`passphrase`, `passkeyAnswer`), and `confirmation` is among `FormSecretFieldnames`, so no check changed.
  * **P**. `Device.make` takes `rootShelf?: RootShelf` (`shapes-bankish.ts`): `Readonly<{ getItem: (ckey) => string | null,
    setItem: (ckey, val) => void, removeItem: (ckey) => void }>`, checked by `isRootShelf`, so a host passes `localStorage`.
    No default; the core and the React package touch no browser global. `src/minding/root-shelf.ts` has the key
    (`safebyok:roots:<banklabel>:<userid>`), the two value functions (`shelvedOf`, `rootsOfShelved`: a JSON array of
    `roots-<ThingFormat>` and the three records whole), `peekRoots`, `stowRoots`, and `guardRootShelf`, which wraps each
    method with `bulletproofHandlerOf` (`ifError: 'tell'`, `Outcome.storageRefusalOf`, to the device's `tellBadNews`).
    The device reads the value at sign-in where the persisters were restored (`#receiveShelved`, sourcelabel
    `'root_shelf'`), checks each root `ThingChecks.sparse.loose()` and hands it to the VaultMinder, and listens where the
    scaffold listened (`#listenShelf`): at each `item` event at a root's labelpath, `stowRoots` puts the three Things'
    records where all are live, or removes the key. The masked view's `bankTSQ` is built from the root Things
    (`maskedRecordRowOf` in `masked-rows.ts`). Removed: `persist-scaffold.ts`, `storage/persister.ts` and its exports, the
    core's `@tanstack/query-persist-client-core`, idb-lean's `IdbPersister` and `persist-shelf.ts` (nothing else used
    them), the dojo's persisters (now `rootShelf: localStorage`, with its fixture, Reset and Inspect reading the shelf).
* **Decisions made**:
  * The option is `rootShelf`: `storage` names the vaultDB layer here, and "shelf" is a word nothing else in the new core
    uses (idb-lean's two `*-shelf.ts` files name its IndexedDB object stores, one of them now gone).
  * E: two plain functions, `demandBankOrVacate` and `demandDeviceOrVacate`, not one helper over a demand: each is four
    lines, and reads at once.
  * E: the world's case that tested `vacateHanded`'s reading (every verb's names, sloppy input, never throws) moved to
    `gating.test.ts` as `vacateHanded(handed)`, since it is now a core export; the other two world cases are deleted.
  * P: a root is checked loose (`Checks.shelvedRoot`) so it reaches the VaultMinder whole: `ThingChecks.sparse.parse`
    strips the body, and the gate came up without its wayins.
  * P: the key puts the banklabel (a label, no colon) before the userid, so the key reads unambiguously.
  * P: the masked rows' `dataUpdatedAt` is the record's `written_at`: a Thing keeps no time it heard a record at.
  * P: idb-lean's `es-toolkit` moved to devDependencies: only its tests use it now.
* **Deviations**:
  * The dojo has no server rendering (`src/lib/session.ts` reads `localStorage` at module scope already), so it passes
    `localStorage` unguarded.
  * Rows removed from `notes/wontfix.md`: "A snapshot write already under way when `removeClient` runs" (`IdbPersister`
    is gone) and "A device's sweep while `signin` restores its caches" (nothing is awaited before the VaultMinder is
    made now). Removed from `TODO.md`: the two persister-snapshot size items. VOCABULARY's **persister** became
    **root shelf**; **bank TSQ** now names the roots as the world's Things have them. `notes/guarantees-drift.md` has a
    G3 entry.
* **Discoveries**:
  * A kept value for a bank with a passphrase alone is about 1.5 kB (1,523 bytes for userid `u1`, banklabel `acme`).
  * `Bank.hostVault` keeps a caller, `Vault.make` (`vault.ts`).
  * The bank's three root labelpaths are listed three times now (`world.ts`, `vault-minder.ts`, `root-shelf.ts`); a
    `Labelpath.isRoot` would serve all three. Left for the Coach.
  * In a server-rendered host, a giver made at module scope must pass
    `typeof localStorage === 'undefined' ? undefined : localStorage`.
* **Test promises changed** (before → after):
  * E, `world.test.ts`: "world.vacateUnlessAttemptable(handed)": three cases deleted; the middle one restated in
    `gating.test.ts` as "vacateHanded(handed) empties a form's secret fields and zeroes each passkey answer, whichever
    verb's names it is in, and never throws". Added in `react-giver.test.tsx`: each gate verb's plain call with no provider
    mounted; the birth verb's hook and plain call signed out, and its plain call with no provider.
  * P, `device.test.ts`: hello "restoring nothing" → "reading nothing from its root shelf". "a device's persisters" (8
    cases) → "a device's root shelf" (9 cases: the roots on birth, the gate's next revision, three values read as
    nothing and removed, another user's key, a damaged root as bad news, a throwing shelf as bad news, refused
    shapes). Deleted with no successor: the boxes restored before the vaultDB answers, the restore that holds the stage at
    `starting`, the boxes' restore failing. The two signin cases over persisters restated over the shelf.
  * P, `record-hooks.test.tsx`: "useBox on a page reloaded over a device's persisters": the box shown from its restored
    record before the vaultDB answers → the bank `locked` from the kept roots before the vaultDB answers, the box once it
    does; "shows the box's restored record while the stage is still starting, where no roots were kept" deleted.
  * P: `persister.test.ts` and idb-lean's `idb-persister.test.ts` deleted with their code.
* **For the Coach**: the open matters in the PR body: the name `rootShelf`; whole records against a tuple of fields; the
  E function names.
