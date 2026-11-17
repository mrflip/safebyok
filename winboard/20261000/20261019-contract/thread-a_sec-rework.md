# Thread a_sec: the rework after review (2026-10-19)

For the second reviewer (commits `4f342f43...` the tip) and whoever restacks a_sec onto B1. The
thread file, [thread-a_sec.md](thread-a_sec.md), links here.

* **F2 by construction** (`#takeStorage`): a read that finds the vault props outrun (new
  `unlock_epoch` or `vault_id`, or gone) records them and the mark, empties the listing for a
  different vault, drops the key and stands down any take-up, all before its next await; only
  then does it erase the lease and list the boxes. The old code decided "outlived" first and
  assigned the props after `delLease` and `listBoxes`, so a take-up or an unlock's grant finishing
  inside those waits saw the old props and was never relocked (the reviewer's probe, now a test).
  The other two places props were read before an await and assigned after it no longer write
  older props over a revocation a read took up meanwhile: `#settleUnlock`'s make (assigns only
  while no props are held) and `#reviseWayins` (only while `standing` is not outrun); the grant
  after each then finds its props outrun. Tests for all four windows, each failing at `4f342f43`.
* **Host functions that hear the passphrase** (`hostThrewRefusal`, `src/outcome.ts`): what a key
  deriver or strength test throws becomes `unexpected_error`, the throw its cause, a VaultError of
  misuse included; `forBoundary` then strips the cause. Wrapped at the two call sites
  (`wayin.ts`'s `passphraseKeyOf`, `checkStrongEnough`).

* **Rework test counts**, `4f342f43` to tip: core 2384 to 2392 (35 skipped):
  `vault-hello.test.ts` 94 to 98, `vault-make.test.ts` 94 to 96, `passphrase-strength.test.ts`
  16 to 18 (one rewritten: "throws whatever the test throws" now refuses `unexpected_error`). React
  273 to 274: `passphrase-modal.test.tsx` 101 to 102.
