# Thread 3: tuple_ckeys (2026-10-15)

Branch `20261015-tuple_ckeys`, PR [#92](https://github.com/mrflip/safebyok/pull/92), stacked on
[#83](https://github.com/mrflip/safebyok/pull/83). Justify: green (root 123, safebyok 901,
safebyok-react 51, safebyok-convex 270, demo 125). `pnpm size` within budget.

* **Built**
  - `packages/safebyok/src/ckeys.ts`, imported as `Ckeys` and exported from the main entry:
    `bundle(scope)`, `box(scope, boxlabel)`, `unlock(scope)`, `boxPrefix(scope)` and
    `isBoxIn(scope)` (a predicate for `.filter`). Each ckey is `JSON.stringify([kind, applabel,
    user_id, vaultlabel(, boxlabel)])`, with kinds `vault`, `box` and `unlock`.
  - `vault-db.ts` (`localVaultDB`), `idb.ts` (`idbVaultDB`, `idbDeviceDB`) and `device-db.ts`
    (`memoryDeviceDB`) call it. `scopePath`, `bundleCkey`, `boxCkey`, `isBoxCkeyOf` and both
    `unlockCkey`s are gone.
  - `idbDeviceDB.eraseAll()` is now `clear()` on the device shelf, which holds only unlocks.
  - Tests: `tests/ckeys.test.ts`, and a `describeVaultDB` case (every adapter, Convex and the demo's
    included) for user ids differing only by `:` `"` `\` `,` `[` `]`. Old-format rows read as
    absent, tested for `localVaultDB`, `idbVaultDB` and `idbDeviceDB`. `MapVaultDB` (the
    "smallest honest adapter" in `vault-db.test.ts`) now uses `Ckeys`; its `/`-join was ambiguous.
  - The README has *Your own storage adapter*. There is a `notes/security.md` entry and a
    changeset (minor, stored format).
* **Decisions taken**
  - **JSON text everywhere, not IndexedDB array keys.** One encoding. `IdbRow.ckey` stays a
    string, and the demo's inspector panels stay readable. Array keys with a key range list faster
    only on a crowded shelf: 0.38 ms against 3.9 ms at 2,020 rows, and 0.10 ms against 0.25 ms at
    105 rows. A device shelf is small.
  - **Prefix only, no `JSON.parse` on listing.** The prefix is unambiguous on its own, because
    JSON string tokens are self-delimiting and our only `box` tuples have five elements. A
    listing never parses a ckey.
  - **`Ckeys` is public**, as a namespace. It gives adapter authors one place to call, and thread 4
    one function per kind. That costs `everything` 0.10 kB. `openVault` is unchanged.
  - **Kind first in the tuple**, so a vault's boxes share a prefix and kinds never mix.
* **Discoveries**
  - The measurements are in the PR body: bytes, and the memory and fake-indexeddb listings at 101
    and 2,020 rows. The method was a scratch Node script. It filled a `memoryStore`-like Map and
    an idb-keyval store with N vaults × M boxes under each encoding, then timed one vault's
    listing: a `:`-join with its no-colon check, a JSON prefix, `JSON.parse` of every ckey, and
    array keys with `getAll(IDBKeyRange.bound(prefix, [...prefix, []]))`. It wasn't committed:
    the root lints every `.mjs`.
  - A colon-join fails 10 of the 27 `ckeys.test.ts` cases (checked by mutating `encode`).
  - The demo's own fake auth (`demos/.../lib/auth.ts`) still uses `account:${applabel}:${userlabel}`.
    That's the demo's grammar for its own accounts, not a vault ckey. Left alone.
  - **For thread 4**: nothing in the ckeys needs a floor. Names are encoded as given, never
    normalized, so `é` and `e` + U+0301 are two vaults (and two cipher bindings): a validator must
    *check*, never transform, or the ckeys move too. `describeVaultDB`'s new case varies only
    `user_id`, because labels are still gated. Once thread 4 lifts the gate, add label cases to it
    (a vaultlabel or boxlabel holding `:`, `"`, `\`, `,`, `[`, `]`).
    `tests/ckeys.test.ts` already covers every position at the encoding level.
* **Review follow-up (YOLO, the orchestrator's directive)**: old remembered unlocks are swept.
  `idbDeviceDB`'s `readUnlock` and `eraseUnlock` run `keys()` on the device shelf and `delMany`
  every ckey that `Ckeys.isUnlock` (new) refuses. No old value is ever read, and a test spies on
  `IDBObjectStore.get`, `getAll` and `openCursor` to prove it. The sweep runs at an open that
  finds the vault, or at any lock. Under `idbVaultDB` or `localVaultDB` the first open after an
  upgrade finds no vault and reads no unlock, so the old row waits for the first lock or the next
  open after an unlock. Either way, `lock()` still forgets every unlock on the device.
  `memoryDeviceDB` keeps nothing past the page and needs no sweep. The second review (d1b8549,
  b6a48a1, 82fc581, dd1ffa2, 8ae0dc2) made four changes. `eraseUnlock` now deletes the scope's own
  unlock before sweeping. The sweep rings the device shelf's bell. The `eraseAll` test proves
  something again. The doc blocks of `isUnlock` and the sweep now say what they do. `isBoxIn`'s doc block states its invariant: every `box` tuple has
  exactly five elements.
* **For the Coach**
  - The old `unlock:…` rows no longer linger. They are swept unread at an open that finds the
    vault, or at any lock (above). Old vault rows hold only ciphertext and stay, and the changeset
    says how to wipe them.
  - Four minor points from the second review are open on the PR:
    - the sweep's timing: should `writeUnlock` sweep too, so the first unlock after an upgrade
      clears the old row at once?
    - a `keys()` call on every read and erase;
    - two versions of the package open at once on one origin would evict each other's unlocks;
    - the sweep is permanent code that exists only for an old shape.
  - Upgrading a host on `idbVaultDB` or `localVaultDB` strands its users' vaults. They read
    `absent`, and the next unlock makes a new, empty one. That is per the plan, and the changeset
    says so plainly.
