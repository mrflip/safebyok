import { describe, expect, it } from 'vitest'
import { takeField } from '../../src/index'
import * as TH from '../test-helpers'

// An obvious fake of a passphrase.
const FakePassphrase = 'fake-passphrase-for-a-test'

describe("takeField", () => {
  it("takes the text of a field out of the form", () => {
    const form = new FormData()
    form.set('passphrase', FakePassphrase)
    expect(takeField(form, 'passphrase')).to.eq(FakePassphrase)
    expect(form.has('passphrase')).to.eq(false)
  })

  it("leaves the form's other fields", () => {
    const form = new FormData()
    form.set('passphrase', FakePassphrase)
    form.set('nickname', 'ada')
    takeField(form, 'passphrase')
    expect([...form.keys()]).to.deep.equal(['nickname'])
  })

  it("takes every entry of a field named twice, answering the first", () => {
    const form = new FormData()
    form.append('passphrase', FakePassphrase)
    form.append('passphrase', 'another-fake')
    expect(takeField(form, 'passphrase')).to.eq(FakePassphrase)
    expect(form.has('passphrase')).to.eq(false)
  })

  it("answers an empty string for a field the form lacks", () => {
    expect(takeField(new FormData(), 'passphrase')).to.eq('')
  })

  it("answers an empty string for a file, and takes it out", () => {
    const form = new FormData()
    form.set('passphrase', new File(['fake'], 'fake.txt'))
    expect(takeField(form, 'passphrase')).to.eq('')
    expect(form.has('passphrase')).to.eq(false)
  })

  for (const [form, blurb] of [
    [null,                                    'null for a form'],
    [{ get: () => 'x', delete: () => null },  'an object that only looks like a FormData'],
    ["passphrase=fake",                       'a string for a form'],
  ] as const) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => takeField(form as never, 'passphrase'), 'bad_record')
    })
  }

  for (const [fieldname, blurb] of [
    [undefined, 'no fieldname'],
    ["",        'an empty fieldname'],
    [7,         'a number for a fieldname'],
  ] as const) {
    it(`refuses ${blurb}, taking nothing from the form`, () => {
      const form = new FormData()
      form.set('passphrase', FakePassphrase)
      TH.expectSyncRefusal(() => takeField(form, fieldname as never), 'bad_record')
      expect(form.get('passphrase')).to.eq(FakePassphrase)
    })
  }
})
