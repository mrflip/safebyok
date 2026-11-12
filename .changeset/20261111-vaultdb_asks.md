---
"safebyok": minor
"safebyok-postgres": minor
"safebyok-convex": minor
"safebyok-graphql": minor
"safebyok-indexeddb": minor
"safebyok-react": minor
---

A vaultDB answer, and a vaultDB refusal's meta, carry `ask` in place of `req_params`: a `LoggableAsk`, the ask's op, address, policies and row revisions, never a record's payload (`loggableAsk` checks it; `ReqParams`, `reqParams`, `requestParams` and `reqParamsOf` are gone, and `crossedReqParams` is `crossedAsk`). `listVaults` and `listBoxes` take asks, `{ op: 'list', applabel, user_id }` and `{ op: 'list', ...vaultScope, vault_tok }`. An adapter's `do*` calls return `VaultStored`, `BoxStored`, `VaultsStored` or `BoxesStored` (were `VaultClassified` and `BoxClassified`), made by `classifyStoredVault`, `classifyStoredBox`, `classifyStoredVaults` and `classifyStoredBoxes` (were `classifyVault` and `classifyBox`); `doListVaults` and `doListBoxes` classify what they fetch, and `BoxesFetched` is `{ world, boxes }`. `boxWorldOf` and `boxVaultActOf` are no longer exported. GraphQL: the answer field `req_params` is `ask`, of type `SafebyokAsk`. Convex: the component's `listVaults`, `getVault`, `listBoxes` and `getBox` take `{ ask }`, and `getBox` and `listBoxes` return `world` where they returned `vault`; a host redeploys its Convex functions with this version. `tidyGone` takes an ask too, `{ op: 'tidy_gone', applabel, user_id }` (`boxTidy` checks it, `BoxTidyAsk` its type), and so does the Convex component's `tidyGone`, as `{ ask }`. A refusal's `meta.call` is `meta.oplabel`, naming the verb that refused, on the wire too (GraphQL's `SafebyokErr.meta`), and the logger's story names its operation as `oplabel` where it said `call`. `revokePasskey` over a vault with no passkey wayin answers the act `passed`, with the row as stored, where it answered `revoked`.
