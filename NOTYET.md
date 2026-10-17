# NOT YET

Reasonable tasks that we do not plan to do in the near term. Do not anticipate them in your
implementation.

* **Lock out a device: every way in it added.** From another device, the user locks out a lost or
  compromised one: its passkeys removed, its remembered unlock void, and nothing it holds reading
  what is written next. Vault-key rotation does the cryptography (designed in
  `whiteboard/20261016-rotation/rotation-design.md`, built as sprint matters' threads 14 and
  18-20); what waits is the UX, a device list, and, if the Coach wants rotation not to sign every
  other device out, a key pair per way in (that design's open question 1). The data it needs goes
  in with rotation: a random `device_id` per vault per device, recorded on every envelope it adds.
  * **What we record now.** `device_id` is random, minted per vault per device, never derived from
    the device, so the backend can't link one device's vaults to each other. That reading follows
    Apple's ban on fingerprinting and Google's guidance to use a privately stored random ID; it is
    the agents' reading, not legal advice, and the Coach is "pretty sure the device id is ok".
  * **What is permitted to retain about devices -- open.** The Coach: are we allowed to store
    "Bob's Awesome iPhone 11" for the user to know which device `a213423bcf` is? A device list
    needs some label a person recognizes. Decide before building it: a label the user types (what
    they chose to say, stored in the clear on the server, or encrypted under the vaultKey so the
    server never sees it), a label taken from the platform (model name, user agent: the kind of
    data the fingerprinting rules care about), or none (the device list shows when each was added
    and last used). Encrypting a user-typed label inside the vault is the likely answer; check it
    against the host app's privacy review, which owns what its users are told.

* **Let the user add a hint on their passphrase.** The Coach (2026-10-16, thread 7,
  [#129](https://github.com/mrflip/safebyok/pull/129)): "Option to let the user add a hint on
  their passphrase." A hint is stored in the clear, so it is a decision about what the backend may
  see; the whisper field's host `placeholder` (none by default) is not it.
* **Break out dependencies into a `-utils` or `-bestpractices` package.** The Coach (2026-10-16,
  thread 10, [#136](https://github.com/mrflip/safebyok/pull/136)): "Break out dependencies,
  including -fastkey, into a -utils or -bestpractices package." The strength test's
  `@zxcvbn-ts/core` comes from `safebyok/browser`, and `safebyok-fastkey` is a separate package
  already; a single package for the best-practice defaults would hold them together.
* **The React binding under real assistive technology and real hosts.** The Coach (2026-10-16,
  thread 7, [#129](https://github.com/mrflip/safebyok/pull/129)): not done, a real screen reader,
  a real shadow-DOM host and a real browser (the Gripefest doc's G356; a Playwright job of its own,
  as `e2e/README.md` says). The binding's tests run under jsdom, which announces nothing.
* **A conflict handler.** The Coach (2026-10-16, thread 4,
  [#132](https://github.com/mrflip/safebyok/pull/132)), G499: "Leave conflict handler as NOTYET, so
  that when the idea keeps coming up there's some place to point to." There is none today: an erase
  wins, the last writer wins, and the vault never clears damage on its own, so `store()` over a
  box is the handler (`packages/safebyok/VAULTDB.md`). A host may one day want the say on a lockbox
  too damaged to name its epoch, meeting a healthy store.
* **The Postgres adapter's own tests on a real server.** The Coach (2026-10-16, thread 11,
  [#131](https://github.com/mrflip/safebyok/pull/131)): the adapter's own tests
  (`packages/safebyok-postgres/tests/`) stay on PGlite, in-process, because they are written against
  PGlite's interface; only `e2e/tests/postgres/` runs on the container. A PGlite-shaped wrapper over
  a `pg` pool would run them there too, so that "every Postgres test, one line" held.

## RAGEBAIT

Things we are leaving as they are until they bite again. Each is filed so that the next person to
be bitten finds the ruling.

* **Storing without a public bag keeps the old one.** The Coach (2026-10-16, thread 2,
  [#133](https://github.com/mrflip/safebyok/pull/133)): "I hate optional fields but we can wait for
  it to bug me again, go ahead as you propose." Storing a new whisper under an existing label with
  no public bag keeps the lockbox's bag; passing `{}` empties it. The alternative, an omitted bag
  meaning empty, is one line.
* **The demo's App tests depend on order.** The Coach (2026-10-16, thread 14,
  [#134](https://github.com/mrflip/safebyok/pull/134)): "leave, file under RAGEBAIT." Under
  `--sequence.shuffle`, two App tests fail when they run after the click-through test, whose fake
  user stays signed in. In order they pass, so CI is green. Fix by resetting the fake sign-in in
  `afterEach`, or by giving each test a fresh fake IndexedDB.
