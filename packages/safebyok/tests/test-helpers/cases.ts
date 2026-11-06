import { expect, it } from 'vitest'
import { VaultError } from '../../src/refusals/errors'

/** Whether a bag of cases `parse`s: each row is an input, whether it passes, and a sentence about it. */
export type Case = readonly [input: unknown, passes: boolean, blurb: string]

/** 'refuses' where `attempt` throws a VaultError, 'passes' where it throws nothing. Anything else thrown is rethrown. */
const verdictOf = (attempt: () => unknown): string => {
  try {
    attempt()
    return 'passes'
  } catch (err) {
    if (err instanceof VaultError) { return 'refuses' }
    throw err
  }
}

/** A check held to its table of cases: each passes, or refuses. */
export const holdsCases = (check: { parse: (val: unknown) => unknown }, cases: readonly Case[]): void => {
  for (const [input, passes, blurb] of cases) {
    it(blurb, () => { expect(verdictOf(() => check.parse(input))).to.eq(passes ? 'passes' : 'refuses') })
  }
}
