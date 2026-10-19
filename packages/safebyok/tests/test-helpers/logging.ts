import type { VaultLogger } from '../../src/logger'
import { TestDeriverNotice } from '../../src/key-deriver-spec'


/** One call a {@link spyLogger} heard: which of the three, and what it was handed. */
export type LoggedCall = {
  level:   keyof VaultLogger
  message: string | undefined
  story:   Record<string, unknown> | undefined
  err:     Error | null | undefined
}

/**
 * A VaultLogger that logs nowhere and keeps every call it hears, in order, for a test to look at
 * -- bar the one notice `Vault.make` gives of a `test_` key deriver's label ({@link TestDeriverNotice}),
 * which every vault opened through {@link testDeriver} would otherwise add to every count.
 *
 * @returns The `logger` to hand Vault.make, and the `calls` it has heard so far.
 *
 * @example
 *   const spy = TH.spyLogger()
 *   const vault = await TH.settledVault({ ...opts, logger: spy.logger })
 *   spy.calls.map((call) => call.level)  // => ['warn'], say
 */
export const spyLogger = () => {
  const calls: LoggedCall[] = []
  const hear = (level: keyof VaultLogger): VaultLogger[typeof level] => (message, story, err) => {
    if (message === TestDeriverNotice) { return }
    calls.push({ level, message, story, err })
  }
  const logger: VaultLogger = { log: hear('log'), warn: hear('warn'), error: hear('error') }
  return { logger, calls }
}

/**
 * Everything a logger was handed, as one text to search for what must never be there: each
 * call's message, its story as JSON, and its error -- message, stack, own properties -- down
 * through every cause. It never throws: a cause seen before is written `[cause seen above]`, and
 * a story or own properties JSON cannot write (a circular reference, a bigint) are written
 * `[not JSON]`, so what they hold goes unsearched.
 *
 * @param calls - What a {@link spyLogger} heard.
 * @returns The text, one call to a line.
 *
 * @example expect(TH.loggedText(spy.calls)).to.not.include(passphrase)
 */
export const loggedText = (calls: readonly LoggedCall[]): string => (
  calls.map((call) => [call.level, call.message ?? '', jsonOrPlaceholder(call.story ?? {}), thrownText(call.err)].join(' ')).join('\n')
)

/**
 * Everything a thrown value carries, as one text to search for what must never be there: an
 * error's message, stack and own properties, and the same of each cause beneath it; anything else
 * thrown, as JSON. Like {@link loggedText}, it never throws: a cause seen before is written
 * `[cause seen above]`, and own properties JSON cannot write are written `[not JSON]`.
 *
 * @param thrown - What an operation threw or rejected with.
 * @returns The text, blank for `undefined` or `null`.
 *
 * @example expect(TH.thrownText(err)).to.not.include(passphrase)
 */
export const thrownText = (thrown: unknown): string => errorText(thrown, new Set())

/**
 * Every string and number in `val`, at any depth, as text: the values of a record, to search an
 * error or a log for. Field names are not among them. Give the record values distinctive
 * enough that finding one means it was quoted: an epoch of `2` turns up in any stack's line numbers.
 *
 * @param val - A record, or any JSON value.
 * @returns Its leaves, in JSON's order.
 *
 * @example TH.leafTexts({ vault_id: 'vault-id-u1', wrapped: { ciphertext_b64: 'ct-a1' }, epoch: 7 })  // => ['vault-id-u1', 'ct-a1', '7']
 */
export const leafTexts = (val: unknown): string[] => {
  const leaves: string[] = []
  JSON.stringify(val, (_ckey, nested: unknown) => {
    if (typeof nested === 'string' || typeof nested === 'number') { leaves.push(String(nested)) }
    return nested
  })
  return leaves
}

/**
 * An error and every cause under it as text: message, stack and own properties each. Anything
 * else thrown, as JSON. `seen` holds the errors already written, so a cause cycle ends.
 */
const errorText = (thrown: unknown, seen: Set<unknown>): string => {
  if (thrown === undefined || thrown === null) { return '' }
  if (seen.has(thrown)) { return '[cause seen above]' }
  seen.add(thrown)
  if (! (thrown instanceof Error)) { return jsonOrPlaceholder(thrown) }
  return [thrown.message, thrown.stack ?? '', jsonOrPlaceholder(thrown), errorText(thrown.cause, seen)].join(' ')
}

/** `val` as JSON, or `[not JSON]` where JSON.stringify throws on it. */
const jsonOrPlaceholder = (val: unknown): string => {
  try {
    return JSON.stringify(val)
  } catch {
    return '[not JSON]'
  }
}
