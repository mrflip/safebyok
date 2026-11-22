import { describe, expect, it } from 'vitest'
import { popField } from '../../src/index'
import * as TH from '../test-helpers'

// An obvious fake of a passphrase.
const FakePassphrase = 'fake-passphrase-for-a-test'

describe("popField", () => {
  it("returns the text of a field and deletes it from the form", () => {
    const form = new FormData()
    form.set('passphrase', FakePassphrase)
    expect(popField(form, 'passphrase')).to.eq(FakePassphrase)
    expect(form.has('passphrase')).to.eq(false)
  })

  it("leaves the form's other fields", () => {
    const form = new FormData()
    form.set('passphrase', FakePassphrase)
    form.set('nickname', 'ada')
    popField(form, 'passphrase')
    expect([...form.keys()]).to.deep.equal(['nickname'])
  })

  it("deletes every value of a field named twice, returning the first", () => {
    const form = new FormData()
    form.append('passphrase', FakePassphrase)
    form.append('passphrase', 'another-fake')
    expect(popField(form, 'passphrase')).to.eq(FakePassphrase)
    expect(form.has('passphrase')).to.eq(false)
  })

  it("answers an empty string for a field the form lacks", () => {
    expect(popField(new FormData(), 'passphrase')).to.eq('')
  })

  it("returns an empty string for a file, and deletes it", () => {
    const form = new FormData()
    form.set('passphrase', new File(['fake'], 'fake.txt'))
    expect(popField(form, 'passphrase')).to.eq('')
    expect(form.has('passphrase')).to.eq(false)
  })

  for (const [form, blurb] of [
    [null,                                    'null for a form'],
    [{ get: () => 'x', delete: () => null },  'an object that only looks like a FormData'],
    ["passphrase=fake",                       'a string for a form'],
  ] as const) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => popField(form as never, 'passphrase'), 'bad_record')
    })
  }

  for (const [fieldname, blurb] of [
    [undefined, 'no fieldname'],
    ["",        'an empty fieldname'],
    [7,         'a number for a fieldname'],
  ] as const) {
    it(`refuses ${blurb}, deleting nothing from the form`, () => {
      const form = new FormData()
      form.set('passphrase', FakePassphrase)
      TH.expectSyncRefusal(() => popField(form, fieldname as never), 'bad_record')
      expect(form.get('passphrase')).to.eq(FakePassphrase)
    })
  }
})
