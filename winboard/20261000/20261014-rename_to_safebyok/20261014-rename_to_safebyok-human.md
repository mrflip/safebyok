# 2026-10-14: The package is safebyok -- byokvault would have collided

npm refused `byok`, and `byokvault` would have been refused too: npm already has `byok-vault`
(another maintainer's browser BYOK vault), and it rejects a new name that differs from an
existing one only by punctuation. `safebyok`, `safebyok-react`, `safebyok-convex` and their
punctuated lookalikes are all free. The GitHub repo is now `mrflip/safebyok`.

The stored format tags were renamed with the package (`safebyok-vault-v1` and the rest). They
are also the first element of every cipher binding, so anything written under `byok-*` neither
validates nor decrypts; nothing was ever published, so no reader for the old tags is kept
(`notes/security.md`). Demo data in a browser from before the rename is orphaned.

Open questions:

* `.devcontainer/devcontainer.json` still names its volumes `byok-…`. Renaming them would
  orphan the existing `~/.claude` and `node_modules` volumes, so it is left for you to do when
  you rebuild the container.
* `packages/safebyok-convex` fails its own `pnpm justify`: it holds only a `package.json`, so
  eslint finds nothing to lint. That predates the rename.
