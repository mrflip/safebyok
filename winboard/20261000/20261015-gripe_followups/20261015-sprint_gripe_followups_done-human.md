# 2026-10-15: Sprint gripe_followups done -- two PRs and this sprint PR, one merge line

The Coach answered the questions gripe_fixes left. Two threads built on those answers. Thread 1,
`vault_amendments`, caps `user_id` at 100 characters, lets `erase()` remove a damaged box, and has
the vault report its unlock window, so the React dialog stops repeating the default. Thread 2,
`validation_overrides`, is a write-up of how validation is accepted today and a design for
host-overridable validators. This sprint PR carries the `/sprint` skill's new handling of sprint
documents, `TODO.md`'s new entries, and the sprint's own records. It was filed as a draft at
planning time and squashed onto the top of the line at the end.

## The PRs, in the order to merge them

One linear line: merging the top, [#83](https://github.com/mrflip/safebyok/pull/83), merges them all.

1. [#87](https://github.com/mrflip/safebyok/pull/87): `UserId` (1 to 100 characters),
   `erase()` of a damaged box, `Vault.reentryWindowMs` and `ForeverMs`. Stacked on `main`.
   Minor bumps for `safebyok` and `safebyok-react`: `PassphraseModal`'s `reentryHours` prop is
   gone, and a vault stored under a longer `userId` no longer opens. Review: `fixed`.
2. [#85](https://github.com/mrflip/safebyok/pull/85): `validation-overrides.md`, documents only.
   Stacked on #87.
3. [#83](https://github.com/mrflip/safebyok/pull/83): this sprint PR, squashed. Stacked on #85.
   Its unsquashed history is at the tag `sprint/20261015-gripe_followups`.

## YOLO decisions

- `Vault.reentryWindowMs` is a property on the vault, not a snapshot field, since the window
  never changes for a handle (thread 1).
- `PassphraseModal`'s `reentryHours` prop is removed, not deprecated (pre-1.0).
- The Convex component was left alone: it checks `user_id` only for type and match, and the
  client refuses a longer id before any call.
- The skill edit also drops the old rule against restacking filed branches, since restacking
  into one line is now the orchestrator's job at wrap-up.

## Open questions, gathered

**Validation overrides (#85), which decide a build thread**

1. Which shape: floor plus policy (recommended), narrow only, or full replacement with the ckey
   stringifier your TODO ruling asked for? The recommendation narrows that ruling.
2. Re-export `z`? Recommended not to.
3. Which fields take a policy: `boxlabel`, `userId` and `note` (recommended), or `applabel` and
   `vaultlabel` too?
4. What may a widened label hold (ASCII letters, digits, `_`, `-`, `.`, 1 to 40, never a
   colon)? Should the `user_id` floor also refuse control characters?
5. One home for the base schemas, `safebyok/validators`, or exported from both entries?
6. Standard Schema instead of a zod type: recommended later.

**Vault amendments (#87)**

- Should `MaxUserIdChars` be public, for a host form's `maxLength`?
- Should `store()` overwrite a box whose record fails validation, as `erase()` now removes one?
- Follow-up, now in `TODO.md` (*Soonish*): a lockbox row that breaks the listing locks the vault
  out, and `erase()` can report `corrupt_record` after its delete has landed. Both predate the
  sprint.

**Answered in chat, awaiting your word**

- The dialog's time wording: `Intl.RelativeTimeFormat` with "Locks again on this device in
  7 days" (recommended), or `Intl.DurationFormat` once Node 22 is dropped; a `locale` prop on
  `VaultProvider` belongs with text overrides, as one later thread.

**Housekeeping**

- `/workspace/byok-vault_amendments` is unregistered but still on disk, holding one untracked
  `.DS_Store`.
- [#66](https://github.com/mrflip/safebyok/pull/66) is still open with nothing left to merge.
