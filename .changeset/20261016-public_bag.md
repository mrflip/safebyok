---
'safebyok': minor
'safebyok-convex': minor
'safebyok-postgres': minor
'safebyok-graphql': minor
'safebyok-react': minor
---

**Stored shape: a lockbox's note becomes a public bag of any JSON, and the lockbox reserves its whisper's codec and schema version.** The lockbox's format is `safebyok-lockbox-v3`. No lockbox written before this reads: no compatibility before 1.0. A `safebyok-lockbox-v2` lockbox lists as damaged (`{ boxlabel, damaged: true }`) and `read()` refuses it as `damaged_lockbox`; `erase()` it, or `store()` over it, which writes it afresh. The bundle, the unlock envelopes and the device records are unchanged, so a vault still opens and unlocks.

- **`safebyok`**:
  - `store(boxlabel, whisper, { public })` takes the lockbox's **public bag**, any JSON value (`PublicBag`, exported), shown in the snapshot while locked as `box.public` and never interpreted by the vault. Left out, the lockbox keeps the bag it has, and a new lockbox gets `{}`; `{}` empties it. A bag JSON cannot carry is refused as `bad_option`. `opts.note` is gone: a host keeping a note moves it into the bag, as `{ public: { note } }`, and checks its bag's shape itself before `store()`.
  - The bag is stored as its JSON, keys sorted, in the lockbox's `public_json`, always written, and bound into both of the lockbox's encryptions with every other field of its header, so a bag altered or swapped in storage makes the lockbox refuse to open. The lockbox also records `whisper_codec` (`'json_v1'`) and `whisper_schema_version` (`1`), bound the same way. `LockboxSummary` carries `public` in place of `note`, and none of the three stored fields.
  - The stored `public_json` must be exactly the vault's own serialization (keys sorted, no spacing): a lockbox whose bag was respaced, reordered or nested too deep in storage lists as damaged. And a `store()` over a lockbox that will not decipher (its ciphertext, bag or times altered in storage) carries neither its bag nor its `registered_at` forward: the bag becomes `{}` unless one is given, and `registered_at` is now.
  - `maxWhisperBytes` counts the whisper's JSON and the bag's together, so a whisper of exactly `maxWhisperBytes` no longer fits beside even the empty bag's two bytes. A replacement is never refused as `vault_full` any more: it weighs what it replaces.
  - The note's checks go: `LockboxNote`, `MaxNoteChars`, `NoteFloor` and `NoteFloorBytes` are no longer exported, and `VaultValidators`, `DefaultValidators` and `AnyTextValidators` have no `note` field. A `validators` bag holding `note` is refused as `bad_option`, as any field the vault does not know is.
  - A lockbox's format is bound into its encryptions once, as the binding's leading tag, and no longer again inside its header.
- **`safebyok-convex`**: the component's lockbox validator takes `safebyok-lockbox-v3` only, with `whisper_codec`, `whisper_schema_version` and `public_json` in place of `note`, so a deployment holding lockboxes written before this no longer matches its schema: delete the component's lockbox rows (or clear its tables) before deploying it.
- **`safebyok-postgres`**: `safebyok_lockboxes` loses `note` and gains `whisper_codec` (text), `whisper_schema_version` (bigint) and `public_json` (text, never jsonb, which would rewrite the bound text), each `NOT NULL`. `VaultTablesSql` creates only missing tables, so drop and recreate a `safebyok_lockboxes` made before this.
- **`safebyok-graphql`**: `SafebyokLockbox`, `SafebyokLockboxInput` and `SafebyokListedLockbox` lose `note` and gain `whisper_codec: String!`, `whisper_schema_version: Int!` and `public_json: String!`. A host serving the recipe's SDL deploys the new one with its server.
- **`safebyok-react`**: `VaultProvider` passes no `note` check through, as there is none.
