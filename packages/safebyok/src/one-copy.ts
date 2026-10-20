import { VaultError } from './errors'

/**
 * The mark a model class carries as a static, its name: a symbol from the registry `Symbol.for`
 * reads, so a second copy of safebyok loaded beside this one marks its classes with the very same
 * symbol. What tells a `Box` or a `Proof` of that other copy, which `instanceof` here refuses, from
 * something that is no model at all.
 */
export const ModelMark: unique symbol = Symbol.for('safebyok.model')

/** A model class: one that carries its {@link ModelMark}. */
type MarkedModel = { [Symbol.hasInstance]: (val: unknown) => boolean, readonly [ModelMark]: string }

/**
 * Refuse `given` with kind 'bad_option' when it is a `model` made by another copy of safebyok:
 * marked as one, yet no instance of this copy's class. Two copies loaded side by side -- two
 * versions, or the ESM and the CommonJS build of one -- each have classes of their own, so neither
 * can vouch for the other's, and an app running both is to be fixed, not worked around. Anything
 * else passes, for the caller's own check to judge. Quotes nothing of `given`.
 *
 * @param given - What the caller was handed in place of a `model`.
 * @param model - The class it should be an instance of.
 * @param said - The call that was handed it, as its refusal names it.
 *
 * @example checkOneCopy(opts.over, Box, "Box.seal's `over`")   // throws for a Box of a second safebyok
 */
export const checkOneCopy = (given: unknown, model: MarkedModel, said: string): void => {
  if (typeof given !== 'object' || given === null || given instanceof model) { return }
  const modelname = model[ModelMark]
  const { constructor: made } = given as { constructor?: Partial<Record<symbol, unknown>> }
  if (made?.[ModelMark] !== modelname) { return }
  throw new VaultError('bad_option', `${said} was handed a ${modelname} made by another copy of safebyok, loaded beside this one: two versions of it, or its ESM and CommonJS builds side by side. Each copy's classes are its own, so this one cannot vouch for it. Load safebyok once: dedupe it in the bundler or the package manager.`)
}
