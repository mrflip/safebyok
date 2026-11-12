# Thread BP: bank_parent (2026-11-12)

Branch `20261112-bank_parent`, stacked on [#670](https://github.com/mrflip/safebyok/pull/670) (thread 14); the line below: #671, #669, #668, #666.
Justify: green (safebyok 3370, indexeddb 376, postgres 433, react 261, convex 508, graphql 409, e2e 549 on a real Postgres).
The Coach, 2026-11-12: "have bank's parent be 'main', just to be type uniform".

* **Built**: a bank is at the top, and says so: its `parent` is `'main'`, never null.
  * `BX.BankTop = 'main'` (shapes-bankdb.ts, beside the bank forms), and `BX.noticeParentOf(val, parent)`: the parent storage sent, else `main` for a bank row, else null.
  * `delBank` / `tryDelBank` (AdapterBankDB): good answer and classified refusal carry `parent: BankTop`. `DelBankAnswer` is `Answer<BankRow | null, OkAct, typeof BankTop>`.
  * `AdapterBankDB.watch`: a bank row's notice has `parent: 'main'` (derived once, in `watch`, so no adapter changed).
  * `WX.delBankAnswer`: `parent` and `badParent` are `lit('main')`, no default: a wire answer without its parent is refused `unexpected_error`.
  * `WX.crossedNotice`: accepts `'main'`, and fills it for a bank row that crosses with null.
  * safebyok-graphql: `SafebyokDelBankAnswer.parent: String` (nullable: a refusal thrown before any row was fetched has none); `BankOperations.delBank` selects it. A GraphQL union cannot hold a string, so the server sends a bank row's notice with `parent: null` and `GraphQLBankDB` reads it as `main` through `crossedNotice`.
  * Tests: the battery asserts `BankTop` on delBank answers and the bank-wide watch's tombstone notice; shapes test for the missing parent and the null-to-main fill; a resolver test for the bank notice over Yoga.
* **Decisions taken**:
  * Left null, per the directive: a refusal's `parent` when it failed before any row was fetched (`answerForRefusal`, `badAnswerOf`, `unclassified_storing`, the notice that ends a watch). Also a vault, gate or box row's notice that storage heard without its parent row: null there means "none sent", not "at the top". So `Notice.parent` is still nullable.
  * Adapters (indexeddb, postgres, convex) are untouched: none emits a bank-level parent of its own; their bank-row notices carry none and `watch` fills `main`. Postgres SQL unchanged.
  * `delBank`'s GraphQL `parent` is `String`, not `String!` (the spec said `String!`): a thrown refusal's answer carries null.
  * `BankTop` is a `const`, its type `typeof BankTop` where needed (no separate type, as `NOVEL`/`Novel` would add a name for one literal).
* **Deviations**: none from the directive. Models (`listing.ts` `receiveParent`, `Device`) untouched, as told.
* **Discoveries**: the `Heard`/`Notice` null conflates "bank at the top" with "storage sent no parent", which is why a bank row's notice cannot just say null-means-main; `noticeParentOf` separates them by the row's `fmt`. Thread 8b/8c's `receiveParent` can switch on `'main'` for a bank row and on null as "unknown".
* **For the Coach**: src lines (rule 16) +33 / -17 (net +16): the new `BankTop`, `noticeParentOf` and the GraphQL null-on-wire line are the additions; no null case a reader switched on was removed on this line yet, 8b/8c will. Changeset: minor, safebyok and safebyok-graphql.
