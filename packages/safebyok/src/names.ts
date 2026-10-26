import * as Z from 'zod/mini'
import { VaultError } from './errors'
import { optionsCheck } from './options'
import * as Sanitizer from './sanitizer'
import type { VaultScope } from './types'
import { AnyTextValidators, DefaultValidators, NameFloor, type NameValidator, type VaultValidators } from './validators'

/** The one place a name meets its check at the vault's entry: the floor, then the host's validators where it gave them, ours where not.
 * A check decides pass or fail: what passes is kept exactly as handed in. A refusal names the
 * field, never the name.
 */

/** Which check: one of the fields of {@link VaultValidators}. */
export type NameField = keyof VaultValidators

/** A check for every field: the host's where it gave one, ours where not. */
export type NameRules = Readonly<Record<NameField, NameValidator>>

/** A schema a host may hand in `validators`: a Zod 4 schema, classic or mini, which carries `_zod`. */
const nameValidator = Z.optional(Z.custom<NameValidator>((candidate: unknown) => typeof candidate === 'object' && candidate !== null && '_zod' in candidate))

/** What `validators` may hold: a schema or undefined for each field it knows, and no other field. */
const validatorsCheck = optionsCheck({
  applabel:    nameValidator,
  vaultlabel:  nameValidator,
  boxlabel:    nameValidator,
  userId:      nameValidator,
}, 'validators is a bag of Zod schemas, each checking one of applabel, vaultlabel, boxlabel and userId: leave out any field to keep its default check, and check the spelling of each one given.')

/** A host's `validators` bag as handed in, once each field is one {@link VaultValidators} knows and holds a Zod schema or undefined.
 * It refuses 'bad_option' otherwise, so a misspelt field is not quietly left at its default. A
 * binding or wrapper that takes the bag apart runs it first, once, as Bank.make does.
 *
 * @example checkValidators({ boxlabel: z.string().max(200) })  // the same bag
 * @example checkValidators({ boxLabel: z.string() })           // throws: bad_option
 */
export const checkValidators = (validators: VaultValidators | undefined): VaultValidators | undefined => validatorsCheck(validators)

/** The checks a vault runs, from a host's `validators`: a field given replaces ours, one left out or undefined keeps ours.
 * It refuses as {@link checkValidators} does.
 *
 * @example rulesOf({ boxlabel: z.string().max(200) }).applabel === Label  // true
 */
export const rulesOf = (validators: VaultValidators = {}): NameRules => {
  checkValidators(validators)
  return {
    applabel:    validators.applabel ?? DefaultValidators.applabel,
    vaultlabel:  validators.vaultlabel ?? DefaultValidators.vaultlabel,
    boxlabel:    validators.boxlabel ?? DefaultValidators.boxlabel,
    userId:      validators.userId ?? DefaultValidators.userId,
  }
}

/** `candidate` as handed in, once it passes {@link checkFloor} and then the `field` check; refuses 'bad_scope' when it does not.
 * The host's check runs once, and only on text above the floor. A refusal says what one of our own
 * checks found wrong, and only names a host's. A check that throws, such as an async one, refuses
 * 'bad_option', carrying nothing of what it threw.
 */
export const check = (rules: NameRules, field: NameField, candidate: unknown): string => {
  const floored = checkFloor(field, candidate)
  if (rules[field] === NameFloor) { return floored }
  const verdict = verdictOf(rules, field, floored)
  if (verdict.success) { return floored }
  // Our own checks' messages quote nothing, so they may say just what was wrong; a host's may
  // quote the candidate, so its refusal is never passed on.
  const said = OurChecks.has(rules[field]) ? verdict.error.issues[0]?.message : undefined
  if (said === undefined) {
    throw new VaultError('bad_scope', `That ${field} does not pass the ${field} check passed in Bank.make's validators.`)
  }
  throw new VaultError('bad_scope', `That ${field} does not pass the vault's ${field} check. ${said}.`)
}

/** `candidate` as handed in, once it passes {@link NameFloor}; refuses 'bad_scope' when it does not, saying what was wrong. */
export const checkFloor = (field: NameField, candidate: unknown): string => {
  if (typeof candidate !== 'string') {
    throw new VaultError('bad_scope', `That ${field} is missing, or is not text.`)
  }
  const verdict = Z.safeParse(NameFloor, candidate)
  if (verdict.success) { return candidate }
  throw new VaultError('bad_scope', `That ${field} is not text any vault can hold. ${verdict.error.issues[0]?.message ?? 'It fails the floor every name is held to'}.`)
}

/** A frozen copy of `scope`, once its three names pass {@link check}: so no one it is handed to can change it for everyone else. */
export const checkScope = (rules: NameRules, scope: unknown): VaultScope => {
  const checked = ScopeShape.safeParse(scope)
  if (! checked.success) {
    throw new VaultError('bad_scope', 'A vault scope is an applabel, a user_id and a vaultlabel, each text that passes its check.')
  }
  check(rules, 'applabel', checked.data.applabel)
  check(rules, 'userId', checked.data.user_id)
  check(rules, 'vaultlabel', checked.data.vaultlabel)
  return Object.freeze({ applabel: checked.data.applabel, user_id: checked.data.user_id, vaultlabel: checked.data.vaultlabel })
}

/** A scope's shape, before its names meet their checks. */
const ScopeShape = Z.object({ applabel: Z.string(), user_id: Z.string(), vaultlabel: Z.string() })

/** The `field` check's verdict on `candidate`. A check that throws rather than answering is misuse. */
const verdictOf = (rules: NameRules, field: NameField, candidate: string) => {
  try {
    return Z.safeParse(rules[field], candidate)
  } catch (err) {
    throw Sanitizer.refusalFor(err, 'bad_option', `The ${field} check in Bank.make's validators threw rather than answering: each must be a Zod schema that checks synchronously, and returns its refusals rather than throwing them.`)
  }
}

/** safebyok's own checks, whose refusals quote nothing and so may be passed on. */
const OurChecks: ReadonlySet<NameValidator> = new Set([...Object.values(DefaultValidators), ...Object.values(AnyTextValidators)])

/** True when `record` names `scope`: the same app, user and vault. */
export const sameScope = (record: VaultScope, scope: VaultScope): boolean => (
  record.applabel === scope.applabel && record.user_id === scope.user_id && record.vaultlabel === scope.vaultlabel
)
