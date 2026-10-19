import { describe, expect, it } from 'vitest'
import * as TH from './test-helpers'
import { VaultPropsFields, ListedLockboxFields, LockboxFields, recordOf, selectionOf } from '../src/fields'

describe("selectionOf", () => {
  it("asks for each field, a ciphered one by its two halves", () => {
    expect(selectionOf([['boxlabel', 'plain'], ['whisper_ciphered', 'ciphered']])).to.eq('boxlabel whisper_ciphered { cipher_iv_b64 ciphertext_b64 }')
  })

  it("asks for a listed lockbox without either ciphered field", () => {
    expect(selectionOf(ListedLockboxFields)).to.eq('format boxlabel revision_tok vault_key_epoch whisper_codec whisper_schema_version sidecar_json registered_at written_at')
  })
})

describe("recordOf", () => {
  it("keeps the fields asked for, leaving out a null one and a GraphQL client's __typename", () => {
    expect(recordOf({ vault_id: 'v1', wayins: null, __typename: 'SafebyokVaultProps' }, [['vault_id', 'plain'], ['wayins', 'plain']])).to.deep.equal({ vault_id: 'v1' })
  })

  it("gives back a whole lockbox as it was, and a ciphered field as its two halves alone", () => {
    const lockbox = TH.boxOf('openai', 'r1')
    expect(recordOf(lockbox, LockboxFields)).to.deep.equal(lockbox)
    const answered = { ...lockbox, whisper_ciphered: { ...lockbox.whisper_ciphered, __typename: 'SafebyokCiphered' } }
    expect(recordOf(answered, LockboxFields)).to.deep.equal(lockbox)
  })

  it("gives back the vault props' wayins as they were, never looked inside", () => {
    const vaultProps = TH.vaultPropsOf('u1', { wayins: [TH.wayinOf('passphrase'), TH.wayinOf('home_phrase')] })
    expect(recordOf(vaultProps, VaultPropsFields)).to.deep.equal(vaultProps)
  })

  it("carries a lockbox's sidecar as the JSON text it was written as", () => {
    const lockbox = TH.boxOf('openai', 'r1', { sidecar_json: '{"b": 1, "a": "caf\u{E9}"}' })
    expect(recordOf(lockbox, LockboxFields)).to.include({ sidecar_json: '{"b": 1, "a": "caf\u{E9}"}' })
  })

  it("drops a field the record has not got", () => {
    expect(recordOf({ ...TH.boxOf('openai', 'r1'), vault_id: 'stray' }, LockboxFields)).to.not.have.property('vault_id')
  })

  const NotRecords = [
    [null,           'null'],
    [undefined,      'undefined'],
    ["a lockbox",    'text'],
    [[1, 2],         'a list'],
  ] as const

  for (const [sent, blurb] of NotRecords) {
    it(`gives back ${blurb} as it is, for the VaultDB's validation to refuse`, () => {
      expect(recordOf(sent, LockboxFields)).to.deep.equal(sent)
    })
  }

  it("gives back a ciphered field that is not an object as it is", () => {
    expect(recordOf({ whisper_ciphered: 'not halves' }, LockboxFields)).to.deep.equal({ whisper_ciphered: 'not halves' })
  })
})
