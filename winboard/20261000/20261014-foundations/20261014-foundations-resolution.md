# 20261014-foundations: resolution

Foundations rounds two to four and the react demo: the vault interface in `src/`, the `safebyok-react` binding and the knock-knock demo, filed as [#3](https://github.com/mrflip/safebyok/pull/3). Gripes from its whiteboard files, its -human reports and its PRs, as consolidated in `whiteboard/20261016-gripes_boogaloo/` (2026-10-16).

13 gripes: 2 unresolved, 11 resolved.

## Unresolved

- G023 **Decide:** drop `note` for a reserved, bound `public` bag (any JSON, default `{}`), or keep label-plus-note and let hosts keep their own table — todo_gripes, old_gripes, whiteboard_gripes
- G334 Say in the React README that "never put secrets in state" conflicts with a reveal/view feature that puts whispers into React state — old_gripes, whiteboard_gripes

## Resolved

- G003 Get the Coach's yes for runtime deps `@noble/hashes`, `@scure/base`, `idb-keyval`, `safe-stable-stringify` → resolved with the Coach in chat; hand-rolled stableJsonify replaced (PR#5)
- G088 Default sign-out policy for the remembered unlock → sign-out locks; identity_revoked erases the remembered unlock (PR#106)
- G097 Whisper strictness: refuse what JSON mangles, never a bare null → Coach: no bare null; Zod JSON schema refuses Date/Map (Coach ruling; packages/safebyok/src/types.ts)
- G156 STYLE's `\w`-only labels refuse `anthropic-prod`; host-chosen boxlabels → hosts supply their own schema (PR#95)
- G308 `guard()` resolving null for a dismissed dialog collides with a null whisper → renamed `withUnlockedVault`; a whisper is never a bare null (Coach ruling, foundations round four)
- G345 Build a React demo exercising the packages (sign-in, lockbox CRUD, passphrase on demand, inspector) → `demos/safebyok-demo-react` (human/20261014-byok_react_demo)
- G346 Solve the demo's build-first dev loop → `pnpm demo:react` builds then starts (foundations round three)
- G391 Is zod a regular dependency or a peer? → peer `^4.0.0` (PR#5)
- G434 Give `safebyok-react` a publishable build like the core; peer range `^0.0.0` → tsdown build, lockstep `workspace:^` rewritten at pack (PR#15)
- G456 Bless commit prefixes `demos:` and the safebyok-react prefix (`api:`/`react:`) → PROCESS.md rows; `client:` for safebyok-react (old_gripes, Addressed; PROCESS.md)
- G485 The IDE's phantom `tsconfigRootDir` candidate → each React package names its own; Coach marked fixed (old_gripes, Addressed)
