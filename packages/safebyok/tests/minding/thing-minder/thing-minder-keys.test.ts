import * as TSQ from '@tanstack/query-core'
import { describe, expect, it } from 'vitest'
import type { ThingScope } from '../../../src/shapes/shapes-thing'
import * as TH from '../../test-helpers'
import { ThingMinder } from '../../../src/minding/thing-minder'
import { minderWithoutStart } from './world'

describe("ThingMinder keys", () => {
  const DeepScope = { ...TH.BoxScope, labelpath: 'box/openai/deep' }

  it("interleave '/' between the labels, then end with '!' for the Thing's car", () => {
    const minder = minderWithoutStart()
    expect(minder.queryKey(TH.GateScope)).to.deep.equal(['sok', 'u1', 'acme', 'gate', '!'])
    expect(minder.queryKey(TH.RootScope)).to.deep.equal(['sok', 'u1', 'acme', 'box', '!'])
    expect(minder.queryKey(TH.BoxScope)).to.deep.equal(['sok', 'u1', 'acme', 'box', '/', 'openai', '!'])
    expect(minder.queryKey(TH.BankScope)).to.deep.equal(['sok', 'u1', 'acme', 'bank', '!'])
  })

  it("put the list of a Thing's children under '#' and 'kids'", () => {
    const minder = minderWithoutStart()
    expect(minder.listingQueryKey(TH.RootScope)).to.deep.equal(['sok', 'u1', 'acme', 'box', '#', 'kids'])
    expect(minder.listingQueryKey(TH.BoxScope)).to.deep.equal(['sok', 'u1', 'acme', 'box', '/', 'openai', '#', 'kids'])
  })

  it("make a descendants prefix of the labels and '/', which no key of the Thing's own starts", () => {
    const minder = minderWithoutStart()
    expect(minder.descendantsQueryKey(TH.RootScope)).to.deep.equal(['sok', 'u1', 'acme', 'box', '/'])
    expect(minder.descendantsQueryKey(TH.BoxScope)).to.deep.equal(['sok', 'u1', 'acme', 'box', '/', 'openai', '/'])
  })

  it("match, for a descendants prefix, every key under the Thing and neither of the Thing's own", () => {
    const minder = minderWithoutStart()
    const matches = (prefixScope: ThingScope, keyScope: ThingScope) => {
      const prefix = minder.descendantsQueryKey(prefixScope)
      return [minder.queryKey(keyScope), minder.listingQueryKey(keyScope)].map((queryKey) => TSQ.partialMatchKey(queryKey, prefix))
    }
    expect(matches(TH.RootScope, TH.RootScope)).to.deep.equal([false, false])
    expect(matches(TH.RootScope, TH.BoxScope)).to.deep.equal([true, true])
    expect(matches(TH.RootScope, DeepScope)).to.deep.equal([true, true])
    expect(matches(TH.BoxScope, TH.BoxScope)).to.deep.equal([false, false])
    expect(matches(TH.BoxScope, DeepScope)).to.deep.equal([true, true])
    expect(matches(TH.BoxScope, TH.RootScope)).to.deep.equal([false, false])
    expect(matches(TH.BoxScope, { ...TH.BoxScope, labelpath: 'box/openai2' })).to.deep.equal([false, false])
    expect(matches(TH.RootScope, TH.GateScope)).to.deep.equal([false, false])
  })

  it("are the same, made without a minder, for anyone caching the same car", () => {
    const minder = minderWithoutStart()
    for (const scope of [TH.GateScope, TH.RootScope, TH.BoxScope, TH.BankScope]) {
      expect(ThingMinder.queryKeyOf(scope)).to.deep.equal(minder.queryKey(scope))
    }
    expect(ThingMinder.bankQueryKeyOf(TH.BoxScope)).to.deep.equal(['sok', 'u1', 'acme'])
  })

  it("made without a minder, refuse a scope that is not one", () => {
    TH.expectSyncRefusal(() => ThingMinder.queryKeyOf({ ...TH.BoxScope, labelpath: '' }), 'bad_record')
    TH.expectSyncRefusal(() => ThingMinder.bankQueryKeyOf({ userid: 'u1' } as never), 'bad_record')
  })
})
