import { describe, expect, it } from 'vitest'
import { buildJokePrompt, gripeForJokeErr, tellKnockKnockJoke } from '../../src/lib/anthropic'
import * as TH from '../test-helpers'

describe("buildJokePrompt", () => {
  it("works the user's entry into both knock-knock slots", () => {
    const prompt = buildJokePrompt('Banana')
    expect(prompt).to.include('Banana')
    expect(prompt).to.include('Banana who?')
  })
})

describe("tellKnockKnockJoke", () => {
  it("sends the key as a bearer token to the messages endpoint, and nothing else sees it", async () => {
    const fake = TH.fakeAnthropic(200, "Banana who? Banana split, gotta run!")
    const joke = await tellKnockKnockJoke('sk-ant-fake-key', 'Banana', fake.fetchFn)
    expect(joke).to.eq("Banana who? Banana split, gotta run!")
    expect(fake.seen).to.have.lengthOf(1)
    expect(fake.seen[0]?.url).to.include('api.anthropic.com/v1/messages')
    expect(fake.seen[0]?.apiKey).to.eq('sk-ant-fake-key')
  })

  it("asks the cheapest model, with the entry in the prompt", async () => {
    const fake = TH.fakeAnthropic(200, "Olive who? Olive you, that's who!")
    await tellKnockKnockJoke('sk-ant-fake-key', 'Olive', fake.fetchFn)
    expect(fake.seen[0]?.body.model).to.eq('claude-haiku-5-5')
    expect(JSON.stringify(fake.seen[0]?.body.messages)).to.include('Olive')
  })
})

describe("gripeForJokeErr", () => {
  it("says something calm and actionable for an unrecognized failure, quoting nothing", () => {
    const gripe = gripeForJokeErr(new Error('ECONNRESET sk-ant-oops'))
    expect(gripe).to.include('Knock again')
    expect(gripe).to.not.include('sk-ant-oops')
  })
})
