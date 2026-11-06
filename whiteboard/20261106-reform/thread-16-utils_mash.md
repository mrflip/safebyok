# Thread 16: utils_mash (2026-11-06)

Branch `20261106-utils_mash`, PR to be filled below, stacked on [#518](https://github.com/mrflip/safebyok/pull/518). Justify: green (core 1852 tests, of them 7 new in `tests/utils.test.ts`; every package passing; size budgets met).

* **Built**: the new core's `safebyok/utils` entry. `packages/safebyok/src/utils.ts` exports `mash(text): Promise<string>`, the SHA-256 of the UTF-8 text through `crypto.subtle.digest`, as lowercase hex (`hex.encode` from `@scure/base`, already a dependency). The argument is checked at entry by a `Checker(({ str }) => str, 'bad_option')`. Wired as the old core wires its own: `package.json` `exports["./utils"]` (`@safebyok/source`, `import`, `require`), `typesVersions`, `publishConfig.exports`, and `src/utils.ts` in `tsdown.config.ts`'s entry list (the build writes `dist/utils.{js,cjs,d.ts,d.cts}`; attw and publint clean). VOCABULARY.md: the deviceId row says `user_id: await mash(email)`; a **mash** row follows it. Changeset `minor`.
* **Decisions taken**:
  - Encoding by `@scure/base`'s `hex`, not a hand-rolled byte loop (library first). It already ships in `src/helpers/crypto.ts`.
  - A refusal is `bad_option`, as the other host-handed arguments are.
  - The VOCABULARY row sits beside deviceId: the file has no utils or `mask` row (the old core's `mask` lives in `notes/old_vocabulary.md`).
  - The doc block is a first line, a second sentence that a mashed id passes `user_id` and not `label`, and one `@example`.
* **Deviations**: no size-budget line was added. The root `.size-limit.json` lists no entry of the new core (`pnpm size` builds only the old core and the adapters), so there is none to extend, and adding the new core's first line would take a change to the `size` script. No budget moved. A `Checker` is made at module level in `utils.ts` and is not exported.
* **Discoveries**: `user_id` is `str().min(1).max(100).regex(/^(?!\.+$)[A-Za-z0-9_.~:@+|%-]+$/)` (`shapes/primitives.ts`), and `shapes-core.ts` takes it as the kit's `user_id`. So `user_id: await mash(email)` passes today (64 hex characters, under 100; a test asserts it). `device_id` is `str.min(1)`, so a mash passes it too. A `label` is at most 40 characters and so a mash is never one (applabel, vaultlabel, boxlabel).
* **For the Coach**: none. The README's line about `safebyok-old/utils` (README.md:13) is not touched; it describes the old core's helpers.
