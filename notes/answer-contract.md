# Vault/box CAS scenario table

Nov 7, 2026 · @Philip F Kromer

This note lists every outcome of a get, put or del, each reduced to the condition that decides it, in precedence order: the first matching row wins.

This contract covers the core primitives: get, put and del, on a box and on a vault. Housekeeping utilities such as delRaw, tidyBoxes and tidyGone are not part of it: they repair states the primitives cannot. A guarantee below is a guarantee of the primitives. A housekeeping call may end one, and the guarantee says so where it can.

### Acts

An act about the row asked for has a bare name, the same for a box and a vault: `stale`, `gone`, `camped`. When a box op refuses because of its vault's state, the act has the `vault_` prefix: `vault_void`, `vault_gone`, `vault_reborn`, `vault_full`. A row that fails its checks gets no act. It is thrown, as `damaged_row` for the row asked for and as `damaged_vault` for a box op's vault.

### Flags

The op is get, put or del. Vault ops use the same three on the vault row.

- **ifAbsent** (get, put): what to do when the box is void or a tombstone.
  - `nil` (get) -- returns the absence as an ok result
  - `fail` (get) -- refuses (`void`, `gone`)
  - `add` (put) -- creates the box: `born`, or `reborn` over a tombstone
  - `fail` (put) -- refuses
- **ifPresent** (put only): what to do when the box is live.
  - `repl` -- replaces it
  - `get` -- returns it unchanged (`passed`)
  - `fail` -- refuses (`camped`)
- del takes no flags.
- **`vault_tok`, `box_tok`**: unguessable random strings the device mints, so a token names one life of the row. A new one is minted when the row is created (over void or a tombstone) and again when it is deleted, so a tombstone carries a token of its own. A write over a live row that leaves it live keeps the token. Separately, every write (create, update, delete) gives the row a new revision: a fresh `revision_tok` and `revision_seq + 1`. A box records its vault's `vault_tok` but never the vault's revision, and a vault write never touches its boxes' revisions. The token columns in the tables compare revision tokens.
- The `b_tok` column:
  - `eq` -- the stored token is the one you cited
  - `=next` -- the stored token is the one this request would write
  - `neq` -- neither
  - `birth` -- you cited the shell's token and the box is void, so there is no stored token to compare
  - `—` -- not compared: a get names the row its caller has, and gets back what is stored, whatever that row is
- The `b_seq` column:
  - `birth` -- you cited the shell's seq, `-1`
  - `stale`, `eq`, `ahead` -- the seq you cited is below, at or above the stored one. Any seq but the shell's, cited against a void, is `ahead`.
  - `@` -- any seq

## Rules

### Revisions

Every request has one shape, whatever its op: the op, the address of the row asked for, its flags, and the row its caller expects to find (the shell row if the caller has none). A put or del also carries the record it would write, filed at the same address. A get's expected row travels with it and is not compared: a get is never refused because of the row its caller has.

Each box request names its vault's life token (`vault_tok`), never the vault's revision. Each vault put or del names the vault's revision.

Each modification (put or del) also names:

- the row it expects to find: its revision (token, seq), its life token, and whether it is live
- a next proposed revision (token, seq+1) for the box

The two sequence numbers must be integers and differ by one.

The shell row stands for a void, and a request over a void cites it as the expected row. Its revision is seq `-1` with a crafted `revision_tok`: one fixed value that no mint produces. That request's proposed revision is seq `0` with a random `revision_tok`, never equal to the crafted one. A stored seq is 0 or more (C11), so no stored row carries the shell's revision. An expected revision cites the shell whole or not at all: the crafted `revision_tok` with any seq but `-1`, or seq `-1` with any other `revision_tok`, is a half-shell and refuses `bad_record`.

Revision tokens are minted fresh at every write, delete included: a `revision_tok` names one exact row version. Life tokens (`vault_tok`, `box_tok`) change when the row is created and when it is deleted. If the expected and proposed revision tokens are the same, the request refuses `bad_record`. The proposed revision travels unencrypted as well as sealed, so that it can be stored and compared.

The proposed revision is checked first: if the proposed *next* revision token matches the one already stored, as if the modification were already applied, the act is `retcon` (below). Otherwise the expected revision is compared with the stored one, and the same comparison runs at both levels:

| Expected seq vs stored seq | Expected Token eq       | Expected Token neq  |
| -------------------------- | ----------------------- | ------------------- |
| birth against a row        | (no row has that token) | stale (expected)    |
| birth against void         | match                   | match               |
| stale                      | clash (impossible)      | stale (expected)    |
| eq                         | match                   | forked (impossible) |
| ahead                      | ahead (impossible)      | ahead (impossible)  |
| other seq against void     | ahead (impossible)      | ahead (impossible)  |

A clash is a cited `revision_tok` that is the stored one, while something else the request cites of that row is not what is stored: its seq, its life token, or whether it is live. A `revision_tok` names one exact row version, so the classifier checks all three on a token match.

Proposed revision already stored: the stored token equals the *proposed* (next) token, the one this put or del would write. That is `retcon`, whatever the stored seq is, and whether the stored row is live or a tombstone.

It is a refusal: this request wrote nothing, and the row stored under its proposed token is in `dbhas`, where its seq and its liveness can be read. The contract says nothing of how that row came to be stored, nor whether it is the record this request carries. A del that cites the tombstone itself is not a retcon. It stays `dubdel`, because the caller expected a tombstone yet called `del` anyway.

### Soft caps

A vaultDB may cap how many box rows a vault life has, live and tombstone together, and refuse with `vault_full` a put that would add one. Only a `born` adds a row. A put over a box's own tombstone (`reborn`), a replace and a del reuse the row already there, so none of them is refused for the cap, and deleting a box frees no room. A vault created anew starts its life with no box rows. The cap is soft. The count behind it is not taken transactionally and is not guaranteed accurate: on some datastores an exact count would mean a lock on every writer. So a vault life may come to have more box rows than its cap, and a put may refuse a little under it. Where the cap's check falls among the other checks is not promised either: a put that would refuse for another reason may refuse `vault_full` instead, or the other way around. A host that requires a hard cap installs, and migrates, triggers of its own in its datastore.

The adapter counts the vault life's box rows just before it writes a new box row, and the classifier returns `vault_full` when that count is at the cap. A write already made is never refused for the cap, whatever the count is afterwards. The cap's place among the other refusals is not promised (*Operational Checks*).

### Listings

A listing answers, for each box it lists, what a get of that box would answer in the same atomic unit. When a listing refuses because of its vault, it carries that vault's row as its world, as a box's get does. A listing is not guaranteed to paginate, and may be capped in length: it need not list every box.

### Operational Checks

Precedence, first match wins, for a box:

1. Request shape, before any operation: `bad_record` (an unknown op or flag, or a malformed scope or payload, or next seq not prior seq + 1, or next `revision_tok` equal to the expected one, or a half-shell expected revision, or a life token changed or kept against C7 or C8, or a record that would be stored damaged, C13).
2. Vault damaged: thrown, as `damaged_vault`.
3. Vault void: no vault row stops at `vault_void`. Box ops never create a vault.
4. Vault life: a vault tombstone stops at `vault_gone`, whatever its `vault_tok`. A live vault under another `vault_tok` than the request's stops at `vault_reborn`. Box ops never compare the vault's revision.
5. Box damaged: every op throws `damaged_row`. The library does not delete such a row: the customer clears it with their own datastore's tools (`notes/wontfix.md`).
6. Box under the proposed revision token: `retcon`.
7. Box revision: the expected revision is not the stored one. Refuses `ahead`, `forked`, `clash` or `stale`. A token match whose cited life token or state is not the stored one is a clash too (C14).
   1. Exception: a stale put with `ifPresent=get` that meets a live row returns that row, with act `passed`. Stale here is the shell cited against a row, or an earlier seq under another token.
   2. Exception: a stale del that meets a tombstone refuses `gone`, not `stale`.
8. Revision matched: the stored state picks the flag (ifPresent for a live row, ifAbsent for a void or tombstone), and the flag picks the outcome. Silly combinations arrive here and get the refusal they asked for.

When two refusals both apply, which one is returned is not promised, unless this note says so. The list above is the order the classifier follows: where it had a choice, it took the order that needs less code, unless the other means more to the customer. One order is promised: a stale expected revision is always reported, as `stale` or by one of step 7's two exceptions, and no flag's refusal displaces it.

The soft cap is such a case: a put that would be `born` may refuse `vault_full` at any step past the first (*Soft caps*).

Returning:

- An ok result returns the actual stored value in `val`
- Many refusals return the actual stored value in a separate `dbhas` field, which the caller can use to try again. `void` returns dbnil.
- A row that fails its checks gets no act: it is thrown, as `damaged_row` for the row asked for and `damaged_vault` for a box op's vault. The refusal names the fields that failed, and quotes nothing of the row.
- Every response, ok or refused, carries the world back: the whole vault row, or the shell row where the vault is void.
- A vault-level refusal of a box op returns no `dbhas` (`err` in the tables): the vault row it met is its world.

## Box ops table

Rows run in precedence order. `@` = any value; `—` = not sent, or not compared; `=next` = the stored token is the one this request would write; `(null)` = no box row can exist. Flags are ifAbsent/ifPresent.

### Vault issues (G1–G6)

Every box op passes these tests first. On return, the vault is verified as healthy with a matching `vault_tok`.

| #   |    op    | flags   | `v_tok` | vault   | box | act                                                                      | returning | result |
| --- | :------: | ------- | :-----: | ------- | --- | ------------------------------------------------------------------------ | :-------: | ------ |
| G1  |    @     | invalid |    @    | @       | @   | `bad_record`    (unknown op or flags, or no `vault_tok`)                 |    err    | 🌀      |
| G2  | put, del | valid   |    @    | @       | @   | `bad_record`    (malformed reqval)                                       |    err    | 🌀      |
| G2  | put, del | valid   |    @    | @       | @   | `bad_record`    (next `revision_tok` = cited `revision_tok`)             |    err    | 🌀      |
| G2  | put, del | valid   |    @    | @       | @   | `bad_record`    (next seq ≠ prior + 1)                                   |    err    | 🌀      |
| G2  | put, del | valid   |    @    | @       | @   | `bad_record`    (half-shell cited revision)                           |    err    | 🌀      |
| G2  | put, del | valid   |    @    | @       | @   | `bad_record`    (record's scope or `vault_tok` is not the one addressed) |    err    | 🌀      |
| G2  | put, del | valid   |    @    | @       | @   | `bad_record`    (a proposed token is the shell's)                     |    err    | 🌀      |
| G2  | put, del | valid   |    @    | @       | @   | `bad_record`    (a put proposing a tombstone, or a del a live record)    |    err    | 🌀      |
| G3  |    @     | @       |    @    | damaged | @   | `damaged_vault`                                                          |  thrown   | 🌀      |
| G4  |    @     | @       |    @    | void    | @   | `vault_void`    (impossible: no vault has ever had this scope)           |    err    | 🌀      |
| G5  |    @     | @       |   neq   | gone    | @   | `vault_gone`    (the vault was deleted since: its tombstone has its own) |    err    | 🔁      |
| G5  |    @     | @       |   neq   | live    | @   | `vault_reborn`  (the vault was re-created since)                         |    err    | 🔁      |
| G6  |    @     | @       |   eq    | gone    | @   | (impossible: a tombstone never carries the token of a life)              |           |        |

`v_tok` compares the request's `vault_tok` (a life token) with the stored one. Box ops never compare the vault's revision, so a vault update never makes a box request stale; the world, the whole vault row, still comes back on every response. G3–G6 apply to well-formed requests. A box is fetched under the `vault_tok` its request cites, so a box of another vault life is never met in the op tables.

Following the vault checks, a box row that fails its checks is thrown as `damaged_row`, before the op tables are read (C11).

## Operations

Result: 🫱 / 🔲 / 🪦 got live / void / tombstone · 👍 stored (reqval) · ❎ deleted (tombstone) · 🟰 no change · 🧨 refused, as a `fail` flag asked · 🔁 refused: an expected situation, and the customer can remediate · 🌀 refused, unexpected, damaged or impossible. Confidence: 💯 the only good choice · ✅ the right choice · 🤷 judgment call.

### get

| abbr | `b_tok` | `b_seq` | flags | box    | act       | returning | result |
| ---- | :-----: | ------- | :---: | ------ | --------- | --------- | :----: |
| GV1  |    —    | —       |  nil  | *void* | `gotvoid` | null      |   🔲    |
| GV2  |    —    | —       | fail  | *void* | `void`    | dbnil     |   🧨    |
|      |         |         |       |        |           |           |        |
| GG1  |    —    | —       |  nil  | *gone* | `gotgone` | tombstone |   🪦    |
| GG2  |    —    | —       | fail  | *gone* | `gone`    | dbhas     |   🧨    |
|      |         |         |       |        |           |           |        |
| GL1  |    —    | —       |   @   | *live* | `gotlive` | **same**  |   🫱    |

Coverage check: a get's expected revision is not compared, so 3 box states × 2 ifAbsent values = 6 cases in 5 rows; ifAbsent doesn't matter on a live box.

#### put

| abbr | `b_tok` | `b_seq` | flags |        | act        | returning  | result |
| ---- | :-----: | ------- | :---: | ------ | ---------- | ---------- | :----: |
| PV1  |  birth  | birth   |  add  | *void* | `born`     | **reqval** |   👍    |
| PV2  |  birth  | birth   | fail  | *void* | `void`     | dbnil      |   🧨    |
| PV3  |   neq   | ahead   |   @   | *void* | `ahead`    | dbnil      |   🌀    |
|      |         |         |       |        |            |            |        |
| PG1  |  =next  | @       |   @   | *gone* | `retcon`   | dbhas      |   🔁    |
| PG3  |   neq   | birth   |   @   | *gone* | `stale`    | dbhas      |   🔁    |
| PG4  |   neq   | stale   |   @   | *gone* | `stale`    | dbhas      |   🔁    |
| PG5  |   eq    | stale   |   @   | *gone* | `clash`    | dbhas      |   🌀    |
| PG6  |   neq   | eq      |   @   | *gone* | `forked`   | dbhas      |   🌀    |
| PG7  |   neq   | ahead   |   @   | *gone* | `ahead`    | dbhas      |   🌀    |
| PG8  |   eq    | ahead   |   @   | *gone* | `ahead`    | dbhas      |   🌀    |
| PG9  |   eq    | eq      |  add  | *gone* | `reborn`   | **reqval** |   👍    |
| PG10 |   eq    | eq      | fail  | *gone* | `gone`     | dbhas      |   🧨    |
|      |         |         |       |        |            |            |        |
| PL1  |  =next  | @       |   @   | *live* | `retcon`   | dbhas      |   🔁    |
| PL4r |   neq   | birth   | repl  | *live* | `stale`    | dbhas      |   🔁    |
| PL4f |   neq   | birth   | fail  | *live* | `stale`    | dbhas      |   🔁    |
| PL3  |   neq   | birth   |  get  | *live* | `passed`   | **same**   |   🟰    |
| PL6  |   neq   | stale   |  get  | *live* | `passed`   | **same**   |   🟰    |
| PL5r |   neq   | stale   | repl  | *live* | `stale`    | dbhas      |   🔁    |
| PL5f |   neq   | stale   | fail  | *live* | `stale`    | dbhas      |   🔁    |
| PL7  |   eq    | stale   |   @   | *live* | `clash`    | dbhas      |   🌀    |
| PL8  |   neq   | eq      |   @   | *live* | `forked`   | dbhas      |   🌀    |
| PL9  |   neq   | ahead   |   @   | *live* | `ahead`    | dbhas      |   🌀    |
| PL10 |   eq    | ahead   |   @   | *live* | `ahead`    | dbhas      |   🌀    |
| PL11 |   eq    | eq      | repl  | *live* | `replaced` | reqval     |   👍    |
| PL12 |   eq    | eq      |  get  | *live* | `passed`   | **same**   |   🟰    |
| PL13 |   eq    | eq      | fail  | *live* | `camped`   | dbhas      |   🧨    |

Coverage check: void has 2 seq values × 2 ifAbsent values = 4 cases in 3 rows. Gone has 8 `b_tok` × `b_seq` cases (a `=next` token at any seq is one), one split by ifAbsent, in 9 rows. Live has 8 cases, three split by ifPresent, in 14 rows.

Soft cap: a put that would be `born` may refuse `vault_full` instead (err, 🔁); one that would be `reborn` never does. Where it falls among the rows above is not promised (*Soft caps*).

### del

| abbr | `b_tok` | `b_seq` | flags | box    | act       | returning     | result |
| ---- | :-----: | ------- | :---: | ------ | --------- | ------------- | :----: |
| DV1  |  birth  | birth   |       | *void* | `void`    | dbnil         |   🔁    |
| DV2  |   neq   | ahead   |       | *void* | `ahead`   | dbnil         |   🌀    |
|      |         |         |       |        |           |               |        |
| DG1  |  =next  | @       |       | *gone* | `retcon`  | dbhas         |   🔁    |
| DG3  |   neq   | birth   |       | *gone* | `gone`    | dbhas         |   🔁    |
| DG4  |   neq   | stale   |       | *gone* | `gone`    | dbhas         |   🔁    |
| DG5  |   eq    | stale   |       | *gone* | `clash`   | dbhas         |   🌀    |
| DG6  |   neq   | eq      |       | *gone* | `forked`  | dbhas         |   🌀    |
| DG7  |   neq   | ahead   |       | *gone* | `ahead`   | dbhas         |   🌀    |
| DG8  |   eq    | ahead   |       | *gone* | `ahead`   | dbhas         |   🌀    |
| DG9  |   eq    | eq      |       | *gone* | `dubdel`  | dbhas         |   🔁    |
|      |         |         |       |        |           |               |        |
| DL1  |  =next  | @       |       | *live* | `retcon`  | dbhas         |   🔁    |
| DL3  |   neq   | birth   |       | *live* | `stale`   | dbhas         |   🔁    |
| DL4  |   neq   | stale   |       | *live* | `stale`   | dbhas         |   🔁    |
| DL5  |   eq    | stale   |       | *live* | `clash`   | dbhas         |   🌀    |
| DL6  |   neq   | eq      |       | *live* | `forked`  | dbhas         |   🌀    |
| DL7  |   neq   | ahead   |       | *live* | `ahead`   | dbhas         |   🌀    |
| DL8  |   eq    | ahead   |       | *live* | `ahead`   | dbhas         |   🌀    |
| DL9  |   eq    | eq      |       | *live* | `deleted` | **tombstone** |   ❎    |

Coverage check: void has 2 seq values in 2 rows. Gone and live each have 8 `b_tok` × `b_seq`
cases in 8 rows (eq with birth can't occur). del has no flags, so nothing splits further.

## Vault ops table

Same ops, flags and conventions as the box table, applied to the vault row. Two things to note:

- A get's expected row is not compared: a new device, which has no row, cites the shell.
- A del, like every write, carries a next revision, and its tombstone carries a life token of its own.

### Unconditional errors (V1–V3)

Every vault op passes these first, whatever revision it cites.

| #   |    op    | flags   |  vault  | act         |                                                     | returning | result |
| --- | :------: | ------- | :-----: | ----------- | --------------------------------------------------- | --------- | :----: |
| V1  |    @     | invalid |    @    | bad_record  | unknown op or flags, or a malformed scope           | err       |   🌀    |
| V2  | put, del | @       |    @    | bad_record  | malformed request record                            | err       |   🌀    |
| V2  | put, del | @       |    @    | bad_record  | next seq ≠ prior + 1                                | err       |   🌀    |
| V2  | put, del | @       |    @    | bad_record  | next revision_tok = cited revision_tok              | err       |   🌀    |
| V2  | put, del | @       |    @    | bad_record  | shell revision_tok but seq != -1                 | err       |   🌀    |
| V2  | put, del | @       |    @    | bad_record  | non-shell revision_tok but seq = -1              | err       |   🌀    |
| V2  | put, del | @       |    @    | bad_record  | record's scope is not the one addressed             | err       |   🌀    |
| V2  | put, del | @       |    @    | bad_record  | a proposed token is the shell's                  | err       |   🌀    |
| V2  | put, del | @       |    @    | bad_record  | a put proposing a tombstone, or a del a live record | err       |   🌀    |
| V2  |   put    | @       |    @    | bad_record  | (gating checks)                                     | err       |   🌀    |
| V3  |    @     | @       | damaged | damaged_row |                                                     | thrown    |   🌀    |

### Vault get

| #    | `v_tok` | `v_seq` | flags | vault  | act       | returning     | result |
| ---- | :-----: | ------- | :---: | ------ | --------- | ------------- | :----: |
| VGV1 |    —    | —       |  nil  | *void* | `gotvoid` | **null**      |   🔲    |
| VGV2 |    —    | —       | fail  | *void* | `void`    | dbnil         |   🧨    |
|      |         |         |       |        |           |               |        |
| VGG1 |    —    | —       |  nil  | *gone* | `gotgone` | **tombstone** |   🪦    |
| VGG2 |    —    | —       | fail  | *gone* | `gone`    | dbhas         |   🧨    |
|      |         |         |       |        |           |               |        |
| VGL1 |    —    | —       |   @   | *live* | `gotlive` | **same**      |   🫱    |

Coverage check: a vault get's expected revision is not compared, so 3 vault states × 2 flags values = 6 cases in 5 rows; flags don't matter on a live vault.

### Vault put

A gate verb (replacePassphrase, addPasskey, revokePasskey) is a vault put with `ifAbsent: fail` and `ifPresent: repl` that names its verb. Where the table below gives `replaced`, the classifier also checks the record against the stored row's gate, in the atomic unit that stores the record:

- addPasskey refuses `camped` when a passkey wayin is already stored.
- revokePasskey returns `passed` when no passkey wayin is stored.
- Every gate verb throws `gate_issue` for a record that changes more than its verb allows.

Every other row is the same as for any put.

| #     | `v_tok` | `v_seq` | flags | vault  | act        | returning  | result |
| ----- | :-----: | ------- | :---: | ------ | ---------- | ---------- | :----: |
| VPV1  |  birth  | birth   |  add  | *void* | `born`     | **reqval** |   👍    |
| VPV2  |  birth  | birth   | fail  | *void* | `void`     | dbnil      |   🧨    |
| VPV3  |   neq   | ahead   |   @   | *void* | `ahead`    | dbnil      |   🌀    |
|       |         |         |       |        |            |            |        |
| VPG1  |  =next  | @       |   @   | *gone* | `retcon`   | dbhas      |   🔁    |
| VPG3  |   neq   | birth   |   @   | *gone* | `stale`    | dbhas      |   🔁    |
| VPG4  |   neq   | stale   |   @   | *gone* | `stale`    | dbhas      |   🔁    |
| VPG5  |   eq    | stale   |   @   | *gone* | `clash`    | dbhas      |   🌀    |
| VPG6  |   neq   | eq      |   @   | *gone* | `forked`   | dbhas      |   🌀    |
| VPG7  |   neq   | ahead   |   @   | *gone* | `ahead`    | dbhas      |   🌀    |
| VPG8  |   eq    | ahead   |   @   | *gone* | `ahead`    | dbhas      |   🌀    |
| VPG9  |   eq    | eq      |  add  | *gone* | `reborn`   | **reqval** |   👍    |
| VPG10 |   eq    | eq      | fail  | *gone* | `gone`     | dbhas      |   🧨    |
|       |         |         |       |        |            |            |        |
| VPL1  |  =next  | @       |   @   | *live* | `retcon`   | dbhas      |   🔁    |
| VPL4r |   neq   | birth   | repl  | *live* | `stale`    | dbhas      |   🔁    |
| VPL4  |   neq   | birth   | fail  | *live* | `stale`    | dbhas      |   🔁    |
| VPL5r |   neq   | stale   | repl  | *live* | `stale`    | dbhas      |   🔁    |
| VPL5  |   neq   | stale   | fail  | *live* | `stale`    | dbhas      |   🔁    |
| VPL3  |   neq   | birth   |  get  | *live* | `passed`   | **same**   |   🟰    |
| VPL6  |   neq   | stale   |  get  | *live* | `passed`   | **same**   |   🟰    |
| VPL7  |   eq    | stale   |   @   | *live* | `clash`    | dbhas      |   🌀    |
| VPL8  |   neq   | eq      |   @   | *live* | `forked`   | dbhas      |   🌀    |
| VPL9  |   neq   | ahead   |   @   | *live* | `ahead`    | dbhas      |   🌀    |
| VPL10 |   eq    | ahead   |   @   | *live* | `ahead`    | dbhas      |   🌀    |
| VPL13 |   eq    | eq      | repl  | *live* | `replaced` | reqval     |   👍    |
| VPL11 |   eq    | eq      |  get  | *live* | `passed`   | **same**   |   🟰    |
| VPL12 |   eq    | eq      | fail  | *live* | `camped`   | dbhas      |   🧨    |

Coverage check: void has 2 seq values × 2 ifAbsent values = 4 cases in 3 rows. Gone has 8 `v_tok` × `v_seq` cases, one split by ifAbsent, in 9 rows. Live has 8 cases, three split by ifPresent, in 14 rows.

### Vault del

| #    | `v_tok` | `v_seq` | flags | vault  | act                 | returning     | result |
| ---- | ------- | ------- | :---: | ------ | ------------------- | ------------- | ------ |
| VDV1 | birth   | birth   |       | *void* | `void`              | dbnil         | 🔁      |
| VDV2 | neq     | ahead   |       | *void* | `ahead`             | dbnil         | 🌀      |
|      |         |         |       |        |                     |               |        |
| VDG1 | =next   | @       |       | *gone* | `retcon`            | dbhas         | 🔁      |
| VDG3 | neq     | birth   |       | *gone* | `gone`              | dbhas         | 🔁      |
| VDG4 | neq     | stale   |       | *gone* | `gone`              | dbhas         | 🔁      |
| VDG5 | eq      | stale   |       | *gone* | `clash`             | dbhas         | 🌀      |
| VDG6 | neq     | eq      |       | *gone* | `forked`            | dbhas         | 🌀      |
| VDG7 | neq     | ahead   |       | *gone* | `ahead`             | dbhas         | 🌀      |
| VDG8 | eq      | ahead   |       | *gone* | `ahead`             | dbhas         | 🌀      |
| VDG9 | eq      | eq      |       | *gone* | `dubdel`            | dbhas         | 🔁      |
|      |         |         |       |        |                     |               |        |
| VDL1 | =next   | @       |       | *live* | `retcon`            | dbhas         | 🔁      |
| VDL3 | neq     | birth   |       | *live* | `stale`             | dbhas         | 🔁      |
| VDL4 | neq     | stale   |       | *live* | `stale`             | dbhas         | 🔁      |
| VDL5 | eq      | stale   |       | *live* | `clash`             | dbhas         | 🌀      |
| VDL6 | neq     | eq      |       | *live* | `forked`            | dbhas         | 🌀      |
| VDL7 | neq     | ahead   |       | *live* | `ahead`             | dbhas         | 🌀      |
| VDL8 | eq      | ahead   |       | *live* | `ahead`             | dbhas         | 🌀      |
| VDL9 | eq      | eq      |       | *live* | `deleted` (+ boxes) | **tombstone** | ❎      |

Coverage check: void has 2 seq values in 2 rows. Gone and live each have 8 `v_tok` × `v_seq` cases in 8 rows.

Where the vault differs from the box table, and why:

- VPG10 and VPL12 return `dbhas`: the caller needs the stored row to re-create or retry.
- A vault put with `ifPresent=repl` replaces a live vault in place, as a box put does: a fresh `revision_tok`, seq + 1, the same `vault_tok` (C7). It touches no box, and it makes no box request stale, because a box request cites the vault's life token and never its revision.

## Roles

Three roles take part in every call, and each rule below names the one it binds.

- **vaultDB**: the core's `VaultDB`, the interface a model calls. It checks the request's shape before anything is fetched (`bad_record`), and it answers: `act`, `val`, `world`, `dbhas`. It owns the **classifier**, the shared pure function that takes the request and the rows fetched, returns the `act`, and says what to write, if anything. Every judgment in the tables above is the classifier's.
- **adapter**: the package that carries a vaultDB call to one kind of datastore. It opens the atomic unit, fetches the rows, passes them to the classifier, writes what the classifier says to write, and returns the rows. It judges nothing.
- **datastore**: the engine that stores the vault and box rows: Postgres, IndexedDB, a host's backend. It must offer a unique key per scope, and an atomic unit that spans a fetch and a write. It may also enforce these same invariants and checks a second time, with constraints, foreign keys or stored procedures. That is allowed but never required. It decides no outcome in the tables, and its details are outside this note.

## Scope and consistency checks

Two primary keys locate every row, and the datastore enforces them. Every other invariant below names the check it implies and the refusal when it fails.

- **`vault_scope`**: an opaque identifier built from applabel, `user_id` and vaultlabel. Primary key of the vault table.
- **`box_scope`**: `vault_scope` + boxlabel. With the `vault_tok` of its vault's life, the primary key of the box table: a box is filed under one life of its vault, and fetched by it.

| #   | Invariant                                                                                            | Enforced by                                                            | Check                                                                                                                                                                                                                                                                            | On failure                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `vault_scope` and boxlabel in a request are well formed                                              | vaultDB, before anything is fetched                                    | parse and validate                                                                                                                                                                                                                                                               | `bad_record`, or `bad_scope` for a listing                                                                                         |
| C2  | One vault row per `vault_scope`, kept as a tombstone after delete                                    | datastore primary key                                                  | vault create is an insert-if-absent                                                                                                                                                                                                                                              | `stale`                                                                                                                            |
| C3  | One box row per `box_scope` in one life of its vault, kept as a tombstone after delete               | datastore primary key                                                  | born is an insert-if-absent                                                                                                                                                                                                                                                      | `stale`                                                                                                                            |
| C4  | A stored row's `vault_scope`, and a box's `vault_tok` and boxlabel, match the key it was found under | datastore key; the classifier checks the rows it is handed             | compare the stored scope fields, and a box's `vault_tok`, with the request                                                                                                                                                                                                       | `storage_issue`, thrown: the row is sound and the store or its adapter is not                                                      |
| C5  | A box is met only in the life of its vault that its request cites                                    | the box key carries `vault_tok`, and the fetch is by key               | —                                                                                                                                                                                                                                                                                | a box of an earlier life is never fetched, and tidyBoxes removes it; one handed to the classifier anyway is a `storage_issue` (C4) |
| C6  | A box is reachable only under a live vault                                                           | classifier: the vault checks run before any box check                  | vault state is live                                                                                                                                                                                                                                                              | `vault_gone` (G5, G6)                                                                                                              |
| C7  | `vault_tok` changes on every vault create and every vault delete, and on nothing else                | vaultDB, in the request                                                | create, re-create or del: proposed `vault_tok` ≠ expected `vault_tok`, and is not the shell's; update: proposed = expected                                                                                                                                                    | `bad_record`                                                                                                                       |
| C8  | `box_tok` changes on every box create (born, reborn) and every box delete, and on nothing else       | vaultDB, in the request                                                | born, reborn or del: proposed `box_tok` ≠ expected `box_tok`, and is not the shell's; replace: proposed = expected                                                                                                                                                            | `bad_record`                                                                                                                       |
| C9  | Every write gets a fresh `revision_tok`, and `revision_seq` rises by exactly one, a rebirth included | vaultDB, in the request                                                | proposed seq = expected seq + 1, and proposed `revision_tok` ≠ expected `revision_tok`                                                                                                                                                                                           | `bad_record`                                                                                                                       |
| C9  | Every write gets a fresh `revision_tok`, and `revision_seq` rises by exactly one, a rebirth included | classifier                                                             | stored revision = expected revision                                                                                                                                                                                                                                              | `stale`, or a defect of step 7                                                                                                     |
| C10 | The write lands on the row the classifier saw                                                        | the atomic unit: the adapter fetches, classifies and writes inside one | —                                                                                                                                                                                                                                                                                | impossible, by the atomic unit; a write that misses is an adapter defect, and throws                                               |
| C11 | A stored row is well formed: tokens present, seq an integer >= 0, live or gone                       | classifier, on every row it is handed                                  | shape check                                                                                                                                                                                                                                                                      | thrown: `damaged_row`, or `damaged_vault` for a box op's vault                                                                     |
| C12 | Every response carries the world back: the whole vault row                                           | vaultDB, on every response                                             | —                                                                                                                                                                                                                                                                                | —                                                                                                                                  |
| C13 | A write never stores a row the next fetch would judge damaged                                        | vaultDB, in the request                                                | the proposed record's scope and `vault_tok` are those addressed; no proposed `revision_tok` is the shell's, nor is a new life token (a del citing the shell brings a life token of its own like any other, and can never be written); a put proposes a live record and a del a tombstone | `bad_record`                                                                                                                       |
| C14 | The row a request expects is the row stored                                                          | classifier, on a `revision_tok` match                                  | expected seq, life token and state = the stored row's                                                                                                                                                                                                                            | `clash`                                                                                                                            |
| C15 | A put or del writes at most once                                                                     | fresh revision tokens, and tombstones                                  | once its proposed revision is stored, or its expected revision is no longer the stored one, the request writes nothing                                                                                                                                                           | none: it refuses as the tables say. delRaw returns a scope to void, and ends this for a request citing the shell                |

Why boxes carry `vault_tok`: so that nothing has to touch a vault's boxes when the vault changes. A delete gives the
tombstone a `vault_tok` of its own, so a box still stored under the deleted life stays inaccessible (C6). A re-create
mints another, so that box is never fetched again (C5). A datastore that can't remove a vault's boxes in the vault
delete's own atomic unit is still correct.

## Adapter contract

Each rule is one testable statement about what an adapter does. An atomic unit is one statement or one transaction; the adapter may use either.

### Fetching

- Inside one atomic unit, the adapter fetches the vault row by `vault_scope`, and the box row by `box_scope` and the `vault_tok` the request cites, with no filter on revision or state.
- No vault row means the vault is void, and no box row means the box is void. Nothing else produces void.

### Classifying

- The adapter hands the rows it fetched, unaltered, to the classifier, and makes no outcome decision itself.
- The classifier is a pure function: the same request and rows always give the same outcome.
- The classifier, not the adapter, judges damage. A row is damaged when it fails its own checks, so it cannot be safely processed. A stored row with a missing token, a non-integer seq, an unknown state, a value on a tombstone or no value on a live row is damaged: the classifier throws `damaged_row`, or `damaged_vault` for a box op's vault.
- A sound row that is not what was asked for is not damaged: the datastore or its adapter is broken, and the classifier throws `storage_issue`. That is a row whose `vault_scope` or boxlabel differs from the request's, a box row whose `vault_tok` does, or a row that is no object at all.
- A box of an earlier vault life is never handed to the classifier: the fetch is by `vault_tok`.

### Writing

- A write happens only when the outcome is born, reborn, replaced or deleted, and in the same atomic unit that fetched the rows the classifier judged. Nothing else writes those rows in between, so a write never misses.
- A write changes exactly one row, the one the classifier was handed, or inserts one where it was handed none.
- born inserts: no row exists for the `box_scope` in this life of its vault. A box of an earlier life stands under its own key, untouched.
- Every write stores the proposed revision: the proposed `revision_tok`, at seq = stored seq + 1. The seq at a scope therefore rises by exactly one at each write.
- The seq goes on across a rebirth: a reborn row is stored at its tombstone's seq + 1. So the seq at a scope never falls, whatever the life, and a device can tell a row of an earlier life from a row of a later one by its seq (`notes/deliver-contract.md`). Only delRaw, which returns a scope to void, ends this.
- born, reborn and delete store the proposed `box_tok`, which differs from the stored row's. Replace leaves `box_tok` unchanged.
- delete stores a tombstone (state gone, no value, the proposed `revision_tok`, seq + 1, the proposed `box_tok`) and never removes the row. Only delRaw removes rows.
- Every successful modification, delete included, writes a new revision. Deleting a tombstone refuses (`dubdel`) and leaves the revision unchanged.
- Vault delete sets state gone, writes a new revision (the proposed `revision_tok`, seq + 1) and stores the proposed `vault_tok`, which differs from the stored row's. Afterwards, no box op under that `vault_scope` returns a live box until the vault has been re-created.
- Vault delete removes every box of that vault life (box.`vault_tok` = the deleted `vault_tok`), in the same atomic unit where the datastore can. Where it can't, those boxes stay inaccessible (C6) until tidyBoxes removes them, and are never fetched again once the vault is re-created (C5).
- Vault re-create stores the proposed `vault_tok`, which differs from the tombstone's, with seq = stored seq + 1.
- Vault replace stores the proposed revision and leaves `vault_tok` unchanged.
- No write copies a new `vault_tok` onto existing boxes. A foreign key from (box.`vault_scope`, box.`vault_tok`) to the vault, where declared, never cascades updates.
- A put or del writes at most once (C15): once its proposed revision is stored, or its expected revision is no longer the stored one, it writes nothing.
- A put that would be `born` may refuse `vault_full` under the vaultDB's soft cap, which counts the vault life's box rows, tombstones among them. The count is an estimate, taken outside any lock, and the check may run at any point in the atomic unit (*Soft caps*).
- A refusal never writes.

### Responding

- Every response carries the world back: the whole vault row as the atomic unit leaves it, which is as fetched, or as written by a vault op.
- An ok write answers the request's own record (`reqval`); nothing is fetched after the write.
- A refusal returns dbhas with the row as fetched in the deciding atomic unit, or dbnil when there is no row.

### What the datastore offers

- Required: a unique key per scope. `vault_scope` keys the vault table and (`vault_scope`, `vault_tok`, boxlabel) keys the box table, so a scope never has two rows in one vault life.
- Required: an atomic unit that spans the fetch and the write of a get, put or del. tidyBoxes asks for none beyond each conditioned delete.
- Allowed, never required: the datastore enforces an invariant itself, by a foreign key (C5), a check constraint, a condition on the write, or a stored procedure that runs these checks. Such a check agrees with the classifier, or the adapter has a defect; it never decides an outcome.
- Allowed: the datastore refuses to store a row the classifier would refuse. So a flawed row has one of two fates: the datastore does not store it, or the classifier throws it, as `storage_issue` if its scope is not the one it is filed under, and as damaged otherwise.

### tidyBoxes tests

tidyBoxes(`vault_scope`) captures the boxes grouped by `vault_tok`, fetches the current `vault_tok`, deletes every captured box not in the current vault life, then captures the `vault_tok` and box labels grouped by `vault_tok` again and returns both captures.

It needs no atomic unit across its steps and no lock: what it removes counts as void and is never answered, and each delete is conditioned on the row as captured. So it suits a datastore where a transaction over the whole listing, or the number of rows, would be a strain.

- deletes nothing when every box carries the current `vault_tok`
- deletes every box whose `vault_tok` differs from the current `vault_tok`
- keeps every box whose `vault_tok` equals the current `vault_tok`
- deletes leftovers from several earlier vault lives in one run
- deletes every box when the vault is void
- deletes every box when the vault is a tombstone, including boxes carrying its `vault_tok`
- returns the first capture: `vault_tok` and box labels grouped by `vault_tok`
- returns the second capture, taken after every delete has finished
- second capture contains only the current `vault_tok` group, or no boxes when the vault is void or a tombstone
- deletes only boxes in the first capture, never one created after it
- conditions each delete on the captured `vault_tok`, `box_tok` and seq
- skips a captured box rewritten since the capture and reports it
- deletes the old life's boxes when the vault is deleted and re-created between the capture and the `vault_tok` fetch
- never deletes a box born in the current life after the `vault_tok` fetch
- leaves boxes under every other `vault_scope` untouched
- removes leftover rows outright rather than leaving tombstones
- leaves a box whose `vault_tok` can't be read, and reports it as damaged
- succeeds with no boxes and an empty first capture
- deletes nothing on a second run straight after the first
- two concurrent runs delete each leftover once and return the same second capture
- run concurrently with a vault delete, leaves no box of the deleted life
