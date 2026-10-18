# Sprint progress: reform

The orchestrator's curated summary of what the threads have taught. Newer than the plan where they
disagree. Workers look things up here; they do not write here (each keeps its
`thread-<N>-<label>.md`).

## From planning (2026-10-18)

* *Orchestrator:* the name map was checked against `packages/safebyok/src` at `origin/main`
  `2946a499`. Every old name in it exists; four gaps are settled in the plan's *Amendments*
  (`wayinkind`, `takeUpLease`/`takeUpVaultKey`, `readBox`, `useBox`).
* *Orchestrator:* the retry machinery (`retryStale`, `retryDelayMillis`, `MaxWriteAttempts`,
  `boxStood`, `'erased'`, `clearsFirst`) all lives in `src/vault.ts`; nothing outside it names
  them.
* *Orchestrator:* `openVault` is named in some fifteen core source files, most of them in doc
  blocks and refusal messages; `OpenVaultOpts` in `browser.ts`, `index.ts`, `vault.ts`.
* *Orchestrator:* `Vault` is already an exported type (`src/vault.ts:196`).
* *Orchestrator:* size headroom is ample (about 3.5 kB on every core entry), so no thread raises
  a budget.
* *Orchestrator:* open PRs #138 (KeyDeriver class: `vault.ts`, `envelope.ts`, `types.ts`,
  `VOCABULARY.md`) and #156 (react passphrase-modal tests) collide with the reform and are not
  in this line.

## Decisions and discoveries by thread

(none yet)
