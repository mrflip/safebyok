# gating_instance: a gating is an instance

Agreed with the Coach, 2026-11-21. It is built on the language PR (`20261121-plain_words`), which renames the form
verbs' fields to `passphraseCleartext`, `passkeyCleartext`, `nextPassphraseCleartext` and `nextPasskeyCleartext`.

## Why

Cleartexts should be seen only in the gating, lease and proving files. Today the giver's `cleartextsOf`
(react-giver.ts) reads them out of the cloak in order to call a form verb.

## The shape

```ts
replacePassphrase.mutate(bank.replacePassphraseGating({ passphraseCleartext, nextPassphraseCleartext }))
// React Query: mutationFn: (gating) => gating.attempt(),  onSettled: (_d, _e, gating) => gating.vacate()
```

* **`Gating`**, the base class: it has the bank friend and the cleartexts in private fields, and redacts as the cloak
  does (`'[gating]'` in JSON, `String()` and inspect; a spread copies nothing). Its cleartexts are checked at
  `attempt`, never at construction, as today.
  * `attempt()`: runs the verb's body and vacates in its `finally`. It is single-use: once vacated, a second attempt
    refuses.
  * `tryAttempt()`: wraps `attempt` in `outcomeOf` (try-or-throw rule 2).
  * `vacate()`: zeroes its passkey answers' PRF bytes and drops its passphrases.
* **One subclass per form verb**: birth, unlock, replace passphrase, add passkey, revoke passkey. Each has its own
  checker and the body that lives in models/gating.ts today, moved but not changed.
* **Makers**: `Bank.birthGating(device, cleartexts)` (static), and `bank.unlockGating(…)`, `bank.replacePassphraseGating(…)`,
  `bank.addPasskeyGating(…)` and `bank.revokePasskeyGating(…)`.
* **The plain verbs stay as sugar**: `bank.replacePassphrase(c)` is `bank.replacePassphraseGating(c).attempt()`, and
  likewise for the `try` twins.
* **The awaited `unlock` gating** is unchanged: the unlock gating's success settles the shared wait.
* **What goes**: cloak.ts (`cloak`, `Cloak`, `CloakCleartexts`) and the giver's `cleartextsOf` and `vacateCloak`.
  The giver's mutations take a `Gating`, and each mutation hook hands back the matching maker so a form stays one line.
* **The cloak's guarantees carry over**: adopting a passkey answer copies its bytes and zeroes the host's (G2), and a
  passkey answer's getter hands out a copy.

## Settled

* **One file**: `models/gating.ts` holds the base class and every subclass. "one file is much better" (the Coach,
  2026-11-21). It becomes a directory only if it outgrows about 400 lines.
* **`onSettled` calls a plain `gating.vacate()`, with no try/catch**: "do the vacate() as you recommended" (the
  Coach, 2026-11-21). `vacate` zeroes only our own byte arrays and drops our own strings, so nothing in it can throw.
  `attempt`'s `finally` has already vacated by then, so this call is only a second line of defence.
