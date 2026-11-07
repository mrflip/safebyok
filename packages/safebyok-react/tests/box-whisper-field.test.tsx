import { act, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { describe, expect, it } from 'vitest'
import type { Box, Vault } from 'safebyok'
import { BoxFields } from 'safebyok/dom'
import { WhisperFieldAttributes } from 'safebyok/utils'
import { BoxWhisperField } from '../src/box-whisper-field'
import * as TH from './test-helpers'

TH.sweepBankWorlds()

/** An obvious fake whisper, as stored. */
const StoredKey = 'sk-ant-fake-stored'

/** A vault, unlocked, holding `anthropic`, its apiKey {@link StoredKey} and a dotted token beside it. */
const boxOfWorld = async (): Promise<{ vault: Vault, box: Box }> => {
  const { vault } = await TH.makeBankWithVault()
  const whisper = { apiKey: StoredKey, Credentials: { SessionToken: 'fake-session-token' } }
  const box = await vault.putBox({ boxlabel: 'anthropic', whisper }, { ifAbsent: 'add' })
  return { vault, box }
}

/** The field, found by the label the tests give it. */
const theField = () => screen.getByLabelText<HTMLInputElement>('Anthropic API key')

const exposing = (box: Box) => act(async () => { await box.expose() })

describe("BoxWhisperField", () => {
  it("shows the text at its path once the box is exposed", async () => {
    const { box } = await boxOfWorld()
    render(<BoxWhisperField box={box} path="apiKey" aria-label="Anthropic API key" />)
    expect(theField().value).to.eq('')
    expect(theField().readOnly).to.be.true
    await exposing(box)
    expect(theField().value).to.eq(StoredKey)
    expect(theField().readOnly).to.be.false
  })

  it("shows the leaf at a dotted path", async () => {
    const { box } = await boxOfWorld()
    render(<BoxWhisperField box={box} path="Credentials.SessionToken" aria-label="Anthropic API key" />)
    await exposing(box)
    expect(theField().value).to.eq('fake-session-token')
  })

  it("is a password field carrying every attribute that turns password managers and autofill away", async () => {
    const { box } = await boxOfWorld()
    render(<BoxWhisperField box={box} path="apiKey" aria-label="Anthropic API key" />)
    expect(theField().type).to.eq('password')
    const flags = Object.keys(WhisperFieldAttributes).filter((candidate) => candidate.startsWith('data-'))
    expect(flags.map((attrname) => theField().getAttribute(attrname))).to.deep.equal(flags.map(() => 'true'))
    expect(theField().getAttribute('autocomplete')).to.eq('off')
    expect(theField().getAttribute('spellcheck')).to.eq('false')
  })

  it("flips only what it displays at Show and Hide", async () => {
    const { box } = await boxOfWorld()
    render(<BoxWhisperField box={box} path="apiKey" aria-label="Anthropic API key" />)
    await exposing(box)
    fireEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(theField().type).to.eq('text')
    expect(theField().value).to.eq(StoredKey)
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(theField().type).to.eq('password')
    expect(box.snapshot.veiled).to.be.false
    expect(box.isShowing).to.be.true
  })

  it("stores an edit through its box's fields' save", async () => {
    // BoxWhisperField @example 1
    const { box } = await boxOfWorld()
    render(<BoxWhisperField box={box} path="apiKey" aria-label="Anthropic API key" />)
    await exposing(box)
    fireEvent.change(theField(), { target: { value: 'sk-ant-fake-edited' } })
    await act(async () => { await BoxFields.of(box).save() })
    expect(await box.extractWhisper()).to.deep.equal({ apiKey: 'sk-ant-fake-edited', Credentials: { SessionToken: 'fake-session-token' } })
  })

  it("keeps an edit through a lock", async () => {
    const { vault, box } = await boxOfWorld()
    render(<BoxWhisperField box={box} path="apiKey" aria-label="Anthropic API key" />)
    await exposing(box)
    fireEvent.change(theField(), { target: { value: 'sk-ant-fake-edited' } })
    act(() => { vault.lock() })
    expect(theField().value).to.eq('')
    expect(theField().readOnly).to.be.true
    await act(async () => { await vault.ensureUnlocked() })
    expect(theField().value).to.eq('sk-ant-fake-edited')
  })

  it("masks the field again when it hides, so an unlock never shows the whisper unasked", async () => {
    const { vault, box } = await boxOfWorld()
    render(<BoxWhisperField box={box} path="apiKey" aria-label="Anthropic API key" />)
    await exposing(box)
    fireEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(theField().type).to.eq('text')
    act(() => { vault.lock() })
    expect(theField().type).to.eq('password')
    await act(async () => { await vault.ensureUnlocked() })
    expect(theField().type).to.eq('password')
    expect(theField().value).to.eq(StoredKey)
    expect(screen.getByRole('button', { name: 'Show' }).getAttribute('aria-pressed')).to.eq('false')
  })

  it("masks the field again at a veil, keeping the input it bound", async () => {
    const { box } = await boxOfWorld()
    render(<BoxWhisperField box={box} path="apiKey" aria-label="Anthropic API key" />)
    await exposing(box)
    const field = theField()
    fireEvent.click(screen.getByRole('button', { name: 'Show' }))
    act(() => { box.veil() })
    act(() => { box.unveil() })
    expect(theField()).to.eq(field)
    expect(field.type).to.eq('password')
    expect(field.value).to.eq(StoredKey)
    expect(box.snapshot.exposed).to.be.true
  })

  describe("keeps the whisper out of React and the page's markup", () => {
    it("writes no value attribute and no name, hidden or shown", async () => {
      const { box } = await boxOfWorld()
      render(<BoxWhisperField box={box} path="apiKey" aria-label="Anthropic API key" />)
      await exposing(box)
      fireEvent.click(screen.getByRole('button', { name: 'Show' }))
      expect(theField().hasAttribute('value')).to.be.false
      expect(theField().hasAttribute('name')).to.be.false
      expect(document.body.outerHTML).to.not.include(StoredKey)
    })

    it("ignores a value or a name a host slips past the types", async () => {
      const { box } = await boxOfWorld()
      const slipped = { value: 'sk-ant-slipped', defaultValue: 'sk-ant-slipped', name: 'api_key' } as object
      render(<BoxWhisperField box={box} path="apiKey" aria-label="Anthropic API key" {...slipped} />)
      expect(document.body.outerHTML).to.not.include('sk-ant-slipped')
      await exposing(box)
      expect(theField().value).to.eq(StoredKey)
      expect(theField().hasAttribute('name')).to.be.false
    })
  })

  describe("under StrictMode", () => {
    it("shows a box exposed after it mounts", async () => {
      const { box } = await boxOfWorld()
      const { unmount } = render(<StrictMode><BoxWhisperField box={box} path="apiKey" aria-label="Anthropic API key" /></StrictMode>)
      await exposing(box)
      expect(theField().value).to.eq(StoredKey)
      unmount()
      expect(box.snapshot.exposed).to.be.false
    })

    // The rehearsal unmount unbinds the last field, and BoxFields keeps no count of who else shows the box.
    it("unexposes a box exposed before it mounts", async () => {
      const { box } = await boxOfWorld()
      await box.expose()
      render(<StrictMode><BoxWhisperField box={box} path="apiKey" aria-label="Anthropic API key" /></StrictMode>)
      expect(box.snapshot.exposed).to.be.false
      expect(theField().value).to.eq('')
    })

    it("keeps a box exposed through a re-render", async () => {
      const { box } = await boxOfWorld()
      const { rerender } = render(<StrictMode><BoxWhisperField box={box} path="apiKey" aria-label="Anthropic API key" /></StrictMode>)
      await exposing(box)
      rerender(<StrictMode><BoxWhisperField box={box} path="apiKey" aria-label="Anthropic API key" placeholder="sk-ant-…" /></StrictMode>)
      expect(box.snapshot.exposed).to.be.true
      expect(theField().value).to.eq(StoredKey)
    })
  })
})
