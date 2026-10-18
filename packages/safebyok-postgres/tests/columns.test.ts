import { describe, expect, it } from 'vitest'
import * as TH from './test-helpers'
import * as Columns from '../src/columns'
import { BundleColumns, ListedLockboxColumns, LockboxColumns } from '../src/columns'
import type { Column } from '../src/columns'

const Pair: Column[] = [['vault_id', 'text'], ['registered_at', 'bigint']]

describe("Columns.names", () => {
  it("lists the columns' names, as an INSERT does", () => {
    expect(Columns.names(Pair)).to.eq('vault_id, registered_at')
  })
})

describe("Columns.placeholders", () => {
  it("numbers a parameter for each column from the first, cast to its type", () => {
    expect(Columns.placeholders(Pair, 4)).to.eq('$4::text, $5::bigint')
  })

  it("casts a jsonb column's parameter, which arrives as JSON text", () => {
    expect(Columns.placeholders([['whisper_ciphered', 'jsonb']], 1)).to.eq('$1::jsonb')
  })
})

describe("Columns.placeholderOf", () => {
  it("is the one parameter holding a field", () => {
    expect(Columns.placeholderOf([['format', 'text'], ['vault_id', 'text']], 'vault_id', 4)).to.eq('$5::text')
  })

  it("throws for a field no column holds: a mistake in this package, never a host's", () => {
    expect(() => Columns.placeholderOf(Pair, 'boxlabel', 1)).to.throw('No column holds boxlabel')
  })
})

describe("Columns.selected", () => {
  it("reads a bigint as a double and a jsonb as text, the same from every driver", () => {
    expect(Columns.selected(Pair)).to.eq('vault_id, registered_at::float8 AS registered_at')
    expect(Columns.selected([['whisper_ciphered', 'jsonb']])).to.eq('whisper_ciphered::text AS whisper_ciphered')
  })
})

describe("Columns.paramsOf", () => {
  it("is the record's values in column order, a missing field as null", () => {
    expect(Columns.paramsOf({ vault_id: 'v1', prior_vault_key: undefined }, [['vault_id', 'text'], ['prior_vault_key', 'jsonb']])).to.deep.equal(['v1', null])
  })

  it("sends a jsonb value as its JSON text", () => {
    expect(Columns.paramsOf({ whisper_ciphered: TH.fakeCiphered('a1') }, [['whisper_ciphered', 'jsonb']]))
      .to.deep.equal(['{"cipher_iv_b64":"iv-a1","ciphertext_b64":"ct-a1"}'])
  })

  it("covers every column of a real bundle and lockbox", () => {
    expect(Columns.paramsOf(TH.bundleOf('u1'), BundleColumns)).to.have.lengthOf(BundleColumns.length)
    expect(Columns.paramsOf(TH.boxOf('anthropic', 'a1'), LockboxColumns)).to.not.include(undefined)
  })
})

describe("Columns.recordOf", () => {
  it("leaves a null column out of the record", () => {
    expect(Columns.recordOf({ vault_id: 'v1', prior_vault_key: null }, [['vault_id', 'text'], ['prior_vault_key', 'jsonb']])).to.deep.equal({ vault_id: 'v1' })
  })

  it("parses a jsonb column's text, and leaves one a driver already parsed as it is", () => {
    const ciphered = TH.fakeCiphered('a1')
    expect(Columns.recordOf({ whisper_ciphered: JSON.stringify(ciphered) }, [['whisper_ciphered', 'jsonb']])).to.deep.equal({ whisper_ciphered: ciphered })
    expect(Columns.recordOf({ whisper_ciphered: ciphered }, [['whisper_ciphered', 'jsonb']])).to.deep.equal({ whisper_ciphered: ciphered })
  })

  it("hands back a row that is not an object as it is, for validation to refuse", () => {
    expect(Columns.recordOf(undefined, Pair)).to.be.undefined
    expect(Columns.recordOf('vault-id', Pair)).to.eq('vault-id')
  })

  it("rebuilds a lockbox from its params' round trip", () => {
    const lockbox = TH.boxOf('anthropic', 'a1')
    const row = Object.fromEntries(LockboxColumns.map(([field], ii) => [field, Columns.paramsOf(lockbox, LockboxColumns)[ii]]))
    expect(Columns.recordOf(row, LockboxColumns)).to.deep.equal(lockbox)
  })
})

describe("ListedLockboxColumns", () => {
  it("is every lockbox column but the two ciphered ones", () => {
    expect(ListedLockboxColumns.map(([field]) => field)).to.deep.equal(['format', 'boxlabel', 'revision_id', 'vault_key_epoch', 'whisper_codec', 'whisper_schema_version', 'sidecar_json', 'registered_at', 'written_at'])
  })
})
