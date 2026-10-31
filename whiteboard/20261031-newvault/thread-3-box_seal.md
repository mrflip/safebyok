# Thread 3: box_seal (2026-10-31)

Branch `20261031-box_seal`, PR #413, stacked on #412 (`20261031-vault_unlock`). Justify: green (safebyok 4561 passed, 37 skipped; every package green). `pnpm size:budget`: the same eight "raise" rows as the base; no `--write`.

* **Built**:
  - **Directive 1** (`e446fb49`, on its own): `vault.lock()` queues, as one chore on `#leaseChores`, the held lease's `letGo()` (where one is held) and the vault's own `leaseDBFriend().tryDelLease()`, whether or not it holds a lease; `#dropLease` folded in. Test: goodbye, then `lock()`, leaves no kept lease and the next session asks for the proof (`vault-unlock.test.ts`). Spec `lock()` and `#setLease` lines updated.
  - **Directive 2** (`bb0eda84`): `ensureUnlocked`'s doc says a joiner shares the outcome of the unlock in flight, a refusal included, and proves by calling again.
  - **Directive 3** (`12fb84fb`): `ctxStamp` refuses a stamp of no fields (`Phrases.CtxStampExpected`).
  - **The box's seal** (`3e1837c3`), in `box.ts` section *The seal*:
    - `boxStampOf(sparse, sidecar)`: the one function that makes the box's stamp, every field of `boxSparse` plus the sidecar as stable JSON. The box hands it in as both `boxKeyStamp` and `whisperStamp`; the lease's purposes tell the two apart.
    - `sealedRecordOf(lease, staged, sidecar, whisper)`: json_v1 of the `{ val }` holder (`stableJsonify`, UTF-8) into `lease.sealWith`, which zeroes the bytes; answers the full record through `boxRecord`. Called by `Box.makeStaged` and `BoxListing.draftOf` alike, each with `this.world.demandLease()`.
    - `#unseal`: `unsealWith` with the record's sealed parts and its stamp; decode, `JSON.parse` in a catch (a SyntaxError can quote its input, G8), `whisperHolder.safeParse`, bytes zeroed in `finally`; anything not a whisper refuses 'damaged_box' (`Phrases.UndecodedWhisper`).
    - `BoxWorld` gains `demandLease(): BoxLease`, `BoxLease = Pick<Lease, 'sealWith' | 'unsealWith'>`; `boxListingOpts` checks `demandLease: fn()`. `Box` declares `world: BoxWorld`. The lease is never kept on a box.
  - **Directive 5**: `stub-seal.ts` and `stub-seal.test.ts` deleted (no test still wanted the function; it had no export). Its constants live on in `tests/test-helpers/models-world.ts` as `FakeBoxKeyWrapped`/`FakeWhisperCiphered`, the sealed parts of the models world's **fake lease**: it keeps each whisper's bytes by the stamp it was sealed under and answers 'damaged_box' for any other stamp, so a builder's record never opens. The fake vault's `demandLease` refuses 'vault_locked' while it reads locked. It logs no call, so the call-sequence tests stand.
  - Tests: `tests/models/box-seal.test.ts`, through a real vault and lease: build's whisper and a later seal's open again; a record opens in another listing, and refuses 'damaged_box' with its sidecar altered; 'vault_locked' from the lease at seal and unseal past `autolock_at`. `box.test.ts`'s last unseal case is now 'damaged_box'. `vault-world.ts` gains `boxWorldOf(vault)`: the vault as a `BoxWorld`, but that its `takeWorld` takes nothing, since the models world's fake store answers `world: null`, which `Vault.takeWorld` refuses.
* **Decisions taken** (YOLO):
  - The stamp is **every sparse field**, revision and times included, as VOCABULARY's *revisionTok* and *visible* rows say: a seal binds its revision. Not "the fields fixed for the box's life" alone.
  - **One stamp, handed in twice**, not two stamps: the lease binds each under its own purpose already.
  - `sealedRecordOf` is a module function in `box.ts`, shared by `makeStaged` and `draftOf`, rather than a Box method: the listing seals before any Box exists.
  - `lock()` lets the held lease go **inside** the chore, not at once, so thread 2's loosened pin (README.md:616: a Lease taken before `lock()` seals until the queued forget lands) stays true. `Lease.forget()` stays for the autolock.
  - Directive 4: `lease.ts` is untouched, so no `isForgotten` note.
* **Discoveries**:
  - **The ouch carry now loses the carried edit.** `reconcileStaged`'s carry re-revisions a staged record without sealing it again; with the stamp binding the revision, the carried record no longer opens, and once sent it is stored as a box that refuses 'damaged_box'. Pinned in `tests/loosened/` (below). A fix wants the carry to unseal and seal again, which needs the lease and is async in a sync `receive`: not this thread's.
  - Past `autolock_at`, until the autolock timer fires, the vault reads unlocked and a box passes its guard, while the lease refuses: the lease is the truth a seal reports, as the gloss says.
* **Loosened pins added** (`tests/loosened/loosened.test.ts`, *The seal*):
  - README.md:591, "The deadline is the truth": past `autolock_at`, before the autolock fires, the vault reads unlocked and a box passes its guard, but the lease refuses its seal 'vault_locked', and the vault reads unlocked after.
  - VOCABULARY.md:92, "revision_tok is part of the box's stamp": the ouch carry re-revisions the staged edit over sealed parts bound to its old revision, so the carried edit no longer opens (with the fake lease standing in).
* **Restack notes**:
  - Thread 5 (`20261031-tests_models`) pins that `ctxStamp` passes `{}`; directive 3 makes it refuse. Retitle that pin to the refusal, or drop it, when it restacks onto this branch.
  - `stub-seal.ts` is gone: a later branch importing `StubBoxKeyWrapped`/`StubWhisperCiphered` takes `FakeBoxKeyWrapped`/`FakeWhisperCiphered` from `tests/test-helpers/models-world.ts`.
  - Thread 6's round trip can build on `boxWorldOf` and `box-seal.test.ts`.
* **For the Coach**: the ouch carry (above) wants a ruling: seal again at the carry, drop the edit with bad news (my recommendation, for now), or leave it pinned until the consistency lanes return. And whether the stamp should bind the revision and times (VOCABULARY says yes, which I followed) or only the fields fixed for the box's life.
