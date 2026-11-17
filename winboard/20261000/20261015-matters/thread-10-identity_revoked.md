# Thread 10: identity_revoked (2026-10-16)

Branch `20261016-identity_revoked`, PR [#106](https://github.com/mrflip/safebyok/pull/106),
stacked on #105 (the line main -> #96 -> #99 -> #98 -> #97 -> #105), restacked at filing onto
`ca960ac`. Justify: green (core 1190, convex 287, postgres 163, graphql 159, react 97, indexeddb
108, argon2-wasm 44, demo 131, root 123). `pnpm size` green under #99's budgets.

## Design

* **Signals.** `identity_revoked` (new, a condition): storage no longer serves the user this
  vault was opened for -- signed out, or another user signed in. `not_permitted` (narrowed): the
  vault's own user, still signed in, refused one call. Convex's `mustBe` and Postgres's
  `mustReach` now say `identity_revoked` for both of their old cases (no caller; a caller who is
  not the scope's `user_id`); GraphQL carries whatever its VaultDB says; IndexedDB and
  `localVaultDB` never revoke. No adapter of ours says `not_permitted` any more: it stays for a
  host backend's own rules.
* **One policy module**, `packages/safebyok/src/refusal-policy.ts` (`RefusalPolicy`):
  `decide(refusal, whenIdentityRevoked)` maps every storage refusal to what the vault does beyond
  throwing it (today: `identity_revoked` -> `lock`, everything else -> `none`); `heed(vaultDB,
  onRefusal)` wraps the adapter's verbs so every refusal passes by the vault, whichever call met
  it (a background refresh's included); `parse` checks the option.
* **Default: lock**, as `lock()` does: drop the vaultKey, erase the remembered unlock, cut a
  `lockSoon()` grace short, defeat an unlock under way, `bump()` subscribers. Never erase stored
  data. Why: a sign-out is the user saying "I'm done here"; the unlocked key outliving the
  session was the one gap (security.md, 2026-10-15), and erasing a vault on an auth signal would
  be destructive and wrong. A `log` line says so when a key was held; a device store that won't
  erase is `warn`ed, and the refusal still throws.
* **Host override:** `whenIdentityRevoked: 'stay'` (throws only, as before).
* **What a host sees.** The call throws `identity_revoked`; the snapshot goes `locked` and
  subscribers fire. React: `VaultProvider` passes the option through; an open refused this way is
  `openError`; a locked vault's next `withUnlockedVault` opens the dialog, whose unlock meets the
  refusal and shows its calm message (no React logic changed). Convex: a `ConvexClient` watch's
  error now calls `onChange` (a `ConvexReactClient` watch already did), so an idle vault locks on a
  sign-out in another tab.

## Built

* Core: the kind (`errors.ts`, README tables, a *When the user signs out* section), the policy
  module and its tests (`tests/refusal-policy.test.ts`), the wiring in `vault.ts` (four lines in
  `openVault`, one new closure `heedRefusal`), tests at the end of `tests/vault.test.ts`, the
  `VaultDB` contract bullet in `vault-db.ts`.
* Adapters: Convex server/client/refusals/README; Postgres source/README; GraphQL docs; each
  package's tests renamed, plus end-to-end tests: a Convex vault locking while idle on
  `deployment.signOut()` (new in `tests/fake-deployment.ts`), and a Postgres route-recipe vault
  locking at its next call once its session signs out.
* `notes/security.md` entry; the 2026-10-15 Convex sign-out entry marked superseded. Changeset
  `20261016-identity_revoked.md` (minor, breaking for `not_permitted` branches).

## Decisions taken

* **A mismatched user is `identity_revoked`**, not `not_permitted`: a server cannot tell "the
  user changed" from "the host opened the wrong user's vault", and from the vault's side both mean
  its user is not the one signed in. Locking is the safe answer to both. The message says "if the
  user changed, open the vault for the new one".
* **Named `refusal-policy`**, not `revocation`: thread 13's rotation design owns "revocation"
  (of a way in); this module is about what storage refusals mean, and has room for more.
* **`heed` passes arguments through whole** (`...args`): the gripes line added a `validators`
  argument to every verb, and a wrapper that named its parameters silently dropped it.
* **The open path locks too**: a vault opened while signed out erases its remembered unlock. Safe,
  but a host that opens before its auth is ready makes users retype the passphrase; the core,
  Convex and React READMEs say to open only once signed in.
* `subscribe`'s synchronous throws pass through unheeded (Postgres throws `identity_revoked` from
  it while signed out, but only at open, where the next read meets it anyway).

## Discoveries

* Convex's `ConvexClient.onUpdate` sends a failing query to `onError` only; the React client's
  watch calls its listener either way. Our ConvexClient path ignored the failure, so a sign-out
  never reached an idle vault.
* Rebased onto the gripes line: conflicts were all additive (doc lists, the option bag, index
  exports). Nothing in its logic touched this design.

## For thread 11 (the VaultDB contract) and thread 5 (the audit)

The contract should say, as numbered lines the battery can name:

1. An adapter whose backend knows who is signed in refuses every verb on a scope whose `user_id`
   is not the signed-in user's -- including while no one is signed in -- with `identity_revoked`,
   writing nothing and reading nothing of that scope.
2. It says `identity_revoked` only when the user really is gone: a passing fault (an expired token
   mid-refresh, a network error) is `storage_unavailable`, since the vault locks on the former.
3. A signed-in user who is the scope's own but may not make the call is refused `not_permitted`,
   which locks nothing.
4. An adapter with no notion of identity (IndexedDB, `localVaultDB`) never says either.
5. A live `subscribe` whose watch fails calls `onChange`, so the vault looks again and meets the
   refusal itself (Convex both clients now; Postgres/GraphQL push nothing on a sign-out).

The battery could run 1 and 3 through `perUser` with a signed-out factory (`perUser` cannot yet
make a signed-out adapter: thread 5 decides). The core's own `servingOnly` fake in
`tests/test-helpers.test.ts` now says `identity_revoked`.

## For the Coach

* **Size**: on main's old budgets this thread overshot (`everything` +245 B, `openVault` +72 B);
  on the stack, under #99's, it measures `everything` 28.58 of 30 kB, `openVault` 20.39 of 23 kB.
* **Public surface to rule on**: the kind `identity_revoked`; the option `whenIdentityRevoked`
  with values `'lock' | 'stay'` (and the export `IdentityRevokedResponseVals`, type
  `IdentityRevokedResponse`); `not_permitted` narrowed; Convex's `SafebyokErrorKindVals` now
  `['identity_revoked', 'vault_full']`.
* **Should `'stay'` exist at all?** It keeps today's behaviour for a host whose auth blips; it is
  also a way to keep keys past a sign-out. Kept, defaulting to `'lock'`. Removing it is one line
  of the enum and the README paragraph.
* No `eslint-disable` or `ts-expect-error` added.

## Review

The thread-reviewer fixed two (its commits on this branch): an open picking up the remembered
unlock now yields to a shut since it began, so a background refresh meeting `identity_revoked`
mid-open no longer leaves the open `unlocked` holding a dropped key (a test reproduces it); and
`heed`'s pass-through is checked for all eight verbs, `validators` included. Left, minor:

* A `read()` already past `ensureUnlocked()` still returns its whisper if a sign-out locks the
  vault mid-`readBox`, as a `lock()` always has. For the Coach: should a lock (either kind) also
  withhold a whisper already on its way out?
* A device store whose `eraseUnlock` never settles hangs the refused call (the key is dropped
  first, so nothing leaks).
* A closed handle's in-flight refusal still erases the remembered unlock (consistent with the
  policy, though `close()` alone keeps it).
* Every `ConvexClient` watch error now makes the vault refresh, not only a sign-out: a failing
  deployment costs one extra query and one logged warning per failure.

