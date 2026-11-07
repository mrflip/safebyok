# Thread 6, third rework: exports a signature names (2026-11-07)

Branch `20261107-docblock_trim`, PR #592. Read by whoever files or reviews the branch; the changeset carries the list.

* **Built** (the third reviewer's minors, then the Coach's "add any exports that are reasonable")
  1. `PassphraseSaltBytes` is a value export of `safebyok` and `safebyok/browser` (tests in `index.test.ts`, `browser.test.ts`).
  2. `GuardedKeyDeriver.salt_bytes` is `typeof PassphraseSaltBytes`, as `KeyDeriver`'s is.
  3. The changeset says a host's plain-object deriver needs `salt_bytes: 16 as const` or a `KeyDeriver` annotation.
  4. An audit of the entry points, by a TypeScript-compiler script that walks each export's public signature and `{@link}`s
     for source types no entry point exports. Added, all types, no new values:
     - `safebyok`: `Gatingkind`, `LockState`, `BankStage`, `BankScope`, `Boxscope`, `Sidecar`, `FetchOpts`, `TimelyOpts`,
       `BoxPut`, `BoxPatch`, `BoxHalves`, `ClearsForGatingkind`, `VaultForGatingkind`, `WayinHeader`, `Capacity`, `Awaitable`,
       `GoodOutcome`, `BadOutcome`, `RefusalFamilyForKind`, `RefusalMeta`, `VaultErrorOpts`.
     - `safebyok/storage`: `Damagekind`, `Story`, `ConsistencyRefusal`, `RefusalFamily`, `RefusalFamilyForKind`.
     - `safebyok/dom`, `safebyok/utils`, `safebyok/testing`: nothing missing that is not at another entry (`testing` is test-only).
* **Set aside (borderline)**
  - The collaborator classes `Gate`, `Lease`, `Wayin`, `Storable`, `VaultListing`, `BoxListing`, and the plumbing only they and
    `Vault`/`Box`'s public `world`, `listing`, `gate` members name (`VaultWorld`, `BoxWorld`, `CipherCtxRecord`,
    `SealedWhisper`, `Fetched`, `BoxPatchGiven`, `LaunchArgs`, and below them the `Lease*`/`Wayin*`/`Storable` reconcile types, about
    forty). Hosts read snapshots (`getSnapshot()`), never these; exporting them freezes the internals under semver. The Coach may
    overrule; the audit script's output shows the closure.
  - `VaultRecord`, `VaultSparse`, `BoxRecord`, `BoxSparse` and the `VaultDBVerbs` row/answer types stay on `safebyok/storage` only,
    the front door being kept off the adapter contract (the header of `storage/index.ts`).
  - `IdbDeviceDB`'s types (`LeaseRow` and the rest) are exported at `safebyok`/`safebyok/storage`; not repeated on `/browser`.
* **Suppressions**: none added.
