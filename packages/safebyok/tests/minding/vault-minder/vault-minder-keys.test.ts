import * as TSQ from '@tanstack/query-core'
import { describe, expect, it } from 'vitest'
import type { ThingScope } from '../../../src/shapes/shapes-thing'
import * as TH from '../../test-helpers'
import { VaultMinder } from '../../../src/minding/vault-minder'
import { minderWithoutStart } from './world'

describe("VaultMinder keys", () => {
  const DeepScope = { ...TH.BoxScope, labelpath: 'box/openai/deep' }

  it("name the item after the bank, interleave '/' between the labels, then end with '!'", async () => {
    const minder = await minderWithoutStart()
    expect(minder.itemQueryKey(TH.GateScope)).to.deep.equal(['sok', 'u1', 'acme', 'item', 'gate', '!'])
    expect(minder.itemQueryKey(TH.RootScope)).to.deep.equal(['sok', 'u1', 'acme', 'item', 'box', '!'])
    expect(minder.itemQueryKey(TH.BoxScope)).to.deep.equal(['sok', 'u1', 'acme', 'item', 'box', '/', 'openai', '!'])
    expect(minder.itemQueryKey(TH.BankScope)).to.deep.equal(['sok', 'u1', 'acme', 'item', 'bank', '!'])
  })

  it("name the soon after the bank, and end it with '~'", async () => {
    const minder = await minderWithoutStart()
    expect(minder.soonQueryKey(TH.RootScope)).to.deep.equal(['sok', 'u1', 'acme', 'soon', 'box', '~'])
    expect(minder.soonQueryKey(TH.BoxScope)).to.deep.equal(['sok', 'u1', 'acme', 'soon', 'box', '/', 'openai', '~'])
  })

  it("name the list of a Thing's children after the bank, and end it with '#' and 'kids'", async () => {
    const minder = await minderWithoutStart()
    expect(minder.listQueryKey(TH.RootScope)).to.deep.equal(['sok', 'u1', 'acme', 'list', 'box', '#', 'kids'])
    expect(minder.listQueryKey(TH.BoxScope)).to.deep.equal(['sok', 'u1', 'acme', 'list', 'box', '/', 'openai', '#', 'kids'])
  })

  it("match, for a Thing's listing key without its mark, its own listing and every listing under it, and no item or soon", async () => {
    const minder = await minderWithoutStart()
    const matches = (prefixScope: ThingScope, keyScope: ThingScope) => {
      const prefix = minder.listQueryKey(prefixScope).slice(0, -2)
      return [minder.listQueryKey(keyScope), minder.itemQueryKey(keyScope), minder.soonQueryKey(keyScope)].map((queryKey) => TSQ.partialMatchKey(queryKey, prefix))
    }
    expect(matches(TH.RootScope, TH.RootScope)).to.deep.equal([true, false, false])
    expect(matches(TH.RootScope, TH.BoxScope)).to.deep.equal([true, false, false])
    expect(matches(TH.BoxScope, DeepScope)).to.deep.equal([true, false, false])
    expect(matches(TH.BoxScope, TH.RootScope)).to.deep.equal([false, false, false])
    expect(matches(TH.BoxScope, { ...TH.BoxScope, labelpath: 'box/openai2' })).to.deep.equal([false, false, false])
    expect(matches(TH.RootScope, TH.GateScope)).to.deep.equal([false, false, false])
  })

  it("are the same, made without a minder, for anyone caching the same record", async () => {
    const minder = await minderWithoutStart()
    for (const scope of [TH.GateScope, TH.RootScope, TH.BoxScope, TH.BankScope]) {
      expect(VaultMinder.itemQueryKeyOf(scope)).to.deep.equal(minder.itemQueryKey(scope))
      expect(VaultMinder.listQueryKeyOf(scope)).to.deep.equal(minder.listQueryKey(scope))
    }
    expect(VaultMinder.bankQueryKeyOf(TH.BoxScope)).to.deep.equal(['sok', 'u1', 'acme'])
  })

  it("made without a minder, refuse a scope that is not one", () => {
    TH.expectSyncRefusal(() => VaultMinder.itemQueryKeyOf({ ...TH.BoxScope, labelpath: '' }), 'bad_record')
    TH.expectSyncRefusal(() => VaultMinder.listQueryKeyOf({ ...TH.BoxScope, labelpath: '' }), 'bad_record')
    TH.expectSyncRefusal(() => VaultMinder.bankQueryKeyOf({ userid: 'u1' } as never), 'bad_record')
  })
})
