import Anthropic from '@anthropic-ai/sdk'

/**
 * The knock-knock machine's one Anthropic call. The API key arrives as an argument from inside
 * `vault.useBox(...)` and is handed straight to the SDK client: it never lands in React state, a
 * store, or storage. The request goes browser-to-Anthropic, which is the whole point of BYOK --
 * no server of ours ever sees the key.
 */

/** Claude Haiku 5.5: the cheapest current model, plenty for a knock-knock joke. */
export const JokeModel = 'claude-haiku-5-5'

/** The prompt for one joke: the user supplies who's there, Claude supplies the punchline. */
export const buildJokePrompt = (whosThere: string): string => (
  `Finish this knock-knock joke with a funny punchline, and reply with only the complete joke:\n` +
  `Knock, knock! / Who's there? / ${whosThere} / ${whosThere} who?`
)

/**
 * One knock-knock joke from Claude, as plain text.
 *
 * @param apiKey - The user's Anthropic API key, fresh from the vault.
 * @param whosThere - Whoever the user typed into "Who's there?".
 * @param fetchFn - Test seam: a fetch to use in place of the global one.
 *
 * @example await tellKnockKnockJoke(apiKeyWhisper, 'Banana')
 */
export const tellKnockKnockJoke = async (apiKey: string, whosThere: string, fetchFn?: typeof fetch): Promise<string> => {
  const anthropic = new Anthropic({
    apiKey,
    // A deliberate choice, not a shortcut: the key must stay on the user's device, so the
    // request must come from the browser.
    dangerouslyAllowBrowser: true,
    ...(fetchFn !== undefined && { fetch: fetchFn }),
  })
  const response = await anthropic.messages.create({
    model:      JokeModel,
    max_tokens: 300,
    messages:   [{ role: 'user', content: buildJokePrompt(whosThere) }],
  })
  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

/** A calm, actionable line for whatever went wrong telling the joke. */
export const gripeForJokeErr = (err: unknown): string => {
  if (err instanceof Anthropic.AuthenticationError) {
    return "Anthropic refused that API key. Check it and save a fresh one below."
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "Anthropic says slow down (rate limited). Give it a moment and knock again."
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return "Couldn't reach Anthropic. Check your connection and knock again."
  }
  if (err instanceof Anthropic.APIError) {
    return `Anthropic answered with an error (${String(err.status)}). Knock again in a moment.`
  }
  return 'That joke got lost on the way. Knock again.'
}
