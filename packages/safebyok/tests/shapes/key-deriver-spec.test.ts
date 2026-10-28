import { describe, expect, it } from 'vitest'
import { keyDeriverSpec } from '../../src/shapes/key-deriver-spec'
import { Argon2idWebV1 } from '../../src/key-deriver-spec'
import * as TH from '../test-helpers'

describe("keyDeriverSpec", () => {
  it("takes the spec safebyok supplies, and one of a host's own within Argon2id's bounds", () => {
    expect(keyDeriverSpec.parse(Argon2idWebV1)).to.deep.equal(Argon2idWebV1)
    expect(keyDeriverSpec.parse({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', memory_kib: 131_072, parallelism: 4 }).memory_kib).to.eq(131_072)
  })

  it("leaves out any field a spec does not hold", () => {
    expect(keyDeriverSpec.parse({ ...Argon2idWebV1, note: 'fast' })).to.not.have.property('note')
  })

  it("refuses 'bad_option', naming the field, for a spec Argon2id cannot run", () => {
    expect(TH.expectSyncRefusal(() => keyDeriverSpec.parse({ ...Argon2idWebV1, salt_bytes: 4 }), 'bad_option').meta?.fieldnames).to.deep.equal(['salt_bytes'])
    expect(TH.expectSyncRefusal(() => keyDeriverSpec.parse({ ...Argon2idWebV1, memory_kib: 16, parallelism: 4 }), 'bad_option').meta?.fieldnames).to.deep.equal(['memory_kib'])
    TH.expectSyncRefusal(() => keyDeriverSpec.parse({ ...Argon2idWebV1, output_bytes: 16 }), 'bad_option')
  })
})
