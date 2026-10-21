# safebyok-convex

safebyok's storage on [Convex](https://convex.dev): a Convex **component** that holds each vault's
props and boxes, ciphertext and unencrypted fields only, in tables of its own, and
**`convexVaultDB`**, the client side a vault stores through. Your Convex backend never sees a
whisper, a passphrase, or any key that opens one.

## Install

```sh
pnpm add safebyok safebyok-convex convex
```

`safebyok` and `convex` are peer dependencies: your app installs them itself, so the adapter and
your app share one copy of each, and a `VaultError` from one is a `VaultError` to the other.

Platform: Node 22 and up, and evergreen browsers for the client; the floor is stated in the core's
*Where it runs*.

## What your app adds to its `convex/` directory

Install the component, in `convex/convex.config.ts`:

```ts
import { defineApp } from 'convex/server'
import safebyok from 'safebyok-convex/convex.config'

const app = defineApp()
app.use(safebyok)
export default app
```

Serve its functions to your clients, from a module of your own, `convex/safebyok.ts`. They call
your `getUserId` first: say who is signed in, the same id your app passes to `Vault.make` as
`userId`.

```ts
import { SafebyokComponent } from 'safebyok-convex/server'
import { components } from './_generated/api'

export const {
  getVaultProps, ensureVaultProps, putVaultProps, getBox, listBoxSummaries,
  putBox, getCapacity, delBox, delVault, watchVault,
} = new SafebyokComponent(components.safebyok).api({
  getUserId: async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null,
})
```

Run your usual Convex codegen, and your clients reach these as `api.safebyok.*`.

`api` checks that `getUserId` is a function as your `convex/safebyok.ts` loads, and throws a
`VaultError` of kind `bad_option` that says what to pass if it is not, rather than leaving the
mistake for the first request.

* **Who may reach a vault.** Each function refuses a caller who is signed out (`getUserId`
  answers null, undefined or empty), or whose id is not the vault's `user_id`, with a
  `ConvexError` whose `data` is `{ kind: 'identity_revoked', message }`: the user the vault was
  opened for is not the one signed in. The kind is the safebyok `VaultError` kind of the same
  name, on which a vault locks itself. The message names no user and quotes no record.
* **Refusing by your own rules.** To refuse a signed-in user a vault -- a suspended account, a
  guest -- have `getUserId` throw a `ConvexError` whose `data` is `{ kind: 'not_permitted',
  message }` (the type is `SafebyokErrorData`, from `safebyok-convex/server`). It reaches the
  client as a `VaultError` of that kind and message, which locks nothing: the vault stays
  unlocked, and its next call is asked again. `identity_revoked` thrown the same way locks the
  vault: throw it only for a user your app knows is gone. Anything else `getUserId` throws -- an
  auth provider that is down -- reaches the client as `storage_unavailable`, a passing fault.
* **Writes that come too late.** An update (`putVaultProps`, `putBox`) or a delete
  (`delBox`, `delVault`) carries what its writer expects to stand -- the vault's `vault_id`,
  and the vault props' `unlock_epoch`, or the box's `revision_tok` -- and checks it in the same
  transaction it writes in. When that no longer stands, it writes nothing and resolves `false`
  (`putBox` and `delBox`, `null`), which the client turns into a `stale_write`. Not an error: no `ConvexError`, nothing in your logs.
  A `delBox` also carries the `revision_tok` its writer read, but only to say what it removed:
  within the expected vault it removes whatever stands.
  An update of the vault props lands, too, only when the new vault props keep the vault's
  `vault_id` and move their `unlock_epoch` forward, as every safebyok client's does.
* **A vault the component has no room for.** `putBox` refuses, writing nothing, a box
  that would take its vault past the component's own limits (see *How big a vault can be*): it
  resolves `{ landed: false, refusalkind: 'vault_full', capacity }`, how full the vault is as its
  tally stood, which the client turns into a `VaultError` of that kind carrying it as
  `meta.capacity`. The limits are the component's, not your app's or the client's to set.
* **One version, both ends.** A client meeting a `putBox` answer in a shape it does not know --
  a component deployed from another version of this package -- refuses with kind
  `corrupt_record`, saying the deployed component is out of date. Deploy the component from the
  same version as your app.

## What your app does on the client

`convexVaultDB({ client, api: api.safebyok })`, from `safebyok-convex`, is a vault's storage: a `VaultDB`
whose every call is one call to the functions above, through the Convex client your app already
has. Hand it to `Vault.make`:

```ts
import { ConvexClient } from 'convex/browser'
import { Vault } from 'safebyok'
import { browserOpts } from 'safebyok/browser'
import { convexVaultDB } from 'safebyok-convex'
import { api } from '../convex/_generated/api'

const convex = new ConvexClient(import.meta.env.VITE_CONVEX_URL)
convex.setAuth(fetchToken) // your auth provider's token, as for any Convex call

const vault = Vault.make({
  applabel: 'acme', userId, vaultlabel: 'main',
  vaultDB:  convexVaultDB({ client: convex, api: api.safebyok }),
  ...browserOpts(), // the key deriver and device store a browser wants
})
```

In a React app, pass the `ConvexReactClient` you give `ConvexProvider`, so the vault shares its
socket and its signed-in user. `safebyok-convex` itself imports nothing of React's. A `logger`,
when given (`convexVaultDB({ client, api, logger })`), hears what the VaultDB has to say -- a
`ConvexClient` watch that failed, once for each failing streak -- and left out, it is the one
`Vault.make` is given, else the console.

* **Sign in first.** `userId` is the id your `getUserId` answers for the signed-in user. Open
  the vault once the Convex client is authenticated (in React, once `useConvexAuth()` says so):
  a call made before then is refused with kind `identity_revoked`, which also makes this device
  revoke its lease, so the user types their passphrase again. A hello refused
  that way leaves the vault `opening`, the refusal its caller's (and, as bad news, the vault's
  `trouble`): call `hello()` again once signed in.
* **Signing out locks the vault.** Once the Convex client signs out (or signs in as someone
  else), the vault's live `watchVault` query is refused, the vault looks again, meets
  `identity_revoked`, and locks itself, as `lock()` does: an idle vault in another tab included.
  Close the vault when your user signs out all the same: in React, pass `userId={null}` to the provider.
* **Other devices' writes arrive live.** The vault watches `watchVault` and refreshes whenever
  it changes, so its snapshot (and a React render) follows writes from anywhere.
* **Refusals** are `VaultError`s, each the `err` of the `Outcome` a call resolves, of the kinds in
  the *Errors* tables of the [`safebyok` README](../safebyok/README.md), which say what each means
  and what a host does. The Convex functions throw two, `identity_revoked` and `not_permitted` (your
  `getUserId`'s), each arriving with the `ConvexError` it came as for its `cause`; a write that
  came too late is a `stale_write`, and one with no room a `vault_full`, carrying how full the
  vault is; and `storage_unavailable` is anything
  else Convex reported. That one carries nothing of Convex's own error, which on a dev deployment
  may quote the call's arguments (names, sidecars, ciphertext): your deployment's logs have it,
  or, for trouble before the call left, the browser console, where the Convex client reports its
  connection.
* **Offline, a call waits** for the connection, as every Convex call does, rather than failing.
  Convex resends a mutation when it reconnects, so a write may land after any timeout you set:
  show progress, but don't report it failed. The adapter sets no timeout of its own: a write that
  lands late lands only over what its writer read, in the vault it was sealed for, so the only
  cost of waiting is the wait.
* A record holds at most 1 MiB, Convex's document limit; `Vault.make` keeps `maxWhisperBytes`
  under half of it. A vault holds at most 8 MiB in all (`maxVaultBytes`; see *How big a vault
  can be*).

## What is stored

Three tables, inside the component, beside nothing of your app's:

| Table                    | One row per | Columns                                                  | Index                                                     |
| ------------------------ | ----------- | -------------------------------------------------------- | --------------------------------------------------------- |
| `safebyok_vaults`        | vault       | the `VaultProps` record as-is                            | `by_scope`: `user_id`, `applabel`, `vaultlabel`           |
| `safebyok_boxes`         | box         | the `BoxRecord` as-is, and its vault's scope columns   | `by_box`: `user_id`, `applabel`, `vaultlabel`, `boxlabel` |
| `safebyok_vault_tallies` | vault       | `vault_row_id` (its vault row), `box_count`, `box_bytes` | `by_vault_row`: `vault_row_id`                            |

* **Encrypted**, as `{ cipher_iv_b64, ciphertext_b64 }`: each whisper (`whisper_ciphered`), each
  box's boxKey (`box_key_wrapped`), and the vaultKey once for each of the vault's
  ways in (the `vault_key_wayin_wrapped` of the vault props' `passphrase`, and of its `passkey`
  when it has one).
* **In the open**: the scope (`applabel`, `user_id`, `vaultlabel`), each `boxlabel` and `sidecar`,
  the `vault_id`, `unlock_epoch`, `revision_tok`s, each way in's `wayinkind`, `device_id` and
  `registered_at`, the passphrase's passphraseSalt (`salt_b64`) and key deriver's label, whether
  the vault has a passkey, and its `credential_id` and `prf_salt_b64`, when each vault and box was first stored and each box last written (`registered_at`,
  `written_at`, epoch milliseconds), and the length of every ciphertext.
* **Never**: a whisper, a passphrase, any key in usable form, or the device-local lease. No history: an update replaces its row, and a write made over a revision since replaced
  is refused, never merged: the vault's policy ([`VAULTDB.md`](../safebyok/VAULTDB.md), *Who does what*). An app that wants history
  keeps it in its own backups; Convex's backups and exports keep what they keep.
* `user_id` leads the vault and box indexes, so one user's rows are one range of each.
* **Any text is a name** to the component: it never sees the vault's `validators`, which check
  each name where it enters the vault, on the client. The floor beneath them, which the
  client's VaultDB holds every name to whatever the validators say, refuses what Convex could
  not store: a lone surrogate (half of a character, which Convex's documentation forbids in a
  string), a control character, text not in NFC, a name over 1 KiB.
* **A vault's tally** counts its boxes and their bytes as Convex weighs them, kept in step
  by every box write and delete in the same transaction. A vault written before tallies
  were kept has none, and reads as ever: its next box write counts it, reading the vault
  once (and no further than its limits). A delete never counts a vault.

**Upgrading from an older version.** The vault props are format `safebyok-vault-v6` and each box
`safebyok-box-v8`, neither holding a `vault_key_epoch` any more, and a box holds its sidecar as a
JSON value; no older vault is read: each one reads as damaged, its boxes with it. Convex refuses to deploy a schema its documents do not
match, so clear the component's three tables before you deploy (on the dashboard's Data page,
pick the `safebyok` component); each user then makes their vault anew.

**How big a vault can be.** Listing a vault, watching it and deleting it each read the whole vault
in one Convex transaction -- watching reads each box whole, ciphertext and all, to sign it by
its revision, since a Convex query cannot read some of a document's fields -- which may read 16 MiB and 32,000 documents, and write 16,000 documents;
deleting reads it twice, so `convexVaultDB` declares a `maxVaultBytes` of 8 MiB. A vault holds 100 boxes by default, raised with
`maxBoxes` as far as `maxVaultBytes` allows: `Vault.make` refuses, with kind `bad_option`, a
`maxBoxes` whose boxes at `maxWhisperBytes` each might not fit, and its message says how
many would. At the default `maxWhisperBytes` (40444) that is at most 102; at a `maxWhisperBytes`
of 2048, ample for API keys, it is 1638. A store past the limit is refused with kind
`vault_full`, until a box is deleted. Each record must also fit Convex's 1 MiB document limit,
which the core's `maxWhisperBytes` keeps well inside. `convexVaultDB` declares the component's own
8,000 as its `maxBoxes`, so `Vault.make` also refuses a `maxBoxes` above that.

The component holds every vault to limits of its own, whatever its client asks, so that even a
modified client cannot grow a vault past what deleting can reach: **8,000 boxes**, and
**7 MiB less 1 KiB** of them as Convex weighs a document (half the read budget, less a whole
document for the vault props and room for the tally). A client within its own `maxBoxes` stays
well inside both, at the defaults far inside; at extreme settings (a small `maxWhisperBytes`,
thousands of boxes, every sidecar full) a client can meet the component's `vault_full`
just short of its own `maxBoxes`. That is the design working: the component's limit is the
authority beneath the client's estimate. A write that would take a vault past either, and leave it larger than it was
-- a new box, or a heavier replacement -- is refused with kind `vault_full`; a replacement no
heavier, and every delete, always lands, so a vault over its limits (written before they were
kept) can always shrink, and be deleted a box at a time even when it is too large to delete
whole.

`getCapacity` answers from the same tally, `{ boxes: { used, max }, bytes: { used, max } }`: the
vault's boxes, and their bytes as Convex weighs a document (with its scope fields and Convex's
own), against these two limits. That is the component's measure, not the vault's own
`capacity`, which weighs each box at the room it reserves against `maxVaultBytes`.

These limits are the component's constants; a host has no knob for them. Deploying client-side
limits (`maxBoxes`, `maxWhisperBytes`, the adapter's `maxVaultBytes`) that disagree with the
component's is undefined behaviour: not a bug we will fix, and not one whose outcome we promise.

## The functions

Each is one `VaultDB` verb (the core's storage interface). Arguments and results are plain JSON:
the core's own records, scopes and expectations.

| Function                  | Kind     | Arguments                                                                   | Resolves                                                                                   |
| ------------------------- | -------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `getVaultProps`           | query    | `{ scope }`                                                                 | the `VaultProps`, or null                                                                  |
| `ensureVaultProps` | mutation | `{ vaultProps }`                                                            | the vault props standing afterwards: these, or another device's already standing           |
| `putVaultProps`        | mutation | `{ vaultProps, expected: { vault_id, unlock_epoch } }`                      | `true` if written, `false` if not                                                          |
| `getBox`                  | query    | `{ scope, boxlabel }`                                                       | the `BoxRecord`, or null                                                               |
| `listBoxSummaries`        | query    | `{ scope }`                                                                 | each box without its ciphered fields, `format` kept, in boxlabel order                 |
| `putBox`               | mutation | `{ scope, box, expected: { vault_id, revision_tok } }` | `{ landed: true, box_stored }` if written; else `{ landed: false, refusalkind }`, with the box standing (`stale_write`) or the vault's capacity (`vault_full`) |
| `getCapacity`             | query    | `{ scope }`                                                                 | `{ boxes: { used, max }, bytes: { used, max } }`, from the vault's tally                   |
| `delBox`               | mutation | `{ scope, boxlabel, expected: { vault_id, revision_tok } }`                 | `{ outcome }` if the vault still stands -- `deleted`, `deleted_other` or `absent` -- null if not |
| `delVault`             | mutation | `{ scope, expected: { vault_id } }`                                         | `true` if deleted, `false` if not                                                          |
| `watchVault`              | query    | `{ scope }`                                                                 | `{ vault_id, unlock_epoch, boxes: [[boxlabel, revision_tok]] }`, changing with every write |

`scope` is `{ applabel, user_id, vaultlabel }`. A `revision_tok` of null expects no box there; in a
`delBox`, it names a box listed with none, so a box it removes that holds a revision is
`deleted_other`.

## Testing your own functions

`safebyok-convex/test` installs the component into a [`convex-test`](https://docs.convex.dev/testing/convex-test)
instance. It assumes vitest, or another runner on Vite: it loads the component's modules with
`import.meta.glob`.

```ts
import { register } from 'safebyok-convex/test'

const CVX = convexTest(schema, modules)
register(CVX)
```

## Testing your own client code

`safebyok-convex/testing` is a Convex deployment in memory that the real Convex clients talk to,
for the tests of anything that holds one: this adapter, a binding, your app. `fakeDeployment(host)`
takes a host app built with `convex-test`'s `defineTestApp(...).defineModules(...)`, as below,
and answers a client's queries and mutations over a fake WebSocket, running your functions and the
component under them. `deployment.client(subject)` is a signed-in `ConvexClient`;
`deployment.connectWith(subject, make)` connects any other, such as a `ConvexReactClient`. It
imports `convex` and nothing else. Its doc block says what it cannot prove: the network and a real
server, among them.

```ts
import { defineSchema } from 'convex/server'
import { defineTestApp } from 'convex-test'
import { convexVaultDB } from 'safebyok-convex'
import { SafebyokComponent } from 'safebyok-convex/server'
import { register } from 'safebyok-convex/test'
import { fakeDeployment } from 'safebyok-convex/testing'

// Your app as convex/safebyok.ts serves it: the component installed, its functions authenticated.
const app = defineTestApp({ schema: defineSchema({}), components: { safebyok: { register } } })
const host = app.defineModules({ safebyok: new SafebyokComponent(app.components.safebyok).api({
  getUserId: async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null,
}) })

const deployment = fakeDeployment(host)
const vaultDB = convexVaultDB({ client: deployment.client('u1'), api: deployment.api.safebyok })
// ... and after the test:
await deployment.close()
```

## Developing this package

`pnpm justify` here runs its lint, typecheck, tests -- `convex-test` under the edge runtime,
in memory, with no deployment -- and the build with its publint and arethetypeswrong checks. The typecheck and lint read `safebyok` from its source, through
the workspace's `@safebyok/source` export condition, so they need no build. The tests resolve it
through its built `dist/`, as a consumer's would, and make real vaults with the core's own code;
they build the core first by themselves (`pnpm build:deps`), so a fresh clone needs no prebuild
step.

The client's tests run the real `ConvexClient` against `src/testing.ts`, the fake deployment
`safebyok-convex/testing` ships (below). `ConvexReactClient`'s run in the workspace's
[`e2e/`](https://github.com/mrflip/safebyok/tree/main/e2e), over the same fake, so this package
lists no framework among its dev dependencies.

The build follows Convex's component template: ESM only, unbundled, so each of the component's
modules keeps its own file under `dist/component/`, beside its `convex.config.js` and
`_generated/`, for a host's Convex CLI to bundle at deploy. `safebyok-convex/test` alone ships as
source, `src/test.ts`, since its `import.meta.glob` must find the component's `.ts` modules; a
test runner that resolves as a bundler does (vitest) loads it.

`src/component/_generated/` holds Convex's codegen output for the component, written by the
templates of the installed `convex` and never edited by hand. Codegen for a component needs a
Convex deployment, so until one has run it holds only the files Convex writes without one
(`server.ts`, `dataModel.ts`, and the untyped stub `api.ts`); the component's typed API,
`ComponentApi`, is derived from the functions themselves in `src/component-api.ts`.
