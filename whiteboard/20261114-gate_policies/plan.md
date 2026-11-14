# gate_policies (2026-11-14)

Worktree `/workspace/byok-gate_policies`, branch `20261114-gate_policies`, cut from origin/main
(1edea791d). One thread, one PR. `base-sync` keeps the base checkout in step after each commit
the Coach should see. Nothing is built until the Coach says go.

## Why

The bastion, the store's own code (`safebyok_put_gate`, Convex's `putGate` mutation), is one of the
two security boundaries (the Coach, 2026-11-12, bank_world-progress.md; notes/security.md, *Two
boundaries*). The device-side bankDB runs in the page beside every iframe and extension, and is
not one. #692 (thread 21, 2026-11-13) removed the gate verbs' policy from the classifier and from
`safebyok_put_gate`, on the reading that the checks could never fail. They cannot fail for the
honest device, which builds each record from `ante`. They can fail for a script in the page that
calls the store directly. Since #692, the bastion stores any next revision of the gate row.
notes/security.md still describes the policy as enforced.

This thread puts the policy back, as a storage option rather than as three verbs, and starts the
`options` bag that lets bankDB later lose its specialised verbs.

## Shape

* **`ask.options`**: the bag for a storage operation's options. It holds `ifAbsent`, `ifPresent`
  and `policies`. `ifAbsent` and `ifPresent` move into it from the top level of the vault and box
  asks.
* **`policies: StoragePolicy[]`**: `storagePolicyVals = ['replace_passphrase', 'add_passkey',
  'revoke_passkey']`, named for the gating verbs.
* **`putGate(ask)` / `tryPutGate(ask)`** replace the three gate verbs on `BankDB`, `AdapterBankDB`
  and the GraphQL client. `gatePut` requires exactly one policy, and refuses a gate put that names
  none, or two (`bad_record`). A vault or box ask names no policy.
* **The gate ask's `expected` carries its `wayins`**: the wayins of the row the device read and
  proved against. The listing sends them already; today's `gateExpected` strips them.
* **`GateListing.putGate(ante, wayins, policies)` / `tryPutGate`** replace its three verbs. The acts
  in `gating.ts` build the next wayins.

## `helpers/policies.ts`

The JavaScript form of each policy is a plain function, named for its policy. Each corresponds,
demand by demand, to one row of the policy doc:

```ts
export function replace_passphrase({ ask, parent, stored }: StorageDemandsOf): true
export function add_passkey({ ask, parent, stored }: StorageDemandsOf): true
export function revoke_passkey({ ask, parent, stored }: StorageDemandsOf): true
export const StorageDemandsDispatcher = { replace_passphrase, add_passkey, revoke_passkey } as const satisfies Record<StoragePolicy, (demanded: StorageDemandsOf) => true>
export function storageDemands(policies: StoragePolicy[], demanded: StorageDemandsOf): true
```

* Each throws `gate_issue` (with `parent`, and `stored` as `dbhas`) or returns true. Past the ask's
  parse and the put table, it trusts what it is handed: no null checks.
* `classifyStoredGate` calls `Policy.storageDemands(ask.options.policies, { ask, parent, stored })`
  once the put table answers `replaced`. Convex's mutation runs that inside Convex. Postgres runs
  its own conditions in SQL. Its adapter re-runs the classifier on a refusal's rows only to name
  the refusal, as it did before #692.
* The battery cases are keyed by policy, so every adapter passes the same ones.

## The policy (one row per function; the doc holds this table)

On the gate row stored, fetched in the step that stores the record:

| policy | refused `gate_issue` unless |
|---|---|
| `replace_passphrase` | `registered_at` is the row's; every wayin but `main` is the row's; the expected `main` is the stored `main` (the wayin proved against has not been modified) |
| `add_passkey` | `registered_at` is the row's; every wayin but `passkey0` is the row's; the row has no `passkey0` |
| `revoke_passkey` | `registered_at` is the row's; every wayin but `passkey0` is the row's; the row has a `passkey0` |

* Changed from before #692: `camped` and `passed` become `gate_issue`. With the revision check
  passed first, the stored row is the row the device read. The device refuses `add_passkey` over a
  passkey (`demandPasskeyAddable`) and never sends `revoke_passkey` over none. So either case comes
  only from a caller other than the honest device.
* Only `replace_passphrase` needs the expected `main`. The other two already demand that the
  record's `main` is the stored one.
* Back too: `gate_issue` (kind, thrower, phrases). Postgres: `safebyok_put_gate(new_record,
  expected_row, policies text[])`, with the conditions from before #692 plus the `main` comparison.

## What it does not close

The policy checks no proof. A `replace_passphrase` whose new `main` does not open still passes, so
a script in the page holding the host's session can lock the user out. Comparing the expected
`main` is academic today: such a script can copy the stored one. It opens the door for a later
version in which a change is countersigned for the bastion to authenticate. Not designed here.

## Also

* VOCABULARY: `ifAbsent`, `ifPresent` and `policies` are options of a storage operation, in
  `options`. A policy governs whether or how an operation may proceed. Reword the **ask** row.
* notes/security.md: a sonnet subagent records the gap (#692 to this PR) and its closing.
* Tests: the classifier and battery cases #692 deleted come back, keyed by policy, plus a forged
  expected `main`. New cases: a gate put with no policy, or with two, refuses `bad_record`;
  `loggableAsk` carries `options`.
* Changesets: `safebyok`, `safebyok-graphql` (schema), `safebyok-postgres` (re-run
  bank-functions.sql; drop the two-argument `safebyok_put_gate`), and `safebyok-convex` (redeploy).

## Next thread, not this one: `capacityLimit`

`capacityLimit: { box: { maxSize, maxAllCount } }`, a frozen property of each bankDB, set when the
bankDB is built from the customer's options, then the fallbacks, clamped to the adapter's bounds.
Today it is half there: `maxRecordSizeEst` and `maxBoxes` are constructor options. But Convex's
`putBox` mutation takes `maxBoxes` from the device's call (clamped only to the 8,000 hard bound), so
a page script can raise the soft cap. The bastion's limit has to be its own, from the component's
configuration.
