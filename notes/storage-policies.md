# Storage policies

A storage policy (`StoragePolicy`) decides whether a write may replace a live Thing, by what it demands of the ask and
of the prior row: the row the write is judged against. An ask names the policies it is under in `options.policies`, and
one that names none is under none. Only a gate's write names any, and the gating code names exactly one per write, the
one for its gating. The vaultDB refuses, at its entry, a bank's or a box's write that names a policy, a del that names
one, and a `replace_passphrase` write whose cited gate has no `main` wayin.

## The gate policies

A policy judges only a write over a live gate: over no gate or a tombstone, each verdict is met, so a birth meets every
policy. A failed verdict refuses the write only where the put table would otherwise let it replace the live gate, so
the prior row it was judged against is the revision the ask cites.

Refused by a policy, the act is `policied`: nothing is written, and the write is refused `gate_issue`, with the actual
row (the prior row, unchanged) as `dbhas`. A write that also changes the gate's `born_at` is refused `bad_record`
instead, whatever policy it names.

Each table has one row per demand. Each row is one line of the policy's function in `GatePolicies`
(`packages/safebyok/src/storage/policies.ts`) and one `WHEN` of its `*_refusal` function in Postgres's
`packages/safebyok-postgres/src/vault-functions.ts`, in the same order. The tag names the refusal's phrase in
`PolicyPhrases`.

### `replace_passphrase`

| # | The write is refused unless | Tag |
|---|---|---|
| RP1 | the cited gate's `main` wayin is the prior row's: the wayin the gating proved against has not moved | `ProvedWayinMoved` |
| RP2 | every wayin of the proposed record but `main` is the prior row's | `OtherWayinMoved` |

RP1 is the only demand on what the gating proved, and it proves little: a caller can copy the prior row's `main`. It is
where a later version can check a change countersigned against the proving wayin. The other two policies need no RP1:
their last row already demands that the proposed record's `main` is the prior row's.

### `add_passkey`

| # | The write is refused unless | Tag |
|---|---|---|
| AP1 | the prior row has no `passkey0` | `PasskeyStored` |
| AP2 | the proposed record has a `passkey0` | `PasskeyNotAdded` |
| AP3 | every wayin of the proposed record but `passkey0` is the prior row's | `OtherWayinMoved` |

### `revoke_passkey`

| # | The write is refused unless | Tag |
|---|---|---|
| RK1 | the prior row has a `passkey0` | `NoPasskeyStored` |
| RK2 | the proposed record has no `passkey0` | `PasskeyNotRevoked` |
| RK3 | every wayin of the proposed record but `passkey0` is the prior row's | `OtherWayinMoved` |

Every adapter passes the battery's cases for each policy (`vaultdb-battery-writes.ts`, *under a storage policy*).

## Where a policy is judged

The datastore judges each policy the ask names in the one atomic step that reads the prior row and writes. It writes
only where every verdict is met, a clause of its write predicate, and hands the verdicts back as its manifest's
`policies` tag: `{ [policy]: { ok: true } | { ok: false, refusaltag } }`, where the `refusaltag` is a `PolicyTag`, a
key of `PolicyPhrases`. `notes/vault-adapter-contract.md` states the contract, under *The tags* and *The write
predicate*.

The device cannot be trusted with this: it runs in the page, beside every script and extension the page loads. The
device builds each gate write from the gate it proved against (`models/gating.ts`), so its own writes meet the policy
they name, and a policy refusal means some other caller sent the write.

* **Memory, IndexedDB and Convex**: `ManifestTags.policiesOf(ask, prior)` makes a verdict for each policy named, through
  `policyVerdictOf`, which calls `GatePolicies`. `isWritable` writes only where each is met, and
  `ManifestTags.writeTagsOf` hands them back, in the same step: one function call, transaction or mutation.
* **Postgres**: SQL copies of the same, check for check and tag for tag: one `*_refusal` function per policy,
  `policy_verdict_of` and `policies_of`. The gate's write function writes only where `policies_met(policies_of(...))`
  holds of the prior row, and `write_tags_of` hands the verdicts back.
* **GraphQL**: the server's datastore judges the policies, whichever datastore the GraphQL server's vaultDB runs over,
  and `GraphQLVaultDB` forwards that vaultDB's answer.

## What the vaultDB makes of the verdicts

`AdapterVaultDB` checks them three ways, the ask, the manifest and the answer each against the others (`three-way.ts`).
Unwritten, the verdicts must be those `ManifestTags.writeTagsOf` makes of the actual row. Written, they must be those
the ask alone lets through: each policy it names met, and no other (`ManifestTags.writtenTagsOf`). Either mismatch
refuses `storage_issue`.

Where the put table finds a write and a verdict fails, the act is `policied`, carrying the verdict's tag. One builder,
`Throwers.taggedRefusal`, makes the refusal: its kind from `RefusalkindForRefusaltag`, its message from
`PhraseForRefusaltag`.

## What the gate policies do not check

No policy checks that a new wayin unwraps, since the datastore cannot unwrap one. A `replace_passphrase` whose new
`main` does not unwrap passes, and so does an `add_passkey` whose `passkey0` does not unwrap. A caller with the host's
session can therefore lock the user out, or add a passkey that unwraps nothing.
