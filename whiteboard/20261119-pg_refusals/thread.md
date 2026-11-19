# Thread 2: pg_refusals (2026-11-19)

Branch `20261119-pg_refusals`, PR [#763](https://github.com/mrflip/safebyok/pull/763), on main (batch `sentinel_audit`, not a sprint). Proved:
package tests, typecheck and lint for safebyok-postgres (337 tests), safebyok-graphql (446, its
dependencies built), safebyok-fastkey (43); `pnpm justify` after the catch-up rebase, see the PR.

Items are the audit's ids (`human/20261119-sentinel_audit.md` in the base checkout), each with the
Coach's "go".

* **Built**
  * **B3**, `refusalOf` (`packages/safebyok-postgres/src/postgres-bank-db.ts`, `[Refusals]`): one
    helper over an allowlist. `storage_unavailable` for SQLSTATE classes 08, 40, 53, 57 and 55P03;
    Node codes ECONNREFUSED, ECONNRESET, ECONNABORTED, ETIMEDOUT, EPIPE, EHOSTUNREACH, ENETUNREACH,
    ENETDOWN, EAI_AGAIN; pg 8.23.1 / pg-pool 3.14.0's codeless lost-connection messages, matched
    exactly. Everything else `unexpected_error`. `codeOf` keeps a code only if it matches
    `/^[0-9A-Z][0-9A-Z_]{0,39}$/`.
  * **C6**, both adapters: one `storedNothing()` (exported from `postgres-bank-db.ts`), kind
    `unexpected_error`, sentence `StoredNothing` in the new `packages/safebyok-postgres/src/phrases.ts`.
    The bank adapter's five sites go through `demandWrote(answered, stored)`; the vault adapter's two
    (`doWriteThing`, `doBirthBank`) throw it where they threw `storageIssue()`.
  * **E**, both adapters' `doWatch`: the notice fetch (`#heardOrNull`, `#receivedOrNull`) takes an
    `onFailed`; a refusal other than `storage_unavailable` ends the watch (unlisten) and calls
    `onBadNews` once. No restructuring was needed.
  * **B4**, `openWatch` (`packages/safebyok-graphql/src/bank-resolvers.ts`): passes an `onBadNews`
    that enqueues the VaultError and closes the stream; `watchNotices.next` turns it into
    `badNoticeOf(...)`, and the read after is done.
  * **D**, `crossedErrOf`: `(meta?.capacity === undefined) ? null : DB.capacity.parse(meta.capacity)`.
  * **C7**, `troubleOf` (`graphql-bank-db.ts`): a GraphQL error is `serverErred()`, still
    `unexpected_error` with no cause, sentence `ServerErred` in the new
    `packages/safebyok-graphql/src/phrases.ts`. `fieldOf`'s missing field keeps `schemaNotServed()`
    and big's `SchemaNotServed`, which is exact there.
  * **C10**, fastkey: its three sentences move to `packages/safebyok-fastkey/src/phrases.ts`; the
    CompileError one says a CSP is the "likely cause". README softened to match.
  * READMEs (postgres refusal rule, notice failures, long user_id; fastkey CSP), three changesets
    (patch each), a `notes/security.md` entry (written by a sonnet subagent).
* **Decisions made**
  * **C6 is `unexpected_error`, not `storage_issue`.** Both kinds exist in big and the new core. The
    classifier has already checked the rows it was handed, so a write function that stored nothing
    where the classifier finds a write is our SQL out of step with our classifier (functions SQL from
    another version, or a bug), never a row no working store could produce. Same reasoning and shape
    as safebyok-convex's `StoredOutOfStep`.
  * **Package-local phrases modules** rather than adding sentences to frozen big, after convex's.
  * **C7's optional meta (first error's path, `extensions.code`) is not added**: `RefusalMeta` has no
    field for it, so it needs big's type broadened, or a cause, which the no-cause rule forbids.
  * **B4 enqueues the VaultError, not a pre-built bad notice**, so the stream stays of domain values
    and `next` makes the wire form, as it does for every other notice.
  * Tests: fake clients (`throwingClient`, `answeringClient`) and a `capturingListen` drive the
    storedNothing and E cases; PGlite cannot be made to fail one statement with a chosen SQLSTATE.
* **Deviations** (contract questions, all in broken or misconfigured states)
  * **55P03 added to the allowlist** beyond the ruling's four classes: without it a healthy, contended
    database under `lock_timeout` would answer `unexpected_error` where it answered
    `storage_unavailable`, a working-case change.
  * **EAI_AGAIN in, ENOTFOUND out**: a lookup that may succeed later against a host name that is
    likely misconfigured.
  * **pg's 'Connection terminated' and 'Client was closed and is not queryable' left out**: pg raises
    them when the host ended its own client, which a retry does not mend.
  * **A user_id past 54 bytes** now refuses each notifying write as `unexpected_error` (cause
    `channel name too long`, 22023) where it was `storage_unavailable`. It falls out of the ruling;
    the database is healthy, so a reader may call this a working case. README updated.
  * **Any codeless plain Error** (a TypeError from a broken client, an unknown driver's message) is
    now `unexpected_error`; the old rule made it `storage_unavailable`.
* **Discoveries**
  * The vault adapter's `#receivedOrNull` calls `Classifier.worldOf` outside its try on the carried
    path (notice with thing and world); a throw there is an unhandled rejection, not bad news. Out of
    scope (it is a damaged-notice case), noted for a later thread.
  * postgres.js's codes (`CONNECTION_CLOSED` and kin) are not in the allowlist: that driver is not
    installed, so they could not be checked against its source.
* **For the Coach**: the 55P03 addition and the long user_id's new kind (above).
