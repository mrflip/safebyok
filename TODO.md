# TODO

The backlog of the new core, `packages/safebyok`. `TODO-big.md` is the backlog of `safebyok-big`.

* **`cleartext` names two things.** VOCABULARY.md's cleartext is the passphrase or passkey answer a gating takes.
  `BoxCleartexts`, in `models/sealers.ts`, uses it for what a seal ciphers: a box's whisper. One of them needs
  another name. Every other name tried so far has been worse.
* **A bank's lives can share a lifeseq.** The bank's stamp binds its lifeseq, and every ctx binds the stamp. Where
  storage loses the bank row and a bank is born again at the same lifeseq, a wrap of the earlier life opens in the new
  one: only to the earlier bankKey, but it opens. Big's random `bank_tok` ruled that out. Whatever closes it should not
  be one more check in the box.

* If a request has any kind of `world` error it must not send anything in `val` or `dbhas`

* Seal must reject anything with revision < 0 (the void sentinel)