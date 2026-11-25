/** A function a host handed us, wrapped once, so that what it throws is dealt with in one stated way. */

import type * as Z from 'zod'
import { Validator } from 'safebyok-big/internals'

// == [Types]: BulletproofOpts, BulletproofFailOpts, BulletproofTellOpts

/** How a bulletproof handler deals with what its handler throws, its transformer making an `ErrT`. */
export type BulletproofOpts<ErrT extends Error = Error> = BulletproofFailOpts | BulletproofTellOpts<ErrT>

/** {@link BulletproofOpts} that rethrow the transformer's `Error`. */
export type BulletproofFailOpts = Extract<Readonly<Z.infer<typeof Checks.bulletproofOpts>>, Readonly<{ ifError: 'fail' }>>

// Written out, not inferred from the check, so that `onBadNews` may take only what the transformer makes: a VaultError, say.
/** {@link BulletproofOpts} that tell `onBadNews` the transformer's `ErrT`. */
export type BulletproofTellOpts<ErrT extends Error = Error> = Readonly<{ ifError: 'tell', transformer: (thrown: unknown) => ErrT, onBadNews: (err: ErrT) => void }>
// --

// == [The wrappers]: bulletproofHandlerOf, bulletproofAsyncHandlerOf

// One wrapper for a handler that returns its result, another for one that may return a promise: a `try` around a call
// catches no rejection, and a wrapper that sniffed each result for a promise would make every call pay for the check.
/** `handler`, wrapped so that what it throws goes through `opts.transformer`: rethrown under `ifError: 'fail'`, or handed to `opts.onBadNews` under `'tell'`.
 * A told call returns undefined. A call that does not throw returns what `handler` returns, untouched.
 * What the transformer or `onBadNews` itself throws reaches the caller as thrown.
 * For a handler that may return a promise, use {@link bulletproofAsyncHandlerOf}: this one catches no rejection.
 * @example
 *   const whisperOf = bulletproofHandlerOf(hostWhisperOf, { ifError: 'fail', transformer: sanitizeForeignError })
 */
export function bulletproofHandlerOf<ArgsT extends unknown[], ResultT>(handler: (...args: ArgsT) => ResultT, opts: BulletproofFailOpts): (...args: ArgsT) => ResultT
export function bulletproofHandlerOf<ArgsT extends unknown[], ResultT, ErrT extends Error>(handler: (...args: ArgsT) => ResultT, opts: BulletproofTellOpts<ErrT>): (...args: ArgsT) => ResultT | undefined
export function bulletproofHandlerOf<ArgsT extends unknown[], ResultT, ErrT extends Error>(handler: (...args: ArgsT) => ResultT, opts: BulletproofOpts<ErrT>): (...args: ArgsT) => ResultT | undefined {
  Checks.bulletproofArgs.parse({ handler, opts })
  if (opts.ifError === 'fail') {
    const { transformer } = opts
    return (...args) => {
      try {
        return handler(...args)
      } catch (err) {
        throw transformer(err)
      }
    }
  }
  const { transformer, onBadNews } = opts
  return (...args) => {
    try {
      return handler(...args)
    } catch (err) {
      onBadNews(transformer(err))
      return
    }
  }
}

/** `handler`, which may return a promise, wrapped as {@link bulletproofHandlerOf} wraps one: what it throws or rejects with goes through `opts.transformer`.
 * The wrapper always returns a promise: a told call resolves undefined, and a call that does not throw resolves what `handler` resolves.
 * @example
 *   const load = bulletproofAsyncHandlerOf(async () => { await hostChecker.load?.() }, { ifError: 'fail', transformer: loadRefusalOf })
 */
export function bulletproofAsyncHandlerOf<ArgsT extends unknown[], ResultT>(handler: (...args: ArgsT) => ResultT | PromiseLike<ResultT>, opts: BulletproofFailOpts): (...args: ArgsT) => Promise<ResultT>
export function bulletproofAsyncHandlerOf<ArgsT extends unknown[], ResultT, ErrT extends Error>(handler: (...args: ArgsT) => ResultT | PromiseLike<ResultT>, opts: BulletproofTellOpts<ErrT>): (...args: ArgsT) => Promise<ResultT | undefined>
export function bulletproofAsyncHandlerOf<ArgsT extends unknown[], ResultT, ErrT extends Error>(handler: (...args: ArgsT) => ResultT | PromiseLike<ResultT>, opts: BulletproofOpts<ErrT>): (...args: ArgsT) => Promise<ResultT | undefined> {
  Checks.bulletproofArgs.parse({ handler, opts })
  if (opts.ifError === 'fail') {
    const { transformer } = opts
    return async (...args) => {
      try {
        return await handler(...args)
      } catch (err) {
        throw transformer(err)
      }
    }
  }
  const { transformer, onBadNews } = opts
  return async (...args) => {
    try {
      return await handler(...args)
    } catch (err) {
      onBadNews(transformer(err))
      return
    }
  }
}
// --

// == [Checks]: Checks

/** The checks of a bulletproof wrapper's arguments. */
const Checks = Validator.Checkers('bad_record', ({ obj, lit, fn, discrim }) => {
  /** The `Error` that stands for what the handler threw, handed exactly what was thrown. */
  const transformer = fn<(thrown: unknown) => Error>()
  const bulletproofOpts = discrim('ifError', [
    obj({
      /** Rethrow the transformer's `Error` to the caller. */
      ifError: lit('fail'),
      transformer,
    }).strict(),
    obj({
      /** Hand the transformer's `Error` to `onBadNews`, and return undefined. */
      ifError:   lit('tell'),
      transformer,
      /** Told the transformer's `Error`, in place of a throw. */
      onBadNews: fn<(err: Error) => void>(),
    }).strict(),
  ])
  return {
    bulletproofOpts,
    bulletproofArgs: obj({ handler: fn(), opts: bulletproofOpts }),
  }
})
// --
