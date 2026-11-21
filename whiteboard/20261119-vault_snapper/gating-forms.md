# Gating by forms: the verbs, and the awaited unlock

Settled with the Coach in chat, 2026-11-20. It replaces the gating machinery of #784: the `Gating` class, the
Device's one open gating, `gatingseq`, `askUser`, the `launch…Prompt` verbs, the `tryAttempt…` re-entry points,
joining, and waiting out a gating of another kind. What they bought was one dialog however many callers asked, and
only an unlock needs that.

## The verbs, by shape

| Shape | Verbs | What follows |
|---|---|---|
| Form submit: prove, build the ask, send, adjust state | `replacePassphrase`, `addPasskey`, `revokePasskey` | The gate's next revision, and the bank unlocked by that proof |
| Form submit, nothing to prove against | birth | The bank goes from unborn to unlocked |
| Form submit: prove, attach a lease | `unlock` (passphrase or passkey) | The bank unlocked |
| Not from a click: want, then wait | `ensureUnlocked` (so `withWhisper`) | Resolves on the next unlock, from any verb above |
| No proof, synchronous | `lock()`, sweep | State only |

Each form verb is a pair, `tryFoo` and `foo`. A form branches on the refusal's `family`: `condition` at the field or
as a banner, the form left open; `bad_news` and `misuse` as a generic banner. The giver offers `mutationOptions` for
each, over the throwing form, and a thin hook.

## Rules

* **One proof by any way in** counts as an unlock. A gate change takes one proof, by the passphrase or the passkey,
  and unlocks under a lease citing the gate it wrote. So a passkey can prove a passphrase's replacement: the
  forgotten-passphrase reset. (A 1.1 may make it the customer's choice.)
* **All or nothing.** A bad outcome changes nothing, and never unlocks: after `stale_write` the proof was made against
  a gate already superseded, perhaps with a way in just revoked.
* **No naked provings.** A proving is built and spent inside its attempt in `gating.ts`; the bank's private verbs
  (`putGate`, `unlockByProving`) reach it through the attempt's friend (G9).
* **Cheap checks first:** the cleartexts' shape, `same_passphrase`, `weak_passphrase`, and only then the key
  derivations (prove the current way in, then derive from the next passphrase).
* **Strength is judged twice, by one checker.** The form runs it live, to show a meter and hold the submit; the verb
  runs it again and refuses `weak_passphrase`. The Device offers the one public check.
* **Cleartexts are spent** (a passkey answer's PRF bytes zeroed) whatever the outcome.
* **Try or throw** (the Coach): (1) holding a rich payload, such as an answer, that a throw would lose? Write
  `tryFoo`. (2) Otherwise write whichever is easier; a body that fits in one try/catch is the throwing form, and
  `tryFoo` is `Outcome.outcomeOf(() => this.foo(…))`. Never wrap in `outcomeOf` just to get a try/catch.

## The awaited unlock

Code that needs an unlock cannot ask anyone itself: it says an unlock is wanted, and waits.

    bank.ensureUnlocked()
      unlocked?                      -> this, at once
      #unlockWanted = true, align    snapshot.unlockWanted -> the host renders its one unlock form
      await the bank's one shared wait
        any unlock lands             -> resolves every waiter; unlockWanted false
        bank.dismissUnlock()         -> rejects every waiter `dismissed`; unlockWanted false
        the bank ends (sweep, …)     -> rejects every waiter with its end cause, synchronously

A passkey unlock must start from a click (WebAuthn), and a passphrase is typed, so the asking always ends in the
form verb `unlock`; its attempts and errors are the form's own mutation state.

## Later, not now

* The bank observes itself: after `stale_write`, or on a notice, it takes the stored gate, so the next proof meets the
  current one.
* Sign out other devices on a gate change, through the watcher.
* A lease-age policy in place of re-proving for a gate change.
