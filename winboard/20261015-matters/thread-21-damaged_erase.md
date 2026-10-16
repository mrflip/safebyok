# Thread 21: damaged_erase (2026-10-16)

Branch `20261016-damaged_erase`, PR [#115](https://github.com/mrflip/safebyok/pull/115), stacked on
[#114](https://github.com/mrflip/safebyok/pull/114), the top of the line main → #98 → #97 → #105 →
#106 → #107 → #108 → #109 → #110 → #113 → #114 (`6c8aa59`). Justify: green, every package (core 1295
+ 22 skipped, react 107, demo 153 + 11 skipped, indexeddb 139 + 9, postgres 217 + 9, convex 327 + 18,
graphql 205 + 9, argon2-wasm 44, root 123); `pnpm size` within every budget. Rebased at filing: the
conflicts (`idbVaultDB`'s erase, now over #109's `boxRange`, the battery's 3.5 group, `security.md`)
kept both sides.

* **Built**: the Coach's "yes" to a way to clear a vault `openVault` refuses as `damaged_bundle`.
  - `eraseDamagedVault(opts)` in `vault.ts`, exported with `EraseDamagedVaultOpts`: takes
    `openVault`'s options (names, `vaultDB`, `deviceDB`, `validators`), erases the vault through the
    VaultDB, then the device's remembered unlock, and nothing else. Misuse is refused before storage
    is touched.
  - `VaultDB.eraseDamagedVault(scope, validators?)`, a new public verb on the base class (adapters
    inherit it; they implement nothing): reads the bundle through `doReadBundle` as stored; none
    stored is quiet; one that reads sound is `bad_option` with nothing erased; otherwise takes the
    record's `vault_id` and aims `doEraseVault` at it, so a vault made anew meanwhile survives as
    `stale_write`. A record too damaged to show a `vault_id`, or an adapter that validates before it
    hands the record up, is `damaged_bundle` ("too damaged to say which vault it is"), nothing erased.
  - `localVaultDB` and `idbVaultDB` (`vaultIdMeetsExpectation` in `expectations.ts`) now erase a whole
    vault on the `vault_id` alone. They had also required a finite `unlock_epoch`, which kept exactly
    a vault damaged in its epoch from being erased by any route. VAULTDB.md 3.5 already said
    `vault_id` only. Lockbox writes and `eraseBox` still need the epoch.
  - `safebyok-react`: `useVault()` hands down `eraseDamagedVault()` (opens again after; does nothing
    unless `openError` is `damaged_bundle`; rejects with storage's refusal leaving `openError`).
  - Demo: the dashboard's damaged-vault message gains "Erase and start over" (confirm first);
    `OutageVaultDB` hands `eraseDamagedVault` on to its inner adapter.
  - Docs: core README (new *A vault that cannot be opened*, the `damaged_bundle` row), React README,
    VAULTDB.md 3.5, `notes/security.md` (new entry), changeset (minor core and react, patch indexeddb).
  - Battery: `VaultDBVerbs`, `perUser` and the test `servingOnly` carry the new verb; line 3.5 gains a
    case (a sound vault is refused, none stored is quiet).
* **Decisions taken**:
  - **A VaultDB verb, not a core-side read.** The erase needs the damaged record's `vault_id`, which no
    public verb gives (`readBundle` refuses the record); only the base class sees `doReadBundle`'s raw
    answer. So the soundness check, the id and the erase live in one place with the adapter's own
    atomic `doEraseVault`.
  - **Sound is `bad_option`, not a new kind**: calling the hatch on a vault that opens is the host's
    mistake, and no new error kind is public surface for it.
  - **No bundle stored is quiet**, and the remembered unlock is still cleared: a call that failed at
    the device after the vault went can be made again.
  - **Vault first, device second.** A sound vault refuses before the device is touched; a retry after
    a device failure finds the vault gone and still clears the device.
  - **React: in context, not a hook of its own.** The provider already holds every option the erase
    needs; the dashboard has none of them.
* **Review follow-up** (the review came back `flagged`; the orchestrator's directive):
  - **Newer is not damaged.** `mayBeNewer` in `vault-db.ts`: a `format` this build does not know (of
    any type), an unlock `method` it does not know, or more than `MaxUnlocks` unlocks is refused as
    `damaged_bundle` ("may have been written by a newer version ... update the app"), nothing erased.
    Reused the kind rather than add one; a host cannot yet tell the two apart by kind, only by
    message, and `openVault` still calls both `damaged_bundle`. Tests: each case in the base class,
    and a newer-format vault through `eraseDamagedVault`.
  - **The rule**, recorded in `notes/security.md`, the core README and the changeset: any change to
    the stored shape bumps `format`. For the Coach to confirm.
  - React reopens after `bad_option` (reads sound) or `stale_write` (made anew), and still rejects.
  - Not routed through `RefusalPolicy.heed`: no handle, no key in memory, `whenIdentityRevoked` has
    nothing to act on; documented in the doc block and security.md.
  - **Second review (clean, no commits), minors**: the erase aims at `vault_id` only; a missing
    `format`, non-array `unlocks` or non-string `method` counts as damage, not newer; the provider
    reopens on any `bad_option` from the erase, misuse included; "may be newer" shares
    `damaged_bundle` with "too damaged to name". The rule above is worded broadly on the review's
    point: it covers every check the schema makes, not only which fields exist.
  - **Review, minor, left**: the erase aims at `vault_id` only (pinning the exact record would change
    3.5); "too damaged to name" shares the `damaged_bundle` kind; a local bundle that is not valid
    JSON cannot be cleared (`readJson` refuses it as `corrupt_record`, which the hatch says as "too damaged to name"); `vaultIdMeetsExpectation`
    repeats `vaultMeetsExpectation` in part; `isSoundBundle`'s try/catch.
* **Deviations**: none. Pulled forward from no later thread.
* **Discoveries**:
  - The in-tree KV adapters compared `unlock_epoch` on every expectation, erase of a vault included
    (above): a damaged epoch made the vault unerasable even by an adapter-level `eraseVault`.
  - Convex, Postgres and GraphQL cannot reach the damaged-bundle hatch: Convex and Postgres store
    typed rows that a damaged bundle cannot be, and GraphQL's server validates before it answers, so a
    damaged row there is the backend's own to clear (the hatch says so, `damaged_bundle`). Not proven
    against those adapters: the battery cannot plant damage.
  - A `VaultDB` that wraps another's public verbs (the demo's `OutageVaultDB`) must hand the new verb on
    too, or its `doReadBundle` meets the inner refusal and the hatch says "too damaged to say which
    vault it is". Documented on the verb and in VAULTDB.md; the in-tree wrapper does.
* **For the Coach**: new public surface, for the PR's open questions: `eraseDamagedVault` and
  `EraseDamagedVaultOpts` (core), `VaultDB.eraseDamagedVault` (a public verb on the base class, so a
  wrapping adapter owes it), and `useVault().eraseDamagedVault` (React). Also: (0) confirm the rule that any change to what a stored record may hold -- a field, a shape, or a range a check accepts -- bumps `format`; (1) is "sound is
  `bad_option`" right, or does a refusal of this kind want its own kind? (2) the demo's confirm text
  and button are placeholders for the Coach's wording.
