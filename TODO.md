# TODO

The backlog of the new core, `packages/safebyok`. `TODO-big.md` is the backlog of `safebyok-big`.

* **`cleartext` names two things.** VOCABULARY.md's cleartext is the passphrase or passkey answer a gating accepts.
  `BoxCleartexts`, in `models/sealers.ts`, uses it for what a seal ciphers: a box's whisper. One of them needs
  another name. Every other name tried so far has been worse.
* **A bank's lives can share a lifeseq.** The bank's stamp binds its lifeseq, and every ctx binds the stamp. Where
  storage loses the bank row and a bank is born again at the same lifeseq, a wrap of the earlier life unwraps in the new
  one: only to the earlier bankKey, but it unwraps. Big's random `bank_tok` ruled that out. Whatever closes it should not
  be one more check in the box.
* **A box birth does not check that its parent is live.** Neither store looks at the root box when a box under it is
  born, so a box can be born under a deleted root box. Whatever checks it belongs in the store's write, beside the other
  preconditions, not in a check before it.

* **A sealed part is not branded.** `seal`'s exit check (`recordOf`'s strict parse) checks a record's shape, not where it
  came from, so nothing in the types tells a record the lease sealed from one assembled by hand. A brand would have to be
  set by the store's parse on read as well. Held while the seal path is in flux (the Coach, 2026-11-17).

* If a request has any kind of `world` error it must not return anything in `val` or `dbhas`

