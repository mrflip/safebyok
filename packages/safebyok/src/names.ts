import * as Z from 'zod/mini'
import { VaultError } from './errors'
import { optionsCheck } from './options'
import * as Sanitizer from './sanitizer'
import type { VaultScope } from './types'
import { AnyTextValidators, DefaultValidators, NameFloor, type NameValidator, type VaultValidators } from './validators'

/**
 * The one place a name meets its check at the vault's entry: the floor beneath, then the
 * host's validators where it gave them and ours where not. A check decides pass or fail and
 * nothing more: what passes is kept exactly as handed in.
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
  wayinlabel: nameValidator,
}, 'validators is a bag of Zod schemas, each checking one of applabel, vaultlabel, boxlabel, userId and wayinlabel: leave out any field to keep its default check, and check the spelling of each one given.')

/**
 * A host's `validators` bag, exactly as handed in, once its shape passes: each field one of
 * applabel, vaultlabel, boxlabel, userId and wayinlabel, and each a Zod schema or
 * undefined. Kind 'bad_option' otherwise, so a misspelt field (`boxLabel`) is refused rather
 * than leaving the default check quietly in its place. Only the shape is checked: the schemas
 * are the host's.
 * openVault runs it on its `validators` option; a binding or wrapper that takes the bag apart
 * runs it first, once, on the bag it was handed.
 *
 * @example checkValidators({ boxlabel: z.string().max(200) })  // the same bag
 * @example checkValidators({ boxLabel: z.string() })           // throws: bad_option
 */
export const checkValidators = (validators: VaultValidators | undefined): VaultValidators | undefined => validatorsCheck(validators)

/**
 * The checks a vault runs, from a host's `validators`: each field it gives replaces ours, and
 * each it leaves out (or passes as undefined) keeps ours. A bag of another shape is refused, as
 * {@link checkValidators} refuses it.
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
    wayinlabel: validators.wayinlabel ?? DefaultValidators.wayinlabel,
  }
}

/**
 * `candidate`, exactly as handed in, once it passes the floor and then the `field` check: kind
 * 'bad_label' when it does not. The host's check runs once, and only on
 * text above the floor. The refusal names the field, never the candidate, and says what one of
 * safebyok's own checks found wrong; a host's check it names only. A check that throws rather
 * than answering -- an async one, or a host's own bug -- is misuse: kind 'bad_option', carrying
 * nothing of what it threw, which may quote the candidate.
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
    throw new VaultError('bad_label', `That ${field} does not pass the ${field} check passed in openVault's validators.`)
  }
  throw new VaultError('bad_label', `That ${field} does not pass the vault's ${field} check. ${said}.`)
}

/**
 * `candidate`, exactly as handed in, once it passes the floor beneath every name, whatever the
 * host's validators ({@link NameFloor}): kind 'bad_label' when it does not, saying what was wrong
 * and quoting nothing.
 */
export const checkFloor = (field: NameField, candidate: unknown): string => {
  if (typeof candidate !== 'string') {
    throw new VaultError('bad_label', `That ${field} is missing, or is not text.`)
  }
  const verdict = Z.safeParse(NameFloor, candidate)
  if (verdict.success) { return candidate }
  throw new VaultError('bad_label', `That ${field} is not text any vault can hold. ${verdict.error.issues[0]?.message ?? 'It fails the floor every name is held to'}.`)
}

/**
 * `scope`, once its three names pass the floor and their checks, as a frozen copy: whoever it is
 * handed to -- a host's strength test, a snapshot's reader -- cannot change it for everyone else.
 * Kind 'bad_label' otherwise.
 */
export const checkScope = (rules: NameRules, scope: unknown): VaultScope => {
  const checked = ScopeShape.safeParse(scope)
  if (! checked.success) {
    throw new VaultError('bad_label', 'A vault scope is an applabel, a user_id and a vaultlabel, each text that passes its check.')
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
    throw Sanitizer.refusalFor(err, 'bad_option', `The ${field} check in openVault's validators threw rather than answering: each must be a Zod schema that checks synchronously, and returns its refusals rather than throwing them.`)
  }
}

/** safebyok's own checks, whose refusals quote nothing and so may be passed on. */
const OurChecks: ReadonlySet<NameValidator> = new Set([...Object.values(DefaultValidators), ...Object.values(AnyTextValidators)])

/** True when `record` names `scope`: the same app, user and vault. */
export const sameScope = (record: VaultScope, scope: VaultScope): boolean => (
  record.applabel === scope.applabel && record.user_id === scope.user_id && record.vaultlabel === scope.vaultlabel
)
