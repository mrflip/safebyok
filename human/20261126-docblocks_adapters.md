# 2026-11-26: Doc blocks flagged by the adapter_port reviews, rewritten -- four questions

Branch `20261126-docblocks_adapters`, stacked on #936. Doc blocks only, plus three `// name @example` marker comments in the
Convex tests. No behaviour, name or test title changed.

## Changes, member by member

**`packages/safebyok-convex/src/component/things.ts`**

- `getThing`: was a list of every field it fetches. Now "Fetch the stored Things a get is classified against, in one snapshot."
- `listThings`: the same, for a listing.
- `writeThing`: "Classify a write, and store its record if the act is a write, in one transaction." A second line says the
  Things come back as fetched before any write, and `written` is what was stored, or null.
- `birthBank`: the same shape, for a bank's three roots.
- `rootsIn`: "The raw roots of `ask`'s bank, and how each compares with what `ask` tracks."
- `aboveIn`: "The raw nearest Thing stored above `ask`'s scope, with its bank and `tracked`."
- `childrenIn`: "The raw children of `scope`, with their labelpaths."
- `writeAt`: "Store `thing` at `scope`, and return it as read back." The `commit_ts` stamp moved into a `//` comment above:
  every write stamps it, and `watchThings` reads from it.

**`packages/safebyok-convex/src/convex-vault-db.ts`**

- `runOrRefuse`: "Run `thunk`, rethrowing any failure as a VaultError."

**`packages/safebyok-convex/tests/`** (the `@example` twins, STYLE.md *Tests*)

- `server.test.ts`, the `serves ${fnname}` loop: `// SafebyokVaultComponent @example` and `// GetUserId @example`. The file's
  host is `TH.vaultHostWith(TH.bySubject)`, the README's setup, which is what both examples show.
- `test.test.ts`, "serves a host app's re-exported functions...": `// register @example`.

**`packages/safebyok-postgres/src/refusals.ts`**

- `isTransient`: "True for a failure a retry may mend."
- `codeOf`: "The `code` of `thrown`, such as SQLSTATE 40001 or ECONNRESET, or undefined for none." Its guarantee (only a code
  of capitals, digits and underbars is read, so it cannot quote a row) moved into a `//` comment above.

**`packages/safebyok-fastkey/tests/wasm-deriver.test.ts`**

- `storeFakeBox`: "Store {@link FakeWhisper} in a new bank whose passphrase key `keyDeriver` derives, and return its vaultDB."
- `expectBoxUnseals`: "Expect `device` to unlock with the test passphrase, and unseal the stored box to {@link FakeWhisper}."

**`packages/safebyok-graphql/src/graphql-vault-db.ts`**

- The header: all four error cases are kept, as the Coach asked, and only reworded: "as where" became "as when", the kind
  list in case 1 became "whatever its kind", and "leaves the server's text behind" became "without the server's error text".
- `throwIfThrown`: "Rethrow the refusal of a server verb that threw, with its act and the Thing it names." Its `//` comment
  now says only the invariant: the server answers `tracked: 'unread'` for a verb that threw, and for no other answer.
- `hearNotice`: "Pass a notice's Thing to `receive` and its trouble to `onBadNews`, or return the trouble that ends the watch."
- `refusedActualOf`: no longer exists. Commit ac63a9408 replaced it with the core's `crossedRefusedWriteOf`, rewritten below.

**`packages/safebyok-graphql/src/vault-resolvers.ts`**

- `serveSignedIn`: "Answer `given` by `verb` in wire form, if it passes `checkAsk` and the request is signed in as its
  user." A second line: "Otherwise answer its refusal, as a verb that threw does."
- `watchNotices`: "Watch `scope`, returning its notices in wire form for as long as the request stays signed in as its user."
  ("yield" was wrong: it returns an iterator.)
- `openWatch`: "Watch `scope` on `vaultDB`, returning a reader of its notices in wire form. Cancelling the reader stops the watch."

**`packages/safebyok/src/shapes/shapes-crossed.ts`**

- The header: "The parts of a vaultDB answer that cross a wire from a server's vaultDB to a client's: their checks, and a
  refusal's conversion to and from wire form." The `storage_issue` line is kept, split into two sentences.

**`packages/safebyok/src/storage/thing-classifier.ts`**

- `CrossedRefused`: "The act and Thing of a refusal that crossed a wire, checked." It no longer describes an adapter's report.
- `crossedRefusedWriteOf`, `crossedRefusedBirthOf`: a one-fact first line, then what must match ("The Thing must be...,
  and the act must be the refusal the act tables give over it"), and "A mismatch refuses `storage_issue`."
- `crossedListingOf`: the gapped list became sentences, ending "Anything else refuses `storage_issue`." The brief placed it
  in shapes-crossed.ts, but it lives here.

## Facts dropped

None of these is lost from the code: each is in the signature, a validator, or a block nearby.

- `getThing`, `listThings`: which Things each fetches (the Thing at the scope and the nearest above it; the parent and its
  children; the bank and `tracked`). These are in `CVX.thingFetched` and `CVX.thingsFetched`.
- `writeThing`, `birthBank`: "against the Thing at its scope" and "against its bank, main gate and root box".
- `rootsIn`, `childrenIn`: the roots named one by one; "one label under" (now "children").
- `writeAt`: "over the document there or as a new one" (how it stores).
- `runOrRefuse`: "a safebyok refusal". `refusalOf`'s block says what the refusal is: one the host's functions sent, or
  `storage_issue` naming `oplabel`.
- `isTransient`: its three sources (a transient SQLSTATE, a socket's system error, a pg connection message). The comments
  on `TransientSqlstate`, `TransientSystemCodes` and `PgConnectionLost` give them, and `refusalOf`'s block says what a
  retry may mend.
- `storeFakeBox`, `expectBoxUnseals`: the steps (birth the bank, put the box, sign in) and "the box the other device stored".
- `throwIfThrown`: that the named Thing is checked (`crossedNamedOf`, refusing `storage_issue`).
- `openWatch`: **"Where the watch ends itself, the stream closes after the bad news that says why."** This is the only
  dropped fact a caller might want back: it is why `watchNotices`' iterator finishes. I judged it ordinary stream
  behaviour, and the `controller.close()` after the last notice shows it.
- The GraphQL header: "GraphQL only carries each answer, so"; case 1's kinds (`storage_issue`, `unexpected_error`); case 2's
  "a bad answer carrying that refusal".
- The shapes-crossed header: "for an adapter whose server runs a whole vaultDB", and its list of what is checked, which
  `CrossedChecks`' own block lists.
- `CrossedRefused`: "what a concrete adapter's refused report carries beside its banktok, tracked and read_tc".

## Proposed renames

None. Every first line fits its name.

## Open questions

1. **`convex.config.ts`'s `@example` has no twin.** It is the host's own `convex/convex.config.ts`, and convex-test's
   `defineTestApp` stands in for it, so no test runs it. I recommend keeping it untwinned: it is the install step, and the
   README shows it too. The other choice is to drop it in favour of the README.
2. **Are indirect twins enough?** The `SafebyokVaultComponent` and `GetUserId` examples are covered through
   `TH.vaultHostWith(TH.bySubject)`, which builds the same thing through test helpers, not the example's literal text. The
   same goes for `register` through `installedVaultComponent`. If a twin has to be the example's own code, these three
   need tests of their own.
3. **`ConvexVaultDB` has no `@example`.** I added none: `#example-earns-its-lines` gives a one-call constructor none, and
   `ConvexVaultDBOpts` already says to pass `api.safebyokVault`, not the whole `api`. Was a `ConvexVaultDB` example part of
   what "the missing `@example` twins" meant?
4. **Proof.** As the brief asked, I ran lint and typecheck in safebyok, safebyok-convex, safebyok-postgres,
   safebyok-fastkey and safebyok-graphql, all green. I did not run `pnpm justify`. The only test edits are comments.

I found no place where the code and the old prose disagree.
