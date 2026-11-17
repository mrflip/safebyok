# Thread 1: kdf_configs (2026-10-15)

Branch `20261015-kdf_configs`, PR #68, stacked on #80 (the line #66 → #70 → #75 → #80 → #68).
Justify: green -- core 838 tests, convex 268, react 28, demo 124, root 109; `pnpm size` green
after the budget bump below.

Review: `fixed`. The reviewer's commit names the 2^32 ceiling in the `iterations` refusal; a
follow-up commit has the supplied-label refusal tell a stand-in's author to test its bytes. The
review's other findings are open questions on #68, also listed under *For the Coach* below.

* **Restacked** (2026-10-16, at the Coach's word, so the gripe_fixes PRs merge as one line):
  rebased from #66's tip `5fefc90` onto #80's tip `98c67d1`; the old tip is tagged
  `20261015-kdf_configs-prerestack` (local). Conflicts, all additive, both sides kept:
  `notes/security.md` (#70's VaultDB-write entry and this thread's, one after the other); the
  README errors table and `errors.ts`'s `bad_option` comment (#70's wider wording, with
  `argon2idDeriver`'s spec added to it). `vault.ts` merged cleanly. `vault.test.ts` merged but
  used the local `expectRefusal` #75 removed: now `TH.expectRefusal`, and two open-then-unlock
  pairs use the world's `openUnlocked`. `key-deriver.test.ts` keeps its own synchronous
  `refusalOf`: TH has no synchronous refusal check, and wrapping the factory in a promise to
  borrow `TH.expectRefusal` met three lint rules. **Size budget** raised, as the Coach approved:
  everything 24 → 24.5 kB (23.48 on #80, 24.24 now), openVault 16.5 → 17 kB (16.27 → 16.61);
  nothing else moved. **TODO**: Soonish now holds "built-as-a-whole recommended KDFs and
  functions to roll your own", replacing the RFC 9106 second-option question.
* **Built**:
  - `packages/safebyok/src/key-deriver-spec.ts` (new): the general `KeyDeriverSpec` type (was
    `typeof Argon2idWebV1`), `Argon2idWebV1` (moved here, unchanged), the internal list of
    supplied specs, `MaxSaltBytes` (65536), `PassphraseKeyBytes` (32), and
    `ensureSuppliedSpecKept`: a deriver or spec wearing a supplied label must carry each of that
    spec's fields, `===`. No Argon2id and no Zod schema in it, so `openVault` can import it.
  - `key-deriver.ts`: `argon2idDeriver(spec)`, the exported factory: a zod/mini schema of
    Argon2id's workable bounds, a refusal message per field (never quoting input), the supplied-
    label check, and a frozen deriver carrying the spec's fields beside `deriveKeyBytes`.
    `argon2idWebV1Deriver` is the same builder over `Argon2idWebV1`, unparsed (it is ours).
    `KeyDeriver` is now `Partial<KeyDeriverSpec> & { key_deriver_label, salt_bytes,
    deriveKeyBytes }`.
  - `vault.ts`: `keyDeriverShape`'s `salt_bytes` is 1 to 65536; `parseKeyDeriver` runs the
    supplied-label check; the three derivation sites go through `derivePassphraseKey`, which
    refuses (`bad_option`) output that is not 32 bytes.
  - `index.ts` exports `argon2idDeriver`. Core README *Key derivation* section; VOCABULARY rows
    for keyDeriverSpec, keyDeriverLabel, passphraseSalt and a new **key deriver** row naming
    `argon2idDeriver`; `notes/security.md` entry; minor changeset.
* **Decisions taken**:
  - **One supplied spec.** RFC 9106's first option needs 2 GiB (past what `@noble/hashes`
    allocates); its second differs from `Argon2idWebV1` only in 4 lanes, which a single-threaded
    JS deriver runs serially, so it would buy a browser nothing but a permanent second label;
    OWASP's are server minimums, below ours. Adding RFC 9106's second is a one-line change.
  - **"Unworkable" is the library's and platform's limits**: salt 8..65536 for Argon2id (noble
    and the reference code refuse < 8, so **1 is unworkable for Argon2id**, as the plan
    anticipated), memory 8·p..1048576 KiB (noble's default `maxmem`, 1 GiB; I did not raise it),
    iterations 1..2^32-1, lanes >= 1, output exactly 32. For a *generic* `keyDeriver` (not
    necessarily Argon2id, e.g. `testDeriver`) the shape check is 1..65536: 1 is foolish but
    runs, so it is allowed there. Weak Argon2id (8 KiB, one pass) is allowed.
  - **Enforcement = a deriver carries its spec flat** (`{ ...Argon2idWebV1, deriveKeyBytes }`),
    not nested: a stand-in is written by spreading the spec. It checks what a deriver declares,
    not what it derives (a known-answer check at open would cost a full Argon2id run every open);
    the README tells a stand-in's author to test bytes against ours.
  - **The 32-byte output check** was added in the vault (not only the factory): WebCrypto
    accepts 16 or 24 raw bytes as AES-128/192, so a hand-built deriver could silently weaken the
    passphraseKey.
  - **Tree-shaking**: the factory's schema is marked `/* @__PURE__ */` and the supplied deriver is
    built without parsing, so `argon2idWebV1Deriver` alone stays at 5.0 kB (budget 5.5).
    `openVault` grew 15.9 -> 16.19 kB (budget 16.5), everything 22.85 -> 23.59 (24).
    `index.test.ts`'s "no Argon2id in openVault" check now looks for `argon2d` (noble's variant
    table), since the supplied label necessarily ships with openVault now.
* **Discoveries**:
  - Thread 5 (docs_refresh): VOCABULARY now has a **key deriver** row naming `argon2idDeriver`,
    `argon2idWebV1Deriver` and `Argon2idWebV1`; `notes/security.md` 2026-10-14 entry on the seam
    is now partly superseded by this thread's entry (appended at the end).
  - Thread 8 (comment_width): new comments are within 100 columns, examples included.
  - `@noble/hashes` accepts `m` up to 1048579 at p=1 (it rounds down to a multiple of 4p before
    comparing with `maxmem`); our bound of 1048576 is the round number.
* **For the Coach**:
  - Breaking for a host with its own `keyDeriver` labelled `argon2id_web_v1` that does not
    spread the spec: it is now refused at open. Minor bump, per pre-1.0 rules; the changeset says
    so.
  - A host's own label is checked against nothing (only the label is stored). Reserving a
    namespace (refusing host labels like `argon2id_web_*` so a future supplied spec can't collide)
    would be cheap; not done, as nobody asked.
  - Whether to add RFC 9106's second recommended option as a second supplied spec.
  - From the review, also on #68: a deriver under a host's own label declaring
    `algorithm: 'argon2id'` gets only the generic 1..65536 salt check at openVault, so an
    unrunnable hand-built spec fails at `unlock()` as noble's plain Error, with no kind (a
    follow-up could run the Argon2id schema from `key-deriver-spec.ts` whenever
    `algorithm === 'argon2id'`, if the size budget allows); `KeyDeriver`'s `Partial<KeyDeriverSpec>`
    gives every deriver Argon2id's optional fields (surface, before 1.0); passphraseKey bytes
    are not zeroed (predates); bounds are repeated as literals in the messages and doc block, and
    an oversized parallelism is reported under `memory_kib`; the 32-byte check takes any
    ArrayBufferView.
