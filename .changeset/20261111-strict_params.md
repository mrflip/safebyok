---
"safebyok": minor
"safebyok-graphql": minor
"safebyok-postgres": minor
---

`reqParamsOf` is gone from `safebyok/storage`: parse with `reqParams`, which refuses a malformed field instead of answering `{}`. A VaultDB verb now checks its request before it builds an answer's `req_params`, so a malformed request refuses with its own kind and no longer carries `call` in its meta. `box.del(asked)` and `vault.del(asked)` refuse a malformed revision (`bad_option`) where they used to delete whatever revision was stored. `badAnswerOf` is exported from `safebyok/storage`. A GraphQL request refused at sign-in that also fails its checks is refused for what is malformed.

`DeviceDB.peek` refuses `damaged_lease` for a stored lease row that fails its checks, where it answered null; the vault tells it as bad news and asks for a proof, as before. `AdapterVaultDB.watch` passes `onBadNews` to a new third argument of `doWatch`, and `PostgresVaultDB` tells it when its `listen` fails, where the watch went quiet. `refusedAnswerOf` takes `UNANSWERED` in place of null.
