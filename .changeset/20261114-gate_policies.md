---
"safebyok-big": minor
"safebyok-postgres": minor
"safebyok-graphql": minor
"safebyok-convex": minor
---

A gate change is one bankDB verb, `putGate` (with `tryPutGate`), in place of `replacePassphrase`, `addPasskey` and `revokePasskey`. Its ask names the storage policy of the change in `options.policies`: one of `replace_passphrase`, `add_passkey` and `revoke_passkey` (`storagePolicyVals`, `StoragePolicy`). The store applies that policy in the step that stores the record (`notes/storage-policies.md`), and refuses `gate_issue` where the record changes more than its change allows, or the gate row stored is not one it changes. That restores the checks removed in the previous release, so the database refuses a gate change the device would never send. `add_passkey` over a stored passkey and `revoke_passkey` over none now refuse `gate_issue`, where they once answered `camped` and `passed`. `replace_passphrase` also refuses when the passphrase wayin it expected is not the one stored, so a gate put's `expected` carries its `wayins`. A refusal's ask and an answer's ask carry `options`. `GateListing`'s three verbs are now `putGate(ante, wayins, { policies })`, and the answer checks are now one, `putGateAnswer`.

Postgres: `safebyok_put_gate` takes a third argument, `policies text[]`. Run the bank SQL again, and drop the two-argument `safebyok_put_gate(jsonb, jsonb)` if you like. GraphQL: the three mutations are one, `safebyokPutGate(ask: SafebyokGatePutAskInput!)`, whose input has `options: SafebyokGateOptionsInput!`; `SafebyokGateExpectedInput` gains `wayins`, and `SafebyokAsk` gains `options`. Convex: deploy the component again.
