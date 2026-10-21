import * as Z from 'zod/mini'

/** `safebyok/validators`: the checks safebyok runs on every name, so a form or a server can check a name as the vault will.
 * The main entry exports each too. Every name passes {@link NameFloor}, whatever the host chose.
 * Above it are the {@link DefaultValidators}, which a host replaces field by field with
 * Vault.make's `validators`.
 */

/** The most a name holds under any validators, in bytes of UTF-8: the floor's ceiling. */
export const NameFloorBytes = 1024

/** Well-formed Unicode: no lone surrogate, half of a character such as an emoji, which has no UTF-8 form.
 * Under the `u` flag a surrogate pair reads as one character, so `\p{Cs}` finds only a lone one.
 * It searches rather than matching the whole text, which on millions of characters would
 * overflow the regex engine's stack.
 */
const WellFormed = /* @__PURE__ */ Z.refine<string>((text) => ! /\p{Cs}/u.test(text), "Text must be well-formed Unicode, and this holds a lone surrogate: half of a character such as an emoji, as text cut off mid-character does")

/** Text in Unicode's composed form (NFC), so one visible spelling is one name. Refused, never normalized, as a name is bound as given. */
const Composed = /* @__PURE__ */ Z.refine<string>((text) => text.normalize('NFC') === text, "Text must be in Unicode's composed form (NFC): normalize it with text.normalize('NFC') before passing it")

/** A name's characters: no control character at all (Unicode's `Cc`: C0, DEL and C1). */
const NameChars = /* @__PURE__ */ Z.refine<string>((text) => ! /\p{Cc}/u.test(text), "A name holds no control characters")

/** The character key-value stores join a row's names on (`Ckeys.Delimiter`), which no name may hold. */
const JoinChar = '^'

/** A name free of the character key-value stores join names on. */
const Unjoined = /* @__PURE__ */ Z.refine<string>((text) => ! text.includes(JoinChar), "A name holds no ^, which storage joins names on")

/** At most `limit` bytes of UTF-8: run after a cheap count of characters, each at least a byte, has turned away the longest. */
const utf8Within = (limit: number, said: string) => Z.refine<string>((text) => new TextEncoder().encode(text).length <= limit, said)

/** The floor beneath every name, whatever the validators: well-formed NFC text, 1 to {@link NameFloorBytes} bytes, with no control character and no `^`.
 * A host's own check narrows what passes; nothing widens it. The vault refuses a name below the
 * floor as 'bad_label', and a stored record holding one reads back as damaged.
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

/** The pattern a default {@link Label} matches, two characters at least: its `source` suits an HTML input's `pattern` attribute.
 * It has no repeated group, so text of millions of characters is refused, not thrown at.
 *
 * @example <input pattern={LabelPattern.source} maxLength={MaxLabelChars} />
 */
export const LabelPattern = /^(?!.*__)[a-z][a-z0-9_]*[a-z0-9]$/

/** The default check for an `applabel`, `vaultlabel` and `boxlabel`: lowercase words of letters and digits joined by single underscores.
 * It starts with a letter, and takes two to {@link MaxLabelChars} characters.
 * A scope's `user_id` is checked as a {@link UserId} instead.
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

/** The characters a default {@link UserId} is made of: ASCII letters and digits and `-_.:@+|`. Its `source` suits an HTML input's `pattern`.
 *
 * @example UserIdPattern.test('auth0|5f7c8ec7c33c6c004bbafe82')  // true
 */
export const UserIdPattern = /^[A-Za-z0-9_.:@+|-]+$/

/** The default check for a scope's `user_id`: 1 to {@link MaxUserIdChars} ASCII letters, digits and `-_.:@+|`.
 * That holds every stable id a provider issues: a UUID, Auth0's `provider|id`, Clerk's `user_...`,
 * Apple's dotted `sub`, a DID. Pass the provider's stable, opaque id, never an email or handle: a
 * vault is found by its user_id, and one that changes orphans the vault. `Vault.make` refuses one
 * that fails as 'bad_label'.
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

/** A schema a host hands the vault in place of one of ours: any Zod 4 schema, classic or mini, whose output is text. It must check synchronously. */
export type NameValidator = Z.core.$ZodType<string>

/** Vault.make's `validators`: the checks a vault runs on each name where it enters.
 * A field given **replaces** ours; one left out keeps {@link DefaultValidators}. Build the bag once, at module level, not anew on each call or render.
 *
 * Each only checks: the vault keeps the name as it was handed, never what the schema makes of it.
 * So a schema that trims or lowercases still decides only pass or fail. A refusal is the vault's
 * own 'bad_label', and never quotes the schema's issues, which may quote the name.
 *
 * | Check | Job | Runs | Fails as |
 * |---|---|---|---|
 * | These validators (`Label` and `UserId` by default) | an alarm for names your app never meant to use | at entry only: Vault.make (the scope), putBox (the boxlabel) | `bad_label` |
 * | The floor ({@link NameFloor}) | what text must be for every client and store to agree (no `^` in a name, which key-value stores join names on) | beneath these at entry, whatever they are; at every storage verb; on every record read back | `bad_label` at entry and for a verb's own names; `bad_record` in a record sent; damaged on read |
 * | The record's shape, scope, boxlabel, ciphertext and expectations | what the design needs | when sent to storage and when read back | `bad_record` (a bug) when sent; damaged on read; `stale_write` |
 * | The storage's own limits (`maxRecordBytes`, `maxVaultBytes`, `maxBoxes`, `maxNameBytes`) | facts about the backend | when sent to storage | `box_too_large`, `vault_full`, `bad_label` |
 *
 * So a check of yours is an alarm, not a promise about what storage holds. A box stored under a
 * name it refuses, by another client or before you narrowed it, lists, reads and deletes as any
 * other. Only a name below the floor is damage. A server holds names to the floor and its own
 * limits, never to these (`VAULTDB.md`).
 *
 * Widen with care. A check admitting text outside ASCII should require NFC, as the floor does.
 * Widen a check only once every client you serve runs the wider one, or an older client refuses
 * the names a newer one stores.
 *
 * @example
 *   import * as z from 'zod'
 *   // Labels in any script, up to 200 characters, and Clerk's user ids.
 *   const validators: VaultValidators = {
 *     boxlabel: z.string().min(1).max(200),
 *     userId:   z.string().regex(/^user_[A-Za-z0-9]{27}$/),
 *   }
 *   const vault = Vault.make({ applabel: 'acme', userId, vaultlabel: 'main', vaultDB, validators, ...browserOpts() })
 */
export type VaultValidators = {
  /** The check for the app's label: {@link Label} by default. */
  applabel?:    NameValidator | undefined
  /** The check for the vault's label: {@link Label} by default. */
  vaultlabel?:  NameValidator | undefined
  /** The check for each boxlabel: {@link Label} by default. */
  boxlabel?:    NameValidator | undefined
  /** The check for the signed-in user's id: {@link UserId} by default. */
  userId?:      NameValidator | undefined
}

/** The checks a vault runs when its host passes none: {@link Label} for each label, and {@link UserId} for the user. Frozen.
 *
 * @example DefaultValidators.boxlabel.safeParse('anthropic_api_key').success  // true
 */
export const DefaultValidators = Object.freeze({
  applabel:    Label,
  vaultlabel:  Label,
  boxlabel:    Label,
  userId:      UserId,
})

/** Checks that admit, in every field, whatever passes {@link NameFloor}: for a host keeping names in any script, whole or as a start. Frozen.
 *
 * @example Vault.make({ ...opts, validators: AnyTextValidators })
 * @example Vault.make({ ...opts, validators: { ...AnyTextValidators, userId: UserId } })
 * @example AnyTextValidators.boxlabel.safeParse('Work: מפתח API').success  // true
 * @example AnyTextValidators.boxlabel.safeParse('key \uD83D').success      // false: half of an emoji
 */
export const AnyTextValidators = /* @__PURE__ */ Object.freeze({
  applabel:    NameFloor,
  vaultlabel:  NameFloor,
  boxlabel:    NameFloor,
  userId:      NameFloor,
})
