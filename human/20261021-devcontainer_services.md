# 2026-10-21: Dev container Postgres for every session ([#226](https://github.com/mrflip/safebyok/pull/226)) -- untested against Docker

The dev container now starts a Postgres beside it, which every worktree in the container shares,
each test file in its own database. MySQL and Convex are commented slots. None of it has run yet:
the container I wrote it in has no Docker. The first rebuild is the test, with
`pnpm --filter safebyok-e2e test:postgres` from inside it.

Open questions:

* **Convex, per session.** One backend is one deployment, so parallel sessions pushing different
  component code would overwrite each other. When the real-backend tests are written: share one
  deployment, or run a backend per session (`convex dev --local`?)?
* **Convex entrypoint.** The slot assumes the image's entrypoint is `./run_backend.sh`, from the
  upstream self-hosted scripts. Check it with `docker inspect` when you pin the digest.
