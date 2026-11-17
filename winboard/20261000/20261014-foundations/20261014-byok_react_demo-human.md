# 2026-10-14: safebyok-react demo up -- interface sketched, four questions

Built `demos/safebyok-react/`: a private workspace package with a single-page playground for the
interface. Stub vault (plaintext, loudly marked), fake sign-in, lockbox CRUD + "use" with
ask-for-passphrase-on-demand (remembered 7 days), and an inspector showing the pretend-backend
rows and device rows as distinct stores. 86 vitest tests on the machinery; no playwright.

Decisions and open questions are in `winboard/20261014-foundations/demo-interface-notes.md`.
The ones that most want your eyes:

1. **Sign-out policy**: demo keeps the remembered unlock across sign-out (scoped per user);
   the real package should probably drop it. Pick a default.
2. **Label rule**: STYLE's `\w`-only labels refuse `anthropic-prod` / `anthropic:prod` styles.
   OK for user-typed boxlabels?
3. **`guard()` returning null** for "dialog dismissed" collides with legitimately-null whispers;
   kept it in scaffolding with a workaround, flagged so it never enters the library surface.
4. **New commit prefix `demos:`** -- not in PROCESS.md's table; nothing there fit. Bless or
   rename.

Housekeeping: root `eslint.config.mjs` now ignores `demos/**` (each demo lints itself);
`pnpm-workspace.yaml` gained `packages: [demos/*]`. Demo devDeps installed as the boring answers:
vite 8, @vitejs/plugin-react 6, react 19.3, zod 4, vitest 5, eslint-plugin-chai-friendly.
