# Parse collapse (2026-11-06)

Branch `20261106-parse_collapse`, off main at 57f33ee9. The twenty validator parses
[#509](https://github.com/mrflip/safebyok/pull/509) counted under step 8, each held to the Coach's
rulings: a parse stays where it is a boundary, a pick of fields, a filler of defaults, a stand-in
for an `if (x == null)` precondition, or a cope cage; one that exists only for an alternate kind
takes the default kind; one serving none of those goes. No new code.

## The twenty

| # | Site | Use it serves | Done |
|---|------|---------------|------|
| 1 | `storage/vault-db-new.ts:399`, `SX.boxSparse.parse(parsed.data)` | pick: a listed row's sparse fields from a boxRow | kept; its own kind (`bad_option`), no relabel |
| 2 | `shapes/shapes-storage.ts:285` (`boxTombstoneOf`), `boxSparse.parse(parsed.data)` | pick: the tombstone's sparse fields | kept; its own kind |
| 3 | `models/box.ts:138` (`#unseal`), `VX.boxSparse.parse(record)` | pick: the stamp is exactly the sparse fields | **default kind**: `SX.boxSparse`, `bad_record` to `bad_option` |
| 4 | `models/box.ts:259` (`sealedRecordOf`), `VX.boxSparse.parse(base)` | pick: `base` is the prior record spread with a new revision | **default kind**: `SX.boxSparse`, `bad_record` to `bad_option` |
| 5 | `models/box.ts:262` (`sealedRecordOf`), `VX.boxRecord.parse({ ...sparse, sidecar, ... })` | a build, but it also copies the sidecar (`whisperBag`'s `structuredClone` overwrite), mints the `BoxKeyWrapped`/`WhisperCiphered` brands, and narrows `am` to `'a'` | **left**: removing it is not a bare removal (it needs `am: 'a'` and casts written in, and a ruling on the kept sidecar being shared between records). Its kind is `SX.boxRecord`'s own, no relabel |
| 6 | `models/box-listing.ts:51` (`hello`), `VX.boxesListed.parse(listed)` | boundary: `hello` is a public method on `vault.boxListing`, which the README hands to hosts | kept: a public entry point, parsed by its caller as well (`vault-listing.ts` `fetchListed`). Removed in the first build, restored on the coordinator's correction |
| 7 | `models/gating.ts:182`, `GX.passphraseWayinRecord.parse(nextWayin.pickle())` | precondition: narrows the wayin union to the passphrase kind | **default kind**: the relabel in `shapes-gateish.ts` dropped, `bad_record` to `bad_option` |
| 8 | `models/gating.ts:188`, `GX.passkeyWayinRecord.parse(passkeyWayin.pickle())` | precondition: narrows to the passkey kind | **default kind**: as 7 |
| 9 | `models/proving.ts:84` (`buildLease`), `vaultStamp.parse(friend)` | none: `consistent` compares only fields both bags define, and `this.stamp` defines only the stamp's, so the pick changes nothing; `provingLeaseArgs` checked `friend` the line above | **removed**: `consistent(friend, this.stamp)` |
| 10 | `models/proving.ts:127` (`buildNovel`), `vaultScope.parse(checked)` | none: `checkStrength`'s own `strengthArgs` parse picks the scope out of the stamp | **removed** (`bad_scope` gone): the stamp is passed |
| 11 | `models/vault.ts:254` (`#makeFriend`), `GX.vaultStamp.parse(this)` | pick: the friend spreads the stamp, not the vault | kept |
| 12 | `models/lease.ts:35` (`#leaseStamp`), `leaseStamp.parse(this)` | pick: the stamp out of the lease | kept |
| 13 | `models/lease.ts:43` (constructor), `leaseRecord.parse(record)` | boundary: STYLE.md, *Validation*: "A constructor validates its arguments ... even when the make or build that calls it parsed them already" | kept (see *For the Coach*) |
| 14 | `models/lease.ts:44` (constructor), `leaseStamp.parse(record)` | pick: the stamp tattooed on | kept |
| 15 | `models/lease.ts:46` (constructor), `vaultStamp.parse(friend)` | pick: the stamp every ctx binds | kept |
| 16, 17 | `models/lease.ts:69` (`buildFromCache`), `vaultStamp.parse(checked.data)`, `vaultStamp.parse(friend)` | picks: they choose which fields `consistent` compares; both bags may carry others | kept |
| 18 | `models/lease.ts:80` (`buildGranted`), `vaultStamp.parse(friend)` | pick: the stamp spread into the lease stamp and bound into the ctx | kept |
| 19 | `models/lease.ts:84` (`buildGranted`), `leaseRecord.parse({ ...granted, lease_key, vault_key_lease_wrapped })` | mints the `VaultKeyLeaseWrapped` brand on `wrapKeyUnder`'s `Ciphered` | **left**: removing it needs a cast written in |
| 20 | `models/lease.ts:139` (`sealWith`), `sealedWhisper.parse({ box_key_wrapped, whisper_ciphered })` | mints the two brands on WebCrypto's output (as `shapes-core.ts` `box_key_wrapped`'s example shows) | **left**: removing it needs casts written in |

Not touched, by the ruling: the four clock builds (`vault-listing.ts:64`, `lease.ts:81`,
`proving.ts` wayin headers) and VaultDB's `preparedOf` parses.

## Decisions taken

* **"The default kind" read as the kind the validator has without the relabel.** For a
  `refusingAs`, that is the validator it was cut from (the storage tier's, `bad_option`).
* **Where a relabel is dropped.** `VX.boxSparse`'s relabel still serves `BoxListing.sparseOf`
  (a host's duck, through `Listing.del`), so `box.ts` calls `SX.boxSparse` at its two sites. The
  wayin relabels (`GX.passphraseWayinRecord`, `GX.passkeyWayinRecord`) were parsed only by gating's
  two sites, and nested elsewhere, where the outer validator's kind wins: the relabel is dropped
  where they are made, and `gating.ts` is unchanged.
* **`vaultStamp`'s own `bad_option` stays.** It is an `objCheck` with its own kind, but it is shared
  with the Gate constructor and the clock build in `vault-listing.ts`, which the ruling keeps;
  moving it to the default would move theirs. Its pick sites (11, 15 to 18) are kept as picks.
* **A brand mint is a use.** Rows 19 and 20, and 5 in part, turn WebCrypto's unbranded `Ciphered`
  into the branded field types; without the parse the code needs a cast.

## For the Coach

* **`boxListing.hello`'s `listed` argument should become internal, in a thread of its own.** Row 6
  stays because `hello` is a host-reachable entry point, so `vault.hello`'s listing is parsed twice.
  The better fix is to take `listed` off the public signature (a private feed from the vault
  listing), after which the second parse can go. Recommendation: a thread of its own.
* **Rows 13 and 19 double-check one record at runtime.** Both callers of the private Lease
  constructor hand it a parsed record, and the constructor parses again. STYLE.md keeps the
  constructor's parse; the brand keeps the build's. Recommendation: leave both, unless the Coach
  rules that a private constructor is not an entry point, when 13 goes.
* **Rows 5, 19, 20 stay because of brands and a copy.** Removing them takes a cast or a written
  field. Recommendation: keep.
