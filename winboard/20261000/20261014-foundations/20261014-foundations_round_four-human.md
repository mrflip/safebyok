# 2026-10-14 round four: withUnlockedVault, no bare-null whispers, the null-sentinel audit

Three rulings landed, plus two IDE-reported fixes.

* **`withUnlockedVault`**, né `guard`, across safebyok-react, its tests, the demo, and the docs.
* **A whisper is never a bare `null`.** `Whisper = Exclude<WhisperJson, null>`; the recursive
  JSON type is exported as `WhisperJson` so null stays legal inside structures. The validator
  refuses a top-level null and `bad_whisper` explains ("to empty a lockbox, erase it").
  Simplifications enjoyed: the demo's `{ whisper }` wrap around guarded reads is gone (null from
  `withUnlockedVault` now means exactly "dismissed"), the dashboard's `?? null` fallback died,
  and the doc blocks stopped warning about the ambiguity. The demo's free-text whisper box now
  types its parse as `WhisperJson` and lets the vault refuse a typed-in "null", surfacing the
  library's own message.
* **Null-sentinel audit** (`Symbol.for` where null did double duty): one real find.
  `vault.ts`'s `bundle` used null for both "backend not read yet" and "backend says absent";
  now `Symbol.for('safebyok.unread_bundle')` marks unread, and `vaultState()` derives `'opening'`
  instead of a hand-built first snapshot. Everything else keeps null honestly: storage reads'
  `| null` is the answer "no such record" (never colliding with a legal row -- the adapter
  contract authors expect), and React's null-means-dismissed/no-session stays, per your ruling.
* **IDE fixes**: each React package's eslint config now names its own `tsconfigRootDir` (the
  "multiple candidate TSConfigRootDirs" parsing error; the phantom `demos/safebyok-react` candidate
  clears when the IDE's eslint server restarts). `FormEvent`, deprecated by @types/react 19.3,
  gave way to `SubmitEvent` in the passphrase modal.

Tests: safebyok 106, safebyok-react 6, demo 24; all three justifies green.
