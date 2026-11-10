# Vault/box CAS scenario table

Nov 7, 2026 · @Philip F Kromer

Every get, put and del outcome, collapsed to the condition that decides it, in precedence order: the first matching row wins.

This contract is of the core primitives: get, put and del, on a box and on a vault. delRaw, tidyBoxes, tidyGone and their like are, as their names signal, no part of them: they are housekeeping utilities, there to remediate a state the primitives cannot mend. A guarantee below is a guarantee of the primitives. A housekeeping call may end one, and the guarantee says so where it can.

### Flags

op is get, put or del. Vault ops use the same three on the vault row.

- **ifAbsent** (get, put): what to do when the box is void or a tombstone. get: nil returns the absence as an ok result; fail refuses (`box_void`, `box_gone`). put: add creates the box (born, or reborn over a tombstone); fail refuses.
- **ifPresent** (put only): what to do when the box is live. repl replaces it; get returns it unchanged (passed); fail refuses (`box_camped`).
- del takes no flags.
- **`vault_tok`, `box_tok`**: unguessable random strings the device mints, so a token names one life of the row: minted when the row is created (over void or a tombstone) and unchanged by later writes, delete included. Separately, every write (create, update, delete) gives the row a new revision: a fresh `revision_tok` and `revision_seq + 1`. A box records its vault's `vault_tok` but never the vault's revision, and a vault write never touches its boxes' revisions. The token columns in the tables compare revision tokens.
- In the `b_tok` column: eq = the stored token is the one you cited; =next = it is the one this request would write; other = neither; match = you cited the sentinel's token and the box is void, so there is no stored token to compare; — = not sent (get sends no box revision).
- In the `b_seq` column: birth = you cited the sentinel's seq, `-1`; nonbirth = any other seq, cited against a void; stale, equal, ahead = the seq you cited is below, at or above the stored one; =next = the stored seq is the one this request would write.

## Rules

### Revisions

Each box request names its vault's life token (`vault_tok`), never the vault's revision; each vault put or del names the vault's revision.

Each modification (put or del) also names:

- the row it expects to find: its revision (token, seq), its life token, and whether it is live
- a next proposed revision (token, seq+1) for the box

The two sequence numbers must be integers and differ by one.

The sentinel row stands for a void, and a request over a void cites it as the expected row. Its revision is seq `-1` with a crafted `revision_tok`: one fixed value that no mint produces. That request's proposed revision is seq `0` with a random `revision_tok`, never equal to the crafted one. A stored seq is 0 or more (C11), so no stored row carries the sentinel's revision. An expected revision cites the sentinel whole or not at all: the crafted `revision_tok` with any seq but `-1`, or seq `-1` with any other `revision_tok`, is a half-sentinel and refuses `bad_record`.

Revision tokens are minted fresh at every write, delete included: a `revision_tok` names one exact row version. Life tokens (`vault_tok`, `box_tok`) change only when the row is created. If the two request revision tokens are the same, refuses `bad_record`. The proposed revision travels unencrypted as well as sealed, so that it can be stored and compared. The same comparison runs at both levels:

| Expected seq vs stored seq | Expected Token eq           | Expected Token neq          |
| -------------------------- | --------------------------- | --------------------------- |
| birth against a row        | (no row has that token)     | stale (expected)            |
| birth against void         | match                       | match                       |
| stale                      | clash (impossible)          | stale (expected)            |
| equal                      | match                       | forked (impossible)         |
| =next                      | (reput/redel/retcon, below) | (reput/redel/retcon, below) |
| ahead                      | ahead (impossible)          | ahead (impossible)          |
| nonbirth against void      | ahead (impossible)          | ahead (impossible)          |

A clash is a cited `revision_tok` that is the stored one, while something else the request cites of that row is not what is stored: its seq, its life token, or whether it is live. A `revision_tok` names one exact row version, so the classifier checks all three on a token match.

Proposed revision already stored (box): the stored token equals the *proposed* (next) token, the one this put or del would write. If the revision seq also matches, and the proposed op (put/del) matches what's stored (live/tombstone), it is `box_reput` or `box_redel`. Any other such match is `box_retcon`. A vault's are `vault_reput`, `vault_redel` and `vault_retcon`.

All three are refusals: this request wrote nothing, and the row stored at its proposed revision
is in `dbhas`. The contract says nothing of how that row came to be stored, nor whether it is the
record this request carries. A del that cites the tombstone itself is not among them: it stays `box_dubdel`:
the caller expected there would be a tombstone yet called `del` anyway

### Soft caps

A vaultDB may cap how many live boxes a vault holds, and refuse a put that would add one with `vault_full`. The cap is soft. The count behind it is not taken transactionally and is not guaranteed accurate: on some datastores an exact count would mean a lock on every writer. So a vault may come to hold more boxes than its cap, and a put may refuse a little under it. Where the cap's check falls among the other checks is not assured either: a put that would refuse for another reason may refuse `vault_full` instead, or the other way about. A host that requires a hard cap installs, and migrates, triggers of its own in its datastore.

The classifier takes no part in the cap: it is handed no count, and `vault_full` is not among its acts. The vaultDB refuses it on its own, so no row of the tables below names it.

### Listings

A listing answers, for each box it lists, what a get of that box would answer in the same atomic unit. A listing is not guaranteed to cursor, and may be capped in length: it need not list every box.

### Operational Checks

Precedence, first match wins, for a box:

1. Request shape, before any operation: `bad_op`; `bad_record` (malformed payload, or next seq not prior seq + 1, or next `revision_tok` equal to the expected one, or a half-sentinel expected revision, or a life token changed or kept against C7 or C8, or a record that would be stored damaged, C13).
2. Vault damaged.
3. Vault void: no vault row stops at `vault_void`. Box ops never create a vault.
4. Vault life: the request's `vault_tok` must equal the stored `vault_tok`, else `vault_mismatch`; a tombstone carrying your `vault_tok` stops at `vault_gone`. Box ops never compare the vault's revision.
5. Box damaged: every op returns `box_damaged` with the damaged row; a separate delRaw command clears it.
6. Box at the proposed revision: `box_reput`, `box_redel`, or `box_retcon`.
7. Box revision: the expected revision is not the stored one. Refuses `box_ahead`, `box_forked`, `box_clash` or `box_stale`. A token match whose cited life token or state is not the stored one is a clash too (C14).
   1. Exception: a stale put with `ifPresent=get` that meets a live row answers that row, with act `passed`. Stale here is the sentinel cited against a row, or an earlier seq under another token.
   2. Exception: a stale del that meets a tombstone refuses `box_gone`, not `box_stale`.
8. Revision matched: the stored state picks the flag (live consults ifPresent; void or tombstone consults ifAbsent) and the flag picks the outcome. Silly combinations arrive here and get the refusal they asked for.

The soft cap stands outside this order: a put that would add a live box may refuse `vault_full` at any step past the first (*Soft caps*).

Returning:

- An ok result returns the actual stored value in `val`
- Many refusals return the actual stored value in a sidechannel `dbhas` field: a ticket to try again. `box_void` returns dbnil
- A damaged row that has a valid scope returns in `damaged_row`
- Every response, ok or refused, carries the world back: the whole vault row, or the sentinel row where the vault is void.
- A vault-level refusal of a box op returns no `dbhas` (`err` in the tables): the vault row it met is its world.

## Box ops table

Rows run in precedence order. `@` = any value; `—` = not sent; `=next` = the stored value equals the next revision this request would write; `(null)` = no box row can exist. Flags are ifAbsent/ifPresent.

### Vault issues (G1–G7)

Every box op passes this gate first. Past it, the vault is live with the `vault_tok` you cited and the box isn't damaged, so the get, put and del tables leave those columns out.

| #   |    op    | flags   | `v_tok` | vault       | box     | act                                                       | returning | result |
| --- | :------: | ------- | :-----: | ----------- | ------- | --------------------------------------------------------- | :-------: | ------ |
| G1  |    @     | invalid |    @    | @           | @       | `bad_op` (unknown op or flags, or no `vault_tok`)         |    err    | 🌀      |
| G2  | put, del | valid   |    @    | @           | @       | `bad_record` (malformed reqval)                           |    err    | 🌀      |
| G2  | put, del | valid   |    @    | @           | @       | `bad_record` (next `revision_tok` = cited `revision_tok`) |    err    | 🌀      |
| G2  | put, del | valid   |    @    | @           | @       | `bad_record` (next seq ≠ prior + 1)                       |    err    | 🌀      |
| G2  | put, del | valid   |    @    | @           | @       | `bad_record` (half-sentinel cited revision)               |    err    | 🌀      |
| G2  | put, del | valid   |    @    | @           | @       | `bad_record` (record's scope or `vault_tok` is not the one addressed) |    err    | 🌀      |
| G2  | put, del | valid   |    @    | @           | @       | `bad_record` (a proposed token is the sentinel's)         |    err    | 🌀      |
| G2  | put, del | valid   |    @    | @           | @       | `bad_record` (a put proposing a tombstone, or a del a live record) |    err    | 🌀      |
| G3  |    @     | @       |    @    | damaged     | @       | `vault_damaged`                                           |    err    | 🌀      |
| G4  |    @     | @       |    @    | void        | @       | `vault_void` (no vault has ever had this scope)           |    err    | 🌀      |
| G5  |    @     | @       |   neq   | live / gone | @       | `vault_mismatch` (the vault was re-created since)         |    err    | 🔁      |
| G6  |    @     | @       |   eq    | gone        | @       | `vault_gone`                                              |    err    | 🔁      |
| G7  |    @     | @       |   eq    | live        | damaged | `box_damaged`                                             |  damaged  | 🌀      |

`v_tok` compares the request's `vault_tok` (a life token) with the stored one. Box ops never compare the vault's revision, so a vault update never makes a box request stale; the world, the whole vault row, still comes back on every response. G3–G7 apply to well-formed requests, and a box carrying an older `vault_tok` (a leftover) counts as void in the op tables.

## Operations

Result: 🫱 / 🔲 / 🪦 got live / void / tombstone · 👍 saved (reqval) · ❎ deleted (tombstone) · 🟰 no change · 🧨 refused, as a `fail` flag asked · 🔁 refused: an expected situation, and the customer can remediate · 🌀 refused, unexpected, damaged or impossible. Confidence: 💯 the only good choice · ✅ the right choice · 🤷 judgment call.

### get

| abbr | `b_tok` | `b_seq` | flags | box    | act        | returning | result |
| ---- | :-----: | ------- | :---: | ------ | ---------- | --------- | :----: |
| GV1  |    —    | —       |  nil  | *void* | `void`     | null      |   🔲    |
| GV2  |    —    | —       | fail  | *void* | `box_void` | dbnil     |   🧨    |
|      |         |         |       |        |            |           |        |
| GG1  |    —    | —       |  nil  | *gone* | `gone`     | tombstone |   🪦    |
| GG2  |    —    | —       | fail  | *gone* | `box_gone` | dbhas     |   🧨    |
|      |         |         |       |        |            |           |        |
| GL1  |    —    | —       |   @   | *live* | `got`      | **same**  |   🫱    |

Coverage check: get sends no box revision, so 3 box states × 2 ifAbsent values = 6 cases in 5 rows; ifAbsent doesn't matter on a live box.

#### put

| abbr | `b_tok` | `b_seq`  | flags |        | act          | returning  | result |
| ---- | :-----: | -------- | :---: | ------ | ------------ | ---------- | :----: |
| PV1  |  match  | birth    |  add  | *void* | `born`       | **reqval** |   👍    |
| PV2  |  match  | birth    | fail  | *void* | `box_void`   | dbnil      |   🧨    |
| PV3  |    @    | nonbirth |   @   | *void* | `box_ahead`  | dbnil      |   🌀    |
|      |         |          |       |        |              |            |        |
| PG1  |  =next  | =next    |   @   | *gone* | `box_retcon` | dbhas      |   🌀    |
| PG2  |  =next  | ≠next    |   @   | *gone* | `box_retcon` | dbhas      |   🌀    |
| PG3  |  other  | birth    |   @   | *gone* | `box_stale`  | dbhas      |   🔁    |
| PG4  |  other  | stale    |   @   | *gone* | `box_stale`  | dbhas      |   🔁    |
| PG5  |   eq    | stale    |   @   | *gone* | `box_clash`  | dbhas      |   🌀    |
| PG6  |  other  | equal    |   @   | *gone* | `box_forked` | dbhas      |   🌀    |
| PG7  |  other  | ahead    |   @   | *gone* | `box_ahead`  | dbhas      |   🌀    |
| PG8  |   eq    | ahead    |   @   | *gone* | `box_ahead`  | dbhas      |   🌀    |
| PG9  |   eq    | equal    |  add  | *gone* | `reborn`     | **reqval** |   👍    |
| PG10 |   eq    | equal    | fail  | *gone* | `box_gone`   | dbhas      |   🧨    |
|      |         |          |       |        |              |            |        |
| PL2  |  =next  | =next    |   @   | *live* | `box_reput`  | dbhas      |   🔁    |
| PL1  |  =next  | ≠next    |   @   | *live* | `box_retcon` | dbhas      |   🌀    |
| PL4r |  other  | birth    | repl  | *live* | `box_stale`  | dbhas      |   🔁    |
| PL4f |  other  | birth    | fail  | *live* | `box_stale`  | dbhas      |   🔁    |
| PL3  |  other  | birth    |  get  | *live* | `passed`     | **same**   |   🟰    |
| PL6  |  other  | stale    |  get  | *live* | `passed`     | **same**   |   🟰    |
| PL5r |  other  | stale    | repl  | *live* | `box_stale`  | dbhas      |   🔁    |
| PL5f |  other  | stale    | fail  | *live* | `box_stale`  | dbhas      |   🔁    |
| PL7  |   eq    | stale    |   @   | *live* | `box_clash`  | dbhas      |   🌀    |
| PL8  |  other  | equal    |   @   | *live* | `box_forked` | dbhas      |   🌀    |
| PL9  |  other  | ahead    |   @   | *live* | `box_ahead`  | dbhas      |   🌀    |
| PL10 |   eq    | ahead    |   @   | *live* | `box_ahead`  | dbhas      |   🌀    |
| PL11 |   eq    | equal    | repl  | *live* | `replaced`   | reqval     |   👍    |
| PL12 |   eq    | equal    |  get  | *live* | `passed`     | **same**   |   🟰    |
| PL13 |   eq    | equal    | fail  | *live* | `box_camped` | dbhas      |   🧨    |

Coverage check: void has 2 seq values × 2 ifAbsent values = 4 cases in 3 rows. Gone has 9 `b_tok` × `b_seq` pairs, one split by ifAbsent, in 10 rows. Live has 9 pairs, three split by ifPresent, in 15 rows.

Soft cap: a put that would be `born` or `reborn` may refuse `vault_full` instead (err, 🔁). Its timing relative to the rows above is not assured (*Soft caps*).

### del

| abbr | `b_tok` | `b_seq`  | flags | box    | act          | returning     | result |
| ---- | :-----: | -------- | :---: | ------ | ------------ | ------------- | :----: |
| DV1  |  match  | birth    |       | *void* | `box_void`   | dbnil         |   🔁    |
| DV2  |    @    | nonbirth |       | *void* | `box_ahead`  | dbnil         |   🌀    |
|      |         |          |       |        |              |               |        |
| DG1  |  =next  | =next    |       | *gone* | `box_redel`  | dbhas         |   🔁    |
| DG2  |  =next  | ≠next    |       | *gone* | `box_retcon` | dbhas         |   🌀    |
| DG3  |  other  | birth    |       | *gone* | `box_gone`   | dbhas         |   🔁    |
| DG4  |  other  | stale    |       | *gone* | `box_gone`   | dbhas         |   🔁    |
| DG5  |   eq    | stale    |       | *gone* | `box_clash`  | dbhas         |   🌀    |
| DG6  |  other  | equal    |       | *gone* | `box_forked` | dbhas         |   🌀    |
| DG7  |  other  | ahead    |       | *gone* | `box_ahead`  | dbhas         |   🌀    |
| DG8  |   eq    | ahead    |       | *gone* | `box_ahead`  | dbhas         |   🌀    |
| DG9  |   eq    | equal    |       | *gone* | `box_dubdel` | dbhas         |   🔁    |
|      |         |          |       |        |              |               |        |
| DL2  |  =next  | =next    |       | *live* | `box_retcon` | dbhas         |   🌀    |
| DL1  |  =next  | ≠next    |       | *live* | `box_retcon` | dbhas         |   🌀    |
| DL3  |  other  | birth    |       | *live* | `box_stale`  | dbhas         |   🔁    |
| DL4  |  other  | stale    |       | *live* | `box_stale`  | dbhas         |   🔁    |
| DL5  |   eq    | stale    |       | *live* | `box_clash`  | dbhas         |   🌀    |
| DL6  |  other  | equal    |       | *live* | `box_forked` | dbhas         |   🌀    |
| DL7  |  other  | ahead    |       | *live* | `box_ahead`  | dbhas         |   🌀    |
| DL8  |   eq    | ahead    |       | *live* | `box_ahead`  | dbhas         |   🌀    |
| DL9  |   eq    | equal    |       | *live* | `deleted`    | **tombstone** |   ❎    |

Coverage check: void has 2 seq values in 2 rows. Gone and live each have 9 `b_tok` × `b_seq`
pairs in 9 rows (eq with birth can't occur). del has no flags, so nothing splits further.

## Vault ops table

Same ops, flags and conventions as the box table, applied to the vault row. Two things to note:
get sends no vault revision (how a new device bootstraps); del keeps `vault_tok` but,
like every write, carries a next revision.

### Unconditional errors (V1–V3)

Every vault op passes these first, whatever revision it cites.

| #   |    op    | flags   |  vault  | act           |                                        | returning | result |
| --- | :------: | ------- | :-----: | ------------- | -------------------------------------- | --------- | :----: |
| V1  |    @     | invalid |    @    | bad_op        |                                        | err       |   🌀    |
| V2  | put, del | @       |    @    | bad_record    | malformed request record               | err       |   🌀    |
| V2  | put, del | @       |    @    | bad_record    | next seq ≠ prior + 1                   | err       |   🌀    |
| V2  | put, del | @       |    @    | bad_record    | next revision_tok = cited revision_tok | err       |   🌀    |
| V2  | put, del | @       |    @    | bad_record    | sentinel revision_tok but seq != -1    | err       |   🌀    |
| V2  | put, del | @       |    @    | bad_record    | non-sentinel revision_tok but seq = -1 | err       |   🌀    |
| V2  | put, del | @       |    @    | bad_record    | record's scope is not the one addressed | err       |   🌀    |
| V2  | put, del | @       |    @    | bad_record    | a proposed token is the sentinel's     | err       |   🌀    |
| V2  | put, del | @       |    @    | bad_record    | a put proposing a tombstone, or a del a live record | err       |   🌀    |
| V2  |   put    | @       |    @    | bad_record    | (gating checks)                        | err       |   🌀    |
| V3  |    @     | @       | damaged | vault_damaged |                                        | damaged   |   🌀    |

### Vault get

| #    | `v_tok` | `v_seq` | flags | vault  | act          | returning     | result |
| ---- | :-----: | ------- | :---: | ------ | ------------ | ------------- | :----: |
| VGV1 |    —    | —       |  nil  | *void* | `void`       | **null**      |   🔲    |
| VGV2 |    —    | —       | fail  | *void* | `vault_void` | dbnil         |   🧨    |
|      |         |         |       |        |              |               |        |
| VGG1 |    —    | —       |  nil  | *gone* | `gone`       | **tombstone** |   🪦    |
| VGG2 |    —    | —       | fail  | *gone* | `vault_gone` | dbhas         |   🧨    |
|      |         |         |       |        |              |               |        |
| VGL1 |    —    | —       |   @   | *live* | `got`        | **same**      |   🫱    |

Coverage check: vault get sends no vault revision, so 3 vault states × 2 flags values = 6 cases in 5 rows; flags don't matter on a live vault.

### Vault put

| #     | `v_tok` | `v_seq`  | flags | vault  | act            | returning  | result |
| ----- | :-----: | -------- | :---: | ------ | -------------- | ---------- | :----: |
| VPV1  |  match  | birth    |  add  | *void* | `born`         | **reqval** |   👍    |
| VPV2  |  match  | birth    | fail  | *void* | `vault_void`   | dbnil      |   🧨    |
| VPV3  |    @    | nonbirth |   @   | *void* | `vault_ahead`  | dbnil      |   🌀    |
|       |         |          |       |        |                |            |        |
| VPG1  |  =next  | =next    |   @   | *gone* | `vault_retcon` | dbhas      |   🌀    |
| VPG2  |  =next  | ≠next    |   @   | *gone* | `vault_retcon` | dbhas      |   🌀    |
| VPG3  |  other  | birth    |   @   | *gone* | `vault_stale`  | dbhas      |   🔁    |
| VPG4  |  other  | stale    |   @   | *gone* | `vault_stale`  | dbhas      |   🔁    |
| VPG5  |   eq    | stale    |   @   | *gone* | `vault_clash`  | dbhas      |   🌀    |
| VPG6  |  other  | equal    |   @   | *gone* | `vault_forked` | dbhas      |   🌀    |
| VPG7  |  other  | ahead    |   @   | *gone* | `vault_ahead`  | dbhas      |   🌀    |
| VPG8  |   eq    | ahead    |   @   | *gone* | `vault_ahead`  | dbhas      |   🌀    |
| VPG9  |   eq    | equal    |  add  | *gone* | `reborn`       | **reqval** |   👍    |
| VPG10 |   eq    | equal    | fail  | *gone* | `vault_gone`   | dbhas      |   🧨    |
|       |         |          |       |        |                |            |        |
| VPL2  |  =next  | =next    |   @   | *live* | `vault_reput`  | dbhas      |   🔁    |
| VPL1  |  =next  | ≠next    |   @   | *live* | `vault_retcon` | dbhas      |   🌀    |
| VPL4r |  other  | birth    | repl  | *live* | `vault_stale`  | dbhas      |   🔁    |
| VPL4  |  other  | birth    | fail  | *live* | `vault_stale`  | dbhas      |   🔁    |
| VPL5r |  other  | stale    | repl  | *live* | `vault_stale`  | dbhas      |   🔁    |
| VPL5  |  other  | stale    | fail  | *live* | `vault_stale`  | dbhas      |   🔁    |
| VPL3  |  other  | birth    |  get  | *live* | `passed`       | **same**   |   🟰    |
| VPL6  |  other  | stale    |  get  | *live* | `passed`       | **same**   |   🟰    |
| VPL7  |   eq    | stale    |   @   | *live* | `vault_clash`  | dbhas      |   🌀    |
| VPL8  |  other  | equal    |   @   | *live* | `vault_forked` | dbhas      |   🌀    |
| VPL9  |  other  | ahead    |   @   | *live* | `vault_ahead`  | dbhas      |   🌀    |
| VPL10 |   eq    | ahead    |   @   | *live* | `vault_ahead`  | dbhas      |   🌀    |
| VPL13 |   eq    | equal    | repl  | *live* | `replaced`     | reqval     |   👍    |
| VPL11 |   eq    | equal    |  get  | *live* | `passed`       | **same**   |   🟰    |
| VPL12 |   eq    | equal    | fail  | *live* | `vault_camped` | dbhas      |   🧨    |

Coverage check: void has 2 seq values × 2 ifAbsent values = 4 cases in 3 rows. Gone has 9 `v_tok` × `v_seq` pairs, one split by ifAbsent, in 10 rows. Live has 9 pairs, three split by ifPresent, in 15 rows.

### Vault del

| #    | `v_tok` | `v_seq`  | flags | vault  | act                 | returning     | result |
| ---- | ------- | -------- | :---: | ------ | ------------------- | ------------- | ------ |
| VDV1 | match   | birth    |       | *void* | `vault_void`        | dbnil         | 🔁      |
| VDV2 | @       | nonbirth |       | *void* | `vault_ahead`       | dbnil         | 🌀      |
|      |         |          |       |        |                     |               |        |
| VDG1 | =next   | =next    |       | *gone* | `vault_redel`       | dbhas         | 🔁      |
| VDG2 | =next   | ≠next    |       | *gone* | `vault_retcon`      | dbhas         | 🌀      |
| VDG3 | other   | birth    |       | *gone* | `vault_gone`        | dbhas         | 🔁      |
| VDG4 | other   | stale    |       | *gone* | `vault_gone`        | dbhas         | 🔁      |
| VDG5 | eq      | stale    |       | *gone* | `vault_clash`       | dbhas         | 🌀      |
| VDG6 | other   | equal    |       | *gone* | `vault_forked`      | dbhas         | 🌀      |
| VDG7 | other   | ahead    |       | *gone* | `vault_ahead`       | dbhas         | 🌀      |
| VDG8 | eq      | ahead    |       | *gone* | `vault_ahead`       | dbhas         | 🌀      |
| VDG9 | eq      | equal    |       | *gone* | `vault_dubdel`      | dbhas         | 🔁      |
|      |         |          |       |        |                     |               |        |
| VDL2 | =next   | =next    |       | *live* | `vault_retcon`      | dbhas         | 🌀      |
| VDL1 | =next   | ≠next    |       | *live* | `vault_retcon`      | dbhas         | 🌀      |
| VDL3 | other   | birth    |       | *live* | `vault_stale`       | dbhas         | 🔁      |
| VDL4 | other   | stale    |       | *live* | `vault_stale`       | dbhas         | 🔁      |
| VDL5 | eq      | stale    |       | *live* | `vault_clash`       | dbhas         | 🌀      |
| VDL6 | other   | equal    |       | *live* | `vault_forked`      | dbhas         | 🌀      |
| VDL7 | other   | ahead    |       | *live* | `vault_ahead`       | dbhas         | 🌀      |
| VDL8 | eq      | ahead    |       | *live* | `vault_ahead`       | dbhas         | 🌀      |
| VDL9 | eq      | equal    |       | *live* | `deleted` (+ boxes) | **tombstone** | ❎      |

Coverage check: void has 2 seq values in 2 rows. Gone and live each have 9 `v_tok` × `v_seq` pairs in 9 rows.

Where the vault differs from the box table, and why:

- VPG1, VDG1, VDL1–VDL2: a vault delete writes a new revision, so a del whose proposed revision is already stored is recognized (`vault_redel`) as a box's is, and a tombstone at the revision your create would write is impossible (VPG1).
- VPG10 and VPL12 return `dbhas`: the stored row is the ticket to re-create or retry.
- A vault put with `ifPresent=repl` replaces a live vault in place, as a box put does: a fresh `revision_tok`, seq + 1, the same `vault_tok` (C7). It touches no box, and it makes no box request stale, since a box request cites the vault's life token and never its revision.

## Roles

Three roles take part in every call, and each rule below names the one it binds.

- **vaultDB**: the core's `VaultDB`, the interface a model calls. It checks the request's shape before anything is fetched (`bad_op`, `bad_record`), and it answers: `act`, `val`, `world`, `dbhas`. It owns the **classifier**, the shared pure function that takes the request and the rows fetched, names the `act`, and says what to write, if anything. Every judgment in the tables above is the classifier's.
- **adapter**: the package that carries a vaultDB call to one kind of datastore. It opens the atomic unit, fetches the rows, hands them to the classifier, writes what the classifier said, and hands the rows back. It judges nothing.
- **datastore**: the engine that holds the vault and box rows: Postgres, IndexedDB, a host's backend. It must offer a unique key per scope, and an atomic unit that spans a fetch and a write. It may also take part, with constraints, foreign keys or stored procedures that enforce these same invariants and checks a second time. That is allowed and never required, it decides no outcome in the tables, and its detail is outside this note.

## Scope and consistency checks

Two primary keys locate every row, and the datastore enforces them. Every other invariant below names the check it implies and the refusal when it fails.

- **`vault_scope`**: an opaque identifier built from applabel, `user_id` and vaultlabel. Primary key of the vault table.
- **`box_scope`**: `vault_scope` + boxlabel. Primary key of the box table.

| #   | Invariant                                                                                           | Enforced by                                                            | Check                                                                                                                                    | On failure                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| C1  | `vault_scope` and boxlabel in a request are well formed                                             | vaultDB, before anything is fetched                                    | parse and validate                                                                                                                       | `bad_op`                                                                                                     |
| C2  | One vault row per `vault_scope`, kept as a tombstone after delete                                   | datastore primary key                                                  | vault create is an insert-if-absent                                                                                                      | `vault_stale`                                                                                                |
| C3  | One box row per `box_scope`, kept as a tombstone after delete                                       | datastore primary key                                                  | born is an insert-if-absent                                                                                                              | `box_stale`                                                                                                  |
| C4  | A stored box's `vault_scope` and boxlabel match the key it was found under                          | datastore key; the classifier checks the rows it is handed             | compare the stored scope fields with the request                                                                                         | `box_damaged`                                                                                                |
| C5  | A box's `vault_tok` equals its vault's current `vault_tok`                                          | composite foreign key (`vault_scope`, `vault_tok`) or the classifier   | box.`vault_tok` = vault.`vault_tok`                                                                                                      | impossible under the foreign key; else a leftover: it counts as void, born replaces it, tidyBoxes removes it |
| C6  | A box is reachable only under a live vault                                                          | classifier: the vault gate runs before any box check                   | vault state is live                                                                                                                      | `vault_gone` (G6)                                                                                            |
| C7  | `vault_tok` changes on every vault create and on nothing else                                       | vaultDB, in the request                                                | create or re-create: proposed `vault_tok` ≠ expected `vault_tok` (the sentinel's or the tombstone's); update or del: proposed = expected | `bad_record`                                                                                                 |
| C8  | `box_tok` changes on every box create (born, reborn) and on nothing else                            | vaultDB, in the request                                                | born or reborn: proposed `box_tok` ≠ expected `box_tok` (the sentinel's or the tombstone's); replace or del: proposed = expected         | `bad_record`                                                                                                 |
| C9  | Every write gets a fresh `revision_tok`, and within one life of a row `revision_seq` rises by exactly one | vaultDB, in the request                                                | proposed seq = expected seq + 1, and proposed `revision_tok` ≠ expected `revision_tok`                                                   | `bad_record`                                                                                                 |
| C9  | Every write gets a fresh `revision_tok`, and within one life of a row `revision_seq` rises by exactly one | classifier                                                             | stored revision = expected revision                                                                                                      | `box_stale` or `vault_stale`, or a defect of step 7                                                          |
| C10 | The write lands on the row the classifier saw                                                       | the atomic unit: the adapter fetches, classifies and writes inside one | —                                                                                                                                        | impossible, by the atomic unit; a write that misses is an adapter defect, and throws                         |
| C11 | A stored row is well formed: tokens present, seq an integer >= 0, live or gone                      | classifier, on every row it is handed                                  | shape check                                                                                                                              | `vault_damaged` or `box_damaged`                                                                             |
| C12 | Every response carries the world back: the whole vault row                                          | vaultDB, on every response                                             | —                                                                                                                                        | —                                                                                                            |
| C13 | A write never stores a row the next fetch would judge damaged | vaultDB, in the request | the proposed record's scope and `vault_tok` are those addressed; no proposed token is the sentinel's; a put proposes a live record and a del a tombstone | `bad_record` |
| C14 | The row a request expects is the row stored | classifier, on a `revision_tok` match | expected seq, life token and state = the stored row's | `box_clash` or `vault_clash` |
| C15 | A put or del writes at most once | fresh revision tokens, and tombstones | once its proposed revision is stored, or its expected revision is no longer the stored one, the request writes nothing | none: it refuses as the tables say. delRaw returns a scope to void, and ends this for a request citing the sentinel |

Why boxes carry `vault_tok`: so that nothing has to touch a vault's boxes when the vault changes. Delete keeps
`vault_tok`, so a box still stored under a deleted vault stays hidden behind the gate (C6). Re-create mints a new
`vault_tok`, so that box is then a leftover (C5). A datastore that can't remove a vault's boxes in the vault
delete's own atomic unit is still correct.

## Adapter contract

Each rule is one testable statement about what an adapter does. An atomic unit is one statement or one transaction; the adapter may use either.

### Fetching

- Inside one atomic unit, the adapter fetches the vault row by `vault_scope` and the box row by `box_scope`, with no filter on token, seq or state.
- No vault row means the vault is void, and no box row means the box is void; nothing else produces void.

### Classifying

- The adapter hands the rows it fetched, unaltered, to the classifier, and makes no outcome decision itself.
- The classifier is a pure function: the same request and rows always give the same outcome.
- The classifier, not the adapter, judges damage. A stored box whose `vault_scope` or boxlabel differs from the request's is `box_damaged`. A stored row with a missing token, a non-integer seq, an unknown state, a value on a tombstone or no value on a live row is `vault_damaged` or `box_damaged`.
- The classifier, not the adapter, judges a leftover: a stored box whose `vault_tok` differs from the vault's current `vault_tok` belongs to an earlier vault life. It counts as void and is never answered.

### Writing

- A write happens only when the outcome is born, reborn, replaced or deleted, and in the same atomic unit that fetched the rows the classifier judged. Nothing else writes those rows in between, so a write never misses.
- A write changes exactly one row, the one the classifier was handed, or inserts one where it was handed none.
- born inserts where no row exists for the `box_scope`, or replaces a leftover row from an earlier vault life where one stands.
- Every write stores the proposed revision: the proposed `revision_tok`, at seq = stored seq + 1. Within one life of a row, its seq therefore rises by exactly one at each write.
- Across a rebirth the seq is no part of the contract. A reborn row goes on from its tombstone's seq, and is built and tested so, but nothing may depend on the seq across a rebirth, either way.
- born and reborn store the proposed `box_tok`, which differs from the tombstone's; replace and delete leave `box_tok` unchanged.
- delete stores a tombstone (state gone, no value, the proposed `revision_tok`, seq + 1, same `box_tok`) and never removes the row; only delRaw removes rows.
- Every successful modification, delete included, writes a new revision; deleting a tombstone refuses (`box_dubdel`, `vault_dubdel`) and leaves the revision unchanged.
- Vault delete sets state gone, writes a new revision (the proposed `revision_tok`, seq + 1) and leaves `vault_tok` unchanged; afterwards no box op under that `vault_scope` returns a live box until the vault has been re-created.
- Vault delete removes every box of that vault life (box.`vault_tok` = the deleted `vault_tok`), in the same atomic unit where the datastore can. Where it can't, those boxes stay hidden behind the gate (C6) until tidyBoxes removes them, and are leftovers (C5) once the vault is re-created.
- Vault re-create stores the proposed `vault_tok`, which differs from the tombstone's, with seq = stored seq + 1.
- Vault replace stores the proposed revision and leaves `vault_tok` unchanged.
- No write copies a new `vault_tok` onto existing boxes; a foreign key from (box.`vault_scope`, box.`vault_tok`) to the vault, where declared, never cascades updates.
- A put or del writes at most once (C15): once its proposed revision is stored, or its expected revision is no longer the stored one, it writes nothing.
- A put that would add a live box may refuse `vault_full` under the vaultDB's soft cap. The count is an estimate, taken outside any lock, and the check may run at any point in the atomic unit (*Soft caps*).
- A refusal never writes.

### Responding

- Every response carries the world back: the whole vault row as the atomic unit leaves it, which is as fetched, or as written by a vault op.
- An ok write answers the request's own record (`reqval`); nothing is fetched after the write.
- A refusal returns dbhas with the row as fetched in the deciding atomic unit, or dbnil when there is no row.

### What the datastore offers

- Required: a unique key per scope. `vault_scope` keys the vault table and (`vault_scope`, boxlabel) keys the box table, so a scope never has two rows.
- Required: an atomic unit that spans the fetch and the write of a get, put or del. tidyBoxes asks for none beyond each conditioned delete.
- Allowed, never required: the datastore enforces an invariant itself, by a foreign key (C5), a check constraint, a condition on the write, or a stored procedure that runs these checks. Such a check agrees with the classifier, or the adapter has a defect; it never decides an outcome.

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
- second capture holds only the current `vault_tok` group, or no boxes when the vault is void or a tombstone
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
