# 2026-10-14: Round two done -- library in src/, safebyok-react package, knock-knock demo. PR filed.

All five rulings applied:

* `demos:` prefix in PROCESS.md; sign-out now locks the vault; labels are
  `/^[a-z](_?[a-z0-9])+$/` max 40; `stableJsonify` (your TODO.md note) backs snapshot change
  detection.
* **Library moved to the root `src/`** and exported from `src/index.ts` -- still the plaintext
  stub, loudly marked in doc blocks and `notes/security.md`. zod came aboard as a regular
  dependency (CLAUDE.md names Zod as the validation choice -- flag if you want it peer).
* **`packages/safebyok-react`**: provider (now takes `userId` from the host's auth, no coupling to
  the demo's fake auth), `useVault`/`useVaultSnapshot`, `guard()`, passphrase dialog. Tested with
  testing-library under jsdom (6 tests incl. the unlock-retry and dismissal flows). Source-
  exported, `private: true` until it earns a build. Commit prefix used: `api` -- nothing in the
  table fit; bless or rename.
* **Demo reorganized** as a professional one-page app: `components/` (KnockKnock, VaultDashboard,
  SessionBar, PsstModal, `inspection/` with VaultDBInspectionPanel + DeviceDBInspectionPanel),
  `lib/` (auth, stores, anthropic, whisper-text), `hooks/`. The inspection panels delete as a
  unit: two tagged lines in App.tsx plus one directory. The knock-knock machine stores your
  Anthropic key as the lockbox `anthropic_api_key` and tells jokes via Claude Haiku 5.5,
  browser-direct (SDK with `dangerouslyAllowBrowser`, by design).

Open questions in `winboard/20261014-foundations/demo-interface-notes.md` (zod peer-vs-dep,
safebyok-react packaging/prefix, demo's build-first dev loop, whisper strictness).

Counts: safebyok 105 tests, safebyok-react 6, demo 24; root `pnpm justify` and both package justifies
green.
