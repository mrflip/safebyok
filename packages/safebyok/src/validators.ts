import * as Z from 'zod/mini'

/**
 * The checks safebyok runs on every name, and the bounds behind its defaults, in an entry
 * point of their own: `import { Label, DefaultValidators } from 'safebyok/validators'`. A form, a
 * server, or a library of its own can check a name as the vault will before calling it. Each is
 * exported from the main entry too.
 *
 * Two layers: the floor ({@link NameFloor}), which every name must pass whatever the host chose, and the defaults above it ({@link DefaultValidators}), which a host
 * replaces field by field with openVault's `validators` ({@link VaultValidators}).
 */

/** The most a name holds under any validators, in bytes of UTF-8: the floor's ceiling. */
export const NameFloorBytes = 1024

/**
 * Well-formed Unicode: no surrogate standing alone, half of a character such as an emoji, as text
 * cut off mid-character has. Such text has no UTF-8 form, and Convex requires valid Unicode. Under
 * the `u` flag a surrogate pair reads as the one character it encodes, so `\p{Cs}` (the Unicode
 * category of surrogates) finds only a lone one. It searches for one rather than matching the
 * whole text, which on text of millions of characters would overflow the regex engine's stack.
 */
const WellFormed = /* @__PURE__ */ Z.refine<string>((text) => ! /\p{Cs}/u.test(text), "Text must be well-formed Unicode, and this holds a lone surrogate: half of a character such as an emoji, as text cut off mid-character does")

/**
 * Text in Unicode's composed form (NFC), so one visible spelling is one name: the same letter
 * composed (`é`) and decomposed (`e` and a combining accent) would otherwise be two names, two
 * rows and two cipher ctxs. Refused, never normalized: a name is bound into the ciphertext as
 * given.
 */
const Composed = /* @__PURE__ */ Z.refine<string>((text) => text.normalize('NFC') === text, "Text must be in Unicode's composed form (NFC): normalize it with text.normalize('NFC') before passing it")

/** A name's characters: no control character at all (Unicode's `Cc`: C0, DEL and C1). */
const NameChars = /* @__PURE__ */ Z.refine<string>((text) => ! /\p{Cc}/u.test(text), "A name holds no control characters")

/**
 * The character key-value stores join a row's names on (`Ckeys.Delimiter`), which no name may
 * hold, so that no two rows share a ckey whatever store holds them.
 */
const JoinChar = '^'

/** A name free of the character key-value stores join names on. */
const Unjoined = /* @__PURE__ */ Z.refine<string>((text) => ! text.includes(JoinChar), "A name holds no ^, which storage joins names on")

/** At most `limit` bytes of UTF-8: run after a cheap count of characters, each at least a byte, has turned away the longest. */
const utf8Within = (limit: number, said: string) => Z.refine<string>((text) => new TextEncoder().encode(text).length <= limit, said)

/**
 * The floor beneath every name -- an applabel, a user_id, a vaultlabel, a boxlabel, a
 * wayinlabel -- whatever validators a host passed: text of one character to {@link
 * NameFloorBytes} (1 KiB) of UTF-8, well-formed, in NFC, with no control character and no `^`,
 * which key-value stores join a row's names on (`Ckeys`). A host's own
 * check narrows what passes; nothing widens it. The vault refuses a name below the floor with kind
 * 'bad_label', and a stored record holding one reads back as damaged.
 *
 * @example NameFloor.safeParse('Work: מפתח API').success  // true: any script
 * @example NameFloor.safeParse('key \uD83D').success      // false: half of an emoji
 * @example NameFloor.safeParse('café').success      // false: decomposed, not NFC
 * @example NameFloor.safeParse('tab\there').success       // false: a control character
 * @example NameFloor.safeParse('a^b').success             // false: storage joins names on ^
 */
export const NameFloor = /* @__PURE__ */ Z.string().check(
  Z.minLength(1, "A name can't be empty"),
  Z.maxLength(NameFloorBytes, { error: `A name is at most ${String(NameFloorBytes)} bytes of UTF-8`, abort: true }),
  utf8Within(NameFloorBytes, `A name is at most ${String(NameFloorBytes)} bytes of UTF-8`),
  WellFormed,
  NameChars,
  Unjoined,
  Composed,
)

/** The most characters a default {@link Label} holds. */
export const MaxLabelChars = 40

/**
 * The pattern a default {@link Label} matches: lowercase words of letters and digits joined by
 * single underscores, starting with a letter, two characters at least. Its `source` suits an
 * HTML input's `pattern` attribute. It has no repeated group, which on text of millions of
 * characters would overflow the regex engine's stack: such text is refused, not thrown at.
 *
 * @example <input pattern={LabelPattern.source} maxLength={MaxLabelChars} />
 */
export const LabelPattern = /^(?!.*__)[a-z][a-z0-9_]*[a-z0-9]$/

/**
 * The default check for every label in the package: `applabel`, `vaultlabel`, `boxlabel` and a
 * wayin's `wayinlabel`.
 * Lowercase words of letters and digits joined by single underscores, starting with a letter,
 * two to forty characters (STYLE.md's tag glossary). A host that wants other labels passes its own
 * schema in openVault's `validators`. (A scope's `user_id` is the host's auth identity,
 * deliberately not a Label: see {@link UserId}.)
 *
 * @example Label.parse('anthropic_api_key')
 * @example Label.safeParse('ANTHROPIC_API_KEY').success  // false: lowercase only
 * @example Label.safeParse('_nope').success              // false
 */
export const Label = Z.string().check(
  Z.maxLength(MaxLabelChars, "A label is at most forty characters"),
  Z.regex(LabelPattern, "A label is lowercase words of letters and digits joined by single underscores, starting with a letter"),
)

/** The most characters a default {@link UserId} holds. */
export const MaxUserIdChars = 100

/**
 * The characters a default {@link UserId} is made of: ASCII letters and digits and `-_.:@+|`. Its
 * `source` suits an HTML input's `pattern` attribute.
 *
 * @example UserIdPattern.test('auth0|5f7c8ec7c33c6c004bbafe82')  // true
 */
export const UserIdPattern = /^[A-Za-z0-9_.:@+|-]+$/

/**
 * The default check for a scope's `user_id`: the signed-in user's id from the host's own auth,
 * 1 to {@link MaxUserIdChars} (100) ASCII letters, digits and `-_.:@+|`. That holds every stable id
 * a provider issues -- a UUID or ULID, Auth0's `provider|id`, Clerk's `user_...`, Firebase's,
 * Okta's, Apple's dotted `sub`, a DID -- and a practical email address, though the id should be
 * the provider's stable, opaque one: a vault is found by its user_id, and one that changes (an
 * email, a handle) orphans the vault. `^`, which key-value stores join names on, is in no name
 * at all (the floor), and `/`, a folder store's separator, in no default. `openVault` refuses a `userId` that fails it with kind 'bad_label'; a host whose
 * ids look otherwise passes its own schema as `validators.userId`.
 *
 * @example UserId.parse('auth0|5f7c8ec7c33c6c004bbafe82')
 * @example UserId.safeParse('').success               // false: an empty id names no one
 * @example UserId.safeParse('u'.repeat(101)).success  // false: 100 characters at most
 * @example UserId.safeParse('alice smith').success    // false: no spaces
 */
export const UserId = Z.string().check(
  Z.minLength(1, "A user_id names the signed-in user, so it can't be empty"),
  Z.maxLength(MaxUserIdChars, `A user_id is at most ${String(MaxUserIdChars)} characters`),
  Z.regex(UserIdPattern, "A user_id is ASCII letters, digits and - _ . : @ + |, as an auth provider's stable id is"),
)

/**
 * A schema a host hands the vault in place of one of ours: any Zod 4 schema whose output is
 * text, classic (`zod`) or mini (`zod/mini`). It must check synchronously.
 */
export type NameValidator = Z.core.$ZodType<string>

/**
 * The checks a vault runs on every name at its entry, as openVault's `validators` option:
 * each field a host gives **replaces** ours, and each it leaves out keeps ours
 * ({@link DefaultValidators}). Build the bag once, at module level, not anew on each call or render.
 *
 * Each runs as a check and nothing more: the vault keeps what it was handed, never what the schema
 * makes of it, as every name is bound into the ciphertext and names its rows. A schema that trims
 * or lowercases still decides only pass or fail. A refusal is the vault's own (kind 'bad_label'),
 * and never quotes the schema's issues, which may quote the name.
 *
 * What each check is for, and where it runs:
 *
 * | Check | Job | Runs | Fails as |
 * |---|---|---|---|
 * | These validators (`Label` and `UserId` by default) | an alarm for names your app never meant to use | at entry only: openVault (the scope), store (the boxlabel), addPassphrase and addPasskey (the wayinlabel) | `bad_label` |
 * | The floor ({@link NameFloor}) | what text must be for every client and store to agree (no `^` in a name, which key-value stores join names on) | beneath these at entry, whatever they are; at every storage verb; on every record read back | `bad_label` at entry; damaged on read |
 * | The record's shape, scope, boxlabel, ciphertext and expectations | what the design needs | when sent to storage and when read back | `bad_option` (a bug) when sent; damaged on read; `stale_write` |
 * | The storage's own limits (`maxRecordBytes`, `maxVaultBytes`, `maxLockboxes`, `maxNameBytes`) | facts about the backend | when sent to storage | `lockbox_too_large`, `vault_full`, `bad_label` |
 *
 * So a check of yours is an alarm, not a promise about what storage holds: a lockbox stored under a
 * name it refuses -- written by another client, or before you narrowed it -- lists, reads and
 * erases as any other, by the name it was stored under; only a name below the floor is damage.
 * A lockbox's public bag is never checked by the vault: a host checks its own before `store()`. A server holds names to the floor and its own limits, never to these (`VAULTDB.md`).
 *
 * Widening with care. A name is stored and bound exactly as given, so a check admitting text
 * outside ASCII should require what the floor does, Unicode's composed form (NFC), and an app
 * should widen a check only once every client it serves runs the wider one, or an older client
 * refuses at its entry the names a newer one stores. A `user_id` is the auth provider's stable,
 * opaque id for the user, never an email or a handle that can change.
 *
 * @example
 *   import * as z from 'zod'
 *   // Labels in any script, up to 200 characters, and Clerk's user ids.
 *   const validators: VaultValidators = {
 *     boxlabel: z.string().min(1).max(200),
 *     userId:   z.string().regex(/^user_[A-Za-z0-9]{27}$/),
 *   }
 *   const vault = await openVault({ applabel: 'acme', userId, vaultlabel: 'main', vaultDB, validators, ...browserOpts() })
 */
export type VaultValidators = {
  /** Checks the host application's label. Default: {@link Label}. */
  applabel?:    NameValidator | undefined
  /** Checks the vault's label. Default: {@link Label}. */
  vaultlabel?:  NameValidator | undefined
  /** Checks each lockbox's label. Default: {@link Label}. */
  boxlabel?:    NameValidator | undefined
  /** Checks the signed-in user's id. Default: {@link UserId}. */
  userId?:      NameValidator | undefined
  /** Checks the label of each way in a host adds: a passphrase or a passkey. Default: {@link Label}. */
  wayinlabel?:  NameValidator | undefined
}

/**
 * The checks a vault runs when its host passes none: {@link Label} for each label, a
 * wayinlabel's among them, and {@link UserId} for the user. Frozen.
 *
 * @example DefaultValidators.boxlabel.safeParse('anthropic_api_key').success  // true
 */
export const DefaultValidators = Object.freeze({
  applabel:    Label,
  vaultlabel:  Label,
  boxlabel:    Label,
  userId:      UserId,
  wayinlabel:  Label,
})

/**
 * Checks that admit, in every field, whatever passes the floor and no less: a name of any script,
 * up to {@link NameFloorBytes} of UTF-8, well-formed, in NFC, and free of control characters and
 * `^`. What a host keeping labels in any script may pass whole, or start from. Frozen.
 *
 * @example openVault({ ...opts, validators: AnyTextValidators })
 * @example openVault({ ...opts, validators: { ...AnyTextValidators, userId: UserId } })
 * @example AnyTextValidators.boxlabel.safeParse('Work: מפתח API').success  // true
 * @example AnyTextValidators.boxlabel.safeParse('key \uD83D').success      // false: half of an emoji
 */
export const AnyTextValidators = /* @__PURE__ */ Object.freeze({
  applabel:    NameFloor,
  vaultlabel:  NameFloor,
  boxlabel:    NameFloor,
  userId:      NameFloor,
  wayinlabel:  NameFloor,
})
