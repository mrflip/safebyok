# Thread 9c: budgets (2026-10-17)

Branch `20261017-budgets`, PR #145, stacked on #140. Justify: green (lint, typecheck, all tests, build, size check).

* **Built**: every line of `.size-limit.json` re-derived from `npx size-limit --json` (after `pnpm build`) by PROCESS.md, *Size budgets*: measure, plus 3 kB at 5 kB or more (+50% and at least +1 kB under), rounded up to two significant figures. Only `limit` changed; names, paths, imports, `browserOpts`'s `"entry": ["index"]` and the `ignore` lists are as they were.
* **Closed**: G520 **closed**.
* **Discoveries**: all 15 entries have a measure, `reactEverything` included (5022 bytes); the "14 measures" in the last restack's log was a miscount or a trimmed log, not a missing entry (`npx size-limit | grep -c 'Size:'` prints 15). Budgets went up for `openVault` (30 to 31 kB), `DefaultValidators` (4 to 5.2 kB), `VaultProvider` (4.7 to 6.8 kB) and `reactEverything` (5.3 to 8.1 kB) because the rule's room is larger than what the sprint guessed; the rest hold or fall.

| Entry | Measure (bytes) | Old budget | New budget |
|---|---:|---:|---:|
| everything | 34742 | 40 kB | 38 kB |
| openVault | 27514 | 30 kB | 31 kB |
| stableJsonify | 2324 | 3.5 kB | 3.5 kB |
| argon2idWebV1Deriver | 5163 | 9 kB | 8.2 kB |
| idbDeviceDB | 10311 | 15 kB | 14 kB |
| browserOpts | 16094 | 20 kB | 20 kB |
| mask | 5742 | 8.8 kB | 8.8 kB |
| validators | 4024 | 8.5 kB | 6.1 kB |
| DefaultValidators | 3464 | 4 kB | 5.2 kB |
| argon2idWasmWebV1Deriver | 9513 | 13 kB | 13 kB |
| argon2idWasmDeriver | 15221 | 19 kB | 19 kB |
| zxcvbnPassphraseTest | 213738 | 220 kB | 220 kB |
| idbVaultDB | 1325 | 2.6 kB | 2.4 kB |
| VaultProvider | 4533 | 4.7 kB | 6.8 kB |
| reactEverything | 5022 | 5.3 kB | 8.1 kB |
