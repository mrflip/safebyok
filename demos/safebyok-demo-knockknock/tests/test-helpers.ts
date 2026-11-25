/** The demo's test helpers: a fake of Anthropic's messages endpoint, the core's testing helpers, and the secret search and fake authenticator of safebyok-react. Star-import this file as `TH`. */

import { JokeModel } from '../src/lib/anthropic'

export * from 'safebyok/testing'
export { expectTextUnheld, holdsText, installFakeAuthenticator } from 'safebyok-react/testing'

/** One request recorded by {@link fakeAnthropic}: its URL, the API key it carried (the SDK sends it as a bearer token), and its body. */
export type AnthropicRequest = {
  url:    string
  apiKey: string | null
  body:   { model: string, messages: unknown[] }
}

/** Make a fake of Anthropic's messages endpoint, as a `fetch` function. It records every request and replies with `status`:
 * at 200 a message whose text is `jokeText`, and at any other status an authentication error.
 * Pass its `fetchFn` to the code under test, or stub the global `fetch` with it. `seen` lists the requests so far.
 *
 * @example
 *   const anthropic = TH.fakeAnthropic(200, 'Banana who? Banana split, gotta run!')
 *   await tellKnockKnockJoke('sk-ant-fake-key', 'Banana', anthropic.fetchFn)
 *   anthropic.seen[0]?.apiKey  // => 'sk-ant-fake-key'
 */
export function fakeAnthropic(status: number, jokeText = '') {
  const seen: AnthropicRequest[] = []
  const reply = status === 200
    ? {
      id: 'msg_fake', type: 'message', role: 'assistant', model: JokeModel,
      content: [{ type: 'text', text: jokeText }],
      stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 20 },
    }
    : { type: 'error', error: { type: 'authentication_error', message: 'invalid API key' } }
  const fetchFn: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    seen.push({
      url:    request.url,
      apiKey: request.headers.get('authorization')?.replace(/^Bearer /, '') ?? null,
      body:   JSON.parse(await request.text()) as AnthropicRequest['body'],
    })
    return Response.json(reply, { status })
  }
  return { fetchFn, seen }
}
