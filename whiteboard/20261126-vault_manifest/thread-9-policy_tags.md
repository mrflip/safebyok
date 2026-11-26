# Thread 9: policy_tags (2026-11-26)

Branch `20261126-policy_tags`, PR #943, stacked on #942. Proved: `pnpm --filter <pkg> test` for `safebyok` (2,426),
`safebyok-postgres` (168), `safebyok-indexeddb` (130), `safebyok-convex` (232); lint and typecheck of `safebyok` and
`safebyok-postgres` clean. `pnpm justify` after the catch-up: pending.

* **Built**
  * **A policy verdict names its refusal by tag.** `ManifestChecks.policyVerdict` (`shapes-manifest.ts`) is
    `{ ok: true } | { ok: false, refusaltag }`, the refusaltag one of `PolicyPhrases`' keys (a `PolicyTag`); anything
    else refuses `storage_issue`, as does a verdict still carrying `message` (`.strict()`).
  * `GatePolicies` (`policies.ts`) returns `PolicyTag | null`; `policyVerdictOf` (`manifest-tags.ts`) wraps it.
    MemoryDatastore, `IdbDatastore` and Convex's `component/things.ts` make their tags with `ManifestTags`, so they
    follow with no change of their own.
  * `refusaltagOf` (`manifest-acts.ts`) returns the failed policy's tag directly; `PolicyTagForPhrase` (thread 8's
    scaffolding) and the es-toolkit `invert` import are gone. `Throwers.taggedRefusal` is unchanged.
  * **Postgres** (`vault-functions.ts`): each `*_refusal` function returns its tag, through a typed
    `sqlTagOf(tag: PolicyTag)` that replaces `sqlTextOf`; `policy_verdict_of` builds `'refusaltag'` where it built
    `'message'`. The header comment says "check for check and tag for tag". Postgres's tags test already compares
    each write's tags, verdicts among them, with `ManifestTags.writeTagsOf`.
  * `notes/vault-adapter-contract.md`: the `policies` row. `.changeset/20261126-policy_tags.md`: `safebyok-postgres`
    minor, for `VaultFunctionsSql` and for adapter authors. `notes/security.md`: a new entry superseding thread 8's
    (sonnet subagent), no old entry touched.
  * Tests: manifest-acts.test.ts's policied rows use tags, and "refuses gate_issue with the message of each storage
    policy's refusaltag" walks every `PolicyPhrases` key; adapter-vault-db.test.ts adds "refuses, as a broken store,
    a storage policy's verdict whose refusal is not a tag of PolicyPhrases" (an unknown tag, and a verdict with
    `message`); manifest-tags.test.ts pins the wayin-less gate's verdict to `PasskeyStored`.

* **Decisions made**
  * **The field is `refusaltag`**, the name the policied manifest already gives the same value, so a verdict's
    refusaltag is the manifest's refusaltag with no renaming between. Set aside: `tag` (too bare beside the other
    tags) and `policytag` (a second name for one value).
  * **`PolicyPhrases` stays exported** from `safebyok/storage`: `PolicyTag` is `keyof typeof PolicyPhrases`, and an
    adapter author writing a datastore in another language reads the tags off it. Its doc now says it maps a
    verdict's tag to its message.
  * **The `PolicyPhrase` type is removed** (thread 8 added it, unreleased; nothing names it now). Pre-1.0 and
    safebyok private: no changeset of its own.
  * **The check's tag list is `Object.keys(PolicyPhrases) as PolicyTag[]`**, the repo's precedent
    (`ThingFieldnames` in `base-thing.ts`). `oneof(PolicyPhrases)` would check values, the messages. Set aside:
    `mapValues` to a key-to-key object, cast-free but obscure.
  * **Postgres's SQL names each tag through `sqlTagOf(tag: PolicyTag)`**, so a misspelt tag fails typecheck rather
    than reaching only the tests that exercise its branch. Tags are identifiers, so it needs no quote escaping.

* **Deviations**: none from the handoff. Convex and IndexedDB needed no edit (they call `ManifestTags`).

* **For the Coach**
  * No answer of a working vaultDB changes: the message was `gateIssue(PolicyPhrases[PolicyTagForPhrase[message]])`
    and is now `gateIssue(PolicyPhrases[tag])`, the same string; manifest-acts.test.ts checks every tag.
