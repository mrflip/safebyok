# 2026-10-15: Sprint big_feats done -- six PRs, the order to merge them, and what needs your word

The sprint built the six items you named from the TODO. A vault's bundle now holds a list of
unlock envelopes, so a user may have several passphrases ([#71]), and passkeys, through the
WebAuthn PRF extension ([#76]). Argon2id runs about four times faster through hash-wasm, byte for
byte the same as noble ([#74]). And there are three new storage packages: IndexedDB as its own
package, every write one transaction ([#77]); Postgres, every verb one SQL statement, made per
request ([#73]); and GraphQL over it, an SDL and resolvers on the server and an urql VaultDB in
the browser ([#78]). Every thread was reviewed at medium; every review came back `fixed`, none
flagged. The sprint paused for an hour (10:18 to 11:19 UTC) at your word.

## The PRs, in the order they filed

| PR | Thread | Stacked on | Review fixed |
| --- | --- | --- | --- |
| [#71] | 2 unlock_envelopes | main (#63 merged) | an aimed unlock on a destroyed vault made a new one |
| [#73] | 5 postgres_vaultdb | #71 | two doc errors (PGlite's `listen` needs `this`; a driver error can quote a row) |
| [#74] | 1 argon2_wasm | #68 (gripe_fixes `kdf_configs`) | a lone-surrogate test, an index test, a hex helper, a memory-zeroing note |
| [#77] | 4 indexeddb_package | #70 (gripe_fixes `vaultdb_validation`) | a late listener call; an epoch-less bundle passing the expectation |
| [#76] | 3 passkey_unlock | #71 | the demo orphaned a passkey on an empty passphrase |
| [#78] | 6 graphql_vaultdb | #73 | a departed subscriber kept Postgres's LISTEN alive |

**Merge order**: #71, then #73 and #76 (either order), then #78. #74 after #68; #77 after #70.
The sprint's own documents PR last. Expect one-line conflicts in `.changeset/config.json`'s
`fixed` group and the root README's package list among #73, #74, #77 and #78, each adding its
package; and in `.size-limit.json` between #71, #76 and #74.

## Decisions taken in YOLO

1. Cut from #63's tip, the second_harvest merge stack, not main. The stack has since merged
   (rebased, but tree-identical), and #71 rebased onto main cleanly.
2. `passphrase_epoch` keeps its name; renaming it `unlock_epoch` is one sweep after these land.
3. Threads 1 and 4 waited on gripe_fixes' `kdf_configs` (#68) and `vaultdb_validation` (#70).
4. Postgres built beside the envelopes and rebased onto them before filing (after your
   field-by-field ruling).
5. Small follow-ups ordered at filing: salt checks and a blank-proof refusal (#71); a 400 for a
   malformed route body (#73); doc lines on orphaned passkeys (#76) and one copy of `graphql` (#78).

## Needs your word

*Answered or explained since*: `winboard/20261015-big_feats/20261015-sprint_big_feats_rulings-human.md`.

**Rulings, design:**
- **Every envelope change takes a proof**, even unlocked (#71), since the session vaultKey is
  non-extractable; and **any way in proves any change** (#76): one passkey can set a new
  passphrase and remove the others.
- **A vault always keeps a passphrase** (#76): no passwordless vaults for now.
- **The epoch is out of the envelope binding** (#71): a backend can splice a removed envelope
  back in, no worse than its rolling back the whole bundle.
- **HKDF `info` for a passkey names the purpose and credential, not `vault_id` or scope** (#76).
  Sound today on the per-envelope salt plus the AAD; binding more is a construction change.
- An un-aimed wrong passphrase costs ~4.8 s at the 8-envelope cap (#71).

**Public surface and dependencies:**
- New exports: `parseKeyDeriverSpec` (#74); `PasskeyEnvelope`, `PasskeyProof`, `toB64`/`fromB64`
  in `safebyok/utils`, two error kinds, four React exports (#76).
- `safebyok/idb` drops `idbVaultDB`, `inspectIdb` and `IdbShelf`, no shim (#77).
- `graphql` as an optional runtime peer of `safebyok-graphql/server` (#78): Yoga masks any other
  error, and in development mode would send the driver's error to the browser.
- hash-wasm has no published audit, and never zeroes its working memory (#74).
- Two #78 dev dependencies are days old: `graphql-yoga` 5.24.5, `@graphql-tools/schema` 10.1.4.
- Size budgets rose twice: `openVault` 16.5 to 18.5 kB (#71, #76).

**Minor, each in its PR:** a taken `unlocklabel` is `bad_label` (misuse), not a condition (#71);
`addPasskey` checks its proof only after the passkey exists (#76); a Node or Bun process kept
alive by IndexedDB's BroadcastChannel, and a throwing listener crashing it (#77); no server-side
vault cap on Postgres (#73); `listBoxRecords` versus a core change (#73, #78).

## Follow-ups

In `TODO.md`'s new *Open from big_feats*: the epoch rename, a real-authenticator pass on #76, the
Postgres vault cap, `listBoxRecords`, swallowed LISTEN and subscription failures, `TH.perUser`
into `safebyok/testing`, and CLAUDE.md's *Layout*.

**Housekeeping:** `/workspace/byok-passkey_unlock` and `/workspace/byok-unlock_envelopes` are
deregistered worktrees whose directories remain (everything in them is pushed); safe to delete.
Local tags `*-prerebase` and `*-prefold` remain for threads 2, 5 and the sprint branch.

[#71]: https://github.com/mrflip/safebyok/pull/71
[#73]: https://github.com/mrflip/safebyok/pull/73
[#74]: https://github.com/mrflip/safebyok/pull/74
[#76]: https://github.com/mrflip/safebyok/pull/76
[#77]: https://github.com/mrflip/safebyok/pull/77
[#78]: https://github.com/mrflip/safebyok/pull/78
