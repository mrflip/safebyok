# Thread 6: boundary_audit (2026-10-15)

Branch `20261015-boundary_audit`, PR [#43](https://github.com/mrflip/safebyok/pull/43), stacked on
[#40](https://github.com/mrflip/safebyok/pull/40) at 868ce73 (moved there from ea3dc98 after the
Coach's restack; a clean rebase). Reviewed: clean. Justify: green (safebyok 312, safebyok-convex
219, safebyok-react 8, demo 24, root 91). No sprint-doc tab (Docs tools disconnected).

## The audit

The rulings' pattern: a value is nulled, defaulted and validated where it crosses into storage,
out of storage or across the public API, and trusted past that.

| Where | Already right | Not right, now fixed |
| ----- | ------------- | -------------------- |
| `Lockbox.note`, read | validated (<= 256 characters), and absent or `undefined` (older IndexedDB rows) both accepted | carried past the read as an optional into the snapshot, an old row even surfacing `note: undefined`. Now `LockboxSummary.note` is `string \| null`, nulled in `listBoxes` |
| `Lockbox.note`, from `store()` | | **not checked at all.** A note over 256 characters was written, then every listing refused it as `corrupt_record`, so `openVault` refused the vault for good (proved on the old code; even `destroy()` is unreachable without an open handle). Now `parseNote` checks it at the door against the same `LockboxNote` schema: `bad_option`, quoting none of it |
| `DeviceUnlock` | no optionals; the in-tree `memoryDeviceDB` and `idbDeviceDB` validate on read | `DeviceDB` is an interface a host may implement, and the vault trusted whatever `readUnlock` returned: a `byok-unlock-v1` record still unlocked, a text deadline became `askPassphraseAt`, `Infinity` never lapsed. The vault now checks it against `DeviceUnlock` and erases one that fails |
| `VaultBundle` | no optionals; read validated with its scope; written only from records the vault builds | |
| `OpenVaultOpts` | `forcePassphraseReentryHours`, `maxWhisperBytes`, `maxLockboxes` defaulted and validated at `openVault` (threads 1, 2); `keyDeriver` required and checked | `clock` is defaulted, not shape-checked: a test seam, left |
| Snapshot, expectations | `askPassphraseAt: number \| null`; `LockboxExpectation.revision_id: string \| null` | |

Boundary, not paranoia: each check sits where a value enters the core from someone else (the
host's `store()`, the host's `DeviceDB`, a backend's listing), and nothing past it re-checks.
`VaultDB`'s write verbs still check only labels and scope: the vault is their one producer. The
in-tree device adapters keep their own read checks, each a public function promising its type.

**Roadmap 3's fields** do not exist yet, and nothing was added for them. When they land:

* `whisper_codec`, `whisper_schema_version`: the stored schema may default them on read
  (`json_v1`, `1`) and the type past `VaultDB` makes them required. The trap: both go into the
  cipher binding, so a lockbox written before them was bound without them, and its binding must be
  rebuilt from the record as written, not as defaulted (roadmap 3 already says "before zod fills
  any default"). Since no vault predates the release, requiring them outright is simpler.
* `public`: exactly `note`'s pattern -- defaulted to `{}` in the summary, whatever was stored.
  Once it is bound, write it always (even `{}`), so an omitted bag and an empty one never bind
  differently; Convex's habit of omitting an absent note should not carry over.
* `expires_at` -> `ask_passphrase_at`: the vault's new check reads an old-named device record as
  none and erases it, one passphrase prompt; no reader is needed.

## What the thread did

* **Built**:
  - `types.ts`: `LockboxNote` (`Z.string().max(256)`), shared by the stored `Lockbox` (unchanged)
    and `LockboxSummary`, which now extends with `note: LockboxNote.nullable().default(null)`.
  - `vault.ts`: `store(boxlabel, whisper, { note?: string | null })`; `parseNote` at entry,
    `noteToStore(givenNote, prev)` after the read: given wins, `undefined` keeps `prev`'s, `null`
    clears. `rememberedUnlock` parses what `deviceDB.readUnlock` returns.
  - Tests: every stored form of a note (types, vault-db, the adapter suite, Convex's included);
    rows byte for byte as `store()` writes today; *the note* and *the remembered unlock, from a
    host's own DeviceDB* in `vault.test.ts`, which fail on the old code.
  - `notes/security.md` bullet; `.changeset/20261015-boundary_audit.md` (named by hand).
* **Decisions taken**:
  - **The stored `Lockbox` schema is untouched**; nulling happens in `LockboxSummary`. A
    two-form `Lockbox` would retype every adapter's `doUpdateBox` and the Convex mirror, so
    `readBox` returns the stored form and `vault.ts` reads `prev.note` only in `noteToStore`.
  - **`null` clears a note.** The input takes what the output gives: a host can hand
    `box.note` straight back. Before, a note could not be removed at all.
  - **`bad_option`** for a bad note, not a new kind; `errors.ts`'s comment widened.
  - **Changeset `minor`, not patch**: a host testing `note === undefined` or `'note' in box`
    behaves differently, and minor is 0.x's breaking bump, as threads 1 and 2 used.
  - What is written is unchanged: no note means no `note` field.
* **Deviations**: outside the listed files, because the type change reaches them:
  `safebyok-convex`'s `validators.test.ts` (a type assertion now against the stored listed record)
  and `vaults.test.ts` (the listing read through `LockboxSummary`, as the core reads it); the
  demo's edit form passes `|| null`, so emptying a note clears it.
* **Discoveries**:
  - A remembered unlock's `expires_at` is not bound into its encryption: whoever can write this
    device's IndexedDB can extend it (security note).
  - **Thread 7**: `parseNote` runs once at entry; `noteToStore(givenNote, prev)` sits right after
    `readBox`, inside what a retry would re-run.
  - **Thread 10's merge**: the new tests use `boxOf`, `bundleOf`, `scopeOf`, `testDeriver` from
    `./helpers`.
  - The old flaky tamper test failed once here (thread 10 fixes it).
* **For the Coach**: `minor` over a patch; `null`-clears is new API on a field roadmap 3 may
  retire. Open questions (in the PR):
  1. Clamp a remembered unlock's `expires_at` to `now + forcePassphraseReentryHours` on read? No
     cryptography; closes the exposure the security note records; a policy change (it would also
     settle #40's "an old unlock keeps its deadline").
  2. Export `LockboxNote`, so a host form can check a note before `store()`? Public surface.
  3. A vault already bricked by an over-long stored note still will not open: skip or flag the bad
     row in `listBoxes`, or leave it?
