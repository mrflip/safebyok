# Thread B: convex_vault (2026-11-25)

Branch `20261125-convex_vault`, PR [#923](https://github.com/mrflip/safebyok/pull/923), stacked on [#916](https://github.com/mrflip/safebyok/pull/916).
Proved: `pnpm justify` green after the catch-up onto `origin/20261125-big_names` (de6cc88db): safebyok-convex 184,
safebyok 2203, safebyok-big 2950, convex-big 334, postgres 124, indexeddb 115, react 339, fastkey 43, graphql-big 448,
e2e 576, demos 99/24/26/111, the other -big packages green; lint, typecheck and build clean.

The catch-up rebase met one conflict, in `notes/security.md`: both sides added an entry at the top of *Of Interest*;
both kept, this thread's first.

A first worker died of a network error before committing; its uncommitted port was judged sound and kept, then
finished, tested and committed by the second.

* **Built**
  * `packages/safebyok-convex`, public, 0.5.0, peer dependencies `safebyok` and `convex`, back in the `fixed` group.
    * **Component** (`src/component/`): one table `things {userid, banklabel, labelpath, thing}`, index `by_scope` on
      the three, so `childrenIn` fetches a Thing's children as one range (`gte labelpath/`, `lt labelpath0`).
      `things.ts` serves `getThing`, `listThings`, `getWorld`, `watchThings` (queries) and `writeThing`, `birthBank`
      (mutations). Each write mutation checks the ask with the core's `checkedWriteAsk` / `checkedBirthBankAsk`, fetches
      the cited Thing with the bank and main gate, runs the core's classifier only to decide whether to write
      (`wouldWrite`), writes `ask.record`, and returns the fetched state and `written` (or null).
    * **ConvexVaultDB** (`src/convex-vault-db.ts`) extends `AdapterVaultDB`: each `do*` is one `client.query` or
      `client.mutation`. The client classifies what came back to the same outcome, and throws `unexpected_error`
      (`storedOutOfStep`) where its act and the component's `written` disagree. `doWatch` keeps `watchThings` open
      (`ConvexClient.onUpdate`, or `ConvexReactClient.watchQuery`), diffs each result against the last by labelpath and
      serialized JSON, and reports nothing for the first.
    * **Server helpers** (`src/server.ts`): `SafebyokVaultComponent(components.safebyok).api({ getUserId })` builds the
      six public functions, each refusing `identity_revoked` unless the caller is the ask's `userid`.
    * Ported from convex-big as files: refusals, phrases, component-api, `test` entry, `testing` (fakeDeployment),
      eslint config, tsdown/vitest config, `.claude/skills`, LICENSE. CHANGELOG moved from convex-big.
    * Tests: the core's VaultDB battery over a real `ConvexClient` on `fakeDeployment`, plus server, refusals, testing,
      test-entry and test-helper tests ported from convex-big.
    * README rewritten on the indexeddb README's plan; setup in three steps (install component, serve functions, hand
      `ConvexVaultDB` to the core). Root README lists the package.
  * `safebyok/storage` exports `checkedWriteAsk`, `checkedBirthBankAsk` and `birthPutsOf`, for an adapter whose server
    checks an ask itself.
  * `notes/security.md`: an entry on the identity gate, server-side checks and dropped Convex error text.

* **Decisions made**
  * **Classify on both sides.** The component classifies only to decide whether to write, treating a VaultError as "no
    write"; refusals never cross the wire, the client derives them again from the fetched state. Same design as
    convex-big; the out-of-step check catches a component on another safebyok than the client.
  * **No `crossedErr` port.** Only two kinds cross as `ConvexError` data: `identity_revoked` (from the wrapper) and
    `bad_record` with the checker's message (the component's ask check), as convex-big's own `refusals.ts` carried. So
    big's `crossedErr` / `vaultErrorOfCrossed` (in `safebyok-big/src/shapes/shapes-bank-answers.ts`) was not needed and
    not ported. Thread D (GraphQL), which carries every refusal over the wire, should port that file into the new core.
  * **Client errors** go through the core's `DB.storageFailed(oplabel, thrown)`, which names the call and the error's
    name and quotes none of Convex's message (a dev deployment may quote args). This is the existing helper the ruling
    allows; no other catch re-labels an error. A received record failing its check refuses `storage_issue` through the
    classifier, as the ruling says.
  * **The watch re-sends the whole bank** per change, as big's did: simple, one reactive query; the README states the
    16 MiB query-read ceiling on a bank's size.
  * **Function module name** `convex/safebyokVault.ts`, `api.safebyokVault` (big used `safebyokBank`).

* **Deviations**
  * None from the thread text. The functions are six, not big's thirteen, so `SafebyokVaultComponent` replaces
    `SafebyokBankComponent`; the changeset says so.

* **Discoveries**
  * `safebyok` is private at 0.0.0, so no changeset names it for the `storage.ts` exports.
  * A write from another device landing between `watch()` and the query's first result is folded into the first result,
    which is not reported. `doWatch`'s contract says nothing about the start, and postgres's LISTEN has the like window;
    no code and no wontfix row (not a lifecycle crossing).
  * `e2e/` and the demo still build on safebyok-convex-big; left alone.

* **For the Coach**
  * Setup path in the README (three steps) is the one you asked be right and short: please read it against your app.
  * Upgrading from convex-big means emptying the old component tables before deploy (Convex refuses to drop a table
    with rows); stated in the README and changeset.
