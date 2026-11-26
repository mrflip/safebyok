// A demonstration of a row in notes/wontfix.md (STYLE.md, *Tests*): it asserts the behaviour the row leaves as it is.
// It mocks urql's Client with one whose stream ends inside `subscribe()`, as urql's own may, before `watch` returns.
// To reopen the row, bring something this test does not already show.
// If it fails, the behaviour has changed: invert it into a promise, move it beside GraphQLVaultDB's watch tests, and amend the row.
/** The row "A Convex, Postgres or GraphQL watch's result, notice, failure or ending that lands after its watch is stopped". */
import { describe, expect, it } from 'vitest'
import { GraphQLVaultDB } from '../../src/index'
import * as TH from '../test-helpers'

const RowChanged = 'notes/wontfix.md, "A Convex, Postgres or GraphQL watch\'s result, notice, failure or ending that lands after its watch is stopped": the behaviour has changed. Invert this test, move it, and amend the row'

/** A GraphQLVaultDB on a client whose every subscription's stream ends as soon as it starts, inside `subscribe()`. */
function vaultDBOverEndingStreams(): GraphQLVaultDB {
  const client = {
    query:        () => { throw new Error('This test sends no query') },
    mutation:     () => { throw new Error('This test sends no mutation') },
    subscription: () => ({
      subscribe: (onResult: (result: { hasNext: boolean }) => void) => {
        onResult({ hasNext: false })
        return { unsubscribe: () => { /* the stream has ended */ } }
      },
    }),
  }
  return new GraphQLVaultDB({ client: client as never })
}

describe("wontfix: a GraphQLVaultDB watch whose stream urql ends inside subscribe()", () => {
  it("tells its ending a microtask after watch returns, even where the watch is stopped first", async () => {
    const told: string[] = []
    const stop = vaultDBOverEndingStreams().watch(TH.ThingBank, () => { told.push('notice') }, (news) => { told.push(news.refusalkind) }, () => { told.push('ended') })
    expect(told, 'nothing is told before watch returns').to.deep.eq([])
    stop()
    await Promise.resolve()
    expect(told, RowChanged).to.deep.eq(['ended', 'storage_unavailable'])
  })
})
