<!-- Exported from the Gripefest matters doc (https://claude.ai/code/artifact/db860eaa-e42b-4b34-99e0-bb9b68256f9c), tab "Open Matters", 2026-10-16, before the sprint's sweeps. A snapshot: the doc is the live copy. -->

# Gripefest matters

Oct 16, 2026 · @Philip F Kromer

Every gripe still open after the gripes\_boogaloo harvest (#121), one row each, spread over tabs by concern and by weight, for you to triage.

## How this works

Each tab holds a matters table: **Your answer** is yours, **State** is a chip, **Matter** is ours. Rows start `drafting`; agents act only on a row you flip.

- **drafting**: yours, maybe half written. Agents pass over it.
- **explain**: an agent backfills the matter from the whiteboard, `winboard/` and PR files behind it, then resets the chip to `drafting`.
- **elevate**: the row moves to a tab of its own under this one, for discussion in another session.
- **todo**: the matter goes into `TODO.md` (with your answer folded in).
- **notyet**: the matter goes into `NOTYET.md`.
- **proceed**: act as if you had said *Your answer* in chat (empty means take the Rec).

Each matter leads with its gripe id (`G###`, shared with `whiteboard/20261016-gripes_boogaloo/gripes-list.md`) and its one-liner. Where the matter was in `TODO.md`, the TODO's own text follows it, uncondensed, from `winboard/20261016-todo/20261016-todo-open.md`.

Tabs are cut first by the two topics you named (Validators, Device lockout), then by weight (**Notyet**: flagged NOT YET or RAGEBAIT; **Small**: possibly stale, picayune or already addressed; **Soonish**: straightforward and standalone), and the rest by concern.

## The tabs

267 matters: the 249 open gripes, less G068 (merged into G064), plus 15 new from the matters sprint (G510–G524, marked as such), plus G530, filed NOT YET on 2026-10-16, plus 3 open TODO entries with no gripe of their own (`T01`–`T03`).

Fable's write-up on races, the two locks, and validation, with the principles each *(Fable: …)* row note refers to: Fable's strawman: races, locks, validation

| Tab | Holds | Matters |
| --- | --- | --- |
| Soonish matters | Straightforward, standalone, not marked not-yet | 30 |
| Crypto & ways in | Key derivation, stored-format reservations, passkeys | 21 |
| Vault core | open, unlock, lock, store, erase, expiry, errors, logger | 35 |
| Storage & adapters | The VaultDB contract, store base class, IndexedDB, Postgres, GraphQL | 31 |
| Convex | The Convex component and client | 19 |
| React & demo | The React binding, the dialog, the demo | 14 |
| Tests & tooling | Test strategy, lint, build, CI | 13 |
| Release & docs | Release levels and workflow, npm, Dependabot, naming in docs | 15 |
| Small matters | Possibly stale, picayune, or already addressed | 45 |
| Notyet matters | Flagged NOT YET or RAGEBAIT, or shelved "later" | 11 |

## Elevated matters

| Matter | Tab |
| --- | --- |
| What are we validating, where, when, why and for whom (23 matters) | Validators: what, why, for whom |
| Locking out a device, and the vault-key rotation under it (10 matters) | Device lockout |

## Your notes

| Note | State |
| --- | --- |
|  | drafting |
