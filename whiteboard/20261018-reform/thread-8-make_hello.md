# Thread 8: make_hello (2026-10-18)

Branch `20261018-make_hello`, PR [#166](https://github.com/mrflip/safebyok/pull/166), stacked on #165 (line main →
#159 → #160 → #161 → #162 → #163 → #164 → #165). Justify: green -- core 2154 passed | 35
skipped; react 221; indexeddb 135 | 10; convex 258 | 8; postgres 246 | 14; graphql 239 | 14;
fastkey 49; demo 191 | 16; e2e 81 | 89; root scripts 258. Security note: one new 2026-10-18 entry
(through a `sonnet` subagent).

* **Built**: `openVault(opts)` is gone, no alias. `Vault.make(opts): Vault` (synchronous) checks
  every option, refuses any it does not take, builds the handle and starts `vault.hello()`, which
  reads the vault props (`refresh`) and the lease (`takeUpLease`) and settles the snapshot.
  `hello()` is memoised; the snapshot gains `trouble: VaultError | null`. `OpenVaultOpts` is
  `MakeVaultOpts`; the logger's `VaultCall` labels `'openVault'` → `'make'` (the test-deriver
  notice) and `'hello'` (an unreadable lease; make's own hello refused). React `VaultProvider`
  makes the vault with `Vault.make`. `TH.settledVault(opts)` (make, then await hello) in
  `safebyok/testing`. Every doc block, README, `VAULTDB.md`, demo, e2e and adapter test follows.
  `.size-limit.json`'s entry is `Vault` (`{ Vault }`), limit unchanged. Changeset `minor`, seven
  packages.
* **Decisions taken**:
  * **One name, type and value**: `export const Vault = { make }` beside `export type Vault`, not
    a namespace: `@typescript-eslint/no-namespace`, a namespace is a TS-only construct, and a
    plain object tree-shakes. `import { Vault }` brings both. Not frozen.
  * **"First step"** is read as: after the synchronous argument checks, so misuse is refused at
    once rather than after a wait. `unlock` and the wayin changes note their start (`noteStart`)
    before awaiting hello, so a lock during the wait wins, as their docs promise.
  * **Who does not wait**: `lock()`, `lockSoon()`, `close()` (and `getSnapshot`, `subscribe`). A
    lock must win at once with storage unreachable. `retire()` waits (it needs storage anyway).
    A lock landing while hello reads the lease wins: `takeUpLease(forgetsThen)` checks a new
    counter `forgetsSoFar` (every shut and every `lockSoon()`), noted before the vault props are
    read. Tests hold `readLease` and lock, and lockSoon, meanwhile.
  * **Memo**: `greeting` (the promise) and `greeted` (it resolved). A refresh failing while a
    hello is in flight does not reset it (callers share it; its own failure clears it); a
    resolved memo resets on a failed read (`readStorage`), on an untrusted-storage refusal from
    any call (`heedRefusal`, kinds `UntrustedStorageKinds`, which is the old
    `CatchUpPassesThrough` renamed, one list for both uses), and at the end of `retire()`.
  * **trouble** is set by any failed read (refresh or hello) and cleared by any read of storage
    that succeeds; it records VaultErrors only (every failure on the path is one; a stray
    non-VaultError leaves it as it was, and react sends that to the boundary). `syncing` keeps
    its meaning. `bump` compares `trouble` by identity: two refusals of one kind are equal JSON.
  * **A storage ring while no hello has succeeded runs `hello()`**, not a bare refresh, so a vault
    whose first hello failed settles with its lease taken up when storage relents.
  * **`takeStorage` takes up vault props, mark and listing together**, after `listBoxes`: a read
    failing at the listing would otherwise have left a first hello `locked` with no lockboxes
    beside a `trouble`. The key drop for vault props changed elsewhere still comes first.
  * **Unknown options**: `Z.strictObject` of `Z.optional(Z.unknown())` per option (`satisfies
    Record<keyof MakeVaultOpts, ...>`); the message names each unknown key (field names, never
    values) and, from `RenamedMakeVaultOpts` (one row, `forcePassphraseReentryHours` →
    `leaseHours`), its new name.
  * **React**: the handle is handed down at once (state `opening`), not null until opened;
    `openError` is derived, `useSyncExternalStore` over `snapshot.state === 'opening' &&
    isVaultCondition(snapshot.trouble)`; `retryOpen()` and `retireDamagedVault()` call `hello()`
    on the same handle (`openAttempt` is gone); a hello refused as misuse (or with no VaultError)
    goes to the boundary. Props `Vault.make` does not take are forwarded by name (a JSON list of
    names as the effect's dep), so they are refused to the boundary rather than dropped:
    `forcePassphraseReentryHours` on the provider was as silent as on `openVault`.
  * make's own hello, refused, warns once through the logger (`{ call: 'hello' }`), and says
    nothing for a handle closed meanwhile (React StrictMode closes one at once).
* **Deviations**:
  * A refused hello no longer closes the handle's storage watch: the handle stands for a retry.
    The "a failed open" tests became "a hello that fails"; the logger's `error` for an
    unsubscribe that threw on a failed open is gone.
  * After an untrusted-storage refusal, the next call says hello afresh and meets the refusal
    again (`rolled_back`, `identity_revoked`) instead of `vault_locked`; three tests (core, convex,
    e2e) now say so.
  * `whenIdentityRevoked` (a retired option a test passed to show it was ignored) is now refused
    by `Vault.make`; the test asserts the refusal.
  * One suppression: `eslint-disable-line react-hooks/set-state-in-effect` on the provider's
    `setOpenFailure` when `Vault.make` throws in the effect (the handle is the effect's to make
    and close; make answers synchronously, so there is no callback to set state from).
* **Discoveries**:
  * **Fixed in review: a lock was undone on its own handle.** A `lock()`, `lockSoon()` or
    untrusted-storage lock whose lease erase failed, then a failed read (resetting the memo), let
    the next call's hello take the lease up and hand back a whisper with no passphrase:
    `forgetsSoFar` was compared only within one hello. Now a handle takes up a lease only while it
    has never forgotten one (`forgetsThen === 0`, checked in `takeUpLease`); a lease the lock
    could not erase is left for the next page load, as before this thread. A handle whose first
    hello failed still takes its lease up; an unlocked one loses nothing. Regression tests for the
    three locks; the security note's entry amended (through a `sonnet` subagent).
  * A hello that fails at the lease step (the device store refusing `readLease` or `eraseLease`)
    settles `absent`/`locked` with `trouble` set, not `opening`: the `trouble`, `hello()` and
    `Vault.make` docs and the README say so (no restructuring of the take-up).
  * `forcePassphraseReentryHours` survives in `RenamedMakeVaultOpts` and its tests: thread 10's
    grep (thread 6's pattern) meets it. An allowed survivor until 1.0, like *Old names*.
  * `scripts/size-budget.ts`'s usage message named `--add openVault=1.5`; now `Vault`.
  * Size: `Vault` 27.88 kB of 31 (was 27.45 at thread 2), `everything` 35.15 of 38,
    `VaultProvider` 4.73 of 6.8.
* **For thread 9**: `TH.settledVault({ ...opts, deviceDB: memoryDeviceDB() })` twice over one
  `vaultDB` gives two devices; its second `@example` is that.
* **For the Coach** (the PR's *Open questions*):
  * **Provider's vault while opening**: `vault` is now non-null while opening, and `retryOpen()`
    no longer clears `openError` while the retry runs (it clears when the vault settles).
    Recommend keeping both.
  * **Suppression**: the `set-state-in-effect` disable above (its reason now on the line, by the
    reviewer). CLAUDE.md pre-approves only `no-param-reassign`/`no-explicit-any` disables, so
    this one awaits the Coach's yes; the reviewer found no clean alternative (making in render
    doubles side effects under StrictMode; a microtask brings back a late handle).
