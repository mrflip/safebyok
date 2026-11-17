# 2026-10-14: safebyok-react demo -- interface decisions and open questions

The demo at `demos/safebyok-demo-react/` exists to settle the package's interface. This note records what
it proposes, where it deliberately departs from the 20261013-relic sketch, and what remains open.

## Vocabulary adopted

* **whisper** -- the secret: a JSON value (string, number, boolean, array, plain object). Never
  `undefined` anywhere, never a bare `null` as the whole whisper (null inside a structure is
  fine: real JSON carries it).
* **lockbox** -- whisper + `boxlabel` + public metadata (`note`, `created_at`, `updated_at`).
* **vault** -- many lockboxes, scoped by `(applabel, user_id, vaultlabel)`.

`boxlabel`, not the user's example `label`, following STYLE.md's smushed-tag naming; every label
(applabel, vaultlabel, boxlabel, userlabel) shares one `Label` rule: `\w` only, letter first,
2-64 chars. Note that rule refuses hyphens -- `anthropic-prod` from the relic sketch would be
refused. Worth a second look.

## Interface proposed by the stub (`demos/safebyok-react/src/safebyok/`)

* `openVault(opts) -> Vault`: settles into `absent | locked | unlocked` without prompting.
  Prompting is the host's job, and only when a whisper is actually wanted.
* React-friendliness per CLAUDE.md: `subscribe(listener) -> unsubscribe`, `getSnapshot()` with
  identity kept until something changes. No React import anywhere in the library layer.
* Whisper ops: `store`, `read`, `use(boxlabel, callback)`, `erase`; all require unlocked and
  throw `VaultError` kind `vault_locked` otherwise. The host wraps them in safebyok-react's
  `withUnlockedVault()` (né `guard()`), which prompts and retries.
* First `unlock()` on an absent vault creates it. The UI knows to say "choose a passphrase"
  because the snapshot said `absent`.
* `destroy()` works without unlock: an authenticated owner can always delete their own
  ciphertext server-side; requiring the passphrase would be false comfort.
* Errors: `VaultError` with `kind` from a closed list; messages calm, actionable, and never
  carrying a whisper or passphrase.
* Storage seams: `VaultDB` (remote, host-pluggable; stub: localStorage) and `DeviceDB`
  (device-local remembered unlocks). Rows read back are validated with Zod. Adapter methods are
  async even where nothing awaits, so a storage fault rejects instead of throwing synchronously
  (a real bug the tests caught in the stub).

## Departures from the relic sketch

* Dropped for now (not rejected): passphrase epochs/compare-and-swap, recovery kits, passphrase change,
  `rotateLockbox`, capability flags, schema registry with typed per-box schemas. The stub stays
  at the surface a first release must get right; these come back with the crypto.
* Flattened `meta: {...}` + `StoreOptions` into a single optional `note` -- enough to demonstrate
  public-while-locked metadata. The real shape (service, hint...) is still to design.
* `status()` became the snapshot itself; `stale`/`corrupted` states deferred with the passphraseEpoch
  machinery.

## Observations from building the demo

* ~~`guard()` returning `null` for "user dismissed the dialog" is ambiguous with a whisper that
  is legitimately `null`~~ -- dissolved by the fourth-pass ruling refusing a bare-null whisper:
  a dismissed read is now unambiguous, and the demo's `{ whisper }` wrapping is gone.
* A `view` facility means the whisper does land in React state in practice. The README's "never
  put secrets in state" guidance needs to say something honest about reveal-to-user features.

## Coach rulings (2026-10-14, second pass)

1. **Sign-out locks the vault.** Done: the demo's sign-out calls `vault.lock()` (which erases the
   remembered unlock) before ending the session.
2. **Labels**: `/^[a-z](_?[a-z0-9])+$/`, max 40 -- lowercase identifier rules, single underscores.
   `anthropic_api_key` yes; `ANTHROPIC_API_KEY` no.
3. `demos:` prefix added to PROCESS.md.
4. **The library lives in the root `src/`** (still plaintext, loudly marked), exported as the
   package surface; the demo imports the `safebyok` workspace package. **React plumbing lives in
   `packages/safebyok-react`** (provider, hooks, passphrase dialog), source-exported while the
   interface settles.
5. `TODO.md`: "use stable jsonify" -- done as `src/stable-jsonify.ts` (hand-rolled, 12 lines),
   used for snapshot change detection.

## Open questions, second round

1. **zod placement**: now a regular `dependency` of safebyok (CLAUDE.md names Zod as the validation
   choice). Prefer it as a peer instead?
2. **Whisper strictness** (carried over): refusing what JSON would mangle (Date, Map, undefined)
   rather than silently flattening. Right call?
3. **safebyok-react packaging**: currently `private: true` with `exports` pointing at TS source;
   gets a tsdown build + publint/attw when it heads to npm. Commit prefix used for it: `api`
   (no better row in PROCESS.md's table -- bless or rename).
4. ~~Demo needs `pnpm build` at the root first~~ -- answered third pass: yes, build first, and
   the root's `pnpm demo:react` script owns it.

## Coach rulings (2026-10-14, third pass)

1. **Library-first sharpened** in CLAUDE.md (*Non-Negotiables*) and PROCESS.md (*Dependencies*):
   the hand-rolled `stableJsonify` is exactly what the guidance should have prevented. Small
   utilities get an npm search and a named candidate first, every time; "it's only a dozen
   lines" argues *for* the proven package. The hand-roll is gone -- `stableJsonify` is now a
   thin alias of `safe-stable-stringify` (runtime dependency, named by the Coach).
2. **Demo renamed `safebyok-demo-react`** (`demos/safebyok-demo-react/`); its edits take the `demo:`
   commit prefix (PROCESS.md row renamed from `demos`).
3. **`pnpm demo:react`** at the root builds safebyok, then starts the demo.
4. **React lint stack** installed where JSX lives: react, react-hooks and jsx-a11y in the demo
   (plus react-refresh, it being a Vite app) and in `packages/safebyok-react`; every finding
   corrected.
5. **History rewritten** into logical commits (docs / api / api / demo) and force-pushed with
   lease to PR #3.
6. **`undefined` is never a whisper** -- already refused by the validator; now the Whisper doc
   block, the `bad_whisper` message ("to empty a lockbox, erase it") and a test say so in as
   many words.

## Open questions, third round

1. ~~**Rename `guard`?**~~ -- ruled fourth pass: `withUnlockedVault`.
2. ~~**Store a top-level `null` whisper at all?**~~ -- ruled fourth pass: refused.

## Coach rulings (2026-10-14, fourth pass)

1. **`withUnlockedVault`**, né `guard` ("Yes!" to the agent's recommendation over
   `vaultUnlockingHandler`): renamed across safebyok-react, its tests, the demo, and these notes.
2. **A whisper is never a bare `null`.** `Whisper` is now `Exclude<WhisperJson, null>` (the
   recursive JSON type is exported as `WhisperJson`; null stays legal inside structures), the
   validator refuses a top-level null, and `bad_whisper` says so. Simplifications collected:
   the demo's `{ whisper }` wrapping around guarded reads is gone, `withUnlockedVault`'s doc
   block stops warning about the ambiguity, and the dashboard's `?? null` fallback died.
3. **Null-as-sentinel audit** (Coach: prefer `Symbol.for` where null does double duty; React's
   null-means-dismissed is standard practice and stays). Findings:
   * `vault.ts`'s `bundle` used `null` for both "backend not read yet" and "backend says no
     bundle" -- the one real double duty. Now `Symbol.for('safebyok.unread_bundle')` marks the
     unread state, and `vaultState()` derives `'opening'` instead of a hand-built first
     snapshot. `Symbol.for` rather than `Symbol` so the ESM and CJS builds share the value.
   * The storage reads (`readBundle`, `readBox`, `readUnlock`, `StringStore.read`) keep
     `| null`: there null is the answer ("no such record"), never colliding with a legal row,
     and it is the contract adapter authors expect.
   * React state nulls (dismissed dialog, no session, no joke yet) stay, per the ruling.
