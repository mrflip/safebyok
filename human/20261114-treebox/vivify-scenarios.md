# flat_crypts: vivifying the parentage, by scenario

A proposal under discussion (2026-11-13). Nothing here is in `crypt-contract.md` yet. If agreed, it
replaces that file's *The parent rule*: a create no longer refuses for a parent that is not live,
it makes the parent live.

## The request

A `putCrypt` that may create (`ifAbsent: 'add'`) carries its **heritage**: each ancestor, from the
top down, and then the crypt itself. For `/a/b/c` that is `/a`, `/a/b`, `/a/b/c`.

* **For each ancestor**, what the device has of it, as `expected`. Where that is live, nothing
  more: the proposed version is the current one, which can only be passed, never written. Where it
  is a tombstone or nothing, also a record to put over it: a whisper of `{}` sealed fresh, a new
  `life_tok`, and the revision after the one expected (seq 0 over the shell).
* **For the crypt**, what any put carries: `expected`, `record`, `ifAbsent`, `ifPresent`.
* **One atomic unit.** Each ancestor is judged from the top down, then the crypt. If any refuses,
  nothing is written. The answer has every row of the heritage as stored afterwards, or as found
  where it refused, each with its act, and the bank delivers each one.
* A put with `ifAbsent: 'fail'` carries no heritage: it cannot create, and a live crypt's ancestors
  are live already.

## How an ancestor is judged

**What decides it: a row the request writes must cite exactly what is stored.** Its record's next
revision is sealed into its stamp, so storage cannot rebase it onto a newer row. A row the request
only needs live passes if it is live.

So an ancestor is `ensure`d (`ifAbsent: 'add'`, `ifPresent: 'get'`) under today's put table, with
one change: an ancestor cited live in one life and found live in another refuses, where today's
rule (`PL6`, a stale put with `ifPresent: 'get'`) would pass it. That is today's `vault_reborn`, kept.

| The device cites | live, the life cited | live, another life | the tombstone cited | a later tombstone | void |
|---|---|---|---|---|---|
| live, in life L | `passed` | `stale` | | `stale` | `ahead` |
| a tombstone at revision r | `passed` | `passed` | `reborn`, written | `stale` | `ahead` |
| nothing (the shell) | `passed` | `passed` | | `stale` | `born`, written |

An ancestor's refusal is its own act, on its own idpath: `parent_void` and `parent_gone` are no
longer needed.

## Writing `/a/b/c`

`live` is a live row; `live′` is a live row of another life than the device has; `†` a tombstone;
`†′` a later tombstone than the device has; `–` nothing. The columns `/a`, `/a/b` and `/a/b/c`
give each row's act.

| # | Scenario | Device has | Storage has | `/a` | `/a/b` | `/a/b/c` | Written |
|---|---|---|---|---|---|---|---|
| 1 | Quiet | live, live, – | the same | `passed` | `passed` | `born` | c |
| 2 | A new tree | –, –, – | –, –, – | `born` | `born` | `born` | all three |
| 3 | Another device made `/a` | –, –, – | live, –, – | `passed` | `born` | `born` | b, c |
| 4 | Another device made all three | –, –, – | live, live, live | `passed` | `passed` | by its flags: `passed` under ensure, `stale` under `ifPresent: 'fail'` | none |
| 5 | Another device edited `/a` | live, live, – | live (newer revision, same life), live, – | `passed` | `passed` | `born` | c |
| 6 | Another device deleted `/a` | live, live, – | †, †, – | `stale` | | | none |
| 7 | Another device deleted `/a` and made it again | live, live, – | live′, †, – | `stale` | | | none |
| 8 | The device knows `/a` was deleted | †, †, – | the same | `reborn` | `reborn` | `born` | all three |
| 9 | ... and another device has made it again | †, †, – | live′, †, – | `passed` | `reborn` | `born` | b, c |
| 10 | ... and another device made it again and deleted it again | †, †, – | †′, †, – | `stale` | | | none |
| 11 | Another device deleted only `/a/b` | live, live, – | live, †, – | `passed` | `stale` | | none |
| 12 | This device's own earlier request landed, its answer lost | –, –, – | this device's three rows | `passed` | `passed` | `retcon` | none |
| 13 | Another device's delete of `/a` commits in the same moment | live, live, – | live, live, – | the atomic unit serializes: this first, then the cascade tombstones all three; or the delete first, and it is #6 | | | |
| 14 | `/a/b` is damaged | live, live, – | live, damaged, – | thrown, `damaged_row` naming `/a/b` | | | none |
| 15 | The bank was deleted, or made again | any | | `bank_gone`, `bank_reborn`, before any ancestor | | | none |

* **#6 is the case the rule exists for.** The device has not seen the delete, so it may not undo
  it. The answer carries both tombstones; the bank tombstones what it has below `/a`; the host
  sees `stale`, and a request made again is #8.
* **#7, with the change above.** Under today's rule `/a` would pass, and #7 would still refuse at
  `/a/b`. But a device that had `/a` live and nothing below it would write `/a/b/c` into a life of
  `/a` that another device made, without hearing of it.
* **#8: a crypt made live again by vivifying has a whisper of `{}`.** What it held went with its
  tombstone.
* **#10 cannot be rescued by storage**: the record sealed for `/a` is the revision after `†`, and
  cannot land over `†′`.
* **#12**: the host knows its own write by the `revision_tok` in `dbhas`. The ancestors pass, since
  passing never cites a revision.

## Storage misbehaving

| # | What storage does | What the device sees | Closed by |
|---|---|---|---|
| 16 | Forges a tombstone of `/a` | `stale`: `/a` and all below it look deleted. Denial, not disclosure | signed tombstones: open |
| 17 | Serves a live `/a/b` from an earlier life of `/a`, beside `/a`'s new life | `/a/b` live, and it deciphers: the cipher no longer binds the parent's life | binding something of the parent's life: open, see below |

## Where `life_seq` crosses this (not agreed)

* **If a written row's `life_seq` is sealed, and must be above every `life_seq` stored in its
  heritage**, #3 and #9 refuse: the device does not know the `life_seq` of a row another device
  made. The host makes the request again with the rows the answer carried, one more round trip in
  a race. Alternatives: storage assigns `life_seq` (then unbound, so unsigned); or the device
  proposes the larger of 1 + the highest it has and `written_at`, a hybrid logical clock, so only
  clock skew between devices refuses.
* **That same order would close #17**, with a rule for the reader: a live crypt counts as live only
  if its `life_seq` is above each ancestor's. A parent made again at a higher `life_seq` then ends
  its old children without a tombstone. That is today's `vault_tok` binding, recovered by order.
