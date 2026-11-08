# Hanging: bank-provider.tsx interactive session

Questions and issues either of us noticed, banked so we don't side quest. One bullet each; who raised it in brackets.

## Open

* Are we telling the bank to vacate on the right cycle? [Coach]
* Tests and other changes, held off during this session. [Coach]
  * tests/test-helpers.ts and tests/bank-provider.test.tsx import `BankProviderProps` from `../src/bank-provider`; it now lives in `src/shapes/shapes-provider.ts`.
  * `@typescript-eslint/require-await` on `requestCleartext` at tests/bank-provider.test.tsx:359 and tests/vault-controls.test.tsx:71. These were there before this session.
* passkey.ts has a checker of its own (`PasskeyChecks`), not moved into `src/shapes/`. [agent]
* Finish removing autolock from the provider (not from the core): from any docs or notes that say the provider runs it, then enter it in the todo and security notes, etc. [Coach]
  * The provider's timer was removed 2026-11-08. The core keeps `Bank.autolock()` and `autolockMinutes`. The right timescale is hours or days, which a page timer can't serve.
* Handlers take a winding road [Coach, parked]: they come off the props into a `handlers` bag, then into `panicked` (and kin) by `useEffectEvent`, then are remixed into handlers on the fly in the `Bank.make` call, and for all we know the bank wraps them again (it does: `guardOnPanic`, and its own `DefaultOnPanic` / `DefaultOnBadNews` defaults). React is needed to call `useEffectEvent`, but the bank can provide the default handler itself, if that doesn't affect the lifecycle.
* `helloedVaults` is React-side bookkeeping riding beside the bank in the context value. If the core kept "this Vault object has had its `tryHello`", the context could be just `Bank | null`. [agent]
* `buildBank` now builds the bank even when cleanup ran during `ensureBank` (it's then swept unused). Under StrictMode's double effect, a test key deriver's `TestDeriverNotice` warning logs twice in dev. [agent]
* `BankProviderProps` is written by hand beside `providerProps`. STYLE.md *Validation* wants the type to come from the schema (`z.infer`) or be held to it. Cost: the per-field doc comments a host sees on hover. [agent]
* dev-device-db-inspector.tsx:14 holds a future note ("The bank rows … will sit beside its leases, as a table of their own"): route it to human/ or here, then delete it? [agent, Opus pass]
* bank-provider.tsx: "A swept bank's panic goes to the platform, as a handler's throw does." Unverified against the core's handling of a throw from `onPanic`. [agent, Opus pass]
* passphrase-modal messages: `passphrasesDiffer` ": nothing is attempted" and `passphraseFirst` ": the browser is not asked" describe behaviour, not the message. Keep them for translators, or cut? [agent, Opus pass]

## Settled

* `hasUserGesture` doc block after the comment pass reads "…still in hand, true where the browser does not say": the comma is awkward ("or true where…"?). [agent] Settled by the Opus pass (applied 2026-11-08): reworded, and each item ruled on.
* The comment pass's "couldn't tell" list (Sonnet, commit 7ea88e982). [agent]
  * The `onDone` props in six dialog files ("'unlocked' once …, 'declined' otherwise"): `#option-values-get-a-list`?
  * Possibly `#one-verb-one-fact`: `ask` in `useGatingDialog`, `ModalFormProps.gripeId`, `passkeyGripe`, `useBoxIsShowing`.
  * Possibly purpose tails: `jsonOf` and `timeOf` ("for the panel to show whole"), and `useRoundFor`.
  * Possibly `#purpose-not-machinery`: `holdsFocus` and `callThenRelist`.
