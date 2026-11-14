---
"safebyok-big": minor
---

**`gating.attempt(clears)` takes any kind's clears in its type**, so a `RequestCleartext` that calls `gating.attempt({ passphraseClear })` compiles with no narrowing on `gating.gatingkind`. The gating's own kind still checks the clears when it runs: another kind's shape refuses `bad_option`, settles the gating and spends a passkey answer it carries, as a malformed attempt always has. A shape two kinds share, such as `{ passphraseClear }` for `build_vault`, `unlock_vault`, `revoke_passkey` and `del_vault`, is that kind's own and is attempted. **Stored format:** unchanged.
