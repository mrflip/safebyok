---
"safebyok": minor
"safebyok-postgres": minor
"safebyok-graphql": minor
"safebyok-convex": minor
---

The gate verbs (`replacePassphrase`, `addPasskey`, `revokePasskey`) are each a plain put of the gate row over the row it expects, with no per-verb policy. A host sees: the `gateVerb` field is gone from a gate verb's ask and answer, and from the GraphQL schema (the `SafebyokGateVerb` enum and the input's `gateVerb` field); the refusal kind `gate_issue`, the exports `gateVerbVals`, `GateVerb`, `gateActVals` and `GateAct` are removed, and `GateVerbAsk` is now `GatePutAsk`. A bankDB's `addPasskey` no longer refuses `camped` over a stored passkey, and `revokePasskey` no longer answers `passed` with none stored: each stores the record it is sent. `gate.addPasskeyPrompt()` still refuses `bad_option` when a passkey is stored, now also when one was added while its dialog was open. Postgres: `safebyok_put_gate` takes two arguments (`new_record`, `expected_row`); run the bank SQL again, and drop the old `safebyok_put_gate(jsonb, jsonb, text)` if you like.
