# Thread 3: bulletproof (2026-11-22)

Branch `20261122-bulletproof`, PR #820, stacked on #818 (`20261122-react_fruit`). Proved: `pnpm justify` green; safebyok 1399 tests (32 new), safebyok-react-lean 266, every other package and e2e green.

* **Built**
  * `packages/safebyok/src/helpers/bulletproof.ts`: `bulletproofHandlerOf(handler, opts)` and `bulletproofAsyncHandlerOf(handler, opts)`, with the types `BulletproofOpts`, `BulletproofFailOpts`, `BulletproofTellOpts` (`Z.infer` of a discriminated union, strict). Exported from the front door, `safebyok` (`src/index.ts`), beside `guardStrengthChecker`. Tests: `tests/helpers/bulletproof.test.ts`, 32 cases.
  * Adopted at: `ThingMinder.listen` (`'tell'`, `Throwers.unexpectedError`, the bank's `tellBadNews`); `guardKeyDeriver`'s and `guardStrengthChecker`'s `load` (async `'fail'`, a refusal as it is, anything else as the cause of the load refusal); `putBoxAction`'s `whisperOf` and `sidecarOf`, and a draft's `put(opts).sidecarOf` (`'fail'`, `sanitizeForeignError`); the bridge's `deliver` (`'tell'`, `sanitizeForeignError`, the device's `tellBadNews`).
  * `HostCallbackOpts` in `safebyok-react-lean/src/giver/shapes-giver.ts`: the giver's one set of options for a host's callback. Not on the package's index (`index.ts` names `shapes-giver`'s exports one by one), so a host cannot reach it.
* **Decisions made**
  * **Two functions, not one.** A `try` catches no rejection. One function that sniffed each result for a thenable would make every sync call pay a check and a branch, and give a union return type; one that always awaited would make a sync caller await. The sync wrapper is `try { return handler(...args) } catch (err) { ... }` and nothing else. The async one is an `async` arrow around `await handler(...args)`, and catches a throw before the promise too.
  * **A told call returns undefined** (resolves undefined, async).
  * **What the transformer or `onBadNews` throws reaches the caller as thrown.** Both are ours, never a host's: a bug in them is not caught, and is not news. Tested in both modes.
  * **Validation once, at the wrapper's making**: one validator of `{ handler, opts }`; `'fail'` with an `onBadNews` is refused (strict), so nobody believes they set up telling when they did not.
  * **The wrapper does not forward `this`.** Every adopted handler is called as a plain function. A method (`hostDeriver.load`) is wrapped as a lambda that calls it on its owner.
  * **No `notes/security.md` entry.** The facility makes no decision about what a host's throw becomes: each transformer does, and each one adopted is the one already used at that site.
* **Deviations**
  * **Changeset empty, not `minor`.** The handoff says `safebyok` is published; it is private at 0.0.0, and every new-core thread writes an empty changeset with a message (`.changeset/20261121-gate_holds.md`). A `minor` would version the private core off 0.0.0.
  * **A draft's `put`** used to reject with what `sidecarOf` threw, as thrown (through `withWhisper`, "rethrown as thrown"). It now rejects with an `Error`, a non-Error wrapped. Directed; its doc line says so; a new test failed before the change.
  * **One `putBoxAction` test dropped**: "makes a thrown string the message of an Error" repeated `sanitizeForeignError`'s own test; the two kept are the handoff's (a host's Error as the same object, a non-Error wrapped with it as the cause).
  * `putBoxAction`'s catch is `err as Error`, with a comment saying why it holds.
* **Held, and why** (adopting is open to the Coach; none was needed by this thread)
  * The device's subscriber loop (`#align`) and `Thing.tellSubscribers` (bank, gate): no observable change, but the wrap belongs at `subscribe`, which would turn each `Set` of listeners into a `Map` from listener to wrapper (so a second subscribe still dedups and unsubscribe still finds it), and `Thing` would need its `onThrow` at subscribe time rather than per tell.
  * `deriveKeyBytes` (`models/proving.ts`) and the strength checker's `check`: equal in behaviour, but today's `catch {` never binds what the deriver threw (G1, G8); through the facility, the thrown value would reach a transformer that drops it. The guarantee would rest on a function body rather than on syntax.
  * `tellBadNewsTo`: "Anything the handler throws or rejects with is reported to the platform", as thrown. A transformer must return an `Error`, so a non-Error would be reported wrapped.
  * `withWhisper`, `withLockableWhisper` (`fn`, `ifLocked`): "what `fn` throws is rethrown as thrown".
  * `useStageChange`'s `onChange` and the parts' `onError`: nothing wraps them today; a throw reaches React. Wrapping would change that.
  * Not a host handler, left alone: the vaultDB adapter's `do*` catches (they answer a refusal, neither mode), the watch's `onNotice` and `receive` (our callbacks), `Vault.sweep` (lifecycle, out of scope), `askAuthenticator` and `heardCeremony` (browser and kit), `useStrengthVerdict`'s `judge`.
* **Discoveries**
  * `safebyok-big` must be built before a single vitest file of the new core runs: `pnpm --filter safebyok test <file>` builds it; bare `npx vitest` does not.
* **For the Coach**
  * The names are yours and kept. `onBadNews` jars a little: the device's `onBadNews` option is a host's `BadNewsHandler` handed `{ news, device }`, and the facility's is `(err: Error) => void`. `bulletproofAsyncHandlerOf` is my name for the second function.
