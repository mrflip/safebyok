# Validation overrides (gripe_followups thread 2, 2026-10-15)

The Coach, verbatim:

> describe how we currently accept validations. My thought is to allow the customer to override
> a bag of defaults, and provide them with `z` and a base set of ones in a slashed export?

**In short**: today a host can tune the numbers and nothing else. The labels, `user_id`, the note
and the stored records are checked by our own schemas, which a host can import but not replace.
I recommend two layers. The first is a fixed **floor**, checked everywhere, records read back
included: what the ckeys, the cipher binding and the size allowance depend on. The second is a
replaceable **policy**, checked where a name is first made. It defaults to today's grammar, and
a host overrides it field by field at `openVault`. The base set goes in `safebyok/validators`. I
recommend against re-exporting `z`. Line numbers are on `main` at `6f9911d`. Thread 1's `user_id`
bound is called `UserId` here; its branch may name it differently.

## Today

Every entrypoint parses what it is handed with a module-level `zod/mini` schema. It refuses with
a `VaultError` whose `kind` a caller branches on, and the message never quotes the input. Past
that point the code trusts the value. #70's survey
(`winboard/20261015-gripe_fixes/validation-survey.md`) has the full table of entrypoints. What
matters here is which checks a host can tune.

**Tunable: numbers, as `openVault` options with exported defaults.** These are already a bag of
defaults, of values rather than validators.

| Option | Default (`types.ts`) | Schema and parser (`vault.ts`) | Refusal |
| --- | --- | --- | --- |
| `maxWhisperBytes` | `MaxWhisperBytes` 40444, :255 | :1060, :1156 | `bad_option` |
| `maxLockboxes` | `MaxLockboxes` 100, :262 | :1061, :1164 | `bad_option` |
| `forcePassphraseReentryHours` | `ForcePassphraseReentryHours` 168, :247 | :1103-1107, :1112 | `bad_option` |
| the two limits together | an adapter's `maxRecordBytes` and `maxVaultBytes` | `ensureLimitsFit` :1218 | `bad_option` |
| `lockSoon(graceSeconds)` | 5 s, at most 60 (`vault.ts`:1077-1079) | :1082-1084, :1086 | `bad_option` |

`clock`, `logger`, `vaultDB`, `deviceDB` and `keyDeriver` are shape-checked only (`vault.ts`
:1009-1036, :1121-1125, :1173-1187; `logger.ts`:42-53), and `dbName` is any non-empty text
(`idb-opts.ts`:21-38).

**Fixed: every name, and every record.**

| What | Defined | Checked at |
| --- | --- | --- |
| `Label` (applabel, vaultlabel, boxlabel): `^[a-z](_?[a-z0-9])+$`, at most 40 | `types.ts`:69-72 | `parseLabel`, `vault.ts`:977, called at :284-285 (open), :608 (read, use), :746 (store), :822 (erase); `checkScope` and `checkBoxlabel` in `vault-db.ts`:304-324, on every VaultDB verb |
| `user_id`: non-empty text, no upper bound (thread 1 adds 1 to 100) | inline, `types.ts`:128, :205, :229 | `parseUserId`, `vault.ts`:985, at open (:286); `checkScope` on every verb |
| `LockboxNote`: at most 256 characters | `types.ts`:144 | `parseNote`, `vault.ts`:961-970, in `store()` (:747) |
| `Whisper`: JSON-able, not a bare null | `types.ts`:51 | `store()`, `vault.ts`:748 |
| `EpochMillis`: 1981 to 2255, whole ms | `types.ts`:115-119 | inside every record |
| Records: `Lockbox` :157, `LockboxSummary` :187, `VaultBundle` :202, `DeviceUnlock` :226 | `types.ts` | on read: `checkRecord`, `vault-db.ts`:359; `listBoxes` through `ListedLockbox` :283; `DeviceUnlock` at `vault.ts`:554 and `idb.ts`:188. On write: `checkOutgoing`, `vault-db.ts`:337, with the expectations at :14, :29, :43 |
| Convex's server validators: types and fields only | `safebyok-convex/src/component/validators.ts`:29-33 and on | Convex, per call; the grammar is left to the client |

A host can already *use* our schemas: the main entry exports `Label`, `LockboxNote`, `Whisper`,
`EpochMillis`, `VaultScope` and the records (`index.ts`:14). So a form can check a boxlabel with
ours before `store()`. What a host cannot do is change what we accept.

**What depends on the names.**

* **Ckeys.** The in-tree adapters file rows under `:`-joined ckeys: `scopePath`, `bundleCkey` and
  `boxCkey` (`vault-db.ts`:396-398), `unlockCkey` (`device-db.ts`:24, `idb.ts`:68).
  `isBoxCkeyOf` (`vault-db.ts`:405-408) tells one vault's boxes from another's only because a
  boxlabel holds no colon. A `user_id` may hold colons already, and that is safe only because
  the labels on either side of it hold none. Convex is not affected: it keeps the scope in
  separate columns (`schema.ts`:13-20).
* **The cipher binding.** `cipherBinding` (`crypto.ts`:49-51) encodes applabel, `user_id`,
  vaultlabel and boxlabel as a JSON array (`vault.ts`:340-345). Any characters at all are
  unambiguous there. But the exact string is bound into the ciphertext: change it by a byte and
  nothing opens.
* **The size allowance.** `LockboxFieldsBytes` (`vault.ts`:1050-1058) is 2 KiB for a lockbox's
  other fields. It assumes 40-*byte* labels (ASCII), a note of 256 characters and a `user_id` of
  at most 512 bytes. `ensureLimitsFit` relies on it to refuse limits a backend might not hold
  (`vault-db.ts`:83-96 says so to adapter authors).

## The proposal

**Two layers per name-like field.**

* **The floor** is fixed, ours, and checked everywhere a value passes today. That includes the
  stored records (`types.ts`), every VaultDB verb, and every record read back. It holds exactly
  what the ckeys, the binding and the allowance need. For a label: ASCII, no colon, no control
  characters, 1 to 40 characters. For `user_id`: thread 1's bound, 1 to 100 characters, which is
  at most 400 bytes and inside the 512 the allowance counts. For a note: at most 256 characters.
* **The policy** is replaceable. It is checked only where a name is first made: at `openVault`
  for the scope, and in `store()` for the boxlabel and note. Its default is today's grammar
  (`Label`, `UserId`, `LockboxNote`), so a vault opened without overrides behaves exactly as now.
  The policy runs *after* the floor. A host can narrow anything, and can widen only as far as
  the floor.

`read`, `use` and `erase` check only the floor. A host that tightens its policy therefore still
reaches every box stored under the old one, just as lowering `maxWhisperBytes` strands nothing.

**The option.** `openVault({ ..., validators: { boxlabel?, userId?, note? } })`. Each entry is a
`Z.core.$ZodType<string>`, as TODO's *Soonish* already asks, so a classic or a mini schema fits.
We run it with `Z.safeParse(policy, input)`. `zod/mini` re-exports core's `safeParse`, which takes
either flavour. A host overriding the user-id default looks like this:

```ts
import * as Z from 'zod/mini'
import { openVault } from 'safebyok'
import { browserOpts } from 'safebyok/browser'
import { UserId } from 'safebyok/validators'

// Clerk's ids, 'user_' and 27 letters and digits: ours, narrowed. Built once, at module level.
const ClerkUserId = UserId.check(Z.regex(/^user_[A-Za-z0-9]{27}$/, 'a Clerk user id'))

const vault = await openVault({
  applabel: 'acme', userId: session.userId, vaultlabel: 'main', vaultDB, ...browserOpts(),
  validators: { userId: ClerkUserId },
})
```

Inside, `parseUserId` becomes roughly this:

```ts
const parseUserId = (candidate: unknown, policy: Z.core.$ZodType<string>): string => {
  const floored = UserIdFloor.safeParse(candidate)
  if (! floored.success || ! Z.safeParse(policy, candidate).success) { throw badUserId() }
  return floored.data  // what the host passed, never what the policy made of it
}
```

**The slashed entry.** `safebyok/validators` exports the default policies (`Label`, `UserId`,
`LockboxNote`) and the other schemas a host's forms use (`Whisper`, `EpochMillis`). It is one
more line in `tsdown.config.ts`'s `entry` and one row in `.size-limit.json`.

## What must stay fixed, and why

1. **The floor itself.** It is what keeps the `:`-joined ckeys unambiguous and the 2 KiB
   allowance honest. The Convex server needs it too, because server code never sees
   `openVault`'s options. Any bound the server checks (thread 1 may add `user_id`'s) has to be
   the floor's.
2. **Check, never transform.** A policy's output is thrown away, and the host's input is kept.
   The scope and boxlabel are bound into every ciphertext and name every row. A policy that trims
   or lowercases would send the same user to a different vault, and a later change to it would
   strand ciphertext.
3. **The refusal.** It stays ours: kind `bad_label` (`bad_option` for a note), a message naming
   the field and the option, and never the host schema's issues, which can quote their input
   (STYLE.md, *Validation*). An async policy throws in `Z.safeParse`. We catch that and refuse it
   as `bad_option`.
4. **Everything we name, not the host**: the `format` literals, `vault_id`, `revision_id`,
   `passphrase_epoch`, `key_deriver_label`, the salt, `Ciphered`, `EpochMillis`. Changing any of
   these changes the stored format, which a host has no say in.
5. **`Whisper`.** JSON-ability is the cipher's input contract. A host that wants a particular
   shape of secret checks it before `store()`.
6. **The numeric limits stay plain options.** They already are a bag of defaults, and a
   validator would add nothing to them.

## Costs

* **Bytes.** The default schemas are already in every `openVault` bundle, so the new entry adds
  nothing to anyone's build (`unbundle`, `sideEffects: false`). The floor schemas and the
  plumbing do add to `openVault`. My guess is a few hundred bytes brotlied, but I have not
  measured it. `openVault` sits at 16.61 of 17 kB before thread 1, so expect a budget bump.
* **Surface.** One option, one entry point, a new exported `UserId`, and the floor/policy
  distinction explained in the README and VOCABULARY. VOCABULARY.md:76 ("A label is lowercase
  words...") becomes "by default".
* **React.** `VaultProvider` lists every option (`vault-provider.tsx`:113, guarded by
  `satisfies`) and opens the vault again whenever one changes (deps at :133). So `validators`
  must be passed through. A host that builds the bag inline, in render, would reopen the vault
  on every render. Either the docs say to build it once, or the provider depends on each field
  rather than on the bag.
* **Messages.** A refusal can no longer spell out the grammar ("2-40 lowercase...") once a host's
  policy may be the one that refused.
* **Tests.** Each field needs tests showing that an override narrows, that it cannot widen past
  the floor, that a transform is ignored, that a refusal quotes nothing, that a classic schema
  works, and that reads check only the floor.

**Can a host's zod differ from ours?** zod is our peer dependency, `^4.0.0`
(`packages/safebyok/package.json`, `peerDependencies`). The host installs it, and in an ordinary
install the host's copy is ours. A zod 3 host is outside that range today, whatever we decide
here. Two copies of zod 4 (a monorepo, or a pre-bundled dependency) should still work, because
core's `safeParse` hands off to the schema's own internals. I have not verified that, and we
should not promise it. The alternative is **Standard Schema**: zod 4 schemas carry `~standard`,
and so do Valibot's and ArkType's. Its type is not exported publicly by zod, though, so we would
have to add `@standard-schema/spec`, which is types only. I would leave it until a host asks.

**Re-exporting `z`.** Classic `zod` does not tree-shake: it was about three quarters of every
bundle before the move to mini (TODO.md, the `zod/mini` entry). So `export * as z from 'zod'`
would cost bytes to every app that imports the entry. Re-exporting `zod/mini` costs nothing,
but `z.string().max(3)` does not exist in mini, which would trip up every host used to classic.
Either way, zod's surface would become ours, and a zod major would be our breaking change rather
than a peer-range bump. Since the peer dependency already gives the host the same zod, I
recommend the docs import from `zod/mini` (or `zod`) instead.

## Against TODO's rulings

* ***Pluggable label validator*: a label policy comes paired with a ckey stringifier.** Under
  this design the floor keeps `:` out of every label, so today's `:`-join is right for any policy
  and no pair is needed. A stringifier would be needed only to admit a colon or a label longer
  than 40 characters. It would also be a stored contract in its own right: it names every row,
  so it must be the same on every device and in every version, and a host that changed it would
  strand its vaults. I recommend offering it only when someone needs a colon. This narrows your
  ruling, so it is your call.
* ***Validating the user id*: replaceable, with a length cap and no control characters by
  default.** Met. Thread 1's bound is the default and the floor; the default adds "no control
  characters" if you want it (question 4). A host that needs ids longer than 100 characters
  would need the floor raised; the allowance has room up to 512 bytes.

## Recommended shape

* A floor plus a policy, as above. The floor goes in the stored-record schemas, replacing
  `Label`, the inline `user_id` and `LockboxNote` there. The defaults move to policy.
* `validators: { boxlabel?, userId?, note? }` on `openVault` and `VaultProvider`, each a
  `Z.core.$ZodType<string>`, check-only, run after the floor. `applabel` and `vaultlabel` are
  the developer's own constants and keep today's grammar.
* `safebyok/validators` holds the defaults. No `z`, and no stringifier.
* The build thread adds a `notes/security.md` entry: a host's schema now runs on the scope and
  the note, never on a whisper or a passphrase, and its output never reaches storage.

## Questions for the Coach

1. **Which shape?** (a) Floor plus policy, as recommended: a host narrows anything and widens up
   to the floor. (b) Narrow only: the floor is today's grammar, so the stored schemas do not
   change, but nobody can admit `OpenAI-Key`. (c) Full replacement, with your ruling's
   stringifier.
2. **Re-export `z`?** I recommend not to, for the reasons above.
3. **Which fields?** `boxlabel`, `userId` and `note`, as recommended, or a policy for
   `applabel` and `vaultlabel` too?
4. **What may a widened label hold?** I propose ASCII letters, digits, `_`, `-` and `.`, 1 to 40
   characters, starting with a letter or a digit, and never a colon. Should the `user_id` floor
   also refuse control characters?
5. **One home for the base set?** Move `Label`, `LockboxNote`, `Whisper` and `EpochMillis` off
   the main entry into `safebyok/validators` (allowed before 1.0, and the changeset says so), or
   export them from both?
6. **Standard Schema** in place of a zod type, now or later? I recommend later.
