import { afterEach, describe, expect, it, vi } from 'vitest'
import { MinPassphraseChars, MinZxcvbnScore, zxcvbnPassphraseTest } from '../src/zxcvbn-passphrase-test'
import type { VaultScope } from '../src/types'
import * as TH from './test-helpers'

/** The reason a verdict gives, or '' for a strong one. */
const reasonOf = async (passphrase: string, scope?: VaultScope): Promise<string> => {
  const verdict = await zxcvbnPassphraseTest(passphrase, scope)
  return verdict.strong ? '' : verdict.reason
}

/** Whether the test admits `passphrase`. */
const isStrong = async (passphrase: string, scope?: VaultScope): Promise<boolean> => {
  const verdict = await zxcvbnPassphraseTest(passphrase, scope)
  return verdict.strong
}

const StrengthCases = [
  // regular usage:
  ["correct horse battery staple",  true,  'four uncommon words together pass'],
  ["my cat is named fluffy",        true,  'a plain sentence passes, with no digit, capital or symbol'],
  ["xk7#pq2mzv9w",                  true,  'twelve random characters pass'],
  // what guessers try first, however long:
  ["password1234",                  false, 'a common password with digits on is refused'],
  ["p@ssw0rd12345",                 false, 'a common password in leetspeak is refused'],
  ["qwertyuiop12",                  false, 'a keyboard walk is refused'],
  ["aaaaaaaaaaaa",                  false, 'one character repeated is refused'],
  ["abcdefghijkl",                  false, 'a sequence is refused'],
  ["iloveyouiloveyou",              false, 'a common phrase repeated is refused'],
  ["a           ",                  false, 'one letter and eleven spaces is refused, though twelve characters'],
  // the length floor comes first:
  ["Tr0ub4dor&3",                   false, 'eleven characters are refused, however mixed'],
  ["hunter2",                       false, 'a short password is refused for its length'],
  ["",                              false, 'nothing at all is refused'],
] as const

const LengthCases = [
  // characters, not bytes or UTF-16 code units:
  ["🦜🌵🎻🧲🪁🛶🧊🍄🪐🦔🥨",           false, 'eleven emoji are eleven characters, though 22 code units'],
  ["🦜🌵🎻🧲🪁🛶🧊🍄🪐🦔🥨🫖",          true,  'twelve unrelated emoji are twelve characters'],
  ["päßwörd-ünd",                  false, 'eleven accented letters are eleven, though more bytes'],
] as const

/** The scope of a vault whose names are words a guesser would try. */
const NamedScope: VaultScope = { applabel: 'skylark', user_id: 'q7.ladyfern@zinnia.example', vaultlabel: 'pinecone' }

describe("zxcvbnPassphraseTest", () => {
  for (const [passphrase, strong, blurb] of StrengthCases) {
    it(blurb, async () => { expect(await isStrong(passphrase)).to.eq(strong) })
  }
  for (const [passphrase, strong, blurb] of LengthCases) {
    it(blurb, async () => { expect(await isStrong(passphrase)).to.eq(strong) })
  }

  it("admits 'correct horse battery staple', as its example says", async () => {
    expect(await zxcvbnPassphraseTest('correct horse battery staple')).to.deep.equal({ strong: true })
  })

  it("says what it found and what to do, as its example says, never quoting the passphrase", async () => {
    expect(await reasonOf('password1234')).to.eq('That is very like a commonly used password: add a few more words, less common ones.')
    const refused = StrengthCases.filter(([passphrase, strong]) => ! strong && passphrase.trim() !== '').map(([passphrase]) => passphrase)
    for (const passphrase of refused) { expect(await reasonOf(passphrase)).to.not.include(passphrase) }
  })

  it("names the pattern it found: a keyboard walk, a repeat, a sequence", async () => {
    expect(await reasonOf('aaaaaaaaaaaa')).to.match(/repeats one character/)
    expect(await reasonOf('abcdefghijkl')).to.match(/common sequence/)
    expect(await reasonOf('iloveyouiloveyou')).to.match(/repeats a pattern/)
  })

  it("refuses a passphrase under 12 characters for its length, as its example says", async () => {
    expect(MinPassphraseChars).to.eq(12)
    expect(await reasonOf('hunter2')).to.match(/^A passphrase needs at least 12 characters/)
    expect(await reasonOf('x'.repeat(MinPassphraseChars - 1))).to.match(/at least 12 characters/)
  })

  it("never asks for a digit, a capital or a symbol", async () => {
    for (const [passphrase] of StrengthCases) {
      expect(await reasonOf(passphrase)).to.not.match(/digit|capital|uppercase|symbol|number/i)
    }
  })

  it("answers through a promise, the same twice: it keeps nothing of one passphrase for the next", async () => {
    const answering = zxcvbnPassphraseTest('password1234')
    expect(answering).to.be.instanceOf(Promise)
    expect(await answering).to.deep.equal(await zxcvbnPassphraseTest('password1234'))
    expect(await isStrong('correct horse battery staple')).to.be.true
  })

  it("asks for a score of 3 of 4", () => {
    expect(MinZxcvbnScore).to.eq(3)
  })
})

describe("zxcvbnPassphraseTest, given the vault's scope", () => {
  it("refuses a passphrase built from the vault's own names, which it admits without them", async () => {
    expect(await isStrong('skylarkpinecone')).to.be.true
    expect(await isStrong('skylarkpinecone', NamedScope)).to.be.false
    expect(await reasonOf('skylarkpinecone', NamedScope)).to.match(/something about you or this site/)
  })

  it("hears the words inside the user's id, not only the whole of it", async () => {
    expect(await isStrong('zinnialadyfern')).to.be.true
    expect(await isStrong('zinnialadyfern', NamedScope)).to.be.false
  })

  it("refuses the vault's names as its example says", async () => {
    expect(await isStrong('skylarkpinecone')).to.be.true
    expect(await reasonOf('skylarkpinecone', { applabel: 'skylark', user_id: 'u1', vaultlabel: 'pinecone' })).to.match(/^That holds something about you or this site/)
  })

  it("still admits a strong passphrase that shares nothing with them", async () => {
    expect(await isStrong('correct horse battery staple', NamedScope)).to.be.true
  })
})

/** What `attempt` rejects with; it fails the test should it resolve. */
const rejectionOf = async (attempt: Promise<unknown>): Promise<unknown> => {
  try {
    await attempt
  } catch (err) {
    return err
  }
  throw new Error('it resolved, where a rejection was expected')
}

/** A fresh copy of the module, over a zxcvbn whose loads are counted and whose first load fails when `failFirst`. */
const freshModule = async (failFirst: boolean) => {
  vi.resetModules()
  const loads = { count: 0 }
  vi.doMock('@zxcvbn-ts/core', async (importOriginal) => {
    loads.count += 1
    if (failFirst && loads.count === 1) { throw new Error('the chunk did not load') }
    return await importOriginal()
  })
  return { loads, fresh: await import('../src/zxcvbn-passphrase-test') }
}

describe("zxcvbnPassphraseTest's loading", () => {
  afterEach(() => {
    vi.doUnmock('@zxcvbn-ts/core')
    vi.resetModules()
  })

  it("loads zxcvbn at its first call, never at import, and once", async () => {
    const { loads, fresh } = await freshModule(false)
    expect(loads.count).to.eq(0)
    expect(await fresh.zxcvbnPassphraseTest('password1234')).to.have.property('strong', false)
    expect(await fresh.zxcvbnPassphraseTest('correct horse battery staple')).to.deep.equal({ strong: true })
    expect(loads.count).to.eq(1)
  })

  it("loads nothing for a passphrase under 12 characters: its length refuses it", async () => {
    const { loads, fresh } = await freshModule(false)
    expect(await fresh.zxcvbnPassphraseTest('hunter2')).to.have.property('strong', false)
    expect(loads.count).to.eq(0)
  })

  it("rejects when zxcvbn fails to load, and tries again at the next call", async () => {
    const { loads, fresh } = await freshModule(true)
    await expect(fresh.zxcvbnPassphraseTest('password1234')).rejects.toThrow(/could not be loaded/)
    expect(await fresh.zxcvbnPassphraseTest('password1234')).to.have.property('strong', false)
    expect(loads.count).to.eq(2)
  })

  it("says a failed load as 'storage_unavailable', a condition a retry may mend, its cause the load's own failure, quoting no passphrase", async () => {
    const { fresh } = await freshModule(true)
    const passphrase = 'SUPERSECRET staple horse'
    const err = await rejectionOf(fresh.zxcvbnPassphraseTest(passphrase))
    expect(err).to.include({ refusalkind: 'storage_unavailable', name: 'VaultError' })
    expect((err as Error).message).to.match(/Try again shortly/)
    expect((err as Error).cause).to.be.instanceOf(Error)
    expect(TH.thrownText(err)).to.not.include('SUPERSECRET')
  })

  it("refuses a vault's Create as 'storage_unavailable' when zxcvbn fails to load, making nothing", async () => {
    const { fresh } = await freshModule(true)
    // A vault of the same fresh copy of safebyok as the strength test: a VaultError of another copy
    // would be a foreign throw to it.
    const [{ Vault: FreshVault }, { localVaultDB }, { memoryStore }, { memoryDeviceDB }] = await Promise.all([
      import('../src/vault'), import('../src/local-vault-db'), import('../src/string-store'), import('../src/device-db'),
    ])
    const vaultDB = localVaultDB({ store: memoryStore() })
    const vault = FreshVault.make(TH.memoryVaultOpts({ passphraseStrengthTest: fresh.zxcvbnPassphraseTest, vaultDB, deviceDB: memoryDeviceDB() }))
    await vault.hello()
    try {
      // The fresh copy's VaultError is a class of its own: told by kind.
      await expect(vault.unlock('correct horse battery staple')).rejects.toThrow(expect.objectContaining({ refusalkind: 'storage_unavailable' }))
      expect(vault.getSnapshot().state).to.eq('absent')
      await vault.unlock('correct horse battery staple')
      expect(vault.getSnapshot().state).to.eq('unlocked')
    } finally {
      vault.close()
    }
  })
})
