# Contributing

Thanks for your interest in safebyok. It is a small library that holds people's secrets, so it moves
carefully: please open an issue to talk over anything larger than a fix before you write it.

**Found a security problem?** Don't open an issue: see [SECURITY.md](SECURITY.md).

## Getting started

You'll need the Node and pnpm versions in `.tool-versions`.

```sh
pnpm install
pnpm justify                        # lint, typecheck, test and build, every package: what CI runs
pnpm --filter safebyok test:watch   # one package's tests, as you edit
```

## What a pull request needs

* **`pnpm justify` green**, on every commit: each commit lands in `main` on its own.
* **Tests**: one for each use case of anything exported, and one for each `@example` in a doc
  block. For anything touching a secret, also a test that the wrong passphrase, tampered data or a
  malformed record is refused, and that no error carries the secret.
* **A doc block** on everything exported, written for the developer calling it.
* **A branch rebased onto `main`**, with no merge commits in it: CI refuses them.
* **A changeset**, if it changes a published package: `pnpm changeset` asks which packages, how
  big a bump, and a sentence for the CHANGELOG. A change that needs no release (tests, tooling,
  docs) adds an empty one, `pnpm changeset --empty`. CI asks for one or the other.
* **No new runtime dependency** without discussing it first: every one ships to every app that
  installs safebyok.

How we write the code -- names, braces, quotes, doc blocks, tests -- is in
[STYLE.md](STYLE.md); how work is organized and committed is in [PROCESS.md](PROCESS.md); what
CI checks is in [notes/ci.md](notes/ci.md), and how a release is made in
[notes/releasing.md](notes/releasing.md). Commit messages take a prefix naming the part of the
package they touch (`vault: ...`, `crypto: ...`): the table is in PROCESS.md.

## License

safebyok is licensed under the [Apache License 2.0](LICENSE). By contributing, you agree that your
contribution is licensed under it too.
