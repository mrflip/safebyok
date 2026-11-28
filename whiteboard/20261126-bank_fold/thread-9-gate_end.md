# Thread 9: gate_end (2026-11-27)

Branch `20261127-gate_end`, cut at `36255f83d`, rebased onto `54530f969` (the line's review fixes) and reworked for the
Coach's later ruling on the lifetok; no PR of its own (the line is PR #949). Proved: `pnpm justify` green (counts in the
*Rework* section), run with nothing else building.

* **Built**:
  - A gate record is live (`am: 'a'`, even life, `wayins.main` a wayin) or a tombstone (`am: 'x'`, odd life,
    `wayins: { main: null, passkey0: null }`): `gateLive`, `gateGone`, `gateThing` (a union on `am`), `gateCited` and
    `GateChecks.live` in `shapes-thing.ts`; Postgres's CHECK on `safebyok_gate_things`; Convex keeps `v.any()`.
  - A birth is two ordinary puts. `BirthBankAsk` carries `cited: { gate, root }`, each root as the device holds it (the
    shell or its tombstone, `VaultMinder.heldRoots`). Each put is judged by `judgedActOf` (the put table, or `policied`),
    a birth's tags per root are a write's less `written` (`RootTags`), `isBirthWritable(puts, ante)` is `isWritable` of
    both. Postgres's `birth_roots` judges the root box's put in its snapshot, writes the gate as `write_gate` would and
    the root box only beside it, raising where the root box's UPDATE no longer holds; the clauses come from
    `shellClausesOf`/`anteClausesOf`, which the write functions use too. `ManifestTags.writtenBirthTagsOf(puts)` is a
    written birth's tags, as `writtenTagsOf` is a write's.
  - `Bank.mintStamps(found)` takes the gate tombstone or shell: the life after it, with a new lifetok each call.
    `Gate.makeRecord(dna, found)` makes the first revision or the next life via `BaseThing.revisionAfter`.
  - The lifetok: see *Rework*. As built first, it was kept over every gate row; that is gone.
  - Track keys `gate`/`root` everywhere (core, Postgres `tracked()`, GraphQL tests). `TrackedRows` gone (`RootRows`).
  - `vault.bank` always answers `device.bank`. Static `Bank.birthGating` goes through `Device.birthGating`'s stage check.
  - Batteries: rebirth over each mix of tombstone and none, both-or-neither,
    the banktok of a gate failing other checks (restored from 1323380), gate shape refusals, a Postgres-only birth-tags
    comparison.
  - Docs: `notes/vault-adapter-contract.md` (banktok clause, birth tags, lifetok_cmp, write and birth predicates),
    `notes/wontfix.md`, `notes/guarantees-drift.md`, VOCABULARY, the changeset; `notes/security.md` amended by a
    sonnet subagent (three amendments, no new entries).

* **Decisions made** (design gaps, under the Coach's grant of authority):
  - The birth ask carries what each put cites: a tombstone's revtok is not derivable from the record.
  - A device holding a live gate refuses a birth `gate_made_elsewhere` before asking the vaultDB (it answered the same
    after a round trip): `mintStamps` has no life after a live gate.
  - Unborn is "no live gate and no live root box": both tombstones is now unborn, where it was broken roots.
  - The VaultMinder's banktok is the held gate's lifetok, a tombstone's included (was void).
  - GraphQL: a refused birth's answer carries only the refusing root, and where the root box refused over a gate
    tombstone the gate's row is unknown to the client. It reads the bank's roots again (a second request, refused path
    only). Set aside: fabricating the gate row from what the put cites (a forged record), and adding both roots to the
    core's refused `BirthBankAnswer` (a contract change).

* **Deviations**:
  - `Bank.birthGating` previously ran without a stage check; it now refuses as `device.birthGating` does before sign-in.
  - Broken state: a birth with a live root box beside a non-live gate answered `stale` (it cited the shell); it now
    answers `camped`, citing the live root box held.
  - `vault.bank.rootBox` with a live gate and no live root box: `absent_thing` before, now `record_conflict`
    (`Bank.rootBox`'s own `rootBoxNotHeard`).

* **Discoveries**:
  - In a Postgres UPDATE's `RETURNING`, a `FROM` CTE's column named `written` shadows `RETURNING WITH (NEW AS written)`;
    `gated` names its column `gate_written`.
  - Adapters' vitest reads `safebyok/testing` from the built dist: rebuild `safebyok` after a battery edit.

* **For the Coach**:
  - The GraphQL second request on a refused birth: acceptable, or should the GraphQL answer carry both roots?
  - Branch count: the special birth predicate (`rootActOf`, the root tags of two fields) went; the rework took out the
    birth's `policied` case, so the birth is judged by the put table alone, as before gate_end.

## Rework (2026-11-27): the lifetok is minted at each birth

The Coach, after the build: "I think I'm wrong about the banktok being constant: it should change with each ¿birth?
with that, the box sees the tombstone, and is invisible on a new life."

* **Restored from `36255f83d`**: `lifetok_cmp` is `'moot'` over a tombstone or no row (`ManifestTags.lifetokCmpOf`,
  `writtenTagsOf`); `isWritable`'s `(! isLive)` clause; Postgres's `((ante.am <> 'a') OR (ante.lifetok = ...))` clause and
  both tags functions; `Phrases.LifetokMoved`'s text; `scribeWriteAct`'s body, `birthAnswerOf`, `ScribedBirthManifest`
  and `Throwers.taggedRefusal(ask, manifest)`; the battery's "rebirths the gate over its tombstone with another lifetok"
  and "rebirths the gate over a tombstone whose lifetok is malformed".
* **Changed**: `Bank.mintStamps` always mints (`mintStampsArgs` reads no lifetok, so a malformed one on the tombstone is
  no refusal). `scribeBirthAct` uses `writeTableActOf` on each root's full tags (`judgedActOf` and `Judged` gone): a
  root's put writes only over a tombstone or none and names no policy, so it is never `policied`.
* **Kept from the build**: the tombstone keeps its life's lifetok and no wayin; the VaultMinder's banktok over a
  tombstone is that lifetok; the birth ask's `cited`; the track keys; `vault.bank`; static `Bank.birthGating`.
* **Tests**: `rebirthBankAskOf` reborn gate carries `OtherLifetok`, its banktok too; the rebirth cases answer it as
  banktok; the policied-birth case became "writes a rebirth ... that keeps its lifetok"; `bank.test` mints a new lifetok
  over a tombstone; `gating.test` births over a bank's end with a new lifetok, the ask carrying it; Postgres's tag
  comparisons lost their lifetok-changing-rebirth `false` rows.
* **Words**: VOCABULARY's lifetok, birth, gate record and policied rows; the contract's `lifetok_cmp`, write and birth
  predicates; the changeset; the design. `notes/security.md` got a new amendment line from a sonnet subagent (commit
  `9db83f812`); it also names the earlier "nothing carried but its lifetok" line as superseded.
* **Rebase**: onto `54530f969` with no conflict.
* **Proved**: `pnpm justify` green after the rework, 9,408 tests over 19 vitest runs, nothing else building.
