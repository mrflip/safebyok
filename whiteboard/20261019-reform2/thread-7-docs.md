# Thread 7: docs, the sidecar's trust class and overlapping stores (2026-10-19)

Branch `20261019-docs`, PR to be filed against main (no stack). Justify: green (core 2161 passed, 35 skipped; indexeddb 135; postgres 246; react 227).

* **Built**:
  * VOCABULARY.md, the *sidecar* entry: its trust class is **server-readable** -- authenticated
    (bound into the boxCtx, so a change in storage makes the lockbox refuse to open), never
    encrypted, readable by anyone who can read the database. Says "never public, never plain".
    Legitimate contents: what an app wants searchable server-side (a team, a rotation reminder, a
    usage count). Never secret material.
  * `packages/safebyok/README.md`: the overview bullet, the *A lockbox's sidecar* section and the
    two bullets that said "public fields" use the same words; the *Two devices storing at once*
    section gains a paragraph: do not overlap your own `storeBox()` calls on one lockbox; the
    second is refused as `stale_write`, worded as another device's write, because storage cannot
    tell the two apart.
  * Doc blocks: `storeBox()` in `src/vault.ts` (its sidecar paragraph and one "public fields"
    clause in the damaged-record paragraph) and `Sidecar` in `src/types.ts`.
  * The fixture string and comment in `tests/vault.test.ts` ("sidecars are public") now say
    server-readable.
  * Changeset `.changeset/20261019-docs.md`, `safebyok` minor, as the doc blocks reach the `.d.ts`.
* **Decisions taken** (two-way doors):
  * "server-readable" is the preplan's word, not the Coach's TODO "server accessible".
  * The overview's "only their labels, ids, times and sidecars are plain" became "readable by the
    server"; the README's "the lockbox's public fields" (what the encryption binds) became
    "server-readable fields", since the sentence is about the sidecar riding among them. Other
    uses of "public fields" (wayins, vault props, adapters' READMEs: "ciphertext and a few public
    fields", `vault-db.ts` and `types.ts` "public face/shell") are about records generally, not
    the sidecar, and were left. A later sweep could give the whole set one word.
  * The concurrency paragraph went in the README only; I did not touch the `storeBox()` doc
    block for it, as thread 1 is adding a paragraph there.
  * `fields.ts` in safebyok-graphql classes `sidecar_json` as `'plain'`: a code identifier, not
    prose; left.
  * Changeset level: minor, as the handoff directed (PROCESS.md would otherwise call a docs-only
    change empty or patch).
* **Deviations**: the `Sidecar` doc block in `types.ts` and the one clause in the `storeBox()`
  damaged-record paragraph were touched beyond "the sidecar paragraph" because each said "plain"
  or "public" of the sidecar.
* **Discoveries**: the `stale_write` message for a lockbox write (`Refusals.staleWrite`) already
  says "another device or tab wrote or retired it", so the README paragraph describes the
  message as it is.
* **For the Coach**: nothing needing a human. Nothing here belongs in `notes/security.md`
  (words, no behaviour).
