---
"safebyok": minor
"safebyok-indexeddb": minor
"safebyok-postgres": minor
"safebyok-convex": minor
"safebyok-graphql": minor
---

A VaultDB's retireBox now names the revision it means and says what it removed. It takes a LockboxRetireExpectation, { vault_id, revision_tok } -- the revision this device read, or null for a lockbox listed damaged with none -- where it took a RetireExpectation (which retireVault and retireDamagedVault keep), and resolves a LockboxRetirement, { outcome: 'retired' | 'retired_other' | 'absent' }, where it resolved nothing. Within the expected vault it still removes whatever stands; retired_other says what it removed was not the revision named. An adapter of your own changes its doRetireBox: it resolves that outcome from the same atomic step as the removal (Expectations.retirementOf compares for a key-value store), where it resolved true, and null where it resolved false; one still resolving true or false now meets corrupt_record on every lockbox retirement. The Convex component's retireBox mutation takes { vault_id, revision_tok } and answers the outcome or null (it answered true or false); over GraphQL, safebyokRetireBox takes a SafebyokLockboxRetireExpectationInput and answers a SafebyokLockboxRetirement (it answered Boolean!), so a host's GraphQL server and its browsers move to this version together, as do a Postgres route recipe's two halves. Vault.retireBox() and a storeBox() over a damaged lockbox naming no revision, which retires it first, warn through the host's logger when they retired another revision than the one shown, naming neither; their results are unchanged. Nothing stored changes.
