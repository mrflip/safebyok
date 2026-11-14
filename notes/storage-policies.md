# Storage policies

A storage policy governs whether a storage operation may proceed. It does that through what it demands of the ask and
of the rows stored. An ask names the policies it is under in `options.policies`. A call that names none is under none.
Each policy below has a table with one row per demand. Each row is one line of the policy's function in
`packages/safebyok-big/src/helpers/policies.ts`, in the same order, and one condition of `safebyok_put_gate` in
`packages/safebyok-postgres/bank-functions.sql`.

The capacity check is another policy, though it is not yet named in `options`: only a box put applies it.

## Where a policy is applied

A policy runs where the store's own code runs, on the rows fetched in the step that stores the record. The device
cannot be trusted with this: the device-side bankDB runs in the page, beside every script and extension the page
loads. The device makes the same checks before it calls (`models/gating.ts`), so an honest device never meets a
refusal. A refusal means some other caller sent the put.

* **`AdapterBankDB`**: `classifyStoredGate` calls `demandPolicies(ask, stored)` once the put table answers
  `replaced`. That calls `demandStorage(ask, stored)`, which applies each policy the ask names. This is the bastion
  where the adapter runs beside the database: memory, IndexedDB, a server's bankDB.
* **Convex**: the component's `putGate` mutation applies `demandStorage` inside Convex.
* **Postgres**: `safebyok_put_gate` holds each policy as conditions of the one statement that stores the record. On a
  refusal, the adapter re-runs the classifier on the rows returned, to name the refusal.

Every adapter passes the same battery cases, one set per policy.

## The gate policies

A `putGate` ask names exactly one, for the gating it carries out. Each applies once the put table has found that the
put would replace the live gate row (`notes/answer-contract.md`, *Gate ops*). So by then the stored row is the row the
ask expected, by its revision and life tokens. A demand that fails refuses `gate_issue`, with the bank row as `parent`
and the stored gate row as `dbhas`, and nothing is stored.

### `replace_passphrase`

| # | The put is refused unless | Phrase |
|---|---|---|
| RP1 | the record's `registered_at` is the stored row's | `RegisteredAtNotStored` |
| RP2 | the expected row's `main` wayin is the stored `main`: the wayin the gating proved against has not been modified | `ProvedWayinMoved` |
| RP3 | every wayin of the record but `main` is the stored row's | `OtherWayinMoved` |

RP2 is the only demand of a proof, and it proves little: a caller can copy the stored `main`. It is where a later
version can check a change countersigned against the proving wayin. The other two policies need no RP2: their RP3
already demands that the record's `main` is the stored one.

### `add_passkey`

| # | The put is refused unless | Phrase |
|---|---|---|
| AP1 | the record's `registered_at` is the stored row's | `RegisteredAtNotStored` |
| AP2 | the stored row has no `passkey0` | `PasskeyStored` |
| AP3 | the record has a `passkey0` | `PasskeyNotAdded` |
| AP4 | every wayin of the record but `passkey0` is the stored row's | `OtherWayinMoved` |

### `revoke_passkey`

| # | The put is refused unless | Phrase |
|---|---|---|
| RK1 | the record's `registered_at` is the stored row's | `RegisteredAtNotStored` |
| RK2 | the stored row has a `passkey0` | `NoPasskeyStored` |
| RK3 | the record has no `passkey0` | `PasskeyNotRevoked` |
| RK4 | every wayin of the record but `passkey0` is the stored row's | `OtherWayinMoved` |

## What the gate policies do not hold

No policy checks that a new wayin opens, since the bankDB cannot unwrap one. A `replace_passphrase` whose new `main`
does not open passes, and so does an `add_passkey` whose `passkey0` does not open. A caller holding the host's session
can therefore lock the user out, or add a passkey that opens nothing.
