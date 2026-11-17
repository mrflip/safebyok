# Thread 2: validation_overrides (2026-10-15)

Branch `20261015-validation_overrides`, PR [#85](https://github.com/mrflip/safebyok/pull/85),
cut from `origin/main` at `6f9911d`. Justify: green. Tests passed: root 123, safebyok 838,
safebyok-react 52, the React demo 124, safebyok-convex 268.

* **Built**: `validation-overrides.md` beside this file. It covers what a host can tune today,
  with each validator's file:line on main; a floor-plus-policy design for host overrides; what
  must stay fixed; the costs; and six questions for the Coach. There is also an empty changeset.
  No code.
* **Decisions taken**:
  * The recommendation has two layers. A fixed floor (no colon, ASCII, length ceilings) is checked
    everywhere, reads included. A replaceable policy, defaulting to today's grammar, is checked
    only where a name is made: `openVault` for the scope, `store()` for the boxlabel and note.
    The floor exists because the VaultDB, the DeviceDB and the Convex server never see
    `openVault`'s options, and because the ckeys, the 2 KiB allowance and the cipher binding
    depend on it.
  * The policy is check-only: its output is discarded and the host's input kept, because the
    scope and boxlabel are bound into every ciphertext.
  * No `z` re-export. zod is already our peer dependency. Classic does not tree-shake, mini would
    confuse classic users, and either way zod's majors would become ours.
  * No ckey stringifier for now. The floor keeps `:` out of every label, so the `:`-join suits
    any policy. This narrows the Coach's TODO ruling and is put to the Coach as a question.
  * Thread 1's `user_id` schema is called `UserId` in the write-up and serves as both its default
    and its floor (1 to 100 characters, inside the allowance's 512 bytes).
* **Discoveries**:
  * `LockboxFieldsBytes` (`vault.ts`:1050-1058) assumes 40-*byte* labels. A label grammar that
    admitted non-ASCII would quietly break the allowance, so the floor stays ASCII.
  * `VaultProvider` reopens the vault when any option changes identity (`vault-provider.tsx`:133).
    A `validators` bag built inline in render would reopen it on every render.
  * zod's `StandardSchemaV1` type is not a public export of zod 4, so taking Standard Schema
    would need `@standard-schema/spec`.
  * The bytes the override would add to `openVault` are unmeasured. It sits at 16.61 of 17 kB
    before thread 1, so expect a budget bump.
* **For the Coach**: the six questions at the end of `validation-overrides.md`. The first, on
  which shape (floor plus policy, narrow only, or full replacement with a stringifier), decides
  the build thread. The build thread also owes a `notes/security.md` entry: a host's schema runs
  on the scope and the note, never on a whisper or a passphrase.
